import { randomUUID, randomInt, randomBytes, createHash, timingSafeEqual } from 'node:crypto';

export function newId(prefix = ''): string {
  const id = randomUUID();
  return prefix ? `${prefix}_${id}` : id;
}

/** ID dokumen komposit yang stabil, mis. `${scheduleId}__${questionId}`. */
export function compositeId(...parts: string[]): string {
  return parts.map((p) => p.replace(/\//g, '_')).join('__');
}

/** Normalisasi untuk pencarian berawalan (searchKey). */
export function searchKeyOf(...parts: string[]): string {
  return parts
    .join(' ')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function sha256Hex(input: string): string {
  return createHash('sha256').update(input, 'utf8').digest('hex');
}

/** Perbandingan waktu-konstan untuk hash token. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const TOKEN_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'; // tanpa 0/1/I/O

/**
 * Token ujian 8 karakter, ~1.1e12 kemungkinan. Ditampilkan dengan tanda hubung.
 * Entropi cukup tinggi untuk TTL pendek + rate limit, dan tetap mudah diketik.
 */
export function generateExamToken(): string {
  let raw = '';
  for (let i = 0; i < 8; i++) raw += TOKEN_ALPHABET[randomInt(0, TOKEN_ALPHABET.length)];
  return `${raw.slice(0, 4)}-${raw.slice(4)}`;
}

export function normalizeExamToken(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '');
}

export function hashExamToken(token: string, pepper: string): string {
  return sha256Hex(`${pepper}:${normalizeExamToken(token)}`);
}

export function randomSecret(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}
