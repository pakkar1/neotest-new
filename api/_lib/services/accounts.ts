import type { Role, School, User } from '../../../src/shared/types';
import { AUDIT_ACTIONS, writeAudit } from '../audit';
import { serverNowIso } from '../clock';
import { errors } from '../errors';
import { newId, searchKeyOf } from '../ids';
import { generatePassword, hashPassword } from '../password';
import { getStore, dataDriver } from '../store';
import type { AuthContext } from '../auth';

/**
 * Profil ringkas untuk Firebase Security Rules. Hanya dibuat/diubah server.
 * ID dokumen = UID Firebase Auth.
 */
export async function syncUserProfile(
  user: User,
  studentId?: string,
): Promise<void> {
  if (!user.uid) return;
  const store = await getStore();
  await store.set('userProfiles', user.uid, {
    id: user.uid,
    uid: user.uid,
    userId: user.id,
    schoolId: user.schoolId,
    roles: user.roles,
    studentId: studentId ?? null,
    active: user.active,
    updatedAt: serverNowIso(),
  } as never);
}

export async function linkStudentToProfile(userId: string, studentId: string): Promise<void> {
  const store = await getStore();
  const user = await store.getDoc<User>('users', userId);
  if (!user?.uid) return;
  await store.update('userProfiles', user.uid, { studentId, updatedAt: serverNowIso() } as never);
}

export interface AccountInput {
  schoolId: string | null;
  email: string;
  username?: string;
  displayName: string;
  roles: Role[];
  password?: string;
  phone?: string;
  active?: boolean;
  ip?: string;
}

async function findEmailConflict(email: string, ignoreUserId?: string): Promise<User | null> {
  const store = await getStore();
  const rows = await store.query<User>('users', {
    where: [{ field: 'email', op: '==', value: email.toLowerCase() }],
    limit: 5,
  });
  return rows.find((u) => u.id !== ignoreUserId) ?? null;
}

export async function createUserAccount(
  auth: AuthContext,
  input: AccountInput,
): Promise<{ user: User; initialPassword: string | null }> {
  const store = await getStore();
  const email = input.email.trim().toLowerCase();
  const conflict = await findEmailConflict(email);
  if (conflict) throw errors.conflict('Email sudah digunakan akun lain.');
  if (input.username) {
    const rows = await store.query<User>('users', {
      where: [{ field: 'username', op: '==', value: input.username }],
      limit: 5,
    });
    if (rows.length > 0) throw errors.conflict('Username sudah digunakan.');
  }

  const generated = input.password ? null : generatePassword();
  const password = input.password ?? generated!;
  const mode = dataDriver();
  let uid: string | undefined;

  if (mode === 'firebase') {
    try {
      const { getAuth } = await import('firebase-admin/auth');
      const record = await getAuth().createUser({
        email,
        password,
        displayName: input.displayName,
        disabled: input.active === false,
      });
      uid = record.uid;
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Gagal membuat akun Firebase.';
      throw errors.conflict(`Firebase Auth menolak pembuatan akun: ${message}`);
    }
  }

  const now = serverNowIso();
  const user: User = {
    id: newId('user'),
    uid,
    email,
    username: input.username,
    displayName: input.displayName,
    roles: input.roles,
    schoolId: input.schoolId,
    active: input.active !== false,
    phone: input.phone,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    ...(mode === 'demo' ? { passwordHash: hashPassword(password) } : {}),
  };
  const doc = { ...user, searchKey: searchKeyOf(user.displayName, user.email, user.username ?? '') };
  await store.set('users', user.id, doc);
  await syncUserProfile(user);
  await writeAudit({
    schoolId: input.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.userCreate,
    targetType: 'users',
    targetId: user.id,
    meta: { email, roles: input.roles },
    ip: input.ip,
  });
  return { user, initialPassword: generated };
}

export async function updateUserRoles(
  auth: AuthContext,
  userId: string,
  roles: Role[],
  ip?: string,
): Promise<User> {
  const store = await getStore();
  const target = await store.getDoc<User>('users', userId);
  if (!target) throw errors.notFound('Pengguna tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && auth.roles.includes('admin')) {
    const elevated = roles.some((r) => r === 'admin' || r === 'superadmin');
    const wasElevated = target.roles.some((r) => r === 'admin' || r === 'superadmin');
    if (elevated || wasElevated) {
      throw errors.forbidden('Hanya super admin yang dapat mengubah peran administrator.');
    }
    if (!target.schoolId || target.schoolId !== auth.schoolId) throw errors.forbidden();
  } else if (!auth.roles.includes('superadmin')) {
    throw errors.forbidden();
  }
  if (auth.user.id === target.id && !roles.includes('superadmin')) {
    throw errors.validation('Anda tidak dapat menurunkan peran akun sendiri.');
  }
  const updated = await store.update<User>('users', userId, { roles, updatedAt: serverNowIso() });
  await syncUserProfile(updated);
  await writeAudit({
    schoolId: target.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.roleChange,
    targetType: 'users',
    targetId: userId,
    meta: { from: target.roles, to: roles },
    ip,
  });
  return updated;
}

export function studentLoginEmail(school: School | null, nisn: string): string {
  const code = (school?.code ?? 'sekolah').toLowerCase().replace(/[^a-z0-9]/g, '');
  return `${code}.${nisn}@siswa.neotest.id`;
}
