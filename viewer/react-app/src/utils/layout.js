import { LANE_MS_ROW_H } from './constants';

// Extra height when range bars stack vertically (more than one bar
// overlaps in time within the same lane).
const EXTRA_PER_EXTRA_BAR = 22;

/**
 * Lane vertical layout.
 *
 * Both single-row and multi-row authoring modes share the same visual
 * shape: one lane = one track. The track has range bars at one
 * vertical region and milestone points at another, but it's all one
 * "row" visually.
 *
 * `maxBarCount` is the max number of range bars that could ever
 * coexist on this lane (sum across rows in multi-row mode). The lane
 * reserves a bit of extra height for vertical bar stacking.
 */
export function computeLaneLayout(_lane, laneMilestonesCount = 0, maxBarCount = 0) {
  const BASE = laneMilestonesCount > 0 ? LANE_MS_ROW_H : 44;
  const extraStackRoom = Math.max(0, maxBarCount - 1) * EXTRA_PER_EXTRA_BAR;
  const msAreaH = BASE + extraStackRoom;
  return {
    mode: 'single',
    msAreaH,
    totalH: msAreaH,
  };
}
