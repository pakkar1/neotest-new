import { Link, useParams, useSearchParams } from 'react-router-dom';
import DOMPurify from 'dompurify';
import { ArrowLeft, CheckCircle2, Clock, FileBarChart, Lock, Printer, X } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, InfoRow } from '../../components/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { AttemptReview, AttemptReviewQuestion } from '../../shared/types';

function plain(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function keyText(q: AttemptReviewQuestion): string {
  if (q.key === null || q.key === undefined) return '—';
  if (typeof q.key === 'boolean') return q.key ? 'Benar' : 'Salah';
  if (typeof q.key === 'string') {
    const option = q.question.options.find((o) => o.id === q.key);
    return option ? `${q.key}. ${plain(option.text)}` : q.key;
  }
  if (Array.isArray(q.key)) {
    return q.key
      .map((id) => {
        const option = q.question.options.find((o) => o.id === id);
        return option ? `${id}. ${plain(option.text)}` : String(id);
      })
      .join('; ');
  }
  if (typeof q.key === 'object') {
    const map = q.key as Record<string, string>;
    return Object.entries(map)
      .map(([left, right]) => {
        const leftText = q.question.pairs.find((p) => p.id === left)?.left ?? left;
        const rightText = q.question.pairs.find((p) => p.id === right)?.right ?? right;
        return `${leftText} → ${rightText}`;
      })
      .join('; ');
  }
  return String(q.key);
}

function answerText(q: AttemptReviewQuestion): string {
  const value = q.value;
  if (value === null || value === undefined) return '—';
  if (typeof value === 'boolean') return value ? 'Benar' : 'Salah';
  if (typeof value === 'string') {
    const option = q.question.options.find((o) => o.id === value);
    return option ? `${value}. ${plain(option.text)}` : plain(value);
  }
  if (Array.isArray(value)) {
    return value
      .map((id) => {
        const option = q.question.options.find((o) => o.id === id);
        return typeof id === 'string' && option ? `${id}. ${plain(option.text)}` : String(id);
      })
      .join('; ');
  }
  if (typeof value === 'object') {
    return Object.entries(value as Record<string, string>)
      .map(([left, right]) => {
        const leftText = q.question.pairs.find((p) => p.id === left)?.left ?? left;
        const rightText = q.question.pairs.find((p) => p.id === right)?.right ?? right;
        return `${leftText} → ${rightText}`;
      })
      .join('; ');
  }
  return String(value);
}

export default function ResultDetailPage() {
  const { attemptId } = useParams<{ attemptId: string }>();
  const [search] = useSearchParams();
  const justSubmitted = search.get('selesai') === '1';
  usePageTitle('Pembahasan Hasil');
  const detail = useAsync(
    () => apiRequest<AttemptReview & { allowReview: boolean; message?: string }>('/api/results', {
      query: { resource: 'detail', attemptId: attemptId ?? '' },
    }),
    [attemptId],
    { enabled: Boolean(attemptId) },
  );

  if (detail.loading) return <LoadingState label="Memuat hasil…" />;
  if (detail.error || !detail.data) {
    return <ErrorState message={detail.error ?? 'Hasil tidak ditemukan.'} onRetry={() => void detail.reload()} />;
  }

  const review = detail.data;
  const result = review.result;

  return (
    <div>
      <PageHeader
        title="Pembahasan Hasil Ujian"
        description={`Dikirim ${formatDateTimeId(review.attempt.submittedAt)} · durasi ${Math.round((review.result?.durationSec ?? 0) / 60)} menit`}
        breadcrumb={[{ label: 'Beranda', to: '/siswa' }, { label: 'Hasil', to: '/siswa/hasil' }, { label: 'Pembahasan' }]}
        actions={
          <>
            <Link to="/siswa/hasil">
              <Button variant="ghost" icon={<ArrowLeft className="h-4 w-4" />}>
                Kembali
              </Button>
            </Link>
            <Button variant="secondary" icon={<Printer className="h-4 w-4" />} onClick={() => window.print()}>
              Cetak
            </Button>
          </>
        }
      />

      {justSubmitted ? (
        <div className="mb-4 rounded-xl border border-green-200 bg-green-50 px-4 py-3">
          <p className="flex items-center gap-1.5 text-[13px] font-semibold text-green-900">
            <CheckCircle2 className="h-4 w-4" /> Jawaban berhasil dikirim
          </p>
          <p className="mt-0.5 text-[12.5px] text-green-800">
            {review.allowReview
              ? 'Pembahasan tersedia di bawah. Baca kembali kunci dan penjelasan untuk belajar.'
              : 'Guru akan menilai jawaban uraian (bila ada) sebelum hasil dipublikasikan.'}
          </p>
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
        <div className="space-y-4">
          {!review.allowReview ? (
            <Card>
              <div className="flex items-start gap-2">
                <Lock className="mt-0.5 h-5 w-5 shrink-0 text-slate-400" />
                <div>
                  <p className="text-[14px] font-semibold text-navy-900">Pembahasan belum dibuka</p>
                  <p className="mt-1 text-[12.5px] leading-relaxed text-slate-500">
                    {review.message ?? 'Sekolah belum membuka kunci jawaban untuk ujian ini.'}
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            review.questions.map((q, index) => {
              const status =
                q.blank
                  ? 'kosong'
                  : q.essayPending
                    ? 'pending'
                    : q.correct
                      ? 'benar'
                      : 'salah';
              return (
                <Card key={q.question.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <span className="rounded-lg bg-navy-800 px-2 py-1 text-[12px] font-semibold text-white">Soal {index + 1}</span>
                      <span className="text-[11.5px] uppercase tracking-wide text-slate-500">{q.question.type}</span>
                      <span className="text-[11.5px] text-slate-500">
                        {q.score ?? 0}/{q.maxPoints} poin
                      </span>
                    </div>
                    <Badge tone={status === 'benar' ? 'success' : status === 'pending' ? 'warning' : status === 'kosong' ? 'neutral' : 'danger'}>
                      {status === 'benar' ? 'Benar' : status === 'pending' ? 'Menunggu penilaian' : status === 'kosong' ? 'Kosong' : 'Salah'}
                    </Badge>
                  </div>
                  {q.question.stimulus ? (
                    <div className="mt-2 rounded-lg bg-slate-50 p-2 text-[12.5px] text-slate-600">
                      <p className="font-medium">{q.question.stimulus.title}</p>
                      <div className="rich-content mt-1" dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(q.question.stimulus.content) }} />
                    </div>
                  ) : null}
                  <div
                    className="rich-content mt-2 text-[13.5px] leading-relaxed"
                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(q.question.content) }}
                  />
                  {q.question.type === 'truefalse' ? (
                    <p className="mt-1.5 rounded bg-slate-50 p-2 text-[12.5px]">{q.question.statement}</p>
                  ) : null}
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    <div className={`rounded-lg p-2.5 text-[12.5px] ${q.correct ? 'bg-green-50' : q.blank ? 'bg-slate-50' : 'bg-red-50'}`}>
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Jawaban Anda</p>
                      <p className="mt-0.5 text-slate-800">{answerText(q)}</p>
                    </div>
                    <div className="rounded-lg bg-brand-50 p-2.5 text-[12.5px]">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Kunci</p>
                      <p className="mt-0.5 text-slate-800">{keyText(q)}</p>
                    </div>
                  </div>
                  {q.explanation ? (
                    <div className="mt-2 rounded-lg border border-slate-200 p-2.5">
                      <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Pembahasan</p>
                      <div
                        className="rich-content mt-0.5 text-[12.5px] leading-relaxed"
                        dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(q.explanation) }}
                      />
                    </div>
                  ) : null}
                  {q.essayPending ? (
                    <p className="mt-2 flex items-center gap-1.5 text-[11.5px] text-amber-700">
                      <Clock className="h-3.5 w-3.5" /> Jawaban uraian sedang menunggu penilaian guru.
                    </p>
                  ) : null}
                </Card>
              );
            })
          )}
        </div>

        <div className="space-y-4">
          <Card>
            <CardHeader title="Ringkasan nilai" />
            {result ? (
              <>
                <div className="mt-3 rounded-xl bg-navy-900 p-4 text-center text-white">
                  <p className="text-[30px] font-extrabold leading-none">{result.percent.toFixed(1)}</p>
                  <p className="mt-1 text-[11px] uppercase tracking-wider text-navy-200">dari 100</p>
                  <p className="mt-2 text-[12px] text-navy-100">
                    Skor {result.score} / {result.maxScore}
                  </p>
                </div>
                <div className="mt-2">
                  <InfoRow label="Benar" value={result.correctCount} />
                  <InfoRow label="Salah" value={result.wrongCount} />
                  <InfoRow label="Kosong" value={result.blankCount} />
                  <InfoRow label="Uraian belum dinilai" value={result.essayPending} />
                  <InfoRow label="Durasi" value={`${Math.round(result.durationSec / 60)} menit`} />
                  <InfoRow
                    label="Status"
                    value={
                      <Badge tone={result.status === 'published' ? 'success' : 'warning'}>
                        {result.status === 'published' ? 'Dipublikasikan' : 'Menunggu penilaian'}
                      </Badge>
                    }
                  />
                </div>
              </>
            ) : (
              <EmptyState
                title="Nilai belum tersedia"
                description="Hasil akan tampil setelah guru mempublikasikan nilai."
                icon={<FileBarChart className="h-6 w-6" />}
              />
            )}
          </Card>
          <Card>
            <CardHeader title="Belajar dari kesalahan" />
            <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-500">
              <li>• Fokus pada butir yang salah, bukan hanya nilai akhir.</li>
              <li>• Baca ulang pembahasan dan hubungi guru bila ada kejanggalan.</li>
              <li>• Soal yang kosong juga kehilangan poin penuh.</li>
            </ul>
          </Card>
          {review.questions.some((q) => q.correct === false) ? (
            <Card>
              <CardHeader title="Butir yang perlu diulang" />
              <div className="mt-2 flex flex-wrap gap-1">
                {review.questions
                  .map((q, i) => ({ q, i }))
                  .filter(({ q }) => q.correct === false)
                  .map(({ i }) => (
                    <span key={i} className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-medium text-red-700">
                      <X className="h-3 w-3" /> Soal {i + 1}
                    </span>
                  ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </div>
  );
}
