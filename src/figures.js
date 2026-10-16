// Loads Simone's artwork listed in assets/manifest.json: the Gormiti figures (id → figure) and the
// crests (popolo → figure). read(path) → Promise<string>, with paths relative to assets/ (fetch in
// the browser, the disk in tests). A file that can't be read or drawn is skipped with a warning:
// one broken SVG never stops the app.
import { parseFigureSvg } from './svg-figure.js';

async function loadList(list, read, key) {
  const entries = await Promise.all(
    (list ?? []).map(async (entry) => {
      try {
        const figure = parseFigureSvg(await read(entry.file));
        if (figure.unsupported.length) console.warn(`${entry.file}: ignorati ${figure.unsupported.join(', ')}`);
        return [entry[key], { ...entry, ...figure }];
      } catch (err) {
        console.warn(`${entry.file}: figura non caricata (${err.message})`);
        return null;
      }
    }),
  );
  return new Map(entries.filter(Boolean));
}

export async function loadAssets(read) {
  let manifest;
  try {
    manifest = JSON.parse(await read('manifest.json'));
  } catch {
    return { figures: new Map(), stemmi: new Map() };
  }
  const [figures, stemmi] = await Promise.all([loadList(manifest.gormiti, read, 'id'), loadList(manifest.stemmi, read, 'popolo')]);
  return { figures, stemmi };
}

export const loadFigures = async (read) => (await loadAssets(read)).figures;

// Choosing a figure in Genera also fills Nome and Alias with its texts (gormiti/nomi.json).
// A figure without texts, or the placeholder (no figure), leaves them as they are.
export function chooseFigure(params, figure) {
  params.gormita.figure = figure?.id ?? '';
  if (figure?.nome) params.nome.text = figure.nome;
  if (figure?.alias) params.testo.text = figure.alias;
}
