import { it, expect, beforeAll } from 'vitest';
import { ELEMENT_TYPES, buildElement, defaultParams, validateParams } from '../src/elements/index.js';
import { gormitaShape } from '../src/elements/gormita.js';
import { POPOLI } from '../src/popoli.js';
import { screenPaint, exportPaint } from '../src/paint.js';
import { convexHull, pointInPolygon } from '../src/geometry.js';
import { loadFontsFromDisk } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});
const ctx = (posterNumber = 7) => ({ fonts, paint: screenPaint, posterNumber });

it('has the five types and the seven popoli', () => {
  expect(Object.keys(ELEMENT_TYPES).sort()).toEqual(['gormita', 'numero', 'popolo', 'stemma', 'testo']);
  expect(POPOLI.map((p) => p.article)).toEqual(['dell’', 'della', 'della', 'del', 'delle', 'della', 'del']);
});

it.each(Object.keys(ELEMENT_TYPES))('%s builds valid markup and a convex collision polygon', (type) => {
  const el = buildElement(type, defaultParams()[type], ctx());
  expect(el.markup.length).toBeGreaterThan(0);
  expect(el.markup).not.toMatch(/NaN|undefined|Infinity/);
  expect(el.collisionPolygon.length).toBeGreaterThanOrEqual(3);
  expect(convexHull(el.collisionPolygon)).toHaveLength(el.collisionPolygon.length); // already convex
  expect(el.bounds.width).toBeGreaterThan(0);
  expect(el.bounds.height).toBeGreaterThan(0);
  expect(pointInPolygon(el.centre, el.collisionPolygon)).toBe(true);
});

it('every popolo has a stemma symbol and a lettering', () => {
  for (const { id } of POPOLI) {
    expect(buildElement('stemma', { popolo: id, diameter: 20 }, ctx()).markup).not.toMatch(/NaN|undefined/);
    expect(buildElement('popolo', { popolo: id, capHeight: 22 }, ctx()).markup).not.toMatch(/NaN|undefined/);
  }
});

it('same Gormita name → same shape; another name → another shape; 14–22 points', () => {
  const a = gormitaShape('Sommo Luminescente');
  const b = gormitaShape('  sommo   luminescente ');
  const c = gormitaShape('Tasaurus');
  expect(b).toEqual(a);
  expect(c).not.toEqual(a);
  expect(a.points.length).toBeGreaterThanOrEqual(14);
  expect(a.points.length).toBeLessThanOrEqual(22);
  expect(a.appendages.length).toBeGreaterThanOrEqual(1);
  expect(a.appendages.length).toBeLessThanOrEqual(3);
});

it('default sizes: stemma Ø20, numero Ø22, gormita 180 wide', () => {
  const p = defaultParams();
  expect(buildElement('stemma', p.stemma, ctx()).bounds.width).toBeCloseTo(20, 1);
  expect(buildElement('numero', p.numero, ctx()).bounds.width).toBeCloseTo(22, 1);
  expect(buildElement('gormita', p.gormita, ctx()).bounds.width).toBeCloseTo(180, 0);
});

it('testo: collision box is the glyph box grown by the stroke', () => {
  const base = { ...defaultParams().testo, text: 'Sommo', stroke: 'none' };
  const plain = buildElement('testo', base, ctx()).bounds;
  const stroked = buildElement('testo', { ...base, stroke: 'paper', strokeWidth: 2 }, ctx()).bounds;
  expect(stroked.width).toBeCloseTo(plain.width + 4, 5);
  expect(stroked.height).toBeCloseTo(plain.height + 4, 5);
});

it('testo: cap height drives the size', () => {
  const p = { ...defaultParams().testo, text: 'H', stroke: 'none' };
  expect(buildElement('testo', { ...p, capHeight: 40 }, ctx()).bounds.height).toBeCloseTo(40, 1);
});

it('numero shows the poster number but keeps the same collision shape', () => {
  const a = buildElement('numero', { diameter: 22 }, ctx(7));
  const b = buildElement('numero', { diameter: 22 }, ctx(12));
  expect(a.markup).not.toEqual(b.markup);
  expect(a.collisionPolygon).toEqual(b.collisionPolygon);
});

it('export paint uses exact hex and no classes', () => {
  const colors = { carta: '#808080', inchiostro: '#ff6600' };
  for (const type of Object.keys(ELEMENT_TYPES)) {
    const params = { ...defaultParams()[type] };
    const el = buildElement(type, params, { fonts, paint: exportPaint(colors), posterNumber: 7 });
    expect(el.markup).toContain('#ff6600');
    expect(el.markup).not.toContain('class=');
  }
});

it('validation', () => {
  expect(validateParams('testo', { ...defaultParams().testo, text: '  ' })).toBe('empty-text');
  expect(validateParams('gormita', { ...defaultParams().gormita, name: '' })).toBe('empty-name');
  expect(validateParams('testo', defaultParams().testo)).toBeNull();
});
