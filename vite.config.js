import { assetsManifest } from './scripts/assets-manifest.mjs';
import { postersApi } from './scripts/api-dev.mjs';

export default {
  plugins: [assetsManifest(), postersApi()],
  build: {
    // The bundled code has hashed names and is cached for good (vercel.json); public/assets holds
    // Simone's artwork, whose names don't change when the files do, so the two stay apart.
    assetsDir: '_app',
    // pdf-lib and jsPDF are loaded only when exporting.
    chunkSizeWarningLimit: 600,
  },
  test: {
    include: ['tests/**/*.test.js'],
  },
};
