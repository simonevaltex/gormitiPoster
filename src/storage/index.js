// The archive only talks to this adapter. Today it is IndexedDB in this browser (local.js); when
// the project moves to Vercel with a database, an api.js with the same four async methods
// (list, get, save, remove — see README) replaces it and the archive works on every device.
export { localAdapter as storage } from './local.js';
