"""Concept catalog (Semantic Layer) 로더."""
import json
from functools import lru_cache
from pathlib import Path

CATALOG_DIR = Path(__file__).resolve().parent.parent / "catalog"


@lru_cache(maxsize=1)
def load() -> dict:
    with open(CATALOG_DIR / "concept-catalog.json", encoding="utf-8") as f:
        return json.load(f)


def enums() -> dict:
    """범주형 컬럼의 유효값 (에이전트 그라운딩용)."""
    return {k: v for k, v in load()["enums"].items() if not k.startswith("_")}


def division_map() -> dict:
    return {k: v for k, v in load()["resolution"]["division_map"].items() if not k.startswith("_")}
