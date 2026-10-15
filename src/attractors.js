// Attractors: factories, hit testing, their guides and the sheet tools. Guides are thin dashed
// lines sized in screen pixels (mmPerPx converts), and never appear in exports or thumbnails.
import { DEFAULTS } from './constants.js';
import { fmt } from './svg.js';
import { isTyping } from './ui/dom.js';

const HIT_PX = 9;
const MIN_SEGMENT_MM = 5;

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
    selected ? `<text class="guide-label" x="${fmt(x)}" y="${fmt(y)}" font-size="${px(11)}">${a.strength}</text>` : '';
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

// Pointer tools on the sheet. Select/move is the default; "+ Punto" places a point with a click,
// "+ Segmento" draws one by dragging; both return to select with the new attractor selected.
// Every move goes through the model, which wakes the blocks: attractors are live.
export function bindSheetTools(view, store, model) {
  const s = store.state;
  const svg = view.svg;
  let drag = null;
  const tolerance = () => HIT_PX / view.pxPerMm();

  function setTool(tool) {
    s.tool = tool;
    svg.classList.toggle('tool-point', tool === 'point');
    svg.classList.toggle('tool-segment', tool === 'segment');
    store.emit('tool');
  }

  function select(id) {
    if (s.selectedId === id) return;
    s.selectedId = id;
    store.emit('selection');
  }

  svg.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    const p = view.toWorld(e.clientX, e.clientY);
    if (s.tool === 'point') {
      select(model.addAttractor(newPoint(p.x, p.y)).id);
      setTool('select');
      return;
    }
    svg.setPointerCapture(e.pointerId);
    if (s.tool === 'segment') {
      drag = { creating: true, a: p, b: p };
      return;
    }
    const hit = hitTest(s.attractors, p, tolerance(), s.selectedId);
    select(hit?.id ?? null);
    if (hit) drag = { ...hit, start: p, orig: { ...s.attractors.find((a) => a.id === hit.id) } };
  });

  svg.addEventListener('pointermove', (e) => {
    const p = view.toWorld(e.clientX, e.clientY);
    if (!drag) {
      if (s.tool === 'select') svg.classList.toggle('over-attractor', !!hitTest(s.attractors, p, tolerance(), s.selectedId));
      return;
    }
    if (drag.creating) {
      drag.b = p;
      view.renderPreview(drag.a, drag.b);
      return;
    }
    const dx = p.x - drag.start.x;
    const dy = p.y - drag.start.y;
    const o = drag.orig;
    const patch =
      drag.part === 'p'
        ? { x: o.x + dx, y: o.y + dy }
        : drag.part === 'a'
          ? { x1: o.x1 + dx, y1: o.y1 + dy }
          : drag.part === 'b'
            ? { x2: o.x2 + dx, y2: o.y2 + dy }
            : { x1: o.x1 + dx, y1: o.y1 + dy, x2: o.x2 + dx, y2: o.y2 + dy };
    model.updateAttractor(drag.id, patch);
  });

  const end = () => {
    if (drag?.creating) {
      view.renderPreview(null);
      const { a, b } = drag;
      if (Math.hypot(b.x - a.x, b.y - a.y) >= MIN_SEGMENT_MM) select(model.addAttractor(newSegment(a.x, a.y, b.x, b.y)).id);
      setTool('select');
    }
    drag = null;
  };
  svg.addEventListener('pointerup', end);
  svg.addEventListener('pointercancel', end);

  window.addEventListener('keydown', (e) => {
    if (isTyping(e)) return;
    if ((e.key === 'Delete' || e.key === 'Backspace') && s.selectedId) {
      e.preventDefault();
      model.removeAttractor(s.selectedId);
      store.emit('selection');
    } else if (e.key === 'Escape') {
      if (s.tool !== 'select') setTool('select');
      else select(null);
    }
  });

  return { setTool, select };
}
