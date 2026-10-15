// Gravitational field of the attractors. Pure functions, no Matter dependency.
import { FIELD } from './constants.js';

// Nearest point of an attractor; for a segment the projection is clamped to its endpoints.
export function closestPoint(att, x, y) {
  if (att.type === 'point') return { x: att.x, y: att.y };
  const dx = att.x2 - att.x1;
  const dy = att.y2 - att.y1;
  const len2 = dx * dx + dy * dy;
  const t = len2 === 0 ? 0 : Math.max(0, Math.min(1, ((x - att.x1) * dx + (y - att.y1) * dy) / len2));
  return { x: att.x1 + t * dx, y: att.y1 + t * dy };
}

// Acceleration in mm/ms²: Σ strength·k / (d² + eps²) toward each attractor, capped at maxAccel.
export function fieldAt(x, y, attractors, k = FIELD.k) {
  let fx = 0;
  let fy = 0;
  for (const att of attractors) {
    const q = closestPoint(att, x, y);
    const dx = q.x - x;
    const dy = q.y - y;
    const d = Math.hypot(dx, dy);
    if (d === 0) continue;
    const mag = (att.strength * k) / (d * d + FIELD.eps * FIELD.eps);
    fx += (mag * dx) / d;
    fy += (mag * dy) / d;
  }
  const m = Math.hypot(fx, fy);
  if (m > FIELD.maxAccel) {
    fx *= FIELD.maxAccel / m;
    fy *= FIELD.maxAccel / m;
  }
  return { x: fx, y: fy };
}

// SVG rotation (clockwise positive) that points the element's local +y along the force.
export const targetAngle = (fx, fy) => Math.atan2(-fx, fy);

// Signed shortest rotation from current to target, in (−π, π].
export function angleDiff(target, current) {
  let d = (target - current) % (2 * Math.PI);
  if (d > Math.PI) d -= 2 * Math.PI;
  if (d <= -Math.PI) d += 2 * Math.PI;
  return d;
}
