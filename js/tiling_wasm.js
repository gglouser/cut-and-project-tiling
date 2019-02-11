// Extra glue for Rust WebAssembly implementation of multigrid tiling generator.
import * as Tiling_rs from '../crate/pkg';

export function generateWasm(state, viewWidth, viewHeight) {
    const faceList = Tiling_rs.generate(
        state.dims,
        state.basis[0],
        state.basis[1],
        state.offset,
        viewWidth,
        viewHeight);

    const faces = [];
    const numFaces = faceList.get_num_faces();
    for (let i = 0; i < numFaces; i++) {
        const face = faceList.get_face(i);
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
