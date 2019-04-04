import { TilingState, getFaceTypes } from './tiling.js';
import { encodeState, decodeState, base64ToBlob } from './statecode.js';

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

        const simpleColors = {
            4: ['#e8e8ff', '#808080', '#e8e8ff'],
            5: ['#e8e8ff', '#808080', '#808080', '#e8e8ff'],
            6: ['#808080', '#c0c0c0', '#e8e8ff', '#c0c0c0', '#808080'],
            7: ['#c0c0c0', '#e8e8ff', '#808080', '#808080', '#e8e8ff', '#c0c0c0'],
        }[dims];
        this.colors = [];
        for (let i = 0; i < dims-1; i++) {
            for (let j = 0; j < dims-i-1; j++) {
                this.colors.push(simpleColors ? simpleColors[j] : '#ffffff');
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
        this.calcViewSize();

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
        const faces = tilingGen(state, this.viewWidth, this.viewHeight);
        this.renderer.render(state, faces, this.scale, this.viewWidth, this.viewHeight);
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

    calcViewSize() {
        this.viewWidth = this.canvas.width / this.scale;
        this.viewHeight = this.canvas.height / this.scale;
    }

    viewZoom(dzoom) {
        const oldScale = this.scale;
        if (dzoom > 1) {
            this.scale = Math.min(GRID_SCALE_MAX, Math.ceil(this.scale * dzoom));
        } else if (dzoom < 1) {
            this.scale = Math.max(GRID_SCALE_MIN, Math.floor(this.scale * dzoom));
        }
        if (this.scale !== oldScale) {
            this.calcViewSize();
            this.app.redraw();
        }
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth;
        this.canvas.height = this.canvas.clientHeight;
        this.calcViewSize();
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
        this.programInfo = this.initShaders();
    }

    render(state, faces, scale, vw, vh) {
        const buffers = initBuffers(this.gl, state, faces);
        const uColors = state.colors.flatMap(splitColor);

        const uAxis = [];
        for (let i = 0; i < state.dims; i++) {
            uAxis.push(state.basis[0][i]);
            uAxis.push(state.basis[1][i]);
        }

        drawScene(this.gl, this.programInfo, buffers, vw, vh, uColors, uAxis);
    }

    initShaders() {
        // Vertex shader program
        const vsSource = `
            attribute vec2 aVertexPosition;
            attribute float aVertexColor;
            attribute vec2 aFaceAxis;
            attribute vec2 aFacePosition;

            uniform vec2 uScalingFactor;
            uniform vec2 uAxis[7];
            uniform vec3 uColors[21];

            varying lowp vec3 vColor;

            void main() {
                mat2 face_basis = mat2(uAxis[int(aFaceAxis[0])], uAxis[int(aFaceAxis[1])]);
                vec2 v = aFacePosition + face_basis * aVertexPosition;
                gl_Position = vec4(v * uScalingFactor, 0.0, 1.0);

                int color_id = int(aVertexColor);
                if (color_id >= 21) {
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

function initBuffers(gl, state, faces) {
    const vertexPerFace = 6;
    const vertexCount = vertexPerFace * faces.length;

    // Create array of vertex positions for the faces.
    const positions = new Float32Array(2 * vertexCount);
    const lineWidth = GRID_LINE_W/2;
    faces.forEach((f, i) => {
        const s = [state.basis[0][f.axis1], state.basis[1][f.axis1]];
        const t = [state.basis[0][f.axis2], state.basis[1][f.axis2]];
        const lw1 = lineWidth * Math.hypot(t[0], t[1]) / Math.abs(s[0]*t[1] - s[1]*t[0]);
        const lw2 = lineWidth * Math.hypot(s[0], s[1]) / Math.abs(s[0]*t[1] - s[1]*t[0]);

        const ii = 2*vertexPerFace*i;
        positions[ii]   = 0 + lw1;
        positions[ii+1] = 0 + lw2;
        positions[ii+2] = 1 - lw1;
        positions[ii+3] = 0 + lw2;
        positions[ii+4] = 1 - lw1;
        positions[ii+5] = 1 - lw2;
        positions[ii+6] = 0 + lw1;
        positions[ii+7] = 0 + lw2;
        positions[ii+8] = 1 - lw1;
        positions[ii+9] = 1 - lw2;
        positions[ii+10] = 0 + lw1;
        positions[ii+11] = 1 - lw2;
    });

    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);

    // Create an array of colors for the faces.
    const faceTypes = getFaceTypes(state.dims);
    const colors = new Float32Array(vertexCount);
    faces.forEach((f, i) => {
        for (let j = 0; j < vertexPerFace; j++) {
            colors[vertexPerFace*i + j] = faceTypes[f.axis1][f.axis2];
        }
    });

    const colorBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, colorBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, colors, gl.STATIC_DRAW);

    // Create an array for face axis indices.
    const faceAxis = new Float32Array(2 * vertexCount);
    faces.forEach((f, i) => {
        for (let j = 0; j < vertexPerFace; j++) {
            const ii = 2*(vertexPerFace*i + j);
            faceAxis[ii]   = f.axis1;
            faceAxis[ii+1] = f.axis2;
        }
    });

    const axisBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, axisBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, faceAxis, gl.STATIC_DRAW);

    // Create an array for face positions (key vertex).
    const facePosition = new Float32Array(2 * vertexCount);
    faces.forEach((f, i) => {
        for (let j = 0; j < vertexPerFace; j++) {
            const ii = 2*(vertexPerFace*i + j);
            facePosition[ii]   = f.keyVert[0];
            facePosition[ii+1] = f.keyVert[1];
        }
    });

    const facePosBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, facePosBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, facePosition, gl.STATIC_DRAW);

    return {
        vertexCount,
        position: positionBuffer,
        color: colorBuffer,
        axis: axisBuffer,
        facePos: facePosBuffer,
    };
}

function splitColor(c) {
    const m = c.match(/#([0-9A-F]{2})([0-9A-F]{2})([0-9A-F]{2})/i);
    if (m !== null) {
        const r = Number.parseInt(m[1], 16)/255;
        const g = Number.parseInt(m[2], 16)/255;
        const b = Number.parseInt(m[3], 16)/255;
        return [r,g,b];
    }
    return [0,0,0];
}

function enableBuffer(gl, buffer, attribLoc, numComponents) {
    const type = gl.FLOAT;      // the data in the buffer is 32bit floats
    const normalize = false;    // don't normalize
    const stride = 0;           // how many bytes to get from one set of values to the next
                                // 0 = use type and numComponents above
    const offset = 0;           // how many bytes inside the buffer to start from
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.vertexAttribPointer(
        attribLoc,
        numComponents,
        type,
        normalize,
        stride,
        offset);
    gl.enableVertexAttribArray(attribLoc);
}

// See: MDN WebGL tutorial, "Adding 2D content to a WebGL context"
function drawScene(gl, programInfo, buffers, viewWidth, viewHeight, colors, axis) {
    // Set GL viewport. Do this every time because canvas can be resized.
    gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

    gl.clearColor(0.0, 0.0, 0.0, 1.0);  // Clear to black, fully opaque
    gl.clearDepth(1.0);                 // Clear everything

    // Clear the canvas before we start drawing on it.
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

    // Tell WebGL how to pull out the attributes from the attribute buffers.
    enableBuffer(gl, buffers.position, programInfo.attribLocations.vertexPosition, 2);
    enableBuffer(gl, buffers.color, programInfo.attribLocations.vertexColor, 1);
    enableBuffer(gl, buffers.axis, programInfo.attribLocations.faceAxis, 2);
    enableBuffer(gl, buffers.facePos, programInfo.attribLocations.facePosition, 2);

    // Tell WebGL to use our program when drawing
    gl.useProgram(programInfo.program);

    // Set the shader uniforms
    const scalingFactor = [2/viewWidth, -2/viewHeight];
    gl.uniform2fv(programInfo.uniformLocations.scalingFactor, scalingFactor);
    gl.uniform3fv(programInfo.uniformLocations.colors, colors);
    gl.uniform2fv(programInfo.uniformLocations.axis, axis);

    {
      const offset = 0;
      gl.drawArrays(gl.TRIANGLES, offset, buffers.vertexCount);
    }
}
