import { jakartaDateKey } from '../../src/shared/time';

/**
 * Perkiraan pemakaian operasi database.
 * ANGKA INI ADALAH PERKIRAAN INTERNAL NeoTest, bukan metrik resmi Firebase.
 * Kuota resmi harus dicek di Firebase Console.
 *
 * Counter disimpan di memori instance dan di-flush berkala ke koleksi
 * `quotaCounters` agar tidak menambah satu write per operasi.
 */
const SPARK_FREE = { reads: 50_000, writes: 20_000, deletes: 20_000 };

interface Counter {
  reads: number;
  writes: number;
  deletes: number;
  flushedReads: number;
  flushedWrites: number;
  flushedDeletes: number;
  dirty: boolean;
  timer?: ReturnType<typeof setTimeout>;
}

const counters = new Map<string, Counter>();
let flushHandler: ((payload: QuotaDelta) => Promise<void>) | null = null;

export interface QuotaDelta {
  date: string;
  reads: number;
  writes: number;
  deletes: number;
}

function today(): string {
  return jakartaDateKey();
}

function current(): Counter {
  const key = today();
  let c = counters.get(key);
  if (!c) {
    c = { reads: 0, writes: 0, deletes: 0, flushedReads: 0, flushedWrites: 0, flushedDeletes: 0, dirty: false };
    counters.set(key, c);
  }
  return c;
}

export function trackReads(n = 1): void {
  if (n <= 0) return;
  current().reads += n;
  scheduleFlush();
}

export function trackWrites(n = 1): void {
  if (n <= 0) return;
  const c = current();
  c.writes += n;
  scheduleFlush();
}

export function trackDeletes(n = 1): void {
  if (n <= 0) return;
  const c = current();
  c.deletes += n;
  scheduleFlush();
}

/** Dipanggil sekali saat store dibuat untuk menyimpan delta ke database. */
export function setQuotaFlushHandler(fn: (payload: QuotaDelta) => Promise<void>): void {
  flushHandler = fn;
}

function scheduleFlush(): void {
  const c = current();
  c.dirty = true;
  if (c.timer) return;
  c.timer = setTimeout(() => {
    c.timer = undefined;
    void flushQuota().catch(() => undefined);
  }, 20_000);
  if (typeof c.timer.unref === 'function') c.timer.unref();
}

/** Menulis delta sejak flush terakhir. Tidak menambah hitungan write. */
export async function flushQuota(): Promise<void> {
  if (!flushHandler) return;
  for (const [date, c] of counters) {
    const delta = {
      date,
      reads: c.reads - c.flushedReads,
      writes: c.writes - c.flushedWrites,
      deletes: c.deletes - c.flushedDeletes,
    };
    if (delta.reads === 0 && delta.writes === 0 && delta.deletes === 0) continue;
    c.flushedReads = c.reads;
    c.flushedWrites = c.writes;
    c.flushedDeletes = c.deletes;
    c.dirty = false;
    await flushHandler(delta);
  }
}

export function localSnapshot(base?: { reads: number; writes: number; deletes: number }) {
  const c = current();
  const reads = (base?.reads ?? 0) + c.reads;
  const writes = (base?.writes ?? 0) + c.writes;
  const deletes = (base?.deletes ?? 0) + c.deletes;
  const pct = (v: number, max: number) => Math.round((v / max) * 1000) / 10;
  return {
    date: today(),
    reads,
    writes,
    deletes,
    estimated: true,
    limits: { reads: SPARK_FREE.reads, writes: SPARK_FREE.writes },
    percent: { reads: pct(reads, SPARK_FREE.reads), writes: pct(writes, SPARK_FREE.writes) },
  };
}

export function quotaWarning(reads: number, writes: number, limits = SPARK_FREE): string | null {
  const rPct = (reads / limits.reads) * 100;
  const wPct = (writes / limits.writes) * 100;
  if (rPct >= 100 || wPct >= 100) {
    return 'Perkiraan pemakaian harian melewati batas gratis Spark. Operasi dapat gagal sampai kuota direset.';
  }
  if (rPct >= 80 || wPct >= 80) {
    return 'Perkiraan pemakaian harian mendekati batas gratis Spark (≥80%). Pertimbangkan membagi sesi ujian.';
  }
  if (rPct >= 50 || wPct >= 50) {
    return 'Perkiraan pemakaian harian sudah melewati 50% batas gratis Spark.';
  }
  return null;
}
