// Vercel Function: the shared archive on Neon Postgres. The Neon integration of the Vercel
// Marketplace sets DATABASE_URL (POSTGRES_URL is read too). See server/posters-api.js for the routes.
import { neon } from '@neondatabase/serverless';
import { createArchiveDb } from '../server/archive-db.js';
import { createPostersHandler } from '../server/posters-api.js';

let db = null;
function getDb() {
  const url = process.env.DATABASE_URL ?? process.env.POSTGRES_URL;
  if (!url) throw new Error('DATABASE_URL non impostata: collega un database Neon al progetto su Vercel');
  if (!db) {
    const sql = neon(url);
    db = createArchiveDb((text, params) => sql.query(text, params));
  }
  return db;
}

export default { fetch: createPostersHandler(getDb) };
