// Start pad: a mini sheet (bleed included) inside a band of about 20% per side that stands for
// "outside the sheet". Dragging the point picks where the next block starts, like the angle
// picker of Photoshop shadows but in two dimensions. The arrow shows the field there.
// The attractors are drawn too and can be selected and dragged right here, like on the sheet.
import { A3 } from './constants.js';
import { fieldAt } from './field.js';
import { hitTest, dragPatch } from './attractors.js';
import { fmt } from './svg.js';

const NS = 'http://www.w3.org/2000/svg';
const BAND = 0.2;
const HIT_PX = 7;
const MAX_HEIGHT_PX = 400;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createPad({ store, model, select }) {
  const s = store.state;
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('pad');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Partenza: trascina il punto per scegliere da dove parte il blocco, trascina gli attrattori per spostarli');

  const bounds = () => {
    const b = s.bleed;
    const W = A3.width + 2 * b;
    const H = A3.height + 2 * b;
    return { b, W, H, x0: -b - BAND * W, y0: -b - BAND * H, w: W * (1 + 2 * BAND), h: H * (1 + 2 * BAND) };
  };

  function setSpawn(patch) {
    const r = bounds();
    s.spawn.x = clamp(patch.x ?? s.spawn.x, r.x0, r.x0 + r.w);
    s.spawn.y = clamp(patch.y ?? s.spawn.y, r.y0, r.y0 + r.h);
    store.emit('spawn');
  }

  const mmPerPx = () => {
    const r = bounds();
    return Math.max(r.w / (svg.clientWidth || 300), r.h / (svg.clientHeight || 420));
  };

  function render() {
    const r = bounds();
    svg.setAttribute('viewBox', `${fmt(r.x0)} ${fmt(r.y0)} ${fmt(r.w)} ${fmt(r.h)}`);
    // Never taller than MAX_HEIGHT_PX: the width follows the sheet proportions.
    svg.style.aspectRatio = `${fmt(r.w)} / ${fmt(r.h)}`;
    svg.style.maxWidth = `${fmt((MAX_HEIGHT_PX * r.w) / r.h)}px`;
    const k = mmPerPx();
    const outer = `M${fmt(r.x0)} ${fmt(r.y0)}h${fmt(r.w)}v${fmt(r.h)}h${fmt(-r.w)}Z`;
    const sheet = `M${fmt(-r.b)} ${fmt(-r.b)}h${fmt(r.W)}v${fmt(r.H)}h${fmt(-r.W)}Z`;
    let html =
      `<defs><pattern id="pad-hatch" width="${fmt(8 * k)}" height="${fmt(8 * k)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<path class="guide" d="M0 0V${fmt(8 * k)}"/></pattern></defs>` +
      `<path d="${outer}${sheet}" fill="url(#pad-hatch)" fill-rule="evenodd"/>` +
      `<path class="guide" d="${outer}"/>` +
      `<path class="guide blank" d="${sheet}"/>`;
    if (r.b > 0) html += `<rect class="guide dashed" x="0" y="0" width="${A3.width}" height="${A3.height}"/>`;
    const handle = (x, y, selected) =>
      `<rect class="guide ${selected ? 'filled' : 'blank'}" x="${fmt(x - 2.5 * k)}" y="${fmt(y - 2.5 * k)}" width="${fmt(5 * k)}" height="${fmt(5 * k)}"/>`;
    for (const a of s.attractors) {
      const selected = a.id === s.selectedId;
      html +=
        a.type === 'point'
          ? handle(a.x, a.y, selected)
          : `<path class="guide${selected ? ' thick' : ''}" d="M${fmt(a.x1)} ${fmt(a.y1)}L${fmt(a.x2)} ${fmt(a.y2)}"/>` +
            handle(a.x1, a.y1, selected) +
            handle(a.x2, a.y2, selected);
    }
    const f = fieldAt(s.spawn.x, s.spawn.y, s.attractors);
    const m = Math.hypot(f.x, f.y);
    if (m > 0) {
      const len = 34 * k;
      const ux = f.x / m;
      const uy = f.y / m;
      const tx = s.spawn.x + ux * len;
      const ty = s.spawn.y + uy * len;
      const head = 6 * k;
      html +=
        `<path class="guide" d="M${fmt(s.spawn.x)} ${fmt(s.spawn.y)}L${fmt(tx)} ${fmt(ty)}"/>` +
        `<path class="guide filled" d="M${fmt(tx)} ${fmt(ty)}L${fmt(tx - ux * head - uy * head * 0.6)} ${fmt(ty - uy * head + ux * head * 0.6)}` +
        `L${fmt(tx - ux * head + uy * head * 0.6)} ${fmt(ty - uy * head - ux * head * 0.6)}Z"/>`;
    }
    html += `<circle class="guide filled pad-handle" cx="${fmt(s.spawn.x)}" cy="${fmt(s.spawn.y)}" r="${fmt(3.5 * k)}"/>`;
    svg.innerHTML = html;
  }

  const toWorld = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
  };
  // Pressing on an attractor grabs it (the start point wins when they overlap); anywhere else
  // moves the start point.
  let drag = null;
  svg.addEventListener('pointerdown', (e) => {
    svg.setPointerCapture(e.pointerId);
    const p = toWorld(e);
    const tol = HIT_PX * mmPerPx();
    const onSpawn = Math.hypot(p.x - s.spawn.x, p.y - s.spawn.y) <= tol;
    const hit = !onSpawn && hitTest(s.attractors, p, tol, s.selectedId);
    if (hit) {
      select(hit.id);
      drag = { ...hit, start: p, orig: { ...s.attractors.find((a) => a.id === hit.id) } };
    } else {
      drag = { spawn: true };
      setSpawn(p);
    }
  });
  svg.addEventListener('pointermove', (e) => {
    const p = toWorld(e);
    if (!drag) {
      svg.classList.toggle('over-attractor', !!hitTest(s.attractors, p, HIT_PX * mmPerPx(), s.selectedId));
      return;
    }
    if (drag.spawn) setSpawn(p);
    else model.updateAttractor(drag.id, dragPatch(drag.part, drag.orig, p.x - drag.start.x, p.y - drag.start.y));
  });
  svg.addEventListener('pointerup', () => (drag = null));
  svg.addEventListener('pointercancel', () => (drag = null));

  store.subscribe((t) => ['spawn', 'attractors', 'selection', 'bleed', 'load'].includes(t) && render());
  new ResizeObserver(() => render()).observe(svg);

  return { element: svg, render };
}
