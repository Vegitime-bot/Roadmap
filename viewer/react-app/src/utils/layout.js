// Each bar sublane: bar height + gap + optional milestone area below
const BAR_H = 18;
const BAR_GAP = 3;
const MS_AREA_H = 36; // milestone icons + labels below each bar row (single row)

/**
 * Lane vertical layout.
 *
 * Milestones are rendered directly below each range bar (same visual
 * row), so the lane height scales with the number of bar sublanes and
 * whether the lane has milestones.
 */
export function computeLaneLayout(_lane, laneMilestonesCount = 0, maxBarCount = 0) {
  const hasMilestones = laneMilestonesCount > 0;

  if (maxBarCount === 0) {
    // No bars: minimal height (milestones won't render in this case)
    return { mode: 'single', msAreaH: 44, totalH: 44 };
  }

  const perRow = BAR_H + BAR_GAP + (hasMilestones ? MS_AREA_H : 0);
  const totalH = Math.max(44, 12 + maxBarCount * perRow);
  return {
    mode: 'single',
    msAreaH: totalH,
    totalH,
  };
}
