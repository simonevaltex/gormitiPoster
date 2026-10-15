// Attractors: factories, hit testing and their guides. Guides are thin dashed lines sized in
// screen pixels (mmPerPx converts), and never appear in exports or thumbnails.
import { DEFAULTS } from './constants.js';
import { fmt } from './svg.js';

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
