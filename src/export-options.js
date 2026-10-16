// The choices of the Esporta dialog, turned into what gets drawn. DOM-free.
import { A3, EXPORT } from './constants.js';

export const EXPORT_DEFAULTS = {
  format: 'pdf', // 'pdf' | 'svg' | 'png'
  page: 'bleed', // 'a3' (trimmed A3, no bleed) | 'bleed'
  cropMarks: false, // with the bleed only
  colors: 'current', // 'current' (the site's) | 'saved' (the poster's) | 'custom'
  custom: null, // { carta, inchiostro } for 'custom'
  transparent: false, // no paper background
  invert: false, // paper and ink swapped
  scale: 2, // PNG only, × 96 px per inch
  aliased: false, // PNG only: hard edges, no in-between pixels
};

export const PNG_SCALES = [0.5, 1, 2, 3, 4];
export const PX_PER_MM = 96 / 25.4;

// → { recipe (with the page's bleed and the chosen colours), cropMarks, background, width, height }
export function exportSetup(recipe, choice, currentColors) {
  const picked = choice.colors === 'saved' ? recipe.colors : choice.colors === 'custom' ? choice.custom : currentColors;
  const colors = choice.invert ? { carta: picked.inchiostro, inchiostro: picked.carta } : { ...picked };
  const bleed = choice.page === 'a3' ? 0 : recipe.bleed;
  const cropMarks = choice.page !== 'a3' && Boolean(choice.cropMarks);
  const slug = cropMarks ? EXPORT.slug : 0;
  return {
    recipe: { ...recipe, bleed, colors },
    cropMarks,
    background: !choice.transparent,
    width: A3.width + 2 * (bleed + slug),
    height: A3.height + 2 * (bleed + slug),
  };
}

export const pngSize = ({ width, height }, scale) => ({
  width: Math.round(width * PX_PER_MM * scale),
  height: Math.round(height * PX_PER_MM * scale),
});

// "Gran Sirèna", "la Bella" → "granSirenaLaBella": accents and anything not a letter or digit go.
const camelCase = (texts) =>
  texts
    .flatMap((t) => t.normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^A-Za-z0-9]+/))
    .filter(Boolean)
    .map((w, i) => (i ? w[0].toUpperCase() + w.slice(1).toLowerCase() : w.toLowerCase()))
    .join('');

// gormitiPoster012_terra_furiaCieca.pdf: the poster number, the popolo of the Gormita (its
// figure's, else the Popolo block's), then Nome and Alias as on the sheet. Missing parts are left out.
export function exportFileName(recipe, ext, figures = new Map()) {
  const find = (type) => recipe.elements.find((e) => e.type === type)?.params;
  const figure = figures.get(find('gormita')?.figure);
  const popolo = figure?.popolo ?? find('popolo')?.popolo;
  const nomeAlias = camelCase([find('nome')?.text ?? '', find('testo')?.text ?? '']);
  const parts = [`gormitiPoster${String(recipe.number).padStart(3, '0')}`, popolo, nomeAlias].filter(Boolean);
  return `${parts.join('_')}.${ext}`;
}
