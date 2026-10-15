import { it, expect } from 'vitest';
import { createPhysics } from '../src/physics.js';
import { rectPolygon, regularPolygon } from '../src/geometry.js';
import { fieldAt, targetAngle, angleDiff } from '../src/field.js';
import { DEFAULT_SETTINGS, DEFAULT_SEGMENT, STEP_MS } from '../src/constants.js';

const seg = { id: 's', ...DEFAULT_SEGMENT };
const world = (attractors, settings = DEFAULT_SETTINGS) => {
  const p = createPhysics();
  p.rebuild({ attractors, elements: [], settings });
  return p;
};
const deg = (d) => (d * Math.PI) / 180;

it('calibration: a 40 mm block 200 mm from a strength-50 point touches it in about 1 s', () => {
  const p = world([{ id: 'c', type: 'point', x: 0, y: 0, strength: 50 }]);
  p.addElement({ id: 'b', polygon: rectPolygon(-20, -20, 40, 40), x: 0, y: -200, angle: 0 });
  let n = 0;
  while (p.poses().get('b').y < -21.5 && n < 600) {
    p.step();
    n++;
  }
  expect(n * STEP_MS).toBeGreaterThan(900);
  expect(n * STEP_MS).toBeLessThan(1100);
});

it('a block dropped over the floor segment rests on it, upright, and falls asleep', () => {
  const p = world([seg]);
  p.addElement({ id: 't', polygon: rectPolygon(-100, -20, 200, 40), x: 148.5, y: 80, angle: 0 });
  expect(p.settle(1200)).toBeLessThan(1200); // guards the gravity-stage hook: bodies must sleep
  expect(p.isSettled()).toBe(true);
  const pose = p.poses().get('t');
  expect(Math.abs(angleDiff(0, pose.angle))).toBeLessThan(0.01);
  expect(pose.y).toBeCloseTo(405 - 1 - 20, 0);
});

it('a block spawned tilted straightens itself before resting', () => {
  const p = world([seg]);
  p.addElement({ id: 't', polygon: rectPolygon(-60, -15, 120, 30), x: 148.5, y: 60, angle: 0.6 });
  p.settle(1500);
  expect(Math.abs(angleDiff(0, p.poses().get('t').angle))).toBeLessThan(0.02);
});

it('around a central point blocks settle radially, base to the centre, never overlapping', () => {
  const c = { id: 'c', type: 'point', x: 148.5, y: 210, strength: 50 };
  const p = world([c]);
  const starts = [
    [148.5, 40],
    [280, 210],
    [148.5, 380],
    [20, 210],
    [260, 70],
    [40, 350],
  ];
  starts.forEach(([x, y], i) => {
    const f = fieldAt(x, y, [c]);
    p.addElement({ id: `e${i}`, polygon: rectPolygon(-35, -12, 70, 24), x, y, angle: targetAngle(f.x, f.y) });
    p.settle(1200);
    p.sleepAll();
  });
  expect(p.overlaps(0.3)).toEqual([]);
  for (const [id, pose] of p.poses()) {
    const f = fieldAt(pose.x, pose.y, [c]);
    const err = Math.abs(angleDiff(targetAngle(f.x, f.y), pose.angle));
    const onThePoint = Math.hypot(pose.x - c.x, pose.y - c.y) < 12 + 1 + 1; // half height + disc + margin
    // Blocks lying on the point align exactly; wedged ones keep their base clearly toward it.
    expect(err, id).toBeLessThan(onThePoint ? deg(3) : deg(30));
  }
});

it('two attractors: a block goes where the combined field is stronger', () => {
  const atts = [
    { id: 'L', type: 'point', x: 60, y: 210, strength: 100 },
    { id: 'R', type: 'point', x: 240, y: 210, strength: 15 },
  ];
  const p = world(atts);
  p.addElement({ id: 'b', polygon: regularPolygon(10, 32), x: 170, y: 210, angle: 0 }); // nearer R
  p.settle(1500);
  expect(p.poses().get('b').x).toBeLessThan(100);
});

it('heavy-on-light stacking keeps penetration under 0.5 mm', () => {
  const p = world([seg]);
  p.addElement({ id: 'small', polygon: regularPolygon(10, 32), x: 148.5, y: 300, angle: 0 });
  p.settle(1200);
  p.addElement({ id: 'big', polygon: rectPolygon(-90, -100, 180, 200), x: 148.5, y: 100, angle: 0 });
  p.settle(1500);
  expect(p.overlaps(0.5)).toEqual([]);
});

it('moving an attractor wakes resting blocks; pulled from below they flip and rest under it', () => {
  const p = world([seg]);
  p.addElement({ id: 'b', polygon: rectPolygon(-30, -10, 60, 20), x: 148.5, y: 300, angle: 0 });
  p.settle(1200);
  expect(p.isSettled()).toBe(true);
  p.setAttractors([{ ...seg, y1: 250, y2: 250 }]); // the segment now sits above the block
  expect(p.isSettled()).toBe(false);
  expect(p.settle(1500)).toBeLessThan(1500);
  const pose = p.poses().get('b');
  expect(pose.y).toBeCloseTo(250 + 1 + 10, 0); // against the underside
  expect(Math.abs(angleDiff(Math.PI, pose.angle))).toBeLessThan(0.02); // base toward the segment
});

it('resting blocks stay put when a new block lands on them', () => {
  const p = world([seg]);
  p.addElement({ id: 'base', polygon: rectPolygon(-100, -20, 200, 40), x: 148.5, y: 300, angle: 0 });
  p.settle(1200);
  const before = p.poses().get('base');
  p.addElement({ id: 'drop', polygon: rectPolygon(-30, -30, 60, 60), x: 100, y: 20, angle: 0 });
  p.settle(1500);
  expect(p.poses().get('base')).toEqual(before);
});

it('occupied spawn point → the new block is pushed back against the field in 2 mm steps', () => {
  const p = world([seg]);
  p.addElement({ id: 'a', polygon: rectPolygon(-20, -20, 40, 40), x: 148.5, y: 200, angle: 0 });
  const pos = p.findFreeSpawn(rectPolygon(-20, -20, 40, 40), 148.5, 200, 0, { x: 0, y: -1 });
  expect(pos.x).toBe(148.5);
  expect(pos.y).toBeLessThanOrEqual(160);
  expect(pos.y).toBeGreaterThan(156);
});

it('removeElement takes a body out of the world', () => {
  const p = world([seg]);
  p.addElement({ id: 'a', polygon: rectPolygon(-20, -20, 40, 40), x: 148.5, y: 200, angle: 0 });
  p.removeElement('a');
  expect(p.poses().size).toBe(0);
});

it('rebuild puts every element back asleep at its exact pose', () => {
  const p = createPhysics();
  const elements = [{ id: 'a', polygon: rectPolygon(-20, -10, 40, 20), x: 100.123456789, y: 383.987654321, angle: 0.0123 }];
  p.rebuild({ attractors: [seg], elements, settings: DEFAULT_SETTINGS });
  expect(p.isSettled()).toBe(true);
  expect(p.poses().get('a')).toEqual({ x: 100.123456789, y: 383.987654321, angle: 0.0123 });
});

it('a block resting on a weak point leaves it when another point becomes stronger', () => {
  const L = { id: 'L', type: 'point', x: 60, y: 360, strength: 90 };
  const R = { id: 'R', type: 'point', x: 230, y: 210, strength: 15 };
  const p = world([L, R]);
  p.addElement({ id: 'b', polygon: regularPolygon(10, 32), x: 62.5, y: 335, angle: 0 });
  p.settle(1500);
  p.setAttractors([{ ...L, strength: 1 }, { ...R, strength: 100 }]);
  p.settle(3000);
  const pose = p.poses().get('b');
  expect(Math.hypot(pose.x - R.x, pose.y - R.y)).toBeLessThan(25);
});
