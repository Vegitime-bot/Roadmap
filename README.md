# Roadmap

반도체 제품 로드맵을 시각화하는 인터랙티브 뷰어와, 자연어/DB 입력을
Recipe JSON으로 변환하는 Claude Skill 패키지.

## 디렉토리 구조

```
Roadmap/
├── SKILL.md                    # Claude Skill 진입점
├── reference/                  # Skill용 가이드 문서
│   ├── schema.md               # Recipe JSON 스키마
│   ├── template.md             # 도메인별 milestone 템플릿
│   ├── conventions.md          # 색상/그룹핑 컨벤션
│   ├── from-natural-language.md
│   └── from-structured-data.md
├── examples/
│   ├── sample-db.json          # 3-layer DB sample
│   ├── recipe-display.json     # 변환 결과 (lane mode)
│   ├── derived-display-by-lineup.json   # 변환 결과 (range mode)
│   └── db_to_recipe.py         # DB → Recipe 변환 스크립트
└── viewer/
    └── react-app/              # Vite + React + Tailwind 뷰어
        ├── src/
        └── package.json
```

## 빠른 실행 (Viewer)

```bash
cd viewer/react-app
npm install
npm run dev
```

→ `http://localhost:5173`

## DB → Recipe 변환

```bash
python3 examples/db_to_recipe.py examples/sample-db.json /tmp/
```

`/tmp/`에 두 Recipe JSON이 생성됩니다 (`display-full-view`, `display-by-lineup`).

## Skill 패키징

Anthropic skill-creator로:

```bash
python3 -m scripts.package_skill /path/to/Roadmap /path/to/output/
```

또는 그대로 zip:

```bash
cd Roadmap && zip -r ../roadmap-recipe.skill . -x '*/node_modules/*' '*/dist/*'
```

## 핵심 모델

- **Lane** = single-track 가로 영역. 1개 product (lane mode) 또는 1개 line-up (range mode).
- **Lane.rows[]** = range mode에서 lane 안의 항목들 (각자 자체 milestone instance set).
- **milestoneDefinitions** = page 공통 milestone 종류 (K/O, MTO, FS, PVR, PRA, SRA).
  - `tier: 'detailed'` — 점으로 표시
  - `tier: 'brief'` — range bar의 endpoint로만 사용 (점은 표시 안 됨)
- **briefPairs[]** = recipe 공통 페어 정의 (FS-PRA → "Development").
- **laneSuperGroups (lv1)** = 상위 카테고리 (예: Mainstream / Next-Gen).
- **laneGroups (lv2)** = line-up (예: LCD / OLED / Micro-LED Lineup).
- 둘 다 가로 헤더 + chevron 접기.

## Viewer 동작

- 화면 가득 + 양방향 스크롤
- 가로 스크롤 시 좌측 lane 헤더 sticky
- Hover시 같은 row의 range bar/milestone highlight (다른 row는 dimmed)
- Brief milestone은 점으로 안 그리고 lane 내부 range bar로만 표현
- Range bar 시간 겹침 시 자동 vertical stack
- Range bar label = row label (MastCode)

## 라이선스

내부 프로젝트.
