import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { Clock } from 'lucide-react';

import {
  CHART_W, CHART_LEFT_BASE, LANE_HEADER_W, CHART_RIGHT_PAD,
  GLOBAL_MS_AREA_H, TOP_PAD, MONTH_BAR_H, GROUP_HEADER_H, SUPER_GROUP_HEADER_H,
} from '../utils/constants';
import { parseDate, daysBetween, buildMonths, fmtFullDate, addDays, durationDays } from '../utils/dates';
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

function downloadJSON(data, filename) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function downloadText(text, filename) {
  const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

function generateNL(recipe, editLanes, editMilestones, briefPairs) {
  const defs = recipe.milestoneDefinitions || [];
  const briefDefIds = new Set(briefPairs.flatMap(p => [p.fromDefinitionId, p.toDefinitionId]));
  const lines = [];
  lines.push(`로드맵: ${recipe.title || '(제목 없음)'}`);
  lines.push(`기간: ${fmtFullDate(recipe.timeRange.start)} ~ ${fmtFullDate(recipe.timeRange.end)}`);
  if (recipe.today) lines.push(`기준일: ${fmtFullDate(recipe.today)}`);
  lines.push('');

  for (const lane of editLanes) {
    lines.push(`■ ${lane.label}`);
    const laneMs = editMilestones.filter(ms => ms.laneId === lane.id);

    const renderOwner = (ownerMs, indent) => {
      for (const pair of briefPairs) {
        const from = ownerMs.find(m => m.definitionId === pair.fromDefinitionId);
        const to   = ownerMs.find(m => m.definitionId === pair.toDefinitionId);
        if (from && to) {
          const dur = durationDays(from.date, to.date);
          lines.push(`${indent}▸ ${pair.label || '기간'}: ${fmtFullDate(from.date)} ~ ${fmtFullDate(to.date)} (${dur}일)`);
        }
      }
      const detailed = ownerMs
        .filter(m => !briefDefIds.has(m.definitionId))
        .sort((a, b) => parseDate(a.date) - parseDate(b.date));
      for (const ms of detailed) {
        const def = defs.find(d => d.id === ms.definitionId);
        lines.push(`${indent}  • ${fmtFullDate(ms.date)}: ${ms.name || def?.label || ms.definitionId}`);
      }
    };

    if (Array.isArray(lane.rows) && lane.rows.length > 0) {
      for (const row of lane.rows) {
        lines.push(`  ▷ ${row.label}`);
        renderOwner(laneMs.filter(m => m.rowId === row.id), '    ');
      }
    } else {
      renderOwner(laneMs, '  ');
    }
    lines.push('');
  }
  return lines.join('\n');
}

function milestonesToCSV(milestones, definitions) {
  const esc = v => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const header = 'id,laneId,rowId,definitionId,definitionLabel,date,name';
  const rows = milestones.map(ms => {
    const def = (definitions || []).find(d => d.id === ms.definitionId);
    return [ms.id, ms.laneId, ms.rowId, ms.definitionId, def?.label, ms.date, ms.name].map(esc).join(',');
  });
  return [header, ...rows].join('\r\n');
}

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
  // Mutable copies of milestones + lanes; reset when recipe prop changes
  const [editMilestones, setEditMilestones] = useState(() => recipe.milestones || []);
  const [editLanes, setEditLanes] = useState(() => JSON.parse(JSON.stringify(recipe.lanes)));
  const [inlineEdit, setInlineEdit] = useState(null); // { x, y, w, rowId, laneId, pairId, value }
  useEffect(() => {
    setEditMilestones(recipe.milestones || []);
    setEditLanes(JSON.parse(JSON.stringify(recipe.lanes)));
    setEditMode(false);
  }, [recipe]);

  // Vertical drag: which lane is currently highlighted as the drop target
  const [dragTargetLaneId, setDragTargetLaneId] = useState(null);
  const dragTargetLaneIdRef = useRef(null);
  // Updated every render so drag callbacks always see current layout/lanes
  const layoutItemsRef = useRef([]);
  const editLanesRef = useRef(editLanes);

  // Stable refs for values needed inside drag callbacks without re-creating them
  const dragRef = useRef(null);
  const chartWRef = useRef(0);
  const totalDaysRef = useRef(0);

  // ---------- zoom (state + keyboard + wheel) ----------
  // Must be declared before drag handlers so scrollContainerRef is in scope
  const { zoom, zoomIn, zoomOut, resetZoom, scrollContainerRef } = useZoom(1);

  const handleBarDragStart = useCallback((e, type, bar, laneId) => {
    e.preventDefault();
    dragRef.current = {
      type,           // 'move' | 'resize-left' | 'resize-right'
      msId: null,
      laneId,
      rowId: bar.rowId || null,
      fromDefId: bar.fromDefinitionId,
      toDefId: bar.toDefinitionId,
      startClientX: e.clientX,
      // Snapshot milestones at drag start so delta is always from origin
      originalMilestones: editMilestones.map(ms => ({ ...ms })),
      lastDeltaDays: null,
    };
    if (type === 'move') {
      dragTargetLaneIdRef.current = laneId;
      setDragTargetLaneId(laneId);
    }
  }, [editMilestones]);

  const handleMilestoneDragStart = useCallback((e, ms) => {
    e.preventDefault();
    e.stopPropagation();
    dragRef.current = {
      type: 'milestone-move',
      msId: ms.id,
      startClientX: e.clientX,
      originalMilestones: editMilestones.map(m => ({ ...m })),
      lastDeltaDays: null,
    };
  }, [editMilestones]);

  const handleDragMove = useCallback((e) => {
    const dr = dragRef.current;
    if (!dr) return;

    // Horizontal: shift dates
    const deltaX = e.clientX - dr.startClientX;
    const deltaDays = Math.round(deltaX / chartWRef.current * totalDaysRef.current);
    if (deltaDays !== dr.lastDeltaDays) {
      dr.lastDeltaDays = deltaDays;

      if (dr.type === 'milestone-move') {
        setEditMilestones(dr.originalMilestones.map(ms =>
          ms.id === dr.msId ? { ...ms, date: addDays(ms.date, deltaDays) } : ms
        ));
        return; // skip vertical-lane logic
      }

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
    }

    // Vertical: update drop-target lane highlight (move only)
    if (dr.type === 'move' && scrollContainerRef.current) {
      const rect = scrollContainerRef.current.getBoundingClientRect();
      const scrollTop = scrollContainerRef.current.scrollTop;
      const svgY = e.clientY - rect.top + scrollTop;
      let targetLaneId = null;
      for (const item of layoutItemsRef.current) {
        if (item.kind === 'lane' && svgY >= item.top && svgY < item.top + item.layout.totalH) {
          targetLaneId = item.lane.id;
          break;
        }
      }
      if (targetLaneId !== dragTargetLaneIdRef.current) {
        dragTargetLaneIdRef.current = targetLaneId;
        setDragTargetLaneId(targetLaneId);
      }
    }
  }, [scrollContainerRef]);

  const handleDragEnd = useCallback(() => {
    const dr = dragRef.current;
    if (dr && dr.type === 'move') {
      const newLaneId = dragTargetLaneIdRef.current;
      if (newLaneId && newLaneId !== dr.laneId) {
        // Assign to first row of target lane if it's a multi-row lane,
        // otherwise drop rowId (single-row lane).
        const targetLane = editLanesRef.current.find(l => l.id === newLaneId);
        const targetRows = Array.isArray(targetLane?.rows) && targetLane.rows.length > 0
          ? targetLane.rows : null;
        setEditMilestones(prev => prev.map(ms => {
          const forThisOwner = ms.laneId === dr.laneId &&
            (!dr.rowId || ms.rowId === dr.rowId);
          if (!forThisOwner) return ms;
          const moved = { ...ms, laneId: newLaneId };
          if (targetRows) moved.rowId = targetRows[0].id;
          else delete moved.rowId;
          return moved;
        }));
      }
    }
    dragTargetLaneIdRef.current = null;
    setDragTargetLaneId(null);
    dragRef.current = null;
  }, []);

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

  // ---------- add row / add lane ----------
  const handleAddRow = useCallback((laneId) => {
    const ts = Date.now();
    const lane = editLanes.find(l => l.id === laneId);
    if (!lane) return;
    const newRowId = `row_${ts}`;
    const newStartDate = recipe.timeRange.start;
    const newEndDate = addDays(newStartDate, 30);
    const isFirstRow = !Array.isArray(lane.rows) || lane.rows.length === 0;
    const defaultRowId = isFirstRow ? `row_${ts - 1}` : null;

    setEditLanes(prev => prev.map(l => {
      if (l.id !== laneId) return l;
      const newRow = { id: newRowId, label: 'New Row' };
      if (isFirstRow) return { ...l, rows: [{ id: defaultRowId, label: l.label }, newRow] };
      return { ...l, rows: [...l.rows, newRow] };
    }));

    setEditMilestones(prev => {
      // When converting a single-row lane, assign existing unrowId'd milestones to the default row
      const upgraded = isFirstRow && defaultRowId
        ? prev.map(ms => ms.laneId === laneId && !ms.rowId ? { ...ms, rowId: defaultRowId } : ms)
        : prev;
      const newMs = briefPairs.flatMap((pair, i) => [
        { id: `ms_${ts}_${i}a`, laneId, rowId: newRowId, definitionId: pair.fromDefinitionId, date: newStartDate },
        { id: `ms_${ts}_${i}b`, laneId, rowId: newRowId, definitionId: pair.toDefinitionId, date: newEndDate },
      ]);
      const briefDefIds = new Set(briefPairs.flatMap(p => [p.fromDefinitionId, p.toDefinitionId]));
      const detailedDefs = (recipe.milestoneDefinitions || []).filter(d => !briefDefIds.has(d.id));
      const n = detailedDefs.length;
      const detailedMs = detailedDefs.map((def, i) => ({
        id: `ms_${ts}_d${i}`,
        laneId,
        rowId: newRowId,
        definitionId: def.id,
        date: addDays(newStartDate, Math.round(30 * (i + 1) / (n + 1))),
      }));
      return [...upgraded, ...newMs, ...detailedMs];
    });
  }, [editLanes, briefPairs, recipe.timeRange.start]);

  const handleAddLane = useCallback(() => {
    const ts = Date.now();
    const laneId = `lane_${ts}`;
    const newLane = { id: laneId, label: 'New Lane', color: '#6366f1', bg: '#f5f3ff' };
    setEditLanes(prev => [...prev, newLane]);
    setSelected({ kind: 'lane', data: newLane });
  }, []);

  const handleEditLane = useCallback((laneId, updates) => {
    setEditLanes(prev => prev.map(l => l.id !== laneId ? l : { ...l, ...updates }));
    setSelected(prev =>
      prev?.kind === 'lane' && prev.data.id === laneId
        ? { ...prev, data: { ...prev.data, ...updates } }
        : prev
    );
  }, []);

  const handleDeleteLane = useCallback((laneId) => {
    setEditLanes(prev => prev.filter(l => l.id !== laneId));
    setEditMilestones(prev => prev.filter(ms => ms.laneId !== laneId));
    setSelected(null);
  }, []);

  const handleDeleteRow = useCallback((laneId, rowId) => {
    setEditLanes(prev => prev.map(l =>
      l.id !== laneId ? l : { ...l, rows: (l.rows || []).filter(r => r.id !== rowId) }
    ));
    setEditMilestones(prev => prev.filter(ms =>
      !(ms.laneId === laneId && ms.rowId === rowId)
    ));
    setSelected(null);
  }, []);

  // ---------- inline label editing ----------
  const handleEditBarLabel = useCallback((newLabel, rowId, laneId, pairId) => {
    if (rowId) {
      setEditLanes(prev => prev.map(lane => {
        if (lane.id !== laneId) return lane;
        return { ...lane, rows: (lane.rows || []).map(r =>
          r.id === rowId ? { ...r, label: newLabel } : r
        )};
      }));
    }
    // For single-row bars (no rowId), the label is from briefPairs — we don't edit it here
    // (briefPairs are shared recipe-level definitions)
  }, []);

  useEffect(() => {
    if (!editMode) return;
    const onKeyDown = (e) => {
      if (e.key === 'F2' && selected?.kind === 'briefRange' && selected.data.barSvgX != null) {
        const d = selected.data;
        setInlineEdit({
          x: d.barSvgX, y: d.barSvgY, w: Math.max(d.barSvgW, 120),
          value: d.rowLabel || d.label || '',
          rowId: d.rowId || null, laneId: d.laneId, pairId: d.pairId,
        });
      }
      if (e.key === 'Escape') setInlineEdit(null);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [editMode, selected]);

  // ---------- export ----------
  const handleExportRecipe = useCallback(() => {
    const text = generateNL(recipe, editLanes, editMilestones, briefPairs);
    downloadText(text, `${(recipe.title || 'recipe').replace(/\s+/g, '_')}.txt`);
  }, [recipe, editLanes, editMilestones, briefPairs]);

  const handleExportDB = useCallback(() => {
    const csv = milestonesToCSV(editMilestones, recipe.milestoneDefinitions);
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'milestones-db.csv'; a.click();
    URL.revokeObjectURL(url);
  }, [editMilestones, recipe.milestoneDefinitions]);

  // ---------- visible lanes & layout ----------
  const visibleLanes = useMemo(
    () => editLanes.filter(l => !hiddenLanes.has(l.id)),
    [editLanes, hiddenLanes]
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

  // Keep refs in sync so drag callbacks always see current state
  layoutItemsRef.current = layoutItems;
  editLanesRef.current = editLanes;

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
        onAddLane={handleAddLane}
        onExportRecipe={handleExportRecipe}
        onExportDB={handleExportDB}
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
                onMilestoneDragStart={handleMilestoneDragStart}
                isDragTarget={editMode && dragTargetLaneId === item.lane.id}
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
                  editMode={editMode}
                  onAddRow={handleAddRow}
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
          {/* Inline label editor (F2) */}
          {editMode && inlineEdit && (
            <foreignObject x={inlineEdit.x} y={inlineEdit.y - 1} width={inlineEdit.w} height={22}>
              <input
                // @ts-ignore xmlns needed for SVG foreignObject
                xmlns="http://www.w3.org/1999/xhtml"
                autoFocus
                defaultValue={inlineEdit.value}
                style={{
                  width: '100%', height: '100%',
                  background: 'white', border: '2px solid #3b82f6',
                  borderRadius: 3, padding: '0 4px',
                  fontSize: 11, fontWeight: 600, outline: 'none',
                  boxSizing: 'border-box',
                }}
                onBlur={(e) => { handleEditBarLabel(e.target.value, inlineEdit.rowId, inlineEdit.laneId, inlineEdit.pairId); setInlineEdit(null); }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') { handleEditBarLabel(e.target.value, inlineEdit.rowId, inlineEdit.laneId, inlineEdit.pairId); setInlineEdit(null); }
                  if (e.key === 'Escape') setInlineEdit(null);
                  e.stopPropagation();
                }}
              />
            </foreignObject>
          )}
        </svg>
      </div>

      {selected && (
        <DetailPanel
          selected={selected}
          onClose={() => setSelected(null)}
          editMode={editMode}
          onEditLabel={editMode && selected?.kind === 'briefRange' && selected.data.rowId
            ? (v) => handleEditBarLabel(v, selected.data.rowId, selected.data.laneId, selected.data.pairId)
            : undefined
          }
          onEditLane={editMode && selected?.kind === 'lane'
            ? (updates) => handleEditLane(selected.data.id, updates)
            : undefined}
          onDeleteLane={editMode && selected?.kind === 'lane'
            ? () => handleDeleteLane(selected.data.id)
            : undefined}
          onDeleteRow={editMode && selected?.kind === 'briefRange' && selected.data.rowId
            ? () => handleDeleteRow(selected.data.laneId, selected.data.rowId)
            : undefined}
        />
      )}

      {!selected && (
        <div className="mt-4 text-center text-sm text-slate-400">
          태스크·마일스톤·Lane 라벨 클릭 시 상세 표시 · 그룹 헤더 클릭 시 접기/펼치기 · Ctrl+휠/+/-/0 로 줌
        </div>
      )}
    </div>
  );
}
