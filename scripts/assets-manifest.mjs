// The list of Simone's artwork in public/assets, for the browser (which can't list a folder).
// In development it is served live at /assets/manifest.json, so a new SVG shows up on reload;
// the build writes the same file into dist. Nothing to edit by hand: drop the SVG in the folder.
import { readdirSync } from 'node:fs';
import { join } from 'node:path';

// "sommoLuminescente.svg", "sommo-luminescente.svg", "Sommo Luminescente.svg" → "Sommo Luminescente".
export function figureName(file) {
  return file
    .replace(/\.svg$/i, '')
    .replace(/([\p{Ll}\d])(\p{Lu})/gu, '$1 $2')
    .split(/[\s_-]+/)
    .filter(Boolean)
    .map((word) => word[0].toLocaleUpperCase('it') + word.slice(1))
    .join(' ');
}

function svgFiles(dir) {
  try {
    return readdirSync(dir).filter((f) => /\.svg$/i.test(f) && !f.startsWith('.'));
  } catch {
    return [];
  }
}

// The id is the file name: recipes store it, so renaming a file loses it in saved posters.
export function scanAssets(assetsDir) {
  const gormiti = svgFiles(join(assetsDir, 'gormiti'))
    .map((file) => ({ id: file.replace(/\.svg$/i, ''), name: figureName(file), file: `gormiti/${file}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'it'));
  return { gormiti };
}

export function assetsManifest() {
  let dir;
  return {
    name: 'gormiti-assets-manifest',
    configResolved(config) {
      dir = join(config.publicDir, 'assets');
    },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url.split('?')[0] !== `${server.config.base}assets/manifest.json`) return next();
        res.setHeader('Content-Type', 'application/json');
        res.setHeader('Cache-Control', 'no-store');
        res.end(JSON.stringify(scanAssets(dir)));
      });
    },
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'assets/manifest.json', source: `${JSON.stringify(scanAssets(dir), null, 2)}\n` });
    },
  };
}
