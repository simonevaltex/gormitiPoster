// Archive view (the "Archivio" tab): save the sheet as a recipe, list posters, reopen, export
// or delete them. The archive is shared by everyone with the link (storage/api.js); the posters
// saved before in this browser can be copied into it.
import DOMPurify from 'dompurify';
import { storage, browserStorage } from './storage/index.js';
import { composeSheetSvg, lightenSvg } from './recipe.js';
import { screenPaint } from './paint.js';
import { h } from './ui/dom.js';
import { confirmButton } from './ui/inline-confirm.js';
import { showStatus } from './ui/status.js';

export const nextPosterNumber = (items) => items.reduce((max, p) => Math.max(max, p.number || 0), 0) + 1;
export const pad3 = (n) => String(n).padStart(3, '0');

// Thumbnails come from the shared archive, which anyone can write to: only plain SVG gets in.
export const safeThumbnail = (svg) => DOMPurify.sanitize(svg, { USE_PROFILES: { svg: true } });

// The posters of this browser's old archive (IndexedDB) that the shared one doesn't have yet.
async function localOnly(shared) {
  try {
    const ids = new Set(shared.map((p) => p.id));
    return (await browserStorage.list()).filter((p) => !ids.has(p.id));
  } catch {
    return [];
  }
}

export function createArchive({ store, model, fonts, figures, stemmi, numero, popoli, root, tabs, onExport }) {
  const s = store.state;
  const list = h('ol', { class: 'archive-list' });
  const migration = h('div', { class: 'archive-migration', hidden: true });
  root.append(h('h2', { class: 'visually-hidden' }, 'Archivio'), migration, list);
  let unreachable = false;

  // Switches between the Crea and Archivio tabs.
  function toggle(open = root.hidden) {
    root.hidden = !open;
    tabs.archive.setAttribute('aria-selected', String(open));
    tabs.crea.setAttribute('aria-selected', String(!open));
  }
  tabs.crea.addEventListener('click', () => toggle(false));
  // Opening the tab reads the list again: other devices may have saved meanwhile.
  tabs.archive.addEventListener('click', () => {
    toggle(true);
    refresh();
  });

  // Returns false when the archive can't be reached (the last list stays on screen).
  async function refresh() {
    try {
      s.archive.items = await storage.list();
      unreachable = false;
    } catch (err) {
      unreachable = true;
      showStatus(`Archivio non raggiungibile: ${err.message}`, 6000);
    }
    s.archive.nextNumber = nextPosterNumber(s.archive.items);
    store.emit('archive');
    model.refreshNumberBadges();
    render();
    renderMigration(unreachable ? [] : await localOnly(s.archive.items));
    return !unreachable;
  }

  // "Salva poster" always adds a new poster, numbered max + 1 (duplicates are allowed). The list is
  // read again first, so a poster saved meanwhile from another device counts.
  async function save() {
    if (!(await refresh())) return;
    const number = s.archive.nextNumber;
    const id = `p${Date.now().toString(36)}`;
    const recipe = model.toRecipe({ id, number, date: new Date().toISOString() });
    const thumbnail = composeSheetSvg(recipe, { fonts, figures, stemmi, numero, popoli, paint: screenPaint, idPrefix: `thumb-${id}`, detail: 'thumbnail' });
    recipe.thumbnail = lightenSvg(thumbnail.svg);
    try {
      await storage.save(recipe);
    } catch (err) {
      showStatus(`Salvataggio non riuscito: ${err.message}`, 6000);
      return;
    }
    s.poster = { id, number };
    store.emit('poster');
    await refresh();
    showStatus(`Poster ${pad3(number)} salvato`);
  }

  // The full recipe of a poster in the list, or null (with a message) if it can't be read.
  async function fetchRecipe(id) {
    try {
      const recipe = await storage.get(id);
      if (!recipe) showStatus('Poster non trovato: forse è stato eliminato');
      return recipe;
    } catch (err) {
      showStatus(`Archivio non raggiungibile: ${err.message}`, 6000);
      return null;
    }
  }

  async function reopen(id) {
    const recipe = await fetchRecipe(id);
    if (!recipe) return refresh();
    model.loadRecipe(recipe);
    toggle(false);
    showStatus(`Poster ${pad3(recipe.number)} riaperto`);
  }

  async function exportPoster(id) {
    const recipe = await fetchRecipe(id);
    if (recipe) onExport(recipe);
  }

  async function remove(id) {
    try {
      await storage.remove(id);
    } catch (err) {
      showStatus(`Eliminazione non riuscita: ${err.message}`, 6000);
      return;
    }
    if (s.poster.id === id) {
      s.poster = { id: null, number: null };
      store.emit('poster');
    }
    await refresh();
  }

  // Copies this browser's old posters into the shared archive, keeping their id and number.
  async function copyLocal(posters) {
    let copied = 0;
    let firstError = null;
    for (const p of posters) {
      try {
        const recipe = await browserStorage.get(p.id);
        if (recipe) await storage.save(recipe);
        copied++;
      } catch (err) {
        firstError ??= err;
      }
    }
    await refresh();
    const failed = posters.length - copied;
    showStatus(failed ? `Copiati ${copied} poster, ${failed} non riusciti: ${firstError.message}` : `Copiati ${copied} poster nell’archivio condiviso`, 6000);
  }

  function renderMigration(posters) {
    migration.hidden = !posters.length;
    if (!posters.length) return migration.replaceChildren();
    const count = posters.length === 1 ? '1 poster salvato' : `${posters.length} poster salvati`;
    const copy = h('button', { type: 'button' }, 'Copia nell’archivio condiviso');
    copy.addEventListener('click', async () => {
      copy.disabled = true;
      copy.textContent = 'Copia in corso…';
      await copyLocal(posters);
    });
    migration.replaceChildren(
      h('p', { class: 'hint' }, `In questo browser ci sono ${count} prima dell’archivio condiviso (${posters.map((p) => pad3(p.number)).join(', ')}).`),
      copy,
    );
  }

  function render() {
    list.replaceChildren();
    if (!s.archive.items.length) {
      list.append(
        h('li', { class: 'hint' }, unreachable ? 'Archivio non raggiungibile. Controlla la connessione e riapri la scheda.' : 'Nessun poster salvato. Usa “Salva in archivio” nella scheda Crea.'),
      );
      return;
    }
    for (const p of s.archive.items) {
      const thumb = h('div', { class: 'thumb' });
      thumb.innerHTML = safeThumbnail(p.thumbnail ?? '');
      const del = confirmButton({ label: 'Elimina', question: `Eliminare il ${pad3(p.number)}?`, confirmLabel: 'Sì, elimina', onConfirm: () => remove(p.id) });
      list.append(
        h(
          'li',
          { class: 'archive-item' },
          thumb,
          h(
            'div',
            { class: 'stack' },
            h('p', { class: 'archive-number mono' }, `N° ${pad3(p.number)}`),
            h('p', { class: 'readout' }, new Date(p.date).toLocaleDateString('it-IT')),
            h('p', { class: 'readout' }, `Carta ${p.colors.carta.toUpperCase()} · Inchiostro ${p.colors.inchiostro.toUpperCase()}`),
            h(
              'div',
              { class: 'row' },
              h('button', { type: 'button', onclick: () => reopen(p.id) }, 'Riapri'),
              h('button', { type: 'button', onclick: () => exportPoster(p.id) }, 'Esporta PDF'),
              del.element,
            ),
          ),
        ),
      );
    }
  }

  root.addEventListener('keydown', (e) => e.key === 'Escape' && toggle(false));
  return { refresh, save, toggle };
}
