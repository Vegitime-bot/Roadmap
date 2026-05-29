# From Structured Data

The user gives you DB rows, CSV, or a "Recipe 기본정보" sheet that
points into a master table. This is the path most production users
take; the natural-language flow handles ad-hoc cases.

The canonical reference DB is `examples/sample-db.json`, the resulting
recipe in `examples/recipe-display.json`, and the verified conversion
script `examples/db_to_recipe.py`.

## The 3-layer DB structure

```
┌──────────────────────────────────────────────────────────────┐
│ Layer 3 — Recipe 기본정보 (recipe_configs)                  │
│   One row per Recipe (view). Says which master table to use,│
│   which column means what, what to show, what to filter.    │
└──────────────────┬───────────────────────────────────────────┘
                   │ references
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 2 — 속성 Tables (attribute_tables)                    │
│   milestone_style · lane_style · (optional joins)           │
│   joined to Layer 1 by MAST_CODE                            │
└──────────────────┬───────────────────────────────────────────┘
                   │ joined by MAST_CODE
                   ▼
┌──────────────────────────────────────────────────────────────┐
│ Layer 1 — 기준정보 Tables (master_tables)                   │
│   One table per product family.                             │
│   One row = one product. MAST_CODE required.                │
│   Milestone dates are COLUMNS (wide format).                │
│   Plus many other columns: PG1~PG7 classification,          │
│   process/spec, Customer, Application, Feature, Comment.    │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: 기준정보 (master_tables)

One row = one product. Columns are a mix of:

- **Identifiers**: MAST_CODE (primary key), often LABEL
- **Classification (PG1~PG7)**: hierarchical product grouping (e.g.
  LSI > DISPLAY > CON > LCD > PREMIUM > MOBILE > 120Hz)
- **Process / spec**: inch(S), DR(S), PROCESS, FAB(S), PKG, etc.
- **Application context**: Customer, Application, Feature, Comment
- **Milestone dates (wide format)**: K/O, MTO, FS, PVR, PRA, SRA (CQ)
  — different families may use different milestone columns

Empty milestone cells are valid (`null`); the converter just skips that
instance.

### Layer 2: 속성 (attribute_tables)

| Table | Purpose |
|---|---|
| `milestone_style` | Column name → color, icon, description |
| `lane_style` | Optional per-product lane color override |

Other attribute joins are possible but rarely needed; PG columns in
Layer 1 already carry the grouping/classification info.

### Layer 3: Recipe 기본정보 (recipe_configs)

One row per Recipe view. Crucial fields:

```json
{
  "recipe_id": "display-full-view",
  "title": "Display Driver IC Roadmap",
  "time_range": { "start": "2026-01-01", "end": "2031-12-31" },
  "today": "2026-05-15",

  "master_table": "display_products",

  "field_mapping": {
    "mast_code":          "MAST_CODE",
    "label":              "MAST_CODE",
    "comment_field":      "Application",
    "lineup_field":       "PG5",
    "super_lineup_field": "PG4",
    "detailed_ms_1":      "K/O",
    "detailed_ms_2":      "MTO",
    "brief_ms_1":         "FS",
    "detailed_ms_3":      "PVR",
    "brief_ms_2":         "PRA",
    "detailed_ms_4":      "SRA (CQ)"
  },

  "brief_pairs": [
    {
      "id": "pair-development",
      "from_ms_field": "FS",
      "to_ms_field":   "PRA",
      "label":         "Development"
    }
  ],

  "milestone_style_source": "milestone_style",

  "lineup_labels": {
    "LCD":  { "label": "LCD Lineup", "color": "#1e293b" },
    "OLED": { "label": "OLED Lineup" }
  },
  "super_lineup_labels": {
    "PREMIUM": { "label": "Premium", "description": "프리미엄" }
  },

  "filters": { "include_codes": null, "exclude_codes": [] }
}
```

### field_mapping details

| Key | Meaning |
|---|---|
| `row_mode` | `"lane"` (default) — 1 DB row = 1 lane. `"range"` — 1 DB row = 1 row inside a lane. |
| `mast_code` | column with the row's primary key |
| `label` | column whose value becomes `lane.label` (row-mode = lane only) |
| `comment_field` | column whose value becomes `lane.comment` (row-mode = lane only) |
| `lane_field` | (row-mode = range only) column whose distinct values define lanes |
| `row_label_field` | (row-mode = range only) column whose value becomes `row.label` |
| `row_comment_field` | (row-mode = range only) column whose value becomes `row.comment` |
| `lineup_field` | column whose distinct values define **lv2 groups** — sub-classifications *within* a line-up (e.g. Mainstream / Premium). (row-mode = lane only) |
| `super_lineup_field` | column whose distinct values define **lv1 super-groups** — the line-up itself (e.g. LCD Lineup / OLED Lineup). This is the most common top-level grouping for product roadmaps. |
| `detailed_ms_1..N` | columns to render as point milestones, tier = detailed |
| `brief_ms_1..M` | columns to render as brief milestones (no points; only used via `brief_pairs`) |

Milestone slot numbering is positional — it controls the order in
`milestoneDefinitions`, which affects the legend order. The
`detailed_ms_N` / `brief_ms_M` keys can have arbitrary N/M; the
converter walks them in a defined order (see `db_to_recipe.py`).

### Two row modes

**`row_mode: "lane"`** (default — the most common case):
- 1 DB row = 1 lane.
- Each lane owns its milestone instances directly.
- `super_lineup_field` groups lanes into lv1 super-groups (typically
  line-ups, e.g. LCD Lineup). `lineup_field` groups lanes into lv2
  sub-groups inside each line-up (e.g. Mainstream / Premium).
- A lv2 group is scoped to its parent lv1 line-up: the same lv2 label
  (e.g. "Mainstream") under LCD Lineup vs OLED Lineup becomes two
  distinct groups in the recipe.

**`row_mode: "range"`**:
- 1 DB row = 1 *row* inside a lane.
- Lanes are formed by distinct values of `lane_field` (e.g., PG4 → LCD
  / OLED / Micro-LED lanes). Each lane is typically a line-up.
- Each row inside a lane carries its own copy of every milestone
  column.
- Same milestone type (e.g., K/O) appears once per row, so a lane with
  N rows shows N K/O points, one per row.
- Range bars from `brief_pairs` are computed per-row (using that row's
  brief milestone dates). All range bars from all rows are pooled onto
  the lane's single track; overlapping bars stack vertically.
- Visual identification of which row a bar/point belongs to is not
  encoded in the rendering — the row identity surfaces only in the
  detail panel on click.

The viewer renders both modes from the same schema:
- range-mode recipes have `lanes[].rows[]` populated;
- lane-mode recipes leave `lanes[].rows` absent or empty.

### brief_pairs

Optional, but typical when brief milestones exist. Define **one or more**
pairs; each becomes a range bar inside every lane that has both
endpoints.

```json
"brief_pairs": [
  {
    "id": "pair-development",
    "from_ms_field": "FS",
    "to_ms_field":   "PRA",
    "label":         "Development"
  },
  {
    "id": "pair-verification",
    "from_ms_field": "SV",
    "to_ms_field":   "HV",
    "label":         "Verification",
    "color":         "#7E5BB5"
  }
]
```

Each pair's two field names must be columns also listed as `brief_ms_*`.
The `label` appears on the range bar; `color` overrides the default
(lane color). Multiple bars stack vertically inside the lane.

The legacy singular `brief_pair` form is also accepted and is
converted to a single-element `brief_pairs` array.

### lineup_labels and super_lineup_labels

Map distinct values of the lineup/super_lineup columns to human-readable
labels. The order of keys defines display order. Example:

```json
"super_lineup_labels": {
  "OTHERS":   { "label": "Mainstream",  "color": "#0f172a" },
  "PREMIUM":  { "label": "Premium" },
  "NEXT_GEN": { "label": "Next-Gen" }
}
```

If a label entry is missing, the column value is used as the label
verbatim.

## Conversion algorithm (use `examples/db_to_recipe.py` verbatim)

The script reads a `recipe_config` and outputs a complete Recipe. Steps
in order:

1. Walk `field_mapping`'s `detailed_ms_*` and `brief_ms_*` slots; emit
   one `milestoneDefinitions` entry per slot, looking up
   color/icon/description from `milestone_style`.
2. Build `briefPairs`: read `brief_pairs[]` from the config (or the
   legacy single `brief_pair`), normalize each entry's
   `from_ms_field` / `to_ms_field` into slugified definitionIds, and
   carry over `label` and optional `color` / `id`. Emit as a top-level
   `briefPairs` array on the recipe.
3. Filter master rows via `filters.include_codes` / `exclude_codes`.
4. Sort rows by `(super_lineup_order, lineup_order, mast_code)`.
5. For each row, emit a `lane` with id = MAST_CODE, label =
   `row[label]`, comment = `row[comment_field]`, palette color
   (overridden by `lane_style` if available).
6. For each row × each milestone column, emit a `milestone` if the cell
   is non-null. `definitionId` = slugified column name, `laneId` =
   MAST_CODE.
7. Build `laneGroups` from distinct values of the `lineup_field`,
   ordering by `lineup_labels` key order.
8. Build `laneSuperGroups` from distinct values of `super_lineup_field`,
   each member's `groupIds` is the set of lineup ids whose rows are
   under that super value.

The script is decided and tested — produces `examples/recipe-display.json`
from `examples/sample-db.json` deterministically.

## How to apply this to user-provided data

Users rarely hand you a perfectly-shaped 3-layer DB. Adapt their input
to fit, then run the conversion.

### Case A: user provides a single wide-format sheet

Example: a copy-pasted Excel sheet with columns including MAST_CODE,
some PG columns, several milestone date columns, and metadata.

Process:
1. Treat the sheet as the master_table.
2. Identify the milestone columns (date-valued, short names).
3. Ask the user — or infer — which are detailed vs brief.
4. Identify a PG column to use as `lineup_field` (typically PG3 or PG4
   in display/logic; usually whatever the user calls "line-up").
5. If brief milestones exist, ask which pair(s) of them form the
   `brief_pairs` entries and what label each uses.
6. Substitute defaults for `milestone_style` per `conventions.md`.
7. Build a minimal `recipe_config` in memory and run the conversion.

### Case B: user provides Recipe 기본정보 + master_table separately

Matches the canonical structure. Just use it.

### Case C: user provides long-format rows (one row per milestone)

Less common. Pivot to wide first, then proceed as Case A.

### Case D: user provides messy/incomplete data

Ask for: a product list, MAST_CODE, at least one date column, and one
classification column. Anything else can default or be omitted.

## Field-mapping inference (when not specified)

| Column name pattern | Likely role |
|---|---|
| `MAST_CODE`, `id`, `code`, `key` | `mast_code` |
| `LABEL`, `name`, `product` | `label` |
| `Comment`, `Application`, `Customer`, `Feature` | candidate for `comment_field` |
| `PG1`, `PG2`, ..., or `Group`, `Lineup`, `Family` | candidate for `lineup_field` / `super_lineup_field` |
| Short ALL-CAPS or punctuation tokens with date values | milestone column |

For milestone columns, identify detailed vs brief:
- Major gates (K/O, MTO, PVR, SRA, MP, Tape-out) → detailed
- Intermediate checkpoints (FS, PRA, Review) → brief

When unsure, ask once:
> 다음 milestone 컬럼 중 점으로 표시할 것(상세) / 두 개를 묶어 lane 안의
> range bar로 표시할 것(간략)을 알려주세요. 간략은 페어로 묶여
> "Development" 같은 한 구간으로 시각화됩니다.

After inference, **always state the mapping you used**:

> 다음 매핑을 적용했습니다:
> - 상세 milestone: K/O, MTO, PVR, SRA (CQ)
> - 간략 milestone: FS, PRA (페어로 묶어 "Development" 구간 표시)
> - Lineup: PG4 (LCD / OLED / Micro-LED)
> - Super-lineup: PG5 (Mainstream / Premium / Next-Gen)
> - Comment: Application 컬럼
>
> 수정할 부분 있나요?

## Milestone style fallback

If `milestone_style` is not provided, infer per `conventions.md`:
- detailed milestones: progression colors (green → blue → orange → red)
- brief milestones: muted gray (`#94a3b8`) + `circle` icon

## Lane color fallback

If `lane_style` is not provided, assign from the 8-slot palette in
`conventions.md` in order of appearance.

## Date format normalization

| Input | Output |
|---|---|
| `2025-01-05` | unchanged |
| `01/05/2025` | Ambiguous (US vs EU); ask once |
| `2025/1/5`, `Jan 5 2025` | normalize |
| Excel serial number | convert (epoch 1899-12-30) |
| `2025-Q3` | start of quarter (`2025-07-01`) |
| Empty / null | leave as null; converter skips the milestone instance |

## Multiple Recipes from one DB

A key pattern: same DB powers many views. Copy and modify the
`recipe_config`:

| Variation | Change |
|---|---|
| Executive view (fewer milestones) | Drop slots from `field_mapping` |
| Single BU view | `filters.include_codes` |
| Specific lineup | Set `filters.include_codes` to that group's MAST_CODEs |
| Time window | Adjust `time_range` |
| Different product family | Point `master_table` elsewhere; supply matching `field_mapping` |

## Validation checklist

Before handing the Recipe to the viewer:

- All `milestone.definitionId` values reference an entry in
  `milestoneDefinitions`
- All `milestone.laneId` values reference an existing lane
- If `briefPairs` is set, both endpoint definitionIds exist in
  `milestoneDefinitions` AND are tier=brief
- All `laneGroups[].laneIds[]` reference existing lanes
- All `laneSuperGroups[].groupIds[]` reference existing groups
- All dates parse as `YYYY-MM-DD`
- All IDs unique within their type

Fix silently before rendering.

## When to ask vs. proceed silently

Ask:
- Which milestone columns are detailed vs brief
- Which two brief milestones form the pair (if multiple brief candidates)
- Date format ambiguity
- Which PG column is the line-up (when multiple plausible)
- When source has 100+ products: which subset to visualize

Proceed silently when:
- Structure clearly matches the canonical 3-layer pattern
- All field names map unambiguously
- Dates parse cleanly

After proceeding, state every assumption made.
