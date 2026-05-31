import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

import {
  CHART_W, CHART_LEFT_BASE, LANE_HEADER_W, CHART_RIGHT_PAD,
  GLOBAL_MS_AREA_H, TOP_PAD, MONTH_BAR_H, GROUP_HEADER_H, SUPER_GROUP_HEADER_H,
} from '../utils/constants';
import { parseDate, daysBetween, buildMonths, fmtFullDate, addDays } from '../utils/dates';
import { isBriefMilestone } from '../utils/milestones';
import { computeLaneLayout } from '../utils/layout';

import { useZoom } from '../hooks/useZoom';
import { Toolbar } from './Toolbar';
import { MilestoneLegend } from './MilestoneLegend';
import { GroupHeader } from './GroupHeader';
import { MonthBar } from './MonthBar';
import { LaneRow, LaneLabel } from './LaneRow';
import { GlobalMilestoneStrip } from './MilestoneLayer';
import { DetailPanel } from './DetailPanel';

/**
 * Interactive roadmap chart. Renders a Recipe object as an SVG with
 * lanes, lane groups, milestones (page-shared via `milestoneDefinitions`),
 * and a control toolbar for zooming, filtering, and toggling visibility.
 */
export function Roadmap({ recipe }) {
  // ---------- selection / hover / filters ----------
  const [selected, setSelected] = useState(null);
  const [hovered, setHovered] = useState(null);
  const [hiddenLanes, setHiddenLanes] = useState(new Set());
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());
  const [collapsedSuperGroups, setCollapsedSuperGroups] = useState(new Set());
  const [showMilestones, setShowMilestones] = useState(true);
  const [showToday, setShowToday] = useState(true);
  const [hoveredOwner, setHoveredOwner] = useState(null);

  // ---------- edit mode ----------
  const [editMode, setEditMode] = useState(false);
  // Mutable milestone list; reset when recipe prop changes or edit mode turns off
  const [editMilestones, setEditMilestones] = useState(() => recipe.milestones || []);
  useEffect(() => {
    setEditMilestones(recipe.milestones || []);
    setEditMode(false);
  }, [recipe]);

  // Stable refs for values needed inside drag callbacks without re-creating them
  const dragRef = useRef(null);
  const chartWRef = useRef(0);
  const totalDaysRef = useRef(0);

  const handleBarDragStart = useCallback((e, type, bar, laneId) => {
    e.preventDefault();
    dragRef.current = {
      type,           // 'move' | 'resize-left' | 'resize-right'
      laneId,
      rowId: bar.rowId || null,
      fromDefId: bar.fromDefinitionId,
      toDefId: bar.toDefinitionId,
      startClientX: e.clientX,
      // Snapshot milestones at drag start so delta is always from origin
      originalMilestones: editMilestones.map(ms => ({ ...ms })),
      lastDeltaDays: null,
    };
  }, [editMilestones]);

  const handleDragMove = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;
    const deltaX = e.clientX - dr.startClientX;
    const deltaDays = Math.round(deltaX / chartWRef.current * totalDaysRef.current);
    if (deltaDays === dr.lastDeltaDays) return;
    dr.lastDeltaDays = deltaDays;

    setEditMilestones(
      dr.originalMilestones.map(ms => {
        const forThisOwner = ms.laneId === dr.laneId &&
          (!dr.rowId || ms.rowId === dr.rowId);
        const shouldShift =
          dr.type === 'move' ? forThisOwner :
          dr.type === 'resize-left'  ? forThisOwner && ms.definitionId === dr.fromDefId :
          dr.type === 'resize-right' ? forThisOwner && ms.definitionId === dr.toDefId :
          false;
        return shouldShift ? { ...ms, date: addDays(ms.date, deltaDays) } : ms;
      })
    );
  }, []);

  const handleDragEnd = useCallback(() => { dragRef.current = null; }, []);

  // Attach drag listeners to window so drag works past SVG boundary
  useEffect(() => {
    if (!editMode) return;
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
    return () => {
      window.removeEventListener('mousemove', handleDragMove);
      window.removeEventListener('mouseup', handleDragEnd);
    };
  }, [editMode, handleDragMove, handleDragEnd]);

  // ---------- zoom (state + keyboard + wheel) ----------
  const { zoom, zoomIn, zoomOut, resetZoom, scrollContainerRef } = useZoom(1);

  // ---------- responsive chart width ----------
  // Measure the scroll container so the SVG fills the viewport width.
  // Falls back to CHART_W when the ref isn't ready yet (first render).
  const [containerW, setContainerW] = useState(CHART_W);
  // Track horizontal scroll so we can keep the lane-header column
  // visually pinned to the left edge while the chart body scrolls.
  const [scrollLeft, setScrollLeft] = useState(0);
  useEffect(() => {
    if (!scrollContainerRef.current) return;
    const el = scrollContainerRef.current;
    const update = () => {
      const w = el.clientWidth;
      if (w > 0) setContainerW(w);
    };
    const onScroll = () => setScrollLeft(el.scrollLeft);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    el.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
    };
  }, [scrollContainerRef]);

  // ---------- normalize briefPair / briefPairs to a single array ----------
  // Legacy recipes may have a singular `briefPair`; current spec uses
  // `briefPairs` (array of pairs). Both supported; the array form wins
  // when both are set.
  const briefPairs = useMemo(() => {
    if (Array.isArray(recipe.briefPairs)) return recipe.briefPairs;
    if (recipe.briefPair) return [recipe.briefPair];
    return [];
  }, [recipe.briefPairs, recipe.briefPair]);

  // ---------- milestone partitioning ----------
  // detailedMilestonesByLane: 점으로 표시할 detailed milestones (per lane)
  // briefMilestonesByLane:    range bar 계산용 brief milestones (per lane)
  // *ByRow                   : multi-row 모드에서 row별로도 동일한 분류
  // globalMilestones:         laneId 없는 detailed (legacy fallback)
  //
  // brief milestones는 점으로 표시하지 않는다 (LaneRow의 range bar로만 표현됨).
  const {
    globalMilestones,
    detailedMilestonesByLane, briefMilestonesByLane,
    detailedMilestonesByRow,  briefMilestonesByRow,
  } = useMemo(() => {
    const global = [];
    const detailedByLane = {};
    const briefByLane = {};
    const detailedByRow = {};
    const briefByRow = {};
    for (const ms of editMilestones) {
      const brief = isBriefMilestone(ms, recipe.milestoneDefinitions);
      if (ms.laneId) {
        const targetLane = brief ? briefByLane : detailedByLane;
        if (!targetLane[ms.laneId]) targetLane[ms.laneId] = [];
        targetLane[ms.laneId].push(ms);
        if (ms.rowId) {
          const targetRow = brief ? briefByRow : detailedByRow;
          if (!targetRow[ms.rowId]) targetRow[ms.rowId] = [];
          targetRow[ms.rowId].push(ms);
        }
      } else if (!brief) {
        global.push(ms);
      }
    }
    const sortByDate = (a, b) => parseDate(a.date) - parseDate(b.date);
    for (const id in detailedByLane) detailedByLane[id].sort(sortByDate);
    for (const id in briefByLane)    briefByLane[id].sort(sortByDate);
    for (const id in detailedByRow)  detailedByRow[id].sort(sortByDate);
    for (const id in briefByRow)     briefByRow[id].sort(sortByDate);
    return {
      globalMilestones: global,
      detailedMilestonesByLane: detailedByLane,
      briefMilestonesByLane: briefByLane,
      detailedMilestonesByRow: detailedByRow,
      briefMilestonesByRow: briefByRow,
    };
  }, [editMilestones, recipe.milestoneDefinitions]);

  const milestoneAreaH = globalMilestones.length > 0 ? GLOBAL_MS_AREA_H : TOP_PAD;

  // ---------- visible lanes & layout ----------
  const visibleLanes = useMemo(
    () => recipe.lanes.filter(l => !hiddenLanes.has(l.id)),
    [recipe.lanes, hiddenLanes]
  );

  // Chart left is now constant — lv2 groups render as horizontal header
  // rows (not as a rowspan column).
  const chartLeft = CHART_LEFT_BASE;

  const { layoutItems, totalHeight } = useMemo(() => {
    const items = [];
    let y = milestoneAreaH + MONTH_BAR_H;
    const visibleIds = new Set(visibleLanes.map(l => l.id));

    // --- helpers
    const pushLane = (lane, groupId) => {
      const laneMs = detailedMilestonesByLane[lane.id] || [];
      // Determine the max number of range bars this lane could host.
      // - single-row lane: at most one bar per briefPair (those whose endpoints exist).
      // - multi-row lane: each row contributes its own bars; the lane could
      //   hold rows.length × pairs.length bars in the worst case.
      let maxBarCount;
      if (Array.isArray(lane.rows) && lane.rows.length > 0) {
        // Count applicable bars across all rows.
        let count = 0;
        for (const row of lane.rows) {
          const rowBriefs = briefMilestonesByRow[row.id] || [];
          for (const p of briefPairs) {
            if (rowBriefs.some(m => m.definitionId === p.fromDefinitionId)
              && rowBriefs.some(m => m.definitionId === p.toDefinitionId)) {
              count++;
            }
          }
        }
        maxBarCount = count;
      } else {
        const laneBriefs = briefMilestonesByLane[lane.id] || [];
        maxBarCount = briefPairs.filter(p =>
          laneBriefs.some(m => m.definitionId === p.fromDefinitionId)
          && laneBriefs.some(m => m.definitionId === p.toDefinitionId)
        ).length;
      }
      const layout = computeLaneLayout(lane, laneMs.length, maxBarCount);
      items.push({
        kind: 'lane', lane, layout, top: y, milestones: laneMs, groupId,
      });
      y += layout.totalH;
    };

    const renderGroup = (group) => {
      const groupLaneIds = (group.laneIds || []).filter(id => visibleIds.has(id));
      if (groupLaneIds.length === 0) return false;

      const isCollapsed = collapsedGroups.has(group.id);
      const msCount = groupLaneIds.reduce(
        (n, id) => n + (detailedMilestonesByLane[id]?.length || 0),
        0
      );
      items.push({
        kind: 'group',
        level: 'group',
        group,
        top: y,
        collapsed: isCollapsed,
        laneCount: groupLaneIds.length,
        msCount,
      });
      y += GROUP_HEADER_H;

      if (!isCollapsed) {
        for (const laneId of groupLaneIds) {
          const lane = visibleLanes.find(l => l.id === laneId);
          if (lane) pushLane(lane, group.id);
        }
      }
      return true;
    };

    // --- track lanes already accounted for
    const usedLaneIds = new Set();

    // --- pass 1: super-groups (lv1) — header bar + nested lv2 groups
    if (recipe.laneSuperGroups && recipe.laneSuperGroups.length > 0) {
      for (const sg of recipe.laneSuperGroups) {
        const groupIds = sg.groupIds || [];
        if (groupIds.length === 0) continue;

        // Resolve groupIds: each entry may be either a LaneGroup id (lv2)
        // OR a Lane id directly. The latter happens when a recipe has
        // only one grouping level (lv1 over lanes, no lv2 in between).
        const memberGroups = [];
        const directLaneIds = [];
        for (const gid of groupIds) {
          const lg = (recipe.laneGroups || []).find(g => g.id === gid);
          if (lg) memberGroups.push(lg);
          else if (visibleIds.has(gid)) directLaneIds.push(gid);
        }
        const innerVisibleLaneIds = [
          ...memberGroups.flatMap(g => (g.laneIds || []).filter(id => visibleIds.has(id))),
          ...directLaneIds,
        ];
        if (innerVisibleLaneIds.length === 0) continue;
        innerVisibleLaneIds.forEach(id => usedLaneIds.add(id));

        const isCollapsed = collapsedSuperGroups.has(sg.id);
        const groupCount = memberGroups.length + directLaneIds.length;
        const laneCount = innerVisibleLaneIds.length;
        const msCount = innerVisibleLaneIds.reduce(
          (n, id) => n + (detailedMilestonesByLane[id]?.length || 0),
          0
        );

        items.push({
          kind: 'group',
          level: 'super',
          group: sg,
          top: y,
          collapsed: isCollapsed,
          groupCount,
          laneCount,
          msCount,
        });
        y += SUPER_GROUP_HEADER_H;

        if (!isCollapsed) {
          // Render lv2 groups first, then any direct lanes.
          for (const g of memberGroups) renderGroup(g);
          for (const laneId of directLaneIds) {
            const lane = visibleLanes.find(l => l.id === laneId);
            if (lane) pushLane(lane, null);
          }
        }
      }
    }

    // --- pass 2: lv2 groups not in any super-group
    if (recipe.laneGroups && recipe.laneGroups.length > 0) {
      const referencedGroupIds = new Set(
        (recipe.laneSuperGroups || []).flatMap(sg => sg.groupIds || [])
      );
      for (const group of recipe.laneGroups) {
        if (referencedGroupIds.has(group.id)) continue;
        if (renderGroup(group)) {
          (group.laneIds || []).forEach(id => {
            if (visibleIds.has(id)) usedLaneIds.add(id);
          });
        }
      }
    }

    // --- pass 3: ungrouped lanes (flat)
    const ungrouped = visibleLanes.filter(l => !usedLaneIds.has(l.id));
    for (const lane of ungrouped) pushLane(lane, null);

    return { layoutItems: items, totalHeight: y + 16 };
  }, [
    visibleLanes, recipe.laneGroups, recipe.laneSuperGroups,
    collapsedGroups, collapsedSuperGroups,
    milestoneAreaH, detailedMilestonesByLane,
    briefPairs, briefMilestonesByLane, briefMilestonesByRow,
  ]);

  // ---------- date → x (zoom-scaled width) ----------
  // The chart uses the available container width as the base, so the SVG
  // fills the viewport. Zoom multiplies that base width.
  const effectiveBaseW = Math.max(CHART_W, containerW);
  const baseChartW = effectiveBaseW - chartLeft - CHART_RIGHT_PAD;
  const chartW = baseChartW * zoom;
  const startD = parseDate(recipe.timeRange.start);
  const endD = parseDate(recipe.timeRange.end);
  const totalDays = daysBetween(startD, endD);

  const dateToX = useCallback((dateStr) => {
    const d = parseDate(dateStr);
    const off = daysBetween(startD, d);
    return chartLeft + (off / totalDays) * chartW;
  }, [startD, totalDays, chartW, chartLeft]);

  // Keep stable refs so drag callbacks don't need these as deps
  chartWRef.current = chartW;
  totalDaysRef.current = totalDays;

  const svgWidth = chartLeft + chartW + CHART_RIGHT_PAD;
  const months = useMemo(() => buildMonths(startD, endD), [startD, endD]);

  // ---------- handlers ----------
  const toggleLane = (id) => {
    const s = new Set(hiddenLanes);
    s.has(id) ? s.delete(id) : s.add(id);
    setHiddenLanes(s);
  };
  const toggleGroup = (id) => {
    const s = new Set(collapsedGroups);
    s.has(id) ? s.delete(id) : s.add(id);
    setCollapsedGroups(s);
  };
  const toggleSuperGroup = (id) => {
    const s = new Set(collapsedSuperGroups);
    s.has(id) ? s.delete(id) : s.add(id);
    setCollapsedSuperGroups(s);
  };
  // ---------- render ----------
  return (
    <div className="w-full">
      <div className="mb-5">
        <h1 className="text-2xl font-semibold text-slate-800 tracking-tight">{recipe.title}</h1>
        <p className="text-sm text-slate-500 mt-1">
          {fmtFullDate(recipe.timeRange.start)} — {fmtFullDate(recipe.timeRange.end)}
          {recipe.today && (
            <>
              <span className="mx-2">·</span>
              <span className="inline-flex items-center gap-1">
                <Clock size={12} /> Today: {fmtFullDate(recipe.today)}
              </span>
            </>
          )}
        </p>
      </div>

      <Toolbar
        recipe={recipe}
        hiddenLanes={hiddenLanes} onToggleLane={toggleLane}
        showMilestones={showMilestones} onToggleMilestones={setShowMilestones}
        showToday={showToday} onToggleToday={setShowToday}
        zoom={zoom} onZoomIn={zoomIn} onZoomOut={zoomOut} onZoomReset={resetZoom}
        editMode={editMode} onToggleEditMode={setEditMode}
      />

      <MilestoneLegend
        definitions={recipe.milestoneDefinitions}
      />

      <div
        ref={scrollContainerRef}
        className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-auto"
        style={{ position: 'relative', maxHeight: 'calc(100vh - 280px)' }}
      >
        <svg
          width={svgWidth}
          height={totalHeight}
          viewBox={`0 0 ${svgWidth} ${totalHeight}`}
          className="block"
          style={{ fontFamily: 'system-ui, -apple-system, sans-serif' }}
        >
          {/* Lane backgrounds + labels + group headers */}
          {layoutItems.map(item => {
            if (item.kind === 'group') {
              const onToggle = item.level === 'super'
                ? () => toggleSuperGroup(item.group.id)
                : () => toggleGroup(item.group.id);
              return (
                <GroupHeader
                  key={`g-${item.level}-${item.group.id}`}
                  item={item}
                  fullW={svgWidth}
                  onToggle={onToggle}
                  scrollLeft={scrollLeft}
                />
              );
            }
            return (
              <LaneRow
                key={`lane-${item.lane.id}`}
                lane={item.lane}
                layout={item.layout}
                top={item.top}
                fullW={svgWidth}
                dateToX={dateToX}
                selected={selected}
                onSelect={setSelected}
                briefPairs={briefPairs}
                briefMilestonesByLane={briefMilestonesByLane}
                briefMilestonesByRow={briefMilestonesByRow}
                detailedMilestones={showMilestones ? item.milestones : []}
                detailedMilestonesByRow={detailedMilestonesByRow}
                definitions={recipe.milestoneDefinitions}
                onHover={setHovered}
                hoveredOwner={hoveredOwner}
                onHoverOwner={setHoveredOwner}
                editMode={editMode}
                onBarDragStart={handleBarDragStart}
              />
            );
          })}

          {/* Month bar */}
          <MonthBar
            months={months}
            dateToX={dateToX}
            chartW={chartW}
            totalDays={totalDays}
            chartLeft={chartLeft}
            milestoneAreaH={milestoneAreaH}
          />

          {/* Global milestones (legacy fallback) */}
          {showMilestones && (
            <GlobalMilestoneStrip
              milestones={globalMilestones}
              definitions={recipe.milestoneDefinitions}
              milestoneAreaH={milestoneAreaH}
              dateToX={dateToX}
              selected={selected}
              onSelect={setSelected}
              onHover={setHovered}
            />
          )}


          {/* Today indicator */}
          {showToday && recipe.today && (() => {
            const x = dateToX(recipe.today);
            const lastItem = layoutItems[layoutItems.length - 1];
            const bottom = lastItem
              ? lastItem.top + (lastItem.kind === 'lane' ? lastItem.layout.totalH : GROUP_HEADER_H)
              : milestoneAreaH + MONTH_BAR_H + 100;
            return (
              <g>
                <line
                  x1={x} y1={milestoneAreaH + MONTH_BAR_H}
                  x2={x} y2={bottom}
                  stroke="#dc2626"
                  strokeWidth={1.5}
                  strokeDasharray="4 3"
                  opacity={0.55}
                />
                <polygon
                  points={`${x - 7},${milestoneAreaH + MONTH_BAR_H + 8} ${x + 7},${milestoneAreaH + MONTH_BAR_H + 8} ${x},${milestoneAreaH + MONTH_BAR_H - 1}`}
                  fill="#dc2626"
                />
                <text
                  x={x} y={milestoneAreaH + MONTH_BAR_H + 22}
                  textAnchor="middle"
                  fontSize={10}
                  fontWeight={600}
                  fill="#dc2626"
                >
                  Today
                </text>
              </g>
            );
          })()}

          {/* Sticky lane header column: translates with horizontal scroll
              so it stays pinned to the left edge of the visible viewport.
              Drawn LAST among lane-area content so it overlays the chart
              body cleanly; the white background rect hides anything that
              would otherwise scroll behind it. */}
          <g transform={`translate(${scrollLeft}, 0)`}>
            {/* opaque backdrop for the header column */}
            <rect
              x={0}
              y={milestoneAreaH + MONTH_BAR_H}
              width={LANE_HEADER_W + 4}
              height={totalHeight - (milestoneAreaH + MONTH_BAR_H)}
              fill="white"
            />
            {/* subtle right edge so the header reads as a pinned column */}
            <line
              x1={LANE_HEADER_W + 4}
              y1={milestoneAreaH + MONTH_BAR_H}
              x2={LANE_HEADER_W + 4}
              y2={totalHeight}
              stroke="#e2e8f0"
              strokeWidth={1}
            />
            {layoutItems.map(item => {
              if (item.kind !== 'lane') return null;
              return (
                <LaneLabel
                  key={`lbl-${item.lane.id}`}
                  lane={item.lane}
                  layout={item.layout}
                  top={item.top}
                  selected={selected}
                  onSelect={setSelected}
                  onHoverOwner={setHoveredOwner}
                />
              );
            })}
          </g>

          {/* Hover tooltip */}
          {hovered && (
            <g style={{ pointerEvents: 'none' }}>
              <rect
                x={hovered.x - 80} y={hovered.y - 22}
                width={160} height={22}
                rx={4}
                fill="#1e293b"
                opacity={0.95}
              />
              <text
                x={hovered.x} y={hovered.y - 7}
                textAnchor="middle"
                fontSize={11}
                fill="white"
                fontWeight={500}
              >
                {hovered.label.length > 28 ? hovered.label.slice(0, 26) + '…' : hovered.label}
              </text>
            </g>
          )}
        </svg>
      </div>

      {selected && <DetailPanel selected={selected} onClose={() => setSelected(null)} />}

      {!selected && (
        <div className="mt-4 text-center text-sm text-slate-400">
          태스크·마일스톤·Lane 라벨 클릭 시 상세 표시 · 그룹 헤더 클릭 시 접기/펼치기 · Ctrl+휠/+/-/0 로 줌
        </div>
      )}
    </div>
  );
}
