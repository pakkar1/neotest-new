import type { Role } from './types';

/**
 * Matriks izin tingkat aplikasi. Ini hanya lapisan pertama pertahanan:
 * setiap endpoint API memeriksa ulang role + kepemilikan (schoolId, roomId,
 * sessionId, studentId) di sisi server. Firestore rules menjadi lapisan ketiga.
 */
export const PERMISSIONS = [
  'school.manage',
  'school.read',
  'user.manage',
  'student.manage',
  'student.import',
  'teacher.manage',
  'proctor.manage',
  'class.manage',
  'subject.manage',
  'question.manage',
  'question.read',
  'form.manage',
  'form.publish',
  'examtype.manage',
  'schedule.manage',
  'session.open',
  'token.issue',
  'token.revoke',
  'result.read',
  'result.grade',
  'result.publish',
  'analysis.read',
  'report.print',
  'incident.manage',
  'attendance.manage',
  'audit.read',
  'settings.manage',
  'exam.take',
  'demo.reset',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

const ADMIN: Permission[] = [
  'school.read',
  'school.manage',
  'user.manage',
  'student.manage',
  'student.import',
  'teacher.manage',
  'proctor.manage',
  'class.manage',
  'subject.manage',
  'question.manage',
  'question.read',
  'form.manage',
  'form.publish',
  'examtype.manage',
  'schedule.manage',
  'session.open',
  'token.issue',
  'token.revoke',
  'result.read',
  'result.grade',
  'result.publish',
  'analysis.read',
  'report.print',
  'incident.manage',
  'attendance.manage',
  'settings.manage',
  'audit.read',
];

const TEACHER: Permission[] = [
  'school.read',
  'question.manage',
  'question.read',
  'form.manage',
  'result.read',
  'result.grade',
  'analysis.read',
  'report.print',
  'student.manage',
];

const PROCTOR: Permission[] = [
  'school.read',
  'session.open',
  'token.issue',
  'token.revoke',
  'attendance.manage',
  'incident.manage',
  'report.print',
  'result.read',
  'question.read',
];

const STUDENT: Permission[] = ['exam.take', 'question.read'];

const SUPERADMIN: Permission[] = [
  ...ADMIN,
  'audit.read',
  'demo.reset',
  'user.manage',
];

export const ROLE_PERMISSIONS: Record<Role, ReadonlySet<Permission>> = {
  superadmin: new Set(SUPERADMIN),
  admin: new Set(ADMIN),
  teacher: new Set(TEACHER),
  proctor: new Set(PROCTOR),
  student: new Set(STUDENT),
};

export function hasPermission(roles: Role[], permission: Permission): boolean {
  return roles.some((r) => ROLE_PERMISSIONS[r]?.has(permission) ?? false);
}

export function isStaff(roles: Role[]): boolean {
  return roles.some((r) => r !== 'student');
}

/** Landing route untuk tiap role setelah login. */
export function homePathFor(roles: Role[]): string {
  if (roles.includes('superadmin')) return '/admin';
  if (roles.includes('admin')) return '/admin';
  if (roles.includes('teacher')) return '/guru';
  if (roles.includes('proctor')) return '/proktor';
  return '/siswa';
}
