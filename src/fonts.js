import { parse } from 'opentype.js';

// Static TTFs in public/fonts/ (opentype.js reads neither WOFF2 nor variable fonts).
export const FONT_FILES = {
  regular: 'Geist-Regular.ttf',
  medium: 'Geist-Medium.ttf',
  bold: 'Geist-Bold.ttf',
  mono: 'GeistMono-Medium.ttf',
};

// loadBuffer(fileName) → ArrayBuffer (or a promise of one): fetch in the browser, fs in tests.
export async function loadFonts(loadBuffer) {
  const entries = await Promise.all(
    Object.entries(FONT_FILES).map(async ([key, file]) => [key, parse(await loadBuffer(file))]),
  );
  return Object.fromEntries(entries);
}
