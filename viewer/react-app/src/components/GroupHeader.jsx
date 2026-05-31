import { GROUP_HEADER_H, SUPER_GROUP_HEADER_H, LANE_HEADER_W } from '../utils/constants';

/**
 * SVG-rendered header bar for a lane group (lv2) or super-group (lv1).
 *
 * Two visual variants:
 *   - level 'super'  (lv1) — taller, darker fill, larger label
 *   - level 'group'  (lv2) — original lane-group style
 *
 * Clicking toggles collapse via `onToggle`. Collapsing a super-group
 * folds all its lv2 groups (and their lanes) into one row.
 */
export function GroupHeader({ item, fullW, onToggle, scrollLeft = 0 }) {
  const { group, top, collapsed, level } = item;
  const isSuper = level === 'super';
  const h = isSuper ? SUPER_GROUP_HEADER_H : GROUP_HEADER_H;
  const color = group.color || '#1e293b';

  // Chevron and label always appear just past the sticky lane-header column
  const baseX = scrollLeft + LANE_HEADER_W + 10;
  const cx = baseX + (isSuper ? 6 : 5);
  const cy = top + h / 2;
  const chevron = collapsed
    ? `M ${cx - 3} ${cy - 4} L ${cx + 3} ${cy} L ${cx - 3} ${cy + 4}`
    : `M ${cx - 4} ${cy - 2} L ${cx} ${cy + 3} L ${cx + 4} ${cy - 2}`;

  const bgOpacity = isSuper ? 0.14 : 0.06;
  const labelFontSize = isSuper ? 14 : 12;
  const labelX = baseX + 18;
  const descX = labelX + (isSuper ? group.label.length * 9 : group.label.length * 7.5) + 12;
  const labelLetterSpacing = isSuper ? '0.08em' : '0.05em';

  const summary = formatSummary(item);

  return (
    <g className="cursor-pointer" onClick={onToggle}>
      <rect x={0} y={top} width={fullW} height={h} fill={color} opacity={bgOpacity} />
      <line x1={0} y1={top} x2={fullW} y2={top} stroke={color} opacity={isSuper ? 0.45 : 0.25} strokeWidth={isSuper ? 1.5 : 1} />
      <line x1={0} y1={top + h} x2={fullW} y2={top + h} stroke={color} opacity={isSuper ? 0.45 : 0.25} strokeWidth={isSuper ? 1.5 : 1} />
      <path
        d={chevron}
        stroke={color}
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
      <text
        x={labelX}
        y={top + h / 2 + 1}
        dominantBaseline="middle"
        fontSize={labelFontSize}
        fontWeight={isSuper ? 800 : 700}
        fill={color}
        letterSpacing={labelLetterSpacing}
      >
        {group.label.toUpperCase()}
      </text>
      {group.description && (
        <text
          x={descX}
          y={top + h / 2 + 1}
          dominantBaseline="middle"
          fontSize={11}
          fill={color}
          opacity={0.55}
        >
          {group.description}
        </text>
      )}
      <text
        x={fullW - 16}
        y={top + h / 2 + 1}
        textAnchor="end"
        dominantBaseline="middle"
        fontSize={10.5}
        fill={color}
        opacity={0.65}
        fontWeight={500}
      >
        {summary}{collapsed ? ' (collapsed)' : ''}
      </text>
    </g>
  );
}

function formatSummary(item) {
  if (item.level === 'super') {
    const { groupCount, laneCount, msCount } = item;
    return `${groupCount} group${groupCount > 1 ? 's' : ''} · ${laneCount} lane${laneCount > 1 ? 's' : ''} · ${msCount} milestone${msCount > 1 ? 's' : ''}`;
  }
  const { laneCount, msCount } = item;
  return `${laneCount} lane${laneCount > 1 ? 's' : ''} · ${msCount} milestone${msCount > 1 ? 's' : ''}`;
}
