# Universal Template

For semiconductor product roadmaps, this skill defaults to a **6-milestone
+ brief pair + 2-level grouping** structure. Three variants share the
same skeleton.

When the user's input is under-specified, propose this template and
confirm before generating the recipe.

## Anatomy

```
┌──────────────────────────────────────────────────────────┐
│ laneSuperGroups (lv1) — optional                         │
│   Mainstream │ Premium │ Next-Gen                        │
├──────────────────────────────────────────────────────────┤
│ laneGroups (lv2) — optional                              │
│   LCD Lineup │ OLED Lineup │ Micro-LED Lineup            │
├──────────────────────────────────────────────────────────┤
│ Lanes (one per product / MAST_CODE)                      │
│   Label (top) + Comment (bottom of label box)            │
│   Inside the lane:                                       │
│     - Point milestones (detailed)                        │
│     - Range bars (one per applicable briefPairs entry)   │
├──────────────────────────────────────────────────────────┤
│ milestoneDefinitions (page-shared vocabulary)            │
│   Each has tier: detailed | brief                        │
│ briefPairs[]                                             │
│   Pairs of brief milestones; each becomes a range bar    │
└──────────────────────────────────────────────────────────┘
└──────────────────────────────────────────────────────────┘
```

## Variant 1: Display / general LSI products (canonical)

**Lane axis**: each lane = one product (MAST_CODE).

**Grouping**:
- lv2 (laneGroups) = line-up. Typically derived from a PG column
  (PG3 or PG4). Examples: LCD Lineup, OLED Lineup.
- lv1 (laneSuperGroups) = a higher-level classification. Examples:
  Mainstream, Premium, Next-Gen.
- Both optional. Use whichever the data supports.

**Milestone definitions** (use verbatim):

```json
[
  { "id": "ko",    "label": "K/O",      "color": "#598B45", "icon": "arrow",   "tier": "detailed", "description": "Kick-off (개발 착수)" },
  { "id": "mto",   "label": "MTO",      "color": "#3F6CA8", "icon": "arrow",   "tier": "detailed", "description": "Mask Tape-Out" },
  { "id": "fs",    "label": "FS",       "color": "#94a3b8", "icon": "circle",  "tier": "brief",    "description": "Feasibility Study" },
  { "id": "pvr",   "label": "PVR",      "color": "#D4854B", "icon": "diamond", "tier": "detailed", "description": "Product Validation Review" },
  { "id": "pra",   "label": "PRA",      "color": "#94a3b8", "icon": "circle",  "tier": "brief",    "description": "Production Readiness Approval" },
  { "id": "sracq", "label": "SRA (CQ)", "color": "#B5454F", "icon": "star",    "tier": "detailed", "description": "Sales Release Approval (Customer Qualification)" }
]
```

**briefPairs**:

```json
[
  { "id": "pair-development", "fromDefinitionId": "fs", "toDefinitionId": "pra", "label": "Development" }
]
```

**Per-product milestone sequence**: K/O → MTO → FS → PVR → PRA → SRA.

Not every product has every milestone (especially in early stage).

## Variant 2: Memory products

Same skeleton with a shorter vocabulary (5 instead of 6, no MTO):

```json
[
  { "id": "ko",    "label": "K/O",      "tier": "detailed" },
  { "id": "fs",    "label": "FS",       "tier": "brief" },
  { "id": "pvr",   "label": "PVR",      "tier": "detailed" },
  { "id": "pra",   "label": "PRA",      "tier": "brief" },
  { "id": "sracq", "label": "SRA (CQ)", "tier": "detailed" }
]
```

briefPairs (1 pair): FS → PRA, label "Development".

## Variant 3: Logic / SoC products

Different vocabulary (K/O, AT, BT, MP):

```json
[
  { "id": "ko", "label": "K/O", "color": "#598B45", "icon": "arrow", "tier": "detailed" },
  { "id": "at", "label": "AT",  "color": "#3F6CA8", "icon": "arrow", "tier": "brief" },
  { "id": "bt", "label": "BT",  "color": "#3F6CA8", "icon": "arrow", "tier": "detailed" },
  { "id": "mp", "label": "MP",  "color": "#B5454F", "icon": "star",  "tier": "detailed" }
]
```

briefPairs (1 pair): AT → BT, label "Tape-out Phase" (or similar).

## Variant 4: Generic (non-semiconductor)

For software / marketing / event projects, fall back to:

```json
[
  { "id": "kickoff", "label": "Kickoff", "color": "#598B45", "icon": "arrow",   "tier": "detailed" },
  { "id": "review",  "label": "Review",  "color": "#94a3b8", "icon": "circle",  "tier": "brief" },
  { "id": "beta",    "label": "Beta",    "color": "#3F6CA8", "icon": "arrow",   "tier": "detailed" },
  { "id": "rc",      "label": "RC",      "color": "#94a3b8", "icon": "circle",  "tier": "brief" },
  { "id": "ga",      "label": "GA",      "color": "#B5454F", "icon": "star",    "tier": "detailed" }
]
```

briefPairs (if used): review → rc, label "Validation".

## Confirmation message template

When proposing, use a short structured prompt. Example:

> Display IC 로드맵으로 보입니다. 다음 템플릿으로 진행할까요?
>
> - **Lane**: product별 (MAST_CODE)
> - **상세 milestone** (항상 표시): K/O · MTO · PVR · SRA (CQ)
> - **간략 milestone** (lane 내부 range bar): FS — PRA, label "Development"
> - **Line-up (lv2 group)**: PG4 (예: LCD / OLED / Micro-LED)
> - **Super-line-up (lv1 group)**: PG5 (예: Mainstream / Premium / Next-Gen) — 선택
> - **lane.comment**: Application 컬럼
> - **기간**: 10년 (수정 가능)
>
> 변경/추가/제외할 것 알려주세요.

Skip this if the user already specified everything clearly.

## Customization patterns

| User says | Adjust |
|---|---|
| "MTO 없어요" | Drop MTO from `milestoneDefinitions` |
| "FS·PRA 안 보여줘도 돼" | Drop the brief milestones and remove that pair from `briefPairs` |
| "Lineup이 PG3 기준이야" | `field_mapping.lineup_field = "PG3"` |
| "Customer로 묶고 싶어" | `field_mapping.lineup_field = "Customer"` |
| "comment에 Feature도 보여줘" | comment_field 한 컬럼만 지원; 여러 정보면 데이터 단계에서 결합 후 한 컬럼으로 |
| "양산 중인 것만 보여줘" | `filters.include_codes` 로 해당 MAST_CODE만 |
| "5년치만 보여줘" | `time_range` 좁히기 |
