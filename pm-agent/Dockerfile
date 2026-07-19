# PM 에이전트 운영 이미지 (폐쇄망).
#
# base image와 pip는 반드시 사내 jfrog(Artifactory)에서 받는다.
# build-arg로 jfrog 경로를 주입 → Jenkins가 값을 채운다.
#
#   docker build \
#     --build-arg JFROG_DOCKER=your-jfrog.corp.local/docker-remote \
#     -t your-jfrog.corp.local/pm-agent:latest ./pm-agent
#
# v1(규칙 기반)은 외부 Python 의존성이 없어 pip 단계 없이 바로 뜬다.
# LLM 게이트웨이/PG 연동도 stdlib(urllib) + psycopg만 필요 → requirements.txt 참고.

ARG JFROG_DOCKER=REPLACE_ME.jfrog.corp.local/docker-remote
FROM ${JFROG_DOCKER}/python:3.11-slim

# jfrog PyPI 리모트 (psycopg 등 추가 의존성 설치 시 사용)
ARG JFROG_PYPI=https://REPLACE_ME.jfrog.corp.local/artifactory/api/pypi/pypi-remote/simple

WORKDIR /app
COPY requirements.txt /app/
RUN if [ -s requirements.txt ]; then \
      pip install --no-cache-dir --index-url "${JFROG_PYPI}" -r requirements.txt ; \
    fi
COPY . /app

# 런타임 설정은 전부 환경변수로 주입 (이미지에 비밀정보 굽지 않음)
#   PG_TASK_DSN / PG_MGMT_DSN         : 두 PostgreSQL read-only 접속 문자열
#   PM_AGENT_LLM_BASE_URL / _TOKEN    : 사내 LLM 게이트웨이 (없으면 규칙 기반)
#   PM_AGENT_LLM_API (openai|anthropic) / PM_AGENT_MODEL
EXPOSE 8000
CMD ["python3", "server.py"]
