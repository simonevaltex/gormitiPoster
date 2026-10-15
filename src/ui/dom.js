// Minimal element builder. Text children become text nodes, so user input is never parsed as HTML.
export function h(tag, props = {}, ...children) {
  const el = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'class') el.className = value;
    else if (key === 'dataset') Object.assign(el.dataset, value);
    else if (key.startsWith('on') && typeof value === 'function') el.addEventListener(key.slice(2), value);
    else if (key === 'value' || key === 'checked') el[key] = value;
    else el.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat()) {
    if (child == null || child === false) continue;
    el.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return el;
}

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

// True when a keyboard event targets a text field (shortcuts must not steal its keys).
export const isTyping = (e) => {
  const t = e.target;
  return t instanceof HTMLElement && (t.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(t.tagName));
};

// Number input with label and unit. onChange gets a clamped number (ignored while invalid).
// With `stepper`, two small arrow buttons step the value up and down.
export function numberField({ label, unit, value, min, max, step = 1, stepper = false, onChange }) {
  const input = h('input', { type: 'number', value: String(value), min, max, step, inputmode: 'decimal' });
  input.addEventListener('input', () => {
    const v = parseFloat(input.value);
    if (Number.isFinite(v)) onChange(clamp(v, min ?? -Infinity, max ?? Infinity));
  });
  input.addEventListener('change', () => {
    const v = parseFloat(input.value);
    input.value = String(Number.isFinite(v) ? clamp(v, min ?? -Infinity, max ?? Infinity) : value);
  });
  const stepButton = (dir, name) =>
    h('button', {
      type: 'button',
      class: `step step-${dir}`,
      tabindex: '-1',
      'aria-label': name,
      onclick: () => {
        if (dir === 'up') input.stepUp();
        else input.stepDown();
        input.dispatchEvent(new Event('input'));
        input.dispatchEvent(new Event('change'));
      },
    });
  const control = stepper
    ? h('span', { class: 'stepper' }, input, h('span', { class: 'step-buttons' }, stepButton('up', `${label} +`), stepButton('down', `${label} −`)))
    : input;
  const field = h('label', { class: 'field' }, h('span', { class: 'label' }, label, unit ? ` (${unit})` : ''), control);
  return { field, input, set: (v) => document.activeElement !== input && (input.value = String(v)) };
}

// Segmented control: buttons with role="radio"; the active one is inverted.
export function segmented({ label, options, value, onChange, compact = false }) {
  const buttons = options.map((o) =>
    h('button', { type: 'button', role: 'radio', 'aria-checked': String(o.value === value), dataset: { value: o.value } }, o.label),
  );
  const group = h('div', { class: compact ? 'segmented compact' : 'segmented', role: 'radiogroup', 'aria-label': label }, buttons);
  const set = (v) => buttons.forEach((b) => b.setAttribute('aria-checked', String(b.dataset.value === v)));
  group.addEventListener('click', (e) => {
    const b = e.target.closest('button[role="radio"]');
    if (!b) return;
    set(b.dataset.value);
    onChange(b.dataset.value);
  });
  const field = h('div', { class: 'field' }, label ? h('span', { class: 'label' }, label) : null, group);
  return { field, set };
}

export function selectField({ label, options, value, onChange }) {
  const select = h(
    'select',
    { onchange: () => onChange(select.value) },
    options.map((o) => h('option', { value: o.value, selected: o.value === value }, o.label)),
  );
  const field = h('label', { class: 'field' }, h('span', { class: 'label' }, label), h('span', { class: 'select' }, select));
  return { field, set: (v) => (select.value = v) };
}

export function checkboxField({ label, checked, onChange }) {
  const input = h('input', { type: 'checkbox', checked, onchange: () => onChange(input.checked) });
  const field = h('label', { class: 'field check' }, input, h('span', { class: 'label' }, label));
  return { field, set: (v) => (input.checked = v) };
}

// Range + number kept in sync. Double-clicking the slider puts it back to `reset` (by default the
// value it was created with).
export function rangeField({ label, unit, value, min, max, step = 1, reset = value, onChange }) {
  const range = h('input', { type: 'range', min, max, step, value: String(value), 'aria-label': label });
  const number = h('input', { type: 'number', min, max, step, value: String(value), 'aria-label': `${label} (valore)` });
  const emit = (v) => {
    if (!Number.isFinite(v)) return;
    const c = clamp(v, min, max);
    range.value = String(c);
    if (document.activeElement !== number) number.value = String(c);
    onChange(c);
  };
  range.addEventListener('input', () => emit(parseFloat(range.value)));
  range.addEventListener('dblclick', () => emit(reset));
  number.addEventListener('input', () => emit(parseFloat(number.value)));
  number.addEventListener('change', () => (number.value = range.value));
  const field = h(
    'div',
    { class: 'field' },
    h('span', { class: 'label' }, label, unit ? ` (${unit})` : ''),
    h('div', { class: 'range-row' }, range, number),
  );
  return {
    field,
    set: (v) => {
      range.value = String(v);
      if (document.activeElement !== number) number.value = String(v);
    },
  };
}
