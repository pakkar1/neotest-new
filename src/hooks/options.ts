import { useCallback, useEffect, useRef, useState } from 'react';
import { apiRequest, ApiClientError } from '../services/api';
import type { OptionsResponse } from '../shared/types';

/**
 * Opsi referensi (kelas, mapel, tahun ajaran, ruang, proktor) untuk form admin.
 * Di-cache per sesi tab agar tidak menembak API berulang kali.
 */
let cache: OptionsResponse | null = null;
let inflight: Promise<OptionsResponse> | null = null;

export function invalidateOptions(): void {
  cache = null;
  inflight = null;
}

export function fetchOptions(): Promise<OptionsResponse> {
  if (cache) return Promise.resolve(cache);
  if (inflight) return inflight;
  inflight = apiRequest<OptionsResponse>('/api/admin', { query: { resource: 'options' } })
    .then((result) => {
      cache = result;
      return result;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useOptions() {
  const [data, setData] = useState<OptionsResponse | null>(cache);
  const [loading, setLoading] = useState(!cache);
  const [error, setError] = useState<string | null>(null);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchOptions();
      if (mounted.current) setData(result);
    } catch (err) {
      if (mounted.current) setError(err instanceof ApiClientError ? err.message : 'Gagal memuat opsi.');
    } finally {
      if (mounted.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    mounted.current = true;
    if (!cache) void load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  return { options: data, loading, error, reload: load };
}

export function useServerTime() {
  const [serverNow, setServerNow] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    apiRequest<{ serverNow: string }>('/api/time')
      .then((res) => {
        if (active) setServerNow(res.serverNow);
      })
      .catch(() => {
        if (active) setServerNow(new Date().toISOString());
      });
    return () => {
      active = false;
    };
  }, []);
  return serverNow;
}
