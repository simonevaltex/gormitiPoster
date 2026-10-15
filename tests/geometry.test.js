import { it, expect } from 'vitest';
import {
  convexHull,
  polygonCentroid,
  rectPolygon,
  regularPolygon,
  inradius,
  circumradius,
  pointInPolygon,
  closedCatmullRomPath,
  sampleClosedCatmullRom,
  simplifyPolygon,
} from '../src/geometry.js';

it('hull drops interior points', () => {
  const hull = convexHull([...rectPolygon(0, 0, 10, 10), { x: 5, y: 5 }, { x: 2, y: 8 }]);
  expect(hull).toHaveLength(4);
});

it('hull drops collinear points on the edges', () => {
  const hull = convexHull([...rectPolygon(0, 0, 10, 10), { x: 5, y: 0 }, { x: 10, y: 5 }]);
  expect(hull).toHaveLength(4);
});

it('centroid, radii, containment', () => {
  const r = rectPolygon(10, 20, 40, 10);
  const c = polygonCentroid(r);
  expect(c.x).toBeCloseTo(30);
  expect(c.y).toBeCloseTo(25);
  expect(inradius(r, c)).toBeCloseTo(5);
  expect(circumradius(r, c)).toBeCloseTo(Math.hypot(20, 5));
  expect(pointInPolygon({ x: 30, y: 25 }, r)).toBe(true);
  expect(pointInPolygon({ x: 0, y: 0 }, r)).toBe(false);
});

it('regular polygon has n vertices on the circle', () => {
  const p = regularPolygon(10, 32);
  expect(p).toHaveLength(32);
  expect(p.every((v) => Math.abs(Math.hypot(v.x, v.y) - 10) < 1e-9)).toBe(true);
});

it('closed Catmull-Rom path is a closed cubic path through the points', () => {
  const pts = regularPolygon(10, 6);
  const d = closedCatmullRomPath(pts);
  expect(d.startsWith('M')).toBe(true);
  expect(d.match(/C/g)).toHaveLength(6);
  expect(d.trim().endsWith('Z')).toBe(true);
  const samples = sampleClosedCatmullRom(pts, 8);
  expect(samples).toHaveLength(48);
  expect(samples[0].x).toBeCloseTo(pts[0].x);
  expect(samples[8].y).toBeCloseTo(pts[1].y);
});

it('simplifyPolygon removes nearly straight vertices and caps the count', () => {
  const dense = regularPolygon(50, 200);
  const simple = simplifyPolygon(dense, 0.05, 40);
  expect(simple.length).toBeLessThanOrEqual(40);
  expect(simple.length).toBeGreaterThanOrEqual(12);
  const square = [...rectPolygon(0, 0, 10, 10), { x: 5, y: 0 }];
  expect(simplifyPolygon(convexHull(square), 0.01, 40)).toHaveLength(4);
});
