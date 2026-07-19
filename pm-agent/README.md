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

## 환경변수 (런타임 설정)

비밀정보/엔드포인트는 코드가 아니라 전부 환경변수로 주입한다.

| 변수 | 용도 | 없을 때 |
|---|---|---|
| `PM_AGENT_LLM_BASE_URL` | 사내 LLM 게이트웨이 baseURL (폐쇄망 운영) | 게이트웨이 미사용 |
| `PM_AGENT_LLM_TOKEN` | 게이트웨이 Bearer 토큰 | — |
| `PM_AGENT_LLM_API` | `openai`(기본) \| `anthropic` — 게이트웨이 프로토콜 | openai |
| `PM_AGENT_LLM_PATH` | 엔드포인트 경로 (게이트웨이마다 다름) | openai=`/chat/completions`, anthropic=`/messages` |
| `PM_AGENT_MODEL` | 모델 id | `claude-sonnet-5` |

> 사내 게이트웨이 예시: `PM_AGENT_LLM_BASE_URL=https://llm-gw.corp.local/llm/v1`,
> `PM_AGENT_LLM_PATH=/chat/completion` (사내는 단수형 `completion`) →
> 최종 호출 `https://llm-gw.corp.local/llm/v1/chat/completion`.
| `ANTHROPIC_API_KEY` | 공개 Anthropic API (개발env2 실험용) | — |
| `PG_TASK_DSN` / `PG_MGMT_DSN` | 두 PostgreSQL read-only 접속 문자열 | sample JSON 사용 |

**자연어 해석 경로 선택 (자동):** `PM_AGENT_LLM_BASE_URL` 있으면 사내 게이트웨이 →
없고 `ANTHROPIC_API_KEY` 있으면 공개 API → 둘 다 없으면 **규칙 기반**. 어떤 경로든
실패 시 규칙 기반으로 폴백하므로 서비스가 죽지 않는다 (사용한 엔진은 응답 `meta.engine`에 표기).

## 폐쇄망 배포 (Docker + jfrog + Jenkins)

- `Dockerfile` — base image·pip를 **jfrog**에서만 받도록 `--build-arg`로 경로 주입.
  v1(규칙 기반)은 외부 의존성 0 → 아주 작은 이미지.
- `requirements.txt` — 실제 PG 연동/FastAPI 승격 시에만 psycopg 등 추가 (jfrog PyPI).
- `Jenkinsfile` — 개발env3에서 build → jfrog registry push → 운영env에서 pull·run.
  비밀정보(PG DSN, LLM 토큰)는 이미지에 굽지 않고 배포 시 env로 주입.

`REPLACE_ME.jfrog.corp.local` 자리에 사내 jfrog 경로를, `credentialsId`에 Jenkins
자격증명 id를 채우면 된다.

## 실배포로 전환하기 (코드 델타)

1. **DB 연결** — `pm_agent/datasource.py`의 `_load_system`을 두 개의 psycopg 연결로 교체
   (`PG_TASK_DSN`/`PG_MGMT_DSN`). 반드시 **read-only 계정**. 테이블/컬럼명 유지 시 상위 무변경.
2. **크로스워크** — 크로스워크가 자체 테이블이면 `resolver._crosswalk`를 DB 조회로 교체.
3. **자연어 해석** — 위 환경변수만 설정하면 자동 활성화 (코드 변경 없음).
4. **API 서버** — `server.py`(stdlib) 자리에 FastAPI + 인증(SSO)/권한 필터/감사 로그를
   얹기. 프런트(`renderer.html`)는 `/chat` 계약이 같으므로 그대로 재사용.

## 핵심 설계 원칙

에이전트는 시각화 **데이터를 지어내지 않는다.** 실제 조회한 값 + "어떤 차트로 그릴지"
(ChartSpec)만 생성하고, 결정론적 조회/집계 계층이 데이터를 만든다. 렌더러는 교체 가능.
