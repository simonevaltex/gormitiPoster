import { layoutText } from '../text.js';
import { boundsOf, regularPolygon } from '../geometry.js';
import { fmt } from '../svg.js';
import { buildNumeroFigure } from '../svg-figure.js';

// Badge with the poster number (001, 002…): Simone's SVG (public/assets/numero, see
// buildNumeroFigure) or, without it, a star-edged disc. The number is not a parameter: it is the
// number the poster has (or will get) in the archive, passed in through ctx.
export default {
  type: 'numero',
  label: 'Numero',
  defaults: { diameter: 22 },
  build({ diameter }, ctx) {
    const { fonts, paint, posterNumber } = ctx;
    const label = String(posterNumber ?? 0).padStart(3, '0');
    if (ctx.numero) return buildNumeroFigure(ctx.numero, diameter, label, ctx);
    const R = diameter / 2;
    const points = 18;
    const star = Array.from({ length: points * 2 }, (_, i) => {
      const a = (i / (points * 2)) * Math.PI * 2 - Math.PI / 2;
      const r = i % 2 ? 0.88 * R : R;
      return `${fmt(r * Math.cos(a))} ${fmt(r * Math.sin(a))}`;
    });
    const text = layoutText(fonts.mono, label, { capHeight: 0.42 * R, tracking: 0 });
    const b = text.bbox;
    const markup =
      `<path d="M${star.join('L')}Z" ${paint({ fill: 'ink' })}/>` +
      `<circle r="${fmt(0.74 * R)}" ${paint({ fill: 'none', stroke: 'paper', width: 0.025 * R })}/>` +
      `<path d="${text.lines[0].d}" transform="translate(${fmt(-(b.x1 + b.x2) / 2)} ${fmt(-(b.y1 + b.y2) / 2)})" ${paint({ fill: 'paper' })}/>`;
    const poly = regularPolygon(R, 32);
    return { markup, collisionPolygon: poly, bounds: boundsOf(poly) };
  },
};
