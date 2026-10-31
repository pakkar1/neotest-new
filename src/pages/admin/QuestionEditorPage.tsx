import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams, Link } from 'react-router-dom';
import DOMPurify from 'dompurify';
import {
  ArrowLeft,
  Check,
  Eye,
  GripVertical,
  Info,
  Plus,
  Save,
  Trash2,
  X,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle, invalidateOptions } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../services/auth';
import type {
  Question,
  QuestionKey,
  QuestionOption,
  QuestionType,
  MatchPair,
  QuestionBank,
  Stimulus,
  Subject,
} from '../../shared/types';

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Pilihan ganda',
  complex: 'Pilihan ganda kompleks',
  truefalse: 'Benar / Salah',
  matching: 'Menjodohkan',
  short: 'Isian singkat',
  essay: 'Uraian',
};

const LETTER = 'ABCDEFGHIJ';

function blankOption(index: number): QuestionOption {
  return { id: LETTER[index] ?? `O${index + 1}`, text: '' };
}

interface EditorState {
  bankId: string;
  subjectId: string;
  type: QuestionType;
  stimulusId: string;
  content: string;
  options: QuestionOption[];
  pairs: MatchPair[];
  statement: string;
  points: number;
  difficulty: 'mudah' | 'sedang' | 'sulit';
  tagsText: string;
  competency: string;
  status: 'draft' | 'review' | 'ready';
  explanation: string;
  mcqKey: string;
  complexKey: string[];
  tfKey: boolean;
  matchKey: Record<string, string>;
  shortKeys: string;
  essayReference: string;
  rubric: { id: string; criterion: string; points: number }[];
}

function makeInitial(): EditorState {
  return {
    bankId: '',
    subjectId: '',
    type: 'mcq',
    stimulusId: '',
    content: '',
    options: [blankOption(0), blankOption(1), blankOption(2), blankOption(3)],
    pairs: [
      { id: 'p1', left: '', right: '' },
      { id: 'p2', left: '', right: '' },
    ],
    statement: '',
    points: 1,
    difficulty: 'sedang',
    tagsText: '',
    competency: '',
    status: 'draft',
    explanation: '',
    mcqKey: 'A',
    complexKey: [],
    tfKey: true,
    matchKey: {},
    shortKeys: '',
    essayReference: '',
    rubric: [
      { id: 'r1', criterion: 'Ketepatan konsep', points: 2 },
      { id: 'r2', criterion: 'Kelengkapan penjelasan', points: 1 },
    ],
  };
}

export default function QuestionEditorPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();
  const toast = useToast();
  const { config } = useAuth();
  const [state, setState] = useState<EditorState>(makeInitial);
  const [saving, setSaving] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [preview, setPreview] = useState(false);
  usePageTitle(isEdit ? 'Ubah soal' : 'Tulis soal');

  const meta = useAsync(async () => {
    const [banks, stimuli, options] = await Promise.all([
      apiRequest<{ items: QuestionBank[] }>('/api/exams', { query: { resource: 'banks', pageSize: 200 } }),
      apiRequest<{ items: Stimulus[] }>('/api/exams', { query: { resource: 'stimuli' } }),
      apiRequest<{ subjects: Subject[] }>('/api/admin', { query: { resource: 'options' } }),
    ]);
    return { banks: banks.items, stimuli: stimuli.items, subjects: options.subjects };
  }, []);

  const detail = useAsync(
    () => apiRequest<{ question: Question; key: QuestionKey | null }>('/api/exams', {
      query: { resource: 'questions', id: id ?? '' },
    }),
    [id],
    { enabled: isEdit },
  );

  useEffect(() => {
    if (!detail.data) return;
    const { question, key } = detail.data;
    const correct = key?.correct;
    setState((prev) => ({
      ...prev,
      bankId: question.bankId,
      subjectId: question.subjectId,
      type: question.type,
      stimulusId: question.stimulusId ?? '',
      content: question.content,
      options: question.options.length > 0 ? question.options : prev.options,
      pairs: question.pairs.length > 0 ? question.pairs : prev.pairs,
      statement: question.statement ?? '',
      points: question.points,
      difficulty: question.difficulty,
      tagsText: question.tags.join(', '),
      competency: question.competency ?? '',
      status: question.status,
      explanation: question.explanation ?? '',
      mcqKey: question.type === 'mcq' ? String(correct ?? '') : prev.mcqKey,
      complexKey: question.type === 'complex' && Array.isArray(correct) ? (correct as string[]) : [],
      tfKey: question.type === 'truefalse' ? Boolean(correct) : prev.tfKey,
      matchKey:
        question.type === 'matching' && correct && typeof correct === 'object'
          ? (correct as Record<string, string>)
          : {},
      shortKeys: question.type === 'short' && Array.isArray(correct) ? (correct as string[]).join('\n') : '',
      essayReference: question.type === 'essay' && correct && typeof correct === 'object'
        ? String((correct as { text?: string }).text ?? '')
        : '',
      rubric:
        question.type === 'essay' && Array.isArray(key?.rubric) && key!.rubric!.length > 0
          ? key!.rubric!
          : prev.rubric,
    }));
  }, [detail.data]);

  const banks = meta.data?.banks ?? [];
  const stimuli = meta.data?.stimuli ?? [];
  const subjects = meta.data?.subjects ?? [];
  const filteredBanks = useMemo(
    () => banks.filter((bank) => !state.subjectId || bank.subjectId === state.subjectId),
    [banks, state.subjectId],
  );
  const previewHtml = useMemo(() => {
    const raw = state.content || '<em>Belum ada isi soal…</em>';
    return DOMPurify.sanitize(raw, { USE_PROFILES: { html: true } });
  }, [state.content]);

  const set = <K extends keyof EditorState>(key: K, value: EditorState[K]) =>
    setState((prev) => ({ ...prev, [key]: value }));

  const addOption = () => {
    if (state.options.length >= 10) return;
    set('options', [...state.options, blankOption(state.options.length)]);
  };

  const removeOption = (optionId: string) => {
    const next = state.options
      .filter((o) => o.id !== optionId)
      .map((o, index) => ({ ...o, id: LETTER[index] ?? `O${index + 1}` }));
    set('options', next);
    if (state.mcqKey === optionId) set('mcqKey', next[0]?.id ?? '');
    set('complexKey', state.complexKey.filter((k) => next.some((o) => o.id === k)));
  };

  const validate = (): Record<string, string> => {
    const errors: Record<string, string> = {};
    if (!state.subjectId) errors.subjectId = 'Pilih mata pelajaran.';
    if (!state.bankId) errors.bankId = 'Pilih bank soal.';
    if (!state.content.trim()) errors.content = 'Isi soal wajib diisi.';
    const valid = state.options.filter((o) => o.text.trim());
    if (['mcq', 'complex'].includes(state.type) && valid.length < 2) {
      errors.options = 'Minimal dua pilihan jawaban berisi teks.';
    }
    if (state.type === 'mcq' && !valid.some((o) => o.id === state.mcqKey)) {
      errors.key = 'Pilih satu kunci jawaban yang valid.';
    }
    if (state.type === 'complex' && state.complexKey.length === 0) errors.key = 'Pilih minimal satu kunci.';
    if (state.type === 'truefalse' && !state.statement.trim()) errors.statement = 'Pernyataan wajib diisi.';
    if (state.type === 'matching') {
      const left = state.pairs.filter((p) => p.left.trim());
      if (left.length < 2) errors.pairs = 'Minimal dua pasangan berisi teks kiri.';
      const missing = left.some((p) => !state.matchKey[p.id]);
      if (missing) errors.key = 'Jodohkan setiap pernyataan kiri ke pasangan kanannya.';
    }
    if (state.type === 'short' && state.shortKeys.split('\n').filter((s) => s.trim()).length === 0) {
      errors.key = 'Isi minimal satu jawaban yang diterima.';
    }
    if (state.type === 'essay') {
      if (!state.essayReference.trim()) errors.key = 'Tulis referensi jawaban uraian.';
      const total = state.rubric.reduce((a, r) => a + Number(r.points || 0), 0);
      if (total <= 0) errors.rubric = 'Total poin rubrik harus lebih dari 0.';
    }
    return errors;
  };

  const buildPayload = () => {
    const options = state.options
      .filter((o) => o.text.trim())
      .map((o, index) => ({ id: LETTER[index] ?? o.id, text: o.text }));
    const remap = new Map(state.options.filter((o) => o.text.trim()).map((o, index) => [o.id, LETTER[index] ?? o.id]));
    const pairs = state.type === 'matching' ? state.pairs.filter((p) => p.left.trim() && p.right.trim()) : [];
    let correct: unknown = null;
    if (state.type === 'mcq') correct = remap.get(state.mcqKey) ?? state.mcqKey;
    if (state.type === 'complex') correct = state.complexKey.map((k) => remap.get(k) ?? k);
    if (state.type === 'truefalse') correct = state.tfKey;
    if (state.type === 'matching') {
      const map: Record<string, string> = {};
      for (const pair of pairs) {
        const right = state.matchKey[pair.id];
        if (right) map[pair.id] = right;
      }
      correct = map;
    }
    if (state.type === 'short') {
      correct = state.shortKeys
        .split('\n')
        .map((s) => s.trim())
        .filter(Boolean);
    }
    if (state.type === 'essay') correct = state.essayReference;

    return {
      schoolId: '',
      bankId: state.bankId,
      subjectId: state.subjectId,
      type: state.type,
      stimulusId: state.stimulusId || null,
      content: state.content,
      options,
      pairs,
      statement: state.statement,
      points: Number(state.points),
      difficulty: state.difficulty,
      tags: state.tagsText.split(',').map((s) => s.trim()).filter(Boolean),
      competency: state.competency,
      status: state.status,
      explanation: state.explanation,
      key: {
        correct,
        ...(state.type === 'essay'
          ? { rubric: state.rubric.map((r, index) => ({ id: `r${index + 1}`, criterion: r.criterion, points: Number(r.points) })) }
          : {}),
      },
    };
  };

  const save = async () => {
    const errors = validate();
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      toast.warning('Periksa kembali isian soal.');
      return;
    }
    setSaving(true);
    try {
      const payload = buildPayload();
      if (isEdit) {
        await apiRequest('/api/exams', { method: 'PATCH', query: { resource: 'questions', id }, body: payload });
        toast.success('Soal diperbarui.');
      } else {
        await apiRequest('/api/exams', { method: 'POST', query: { resource: 'questions' }, body: payload });
        toast.success('Soal tersimpan di bank soal.');
      }
      invalidateOptions();
      navigate('/admin/questions');
    } catch (err) {
      if (err instanceof ApiClientError) {
        const details = Array.isArray(err.details)
          ? (err.details as { path?: string; message?: string }[])
          : [];
        if (details.length > 0) {
          const mapped: Record<string, string> = {};
          for (const item of details) mapped[(item.path ?? '').split('.').pop() ?? 'form'] = item.message ?? err.message;
          setFieldErrors(mapped);
        }
        toast.error('Gagal menyimpan soal', err.message);
      } else {
        toast.error('Gagal menyimpan soal.');
      }
    } finally {
      setSaving(false);
    }
  };

  if (isEdit && detail.loading) return <LoadingState label="Memuat soal…" />;
  if (isEdit && detail.error) return <ErrorState message={detail.error} onRetry={() => void detail.reload()} />;

  return (
    <div>
      <PageHeader
        title={isEdit ? 'Ubah soal' : 'Tulis soal baru'}
        description="Soal disanitasi di server. Kunci jawaban disimpan di koleksi terpisah dan tidak pernah dikirim ke peserta."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Bank Soal', to: '/admin/questions' }, { label: isEdit ? 'Ubah' : 'Tulis' }]}
        actions={
          <>
            <Link to="/admin/questions">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Kembali
              </Button>
            </Link>
            <Button variant="secondary" icon={<Eye className="h-4 w-4" />} onClick={() => setPreview((v) => !v)}>
              {preview ? 'Sembunyikan pratinjau' : 'Pratinjau'}
            </Button>
            <Button loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
              Simpan soal
            </Button>
          </>
        }
      />

      {config?.demo ? (
        <div className="mb-4 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-[12px] text-orange-900">
          Lingkungan DEMO. Semua soal yang ditulis di sini adalah data contoh.
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Identitas soal" description="Bank soal dan mata pelajaran harus sesuai kurikulum sekolah." />
            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Mata pelajaran" required error={fieldErrors.subjectId} htmlFor="subjectId">
                <Select
                  id="subjectId"
                  value={state.subjectId}
                  onChange={(e) => {
                    const value = e.target.value;
                    setState((prev) => ({
                      ...prev,
                      subjectId: value,
                      bankId: prev.bankId && banks.some((b) => b.id === prev.bankId && b.subjectId === value) ? prev.bankId : '',
                    }));
                  }}
                >
                  <option value="">Pilih mata pelajaran…</option>
                  {subjects.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.code} — {s.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Bank soal" required error={fieldErrors.bankId} htmlFor="bankId">
                <Select id="bankId" value={state.bankId} onChange={(e) => set('bankId', e.target.value)} disabled={!state.subjectId}>
                  <option value="">{state.subjectId ? 'Pilih bank soal…' : 'Pilih mapel dulu'}</option>
                  {filteredBanks.map((bank) => (
                    <option key={bank.id} value={bank.id}>
                      {bank.name}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Tipe soal" required htmlFor="type">
                <Select id="type" value={state.type} onChange={(e) => set('type', e.target.value as QuestionType)}>
                  {(Object.keys(TYPE_LABEL) as QuestionType[]).map((type) => (
                    <option key={type} value={type}>
                      {TYPE_LABEL[type]}
                    </option>
                  ))}
                </Select>
              </Field>
              <Field label="Stimulus / teks bacaan" htmlFor="stimulus">
                <Select id="stimulus" value={state.stimulusId} onChange={(e) => set('stimulusId', e.target.value)}>
                  <option value="">Tanpa stimulus</option>
                  {stimuli.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.title}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Isi soal"
              description="Mendukung teks berformat (HTML aman). Jangan menuliskan kunci jawaban di isi soal."
              actions={
                <span className="text-[11px] text-slate-400">
                  {state.content.length.toLocaleString('id-ID')} / 20.000 karakter
                </span>
              }
            />
            <div className="mt-3">
              <Field error={fieldErrors.content} htmlFor="content">
                <Textarea
                  id="content"
                  rows={8}
                  value={state.content}
                  onChange={(e) => set('content', e.target.value)}
                  placeholder="Tulis pertanyaan di sini… Gunakan <p>, <strong>, <em>, <ul>, atau <table> bila perlu."
                  className="font-mono text-[13px]"
                />
              </Field>
            </div>
          </Card>

          <Card>
            <CardHeader
              title="Jawaban"
              description={
                state.type === 'essay'
                  ? 'Uraian dinilai manual menggunakan rubrik.'
                  : 'Kunci disimpan terenkripsi di koleksi answerKeys dan tidak pernah dikirim ke peserta.'
              }
              actions={
                ['mcq', 'complex'].includes(state.type) ? (
                  <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={addOption}>
                    Tambah opsi
                  </Button>
                ) : null
              }
            />

            {state.type === 'truefalse' ? (
              <div className="mt-3 space-y-3">
                <Field label="Pernyataan" required error={fieldErrors.statement} htmlFor="statement">
                  <Textarea
                    id="statement"
                    rows={2}
                    value={state.statement}
                    onChange={(e) => set('statement', e.target.value)}
                    placeholder="Contoh: 2 + 2 = 5"
                  />
                </Field>
                <div>
                  <p className="label">Kunci</p>
                  <div className="flex gap-2">
                    {[true, false].map((value) => (
                      <button
                        key={String(value)}
                        type="button"
                        onClick={() => set('tfKey', value)}
                        className={`rounded-lg border px-4 py-2 text-[13px] font-medium transition ${
                          state.tfKey === value
                            ? 'border-brand-600 bg-brand-50 text-brand-800'
                            : 'border-slate-300 bg-white text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        {value ? 'Benar' : 'Salah'}
                      </button>
                    ))}
                  </div>
                  {fieldErrors.key ? <p className="mt-1 text-[12px] text-danger">{fieldErrors.key}</p> : null}
                </div>
              </div>
            ) : null}

            {['mcq', 'complex'].includes(state.type) ? (
              <div className="mt-3 space-y-2">
                {state.options.map((option, index) => (
                  <div key={option.id} className="flex items-start gap-2">
                    <span className="mt-2.5 w-5 text-center text-[12px] font-semibold text-slate-500">
                      {LETTER[index]}
                    </span>
                    <Input
                      value={option.text}
                      onChange={(e) => {
                        const next = [...state.options];
                        next[index] = { ...option, text: e.target.value };
                        set('options', next);
                      }}
                      placeholder={`Teks pilihan ${LETTER[index]}`}
                    />
                    {state.type === 'mcq' ? (
                      <button
                        type="button"
                        aria-label={`Jadikan ${LETTER[index]} kunci`}
                        title="Tandai sebagai kunci"
                        onClick={() => set('mcqKey', option.id)}
                        className={`mt-1 grid h-8 w-8 place-items-center rounded-lg border ${
                          state.mcqKey === option.id
                            ? 'border-success bg-success/10 text-success'
                            : 'border-slate-300 text-slate-400 hover:bg-slate-50'
                        }`}
                      >
                        <Check className="h-4 w-4" />
                      </button>
                    ) : (
                      <label
                        className={`mt-1 flex h-8 items-center gap-1 rounded-lg border px-2 text-[11.5px] ${
                          state.complexKey.includes(option.id)
                            ? 'border-success bg-success/10 text-success'
                            : 'border-slate-300 text-slate-500'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="h-3.5 w-3.5 rounded border-slate-300 text-success"
                          checked={state.complexKey.includes(option.id)}
                          onChange={(e) =>
                            set(
                              'complexKey',
                              e.target.checked
                                ? [...state.complexKey, option.id]
                                : state.complexKey.filter((k) => k !== option.id),
                            )
                          }
                        />
                        kunci
                      </label>
                    )}
                    <button
                      type="button"
                      aria-label="Hapus opsi"
                      onClick={() => removeOption(option.id)}
                      className="mt-1 grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {fieldErrors.options ? <p className="text-[12px] text-danger">{fieldErrors.options}</p> : null}
                {fieldErrors.key ? <p className="text-[12px] text-danger">{fieldErrors.key}</p> : null}
                <p className="flex items-start gap-1 text-[11.5px] text-slate-500">
                  <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                  Kunci {state.type === 'mcq' ? 'ditandai dengan tombol centang di kanan opsi.' : 'dapat dipilih lebih dari satu.'}
                </p>
              </div>
            ) : null}

            {state.type === 'matching' ? (
              <div className="mt-3 space-y-2">
                {state.pairs.map((pair, index) => (
                  <div key={pair.id} className="grid grid-cols-1 gap-2 rounded-lg border border-slate-200 p-2 sm:grid-cols-[1fr_1fr_auto]">
                    <Input
                      value={pair.left}
                      placeholder={`Pernyataan kiri ${index + 1}`}
                      onChange={(e) => {
                        const next = [...state.pairs];
                        next[index] = { ...pair, left: e.target.value };
                        set('pairs', next);
                      }}
                    />
                    <Input
                      value={pair.right}
                      placeholder={`Pasangan kanan ${index + 1}`}
                      onChange={(e) => {
                        const next = [...state.pairs];
                        next[index] = { ...pair, right: e.target.value };
                        set('pairs', next);
                      }}
                    />
                    <button
                      type="button"
                      aria-label="Hapus pasangan"
                      onClick={() => set('pairs', state.pairs.filter((p) => p.id !== pair.id))}
                      className="grid h-8 w-8 place-items-center self-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                <Button
                  size="sm"
                  variant="secondary"
                  icon={<Plus className="h-3.5 w-3.5" />}
                  onClick={() => set('pairs', [...state.pairs, { id: `p${state.pairs.length + 1}`, left: '', right: '' }])}
                >
                  Tambah pasangan
                </Button>
                {fieldErrors.pairs ? <p className="text-[12px] text-danger">{fieldErrors.pairs}</p> : null}
                <div className="rounded-lg bg-slate-50 p-2">
                  <p className="mb-1.5 text-[12px] font-medium text-slate-600">Kunci penjodohan</p>
                  <div className="space-y-1.5">
                    {state.pairs
                      .filter((p) => p.left.trim())
                      .map((pair) => (
                        <div key={pair.id} className="flex items-center gap-2 text-[12px]">
                          <span className="w-1/2 truncate text-slate-700">{pair.left}</span>
                          <span className="text-slate-400">→</span>
                          <Select
                            className="!py-1 text-[12px]"
                            value={state.matchKey[pair.id] ?? ''}
                            onChange={(e) => set('matchKey', { ...state.matchKey, [pair.id]: e.target.value })}
                          >
                            <option value="">Pilih…</option>
                            {state.pairs
                              .filter((p) => p.right.trim())
                              .map((p) => (
                                <option key={p.id} value={p.id}>
                                  {p.right}
                                </option>
                              ))}
                          </Select>
                        </div>
                      ))}
                  </div>
                  {fieldErrors.key ? <p className="mt-1 text-[12px] text-danger">{fieldErrors.key}</p> : null}
                </div>
              </div>
            ) : null}

            {state.type === 'short' ? (
              <div className="mt-3">
                <Field
                  label="Jawaban yang diterima"
                  required
                  hint="Satu jawaban per baris. Pencocokan mengabaikan kapitalisasi dan spasi berlebih."
                  error={fieldErrors.key}
                  htmlFor="shortKeys"
                >
                  <Textarea
                    id="shortKeys"
                    rows={4}
                    value={state.shortKeys}
                    onChange={(e) => set('shortKeys', e.target.value)}
                    placeholder={'42\nempat puluh dua'}
                  />
                </Field>
              </div>
            ) : null}

            {state.type === 'essay' ? (
              <div className="mt-3 space-y-3">
                <Field label="Referensi jawaban" required error={fieldErrors.key} htmlFor="essayReference">
                  <Textarea
                    id="essayReference"
                    rows={4}
                    value={state.essayReference}
                    onChange={(e) => set('essayReference', e.target.value)}
                    placeholder="Poin-poin jawaban yang diharapkan (hanya untuk penilai)."
                  />
                </Field>
                <div>
                  <div className="mb-1 flex items-center justify-between">
                    <p className="label !mb-0">Rubrik penilaian</p>
                    <Button
                      size="sm"
                      variant="secondary"
                      icon={<Plus className="h-3.5 w-3.5" />}
                      onClick={() => set('rubric', [...state.rubric, { id: `r${state.rubric.length + 1}`, criterion: '', points: 1 }])}
                    >
                      Tambah kriteria
                    </Button>
                  </div>
                  <div className="space-y-2">
                    {state.rubric.map((row, index) => (
                      <div key={row.id} className="flex gap-2">
                        <Input
                          value={row.criterion}
                          placeholder={`Kriteria ${index + 1}`}
                          onChange={(e) => {
                            const next = [...state.rubric];
                            next[index] = { ...row, criterion: e.target.value };
                            set('rubric', next);
                          }}
                        />
                        <Input
                          type="number"
                          min={0}
                          step={0.5}
                          value={row.points}
                          className="w-24"
                          onChange={(e) => {
                            const next = [...state.rubric];
                            next[index] = { ...row, points: Number(e.target.value) };
                            set('rubric', next);
                          }}
                        />
                        <button
                          type="button"
                          aria-label="Hapus kriteria"
                          onClick={() => set('rubric', state.rubric.filter((r) => r.id !== row.id))}
                          className="grid h-8 w-8 shrink-0 place-items-center self-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-600"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <p className="mt-1 text-[11.5px] text-slate-500">
                    Total poin rubrik: {state.rubric.reduce((a, r) => a + Number(r.points || 0), 0)} / poin soal {state.points}
                  </p>
                  {fieldErrors.rubric ? <p className="text-[12px] text-danger">{fieldErrors.rubric}</p> : null}
                </div>
              </div>
            ) : null}
          </Card>

          <Card>
            <CardHeader title="Pembahasan" description="Ditampilkan ke peserta hanya jika hasil sudah dipublikasikan dan pembahasan diizinkan." />
            <div className="mt-3">
              <Textarea
                rows={4}
                value={state.explanation}
                onChange={(e) => set('explanation', e.target.value)}
                placeholder="Penjelasan kunci jawaban (opsional)."
              />
            </div>
          </Card>
        </div>

        <div className="space-y-4">
          {preview ? (
            <Card>
              <CardHeader title="Pratinjau soal" description="HTML disanitasi sebelum ditampilkan." />
              <div
                className="rich-content mt-3 rounded-lg border border-slate-200 bg-white p-3 text-[13.5px]"
                dangerouslySetInnerHTML={{ __html: previewHtml }}
              />
              {['mcq', 'complex'].includes(state.type) ? (
                <ol className="mt-3 space-y-1.5 text-[13px]">
                  {state.options.map((option, index) => (
                    <li key={option.id} className="flex gap-2">
                      <span className="font-semibold text-slate-500">{LETTER[index]}.</span>
                      <span>{option.text || <em className="text-slate-400">kosong</em>}</span>
                    </li>
                  ))}
                </ol>
              ) : null}
            </Card>
          ) : null}

          <Card>
            <CardHeader title="Metadata & status" />
            <div className="mt-3 space-y-3">
              <div className="grid grid-cols-2 gap-2">
                <Field label="Poin" htmlFor="points">
                  <Input
                    id="points"
                    type="number"
                    min={0.5}
                    step={0.5}
                    value={state.points}
                    onChange={(e) => set('points', Number(e.target.value))}
                  />
                </Field>
                <Field label="Kesulitan" htmlFor="difficulty">
                  <Select id="difficulty" value={state.difficulty} onChange={(e) => set('difficulty', e.target.value as EditorState['difficulty'])}>
                    <option value="mudah">Mudah</option>
                    <option value="sedang">Sedang</option>
                    <option value="sulit">Sulit</option>
                  </Select>
                </Field>
              </div>
              <Field label="Status" htmlFor="status" hint="Hanya soal berstatus siap yang dapat dipakai pada paket ujian.">
                <Select id="status" value={state.status} onChange={(e) => set('status', e.target.value as EditorState['status'])}>
                  <option value="draft">Draf</option>
                  <option value="review">Ditinjau</option>
                  <option value="ready">Siap pakai</option>
                </Select>
              </Field>
              <Field label="Kompetensi / indikator" htmlFor="competency">
                <Input
                  id="competency"
                  value={state.competency}
                  onChange={(e) => set('competency', e.target.value)}
                  placeholder="Contoh: Menyelesaikan persamaan linear satu variabel"
                />
              </Field>
              <Field label="Tag" hint="Pisahkan dengan koma." htmlFor="tags">
                <Input id="tags" value={state.tagsText} onChange={(e) => set('tagsText', e.target.value)} placeholder="aljabar, persamaan" />
              </Field>
              <div className="flex items-center gap-2 rounded-lg bg-brand-50 p-2.5 text-[11.5px] text-brand-900">
                <GripVertical className="h-4 w-4 shrink-0" />
                <span>
                  Soal yang digunakan pada paket terbit akan dibekukan sebagai snapshot. Mengubah soal di bank tidak
                  mengubah ujian yang sedang berjalan.
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={state.status === 'ready' ? 'success' : state.status === 'review' ? 'warning' : 'neutral'}>
                  {state.status === 'ready' ? 'Siap pakai' : state.status === 'review' ? 'Ditinjau' : 'Draf'}
                </Badge>
                <span className="text-[11.5px] text-slate-500">{TYPE_LABEL[state.type]}</span>
              </div>
            </div>
          </Card>

          <Card>
            <CardHeader title="Bank soal" description="Belum ada bank yang sesuai? Buat lewat halaman Bank Soal." />
            <Link to="/admin/questions" className="mt-2 inline-block text-[12.5px] font-medium text-brand-700 hover:underline">
              Kelola bank soal →
            </Link>
          </Card>
        </div>
      </div>
    </div>
  );
}
