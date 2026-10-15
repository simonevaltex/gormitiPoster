// Acceptance checks of CLAUDE.md (criteri 1–10), run against the dev server in headless Chromium.
// Interactions go through the real UI; window.__gormiti (dev only) is used to read results back.
// Usage: npm run verify  → one PASS/FAIL line per criterion; screenshots and exports go to
// verification-output/. Exit code 1 if anything fails.
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { PDFDocument, PDFRawStream, PDFDict, PDFName, decodePDFRawStream } from 'pdf-lib';
import { PNG } from 'pngjs';
import { mkdirSync, readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = 'verification-output';
mkdirSync(OUT, { recursive: true });
const failures = [];
function check(id, label, ok, detail = '') {
  if (!ok) failures.push(id);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ` — ${detail}` : ''}`);
}

// ---------- helpers ----------

const hexToRgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));

// Pixels that are not a blend of the two colours (anti-aliasing blends lie on the segment).
function offPalette(png, carta, inchiostro, tolerance = 12, region = null) {
  const a = hexToRgb(carta);
  const b = hexToRgb(inchiostro);
  const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const len2 = ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2;
  const { x0 = 0, y0 = 0, x1 = png.width, y1 = png.height } = region ?? {};
  let bad = 0;
  for (let y = y0; y < y1; y++) {
    for (let x = x0; x < x1; x++) {
      const i = (y * png.width + x) * 4;
      const p = [png.data[i] - a[0], png.data[i + 1] - a[1], png.data[i + 2] - a[2]];
      const t = Math.max(0, Math.min(1, (p[0] * ab[0] + p[1] * ab[1] + p[2] * ab[2]) / len2));
      const d = Math.hypot(p[0] - t * ab[0], p[1] - t * ab[1], p[2] - t * ab[2]);
      if (d > tolerance) bad++;
    }
  }
  return bad;
}

async function pdfInfo(path) {
  const pdf = await PDFDocument.load(readFileSync(path));
  const page = pdf.getPage(0);
  const mm = (pt) => +((pt * 25.4) / 72).toFixed(2);
  const box = (b) => ({ x: mm(b.x), y: mm(b.y), w: mm(b.width), h: mm(b.height) });
  let content = '';
  let fonts = 0;
  for (const [, obj] of pdf.context.enumerateIndirectObjects()) {
    if (obj instanceof PDFRawStream) content += `${Buffer.from(decodePDFRawStream(obj).decode()).toString('latin1')}\n`;
    if (obj instanceof PDFDict && obj.get(PDFName.of('Type'))?.toString() === '/Font') fonts++;
  }
  const colours = [...content.matchAll(/([\d.]+) ([\d.]+) ([\d.]+) (rg|RG)\b/g)].map(
    (m) => `#${[m[1], m[2], m[3]].map((c) => Math.round(+c * 255).toString(16).padStart(2, '0')).join('')}`,
  );
  return {
    media: box(page.getMediaBox()),
    bleed: box(page.getBleedBox()),
    trim: box(page.getTrimBox()),
    hasText: /(^|\s)(BT|Tj|TJ)(\s|$)/.test(content),
    fonts,
    colours: [...new Set(colours)],
  };
}

// ---------- run ----------

// The production build runs in its own process: building in this one would set
// NODE_ENV=production for the dev server too (and hide the dev-only test hook).
const buildRun = spawnSync('npx', ['vite', 'build', '--logLevel', 'error'], { encoding: 'utf8' });
const buildOk = buildRun.status === 0;
if (!buildOk) console.log(buildRun.stdout, buildRun.stderr);

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const base = server.resolvedUrls.local[0];
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

const ready = () => page.waitForFunction(() => window.__gormiti?.ready, null, { timeout: 20000 });
const state = (fn = 's => s') => page.evaluate(`(${fn})(window.__gormiti.store.state)`);
const poses = () => page.evaluate(() => [...window.__gormiti.physics.poses().values()]);
const settled = () => page.waitForFunction(() => window.__gormiti.physics.isSettled(), null, { timeout: 30000 });
const toScreen = (x, y) =>
  page.evaluate(([x, y]) => {
    const m = document.getElementById('sheet').getScreenCTM();
    return { x: m.a * x + m.e, y: m.d * y + m.f };
  }, [x, y]);
const button = (name) => page.getByRole('button', { name, exact: true });
const generate = () => button('Genera').click();
// The start point is picked on the pad (its coordinates are rounded to 0.1 mm there).
const setSpawn = async (x, y) => {
  const p = await page.evaluate(([x, y]) => {
    const m = document.querySelector('svg.pad').getScreenCTM();
    return { x: m.a * x + m.e, y: m.d * y + m.f };
  }, [x, y]);
  await page.mouse.click(p.x, p.y);
};
const clearSheet = async () => {
  await button('Svuota foglio').click();
  await button('Sì, svuota').click();
};
// "Punto" / "Linea" drop an attractor at a random spot; then we drag it (or its ends) into place.
const dragOnSheet = async (from, to) => {
  const p = await toScreen(from.x, from.y);
  const q = await toScreen(to.x, to.y);
  await page.mouse.move(p.x, p.y);
  await page.mouse.down();
  await page.mouse.move(q.x, q.y, { steps: 10 });
  await page.mouse.up();
};
const lastAttractor = async () => (await state('s => s.attractors')).at(-1);
const addPoint = async (x, y) => {
  await button('Punto').click();
  const a = await lastAttractor();
  await dragOnSheet(a, { x, y });
};
const addSegment = async (a, b) => {
  await button('Linea').click();
  let s = await lastAttractor();
  await dragOnSheet({ x: s.x1, y: s.y1 }, a);
  s = await lastAttractor();
  await dragOnSheet({ x: s.x2, y: s.y2 }, b);
};
// Clicks each attractor on the sheet and deletes it with the Canc key.
const deleteAllAttractors = async () => {
  for (const a of await state('s => s.attractors')) {
    const p = a.type === 'point' ? await toScreen(a.x, a.y) : await toScreen((a.x1 + a.x2) / 2, (a.y1 + a.y2) / 2);
    await page.mouse.click(p.x, p.y);
    await page.keyboard.press('Delete');
  }
};
const setStrength = (v) => page.getByLabel('Forza (valore)').fill(String(v));
// Lowest y of an element's collision outline at its current pose (mm).
const bottomOf = (index) =>
  page.evaluate((i) => {
    const g = window.__gormiti;
    const e = g.store.state.elements[i];
    const p = g.physics.poses().get(e.id);
    const c = Math.cos(p.angle);
    const s = Math.sin(p.angle);
    return Math.max(...e.built.collisionPolygon.map((v) => p.y + (v.x - e.built.centre.x) * s + (v.y - e.built.centre.y) * c));
  }, index);
const exportFile = async (name, { format = 'PDF vettoriale', marks = false } = {}) => {
  await button('Esporta').click();
  const dialog = page.locator('.dialog');
  await dialog.getByRole('radio', { name: format }).click();
  const box = dialog.getByRole('checkbox');
  if ((await box.isChecked()) !== marks) await box.click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Scarica' }).click()]);
  const path = `${OUT}/${name}`;
  await download.saveAs(path);
  return { path, suggested: download.suggestedFilename() };
};

await page.goto(base);
await ready();

// 2 — default sheet, "Sommo Luminescente" falls from the pad point and rests on the segment, upright
const initial = await state('s => s.attractors');
const seg = initial[0];
await page.getByLabel('Testo', { exact: true }).fill('Sommo Luminescente');
await page.getByLabel('Altezza maiuscole (mm)').filter({ visible: true }).fill('22');
const pad = page.locator('svg.pad');
const padBox = await pad.boundingBox();
await page.mouse.click(padBox.x + padBox.width * 0.45, padBox.y + padBox.height * 0.3); // pick the start on the pad
const spawn = await state('s => s.spawn');
await generate();
const start = (await poses())[0];
for (const t of [0, 400, 900]) {
  await page.waitForTimeout(t === 0 ? 0 : t === 400 ? 400 : 500);
  await page.screenshot({ path: `${OUT}/c2-fall-${t}.png` });
}
await settled();
await page.screenshot({ path: `${OUT}/c2-rest.png` });
const rest = (await poses())[0];
const bottom = await bottomOf(0);
check(
  '2',
  'un segmento sul fondo; il testo parte dal punto del pad e si ferma dritto sul segmento',
  initial.length === 1 &&
    seg.type === 'segment' &&
    seg.y1 === 405 &&
    Math.abs(start.x - spawn.x) < 1e-6 &&
    Math.abs(start.y - spawn.y) < 1e-6 &&
    Math.abs((rest.angle * 180) / Math.PI) < 0.5 &&
    Math.abs(bottom - (seg.y1 - 1)) < 0.6,
  `partenza (${spawn.x}, ${spawn.y}), quiete y=${rest.y.toFixed(2)} angolo ${((rest.angle * 180) / Math.PI).toFixed(3)}°, base ${bottom.toFixed(2)} mm (segmento ${seg.y1 - 1})`,
);

// 3 — Annulla then Genera with the same values: identical result
await page.locator('body').click({ position: { x: 5, y: 5 } }); // focus off the text fields
await page.keyboard.press('ControlOrMeta+z');
await generate();
await settled();
const again = (await poses())[0];
check('3', 'Annulla + Genera con gli stessi valori dà lo stesso identico risultato', JSON.stringify(again) === JSON.stringify(rest));

// 4 — point at the centre: blocks arrange around it, base to the centre, never overlapping
await clearSheet();
await deleteAllAttractors();
await addPoint(148.5, 210);
const blocks = [
  ['Testo', [148.5, 30]],
  ['Stemma', [280, 210]],
  ['Popolo', [148.5, 400]],
  ['Testo', [15, 210]],
  ['Numero', [270, 60]],
  ['Stemma', [30, 380]],
];
await page.getByLabel('Testo', { exact: true }).fill('Gorgo');
for (const [type, [x, y]] of blocks) {
  await page.getByRole('radio', { name: type }).click();
  await setSpawn(x, y);
  await generate();
  await settled();
}
await page.screenshot({ path: `${OUT}/c4-radial.png` });
const radial = await page.evaluate(() => {
  const g = window.__gormiti;
  const c = g.store.state.attractors[0];
  const errors = [...g.physics.poses()].map(([id, p]) => {
    const e = g.store.state.elements.find((x) => x.id === id);
    if (e.type === 'stemma' || e.type === 'numero') return 0; // round: any rotation looks the same
    const target = Math.atan2(-(c.x - p.x), c.y - p.y);
    let d = (target - p.angle) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d <= -Math.PI) d += 2 * Math.PI;
    return Math.abs((d * 180) / Math.PI);
  });
  return { overlaps: g.physics.overlaps(0.3).length, maxError: Math.max(...errors), count: errors.length };
});
check(
  '4',
  'con un punto al centro i blocchi si dispongono attorno, base verso il centro, senza sovrapporsi',
  radial.count === 6 && radial.overlaps === 0 && radial.maxError < 30,
  `${radial.count} blocchi, sovrapposizioni ${radial.overlaps}, scarto massimo ${radial.maxError.toFixed(1)}°`,
);

// 5 + 6 — two attractors of different strength; the stronger field wins; dragging is live
await clearSheet();
await deleteAllAttractors();
await addPoint(70, 210);
await setStrength(90);
await addPoint(230, 210);
await setStrength(15);
await page.getByRole('radio', { name: 'Stemma' }).click();
await setSpawn(175, 210); // nearer the weak point
await generate();
await settled();
const followsStrong = (await poses())[0];
// drag the strong point down: the block follows it, live
const [strong] = await state('s => s.attractors');
const from = await toScreen(strong.x, strong.y);
const to = await toScreen(60, 360);
await page.mouse.move(from.x, from.y);
await page.mouse.down();
const live = [];
for (let i = 1; i <= 12; i++) {
  await page.mouse.move(from.x + ((to.x - from.x) * i) / 12, from.y + ((to.y - from.y) * i) / 12);
  await page.waitForTimeout(40);
  live.push({ settled: await page.evaluate(() => window.__gormiti.physics.isSettled()), pose: (await poses())[0] });
}
await page.mouse.up();
await settled();
const afterDrag = (await poses())[0];
const moved = await state('s => s.attractors[0]');
// now make the far point the strong one: the block crosses over
await page.mouse.click((await toScreen(230, 210)).x, (await toScreen(230, 210)).y);
await setStrength(100);
await page.mouse.click((await toScreen(moved.x, moved.y)).x, (await toScreen(moved.x, moved.y)).y);
await setStrength(1);
await settled();
const crossed = (await poses())[0];
await page.screenshot({ path: `${OUT}/c5-two-attractors.png` });
const near = (p, a, r) => Math.hypot(p.x - a.x, p.y - a.y) < r;
check(
  '5',
  'con due attrattori di forza diversa vince il campo più forte nel punto (anche spostandoli)',
  near(followsStrong, { x: 70, y: 210 }, 25) && near(afterDrag, moved, 25) && near(crossed, { x: 230, y: 210 }, 25),
  `quiete vicino al forte (${followsStrong.x.toFixed(0)}, ${followsStrong.y.toFixed(0)}), segue il trascinamento (${afterDrag.x.toFixed(0)}, ${afterDrag.y.toFixed(0)}), cambia lato (${crossed.x.toFixed(0)}, ${crossed.y.toFixed(0)})`,
);
const awakeDuringDrag = live.some((l) => !l.settled);
const changedDuringDrag = new Set(live.map((l) => `${l.pose.x.toFixed(2)},${l.pose.y.toFixed(2)}`)).size > 3;
check('6', 'trascinando un attrattore i blocchi fermi si riassestano in tempo reale', awakeDuringDrag && changedDuringDrag);

// 7 — bleed 0 / 3: sheet size, blocks living in the bleed band, PDF sizes with and without marks
const paperSize = () =>
  page.evaluate(() => {
    const r = document.querySelector('#sheet .paper');
    return [+r.getAttribute('width'), +r.getAttribute('height')];
  });
await page.getByLabel('Bleed (mm)').fill('0');
const size0 = await paperSize();
await page.getByLabel('Bleed (mm)').fill('3');
const size3 = await paperSize();
await clearSheet();
await deleteAllAttractors();
await addSegment({ x: 20, y: 422.5 }, { x: 277, y: 422.5 }); // inside the bleed band
await page.getByRole('radio', { name: 'Testo' }).click();
await page.getByLabel('Testo', { exact: true }).fill('Bleed');
await setSpawn(148.5, 300);
await generate();
await settled();
const bleedBottom = await bottomOf(0);
await page.screenshot({ path: `${OUT}/c7-bleed.png` });
const pdfs = {};
pdfs.b3 = await exportFile('c7-bleed3.pdf');
pdfs.b3m = await exportFile('c7-bleed3-marks.pdf', { marks: true });
await page.getByLabel('Bleed (mm)').fill('0');
pdfs.b0 = await exportFile('c7-bleed0.pdf');
pdfs.b0m = await exportFile('c7-bleed0-marks.pdf', { marks: true });
await page.getByLabel('Bleed (mm)').fill('3');
const info = Object.fromEntries(await Promise.all(Object.entries(pdfs).map(async ([k, v]) => [k, await pdfInfo(v.path)])));
const sizeIs = (b, w, h) => Math.abs(b.w - w) < 0.05 && Math.abs(b.h - h) < 0.05;
check(
  '7',
  'bleed 0 → 297×420, bleed 3 → 303×426, blocchi nel bleed, PDF nelle misure giuste',
  size0.join() === '297,420' &&
    size3.join() === '303,426' &&
    bleedBottom > 420 &&
    bleedBottom < 423 &&
    sizeIs(info.b3.media, 303, 426) &&
    sizeIs(info.b3m.media, 323, 446) &&
    sizeIs(info.b0.media, 297, 420) &&
    sizeIs(info.b0m.media, 317, 440) &&
    sizeIs(info.b3m.trim, 297, 420) &&
    info.b3m.trim.x === 13 &&
    sizeIs(info.b3m.bleed, 303, 426) &&
    info.b3m.bleed.x === 10,
  `foglio ${size0.join('×')} / ${size3.join('×')}, base del blocco a ${bleedBottom.toFixed(2)} mm; PDF ${[info.b3, info.b3m, info.b0, info.b0m].map((i) => `${i.media.w}×${i.media.h}`).join(', ')} mm; TrimBox ${info.b3m.trim.w}×${info.b3m.trim.h} @${info.b3m.trim.x}`,
);

// 8 — colours: everything follows carta/inchiostro, no third colour on screen; equal colours refused
const carta = '#808080';
const inchiostro = '#ff6600';
await page.locator('#carta').fill(carta);
await page.locator('#inchiostro').fill(inchiostro);
await addPoint(148.5, 250);
await page.getByLabel('Bleed (mm)').focus();
await page.screenshot({ path: `${OUT}/c8-palette.png` });
const shot1 = PNG.sync.read(readFileSync(`${OUT}/c8-palette.png`));
await page.getByRole('tab', { name: 'Archivio' }).click();
await page.screenshot({ path: `${OUT}/c8-palette-archive.png` });
const shot3 = PNG.sync.read(readFileSync(`${OUT}/c8-palette-archive.png`));
await page.getByRole('tab', { name: 'Crea' }).click();
await button('Esporta').click();
await page.screenshot({ path: `${OUT}/c8-palette-dialog.png` });
const shot2 = PNG.sync.read(readFileSync(`${OUT}/c8-palette-dialog.png`));
await page.keyboard.press('Escape');
await page.locator('#inchiostro').fill(carta);
const warningShown = await page.locator('#color-warning').isVisible();
const reverted = await page.locator('#inchiostro').inputValue();
const bad1 = offPalette(shot1, carta, inchiostro);
const bad2 = offPalette(shot2, carta, inchiostro);
const bad3 = offPalette(shot3, carta, inchiostro);
check(
  '8',
  'carta e inchiostro cambiano tutto e nessun terzo colore resta a schermo',
  bad1 === 0 && bad2 === 0 && bad3 === 0 && warningShown && reverted === inchiostro,
  `pixel fuori palette ${bad1} + ${bad2} + ${bad3}; colori uguali → avviso ${warningShown}, ripristino ${reverted}`,
);

// 9 — archive: save, number, reopen identical, still there after reload
await clearSheet();
await deleteAllAttractors();
await addSegment({ x: 15, y: 405 }, { x: 282, y: 405 });
await page.getByRole('radio', { name: 'Gormita' }).click();
await setSpawn(148.5, 120);
await generate();
await page.getByRole('radio', { name: 'Numero' }).click();
await setSpawn(240, 40);
await generate();
await settled();
await button('Salva in archivio').click();
await page.waitForFunction(() => window.__gormiti.store.state.archive.items.length === 1);
const saved = await poses();
await page.getByRole('tab', { name: 'Archivio' }).click();
const rowNumber = (await page.locator('.archive-number').first().textContent()).trim();
await page.screenshot({ path: `${OUT}/c9-archive.png` });
await page.locator('#carta').fill('#ffffff');
await page.locator('#inchiostro').fill('#000000');
await page.reload();
await ready();
const afterReload = await state('s => s.archive.items.length');
await page.getByRole('tab', { name: 'Archivio' }).click();
await button('Riapri').click();
await page.waitForFunction(() => window.__gormiti.store.state.poster.id);
const reopened = await poses();
const restoredColours = await state('s => s.colors');
check(
  '9',
  'salvato compare in archivio con numero progressivo, si riapre identico e resta dopo il ricaricamento',
  rowNumber === 'N° 001' &&
    afterReload === 1 &&
    JSON.stringify(reopened) === JSON.stringify(saved) &&
    restoredColours.carta === carta &&
    restoredColours.inchiostro === inchiostro,
  `${rowNumber}, dopo ricarica ${afterReload} poster, colori ${restoredColours.carta}/${restoredColours.inchiostro}`,
);

// 10 — the PDF: outlines only, exact colours, renders as on screen
const final = await exportFile('c10-poster.pdf');
const svgFile = await exportFile('c10-poster.svg', { format: 'SVG' });
const finalInfo = await pdfInfo(final.path);
const svgText = readFileSync(svgFile.path, 'utf8');
await page.goto(`${base}scripts/pdf-preview.html`);
await page.waitForFunction(() => window.previewReady);
const rendered = await page.evaluate((b64) => window.renderPdf(b64, 1.5), readFileSync(final.path).toString('base64'));
await page.setViewportSize({ width: rendered.width, height: rendered.height });
await page.locator('#page').screenshot({ path: `${OUT}/c10-poster-render.png` });
const renderBad = offPalette(PNG.sync.read(readFileSync(`${OUT}/c10-poster-render.png`)), carta, inchiostro);
const exactColours = finalInfo.colours.includes(carta) && finalInfo.colours.includes(inchiostro);
check(
  '10',
  'PDF con testo in tracciati e colori esatti (nome file, SVG bonus)',
  !finalInfo.hasText &&
    finalInfo.fonts === 0 &&
    exactColours &&
    renderBad === 0 &&
    final.suggested === 'gormiti-poster-001.pdf' &&
    svgText.includes('width="303mm" height="426mm"'),
  `operatori di testo ${finalInfo.hasText}, font ${finalInfo.fonts}, colori ${finalInfo.colours.join(' ')}, pixel fuori palette nel render ${renderBad}, file ${final.suggested} + ${svgFile.suggested}`,
);

// 1 — build and no console errors during the whole run
check('1', 'npm run build riesce e nessun errore in console', buildOk && consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));

await browser.close();
await server.close();
console.log(failures.length ? `\n${failures.length} criteri non superati: ${failures.join(', ')}` : '\nTutti i criteri superati.');
process.exit(failures.length ? 1 : 0);
