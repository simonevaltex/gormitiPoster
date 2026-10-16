// The list of Simone's artwork in public/assets (gormiti/, stemmi/, numero/), for the browser (which
// can't list a folder).
// In development it is served live at /assets/manifest.json, so a new SVG shows up on reload;
// the build writes the same file into dist. The list itself needs no editing: drop the SVG in
// the folder. Only the Nome, Alias and popolo of each Gormita are written by hand, in
// gormiti/nomi.json.
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { POPOLI } from '../src/popoli.js';

// { "sommoLuminescente": { "nome": "Luminescente", "alias": "Sommo", "popolo": "luce" } }, keyed
// by file name with or without .svg. Choosing the figure in Genera fills the Nome and Alias fields
// and fixes Popolo and Stemma to its popolo.
export const TEXTS_FILE = 'nomi.json';

// "sommoLuminescente.svg", "sommo-luminescente.svg", "Sommo Luminescente.svg" → "Sommo Luminescente".
export function figureName(file) {
  return file
    .replace(/\.svg$/i, '')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toLocaleUpperCase('it') + word.slice(1))
    .join(' ');
}

function svgFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => /\.svg$/i.test(f) && !f.startsWith('.'));
  } catch {
    return [];
  }
}

// A missing file means no texts; a broken one is reported and ignored, never losing the figures.
function readTexts(path, warn) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    return {};
  }
  try {
    const texts = JSON.parse(raw);
    return texts && typeof texts === 'object' ? texts : {};
  } catch (err) {
    warn(`gormiti/${TEXTS_FILE} non è un JSON valido, nomi e alias ignorati (${err.message})`);
    return {};
  }
}

const nonEmpty = (v) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);

// The id is the file name: recipes store it, so renaming a file loses it in saved posters.
export function scanAssets(assetsDir, warn = console.warn) {
  const dir = join(assetsDir, 'gormiti');
  const texts = readTexts(join(dir, TEXTS_FILE), warn);
  const gormiti = svgFiles(dir)
    .map((file) => {
      const id = file.replace(/\.svg$/i, '');
      const t = texts[file] ?? texts[id];
      const nome = nonEmpty(t?.nome);
      const alias = nonEmpty(t?.alias);
      let popolo = nonEmpty(t?.popolo)?.toLowerCase();
      if (popolo && !POPOLI.some((p) => p.id === popolo)) {
        warn(`gormiti/${TEXTS_FILE}: il popolo «${t.popolo}» di ${id} non esiste (${POPOLI.map((p) => p.id).join(', ')})`);
        popolo = undefined;
      }
      return { id, name: figureName(file), file: `gormiti/${file}`, ...(nome && { nome }), ...(alias && { alias }), ...(popolo && { popolo }) };
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return { gormiti, stemmi: scanStemmi(join(assetsDir, 'stemmi')), numero: scanNumero(join(assetsDir, 'numero')) };
}

// The badge of the Numero: one SVG in assets/numero, whatever its name (numero.svg if there are
// more). Its "numero" box is read by the browser (see figures.js).
function scanNumero(dir) {
  const files = svgFiles(dir).sort((a, b) => a.localeCompare(b, 'it'));
  const file = files.find((f) => f.toLowerCase() === 'numero.svg') ?? files[0];
  return file ? `numero/${file}` : null;
}

// "stemmaAria.svg", "stemma-aria.svg", "Aria.svg" → the popolo "aria". One crest per popolo.
export const stemmaPopolo = (file) =>
  file
    .replace(/\.svg$/i, '')
    .replace(/^stemma[\s_-]*/i, '')
    .toLocaleLowerCase('it');

function scanStemmi(dir) {
  return svgFiles(dir)
    .map((file) => ({ popolo: stemmaPopolo(file), file: `stemmi/${file}` }))
    .filter((s) => s.popolo)
    .sort((a, b) => a.popolo.localeCompare(b.popolo, 'it'));
}

export function assetsManifest() {
  let dir;
  return {
    name: 'gormiti-assets-manifest',
    configResolved(config) {
      dir = join(config.publicDir, 'assets');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.split('?')[0] !== `${server.config.base}assets/manifest.json`) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(scanAssets(dir, (msg) => server.config.logger.warn(msg))));
      });
    },
    generateBundle() {
      const manifest = scanAssets(dir, (msg) => this.warn(msg));
      this.emitFile({ type: 'asset', fileName: 'assets/manifest.json', source: `${JSON.stringify(manifest, null, 2)}\n` });
    },
  };
}
