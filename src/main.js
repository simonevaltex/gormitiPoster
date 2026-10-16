import './ui/style.css';
import { loadFonts } from './fonts.js';
import { loadFigures, chooseFigure } from './figures.js';
import { createStore } from './state.js';
import { createPhysics } from './physics.js';
import { createModel } from './model.js';
import { createSheetView } from './sheet-view.js';
import { bindSheetTools } from './attractors.js';
import { createPanels, createSheetInfo } from './ui/panels.js';
import { createHeader, loadStoredColors } from './ui/header.js';
import { createArchive } from './archive.js';
import { createExportDialog } from './ui/export-dialog.js';
import { showStatus } from './ui/status.js';
import { isTyping } from './ui/dom.js';
import { STEP_MS } from './constants.js';

const [fonts, figures] = await Promise.all([
  loadFonts((file) =>
    fetch(`${import.meta.env.BASE_URL}fonts/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Font mancante: ${file}`);
      return r.arrayBuffer();
    }),
  ),
  // Simone's figures, listed in assets/manifest.json (see scripts/assets-manifest.mjs).
  loadFigures((path) =>
    fetch(`${import.meta.env.BASE_URL}assets/${path.split('/').map(encodeURIComponent).join('/')}`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    }),
  ),
]);

const store = createStore();
const s = store.state;
s.colors = loadStoredColors(s.colors);
// Genera starts on the first of Simone's figures, with its Nome and Alias, when there is one.
if (figures.size) chooseFigure(s.genera.params, figures.values().next().value);
const physics = createPhysics();
const model = createModel({ store, physics, fonts, figures });

const zoomLabel = document.getElementById('zoom');
const view = createSheetView(document.getElementById('sheet'), store, {
  onZoom: (percent) => (zoomLabel.textContent = `${percent.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`),
});
document.getElementById('fit').addEventListener('click', () => view.fit());
const tools = bindSheetTools(view, store, model);
createPanels({ root: document.getElementById('panel'), store, model, tools, figures });
createSheetInfo({ root: document.getElementById('sheet-info'), store, model });

const exportDialog = createExportDialog({ root: document.getElementById('export-modal'), fonts, figures });
// The current sheet exports with the number it has (or will get) in the archive.
const currentRecipe = () =>
  model.toRecipe({ id: s.poster.id ?? 'foglio', number: model.displayNumber(), date: new Date().toISOString() });

const archive = createArchive({
  store,
  model,
  fonts,
  figures,
  root: document.getElementById('archive'),
  tabs: { crea: document.getElementById('tab-crea'), archive: document.getElementById('open-archive') },
  onExport: (recipe) => recipe && exportDialog.show(recipe),
});

// Save and export need every element type on the sheet; otherwise say what is missing.
function complete(action) {
  const missing = model.missingTypes();
  if (missing.length) showStatus(`Per ${action} mancano: ${missing.join(', ')}`, 6000);
  return missing.length === 0;
}

createHeader({
  store,
  onSave: () => complete('salvare') && archive.save(),
  onExport: () => complete('esportare') && exportDialog.show(currentRecipe()),
});

// Elements appear/disappear and jump to their pose whenever the model rebuilds the world.
store.subscribe((topic) => {
  if (topic === 'elements' || topic === 'load') view.syncElements();
  if (topic === 'elements' || topic === 'load' || topic === 'poses') view.updatePoses(physics.poses());
});

model.reset();
await archive.refresh();

// Cmd/Ctrl+Z removes the last block (text fields keep their own undo).
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && !e.shiftKey && e.key.toLowerCase() === 'z' && !isTyping(e)) {
    e.preventDefault();
    model.undo();
  }
});

// Fixed-step loop with an accumulator: the simulation never sees a variable delta.
let last = performance.now();
let acc = 0;
function frame(now) {
  acc += Math.min(now - last, 100);
  last = now;
  if (physics.isSettled()) {
    acc = 0; // nothing moves: don't bank time for a burst later
  } else {
    let steps = 0;
    while (acc >= STEP_MS && steps < 5) {
      physics.step();
      acc -= STEP_MS;
      steps++;
    }
    if (steps === 5) acc = 0;
    if (steps) view.updatePoses(physics.poses());
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

document.getElementById('loading').remove();

if (import.meta.env.DEV) window.__gormiti = { store, physics, model, view, figures, ready: true };
