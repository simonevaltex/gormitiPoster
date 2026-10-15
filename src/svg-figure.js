// Simone's artwork (phase 2): an SVG exported from Illustrator becomes a Gormita. Only the drawing
// comes from the file; the two rings around it are drawn here, so every figure gets the same ones.
// Any dark colour becomes inchiostro and any light one carta, so the drawing follows the palette
// like everything else. DOM-free: the same code runs in the browser and in the tests.
import svgpath from 'svgpath';
import ClipperLib from 'clipper-lib';
import { boundsOf, convexHull, distanceToSegment, regularPolygon, simplifyPolygon } from './geometry.js';
import { fmt } from './svg.js';

export const FIGURE_RING_MM = 2; // width of each ring: paper against the drawing, ink outside it
const RING_TOLERANCE_MM = 0.02; // how far the ring outlines may stray from the exact offset
// Archive thumbnails are about 2 mm per pixel: they skip smaller shapes and simplify outlines.
const THUMBNAIL_MIN_MM = 2;
const THUMBNAIL_TOLERANCE_MM = 0.6;

// ---------- colours ----------

function parseColor(value) {
  let m = value.match(/^#([\da-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3 || h.length === 4) return [0, 1, 2].map((i) => parseInt(h[i] + h[i], 16));
    if (h.length === 6 || h.length === 8) return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
    return null;
  }
  m = value.match(/^rgba?\(([^)]*)\)$/);
  if (!m) return null;
  return m[1]
    .split(/[\s,/]+/)
    .filter(Boolean)
    .slice(0, 3)
    .map((c) => (c.endsWith('%') ? parseFloat(c) * 2.55 : parseFloat(c)));
}

const NAMED = { black: '#000000', white: '#ffffff' };

// 'ink' | 'paper' | 'none'. Unknown colours (gradients included) count as ink.
export function inkOrPaper(value) {
  const v = String(value).trim().toLowerCase();
  if (v === 'none' || v === 'transparent') return 'none';
  const rgb = parseColor(NAMED[v] ?? v);
  if (!rgb) return 'ink';
  return (0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2]) / 255 < 0.5 ? 'ink' : 'paper';
}

// ---------- XML: the subset Illustrator writes ----------

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
const decode = (s) =>
  s.replace(/&(#x[\da-f]+|#\d+|[a-z]+);/gi, (m, e) => {
    if (e[0] !== '#') return ENTITIES[e] ?? m;
    return String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10));
  });

function parseXml(text) {
  const source = text
    .replace(/<!--[\s\S]*?-->/g, '')
    .replace(/<\?[\s\S]*?\?>/g, '')
    .replace(/<!DOCTYPE(?:[^[>]|\[[\s\S]*?\])*>/gi, '')
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, (m, t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;'));
  const root = { name: '', attrs: {}, children: [], text: '' };
  const stack = [root];
  const token = /<(\/?)([\w:.-]+)((?:\s+[\w:.-]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>|([^<]+)/g;
  for (const [, closing, name, rawAttrs, selfClosing, text] of source.matchAll(token)) {
    const top = stack[stack.length - 1];
    if (text !== undefined) {
      top.text += decode(text);
    } else if (closing) {
      const i = stack.findLastIndex((n) => n.name === name);
      if (i > 0) stack.length = i;
    } else {
      const attrs = {};
      for (const [, key, dq, sq] of rawAttrs.matchAll(/([\w:.-]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)) attrs[key] = decode(dq ?? sq);
      const node = { name, attrs, children: [], text: '' };
      top.children.push(node);
      if (!selfClosing) stack.push(node);
    }
  }
  return root;
}

// Elements of other namespaces (Inkscape, Sodipodi…) are editor data, never drawn.
function localName(node) {
  const i = node.name.indexOf(':');
  if (i < 0) return node.name;
  return node.name.slice(0, i) === 'svg' ? node.name.slice(i + 1) : null;
}

// ---------- CSS: the class rules Illustrator writes in <style> ----------

function declarations(text) {
  const out = {};
  for (const part of text.split(';')) {
    const i = part.indexOf(':');
    if (i > 0) out[part.slice(0, i).trim().toLowerCase()] = part.slice(i + 1).replace(/!important/i, '').trim();
  }
  return out;
}

function classRules(css) {
  const rules = new Map();
  for (const [, selectors, body] of css.replace(/\/\*[\s\S]*?\*\//g, '').matchAll(/([^{}]+)\{([^}]*)\}/g)) {
    const decl = declarations(body);
    for (const selector of selectors.split(',')) {
      const m = selector.trim().match(/^\.([\w-]+)$/);
      if (m) rules.set(m[1], { ...rules.get(m[1]), ...decl });
    }
  }
  return rules;
}

// ---------- transforms ----------

const IDENTITY = [1, 0, 0, 1, 0, 0];
const numbers = (s = '') => (s.match(/-?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?/gi) || []).map(Number);
const multiply = ([a, b, c, d, e, f], [g, h, i, j, k, l]) => [
  a * g + c * h,
  b * g + d * h,
  a * i + c * j,
  b * i + d * j,
  a * k + c * l + e,
  b * k + d * l + f,
];

function parseTransform(text) {
  let m = IDENTITY;
  for (const [, fn, args] of (text || '').matchAll(/([a-zA-Z]+)\s*\(([^)]*)\)/g)) {
    const v = numbers(args);
    const rad = ((v[0] || 0) * Math.PI) / 180;
    let t;
    if (fn === 'matrix' && v.length >= 6) t = v.slice(0, 6);
    else if (fn === 'translate') t = [1, 0, 0, 1, v[0] || 0, v[1] || 0];
    else if (fn === 'scale') t = [v[0] ?? 1, 0, 0, v[1] ?? v[0] ?? 1, 0, 0];
    else if (fn === 'rotate') {
      const [, cx = 0, cy = 0] = v;
      const r = [Math.cos(rad), Math.sin(rad), -Math.sin(rad), Math.cos(rad), 0, 0];
      t = multiply(multiply([1, 0, 0, 1, cx, cy], r), [1, 0, 0, 1, -cx, -cy]);
    } else if (fn === 'skewX') t = [1, 0, Math.tan(rad), 1, 0, 0];
    else if (fn === 'skewY') t = [1, Math.tan(rad), 0, 1, 0, 0];
    else continue;
    m = multiply(m, t);
  }
  return m;
}

const isIdentity = (m) => m.every((v, i) => v === IDENTITY[i]);

// ---------- shapes ----------

// Every drawable element as path data in its own coordinates.
function outline(node, name) {
  const a = node.attrs;
  const n = (key) => parseFloat(a[key]) || 0;
  switch (name) {
    case 'path':
      return a.d && a.d.trim() ? a.d.trim() : null;
    case 'polygon':
    case 'polyline': {
      const v = numbers(a.points);
      if (v.length < 4) return null;
      let d = `M${fmt(v[0])} ${fmt(v[1])}`;
      for (let i = 2; i + 1 < v.length; i += 2) d += `L${fmt(v[i])} ${fmt(v[i + 1])}`;
      return name === 'polygon' ? `${d}Z` : d;
    }
    case 'rect': {
      const [x, y, w, h] = [n('x'), n('y'), n('width'), n('height')];
      if (w <= 0 || h <= 0) return null;
      const rx = Math.min(Math.max(a.rx !== undefined ? n('rx') : n('ry'), 0), w / 2);
      const ry = Math.min(Math.max(a.ry !== undefined ? n('ry') : n('rx'), 0), h / 2);
      if (!rx || !ry) return `M${fmt(x)} ${fmt(y)}H${fmt(x + w)}V${fmt(y + h)}H${fmt(x)}Z`;
      const arc = (ex, ey) => `A${fmt(rx)} ${fmt(ry)} 0 0 1 ${fmt(ex)} ${fmt(ey)}`;
      return (
        `M${fmt(x + rx)} ${fmt(y)}H${fmt(x + w - rx)}${arc(x + w, y + ry)}V${fmt(y + h - ry)}${arc(x + w - rx, y + h)}` +
        `H${fmt(x + rx)}${arc(x, y + h - ry)}V${fmt(y + ry)}${arc(x + rx, y)}Z`
      );
    }
    case 'circle':
    case 'ellipse': {
      const [cx, cy] = [n('cx'), n('cy')];
      const rx = name === 'circle' ? n('r') : n('rx');
      const ry = name === 'circle' ? rx : n('ry');
      if (rx <= 0 || ry <= 0) return null;
      const arc = `A${fmt(rx)} ${fmt(ry)} 0 1 0`;
      return `M${fmt(cx - rx)} ${fmt(cy)}${arc} ${fmt(cx + rx)} ${fmt(cy)}${arc} ${fmt(cx - rx)} ${fmt(cy)}Z`;
    }
    case 'line':
      return `M${fmt(n('x1'))} ${fmt(n('y1'))}L${fmt(n('x2'))} ${fmt(n('y2'))}`;
    default:
      return null;
  }
}

const bezier3 = (a, b, c, d, t) => (1 - t) ** 3 * a + 3 * (1 - t) ** 2 * t * b + 3 * (1 - t) * t * t * c + t ** 3 * d;
const bezier2 = (a, b, c, t) => (1 - t) ** 2 * a + 2 * (1 - t) * t * b + t * t * c;
const STEPS = [0.25, 0.5, 0.75];

// The subpaths as polylines, curves flattened: [{ pts, closed }].
function polylines(d) {
  const out = [];
  let line = null;
  svgpath(d)
    .abs()
    .unarc()
    .unshort()
    .iterate((seg, i, x, y) => {
      const c = seg[0];
      if (c === 'Z') {
        if (line) line.closed = true;
        line = null;
        return;
      }
      if (c === 'M' || !line) {
        line = { pts: c === 'M' ? [] : [{ x, y }], closed: false };
        out.push(line);
      }
      const pts = line.pts;
      if (c === 'M' || c === 'L') {
        pts.push({ x: seg[1], y: seg[2] });
      } else if (c === 'H') {
        pts.push({ x: seg[1], y });
      } else if (c === 'V') {
        pts.push({ x, y: seg[1] });
      } else if (c === 'C') {
        for (const t of STEPS) pts.push({ x: bezier3(x, seg[1], seg[3], seg[5], t), y: bezier3(y, seg[2], seg[4], seg[6], t) });
        pts.push({ x: seg[5], y: seg[6] });
      } else if (c === 'Q') {
        for (const t of STEPS) pts.push({ x: bezier2(x, seg[1], seg[3], t), y: bezier2(y, seg[2], seg[4], t) });
        pts.push({ x: seg[3], y: seg[4] });
      }
    });
  return out;
}

// Points along the outline (a stroke widens it by half its width), for the hull and the box.
function samplePoints(d, half) {
  const pts = polylines(d).flatMap((line) => line.pts);
  if (!half) return pts;
  const disc = regularPolygon(half, 8);
  return pts.flatMap((p) => disc.map((q) => ({ x: p.x + q.x, y: p.y + q.y })));
}

// Ramer–Douglas–Peucker: drops the points closer than `tolerance` to the simplified line.
function simplifyLine(pts, tolerance) {
  if (pts.length < 3) return pts;
  const keep = new Uint8Array(pts.length);
  keep[0] = keep[pts.length - 1] = 1;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [a, b] = stack.pop();
    let max = 0;
    let index = -1;
    for (let i = a + 1; i < b; i++) {
      const dist = distanceToSegment(pts[i], pts[a], pts[b]);
      if (dist > max) {
        max = dist;
        index = i;
      }
    }
    if (max > tolerance) {
      keep[index] = 1;
      stack.push([a, index], [index, b]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

// Polylines as compact path data: relative steps in exact units of 10^-digits. With one decimal
// the thumbnails' rounding leaves them as they are. Lines too short to show are dropped.
function encodeLines(lines, digits = 1) {
  const unit = 10 ** digits;
  const tenths = (v) => Math.round(v * unit);
  const num = (n) => String(n / unit).replace(/^(-?)0\./, '$1.');
  let out = '';
  for (const { pts: kept, closed } of lines) {
    if (kept.length < (closed ? 3 : 2)) continue;
    let [px, py] = [tenths(kept[0].x), tenths(kept[0].y)];
    const start = `M${num(px)} ${num(py)}`;
    const steps = [];
    for (const p of kept.slice(1)) {
      const [x, y] = [tenths(p.x), tenths(p.y)];
      if (x === px && y === py) continue;
      steps.push(`${num(x - px)} ${num(y - py)}`);
      [px, py] = [x, y];
    }
    if (steps.length >= (closed ? 2 : 1)) out += `${start}l${steps.join(' ').replace(/ -/g, '-')}${closed ? 'z' : ''}`;
  }
  return out;
}

// Lighter path data for thumbnails: straight lines within `tolerance`, specks dropped.
const simplifiedPath = (d, tolerance) => encodeLines(polylines(d).map((l) => ({ ...l, pts: simplifyLine(l.pts, tolerance) })));

// ---------- the silhouette and its rings (Clipper works in integers: hundredths of a unit) ----------

const CLIPPER_SCALE = 100;
const { Clipper, ClipperOffset, ClipType, EndType, JoinType, PolyFillType, PolyType } = ClipperLib;
const toClipper = (pts) => pts.map((p) => ({ X: Math.round(p.x * CLIPPER_SCALE), Y: Math.round(p.y * CLIPPER_SCALE) }));

function union(paths) {
  const clipper = new Clipper();
  clipper.AddPaths(paths, PolyType.ptSubject, true);
  const out = new ClipperLib.Paths();
  clipper.Execute(ClipType.ctUnion, out, PolyFillType.pftNonZero, PolyFillType.pftNonZero);
  return out;
}

function offset(paths, r, endType, tolerance) {
  const co = new ClipperOffset(2, Math.max(0.25, (tolerance * CLIPPER_SCALE) / 4));
  co.AddPaths(paths, JoinType.jtRound, endType);
  const out = new ClipperLib.Paths();
  co.Execute(out, r * CLIPPER_SCALE);
  return out;
}

// The area the drawing covers: the union of every shape, each one first resolved with its own
// nonzero rule, so that shapes drawn in opposite directions never cancel out where they overlap.
// Computed once per figure, when it is first drawn.
const silhouettes = new WeakMap();
function silhouetteOf(figure) {
  let silhouette = silhouettes.get(figure);
  if (silhouette) return silhouette;
  const regions = [];
  for (const { d, paint } of figure.shapes) {
    const lines = polylines(d);
    const half = paint.stroke === 'none' ? 0 : paint.width / 2;
    let area = [];
    if (paint.fill !== 'none') {
      area = union(lines.filter((l) => l.pts.length >= 3).map((l) => toClipper(l.pts)));
      if (half) area = offset(area, half, EndType.etClosedPolygon, 0.01);
    } else if (half) {
      for (const { pts, closed } of lines) {
        area.push(...offset([toClipper(pts)], half, closed ? EndType.etClosedLine : EndType.etOpenRound, 0.01));
      }
    }
    regions.push(...area);
  }
  silhouette = { area: union(regions), rings: new Map() };
  silhouettes.set(figure, silhouette);
  return silhouette;
}

// The silhouette grown by r (round corners), as path data: one filled shape for each ring.
// Traced drawings are full of hairline gaps; holes narrower than 2r close up anyway, and leaving
// them out keeps the offset fast.
function ringOutline(figure, r, tolerance, digits) {
  const silhouette = silhouetteOf(figure);
  const key = `${r}|${tolerance}|${digits}`;
  if (!silhouette.rings.has(key)) {
    const open = silhouette.area.filter((path) => {
      if (Clipper.Orientation(path)) return true;
      const { width, height } = boundsOf(path.map((q) => ({ x: q.X, y: q.Y })));
      return Math.min(width, height) > 2 * r * CLIPPER_SCALE;
    });
    const lines = offset(open, r, EndType.etClosedPolygon, tolerance).map((path) => {
      const pts = path.map((q) => ({ x: q.X / CLIPPER_SCALE, y: q.Y / CLIPPER_SCALE }));
      return { pts: simplifyLine(pts, tolerance), closed: true };
    });
    silhouette.rings.set(key, encodeLines(lines, digits));
  }
  return silhouette.rings.get(key);
}

const CONTAINERS = new Set(['svg', 'g', 'a']);
const DRAWN = new Set(['path', 'polygon', 'polyline', 'rect', 'circle', 'ellipse', 'line']);
const UNSUPPORTED = new Set(['image', 'text', 'use', 'foreignObject', 'switch']);
const INHERITED = ['fill', 'stroke', 'stroke-width', 'stroke-linejoin', 'stroke-linecap', 'visibility'];
const STYLE_ATTRS = [...INHERITED, 'display', 'clip-path', 'mask'];

// The figure in its own units: shapes in drawing order ({ d, paint, box }), the convex hull of
// the whole silhouette, its bounds, and what was left out (images, text, clipping…).
export function parseFigureSvg(text) {
  const root = parseXml(text);
  const svg = root.children.find((n) => localName(n) === 'svg');
  if (!svg) throw new Error('non è un file SVG');
  let css = '';
  const collectCss = (node) => {
    if (localName(node) === 'style') css += `${node.text}\n`;
    node.children.forEach(collectCss);
  };
  collectCss(svg);
  const rules = classRules(css);
  const shapes = [];
  const unsupported = new Set();

  function addShape(node, name, style, m) {
    const raw = outline(node, name);
    if (!raw) return;
    const fill = inkOrPaper(style.fill ?? '#000');
    const stroke = inkOrPaper(style.stroke ?? 'none');
    if (fill === 'none' && stroke === 'none') return;
    if (/url\(/.test(`${style.fill}${style.stroke}`)) unsupported.add('gradient');
    // Path data Illustrator wrote stays exactly as it is unless something moves it.
    const plain = isIdentity(m) && raw.startsWith('M');
    const d = plain ? raw : svgpath(raw).matrix(m).abs().round(3).toString();
    const paint = { fill, stroke };
    let half = 0;
    if (stroke !== 'none') {
      const width = (parseFloat(style['stroke-width'] ?? '1') || 0) * Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
      paint.width = +width.toFixed(3);
      if (style['stroke-linejoin'] && style['stroke-linejoin'] !== 'miter') paint.join = style['stroke-linejoin'];
      if (style['stroke-linecap'] && style['stroke-linecap'] !== 'butt') paint.cap = style['stroke-linecap'];
      half = width / 2;
    }
    const pts = samplePoints(d, half);
    if (pts.length) shapes.push({ d, paint, box: boundsOf(pts), hull: convexHull(pts) });
  }

  function walk(node, inherited, ctm) {
    const name = localName(node);
    if (!name) return;
    const own = {};
    for (const key of STYLE_ATTRS) if (node.attrs[key] !== undefined) own[key] = node.attrs[key];
    for (const c of (node.attrs.class || '').split(/\s+/)) if (rules.has(c)) Object.assign(own, rules.get(c));
    Object.assign(own, declarations(node.attrs.style || ''));
    if (own.display === 'none') return;
    const style = { ...inherited };
    for (const key of INHERITED) if (own[key] !== undefined && own[key] !== 'inherit') style[key] = own[key];
    if (own['clip-path'] && own['clip-path'] !== 'none') unsupported.add('clip-path');
    if (own.mask && own.mask !== 'none') unsupported.add('mask');
    const m = multiply(ctm, parseTransform(node.attrs.transform));
    if (CONTAINERS.has(name)) node.children.forEach((child) => walk(child, style, m));
    else if (DRAWN.has(name) && style.visibility !== 'hidden' && style.visibility !== 'collapse') addShape(node, name, style, m);
    else if (UNSUPPORTED.has(name)) unsupported.add(name);
  }

  walk(svg, {}, IDENTITY);
  if (!shapes.length) throw new Error('nessuna forma da disegnare');
  const hull = convexHull(shapes.flatMap((s) => s.hull));
  return { shapes: shapes.map(({ hull: _, ...s }) => s), hull, bounds: boundsOf(hull), unsupported: [...unsupported] };
}

// ---------- the Gormita ----------

// { markup, collisionPolygon, bounds } in mm, exactly `width` wide rings included. The drawing
// keeps its own path data inside a scale group. Under it, two filled shapes: the silhouette grown
// by two rings (ink), then by one (paper); the drawing on top covers them but for the bands.
export function buildFigure(figure, width, { paint, detail }) {
  const ring = FIGURE_RING_MM;
  const s = Math.max(width - 4 * ring, 1) / figure.bounds.width;
  const thumbnail = detail === 'thumbnail';
  const minSize = thumbnail ? THUMBNAIL_MIN_MM / s : 0;
  const tolerance = (thumbnail ? THUMBNAIL_TOLERANCE_MM : RING_TOLERANCE_MM) / s;
  // Ring coordinates to a hundredth of a mm or better; thumbnails get one decimal.
  const digits = thumbnail ? 1 : Math.min(4, Math.max(1, Math.ceil(Math.log10(s / 0.01))));
  const shapes = figure.shapes
    .filter((sh) => Math.max(sh.box.width, sh.box.height) >= minSize)
    .map((sh) => (thumbnail ? { ...sh, d: simplifiedPath(sh.d, tolerance) } : sh))
    .filter((sh) => sh.d);
  const rings =
    `<path d="${ringOutline(figure, (2 * ring) / s, tolerance, digits)}" ${paint({ fill: 'ink' })}/>` +
    `<path d="${ringOutline(figure, ring / s, tolerance, digits)}" ${paint({ fill: 'paper' })}/>`;

  // The drawing, in order; consecutive shapes with the same paint share a group.
  let drawing = '';
  let open = null;
  for (const sh of shapes) {
    const key = JSON.stringify(sh.paint);
    if (key !== open) {
      drawing += `${open === null ? '' : '</g>'}<g ${paint(sh.paint)}>`;
      open = key;
    }
    drawing += `<path d="${sh.d}"/>`;
  }
  if (open !== null) drawing += '</g>';

  const markup = `<g transform="scale(${s})">${rings}${drawing}</g>`;
  const disc = regularPolygon(2 * ring, 12);
  const outer = convexHull(figure.hull.flatMap((p) => disc.map((q) => ({ x: p.x * s + q.x, y: p.y * s + q.y }))));
  return { markup, collisionPolygon: simplifyPolygon(outer, 0.02, 40), bounds: boundsOf(outer) };
}
