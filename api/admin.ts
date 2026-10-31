import { endpoint, json, type ApiRequest, type ApiResponse } from './_lib/http';
import { requireAuth, resolveSchoolId, type AuthContext } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore, dataDriver, resetDemoStore } from './_lib/store';
import {
  createRecord,
  listCollection,
  parseBody,
  parsePage,
  softDeleteRecord,
  updateRecord,
} from './_lib/rest';
import {
  academicYearSchema,
  classSchema,
  importStudentsSchema,
  roomSchema,
  schoolSchema,
  settingsSchema,
  studentSchema,
  subjectSchema,
  teacherSchema,
  proctorSchema,
  userCreateSchema,
} from '../src/shared/schemas';
import type {
  AcademicYear,
  ClassRoom,
  ExamRoom,
  ExamSchedule,
  Proctor,
  School,
  Student,
  Subject,
  Teacher,
  User,
  ExamAttempt,
  AuditLog,
  AppSettings,
} from '../src/shared/types';
import { AUDIT_ACTIONS, writeAudit } from './_lib/audit';
import { serverNowIso } from './_lib/clock';
import {
  createUserAccount,
  linkStudentToProfile,
  studentLoginEmail,
  updateUserRoles,
} from './_lib/services/accounts';
import { getDashboard, quotaSnapshot } from './_lib/services/dashboard';
import { hasPermission } from '../src/shared/permissions';
import { getSettingsForSchool } from './_lib/services/tokens';
import { publicUser } from './_lib/session';

function requireSuperadmin(auth: AuthContext): void {
  if (!auth.roles.includes('superadmin')) {
    throw errors.forbidden('Hanya super admin yang dapat melakukan tindakan ini.');
  }
}

async function uniqueOrThrow(
  collection: string,
  field: string,
  value: unknown,
  schoolId: string | null,
  extra: { ignoreId?: string; label: string },
): Promise<void> {
  const store = await getStore();
  const where = [{ field, op: '==', value }] as {
    field: string;
    op: '==';
    value: unknown;
  }[];
  if (schoolId) where.push({ field: 'schoolId', op: '==', value: schoolId });
  const rows = await store.query<{ id: string; deletedAt?: string | null }>(collection, { where, limit: 5 });
  const conflict = rows.find((r) => r.id !== extra.ignoreId && !r.deletedAt);
  if (conflict) throw errors.conflict(`${extra.label} sudah digunakan.`);
}

/* ------------------------------------------------------------------ */
/* Sekolah                                                             */
/* ------------------------------------------------------------------ */

async function listSchools(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  const { page, pageSize } = parsePage(req);
  if (!auth.roles.includes('superadmin')) {
    const store = await getStore();
    const own = auth.schoolId ? await store.getDoc<School>('schools', auth.schoolId) : null;
    return json({
      items: own ? [own] : [],
      total: own ? 1 : 0,
      page: 1,
      pageSize,
      hasMore: false,
    });
  }
  const result = await listCollection<School>({
    collection: 'schools',
    auth,
    schoolId: undefined,
    search: req.query.q,
    searchFields: ['name', 'code', 'npsn'],
    page,
    pageSize,
    orderBy: [{ field: 'name', dir: 'asc' }],
  });
  return json(result);
}

/* ------------------------------------------------------------------ */
/* Siswa                                                               */
/* ------------------------------------------------------------------ */

interface StudentCreateExtras {
  email?: string;
  password?: string;
}

async function createStudentForSchool(
  auth: AuthContext,
  payload: {
    schoolId: string;
    nisn: string;
    participantNo: string;
    fullName: string;
    gender: 'L' | 'P';
    classId: string;
    active: boolean;
    email?: string;
    password?: string;
  },
  ip?: string,
): Promise<{ student: Student; initialPassword: string | null; loginEmail: string }> {
  const store = await getStore();
  const school = await store.getDoc<School>('schools', payload.schoolId);
  if (!school) throw errors.notFound('Sekolah tidak ditemukan.');
  const classRoom = await store.getDoc<ClassRoom>('classes', payload.classId);
  if (!classRoom || classRoom.schoolId !== payload.schoolId) {
    throw errors.validation('Kelas tidak ditemukan pada sekolah ini.');
  }
  await uniqueOrThrow('students', 'nisn', payload.nisn, payload.schoolId, { label: 'NISN' });
  await uniqueOrThrow('students', 'participantNo', payload.participantNo, payload.schoolId, {
    label: 'Nomor peserta',
  });
  const loginEmail = payload.email?.trim().toLowerCase() || studentLoginEmail(school, payload.nisn);
  const account = await createUserAccount(auth, {
    schoolId: payload.schoolId,
    email: loginEmail,
    username: payload.nisn,
    displayName: payload.fullName,
    roles: ['student'],
    password: payload.password,
    active: payload.active,
    ip,
  });
  const student = await createRecord<Student>(
    'students',
    {
      schoolId: payload.schoolId,
      userId: account.user.id,
      nisn: payload.nisn,
      participantNo: payload.participantNo,
      fullName: payload.fullName,
      gender: payload.gender,
      classId: payload.classId,
      active: payload.active,
    },
    { searchFields: ['fullName', 'nisn', 'participantNo'] },
  );
  await linkStudentToProfile(account.user.id, student.id);
  return { student, initialPassword: account.initialPassword, loginEmail };
}

async function handleStudents(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET' && id) {
    const student = await store.getDoc<Student>('students', id);
    if (!student) throw errors.notFound('Siswa tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && student.schoolId !== auth.schoolId) throw errors.forbidden();
    return json({ doc: student });
  }
  if (req.method === 'GET' && req.query.format === 'csv') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, {
      require: !auth.roles.includes('superadmin'),
    });
    const rows = await store.query<Student>('students', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'deletedAt', op: '==', value: null },
      ],
      limit: 5000,
    });
    const classes = await store.query<ClassRoom>('classes', {
      where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
      limit: 500,
    });
    const className = new Map(classes.map((c) => [c.id, c.name]));
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const header = ['nisn', 'participantNo', 'fullName', 'gender', 'className', 'email', 'active'];
    const lines = [header.join(',')];
    for (const row of rows.sort((a, b) => a.participantNo.localeCompare(b.participantNo))) {
      const user = await store.getDoc<User>('users', row.userId);
      lines.push(
        [
          row.nisn,
          row.participantNo,
          row.fullName,
          row.gender,
          className.get(row.classId) ?? '',
          user?.email ?? '',
          row.active ? 'aktif' : 'nonaktif',
        ]
          .map(escape)
          .join(','),
      );
    }
    return {
      raw: `\uFEFF${lines.join('\r\n')}`,
      contentType: 'text/csv; charset=utf-8',
      headers: {
        'Content-Disposition': `attachment; filename="siswa-${schoolId ?? 'semua'}.csv"`,
      },
    };
  }
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, {
      require: !auth.roles.includes('superadmin'),
    });
    const { page, pageSize } = parsePage(req);
    const result = await listCollection<Student>({
      collection: 'students',
      auth,
      schoolId,
      search: req.query.q,
      searchFields: ['fullName', 'nisn', 'participantNo'],
      page,
      pageSize,
      orderBy: [{ field: 'participantNo', dir: 'asc' }],
      extraFilter: req.query.classId
        ? (doc) => doc.classId === req.query.classId
        : req.query.active
          ? (doc) => String(doc.active) === req.query.active
          : undefined,
    });
    return json(result);
  }
  if (req.method === 'POST') {
    const body = await parseBody(studentSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId) ?? body.schoolId;
    const extra = (req.body as StudentCreateExtras) ?? {};
    const created = await createStudentForSchool(auth, { ...body, schoolId, ...extra }, req.ip);
    return json(created, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Student>('students', id);
    if (!existing) throw errors.notFound('Siswa tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const body = await parseBody(studentSchema.partial(), req.body);
    if (body.nisn) {
      await uniqueOrThrow('students', 'nisn', body.nisn, existing.schoolId, { ignoreId: id, label: 'NISN' });
    }
    if (body.participantNo) {
      await uniqueOrThrow('students', 'participantNo', body.participantNo, existing.schoolId, {
        ignoreId: id,
        label: 'Nomor peserta',
      });
    }
    if (body.classId) {
      const cls = await store.getDoc<ClassRoom>('classes', body.classId);
      if (!cls || cls.schoolId !== existing.schoolId) throw errors.validation('Kelas tidak valid.');
    }
    const updated = await updateRecord<Student>('students', id, { ...body }, {
      searchFields: ['fullName', 'nisn', 'participantNo'],
    });
    if (body.fullName || body.active !== undefined) {
      await store.update<User>('users', existing.userId, {
        ...(body.fullName ? { displayName: body.fullName } : {}),
        ...(body.active !== undefined ? { active: body.active } : {}),
      });
    }
    return json({ doc: updated });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Student>('students', id);
    if (!existing) throw errors.notFound('Siswa tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const activeAttempts = await store.query<ExamAttempt>('examAttempts', {
      where: [
        { field: 'studentId', op: '==', value: id },
        { field: 'status', op: '==', value: 'in_progress' },
      ],
      limit: 1,
    });
    if (activeAttempts.length > 0) {
      throw errors.conflict('Siswa sedang mengerjakan ujian; data tidak dapat dihapus.');
    }
    await softDeleteRecord('students', id);
    await store.update<User>('users', existing.userId, { active: false, deletedAt: serverNowIso() });
    await writeAudit({
      schoolId: existing.schoolId,
      actorId: auth.user.id,
      actorName: auth.user.displayName,
      actorRole: auth.roles[0],
      action: AUDIT_ACTIONS.userDelete,
      targetType: 'students',
      targetId: id,
      ip: req.ip,
    });
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

/* ------------------------------------------------------------------ */
/* Impor siswa                                                          */
/* ------------------------------------------------------------------ */

async function handleImportStudents(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  if (req.method !== 'POST') throw errors.validation('Gunakan POST untuk impor.');
  if (auth.roles.includes('student')) throw errors.forbidden();
  if (!auth.roles.includes('admin') && !auth.roles.includes('superadmin') && !auth.roles.includes('teacher')) {
    throw errors.forbidden();
  }
  const body = await parseBody(importStudentsSchema, req.body);
  const schoolId = resolveSchoolId(auth, body.schoolId) ?? body.schoolId;
  const store = await getStore();
  const classes = await store.query<ClassRoom>('classes', {
    where: [{ field: 'schoolId', op: '==', value: schoolId }],
    limit: 200,
  });
  const classByName = new Map(classes.map((c) => [c.name.toLowerCase(), c]));
  const existing = await store.query<Student>('students', {
    where: [
      { field: 'schoolId', op: '==', value: schoolId },
      { field: 'deletedAt', op: '==', value: null },
    ],
    limit: 2000,
  });
  const existingNisn = new Set(existing.map((s) => s.nisn));
  const existingParticipant = new Set(existing.map((s) => s.participantNo));
  const seenNisn = new Set<string>();
  const seenParticipant = new Set<string>();

  const errorsList: { row: number; field: string; message: string }[] = [];
  const valid: {
    row: number;
    nisn: string;
    participantNo: string;
    fullName: string;
    gender: 'L' | 'P';
    classId: string;
    email?: string;
  }[] = [];

  body.rows.forEach((row, index) => {
    const rowNo = index + 2;
    const problems: string[] = [];
    if (!/^\d{6,12}$/.test(row.nisn)) problems.push('NISN harus 6–12 digit angka.');
    if (!row.participantNo) problems.push('Nomor peserta wajib diisi.');
    if (row.fullName.trim().length < 2) problems.push('Nama minimal 2 karakter.');
    if (!['L', 'P', 'l', 'p'].includes(row.gender)) problems.push('Jenis kelamin harus L atau P.');
    const cls = classByName.get(row.className.toLowerCase().trim());
    if (!cls) problems.push(`Kelas "${row.className}" tidak ditemukan.`);
    if (existingNisn.has(row.nisn)) problems.push('NISN sudah terdaftar di sekolah ini.');
    if (existingParticipant.has(row.participantNo)) problems.push('Nomor peserta sudah digunakan.');
    if (seenNisn.has(row.nisn)) problems.push('NISN duplikat di dalam file.');
    if (seenParticipant.has(row.participantNo)) problems.push('Nomor peserta duplikat di dalam file.');
    seenNisn.add(row.nisn);
    seenParticipant.add(row.participantNo);
    if (problems.length > 0) {
      for (const message of problems) errorsList.push({ row: rowNo, field: 'baris', message });
      return;
    }
    valid.push({
      row: rowNo,
      nisn: row.nisn,
      participantNo: row.participantNo,
      fullName: row.fullName.trim(),
      gender: row.gender.toUpperCase() as 'L' | 'P',
      classId: cls!.id,
      email: row.email?.trim() || undefined,
    });
  });

  if (body.dryRun) {
    return json({
      dryRun: true,
      validated: valid.length,
      invalid: body.rows.length - valid.length,
      errors: errorsList,
      preview: valid.slice(0, 20),
    });
  }

  if (valid.length > 200) {
    throw errors.validation(
      'Maksimal 200 baris per permintaan impor. Pecah file menjadi beberapa bagian.',
    );
  }
  if (errorsList.length > 0) {
    throw errors.validation('Perbaiki baris yang bermasalah sebelum mengimpor.', errorsList);
  }

  const credentials: { name: string; email: string; password: string | null; nisn: string }[] = [];
  for (const row of valid) {
    const created = await createStudentForSchool(
      auth,
      {
        schoolId,
        nisn: row.nisn,
        participantNo: row.participantNo,
        fullName: row.fullName,
        gender: row.gender,
        classId: row.classId,
        active: true,
        email: row.email,
      },
      req.ip,
    );
    credentials.push({
      name: row.fullName,
      email: created.loginEmail,
      password: created.initialPassword,
      nisn: row.nisn,
    });
  }
  await writeAudit({
    schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.studentImport,
    targetType: 'students',
    targetId: schoolId ?? '',
    meta: { imported: credentials.length },
    ip: req.ip,
  });
  return json({ imported: credentials.length, credentials, note: 'Password hanya ditampilkan sekali. Simpan dan distribusikan dengan aman.' });
}

/* ------------------------------------------------------------------ */
/* Guru & proktor                                                      */
/* ------------------------------------------------------------------ */

async function handleTeachers(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    if (req.query.options === '1') {
      const rows = await store.query<Teacher>('teachers', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 300,
      });
      return json({ items: rows.map((t) => ({ id: t.id, name: t.fullName, userId: t.userId })) });
    }
    const { page, pageSize } = parsePage(req);
    return json(
      await listCollection<Teacher>({
        collection: 'teachers',
        auth,
        schoolId,
        search: req.query.q,
        searchFields: ['fullName', 'nip', 'email'],
        page,
        pageSize,
        orderBy: [{ field: 'fullName', dir: 'asc' }],
      }),
    );
  }
  if (req.method === 'POST') {
    const body = await parseBody(teacherSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    const password = (req.body as { password?: string }).password;
    const account = await createUserAccount(auth, {
      schoolId,
      email: body.email,
      displayName: body.fullName,
      roles: ['teacher'],
      password,
      ip: req.ip,
    });
    const teacher = await createRecord<Teacher>('teachers', {
      ...body,
      schoolId,
      userId: account.user.id,
    }, { searchFields: ['fullName', 'nip', 'email'] });
    return json({ doc: teacher, initialPassword: account.initialPassword }, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Teacher>('teachers', id);
    if (!existing) throw errors.notFound('Guru tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const body = await parseBody(teacherSchema.partial(), req.body);
    const updated = await updateRecord<Teacher>('teachers', id, { ...body }, {
      searchFields: ['fullName', 'nip', 'email'],
    });
    if (body.fullName) {
      await store.update<User>('users', existing.userId, { displayName: body.fullName });
    }
    return json({ doc: updated });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Teacher>('teachers', id);
    if (!existing) throw errors.notFound('Guru tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    await softDeleteRecord('teachers', id);
    await store.update<User>('users', existing.userId, { active: false, deletedAt: serverNowIso() });
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

async function handleProctors(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    if (req.query.options === '1') {
      const rows = await store.query<Proctor>('proctors', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 300,
      });
      return json({ items: rows.map((p) => ({ id: p.id, name: p.fullName, roomIds: p.roomIds })) });
    }
    const { page, pageSize } = parsePage(req);
    return json(
      await listCollection<Proctor>({
        collection: 'proctors',
        auth,
        schoolId,
        search: req.query.q,
        searchFields: ['fullName', 'nip', 'email'],
        page,
        pageSize,
        orderBy: [{ field: 'fullName', dir: 'asc' }],
      }),
    );
  }
  if (req.method === 'POST') {
    const body = await parseBody(proctorSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    const password = (req.body as { password?: string }).password;
    const account = await createUserAccount(auth, {
      schoolId,
      email: body.email,
      displayName: body.fullName,
      roles: ['proctor'],
      password,
      ip: req.ip,
    });
    const proctor = await createRecord<Proctor>('proctors', {
      ...body,
      schoolId,
      userId: account.user.id,
    }, { searchFields: ['fullName', 'nip', 'email'] });
    return json({ doc: proctor, initialPassword: account.initialPassword }, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Proctor>('proctors', id);
    if (!existing) throw errors.notFound('Proktor tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const body = await parseBody(proctorSchema.partial(), req.body);
    const updated = await updateRecord<Proctor>('proctors', id, { ...body }, {
      searchFields: ['fullName', 'nip', 'email'],
    });
    if (body.fullName) {
      await store.update<User>('users', existing.userId, { displayName: body.fullName });
    }
    return json({ doc: updated });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Proctor>('proctors', id);
    if (!existing) throw errors.notFound('Proktor tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    await softDeleteRecord('proctors', id);
    await store.update<User>('users', existing.userId, { active: false, deletedAt: serverNowIso() });
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

/* ------------------------------------------------------------------ */
/* Akun pengguna                                                       */
/* ------------------------------------------------------------------ */

async function handleUsers(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const { page, pageSize } = parsePage(req);
    const roleFilter = req.query.role;
    const result = await listCollection<User>({
      collection: 'users',
      auth,
      schoolId,
      search: req.query.q,
      searchFields: ['displayName', 'email', 'username'],
      page,
      pageSize,
      orderBy: [{ field: 'displayName', dir: 'asc' }],
      extraFilter: roleFilter ? (doc) => (doc.roles as string[] | undefined)?.includes(roleFilter) ?? false : undefined,
    });
    return json({ ...result, items: result.items.map((u) => publicUser(u)) });
  }
  if (req.method === 'POST') {
    if (!auth.roles.includes('admin') && !auth.roles.includes('superadmin')) throw errors.forbidden();
    const body = await parseBody(userCreateSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    if (body.roles.some((r) => r === 'superadmin' || r === 'admin')) {
      requireSuperadmin(auth);
    }
    if (body.roles.includes('student')) {
      throw errors.validation('Akun siswa dibuat melalui modul Data Siswa.');
    }
    const account = await createUserAccount(auth, {
      schoolId,
      email: body.email,
      username: body.username,
      displayName: body.displayName,
      roles: body.roles,
      password: body.password,
      phone: body.phone,
      active: body.active,
      ip: req.ip,
    });
    return json({ doc: publicUser(account.user), initialPassword: account.initialPassword }, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<User>('users', id);
    if (!existing) throw errors.notFound('Pengguna tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const raw = (req.body ?? {}) as { displayName?: string; active?: boolean; roles?: string[]; phone?: string };
    if (raw.roles) {
      await updateUserRoles(auth, id, raw.roles as User['roles'], req.ip);
    }
    if (raw.displayName !== undefined && raw.displayName.trim().length < 2) {
      throw errors.validation('Nama minimal 2 karakter.');
    }
    if (existing.id === auth.user.id && raw.active === false) {
      throw errors.validation('Anda tidak dapat menonaktifkan akun sendiri.');
    }
    const updated = await store.update<User>('users', id, {
      ...(raw.displayName ? { displayName: raw.displayName.trim() } : {}),
      ...(raw.active !== undefined ? { active: raw.active } : {}),
      ...(raw.phone !== undefined ? { phone: raw.phone } : {}),
      updatedAt: serverNowIso(),
    });
    return json({ doc: publicUser(updated) });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    if (id === auth.user.id) throw errors.validation('Anda tidak dapat menghapus akun sendiri.');
    const existing = await store.getDoc<User>('users', id);
    if (!existing) throw errors.notFound('Pengguna tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    if (existing.roles.includes('superadmin')) {
      requireSuperadmin(auth);
      const supers = await store.query<User>('users', {
        where: [
          { field: 'roles', op: 'array-contains', value: 'superadmin' },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 10,
      });
      if (supers.length <= 1) throw errors.conflict('Harus tersisa minimal satu super admin.');
    }
    await softDeleteRecord('users', id);
    await store.update<User>('users', id, { active: false });
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

/* ------------------------------------------------------------------ */
/* Router                                                              */
/* ------------------------------------------------------------------ */

function requirePerm(auth: AuthContext, permission: Parameters<typeof hasPermission>[1]): void {
  if (!hasPermission(auth.roles, permission)) throw errors.forbidden();
}

export default endpoint(async (req) => {
  const resource = req.query.resource ?? '';
  const auth = await requireAuth(req);
  const studentOnly = auth.roles.every((r) => r === 'student');
  if (studentOnly && !['dashboard', 'options'].includes(resource)) {
    throw errors.forbidden('Siswa tidak memiliki akses ke modul administrasi.');
  }
  if (resource === 'students') requirePerm(auth, 'student.manage');
  if (resource === 'teachers' || resource === 'proctors') requirePerm(auth, 'user.manage');
  if (resource === 'academic-years') {
    requirePerm(auth, req.method === 'GET' ? 'school.read' : 'school.manage');
  }
  if (resource === 'classes') {
    requirePerm(auth, req.method === 'GET' ? 'school.read' : 'class.manage');
  }
  if (resource === 'subjects') {
    requirePerm(auth, req.method === 'GET' ? 'school.read' : 'subject.manage');
  }
  if (resource === 'rooms') {
    requirePerm(auth, req.method === 'GET' ? 'school.read' : 'schedule.manage');
  }
  if (resource === 'settings') requirePerm(auth, 'settings.manage');
  if (resource === 'import-students') requirePerm(auth, 'student.import');

  if (resource === 'dashboard' && req.method === 'GET') {
    return json(await getDashboard(auth));
  }

  if (resource === 'quota' && req.method === 'GET') {
    if (!auth.roles.some((r) => r === 'admin' || r === 'superadmin')) throw errors.forbidden();
    const snapshot = await quotaSnapshot();
    const settings = await getSettingsForSchool(auth.schoolId);
    const thresholds = settings?.quota ?? { enabled: true, dailyReadWarning: 40_000, dailyWriteWarning: 16_000 };
    return json({ snapshot, thresholds, note: 'Perkiraan internal NeoTest, bukan metrik resmi Firebase. Cek Firebase Console untuk angka resmi.' });
  }

  if (resource === 'options' && req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const store = await getStore();
    const [classes, subjects, years, rooms, proctors, teachers, schools] = await Promise.all([
      store.query<ClassRoom>('classes', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 200,
      }),
      store.query<Subject>('subjects', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 200,
      }),
      store.query<AcademicYear>('academicYears', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 100,
      }),
      store.query<ExamRoom>('rooms', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 100,
      }),
      store.query<Proctor>('proctors', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 200,
      }),
      store.query<Teacher>('teachers', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 300,
      }),
      auth.roles.includes('superadmin')
        ? store.query<School>('schools', {
            where: [{ field: 'deletedAt', op: '==', value: null }],
            limit: 200,
          })
        : Promise.resolve([]),
    ]);
    return json({
      schoolId,
      classes: classes.map((c) => ({ id: c.id, name: c.name, level: c.level, academicYearId: c.academicYearId })),
      subjects: subjects.map((s) => ({ id: s.id, name: s.name, code: s.code })),
      academicYears: years.map((y) => ({ id: y.id, year: y.year, semester: y.semester, active: y.active })),
      rooms: rooms.map((r) => ({ id: r.id, name: r.name, capacity: r.capacity })),
      proctors: proctors.map((p) => ({ id: p.id, name: p.fullName, roomIds: p.roomIds })),
      teachers: teachers.map((t) => ({ id: t.id, name: t.fullName })),
      schools: schools.map((s) => ({ id: s.id, name: s.name, code: s.code })),
    });
  }

  if (resource === 'schools') {
    if (req.method === 'GET' && req.query.id) {
      const store = await getStore();
      const school = await store.getDoc<School>('schools', req.query.id);
      if (!school) throw errors.notFound('Sekolah tidak ditemukan.');
      if (!auth.roles.includes('superadmin') && school.id !== auth.schoolId) throw errors.forbidden();
      return json({ doc: school });
    }
    if (req.method === 'GET') return listSchools(auth, req);
    if (req.method === 'POST') {
      requireSuperadmin(auth);
      const body = await parseBody(schoolSchema, req.body);
      await uniqueOrThrow('schools', 'code', body.code, null, { label: 'Kode sekolah' });
      await uniqueOrThrow('schools', 'npsn', body.npsn, null, { label: 'NPSN' });
      const doc = await createRecord<School>('schools', { ...body }, {
        searchFields: ['name', 'code', 'npsn'],
      });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) throw errors.validation('id wajib disertakan.');
      const store = await getStore();
      const existing = await store.getDoc<School>('schools', id);
      if (!existing) throw errors.notFound('Sekolah tidak ditemukan.');
      if (!auth.roles.includes('superadmin') && existing.id !== auth.schoolId) throw errors.forbidden();
      const body = await parseBody(schoolSchema.partial(), req.body);
      if (!auth.roles.includes('superadmin')) {
        delete body.code;
        delete body.npsn;
        delete body.active;
      }
      if (body.code) await uniqueOrThrow('schools', 'code', body.code, null, { ignoreId: id, label: 'Kode sekolah' });
      if (body.npsn) await uniqueOrThrow('schools', 'npsn', body.npsn, null, { ignoreId: id, label: 'NPSN' });
      const doc = await updateRecord<School>('schools', id, { ...body }, {
        searchFields: ['name', 'code', 'npsn'],
      });
      await writeAudit({
        schoolId: id,
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        actorRole: auth.roles[0],
        action: AUDIT_ACTIONS.settingsChange,
        targetType: 'schools',
        targetId: id,
        ip: req.ip,
      });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      requireSuperadmin(auth);
      const id = req.query.id;
      if (!id) throw errors.validation('id wajib disertakan.');
      const store = await getStore();
      const ongoing = await store.query<ExamSchedule>('examSchedules', {
        where: [
          { field: 'schoolId', op: '==', value: id },
          { field: 'status', op: '==', value: 'ongoing' },
        ],
        limit: 1,
      });
      if (ongoing.length > 0) throw errors.conflict('Sekolah memiliki ujian berlangsung.');
      await softDeleteRecord('schools', id);
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung untuk sekolah.');
  }

  if (resource === 'academic-years') {
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<AcademicYear>({
          collection: 'academicYears',
          auth,
          schoolId,
          page,
          pageSize,
          orderBy: [{ field: 'year', dir: 'desc' }],
        }),
      );
    }
    if (req.method === 'POST') {
      const body = await parseBody(academicYearSchema, req.body);
      const schoolId = resolveSchoolId(auth, body.schoolId) ?? body.schoolId;
      const dup = await getStore();
      const same = await dup.query<AcademicYear>('academicYears', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'year', op: '==', value: body.year },
          { field: 'semester', op: '==', value: body.semester },
        ],
        limit: 1,
      });
      if (same.length > 0) throw errors.conflict('Tahun ajaran dan semester tersebut sudah ada.');
      if (body.active) await deactivateOthers('academicYears', schoolId, '');
      const doc = await createRecord<AcademicYear>('academicYears', { ...body, schoolId });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const id = req.query.id;
      if (!id) throw errors.validation('id wajib disertakan.');
      const body = await parseBody(academicYearSchema.partial(), req.body);
      const store = await getStore();
      const existing = await store.getDoc<AcademicYear>('academicYears', id);
      if (!existing) throw errors.notFound('Tahun ajaran tidak ditemukan.');
      if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
      if (body.active) await deactivateOthers('academicYears', existing.schoolId, id);
      const doc = await updateRecord<AcademicYear>('academicYears', id, { ...body });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      await softDeleteRecord('academicYears', req.query.id ?? '');
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'classes') {
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<ClassRoom>({
          collection: 'classes',
          auth,
          schoolId,
          search: req.query.q,
          searchFields: ['name'],
          page,
          pageSize,
          orderBy: [{ field: 'name', dir: 'asc' }],
          extraFilter: req.query.academicYearId
            ? (doc) => doc.academicYearId === req.query.academicYearId
            : undefined,
        }),
      );
    }
    if (req.method === 'POST') {
      const body = await parseBody(classSchema, req.body);
      const schoolId = resolveSchoolId(auth, body.schoolId);
      const store = await getStore();
      const dup = await store.query<ClassRoom>('classes', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'academicYearId', op: '==', value: body.academicYearId },
          { field: 'name', op: '==', value: body.name },
        ],
        limit: 1,
      });
      if (dup.length > 0) throw errors.conflict('Nama kelas sudah ada pada tahun ajaran ini.');
      const doc = await createRecord<ClassRoom>('classes', { ...body, schoolId }, {
        searchFields: ['name'],
      });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const id = req.query.id ?? '';
      const store = await getStore();
      const existing = await store.getDoc<ClassRoom>('classes', id);
      if (!existing) throw errors.notFound('Kelas tidak ditemukan.');
      if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
      const body = await parseBody(classSchema.partial(), req.body);
      const doc = await updateRecord<ClassRoom>('classes', id, { ...body }, { searchFields: ['name'] });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      const id = req.query.id ?? '';
      const store = await getStore();
      const existing = await store.getDoc<ClassRoom>('classes', id);
      if (!existing) throw errors.notFound('Kelas tidak ditemukan.');
      const students = await store.count('students', {
        where: [
          { field: 'classId', op: '==', value: id },
          { field: 'deletedAt', op: '==', value: null },
        ],
      });
      if (students > 0) throw errors.conflict(`Kelas masih memiliki ${students} siswa aktif.`);
      await softDeleteRecord('classes', id);
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'subjects') {
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<Subject>({
          collection: 'subjects',
          auth,
          schoolId,
          search: req.query.q,
          searchFields: ['name', 'code'],
          page,
          pageSize,
          orderBy: [{ field: 'name', dir: 'asc' }],
        }),
      );
    }
    if (req.method === 'POST') {
      const body = await parseBody(subjectSchema, req.body);
      const schoolId = resolveSchoolId(auth, body.schoolId);
      await uniqueOrThrow('subjects', 'code', body.code, schoolId, { label: 'Kode mata pelajaran' });
      const doc = await createRecord<Subject>('subjects', { ...body, schoolId }, {
        searchFields: ['name', 'code'],
      });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const id = req.query.id ?? '';
      const body = await parseBody(subjectSchema.partial(), req.body);
      const doc = await updateRecord<Subject>('subjects', id, { ...body }, { searchFields: ['name', 'code'] });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      await softDeleteRecord('subjects', req.query.id ?? '');
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'rooms') {
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<ExamRoom>({
          collection: 'rooms',
          auth,
          schoolId,
          search: req.query.q,
          searchFields: ['name'],
          page,
          pageSize,
          orderBy: [{ field: 'name', dir: 'asc' }],
        }),
      );
    }
    if (req.method === 'POST') {
      const body = await parseBody(roomSchema, req.body);
      const schoolId = resolveSchoolId(auth, body.schoolId);
      await uniqueOrThrow('rooms', 'name', body.name, schoolId, { label: 'Nama ruang' });
      const doc = await createRecord<ExamRoom>('rooms', { ...body, schoolId }, { searchFields: ['name'] });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const body = await parseBody(roomSchema.partial(), req.body);
      const doc = await updateRecord<ExamRoom>('rooms', req.query.id ?? '', { ...body }, {
        searchFields: ['name'],
      });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      const id = req.query.id ?? '';
      const store = await getStore();
      const used = await store.count('examSessions', {
        where: [{ field: 'roomId', op: '==', value: id }],
      });
      if (used > 0) throw errors.conflict('Ruang sudah dipakai pada sesi ujian dan tidak dapat dihapus.');
      await softDeleteRecord('rooms', id);
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'students') return handleStudents(auth, req);
  if (resource === 'teachers') return handleTeachers(auth, req);
  if (resource === 'proctors') return handleProctors(auth, req);
  if (resource === 'users') {
    if (!auth.roles.includes('admin') && !auth.roles.includes('superadmin')) {
      throw errors.forbidden();
    }
    return handleUsers(auth, req);
  }
  if (resource === 'import-students') return handleImportStudents(auth, req);

  if (resource === 'settings') {
    const store = await getStore();
    const schoolId = resolveSchoolId(auth, req.query.schoolId, {
      require: !auth.roles.includes('superadmin'),
    });
    const id = `settings_${schoolId ?? 'global'}`;
    if (req.method === 'GET') {
      const doc = await store.getDoc<AppSettings>('appSettings', id);
      return json({ doc });
    }
    if (req.method === 'PATCH') {
      const body = await parseBody(settingsSchema, req.body);
      const existing = await store.getDoc<AppSettings>('appSettings', id);
      const next: AppSettings = {
        id,
        schoolId: schoolId ?? null,
        branding: body.branding ?? existing?.branding ?? {
          appName: 'NeoTest',
          tagline: 'Powered by Pakkar',
          primaryColor: '#0f2a54',
        },
        security: body.security ?? existing?.security ?? {
          maxFailedLogin: 10,
          tokenTtlDefaultMinutes: 120,
          submitTokenTtlMinutes: 30,
          allowStudentIpLock: false,
        },
        quota: body.quota ?? existing?.quota ?? {
          enabled: true,
          dailyReadWarning: 40_000,
          dailyWriteWarning: 16_000,
        },
      };
      await store.set('appSettings', id, next as unknown as AppSettings & { deletedAt: null });
      await writeAudit({
        schoolId,
        actorId: auth.user.id,
        actorName: auth.user.displayName,
        actorRole: auth.roles[0],
        action: AUDIT_ACTIONS.settingsChange,
        targetType: 'appSettings',
        targetId: id,
        ip: req.ip,
      });
      return json({ doc: next });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'audit') {
    if (!auth.roles.includes('superadmin') && !auth.roles.includes('admin')) throw errors.forbidden();
    const { page, pageSize } = parsePage(req);
    const result = await listCollection<AuditLog>({
      collection: 'auditLogs',
      auth,
      schoolId: auth.roles.includes('superadmin') ? null : auth.schoolId,
      page,
      pageSize,
      includeDeleted: true,
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      extraFilter:
        req.query.action || req.query.actor
          ? (doc) =>
              (!req.query.action || String(doc.action).includes(req.query.action)) &&
              (!req.query.actor ||
                String(doc.actorName ?? '').toLowerCase().includes(req.query.actor.toLowerCase()))
          : undefined,
    });
    return json(result);
  }

  if (resource === 'reset-demo' && req.method === 'POST') {
    requireSuperadmin(auth);
    if (dataDriver() !== 'demo') {
      throw errors.conflict('Reset hanya tersedia pada mode demo.');
    }
    await resetDemoStore();
    await writeAudit({
      schoolId: null,
      actorId: auth.user.id,
      actorName: auth.user.displayName,
      actorRole: auth.roles[0],
      action: AUDIT_ACTIONS.demoReset,
      targetType: 'demoMeta',
      targetId: 'info',
      ip: req.ip,
    });
    return json({ ok: true, message: 'Data demo dibangun ulang.' });
  }

  if (resource === 'grading-queue' && req.method === 'GET') {
    if (!auth.roles.some((r) => r === 'admin' || r === 'teacher' || r === 'superadmin')) {
      throw errors.forbidden();
    }
    const store = await getStore();
    const results = await store.query<{ id: string; scheduleId: string; studentId: string; status: string; schoolId: string; essayPending: number }>(
      'examResults',
      {
        where: [
          { field: 'schoolId', op: '==', value: auth.schoolId },
          { field: 'status', op: '==', value: 'pending_grading' },
        ],
        limit: 200,
      },
    );
    const enriched = [];
    for (const result of results) {
      const [schedule, student] = await Promise.all([
        store.getDoc<ExamSchedule>('examSchedules', result.scheduleId),
        store.getDoc<Student>('students', result.studentId),
      ]);
      enriched.push({
        ...result,
        attemptId: `att__${result.scheduleId}__${result.studentId}`,
        scheduleTitle: schedule?.title ?? '',
        scheduleDate: schedule?.date ?? '',
        studentName: student?.fullName ?? '',
        participantNo: student?.participantNo ?? '',
      });
    }
    return json({ items: enriched, total: enriched.length });
  }

  throw errors.validation(`Resource admin "${resource}" tidak dikenal.`);
});

async function deactivateOthers(collection: string, schoolId: string, keepId: string): Promise<void> {
  const store = await getStore();
  const rows = await store.query<{ id: string; active: boolean }>(collection, {
    where: [
      { field: 'schoolId', op: '==', value: schoolId },
      { field: 'active', op: '==', value: true },
    ],
    limit: 100,
  });
  for (const row of rows) {
    if (row.id !== keepId) {
      await store.update(collection, row.id, { active: false, updatedAt: serverNowIso() } as never);
    }
  }
}
