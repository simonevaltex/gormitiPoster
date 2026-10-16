import { it, expect } from 'vitest';
import { exportSetup, pngSize, exportFileName, EXPORT_DEFAULTS, PNG_SCALES } from '../src/export-options.js';

const recipe = { number: 12, bleed: 3, colors: { carta: '#808080', inchiostro: '#ff6600' }, elements: [] };
const current = { carta: '#ffffff', inchiostro: '#000000' };
const setup = (choice) => exportSetup(recipe, { ...EXPORT_DEFAULTS, ...choice }, current);

it('page: plain A3 (no bleed), with the bleed, with the bleed and crop marks', () => {
  expect(setup({ page: 'a3' })).toMatchObject({ cropMarks: false, width: 297, height: 420, recipe: { bleed: 0 } });
  expect(setup({ page: 'a3', cropMarks: true })).toMatchObject({ cropMarks: false, width: 297, height: 420 });
  expect(setup({ page: 'bleed' })).toMatchObject({ cropMarks: false, width: 303, height: 426, recipe: { bleed: 3 } });
  expect(setup({ page: 'bleed', cropMarks: true })).toMatchObject({ cropMarks: true, width: 323, height: 446, recipe: { bleed: 3 } });
  expect(EXPORT_DEFAULTS).toMatchObject({ format: 'pdf', page: 'bleed', cropMarks: false, colors: 'current' });
});

it('colours: the current ones, the poster saved ones or custom ones; invert swaps paper and ink', () => {
  expect(setup({ colors: 'current' }).recipe.colors).toEqual(current);
  expect(setup({ colors: 'saved' }).recipe.colors).toEqual(recipe.colors);
  const custom = { carta: '#f4f1e8', inchiostro: '#1d3557' };
  expect(setup({ colors: 'custom', custom }).recipe.colors).toEqual(custom);
  expect(setup({ colors: 'saved', invert: true }).recipe.colors).toEqual({ carta: '#ff6600', inchiostro: '#808080' });
  expect(recipe.colors).toEqual({ carta: '#808080', inchiostro: '#ff6600' }); // the poster itself is untouched
});

it('paper: full or transparent background', () => {
  expect(setup({}).background).toBe(true);
  expect(setup({ transparent: true }).background).toBe(false);
});

it('PNG size: the page at 96 px per inch times the chosen scale', () => {
  expect(PNG_SCALES).toEqual([0.5, 1, 2, 3, 4]);
  expect(pngSize(setup({ page: 'a3' }), 1)).toEqual({ width: 1123, height: 1587 });
  expect(pngSize(setup({ page: 'a3' }), 0.5)).toEqual({ width: 561, height: 794 });
  expect(pngSize(setup({ page: 'bleed' }), 3)).toEqual({ width: 3436, height: 4830 });
});

it('file name: gormitiPoster + number _ popolo of the Gormita _ nome and alias in camelCase', () => {
  const figures = new Map([['furiaCieca', { id: 'furiaCieca', popolo: 'terra', nome: 'Furia', alias: 'Cieca' }]]);
  const el = (type, params) => ({ type, params });
  const poster = {
    number: 12,
    elements: [el('gormita', { figure: 'furiaCieca' }), el('popolo', { popolo: 'terra' }), el('nome', { text: 'Furia' }), el('testo', { text: 'Cieca' })],
  };
  expect(exportFileName(poster, 'pdf', figures)).toBe('gormitiPoster012_terra_furiaCieca.pdf');
  // Placeholder Gormita: the popolo of the Popolo block, the texts on the sheet (accents and spaces go).
  const placeholder = {
    number: 3,
    elements: [el('gormita', { figure: '', name: 'Gormita' }), el('popolo', { popolo: 'mare' }), el('nome', { text: 'Gran\nSirèna' }), el('testo', { text: 'la Bella' })],
  };
  expect(exportFileName(placeholder, 'png', figures)).toBe('gormitiPoster003_mare_granSirenaLaBella.png');
  expect(exportFileName({ number: 7, elements: [] }, 'svg', figures)).toBe('gormitiPoster007.svg');
});
