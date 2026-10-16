// "Esporta" dialog, in the page: format, page (A3 or with the bleed, crop marks), colours,
// paper, and for PNG the scale and the edges. The choices become a setup (export-options.js).
import { EXPORT } from '../constants.js';
import { exportPdf, exportSvg, exportPng, downloadBlob } from '../export.js';
import { exportSetup, pngSize, exportFileName, EXPORT_DEFAULTS, PNG_SCALES } from '../export-options.js';
import { h, segmented, checkboxField } from './dom.js';
import { showStatus } from './status.js';

const NS = 'http://www.w3.org/2000/svg';
const mm = (v) => v.toLocaleString('it-IT', { maximumFractionDigits: 1 });
const scaleLabel = (k) => `×${k.toLocaleString('it-IT')}`;

function closeIcon() {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  const path = document.createElementNS(NS, 'path');
  path.setAttribute('d', 'M5 5l14 14M19 5L5 19');
  svg.append(path);
  return svg;
}

// A colour picker for the custom colours, shown as its hex value (the swatch would be a third
// colour on screen).
function swatch(label, onInput) {
  const input = h('input', { type: 'color', 'aria-label': label });
  const hex = h('output', { class: 'mono' });
  input.addEventListener('input', () => onInput(input.value));
  return { el: h('label', { class: 'swatch' }, input, hex, h('span', { class: 'label' }, label)), input, hex };
}

export function createExportDialog({ root, fonts, figures, stemmi, numero, popoli, currentColors }) {
  const assets = { fonts, figures, stemmi, numero, popoli };
  let recipe = null;
  let opener = null;
  const choice = { ...EXPORT_DEFAULTS };

  const title = h('h2', { class: 'label', id: 'export-title' }, 'Esporta');
  const close = h('button', { type: 'button', class: 'icon close', 'aria-label': 'Chiudi', title: 'Chiudi', onclick: () => hide() }, closeIcon());
  const pick = (key) => (v) => {
    choice[key] = v;
    refresh();
  };

  const format = segmented({
    label: 'Formato',
    options: [
      { value: 'pdf', label: 'PDF' },
      { value: 'svg', label: 'SVG' },
      { value: 'png', label: 'PNG' },
    ],
    value: choice.format,
    onChange: pick('format'),
  });
  const pageField = segmented({
    label: 'Pagina',
    options: [
      { value: 'a3', label: 'A3' },
      { value: 'bleed', label: 'Con bleed' },
    ],
    value: choice.page,
    onChange: pick('page'),
  });
  const marks = checkboxField({ label: `Segni di taglio (abbondanza ${EXPORT.slug} mm)`, checked: choice.cropMarks, onChange: pick('cropMarks') });
  const colors = segmented({
    label: 'Colori',
    options: [
      { value: 'current', label: 'Attuali' },
      { value: 'saved', label: 'Salvati' },
      { value: 'custom', label: 'Personalizzati' },
    ],
    value: choice.colors,
    onChange: pick('colors'),
  });
  const setCustom = (key) => (v) => {
    choice.custom = { ...choice.custom, [key]: v };
    refresh();
  };
  const carta = swatch('Carta', setCustom('carta'));
  const inchiostro = swatch('Inchiostro', setCustom('inchiostro'));
  const customRow = h('div', { class: 'export-colors' }, carta.el, inchiostro.el);
  const sameColors = h('p', { class: 'warning', role: 'alert', hidden: true }, 'Carta e inchiostro devono essere diversi');
  const colorsReadout = h('p', { class: 'readout' });
  const paper = segmented({
    label: 'Carta',
    options: [
      { value: 'full', label: 'Piena' },
      { value: 'transparent', label: 'Trasparente' },
    ],
    value: choice.transparent ? 'transparent' : 'full',
    onChange: (v) => pick('transparent')(v === 'transparent'),
  });
  const invert = checkboxField({ label: 'Inverti carta e inchiostro', checked: choice.invert, onChange: pick('invert') });
  const scale = segmented({
    label: 'Scala (×1 = 96 px per pollice)',
    options: PNG_SCALES.map((k) => ({ value: String(k), label: scaleLabel(k) })),
    value: String(choice.scale),
    onChange: (v) => pick('scale')(Number(v)),
  });
  const edges = segmented({
    label: 'Bordi',
    options: [
      { value: 'smooth', label: 'Anti-alias' },
      { value: 'hard', label: 'Alias' },
    ],
    value: choice.aliased ? 'hard' : 'smooth',
    onChange: (v) => pick('aliased')(v === 'hard'),
  });
  const pngGroup = h('div', { class: 'stack' }, scale.field, edges.field);
  const pageReadout = h('p', { class: 'readout' });
  const file = h('p', { class: 'readout' });
  const download = h('button', { type: 'button', class: 'primary' }, 'Scarica');
  const note = h('p', { class: 'hint' }, 'Testo in tracciati, colori esatti in RGB. Guide, griglie e pad non vengono esportati.');

  const dialog = h(
    'div',
    { class: 'dialog export', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': 'export-title' },
    h('div', { class: 'dialog-head' }, title, close),
    h(
      'div',
      { class: 'export-grid' },
      h('div', { class: 'stack' }, format.field, pageField.field, marks.field, paper.field, invert.field, pngGroup),
      h('div', { class: 'stack' }, colors.field, customRow, sameColors, colorsReadout, pageReadout, file),
    ),
    h('div', { class: 'export-foot' }, download, note),
  );
  root.append(dialog);

  const setupNow = () => exportSetup(recipe, choice, currentColors());

  function refresh() {
    if (!recipe) return;
    pageField.field.querySelector('[data-value="bleed"]').textContent = `Con bleed (${mm(recipe.bleed)} mm)`;
    marks.field.hidden = choice.page !== 'bleed';
    customRow.hidden = choice.colors !== 'custom';
    for (const [key, sw] of [['carta', carta], ['inchiostro', inchiostro]]) {
      sw.input.value = choice.custom[key];
      sw.hex.textContent = choice.custom[key].toUpperCase();
    }
    pngGroup.hidden = choice.format !== 'png';
    const setup = setupNow();
    const { carta: c, inchiostro: i } = setup.recipe.colors;
    const same = c.toLowerCase() === i.toLowerCase();
    sameColors.hidden = !same;
    download.disabled = same;
    colorsReadout.textContent = `Carta ${c.toUpperCase()} · Inchiostro ${i.toUpperCase()}`;
    const px = pngSize(setup, choice.scale);
    pageReadout.textContent = `Pagina ${mm(setup.width)} × ${mm(setup.height)} mm${choice.format === 'png' ? ` · ${px.width} × ${px.height} px` : ''}`;
    file.textContent = `File ${exportFileName(recipe, choice.format, figures)}`;
  }

  download.addEventListener('click', async () => {
    const name = exportFileName(recipe, choice.format, figures);
    download.disabled = true;
    download.textContent = 'Preparazione…';
    try {
      const setup = setupNow();
      const blob =
        choice.format === 'pdf'
          ? await exportPdf(setup, assets)
          : choice.format === 'png'
            ? await exportPng(setup, assets, { scale: choice.scale, aliased: choice.aliased })
            : exportSvg(setup, assets);
      downloadBlob(blob, name);
      showStatus(`Esportato ${name}`);
      hide();
    } catch (err) {
      console.warn(err);
      showStatus('Esportazione non riuscita');
    } finally {
      download.textContent = 'Scarica';
      refresh();
    }
  });

  function show(r) {
    recipe = r;
    opener = document.activeElement;
    // Custom colours start from the current ones, until changed.
    if (!choice.custom) choice.custom = { ...currentColors() };
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
