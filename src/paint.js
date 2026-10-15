// Element markup never hardcodes colours: builders describe paint as { fill, stroke } using
// 'ink' (inchiostro), 'paper' (carta) or 'none', and one of these helpers turns it into attributes.
// On screen: CSS classes bound to --carta/--inchiostro, so a colour change repaints everything.
// In exports: the exact hex values chosen.

const CLASS = { ink: 'i', paper: 'p', none: 'n' };
const KEY = { ink: 'inchiostro', paper: 'carta' };
const num = (v) => String(+(+v).toFixed(3));

function strokeAttrs({ stroke = 'none', width, join, cap }) {
  if (stroke === 'none') return '';
  let s = '';
  if (width !== undefined) s += ` stroke-width="${num(width)}"`;
  if (join) s += ` stroke-linejoin="${join}"`;
  if (cap) s += ` stroke-linecap="${cap}"`;
  return s;
}

export function screenPaint(spec) {
  const { fill = 'none', stroke = 'none' } = spec;
  const cls = `f${CLASS[fill]}${stroke === 'none' ? '' : ` s${CLASS[stroke]}`}`;
  return `class="${cls}"${strokeAttrs(spec)}`;
}

export function exportPaint(colors) {
  const color = (c) => (c === 'none' ? 'none' : colors[KEY[c]]);
  return (spec) => {
    const { fill = 'none', stroke = 'none' } = spec;
    const strokeColor = stroke === 'none' ? '' : ` stroke="${color(stroke)}"`;
    return `fill="${color(fill)}"${strokeColor}${strokeAttrs(spec)}`;
  };
}
