import { Star, Diamond } from './shapes';

/**
 * Legend bar showing every milestone definition's icon and label.
 *
 * Brief-tier entries are labeled "(range)" rather than "(간략)" — they
 * always show up as range bars in their lanes, not as opt-in overlays.
 */
export function MilestoneLegend({ definitions }) {
  if (!definitions || definitions.length === 0) return null;
  return (
    <div className="mb-4 bg-white rounded-xl border border-slate-200 px-3 py-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <span className="font-medium text-slate-600 text-xs uppercase tracking-wider mr-1">
        Milestones
      </span>
      {definitions.map(def => {
        const isBrief = def.tier === 'brief';
        return (
          <div
            key={def.id}
            className="flex items-center gap-1.5"
            title={def.description || ''}
          >
            <svg width={16} height={16} viewBox="0 0 16 16" style={{ flexShrink: 0 }}>
              {def.icon === 'star' ? (
                <Star x={8} y={8} color={def.color} selected={false} />
              ) : def.icon === 'diamond' ? (
                <Diamond x={8} y={8} color={def.color} selected={false} />
              ) : def.icon === 'circle' ? (
                <circle cx={8} cy={8} r={5} fill={def.color} />
              ) : (
                <polygon points="2,4 14,4 8,13" fill={def.color} />
              )}
            </svg>
            <span className="text-slate-700 text-xs font-medium">{def.label}</span>
            {isBrief && <span className="text-slate-400 text-[10px]">(range)</span>}
          </div>
        );
      })}
    </div>
  );
}

