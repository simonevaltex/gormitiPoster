// Left column: Foglio, Gravità, Genera, Impostazioni.
import { h, rangeField, segmented } from './dom.js';

const mm = (v) => v.toFixed(1);
export const section = (title, ...children) =>
  h('section', { class: 'section' }, h('h2', { class: 'section-title label' }, title), ...children);

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
  const readout = h('p', { class: 'readout mono' });
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

export function createPanels({ root, store, model, tools }) {
  root.append(gravitySection({ store, model, tools }));
}
