const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 8081;
const WEB = path.join(__dirname, 'web');

// Caching policy (matches server.py):
//  - lib/*.js and lib/*.js.gz requested with ?v=<content hash> that matches the
//    files on disk: cached for a year, immutable. A new library means a new hash
//    in index.html, so a new URL.
//  - Everything else (index.html above all): no-cache. The browser keeps its
//    copy but revalidates every load (ETag); an unchanged file costs a 304.
const IMMUTABLE = 'public, max-age=31536000, immutable';
const REVALIDATE = 'no-cache';

// Short sha256 of X.js + X.js.gz, memoised on their mtimes.
const hashes = new Map();
function libHash(file) {
    const base = file.endsWith('.gz') ? file.slice(0, -3) : file;
    const parts = [base, base + '.gz'].filter((p) => fs.existsSync(p));
    const key = parts.map((p) => p + ':' + fs.statSync(p).mtimeMs).join('|');
    const hit = hashes.get(base);
    if (hit && hit.key === key) return hit.hash;
    const h = crypto.createHash('sha256');
    for (const p of parts) h.update(fs.readFileSync(p));
    const hash = h.digest('hex').slice(0, 12);
    hashes.set(base, { key, hash });
    return hash;
}

// Serve static files from the web directory
app.use(express.static(WEB, {
    setHeaders(res, file) {
        const v = res.req.query.v;
        const versioned = v && /\.js(\.gz)?$/.test(file) && v === libHash(file);
        res.setHeader('Cache-Control', versioned ? IMMUTABLE : REVALIDATE);
    },
}));

// Default route
app.get('/', (req, res) => {
    res.setHeader('Cache-Control', REVALIDATE);
    res.sendFile(path.join(WEB, 'index.html'));
});

app.listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});
