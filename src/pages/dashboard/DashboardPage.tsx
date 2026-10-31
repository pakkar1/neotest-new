import { Link } from 'react-router-dom';
import {
  Activity,
  AlertTriangle,
  ArrowRight,
  BarChart3,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  ClipboardCheck,
  Clock,
  FileCheck2,
  GraduationCap,
  KeyRound,
  LayoutDashboard,
  ListChecks,
  Monitor,
  PenLine,
  RefreshCw,
  School,
  ShieldCheck,
  Timer,
  UserPlus,
  Users,
} from 'lucide-react';
import { useAuth } from '../../services/auth';
import { apiRequest } from '../../services/api';
import { useAsync, usePageTitle } from '../../hooks';
import { PageHeader } from '../../components/ui/PageHeader';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import type { DashboardStats, Role } from '../../shared/types';
import { formatDateTimeId } from '../../shared/time';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin Sekolah',
  teacher: 'Guru',
  proctor: 'Proktor',
  student: 'Siswa',
};

const ACTION_LABEL: Record<string, string> = {
  login_success: 'Masuk aplikasi',
  login_failed: 'Percobaan masuk gagal',
  logout: 'Keluar aplikasi',
  form_publish: 'Menerbitkan paket ujian',
  schedule_create: 'Membuat jadwal ujian',
  session_open: 'Membuka sesi ujian',
  session_close: 'Menutup sesi ujian',
  token_issue: 'Menerbitkan token',
  token_revoke: 'Mencabut token',
  attempt_start: 'Memulai pengerjaan',
  attempt_submit: 'Mengirim jawaban',
  attempt_autosubmit: 'Kirim otomatis (waktu habis)',
  grade_change: 'Mengubah nilai',
  result_publish: 'Mempublikasikan hasil',
  student_import: 'Impor data siswa',
  user_create: 'Membuat akun',
  user_update: 'Memperbarui akun',
  reset_demo: 'Reset data demo',
  incident_create: 'Mencatat insiden',
};

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 11) return 'Selamat pagi';
  if (hour < 15) return 'Selamat siang';
  if (hour < 18) return 'Selamat sore';
  return 'Selamat malam';
}

const CARD_ICON: Record<string, React.ReactNode> = {
  students: <GraduationCap className="h-5 w-5" />,
  users: <Users className="h-5 w-5" />,
  sessions: <Monitor className="h-5 w-5" />,
  pending: <Clock className="h-5 w-5" />,
  schools: <School className="h-5 w-5" />,
  open: <CircleDot className="h-5 w-5" />,
  participants: <Users className="h-5 w-5" />,
  finished: <CheckCircle2 className="h-5 w-5" />,
  questions: <PenLine className="h-5 w-5" />,
  ready: <ShieldCheck className="h-5 w-5" />,
  forms: <FileCheck2 className="h-5 w-5" />,
  schedules: <CalendarClock className="h-5 w-5" />,
};

interface QuickAction {
  to: string;
  label: string;
  description: string;
  icon: React.ReactNode;
  roles: Role[];
  permission?: string;
}

const QUICK_ACTIONS: QuickAction[] = [
  { to: '/admin/students', label: 'Tambah siswa', description: 'Input manual atau impor CSV', icon: <UserPlus className="h-4 w-4" />, roles: ['admin', 'superadmin'] },
  { to: '/admin/questions', label: 'Bank soal', description: 'Tulis soal & kunci jawaban', icon: <PenLine className="h-4 w-4" />, roles: ['admin', 'superadmin', 'teacher'] },
  { to: '/admin/forms', label: 'Paket ujian', description: 'Susun & terbitkan paket', icon: <FileCheck2 className="h-4 w-4" />, roles: ['admin', 'superadmin', 'teacher'] },
  { to: '/admin/schedules', label: 'Jadwal ujian', description: 'Sesi, ruang, dan peserta', icon: <CalendarClock className="h-4 w-4" />, roles: ['admin', 'superadmin'] },
  { to: '/proktor', label: 'Ruang proktor', description: 'Buka sesi & terbitkan token', icon: <KeyRound className="h-4 w-4" />, roles: ['proctor'] },
  { to: '/admin/grading', label: 'Nilai uraian', description: 'Periksa jawaban esai', icon: <ClipboardCheck className="h-4 w-4" />, roles: ['admin', 'superadmin', 'teacher'] },
  { to: '/admin/results', label: 'Analisis hasil', description: 'Statistik & butir soal', icon: <BarChart3 className="h-4 w-4" />, roles: ['admin', 'superadmin', 'teacher'] },
];

export default function DashboardPage() {
  usePageTitle('Dashboard');
  const { user, config } = useAuth();
  const isDemo = config?.demo ?? false;
  const primaryRole: Role = user?.roles.includes('superadmin')
    ? 'superadmin'
    : user?.roles.includes('admin')
      ? 'admin'
      : user?.roles.includes('teacher')
        ? 'teacher'
        : 'proctor';

  const dashboard = useAsync<DashboardStats>(
    () => apiRequest<DashboardStats>('/api/admin', { query: { resource: 'dashboard' } }),
    [user?.id],
  );

  const data = dashboard.data;
  const quota = data?.quota;
  const actions = QUICK_ACTIONS.filter((action) => action.roles.includes(primaryRole)).slice(0, 4);

  return (
    <div>
      <PageHeader
        title={`${greeting()}, ${user?.displayName?.split(' ')[0] ?? 'Pengguna'}`}
        description={
          <>
            Ringkasan {ROLE_LABEL[primaryRole].toLowerCase()} untuk{' '}
            <span className="font-medium text-slate-700">{config?.schoolName ?? 'sekolah aktif'}</span>
            {isDemo ? ' — data contoh (DEMO)' : ''}.
          </>
        }
        breadcrumb={[{ label: 'Beranda' }]}
        badge={<Badge tone="info">{ROLE_LABEL[primaryRole]}</Badge>}
        actions={
          <Button
            variant="secondary"
            icon={<RefreshCw className={`h-4 w-4 ${dashboard.loading ? 'animate-spin' : ''}`} />}
            onClick={() => void dashboard.reload()}
            disabled={dashboard.loading}
          >
            Muat ulang
          </Button>
        }
      />

      {isDemo ? (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-[12.5px] text-orange-900">
          <strong>Mode DEMO.</strong> Seluruh data di bawah adalah contoh. Jangan digunakan untuk ujian sungguhan
          tanpa mengganti konfigurasi Firebase dan mengganti seluruh password demo.
        </div>
      ) : null}

      {dashboard.loading && !data ? <LoadingState label="Memuat ringkasan dashboard…" /> : null}
      {dashboard.error ? <ErrorState message={dashboard.error} onRetry={() => void dashboard.reload()} /> : null}

      {data ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {data.cards.map((card) => (
              <StatCard
                key={card.key}
                label={card.label}
                value={card.value}
                hint={card.hint}
                tone={card.tone}
                icon={CARD_ICON[card.key]}
              />
            ))}
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
            <Card className="xl:col-span-2" padded={false}>
              <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-5 py-3.5">
                <CardHeader
                  title="Jadwal ujian mendatang"
                  description="Diurutkan berdasarkan tanggal dan jam mulai (zona Asia/Jakarta)."
                />
                <Link
                  to={primaryRole === 'proctor' ? '/proktor/sesi' : '/admin/schedules'}
                  className="shrink-0 text-[12.5px] font-medium text-brand-700 hover:underline"
                >
                  Lihat semua
                </Link>
              </div>
              {data.upcoming.length === 0 ? (
                <div className="p-5">
                  <EmptyState
                    title="Belum ada jadwal mendatang"
                    description="Jadwal ujian yang sudah dibuat dan belum lewat akan muncul di sini."
                    icon={<CalendarClock className="h-6 w-6" />}
                    action={
                      primaryRole !== 'proctor' ? (
                        <Link to="/admin/schedules">
                          <Button variant="secondary" size="sm">
                            Buat jadwal
                          </Button>
                        </Link>
                      ) : undefined
                    }
                  />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {data.upcoming.map((item) => {
                    const date = new Date(`${item.date}T${item.startTime}:00+07:00`);
                    const valid = !Number.isNaN(date.getTime());
                    return (
                      <li key={item.id}>
                        <Link
                          to={primaryRole === 'proctor' ? '/proktor/sesi' : `/admin/schedules`}
                          className="flex items-center gap-3 px-5 py-3 transition hover:bg-slate-50"
                        >
                          <div className="grid w-12 shrink-0 place-items-center rounded-lg bg-brand-50 py-1.5 text-brand-800">
                            <span className="text-[10px] font-semibold uppercase">
                              {valid ? date.toLocaleDateString('id-ID', { month: 'short' }) : '—'}
                            </span>
                            <span className="text-base font-bold leading-none">
                              {valid ? date.getDate() : '--'}
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-[13.5px] font-semibold text-navy-900">{item.title}</p>
                            <p className="mt-0.5 flex items-center gap-1 text-[12px] text-slate-500">
                              <Clock className="h-3 w-3" /> {item.startTime}–{item.endTime}
                              {item.sessionCount > 0 ? ` · ${item.sessionCount} sesi` : ''}
                            </p>
                          </div>
                          <Badge tone={item.status === 'open' ? 'success' : item.status === 'closed' ? 'neutral' : 'info'}>
                            {item.status === 'open' ? 'Berlangsung' : item.status === 'closed' ? 'Selesai' : 'Terjadwal'}
                          </Badge>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Aksi cepat" description="Pekerjaan yang paling sering dilakukan." />
                <div className="mt-3 space-y-2">
                  {actions.length === 0 ? (
                    <p className="text-[12.5px] text-slate-500">Tidak ada aksi cepat untuk peran ini.</p>
                  ) : null}
                  {actions.map((action) => (
                    <Link
                      key={action.to + action.label}
                      to={action.to}
                      className="group flex items-center gap-2.5 rounded-lg border border-slate-200 px-3 py-2 transition hover:border-brand-300 hover:bg-brand-50/40"
                    >
                      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-navy-50 text-navy-700">
                        {action.icon}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium text-slate-800">{action.label}</span>
                        <span className="block truncate text-[11.5px] text-slate-500">{action.description}</span>
                      </span>
                      <ArrowRight className="h-4 w-4 shrink-0 text-slate-300 group-hover:text-brand-600" />
                    </Link>
                  ))}
                </div>
              </Card>

              {quota ? (
                <Card>
                  <CardHeader
                    title="Kuota harian"
                    description="Perkiraan pemakaian internal, bukan metrik resmi Firebase."
                    actions={<Badge tone={quota.warning ? 'warning' : 'success'}>{quota.warning ? 'Perhatian' : 'Aman'}</Badge>}
                  />
                  <div className="mt-3 space-y-3">
                    <QuotaBar label="Bacaan" value={quota.reads} limit={quota.limits.reads} />
                    <QuotaBar label="Penulisan" value={quota.writes} limit={quota.limits.writes} />
                    {quota.warning ? (
                      <p className="flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-[11.5px] text-amber-900">
                        <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {quota.warning}
                      </p>
                    ) : null}
                    <Link to="/admin/quota" className="block text-[12px] font-medium text-brand-700 hover:underline">
                      Lihat rincian kuota →
                    </Link>
                  </div>
                </Card>
              ) : null}
            </div>
          </div>

          {data.activity.length > 0 ? (
            <Card className="mt-4" padded={false}>
              <div className="border-b border-slate-100 px-5 py-3.5">
                <CardHeader
                  title="Aktivitas terbaru"
                  description="Diambil dari audit log. Setiap aksi penting tercatat beserta pelakunya."
                  actions={
                    <Link to="/admin/audit" className="text-[12.5px] font-medium text-brand-700 hover:underline">
                      Audit log
                    </Link>
                  }
                />
              </div>
              <ul className="divide-y divide-slate-100">
                {data.activity.map((entry) => (
                  <li key={entry.id} className="flex items-start gap-3 px-5 py-2.5">
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-500">
                      <Activity className="h-3.5 w-3.5" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[13px] text-slate-800">
                        <span className="font-medium">{entry.actor || 'Sistem'}</span>{' '}
                        {ACTION_LABEL[entry.action] ?? entry.action.replaceAll('_', ' ')}
                      </p>
                      <p className="text-[11.5px] text-slate-500">
                        {entry.targetType} · {formatDateTimeId(entry.at)}
                      </p>
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          ) : null}
        </>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-dashed border-slate-300 bg-white/60 px-4 py-3 text-[12px] text-slate-500">
        <LayoutDashboard className="h-4 w-4 text-slate-400" />
        <span>
          Waktu server: <span className="font-medium text-slate-700">{config?.serverNow ? formatDateTimeId(config.serverNow) : '—'}</span>.
          Seluruh aturan waktu ujian (mulai, simpan, kirim) memakai jam server, bukan jam perangkat peserta.
        </span>
        <ListChecks className="ml-auto hidden h-4 w-4 text-slate-300 sm:block" />
        <Timer className="hidden h-4 w-4 text-slate-300 sm:block" />
      </div>
    </div>
  );
}

function QuotaBar({ label, value, limit }: { label: string; value: number; limit: number }) {
  const pct = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  const tone = pct >= 90 ? 'bg-danger' : pct >= 70 ? 'bg-warning' : 'bg-brand-600';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">
          {value.toLocaleString('id-ID')} / {limit.toLocaleString('id-ID')} ({pct}%)
        </span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${tone}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
