from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from urllib.parse import urlsplit, parse_qs
import hashlib
import os

# Caching policy (matches server.js):
#  - lib/*.js and lib/*.js.gz requested with ?v=<content hash> that matches the
#    files on disk: cached for a year, immutable. A new library means a new hash
#    in index.html, so a new URL.
#  - Everything else (index.html above all): no-cache. The browser keeps its
#    copy but revalidates every load; an unchanged file costs a 304.
#    The ETag uses the nanosecond mtime, so an edit is seen even within the
#    same second (Last-Modified alone only has 1-second resolution).
IMMUTABLE = 'public, max-age=31536000, immutable'
REVALIDATE = 'no-cache'

_hashes = {}

def lib_hash(path):
    """Short sha256 of X.js + X.js.gz, memoised on their mtimes."""
    base = path[:-3] if path.endswith('.gz') else path
    parts = [base, base + '.gz']
    key = tuple((p, os.stat(p).st_mtime_ns) if os.path.exists(p) else (p, None) for p in parts)
    if _hashes.get(base, (None,))[0] != key:
        h = hashlib.sha256()
        for p in parts:
            if os.path.exists(p):
                with open(p, 'rb') as f:
                    h.update(f.read())
        _hashes[base] = (key, h.hexdigest()[:12])
    return _hashes[base][1]


class CustomHandler(SimpleHTTPRequestHandler):
    def send_head(self):
        self._cache = REVALIDATE
        self._etag = None
        path = self.translate_path(self.path)
        if os.path.isdir(path):
            path = os.path.join(path, 'index.html')
        if os.path.isfile(path):
            st = os.stat(path)
            self._etag = '"%x-%x"' % (st.st_mtime_ns, st.st_size)
            v = parse_qs(urlsplit(self.path).query).get('v', [None])[0]
            if v and path.endswith(('.js', '.js.gz')) and v == lib_hash(path):
                self._cache = IMMUTABLE
            if self._etag in self.headers.get('If-None-Match', ''):
                self.send_response(304)
                self.end_headers()
                return None
        return super().send_head()

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Cache-Control', getattr(self, '_cache', REVALIDATE))
        if getattr(self, '_etag', None):
            self.send_header('ETag', self._etag)
        super().end_headers()

# Set the directory path to serve
os.chdir("/home/imebored/survival-game/web") # Make sure this points to your game's web directory

httpd = ThreadingHTTPServer(('0.0.0.0', 8081), CustomHandler)
print("Serving on port 8081...")
httpd.serve_forever()
