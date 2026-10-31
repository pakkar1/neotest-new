import { useState } from 'react';
import { Activity, AlertTriangle, Gauge, RefreshCw, Timer, Wrench } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Card, CardHeader, StatCard } from '../../components/ui/Card';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { QuotaSnapshot } from '../../shared/types';

interface QuotaResponse {
  snapshot: QuotaSnapshot;
  thresholds: { enabled: boolean; dailyReadWarning: number; dailyWriteWarning: number };
  note: string;
}

export default function QuotaPage() {
  usePageTitle('Kuota & Kinerja');
  const toast = useToast();
  const [sweeping, setSweeping] = useState(false);
  const quota = useAsync(() => apiRequest<QuotaResponse>('/api/admin', { query: { resource: 'quota' } }), []);

  const sweep = async () => {
    setSweeping(true);
    try {
      const res = await apiRequest<{ checked: number; finalized: number }>('/api/attempts', { query: { action: 'sweep' } });
      toast.success(`Sweep selesai: ${res.finalized} pengerjaan difinalisasi dari ${res.checked} yang diperiksa.`);
      await quota.reload();
    } catch (err) {
      toast.error('Sweep gagal', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setSweeping(false);
    }
  };

  const data = quota.data;

  return (
    <div>
      <PageHeader
        title="Kuota & Kinerja"
        description="Perkiraan pemakaian bacaan/penulisan untuk membantu menjaga aplikasi tetap di bawah kuota gratis Firestore. Angka ini bukan metrik resmi Firebase."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Kuota & Kinerja' }]}
        actions={
          <>
            <Button variant="secondary" loading={sweeping} icon={<Wrench className="h-4 w-4" />} onClick={() => void sweep()}>
              Finalisasi pengerjaan kedaluwarsa
            </Button>
            <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${quota.loading ? 'animate-spin' : ''}`} />} onClick={() => void quota.reload()}>
              Muat ulang
            </Button>
          </>
        }
      />

      {quota.loading && !data ? <LoadingState label="Memuat perkiraan kuota…" /> : null}
      {quota.error ? <ErrorState message={quota.error} onRetry={() => void quota.reload()} /> : null}

      {data ? (
        <>
          <div className="mb-4 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard label="Bacaan hari ini" value={data.snapshot.reads.toLocaleString('id-ID')} hint={`Batas perkiraan ${data.snapshot.limits.reads.toLocaleString('id-ID')}`} icon={<Gauge className="h-5 w-5" />} tone="info" />
            <StatCard label="Penulisan hari ini" value={data.snapshot.writes.toLocaleString('id-ID')} hint={`Batas perkiraan ${data.snapshot.limits.writes.toLocaleString('id-ID')}`} icon={<Activity className="h-5 w-5" />} tone="navy" />
            <StatCard label="Penghapusan" value={data.snapshot.deletes.toLocaleString('id-ID')} icon={<Timer className="h-5 w-5" />} tone="violet" />
            <StatCard
              label="Status"
              value={data.snapshot.warning ? 'Perhatian' : 'Aman'}
              hint={data.snapshot.estimated ? 'Angka perkiraan internal' : 'Data resmi'}
              icon={<AlertTriangle className="h-5 w-5" />}
              tone={data.snapshot.warning ? 'warning' : 'success'}
            />
          </div>

          <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1fr_360px]">
            <Card>
              <CardHeader
                title={`Pemakaian ${data.snapshot.date}`}
                description="Dihitung dari jumlah operasi yang dilakukan API NeoTest hari ini (WIB)."
                actions={<Badge tone={data.snapshot.estimated ? 'warning' : 'success'}>{data.snapshot.estimated ? 'Perkiraan' : 'Resmi'}</Badge>}
              />
              <div className="mt-4 space-y-4">
                <UsageBar label="Bacaan dokumen" value={data.snapshot.reads} limit={data.snapshot.limits.reads} />
                <UsageBar label="Penulisan dokumen" value={data.snapshot.writes} limit={data.snapshot.limits.writes} />
                <UsageBar label="Peringatan bacaan" value={data.snapshot.reads} limit={data.thresholds.dailyReadWarning} tone="amber" />
                <UsageBar label="Peringatan penulisan" value={data.snapshot.writes} limit={data.thresholds.dailyWriteWarning} tone="amber" />
              </div>
              {data.snapshot.warning ? (
                <p className="mt-4 rounded-lg bg-amber-50 p-3 text-[12.5px] text-amber-900">
                  <AlertTriangle className="mr-1 inline h-4 w-4" />
                  {data.snapshot.warning}
                </p>
              ) : null}
              <p className="mt-4 text-[11.5px] leading-relaxed text-slate-500">{data.note}</p>
            </Card>

            <div className="space-y-4">
              <Card>
                <CardHeader title="Cara NeoTest menghemat kuota" />
                <ul className="mt-2 space-y-1.5 text-[12px] leading-relaxed text-slate-600">
                  <li>• Snapshot soal dibaca sekali per pengerjaan, bukan per jawaban.</li>
                  <li>• Autosave dibatasi dan tidak menulis ulang jawaban yang identik.</li>
                  <li>• Daftar peserta memakai query terbatas per sesi.</li>
                  <li>• Statistik butir diagregasi saat pengiriman, bukan dihitung ulang tiap buka halaman.</li>
                  <li>• Ekspor CSV memakai respons non-JSON agar tidak menambah pembacaan.</li>
                </ul>
              </Card>
              <Card>
                <CardHeader title="Perawatan" description="Finalisasi pengerjaan yang melewati batas waktu." />
                <p className="mt-2 text-[12px] leading-relaxed text-slate-600">
                  Server juga memfinalisasi otomatis saat peserta membuka halaman. Tombol di atas berguna untuk
                  membersihkan pengerjaan yang ditinggalkan tanpa pernah kembali.
                </p>
                <Button className="mt-3" block variant="secondary" loading={sweeping} icon={<Wrench className="h-4 w-4" />} onClick={() => void sweep()}>
                  Jalankan finalisasi sekarang
                </Button>
                <p className="mt-2 text-[11px] text-slate-500">
                  Terakhir dimuat: {formatDateTimeId(data.snapshot.date)}
                </p>
              </Card>
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}

function UsageBar({
  label,
  value,
  limit,
  tone = 'brand',
}: {
  label: string;
  value: number;
  limit: number;
  tone?: 'brand' | 'amber';
}) {
  const pct = limit > 0 ? Math.min(100, Math.round((value / limit) * 100)) : 0;
  const color = pct >= 90 ? 'bg-danger' : tone === 'amber' ? 'bg-amber-500' : pct >= 70 ? 'bg-amber-500' : 'bg-brand-600';
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[12.5px]">
        <span className="text-slate-600">{label}</span>
        <span className="font-medium text-slate-800">
          {value.toLocaleString('id-ID')} / {limit.toLocaleString('id-ID')} ({pct}%)
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
