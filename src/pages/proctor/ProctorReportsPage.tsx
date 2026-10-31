import { useState } from 'react';
import { Link } from 'react-router-dom';
import { FileText, Printer, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Card, CardHeader } from '../../components/ui/Card';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { Badge } from '../../components/ui/Badge';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import type { SessionSummary } from '../../lib/proctorTypes';

export default function ProctorReportsPage() {
  usePageTitle('Dokumen & Cetak');
  const [all, setAll] = useState(true);
  const sessions = useAsync(
    () =>
      apiRequest<{ items: SessionSummary[] }>('/api/proctor', {
        query: { resource: 'sessions', ...(all ? { all: 1 } : {}) },
      }),
    [all],
  );

  return (
    <div>
      <PageHeader
        title="Dokumen & Cetak"
        description="Daftar hadir dan berita acara dalam format A4 dengan kop sekolah. Dokumen dicetak dari halaman terpisah agar rapi saat disimpan sebagai PDF."
        breadcrumb={[{ label: 'Beranda', to: '/proktor' }, { label: 'Dokumen & Cetak' }]}
        actions={
          <>
            <Button variant={all ? 'primary' : 'secondary'} size="sm" onClick={() => setAll((v) => !v)}>
              {all ? 'Semua sesi' : 'Hari ini'}
            </Button>
            <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${sessions.loading ? 'animate-spin' : ''}`} />} onClick={() => void sessions.reload()}>
              Muat ulang
            </Button>
          </>
        }
      />

      {sessions.loading && !sessions.data ? <LoadingState label="Memuat sesi…" /> : null}
      {sessions.error ? <ErrorState message={sessions.error} onRetry={() => void sessions.reload()} /> : null}

      {sessions.data ? (
        sessions.data.items.length === 0 ? (
          <EmptyState title="Belum ada sesi" description="Dokumen tersedia setelah sesi ujian dibuat oleh admin." icon={<FileText className="h-6 w-6" />} />
        ) : (
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {sessions.data.items.map((item) => (
              <Card key={item.session.id}>
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <p className="text-[14px] font-semibold text-navy-900">
                      {item.room.name} · Sesi {item.session.code}
                    </p>
                    <p className="text-[12px] text-slate-500">
                      {item.schedule.title} · {item.schedule.date} · {item.session.startsAt.slice(11, 16)}–{item.session.endsAt.slice(11, 16)}
                    </p>
                    <p className="text-[11.5px] text-slate-500">
                      {item.subjectName} · {item.counts.total} peserta · {item.counts.absent} tidak hadir
                    </p>
                  </div>
                  <Badge tone={item.session.status === 'open' ? 'success' : item.session.status === 'closed' ? 'neutral' : 'info'}>
                    {item.session.status === 'open' ? 'Berlangsung' : item.session.status === 'closed' ? 'Ditutup' : 'Persiapan'}
                  </Badge>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to={`/cetak/kehadiran/${item.session.id}`} target="_blank">
                    <Button size="sm" variant="secondary" icon={<Printer className="h-3.5 w-3.5" />}>
                      Daftar hadir
                    </Button>
                  </Link>
                  <Link to={`/cetak/berita-acara/${item.session.id}`} target="_blank">
                    <Button size="sm" variant="secondary" icon={<FileText className="h-3.5 w-3.5" />}>
                      Berita acara
                    </Button>
                  </Link>
                  <Link to={`/proktor/sesi/${item.session.id}`} className="ml-auto">
                    <Button size="sm" variant="ghost">
                      Kelola sesi
                    </Button>
                  </Link>
                </div>
              </Card>
            ))}
          </div>
        )
      ) : null}

      <Card className="mt-4">
        <CardHeader
          title="Catatan penggunaan dokumen"
          description="Kedua dokumen memuat kop sekolah, identitas sesi, daftar peserta, dan kolom tanda tangan kepala sekolah serta proktor."
        />
        <ul className="mt-2 space-y-1 text-[12px] text-slate-500">
          <li>• Daftar hadir menyertakan kolom tanda tangan peserta dan status kehadiran.</li>
          <li>• Berita acara merangkum jumlah peserta, insiden yang tercatat, dan pernyataan pengawas.</li>
          <li>• Gunakan tombol “Cetak / Simpan PDF” pada dialog cetak browser; ukuran halaman A4.</li>
          <li>• Setiap pencetakan dokumen dicatat di audit log.</li>
        </ul>
      </Card>
    </div>
  );
}
