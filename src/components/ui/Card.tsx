import type { ReactNode } from 'react';
import { TrendingUp } from 'lucide-react';
import type { Tone } from './Badge';

export function Card({
  children,
  className = '',
  padded = true,
}: {
  children: ReactNode;
  className?: string;
  padded?: boolean;
}) {
  return <div className={`card ${padded ? 'p-5' : ''} ${className}`}>{children}</div>;
}

export function CardHeader({
  title,
  description,
  actions,
  className = '',
}: {
  title: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  className?: string;
}) {
  return (
    <div className={`flex flex-wrap items-start justify-between gap-3 ${className}`}>
      <div>
        <h3 className="text-[15px] font-semibold text-navy-900">{title}</h3>
        {description ? <p className="mt-0.5 text-[13px] text-slate-500">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

const TONE_ICON: Record<string, string> = {
  navy: 'bg-navy-50 text-navy-700',
  info: 'bg-brand-50 text-brand-700',
  success: 'bg-green-50 text-green-700',
  warning: 'bg-orange-50 text-orange-700',
  danger: 'bg-red-50 text-red-700',
  neutral: 'bg-slate-100 text-slate-600',
};

export function StatCard({
  label,
  value,
  hint,
  tone = 'navy',
  icon,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  tone?: Tone | string;
  icon?: ReactNode;
}) {
  return (
    <div className="card flex items-start justify-between gap-3 p-4">
      <div className="min-w-0">
        <p className="truncate text-[12px] font-medium uppercase tracking-wide text-slate-500">
          {label}
        </p>
        <p className="mt-1 text-2xl font-bold leading-tight text-navy-900">{value}</p>
        {hint ? <p className="mt-1 line-clamp-2 text-[12px] text-slate-500">{hint}</p> : null}
      </div>
      <div className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${TONE_ICON[tone] ?? TONE_ICON.navy}`}>
        {icon ?? <TrendingUp className="h-5 w-5" />}
      </div>
    </div>
  );
}

export function InfoRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 py-2 text-sm last:border-0">
      <span className="shrink-0 text-slate-500">{label}</span>
      <span className="text-right font-medium text-slate-800">{value}</span>
    </div>
  );
}
