import { Filter, Eye, EyeOff, ZoomIn, ZoomOut, Minimize2 } from 'lucide-react';
import { ZOOM_MIN, ZOOM_MAX } from '../utils/constants';

/**
 * Top control bar above the chart. Hosts:
 *   - lane visibility toggles (one chip per lane)
 *   - Milestones master toggle
 *   - Today line toggle
 *   - Zoom controls (-, %, +, reset)
 *
 * Brief milestones (the FS-PRA style range bars) are always rendered;
 * they're a structural part of the lane, not an opt-in overlay.
 */
export function Toolbar({
  recipe,
  hiddenLanes, onToggleLane,
  showMilestones, onToggleMilestones,
  showToday, onToggleToday,
  zoom, onZoomIn, onZoomOut, onZoomReset,
}) {
  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 p-3 flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
      <div className="flex items-center gap-2 text-slate-600">
        <Filter size={14} />
        <span className="font-medium">Lanes:</span>
      </div>
      {recipe.lanes.map(l => (
        <button
          key={l.id}
          onClick={() => onToggleLane(l.id)}
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md transition border"
          style={{
            background: hiddenLanes.has(l.id) ? '#f8fafc' : l.bg,
            borderColor: hiddenLanes.has(l.id) ? '#e2e8f0' : l.color + '40',
            color: hiddenLanes.has(l.id) ? '#94a3b8' : l.color,
            opacity: hiddenLanes.has(l.id) ? 0.6 : 1,
          }}
        >
          {hiddenLanes.has(l.id) ? <EyeOff size={12} /> : <Eye size={12} />}
          <span className="font-medium">{l.label}</span>
        </button>
      ))}

      <div className="h-5 w-px bg-slate-200" />

      <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
        <input
          type="checkbox"
          className="rounded"
          checked={showMilestones}
          onChange={(e) => onToggleMilestones(e.target.checked)}
        />
        Milestones
      </label>
      <label className="flex items-center gap-1.5 cursor-pointer text-slate-600">
        <input
          type="checkbox"
          className="rounded"
          checked={showToday}
          onChange={(e) => onToggleToday(e.target.checked)}
        />
        Today line
      </label>

      <div className="h-5 w-px bg-slate-200" />

      <div className="flex-1" />

      <div className="flex items-center gap-1 text-slate-600">
        <button
          onClick={onZoomOut}
          disabled={zoom <= ZOOM_MIN}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition"
          title="축소 (Ctrl+휠 / -)"
        >
          <ZoomOut size={14} />
        </button>
        <span className="text-xs font-mono tabular-nums text-slate-500 w-10 text-center select-none">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={onZoomIn}
          disabled={zoom >= ZOOM_MAX}
          className="p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition"
          title="확대 (Ctrl+휠 / +)"
        >
          <ZoomIn size={14} />
        </button>
        <button
          onClick={onZoomReset}
          disabled={zoom === 1}
          className="ml-1 p-1 rounded hover:bg-slate-100 disabled:opacity-40 disabled:hover:bg-transparent transition"
          title="원래 크기 (0)"
        >
          <Minimize2 size={13} />
        </button>
      </div>
    </div>
  );
}
