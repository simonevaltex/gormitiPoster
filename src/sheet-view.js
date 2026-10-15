// The sheet: one SVG whose user units are millimetres. Paper, elements (clipped at the bleed
// edge, like the export), guides on top. Zoom with the wheel or a pinch, pan with space + drag.
import { A3 } from './constants.js';
import { poseTransform } from './recipe.js';
import { attractorGuide } from './attractors.js';
import { fmt } from './svg.js';
import { isTyping } from './ui/dom.js';

const NS = 'http://www.w3.org/2000/svg';
const MARGIN_PX = 32;
// 100% zoom = the A3 at its real print size at 300 ppi (one CSS px per printed pixel).
const PX_PER_MM_300PPI = 300 / 25.4;
const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function createSheetView(svg, store, { onZoom } = {}) {
  const s = store.state;
  svg.innerHTML =
    '<defs><clipPath id="bleed-clip"><rect/></clipPath></defs>' +
    '<rect class="paper fp"/><g class="elements" clip-path="url(#bleed-clip)"></g><g class="guides"></g>';
  const paper = svg.querySelector('.paper');
  const clipRect = svg.querySelector('#bleed-clip rect');
  const elementsLayer = svg.querySelector('.elements');
  const guides = svg.querySelector('.guides');
  const nodes = new Map(); // element id → <g>
  let view = { x: 0, y: 0, w: A3.width, h: A3.height }; // viewBox, mm
  let fitScale = 1; // px per mm when the sheet fits the stage

  const sheetRect = () => ({ x: -s.bleed, y: -s.bleed, w: A3.width + 2 * s.bleed, h: A3.height + 2 * s.bleed });
  const pxPerMm = () => svg.clientWidth / view.w;

  function layoutPaper() {
    const r = sheetRect();
    for (const el of [paper, clipRect]) {
      el.setAttribute('x', fmt(r.x));
      el.setAttribute('y', fmt(r.y));
      el.setAttribute('width', fmt(r.w));
      el.setAttribute('height', fmt(r.h));
    }
  }

  function applyView() {
    svg.setAttribute('viewBox', `${fmt(view.x)} ${fmt(view.y)} ${fmt(view.w)} ${fmt(view.h)}`);
    renderGuides();
    onZoom?.((pxPerMm() / PX_PER_MM_300PPI) * 100);
  }

  function fit() {
    const width = svg.clientWidth;
    const height = svg.clientHeight;
    if (!width || !height) return;
    const r = sheetRect();
    fitScale = Math.min((width - 2 * MARGIN_PX) / r.w, (height - 2 * MARGIN_PX) / r.h);
    const w = width / fitScale;
    const h = height / fitScale;
    view = { x: r.x + r.w / 2 - w / 2, y: r.y + r.h / 2 - h / 2, w, h };
    applyView();
  }

  function toWorld(clientX, clientY) {
    const p = new DOMPoint(clientX, clientY).matrixTransform(svg.getScreenCTM().inverse());
    return { x: p.x, y: p.y };
  }

  function zoomAt(clientX, clientY, factor) {
    const p = toWorld(clientX, clientY);
    const current = pxPerMm();
    const next = clamp(current * factor, fitScale * 0.2, fitScale * 8);
    const f = next / current;
    view = { x: p.x - (p.x - view.x) / f, y: p.y - (p.y - view.y) / f, w: view.w / f, h: view.h / f };
    applyView();
  }

  svg.addEventListener(
    'wheel',
    (e) => {
      e.preventDefault();
      zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY * (e.ctrlKey ? 0.01 : 0.0015))); // ctrl = trackpad pinch
    },
    { passive: false },
  );

  // Space + drag (or middle button) pans. Capture phase, so attractor tools never see it.
  let spaceDown = false;
  let pan = null;
  window.addEventListener('keydown', (e) => {
    if (e.code !== 'Space' || isTyping(e)) return;
    e.preventDefault();
    spaceDown = true;
    svg.classList.add('can-pan');
  });
  window.addEventListener('keyup', (e) => {
    if (e.code !== 'Space') return;
    spaceDown = false;
    svg.classList.remove('can-pan');
  });
  svg.addEventListener(
    'pointerdown',
    (e) => {
      if (!spaceDown && e.button !== 1) return;
      e.stopImmediatePropagation();
      e.preventDefault();
      pan = { x: e.clientX, y: e.clientY, view: { ...view } };
      svg.setPointerCapture(e.pointerId);
      svg.classList.add('panning');
    },
    { capture: true },
  );
  svg.addEventListener(
    'pointermove',
    (e) => {
      if (!pan) return;
      e.stopImmediatePropagation();
      const k = 1 / pxPerMm();
      view = { ...pan.view, x: pan.view.x - (e.clientX - pan.x) * k, y: pan.view.y - (e.clientY - pan.y) * k };
      applyView();
    },
    { capture: true },
  );
  const endPan = (e) => {
    if (!pan) return;
    e.stopImmediatePropagation();
    pan = null;
    svg.classList.remove('panning');
  };
  svg.addEventListener('pointerup', endPan, { capture: true });
  svg.addEventListener('pointercancel', endPan, { capture: true });

  function syncElements() {
    const ids = new Set(s.elements.map((e) => e.id));
    for (const [id, node] of nodes) {
      if (!ids.has(id)) {
        node.remove();
        nodes.delete(id);
      }
    }
    for (const e of s.elements) {
      let node = nodes.get(e.id);
      if (!node) {
        node = document.createElementNS(NS, 'g');
        node.dataset.id = e.id;
        node.innerHTML = e.built.markup;
        nodes.set(e.id, node);
      }
      elementsLayer.append(node); // keeps generation order (later blocks on top)
    }
  }

  function refreshMarkup() {
    for (const e of s.elements) {
      const node = nodes.get(e.id);
      if (node) node.innerHTML = e.built.markup;
    }
  }

  function updatePoses(poses) {
    for (const e of s.elements) {
      const node = nodes.get(e.id);
      const pose = poses.get(e.id);
      if (node && pose) node.setAttribute('transform', poseTransform(pose, e.built.centre));
    }
  }

  function renderGuides() {
    const mmPerPx = 1 / pxPerMm();
    const r = sheetRect();
    let html = `<rect class="guide" x="${fmt(r.x)}" y="${fmt(r.y)}" width="${fmt(r.w)}" height="${fmt(r.h)}"/>`;
    if (s.bleed > 0) html += `<rect class="guide dashed" x="0" y="0" width="${A3.width}" height="${A3.height}"/>`;
    for (const a of s.attractors) html += attractorGuide(a, a.id === s.selectedId, mmPerPx);
    const c = 6 * mmPerPx;
    const { x, y } = s.spawn;
    html +=
      `<g class="spawn-marker"><circle class="guide dashed" cx="${fmt(x)}" cy="${fmt(y)}" r="${fmt(c)}"/>` +
      `<path class="guide" d="M${fmt(x - 2 * c)} ${fmt(y)}H${fmt(x - c)}M${fmt(x + c)} ${fmt(y)}H${fmt(x + 2 * c)}` +
      `M${fmt(x)} ${fmt(y - 2 * c)}V${fmt(y - c)}M${fmt(x)} ${fmt(y + c)}V${fmt(y + 2 * c)}"/></g>`;
    guides.innerHTML = html;
  }

  store.subscribe((topic) => {
    if (topic === 'bleed' || topic === 'load') {
      layoutPaper();
      fit();
    }
    if (topic === 'attractors' || topic === 'selection' || topic === 'spawn' || topic === 'bleed') renderGuides();
    if (topic === 'markup') refreshMarkup();
    if (topic === 'load') {
      for (const node of nodes.values()) node.remove();
      nodes.clear();
    }
  });

  new ResizeObserver(() => fit()).observe(svg);
  layoutPaper();
  fit();

  return { syncElements, updatePoses, renderGuides, fit, toWorld, pxPerMm, svg };
}
