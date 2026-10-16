import { it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFigureSvg, buildFigure, FIGURE_PAPER_MM } from '../src/svg-figure.js';
import { OUTLINE_MM } from '../src/constants.js';
import { buildElement } from '../src/elements/index.js';
import { POPOLO_WORD_SCALE, popoloLayout } from '../src/elements/popolo.js';
import { layoutText } from '../src/text.js';
import { scanAssets } from '../scripts/assets-manifest.mjs';
import { loadAssets } from '../src/figures.js';
import { screenPaint } from '../src/paint.js';
import { convexHull, pointInPolygon } from '../src/geometry.js';
import { loadFontsFromDisk } from './helpers.js';

// A word like Simone's: white letters (a 140 × 70 block) over a black outline and shadow.
const WORD =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 150 80"><defs><style>.cls-1{fill:#fff}</style></defs>' +
  '<rect y="0" width="150" height="80"/><rect class="cls-1" x="5" y="5" width="140" height="70"/></svg>';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});

it('popoli SVGs are listed by popolo, taken from the file name', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gormiti-assets-'));
  mkdirSync(join(dir, 'popoli'));
  for (const f of ['popoloTerra.svg', 'popolo-aria.svg', 'note.txt']) writeFileSync(join(dir, 'popoli', f), WORD);
  expect(scanAssets(dir).popoli).toEqual([
    { popolo: 'aria', file: 'popoli/popolo-aria.svg' },
    { popolo: 'terra', file: 'popoli/popoloTerra.svg' },
  ]);
});

it("Popolo with Simone's word: only «Popolo» in Geist, then the word with the figures' paper band and outline, 30 mm in all", () => {
  const word = { popolo: 'luce', file: 'popoli/popoloLuce.svg', ...parseFigureSvg(WORD) };
  const ctx = { fonts, paint: screenPaint, popoli: new Map([['luce', word]]) };
  const el = buildElement('popolo', { popolo: 'luce', height: 30 }, ctx);
  expect(el.bounds.height).toBeCloseTo(30, 6);
  const { c, s } = popoloLayout(word, 30, fonts);
  expect(s).toBeCloseTo(POPOLO_WORD_SCALE * c, 12);
  // «Popolo» alone, no article.
  const head = layoutText(fonts.regular, 'Popolo', { capHeight: c, tracking: -0.02 });
  expect(el.markup).toContain(`<path d="${head.lines[0].d}" class="fi"/>`);
  // The word drawn like a figure: rings of FIGURE_PAPER_MM and OUTLINE_MM, the same in mm at any size.
  const OUTER = FIGURE_PAPER_MM + OUTLINE_MM;
  expect(el.markup).toContain(buildFigure(word, 150 * s + 2 * OUTER, { paint: screenPaint }).markup);
  expect(el.bounds.width).toBeCloseTo(Math.max(150 * s + 2 * OUTER, head.bbox.x2 - head.bbox.x1), 6);
  expect(buildElement('popolo', { popolo: 'luce', height: 60 }, ctx).bounds.height).toBeCloseTo(60, 6);
  expect(convexHull(el.collisionPolygon)).toHaveLength(el.collisionPolygon.length);
  expect(pointInPolygon(el.centre, el.collisionPolygon)).toBe(true);
});

it('without its file a popolo keeps the placeholder sticker, also «Popolo» alone and 30 mm in all', () => {
  const el = buildElement('popolo', { popolo: 'aria', height: 30 }, { fonts, paint: screenPaint });
  expect(el.bounds.height).toBeCloseTo(30, 6);
  // Posters saved before keep their popolo but take the new size (capHeight is not read any more).
  expect(buildElement('popolo', { popolo: 'aria', capHeight: 22 }, { fonts, paint: screenPaint }).bounds.height).toBeCloseTo(30, 6);
});

it("Simone's seven popoli load, one per popolo", async () => {
  const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
  const manifest = scanAssets(assets);
  const { popoli } = await loadAssets(async (path) => (path === 'manifest.json' ? JSON.stringify(manifest) : readFileSync(join(assets, path), 'utf8')));
  expect([...popoli.keys()]).toEqual(['aria', 'foresta', 'luce', 'mare', 'tenebre', 'terra', 'vulcano']);
  for (const p of popoli.values()) expect(p.unsupported).toEqual([]);
});
