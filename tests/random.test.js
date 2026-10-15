import { it, expect } from 'vitest';
import { hashString, mulberry32 } from '../src/random.js';

it('same seed gives the same sequence, different seeds differ', () => {
  const a = mulberry32(hashString('Sommo'));
  const b = mulberry32(hashString('Sommo'));
  const c = mulberry32(hashString('Sommi'));
  const sa = [a(), a(), a()];
  expect([b(), b(), b()]).toEqual(sa);
  expect([c(), c(), c()]).not.toEqual(sa);
  expect(sa.every((v) => v >= 0 && v < 1)).toBe(true);
});

it('hashString returns an unsigned 32-bit integer', () => {
  const h = hashString('Gormita');
  expect(Number.isInteger(h)).toBe(true);
  expect(h).toBeGreaterThanOrEqual(0);
  expect(h).toBeLessThan(2 ** 32);
  expect(hashString('')).toBe(hashString(''));
});
