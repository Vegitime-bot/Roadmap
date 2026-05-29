// Small SVG primitives used by milestones and the legend.
// They take an (x, y) center and render at a fixed scale.

export function Star({ x, y, color, selected }) {
  const r = 8;
  const points = [];
  for (let i = 0; i < 10; i++) {
    const angle = (i * Math.PI) / 5 - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r / 2.3;
    points.push(`${x + Math.cos(angle) * radius},${y + Math.sin(angle) * radius}`);
  }
  return (
    <polygon
      points={points.join(' ')}
      fill={color}
      stroke={selected ? '#1e293b' : 'none'}
      strokeWidth={selected ? 1.5 : 0}
    />
  );
}

export function Diamond({ x, y, color, selected }) {
  const r = 7;
  return (
    <polygon
      points={`${x},${y - r} ${x + r},${y} ${x},${y + r} ${x - r},${y}`}
      fill={color}
      stroke={selected ? '#1e293b' : 'none'}
      strokeWidth={selected ? 1.5 : 0}
    />
  );
}

/** Truncate text to fit within `maxWidth` at the given font size. */
export function Clip({ text, maxWidth, fontSize }) {
  const approxCharW = fontSize * 0.55;
  const maxChars = Math.max(3, Math.floor(maxWidth / approxCharW));
  if (text.length <= maxChars) return text;
  return text.slice(0, maxChars - 1) + '…';
}
