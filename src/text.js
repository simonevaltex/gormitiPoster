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

// Glyphs side by side with their advances and kerning, no substitutions. For the poster number:
// opentype.js 2.0 can't apply some of Instrument Serif's substitution lookups, and digits don't
// need them.
function unshapedPath(font, line, y, fontSize, tracking) {
  const scale = fontSize / font.unitsPerEm;
  const glyphs = [...line].map((ch) => font.charToGlyph(ch));
  const commands = [];
  let box = null;
  let x = 0;
  glyphs.forEach((glyph, i) => {
    const path = glyph.getPath(x, y, fontSize);
    commands.push(...path.commands);
    const b = path.getBoundingBox();
    if (b.x2 > b.x1) box = box ? union(box, b) : { x1: b.x1, y1: b.y1, x2: b.x2, y2: b.y2 };
    const kern = glyphs[i + 1] ? font.getKerningValue(glyph, glyphs[i + 1]) : 0;
    x += (glyph.advanceWidth + kern) * scale + tracking * fontSize;
  });
  return { commands, box };
}

// lineHeight and tracking are in em. bbox is the real ink box of the glyphs, not the font box.
// shaping: false lays the glyphs out one by one (see unshapedPath).
export function layoutText(font, text, { capHeight, lineHeight = 0.92, tracking = -0.03, uppercase = false, shaping = true }) {
  const fontSize = fontSizeForCapHeight(font, capHeight);
  const source = uppercase ? text.toLocaleUpperCase('it') : text;
  const lines = [];
  let bbox = null;
  source.split(/\r?\n/).forEach((line, i) => {
    if (!line.trim()) return;
    if (!shaping) {
      const { commands, box } = unshapedPath(font, line, i * lineHeight * fontSize, fontSize, tracking);
      lines.push({ d: pathData(commands), bbox: box });
      bbox = bbox ? union(bbox, box) : box;
      return;
    }
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
