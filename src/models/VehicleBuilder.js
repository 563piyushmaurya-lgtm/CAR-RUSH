import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';
import { canvasTexture } from '../utils/textures.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import {
  addWheel, addLightGlows, buildCarBatch, buildTrafficCar, cachedGeometry, trafficGroup, glassMaterialFor,
} from './CarBuilder.js';
import { TRAFFIC_TYPES } from '../data/cars.js';

// =============================================================
// VehicleBuilder - Indian highway vehicles that are not normal cars:
// decorated trucks, buses, auto-rickshaws, police cars, plus
// "event" props: cows, road workers, warning triangles.
// Every model faces -z (like the player). Oncoming traffic is
// simply rotated 180°.
// =============================================================

let mats = null;
function materials() {
  if (mats) return mats;
  const rearTex = canvasTexture(256, 256, (ctx, w, h) => {
    // The classic painted back of an Indian truck
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#ffcf3a');
    g.addColorStop(1, '#ff7a1a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1d4fd6';
    ctx.fillRect(0, 0, w, 26);
    ctx.fillRect(0, h - 26, w, 26);
    for (let i = 0; i < 8; i++) {
      ctx.fillStyle = i % 2 ? '#e8172e' : '#11a84a';
      ctx.beginPath();
      ctx.arc(16 + i * 32, 13, 9, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.textAlign = 'center';
    ctx.fillStyle = '#c4001c';
    ctx.font = '900 42px "Segoe UI", sans-serif';
    ctx.fillText('HORN', w / 2, 82);
    ctx.fillText('OK', w / 2, 128);
    ctx.fillText('PLEASE', w / 2, 174);
    ctx.fillStyle = '#123a9a';
    ctx.font = '700 20px "Segoe UI", sans-serif';
    ctx.fillText('USE DIPPER AT NIGHT', w / 2, 212);
  });
  const policeTex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#1238a8';
    ctx.font = '900 38px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('POLICE', w / 2, h / 2 + 2);
  });

  const busWindowTex = canvasTexture(512, 64, (ctx, w, h) => {
    ctx.fillStyle = '#1c2c3c';
    ctx.fillRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, 'rgba(170,200,230,0.35)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#0a0b0d';
    for (let x = 0; x < w; x += 64) ctx.fillRect(x, 0, 6, h); // window pillars
    ctx.fillStyle = 'rgba(255,255,255,0.15)';
    ctx.fillRect(0, h / 2, w, 2); // sliding window rail
  });
  busWindowTex.repeat.set(2, 1);
  const destTex = canvasTexture(256, 48, (ctx, w, h) => {
    ctx.fillStyle = '#120800';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#ffa31a';
    ctx.font = '900 28px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXPRESS • INDORE', w / 2, h / 2 + 2);
  });
  const plankTex = canvasTexture(256, 64, (ctx, w, h) => {
    ctx.fillStyle = '#9a6a3a';
    ctx.fillRect(0, 0, w, h);
    for (let y = 0; y < h; y += 16) {
      ctx.fillStyle = `rgba(0,0,0,${0.15 + Math.random() * 0.15})`;
      ctx.fillRect(0, y, w, 2);
    }
    for (let i = 0; i < 300; i++) {
      ctx.fillStyle = `rgba(60,35,15,${Math.random() * 0.25})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 10 + Math.random() * 30, 1);
    }
    // painted flowers & stripes, like real Indian trucks
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = ['#e8172e', '#ffd21a', '#11a84a', '#1d4fd6'][i % 4];
      ctx.beginPath();
      ctx.arc(20 + i * 44, 32, 7, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  plankTex.repeat.set(3, 1);
  const truckFrontTex = canvasTexture(256, 128, (ctx, w, h) => {
    ctx.fillStyle = '#d0d4d8';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#2a2d33';
    for (let y = 12; y < h - 8; y += 12) ctx.fillRect(30, y, w - 60, 6); // chrome grille slats
    ctx.fillStyle = '#e8172e';
    ctx.fillRect(0, 0, w, 8);
    ctx.fillStyle = '#ffd21a';
    ctx.font = '900 20px "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('★ JAI HIND ★', w / 2, h - 6);
  });

  mats = {
    cargo: new THREE.MeshStandardMaterial({ map: plankTex, roughness: 0.9 }),
    busWindows: new THREE.MeshStandardMaterial({ map: busWindowTex, metalness: 0.4, roughness: 0.1 }),
    destBoard: new THREE.MeshBasicMaterial({ map: destTex, toneMapped: false }),
    truckFront: new THREE.MeshStandardMaterial({ map: truckFrontTex, metalness: 0.6, roughness: 0.3 }),
    tarp: new THREE.MeshStandardMaterial({ color: 0x2f6f9f, roughness: 0.95 }),
    truckRear: new THREE.MeshStandardMaterial({ map: rearTex, roughness: 0.8 }),
    canopy: new THREE.MeshStandardMaterial({ color: 0x15171a, roughness: 0.8 }),
    policeText: new THREE.MeshStandardMaterial({ map: policeTex, roughness: 0.6 }),
    policeRed: new THREE.MeshStandardMaterial({ color: 0xff1030, emissive: 0xff1030, emissiveIntensity: 3 }),
    policeBlue: new THREE.MeshStandardMaterial({ color: 0x1040ff, emissive: 0x2050ff, emissiveIntensity: 3 }),
    cowWhite: new THREE.MeshStandardMaterial({ color: 0xe9e4d8, roughness: 0.95 }),
    cowDark: new THREE.MeshStandardMaterial({ color: 0x3b2d22, roughness: 0.95 }),
    vest: new THREE.MeshStandardMaterial({ color: 0xff7a00, emissive: 0x552200, emissiveIntensity: 0.6 }),
    skin: new THREE.MeshStandardMaterial({ color: 0x8d5a3b, roughness: 0.9 }),
    cloth: new THREE.MeshStandardMaterial({ color: 0x2a3550, roughness: 0.9 }),
    helmet: new THREE.MeshStandardMaterial({ color: 0xffd21a, roughness: 0.5 }),
    reflector: new THREE.MeshBasicMaterial({ color: 0xff2a2a }),
  };
  return mats;
}

/** Police lights flash alternately. Call once per frame. */
export function updateVehicleMaterials(time) {
  if (!mats) return;
  const on = Math.sin(time * 14) > 0;
  mats.policeRed.emissiveIntensity = on ? 4 : 0.2;
  mats.policeBlue.emissiveIntensity = on ? 0.2 : 4;
}

const rbox = (w, h, d, r = 0.12, seg = 3) => new RoundedBoxGeometry(w, h, d, seg, r);

function wells(b, xs, zs, r) {
  for (const s of [-1, 1]) {
    for (const z of zs) {
      b.add('well', new THREE.CircleGeometry(r * 1.18, 18, 0, Math.PI), { pos: [s * xs, r, z], rot: [0, Math.PI / 2, 0] });
    }
  }
}

// ---------- Indian truck (lorry) ----------
function truckBatch() {
  const b = new GeoBatch();
  // rounded cab with a decorated visor
  b.add('paint', rbox(2.3, 1.95, 2.05, 0.2, 4), { pos: [0, 1.48, -3.2] });
  b.add('accent', rbox(2.42, 0.38, 0.55, 0.1), { pos: [0, 2.52, -3.95] });
  b.add('glass', rbox(2.0, 0.8, 0.08, 0.04, 2), { pos: [0, 1.95, -4.23] });
  b.add('truckFront', new THREE.PlaneGeometry(1.7, 0.8), { pos: [0, 1.05, -4.235], rot: [0, Math.PI, 0] });
  for (const s of [-1, 1]) {
    b.add('glass', rbox(0.06, 0.62, 0.95, 0.03, 2), { pos: [s * 1.15, 1.95, -3.4] });
    b.add('headlight', new THREE.CylinderGeometry(0.13, 0.13, 0.06, 16), { pos: [s * 0.88, 0.95, -4.25], rot: [Math.PI / 2, 0, 0] });
    b.add('chrome', new THREE.TorusGeometry(0.14, 0.025, 6, 16), { pos: [s * 0.88, 0.95, -4.27] });
    b.add('taillight', new THREE.BoxGeometry(0.3, 0.15, 0.05), { pos: [s * 1.0, 0.72, 4.17] });
    b.add('trim', new THREE.BoxGeometry(0.06, 0.06, 0.6), { pos: [s * 1.3, 2.2, -4.0] }); // mirror arm
    b.add('trim', rbox(0.1, 0.45, 0.25, 0.04, 2), { pos: [s * 1.42, 2.05, -4.2] });
    b.add('chrome', new THREE.CylinderGeometry(0.28, 0.28, 0.9, 14), { pos: [s * 1.05, 0.75, -1.8], rot: [Math.PI / 2, 0, 0] }); // fuel tank
    b.add('trim', new THREE.BoxGeometry(0.5, 0.55, 0.03), { pos: [s * 1.0, 0.35, 3.65] }); // mudflaps
    b.add('accent', new THREE.BoxGeometry(0.03, 0.12, 5.9), { pos: [s * 1.245, 0.72, 1.1] });
  }
  b.add('chrome', rbox(2.35, 0.3, 0.25, 0.08), { pos: [0, 0.55, -4.25] });
  // wooden cargo body with a tarpaulin-covered load
  b.add('cargo', rbox(2.45, 1.35, 6.0, 0.05, 2), { pos: [0, 1.35, 1.1] });
  b.add('tarp', rbox(2.3, 1.0, 5.7, 0.35, 4), { pos: [0, 2.45, 1.1] });
  // half-cylinder dome over the load, axis along the truck, flattened
  b.add('tarp', new THREE.CylinderGeometry(1.12, 1.12, 5.5, 16, 1, false, -Math.PI / 2, Math.PI), { pos: [0, 2.9, 1.1], rot: [-Math.PI / 2, 0, 0], scale: [1, 1, 0.45] });
  b.add('truckRear', new THREE.PlaneGeometry(2.3, 1.25), { pos: [0, 1.32, 4.11] });
  b.add('trim', new THREE.BoxGeometry(2.0, 0.3, 8.2), { pos: [0, 0.55, 0] });
  b.add('trim', new THREE.BoxGeometry(2.3, 0.25, 0.15), { pos: [0, 0.5, 4.12] });
  addLightGlows(b, { width: 2.4, frontZ: -4.25, rearZ: 4.17, headY: 0.95, tailY: 0.72, size: 1.4 });
  wells(b, 1.18, [-3.2, 2.3], 0.5);
  const d = { wheelR: 0.5, wheelW: 0.4 };
  for (const z of [-3.2, 1.75, 2.85]) for (const s of [-1, 1]) addWheel(b, d, [s * 1.0, 0.5, z]);
  return b;
}

// ---------- Bus ----------
function busBatch() {
  const b = new GeoBatch();
  const L = 11;
  b.add('paint', rbox(2.5, 2.55, L, 0.22, 4), { pos: [0, 1.72, 0] });
  b.add('paint', rbox(2.36, 0.3, L - 0.8, 0.12), { pos: [0, 3.07, 0] });
  b.add('cargo', rbox(1.5, 0.32, 3.0, 0.1), { pos: [0, 3.3, 1.5] }); // roof AC unit
  b.add('busWindows', rbox(2.54, 0.95, L - 1.9, 0.06, 2), { pos: [0, 2.3, 0.45] });
  b.add('glass', rbox(2.3, 1.25, 0.1, 0.05, 2), { pos: [0, 2.15, -L / 2 - 0.01] }); // windscreen
  b.add('glass', rbox(2.0, 0.8, 0.08, 0.04, 2), { pos: [0, 2.35, L / 2 + 0.01] });
  b.add('destBoard', new THREE.PlaneGeometry(1.6, 0.3), { pos: [0, 2.97, -L / 2 - 0.07], rot: [0, Math.PI, 0] });
  b.add('grille', new THREE.BoxGeometry(1.4, 0.35, 0.06), { pos: [0, 1.05, -L / 2 - 0.02] });
  b.add('trim', rbox(2.56, 0.4, 0.3, 0.1), { pos: [0, 0.62, -L / 2 - 0.05] });
  b.add('trim', rbox(2.56, 0.35, 0.3, 0.1), { pos: [0, 0.6, L / 2 + 0.05] });
  b.add('trim', new THREE.BoxGeometry(0.04, 2.1, 1.0), { pos: [-1.265, 1.6, -L / 2 + 1.6] }); // door (left, kerb side)
  for (const s of [-1, 1]) {
    b.add('accent', new THREE.BoxGeometry(0.04, 0.22, L - 0.4), { pos: [s * 1.262, 1.5, 0] });
    b.add('accent', new THREE.BoxGeometry(0.04, 0.08, L - 0.4), { pos: [s * 1.262, 1.22, 0] });
    b.add('lightHousing', rbox(0.5, 0.24, 0.1, 0.04, 2), { pos: [s * 0.85, 0.98, -L / 2 - 0.03] });
    b.add('headlight', new THREE.CylinderGeometry(0.08, 0.08, 0.05, 12), { pos: [s * 0.95, 0.98, -L / 2 - 0.08], rot: [Math.PI / 2, 0, 0] });
    b.add('drl', new THREE.BoxGeometry(0.22, 0.04, 0.03), { pos: [s * 0.7, 0.98, -L / 2 - 0.08] });
    b.add('taillight', new THREE.BoxGeometry(0.22, 0.45, 0.05), { pos: [s * 1.05, 1.2, L / 2 + 0.03] });
    b.add('trim', new THREE.CylinderGeometry(0.03, 0.03, 0.8, 6), { pos: [s * 1.45, 2.6, -L / 2 + 0.15], rot: [0.9, 0, 0] }); // mirror stalk
    b.add('trim', rbox(0.1, 0.5, 0.22, 0.04, 2), { pos: [s * 1.48, 2.15, -L / 2 - 0.25] });
  }
  addLightGlows(b, { width: 2.5, frontZ: -L / 2, rearZ: L / 2, headY: 0.98, tailY: 1.2, size: 1.4 });
  wells(b, 1.26, [-3.6, 3.4], 0.55);
  const d = { wheelR: 0.55, wheelW: 0.4 };
  for (const z of [-3.6, 3.4]) for (const s of [-1, 1]) addWheel(b, d, [s * 1.08, 0.55, z]);
  return b;
}

// ---------- Auto-rickshaw ----------
function autoBatch() {
  const b = new GeoBatch();
  b.add('paint', rbox(1.35, 0.75, 2.2, 0.14), { pos: [0, 0.75, 0.25] }); // passenger tub
  b.add('paint', rbox(0.95, 0.95, 0.6, 0.2), { pos: [0, 0.88, -1.0] }); // nose
  b.add('canopy', rbox(1.45, 0.95, 2.2, 0.22, 4), { pos: [0, 1.6, 0.1] });
  b.add('accent', new THREE.BoxGeometry(1.39, 0.1, 2.24), { pos: [0, 1.14, 0.25] }); // green band
  b.add('glass', rbox(1.1, 0.55, 0.05, 0.03, 2), { pos: [0, 1.45, -0.98], rot: [-0.25, 0, 0] });
  b.add('trim', new THREE.BoxGeometry(1.2, 0.5, 0.05), { pos: [0, 1.35, 1.15] }); // back
  b.add('headlight', new THREE.CylinderGeometry(0.1, 0.1, 0.06, 12), { pos: [0, 1.0, -1.32], rot: [Math.PI / 2, 0, 0] });
  b.add('chrome', new THREE.TorusGeometry(0.11, 0.02, 6, 14), { pos: [0, 1.0, -1.34] });
  for (const s of [-1, 1]) b.add('taillight', new THREE.BoxGeometry(0.15, 0.1, 0.04), { pos: [s * 0.5, 0.6, 1.38] });
  addLightGlows(b, { width: 0.1, frontZ: -1.32, rearZ: 1.38, headY: 1.0, tailY: 0.6, size: 0.8 });
  const d = { wheelR: 0.27, wheelW: 0.16 };
  addWheel(b, d, [0, 0.27, -1.0]);
  for (const s of [-1, 1]) addWheel(b, d, [s * 0.62, 0.27, 0.85]);
  return b;
}
// ---------- Police car ----------
const POLICE_DESIGN = {
  len: 4.5, width: 1.85, clearance: 0.3, noseH: 0.72, h: 0.95, tailH: 0.95,
  cabin: { front: 0.6, roofFront: 0.0, roofRear: -1.1, rear: -1.7, roofH: 0.55 },
  wheelR: 0.36, wheelW: 0.3, axle: 0.85, spoiler: 'none', extras: [],
};
function policeBatch() {
  const b = buildCarBatch(POLICE_DESIGN, true);
  const roofY = POLICE_DESIGN.h + POLICE_DESIGN.cabin.roofH + 0.12;
  b.add('trim', new THREE.BoxGeometry(1.2, 0.08, 0.3), { pos: [0, roofY, 0.5] });
  b.add('policeRed', new THREE.BoxGeometry(0.5, 0.14, 0.26), { pos: [-0.32, roofY + 0.1, 0.5] });
  b.add('policeBlue', new THREE.BoxGeometry(0.5, 0.14, 0.26), { pos: [0.32, roofY + 0.1, 0.5] });
  for (const s of [-1, 1]) {
    b.add('policeText', new THREE.PlaneGeometry(1.6, 0.4), { pos: [s * 0.97, 0.62, 0], rot: [0, s * Math.PI / 2, 0] });
  }
  return b;
}

/** Any traffic vehicle by type (cars use CarBuilder, the rest are built here). */
export function buildTrafficVehicle(type) {
  const builders = { truck: truckBatch, bus: busBatch, auto: autoBatch, police: policeBatch };
  if (!type.builder) return buildTrafficCar(type);
  const merged = cachedGeometry(`vehicle:${type.builder}`, () => builders[type.builder]().merge());
  const extra = type.builder === 'police' ? { glass: glassMaterialFor(POLICE_DESIGN) } : {};
  return trafficGroup(merged, { ...materials(), ...extra });
}

export { TRAFFIC_TYPES };

// ---------- Event props ----------
const propCache = new Map();
function cachedProp(key, build) {
  if (!propCache.has(key)) {
    const b = new GeoBatch();
    build(b);
    propCache.set(key, b.merge());
  }
  return meshesFromMerged(propCache.get(key), materials(), { castShadow: true });
}

/** A cow - very much part of Indian highway life. Faces -x (crossing the road). */
export function buildCow() {
  const group = cachedProp('cow', (b) => {
    b.add('cowWhite', new THREE.BoxGeometry(0.7, 0.75, 1.6), { pos: [0, 1.05, 0] });
    b.add('cowWhite', new THREE.BoxGeometry(0.35, 0.3, 0.45), { pos: [0, 1.55, -0.25] }); // hump
    b.add('cowWhite', new THREE.BoxGeometry(0.38, 0.42, 0.55), { pos: [0, 1.2, -1.0] }); // head
    b.add('cowDark', new THREE.BoxGeometry(0.3, 0.2, 0.2), { pos: [0, 1.08, -1.32] }); // muzzle
    for (const s of [-1, 1]) {
      b.add('cowDark', new THREE.ConeGeometry(0.05, 0.3, 6), { pos: [s * 0.16, 1.5, -0.95], rot: [0, 0, s * -0.5] });
      for (const z of [-0.6, 0.6]) b.add('cowWhite', new THREE.BoxGeometry(0.16, 0.7, 0.16), { pos: [s * 0.22, 0.35, z] });
    }
    b.add('cowDark', new THREE.BoxGeometry(0.06, 0.6, 0.06), { pos: [0, 0.85, 0.82] }); // tail
  });
  group.rotation.y = Math.PI / 2;
  const wrap = new THREE.Group();
  wrap.add(group);
  return wrap;
}

export function buildWorker() {
  return cachedProp('worker', (b) => {
    for (const s of [-1, 1]) b.add('cloth', new THREE.BoxGeometry(0.16, 0.8, 0.2), { pos: [s * 0.12, 0.4, 0] });
    b.add('vest', new THREE.BoxGeometry(0.5, 0.65, 0.3), { pos: [0, 1.12, 0] });
    for (const s of [-1, 1]) b.add('vest', new THREE.BoxGeometry(0.12, 0.6, 0.14), { pos: [s * 0.32, 1.1, 0], rot: [0, 0, s * 0.15] });
    b.add('skin', new THREE.SphereGeometry(0.15, 10, 8), { pos: [0, 1.6, 0] });
    b.add('helmet', new THREE.SphereGeometry(0.17, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), { pos: [0, 1.64, 0] });
  });
}

export function buildWarningTriangle() {
  return cachedProp('triangle', (b) => {
    const shape = new THREE.Shape();
    shape.moveTo(-0.35, 0);
    shape.lineTo(0.35, 0);
    shape.lineTo(0, 0.6);
    shape.closePath();
    b.add('reflector', new THREE.ExtrudeGeometry(shape, { depth: 0.04, bevelEnabled: false }), { pos: [0, 0.05, 0] });
  });
}


