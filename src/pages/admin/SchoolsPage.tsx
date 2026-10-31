import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import type { School } from '../../shared/types';

export default function SchoolsPage() {
  const config: CrudConfig<School> = {
    title: 'Sekolah',
    description:
      'Hanya Super Admin yang dapat menambah sekolah. Kop surat dan kepala sekolah dipakai pada dokumen cetak (daftar hadir & berita acara).',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Sekolah' }],
    endpoint: '/api/admin',
    resource: 'schools',
    createLabel: 'Tambah sekolah',
    searchPlaceholder: 'Cari nama, kode, atau NPSN…',
    modalSize: 'lg',
    fields: [
      { name: 'name', label: 'Nama sekolah', type: 'text', required: true, colSpan: 2 },
      { name: 'code', label: 'Kode sekolah', type: 'text', required: true, placeholder: 'Contoh: SMPN1NUS' },
      { name: 'npsn', label: 'NPSN', type: 'text', required: true },
      { name: 'level', label: 'Jenjang', type: 'select', required: true, options: [{ value: 'SMP', label: 'SMP' }, { value: 'MTs', label: 'MTs' }] },
      { name: 'email', label: 'Email sekolah', type: 'email', required: true },
      { name: 'address', label: 'Alamat', type: 'text', required: true, colSpan: 2 },
      { name: 'city', label: 'Kota/Kabupaten', type: 'text', required: true },
      { name: 'province', label: 'Provinsi', type: 'text', required: true },
      { name: 'phone', label: 'Telepon', type: 'text' },
      { name: 'logoUrl', label: 'URL logo (opsional)', type: 'text', placeholder: 'https://…' },
      { name: 'headmasterName', label: 'Nama kepala sekolah', type: 'text', colSpan: 2, help: 'Tampil pada blok tanda tangan dokumen cetak.' },
      { name: 'headmasterNip', label: 'NIP kepala sekolah', type: 'text' },
      { name: 'authorityLine', label: 'Baris instansi di kop', type: 'text', placeholder: 'PEMERINTAH KABUPATEN … DINAS PENDIDIKAN' },
      { name: 'stampNote', label: 'Catatan stempel', type: 'text', placeholder: 'Opsional' },
      { name: 'active', label: 'Sekolah aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      {
        key: 'name',
        header: 'Sekolah',
        sortValue: (row) => row.name,
        render: (row) => (
          <div>
            <p className="font-medium text-navy-900">{row.name}</p>
            <p className="text-[11.5px] text-slate-500">
              {row.city}, {row.province}
            </p>
          </div>
        ),
      },
      { key: 'npsn', header: 'NPSN', hideBelow: 'sm', render: (row) => <span className="font-mono text-[12px]">{row.npsn}</span> },
      { key: 'code', header: 'Kode', hideBelow: 'md' },
      { key: 'headmasterName', header: 'Kepala sekolah', hideBelow: 'md', render: (row) => row.letterhead?.headmasterName || '—' },
      {
        key: 'active',
        header: 'Status',
        align: 'center',
        width: '100px',
        render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Aktif' : 'Nonaktif'}</Badge>,
      },
    ],
    canCreate: true,
    canEdit: true,
    canDelete: false,
    toFormValues: (row) => ({
      ...row,
      headmasterName: row.letterhead?.headmasterName ?? '',
      headmasterNip: row.letterhead?.headmasterNip ?? '',
      authorityLine: row.letterhead?.authorityLine ?? '',
      stampNote: row.letterhead?.stampNote ?? '',
    }),
    beforeSubmit: (values) => {
      const { headmasterName, headmasterNip, authorityLine, stampNote, ...rest } = values;
      return {
        ...rest,
        phone: rest.phone ?? '',
        logoUrl: rest.logoUrl ?? '',
        letterhead: { headmasterName, headmasterNip, authorityLine, stampNote },
      };
    },
  };

  return <CrudResource<School> config={config} />;
}
