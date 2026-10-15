// Attractors: factories, hit testing, their guides and the sheet tools. Guides are thin dashed
// lines sized in screen pixels (mmPerPx converts), and never appear in exports or thumbnails.
import { A3, DEFAULTS } from './constants.js';
import { fmt } from './svg.js';
import { isTyping } from './ui/dom.js';

const HIT_PX = 9;

export const newPoint = (x, y) => ({ type: 'point', x, y, strength: DEFAULTS.strength });
export const newSegment = (x1, y1, x2, y2) => ({ type: 'segment', x1, y1, x2, y2, strength: DEFAULTS.strength });

function distanceToSegment(p, a) {
  const dx = a.x2 - a.x1;
  const dy = a.y2 - a.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((p.x - a.x1) * dx + (p.y - a.y1) * dy) / len2));
  return Math.hypot(p.x - (a.x1 + t * dx), p.y - (a.y1 + t * dy));
}

// → { id, part: 'p' | 'a' | 'b' | 'body' } or null. Endpoints of the selected segment win.
export function hitTest(attractors, p, tolMm, selectedId) {
  const ordered = [...attractors].sort((u, v) => (v.id === selectedId) - (u.id === selectedId));
  for (const a of ordered) {
    if (a.type === 'segment') {
      if (Math.hypot(p.x - a.x1, p.y - a.y1) <= tolMm) return { id: a.id, part: 'a' };
      if (Math.hypot(p.x - a.x2, p.y - a.y2) <= tolMm) return { id: a.id, part: 'b' };
    }
  }
  for (const a of ordered) {
    if (a.type === 'point' && Math.hypot(p.x - a.x, p.y - a.y) <= tolMm) return { id: a.id, part: 'p' };
    if (a.type === 'segment' && distanceToSegment(p, a) <= tolMm) return { id: a.id, part: 'body' };
  }
  return null;
}

// SVG guide for one attractor. Selected: solid 2 px stroke, inverted handles, strength label.
export function attractorGuide(a, selected, mmPerPx) {
  const px = (n) => fmt(n * mmPerPx);
  const stroke = selected ? 'guide thick' : 'guide dashed';
  const label = (x, y) =>
    selected ? `<text class="guide-label" x="${fmt(x)}" y="${fmt(y)}" font-size="${px(16)}">${a.strength}</text>` : '';
  if (a.type === 'point') {
    const r = 7 * mmPerPx;
    return (
      `<g data-attractor="${a.id}">` +
      `<circle class="${stroke}" cx="${fmt(a.x)}" cy="${fmt(a.y)}" r="${fmt(r)}"/>` +
      `<path class="guide" d="M${fmt(a.x - 2 * r)} ${fmt(a.y)}H${fmt(a.x + 2 * r)}M${fmt(a.x)} ${fmt(a.y - 2 * r)}V${fmt(a.y + 2 * r)}"/>` +
      (selected ? `<circle class="guide filled" cx="${fmt(a.x)}" cy="${fmt(a.y)}" r="${px(3)}"/>` : '') +
      label(a.x + 2.4 * r, a.y - 1.2 * r) +
      '</g>'
    );
  }
  const h = 4 * mmPerPx;
  const handle = (x, y) =>
    `<rect class="guide ${selected ? 'filled' : 'blank'}" x="${fmt(x - h)}" y="${fmt(y - h)}" width="${fmt(2 * h)}" height="${fmt(2 * h)}"/>`;
  return (
    `<g data-attractor="${a.id}">` +
    `<path class="${stroke}" d="M${fmt(a.x1)} ${fmt(a.y1)}L${fmt(a.x2)} ${fmt(a.y2)}"/>` +
    handle(a.x1, a.y1) +
    handle(a.x2, a.y2) +
    label((a.x1 + a.x2) / 2 + 3 * h, (a.y1 + a.y2) / 2 - 3 * h) +
    '</g>'
  );
}

// Where a drag of `part` by (dx, dy) moves an attractor that started as `orig`.
export function dragPatch(part, o, dx, dy) {
  if (part === 'p') return { x: o.x + dx, y: o.y + dy };
  if (part === 'a') return { x1: o.x1 + dx, y1: o.y1 + dy };
  if (part === 'b') return { x2: o.x2 + dx, y2: o.y2 + dy };
  return { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
}

// "Punto" and "Linea" drop a new attractor somewhere inside the trimmed sheet. This is UI, not
// physics, so Math.random() is fine: the field itself stays deterministic.
const INSET_MM = 30;
const randomIn = (lo, hi) => lo + Math.random() * (hi - lo);
const randomSpot = () => ({ x: randomIn(INSET_MM, A3.width - INSET_MM), y: randomIn(INSET_MM, A3.height - INSET_MM) });
const round1 = (v) => Math.round(v * 10) / 10;

export const randomPoint = () => {
  const p = randomSpot();
  return newPoint(round1(p.x), round1(p.y));
};

export function randomSegment() {
  let a;
  let b;
  do {
    a = randomSpot();
    b = randomSpot();
  } while (Math.hypot(b.x - a.x, b.y - a.y) < 80);
  return newSegment(round1(a.x), round1(a.y), round1(b.x), round1(b.y));
}

// Pointer on the sheet: click selects an attractor, dragging moves it (a segment's endpoints
// stretch or rotate it). Every move goes through the model, which wakes the blocks: attractors are live.
export function bindSheetTools(view, store, model) {
  const s = store.state;
  const svg = view.svg;
  let drag = null;
  const tolerance = () => HIT_PX / view.pxPerMm();

  function select(id) {
    if (s.selectedId === id) return;
    s.selectedId = id;
    store.emit('selection');
  }

  function add(attractor) {
    select(model.addAttractor(attractor).id);
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = view.toWorld(e.clientX, e.clientY);
    const hit = hitTest(s.attractors, p, tolerance(), s.selectedId);
    select(hit?.id ?? null);
    if (!hit) return;
    svg.setPointerCapture(e.pointerId);
    drag = { ...hit, start: p, orig: { ...s.attractors.find((a) => a.id === hit.id) } };
  });

  svg.addEventListener('pointermove', (e) => {
    const p = view.toWorld(e.clientX, e.clientY);
    if (!drag) {
      svg.classList.toggle('over-attractor', !!hitTest(s.attractors, p, tolerance(), s.selectedId));
      return;
    }
    model.updateAttractor(drag.id, dragPatch(drag.part, drag.orig, p.x - drag.start.x, p.y - drag.start.y));
  });

  const end = () => (drag = null);
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
      e.preventDefault();
      model.removeAttractor(s.selectedId);
      store.emit('selection');
    } else if (e.key === 'Escape') {
      select(null);
    }
  });

  return { select, add };
}
