import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { Subject } from '../../shared/types';

export default function SubjectsPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';

  const config: CrudConfig<Subject> = {
    title: 'Mata Pelajaran',
    description: 'Mata pelajaran dipakai pada bank soal, paket ujian, dan jadwal. Kode mapel harus unik per sekolah.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Mata Pelajaran' }],
    endpoint: '/api/admin',
    resource: 'subjects',
    createLabel: 'Tambah mapel',
    searchPlaceholder: 'Cari kode atau nama mapel…',
    fields: [
      { name: 'code', label: 'Kode', type: 'text', required: true, placeholder: 'MAT' },
      { name: 'name', label: 'Nama mata pelajaran', type: 'text', required: true, placeholder: 'Matematika' },
      { name: 'level', label: 'Jenjang', type: 'select', required: true, options: [{ value: 'SMP', label: 'SMP' }, { value: 'MTs', label: 'MTs' }] },
      { name: 'gradeLevel', label: 'Tingkat', type: 'number', required: true, min: 7, max: 9 },
      { name: 'active', label: 'Aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      { key: 'code', header: 'Kode', width: '100px', sortValue: (row) => row.code, render: (row) => <span className="font-mono text-[12.5px] font-semibold text-navy-900">{row.code}</span> },
      { key: 'name', header: 'Mata pelajaran', sortValue: (row) => row.name, render: (row) => <span className="font-medium text-slate-800">{row.name}</span> },
      { key: 'level', header: 'Jenjang', hideBelow: 'sm', render: (row) => `${row.level} · Kelas ${row.gradeLevel}` },
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
    deleteMessage: (row) => `Mapel "${row.name}" akan dihapus (soft delete). Soal dan paket ujian yang sudah ada tetap tersimpan.`,
    beforeSubmit: (values) => ({ ...values, schoolId }),
  };

  return <CrudResource<Subject> config={config} />;
}
