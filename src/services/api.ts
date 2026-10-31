/**
 * Klien API NeoTest.
 *
 * Token sesi aplikasi disimpan di sessionStorage (bukan localStorage) dan
 * tidak pernah dimasukkan ke URL. Token ujian (mulai/submit) hanya hidup di
 * memori komponen dan tidak pernah dipersistensi.
 */
const TOKEN_KEY = 'neotest.session';

export class ApiClientError extends Error {
  readonly code: string;
  readonly status: number;
  readonly details: unknown;

  constructor(message: string, code: string, status: number, details?: unknown) {
    super(message);
    this.name = 'ApiClientError';
    this.code = code;
    this.status = status;
    this.details = details;
  }
}

let memoryToken: string | null = null;
let unauthorizedHandler: (() => void) | null = null;

export function getToken(): string | null {
  if (memoryToken) return memoryToken;
  try {
    memoryToken = sessionStorage.getItem(TOKEN_KEY);
  } catch {
    memoryToken = null;
  }
  return memoryToken;
}

export function setToken(token: string | null): void {
  memoryToken = token;
  try {
    if (token) sessionStorage.setItem(TOKEN_KEY, token);
    else sessionStorage.removeItem(TOKEN_KEY);
  } catch {
    // sessionStorage dapat diblokir; token tetap di memori.
  }
}

export function onUnauthorized(fn: (() => void) | null): void {
  unauthorizedHandler = fn;
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const params = new URLSearchParams();
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      params.set(key, String(value));
    }
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  let response: Response;
  try {
    response = await fetch(buildUrl(path, options.query), {
      method: options.method ?? 'GET',
      headers,
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: options.signal,
    });
  } catch (err) {
    if ((err as Error)?.name === 'AbortError') throw err;
    throw new ApiClientError(
      'Tidak dapat terhubung ke server. Periksa koneksi internet Anda.',
      'NETWORK_ERROR',
      0,
    );
  }

  if (response.status === 401 && unauthorizedHandler) unauthorizedHandler();

  const contentType = response.headers.get('content-type') ?? '';
  if (!contentType.includes('application/json')) {
    const text = await response.text();
    if (!response.ok) {
      throw new ApiClientError(text || 'Permintaan gagal.', 'INTERNAL_ERROR', response.status);
    }
    return text as unknown as T;
  }

  const payload = (await response.json().catch(() => ({}))) as {
    error?: { code?: string; message?: string; details?: unknown };
  };
  if (!response.ok) {
    throw new ApiClientError(
      payload.error?.message ?? 'Permintaan gagal diproses.',
      payload.error?.code ?? 'INTERNAL_ERROR',
      response.status,
      payload.error?.details,
    );
  }
  return payload as T;
}

export function apiUrl(path: string, query?: RequestOptions['query']): string {
  return buildUrl(path, query);
}

export async function downloadCsv(path: string, query: Record<string, string>): Promise<void> {
  const token = getToken();
  const response = await fetch(buildUrl(path, query), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!response.ok) {
    let message = 'Ekspor gagal.';
    try {
      const body = (await response.json()) as { error?: { message?: string } };
      message = body.error?.message ?? message;
    } catch {
      // abaikan
    }
    throw new ApiClientError(message, 'EXPORT_ERROR', response.status);
  }
  const blob = await response.blob();
  const disposition = response.headers.get('content-disposition') ?? '';
  const match = /filename="([^"]+)"/.exec(disposition);
  const filename = match?.[1] ?? 'neotest-export.csv';
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

/* ------------------------------------------------------------------ */
/* Helper endpoint                                                     */
/* ------------------------------------------------------------------ */

export const endpoints = {
  config: () => apiRequest<import('../shared/types').AppConfig>('/api/config'),
  time: () => apiRequest<{ serverNow: string }>('/api/time'),
};
