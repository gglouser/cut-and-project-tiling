import * as Vec from './vector.js';

const VERTEX_LIMIT = 20000;
const CUT_CHECK_EPS = 1e3 * Number.EPSILON;

class VertexCache {
    constructor(tiling) {
        this.tiling = tiling;
        this.cache = new Map();
    }

    makeVertex(coord) {
        return {
            coord,
            pcoord: this.tiling.project(coord),
            inCut: this.tiling.cutCheck(coord),
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
export class Tiling {
    constructor(dims, viewWidth, viewHeight) {
        this.dims = dims;
        this.viewWidth = viewWidth;
        this.viewHeight = viewHeight;
        this.resetBasis();
        this.resetOffset();
        this.newParams();
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

    newParams() {
        this.setupChecks();

        const vertexCache = new VertexCache(this);
        const vertices = [];
        const hbound = 1.5 + this.viewWidth / 2;
        const vbound = 1.5 + this.viewHeight / 2;

        // Start with all vertices in the hypercube that contains this.offset.
        const startQueue = [vertexCache.get(this.offset.map(Math.floor))];
        for (let i = 0; i < this.dims; i++) {
            startQueue.push(...startQueue.map((v) => vertexCache.getNeighbor(v, i, 1)));
        }
        const checkQueue = startQueue.filter((v) => v.inCut);

        // Find vertices in the cut by depth-first traversal of the lattice.
        let visited = 0;
        while (checkQueue.length > 0 && vertices.length < VERTEX_LIMIT) {
            const checkVertex = checkQueue.pop();
            visited += 1;
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
            for (let i = 0; i < this.dims; i++) {
                for (let di of [-1,1]) {
                    const neighbor = vertexCache.getNeighbor(checkVertex, i, di);
                    if (!neighbor.seen) {
                        checkQueue.push(neighbor);
                    }
                }
            }
        }

        // Find edges and faces.
        this.edges = [];
        this.faces = [];
        const faceTypes = getFaceTypes(this.dims);
        vertices.forEach((v) => {
            for (let i = 0; i < this.dims; i++) {
                const n1 = vertexCache.getNeighbor(v, i, 1);
                if (n1.inCut) {
                    this.edges.push([v.pcoord, n1.pcoord]);
                    for (let j = i+1; j < this.dims; j++) {
                        const n2 = vertexCache.getNeighbor(v, j, 1);
                        const n3 = vertexCache.getNeighbor(n1, j, 1);
                        if (n2.inCut && n3.inCut) {
                            this.faces.push({
                                verts: [
                                    v.pcoord,
                                    n1.pcoord,
                                    n3.pcoord,
                                    n2.pcoord,
                                    ],
                                a1: i,
                                a2: j,
                                type: faceTypes[i][j],
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
    }

    translateOffset(du, dv) {
        const dOffset = Vec.combine(du, this.basis[0], dv, this.basis[1]);
        this.offset = Vec.add(this.offset, dOffset)
                        .map((x) => x - Math.floor(x));
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

    setupChecks() {
        this.checkAxes = [];
        for (let i = 0; i < this.dims-2; i++) {
            for (let j = i+1; j < this.dims-1; j++) {
                for (let k = j+1; k < this.dims; k++) {
                    const a = Vec.zero(this.dims);
                    a[i] = this.basis[0][k]*this.basis[1][j] - this.basis[0][j]*this.basis[1][k];
                    a[j] = this.basis[0][i]*this.basis[1][k] - this.basis[0][k]*this.basis[1][i];
                    a[k] = this.basis[0][j]*this.basis[1][i] - this.basis[0][i]*this.basis[1][j];
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

        const cubeVerts = hypercubeVertices(this.dims)
                          .map((v) => Vec.add(v, this.offset));
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

    // Project a point in space onto the view plane.
    project(v) {
        return Vec.project(Vec.sub(v, this.offset), this.basis);
    }

    // Take a point on the view plane to the corresponding point in space.
    unproject(x) {
        return Vec.add(Vec.combine(x[0], this.basis[0], x[1], this.basis[1]), this.offset);
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

function getFaceTypes(dims) {
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
export class Tiling2 extends Tiling {
    constructor (dims, viewWidth, viewHeight) {
        super(dims, viewWidth, viewHeight);
    }

    newParams() {
        this.setup();

        this.edges = [];
        this.faces = [];
        for (let i = 0; i < this.dims-1; i++) {
            for (let j = i+1; j < this.dims; j++) {
                if (Math.abs(this.cross[i][j]) < Number.EPSILON) {
                    // Axis i and axis j are parallel.
                    // Faces with this orientation have zero area / are perpendicular
                    // to the cut plane, so they do not produce tiles.
                    continue;
                }

                for (let ki = this.gridMin[i]; ki < this.gridMax[i]; ki++) {
                    for (let kj = this.gridMin[j]; kj < this.gridMax[j]; kj++) {
                        const faceVert = this.getFaceVertex(i, j, ki, kj);
                        const f1 = this.project(faceVert);

                        const mid_x = f1[0] + (this.axis[i][0] + this.axis[j][0])/2;
                        const mid_y = f1[1] + (this.axis[i][1] + this.axis[j][1])/2;
                        if (Math.abs(mid_x) > this.hbound || Math.abs(mid_y) > this.vbound) {
                            continue;
                        }

                        const f2 = Vec.add(f1, this.axis[i]);
                        const f3 = Vec.add(f2, this.axis[j]);
                        const f4 = Vec.add(f1, this.axis[j]);
                        this.faces.push({
                            verts: [f1, f2, f3, f4],
                            a1: i,
                            a2: j,
                            type: this.faceTypes[i][j],
                        });
                    }
                }
            }
        }
    }

    getFaceVertex(i, j, ki, kj) {
        // Find the intersection (a,b) of the grid lines ki and kj.
        const a = ((ki+0.5-this.offset[i])*this.axis[j][1] - (kj+0.5-this.offset[j])*this.axis[i][1]) / this.cross[i][j];
        const b = ((kj+0.5-this.offset[j])*this.axis[i][0] - (ki+0.5-this.offset[i])*this.axis[j][0]) / this.cross[i][j];

        // Find the coordinates of the key vertex for the face
        // corresponding to this intersection.
        return this.unproject([a, b]).map((x, ix) => {
            if (ix === i) {
                return ki;
            } else if (ix === j) {
                return kj;
            }

            // Check for multiple intersections. If the fractional part of this coord
            // is 0.5, then it is on one of the grid lines for ix.
            if (Math.abs(x - Math.floor(x) - 0.5) < 1e-10) {
                if (Math.abs(this.cross[i][ix]) < Number.EPSILON) {
                    // Axis i and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < i.
                    if (Vec.dot(this.axis[ix], this.axis[i]) > 0 && ix < i) {
                        return Math.ceil(x);
                    }
                    return Math.floor(x);
                } else if (Math.abs(this.cross[ix][j]) < Number.EPSILON) {
                    // Axis j and ix are parallel. Shift the tile in the
                    // ix direction if they point the same direction
                    // AND this is the tile such that ix < j.
                    if (Vec.dot(this.axis[ix], this.axis[j]) > 0 && ix < j) {
                        return Math.ceil(x);
                    }
                    return Math.floor(x);
                } else if (this.cross[i][j]*this.cross[i][ix] > 0
                            && this.cross[i][j]*this.cross[ix][j] > 0) {
                    // Axis ix lies between axis i and axis j. Shift the tile
                    // in the ix direction by rounding up instead of down.
                    return Math.ceil(x);
                }
                return Math.floor(x);
            }

            return Math.round(x);
        });

    }

    setup() {
        this.setupAxes();
        this.hbound = this.viewWidth/2 + Math.SQRT1_2;
        this.vbound = this.viewHeight/2 + Math.SQRT1_2;
        this.setupGridRanges(this.hbound, this.vbound);
        this.faceTypes = getFaceTypes(this.dims);
    }

    setupAxes() {
        // It will be useful to have the projection of each axis on the view plane.
        // This is the same as the transpose of the basis.
        this.axis = [];
        for (let i = 0; i < this.dims; i++) {
            this.axis.push([this.basis[0][i], this.basis[1][i]]);
        }

        // It will also be useful to have the cross products of each pair of axes.
        this.cross = [];
        for (let i = 0; i < this.dims; i++) {
            this.cross.push([]);
            for (let j = 0; j <= i; j++) {
                if (i === j) {
                    this.cross[i][i] = 0;
                } else {
                    this.cross[i][j] = this.axis[i][0]*this.axis[j][1] - this.axis[j][0]*this.axis[i][1];
                    this.cross[j][i] = -this.cross[i][j];
                }
            }
        }
    }

    setupGridRanges(hbound, vbound) {
        // Find the range of grid lines for each axis.
        const corners = [
            this.unproject([-hbound, -vbound]),
            this.unproject([-hbound,  vbound]),
            this.unproject([ hbound, -vbound]),
            this.unproject([ hbound,  vbound]),
        ];
        this.gridMax = [];
        this.gridMin = [];
        for (let i = 0; i < this.dims; i++) {
            this.gridMax.push(corners.reduce((acc, p) => Math.max(acc, Math.ceil(p[i])), -Infinity));
            this.gridMin.push(corners.reduce((acc, p) => Math.min(acc, Math.floor(p[i])), Infinity));
        }
    }
}
