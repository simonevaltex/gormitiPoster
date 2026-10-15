import { it, expect, beforeAll } from 'vitest';
import { composeSheetSvg, poseTransform } from '../src/recipe.js';
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
