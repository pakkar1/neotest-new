import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarDays,
  ClipboardList,
  DoorOpen,
  FileText,
  Lock,
  Monitor,
  Printer,
  Users,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, InfoRow, StatCard } from '../../components/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { DataTable } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/Modal';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { ExamParticipant, ExamSchedule, ExamSession } from '../../shared/types';

type SessionRow = ExamSession & { roomName: string; proctorName: string };

interface DetailResponse {
  doc: ExamSchedule;
  sessions: SessionRow[];
  participants: ExamParticipant[];
}

export default function ScheduleDetailPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<{ row: SessionRow; action: 'open' | 'close' } | null>(null);
  usePageTitle('Detail Jadwal');

  const detail = useAsync(
    () => apiRequest<DetailResponse>('/api/exams', { query: { resource: 'schedules', id: id ?? '' } }),
    [id],
    { enabled: Boolean(id) },
  );

  const control = async () => {
    if (!confirm) return;
    setBusyId(confirm.row.id);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'session-control', action: confirm.action },
        body: { sessionId: confirm.row.id },
      });
      toast.success(confirm.action === 'open' ? 'Sesi dibuka.' : 'Sesi ditutup.');
      setConfirm(null);
      await detail.reload();
    } catch (err) {
      toast.error('Gagal mengubah sesi', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusyId(null);
    }
  };

  if (detail.loading) return <LoadingState label="Memuat detail jadwal…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'Jadwal tidak ditemukan.'} onRetry={() => void detail.reload()} />;
  }

  const { doc, sessions, participants } = detail.data;
  const totalParticipants = participants.length;
  const finished = participants.filter((p) => p.status === 'finished' || p.status === 'submitted').length;
  const inProgress = participants.filter((p) => p.status === 'in_progress' || p.status === 'awaiting_submit').length;

  return (
    <div>
      <PageHeader
        title={doc.title}
        description={`${doc.date} · ${doc.startTime}–${doc.endTime} · durasi ${doc.durationMinutes} menit · ${sessions.length} sesi`}
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Jadwal & Sesi', to: '/admin/schedules' }, { label: 'Detail' }]}
        actions={
          <>
            <Link to="/admin/schedules">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Kembali
              </Button>
            </Link>
            <Button
              variant="secondary"
              icon={<Printer className="h-4 w-4" />}
              onClick={() => window.open(`/cetak/kehadiran/${sessions[0]?.id ?? ''}`, '_blank')}
              disabled={sessions.length === 0}
            >
              Cetak daftar hadir
            </Button>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Peserta" value={totalParticipants} icon={<Users className="h-5 w-5" />} tone="navy" />
        <StatCard label="Sedang mengerjakan" value={inProgress} icon={<Monitor className="h-5 w-5" />} tone="warning" />
        <StatCard label="Selesai" value={finished} icon={<ClipboardList className="h-5 w-5" />} tone="success" />
        <StatCard label="Sesi" value={sessions.length} icon={<CalendarDays className="h-5 w-5" />} tone="info" />
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <Card padded={false}>
            <div className="border-b border-slate-100 px-4 py-3">
              <CardHeader title="Sesi ujian" description="Buka sesi agar token mulai dapat dipakai peserta di ruang tersebut." />
            </div>
            {sessions.length === 0 ? (
              <div className="p-4">
                <EmptyState title="Belum ada sesi" description="Jadwal ini tidak memiliki sesi." />
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                {sessions.map((session) => (
                  <li key={session.id} className="px-4 py-3">
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div>
                        <p className="flex items-center gap-2 text-[13.5px] font-semibold text-navy-900">
                          {session.code} · {session.roomName || 'Ruang'}
                          <Badge tone={session.status === 'open' ? 'success' : session.status === 'closed' ? 'neutral' : 'info'}>
                            {session.status === 'open' ? 'Berlangsung' : session.status === 'closed' ? 'Ditutup' : 'Persiapan'}
                          </Badge>
                        </p>
                        <p className="mt-0.5 text-[12px] text-slate-500">
                          Proktor: {session.proctorName || '—'} · {formatDateTimeId(session.startsAt)} –{' '}
                          {new Date(session.endsAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-600">
                          {session.participantCount} peserta
                        </span>
                        <Link to={`/proktor/sesi/${session.id}`}>
                          <Button size="sm" variant="secondary" icon={<Monitor className="h-3.5 w-3.5" />}>
                            Ruang proktor
                          </Button>
                        </Link>
                        {session.status !== 'open' && session.status !== 'closed' ? (
                          <Button
                            size="sm"
                            variant="success"
                            loading={busyId === session.id}
                            icon={<DoorOpen className="h-3.5 w-3.5" />}
                            onClick={() => setConfirm({ row: session, action: 'open' })}
                          >
                            Buka
                          </Button>
                        ) : null}
                        {session.status === 'open' ? (
                          <Button
                            size="sm"
                            variant="danger"
                            loading={busyId === session.id}
                            icon={<Lock className="h-3.5 w-3.5" />}
                            onClick={() => setConfirm({ row: session, action: 'close' })}
                          >
                            Tutup
                          </Button>
                        ) : null}
                        <Link to={`/cetak/kehadiran/${session.id}`} target="_blank">
                          <Button size="sm" variant="ghost" icon={<Printer className="h-3.5 w-3.5" />}>
                            Daftar hadir
                          </Button>
                        </Link>
                        <Link to={`/cetak/berita-acara/${session.id}`} target="_blank">
                          <Button size="sm" variant="ghost" icon={<FileText className="h-3.5 w-3.5" />}>
                            Berita acara
                          </Button>
                        </Link>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </Card>

          <Card padded={false}>
            <div className="border-b border-slate-100 px-4 py-3">
              <CardHeader title="Daftar peserta" description="Nomor peserta diurutkan sesuai pembagian sesi." />
            </div>
            <DataTable<ExamParticipant>
              columns={[
                { key: 'participantNo', header: 'No.', width: '70px', render: (row) => <span className="font-mono text-[12px]">{row.participantNo}</span> },
                { key: 'fullName', header: 'Nama', render: (row) => <span className="font-medium">{row.fullName}</span> },
                {
                  key: 'sessionId',
                  header: 'Sesi',
                  hideBelow: 'sm',
                  render: (row) => sessions.find((s) => s.id === row.sessionId)?.code ?? '—',
                },
                {
                  key: 'status',
                  header: 'Status',
                  width: '150px',
                  render: (row) => (
                    <Badge
                      tone={
                        row.status === 'finished'
                          ? 'success'
                          : row.status === 'submitted'
                            ? 'info'
                            : row.status === 'in_progress'
                              ? 'warning'
                              : 'neutral'
                      }
                    >
                      {row.status === 'finished'
                        ? 'Selesai'
                        : row.status === 'submitted'
                          ? 'Terkirim'
                          : row.status === 'awaiting_submit'
                            ? 'Menunggu kirim'
                            : row.status === 'in_progress'
                              ? 'Mengerjakan'
                              : 'Terjadwal'}
                    </Badge>
                  ),
                },
              ]}
              rows={participants}
              emptyTitle="Belum ada peserta"
              emptyDescription="Pastikan kelas peserta sudah dipilih saat membuat jadwal."
              compact
            />
          </Card>
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Ringkasan" />
            <div className="mt-2">
              <InfoRow label="Tanggal" value={doc.date} />
              <InfoRow label="Waktu" value={`${doc.startTime}–${doc.endTime}`} />
              <InfoRow label="Durasi" value={`${doc.durationMinutes} menit`} />
              <InfoRow label="Jumlah sesi" value={doc.sessionCount} />
              <InfoRow label="Jumlah peserta" value={doc.participantCount} />
            </div>
          </Card>
          <Card>
            <CardHeader title="Dokumen" description="Dokumen A4 siap cetak dengan kop sekolah." />
            <div className="mt-3 space-y-2">
              {sessions.map((session) => (
                <div key={session.id} className="flex flex-col gap-1.5 rounded-lg border border-slate-200 p-2.5">
                  <p className="text-[12.5px] font-medium text-slate-700">
                    {session.code} · {session.roomName}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    <Link to={`/cetak/kehadiran/${session.id}`} target="_blank">
                      <Button size="sm" variant="secondary" icon={<Printer className="h-3.5 w-3.5" />}>
                        Daftar hadir
                      </Button>
                    </Link>
                    <Link to={`/cetak/berita-acara/${session.id}`} target="_blank">
                      <Button size="sm" variant="secondary" icon={<FileText className="h-3.5 w-3.5" />}>
                        Berita acara
                      </Button>
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm?.action === 'open' ? 'primary' : 'danger'}
        title={confirm?.action === 'open' ? 'Buka sesi ujian?' : 'Tutup sesi ujian?'}
        message={
          confirm?.action === 'open'
            ? 'Setelah dibuka, proktor dapat menerbitkan token mulai untuk peserta di ruang ini. Pastikan pengawas sudah siap.'
            : 'Menutup sesi akan mengakhiri pengerjaan dan menutup akses token. Peserta yang belum mengirim akan difinalisasi sesuai aturan waktu.'
        }
        confirmLabel={confirm?.action === 'open' ? 'Buka sesi' : 'Tutup sesi'}
        loading={Boolean(busyId)}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void control()}
      />
    </div>
  );
}
