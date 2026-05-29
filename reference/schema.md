# Recipe JSON Schema

The contract with the viewer. Anything that doesn't match is silently
dropped from the chart.

## Top-level structure

```ts
{
  title: string,                       // shown at top
  timeRange: {
    start: string,                     // 'YYYY-MM-DD'
    end: string                        // 'YYYY-MM-DD'
  },
  today?: string,                      // 'YYYY-MM-DD' — red indicator; omit to hide

  milestoneDefinitions?: Definition[], // page-shared milestone vocabulary
  milestones: Milestone[],             // instances (laneId + definitionId)
  briefPairs?: BriefPair[],            // pairs of brief milestones rendered as lane-internal range bars

  laneSuperGroups?: SuperGroup[],      // lv1 — supergroups of lane groups (optional)
  laneGroups?: LaneGroup[],            // lv2 — groups of lanes (optional)
  lanes: Lane[]                        // must have ≥1
}
```

## Milestone Definition (page-shared vocabulary)

```ts
{
  id: string,                          // unique within milestoneDefinitions
  label: string,                       // display name (e.g., 'K/O', 'PVR')
  color: string,                       // hex
  icon?: 'arrow' | 'star' | 'diamond' | 'circle',
  tier?: 'detailed' | 'brief',         // default: 'detailed'
  description?: string
}
```

Tiers behave very differently in the viewer:

- **`detailed`** — rendered as a point marker on the lane. Always shown
  (when the master Milestones toggle is on).
- **`brief`** — **never rendered as a point.** Brief milestones are
  represented only via the lane-internal range bars defined by
  `briefPairs`. Range bars are always rendered (no toggle); brief
  definitions still appear in the legend, marked "(range)".

## BriefPair

```ts
{
  id?: string,                         // unique id (auto-derived from endpoints if missing)
  fromDefinitionId: string,            // start point of the range
  toDefinitionId: string,              // end point of the range
  label: string,                       // text displayed on the range bar
  color?: string                       // hex; defaults to lane color when omitted
}
```

A recipe can declare **zero or more** pairs in `briefPairs`. Each pair
applies uniformly to every lane:

- For each lane, the viewer looks up the two endpoint milestones
  (`fromDefinitionId` and `toDefinitionId`) on that lane.
- If both exist, a horizontal range bar is drawn from one date to the
  other, displaying the pair's `label`.
- The endpoint milestones themselves are **not** drawn as points (they
  must be `tier: 'brief'`).
- If either endpoint is missing on a lane, that lane silently omits the
  bar.

When multiple pairs are defined, each lane shows all applicable bars
stacked vertically. The lane's height grows automatically to fit.

`briefPair` (singular) is also accepted as a backward-compat shorthand
for a single-element `briefPairs` array.

## Milestone (instance)

```ts
{
  id: string,                          // unique
  date: string,                        // 'YYYY-MM-DD'
  laneId: string,                      // which lane this instance belongs to
  rowId?: string,                      // which row inside the lane (multi-row mode)
  definitionId: string,                // references milestoneDefinitions[].id
  name?: string,                       // overrides definition.label if set
  detail?: {
    owner?: string,
    description?: string
  }
}
```

Rules:
- **Always set `laneId`** — same definitionId (e.g., `ko`) can appear in
  many lanes with different dates; the laneId disambiguates.
- **Set `rowId` in multi-row mode.** If a lane has `rows[]`, every
  milestone on that lane must declare which row it belongs to. The
  viewer uses `rowId` to render the milestone in the correct horizontal
  track inside the lane.
- **Always set `definitionId`** — color/icon/tier comes from there.
- `laneId` omitted → milestone renders in the global top area (legacy).

## Lane

```ts
{
  id: string,                          // unique
  label: string,                       // shown in left-side colored box
  color: string,                       // hex — lane label box + range bars
  bg: string,                          // hex — lane background tint
  comment?: string,                    // small text under the label
  description?: string,                // shown in detail panel
  owner?: string,                      // shown in detail panel
  rows?: Row[]                         // multi-row mode — see below
}
```

A lane runs in one of two modes:

- **Single-row** (`rows` absent or empty): the lane has a single
  horizontal track. All `milestones[].laneId === this.id` instances are
  rendered inside it. One range bar per applicable briefPair appears in
  the lane (using lane-scoped milestone dates).

- **Multi-row** (`rows[]` non-empty): the lane is a container of rows.
  Each row gets its own horizontal track. Milestones with both
  `laneId === this.id` and `rowId === row.id` are rendered inside the
  row's track. Range bars are computed per row (using the row's own
  brief milestones). The lane label box spans all rows.

## Row (only in multi-row lanes)

```ts
{
  id: string,                          // unique within the recipe
  label: string,                       // shown above the row's track
  comment?: string,                    // small descriptor; appears after the label
  description?: string,                // shown in detail panel
}
```

A row exists only as a child of a `Lane`. There is no top-level `rows`
array.

> **No tasks.** Earlier versions had per-lane Gantt-style task bars
> (`lane.tasks[]`). That model is gone. Phase information is represented
> via the `briefPairs` range bars (with multiple rows in a lane when
> needed).

## LaneGroup (lv2)

```ts
{
  id: string,                          // unique
  label: string,                       // group header (auto-uppercased)
  color?: string,                      // hex; default '#1e293b'
  description?: string,
  laneIds: string[]                    // ordered lane ids in this group
}
```

- A lane appears in at most one group.
- Lanes not referenced by any group render flat after grouped lanes.
- **Visualized as a horizontal header row** with a chevron toggle.
  Clicking the header collapses/expands the lanes inside.

In production this typically maps to a **sub-classification within a
line-up** (e.g., "Mainstream", "Premium", "Next-Gen" inside an "LCD
Lineup"). A given lv2 group label is scoped to its parent lv1
line-up: "Mainstream under LCD" and "Mainstream under OLED" are two
different lv2 groups, each with its own id and `laneIds`.

## SuperGroup (lv1)

```ts
{
  id: string,                          // unique
  label: string,                       // super-group header (auto-uppercased)
  color?: string,                      // default '#0f172a'
  description?: string,
  groupIds: string[]                   // ordered LaneGroup ids
}
```

- A LaneGroup appears in at most one SuperGroup.
- **Visualized as a horizontal header row** with a chevron toggle.
  Clicking the header collapses all member groups (and their lanes) at
  once.
- In production this typically maps to a **line-up** (e.g., "LCD
  Lineup", "OLED Lineup", "Micro-LED Lineup"). This is the top
  grouping level.

Both `laneSuperGroups` and `laneGroups` are optional and independent:
- Both set → 3 visible levels (super → group → lane).
- Only `laneGroups` set → 2 levels.
- Only `laneSuperGroups` set without `laneGroups` → super-groups with
  no contents (degenerate; avoid).
- Neither set → flat list of lanes.

## Minimum viable recipe

```json
{
  "title": "Test",
  "timeRange": { "start": "2025-01-01", "end": "2025-12-31" },
  "milestones": [],
  "lanes": [
    {
      "id": "a", "label": "A", "color": "#3F6CA8", "bg": "#E5ECF5"
    }
  ]
}
```

## Recommended recipe shape

See `examples/recipe-display.json` for a full working example with all
features (lv1 supergroups, lv2 groups, briefPairs, comments, 6+ milestone
definitions across two tiers).

## Common silent failures

| Mistake | Result |
|---|---|
| `2025-1-5` instead of `2025-01-05` | Date parses as invalid → element disappears |
| Brief milestone with no matching pair in `briefPairs` | Milestone is hidden, never appears anywhere |
| A pair's `fromDefinitionId` / `toDefinitionId` references non-existent definition | That range bar never renders |
| `milestone.definitionId` references non-existent definition | Falls back to default gray arrow |
| `milestone.laneId` references non-existent lane | Milestone shows in global top area |
| Missing `tier` on definition | Defaults to `detailed` (so a brief-meant milestone gets rendered as a point) |
| `milestone.rowId` references non-existent row in the lane | Milestone is dropped from rendering |
| Multi-row lane with milestones missing `rowId` | Milestones don't render (they have no track to land in) |
| `laneSuperGroups[].groupIds[]` references a group that doesn't exist | Super-group is rendered empty |
| Mixing date formats | Some elements position wrong |
