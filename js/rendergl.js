import { getFaceTypes } from './tiling.js';
import { splitColor } from './statecode.js';

export class RendererGL {
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

        this.drawScene(buffers, scale, uColors, uAxis, splitColor(state.lineColor));
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

        const shaderProgram = initShaderProgram(this.gl, vsSource, fsSource);

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

    drawScene(buffers, scale, colors, axis, lineColor) {
        const gl = this.gl;

        // Set GL viewport. Do this every time because canvas can be resized.
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas before we start drawing on it.
        gl.clearColor(lineColor[0], lineColor[1], lineColor[2], 1.0);
        gl.clearDepth(1.0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

        // Tell WebGL how to pull out the attributes from the attribute buffers.
        buffers.vertexPosition.enable(this.programInfo.attribLocations.vertexPosition);
        buffers.color.enable(this.programInfo.attribLocations.vertexColor);
        buffers.axis.enable(this.programInfo.attribLocations.faceAxis);
        buffers.facePos.enable(this.programInfo.attribLocations.facePosition);

        // Tell WebGL to use our program when drawing
        gl.useProgram(this.programInfo.program);

        // Set the shader uniforms
        const scalingFactor = [2*scale/gl.canvas.width, -2*scale/gl.canvas.height];
        gl.uniform2fv(this.programInfo.uniformLocations.scalingFactor, scalingFactor);
        gl.uniform3fv(this.programInfo.uniformLocations.colors, colors);
        gl.uniform2fv(this.programInfo.uniformLocations.axis, axis);

        const offset = 0;
        gl.drawArrays(gl.TRIANGLES, offset, buffers.vertexCount);
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

    const insets = getInsets(state, state.lineWidth/2);

    // Create array of vertex positions relative to the face position.
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

    // Create an array for the face colors.
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
