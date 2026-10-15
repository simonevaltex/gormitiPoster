import { h } from './dom.js';

// A button that asks for confirmation in the page itself (the browser's confirm() is never used).
export function confirmButton({ label, question, confirmLabel = 'Sì', cancelLabel = 'No', onConfirm }) {
  const button = h('button', { type: 'button' }, label);
  const yes = h('button', { type: 'button', class: 'primary' }, confirmLabel);
  const no = h('button', { type: 'button' }, cancelLabel);
  const box = h('div', { class: 'confirm', role: 'group', 'aria-label': question, hidden: true }, h('span', { class: 'label' }, question), yes, no);
  const close = () => {
    box.hidden = true;
    button.hidden = false;
    button.focus();
  };
  button.addEventListener('click', () => {
    button.hidden = true;
    box.hidden = false;
    no.focus();
  });
  yes.addEventListener('click', () => {
    close();
    onConfirm();
  });
  no.addEventListener('click', close);
  box.addEventListener('keydown', (e) => e.key === 'Escape' && close());
  return { element: h('span', { class: 'confirm-wrap' }, button, box), button };
}
