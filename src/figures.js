// Loads the figures listed in assets/manifest.json. read(path) → Promise<string>, with paths
// relative to assets/ (fetch in the browser, the disk in tests). A file that can't be read or
// drawn is skipped with a warning: one broken SVG never stops the app.
import { parseFigureSvg } from './svg-figure.js';

export async function loadFigures(read) {
  let manifest;
  try {
    manifest = JSON.parse(await read('manifest.json'));
  } catch {
    return new Map();
  }
  const entries = await Promise.all(
    (manifest.gormiti ?? []).map(async (entry) => {
      try {
        const figure = parseFigureSvg(await read(entry.file));
        if (figure.unsupported.length) console.warn(`${entry.file}: ignorati ${figure.unsupported.join(', ')}`);
        return [entry.id, { ...entry, ...figure }];
      } catch (err) {
        console.warn(`${entry.file}: figura non caricata (${err.message})`);
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}
