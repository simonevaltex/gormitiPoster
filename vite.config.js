import { assetsManifest } from './scripts/assets-manifest.mjs';

export default {
  plugins: [assetsManifest()],
  test: {
    include: ['tests/**/*.test.js'],
  },
};
