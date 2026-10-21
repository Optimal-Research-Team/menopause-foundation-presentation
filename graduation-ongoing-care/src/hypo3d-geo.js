// <hypo-3d> geometry helpers: organic blobs, tapered tubes, sweeps, merges. No loaders, no network.
import { BufferGeometry, BufferAttribute, Float32BufferAttribute, CatmullRomCurve3, Vector3, Vector2, ShapeUtils } from "three";

const smooth01 = (t) => t * t * (3 - 2 * t);

/** Indexed icosphere (unit radius): { v: [[x,y,z]], f: [[a,b,c]] }. */
export function icosphere(detail = 3) {
  const t = (1 + Math.sqrt(5)) / 2;
  const norm = (p) => {
    const l = Math.hypot(p[0], p[1], p[2]);
    return [p[0] / l, p[1] / l, p[2] / l];
  };
  let v = [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].map(norm);
  let f = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let d = 0; d < detail; d++) {
    const cache = new Map();
    const mid = (a, b) => {
      const key = a < b ? a * 100000 + b : b * 100000 + a;
      let i = cache.get(key);
      if (i === undefined) {
        i = v.length;
        v.push(norm([(v[a][0] + v[b][0]) / 2, (v[a][1] + v[b][1]) / 2, (v[a][2] + v[b][2]) / 2]));
        cache.set(key, i);
      }
      return i;
    };
    const nf = [];
    for (const [a, b, c] of f) {
      const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a);
      nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]);
    }
    f = nf;
  }
  return { v, f };
}

/** Smooth pseudo-noise on the unit sphere: a few random-direction waves (deterministic per rng). */
export function lumpField(rng, n = 6, freq = [1.2, 3.4]) {
  const waves = [];
  for (let i = 0; i < n; i++) {
    const u = rng() * 2 - 1;
    const a = rng() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    waves.push({ d: [s * Math.cos(a), s * Math.sin(a), u], f: freq[0] + rng() * (freq[1] - freq[0]), p: rng() * 6.283, w: 0.5 + rng() });
  }
  const W = waves.reduce((a, w) => a + w.w, 0);
  return (x, y, z) => waves.reduce((acc, w) => acc + w.w * Math.sin((w.d[0] * x + w.d[1] * y + w.d[2] * z) * w.f + w.p), 0) / W;
}

/**
 * An organic ellipsoid: radii [rx, ry, rz], lumpiness amp (fraction of radius), optional
 * shape(x,y,z) → extra radial scale. Indexed, smooth normals.
 */
export function blobGeo(radii, rng, { amp = 0.08, detail = 3, shape = null, center = [0, 0, 0] } = {}) {
  const { v, f } = icosphere(detail);
  const field = lumpField(rng, 7);
  const pos = new Float32Array(v.length * 3);
  v.forEach(([x, y, z], i) => {
    let k = 1 + amp * field(x, y, z);
    if (shape) k *= shape(x, y, z);
    pos[i * 3] = center[0] + x * radii[0] * k;
    pos[i * 3 + 1] = center[1] + y * radii[1] * k;
    pos[i * 3 + 2] = center[2] + z * radii[2] * k;
  });
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(pos, 3));
  g.setIndex(f.flat());
  g.computeVertexNormals();
  return g;
}

/**
 * Tube along a smooth curve through pts ([x,y,z] world), radius number or fn(u). Indexed, with
 * uv (u along, v around). capStart / capEnd add flat cut faces.
 */
export function tubeGeo(pts, radius, { tubular = 64, radial = 12, capStart = false, capEnd = false, curve = null } = {}) {
  const c = curve || new CatmullRomCurve3(pts.map((p) => new Vector3(p[0], p[1], p[2])), false, "centripetal");
  const frames = c.computeFrenetFrames(tubular, false);
  const rf = typeof radius === "function" ? radius : () => radius;
  const P = [], N = [], UV = [], I = [];
  const p = new Vector3();
  const n = new Vector3();
  for (let i = 0; i <= tubular; i++) {
    const u = i / tubular;
    c.getPointAt(u, p);
    const r = rf(u);
    const Nn = frames.normals[i], Bn = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      n.set(cs * Nn.x + sn * Bn.x, cs * Nn.y + sn * Bn.y, cs * Nn.z + sn * Bn.z);
      P.push(p.x + r * n.x, p.y + r * n.y, p.z + r * n.z);
      N.push(n.x, n.y, n.z);
      UV.push(u, j / radial);
    }
  }
  for (let i = 0; i < tubular; i++) {
    for (let j = 0; j < radial; j++) {
      const a = i * (radial + 1) + j, b = (i + 1) * (radial + 1) + j;
      I.push(a, a + 1, b, b, a + 1, b + 1); // outward-facing (ring runs N → B, right-handed about T)
    }
  }
  const cap = (end) => {
    const u = end ? 1 : 0;
    const i = end ? tubular : 0;
    c.getPointAt(u, p);
    const T = frames.tangents[i].clone().multiplyScalar(end ? 1 : -1);
    const r = rf(u);
    const base = P.length / 3;
    P.push(p.x, p.y, p.z);
    N.push(T.x, T.y, T.z);
    UV.push(u, 0.5);
    const Nn = frames.normals[i], Bn = frames.binormals[i];
    for (let j = 0; j <= radial; j++) {
      const a = (j / radial) * Math.PI * 2;
      const cs = Math.cos(a), sn = Math.sin(a);
      P.push(p.x + r * (cs * Nn.x + sn * Bn.x), p.y + r * (cs * Nn.y + sn * Bn.y), p.z + r * (cs * Nn.z + sn * Bn.z));
      N.push(T.x, T.y, T.z);
      UV.push(u, j / radial);
    }
    for (let j = 0; j < radial; j++) {
      if (end) I.push(base, base + 1 + j, base + 2 + j);
      else I.push(base, base + 2 + j, base + 1 + j);
    }
  };
  if (capStart) cap(false);
  if (capEnd) cap(true);
  const g = new BufferGeometry();
  g.setAttribute("position", new Float32BufferAttribute(P, 3));
  g.setAttribute("normal", new Float32BufferAttribute(N, 3));
  g.setAttribute("uv", new Float32BufferAttribute(UV, 2));
  g.setIndex(I);
  return g;
}

/** Merge geometries (position, normal, optional uv) into one indexed geometry. */
export function mergeGeos(list) {
  const withUv = list.every((g) => g.attributes.uv);
  let nv = 0, ni = 0;
  for (const g of list) {
    nv += g.attributes.position.count;
    ni += g.index ? g.index.count : g.attributes.position.count;
  }
  const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), UV = withUv ? new Float32Array(nv * 2) : null;
  const I = new Uint32Array(ni);
  let ov = 0, oi = 0;
  for (const g of list) {
    const n = g.attributes.position.count;
    P.set(g.attributes.position.array, ov * 3);
    N.set(g.attributes.normal.array, ov * 3);
    if (UV) UV.set(g.attributes.uv.array, ov * 2);
    if (g.index) {
      const src = g.index.array;
      for (let k = 0; k < src.length; k++) I[oi + k] = src[k] + ov;
      oi += src.length;
    } else {
      for (let k = 0; k < n; k++) I[oi + k] = ov + k;
      oi += n;
    }
    ov += n;
  }
  const g = new BufferGeometry();
  g.setAttribute("position", new BufferAttribute(P, 3));
  g.setAttribute("normal", new BufferAttribute(N, 3));
  if (UV) g.setAttribute("uv", new BufferAttribute(UV, 2));
  g.setIndex(new BufferAttribute(I, 1));
  return g;
}

/** Smooth normals across edges flatter than `angle` (radians); hard elsewhere (non-indexed in, out). */
export function creaseNormals(geo, angle) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  const pos = g.attributes.position;
  const creaseDot = Math.cos(angle);
  const key = (i) => `${Math.round(pos.getX(i) * 100)},${Math.round(pos.getY(i) * 100)},${Math.round(pos.getZ(i) * 100)}`;
  const a = new Vector3(), b = new Vector3(), c = new Vector3();
  const faceN = [];
  const map = new Map();
  for (let i = 0; i < pos.count; i += 3) {
    a.fromBufferAttribute(pos, i);
    b.fromBufferAttribute(pos, i + 1);
    c.fromBufferAttribute(pos, i + 2);
    const n = new Vector3().subVectors(c, b).cross(new Vector3().subVectors(a, b));
    const area = n.length();
    n.normalize();
    faceN.push(n);
    for (let k = 0; k < 3; k++) {
      const h = key(i + k);
      if (!map.has(h)) map.set(h, []);
      map.get(h).push({ n, w: area });
    }
  }
  const out = new Float32Array(pos.count * 3);
  const t = new Vector3();
  for (let i = 0; i < pos.count; i += 3) {
    const n = faceN[i / 3];
    for (let k = 0; k < 3; k++) {
      t.set(0, 0, 0);
      for (const o of map.get(key(i + k))) if (n.dot(o.n) > creaseDot) t.addScaledVector(o.n, o.w);
      t.normalize();
      out[(i + k) * 3] = t.x;
      out[(i + k) * 3 + 1] = t.y;
      out[(i + k) * 3 + 2] = t.z;
    }
  }
  g.setAttribute("normal", new BufferAttribute(out, 3));
  return g;
}

/** Closed Catmull-Rom resample of a 2-D loop to n points. */
export function closedLoop(pts, n) {
  const m = pts.length;
  const out = [];
  const per = n / m;
  for (let i = 0; i < m; i++) {
    const p0 = pts[(i - 1 + m) % m], p1 = pts[i], p2 = pts[(i + 1) % m], p3 = pts[(i + 2) % m];
    const k = Math.round(per);
    for (let s = 0; s < k; s++) {
      const t = s / k, t2 = t * t, t3 = t2 * t;
      out.push([0, 1].map((c) => 0.5 * (2 * p1[c] + (-p0[c] + p2[c]) * t + (2 * p0[c] - 5 * p1[c] + 4 * p2[c] - p3[c]) * t2 + (-p0[c] + 3 * p1[c] - 3 * p2[c] + p3[c]) * t3)));
    }
  }
  return out;
}

/**
 * Sweep a closed 2-D profile (world x, y) along z from z0 to z1, with a lift(zNorm) added to y
 * and an optional width taper; flat end caps (the cut faces). Smooth walls, hard cap edges.
 */
export function sweepGeo(profile, z0, z1, { slices = 24, lift = () => 0, taper = () => 1, cx = 0, separate = false } = {}) {
  // walls face outward only for a clockwise profile (x right, y up): reverse a CCW one
  let area = 0;
  for (let i = 0; i < profile.length; i++) {
    const [x0, y0] = profile[i];
    const [x1, y1] = profile[(i + 1) % profile.length];
    area += x0 * y1 - x1 * y0;
  }
  if (area > 0) profile = profile.slice().reverse();
  const n = profile.length;
  const P = [], I = [];
  for (let s = 0; s <= slices; s++) {
    const u = s / slices;
    const z = z0 + (z1 - z0) * u;
    const zn = u * 2 - 1;
    const k = taper(zn);
    const dy = lift(zn);
    for (const [x, y] of profile) P.push(cx + (x - cx) * k, y + dy, z);
  }
  for (let s = 0; s < slices; s++) {
    for (let i = 0; i < n; i++) {
      const a = s * n + i, b = s * n + ((i + 1) % n), c = (s + 1) * n + i, d = (s + 1) * n + ((i + 1) % n);
      I.push(a, c, b, b, c, d);
    }
  }
  const walls = new BufferGeometry();
  walls.setAttribute("position", new Float32BufferAttribute(P, 3));
  walls.setIndex(I);
  walls.computeVertexNormals();
  // caps
  const capGeo = (end) => {
    const s = end ? slices : 0;
    const ring = [];
    for (let i = 0; i < n; i++) ring.push(new Vector2(P[(s * n + i) * 3], P[(s * n + i) * 3 + 1]));
    const tris = ShapeUtils.triangulateShape(ring, []);
    const z = P[s * n * 3 + 2];
    const cp = [], cn = [], ci = [];
    ring.forEach((p) => {
      cp.push(p.x, p.y, z);
      cn.push(0, 0, end ? 1 : -1);
    });
    for (const [a, b, c] of tris) {
      // orient to face outward
      const ax = ring[a], bx = ring[b], cx2 = ring[c];
      const cross = (bx.x - ax.x) * (cx2.y - ax.y) - (bx.y - ax.y) * (cx2.x - ax.x);
      const ccw = cross > 0;
      if (ccw === end) ci.push(a, b, c);
      else ci.push(a, c, b);
    }
    const g = new BufferGeometry();
    g.setAttribute("position", new Float32BufferAttribute(cp, 3));
    g.setAttribute("normal", new Float32BufferAttribute(cn, 3));
    g.setIndex(ci);
    return g;
  };
  if (separate) return { walls, caps: mergeGeos([capGeo(false), capGeo(true)]) };
  return mergeGeos([walls, capGeo(false), capGeo(true)]);
}

export { smooth01 };
