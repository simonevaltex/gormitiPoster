// Left column: Foglio, Gravità, Genera, Impostazioni.
import { A3 } from '../constants.js';
import { POPOLI } from '../popoli.js';
import { createPad } from '../pad.js';
import { h, numberField, rangeField, segmented, selectField, checkboxField } from './dom.js';
import { confirmButton } from './inline-confirm.js';

const mm = (v) => v.toFixed(1);
const pad3 = (n) => String(n).padStart(3, '0');
const popoloOptions = POPOLI.map((p) => ({ value: p.id, label: p.name }));

export const MESSAGES = {
  'no-attractors': 'Metti almeno un punto o un segmento di gravità',
  'empty-text': 'Scrivi un testo',
  'empty-name': 'Scrivi il nome del Gormita',
};

export const section = (title, ...children) =>
  h('section', { class: 'section' }, h('h2', { class: 'section-title label' }, title), ...children);

function sheetSection({ store, model }) {
  const s = store.state;
  const size = h('p', { class: 'readout' });
  const bleed = numberField({ label: 'Bleed', unit: 'mm', value: s.bleed, min: 0, max: 20, step: 0.5, onChange: (v) => model.setBleed(v) });
  const refresh = () => {
    bleed.set(s.bleed);
    size.textContent = `Foglio di lavoro ${mm(A3.width + 2 * s.bleed)} × ${mm(A3.height + 2 * s.bleed)} mm`;
  };
  store.subscribe((t) => (t === 'bleed' || t === 'load') && refresh());
  refresh();
  return section('Foglio', h('p', { class: 'readout' }, `Formato A3 · ${A3.width} × ${A3.height} mm`), bleed.field, size);
}

function gravitySection({ store, model, tools }) {
  const s = store.state;
  const tool = segmented({
    label: 'Strumento',
    options: [
      { value: 'select', label: 'Seleziona' },
      { value: 'point', label: '+ Punto' },
      { value: 'segment', label: '+ Segmento' },
    ],
    value: s.tool,
    onChange: (v) => tools.setTool(v),
  });
  const readout = h('p', { class: 'readout' });
  const strength = rangeField({
    label: 'Forza',
    value: 50,
    min: 1,
    max: 100,
    onChange: (v) => s.selectedId && model.updateAttractor(s.selectedId, { strength: Math.round(v) }),
  });
  const remove = h(
    'button',
    {
      type: 'button',
      onclick: () => {
        if (!s.selectedId) return;
        model.removeAttractor(s.selectedId);
        store.emit('selection');
      },
    },
    'Elimina',
  );
  const selected = h('div', { class: 'stack' }, readout, strength.field, h('div', { class: 'row' }, remove, h('span', { class: 'hint' }, 'oppure tasto Canc')));
  const hint = h(
    'p',
    { class: 'hint' },
    'Clicca un attrattore per selezionarlo, trascinalo per spostarlo. Le estremità di un segmento lo allungano o lo ruotano.',
  );

  function refresh() {
    tool.set(s.tool);
    const a = s.attractors.find((x) => x.id === s.selectedId);
    selected.hidden = !a;
    hint.hidden = !!a;
    if (!a) return;
    readout.textContent =
      a.type === 'point'
        ? `Punto · ${mm(a.x)}, ${mm(a.y)} mm`
        : `Segmento · ${mm(a.x1)}, ${mm(a.y1)} → ${mm(a.x2)}, ${mm(a.y2)} mm · ${mm(Math.hypot(a.x2 - a.x1, a.y2 - a.y1))} mm`;
    strength.set(a.strength);
  }
  store.subscribe((t) => ['selection', 'attractors', 'tool', 'load'].includes(t) && refresh());
  refresh();
  return section('Gravità', tool.field, selected, hint);
}

// Fields of each element type; every change writes straight into state.genera.params[type].
function typeFields(type, store, model) {
  const p = store.state.genera.params[type];
  const set = (key) => (v) => (p[key] = v);
  switch (type) {
    case 'popolo':
      return [
        selectField({ label: 'Popolo', options: popoloOptions, value: p.popolo, onChange: set('popolo') }).field,
        numberField({ label: 'Altezza maiuscole', unit: 'mm', value: p.capHeight, min: 3, max: 200, step: 0.5, onChange: set('capHeight') }).field,
      ];
    case 'stemma':
      return [
        selectField({ label: 'Popolo', options: popoloOptions, value: p.popolo, onChange: set('popolo') }).field,
        numberField({ label: 'Diametro', unit: 'mm', value: p.diameter, min: 5, max: 297, step: 0.5, onChange: set('diameter') }).field,
      ];
    case 'gormita': {
      const name = h('input', { type: 'text', value: p.name, maxlength: 60, autocomplete: 'off', spellcheck: 'false' });
      name.addEventListener('input', () => (p.name = name.value));
      return [
        h('label', { class: 'field' }, h('span', { class: 'label' }, 'Nome (la stessa parola dà la stessa forma)'), name),
        numberField({ label: 'Larghezza', unit: 'mm', value: p.width, min: 20, max: 600, step: 1, onChange: set('width') }).field,
      ];
    }
    case 'testo': {
      const text = h('textarea', { rows: 3, value: p.text, autocomplete: 'off', spellcheck: 'false', 'aria-label': 'Testo' });
      text.addEventListener('input', () => (p.text = text.value));
      const fill = segmented({
        label: 'Riempimento',
        options: [
          { value: 'paper', label: 'Carta' },
          { value: 'ink', label: 'Inchiostro' },
        ],
        value: p.fill,
        onChange: set('fill'),
      });
      const stroke = segmented({
        label: 'Contorno',
        options: [
          { value: 'none', label: 'Nessuno' },
          { value: 'paper', label: 'Carta' },
          { value: 'ink', label: 'Inchiostro' },
        ],
        value: p.stroke,
        onChange: set('stroke'),
      });
      const preset = (label, fillValue, strokeValue) =>
        h(
          'button',
          {
            type: 'button',
            onclick: () => {
              p.fill = fillValue;
              p.stroke = strokeValue;
              fill.set(fillValue);
              stroke.set(strokeValue);
            },
          },
          label,
        );
      return [
        h('label', { class: 'field' }, h('span', { class: 'label' }, 'Testo (Invio = nuova riga)'), text),
        segmented({
          label: 'Peso',
          options: [
            { value: 'regular', label: 'Regular' },
            { value: 'medium', label: 'Medium' },
            { value: 'bold', label: 'Bold' },
          ],
          value: p.weight,
          onChange: set('weight'),
        }).field,
        numberField({ label: 'Altezza maiuscole', unit: 'mm', value: p.capHeight, min: 3, max: 300, step: 0.5, onChange: set('capHeight') }).field,
        checkboxField({ label: 'Maiuscolo', checked: p.uppercase, onChange: set('uppercase') }).field,
        h('div', { class: 'field' }, h('span', { class: 'label' }, 'Stile rapido'), h('div', { class: 'row' }, preset('Pieno', 'ink', 'paper'), preset('Contorno', 'paper', 'ink'))),
        fill.field,
        stroke.field,
        numberField({ label: 'Spessore contorno', unit: 'mm', value: p.strokeWidth, min: 0.1, max: 10, step: 0.1, onChange: set('strokeWidth') }).field,
      ];
    }
    case 'numero': {
      const readout = h('p', { class: 'readout' });
      const refresh = () => (readout.textContent = `Numero ${pad3(model.displayNumber())} · assegnato in automatico`);
      store.subscribe((t) => ['archive', 'poster', 'load'].includes(t) && refresh());
      refresh();
      return [numberField({ label: 'Diametro', unit: 'mm', value: p.diameter, min: 10, max: 200, step: 0.5, onChange: set('diameter') }).field, readout];
    }
    default:
      return [];
  }
}

function generaSection({ store, model }) {
  const s = store.state;
  const groups = Object.fromEntries(
    ['popolo', 'stemma', 'gormita', 'testo', 'numero'].map((type) => [type, h('div', { class: 'stack' }, typeFields(type, store, model))]),
  );
  const type = segmented({
    label: 'Tipo',
    options: [
      { value: 'popolo', label: 'Popolo' },
      { value: 'stemma', label: 'Stemma' },
      { value: 'gormita', label: 'Gormita' },
      { value: 'testo', label: 'Testo' },
      { value: 'numero', label: 'Numero' },
    ],
    value: s.genera.type,
    compact: true,
    onChange: (v) => {
      s.genera.type = v;
      showType();
    },
  });
  const showType = () => Object.entries(groups).forEach(([k, g]) => (g.hidden = k !== s.genera.type));
  const pad = createPad({ store });
  const message = h('p', { class: 'message', role: 'alert', hidden: true });
  const generate = h('button', { type: 'button', class: 'primary' }, 'Genera');
  const undo = h('button', { type: 'button', onclick: () => model.undo() }, 'Annulla ultimo');
  const clear = confirmButton({ label: 'Svuota foglio', question: 'Svuotare il foglio?', confirmLabel: 'Sì, svuota', onConfirm: () => model.clear() });

  generate.addEventListener('click', () => {
    const result = model.generate();
    message.hidden = result.ok;
    if (!result.ok) message.textContent = MESSAGES[result.reason];
  });

  function refresh() {
    const noField = s.attractors.length === 0;
    generate.disabled = noField;
    if (noField) {
      message.textContent = MESSAGES['no-attractors'];
      message.hidden = false;
    } else if (message.textContent === MESSAGES['no-attractors']) {
      message.hidden = true;
    }
    undo.disabled = s.elements.length === 0;
  }
  store.subscribe((t) => ['attractors', 'elements', 'load'].includes(t) && refresh());
  refresh();
  showType();

  return section(
    'Genera',
    type.field,
    ...Object.values(groups),
    h('div', { class: 'field' }, h('span', { class: 'label' }, 'Partenza'), pad.element),
    h('div', { class: 'row' }, generate, undo, clear.element),
    message,
  );
}

function settingsSection({ store, model }) {
  const s = store.state;
  const restitution = rangeField({ label: 'Rimbalzo', value: s.settings.restitution, min: 0, max: 1, step: 0.01, onChange: (v) => model.setSettings({ restitution: v }) });
  const friction = rangeField({ label: 'Attrito', value: s.settings.friction, min: 0, max: 1, step: 0.01, onChange: (v) => model.setSettings({ friction: v }) });
  const solid = checkboxField({
    label: 'Attrattori solidi (punti e segmenti)',
    checked: s.settings.solidAttractors,
    onChange: (v) => model.setSettings({ solidAttractors: v }),
  });
  store.subscribe((t) => {
    if (t !== 'load') return;
    restitution.set(s.settings.restitution);
    friction.set(s.settings.friction);
    solid.set(s.settings.solidAttractors);
  });
  return section('Impostazioni', restitution.field, friction.field, solid.field);
}

export function createPanels({ root, store, model, tools }) {
  root.append(
    sheetSection({ store, model }),
    gravitySection({ store, model, tools }),
    generaSection({ store, model }),
    settingsSection({ store, model }),
  );
}
