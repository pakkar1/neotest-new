import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  CheckCircle2,
  FileLock2,
  Layers,
  ListPlus,
  Save,
  Search,
  Send,
  Trash2,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, InfoRow } from '../../components/ui/Card';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useAsync, useDebouncedValue, useOptions, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import type { ExamForm, ExamType, Question, QuestionType } from '../../shared/types';

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'PG',
  complex: 'PG kompleks',
  truefalse: 'B/S',
  matching: 'Jodohkan',
  short: 'Isian',
  essay: 'Uraian',
};

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function FormBuilderPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const { options } = useOptions();
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [status, setStatus] = useState<'draft' | 'review' | 'ready'>('draft');
  const [questionIds, setQuestionIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerSearch, setPickerSearch] = useState('');
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);
  usePageTitle('Penyusun Paket');

  const detail = useAsync(
    () => apiRequest<{ doc: ExamForm; questions: Question[] }>('/api/exams', {
      query: { resource: 'forms', id: id ?? '' },
    }),
    [id],
    { enabled: Boolean(id) },
  );

  const types = useAsync(
    () => apiRequest<{ items: ExamType[] }>('/api/exams', { query: { resource: 'types', pageSize: 100 } }),
    [],
  );

  const bank = useAsync(
    () =>
      apiRequest<{ items: Question[] }>('/api/exams', {
        query: { resource: 'questions', pageSize: 400, subjectId: detail.data?.doc.subjectId ?? '', status: '' },
      }),
    [detail.data?.doc.subjectId],
    { enabled: Boolean(detail.data?.doc.subjectId) },
  );

  useEffect(() => {
    if (!detail.data) return;
    setName(detail.data.doc.name);
    setDescription(detail.data.doc.description ?? '');
    setStatus((detail.data.doc.status === 'published' ? 'ready' : detail.data.doc.status) as 'draft' | 'review' | 'ready');
    setQuestionIds(detail.data.doc.questionIds);
  }, [detail.data]);

  const form = detail.data?.doc;
  const published = form?.status === 'published';
  const subjectName = options?.subjects.find((s) => s.id === form?.subjectId)?.name ?? '—';
  const examTypeName = types.data?.items.find((t) => t.id === form?.examTypeId)?.name ?? '—';
  const questionsById = useMemo(() => {
    const map = new Map<string, Question>();
    for (const question of detail.data?.questions ?? []) map.set(question.id, question);
    for (const question of bank.data?.items ?? []) map.set(question.id, question);
    return map;
  }, [detail.data, bank.data]);
  const selected = questionIds.map((qid) => questionsById.get(qid)).filter(Boolean) as Question[];
  const totalPoints = selected.reduce((a, q) => a + q.points, 0);
  const debouncedPicker = useDebouncedValue(pickerSearch, 250);
  const pickerQuestions = useMemo(() => {
    const rows = bank.data?.items ?? [];
    if (!debouncedPicker.trim()) return rows;
    const needle = debouncedPicker.toLowerCase();
    return rows.filter((q) => `${plain(q.content)} ${q.tags.join(' ')} ${q.competency ?? ''}`.toLowerCase().includes(needle));
  }, [bank.data, debouncedPicker]);

  const save = async (nextIds?: string[]) => {
    if (!form) return;
    const ids = nextIds ?? questionIds;
    if (ids.length === 0) {
      toast.warning('Pilih minimal satu soal sebelum menyimpan.');
      return;
    }
    setSaving(true);
    try {
      await apiRequest('/api/exams', {
        method: 'PATCH',
        query: { resource: 'forms', id: form.id },
        body: { name, description, status: published ? 'ready' : status, questionIds: ids, schoolId: form.schoolId },
      });
      toast.success('Paket diperbarui.');
      await detail.reload();
    } catch (err) {
      toast.error('Gagal menyimpan', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  const publish = async () => {
    if (!form) return;
    setPublishing(true);
    try {
      const res = await apiRequest<{ version: { version: number; totalPoints: number; checksum: string } }>(
        '/api/exams',
        { method: 'POST', query: { resource: 'forms', action: 'publish' }, body: { formId: form.id } },
      );
      toast.success(`Versi ${res.version.version} diterbitkan (${res.version.totalPoints} poin).`);
      setPublishOpen(false);
      await detail.reload();
    } catch (err) {
      toast.error('Gagal menerbitkan', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const addQuestion = (questionId: string) => {
    if (questionIds.includes(questionId)) return;
    setQuestionIds((prev) => [...prev, questionId]);
  };

  const move = (index: number, direction: -1 | 1) => {
    const next = [...questionIds];
    const target = index + direction;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setQuestionIds(next);
  };

  if (detail.loading) return <LoadingState label="Memuat paket ujian…" />;
  if (detail.error || !form) {
    return <ErrorState message={detail.error ?? 'Paket ujian tidak ditemukan.'} onRetry={() => void detail.reload()} />;
  }

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {form.name}
            <Badge tone={published ? 'success' : 'neutral'}>{published ? `Terbit v${form.currentVersion}` : 'Draf'}</Badge>
          </span>
        }
        description={`${examTypeName} · ${subjectName} · ${questionIds.length} soal · ${totalPoints} poin`}
        breadcrumb={[
          { label: 'Beranda', to: '/admin' },
          { label: 'Paket Ujian', to: '/admin/forms' },
          { label: 'Penyusun' },
        ]}
        actions={
          <>
            <Link to="/admin/forms">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Kembali
              </Button>
            </Link>
            {!published ? (
              <>
                <Button variant="secondary" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
                  Simpan
                </Button>
                <Button icon={<Send className="h-4 w-4" />} onClick={() => setPublishOpen(true)}>
                  Terbitkan
                </Button>
              </>
            ) : null}
          </>
        }
      />

      {published ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-[12.5px] text-green-900">
          <FileLock2 className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-semibold">Paket sudah diterbitkan (versi {form.currentVersion}).</p>
            <p>
              Snapshot {form.questionIds.length} soal · {form.totalPoints} poin dibekukan dengan checksum. Perubahan pada
              bank soal tidak memengaruhi jadwal yang memakai versi ini. Terbitkan ulang setelah mengubah soal untuk
              membuat versi baru.
            </p>
          </div>
        </div>
      ) : (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900">
          Paket belum diterbitkan sehingga belum bisa dipakai untuk membuat jadwal. Periksa kembali soal dan kunci,
          lalu terbitkan.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_380px]">
        <Card padded={false}>
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
            <CardHeader
              title="Daftar soal"
              description="Urutan berikut menjadi urutan tampilan peserta (kecuali diacak oleh jenis ujian)."
            />
            <Button size="sm" variant="secondary" icon={<ListPlus className="h-3.5 w-3.5" />} onClick={() => setPickerOpen(true)}>
              Pilih soal
            </Button>
          </div>
          {selected.length === 0 ? (
            <div className="p-4">
              <EmptyState
                title="Belum ada soal pada paket"
                description="Pilih soal dari bank soal dengan mata pelajaran yang sama."
                icon={<Layers className="h-6 w-6" />}
                action={
                  <Button variant="secondary" size="sm" icon={<ListPlus className="h-4 w-4" />} onClick={() => setPickerOpen(true)}>
                    Pilih soal
                  </Button>
                }
              />
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {selected.map((question, index) => (
                <li key={question.id} className="flex items-start gap-3 px-4 py-3">
                  <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-navy-50 text-[12px] font-semibold text-navy-800">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="line-clamp-2 text-[13px] text-slate-800">{plain(question.content) || '(tanpa teks)'}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                      <span className="rounded bg-slate-100 px-1.5 py-0.5">{TYPE_LABEL[question.type]}</span>
                      <span>{question.points} poin</span>
                      <span>·</span>
                      <span className="capitalize">{question.difficulty}</span>
                      <span>·</span>
                      <Badge tone={question.status === 'ready' ? 'success' : question.status === 'review' ? 'warning' : 'neutral'}>
                        {question.status === 'ready' ? 'Siap' : question.status === 'review' ? 'Ditinjau' : 'Draf'}
                      </Badge>
                    </p>
                  </div>
                  <div className="flex shrink-0 flex-col gap-1 sm:flex-row">
                    <IconButton label="Naikkan" variant="secondary" disabled={index === 0} icon={<ArrowUp className="h-3.5 w-3.5" />} onClick={() => move(index, -1)} />
                    <IconButton
                      label="Turunkan"
                      variant="secondary"
                      disabled={index === selected.length - 1}
                      icon={<ArrowDown className="h-3.5 w-3.5" />}
                      onClick={() => move(index, 1)}
                    />
                    <IconButton
                      label="Keluarkan dari paket"
                      variant="secondary"
                      icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}
                      onClick={() => setQuestionIds((prev) => prev.filter((qid) => qid !== question.id))}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
          {selected.length > 0 ? (
            <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 bg-slate-50/70 px-4 py-3 text-[12.5px]">
              <span className="text-slate-600">
                {selected.length} soal · total {totalPoints} poin
              </span>
              {!published ? (
                <Button size="sm" loading={saving} variant="secondary" icon={<Save className="h-3.5 w-3.5" />} onClick={() => void save()}>
                  Simpan urutan
                </Button>
              ) : null}
            </div>
          ) : null}
        </Card>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Informasi paket" />
            <div className="mt-2">
              <InfoRow label="Mata pelajaran" value={subjectName} />
              <InfoRow label="Jenis ujian" value={examTypeName} />
              <InfoRow label="Jumlah soal" value={selected.length} />
              <InfoRow label="Total poin" value={`${totalPoints} poin`} />
              <InfoRow label="Versi" value={form.currentVersion ? `v${form.currentVersion}` : 'Belum terbit'} />
            </div>
          </Card>

          <Card>
            <CardHeader title="Pengaturan naskah" description="Perubahan disimpan saat menekan Simpan." />
            <div className="mt-3 space-y-3">
              <Field label="Nama paket">
                <Input value={name} onChange={(e) => setName(e.target.value)} disabled={published} />
              </Field>
              <Field label="Deskripsi">
                <Textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} disabled={published} />
              </Field>
              <Field label="Status penyusunan" hint="Status 'Siap' menandai paket siap ditinjau, bukan berarti sudah terbit.">
                <Select value={status} onChange={(e) => setStatus(e.target.value as typeof status)} disabled={published}>
                  <option value="draft">Draf</option>
                  <option value="review">Ditinjau</option>
                  <option value="ready">Siap terbit</option>
                </Select>
              </Field>
              {!published ? (
                <Button block variant="secondary" loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
                  Simpan perubahan
                </Button>
              ) : null}
            </div>
          </Card>

          <Card>
            <div className="flex items-start gap-2 text-[12px] leading-relaxed text-slate-500">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-green-600" />
              Semua soal harus berasal dari mapel yang sama. Kunci jawaban hanya dipakai untuk penilaian di server dan
              tidak pernah dikirim ke peserta.
            </div>
          </Card>
        </div>
      </div>

      <Modal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        size="lg"
        title="Pilih soal dari bank"
        description={`Menampilkan soal mata pelajaran ${subjectName}. Soal yang sudah ditambahkan ditandai.`}
        footer={
          <>
            <Button variant="secondary" onClick={() => setPickerOpen(false)}>
              Tutup
            </Button>
            <Button
              loading={saving}
              onClick={() => {
                setPickerOpen(false);
                void save(questionIds);
              }}
            >
              Simpan pilihan
            </Button>
          </>
        }
      >
        <div className="relative mb-3">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input className="pl-8" placeholder="Cari isi soal, tag, atau kompetensi…" value={pickerSearch} onChange={(e) => setPickerSearch(e.target.value)} />
        </div>
        {bank.loading ? <LoadingState label="Memuat soal…" /> : null}
        {bank.error ? <ErrorState message={bank.error} onRetry={() => void bank.reload()} /> : null}
        <div className="thin-scroll max-h-[52vh] space-y-2 overflow-y-auto pr-1">
          {pickerQuestions.map((question) => {
            const active = questionIds.includes(question.id);
            return (
              <button
                key={question.id}
                type="button"
                onClick={() => (active ? setQuestionIds((prev) => prev.filter((qid) => qid !== question.id)) : addQuestion(question.id))}
                className={`flex w-full items-start gap-3 rounded-lg border p-2.5 text-left transition ${
                  active ? 'border-brand-400 bg-brand-50/60' : 'border-slate-200 hover:border-brand-300 hover:bg-slate-50'
                }`}
              >
                <span className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border text-[11px] ${active ? 'border-brand-600 bg-brand-600 text-white' : 'border-slate-300 text-transparent'}`}>
                  ✓
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2 block text-[12.5px] text-slate-800">{plain(question.content) || '(tanpa teks)'}</span>
                  <span className="mt-0.5 block text-[11px] text-slate-500">
                    {TYPE_LABEL[question.type]} · {question.points} poin · {question.difficulty}
                  </span>
                </span>
              </button>
            );
          })}
          {!bank.loading && pickerQuestions.length === 0 ? (
            <EmptyState title="Tidak ada soal" description="Belum ada soal pada mapel ini yang cocok dengan pencarian." />
          ) : null}
        </div>
      </Modal>

      <ConfirmDialog
        open={publishOpen}
        tone="primary"
        title="Terbitkan paket ujian?"
        message={
          <>
            Versi <strong>v{(form.currentVersion ?? 0) + 1}</strong> akan dibekukan dengan {selected.length} soal dan{' '}
            {totalPoints} poin. Setelah terbit, isi naskah tidak dapat diubah pada versi ini.
          </>
        }
        confirmLabel="Ya, terbitkan"
        loading={publishing}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
