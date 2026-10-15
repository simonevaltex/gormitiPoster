import { layoutText } from '../text.js';
import { boundsOf, convexHull } from '../geometry.js';
import { popoloById } from '../popoli.js';
import { fmt } from '../svg.js';

const corners = (b, grow = 0, dx = 0, dy = 0) => [
  { x: b.x1 - grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y1 - grow + dy },
  { x: b.x2 + grow + dx, y: b.y2 + grow + dy },
  { x: b.x1 - grow + dx, y: b.y2 + grow + dy },
];

// Placeholder lettering for "Popolo dell’ELEMENTO". Phase 2 replaces this function with
// Simone's SVGs: it only has to return the markup and the collision outline.
export function popoloLettering({ popolo, capHeight: c }, { fonts, paint }) {
  const { name, article } = popoloById(popolo);
  const leading = 0.82;
  const head = layoutText(fonts.regular, `Popolo\n${article}`, { capHeight: c, lineHeight: leading, tracking: -0.02 });
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
  defaults: { popolo: 'aria', capHeight: 22 },
  build: popoloLettering,
};
