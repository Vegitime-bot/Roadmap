#!/usr/bin/env python3
"""
CLI: 자연어를 넣으면 Chart Spec + 터미널 미리보기를 출력한다.

    python3 ask.py "메모리 사업부 진척 현황 보여줘"
    python3 ask.py "예산 대비 집행 실적"
    python3 ask.py "지연되고 있는 일정 알려줘"

--json  : Chart Spec JSON만 출력 (파이프/렌더러 연동용)
--save  : out/<intent>.json 으로 저장
"""
import json
import sys

from pm_agent import ask as agent_ask

BARS = "▁▂▃▄▅▆▇█"
TONE_MARK = {"good": "🟢", "warn": "🟡", "bad": "🔴", "muted": "⚪", "neutral": "▪"}


def _bar(pct, width=24):
    filled = int(round(pct / 100 * width))
    return "█" * filled + "░" * (width - filled)


def _preview(spec):
    print(f"\n── {spec['title']}  ({spec['type']}) " + "─" * 20)
    for k in spec.get("kpis", []):
        print(f"   {TONE_MARK.get(k['tone'], '▪')} {k['label']}: {k['value']}{k['unit']}")
    print()

    t = spec["type"]
    if t == "bar":
        for r in spec["data"]:
            print(f"   {TONE_MARK.get(r['tone'],'▪')} {r['과제'][:18]:<18} {_bar(r['진척률'])} {r['진척률']}%  [{r['상태']}]")
    elif t == "grouped_bar":
        mx = max((r["계획예산"] for r in spec["data"]), default=1)
        for r in spec["data"]:
            p = "█" * int(r["계획예산"] / mx * 20)
            a = "█" * int(r["집행액"] / mx * 20)
            print(f"   {r['사업부']:<10} 계획 {p:<20} {r['계획예산']}억")
            print(f"   {'':<10} 집행 {a:<20} {r['집행액']}억  (집행률 {r['집행률']}%)")
    elif t == "gantt":
        for r in spec["data"]:
            d = f"{r['지연일']:+}일" if r["지연일"] is not None else "-"
            print(f"   {TONE_MARK.get(r['tone'],'▪')} {r['과제'][:16]:<16} {r['게이트']:<6} 계획 {r['계획일']}  실적 {r['실적일'] or '-':<10} {d:>7} [{r['상태']}]")

    for n in spec.get("notes", []):
        print(f"\n   ⚠ {n}")
    print()


def main():
    args = [a for a in sys.argv[1:] if not a.startswith("--")]
    flags = {a for a in sys.argv[1:] if a.startswith("--")}
    if not args:
        print(__doc__)
        sys.exit(1)
    text = " ".join(args)
    result = agent_ask(text)

    if "--json" in flags:
        print(json.dumps(result["chartSpec"], ensure_ascii=False, indent=2))
        return

    print(f"\n💬 질문: {text}")
    print(f"🤖 {result['reply']}")
    _preview(result["chartSpec"])
    print("가정:")
    for a in result["assumptions"]:
        print(f"  · {a}")

    if "--save" in flags:
        from pathlib import Path
        out = Path(__file__).parent / "out" / f"{result['chartSpec']['meta']['intent']}.json"
        out.write_text(json.dumps(result["chartSpec"], ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"\n💾 저장: {out}")


if __name__ == "__main__":
    main()
