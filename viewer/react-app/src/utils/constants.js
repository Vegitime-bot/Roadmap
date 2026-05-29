// Layout constants — single source of truth for chart geometry.
export const CHART_W = 1140;             // base chart width at zoom = 1
export const LANE_HEADER_W = 80;
export const GROUP_COL_W = 70;           // lv2 group rowspan column (when present)
export const CHART_LEFT_BASE = LANE_HEADER_W + 10;  // when no lv2 group column
export const CHART_RIGHT_PAD = 16;
export const GLOBAL_MS_AREA_H = 110;     // top area when milestones lack laneId
export const TOP_PAD = 16;
export const MONTH_BAR_H = 38;
export const TASK_H = 22;
export const TASK_GAP = 8;
export const LANE_VPAD = 14;
export const LANE_MS_ROW_H = 78;
export const GROUP_HEADER_H = 30;
export const SUPER_GROUP_HEADER_H = 36;

// Backwards-compatible defaults for legacy milestones using `kind` instead of
// `definitionId`. New recipes should prefer `milestoneDefinitions`.
export const DEFAULT_MILESTONE_STYLES = {
  kickoff:  { color: '#598B45', icon: 'arrow' },
  review:   { color: '#D4854B', icon: 'arrow' },
  decision: { color: '#D4854B', icon: 'arrow' },
  release:  { color: '#3F6CA8', icon: 'arrow' },
  rc:       { color: '#3F6CA8', icon: 'arrow' },
  final:    { color: '#D4854B', icon: 'star' },
};

export const STATUS_COLORS = {
  completed:   'bg-green-100 text-green-800',
  in_progress: 'bg-amber-100 text-amber-800',
  planned:     'bg-slate-100 text-slate-700',
};

export const STATUS_LABEL = {
  completed:   '완료',
  in_progress: '진행 중',
  planned:     '예정',
};

// Zoom bounds. The user-facing controls (+/- buttons, 0 reset, Ctrl+wheel)
// all funnel through these.
export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 8;
export const ZOOM_STEP = 0.25;
