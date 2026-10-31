import { endpoint, json } from './_lib/http';
import { requireAuth } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore } from './_lib/store';
import {
  attemptIdFor,
  getAttemptReview,
  gradeEssays,
  loadVersionQuestions,
  resultIdFor,
} from './_lib/services/attempts';
import { listStudentResults } from './_lib/services/reports';
import { AUDIT_ACTIONS, writeAudit } from './_lib/audit';
import { serverNowIso } from './_lib/clock';
import { hasPermission } from '../src/shared/permissions';
import { gradeEssaySchema } from '../src/shared/schemas';
import { parseBody } from './_lib/rest';
import type { ExamAttempt, ExamResult, ExamSchedule, QuestionKey, ResponseValueDoc, VersionQuestion } from '../src/shared/types';

export default endpoint(async (req) => {
  const auth = await requireAuth(req);
  const resource = req.query.resource ?? '';

  if (req.method === 'GET' && resource === 'my') {
    return json({ items: await listStudentResults(auth) });
  }

  if (req.method === 'GET' && resource === 'detail') {
    const attemptId = req.query.attemptId;
    if (!attemptId) throw errors.validation('attemptId wajib diisi.');
    return json(await getAttemptReview(auth, attemptId));
  }

  if (req.method === 'GET' && resource === 'grading') {
    if (!hasPermission(auth.roles, 'result.grade')) throw errors.forbidden();
    const attemptId = req.query.attemptId;
    if (!attemptId) throw errors.validation('attemptId wajib diisi.');
    const store = await getStore();
    const attempt = await store.getDoc<ExamAttempt>('examAttempts', attemptId);
    if (!attempt) throw errors.notFound('Pengerjaan tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && auth.schoolId !== attempt.schoolId) throw errors.forbidden();
    const [result, questions, responses] = await Promise.all([
      store.getDoc<ExamResult>('examResults', resultIdFor(attempt.scheduleId, attempt.studentId)),
      loadVersionQuestions(attempt.formVersionId),
      store.query<ResponseValueDoc>('responses', {
        where: [{ field: 'attemptId', op: '==', value: attemptId }],
        limit: 300,
      }),
    ]);
    const respMap = new Map(responses.map((r) => [r.questionId, r]));
    const essays = [];
    for (const question of questions.filter((q) => q.type === 'essay')) {
      const key = await store.getDoc<QuestionKey>('answerKeys', question.questionId);
      const keyDoc = key as unknown as { correct?: { rubric?: { id: string; criterion: string; points: number }[] } } | null;
      essays.push({
        question: question as VersionQuestion,
        response: respMap.get(question.questionId)?.value ?? null,
        rubric:
          keyDoc?.correct?.rubric ??
          (Array.isArray(key?.rubric) ? key!.rubric : []),
        manualScore: result?.manualScores?.[question.questionId] ?? null,
        points: question.points,
      });
    }
    return json({ attempt, result, essays });
  }

  if (req.method === 'POST' && resource === 'grade') {
    const body = await parseBody(gradeEssaySchema, req.body);
    const result = await gradeEssays(auth, body);
    return json({ result });
  }

  if (req.method === 'POST' && resource === 'publish') {
    if (!hasPermission(auth.roles, 'result.publish')) throw errors.forbidden();
    const body = (req.body ?? {}) as { scheduleId?: string; sessionId?: string };
    if (!body.scheduleId && !body.sessionId) throw errors.validation('scheduleId atau sessionId wajib diisi.');
    const store = await getStore();
    if (body.scheduleId) {
      const schedule = await store.getDoc<ExamSchedule>('examSchedules', body.scheduleId);
      if (!schedule) throw errors.notFound('Jadwal tidak ditemukan.');
      if (!auth.roles.includes('superadmin') && schedule.schoolId !== auth.schoolId) throw errors.forbidden();
    }
    const results = body.sessionId
      ? await store.query<ExamResult>('examResults', {
          where: [
            { field: 'sessionId', op: '==', value: body.sessionId },
            { field: 'status', op: '==', value: 'final' },
          ],
          limit: 300,
        })
      : await store.query<ExamResult>('examResults', {
          where: [
            { field: 'scheduleId', op: '==', value: body.scheduleId! },
            { field: 'status', op: '==', value: 'final' },
          ],
          limit: 1000,
        });
    let published = 0;
    const publishedAt = serverNowIso();
    for (const result of results) {
      if (!auth.roles.includes('superadmin') && result.schoolId !== auth.schoolId) continue;
      await store.update<ExamResult>('examResults', result.id, { status: 'published', publishedAt });
      await store.update<ExamAttempt>(
        'examAttempts',
        attemptIdFor(result.scheduleId, result.studentId),
        { resultStatus: 'published' },
      );
      published += 1;
    }
    await writeAudit({
      schoolId: auth.schoolId,
      actorId: auth.user.id,
      actorName: auth.user.displayName,
      actorRole: auth.roles[0],
      action: AUDIT_ACTIONS.resultPublish,
      targetType: body.sessionId ? 'examSessions' : 'examSchedules',
      targetId: body.sessionId ?? body.scheduleId ?? '',
      meta: { published },
      ip: req.ip,
    });
    return json({ published });
  }

  throw errors.validation(`Aksi hasil "${resource}" tidak dikenal.`);
});
