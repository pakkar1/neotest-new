/** Kode kesalahan API yang stabil; frontend menampilkan pesan manusiawinya. */
export type ApiErrorCode =
  | 'UNAUTHENTICATED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'VALIDATION_ERROR'
  | 'CONFLICT'
  | 'RATE_LIMITED'
  | 'TOKEN_INVALID'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_REVOKED'
  | 'TOKEN_SCOPE_MISMATCH'
  | 'TOKEN_NOT_YET_VALID'
  | 'SESSION_NOT_OPEN'
  | 'SESSION_CLOSED'
  | 'EXAM_NOT_ACTIVE'
  | 'EXAM_TIME_OVER'
  | 'ATTEMPT_LOCKED'
  | 'ALREADY_SUBMITTED'
  | 'PARTICIPANT_NOT_FOUND'
  | 'CONFIGURATION_ERROR'
  | 'INTERNAL_ERROR';

export class ApiError extends Error {
  readonly code: ApiErrorCode;
  readonly status: number;
  readonly details?: unknown;
  readonly retryAfter?: number;

  constructor(
    code: ApiErrorCode,
    message: string,
    status = 400,
    details?: unknown,
    retryAfter?: number,
  ) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.details = details;
    this.retryAfter = retryAfter;
  }
}

export const errors = {
  unauthenticated: (msg = 'Sesi tidak valid. Silakan masuk kembali.') =>
    new ApiError('UNAUTHENTICATED', msg, 401),
  forbidden: (msg = 'Anda tidak memiliki izin untuk tindakan ini.') =>
    new ApiError('FORBIDDEN', msg, 403),
  notFound: (msg = 'Data tidak ditemukan.') => new ApiError('NOT_FOUND', msg, 404),
  validation: (msg = 'Data tidak valid.', details?: unknown) =>
    new ApiError('VALIDATION_ERROR', msg, 422, details),
  conflict: (msg = 'Data bertentangan dengan aturan sistem.', details?: unknown) =>
    new ApiError('CONFLICT', msg, 409, details),
  rateLimited: (retryAfter = 60) =>
    new ApiError('RATE_LIMITED', 'Terlalu banyak percobaan. Coba lagi nanti.', 429, undefined, retryAfter),
  internal: (msg = 'Terjadi kesalahan pada server.') =>
    new ApiError('INTERNAL_ERROR', msg, 500),
};

export function asApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  if (err && typeof err === 'object' && 'issues' in err) {
    return errors.validation('Data tidak valid.', (err as { issues: unknown }).issues);
  }
  return errors.internal();
}
