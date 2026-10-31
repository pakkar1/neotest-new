import { useMemo } from 'react';
import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { Teacher } from '../../shared/types';

export default function TeachersPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const subjectOptions = useMemo(
    () => (options?.subjects ?? []).map((s) => ({ value: s.id, label: `${s.code} — ${s.name}` })),
    [options],
  );
  const subjectName = useMemo(
    () => new Map((options?.subjects ?? []).map((s) => [s.id, s.name])),
    [options],
  );

  const config: CrudConfig<Teacher> = {
    title: 'Data Guru',
    description:
      'Guru dapat menulis bank soal, menyusun paket ujian, dan menilai uraian. Akun login dibuat otomatis saat guru ditambahkan.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Guru' }],
    endpoint: '/api/admin',
    resource: 'teachers',
    createLabel: 'Tambah guru',
    searchPlaceholder: 'Cari nama, NIP, atau email…',
    fields: [
      { name: 'fullName', label: 'Nama lengkap & gelar', type: 'text', required: true, colSpan: 2, placeholder: 'Contoh: Ahmad Fauzi, S.Pd.' },
      { name: 'nip', label: 'NIP / NUPTK', type: 'text', placeholder: 'Opsional' },
      { name: 'email', label: 'Email login', type: 'email', required: true, placeholder: 'guru@sekolah.sch.id', help: 'Digunakan untuk masuk ke aplikasi.' },
      { name: 'subjectIds', label: 'Mata pelajaran diampu', type: 'multiselect', options: subjectOptions, colSpan: 2 },
      { name: 'password', label: 'Password awal (opsional)', type: 'password', help: 'Kosongkan agar sistem membuat password acak (ditampilkan sekali).', autoComplete: 'new-password' },
      { name: 'active', label: 'Akun aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      {
        key: 'fullName',
        header: 'Nama guru',
        sortValue: (row) => row.fullName,
        render: (row) => (
          <div>
            <p className="font-medium text-navy-900">{row.fullName}</p>
            <p className="text-[11.5px] text-slate-500">{row.email}</p>
          </div>
        ),
      },
      { key: 'nip', header: 'NIP', hideBelow: 'sm', render: (row) => <span className="font-mono text-[12px]">{row.nip || '—'}</span> },
      {
        key: 'subjectIds',
        header: 'Mata pelajaran',
        hideBelow: 'md',
        render: (row) =>
          row.subjectIds.length === 0 ? (
            <span className="text-slate-400">Belum ditentukan</span>
          ) : (
            <span className="text-[12.5px]">{row.subjectIds.map((id) => subjectName.get(id) ?? id).join(', ')}</span>
          ),
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
    deleteMessage: (row) => `Akun guru "${row.fullName}" akan dinonaktifkan. Soal dan paket yang pernah dibuat tetap tersimpan.`,
    toFormValues: (row) => ({ ...(row as unknown as Record<string, unknown>), password: '' }),
    beforeSubmit: (values) => {
      const payload: Record<string, unknown> = { ...values, schoolId };
      if (!payload.password) delete payload.password;
      return payload;
    },
    emptyDescription: 'Tambahkan guru agar mereka dapat menyusun soal dan paket ujian.',
  };

  return <CrudResource<Teacher> config={config} />;
}
