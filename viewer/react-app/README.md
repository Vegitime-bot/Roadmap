# Roadmap App

Interactive roadmap viewer built with Vite + React + Tailwind. Renders Recipe
JSON files as interactive SVG charts with lanes, lane groups, page-shared
milestone definitions, zoom, and detail panels.

## 실행

```bash
npm install
npm run dev
```

기본적으로 [http://localhost:5173](http://localhost:5173) 에서 열립니다.

## 프로젝트 구조

```
src/
├── App.jsx                       예제 스위처 + JSON 에디터
├── main.jsx                      React 진입점
├── index.css                     Tailwind 진입
├── components/
│   ├── Roadmap.jsx               메인 차트 컴포넌트 (state + SVG 합성)
│   ├── Toolbar.jsx               컨트롤 바 (lane 토글·필터·줌)
│   ├── MilestoneLegend.jsx       Milestone 정의 범례
│   ├── MonthBar.jsx              월/연도 헤더 (줌 따라 dense/full 자동)
│   ├── GroupHeader.jsx           Lane 그룹 헤더 (collapse 토글)
│   ├── LaneRow.jsx               단일 lane (배경·라벨·tasks)
│   ├── MilestoneLayer.jsx        Milestone 렌더링 (글로벌 + lane-scoped)
│   ├── DetailPanel.jsx           하단 상세 패널
│   └── shapes.jsx                SVG primitives (Star, Diamond, Clip)
├── hooks/
│   └── useZoom.js                줌 state + 키보드 + 휠 (Ctrl+wheel)
├── utils/
│   ├── constants.js              레이아웃·색상 상수
│   ├── dates.js                  날짜 헬퍼
│   ├── milestones.js             definition 해석
│   └── layout.js                 lane 행 packing
└── data/
    ├── recipe-semi-full.json     10년 product roadmap (4 product)
    ├── recipe-semi-1y.json       1년 validation 집중 뷰
    └── recipe-semi-exec.json     5년 executive 뷰 (2 milestone type)
```

## Recipe JSON 구조

`src/data/*.json` 참고. 핵심 필드:

- `milestoneDefinitions[]` — 페이지에서 공유하는 milestone 타입 (`tier: 'detailed' | 'brief'`)
- `milestones[]` — 각 인스턴스 (`definitionId` + `laneId` + `date`)
- `lanes[]` — product/workstream별 lane
- `laneGroups[]` — lane들의 상위 분류 (optional)

## 사용자 인터랙션

- Milestone / Lane / Range bar 클릭 → 하단 상세 패널
- lv1 super-group 헤더 클릭 → 하위 그룹 collapse/expand
- 상단 chip에서 lane 가시성 토글
- 줌: 버튼 / `+` `-` `0` 키 / `Ctrl+휠`

Brief tier milestone은 점으로 표시되지 않고, recipe의 `briefPairs[]`로
정의된 두 endpoint 사이의 lane 내부 range bar로 항상 표시됩니다.

## 새 recipe 추가

1. `src/data/recipe-XXX.json` 생성
2. `src/App.jsx`의 `EXAMPLES` 객체에 추가

JSON 직접 입력은 "JSON 직접 입력" 버튼으로 에디터 열어 붙여넣기.
