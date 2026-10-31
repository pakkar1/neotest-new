import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Clock,
  DoorOpen,
  FileBarChart,
  GraduationCap,
  KeyRound,
  Play,
  RefreshCw,
  ShieldCheck,
  Timer,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader } from '../../components/ui/Card';
import { Tabs } from '../../components/ui/Tabs';
import { Modal } from '../../components/ui/Modal';
import { Input, Field } from '../../components/ui/Field';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { useAuth } from '../../services/auth';
import { formatDateTimeId } from '../../shared/time';
import type { AttemptView, StudentExamCard } from '../../shared/types';

function statusOf(card: StudentExamCard): 'available' | 'ongoing' | 'scheduled' | 'done' {
  if (card.attempt) {
    return card.attempt.status === 'in_progress' ? 'ongoing' : 'done';
  }
  if (card.session.status === 'open') return 'available';
  return 'scheduled';
}

export default function StudentHomePage() {
  usePageTitle('Ujian Saya');
  const { user, config } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState<'available' | 'scheduled' | 'done'>('available');
  const [startTarget, setStartTarget] = useState<StudentExamCard | null>(null);
  const [token, setToken] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const exams = useAsync(() => apiRequest<{ items: StudentExamCard[] }>('/api/attempts', { query: { action: 'exams' } }), []);
  const current = useAsync(
    () => apiRequest<{ view: AttemptView | null; autoClosed: boolean; message?: string }>('/api/attempts', { query: { action: 'current' } }),
    [],
  );

  const groups = useMemo(() => {
    const items = exams.data?.items ?? [];
    return {
      available: items.filter((c) => statusOf(c) === 'available' || statusOf(c) === 'ongoing'),
      scheduled: items.filter((c) => statusOf(c) === 'scheduled'),
      done: items.filter((c) => statusOf(c) === 'done'),
    };
  }, [exams.data]);

  const active = current.data?.view ?? null;

  const start = async () => {
    if (!startTarget) return;
    if (!token.trim()) {
      setError('Masukkan token mulai yang diberikan proktor.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const view = await apiRequest<AttemptView>('/api/attempts', {
        method: 'POST',
        query: { action: 'start' },
        body: { scheduleId: startTarget.schedule.id, sessionId: startTarget.session.id, token: token.trim().toUpperCase() },
      });
      navigate(`/siswa/ujian/${view.attempt.id}`);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Tidak dapat memulai ujian.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title={`Halo, ${user?.displayName?.split(' ')[0] ?? 'Siswa'}`}
        description="Periksa jadwal ujian, mulai ujian dengan token dari proktor, dan lihat hasil yang sudah dipublikasikan."
        breadcrumb={[{ label: 'Beranda' }]}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${exams.loading ? 'animate-spin' : ''}`} />} onClick={() => void exams.reload()}>
            Muat ulang
          </Button>
        }
        badge={<Badge tone="info">{user?.participantNo ? `No. ${user.participantNo}` : 'Peserta'}</Badge>}
      />

      {config?.demo ? (
        <div className="mb-4 rounded-xl border border-orange-200 bg-orange-50 px-4 py-2.5 text-[12.5px] text-orange-900">
          <strong>Mode DEMO.</strong> Data ujian di bawah adalah contoh. Token mulai pada demo hanya dapat diperoleh dari
          dashboard proktor.
        </div>
      ) : null}

      {active ? (
        <Card className="mb-4 border-brand-300 bg-brand-50/60">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="flex items-center gap-1.5 text-[13px] font-semibold text-brand-900">
                <Play className="h-4 w-4" /> Ada ujian yang sedang Anda kerjakan
              </p>
              <p className="mt-0.5 text-[12.5px] text-brand-800">
                {active.schedule.title} · {active.session.roomName} · sisa waktu{' '}
                {Math.max(0, Math.round(active.remainingMs / 60000))} menit
              </p>
            </div>
            <Link to={`/siswa/ujian/${active.attempt.id}`}>
              <Button icon={<ArrowRight className="h-4 w-4" />}>Lanjutkan ujian</Button>
            </Link>
          </div>
        </Card>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Card className="border-l-4 border-l-brand-600">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Aturan penting</p>
          <ul className="mt-1.5 space-y-1 text-[12px] leading-relaxed text-slate-600">
            <li>• Timer memakai jam server, bukan jam perangkat Anda.</li>
            <li>• Jawaban tersimpan otomatis; tetap periksa indikator simpan.</li>
            <li>• Ujian hanya dapat dikirim setelah batas waktu minimal.</li>
          </ul>
        </Card>
        <Card className="border-l-4 border-l-amber-500">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Token</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
            Minta token <strong>mulai</strong> kepada proktor ruang sebelum mulai. Token <strong>kirim</strong> diminta
            saat mengirim jawaban. Token tidak boleh dibagikan.
          </p>
        </Card>
        <Card className="border-l-4 border-l-green-600">
          <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Hasil</p>
          <p className="mt-1.5 text-[12px] leading-relaxed text-slate-600">
            Nilai hanya tampil setelah dipublikasikan guru/admin sesuai pengaturan jenis ujian.
          </p>
          <Link to="/siswa/hasil" className="mt-1 inline-flex items-center gap-1 text-[12px] font-medium text-brand-700 hover:underline">
            Lihat hasil <ArrowRight className="h-3 w-3" />
          </Link>
        </Card>
      </div>

      <Tabs
        className="mt-5"
        items={[
          { key: 'available', label: 'Siap dikerjakan', count: groups.available.length },
          { key: 'scheduled', label: 'Terjadwal', count: groups.scheduled.length },
          { key: 'done', label: 'Selesai', count: groups.done.length },
        ]}
        active={tab}
        onChange={(key) => setTab(key as typeof tab)}
      />

      <div className="mt-3">
        {exams.loading && !exams.data ? <LoadingState label="Memuat daftar ujian…" /> : null}
        {exams.error ? <ErrorState message={exams.error} onRetry={() => void exams.reload()} /> : null}

        {exams.data && groups[tab].length === 0 ? (
          <EmptyState
            title={tab === 'available' ? 'Belum ada ujian yang bisa dikerjakan' : tab === 'scheduled' ? 'Belum ada jadwal ujian' : 'Belum ada ujian selesai'}
            description={
              tab === 'available'
                ? 'Ujian muncul saat sesi dibuka proktor dan Anda terdaftar sebagai peserta.'
                : tab === 'scheduled'
                  ? 'Jadwal ujian ditentukan sekolah.'
                  : 'Ujian yang sudah dikirim akan tercatat di sini.'
            }
            icon={<CalendarClock className="h-6 w-6" />}
          />
        ) : null}

        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {(groups[tab] ?? []).map((card) => {
            const state = statusOf(card);
            const date = new Date(`${card.schedule.date}T${card.schedule.startTime}:00+07:00`);
            return (
              <Card key={card.participant.id} className="flex flex-col gap-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[14px] font-semibold text-navy-900">{card.schedule.title}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                      <GraduationCap className="h-3.5 w-3.5" />
                      {card.subjectName} · {card.examType.name}
                    </p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-1.5 text-[12px] text-slate-500">
                      <CalendarClock className="h-3.5 w-3.5" />
                      {date.toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' })} ·{' '}
                      {card.schedule.startTime}–{card.schedule.endTime}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">
                      {card.session.roomName} · {card.session.proctorName} · durasi {card.schedule.durationMinutes} menit
                    </p>
                  </div>
                  <Badge
                    tone={state === 'ongoing' ? 'warning' : state === 'available' ? 'success' : state === 'done' ? 'neutral' : 'info'}
                  >
                    {state === 'ongoing'
                      ? 'Sedang dikerjakan'
                      : state === 'available'
                        ? 'Siap'
                        : state === 'done'
                          ? 'Selesai'
                          : 'Terjadwal'}
                  </Badge>
                </div>

                <div className="flex items-center gap-2 text-[11.5px] text-slate-500">
                  <Timer className="h-3.5 w-3.5" />
                  Minimal dikerjakan {card.examType.minSubmitMinutes} menit sebelum boleh kirim
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  {state === 'available' ? (
                    <Button icon={<KeyRound className="h-4 w-4" />} onClick={() => { setStartTarget(card); setToken(''); setError(null); }}>
                      Mulai dengan token
                    </Button>
                  ) : null}
                  {state === 'ongoing' && card.attempt ? (
                    <Link to={`/siswa/ujian/${card.attempt.id}`}>
                      <Button icon={<Play className="h-4 w-4" />}>Lanjutkan</Button>
                    </Link>
                  ) : null}
                  {state === 'done' ? (
                    card.resultPublished ? (
                      <Link to={`/siswa/hasil/${card.attempt?.id ?? ''}`}>
                        <Button variant="secondary" icon={<FileBarChart className="h-4 w-4" />}>
                          Lihat hasil
                        </Button>
                      </Link>
                    ) : (
                      <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-500">
                        <Clock className="h-3.5 w-3.5" /> Menunggu publikasi hasil
                      </span>
                    )
                  ) : null}
                  {state === 'scheduled' ? (
                    <span className="flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1.5 text-[12px] text-slate-500">
                      <DoorOpen className="h-3.5 w-3.5" /> Sesi dibuka oleh proktor pada{' '}
                      {formatDateTimeId(card.session.startsAt)}
                    </span>
                  ) : null}
                </div>
              </Card>
            );
          })}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title="Tata tertib singkat"
          description="Dengan mengerjakan ujian, Anda menyetujui aturan sekolah."
          actions={<ShieldCheck className="h-5 w-5 text-brand-700" />}
        />
        <ul className="mt-2 grid gap-1.5 text-[12px] text-slate-600 sm:grid-cols-2">
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600" /> Kerjakan sendiri; tidak membuka tab atau aplikasi lain.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600" /> Periksa indikator simpan sebelum berpindah soal.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600" /> Laporkan gangguan perangkat kepada proktor.</li>
          <li className="flex items-start gap-1.5"><CheckCircle2 className="mt-0.5 h-3.5 w-3.5 text-green-600" /> Ujian dapat difinalisasi otomatis saat waktu habis.</li>
        </ul>
      </Card>

      <Modal
        open={Boolean(startTarget)}
        onClose={() => setStartTarget(null)}
        size="sm"
        title="Masukkan token mulai"
        description={startTarget ? `${startTarget.schedule.title} · ${startTarget.session.roomName}` : undefined}
        footer={
          <>
            <Button variant="secondary" onClick={() => setStartTarget(null)} disabled={busy}>
              Batal
            </Button>
            <Button loading={busy} onClick={() => void start()} icon={<Play className="h-4 w-4" />}>
              Mulai ujian
            </Button>
          </>
        }
      >
        <div className="space-y-3">
          <Field label="Token mulai" required hint="Format token: XXXX-XXXX. Minta kepada proktor ruang Anda.">
            <Input
              value={token}
              onChange={(e) => setToken(e.target.value.toUpperCase())}
              placeholder="XXXX-XXXX"
              autoFocus
              className="text-center font-mono text-xl tracking-[0.25em]"
              maxLength={12}
            />
          </Field>
          {error ? <p className="rounded-lg bg-red-50 p-2 text-[12.5px] text-red-800">{error}</p> : null}
          <div className="rounded-lg bg-amber-50 p-2 text-[11.5px] leading-relaxed text-amber-900">
            Setelah dimulai, waktu berjalan dan tidak dapat dijeda. Pastikan perangkat dan koneksi siap sebelum menekan
            tombol mulai.
          </div>
        </div>
      </Modal>
    </div>
  );
}
