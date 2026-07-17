"""
PM 에이전트 오케스트레이션.

    ask("메모리 사업부 진척 어때?")
      → interpret (자연어→plan)
      → chartspec.build (조회+통합+집계→Chart Spec)
      → 한국어 요약 + 가정 명시

반환: {"reply": str, "chartSpec": {...}, "assumptions": [str, ...]}
"""
from . import chartspec, interpret, query


def ask(text: str, today: str = query.DEFAULT_TODAY) -> dict:
    plan = interpret.interpret(text)
    spec = chartspec.build(plan, today=today)
    return {
        "reply": _summarize(text, spec),
        "chartSpec": spec,
        "assumptions": _assumptions(plan, spec),
    }


def _summarize(text: str, spec: dict) -> str:
    kpi_str = " · ".join(f"{k['label']} {k['value']}{k['unit']}" for k in spec.get("kpis", []))
    head = f"[{spec['title']}] {kpi_str}"
    notes = spec.get("notes", [])
    return head + ("\n" + "\n".join(f"  - {n}" for n in notes) if notes else "")


def _assumptions(plan: dict, spec: dict) -> list[str]:
    out = [f"의도(intent)를 '{plan['intent']}'로 해석 (해석 엔진: {plan.get('_engine')})"]
    f = spec["meta"]["filters"]
    out.append("적용 필터: " + (", ".join(f"{k}={v}" for k, v in f.items()) if f else "없음(전사)"))
    out.append("데이터 출처: " + ", ".join(spec["meta"]["sources"]))
    return out
