import { it, expect, beforeAll } from 'vitest';
import { composeSheetSvg, poseTransform, lightenSvg } from '../src/recipe.js';
import { parseFigureSvg } from '../src/svg-figure.js';
import { exportPaint, screenPaint } from '../src/paint.js';
import { defaultParams } from '../src/elements/index.js';
import { loadFontsFromDisk } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});

const recipe = (bleed) => ({
  version: 1,
  id: 'p1',
  number: 12,
  date: '2026-10-15T00:00:00.000Z',
  colors: { carta: '#808080', inchiostro: '#ff6600' },
  bleed,
  settings: {},
  attractors: [{ id: 'a1', type: 'segment', x1: 15, y1: 405, x2: 282, y2: 405, strength: 50 }],
  elements: [
    { id: 'e1', type: 'testo', params: { ...defaultParams().testo, text: 'Sommo' }, x: 148.5, y: 380, angle: 0 },
    { id: 'e2', type: 'numero', params: defaultParams().numero, x: 260, y: 380, angle: 0.1 },
  ],
});
const paint = exportPaint({ carta: '#808080', inchiostro: '#ff6600' });

it('page size: trimmed A3 plus bleed, plus slug with crop marks', () => {
  expect(composeSheetSvg(recipe(0), { fonts, paint })).toMatchObject({ width: 297, height: 420 });
  expect(composeSheetSvg(recipe(3), { fonts, paint })).toMatchObject({ width: 303, height: 426 });
  expect(composeSheetSvg(recipe(3), { fonts, paint, cropMarks: true })).toMatchObject({ width: 323, height: 446, slug: 10 });
  const { svg } = composeSheetSvg(recipe(3), { fonts, paint });
  expect(svg).toContain('width="303mm" height="426mm" viewBox="-3 -3 303 426"');
});

it('clips at the bleed, uses exact colours and draws no guides', () => {
  const { svg } = composeSheetSvg(recipe(3), { fonts, paint, cropMarks: true });
  expect(svg).toContain('<clipPath id="sheet-bleed"><rect x="-3" y="-3" width="303" height="426"/>');
  expect(svg).toContain('#ff6600');
  expect(svg).toContain('#808080');
  expect(svg).not.toContain('stroke-dasharray');
  expect(svg).not.toContain('class=');
  expect(svg).toContain('stroke-width="0.1"'); // crop marks
});

it('thumbnails use the screen classes and their own clip id', () => {
  const { svg } = composeSheetSvg(recipe(3), { fonts, paint: screenPaint, idPrefix: 'thumb-p1' });
  expect(svg).toContain('id="thumb-p1-bleed"');
  expect(svg).toContain('class="fp"');
  expect(svg).not.toContain('#ff6600');
});

it('pose transform places the collision centre at the body position', () => {
  expect(poseTransform({ x: 10, y: 20, angle: Math.PI / 2 }, { x: 1, y: 2 })).toBe('translate(10 20) rotate(90) translate(-1 -2)');
});

it('figures reach the builders; thumbnails are lighter and keep the exact figure scale', () => {
  const figure = parseFigureSvg('<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/></svg>');
  const figures = new Map([['blocco', { id: 'blocco', name: 'Blocco', ...figure }]]);
  const r = recipe(3);
  r.elements.push({ id: 'e3', type: 'gormita', params: { figure: 'blocco', name: '', width: 120.3 }, x: 148.5, y: 300, angle: 0 });
  const { svg } = composeSheetSvg(r, { fonts, figures, paint });
  const scale = svg.match(/scale\(([\d.]+)\)/)[1];
  expect(scale).toBe(String((120.3 - 8) / 100));
  const thumbnail = lightenSvg(composeSheetSvg(r, { fonts, figures, paint: screenPaint, detail: 'thumbnail' }).svg);
  expect(thumbnail).toContain(`scale(${scale})`);
  expect(thumbnail.replace(/scale\([^)]*\)/g, '')).not.toMatch(/\d\.\d\d/); // anything else: one decimal at most
});
