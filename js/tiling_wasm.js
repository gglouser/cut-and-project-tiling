// Extra glue for Rust WebAssembly implementation of multigrid tiling generator.
import * as Tiling_rs from '../crate/pkg';

export class TilingWasm extends Tiling_rs.MultigridTiling {

    get faces() {
        const faces = [];
        let numFaces = this.get_num_faces();
        for (let i = 0; i < numFaces; i++) {
            let face = this.get_face(i);
            faces.push({
                verts: [
                    [face.vert0x, face.vert0y],
                    [face.vert1x, face.vert1y],
                    [face.vert2x, face.vert2y],
                    [face.vert3x, face.vert3y],
                ],
                type: face.face_type,
            });
        }
        return faces;
    }

    get basis() {
        return [this.get_basis(0), this.get_basis(1)];
    }

    set basis(b) {
        this.set_basis(0, b[0]);
        this.set_basis(1, b[1]);
    }

    get offset() {
        return this.get_offset();
    }

    set offset(o) {
        this.set_offset(o);
    }

    get viewWidth() {
        return this.view_width;
    }

    set viewWidth(w) {
        this.view_width = w;
    }

    get viewHeight() {
        return this.view_height;
    }

    set viewHeight(h) {
        this.view_height = h;
    }

}
