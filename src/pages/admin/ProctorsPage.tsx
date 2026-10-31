import { useMemo } from 'react';
import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { Proctor } from '../../shared/types';

export default function ProctorsPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const roomOptions = useMemo(
    () => (options?.rooms ?? []).map((r) => ({ value: r.id, label: `${r.name} (kapasitas ${r.capacity})` })),
    [options],
  );
  const roomName = useMemo(() => new Map((options?.rooms ?? []).map((r) => [r.id, r.name])), [options]);

  const config: CrudConfig<Proctor> = {
    title: 'Data Proktor',
    description:
      'Proktor mengawasi sesi ujian di ruang yang ditugaskan, menerbitkan/mencabut token, dan mencatat insiden. Ruang menentukan akses sesi di server.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Proktor' }],
    endpoint: '/api/admin',
    resource: 'proctors',
    createLabel: 'Tambah proktor',
    searchPlaceholder: 'Cari nama, NIP, atau email…',
    fields: [
      { name: 'fullName', label: 'Nama lengkap & gelar', type: 'text', required: true, colSpan: 2 },
      { name: 'nip', label: 'NIP / NUPTK', type: 'text', placeholder: 'Opsional' },
      { name: 'email', label: 'Email login', type: 'email', required: true, help: 'Digunakan untuk masuk ke aplikasi.' },
      { name: 'roomIds', label: 'Ruang yang diawasi', type: 'multiselect', options: roomOptions, colSpan: 2 },
      { name: 'password', label: 'Password awal (opsional)', type: 'password', help: 'Kosongkan agar sistem membuat password acak.', autoComplete: 'new-password' },
      { name: 'active', label: 'Akun aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      {
        key: 'fullName',
        header: 'Nama proktor',
        sortValue: (row) => row.fullName,
        render: (row) => (
          <div>
            <p className="font-medium text-navy-900">{row.fullName}</p>
            <p className="text-[11.5px] text-slate-500">{row.email}</p>
          </div>
        ),
      },
      {
        key: 'roomIds',
        header: 'Ruang',
        hideBelow: 'sm',
        render: (row) =>
          row.roomIds.length === 0 ? (
            <span className="text-slate-400">Belum ditugaskan</span>
          ) : (
            row.roomIds.map((id) => roomName.get(id) ?? id).join(', ')
          ),
      },
      { key: 'nip', header: 'NIP', hideBelow: 'md', render: (row) => row.nip || '—' },
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
    deleteMessage: (row) => `Akun proktor "${row.fullName}" akan dinonaktifkan. Riwayat pengawasan tetap tersimpan di audit log.`,
    toFormValues: (row) => ({ ...(row as unknown as Record<string, unknown>), password: '' }),
    beforeSubmit: (values) => {
      const payload: Record<string, unknown> = { ...values, schoolId };
      if (!payload.password) delete payload.password;
      return payload;
    },
    emptyDescription: 'Tambahkan proktor dan tugaskan ruang ujian yang akan diawasi.',
  };

  return <CrudResource<Proctor> config={config} />;
}
