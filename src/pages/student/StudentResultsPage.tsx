import { Link } from 'react-router-dom';
import { ArrowRight, BarChart3, FileBarChart, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, StatCard } from '../../components/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import type { ExamResult } from '../../shared/types';

interface StudentResultItem {
  result: ExamResult;
  schedule: { id: string; title: string; date: string; subjectName: string; examTypeName: string };
  attemptId: string;
  allowReview: boolean;
}

export default function StudentResultsPage() {
  usePageTitle('Hasil Ujian');
  const results = useAsync(() => apiRequest<{ items: StudentResultItem[] }>('/api/results', { query: { resource: 'my' } }), []);
  const items = results.data?.items ?? [];
  const average = items.length > 0 ? items.reduce((a, r) => a + r.result.percent, 0) / items.length : 0;
  const best = items.length > 0 ? Math.max(...items.map((r) => r.result.percent)) : 0;

  return (
    <div>
      <PageHeader
        title="Hasil & Pembahasan"
        description="Hanya hasil yang sudah dipublikasikan sekolah yang tampil di sini. Pembahasan mengikuti pengaturan jenis ujian."
        breadcrumb={[{ label: 'Beranda', to: '/siswa' }, { label: 'Hasil' }]}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${results.loading ? 'animate-spin' : ''}`} />} onClick={() => void results.reload()}>
            Muat ulang
          </Button>
        }
      />

      {results.loading && !results.data ? <LoadingState label="Memuat hasil…" /> : null}
      {results.error ? <ErrorState message={results.error} onRetry={() => void results.reload()} /> : null}

      {results.data ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-3">
            <StatCard label="Ujian dipublikasikan" value={items.length} icon={<FileBarChart className="h-5 w-5" />} tone="navy" />
            <StatCard label="Rata-rata nilai" value={`${average.toFixed(1)}`} hint="Skala 0–100" icon={<BarChart3 className="h-5 w-5" />} tone="info" />
            <StatCard label="Nilai tertinggi" value={`${best.toFixed(1)}`} icon={<BarChart3 className="h-5 w-5" />} tone="success" />
          </div>

          {items.length === 0 ? (
            <EmptyState
              title="Belum ada hasil dipublikasikan"
              description="Nilai akan muncul setelah guru/admin mempublikasikan hasil ujian."
              icon={<FileBarChart className="h-6 w-6" />}
            />
          ) : (
            <Card padded={false}>
              <ul className="divide-y divide-slate-100">
                {items.map((item) => (
                  <li key={item.result.id} className="flex flex-wrap items-center gap-3 px-4 py-3.5">
                    <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-brand-50 text-[15px] font-bold text-brand-800">
                      {item.result.percent.toFixed(0)}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[13.5px] font-semibold text-navy-900">{item.schedule.title}</p>
                      <p className="text-[12px] text-slate-500">
                        {item.schedule.subjectName} · {item.schedule.examTypeName} · {item.schedule.date}
                      </p>
                      <p className="mt-0.5 text-[11.5px] text-slate-500">
                        Skor {item.result.score}/{item.result.maxScore} · benar {item.result.correctCount} · salah{' '}
                        {item.result.wrongCount} · kosong {item.result.blankCount}
                      </p>
                    </div>
                    <Badge tone={item.result.percent >= 70 ? 'success' : item.result.percent >= 50 ? 'warning' : 'danger'}>
                      {item.result.percent >= 70 ? 'Tuntas' : item.result.percent >= 50 ? 'Cukup' : 'Perlu belajar'}
                    </Badge>
                    {item.allowReview ? (
                      <Link to={`/siswa/hasil/${item.attemptId}`}>
                        <Button size="sm" variant="secondary" iconRight={<ArrowRight className="h-3.5 w-3.5" />}>
                          Pembahasan
                        </Button>
                      </Link>
                    ) : (
                      <span className="rounded-lg bg-slate-100 px-2 py-1 text-[11.5px] text-slate-500">Pembahasan ditutup</span>
                    )}
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      ) : null}
    </div>
  );
}
