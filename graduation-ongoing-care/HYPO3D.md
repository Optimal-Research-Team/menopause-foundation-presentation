# `<hypo-3d>` — the hot-flash switch in real-time 3-D

A WebGL (vanilla Three.js r186.1) version of anatomy figure **A2 · The hot-flash switch**
(`optimal-anatomy-figures/figures/a2-hypothalamus/`), built for slide 3 of the Ongoing Care deck.
Same anatomy, same four states, same numbers and logic as A2 — every structure is now a lit volume.

## What it shows

A block of **cleared hypothalamic tissue**, cut just across the midline (front of the head on the
left, as in A2). The block is a translucent pink volume, so the structures inside read at their
true depths and fade the deeper they sit:

- **In the tissue:** the fornix arching from the top cut down to the mammillary body; the anterior
  commissure crossing the block (cut at both faces); the lamina terminalis and hypothalamic sulcus
  painted on the cut face; small vessels wandering in depth plus deep penetrating vessels; glial
  nuclei through the volume and on every cut face; on the top cut, the internal capsule's V; on the
  back cut, the white-matter band.
- **KNDy cells (8)** in the arcuate nucleus at the base — glossy plum somas that flow into
  branching dendrites. Four beaded axons run up to the **heat-loss centre (MnPO, 6 teal cells with
  NK3 receptor dots)** by the lamina terminalis; three short ones run to the median eminence.
- **Signals:** neurokinin-B packets travel the axons as glowing beads; the KNDy burst, the MnPO's
  drive and the hot flash are light *inside* the tissue (integrated along each view ray); in a
  flash the MnPO cells turn orange and a pulse train runs out toward the brainstem.
- **Estrogen:** amber hexagonal prisms leave the vessels, drift and dock on KNDy cells — as many as
  the estrogen level.
- **Below the block:** the optic chiasm with its nerve stump (anterior), the mammillary body
  (posterior), the infundibular funnel with three portal capillary loops (A2's), the stalk, long
  portal vessels branching over the anterior lobe, the anterior and posterior lobes, all cradled in
  a bony sella cup with porous cut ends. A soft contact shadow grounds it.

No text inside WebGL — the slide does all typography.

## Files

| Path | What |
|---|---|
| `hypo3d.js` | **The shipped bundle** — one self-contained ES module (three.js tree-shaken in; MIT notice at EOF). ~634 KB raw / ~168 KB gzip. |
| `src/hypo3d.src.js` | The custom element: lifecycle, API, loop, tour, events, drag, print snapshot, adaptive resolution. |
| `src/hypo3d-model.js` | **A2's model, ported verbatim** (`KNDY`, `kndyOf`, `meanDrive`, `wanderAt`), `STAGES`, and the simulation (`Sim`, a port of live.js `step()`). |
| `src/hypo3d-anatomy.js` | A2's section geometry (build.mjs, same `curve()` sampling so path lengths match) lifted into 3-D. |
| `src/hypo3d-geo.js` | Geometry helpers (organic blobs, tapered tubes, sweeps, merge, creased normals). |
| `src/hypo3d-scene.js` | Materials, meshes, studio environment, and the render pipeline. |
| `tools/build-hypo3d.sh` | Reproducible build + audit. |
| `tools/hypo3d-lab.html` | Test harness (1920×1080 cream frame, element at the slide position, stage buttons, readouts). |

## API

```html
<script type="module" src="hypo3d.js"></script>
<hypo-3d stage="before" autotour></hypo-3d>
```

| | |
|---|---|
| `stage` attribute / property | `"before"` \| `"after"` \| `"therapy"` \| `"nonhormonal"`. Changes morph smoothly (A2's easing: estrogen state eases at rate 1.4/s; size, burst rate, packets and estrogen count follow the model; colour changes ease 0.16–0.35 s). Unknown values fall back to `before`. |
| `autotour` attribute / `autoTour` property | A2's idle tour: before → after → therapy → nonhormonal, 12 s each; any stage set from outside or a drag pauses it, and it resumes after 9 s idle (live.js logic). |
| `paused` attribute | Present at connect time → starts paused. Otherwise it starts playing when connected. |
| `play()` / `pause()` | Host calls on slide enter / leave. Nothing renders while paused. Also pauses automatically while `document.hidden`, and idles (no rAF, a 300 ms poll) while it computes as `visibility: hidden` (deck-stage's inactive slides). |
| `snapshotForPrint()` | Renders one full-resolution frame and shows it as an `<img>` (PNG data URL) over a hidden canvas; returns the data URL (or `null` if WebGL is unavailable). |
| `restoreFromPrint()` | Removes the image, shows the canvas again. |
| event `hypo-stage` | `detail: { stage }` on every stage change (host-set or tour). Bubbles, composed. |
| event `hypo-flash` | `detail: { on: true \| false }` when a hot flash starts / ends (A2: flash lasts 3.6 s). |
| `static STAGES` (also exported) | Per-stage readouts computed exactly as A2's `setState()` (see below). `customElements.get("hypo-3d").STAGES.after.kndySize === "194%"` |
| `stats()` | QA: draw calls, triangles, fps, size, effective DPR. |
| `renderAt(t, {yaw, pitch})` / `renderStill()` | QA: deterministic stills (seeded randomness, no sway); stop the loop until `play()`. |

`STAGES[name] = { index, e, blocked, estrogen, kndySize, hotFlashes, line }`:

| stage | e | estrogen | kndySize | hotFlashes | blocked |
|---|---|---|---|---|---|
| before | 1 | Cycling | 100% | Rare | – |
| after | 0 | Low | 194% | ≈ 1.1 an hour | – |
| therapy | 0.85 | Replaced | Smaller | Fewer, typically | – |
| nonhormonal | 0 | Low | 194% | Fewer, typically | ✓ |

`line` is A2's scene sentence for that state (build.mjs `LINES`), verbatim.

**Pointer:** drag turns the specimen (±35° yaw, −10…+12° pitch) and it eases back on release. Every
pointer/mouse/touch/click/wheel event inside the element calls `stopPropagation()` (the deck
navigates on clicks). Sizing comes from `offsetWidth/offsetHeight` (ResizeObserver), so the deck's
scale transform doesn't distort it; device pixel ratio is capped at 2.

### Host wiring (sketch)

```js
const hypo = document.querySelector("hypo-3d");
deck.addEventListener("slidechange", (e) => (e.detail.slide.contains(hypo) ? hypo.play() : hypo.pause()));
addEventListener("beforeprint", () => hypo.snapshotForPrint());
addEventListener("afterprint", () => hypo.restoreFromPrint());
hypo.addEventListener("hypo-stage", (e) => showReadouts(customElements.get("hypo-3d").STAGES[e.detail.stage]));
```

Give the element an accessible name on the host side (e.g. `role="img" aria-label="…"`), as A2's
SVG does; the canvas inside is `aria-hidden`.

## Which A2 numbers drive what

All from `figures/a2-hypothalamus/model.mjs` and `live.js` (sources: truth-pack §1 and "A2").

| A2 value | Drives |
|---|---|
| `KNDY.area` 1.94 (Rance & Young 1991; % LOW) → `kndyOf(e).scale = √area` | KNDy soma + dendrite size (diameter × 1.39 after menopause; × 1.07 under therapy) and the burst-glow radius |
| `KNDY.burst` [3.4, 1.7] s (ILLUSTRATIVE) | Seconds between bursts; each burst lights the cluster (glow decays τ = 0.28 s, drawn 0.18 + 0.82 × glow) |
| `KNDY.packets` [2, 4] (ILLUSTRATIVE) | NKB packets per axon per burst, travelling 150 units/s along A2's own axon paths (so arrivals, and the drive, match A2 exactly) |
| `KNDY.k` 0.034, `tau` 2.5 s, `axons` 4 | Heat-loss centre drive: + k per arriving packet, leaky decay τ; `meanDrive` = 0.20 before, 0.80 after |
| `wanderAt(t)`, `swing` 0.22 | The natural wander added to the drive; the MnPO drive glow is 0.12 + 0.7 × min(1, drive + wander) |
| tipping point 1, `refractory` 6 s, flash 3.6 s, pulses every 0.11 s for 2.6 s at 230 units/s | Hot flash: MnPO turns orange (flash ∈ [0, 3) s), heat glow `h` (A2's formula), pulse train toward the brainstem; `hypo-flash` events |
| `KNDY.therapy` 0.85 (ILLUSTRATIVE) | Hormone-therapy estrogen state |
| `KNDY.blocked` 0.2 (ILLUSTRATIVE) | Non-hormonal: share of the signal received; receptor dots greyed, MnPO desaturated |
| estrogen count `round(30 × e)`, spawn rate, drift, docking test `10·sc + 3`, dwell 1.2–2.4 s, fade 0.6 s | Estrogen molecules (docking runs in A2's section plane, unchanged) |
| A2 `renderStill()` | Reduced-motion stills: after = mid-flash with signal on the axons; before = just after a burst |
| Fig 1 `rateOf(1)` ≈ 0 / `rateOf(0)` = 1.1 per hour | `STAGES.*.hotFlashes` readouts |

The port is checked against A2's `live.js` drive/flash logic run on the same paths: over 300 s
the flash start times are identical in all four states (after: 40 flashes; before / therapy /
non-hormonal: none).

Drawn, not sourced (as in A2): the 3-D depths of structures inside the block, cell drawing radius
(KNDy 9.2, MnPO 8.0 section units — size *changes* come only from the model), the tissue haze,
glows, colours and the camera.

## Rendering approach

1. **Thickness pass** — the block's back faces write view depth (`rtB`, R16F).
2. **Solids** — everything opaque renders into `rtO` (RGBA16F, 4× MSAA, depth texture):
   `MeshPhysicalMaterial` with a small shader patch (wrap-light subsurface band + back-light,
   a view-facing "nucleus" glow on cells, object-space procedural micro-relief, colour mottling and
   roughness breakup), a procedural PMREM studio environment, a warm key with a cached shadow map
   for the pituitary/sella, a cool rim, and the contact shadow (canvas-painted once).
3. **Tissue composite** — the block's front faces composite the volume over `rtO` on the canvas:
   Beer–Lambert haze with a soft onset (shallow midline nuclei stay crisp, deep tissue veils),
   measured from the cut face to the nearest solid; MSAA-correct (the covered fraction uses the
   nearest solid depth, the uncovered fraction runs to the back cut); a depth-scaled frost blur;
   cloudy density variation; three glows integrated analytically along each ray (erf); cut-face
   speckle and painted cut anatomy; rim lines on the rounded edges; wet studio specular.
4. **Halos** on packets and pulses, occluded by solids and faded by depth.

Tone mapping (Khronos PBR Neutral) and sRGB encoding are applied per pixel on straight colour
and re-premultiplied, so the transparent canvas composites cleanly on the cream slide.

**Cost:** 35 draw calls and ~215 k triangles per frame (all three passes); instancing for beads,
receptors, packets, pulses, estrogen and glial nuclei; no postprocessing stack; one shadow map,
rendered once. Measured headless on an Apple M4 (sharing the GPU with another browser session):
60 fps at 1040×820 × DPR 1, ~45–60 fps at DPR 2. An **adaptive resolution governor** steps the
pixel ratio down 15 % at a time when frames average slower than 50 fps for 1.5 s (it settled at
1.7× there), steps back up with sustained headroom, and gives up (restoring full resolution) if
stepping down doesn't help — e.g. a 30 Hz low-power cap. Print snapshots always render at full
resolution.

## Build

```bash
bash tools/build-hypo3d.sh                      # npm pack three@0.186.1 → esbuild 0.25.10 → hypo3d.js → audit
THREE_PKG=/path/to/extracted/package bash tools/build-hypo3d.sh   # reuse an extracted package
```

The script fails if the bundle contains any of
`localStorage|sessionStorage|indexedDB|document.cookie|serviceWorker|CacheStorage|fetch(|XMLHttpRequest|sendBeacon|action=`
or lacks the three.js MIT notice. Only named three classes are imported, so the loaders (which
contain `fetch(`) are tree-shaken out. The two absolute URLs left in the bundle are inert strings
inside three.js (the XHTML namespace and a citation in a shader comment). Runtime: zero network,
no storage; all textures are generated in code.

## Lab

Serve the route folder (`python3 -m http.server 8765`) and open `/tools/hypo3d-lab.html`.
Query params: `stage=`, `t=4.2&still=1` (deterministic freeze, no sway), `flash=1` (A2's
reduced-motion still: after = mid-flash), `yaw=`/`pitch=` (degrees, stills), `autotour=1`,
`paused=1`, `fit=0` (no window scaling), `ui=0` (element only), `box=1` (outline the element),
`stats=1` (live fps / calls / triangles).

## Known limits / notes for review

- **A2's own flash cadence:** A2's NOTES say the post-menopause centre "tips about every 10–20 s
  on screen", but A2's `live.js` (and this faithful port) tips every ~6.5–8.6 s once settled
  (the 6 s refractory is usually the limiter). I kept the code's behaviour; if the slower cadence
  is wanted, that's a change to A2's numbers (e.g. `refractory`), not to this port.
- **No WebGL → blank element.** If WebGL is unavailable the element stays empty (a console warning
  is logged and `snapshotForPrint()` returns `null`); the host could fall back to an A2 still.
- **Reduced motion:** no loop and no sway; stage changes re-render A2's still. A drag still turns
  the view (user-initiated), but it doesn't ease back.
- Starts playing when connected (unless `paused`); it idles itself while CSS-hidden, but the host
  should still call `pause()` on inactive slides.
- Device-pixel-ratio changes are picked up within ~0.25 s while playing (no matchMedia listener).
- Context loss is handled (environment regenerated on restore); the GL context isn't disposed on
  `disconnectedCallback` (re-attaching reuses it).
- Performance numbers above are headless measurements, not a MacBook Air in a visible window.
