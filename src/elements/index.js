import popolo from './popolo.js';
import stemma from './stemma.js';
import gormita from './gormita.js';
import testo from './testo.js';
import numero from './numero.js';
import { polygonCentroid } from '../geometry.js';

// Every builder returns { markup, collisionPolygon, bounds } in the same local coordinates, so
// phase 2 only needs to swap the source of the markup and outline.
export const ELEMENT_TYPES = { popolo, stemma, gormita, testo, numero };

export const defaultParams = () =>
  Object.fromEntries(Object.entries(ELEMENT_TYPES).map(([key, t]) => [key, structuredClone(t.defaults)]));

export const validateParams = (type, params) => ELEMENT_TYPES[type].validate?.(params) ?? null;

// ctx = { fonts, paint, posterNumber }. centre is where Matter puts the body's position.
export function buildElement(type, params, ctx) {
  const built = ELEMENT_TYPES[type].build(params, ctx);
  return { ...built, centre: polygonCentroid(built.collisionPolygon) };
}
