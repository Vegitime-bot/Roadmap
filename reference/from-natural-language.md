# From Natural Language

The user describes a roadmap in prose. The skill converts that into a
Recipe. The structured-data flow (`from-structured-data.md`) handles
CSV / Excel / DB sources, which are the more common production case.

## The core challenge

Natural-language descriptions are under-specified. The user mentions a
few products, lineups, and milestones but doesn't enumerate everything.
Your job:

1. Detect the domain (semiconductor product/process/IP, or generic).
2. Propose the template — one round of confirmation.
3. Fill the gaps with reasonable inferences.
4. State the assumptions explicitly.

## Step-by-step

### 1. Detect the domain

Signals:

| Signal | Domain |
|---|---|
| "K/O", "MTO", "PVR", "SRA", "CQ", "FS", "PRA", PG codes | Semi product (display / general LSI) |
| "Tape-out", "AT", "BT", "MP", "SoC", "logic" | Semi product (logic/SoC) |
| "메모리", "DRAM", "NAND" | Semi product (memory) |
| "10nm", "7nm", "PDK", "HVM" | Semi process |
| "IP block", "PHY", "Controller", "RTL release" | Semi IP |
| "Beta", "GA", "Feature freeze", "Sprint" | Generic software |
| "Campaign", "Brief", "Creative review" | Generic marketing |

### 2. Confirm the template

Read `template.md` for the variant's defaults. Then propose them and
wait for confirmation. Skip if user already specified lanes,
milestones, period, and grouping.

Example confirmation (Display IC variant):

> Display IC 로드맵으로 보입니다. 다음 템플릿으로 진행할까요?
>
> - **Lane**: product별 (MAST_CODE)
> - **상세 milestone**: K/O · MTO · PVR · SRA (CQ)
> - **간략 milestone (range bar)**: FS — PRA, label "Development"
> - **Line-up**: PG4 (LCD / OLED / Micro-LED 등)
> - **기간**: 10년
>
> 변경할 것 알려주세요.

### 3. Extract fields from the clarified description

In this order:

#### 3a. Time horizon → `timeRange`

| User says | Use |
|---|---|
| "10년 로드맵" | Current year start → +10년 |
| "2026-2031" | Direct |
| "Q3 2027 양산 기준" | Bracket with 1–2년 lead-in and ramp |
| "지금부터 5년" | Today → +5년 |
| Nothing | Default to 5–10년 for semi domains |

Pad both ends per `conventions.md`.

#### 3b. Products / Lanes → `lanes`

For product roadmap, lanes = products. User typically lists them:
- "Product A, B, C, D" → 4 lanes
- "S6ABBCC, DD, EE" → 3 lanes (with MAST_CODE-like labels)
- "LCD 2개, OLED 1개" → ask for the codes / names

Assign colors from the palette.

#### 3c. Line-up grouping → `laneGroups` (lv2)

Apply when the user mentions a classification axis:
- "LCD 라인업 / OLED 라인업" → two lv2 groups
- "Gen1 / Gen2" → two lv2 groups
- "K customer / W customer" → two lv2 groups

Don't force grouping when there are ≤3 lanes or no natural axis.

#### 3d. Super-line-up grouping → `laneSuperGroups` (lv1)

Apply when the user mentions a *higher-level* grouping:
- "Mainstream과 Premium" — line-ups themselves group into two
- "양산 / 개발 / 선행"
- "BU1 / BU2"

This is optional. Most roadmaps work with just lv2.

#### 3e. Milestone definitions → `milestoneDefinitions`

Use the variant's default set from `template.md` verbatim. Filter if
the user said "X와 Y만":

```js
// Default for Display IC variant (6 total)
["ko", "mto", "fs", "pvr", "pra", "sracq"]

// Executive variant (2 only — drop everything in between)
["ko", "sracq"]
```

The full definition body (color, icon, label, description) comes
verbatim from `template.md` — do NOT regenerate.

#### 3f. briefPairs

If brief milestones exist in the chosen set, define `briefPairs` as an
array. Each entry is one pair, rendered as a lane-internal range bar
on every lane that has both endpoints.

```json
"briefPairs": [
  { "fromDefinitionId": "fs", "toDefinitionId": "pra", "label": "Development" }
]
```

When multiple pairs are needed, list them all — each lane shows all
applicable bars stacked.

Standard single-pair conventions per template:
- Display IC: FS → PRA, "Development"
- Memory: FS → PRA, "Development"
- Logic SoC: AT → BT, "Tape-out Phase"

If the user filters out one of the pair endpoints, drop that entry from
`briefPairs`.

#### 3g. Milestone instances → `milestones`

For each product × each milestone type, decide a date.

**Case 1: User gave explicit dates**
> "Product A의 K/O는 2026년 3월"

Use directly.

**Case 2: User gave rough timeframes**
> "Product A는 2027년 5월에 SRA"

Work backwards using typical intervals (in months):

| From | To | Interval |
|---|---|---|
| K/O | MTO | ~1개월 |
| MTO | FS | ~2개월 |
| FS | PVR | ~3개월 |
| PVR | PRA | ~6개월 |
| PRA | SRA | ~2개월 |
| K/O total | SRA total | ~14개월 |

Adjust if user mentions different intervals.

**Case 3: User gave no dates**
> "Product C는 개발 중"

Stagger after earlier products by 1–2년. Note the assumption.

#### 3h. lane.comment

If a comment value is mentioned, set it. Examples:
- "LCD용" → `comment: "LCD"`
- "K Customer향" → `comment: "K Customer"`

Keep under ~14 chars.

### 4. State assumptions

After producing the recipe:

> 가정한 것들:
> - Product A·B는 LCD 라인업, C·D는 OLED 라인업으로 가정
> - 중간 milestone (MTO, FS, PVR, PRA)은 표준 간격으로 자동 배치
> - Product C 시기 미정 → A SRA 이후 1년 stagger
>
> 위 가정 중 틀린 것 알려주세요.

## Example flows

### Example A: minimal input

> "Display IC 로드맵 4개 product, 10년"

Flow:
1. 도메인 = Display IC.
2. 4개의 이름·시기·라인업 미확정 → 템플릿 제안 + 확인.
3. 사용자 답변: "S6ABBCC LCD, DD LCD, EE OLED, FF OLED. CC가 2026 K/O".
4. 표준 milestone 6종 + briefPairs FS→PRA 진행.
5. CC K/O 2026-03 → MTO·FS·PVR·PRA·SRA 표준 간격 보간. DD·EE·FF는 stagger.
6. lv2 group: LCD (CC, DD), OLED (EE, FF). lv1 없음.
7. 가정 명시.

### Example B: ambiguous

> "우리 회사 로드맵 만들어줘"

Ask:
- 어떤 종류? (display / memory / logic / ...)
- 어떤 product들? (이름 또는 MAST_CODE 목록)
- 기간?

One clarification round beats producing generic output.

## Common phrasings and mappings

| User phrasing | Maps to |
|---|---|
| "라인업", "lineup" | lv2 group (`laneGroups`) |
| "1라인업", "Mainstream", "Premium" | lv1 super-group (`laneSuperGroups`) |
| "양산 중", "MP 완료" | likely Mainstream / In Production grouping |
| "차세대", "선행 연구" | Next-Gen / In Development grouping |
| "K/O", "착수" | Milestone, definitionId='ko' |
| "MTO", "Mask Tape-out" | Milestone, definitionId='mto' |
| "PVR", "검증 리뷰" | Milestone, definitionId='pvr' |
| "SRA", "CQ" | Milestone, definitionId='sracq' (terminal) |
| "FS-PRA 구간", "개발 기간" | briefPairs (page-shared) |
| "X용 product", "Y application" | lane.comment |
