import type { ReactNode } from 'react';

export type Tone = 'neutral' | 'info' | 'success' | 'warning' | 'danger' | 'navy' | 'violet';

const TONES: Record<Tone, string> = {
  neutral: 'bg-slate-100 text-slate-600',
  info: 'bg-brand-50 text-brand-800 ring-1 ring-inset ring-brand-200',
  success: 'bg-green-50 text-green-800 ring-1 ring-inset ring-green-200',
  warning: 'bg-orange-50 text-orange-800 ring-1 ring-inset ring-orange-200',
  danger: 'bg-red-50 text-red-800 ring-1 ring-inset ring-red-200',
  navy: 'bg-navy-50 text-navy-800 ring-1 ring-inset ring-navy-200',
  violet: 'bg-violet-50 text-violet-800 ring-1 ring-inset ring-violet-200',
};

export function Badge({ children, tone = 'neutral' }: { children: ReactNode; tone?: Tone }) {
  return <span className={`badge ${TONES[tone]}`}>{children}</span>;
}

const STATUS_MAP: Record<string, { label: string; tone: Tone }> = {
  scheduled: { label: 'Terjadwal', tone: 'info' },
  preparation: { label: 'Persiapan', tone: 'neutral' },
  open: { label: 'Berlangsung', tone: 'success' },
  closed: { label: 'Ditutup', tone: 'neutral' },
  ongoing: { label: 'Berlangsung', tone: 'success' },
  completed: { label: 'Selesai', tone: 'navy' },
  cancelled: { label: 'Dibatalkan', tone: 'danger' },
  in_progress: { label: 'Mengerjakan', tone: 'warning' },
  awaiting_submit: { label: 'Menunggu submit', tone: 'warning' },
  submitted: { label: 'Terkirim', tone: 'info' },
  finished: { label: 'Selesai', tone: 'success' },
  draft: { label: 'Draf', tone: 'neutral' },
  review: { label: 'Ditinjau', tone: 'warning' },
  ready: { label: 'Siap', tone: 'success' },
  published: { label: 'Dipublikasikan', tone: 'success' },
  archived: { label: 'Diarsipkan', tone: 'neutral' },
  final: { label: 'Final', tone: 'navy' },
  pending_grading: { label: 'Menunggu nilai', tone: 'warning' },
  expired: { label: 'Kedaluwarsa', tone: 'danger' },
  revoked: { label: 'Dicabut', tone: 'danger' },
  active: { label: 'Aktif', tone: 'success' },
  inactive: { label: 'Nonaktif', tone: 'neutral' },
  present: { label: 'Hadir', tone: 'success' },
  absent: { label: 'Tidak hadir', tone: 'danger' },
  excused: { label: 'Izin', tone: 'warning' },
  graded: { label: 'Dinilai', tone: 'navy' },
  manual: { label: 'Manual', tone: 'warning' },
  immediate: { label: 'Otomatis', tone: 'success' },
  after_session: { label: 'Setelah sesi', tone: 'info' },
  never: { label: 'Tidak dipublikasikan', tone: 'neutral' },
};

export function StatusBadge({ status, label }: { status: string; label?: string }) {
  const mapped = STATUS_MAP[status] ?? { label: status, tone: 'neutral' as Tone };
  return <Badge tone={mapped.tone}>{label ?? mapped.label}</Badge>;
}

export function attendanceLabel(value: string): { label: string; tone: Tone } {
  if (value === 'present') return { label: 'Hadir', tone: 'success' };
  if (value === 'excused') return { label: 'Izin', tone: 'warning' };
  if (value === 'absent') return { label: 'Tidak hadir', tone: 'danger' };
  return { label: value, tone: 'neutral' };
}
