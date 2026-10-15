// Archive storage in this browser (IndexedDB). Same interface as the future api.js:
// list(), get(id), save(recipe), remove(id), all async.
const DB_NAME = 'gormiti-poster';
const STORE = 'posters';
let dbPromise = null;

function openDb() {
  dbPromise ??= new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE, { keyPath: 'id' });
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const req = fn(tx.objectStore(STORE));
    tx.oncomplete = () => resolve(req.result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

// The list carries everything the archive panel shows, but not the heavy recipe parts.
const summary = ({ attractors, elements, ...rest }) => rest;

export const localAdapter = {
  async list() {
    const all = await run('readonly', (store) => store.getAll());
    return all.map(summary).sort((a, b) => b.number - a.number);
  },
  async get(id) {
    return (await run('readonly', (store) => store.get(id))) ?? null;
  },
  async save(recipe) {
    await run('readwrite', (store) => store.put(recipe));
    return recipe;
  },
  async remove(id) {
    await run('readwrite', (store) => store.delete(id));
  },
};
