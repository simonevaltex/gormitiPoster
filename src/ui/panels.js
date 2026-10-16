// Left column: the start pad (with the attractors), then the Gravità and Genera sections, which
// open and close. The sheet readout with the bleed sits over the stage, bottom left.
import { A3, DEFAULTS, DEFAULT_SETTINGS } from '../constants.js';
import { POPOLI } from '../popoli.js';
import { createPad } from '../pad.js';
import { ELEMENT_TYPES } from '../elements/index.js';
import { chooseFigure } from '../figures.js';
import { randomPoint, randomSegment } from '../attractors.js';
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

let sectionSeq = 0;

// A section whose title is a button that opens and closes its body.
export function section(title, ...children) {
  const bodyId = `section-body-${++sectionSeq}`;
  const body = h('div', { class: 'section-body', id: bodyId }, ...children);
  const toggle = h(
    'button',
    { type: 'button', class: 'section-toggle', 'aria-expanded': 'true', 'aria-controls': bodyId, 'aria-label': `Sezione ${title}` },
    h('span', { class: 'section-title' }, title),
    h('span', { class: 'chevron', 'aria-hidden': 'true' }),
  );
  toggle.addEventListener('click', () => {
    const open = toggle.getAttribute('aria-expanded') !== 'true';
    toggle.setAttribute('aria-expanded', String(open));
    body.hidden = !open;
  });
  return h('section', { class: 'section' }, h('h2', { class: 'section-head' }, toggle), body);
}

// Bottom left of the stage: fixed A3 format, bleed, working sheet size.
export function createSheetInfo({ root, store, model }) {
  const s = store.state;
  const size = h('p', { class: 'readout' });
  const bleed = numberField({ label: 'Bleed', unit: 'mm', value: s.bleed, min: 0, max: 20, step: 0.5, stepper: true, onChange: (v) => model.setBleed(v) });
  const refresh = () => {
    bleed.set(s.bleed);
    size.textContent = `Foglio di lavoro ${mm(A3.width + 2 * s.bleed).replace('.', ',')} × ${mm(A3.height + 2 * s.bleed).replace('.', ',')} mm`;
  };
  store.subscribe((t) => (t === 'bleed' || t === 'load') && refresh());
  refresh();
  root.append(h('p', { class: 'readout' }, `Formato A3 · ${A3.width} × ${A3.height} mm`), bleed.field, size);
}

function gravitySection({ store, model, tools }) {
  const s = store.state;
  const addPoint = h('button', { type: 'button', onclick: () => tools.add(randomPoint()) }, 'Punto');
  const addLine = h('button', { type: 'button', onclick: () => tools.add(randomSegment()) }, 'Linea');
  const readout = h('p', { class: 'readout' });
  const strength = rangeField({
    label: 'Forza',
    value: DEFAULTS.strength,
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
  const selected = h('div', { class: 'stack selected' }, readout, strength.field, h('div', { class: 'row' }, remove, h('span', { class: 'hint' }, 'oppure tasto Canc')));

  const restitution = rangeField({ label: 'Rimbalzo', value: s.settings.restitution, reset: DEFAULT_SETTINGS.restitution, min: 0, max: 1, step: 0.01, onChange: (v) => model.setSettings({ restitution: v }) });
  const friction = rangeField({ label: 'Attrito', value: s.settings.friction, reset: DEFAULT_SETTINGS.friction, min: 0, max: 1, step: 0.01, onChange: (v) => model.setSettings({ friction: v }) });
  const solid = checkboxField({
    label: 'Attrattori solidi',
    checked: s.settings.solidAttractors,
    onChange: (v) => model.setSettings({ solidAttractors: v }),
  });

  function refresh() {
    const a = s.attractors.find((x) => x.id === s.selectedId);
    selected.hidden = !a;
    if (!a) return;
    readout.textContent =
      a.type === 'point'
        ? `Punto · ${mm(a.x)}, ${mm(a.y)} mm`
        : `Linea · ${mm(a.x1)}, ${mm(a.y1)} → ${mm(a.x2)}, ${mm(a.y2)} mm · ${mm(Math.hypot(a.x2 - a.x1, a.y2 - a.y1))} mm`;
    strength.set(a.strength);
  }
  store.subscribe((t) => {
    if (['selection', 'attractors', 'load'].includes(t)) refresh();
    if (t !== 'load') return;
    restitution.set(s.settings.restitution);
    friction.set(s.settings.friction);
    solid.set(s.settings.solidAttractors);
  });
  refresh();
  return section('Gravità', h('div', { class: 'segmented' }, addPoint, addLine), selected, restitution.field, friction.field, solid.field);
}

// Fields of each element type; every change writes straight into state.genera.params[type].
function typeFields(type, store, model, figures) {
  const p = store.state.genera.params[type];
  const set = (key) => (v) => (p[key] = v);
  // The chosen Gormita figure fixes the popolo of Popolo and Stemma (see chooseFigure).
  const popoloField = () => {
    const field = selectField({ label: 'Popolo', options: popoloOptions, value: p.popolo, onChange: set('popolo') });
    const hint = h('p', { class: 'hint' });
    const refresh = () => {
      const figure = figures.get(store.state.genera.params.gormita.figure);
      field.set(p.popolo);
      field.select.disabled = Boolean(figure?.popolo);
      hint.hidden = !figure?.popolo;
      hint.textContent = figure?.popolo ? `Fissato da ${figure.name}` : '';
    };
    store.subscribe((t) => t === 'genera' && refresh());
    refresh();
    return [field.field, hint];
  };
  switch (type) {
    case 'popolo':
      return [
        ...popoloField(),
        rangeField({ label: 'Altezza', unit: 'mm', value: p.height, min: 10, max: 300, step: 0.5, onChange: set('height') }).field,
      ];
    case 'stemma':
      return [
        ...popoloField(),
        rangeField({ label: 'Diametro', unit: 'mm', value: p.diameter, min: 5, max: 297, step: 0.5, onChange: set('diameter') }).field,
      ];
    case 'gormita': {
      const name = h('input', { type: 'text', value: p.name, maxlength: 60, autocomplete: 'off', spellcheck: 'false' });
      name.addEventListener('input', () => (p.name = name.value));
      const nameField = h('label', { class: 'field' }, h('span', { class: 'label' }, 'Nome (la stessa parola dà la stessa forma)'), name);
      const showName = () => (nameField.hidden = Boolean(p.figure));
      showName();
      // Simone's figures (public/assets/gormiti), then the placeholder generated from a name.
      const options = [...figures.values()].map((f) => ({ value: f.id, label: f.name }));
      const figure = selectField({
        label: 'Figura',
        options: [...options, { value: '', label: 'Segnaposto (dal nome)' }],
        value: p.figure,
        onChange: (v) => {
          chooseFigure(store.state.genera.params, figures.get(v));
          showName();
          store.emit('genera'); // Nome, Alias and the popolo now follow the figure, and lock
        },
      });
      return [
        ...(options.length ? [figure.field] : []),
        nameField,
        rangeField({ label: 'Larghezza', unit: 'mm', value: p.width, min: 20, max: 600, step: 1, onChange: set('width') }).field,
      ];
    }
    case 'nome':
    case 'testo': {
      const label = type === 'nome' ? 'Nome' : 'Alias';
      const text = h('textarea', { rows: 3, value: p.text, autocomplete: 'off', spellcheck: 'false', 'aria-label': label });
      text.addEventListener('input', () => (p.text = text.value));
      // The chosen Gormita figure fixes the text (see chooseFigure): it can't be edited then.
      const hint = h('p', { class: 'hint' });
      const refresh = () => {
        const figure = figures.get(store.state.genera.params.gormita.figure);
        const fixed = figure?.[type === 'nome' ? 'nome' : 'alias'];
        text.value = p.text;
        text.readOnly = Boolean(fixed);
        hint.hidden = !fixed;
        hint.textContent = fixed ? `Fissato da ${figure.name}` : '';
      };
      store.subscribe((t) => t === 'genera' && refresh());
      refresh();
      return [
        h('label', { class: 'field' }, text),
        hint,
        rangeField({ label: 'Altezza maiuscole', unit: 'mm', value: p.capHeight, min: 3, max: 300, step: 0.5, onChange: set('capHeight') }).field,
      ];
    }
    case 'numero': {
      const readout = h('p', { class: 'readout' });
      const refresh = () => (readout.textContent = `Numero ${pad3(model.displayNumber())} · assegnato in automatico`);
      store.subscribe((t) => ['archive', 'poster', 'load'].includes(t) && refresh());
      refresh();
      return [rangeField({ label: 'Diametro', unit: 'mm', value: p.diameter, min: 10, max: 200, step: 0.5, onChange: set('diameter') }).field, readout];
    }
    default:
      return [];
  }
}

function generaSection({ store, model, figures }) {
  const s = store.state;
  const groups = Object.fromEntries(
    Object.keys(ELEMENT_TYPES).map((type) => [type, h('div', { class: 'stack' }, typeFields(type, store, model, figures))]),
  );
  const type = segmented({
    label: 'Tipo',
    options: Object.entries(ELEMENT_TYPES).map(([value, t]) => ({ value, label: t.label })),
    value: s.genera.type,
    compact: true,
    onChange: (v) => {
      s.genera.type = v;
      showType();
    },
  });
  const showType = () => Object.entries(groups).forEach(([k, g]) => (g.hidden = k !== s.genera.type));
  const message = h('p', { class: 'message', role: 'alert', hidden: true });
  const generate = h('button', { type: 'button', class: 'primary' }, 'Genera');
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
  }
  store.subscribe((t) => ['attractors', 'elements', 'load'].includes(t) && refresh());
  refresh();
  showType();

  return section(
    'Genera',
    type.field,
    ...Object.values(groups),
    h('div', { class: 'actions' }, generate, clear.element),
    message,
  );
}

export function createPanels({ root, store, model, tools, figures = new Map() }) {
  const pad = createPad({ store, model, select: tools.select });
  root.append(
    h('div', { class: 'pad-block' }, pad.element),
    gravitySection({ store, model, tools }),
    generaSection({ store, model, figures }),
  );
}
