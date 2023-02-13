/* tslint:disable */
/* eslint-disable */
/**
* @param {number} dims
* @param {Float64Array} basis0
* @param {Float64Array} basis1
* @param {Float64Array} offset
* @param {number} view_width
* @param {number} view_height
* @returns {FaceList}
*/
export function generate(dims: number, basis0: Float64Array, basis1: Float64Array, offset: Float64Array, view_width: number, view_height: number): FaceList;
/**
*/
export class Face {
  free(): void;
/**
*/
  axis1: number;
/**
*/
  axis2: number;
/**
*/
  key_vert_x: number;
/**
*/
  key_vert_y: number;
}
/**
*/
export class FaceList {
  free(): void;
/**
* @returns {number}
*/
  get_num_faces(): number;
/**
* @param {number} i
* @returns {Face}
*/
  get_face(i: number): Face;
}

export type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

export interface InitOutput {
  readonly memory: WebAssembly.Memory;
  readonly generate: (a: number, b: number, c: number, d: number, e: number, f: number, g: number, h: number, i: number) => number;
  readonly __wbg_face_free: (a: number) => void;
  readonly __wbg_get_face_key_vert_x: (a: number) => number;
  readonly __wbg_set_face_key_vert_x: (a: number, b: number) => void;
  readonly __wbg_get_face_key_vert_y: (a: number) => number;
  readonly __wbg_set_face_key_vert_y: (a: number, b: number) => void;
  readonly __wbg_get_face_axis1: (a: number) => number;
  readonly __wbg_set_face_axis1: (a: number, b: number) => void;
  readonly __wbg_get_face_axis2: (a: number) => number;
  readonly __wbg_set_face_axis2: (a: number, b: number) => void;
  readonly __wbg_facelist_free: (a: number) => void;
  readonly facelist_get_num_faces: (a: number) => number;
  readonly facelist_get_face: (a: number, b: number) => number;
  readonly __wbindgen_malloc: (a: number) => number;
}

/**
* If `module_or_path` is {RequestInfo} or {URL}, makes a request and
* for everything else, calls `WebAssembly.instantiate` directly.
*
* @param {InitInput | Promise<InitInput>} module_or_path
*
* @returns {Promise<InitOutput>}
*/
export default function init (module_or_path?: InitInput | Promise<InitInput>): Promise<InitOutput>;
