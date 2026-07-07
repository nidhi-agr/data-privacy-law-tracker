#!/usr/bin/env python3
"""Serve the site locally for preview, mirroring the Pages layout.

The deployed site serves site/ at the root with data/ copied to /data.
This server maps both without copying.

Usage: python tools/serve_local.py [port]
"""
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class Handler(SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        if path.startswith("/data/"):
            return str(ROOT / path.lstrip("/"))
        rel = path.lstrip("/") or "index.html"
        return str(ROOT / "site" / rel)


def main():
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8000
    server = ThreadingHTTPServer(("127.0.0.1", port), partial(Handler))
    print(f"Serving at http://127.0.0.1:{port}/ (Ctrl+C to stop)")
    server.serve_forever()


if __name__ == "__main__":
    main()
