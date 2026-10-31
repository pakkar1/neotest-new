import { ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { ReactNode } from 'react';

export interface Crumb {
  label: string;
  to?: string;
}

export function PageHeader({
  title,
  description,
  breadcrumb,
  actions,
  badge,
}: {
  title: ReactNode;
  description?: ReactNode;
  breadcrumb?: Crumb[];
  actions?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="mb-5">
      {breadcrumb && breadcrumb.length > 0 ? (
        <nav aria-label="Breadcrumb" className="mb-2 flex flex-wrap items-center gap-1 text-[12px] text-slate-500">
          {breadcrumb.map((crumb, index) => (
            <span key={`${crumb.label}-${index}`} className="flex items-center gap-1">
              {index > 0 ? <ChevronRight className="h-3 w-3 text-slate-400" /> : null}
              {crumb.to ? (
                <Link to={crumb.to} className="hover:text-brand-700 hover:underline">
                  {crumb.label}
                </Link>
              ) : (
                <span className="text-slate-600">{crumb.label}</span>
              )}
            </span>
          ))}
        </nav>
      ) : null}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-bold leading-tight text-navy-900 sm:text-[22px]">{title}</h1>
            {badge}
          </div>
          {description ? (
            <p className="mt-1 max-w-3xl text-[13px] leading-relaxed text-slate-500">{description}</p>
          ) : null}
        </div>
        {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
      </div>
    </div>
  );
}
