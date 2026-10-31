import { useMemo, useState, type ReactNode } from 'react';
import { ArrowDown, ArrowUp, ChevronsUpDown } from 'lucide-react';
import { EmptyState, ErrorState, SkeletonRows } from './States';

export interface Column<T> {
  key: string;
  header: ReactNode;
  render?: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  align?: 'left' | 'center' | 'right';
  width?: string;
  className?: string;
  hideBelow?: 'sm' | 'md' | 'lg';
}

export interface DataTableProps<T extends { id: string }> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  error?: string | null;
  onRetry?: () => void;
  emptyTitle?: string;
  emptyDescription?: ReactNode;
  emptyAction?: ReactNode;
  toolbar?: ReactNode;
  footer?: ReactNode;
  onRowClick?: (row: T) => void;
  initialSort?: { key: string; dir: 'asc' | 'desc' };
  compact?: boolean;
  rowClassName?: (row: T) => string;
}

function alignClass(align?: 'left' | 'center' | 'right'): string {
  if (align === 'right') return 'text-right';
  if (align === 'center') return 'text-center';
  return 'text-left';
}

function hideClass(hide?: 'sm' | 'md' | 'lg'): string {
  if (hide === 'sm') return 'hidden sm:table-cell';
  if (hide === 'md') return 'hidden md:table-cell';
  if (hide === 'lg') return 'hidden lg:table-cell';
  return '';
}

export function DataTable<T extends { id: string }>({
  columns,
  rows,
  loading,
  error,
  onRetry,
  emptyTitle,
  emptyDescription,
  emptyAction,
  toolbar,
  footer,
  onRowClick,
  initialSort,
  compact,
  rowClassName,
}: DataTableProps<T>) {
  const [sort, setSort] = useState<{ key: string; dir: 'asc' | 'desc' } | null>(initialSort ?? null);

  const sorted = useMemo(() => {
    if (!sort) return rows;
    const column = columns.find((c) => c.key === sort.key);
    if (!column?.sortValue) return rows;
    return [...rows].sort((a, b) => {
      const av = column.sortValue!(a);
      const bv = column.sortValue!(b);
      if (av === bv) return 0;
      const cmp = av > bv ? 1 : -1;
      return sort.dir === 'asc' ? cmp : -cmp;
    });
  }, [rows, sort, columns]);

  const toggleSort = (column: Column<T>) => {
    if (!column.sortValue) return;
    setSort((prev) => {
      if (!prev || prev.key !== column.key) return { key: column.key, dir: 'asc' };
      if (prev.dir === 'asc') return { key: column.key, dir: 'desc' };
      return null;
    });
  };

  return (
    <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card">
      {toolbar ? <div className="border-b border-slate-100 p-3">{toolbar}</div> : null}
      <div className="thin-scroll max-h-[68vh] overflow-auto">
        {loading ? (
          <SkeletonRows />
        ) : error ? (
          <ErrorState message={error} onRetry={onRetry} />
        ) : sorted.length === 0 ? (
          <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
        ) : (
          <table className="table-base">
            <thead>
              <tr>
                {columns.map((column) => (
                  <th
                    key={column.key}
                    style={column.width ? { width: column.width } : undefined}
                    className={`${alignClass(column.align)} ${hideClass(column.hideBelow)} ${
                      column.sortValue ? 'cursor-pointer select-none' : ''
                    }`}
                    onClick={() => toggleSort(column)}
                    aria-sort={
                      sort?.key === column.key ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'
                    }
                  >
                    <span className="inline-flex items-center gap-1">
                      {column.header}
                      {column.sortValue ? (
                        sort?.key === column.key ? (
                          sort.dir === 'asc' ? (
                            <ArrowUp className="h-3 w-3" />
                          ) : (
                            <ArrowDown className="h-3 w-3" />
                          )
                        ) : (
                          <ChevronsUpDown className="h-3 w-3 opacity-40" />
                        )
                      ) : null}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((row) => (
                <tr
                  key={row.id}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={`${onRowClick ? 'cursor-pointer' : ''} ${rowClassName?.(row) ?? ''}`}
                >
                  {columns.map((column) => (
                    <td
                      key={column.key}
                      className={`${alignClass(column.align)} ${hideClass(column.hideBelow)} ${
                        compact ? '!py-1.5' : ''
                      } ${column.className ?? ''}`}
                    >
                      {column.render ? column.render(row) : String((row as Record<string, unknown>)[column.key] ?? '—')}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
      {footer ? <div className="border-t border-slate-100 px-3 py-2.5">{footer}</div> : null}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPageChange,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const start = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const end = Math.min(total, page * pageSize);
  const pages: number[] = [];
  const from = Math.max(1, page - 2);
  const to = Math.min(totalPages, page + 2);
  for (let i = from; i <= to; i++) pages.push(i);
  return (
    <div className="flex flex-wrap items-center justify-between gap-2 text-[12.5px] text-slate-500">
      <span>
        Menampilkan <strong className="text-slate-700">{start}</strong>–<strong className="text-slate-700">{end}</strong> dari{' '}
        <strong className="text-slate-700">{total}</strong> data
      </span>
      <div className="flex items-center gap-1">
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          disabled={page <= 1}
          onClick={() => onPageChange(page - 1)}
        >
          Sebelumnya
        </button>
        {pages.map((p) => (
          <button
            key={p}
            type="button"
            aria-current={p === page ? 'page' : undefined}
            className={`min-w-[28px] rounded-md border px-2 py-1 ${
              p === page
                ? 'border-brand-700 bg-brand-700 text-white'
                : 'border-slate-200 bg-white hover:bg-slate-50'
            }`}
            onClick={() => onPageChange(p)}
          >
            {p}
          </button>
        ))}
        <button
          type="button"
          className="rounded-md border border-slate-200 px-2 py-1 disabled:opacity-40"
          disabled={page >= totalPages}
          onClick={() => onPageChange(page + 1)}
        >
          Berikutnya
        </button>
      </div>
    </div>
  );
}
