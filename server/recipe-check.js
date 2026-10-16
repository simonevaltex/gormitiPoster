// What the shared archive accepts. Anyone with the link can save, so a recipe is checked before it is
// stored: the shape the site writes (see model.toRecipe and the README), numbers that are numbers,
// colours that are hex, and sizes that keep the archive light. Unknown params are left alone, so a
// new field in an element doesn't need a change here.

export const MAX_RECIPE_BYTES = 2_000_000;
const MAX_THUMBNAIL_CHARS = 1_500_000;
const MAX_ITEMS = 500;
const ID = /^[\w-]{1,64}$/;
const HEX = /^#[0-9a-f]{6}$/i;
const ELEMENT_TYPES = new Set(['popolo', 'stemma', 'gormita', 'nome', 'testo', 'numero']);

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);

export const isPosterId = (id) => typeof id === 'string' && ID.test(id);

function checkAttractor(a, i) {
  if (!isObject(a) || !isPosterId(a.id)) return `attrattore ${i}: id mancante`;
  if (!isNumber(a.strength) || a.strength < 1 || a.strength > 100) return `attrattore ${a.id}: forza fuori da 1-100`;
  const coords = a.type === 'point' ? ['x', 'y'] : a.type === 'segment' ? ['x1', 'y1', 'x2', 'y2'] : null;
  if (!coords) return `attrattore ${a.id}: tipo sconosciuto`;
  if (!coords.every((k) => isNumber(a[k]))) return `attrattore ${a.id}: coordinate non valide`;
  return null;
}

function checkElement(el, i) {
  if (!isObject(el) || !isPosterId(el.id)) return `elemento ${i}: id mancante`;
  if (!ELEMENT_TYPES.has(el.type)) return `elemento ${el.id}: tipo sconosciuto`;
  if (!isObject(el.params)) return `elemento ${el.id}: parametri mancanti`;
  if (!['x', 'y', 'angle'].every((k) => isNumber(el[k]))) return `elemento ${el.id}: posizione non valida`;
  return null;
}

// Returns the first problem found, in Italian (it reaches the status line), or null.
export function checkRecipe(r, id) {
  if (!isObject(r)) return 'la ricetta non è un oggetto';
  if (r.version !== 1) return 'versione della ricetta non supportata';
  if (!isPosterId(r.id) || r.id !== id) return 'id del poster non valido';
  if (!Number.isInteger(r.number) || r.number < 1 || r.number > 99_999) return 'numero del poster non valido';
  if (typeof r.date !== 'string' || Number.isNaN(Date.parse(r.date))) return 'data non valida';
  if (!isObject(r.colors) || !HEX.test(r.colors.carta) || !HEX.test(r.colors.inchiostro)) return 'colori non validi';
  if (!isNumber(r.bleed) || r.bleed < 0 || r.bleed > 50) return 'bleed non valido';
  if (r.settings !== undefined && !isObject(r.settings)) return 'impostazioni non valide';
  if (!Array.isArray(r.attractors) || r.attractors.length > MAX_ITEMS) return 'attrattori non validi';
  if (!Array.isArray(r.elements) || r.elements.length > MAX_ITEMS) return 'elementi non validi';
  if (typeof r.thumbnail !== 'string' || !r.thumbnail.startsWith('<svg') || r.thumbnail.length > MAX_THUMBNAIL_CHARS) return 'miniatura non valida';
  for (const [i, a] of r.attractors.entries()) {
    const problem = checkAttractor(a, i);
    if (problem) return problem;
  }
  for (const [i, el] of r.elements.entries()) {
    const problem = checkElement(el, i);
    if (problem) return problem;
  }
  return null;
}
