"""
데이터 접근 계층 (Data Access Layer).

프로토타입: 두 PostgreSQL 시스템을 JSON 파일로 흉내낸다.
실배포: 아래 `_load_system`을 psycopg 연결로 교체하면 나머지 코드는 그대로 동작.

    # 실배포 교체 예시
    import psycopg
    def query(system, sql, params=()):
        with _CONNS[system].cursor(row_factory=dict_row) as cur:
            cur.execute(sql, params)
            return cur.fetchall()

핵심 원칙: 상위 계층(query.py)은 '테이블/컬럼'만 알고, 물리적 저장소는 모른다.
"""
import json
from functools import lru_cache
from pathlib import Path

DATA_DIR = Path(__file__).resolve().parent.parent / "data"

_FILES = {
    "task_mgmt": "task_mgmt.json",
    "mgmt_system": "mgmt_system.json",
}


@lru_cache(maxsize=None)
def _load_system(system: str) -> dict:
    if system not in _FILES:
        raise ValueError(f"unknown system: {system}")
    with open(DATA_DIR / _FILES[system], encoding="utf-8") as f:
        return json.load(f)


def table(system: str, name: str) -> list[dict]:
    """한 테이블의 전체 행을 dict 리스트로 반환 (SELECT * 에 해당)."""
    db = _load_system(system)
    tbl = db["tables"].get(name)
    if tbl is None:
        raise ValueError(f"{system}에 테이블 없음: {name}")
    # 방어적 복사 — 상위에서 수정해도 캐시 원본 보존
    return [dict(r) for r in tbl["rows"]]


def systems() -> dict:
    return {k: _load_system(k)["_meta"]["system"] for k in _FILES}
