import { endpoint, json, type ApiRequest, type ApiResponse } from './_lib/http';
import { requireAuth, resolveSchoolId, type AuthContext } from './_lib/auth';
import { errors } from './_lib/errors';
import { getStore } from './_lib/store';
import {
  createRecord,
  listCollection,
  parseBody,
  parsePage,
  softDeleteRecord,
  updateRecord,
} from './_lib/rest';
import {
  examTypeSchema,
  formSchema,
  questionSchema,
  scheduleSchema,
} from '../src/shared/schemas';
import { sanitizeRichText, stripTags } from './_lib/sanitize';
import { compositeId, newId, searchKeyOf, sha256Hex } from './_lib/ids';
import { serverNowIso } from './_lib/clock';
import { hasPermission } from '../src/shared/permissions';
import { AUDIT_ACTIONS, writeAudit } from './_lib/audit';
import { closeSession, openSession } from './_lib/services/sessions';
import type {
  ClassRoom,
  ExamForm,
  ExamFormVersion,
  ExamParticipant,
  ExamRoom,
  ExamSchedule,
  ExamSession,
  ExamType,
  Proctor,
  Question,
  QuestionBank,
  QuestionKey,
  QuestionOption,
  QuestionType,
  Stimulus,
  Student,
  Subject,
  User,
  VersionQuestion,
} from '../src/shared/types';

function requireWriter(
  auth: AuthContext,
  permission: 'question.manage' | 'form.manage' | 'schedule.manage' | 'examtype.manage',
): void {
  if (!hasPermission(auth.roles, permission)) throw errors.forbidden();
}

function sanitizeOptions(options: QuestionOption[]): QuestionOption[] {
  return options.map((o) => ({ id: o.id, text: sanitizeRichText(o.text) }));
}

function validateKeyShape(
  type: QuestionType,
  options: QuestionOption[],
  pairs: { id: string }[],
  key: { correct?: unknown },
  points: number,
): QuestionKey['correct'] {
  const correct = key.correct;
  const optionIds = options.map((o) => o.id);
  switch (type) {
    case 'mcq':
      if (typeof correct !== 'string' || !optionIds.includes(correct)) {
        throw errors.validation('Kunci jawaban pilihan ganda harus salah satu opsi yang tersedia.');
      }
      if (optionIds.length < 2) throw errors.validation('Soal pilihan ganda minimal memiliki 2 opsi.');
      return correct;
    case 'complex': {
      if (!Array.isArray(correct) || correct.length === 0) {
        throw errors.validation('Kunci jawaban pilihan ganda kompleks harus minimal satu opsi.');
      }
      const ids = [...new Set(correct.map(String))];
      if (!ids.every((id) => optionIds.includes(id))) {
        throw errors.validation('Ada opsi kunci jawaban yang tidak dikenal.');
      }
      if (optionIds.length < 2) throw errors.validation('Soal pilihan ganda minimal memiliki 2 opsi.');
      return ids;
    }
    case 'truefalse':
      if (typeof correct !== 'boolean') throw errors.validation('Kunci benar/salah harus boolean.');
      return correct;
    case 'matching': {
      if (pairs.length < 2) throw errors.validation('Soal menjodohkan minimal memiliki 2 pasangan.');
      if (!correct || typeof correct !== 'object' || Array.isArray(correct)) {
        throw errors.validation('Kunci menjodohkan tidak valid.');
      }
      const pairIds = pairs.map((p) => p.id);
      const entries = Object.entries(correct as Record<string, unknown>);
      if (entries.length !== pairs.length) {
        throw errors.validation('Setiap pasangan kiri harus memiliki pasangan kanan.');
      }
      for (const [left, right] of entries) {
        if (!pairIds.includes(left) || !pairIds.includes(String(right))) {
          throw errors.validation('Kunci menjodohkan memuat pasangan yang tidak dikenal.');
        }
      }
      return correct as Record<string, string>;
    }
    case 'short': {
      const list = Array.isArray(correct) ? correct.map(String) : [String(correct ?? '')];
      const cleaned = list.map((s) => s.trim()).filter(Boolean);
      if (cleaned.length === 0) throw errors.validation('Isian singkat memerlukan minimal satu jawaban diterima.');
      return cleaned;
    }
    case 'essay': {
      const rubric = (key as { rubric?: { id: string; criterion: string; points: number }[] }).rubric ?? [];
      const total = rubric.reduce((a, r) => a + r.points, 0);
      return {
        text: String(correct ?? ''),
        rubric,
        rubricTotal: total,
        points,
      };
    }
    default:
      throw errors.validation('Tipe soal tidak didukung.');
  }
}

async function handleQuestions(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  requireWriter(auth, 'question.manage');
  const store = await getStore();
  const id = req.query.id;

  if (req.method === 'GET' && id) {
    const question = await store.getDoc<Question>('questions', id);
    if (!question) throw errors.notFound('Soal tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && question.schoolId !== auth.schoolId) throw errors.forbidden();
    const key = await store.getDoc<QuestionKey>('answerKeys', id);
    return json({ question, key: auth.roles.includes('student') ? null : key });
  }

  if (req.method === 'GET' && req.query.format === 'csv') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const rows = await store.query<Question>('questions', {
      where: [
        ...(schoolId ? [{ field: 'schoolId' as const, op: '==' as const, value: schoolId }] : []),
        { field: 'deletedAt', op: '==', value: null },
      ],
      limit: 3000,
    });
    const subjects = await store.query<Subject>('subjects', {
      where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
      limit: 300,
    });
    const banks = await store.query<QuestionBank>('questionBanks', {
      where: schoolId ? [{ field: 'schoolId', op: '==', value: schoolId }] : [],
      limit: 300,
    });
    const subjectName = new Map(subjects.map((s) => [s.id, `${s.code} — ${s.name}`]));
    const bankName = new Map(banks.map((b) => [b.id, b.name]));
    const escape = (value: unknown) => {
      const text = value === null || value === undefined ? '' : String(value);
      return /[",\n;]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
    };
    const header = ['type', 'subject', 'bank', 'content', 'statement', 'options', 'key', 'points', 'difficulty', 'status', 'tags', 'competency', 'explanation'];
    const lines = [header.join(',')];
    for (const row of rows) {
      const key = await store.getDoc<QuestionKey>('answerKeys', row.id);
      let keyText = '';
      const correct = key?.correct;
      if (row.type === 'mcq') keyText = String(correct ?? '');
      else if (row.type === 'complex') keyText = Array.isArray(correct) ? correct.join('|') : '';
      else if (row.type === 'truefalse') keyText = correct ? 'BENAR' : 'SALAH';
      else if (row.type === 'short') keyText = Array.isArray(correct) ? correct.join('|') : '';
      else if (row.type === 'matching' && correct && typeof correct === 'object') {
        keyText = Object.entries(correct as Record<string, string>)
          .map(([left, right]) => `${left}>${right}`)
          .join('|');
      } else if (row.type === 'essay') keyText = String((correct as { text?: string } | null)?.text ?? '');
      lines.push(
        [
          row.type,
          subjectName.get(row.subjectId) ?? row.subjectId,
          bankName.get(row.bankId) ?? row.bankId,
          stripTags(row.content),
          row.statement ?? '',
          row.options.map((o) => `${o.id}: ${stripTags(o.text)}`).join(' | '),
          keyText,
          row.points,
          row.difficulty,
          row.status,
          row.tags.join(' '),
          row.competency ?? '',
          stripTags(row.explanation ?? ''),
        ]
          .map(escape)
          .join(','),
      );
    }
    return {
      raw: `\uFEFF${lines.join('\r\n')}`,
      contentType: 'text/csv; charset=utf-8',
      headers: { 'Content-Disposition': 'attachment; filename="bank-soal.csv"' },
    };
  }

  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const { page, pageSize } = parsePage(req);
    const result = await listCollection<Question>({
      collection: 'questions',
      auth,
      schoolId,
      search: req.query.q,
      searchFields: ['searchKey'],
      page,
      pageSize,
      orderBy: [{ field: 'createdAt', dir: 'desc' }],
      extraFilter:
        req.query.bankId || req.query.subjectId || req.query.type || req.query.status
          ? (doc) =>
              (!req.query.bankId || doc.bankId === req.query.bankId) &&
              (!req.query.subjectId || doc.subjectId === req.query.subjectId) &&
              (!req.query.type || doc.type === req.query.type) &&
              (!req.query.status || doc.status === req.query.status)
          : undefined,
    });
    return json(result);
  }

  if (req.method === 'POST') {
    const body = await parseBody(questionSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    const bank = await store.getDoc<QuestionBank>('questionBanks', body.bankId);
    if (!bank || bank.schoolId !== schoolId) throw errors.validation('Bank soal tidak valid.');
    const options = sanitizeOptions(body.options);
    const pairs = body.pairs.map((p) => ({ id: p.id, left: p.left, right: p.right }));
    const correct = validateKeyShape(body.type, options, pairs, body.key, body.points);
    const questionId = newId('q');
    const now = serverNowIso();
    const question: Question = {
      id: questionId,
      schoolId,
      bankId: body.bankId,
      subjectId: body.subjectId,
      type: body.type,
      stimulusId: body.stimulusId ?? null,
      content: sanitizeRichText(body.content),
      options,
      pairs,
      statement: sanitizeRichText(body.statement ?? ''),
      acceptedCount: body.type === 'short' ? (correct as string[]).length : undefined,
      points: body.points,
      difficulty: body.difficulty,
      tags: body.tags,
      competency: body.competency,
      status: body.status,
      explanation: sanitizeRichText(body.explanation ?? ''),
      createdBy: auth.user.id,
      updatedBy: auth.user.id,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      searchKey: searchKeyOf(stripTags(body.content), body.tags.join(' '), body.competency ?? ''),
    } as Question;
    const key: QuestionKey = {
      id: questionId,
      questionId,
      type: body.type,
      correct,
      points: body.points,
      rubric: (body.key as { rubric?: QuestionKey['rubric'] }).rubric,
    };
    await store.transaction(async (tx) => {
      await tx.set('questions', questionId, question as unknown as Question & { id: string });
      await tx.set('answerKeys', questionId, key as unknown as QuestionKey & { id: string });
    });
    return json({ question, key }, 201);
  }

  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<Question>('questions', id);
    if (!existing) throw errors.notFound('Soal tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const body = await parseBody(questionSchema, req.body);
    const options = sanitizeOptions(body.options);
    const pairs = body.pairs;
    const correct = validateKeyShape(body.type, options, pairs, body.key, body.points);
    const updated: Question = {
      ...existing,
      type: body.type,
      stimulusId: body.stimulusId ?? null,
      content: sanitizeRichText(body.content),
      options,
      pairs,
      statement: sanitizeRichText(body.statement ?? ''),
      acceptedCount: body.type === 'short' ? (correct as string[]).length : undefined,
      points: body.points,
      difficulty: body.difficulty,
      tags: body.tags,
      competency: body.competency,
      status: body.status,
      explanation: sanitizeRichText(body.explanation ?? ''),
      updatedBy: auth.user.id,
      updatedAt: serverNowIso(),
      searchKey: searchKeyOf(stripTags(body.content), body.tags.join(' '), body.competency ?? ''),
    };
    const key: QuestionKey = {
      id,
      questionId: id,
      type: body.type,
      correct,
      points: body.points,
      rubric: (body.key as { rubric?: QuestionKey['rubric'] }).rubric,
    };
    await store.transaction(async (tx) => {
      await tx.set('questions', id, updated as unknown as Question & { id: string });
      await tx.set('answerKeys', id, key as unknown as QuestionKey & { id: string });
    });
    return json({ question: updated, key });
  }

  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const used = await store.count('versionQuestions', {
      where: [{ field: 'questionId', op: '==', value: id }],
    });
    if (used > 0) {
      throw errors.conflict(
        'Soal sudah dipakai pada paket yang diterbitkan. Nonaktifkan atau ubah status menjadi draf; riwayat tetap tersimpan.',
      );
    }
    await softDeleteRecord('questions', id);
    await store.remove('answerKeys', id);
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

function validateVersionConversion(question: Question, key: QuestionKey): void {
  if (!key) throw errors.validation('Soal belum memiliki kunci jawaban.');
  void question;
}

async function publishForm(auth: AuthContext, formId: string, ip?: string): Promise<ExamFormVersion> {
  const store = await getStore();
  const form = await store.getDoc<ExamForm>('examForms', formId);
  if (!form) throw errors.notFound('Paket ujian tidak ditemukan.');
  if (!auth.roles.includes('superadmin') && form.schoolId !== auth.schoolId) throw errors.forbidden();
  if (form.questionIds.length === 0) throw errors.validation('Paket ujian belum memiliki soal.');
  const questions = await Promise.all(form.questionIds.map((qid) => store.getDoc<Question>('questions', qid)));
  const keys = await Promise.all(form.questionIds.map((qid) => store.getDoc<QuestionKey>('answerKeys', qid)));
  let totalPoints = 0;
  questions.forEach((question, index) => {
    if (!question) throw errors.validation('Ada soal yang tidak ditemukan pada bank soal.');
    if (question.schoolId !== form.schoolId) throw errors.validation('Soal berasal dari sekolah lain.');
    if (question.subjectId !== form.subjectId) {
      throw errors.validation('Semua soal harus dari mata pelajaran yang sama dengan paket.');
    }
    validateVersionConversion(question, keys[index]!);
    totalPoints += question.points;
  });
  const version = (form.currentVersion ?? 0) + 1;
  const versionId = compositeId('ver', formId, String(version));
  const createdAt = serverNowIso();
  const versionQuestions: (VersionQuestion & { searchKey?: string })[] = [];
  for (let index = 0; index < questions.length; index++) {
    const question = questions[index]!;
    const stimulus = question.stimulusId
      ? await store.getDoc<Stimulus>('stimuli', question.stimulusId)
      : null;
    versionQuestions.push({
      id: compositeId(versionId, question.id),
      versionId,
      formId,
      questionId: question.id,
      order: index,
      type: question.type,
      content: question.content,
      options: question.options,
      pairs: question.pairs,
      statement: question.statement,
      points: question.points,
      stimulus: stimulus
        ? { title: stimulus.title, content: stimulus.content, imageUrl: stimulus.imageUrl, tableHtml: stimulus.tableHtml }
        : null,
      tags: question.tags,
      competency: question.competency,
    });
  }
  const snapshot: ExamFormVersion = {
    id: versionId,
    formId,
    schoolId: form.schoolId,
    version,
    examTypeId: form.examTypeId,
    subjectId: form.subjectId,
    totalPoints,
    questionIdsOrdered: form.questionIds,
    createdAt,
    createdBy: auth.user.id,
    checksum: sha256Hex(JSON.stringify(versionQuestions.map((q) => [q.questionId, q.content, q.options, q.points]))),
  };
  await store.transaction(async (tx) => {
    await tx.set('examFormVersions', versionId, snapshot as unknown as ExamFormVersion & { id: string });
    for (const vq of versionQuestions) {
      await tx.set('versionQuestions', vq.id, vq as unknown as VersionQuestion & { id: string });
    }
    await tx.update<ExamForm>('examForms', formId, {
      status: 'published',
      currentVersion: version,
      currentVersionId: versionId,
      totalPoints,
      updatedAt: createdAt,
    });
  });
  await writeAudit({
    schoolId: form.schoolId,
    actorId: auth.user.id,
    actorName: auth.user.displayName,
    actorRole: auth.roles[0],
    action: AUDIT_ACTIONS.formPublish,
    targetType: 'examForms',
    targetId: formId,
    meta: { version, totalPoints, questions: versionQuestions.length, checksum: snapshot.checksum },
    ip,
  });
  return snapshot;
}

async function handleForms(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  requireWriter(auth, 'form.manage');
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET' && id) {
    const form = await store.getDoc<ExamForm>('examForms', id);
    if (!form) throw errors.notFound('Paket tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && form.schoolId !== auth.schoolId) throw errors.forbidden();
    const questions = await Promise.all(form.questionIds.map((qid) => store.getDoc<Question>('questions', qid)));
    return json({ doc: form, questions: questions.filter(Boolean) });
  }
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const { page, pageSize } = parsePage(req);
    return json(
      await listCollection<ExamForm>({
        collection: 'examForms',
        auth,
        schoolId,
        search: req.query.q,
        searchFields: ['name'],
        page,
        pageSize,
        orderBy: [{ field: 'updatedAt', dir: 'desc' }],
        extraFilter:
          req.query.status || req.query.examTypeId
            ? (doc) =>
                (!req.query.status || doc.status === req.query.status) &&
                (!req.query.examTypeId || doc.examTypeId === req.query.examTypeId)
            : undefined,
      }),
    );
  }
  if (req.method === 'POST') {
    const body = await parseBody(formSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    const questions = await Promise.all(
      body.questionIds.map((qid) => store.getDoc<Question>('questions', qid)),
    );
    if (questions.some((q) => !q || q.schoolId !== schoolId || q.subjectId !== body.subjectId)) {
      throw errors.validation('Semua soal harus milik sekolah dan mata pelajaran yang sama.');
    }
    const doc = await createRecord<ExamForm>('examForms', {
      ...body,
      schoolId,
      createdBy: auth.user.id,
      currentVersion: 0,
      currentVersionId: null,
      totalPoints: questions.reduce((a, q) => a + (q?.points ?? 0), 0),
      status: body.status,
    }, { searchFields: ['name'] });
    return json({ doc }, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<ExamForm>('examForms', id);
    if (!existing) throw errors.notFound('Paket tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    const body = await parseBody(formSchema.partial(), req.body);
    if (existing.currentVersionId && body.questionIds) {
      const schedules = await store.count('examSchedules', {
        where: [
          { field: 'formId', op: '==', value: id },
          { field: 'status', op: '==', value: 'ongoing' },
        ],
      });
      if (schedules > 0) throw errors.conflict('Paket sedang dipakai ujian berlangsung.');
    }
    let totalPoints = existing.totalPoints;
    if (body.questionIds) {
      const questions = await Promise.all(
        body.questionIds.map((qid) => store.getDoc<Question>('questions', qid)),
      );
      totalPoints = questions.reduce((a, q) => a + (q?.points ?? 0), 0);
    }
    const doc = await updateRecord<ExamForm>('examForms', id, { ...body, totalPoints }, {
      searchFields: ['name'],
    });
    return json({ doc });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const used = await store.count('examSchedules', {
      where: [{ field: 'formId', op: '==', value: id }],
    });
    if (used > 0) throw errors.conflict('Paket sudah dipakai pada jadwal ujian dan tidak dapat dihapus.');
    await softDeleteRecord('examForms', id);
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

async function handleSchedules(auth: AuthContext, req: ApiRequest): Promise<ApiResponse> {
  requireWriter(auth, 'schedule.manage');
  const store = await getStore();
  const id = req.query.id;
  if (req.method === 'GET' && id) {
    const schedule = await store.getDoc<ExamSchedule>('examSchedules', id);
    if (!schedule) throw errors.notFound('Jadwal tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && schedule.schoolId !== auth.schoolId) throw errors.forbidden();
    const [sessions, participants] = await Promise.all([
      store.query<ExamSession>('examSessions', {
        where: [{ field: 'scheduleId', op: '==', value: id }],
        limit: 50,
      }),
      store.query<ExamParticipant>('examParticipants', {
        where: [{ field: 'scheduleId', op: '==', value: id }],
        limit: 1000,
      }),
    ]);
    const rooms = await store.query<ExamRoom>('rooms', {
      where: [{ field: 'schoolId', op: '==', value: schedule.schoolId }],
      limit: 100,
    });
    const proctors = await store.query<Proctor>('proctors', {
      where: [{ field: 'schoolId', op: '==', value: schedule.schoolId }],
      limit: 200,
    });
    return json({
      doc: schedule,
      sessions: sessions
        .sort((a, b) => a.startsAt.localeCompare(b.startsAt))
        .map((s) => ({
          ...s,
          roomName: rooms.find((r) => r.id === s.roomId)?.name ?? '',
          proctorName: proctors.find((p) => p.id === s.proctorId)?.fullName ?? '',
        })),
      participants: participants.sort((a, b) => a.participantNo.localeCompare(b.participantNo)),
    });
  }
  if (req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const { page, pageSize } = parsePage(req);
    return json(
      await listCollection<ExamSchedule>({
        collection: 'examSchedules',
        auth,
        schoolId,
        search: req.query.q,
        searchFields: ['title'],
        page,
        pageSize,
        orderBy: [{ field: 'date', dir: 'desc' }],
        extraFilter: req.query.status
          ? (doc) => doc.status === req.query.status
          : undefined,
      }),
    );
  }
  if (req.method === 'POST') {
    const body = await parseBody(scheduleSchema, req.body);
    const schoolId = resolveSchoolId(auth, body.schoolId);
    const [form, examType] = await Promise.all([
      store.getDoc<ExamForm>('examForms', body.formId),
      store.getDoc<ExamType>('examTypes', body.examTypeId),
    ]);
    if (!form || form.schoolId !== schoolId) throw errors.validation('Paket ujian tidak valid.');
    if (!form.currentVersionId) {
      throw errors.validation('Paket ujian belum diterbitkan. Terbitkan paket terlebih dahulu.');
    }
    if (!examType || examType.schoolId !== schoolId) throw errors.validation('Jenis ujian tidak valid.');
    if (form.examTypeId !== examType.id) {
      throw errors.validation('Paket ujian tidak sesuai dengan jenis ujian yang dipilih.');
    }
    const rooms = await Promise.all(body.sessions.map((s) => store.getDoc<ExamRoom>('rooms', s.roomId)));
    const proctors = await Promise.all(
      body.sessions.map((s) => store.getDoc<Proctor>('proctors', s.proctorId)),
    );
    body.sessions.forEach((s, i) => {
      if (!rooms[i] || rooms[i]!.schoolId !== schoolId) throw errors.validation('Ruang sesi tidak valid.');
      if (!proctors[i] || proctors[i]!.schoolId !== schoolId) {
        throw errors.validation('Proktor sesi tidak valid.');
      }
      if (new Date(s.endsAt).getTime() <= new Date(s.startsAt).getTime()) {
        throw errors.validation('Waktu selesai sesi harus setelah waktu mulai.');
      }
    });

    const classes = await Promise.all(body.classIds.map((cid) => store.getDoc<ClassRoom>('classes', cid)));
    classes.forEach((c) => {
      if (!c || c.schoolId !== schoolId) throw errors.validation('Kelas tidak valid.');
    });

    const participantsSource = await store.query<Student>('students', {
      where: [
        { field: 'schoolId', op: '==', value: schoolId },
        { field: 'deletedAt', op: '==', value: null },
        { field: 'active', op: '==', value: true },
      ],
      limit: 1000,
    });
    const eligible = participantsSource
      .filter((s) => body.classIds.includes(s.classId))
      .sort((a, b) => a.participantNo.localeCompare(b.participantNo));
    if (eligible.length === 0) throw errors.validation('Tidak ada siswa aktif pada kelas yang dipilih.');
    const totalCapacity = rooms.reduce((a, r) => a + (r?.capacity ?? 0), 0);
    if (eligible.length > totalCapacity) {
      throw errors.validation(
        `Kapasitas ruang tidak cukup: ${eligible.length} peserta, kapasitas ${totalCapacity}. Tambah ruang/sesi.`,
      );
    }

    const scheduleId = newId('sched');
    const now = serverNowIso();
    const sessionDocs: ExamSession[] = body.sessions.map((s, index) => ({
      id: newId('sess'),
      schoolId,
      scheduleId,
      code: s.code || `S${index + 1}`,
      roomId: s.roomId,
      proctorId: s.proctorId,
      startsAt: new Date(s.startsAt).toISOString(),
      endsAt: new Date(s.endsAt).toISOString(),
      openedAt: null,
      openedBy: null,
      closedAt: null,
      status: 'preparation',
      participantCount: 0,
    }));

    // Distribusi peserta: isi sesi sesuai kapasitas ruang, urut nomor peserta.
    const assignments = new Map<string, { session: ExamSession; students: Student[] }>();
    sessionDocs.forEach((s) => assignments.set(s.id, { session: s, students: [] }));
    let cursor = 0;
    for (const student of eligible) {
      let placed = false;
      for (const session of sessionDocs) {
        const bucket = assignments.get(session.id)!;
        const room = rooms[sessionDocs.indexOf(session)]!;
        if (bucket.students.length < room.capacity) {
          bucket.students.push(student);
          placed = true;
          break;
        }
      }
      if (!placed) throw errors.validation('Kapasitas sesi tidak cukup untuk seluruh peserta kelas.');
      cursor += 1;
    }
    void cursor;

    const participantDocs: ExamParticipant[] = [];
    for (const session of sessionDocs) {
      const bucket = assignments.get(session.id)!;
      for (const student of bucket.students) {
        participantDocs.push({
          id: newId('part'),
          schoolId,
          scheduleId,
          sessionId: session.id,
          examTypeId: examType.id,
          formVersionId: form.currentVersionId,
          studentId: student.id,
          classId: student.classId,
          participantNo: student.participantNo,
          fullName: student.fullName,
          roomId: session.roomId,
          proctorId: session.proctorId,
          status: 'scheduled',
          attendance: 'present',
          startedAt: null,
          submittedAt: null,
          lastSeenAt: null,
        });
      }
      session.participantCount = bucket.students.length;
    }

    const schedule: ExamSchedule = {
      id: scheduleId,
      schoolId,
      examTypeId: examType.id,
      formId: form.id,
      formVersionId: form.currentVersionId,
      subjectId: form.subjectId,
      academicYearId: form.academicYearId,
      title: body.title,
      date: body.date,
      startTime: body.startTime,
      endTime: body.endTime,
      classIds: body.classIds,
      durationMinutes: body.durationMinutes,
      status: 'scheduled',
      sessionCount: sessionDocs.length,
      participantCount: participantDocs.length,
      createdAt: now,
      updatedAt: now,
      deletedAt: null,
      searchKey: searchKeyOf(body.title),
    };

    await store.transaction(async (tx) => {
      await tx.set('examSchedules', scheduleId, schedule as unknown as ExamSchedule & { id: string });
      for (const session of sessionDocs) {
        await tx.set('examSessions', session.id, session as unknown as ExamSession & { id: string });
      }
      for (const participant of participantDocs) {
        await tx.set('examParticipants', participant.id, participant as unknown as ExamParticipant & { id: string });
      }
    });
    return json({ doc: schedule, sessions: sessionDocs, participants: participantDocs.length }, 201);
  }
  if (req.method === 'PATCH') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const existing = await store.getDoc<ExamSchedule>('examSchedules', id);
    if (!existing) throw errors.notFound('Jadwal tidak ditemukan.');
    if (!auth.roles.includes('superadmin') && existing.schoolId !== auth.schoolId) throw errors.forbidden();
    if (existing.status === 'completed') throw errors.conflict('Jadwal selesai tidak dapat diubah.');
    const raw = (req.body ?? {}) as Partial<ExamSchedule>;
    const patch: Partial<ExamSchedule> = {};
    if (raw.title) patch.title = String(raw.title).slice(0, 160);
    if (raw.date) patch.date = String(raw.date);
    if (raw.startTime) patch.startTime = String(raw.startTime);
    if (raw.endTime) patch.endTime = String(raw.endTime);
    if (raw.status && ['preparation', 'scheduled', 'ongoing', 'completed', 'cancelled'].includes(raw.status)) {
      patch.status = raw.status;
    }
    const doc = await store.update<ExamSchedule>('examSchedules', id, {
      ...patch,
      updatedAt: serverNowIso(),
    });
    return json({ doc });
  }
  if (req.method === 'DELETE') {
    if (!id) throw errors.validation('id wajib disertakan.');
    const results = await store.count('examResults', {
      where: [{ field: 'scheduleId', op: '==', value: id }],
    });
    if (results > 0) {
      throw errors.conflict(
        'Jadwal sudah memiliki hasil. Riwayat harus dipertahankan; batalkan jadwal alih-alih menghapus.',
      );
    }
    await softDeleteRecord('examSchedules', id);
    return json({ ok: true });
  }
  throw errors.validation('Metode tidak didukung.');
}

export default endpoint(async (req) => {
  const resource = req.query.resource ?? '';
  const auth = await requireAuth(req);
  const action = req.query.action ?? '';
  const store = await getStore();

  if (resource === 'types') {
    requireWriter(auth, 'examtype.manage');
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<ExamType>({
          collection: 'examTypes',
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
      const body = await parseBody(examTypeSchema, req.body);
      const schoolId = resolveSchoolId(auth, body.schoolId);
      const dup = await store.query<ExamType>('examTypes', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'code', op: '==', value: body.code },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 1,
      });
      if (dup.length > 0) throw errors.conflict('Kode jenis ujian sudah digunakan.');
      const doc = await createRecord<ExamType>('examTypes', { ...body, schoolId }, {
        searchFields: ['name', 'code'],
      });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const id = req.query.id ?? '';
      const body = await parseBody(examTypeSchema.partial(), req.body);
      const doc = await updateRecord<ExamType>('examTypes', id, { ...body }, {
        searchFields: ['name', 'code'],
      });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      await softDeleteRecord('examTypes', req.query.id ?? '');
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'banks') {
    requireWriter(auth, 'question.manage');
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const { page, pageSize } = parsePage(req);
      return json(
        await listCollection<QuestionBank>({
          collection: 'questionBanks',
          auth,
          schoolId,
          search: req.query.q,
          searchFields: ['name'],
          page,
          pageSize,
          orderBy: [{ field: 'name', dir: 'asc' }],
          extraFilter: req.query.subjectId ? (doc) => doc.subjectId === req.query.subjectId : undefined,
        }),
      );
    }
    if (req.method === 'POST') {
      const raw = req.body as {
        schoolId?: string;
        name?: string;
        subjectId?: string;
        academicYearId?: string;
        description?: string;
      };
      const schoolId = resolveSchoolId(auth, raw.schoolId, { require: !auth.roles.includes('superadmin') });
      if (!raw.name || !raw.subjectId || !raw.academicYearId) {
        throw errors.validation('Nama, mata pelajaran, dan tahun ajaran wajib diisi.');
      }
      const doc = await createRecord<QuestionBank>('questionBanks', {
        schoolId,
        name: String(raw.name).slice(0, 120),
        subjectId: raw.subjectId,
        academicYearId: raw.academicYearId,
        description: sanitizeRichText(raw.description ?? ''),
      }, { searchFields: ['name'] });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const doc = await updateRecord<QuestionBank>('questionBanks', req.query.id ?? '', {
        ...(req.body as Record<string, unknown>),
        updatedAt: serverNowIso(),
      });
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      const count = await store.count('questions', {
        where: [
          { field: 'bankId', op: '==', value: req.query.id ?? '' },
          { field: 'deletedAt', op: '==', value: null },
        ],
      });
      if (count > 0) throw errors.conflict('Bank soal masih memiliki soal.');
      await softDeleteRecord('questionBanks', req.query.id ?? '');
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'stimuli') {
    requireWriter(auth, 'question.manage');
    if (req.method === 'GET') {
      const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
      const rows = await store.query<Stimulus>('stimuli', {
        where: [
          { field: 'schoolId', op: '==', value: schoolId },
          { field: 'deletedAt', op: '==', value: null },
        ],
        limit: 200,
      });
      return json({ items: rows });
    }
    if (req.method === 'POST') {
      const raw = req.body as { schoolId?: string; title?: string; content?: string; imageUrl?: string };
      const schoolId = resolveSchoolId(auth, raw.schoolId, { require: !auth.roles.includes('superadmin') });
      if (!raw.title || !raw.content) throw errors.validation('Judul dan isi stimulus wajib diisi.');
      const doc = await createRecord<Stimulus>('stimuli', {
        schoolId,
        title: sanitizeRichText(raw.title),
        content: sanitizeRichText(raw.content),
        imageUrl: raw.imageUrl,
      });
      return json({ doc }, 201);
    }
    if (req.method === 'PATCH') {
      const raw = req.body as Record<string, unknown>;
      const patch: Record<string, unknown> = {};
      if (typeof raw.title === 'string') patch.title = sanitizeRichText(raw.title);
      if (typeof raw.content === 'string') patch.content = sanitizeRichText(raw.content);
      if (typeof raw.imageUrl === 'string') patch.imageUrl = raw.imageUrl;
      const doc = await updateRecord<Stimulus>('stimuli', req.query.id ?? '', patch);
      return json({ doc });
    }
    if (req.method === 'DELETE') {
      await softDeleteRecord('stimuli', req.query.id ?? '');
      return json({ ok: true });
    }
    throw errors.validation('Metode tidak didukung.');
  }

  if (resource === 'questions') return handleQuestions(auth, req);

  if (resource === 'forms') {
    if (req.method === 'POST' && action === 'publish') {
      const body = (req.body ?? {}) as { formId?: string };
      const formId = body.formId ?? req.query.id ?? '';
      const version = await publishForm(auth, formId, req.ip);
      return json({ version });
    }
    return handleForms(auth, req);
  }

  if (resource === 'schedules') return handleSchedules(auth, req);

  if (resource === 'sessions') {
    if (req.method === 'GET') {
      const scheduleId = req.query.scheduleId;
      const sessions = scheduleId
        ? await store.query<ExamSession>('examSessions', {
            where: [{ field: 'scheduleId', op: '==', value: scheduleId }],
            limit: 50,
          })
        : await store.query<ExamSession>('examSessions', {
            where: [
              { field: 'schoolId', op: '==', value: auth.schoolId },
              { field: 'status', op: '==', value: 'open' },
            ],
            limit: 50,
          });
      const rooms = await store.query<ExamRoom>('rooms', {
        where: [{ field: 'schoolId', op: '==', value: auth.schoolId }],
        limit: 100,
      });
      const proctors = await store.query<Proctor>('proctors', {
        where: [{ field: 'schoolId', op: '==', value: auth.schoolId }],
        limit: 200,
      });
      return json({
        items: sessions.map((s) => ({
          ...s,
          roomName: rooms.find((r) => r.id === s.roomId)?.name ?? '',
          proctorName: proctors.find((p) => p.id === s.proctorId)?.fullName ?? '',
        })),
      });
    }
    if (req.method === 'POST' && action === 'open') {
      const body = (req.body ?? {}) as { sessionId?: string };
      const sessionId = body.sessionId ?? req.query.id ?? '';
      return json(await openSession(auth, sessionId, req.ip));
    }
    if (req.method === 'POST' && action === 'close') {
      const body = (req.body ?? {}) as { sessionId?: string };
      const sessionId = body.sessionId ?? req.query.id ?? '';
      return json(await closeSession(auth, sessionId, req.ip));
    }
    throw errors.validation('Aksi sesi tidak dikenal.');
  }

  if (resource === 'my-teachers' && req.method === 'GET') {
    const teachers = await store.query<User>('users', {
      where: [{ field: 'roles', op: 'array-contains', value: 'teacher' }],
      limit: 100,
    });
    return json({ items: teachers.map((t) => ({ id: t.id, name: t.displayName })) });
  }

  if (resource === 'subjects-options' && req.method === 'GET') {
    const schoolId = resolveSchoolId(auth, req.query.schoolId, { require: !auth.roles.includes('superadmin') });
    const rows = await store.query<Subject>('subjects', {
      where: [
        { field: 'schoolId', op: '==', value: schoolId },
        { field: 'deletedAt', op: '==', value: null },
      ],
      limit: 200,
    });
    return json({ items: rows.map((s) => ({ id: s.id, name: s.name, code: s.code })) });
  }

  throw errors.validation(`Resource ujian "${resource}" tidak dikenal.`);
});
