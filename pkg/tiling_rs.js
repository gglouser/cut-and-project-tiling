
let wasm;

const cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });

cachedTextDecoder.decode();

let cachegetUint8Memory0 = null;
function getUint8Memory0() {
    if (cachegetUint8Memory0 === null || cachegetUint8Memory0.buffer !== wasm.memory.buffer) {
        cachegetUint8Memory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachegetUint8Memory0;
}

function getStringFromWasm0(ptr, len) {
    return cachedTextDecoder.decode(getUint8Memory0().subarray(ptr, ptr + len));
}

let cachegetFloat64Memory0 = null;
function getFloat64Memory0() {
    if (cachegetFloat64Memory0 === null || cachegetFloat64Memory0.buffer !== wasm.memory.buffer) {
        cachegetFloat64Memory0 = new Float64Array(wasm.memory.buffer);
    }
    return cachegetFloat64Memory0;
}

let WASM_VECTOR_LEN = 0;

function passArrayF64ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 8);
    getFloat64Memory0().set(arg, ptr / 8);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
}
/**
* @param {number} dims
* @param {Float64Array} basis0
* @param {Float64Array} basis1
* @param {Float64Array} offset
* @param {number} view_width
* @param {number} view_height
* @returns {FaceList}
*/
export function generate(dims, basis0, basis1, offset, view_width, view_height) {
    const ptr0 = passArrayF64ToWasm0(basis0, wasm.__wbindgen_malloc);
    const len0 = WASM_VECTOR_LEN;
    const ptr1 = passArrayF64ToWasm0(basis1, wasm.__wbindgen_malloc);
    const len1 = WASM_VECTOR_LEN;
    const ptr2 = passArrayF64ToWasm0(offset, wasm.__wbindgen_malloc);
    const len2 = WASM_VECTOR_LEN;
    const ret = wasm.generate(dims, ptr0, len0, ptr1, len1, ptr2, len2, view_width, view_height);
    return FaceList.__wrap(ret);
}

/**
*/
export class Face {

    static __wrap(ptr) {
        const obj = Object.create(Face.prototype);
        obj.ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.ptr;
        this.ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_face_free(ptr);
    }
    /**
    */
    get key_vert_x() {
        const ret = wasm.__wbg_get_face_key_vert_x(this.ptr);
        return ret;
    }
    /**
    * @param {number} arg0
    */
    set key_vert_x(arg0) {
        wasm.__wbg_set_face_key_vert_x(this.ptr, arg0);
    }
    /**
    */
    get key_vert_y() {
        const ret = wasm.__wbg_get_face_key_vert_y(this.ptr);
        return ret;
    }
    /**
    * @param {number} arg0
    */
    set key_vert_y(arg0) {
        wasm.__wbg_set_face_key_vert_y(this.ptr, arg0);
    }
    /**
    */
    get axis1() {
        const ret = wasm.__wbg_get_face_axis1(this.ptr);
        return ret;
    }
    /**
    * @param {number} arg0
    */
    set axis1(arg0) {
        wasm.__wbg_set_face_axis1(this.ptr, arg0);
    }
    /**
    */
    get axis2() {
        const ret = wasm.__wbg_get_face_axis2(this.ptr);
        return ret;
    }
    /**
    * @param {number} arg0
    */
    set axis2(arg0) {
        wasm.__wbg_set_face_axis2(this.ptr, arg0);
    }
}
/**
*/
export class FaceList {

    static __wrap(ptr) {
        const obj = Object.create(FaceList.prototype);
        obj.ptr = ptr;

        return obj;
    }

    __destroy_into_raw() {
        const ptr = this.ptr;
        this.ptr = 0;

        return ptr;
    }

    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_facelist_free(ptr);
    }
    /**
    * @returns {number}
    */
    get_num_faces() {
        const ret = wasm.facelist_get_num_faces(this.ptr);
        return ret >>> 0;
    }
    /**
    * @param {number} i
    * @returns {Face}
    */
    get_face(i) {
        const ret = wasm.facelist_get_face(this.ptr, i);
        return Face.__wrap(ret);
    }
}

async function load(module, imports) {
    if (typeof Response === 'function' && module instanceof Response) {
        if (typeof WebAssembly.instantiateStreaming === 'function') {
            try {
                return await WebAssembly.instantiateStreaming(module, imports);

            } catch (e) {
                if (module.headers.get('Content-Type') != 'application/wasm') {
                    console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                } else {
                    throw e;
                }
            }
        }

        const bytes = await module.arrayBuffer();
        return await WebAssembly.instantiate(bytes, imports);

    } else {
        const instance = await WebAssembly.instantiate(module, imports);

        if (instance instanceof WebAssembly.Instance) {
            return { instance, module };

        } else {
            return instance;
        }
    }
}

async function init(input) {
    if (typeof input === 'undefined') {
        input = new URL('tiling_rs_bg.wasm', import.meta.url);
    }
    const imports = {};
    imports.wbg = {};
    imports.wbg.__wbindgen_throw = function(arg0, arg1) {
        throw new Error(getStringFromWasm0(arg0, arg1));
    };

    if (typeof input === 'string' || (typeof Request === 'function' && input instanceof Request) || (typeof URL === 'function' && input instanceof URL)) {
        input = fetch(input);
    }



    const { instance, module } = await load(await input, imports);

    wasm = instance.exports;
    init.__wbindgen_wasm_module = module;

    return wasm;
}

export default init;

