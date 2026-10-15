// Text → SVG outlines with opentype.js. Sizes are in mm; y grows downwards and the first
// baseline sits at y = 0.
import { fmt } from './svg.js';

// opentype.js 2.0.0's Path.toPathData prints NaN for coordinates whose fractional part is tiny
// float noise (its rounding helper builds "1e-15e+2"), and it flips paths by default; so the
// glyph commands are serialised here instead.
function pathData(commands) {
  let d = '';
  for (const c of commands) {
    if (c.type === 'M' || c.type === 'L') d += `${c.type}${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'Q') d += `Q${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'C') d += `C${fmt(c.x1)} ${fmt(c.y1)} ${fmt(c.x2)} ${fmt(c.y2)} ${fmt(c.x)} ${fmt(c.y)}`;
    else if (c.type === 'Z') d += 'Z';
  }
  return d;
}

export function fontSizeForCapHeight(font, capMm) {
  const cap = font.tables.os2?.sCapHeight || font.charToGlyph('H').getBoundingBox().y2;
  return (capMm * font.unitsPerEm) / cap;
}

const union = (a, b) => ({
  x1: Math.min(a.x1, b.x1),
  y1: Math.min(a.y1, b.y1),
  x2: Math.max(a.x2, b.x2),
  y2: Math.max(a.y2, b.y2),
});

// lineHeight and tracking are in em. bbox is the real ink box of the glyphs, not the font box.
export function layoutText(font, text, { capHeight, lineHeight = 0.92, tracking = -0.03, uppercase = false }) {
  const fontSize = fontSizeForCapHeight(font, capHeight);
  const source = uppercase ? text.toLocaleUpperCase('it') : text;
  const lines = [];
  let bbox = null;
  source.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    const path = font.getPath(line, 0, i * lineHeight * fontSize, fontSize, {
      kerning: true,
      letterSpacing: tracking,
    });
    const b = path.getBoundingBox();
    const box = { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
    lines.push({ d: pathData(path.commands), bbox: box });
    bbox = bbox ? union(bbox, box) : box;
  });
  return { lines, bbox, fontSize };
}
