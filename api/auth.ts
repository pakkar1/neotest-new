import { endpoint, json, type ApiRequest, type ApiResponse } from './_lib/http';
import { ApiError, errors } from './_lib/errors';
import { getStore, dataDriver } from './_lib/store';
import { verifyPassword } from './_lib/password';
import {
  authenticate,
  normalizeLoginIdentifier,
  requireAuth,
  verifyFirebaseIdToken,
} from './_lib/auth';
import { issueAuthSession, sessionUserFromAuth } from './_lib/session';
import { rateLimit } from './_lib/rateLimit';
import { AUDIT_ACTIONS, writeAudit } from './_lib/audit';
import { serverNowIso } from './_lib/clock';
import { parseBody } from './_lib/rest';
import { loginSchema } from '../src/shared/schemas';
import type { Role, Student, User } from '../src/shared/types';

const DEMO_ACCOUNTS: { email: string; name: string; roles: Role[] }[] = [
  { email: 'superadmin@neotest.demo', name: 'Super Admin', roles: ['superadmin'] },
  { email: 'admin@neotest.demo', name: 'Admin Sekolah', roles: ['admin'] },
  { email: 'guru@neotest.demo', name: 'Guru Matematika', roles: ['teacher'] },
  { email: 'proktor@neotest.demo', name: 'Proktor Ruang 01–02', roles: ['proctor'] },
  { email: 'siswa01@neotest.demo', name: 'Peserta 01 (kelas 9A)', roles: ['student'] },
];

async function findUserByIdentifier(identifier: string): Promise<User | null> {
  const store = await getStore();
  const normalized = normalizeLoginIdentifier(identifier);
  if (!normalized) return null;
  const raw = identifier.trim().toLowerCase();
  const byEmail = await store.query<User>('users', {
    where: [
      { field: 'email', op: '==', value: raw },
      { field: 'deletedAt', op: '==', value: null },
    ],
    limit: 2,
  });
  if (byEmail[0]) return byEmail[0];
  const byUsername = await store.query<User>('users', {
    where: [
      { field: 'username', op: '==', value: raw },
      { field: 'deletedAt', op: '==', value: null },
    ],
    limit: 2,
  });
  return byUsername[0] ?? null;
}

async function handleLogin(req: ApiRequest): Promise<ApiResponse> {
  if (dataDriver() !== 'demo') {
    throw new ApiError(
      'VALIDATION_ERROR',
      'Login email/password hanya tersedia pada mode demo. Gunakan Firebase Authentication pada mode produksi.',
      400,
    );
  }
  const body = await parseBody(loginSchema, req.body);
  const identifierKey = normalizeLoginIdentifier(body.email);
  rateLimit({ key: `login:ip:${req.ip}`, limit: 30, windowMs: 15 * 60_000 });
  rateLimit({ key: `login:id:${identifierKey}`, limit: 10, windowMs: 15 * 60_000 });

  const store = await getStore();
  const user = await findUserByIdentifier(body.email);
  if (!user) {
    await writeAudit({
      schoolId: null,
      actorId: 'anonymous',
      actorName: body.email.slice(0, 60),
      actorRole: 'system',
      action: AUDIT_ACTIONS.loginFailed,
      targetType: 'auth',
      targetId: identifierKey.slice(0, 80),
      meta: { reason: 'user_not_found' },
      ip: req.ip,
    });
    throw new ApiError('UNAUTHENTICATED', 'Email/username atau password salah.', 401);
  }
  if (!user.active || user.deletedAt) {
    throw errors.forbidden('Akun dinonaktifkan. Hubungi administrator sekolah.');
  }
  if (!verifyPassword(body.password, user.passwordHash)) {
    await writeAudit({
      schoolId: user.schoolId,
      actorId: user.id,
      actorName: user.displayName,
      actorRole: user.roles[0] ?? 'system',
      action: AUDIT_ACTIONS.loginFailed,
      targetType: 'auth',
      targetId: user.id,
      meta: { reason: 'bad_password' },
      ip: req.ip,
    });
    throw new ApiError('UNAUTHENTICATED', 'Email/username atau password salah.', 401);
  }

  const students = await store.query<Student>('students', {
    where: [{ field: 'userId', op: '==', value: user.id }],
    limit: 1,
  });
  await store.update<User>('users', user.id, { lastLoginAt: serverNowIso() });
  const session = await issueAuthSession(user, 'demo');
  await writeAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.roles[0],
    action: AUDIT_ACTIONS.loginSuccess,
    targetType: 'auth',
    targetId: user.id,
    ip: req.ip,
  });
  return json({ ...session, user: { ...session.user, studentId: students[0]?.id } });
}

async function handleFirebaseSession(req: ApiRequest): Promise<ApiResponse> {
  if (dataDriver() !== 'firebase') {
    throw errors.validation('Mode Firebase tidak aktif pada server ini.');
  }
  const idToken = (req.body as { idToken?: string }).idToken;
  if (!idToken) throw errors.validation('idToken wajib dikirim.');
  rateLimit({ key: `session:${req.ip}`, limit: 30, windowMs: 15 * 60_000 });
  const decoded = await verifyFirebaseIdToken(idToken);
  const store = await getStore();
  const users = await store.query<User>('users', {
    where: [{ field: 'uid', op: '==', value: decoded.uid }],
    limit: 1,
  });
  let user = users[0];
  if (!user && decoded.email) {
    const byEmail = await findUserByIdentifier(decoded.email);
    if (byEmail) {
      user = await store.update<User>('users', byEmail.id, { uid: decoded.uid });
    }
  }
  if (!user) {
    throw errors.forbidden(
      'Akun Firebase ini belum terdaftar di NeoTest. Minta administrator menjalankan skrip bootstrap.',
    );
  }
  if (!user.active) throw errors.forbidden('Akun dinonaktifkan.');
  const students = await store.query<Student>('students', {
    where: [{ field: 'userId', op: '==', value: user.id }],
    limit: 1,
  });
  await store.update<User>('users', user.id, { lastLoginAt: serverNowIso() });
  const session = await issueAuthSession(user, 'firebase');
  await writeAudit({
    schoolId: user.schoolId,
    actorId: user.id,
    actorName: user.displayName,
    actorRole: user.roles[0],
    action: AUDIT_ACTIONS.loginSuccess,
    targetType: 'auth',
    targetId: user.id,
    ip: req.ip,
  });
  return json({ ...session, user: { ...session.user, studentId: students[0]?.id } });
}

export default endpoint(
  async (req) => {
    const action = req.query.action ?? '';
    if (req.method === 'POST' && action === 'login') return handleLogin(req);
    if (req.method === 'POST' && action === 'session') return handleFirebaseSession(req);
    if (req.method === 'POST' && action === 'logout') {
      const auth = await requireAuth(req);
      await writeAudit({
        schoolId: auth.schoolId,
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        actorRole: auth.roles[0],
        action: AUDIT_ACTIONS.logout,
        targetType: 'auth',
        targetId: auth.user.id,
        ip: req.ip,
      });
      return json({ ok: true });
    }
    if (req.method === 'GET' && action === 'me') {
      const auth = await authenticate(req);
      return json({ user: await sessionUserFromAuth(auth), mode: dataDriver() });
    }
    if (req.method === 'GET' && action === 'demo-accounts') {
      if (dataDriver() !== 'demo') return json({ accounts: [] });
      const store = await getStore();
      const users = await store.query<User>('users', {
        where: [
          { field: 'deletedAt', op: '==', value: null },
          { field: 'email', op: 'in', value: DEMO_ACCOUNTS.map((a) => a.email) },
        ],
        limit: 20,
      });
      return json({
        accounts: DEMO_ACCOUNTS.map((account) => ({
          ...account,
          available: users.some((u) => u.email === account.email && u.active),
        })),
        note: 'Akun DEMO. Password demo hanya untuk lingkungan demonstrasi, tidak pernah dibuat otomatis pada mode produksi.',
      });
    }
    if (req.method === 'GET' && action === 'users-options') {
      // Daftar pengguna ringkas untuk keperluan administrator (tanpa hash).
      const auth = await requireAuth(req, { permission: 'user.manage' });
      const store = await getStore();
      const rows = await store.query<User>('users', {
        where: [
          { field: 'schoolId', op: '==', value: auth.schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 200,
      });
      return json({
        users: rows.map((u) => ({
          id: u.id,
          email: u.email,
          displayName: u.displayName,
          roles: u.roles,
          active: u.active,
        })),
      });
    }
    throw errors.validation('Aksi autentikasi tidak dikenal.');
  },
  { allowMethods: ['GET', 'POST'] },
);
