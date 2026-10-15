import { it, expect } from 'vitest';
import { closestPoint, fieldAt, targetAngle, angleDiff } from '../src/field.js';
import { FIELD } from '../src/constants.js';

const deg = (r) => (r * 180) / Math.PI;

it('target angle: force down → 0°, right → −90°, left → +90°', () => {
  expect(deg(targetAngle(0, 1))).toBeCloseTo(0);
  expect(deg(targetAngle(1, 0))).toBeCloseTo(-90);
  expect(deg(targetAngle(-1, 0))).toBeCloseTo(90);
});

it('angleDiff takes the shortest path', () => {
  expect(angleDiff(Math.PI - 0.1, -Math.PI + 0.1)).toBeCloseTo(-0.2);
  expect(angleDiff(0.5, 0.2)).toBeCloseTo(0.3);
  expect(angleDiff(0, 4 * Math.PI + 0.1)).toBeCloseTo(-0.1);
});

it('segment closest point is clamped to the endpoints', () => {
  const s = { type: 'segment', x1: 0, y1: 0, x2: 100, y2: 0, strength: 50 };
  expect(closestPoint(s, 50, 30)).toEqual({ x: 50, y: 0 });
  expect(closestPoint(s, -40, 30)).toEqual({ x: 0, y: 0 });
  expect(closestPoint(s, 140, -30)).toEqual({ x: 100, y: 0 });
});

it('field falls off with distance and points at the attractor', () => {
  const p = [{ type: 'point', x: 0, y: 0, strength: 50 }];
  const near = fieldAt(0, -100, p);
  const far = fieldAt(0, -300, p);
  expect(near.y).toBeGreaterThan(far.y);
  expect(far.y).toBeGreaterThan(0);
  expect(near.x).toBeCloseTo(0);
});

it('field is perpendicular to a segment above its middle', () => {
  const s = [{ type: 'segment', x1: 0, y1: 0, x2: 200, y2: 0, strength: 50 }];
  const f = fieldAt(100, -80, s);
  expect(f.x).toBeCloseTo(0);
  expect(f.y).toBeGreaterThan(0);
});

it('field strength scales with the attractor strength', () => {
  const weak = fieldAt(0, -200, [{ type: 'point', x: 0, y: 0, strength: 10 }]);
  const strong = fieldAt(0, -200, [{ type: 'point', x: 0, y: 0, strength: 50 }]);
  expect(strong.y / weak.y).toBeCloseTo(5);
});

it('the stronger combined field wins, not the nearer attractor', () => {
  const atts = [
    { type: 'point', x: 0, y: 0, strength: 100 },
    { type: 'point', x: 200, y: 0, strength: 10 },
  ];
  expect(fieldAt(120, 0, atts).x).toBeLessThan(0); // nearer to the weak one, pulled to the strong one
});

it('field magnitude is capped', () => {
  const f = fieldAt(0, -1, [{ type: 'point', x: 0, y: 0, strength: 100 }]);
  expect(Math.hypot(f.x, f.y)).toBeLessThanOrEqual(FIELD.maxAccel + 1e-12);
});

it('no attractors, no field', () => {
  expect(fieldAt(10, 10, [])).toEqual({ x: 0, y: 0 });
});
