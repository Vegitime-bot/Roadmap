"""
query plan + 조회 데이터 → 범용 Chart Spec.

Chart Spec은 렌더러 중립적이다. 지금은 pm-agent/renderer.html이 그리지만,
사내 뷰어/Recharts/Vega 무엇이든 이 스펙만 소비하면 된다.

ChartSpec = {
  "type": "grouped_bar" | "bar" | "kpi" | "table" | "gantt",
  "title": str,
  "data": [ {...}, ... ],
  "encoding": {...},          # 축/시리즈/색상 매핑
  "columns": [...],           # table 용
  "kpis": [ {label, value, unit, tone} ],
  "notes": [str, ...],        # 미해소 코드 등 데이터 신뢰성 고지
  "meta": {"intent", "engine", "sources", "assumptions"}
}
"""
from statistics import mean

from . import query

STATUS_TONE = {"정상": "good", "지연": "warn", "위험": "bad", "보류": "muted"}


def build(plan: dict, today: str = query.DEFAULT_TODAY) -> dict:
    f = plan.get("filters", {}) or {}
    projects = query.get_projects(
        division=f.get("division"), stage=f.get("stage"), status=f.get("status")
    )
    builder = {"progress": _progress, "budget": _budget, "schedule": _schedule}[plan["intent"]]
    spec = builder(projects, today)
    spec["title"] = plan.get("title", spec.get("title", ""))
    spec["meta"] = {
        "intent": plan["intent"],
        "engine": plan.get("_engine", "?"),
        "sources": _sources(plan["intent"]),
        "filters": {k: v for k, v in f.items() if v},
    }
    return spec


def _sources(intent):
    if intent == "budget":
        return ["과제관리.projects", "경영시스템.budget (code-crosswalk 연계)"]
    if intent == "schedule":
        return ["과제관리.projects", "과제관리.milestones"]
    return ["과제관리.projects"]


# ------------------------------------------------------------------- 진척/상태
def _progress(projects, today):
    data = [{
        "과제": p["name"], "task_code": p["task_code"], "사업부": p["division"],
        "단계": p["stage"], "PM": p["pm"], "상태": p["status"],
        "진척률": p["progress_pct"], "tone": STATUS_TONE.get(p["status"], "muted"),
    } for p in sorted(projects, key=lambda x: x["progress_pct"])]

    delayed = [p for p in projects if p["status"] in ("지연", "위험")]
    kpis = [
        {"label": "과제 수", "value": len(projects), "unit": "건", "tone": "neutral"},
        {"label": "평균 진척률", "value": round(mean(p["progress_pct"] for p in projects), 1) if projects else 0, "unit": "%", "tone": "neutral"},
        {"label": "지연/위험", "value": len(delayed), "unit": "건", "tone": "bad" if delayed else "good"},
    ]
    notes = []
    if delayed:
        notes.append("지연/위험 과제: " + ", ".join(f"{p['name']}({p['status']})" for p in delayed))
    return {
        "type": "bar",
        "data": data,
        "encoding": {"x": "과제", "y": "진척률", "colorBy": "tone", "unit": "%"},
        "kpis": kpis,
        "notes": notes,
    }


# ------------------------------------------------------------------- 예산 대비 실적
def _budget(projects, today):
    codes = [p["task_code"] for p in projects]
    res = query.get_budget(codes)
    by_code = {r["task_code"]: r for r in res["rows"]}

    # 사업부 단위 집계 (계획 vs 집행)
    agg = {}
    for p in projects:
        b = by_code.get(p["task_code"])
        if not b:
            continue
        a = agg.setdefault(p["division"], {"사업부": p["division"], "계획예산": 0, "집행액": 0})
        a["계획예산"] += b["budget_plan"]
        a["집행액"] += b["budget_actual"]
    data = []
    for a in agg.values():
        a["집행률"] = round(a["집행액"] / a["계획예산"] * 100, 1) if a["계획예산"] else None
        data.append(a)
    data.sort(key=lambda x: x["사업부"])

    tot_plan = sum(a["계획예산"] for a in data)
    tot_act = sum(a["집행액"] for a in data)
    kpis = [
        {"label": "계획예산 합계", "value": tot_plan, "unit": "억원", "tone": "neutral"},
        {"label": "집행액 합계", "value": tot_act, "unit": "억원", "tone": "neutral"},
        {"label": "전체 집행률", "value": round(tot_act / tot_plan * 100, 1) if tot_plan else 0, "unit": "%", "tone": "neutral"},
    ]
    notes = []
    if res["unresolved"]:
        notes.append(
            f"예산 미연계 과제 {len(res['unresolved'])}건 (코드 크로스워크 없음): "
            + ", ".join(res["unresolved"])
        )
    return {
        "type": "grouped_bar",
        "data": data,
        "encoding": {"x": "사업부", "series": ["계획예산", "집행액"], "unit": "억원"},
        "kpis": kpis,
        "notes": notes,
    }


# ------------------------------------------------------------------- 일정/지연
def _schedule(projects, today):
    codes = [p["task_code"] for p in projects]
    name_of = {p["task_code"]: p["name"] for p in projects}
    ms = query.get_milestones(codes, today=today)

    data = [{
        "과제": name_of.get(m["task_code"], m["task_code"]),
        "게이트": m["gate"],
        "계획일": m["planned_date"],
        "실적일": m["actual_date"],
        "지연일": m["delay_days"],
        "상태": m["state"],
        "tone": {"완료": "good", "예정": "muted", "지연중": "bad", "지연완료": "warn"}[m["state"]],
    } for m in ms]

    late = [d for d in data if d["상태"] in ("지연중", "지연완료")]
    worst = max(late, key=lambda x: x["지연일"] or 0) if late else None
    kpis = [
        {"label": "마일스톤 수", "value": len(data), "unit": "개", "tone": "neutral"},
        {"label": "지연 게이트", "value": len(late), "unit": "개", "tone": "bad" if late else "good"},
        {"label": "최대 지연", "value": (worst["지연일"] if worst else 0), "unit": "일",
         "tone": "bad" if worst else "good"},
    ]
    notes = []
    if worst:
        notes.append(f"최대 지연: {worst['과제']} · {worst['게이트']} ({worst['지연일']}일)")
    return {
        "type": "gantt",
        "data": data,
        "encoding": {"row": "과제", "gate": "게이트", "plan": "계획일", "actual": "실적일", "colorBy": "tone"},
        "columns": ["과제", "게이트", "계획일", "실적일", "지연일", "상태"],
        "kpis": kpis,
        "notes": notes,
    }
