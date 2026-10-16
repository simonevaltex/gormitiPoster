import { it, expect, beforeAll } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseFigureSvg } from '../src/svg-figure.js';
import { buildElement } from '../src/elements/index.js';
import { POPOLO_WORD_SCALE } from '../src/elements/popolo.js';
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

it("Popolo with Simone's word: «Popolo» and the article in Geist, then the word at the common scale, just overlapping", () => {
  const word = { popolo: 'luce', file: 'popoli/popoloLuce.svg', ...parseFigureSvg(WORD) };
  const c = 30;
  const ctx = { fonts, paint: screenPaint, popoli: new Map([['luce', word]]) };
  const el = buildElement('popolo', { popolo: 'luce', capHeight: c }, ctx);
  const s = POPOLO_WORD_SCALE * c;
  expect(POPOLO_WORD_SCALE).toBeCloseTo(1.05 / 70, 10);
  expect(el.markup).toContain(`scale(${s})`);
  const head = layoutText(fonts.regular, 'Popolo\ndella', { capHeight: c, lineHeight: 0.82, tracking: -0.02 });
  expect(el.markup).toContain(head.lines[0].d);
  // The word: as wide as 150 units at that scale, its top a little above the article's baseline.
  expect(el.bounds.width).toBeCloseTo(Math.max(150 * s, head.bbox.x2 - head.bbox.x1), 6);
  expect(el.bounds.y + el.bounds.height).toBeCloseTo(0.82 * head.fontSize - 0.06 * c + 80 * s, 6);
  expect(convexHull(el.collisionPolygon)).toHaveLength(el.collisionPolygon.length);
  expect(pointInPolygon(el.centre, el.collisionPolygon)).toBe(true);
  expect(el.markup).not.toContain('stroke'); // the file has its own outline and shadow
  // A popolo without its file keeps the placeholder lettering.
  const aria = buildElement('popolo', { popolo: 'aria', capHeight: c }, ctx);
  expect(aria.markup).toEqual(buildElement('popolo', { popolo: 'aria', capHeight: c }, { fonts, paint: screenPaint }).markup);
});

it("Simone's seven popoli load, one per popolo", async () => {
  const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
  const manifest = scanAssets(assets);
  const { popoli } = await loadAssets(async (path) => (path === 'manifest.json' ? JSON.stringify(manifest) : readFileSync(join(assets, path), 'utf8')));
  expect([...popoli.keys()]).toEqual(['aria', 'foresta', 'luce', 'mare', 'tenebre', 'terra', 'vulcano']);
  for (const p of popoli.values()) expect(p.unsupported).toEqual([]);
});
