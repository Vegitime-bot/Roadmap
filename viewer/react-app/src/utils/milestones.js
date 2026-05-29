import { DEFAULT_MILESTONE_STYLES } from './constants';

/**
 * Resolve a milestone instance against the recipe's `milestoneDefinitions`,
 * falling back to the legacy `kind` field. Always returns a normalized
 * `{ label, color, icon, description?, tier }` object usable for rendering.
 */
export function resolveMilestoneStyle(ms, definitions) {
  // 1) explicit reference into milestoneDefinitions
  if (ms.definitionId && definitions && definitions.length > 0) {
    const def = definitions.find(d => d.id === ms.definitionId);
    if (def) {
      return {
        label: def.label,
        color: def.color || '#475569',
        icon: def.icon || 'arrow',
        description: def.description,
        tier: def.tier || 'detailed',
      };
    }
  }
  // 2) legacy kind-based lookup
  if (ms.kind && DEFAULT_MILESTONE_STYLES[ms.kind]) {
    return {
      label: null,
      ...DEFAULT_MILESTONE_STYLES[ms.kind],
      tier: 'detailed',
    };
  }
  // 3) sane default
  return { label: null, color: '#475569', icon: 'arrow', tier: 'detailed' };
}

/** Check if a milestone uses a 'brief' tier definition. */
export function isBriefMilestone(ms, definitions) {
  if (!ms.definitionId || !definitions) return false;
  const def = definitions.find(d => d.id === ms.definitionId);
  return def?.tier === 'brief';
}
