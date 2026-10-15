import { it, expect } from 'vitest';
import { fmt } from '../src/svg.js';

it('fmt rounds to 3 decimals and drops trailing zeros', () => {
  expect(fmt(1.23456)).toBe('1.235');
  expect(fmt(2)).toBe('2');
  expect(fmt(-0.00001)).toBe('0');
  expect(fmt(10.5)).toBe('10.5');
});
