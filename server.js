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
//  - game.<hash>.js whose name matches the first 8 hex of its sha256: cached
//    for a year, immutable. An edit means a rename, so a new URL.
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

// True when game.<hash>.js's name matches its content, memoised on mtime.
const gameOk = new Map();
function gameHashOk(file) {
    const m = /[\\/]game\.([0-9a-f]{8})\.js$/.exec(file);
    if (!m) return false;
    const key = fs.statSync(file).mtimeMs;
    const hit = gameOk.get(file);
    if (hit && hit.key === key) return hit.ok;
    const ok = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex').startsWith(m[1]);
    if (!ok) console.warn(`${path.basename(file)}: name does not match its sha256 - rename it`);
    gameOk.set(file, { key, ok });
    return ok;
}

// Serve static files from the web directory
app.use(express.static(WEB, {
    setHeaders(res, file) {
        const v = res.req.query.v;
        const versioned = (v && /\.js(\.gz)?$/.test(file) && v === libHash(file)) || gameHashOk(file);
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
