import { useState } from 'react';
import { CalendarDays, RefreshCw } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Field';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useAsync, usePageTitle } from '../../hooks';
import { apiRequest } from '../../services/api';
import { SessionList } from './SessionList';
import type { SessionSummary } from '../../lib/proctorTypes';

export default function ProctorSessionsPage() {
  usePageTitle('Sesi Saya');
  const [date, setDate] = useState('');
  const [all, setAll] = useState(false);
  const sessions = useAsync(
    () =>
      apiRequest<{ items: SessionSummary[] }>('/api/proctor', {
        query: { resource: 'sessions', ...(all ? { all: 1 } : {}), ...(date ? { date } : {}) },
      }),
    [all, date],
  );

  return (
    <div>
      <PageHeader
        title="Sesi Saya"
        description="Daftar sesi yang ditugaskan kepada Anda. Hanya proktor ruang terkait yang dapat membuka sesi dan menerbitkan token."
        breadcrumb={[{ label: 'Beranda', to: '/proktor' }, { label: 'Sesi Saya' }]}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${sessions.loading ? 'animate-spin' : ''}`} />} onClick={() => void sessions.reload()}>
            Muat ulang
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-2">
          <CalendarDays className="h-4 w-4 text-slate-400" />
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="w-auto" aria-label="Filter tanggal" />
        </div>
        <Button variant={all ? 'primary' : 'secondary'} size="sm" onClick={() => setAll((v) => !v)}>
          {all ? 'Tampilkan semua' : 'Hanya hari ini'}
        </Button>
        {date ? (
          <Button variant="ghost" size="sm" onClick={() => setDate('')}>
            Hapus filter tanggal
          </Button>
        ) : null}
      </div>

      {sessions.loading && !sessions.data ? <LoadingState label="Memuat sesi…" /> : null}
      {sessions.error ? <ErrorState message={sessions.error} onRetry={() => void sessions.reload()} /> : null}
      {sessions.data ? <SessionList items={sessions.data.items} onRefresh={() => void sessions.reload()} /> : null}
    </div>
  );
}
