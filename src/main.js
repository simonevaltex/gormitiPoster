import './ui/style.css';
import { loadFonts } from './fonts.js';
import { loadAssets, chooseFigure, figureConflict } from './figures.js';
import { popoloById } from './popoli.js';
import { createStore } from './state.js';
import { createPhysics } from './physics.js';
import { createModel } from './model.js';
import { createSheetView } from './sheet-view.js';
import { bindSheetTools } from './attractors.js';
import { createPanels, createSheetInfo, MESSAGES } from './ui/panels.js';
import { spawnBounds } from './pad.js';
import { createHeader, loadStoredColors } from './ui/header.js';
import { createArchive } from './archive.js';
import { createExportDialog } from './ui/export-dialog.js';
import { showStatus } from './ui/status.js';
import { isTyping } from './ui/dom.js';
import { STEP_MS } from './constants.js';

// Without the fonts nothing can be drawn: say so on the loading screen instead of waiting forever.
const loading = document.getElementById('loading');
const [fonts, { figures, stemmi, numero, popoli }] = await Promise.all([
  loadFonts((file) =>
    fetch(`${import.meta.env.BASE_URL}fonts/${file}`).then((r) => {
      if (!r.ok) throw new Error(`Font mancante: ${file}`);
      return r.arrayBuffer();
    }),
  ),
  // Simone's figures, crests, popoli words and Numero badge, listed in assets/manifest.json (see scripts/assets-manifest.mjs).
  loadAssets((path) =>
    fetch(`${import.meta.env.BASE_URL}assets/${path.split('/').map(encodeURIComponent).join('/')}`).then((r) => {
      if (!r.ok) throw new Error(`${r.status}`);
      return r.text();
    }),
  ),
]).catch((err) => {
  loading.textContent = 'Caricamento non riuscito. Ricarica la pagina.';
  throw err;
});

const store = createStore();
const s = store.state;
s.colors = loadStoredColors(s.colors);
// Genera starts on the first of Simone's figures, with its Nome, Alias and popolo, when there is one.
if (figures.size) chooseFigure(s.genera.params, figures.values().next().value);
const physics = createPhysics();
const model = createModel({ store, physics, fonts, figures, stemmi, numero, popoli });

const zoomLabel = document.getElementById('zoom');
const view = createSheetView(document.getElementById('sheet'), store, {
  onZoom: (percent) => (zoomLabel.textContent = `${percent.toLocaleString('it-IT', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`),
});
document.getElementById('fit').addEventListener('click', () => view.fit());
// A click on the sheet generates there what the Genera button would, starting from that point
// (the pad follows); off the pad's range, nothing happens.
const tools = bindSheetTools(view, store, model, {
  onEmptyClick: ({ x, y }) => {
    const r = spawnBounds(s.bleed);
    if (x < r.x0 || x > r.x0 + r.w || y < r.y0 || y > r.y0 + r.h) return;
    s.spawn.x = Math.round(x * 10) / 10;
    s.spawn.y = Math.round(y * 10) / 10;
    store.emit('spawn');
    const result = model.generate();
    if (!result.ok) showStatus(MESSAGES[result.reason], 4000);
  },
});
createPanels({ root: document.getElementById('panel'), store, model, tools, figures });
createSheetInfo({ root: document.getElementById('sheet-info'), store, model });

const exportDialog = createExportDialog({
  root: document.getElementById('export-modal'),
  fonts,
  figures,
  stemmi,
  numero,
  popoli,
  currentColors: () => s.colors,
});
// The current sheet exports with the number it has (or will get) in the archive.
const currentRecipe = () =>
  model.toRecipe({ id: s.poster.id ?? 'foglio', number: model.displayNumber(), date: new Date().toISOString() });

const archive = createArchive({
  store,
  model,
  fonts,
  figures,
  stemmi,
  numero,
  popoli,
  root: document.getElementById('archive'),
  tabs: { crea: document.getElementById('tab-crea'), archive: document.getElementById('open-archive') },
  onExport: (recipe) => recipe && exportDialog.show(recipe),
});

// Save and export need every element type on the sheet; otherwise say what is missing.
function complete(action) {
  const missing = model.missingTypes();
  if (missing.length) {
    showStatus(`Per ${action} mancano: ${missing.join(', ')}`, 6000);
    return false;
  }
  // The Gormita's popolo, Nome and Alias (gormiti/nomi.json) rule the other blocks.
  const conflict = figureConflict(s.elements, figures);
  if (conflict) {
    const { figure, field, value } = conflict;
    if (field === 'popolo') {
      const { name, article } = popoloById(value);
      showStatus(`${figure} è del Popolo ${article}${article.endsWith('’') ? '' : ' '}${name}: Popolo e Stemma devono essere di quel popolo`, 6000);
    } else {
      showStatus(`Con ${figure} ${field === 'nome' ? 'il Nome' : 'l’Alias'} è «${value.replace(/\n/g, ' ')}»: rigenera quel blocco`, 6000);
    }
    return false;
  }
  return true;
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
// The shared archive answers over the network: the sheet doesn't wait for it, the Numero badges
// update when the list arrives.
archive.refresh();

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

loading.remove();

if (import.meta.env.DEV) window.__gormiti = { store, physics, model, view, figures, stemmi, numero, popoli, ready: true };
