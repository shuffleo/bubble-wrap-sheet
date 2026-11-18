// Extracted verbatim from user upload bubble-ui-old.html.
// Full HTML SHA256: db04dbc6359b223a47e495f2acfdfcda8dfdc43b8c94d9b9dcfa85bc79072c5a

"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.BubblePhysics = void 0;
/** All motion is imperative. No React updates, allocations, or variable-step springs. */
class BubblePhysics {
    constructor(points, onPop) {
        this.points = points;
        this.onPop = onPop;
        this.time = 0;
        this.accumulator = 0;
        const n = points.length;
        this.squish = new Float32Array(n);
        this.velocity = new Float32Array(n);
        this.targetSquish = new Float32Array(n);
        this.isPopped = new Float32Array(n);
        this.resetAt = new Float64Array(n).fill(-1);
        this.neighbors = new Int32Array(n * 6).fill(-1);
        const map = new Map(points.map((p, i) => [`${p.surface}:${p.row}:${p.col}`, i]));
        points.forEach((p, i) => { const odd = p.row & 1; const ds = [[0, -1], [0, 1], [-1, odd - 1], [-1, odd], [1, odd - 1], [1, odd]]; ds.forEach(([r, c], j) => { this.neighbors[i * 6 + j] = map.get(`${p.surface}:${p.row + r}:${p.col + c}`) ?? -1; }); });
    }
    pop(i) {
        if (i < 0 || i >= this.points.length || this.isPopped[i])
            return false;
        if (this.points[i].mode === 'spring-return') {
            this.targetSquish[i] = .78;
            return false;
        }
        this.isPopped[i] = 1;
        this.targetSquish[i] = 1;
        this.velocity[i] = Math.max(this.velocity[i], 10);
        this.resetAt[i] = -1;
        for (let k = 0; k < 6; k++) {
            const j = this.neighbors[i * 6 + k];
            if (j >= 0 && !this.isPopped[j])
                this.velocity[j] -= 1.9;
        }
        this.onPop(i);
        return true;
    }
    press(i, pressure = 1) { if (i < 0 || this.isPopped[i])
        return; this.targetSquish[i] = Math.max(this.targetSquish[i], Math.min(1, pressure) * .9); }
    release(i) { if (i >= 0 && !this.isPopped[i])
        this.targetSquish[i] = 0; }
    reset(surface, immediate = false) {
        const ps = this.points;
        let max = 1;
        for (let i = 0; i < ps.length; i++)
            if (!surface || ps[i].surface === surface)
                max = Math.max(max, ps[i].x + ps[i].y * .6);
        for (let i = 0; i < ps.length; i++)
            if (!surface || ps[i].surface === surface) {
                this.isPopped[i] = 0;
                this.targetSquish[i] = 0;
                this.resetAt[i] = immediate ? -1 : this.time + (ps[i].x + ps[i].y * .6) / max * .55;
                if (immediate) {
                    this.squish[i] = 0;
                    this.velocity[i] = 0;
                }
            }
    }
    hasMotion() { for (let i = 0; i < this.points.length; i++)
        if (this.resetAt[i] >= 0 || Math.abs(this.squish[i] - this.targetSquish[i]) >= .0003 || Math.abs(this.velocity[i]) >= .003)
            return true; return false; }
    step(dt) {
        this.accumulator += Math.min(Math.max(dt, 0), .05);
        let active = false;
        const step = 1 / 120;
        while (this.accumulator >= step) {
            this.accumulator -= step;
            this.time += step;
            for (let i = 0; i < this.points.length; i++) {
                if (this.resetAt[i] >= this.time) {
                    active = true;
                    continue;
                }
                if (this.resetAt[i] >= 0) {
                    this.resetAt[i] = -1;
                    this.targetSquish[i] = this.isPopped[i] ? 1 : 0;
                }
                const x = this.squish[i], v = this.velocity[i], t = this.targetSquish[i];
                if (Math.abs(x - t) < .0003 && Math.abs(v) < .003) {
                    this.squish[i] = t;
                    this.velocity[i] = 0;
                    continue;
                }
                active = true;
                const k = this.isPopped[i] ? 700 : 250;
                const c = this.isPopped[i] ? 34 : 20;
                const nv = v + ((t - x) * k - c * v) * step;
                this.velocity[i] = nv;
                this.squish[i] = Math.max(-.14, Math.min(1.06, x + nv * step));
                if (!this.isPopped[i] && this.points[i].mode === 'poppable' && this.targetSquish[i] >= .75 && this.squish[i] >= .75)
                    this.pop(i);
            }
        }
        return active || this.hasMotion();
    }
}
exports.BubblePhysics = BubblePhysics;

