"""
LLM 게이트웨이 클라이언트 (stdlib urllib만 사용).

폐쇄망 운영에서는 사내 LLM 게이트웨이(baseURL + token)를 통해 호출한다.
게이트웨이가 OpenAI 호환(/chat/completions, function calling)이든
Anthropic 호환(/messages, tool_use)이든 env로 스위치. 개발env2에서는
공개 Anthropic API를 그대로 쓸 수도 있다.

설정 (환경변수):
  PM_AGENT_LLM_BASE_URL   예) https://llm-gw.corp.local/v1   (있으면 게이트웨이 모드)
  PM_AGENT_LLM_TOKEN      Bearer 토큰
  PM_AGENT_LLM_API        "openai" (기본) | "anthropic"
  PM_AGENT_MODEL          모델 id (예: claude-sonnet-5)

호출부(interpret.py)는 build_query_plan 도구 스키마를 넘기고, 검증된 plan
dict(input)만 돌려받는다. 어떤 프로토콜을 썼는지는 몰라도 된다.
"""
import json
import os
import urllib.request

TIMEOUT = 30


def _post(url: str, headers: dict, body: dict) -> dict:
    req = urllib.request.Request(
        url, data=json.dumps(body).encode("utf-8"), headers=headers, method="POST"
    )
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read())


def call_plan(cfg: dict, system: str, tool: dict, user_text: str) -> dict:
    """
    LLM에게 tool(=build_query_plan) 호출을 강제해 plan dict를 얻는다.
    실패 시 예외를 던진다(상위에서 규칙 기반으로 폴백).
    """
    base = cfg["base"].rstrip("/")
    model = cfg["model"]
    if cfg["api"] == "anthropic":
        headers = {"content-type": "application/json", "anthropic-version": "2023-06-01"}
        if cfg.get("auth") == "x-api-key":
            headers["x-api-key"] = cfg["token"]
        else:
            headers["authorization"] = f"Bearer {cfg['token']}"
        body = {
            "model": model, "max_tokens": 1024, "system": system,
            "tools": [tool],
            "tool_choice": {"type": "tool", "name": tool["name"]},
            "messages": [{"role": "user", "content": user_text}],
        }
        data = _post(f"{base}/messages", headers, body)
        for block in data.get("content", []):
            if block.get("type") == "tool_use":
                return block["input"]
        raise RuntimeError("anthropic: no tool_use block")

    # ---- OpenAI 호환 (기본): 대부분의 사내 게이트웨이가 이 형태 ----
    headers = {"content-type": "application/json", "authorization": f"Bearer {cfg['token']}"}
    body = {
        "model": model,
        "messages": [{"role": "system", "content": system}, {"role": "user", "content": user_text}],
        "tools": [{"type": "function", "function": tool}],
        "tool_choice": {"type": "function", "function": {"name": tool["name"]}},
    }
    data = _post(f"{base}/chat/completions", headers, body)
    calls = data["choices"][0]["message"].get("tool_calls") or []
    if not calls:
        raise RuntimeError("openai: no tool_calls")
    return json.loads(calls[0]["function"]["arguments"])


def config_from_env() -> dict | None:
    """환경변수에서 LLM 설정을 조립. 없으면 None(=규칙 기반 사용)."""
    model = os.environ.get("PM_AGENT_MODEL", "claude-sonnet-5")
    if os.environ.get("PM_AGENT_LLM_BASE_URL"):  # 사내 게이트웨이 (폐쇄망 운영)
        return {
            "base": os.environ["PM_AGENT_LLM_BASE_URL"],
            "token": os.environ.get("PM_AGENT_LLM_TOKEN", ""),
            "api": os.environ.get("PM_AGENT_LLM_API", "openai").lower(),
            "model": model, "auth": "bearer", "label": "gateway",
        }
    if os.environ.get("ANTHROPIC_API_KEY"):       # 공개 Anthropic API (개발env2)
        return {
            "base": "https://api.anthropic.com/v1",
            "token": os.environ["ANTHROPIC_API_KEY"],
            "api": "anthropic", "model": model, "auth": "x-api-key", "label": "anthropic",
        }
    return None
