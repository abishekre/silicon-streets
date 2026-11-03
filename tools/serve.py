"""Local dev server that never lets the browser cache files, so every reload runs the latest code.

Serves the project root, plus public/ at the site root (like Vite does), so /data/map/index.json works in both.
Module workers don't get the page's import map, so JavaScript under /src/ (and three's add-ons) is served with the
import map's bare names ('three', 'three/addons/...') already resolved to their URLs. The Vite build bundles everything instead.
"""
import http.server
import json
import os
import re
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def import_map():
    html = open(os.path.join(ROOT, 'index.html'), encoding='utf-8').read()
    m = re.search(r'<script type="importmap">(.*?)</script>', html, re.S)
    imports = json.loads(m.group(1))['imports'] if m else {}
    # three's add-ons on the CDN import 'three' by bare name themselves, which a worker can't resolve:
    # serve them from node_modules (same version, run `npm install`) through this rewriting instead
    if os.path.isdir(os.path.join(ROOT, 'node_modules', 'three', 'examples', 'jsm')):
        imports['three/addons/'] = '/node_modules/three/examples/jsm/'
    return imports


def resolve(js, imports):
    """Rewrite bare module specifiers (after `from` or in `import(...)`) the way the page's import map would."""
    def sub(m):
        head, q, spec = m.group(1), m.group(2), m.group(3)
        if spec in imports:
            return head + q + imports[spec] + q
        for k, v in imports.items():
            if k.endswith('/') and spec.startswith(k):
                return head + q + v + spec[len(k):] + q
        return m.group(0)
    return re.sub(r"(\bfrom\s*|\bimport\s*\(\s*)(['\"])([^'\"./][^'\"]*)\2", sub, js)


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

    def do_GET(self):
        path = self.path.split('?')[0]
        if (path.startswith('/src/') or path.startswith('/node_modules/three/examples/')) and path.endswith('.js'):
            f = self.translate_path(path)
            if os.path.isfile(f):
                body = resolve(open(f, encoding='utf-8').read(), import_map()).encode('utf-8')
                self.send_response(200)
                self.send_header('Content-Type', 'text/javascript; charset=utf-8')
                self.send_header('Content-Length', str(len(body)))
                self.end_headers()
                self.wfile.write(body)
                return
        super().do_GET()


if __name__ == '__main__':
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 5173
    http.server.ThreadingHTTPServer(('', port), NoCache).serve_forever()
