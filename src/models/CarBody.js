import * as THREE from 'three';
import { canvasTexture } from '../utils/textures.js';

// =============================================================
// CarBody - smooth, realistic-looking car bodies made in code.
//
// LOFTING: a real car is not a box - its cross-section changes all
// along its length (narrow rounded nose, wide fenders, tapered tail).
// We describe the body as ~20 "rings" (cross-sections) from front to
// back and stitch neighbouring rings together with triangles. Each
// ring is a "superellipse" - a shape between an ellipse and a
// rectangle - so the body has soft, curved sides that catch
// reflections like real car paint.
//
// The glass cabin ("greenhouse") is a second loft whose sides lean
// inwards (tumblehome), with a painted roof panel on top.
// All shapes face -z (front) like the rest of the game.
// =============================================================

const smooth = (t) => t * t * (3 - 2 * t);
const clamp01 = (t) => Math.min(1, Math.max(0, t));

/** Stitches rings (arrays of Vector3 with equal length) into a closed surface. */
export function loft(rings, { capStart = true, capEnd = true, vFromZ = false } = {}) {
  const S = rings.length;
  const N = rings[0].length;
  const pos = [];
  const uv = [];
  const idx = [];
  const z0 = rings[0][0].z;
  const z1 = rings[S - 1][0].z;
  for (let i = 0; i < S; i++) {
    const v = vFromZ ? (rings[i][0].z - z0) / (z1 - z0 || 1) : i / (S - 1);
    for (let j = 0; j <= N; j++) {
      const p = rings[i][j % N];
      pos.push(p.x, p.y, p.z);
      uv.push(j / N, v);
    }
  }
  const row = N + 1;
  for (let i = 0; i < S - 1; i++) {
    for (let j = 0; j < N; j++) {
      const a = i * row + j;
      const b = (i + 1) * row + j;
      const c = i * row + j + 1;
      const d = (i + 1) * row + j + 1;
      idx.push(a, c, b, c, d, b); // outward-facing winding
    }
  }
  const cap = (ring, front) => {
    const base = pos.length / 3;
    const cx = ring.reduce((s, p) => s + p.x, 0) / N;
    const cy = ring.reduce((s, p) => s + p.y, 0) / N;
    pos.push(cx, cy, ring[0].z);
    uv.push(0.5, 0.5);
    for (const p of ring) {
      pos.push(p.x, p.y, p.z);
      uv.push(0.5, 0.5);
    }
    for (let j = 0; j < N; j++) {
      const p0 = base + 1 + j;
      const p1 = base + 1 + ((j + 1) % N);
      if (front) idx.push(base, p1, p0);
      else idx.push(base, p0, p1);
    }
  };
  if (capStart) cap(rings[0], true);
  if (capEnd) cap(rings[S - 1], false);

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  geo.setIndex(idx);
  geo.computeVertexNormals();
  return geo;
}

/** A superellipse cross-section. n=2 ellipse, n=4 rounded box, n=8 almost square. */
function ring(z, cy, hw, hh, n, N, taperTop = 0.12) {
  const pts = [];
  for (let k = 0; k < N; k++) {
    const th = (k / N) * Math.PI * 2;
    const c = Math.cos(th);
    const s = Math.sin(th);
    const xn = Math.sign(c) * Math.abs(c) ** (2 / n);
    const yn = Math.sign(s) * Math.abs(s) ** (2 / n);
    let x = xn * hw;
    if (yn > 0) x *= 1 - taperTop * yn; // shoulders roll inwards towards the top
    else x *= 1 + 0.06 * yn; // and tuck in slightly at the sill
    pts.push(new THREE.Vector3(x, cy + yn * hh, z));
  }
  return pts;
}

/**
 * The body's shape as functions of t (0 = front bumper, 1 = rear bumper).
 * Built from the same numbers the old profile used (cars.js "design").
 */
export function bodyProfile(d) {
  const L = d.len;
  const h2 = L / 2;
  const W = d.width;
  const c = d.clearance;
  const cab = d.cabin;
  const cowl = Math.min(0.45, Math.max(0.12, (h2 - cab.front - 0.2) / L));
  const tF = d.axle / L;
  const tR = 1 - d.axle / L;
  const n = d.round || 3.6;

  const top = (t) => {
    let y;
    if (t < cowl) {
      const k = t / cowl;
      y = d.noseH + (d.h - d.noseH) * (1 - (1 - k) * (1 - k)); // gently domed hood
    } else if (t > 0.84) {
      y = d.h + (d.tailH - d.h) * smooth((t - 0.84) / 0.16);
    } else {
      y = d.h;
    }
    if (t < 0.035) y -= ((0.035 - t) / 0.035) * 0.08; // rounded nose
    if (t > 0.97) y -= ((t - 0.97) / 0.03) * 0.09; // rounded tail
    return y;
  };
  const bottom = (t) => {
    let y = c;
    if (t < 0.1) y += ((0.1 - t) / 0.1) * 0.15; // bumper lift for approach angle
    if (t > 0.9) y += ((t - 0.9) / 0.1) * 0.14;
    return Math.min(y, top(t) - 0.12);
  };
  const hw = (t) => {
    let w = W / 2;
    w *= 0.8 + 0.2 * smooth(clamp01(t / 0.15)); // narrower nose
    w *= 0.86 + 0.14 * smooth(clamp01((1 - t) / 0.12)); // tapered tail
    for (const a of [tF, tR]) w += 0.035 * Math.exp(-(((t - a) / 0.07) ** 2)); // fender flares
    return w;
  };
  const z = (t) => -h2 + t * L;
  const tAtZ = (zz) => clamp01((zz + h2) / L);
  return { top, bottom, hw, z, tAtZ, n, cowl, tF, tR, L, h2, W };
}

export function bodyGeometry(P, taperTop = 0.14) {
  const ts = [0, 0.008, 0.02, 0.04, 0.07, 0.1, 0.14, P.cowl * 0.6, P.cowl, P.tF - 0.08, P.tF, P.tF + 0.08,
    0.5, P.tR - 0.08, P.tR, P.tR + 0.08, 0.84, 0.88, 0.92, 0.955, 0.98, 0.993, 1]
    .filter((t) => t >= 0 && t <= 1)
    .sort((a, b) => a - b)
    .filter((t, i, arr) => i === 0 || t - arr[i - 1] > 0.004);
  const rings = ts.map((t) => {
    const tp = P.top(t);
    const bt = P.bottom(t);
    return ring(P.z(t), (tp + bt) / 2, P.hw(t), (tp - bt) / 2, P.n, 32, taperTop);
  });
  return loft(rings);
}

/** Cabin glass + roof. Returns { glass, roof, roofTop, roofHalfWidth, zones } */
export function greenhouse(d, P) {
  const cab = d.cabin;
  const zf = -cab.front;
  const zr = -cab.rear;
  const zRF = -cab.roofFront;
  const zRR = -cab.roofRear;
  const top = d.h + cab.roofH;
  const base = d.h - 0.06;

  const roofAt = (z) => {
    if (z <= zRF) {
      const k = clamp01((z - zf) / (zRF - zf));
      return base + (top - base) * (1 - (1 - k) ** 1.35); // raked, gently curved windscreen
    }
    if (z >= zRR) {
      const k = clamp01((z - zRR) / (zr - zRR));
      return top - (top - base) * k ** 1.25; // rear window
    }
    return top + 0.03 * Math.sin(Math.PI * (z - zRF) / (zRR - zRF)); // slight roof arc
  };
  const widthAt = (z) => P.hw(P.tAtZ(z)) * 0.9;

  const zs = [];
  for (const k of [0, 0.08, 0.2, 0.36, 0.55, 0.75, 1]) zs.push(zf + (zRF - zf) * k);
  for (const k of [0.25, 0.5, 0.75]) zs.push(zRF + (zRR - zRF) * k);
  for (const k of [0, 0.25, 0.5, 0.75, 0.92, 1]) zs.push(zRR + (zr - zRR) * k);
  const uniq = zs.sort((a, b) => a - b).filter((z, i, arr) => i === 0 || z - arr[i - 1] > 0.01);

  const N = 32;
  const rings = uniq.map((z) => {
    const yTop = Math.max(roofAt(z), base + 0.015);
    const wb = widthAt(z);
    const wt = wb * 0.72; // tumblehome: the glass leans inwards
    const pts = [];
    for (let k = 0; k < N; k++) {
      const th = (k / N) * Math.PI * 2;
      const c = Math.cos(th);
      const s = Math.sin(th);
      // n = 9: nearly flat glass panels with tight rounded corners
      const xn = Math.sign(c) * Math.abs(c) ** (2 / 9);
      const yn = Math.sign(s) * Math.abs(s) ** (2 / 9);
      const f = (yn + 1) / 2;
      pts.push(new THREE.Vector3(xn * (wb + (wt - wb) * f), base + (yTop - base) * f, z));
    }
    return pts;
  });
  const glass = loft(rings, { vFromZ: true });

  // painted roof panel sitting on the glass
  const roofRings = [];
  const r0 = zRF + 0.02;
  const r1 = zRR - 0.02;
  for (let i = 0; i <= 6; i++) {
    const z = r0 + ((r1 - r0) * i) / 6;
    const y = roofAt(z);
    const hwRoof = widthAt(z) * 0.72 + 0.012;
    const taper = i === 0 || i === 6 ? 0.9 : 1;
    roofRings.push(ring(z, y + 0.005, hwRoof * taper, 0.03, 6, 24, 0.05));
  }
  const roof = loft(roofRings);

  return {
    glass,
    roof,
    roofTop: top + 0.035,
    roofHalfWidth: widthAt((zRF + zRR) / 2) * 0.72,
    // where pillars go in the window texture (0..1 along the cabin)
    zones: {
      vRF: (zRF - zf) / (zr - zf),
      vRR: (zRR - zf) / (zr - zf),
      vB: (zRF + (zRR - zRF) * 0.42 - zf) / (zr - zf),
    },
  };
}

/**
 * Window texture: tinted glass with blacked-out A/B/C pillars.
 * u runs around the cabin (0 = right side, 0.25 = top, 0.5 = left side),
 * v runs from the windscreen (0) to the rear window (1).
 */
export function makeGlassTexture({ vRF, vRR, vB, panelRear = false }) {
  const W = 512;
  const H = 256;
  const tex = canvasTexture(W, H, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, W, 0);
    g.addColorStop(0, '#111c27');
    g.addColorStop(0.17, '#243749'); // windscreen picks up the sky
    g.addColorStop(0.33, '#243749');
    g.addColorStop(0.5, '#111c27');
    g.addColorStop(1, '#111c27');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, W, H);
    // soft reflection streaks
    ctx.fillStyle = 'rgba(180,210,240,0.10)';
    for (let i = 0; i < 6; i++) ctx.fillRect(Math.random() * W, 0, 10 + Math.random() * 30, H);

    const yv = (v) => (1 - v) * H;
    ctx.fillStyle = '#000000';
    const band = (u, w, v0, v1) => {
      ctx.fillRect(u * W - (w * W) / 2, yv(v1), w * W, yv(v0) - yv(v1));
      if (u * W - (w * W) / 2 < 0) ctx.fillRect(W + u * W - (w * W) / 2, yv(v1), w * W, yv(v0) - yv(v1));
    };
    // A pillars (windscreen edges) and C pillars (rear window edges)
    for (const u of [0.125, 0.375]) {
      band(u, 0.05, 0, vRF + 0.03);
      band(u, 0.05, vRR - 0.03, 1);
    }
    // B pillar on both sides, and the thick rear quarter
    for (const u of [0, 0.5]) {
      band(u, 0.26, vB - 0.035, vB + 0.035);
      band(u, 0.26, vRR + (1 - vRR) * 0.45, 1);
    }
    // panel vans: no windows behind the front doors
    if (panelRear) {
      ctx.fillStyle = '#1a1c20';
      for (const u of [0, 0.5]) band(u, 0.26, vB, 1);
    }
  });
  tex.wrapS = THREE.RepeatWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------- Wheels ----------
/**
 * Adds a detailed wheel to a GeoBatch: rounded tyre, rim barrel,
 * brake disc and caliper, spokes (several styles), hub and lug nuts.
 * `side` is +1 for a wheel on the right (outer face = +x), -1 on the left.
 */
export function addDetailedWheel(b, { r, w, style = 'multi' }, pos, side) {
  const [px, py, pz] = pos;
  const axis = [0, 0, Math.PI / 2];
  const face = px + side * w * 0.36; // where the spokes sit

  // tyre: a rounded profile spun around the axle (lathe)
  const offroad = style === 'offroad';
  const prof = [
    [r * 0.7, -w / 2], [r * 0.92, -w / 2], [r * 0.985, -w * 0.4], [r, -w * 0.28],
    [r, w * 0.28], [r * 0.985, w * 0.4], [r * 0.92, w / 2], [r * 0.7, w / 2],
  ].map(([x, y]) => new THREE.Vector2(x, y));
  b.add('tire', new THREE.LatheGeometry(prof, 30), { pos, rot: axis });
  if (offroad) {
    for (let i = 0; i < 18; i++) {
      const a = (i / 18) * Math.PI * 2;
      b.add('tire', new THREE.BoxGeometry(w * 0.9, 0.06, 0.12), {
        pos: [px, py + Math.cos(a) * r, pz + Math.sin(a) * r], rot: [a, 0, 0],
      });
    }
  }
  // rim barrel and brake
  b.add('rimDark', new THREE.CylinderGeometry(r * 0.69, r * 0.69, w * 0.92, 24, 1, true), { pos, rot: axis });
  b.add('disc', new THREE.CylinderGeometry(r * 0.52, r * 0.52, 0.03, 24), { pos: [px + side * w * 0.05, py, pz], rot: axis });
  b.add('caliper', new THREE.BoxGeometry(0.09, r * 0.34, r * 0.24), {
    pos: [px + side * w * 0.14, py + r * 0.36, pz + r * 0.22], rot: [0.55, 0, 0],
  });
  // outer lip
  b.add('rim', new THREE.TorusGeometry(r * 0.67, 0.022, 6, 32), { pos: [face, py, pz], rot: [0, Math.PI / 2, 0] });

  // spokes
  const spoke = (angle, width, thick, inner = 0.16, outer = 0.66) => {
    const len = r * (outer - inner);
    const rm = r * (inner + outer) / 2;
    b.add('rim', new THREE.BoxGeometry(thick, len, width), {
      pos: [face - side * 0.01, py + Math.cos(angle) * rm, pz + Math.sin(angle) * rm], rot: [angle, 0, 0],
    });
  };
  const TAU = Math.PI * 2;
  switch (style) {
    case 'sport5':
      for (let i = 0; i < 5; i++) {
        const a = (i / 5) * TAU;
        spoke(a - 0.12, 0.05, 0.05);
        spoke(a + 0.12, 0.05, 0.05);
      }
      break;
    case 'turbine':
      for (let i = 0; i < 12; i++) {
        const a = (i / 12) * TAU;
        b.add('rim', new THREE.BoxGeometry(0.04, r * 0.5, 0.05), {
          pos: [face - side * 0.01, py + Math.cos(a) * r * 0.41, pz + Math.sin(a) * r * 0.41], rot: [a, 0, side * 0.35],
        });
      }
      break;
    case 'luxury':
      for (let i = 0; i < 15; i++) spoke((i / 15) * TAU, 0.025, 0.04);
      break;
    case 'offroad':
      for (let i = 0; i < 6; i++) spoke((i / 6) * TAU, 0.11, 0.07, 0.18, 0.62);
      break;
    case 'basic':
      // plain steel wheel with a hubcap
      b.add('rim', new THREE.CylinderGeometry(r * 0.62, r * 0.62, 0.03, 20), { pos: [face, py, pz], rot: axis });
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * TAU;
        b.add('rimDark', new THREE.CylinderGeometry(r * 0.08, r * 0.08, 0.035, 8), {
          pos: [face + side * 0.002, py + Math.cos(a) * r * 0.4, pz + Math.sin(a) * r * 0.4], rot: axis,
        });
      }
      break;
    default: // 'multi': 10 slim spokes
      for (let i = 0; i < 10; i++) spoke((i / 10) * TAU, 0.035, 0.045);
  }
  // hub, centre cap and lug nuts
  b.add('rim', new THREE.CylinderGeometry(r * 0.17, r * 0.19, 0.06, 16), { pos: [face, py, pz], rot: axis });
  b.add('trim', new THREE.CylinderGeometry(r * 0.08, r * 0.08, 0.07, 12), { pos: [face + side * 0.005, py, pz], rot: axis });
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * TAU;
    b.add('chrome', new THREE.CylinderGeometry(0.014, 0.014, 0.07, 6), {
      pos: [face + side * 0.01, py + Math.cos(a) * r * 0.12, pz + Math.sin(a) * r * 0.12], rot: axis,
    });
  }
}

/** Honeycomb grille texture. */
let grilleTex = null;
export function getGrilleTexture() {
  if (grilleTex) return grilleTex;
  grilleTex = canvasTexture(128, 64, (ctx) => {
    ctx.fillStyle = '#050506';
    ctx.fillRect(0, 0, 128, 64);
    ctx.strokeStyle = '#3a3d44';
    ctx.lineWidth = 2;
    for (let y = 0; y < 8; y++) {
      for (let x = 0; x < 16; x++) {
        const cx = x * 8 + (y % 2) * 4;
        const cy = y * 8 + 4;
        ctx.beginPath();
        for (let k = 0; k < 6; k++) {
          const a = (k / 6) * Math.PI * 2;
          ctx.lineTo(cx + Math.cos(a) * 3.6, cy + Math.sin(a) * 3.6);
        }
        ctx.closePath();
        ctx.stroke();
      }
    }
  });
  grilleTex.repeat.set(3, 1);
  return grilleTex;
}

/** Indian-style number plate (fictional registration). */
const plateCache = new Map();
export function getPlateTexture(text) {
  if (plateCache.has(text)) return plateCache.get(text);
  const tex = canvasTexture(256, 64, (ctx) => {
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(0, 0, 256, 64);
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 4;
    ctx.strokeRect(3, 3, 250, 58);
    ctx.fillStyle = '#1a3fa8';
    ctx.fillRect(6, 6, 22, 52);
    ctx.fillStyle = '#fff';
    ctx.font = '700 10px sans-serif';
    ctx.fillText('IND', 8, 54);
    ctx.fillStyle = '#111';
    ctx.font = '800 34px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(text, 140, 34);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  plateCache.set(text, tex);
  return tex;
}


