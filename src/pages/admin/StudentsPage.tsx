import { useMemo, useRef, useState } from 'react';
import { Download, FileSpreadsheet, Upload, UserRound } from 'lucide-react';
import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig, FieldDef } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Modal } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useOptions } from '../../hooks';
import { apiRequest, ApiClientError, downloadCsv } from '../../services/api';
import { downloadTextFile, parseCsv, toCsv } from '../../lib/csv';
import type { Student } from '../../shared/types';

interface ImportError {
  row: number;
  field: string;
  message: string;
}

interface ImportPreview {
  dryRun: true;
  validated: number;
  invalid: number;
  errors: ImportError[];
  preview: { row: number; nisn: string; participantNo: string; fullName: string; gender: string; classId: string }[];
}

interface ImportResult {
  imported: number;
  credentials: { name: string; email: string; password: string | null; nisn: string }[];
  note: string;
}

const HEADER_ALIASES: Record<string, string> = {
  nisn: 'nisn',
  'nomor peserta': 'participantNo',
  nomor_peserta: 'participantNo',
  participantno: 'participantNo',
  no: 'participantNo',
  nama: 'fullName',
  'nama lengkap': 'fullName',
  namalengkap: 'fullName',
  fullname: 'fullName',
  'jenis kelamin': 'gender',
  jenis_kelamin: 'gender',
  gender: 'gender',
  'l/p': 'gender',
  kelas: 'className',
  class: 'className',
  classname: 'className',
  email: 'email',
};

function normalizeHeader(header: string): string {
  const key = header.trim().toLowerCase();
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[key.replaceAll(' ', '_')] ?? header.trim();
}

export default function StudentsPage() {
  const toast = useToast();
  const { options } = useOptions();
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState<Record<string, string>[]>([]);
  const [fileName, setFileName] = useState('');
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const classes = options?.classes ?? [];
  const schoolId = options?.schoolId ?? '';

  const classOptions = useMemo(
    () => classes.map((c) => ({ value: c.id, label: c.name })),
    [classes],
  );

  const config: CrudConfig<Student> = {
    title: 'Data Siswa',
    description:
      'Kelola akun peserta ujian. NISN dan nomor peserta unik per sekolah; penghapusan bersifat soft delete agar riwayat ujian tetap utuh.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Data Siswa' }],
    endpoint: '/api/admin',
    resource: 'students',
    createLabel: 'Tambah siswa',
    searchPlaceholder: 'Cari nama, NISN, atau nomor peserta…',
    fields: [
      { name: 'fullName', label: 'Nama lengkap', type: 'text', required: true, colSpan: 2, placeholder: 'Contoh: Nadia Putri Anggraini' },
      { name: 'nisn', label: 'NISN', type: 'text', required: true, placeholder: '10 digit angka', help: '6–12 digit, unik di sekolah.' },
      { name: 'participantNo', label: 'Nomor peserta', type: 'text', required: true, placeholder: 'Contoh: 01' },
      { name: 'gender', label: 'Jenis kelamin', type: 'select', required: true, options: [{ value: 'L', label: 'Laki-laki' }, { value: 'P', label: 'Perempuan' }] },
      { name: 'classId', label: 'Kelas', type: 'select', required: true, options: classOptions },
      {
        name: 'email',
        label: 'Email login (opsional)',
        type: 'email',
        help: 'Kosongkan untuk membuat email otomatis dari NISN.',
        placeholder: 'siswa@sekolah.sch.id',
      },
      {
        name: 'password',
        label: 'Password awal (opsional)',
        type: 'password',
        help: 'Kosongkan agar sistem membuat password acak yang hanya ditampilkan sekali.',
        autoComplete: 'new-password',
      },
      { name: 'active', label: 'Akun aktif', type: 'checkbox', defaultValue: true },
    ] as FieldDef[],
    columns: [
      {
        key: 'participantNo',
        header: 'No. Peserta',
        width: '110px',
        sortValue: (row) => row.participantNo,
        render: (row) => <span className="font-mono text-[12.5px] text-slate-700">{row.participantNo}</span>,
      },
      {
        key: 'fullName',
        header: 'Nama siswa',
        sortValue: (row) => row.fullName,
        render: (row) => (
          <div className="flex items-center gap-2">
            <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-brand-50 text-brand-700">
              <UserRound className="h-3.5 w-3.5" />
            </span>
            <span className="font-medium text-navy-900">{row.fullName}</span>
          </div>
        ),
      },
      { key: 'nisn', header: 'NISN', hideBelow: 'sm', sortValue: (row) => row.nisn, render: (row) => <span className="font-mono text-[12px]">{row.nisn}</span> },
      {
        key: 'classId',
        header: 'Kelas',
        hideBelow: 'sm',
        render: (row) => classes.find((c) => c.id === row.classId)?.name ?? '—',
      },
      {
        key: 'gender',
        header: 'L/P',
        align: 'center',
        width: '70px',
        hideBelow: 'md',
        render: (row) => (row.gender === 'L' ? 'L' : 'P'),
      },
      {
        key: 'active',
        header: 'Status',
        align: 'center',
        width: '100px',
        render: (row) => (
          <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Aktif' : 'Nonaktif'}</Badge>
        ),
      },
    ],
    filters: [
      { name: 'classId', label: 'Semua kelas', options: classOptions },
      { name: 'active', label: 'Semua status', options: [{ value: 'true', label: 'Aktif' }, { value: 'false', label: 'Nonaktif' }] },
    ],
    canEdit: true,
    canDelete: true,
    deleteMessage: (row) =>
      `Siswa "${row.fullName}" akan dinonaktifkan dan di-soft delete. Riwayat ujian dan nilai tetap tersimpan.`,
    toFormValues: (row) => ({ ...(row as unknown as Record<string, unknown>), email: '', password: '' }),
    beforeSubmit: (values) => {
      const payload: Record<string, unknown> = { ...values, schoolId };
      delete payload.password;
      if (typeof values.password === 'string' && values.password.trim()) payload.password = values.password;
      else delete payload.password;
      if (!payload.email) delete payload.email;
      return payload;
    },
    headerActions: (
      <>
        <Button
          variant="secondary"
          icon={<Upload className="h-4 w-4" />}
          onClick={() => {
            setImportOpen(true);
            setImportRows([]);
            setPreview(null);
            setResult(null);
            setImportError(null);
            setFileName('');
          }}
        >
          Impor CSV
        </Button>
        <Button
          variant="secondary"
          icon={<Download className="h-4 w-4" />}
          onClick={() =>
            void downloadCsv('/api/admin', { resource: 'students', format: 'csv' }).catch((err: unknown) =>
              toast.error('Ekspor gagal', err instanceof ApiClientError ? err.message : undefined),
            )
          }
        >
          Ekspor CSV
        </Button>
      </>
    ),
    emptyDescription: 'Tambahkan siswa satu per satu atau impor dari file CSV.',
  };

  const handleFile = async (file: File) => {
    setImportError(null);
    setPreview(null);
    setResult(null);
    setFileName(file.name);
    const text = await file.text();
    const table = parseCsv(text);
    if (table.length < 2) {
      setImportError('File CSV harus memiliki baris header dan minimal satu baris data.');
      setImportRows([]);
      return;
    }
    const headers = table[0].map(normalizeHeader);
    const rows = table.slice(1).map((cells) => {
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = (cells[index] ?? '').trim();
      });
      return row;
    });
    setImportRows(rows);
    setBusy(true);
    try {
      const dry = await apiRequest<ImportPreview>('/api/admin', {
        method: 'POST',
        query: { resource: 'import-students' },
        body: {
          schoolId,
          rows: rows.map((r) => ({
            nisn: r.nisn ?? '',
            participantNo: r.participantNo ?? '',
            fullName: r.fullName ?? '',
            gender: r.gender ?? '',
            className: r.className ?? '',
            email: r.email ?? '',
          })),
          dryRun: true,
        },
      });
      setPreview(dry);
    } catch (err) {
      setImportError(err instanceof ApiClientError ? err.message : 'Gagal memvalidasi CSV.');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    setBusy(true);
    setImportError(null);
    try {
      const res = await apiRequest<ImportResult>('/api/admin', {
        method: 'POST',
        query: { resource: 'import-students' },
        body: {
          schoolId,
          rows: importRows.map((r) => ({
            nisn: r.nisn ?? '',
            participantNo: r.participantNo ?? '',
            fullName: r.fullName ?? '',
            gender: r.gender ?? '',
            className: r.className ?? '',
            email: r.email ?? '',
          })),
          dryRun: false,
        },
      });
      setResult(res);
      setPreview(null);
      toast.success(`${res.imported} siswa berhasil diimpor.`);
    } catch (err) {
      setImportError(err instanceof ApiClientError ? err.message : 'Impor gagal.');
    } finally {
      setBusy(false);
    }
  };

  const downloadTemplate = () => {
    downloadTextFile(
      'template-impor-siswa.csv',
      toCsv(
        ['nisn', 'participantNo', 'fullName', 'gender', 'className', 'email'],
        [
          ['0091234567', '01', 'Nadia Putri Anggraini', 'P', '9A', ''],
          ['0091234568', '02', 'Raka Pratama', 'L', '9A', ''],
        ],
      ),
    );
  };

  return (
    <>
      <CrudResource<Student> config={config} />

      <Modal
        open={importOpen}
        onClose={() => setImportOpen(false)}
        size="lg"
        title="Impor siswa dari CSV"
        description="Validasi dilakukan dua tahap: pratinjau (dry-run) lalu impor. Duplikat NISN / nomor peserta ditolak."
        footer={
          <>
            <Button variant="ghost" icon={<FileSpreadsheet className="h-4 w-4" />} onClick={downloadTemplate}>
              Unduh template
            </Button>
            <Button variant="secondary" onClick={() => setImportOpen(false)}>
              Tutup
            </Button>
            {preview && !result ? (
              <Button
                loading={busy}
                disabled={preview.invalid > 0}
                onClick={() => void runImport()}
                icon={<Upload className="h-4 w-4" />}
              >
                Impor {preview.validated} baris
              </Button>
            ) : null}
          </>
        }
      >
        {!result ? (
          <div className="space-y-4">
            <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50/60 px-4 py-8 text-center hover:border-brand-400 hover:bg-brand-50/30">
              <Upload className="h-6 w-6 text-brand-700" />
              <span className="text-[13.5px] font-medium text-slate-700">
                {fileName || 'Pilih file CSV (maks. 200 baris per impor)'}
              </span>
              <span className="text-[11.5px] text-slate-500">
                Kolom: nisn, participantNo, fullName, gender (L/P), className, email (opsional)
              </span>
              <input
                ref={fileRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = '';
                }}
              />
            </label>

            {importError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-[12.5px] text-red-800">{importError}</p>
            ) : null}

            {busy && !preview ? <p className="text-[12.5px] text-slate-500">Memvalidasi file…</p> : null}

            {preview ? (
              <div className="space-y-3">
                <div className="flex flex-wrap gap-2 text-[12.5px]">
                  <Badge tone="success">{preview.validated} baris valid</Badge>
                  <Badge tone={preview.invalid > 0 ? 'danger' : 'neutral'}>{preview.invalid} baris bermasalah</Badge>
                </div>
                {preview.errors.length > 0 ? (
                  <div className="thin-scroll max-h-48 overflow-y-auto rounded-lg border border-red-200">
                    <table className="table-base">
                      <thead>
                        <tr>
                          <th>Baris</th>
                          <th>Masalah</th>
                        </tr>
                      </thead>
                      <tbody>
                        {preview.errors.map((err, index) => (
                          <tr key={index}>
                            <td className="w-16 font-mono">{err.row}</td>
                            <td className="text-red-700">{err.message}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : null}
                {preview.errors.length > 0 ? (
                  <p className="text-[12px] text-slate-500">
                    Perbaiki seluruh baris bermasalah lalu unggah ulang. Tidak ada data yang diimpor saat pratinjau.
                  </p>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="rounded-lg border border-green-200 bg-green-50 p-3 text-[13px] text-green-900">
              <strong>{result.imported} siswa</strong> berhasil dibuat. {result.note}
            </div>
            <div className="thin-scroll max-h-64 overflow-y-auto rounded-lg border border-slate-200">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>Nama</th>
                    <th>Email</th>
                    <th>Password awal</th>
                  </tr>
                </thead>
                <tbody>
                  {result.credentials.map((item) => (
                    <tr key={item.nisn}>
                      <td>{item.name}</td>
                      <td className="font-mono text-[11.5px]">{item.email}</td>
                      <td className="font-mono text-[11.5px]">{item.password ?? '(tidak berubah)'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              onClick={() =>
                downloadTextFile(
                  'kredensial-siswa-baru.csv',
                  toCsv(
                    ['nisn', 'nama', 'email', 'password'],
                    result.credentials.map((c) => [c.nisn, c.name, c.email, c.password ?? '']),
                  ),
                )
              }
            >
              Unduh kredensial
            </Button>
          </div>
        )}
      </Modal>
    </>
  );
}
