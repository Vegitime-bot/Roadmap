# Conventions

Defaults for visual decisions.

## Color palette (lane colors)

| Slot | `color` | `bg` |
|---|---|---|
| Blue | `#3F6CA8` | `#E5ECF5` |
| Green | `#598B45` | `#E5EFDF` |
| Orange | `#D4854B` | `#FBEDDE` |
| Purple | `#7E5BB5` | `#EDE5F5` |
| Teal | `#3A8A8A` | `#DCEEEE` |
| Crimson | `#B5454F` | `#F5DEE0` |
| Amber | `#B58A3F` | `#F5ECDA` |
| Grey | `#7A7A7A` | `#EAEAEA` |

`bg` = `color` at ~90% lightness. Don't exceed 8 lanes. If source has
more, consolidate via line-up grouping.

## Lane group colors

Default `#1e293b` (slate-800) for lv2 groups, `#0f172a` (slate-900) for
lv1 super-groups. The slight darkness difference helps readers see the
hierarchy without color noise.

Override only if user asks for colorful headers.

## Milestone vocabulary (semiconductor)

The page-shared `milestoneDefinitions` typically uses one of these
vocabularies. **Order matters** — it controls slot positions in the
legend and intuitive reading.

### Display / general LSI products

Six milestones in this canonical order:

| # | Column | Tier | Color | Icon | Meaning |
|---|---|---|---|---|---|
| 1 | K/O | detailed | `#598B45` | arrow | Kick-off (개발 착수) |
| 2 | MTO | detailed | `#3F6CA8` | arrow | Mask Tape-Out |
| 3 | FS | **brief** | `#94a3b8` | circle | Feasibility Study |
| 4 | PVR | detailed | `#D4854B` | diamond | Product Validation Review |
| 5 | PRA | **brief** | `#94a3b8` | circle | Production Readiness Approval |
| 6 | SRA (CQ) | detailed | `#B5454F` | star | Sales Release Approval (Customer Qualification) |

The two **brief** milestones (FS, PRA) are NOT shown as points. They
exist only as endpoints of the brief pair range bar (see below).

**Standard brief pair (single):**

```json
"briefPairs": [
  {
    "id": "pair-development",
    "fromDefinitionId": "fs",
    "toDefinitionId":   "pra",
    "label": "Development"
  }
]
```

Each lane gets a range bar labeled "Development" spanning FS → PRA. It
is always rendered when both endpoints exist on that lane.

If a roadmap needs multiple range bars per lane (e.g., Development +
Verification), add more entries to `briefPairs`. Each pair's two
endpoint definitions must also be tier `brief`.

### Memory products (alternative)

Some teams use a shorter vocabulary. Adapt as needed.

### Logic / SoC products

| # | Column | Tier | Color | Icon |
|---|---|---|---|---|
| 1 | K/O | detailed | `#598B45` | arrow |
| 2 | AT | brief | `#3F6CA8` | arrow |
| 3 | BT | detailed | `#3F6CA8` | arrow |
| 4 | MP | detailed | `#B5454F` | star |

If brief pair used: AT → BT, label "Tape-out Phase".

## Tier assignment rule

A milestone is **brief** if it's primarily an internal checkpoint
between major gates. It's **detailed** if it represents a deliverable,
external commitment, or phase transition.

The Display vocabulary is the canonical reference: FS (study) and PRA
(internal readiness check) are brief; K/O, MTO, PVR, SRA (external
gates) are detailed.

When in doubt, lean **detailed**. Brief without a pair is invisible.

## Icon convention

| Icon | Use for |
|---|---|
| `circle` | Brief / soft milestones (FS, PRA) |
| `arrow` | Default gate; release-like events (K/O, MTO, Tape-out) |
| `diamond` | Validation gates (PVR, Qual) |
| `star` | Terminal events (SRA, MP, GA) |

The Display 6-milestone sequence walks through arrow → arrow → circle →
diamond → circle → star, which reads naturally as the workflow
progresses.

## Lane labeling

Keep labels short (~10 chars max for clean display). In the canonical
DB this is usually MAST_CODE (e.g., "S6ABBCC") which fits.

If display names are longer than ~14 chars, the comment line under the
label truncates with "…". The full text appears in the detail panel.

## lane.comment

Use for the most identifying secondary attribute. Common choices:
- Application (e.g., "LCD", "OLED", "Micro-LED")
- Customer abbreviation
- Generation tag (e.g., "Gen1")

Keep under ~14 chars when possible.

## Lane order

Order lanes by:
1. **`super_lineup_field` value** order (defined by
   `super_lineup_labels` keys)
2. **`lineup_field` value** order (defined by `lineup_labels` keys)
3. **MAST_CODE** alphabetically as tiebreaker

This produces a tree-like reading order that aligns with the lv1/lv2
group hierarchy.

## When to use lv1 / lv2 grouping

Both levels render as horizontal header rows with a chevron toggle for
collapse/expand. The hierarchy is:

- **lv1 super-groups (`laneSuperGroups`)** — the top grouping level,
  typically the **line-up itself** (LCD Lineup, OLED Lineup,
  Micro-LED Lineup). Larger, bolder header.
- **lv2 groups (`laneGroups`)** — sub-classifications *inside* a
  line-up (Mainstream, Premium, etc.). Smaller header beneath the lv1
  header.

A given lv2 group is scoped to its parent lv1 line-up: "Mainstream
under LCD" and "Mainstream under OLED" are two distinct groups, not
one shared group.

| Configuration | Use when |
|---|---|
| Flat (no groups) | ≤3 lanes or lanes are peers |
| lv1 only (laneSuperGroups) | line-up only matters, no internal split |
| lv1 + lv2 | line-up has internal sub-classifications (typical for product roadmaps) |

In production data, **line-ups → lv1 super-groups**, and an internal
sub-classification (Mainstream / Premium / Next-Gen) → lv2 groups.

## Common group patterns (semiconductor display)

| Domain | lv1 (line-up) | lv2 (sub-group inside line-up) |
|---|---|---|
| Display IC | LCD Lineup / OLED Lineup / Micro-LED Lineup | Mainstream / Premium / Next-Gen |
| Memory | DRAM / NAND / HBM | by Gen (Gen1 / Gen2 / …) |
| SoC | by product family | Released / In Development |

## Today indicator

Set `today` when:
- Roadmap spans the present
- Source data implies a current state (recent K/O dates)

Omit for purely future-facing roadmaps.

## Time range padding

| Roadmap span | Padding each side |
|---|---|
| 5–10년 | 1–3개월 |
| 1년 | 1–2주 |
| 3개월 | 1주 |

## Description text

Match the user's language. Korean input → Korean descriptions.

Keep 1–2 short sentences. The detail panel wraps long text.
