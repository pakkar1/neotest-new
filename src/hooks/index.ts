import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiClientError } from '../services/api';

export function useDebouncedValue<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(timer);
  }, [value, delay]);
  return debounced;
}

export interface AsyncState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
  reload: () => Promise<void>;
  setData: (value: T) => void;
}

export function useAsync<T>(
  loader: () => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
): AsyncState<T> {
  const enabled = options.enabled ?? true;
  const [data, setDataState] = useState<T | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;
  const [version, setVersion] = useState(0);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    setLoading(true);
    setError(null);
    loaderRef
      .current()
      .then((result) => {
        if (active) setDataState(result);
      })
      .catch((err: unknown) => {
        if (!active) return;
        setError(err instanceof ApiClientError ? err.message : 'Gagal memuat data.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, version, enabled]);

  const reload = useCallback(async () => {
    setVersion((v) => v + 1);
  }, []);

  return { data, loading, error, reload, setData: (value: T) => setDataState(value) };
}

export function useLocalStorage<T>(key: string, initial: T): [T, (value: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : initial;
    } catch {
      return initial;
    }
  });
  const update = useCallback(
    (next: T) => {
      setValue(next);
      try {
        localStorage.setItem(key, JSON.stringify(next));
      } catch {
        // abaikan
      }
    },
    [key],
  );
  return [value, update];
}

/**
 * Sinkronisasi jam server. Timer ujian memakai offset terhadap jam server,
 * sehingga manipulasi jam perangkat tidak memperpanjang waktu ujian.
 */
export function useServerClock(serverIso: string | null): { now: () => number; offsetMs: number } {
  const offsetRef = useRef(0);
  const baseRef = useRef({ client: Date.now(), server: Date.now() });
  if (serverIso) {
    const server = new Date(serverIso).getTime();
    if (Number.isFinite(server) && server !== baseRef.current.server) {
      baseRef.current = { client: Date.now(), server };
      offsetRef.current = server - Date.now();
    }
  }
  const now = useCallback(() => {
    if (!offsetRef.current) return Date.now();
    return Date.now() + offsetRef.current;
  }, []);
  return { now, offsetMs: offsetRef.current };
}

export function usePageTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title ? `${title} — NeoTest` : 'NeoTest — Powered by Pakkar';
    return () => {
      document.title = previous;
    };
  }, [title]);
}

export function useOnlineStatus(): boolean {
  const [online, setOnline] = useState(() => navigator.onLine);
  useEffect(() => {
    const on = () => setOnline(true);
    const off = () => setOnline(false);
    window.addEventListener('online', on);
    window.addEventListener('offline', off);
    return () => {
      window.removeEventListener('online', on);
      window.removeEventListener('offline', off);
    };
  }, []);
  return online;
}

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const list = window.matchMedia(query);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    list.addEventListener('change', handler);
    return () => list.removeEventListener('change', handler);
  }, [query]);
  return matches;
}

export async function loadOptions(schoolId?: string) {
  return apiRequest<import('../shared/types').OptionsResponse>('/api/admin', {
    query: { resource: 'options', schoolId },
  });
}

export { useOptions, useServerTime, fetchOptions, invalidateOptions } from './options';
