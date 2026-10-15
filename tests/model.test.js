import { it, expect, beforeAll } from 'vitest';
import { createStore } from '../src/state.js';
import { createPhysics } from '../src/physics.js';
import { createModel } from '../src/model.js';
import { loadFontsFromDisk } from './helpers.js';

let fonts;
beforeAll(async () => {
  fonts = await loadFontsFromDisk();
});

function setup() {
  const store = createStore();
  const physics = createPhysics();
  const model = createModel({ store, physics, fonts });
  model.reset();
  return { s: store.state, store, physics, model };
}
const poses = (physics) => Object.fromEntries(physics.poses());
const poseList = (physics) => [...physics.poses().values()]; // ids differ after an undo, poses must not

it('starts with one floor segment, inset 15 mm, strength 50', () => {
  const { s } = setup();
  expect(s.attractors).toHaveLength(1);
  expect(s.attractors[0]).toMatchObject({ type: 'segment', x1: 15, y1: 405, x2: 282, y2: 405, strength: 50 });
});

it('Annulla then Genera with the same values reproduces the exact same result', () => {
  const { s, physics, model } = setup();
  s.genera.type = 'testo';
  s.genera.params.testo.text = 'Sommo\nLuminescente';
  s.spawn = { x: 120, y: 80, tilt: 0 };
  expect(model.generate().ok).toBe(true);
  physics.settle(2000);
  s.genera.type = 'stemma';
  s.spawn = { x: 160, y: 30, tilt: 20 };
  model.generate();
  physics.settle(2000);
  const first = poseList(physics);
  model.undo();
  model.generate();
  physics.settle(2000);
  expect(poseList(physics)).toEqual(first); // bit-identical
});

it('Genera while blocks are still falling is deterministic too', () => {
  const { s, physics, model } = setup();
  s.genera.params.testo.text = 'Sommo';
  model.generate();
  for (let i = 0; i < 30; i++) physics.step(); // still in the air
  s.genera.type = 'numero';
  model.generate();
  physics.settle(2000);
  const first = poseList(physics);
  model.undo();
  model.generate();
  physics.settle(2000);
  expect(poseList(physics)).toEqual(first);
});

it('Genera never fast-forwards a block that is still falling: it keeps its place and speed', () => {
  const { s, physics, model } = setup();
  s.genera.params.testo.text = 'Sommo';
  const { id } = model.generate();
  for (let i = 0; i < 20; i++) physics.step();
  const before = physics.poses().get(id);
  physics.step();
  const stepped = physics.poses().get(id);
  const fall = stepped.y - before.y;
  expect(fall).toBeGreaterThan(0.1); // really in flight

  // Same 20 steps, then a second Genera, then one step: the first block moves on exactly as before.
  const b = setup();
  b.s.genera.params.testo.text = 'Sommo';
  const first = b.model.generate().id;
  for (let i = 0; i < 20; i++) b.physics.step();
  b.s.genera.type = 'stemma';
  b.s.spawn = { x: 40, y: 40, tilt: 0 };
  b.model.generate();
  expect(b.physics.poses().get(first)).toEqual(before);
  b.physics.step();
  expect(b.physics.poses().get(first).y - before.y).toBeCloseTo(fall, 6);
});

it('Annulla restores the previous poses exactly and keeps the form values', () => {
  const { s, physics, model } = setup();
  s.genera.params.testo.text = 'Sommo';
  model.generate();
  physics.settle(2000);
  physics.sleepAll();
  const before = poses(physics);
  s.genera.type = 'gormita';
  model.generate();
  physics.settle(2000);
  model.undo();
  expect(poses(physics)).toEqual(before);
  expect(s.genera.type).toBe('gormita');
  expect(s.elements).toHaveLength(1);
});

it('Genera is refused without attractors, and for empty text', () => {
  const { s, model } = setup();
  s.genera.params.testo.text = ' ';
  expect(model.generate().reason).toBe('empty-text');
  model.removeAttractor(s.attractors[0].id);
  s.genera.params.testo.text = 'X';
  expect(model.generate().reason).toBe('no-attractors');
});

it('the new block spawns at the pad point, oriented to the field plus the tilt', () => {
  const { s, physics, model } = setup();
  s.genera.type = 'stemma';
  s.spawn = { x: 100, y: 50, tilt: 30 };
  const { id } = model.generate();
  const pose = physics.poses().get(id);
  expect(pose.x).toBeCloseTo(100, 6);
  expect(pose.y).toBeCloseTo(50, 6);
  expect((pose.angle * 180) / Math.PI).toBeCloseTo(30, 6); // floor field points straight down
});

it('attractor edits reach the physics and wake resting blocks', () => {
  const { s, physics, model } = setup();
  model.generate();
  physics.settle(2000);
  expect(physics.isSettled()).toBe(true);
  model.updateAttractor(s.attractors[0].id, { y1: 300, y2: 300 });
  expect(physics.isSettled()).toBe(false);
  const added = model.addAttractor({ type: 'point', x: 50, y: 50, strength: 70 });
  expect(added.id).toBeTruthy();
  expect(s.attractors).toHaveLength(2);
});

it('Svuota foglio empties the sheet and starts a new poster', () => {
  const { s, physics, model } = setup();
  model.generate();
  s.poster = { id: 'p1', number: 4 };
  model.clear();
  expect(s.elements).toHaveLength(0);
  expect(physics.poses().size).toBe(0);
  expect(s.poster).toEqual({ id: null, number: null });
});

it('recipe round-trip reopens identical poses', () => {
  const { s, physics, model } = setup();
  s.genera.params.testo.text = 'Sommo';
  model.generate();
  s.genera.type = 'numero';
  model.generate();
  const recipe = model.toRecipe({ id: 'p1', number: 1, date: '2026-10-15T00:00:00.000Z' });
  expect(recipe.elements).toHaveLength(2);
  expect(recipe.elements[0]).toMatchObject({ type: 'testo', params: { text: 'Sommo' } });
  const other = setup();
  other.model.loadRecipe(structuredClone(recipe));
  expect(poses(other.physics)).toEqual(poses(physics));
  expect(other.s.poster).toEqual({ id: 'p1', number: 1 });
  expect(other.physics.isSettled()).toBe(true);
});

it('the Numero badge follows the poster number', () => {
  const { s, model } = setup();
  s.archive.nextNumber = 13;
  s.genera.type = 'numero';
  model.generate();
  expect(model.displayNumber()).toBe(13);
  const before = s.elements[0].built.markup;
  s.poster = { id: 'p9', number: 9 };
  model.refreshNumberBadges();
  expect(s.elements[0].built.markup).not.toEqual(before);
});

it('a poster is complete only with every element type', () => {
  const { s, model } = setup();
  expect(model.missingTypes()).toEqual(['Popolo', 'Stemma', 'Gormita', 'Nome', 'Alias', 'Numero']);
  s.genera.type = 'stemma';
  model.generate();
  s.genera.type = 'numero';
  model.generate();
  expect(model.missingTypes()).toEqual(['Popolo', 'Gormita', 'Nome', 'Alias']);
});
