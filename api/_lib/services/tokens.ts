import { hasPermission } from '../../../src/shared/permissions';
import { addMinutes, isExpired, minutesBetween } from '../../../src/shared/time';
import type { AppSettings, ExamSession, ExamToken, TokenIssueResult, TokenKind } from '../../../src/shared/types';
import { AUDIT_ACTIONS, writeAudit } from '../audit';
import { serverNow, serverNowIso } from '../clock';
import { ApiError, errors } from '../errors';
import { generateExamToken, hashExamToken, newId, normalizeExamToken, safeEqual } from '../ids';
import { getStore } from '../store';
import type { AuthContext } from '../auth';
import { assertSameSchool } from '../auth';

function tokenPepper(): string {
  const pepper = process.env.NEOTEST_TOKEN_PEPPER;
  if (pepper && pepper.length >= 16) return pepper;
  const driver = (process.env.NEOTEST_DATA_DRIVER ?? 'demo').toLowerCase();
  if (driver === 'demo') return 'neotest-demo-token-pepper';
  throw errors.internal(
    'NEOTEST_TOKEN_PEPPER belum diisi (minimal 16 karakter). Wajib pada mode Firebase.',
  );
}

export function examTokenId(token: string): string {
  return `tok_${hashExamToken(token, tokenPepper())}`;
}

export async function getSettingsForSchool(schoolId: string | null): Promise<AppSettings | null> {
  const store = await getStore();
  const settings = await store.query<AppSettings>('appSettings', {
    where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
    limit: 5,
  });
  return settings.find((s) => s.schoolId === schoolId) ?? settings[0] ?? null;
}

export function assertCanManageSession(auth: AuthContext, session: ExamSession): void {
  if (auth.roles.includes('superadmin')) return;
  assertSameSchool(auth, session.schoolId);
  if (hasPermission(auth.roles, 'session.open') && !auth.roles.includes('proctor')) return;
  if (auth.roles.includes('proctor')) {
    const proctor = auth.proctor;
    if (!proctor) throw errors.forbidden('Profil proktor tidak ditemukan.');
    if (session.proctorId !== proctor.id) {
      throw errors.forbidden('Sesi ini bukan tanggung jawab Anda.');
    }
    if (proctor.roomIds.length > 0 && !proctor.roomIds.includes(session.roomId)) {
      throw errors.forbidden('Ruang sesi ini tidak termasuk ruang yang Anda tangani.');
    }
    return;
  }
  throw errors.forbidden();
}

export interface IssueTokenInput {
  kind: TokenKind;
  sessionId: string;
  ttlMinutes?: number;
  ip?: string;
}

export async function issueSessionToken(
  auth: AuthContext,
  input: IssueTokenInput,
): Promise<TokenIssueResult> {
  if (!hasPermission(auth.roles, 'token.issue')) throw errors.forbidden();
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', input.sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  assertCanManageSession(auth, session);

  if (session.status !== 'open') {
    throw new ApiError('SESSION_NOT_OPEN', 'Sesi belum dibuka. Buka sesi terlebih dahulu.', 409);
  }
  const now = serverNow();
  if (isExpired(session.endsAt, now)) {
    throw new ApiError('SESSION_CLOSED', 'Waktu sesi sudah berakhir.', 409);
  }

  const settings = await getSettingsForSchool(session.schoolId);
  const defaultTtl =
    input.kind === 'start'
      ? settings?.security.tokenTtlDefaultMinutes ?? 120
      : settings?.security.submitTokenTtlMinutes ?? 30;
  const ttl = Math.min(input.ttlMinutes ?? defaultTtl, 240);

  // Cabut token aktif sebelumnya untuk sesi & jenis yang sama.
  const previous = await store.query<ExamToken>('examTokens', {
    where: [
      { field: 'sessionId', op: '==', value: session.id },
      { field: 'kind', op: '==', value: input.kind },
      { field: 'revokedAt', op: '==', value: null },
    ],
    limit: 20,
  });
  const nowIso = serverNowIso();
  for (const old of previous) {
    if (old.expiresAt > nowIso) {
      await store.update<ExamToken>('examTokens', old.id, {
        revokedAt: nowIso,
        revokedBy: auth.user.id,
      });
    }
  }

  const plaintext = generateExamToken();
  const id = examTokenId(plaintext);
  const expiresAt = addMinutes(now, ttl);
  const token: ExamToken = {
    id,
    kind: input.kind,
    schoolId: session.schoolId,
    scheduleId: session.scheduleId,
    sessionId: session.id,
    roomId: session.roomId,
    examTypeId: '',
    issuedBy: auth.user.id,
    issuedAt: nowIso,
    expiresAt,
    revokedAt: null,
    revokedBy: null,
    rotatedFrom: previous[0]?.id ?? null,
    uses: 0,
    lastUsedAt: null,
  };
  await store.set('examTokens', id, token);
  await store.update<ExamSession>('examSessions', session.id, {
    ...(input.kind === 'start' ? { startTokenId: id } : { submitTokenId: id }),
  });

  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.tokenIssue,
    targetType: 'examTokens',
    targetId: id,
    meta: { kind: input.kind, sessionId: session.id, roomId: session.roomId, expiresAt, tokenHint: last4(plaintext) },
    ip: input.ip,
  });

  return {
    tokenId: id,
    token: plaintext,
    kind: input.kind,
    expiresAt,
    sessionId: session.id,
    roomId: session.roomId,
  };
}

function last4(token: string): string {
  return normalizeExamToken(token).slice(-4);
}

export async function revokeSessionToken(
  auth: AuthContext,
  tokenId: string,
  ip?: string,
): Promise<void> {
  if (!hasPermission(auth.roles, 'token.revoke')) throw errors.forbidden();
  const store = await getStore();
  const token = await store.getDoc<ExamToken>('examTokens', tokenId);
  if (!token) throw errors.notFound('Token tidak ditemukan.');
  const session = await store.getDoc<ExamSession>('examSessions', token.sessionId);
  if (!session) throw errors.notFound('Sesi token tidak ditemukan.');
  assertCanManageSession(auth, session);
  if (token.revokedAt) return;
  await store.update<ExamToken>('examTokens', token.id, {
    revokedAt: serverNowIso(),
    revokedBy: auth.user.id,
  });
  await writeAudit({
    schoolId: token.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.tokenRevoke,
    targetType: 'examTokens',
    targetId: token.id,
    meta: { kind: token.kind, sessionId: token.sessionId },
    ip,
  });
}

export interface ValidatedToken {
  token: ExamToken;
  session: ExamSession;
}

/**
 * Validasi token di jalur server. Dokumen token diidentifikasi oleh hash,
 * sehingga tidak ada plaintext token di database maupun log.
 */
export async function validateExamToken(
  rawToken: string,
  kind: TokenKind,
  expectedSessionId: string,
  options: { recordUse?: boolean } = {},
): Promise<ValidatedToken> {
  const normalized = normalizeExamToken(rawToken);
  if (normalized.length < 4) {
    throw new ApiError('TOKEN_INVALID', 'Format token tidak valid.', 400);
  }
  const store = await getStore();
  const id = examTokenId(normalized);
  const token = await store.getDoc<ExamToken>('examTokens', id);
  if (!token) {
    throw new ApiError('TOKEN_INVALID', 'Token tidak dikenali.', 400);
  }
  if (!safeEqual(token.id, id)) {
    throw new ApiError('TOKEN_INVALID', 'Token tidak dikenali.', 400);
  }
  if (token.kind !== kind) {
    throw new ApiError('TOKEN_INVALID', `Token ini bukan token ${kind === 'start' ? 'mulai' : 'submit'}.`, 400);
  }
  if (token.sessionId !== expectedSessionId) {
    throw new ApiError('TOKEN_SCOPE_MISMATCH', 'Token bukan untuk sesi ujian ini.', 403);
  }
  if (token.revokedAt) {
    throw new ApiError('TOKEN_REVOKED', 'Token sudah dicabut oleh pengawas.', 403);
  }
  if (isExpired(token.expiresAt)) {
    throw new ApiError('TOKEN_EXPIRED', 'Token sudah kedaluwarsa.', 403);
  }
  const session = await store.getDoc<ExamSession>('examSessions', token.sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (session.status !== 'open') {
    throw new ApiError('SESSION_NOT_OPEN', 'Sesi ujian belum dibuka atau sudah ditutup.', 409);
  }
  if (isExpired(session.endsAt)) {
    throw new ApiError('SESSION_CLOSED', 'Waktu sesi sudah berakhir.', 409);
  }
  if (options.recordUse !== false) {
    await store.update<ExamToken>('examTokens', token.id, {
      uses: token.uses + 1,
      lastUsedAt: serverNowIso(),
    });
  }
  return { token, session };
}

/** Token submit hanya mengizinkan submit setelah durasi minimal tercapai. */
export function assertMinimumSubmitTime(startedAt: string, minSubmitMinutes: number): void {
  const elapsed = minutesBetween(startedAt, serverNowIso());
  if (elapsed + 1e-6 < minSubmitMinutes) {
    const remaining = Math.ceil(minSubmitMinutes - elapsed);
    throw new ApiError(
      'TOKEN_NOT_YET_VALID',
      `Belum memenuhi waktu minimal pengerjaan. Coba lagi dalam ${remaining} menit.`,
      403,
      { remainingMinutes: remaining },
    );
  }
}

export function createTokenAuditMeta(token: ExamToken): Record<string, unknown> {
  return {
    tokenId: token.id,
    kind: token.kind,
    sessionId: token.sessionId,
    roomId: token.roomId,
    issuedAt: token.issuedAt,
    expiresAt: token.expiresAt,
  };
}

export function newTokenIdPlaceholder(): string {
  return newId('toktmp');
}
