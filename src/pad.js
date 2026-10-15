// Start pad: a mini sheet (bleed included) inside a band of about 20% per side that stands for
// "outside the sheet". Dragging the point picks where the next block starts, like the angle
// picker of Photoshop shadows but in two dimensions. The arrow shows the field there.
import { A3 } from './constants.js';
import { fieldAt } from './field.js';
import { fmt } from './svg.js';
import { h, numberField } from './ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const BAND = 0.2;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createPad({ store }) {
  const s = store.state;
  const svg = document.createElementNS(NS, 'svg');
  svg.classList.add('pad');
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Partenza: trascina il punto per scegliere da dove parte il blocco');

  const bounds = () => {
    const b = s.bleed;
    const W = A3.width + 2 * b;
    const H = A3.height + 2 * b;
    return { b, W, H, x0: -b - BAND * W, y0: -b - BAND * H, w: W * (1 + 2 * BAND), h: H * (1 + 2 * BAND) };
  };

  const x = numberField({ label: 'X', unit: 'mm', value: s.spawn.x, step: 0.5, onChange: (v) => setSpawn({ x: v }) });
  const y = numberField({ label: 'Y', unit: 'mm', value: s.spawn.y, step: 0.5, onChange: (v) => setSpawn({ y: v }) });
  const tilt = numberField({
    label: 'Inclinazione iniziale',
    unit: 'gradi',
    value: s.spawn.tilt,
    min: -180,
    max: 180,
    step: 1,
    onChange: (v) => (s.spawn.tilt = v),
  });

  function setSpawn(patch) {
    const r = bounds();
    s.spawn.x = clamp(patch.x ?? s.spawn.x, r.x0, r.x0 + r.w);
    s.spawn.y = clamp(patch.y ?? s.spawn.y, r.y0, r.y0 + r.h);
    store.emit('spawn');
  }

  function render() {
    const r = bounds();
    svg.setAttribute('viewBox', `${fmt(r.x0)} ${fmt(r.y0)} ${fmt(r.w)} ${fmt(r.h)}`);
    const k = r.w / (svg.clientWidth || 300); // mm per screen px
    const outer = `M${fmt(r.x0)} ${fmt(r.y0)}h${fmt(r.w)}v${fmt(r.h)}h${fmt(-r.w)}Z`;
    const sheet = `M${fmt(-r.b)} ${fmt(-r.b)}h${fmt(r.W)}v${fmt(r.H)}h${fmt(-r.W)}Z`;
    let html =
      `<defs><pattern id="pad-hatch" width="${fmt(8 * k)}" height="${fmt(8 * k)}" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
      `<path class="guide" d="M0 0V${fmt(8 * k)}"/></pattern></defs>` +
      `<path d="${outer}${sheet}" fill="url(#pad-hatch)" fill-rule="evenodd"/>` +
      `<path class="guide" d="${outer}"/>` +
      `<path class="guide blank" d="${sheet}"/>`;
    if (r.b > 0) html += `<rect class="guide dashed" x="0" y="0" width="${A3.width}" height="${A3.height}"/>`;
    for (const a of s.attractors) {
      html +=
        a.type === 'point'
          ? `<circle class="guide filled" cx="${fmt(a.x)}" cy="${fmt(a.y)}" r="${fmt(2.5 * k)}"/>`
          : `<path class="guide thick" d="M${fmt(a.x1)} ${fmt(a.y1)}L${fmt(a.x2)} ${fmt(a.y2)}"/>`;
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
    html += `<circle class="guide filled pad-handle" cx="${fmt(s.spawn.x)}" cy="${fmt(s.spawn.y)}" r="${fmt(5 * k)}"/>`;
    svg.innerHTML = html;
    x.set(+s.spawn.x.toFixed(1));
    y.set(+s.spawn.y.toFixed(1));
    tilt.set(s.spawn.tilt);
  }

  const toWorld = (e) => {
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: +p.x.toFixed(1), y: +p.y.toFixed(1) };
  };
  let dragging = false;
  svg.addEventListener('pointerdown', (e) => {
    dragging = true;
    svg.setPointerCapture(e.pointerId);
    setSpawn(toWorld(e));
  });
  svg.addEventListener('pointermove', (e) => dragging && setSpawn(toWorld(e)));
  svg.addEventListener('pointerup', () => (dragging = false));
  svg.addEventListener('pointercancel', () => (dragging = false));

  store.subscribe((t) => ['spawn', 'attractors', 'bleed', 'load'].includes(t) && render());
  new ResizeObserver(() => render()).observe(svg);

  const element = h('div', { class: 'stack' }, svg, h('div', { class: 'grid2' }, x.field, y.field), tilt.field);
  return { element, render };
}
