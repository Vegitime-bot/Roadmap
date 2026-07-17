"""
개념 기반 조회 계층.

에이전트/차트빌더는 raw 테이블이 아니라 이 함수들만 호출한다.
여기서 (1) 필터 적용, (2) 두 시스템 조인, (3) 과제코드 resolution,
(4) 파생값(진척/지연/집행률) 계산을 담당한다.

날짜 비교 기준일(today)은 호출자가 주입한다 — 결정론적 테스트를 위해.
"""
from datetime import date

from . import datasource, resolver

DEFAULT_TODAY = "2026-07-17"


def _parse(d: str | None):
    return date.fromisoformat(d) if d else None


# ---------------------------------------------------------------- 과제 (진척/상태)
def get_projects(division=None, stage=None, status=None) -> list[dict]:
    """
    과제관리.projects 조회 + 필터.
    필터는 문자열 또는 문자열 리스트를 받는다 (None = 전체).
    """
    def _match(val, flt):
        if flt is None:
            return True
        allow = flt if isinstance(flt, (list, tuple, set)) else [flt]
        return val in allow

    rows = datasource.table("task_mgmt", "projects")
    return [
        r for r in rows
        if _match(r["division"], division)
        and _match(r["stage"], stage)
        and _match(r["status"], status)
    ]


# ---------------------------------------------------------------- 일정/지연 (마일스톤)
def get_milestones(task_codes: list[str], today: str = DEFAULT_TODAY) -> list[dict]:
    """
    지정 과제들의 마일스톤 + 지연일 계산.
    delay_days > 0 : 실적이 계획보다 늦음 (완료 게이트 기준).
    아직 미완료이고 계획일이 today보다 과거면 '지연중'으로 표시.
    """
    codes = set(task_codes)
    tdy = _parse(today)
    out = []
    for r in datasource.table("task_mgmt", "milestones"):
        if r["task_code"] not in codes:
            continue
        planned, actual = _parse(r["planned_date"]), _parse(r["actual_date"])
        delay_days, state = None, "예정"
        if actual:
            delay_days = (actual - planned).days
            state = "지연완료" if delay_days > 0 else "완료"
        elif planned and planned < tdy:
            delay_days = (tdy - planned).days
            state = "지연중"
        out.append({**r, "delay_days": delay_days, "state": state})
    return out


# ---------------------------------------------------------------- 예산 (경영시스템 연계)
def get_budget(task_codes: list[str]) -> dict:
    """
    과제코드 → (crosswalk) → mgmt_code → 경영시스템.budget 조인.
    반환: {
      "rows": [ {task_code, mgmt_code, division_code, budget_plan, budget_actual, execution_rate}, ... ],
      "unresolved": [task_code, ...]   # 크로스워크에 없는 과제
    }
    """
    resolved, unresolved = resolver.resolve_codes(task_codes)
    budget_idx = {b["mgmt_code"]: b for b in datasource.table("mgmt_system", "budget")}

    rows = []
    for task_code, mgmt_code in resolved.items():
        b = budget_idx.get(mgmt_code)
        if not b:
            unresolved.append(task_code)  # 매핑은 됐지만 경영시스템에 예산 레코드 없음
            continue
        plan, actual = b["budget_plan"], b["budget_actual"]
        rows.append({
            "task_code": task_code,
            "mgmt_code": mgmt_code,
            "division_code": b["division_code"],
            "budget_plan": plan,
            "budget_actual": actual,
            "execution_rate": round(actual / plan * 100, 1) if plan else None,
        })
    return {"rows": rows, "unresolved": unresolved}
