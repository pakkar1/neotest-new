import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { useOptions } from '../../hooks';
import type { ExamRoom } from '../../shared/types';

export default function RoomsPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';

  const config: CrudConfig<ExamRoom> = {
    title: 'Ruang Ujian',
    description:
      'Kapasitas ruang dipakai saat jadwal dibuat untuk memastikan jumlah peserta tidak melebihi daya tampung. Proktor ditugaskan per ruang.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Ruang Ujian' }],
    endpoint: '/api/admin',
    resource: 'rooms',
    createLabel: 'Tambah ruang',
    searchPlaceholder: 'Cari nama ruang…',
    fields: [
      { name: 'name', label: 'Nama ruang', type: 'text', required: true, placeholder: 'Ruang 01' },
      { name: 'capacity', label: 'Kapasitas', type: 'number', required: true, min: 1, max: 200 },
      { name: 'location', label: 'Lokasi', type: 'text', placeholder: 'Gedung A, lantai 1', colSpan: 2 },
    ],
    columns: [
      { key: 'name', header: 'Ruang', sortValue: (row) => row.name, render: (row) => <span className="font-medium text-navy-900">{row.name}</span> },
      { key: 'capacity', header: 'Kapasitas', align: 'center', width: '120px', render: (row) => `${row.capacity} peserta` },
      { key: 'location', header: 'Lokasi', hideBelow: 'sm', render: (row) => row.location || '—' },
    ],
    canEdit: true,
    canDelete: true,
    deleteMessage: (row) => `Ruang "${row.name}" akan dihapus (soft delete). Jadwal yang sudah ada tidak berubah.`,
    beforeSubmit: (values) => ({ ...values, schoolId }),
  };

  return <CrudResource<ExamRoom> config={config} />;
}
