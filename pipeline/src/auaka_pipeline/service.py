"""Small localhost HTTP adapter for the chunk retrieval service."""

from __future__ import annotations

import json
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

from .retrieval import RetrievalError, RetrievalService


def create_search_server(service: RetrievalService, *, host: str = "127.0.0.1", port: int = 8765) -> ThreadingHTTPServer:
    """Create a testable localhost server for ``POST /search``."""
    class SearchHandler(BaseHTTPRequestHandler):
        server_version = "AuakaRetrieval/1"

        def do_POST(self) -> None:  # noqa: N802
            if self.path != "/search":
                self._send_error(404, "NOT_FOUND", "endpoint not found")
                return
            try:
                request = self._read_json()
                query = request.get("query")
                if not isinstance(query, str) or not query.strip():
                    raise ValueError("query must be a non-empty string")
                top_k = request.get("top_k", 5)
                if not isinstance(top_k, int) or isinstance(top_k, bool):
                    raise ValueError("top_k must be an integer")
                min_score = request.get("min_score")
                if min_score is not None and (not isinstance(min_score, (int, float)) or isinstance(min_score, bool)):
                    raise ValueError("min_score must be a number")
                note_id = request.get("note_id")
                if note_id is not None and (not isinstance(note_id, str) or not note_id.strip()):
                    raise ValueError("note_id must be a non-empty string")
                hits = service.search(query, top_k=top_k, min_score=float(min_score) if min_score is not None else None, note_id=note_id)
                self._send_json(200, {"query": query.strip(), "results": [hit.to_dict() for hit in hits]})
            except (ValueError, json.JSONDecodeError) as error:
                self._send_error(400, "VALIDATION_ERROR", str(error))
            except RetrievalError as error:
                self._send_error(500, "RETRIEVAL_ERROR", str(error))

        def do_GET(self) -> None:  # noqa: N802
            self._send_error(405, "METHOD_NOT_ALLOWED", "use POST /search")

        def _read_json(self) -> dict[str, object]:
            try:
                length = int(self.headers.get("Content-Length") or "0")
            except ValueError as error:
                raise ValueError("Content-Length must be an integer") from error
            if length <= 0 or length > 1_000_000:
                raise ValueError("request body must be between 1 byte and 1 MB")
            payload = json.loads(self.rfile.read(length).decode("utf-8"))
            if not isinstance(payload, dict):
                raise ValueError("request body must be a JSON object")
            return payload

        def _send_json(self, status: int, payload: dict[str, object]) -> None:
            body = json.dumps(payload, ensure_ascii=False).encode("utf-8")
            self.send_response(status)
            self.send_header("Content-Type", "application/json; charset=utf-8")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)

        def _send_error(self, status: int, code: str, message: str) -> None:
            self._send_json(status, {"error": {"code": code, "message": message}})

        def log_message(self, format: str, *args: object) -> None:
            del format, args

    class SearchServer(ThreadingHTTPServer):
        allow_reuse_address = True
        daemon_threads = True

    return SearchServer((host, port), SearchHandler)
