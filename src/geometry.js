// Plain 2D helpers. Points are { x, y } in mm, y pointing down (SVG convention).

const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);

// Andrew's monotone chain. Drops interior, duplicate and collinear points.
export function convexHull(points) {
  const pts = points.map((p) => ({ x: p.x, y: p.y })).sort((a, b) => a.x - b.x || a.y - b.y);
  if (pts.length < 3) return pts;
  const half = (list) => {
    const out = [];
    for (const p of list) {
      while (out.length >= 2 && cross(out[out.length - 2], out[out.length - 1], p) <= 0) out.pop();
      out.push(p);
    }
    out.pop();
    return out;
  };
  return half(pts).concat(half([...pts].reverse()));
}

// Area-weighted centroid, same formula as Matter.Vertices.centre.
export function polygonCentroid(poly) {
  let area2 = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < poly.length; i++) {
    const p = poly[i];
    const q = poly[(i + 1) % poly.length];
    const c = p.x * q.y - q.x * p.y;
    area2 += c;
    cx += (p.x + q.x) * c;
    cy += (p.y + q.y) * c;
  }
  return { x: cx / (3 * area2), y: cy / (3 * area2) };
}

export const rectPolygon = (x, y, w, h) => [
  { x, y },
  { x: x + w, y },
  { x: x + w, y: y + h },
  { x, y: y + h },
];

export function regularPolygon(r, n, cx = 0, cy = 0) {
  return Array.from({ length: n }, (_, i) => {
    const a = (i / n) * Math.PI * 2;
    return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) };
  });
}

// Smallest distance from c to the lines through the polygon's edges.
export function inradius(poly, c) {
  let r = Infinity;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % poly.length];
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len === 0) continue;
    r = Math.min(r, Math.abs((b.x - a.x) * (a.y - c.y) - (a.x - c.x) * (b.y - a.y)) / len);
  }
  return r;
}

export function circumradius(poly, c) {
  return poly.reduce((r, p) => Math.max(r, Math.hypot(p.x - c.x, p.y - c.y)), 0);
}

export function pointInPolygon(p, poly) {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i];
    const b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

// Bézier control points of the closed uniform Catmull-Rom spline segment i → i+1.
function catmullSegment(pts, i) {
  const n = pts.length;
  const p0 = pts[(i - 1 + n) % n];
  const p1 = pts[i];
  const p2 = pts[(i + 1) % n];
  const p3 = pts[(i + 2) % n];
  return [
    p1,
    { x: p1.x + (p2.x - p0.x) / 6, y: p1.y + (p2.y - p0.y) / 6 },
    { x: p2.x - (p3.x - p1.x) / 6, y: p2.y - (p3.y - p1.y) / 6 },
    p2,
  ];
}

const fmt = (v) => String(+v.toFixed(3));

export function closedCatmullRomPath(pts) {
  let d = `M${fmt(pts[0].x)} ${fmt(pts[0].y)}`;
  for (let i = 0; i < pts.length; i++) {
    const [, c1, c2, p2] = catmullSegment(pts, i);
    d += `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(p2.x)} ${fmt(p2.y)}`;
  }
  return `${d}Z`;
}

export function sampleClosedCatmullRom(pts, perSeg) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const [p1, c1, c2, p2] = catmullSegment(pts, i);
    for (let k = 0; k < perSeg; k++) {
      const t = k / perSeg;
      const u = 1 - t;
      const w0 = u * u * u;
      const w1 = 3 * u * u * t;
      const w2 = 3 * u * t * t;
      const w3 = t * t * t;
      out.push({
        x: w0 * p1.x + w1 * c1.x + w2 * c2.x + w3 * p2.x,
        y: w0 * p1.y + w1 * c1.y + w2 * c2.y + w3 * p2.y,
      });
    }
  }
  return out;
}

// Repeatedly drops the vertex where the outline turns least, until every turn is at least
// minTurnRad and there are no more than maxPts vertices.
export function simplifyPolygon(pts, minTurnRad, maxPts) {
  const out = pts.map((p) => ({ x: p.x, y: p.y }));
  const turn = (i) => {
    const n = out.length;
    const a = out[(i - 1 + n) % n];
    const b = out[i];
    const c = out[(i + 1) % n];
    const ux = b.x - a.x;
    const uy = b.y - a.y;
    const vx = c.x - b.x;
    const vy = c.y - b.y;
    return Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
  };
  while (out.length > 3) {
    let minI = 0;
    let minT = Infinity;
    for (let i = 0; i < out.length; i++) {
      const t = turn(i);
      if (t < minT) {
        minT = t;
        minI = i;
      }
    }
    if (minT >= minTurnRad && out.length <= maxPts) break;
    out.splice(minI, 1);
  }
  return out;
}
