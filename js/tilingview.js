import { TilingState, getFaceTypes } from './tiling.js';
import { encodeState, decodeState, base64ToBlob, makeColor, splitColor } from './statecode.js';

const GRID_SCALE = 60;
const GRID_SCALE_MIN = 30;
const GRID_SCALE_MAX = 290;
const GRID_LINE_W = 2/GRID_SCALE;
const LINE_COLOR = '#000000';

export class TilingViewState extends TilingState {
    constructor(dims) {
        super(dims);
        this.initColors(dims);
        this.lineColor = LINE_COLOR;
    }

    initColors(dims) {
        if (dims === 3) {
            this.colors = ['#808080', '#e8e8ff', '#c0c0c0'];
            return;
        }

        let max = 0.0;
        let min = 1.0;
        for (let i = 1; i < dims; i++) {
            const x = Math.abs(this.basis[0][0]*this.basis[0][i] + this.basis[1][0]*this.basis[1][i]);
            max = Math.max(max, x);
            min = Math.min(min, x);
        }
        this.colors = [];
        for (let i = 0; i < dims-1; i++) {
            for (let j = i+1; j < dims; j++) {
                const dot_ij = this.basis[0][i]*this.basis[0][j] + this.basis[1][i]*this.basis[1][j];
                const x = (Math.abs(dot_ij) - min) / (max - min);
                const r = 0xe8 - 0x68*x;
                const g = 0xe8 - 0x68*x;
                const b = 0xff - 0x7f*x;
                this.colors.push(makeColor(r,g,b));
            }
        }
    }

    genStateCode(contF) {
        const blob = encodeState(this);
        const reader = new FileReader();
        reader.addEventListener("loadend", () => {
            const code = reader.result.split(',')[1];
            console.log('generated state code:', code);
            contF(code);
        }, false);
        reader.readAsDataURL(blob);
    }
}

export function loadStateCode(stateCode, contF) {
    const blob = base64ToBlob(stateCode);
    const reader = new FileReader();
    reader.addEventListener("loadend", () => {
        const st = decodeState(reader.result);
        if (st) {
            const state = new TilingViewState(st.dims);
            state.basis = st.basis;
            state.offset = st.offset;
            state.colors = st.colors;
            state.lineColor = st.lineColor;
            state.validate();
            contF(state);
        } else {
            console.error('Failed decoding state code.');
        }
    }, false);
    reader.readAsArrayBuffer(blob);
}

export class TilingView {
    constructor(canvas, app) {
        this.canvas = canvas;
        this.app = app;
        this.tracking = null;
        this.scale = GRID_SCALE;

        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;

        canvas.addEventListener('mousedown', this, false);
        canvas.addEventListener('mousemove', this, false);
        canvas.addEventListener('mouseup', this, false);
        canvas.addEventListener('touchstart', this, false);
        canvas.addEventListener('touchmove', this, false);
        canvas.addEventListener('touchend', this, false);
        canvas.addEventListener('wheel', this, {passive: true});
        window.addEventListener('resize', this, false);

        const gl = this.canvas.getContext("webgl");
        if (gl !== null) {
            this.renderer = new RendererGL(gl);
        } else {
            const ctx = this.canvas.getContext('2d');
            if (ctx !== null) {
                this.renderer = new Renderer2D(ctx);
            } else {
                this.renderer = {
                    render() {
                        console.error("no rendering context");
                    }
                };
            }
        }
    }

    draw(state, tilingGen) {
        const viewWidth = this.canvas.width / this.scale;
        const viewHeight = this.canvas.height / this.scale;
        const faces = tilingGen(state, viewWidth, viewHeight);
        this.renderer.render(state, faces, this.scale);
    }

    handleEvent(event) {
        switch (event.type) {
            case 'mousedown':
                this.tracking = { x: event.offsetX, y: event.offsetY };
                break;
            case 'mousemove':
                if (this.tracking) {
                    this.mouseMove(event.offsetX, event.offsetY);
                }
                break;
            case 'mouseup':
                this.tracking = null;
                break;
            case 'touchstart':
                this.touchStart(event);
                break;
            case 'touchmove':
                this.touchMove(event);
                break;
            case 'touchend':
                this.tracking = null;
                break;
            case 'wheel':
                this.wheelMove(event);
                break;
            case 'resize':
                this.resize();
                break;
        }
    }

    mouseMove(canvasX, canvasY) {
        this.viewMove(this.tracking.x - canvasX, this.tracking.y - canvasY);
        this.tracking.x = canvasX;
        this.tracking.y = canvasY;
    }

    wheelMove(event) {
        this.viewZoom(event.deltaY > 0 ? 0.8 : 1.25);
    }

    touchStart(event) {
        event.preventDefault();
        if (!this.tracking) {
            this.tracking = [];
        }
        for (let i = 0; i < event.changedTouches.length; i++) {
            const touch = event.changedTouches[i];
            if (!this.tracking.touch0) {
                this.tracking.touch0 = {
                    id: touch.identifier,
                    x: touch.pageX,
                    y: touch.pageY
                };
            } else if (!this.tracking.touch1) {
                this.tracking.touch1 = {
                    id: touch.identifier,
                    x: touch.pageX,
                    y: touch.pageY
                };
                this.tracking.dist = Math.hypot(
                    this.tracking.touch0.x - this.tracking.touch1.x,
                    this.tracking.touch0.y - this.tracking.touch1.y);
            } else {
                // Only track 2 touches.
                break;
            }
        }
    }

    touchMove(event) {
        if (this.tracking) {
            event.preventDefault();
            let changed = false;
            for (let i = 0; i < event.changedTouches.length; i++) {
                const touch = event.changedTouches[i];
                if (this.tracking.touch0.id === touch.identifier) {
                    this.tracking.touch0.lastX = this.tracking.touch0.x;
                    this.tracking.touch0.lastY = this.tracking.touch0.y;
                    this.tracking.touch0.x = touch.pageX;
                    this.tracking.touch0.y = touch.pageY;
                    changed = true;
                } else if (this.tracking.touch1.id === touch.identifier) {
                    this.tracking.touch1.x = touch.pageX;
                    this.tracking.touch1.y = touch.pageY;
                    changed = true;
                }
            }

            if (changed) {
                if (this.tracking.touch1) {
                    const newdist = Math.hypot(
                        this.tracking.touch0.x - this.tracking.touch1.x,
                        this.tracking.touch0.y - this.tracking.touch1.y);
                    if (this.tracking.dist !== 0) {
                        this.viewZoom(newdist/this.tracking.dist);
                    }
                    this.tracking.dist = newdist;
                } else {
                    this.viewMove(
                        this.tracking.touch0.lastX - this.tracking.touch0.x,
                        this.tracking.touch0.lastY - this.tracking.touch0.y);
                }
            }
        }
    }

    viewMove(dx, dy) {
        this.app.translateOffset(dx/this.scale, dy/this.scale);
    }

    viewZoom(dzoom) {
        const oldScale = this.scale;
        if (dzoom > 1) {
            this.scale = Math.min(GRID_SCALE_MAX, Math.ceil(this.scale * dzoom));
        } else if (dzoom < 1) {
            this.scale = Math.max(GRID_SCALE_MIN, Math.floor(this.scale * dzoom));
        }
        if (this.scale !== oldScale) {
            this.app.redraw();
        }
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.app.redraw();
    }
}

class Renderer2D {
    constructor(ctx) {
        this.ctx = ctx;
    }

    render(state, faces, scale) {
        const ctx = this.ctx;
        const faceTypes = getFaceTypes(state.dims);
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.scale(scale, scale);

        ctx.lineWidth = GRID_LINE_W;
        ctx.lineJoin = 'bevel';
        ctx.strokeStyle = state.lineColor;
        faces.forEach((f) => {
            ctx.fillStyle = state.colors[faceTypes[f.axis1][f.axis2]];
            ctx.beginPath();
            ctx.moveTo(f.keyVert[0], f.keyVert[1]);
            ctx.lineTo(f.keyVert[0] + state.basis[0][f.axis1], f.keyVert[1] + state.basis[1][f.axis1]);
            ctx.lineTo(f.keyVert[0] + state.basis[0][f.axis1] + state.basis[0][f.axis2],
                       f.keyVert[1] + state.basis[1][f.axis1] + state.basis[1][f.axis2]);
            ctx.lineTo(f.keyVert[0] + state.basis[0][f.axis2], f.keyVert[1] + state.basis[1][f.axis2]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });

        ctx.restore();
    }
}

class RendererGL {
    constructor(gl) {
        this.gl = gl;
        this.programInfo = this.initShaders(5);
    }

    render(state, faces, scale) {
        if (this.programInfo.shaderDims !== state.dims) {
            // console.debug("recompiling shaders for", state.dims, "dims");
            this.programInfo = this.initShaders(state.dims);
        }
        const buffers = initBuffers(this.gl, state, faces);
        const uColors = state.colors.flatMap(splitColor);

        const uAxis = [];
        for (let i = 0; i < state.dims; i++) {
            uAxis.push(state.basis[0][i]);
            uAxis.push(state.basis[1][i]);
        }

        drawScene(this.gl, this.programInfo, buffers, scale, uColors, uAxis);
    }

    initShaders(dims) {
        // Vertex shader program
        const vsSource = `
            const int MAX_DIMS = ${dims};
            const int NUM_COLORS = MAX_DIMS*(MAX_DIMS-1)/2;

            attribute vec2 aVertexPosition;
            attribute float aVertexColor;
            attribute vec2 aFaceAxis;
            attribute vec2 aFacePosition;

            uniform vec2 uScalingFactor;
            uniform vec2 uAxis[MAX_DIMS];
            uniform vec3 uColors[NUM_COLORS];

            varying lowp vec3 vColor;

            void main() {
                mat2 face_basis = mat2(uAxis[int(aFaceAxis[0])], uAxis[int(aFaceAxis[1])]);
                vec2 v = aFacePosition + face_basis * aVertexPosition;
                gl_Position = vec4(v * uScalingFactor, 0.0, 1.0);

                int color_id = int(aVertexColor);
                if (color_id >= NUM_COLORS) {
                        color_id = 0;
                }
                vColor = uColors[color_id];
            }
        `;

        // Fragment shader program
        const fsSource = `
            varying lowp vec3 vColor;

            void main() {
                gl_FragColor = vec4(vColor, 1.0);
            }
        `;

        // Initialize a shader program; this is where all the lighting
        // for the vertices and so forth is established.
        const shaderProgram = initShaderProgram(this.gl, vsSource, fsSource);

        // Collect all the info needed to use the shader program.
        // Look up which attribute our shader program is using
        // for aVertexPosition and look up uniform locations.
        return {
            program: shaderProgram,
            shaderDims: dims,
            attribLocations: {
                vertexPosition: this.gl.getAttribLocation(shaderProgram, 'aVertexPosition'),
                vertexColor: this.gl.getAttribLocation(shaderProgram, 'aVertexColor'),
                faceAxis: this.gl.getAttribLocation(shaderProgram, 'aFaceAxis'),
                facePosition: this.gl.getAttribLocation(shaderProgram, 'aFacePosition'),
            },
            uniformLocations: {
                scalingFactor: this.gl.getUniformLocation(shaderProgram, 'uScalingFactor'),
                colors: this.gl.getUniformLocation(shaderProgram, 'uColors'),
                axis: this.gl.getUniformLocation(shaderProgram, 'uAxis'),
            },
        };
    }

}

//
// Initialize a shader program, so WebGL knows how to draw our data.
// Source: MDN WebGL tutorial, "Adding 2D content to a WebGL context"
//
function initShaderProgram(gl, vsSource, fsSource) {
    const vertexShader = loadShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = loadShader(gl, gl.FRAGMENT_SHADER, fsSource);

    // Create the shader program
    const shaderProgram = gl.createProgram();
    gl.attachShader(shaderProgram, vertexShader);
    gl.attachShader(shaderProgram, fragmentShader);
    gl.linkProgram(shaderProgram);

    // If creating the shader program failed, alert
    if (!gl.getProgramParameter(shaderProgram, gl.LINK_STATUS)) {
        alert('Unable to initialize the shader program: ' + gl.getProgramInfoLog(shaderProgram));
        return null;
    }

    return shaderProgram;
}

//
// Creates a shader of the given type, uploads the source and compiles it.
// Source: MDN WebGL tutorial, "Adding 2D content to a WebGL context"
//
function loadShader(gl, type, source) {
    const shader = gl.createShader(type);

    // Send the source to the shader object
    gl.shaderSource(shader, source);

    // Compile the shader program
    gl.compileShader(shader);

    // See if it compiled successfully
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        alert('An error occurred compiling the shaders: ' + gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }

    return shader;
}

class GLAttributeBuffer {
    constructor(gl, numElems, numComponents) {
        this.gl = gl;
        this.numComponents = numComponents;
        this.type = gl.FLOAT;
        this.normalize = false;
        this.stride = 0;
        this.offset = 0;
        this.buffer = gl.createBuffer();
        this.array = new Float32Array(numElems * numComponents);
        this.ix = 0;
    }

    bufferData() {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.array, this.gl.STATIC_DRAW);
    }

    enable(attribLoc) {
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.buffer);
        this.gl.vertexAttribPointer(
            attribLoc,
            this.numComponents,
            this.type,
            this.normalize,
            this.stride,
            this.offset);
        this.gl.enableVertexAttribArray(attribLoc);
    }

    push(value) {
        if (this.ix < this.array.length) {
            this.array[this.ix++] = value;
        }
    }
}

function getInsets(state, lineWidth) {
    const insets = [];
    for (let i = 0; i < state.dims; i++) {
        insets.push([]);
    }

    for (let i = 0; i < state.dims; i++) {
        const s0 = state.basis[0][i];
        const s1 = state.basis[1][i];
        for (let j = 0; j < state.dims; j++) {
            if (i === j) {
                insets[i][j] = 0;
            } else {
                const t0 = state.basis[0][j];
                const t1 = state.basis[1][j];
                insets[i][j] = lineWidth * Math.hypot(t0, t1) / Math.abs(s0*t1 - s1*t0);
                insets[i][j] = Math.min(insets[i][j], 0.5);
            }
        }
    }
    return insets;
}

function initBuffers(gl, state, faces) {
    const vertexPerFace = 6;
    const vertexCount = vertexPerFace * faces.length;

    const lineWidth = GRID_LINE_W/2;
    // const lineWidth = 0.0;
    const insets = getInsets(state, lineWidth);

    // Create array of vertex positions for the faces.
    const vertexPosition = new GLAttributeBuffer(gl, vertexCount, 2);
    faces.forEach((f) => {
        const lw1 = insets[f.axis1][f.axis2];
        const lw2 = insets[f.axis2][f.axis1];
        vertexPosition.push(0 + lw1);
        vertexPosition.push(0 + lw2);
        vertexPosition.push(1 - lw1);
        vertexPosition.push(0 + lw2);
        vertexPosition.push(1 - lw1);
        vertexPosition.push(1 - lw2);
        vertexPosition.push(0 + lw1);
        vertexPosition.push(0 + lw2);
        vertexPosition.push(1 - lw1);
        vertexPosition.push(1 - lw2);
        vertexPosition.push(0 + lw1);
        vertexPosition.push(1 - lw2);
    });
    vertexPosition.bufferData();

    // Create an array of colors for the faces.
    const faceTypes = getFaceTypes(state.dims);
    const color = new GLAttributeBuffer(gl, vertexCount, 1);
    faces.forEach((f) => {
        for (let j = 0; j < vertexPerFace; j++) {
            color.push(faceTypes[f.axis1][f.axis2]);
        }
    });
    color.bufferData();

    // Create an array for face axis indices.
    const axis = new GLAttributeBuffer(gl, vertexCount, 2);
    faces.forEach((f) => {
        for (let j = 0; j < vertexPerFace; j++) {
            axis.push(f.axis1);
            axis.push(f.axis2);
        }
    });
    axis.bufferData();

    // Create an array for face positions (key vertex).
    const facePos = new GLAttributeBuffer(gl, vertexCount, 2);
    faces.forEach((f) => {
        for (let j = 0; j < vertexPerFace; j++) {
            facePos.push(f.keyVert[0]);
            facePos.push(f.keyVert[1]);
        }
    });
    facePos.bufferData();

    return {
        vertexCount,
        vertexPosition,
        color,
        axis,
        facePos,
    };
}

// See: MDN WebGL tutorial, "Adding 2D content to a WebGL context"
function drawScene(gl, programInfo, buffers, scale, colors, axis) {
    // Set GL viewport. Do this every time because canvas can be resized.
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
    gl.clearDepth(1.0);                 // Clear everything

    // Clear the canvas before we start drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell WebGL how to pull out the attributes from the attribute buffers.
    buffers.vertexPosition.enable(programInfo.attribLocations.vertexPosition);
    buffers.color.enable(programInfo.attribLocations.vertexColor);
    buffers.axis.enable(programInfo.attribLocations.faceAxis);
    buffers.facePos.enable(programInfo.attribLocations.facePosition);

    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);

    // Set the shader uniforms
    const scalingFactor = [2*scale/gl.canvas.width, -2*scale/gl.canvas.height];
    gl.uniform2fv(programInfo.uniformLocations.scalingFactor, scalingFactor);
    gl.uniform3fv(programInfo.uniformLocations.colors, colors);
    gl.uniform2fv(programInfo.uniformLocations.axis, axis);

    {
      const offset = 0;
      gl.drawArrays(gl.TRIANGLES, offset, buffers.vertexCount);
    }
}
