import {
  Activity,
  BarChart3,
  BookCopy,
  Building2,
  CalendarDays,
  ClipboardCheck,
  ClipboardList,
  FileBarChart,
  FileCheck2,
  Gauge,
  GraduationCap,
  LayoutDashboard,
  ListChecks,
  Monitor,
  PenLine,
  ScrollText,
  Settings,
  ShieldCheck,
  UserCog,
  Users,
  UsersRound,
  Building,
} from 'lucide-react';
import type { ReactNode } from 'react';
import type { Role } from '../shared/types';
import { hasPermission, type Permission } from '../shared/permissions';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  permission?: Permission;
  roles?: Role[];
  exact?: boolean;
}

export interface NavGroup {
  label: string;
  items: NavItem[];
}

const I = (el: ReactNode) => el;

export function buildNavigation(roles: Role[]): NavGroup[] {
  const staffHome = roles.includes('proctor') && !roles.includes('admin') && !roles.includes('teacher')
    ? '/proktor'
    : roles.includes('teacher') && !roles.includes('admin')
      ? '/guru'
      : '/admin';

  const groups: NavGroup[] = [
    {
      label: 'Utama',
      items: [
        {
          to: staffHome,
          label: 'Dashboard',
          icon: I(<LayoutDashboard className="h-4 w-4" />),
          exact: true,
        },
      ],
    },
    {
      label: 'Akademik',
      items: [
        { to: '/admin/academic-years', label: 'Tahun Ajaran', icon: I(<CalendarDays className="h-4 w-4" />), permission: 'school.manage' },
        { to: '/admin/classes', label: 'Kelas', icon: I(<UsersRound className="h-4 w-4" />), permission: 'class.manage' },
        { to: '/admin/subjects', label: 'Mata Pelajaran', icon: I(<BookCopy className="h-4 w-4" />), permission: 'subject.manage' },
        { to: '/admin/rooms', label: 'Ruang Ujian', icon: I(<Building className="h-4 w-4" />), permission: 'schedule.manage' },
      ],
    },
    {
      label: 'Pengguna',
      items: [
        { to: '/admin/students', label: 'Data Siswa', icon: I(<GraduationCap className="h-4 w-4" />), permission: 'student.manage' },
        { to: '/admin/teachers', label: 'Guru', icon: I(<Users className="h-4 w-4" />), permission: 'user.manage' },
        { to: '/admin/proctors', label: 'Proktor', icon: I(<ShieldCheck className="h-4 w-4" />), permission: 'user.manage' },
        { to: '/admin/users', label: 'Akun & Hak Akses', icon: I(<UserCog className="h-4 w-4" />), permission: 'user.manage' },
      ],
    },
    {
      label: 'Ujian',
      items: [
        { to: '/admin/exam-types', label: 'Jenis Ujian', icon: I(<ClipboardList className="h-4 w-4" />), permission: 'examtype.manage' },
        { to: '/admin/questions', label: 'Bank Soal', icon: I(<PenLine className="h-4 w-4" />), permission: 'question.manage' },
        { to: '/admin/forms', label: 'Paket Ujian', icon: I(<FileCheck2 className="h-4 w-4" />), permission: 'form.manage' },
        { to: '/admin/schedules', label: 'Jadwal & Sesi', icon: I(<CalendarDays className="h-4 w-4" />), permission: 'schedule.manage' },
      ],
    },
    {
      label: 'Hasil',
      items: [
        { to: '/admin/results', label: 'Analisis Hasil', icon: I(<BarChart3 className="h-4 w-4" />), permission: 'analysis.read' },
        { to: '/admin/grading', label: 'Penilaian Uraian', icon: I(<ClipboardCheck className="h-4 w-4" />), permission: 'result.grade' },
      ],
    },
    {
      label: 'Sistem',
      items: [
        { to: '/admin/schools', label: 'Sekolah', icon: I(<Building2 className="h-4 w-4" />), roles: ['superadmin'] },
        { to: '/admin/settings', label: 'Pengaturan', icon: I(<Settings className="h-4 w-4" />), permission: 'settings.manage' },
        { to: '/admin/audit', label: 'Audit Log', icon: I(<ScrollText className="h-4 w-4" />), permission: 'audit.read' },
        { to: '/admin/quota', label: 'Kuota & Kinerja', icon: I(<Gauge className="h-4 w-4" />), permission: 'settings.manage' },
      ],
    },
  ];

  const proctorGroups: NavGroup[] = [
    {
      label: 'Pengawasan',
      items: [
        { to: '/proktor', label: 'Dashboard Proktor', icon: I(<Monitor className="h-4 w-4" />), exact: true },
        { to: '/proktor/sesi', label: 'Sesi Saya', icon: I(<ListChecks className="h-4 w-4" />) },
        { to: '/proktor/laporan', label: 'Dokumen & Cetak', icon: I(<FileBarChart className="h-4 w-4" />) },
      ],
    },
  ];

  const studentGroups: NavGroup[] = [
    {
      label: 'Ujian Saya',
      items: [
        { to: '/siswa', label: 'Beranda Ujian', icon: I(<Activity className="h-4 w-4" />), exact: true },
        { to: '/siswa/hasil', label: 'Hasil & Pembahasan', icon: I(<FileBarChart className="h-4 w-4" />) },
      ],
    },
  ];

  if (roles.includes('student') && roles.length === 1) return studentGroups;
  if (roles.includes('proctor') && !roles.includes('admin') && !roles.includes('teacher')) return proctorGroups;

  return groups
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        if (item.roles && !item.roles.some((r) => roles.includes(r))) return false;
        if (item.permission && !hasPermission(roles, item.permission)) return false;
        return true;
      }),
    }))
    .filter((group) => group.items.length > 0);
}
