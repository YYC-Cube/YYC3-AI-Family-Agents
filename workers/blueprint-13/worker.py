#!/usr/bin/env python3
"""
YYC³ 外部 Worker 参照实现（blueprint-13 · P2-T5/M20）—— 蓝图 13 Python 能力的
最小真实端点：A2A card 发现 + JSON-RPC 任务委托（message/send 与 tasks/send 双方法）。
零第三方依赖（stdlib）；仅绑定回环；令牌经 WORKER_13_TOKEN 环境变量（设置即校验）。
契约对齐：presets/external-worker/worker.yaml.tpl 与 scripts/run-external-uats.mjs 三闸。
"""

import json
import os
import uuid
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PORT = int(os.environ.get("WORKER_PORT", "3130"))
TOKEN = os.environ.get("WORKER_13_TOKEN", "")
SKILLS = ["shared.self-judge", "shared.memory-retrieve", "qianhang.nlq-to-api"]


class Worker(BaseHTTPRequestHandler):
    def _send(self, status, payload):
        body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("content-length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def _authorized(self):
        if not TOKEN:
            return True
        return self.headers.get("authorization") == f"Bearer {TOKEN}"

    def do_GET(self):
        if self.path.rstrip("/") != "/.well-known/agent-card.json":
            self._send(404, {"error": "not found"})
            return
        self._send(200, {
            "agentCard": {
                "name": "蓝图13·外部Worker（Python 参照实现）",
                "description": "以外部家人身份参与 YYC³ 协同的最小真实端点",
                "url": f"http://127.0.0.1:{PORT}",
                "skills": [{"id": s, "type": "skill"} for s in SKILLS],
                "yyc3": {"family": "external", "manifest": "presets/family-manifest.yaml"},
            }
        })

    def do_POST(self):
        if not self._authorized():
            self._send(401, {"error": "unauthorized"})
            return
        length = int(self.headers.get("content-length", "0"))
        try:
            msg = json.loads(self.rfile.read(length) if length else b"{}")
        except ValueError:
            self._send(-32700, None) if False else self._send(400, {"error": "parse error"})
            return
        method = msg.get("method", "")
        msg_id = msg.get("id")
        if method not in ("message/send", "tasks/send"):
            self._send(200, {"jsonrpc": "2.0", "id": msg_id,
                             "error": {"code": -32601, "message": f"Method not found: {method}"}})
            return
        params = msg.get("params", {}) or {}
        skill = params.get("skillId") or params.get("skill") or SKILLS[0]
        # 委托执行（参照语义）：受理即完成，回归一结果 {taskId, state}
        self._send(200, {
            "jsonrpc": "2.0",
            "id": msg_id,
            "result": {
                "taskId": params.get("traceId") or f"task-{uuid.uuid4().hex[:12]}",
                "state": "completed",
                "skillId": skill,
                "artifact": {"summary": f"外部 worker 已按技能 {skill} 完成委托（参照实现）"},
            },
        })

    def log_message(self, fmt, *args):
        print(f"[blueprint-13] {self.command} {self.path} {args[0] if args else ''}")


if __name__ == "__main__":
    print(f"[blueprint-13] 外部 Worker 监听 http://127.0.0.1:{PORT}（令牌：{'启用' if TOKEN else '未设置（回环开放）'}）")
    ThreadingHTTPServer(("127.0.0.1", PORT), Worker).serve_forever()
