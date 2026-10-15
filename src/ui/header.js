// Header: the two colour pickers (remembered in localStorage) and the main actions.
const STORAGE_KEY = 'gormiti.colors';
const KEYS = ['carta', 'inchiostro'];
const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v);

export function loadStoredColors(fallback) {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (isHex(stored?.carta) && isHex(stored?.inchiostro) && stored.carta.toLowerCase() !== stored.inchiostro.toLowerCase()) {
      return { carta: stored.carta.toLowerCase(), inchiostro: stored.inchiostro.toLowerCase() };
    }
  } catch {
    // storage unavailable or corrupted: keep the defaults
  }
  return fallback;
}

export function createHeader({ store, onSave, onToggleArchive, onExport }) {
  const s = store.state;
  const inputs = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(k)]));
  const outputs = Object.fromEntries(KEYS.map((k) => [k, document.getElementById(`${k}-hex`)]));
  const warning = document.getElementById('color-warning');
  let warningTimer = 0;

  // Applies the palette everywhere: every colour on the site derives from these two variables.
  function apply() {
    for (const k of KEYS) {
      document.documentElement.style.setProperty(`--${k}`, s.colors[k]);
      inputs[k].value = s.colors[k];
      outputs[k].textContent = s.colors[k].toUpperCase();
    }
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(s.colors));
    } catch {
      // private mode: the palette just won't be remembered
    }
  }

  for (const k of KEYS) {
    const other = k === 'carta' ? 'inchiostro' : 'carta';
    inputs[k].addEventListener('input', () => {
      const value = inputs[k].value.toLowerCase();
      if (value === s.colors[other].toLowerCase()) {
        inputs[k].value = s.colors[k]; // restore the previous value
        warning.hidden = false;
        clearTimeout(warningTimer);
        warningTimer = setTimeout(() => (warning.hidden = true), 4000);
        return;
      }
      warning.hidden = true;
      s.colors[k] = value;
      apply();
      store.emit('colors');
    });
  }

  document.getElementById('save').addEventListener('click', onSave);
  document.getElementById('open-archive').addEventListener('click', onToggleArchive);
  document.getElementById('open-export').addEventListener('click', onExport);

  store.subscribe((topic) => {
    if (topic === 'load') apply(); // a reopened poster brings its own colours
  });
  apply();
  return { apply };
}
