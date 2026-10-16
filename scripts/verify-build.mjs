// The production build as Vercel serves it: `vite preview` of dist/ with the headers of vercel.json
// (Content-Security-Policy included) and the archive API on an empty PGlite in memory. Only the
// real UI is used, since the dev-only test hook isn't in the build.
// Usage: npm run verify:build → one PASS/FAIL line per check, exit code 1 if anything fails.
import { preview } from 'vite';
import { chromium } from 'playwright';
import { PDFDocument } from 'pdf-lib';
import { mkdirSync, readFileSync, statSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const OUT = 'verification-output';
mkdirSync(OUT, { recursive: true });
const failures = [];
function check(id, label, ok, detail = '') {
  if (!ok) failures.push(id);
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${id}  ${label}${detail ? ` — ${detail}` : ''}`);
}

const built = spawnSync('npx', ['vite', 'build', '--logLevel', 'error'], { encoding: 'utf8' });
if (built.status !== 0) {
  console.log(built.stdout, built.stderr);
  process.exit(1);
}

process.env.GORMITI_DB = 'memory';
const server = await preview({ preview: { port: 4199, strictPort: true }, logLevel: 'error' });
const base = server.resolvedUrls.local[0];

// ---------- headers ----------
const home = await fetch(base);
const script = readFileSync('dist/index.html', 'utf8').match(/src="\/(_app\/[^"]+\.js)"/)?.[1];
const bundle = await fetch(`${base}${script}`);
const figure = await fetch(`${base}assets/manifest.json`);
const api = await fetch(`${base}api/posters`);
check(
  'h',
  'header di vercel.json: noindex, CSP, cache lunga solo per il codice con hash',
  home.headers.get('x-robots-tag') === 'noindex, nofollow' &&
    /script-src 'self'/.test(home.headers.get('content-security-policy') ?? '') &&
    /immutable/.test(bundle.headers.get('cache-control') ?? '') &&
    !/immutable/.test(figure.headers.get('cache-control') ?? '') &&
    api.headers.get('cache-control') === 'no-store',
  `codice ${script} «${bundle.headers.get('cache-control')}», api «${api.headers.get('cache-control')}»`,
);

// ---------- the site ----------
const browser = await chromium.launch();
const context = await browser.newContext({ acceptDownloads: true, viewport: { width: 1440, height: 900 } });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => m.type() === 'error' && consoleErrors.push(m.text()));
page.on('pageerror', (e) => consoleErrors.push(e.message));

const button = (name) => page.getByRole('button', { name, exact: true });
const loaded = () => page.locator('#loading').waitFor({ state: 'detached', timeout: 20000 });
const status = async (text) => page.locator('#status', { hasText: text }).waitFor({ timeout: 15000 });
const setSpawn = async (x, y) => {
  const p = await page.evaluate(([x, y]) => {
    const m = document.querySelector('svg.pad').getScreenCTM();
    return { x: m.a * x + m.e, y: m.d * y + m.f };
  }, [x, y]);
  await page.mouse.click(p.x, p.y);
};
const exportFile = async (name, format) => {
  await button('Esporta').click();
  const dialog = page.locator('.dialog');
  await dialog.getByRole('radio', { name: format, exact: true }).click();
  const [download] = await Promise.all([page.waitForEvent('download'), dialog.getByRole('button', { name: 'Scarica' }).click()]);
  const path = `${OUT}/${name}`;
  await download.saveAs(path);
  await page.keyboard.press('Escape');
  return path;
};
const openArchive = async () => {
  await page.getByRole('tab', { name: 'Archivio' }).click();
  await page.waitForResponse((r) => r.url().endsWith('/api/posters'));
};

await page.goto(base);
await loaded();
check('1', 'la build si apre: font, figure e favicon arrivano', (await fetch(`${base}favicon.svg`)).ok && (await page.locator('#sheet path').count()) > 0);

// A block of every type, each from its own start; then the sheet rests.
const starts = { Popolo: [60, 60], Stemma: [250, 50], Gormita: [148.5, 120], Nome: [148.5, 250], Alias: [148.5, 200], Numero: [250, 120] };
for (const [label, [x, y]] of Object.entries(starts)) {
  await page.getByRole('radio', { name: label }).click();
  await setSpawn(x, y);
  await button('Genera').click();
  await page.waitForTimeout(1500);
}
await page.waitForTimeout(2000);

await button('Salva in archivio').click();
await status('Poster 001 salvato');
await openArchive();
const thumbPaths = await page.locator('.archive-item .thumb path').count();
await page.screenshot({ path: `${OUT}/build-archive.png` });
check('2', 'si salva nell’archivio condiviso, con la miniatura', (await page.locator('.archive-number').first().textContent()).trim() === 'N° 001' && thumbPaths > 20, `${thumbPaths} tracciati nella miniatura`);

await page.reload();
await loaded();
await openArchive();
await button('Riapri').click();
await status('Poster 001 riaperto');
check('3', 'dopo il ricaricamento il poster c’è ancora e si riapre', (await page.locator('.archive-item').count()) === 1);

const pdfPath = await exportFile('build-poster.pdf', 'PDF');
const pdf = await PDFDocument.load(readFileSync(pdfPath));
const [w, h] = (({ width, height }) => [width, height].map((v) => +((v * 25.4) / 72).toFixed(1)))(pdf.getPage(0).getSize());
const pngPath = await exportFile('build-poster.png', 'PNG');
check('4', 'PDF e PNG si esportano con la CSP attiva', w === 303 && h === 426 && statSync(pngPath).size > 10_000, `PDF ${w}×${h} mm, PNG ${statSync(pngPath).size} byte`);

// A poster saved in this browser before the shared archive: the Archivio tab offers to copy it.
await page.evaluate(async () => {
  const saved = (await (await fetch('/api/posters')).json())[0];
  const recipe = { ...(await (await fetch(`/api/posters/${saved.id}`)).json()), id: 'plocal1', number: 41 };
  const db = await new Promise((resolve, reject) => {
    const req = indexedDB.open('gormiti-poster', 1);
    req.onupgradeneeded = () => req.result.createObjectStore('posters', { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  await new Promise((resolve) => {
    const tx = db.transaction('posters', 'readwrite');
    tx.objectStore('posters').put(recipe);
    tx.oncomplete = resolve;
  });
});
await page.getByRole('tab', { name: 'Crea' }).click();
await openArchive();
await button('Copia nell’archivio condiviso').click();
await status('Copiati 1 poster');
const numbers = await page.locator('.archive-number').allTextContents();
const offerGone = await page.locator('.archive-migration').isHidden();
check('5', 'i poster di questo browser si copiano nell’archivio condiviso', numbers.join(',') === 'N° 041,N° 001' && offerGone, numbers.join(', '));

// Someone writes a thumbnail with scripts straight to the API: nothing of it runs or stays. While
// DOMPurify parses it, Chrome reports the handlers the CSP blocks: those are expected here.
const errorsBeforeAttack = consoleErrors.length;
const xss = await page.evaluate(async () => {
  const saved = await (await fetch('/api/posters/plocal1')).json();
  const thumbnail =
    '<svg xmlns="http://www.w3.org/2000/svg"><script>window.__xss=1</script><image href="x" onerror="window.__xss=2"/>' +
    '<foreignObject><img src="x" onerror="window.__xss=3"></foreignObject><a href="javascript:window.__xss=4"><rect width="9" height="9"/></a></svg>';
  const res = await fetch('/api/posters/pxss', { method: 'PUT', body: JSON.stringify({ ...saved, id: 'pxss', number: 99, thumbnail }) });
  return res.status;
});
await page.getByRole('tab', { name: 'Crea' }).click();
await openArchive();
await page.waitForTimeout(500);
const injected = await page.evaluate(() => ({
  ran: window.__xss ?? null,
  markup: document.querySelector('.archive-item .thumb').innerHTML,
}));
check(
  '6',
  'una miniatura con script scritta direttamente nell’API viene ripulita',
  xss === 200 && injected.ran === null && !/script|onerror|foreignObject|javascript:/i.test(injected.markup),
  `PUT ${xss}, rimasto: ${injected.markup.slice(0, 120)}`,
);
await page.locator('.archive-item').first().getByRole('button', { name: 'Elimina' }).click();
await button('Sì, elimina').click();
await page.waitForFunction(() => document.querySelectorAll('.archive-item').length === 2);
const unexpected = consoleErrors.filter((e, i) => i < errorsBeforeAttack || !/inline event handler violates the following Content Security Policy/.test(e));

check('7', 'nessun errore in console, nessuna violazione della CSP', unexpected.length === 0, unexpected.slice(0, 3).join(' | '));

await browser.close();
await server.close();
console.log(failures.length ? `\nFalliti: ${failures.join(', ')}` : '\nTutti i controlli superati.');
process.exit(failures.length ? 1 : 0);
