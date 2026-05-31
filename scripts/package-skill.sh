#!/usr/bin/env bash
# roadmap-recipe.skill 패키징 스크립트
# 실행: bash scripts/package-skill.sh
set -euo pipefail

SKILL_NAME="roadmap-recipe"
OUT_FILE="${SKILL_NAME}.skill"
STAGING="/tmp/${SKILL_NAME}-staging/${SKILL_NAME}"

echo "▶ 스테이징 디렉토리 준비..."
rm -rf "/tmp/${SKILL_NAME}-staging"
mkdir -p "$STAGING"

echo "▶ 파일 복사..."
cp SKILL.md "$STAGING/"
cp -r reference "$STAGING/"
cp -r examples  "$STAGING/"

echo "▶ ZIP 패키징 → ${OUT_FILE}"
(cd "/tmp/${SKILL_NAME}-staging" && zip -r - "${SKILL_NAME}") > "$OUT_FILE"

echo "✅ 완료: ${OUT_FILE} ($(du -sh "$OUT_FILE" | cut -f1))"
