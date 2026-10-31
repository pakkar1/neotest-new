import { useCallback, useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  Check,
  ClipboardCopy,
  DoorOpen,
  FileText,
  KeyRound,
  Lock,
  MoveRight,
  Plus,
  Printer,
  RefreshCw,
  ShieldAlert,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, InfoRow } from '../../components/ui/Card';
import { Modal, ConfirmDialog } from '../../components/ui/Modal';
import { Field, Input, Select, Textarea } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Tabs';
import { DataTable } from '../../components/ui/DataTable';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { SessionSummary, ParticipantRow, TokenRow, IncidentRow } from '../../lib/proctorTypes';

interface ParticipantsResponse {
  session: { id: string; code: string };
  participants: ParticipantRow[];
}

const ATTENDANCE_LABEL: Record<string, string> = { present: 'Hadir', absent: 'Tidak hadir', excused: 'Izin' };

export default function ProctorSessionPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const toast = useToast();
  usePageTitle('Kelola Sesi');
  const [tab, setTab] = useState<'participants' | 'tokens' | 'incidents'>('participants');
  const [busy, setBusy] = useState(false);
  const [issuedToken, setIssuedToken] = useState<{ token: string; kind: string; expiresAt: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [ttl, setTtl] = useState(120);
  const [confirm, setConfirm] = useState<'open' | 'close' | null>(null);
  const [incidentOpen, setIncidentOpen] = useState(false);
  const [incident, setIncident] = useState({ type: 'internet', studentId: '', description: '', action: '' });
  const [moveTarget, setMoveTarget] = useState<ParticipantRow | null>(null);
  const [moveTo, setMoveTo] = useState('');
  const [moveReason, setMoveReason] = useState('');

  const summary = useAsync(
    () => apiRequest<SessionSummary>('/api/proctor', { query: { resource: 'sessions', id: sessionId ?? '' } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  const participants = useAsync(
    () => apiRequest<ParticipantsResponse>('/api/proctor', { query: { resource: 'participants', sessionId: sessionId ?? '' } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  const tokens = useAsync(
    () => apiRequest<{ items: TokenRow[]; note: string }>('/api/proctor', { query: { resource: 'tokens', sessionId: sessionId ?? '' } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  const incidents = useAsync(
    () => apiRequest<{ items: IncidentRow[] }>('/api/proctor', { query: { resource: 'incidents', sessionId: sessionId ?? '' } }),
    [sessionId],
    { enabled: Boolean(sessionId) },
  );

  const siblingSessions = useAsync(
    () =>
      apiRequest<{ items: { id: string; code: string; roomName: string; status: string; participantCount: number }[] }>(
        '/api/exams',
        { query: { resource: 'sessions', scheduleId: summary.data?.schedule.id ?? '' } },
      ),
    [summary.data?.schedule.id],
    { enabled: Boolean(summary.data?.schedule.id) },
  );

  const reloadAll = useCallback(() => {
    void summary.reload();
    void participants.reload();
    void tokens.reload();
    void incidents.reload();
  }, [summary, participants, tokens, incidents]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') {
        void participants.reload();
        void summary.reload();
      }
    }, 20_000);
    return () => clearInterval(interval);
  }, [participants, summary]);

  const control = async () => {
    if (!confirm) return;
    setBusy(true);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'session-control', action: confirm },
        body: { sessionId },
      });
      toast.success(confirm === 'open' ? 'Sesi dibuka.' : 'Sesi ditutup.');
      setConfirm(null);
      reloadAll();
    } catch (err) {
      toast.error('Gagal', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const issueToken = async (kind: 'start' | 'submit') => {
    setBusy(true);
    try {
      const res = await apiRequest<{ token: string; tokenId: string; kind: string; expiresAt: string }>('/api/proctor', {
        method: 'POST',
        query: { resource: 'tokens', action: 'issue' },
        body: { kind, sessionId, ttlMinutes: ttl },
      });
      setIssuedToken({ token: res.token, kind: res.kind, expiresAt: res.expiresAt });
      setCopied(false);
      void tokens.reload();
      void summary.reload();
    } catch (err) {
      toast.error('Gagal menerbitkan token', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (token: TokenRow) => {
    setBusy(true);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'tokens', action: 'revoke' },
        body: { tokenId: token.id },
      });
      toast.success('Token dicabut.');
      void tokens.reload();
      void summary.reload();
    } catch (err) {
      toast.error('Gagal mencabut token', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const setAttendance = async (row: ParticipantRow, value: string) => {
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'attendance' },
        body: { participantId: row.id, attendance: value },
      });
      toast.success(`Kehadiran ${row.fullName}: ${ATTENDANCE_LABEL[value]}`);
      void participants.reload();
      void summary.reload();
    } catch (err) {
      toast.error('Gagal menyimpan kehadiran', err instanceof ApiClientError ? err.message : undefined);
    }
  };

  const saveIncident = async () => {
    if (incident.description.trim().length < 3) {
      toast.warning('Deskripsi insiden minimal 3 karakter.');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'incidents' },
        body: {
          sessionId,
          studentId: incident.studentId || null,
          type: incident.type,
          description: incident.description,
          action: incident.action,
        },
      });
      toast.success('Insiden dicatat.');
      setIncidentOpen(false);
      setIncident({ type: 'internet', studentId: '', description: '', action: '' });
      void incidents.reload();
    } catch (err) {
      toast.error('Gagal mencatat insiden', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const moveParticipant = async () => {
    if (!moveTarget || !moveTo) return;
    if (moveReason.trim().length < 3) {
      toast.warning('Alasan pemindahan wajib diisi (min. 3 karakter).');
      return;
    }
    setBusy(true);
    try {
      await apiRequest('/api/proctor', {
        method: 'POST',
        query: { resource: 'move' },
        body: { participantId: moveTarget.id, targetSessionId: moveTo, reason: moveReason },
      });
      toast.success('Peserta dipindahkan. Perubahan tercatat di audit log.');
      setMoveTarget(null);
      setMoveTo('');
      setMoveReason('');
      void participants.reload();
    } catch (err) {
      toast.error('Gagal memindahkan peserta', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const copyToken = async () => {
    if (!issuedToken) return;
    try {
      await navigator.clipboard.writeText(issuedToken.token);
      setCopied(true);
      toast.success('Token disalin ke papan klip.');
    } catch {
      toast.warning('Browser memblokir papan klip. Salin token secara manual.');
    }
  };

  if (summary.loading && !summary.data) return <LoadingState label="Memuat sesi…" />;
  if (summary.error || !summary.data) {
    return <ErrorState message={summary.error ?? 'Sesi tidak ditemukan.'} onRetry={() => void summary.reload()} />;
  }

  const data = summary.data;
  const canOperate = data.session.status !== 'closed';

  return (
    <div>
      <PageHeader
        title={
          <span className="flex flex-wrap items-center gap-2">
            {data.room.name} · Sesi {data.session.code}
            <Badge tone={data.session.status === 'open' ? 'success' : data.session.status === 'closed' ? 'neutral' : 'info'}>
              {data.session.status === 'open' ? 'Berlangsung' : data.session.status === 'closed' ? 'Ditutup' : 'Persiapan'}
            </Badge>
          </span>
        }
        description={`${data.schedule.title} · ${data.subjectName} · ${formatDateTimeId(data.session.startsAt)}`}
        breadcrumb={[{ label: 'Beranda', to: '/proktor' }, { label: 'Sesi', to: '/proktor/sesi' }, { label: data.room.name }]}
        actions={
          <>
            <Link to="/proktor/sesi">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Kembali
              </Button>
            </Link>
            <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${summary.loading ? 'animate-spin' : ''}`} />} onClick={reloadAll}>
              Muat ulang
            </Button>
            {data.session.status === 'preparation' ? (
              <Button variant="success" icon={<DoorOpen className="h-4 w-4" />} onClick={() => setConfirm('open')}>
                Buka sesi
              </Button>
            ) : null}
            {data.session.status === 'open' ? (
              <Button variant="danger" icon={<Lock className="h-4 w-4" />} onClick={() => setConfirm('close')}>
                Tutup sesi
              </Button>
            ) : null}
            <Link to={`/cetak/kehadiran/${data.session.id}`} target="_blank">
              <Button variant="secondary" icon={<Printer className="h-4 w-4" />}>
                Daftar hadir
              </Button>
            </Link>
            <Link to={`/cetak/berita-acara/${data.session.id}`} target="_blank">
              <Button variant="secondary" icon={<FileText className="h-4 w-4" />}>
                Berita acara
              </Button>
            </Link>
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-7">
        {[
          { label: 'Peserta', value: data.counts.total, tone: 'text-navy-900' },
          { label: 'Terjadwal', value: data.counts.scheduled, tone: 'text-slate-700' },
          { label: 'Mengerjakan', value: data.counts.inProgress + data.counts.awaitingSubmit, tone: 'text-amber-700' },
          { label: 'Terkirim', value: data.counts.submitted, tone: 'text-brand-700' },
          { label: 'Selesai', value: data.counts.finished, tone: 'text-green-700' },
          { label: 'Tidak hadir', value: data.counts.absent, tone: 'text-red-700' },
          { label: 'Sesi', value: data.session.code, tone: 'text-navy-900' },
        ].map((item) => (
          <div key={item.label} className="rounded-xl border border-slate-200 bg-white px-3 py-2 shadow-card">
            <p className="text-[10.5px] uppercase tracking-wide text-slate-500">{item.label}</p>
            <p className={`text-lg font-bold ${item.tone}`}>{item.value}</p>
          </div>
        ))}
      </div>

      <Tabs
        items={[
          { key: 'participants', label: 'Peserta', count: data.counts.total },
          { key: 'tokens', label: 'Token', count: tokens.data?.items.length },
          { key: 'incidents', label: 'Insiden', count: incidents.data?.items.length },
        ]}
        active={tab}
        onChange={(key) => setTab(key as typeof tab)}
      />

      <div className="mt-3">
        {tab === 'participants' ? (
          <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_300px]">
            <Card padded={false}>
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <CardHeader title="Daftar peserta" description="Kehadiran dapat diubah sebelum/selama sesi. Status diperbarui otomatis setiap 20 detik." />
                <button
                  type="button"
                  className="text-[12px] font-medium text-brand-700 hover:underline"
                  onClick={() => void participants.reload()}
                >
                  Segarkan
                </button>
              </div>
              <DataTable<ParticipantRow>
                columns={[
                  { key: 'participantNo', header: 'No.', width: '64px', render: (row) => <span className="font-mono text-[11.5px]">{row.participantNo}</span> },
                  {
                    key: 'fullName',
                    header: 'Nama',
                    render: (row) => (
                      <div>
                        <p className="font-medium text-slate-800">{row.fullName}</p>
                        <p className="text-[11px] text-slate-500">{row.className}</p>
                      </div>
                    ),
                  },
                  {
                    key: 'status',
                    header: 'Status',
                    width: '140px',
                    render: (row) => (
                      <Badge
                        tone={
                          row.status === 'finished'
                            ? 'success'
                            : row.status === 'submitted'
                              ? 'info'
                              : row.status === 'in_progress' || row.status === 'awaiting_submit'
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
                  {
                    key: 'attendance',
                    header: 'Kehadiran',
                    width: '130px',
                    render: (row) => (
                      <Select
                        aria-label={`Kehadiran ${row.fullName}`}
                        className="!py-1 text-[12px]"
                        value={row.attendance}
                        disabled={!canOperate}
                        onChange={(e) => void setAttendance(row, e.target.value)}
                      >
                        <option value="present">Hadir</option>
                        <option value="excused">Izin</option>
                        <option value="absent">Tidak hadir</option>
                      </Select>
                    ),
                  },
                  {
                    key: 'lastSavedAt',
                    header: 'Simpan terakhir',
                    hideBelow: 'lg',
                    render: (row) => (row.lastSavedAt ? new Date(row.lastSavedAt).toLocaleTimeString('id-ID') : '—'),
                  },
                  {
                    key: 'actions',
                    header: 'Aksi',
                    align: 'right',
                    width: '60px',
                    render: (row) => (
                      <IconButton
                        label="Pindahkan peserta"
                        variant="secondary"
                        icon={<MoveRight className="h-3.5 w-3.5" />}
                        onClick={() => {
                          setMoveTarget(row);
                          setMoveTo('');
                          setMoveReason('');
                        }}
                      />
                    ),
                  },
                ]}
                rows={participants.data?.participants ?? []}
                loading={participants.loading}
                error={participants.error}
                onRetry={() => void participants.reload()}
                emptyTitle="Belum ada peserta di sesi ini"
                emptyDescription="Periksa pembagian peserta pada jadwal."
                compact
              />
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader title="Informasi sesi" />
                <div className="mt-2">
                  <InfoRow label="Ruang" value={data.room.name} />
                  <InfoRow label="Proktor" value={data.proctor.fullName} />
                  <InfoRow label="Mulai" value={formatDateTimeId(data.session.startsAt)} />
                  <InfoRow label="Berakhir" value={formatDateTimeId(data.session.endsAt)} />
                  <InfoRow label="Paket" value={data.schedule.title} />
                </div>
              </Card>
              <Card>
                <CardHeader title="Catat insiden" description="Listrik, jaringan, perangkat, atau indikasi kecurangan." />
                <Button className="mt-3" block variant="secondary" icon={<AlertTriangle className="h-4 w-4" />} onClick={() => setIncidentOpen(true)}>
                  Tambah insiden
                </Button>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'tokens' ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
            <Card padded={false}>
              <div className="border-b border-slate-100 px-4 py-3">
                <CardHeader title="Riwayat token" description="Token asli tidak disimpan; hanya hash, masa berlaku, dan jumlah pemakaian." />
              </div>
              <DataTable<TokenRow>
                columns={[
                  { key: 'kind', header: 'Jenis', width: '90px', render: (row) => <Badge tone={row.kind === 'start' ? 'info' : 'navy'}>{row.kind === 'start' ? 'Mulai' : 'Kirim'}</Badge> },
                  { key: 'issuedAt', header: 'Diterbitkan', render: (row) => formatDateTimeId(row.issuedAt) },
                  { key: 'expiresAt', header: 'Berlaku s/d', hideBelow: 'sm', render: (row) => formatDateTimeId(row.expiresAt) },
                  { key: 'uses', header: 'Dipakai', align: 'center', width: '80px', render: (row) => row.uses },
                  {
                    key: 'status',
                    header: 'Status',
                    width: '110px',
                    render: (row) => (
                      <Badge tone={row.status === 'active' ? 'success' : row.status === 'revoked' ? 'danger' : 'neutral'}>
                        {row.status === 'active' ? 'Aktif' : row.status === 'revoked' ? 'Dicabut' : 'Kedaluwarsa'}
                      </Badge>
                    ),
                  },
                  {
                    key: 'actions',
                    header: '',
                    align: 'right',
                    width: '80px',
                    render: (row) =>
                      row.status === 'active' ? (
                        <Button size="sm" variant="ghost" onClick={() => void revoke(row)}>
                          Cabut
                        </Button>
                      ) : null,
                  },
                ]}
                rows={tokens.data?.items ?? []}
                loading={tokens.loading}
                emptyTitle="Belum ada token"
                emptyDescription="Terbitkan token mulai setelah sesi dibuka dan seluruh peserta siap."
              />
            </Card>
            <div className="space-y-3">
              <Card>
                <CardHeader title="Terbitkan token" description="Token lama dengan jenis sama otomatis dicabut." />
                <div className="mt-3 space-y-2">
                  <Field label="Masa berlaku (menit)">
                    <Input type="number" min={1} max={240} value={ttl} onChange={(e) => setTtl(Number(e.target.value))} />
                  </Field>
                  <Button
                    block
                    loading={busy}
                    disabled={data.session.status !== 'open'}
                    icon={<KeyRound className="h-4 w-4" />}
                    onClick={() => void issueToken('start')}
                  >
                    Terbitkan token mulai
                  </Button>
                  <Button
                    block
                    variant="navy"
                    loading={busy}
                    disabled={data.session.status !== 'open'}
                    icon={<KeyRound className="h-4 w-4" />}
                    onClick={() => void issueToken('submit')}
                  >
                    Terbitkan token kirim
                  </Button>
                  {data.session.status !== 'open' ? (
                    <p className="text-[11.5px] text-amber-700">Buka sesi terlebih dahulu untuk menerbitkan token.</p>
                  ) : null}
                </div>
              </Card>
              <Card>
                <CardHeader title="Aturan token" />
                <ul className="mt-2 space-y-1 text-[11.5px] leading-relaxed text-slate-500">
                  <li>• Token di-hash dengan pepper server; tidak dapat dibaca ulang.</li>
                  <li>• Berlaku hanya untuk sesi & ruang ini, dan dapat dicabut seketika.</li>
                  <li>• Percobaan berulang dibatasi (rate limit) dan diaudit.</li>
                  <li>• Token kirim dipakai minimal setelah batas waktu pengerjaan.</li>
                </ul>
              </Card>
            </div>
          </div>
        ) : null}

        {tab === 'incidents' ? (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-[1fr_320px]">
            <Card padded={false}>
              <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                <CardHeader title="Insiden sesi" description="Catatan kejadian selama ujian berlangsung." />
                <Button size="sm" variant="secondary" icon={<Plus className="h-3.5 w-3.5" />} onClick={() => setIncidentOpen(true)}>
                  Catat
                </Button>
              </div>
              {incidents.data?.items.length === 0 ? (
                <div className="p-2">
                  <EmptyState title="Belum ada insiden" description="Catat gangguan atau kejadian penting untuk berita acara." icon={<ShieldAlert className="h-6 w-6" />} />
                </div>
              ) : (
                <ul className="divide-y divide-slate-100">
                  {(incidents.data?.items ?? []).map((row) => {
                    const student = participants.data?.participants.find((p) => p.id === row.studentId);
                    return (
                      <li key={row.id} className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <Badge tone={row.type === 'kecurangan' ? 'danger' : 'warning'}>{row.type}</Badge>
                          <span className="text-[11.5px] text-slate-500">{formatDateTimeId(row.createdAt)}</span>
                          {student ? <span className="text-[11.5px] font-medium text-slate-700">{student.fullName}</span> : null}
                        </div>
                        <p className="mt-1 text-[13px] text-slate-800">{row.description}</p>
                        {row.action ? <p className="mt-0.5 text-[12px] text-slate-500">Tindakan: {row.action}</p> : null}
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title="Panduan singkat" />
              <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-500">
                <li>1. Catat waktu, peserta (jika ada), dan kronologi singkat.</li>
                <li>2. Tuliskan tindakan yang dilakukan pengawas.</li>
                <li>3. Insiden otomatis muncul pada berita acara sesi.</li>
                <li>4. Gunakan jenis “kecurangan” hanya bila ada indikasi kuat.</li>
              </ul>
            </Card>
          </div>
        ) : null}
      </div>

      <ConfirmDialog
        open={Boolean(confirm)}
        tone={confirm === 'open' ? 'primary' : 'danger'}
        title={confirm === 'open' ? 'Buka sesi?' : 'Tutup sesi?'}
        message={
          confirm === 'open'
            ? 'Setelah dibuka, token mulai dapat diterbitkan dan peserta dapat masuk setelah memasukkan token.'
            : 'Menutup sesi menghentikan akses token dan memfinalisasi peserta yang masih mengerjakan.'
        }
        confirmLabel={confirm === 'open' ? 'Buka sesi' : 'Tutup sesi'}
        loading={busy}
        onCancel={() => setConfirm(null)}
        onConfirm={() => void control()}
      />

      <Modal
        open={Boolean(issuedToken)}
        onClose={() => setIssuedToken(null)}
        size="sm"
        title="Token diterbitkan"
        description="Salin dan sampaikan token hanya kepada peserta di ruang ini. Token tidak dapat ditampilkan lagi."
        footer={
          <Button onClick={() => setIssuedToken(null)}>Selesai</Button>
        }
      >
        {issuedToken ? (
          <div className="text-center">
            <p className="text-[12px] uppercase tracking-wide text-slate-500">
              Token {issuedToken.kind === 'start' ? 'mulai' : 'kirim'}
            </p>
            <p className="mt-2 select-all rounded-xl border-2 border-dashed border-brand-300 bg-brand-50 px-4 py-4 font-mono text-3xl font-bold tracking-[0.2em] text-brand-900">
              {issuedToken.token}
            </p>
            <p className="mt-2 text-[12px] text-slate-500">Berlaku sampai {formatDateTimeId(issuedToken.expiresAt)}</p>
            <Button className="mt-3" variant="secondary" icon={copied ? <Check className="h-4 w-4" /> : <ClipboardCopy className="h-4 w-4" />} onClick={() => void copyToken()}>
              {copied ? 'Tersalin' : 'Salin token'}
            </Button>
            <div className="mt-4 flex items-start gap-1.5 rounded-lg bg-amber-50 p-2 text-left text-[11.5px] text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
              Hanya hash token yang disimpan. Jika token hilang, cabut dan terbitkan token baru.
            </div>
          </div>
        ) : null}
      </Modal>

      <Modal
        open={incidentOpen}
        onClose={() => setIncidentOpen(false)}
        title="Catat insiden"
        description="Insiden akan tercatat pada berita acara dan audit log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setIncidentOpen(false)}>
              Batal
            </Button>
            <Button loading={busy} onClick={() => void saveIncident()}>
              Simpan insiden
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Jenis" required>
              <Select value={incident.type} onChange={(e) => setIncident({ ...incident, type: e.target.value })}>
                <option value="internet">Gangguan internet</option>
                <option value="listrik">Gangguan listrik</option>
                <option value="perangkat">Masalah perangkat</option>
                <option value="kecurangan">Indikasi kecurangan</option>
                <option value="lainnya">Lainnya</option>
              </Select>
            </Field>
            <Field label="Peserta (opsional)">
              <Select value={incident.studentId} onChange={(e) => setIncident({ ...incident, studentId: e.target.value })}>
                <option value="">Tidak terkait peserta</option>
                {(participants.data?.participants ?? []).map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.participantNo} · {p.fullName}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Field label="Deskripsi kejadian" required>
            <Textarea rows={3} value={incident.description} onChange={(e) => setIncident({ ...incident, description: e.target.value })} placeholder="Contoh: Koneksi internet ruang 01 terputus pukul 08:15 selama 4 menit." />
          </Field>
          <Field label="Tindakan yang dilakukan" hint="Tindakan pengawas, misalnya memindahkan peserta atau memberi waktu tambahan.">
            <Textarea rows={2} value={incident.action} onChange={(e) => setIncident({ ...incident, action: e.target.value })} />
          </Field>
        </div>
      </Modal>

      <Modal
        open={Boolean(moveTarget)}
        onClose={() => setMoveTarget(null)}
        size="sm"
        title="Pindahkan peserta"
        description="Pemindahan hanya berlaku sebelum peserta mulai mengerjakan dan akan tercatat di audit log."
        footer={
          <>
            <Button variant="secondary" onClick={() => setMoveTarget(null)}>
              Batal
            </Button>
            <Button loading={busy} onClick={() => void moveParticipant()}>
              Pindahkan
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="rounded-lg bg-slate-50 p-2 text-[12.5px] text-slate-600">
            {moveTarget?.participantNo} · {moveTarget?.fullName} ({moveTarget?.className})
          </p>
          <Field label="Sesi tujuan" required>
            <Select value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Pilih sesi…</option>
              {(siblingSessions.data?.items ?? [])
                .filter((s) => s.id !== sessionId)
                .map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.code} · {s.roomName} ({s.participantCount} peserta)
                  </option>
                ))}
            </Select>
          </Field>
          <Field label="Alasan" required>
            <Textarea rows={2} value={moveReason} onChange={(e) => setMoveReason(e.target.value)} placeholder="Contoh: perangkat rusak, peserta dipindah ke ruang cadangan." />
          </Field>
        </div>
      </Modal>
    </div>
  );
}
