import { useEffect, useMemo, useState } from 'react';
import { ClipboardCheck, RefreshCw, Save, UserRound } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, InfoRow } from '../../components/ui/Card';
import { Field, Input, Textarea } from '../../components/ui/Field';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { ExamAttempt, ExamResult, VersionQuestion } from '../../shared/types';

interface QueueItem {
  id: string;
  attemptId: string;
  scheduleId: string;
  scheduleTitle: string;
  scheduleDate: string;
  studentId: string;
  studentName: string;
  participantNo: string;
  essayPending: number;
  status: string;
}

interface EssayItem {
  question: VersionQuestion;
  response: unknown;
  rubric: { id: string; criterion: string; points: number }[];
  manualScore: number | null;
  points: number;
}

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

export default function GradingPage() {
  usePageTitle('Penilaian Uraian');
  const toast = useToast();
  const [selected, setSelected] = useState<QueueItem | null>(null);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const queue = useAsync(() => apiRequest<{ items: QueueItem[]; total: number }>('/api/admin', { query: { resource: 'grading-queue' } }), []);
  const detail = useAsync(
    () => apiRequest<{ attempt: ExamAttempt; result: ExamResult | null; essays: EssayItem[] }>('/api/results', {
      query: { resource: 'grading', attemptId: selected?.attemptId ?? '' },
    }),
    [selected?.attemptId],
    { enabled: Boolean(selected?.attemptId) },
  );

  useEffect(() => {
    if (!detail.data) return;
    const initial: Record<string, number> = {};
    for (const essay of detail.data.essays) {
      initial[essay.question.questionId] = essay.manualScore ?? 0;
    }
    setScores(initial);
  }, [detail.data]);

  const items = queue.data?.items ?? [];
  const totalPoints = useMemo(
    () => (detail.data?.essays ?? []).reduce((a, e) => a + e.points, 0),
    [detail.data],
  );
  const entered = Object.values(scores).reduce((a, v) => a + (Number.isFinite(v) ? v : 0), 0);

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      await apiRequest('/api/results', {
        method: 'POST',
        query: { resource: 'grade' },
        body: { attemptId: selected.attemptId, scores, reason },
      });
      toast.success('Nilai uraian disimpan.');
      setSelected(null);
      await queue.reload();
    } catch (err) {
      toast.error('Gagal menyimpan nilai', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Penilaian Uraian"
        description="Nilai jawaban esai menggunakan rubrik. Setelah seluruh uraian dinilai, hasil otomatis menjadi final dan dapat dipublikasikan."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Penilaian Uraian' }]}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${queue.loading ? 'animate-spin' : ''}`} />} onClick={() => void queue.reload()}>
            Muat ulang
          </Button>
        }
      />

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-[340px_1fr]">
        <Card padded={false}>
          <div className="border-b border-slate-100 px-4 py-3">
            <CardHeader title="Menunggu penilaian" description="Satu baris per peserta dengan uraian belum dinilai." />
          </div>
          {queue.loading && !queue.data ? <LoadingState label="Memuat antrean…" /> : null}
          {queue.error ? <ErrorState message={queue.error} onRetry={() => void queue.reload()} /> : null}
          {queue.data && items.length === 0 ? (
            <div className="p-3">
              <EmptyState title="Tidak ada antrean" description="Semua jawaban uraian sudah dinilai." icon={<ClipboardCheck className="h-6 w-6" />} />
            </div>
          ) : (
            <ul className="thin-scroll max-h-[65vh] divide-y divide-slate-100 overflow-y-auto">
              {items.map((item) => (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setSelected(item);
                      setReason('');
                    }}
                    className={`flex w-full items-start gap-2.5 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      selected?.id === item.id ? 'bg-brand-50/70' : ''
                    }`}
                  >
                    <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-navy-50 text-navy-700">
                      <UserRound className="h-3.5 w-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-[12.5px] font-medium text-slate-800">{item.studentName}</span>
                      <span className="block truncate text-[11px] text-slate-500">
                        {item.participantNo} · {item.scheduleTitle}
                      </span>
                    </span>
                    <Badge tone="warning">{item.essayPending} esai</Badge>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <div>
          {!selected ? (
            <Card>
              <EmptyState
                title="Pilih peserta"
                description="Pilih salah satu peserta di kiri untuk mulai menilai jawaban uraian."
                icon={<ClipboardCheck className="h-6 w-6" />}
              />
            </Card>
          ) : detail.loading && !detail.data ? (
            <LoadingState label="Memuat jawaban…" />
          ) : detail.error ? (
            <ErrorState message={detail.error} onRetry={() => void detail.reload()} />
          ) : detail.data ? (
            <div className="space-y-3">
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="text-[15px] font-semibold text-navy-900">{selected.studentName}</p>
                    <p className="text-[12px] text-slate-500">
                      {selected.participantNo} · {selected.scheduleTitle} · {selected.scheduleDate}
                    </p>
                    <p className="mt-0.5 text-[11.5px] text-slate-500">
                      Dikirim {formatDateTimeId(detail.data.attempt.submittedAt)} · skor objektif{' '}
                      {detail.data.result?.score ?? 0}/{((detail.data.result?.maxScore ?? 0) - totalPoints).toFixed(1)}
                    </p>
                  </div>
                  <Badge tone="warning">{detail.data.essays.length} jawaban uraian</Badge>
                </div>
              </Card>

              {detail.data.essays.map((essay, index) => {
                const value = typeof essay.response === 'string' ? essay.response : '';
                const score = scores[essay.question.questionId] ?? 0;
                return (
                  <Card key={essay.question.questionId}>
                    <CardHeader
                      title={`Esai ${index + 1}`}
                      description={`${essay.points} poin maksimal · ${plain(essay.question.content).slice(0, 90)}`}
                      actions={<Badge tone={score > 0 ? 'success' : 'neutral'}>{score} poin</Badge>}
                    />
                    <div className="mt-2 rounded-lg bg-slate-50 p-2.5 text-[12px] text-slate-600">
                      <p className="mb-1 font-medium text-slate-700">Pertanyaan</p>
                      <p className="line-clamp-3">{plain(essay.question.content)}</p>
                    </div>
                    <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
                      <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-slate-500">Jawaban peserta</p>
                      <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-slate-800">
                        {value.trim() || <em className="text-slate-400">Tidak dijawab</em>}
                      </p>
                    </div>
                    {essay.rubric.length > 0 ? (
                      <div className="mt-2">
                        <p className="mb-1 text-[11.5px] font-medium uppercase tracking-wide text-slate-500">Rubrik</p>
                        <div className="space-y-1">
                          {essay.rubric.map((row) => (
                            <div key={row.id} className="flex items-start justify-between gap-2 rounded border border-slate-100 px-2 py-1 text-[12px]">
                              <span className="text-slate-700">{row.criterion}</span>
                              <span className="shrink-0 text-slate-500">{row.points} poin</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="mt-3 flex flex-wrap items-end gap-2">
                      <Field label={`Nilai esai (0–${essay.points})`}>
                        <Input
                          type="number"
                          min={0}
                          max={essay.points}
                          step={0.5}
                          value={score}
                          onChange={(e) =>
                            setScores((prev) => ({
                              ...prev,
                              [essay.question.questionId]: Math.min(essay.points, Math.max(0, Number(e.target.value))),
                            }))
                          }
                          className="w-28"
                        />
                      </Field>
                      <div className="flex gap-1 pb-0.5">
                        {[0, 0.5, 1].map((ratio) => (
                          <Button
                            key={ratio}
                            size="sm"
                            variant="secondary"
                            onClick={() =>
                              setScores((prev) => ({
                                ...prev,
                                [essay.question.questionId]: Math.round(essay.points * ratio * 10) / 10,
                              }))
                            }
                          >
                            {ratio === 0 ? '0' : ratio === 0.5 ? '50%' : 'Penuh'}
                          </Button>
                        ))}
                      </div>
                    </div>
                  </Card>
                );
              })}

              <Card>
                <CardHeader title="Simpan penilaian" description="Perubahan nilai dicatat di audit log beserta alasannya." />
                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_240px]">
                  <Field label="Catatan untuk audit (opsional)">
                    <Textarea rows={2} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Contoh: penilaian sesuai rubrik, jawaban kurang lengkap pada kriteria 2." />
                  </Field>
                  <div className="rounded-lg bg-slate-50 p-3">
                    <InfoRow label="Total esai" value={`${entered.toFixed(1)} / ${totalPoints}`} />
                    <InfoRow label="Jumlah jawaban" value={detail.data.essays.length} />
                    <Button className="mt-2" block loading={saving} icon={<Save className="h-4 w-4" />} onClick={() => void save()}>
                      Simpan nilai
                    </Button>
                  </div>
                </div>
              </Card>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
