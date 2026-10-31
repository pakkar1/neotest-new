import { errors } from './errors';

/**
 * Rate limiter in-memory per instance serverless.
 * Batasan: pada Vercel tiap instance memiliki memori sendiri, sehingga batas
 * efektif dapat berlipat sesuai jumlah instance hangat. Lapisan kedua adalah
 * pencatatan percobaan gagal di database untuk login dan token ujian.
 */
interface Bucket {
  hits: number[];
}

const buckets = new Map<string, Bucket>();
let lastSweep = Date.now();

function sweep(now: number): void {
  if (now - lastSweep < 60_000) return;
  lastSweep = now;
  for (const [key, bucket] of buckets) {
    bucket.hits = bucket.hits.filter((t) => now - t < 15 * 60_000);
    if (bucket.hits.length === 0) buckets.delete(key);
  }
}

export interface RateLimitOptions {
  key: string;
  limit: number;
  windowMs: number;
}

export function rateLimit({ key, limit, windowMs }: RateLimitOptions): void {
  const now = Date.now();
  sweep(now);
  let bucket = buckets.get(key);
  if (!bucket) {
    bucket = { hits: [] };
    buckets.set(key, bucket);
  }
  bucket.hits = bucket.hits.filter((t) => now - t < windowMs);
  if (bucket.hits.length >= limit) {
    const retryAfter = Math.max(1, Math.ceil((windowMs - (now - bucket.hits[0])) / 1000));
    throw errors.rateLimited(retryAfter);
  }
  bucket.hits.push(now);
}

/** Dipakai pengujian untuk mereset state. */
export function __resetRateLimits(): void {
  buckets.clear();
}
