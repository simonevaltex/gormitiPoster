// Dev helper: start Vite, open the app in headless Chromium, optionally run a snippet, save a
// screenshot to verification-output/<name>.png and report console errors (exit 1 if any).
// Usage: node scripts/shot.mjs <name> [--eval "<js expression, may return a promise>"]
//        [--wait <ms>] [--width 1440] [--height 900] [--frames "0,400,900"]
import { createServer } from 'vite';
import { chromium } from 'playwright';
import { mkdirSync } from 'node:fs';

const args = process.argv.slice(2);
const name = args[0] ?? 'shot';
const opt = (key, fallback) => {
  const i = args.indexOf(`--${key}`);
  return i >= 0 ? args[i + 1] : fallback;
};

const server = await createServer({ server: { port: 5199 }, logLevel: 'error' });
await server.listen();
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: +opt('width', 1440), height: +opt('height', 900) } });
const errors = [];
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
page.on('pageerror', (e) => errors.push(e.message));

try {
  await page.goto(server.resolvedUrls.local[0]);
  await page.waitForFunction(() => window.__gormiti?.ready, null, { timeout: 20000 });
  const code = opt('eval');
  if (code) await page.evaluate(code);
  mkdirSync('verification-output', { recursive: true });
  const frames = opt('frames');
  if (frames) {
    let elapsed = 0;
    for (const t of frames.split(',').map(Number)) {
      await page.waitForTimeout(t - elapsed);
      elapsed = t;
      await page.screenshot({ path: `verification-output/${name}-${t}.png` });
      console.log(`verification-output/${name}-${t}.png`);
    }
  } else {
    await page.waitForTimeout(+opt('wait', 300));
    await page.screenshot({ path: `verification-output/${name}.png` });
    console.log(`verification-output/${name}.png`);
  }
} finally {
  console.log(errors.length ? `console errors:\n${errors.join('\n')}` : 'no console errors');
  await browser.close();
  await server.close();
}
process.exit(errors.length ? 1 : 0);
