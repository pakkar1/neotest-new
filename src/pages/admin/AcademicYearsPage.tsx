import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { AcademicYear } from '../../shared/types';

export default function AcademicYearsPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';

  const config: CrudConfig<AcademicYear> = {
    title: 'Tahun Ajaran',
    description:
      'Tahun ajaran dan semester menjadi acuan kelas, bank soal, dan jenis ujian. Hanya satu tahun ajaran yang sebaiknya ditandai aktif.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Tahun Ajaran' }],
    endpoint: '/api/admin',
    resource: 'academic-years',
    createLabel: 'Tambah tahun ajaran',
    searchPlaceholder: 'Cari tahun ajaran…',
    fields: [
      { name: 'year', label: 'Tahun ajaran', type: 'text', required: true, placeholder: '2025/2026', help: 'Format: YYYY/YYYY' },
      { name: 'semester', label: 'Semester', type: 'select', required: true, options: [{ value: 'ganjil', label: 'Ganjil' }, { value: 'genap', label: 'Genap' }] },
      { name: 'startDate', label: 'Tanggal mulai', type: 'date', required: true },
      { name: 'endDate', label: 'Tanggal selesai', type: 'date', required: true },
      { name: 'active', label: 'Tandai sebagai tahun ajaran aktif', type: 'checkbox', colSpan: 2 },
    ],
    columns: [
      { key: 'year', header: 'Tahun ajaran', sortValue: (row) => row.year, render: (row) => <span className="font-semibold text-navy-900">{row.year}</span> },
      { key: 'semester', header: 'Semester', render: (row) => (row.semester === 'ganjil' ? 'Ganjil' : 'Genap') },
      { key: 'startDate', header: 'Mulai', hideBelow: 'sm' },
      { key: 'endDate', header: 'Selesai', hideBelow: 'sm' },
      {
        key: 'active',
        header: 'Status',
        align: 'center',
        width: '110px',
        render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Aktif' : 'Arsip'}</Badge>,
      },
    ],
    canEdit: true,
    canDelete: true,
    deleteMessage: (row) => `Tahun ajaran ${row.year} ${row.semester} akan dihapus (soft delete). Data yang masih merujuk tetap tersimpan.`,
    beforeSubmit: (values) => ({ ...values, schoolId }),
  };

  return <CrudResource<AcademicYear> config={config} />;
}
