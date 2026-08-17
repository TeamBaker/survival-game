// Scratch harness: pulls the fillet geometry out of index.html and runs it over a
// synthetic heightfield so the emitted surface can be inspected numerically.
import fs from 'fs';

const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8').split('\n');
function slice(a, b) { return src.slice(a - 1, b).join('\n'); }

const BLOCK = 0.2, GEN_N = 32, GEN_R = GEN_N * BLOCK / 2, VOX_FLOOR = -40;

// heightfield, set per test
let H = () => 0;

function filletSolid(i, j, l) {
  if (l < VOX_FLOOR) return true;
  if (i < 0 || j < 0 || i >= GEN_N || j >= GEN_N) return false;
  return l <= H(i, j);
}

const consts = slice(1816, 1854);
const body = slice(1873, 2186);

const mod = new Function('BLOCK', 'GEN_N', 'GEN_R', 'VOX_FLOOR', 'filletSolid', `
${consts}
${body}
function filletCellColor(i, j, l, out) { out[0] = out[1] = out[2] = 0.5; }
return { filletFace, filletEdge, filletRun, fpPos, fpNor, fpIdx, FDIR, FFRAME, FILLET_SUB };
`)(BLOCK, GEN_N, GEN_R, VOX_FLOOR, filletSolid);

export function build(h, i0, i1, j0, j1) {
  H = h;
  mod.fpPos.length = mod.fpNor.length = mod.fpIdx.length = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) {
    for (let l = h(i, j); l >= h(i, j) - 3; l--) {
      if (!filletSolid(i, j, l)) continue;
      for (let d = 0; d < 6; d++) {
        const g = mod.FDIR[d];
        if (!filletSolid(i + g.di, j + g.dj, l + g.dl)) mod.filletFace(i, j, l, d);
      }
    }
  }
  return { pos: mod.fpPos.slice(), nor: mod.fpNor.slice(), idx: mod.fpIdx.slice() };
}
export { mod, BLOCK, GEN_R, filletSolid };
export function setH(h) { H = h; }
