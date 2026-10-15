import { it, expect, beforeAll } from 'vitest';
import { ELEMENT_TYPES, buildElement, defaultParams, validateParams } from '../src/elements/index.js';
import { gormitaShape } from '../src/elements/gormita.js';
import { POPOLI } from '../src/popoli.js';
import { screenPaint, exportPaint } from '../src/paint.js';
import { convexHull, pointInPolygon } from '../src/geometry.js';
import { parseFigureSvg } from '../src/svg-figure.js';
import { OUTLINE_MM } from '../src/constants.js';
import { loadFontsFromDisk } from './helpers.js';

const BLOCK_SVG =
  '<svg xmlns="http://www.w3.org/2000/svg"><rect width="100" height="50"/><rect fill="#fff" x="10" y="10" width="20" height="20"/></svg>';
const figures = new Map([['blocco', { id: 'blocco', name: 'Blocco', file: 'gormiti/blocco.svg', ...parseFigureSvg(BLOCK_SVG) }]]);

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});
const ctx = (posterNumber = 7) => ({ fonts, paint: screenPaint, posterNumber });

it('has the five types and the seven popoli', () => {
  expect(Object.keys(ELEMENT_TYPES)).toEqual(['popolo', 'stemma', 'gormita', 'nome', 'testo', 'numero']);
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

it('nome is outlined (0.5 mm ink, the shared OUTLINE_MM), alias is solid ink', () => {
  expect(OUTLINE_MM).toBe(0.5);
  const p = { text: 'Sommo', weight: 'regular', capHeight: 30 };
  const alias = buildElement('testo', p, ctx());
  const nome = buildElement('nome', p, ctx());
  expect(nome.bounds.width).toBeCloseTo(alias.bounds.width + 1, 5);
  expect(nome.bounds.height).toBeCloseTo(alias.bounds.height + 1, 5);
  expect(alias.markup).not.toContain('stroke');
  expect(nome.markup).toContain('stroke');
});

it('old text recipes keep their style: outline or paper fill stays outlined', () => {
  const p = { text: 'Sommo', weight: 'regular', capHeight: 30 };
  const nome = buildElement('nome', p, ctx()).markup;
  expect(buildElement('testo', { ...p, style: 'outline' }, ctx()).markup).toEqual(nome);
  expect(buildElement('testo', { ...p, fill: 'paper', stroke: 'ink', strokeWidth: 0.8 }, ctx()).markup).toEqual(nome);
});

it('testo: cap height drives the size', () => {
  const p = { ...defaultParams().testo, text: 'H' };
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
  expect(validateParams('gormita', { figure: 'blocco', name: '', width: 180 })).toBeNull(); // a figure needs no name
  expect(validateParams('testo', defaultParams().testo)).toBeNull();
});

it('gormita: a chosen figure comes from its SVG, otherwise the placeholder is drawn', () => {
  const c = { ...ctx(), figures };
  const fromSvg = buildElement('gormita', { figure: 'blocco', name: 'Gormita', width: 180 }, c);
  expect(fromSvg.markup).toContain('scale(');
  expect(fromSvg.bounds.width).toBeCloseTo(180, 6);
  expect(pointInPolygon(fromSvg.centre, fromSvg.collisionPolygon)).toBe(true);
  const placeholder = buildElement('gormita', { figure: '', name: 'Gormita', width: 180 }, c);
  expect(placeholder.markup).not.toContain('scale(');
  // A poster whose figure file is gone falls back to the placeholder; so do posters saved
  // before figures existed (no `figure` at all).
  expect(buildElement('gormita', { figure: 'sparito', name: 'Gormita', width: 180 }, c).markup).toEqual(placeholder.markup);
  expect(buildElement('gormita', { name: 'Gormita', width: 180 }, ctx()).markup).toEqual(placeholder.markup);
});
