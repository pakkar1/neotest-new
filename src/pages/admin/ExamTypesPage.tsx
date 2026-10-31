import { useMemo } from 'react';
import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { ExamType } from '../../shared/types';

const ASSESSMENT_LABEL: Record<ExamType['assessmentType'], string> = {
  tka: 'Tes Kemampuan Akademik',
  pts: 'Penilaian Tengah Semester',
  pas: 'Penilaian Akhir Semester',
  ulangan: 'Ulangan Harian',
  tryout: 'Try Out',
};

export default function ExamTypesPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const yearOptions = useMemo(
    () =>
      (options?.academicYears ?? []).map((y) => ({
        value: y.id,
        label: `${y.year} — ${y.semester === 'ganjil' ? 'Ganjil' : 'Genap'}`,
      })),
    [options],
  );

  const config: CrudConfig<ExamType> = {
    title: 'Jenis Ujian',
    description:
      'Jenis ujian menyimpan aturan penting: durasi, minimal waktu sebelum boleh kirim, pengacakan, navigasi soal, dan kapan hasil dipublikasikan. Aturan ini ditegakkan di server.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Jenis Ujian' }],
    endpoint: '/api/exams',
    resource: 'types',
    createLabel: 'Tambah jenis ujian',
    searchPlaceholder: 'Cari nama atau kode…',
    modalSize: 'lg',
    fields: [
      { name: 'name', label: 'Nama jenis ujian', type: 'text', required: true, colSpan: 2, placeholder: 'Contoh: PTS Ganjil 2025/2026' },
      { name: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'PTS-GANJIL' },
      { name: 'academicYearId', label: 'Tahun ajaran', type: 'select', required: true, options: yearOptions },
      {
        name: 'assessmentType',
        label: 'Kategori',
        type: 'select',
        required: true,
        options: (Object.keys(ASSESSMENT_LABEL) as ExamType['assessmentType'][]).map((value) => ({
          value,
          label: ASSESSMENT_LABEL[value],
        })),
      },
      { name: 'durationMinutes', label: 'Durasi (menit)', type: 'number', required: true, min: 5, max: 360 },
      {
        name: 'minSubmitMinutes',
        label: 'Minimal menit sebelum boleh kirim',
        type: 'number',
        required: true,
        min: 0,
        max: 300,
        help: 'Default 45 menit. Divalidasi di server, bukan hanya di browser.',
      },
      {
        name: 'scoringMethod',
        label: 'Metode penilaian',
        type: 'select',
        options: [{ value: 'auto', label: 'Otomatis (objektif)' }, { value: 'hybrid', label: 'Hybrid (uraian dinilai manual)' }],
      },
      {
        name: 'navigation',
        label: 'Navigasi soal',
        type: 'select',
        options: [{ value: 'free', label: 'Bebas' }, { value: 'sequential', label: 'Berurutan' }],
      },
      {
        name: 'resultPublish',
        label: 'Publikasi hasil',
        type: 'select',
        options: [
          { value: 'immediate', label: 'Segera setelah kirim' },
          { value: 'manual', label: 'Manual oleh guru' },
          { value: 'after_session', label: 'Setelah sesi ditutup' },
          { value: 'never', label: 'Tidak dipublikasikan' },
        ],
      },
      { name: 'passingScore', label: 'Nilai minimum kelulusan', type: 'number', min: 0, max: 100 },
      { name: 'description', label: 'Deskripsi', type: 'textarea', colSpan: 2 },
      { name: 'shuffleQuestions', label: 'Acak urutan soal', type: 'checkbox' },
      { name: 'shuffleOptions', label: 'Acak pilihan jawaban', type: 'checkbox' },
      { name: 'allowAnswerReview', label: 'Izinkan peserta melihat kunci setelah hasil dipublikasikan', type: 'checkbox', colSpan: 2 },
      { name: 'active', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      {
        key: 'name',
        header: 'Jenis ujian',
        sortValue: (row) => row.name,
        render: (row) => (
          <div>
            <p className="font-medium text-navy-900">{row.name}</p>
            <p className="text-[11.5px] text-slate-500">
              {row.code} · {ASSESSMENT_LABEL[row.assessmentType]}
            </p>
          </div>
        ),
      },
      { key: 'durationMinutes', header: 'Durasi', align: 'center', width: '100px', render: (row) => `${row.durationMinutes} mnt` },
      { key: 'minSubmitMinutes', header: 'Min. kirim', align: 'center', width: '110px', hideBelow: 'sm', render: (row) => `${row.minSubmitMinutes} mnt` },
      { key: 'navigation', header: 'Navigasi', hideBelow: 'md', render: (row) => (row.navigation === 'free' ? 'Bebas' : 'Berurutan') },
      {
        key: 'allowAnswerReview',
        header: 'Kunci',
        align: 'center',
        hideBelow: 'lg',
        render: (row) => <Badge tone={row.allowAnswerReview ? 'info' : 'neutral'}>{row.allowAnswerReview ? 'Boleh dibahas' : 'Tertutup'}</Badge>,
      },
      {
        key: 'active',
        header: 'Status',
        align: 'center',
        width: '100px',
        render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Aktif' : 'Nonaktif'}</Badge>,
      },
    ],
    canEdit: true,
    canDelete: true,
    deleteMessage: (row) => `Jenis ujian "${row.name}" akan dihapus (soft delete). Paket ujian yang sudah terbit tetap dapat digunakan.`,
    beforeSubmit: (values) => ({ ...values, schoolId }),
  };

  return <CrudResource<ExamType> config={config} />;
}
