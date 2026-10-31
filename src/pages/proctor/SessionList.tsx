import { useState } from 'react';
import { Link } from 'react-router-dom';
import { CalendarDays, DoorOpen, FileText, Link2, Lock, Printer, Users } from 'lucide-react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { Card } from '../../components/ui/Card';
import { ConfirmDialog } from '../../components/ui/Modal';
import { EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { apiRequest, ApiClientError } from '../../services/api';
import type { SessionSummary } from '../../lib/proctorTypes';

function timeRange(startsAt: string, endsAt: string): string {
  const format = (iso: string) =>
    new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
  return `${format(startsAt)}–${format(endsAt)}`;
}

export function SessionList({
  items,
  onRefresh,
  emptyTitle = 'Tidak ada sesi',
  emptyDescription = 'Sesi akan muncul di sini setelah admin membuat jadwal dan menugaskan Anda.',
}: {
  items: SessionSummary[];
  onRefresh: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const toast = useToast();
  const [confirm, setConfirm] = useState<{ item: SessionSummary; action: 'open' | 'close' } | null>(null);
  const [busy, setBusy] = useState(false);

  const run = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'session-control', action: confirm.action },
        body: { sessionId: confirm.item.session.id },
      });
      toast.success(confirm.action === 'open' ? 'Sesi dibuka.' : 'Sesi ditutup.');
      setConfirm(null);
      onRefresh();
    } catch (err) {
      toast.error('Gagal mengubah sesi', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  if (items.length === 0) {
    return <EmptyState title={emptyTitle} description={emptyDescription} icon={<CalendarDays className="h-6 w-6" />} />;
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        {items.map((item) => {
          const { session, schedule, room, counts } = item;
          return (
            <Card key={session.id} className="flex flex-col gap-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[14px] font-semibold text-navy-900">{schedule.title}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                    <CalendarDays className="h-3.5 w-3.5" />
                    {schedule.date} · {timeRange(session.startsAt, session.endsAt)}
                    <span className="text-slate-300">|</span>
                    {room.name} · sesi {session.code}
                  </p>
                  <p className="mt-0.5 text-[11.5px] text-slate-500">
                    {item.subjectName} · {item.proctor.fullName}
                  </p>
                </div>
                <Badge tone={session.status === 'open' ? 'success' : session.status === 'closed' ? 'neutral' : 'info'}>
                  {session.status === 'open' ? 'Berlangsung' : session.status === 'closed' ? 'Ditutup' : 'Persiapan'}
                </Badge>
              </div>

              <div className="grid grid-cols-4 gap-2 rounded-lg bg-slate-50 p-2 text-center">
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-500">Peserta</p>
                  <p className="text-[15px] font-bold text-navy-900">{counts.total}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-500">Mengerjakan</p>
                  <p className="text-[15px] font-bold text-amber-700">{counts.inProgress + counts.awaitingSubmit}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-500">Selesai</p>
                  <p className="text-[15px] font-bold text-green-700">{counts.finished + counts.submitted}</p>
                </div>
                <div>
                  <p className="text-[10.5px] uppercase tracking-wide text-slate-500">Absen</p>
                  <p className="text-[15px] font-bold text-red-700">{counts.absent}</p>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-1.5">
                <Link to={`/proktor/sesi/${session.id}`}>
                  <Button size="sm" variant="secondary" icon={<Users className="h-3.5 w-3.5" />}>
                    Kelola sesi
                  </Button>
                </Link>
                {session.status === 'preparation' ? (
                  <Button size="sm" variant="success" icon={<DoorOpen className="h-3.5 w-3.5" />} onClick={() => setConfirm({ item, action: 'open' })}>
                    Buka sesi
                  </Button>
                ) : null}
                {session.status === 'open' ? (
                  <Button size="sm" variant="danger" icon={<Lock className="h-3.5 w-3.5" />} onClick={() => setConfirm({ item, action: 'close' })}>
                    Tutup sesi
                  </Button>
                ) : null}
                <Link to={`/cetak/kehadiran/${session.id}`} target="_blank" className="ml-auto">
                  <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />} aria-label="Daftar hadir">
                    Hadir
                  </Button>
                </Link>
                <Link to={`/cetak/berita-acara/${session.id}`} target="_blank">
                  <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />} aria-label="Berita acara">
                    BA
                  </Button>
                </Link>
                {item.activeStartToken || item.activeSubmitToken ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-green-50 px-2 py-0.5 text-[10.5px] font-medium text-green-800">
                    <Link2 className="h-3 w-3" /> Token aktif
                  </span>
                ) : null}
              </div>
            </Card>
          );
        })}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.action === 'open' ? 'primary' : 'danger'}
        title={confirm?.action === 'open' ? 'Buka sesi?' : 'Tutup sesi?'}
        message={
          confirm?.action === 'open'
            ? `Sesi ${confirm.item.session.code} di ${confirm.item.room.name} akan dibuka. Terbitkan token mulai setelah peserta siap.`
            : `Sesi ${confirm?.item.session.code} akan ditutup. Peserta yang masih mengerjakan akan difinalisasi sesuai aturan waktu dan tidak dapat melanjutkan.`
        }
        confirmLabel={confirm?.action === 'open' ? 'Buka' : 'Tutup sesi'}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void run()}
      />
    </>
  );
}
