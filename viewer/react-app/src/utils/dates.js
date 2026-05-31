// Date utilities. All dates in the Recipe are `YYYY-MM-DD` strings.
// We parse with an explicit `T00:00:00` suffix so the date stays local-time
// instead of UTC — otherwise everything would shift by a day in some
// timezones.

export const parseDate = (s) => new Date(s + 'T00:00:00');

export const daysBetween = (a, b) => Math.round((b - a) / 86400000);

export const fmtShort = (s) => {
  const d = parseDate(s);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

export const fmtDateRange = (a, b) => `${fmtShort(a)} - ${fmtShort(b)}`;

export const fmtFullDate = (s) => {
  const d = parseDate(s);
  return `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
};

export const addDays = (dateStr, days) => {
  const d = parseDate(dateStr);
  d.setDate(d.getDate() + Math.round(days));
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

export const durationDays = (a, b) => daysBetween(parseDate(a), parseDate(b)) + 1;

// Build an array of month windows covering [startD, endD]. Each entry has
// `startIso`, `endIso`, and a short month label. Used by the month header
// bar.
export function buildMonths(startD, endD) {
  const out = [];
  const cur = new Date(startD);
  cur.setDate(1);
  while (cur <= endD) {
    const monthStartIso = cur.toISOString().slice(0, 10);
    const next = new Date(cur);
    next.setMonth(next.getMonth() + 1);
    const monthEnd = new Date(Math.min(next - 86400000, endD));
    const monthEndIso = monthEnd.toISOString().slice(0, 10);
    out.push({
      label: cur.toLocaleString('en-US', { month: 'short' }),
      startIso: monthStartIso,
      endIso: monthEndIso,
    });
    cur.setMonth(cur.getMonth() + 1);
  }
  return out;
}
