"""
과제코드 resolution.

두 시스템의 코드 체계가 달라 직접 조인이 불가능하다:
  과제관리   task_code = 'TP-25-MEM-001'
  경영시스템 mgmt_code = 'FY25-1001'

code-crosswalk.csv가 이 둘을 잇는다. 매핑이 없는 과제(예: 신규/외주)는
'미해소(unresolved)'로 분류해서 조용히 버리지 않고 명시적으로 보고한다.

실배포에서 크로스워크가 자체 테이블로 있으면 이 로더만 DB 조회로 교체.
"""
import csv
from functools import lru_cache
from pathlib import Path

from . import catalog

CATALOG_DIR = Path(__file__).resolve().parent.parent / "catalog"


@lru_cache(maxsize=1)
def _crosswalk() -> dict:
    mapping = {}
    with open(CATALOG_DIR / "code-crosswalk.csv", encoding="utf-8") as f:
        for row in csv.DictReader(f):
            if row.get("task_code") and row.get("mgmt_code"):
                mapping[row["task_code"]] = row["mgmt_code"]
    return mapping


def to_mgmt_code(task_code: str) -> str | None:
    """과제코드 → 경영시스템 코드. 매핑 없으면 None."""
    return _crosswalk().get(task_code)


def resolve_codes(task_codes: list[str]) -> tuple[dict, list[str]]:
    """
    task_codes 리스트를 mgmt_code로 변환.
    반환: (resolved: {task_code: mgmt_code}, unresolved: [task_code, ...])
    """
    resolved, unresolved = {}, []
    for tc in task_codes:
        mc = to_mgmt_code(tc)
        if mc:
            resolved[tc] = mc
        else:
            unresolved.append(tc)
    return resolved, unresolved


def division_to_code(division: str) -> str | None:
    """과제관리 사업부(한글) → 경영시스템 사업부코드."""
    return catalog.division_map().get(division)
