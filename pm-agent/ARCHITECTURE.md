# PM 에이전트 — 아키텍처

## 목표

사내 **과제관리 시스템**(PostgreSQL)과 **경영시스템**(PostgreSQL)을 연계해,
자연어 질문을 **즉시 시각화**로 답하는 PM 에이전트.

시각화 종류(진척/예산/일정/…, 향후 로드맵 포함)는 바뀔 수 있으므로, 코어는
시각화가 아니라 **데이터 통합 + 에이전트 추론**에 둔다. 시각화는 교체 가능한 얇은 어댑터.

## 3계층

```
┌─ ① 데이터 통합 레이어 (코어) ───────────────────────────────┐
│  과제관리 PG + 경영시스템 PG                                  │
│   · datasource : 물리적 조회 (실배포=psycopg, 지금=JSON)     │
│   · resolver   : 과제코드/사업부 resolution (크로스워크)     │
│   · catalog    : 개념↔테이블/컬럼 매핑 + enums(그라운딩)     │
│   · query      : 개념 단위 조회 + 두 시스템 조인 + 파생값    │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─ ② 에이전트 레이어 ─────────────────────────────────────────┐
│   · interpret : 자연어 → query plan (intent + filters)       │
│                 Claude tool-use ↔ 규칙 폴백 (동일 스키마)    │
│   · chartspec : plan → 조회 → 범용 ChartSpec                 │
│   · agent     : 오케스트레이션 + 한국어 요약 + 가정 명시     │
└──────────────────┬───────────────────────────────────────────┘
                   ▼
┌─ ③ 시각화 어댑터 (교체 가능) ───────────────────────────────┐
│   ChartSpec(JSON) → 렌더러                                    │
│   지금: renderer.html / 나중: 사내 뷰어·Recharts·Vega 등      │
└───────────────────────────────────────────────────────────────┘
```

## 왜 이렇게 나눴나

**LLM에게 시각화 데이터를 직접 생성시키지 않는다.** LLM(또는 규칙 폴백)은 오직
"무엇을·어떤 필터로·어떤 차트로" 만 정하고(=query plan), 실제 숫자는 결정론적
조회/집계(`query.py` → `chartspec.py`)가 만든다. 이렇게 하면:

- **환각 방지** — 없는 과제/날짜/금액이 만들어지지 않는다.
- **재현성** — 같은 질문 = 같은 결과 (테스트 가능).
- **안전성** — LLM이 raw SQL을 DB에 직접 던지지 않는다. 카탈로그가 허용한 조회만.

## 두 시스템 통합의 핵심: 과제코드 resolution

두 시스템은 코드 체계가 다르다:

```
과제관리   task_code = 'TP-25-MEM-001'
경영시스템 mgmt_code = 'FY25-1001'        (사업부도 코드: MEM/SLSI/FND)
```

`catalog/code-crosswalk.csv`가 이 둘을 잇는다. `resolver.resolve_codes`는
매핑된 것과 **미해소(unresolved)**를 함께 반환하고, 미해소는 조용히 버리지 않고
차트의 `notes`로 **명시 보고**한다 (예산 뷰에서 "미연계 과제 N건").
사업부 표기 차이는 `division_map`으로 해소.

> 실데이터에서 크로스워크는 보통 자체 테이블/뷰로 존재한다. `resolver._crosswalk`만
> DB 조회로 바꾸면 된다.

## Semantic Layer (concept catalog)

`catalog/concept-catalog.json`이 비즈니스 개념 ↔ 실제 테이블/컬럼을 매핑한다.
에이전트는 raw 스키마가 아니라 이 카탈로그만 본다.

- `concepts` — 과제 / 마일스톤 / 예산 → 어느 시스템·테이블·컬럼인지.
- `resolution` — 코드/사업부 매핑 규칙.
- `enums` — 범주형 컬럼의 **유효값**. LLM 그라운딩에 주입되어 "존재하지 않는 값으로
  필터링"을 원천 차단. 새 개념/컬럼을 여기 추가하면 에이전트가 즉시 활용.

## query plan / ChartSpec 계약

```jsonc
// query plan  (interpret 출력)
{ "intent": "progress|budget|schedule",
  "filters": { "division": [...], "stage": [...], "status": [...] },
  "title": "..." }

// ChartSpec  (chartspec 출력, 렌더러 입력)
{ "type": "bar|grouped_bar|gantt|...",
  "title": "...", "data": [ ... ],
  "encoding": { ... }, "kpis": [ ... ], "notes": [ ... ],
  "meta": { "intent", "engine", "sources", "filters" } }
```

`meta.sources`로 어떤 시스템/테이블을 근거로 했는지, `notes`로 데이터 신뢰성 이슈를
투명하게 노출한다.

## 자연어 해석: 두 경로, 하나의 스키마

- **Claude tool-use** (실배포 기본): `build_query_plan` 도구 스키마로 plan을 강제 생성.
  카탈로그 enums를 system 프롬프트에 주입. `ANTHROPIC_API_KEY` 있으면 자동 사용.
- **규칙 기반 폴백** (오프라인/데모): 키워드 매칭. 실패 시 항상 폴백하므로 데모가 죽지 않음.

두 경로 모두 동일한 plan 스키마를 반환 → 하위 계층은 어느 쪽을 썼는지 모른다
(`plan._engine`에만 기록되어 가정 설명에 노출).

## 실배포 체크리스트

- [ ] `datasource._load_system` → psycopg 연결 2개, **read-only 계정**
- [ ] `resolver._crosswalk` → 크로스워크 테이블 조회 (있는 경우)
- [ ] `ANTHROPIC_API_KEY` / `PM_AGENT_MODEL` 설정 → Claude 경로 활성화
- [ ] `server.py` → FastAPI + **사용자 권한 필터 주입**(볼 수 있는 과제만) + **감사 로그**
- [ ] 카탈로그 `enums`/`concepts`를 실제 스키마에 맞게 갱신 (화이트리스트 = 노출 허용 컬럼)
- [ ] 민감 컬럼(원가/인건비 등)은 카탈로그에서 제외하거나 역할 기반 마스킹

## 향후 확장

- **뷰 추가**: `chartspec.py`에 빌더 함수 + `interpret` intent 추가. 렌더러에 타입 하나 추가.
- **로드맵 뷰**: 사내 로드맵 뷰어를 시각화 어댑터로 연결 (ChartSpec에 `type:"roadmap"` 추가).
- **범용 BI**: intent를 넘어 Text-to-SQL로 확장 시, 카탈로그 기반 쿼리 빌더 + read-only
  샌드박스 + 결과 검증을 이 구조 위에 얹는다.
