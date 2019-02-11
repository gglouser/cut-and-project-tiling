import * as Vec from './vector.js';
import { TilingState, generateCutProj, generateMultigrid } from './tiling.js';
import { AxisControls, OffsetControls } from './controls.js';
import { encodeState, decodeState, base64ToBlob } from './statecode.js';
import { generateWasm } from './tiling_wasm.js';

const GRID_SCALE = 60;
const GRID_SCALE_MIN = 30;
const GRID_SCALE_MAX = 290;
const GRID_LINE_W = 2/GRID_SCALE;
const LINE_COLOR = '#000000';

class TilingView {
    constructor(canvas, app, dims) {
        this.canvas = canvas;
        this.app = app;
        this.tracking = null;
        this.scale = GRID_SCALE;
        this.lineColor = LINE_COLOR;
        this.initColors(dims);

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

    draw(faces) {
        const ctx = this.canvas.getContext('2d');
        ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);

        ctx.save();
        ctx.translate(ctx.canvas.width / 2, ctx.canvas.height / 2);
        ctx.scale(this.scale, this.scale);

        ctx.lineWidth = GRID_LINE_W;
        ctx.lineJoin = 'bevel';
        ctx.strokeStyle = this.lineColor;
        faces.forEach((f) => {
            ctx.fillStyle = this.colors[f.type];
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

class TilingApp {
    constructor() {
        const numAxes = document.getElementById('numAxes');
        const dims = parseInt(numAxes.value, 10);
        numAxes.addEventListener('change', () => {
            this.setState({ dims: parseInt(numAxes.value, 10) });
        });
        this.state = new TilingState(dims);

        const canvas = document.getElementById('main');
        this.tilingView = new TilingView(canvas, this, dims);

        const methodPicker = document.getElementById('tileGen');
        methodPicker.addEventListener('change', () => {
            this.tilingGen = this.getTilingGen(methodPicker.value);
        });
        this.tilingGen = this.getTilingGen(methodPicker.value);

        const axisCanvas = document.getElementById('axisRosette');
        this.axisControls = new AxisControls(axisCanvas, this, dims);
        this.updateAxisControls();
        attachToggle('axisToggle', 'axisControls');

        const offsetsDiv = document.getElementById('offsetControls');
        this.offsetControls = new OffsetControls(offsetsDiv, this, dims);
        this.updateOffsetControls();
        attachToggle('offsetToggle', 'offsetControls');
        document.getElementById('offsetControls').style.display = 'none';

        const resetBtn = document.getElementById('reset');
        resetBtn.addEventListener('click', () => {
            this.state.resetBasis();
            this.updateAxisControls();
            this.redraw();
        });

        this.initColorControls(dims);
        attachToggle('colorToggle', 'colorControls');
        document.getElementById('colorControls').style.display = 'none';

        attachToggle('aboutToggle', 'about');
        document.getElementById('about').style.display = 'none';

        this.animating = false;
        this.animTime = -1;
        const animateBtn = document.getElementById('animate');
        animateBtn.addEventListener('click', () => {
            if (!this.animating) {
                this.startAnimation();
                animateBtn.value = 'Stop animation';
            } else {
                this.stopAnimation();
                animateBtn.value = 'Animate';
            }
        });

        const saveBtn = document.getElementById('save');
        saveBtn.addEventListener('click', () => {
            this.genStateCode((code) => {
                const codeCode = document.getElementById('codeCode');
                codeCode.innerHTML = code;
                window.getSelection().selectAllChildren(codeCode);
                const codeLink = document.getElementById('codeLink');
                codeLink.href = '?a=' + code;
                const codeShow = document.getElementById('codeShow');
                codeShow.classList.add('codeActive');
            });
        });

        const codeDoneBtn = document.getElementById('codeDone');
        codeDoneBtn.addEventListener('click', () => {
            const codeShow = document.getElementById('codeShow');
            codeShow.classList.remove('codeActive');
        });

        const codeInput = document.getElementById('codeInput');
        codeInput.addEventListener('change', () => {
            console.log('loading state code:', codeInput.value);
            codeInput.blur();
            this.loadStateCode(codeInput.value);
        });
        codeInput.addEventListener('blur', () => {
            const codeLoad = document.getElementById('codeLoad');
            codeLoad.classList.remove('codeActive');
        });

        const loadBtn = document.getElementById('load');
        loadBtn.addEventListener('click', () => {
            codeInput.value = '';
            codeInput.focus();
            const codeLoad = document.getElementById('codeLoad');
            codeLoad.classList.add('codeActive');
        });

        this.draw();
        this.needsRedraw = false;
    }

    getTilingGen(method) {
        if (method === 'project') {
            return generateCutProj;
        } else if (method === 'multigrid') {
            return generateMultigrid;
        } else if (method == 'wasm') {
            return generateWasm;
        } else {
            console.error("unknown tiling generator type:", method);
            return generateMultigrid;
        }
    }

    initColorControls(dims) {
        // Use width of main control box because the color controls might be hidden.
        const controlsWidth = document.getElementById('controls').clientWidth;
        const width = Math.floor(controlsWidth / (dims - 1));
        const widthStyle = `${width}px`;

        const colorsDiv = document.getElementById('colorControls');
        let colorIx = 0;
        for (let row = 0; row < dims - 1; row++) {
            let rowDiv = document.createElement('div');
            colorsDiv.append(rowDiv);
            for (let col = 0; col < dims - row - 1; col++) {
                const colorIxHere = colorIx++;
                const ctl = document.createElement('input');
                ctl.type = 'color';
                ctl.value = this.tilingView.colors[colorIxHere];
                ctl.style.width = widthStyle;
                ctl.addEventListener('input', () => {
                    this.tilingView.colors[colorIxHere] = ctl.value;
                    this.redraw();
                });
                rowDiv.prepend(ctl);
            }
        }
    }

    removeColorControls() {
        const colorsDiv = document.getElementById('colorControls');
        const divClone = colorsDiv.cloneNode(false);
        colorsDiv.parentNode.replaceChild(divClone, colorsDiv);
    }

    draw() {
        const faces = this.tilingGen(this.state, this.tilingView.viewWidth, this.tilingView.viewHeight);
        this.tilingView.draw(faces);
        this.axisControls.draw();
    }

    redraw() {
        if (this.needsRedraw) return;
        this.needsRedraw = true;
        window.requestAnimationFrame(() => {
            this.needsRedraw = false;
            this.draw();
        });
    }

    updateAxisControls() {
        // Move axis controls to match the basis vectors.
        this.axisControls.ctls.forEach((ctl, i) => {
            ctl.x = this.state.basis[0][i];
            ctl.y = this.state.basis[1][i];
        });
    }

    axisChanged(changeAxis, x, y) {
        this.state.moveAxis(changeAxis, x, y);
        this.updateAxisControls();
        this.redraw();
    }

    updateOffsetControls() {
        this.state.offset.forEach((offset, i) => {
            this.offsetControls.setOffset(i, offset);
        });
    }

    offsetChanged(i, value) {
        this.state.offset[i] = value;
        this.redraw();
    }

    translateOffset(dx, dy) {
        this.state.translateOffset(dx, dy);
        this.updateOffsetControls();
        this.redraw();
    }

    getState() {
        return {
            dims: this.state.dims,
            basis: this.state.basis,
            offset: this.state.offset,
            lineColor: this.tilingView.lineColor,
            colors: this.tilingView.colors,
        };
    }

    setState(state) {
        this.state.dims = state.dims || 5;
        const numAxes = document.getElementById('numAxes');
        numAxes.value = this.state.dims;

        if (state.basis !== undefined) {
            this.state.basis = state.basis;
        } else {
            this.state.resetBasis();
        }
        if (state.offset !== undefined) {
            this.state.offset = state.offset;
        } else {
            this.state.resetOffset();
        }
        this.tilingView.lineColor = state.lineColor || LINE_COLOR;
        if (state.colors !== undefined) {
            this.tilingView.colors = state.colors;
        } else {
            this.tilingView.initColors(this.state.dims);
        }

        this.axisControls.setNumAxes(this.state.dims);
        this.updateAxisControls();

        this.offsetControls.setNumAxes(this.state.dims);
        this.updateOffsetControls();

        this.removeColorControls();
        this.initColorControls(this.state.dims);

        this.redraw();
    }

    startAnimation() {
        this.animating = true;
        this.animTime = -1;
        window.requestAnimationFrame((t) => this.animate(t));
    }

    stopAnimation() {
        this.animating = false;
    }

    animate(timestamp) {
        if (!this.animating) return;
        const dt = (this.animTime >= 0) ? timestamp - this.animTime : 0;
        this.animTime = timestamp;
        const theta = 2*Math.PI / 3e4 * dt;
        Vec.rotate(this.state.basis[0], 0, 1, theta);
        Vec.rotate(this.state.basis[1], 0, 1, theta);
        this.updateAxisControls();
        this.draw();
        window.requestAnimationFrame((t) => this.animate(t));
    }

    genStateCode(contF) {
        const state = this.getState();
        const blob = encodeState(state);
        const reader = new FileReader();
        reader.addEventListener("loadend", () => {
            const code = reader.result.split(',')[1];
            console.log('generated state code:', code);
            contF(code);
        }, false);
        reader.readAsDataURL(blob);
    }

    loadStateCode(stateCode) {
        const blob = base64ToBlob(stateCode);
        const reader = new FileReader();
        reader.addEventListener("loadend", () => {
            const state = decodeState(reader.result);
            if (state) {
                cleanState(state);
                this.setState(state);
            } else {
                console.error('Failed decoding state code.');
            }
        }, false);
        reader.readAsArrayBuffer(blob);
    }
}

function attachToggle(toggleID, panelID) {
    const toggle = document.getElementById(toggleID);
    toggle.addEventListener('click', () => {
        toggle.classList.toggle('active');
        const panel = document.getElementById(panelID);
        if (panel.style.display === 'none') {
            panel.style.display = 'block';
        } else {
            panel.style.display = 'none';
        }
    });
}

// Enforce some of the invariants that we want states to hold,
// for states that have been deserialized from a state code.
function cleanState(state) {
    // Ensure the basis vectors are unit length and orthogonal.
    Vec.normalize(state.basis[0]);
    state.basis[1] = Vec.makeOrtho(state.basis[1], state.basis[0]);
    Vec.normalize(state.basis[1]);
    if (Vec.norm(state.basis[0]) === 0 || Vec.norm(state.basis[1]) === 0) {
        // If either vector ended up zero, the basis was invalid; just remove it.
        // A new basis will be created by TilingApp.setState().
        delete state.basis;
    }

    // Ensure the offsets are clamped to [0,1].
    for (let i = 0; i < state.dims; i++) {
        state.offset[i] = Math.max(0, Math.min(1, state.offset[i]));
    }
}

function init() {
    const app = new TilingApp();

    const params = new URLSearchParams(document.location.search);
    if (params.has('a')) {
        const stateCode = params.get('a').replace(/ /g, '+');
        console.log('initialising from state code:', stateCode);
        app.loadStateCode(stateCode);
    }
}

if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', () => init);
} else {
    init();
}
