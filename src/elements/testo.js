import { layoutText } from '../text.js';
import { rectPolygon } from '../geometry.js';

// Text blocks: one rigid body, however many lines. Always uppercase, Geist Regular (older
// recipes keep the weight they were saved with). Two kinds, each with its own fixed style:
// Alias (type 'testo', the key older recipes use) is solid ink, Nome is paper with a 0.5 mm ink
// outline.
export const OUTLINE_MM = 0.5;

// Recipes saved before Nome existed carry the style themselves (older still: a paper fill
// meant outline). New Alias blocks have no style and are ink.
const styleOf = (p) => p.style ?? (p.fill === 'paper' ? 'outline' : 'ink');

export function buildText(p, outline, { fonts, paint }) {
  const font = fonts[p.weight] ?? fonts.regular;
  const layout = layoutText(font, p.text, { capHeight: p.capHeight, uppercase: true });
  const d = layout.lines.map((line) => line.d).join('');
  const sw = outline ? OUTLINE_MM : 0;
  // Outer stroke of width sw: a 2·sw stroke behind the fill (svg2pdf has no paint-order).
  const back = outline ? `<path d="${d}" ${paint({ fill: 'ink', stroke: 'ink', width: 2 * sw, join: 'round' })}/>` : '';
  const markup = `${back}<path d="${d}" ${paint({ fill: outline ? 'paper' : 'ink' })}/>`;
  const b = layout.bbox;
  const bounds = { x: b.x1 - sw, y: b.y1 - sw, width: b.x2 - b.x1 + 2 * sw, height: b.y2 - b.y1 + 2 * sw };
  return { markup, collisionPolygon: rectPolygon(bounds.x, bounds.y, bounds.width, bounds.height), bounds };
}

const validate = (p) => (p.text.trim() ? null : 'empty-text');

export const nome = {
  type: 'nome',
  label: 'Nome',
  defaults: { text: 'Luminescente', weight: 'regular', capHeight: 30 },
  validate,
  build: (p, ctx) => buildText(p, true, ctx),
};

export default {
  type: 'testo',
  label: 'Alias',
  defaults: { text: 'Sommo', weight: 'regular', capHeight: 30 },
  validate,
  build: (p, ctx) => buildText(p, styleOf(p) === 'outline', ctx),
};
