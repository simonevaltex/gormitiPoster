import { it, expect, beforeEach, vi } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { createArchiveDb } from '../server/archive-db.js';
import { createPostersHandler } from '../server/posters-api.js';
import { checkRecipe } from '../server/recipe-check.js';

// The same SQL as Neon, on Postgres in WebAssembly, empty for every test.
let handle;
beforeEach(() => {
  const pg = new PGlite();
  const db = createArchiveDb(async (text, params) => (await pg.query(text, params)).rows);
  handle = createPostersHandler(() => db);
});

const request = (path, init) => handle(new Request(`http://localhost${path}`, init));
const put = (id, body) =>
  request(`/api/posters/${id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: typeof body === 'string' ? body : JSON.stringify(body) });

const recipe = (id, number, extra = {}) => ({
  version: 1,
  id,
  number,
  date: '2026-10-15T14:03:00.000Z',
  colors: { carta: '#ffffff', inchiostro: '#ff5500' },
  bleed: 3,
  settings: { restitution: 0.05, friction: 0.8, solidAttractors: true },
  attractors: [
    { id: 'a1', type: 'segment', x1: 15, y1: 405, x2: 282, y2: 405, strength: 50 },
    { id: 'a2', type: 'point', x: 148.5, y: 210.25, strength: 73 },
  ],
  elements: [
    { id: 'e3', type: 'testo', params: { text: 'Sommo\nLuminescente', weight: 'bold', capHeight: 40 }, x: 101.234567891234, y: 380.0000001, angle: -0.000123456789 },
    { id: 'e4', type: 'numero', params: { diameter: 22 }, x: 250, y: 30, angle: 1e-17 },
  ],
  thumbnail: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 297 420"><rect width="297" height="420"/></svg>',
  ...extra,
});

it('starts empty, saves a poster and gives it back exactly as it was, floats included', async () => {
  expect(await (await request('/api/posters')).json()).toEqual([]);
  const r = recipe('pabc', 1);
  const saved = await put('pabc', r);
  expect(saved.status).toBe(200);
  const back = await (await request('/api/posters/pabc')).json();
  expect(back).toEqual(r); // jsonb reorders the keys, but every value comes back to the last digit
  expect(back.elements[0].x).toBe(101.234567891234);
});

it('lists summaries without attractors and elements, highest number first', async () => {
  await put('p1', recipe('p1', 1));
  await put('p3', recipe('p3', 3));
  await put('p2', recipe('p2', 2));
  const list = await (await request('/api/posters')).json();
  expect(list.map((p) => p.number)).toEqual([3, 2, 1]);
  expect(list[0]).not.toHaveProperty('attractors');
  expect(list[0]).not.toHaveProperty('elements');
  expect(list[0]).toMatchObject({ id: 'p3', colors: { carta: '#ffffff', inchiostro: '#ff5500' }, thumbnail: expect.stringMatching(/^<svg/) });
});

it('saving the same id replaces the poster', async () => {
  await put('p1', recipe('p1', 1));
  await put('p1', recipe('p1', 7, { bleed: 0 }));
  const list = await (await request('/api/posters')).json();
  expect(list).toHaveLength(1);
  expect(list[0]).toMatchObject({ number: 7, bleed: 0 });
});

it('reads the id from the query too, as after the vercel.json rewrite', async () => {
  await put('p1', recipe('p1', 1));
  expect((await request('/api/posters?id=p1')).status).toBe(200);
  expect((await request('/api/posters?id=nope')).status).toBe(404);
});

it('deletes a poster', async () => {
  await put('p1', recipe('p1', 1));
  expect((await request('/api/posters/p1', { method: 'DELETE' })).status).toBe(204);
  expect((await request('/api/posters/p1')).status).toBe(404);
  expect(await (await request('/api/posters')).json()).toEqual([]);
});

it('refuses what the site would never send, with a message in Italian', async () => {
  const refused = async (res, status) => {
    expect(res.status).toBe(status);
    return (await res.json()).error;
  };
  expect(await refused(await put('p1', '{not json'), 400)).toBe('JSON non valido');
  expect(await refused(await put('p1', recipe('p2', 1)), 422)).toBe('id del poster non valido');
  expect(await refused(await put('p1', recipe('p1', 1, { colors: { carta: 'red', inchiostro: '#000000' } })), 422)).toBe('colori non validi');
  expect(await refused(await put('p1', recipe('p1', 1, { thumbnail: 'x'.repeat(2_000_001) })), 413)).toBe('poster troppo grande');
  expect(await refused(await request('/api/posters/a%20b'), 400)).toBe('id del poster non valido');
  expect(await refused(await request('/api/posters', { method: 'POST', body: '{}' }), 405)).toBe('metodo non ammesso');
  expect(await (await request('/api/posters')).json()).toEqual([]);
});

it('answers 500 without details when the database fails', async () => {
  const error = vi.spyOn(console, 'error').mockImplementation(() => {});
  const broken = createPostersHandler(() => ({ list: () => Promise.reject(new Error('connection refused')) }));
  const res = await broken(new Request('http://localhost/api/posters'));
  expect(res.status).toBe(500);
  expect(await res.json()).toEqual({ error: 'archivio non disponibile' });
  error.mockRestore();
});

it('checks every attractor and element', () => {
  expect(checkRecipe(recipe('p1', 1), 'p1')).toBeNull();
  expect(checkRecipe(recipe('p1', 0), 'p1')).toBe('numero del poster non valido');
  expect(checkRecipe(recipe('p1', 1, { attractors: [{ id: 'a1', type: 'point', x: 1, y: Infinity, strength: 50 }] }), 'p1')).toBe('attrattore a1: coordinate non valide');
  expect(checkRecipe(recipe('p1', 1, { attractors: [{ id: 'a1', type: 'point', x: 1, y: 2, strength: 500 }] }), 'p1')).toBe('attrattore a1: forza fuori da 1-100');
  expect(checkRecipe(recipe('p1', 1, { elements: [{ id: 'e1', type: 'script', params: {}, x: 0, y: 0, angle: 0 }] }), 'p1')).toBe('elemento e1: tipo sconosciuto');
  expect(checkRecipe(recipe('p1', 1, { thumbnail: '<img src=x onerror=alert(1)>' }), 'p1')).toBe('miniatura non valida');
});
