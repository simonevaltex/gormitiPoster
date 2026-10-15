import { layoutText } from '../text.js';
import { rectPolygon } from '../geometry.js';

// Free text block: title, second name, anything. One rigid body, however many lines.
export default {
  type: 'testo',
  label: 'Testo',
  defaults: {
    text: 'Gormiti',
    weight: 'bold',
    capHeight: 40,
    uppercase: true,
    fill: 'ink',
    stroke: 'paper',
    strokeWidth: 0.8,
  },
  validate: (p) => (p.text.trim() ? null : 'empty-text'),
  build(p, { fonts, paint }) {
    const font = fonts[p.weight] ?? fonts.bold;
    const layout = layoutText(font, p.text, { capHeight: p.capHeight, uppercase: p.uppercase });
    const d = layout.lines.map((line) => line.d).join('');
    const sw = p.stroke === 'none' ? 0 : p.strokeWidth;
    // Outer stroke of width sw: a 2·sw stroke behind the fill (svg2pdf has no paint-order).
    const back = sw > 0 ? `<path d="${d}" ${paint({ fill: p.stroke, stroke: p.stroke, width: 2 * sw, join: 'round' })}/>` : '';
    const markup = `${back}<path d="${d}" ${paint({ fill: p.fill })}/>`;
    const b = layout.bbox;
    const bounds = { x: b.x1 - sw, y: b.y1 - sw, width: b.x2 - b.x1 + 2 * sw, height: b.y2 - b.y1 + 2 * sw };
    return { markup, collisionPolygon: rectPolygon(bounds.x, bounds.y, bounds.width, bounds.height), bounds };
  },
};
