import { createHmac, timingSafeEqual } from 'node:crypto';
import type { ApiRequest } from './http';
import { errors } from './errors';
import { getStore } from './store';
import { hasPermission, type Permission } from '../../src/shared/permissions';
import type { Proctor, Role, Student, Teacher, User } from '../../src/shared/types';
import { searchKeyOf } from './ids';

export interface SessionClaims {
  sub: string;
  mode: 'demo' | 'firebase';
  iat: number;
  exp: number;
}

export interface AuthContext {
  user: User;
  roles: Role[];
  schoolId: string | null;
  claims: SessionClaims;
  student?: Student;
  proctor?: Proctor;
  teacher?: Teacher;
}

const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8 jam

function sessionSecret(): string {
  const secret = process.env.NEOTEST_SESSION_SECRET;
  if (secret && secret.length >= 24) return secret;
  const driver = (process.env.NEOTEST_DATA_DRIVER ?? 'demo').toLowerCase();
  if (driver === 'demo') return 'neotest-demo-only-session-secret-do-not-use-in-production';
  throw errors.internal(
    'NEOTEST_SESSION_SECRET belum diisi (minimal 24 karakter). Konfigurasi ini wajib pada mode Firebase.',
  );
}

function b64url(input: Buffer | string): string {
  return Buffer.from(input).toString('base64url');
}

export function signSession(userId: string, mode: 'demo' | 'firebase'): { token: string; expiresAt: string } {
  const now = Math.floor(Date.now() / 1000);
  const claims: SessionClaims = { sub: userId, mode, iat: now, exp: now + SESSION_TTL_SECONDS };
  const payload = b64url(JSON.stringify(claims));
  const sig = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  return { token: `${payload}.${sig}`, expiresAt: new Date(claims.exp * 1000).toISOString() };
}

export function verifySessionToken(token: string): SessionClaims {
  const [payload, sig] = token.split('.');
  if (!payload || !sig) throw errors.unauthenticated();
  const expected = createHmac('sha256', sessionSecret()).update(payload).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !timingSafeEqual(a, b)) throw errors.unauthenticated();
  let claims: SessionClaims;
  try {
    claims = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')) as SessionClaims;
  } catch {
    throw errors.unauthenticated();
  }
  if (!claims.sub || typeof claims.exp !== 'number') throw errors.unauthenticated();
  if (claims.exp * 1000 <= Date.now()) {
    throw errors.unauthenticated('Sesi berakhir. Silakan masuk kembali.');
  }
  return claims;
}

/** Verifikasi Firebase ID token hanya dijalankan di server pada mode Firebase. */
export async function verifyFirebaseIdToken(idToken: string): Promise<{ uid: string; email?: string }> {
  const { getAuth } = await import('firebase-admin/auth');
  const decoded = await getAuth().verifyIdToken(idToken, true);
  return { uid: decoded.uid, email: decoded.email };
}

function bearer(req: ApiRequest): string | null {
  const header = req.headers.authorization ?? '';
  if (!header.toLowerCase().startsWith('bearer ')) return null;
  return header.slice(7).trim();
}

export async function authenticate(req: ApiRequest): Promise<AuthContext> {
  const token = bearer(req);
  if (!token) throw errors.unauthenticated();
  const claims = verifySessionToken(token);
  const store = await getStore();
  const user = await store.getDoc<User>('users', claims.sub);
  if (!user || user.deletedAt) throw errors.unauthenticated();
  if (!user.active) throw errors.forbidden('Akun dinonaktifkan. Hubungi administrator sekolah.');

  const roles = Array.isArray(user.roles) ? user.roles : [];
  if (roles.length === 0) throw errors.forbidden('Akun tidak memiliki peran yang valid.');

  const ctx: AuthContext = {
    user,
    roles,
    schoolId: user.schoolId ?? null,
    claims,
  };

  if (roles.includes('student')) {
    const students = await store.query<Student>('students', {
      where: [
        { field: 'userId', op: '==', value: user.id },
        { field: 'active', op: '==', value: true },
      ],
      limit: 1,
    });
    ctx.student = students[0];
  }
  if (roles.includes('proctor')) {
    const proctors = await store.query<Proctor>('proctors', {
      where: [{ field: 'userId', op: '==', value: user.id }],
      limit: 1,
    });
    ctx.proctor = proctors[0];
  }
  if (roles.includes('teacher')) {
    const teachers = await store.query<Teacher>('teachers', {
      where: [{ field: 'userId', op: '==', value: user.id }],
      limit: 1,
    });
    ctx.teacher = teachers[0];
  }
  return ctx;
}

export interface RequireOptions {
  roles?: Role[];
  permission?: Permission;
}

export async function requireAuth(req: ApiRequest, options: RequireOptions = {}): Promise<AuthContext> {
  const ctx = await authenticate(req);
  if (options.roles && !options.roles.some((r) => ctx.roles.includes(r))) {
    throw errors.forbidden();
  }
  if (options.permission && !hasPermission(ctx.roles, options.permission)) {
    throw errors.forbidden();
  }
  return ctx;
}

/**
 * Menentukan schoolId efektif dari permintaan.
 * Superadmin boleh memilih sekolah lain melalui query/body, admin dan peran
 * lain selalu terikat pada sekolah akunnya (tidak dapat memalsukan schoolId).
 */
export function resolveSchoolId(
  auth: AuthContext,
  requested: string | null | undefined,
  options: { require?: boolean } = { require: true },
): string | null {
  const isSuper = auth.roles.includes('superadmin');
  let schoolId: string | null;
  if (isSuper) {
    schoolId = requested ?? auth.schoolId ?? null;
  } else {
    schoolId = auth.schoolId;
    if (requested && requested !== auth.schoolId) {
      throw errors.forbidden('Anda hanya dapat mengakses data sekolah sendiri.');
    }
  }
  if (options.require !== false && !schoolId) {
    throw errors.validation('schoolId wajib ditentukan.');
  }
  return schoolId;
}

export function assertSameSchool(auth: AuthContext, schoolId: string | null | undefined): void {
  if (!schoolId) throw errors.validation('Data sekolah tidak diketahui.');
  if (auth.roles.includes('superadmin')) return;
  if (auth.schoolId !== schoolId) throw errors.forbidden('Data milik sekolah lain.');
}

export function isStudentOnly(ctx: AuthContext): boolean {
  return ctx.roles.length === 1 && ctx.roles[0] === 'student';
}

export function requireStudent(ctx: AuthContext): Student {
  if (!ctx.student) throw errors.forbidden('Profil peserta ujian tidak ditemukan.');
  return ctx.student;
}

/** Dipakai untuk validasi login agar email/username tidak membocorkan apakah akun ada. */
export function normalizeLoginIdentifier(identifier: string): string {
  return searchKeyOf(identifier);
}
