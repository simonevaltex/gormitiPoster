import { hashString, mulberry32 } from '../random.js';
import {
  boundsOf,
  closedCatmullRomPath,
  convexHull,
  distanceToOutline,
  pointInPolygon,
  regularPolygon,
  sampleClosedCatmullRom,
  simplifyPolygon,
} from '../geometry.js';
import { fmt } from '../svg.js';

// Placeholder figure until Simone's SVGs arrive (phase 2). Everything is generated in a unit
// space from the name, so the same name always gives the same figure.

const CONTOUR = 0.035; // width of each of the two outer rings (paper, then ink)
const LIMB = 0.12; // stroke width of arms and horns

export const normaliseName = (name) => name.trim().toLowerCase().replace(/\s+/g, ' ');

const rotate = (v, a) => ({ x: v.x * Math.cos(a) - v.y * Math.sin(a), y: v.x * Math.sin(a) + v.y * Math.cos(a) });

export function gormitaShape(name) {
  const rng = mulberry32(hashString(normaliseName(name)));
  const n = 14 + Math.floor(rng() * 9);
  const stretch = 1.1 + rng() * 0.3;
  const raw = Array.from({ length: n }, () => 1 + (rng() * 2 - 1) * 0.28);
  const radii = raw.map((r, i) => 0.25 * raw[(i - 1 + n) % n] + 0.5 * r + 0.25 * raw[(i + 1) % n]);
  const points = radii.map((r, i) => {
    const a = ((i + (rng() - 0.5) * 0.5) / n) * Math.PI * 2 - Math.PI / 2;
    return { x: r * Math.cos(a), y: r * Math.sin(a) * stretch };
  });

  const appendages = [];
  const used = new Set();
  const count = 1 + Math.floor(rng() * 3);
  for (let k = 0; k < count; k++) {
    let j = Math.floor(rng() * n);
    while (used.has(j)) j = (j + 1) % n;
    used.add(j);
    const p = points[j];
    const len = Math.hypot(p.x, p.y);
    const dir = rotate({ x: p.x / len, y: p.y / len }, (rng() - 0.5) * 0.8);
    const length = 0.35 + rng() * 0.35;
    const bend = (rng() - 0.5) * 0.3;
    const start = { x: p.x * 0.85, y: p.y * 0.85 };
    const end = { x: p.x + dir.x * length, y: p.y + dir.y * length };
    const control = { x: (start.x + end.x) / 2 - dir.y * bend, y: (start.y + end.y) / 2 + dir.x * bend };
    appendages.push({ start, control, end });
  }

  const outline = sampleClosedCatmullRom(points, 12);
  const spots = [];
  const wanted = 3 + Math.floor(rng() * 5);
  for (let guard = 0; spots.length < wanted && guard < 500; guard++) {
    const c = { x: (rng() * 2 - 1) * 0.9, y: (rng() * 2 - 1) * 0.9 * stretch };
    const rx = 0.03 + rng() * 0.05;
    const ry = 0.02 + rng() * 0.04;
    const rot = rng() * 180;
    if (!pointInPolygon(c, outline) || distanceToOutline(c, outline) < 0.15) continue;
    spots.push({ x: c.x, y: c.y, rx, ry, rot });
  }
  return { points, appendages, spots };
}

function sampleQuad({ start, control, end }, steps) {
  return Array.from({ length: steps + 1 }, (_, i) => {
    const t = i / steps;
    const u = 1 - t;
    return {
      x: u * u * start.x + 2 * u * t * control.x + t * t * end.x,
      y: u * u * start.y + 2 * u * t * control.y + t * t * end.y,
    };
  });
}

// Outer silhouette (both rings included) as a point cloud, in unit space.
function silhouette(shape) {
  const pts = [];
  const ring = regularPolygon(2 * CONTOUR, 12);
  for (const p of sampleClosedCatmullRom(shape.points, 16)) for (const q of ring) pts.push({ x: p.x + q.x, y: p.y + q.y });
  const limbRing = regularPolygon(LIMB / 2 + 2 * CONTOUR, 12);
  for (const a of shape.appendages) {
    for (const p of sampleQuad(a, 12)) for (const q of limbRing) pts.push({ x: p.x + q.x, y: p.y + q.y });
  }
  return pts;
}

export default {
  type: 'gormita',
  label: 'Gormita',
  defaults: { name: 'Gormita', width: 180 },
  validate: (p) => (normaliseName(p.name) ? null : 'empty-name'),
  build({ name, width }, { paint }) {
    const shape = gormitaShape(name);
    const cloud = silhouette(shape);
    const s = width / boundsOf(cloud).width;
    const S = (p) => ({ x: p.x * s, y: p.y * s });
    const P = (p) => `${fmt(p.x * s)} ${fmt(p.y * s)}`;
    const body = closedCatmullRomPath(shape.points.map(S));
    const limbs = shape.appendages.map((a) => `M${P(a.start)}Q${P(a.control)} ${P(a.end)}`).join('');
    const c = CONTOUR * s;
    const w = LIMB * s;
    const limb = (stroke, width) => paint({ fill: 'none', stroke, width, cap: 'round', join: 'round' });
    // Triple contour by layering: ink silhouette, paper silhouette slightly smaller, ink figure.
    const markup =
      `<path d="${body}" ${paint({ fill: 'ink', stroke: 'ink', width: 4 * c, join: 'round' })}/>` +
      `<path d="${limbs}" ${limb('ink', w + 4 * c)}/>` +
      `<path d="${body}" ${paint({ fill: 'paper', stroke: 'paper', width: 2 * c, join: 'round' })}/>` +
      `<path d="${limbs}" ${limb('paper', w + 2 * c)}/>` +
      `<path d="${body}" ${paint({ fill: 'ink' })}/>` +
      `<path d="${limbs}" ${limb('ink', w)}/>` +
      shape.spots
        .map(
          (sp) =>
            `<ellipse cx="${fmt(sp.x * s)}" cy="${fmt(sp.y * s)}" rx="${fmt(sp.rx * s)}" ry="${fmt(sp.ry * s)}" ` +
            `transform="rotate(${fmt(sp.rot)} ${fmt(sp.x * s)} ${fmt(sp.y * s)})" ${paint({ fill: 'paper' })}/>`,
        )
        .join('');
    const scaled = cloud.map(S);
    const hull = simplifyPolygon(convexHull(scaled), 0.02, 40);
    return { markup, collisionPolygon: hull, bounds: boundsOf(scaled) };
  },
};
