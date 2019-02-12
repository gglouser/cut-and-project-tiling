import { TilingView, TilingViewState, loadStateCode } from './tilingview.js';
import { AxisControls, OffsetControls } from './controls.js';
import { generateCutProj, generateMultigrid } from './tiling.js';
import { generateWasm } from './tiling_wasm.js';
import { rotate } from './vector.js';

class TilingApp {
    constructor() {
        const numAxes = document.getElementById('numAxes');
        numAxes.addEventListener('change', () => {
            this.setState(new TilingViewState(parseInt(numAxes.value, 10)));
        });
        const dims = parseInt(numAxes.value, 10);
        this.state = new TilingViewState(dims);

        const canvas = document.getElementById('main');
        this.tilingView = new TilingView(canvas, this);

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
            this.state.genStateCode((code) => {
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
            loadStateCode(codeInput.value, (st) => this.setState(st));
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
                ctl.value = this.state.colors[colorIxHere];
                ctl.style.width = widthStyle;
                ctl.addEventListener('input', () => {
                    this.state.colors[colorIxHere] = ctl.value;
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
        this.tilingView.draw(this.state, this.tilingGen);
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

    setState(state) {
        this.state = state;

        document.getElementById('numAxes').value = this.state.dims;
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
        rotate(this.state.basis[0], 0, 1, theta);
        rotate(this.state.basis[1], 0, 1, theta);
        this.updateAxisControls();
        this.draw();
        window.requestAnimationFrame((t) => this.animate(t));
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

function init() {
    const app = new TilingApp();

    const params = new URLSearchParams(document.location.search);
    if (params.has('a')) {
        const stateCode = params.get('a').replace(/ /g, '+');
        console.log('initialising from state code:', stateCode);
        loadStateCode(stateCode, (st) => app.setState(st));
    }
}

if (document.readyState === "loading") {
    document.addEventListener('DOMContentLoaded', () => init);
} else {
    init();
}
