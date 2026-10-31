import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { CheckCircle2, Info, TriangleAlert, XCircle, X } from 'lucide-react';

type ToastTone = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: number;
  tone: ToastTone;
  title: string;
  message?: string;
}

interface ToastApi {
  push: (item: { tone?: ToastTone; title: string; message?: string }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastApi | null>(null);

const TONE = {
  success: { icon: CheckCircle2, ring: 'border-green-200 bg-green-50 text-green-800', iconColor: 'text-green-600' },
  error: { icon: XCircle, ring: 'border-red-200 bg-red-50 text-red-800', iconColor: 'text-red-600' },
  warning: { icon: TriangleAlert, ring: 'border-orange-200 bg-orange-50 text-orange-800', iconColor: 'text-orange-600' },
  info: { icon: Info, ring: 'border-brand-200 bg-brand-50 text-brand-900', iconColor: 'text-brand-600' },
} as const;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: number) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const push = useCallback(
    ({ tone = 'info', title, message }: { tone?: ToastTone; title: string; message?: string }) => {
      const id = Date.now() + Math.random();
      setItems((prev) => [...prev.slice(-3), { id, tone, title, message }]);
      window.setTimeout(() => remove(id), tone === 'error' ? 7000 : 4500);
    },
    [remove],
  );

  const api = useMemo<ToastApi>(
    () => ({
      push,
      success: (title, message) => push({ tone: 'success', title, message }),
      error: (title, message) => push({ tone: 'error', title, message }),
      info: (title, message) => push({ tone: 'info', title, message }),
      warning: (title, message) => push({ tone: 'warning', title, message }),
    }),
    [push],
  );

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 top-3 z-[70] flex flex-col items-center gap-2 px-3 sm:inset-x-auto sm:right-4 sm:top-4 sm:items-end">
        {items.map((item) => {
          const tone = TONE[item.tone];
          const Icon = tone.icon;
          return (
            <div
              key={item.id}
              role="status"
              className={`toast-in pointer-events-auto flex w-full max-w-sm items-start gap-2.5 rounded-xl border px-3.5 py-3 shadow-pop ${tone.ring}`}
            >
              <Icon className={`mt-0.5 h-5 w-5 shrink-0 ${tone.iconColor}`} />
              <div className="min-w-0 flex-1">
                <p className="text-[13px] font-semibold">{item.title}</p>
                {item.message ? <p className="mt-0.5 text-[12px] leading-snug opacity-90">{item.message}</p> : null}
              </div>
              <button
                type="button"
                onClick={() => remove(item.id)}
                className="rounded p-1 opacity-60 hover:opacity-100"
                aria-label="Tutup notifikasi"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ToastApi {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast harus dipakai di dalam ToastProvider');
  return ctx;
}
