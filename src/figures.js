// Loads Simone's artwork listed in assets/manifest.json: the Gormiti figures (id → figure) and the
// crests and the popoli words (popolo → figure), and the Numero badge. read(path) → Promise<string>, with paths relative to assets/ (fetch in
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
    return { figures: new Map(), stemmi: new Map(), numero: null, popoli: new Map() };
  }
  const [figures, stemmi, numero, popoli] = await Promise.all([
    loadList(manifest.gormiti, read, 'id'),
    loadList(manifest.stemmi, read, 'popolo'),
    loadNumero(manifest.numero, read),
    loadList(manifest.popoli, read, 'popolo'),
  ]);
  return { figures, stemmi, numero, popoli };
}

// The Numero badge needs its "numero" box; without it the star placeholder stays.
async function loadNumero(file, read) {
  if (!file) return null;
  try {
    const figure = parseFigureSvg(await read(file), { slot: 'numero' });
    if (!figure.slot) throw new Error('manca la forma chiamata «numero», il posto del numero');
    if (figure.unsupported.length) console.warn(`${file}: ignorati ${figure.unsupported.join(', ')}`);
    return { file, ...figure };
  } catch (err) {
    console.warn(`${file}: badge del numero non caricato (${err.message})`);
    return null;
  }
}

export const loadFigures = async (read) => (await loadAssets(read)).figures;

// Choosing a figure in Genera also fills Nome and Alias with its texts and sets Popolo and Stemma
// to its popolo (gormiti/nomi.json). What the figure doesn't have, or the placeholder (no figure),
// leaves the fields as they are.
export function chooseFigure(params, figure) {
  params.gormita.figure = figure?.id ?? '';
  if (figure?.nome) params.nome.text = figure.nome;
  if (figure?.alias) params.testo.text = figure.alias;
  if (figure?.popolo) params.popolo.popolo = params.stemma.popolo = figure.popolo;
}

// A Gormita figure fixes its popolo, Nome and Alias (nomi.json): on the same sheet, a Popolo or
// Stemma of another popolo, or a Nome or Alias with another text, is a conflict, which stops saving
// and exporting. → { figure: name, field: 'popolo' | 'nome' | 'alias', value: expected } or null.
export function figureConflict(elements, figures) {
  const rules = [
    { field: 'popolo', types: ['popolo', 'stemma'], key: 'popolo' },
    { field: 'nome', types: ['nome'], key: 'text' },
    { field: 'alias', types: ['testo'], key: 'text' },
  ];
  for (const g of elements) {
    const figure = g.type === 'gormita' ? figures.get(g.params.figure) : null;
    if (!figure) continue;
    for (const { field, types, key } of rules) {
      if (figure[field] && elements.some((e) => types.includes(e.type) && e.params[key] !== figure[field])) {
        return { figure: figure.name, field, value: figure[field] };
      }
    }
  }
  return null;
}
