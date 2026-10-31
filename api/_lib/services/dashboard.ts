import type {
  AuditLog,
  DashboardStats,
  ExamSchedule,
  ExamSession,
  QuotaSnapshot,
  Role,
  Student,
  Teacher,
  User,
} from '../../../src/shared/types';
import { jakartaDateKey } from '../../../src/shared/time';
import { localSnapshot, quotaWarning } from '../quota';
import { getStore } from '../store';
import type { AuthContext } from '../auth';
import { listSessionsForProctor } from './sessions';
import { listStudentExams } from './attempts';

export async function quotaSnapshot(): Promise<QuotaSnapshot> {
  const store = await getStore();
  const date = jakartaDateKey();
  const stored = await store.getDoc<{ id: string; reads: number; writes: number; deletes: number }>(
    'quotaCounters',
    date,
  );
  const local = localSnapshot(stored ? { reads: stored.reads, writes: stored.writes, deletes: stored.deletes } : undefined);
  return {
    date,
    reads: local.reads,
    writes: local.writes,
    deletes: local.deletes,
    estimated: true,
    warning: quotaWarning(local.reads, local.writes),
    limits: local.limits,
  };
}

async function upcomingSchedules(schoolId: string, limit = 6, subjectIds?: string[]): Promise<ExamSchedule[]> {
  const store = await getStore();
  const today = jakartaDateKey();
  const rows = await store.query<ExamSchedule>('examSchedules', {
    where: [{ field: 'schoolId', op: '==', value: schoolId }],
    limit: 60,
  });
  return rows
    .filter((s) => s.status !== 'cancelled' && s.date >= today)
    .filter((s) => (subjectIds ? subjectIds.includes(s.subjectId) : true))
    .sort((a, b) => `${a.date}${a.startTime}`.localeCompare(`${b.date}${b.startTime}`))
    .slice(0, limit);
}

async function recentAudit(schoolId: string | null, limit = 6): Promise<AuditLog[]> {
  const store = await getStore();
  const rows = await store.query<AuditLog>('auditLogs', {
    where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
    limit: 200,
  });
  return rows.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1)).slice(0, limit);
}

function activityOf(logs: AuditLog[]) {
  return logs.map((l) => ({
    id: l.id,
    action: l.action,
    actor: l.actorName,
    at: l.createdAt,
    targetType: l.targetType,
  }));
}

export async function getDashboard(auth: AuthContext): Promise<DashboardStats> {
  const store = await getStore();
  const role: Role = auth.roles.includes('superadmin')
    ? 'superadmin'
    : auth.roles.includes('admin')
      ? 'admin'
      : auth.roles.includes('teacher')
        ? 'teacher'
        : auth.roles.includes('proctor')
          ? 'proctor'
          : 'student';
  const schoolId = auth.schoolId;
  const today = jakartaDateKey();
  const quota = await quotaSnapshot();

  if (role === 'student') {
    const exams = await listStudentExams(auth);
    const available = exams.filter(
      (e) => e.session.status === 'open' && e.participant.status === 'scheduled' && !e.attempt,
    );
    const finished = exams.filter((e) => e.attempt && e.attempt.status !== 'in_progress');
    return {
      role,
      cards: [
        { key: 'available', label: 'Ujian siap dikerjakan', value: String(available.length), hint: 'Sesi terbuka', tone: 'info' },
        { key: 'scheduled', label: 'Ujian terjadwal', value: String(exams.length), hint: 'Total penugasan', tone: 'navy' },
        { key: 'finished', label: 'Ujian selesai', value: String(finished.length), hint: 'Termasuk terkirim', tone: 'success' },
        { key: 'published', label: 'Hasil dipublikasikan', value: String(finished.filter((e) => e.resultPublished).length), tone: 'warning' },
      ],
      upcoming: exams
        .filter((e) => e.schedule.date >= today)
        .slice(0, 6)
        .map((e) => ({
          id: e.schedule.id,
          title: e.schedule.title,
          date: e.schedule.date,
          startTime: e.schedule.startTime,
          endTime: e.schedule.endTime,
          status: e.session.status,
          sessionCount: 1,
        })),
      activity: [],
      quota: undefined,
    };
  }

  if (role === 'proctor') {
    const sessions = await listSessionsForProctor(auth, { date: today });
    const totalParticipants = sessions.reduce((a, s) => a + s.counts.total, 0);
    const finished = sessions.reduce((a, s) => a + s.counts.finished + s.counts.submitted, 0);
    const logs = await recentAudit(schoolId);
    return {
      role,
      cards: [
        { key: 'sessions', label: 'Sesi hari ini', value: String(sessions.length), tone: 'navy' },
        { key: 'open', label: 'Sesi terbuka', value: String(sessions.filter((s) => s.session.status === 'open').length), tone: 'info' },
        { key: 'participants', label: 'Peserta terjadwal', value: String(totalParticipants), tone: 'navy' },
        { key: 'finished', label: 'Sudah selesai', value: String(finished), hint: 'Terkirim/terfinalisasi', tone: 'success' },
      ],
      upcoming: sessions.map((s) => ({
        id: s.session.id,
        title: `${s.schedule.title} — ${s.room.name}`,
        date: s.schedule.date,
        startTime: s.schedule.startTime,
        endTime: s.schedule.endTime,
        status: s.session.status,
        sessionCount: 1,
      })),
      activity: activityOf(logs),
      quota,
    };
  }

  if (role === 'teacher') {
    const teacher: Teacher | undefined = auth.teacher;
    const questions = await store.query<{ id: string; subjectId: string; status: string }>('questions', {
      where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
      limit: 2000,
    });
    const forms = await store.query<{ id: string; status: string; subjectId: string }>('examForms', {
      where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
      limit: 300,
    });
    const subjects = teacher?.subjectIds ?? [];
    const relevantQuestions = subjects.length
      ? questions.filter((q) => subjects.includes(q.subjectId))
      : questions;
    const schedules = await upcomingSchedules(schoolId ?? '', 8, subjects.length ? subjects : undefined);
    const logs = await recentAudit(schoolId);
    return {
      role,
      cards: [
        { key: 'questions', label: 'Soal diampu', value: String(relevantQuestions.length), tone: 'navy' },
        { key: 'ready', label: 'Soal siap pakai', value: String(relevantQuestions.filter((q) => q.status === 'ready').length), tone: 'success' },
        { key: 'forms', label: 'Paket ujian', value: String(forms.length), tone: 'info' },
        { key: 'schedules', label: 'Jadwal mendatang', value: String(schedules.length), tone: 'warning' },
      ],
      upcoming: schedules.map((s) => ({
        id: s.id,
        title: s.title,
        date: s.date,
        startTime: s.startTime,
        endTime: s.endTime,
        status: s.status,
        sessionCount: s.sessionCount,
      })),
      activity: activityOf(logs),
      quota,
    };
  }

  // admin & superadmin
  const [students, users, sessionsOpen, pendingGrading] = await Promise.all([
    store.count('students', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'deletedAt', op: '==', value: null },
      ],
    }),
    store.count('users', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'deletedAt', op: '==', value: null },
      ],
    }),
    store.count('examSessions', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'status', op: '==', value: 'open' },
      ],
    }),
    store.count('examResults', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'status', op: '==', value: 'pending_grading' },
      ],
    }),
  ]);
  const schedules = schoolId ? await upcomingSchedules(schoolId) : [];
  const logs = await recentAudit(schoolId);
  const schools = role === 'superadmin' ? await store.count('schools', { where: [{ field: 'deletedAt', op: '==', value: null }] }) : null;
  const studentSamples = schoolId
    ? await store.query<Student>('students', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 1,
      })
    : [];
  void studentSamples;
  const activeUsers = await store.query<User>('users', {
    where: [
      ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
      { field: 'active', op: '==', value: true },
      { field: 'deletedAt', op: '==', value: null },
    ],
    limit: 2000,
  });
  const openSessions = await store.query<ExamSession>('examSessions', {
    where: [
      ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
      { field: 'status', op: '==', value: 'open' },
    ],
    limit: 20,
  });
  return {
    role,
    cards: [
      { key: 'students', label: 'Siswa aktif', value: String(students), tone: 'navy' },
      { key: 'users', label: 'Akun aktif', value: String(activeUsers.length), hint: `${users} total akun`, tone: 'info' },
      { key: 'sessions', label: 'Sesi terbuka', value: String(sessionsOpen), hint: openSessions.map((s) => s.code).join(', ') || '—', tone: 'warning' },
      { key: 'pending', label: 'Hasil menunggu penilaian', value: String(pendingGrading), tone: pendingGrading > 0 ? 'danger' : 'success' },
      ...(schools !== null
        ? [{ key: 'schools', label: 'Sekolah terdaftar', value: String(schools), tone: 'navy' }]
        : []),
    ],
    upcoming: schedules.map((s) => ({
      id: s.id,
      title: s.title,
      date: s.date,
      startTime: s.startTime,
      endTime: s.endTime,
      status: s.status,
      sessionCount: s.sessionCount,
    })),
    activity: activityOf(logs),
    quota,
  };
}
