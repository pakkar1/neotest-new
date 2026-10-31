import { endpoint, json } from './_lib/http';
import { requireAuth, type AuthContext } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore } from './_lib/store';
import { parseBody } from './_lib/rest';
import {
  expireAttemptSchema,
  saveResponseSchema,
  startExamSchema,
  submitAttemptSchema,
} from '../src/shared/schemas';
import {
  expireAttemptAsStaff,
  getAttemptReview,
  sweepExpiredAttempts,
  getCurrentAttempt,
  listStudentExams,
  saveAnswer,
  startAttempt,
  submitAttempt,
} from './_lib/services/attempts';
import { rateLimit } from './_lib/rateLimit';
import { serverNowIso } from './_lib/clock';
import { hasPermission } from '../src/shared/permissions';
import type { ExamAttempt } from '../src/shared/types';

async function handleSweep(auth: AuthContext | null, req: { headers: Record<string, string> }) {
  const cronSecret = process.env.CRON_SECRET;
  const provided = req.headers['x-cron-secret'] ?? '';
  const authorized = Boolean(cronSecret && provided && provided === cronSecret) || Boolean(auth);
  if (!authorized) throw errors.forbidden('Sweep memerlukan x-cron-secret atau sesi administrator.');
  if (auth && !auth.roles.some((r) => r === 'admin' || r === 'superadmin')) throw errors.forbidden();
  const outcome = await sweepExpiredAttempts(
    auth && !auth.roles.includes('superadmin') ? auth.schoolId : null,
  );
  return {
    ...outcome,
    serverNow: serverNowIso(),
    note: 'Sweep memfinalisasi pengerjaan yang melewati batas waktu. Jadwalkan melalui Vercel Cron atau tombol admin.',
  };
}

export default endpoint(async (req) => {
  const action = req.query.action ?? '';

  if (req.method === 'GET' && action === 'sweep') {
    let auth: AuthContext | null = null;
    try {
      auth = await requireAuth(req);
    } catch {
      auth = null;
    }
    return json(await handleSweep(auth, req));
  }

  const auth = await requireAuth(req);

  if (action === 'exams' && req.method === 'GET') {
    return json({ items: await listStudentExams(auth) });
  }

  if (action === 'current' && req.method === 'GET') {
    return json(await getCurrentAttempt(auth));
  }

  if (action === 'start' && req.method === 'POST') {
    rateLimit({ key: `start:${auth.user.id}`, limit: 8, windowMs: 10 * 60_000 });
    rateLimit({ key: `start-ip:${req.ip}`, limit: 60, windowMs: 10 * 60_000 });
    const body = await parseBody(startExamSchema, req.body);
    return json(await startAttempt(auth, body, req.ip));
  }

  if (action === 'save' && req.method === 'POST') {
    rateLimit({ key: `save:${auth.user.id}`, limit: 120, windowMs: 60_000 });
    const body = await parseBody(saveResponseSchema, req.body);
    return json(
      await saveAnswer(auth, {
        attemptId: body.attemptId,
        questionId: body.questionId,
        seq: body.seq,
        value: body.value,
        flagged: body.flagged,
        timeSpentMs: body.timeSpentMs,
      }),
    );
  }

  if (action === 'submit' && req.method === 'POST') {
    rateLimit({ key: `submit:${auth.user.id}`, limit: 10, windowMs: 10 * 60_000 });
    const body = await parseBody(submitAttemptSchema, req.body);
    return json(await submitAttempt(auth, body, req.ip));
  }

  if (action === 'expire' && req.method === 'POST') {
    const body = await parseBody(expireAttemptSchema, req.body);
    return json({ result: await expireAttemptAsStaff(auth, body.attemptId, req.ip) });
  }

  if (action === 'review' && req.method === 'GET') {
    const attemptId = req.query.attemptId;
    if (!attemptId) throw errors.validation('attemptId wajib diisi.');
    return json(await getAttemptReview(auth, attemptId));
  }

  if (action === 'signal' && req.method === 'POST') {
    // Indikator pengawasan (kehilangan fokus/tab). Tidak pernah menggugurkan siswa.
    const body = req.body as { attemptId?: string; type?: string };
    if (!body.attemptId || !['focus_loss', 'connection_loss', 'reconnect'].includes(body.type ?? '')) {
      throw errors.validation('Sinyal pengawasan tidak valid.');
    }
    const store = await getStore();
    const attempt = await store.getDoc<ExamAttempt>('examAttempts', body.attemptId);
    if (!attempt) throw errors.notFound('Pengerjaan tidak ditemukan.');
    if (!auth.student || attempt.studentId !== auth.student.id) throw errors.forbidden();
    if (attempt.status !== 'in_progress') return json({ ok: true });
    rateLimit({ key: `signal:${attempt.id}`, limit: 30, windowMs: 10 * 60_000 });
    await store.update<ExamAttempt>('examAttempts', attempt.id, {
      ...(body.type === 'focus_loss' ? { focusLossCount: attempt.focusLossCount + 1 } : {}),
      ...(body.type === 'connection_loss'
        ? { connectionLossCount: attempt.connectionLossCount + 1 }
        : {}),
    });
    return json({ ok: true, type: body.type });
  }

  if (action === 'state' && req.method === 'GET') {
    if (!hasPermission(auth.roles, 'result.read')) throw errors.forbidden();
    return json({ notes: 'Gunakan action=current untuk peserta.' });
  }

  throw errors.validation(`Aksi pengerjaan "${action}" tidak dikenal.`);
});
