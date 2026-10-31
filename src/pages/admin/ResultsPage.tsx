import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  BarChart3,
  CheckCircle2,
  Download,
  Info,
  RefreshCw,
  Send,
  Sigma,
  Users,
  AlertTriangle,
} from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { Select } from '../../components/ui/Field';
import { Tabs } from '../../components/ui/Tabs';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { ConfirmDialog } from '../../components/ui/Modal';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError, downloadCsv } from '../../services/api';

interface ScheduleOption {
  id: string;
  title: string;
  date: string;
  status: string;
  subjectName: string;
  examTypeName: string;
  participantCount: number;
}

interface ResultRow {
  studentId: string;
  participantNo: string;
  fullName: string;
  className: string;
  sessionCode: string;
  score: number;
  maxScore: number;
  percent: number;
  status: string;
  submittedAt: string | null;
  durationSec: number;
  correctCount: number;
  wrongCount: number;
  blankCount: number;
  attendance: string;
}

interface GroupStat {
  key: string;
  label: string;
  count: number;
  mean: number;
  median: number;
  min: number;
  max: number;
  passRate: number | null;
}

interface ResultsReport {
  schedule: {
    id: string;
    title: string;
    date: string;
    subjectName: string;
    examTypeName: string;
    passingScore: number;
    resultPublish: string;
    totalPoints: number;
  };
  summary: {
    scheduled: number;
    started: number;
    completed: number;
    absent: number;
    mean: number;
    median: number;
    min: number;
    max: number;
    stdDev: number;
    p25: number;
    p75: number;
    passRate: number | null;
    averageDurationMinutes: number;
    pendingGrading: number;
    answeredAverage: number;
    blankAverage: number;
  };
  distribution: { label: string; count: number }[];
  byClass: GroupStat[];
  bySession: GroupStat[];
  rows: ResultRow[];
  generatedAt: string;
}

interface ItemRow {
  questionId: string;
  order: number;
  type: string;
  preview: string;
  points: number;
  answered: number;
  blank: number;
  correct: number;
  difficulty: number;
  interpretation: string;
  discrimination: number | null;
  discriminationLabel: string;
  recommendation: string;
  note?: string;
  optionTexts: { id: string; text: string; count: number; percent: number }[];
}

interface ItemAnalysis {
  respondents: number;
  reliability: { alpha: number | null; note: string; method: string };
  distribution: { label: string; count: number }[];
  rows: ItemRow[];
  caveats: string[];
}

function Bar({ label, value, max, tone = 'bg-brand-600' }: { label: string; value: number; max: number; tone?: string }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div className="flex items-center gap-2">
      <span className="w-16 shrink-0 text-right text-[11.5px] text-slate-500">{label}</span>
      <div className="h-4 flex-1 overflow-hidden rounded bg-slate-100">
        <div className={`h-full rounded ${tone}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="w-10 shrink-0 text-right text-[11.5px] font-medium text-slate-700">{value}</span>
    </div>
  );
}

export default function ResultsPage() {
  usePageTitle('Analisis Hasil');
  const toast = useToast();
  const [searchParams, setSearchParams] = useSearchParams();
  const [tab, setTab] = useState<'summary' | 'items' | 'rows'>('summary');
  const [page, setPage] = useState(1);
  const [publishOpen, setPublishOpen] = useState(false);
  const [publishing, setPublishing] = useState(false);

  const schedules = useAsync(
    () => apiRequest<{ items: ScheduleOption[] }>('/api/reports', { query: { resource: 'schedules' } }),
    [],
  );
  const scheduleId = searchParams.get('scheduleId') ?? schedules.data?.items[0]?.id ?? '';

  useEffect(() => {
    if (schedules.data && !searchParams.get('scheduleId') && schedules.data.items[0]) {
      setSearchParams({ scheduleId: schedules.data.items[0].id }, { replace: true });
    }
  }, [schedules.data, searchParams, setSearchParams]);

  const report = useAsync(
    () => apiRequest<ResultsReport>('/api/reports', { query: { resource: 'results', scheduleId } }),
    [scheduleId],
    { enabled: Boolean(scheduleId) },
  );
  const items = useAsync(
    () => apiRequest<ItemAnalysis>('/api/reports', { query: { resource: 'item-analysis', scheduleId } }),
    [scheduleId],
    { enabled: Boolean(scheduleId) && tab === 'items' },
  );

  const rows = report.data?.rows ?? [];
  const rowsPerPage = 20;
  const pagedRows = useMemo(
    () => rows.slice((page - 1) * rowsPerPage, page * rowsPerPage),
    [rows, page],
  );

  useEffect(() => setPage(1), [scheduleId]);

  const publish = async () => {
    setPublishing(true);
    try {
      await apiRequest('/api/results', { method: 'POST', query: { resource: 'publish' }, body: { scheduleId } });
      toast.success('Hasil ujian dipublikasikan ke peserta.');
      setPublishOpen(false);
      await report.reload();
    } catch (err) {
      toast.error('Gagal mempublikasikan', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setPublishing(false);
    }
  };

  const maxDistribution = Math.max(0, ...(report.data?.distribution.map((d) => d.count) ?? []));
  const maxClass = Math.max(1, ...(report.data?.byClass.map((g) => g.mean) ?? []));

  return (
    <div>
      <PageHeader
        title="Analisis Hasil"
        description="Statistik nilai, distribusi, perbandingan kelas/sesi, dan analisis butir soal dari data ujian yang benar-benar dikerjakan peserta."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Analisis Hasil' }]}
        actions={
          <>
            <Button
              variant="secondary"
              icon={<RefreshCw className={`h-4 w-4 ${report.loading ? 'animate-spin' : ''}`} />}
              onClick={() => {
                void report.reload();
                void items.reload();
              }}
            >
              Muat ulang
            </Button>
            <Button
              variant="secondary"
              icon={<Download className="h-4 w-4" />}
              disabled={!scheduleId}
              onClick={() =>
                void downloadCsv('/api/reports', { resource: 'export-results', scheduleId }).catch((err: unknown) =>
                  toast.error('Ekspor gagal', err instanceof ApiClientError ? err.message : undefined),
                )
              }
            >
              Ekspor CSV
            </Button>
            <Button icon={<Send className="h-4 w-4" />} disabled={!scheduleId} onClick={() => setPublishOpen(true)}>
              Publikasikan hasil
            </Button>
          </>
        }
      />

      <div className="mb-4 flex flex-wrap items-end gap-2">
        <div className="min-w-[260px] flex-1 sm:max-w-md">
          <label className="label" htmlFor="schedule">
            Jadwal ujian
          </label>
          <Select
            id="schedule"
            value={scheduleId}
            onChange={(e) => setSearchParams({ scheduleId: e.target.value })}
            disabled={schedules.loading}
          >
            {(schedules.data?.items ?? []).map((s) => (
              <option key={s.id} value={s.id}>
                {s.date} · {s.title} ({s.participantCount} peserta)
              </option>
            ))}
          </Select>
        </div>
        {report.data ? (
          <div className="flex flex-wrap items-center gap-1.5 pb-2 text-[11.5px] text-slate-500">
            <Badge tone="info">{report.data.schedule.examTypeName}</Badge>
            <Badge tone="navy">{report.data.schedule.subjectName}</Badge>
            <span>KKM {report.data.schedule.passingScore}</span>
            <span>· {report.data.schedule.totalPoints} poin total</span>
          </div>
        ) : null}
      </div>

      {report.loading && !report.data ? <LoadingState label="Menghitung statistik…" /> : null}
      {report.error ? <ErrorState message={report.error} onRetry={() => void report.reload()} /> : null}

      {report.data ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Peserta selesai" value={report.data.summary.completed} hint={`${report.data.summary.scheduled} terjadwal · ${report.data.summary.absent} tidak hadir`} icon={<Users className="h-5 w-5" />} tone="navy" />
            <StatCard label="Rata-rata nilai" value={report.data.summary.mean.toFixed(1)} hint={`Median ${report.data.summary.median.toFixed(1)}`} icon={<BarChart3 className="h-5 w-5" />} tone="info" />
            <StatCard
              label="Ketuntasan"
              value={report.data.summary.passRate === null ? '—' : `${report.data.summary.passRate.toFixed(0)}%`}
              hint={`KKM ${report.data.schedule.passingScore}`}
              icon={<CheckCircle2 className="h-5 w-5" />}
              tone={report.data.summary.passRate !== null && report.data.summary.passRate < 60 ? 'warning' : 'success'}
            />
            <StatCard label="Simpangan baku" value={report.data.summary.stdDev.toFixed(1)} hint={`Rentang ${report.data.summary.min}–${report.data.summary.max}`} icon={<Sigma className="h-5 w-5" />} tone="violet" />
          </div>

          <Tabs
            items={[
              { key: 'summary', label: 'Ringkasan' },
              { key: 'items', label: 'Analisis butir' },
              { key: 'rows', label: 'Daftar nilai', count: report.data.summary.completed },
            ]}
            active={tab}
            onChange={(key) => setTab(key as typeof tab)}
          />

          <div className="mt-3">
            {tab === 'summary' ? (
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-2">
                <Card>
                  <CardHeader title="Distribusi nilai" description="Interval nilai berdasarkan persentase skor." />
                  <div className="mt-3 space-y-1.5">
                    {report.data.distribution.map((band) => (
                      <Bar key={band.label} label={band.label} value={band.count} max={maxDistribution} />
                    ))}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Perbandingan kelas" description="Rata-rata nilai dan ketuntasan per kelas." />
                  {report.data.byClass.length === 0 ? (
                    <p className="mt-2 text-[12.5px] text-slate-500">Belum ada data kelas.</p>
                  ) : (
                    <div className="mt-3 space-y-2">
                      {report.data.byClass.map((g) => (
                        <div key={g.key}>
                          <div className="mb-0.5 flex items-center justify-between text-[12px]">
                            <span className="font-medium text-slate-700">{g.label}</span>
                            <span className="text-slate-500">
                              n={g.count} · rata² {g.mean.toFixed(1)} · tuntas {g.passRate === null ? '—' : `${g.passRate.toFixed(0)}%`}
                            </span>
                          </div>
                          <div className="h-3 overflow-hidden rounded bg-slate-100">
                            <div className="h-full rounded bg-brand-600" style={{ width: `${(g.mean / maxClass) * 100}%` }} />
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
                <Card>
                  <CardHeader title="Perbandingan sesi" description="Rata-rata nilai per ruang/sesi." />
                  <div className="mt-3 space-y-2">
                    {report.data.bySession.map((g) => (
                      <div key={g.key} className="flex items-center justify-between rounded-lg border border-slate-200 px-2.5 py-1.5 text-[12px]">
                        <span className="font-medium text-slate-700">{g.label}</span>
                        <span className="text-slate-500">
                          n={g.count} · rata² {g.mean.toFixed(1)} · min {g.min} · max {g.max}
                        </span>
                      </div>
                    ))}
                    {report.data.bySession.length === 0 ? <p className="text-[12.5px] text-slate-500">Belum ada data sesi.</p> : null}
                  </div>
                </Card>
                <Card>
                  <CardHeader title="Catatan kualitas" />
                  <div className="mt-2 space-y-2 text-[12.5px] text-slate-600">
                    <p>• Rata-rata soal terjawab: {report.data.summary.answeredAverage.toFixed(1)} butir; kosong {report.data.summary.blankAverage.toFixed(1)} butir.</p>
                    <p>• Durasi rata-rata: {report.data.summary.averageDurationMinutes.toFixed(0)} menit.</p>
                    <p>• Menunggu penilaian uraian: {report.data.summary.pendingGrading} peserta.</p>
                    <p>• Persentil 25: {report.data.summary.p25.toFixed(1)} · Persentil 75: {report.data.summary.p75.toFixed(1)}.</p>
                    {report.data.summary.pendingGrading > 0 ? (
                      <Link to="/admin/grading" className="inline-flex items-center gap-1 font-medium text-brand-700 hover:underline">
                        Buka penilaian uraian →
                      </Link>
                    ) : null}
                  </div>
                </Card>
              </div>
            ) : null}

            {tab === 'items' ? (
              <div className="space-y-3">
                {items.loading && !items.data ? <LoadingState label="Menghitung analisis butir…" /> : null}
                {items.error ? <ErrorState message={items.error} onRetry={() => void items.reload()} /> : null}
                {items.data ? (
                  <>
                    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                      <Card>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Responden</p>
                        <p className="mt-1 text-2xl font-bold text-navy-900">{items.data.respondents}</p>
                      </Card>
                      <Card>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Reliabilitas (Cronbach α)</p>
                        <p className="mt-1 text-2xl font-bold text-navy-900">
                          {items.data.reliability.alpha === null ? '—' : items.data.reliability.alpha.toFixed(2)}
                        </p>
                        <p className="mt-0.5 text-[11px] text-slate-500">{items.data.reliability.note}</p>
                      </Card>
                      <Card>
                        <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Metode</p>
                        <p className="mt-1 text-[12px] leading-relaxed text-slate-600">{items.data.reliability.method}</p>
                      </Card>
                    </div>

                    <Card padded={false}>
                      <div className="border-b border-slate-100 px-4 py-3">
                        <CardHeader title="Butir soal" description="Kesukaran (P), daya pembeda, dan distribusi pilihan jawaban." />
                      </div>
                      <div className="thin-scroll max-h-[60vh] overflow-auto">
                        <table className="table-base">
                          <thead>
                            <tr>
                              <th>#</th>
                              <th>Butir</th>
                              <th className="text-center">P</th>
                              <th className="text-center">Kesukaran</th>
                              <th className="text-center">Daya pembeda</th>
                              <th className="text-center">Kosong</th>
                              <th>Saran</th>
                              <th>Distribusi pilihan</th>
                            </tr>
                          </thead>
                          <tbody>
                            {items.data.rows.map((row) => (
                              <tr key={row.questionId}>
                                <td className="w-10 font-mono text-[11.5px]">{row.order + 1}</td>
                                <td className="max-w-[280px]">
                                  <p className="line-clamp-2 text-[12.5px] text-slate-800">{row.preview}</p>
                                  <p className="text-[10.5px] uppercase text-slate-400">{row.type}</p>
                                </td>
                                <td className="text-center font-mono text-[12px]">{row.difficulty.toFixed(2)}</td>
                                <td className="text-center">
                                  <Badge tone={row.interpretation === 'mudah' ? 'success' : row.interpretation === 'sulit' ? 'danger' : 'info'}>
                                    {row.interpretation}
                                  </Badge>
                                </td>
                                <td className="text-center">
                                  <span className="text-[12px]">{row.discrimination === null ? '—' : row.discrimination.toFixed(2)}</span>
                                  <p className="text-[10px] text-slate-400">{row.discriminationLabel}</p>
                                </td>
                                <td className="text-center text-[12px]">{row.blank}</td>
                                <td>
                                  <Badge tone={row.recommendation === 'pertahankan' ? 'success' : row.recommendation === 'revisi' ? 'danger' : 'warning'}>
                                    {row.recommendation}
                                  </Badge>
                                </td>
                                <td className="min-w-[180px]">
                                  {row.optionTexts.length === 0 ? (
                                    <span className="text-[11px] text-slate-400">Uraian / tanpa opsi</span>
                                  ) : (
                                    <div className="space-y-0.5">
                                      {row.optionTexts.map((opt) => (
                                        <div key={opt.id} className="flex items-center gap-1.5 text-[10.5px]">
                                          <span className="w-4 font-semibold text-slate-500">{opt.id}</span>
                                          <div className="h-1.5 w-20 overflow-hidden rounded bg-slate-100">
                                            <div className="h-full bg-brand-500" style={{ width: `${Math.min(100, opt.percent)}%` }} />
                                          </div>
                                          <span className="text-slate-500">{opt.count}</span>
                                        </div>
                                      ))}
                                    </div>
                                  )}
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </Card>

                    <Card>
                      <CardHeader title="Keterbatasan analisis" actions={<Info className="h-4 w-4 text-slate-400" />} />
                      <ul className="mt-2 space-y-1 text-[12px] text-slate-500">
                        {items.data.caveats.map((caveat) => (
                          <li key={caveat}>• {caveat}</li>
                        ))}
                      </ul>
                    </Card>
                  </>
                ) : null}
              </div>
            ) : null}

            {tab === 'rows' ? (
              <Card padded={false}>
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 px-4 py-3">
                  <CardHeader title="Daftar nilai peserta" description="Data mentah yang sama dengan ekspor CSV." />
                  <Button
                    size="sm"
                    variant="secondary"
                    icon={<Download className="h-3.5 w-3.5" />}
                    onClick={() =>
                      void downloadCsv('/api/reports', { resource: 'export-results', scheduleId }).catch((err: unknown) =>
                        toast.error('Ekspor gagal', err instanceof ApiClientError ? err.message : undefined),
                      )
                    }
                  >
                    Unduh CSV
                  </Button>
                </div>
                <DataTable<ResultRow & { id: string }>
                  columns={[
                    { key: 'participantNo', header: 'No.', width: '64px', render: (row) => <span className="font-mono text-[11.5px]">{row.participantNo}</span> },
                    { key: 'fullName', header: 'Nama', render: (row) => <span className="font-medium">{row.fullName}</span> },
                    { key: 'className', header: 'Kelas', hideBelow: 'sm' },
                    { key: 'sessionCode', header: 'Sesi', hideBelow: 'md' },
                    {
                      key: 'score',
                      header: 'Skor',
                      align: 'right',
                      render: (row) => (
                        <span>
                          {row.score}/{row.maxScore}
                        </span>
                      ),
                    },
                    {
                      key: 'percent',
                      header: 'Nilai',
                      align: 'right',
                      width: '90px',
                      render: (row) => (
                        <span className={`font-semibold ${row.percent >= (report.data?.schedule.passingScore ?? 70) ? 'text-green-700' : 'text-red-600'}`}>
                          {row.percent.toFixed(1)}
                        </span>
                      ),
                    },
                    {
                      key: 'status',
                      header: 'Status',
                      width: '130px',
                      render: (row) => (
                        <Badge tone={row.status === 'published' ? 'success' : row.status === 'final' ? 'navy' : 'warning'}>
                          {row.status === 'published' ? 'Dipublikasikan' : row.status === 'final' ? 'Final' : 'Menunggu nilai'}
                        </Badge>
                      ),
                    },
                    {
                      key: 'attendance',
                      header: 'Hadir',
                      width: '90px',
                      hideBelow: 'lg',
                      render: (row) => (row.attendance === 'present' ? 'Ya' : row.attendance === 'excused' ? 'Izin' : 'Tidak'),
                    },
                  ]}
                  rows={pagedRows.map((row) => ({ ...row, id: row.studentId }))}
                  emptyTitle="Belum ada nilai"
                  emptyDescription="Nilai muncul setelah peserta mengirim jawaban."
                  compact
                />
                <div className="border-t border-slate-100 px-4 py-2">
                  <Pagination page={page} pageSize={rowsPerPage} total={rows.length} onPageChange={setPage} />
                </div>
              </Card>
            ) : null}
          </div>
        </>
      ) : null}

      {schedules.data && schedules.data.items.length === 0 ? (
        <EmptyState
          title="Belum ada jadwal untuk dianalisis"
          description="Buat jadwal ujian dan tunggu peserta menyelesaikan ujian."
          icon={<AlertTriangle className="h-6 w-6" />}
          action={
            <Link to="/admin/schedules">
              <Button variant="secondary">Buat jadwal</Button>
            </Link>
          }
        />
      ) : null}

      <ConfirmDialog
        open={publishOpen}
        tone="primary"
        title="Publikasikan hasil ujian?"
        message={
          <>
            Peserta akan dapat melihat nilai (dan pembahasan bila diizinkan) untuk jadwal{' '}
            <strong>{report.data?.schedule.title}</strong>. Pastikan penilaian uraian sudah selesai.
          </>
        }
        confirmLabel="Publikasikan"
        loading={publishing}
        onCancel={() => setPublishOpen(false)}
        onConfirm={() => void publish()}
      />
    </div>
  );
}
