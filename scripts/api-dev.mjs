// The shared archive's API inside `npm run dev` and `npm run preview`, with the same handler as the
// Vercel Function (server/posters-api.js). The database:
// - GORMITI_DB=memory → an empty PGlite in memory (npm run verify), whatever else is set;
// - DATABASE_URL (in the shell or in .env.local) → that Neon database, the real one;
// - otherwise PGlite, Postgres in WebAssembly, in .data/pglite (ignored by git), kept between runs.
// Preview also sends the headers of vercel.json, so the build is tried as Vercel serves it.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { loadEnv } from 'vite';
import { createArchiveDb } from '../server/archive-db.js';
import { createPostersHandler } from '../server/posters-api.js';

async function openDb(env, root, log) {
  const memory = env.GORMITI_DB === 'memory';
  const url = env.DATABASE_URL ?? env.POSTGRES_URL;
  if (url && !memory) {
    const { neon } = await import('@neondatabase/serverless');
    const sql = neon(url);
    log('archivio: database Neon di DATABASE_URL');
    return createArchiveDb((text, params) => sql.query(text, params));
  }
  const { PGlite } = await import('@electric-sql/pglite');
  const pg = new PGlite(memory ? undefined : join(root, '.data/pglite'));
  log(`archivio: PGlite ${memory ? 'in memoria' : 'in .data/pglite'}`);
  return createArchiveDb(async (text, params) => (await pg.query(text, params)).rows);
}

async function toRequest(req) {
  const chunks = [];
  if (req.method !== 'GET' && req.method !== 'HEAD') for await (const chunk of req) chunks.push(chunk);
  return new Request(`http://localhost${req.url}`, {
    method: req.method,
    headers: Object.entries(req.headers).filter(([, v]) => typeof v === 'string'),
    body: chunks.length ? Buffer.concat(chunks) : undefined,
  });
}

async function send(res, response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => res.setHeader(key, value));
  res.end(Buffer.from(await response.arrayBuffer()));
}

// vercel.json "headers" sources like "/(.*)" or "/_app/(.*)" as regular expressions.
function vercelHeaders(root) {
  const config = JSON.parse(readFileSync(join(root, 'vercel.json'), 'utf8'));
  return (config.headers ?? []).map(({ source, headers }) => ({
    test: new RegExp(`^${source.split('(.*)').map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('.*')}$`),
    headers,
  }));
}

export function postersApi() {
  const mount = (server, { withHeaders }) => {
    const { root, mode, logger } = server.config;
    const env = { ...loadEnv(mode, root, ''), ...process.env };
    let dbPromise = null;
    const getDb = () => (dbPromise ??= openDb(env, root, (msg) => logger.info(msg)));
    let db = null;
    const handle = createPostersHandler(() => db);
    const rules = withHeaders ? vercelHeaders(root) : [];
    server.middlewares.use(async (req, res, next) => {
      const path = req.url.split('?')[0];
      for (const rule of rules) if (rule.test.test(path)) for (const { key, value } of rule.headers) res.setHeader(key, value);
      if (path !== '/api/posters' && !path.startsWith('/api/posters/')) return next();
      try {
        db ??= await getDb();
        await send(res, await handle(await toRequest(req)));
      } catch (err) {
        logger.error(`[api/posters] ${err.stack ?? err}`);
        res.statusCode = 500;
        res.end();
      }
    });
  };
  return {
    name: 'gormiti-posters-api',
    configureServer: (server) => mount(server, { withHeaders: false }),
    configurePreviewServer: (server) => mount(server, { withHeaders: true }),
  };
}
