// <hypo-3d>: A2 "The hot-flash switch" as a real-time 3-D specimen (vanilla Three.js r186).
//
// A block of cleared hypothalamic tissue, cut at the midline: KNDy cells at the base signal the
// heat-loss centre (MnPO) by the lamina terminalis; estrogen from the vessels keeps them small
// and quiet. Four states, the same numbers and logic as A2 (src/hypo3d-model.js).
//
//   <hypo-3d stage="before" autotour></hypo-3d>
//   el.stage = "after" | "therapy" | "nonhormonal" | "before"; el.play(); el.pause();
//   el.snapshotForPrint(); el.restoreFromPrint();  customElements.get("hypo-3d").STAGES
//   events: hypo-stage {stage}, hypo-flash {on}
//
// No network, no storage: everything is generated in code.
import { HypoScene } from "./hypo3d-scene.js";
import { Sim, STAGES, STAGE_ORDER, KNDY, kndyOf, meanDrive } from "./hypo3d-model.js";
import { SIM_ANATOMY } from "./hypo3d-anatomy.js";

const DEG = Math.PI / 180;
const VIEW = { yaw: 21 * DEG, pitch: 21 * DEG }; // a 3/4 view close to A2's (front, top and back end showing)
const SWAY = { yaw: 8 * DEG, pitch: 3 * DEG, period: 14 }; // idle sway
const DRAG = { yaw: 35 * DEG, pitch: 12 * DEG };
const TOUR_SECONDS = 12; // A2 live.js: the idle tour changes state every 12 s …
const TOUR_IDLE_MS = 9000; // … and resumes 9 s after the last input

const CSS = `:host{display:block;position:relative;-webkit-user-select:none;user-select:none;-webkit-tap-highlight-color:transparent}
.wrap{position:absolute;inset:0;overflow:hidden}
canvas{display:block;width:100%;height:100%;touch-action:none;cursor:grab;outline:none}
canvas.drag{cursor:grabbing}
img{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none}`;

const STOP_EVENTS = ["pointerdown", "pointerup", "pointermove", "pointercancel", "click", "dblclick", "mousedown", "mouseup", "touchstart", "touchend", "touchmove", "contextmenu", "wheel"];

class Hypo3D extends HTMLElement {
  /** Per-stage readouts, exactly A2's (live.js setState + build.mjs DATA.rate): see hypo3d-model.js. */
  static STAGES = STAGES;
  static STAGE_ORDER = STAGE_ORDER;
  static get observedAttributes() {
    return ["stage", "autotour"];
  }

  constructor() {
    super();
    const root = this.attachShadow({ mode: "open" });
    root.innerHTML = `<style>${CSS}</style><div class="wrap"><canvas aria-hidden="true"></canvas></div>`;
    this._root = root;
    this._wrap = root.querySelector(".wrap");
    this._canvas = root.querySelector("canvas");
    this._stage = STAGES[this.getAttribute("stage")] ? this.getAttribute("stage") : "before";
    this._playing = !this.hasAttribute("paused");
    this._raf = 0;
    this._poll = 0;
    this._last = 0;
    this._sway = 0;
    this._drag = { yaw: 0, pitch: 0, on: false, id: -1, x: 0, y: 0, y0: 0, p0: 0 };
    this._touring = true;
    this._idleAt = -1e9;
    this._tourClock = 0;
    this._fromTour = false;
    this._frozen = false;
    this._flashOn = false;
    this._silent = false;
    this._w = 0;
    this._h = 0;
    this._dpr = 1;
    this._frames = 0;
    this._fps = 0;
    this._q = 1; // adaptive resolution factor (1 = full devicePixelRatio, capped at 2)
    this._qT = 0;
    this._qN = 0;
    this._qGood = 0;
    this._fpsT = 0;
    this._fpsN = 0;
    this._reduceMQ = typeof matchMedia === "function" ? matchMedia("(prefers-reduced-motion: reduce)") : { matches: false, addEventListener() {}, removeEventListener() {} };

    this._tick = this._tick.bind(this);
    this._onVis = () => (document.hidden ? this._halt() : this._kick());
    this._onReduce = () => {
      if (this._reduceMQ.matches) {
        this._halt();
        this._still();
      } else this._kick();
    };
    this._stop = (e) => e.stopPropagation();
    this._onDown = this._onDown.bind(this);
    this._onMove = this._onMove.bind(this);
    this._onUp = this._onUp.bind(this);
  }

  // ------------------------------------------------------------ attributes / properties
  get stage() {
    return this._stage;
  }
  set stage(v) {
    this.setAttribute("stage", String(v));
  }
  get autoTour() {
    return this.hasAttribute("autotour");
  }
  set autoTour(v) {
    this.toggleAttribute("autotour", !!v);
  }
  get playing() {
    return this._playing;
  }

  attributeChangedCallback(name, _old, val) {
    if (name === "stage") {
      const s = STAGES[val] ? val : "before";
      if (s === this._stage && this._sim) return;
      const user = !this._fromTour;
      this._stage = s;
      if (!this._sim) return;
      this._applyStage(user);
    } else if (name === "autotour") {
      this._touring = this.autoTour;
      this._tourClock = 0;
      this._idleAt = -1e9;
    }
  }

  // ------------------------------------------------------------ lifecycle
  connectedCallback() {
    if (!this._scene) {
      try {
        this._scene = new HypoScene(this._canvas);
      } catch (err) {
        this._scene = null;
        this._failed = true;
        console.warn("<hypo-3d>: WebGL unavailable", err);
        return;
      }
      this._sim = new Sim(SIM_ANATOMY);
      this._sim.onFlash = (on) => this._emitFlash(on);
      const st = STAGES[this._stage];
      this._sim.reset(st.e, st.blocked);
      // A2 warms up 5 s before the first frame
      this._silent = true;
      for (let i = 0; i < 300; i++) this._sim.step(1 / 60);
      this._silent = false;
      this._canvas.addEventListener("webglcontextlost", (e) => {
        e.preventDefault();
        this._lost = true;
        this._halt();
      });
      this._canvas.addEventListener("webglcontextrestored", () => {
        this._lost = false;
        this._scene.restore();
        this._dirty = true;
        this._kick();
        if (this._reduceMQ.matches || this._frozen) this._renderFrame();
      });
    }
    this._ro = new ResizeObserver(() => this._resize());
    this._ro.observe(this);
    document.addEventListener("visibilitychange", this._onVis);
    this._reduceMQ.addEventListener("change", this._onReduce);
    for (const t of STOP_EVENTS) this.addEventListener(t, this._stop);
    this._canvas.addEventListener("pointerdown", this._onDown);
    this._canvas.addEventListener("pointermove", this._onMove);
    this._canvas.addEventListener("pointerup", this._onUp);
    this._canvas.addEventListener("pointercancel", this._onUp);
    this._resize();
    if (this._reduceMQ.matches) this._still();
    else this._kick();
  }

  disconnectedCallback() {
    this._halt();
    if (this._ro) this._ro.disconnect();
    document.removeEventListener("visibilitychange", this._onVis);
    this._reduceMQ.removeEventListener("change", this._onReduce);
    for (const t of STOP_EVENTS) this.removeEventListener(t, this._stop);
    this._canvas.removeEventListener("pointerdown", this._onDown);
    this._canvas.removeEventListener("pointermove", this._onMove);
    this._canvas.removeEventListener("pointerup", this._onUp);
    this._canvas.removeEventListener("pointercancel", this._onUp);
  }

  // ------------------------------------------------------------ public API
  /** Start (or resume) animating. The host calls this when the slide becomes active. */
  play() {
    this._playing = true;
    this._frozen = false;
    if (this._reduceMQ.matches) this._still();
    else this._kick();
  }
  /** Stop animating; nothing renders while paused. */
  pause() {
    this._playing = false;
    this._halt();
  }
  /** Render one crisp frame and show it as an <img> over the canvas (print never depends on WebGL). */
  snapshotForPrint() {
    if (!this._scene || this._lost) return null;
    if (this._q < 1) {
      // print at full resolution even if the live view had stepped down
      this._q = 1;
      this._resize();
    }
    this._renderFrame();
    let url = null;
    try {
      url = this._canvas.toDataURL("image/png");
    } catch (_) {
      return null;
    }
    let img = this._root.querySelector("img");
    if (!img) {
      img = document.createElement("img");
      img.alt = "";
      img.decoding = "sync";
      this._wrap.appendChild(img);
    }
    img.src = url;
    this._canvas.style.visibility = "hidden";
    return url;
  }
  /** Undo snapshotForPrint(). */
  restoreFromPrint() {
    const img = this._root.querySelector("img");
    if (img) img.remove();
    this._canvas.style.visibility = "";
  }
  /** Draw calls, triangles and a running fps estimate (for QA). */
  stats() {
    return this._scene ? { ...this._scene.stats(), fps: Math.round(this._fps), width: this._w, height: this._h, dpr: +this._dpr.toFixed(2), meanDrive: { before: meanDrive(1), after: meanDrive(0) } } : null;
  }
  /**
   * Deterministic still for QA/screenshots: run the model `t` seconds from the stage's settled
   * state (seeded randomness), no sway; optional view offsets in degrees. Stops the loop until play().
   */
  renderAt(t, { yaw = 0, pitch = 0 } = {}) {
    if (!this._scene) return;
    this._frozen = true;
    this._halt();
    const st = STAGES[this._stage];
    this._sim.setTarget(st.e, st.blocked);
    this._silent = true;
    this._sim.seek(t);
    this._silent = false;
    this._syncFlash();
    this._drag.yaw = yaw * DEG;
    this._drag.pitch = pitch * DEG;
    this._sway = 0;
    this._renderFrame();
  }
  /** A2's reduced-motion still for the current stage (after: mid-flash; before: just after a burst). */
  renderStill(opts = {}) {
    if (!this._scene) return;
    this._frozen = true;
    this._halt();
    if (opts.yaw !== undefined) this._drag.yaw = opts.yaw * DEG;
    if (opts.pitch !== undefined) this._drag.pitch = opts.pitch * DEG;
    this._still();
  }

  // ------------------------------------------------------------ internals
  _emitFlash(on) {
    if (this._silent) return;
    if (on === this._flashOn) return;
    this._flashOn = on;
    this.dispatchEvent(new CustomEvent("hypo-flash", { detail: { on }, bubbles: true, composed: true }));
  }
  _syncFlash() {
    const on = this._sim.flash >= 0;
    if (on !== this._flashOn) this._emitFlash(on);
  }
  _applyStage(user) {
    const st = STAGES[this._stage];
    this._sim.setTarget(st.e, st.blocked);
    if (user) this._takeOver();
    this.dispatchEvent(new CustomEvent("hypo-stage", { detail: { stage: this._stage }, bubbles: true, composed: true }));
    if (this._reduceMQ.matches || this._frozen) this._still();
  }
  _takeOver() {
    this._touring = false;
    this._idleAt = performance.now();
  }
  _still() {
    if (!this._scene) return;
    this._silent = true;
    this._sim.still();
    this._silent = false;
    this._syncFlash();
    this._sway = 0;
    this._renderFrame();
  }
  _resize() {
    if (!this._scene) return;
    const w = this.offsetWidth, h = this.offsetHeight;
    const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1) * this._q);
    if (!w || !h) return;
    if (w === this._w && h === this._h && dpr === this._dpr) return;
    this._w = w;
    this._h = h;
    this._dpr = dpr;
    this._scene.setSize(w, h, dpr);
    // a resize clears the canvas: redraw if nothing else will
    if (this._reduceMQ.matches || this._frozen) this._renderFrame();
    else this._dirty = true;
  }
  _visibleByCss() {
    if (!this.isConnected || this.offsetWidth === 0) return false;
    return getComputedStyle(this).visibility !== "hidden";
  }
  _shouldRun() {
    return this._playing && !this._frozen && !this._lost && !!this._scene && !document.hidden && this.isConnected && !this._reduceMQ.matches;
  }
  _kick() {
    if (this._raf || this._poll || !this._shouldRun()) return;
    this._last = 0;
    this._raf = requestAnimationFrame(this._tick);
  }
  _halt() {
    if (this._raf) cancelAnimationFrame(this._raf);
    if (this._poll) clearTimeout(this._poll);
    this._raf = 0;
    this._poll = 0;
  }
  _tick(now) {
    this._raf = 0;
    if (!this._shouldRun()) return;
    // safety net: a slide hidden by CSS (deck-stage: visibility hidden) idles without rendering
    if (this._frames++ % 15 === 0) {
      this._hiddenByCss = !this._visibleByCss();
      if ((window.devicePixelRatio || 1) !== this._dprSeen) {
        this._dprSeen = window.devicePixelRatio || 1;
        this._resize();
      }
    }
    if (this._hiddenByCss) {
      this._pollHidden();
      return;
    }
    const dt = Math.min(0.05, this._last ? (now - this._last) / 1000 : 1 / 60);
    this._last = now;
    // fps estimate
    this._fpsT += dt;
    this._fpsN++;
    if (this._fpsT > 0.5) {
      this._fps = this._fpsN / this._fpsT;
      this._fpsT = 0;
      this._fpsN = 0;
    }
    // adaptive resolution: if frames are slow for a couple of seconds, render fewer pixels; give
    // them back when there is headroom (hysteresis, so it never oscillates)
    this._qT += dt;
    this._qN++;
    if (this._qN >= 90) {
      const avg = this._qT / this._qN;
      const top = Math.min(2, window.devicePixelRatio || 1);
      if (this._qCheck) {
        // we just stepped down: if it did not help (a 30 Hz cap, not the GPU), undo and stop adapting
        if (avg > this._qCheck * 0.88) {
          this._q = Math.min(1, this._q + 0.15);
          this._qLocked = true;
          this._resize();
        }
        this._qCheck = 0;
      } else if (!this._qLocked && avg > 1 / 50 && this._dpr > 1.01) {
        this._qCheck = avg;
        this._q = Math.max(1 / top, this._q - 0.15);
        this._qGood = 0;
        this._resize();
      } else if (avg < 1 / 58 && this._q < 1) {
        if (++this._qGood >= 4) {
          this._q = Math.min(1, this._q + 0.1);
          this._qGood = 0;
          this._resize();
        }
      } else this._qGood = 0;
      this._qT = 0;
      this._qN = 0;
    }
    // A2's idle tour
    if (this.autoTour) {
      if (!this._touring && now - this._idleAt > TOUR_IDLE_MS && !this._drag.on) this._touring = true;
      if (this._touring && (this._tourClock += dt) > TOUR_SECONDS) {
        this._tourClock = 0;
        const next = STAGE_ORDER[(STAGE_ORDER.indexOf(this._stage) + 1) % STAGE_ORDER.length];
        this._fromTour = true;
        this.setAttribute("stage", next);
        this._fromTour = false;
      }
    }
    this._sim.step(dt);
    this._sway += dt;
    // drag eases back after release
    if (!this._drag.on) {
      const k = 1 - Math.exp(-dt / 0.55);
      this._drag.yaw -= this._drag.yaw * k;
      this._drag.pitch -= this._drag.pitch * k;
    }
    this._renderFrame(dt);
    this._raf = requestAnimationFrame(this._tick);
  }
  /** While CSS-hidden: no rAF at all, just a cheap check every 300 ms. */
  _pollHidden() {
    this._poll = setTimeout(() => {
      this._poll = 0;
      if (!this._shouldRun()) return;
      this._hiddenByCss = !this._visibleByCss();
      if (this._hiddenByCss) this._pollHidden();
      else {
        this._last = 0;
        this._raf = requestAnimationFrame(this._tick);
      }
    }, 300);
  }
  _view() {
    const sw = this._reduceMQ.matches || this._frozen ? 0 : 1;
    const ph = (2 * Math.PI * this._sway) / SWAY.period;
    return {
      yaw: VIEW.yaw + sw * SWAY.yaw * Math.sin(ph) + this._drag.yaw,
      pitch: VIEW.pitch + sw * SWAY.pitch * Math.sin(ph + Math.PI / 2) + this._drag.pitch,
    };
  }
  _renderFrame(dt = 0) {
    if (!this._scene || this._lost || !this._w) return;
    const v = this._view();
    this._scene.setView(v.yaw, v.pitch);
    this._scene.update(this._sim, dt);
    this._scene.render();
    this._dirty = false;
  }

  // ------------------------------------------------------------ pointer: drag to turn the specimen
  _onDown(e) {
    if (e.button !== undefined && e.button !== 0) return;
    const d = this._drag;
    d.on = true;
    d.id = e.pointerId;
    d.x = e.clientX;
    d.y = e.clientY;
    d.y0 = d.yaw;
    d.p0 = d.pitch;
    // client px → element px (deck-stage scales the slide with a CSS transform)
    const r = this.getBoundingClientRect();
    d.scale = this.offsetWidth ? r.width / this.offsetWidth : 1;
    try {
      this._canvas.setPointerCapture(e.pointerId);
    } catch (_) {}
    this._canvas.classList.add("drag");
    this._takeOver();
  }
  _onMove(e) {
    const d = this._drag;
    if (!d.on || e.pointerId !== d.id) return;
    const s = d.scale || 1;
    const dx = (e.clientX - d.x) / s;
    const dy = (e.clientY - d.y) / s;
    const span = Math.max(240, this.offsetWidth * 0.5);
    d.yaw = Math.max(-DRAG.yaw, Math.min(DRAG.yaw, d.y0 - (dx / span) * DRAG.yaw));
    d.pitch = Math.max(-10 * DEG, Math.min(DRAG.pitch, d.p0 + (dy / span) * DRAG.pitch * 1.4));
    this._idleAt = performance.now();
    if (!this._raf && !this._poll) {
      // not animating (reduced motion / paused / still): draw on demand
      this._raf = requestAnimationFrame(() => {
        this._raf = 0;
        this._renderFrame();
        this._kick();
      });
    }
  }
  _onUp(e) {
    const d = this._drag;
    if (!d.on || e.pointerId !== d.id) return;
    d.on = false;
    this._canvas.classList.remove("drag");
    try {
      this._canvas.releasePointerCapture(e.pointerId);
    } catch (_) {}
    this._idleAt = performance.now();
  }
}

if (!customElements.get("hypo-3d")) customElements.define("hypo-3d", Hypo3D);

export { Hypo3D, STAGES, STAGE_ORDER, KNDY, kndyOf, meanDrive };
export default Hypo3D;
