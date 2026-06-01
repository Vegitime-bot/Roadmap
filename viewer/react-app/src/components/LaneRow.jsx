import { LANE_HEADER_W } from '../utils/constants';
import { fmtShort } from '../utils/dates';
import { resolveMilestoneStyle } from '../utils/milestones';
import { MilestoneIcon } from './MilestoneLayer';

/**
 * One lane. Renders background tint, left-side label box, and any range
 * bars. Detailed milestone points are drawn by `LaneMilestoneStrip` for
 * both single- and multi-row lanes (it doesn't need to know about
 * rows — it just plots every milestone with the lane's id).
 *
 * Multi-row vs single-row only affects how range bars are sourced:
 *   - single: one bar per `briefPairs` entry, using lane-scoped briefs.
 *   - multi:  one bar per row × per pair, using each row's own briefs.
 *
 * In both cases the bars are pooled into a single list and rendered on
 * the lane's track. `RangeBarStack` auto-stacks bars vertically when
 * they overlap in time.
 *
 * No visual distinction is made between bars from different rows; the
 * row identity travels with the bar's selection payload so that the
 * detail panel can show "from row S6ABBCC" etc. on click.
 */
export function LaneRow({
  lane, layout, top, fullW, dateToX,
  selected, onSelect,
  briefPairs,
  briefMilestonesByLane,
  briefMilestonesByRow,
  detailedMilestones,
  detailedMilestonesByRow,
  definitions,
  onHover,
  hoveredOwner, onHoverOwner,
  editMode, onBarDragStart,
  onMilestoneDragStart,
  isDragTarget,
}) {
  const bars = computeAllBars(lane, briefPairs, briefMilestonesByLane, briefMilestonesByRow, dateToX);

  return (
    <>
      {/* background tint */}
      <rect
        x={0} y={top}
        width={fullW} height={layout.totalH}
        fill={lane.bg}
        opacity={0.55}
      />

      {/* Drop-zone highlight when dragging a bar vertically onto this lane */}
      {isDragTarget && (
        <rect
          x={LANE_HEADER_W + 6} y={top + 3}
          width={fullW - LANE_HEADER_W - 10} height={layout.totalH - 6}
          rx={4}
          fill="#eff6ff" fillOpacity={0.6}
          stroke="#3b82f6" strokeWidth={2} strokeDasharray="6 3"
          style={{ pointerEvents: 'none' }}
        />
      )}

      {/* range bars + milestones */}
      {bars.length > 0 && (
        <RangeBarStack
          bars={bars}
          top={top}
          selected={selected}
          onSelect={onSelect}
          lane={lane}
          hoveredOwner={hoveredOwner}
          onHoverOwner={onHoverOwner}
          detailedMilestones={detailedMilestones}
          detailedMilestonesByRow={detailedMilestonesByRow}
          definitions={definitions}
          dateToX={dateToX}
          onHover={onHover}
          editMode={editMode}
          onBarDragStart={onBarDragStart}
          onMilestoneDragStart={onMilestoneDragStart}
        />
      )}
    </>
  );
}

/**
 * The left-side colored label box. Rendered separately from LaneRow so
 * it can be placed in a sticky `<g>` that translates with horizontal
 * scroll, keeping the lane header pinned to the left edge.
 */
export function LaneLabel({ lane, layout, top, selected, onSelect, onHoverOwner, editMode, onAddRow }) {
  const labelBoxX = 6;
  const labelBoxY = top + 6;
  const labelBoxW = LANE_HEADER_W - 4;
  const labelBoxH = layout.totalH - 12;
  const hasComment = Boolean(lane.comment);
  const labelCY = hasComment ? top + labelBoxH / 2 - 6 : top + layout.totalH / 2;
  const commentCY = labelCY + 16;
  const plusCX = labelBoxX + labelBoxW - 9;
  const plusCY = labelBoxY + labelBoxH - 9;
  return (
    <g>
      <g
        className="cursor-pointer"
        onClick={() => onSelect({ kind: 'lane', data: lane })}
        onMouseEnter={() => onHoverOwner?.({ kind: 'lane', id: lane.id, laneId: lane.id })}
        onMouseLeave={() => onHoverOwner?.(null)}
      >
        <rect
          x={labelBoxX} y={labelBoxY}
          width={labelBoxW} height={labelBoxH}
          rx={5} fill={lane.color}
        />
        <text
          x={labelBoxX + labelBoxW / 2} y={labelCY}
          textAnchor="middle" dominantBaseline="middle"
          fill="white" fontSize={13} fontWeight={600}
          letterSpacing="0.02em"
        >
          {lane.label}
        </text>
        {hasComment && (
          <text
            x={labelBoxX + labelBoxW / 2} y={commentCY}
            textAnchor="middle" dominantBaseline="middle"
            fill="white" fontSize={9} opacity={0.85}
          >
            {lane.comment.length > 14 ? lane.comment.slice(0, 13) + '…' : lane.comment}
          </text>
        )}
      </g>

      {/* Add-row button: small "+" badge in bottom-right corner, edit mode only */}
      {editMode && (
        <g
          className="cursor-pointer"
          onClick={(e) => { e.stopPropagation(); onAddRow?.(lane.id); }}
        >
          <circle cx={plusCX} cy={plusCY} r={7} fill="white" opacity={0.92} />
          <text
            x={plusCX} y={plusCY}
            textAnchor="middle" dominantBaseline="middle"
            fontSize={13} fontWeight={800} fill={lane.color}
            style={{ pointerEvents: 'none' }}
          >
            +
          </text>
        </g>
      )}
    </g>
  );
}

/* ---------------- range bar collection ---------------- */

function computeAllBars(lane, briefPairs, briefMilestonesByLane, briefMilestonesByRow, dateToX) {
  if (!briefPairs || briefPairs.length === 0) return [];
  const bars = [];

  if (Array.isArray(lane.rows) && lane.rows.length > 0) {
    // Multi-row: each row contributes its own bar per applicable pair.
    for (const row of lane.rows) {
      const rowBriefs = briefMilestonesByRow?.[row.id] || [];
      for (const pair of briefPairs) {
        const bar = buildBar(pair, rowBriefs, dateToX, lane.color);
        if (bar) {
          bars.push({
            ...bar,
            ownerKey: row.id,
            rowLabel: row.label,
            rowId: row.id,
            row,
          });
        }
      }
    }
  } else {
    // Single-row: one bar per pair, lane-scoped.
    const laneBriefs = briefMilestonesByLane?.[lane.id] || [];
    for (const pair of briefPairs) {
      const bar = buildBar(pair, laneBriefs, dateToX, lane.color);
      if (bar) bars.push({ ...bar, ownerKey: lane.id });
    }
  }
  return bars;
}

function buildBar(pair, briefs, dateToX, laneColor) {
  const fromMs = briefs.find(m => m.definitionId === pair.fromDefinitionId);
  const toMs   = briefs.find(m => m.definitionId === pair.toDefinitionId);
  if (!fromMs || !toMs) return null;
  const xStart = dateToX(fromMs.date);
  const xEnd   = dateToX(toMs.date);
  if (xEnd <= xStart) return null;
  return {
    pairId: pair.id || `${pair.fromDefinitionId}-${pair.toDefinitionId}`,
    fromDefinitionId: pair.fromDefinitionId,
    toDefinitionId: pair.toDefinitionId,
    x: xStart,
    w: xEnd - xStart,
    label: pair.label || '',
    color: pair.color || laneColor,
    fromDate: fromMs.date,
    toDate: toMs.date,
  };
}

/* ---------------- vertical packing for overlapping bars ---------------- */

function packBarsVertically(bars) {
  const indexed = bars.map((b, i) => ({ ...b, _i: i }));
  indexed.sort((a, b) => a.x - b.x);
  const ends = [];
  const assign = new Array(bars.length);
  for (const b of indexed) {
    let placed = false;
    for (let i = 0; i < ends.length; i++) {
      if (ends[i] + 4 <= b.x) {
        ends[i] = b.x + b.w;
        assign[b._i] = i;
        placed = true;
        break;
      }
    }
    if (!placed) {
      ends.push(b.x + b.w);
      assign[b._i] = ends.length - 1;
    }
  }
  return { assign, sublanes: ends.length };
}

const BAR_H = 18;
const BAR_GAP = 3;
const MS_ROW_H = 32; // height per owner's milestone row (icon + label + date)

function RangeBarStack({
  bars, top, selected, onSelect, lane, hoveredOwner, onHoverOwner,
  detailedMilestones, detailedMilestonesByRow, definitions, dateToX, onHover,
  editMode, onBarDragStart, onMilestoneDragStart,
}) {
  const { assign, sublanes } = packBarsVertically(bars);
  const startY = top + 6;

  // Collect unique owners in first-appearance order, with their milestone lists
  const seen = new Set();
  const ownerRows = [];
  for (const bar of bars) {
    if (seen.has(bar.ownerKey)) continue;
    seen.add(bar.ownerKey);
    const msList = (bar.rowId
      ? (detailedMilestonesByRow?.[bar.rowId] || [])
      : (detailedMilestones || [])
    ).filter(ms => resolveMilestoneStyle(ms, definitions).tier !== 'brief');
    if (msList.length > 0) ownerRows.push({ ownerKey: bar.ownerKey, msList });
  }

  const barSectionH = sublanes * (BAR_H + BAR_GAP);
  const msSectionTop = startY + barSectionH + (ownerRows.length > 0 ? 6 : 0);

  return (
    <g>
      {/* Range bars */}
      {bars.map((bar, i) => {
        const idx = assign[i];
        const barY = startY + idx * (BAR_H + BAR_GAP);
        const isSelected = selected?.kind === 'briefRange'
          && selected?.data.ownerKey === bar.ownerKey
          && selected?.data.pairId === bar.pairId;
        const ownerMatch = hoveredOwner && (
          hoveredOwner.id === bar.ownerKey ||
          (hoveredOwner.kind === 'lane' && hoveredOwner.id === lane.id)
        );
        const isDimmed = hoveredOwner && !ownerMatch;
        const isHighlighted = Boolean(ownerMatch);
        return (
          <RangeBar
            key={`${bar.ownerKey}-${bar.pairId}`}
            bar={bar} y={barY} h={BAR_H}
            isSelected={isSelected}
            isDimmed={isDimmed}
            isHighlighted={isHighlighted}
            editMode={editMode}
            onDragStart={(e, type) => onBarDragStart?.(e, type, bar, lane.id)}
            onMouseEnter={() => onHoverOwner?.({
              kind: bar.rowId ? 'row' : 'lane',
              id: bar.ownerKey,
              laneId: lane.id,
            })}
            onMouseLeave={() => onHoverOwner?.(null)}
            onClick={() => onSelect({
              kind: 'briefRange',
              data: {
                ownerKey: bar.ownerKey,
                pairId: bar.pairId,
                label: bar.label,
                fromDate: bar.fromDate,
                toDate: bar.toDate,
                rowId: bar.rowId,
                rowLabel: bar.rowLabel,
                laneId: lane.id,
                barSvgX: bar.x,
                barSvgY: barY,
                barSvgW: bar.w,
              },
              row: bar.row,
              lane,
            })}
          />
        );
      })}

      {/* Milestone section: one horizontal row per unique owner, in first-appearance order */}
      {ownerRows.map(({ ownerKey, msList }, rowIndex) => {
        const rowY = msSectionTop + rowIndex * MS_ROW_H;
        const iconY = rowY + 6;
        const labelY = iconY + 9;
        const dateY = labelY + 12;
        const ownerMatch = hoveredOwner && (
          hoveredOwner.id === ownerKey ||
          (hoveredOwner.kind === 'lane' && hoveredOwner.id === lane.id)
        );
        const isDimmed = hoveredOwner && !ownerMatch;
        const isHighlighted = Boolean(ownerMatch);
        return (
          <g key={ownerKey} opacity={isDimmed ? 0.3 : 1}>
            {msList.map(ms => {
              const style = resolveMilestoneStyle(ms, definitions);
              const displayName = ms.name || style.label || 'Milestone';
              const x = dateToX(ms.date);
              const isMsSelected = selected?.kind === 'milestone' && selected?.data.id === ms.id;
              return (
                <g
                  key={ms.id}
                  className="cursor-pointer"
                  style={{ cursor: editMode ? 'ew-resize' : 'pointer' }}
                  onClick={() => onSelect({ kind: 'milestone', data: ms, style, lane })}
                  onMouseDown={editMode ? (e) => onMilestoneDragStart?.(e, ms) : undefined}
                  onMouseEnter={() => onHover?.({ x, y: iconY - 8, label: `${displayName} · ${fmtShort(ms.date)}` })}
                  onMouseLeave={() => onHover?.(null)}
                >
                  <MilestoneIcon
                    icon={style.icon}
                    x={x} y={iconY}
                    color={style.color}
                    isSelected={isMsSelected || isHighlighted}
                  />
                  <text
                    x={x} y={labelY}
                    textAnchor="middle" dominantBaseline="hanging"
                    fontSize={10.5} fontWeight={isMsSelected || isHighlighted ? 800 : 700}
                    fill="#1e293b" style={{ pointerEvents: 'none' }}
                  >
                    {displayName}
                  </text>
                  <text
                    x={x} y={dateY}
                    textAnchor="middle" dominantBaseline="hanging"
                    fontSize={9.5} fill="#64748b"
                    style={{ pointerEvents: 'none' }}
                  >
                    {fmtShort(ms.date)}
                  </text>
                </g>
              );
            })}
          </g>
        );
      })}
    </g>
  );
}

const DRAG_HANDLE_W = 8; // px width of resize handle hit area

function RangeBar({ bar, y, h, isSelected, isDimmed, isHighlighted, onClick, onMouseEnter, onMouseLeave, editMode, onDragStart }) {
  const minLabelW = 40;
  const minDateW = 100;
  const labelText = bar.rowLabel || bar.label || '';
  const fillOpacity = isDimmed ? 0.25 : (isHighlighted ? 1.0 : 0.85);
  const ringStroke = isSelected ? '#1e293b' : (isHighlighted ? bar.color : null);
  const ringWidth = isSelected ? 2 : (isHighlighted ? 2 : 0);
  const hasHandles = editMode && bar.w > DRAG_HANDLE_W * 2;

  return (
    <g
      className={editMode ? undefined : 'cursor-pointer'}
      onClick={onClick}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      <rect x={bar.x} y={y} width={bar.w} height={h} rx={3} fill={bar.color} opacity={fillOpacity} />
      {ringStroke && (
        <rect x={bar.x - 2} y={y - 2} width={bar.w + 4} height={h + 4} rx={5}
          fill="none" stroke={ringStroke} strokeWidth={ringWidth} />
      )}
      {/* Edit mode: dashed outline */}
      {editMode && (
        <rect x={bar.x} y={y} width={bar.w} height={h} rx={3}
          fill="none" stroke="white" strokeWidth={1} strokeDasharray="4 3" opacity={0.7}
          style={{ pointerEvents: 'none' }}
        />
      )}
      {bar.w > minLabelW && labelText && (
        <text
          x={bar.x + bar.w / 2} y={y + h / 2}
          textAnchor="middle" dominantBaseline="middle"
          fontSize={Math.min(11, h - 4)}
          fontWeight={600} fill="white"
          opacity={isDimmed ? 0.6 : 1}
          style={{ pointerEvents: 'none' }}
        >
          {labelText}
        </text>
      )}
      {bar.w > minDateW && !isDimmed && (
        <>
          <text x={bar.x + 3} y={y - 3} fontSize={9} fill="#475569" style={{ pointerEvents: 'none' }}>
            {fmtShort(bar.fromDate)}
          </text>
          <text x={bar.x + bar.w - 3} y={y - 3} textAnchor="end" fontSize={9} fill="#475569" style={{ pointerEvents: 'none' }}>
            {fmtShort(bar.toDate)}
          </text>
        </>
      )}

      {/* Drag handles (edit mode only): left resize | center move | right resize */}
      {hasHandles && (
        <>
          <rect
            x={bar.x} y={y} width={DRAG_HANDLE_W} height={h} rx={2}
            fill="white" opacity={0.25} style={{ cursor: 'ew-resize' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDragStart(e, 'resize-left'); }}
          />
          <rect
            x={bar.x + DRAG_HANDLE_W} y={y}
            width={bar.w - DRAG_HANDLE_W * 2} height={h}
            fill="transparent" style={{ cursor: 'grab' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDragStart(e, 'move'); }}
          />
          <rect
            x={bar.x + bar.w - DRAG_HANDLE_W} y={y} width={DRAG_HANDLE_W} height={h} rx={2}
            fill="white" opacity={0.25} style={{ cursor: 'ew-resize' }}
            onMouseDown={(e) => { e.stopPropagation(); e.preventDefault(); onDragStart(e, 'resize-right'); }}
          />
        </>
      )}
    </g>
  );
}
