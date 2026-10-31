import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  BookOpen,
  Download,
  FileText,
  Library,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  Upload,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card } from '../../components/ui/Card';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useDebouncedValue, useOptions, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError, downloadCsv } from '../../services/api';
import { downloadTextFile, parseCsv, toCsv } from '../../lib/csv';
import type {
  Paginated,
  Question,
  QuestionBank,
  QuestionType,
  Stimulus,
} from '../../shared/types';

const TYPE_LABEL: Record<QuestionType, string> = {
  mcq: 'Pilihan ganda',
  complex: 'PG kompleks',
  truefalse: 'Benar/Salah',
  matching: 'Menjodohkan',
  short: 'Isian singkat',
  essay: 'Uraian',
};

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function QuestionBankPage() {
  usePageTitle('Bank Soal');
  const toast = useToast();
  const navigate = useNavigate();
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const [rows, setRows] = useState<Question[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [bankId, setBankId] = useState('');
  const [type, setType] = useState('');
  const [status, setStatus] = useState('');
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [stimuli, setStimuli] = useState<Stimulus[]>([]);
  const [bankModal, setBankModal] = useState(false);
  const [bankForm, setBankForm] = useState({ name: '', subjectId: '', academicYearId: '', description: '' });
  const [deleting, setDeleting] = useState<Question | null>(null);
  const [busy, setBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [importing, setImporting] = useState(false);
  const debounced = useDebouncedValue(search, 350);

  const subjects = options?.subjects ?? [];
  const years = options?.academicYears ?? [];

  const loadMeta = useCallback(async () => {
    const [bankRes, stimRes] = await Promise.all([
      apiRequest<{ items: QuestionBank[] }>('/api/exams', { query: { resource: 'banks', pageSize: 200 } }),
      apiRequest<{ items: Stimulus[] }>('/api/exams', { query: { resource: 'stimuli' } }),
    ]);
    setBanks(bankRes.items);
    setStimuli(stimRes.items);
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<Paginated<Question>>('/api/exams', {
        query: { resource: 'questions', page, pageSize: 20, q: debounced, subjectId, bankId, type, status },
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal memuat soal.');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, subjectId, bankId, type, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    void loadMeta().catch(() => setBanks([]));
  }, [loadMeta]);
  useEffect(() => setPage(1), [debounced, subjectId, bankId, type, status]);

  const bankName = useMemo(() => new Map(banks.map((b) => [b.id, b.name])), [banks]);
  const subjectName = useMemo(() => new Map(subjects.map((s) => [s.id, s.name])), [subjects]);

  const saveBank = async () => {
    if (!bankForm.name.trim() || !bankForm.subjectId || !bankForm.academicYearId) {
      toast.warning('Nama, mata pelajaran, dan tahun ajaran wajib diisi.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/exams', {
        method: 'POST',
        query: { resource: 'banks' },
        body: { ...bankForm, schoolId },
      });
      toast.success('Bank soal dibuat.');
      setBankModal(false);
      setBankForm({ name: '', subjectId: '', academicYearId: '', description: '' });
      await loadMeta();
    } catch (err) {
      toast.error('Gagal membuat bank soal', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const deleteBank = async (bank: QuestionBank) => {
    try {
      await apiRequest('/api/exams', { method: 'DELETE', query: { resource: 'banks', id: bank.id } });
      toast.success('Bank soal dihapus.');
      await loadMeta();
    } catch (err) {
      toast.error('Tidak dapat menghapus bank', err instanceof ApiClientError ? err.message : undefined);
    }
  };

  const removeQuestion = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiRequest('/api/exams', { method: 'DELETE', query: { resource: 'questions', id: deleting.id } });
      toast.success('Soal dihapus.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('Tidak dapat menghapus soal', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const handleImportFile = async (file: File) => {
    const table = parseCsv(await file.text());
    if (table.length < 2) {
      toast.error('File CSV minimal memiliki header dan satu baris soal.');
      return;
    }
    const headers = table[0].map((h) => h.trim().toLowerCase());
    const rowsParsed = table.slice(1).map((cells) => {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? '').trim();
      });
      return row;
    });
    setImportRows(rowsParsed);
  };

  const runImport = async () => {
    if (!schoolId) {
      toast.error('Sekolah belum terpilih.');
      return;
    }
    setImporting(true);
    let ok = 0;
    const problems: string[] = [];
    for (const [index, row] of importRows.entries()) {
      const line = index + 2;
      const subject = subjects.find(
        (s) => s.code.toLowerCase() === (row.subject ?? '').toLowerCase() || s.name.toLowerCase() === (row.subject ?? '').toLowerCase(),
      );
      const bank = banks.find(
        (b) => b.name.toLowerCase() === (row.bank ?? '').toLowerCase() && (!subject || b.subjectId === subject.id),
      );
      const type = (row.type ?? '').toLowerCase() as QuestionType;
      if (!subject || !bank) {
        problems.push(`Baris ${line}: mata pelajaran/bank tidak ditemukan.`);
        continue;
      }
      if (!['mcq', 'truefalse', 'short'].includes(type)) {
        problems.push(`Baris ${line}: tipe "${row.type}" belum didukung impor CSV (gunakan mcq, truefalse, short).`);
        continue;
      }
      const optionsList = (row.options ?? '')
        .split('|')
        .map((part, i) => ({ id: 'ABCDEFGHIJ'[i] ?? `O${i + 1}`, text: part.trim() }))
        .filter((o) => o.text);
      const rawKey = row.key ?? '';
      let correct: unknown;
      if (type === 'mcq') correct = optionsList.find((o) => o.text.toLowerCase() === rawKey.toLowerCase() || o.id === rawKey.toUpperCase())?.id;
      else if (type === 'truefalse') correct = /^(benar|true|b|1)$/i.test(rawKey);
      else correct = rawKey.split('|').map((s) => s.trim()).filter(Boolean);
      try {
        await apiRequest('/api/exams', {
          method: 'POST',
          query: { resource: 'questions' },
          body: {
            schoolId,
            bankId: bank.id,
            subjectId: subject.id,
            type,
            stimulusId: null,
            content: row.content ?? '',
            options: optionsList,
            pairs: [],
            statement: row.statement ?? '',
            points: Number(row.points || 1),
            difficulty: ['mudah', 'sedang', 'sulit'].includes((row.difficulty ?? '').toLowerCase())
              ? (row.difficulty ?? 'sedang').toLowerCase()
              : 'sedang',
            tags: (row.tags ?? '').split(/[, ]+/).filter(Boolean),
            competency: row.competency ?? '',
            status: ['draft', 'review', 'ready'].includes((row.status ?? '').toLowerCase())
              ? (row.status ?? 'draft').toLowerCase()
              : 'draft',
            explanation: row.explanation ?? '',
            key: { correct },
          },
        });
        ok += 1;
      } catch (err) {
        problems.push(`Baris ${line}: ${err instanceof ApiClientError ? err.message : 'gagal disimpan'}`);
      }
    }
    setImporting(false);
    if (ok > 0) toast.success(`${ok} soal berhasil diimpor.`);
    if (problems.length > 0) toast.warning(`${problems.length} baris bermasalah`, problems.slice(0, 4).join(' · '));
    setImportOpen(false);
    setImportRows([]);
    await load();
  };

  const downloadImportTemplate = () => {
    downloadTextFile(
      'template-impor-soal.csv',
      toCsv(
        ['type', 'subject', 'bank', 'content', 'statement', 'options', 'key', 'points', 'difficulty', 'status', 'tags', 'competency', 'explanation'],
        [
          ['mcq', 'MAT', 'Matematika Kelas 9', 'Hasil dari 2x + 3 = 11 adalah…', '', 'x = 2 | x = 3 | x = 4 | x = 5', 'C', '1', 'mudah', 'draft', 'aljabar', 'Persamaan linear', ''],
          ['short', 'MAT', 'Matematika Kelas 9', 'Akar kuadrat dari 144 adalah…', '', '', '12|dua belas', '1', 'sedang', 'draft', '', '', ''],
        ],
      ),
    );
  };

  return (
    <div>
      <PageHeader
        title="Bank Soal"
        description="Kelola soal per mata pelajaran dengan tipe beragam, kunci terpisah, dan status kualitas. Soal yang sudah dipakai di paket terbit dibekukan sebagai snapshot."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Bank Soal' }]}
        actions={
          <>
            <Button variant="secondary" icon={<Library className="h-4 w-4" />} onClick={() => setBankModal(true)}>
              Kelola bank
            </Button>
            <Button variant="secondary" icon={<Upload className="h-4 w-4" />} onClick={() => setImportOpen(true)}>
              Impor CSV
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() =>
                void downloadCsv('/api/exams', { resource: 'questions', format: 'csv' }).catch((err: unknown) =>
                  toast.error('Ekspor gagal', err instanceof ApiClientError ? err.message : undefined),
                )
              }
            >
              Ekspor
            </Button>
            <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/questions/new')}>
              Tulis soal
            </Button>
          </>
        }
      />

      <div className="mb-3 flex flex-wrap gap-2">
        {banks.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-300 bg-white px-3 py-2 text-[12.5px] text-slate-500">
            Belum ada bank soal. Klik <strong>Kelola bank</strong> untuk membuatnya sebelum menulis soal.
          </div>
        ) : (
          banks.map((bank) => (
            <span key={bank.id} className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-white py-1 pl-3 pr-1 text-[11.5px] text-slate-600">
              <BookOpen className="h-3 w-3 text-brand-700" />
              {bank.name}
              <button
                type="button"
                onClick={() => void deleteBank(bank)}
                aria-label={`Hapus bank ${bank.name}`}
                className="rounded-full p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
              >
                <Trash2 className="h-3 w-3" />
              </button>
            </span>
          ))
        )}
      </div>

      <DataTable<Question>
        columns={[
          {
            key: 'content',
            header: 'Soal',
            render: (row) => (
              <div className="max-w-[440px]">
                <p className="line-clamp-2 text-[13px] font-medium text-slate-800">{plain(row.content)}</p>
                <p className="mt-0.5 text-[11px] text-slate-500">
                  {TYPE_LABEL[row.type]} · {subjectName.get(row.subjectId) ?? '—'} · {bankName.get(row.bankId) ?? '—'}
                </p>
              </div>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            width: '110px',
            render: (row) => (
              <Badge tone={row.status === 'ready' ? 'success' : row.status === 'review' ? 'warning' : 'neutral'}>
                {row.status === 'ready' ? 'Siap' : row.status === 'review' ? 'Ditinjau' : 'Draf'}
              </Badge>
            ),
          },
          {
            key: 'difficulty',
            header: 'Kesulitan',
            hideBelow: 'sm',
            width: '100px',
            render: (row) => <span className="capitalize">{row.difficulty}</span>,
          },
          { key: 'points', header: 'Poin', align: 'center', width: '70px', hideBelow: 'sm', render: (row) => row.points },
          {
            key: 'actions',
            header: 'Aksi',
            align: 'right',
            width: '100px',
            render: (row) => (
              <div className="flex justify-end gap-1">
                <IconButton
                  label="Ubah soal"
                  variant="secondary"
                  icon={<Pencil className="h-3.5 w-3.5" />}
                  onClick={() => navigate(`/admin/questions/${row.id}`)}
                />
                <IconButton
                  label="Hapus soal"
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
        emptyTitle="Belum ada soal"
        emptyDescription="Tulis soal baru atau impor dari CSV. Bank soal diperlukan sebelum menulis."
        emptyAction={
          <Button icon={<Plus className="h-4 w-4" />} onClick={() => navigate('/admin/questions/new')}>
            Tulis soal
          </Button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" placeholder="Cari isi soal, tag, kompetensi…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)} className="w-auto min-w-[140px]">
              <option value="">Semua mapel</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
            <Select value={bankId} onChange={(e) => setBankId(e.target.value)} className="w-auto min-w-[140px]">
              <option value="">Semua bank</option>
              {banks.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </Select>
            <Select value={type} onChange={(e) => setType(e.target.value)} className="w-auto min-w-[130px]">
              <option value="">Semua tipe</option>
              {(Object.keys(TYPE_LABEL) as QuestionType[]).map((t) => (
                <option key={t} value={t}>
                  {TYPE_LABEL[t]}
                </option>
              ))}
            </Select>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[120px]">
              <option value="">Semua status</option>
              <option value="draft">Draf</option>
              <option value="review">Ditinjau</option>
              <option value="ready">Siap</option>
            </Select>
            <IconButton label="Muat ulang" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()} />
          </div>
        }
        footer={<Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />}
      />

      <Card className="mt-4">
        <div className="flex flex-wrap items-center gap-3 text-[12px] text-slate-500">
          <FileText className="h-4 w-4 text-slate-400" />
          <span>
            Tipe soal yang didukung: pilihan ganda, PG kompleks, benar/salah, menjodohkan, isian singkat, dan uraian
            dengan rubrik.
          </span>
          <span className="ml-auto">Stimulus tersedia: {stimuli.length}</span>
        </div>
      </Card>

      <Modal
        open={bankModal}
        onClose={() => setBankModal(false)}
        size="md"
        title="Bank soal"
        description="Bank mengelompokkan soal per mata pelajaran dan tahun ajaran."
        footer={
          <>
            <Button variant="secondary" onClick={() => setBankModal(false)}>
              Tutup
            </Button>
            <Button loading={busy} onClick={() => void saveBank()} icon={<Plus className="h-4 w-4" />}>
              Buat bank
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Nama bank" required className="sm:col-span-2">
            <Input value={bankForm.name} onChange={(e) => setBankForm({ ...bankForm, name: e.target.value })} placeholder="Matematika Kelas 9 — Semester Ganjil" />
          </Field>
          <Field label="Mata pelajaran" required>
            <Select value={bankForm.subjectId} onChange={(e) => setBankForm({ ...bankForm, subjectId: e.target.value })}>
              <option value="">Pilih…</option>
              {subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Tahun ajaran" required>
            <Select value={bankForm.academicYearId} onChange={(e) => setBankForm({ ...bankForm, academicYearId: e.target.value })}>
              <option value="">Pilih…</option>
              {years.map((y) => (
                <option key={y.id} value={y.id}>
                  {y.year} {y.semester}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Deskripsi" className="sm:col-span-2">
            <Textarea rows={2} value={bankForm.description} onChange={(e) => setBankForm({ ...bankForm, description: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        size="lg"
        title="Impor soal dari CSV"
        description="Didukung: mcq, truefalse, short. Opsi dipisahkan tanda | dan kunci diisi teks opsi (mcq) atau BENAR/SALAH."
        footer={
          <>
            <Button variant="ghost" onClick={downloadImportTemplate} icon={<Download className="h-4 w-4" />}>
              Template
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Batal
            </Button>
            <Button loading={importing} disabled={importRows.length === 0} onClick={() => void runImport()} icon={<Upload className="h-4 w-4" />}>
              Impor {importRows.length} baris
            </Button>
          </>
        }
      >
        <label className="flex cursor-pointer flex-col items-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/70 px-4 py-8 text-center hover:border-brand-400">
          <Upload className="h-6 w-6 text-brand-700" />
          <span className="text-[13px] font-medium text-slate-700">Pilih file CSV</span>
          <span className="text-[11.5px] text-slate-500">
            Kolom: type, subject, bank, content, statement, options, key, points, difficulty, status, tags, competency, explanation
          </span>
          <input
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void handleImportFile(file);
              e.target.value = '';
            }}
          />
        </label>
        {importRows.length > 0 ? (
          <div className="mt-3 rounded-lg border border-slate-200 p-3">
            <p className="text-[12.5px] text-slate-600">
              {importRows.length} baris siap diimpor. Baris yang tidak valid akan dilaporkan dan dilewati.
            </p>
            <ul className="mt-2 space-y-1 text-[12px] text-slate-500">
              {importRows.slice(0, 3).map((row, index) => (
                <li key={index} className="truncate">
                  {index + 1}. [{row.type}] {row.content?.slice(0, 80)}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus soal?"
        message="Soal yang belum pernah dipakai pada paket terbit akan di-soft delete beserta kuncinya. Soal yang sudah dibekukan pada paket ujian tidak dapat dihapus."
        confirmLabel="Hapus soal"
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void removeQuestion()}
      />
    </div>
  );
}
