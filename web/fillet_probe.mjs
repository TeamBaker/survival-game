// Numeric probe: pulls the fillet geometry out of index.html and runs it over a
// synthetic block field so the emitted surface can be inspected sample by sample.
import fs from 'fs';

const src = fs.readFileSync(new URL('./index.html', import.meta.url), 'utf8').split('\n');
function slice(a, b) { return src.slice(a - 1, b).join('\n'); }

export const BLOCK = 0.2, GEN_N = 32, GEN_R = GEN_N * BLOCK / 2, VOX_FLOOR = -40;

// solidity predicate, set per test
let S = () => false;
export function setSolid(f) { S = f; }

function filletSolid(i, j, l) {
  if (l < VOX_FLOOR) return true;
  if (i < 0 || j < 0 || i >= GEN_N || j >= GEN_N) return false;
  return !!S(i, j, l);
}

// FILLET_SUB .. FFRAME, then filletEdge .. filletFace
const consts = slice(1816, 1854);
const body = slice(1868, 2186);

const stubs = `
const NO_COLUMN = -1e9, AIR = 0;
const anyOf = v => new Proxy({}, { get: () => v });
const topMat = anyOf(0), topLvl = anyOf(NO_COLUMN), voxMat = anyOf(AIR), voxOff = anyOf(0), tint = anyOf(1);
const TERRAIN_MATS = anyOf({ color: { r: 0.5, g: 0.5, b: 0.5 } });
function voxCap() { return 0; }
`;

export const mod = new Function('BLOCK', 'GEN_N', 'GEN_R', 'VOX_FLOOR', 'filletSolid', `
${stubs}
${consts}
${body}
return { filletFace, filletEdge, filletRun, filletAxis, fpPos, fpNor, fpIdx,
         FDIR, FFRAME, FOPP, FILLET_SUB, FILLET_R_MAX };
`)(BLOCK, GEN_N, GEN_R, VOX_FLOOR, filletSolid);

export { filletSolid };

// Emit just one face and hand back its samples as {x,y,z} rows.
export function face(i, j, l, d) {
  mod.fpPos.length = mod.fpNor.length = mod.fpIdx.length = 0;
  mod.filletFace(i, j, l, d);
  const out = [];
  for (let k = 0; k < mod.fpPos.length; k += 3) {
    out.push({ x: mod.fpPos[k], y: mod.fpPos[k + 1], z: mod.fpPos[k + 2],
               nx: mod.fpNor[k], ny: mod.fpNor[k + 1], nz: mod.fpNor[k + 2] });
  }
  return out;
}

// Every exposed face of every solid block in the box.
export function build(i0, i1, j0, j1, l0, l1) {
  mod.fpPos.length = mod.fpNor.length = mod.fpIdx.length = 0;
  for (let j = j0; j < j1; j++) for (let i = i0; i < i1; i++) for (let l = l0; l < l1; l++) {
    if (!filletSolid(i, j, l)) continue;
    for (let d = 0; d < 6; d++) {
      const g = mod.FDIR[d];
      if (!filletSolid(i + g.di, j + g.dj, l + g.dl)) mod.filletFace(i, j, l, d);
    }
  }
  return { pos: mod.fpPos.slice(), nor: mod.fpNor.slice(), idx: mod.fpIdx.slice() };
}
