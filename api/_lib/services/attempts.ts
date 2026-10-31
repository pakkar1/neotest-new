import type {
  AttemptReview,
  AttemptReviewQuestion,
  AttemptView,
  ExamAttempt,
  ExamFormVersion,
  ExamParticipant,
  ExamResult,
  ExamSchedule,
  ExamSession,
  ExamType,
  QuestionKey,
  ResponseValueDoc,
  StudentExamCard,
  Subject,
  VersionQuestion,
} from '../../../src/shared/types';
import { normalizeKey, round2, scoreObjective } from '../../../src/shared/answers';
import { addMinutes, minutesBetween } from '../../../src/shared/time';
import { hasPermission } from '../../../src/shared/permissions';
import { AUDIT_ACTIONS, writeAudit } from '../audit';
import { SAVE_GRACE_MS, serverNow, serverNowIso } from '../clock';
import { ApiError, errors } from '../errors';
import { compositeId } from '../ids';
import { getStore } from '../store';
import type { AuthContext } from '../auth';
import { requireStudent } from '../auth';
import { assertCanManageSession, assertMinimumSubmitTime, validateExamToken } from './tokens';
import { aggregateId, applyRow, emptyAggregate, type ItemStatAggregate } from './itemStats';

export function attemptIdFor(scheduleId: string, studentId: string): string {
  return compositeId('att', scheduleId, studentId);
}

export function resultIdFor(scheduleId: string, studentId: string): string {
  return compositeId('res', scheduleId, studentId);
}

function hashInt(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function deterministicOrder<T extends { id: string }>(items: T[], seed: string): T[] {
  return [...items].sort((a, b) => hashInt(`${seed}:${a.id}`) - hashInt(`${seed}:${b.id}`));
}

export async function loadVersionQuestions(versionId: string): Promise<VersionQuestion[]> {
  const store = await getStore();
  const rows = await store.query<VersionQuestion>('versionQuestions', {
    where: [
      { field: 'versionId', op: '==', value: versionId },
      { field: 'questionId', op: '!=', value: '\u0000' },
    ],
    orderBy: [{ field: 'order', dir: 'asc' }],
    limit: 300,
  });
  if (rows.length > 0) return rows;
  // Fallback tanpa orderBy (driver tertentu) — urutkan di memori.
  const fallback = await store.query<VersionQuestion>('versionQuestions', {
    where: [{ field: 'versionId', op: '==', value: versionId }],
    limit: 300,
  });
  return fallback.sort((a, b) => a.order - b.order);
}

async function loadKey(questionId: string): Promise<QuestionKey | null> {
  const store = await getStore();
  return store.getDoc<QuestionKey>('answerKeys', questionId);
}

export function presentationQuestions(
  questions: VersionQuestion[],
  attemptId: string,
  examType: Pick<ExamType, 'shuffleQuestions' | 'shuffleOptions'>,
): VersionQuestion[] {
  const ordered = examType.shuffleQuestions
    ? deterministicOrder(questions, `${attemptId}:q`)
    : [...questions].sort((a, b) => a.order - b.order);
  return ordered.map((q) => ({
    ...q,
    // Kontrak klien memakai id bank soal (questionId), bukan id baris versi.
    // Dengan begitu saveAnswer/response memakai kunci yang sama dengan kunci jawaban.
    id: q.questionId,
    options: examType.shuffleOptions ? deterministicOrder(q.options, `${attemptId}:${q.id}:o`) : q.options,
  }));
}

export async function loadAttemptView(attempt: ExamAttempt): Promise<AttemptView> {
  const store = await getStore();
  const [schedule, session, examType, formVersion] = await Promise.all([
    store.getDoc<ExamSchedule>('examSchedules', attempt.scheduleId),
    store.getDoc<ExamSession>('examSessions', attempt.sessionId),
    store.getDoc<ExamType>('examTypes', attempt.examTypeId),
    store.getDoc<ExamFormVersion>('examFormVersions', attempt.formVersionId),
  ]);
  if (!schedule || !session || !examType) throw errors.notFound('Data ujian tidak lengkap.');
  const [subject, room, proctor, participants, questions, responses] = await Promise.all([
    formVersion ? store.getDoc<Subject>('subjects', formVersion.subjectId) : Promise.resolve(null),
    store.getDoc<{ id: string; name: string }>('rooms', session.roomId),
    store.getDoc<{ id: string; fullName: string }>('proctors', session.proctorId),
    store.query<ExamParticipant>('examParticipants', {
      where: [
        { field: 'scheduleId', op: '==', value: attempt.scheduleId },
        { field: 'studentId', op: '==', value: attempt.studentId },
      ],
      limit: 1,
    }),
    loadVersionQuestions(attempt.formVersionId),
    store.query<ResponseValueDoc>('responses', {
      where: [{ field: 'attemptId', op: '==', value: attempt.id }],
      limit: 300,
    }),
  ]);
  const participant = participants[0];
  if (!participant) throw errors.notFound('Data peserta ujian tidak ditemukan.');
  const qs = presentationQuestions(questions, attempt.id, examType);
  return {
    attempt,
    participant,
    schedule: {
      id: schedule.id,
      title: schedule.title,
      date: schedule.date,
      startTime: schedule.startTime,
      endTime: schedule.endTime,
      durationMinutes: schedule.durationMinutes,
    },
    session: {
      id: session.id,
      code: session.code,
      roomName: room?.name ?? 'Ruang',
      proctorName: proctor?.fullName ?? 'Pengawas',
    },
    examType: {
      id: examType.id,
      name: examType.name,
      navigation: examType.navigation,
      allowAnswerReview: examType.allowAnswerReview,
      minSubmitMinutes: examType.minSubmitMinutes,
      resultPublish: examType.resultPublish,
      shuffleQuestions: examType.shuffleQuestions,
      shuffleOptions: examType.shuffleOptions,
    },
    subjectName: subject?.name ?? 'Mata pelajaran',
    questions: qs,
    responses: responses.map((r) => ({
      questionId: r.questionId,
      value: r.value,
      flagged: Boolean(r.flagged),
      seq: r.seq,
      updatedAt: r.updatedAt,
    })),
    serverNow: serverNowIso(),
    remainingMs: Math.max(0, new Date(attempt.endsAt).getTime() - serverNow().getTime()),
    totalPoints: questions.reduce((a, q) => a + q.points, 0),
  };
}

export interface StartAttemptInput {
  scheduleId: string;
  sessionId: string;
  token: string;
}

export async function startAttempt(
  auth: AuthContext,
  input: StartAttemptInput,
  ip?: string,
): Promise<AttemptView> {
  const student = requireStudent(auth);
  const store = await getStore();
  const session = await store.getDoc<ExamSession>('examSessions', input.sessionId);
  if (!session) throw errors.notFound('Sesi ujian tidak ditemukan.');
  if (session.scheduleId !== input.scheduleId) {
    throw new ApiError('TOKEN_SCOPE_MISMATCH', 'Sesi bukan bagian dari jadwal ini.', 403);
  }
  const schedule = await store.getDoc<ExamSchedule>('examSchedules', input.scheduleId);
  if (!schedule) throw errors.notFound('Jadwal ujian tidak ditemukan.');
  if (schedule.status === 'cancelled') {
    throw new ApiError('EXAM_NOT_ACTIVE', 'Ujian dibatalkan.', 409);
  }
  if (session.status !== 'open') {
    throw new ApiError('SESSION_NOT_OPEN', 'Sesi belum dibuka oleh pengawas.', 409);
  }
  if (new Date(session.endsAt).getTime() <= Date.now()) {
    throw new ApiError('SESSION_CLOSED', 'Waktu sesi telah berakhir.', 409);
  }

  const participants = await store.query<ExamParticipant>('examParticipants', {
    where: [
      { field: 'scheduleId', op: '==', value: input.scheduleId },
      { field: 'studentId', op: '==', value: student.id },
    ],
    limit: 5,
  });
  const participant = participants.find((p) => p.sessionId === input.sessionId);
  if (!participant) {
    throw errors.forbidden('Anda tidak terdaftar sebagai peserta pada sesi ini.');
  }
  if (participant.attendance === 'absent') {
    throw errors.forbidden('Status kehadiran Anda tercatat tidak hadir. Hubungi pengawas.');
  }

  // Validasi token (sumber ruang & sesi) — ID ruang dari browser diabaikan.
  const { token } = await validateExamToken(input.token, 'start', session.id);
  if (token.roomId !== session.roomId || participant.roomId !== session.roomId) {
    throw new ApiError('TOKEN_SCOPE_MISMATCH', 'Token tidak berlaku untuk ruang peserta ini.', 403);
  }

  const examType = await store.getDoc<ExamType>('examTypes', schedule.examTypeId);
  if (!examType) throw errors.notFound('Jenis ujian tidak ditemukan.');
  const formVersion = await store.getDoc<ExamFormVersion>('examFormVersions', schedule.formVersionId);
  if (!formVersion) throw errors.notFound('Versi paket soal tidak ditemukan.');

  const attemptId = attemptIdFor(schedule.id, student.id);
  const existing = await store.getDoc<ExamAttempt>('examAttempts', attemptId);
  if (existing) {
    if (existing.status === 'in_progress') {
      return loadAttemptView(existing);
    }
    throw new ApiError('ALREADY_SUBMITTED', 'Anda sudah menyelesaikan ujian ini.', 409, {
      attemptId: existing.id,
    });
  }

  const startedAt = serverNowIso();
  const durationEnd = addMinutes(startedAt, examType.durationMinutes);
  const endsAt = durationEnd < session.endsAt ? durationEnd : session.endsAt;
  const attempt: ExamAttempt = {
    id: attemptId,
    schoolId: schedule.schoolId,
    scheduleId: schedule.id,
    sessionId: session.id,
    roomId: session.roomId,
    proctorId: session.proctorId,
    studentId: student.id,
    classId: participant.classId,
    examTypeId: examType.id,
    formId: schedule.formId,
    formVersionId: schedule.formVersionId,
    status: 'in_progress',
    startedAt,
    endsAt,
    submittedAt: null,
    lastSavedAt: null,
    focusLossCount: 0,
    connectionLossCount: 0,
    clientUserAgent: undefined,
  };
  await store.set('examAttempts', attemptId, attempt);
  await store.update<ExamParticipant>('examParticipants', participant.id, {
    status: 'in_progress',
    attendance: 'present',
    startedAt,
    roomId: session.roomId,
    proctorId: session.proctorId,
  });
  await writeAudit({
    schoolId: schedule.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: 'student',
    action: AUDIT_ACTIONS.attemptStart,
    targetType: 'examAttempts',
    targetId: attemptId,
    meta: {
      scheduleId: schedule.id,
      sessionId: session.id,
      roomId: session.roomId,
      tokenId: token.id,
      studentId: student.id,
    },
    ip,
  });
  return loadAttemptView(attempt);
}

export async function getCurrentAttempt(auth: AuthContext): Promise<{
  view: AttemptView | null;
  autoClosed: boolean;
  message?: string;
}> {
  const student = requireStudent(auth);
  const store = await getStore();
  const attempts = await store.query<ExamAttempt>('examAttempts', {
    where: [
      { field: 'studentId', op: '==', value: student.id },
      { field: 'status', op: '==', value: 'in_progress' },
    ],
    limit: 5,
  });
  if (attempts.length === 0) return { view: null, autoClosed: false };
  const attempt = attempts.sort((a, b) => (a.startedAt < b.startedAt ? 1 : -1))[0];
  if (new Date(attempt.endsAt).getTime() <= Date.now()) {
    await finalizeAttempt(attempt, { reason: 'timeout', autoSubmitted: true });
    return {
      view: null,
      autoClosed: true,
      message: 'Waktu ujian telah berakhir. Jawaban yang tersimpan telah dikirim otomatis.',
    };
  }
  return { view: await loadAttemptView(attempt), autoClosed: false };
}

function sanitizeAnswer(question: VersionQuestion, raw: unknown): unknown {
  const fail: (msg: string) => never = (msg) => {
    throw errors.validation(msg);
  };
  const size = JSON.stringify(raw ?? null).length;
  if (size > 64_000) fail('Jawaban terlalu besar.');
  switch (question.type) {
    case 'mcq': {
      if (typeof raw !== 'string') return fail('Jawaban pilihan ganda harus berupa satu opsi.');
      if (!question.options.some((o) => o.id === raw)) return fail('Opsi jawaban tidak dikenal.');
      return raw;
    }
    case 'complex': {
      if (!Array.isArray(raw)) return fail('Jawaban pilihan ganda kompleks harus berupa daftar opsi.');
      const ids = [...new Set((raw as unknown[]).map(String))];
      if (!ids.every((id) => question.options.some((o) => o.id === id))) return fail('Opsi jawaban tidak dikenal.');
      return ids;
    }
    case 'truefalse': {
      if (typeof raw !== 'boolean') return fail('Jawaban benar/salah harus boolean.');
      return raw;
    }
    case 'matching': {
      if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return fail('Jawaban menjodohkan tidak valid.');
      const pairIds = new Set(question.pairs.map((p) => p.id));
      const out: Record<string, string> = {};
      for (const [left, right] of Object.entries(raw as Record<string, unknown>)) {
        if (!pairIds.has(left)) return fail('Pasangan tidak dikenal.');
        if (right === null || right === '') continue;
        if (!pairIds.has(String(right))) return fail('Pasangan tujuan tidak dikenal.');
        out[left] = String(right);
      }
      return out;
    }
    case 'short':
    case 'essay': {
      if (typeof raw !== 'string') return fail('Jawaban harus berupa teks.');
      const text = raw.slice(0, question.type === 'essay' ? 20_000 : 1_000);
      return text;
    }
    default:
      return fail('Tipe soal tidak dikenal.');
  }
}

export interface SaveAnswerInput {
  attemptId: string;
  questionId: string;
  value: unknown;
  seq: number;
  flagged?: boolean;
  timeSpentMs?: number;
}

export async function saveAnswer(
  auth: AuthContext,
  input: SaveAnswerInput,
): Promise<{ savedAt: string; seq: number; serverNow: string; remainingMs: number; ignored?: boolean }> {
  const student = requireStudent(auth);
  const store = await getStore();
  const attempt = await store.getDoc<ExamAttempt>('examAttempts', input.attemptId);
  if (!attempt || attempt.studentId !== student.id) {
    throw errors.notFound('Sesi pengerjaan tidak ditemukan.');
  }
  if (attempt.status !== 'in_progress') {
    throw new ApiError('ATTEMPT_LOCKED', 'Jawaban telah dikunci karena ujian sudah dikirim.', 409);
  }
  const now = serverNow();
  const endMs = new Date(attempt.endsAt).getTime();
  if (now.getTime() > endMs + SAVE_GRACE_MS) {
    await finalizeAttempt(attempt, { reason: 'timeout', autoSubmitted: true });
    throw new ApiError('EXAM_TIME_OVER', 'Waktu ujian berakhir. Jawaban telah dikirim otomatis.', 409);
  }

  const version = await store.getDoc<ExamFormVersion>('examFormVersions', attempt.formVersionId);
  if (!version) throw errors.notFound('Versi paket soal tidak ditemukan.');
  // Terima id bank soal maupun id baris versi (kompatibilitas klien lama).
  const questionId = version.questionIdsOrdered.find(
    (qid) =>
      qid === input.questionId || compositeId(attempt.formVersionId, qid) === input.questionId,
  );
  if (!questionId) {
    throw errors.validation('Soal tidak termasuk dalam paket ujian ini.');
  }
  const question = await store.getDoc<VersionQuestion>(
    'versionQuestions',
    compositeId(attempt.formVersionId, questionId),
  );
  if (!question) throw errors.notFound('Soal tidak ditemukan pada paket.');
  const value = sanitizeAnswer(question, input.value);

  const responseId = compositeId(attempt.id, questionId);
  const savedAt = serverNowIso();
  const outcome = await store.transaction(async (tx) => {
    const currentAttempt = await tx.getDoc<ExamAttempt>('examAttempts', attempt.id);
    if (!currentAttempt || currentAttempt.status !== 'in_progress') {
      return { accepted: false, seq: input.seq };
    }
    const existing = await tx.getDoc<ResponseValueDoc>('responses', responseId);
    if (existing && existing.seq > input.seq) {
      return { accepted: false, seq: existing.seq };
    }
    const doc: ResponseValueDoc = {
      id: responseId,
      attemptId: attempt.id,
      scheduleId: attempt.scheduleId,
      schoolId: attempt.schoolId,
      studentId: attempt.studentId,
      questionId,
      value,
      seq: input.seq,
      flagged: Boolean(input.flagged ?? existing?.flagged ?? false),
      updatedAt: savedAt,
      timeSpentMs: input.timeSpentMs ?? existing?.timeSpentMs ?? 0,
    };
    await tx.set('responses', responseId, doc);
    await tx.update<ExamAttempt>('examAttempts', attempt.id, { lastSavedAt: savedAt });
    return { accepted: true, seq: input.seq };
  });

  return {
    savedAt,
    seq: outcome.seq,
    serverNow: savedAt,
    remainingMs: Math.max(0, endMs - now.getTime()),
    ignored: !outcome.accepted,
  };
}

export interface FinalizeOptions {
  reason: 'manual' | 'timeout' | 'proctor';
  autoSubmitted?: boolean;
  tokenId?: string;
  actorId?: string;
}

interface GradedDetail {
  score: number;
  maxScore: number;
  percent: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  essayPending: number;
  rows: {
    questionId: string;
    type: VersionQuestion['type'];
    points: number;
    value: unknown;
    score: number;
    blank: boolean;
    correct: boolean;
    timeSpentMs: number;
  }[];
}

async function computeGrades(
  attempt: ExamAttempt,
  manualScores: Record<string, number> | undefined,
): Promise<{ detail: GradedDetail; questions: VersionQuestion[] }> {
  const store = await getStore();
  const questions = await loadVersionQuestions(attempt.formVersionId);
  const responses = await store.query<ResponseValueDoc>('responses', {
    where: [{ field: 'attemptId', op: '==', value: attempt.id }],
    limit: 500,
  });
  const respMap = new Map(responses.map((r) => [r.questionId, r]));
  let score = 0;
  let maxScore = 0;
  let correctCount = 0;
  let wrongCount = 0;
  let blankCount = 0;
  let essayPending = 0;
  const rows: GradedDetail['rows'] = [];

  for (const question of questions) {
    maxScore += question.points;
    const key = await loadKey(question.questionId);
    if (!key) throw errors.internal('Kunci jawaban tidak ditemukan untuk salah satu soal.');
    const normalized = normalizeKey(key);
    const response = respMap.get(question.questionId);
    const value = response?.value;
    if (question.type === 'essay') {
      const manual = manualScores?.[question.questionId];
      const scored = typeof manual === 'number' ? Math.min(question.points, Math.max(0, manual)) : null;
      const blank =
        value === undefined ||
        value === null ||
        (typeof value === 'string' && value.trim() === '');
      // Uraian kosong tidak perlu dinilai manual.
      if (scored === null && !blank) essayPending += 1;
      const finalScore = scored ?? 0;
      score += finalScore;
      if (blank) blankCount += 1;
      else if (scored !== null) {
        if (finalScore <= 0) wrongCount += 1;
        else correctCount += 1;
      }
      rows.push({
        questionId: question.questionId,
        type: question.type,
        points: question.points,
        value,
        score: finalScore,
        blank,
        correct: scored !== null ? finalScore >= question.points : false,
        timeSpentMs: response?.timeSpentMs ?? 0,
      });
      continue;
    }
    const result = scoreObjective(normalized, value);
    score += result.score;
    if (result.blank) blankCount += 1;
    else if (result.correct) correctCount += 1;
    else wrongCount += 1;
    rows.push({
      questionId: question.questionId,
      type: question.type,
      points: question.points,
      value,
      score: result.score,
      blank: result.blank,
      correct: result.correct,
      timeSpentMs: response?.timeSpentMs ?? 0,
    });
  }

  score = round2(score);
  const percent = maxScore > 0 ? round2((score / maxScore) * 100) : 0;
  return {
    detail: { score, maxScore, percent, correctCount, wrongCount, blankCount, essayPending, rows },
    questions,
  };
}

function decidePublication(
  examType: ExamType,
  session: ExamSession | null,
  isFinal: boolean,
): { status: ExamResult['status']; publishedAt: string | null } {
  if (!isFinal) return { status: 'pending_grading', publishedAt: null };
  if (examType.resultPublish === 'immediate') {
    return { status: 'published', publishedAt: serverNowIso() };
  }
  if (examType.resultPublish === 'after_session' && session?.status === 'closed') {
    return { status: 'published', publishedAt: serverNowIso() };
  }
  return { status: 'final', publishedAt: null };
}

export async function finalizeAttempt(
  attempt: ExamAttempt,
  options: FinalizeOptions,
): Promise<ExamResult> {
  const store = await getStore();
  const existingResult = await store.getDoc<ExamResult>('examResults', resultIdFor(attempt.scheduleId, attempt.studentId));
  if (attempt.status !== 'in_progress') {
    if (existingResult) return existingResult;
    throw errors.conflict('Pengerjaan sudah difinalisasi tetapi hasil belum tersedia.');
  }

  const [examType, session] = await Promise.all([
    store.getDoc<ExamType>('examTypes', attempt.examTypeId),
    store.getDoc<ExamSession>('examSessions', attempt.sessionId),
  ]);
  if (!examType) throw errors.internal('Jenis ujian tidak ditemukan.');

  const { detail } = await computeGrades(attempt, existingResult?.manualScores);
  const isFinal = detail.essayPending === 0;
  const publication = decidePublication(examType, session, isFinal);
  const submittedAt = serverNowIso();
  const durationSec = Math.max(0, Math.round(minutesBetween(attempt.startedAt, submittedAt) * 60));

  const result: ExamResult = {
    id: resultIdFor(attempt.scheduleId, attempt.studentId),
    schoolId: attempt.schoolId,
    scheduleId: attempt.scheduleId,
    sessionId: attempt.sessionId,
    studentId: attempt.studentId,
    classId: attempt.classId,
    formVersionId: attempt.formVersionId,
    examTypeId: attempt.examTypeId,
    status: publication.status,
    score: detail.score,
    maxScore: detail.maxScore,
    percent: detail.percent,
    correctCount: detail.correctCount,
    wrongCount: detail.wrongCount,
    blankCount: detail.blankCount,
    essayPending: detail.essayPending,
    durationSec,
    submittedAt,
    gradedBy: options.reason === 'manual' ? options.actorId ?? 'system' : 'system',
    gradedAt: submittedAt,
    publishedAt: publication.publishedAt,
    manualScores: existingResult?.manualScores,
  };

  const aggregates = new Map<string, ItemStatAggregate>();
  for (const row of detail.rows) {
    const meta = {
      schoolId: attempt.schoolId,
      scheduleId: attempt.scheduleId,
      formVersionId: attempt.formVersionId,
      questionId: row.questionId,
      type: row.type,
      points: row.points,
    };
    const agg = emptyAggregate(meta);
    aggregates.set(row.questionId, agg);
  }

  await store.transaction(async (tx) => {
    const current = await tx.getDoc<ExamAttempt>('examAttempts', attempt.id);
    if (!current) throw errors.notFound('Pengerjaan tidak ditemukan.');
    if (current.status !== 'in_progress') return;

    for (const row of detail.rows) {
      const id = aggregateId(attempt.scheduleId, row.questionId);
      const base =
        (await tx.getDoc<ItemStatAggregate>('itemStats', id)) ?? aggregates.get(row.questionId)!;
      const next = applyRow(base, {
        questionId: row.questionId,
        type: row.type,
        points: row.points,
        value: row.value,
        score: row.score,
        blank: row.blank,
        totalScore: detail.score,
        timeSpentMs: row.timeSpentMs,
      });
      await tx.set('itemStats', id, next);
    }

    await tx.set('examResults', result.id, result as unknown as ExamResult & { id: string });
    await tx.update<ExamAttempt>('examAttempts', attempt.id, {
      status: 'submitted',
      submittedAt,
      score: detail.score,
      maxScore: detail.maxScore,
      autoSubmitted: Boolean(options.autoSubmitted),
      submitTokenId: options.tokenId ?? null,
      resultStatus: result.status === 'published' ? 'published' : 'final',
      gradedAt: submittedAt,
      gradedBy: 'system',
    });
    const participantRows = await tx.query<ExamParticipant>('examParticipants', {
      where: [
        { field: 'scheduleId', op: '==', value: attempt.scheduleId },
        { field: 'studentId', op: '==', value: attempt.studentId },
      ],
      limit: 1,
    });
    if (participantRows[0]) {
      await tx.update<ExamParticipant>('examParticipants', participantRows[0].id, {
        status: result.status === 'published' ? 'finished' : 'submitted',
        submittedAt,
        lastSeenAt: submittedAt,
      });
    }
  });

  await writeAudit({
    schoolId: attempt.schoolId,
    actorId: options.actorId ?? attempt.studentId,
    actorName: options.actorId ? options.actorId : attempt.studentId,
    actorRole: options.actorId ? 'system' : 'student',
    action: AUDIT_ACTIONS.attemptSubmit,
    targetType: 'examAttempts',
    targetId: attempt.id,
    meta: {
      reason: options.reason,
      score: detail.score,
      maxScore: detail.maxScore,
      autoSubmitted: Boolean(options.autoSubmitted),
      tokenId: options.tokenId ?? null,
    },
  });
  return result;
}

export interface SubmitInput {
  attemptId: string;
  token: string;
  reason?: 'manual' | 'timeout' | 'proctor';
}

export async function submitAttempt(
  auth: AuthContext,
  input: SubmitInput,
  ip?: string,
): Promise<{ result: ExamResult; alreadySubmitted: boolean; autoClosed: boolean; message?: string }> {
  const student = requireStudent(auth);
  const store = await getStore();
  const attempt = await store.getDoc<ExamAttempt>('examAttempts', input.attemptId);
  if (!attempt || attempt.studentId !== student.id) throw errors.notFound('Pengerjaan tidak ditemukan.');

  if (attempt.status !== 'in_progress') {
    const result = await store.getDoc<ExamResult>('examResults', resultIdFor(attempt.scheduleId, attempt.studentId));
    if (!result) throw new ApiError('ALREADY_SUBMITTED', 'Jawaban sudah dikirim.', 409);
    return { result, alreadySubmitted: true, autoClosed: false };
  }

  const now = serverNow();
  if (now.getTime() > new Date(attempt.endsAt).getTime() + 60_000) {
    const result = await finalizeAttempt(attempt, { reason: 'timeout', autoSubmitted: true });
    return {
      result,
      alreadySubmitted: false,
      autoClosed: true,
      message: 'Waktu ujian telah berakhir; jawaban dikirim otomatis oleh server.',
    };
  }

  const { token } = await validateExamToken(input.token, 'submit', attempt.sessionId);
  const examType = await store.getDoc<ExamType>('examTypes', attempt.examTypeId);
  if (!examType) throw errors.internal('Jenis ujian tidak ditemukan.');
  assertMinimumSubmitTime(attempt.startedAt, examType.minSubmitMinutes);

  const result = await finalizeAttempt(attempt, {
    reason: input.reason === 'proctor' ? 'proctor' : 'manual',
    tokenId: token.id,
    actorId: auth.user.id,
  });
  await writeAudit({
    schoolId: attempt.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: 'student',
    action: AUDIT_ACTIONS.attemptSubmit,
    targetType: 'examAttempts',
    targetId: attempt.id,
    meta: { tokenId: token.id, via: 'student' },
    ip,
  });
  return { result, alreadySubmitted: false, autoClosed: false };
}

export async function expireAttemptAsStaff(
  auth: AuthContext,
  attemptId: string,
  ip?: string,
): Promise<ExamResult> {
  if (!hasPermission(auth.roles, 'session.open')) throw errors.forbidden();
  const store = await getStore();
  const attempt = await store.getDoc<ExamAttempt>('examAttempts', attemptId);
  if (!attempt) throw errors.notFound('Pengerjaan tidak ditemukan.');
  const session = await store.getDoc<ExamSession>('examSessions', attempt.sessionId);
  if (!session) throw errors.notFound('Sesi tidak ditemukan.');
  if (!auth.roles.includes('superadmin')) {
    if (auth.roles.includes('proctor')) assertCanManageSession(auth, session);
    else if (auth.schoolId !== attempt.schoolId) throw errors.forbidden();
  }
  const result = await finalizeAttempt(attempt, {
    reason: 'proctor',
    autoSubmitted: true,
    actorId: auth.user.id,
  });
  await writeAudit({
    schoolId: attempt.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.attemptExpire,
    targetType: 'examAttempts',
    targetId: attempt.id,
    ip,
  });
  return result;
}

export async function gradeEssays(
  auth: AuthContext,
  input: { attemptId: string; scores: Record<string, number>; reason?: string },
): Promise<ExamResult> {
  if (!hasPermission(auth.roles, 'result.grade')) throw errors.forbidden();
  const store = await getStore();
  const attempt = await store.getDoc<ExamAttempt>('examAttempts', input.attemptId);
  if (!attempt) throw errors.notFound('Pengerjaan tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && auth.schoolId !== attempt.schoolId) throw errors.forbidden();
  if (attempt.status === 'in_progress') throw errors.conflict('Pengerjaan belum dikirim.');
  const resultId = resultIdFor(attempt.scheduleId, attempt.studentId);
  const existing = await store.getDoc<ExamResult>('examResults', resultId);
  if (!existing) throw errors.notFound('Hasil ujian belum tersedia.');
  const [examType, session] = await Promise.all([
    store.getDoc<ExamType>('examTypes', attempt.examTypeId),
    store.getDoc<ExamSession>('examSessions', attempt.sessionId),
  ]);
  if (!examType) throw errors.internal('Jenis ujian tidak ditemukan.');

  const manualScores = { ...(existing.manualScores ?? {}), ...input.scores };
  const { detail } = await computeGrades(attempt, manualScores);
  const isFinal = detail.essayPending === 0;
  const publication = decidePublication(examType, session ?? null, isFinal);
  const gradedAt = serverNowIso();
  const updated: ExamResult = {
    ...existing,
    manualScores,
    status: publication.status,
    score: detail.score,
    maxScore: detail.maxScore,
    percent: detail.percent,
    correctCount: detail.correctCount,
    wrongCount: detail.wrongCount,
    blankCount: detail.blankCount,
    essayPending: detail.essayPending,
    gradedBy: auth.user.id,
    gradedAt,
    publishedAt: publication.publishedAt ?? existing.publishedAt ?? null,
  };
  await store.set('examResults', resultId, updated as unknown as ExamResult & { id: string });
  await store.update<ExamAttempt>('examAttempts', attempt.id, {
    score: detail.score,
    maxScore: detail.maxScore,
    resultStatus: updated.status === 'published' ? 'published' : 'final',
  });
  await writeAudit({
    schoolId: attempt.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.gradeChange,
    targetType: 'examResults',
    targetId: resultId,
    meta: { attemptId: attempt.id, scores: input.scores, reason: input.reason ?? '' },
  });
  return updated;
}

export async function sweepExpiredAttempts(schoolId: string | null): Promise<{
  checked: number;
  finalized: number;
}> {
  const store = await getStore();
  const attempts = await store.query<ExamAttempt>('examAttempts', {
    where: [
      { field: 'status', op: '==', value: 'in_progress' },
      ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
    ],
    limit: 500,
  });
  const now = Date.now();
  let finalized = 0;
  for (const attempt of attempts) {
    if (new Date(attempt.endsAt).getTime() + 60_000 > now) continue;
    try {
      await finalizeAttempt(attempt, { reason: 'timeout', autoSubmitted: true });
      finalized += 1;
    } catch (err) {
      console.error('[neotest] sweep gagal', attempt.id, err);
    }
  }
  return { checked: attempts.length, finalized };
}

export async function getAttemptReview(
  auth: AuthContext,
  attemptId: string,
): Promise<AttemptReview> {
  const store = await getStore();
  const attempt = await store.getDoc<ExamAttempt>('examAttempts', attemptId);
  if (!attempt) throw errors.notFound('Pengerjaan tidak ditemukan.');
  const isStudent = auth.roles.includes('student');
  if (isStudent) {
    const student = requireStudent(auth);
    if (attempt.studentId !== student.id) throw errors.forbidden();
  } else {
    if (!hasPermission(auth.roles, 'result.read')) throw errors.forbidden();
    if (!auth.roles.includes('superadmin') && auth.schoolId !== attempt.schoolId) throw errors.forbidden();
  }

  const [result, examType, questions] = await Promise.all([
    store.getDoc<ExamResult>('examResults', resultIdFor(attempt.scheduleId, attempt.studentId)),
    store.getDoc<ExamType>('examTypes', attempt.examTypeId),
    loadVersionQuestions(attempt.formVersionId),
  ]);
  const responses = await store.query<ResponseValueDoc>('responses', {
    where: [{ field: 'attemptId', op: '==', value: attempt.id }],
    limit: 300,
  });
  const respMap = new Map(responses.map((r) => [r.questionId, r]));

  const allowReview =
    !isStudent || (Boolean(examType?.allowAnswerReview) && result?.status === 'published');
  if (isStudent && !allowReview) {
    return {
      attempt,
      result: result?.status === 'published' ? result : null,
      questions: [],
      allowReview: false,
      message: 'Pembahasan soal belum dibuka oleh sekolah.',
    };
  }

  const reviewQuestions: AttemptReviewQuestion[] = [];
  for (const question of questions.sort((a, b) => a.order - b.order)) {
    const key = await loadKey(question.questionId);
    const response = respMap.get(question.questionId);
    const normalized = key ? normalizeKey(key) : null;
    const blank = !response || response.value === undefined || response.value === null;
    let correct: boolean | null = null;
    let score: number | null = null;
    let essayPending = false;
    if (normalized && question.type !== 'essay') {
      const scored = scoreObjective(normalized, response?.value);
      correct = scored.correct;
      score = scored.score;
    } else if (question.type === 'essay') {
      const manual = result?.manualScores?.[question.questionId];
      if (typeof manual === 'number') score = manual;
      else essayPending = true;
    }
    reviewQuestions.push({
      question,
      value: response?.value ?? null,
      score,
      maxPoints: question.points,
      correct,
      blank,
      key: key?.correct ?? null,
      essayPending,
    });
  }

  for (const item of reviewQuestions) {
    const source = await store.getDoc<{ id: string; explanation?: string }>(
      'questions',
      item.question.questionId,
    );
    item.explanation = source?.explanation ?? '';
  }

  return { attempt, result, questions: reviewQuestions, allowReview };
}

export async function listStudentExams(auth: AuthContext): Promise<StudentExamCard[]> {
  const student = requireStudent(auth);
  const store = await getStore();
  const participants = await store.query<ExamParticipant>('examParticipants', {
    where: [{ field: 'studentId', op: '==', value: student.id }],
    limit: 100,
  });
  const cards: StudentExamCard[] = [];
  for (const participant of participants) {
    const [schedule, session, examType] = await Promise.all([
      store.getDoc<ExamSchedule>('examSchedules', participant.scheduleId),
      store.getDoc<ExamSession>('examSessions', participant.sessionId),
      store.getDoc<ExamType>('examTypes', participant.examTypeId),
    ]);
    if (!schedule || !session || !examType) continue;
    const [room, proctor, subject] = await Promise.all([
      store.getDoc<{ id: string; name: string }>('rooms', session.roomId),
      store.getDoc<{ id: string; fullName: string }>('proctors', session.proctorId),
      store.getDoc<Subject>('subjects', schedule.subjectId),
    ]);
    const attempt = await store.getDoc<ExamAttempt>(
      'examAttempts',
      attemptIdFor(schedule.id, student.id),
    );
    const result = attempt
      ? await store.getDoc<ExamResult>('examResults', resultIdFor(schedule.id, student.id))
      : null;
    cards.push({
      participant,
      schedule: {
        id: schedule.id,
        title: schedule.title,
        date: schedule.date,
        startTime: schedule.startTime,
        endTime: schedule.endTime,
        durationMinutes: schedule.durationMinutes,
      },
      session: {
        id: session.id,
        code: session.code,
        roomName: room?.name ?? '',
        proctorName: proctor?.fullName ?? '',
        status: session.status,
        startsAt: session.startsAt,
        endsAt: session.endsAt,
      },
      examType: {
        id: examType.id,
        name: examType.name,
        assessmentType: examType.assessmentType,
        navigation: examType.navigation,
        minSubmitMinutes: examType.minSubmitMinutes,
      },
      subjectName: subject?.name ?? '',
      attempt: attempt
        ? {
            id: attempt.id,
            status: attempt.status,
            startedAt: attempt.startedAt,
            endsAt: attempt.endsAt,
            submittedAt: attempt.submittedAt ?? null,
            lastSavedAt: attempt.lastSavedAt ?? null,
          }
        : null,
      resultPublished: result?.status === 'published',
    });
  }
  return cards.sort((a, b) => `${a.schedule.date}${a.schedule.startTime}`.localeCompare(`${b.schedule.date}${b.schedule.startTime}`));
}
