import { useMemo } from 'react';
import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { ClassRoom } from '../../shared/types';

export default function ClassesPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const yearOptions = useMemo(
    () =>
      (options?.academicYears ?? []).map((y) => ({
        value: y.id,
        label: `${y.year} — ${y.semester === 'ganjil' ? 'Ganjil' : 'Genap'}${y.active ? ' (aktif)' : ''}`,
      })),
    [options],
  );
  const teacherOptions = useMemo(
    () => (options?.teachers ?? []).map((t) => ({ value: t.id, label: t.name })),
    [options],
  );
  const yearLabel = useMemo(
    () => new Map((options?.academicYears ?? []).map((y) => [y.id, `${y.year} ${y.semester}`])),
    [options],
  );

  const config: CrudConfig<ClassRoom> = {
    title: 'Kelas',
    description:
      'Kelas mengelompokkan siswa dan menentukan peserta ujian pada jadwal. Wali kelas bersifat opsional.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Kelas' }],
    endpoint: '/api/admin',
    resource: 'classes',
    createLabel: 'Tambah kelas',
    searchPlaceholder: 'Cari nama kelas…',
    fields: [
      { name: 'name', label: 'Nama kelas', type: 'text', required: true, placeholder: 'Contoh: 9A' },
      { name: 'level', label: 'Tingkat', type: 'number', required: true, min: 7, max: 9, placeholder: '7–9' },
      { name: 'academicYearId', label: 'Tahun ajaran', type: 'select', required: true, options: yearOptions },
      { name: 'homeroomTeacherId', label: 'Wali kelas', type: 'select', options: teacherOptions },
      { name: 'active', label: 'Kelas aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      { key: 'name', header: 'Kelas', sortValue: (row) => row.name, render: (row) => <span className="font-semibold text-navy-900">{row.name}</span> },
      { key: 'level', header: 'Tingkat', align: 'center', width: '90px', render: (row) => `Kelas ${row.level}` },
      { key: 'academicYearId', header: 'Tahun ajaran', hideBelow: 'sm', render: (row) => yearLabel.get(row.academicYearId) ?? '—' },
      {
        key: 'homeroomTeacherId',
        header: 'Wali kelas',
        hideBelow: 'md',
        render: (row) => teacherOptions.find((t) => t.value === row.homeroomTeacherId)?.label ?? '—',
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
    deleteMessage: (row) => `Kelas "${row.name}" akan dihapus (soft delete). Siswa di dalamnya tidak terhapus.`,
    beforeSubmit: (values) => ({ ...values, schoolId }),
  };

  return <CrudResource<ClassRoom> config={config} />;
}
