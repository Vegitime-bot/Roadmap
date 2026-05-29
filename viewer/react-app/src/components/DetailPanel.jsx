import { X, Calendar, User, Tag } from 'lucide-react';
import { fmtFullDate, durationDays } from '../utils/dates';

/**
 * Bottom panel showing details when something is selected.
 * Supported kinds:
 *   - 'lane'       — clicked the left label box
 *   - 'milestone'  — clicked a milestone point
 *   - 'briefRange' — clicked the lane-internal brief range bar
 */
export function DetailPanel({ selected, onClose }) {
  const { kind, data, lane } = selected;
  const isLane = kind === 'lane';
  const isMilestone = kind === 'milestone';
  const isBriefRange = kind === 'briefRange';

  // header styling depends on what's selected
  const headerColor = isLane ? data.color : lane?.color || '#475569';
  const headerBg = isLane ? data.bg : lane?.bg || '#f1f5f9';
  const labelTag = isLane
    ? 'Lane'
    : isMilestone
      ? (lane ? `${lane.label} · Milestone` : 'Milestone')
      : `${lane?.label || ''} · Range`;
  const title = isLane
    ? data.label
    : isMilestone
      ? (data.name || selected.style?.label || 'Milestone')
      : data.label || 'Range';

  return (
    <div className="mt-4 bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden">
      <div
        className="px-5 py-3 flex items-center justify-between border-b border-slate-100"
        style={{ background: headerBg }}
      >
        <div className="flex items-center gap-3">
          <div className="w-2 h-8 rounded" style={{ background: headerColor }} />
          <div>
            <div className="text-xs uppercase tracking-wider font-semibold" style={{ color: headerColor }}>
              {labelTag}
            </div>
            <div className="text-lg font-semibold text-slate-800">{title}</div>
          </div>
        </div>
        <button onClick={onClose} className="text-slate-400 hover:text-slate-700 transition">
          <X size={18} />
        </button>
      </div>

      <div className="px-5 py-4 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-4 text-sm">
        {isLane && <LaneBody data={data} />}
        {isMilestone && <MilestoneBody data={data} style={selected.style} lane={lane} />}
        {isBriefRange && <BriefRangeBody data={data} row={selected.row} />}
      </div>
    </div>
  );
}

function LaneBody({ data }) {
  return (
    <>
      <Field icon={<User size={14} />} label="담당">{data.owner || '—'}</Field>
      <Field icon={<Tag size={14} />} label="Lane ID"><code className="text-xs">{data.id}</code></Field>
      {data.comment && (
        <Field icon={<Tag size={14} />} label="Comment">{data.comment}</Field>
      )}
      {data.description && (
        <div className="md:col-span-3 text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {data.description}
        </div>
      )}
    </>
  );
}

function MilestoneBody({ data, style, lane }) {
  // If the milestone has a rowId, look up the row inside its lane.
  const row = (data.rowId && Array.isArray(lane?.rows))
    ? lane.rows.find(r => r.id === data.rowId)
    : null;
  return (
    <>
      <Field icon={<Calendar size={14} />} label="날짜">{fmtFullDate(data.date)}</Field>
      <Field icon={<User size={14} />} label="주관">{data.detail?.owner || '—'}</Field>
      <Field icon={<Tag size={14} />} label="유형">
        {style?.label ? (
          <span style={{ color: style.color, fontWeight: 600 }}>{style.label}</span>
        ) : (
          <span className="capitalize">{data.kind || '—'}</span>
        )}
      </Field>
      {row && (
        <Field icon={<Tag size={14} />} label="Row / Item">{row.label}</Field>
      )}
      {style?.description && (
        <div className="md:col-span-3 text-xs text-slate-500 -mt-2">
          {style.description}
        </div>
      )}
      {data.detail?.description && (
        <div className="md:col-span-3 text-slate-600 leading-relaxed border-t border-slate-100 pt-3">
          {data.detail.description}
        </div>
      )}
    </>
  );
}

function BriefRangeBody({ data, row }) {
  return (
    <>
      <Field icon={<Calendar size={14} />} label="기간">
        {fmtFullDate(data.fromDate)} → {fmtFullDate(data.toDate)}
        <span className="ml-2 text-slate-400">({durationDays(data.fromDate, data.toDate)}일)</span>
      </Field>
      <Field icon={<Tag size={14} />} label="구간 Label">{data.label || '—'}</Field>
      {(data.rowLabel || row?.label) && (
        <Field icon={<Tag size={14} />} label="Row / Item">
          {data.rowLabel || row?.label}
        </Field>
      )}
      {row?.comment && (
        <Field icon={<Tag size={14} />} label="Row Comment">{row.comment}</Field>
      )}
      <div className="md:col-span-3 text-xs text-slate-500 -mt-2">
        간략 milestone 페어로 정의된 구간입니다. (양 끝점은 점으로 표시되지 않습니다)
      </div>
    </>
  );
}

function Field({ icon, label, children }) {
  return (
    <div>
      <div className="flex items-center gap-1.5 text-xs text-slate-500 mb-1">
        {icon}
        <span>{label}</span>
      </div>
      <div className="text-slate-800">{children}</div>
    </div>
  );
}
