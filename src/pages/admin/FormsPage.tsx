import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { CheckCircle2, FileCheck2, Link2, Plus, Search, Send, Trash2 } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useDebouncedValue, useOptions, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import type { ExamForm, ExamType, Paginated } from '../../shared/types';

export default function FormsPage() {
  usePageTitle('Paket Ujian');
  const toast = useToast();
  const navigate = useNavigate();
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const [rows, setRows] = useState<ExamForm[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [types, setTypes] = useState<ExamType[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({ name: '', examTypeId: '', subjectId: '', academicYearId: '', description: '' });
  const [busy, setBusy] = useState(false);
  const [publishing, setPublishing] = useState<ExamForm | null>(null);
  const [deleting, setDeleting] = useState<ExamForm | null>(null);
  const debounced = useDebouncedValue(search, 350);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<Paginated<ExamForm>>('/api/exams', {
        query: { resource: 'forms', page, pageSize: 20, q: debounced, status },
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal memuat paket ujian.');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void apiRequest<Paginated<ExamType>>('/api/exams', { query: { resource: 'types', pageSize: 100 } })
      .then((res) => setTypes(res.items))
      .catch(() => setTypes([]));
  }, []);
  useEffect(() => {
    setPage(1);
  }, [debounced, status]);

  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const subjectName = useMemo(
    () => new Map((options?.subjects ?? []).map((s) => [s.id, s.name])),
    [options],
  );

  const createForm = async () => {
    if (!form.name.trim() || !form.examTypeId || !form.subjectId || !form.academicYearId) {
      toast.warning('Nama, jenis ujian, mapel, dan tahun ajaran wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ doc: ExamForm }>('/api/exams', {
        method: 'POST',
        query: { resource: 'forms' },
        body: { ...form, schoolId, questionIds: [], status: 'draft' },
      });
      toast.success('Paket dibuat. Pilih soal lalu terbitkan.');
      setCreateOpen(false);
      setForm({ name: '', examTypeId: '', subjectId: '', academicYearId: '', description: '' });
      navigate(`/admin/forms/${res.doc.id}`);
    } catch (err) {
      toast.error('Gagal membuat paket', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const publish = async () => {
    if (!publishing) return;
    setBusy(true);
    try {
      const res = await apiRequest<{ version: { version: number } }>('/api/exams', {
        method: 'POST',
        query: { resource: 'forms', action: 'publish' },
        body: { formId: publishing.id },
      });
      toast.success(`Paket diterbitkan sebagai versi ${res.version.version}.`);
      setPublishing(null);
      await load();
    } catch (err) {
      toast.error('Gagal menerbitkan', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiRequest('/api/exams', { method: 'DELETE', query: { resource: 'forms', id: deleting.id } });
      toast.success('Paket dihapus.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('Tidak dapat menghapus', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Paket Ujian"
        description="Paket menyusun soal menjadi satu naskah. Menerbitkan paket membekukan snapshot soal sehingga perubahan bank soal tidak memengaruhi ujian yang sudah berjalan."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Paket Ujian' }]}
        actions={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Buat paket
          </Button>
        }
      />

      <DataTable<ExamForm>
        columns={[
          {
            key: 'name',
            header: 'Paket ujian',
            render: (row) => (
              <div>
                <button
                  type="button"
                  onClick={() => navigate(`/admin/forms/${row.id}`)}
                  className="text-left text-[13.5px] font-semibold text-navy-900 hover:text-brand-700 hover:underline"
                >
                  {row.name}
                </button>
                <p className="text-[11.5px] text-slate-500">
                  {typeName.get(row.examTypeId) ?? '—'} · {subjectName.get(row.subjectId) ?? '—'}
                </p>
              </div>
            ),
          },
          {
            key: 'questionIds',
            header: 'Soal',
            align: 'center',
            width: '90px',
            render: (row) => <span className="font-medium">{row.questionIds.length}</span>,
          },
          {
            key: 'totalPoints',
            header: 'Poin',
            align: 'center',
            width: '80px',
            hideBelow: 'sm',
            render: (row) => row.totalPoints ?? 0,
          },
          {
            key: 'status',
            header: 'Status',
            width: '150px',
            render: (row) => (
              <div className="flex flex-col items-start gap-1">
                <Badge tone={row.status === 'published' ? 'success' : row.status === 'ready' ? 'info' : 'neutral'}>
                  {row.status === 'published' ? `Terbit v${row.currentVersion ?? 1}` : row.status === 'ready' ? 'Siap terbit' : row.status === 'review' ? 'Ditinjau' : 'Draf'}
                </Badge>
                {row.currentVersionId ? (
                  <span className="text-[10.5px] text-slate-400">Snapshot permanen</span>
                ) : null}
              </div>
            ),
          },
          {
            key: 'actions',
            header: 'Aksi',
            align: 'right',
            width: '140px',
            render: (row) => (
              <div className="flex justify-end gap-1">
                {row.status !== 'published' ? (
                  <IconButton
                    label="Terbitkan paket"
                    variant="secondary"
                    icon={<Send className="h-3.5 w-3.5 text-green-700" />}
                    onClick={() => setPublishing(row)}
                  />
                ) : (
                  <IconButton
                    label="Lihat paket"
                    variant="secondary"
                    icon={<Link2 className="h-3.5 w-3.5" />}
                    onClick={() => navigate(`/admin/forms/${row.id}`)}
                  />
                )}
                <IconButton
                  label="Hapus paket"
                  variant="secondary"
                  icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}
                  onClick={() => setDeleting(row)}
                />
              </div>
            ),
          },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="Belum ada paket ujian"
        emptyDescription="Buat paket, pilih soal dari bank, lalu terbitkan untuk membekukan snapshot."
        emptyAction={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>
            Buat paket
          </Button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" placeholder="Cari nama paket…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[140px]">
              <option value="">Semua status</option>
              <option value="draft">Draf</option>
              <option value="review">Ditinjau</option>
              <option value="ready">Siap</option>
              <option value="published">Terbit</option>
            </Select>
          </div>
        }
        footer={<Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />}
      />

      <div className="mt-4 grid gap-3 rounded-xl border border-brand-200 bg-brand-50/60 p-4 text-[12.5px] text-brand-900 sm:grid-cols-3">
        <div className="flex items-start gap-2">
          <FileCheck2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Snapshot soal + kunci dibekukan saat terbit, lengkap dengan checksum versi.</span>
        </div>
        <div className="flex items-start gap-2">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Peserta menerima versi paket yang sama sepanjang sesi, meski soal diubah.</span>
        </div>
        <div className="flex items-start gap-2">
          <Link2 className="mt-0.5 h-4 w-4 shrink-0" />
          <span>Menerbitkan ulang membuat versi baru; jadwal yang sudah ada tetap memakai versi lama.</span>
        </div>
      </div>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Buat paket ujian"
        description="Paket harus sesuai jenis ujian dan mata pelajaran. Soal dipilih pada langkah berikutnya."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)}>
              Batal
            </Button>
            <Button loading={busy} onClick={() => void createForm()}>
              Buat & pilih soal
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama paket" required className="sm:col-span-2">
            <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="PTS Matematika Kelas 9 — Paket A" />
          </Field>
          <Field label="Jenis ujian" required>
            <Select value={form.examTypeId} onChange={(e) => setForm({ ...form, examTypeId: e.target.value })}>
              <option value="">Pilih…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Mata pelajaran" required>
            <Select value={form.subjectId} onChange={(e) => setForm({ ...form, subjectId: e.target.value })}>
              <option value="">Pilih…</option>
              {(options?.subjects ?? []).map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tahun ajaran" required>
            <Select value={form.academicYearId} onChange={(e) => setForm({ ...form, academicYearId: e.target.value })}>
              <option value="">Pilih…</option>
              {(options?.academicYears ?? []).map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} {y.semester}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(publishing)}
        tone="primary"
        title="Terbitkan paket ujian?"
        message={
          <>
            Paket <strong>{publishing?.name}</strong> akan dibekukan sebagai snapshot permanen. Soal dan kunci tidak
            dapat berubah pada versi ini. Pastikan seluruh soal sudah benar.
          </>
        }
        confirmLabel="Terbitkan"
        loading={busy}
        onCancel={() => setPublishing(null)}
        onConfirm={() => void publish()}
      />
      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus paket?"
        message="Paket hanya dapat dihapus jika belum dipakai pada jadwal ujian."
        confirmLabel="Hapus paket"
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
