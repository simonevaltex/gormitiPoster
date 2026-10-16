import { boundsOf, regularPolygon } from '../geometry.js';
import { fmt } from '../svg.js';
import { buildStemmaFigure } from '../svg-figure.js';

// Symbols are drawn around (0, 0) inside a circle of radius s (mm), with SVG primitives only.
const SYMBOLS = {
  aria(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    // A wind line ending in a curl: up (bulging right) or down.
    const line = (y, x0, x1, r, up) =>
      `M${P(x0, y)}H${fmt(x1 * s)}A${fmt(r * s)} ${fmt(r * s)} 0 1 ${up ? 0 : 1} ${P(x1, up ? y - 2 * r : y + 2 * r)}`;
    const d = line(-0.42, -0.85, 0.45, 0.2, true) + line(0.02, -0.6, 0.62, 0.16, false) + line(0.46, -0.85, 0.3, 0.18, true);
    return `<path d="${d}" ${paint({ fill: 'none', stroke: 'ink', width: 0.12 * s, cap: 'round', join: 'round' })}/>`;
  },
  foresta(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    const tri = (apexY, baseY, hw) => `M${P(0, apexY)}L${P(hw, baseY)}L${P(-hw, baseY)}Z`;
    const d = tri(-0.92, -0.32, 0.36) + tri(-0.6, 0.08, 0.56) + tri(-0.25, 0.52, 0.76);
    return (
      `<path d="${d}" ${paint({ fill: 'ink' })}/>` +
      `<rect x="${fmt(-0.1 * s)}" y="${fmt(0.5 * s)}" width="${fmt(0.2 * s)}" height="${fmt(0.42 * s)}" ${paint({ fill: 'ink' })}/>`
    );
  },
  luce(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    let d = '';
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      const r2 = i % 2 ? 0.78 : 0.95;
      d += `M${P(Math.cos(a) * 0.48, Math.sin(a) * 0.48)}L${P(Math.cos(a) * r2, Math.sin(a) * r2)}`;
    }
    return (
      `<circle r="${fmt(0.32 * s)}" ${paint({ fill: 'ink' })}/>` +
      `<path d="${d}" ${paint({ fill: 'none', stroke: 'ink', width: 0.1 * s, cap: 'round' })}/>`
    );
  },
  mare(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    const wave = (y) => {
      let d = `M${P(-0.85, y)}`;
      for (let k = 0; k < 4; k++) {
        const x0 = -0.85 + k * 0.425;
        d += `Q${P(x0 + 0.2125, y + (k % 2 ? 0.16 : -0.16))} ${P(x0 + 0.425, y)}`;
      }
      return d;
    };
    const d = wave(-0.42) + wave(0) + wave(0.42);
    return `<path d="${d}" ${paint({ fill: 'none', stroke: 'ink', width: 0.12 * s, cap: 'round', join: 'round' })}/>`;
  },
  tenebre(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    const turns = 2.6;
    const n = 80;
    let d = '';
    for (let i = 0; i <= n; i++) {
      const t = i / n;
      const a = t * turns * Math.PI * 2;
      const r = 0.08 + 0.82 * t;
      d += `${i ? 'L' : 'M'}${P(Math.cos(a) * r, Math.sin(a) * r)}`;
    }
    return `<path d="${d}" ${paint({ fill: 'none', stroke: 'ink', width: 0.12 * s, cap: 'round', join: 'round' })}/>`;
  },
  terra(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    return (
      `<path d="M${P(0, -0.78)}L${P(0.68, 0.18)}L${P(-0.68, 0.18)}Z" ${paint({ fill: 'ink' })}/>` +
      `<path d="M${P(-0.82, 0.44)}H${fmt(0.82 * s)}M${P(-0.56, 0.7)}H${fmt(0.56 * s)}" ${paint({ fill: 'none', stroke: 'ink', width: 0.12 * s, cap: 'round' })}/>`
    );
  },
  vulcano(s, paint) {
    const P = (x, y) => `${fmt(x * s)} ${fmt(y * s)}`;
    const outer =
      `M${P(0, -0.95)}C${P(0.35, -0.5)} ${P(0.68, -0.2)} ${P(0.62, 0.28)}` +
      `C${P(0.56, 0.75)} ${P(0.22, 0.95)} ${P(0, 0.95)}` +
      `C${P(-0.32, 0.95)} ${P(-0.62, 0.7)} ${P(-0.62, 0.3)}` +
      `C${P(-0.62, 0)} ${P(-0.42, -0.25)} ${P(-0.26, -0.45)}` +
      `C${P(-0.2, -0.2)} ${P(-0.06, -0.06)} ${P(0.06, -0.12)}` +
      `C${P(0.12, -0.42)} ${P(0.02, -0.7)} ${P(0, -0.95)}Z`;
    const inner =
      `M${P(0.06, -0.12)}C${P(0.3, 0.12)} ${P(0.36, 0.36)} ${P(0.3, 0.56)}` +
      `C${P(0.25, 0.75)} ${P(0.1, 0.8)} ${P(0, 0.8)}` +
      `C${P(-0.2, 0.8)} ${P(-0.32, 0.6)} ${P(-0.26, 0.4)}` +
      `C${P(-0.2, 0.2)} ${P(0, 0.12)} ${P(0.06, -0.12)}Z`;
    return `<path d="${outer}" ${paint({ fill: 'ink' })}/><path d="${inner}" ${paint({ fill: 'paper' })}/>`;
  },
};

// Round crest: Simone's SVG of the popolo (public/assets/stemmi) inside a double ink ring, see
// buildStemmaFigure. Without the file, a placeholder: paper disc, double ring, simple symbol.
export default {
  type: 'stemma',
  label: 'Stemma',
  defaults: { popolo: 'aria', diameter: 20 },
  build({ popolo, diameter }, ctx) {
    const figure = ctx.stemmi?.get(popolo);
    if (figure) return buildStemmaFigure(figure, diameter, ctx);
    const { paint } = ctx;
    const R = diameter / 2;
    const outer = 0.07 * R;
    const symbol = SYMBOLS[popolo] ?? SYMBOLS.aria;
    const markup =
      `<circle r="${fmt(R - outer / 2)}" ${paint({ fill: 'paper', stroke: 'ink', width: outer })}/>` +
      `<circle r="${fmt(0.8 * R)}" ${paint({ fill: 'none', stroke: 'ink', width: 0.035 * R })}/>` +
      symbol(0.55 * R, paint);
    const poly = regularPolygon(R, 32);
    return { markup, collisionPolygon: poly, bounds: boundsOf(poly) };
  },
};
