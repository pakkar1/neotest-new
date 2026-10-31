import type { ReactNode } from 'react';

export interface TabItem {
  key: string;
  label: ReactNode;
  count?: number;
}

export function Tabs({
  items,
  active,
  onChange,
  className = '',
}: {
  items: TabItem[];
  active: string;
  onChange: (key: string) => void;
  className?: string;
}) {
  return (
    <div className={`flex gap-1 overflow-x-auto border-b border-slate-200 ${className}`} role="tablist">
      {items.map((item) => (
        <button
          key={item.key}
          role="tab"
          aria-selected={active === item.key}
          type="button"
          onClick={() => onChange(item.key)}
          className={`relative whitespace-nowrap px-3 py-2 text-[13px] font-medium transition ${
            active === item.key
              ? 'text-brand-800 after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand-700'
              : 'text-slate-500 hover:text-slate-700'
          }`}
        >
          {item.label}
          {typeof item.count === 'number' ? (
            <span className="ml-1.5 rounded-full bg-slate-100 px-1.5 py-0.5 text-[11px] text-slate-600">
              {item.count}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
