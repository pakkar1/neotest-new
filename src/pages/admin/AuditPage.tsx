import { useCallback, useEffect, useState } from 'react';
import { RefreshCw, ScrollText, Search } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { Input, Select } from '../../components/ui/Field';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { useDebouncedValue, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import { formatDateTimeId } from '../../shared/time';
import type { AuditLog, Paginated } from '../../shared/types';

const ACTION_LABEL: Record<string, string> = {
  'auth.login.success': 'Masuk aplikasi',
  'auth.login.failed': 'Login gagal',
  'auth.logout': 'Keluar',
  'session.open': 'Membuka sesi',
  'session.close': 'Menutup sesi',
  'token.issue': 'Menerbitkan token',
  'token.revoke': 'Mencabut token',
  'token.validate.failed': 'Token gagal divalidasi',
  'attempt.start': 'Mulai mengerjakan',
  'attempt.submit': 'Mengirim jawaban',
  'attempt.expire': 'Finalisasi paksa',
  'response.override': 'Perubahan jawaban oleh staf',
  'participant.move': 'Memindahkan peserta',
  'attendance.mark': 'Menandai kehadiran',
  'result.grade.change': 'Mengubah nilai',
  'result.publish': 'Mempublikasikan hasil',
  'form.publish': 'Menerbitkan paket',
  'user.role.change': 'Mengubah peran',
  'user.create': 'Membuat akun',
  'user.delete': 'Menghapus akun',
  'student.import': 'Impor siswa',
  'demo.reset': 'Reset demo',
  'settings.change': 'Mengubah pengaturan',
  'incident.create': 'Mencatat insiden',
  'report.print': 'Mencetak dokumen',
};

export default function AuditPage() {
  usePageTitle('Audit Log');
  const [rows, setRows] = useState<AuditLog[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [actor, setActor] = useState('');
  const [action, setAction] = useState('');
  const debouncedSearch = useDebouncedValue(search, 350);
  const debouncedActor = useDebouncedValue(actor, 350);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await apiRequest<Paginated<AuditLog>>('/api/admin', {
        query: { resource: 'audit', page, pageSize: 25, q: debouncedSearch, actor: debouncedActor, action },
      });
      setRows(res.items);
      setTotal(res.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal memuat audit log.');
    } finally {
      setLoading(false);
    }
  }, [page, debouncedSearch, debouncedActor, action]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => setPage(1), [debouncedSearch, debouncedActor, action]);

  return (
    <div>
      <PageHeader
        title="Audit Log"
        description="Jejak aktivitas penting: login, token, pengerjaan, perubahan nilai, penerbitan paket, dan perubahan pengaturan. Log tidak dapat diubah dari antarmuka."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Audit Log' }]}
        actions={
          <Button variant="secondary" icon={<RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />} onClick={() => void load()}>
            Muat ulang
          </Button>
        }
      />

      <DataTable<AuditLog>
        columns={[
          {
            key: 'createdAt',
            header: 'Waktu',
            width: '170px',
            sortValue: (row) => row.createdAt,
            render: (row) => <span className="text-[12px] text-slate-600">{formatDateTimeId(row.createdAt)}</span>,
          },
          {
            key: 'action',
            header: 'Aksi',
            render: (row) => (
              <div>
                <Badge tone={row.action.includes('failed') ? 'danger' : row.action.includes('publish') ? 'success' : 'info'}>
                  {ACTION_LABEL[row.action] ?? row.action}
                </Badge>
                <p className="mt-0.5 font-mono text-[10.5px] text-slate-400">{row.action}</p>
              </div>
            ),
          },
          {
            key: 'actorName',
            header: 'Pelaku',
            hideBelow: 'sm',
            render: (row) => (
              <div>
                <p className="text-[12.5px] font-medium text-slate-800">{row.actorName || 'Sistem'}</p>
                <p className="text-[10.5px] uppercase tracking-wide text-slate-400">{row.actorRole}</p>
              </div>
            ),
          },
          {
            key: 'targetType',
            header: 'Objek',
            hideBelow: 'md',
            render: (row) => (
              <span className="text-[11.5px] text-slate-500">
                {row.targetType}
                <span className="block font-mono text-[10.5px] text-slate-400">{row.targetId}</span>
              </span>
            ),
          },
          {
            key: 'ip',
            header: 'IP',
            hideBelow: 'lg',
            render: (row) => <span className="font-mono text-[11px] text-slate-500">{row.ip || '—'}</span>,
          },
          {
            key: 'meta',
            header: 'Detail',
            hideBelow: 'lg',
            render: (row) =>
              row.meta ? (
                <span className="block max-w-[260px] truncate font-mono text-[10.5px] text-slate-400" title={JSON.stringify(row.meta)}>
                  {JSON.stringify(row.meta)}
                </span>
              ) : (
                '—'
              ),
          },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        emptyTitle="Belum ada aktivitas"
        emptyDescription="Audit log terisi otomatis oleh server setiap ada aksi penting."
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" placeholder="Cari pelaku…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Input
              className="w-auto min-w-[170px]"
              placeholder="Filter pelaku"
              value={actor}
              onChange={(e) => setActor(e.target.value)}
            />
            <Select value={action} onChange={(e) => setAction(e.target.value)} className="w-auto min-w-[170px]">
              <option value="">Semua aksi</option>
              {Object.entries(ACTION_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </Select>
            <IconButton label="Muat ulang" variant="secondary" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={() => void load()} />
          </div>
        }
        footer={<Pagination page={page} pageSize={25} total={total} onPageChange={setPage} />}
      />

      <div className="mt-3 flex items-start gap-2 rounded-xl border border-slate-200 bg-white px-4 py-3 text-[12px] text-slate-500">
        <ScrollText className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        Audit log ditulis di sisi server dengan waktu server. Pada mode Firebase, koleksi <code>auditLogs</code> hanya
        dapat ditulis oleh Admin SDK dan tidak dapat diubah pengguna.
      </div>
    </div>
  );
}
