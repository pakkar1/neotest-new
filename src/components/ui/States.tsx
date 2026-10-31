import type { ReactNode } from 'react';
import { Inbox, Loader2, RefreshCw, AlertCircle } from 'lucide-react';
import { Button } from './Button';

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <Loader2 className={`animate-spin text-brand-700 ${className}`} aria-hidden />;
}

export function LoadingState({ label = 'Memuat data…' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-14 text-slate-500">
      <Spinner className="h-7 w-7" />
      <p className="text-sm">{label}</p>
    </div>
  );
}

export function EmptyState({
  title = 'Belum ada data',
  description,
  action,
  icon,
}: {
  title?: string;
  description?: ReactNode;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 px-6 py-14 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-slate-100 text-slate-400">
        {icon ?? <Inbox className="h-6 w-6" />}
      </div>
      <h3 className="text-sm font-semibold text-slate-700">{title}</h3>
      {description ? <p className="max-w-md text-[13px] text-slate-500">{description}</p> : null}
      {action ? <div className="mt-2">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  message = 'Terjadi kesalahan saat memuat data.',
  onRetry,
}: {
  message?: string;
  onRetry?: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-12 text-center">
      <div className="grid h-12 w-12 place-items-center rounded-2xl bg-red-50 text-red-500">
        <AlertCircle className="h-6 w-6" />
      </div>
      <p className="max-w-md text-sm text-slate-600">{message}</p>
      {onRetry ? (
        <Button variant="secondary" size="sm" icon={<RefreshCw className="h-3.5 w-3.5" />} onClick={onRetry}>
          Coba lagi
        </Button>
      ) : null}
    </div>
  );
}

export function SkeletonRows({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-2 p-4">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="h-3 w-1/6 animate-pulse rounded bg-slate-200" />
          <div className="h-3 flex-1 animate-pulse rounded bg-slate-100" />
          <div className="h-3 w-1/5 animate-pulse rounded bg-slate-100" />
        </div>
      ))}
    </div>
  );
}

export function FullPageLoader({ label = 'Memuat…' }: { label?: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-3 bg-[#f5f7fb] text-slate-500">
      <Spinner className="h-8 w-8" />
      <p className="text-sm">{label}</p>
    </div>
  );
}
