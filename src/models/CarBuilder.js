import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';
import { getGlowTexture } from '../utils/textures.js';
import { envHolder, trackEnv, untrackEnv } from '../utils/envMap.js';
import { registerNight } from '../utils/nightLights.js';
import {
  bodyProfile, bodyGeometry, greenhouse, makeGlassTexture, addDetailedWheel, getGrilleTexture, getPlateTexture, loft,
} from './CarBody.js';

// =============================================================
// CarBuilder - builds realistic-looking cars entirely in code.
//
// The body is a smooth LOFTED shell (see CarBody.js): rounded
// cross-sections that taper towards the nose and tail, with fender
// flares over the wheels. On top come a curved glass cabin with
// blacked-out pillars, a painted roof, shaped LED headlights,
// honeycomb grilles, tail-light bars, mirrors, door handles,
// number plates and detailed wheels (tyre, rim, brake disc, caliper).
// Car coordinates: the FRONT points towards -z.
// =============================================================

// ---------- Materials ----------
let shared = null;

/** Additive "light glow" sprite material (visible through fog, like real lamps). */
export function glowMaterial(color, opacity = 1) {
  return new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color, transparent: true, opacity,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  });
}

export function sharedMaterials() {
  if (shared) return shared;
  const env = envHolder.map;
  shared = {
    // Traffic switches its lights on automatically at night
    headGlow: registerNight(glowMaterial(0xfff4d6, 0), 'opacity', 0.0, 0.95),
    tailGlow: registerNight(glowMaterial(0xff2030, 0.1), 'opacity', 0.12, 0.8),
    glass: trackEnv(new THREE.MeshPhysicalMaterial({
      color: 0xffffff, metalness: 0.25, roughness: 0.03, clearcoat: 1, envMap: env, envMapIntensity: 0.65,
    })),
    trim: new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.5, metalness: 0.3 }),
    chrome: trackEnv(new THREE.MeshStandardMaterial({ color: 0xe8edf3, metalness: 1, roughness: 0.12, envMap: env, envMapIntensity: 1.2 })),
    rim: trackEnv(new THREE.MeshStandardMaterial({ color: 0xc9cdd3, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.1 })),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x24262b, metalness: 0.7, roughness: 0.45, side: THREE.DoubleSide }),
    disc: new THREE.MeshStandardMaterial({ color: 0x80848b, metalness: 0.9, roughness: 0.35 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.4, roughness: 0.4 }),
    tire: new THREE.MeshStandardMaterial({ color: 0x141416, roughness: 0.88, side: THREE.DoubleSide }),
    well: new THREE.MeshBasicMaterial({ color: 0x050506, side: THREE.DoubleSide }),
    lightHousing: trackEnv(new THREE.MeshPhysicalMaterial({
      color: 0x0c0d10, metalness: 0.6, roughness: 0.12, clearcoat: 1, envMap: env, envMapIntensity: 1,
    })),
    drl: new THREE.MeshBasicMaterial({ color: 0xf4f8ff, toneMapped: false }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf6ff, emissiveIntensity: 2.6 }),
    // toneMapped: false keeps the red pure instead of drifting to orange
    taillight: new THREE.MeshBasicMaterial({ color: 0xff1430, toneMapped: false }),
    grille: new THREE.MeshStandardMaterial({ map: getGrilleTexture(), metalness: 0.5, roughness: 0.5 }),
    plate: new THREE.MeshStandardMaterial({ map: getPlateTexture('CR 07 RN 2026'), roughness: 0.5 }),
    lightbar: new THREE.MeshStandardMaterial({ color: 0xfff3c4, emissive: 0xffe08a, emissiveIntensity: 2.4 }),
    cargo: new THREE.MeshStandardMaterial({ color: 0xdfe3ea, roughness: 0.65, metalness: 0.1 }),
  };
  return shared;
}

/** A brand new paint material (player car gets its own so recolouring is instant). */
export function createPaintMaterial(hex) {
  return trackEnv(new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(hex),
    metalness: 0.3,
    roughness: 0.32,
    clearcoat: 1,
    clearcoatRoughness: 0.04,
    envMap: envHolder.map,
    envMapIntensity: 0.6,
  }));
}

export function disposePaint(mat) {
  untrackEnv(mat);
  mat.dispose();
}

const paintCache = new Map();
export function cachedPaint(hex) {
  if (!paintCache.has(hex)) paintCache.set(hex, createPaintMaterial(hex));
  return paintCache.get(hex);
}

const accentCache = new Map();
export function cachedAccent(hex) {
  if (!accentCache.has(hex)) {
    accentCache.set(hex, new THREE.MeshStandardMaterial({
      color: new THREE.Color(hex), metalness: 0.3, roughness: 0.35,
      emissive: new THREE.Color(hex), emissiveIntensity: 0.15,
      envMap: envHolder.map, envMapIntensity: 0.6,
    }));
  }
  return accentCache.get(hex);
}

const caliperCache = new Map();
function caliperMaterial(hex) {
  if (!caliperCache.has(hex)) {
    caliperCache.set(hex, new THREE.MeshStandardMaterial({ color: new THREE.Color(hex), roughness: 0.35, metalness: 0.3 }));
  }
  return caliperCache.get(hex);
}

/** Window material per design (the pillars are painted into its texture). */
const glassCache = new WeakMap();
export function glassMaterialFor(d) {
  if (!glassCache.has(d)) {
    const P = bodyProfile(d);
    const { zones } = greenhouse(d, P);
    const mat = sharedMaterials().glass.clone();
    mat.map = makeGlassTexture({ ...zones, panelRear: d.extras && d.extras.includes('cargo') });
    trackEnv(mat, 0.9);
    glassCache.set(d, mat);
  }
  return glassCache.get(d);
}

// ---------- Helpers ----------
/** Adds a pair of light-glow sprites (front faces -z, rear faces +z). */
export function addLightGlows(b, { width, frontZ, rearZ, headY, tailY, size = 1.1 }) {
  for (const s of [-1, 1]) {
    b.add('headGlow', new THREE.PlaneGeometry(size, size), { pos: [s * width * 0.3, headY, frontZ - 0.05], rot: [0, Math.PI, 0] });
    b.add('tailGlow', new THREE.PlaneGeometry(size * 0.8, size * 0.8), { pos: [s * width * 0.36, tailY, rearZ + 0.05] });
  }
}

/** Simple wheel for trucks, buses and autos (kept for VehicleBuilder). */
export function addWheel(batch, d, pos) {
  addDetailedWheel(batch, { r: d.wheelR, w: d.wheelW, style: d.wheelStyle || 'basic' }, pos, pos[0] >= 0 ? 1 : -1);
}

function wheelPositions(d) {
  const x = d.width / 2 - d.wheelW / 2 + 0.08;
  const z = d.len / 2 - d.axle;
  const y = d.wheelR;
  return [[-x, y, -z], [x, y, -z], [-x, y, z], [x, y, z]];
}

/** x of the body surface at road position t and height y (for things stuck on the sides). */
function surfaceX(P, t, y, taperTop = 0.14) {
  const tp = P.top(t);
  const bt = P.bottom(t);
  const cy = (tp + bt) / 2;
  const hh = (tp - bt) / 2;
  const yn = Math.max(-1, Math.min(1, (y - cy) / hh));
  let xn = (1 - Math.abs(yn) ** P.n) ** (1 / P.n);
  if (yn > 0) xn *= 1 - taperTop * yn;
  return xn * P.hw(t);
}

/** y of the body top at road position t and side offset x. */
function surfaceY(P, t, x, taperTop = 0.14) {
  const tp = P.top(t);
  const bt = P.bottom(t);
  const hh = (tp - bt) / 2;
  const xn = Math.min(0.98, Math.abs(x) / (P.hw(t) * (1 - taperTop)));
  return (tp + bt) / 2 + hh * (1 - xn ** P.n) ** (1 / P.n);
}

/** A thin strip lofted along the body (stripes, chrome lines). */
function strip(P, t0, t1, at, width, thick = 0.008) {
  const rings = [];
  for (let i = 0; i <= 10; i++) {
    const t = t0 + ((t1 - t0) * i) / 10;
    const z = P.z(t);
    const { x, y, side } = at(t);
    if (side) {
      // vertical strip on the side of the car
      const sx = Math.sign(x);
      rings.push([
        new THREE.Vector3(x + sx * thick, y - width / 2, z), new THREE.Vector3(x + sx * thick, y + width / 2, z),
        new THREE.Vector3(x - sx * 0.002, y + width / 2, z), new THREE.Vector3(x - sx * 0.002, y - width / 2, z),
      ].sort(() => 0));
      if (sx < 0) rings[rings.length - 1].reverse();
    } else {
      rings.push([
        new THREE.Vector3(x + width / 2, y - 0.002, z), new THREE.Vector3(x + width / 2, y + thick, z),
        new THREE.Vector3(x - width / 2, y + thick, z), new THREE.Vector3(x - width / 2, y - 0.002, z),
      ]);
    }
  }
  return loft(rings);
}

// ---------- The car ----------
export function buildCarBatch(d, includeWheels) {
  const b = new GeoBatch();
  const P = bodyProfile(d);
  const { h2, L } = P;
  const W = d.width;
  const cab = d.cabin;
  const extras = d.extras || [];
  const taper = (d.round || 3.6) > 4.5 ? 0.08 : 0.14;

  // body shell, glass cabin and roof
  b.add('paint', bodyGeometry(P, taper));
  const gh = greenhouse(d, P);
  b.add('glass', gh.glass);
  b.add(d.roofBlack ? 'trim' : 'paint', gh.roof);

  // ---- front ----
  const lowNose = d.noseH - (d.clearance + 0.18) < 0.15;
  const frontTop = P.top(0.03);
  const frontBot = P.bottom(0.03);
  const hy = lowNose ? P.top(0.07) - 0.02 : frontBot + (frontTop - frontBot) * 0.66;
  const hx = P.hw(0.05) * 0.6;
  for (const s of [-1, 1]) {
    const ry = s * 0.3;
    if (lowNose) {
      // slim lights set into the sloping hood
      const slope = Math.atan2(P.top(0.12) - P.top(0.04), 0.08 * L);
      b.add('lightHousing', new THREE.BoxGeometry(0.5, 0.06, 0.34), { pos: [s * hx, hy, -h2 + 0.2], rot: [-slope, ry, 0] });
      b.add('drl', new THREE.BoxGeometry(0.48, 0.02, 0.04), { pos: [s * hx, hy + 0.035, -h2 + 0.06], rot: [-slope, ry, 0] });
      b.add('headlight', new THREE.CylinderGeometry(0.045, 0.045, 0.03, 12), { pos: [s * (hx - 0.08), hy + 0.035, -h2 + 0.16] });
    } else {
      b.add('lightHousing', new THREE.BoxGeometry(0.5, 0.15, 0.3), { pos: [s * hx, hy, -h2 + 0.1], rot: [0, ry, 0] });
      b.add('drl', new THREE.BoxGeometry(0.47, 0.028, 0.05), { pos: [s * hx, hy + 0.055, -h2 - 0.03], rot: [0, ry, 0] });
      for (const o of [-0.1, 0.07]) {
        b.add('headlight', new THREE.CylinderGeometry(0.05, 0.05, 0.05, 14), {
          pos: [s * (hx + o), hy - 0.015, -h2 - 0.04 + Math.abs(o) * 0.25 * (s * o > 0 ? 1 : 0)], rot: [Math.PI / 2, 0, 0],
        });
      }
      // upper grille with a chrome bar between the headlights
      b.add('grille', new THREE.BoxGeometry(hx * 1.15, 0.13, 0.06), { pos: [0, hy - 0.02, -h2 - 0.01] });
      b.add('chrome', new THREE.BoxGeometry(hx * 1.2, 0.02, 0.07), { pos: [0, hy + 0.055, -h2 - 0.01] });
    }
  }
  // lower intake, splitter, front plate
  const fb = P.bottom(0);
  b.add('grille', new THREE.BoxGeometry(P.hw(0.02) * 1.25, 0.15, 0.06), { pos: [0, fb + 0.12, -h2 - 0.005] });
  b.add('trim', new THREE.BoxGeometry(P.hw(0.05) * 1.75, 0.03, 0.2), { pos: [0, P.bottom(0.05) - 0.005, -h2 + 0.08] });
  b.add('plate', new THREE.BoxGeometry(0.5, 0.12, 0.02), { pos: [0, fb + 0.12, -h2 - 0.045] });

  // ---- rear ----
  const tailY = P.top(0.985) - 0.08;
  b.add('taillight', new THREE.BoxGeometry(P.hw(0.99) * 1.6, 0.04, 0.04), { pos: [0, tailY, h2 + 0.005] });
  for (const s of [-1, 1]) {
    const tx = P.hw(0.99) * 0.6;
    b.add('lightHousing', new THREE.BoxGeometry(0.4, 0.13, 0.06), { pos: [s * tx, tailY - 0.03, h2 + 0.005], rot: [0, -s * 0.22, 0] });
    b.add('taillight', new THREE.BoxGeometry(0.34, 0.05, 0.02), { pos: [s * tx, tailY - 0.02, h2 + 0.03], rot: [0, -s * 0.22, 0] });
    b.add('chrome', new THREE.CylinderGeometry(0.05, 0.05, 0.14, 12), {
      pos: [s * 0.45, P.bottom(1) + 0.07, h2 + 0.03], rot: [Math.PI / 2, 0, 0],
    });
  }
  const rb = P.bottom(1);
  b.add('trim', new THREE.BoxGeometry(P.hw(1) * 1.5, 0.12, 0.2), { pos: [0, rb + 0.04, h2 - 0.06] }); // diffuser
  for (let i = -2; i <= 2; i++) b.add('trim', new THREE.BoxGeometry(0.02, 0.1, 0.22), { pos: [i * 0.16, rb + 0.02, h2 - 0.02] });
  b.add('plate', new THREE.BoxGeometry(0.5, 0.12, 0.02), { pos: [0, rb + 0.26, h2 + 0.012] });

  // ---- sides: mirrors, door lines, handles, skirts, wheel wells ----
  const mz = -cab.front + 0.18;
  const mt = P.tAtZ(mz);
  for (const s of [-1, 1]) {
    const mx = s * (P.hw(mt) * 0.8 + 0.1);
    b.add('trim', new THREE.BoxGeometry(0.16, 0.04, 0.07), { pos: [mx - s * 0.08, d.h + 0.06, mz] });
    b.add('paint', new THREE.SphereGeometry(0.1, 14, 10), { pos: [mx, d.h + 0.09, mz], scale: [0.8, 0.6, 1.1] });
    b.add('trim', new THREE.CircleGeometry(0.065, 12), { pos: [mx, d.h + 0.09, mz + 0.105], scale: [1.1, 0.75, 1] });

    const doorTs = [P.tAtZ(-cab.front + 0.05), P.tAtZ(-(cab.roofFront + (cab.roofRear - cab.roofFront) * 0.42))];
    if (d.len > 4.3) doorTs.push(P.tAtZ(-cab.rear - 0.05));
    for (const t of doorTs) {
      const y0 = P.bottom(t) + 0.12;
      const y1 = d.h - 0.04;
      b.add('trim', new THREE.BoxGeometry(0.01, y1 - y0, 0.012), { pos: [s * (surfaceX(P, t, (y0 + y1) / 2, taper) + 0.002), (y0 + y1) / 2, P.z(t)] });
    }
    for (const t of [doorTs[0] + 0.12, doorTs[1] + 0.12]) {
      if (t > P.tR - 0.1) continue;
      const y = d.h - 0.17;
      b.add('chrome', new THREE.BoxGeometry(0.03, 0.035, 0.17), { pos: [s * (surfaceX(P, t, y, taper) + 0.012), y, P.z(t)] });
    }
    b.add('trim', strip(P, P.tF + 0.07, P.tR - 0.07, (t) => ({ x: s * (surfaceX(P, t, P.bottom(t) + 0.07, taper)), y: P.bottom(t) + 0.07, side: true }), 0.09, 0.02));

    for (const ta of [P.tF, P.tR]) {
      const wx = s * (surfaceX(P, ta, d.wheelR + 0.1, taper) + 0.004);
      b.add('well', new THREE.CircleGeometry(d.wheelR * 1.16, 20, 0, Math.PI), { pos: [wx, d.wheelR, P.z(ta)], rot: [0, Math.PI / 2, 0] });
      b.add('trim', new THREE.TorusGeometry(d.wheelR * 1.16, 0.03, 6, 20, Math.PI), { pos: [wx + s * 0.008, d.wheelR, P.z(ta)], rot: [0, Math.PI / 2, 0] });
    }
  }

  // ---- optional decorations ----
  const onTop = (t0, t1, x, w, key) => b.add(key, strip(P, t0, t1, (t) => ({ x, y: surfaceY(P, t, x, taper) }), w));
  if (extras.includes('stripe')) {
    onTop(0.02, P.cowl, 0, 0.34, 'accent');
    b.add('accent', new THREE.BoxGeometry(0.34, 0.012, cab.roofFront - cab.roofRear - 0.1), {
      pos: [0, gh.roofTop + 0.002, -(cab.roofFront + cab.roofRear) / 2],
    });
  }
  if (extras.includes('twinStripe')) {
    for (const s of [-1, 1]) onTop(0.02, P.cowl, s * 0.17, 0.13, 'accent');
    for (const s of [-1, 1]) onTop(0.86, 0.99, s * 0.17, 0.13, 'accent');
  }
  if (extras.includes('sideStripe') || extras.includes('chromeLine')) {
    const key = extras.includes('chromeLine') ? 'chrome' : 'accent';
    for (const s of [-1, 1]) {
      const yAt = (t) => (extras.includes('chromeLine') ? d.h - 0.07 : (P.bottom(t) + P.top(t)) / 2 + 0.05);
      b.add(key, strip(P, 0.08, 0.93, (t) => ({ x: s * surfaceX(P, t, yAt(t), taper), y: yAt(t), side: true }), key === 'chrome' ? 0.025 : 0.06));
    }
  }
  if (extras.includes('hoodScoop')) {
    const t = P.cowl * 0.55;
    const slope = Math.atan2(P.top(t + 0.04) - P.top(t - 0.04), 0.08 * L);
    b.add('trim', new THREE.BoxGeometry(0.55, 0.12, 0.7), { pos: [0, P.top(t) + 0.04, P.z(t)], rot: [-slope, 0, 0] });
  }
  if (extras.includes('sideVents')) {
    for (const s of [-1, 1]) {
      const t = P.tF + 0.1;
      const y = P.bottom(t) + 0.3;
      for (let i = 0; i < 3; i++) {
        b.add('trim', new THREE.BoxGeometry(0.03, 0.035, 0.38), { pos: [s * (surfaceX(P, t, y + i * 0.06, taper) + 0.01), y + i * 0.06, P.z(t)] });
      }
    }
  }
  const roofLen = cab.roofFront - cab.roofRear;
  const roofZ = -(cab.roofFront + cab.roofRear) / 2;
  if (extras.includes('roofRack')) {
    for (const s of [-1, 1]) b.add('trim', new THREE.BoxGeometry(0.05, 0.06, roofLen * 0.9), { pos: [s * gh.roofHalfWidth * 0.8, gh.roofTop + 0.06, roofZ] });
    for (const t of [-0.3, 0.3]) b.add('trim', new THREE.BoxGeometry(gh.roofHalfWidth * 1.7, 0.04, 0.05), { pos: [0, gh.roofTop + 0.09, roofZ + roofLen * t] });
  }
  if (extras.includes('lightbar')) {
    b.add('lightbar', new THREE.BoxGeometry(gh.roofHalfWidth * 1.5, 0.1, 0.14), { pos: [0, gh.roofTop + 0.13, -cab.roofFront + 0.15] });
  }
  if (extras.includes('bullbar')) {
    b.add('trim', new THREE.BoxGeometry(W * 0.7, 0.08, 0.08), { pos: [0, d.clearance + 0.4, -(h2 + 0.25)] });
    for (const s of [-1, 1]) b.add('trim', new THREE.BoxGeometry(0.08, 0.5, 0.08), { pos: [s * W * 0.3, d.clearance + 0.3, -(h2 + 0.25)] });
  }
  if (extras.includes('fins')) {
    for (const s of [-1, 1]) {
      b.add('paint', new THREE.BoxGeometry(0.05, 0.26, 0.7), { pos: [s * P.hw(0.88) * 0.7, P.top(0.88) + 0.1, P.z(0.88)] });
    }
  }

  // ---- spoilers ----
  const deckY = P.top(0.95);
  if (d.spoiler === 'lip') {
    b.add('paint', new THREE.BoxGeometry(P.hw(0.97) * 1.6, 0.04, 0.22), { pos: [0, deckY + 0.03, h2 - 0.18], rot: [0.12, 0, 0] });
  } else if (d.spoiler === 'wing' || d.spoiler === 'big') {
    const big = d.spoiler === 'big';
    const postH = big ? 0.4 : 0.26;
    for (const s of [-1, 1]) {
      b.add('trim', new THREE.BoxGeometry(0.05, postH, 0.12), { pos: [s * W * 0.28, deckY + postH / 2, h2 - 0.3] });
      b.add(big ? 'trim' : 'accent', new THREE.BoxGeometry(0.025, 0.13, 0.4), { pos: [s * (W * 0.5 + 0.01), deckY + postH + 0.02, h2 - 0.25] });
    }
    b.add(big ? 'accent' : 'paint', new THREE.BoxGeometry(W + (big ? 0.02 : -0.06), 0.045, big ? 0.48 : 0.4), {
      pos: [0, deckY + postH + 0.02, h2 - 0.25], rot: [-0.08, 0, 0],
    });
  }

  // glow sprites so lights shine at night / through fog
  addLightGlows(b, { width: W, frontZ: -(h2 + 0.05), rearZ: h2 + 0.02, headY: hy, tailY });

  if (includeWheels) {
    for (const p of wheelPositions(d)) {
      addDetailedWheel(b, { r: d.wheelR, w: d.wheelW, style: d.wheelStyle || 'basic' }, p, p[0] > 0 ? 1 : -1);
    }
  }
  return b;
}

// ---------- Public builders ----------
const geometryCache = new Map();
export function cachedGeometry(key, build) {
  if (!geometryCache.has(key)) geometryCache.set(key, build());
  return geometryCache.get(key);
}

function addUnderglow(group, d, hex) {
  const mat = new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: new THREE.Color(hex), transparent: true, opacity: 0.55,
    blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
  });
  const glow = new THREE.Mesh(new THREE.PlaneGeometry(d.width + 1.4, d.len + 1.6), mat);
  glow.rotation.x = -Math.PI / 2;
  glow.position.y = 0.04;
  group.add(glow);
}

/**
 * Builds the player's car. Wheels are separate objects so they can spin.
 * The player's lights get their OWN materials, because the player
 * switches headlights manually (traffic switches them automatically).
 * @returns {THREE.Group} with userData { paint, wheels, wheelR, lights }
 */
export function buildPlayerCar(car, colorHex) {
  const d = car.design;
  const body = cachedGeometry(`player:${car.id}`, () => buildCarBatch(d, false).merge());
  const wheelGeo = (side) => cachedGeometry(`wheel:${car.id}:${side}`, () => {
    const b = new GeoBatch();
    addDetailedWheel(b, { r: d.wheelR, w: d.wheelW, style: d.wheelStyle || 'multi' }, [0, 0, 0], side);
    return b.merge();
  });

  const paint = createPaintMaterial(colorHex);
  const lights = {
    headlight: new THREE.MeshStandardMaterial({ color: 0xdfe6ee, emissive: 0xeaf6ff, emissiveIntensity: 0.15 }),
    headGlow: glowMaterial(0xf2f8ff, 0),
    tailGlow: glowMaterial(0xff2030, 0.12),
  };
  const materials = {
    ...sharedMaterials(), ...lights, paint, accent: cachedAccent(car.accent),
    glass: glassMaterialFor(d), caliper: caliperMaterial(car.caliper || '#d0202a'),
  };
  const group = meshesFromMerged(body, materials, { castShadow: true });

  const wheels = [];
  for (const p of wheelPositions(d)) {
    const pivot = meshesFromMerged(wheelGeo(p[0] > 0 ? 1 : -1), materials, { castShadow: true });
    pivot.position.set(p[0], p[1], p[2]);
    group.add(pivot);
    wheels.push(pivot);
  }
  if (d.extras.includes('neonUnder')) addUnderglow(group, d, car.accent);

  group.userData = { paint, wheels, wheelR: d.wheelR, lights };
  return group;
}

/** Builds a traffic car (fully merged for speed). Use userData.setPaint(hex) to recolour. */
export function buildTrafficCar(type) {
  const merged = cachedGeometry(`traffic:${type.id}`, () => buildCarBatch(type.design, true).merge());
  return trafficGroup(merged, { glass: glassMaterialFor(type.design) });
}

/** Wraps merged geometry into a recolourable traffic vehicle group. */
export function trafficGroup(merged, extraMaterials = {}) {
  const materials = {
    ...sharedMaterials(), paint: cachedPaint('#cccccc'), accent: cachedAccent('#888888'), ...extraMaterials,
  };
  const group = meshesFromMerged(merged, materials, { castShadow: true });
  const paintMeshes = group.children.filter((m) => m.name === 'paint');
  const accentMeshes = group.children.filter((m) => m.name === 'accent');
  group.userData.setPaint = (hex, accentHex) => {
    const mat = cachedPaint(hex);
    paintMeshes.forEach((m) => { m.material = mat; });
    if (accentHex) {
      const acc = cachedAccent(accentHex);
      accentMeshes.forEach((m) => { m.material = acc; });
    }
  };
  return group;
}

// =============================================================
// OPTIONAL: real 3D car models (GLB / GLTF)
// If a car in cars.js has `modelUrl`, the garage & game load that file
// with Three.js's GLTFLoader and swap it in for the procedural body.
// Put licensed .glb files in /public/models/ and set for example:
//   modelUrl: './models/my-car.glb', modelPaint: 'Body'
// The model is scaled to the car's design length, centred, and
// materials named like the body paint become recolourable.
// =============================================================
let gltfLoader = null;
export async function loadCarModel(car, colorHex) {
  if (!gltfLoader) {
    const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js');
    gltfLoader = new GLTFLoader();
  }
  const gltf = await gltfLoader.loadAsync(car.modelUrl);
  const model = gltf.scene;
  if (car.modelRotationY) model.rotation.y = car.modelRotationY;

  // normalise size & position
  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const scale = car.design.len / Math.max(size.z, size.x, 0.001);
  model.scale.multiplyScalar(scale);
  box.setFromObject(model);
  const centre = box.getCenter(new THREE.Vector3());
  model.position.x -= centre.x;
  model.position.z -= centre.z;
  model.position.y -= box.min.y;

  const paint = createPaintMaterial(colorHex);
  const paintName = new RegExp(car.modelPaint || 'paint|body|carpaint', 'i');
  const wheels = [];
  model.traverse((o) => {
    if (o.isMesh) {
      o.castShadow = true;
      if (o.material && paintName.test(o.material.name || '')) o.material = paint;
    }
    if (/wheel/i.test(o.name) && !o.isMesh) wheels.push(o);
  });

  const group = new THREE.Group();
  group.add(model);
  group.userData = {
    paint,
    wheels,
    wheelR: car.design.wheelR,
    lights: {
      headlight: new THREE.MeshStandardMaterial(),
      headGlow: glowMaterial(0xf2f8ff, 0),
      tailGlow: glowMaterial(0xff2030, 0.12),
    },
    isGltf: true,
  };
  return group;
}


