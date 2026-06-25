#!/usr/bin/env python3
"""Local dev server for GreenPath.

Serves the site statically AND proxies POST /api/chat to the OpenAI API,
mirroring netlify/functions/chat.js. The API key is read from .env on the
server side and is NEVER sent to the browser.

Run:  python3 serve.py   ->  http://localhost:8890/index.html
"""
import json
import os
import ssl
import urllib.request
import urllib.error
from http.server import ThreadingHTTPServer, SimpleHTTPRequestHandler

try:
    import certifi
    SSL_CTX = ssl.create_default_context(cafile=certifi.where())
except Exception:  # noqa: BLE001
    SSL_CTX = ssl.create_default_context()

ROOT = os.path.dirname(os.path.abspath(__file__))
PORT = int(os.environ.get("PORT", "8890"))

ALLOWED_MODELS = {"gpt-4o-mini", "gpt-4o"}
DEFAULT_MODEL = "gpt-4o-mini"
ROLES = {"system", "user", "assistant"}
MAX_MESSAGES = 20
MAX_CONTENT_CHARS = 6000
MAX_TOTAL_CHARS = 18000


def load_env(path):
    """Minimal .env loader; does not overwrite existing process env."""
    try:
        with open(path) as fh:
            for line in fh:
                line = line.strip()
                if not line or line.startswith("#") or "=" not in line:
                    continue
                k, v = line.split("=", 1)
                os.environ.setdefault(k.strip(), v.strip().strip('"').strip("'"))
    except FileNotFoundError:
        pass


def clamp_number(value, fallback, lo, hi):
    if isinstance(value, (int, float)) and value == value:  # not NaN
        return min(hi, max(lo, value))
    return fallback


def normalize_messages(messages):
    if not isinstance(messages, list) or not messages or len(messages) > MAX_MESSAGES:
        return None
    total = 0
    out = []
    for m in messages:
        if not isinstance(m, dict) or m.get("role") not in ROLES or not isinstance(m.get("content"), str):
            return None
        content = m["content"][:MAX_CONTENT_CHARS]
        total += len(content)
        if total > MAX_TOTAL_CHARS:
            return None
        out.append({"role": m["role"], "content": content})
    return out


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def _json(self, status, obj):
        body = json.dumps(obj).encode()
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def do_POST(self):
        if self.path.rstrip("/") != "/api/chat":
            self._json(404, {"error": "Not found"})
            return

        key = os.environ.get("OPENAI_API_KEY")
        if not key:
            self._json(500, {"error": "Server missing OPENAI_API_KEY"})
            return

        length = int(self.headers.get("Content-Length", "0") or 0)
        raw = self.rfile.read(length) if length else b"{}"
        try:
            body = json.loads(raw or b"{}")
        except json.JSONDecodeError:
            self._json(400, {"error": "Invalid JSON"})
            return

        messages = normalize_messages(body.get("messages"))
        if messages is None:
            self._json(400, {"error": "Invalid messages"})
            return

        payload = {
            "model": body.get("model") if body.get("model") in ALLOWED_MODELS else DEFAULT_MODEL,
            "messages": messages,
            "max_tokens": int(clamp_number(body.get("max_tokens"), 900, 80, 1200)),
            "temperature": clamp_number(body.get("temperature"), 0.4, 0, 1),
        }

        req = urllib.request.Request(
            "https://api.openai.com/v1/chat/completions",
            data=json.dumps(payload).encode(),
            headers={"Content-Type": "application/json", "Authorization": "Bearer " + key},
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=60, context=SSL_CTX) as r:
                text = r.read()
                self.send_response(r.status)
                self.send_header("Content-Type", "application/json")
                self.send_header("Content-Length", str(len(text)))
                self.end_headers()
                self.wfile.write(text)
        except urllib.error.HTTPError as e:
            text = e.read()
            self.send_response(e.code)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(text)))
            self.end_headers()
            self.wfile.write(text)
        except Exception as e:  # noqa: BLE001
            self._json(502, {"error": "Upstream request failed: " + str(e)})

    def log_message(self, fmt, *args):  # quieter logs; never logs bodies/keys
        pass


if __name__ == "__main__":
    load_env(os.path.join(ROOT, ".env"))
    if not os.environ.get("OPENAI_API_KEY"):
        print("WARNING: OPENAI_API_KEY not found in .env — /api/chat will 500")
    print(f"GreenPath dev server on http://localhost:{PORT}/index.html")
    ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
