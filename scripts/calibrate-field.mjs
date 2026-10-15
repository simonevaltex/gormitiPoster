// Finds FIELD.k such that a 40 mm block, 200 mm from a strength-50 point, touches it in 1 s.
// Usage: node scripts/calibrate-field.mjs   (re-run after changing caps, substeps or frictionAir)
import { FIELD, STEP_MS, DEFAULT_SETTINGS } from '../src/constants.js';
import { createPhysics } from '../src/physics.js';
import { rectPolygon } from '../src/geometry.js';

const TARGET_MS = 1000;

function fallTime(k) {
  FIELD.k = k;
  const p = createPhysics();
  p.rebuild({ attractors: [{ id: 'c', type: 'point', x: 0, y: 0, strength: 50 }], elements: [], settings: DEFAULT_SETTINGS });
  p.addElement({ id: 'b', polygon: rectPolygon(-20, -20, 40, 40), x: 0, y: -200, angle: 0 });
  let n = 0;
  while (p.poses().get('b').y < -21.5 && n < 2000) {
    p.step();
    n++;
  }
  return n * STEP_MS;
}

let lo = 0.01;
let hi = 2;
for (let i = 0; i < 40; i++) {
  const mid = (lo + hi) / 2;
  if (fallTime(mid) > TARGET_MS) lo = mid;
  else hi = mid;
}
const k = +hi.toFixed(4);
console.log(`FIELD.k = ${k}  (fall time ${fallTime(k).toFixed(0)} ms)`);
