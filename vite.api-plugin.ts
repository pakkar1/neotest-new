import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { Connect, Plugin, ViteDevServer, PreviewServer } from 'vite';
import { build } from 'esbuild';
import type { IncomingMessage, ServerResponse } from 'node:http';

/**
 * Menjalankan Vercel Functions (`api/*.ts`) langsung di Vite dev/preview server.
 * Handler dikompilasi dengan esbuild ke CommonJS di `.data/api-build/` lalu
 * di-import ulang bila ada berkas yang berubah.
 */
const ROUTES = [
  'auth',
  'config',
  'time',
  'health',
  'admin',
  'exams',
  'proctor',
  'attempts',
  'reports',
  'results',
];

interface CachedModule {
  mtime: number;
  handler: (req: IncomingMessage, res: ServerResponse) => Promise<void>;
}

const cache = new Map<string, CachedModule>();
const outDir = path.resolve(process.cwd(), '.data', 'api-build');

function newestMtime(dir: string, acc = 0): number {
  let latest = acc;
  if (!fs.existsSync(dir)) return latest;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) latest = newestMtime(full, latest);
    else if (/\.(ts|tsx|js|json)$/.test(entry.name)) latest = Math.max(latest, fs.statSync(full).mtimeMs);
  }
  return latest;
}

async function loadHandler(name: string): Promise<CachedModule['handler'] | null> {
  const entry = path.resolve(process.cwd(), 'api', `${name}.ts`);
  if (!fs.existsSync(entry)) return null;
  const mtime = Math.max(newestMtime(path.resolve(process.cwd(), 'api')), newestMtime(path.resolve(process.cwd(), 'src', 'shared')));
  const cached = cache.get(name);
  if (cached && cached.mtime >= mtime) return cached.handler;

  fs.mkdirSync(outDir, { recursive: true });
  // Nama unik per build: modul CJS di-cache Node berdasarkan path, sehingga
  // menimpa berkas yang sama tidak memuat kode baru tanpa restart server.
  const outfile = path.join(outDir, `${name}.${Math.round(mtime)}.cjs`);
  try {
    for (const entry of fs.readdirSync(outDir)) {
      if (entry.startsWith(`${name}.`) && entry.endsWith('.cjs') && path.join(outDir, entry) !== outfile) {
        fs.rmSync(path.join(outDir, entry), { force: true });
      }
    }
  } catch {
    // pembersihan bersifat best-effort
  }
  await build({
    entryPoints: [entry],
    outfile,
    bundle: true,
    platform: 'node',
    format: 'cjs',
    target: 'node20',
    packages: 'external',
    sourcemap: 'inline',
    logLevel: 'silent',
    define: { 'process.env.NODE_ENV': '"development"' },
  });
  const url = `${pathToFileURL(outfile).href}?t=${Date.now()}`;
  const mod = (await import(url)) as {
    default?: unknown;
    handler?: unknown;
  };
  const exported = (mod.default ?? mod.handler ?? mod) as
    | Record<string, unknown>
    | ((req: IncomingMessage, res: ServerResponse) => Promise<void>);
  const fn =
    typeof exported === 'function'
      ? exported
      : (exported.default as (req: IncomingMessage, res: ServerResponse) => Promise<void>);
  if (typeof fn !== 'function') {
    throw new Error(`Handler API ${name} tidak mengekspor fungsi default.`);
  }
  cache.set(name, { mtime, handler: fn });
  return fn;
}

function apiMiddleware(): Connect.NextHandleFunction {
  return async (req, res, next) => {
    const url = req.url ?? '/';
    const name = url.split('?')[0].split('/').filter(Boolean)[0] ?? '';
    if (!ROUTES.includes(name)) {
      next();
      return;
    }
    try {
      const handler = await loadHandler(name);
      if (!handler) {
        next();
        return;
      }
      await handler(req, res);
    } catch (err) {
      console.error(`[neotest] API ${name} gagal`, err);
      if (!res.headersSent) {
        res.statusCode = 500;
        res.setHeader('Content-Type', 'application/json');
      }
      res.end(
        JSON.stringify({
          error: {
            code: 'INTERNAL_ERROR',
            message: err instanceof Error ? err.message : 'Kesalahan server pengembangan.',
          },
        }),
      );
    }
  };
}

export function neotestApiPlugin(): Plugin {
  return {
    name: 'neotest-api',
    configureServer(server: ViteDevServer) {
      server.middlewares.use('/api', apiMiddleware());
    },
    configurePreviewServer(server: PreviewServer) {
      server.middlewares.use('/api', apiMiddleware());
    },
  };
}
