// The HTTP API of the shared archive, from a web Request to a Response. The same handler serves
// production (api/posters.js on Vercel, with Neon) and development (scripts/api-dev.mjs inside
// `npm run dev` and `npm run preview`, with PGlite).
//
//   GET    /api/posters       → PosterSummary[]
//   GET    /api/posters/:id   → Recipe, or 404
//   PUT    /api/posters/:id   → Recipe (inserts or replaces)
//   DELETE /api/posters/:id   → 204
//
// On Vercel, vercel.json rewrites /api/posters/:id to /api/posters?id=:id, so both forms are read.
import { checkRecipe, isPosterId, MAX_RECIPE_BYTES } from './recipe-check.js';

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' } });
const fail = (status, error) => json({ error }, status);

function posterId(url) {
  return url.searchParams.get('id') ?? url.pathname.match(/^\/api\/posters\/([^/]+)\/?$/)?.[1] ?? null;
}

export function createPostersHandler(getDb) {
  return async function handle(request) {
    const url = new URL(request.url);
    const id = posterId(url);
    try {
      if (id === null) {
        if (request.method !== 'GET') return fail(405, 'metodo non ammesso');
        return json(await getDb().list());
      }
      if (!isPosterId(id)) return fail(400, 'id del poster non valido');

      if (request.method === 'GET') {
        const recipe = await getDb().get(id);
        return recipe ? json(recipe) : fail(404, 'poster non trovato');
      }
      if (request.method === 'DELETE') {
        await getDb().remove(id);
        return new Response(null, { status: 204, headers: { 'Cache-Control': 'no-store' } });
      }
      if (request.method === 'PUT') {
        const text = await request.text();
        if (text.length > MAX_RECIPE_BYTES) return fail(413, 'poster troppo grande');
        let recipe;
        try {
          recipe = JSON.parse(text);
        } catch {
          return fail(400, 'JSON non valido');
        }
        const problem = checkRecipe(recipe, id);
        if (problem) return fail(422, problem);
        return json(await getDb().save(recipe));
      }
      return fail(405, 'metodo non ammesso');
    } catch (err) {
      console.error('[api/posters]', err);
      return fail(500, 'archivio non disponibile');
    }
  };
}
