import { layoutText } from '../text.js';
import { boundsOf, convexHull } from '../geometry.js';
import { popoloById } from '../popoli.js';
import { fmt } from '../svg.js';
import { drawingMarkup } from '../svg-figure.js';

const corners = (b, grow = 0, dx = 0, dy = 0) => [
  { x: b.x1 - grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y2 + grow + dy },
  { x: b.x1 - grow + dx, y: b.y2 + grow + dy },
];

// Simone's element words (public/assets/popoli) share one scale, so they keep the proportions
// they were drawn with: 70 drawing units are 1.05 × the cap height of «Popolo», the size of the
// placeholder word. Per unit, times the cap height in mm.
export const POPOLO_WORD_SCALE = 1.05 / 70;

const LEADING = 0.82;
const headLines = (fonts, article, c) => layoutText(fonts.regular, `Popolo\n${article}`, { capHeight: c, lineHeight: LEADING, tracking: -0.02 });

// «Popolo» and the article in Geist Regular, then Simone's word as drawn (letters, outline and
// shadow are in the file), its top just over the article's baseline.
function popoloWithWord(word, { popolo, capHeight: c }, { fonts, paint, detail }) {
  const lines = headLines(fonts, popoloById(popolo).article, c);
  const s = POPOLO_WORD_SCALE * c;
  const x = lines.bbox.x1 - word.bounds.x * s;
  const y = LEADING * lines.fontSize - 0.06 * c - word.bounds.y * s;
  const markup =
    `<path d="${lines.lines.map((l) => l.d).join('')}" ${paint({ fill: 'ink' })}/>` +
    `<g transform="translate(${fmt(x)} ${fmt(y)}) scale(${s})">${drawingMarkup(word, s, paint, detail)}</g>`;
  const hull = convexHull([...corners(lines.bbox), ...word.hull.map((p) => ({ x: x + p.x * s, y: y + p.y * s }))]);
  return { markup, collisionPolygon: hull, bounds: boundsOf(hull) };
}

// "Popolo dell’ELEMENTO": with Simone's SVG of the popolo when there is one (see popoloWithWord),
// otherwise a placeholder sticker. Either way it returns the markup and the collision outline.
export function popoloLettering(params, ctx) {
  const word = ctx.popoli?.get(params.popolo);
  if (word) return popoloWithWord(word, params, ctx);
  const { popolo, capHeight: c } = params;
  const { fonts, paint } = ctx;
  const { name, article } = popoloById(popolo);
  const leading = LEADING;
  const head = headLines(fonts, article, c);
  const capSticker = 1.05 * c;
  const sticker = layoutText(fonts.bold, name, { capHeight: capSticker, tracking: -0.03, uppercase: true });
  // The sticker sits just under the article: only its halo overlaps the article's foot.
  const baseline = leading * head.fontSize + 0.04 * c + capSticker;
  const halo = 0.11 * c;
  const contour = 0.04 * c;
  const shadow = 0.08 * c;
  const d = sticker.lines[0].d;
  const outline = (fill) => paint({ fill, stroke: fill, width: 2 * (halo + contour), join: 'round' });

  const markup =
    `<path d="${head.lines.map((l) => l.d).join('')}" ${paint({ fill: 'ink' })}/>` +
    `<g transform="translate(0 ${fmt(baseline)})">` +
    `<path d="${d}" transform="translate(${fmt(shadow)} ${fmt(shadow)})" ${outline('ink')}/>` +
    `<path d="${d}" ${outline('ink')}/>` +
    `<path d="${d}" ${paint({ fill: 'paper', stroke: 'paper', width: 2 * halo, join: 'round' })}/>` +
    `<path d="${d}" ${paint({ fill: 'ink' })}/>` +
    `</g>`;

  const grow = halo + contour;
  const hull = convexHull([
    ...corners(head.bbox),
    ...corners(sticker.bbox, grow, 0, baseline),
    ...corners(sticker.bbox, grow, shadow, baseline + shadow),
  ]);
  return { markup, collisionPolygon: hull, bounds: boundsOf(hull) };
}

export default {
  type: 'popolo',
  label: 'Popolo',
  defaults: { popolo: 'aria', capHeight: 30 },
  build: popoloLettering,
};
