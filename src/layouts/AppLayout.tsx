import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  School2,
  ShieldAlert,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { useAuth } from '../services/auth';
import { buildNavigation } from '../app/navigation';
import { NeoTestWordmark } from '../components/Logo';
import { useLocalStorage, useOnlineStatus } from '../hooks';
import { homePathFor } from '../shared/permissions';
import type { Role } from '../shared/types';

const ROLE_LABEL: Record<Role, string> = {
  superadmin: 'Super Admin',
  admin: 'Admin Sekolah',
  teacher: 'Guru',
  proctor: 'Proktor',
  student: 'Siswa',
};

const SEGMENT_LABEL: Record<string, string> = {
  admin: 'Beranda',
  siswa: 'Beranda',
  proktor: 'Beranda',
  guru: 'Beranda',
  students: 'Data Siswa',
  teachers: 'Guru',
  proctors: 'Proktor',
  users: 'Akun & Hak Akses',
  schools: 'Sekolah',
  'academic-years': 'Tahun Ajaran',
  classes: 'Kelas',
  subjects: 'Mata Pelajaran',
  rooms: 'Ruang Ujian',
  'exam-types': 'Jenis Ujian',
  questions: 'Bank Soal',
  forms: 'Paket Ujian',
  schedules: 'Jadwal & Sesi',
  results: 'Analisis Hasil',
  'item-analysis': 'Analisis Butir Soal',
  grading: 'Penilaian Uraian',
  settings: 'Pengaturan',
  audit: 'Audit Log',
  quota: 'Kuota & Kinerja',
  sesi: 'Sesi',
  ujian: 'Ujian',
  hasil: 'Hasil',
  'berita-acara': 'Berita Acara',
  kehadiran: 'Daftar Hadir',
  cetak: 'Cetak',
};

function roleLabel(roles: Role[]): string {
  if (roles.includes('superadmin')) return ROLE_LABEL.superadmin;
  if (roles.includes('admin')) return ROLE_LABEL.admin;
  if (roles.includes('teacher')) return ROLE_LABEL.teacher;
  if (roles.includes('proctor')) return ROLE_LABEL.proctor;
  return ROLE_LABEL.student;
}

export function AppLayout() {
  const { user, config, logout } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useLocalStorage('neotest.sidebar-collapsed', false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);
  const online = useOnlineStatus();

  const roles = user?.roles ?? [];
  const navigation = useMemo(() => buildNavigation(roles), [roles]);
  const home = homePathFor(roles);
  const demo = config?.demo ?? false;

  useEffect(() => {
    setMobileOpen(false);
    setProfileOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    if (!profileOpen) return;
    const handler = (event: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) setProfileOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  const crumbs = useMemo(() => {
    const segments = location.pathname.split('/').filter(Boolean);
    const items = [{ label: 'Beranda', to: home }];
    let path = '';
    for (const segment of segments) {
      path += `/${segment}`;
      const label = SEGMENT_LABEL[segment] ?? decodeURIComponent(segment);
      if (path === home) continue;
      items.push({ label, to: path });
    }
    return items;
  }, [location.pathname, home]);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div className="flex min-h-full bg-[#f5f7fb]">
      {/* Sidebar desktop */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 hidden shrink-0 flex-col bg-navy-900 text-white transition-[width] duration-200 lg:flex ${
          collapsed ? 'w-[76px]' : 'w-64'
        }`}
      >
        <div className={`flex h-16 items-center border-b border-white/10 ${collapsed ? 'justify-center px-2' : 'px-4'}`}>
          <Link to={home} className="flex items-center" aria-label="NeoTest">
            {collapsed ? <NeoTestWordmark compact inverted subtitle="" /> : <NeoTestWordmark inverted />}
          </Link>
        </div>
        <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-4">
          {navigation.map((group) => (
            <div key={group.label} className="mb-4">
              {!collapsed ? (
                <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300/70">
                  {group.label}
                </p>
              ) : (
                <div className="mx-auto mb-2 h-px w-8 bg-white/10" />
              )}
              <div className="space-y-0.5">
                {group.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.exact}
                    className={({ isActive }) =>
                      `nav-link ${isActive ? 'nav-link-active' : ''} ${collapsed ? 'justify-center px-2' : ''}`
                    }
                    title={collapsed ? item.label : undefined}
                  >
                    {item.icon}
                    {!collapsed ? <span className="truncate">{item.label}</span> : null}
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="border-t border-white/10 p-3">
          {!collapsed ? (
            <div className="rounded-lg bg-white/5 p-2.5 text-[11px] leading-relaxed text-navy-200">
              <p className="font-semibold text-white">NeoTest v1.0</p>
              <p>Powered by Pakkar — bukan aplikasi resmi Kemendikdasmen.</p>
            </div>
          ) : null}
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="mt-2 flex w-full items-center justify-center gap-2 rounded-lg px-2 py-1.5 text-[12px] text-navy-200 hover:bg-white/10"
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed ? 'Ciutkan' : null}
          </button>
        </div>
      </aside>

      {/* Drawer mobile */}
      {mobileOpen ? (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-navy-950/60" onClick={() => setMobileOpen(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] max-w-[85vw] flex-col bg-navy-900 text-white shadow-pop">
            <div className="flex h-16 items-center justify-between border-b border-white/10 px-4">
              <NeoTestWordmark inverted />
              <button
                type="button"
                aria-label="Tutup menu"
                onClick={() => setMobileOpen(false)}
                className="rounded-lg p-1.5 hover:bg-white/10"
              >
                <X className="h-5 w-5" />
              </button>
            </div>
            <nav className="thin-scroll flex-1 overflow-y-auto px-2.5 py-4">
              {navigation.map((group) => (
                <div key={group.label} className="mb-4">
                  <p className="mb-1.5 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-navy-300/70">
                    {group.label}
                  </p>
                  <div className="space-y-0.5">
                    {group.items.map((item) => (
                      <NavLink
                        key={item.to}
                        to={item.to}
                        end={item.exact}
                        className={({ isActive }) => `nav-link ${isActive ? 'nav-link-active' : ''}`}
                      >
                        {item.icon}
                        <span>{item.label}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              ))}
            </nav>
          </aside>
        </div>
      ) : null}

      <div className={`flex min-w-0 flex-1 flex-col ${collapsed ? 'lg:pl-[76px]' : 'lg:pl-64'} transition-[padding]`}>
        <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 backdrop-blur">
          <div className="flex h-16 items-center gap-3 px-4 sm:px-6">
            <button
              type="button"
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 lg:hidden"
              aria-label="Buka menu"
              onClick={() => setMobileOpen(true)}
            >
              <Menu className="h-5 w-5" />
            </button>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="truncate text-[13px] font-semibold text-navy-900">
                  {config?.schoolName ?? 'NeoTest'}
                </p>
                {demo ? (
                  <span className="hidden rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-800 sm:inline-flex">
                    Mode Demo
                  </span>
                ) : null}
                {!online ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700">
                    <WifiOff className="h-3 w-3" /> Offline
                  </span>
                ) : null}
              </div>
              <nav aria-label="Breadcrumb" className="hidden items-center gap-1 text-[11.5px] text-slate-500 sm:flex">
                {crumbs.map((crumb, index) => (
                  <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
                    {index > 0 ? <ChevronRight className="h-3 w-3 text-slate-300" /> : null}
                    {index === crumbs.length - 1 ? (
                      <span className="font-medium text-slate-600">{crumb.label}</span>
                    ) : (
                      <Link to={crumb.to} className="hover:text-brand-700">
                        {crumb.label}
                      </Link>
                    )}
                  </span>
                ))}
              </nav>
            </div>

            <div className="relative" ref={profileRef}>
              <button
                type="button"
                onClick={() => setProfileOpen((v) => !v)}
                className="flex items-center gap-2 rounded-full border border-slate-200 bg-white py-1 pl-1 pr-2.5 text-left hover:bg-slate-50"
                aria-haspopup="menu"
                aria-expanded={profileOpen}
              >
                <span className="grid h-8 w-8 place-items-center rounded-full bg-brand-100 text-[12px] font-bold text-brand-800">
                  {user?.displayName
                    ?.split(' ')
                    .slice(0, 2)
                    .map((s) => s[0])
                    .join('')
                    .toUpperCase() ?? <UserRound className="h-4 w-4" />}
                </span>
                <span className="hidden min-w-0 sm:block">
                  <span className="block max-w-[150px] truncate text-[12.5px] font-semibold text-navy-900">
                    {user?.displayName}
                  </span>
                  <span className="block text-[10.5px] uppercase tracking-wide text-slate-500">
                    {roleLabel(roles)}
                  </span>
                </span>
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              </button>
              {profileOpen ? (
                <div
                  role="menu"
                  className="absolute right-0 top-12 w-64 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-pop"
                >
                  <div className="border-b border-slate-100 px-4 py-3">
                    <p className="text-sm font-semibold text-navy-900">{user?.displayName}</p>
                    <p className="truncate text-[12px] text-slate-500">{user?.email}</p>
                    <div className="mt-1.5 flex flex-wrap gap-1">
                      {roles.map((role) => (
                        <span key={role} className="rounded-full bg-navy-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-navy-700">
                          {ROLE_LABEL[role]}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="px-2 py-2">
                    <Link
                      to={home}
                      className="flex items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-slate-600 hover:bg-slate-50"
                    >
                      <School2 className="h-4 w-4" /> {config?.schoolName ?? 'Sekolah aktif'}
                    </Link>
                    <button
                      type="button"
                      onClick={handleLogout}
                      className="flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-[13px] text-red-700 hover:bg-red-50"
                    >
                      <LogOut className="h-4 w-4" /> Keluar
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
          </div>
        </header>

        {config?.demoEphemeral ? (
          <div className="border-b border-orange-200 bg-orange-50 px-4 py-2 text-[12px] text-orange-900 sm:px-6">
            <span className="inline-flex items-start gap-1.5">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Mode demo di Vercel menyimpan data sementara di <code className="rounded bg-white px-1">/tmp</code>; data
              dapat direset saat instance didaur ulang. Aktifkan Firebase untuk data permanen.
            </span>
          </div>
        ) : null}

        <main className="mx-auto w-full max-w-[1440px] flex-1 px-4 py-5 sm:px-6 sm:py-6">
          <Suspense
            fallback={
              <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 text-slate-500">
                <span className="h-8 w-8 animate-spin rounded-full border-2 border-slate-200 border-t-brand-700" />
                <span className="text-[12.5px]">Memuat halaman…</span>
              </div>
            }
          >
            <Outlet />
          </Suspense>
        </main>

        <footer className="mx-auto flex w-full max-w-[1440px] flex-wrap items-center justify-between gap-2 border-t border-slate-200 px-4 py-3 text-[11.5px] text-slate-400 sm:px-6">
          <span>NeoTest — Powered by Pakkar</span>
          <span className="flex items-center gap-1">
            <ChevronLeft className="h-3 w-3" /> Waktu server digunakan untuk seluruh aturan ujian
          </span>
        </footer>
      </div>
    </div>
  );
}
