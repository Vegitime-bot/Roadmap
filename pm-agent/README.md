# PM 에이전트 (프로토타입)

사내 **과제관리 시스템**과 **경영시스템**(둘 다 PostgreSQL) RDB를 연계해,
자연어로 물으면 **즉시 시각화**해 주는 PM 에이전트의 end-to-end 프로토타입.

지금은 sample DB(JSON)로 오프라인 동작하며, 실배포는 자격증명만 꽂으면 되도록 설계.
(설계 상세: [ARCHITECTURE.md](ARCHITECTURE.md))

## 지원하는 질문 (MVP)

| 유형 | 예시 | 출력 |
|---|---|---|
| 진척/상태 | "메모리 사업부 진척 현황" | 과제별 진척 bar + KPI(평균 진척률, 지연/위험) |
| 예산 대비 실적 | "예산 대비 집행 실적" | 사업부별 계획/집행 grouped bar + 집행률 (경영시스템 연계) |
| 일정/지연 | "지연되고 있는 일정" | 마일스톤 계획 vs 실적 + 지연일 테이블 |

필터 조합도 가능: "시스템LSI 개발단계 과제 상태" (사업부 + 단계).

## 빠른 실행

```bash
cd pm-agent

# 1) CLI (브라우저 없이 터미널에서 확인)
python3 ask.py "메모리 사업부 진척 현황"
python3 ask.py "예산 대비 집행 실적"
python3 ask.py "지연되고 있는 일정"
python3 ask.py "예산 실적" --json      # ChartSpec JSON만 출력

# 2) 웹 데모 (챗 + 차트)
python3 server.py                      # → http://localhost:8000
```

의존성 없음(Python 3.11+ stdlib만). 웹 데모도 외부 라이브러리 없이 단일 HTML.

## 구조

```
pm-agent/
├── data/                     ← 두 PG 시스템을 흉내낸 sample (실배포=psycopg 교체)
│   ├── task_mgmt.json          과제관리: projects, milestones
│   └── mgmt_system.json        경영시스템: budget, org
├── catalog/
│   ├── concept-catalog.json    Semantic Layer: 개념↔테이블/컬럼, enums(그라운딩)
│   └── code-crosswalk.csv      과제코드 resolution (task_code ↔ mgmt_code)
├── pm_agent/                  ← 코어 파이프라인
│   ├── datasource.py           데이터 접근 (JSON→실배포 psycopg)
│   ├── resolver.py             과제코드/사업부 resolution, 미해소 명시 보고
│   ├── catalog.py              카탈로그 로더
│   ├── query.py                개념 조회 + 두 시스템 조인 + 파생값 계산
│   ├── interpret.py            자연어→plan (규칙 폴백 + Claude tool-use 스위치)
│   ├── chartspec.py            plan+데이터→범용 ChartSpec
│   └── agent.py                오케스트레이션: ask(text)
├── ask.py                    CLI
├── server.py                 로컬 데모 서버 (stdlib)
└── renderer.html             시각화 어댑터 (교체 가능) + 챗 UI
```

## 실배포로 전환하기

1. **DB 연결** — `pm_agent/datasource.py`의 `_load_system`을 두 개의 psycopg 연결로 교체.
   반드시 **read-only 계정** 사용. 테이블/컬럼명을 유지하면 상위 코드는 무변경.
2. **크로스워크** — 크로스워크가 자체 테이블이면 `resolver._crosswalk`를 DB 조회로 교체.
3. **자연어 해석** — `ANTHROPIC_API_KEY` 환경변수를 설정하면 `interpret`가 자동으로
   Claude tool-use 경로를 사용 (모델은 `PM_AGENT_MODEL`, 기본 `claude-sonnet-5`).
   키가 없으면 규칙 기반으로 동작.
4. **API 서버** — `server.py`(stdlib) 자리에 FastAPI + 인증/권한 필터/감사 로그를 얹기.
   프런트(`renderer.html`)는 `/chat` 계약이 같으므로 그대로 재사용.

## 핵심 설계 원칙

에이전트는 시각화 **데이터를 지어내지 않는다.** 실제 조회한 값 + "어떤 차트로 그릴지"
(ChartSpec)만 생성하고, 결정론적 조회/집계 계층이 데이터를 만든다. 렌더러는 교체 가능.
