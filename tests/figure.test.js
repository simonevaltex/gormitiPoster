import { it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import svgpath from 'svgpath';
import { fileURLToPath } from 'node:url';
import { parseFigureSvg, buildFigure, inkOrPaper, FIGURE_PAPER_MM } from '../src/svg-figure.js';
import { OUTLINE_MM } from '../src/constants.js';
import { scanAssets } from '../scripts/assets-manifest.mjs';
import { screenPaint, exportPaint } from '../src/paint.js';
import { convexHull } from '../src/geometry.js';

const ASSETS = new URL('../public/assets/', import.meta.url);
const OUTER_MM = FIGURE_PAPER_MM + OUTLINE_MM; // from the edge of the drawing to the outside of the ink line

// Shaped like an Illustrator export: XML declaration, generator comment, internal CSS.
const svg = (body, head = '') =>
  '<?xml version="1.0" encoding="UTF-8"?>\n<svg id="Layer_2" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">\n' +
  `<!-- Generator: Adobe Illustrator 30.8.2, SVG Export Plug-In -->\n${head}${body}</svg>`;
const corners = (shape) => {
  const { x, y, width, height } = shape.box;
  return [x, y, x + width, y + height].map((v) => +v.toFixed(2));
};
// A black 100 × 50 block with a white square on it.
const block = () =>
  parseFigureSvg(svg('<rect width="100" height="50"/><rect class="st0" x="10" y="10" width="20" height="20"/>', '<style>.st0{fill:#fff}</style>'));
const scaleOf = (markup) => +markup.match(/scale\(([\d.]+)\)/)[1];
// The two ring outlines (the first two paths), in mm: paint attributes, subpaths, size.
const rings = (markup) => {
  const s = scaleOf(markup);
  return [...markup.matchAll(/<path d="([^"]+)" ([^/]*)\/>/g)].slice(0, 2).map(([, d, attrs]) => {
    const xs = [];
    const ys = [];
    let subpaths = 0;
    svgpath(d)
      .abs()
      .iterate((seg) => {
        if (seg[0] === 'M') subpaths++;
        if (seg[0] !== 'Z') {
          xs.push(seg[seg.length - 2] * s);
          ys.push(seg[seg.length - 1] * s);
        }
      });
    return { attrs, subpaths, width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
  });
};

it('any dark colour becomes ink and any light colour paper', () => {
  for (const c of ['#000', '#000000', '#231F20', 'black', 'rgb(20, 20, 20)']) expect(inkOrPaper(c), c).toBe('ink');
  for (const c of ['#fff', '#FFFFFF', 'white', 'rgb(250,250,250)', '#ffffff80']) expect(inkOrPaper(c), c).toBe('paper');
  for (const c of ['none', 'transparent']) expect(inkOrPaper(c), c).toBe('none');
});

it('reads Illustrator styling: classes, inline style, attributes, black when unset', () => {
  const f = parseFigureSvg(
    svg(
      '<rect class="st0" width="10" height="10"/>' +
        '<rect x="10" width="10" height="10"/>' +
        '<rect fill="#fff" style="fill: #000" x="20" width="10" height="10"/>' +
        '<g fill="#fff"><rect x="30" width="10" height="10"/></g>' +
        '<rect class="st1" x="40" width="10" height="10"/>',
      '<defs><style>\n  .st0 {\n    fill: #fff;\n  }\n  .st1{fill:none;stroke:#1a1a1a;stroke-width:2;stroke-linejoin:round}\n</style></defs>',
    ),
  );
  expect(f.shapes.map((s) => s.paint)).toEqual([
    { fill: 'paper', stroke: 'none' },
    { fill: 'ink', stroke: 'none' },
    { fill: 'ink', stroke: 'none' },
    { fill: 'paper', stroke: 'none' },
    { fill: 'none', stroke: 'ink', width: 2, join: 'round' },
  ]);
});

it('puts every shape in the drawing coordinates, transforms included', () => {
  const f = parseFigureSvg(
    svg(
      '<g transform="translate(10 20)"><rect width="10" height="5" transform="rotate(90)"/></g>' +
        '<circle cx="50" cy="50" r="5"/>' +
        '<ellipse cx="80" cy="20" rx="6" ry="3"/>' +
        '<polygon points="0 90 10 90 5 80"/>' +
        '<path d="M70 70h10v10z"/>' +
        '<line x1="40" y1="90" x2="60" y2="90" stroke="#000" stroke-width="2"/>',
    ),
  );
  expect(f.shapes.map(corners)).toEqual([
    [5, 20, 10, 30],
    [45, 45, 55, 55],
    [74, 17, 86, 23],
    [0, 80, 10, 90],
    [70, 70, 80, 80],
    [39, 89, 61, 91], // the stroke counts
  ]);
});

it('keeps the drawing order, and skips hidden and unsupported things', () => {
  const f = parseFigureSvg(
    svg(
      '<rect width="1" height="1"/>' +
        '<rect width="2" height="2" display="none"/>' +
        '<g style="display:none"><rect width="5" height="5"/></g>' +
        '<image href="x.png" width="10" height="10"/>' +
        '<text x="0" y="10">Ciao</text>' +
        '<rect class="st0" width="3" height="3"/>',
      '<title>Figura</title><defs><style>.st0{fill:#fff}</style><linearGradient id="g"/></defs>',
    ),
  );
  expect(f.shapes.map((s) => s.box.width)).toEqual([1, 3]);
  expect(f.unsupported).toEqual(['image', 'text']);
});

it('keeps Illustrator path data exactly as it is when nothing moves it', () => {
  const d = 'M442,341.3l-.3-1c-.1,0-.7,0-.8.1s-.3.9,0,1h1.1Z';
  expect(parseFigureSvg(svg(`<path d="${d}"/>`)).shapes[0].d).toBe(d);
  const relative = parseFigureSvg(svg('<path d="m10 10 5 0 0 5z"/>')).shapes[0]; // implicit relative linetos
  expect(relative.d.startsWith('M')).toBe(true);
  expect(corners(relative)).toEqual([10, 10, 15, 15]);
});

it('the silhouette hull and the bounds cover every shape', () => {
  const f = parseFigureSvg(svg('<rect x="10" y="10" width="20" height="10"/><circle cx="50" cy="50" r="10"/>'));
  expect(f.bounds.x).toBeCloseTo(10, 6);
  expect(f.bounds.y).toBeCloseTo(10, 6);
  expect(f.bounds.width).toBeCloseTo(50, 6);
  expect(f.bounds.height).toBeCloseTo(50, 6);
  expect(convexHull(f.hull)).toHaveLength(f.hull.length);
});

it('a file with nothing to draw is refused', () => {
  expect(() => parseFigureSvg(svg('<text>Ciao</text>'))).toThrow();
});

it('scales the figure to the width asked for, rings included', () => {
  const el = buildFigure(block(), 180, { paint: screenPaint });
  const s = (180 - 2 * OUTER_MM) / 100;
  expect(scaleOf(el.markup)).toBeCloseTo(s, 6);
  expect(el.bounds.width).toBeCloseTo(180, 6);
  expect(el.bounds.height).toBeCloseTo(50 * s + 2 * OUTER_MM, 6);
  expect(convexHull(el.collisionPolygon)).toHaveLength(el.collisionPolygon.length);
});

it('the rings are the same in mm at any size: a paper band, then the ink outline of Nome, under the drawing', () => {
  for (const width of [90, 180, 400]) {
    const { markup } = buildFigure(block(), width, { paint: screenPaint });
    const [ink, paper] = rings(markup);
    const drawing = 100 * scaleOf(markup);
    expect(ink.attrs).toBe('class="fi"');
    expect(paper.attrs).toBe('class="fp"');
    expect(Math.abs(ink.width - (drawing + 2 * OUTER_MM))).toBeLessThan(0.15);
    expect(Math.abs(paper.width - (drawing + 2 * FIGURE_PAPER_MM))).toBeLessThan(0.15);
    expect(Math.abs((ink.width - paper.width) / 2 - OUTLINE_MM)).toBeLessThan(0.05); // as thick as Nome's
    expect(markup).not.toContain('stroke'); // filled outlines: cheap to draw, no thick strokes
  }
  const { markup } = buildFigure(block(), 180, { paint: screenPaint });
  const inkRing = markup.indexOf('class="fi"/>');
  const paperRing = markup.indexOf('class="fp"/>');
  const black = markup.indexOf('<g class="fi">');
  const white = markup.indexOf('<g class="fp">');
  expect(inkRing).toBeGreaterThan(-1);
  expect(inkRing).toBeLessThan(paperRing);
  expect(paperRing).toBeLessThan(black);
  expect(black).toBeLessThan(white); // the drawing keeps its order
});

it('the rings follow the silhouette: around holes, never across overlaps', () => {
  // A frame drawn as one compound path: the hole shows the paper, so the rings go round it too.
  const frame = parseFigureSvg(svg('<path d="M0 0H100V100H0Z M20 20V80H80V20Z"/>'));
  expect(rings(buildFigure(frame, 180, { paint: screenPaint }).markup)[0].subpaths).toBe(2);
  // A hole narrower than the rings closes up.
  const pinhole = parseFigureSvg(svg('<path d="M0 0H100V100H0Z M49 49V51H51V49Z"/>'));
  expect(rings(buildFigure(pinhole, 180, { paint: screenPaint }).markup)[0].subpaths).toBe(1);
  // Two overlapping shapes drawn in opposite directions make one silhouette, with no false hole.
  const pair = parseFigureSvg(svg('<path d="M0 0H60V60H0Z"/><path d="M40 40V100H100V40Z"/>'));
  const [ink] = rings(buildFigure(pair, 180, { paint: screenPaint }).markup);
  expect(ink.subpaths).toBe(1);
  expect(Math.abs(ink.width - 180)).toBeLessThan(0.15);
});

it('export: exact hex values and no classes', () => {
  const { markup } = buildFigure(block(), 180, { paint: exportPaint({ carta: '#808080', inchiostro: '#ff6600' }) });
  expect(markup).toContain('fill="#ff6600"');
  expect(markup).toContain('fill="#808080"');
  expect(markup).not.toContain('class=');
});

it('thumbnails leave out the specks, collisions stay the same', () => {
  const f = parseFigureSvg(
    svg('<rect width="100" height="50"/><rect class="st0" x="10" y="10" width="0.3" height="0.3"/>', '<style>.st0{fill:#fff}</style>'),
  );
  const full = buildFigure(f, 180, { paint: screenPaint });
  const thumb = buildFigure(f, 180, { paint: screenPaint, detail: 'thumbnail' });
  expect(full.markup).toContain('<g class="fp">');
  expect(thumb.markup).not.toContain('<g class="fp">');
  expect(thumb.collisionPolygon).toEqual(full.collisionPolygon);
});

it('thumbnails simplify the outlines: a 1000-point circle needs far fewer', () => {
  const points = Array.from({ length: 1000 }, (_, i) => {
    const a = (i / 1000) * 2 * Math.PI;
    return `${(50 + 50 * Math.cos(a)).toFixed(3)} ${(50 + 50 * Math.sin(a)).toFixed(3)}`;
  });
  const f = parseFigureSvg(svg(`<polygon points="${points.join(' ')}"/>`));
  const count = (markup) => (markup.match(/-?\d*\.?\d+/g) || []).length;
  const full = buildFigure(f, 180, { paint: screenPaint }).markup;
  const thumb = buildFigure(f, 180, { paint: screenPaint, detail: 'thumbnail' }).markup;
  expect(count(full)).toBeGreaterThan(2000); // the drawing keeps its 1000 points
  expect(count(thumb)).toBeLessThan(count(full) / 10);
  expect(thumb).not.toMatch(/NaN|undefined|Infinity/);
  // Archive thumbnails get rounded to one decimal: these coordinates must survive that unchanged.
  const d = thumb.match(/<path d="([^"]+)"/)[1];
  expect(d.replace(/-?\d+\.\d+/g, (n) => String(+(+n).toFixed(1)))).toBe(d);
});

it('every figure in public/assets/gormiti reads cleanly', () => {
  for (const { file } of scanAssets(fileURLToPath(ASSETS)).gormiti) {
    const f = parseFigureSvg(readFileSync(new URL(file, ASSETS), 'utf8'));
    expect(f.unsupported, file).toEqual([]);
    expect(f.shapes.every((s) => s.paint.fill !== 'none' || s.paint.stroke !== 'none'), file).toBe(true);
    const el = buildFigure(f, 180, { paint: screenPaint });
    expect(el.markup, file).not.toMatch(/NaN|undefined|Infinity/);
    expect(el.bounds.width, file).toBeCloseTo(180, 6);
  }
});
