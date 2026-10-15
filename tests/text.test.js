import { it, expect, beforeAll } from 'vitest';
import { layoutText, fontSizeForCapHeight } from '../src/text.js';
import { loadFontsFromDisk } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});

it('loads the four faces', () => {
  for (const key of ['regular', 'medium', 'bold', 'mono']) expect(fonts[key].unitsPerEm).toBe(1000);
});

it('cap height in mm is exact: H spans baseline to capHeight', () => {
  const { bbox } = layoutText(fonts.bold, 'H', { capHeight: 40 });
  expect(bbox.y2 - bbox.y1).toBeCloseTo(40, 1);
  expect(bbox.y2).toBeCloseTo(0, 1); // baseline of the first line at y = 0
  expect(fontSizeForCapHeight(fonts.bold, 40)).toBeCloseTo((40 * 1000) / 710, 3);
});

it('glyphs are not mirrored (opentype 2 flips by default)', () => {
  const { lines, bbox } = layoutText(fonts.bold, 'L', { capHeight: 40 });
  const nums = [...lines[0].d.matchAll(/-?\d+(?:\.\d+)?/g)].map((m) => +m[0]);
  const ys = nums.filter((_, i) => i % 2 === 1);
  const meanY = ys.reduce((a, b) => a + b, 0) / ys.length;
  expect(meanY).toBeGreaterThan((bbox.y1 + bbox.y2) / 2); // the L's foot is at the bottom (y down)
});

it('multi-line: baselines 0.92 em apart, one bbox for the block', () => {
  const t = layoutText(fonts.regular, 'AB\nCD', { capHeight: 20 });
  expect(t.lines).toHaveLength(2);
  expect(t.bbox.y2 - t.bbox.y1).toBeCloseTo(20 + 0.92 * t.fontSize, 0);
});

it('empty lines still advance the baseline', () => {
  const t = layoutText(fonts.regular, 'A\n\nB', { capHeight: 20 });
  expect(t.lines).toHaveLength(2);
  expect(t.bbox.y2).toBeCloseTo(2 * 0.92 * t.fontSize, 0);
});

it('negative tracking makes the line narrower', () => {
  const tight = layoutText(fonts.bold, 'SOMMO', { capHeight: 40 }).bbox;
  const loose = layoutText(fonts.bold, 'SOMMO', { capHeight: 40, tracking: 0 }).bbox;
  expect(tight.x2 - tight.x1).toBeLessThan(loose.x2 - loose.x1);
});

it('uppercase option', () => {
  const upper = layoutText(fonts.bold, 'sommo', { capHeight: 40, uppercase: true });
  const lower = layoutText(fonts.bold, 'sommo', { capHeight: 40 });
  expect(upper.bbox.y1).toBeLessThan(lower.bbox.y1); // capitals are taller than x-height
});

it('whitespace-only text has no bbox', () => {
  expect(layoutText(fonts.bold, '  \n ', { capHeight: 40 }).bbox).toBeNull();
});

it('path data never contains NaN (opentype 2.0.0 rounding bug on values like 1e-15)', () => {
  for (let cap = 5; cap <= 60; cap += 1) {
    const { lines } = layoutText(fonts.regular, 'Popolo\ndell’', { capHeight: cap, lineHeight: 0.82, tracking: -0.02 });
    for (const line of lines) expect(line.d).not.toContain('NaN');
  }
});
