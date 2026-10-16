import { it, expect, beforeAll, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { parseFigureSvg, fitNumber } from '../src/svg-figure.js';
import { buildElement } from '../src/elements/index.js';
import { scanAssets } from '../scripts/assets-manifest.mjs';
import { loadAssets } from '../src/figures.js';
import { screenPaint, exportPaint } from '../src/paint.js';
import { convexHull, pointInPolygon } from '../src/geometry.js';
import svgpath from 'svgpath';
import { OUTLINE_MM } from '../src/constants.js';
import { loadFontsFromDisk } from './helpers.js';

// A badge like Illustrator writes it: a black disc and, named "numero", the white box of the number.
const BADGE =
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 60 60"><defs><style>.st0{fill:#fff}</style></defs>' +
  '<circle cx="30" cy="30" r="30"/><rect id="numero" class="st0" x="15" y="22" width="30" height="16"/></svg>';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});

it('the shape named "numero" is the box of the number: not drawn, its fill is the colour of the number', () => {
  const badge = parseFigureSvg(BADGE, { slot: 'numero' });
  expect(badge.shapes).toHaveLength(1);
  expect(badge.slot).toEqual({ box: { x: 15, y: 22, width: 30, height: 16 }, paint: 'paper' });
  expect(badge.bounds).toEqual({ x: 0, y: 0, width: 60, height: 60 });
  // Any other figure draws a shape called "numero" like the rest.
  expect(parseFigureSvg(BADGE).shapes).toHaveLength(2);
  // Illustrator ids for a layer named "numero" (moved by a transform, renamed when doubled).
  const moved = BADGE.replace('<rect id="numero"', '<rect id="numero-2" transform="translate(1 2)"');
  expect(parseFigureSvg(moved, { slot: 'numero' }).slot.box).toEqual({ x: 16, y: 24, width: 30, height: 16 });
});

it('the number fills the height of its box, or its width when it would be wider, centred', () => {
  const box = { x: -10, y: -4, width: 20, height: 8 };
  const tall = fitNumber(fonts.mono, '7', box);
  expect(tall.bbox.y2 - tall.bbox.y1).toBeCloseTo(8, 1);
  const wide = fitNumber(fonts.mono, '0123456789', box);
  expect(wide.bbox.x2 - wide.bbox.x1).toBeCloseTo(20, 1);
  for (const { bbox } of [tall, wide]) {
    expect((bbox.x1 + bbox.x2) / 2).toBeCloseTo(0, 5);
    expect((bbox.y1 + bbox.y2) / 2).toBeCloseTo(0, 5);
    expect(bbox.x1).toBeGreaterThanOrEqual(-10 - 1e-6);
    expect(bbox.y2).toBeLessThanOrEqual(4 + 1e-6);
  }
});

it("numero from Simone's SVG: as wide as the Diametro, the poster number in its box, same collision for every number", () => {
  const numero = { file: 'numero/numero.svg', ...parseFigureSvg(BADGE, { slot: 'numero' }) };
  const ctx = (posterNumber) => ({ fonts, paint: screenPaint, posterNumber, numero });
  const a = buildElement('numero', { diameter: 30 }, ctx(7));
  const b = buildElement('numero', { diameter: 30 }, ctx(12));
  expect(a.bounds.width).toBeCloseTo(30 + 2 * OUTLINE_MM, 1); // the disc and its outline
  expect(a.markup).toContain('scale(0.5)');
  expect(a.markup).toContain(fitNumber(fonts.mono, '007', { x: -7.5, y: -4, width: 15, height: 8 }).d);
  expect(a.markup).not.toEqual(b.markup);
  expect(a.collisionPolygon).toEqual(b.collisionPolygon);
  expect(convexHull(a.collisionPolygon)).toHaveLength(a.collisionPolygon.length);
  expect(pointInPolygon(a.centre, a.collisionPolygon)).toBe(true);
  const exported = buildElement('numero', { diameter: 30 }, { ...ctx(7), paint: exportPaint({ carta: '#808080', inchiostro: '#ff6600' }) });
  expect(exported.markup).toContain('fill="#808080"'); // the number, paper like its box
  expect(exported.markup).not.toContain('class=');
});

it('Diametro measures the black badge; collisions take the whole drawing, flourish and outline included', () => {
  // The black disc of BADGE (60 wide) and a long white flourish reaching far up and left.
  const flourished = BADGE.replace('<circle cx="30"', '<path class="st0" d="M-90,-120L35,5L5,35Z"/><circle cx="30"');
  const numero = { file: 'numero/numero.svg', ...parseFigureSvg(flourished, { slot: 'numero' }) };
  const a = buildElement('numero', { diameter: 30 }, { fonts, paint: screenPaint, posterNumber: 7, numero });
  expect(a.markup).toContain('scale(0.5)'); // the black disc is 30 mm
  expect(a.markup).toContain(fitNumber(fonts.mono, '007', { x: -7.5, y: -4, width: 15, height: 8 }).d);
  // 150 × 180 drawing units → 75 × 90 mm, plus the outline on each side.
  expect(a.bounds.width).toBeCloseTo(75 + 2 * OUTLINE_MM, 1);
  expect(a.bounds.height).toBeCloseTo(90 + 2 * OUTLINE_MM, 1);
  expect(pointInPolygon({ x: -50, y: -60 }, a.collisionPolygon)).toBe(true); // on the flourish
});

it('an ink line as thick as Nome\'s goes around the whole badge, white flourish included, under the drawing', () => {
  const flourished = BADGE.replace('<circle cx="30"', '<path class="st0" d="M-90,-120L35,5L5,35Z"/><circle cx="30"');
  const numero = { file: 'numero/numero.svg', ...parseFigureSvg(flourished, { slot: 'numero' }) };
  const { markup } = buildElement('numero', { diameter: 30 }, { fonts, paint: screenPaint, posterNumber: 7, numero });
  const [, d, attrs] = markup.match(/<path d="([^"]+)" ([^/]*)\/>/); // the first path: the line
  expect(attrs).toBe('class="fi"');
  expect(markup.indexOf(d)).toBeLessThan(markup.indexOf('<g class="fp">')); // under the drawing
  const xs = [];
  const ys = [];
  svgpath(d).abs().iterate((seg) => seg[0] !== 'Z' && (xs.push(seg.at(-2) * 0.5), ys.push(seg.at(-1) * 0.5)));
  // Disc and flourish span 150 × 180 drawing units, 75 × 90 mm at this size; plus the line.
  expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(75 + 2 * OUTLINE_MM, 1);
  expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(90 + 2 * OUTLINE_MM, 1);
  expect(markup).not.toContain('stroke'); // a filled shape, not a stroke
});

it('the badge SVG is any SVG in assets/numero (numero.svg first); none → no entry', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gormiti-assets-'));
  expect(scanAssets(dir).numero).toBeNull();
  mkdirSync(join(dir, 'numero'));
  writeFileSync(join(dir, 'numero', 'badge.svg'), BADGE);
  expect(scanAssets(dir).numero).toBe('numero/badge.svg');
  writeFileSync(join(dir, 'numero', 'numero.svg'), BADGE);
  expect(scanAssets(dir).numero).toBe('numero/numero.svg');
});

it('a badge without the "numero" box is left out with a warning: the star stays', async () => {
  const files = { 'manifest.json': JSON.stringify({ gormiti: [], stemmi: [], numero: 'numero/numero.svg' }), 'numero/numero.svg': BADGE };
  const read = async (path) => files[path];
  expect((await loadAssets(read)).numero.slot.paint).toBe('paper');
  files['numero/numero.svg'] = BADGE.replace(' id="numero"', '');
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  expect((await loadAssets(read)).numero).toBeNull();
  expect(warn).toHaveBeenCalledOnce();
  warn.mockRestore();
});
