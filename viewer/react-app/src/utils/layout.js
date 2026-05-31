const BAR_H = 18;
const BAR_GAP = 3;
const MS_ROW_H = 32; // height per milestone owner-row

/**
 * Lane vertical layout.
 *
 * Bar section: stacked range bars (upper area).
 * Milestone section: one horizontal row per distinct owner (row/lane),
 * rendered below all bars.
 */
export function computeLaneLayout(lane, laneMilestonesCount = 0, maxBarCount = 0) {
  const hasMilestones = laneMilestonesCount > 0;

  // Number of milestone rows = distinct owners with milestones.
  // For multi-row lanes each row is one owner; for single-row it's one.
  const numMilestoneRows = hasMilestones
    ? (Array.isArray(lane.rows) && lane.rows.length > 0 ? lane.rows.length : 1)
    : 0;

  if (maxBarCount === 0) {
    return { mode: 'single', msAreaH: 44, totalH: 44 };
  }

  const barSectionH = maxBarCount * (BAR_H + BAR_GAP);
  const msSectionH = numMilestoneRows > 0 ? 6 + numMilestoneRows * MS_ROW_H : 0;
  const totalH = Math.max(44, 12 + barSectionH + msSectionH);
  return { mode: 'single', msAreaH: totalH, totalH };
}
