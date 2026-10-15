// The "recipe" is what the archive stores: parameters and final poses, never the PDF. The same
// composer draws exports (exact hex colours) and archive thumbnails (screen colour classes).
import { A3, EXPORT } from './constants.js';
import { buildElement } from './elements/index.js';
import { fmt } from './svg.js';

export const RECIPE_VERSION = 1;

// Thumbnails stay light: one decimal (a tenth of a mm) is plenty at that size. A figure's scale
// is left exact, or the whole drawing would shrink or grow.
export const lightenSvg = (svg) =>
  svg.replace(/scale\([^)]*\)|-?\d+\.\d+/g, (m) => (m.startsWith('scale') ? m : String(+(+m).toFixed(1))));

// Matter keeps body.position at the centroid of the collision polygon.
export const poseTransform = (pose, centre) =>
  `translate(${fmt(pose.x)} ${fmt(pose.y)}) rotate(${fmt((pose.angle * 180) / Math.PI)}) ` +
  `translate(${fmt(-centre.x)} ${fmt(-centre.y)})`;

// Crop marks along the trim lines, in the slug: from 2 mm outside the bleed to 1 mm from the edge.
function cropMarks(bleed, slug, paint) {
  const near = bleed + 2;
  const far = bleed + slug - 1;
  let d = '';
  for (const x of [0, A3.width]) {
    for (const y of [0, A3.height]) {
      const sx = x === 0 ? -1 : 1;
      const sy = y === 0 ? -1 : 1;
      d += `M${fmt(x + sx * near)} ${fmt(y)}H${fmt(x + sx * far)}`;
      d += `M${fmt(x)} ${fmt(y + sy * near)}V${fmt(y + sy * far)}`;
    }
  }
  return `<path d="${d}" ${paint({ fill: 'none', stroke: 'ink', width: EXPORT.cropMarkWidth })}/>`;
}

export function composeSheetSvg(
  recipe,
  { fonts, figures, paint, cropMarks: withMarks = false, slug = EXPORT.slug, idPrefix = 'sheet', posterNumber = recipe.number, detail },
) {
  const bleed = recipe.bleed;
  const s = withMarks ? slug : 0;
  const width = A3.width + 2 * (bleed + s);
  const height = A3.height + 2 * (bleed + s);
  const origin = -(bleed + s);
  const ctx = { fonts, figures, paint, posterNumber, detail };
  const elements = recipe.elements
    .map((el) => {
      const built = buildElement(el.type, el.params, ctx);
      return `<g transform="${poseTransform(el, built.centre)}">${built.markup}</g>`;
    })
    .join('');
  const clipId = `${idPrefix}-bleed`;
  const bleedRect = `x="${fmt(-bleed)}" y="${fmt(-bleed)}" width="${fmt(A3.width + 2 * bleed)}" height="${fmt(A3.height + 2 * bleed)}"`;
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${fmt(width)}mm" height="${fmt(height)}mm" ` +
    `viewBox="${fmt(origin)} ${fmt(origin)} ${fmt(width)} ${fmt(height)}">` +
    `<defs><clipPath id="${clipId}"><rect ${bleedRect}/></clipPath></defs>` +
    `<rect ${bleedRect} ${paint({ fill: 'paper' })}/>` +
    `<g clip-path="url(#${clipId})">${elements}</g>` +
    (withMarks ? cropMarks(bleed, s, paint) : '') +
    '</svg>';
  return { svg, width, height, bleed, slug: s };
}
