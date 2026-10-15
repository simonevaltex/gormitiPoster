import { layoutText } from '../text.js';
import { rectPolygon } from '../geometry.js';

// Free text block: title, second name, anything. One rigid body, however many lines.
// Always uppercase, Geist Regular (older recipes keep the weight they were saved with).
// Two styles only: solid ink, or paper with a 0.5 mm ink outline.
export const OUTLINE_MM = 0.5;

// Recipes saved before the two styles had free fill/stroke params: paper fill meant outline.
const styleOf = (p) => p.style ?? (p.fill === 'paper' ? 'outline' : 'ink');

export default {
  type: 'testo',
  label: 'Testo',
  defaults: {
    text: 'Gormiti',
    weight: 'regular',
    capHeight: 30,
    style: 'ink', // 'ink' | 'outline'
  },
  validate: (p) => (p.text.trim() ? null : 'empty-text'),
  build(p, { fonts, paint }) {
    const font = fonts[p.weight] ?? fonts.regular;
    const layout = layoutText(font, p.text, { capHeight: p.capHeight, uppercase: true });
    const d = layout.lines.map((line) => line.d).join('');
    const outline = styleOf(p) === 'outline';
    const sw = outline ? OUTLINE_MM : 0;
    // Outer stroke of width sw: a 2·sw stroke behind the fill (svg2pdf has no paint-order).
    const back = outline ? `<path d="${d}" ${paint({ fill: 'ink', stroke: 'ink', width: 2 * sw, join: 'round' })}/>` : '';
    const markup = `${back}<path d="${d}" ${paint({ fill: outline ? 'paper' : 'ink' })}/>`;
    const b = layout.bbox;
    const bounds = { x: b.x1 - sw, y: b.y1 - sw, width: b.x2 - b.x1 + 2 * sw, height: b.y2 - b.y1 + 2 * sw };
    return { markup, collisionPolygon: rectPolygon(bounds.x, bounds.y, bounds.width, bounds.height), bounds };
  },
};
