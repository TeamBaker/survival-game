// Scratch: renders the fillet skin over the real island heightfield to a PNG,
// entirely in node, so the mesh can be looked at without a browser.
import fs from 'fs';
import zlib from 'zlib';

const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8').split('\n');
const slice = (a, b) => src.slice(a - 1, b).join('\n');

const BLOCK = 0.2, GEN_R = 96, GEN_N = Math.round(2 * GEN_R / BLOCK), VOX_FLOOR = Math.round(-24 / BLOCK);
const ISLAND_R = 52, ISLAND_PEAK = 12.0, SEABED_DEPTH = 16, SEED = 12345;

// terrain: smooth(1165) + noise(1272-1301) + shore consts/islandHeight(1304-1378)
const terr = new Function('SEED', 'ISLAND_R', 'ISLAND_PEAK', 'SEABED_DEPTH', `
${slice(1165, 1165)}
${slice(1302, 1302)}
${slice(1272, 1301)}
${slice(1304, 1378)}
return { islandHeight };
`)(SEED, ISLAND_R, ISLAND_PEAK, SEABED_DEPTH);

const colX = (i) => -GEN_R + (i + 0.5) * BLOCK;
const colZ = (j) => -GEN_R + (j + 0.5) * BLOCK;

// heightfield cache over the window we render
const cache = new Map();
function topOf(i, j) {
  const k = j * GEN_N + i;
  let v = cache.get(k);
  if (v === undefined) { v = Math.floor(terr.islandHeight(colX(i), colZ(j)) / BLOCK); cache.set(k, v); }
  return v;
}
function filletSolid(i, j, l) {
  if (l < VOX_FLOOR) return true;
  if (i < 0 || j < 0 || i >= GEN_N || j >= GEN_N) return false;
  return l <= topOf(i, j);
}

const stubs = `
const NO_COLUMN = -1e9, AIR = 0;
const anyOf = v => new Proxy({}, { get: () => v });
const topMat = anyOf(0), topLvl = anyOf(NO_COLUMN), voxMat = anyOf(AIR), voxOff = anyOf(0), tint = anyOf(1);
const TERRAIN_MATS = anyOf({ color: { r: 0.5, g: 0.5, b: 0.5 } });
function voxCap() { return 0; }
`;
const mod = new Function('BLOCK', 'GEN_N', 'GEN_R', 'VOX_FLOOR', 'filletSolid', `
${stubs}
${slice(1816, 1854)}
${slice(1868, 2186)}
return { filletFace, fpPos, fpNor, fpIdx, FDIR };
`)(BLOCK, GEN_N, GEN_R, VOX_FLOOR, filletSolid);

export function buildPatch(i0, i1, j0, j1) {
  mod.fpPos.length = mod.fpNor.length = mod.fpIdx.length = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    const t = topOf(i, j);
    for (let l = t; l >= t - 4; l--) {
      if (!filletSolid(i, j, l)) continue;
      for (let d = 0; d < 6; d++) {
        const g = mod.FDIR[d];
        if (!filletSolid(i + g.di, j + g.dj, l + g.dl)) mod.filletFace(i, j, l, d);
      }
    }
  }
  return { pos: mod.fpPos, nor: mod.fpNor, idx: mod.fpIdx };
}

// ---- tiny rasterizer ----
export function render(mesh, cam, W, H, file, flat) {
  const { pos, nor, idx } = mesh;
  const zbuf = new Float32Array(W * H).fill(Infinity);
  const rgb = new Uint8Array(W * H * 3);
  // camera basis
  const [ex, ey, ez] = cam.eye, [tx, ty, tz] = cam.target;
  let fx = tx - ex, fy = ty - ey, fz = tz - ez;
  let fl = Math.hypot(fx, fy, fz); fx /= fl; fy /= fl; fz /= fl;
  let rx = fz * 0 - fy * 0, ry = 0, rz = 0;
  // right = normalize(cross(f, up)), up=(0,1,0)
  rx = fz; ry = 0; rz = -fx; const rl = Math.hypot(rx, rz) || 1; rx /= rl; rz /= rl;
  // up = cross(right, f)
  const ux = ry * fz - rz * fy, uy = rz * fx - rx * fz, uz = rx * fy - ry * fx;
  const scale = (H / 2) / Math.tan(cam.fov * Math.PI / 360);
  const L = cam.light || [0.55, 0.45, 0.70]; const LL = Math.hypot(L[0],L[1],L[2]);
  const lx = L[0]/LL, ly = L[1]/LL, lz = L[2]/LL;

  const P = new Float32Array(pos.length);
  for (let v = 0; v < pos.length; v += 3) {
    const dx = pos[v] - ex, dy = pos[v + 1] - ey, dz = pos[v + 2] - ez;
    const cz = dx * fx + dy * fy + dz * fz;
    const cx = dx * rx + dy * ry + dz * rz;
    const cy = dx * ux + dy * uy + dz * uz;
    P[v] = W / 2 + scale * cx / cz; P[v + 1] = H / 2 - scale * cy / cz; P[v + 2] = cz;
  }
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    if (P[a + 2] <= 0.01 || P[b + 2] <= 0.01 || P[c + 2] <= 0.01) continue;
    const x0 = P[a], y0 = P[a + 1], x1 = P[b], y1 = P[b + 1], x2 = P[c], y2 = P[c + 1];
    const area = (x1 - x0) * (y2 - y0) - (x2 - x0) * (y1 - y0);
    if (Math.abs(area) < 1e-12) continue;
    const minx = Math.max(0, Math.floor(Math.min(x0, x1, x2))), maxx = Math.min(W - 1, Math.ceil(Math.max(x0, x1, x2)));
    const miny = Math.max(0, Math.floor(Math.min(y0, y1, y2))), maxy = Math.min(H - 1, Math.ceil(Math.max(y0, y1, y2)));
    for (let y = miny; y <= maxy; y++) for (let x = minx; x <= maxx; x++) {
      const px = x + 0.5, py = y + 0.5;
      let w0 = ((x1 - px) * (y2 - py) - (x2 - px) * (y1 - py)) / area;
      let w1 = ((x2 - px) * (y0 - py) - (x0 - px) * (y2 - py)) / area;
      let w2 = 1 - w0 - w1;
      if (w0 < 0 || w1 < 0 || w2 < 0) continue;
      const z = w0 * P[a + 2] + w1 * P[b + 2] + w2 * P[c + 2];
      const o = y * W + x;
      if (z >= zbuf[o]) continue;
      zbuf[o] = z;
      let nx, ny, nz;
      if (flat) {
        const ax = pos[b] - pos[a], ay = pos[b+1] - pos[a+1], az = pos[b+2] - pos[a+2];
        const bx = pos[c] - pos[a], by = pos[c+1] - pos[a+1], bz = pos[c+2] - pos[a+2];
        nx = ay * bz - az * by; ny = az * bx - ax * bz; nz = ax * by - ay * bx;
      } else {
        nx = w0 * nor[a] + w1 * nor[b] + w2 * nor[c];
        ny = w0 * nor[a + 1] + w1 * nor[b + 1] + w2 * nor[c + 1];
        nz = w0 * nor[a + 2] + w1 * nor[b + 2] + w2 * nor[c + 2];
      }
      const nl = Math.hypot(nx, ny, nz) || 1;
      nx /= nl; ny /= nl; nz /= nl;
      if (cam.mode === 'normal') {
        rgb[o*3] = Math.round(127.5*(nx+1)); rgb[o*3+1] = Math.round(127.5*(ny+1)); rgb[o*3+2] = Math.round(127.5*(nz+1));
      } else {
        let dif = nx * lx + ny * ly + nz * lz;
        dif = 0.10 + 0.90 * Math.max(0, dif);
        const v = Math.min(255, Math.round(255 * Math.pow(dif, 1 / 2.2)));
        rgb[o * 3] = v; rgb[o * 3 + 1] = v; rgb[o * 3 + 2] = v;
      }
    }
  }
  writePNG(file, W, H, rgb);
}

function writePNG(file, W, H, rgb) {
  const raw = Buffer.alloc((W * 3 + 1) * H);
  for (let y = 0; y < H; y++) {
    raw[y * (W * 3 + 1)] = 0;
    rgb.subarray(y * W * 3, (y + 1) * W * 3).forEach((v, i) => { raw[y * (W * 3 + 1) + 1 + i] = v; });
  }
  const chunks = [];
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const td = Buffer.concat([Buffer.from(type), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td) >>> 0);
    chunks.push(len, td, crc);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2;
  chunk('IHDR', ihdr); chunk('IDAT', zlib.deflateSync(raw)); chunk('IEND', Buffer.alloc(0));
  fs.writeFileSync(file, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), ...chunks]));
}
let T = null;
function crc32(buf) {
  if (!T) { T = new Int32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; T[n] = c; } }
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = T[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}
export { topOf, colX, colZ, BLOCK, GEN_N };
