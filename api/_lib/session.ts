import type { AuthContext } from './auth';
import type { AuthSession, School, SessionUser, Student } from '../../src/shared/types';
import { getStore } from './store';
import { signSession } from './auth';
import type { User } from '../../src/shared/types';

export async function buildSessionUser(
  user: User,
  student?: Student,
): Promise<SessionUser> {
  const store = await getStore();
  const school = user.schoolId ? await store.getDoc<School>('schools', user.schoolId) : null;
  return {
    id: user.id,
    uid: user.uid,
    email: user.email,
    displayName: user.displayName,
    roles: user.roles,
    schoolId: user.schoolId,
    schoolName: school?.name,
    studentId: student?.id,
    participantNo: student?.participantNo,
    classId: student?.classId,
  };
}

export async function issueAuthSession(
  user: User,
  mode: 'demo' | 'firebase',
): Promise<AuthSession> {
  const { token, expiresAt } = signSession(user.id, mode);
  return {
    user: await buildSessionUser(user),
    mode,
    token,
    expiresAt,
  };
}

export function sessionUserFromAuth(auth: AuthContext): Promise<SessionUser> {
  return buildSessionUser(auth.user, auth.student);
}

/** Menghapus field sensitif sebelum data pengguna dikirim ke klien. */
export function publicUser<T extends { passwordHash?: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...rest } = user;
  void _passwordHash;
  return rest;
}
