// Vector export. The PDF is drawn from the same SVG as the SVG export (text already in outlines,
// exact hex colours); pdf-lib then sets TrimBox and BleedBox. The libraries load on demand.
import { A3 } from './constants.js';
import { composeSheetSvg } from './recipe.js';
import { exportPaint } from './paint.js';

const PT_PER_MM = 72 / 25.4;

export const exportFileName = (number, ext) => `gormiti-poster-${String(number).padStart(3, '0')}.${ext}`;

const exportSvgMarkup = (recipe, { fonts, figures, stemmi, cropMarks }) =>
  composeSheetSvg(recipe, { fonts, figures, stemmi, paint: exportPaint(recipe.colors), cropMarks, idPrefix: 'export' });

export function exportSvg(recipe, options) {
  const { svg } = exportSvgMarkup(recipe, options);
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

export async function exportPdf(recipe, options) {
  const [{ jsPDF }, , pdfLib] = await Promise.all([import('jspdf'), import('svg2pdf.js'), import('pdf-lib')]);
  const { PDFDocument } = pdfLib;
  const { svg, width, height, bleed, slug } = exportSvgMarkup(recipe, options);
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
    pdf.setTitle(exportFileName(recipe.number, 'pdf').replace('.pdf', ''));
    return new Blob([await pdf.save()], { type: 'application/pdf' });
  } finally {
    host.remove();
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
