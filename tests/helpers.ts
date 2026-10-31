import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';

export interface CallOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  query?: Record<string, string>;
  body?: unknown;
  token?: string;
  headers?: Record<string, string>;
}

export interface CallResult {
  status: number;
  body: Record<string, unknown>;
  headers: Record<string, string | number | string[]>;
}

function buildQuery(query?: Record<string, string>): string {
  if (!query) return '';
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) params.set(key, value);
  const s = params.toString();
  return s ? `?${s}` : '';
}

/** Menjalankan Vercel Function handler dengan objek request/response tiruan. */
export async function callApi(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  options: CallOptions = {},
): Promise<CallResult> {
  const method = options.method ?? 'GET';
  const url = `/api/test${buildQuery(options.query)}`;
  const req = Object.assign(new EventEmitter(), {
    method,
    url,
    headers: {
      'content-type': 'application/json',
      ...(options.token ? { authorization: `Bearer ${options.token}` } : {}),
      ...(options.headers ?? {}),
    },
    body: method === 'GET' ? undefined : options.body ?? {},
    socket: { remoteAddress: '127.0.0.1' },
  }) as unknown as IncomingMessage;

  let payload = '';
  const headers: Record<string, string | number | string[]> = {};
  const res = {
    statusCode: 200,
    setHeader(name: string, value: string | number | string[]) {
      headers[name.toLowerCase()] = value;
      return res;
    },
    getHeader(name: string) {
      return headers[name.toLowerCase()];
    },
    end(chunk?: string | Buffer) {
      if (chunk) payload += chunk.toString();
    },
  } as unknown as ServerResponse;

  await handler(req, res);
  let body: Record<string, unknown> = {};
  try {
    body = payload ? (JSON.parse(payload) as Record<string, unknown>) : {};
  } catch {
    body = { raw: payload };
  }
  return { status: res.statusCode, body, headers };
}

export async function login(
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>,
  email: string,
  password = 'NeoTest#2026',
): Promise<{ token: string; user: Record<string, unknown> }> {
  const result = await callApi(handler, {
    method: 'POST',
    query: { action: 'login' },
    body: { email, password },
  });
  if (result.status !== 200) {
    throw new Error(`Login ${email} gagal: ${JSON.stringify(result.body)}`);
  }
  const token = result.body.token as string;
  const user = result.body.user as Record<string, unknown>;
  return { token, user };
}

export function errorCode(body: Record<string, unknown>): string | undefined {
  const error = body.error as { code?: string } | undefined;
  return error?.code;
}
