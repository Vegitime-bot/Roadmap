"""
DB → Recipe 변환 (v4).

v4 변경 사항:
- brief_pairs[] 지원 (여러 페어를 lane 안에 동시 표시)
- brief_pair (단일)도 backward-compat로 지원
- 결과는 항상 briefPairs (배열) 형태로 출력
"""
import json
import sys
from pathlib import Path

PALETTE = [
    ("#3F6CA8", "#E5ECF5"),
    ("#598B45", "#E5EFDF"),
    ("#D4854B", "#FBEDDE"),
    ("#7E5BB5", "#EDE5F5"),
    ("#3A8A8A", "#DCEEEE"),
    ("#B5454F", "#F5DEE0"),
    ("#B58A3F", "#F5ECDA"),
    ("#7A7A7A", "#EAEAEA"),
]


def slugify(s):
    """Column name → safe id (e.g. 'SRA (CQ)' → 'sracq')."""
    return "".join(c.lower() if c.isalnum() else "" for c in s)


def normalize_pair(p):
    """Single brief pair config → recipe-level pair object, or None."""
    if not p or not p.get("from_ms_field") or not p.get("to_ms_field"):
        return None
    out = {
        "fromDefinitionId": slugify(p["from_ms_field"]),
        "toDefinitionId":   slugify(p["to_ms_field"]),
        "label":            p.get("label", ""),
    }
    if p.get("id"):
        out["id"] = p["id"]
    if p.get("color"):
        out["color"] = p["color"]
    return out


def db_to_recipe(db, recipe_id):
    cfg = next((r for r in db["recipe_configs"] if r["recipe_id"] == recipe_id), None)
    if cfg is None:
        raise ValueError(f"recipe '{recipe_id}' not found")

    master = db["master_tables"][cfg["master_table"]]
    attrs = db["attribute_tables"]
    fm = cfg["field_mapping"]

    style_src = attrs[cfg["milestone_style_source"]]
    style_lookup = {s["MS_NAME"]: s for s in style_src["rows"]}

    lane_style_idx = {r["MAST_CODE"]: r for r in attrs.get("lane_style", {}).get("rows", [])}

    # 1. milestoneDefinitions — slot 순서대로
    ms_slot_order = [
        ("detailed_ms_1", "detailed"),
        ("detailed_ms_2", "detailed"),
        ("brief_ms_1",    "brief"),
        ("detailed_ms_3", "detailed"),
        ("brief_ms_2",    "brief"),
        ("detailed_ms_4", "detailed"),
        ("brief_ms_3",    "brief"),
        ("detailed_ms_5", "detailed"),
        ("brief_ms_4",    "brief"),
        ("detailed_ms_6", "detailed"),
    ]
    used_columns = []
    definitions = []
    for slot_key, tier in ms_slot_order:
        col = fm.get(slot_key)
        if not col:
            continue
        used_columns.append((col, tier))
        s = style_lookup.get(col, {})
        def_id = slugify(col)
        definitions.append({
            "id": def_id,
            "label": s.get("MS_NAME", col),
            "color": s.get("COLOR", "#475569"),
            "icon":  s.get("ICON", "arrow"),
            "tier":  tier,
            "description": s.get("DESCRIPTION", ""),
        })

    col_to_def_id = {col: slugify(col) for col, _ in used_columns}

    # 2. brief_pairs - support both 'brief_pairs' (list) and 'brief_pair' (single)
    brief_pairs = []
    if isinstance(cfg.get("brief_pairs"), list):
        for p in cfg["brief_pairs"]:
            normalized = normalize_pair(p)
            if normalized:
                brief_pairs.append(normalized)
    elif cfg.get("brief_pair"):
        normalized = normalize_pair(cfg["brief_pair"])
        if normalized:
            brief_pairs.append(normalized)

    # 3. row filtering
    rows = list(master["rows"])
    flt = cfg.get("filters", {}) or {}
    include = flt.get("include_codes")
    exclude = set(flt.get("exclude_codes", []) or [])
    if include:
        rows = [r for r in rows if r[fm["mast_code"]] in set(include)]
    if exclude:
        rows = [r for r in rows if r[fm["mast_code"]] not in exclude]

    lineup_field = fm.get("lineup_field")
    super_lineup_field = fm.get("super_lineup_field")
    lineup_labels = cfg.get("lineup_labels", {}) or {}
    super_lineup_labels = cfg.get("super_lineup_labels", {}) or {}

    super_order_map = {k: i for i, k in enumerate(super_lineup_labels.keys())}
    lineup_order_map = {k: i for i, k in enumerate(lineup_labels.keys())}

    # ----- row mode dispatch
    # 'lane'  (default, legacy): 1 row = 1 lane. Each lane owns milestones directly.
    # 'range': 1 row = 1 range item *inside* a lane. Lanes are formed by
    #          distinct values of `lane_field`. Each row becomes a row inside
    #          its lane, with its own copy of every milestone column.
    row_mode = fm.get("row_mode", "lane")

    if row_mode == "range":
        return _build_recipe_range_mode(
            cfg, rows, fm, brief_pairs, definitions, used_columns,
            col_to_def_id, super_lineup_field, super_lineup_labels,
            super_order_map, lane_style_idx,
        )

    # ---- 'lane' mode (legacy path) ----
    def sort_key(r):
        sv = r.get(super_lineup_field) if super_lineup_field else None
        lv = r.get(lineup_field) if lineup_field else None
        return (
            super_order_map.get(sv, 9999) if super_lineup_field else 0,
            lineup_order_map.get(lv, 9999) if lineup_field else 0,
            r[fm["mast_code"]],
        )
    rows.sort(key=sort_key)

    # 4. lanes
    lanes = []
    for i, r in enumerate(rows):
        code = r[fm["mast_code"]]
        ls = lane_style_idx.get(code)
        if ls:
            color, bg = ls["COLOR"], ls["BG"]
        else:
            color, bg = PALETTE[i % len(PALETTE)]
        comment_val = r.get(fm.get("comment_field")) if fm.get("comment_field") else None
        lanes.append({
            "id": code,
            "label": r[fm.get("label", "MAST_CODE")] or code,
            "color": color,
            "bg": bg,
            "comment": comment_val,
            "description": r.get("Comment") or r.get("Feature") or "",
            "owner": r.get("FAB(S)") or "",
            "tasks": [],
        })

    # 5. milestone instances
    milestones = []
    for r in rows:
        code = r[fm["mast_code"]]
        for col, _tier in used_columns:
            date = r.get(col)
            if not date:
                continue
            milestones.append({
                "id": f"{code.lower()}-{col_to_def_id[col]}",
                "definitionId": col_to_def_id[col],
                "date": date,
                "laneId": code,
            })

    # 6. laneGroups (lv2) — keyed by (super_lineup_value, lineup_value)
    # so that the same lv2 label (e.g. "Mainstream") under different lv1
    # line-ups (e.g. LCD vs OLED) becomes two distinct groups.
    lane_groups = []
    pair_to_group = {}   # (sv, lv) → group_id
    if lineup_field:
        for r in rows:
            sv = r.get(super_lineup_field) if super_lineup_field else "_"
            lv = r.get(lineup_field)
            if lv is None:
                continue
            key = (sv, lv)
            if key not in pair_to_group:
                meta = lineup_labels.get(lv, {})
                sv_slug = slugify(sv) if super_lineup_field else "all"
                group_id = f"lineup-{sv_slug}-{slugify(lv)}"
                pair_to_group[key] = {
                    "id": group_id,
                    "label": meta.get("label", lv),
                    "color": meta.get("color", "#1e293b"),
                    "description": meta.get("description", ""),
                    "laneIds": [],
                }
            pair_to_group[key]["laneIds"].append(r[fm["mast_code"]])

        lane_groups = list(pair_to_group.values())
        # Sort by (super_order, lineup_order).
        def group_sort_key(g):
            # Recover (sv, lv) from the group object via reverse lookup.
            for (sv, lv), grp in pair_to_group.items():
                if grp is g:
                    return (
                        super_order_map.get(sv, 9999) if super_lineup_field else 0,
                        lineup_order_map.get(lv, 9999),
                    )
            return (9999, 9999)
        lane_groups.sort(key=group_sort_key)

    # 7. laneSuperGroups (lv1)
    lane_super_groups = []
    if super_lineup_field:
        super_to_groups = {}
        for (sv, lv), grp in pair_to_group.items():
            super_to_groups.setdefault(sv, []).append(grp["id"])
        for sv, group_ids in super_to_groups.items():
            meta = super_lineup_labels.get(sv, {})
            # Preserve lane_groups order.
            ordered_ids = [g["id"] for g in lane_groups if g["id"] in set(group_ids)]
            if not ordered_ids:
                continue
            lane_super_groups.append({
                "id": f"super-{slugify(sv)}",
                "label": meta.get("label", sv),
                "color": meta.get("color", "#0f172a"),
                "description": meta.get("description", ""),
                "groupIds": ordered_ids,
            })
        lane_super_groups.sort(key=lambda sg: super_order_map.get(
            next((k for k in super_lineup_labels.keys() if sg["id"] == f"super-{slugify(k)}"), ""),
            9999
        ))

    recipe = {
        "title": cfg["title"],
        "timeRange": cfg["time_range"],
        "today": cfg.get("today"),
        "milestoneDefinitions": definitions,
        "milestones": milestones,
    }
    if brief_pairs:
        recipe["briefPairs"] = brief_pairs
    if lane_super_groups:
        recipe["laneSuperGroups"] = lane_super_groups
    if lane_groups:
        recipe["laneGroups"] = lane_groups
    recipe["lanes"] = lanes
    return recipe


def _build_recipe_range_mode(
    cfg, rows, fm, brief_pairs, definitions, used_columns,
    col_to_def_id, super_lineup_field, super_lineup_labels,
    super_order_map, lane_style_idx,
):
    """
    Range-mode builder.

    Each row becomes one *row* inside a lane. The lane to which a row
    belongs is determined by the value of `lane_field`. Within a lane,
    each row carries its own copy of every milestone column (with its
    own dates). The viewer stacks these rows vertically inside the lane.
    """
    lane_field = fm.get("lane_field")
    if not lane_field:
        raise ValueError("row_mode='range' requires field_mapping.lane_field")

    row_label_field   = fm.get("row_label_field") or fm.get("label") or fm.get("mast_code")
    row_comment_field = fm.get("row_comment_field") or fm.get("comment_field")
    lane_labels       = cfg.get("lane_labels", {}) or {}
    lane_order_map    = {k: i for i, k in enumerate(lane_labels.keys())}

    # Sort rows: first by super-lineup, then by lane, then by mast_code.
    def sort_key(r):
        sv = r.get(super_lineup_field) if super_lineup_field else None
        lv = r.get(lane_field)
        return (
            super_order_map.get(sv, 9999) if super_lineup_field else 0,
            lane_order_map.get(lv, 9999),
            r[fm["mast_code"]],
        )
    rows.sort(key=sort_key)

    # Group rows by lane value (lane_field).
    lane_to_rows = {}
    for r in rows:
        lv = r.get(lane_field)
        if lv is None:
            continue
        lane_to_rows.setdefault(lv, []).append(r)

    # Build lanes (one per distinct lane_field value).
    lanes = []
    milestones = []
    for i, (lv, lane_rows) in enumerate(lane_to_rows.items()):
        meta = lane_labels.get(lv, {})
        lane_id = f"lane-{slugify(lv)}"
        color = meta.get("color") or PALETTE[i % len(PALETTE)][0]
        bg    = meta.get("bg")    or PALETTE[i % len(PALETTE)][1]
        lane_label = meta.get("label", lv)

        # Build the lane's rows array. Each row owns its milestone copies.
        out_rows = []
        for r in lane_rows:
            code = r[fm["mast_code"]]
            row_id = f"{lane_id}/{slugify(code)}"
            row_obj = {
                "id":      row_id,
                "label":   r.get(row_label_field) or code,
                "comment": r.get(row_comment_field) if row_comment_field else None,
            }
            out_rows.append(row_obj)

            # Emit milestone instances tagged with both laneId and rowId.
            for col, _tier in used_columns:
                date = r.get(col)
                if not date:
                    continue
                milestones.append({
                    "id": f"{row_id}-{col_to_def_id[col]}",
                    "definitionId": col_to_def_id[col],
                    "date": date,
                    "laneId": lane_id,
                    "rowId": row_id,
                })

        lanes.append({
            "id": lane_id,
            "label": lane_label,
            "color": color,
            "bg": bg,
            "description": meta.get("description", ""),
            "rows": out_rows,
        })

    # Super-groups (lv1) for range mode: groups multiple lanes (line-ups)
    # together under a higher classification. Each lane retains its
    # identity; the super-group is just an outer collapsible header.
    lane_super_groups = []
    if super_lineup_field:
        super_to_lanes = {}
        for r in rows:
            sv = r.get(super_lineup_field)
            lv = r.get(lane_field)
            if sv is None or lv is None:
                continue
            super_to_lanes.setdefault(sv, set()).add(lv)
        for sv, lvs in super_to_lanes.items():
            meta = super_lineup_labels.get(sv, {})
            member_lane_ids = [
                f"lane-{slugify(lv)}" for lv in lane_to_rows.keys() if lv in lvs
            ]
            if not member_lane_ids:
                continue
            lane_super_groups.append({
                "id": f"super-{slugify(sv)}",
                "label": meta.get("label", sv),
                "color": meta.get("color", "#0f172a"),
                "description": meta.get("description", ""),
                "groupIds": member_lane_ids,
            })
        lane_super_groups.sort(key=lambda sg: super_order_map.get(
            next((k for k in super_lineup_labels.keys() if sg["id"] == f"super-{slugify(k)}"), ""),
            9999
        ))

    recipe = {
        "title": cfg["title"],
        "timeRange": cfg["time_range"],
        "today": cfg.get("today"),
        "milestoneDefinitions": definitions,
        "milestones": milestones,
    }
    if brief_pairs:
        recipe["briefPairs"] = brief_pairs
    if lane_super_groups:
        recipe["laneSuperGroups"] = lane_super_groups
    recipe["lanes"] = lanes
    return recipe


if __name__ == "__main__":
    in_path = sys.argv[1] if len(sys.argv) > 1 else "/mnt/user-data/outputs/sample-db-v3.json"
    out_dir = Path(sys.argv[2]) if len(sys.argv) > 2 else Path("/mnt/user-data/outputs")
    out_dir.mkdir(exist_ok=True)

    with open(in_path) as f:
        db = json.load(f)

    for rc in db["recipe_configs"]:
        recipe = db_to_recipe(db, rc["recipe_id"])
        path = out_dir / f"derived-{rc['recipe_id']}.json"
        with open(path, "w", encoding="utf-8") as f:
            json.dump(recipe, f, indent=2, ensure_ascii=False)
        n_pairs = len(recipe.get("briefPairs", []))
        print(f"✓ {rc['recipe_id']}: {len(recipe['lanes'])} lanes, "
              f"{len(recipe['milestones'])} ms, "
              f"{len(recipe['milestoneDefinitions'])} defs, "
              f"{n_pairs} pair(s), "
              f"sg={len(recipe.get('laneSuperGroups', []))}, "
              f"g={len(recipe.get('laneGroups', []))} → {path}")
