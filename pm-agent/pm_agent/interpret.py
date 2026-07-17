"""
자연어 → query plan.

두 가지 경로:
  1) Claude tool-use  — ANTHROPIC_API_KEY 있으면 사용 (실배포 기본)
  2) 규칙 기반 폴백    — 키 없으면 사용 (오프라인 데모/테스트)

두 경로 모두 '동일한 plan 스키마'를 반환하므로 하위 계층은 무엇을 썼는지 모른다.

plan = {
  "intent": "progress" | "budget" | "schedule",
  "filters": {"division": [...]|None, "stage": [...]|None, "status": [...]|None},
  "title": str
}
"""
import os

from . import catalog

INTENTS = ("progress", "budget", "schedule")

# ----- 규칙 기반 키워드 사전 (폴백용)
_INTENT_KEYWORDS = {
    "budget":   ["예산", "집행", "실적", "비용", "원가", "재무", "budget"],
    "schedule": ["일정", "마일스톤", "게이트", "지연", "납기", "스케줄", "schedule"],
    "progress": ["진척", "진행", "상태", "현황", "얼마나", "progress"],
}


def _match_enum_values(text: str, values: list[str]) -> list[str]:
    hits = [v for v in values if v and v in text]
    return hits or None


def rule_based(text: str) -> dict:
    """키워드 매칭으로 plan 생성 (Claude 없이 동작)."""
    en = catalog.enums()

    # intent — '지연'은 schedule/progress 양쪽에 걸쳐 진척보다 일정을 우선
    intent = "progress"
    scores = {k: sum(kw in text for kw in kws) for k, kws in _INTENT_KEYWORDS.items()}
    if any(scores.values()):
        intent = max(scores, key=scores.get)

    filters = {
        "division": _match_enum_values(text, en["division"]),
        "stage":    _match_enum_values(text, en["stage"]),
        "status":   _match_enum_values(text, en["status"]),
    }

    title = _make_title(intent, filters)
    return {"intent": intent, "filters": filters, "title": title, "_engine": "rule_based"}


def _make_title(intent, filters):
    scope = filters.get("division")
    prefix = ("·".join(scope) + " ") if scope else "전사 "
    label = {"progress": "과제 진척/상태", "budget": "예산 대비 실적", "schedule": "일정/지연 현황"}[intent]
    return prefix + label


# ----- Claude tool-use 경로 (실배포)
def _claude(text: str) -> dict:
    """
    ANTHROPIC_API_KEY가 있을 때 Claude에게 plan을 강제된 tool 스키마로 생성시킨다.
    카탈로그의 enums를 그라운딩으로 주입 → 존재하지 않는 값 필터링 방지.
    실패 시 규칙 기반으로 폴백.
    """
    try:
        import json
        import urllib.request

        en = catalog.enums()
        tool = {
            "name": "build_query_plan",
            "description": "사용자 요청을 PM 대시보드 query plan으로 변환한다.",
            "input_schema": {
                "type": "object",
                "properties": {
                    "intent": {"type": "string", "enum": list(INTENTS),
                               "description": "progress=진척/상태, budget=예산대비실적, schedule=일정/지연"},
                    "filters": {
                        "type": "object",
                        "properties": {
                            "division": {"type": ["array", "null"], "items": {"enum": en["division"]}},
                            "stage":    {"type": ["array", "null"], "items": {"enum": en["stage"]}},
                            "status":   {"type": ["array", "null"], "items": {"enum": en["status"]}},
                        },
                    },
                    "title": {"type": "string"},
                },
                "required": ["intent", "filters", "title"],
            },
        }
        system = (
            "너는 사내 PM 에이전트다. 과제관리+경영시스템 RDB를 근거로 답한다. "
            "반드시 build_query_plan 도구만 호출한다. "
            f"유효한 필터 값은 다음뿐이다: {json.dumps(en, ensure_ascii=False)}. "
            "요청에 없는 필터는 null로 둔다."
        )
        body = {
            "model": os.environ.get("PM_AGENT_MODEL", "claude-sonnet-5"),
            "max_tokens": 1024,
            "system": system,
            "tools": [tool],
            "tool_choice": {"type": "tool", "name": "build_query_plan"},
            "messages": [{"role": "user", "content": text}],
        }
        req = urllib.request.Request(
            "https://api.anthropic.com/v1/messages",
            data=json.dumps(body).encode(),
            headers={
                "content-type": "application/json",
                "x-api-key": os.environ["ANTHROPIC_API_KEY"],
                "anthropic-version": "2023-06-01",
            },
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            data = json.loads(resp.read())
        for block in data.get("content", []):
            if block.get("type") == "tool_use":
                plan = block["input"]
                plan.setdefault("filters", {})
                plan["_engine"] = "claude"
                return plan
        raise RuntimeError("no tool_use in response")
    except Exception as e:  # noqa: BLE001 — 데모 견고성: 어떤 실패든 폴백
        plan = rule_based(text)
        plan["_engine"] = f"rule_based (claude 실패: {type(e).__name__})"
        return plan


def interpret(text: str) -> dict:
    if os.environ.get("ANTHROPIC_API_KEY"):
        return _claude(text)
    return rule_based(text)
