// The archive only talks to this adapter: the shared archive of the site's API (api.js), the same
// on every device. The posters saved before it, in this browser's IndexedDB (local.js), can be
// copied into it from the Archivio tab.
export { apiAdapter as storage } from './api.js';
export { localAdapter as browserStorage } from './local.js';
