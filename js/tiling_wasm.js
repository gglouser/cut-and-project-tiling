// Extra glue for Rust WebAssembly implementation of multigrid tiling generator.
import * as Tiling_rs from '../pkg/tiling_rs.js';

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
            keyVert: [face.key_vert_x, face.key_vert_y],
            axis1: face.axis1,
            axis2: face.axis2,
        });
        face.free();
    }
    faceList.free();
    return faces;
}
