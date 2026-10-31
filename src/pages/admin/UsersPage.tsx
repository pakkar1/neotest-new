import { CrudResource } from '../../components/crud/CrudResource';
import type { CrudConfig } from '../../components/crud/types';
import { Badge, type Tone } from '../../components/ui/Badge';
import { useOptions } from '../../hooks';
import type { Role, User } from '../../shared/types';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin Sekolah',
  teacher: 'Guru',
  proctor: 'Proktor',
  student: 'Siswa',
};

const ROLE_TONE: Record<Role, Tone> = {
  superadmin: 'violet',
  admin: 'navy',
  teacher: 'info',
  proctor: 'warning',
  student: 'neutral',
};

export default function UsersPage() {
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';

  const config: CrudConfig<User> = {
    title: 'Akun & Hak Akses',
    description:
      'Kelola akun staf dan perannya. Peran menentukan izin di server; akun siswa dibuat melalui modul Data Siswa.',
    breadcrumb: [{ label: 'Beranda', to: '/admin' }, { label: 'Akun & Hak Akses' }],
    endpoint: '/api/admin',
    resource: 'users',
    createLabel: 'Tambah akun',
    searchPlaceholder: 'Cari nama, email, atau username…',
    fields: [
      { name: 'displayName', label: 'Nama tampilan', type: 'text', required: true, colSpan: 2 },
      { name: 'email', label: 'Email login', type: 'email', required: true },
      { name: 'username', label: 'Username', type: 'text', placeholder: 'huruf, angka, titik, garis bawah' },
      {
        name: 'roles',
        label: 'Peran',
        type: 'multiselect',
        required: true,
        colSpan: 2,
        options: [
          { value: 'teacher', label: 'Guru' },
          { value: 'proctor', label: 'Proktor' },
          { value: 'admin', label: 'Admin Sekolah (khusus Super Admin)' },
          { value: 'superadmin', label: 'Super Admin (khusus Super Admin)' },
        ],
        help: 'Perubahan peran berlaku pada permintaan berikutnya dan tercatat di audit log.',
      },
      { name: 'phone', label: 'No. HP', type: 'text', placeholder: 'Opsional' },
      { name: 'password', label: 'Password awal', type: 'password', help: 'Kosongkan agar dibuat otomatis.' },
      { name: 'active', label: 'Akun aktif', type: 'checkbox', defaultValue: true },
    ],
    columns: [
      {
        key: 'displayName',
        header: 'Pengguna',
        sortValue: (row) => row.displayName,
        render: (row) => (
          <div>
            <p className="font-medium text-navy-900">{row.displayName}</p>
            <p className="text-[11.5px] text-slate-500">{row.email}</p>
          </div>
        ),
      },
      {
        key: 'roles',
        header: 'Peran',
        hideBelow: 'sm',
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            {row.roles.map((role) => (
              <Badge key={role} tone={ROLE_TONE[role]}>
                {ROLE_LABEL[role]}
              </Badge>
            ))}
          </div>
        ),
      },
      { key: 'username', header: 'Username', hideBelow: 'md', render: (row) => row.username || '—' },
      {
        key: 'lastLoginAt',
        header: 'Login terakhir',
        hideBelow: 'lg',
        render: (row) => (row.lastLoginAt ? new Date(row.lastLoginAt).toLocaleString('id-ID') : 'Belum pernah'),
      },
      {
        key: 'active',
        header: 'Status',
        align: 'center',
        width: '100px',
        render: (row) => <Badge tone={row.active ? 'success' : 'neutral'}>{row.active ? 'Aktif' : 'Nonaktif'}</Badge>,
      },
    ],
    filters: [
      {
        name: 'role',
        label: 'Semua peran',
        options: (Object.keys(ROLE_LABEL) as Role[]).map((role) => ({ value: role, label: ROLE_LABEL[role] })),
      },
    ],
    canEdit: true,
    canDelete: true,
    deleteMessage: (row) => `Akun "${row.displayName}" akan di-soft delete dan tidak dapat masuk lagi. Audit log tetap tersimpan.`,
    toFormValues: (row) => ({
      displayName: row.displayName,
      email: row.email,
      username: row.username ?? '',
      roles: row.roles,
      phone: row.phone ?? '',
      active: row.active,
      password: '',
    }),
    beforeSubmit: (values) => {
      const payload: Record<string, unknown> = { ...values, schoolId };
      if (!payload.password) delete payload.password;
      if (!payload.username) delete payload.username;
      if (!payload.phone) delete payload.phone;
      return payload;
    },
    emptyDescription: 'Buat akun staf. Siswa otomatis mendapatkan akun saat ditambahkan di menu Data Siswa.',
  };

  return <CrudResource<User> config={config} />;
}
