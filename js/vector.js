// Functions to perform vector operations on arrays.

export function zero(dim) {
    const v = new Array(dim);
    v.fill(0);
    return v;
}

export function elementary(dim, i) {
    const v = zero(dim);
    v[i] = 1;
    return v;
}

export function copy(v) {
    return v.slice();
}

export function scale(v, a) {
    for (let i = 0; i < v.length; i++) {
        v[i] *= a;
    }
}

export function dot(v1, v2) {
    if (v1.length !== v2.length) {
        console.error("Vec.dot: mismatched vector lengths");
        return undefined;
    }
    let d = 0;
    for (let i = 0; i < v1.length; i++) {
        d += v1[i] * v2[i];
    }
    return d;
}

export function norm(v) {
    return Math.sqrt(dot(v, v));
}

export function normalize(v) {
    const d = dot(v,v);
    if (d > Number.EPSILON) {
        scale(v, 1/Math.sqrt(d));
    } else {
        v.fill(0);
    }
}

// Change v to have a norm of 1, BUT with the extra constraint
// that v[axis] = k (0 <= k <= 1).
export function renormalize(v, axis, k) {
    const norm2 = 1 - k**2;
    const v_norm2 = v.reduce((a,x,i) => (i === axis ? a : a + x**2), 0);
    if (v_norm2 > Number.EPSILON) {
        const f = Math.sqrt(norm2 / v_norm2);
        scale(v, f);
    } else {
        const x = Math.sqrt(norm2 / (v.length - 1));
        v.fill(-x);
    }
    v[axis] = k;
}

export function add(v1, v2) {
    if (v1.length !== v2.length) {
        console.error("Vec.add: mismatched vector lengths");
        return undefined;
    }
    const w = copy(v1);
    for (let i = 0; i < v1.length; i++) {
        w[i] += v2[i];
    }
    return w;
}

export function sub(v1, v2) {
    if (v1.length !== v2.length) {
        console.error("Vec.sub: mismatched vector lengths");
        return undefined;
    }
    const w = copy(v1);
    for (let i = 0; i < v1.length; i++) {
        w[i] -= v2[i];
    }
    return w;
}

// Compute k1 v1 + k2 v2, where k1/k2 are scalars and v1/v2 are vectors.
export function combine(k1, v1, k2, v2) {
    const w1 = copy(v1);
    scale(w1, k1);
    const w2 = copy(v2);
    scale(w2, k2);
    return add(w1, w2);
}

export function project(v, bases) {
    const w = zero(bases.length);
    for (let i = 0; i < bases.length; i++) {
        w[i] = dot(v, bases[i]);
    }
    return w;
}

export function makeOrtho(v, w) {
    const corr = copy(w);
    scale(corr, dot(v, w));
    return sub(v, corr);
}

// Rotate the vector v in the plane defined by axes i and j
// counterclockwise by an angle theta.
export function rotate(v, i, j, theta) {
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const x = v[i];
    const y = v[j];
    v[i] = c*x - s*y;
    v[j] = s*x + c*y;
}
