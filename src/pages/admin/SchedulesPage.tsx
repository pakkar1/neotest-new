import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarDays, CalendarPlus, Clock, Plus, Search, Trash2, Users } from 'lucide-react';
import { PageHeader } from '../../components/ui/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { Badge } from '../../components/ui/Badge';
import { DataTable, Pagination } from '../../components/ui/DataTable';
import { ConfirmDialog, Modal } from '../../components/ui/Modal';
import { Field, Input, Select } from '../../components/ui/Field';
import { useToast } from '../../components/ui/Toast';
import { useDebouncedValue, useOptions, usePageTitle } from '../../hooks';
import { apiRequest, ApiClientError } from '../../services/api';
import type { ExamForm, ExamSchedule, ExamType, Paginated } from '../../shared/types';

interface SessionDraft {
  code: string;
  roomId: string;
  proctorId: string;
  startsAt: string;
  endsAt: string;
}

function toIso(local: string): string {
  return local ? new Date(local).toISOString() : '';
}

export default function SchedulesPage() {
  usePageTitle('Jadwal Ujian');
  const toast = useToast();
  const navigate = useNavigate();
  const { options } = useOptions();
  const schoolId = options?.schoolId ?? '';
  const [rows, setRows] = useState<ExamSchedule[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [types, setTypes] = useState<ExamType[]>([]);
  const [forms, setForms] = useState<ExamForm[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [deleting, setDeleting] = useState<ExamSchedule | null>(null);
  const [head, setHead] = useState({
    examTypeId: '',
    formId: '',
    title: '',
    date: new Date().toISOString().slice(0, 10),
    startTime: '07:30',
    endTime: '09:30',
    durationMinutes: 90,
    classIds: [] as string[],
  });
  const [sessions, setSessions] = useState<SessionDraft[]>([
    { code: 'S1', roomId: '', proctorId: '', startsAt: '', endsAt: '' },
  ]);
  const debounced = useDebouncedValue(search, 350);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await apiRequest<Paginated<ExamSchedule>>('/api/exams', {
        query: { resource: 'schedules', page, pageSize: 20, q: debounced, status },
      });
      setRows(result.items);
      setTotal(result.total);
    } catch (err) {
      setError(err instanceof ApiClientError ? err.message : 'Gagal memuat jadwal.');
    } finally {
      setLoading(false);
    }
  }, [page, debounced, status]);

  useEffect(() => {
    void load();
  }, [load]);
  useEffect(() => {
    setPage(1);
  }, [debounced, status]);
  useEffect(() => {
    void Promise.all([
      apiRequest<Paginated<ExamType>>('/api/exams', { query: { resource: 'types', pageSize: 100 } }),
      apiRequest<Paginated<ExamForm>>('/api/exams', { query: { resource: 'forms', pageSize: 200 } }),
    ])
      .then(([typeRes, formRes]) => {
        setTypes(typeRes.items);
        setForms(formRes.items);
      })
      .catch(() => {
        setTypes([]);
        setForms([]);
      });
  }, []);

  const typeName = useMemo(() => new Map(types.map((t) => [t.id, t.name])), [types]);
  const formsForType = useMemo(
    () => forms.filter((f) => !head.examTypeId || f.examTypeId === head.examTypeId),
    [forms, head.examTypeId],
  );

  const openCreate = () => {
    const today = new Date();
    const iso = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
    setHead({
      examTypeId: '',
      formId: '',
      title: '',
      date: today.toISOString().slice(0, 10),
      startTime: '07:30',
      endTime: '09:30',
      durationMinutes: 90,
      classIds: [],
    });
    setSessions([
      { code: 'S1', roomId: '', proctorId: '', startsAt: iso(new Date(`${today.toISOString().slice(0, 10)}T07:30`)), endsAt: iso(new Date(`${today.toISOString().slice(0, 10)}T09:30`)) },
    ]);
    setCreateOpen(true);
  };

  const submit = async () => {
    if (!head.examTypeId || !head.formId || !head.title.trim() || head.classIds.length === 0) {
      toast.warning('Lengkapi jenis ujian, paket, judul, dan kelas peserta.');
      return;
    }
    if (sessions.some((s) => !s.roomId || !s.proctorId || !s.startsAt || !s.endsAt)) {
      toast.warning('Setiap sesi wajib memiliki ruang, proktor, waktu mulai, dan waktu selesai.');
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest<{ doc: ExamSchedule }>('/api/exams', {
        method: 'POST',
        query: { resource: 'schedules' },
        body: {
          ...head,
          schoolId,
          sessions: sessions.map((s) => ({
            code: s.code,
            roomId: s.roomId,
            proctorId: s.proctorId,
            startsAt: toIso(s.startsAt),
            endsAt: toIso(s.endsAt),
          })),
        },
      });
      toast.success('Jadwal dibuat dan peserta didistribusikan ke sesi.');
      setCreateOpen(false);
      navigate(`/admin/schedules/${res.doc.id}`);
    } catch (err) {
      toast.error('Gagal membuat jadwal', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await apiRequest('/api/exams', { method: 'DELETE', query: { resource: 'schedules', id: deleting.id } });
      toast.success('Jadwal dihapus.');
      setDeleting(null);
      await load();
    } catch (err) {
      toast.error('Tidak dapat menghapus', err instanceof ApiClientError ? err.message : undefined);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Jadwal & Sesi"
        description="Jadwal menghubungkan paket terbit, kelas peserta, ruang, dan proktor. Peserta dibagikan otomatis ke sesi sesuai kapasitas ruang."
        breadcrumb={[{ label: 'Beranda', to: '/admin' }, { label: 'Jadwal & Sesi' }]}
        actions={
          <Button icon={<CalendarPlus className="h-4 w-4" />} onClick={openCreate}>
            Buat jadwal
          </Button>
        }
      />

      <DataTable<ExamSchedule>
        columns={[
          {
            key: 'title',
            header: 'Jadwal',
            render: (row) => (
              <div>
                <Link to={`/admin/schedules/${row.id}`} className="text-[13.5px] font-semibold text-navy-900 hover:text-brand-700 hover:underline">
                  {row.title}
                </Link>
                <p className="text-[11.5px] text-slate-500">{typeName.get(row.examTypeId) ?? '—'}</p>
              </div>
            ),
          },
          {
            key: 'date',
            header: 'Waktu',
            hideBelow: 'sm',
            render: (row) => (
              <div className="flex items-center gap-1.5 text-[12.5px] text-slate-600">
                <CalendarDays className="h-3.5 w-3.5 text-slate-400" />
                {row.date} · {row.startTime}–{row.endTime}
              </div>
            ),
          },
          { key: 'sessions', header: 'Sesi', align: 'center', width: '80px', render: (row) => row.sessionCount },
          {
            key: 'participants',
            header: 'Peserta',
            align: 'center',
            width: '100px',
            hideBelow: 'md',
            render: (row) => (
              <span className="inline-flex items-center gap-1">
                <Users className="h-3.5 w-3.5 text-slate-400" />
                {row.participantCount}
              </span>
            ),
          },
          {
            key: 'status',
            header: 'Status',
            width: '120px',
            render: (row) => (
              <Badge tone={row.status === 'ongoing' ? 'success' : row.status === 'completed' ? 'navy' : row.status === 'cancelled' ? 'danger' : 'info'}>
                {row.status === 'ongoing' ? 'Berlangsung' : row.status === 'completed' ? 'Selesai' : row.status === 'cancelled' ? 'Dibatalkan' : 'Terjadwal'}
              </Badge>
            ),
          },
          {
            key: 'actions',
            header: 'Aksi',
            align: 'right',
            width: '80px',
            render: (row) => (
              <IconButton
                label="Hapus jadwal"
                variant="secondary"
                icon={<Trash2 className="h-3.5 w-3.5 text-red-600" />}
                onClick={() => setDeleting(row)}
              />
            ),
          },
        ]}
        rows={rows}
        loading={loading}
        error={error}
        onRetry={load}
        onRowClick={(row) => navigate(`/admin/schedules/${row.id}`)}
        emptyTitle="Belum ada jadwal"
        emptyDescription="Terbitkan paket ujian terlebih dahulu, lalu buat jadwal dan tugaskan proktor."
        emptyAction={
          <Button icon={<Plus className="h-4 w-4" />} onClick={openCreate}>
            Buat jadwal
          </Button>
        }
        toolbar={
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[200px] flex-1 sm:max-w-xs">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input className="pl-8" placeholder="Cari judul jadwal…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </div>
            <Select value={status} onChange={(e) => setStatus(e.target.value)} className="w-auto min-w-[140px]">
              <option value="">Semua status</option>
              <option value="preparation">Persiapan</option>
              <option value="scheduled">Terjadwal</option>
              <option value="ongoing">Berlangsung</option>
              <option value="completed">Selesai</option>
            </Select>
          </div>
        }
        footer={<Pagination page={page} pageSize={20} total={total} onPageChange={setPage} />}
      />

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        size="lg"
        title="Buat jadwal ujian"
        description="Peserta dari kelas terpilih akan dibagi otomatis ke sesi sesuai kapasitas ruang. Pastikan total kapasitas mencukupi."
        footer={
          <>
            <Button variant="secondary" onClick={() => setCreateOpen(false)} disabled={busy}>
              Batal
            </Button>
            <Button loading={busy} onClick={() => void submit()} icon={<Clock className="h-4 w-4" />}>
              Simpan jadwal
            </Button>
          </>
        }
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Jenis ujian" required>
            <Select
              value={head.examTypeId}
              onChange={(e) => setHead({ ...head, examTypeId: e.target.value, formId: '' })}
            >
              <option value="">Pilih…</option>
              {types.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Paket terbit" required hint="Hanya paket yang sudah diterbitkan yang dapat dijadwalkan.">
            <Select value={head.formId} onChange={(e) => setHead({ ...head, formId: e.target.value })}>
              <option value="">Pilih paket…</option>
              {formsForType.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.name} {f.status === 'published' ? `(v${f.currentVersion})` : '(belum terbit)'}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Judul jadwal" required className="sm:col-span-2">
            <Input value={head.title} onChange={(e) => setHead({ ...head, title: e.target.value })} placeholder="PTS Matematika Kelas 9 — Sesi Pagi" />
          </Field>
          <Field label="Tanggal" required>
            <Input type="date" value={head.date} onChange={(e) => setHead({ ...head, date: e.target.value })} />
          </Field>
          <Field label="Durasi pengerjaan (menit)" required>
            <Input type="number" min={5} max={360} value={head.durationMinutes} onChange={(e) => setHead({ ...head, durationMinutes: Number(e.target.value) })} />
          </Field>
          <Field label="Jam mulai" required>
            <Input type="time" value={head.startTime} onChange={(e) => setHead({ ...head, startTime: e.target.value })} />
          </Field>
          <Field label="Jam selesai" required>
            <Input type="time" value={head.endTime} onChange={(e) => setHead({ ...head, endTime: e.target.value })} />
          </Field>
          <Field label="Kelas peserta" required className="sm:col-span-2">
            <div className="grid max-h-32 grid-cols-2 gap-1 overflow-y-auto rounded-lg border border-slate-200 p-2 sm:grid-cols-4">
              {(options?.classes ?? []).map((c) => (
                <label key={c.id} className="flex cursor-pointer items-center gap-2 rounded px-1.5 py-1 text-[12.5px] hover:bg-slate-50">
                  <input
                    type="checkbox"
                    className="h-4 w-4 rounded border-slate-300 text-brand-700"
                    checked={head.classIds.includes(c.id)}
                    onChange={(e) =>
                      setHead({
                        ...head,
                        classIds: e.target.checked ? [...head.classIds, c.id] : head.classIds.filter((id) => id !== c.id),
                      })
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4">
          <div className="mb-2 flex items-center justify-between">
            <p className="text-[13px] font-semibold text-navy-900">Sesi & ruang</p>
            <Button
              size="sm"
              variant="secondary"
              icon={<Plus className="h-3.5 w-3.5" />}
              onClick={() =>
                setSessions([
                  ...sessions,
                  {
                    code: `S${sessions.length + 1}`,
                    roomId: '',
                    proctorId: '',
                    startsAt: sessions[0]?.startsAt ?? '',
                    endsAt: sessions[0]?.endsAt ?? '',
                  },
                ])
              }
            >
              Tambah sesi
            </Button>
          </div>
          <div className="space-y-2">
            {sessions.map((session, index) => (
              <div key={index} className="rounded-lg border border-slate-200 p-2.5">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-slate-600">Sesi {session.code}</span>
                  {sessions.length > 1 ? (
                    <button
                      type="button"
                      aria-label="Hapus sesi"
                      onClick={() => setSessions(sessions.filter((_, i) => i !== index))}
                      className="rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  ) : null}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <Select
                    value={session.roomId}
                    onChange={(e) => {
                      const next = [...sessions];
                      next[index] = { ...session, roomId: e.target.value };
                      setSessions(next);
                    }}
                    aria-label="Ruang"
                  >
                    <option value="">Pilih ruang…</option>
                    {(options?.rooms ?? []).map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} (kap. {r.capacity})
                      </option>
                    ))}
                  </Select>
                  <Select
                    value={session.proctorId}
                    onChange={(e) => {
                      const next = [...sessions];
                      next[index] = { ...session, proctorId: e.target.value };
                      setSessions(next);
                    }}
                    aria-label="Proktor"
                  >
                    <option value="">Pilih proktor…</option>
                    {(options?.proctors ?? []).map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </Select>
                  <Input
                    type="datetime-local"
                    value={session.startsAt}
                    aria-label="Mulai sesi"
                    onChange={(e) => {
                      const next = [...sessions];
                      next[index] = { ...session, startsAt: e.target.value };
                      setSessions(next);
                    }}
                  />
                  <Input
                    type="datetime-local"
                    value={session.endsAt}
                    aria-label="Selesai sesi"
                    onChange={(e) => {
                      const next = [...sessions];
                      next[index] = { ...session, endsAt: e.target.value };
                      setSessions(next);
                    }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(deleting)}
        title="Hapus jadwal?"
        message="Jadwal hanya dapat dihapus jika belum memiliki hasil ujian. Sesi dan peserta terkait akan dihapus."
        confirmLabel="Hapus jadwal"
        loading={busy}
        onCancel={() => setDeleting(null)}
        onConfirm={() => void remove()}
      />
    </div>
  );
}
