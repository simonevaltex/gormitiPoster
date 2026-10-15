import { it, expect } from 'vitest';
import { screenPaint, exportPaint } from '../src/paint.js';

it('screen paint uses the two-colour classes only', () => {
  const a = screenPaint({ fill: 'ink', stroke: 'paper', width: 2, join: 'round' });
  expect(a).toContain('class="fi sp"');
  expect(a).toContain('stroke-width="2"');
  expect(a).toContain('stroke-linejoin="round"');
  expect(a).not.toContain('#');
  expect(screenPaint({ fill: 'none', stroke: 'ink', width: 1 })).toContain('class="fn si"');
});

it('export paint writes the exact hex values', () => {
  const paint = exportPaint({ carta: '#808080', inchiostro: '#ff6600' });
  expect(paint({ fill: 'ink' })).toBe('fill="#ff6600"');
  expect(paint({ fill: 'paper', stroke: 'ink', width: 0.8, cap: 'round' })).toBe(
    'fill="#808080" stroke="#ff6600" stroke-width="0.8" stroke-linecap="round"',
  );
  expect(paint({ fill: 'none', stroke: 'paper', width: 1 })).not.toContain('class');
});
