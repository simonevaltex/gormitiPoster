// Short status line over the sheet (in-page; never alert()).
let timer = 0;

export function showStatus(text, ms = 3500) {
  const el = document.getElementById('status');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => (el.hidden = true), ms);
}
