import { layoutText } from '../text.js';
import { boundsOf, convexHull } from '../geometry.js';
import { popoloById } from '../popoli.js';
import { fmt } from '../svg.js';
import { OUTLINE_MM } from '../constants.js';
import { buildFigure, FIGURE_PAPER_MM } from '../svg-figure.js';

// "Popolo" and, under it, the element word: Simone's SVG of the popolo (public/assets/popoli) or a
// placeholder sticker. The whole block is `height` mm tall (30 by default).

const corners = (b, grow = 0, dx = 0, dy = 0) => [
  { x: b.x1 - grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y2 + grow + dy },
  { x: b.x1 - grow + dx, y: b.y2 + grow + dy },
];

// Simone's words share one scale, so they keep the proportions they were drawn with: 70 drawing
// units are 1.05 × the cap height of «Popolo». Per unit, times the cap height in mm.
export const POPOLO_WORD_SCALE = 1.05 / 70;
// The word's outline rises this much (× the cap height) over the baseline of «Popolo».
const WORD_RISE = 0.06;
const RINGS_MM = FIGURE_PAPER_MM + OUTLINE_MM; // around the word, as around the figures

const popoloHead = (fonts, c) => layoutText(fonts.regular, 'Popolo', { capHeight: c, tracking: -0.02 });

// Cap height c of «Popolo» and word scale s (mm per drawing unit) for a block `height` tall: from
// the top of «Popolo» to the bottom of the word's rings, which keep their thickness in mm.
export function popoloLayout(word, height, fonts) {
  const top = -popoloHead(fonts, 1).bbox.y1;
  const c = Math.max(height - 2 * RINGS_MM, 1) / (top - WORD_RISE + word.bounds.height * POPOLO_WORD_SCALE);
  return { c, s: POPOLO_WORD_SCALE * c };
}

// The word drawn like a figure (buildFigure): paper band and ink outline around its silhouette.
function popoloWithWord(word, height, { fonts, paint, detail }) {
  const { c, s } = popoloLayout(word, height, fonts);
  const head = popoloHead(fonts, c);
  const figure = buildFigure(word, word.bounds.width * s + 2 * RINGS_MM, { paint, detail });
  const dx = head.bbox.x1 - figure.bounds.x;
  const dy = -WORD_RISE * c - figure.bounds.y;
  const markup = `<path d="${head.lines[0].d}" ${paint({ fill: 'ink' })}/><g transform="translate(${fmt(dx)} ${fmt(dy)})">${figure.markup}</g>`;
  const hull = convexHull([...corners(head.bbox), ...figure.collisionPolygon.map((p) => ({ x: p.x + dx, y: p.y + dy }))]);
  return { markup, collisionPolygon: hull, bounds: boundsOf(hull) };
}

// Placeholder: the element name as a sticker (ink letters, paper halo, ink contour and shadow),
// laid out with a cap height of 1 mm and then scaled to `height`.
function popoloPlaceholder(popolo, height, { fonts, paint }) {
  const c = 1;
  const head = popoloHead(fonts, c);
  const capSticker = 1.05 * c;
  const sticker = layoutText(fonts.bold, popoloById(popolo).name, { capHeight: capSticker, tracking: -0.03, uppercase: true });
  const baseline = 0.04 * c + capSticker; // the sticker's halo just overlaps the foot of «Popolo»
  const halo = 0.11 * c;
  const contour = 0.04 * c;
  const shadow = 0.08 * c;
  const d = sticker.lines[0].d;
  const outline = (fill) => paint({ fill, stroke: fill, width: 2 * (halo + contour), join: 'round' });
  const grow = halo + contour;
  const hull = convexHull([
    ...corners(head.bbox),
    ...corners(sticker.bbox, grow, 0, baseline),
    ...corners(sticker.bbox, grow, shadow, baseline + shadow),
  ]);
  const k = height / boundsOf(hull).height;
  const markup =
    `<g transform="scale(${k})">` +
    `<path d="${head.lines[0].d}" ${paint({ fill: 'ink' })}/>` +
    `<g transform="translate(0 ${fmt(baseline)})">` +
    `<path d="${d}" transform="translate(${fmt(shadow)} ${fmt(shadow)})" ${outline('ink')}/>` +
    `<path d="${d}" ${outline('ink')}/>` +
    `<path d="${d}" ${paint({ fill: 'paper', stroke: 'paper', width: 2 * halo, join: 'round' })}/>` +
    `<path d="${d}" ${paint({ fill: 'ink' })}/>` +
    `</g></g>`;
  const scaled = hull.map((p) => ({ x: p.x * k, y: p.y * k }));
  return { markup, collisionPolygon: scaled, bounds: boundsOf(scaled) };
}

// Posters saved before `height` existed had capHeight: they take the default height.
export function popoloLettering({ popolo, height = 30 }, ctx) {
  const word = ctx.popoli?.get(popolo);
  return word ? popoloWithWord(word, height, ctx) : popoloPlaceholder(popolo, height, ctx);
}

export default {
  type: 'popolo',
  label: 'Popolo',
  defaults: { popolo: 'aria', height: 30 },
  build: popoloLettering,
};
