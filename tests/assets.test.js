import { it, expect, vi } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { figureName, scanAssets } from '../scripts/assets-manifest.mjs';
import { loadFigures } from '../src/figures.js';

const BLOCK = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 50"><rect width="100" height="50"/></svg>';

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
  });
  expect(scanAssets(join(dir, 'missing'))).toEqual({ gormiti: [] });
});

it('loads the figures of the manifest; a broken file is skipped with a warning', async () => {
  const files = {
    'manifest.json': JSON.stringify({
      gormiti: [
        { id: 'a', name: 'A', file: 'gormiti/a.svg' },
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
  expect(figures.get('a')).toMatchObject({ id: 'a', name: 'A' });
  expect(warn).toHaveBeenCalledTimes(2); // b has nothing to draw, c is missing
  warn.mockRestore();
});

it('no manifest, no figures', async () => {
  const figures = await loadFigures(async () => {
    throw new Error('404');
  });
  expect(figures.size).toBe(0);
});
