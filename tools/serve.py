"""Local dev server that never lets the browser cache files, so every reload runs the latest code.

Serves the project root, plus public/ at the site root (like Vite does), so /data/map/index.json works in both.
"""
import http.server
import os
import sys


class NoCache(http.server.SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-store, must-revalidate')
        self.send_header('Expires', '0')
        super().end_headers()

    def translate_path(self, path):
        p = super().translate_path(path)
        if not os.path.exists(p):
            alt = super().translate_path('/public' + path)
            if os.path.exists(alt):
                return alt
        return p


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
