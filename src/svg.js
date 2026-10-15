// Compact number formatting for SVG attributes: 3 decimals, no trailing zeros, no "-0".
export function fmt(v) {
  const s = String(+v.toFixed(3));
  return s === '-0' ? '0' : s;
}
