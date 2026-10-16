import { it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { figureName, scanAssets, stemmaPopolo } from '../scripts/assets-manifest.mjs';
import { loadFigures, loadAssets, chooseFigure } from '../src/figures.js';
import { defaultParams } from '../src/elements/index.js';

const BLOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>';

function assetsDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'gormiti-assets-'));
  mkdirSync(join(dir, 'gormiti'));
  for (const [name, content] of Object.entries(files)) writeFileSync(join(dir, 'gormiti', name), content);
  return dir;
}

it('figure names come from the file names', () => {
  expect(figureName('sommoLuminescente.svg')).toBe('Sommo Luminescente');
  expect(figureName('sommo-luminescente.svg')).toBe('Sommo Luminescente');
  expect(figureName('Sommo Luminescente.svg')).toBe('Sommo Luminescente');
  expect(figureName('tasaurus_2.svg')).toBe('Tasaurus 2');
});

it('the manifest lists the SVGs in assets/gormiti by name and ignores anything else', () => {
  const dir = mkdtempSync(join(tmpdir(), 'gormiti-assets-'));
  mkdirSync(join(dir, 'gormiti'));
  for (const f of ['zz-top.svg', 'sommoLuminescente.svg', '.DS_Store', 'note.txt', 'Alfa.SVG']) writeFileSync(join(dir, 'gormiti', f), BLOCK);
  expect(scanAssets(dir)).toEqual({
    gormiti: [
      { id: 'Alfa', name: 'Alfa', file: 'gormiti/Alfa.SVG' },
      { id: 'sommoLuminescente', name: 'Sommo Luminescente', file: 'gormiti/sommoLuminescente.svg' },
      { id: 'zz-top', name: 'Zz Top', file: 'gormiti/zz-top.svg' },
    ],
    stemmi: [],
  });
  expect(scanAssets(join(dir, 'missing'))).toEqual({ gormiti: [], stemmi: [] });
});

it('each figure takes its Nome and Alias from gormiti/nomi.json, keyed by file name with or without .svg', () => {
  const dir = assetsDir({
    'sommoLuminescente.svg': BLOCK,
    'tasaurus.svg': BLOCK,
    'mezzo.svg': BLOCK,
    'senzaTesti.svg': BLOCK,
    'nomi.json': JSON.stringify({
      sommoLuminescente: { nome: 'Luminescente', alias: 'Sommo' },
      'tasaurus.svg': { nome: ' Tasaurus ', alias: 'Il\nSelvaggio' },
      mezzo: { nome: 'Solo il nome', alias: '  ' },
    }),
  });
  expect(scanAssets(dir).gormiti).toEqual([
    { id: 'mezzo', name: 'Mezzo', file: 'gormiti/mezzo.svg', nome: 'Solo il nome' },
    { id: 'senzaTesti', name: 'Senza Testi', file: 'gormiti/senzaTesti.svg' },
    { id: 'sommoLuminescente', name: 'Sommo Luminescente', file: 'gormiti/sommoLuminescente.svg', nome: 'Luminescente', alias: 'Sommo' },
    { id: 'tasaurus', name: 'Tasaurus', file: 'gormiti/tasaurus.svg', nome: 'Tasaurus', alias: 'Il\nSelvaggio' },
  ]);
});

it('a broken nomi.json is reported and ignored: the figures are still listed', () => {
  const dir = assetsDir({ 'sommoLuminescente.svg': BLOCK, 'nomi.json': '{ "sommoLuminescente": { "nome": "Lumin' });
  const warn = vi.fn();
  expect(scanAssets(dir, warn).gormiti).toEqual([{ id: 'sommoLuminescente', name: 'Sommo Luminescente', file: 'gormiti/sommoLuminescente.svg' }]);
  expect(warn).toHaveBeenCalledOnce();
  expect(warn.mock.calls[0][0]).toContain('nomi.json');
});

it('every figure in public/assets/gormiti has its Nome and Alias, and nomi.json names no missing file', () => {
  const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
  const warn = vi.fn();
  const { gormiti } = scanAssets(assets, warn);
  expect(warn).not.toHaveBeenCalled();
  expect(gormiti.filter((g) => !g.nome || !g.alias).map((g) => g.file)).toEqual([]);
  const keys = Object.keys(JSON.parse(readFileSync(join(assets, 'gormiti', 'nomi.json'), 'utf8')));
  const known = new Set(gormiti.flatMap((g) => [g.id, g.file.slice('gormiti/'.length)]));
  expect(keys.filter((k) => !known.has(k))).toEqual([]);
});

it('choosing a figure fills Nome and Alias with its texts; the placeholder, or a figure without texts, leaves them', () => {
  const params = defaultParams();
  params.nome.text = 'Scritto a mano';
  params.testo.text = 'Anche questo';
  const fields = () => [params.gormita.figure, params.nome.text, params.testo.text];
  chooseFigure(params, { id: 'sommoLuminescente', nome: 'Luminescente', alias: 'Sommo' });
  expect(fields()).toEqual(['sommoLuminescente', 'Luminescente', 'Sommo']);
  params.nome.text = 'Cambiato';
  chooseFigure(params, { id: 'senzaTesti' });
  expect(fields()).toEqual(['senzaTesti', 'Cambiato', 'Sommo']);
  chooseFigure(params, undefined); // Segnaposto (dal nome)
  expect(fields()).toEqual(['', 'Cambiato', 'Sommo']);
});

it('loads the figures of the manifest; a broken file is skipped with a warning', async () => {
  const files = {
    'manifest.json': JSON.stringify({
      gormiti: [
        { id: 'a', name: 'A', file: 'gormiti/a.svg', nome: 'Luminescente', alias: 'Sommo' },
        { id: 'b', name: 'B', file: 'gormiti/b.svg' },
        { id: 'c', name: 'C', file: 'gormiti/c.svg' },
      ],
    }),
    'gormiti/a.svg': BLOCK,
    'gormiti/b.svg': '<svg><text>niente da disegnare</text></svg>',
  };
  const read = async (path) => {
    if (!(path in files)) throw new Error(`404 ${path}`);
    return files[path];
  };
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  const figures = await loadFigures(read);
  expect([...figures.keys()]).toEqual(['a']);
  expect(figures.get('a')).toMatchObject({ id: 'a', name: 'A', nome: 'Luminescente', alias: 'Sommo' });
  expect(warn).toHaveBeenCalledTimes(2); // b has nothing to draw, c is missing
  warn.mockRestore();
});

it('no manifest, no figures', async () => {
  const figures = await loadFigures(async () => {
    throw new Error('404');
  });
  expect(figures.size).toBe(0);
});

it('crests in assets/stemmi are listed by popolo, taken from the file name', () => {
  expect(stemmaPopolo('stemmaAria.svg')).toBe('aria');
  expect(stemmaPopolo('stemma-Vulcano.svg')).toBe('vulcano');
  expect(stemmaPopolo('Mare.svg')).toBe('mare');
  const dir = mkdtempSync(join(tmpdir(), 'gormiti-assets-'));
  mkdirSync(join(dir, 'stemmi'));
  for (const f of ['stemmaTerra.svg', 'stemmaAria.svg', 'note.txt']) writeFileSync(join(dir, 'stemmi', f), BLOCK);
  expect(scanAssets(dir).stemmi).toEqual([
    { popolo: 'aria', file: 'stemmi/stemmaAria.svg' },
    { popolo: 'terra', file: 'stemmi/stemmaTerra.svg' },
  ]);
});

it("Simone's seven crests load, one per popolo", async () => {
  const assets = fileURLToPath(new URL('../public/assets/', import.meta.url));
  const manifest = scanAssets(assets);
  const { stemmi } = await loadAssets(async (path) => (path === 'manifest.json' ? JSON.stringify(manifest) : readFileSync(join(assets, path), 'utf8')));
  expect([...stemmi.keys()]).toEqual(['aria', 'foresta', 'luce', 'mare', 'tenebre', 'terra', 'vulcano']);
});
