#!/usr/bin/env python3
"""
로컬 데모 서버 (의존성 없음, stdlib만).

    python3 server.py        # http://localhost:8000

  GET  /            → renderer.html (챗 + 차트 UI)
  POST /chat {text} → {reply, chartSpec, assumptions}

실배포에서는 이 자리에 FastAPI + 인증/권한/감사로그를 얹고,
datasource를 psycopg로 교체하면 된다. 프런트(renderer)는 그대로 재사용 가능.
"""
import json
from http.server import BaseHTTPRequestHandler, HTTPServer
from pathlib import Path

from pm_agent import ask as agent_ask

HERE = Path(__file__).parent


class Handler(BaseHTTPRequestHandler):
    def _send(self, code, body, ctype="application/json"):
        data = body if isinstance(body, bytes) else body.encode("utf-8")
        self.send_response(code)
        self.send_header("Content-Type", f"{ctype}; charset=utf-8")
        self.send_header("Content-Length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path in ("/", "/index.html"):
            self._send(200, (HERE / "renderer.html").read_bytes(), "text/html")
        else:
            self._send(404, json.dumps({"error": "not found"}))

    def do_POST(self):
        if self.path != "/chat":
            self._send(404, json.dumps({"error": "not found"}))
            return
        n = int(self.headers.get("Content-Length", 0))
        try:
            payload = json.loads(self.rfile.read(n) or b"{}")
            result = agent_ask(payload.get("text", ""))
            self._send(200, json.dumps(result, ensure_ascii=False))
        except Exception as e:  # noqa: BLE001
            self._send(500, json.dumps({"error": str(e)}, ensure_ascii=False))

    def log_message(self, *a):  # 조용히
        pass


if __name__ == "__main__":
    print("PM 에이전트 데모 → http://localhost:8000  (Ctrl+C 종료)")
    HTTPServer(("0.0.0.0", 8000), Handler).serve_forever()
