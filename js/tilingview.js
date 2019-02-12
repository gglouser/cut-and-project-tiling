import { TilingState } from './tiling.js';
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
    }

    draw(state, tilingGen) {
        const faces = tilingGen(state, this.viewWidth, this.viewHeight);

        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.scale(this.scale, this.scale);

        ctx.lineWidth = GRID_LINE_W;
        ctx.lineJoin = 'bevel';
        ctx.strokeStyle = state.lineColor;
        faces.forEach((f) => {
            ctx.fillStyle = state.colors[f.type];
            ctx.beginPath();
            ctx.moveTo(f.verts[0][0], f.verts[0][1]);
            ctx.lineTo(f.verts[1][0], f.verts[1][1]);
            ctx.lineTo(f.verts[2][0], f.verts[2][1]);
            ctx.lineTo(f.verts[3][0], f.verts[3][1]);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        });

        ctx.restore();
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
