import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Activity, CalendarDays, FileBarChart, Monitor, RefreshCw, ShieldCheck, Timer } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { useAsync, usePageTitle } from '../../hooks';
import { useAuth } from '../../services/auth';
import { apiRequest } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import { SessionList } from './SessionList';
import type { SessionSummary } from '../../lib/proctorTypes';

export default function ProctorDashboardPage() {
  usePageTitle('Dashboard Proktor');
  const { user, config } = useAuth();
  const [all, setAll] = useState(false);
  const sessions = useAsync(
    () =>
      apiRequest<{ items: SessionSummary[] }>('/api/proctor', {
        query: { resource: 'sessions', ...(all ? { all: 1 } : {}) },
      }),
    [all],
  );

  const items = sessions.data?.items ?? [];
  const open = items.filter((s) => s.session.status === 'open').length;
  const participants = items.reduce((a, s) => a + s.counts.total, 0);
  const working = items.reduce((a, s) => a + s.counts.inProgress + s.counts.awaitingSubmit, 0);

  return (
    <div>
      <PageHeader
        title={`Selamat bertugas, ${user?.displayName?.split(' ')[0] ?? 'Proktor'}`}
        description="Pantau sesi di ruang yang Anda awasi, terbitkan token, dan catat kejadian penting. Data ditampilkan sesuai penugasan ruang Anda."
        breadcrumb={[{ label: 'Beranda' }]}
        actions={
          <>
            <Button variant={all ? 'primary' : 'secondary'} size="sm" onClick={() => setAll((v) => !v)} icon={<CalendarDays className="h-4 w-4" />}>
              {all ? 'Semua sesi' : 'Hari ini'}
            </Button>
            <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${sessions.loading ? 'animate-spin' : ''}`} />} onClick={() => void sessions.reload()}>
              Muat ulang
            </Button>
          </>
        }
      />

      {config?.demo ? (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-[12.5px] text-orange-900">
          Mode DEMO — token ujian di sini hanya berlaku pada data contoh. Token asli tidak disimpan dan hanya
          ditampilkan sekali saat diterbitkan.
        </div>
      ) : null}

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Sesi ditugaskan" value={items.length} icon={<Monitor className="h-5 w-5" />} tone="navy" />
        <StatCard label="Sesi berlangsung" value={open} icon={<Activity className="h-5 w-5" />} tone="success" />
        <StatCard label="Peserta" value={participants} icon={<ShieldCheck className="h-5 w-5" />} tone="info" />
        <StatCard label="Sedang mengerjakan" value={working} icon={<Timer className="h-5 w-5" />} tone="warning" />
      </div>

      {sessions.loading && !sessions.data ? <LoadingState label="Memuat sesi…" /> : null}
      {sessions.error ? <ErrorState message={sessions.error} onRetry={() => void sessions.reload()} /> : null}

      {sessions.data ? (
        <SessionList
          items={items}
          onRefresh={() => void sessions.reload()}
          emptyTitle={all ? 'Belum ada sesi untuk Anda' : 'Tidak ada sesi hari ini'}
          emptyDescription={
            all
              ? 'Sesi muncul setelah admin membuat jadwal dan menugaskan Anda sebagai proktor.'
              : 'Coba tampilkan semua sesi atau periksa jadwal yang ditugaskan admin.'
          }
        />
      ) : null}

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card>
          <CardHeader title="Token sesi" description="Terbitkan token mulai setelah seluruh peserta siap." />
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-slate-600">
            <li>• Token berlaku maksimal 4 jam dan dapat dicabut kapan saja.</li>
            <li>• Nilai token hanya tampil sekali; yang disimpan hanya hash-nya.</li>
            <li>• Token kirim memiliki masa berlaku lebih pendek dan terpisah.</li>
          </ul>
        </Card>
        <Card>
          <CardHeader title="Dokumen pengawasan" description="Cetak A4 dengan kop sekolah dan tanda tangan." />
          <div className="mt-3 flex flex-wrap gap-2">
            <Link to="/proktor/laporan">
              <Button size="sm" variant="secondary" icon={<FileBarChart className="h-3.5 w-3.5" />}>
                Dokumen & cetak
              </Button>
            </Link>
            <Link to="/proktor/sesi">
              <Button size="sm" variant="secondary" icon={<Monitor className="h-3.5 w-3.5" />}>
                Semua sesi
              </Button>
            </Link>
          </div>
        </Card>
        <Card>
          <CardHeader title="Waktu" description="Zona waktu Asia/Jakarta digunakan untuk jadwal." />
          <p className="mt-2 text-[13px] text-slate-700">{formatDateTimeId(config?.serverNow ?? null)}</p>
          <p className="mt-1 text-[11.5px] text-slate-500">
            Sesi terbuka tetap dapat diakses sesuai jam mulai/berakhir, bukan jam perangkat.
          </p>
          <div className="mt-2">
            <Badge tone="info">Server time</Badge>
          </div>
        </Card>
      </div>
    </div>
  );
}
