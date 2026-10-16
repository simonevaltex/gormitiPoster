// "Esporta" dialog, in the page: format, bleed (from the poster), crop marks, file name.
import { A3, EXPORT } from '../constants.js';
import { exportPdf, exportSvg, downloadBlob, exportFileName } from '../export.js';
import { h, segmented, checkboxField } from './dom.js';
import { showStatus } from './status.js';

export function createExportDialog({ root, fonts, figures, stemmi, numero, popoli }) {
  let recipe = null;
  let opener = null;
  const state = { format: 'pdf', cropMarks: false };

  const title = h('h2', { class: 'label', id: 'export-title' }, 'Esporta');
  const close = h('button', { type: 'button', onclick: () => hide() }, 'Chiudi');
  const format = segmented({
    label: 'Formato',
    options: [
      { value: 'pdf', label: 'PDF vettoriale' },
      { value: 'svg', label: 'SVG' },
    ],
    value: state.format,
    onChange: (v) => {
      state.format = v;
      refresh();
    },
  });
  const marks = checkboxField({
    label: `Segni di taglio (abbondanza ${EXPORT.slug} mm)`,
    checked: false,
    onChange: (v) => {
      state.cropMarks = v;
      refresh();
    },
  });
  const bleed = h('p', { class: 'readout' });
  const page = h('p', { class: 'readout' });
  const file = h('p', { class: 'readout' });
  const download = h('button', { type: 'button', class: 'primary' }, 'Scarica');
  const note = h('p', { class: 'hint' }, 'Testo in tracciati, colori esatti in RGB. Guide, griglie e pad non vengono esportati.');

  const dialog = h(
    'div',
    { class: 'dialog', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title' },
    h('div', { class: 'dialog-head' }, title, close),
    format.field,
    bleed,
    marks.field,
    page,
    file,
    h('div', { class: 'row' }, download),
    note,
  );
  root.append(dialog);

  function refresh() {
    if (!recipe) return;
    const slug = state.cropMarks ? EXPORT.slug : 0;
    const w = A3.width + 2 * (recipe.bleed + slug);
    const hgt = A3.height + 2 * (recipe.bleed + slug);
    bleed.textContent = `Bleed ${recipe.bleed} mm (dal poster)`;
    page.textContent = `Pagina ${w} × ${hgt} mm`;
    file.textContent = `File ${exportFileName(recipe.number, state.format)}`;
  }

  download.addEventListener('click', async () => {
    const name = exportFileName(recipe.number, state.format);
    download.disabled = true;
    download.textContent = 'Preparazione…';
    try {
      const options = { fonts, figures, stemmi, numero, popoli, cropMarks: state.cropMarks };
      const blob = state.format === 'pdf' ? await exportPdf(recipe, options) : exportSvg(recipe, options);
      downloadBlob(blob, name);
      showStatus(`Esportato ${name}`);
      hide();
    } catch (err) {
      console.warn(err);
      showStatus('Esportazione non riuscita');
    } finally {
      download.disabled = false;
      download.textContent = 'Scarica';
    }
  });

  function show(r) {
    recipe = r;
    opener = document.activeElement;
    refresh();
    root.hidden = false;
    download.focus();
  }

  function hide() {
    root.hidden = true;
    opener?.focus?.();
  }

  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hide();
    if (e.key !== 'Tab') return;
    // keep keyboard focus inside the dialog
    const focusable = [...dialog.querySelectorAll('button, input')].filter((el) => !el.disabled && el.offsetParent);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (e.shiftKey && document.activeElement === first) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  });
  root.addEventListener('pointerdown', (e) => e.target === root && hide());

  return { show, hide };
}
