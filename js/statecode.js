export function base64ToBlob(base64str) {
    const bin = atob(base64str);
    const array = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
        array[i] = bin.charCodeAt(i);
    }
    return new Blob([array]);
}

function colorhex(n) {
    return Math.max(0, Math.min(255, Math.round(n)))
        .toString(16).padStart(2, '0');
}

export function makeColor(r,g,b) {
    return `#${colorhex(r)}${colorhex(g)}${colorhex(b)}`;
}

function readColor(view, ptr) {
    const r = view.getUint8(ptr);
    const g = view.getUint8(ptr+1);
    const b = view.getUint8(ptr+2);
    return [r,g,b];
}

export function splitColor(c) {
    const m = c.match(/#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i);
    if (m !== null) {
        const r = Number.parseInt(m[1], 16);
        const g = Number.parseInt(m[2], 16);
        const b = Number.parseInt(m[3], 16);
        return [r,g,b];
    }
    return [0,0,0];
}

export function encodeState(state) {
    const vecSize = state.dims * 2;
    const offsetSize = state.dims;
    const colors = state.colors;
    const colorsSize = (1 + colors.length) * 3;
    const bufSize = 2 + 2*vecSize + offsetSize + colorsSize;

    const buffer = new ArrayBuffer(bufSize);
    const view = new DataView(buffer);
    view.setUint8(0, 1);    // format version code -- VERSION 1
    view.setUint8(1, state.dims);

    // Write basis vectors.
    let ptr = 2;
    state.basis.forEach((v) => v.forEach((x) => {
        view.setInt16(ptr, Math.round(x * 32767));
        ptr += 2;
    }));

    // Write offset.
    state.offset.forEach((o) => {
        view.setUint8(ptr, Math.round(o * 200));
        ptr += 1;
    });

    // Write line color.
    state.lineColor.forEach((v,i) => view.setUint8(ptr + i, v));
    ptr += 3;

    // Write face colors.
    colors.forEach((c) => {
        c.forEach((v, i) => view.setUint8(ptr + i, v));
        ptr += 3;
    });

    return new Blob([buffer]);
}

export function decodeState(buffer) {
    try {
        const view = new DataView(buffer);
        const version = view.getUint8(0);
        if (version !== 1) {
            console.error('Tiling state decode: invalid format');
            return null;
        }
        const dims = view.getUint8(1);
        if (dims < 3 || dims > 7) {
            console.error('Tiling state decode: unsupported dimension');
            return null;
        }

        // Read basis vectors.
        let ptr = 2;
        const basis = [];
        for (let i = 0; i < 2; i++) {
            const v = [];
            for (let j = 0; j < dims; j++) {
                v.push(view.getInt16(ptr) / 32767);
                ptr += 2;
            }
            basis.push(v);
        }

        // Read offset.
        const offset = [];
        for (let i = 0; i < dims; i++) {
            offset.push(view.getUint8(ptr) / 200);
            ptr += 1;
        }

        // Read line color.
        const lineColor = readColor(view, ptr);
        ptr += 3;

        // Read colors.
        const colors = [];
        for (let i = 0; i < dims*(dims-1)/2; i++) {
            colors.push(readColor(view, ptr));
            ptr += 3;
        }

        return {
            dims,
            basis,
            offset,
            lineColor,
            colors,
        };

    } catch (error) {
        if (error instanceof RangeError) {
            console.error('Tiling state decode: invalid state code (RangeError)');
            return null;
        } else {
            throw error;
        }
    }
}
