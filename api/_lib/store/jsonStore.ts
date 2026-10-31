import { promises as fs } from 'node:fs';
import path from 'node:path';
import { trackDeletes, trackReads, trackWrites, setQuotaFlushHandler } from '../quota';
import type { Store, StoreQuery, StoreTx, Where } from './types';

/**
 * Driver DEMO: data disimpan pada satu berkas JSON, dengan antrean mutex
 * agar transaksi tetap serial. Hanya untuk pengembangan/preview lokal.
 * Pada deployment Vercel tanpa Firebase, data disimpan di /tmp dan akan
 * hilang ketika instance didaur ulang — ini dinyatakan eksplisit di UI.
 */
type Doc = Record<string, unknown> & { id: string };
type Db = { version: number; collections: Record<string, Record<string, Doc>> };

const WRITE_DELAY_MS = 15;

export class JsonStore implements Store {
  readonly mode = 'demo' as const;
  private db!: Db;
  private queue: Promise<unknown> = Promise.resolve();
  private writeScheduled = false;
  private lastMtimeMs = 0;
  private persistChain: Promise<void> = Promise.resolve();
  private readonly file: string;
  private readonly ephemeral: boolean;
  private readonly seed: () => Promise<Db>;

  constructor(file: string, seed: () => Promise<Db>, ephemeral: boolean) {
    this.file = file;
    this.seed = seed;
    this.ephemeral = ephemeral;
  }

  async init(): Promise<void> {
    try {
      await this.readFromDisk();
    } catch {
      this.db = await this.seed();
      await this.persistNow();
    }
    setQuotaFlushHandler(async ({ date, reads, writes, deletes }) => {
      const existing = (this.db.collections.quotaCounters?.[date] as
        | (Doc & { reads: number; writes: number; deletes: number })
        | undefined) ?? {
        id: date,
        date,
        reads: 0,
        writes: 0,
        deletes: 0,
      };
      this.db.collections.quotaCounters = this.db.collections.quotaCounters ?? {};
      this.db.collections.quotaCounters[date] = {
        ...existing,
        reads: existing.reads + reads,
        writes: existing.writes + writes,
        deletes: existing.deletes + deletes,
        updatedAt: new Date().toISOString(),
      } as Doc;
      this.scheduleWrite();
    });
  }

  private col(name: string): Record<string, Doc> {
    this.db.collections[name] = this.db.collections[name] ?? {};
    return this.db.collections[name];
  }

  get isEphemeral(): boolean {
    return this.ephemeral;
  }

  /** Membangun ulang seluruh data demo. Hanya dipakai pada driver demo. */
  async reset(seed: () => Promise<Db>): Promise<void> {
    await this.lock(async () => {
      this.db = await seed();
      await this.persistNow();
    });
  }

  private lock<T>(fn: () => Promise<T>): Promise<T> {
    const run = this.queue.then(
      async () => {
        await this.refreshIfStale();
        return fn();
      },
      async () => {
        await this.refreshIfStale();
        return fn();
      },
    );
    this.queue = run.catch(() => undefined);
    return run;
  }

  private scheduleWrite(): void {
    if (this.writeScheduled) return;
    this.writeScheduled = true;
    setTimeout(() => {
      this.writeScheduled = false;
      void this.persistNow().catch((e) => console.error('[neotest] gagal menyimpan DB demo', e));
    }, WRITE_DELAY_MS);
  }

  /**
   * Dev/Vite menjalankan setiap handler API sebagai bundle terpisah sehingga
   * ada beberapa instance JsonStore pada satu proses. Setiap operasi membaca
   * ulang berkas bila mtime berubah agar tulisan antar-endpoint terlihat.
   * Pada Vercel, tiap function tetap memakai /tmp sendiri: data demo tidak
   * dibagi antar-function. Gunakan Firebase untuk deployment nyata.
   */
  private async readFromDisk(): Promise<void> {
    const [raw, stat] = await Promise.all([fs.readFile(this.file, 'utf8'), fs.stat(this.file)]);
    this.db = JSON.parse(raw) as Db;
    this.lastMtimeMs = stat.mtimeMs;
  }

  private async refreshIfStale(): Promise<void> {
    await this.persistChain;
    try {
      const stat = await fs.stat(this.file);
      if (stat.mtimeMs === this.lastMtimeMs) return;
      await this.readFromDisk();
    } catch {
      // Berkas belum ada / sedang diganti. Biarkan salinan memori dipakai.
    }
  }

  private persistNow(): Promise<void> {
    const run = this.persistChain.then(async () => {
      await fs.mkdir(path.dirname(this.file), { recursive: true });
      const tmp = `${this.file}.${process.pid}.${Math.random().toString(36).slice(2)}.tmp`;
      await fs.writeFile(tmp, JSON.stringify(this.db), 'utf8');
      await fs.rename(tmp, this.file);
      const stat = await fs.stat(this.file);
      this.lastMtimeMs = stat.mtimeMs;
    });
    this.persistChain = run.catch(() => undefined);
    return run;
  }

  private compare(a: unknown, b: unknown): number {
    if (typeof a === 'number' && typeof b === 'number') return a - b;
    return String(a ?? '').localeCompare(String(b ?? ''));
  }

  private match(doc: Doc, where: Where[]): boolean {
    for (const w of where) {
      const v = doc[w.field];
      switch (w.op) {
        case '==':
          if (v !== w.value) return false;
          break;
        case '!=':
          if (v === w.value) return false;
          break;
        case 'in':
          if (!Array.isArray(w.value) || !w.value.includes(v)) return false;
          break;
        case 'not-in':
          if (Array.isArray(w.value) && w.value.includes(v)) return false;
          break;
        case '>':
          if (this.compare(v, w.value) <= 0) return false;
          break;
        case '>=':
          if (this.compare(v, w.value) < 0) return false;
          break;
        case '<':
          if (this.compare(v, w.value) >= 0) return false;
          break;
        case '<=':
          if (this.compare(v, w.value) > 0) return false;
          break;
        case 'array-contains':
          if (!Array.isArray(v) || !v.includes(w.value)) return false;
          break;
        case 'array-contains-any': {
          const wanted = Array.isArray(w.value) ? (w.value as unknown[]) : [];
          if (!Array.isArray(v) || !v.some((x) => wanted.includes(x))) return false;
          break;
        }
        default:
          return false;
      }
    }
    return true;
  }

  private runQuery<T extends Doc>(name: string, q: StoreQuery): T[] {
    const docs = Object.values(this.col(name));
    const where = q.where ?? [];
    let rows = docs.filter((d) => this.match(d, where));
    if (q.search) {
      const prefix = q.search.toLowerCase();
      rows = rows.filter((d) => String(d.searchKey ?? '').startsWith(prefix));
    }
    if (q.orderBy?.length) {
      rows = [...rows].sort((a, b) => {
        for (const o of q.orderBy!) {
          const av = a[o.field] as string | number;
          const bv = b[o.field] as string | number;
          if (av === bv) continue;
          const cmp = (av ?? '') > (bv ?? '') ? 1 : -1;
          return o.dir === 'asc' ? cmp : -cmp;
        }
        return 0;
      });
    }
    const offset = q.offset ?? 0;
    const limit = q.limit ?? 1000;
    return rows.slice(offset, offset + limit) as T[];
  }

  async getDoc<T extends Doc>(collection: string, id: string): Promise<T | null> {
    await this.refreshIfStale();
    trackReads(1);
    const doc = this.col(collection)[id];
    return doc ? (structuredClone(doc) as T) : null;
  }

  async query<T extends Doc>(collection: string, q: StoreQuery): Promise<T[]> {
    await this.refreshIfStale();
    trackReads(1);
    const rows = this.runQuery<T>(collection, q);
    trackReads(rows.length);
    return rows.map((r) => structuredClone(r));
  }

  async count(collection: string, q: StoreQuery = {}): Promise<number> {
    await this.refreshIfStale();
    trackReads(1);
    return this.runQuery(collection, { ...q, limit: Number.MAX_SAFE_INTEGER, offset: 0 }).length;
  }

  async set<T extends Doc>(collection: string, id: string, doc: T): Promise<void> {
    await this.lock(async () => {
      this.col(collection)[id] = structuredClone({ ...doc, id });
      trackWrites(1);
      await this.persistNow();
    });
  }

  async create<T extends Doc>(collection: string, id: string, doc: T): Promise<T> {
    return this.lock(async () => {
      const col = this.col(collection);
      if (col[id]) throw new Error(`DUPLICATE:${collection}/${id}`);
      col[id] = structuredClone({ ...doc, id });
      trackWrites(1);
      await this.persistNow();
      return structuredClone(col[id]) as T;
    });
  }

  async update<T extends Doc>(collection: string, id: string, patch: Partial<T>): Promise<T> {
    return this.lock(async () => {
      const col = this.col(collection);
      const existing = col[id];
      if (!existing) throw new Error(`NOT_FOUND:${collection}/${id}`);
      col[id] = { ...existing, ...structuredClone(patch), id } as Doc;
      trackWrites(1);
      await this.persistNow();
      return structuredClone(col[id]) as T;
    });
  }

  async remove(collection: string, id: string): Promise<void> {
    await this.lock(async () => {
      delete this.col(collection)[id];
      trackDeletes(1);
      await this.persistNow();
    });
  }

  async batch(fn: (tx: StoreTx) => Promise<void>): Promise<void> {
    await this.transaction(fn);
  }

  async transaction<T>(fn: (tx: StoreTx) => Promise<T>): Promise<T> {
    return this.lock(async () => {
      const tx: StoreTx = {
        getDoc: async <D extends Doc>(c: string, id: string) => {
          trackReads(1);
          const doc = this.col(c)[id];
          return doc ? (structuredClone(doc) as D) : null;
        },
        query: async <D extends Doc>(c: string, q: StoreQuery) => {
          trackReads(1);
          const rows = this.runQuery<D>(c, q);
          trackReads(rows.length);
          return rows;
        },
        set: async <D extends Doc>(c: string, id: string, doc: D) => {
          this.col(c)[id] = structuredClone({ ...doc, id });
          trackWrites(1);
        },
        update: async <D extends Doc>(c: string, id: string, patch: Partial<D>) => {
          const cur = this.col(c)[id];
          if (!cur) throw new Error(`NOT_FOUND:${c}/${id}`);
          this.col(c)[id] = { ...cur, ...structuredClone(patch), id } as Doc;
          trackWrites(1);
        },
        remove: async (c: string, id: string) => {
          delete this.col(c)[id];
          trackDeletes(1);
        },
      };
      const result = await fn(tx);
      await this.persistNow();
      return result;
    });
  }
}
