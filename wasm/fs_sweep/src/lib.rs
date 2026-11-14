// The game's frictionSweepFlat Gauss-Seidel sweep, the same sums and products in the same order (wasm has no
// fused multiply-add and Rust does not reassociate f64), so every impulse comes out to the bit as the JS loop.
// Layout as in the game: J 20 per equation, E 4, BI 2 (offsets into V, a multiple of 6), L 4, B / IC / LAM 1, V 6 per body.
// Room for the arrays: the page asks for bytes and gets an offset into the module's memory.
#[no_mangle] pub extern "C" fn alloc(bytes: usize) -> *mut u8 { let mut v: Vec<u8> = Vec::with_capacity(bytes + 8); let p = v.as_mut_ptr(); core::mem::forget(v); unsafe { p.add((8 - (p as usize) % 8) % 8) } }

#[inline(always)]
unsafe fn add(j: *const f64, bi: *const i32, v: *mut f64, t: usize, u: f64) {
    let o = t * 20; let ia = *bi.add(t * 2) as usize; let ib = *bi.add(t * 2 + 1) as usize;
    let jj = |k: usize| *j.add(o + k);
    let mut m = jj(18) * u;
    *v.add(ia) = *v.add(ia) + m * jj(0); *v.add(ia + 1) = *v.add(ia + 1) + m * jj(1); *v.add(ia + 2) = *v.add(ia + 2) + m * jj(2);
    m = jj(19) * u;
    *v.add(ib) = *v.add(ib) + m * jj(6); *v.add(ib + 1) = *v.add(ib + 1) + m * jj(7); *v.add(ib + 2) = *v.add(ib + 2) + m * jj(8);
    *v.add(ia + 3) = *v.add(ia + 3) + u * jj(12); *v.add(ia + 4) = *v.add(ia + 4) + u * jj(13); *v.add(ia + 5) = *v.add(ia + 5) + u * jj(14);
    *v.add(ib + 3) = *v.add(ib + 3) + u * jj(15); *v.add(ib + 4) = *v.add(ib + 4) + u * jj(16); *v.add(ib + 5) = *v.add(ib + 5) + u * jj(17);
}

#[no_mangle]
pub unsafe extern "C" fn sweep(j: *const f64, e: *const f64, bi: *const i32, l: *const i32, b: *const f64, ic: *const f64,
                               lam: *mut f64, v: *mut f64, n: i32, iters: i32, tol: f64) -> i32 {
    let n = n as usize;
    let mut it: i32 = 0;
    while it != iters {
        let mut delta = 0.0f64;
        for t in 0..n {
            let o = t * 20; let ia = *bi.add(t * 2) as usize; let ib = *bi.add(t * 2 + 1) as usize; let vv = *lam.add(t);
            let jj = |k: usize| *j.add(o + k);
            let vx = |k: usize| *v.add(k);
            let gw = ((vx(ia) * jj(0) + vx(ia + 1) * jj(1) + vx(ia + 2) * jj(2)) + (vx(ia + 3) * jj(3) + vx(ia + 4) * jj(4) + vx(ia + 5) * jj(5))) +
                     ((vx(ib) * jj(6) + vx(ib + 1) * jj(7) + vx(ib + 2) * jj(8)) + (vx(ib + 3) * jj(9) + vx(ib + 4) * jj(10) + vx(ib + 5) * jj(11)));
            let mut u = *ic.add(t) * (*b.add(t) - gw - *e.add(t * 4) * vv);
            let mut lo = *e.add(t * 4 + 1); let mut hi = *e.add(t * 4 + 2);
            let kind = *l.add(t * 4);
            if kind != 0 {
                let ci = *l.add(t * 4 + 1);
                hi = if ci >= 0 { *e.add(t * 4 + 3) * *lam.add(ci as usize) } else { 0.0 }; lo = -hi;
                if kind == 1 { lo = f64::NEG_INFINITY; hi = f64::INFINITY; }
                else if kind == 2 {
                    let pi = *l.add(t * 4 + 2) as usize; let pa = *lam.add(pi); let nb2 = vv + u;
                    let r = (pa * pa + nb2 * nb2).sqrt();
                    if r > hi {
                        let s = hi / r; let dp = pa * s - pa;
                        *lam.add(pi) += dp; add(j, bi, v, pi, dp); delta += if dp > 0.0 { dp } else { -dp };
                        u = nb2 * s - vv;
                    }
                    lo = f64::NEG_INFINITY; hi = f64::INFINITY;
                }
            }
            if vv + u < lo { u = lo - vv; } else if vv + u > hi { u = hi - vv; }
            *lam.add(t) += u;
            delta += if u > 0.0 { u } else { -u };
            add(j, bi, v, t, u);
        }
        if delta * delta < tol { break; }
        it += 1;
    }
    it
}
