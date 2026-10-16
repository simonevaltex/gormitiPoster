// The shared archive, on every device: the same four async methods as local.js, over the site's
// API (api/posters.js on Vercel, scripts/api-dev.mjs in development). Errors carry the server's
// message, in Italian.
const BASE = `${import.meta.env.BASE_URL}api/posters`;

async function call(path, init) {
  const res = await fetch(`${BASE}${path}`, { cache: 'no-store', ...init });
  if (res.ok || res.status === 404) return res;
  let message = `errore ${res.status}`;
  try {
    message = (await res.json()).error ?? message;
  } catch {
    // not JSON: keep the status
  }
  throw new Error(message);
}

const path = (id) => `/${encodeURIComponent(id)}`;

export const apiAdapter = {
  async list() {
    return (await call('')).json();
  },
  async get(id) {
    const res = await call(path(id));
    return res.status === 404 ? null : res.json();
  },
  async save(recipe) {
    const res = await call(path(recipe.id), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(recipe) });
    return res.json();
  },
  async remove(id) {
    await call(path(id), { method: 'DELETE' });
  },
};
