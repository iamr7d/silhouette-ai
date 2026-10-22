"""Serve Silhouette.ai locally without browser caching, so edits show on reload.

Run from this folder:  python serve.py   (then open http://localhost:8765)
"""
import functools
import http.server
from pathlib import Path


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()


if __name__ == "__main__":
    handler = functools.partial(NoCacheHandler, directory=str(Path(__file__).parent))
    http.server.ThreadingHTTPServer(("localhost", 8765), handler).serve_forever()
