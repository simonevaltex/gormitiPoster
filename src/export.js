// Export. PDF and PNG are drawn from the same SVG as the SVG export (text already in outlines,
// exact hex colours); for the PDF pdf-lib then sets TrimBox and BleedBox, and the libraries load
// on demand. `setup` comes from exportSetup (export-options.js): page, colours, background.
import { A3 } from './constants.js';
import { composeSheetSvg } from './recipe.js';
import { exportPaint } from './paint.js';
import { pngSize, exportFileName } from './export-options.js';

const PT_PER_MM = 72 / 25.4;


const exportSvgMarkup = ({ recipe, cropMarks, background }, assets) =>
  composeSheetSvg(recipe, { ...assets, paint: exportPaint(recipe.colors), cropMarks, background, idPrefix: 'export' });

export function exportSvg(setup, assets) {
  const { svg } = exportSvgMarkup(setup, assets);
  return new Blob([`<?xml version="1.0" encoding="UTF-8"?>\n${svg}`], { type: 'image/svg+xml' });
}

// jsPDF writes colours with r = g = b as DeviceGray ("0.502 g") and rounds every channel to two
// decimals (#1d3557 would print as 28/255 instead of 29/255). The export must keep the exact RGB
// values chosen: channels go in as 4-decimal strings, which jsPDF copies verbatim, and an object
// as 4th argument selects its plain RGB branch.
const channel = (v) => String(+(v / 255).toFixed(4));
function forceRgb(doc) {
  for (const name of ['setFillColor', 'setDrawColor']) {
    const original = doc[name].bind(doc);
    doc[name] = (r, g, b, extra) =>
      typeof r === 'number' && typeof g === 'number' && extra === undefined
        ? original(channel(r), channel(g), channel(b), {})
        : original(r, g, b, extra);
  }
}

// jsPDF declares the 14 standard fonts on every page even when unused; no text is drawn (it is
// all outlines), so they are removed rather than shown as non-embedded fonts by Acrobat.
function dropUnusedFonts(pdf, page, { PDFName, PDFDict, PDFRef }) {
  const resources = page.node.Resources();
  const fonts = resources?.lookupMaybe(PDFName.of('Font'), PDFDict);
  if (!fonts) return;
  for (const [, ref] of fonts.entries()) if (ref instanceof PDFRef) pdf.context.delete(ref);
  resources.delete(PDFName.of('Font'));
}

export async function exportPdf(setup, assets) {
  const [{ jsPDF }, , pdfLib] = await Promise.all([import('jspdf'), import('svg2pdf.js'), import('pdf-lib')]);
  const { PDFDocument } = pdfLib;
  const { recipe } = setup;
  const { svg, width, height, bleed, slug } = exportSvgMarkup(setup, assets);
  // svg2pdf needs a live DOM element; keep it off screen while it is read.
  const host = document.createElement('div');
  host.style.cssText = 'position:fixed;left:-10000px;top:0;width:0;height:0;overflow:hidden';
  host.innerHTML = svg;
  document.body.append(host);
  try {
    const w = width * PT_PER_MM;
    const h = height * PT_PER_MM;
    const doc = new jsPDF({ unit: 'pt', format: [w, h], orientation: 'portrait', compress: true });
    forceRgb(doc);
    await doc.svg(host.firstElementChild, { x: 0, y: 0, width: w, height: h });
    const pdf = await PDFDocument.load(doc.output('arraybuffer'));
    const page = pdf.getPage(0);
    dropUnusedFonts(pdf, page, pdfLib);
    page.setBleedBox(slug * PT_PER_MM, slug * PT_PER_MM, (A3.width + 2 * bleed) * PT_PER_MM, (A3.height + 2 * bleed) * PT_PER_MM);
    page.setTrimBox((slug + bleed) * PT_PER_MM, (slug + bleed) * PT_PER_MM, A3.width * PT_PER_MM, A3.height * PT_PER_MM);
    pdf.setTitle(exportFileName(recipe, 'pdf', assets.figures).replace(/\.pdf$/, ''));
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  } finally {
    host.remove();
  }
}

// Even with crispEdges, lines thinner than a pixel come out a shade lighter: every pixel takes the
// nearer of the two colours, and is either opaque or fully transparent.
function snapToTwoColours(ctx, width, height, { carta, inchiostro }) {
  const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const [p, k] = [rgb(carta), rgb(inchiostro)];
  const image = ctx.getImageData(0, 0, width, height);
  const d = image.data;
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) {
      d[i] = d[i + 1] = d[i + 2] = d[i + 3] = 0;
      continue;
    }
    const dp = (d[i] - p[0]) ** 2 + (d[i + 1] - p[1]) ** 2 + (d[i + 2] - p[2]) ** 2;
    const dk = (d[i] - k[0]) ** 2 + (d[i + 1] - k[1]) ** 2 + (d[i + 2] - k[2]) ** 2;
    const c = dp <= dk ? p : k;
    d[i] = c[0];
    d[i + 1] = c[1];
    d[i + 2] = c[2];
    d[i + 3] = 255;
  }
  ctx.putImageData(image, 0, 0);
}

// The same SVG drawn on a canvas at `scale` × 96 px per inch. aliased: hard edges, so the image
// keeps exactly the two colours (anti-aliasing adds in-between pixels on the edges).
export async function exportPng(setup, assets, { scale, aliased }) {
  const { width, height } = pngSize(setup, scale);
  let { svg } = exportSvgMarkup(setup, assets);
  // Whole pixels change the proportions a hair: stretch rather than leave a sub-pixel edge.
  const attrs = `width="${width}" height="${height}" preserveAspectRatio="none"${aliased ? ' shape-rendering="crispEdges"' : ''}`;
  svg = svg.replace(/^<svg ([^>]*?)width="[^"]+" height="[^"]+"/, `<svg $1${attrs}`);
  const url = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = !aliased;
    ctx.drawImage(image, 0, 0, width, height);
    if (aliased) snapToTwoColours(ctx, width, height, setup.recipe.colors);
    return await new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG non creato'))), 'image/png'));
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
