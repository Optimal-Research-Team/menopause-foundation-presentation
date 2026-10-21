// <hypo-3d> anatomy: A2's section geometry (build.mjs), lifted into 3-D.
//
// Section coordinates are A2's: x runs from the front of the head (left) to the back (right),
// y runs down. The 3-D world keeps those units: X = x − CX, Y = CY − y, and Z is depth, with the
// midline plane at Z = 0 and the tissue block running laterally away from the viewer (−Z).
// The block's front cut sits just in front of the midline (Z = ZF) so the midline nuclei read
// through a thin layer of cleared tissue and deeper structures fade with depth.
import { measure } from "./hypo3d-model.js";

export const CX = 297;
export const CY = 330;
export const ZF = 18; //   front cut (just across the midline)
export const ZB = -176; // back cut (to the side of the brain)
export const BX0 = 74; //  the block's cut ends (A2 build.mjs BX0/BX1/BY0)
export const BX1 = 520;
export const BY0 = 150;

/** A2 build.mjs curve(): sampled Catmull-Rom centreline (identical, so path lengths match A2). */
export function curve(points, samples = 12) {
  const out = [];
  const n = points.length;
  for (let i = 0; i < n - 1; i++) {
    const p0 = points[Math.max(0, i - 1)], p1 = points[i], p2 = points[i + 1], p3 = points[Math.min(n - 1, i + 2)];
    for (let s = 0; s < samples; s++) {
      const t = s / samples, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  out.push(points[n - 1]);
  return out;
}
const r1 = (p) => [+p[0].toFixed(1), +p[1].toFixed(1)];
const smoothstep = (a, b, x) => {
  const t = Math.max(0, Math.min(1, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

// ---------------------------------------------------------------- neurons (A2 positions; z added)
// KNDy cells of the arcuate (infundibular) nucleus: periventricular, a 3-D cluster near the midline.
const KNDY2 = [[262, 402], [282, 390], [302, 400], [322, 388], [342, 402], [276, 416], [314, 416], [298, 380]];
const KNDY_Z = [-8, -22, -4, -16, -10, -2, -14, -26];
export const KNDY_POS = KNDY2.map(([x, y], i) => [x, y, KNDY_Z[i]]);
// Heat-loss centre: the median preoptic nucleus (MnPO), a midline nucleus by the lamina terminalis.
const MNPO2 = [[160, 226], [180, 214], [200, 228], [170, 246], [192, 248], [212, 242]];
const MNPO_Z = [-8, -18, -4, -16, -6, -14];
export const MNPO_POS = MNPO2.map(([x, y], i) => [x, y, MNPO_Z[i]]);

// ---------------------------------------------------------------- paths (A2 build.mjs, verbatim 2-D)
const AXONS2 = [0, 1, 3, 4].map((ki, j) => {
  const [x, y] = KNDY2[ki];
  const [mx, my] = MNPO2[[2, 4, 5, 1][j]];
  return curve([[x, y], [x - 20 - j * 6, y - 40], [250 - j * 8, 320 - j * 4], [214 - j * 4, 282 - j * 3], [mx + 4, my + 6]], 10).map(r1);
});
const AXON_ENDS = [0, 1, 3, 4].map((ki, j) => [KNDY_Z[ki], MNPO_Z[[2, 4, 5, 1][j]]]);
const DOWN_SRC = [[2, [286, 448]], [5, [300, 452]], [6, [314, 448]]];
const DOWN2 = DOWN_SRC.map(([ki, end]) => curve([KNDY2[ki], [(KNDY2[ki][0] + end[0]) / 2 + 4, (KNDY2[ki][1] + end[1]) / 2], end], 8).map(r1));
const OUT2 = curve([[206, 240], [252, 262], [340, 296], [440, 324], [500, 336], [540, 344]], 10).map(r1);
const VESSELS2 = [
  [[228, 440], [236, 400], [226, 352], [240, 300], [232, 262]],
  [[372, 448], [366, 404], [384, 352], [372, 300]],
  [[226, 352], [190, 330], [176, 290]],
];
// depth along each vessel (by fraction of its length): they wander in depth so they read as 3-D
const VESSEL_Z = [
  (u) => -18 - 18 * Math.sin(u * 3.0) - 6 * u,
  (u) => -44 + 14 * Math.sin(u * 2.4 + 0.6),
  (u) => -28 + 22 * u,
];

const zAlong = (pts, fn) => {
  const m = measure(pts);
  return pts.map((_, i) => fn(m.acc[i] / (m.L || 1)));
};

// axons bow a little deeper mid-way (in front of the fornix, behind nothing)
const axonZ = (j) => (u) => {
  const [a, b] = AXON_ENDS[j];
  return a + (b - a) * u - (5 + 4 * j) * Math.sin(Math.PI * u);
};
export const AXONS = AXONS2.map((pts, j) => measure(pts, zAlong(pts, axonZ(j))));
export const DOWN = DOWN2.map((pts, j) => {
  const z0 = KNDY_Z[DOWN_SRC[j][0]];
  const z1 = [-2, 4, -6][j];
  return measure(pts, zAlong(pts, (u) => z0 + (z1 - z0) * smoothstep(0, 1, u)));
});
// heat-loss output toward the brainstem: leaves through the block's back end (cut there)
export const OUT = measure(OUT2, zAlong(OUT2, (u) => -8 - 58 * smoothstep(0.08, 1, u)));
export const VESSELS = VESSELS2.map((v, i) => {
  const pts = curve(v, 6).map(r1);
  const zs = zAlong(pts, VESSEL_Z[i]);
  return pts.map((p, k) => [p[0], p[1], zs[k]]);
});
/** Anatomy for the simulation (A2 DATA: kndy, axons, down, out, vessels). */
export const SIM_ANATOMY = { kndy: KNDY_POS, axons: AXONS, down: DOWN, out: OUT, vessels: VESSELS };
/** Vessel centrelines at full resolution for drawing. */
export const VESSEL_LINES = VESSELS2.map((v, i) => {
  const pts = curve(v, 16);
  const zs = zAlong(pts, VESSEL_Z[i]);
  return pts.map((p, k) => [p[0], p[1], zs[k]]);
});

// ---------------------------------------------------------------- the block (front face outline)
// A2 squares the block off at its cuts (top y = 150, ends x = 74 and 520); the base keeps the
// brain's own underside. The mammillary body and chiasm are separate round bodies that bulge out.
export const BASE = [[520, 434], [506, 442], [488, 447], [466, 449], [444, 447], [420, 444], [396, 442], [366, 441], [340, 442], [322, 445], [302, 448], [284, 446], [262, 438], [236, 430], [206, 423], [172, 419], [146, 420], [118, 423], [94, 422], [74, 412]];
/** y of the base at section x (piecewise linear over BASE, good enough for placement checks). */
export function baseY(x) {
  for (let i = 0; i < BASE.length - 1; i++) {
    const [xa, ya] = BASE[i];
    const [xb, yb] = BASE[i + 1];
    if ((x <= xa && x >= xb) || (x >= xa && x <= xb)) return ya + ((yb - ya) * (x - xa)) / (xb - xa || 1);
  }
  return BASE[BASE.length - 1][1];
}
// hypothalamic sulcus (A2 SULCUS), painted on the cut faces
export const SULCUS = [[160, 196], [250, 214], [360, 226], [460, 238], [560, 262], [620, 276]];

// ---------------------------------------------------------------- white matter (3-D centrelines)
// fornix: A2's tube, from the top cut down and back to the mammillary body; lateral to the
// hypothalamic nuclei (it divides medial from lateral hypothalamus), so deeper than the cells
export const FORNIX = { pts: [[219, 146, -50], [215, 186, -50], [232, 246, -47], [292, 312, -44], [378, 376, -41], [446, 424, -38], [466, 444, -36]], r0: 13, r1: 7.5 };
export const MAMM = { c: [470, 449, -36], r: 22 };
// anterior commissure: a transverse bundle, crossing the block from the front cut to the back,
// curving back and out (cut flush at both faces); its front cut is A2's ellipse at (156, 172)
export const AC = { pts: [[156, 172, ZF + 2], [157, 171, -30], [166, 170, -80], [186, 172, -130], [210, 176, ZB - 2]], r: 15 };
// optic chiasm on the midline at the base, the nerve stump leaving forward and out (cut), the
// optic tract running back and out along the base to the back end
export const CHIASM = { c: [126, 418, -2], r: [24, 10.5, 16] };
// the near-side nerve leaves forward (a cut stump past the block's front end, as in A2); the tract runs back
export const NERVES = [{ pts: [[112, 421, -5], [90, 428, -11], [66, 434, -17], [50, 438, -21]], r: 9.2 }];
export const TRACTS = [{ pts: [[140, 420, -6], [160, 423, -16], [180, 425, -28]], r: 8 }];

// ---------------------------------------------------------------- the base: median eminence, stalk, pituitary, sella
// the infundibulum flares where it leaves the base (funnel), then narrows to the stalk
export const STALK = { pts: [[302, 432, -1], [303, 446, 0], [306, 462, 0], [310, 478, 0], [314, 494, 0], [318, 508, 0]], r: (u) => 9.5 + 10.5 * Math.pow(1 - smoothstep(0, 0.42, u), 2) + 1.4 * smoothstep(0.82, 1, u) };
export const LOBE_ANT = { c: [285, 530, 0], r: [31, 26, 36] };
export const LOBE_POST = { c: [334, 526, -2], r: [20, 23, 25] };
// the stalk's surface at section height y, angle φ around it (φ = 0 faces the viewer, +z)
const stalkAt = (y, phi, lift = 1.06) => {
  const P = STALK.pts;
  let i = 1;
  while (i < P.length - 1 && P[i][1] < y) i++;
  const t = Math.max(0, Math.min(1, (y - P[i - 1][1]) / (P[i][1] - P[i - 1][1])));
  const cx = P[i - 1][0] + (P[i][0] - P[i - 1][0]) * t;
  const cz = P[i - 1][2] + (P[i][2] - P[i - 1][2]) * t;
  const u = Math.max(0, Math.min(1, (y - P[0][1]) / (P[P.length - 1][1] - P[0][1])));
  const r = STALK.r(u) * lift;
  return [cx + r * Math.sin(phi), y, cz + r * Math.cos(phi)];
};
// the anterior lobe's surface: θ from its top, φ around (φ = 0 faces the viewer)
const antAt = (th, phi, lift = 1.05) => [LOBE_ANT.c[0] + LOBE_ANT.r[0] * lift * Math.sin(th) * Math.sin(phi), LOBE_ANT.c[1] - LOBE_ANT.r[1] * lift * Math.cos(th), LOBE_ANT.c[2] + LOBE_ANT.r[2] * lift * Math.sin(th) * Math.cos(phi)];
// primary capillary plexus of the median eminence: small loops on the funnel (A2's portal loops)
export const LOOPS = [-0.8, 0.0, 0.8].map((p) => [stalkAt(446, p - 0.3), stalkAt(454, p - 0.31), stalkAt(462, p - 0.12, 1.1), stalkAt(462, p + 0.12, 1.1), stalkAt(454, p + 0.31), stalkAt(446, p + 0.3)]);
// long portal vessels down the front of the stalk, branching over the anterior lobe
export const PORTAL = [
  [stalkAt(452, -0.5), stalkAt(468, -0.55), stalkAt(484, -0.62), stalkAt(498, -0.75), antAt(0.62, 0.35), antAt(0.95, 0.15), antAt(1.3, 0.05), antAt(1.7, 0.0)],
  [stalkAt(452, 0.15), stalkAt(470, 0.1), stalkAt(488, 0.0), antAt(0.5, 0.75), antAt(0.85, 0.7), antAt(1.2, 0.85), antAt(1.6, 1.05)],
  [antAt(0.95, 0.15), antAt(1.15, -0.25), antAt(1.45, -0.55), antAt(1.75, -0.7)],
  [antAt(0.85, 0.7), antAt(1.05, 1.15), antAt(1.3, 1.5), antAt(1.6, 1.75)],
];
// sella turcica: A2's bony cup, as a U-shaped bone profile swept laterally (the sella is open to
// the cavernous sinus on each side). Profile in section (x, y): outer lip → floor → outer lip.
export const SELLA = { z0: -48, z1: 38, lift: 8 };
// inner (top) surface and outer (under) surface of the cup, front (tuberculum) to back (dorsum)
export const SELLA_IN = [[244, 502], [247, 524], [257, 545], [278, 559], [306, 564], [334, 560], [352, 547], [361, 528], [364, 504], [366, 486]];
export const SELLA_OUT = [[378, 482], [377, 512], [372, 540], [358, 562], [334, 576], [306, 580], [277, 576], [254, 565], [239, 546], [232, 524], [231, 502]];

// ---------------------------------------------------------------- deep vessels (penetrating, hazed by depth)
export const DEEP_VESSELS = [
  [[300, 156, -96], [306, 210, -100], [296, 280, -92], [310, 352, -104], [304, 432, -98]],
  [[430, 156, -132], [424, 220, -126], [438, 300, -140], [428, 380, -134]],
  [[150, 156, -120], [160, 230, -128], [148, 320, -116], [164, 408, -124]],
  [[470, 156, -66], [466, 210, -72], [480, 262, -60]],
];

/** Section (x, y, z) → world [X, Y, Z]. */
export const W = (x, y, z = 0) => [x - CX, CY - y, z];
