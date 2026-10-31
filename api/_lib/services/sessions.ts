import type {
  ClassRoom,
  ExamAttempt,
  ExamParticipant,
  ExamResult,
  ExamRoom,
  ExamSchedule,
  ExamSession,
  ExamType,
  School,
  Subject,
  IncidentReport,
} from '../../../src/shared/types';
import { hasPermission } from '../../../src/shared/permissions';
import { formatDateId, jakartaDateKey, minutesBetween } from '../../../src/shared/time';
import { AUDIT_ACTIONS, writeAudit } from '../audit';
import { serverNow, serverNowIso } from '../clock';
import { ApiError, errors } from '../errors';
import { newId } from '../ids';
import { getStore } from '../store';
import type { AuthContext } from '../auth';
import { assertCanManageSession } from './tokens';
import { attemptIdFor, finalizeAttempt } from './attempts';

export interface SessionSummary {
  session: ExamSession;
  schedule: { id: string; title: string; date: string; startTime: string; endTime: string; formVersionId: string };
  room: { id: string; name: string };
  proctor: { id: string; fullName: string };
  subjectName: string;
  scheduleStatus: string;
  counts: {
    scheduled: number;
    inProgress: number;
    awaitingSubmit: number;
    submitted: number;
    finished: number;
    absent: number;
    total: number;
  };
  activeStartToken?: { id: string; expiresAt: string; revokedAt: string | null } | null;
  activeSubmitToken?: { id: string; expiresAt: string; revokedAt: string | null } | null;
}

async function buildSessionSummary(session: ExamSession): Promise<SessionSummary | null> {
  const store = await getStore();
  const [schedule, room, proctor, participants] = await Promise.all([
    store.getDoc<ExamSchedule>('examSchedules', session.scheduleId),
    store.getDoc<ExamRoom>('rooms', session.roomId),
    store.getDoc<{ id: string; fullName: string }>('proctors', session.proctorId),
    store.query<ExamParticipant>('examParticipants', {
      where: [{ field: 'sessionId', op: '==', value: session.id }],
      limit: 200,
    }),
  ]);
  if (!schedule) return null;
  const subject = await store.getDoc<Subject>('subjects', schedule.subjectId);
  const counts = {
    scheduled: participants.filter((p) => p.status === 'scheduled').length,
    inProgress: participants.filter((p) => p.status === 'in_progress').length,
    awaitingSubmit: participants.filter((p) => p.status === 'awaiting_submit').length,
    submitted: participants.filter((p) => p.status === 'submitted').length,
    finished: participants.filter((p) => p.status === 'finished').length,
    absent: participants.filter((p) => p.attendance === 'absent').length,
    total: participants.length,
  };
  return {
    session,
    schedule: {
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      formVersionId: schedule.formVersionId,
    },
    room: { id: room?.id ?? session.roomId, name: room?.name ?? 'Ruang' },
    proctor: { id: proctor?.id ?? session.proctorId, fullName: proctor?.fullName ?? 'Pengawas' },
    subjectName: subject?.name ?? '',
    scheduleStatus: schedule.status,
    counts,
    activeStartToken: session.startTokenId ? await tokenBrief(session.startTokenId) : null,
    activeSubmitToken: session.submitTokenId ? await tokenBrief(session.submitTokenId) : null,
  };
}

async function tokenBrief(id: string) {
  const store = await getStore();
  const token = await store.getDoc<{
    id: string;
    kind: string;
    expiresAt: string;
    revokedAt: string | null;
    issuedAt: string;
    uses: number;
  }>('examTokens', id);
  if (!token) return null;
  return { id: token.id, expiresAt: token.expiresAt, revokedAt: token.revokedAt };
}

export async function listSessionsForProctor(
  auth: AuthContext,
  options: { date?: string; all?: boolean } = {},
): Promise<SessionSummary[]> {
  if (!hasPermission(auth.roles, 'session.open') && !auth.roles.includes('proctor')) {
    throw errors.forbidden();
  }
  const store = await getStore();
  const date = options.date ?? jakartaDateKey();
  const where = [{ field: 'schoolId', op: '==', value: auth.schoolId }] as {
    field: string;
    op: '==';
    value: unknown;
  }[];
  if (auth.roles.includes('proctor') && !auth.roles.includes('admin') && !auth.roles.includes('superadmin')) {
    if (!auth.proctor) throw errors.forbidden('Profil proktor tidak ditemukan.');
    where.push({ field: 'proctorId', op: '==', value: auth.proctor.id });
  }
  const sessions = await store.query<ExamSession>('examSessions', {
    where,
    limit: options.all ? 100 : 50,
  });
  const summaries = await Promise.all(sessions.map(buildSessionSummary));
  const filtered = summaries.filter((s): s is SessionSummary => Boolean(s));
  if (options.all) return filtered;
  return filtered.filter((s) => s.schedule.date === date || s.session.status === 'open');
}

export async function getSessionSummary(auth: AuthContext, sessionId: string): Promise<SessionSummary> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && session.schoolId !== auth.schoolId) throw errors.forbidden();
  if (auth.roles.includes('proctor') && !hasPermission(auth.roles, 'schedule.manage')) {
    assertCanManageSession(auth, session);
  }
  const summary = await buildSessionSummary(session);
  if (!summary) throw errors.notFound('Jadwal sesi tidak ditemukan.');
  return summary;
}

export async function openSession(
  auth: AuthContext,
  sessionId: string,
  ip?: string,
): Promise<SessionSummary> {
  if (!hasPermission(auth.roles, 'session.open')) throw errors.forbidden();
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  assertCanManageSession(auth, session);
  if (session.status === 'open') return getSessionSummary(auth, session.id);
  if (session.status === 'closed') {
    throw new ApiError('SESSION_CLOSED', 'Sesi sudah ditutup dan tidak dapat dibuka kembali.', 409);
  }
  const now = serverNow();
  const startsAt = new Date(session.startsAt);
  const endsAt = new Date(session.endsAt);
  const isAdmin = auth.roles.includes('admin') || auth.roles.includes('superadmin');
  if (!isAdmin) {
    if (now.getTime() < startsAt.getTime() - 60 * 60_000) {
      throw new ApiError('SESSION_NOT_OPEN', 'Sesi belum dapat dibuka (lebih dari 60 menit sebelum jadwal).', 409);
    }
    if (now.getTime() > endsAt.getTime()) {
      throw new ApiError('SESSION_CLOSED', 'Jadwal sesi sudah berakhir.', 409);
    }
  }
  const openedAt = serverNowIso();
  await store.update<ExamSession>('examSessions', session.id, {
    status: 'open',
    openedAt,
    openedBy: auth.user.id,
    closedAt: null,
  });
  const schedule = await store.getDoc<ExamSchedule>('examSchedules', session.scheduleId);
  if (schedule && schedule.status !== 'completed') {
    await store.update<ExamSchedule>('examSchedules', schedule.id, { status: 'ongoing' });
  }
  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.sessionOpen,
    targetType: 'examSessions',
    targetId: session.id,
    meta: { scheduleId: session.scheduleId, roomId: session.roomId, openedAt },
    ip,
  });
  return getSessionSummary(auth, session.id);
}

export async function closeSession(
  auth: AuthContext,
  sessionId: string,
  ip?: string,
): Promise<{ summary: SessionSummary; autoSubmitted: number; published: number }> {
  if (!hasPermission(auth.roles, 'session.open')) throw errors.forbidden();
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  assertCanManageSession(auth, session);
  if (session.status === 'closed') {
    return { summary: await getSessionSummary(auth, session.id), autoSubmitted: 0, published: 0 };
  }
  const attempts = await store.query<ExamAttempt>('examAttempts', {
    where: [
      { field: 'sessionId', op: '==', value: session.id },
      { field: 'status', op: '==', value: 'in_progress' },
    ],
    limit: 300,
  });
  let autoSubmitted = 0;
  for (const attempt of attempts) {
    try {
      await finalizeAttempt(attempt, { reason: 'proctor', autoSubmitted: true, actorId: auth.user.id });
      autoSubmitted += 1;
    } catch (err) {
      console.error('[neotest] gagal finalisasi attempt saat tutup sesi', attempt.id, err);
    }
  }
  await store.update<ExamSession>('examSessions', session.id, {
    status: 'closed',
    closedAt: serverNowIso(),
  });
  const published = await publishResultsForSession(session.id, auth.user.id);

  const sessions = await store.query<ExamSession>('examSessions', {
    where: [{ field: 'scheduleId', op: '==', value: session.scheduleId }],
    limit: 50,
  });
  if (sessions.every((s) => s.status === 'closed' || s.id === session.id)) {
    await store.update<ExamSchedule>('examSchedules', session.scheduleId, { status: 'completed' });
  }
  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.sessionClose,
    targetType: 'examSessions',
    targetId: session.id,
    meta: { autoSubmitted, published },
    ip,
  });
  return { summary: await getSessionSummary(auth, session.id), autoSubmitted, published };
}

export async function publishResultsForSession(sessionId: string, actorId: string): Promise<number> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) return 0;
  const schedule = await store.getDoc<ExamSchedule>('examSchedules', session.scheduleId);
  if (!schedule) return 0;
  const examType = await store.getDoc<ExamType>('examTypes', schedule.examTypeId);
  if (!examType || examType.resultPublish !== 'after_session') return 0;
  const results = await store.query<ExamResult>('examResults', {
    where: [
      { field: 'sessionId', op: '==', value: sessionId },
      { field: 'status', op: '==', value: 'final' },
    ],
    limit: 300,
  });
  let count = 0;
  const publishedAt = serverNowIso();
  for (const result of results) {
    await store.update<ExamResult>('examResults', result.id, {
      status: 'published',
      publishedAt,
      gradedBy: result.gradedBy ?? actorId,
    });
    const attempt = await store.getDoc<ExamAttempt>(
      'examAttempts',
      attemptIdFor(result.scheduleId, result.studentId),
    );
    if (attempt) {
      await store.update<ExamAttempt>('examAttempts', attempt.id, { resultStatus: 'published' });
    }
    const participants = await store.query<ExamParticipant>('examParticipants', {
      where: [
        { field: 'scheduleId', op: '==', value: result.scheduleId },
        { field: 'studentId', op: '==', value: result.studentId },
      ],
      limit: 1,
    });
    if (participants[0]) {
      await store.update<ExamParticipant>('examParticipants', participants[0].id, { status: 'finished' });
    }
    count += 1;
  }
  return count;
}

export async function listSessionParticipants(
  auth: AuthContext,
  sessionId: string,
  filters: { classId?: string; status?: string; search?: string } = {},
): Promise<{
  session: ExamSession;
  participants: (ExamParticipant & {
    className: string;
    attemptId: string | null;
    attemptStatus: string | null;
    startedAt: string | null;
    submittedAt: string | null;
    score: number | null;
    lastSavedAt: string | null;
  })[];
}> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && session.schoolId !== auth.schoolId) throw errors.forbidden();
  if (auth.roles.includes('proctor') && !hasPermission(auth.roles, 'schedule.manage')) {
    assertCanManageSession(auth, session);
  } else if (!hasPermission(auth.roles, 'session.open') && !hasPermission(auth.roles, 'result.read')) {
    throw errors.forbidden();
  }

  const participants = await store.query<ExamParticipant>('examParticipants', {
    where: [{ field: 'sessionId', op: '==', value: session.id }],
    limit: 200,
  });
  const classes = await store.query<ClassRoom>('classes', {
    where: [{ field: 'schoolId', op: '==', value: session.schoolId }],
    limit: 100,
  });
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const attempts = await store.query<ExamAttempt>('examAttempts', {
    where: [{ field: 'sessionId', op: '==', value: session.id }],
    limit: 300,
  });
  const attemptByStudent = new Map(attempts.map((a) => [a.studentId, a]));

  let rows = participants.map((p) => {
    const attempt = attemptByStudent.get(p.studentId);
    return {
      ...p,
      className: classMap.get(p.classId) ?? '-',
      attemptId: attempt?.id ?? null,
      attemptStatus: attempt?.status ?? null,
      startedAt: attempt?.startedAt ?? p.startedAt ?? null,
      submittedAt: attempt?.submittedAt ?? p.submittedAt ?? null,
      score: typeof attempt?.score === 'number' ? attempt.score : null,
      lastSavedAt: attempt?.lastSavedAt ?? null,
    };
  });
  if (filters.classId) rows = rows.filter((r) => r.classId === filters.classId);
  if (filters.status) rows = rows.filter((r) => r.status === filters.status);
  if (filters.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r) => r.fullName.toLowerCase().includes(q) || r.participantNo.includes(q),
    );
  }
  rows.sort((a, b) => a.participantNo.localeCompare(b.participantNo));
  return { session, participants: rows };
}

export interface IncidentInput {
  sessionId: string;
  studentId?: string | null;
  type: IncidentReport['type'];
  description: string;
  action?: string;
}

export async function createIncident(
  auth: AuthContext,
  input: IncidentInput,
  ip?: string,
): Promise<IncidentReport> {
  if (!hasPermission(auth.roles, 'incident.manage')) throw errors.forbidden();
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', input.sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  assertCanManageSession(auth, session);
  const now = serverNowIso();
  const incident: IncidentReport = {
    id: newId('incident'),
    schoolId: session.schoolId,
    scheduleId: session.scheduleId,
    sessionId: session.id,
    roomId: session.roomId,
    proctorId: auth.proctor?.id ?? (auth.roles.includes('admin') ? '' : ''),
    studentId: input.studentId ?? null,
    type: input.type,
    description: input.description,
    action: input.action,
    createdAt: now,
    updatedAt: now,
  };
  await store.set('incidents', incident.id, incident);
  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.incidentCreate,
    targetType: 'incidents',
    targetId: incident.id,
    meta: { sessionId: session.id, type: incident.type },
    ip,
  });
  return incident;
}

export async function listIncidents(auth: AuthContext, sessionId: string): Promise<IncidentReport[]> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && session.schoolId !== auth.schoolId) throw errors.forbidden();
  if (auth.roles.includes('proctor') && !hasPermission(auth.roles, 'schedule.manage')) {
    assertCanManageSession(auth, session);
  }
  return store.query<IncidentReport>('incidents', {
    where: [{ field: 'sessionId', op: '==', value: sessionId }],
    orderBy: [{ field: 'createdAt', dir: 'desc' }],
    limit: 100,
  });
}

export async function moveParticipant(
  auth: AuthContext,
  input: { participantId: string; targetSessionId: string; reason: string },
  ip?: string,
): Promise<ExamParticipant> {
  if (!hasPermission(auth.roles, 'schedule.manage')) {
    throw errors.forbidden('Pemindahan ruang hanya dapat dilakukan administrator sekolah.');
  }
  const store = await getStore();
  const participant = await store.getDoc<ExamParticipant>('examParticipants', input.participantId);
  if (!participant) throw errors.notFound('Peserta tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && participant.schoolId !== auth.schoolId) throw errors.forbidden();
  if (participant.status !== 'scheduled' && participant.status !== 'in_progress') {
    throw errors.conflict('Peserta yang sudah submit tidak dapat dipindahkan.');
  }
  if (participant.status === 'in_progress') {
    throw errors.conflict(
      'Peserta sedang mengerjakan. Finalisasi pengerjaan terlebih dahulu sebelum memindahkan ruang.',
    );
  }
  const target = await store.getDoc<ExamSession>('examSessions', input.targetSessionId);
  if (!target) throw errors.notFound('Sesi tujuan tidak ditemukan.');
  if (target.schoolId !== participant.schoolId || target.scheduleId !== participant.scheduleId) {
    throw errors.validation('Sesi tujuan harus berada pada jadwal dan sekolah yang sama.');
  }
  if (target.status !== 'preparation' && target.status !== 'open') {
    throw errors.conflict('Sesi tujuan sudah ditutup.');
  }
  const updated = await store.update<ExamParticipant>('examParticipants', participant.id, {
    movedFrom: {
      roomId: participant.roomId,
      sessionId: participant.sessionId,
      at: serverNowIso(),
      by: auth.user.id,
    },
    sessionId: target.id,
    roomId: target.roomId,
    proctorId: target.proctorId,
    status: 'scheduled',
    startedAt: null,
  });
  await store.update<ExamSession>('examSessions', participant.sessionId, {
    participantCount: await store.count('examParticipants', {
      where: [{ field: 'sessionId', op: '==', value: participant.sessionId }],
    }),
  });
  await store.update<ExamSession>('examSessions', target.id, {
    participantCount: await store.count('examParticipants', {
      where: [{ field: 'sessionId', op: '==', value: target.id }],
    }),
  });
  await writeAudit({
    schoolId: participant.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.participantMove,
    targetType: 'examParticipants',
    targetId: participant.id,
    meta: {
      from: { sessionId: participant.sessionId, roomId: participant.roomId },
      to: { sessionId: target.id, roomId: target.roomId },
      reason: input.reason,
    },
    ip,
  });
  return updated;
}

/* ------------------------------------------------------------------ */
/* Dokumen cetak                                                       */
/* ------------------------------------------------------------------ */

export interface AttendanceDocument {
  school: School;
  schedule: {
    title: string;
    date: string;
    dateLabel: string;
    startTime: string;
    endTime: string;
    subjectName: string;
    academicYear: string;
  };
  session: { code: string; roomName: string; startsAt: string; endsAt: string; status: string };
  proctorName: string;
  participants: {
    participantNo: string;
    fullName: string;
    className: string;
    attendance: string;
    signature?: string;
  }[];
  printedAt: string;
  printedBy: string;
  generatedFrom: 'database';
}

export async function buildAttendanceDocument(
  auth: AuthContext,
  sessionId: string,
): Promise<AttendanceDocument> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && session.schoolId !== auth.schoolId) throw errors.forbidden();
  if (auth.roles.includes('proctor') && !hasPermission(auth.roles, 'schedule.manage')) {
    assertCanManageSession(auth, session);
  } else if (!hasPermission(auth.roles, 'report.print')) {
    throw errors.forbidden();
  }
  const [school, schedule, room, proctor] = await Promise.all([
    store.getDoc<School>('schools', session.schoolId),
    store.getDoc<ExamSchedule>('examSchedules', session.scheduleId),
    store.getDoc<ExamRoom>('rooms', session.roomId),
    store.getDoc<{ id: string; fullName: string }>('proctors', session.proctorId),
  ]);
  if (!school || !schedule) throw errors.notFound('Data sekolah/jadwal tidak ditemukan.');
  const subject = await store.getDoc<Subject>('subjects', schedule.subjectId);
  const academicYear = schedule.academicYearId
    ? await store.getDoc<{ id: string; year: string; semester: string }>(
        'academicYears',
        schedule.academicYearId,
      )
    : null;
  const classes = await store.query<ClassRoom>('classes', {
    where: [{ field: 'schoolId', op: '==', value: session.schoolId }],
    limit: 100,
  });
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const participants = await store.query<ExamParticipant>('examParticipants', {
    where: [{ field: 'sessionId', op: '==', value: session.id }],
    limit: 200,
  });
  participants.sort((a, b) => a.participantNo.localeCompare(b.participantNo));
  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.printDocument,
    targetType: 'examSessions',
    targetId: session.id,
    meta: { document: 'attendance' },
  });
  return {
    school,
    schedule: {
      title: schedule.title,
      date: schedule.date,
      dateLabel: formatDateId(schedule.date),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      subjectName: subject?.name ?? '',
      academicYear: academicYear ? `${academicYear.year} — ${academicYear.semester === 'ganjil' ? 'Ganjil' : 'Genap'}` : '',
    },
    session: {
      code: session.code,
      roomName: room?.name ?? '',
      startsAt: session.startsAt,
      endsAt: session.endsAt,
      status: session.status,
    },
    proctorName: proctor?.fullName ?? '',
    participants: participants.map((p) => ({
      participantNo: p.participantNo,
      fullName: p.fullName,
      className: classMap.get(p.classId) ?? '-',
      attendance:
        p.attendance === 'present' ? 'Hadir' : p.attendance === 'excused' ? 'Izin' : 'Tidak hadir',
    })),
    printedAt: serverNowIso(),
    printedBy: auth.user.displayName,
    generatedFrom: 'database',
  };
}

export interface BeritaAcaraDocument {
  school: School;
  schedule: { title: string; dateLabel: string; startTime: string; endTime: string; examTypeName: string };
  session: { code: string; roomName: string; status: string; openedAt: string | null; closedAt: string | null };
  proctorName: string;
  counts: { scheduled: number; present: number; absent: number; started: number; submitted: number };
  actual: { firstStartAt: string | null; lastSubmitAt: string | null; durationMinutes: number };
  incidents: IncidentReport[];
  notes: string;
  headmaster: { name: string; nip: string };
  printedAt: string;
  printedBy: string;
}

export async function buildBeritaAcara(
  auth: AuthContext,
  sessionId: string,
): Promise<BeritaAcaraDocument> {
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && session.schoolId !== auth.schoolId) throw errors.forbidden();
  if (auth.roles.includes('proctor') && !hasPermission(auth.roles, 'schedule.manage')) {
    assertCanManageSession(auth, session);
  } else if (!hasPermission(auth.roles, 'report.print')) {
    throw errors.forbidden();
  }
  const [school, schedule, room, proctor, incidents] = await Promise.all([
    store.getDoc<School>('schools', session.schoolId),
    store.getDoc<ExamSchedule>('examSchedules', session.scheduleId),
    store.getDoc<ExamRoom>('rooms', session.roomId),
    store.getDoc<{ id: string; fullName: string }>('proctors', session.proctorId),
    store.query<IncidentReport>('incidents', {
      where: [{ field: 'sessionId', op: '==', value: session.id }],
      orderBy: [{ field: 'createdAt', dir: 'asc' }],
      limit: 100,
    }),
  ]);
  if (!school || !schedule) throw errors.notFound('Data sekolah/jadwal tidak ditemukan.');
  const examType = await store.getDoc<ExamType>('examTypes', schedule.examTypeId);
  const participants = await store.query<ExamParticipant>('examParticipants', {
    where: [{ field: 'sessionId', op: '==', value: session.id }],
    limit: 200,
  });
  const attempts = await store.query<ExamAttempt>('examAttempts', {
    where: [{ field: 'sessionId', op: '==', value: session.id }],
    limit: 300,
  });
  const starts = attempts.map((a) => a.startedAt).filter(Boolean).sort();
  const submits = attempts.map((a) => a.submittedAt).filter((x): x is string => Boolean(x)).sort();
  const firstStartAt = starts[0] ?? null;
  const lastSubmitAt = submits[submits.length - 1] ?? null;
  await writeAudit({
    schoolId: session.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.printDocument,
    targetType: 'examSessions',
    targetId: session.id,
    meta: { document: 'berita-acara' },
  });
  return {
    school,
    schedule: {
      title: schedule.title,
      dateLabel: formatDateId(schedule.date),
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      examTypeName: examType?.name ?? '',
    },
    session: {
      code: session.code,
      roomName: room?.name ?? '',
      status: session.status,
      openedAt: session.openedAt ?? null,
      closedAt: session.closedAt ?? null,
    },
    proctorName: proctor?.fullName ?? '',
    counts: {
      scheduled: participants.length,
      present: participants.filter((p) => p.attendance === 'present').length,
      absent: participants.filter((p) => p.attendance === 'absent').length,
      started: attempts.length,
      submitted: attempts.filter((a) => a.status !== 'in_progress').length,
    },
    actual: {
      firstStartAt,
      lastSubmitAt,
      durationMinutes:
        firstStartAt && lastSubmitAt
          ? Math.round(minutesBetween(firstStartAt, lastSubmitAt))
          : 0,
    },
    incidents,
    notes:
      incidents.length === 0
        ? 'Pelaksanaan ujian berjalan lancar tanpa kejadian khusus.'
        : incidents.map((i) => `${i.description}${i.action ? ` Tindak lanjut: ${i.action}` : ''}`).join(' '),
    headmaster: {
      name: school.letterhead.headmasterName,
      nip: school.letterhead.headmasterNip,
    },
    printedAt: serverNowIso(),
    printedBy: auth.user.displayName,
  };
}


/**
 * Tandai kehadiran peserta. Proktor ruang boleh menandai peserta di sesinya;
 * admin dengan izin attendance.manage boleh menandai lintas sesi sekolahnya.
 */
export async function setParticipantAttendance(
  auth: AuthContext,
  input: { participantId: string; attendance: 'present' | 'absent' | 'excused' },
  ip?: string,
): Promise<ExamParticipant> {
  const store = await getStore();
  const participant = await store.getDoc<ExamParticipant>('examParticipants', input.participantId);
  if (!participant) throw errors.notFound('Peserta tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && participant.schoolId !== auth.schoolId) {
    throw errors.forbidden();
  }
  const session = await store.getDoc<ExamSession>('examSessions', participant.sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!hasPermission(auth.roles, 'attendance.manage')) {
    if (!auth.roles.includes('proctor')) throw errors.forbidden();
    assertCanManageSession(auth, session);
  }
  if (input.attendance === 'absent') {
    const attempts = await store.query<ExamAttempt>('examAttempts', {
      where: [{ field: 'participantId', op: '==', value: participant.id }],
      limit: 1,
    });
    if (attempts[0] && attempts[0].status === 'in_progress') {
      throw errors.conflict('Peserta sedang mengerjakan ujian dan tidak dapat ditandai tidak hadir.');
    }
  }
  const updated = await store.update<ExamParticipant>('examParticipants', participant.id, {
    attendance: input.attendance,
  });
  await writeAudit({
    schoolId: participant.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.attendanceMark,
    targetType: 'examParticipants',
    targetId: participant.id,
    meta: { attendance: input.attendance, sessionId: participant.sessionId },
    ip,
  });
  return updated;
}
