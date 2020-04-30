import { getFaceTypes } from './tiling.js';

const VERTEX_PER_FACE = 6;

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

        const buffers = this.initBuffers(VERTEX_PER_FACE * faces.length);
        this.drawFaces(buffers, faces, state);
        this.bufferData(buffers);

        const uniforms = this.initUniforms(state, scale);

        this.drawScene(buffers, uniforms, state.lineColor);
    }

    initShaders(dims) {
        // Vertex shader program
        const vsSource = `
            const int MAX_DIMS = ${dims};

            attribute vec2 aVertexPosition;
            attribute vec3 aVertexColor;
            attribute vec2 aFaceAxis;
            attribute vec2 aFacePosition;

            uniform vec2 uScalingFactor;
            uniform vec2 uAxis[MAX_DIMS];

            varying lowp vec3 vColor;

            void main() {
                mat2 face_basis = mat2(uAxis[int(aFaceAxis[0])], uAxis[int(aFaceAxis[1])]);
                vec2 v = aFacePosition + face_basis * aVertexPosition;
                gl_Position = vec4(v * uScalingFactor, 0.0, 1.0);
                vColor = aVertexColor / 255.0;
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
                axis: this.gl.getUniformLocation(shaderProgram, 'uAxis'),
            },
        };
    }

    initBuffers(vertexCount) {
        return {
            vertexCount,
            vertexPosition: new GLAttributeBuffer(this.gl, vertexCount, 2),
            color: new GLAttributeBuffer(this.gl, vertexCount, 3),
            axis: new GLAttributeBuffer(this.gl, vertexCount, 2),
            facePos: new GLAttributeBuffer(this.gl, vertexCount, 2),
        };
    }

    bufferData(buffers) {
        buffers.vertexPosition.bufferData();
        buffers.color.bufferData();
        buffers.axis.bufferData();
        buffers.facePos.bufferData();
    }

    initUniforms(state, scale) {
        const axis = [];
        for (let i = 0; i < state.dims; i++) {
            axis.push(state.basis[0][i]);
            axis.push(state.basis[1][i]);
        }

        return {
            axis,
            scalingFactor: [2*scale/this.gl.canvas.width, -2*scale/this.gl.canvas.height],
        };
    }

    drawFaces(buffers, faces, state) {
        const insets = getInsets(state);
        const faceTypes = getFaceTypes(state.dims);
        faces.forEach((face) => {
            const color = state.colors[faceTypes[face.axis1][face.axis2]];
            this.drawFace(buffers, face, insets, color);
        });
    }

    drawFace(buffers, face, insets, color) {
        // Helper function to add one vertex to the buffers.
        const pushVertex = (pos) => {
            buffers.vertexPosition.push(pos[0]);
            buffers.vertexPosition.push(pos[1]);
            buffers.color.push(color[0]);
            buffers.color.push(color[1]);
            buffers.color.push(color[2]);
            buffers.axis.push(face.axis1);
            buffers.axis.push(face.axis2);
            buffers.facePos.push(face.keyVert[0]);
            buffers.facePos.push(face.keyVert[1]);
        }

        // Inset vertex positions for this face.
        const inset1 = insets[face.axis1][face.axis2];
        const inset2 = insets[face.axis2][face.axis1];
        const vertPos = [
            [0 + inset1, 0 + inset2],
            [1 - inset1, 0 + inset2],
            [1 - inset1, 1 - inset2],
            [0 + inset1, 1 - inset2],
        ];

        pushVertex(vertPos[0]);
        pushVertex(vertPos[1]);
        pushVertex(vertPos[2]);

        pushVertex(vertPos[0]);
        pushVertex(vertPos[2]);
        pushVertex(vertPos[3]);
    }

    drawScene(buffers, uniforms, bgColor) {
        const gl = this.gl;

        // Set GL viewport. Do this every time because canvas can be resized.
        gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

        // Clear the canvas before we start drawing on it.
        gl.clearColor(bgColor[0], bgColor[1], bgColor[2], 1.0);
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
        gl.uniform2fv(this.programInfo.uniformLocations.scalingFactor, uniforms.scalingFactor);
        gl.uniform2fv(this.programInfo.uniformLocations.axis, uniforms.axis);

        const offset = 0;
        gl.drawArrays(gl.TRIANGLES, offset, buffers.vertexCount);
    }
}

function getInsets(state) {
    const lineWidth = state.lineWidth / 2;
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
