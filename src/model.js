// Sheet actions, without any DOM: Genera, Annulla, Svuota, attractor edits, recipe in/out.
import { ELEMENT_TYPES, buildElement, validateParams } from './elements/index.js';
import { fieldAt, targetAngle } from './field.js';
import { screenPaint } from './paint.js';
import { DEFAULT_SEGMENT, DEFAULT_SETTINGS, PHYS } from './constants.js';
import { RECIPE_VERSION } from './recipe.js';

export function createModel({ store, physics, fonts, figures = new Map(), stemmi = new Map() }) {
  const s = store.state;

  const displayNumber = () => s.poster.number ?? s.archive.nextNumber;
  const ctx = () => ({ fonts, figures, stemmi, paint: screenPaint, posterNumber: displayNumber() });
  const nextId = (prefix) => `${prefix}${++s.seq}`;
  // Anything that can thaw resting blocks: if it changed, an old snapshot no longer matches the sheet.
  const attractorsKey = () => JSON.stringify([s.attractors, s.settings]);

  // Physics inputs for the current elements at the given poses ({ id: { x, y, angle } }).
  const inputs = (poses) =>
    s.elements
      .filter((e) => poses[e.id])
      .map((e) => ({ id: e.id, polygon: e.built.collisionPolygon, ...poses[e.id] }));

  function rebuild(poses) {
    physics.rebuild({ attractors: s.attractors, elements: inputs(poses), settings: s.settings });
  }

  // The world as it is right now, blocks still falling included (with their speed and spin):
  // Genera never fast-forwards them. Genera rebuilds the engine from this snapshot and Annulla
  // goes back to it, so Annulla + Genera replays exactly the same simulation.
  function snapshot() {
    return { poses: physics.states(), attractorsKey: attractorsKey() };
  }

  // A poster is complete only with at least one block of every type: until then it can't be saved
  // or exported. Returns the labels of the missing types (empty when complete).
  const missingTypes = () =>
    Object.entries(ELEMENT_TYPES)
      .filter(([type]) => !s.elements.some((e) => e.type === type))
      .map(([, t]) => t.label);

  function generate() {
    if (!s.attractors.length) return { ok: false, reason: 'no-attractors' };
    const type = s.genera.type;
    const params = structuredClone(s.genera.params[type]);
    const invalid = validateParams(type, params);
    if (invalid) return { ok: false, reason: invalid };

    const before = snapshot();
    rebuild(before.poses); // fresh engine: same snapshot ⇒ bit-identical simulation
    const built = buildElement(type, params, ctx());
    const f = fieldAt(s.spawn.x, s.spawn.y, s.attractors);
    const m = Math.hypot(f.x, f.y);
    const angle = targetAngle(f.x, f.y) + (s.spawn.tilt * Math.PI) / 180;
    const back = m > 0 ? { x: -f.x / m, y: -f.y / m } : { x: 0, y: -1 };
    const pos = physics.findFreeSpawn(built.collisionPolygon, s.spawn.x, s.spawn.y, angle, back);
    const id = nextId('e');
    physics.addElement({ id, polygon: built.collisionPolygon, x: pos.x, y: pos.y, angle });
    s.elements.push({ id, type, params, built, before });
    store.emit('elements');
    return { ok: true, id };
  }

  // Annulla goes back in time: when nothing changed since the last Genera, the engine returns to
  // the snapshot taken then (blocks that were falling fall again from there), so Annulla + Genera
  // replays the same result. If the field or the settings changed, or the poster was reopened,
  // the last block is just taken out and everything else carries on from where it is.
  function undo() {
    const last = s.elements.pop();
    if (!last) return false;
    const b = last.before;
    const replay = b && b.attractorsKey === attractorsKey();
    if (replay) {
      rebuild(b.poses);
    } else {
      physics.removeElement(last.id);
      physics.wakeAll(); // whatever rested on it must be free to fall
    }
    store.emit('elements');
    return true;
  }

  function clear() {
    s.elements = [];
    s.poster = { id: null, number: null };
    rebuild({});
    store.emit('elements');
    store.emit('poster');
  }

  function reset() {
    s.attractors = [{ id: nextId('a'), ...DEFAULT_SEGMENT }];
    s.selectedId = null;
    s.elements = [];
    rebuild({});
    store.emit('attractors');
    store.emit('elements');
  }

  function attractorsChanged() {
    physics.setAttractors(s.attractors);
    store.emit('attractors');
  }

  function addAttractor(att) {
    const added = { ...att, id: nextId('a') };
    s.attractors.push(added);
    attractorsChanged();
    return added;
  }

  function updateAttractor(id, patch) {
    const att = s.attractors.find((a) => a.id === id);
    if (!att) return;
    Object.assign(att, patch);
    attractorsChanged();
  }

  function removeAttractor(id) {
    s.attractors = s.attractors.filter((a) => a.id !== id);
    if (s.selectedId === id) s.selectedId = null;
    attractorsChanged();
  }

  function setSettings(patch) {
    Object.assign(s.settings, patch);
    physics.setSettings(s.settings);
    store.emit('settings');
  }

  function setBleed(mm) {
    s.bleed = mm;
    store.emit('bleed');
  }

  // The badge shows the poster number, which changes on save or reopen; its shape does not.
  function refreshNumberBadges() {
    let changed = false;
    for (const e of s.elements) {
      if (e.type !== 'numero') continue;
      e.built = buildElement(e.type, e.params, ctx());
      changed = true;
    }
    if (changed) store.emit('markup');
  }

  function toRecipe({ id, number, date }) {
    physics.settle(PHYS.settleMaxSteps);
    physics.sleepAll();
    store.emit('poses'); // the sheet jumps to the final positions that get saved
    const poses = physics.poses();
    return {
      version: RECIPE_VERSION,
      id,
      number,
      date,
      colors: { ...s.colors },
      bleed: s.bleed,
      settings: { ...s.settings },
      attractors: s.attractors.map((a) => ({ ...a })),
      elements: s.elements.map((e) => ({ id: e.id, type: e.type, params: structuredClone(e.params), ...poses.get(e.id) })),
    };
  }

  function loadRecipe(r) {
    s.colors = { ...r.colors };
    s.bleed = r.bleed;
    s.settings = { ...DEFAULT_SETTINGS, ...r.settings };
    s.attractors = r.attractors.map((a) => ({ ...a }));
    s.poster = { id: r.id, number: r.number };
    s.selectedId = null;
    s.elements = r.elements.map((el) => ({
      id: el.id,
      type: el.type,
      params: structuredClone(el.params),
      built: buildElement(el.type, el.params, ctx()),
      before: null,
    }));
    const ids = [...r.elements, ...r.attractors].map((x) => parseInt(x.id.slice(1), 10) || 0);
    s.seq = Math.max(s.seq, ...ids);
    rebuild(Object.fromEntries(r.elements.map((el) => [el.id, { x: el.x, y: el.y, angle: el.angle }])));
    store.emit('load');
  }

  return {
    reset,
    generate,
    undo,
    clear,
    addAttractor,
    updateAttractor,
    removeAttractor,
    setSettings,
    setBleed,
    displayNumber,
    missingTypes,
    refreshNumberBadges,
    toRecipe,
    loadRecipe,
  };
}
