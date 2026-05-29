import { MONTH_BAR_H } from '../utils/constants';

/**
 * Horizontal month/year header bar. Uses a pixel-per-month threshold
 * to decide between full month labels and a compact year-only view, so
 * zooming the chart will automatically reveal more detail.
 */
export function MonthBar({ months, dateToX, chartW, totalDays, chartLeft, milestoneAreaH }) {
  // When each month gets less than ~30px the labels become unreadable —
  // switch to year-only mode and reserve the labels for January only.
  const pxPerMonth = chartW / months.length;
  const dense = pxPerMonth < 30;

  return (
    <g>
      <rect
        x={chartLeft}
        y={milestoneAreaH}
        width={chartW}
        height={MONTH_BAR_H}
        fill="#5A5A5A"
        rx={2}
      />
      {months.map((m, i) => {
        const x1 = dateToX(m.startIso);
        const x2 = dateToX(m.endIso) + (chartW / totalDays);
        const isJan = m.startIso.endsWith('-01-01');
        const year = m.startIso.slice(0, 4);
        return (
          <g key={m.startIso}>
            {i > 0 && (
              <line
                x1={x1}
                y1={milestoneAreaH + (dense ? (isJan ? 4 : 14) : 6)}
                x2={x1}
                y2={milestoneAreaH + MONTH_BAR_H - (dense ? (isJan ? 4 : 14) : 6)}
                stroke="#7d7d7d"
                strokeWidth={dense && isJan ? 1.5 : 1}
              />
            )}
            {dense
              ? isJan && (
                  <text
                    x={(x1 + x2) / 2}
                    y={milestoneAreaH + MONTH_BAR_H / 2}
                    textAnchor="middle"
                    dominantBaseline="middle"
                    fill="white"
                    fontSize={12}
                    fontWeight={600}
                    letterSpacing="0.05em"
                  >
                    {year}
                  </text>
                )
              : (
                <text
                  x={(x1 + x2) / 2}
                  y={milestoneAreaH + MONTH_BAR_H / 2}
                  textAnchor="middle"
                  dominantBaseline="middle"
                  fill="white"
                  fontSize={12}
                  fontWeight={500}
                >
                  {m.label}
                </text>
              )}
          </g>
        );
      })}
    </g>
  );
}
