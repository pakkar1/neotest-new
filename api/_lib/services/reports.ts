import type {
  ClassRoom,
  ExamParticipant,
  ExamResult,
  ExamSchedule,
  ExamSession,
  ExamType,
  Question,
  Subject,
  VersionQuestion,
} from '../../../src/shared/types';
import { hasPermission } from '../../../src/shared/permissions';
import {
  groupStats,
  mean,
  median,
  percentile,
  scoreDistribution,
  stdDev,
  type GroupStat,
  type ItemStat,
  type ScoreRow,
} from '../../../src/shared/stats';
import { round2 } from '../../../src/shared/answers';
import { errors } from '../errors';
import { getStore } from '../store';
import type { AuthContext } from '../auth';
import {
  cronbachFromAggregates,
  toItemStat,
  type ItemStatAggregate,
} from './itemStats';
import { attemptIdFor } from './attempts';

async function assertReportAccess(auth: AuthContext, schedule: ExamSchedule): Promise<void> {
  if (auth.roles.includes('superadmin')) return;
  if (auth.schoolId !== schedule.schoolId) throw errors.forbidden('Jadwal milik sekolah lain.');
  if (hasPermission(auth.roles, 'analysis.read')) {
    if (auth.roles.includes('teacher') && auth.teacher) {
      const allowedBySubject = auth.teacher.subjectIds.includes(schedule.subjectId);
      if (!allowedBySubject) {
        const store = await getStore();
        const classes = await store.query<ClassRoom>('classes', {
          where: [
            { field: 'schoolId', op: '==', value: schedule.schoolId },
            { field: 'homeroomTeacherId', op: '==', value: auth.teacher.id },
          ],
          limit: 50,
        });
        const homeroomClassIds = classes.map((c) => c.id);
        if (!schedule.classIds.some((id) => homeroomClassIds.includes(id))) {
          throw errors.forbidden('Hasil ujian ini di luar kewenangan Anda sebagai guru.');
        }
      }
    }
    return;
  }
  throw errors.forbidden();
}

export interface ResultTableRow {
  studentId: string;
  participantNo: string;
  fullName: string;
  className: string;
  sessionId: string;
  sessionCode: string;
  score: number;
  maxScore: number;
  percent: number;
  status: ExamResult['status'];
  submittedAt: string | null;
  durationSec: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  attendance: string;
}

export interface ExamResultsReport {
  schedule: {
    id: string;
    title: string;
    date: string;
    subjectName: string;
    examTypeName: string;
    assessmentType: string;
    passingScore: number;
    resultPublish: string;
    totalPoints: number;
  };
  summary: {
    scheduled: number;
    started: number;
    completed: number;
    absent: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    p25: number;
    p75: number;
    passRate: number | null;
    averageDurationMinutes: number;
    pendingGrading: number;
    answeredAverage: number;
    blankAverage: number;
  };
  distribution: { label: string; count: number }[];
  byClass: GroupStat[];
  bySession: GroupStat[];
  rows: ResultTableRow[];
  generatedAt: string;
}

export async function buildExamResultsReport(
  auth: AuthContext,
  scheduleId: string,
  filters: { classId?: string; sessionId?: string } = {},
): Promise<ExamResultsReport> {
  const store = await getStore();
  const schedule = await store.getDoc<ExamSchedule>('examSchedules', scheduleId);
  if (!schedule) throw errors.notFound('Jadwal ujian tidak ditemukan.');
  await assertReportAccess(auth, schedule);
  const [examType, subject, participants, sessions, classes] = await Promise.all([
    store.getDoc<ExamType>('examTypes', schedule.examTypeId),
    store.getDoc<Subject>('subjects', schedule.subjectId),
    store.query<ExamParticipant>('examParticipants', {
      where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
      limit: 1000,
    }),
    store.query<ExamSession>('examSessions', {
      where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
      limit: 50,
    }),
    store.query<ClassRoom>('classes', {
      where: [{ field: 'schoolId', op: '==', value: schedule.schoolId }],
      limit: 100,
    }),
  ]);
  const results = await store.query<ExamResult>('examResults', {
    where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
    limit: 1000,
  });
  const sessionMap = new Map(sessions.map((s) => [s.id, s]));
  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const resultByStudent = new Map(results.map((r) => [r.studentId, r]));

  let scoped = participants;
  if (filters.classId) scoped = scoped.filter((p) => p.classId === filters.classId);
  if (filters.sessionId) scoped = scoped.filter((p) => p.sessionId === filters.sessionId);

  const rows: ResultTableRow[] = [];
  for (const participant of scoped) {
    const result = resultByStudent.get(participant.studentId);
    if (!result) continue;
    rows.push({
      studentId: participant.studentId,
      participantNo: participant.participantNo,
      fullName: participant.fullName,
      className: classMap.get(participant.classId) ?? '-',
      sessionId: participant.sessionId,
      sessionCode: sessionMap.get(participant.sessionId)?.code ?? '-',
      score: result.score,
      maxScore: result.maxScore,
      percent: result.percent,
      status: result.status,
      submittedAt: result.submittedAt,
      durationSec: result.durationSec,
      correctCount: result.correctCount,
      wrongCount: result.wrongCount,
      blankCount: result.blankCount,
      attendance: participant.attendance,
    });
  }
  rows.sort((a, b) => a.participantNo.localeCompare(b.participantNo));

  const percents = rows.map((r) => r.percent);
  const passingScore = examType?.passingScore ?? 70;
  const classLabels = Object.fromEntries(classes.map((c) => [c.id, c.name]));
  const sessionLabels = Object.fromEntries(sessions.map((s) => [s.id, `Sesi ${s.code}`]));
  const scoreRows: ScoreRow[] = rows.map((r) => ({
    studentId: r.studentId,
    classId: scoped.find((p) => p.studentId === r.studentId)?.classId ?? '',
    sessionId: r.sessionId,
    score: r.score,
    maxScore: r.maxScore,
    percent: r.percent,
    status: r.status,
  }));

  const pendingGrading = results.filter((r) => r.status === 'pending_grading').length;

  return {
    schedule: {
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      subjectName: subject?.name ?? '',
      examTypeName: examType?.name ?? '',
      assessmentType: examType?.assessmentType ?? '',
      passingScore,
      resultPublish: examType?.resultPublish ?? 'after_session',
      totalPoints: rows[0]?.maxScore ?? 0,
    },
    summary: {
      scheduled: scoped.length,
      started: scoped.filter((p) => Boolean(p.startedAt)).length,
      completed: rows.length,
      absent: scoped.filter((p) => p.attendance === 'absent').length,
      mean: mean(percents),
      median: median(percents),
      min: percents.length ? round2(Math.min(...percents)) : 0,
      max: percents.length ? round2(Math.max(...percents)) : 0,
      stdDev: stdDev(percents),
      p25: percentile(percents, 25),
      p75: percentile(percents, 75),
      passRate:
        percents.length > 0
          ? round2((percents.filter((p) => p >= passingScore).length / percents.length) * 100)
          : null,
      averageDurationMinutes: rows.length
        ? round2(rows.reduce((a, r) => a + r.durationSec, 0) / rows.length / 60)
        : 0,
      pendingGrading,
      answeredAverage: rows.length
        ? round2(rows.reduce((a, r) => a + r.correctCount + r.wrongCount, 0) / rows.length)
        : 0,
      blankAverage: rows.length ? round2(rows.reduce((a, r) => a + r.blankCount, 0) / rows.length) : 0,
    },
    distribution: scoreDistribution(percents),
    byClass: groupStats(scoreRows, 'classId', classLabels, passingScore),
    bySession: groupStats(scoreRows, 'sessionId', sessionLabels, passingScore),
    rows,
    generatedAt: new Date().toISOString(),
  };
}

export interface ItemAnalysisRow extends ItemStat {
  order: number;
  preview: string;
  type: string;
  points: number;
  optionTexts: { id: string; text: string; count: number; percent: number }[];
}

export interface ItemAnalysisReport {
  schedule: { id: string; title: string; date: string; subjectName: string };
  respondents: number;
  reliability: { alpha: number | null; note: string; method: string };
  distribution: { label: string; count: number }[];
  rows: ItemAnalysisRow[];
  caveats: string[];
}

export async function buildItemAnalysis(
  auth: AuthContext,
  scheduleId: string,
): Promise<ItemAnalysisReport> {
  const store = await getStore();
  const schedule = await store.getDoc<ExamSchedule>('examSchedules', scheduleId);
  if (!schedule) throw errors.notFound('Jadwal tidak ditemukan.');
  await assertReportAccess(auth, schedule);
  const [subject, aggregates, versionQuestions, results] = await Promise.all([
    store.getDoc<Subject>('subjects', schedule.subjectId),
    store.query<ItemStatAggregate>('itemStats', {
      where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
      limit: 300,
    }),
    store.query<VersionQuestion>('versionQuestions', {
      where: [{ field: 'versionId', op: '==', value: schedule.formVersionId }],
      orderBy: [{ field: 'order', dir: 'asc' }],
      limit: 300,
    }),
    store.query<ExamResult>('examResults', {
      where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
      limit: 1000,
    }),
  ]);
  const respondentCount = results.length;
  const orderMap = new Map(versionQuestions.map((q) => [q.questionId, q]));
  const rows: ItemAnalysisRow[] = aggregates
    .map((agg) => {
      const stat = toItemStat(agg);
      const version = orderMap.get(agg.questionId);
      const textMap = new Map((version?.options ?? []).map((o) => [o.id, o.text]));
      return {
        ...stat,
        order: version?.order ?? 99,
        preview: stripPreview(version?.content ?? ''),
        type: agg.type,
        points: agg.points,
        optionTexts: stat.optionDistribution.map((d) => ({
          id: d.optionId,
          text: stripPreview(textMap.get(d.optionId) ?? d.optionId),
          count: d.count,
          percent: d.percent,
        })),
      };
    })
    .sort((a, b) => a.order - b.order);

  const reliability = cronbachFromAggregates(aggregates);

  const caveats = [
    'Tingkat kesukaran = proporsi peserta yang menjawab benar. Klasifikasi: mudah > 0.80, sulit < 0.30.',
    'Daya pembeda dihitung dengan korelasi point-biserial antara skor butir dan skor total.',
    'Nilai dengan sampel < 10 peserta tidak ditampilkan karena belum stabil.',
    'Soal uraian dan menjodohkan tidak dihitung dalam koefisien reliabilitas Alpha.',
    'Rekomendasi bersifat saran; NeoTest tidak menghapus soal secara otomatis.',
  ];

  return {
    schedule: {
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      subjectName: subject?.name ?? '',
    },
    respondents: respondentCount,
    reliability: {
      alpha: reliability.alpha,
      note: reliability.note,
      method: 'Cronbach’s Alpha (butir objektif)',
    },
    distribution: scoreDistribution(results.map((r) => r.percent)),
    rows,
    caveats,
  };
}

function stripPreview(html: string): string {
  return html
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160);
}

export function toCsv(headers: string[], rows: (string | number | null | undefined)[][]): string {
  const escape = (value: string | number | null | undefined): string => {
    const s = value === null || value === undefined ? '' : String(value);
    if (/[",\n;]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };
  return [headers.map(escape).join(';'), ...rows.map((r) => r.map(escape).join(';'))].join('\r\n');
}

export async function exportResultsCsv(
  auth: AuthContext,
  scheduleId: string,
): Promise<{ filename: string; csv: string }> {
  const report = await buildExamResultsReport(auth, scheduleId);
  const headers = [
    'No Peserta', 'Nama', 'Kelas', 'Sesi', 'Hadir', 'Status Hasil', 'Skor', 'Skor Maksimal',
    'Nilai', 'Benar', 'Salah', 'Kosong', 'Durasi (menit)', 'Waktu Submit',
  ];
  const rows = report.rows.map((r) => [
    r.participantNo,
    r.fullName,
    r.className,
    r.sessionCode,
    r.attendance === 'present' ? 'Hadir' : r.attendance === 'excused' ? 'Izin' : 'Tidak hadir',
    r.status === 'published' ? 'Dipublikasikan' : r.status === 'final' ? 'Final' : 'Menunggu penilaian',
    r.score,
    r.maxScore,
    r.percent,
    r.correctCount,
    r.wrongCount,
    r.blankCount,
    Math.round(r.durationSec / 60),
    r.submittedAt ? new Date(r.submittedAt).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' }) : '',
  ]);
  const filename = `hasil-${report.schedule.subjectName.replace(/\s+/g, '-').toLowerCase()}-${report.schedule.date}.csv`;
  return { filename, csv: toCsv(headers, rows) };
}

export interface StudentResultItem {
  result: ExamResult;
  schedule: { id: string; title: string; date: string; subjectName: string; examTypeName: string };
  attemptId: string;
  allowReview: boolean;
}

export async function listStudentResults(auth: AuthContext): Promise<StudentResultItem[]> {
  const store = await getStore();
  const studentId = auth.student?.id;
  if (!studentId) throw errors.forbidden('Profil peserta tidak ditemukan.');
  const results = await store.query<ExamResult>('examResults', {
    where: [
      { field: 'studentId', op: '==', value: studentId },
      { field: 'status', op: '==', value: 'published' },
    ],
    limit: 100,
  });
  const out: StudentResultItem[] = [];
  for (const result of results) {
    const schedule = await store.getDoc<ExamSchedule>('examSchedules', result.scheduleId);
    if (!schedule) continue;
    const [subject, examType] = await Promise.all([
      store.getDoc<Subject>('subjects', schedule.subjectId),
      store.getDoc<ExamType>('examTypes', schedule.examTypeId),
    ]);
    out.push({
      result,
      schedule: {
        id: schedule.id,
        title: schedule.title,
        date: schedule.date,
        subjectName: subject?.name ?? '',
        examTypeName: examType?.name ?? '',
      },
      attemptId: attemptIdFor(schedule.id, studentId),
      allowReview: Boolean(examType?.allowAnswerReview),
    });
  }
  return out.sort((a, b) => (a.schedule.date < b.schedule.date ? 1 : -1));
}

/** Soal bank untuk pratinjau admin/guru. */
export async function getQuestionPreview(auth: AuthContext, questionId: string): Promise<Question> {
  const store = await getStore();
  const question = await store.getDoc<Question>('questions', questionId);
  if (!question) throw errors.notFound('Soal tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && question.schoolId !== auth.schoolId) throw errors.forbidden();
  if (!hasPermission(auth.roles, 'question.read')) throw errors.forbidden();
  return question;
}
