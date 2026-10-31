/**
 * Sumber waktu tunggal untuk aturan ujian. Semua keputusan waktu (token,
 * timer, submit) memakai waktu server ini dan tidak pernah jam perangkat.
 */
export function serverNow(): Date {
  return new Date();
}

export function serverNowIso(): string {
  return serverNow().toISOString();
}

export function serverMs(): number {
  return serverNow().getTime();
}

/**
 * Toleransi penyimpanan jawaban setelah waktu selesai: jawaban yang sudah
 * dihitung pada server tetap diterima selama masih dalam grace window,
 * tetapi tidak pernah memperpanjang waktu ujian.
 */
export const SAVE_GRACE_MS = 15_000;
