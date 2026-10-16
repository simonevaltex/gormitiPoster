// The shared archive in Postgres: one row per poster, the whole recipe as jsonb. The same SQL runs on
// Neon in production and on PGlite in development and tests; `query(text, params)` returns the rows.
// The table is created on first use, so a new database needs no setup.

const SCHEMA = `CREATE TABLE IF NOT EXISTS posters (
  id text PRIMARY KEY,
  number integer NOT NULL,
  recipe jsonb NOT NULL,
  saved_at timestamptz NOT NULL DEFAULT now()
)`;

export function createArchiveDb(query) {
  let ready = null;
  const run = async (text, params) => {
    ready ??= query(SCHEMA).catch((err) => {
      ready = null; // try again on the next request
      throw err;
    });
    await ready;
    return query(text, params);
  };

  return {
    // PosterSummary[]: the recipe without attractors and elements, newest number first.
    async list() {
      const rows = await run(`SELECT recipe - 'attractors' - 'elements' AS summary FROM posters ORDER BY number DESC, saved_at DESC`);
      return rows.map((r) => r.summary);
    },
    async get(id) {
      const rows = await run('SELECT recipe FROM posters WHERE id = $1', [id]);
      return rows[0]?.recipe ?? null;
    },
    async save(recipe) {
      await run(
        `INSERT INTO posters (id, number, recipe) VALUES ($1, $2, $3::jsonb)
         ON CONFLICT (id) DO UPDATE SET number = EXCLUDED.number, recipe = EXCLUDED.recipe, saved_at = now()`,
        [recipe.id, recipe.number, JSON.stringify(recipe)],
      );
      return recipe;
    },
    async remove(id) {
      await run('DELETE FROM posters WHERE id = $1', [id]);
    },
  };
}
