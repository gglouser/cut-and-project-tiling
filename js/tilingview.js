import { TilingState, getFaceTypes } from './tiling.js';
import { encodeState, decodeState, base64ToBlob } from './statecode.js';
import { RendererGL } from './rendergl.js';

const GRID_SCALE_INIT = 60;
const GRID_SCALE_MIN = 30;
const GRID_SCALE_MAX = 290;
const LINE_WIDTH_INIT = 2/GRID_SCALE_INIT;
const LINE_COLOR_INIT = [0,0,0];

export class TilingViewState extends TilingState {
    constructor(dims) {
        super(dims);
        this.initColors(dims);
        this.lineColor = LINE_COLOR_INIT;
        this.lineWidth = LINE_WIDTH_INIT;
    }

    initColors(dims) {
        if (dims === 3) {
            this.colors = [[128,128,128], [232,232,255], [180,180,192]];
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
                this.colors.push([r,g,b]);
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
        this.scale = GRID_SCALE_INIT;

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

        ctx.lineWidth = state.lineWidth;
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
