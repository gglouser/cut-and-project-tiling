import * as Vec from './vector.js';

const VERTEX_LIMIT = 20000;
const CUT_CHECK_EPS = 1e3 * Number.EPSILON;

export class TilingState {
    constructor(dims) {
        this.dims = dims;
        this.resetBasis();
        this.resetOffset();
    }

    resetBasis() {
        // Set up the basis vectors for the cutting plane.
        this.basis = [Vec.zero(this.dims), Vec.zero(this.dims)];
        const f = Math.sqrt(2/this.dims);
        const g = ((this.dims % 2) + 1) * Math.PI / this.dims;
        for (let i = 0; i < this.dims; i++) {
            this.basis[0][i] = f*Math.cos(g*i);
            this.basis[1][i] = f*Math.sin(g*i);
        }
        // this.basisTest();
    }

    basisTest() {
        console.debug('--------------------');
        console.debug('|u| =', Vec.norm(this.basis[0]));
        console.debug('|v| =', Vec.norm(this.basis[1]));
        console.debug('u . v =', Vec.dot(this.basis[0], this.basis[1]));
    }

    resetOffset() {
        // const gamma = 0.1;  // Penrose star
        const gamma = (this.dims === 5) ? 0.3 : 0;  // Penrose sun
        this.offset = new Array(this.dims);
        this.offset.fill(gamma);
    }

    // Project a point in space onto the view plane.
    project(v) {
        return Vec.project(Vec.sub(v, this.offset), this.basis);
    }

    // Take a point on the view plane to the corresponding point in space.
    unproject(x) {
        return Vec.add(Vec.combine(x[0], this.basis[0], x[1], this.basis[1]), this.offset);
    }

    // Move the view center to the given (x,y) coords in the view plane.
    translateOffset(x, y) {
        this.offset = this.unproject([x, y])
            .map((a) => a - Math.floor(a));
    }

    moveAxis(changeAxis, x, y) {
        // Clamp u_i and v_i to inside the unit circle.
        let unit_x = x;
        let unit_y = y;
        let k = Math.hypot(x, y);
        if (k <= Number.EPSILON) {
            unit_x = 1;
            unit_y = 0;
            k = 0;
        } else {
            unit_x /= k;
            unit_y /= k;
            k = Math.min(k, 1);
        }

        // Convenient aliases for the basis vectors.
        let u = this.basis[0];
        let v = this.basis[1];

        // Rotate u and v so that u is nearly aligned with the change axis.
        const u1 = Vec.combine( unit_x, u, unit_y, v);
        const v1 = Vec.combine(-unit_y, u, unit_x, v);
        u = u1;
        v = v1;

        // Re-normalize v orthogonal to the change axis.
        Vec.renormalize(v, changeAxis, 0);

        // Make u orthogonal to v then re-normalize fully aligned with the change axis.
        u = Vec.makeOrtho(u, v);
        Vec.renormalize(u, changeAxis, k);

        // Rotate u and v to new direction.
        this.basis[0] = Vec.combine(unit_x, u, -unit_y, v);
        this.basis[1] = Vec.combine(unit_y, u,  unit_x, v);

        // this.basisTest();
    }

    // Enforce tiling state invariants.
    validate() {
        // Ensure the basis vectors are unit length and orthogonal.
        Vec.normalize(this.basis[0]);
        this.basis[1] = Vec.makeOrtho(this.basis[1], this.basis[0]);
        Vec.normalize(this.basis[1]);
        if (Vec.norm(this.basis[0]) === 0 || Vec.norm(this.basis[1]) === 0) {
            // If either vector ended up zero, the basis was invalid.
            // Reset it.
            this.resetBasis();
        }

        // Ensure the offsets are clamped to [0,1].
        for (let i = 0; i < this.dims; i++) {
            this.offset[i] = Math.max(0, Math.min(1, this.offset[i]));
        }
    }
}

class VertexCache {
    constructor(state, checkAxes) {
        this.state = state;
        this.checkAxes = checkAxes;
        this.cache = new Map();
    }

    makeVertex(coord) {
        return {
            coord,
            pcoord: this.state.project(coord),
            inCut: this.checkAxes.cutCheck(coord),
            seen: false,
        };
    }

    get(coord) {
        const key = coord.toString();
        let v = this.cache.get(key);
        if (!v) {
            v = this.makeVertex(coord);
            this.cache.set(key, v);
        }
        return v;
    }

    getNeighbor(vertex, axis, delta) {
        const c = Vec.copy(vertex.coord);
        c[axis] += delta;
        return this.get(c);
    }
}

// Generate the tiling using the cut-and-project method.
export function generateCutProj(state, viewWidth, viewHeight) {
    const checkAxes = new CheckAxes(state);
    const vertexCache = new VertexCache(state, checkAxes);
    const vertices = [];
    const hbound = 1.5 + viewWidth / 2;
    const vbound = 1.5 + viewHeight / 2;

    // Start with all vertices in the hypercube that contains this.offset.
    const startQueue = [vertexCache.get(state.offset.map(Math.floor))];
    for (let i = 0; i < state.dims; i++) {
        startQueue.push(...startQueue.map((v) => vertexCache.getNeighbor(v, i, 1)));
    }
    const checkQueue = startQueue.filter((v) => v.inCut);

    // Find vertices in the cut by depth-first traversal of the lattice.
    // let visited = 0;
    while (checkQueue.length > 0 && vertices.length < VERTEX_LIMIT) {
        const checkVertex = checkQueue.pop();
        // visited += 1;
        if (checkVertex.seen) {
            continue;
        }
        checkVertex.seen = true;

        // If in cut and not out of bounds, then keep this vertex.
        if (!checkVertex.inCut
            || Math.abs(checkVertex.pcoord[0]) > hbound
            || Math.abs(checkVertex.pcoord[1]) > vbound) {
            continue;
        }
        vertices.push(checkVertex);

        // Add neighbors to checkQueue.
        for (let i = 0; i < state.dims; i++) {
            for (let di of [-1,1]) {
                const neighbor = vertexCache.getNeighbor(checkVertex, i, di);
                if (!neighbor.seen) {
                    checkQueue.push(neighbor);
                }
            }
        }
    }

    // Find edges and faces.
    // const edges = [];
    const faces = [];
    vertices.forEach((v) => {
        for (let i = 0; i < state.dims; i++) {
            const n1 = vertexCache.getNeighbor(v, i, 1);
            if (n1.inCut) {
                // edges.push([v.pcoord, n1.pcoord]);
                for (let j = i+1; j < state.dims; j++) {
                    const n2 = vertexCache.getNeighbor(v, j, 1);
                    const n3 = vertexCache.getNeighbor(n1, j, 1);
                    if (n2.inCut && n3.inCut) {
                        faces.push({
                            keyVert: v.pcoord,
                            axis1: i,
                            axis2: j,
                        });
                    }
                }
            }
        }
    });

    // console.debug('visited', visited, ':: kept',
        // vertices.length, 'vertices,',
        // this.edges.length, 'edges,',
        // this.faces.length, 'faces');
    return faces;
}

class CheckAxes {
    constructor(state) {
        this.checkAxes = [];
        for (let i = 0; i < state.dims-2; i++) {
            for (let j = i+1; j < state.dims-1; j++) {
                for (let k = j+1; k < state.dims; k++) {
                    const a = Vec.zero(state.dims);
                    a[i] = state.basis[0][k]*state.basis[1][j] - state.basis[0][j]*state.basis[1][k];
                    a[j] = state.basis[0][i]*state.basis[1][k] - state.basis[0][k]*state.basis[1][i];
                    a[k] = state.basis[0][j]*state.basis[1][i] - state.basis[0][i]*state.basis[1][j];
                    if (Math.abs(a[i]) <= Number.EPSILON) {
                        a[i] = 0;
                    }
                    if (Math.abs(a[j]) <= Number.EPSILON) {
                        a[j] = 0;
                    }
                    if (Math.abs(a[k]) <= Number.EPSILON) {
                        a[k] = 0;
                    }
                    Vec.normalize(a);
                    if (Vec.norm(a) !== 0) {
                        this.checkAxes.push(a);
                    }
                }
            }
        }

        /* This is one way of resolving some corner cases, but not all.
            * Also, it wrecks some symmetry (when all offsets set to 0.5).
            * It works by making sure all checkAxes are on the same side of
            * the hyperplane defined by checkAxes[0].
            */
        // this.checkAxes.forEach((a,i) => {
            // if (Vec.dot(a, this.checkAxes[0]) < 0) {
                // Vec.scale(a, -1);
            // }
        // });

        const cubeVerts = hypercubeVertices(state.dims)
                            .map((v) => Vec.add(v, state.offset));
        this.checkMax = [];
        this.checkMin = [];
        this.checkAxes.forEach((a) => {
            let max = -Infinity;
            let min = Infinity;
            cubeVerts.forEach((v) => {
                const d = Vec.dot(v, a);
                max = Math.max(max, d);
                min = Math.min(min, d);
            });
            this.checkMax.push(max);
            this.checkMin.push(min);
        });
    }

    cutCheck(v) {
        return this.checkAxes.every((a, i) => {
            const d = Vec.dot(v, a);
            // test that checkMin < d <= checkMax
            return d - this.checkMin[i] > CUT_CHECK_EPS
                && this.checkMax[i] - d >= -CUT_CHECK_EPS;
        });
    }

    cutStatus(v) {
        return this.checkAxes.map((a, i) => {
            const d = Vec.dot(v, a);
            if (Math.abs(this.checkMax[i] - d) <= CUT_CHECK_EPS) {
                return '+';
            } else if (Math.abs(d - this.checkMin[i]) <= CUT_CHECK_EPS) {
                return '-';
            }
            return this.checkMin[i] < d && d < this.checkMax[i] ? '=' : '_';
        }).join('');
    }
}

function hypercubeVertices(n) {
    const vs = [];
    const v = Vec.zero(n);
    const walk = function (k) {
        if (k > 0) {
            v[k-1] = 0.5;
            walk(k-1);
            v[k-1] = -0.5;
            walk(k-1);
        } else {
            vs.push(Vec.copy(v));
        }
    };
    walk(n);
    return vs;
}

export function getFaceTypes(dims) {
    const faceType = [];
    for (let i = 0; i < dims; i++) {
        faceType.push([]);
    }

    let typeIx = 0;
    for (let i = 0; i < dims-1; i++) {
        for (let j = i+1; j < dims; j++) {
            faceType[i][j] = typeIx;
            faceType[j][i] = typeIx;
            typeIx += 1;
        }
    }
    return faceType;
}

// Generate the tiling using the multigrid method.
export function generateMultigrid(state, viewWidth, viewHeight) {
    // It will be useful to have the projection of each axis on the view plane.
    // This is the same as the transpose of the basis.
    const axis = [];
    for (let i = 0; i < state.dims; i++) {
        axis.push([state.basis[0][i], state.basis[1][i]]);
    }

    const extProd = getExtProds(axis);
    const hbound = viewWidth/2 + Math.SQRT1_2;
    const vbound = viewHeight/2 + Math.SQRT1_2;
    const grid = getGridRanges(state, hbound, vbound);

    const faces = [];
    for (let i = 0; i < state.dims-1; i++) {
        for (let j = i+1; j < state.dims; j++) {
            if (Math.abs(extProd[i][j]) < Number.EPSILON) {
                // Axis i and axis j are parallel.
                // Faces with this orientation have zero area / are perpendicular
                // to the cut plane, so they do not produce tiles.
                continue;
            }

            for (let ki = grid.min[i]; ki < grid.max[i]; ki++) {
                for (let kj = grid.min[j]; kj < grid.max[j]; kj++) {
                    const faceVert = getFaceVertex(i, j, ki, kj, state, axis, extProd);
                    const f1 = state.project(faceVert);

                    const mid_x = f1[0] + (axis[i][0] + axis[j][0])/2;
                    const mid_y = f1[1] + (axis[i][1] + axis[j][1])/2;
                    if (Math.abs(mid_x) > hbound || Math.abs(mid_y) > vbound) {
                        continue;
                    }

                    faces.push({
                        keyVert: f1,
                        axis1: i,
                        axis2: j,
                    });
                }
            }
        }
    }
    return faces;
}

function getFaceVertex(i, j, ki, kj, state, axis, extProd) {
    // Find the intersection (a,b) of the grid lines ki and kj.
    const u = ki + 0.5 - state.offset[i];
    const v = kj + 0.5 - state.offset[j];
    const a = (u*axis[j][1] - v*axis[i][1]) / extProd[i][j];
    const b = (v*axis[i][0] - u*axis[j][0]) / extProd[i][j];

    // Find the coordinates of the key vertex for the face
    // corresponding to this intersection.
    return state.unproject([a, b]).map((x, ix) => {
        if (ix === i) {
            return ki;
        } else if (ix === j) {
            return kj;
        }

        // Check for multiple intersections. If the fractional part of this coord
        // is 0.5, then it is on one of the grid lines for ix.
        if (Math.abs(x - Math.floor(x) - 0.5) < 1e-10) {
            if (Math.abs(extProd[i][ix]) < Number.EPSILON) {
                // Axis i and ix are parallel. Shift the tile in the
                // ix direction if they point the same direction
                // AND this is the tile such that ix < i.
                if (Vec.dot(axis[ix], axis[i]) > 0 && ix < i) {
                    return Math.ceil(x);
                }
            } else if (Math.abs(extProd[ix][j]) < Number.EPSILON) {
                // Axis j and ix are parallel. Shift the tile in the
                // ix direction if they point the same direction
                // AND this is the tile such that ix < j.
                if (Vec.dot(axis[ix], axis[j]) > 0 && ix < j) {
                    return Math.ceil(x);
                }
            } else if (extProd[i][j]*extProd[i][ix] > 0
                        && extProd[i][j]*extProd[ix][j] > 0) {
                // Axis ix lies between axis i and axis j. Shift the tile
                // in the ix direction by rounding up instead of down.
                return Math.ceil(x);
            }
            return Math.floor(x);
        }

        return Math.round(x);
    });

}

// It will also be useful to have the exterior products (aka perp dot products)
// of each pair of axes.
function getExtProds(axis) {
    const prods = [];
    for (let i = 0; i < axis.length; i++) {
        prods.push([]);
        for (let j = 0; j <= i; j++) {
            if (i === j) {
                prods[i][i] = 0;
            } else {
                prods[i][j] = axis[i][0]*axis[j][1] - axis[j][0]*axis[i][1];
                prods[j][i] = -prods[i][j];
            }
        }
    }
    return prods;
}

function getGridRanges(state, hbound, vbound) {
    // Find the range of grid lines for each axis.
    const corners = [
        state.unproject([-hbound, -vbound]),
        state.unproject([-hbound,  vbound]),
        state.unproject([ hbound, -vbound]),
        state.unproject([ hbound,  vbound]),
    ];
    const min = [];
    const max = [];
    for (let i = 0; i < state.dims; i++) {
        min.push(corners.reduce((acc, p) => Math.min(acc, Math.floor(p[i])), Infinity));
        max.push(corners.reduce((acc, p) => Math.max(acc, Math.ceil(p[i])), -Infinity));
    }
    return { min, max };
}
