import { DEFAULTS, DEFAULT_SETTINGS } from './constants.js';
import { defaultParams } from './elements/index.js';

// The single application state. Live poses live in the physics world; everything else is here.
export function initialState() {
  return {
    colors: { carta: DEFAULTS.carta, inchiostro: DEFAULTS.inchiostro },
    bleed: DEFAULTS.bleed,
    settings: { ...DEFAULT_SETTINGS },
    attractors: [],
    elements: [], // { id, type, params, built, before }
    seq: 0, // shared counter for element and attractor ids
    tool: 'select', // 'select' | 'point' | 'segment'
    selectedId: null,
    spawn: { ...DEFAULTS.spawn },
    genera: { type: 'testo', params: defaultParams() },
    poster: { id: null, number: null }, // archive identity of the sheet, once saved or reopened
    archive: { items: [], nextNumber: 1 },
  };
}

// Tiny pub/sub: modules mutate state, then emit a topic so views can refresh.
export function createStore(initial = initialState()) {
  const listeners = new Set();
  return {
    state: initial,
    emit(topic) {
      for (const fn of listeners) fn(topic);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}
