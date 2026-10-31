import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { ShieldX } from 'lucide-react';
import { useAuth } from '../services/auth';
import { hasPermission, homePathFor, type Permission } from '../shared/permissions';
import type { Role } from '../shared/types';
import { FullPageLoader } from '../components/ui/States';
import { NeoTestWordmark } from '../components/Logo';
import { Button } from '../components/ui/Button';
import { Link } from 'react-router-dom';

export function RequireAuth({ roles }: { roles?: Role[] }) {
  const { status, user } = useAuth();
  const location = useLocation();

  if (status === 'loading') return <FullPageLoader label="Memeriksa sesi…" />;
  if (!user) {
    return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  }
  if (roles && !roles.some((role) => user.roles.includes(role))) {
    return <ForbiddenPage home={homePathFor(user.roles)} />;
  }
  return <Outlet />;
}

export function RequirePermission({ permission }: { permission: Permission }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  if (!hasPermission(user.roles, permission)) {
    return <ForbiddenPage home={homePathFor(user.roles)} />;
  }
  return <Outlet />;
}

export function ForbiddenPage({ home }: { home: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f7fb] px-4 py-10 text-center">
      <NeoTestWordmark />
      <div className="mt-8 grid h-16 w-16 place-items-center rounded-2xl bg-red-50 text-red-600">
        <ShieldX className="h-8 w-8" />
      </div>
      <h1 className="mt-4 text-xl font-bold text-navy-900">Akses ditolak</h1>
      <p className="mt-1 max-w-md text-[13.5px] leading-relaxed text-slate-500">
        Peran akun Anda tidak memiliki izin untuk membuka halaman ini. Izin juga diperiksa ulang di server; jika
        Anda merasa ini keliru, hubungi administrator sekolah.
      </p>
      <div className="mt-5 flex gap-2">
        <Link to={home}>
          <Button variant="secondary">Kembali ke beranda</Button>
        </Link>
      </div>
    </div>
  );
}

export function NotFoundPage() {
  const { user, status } = useAuth();
  const home = status === 'ready' && user ? homePathFor(user.roles) : '/login';
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-[#f5f7fb] px-4 text-center">
      <NeoTestWordmark />
      <p className="mt-8 text-5xl font-extrabold text-navy-900">404</p>
      <h1 className="mt-2 text-lg font-semibold text-slate-700">Halaman tidak ditemukan</h1>
      <p className="mt-1 max-w-md text-[13px] text-slate-500">
        Tautan mungkin sudah berubah atau Anda tidak memiliki akses ke halaman tersebut.
      </p>
      <Link to={home} className="mt-5">
        <Button>Ke beranda</Button>
      </Link>
    </div>
  );
}
