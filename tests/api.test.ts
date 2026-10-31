import { beforeAll, describe, expect, it } from 'vitest';
import authHandler from '../api/auth';
import adminHandler from '../api/admin';
import examsHandler from '../api/exams';
import proctorHandler from '../api/proctor';
import attemptsHandler from '../api/attempts';
import reportsHandler from '../api/reports';
import resultsHandler from '../api/results';
import { callApi, errorCode, login } from './helpers';
import { getStore } from '../api/_lib/store';
import { validateExamToken } from '../api/_lib/services/tokens';
import { addMinutes } from '../src/shared/time';
import type { ExamAttempt, ExamToken } from '../src/shared/types';

const PASS = 'NeoTest#2026';
let adminToken = '';
let superToken = '';
let proctorToken = '';
let studentToken = '';
let student2Token = '';
let student3Token = '';
let teacherToken = '';
let startToken = '';
let attemptId = '';

async function issueStartToken(token: string, sessionId: string): Promise<string> {
  const res = await callApi(proctorHandler, {
    method: 'POST',
    token,
    query: { resource: 'tokens', action: 'issue' },
    body: { kind: 'start', sessionId },
  });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  return res.body.token as string;
}

beforeAll(async () => {
  const admin = await login(authHandler, 'admin@neotest.demo', PASS);
  adminToken = admin.token;
  const sup = await login(authHandler, 'superadmin@neotest.demo', PASS);
  superToken = sup.token;
  const proctor = await login(authHandler, 'proktor@neotest.demo', PASS);
  proctorToken = proctor.token;
  const teacher = await login(authHandler, 'guru@neotest.demo', PASS);
  teacherToken = teacher.token;
  const student = await login(authHandler, 'siswa01@neotest.demo', PASS);
  studentToken = student.token;
  const student2 = await login(authHandler, 'siswa02@neotest.demo', PASS);
  student2Token = student2.token;
  const student3 = await login(authHandler, 'siswa03@neotest.demo', PASS);
  student3Token = student3.token;
});

describe('autentikasi & RBAC', () => {
  it('menolak password yang salah tanpa membocorkan detail', async () => {
    const res = await callApi(authHandler, {
      method: 'POST',
      query: { action: 'login' },
      body: { email: 'admin@neotest.demo', password: 'salah-total' },
    });
    expect(res.status).toBe(401);
    expect(errorCode(res.body)).toBe('UNAUTHENTICATED');
    expect(String((res.body.error as { message: string }).message)).not.toMatch(/password.*hash/i);
  });

  it('me', async () => {
    const res = await callApi(authHandler, { query: { action: 'me' }, token: adminToken });
    expect(res.status).toBe(200);
    expect((res.body.user as { roles: string[] }).roles).toContain('admin');
  });

  it('siswa tidak dapat mengakses dashboard admin', async () => {
    const res = await callApi(adminHandler, {
      query: { resource: 'dashboard' },
      token: studentToken,
    });
    expect(res.status).toBe(200); // dashboard siswa diizinkan
    expect((res.body as { role: string }).role).toBe('student');

    const students = await callApi(adminHandler, {
      query: { resource: 'students' },
      token: studentToken,
    });
    expect(students.status).toBe(403);
  });

  it('guru tidak dapat mengubah hak akses / mengelola akun', async () => {
    const res = await callApi(adminHandler, {
      method: 'GET',
      query: { resource: 'users' },
      token: teacherToken,
    });
    expect(res.status).toBe(403);
  });

  it('guru tidak dapat membaca audit log', async () => {
    const res = await callApi(adminHandler, {
      query: { resource: 'audit' },
      token: teacherToken,
    });
    expect(res.status).toBe(403);
  });

  it('admin tidak dapat mengakses data sekolah lain dengan schoolId palsu', async () => {
    const res = await callApi(adminHandler, {
      query: { resource: 'students', schoolId: 'sekolah_lain' },
      token: adminToken,
    });
    expect(res.status).toBe(403);
  });
});

describe('token mulai & identifikasi ruang', () => {
  it('proktor tidak dapat menerbitkan token untuk sesi proktor lain', async () => {
    const res = await callApi(proctorHandler, {
      method: 'POST',
      token: proctorToken,
      query: { resource: 'tokens', action: 'issue' },
      body: { kind: 'start', sessionId: 'demo_session_ipa_1' },
    });
    expect(res.status).toBe(403);
  });

  it('proktor dapat menerbitkan token untuk sesinya', async () => {
    startToken = await issueStartToken(proctorToken, 'demo_session_bin_1');
    expect(startToken).toMatch(/^[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    const store = await getStore();
    const tokens = await store.query<ExamToken>('examTokens', {
      where: [{ field: 'sessionId', op: '==', value: 'demo_session_bin_1' }],
      limit: 20,
    });
    expect(tokens.length).toBeGreaterThan(0);
    for (const token of tokens) {
      expect(JSON.stringify(token)).not.toContain(startToken);
    }
  });

  it('menolak token salah', async () => {
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'start' },
      body: { scheduleId: 'demo_schedule_bin_live', sessionId: 'demo_session_bin_1', token: 'ZZZZ-9999' },
    });
    expect(res.status).toBe(400);
    expect(errorCode(res.body)).toBe('TOKEN_INVALID');
  });

  it('menolak token yang dicabut / kedaluwarsa / beda sesi (lapisan server)', async () => {
    const store = await getStore();
    const issued = await issueStartToken(proctorToken, 'demo_session_bin_1');
    const tokenId = `tok_${(await import('../api/_lib/ids')).hashExamToken(issued, 'test-token-pepper-16chars')}`;
    await store.update<ExamToken>('examTokens', tokenId, {
      revokedAt: new Date().toISOString(),
    });
    await expect(
      validateExamToken(issued, 'start', 'demo_session_bin_1'),
    ).rejects.toMatchObject({ code: 'TOKEN_REVOKED' });

    const issued2 = await issueStartToken(proctorToken, 'demo_session_bin_1');
    await expect(
      validateExamToken(issued2, 'start', 'demo_session_bin_1'),
    ).resolves.toBeTruthy();
    await expect(
      validateExamToken(issued2, 'start', 'demo_session_mat_1'),
    ).rejects.toMatchObject({ code: 'TOKEN_SCOPE_MISMATCH' });

    await store.update<ExamToken>(
      'examTokens',
      `tok_${(await import('../api/_lib/ids')).hashExamToken(issued2, 'test-token-pepper-16chars')}`,
      { expiresAt: addMinutes(new Date(), -1) },
    );
    await expect(
      validateExamToken(issued2, 'start', 'demo_session_bin_1'),
    ).rejects.toMatchObject({ code: 'TOKEN_EXPIRED' });
  });

  it('siswa memulai ujian dengan token sah dan ruang ditentukan server', async () => {
    startToken = await issueStartToken(proctorToken, 'demo_session_bin_1');
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'start' },
      body: {
        scheduleId: 'demo_schedule_bin_live',
        sessionId: 'demo_session_bin_1',
        token: startToken,
        roomId: 'demo_room_4', // harus diabaikan server
        proctorId: 'demo_proctor_2',
      },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const view = res.body as {
      attempt: ExamAttempt;
      questions: { id: string; questionId: string; content: string; options: unknown[] }[];
      session: { roomName: string };
      participant: { roomId: string; proctorId: string };
      totalPoints: number;
    };
    attemptId = view.attempt.id;
    expect(view.session.roomName).toBe('Ruang 01');
    expect(view.participant.roomId).toBe('demo_room_1');
    expect(view.participant.proctorId).toBe('demo_proctor_1');
    expect(view.questions.length).toBe(6);
    expect(view.totalPoints).toBe(16);
    // Kontrak klien: id pada view adalah id bank soal, bukan id baris versi.
    for (const question of view.questions) {
      expect(question.id).toBe(question.questionId);
    }
    const serialized = JSON.stringify(res.body);
    expect(serialized).not.toContain('"correct"');
    expect(serialized).not.toContain('answerKeys');
    expect(serialized).not.toContain('"key"');
  });
});

describe('penyimpanan jawaban & pemulihan', () => {
  it('menyimpan jawaban dan mengabaikan urutan seq yang lebih lama', async () => {
    const first = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'save' },
      body: { attemptId, questionId: 'demo_q_bin_01', value: 'B', seq: 2 },
    });
    expect(first.status).toBe(200);
    expect(first.body.ignored).toBe(false);

    const stale = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'save' },
      body: { attemptId, questionId: 'demo_q_bin_01', value: 'A', seq: 1 },
    });
    expect(stale.status).toBe(200);
    expect(stale.body.ignored).toBe(true);

    const current = await callApi(attemptsHandler, {
      query: { action: 'current' },
      token: studentToken,
    });
    expect(current.status).toBe(200);
    const view = current.body as { view: { responses: { questionId: string; value: unknown }[] } };
    const saved = view.view.responses.find((r) => r.questionId === 'demo_q_bin_01');
    expect(saved?.value).toBe('B');
  });

  it('menerima id soal persis seperti yang dikirim view', async () => {
    const current = await callApi(attemptsHandler, {
      query: { action: 'current' },
      token: studentToken,
    });
    const view = current.body.view as { questions: { id: string; questionId: string }[] };
    const target = view.questions.find((q) => q.questionId === 'demo_q_bin_01');
    expect(target).toBeTruthy();
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'save' },
      body: { attemptId, questionId: target!.id, value: 'B', seq: 30 },
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.ignored).toBe(false);
  });

  it('menolak jawaban dengan nilai yang tidak valid', async () => {
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'save' },
      body: { attemptId, questionId: 'demo_q_bin_01', value: 'Z', seq: 5 },
    });
    expect(res.status).toBe(422);
  });

  it('siswa lain tidak dapat menyimpan jawaban pada attempt ini', async () => {
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: student2Token,
      query: { action: 'save' },
      body: { attemptId, questionId: 'demo_q_bin_01', value: 'A', seq: 9 },
    });
    expect(res.status).toBe(404);
  });
});

describe('token submit & finalisasi', () => {
  it('menolak submit sebelum waktu minimal (diperiksa server, bukan jam perangkat)', async () => {
    const submitToken = (
      await callApi(proctorHandler, {
        method: 'POST',
        token: proctorToken,
        query: { resource: 'tokens', action: 'issue' },
        body: { kind: 'submit', sessionId: 'demo_session_bin_1' },
      })
    ).body.token as string;
    const res = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'submit' },
      body: { attemptId, token: submitToken },
    });
    expect(res.status).toBe(403);
    expect(errorCode(res.body)).toBe('TOKEN_NOT_YET_VALID');
  });

  it('menerima submit setelah syarat waktu terpenuhi dan idempoten', async () => {
    const store = await getStore();
    await store.update<ExamAttempt>('examAttempts', attemptId, {
      startedAt: addMinutes(new Date(), -50),
    });
    const submitToken = (
      await callApi(proctorHandler, {
        method: 'POST',
        token: proctorToken,
        query: { resource: 'tokens', action: 'issue' },
        body: { kind: 'submit', sessionId: 'demo_session_bin_1' },
      })
    ).body.token as string;
    const first = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'submit' },
      body: { attemptId, token: submitToken },
    });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const result = first.body.result as { score: number; maxScore: number; status: string };
    expect(result.maxScore).toBe(16);
    expect(result.score).toBeGreaterThanOrEqual(1);

    const second = await callApi(attemptsHandler, {
      method: 'POST',
      token: studentToken,
      query: { action: 'submit' },
      body: { attemptId, token: submitToken },
    });
    expect(second.status).toBe(200);
    expect(second.body.alreadySubmitted).toBe(true);
    const secondResult = second.body.result as { score: number };
    expect(secondResult.score).toBe(result.score);
  });

  it('siswa tidak dapat melihat kunci sebelum hasil dipublikasikan', async () => {
    const res = await callApi(resultsHandler, {
      query: { resource: 'detail', attemptId },
      token: studentToken,
    });
    expect(res.status).toBe(200);
    expect(res.body.allowReview).toBe(false);
    expect((res.body.questions as unknown[]).length).toBe(0);
  });

  it('siswa lain tidak dapat melihat detail pengerjaan orang lain', async () => {
    const res = await callApi(resultsHandler, {
      query: { resource: 'detail', attemptId },
      token: student2Token,
    });
    expect(res.status).toBe(403);
  });

  it('publikasi hasil oleh admin menghormati kebijakan pembahasan ujian', async () => {
    const publish = await callApi(resultsHandler, {
      method: 'POST',
      token: adminToken,
      query: { resource: 'publish' },
      body: { scheduleId: 'demo_schedule_bin_live' },
    });
    expect(publish.status).toBe(200);
    expect(Number(publish.body.published)).toBeGreaterThan(0);

    // Ujian PTS dikonfigurasi allowAnswerReview=false → pembahasan tetap ditutup.
    const review = await callApi(resultsHandler, {
      query: { resource: 'detail', attemptId },
      token: studentToken,
    });
    expect(review.status).toBe(200);
    expect(review.body.allowReview).toBe(false);
    expect((review.body.questions as unknown[]).length).toBe(0);

    // Ujian Matematika (hasil published, allowAnswerReview=true) → pembahasan terbuka.
    const matReview = await callApi(resultsHandler, {
      query: { resource: 'detail', attemptId: 'att__demo_schedule_mat_done__demo_stu_01' },
      token: studentToken,
    });
    expect(matReview.status).toBe(200);
    expect(matReview.body.allowReview).toBe(true);
    const questions = matReview.body.questions as { key: unknown; explanation?: string }[];
    expect(questions.length).toBe(8);
    expect(questions[0].key).toBeTruthy();
  });

  it('hasil siswa tampil setelah dipublikasikan', async () => {
    const res = await callApi(resultsHandler, {
      token: studentToken,
      query: { resource: 'my' },
    });
    expect(res.status).toBe(200);
    const items = res.body.items as { result: { status: string }; schedule: { subjectName: string } }[];
    expect(items.length).toBeGreaterThanOrEqual(1);
    expect(items.every((i) => i.result.status === 'published')).toBe(true);
  });
});

describe('batas waktu & pemulihan otomatis', () => {
  it('menolak penyimpanan setelah waktu ujian berakhir dan mengunci jawaban', async () => {
    const token = await issueStartToken(proctorToken, 'demo_session_bin_1');
    const start = await callApi(attemptsHandler, {
      method: 'POST',
      token: student2Token,
      query: { action: 'start' },
      body: { scheduleId: 'demo_schedule_bin_live', sessionId: 'demo_session_bin_1', token },
    });
    expect(start.status).toBe(200);
    const id = (start.body as { attempt: ExamAttempt }).attempt.id;
    const store = await getStore();
    await store.update<ExamAttempt>('examAttempts', id, {
      endsAt: addMinutes(new Date(), -10),
    });
    const save = await callApi(attemptsHandler, {
      method: 'POST',
      token: student2Token,
      query: { action: 'save' },
      body: { attemptId: id, questionId: 'demo_q_bin_02', value: 'A', seq: 1 },
    });
    expect(save.status).toBe(409);
    expect(errorCode(save.body)).toBe('EXAM_TIME_OVER');
    const attempt = await store.getDoc<ExamAttempt>('examAttempts', id);
    expect(attempt?.status).not.toBe('in_progress');
  });

  it('sweep memfinalisasi pengerjaan yang kedaluwarsa', async () => {
    const token = await issueStartToken(proctorToken, 'demo_session_bin_1');
    const start = await callApi(attemptsHandler, {
      method: 'POST',
      token: student3Token,
      query: { action: 'start' },
      body: { scheduleId: 'demo_schedule_bin_live', sessionId: 'demo_session_bin_1', token },
    });
    expect(start.status).toBe(200);
    const id = (start.body as { attempt: ExamAttempt }).attempt.id;
    const store = await getStore();
    await store.update<ExamAttempt>('examAttempts', id, { endsAt: addMinutes(new Date(), -5) });
    const sweep = await callApi(attemptsHandler, {
      token: adminToken,
      query: { action: 'sweep' },
    });
    expect(sweep.status).toBe(200);
    expect(Number(sweep.body.finalized)).toBeGreaterThanOrEqual(1);
    const attempt = await store.getDoc<ExamAttempt>('examAttempts', id);
    expect(attempt?.status).toBe('submitted');
    expect(attempt?.autoSubmitted).toBe(true);
  });
});

describe('laporan & analisis', () => {
  it('laporan hasil memuat statistik dari data nyata', async () => {
    const res = await callApi(reportsHandler, {
      query: { resource: 'results', scheduleId: 'demo_schedule_mat_done' },
      token: adminToken,
    });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    const report = res.body as {
      rows: unknown[];
      summary: { mean: number; completed: number; absent: number; passRate: number };
      byClass: unknown[];
      distribution: unknown[];
    };
    expect(report.rows.length).toBe(24);
    expect(report.summary.completed).toBe(24);
    expect(report.summary.mean).toBeGreaterThan(0);
    expect(report.byClass.length).toBe(2);
    expect(report.distribution.length).toBe(5);
  });

  it('analisis butir soal menghitung kesukaran, daya pembeda, dan reliabilitas', async () => {
    const res = await callApi(reportsHandler, {
      query: { resource: 'item-analysis', scheduleId: 'demo_schedule_mat_done' },
      token: teacherToken,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      rows: { difficulty: number; discrimination: number | null; recommendation: string }[];
      reliability: { alpha: number | null };
      respondents: number;
    };
    expect(body.rows.length).toBe(8);
    expect(body.respondents).toBe(24);
    expect(body.rows.every((r) => r.difficulty >= 0 && r.difficulty <= 1)).toBe(true);
    expect(body.rows.some((r) => r.discrimination !== null)).toBe(true);
    expect(typeof body.reliability.alpha === 'number' || body.reliability.alpha === null).toBe(true);
  });

  it('guru tanpa kewenangan mata pelajaran/kelas ditolak', async () => {
    const loginGuru2 = await login(authHandler, 'guru2@neotest.demo', PASS);
    // Guru2 mengampu Bahasa Indonesia dan wali kelas 9B.
    // Jadwal IPA hanya untuk kelas 9A (wali kelas guru1) → harus ditolak.
    const res = await callApi(reportsHandler, {
      query: { resource: 'results', scheduleId: 'demo_schedule_ipa_soon' },
      token: loginGuru2.token,
    });
    expect(res.status).toBe(403);
  });

  it('proktor tidak dapat mengakses analisis nilai', async () => {
    const res = await callApi(reportsHandler, {
      query: { resource: 'results', scheduleId: 'demo_schedule_mat_done' },
      token: proctorToken,
    });
    expect(res.status).toBe(403);
  });

  it('daftar hadir & berita acara diambil dari database', async () => {
    const attendance = await callApi(reportsHandler, {
      query: { resource: 'attendance', sessionId: 'demo_session_mat_1' },
      token: proctorToken,
    });
    expect(attendance.status).toBe(200);
    const doc = attendance.body as {
      school: { name: string; letterhead: { headmasterName: string } };
      participants: unknown[];
      generatedFrom: string;
    };
    expect(doc.school.name).toContain('SMP');
    expect(doc.participants.length).toBe(12);
    expect(doc.generatedFrom).toBe('database');

    const berita = await callApi(reportsHandler, {
      query: { resource: 'berita-acara', sessionId: 'demo_session_mat_1' },
      token: proctorToken,
    });
    expect(berita.status).toBe(200);
    expect((berita.body as { counts: { scheduled: number } }).counts.scheduled).toBe(12);
  });

  it('ekspor CSV berisi baris hasil', async () => {
    const res = await callApi(reportsHandler, {
      query: { resource: 'export-results', scheduleId: 'demo_schedule_mat_done' },
      token: adminToken,
    });
    expect(res.status).toBe(200);
    const raw = String(res.body.raw);
    expect(raw).toContain('No Peserta');
    expect(raw.split('\r\n').length).toBeGreaterThan(20);
  });
});

describe('impor siswa', () => {
  it('menolak duplikasi NISN dan nomor peserta dengan laporan kesalahan', async () => {
    const res = await callApi(adminHandler, {
      method: 'POST',
      token: adminToken,
      query: { resource: 'import-students' },
      body: {
        schoolId: 'demo_school_smp1',
        dryRun: true,
        rows: [
          { nisn: '00510001001', participantNo: '01', fullName: 'Duplikat Satu', gender: 'L', className: '9A' },
          { nisn: '00510001001', participantNo: '99', fullName: 'Duplikat Dua', gender: 'P', className: '9A' },
          { nisn: '123', participantNo: '100', fullName: 'X', gender: 'Z', className: '9Z' },
          { nisn: '999999999999', participantNo: '101', fullName: 'Siswa Baru', gender: 'L', className: '9A' },
        ],
      },
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      dryRun: boolean;
      validated: number;
      invalid: number;
      errors: { row: number; message: string }[];
    };
    expect(body.dryRun).toBe(true);
    expect(body.errors.length).toBeGreaterThan(0);
    expect(body.errors.some((e) => e.message.includes('duplikat'))).toBe(true);
    expect(body.invalid).toBe(3);
  });
});

describe('pemisahan sekolah', () => {
  it('superadmin dapat membuat sekolah baru; admin tidak', async () => {
    const forbidden = await callApi(adminHandler, {
      method: 'POST',
      token: adminToken,
      query: { resource: 'schools' },
      body: {
        code: 'TESTSCH',
        npsn: '12345678',
        name: 'SMP Test',
        level: 'SMP',
        address: 'Jl. Test',
        city: 'Surabaya',
        province: 'Jawa Timur',
        email: 'test@sekolah.id',
        active: true,
      },
    });
    expect(forbidden.status).toBe(403);
    const created = await callApi(adminHandler, {
      method: 'POST',
      token: superToken,
      query: { resource: 'schools' },
      body: {
        code: 'TESTSCH',
        npsn: '12345678',
        name: 'SMP Test',
        level: 'SMP',
        address: 'Jl. Test',
        city: 'Surabaya',
        province: 'Jawa Timur',
        email: 'test@sekolah.id',
        active: true,
        letterhead: { headmasterName: 'Kepala Test', headmasterNip: '123' },
      },
    });
    expect(created.status, JSON.stringify(created.body)).toBe(201);
    const list = await callApi(adminHandler, {
      query: { resource: 'schools', q: 'SMP Test' },
      token: superToken,
    });
    expect(list.status).toBe(200);
    const items = list.body.items as { name: string }[];
    expect(items.some((s) => s.name === 'SMP Test')).toBe(true);
  });
});

describe('dashboard & kuota', () => {
  it('dashboard admin berisi kartu nyata dan perkiraan kuota', async () => {
    const res = await callApi(adminHandler, {
      query: { resource: 'dashboard' },
      token: adminToken,
    });
    expect(res.status).toBe(200);
    const body = res.body as {
      cards: { key: string; value: string }[];
      quota: { reads: number; estimated: boolean };
      upcoming: unknown[];
    };
    expect(body.cards.length).toBeGreaterThanOrEqual(4);
    expect(body.quota.estimated).toBe(true);
    expect(body.quota.reads).toBeGreaterThan(0);
  });

  it('proktor hanya melihat sesi yang ditugaskan', async () => {
    const res = await callApi(proctorHandler, {
      query: { resource: 'sessions', all: '1' },
      token: proctorToken,
    });
    expect(res.status).toBe(200);
    const items = res.body.items as { session: { proctorId: string } }[];
    expect(items.length).toBeGreaterThan(0);
    expect(items.every((s) => s.session.proctorId === 'demo_proctor_1')).toBe(true);
  });
});
