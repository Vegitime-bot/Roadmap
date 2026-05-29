---
name: roadmap-recipe
description: Generate an interactive roadmap visualization for semiconductor products (memory, logic, display, IP) or general project timelines. Use this skill whenever the user asks for a roadmap, product timeline, multi-year plan, Gantt chart, milestone overview, "10년 로드맵", "제품 로드맵", "공정 로드맵", "IP 로드맵", "Display IC 로드맵", "DDIC 로드맵", or any time-based visualization showing milestones across multiple products grouped into line-ups. Also use when modifying an existing roadmap or when given structured project data (DB rows, CSV, "Recipe 기본정보" sheets) to visualize.
---

# Roadmap Recipe

This skill turns a project description into a Recipe JSON that renders
as an interactive roadmap via the React app in `viewer/react-app/`. The
viewer is fixed code — all the work is producing a correct Recipe.

The skill is tuned for **semiconductor product roadmaps** (5–10 year
horizons, milestone gates K/O · MTO · FS · PVR · PRA · SRA, products
grouped by line-up, often two-level hierarchy). It also handles generic
project roadmaps in the same shape.

## Pipeline

```
User input (natural language / structured data / existing recipe edit)
    │
    ▼
[Recipe JSON]  ← you produce this
    │
    ▼
viewer/react-app/  (Vite + React; renders Recipe inline)
    │
    ▼
Interactive artifact OR locally-served roadmap
```

## How to use this skill

### Step 1 — Identify the scenario

| Scenario | Description |
|---|---|
| **From structured data** | User pastes CSV / Excel / DB rows / a "Recipe 기본정보" sheet. This is the most common production case. |
| **From natural language** | User describes the roadmap in prose. Ad-hoc / brainstorming. |
| **Modify existing recipe** | User has a Recipe in context, asks for changes. |

### Step 2 — Read the relevant reference files

Always read `reference/schema.md` first — it's the viewer's contract.
Then read whichever applies:

| Scenario | Read these |
|---|---|
| Structured data | `from-structured-data.md` (refers to `examples/sample-db.json` and `examples/db_to_recipe.py`) |
| Natural language | `template.md` → `conventions.md` → `from-natural-language.md` |
| Modify existing | `schema.md` is usually enough; re-read others only if domain shifts |

Don't try to recall the schema from memory. The viewer silently drops
malformed elements.

### Step 3 — Produce the Recipe JSON

Build top-down:

- `title`
- `timeRange` (padded by 1+ month on each side)
- `today`
- `milestoneDefinitions` (page-shared types, each with `tier`)
- `milestones[]` (instances with `laneId` + `definitionId`)
- `briefPairs` (optional — array of brief-milestone pairs, each rendered as a lane-internal range bar; multiple pairs stack vertically inside a lane)
- `laneSuperGroups[]` (optional — lv1 super-groups; rendered as horizontal header rows, collapsible)
- `laneGroups[]` (optional — lv2 groups = line-ups; rendered as **rowspan columns** to the left of lane labels)
- `lanes[]` (each with `label`, `color`, `bg`, optional `comment`, optional `rows[]` for multi-row mode)

Critical rules:

- **`milestoneDefinitions` is the page-shared vocabulary.** Every
  `milestone.definitionId` must reference one.
- **Brief milestones are never rendered as points.** They exist only
  to define endpoints of `briefPairs`. Without `briefPairs`, they're
  invisible. State this when stating assumptions.
- **`milestone.laneId` ties an instance to a product.** Same
  definitionId can appear in many lanes with different dates.
- **`lane.comment`** is small text under the label. Keep ≤14 chars.
- **`lane.tasks` is DEPRECATED** — don't emit it. Use `briefPairs` for
  phase-like ranges. For lanes that group multiple items each with their
  own milestone timeline, use multi-row mode (`lane.rows[]` + per-row
  `milestone.rowId`).

### Step 4 — Validate

- Every `milestone.definitionId` exists in `milestoneDefinitions`
- Every `milestone.laneId` exists in `lanes`
- If `briefPairs` set, both endpoint definitionIds exist AND are
  `tier: 'brief'`
- Every `laneGroups[].laneIds[]` references existing lanes
- Every `laneSuperGroups[].groupIds[]` references existing groups
- Dates are `YYYY-MM-DD`, within `timeRange`
- All IDs unique within their type

Fix silently before rendering.

### Step 5 — Render

Two options:

**Option A: Inline React artifact (default, fastest)**

Paste a single React component into an artifact that imports the viewer
inline. For the simplest case, copy the contents of the React app's
`src/components/Roadmap.jsx` (with its imports inlined) and render
`<Roadmap recipe={RECIPE} />`.

**Option B: Local React app (when the user will iterate heavily)**

Extract `viewer/react-app/` to disk, drop the new recipe into
`src/data/`, register it in `src/App.jsx`'s `EXAMPLES`, run
`npm install && npm run dev`. This gives a full development environment
with hot reload.

When in doubt, default to Option A.

### Step 6 — State your assumptions

After rendering, write 2–4 short bullets stating what you inferred.
Example:

> 가정한 것들:
> - Line-up 컬럼을 PG4로 가정 (LCD / OLED / Micro-LED)
> - briefPairs: FS → PRA, label "Development"
> - Product C의 시기 불명 → A SRA 후 1년 stagger
> - lane.comment에 Application 컬럼 사용
>
> 수정할 부분 알려주세요.

This is critical for structured-data inputs where mapping decisions
aren't obvious from the output alone.

## Modifying an existing recipe

When the user has a Recipe in context and asks for changes:

- Preserve all unchanged fields exactly.
- Only modify what they asked for.
- Distinguish definition-level vs instance-level changes:
  - **"FS 색상 바꿔줘"** → change the definition (affects all products' FS)
  - **"Product B의 PVR을 6월로"** → change one milestone instance
  - **"FS-PRA 페어 라벨을 'Validation'으로"** → change a pair in `briefPairs`

This distinction matters: page-shared definitions and recipe-wide
briefPairs vs. per-lane milestone instances and per-lane comments.

## Iteration after rendering

Users almost always follow up with adjustments. Each follow-up is a
"modify existing" scenario. Keep the recipe in context; don't
regenerate from scratch.

## What this skill does NOT cover

- Editing the visualization code (chart colors of the viewer chrome,
  fonts, animations) — that's a code task in `viewer/react-app/src/`.
- Per-task Gantt bars inside lanes — deprecated. Use `briefPairs` range
  bar instead.
- Multi-recipe comparison views — current viewer renders one recipe.
- Real-time DB sync — artifacts are static snapshots.

If asked for any of these, say so and offer the closest thing.

## Files in this skill

| Path | Purpose |
|---|---|
| `SKILL.md` | This file |
| `reference/schema.md` | Recipe JSON schema (read first, always) |
| `reference/template.md` | Universal template + variants |
| `reference/conventions.md` | Color palette, milestone vocabulary, grouping patterns |
| `reference/from-natural-language.md` | Heuristics for prose → recipe |
| `reference/from-structured-data.md` | Heuristics for CSV/DB → recipe |
| `viewer/react-app/` | Full Vite + React + Tailwind app. Renders the Recipe. |
| `examples/sample-db.json` | Canonical 3-layer DB (master + attribute + recipe_configs) |
| `examples/recipe-display.json` | Derived Recipe from sample-db.json |
| `examples/db_to_recipe.py` | Verified DB → Recipe converter |
