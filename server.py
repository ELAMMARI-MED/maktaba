#!/usr/bin/env python3
"""مكتبة — local server (port 8112).

Serves the static SPA in web/ and the generated catalog in data/.
Pure stdlib, no dependencies (Termux friendly).
"""
import gzip
import json
import os
import sys
import threading
import urllib.parse
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

ROOT = os.path.dirname(os.path.abspath(__file__))
WEB = os.path.join(ROOT, 'web')
DATA = os.path.join(ROOT, 'data')
PORT = int(os.environ.get('PORT', '8112'))
HOST = os.environ.get('HOST', '127.0.0.1')

MIME = {
    '.html': 'text/html; charset=utf-8',
    '.js': 'text/javascript; charset=utf-8',
    '.mjs': 'text/javascript; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.svg': 'image/svg+xml',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.ico': 'image/x-icon',
    '.webmanifest': 'application/manifest+json',
    '.woff2': 'font/woff2',
    '.txt': 'text/plain; charset=utf-8',
}

_state = {'catalog_path': os.path.join(DATA, 'catalog.json'), 'catalog': None, 'mtime': 0}
_lock = threading.Lock()


def load_catalog():
    """Return parsed catalog, re-reading when the file changes on disk."""
    p = _state['catalog_path']
    try:
        m = os.path.getmtime(p)
    except OSError:
        return {'generated': None, 'collections': [], 'items': {}, 'total': 0,
                'error': 'catalog.json مفقود — شغّل scripts/build_catalog.py'}
    with _lock:
        if _state['catalog'] is None or m != _state['mtime']:
            with open(p, 'r', encoding='utf-8') as f:
                _state['catalog'] = json.load(f)
            _state['mtime'] = m
        return _state['catalog']


class Handler(BaseHTTPRequestHandler):
    protocol_version = 'HTTP/1.1'
    server_version = 'Maktaba/1.0'

    def log_message(self, fmt, *args):
        sys.stderr.write('%s - %s\n' % (self.address_string(), fmt % args))

    # ---------- helpers ----------
    def _send(self, body, ctype, code=200, cache='no-cache', gzip_ok=True):
        if isinstance(body, str):
            body = body.encode('utf-8')
        headers = [('Content-Type', ctype), ('Cache-Control', cache),
                   ('Access-Control-Allow-Origin', '*')]
        if gzip_ok and len(body) > 1024 and 'gzip' in (self.headers.get('Accept-Encoding') or ''):
            body = gzip.compress(body, 5)
            headers.append(('Content-Encoding', 'gzip'))
        headers.append(('Content-Length', str(len(body))))
        self.send_response(code)
        for k, v in headers:
            self.send_header(k, v)
        self.end_headers()
        if self.command != 'HEAD':
            self.wfile.write(body)

    def _json(self, obj, code=200):
        self._send(json.dumps(obj, ensure_ascii=False), 'application/json; charset=utf-8', code)

    def _static(self, rel):
        path = os.path.normpath(os.path.join(WEB, rel))
        if not path.startswith(WEB) or not os.path.isfile(path):
            self._send('404', 'text/plain; charset=utf-8', 404)
            return
        ext = os.path.splitext(path)[1].lower()
        with open(path, 'rb') as f:
            body = f.read()
        # لا تخزين مؤقّت لملفات الواجهة: أي تعديل يظهر فورًا عند التحميل
        self._send(body, MIME.get(ext, 'application/octet-stream'), cache='no-store')

    # ---------- routes ----------
    def do_GET(self):
        path = self.path.split('?', 1)[0]
        if path in ('/', '/index.html'):
            self._static('index.html')
        elif path == '/api/diag':
            # رسائل تشخيص من المتصفح: تُطبع في سجل السيرفر بدل صفحة فارغة صامتة
            q = self.path.split('?', 1)[1] if '?' in self.path else ''
            msg = ''
            for part in q.split('&'):
                if part.startswith('m='):
                    msg = urllib.parse.unquote_plus(part[2:])
            sys.stderr.write('BROWSER DIAG %s: %s\n' % (self.address_string(), msg[:300]))
            self._json({'ok': True, 'logged': True})
        elif path == '/api/catalog':
            self._json(load_catalog())
        elif path == '/api/health':
            cat = load_catalog()
            self._json({'ok': True, 'port': PORT, 'total': cat.get('total', 0),
                        'collections': len(cat.get('collections', [])),
                        'generated': cat.get('generated')})
        elif path == '/api/stats':
            cat = load_catalog()
            counts = {}
            for it in cat.get('items', {}).values():
                counts[it.get('kind', 'other')] = counts.get(it.get('kind', 'other'), 0) + 1
            self._json({'total': cat.get('total', 0), 'by_kind': counts,
                        'generated': cat.get('generated'),
                        'counters': cat.get('counters', {})})
        else:
            self._static(path.lstrip('/'))

    do_HEAD = do_GET


def main():
    srv = ThreadingHTTPServer((HOST, PORT), Handler)
    cat = load_catalog()
    print(f'مكتبة — http://{HOST}:{PORT}  |  كتب: {cat.get("total", 0)}')
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print('\nstopped')


if __name__ == '__main__':
    main()