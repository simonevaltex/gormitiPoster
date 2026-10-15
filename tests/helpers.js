import { readFileSync } from 'node:fs';
import { loadFonts } from '../src/fonts.js';

export const loadFontsFromDisk = () =>
  loadFonts((file) => {
    const b = readFileSync(new URL(`../public/fonts/${file}`, import.meta.url));
    return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength);
  });
