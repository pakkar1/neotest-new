import type { IncomingMessage, ServerResponse } from 'node:http';
import { ApiError, asApiError, errors } from './errors';

export type NodeRequest = IncomingMessage & {
  body?: unknown;
  query?: Record<string, string | string[] | undefined>;
};
export type NodeResponse = ServerResponse & {
  status: (code: number) => NodeResponse;
  json: (body: unknown) => void;
  send: (body: unknown) => void;
};

export interface ApiRequest {
  method: string;
  path: string;
  query: Record<string, string>;
  headers: Record<string, string>;
  body: unknown;
  ip: string;
  userAgent: string;
}

export interface ApiResponse {
  status?: number;
  body?: unknown;
  headers?: Record<string, string>;
  /** Respons non-JSON (mis. CSV untuk ekspor laporan). */
  raw?: string;
  contentType?: string;
}

const MAX_BODY_BYTES = 6 * 1024 * 1024;

function headerValue(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v.join(', ');
  return v ?? '';
}

function readHeader(req: NodeRequest, name: string): string {
  const v = req.headers[name.toLowerCase()];
  return headerValue(v as string | string[] | undefined);
}

function parseQuery(url: string): Record<string, string> {
  const out: Record<string, string> = {};
  const idx = url.indexOf('?');
  if (idx === -1) return out;
  const params = new URLSearchParams(url.slice(idx + 1));
  params.forEach((v, k) => {
    out[k] = v;
  });
  return out;
}

export function clientIp(req: NodeRequest): string {
  const forwarded = readHeader(req, 'x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return readHeader(req, 'x-real-ip') || req.socket?.remoteAddress || 'unknown';
}

function corsHeaders(origin: string | undefined): Record<string, string> {
  const allowed = (process.env.NEOTEST_ALLOWED_ORIGINS ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  const headers: Record<string, string> = {
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'GET,POST,PATCH,DELETE,OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, Idempotency-Key',
    'Access-Control-Max-Age': '600',
  };
  if (!origin) return headers;
  const sameOrigin = origin === process.env.NEOTEST_PUBLIC_ORIGIN;
  if (sameOrigin || allowed.includes(origin) || allowed.includes('*')) {
    headers['Access-Control-Allow-Origin'] = origin;
  }
  return headers;
}

async function readBody(req: NodeRequest): Promise<unknown> {
  if (req.body !== undefined && req.body !== null) {
    if (typeof req.body === 'string') {
      try {
        return JSON.parse(req.body);
      } catch {
        throw errors.validation('Body bukan JSON yang valid.');
      }
    }
    return req.body;
  }
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    const buf = typeof chunk === 'string' ? Buffer.from(chunk) : chunk;
    size += buf.length;
    if (size > MAX_BODY_BYTES) throw new ApiError('VALIDATION_ERROR', 'Payload terlalu besar.', 413);
    chunks.push(buf);
  }
  if (chunks.length === 0) return {};
  const raw = Buffer.concat(chunks).toString('utf8');
  if (!raw.trim()) return {};
  try {
    return JSON.parse(raw);
  } catch {
    throw errors.validation('Body bukan JSON yang valid.');
  }
}

export type Handler = (req: ApiRequest) => Promise<ApiResponse | void>;

/**
 * Membungkus handler Node/Vercel: parsing body, CORS, error mapping,
 * dan penyembunyian stack trace pada respons produksi.
 */
export function endpoint(handler: Handler, options: { allowMethods?: string[] } = {}) {
  return async function handle(req: NodeRequest, res: NodeResponse): Promise<void> {
    const origin = readHeader(req, 'origin') || undefined;
    const cors = corsHeaders(origin);
    for (const [k, v] of Object.entries(cors)) res.setHeader(k, v);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'same-origin');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const method = (req.method ?? 'GET').toUpperCase();
    const url = req.url ?? '/';

    try {
      if (options.allowMethods && !options.allowMethods.includes(method)) {
        res.setHeader('Allow', options.allowMethods.join(', '));
        throw new ApiError('VALIDATION_ERROR', `Metode ${method} tidak diizinkan.`, 405);
      }
      const apiReq: ApiRequest = {
        method,
        path: url.split('?')[0],
        query: parseQuery(url),
        headers: Object.fromEntries(
          Object.entries(req.headers).map(([k, v]) => [k, headerValue(v as string | string[] | undefined)]),
        ),
        body: method === 'GET' || method === 'HEAD' ? {} : await readBody(req),
        ip: clientIp(req),
        userAgent: readHeader(req, 'user-agent'),
      };
      const result = (await handler(apiReq)) ?? {};
      const status = result.status ?? 200;
      res.statusCode = status;
      res.setHeader(
        'Content-Type',
        result.raw !== undefined
          ? result.contentType ?? 'text/plain; charset=utf-8'
          : 'application/json; charset=utf-8',
      );
      res.setHeader('Cache-Control', 'no-store');
      for (const [k, v] of Object.entries(result.headers ?? {})) res.setHeader(k, v);
      res.end(result.raw !== undefined ? result.raw : JSON.stringify(result.body ?? { ok: true }));
    } catch (err) {
      const apiErr = asApiError(err);
      if (apiErr.status >= 500 && !(err instanceof ApiError)) {
        console.error('[neotest] unhandled error', err instanceof Error ? err.message : err);
      }
      if (apiErr.retryAfter) res.setHeader('Retry-After', String(apiErr.retryAfter));
      res.statusCode = apiErr.status;
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      res.end(
        JSON.stringify({
          error: {
            code: apiErr.code,
            message: apiErr.message,
            details: apiErr.details ?? null,
          },
        }),
      );
    }
  };
}

export function json(body: unknown, status = 200, headers?: Record<string, string>): ApiResponse {
  return { status, body, headers };
}
