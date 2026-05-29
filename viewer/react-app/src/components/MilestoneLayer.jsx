import { Star, Diamond } from './shapes';
import { resolveMilestoneStyle } from '../utils/milestones';
import { fmtShort } from '../utils/dates';

/**
 * Global milestone strip — rendered in the top area for milestones that
 * don't have a `laneId`. Mostly legacy/fallback.
 */
export function GlobalMilestoneStrip({
  milestones, definitions, milestoneAreaH, dateToX,
  selected, onSelect, onHover,
}) {
  return milestones.map((ms, i) => {
    const style = resolveMilestoneStyle(ms, definitions);
    // Brief milestones never render as points.
    if (style.tier === 'brief') return null;
    const displayName = ms.name || style.label || 'Milestone';
    const x = dateToX(ms.date);
    const stagger = (i % 3) * 22;
    const labelY = 16 + stagger;
    const isSelected = selected?.kind === 'milestone' && selected?.data.id === ms.id;
    return (
      <g
        key={ms.id}
        className="cursor-pointer"
        onClick={() => onSelect({ kind: 'milestone', data: ms, style })}
        onMouseEnter={() => onHover({ x, y: labelY - 10, label: `${displayName} · ${fmtShort(ms.date)}` })}
        onMouseLeave={() => onHover(null)}
      >
        <line
          x1={x} y1={labelY + 22}
          x2={x} y2={milestoneAreaH}
          stroke={style.color} strokeWidth={1.5}
          opacity={0.7}
        />
        <text x={x} y={labelY} textAnchor="middle" fontSize={11} fontWeight={700} fill="#1e293b">
          {displayName}
        </text>
        <text x={x} y={labelY + 13} textAnchor="middle" fontSize={10} fill="#64748b">
          {fmtShort(ms.date)}
        </text>
        <MilestoneIcon
          icon={style.icon}
          x={x}
          y={milestoneAreaH + 3}
          color={style.color}
          isSelected={isSelected}
        />
      </g>
    );
  });
}

/**
 * Per-lane detailed-milestone points. Brief milestones are NOT rendered
 * here — they're represented by the range bar in `LaneRow` when the
 * recipe defines a `briefPair`. So this layer filters them out.
 *
 * The milestone row is vertically centered within the lane.
 */
export function LaneMilestoneStrip({
  lane, layout, top, milestones, definitions,
  dateToX, selected, onSelect, onHover,
  hoveredOwner,
}) {
  const detailedOnly = milestones.filter(ms => {
    const style = resolveMilestoneStyle(ms, definitions);
    return style.tier !== 'brief';
  });
  if (detailedOnly.length === 0) return null;

  // Place milestone points in the lower half of the lane.
  // The upper portion is reserved for range bars (rendered by LaneRow).
  // This produces the desired interleaved layout: bar line above,
  // milestone line below.
  const iconY = top + Math.round(layout.totalH * 0.65);

  return (
    <g>
      {detailedOnly.map((ms, i) => {
        const style = resolveMilestoneStyle(ms, definitions);
        const displayName = ms.name || style.label || 'Milestone';
        const x = dateToX(ms.date);
        const labelY = iconY + 14 + (i % 2) * 14;
        const dateY  = labelY + 11;
        const isSelected = selected?.kind === 'milestone' && selected?.data.id === ms.id;
        // Hover matching: highlight when the hovered owner matches this
        // milestone's row (or lane). Dim when some OTHER owner is hovered.
        const ownerMatch = hoveredOwner && (
          (ms.rowId && hoveredOwner.id === ms.rowId) ||
          (hoveredOwner.kind === 'lane' && hoveredOwner.id === lane.id)
        );
        const isDimmed = hoveredOwner && !ownerMatch;
        const isHighlighted = Boolean(ownerMatch);
        const opacity = isDimmed ? 0.3 : 1;

        return (
          <g
            key={ms.id}
            className="cursor-pointer"
            onClick={() => onSelect({ kind: 'milestone', data: ms, style, lane })}
            onMouseEnter={() => onHover({ x, y: iconY - 6, label: `${displayName} · ${fmtShort(ms.date)}` })}
            onMouseLeave={() => onHover(null)}
            opacity={opacity}
          >
            <MilestoneIcon
              icon={style.icon}
              x={x} y={iconY}
              color={style.color}
              isSelected={isSelected || isHighlighted}
            />
            <text
              x={x} y={labelY}
              textAnchor="middle"
              fontSize={10.5}
              fontWeight={isHighlighted ? 800 : 700}
              fill="#1e293b"
            >
              {displayName}
            </text>
            <text
              x={x} y={dateY}
              textAnchor="middle"
              fontSize={9.5}
              fill="#64748b"
            >
              {fmtShort(ms.date)}
            </text>
          </g>
        );
      })}
    </g>
  );
}

/** Single milestone icon dispatcher. */
function MilestoneIcon({ icon, x, y, color, isSelected }) {
  if (icon === 'star') return <Star x={x} y={y} color={color} selected={isSelected} />;
  if (icon === 'diamond') return <Diamond x={x} y={y} color={color} selected={isSelected} />;
  if (icon === 'circle') {
    return (
      <circle
        cx={x} cy={y} r={6}
        fill={color}
        stroke={isSelected ? '#1e293b' : 'none'}
        strokeWidth={isSelected ? 2 : 0}
      />
    );
  }
  return (
    <polygon
      points={`${x - 6},${y - 5} ${x + 6},${y - 5} ${x},${y + 5}`}
      fill={color}
      stroke={isSelected ? '#1e293b' : 'none'}
      strokeWidth={isSelected ? 2 : 0}
    />
  );
}
