const AXIS_CONTROL_SCALE = 60;
const POINT_SIZE_PX = 4;
const POINT_SIZE = POINT_SIZE_PX/AXIS_CONTROL_SCALE;
const POINT_DIST = ((POINT_SIZE_PX + 4)/AXIS_CONTROL_SCALE)**2;

class ControlPoint {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }

    draw(ctx) {
        ctx.beginPath();
        ctx.arc(this.x, this.y, POINT_SIZE, 0, 2*Math.PI);
        ctx.fill();
    }

    contains(x, y) {
        const dx = x - this.x;
        const dy = y - this.y;
        return dx*dx + dy*dy < POINT_DIST;
    }

    valueChanged() {}

    mouseAction(x, y) {
        this.x = x;
        this.y = y;
        this.valueChanged();
    }
}

export class AxisControls {
    constructor(canvas, app, dims) {
        this.canvas = canvas;
        this.app = app;
        this.tracking = null;
        canvas.width = canvas.clientWidth;
        canvas.height = canvas.clientHeight;
        canvas.addEventListener('mousedown', this, false);
        canvas.addEventListener('mousemove', this, false);
        canvas.addEventListener('mouseup', this, false);
        canvas.addEventListener('touchstart', this, false);
        canvas.addEventListener('touchmove', this, false);
        canvas.addEventListener('touchend', this, false);
        this.setNumAxes(dims);
    }

    setNumAxes(dims) {
        this.ctls = [];
        for (let i = 0; i < dims; i++) {
            const ctl = new ControlPoint(0, 0);
            ctl.valueChanged = () => {
                this.app.axisChanged(i, ctl.x, ctl.y);
            };
            this.ctls.push(ctl);
        }
    }

    draw() {
        const ctx = this.canvas.getContext('2d');
        ctx.save();
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        ctx.translate(this.canvas.width/2, this.canvas.height/2);
        ctx.scale(AXIS_CONTROL_SCALE, AXIS_CONTROL_SCALE);

        ctx.lineWidth = 1/AXIS_CONTROL_SCALE;
        ctx.strokeStyle = 'lightgrey';
        ctx.beginPath();
        ctx.arc(0, 0, Math.sqrt(2/this.ctls.length), 0, 2*Math.PI);
        ctx.stroke();
        ctx.strokeStyle = 'grey';
        ctx.beginPath();
        ctx.arc(0, 0, 1, 0, 2*Math.PI);
        ctx.stroke();

        ctx.strokeStyle = 'black';
        ctx.beginPath();
        for (let i = 0; i < this.ctls.length; i++) {
            ctx.moveTo(0, 0);
            ctx.lineTo(this.ctls[i].x, this.ctls[i].y);
            const j = (i + 1) % this.ctls.length;
            ctx.lineTo(this.ctls[i].x + this.ctls[j].x, this.ctls[i].y + this.ctls[j].y);
            ctx.lineTo(this.ctls[j].x, this.ctls[j].y);
        }
        ctx.stroke();

        ctx.fillStyle = 'black';
        this.ctls.forEach((e) => { e.draw(ctx); });

        ctx.restore();
    }

    handleEvent(event) {
        switch (event.type) {
            case 'mousedown':
                this.mouseDown(event);
                break;
            case 'mousemove':
                this.mouseMove(event);
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
        }
    }

    toLocalPos(x, y) {
        return {
            x: (x - this.canvas.width/2)/AXIS_CONTROL_SCALE,
            y: (y - this.canvas.height/2)/AXIS_CONTROL_SCALE,
        };
    }

    findControl(x, y) {
        const localPos = this.toLocalPos(x, y);
        return this.ctls.find((ctl) => ctl.contains(localPos.x, localPos.y));
    }

    mouseAction(target, x, y) {
        const localPos = this.toLocalPos(x, y);
        target.mouseAction(localPos.x, localPos.y);
    }

    mouseDown(event) {
        this.tracking = this.findControl(event.offsetX, event.offsetY);
    }

    mouseMove(event) {
        if (this.tracking) {
            this.mouseAction(this.tracking, event.offsetX, event.offsetY);
        }
    }

    touchStart(event) {
        // Single touch only
        if (!this.tracking) {
            const touch = event.changedTouches[0];
            const pos = touchPos(touch);
            const target = this.findControl(pos.x, pos.y);
            if (target) {
                event.preventDefault();
                this.tracking = {
                    target,
                    identifier: touch.identifier,
                };
            }
        }
    }

    touchMove(event) {
        if (this.tracking) {
            event.preventDefault();
            const touch = findTouchByID(event.changedTouches, this.tracking.identifier);
            if (touch) {
                const pos = touchPos(touch);
                this.mouseAction(this.tracking.target, pos.x, pos.y);
            }
        }
    }
}

function findTouchByID(touches, id) {
    for (let i = 0; i < touches.length; i++) {
        if (touches[i].identifier === id) {
            return touches[i];
        }
    }
    return null;
}

function touchPos(touch) {
    const rect = touch.target.getBoundingClientRect();
    return {
        x: touch.clientX - rect.left,
        y: touch.clientY - rect.top,
    };
}

export class OffsetControls {
    constructor(offsetControlsDiv, app, dims) {
        this.div = offsetControlsDiv;
        this.app = app;
        this.ctls = [];
        this.lbls = [];
        this.setNumAxes(dims);
    }

    addOffset() {
        const div = document.createElement('div');
        this.div.append(div);

        const offsetIndex = this.ctls.length;
        const ctl = document.createElement('input');
        ctl.type = 'range';
        ctl.min = 0;
        ctl.max = 1;
        ctl.step = 0.01;
        this.ctls.push(ctl);
        div.append(ctl);

        const lbl = document.createElement('span');
        lbl.className = 'offset-label';
        this.lbls.push(lbl);
        div.append(lbl);

        ctl.addEventListener('input', (event) => {
            lbl.innerHTML = ctl.valueAsNumber.toFixed(2);
            this.app.offsetChanged(offsetIndex, ctl.valueAsNumber);
        });
    }

    removeOffset() {
        this.div.removeChild(this.div.lastChild);
        this.ctls.pop();
        this.lbls.pop();
    }

    setNumAxes(dims) {
        while (this.ctls.length > dims) {
            this.removeOffset();
        }
        while (this.ctls.length < dims) {
            this.addOffset();
        }
    }

    setOffset(i, offset) {
        this.ctls[i].valueAsNumber = offset;
        this.lbls[i].innerHTML = offset.toFixed(2);
    }
}
