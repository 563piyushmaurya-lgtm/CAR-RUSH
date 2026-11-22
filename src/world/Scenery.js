import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';
import { makeFacade, makeSign, makeAdTexture, ADS } from '../utils/signs.js';
import { getGlowTexture, scaleBoxUVs, canvasTexture } from '../utils/textures.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { registerNight } from '../utils/nightLights.js';
import { envHolder, trackEnv } from '../utils/envMap.js';
import { rand, randInt, pick, weightedPick } from '../utils/math.js';

// =============================================================
// Scenery - zones, buildings and roadside props.
//
// TEMPLATES: every building type is generated ONCE per variant and
// side of the road, merged by material (GeoBatch), and then reused
// as cheap instances from a pool. Segments of road ask for
// "a hospital on the left" and get a ready-made object.
//
// Template space: the building's FRONT faces the road. `s` is the
// side (-1 = left, +1 = right), so the front normal is -s along x.
// Driver-facing signs face +z (towards the oncoming camera).
// =============================================================

export const ELEVATION = 9; // metres the surroundings drop on flyovers/bridges
const VARIANTS = 4;

// ---------- Zones ----------
export const ZONES = {
  countryside: {
    label: 'Countryside', ground: 0x6f8f3a,
    lots: { fields: 5, village: 2.5, huts: 2, dhaba: 1, petrolPump: 1, telecom: 0.6, teaStall: 1.2, punctureShop: 0.8, fruitStall: 0.6, none: 1 },
    trees: 1.0, lamps: false, poles: true, billboards: 0.14, setback: [13, 22],
  },
  town: {
    label: 'Small Town', ground: 0x8b8a5c,
    lots: { shops: 4, townHouse: 3, school: 1, hospital: 1, bank: 1, restaurant: 1, dhaba: 1, petrolPump: 1, teaStall: 1, punctureShop: 1, fruitStall: 1 },
    trees: 0.45, lamps: true, poles: true, billboards: 0.3, setback: [12, 16],
  },
  city: {
    label: 'Commercial City', ground: 0x7d7c74,
    lots: { mall: 2, office: 3, hotel: 2, hospital: 2, apartment: 2, cinema: 1, bank: 1, shops: 1, school: 0.6 },
    trees: 0.25, lamps: true, poles: false, billboards: 0.55, setback: [14, 20],
  },
  industrial: {
    label: 'Industrial Area', ground: 0x8a7d62,
    lots: { factory: 4, warehouse: 4, waterTower: 1, telecom: 1, petrolPump: 1 },
    trees: 0.2, lamps: true, poles: true, billboards: 0.15, setback: [15, 24],
  },
  urban: {
    label: 'Urban Highway', ground: 0x777970,
    lots: { apartment: 5, office: 3, mall: 1, hospital: 1, hotel: 1 },
    trees: 0.3, lamps: true, poles: false, billboards: 0.45, setback: [14, 18],
  },
};

const NEXT_ZONE = {
  countryside: ['town', 'industrial', 'town'],
  town: ['countryside', 'city', 'city'],
  city: ['urban', 'town'],
  urban: ['city', 'industrial'],
  industrial: ['countryside', 'town'],
};

/** Endless sequence of zones along the road (by odometer). */
export class ZonePlanner {
  constructor() {
    this.list = [{ zone: 'countryside', start: -1000, len: 1700 }];
    this.extend(5000);
  }

  extend(until) {
    let last = this.list[this.list.length - 1];
    while (last.start + last.len < until) {
      const zone = pick(NEXT_ZONE[last.zone]);
      last = { zone, start: last.start + last.len, len: rand(700, 1300) };
      this.list.push(last);
    }
    while (this.list.length > 3 && this.list[1].start + this.list[1].len < until - 8000) this.list.shift();
  }

  zoneAt(dist) {
    this.extend(dist + 2000);
    for (const z of this.list) if (dist >= z.start && dist < z.start + z.len) return z;
    return this.list[this.list.length - 1];
  }
}

// ---------- Materials ----------
const MATS = {};
function initMaterials() {
  if (MATS.solid) return;
  const env = envHolder.map;
  const night = (m, prop, day, n) => registerNight(m, prop, day, n);
  MATS.solid = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  MATS.metal = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.4, metalness: 0.6 });
  // leaf clusters, bark and grass are painted textures; vertex colours tint them
  const leafTex = canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#9a9a9a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 1400; i++) {
      const v = 150 + Math.floor(Math.random() * 105);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.beginPath();
      ctx.ellipse(Math.random() * w, Math.random() * h, 3 + Math.random() * 5, 2 + Math.random() * 3, Math.random() * 3, 0, Math.PI * 2);
      ctx.fill();
    }
  });
  leafTex.repeat.set(3, 3);
  const barkTex = canvasTexture(64, 256, (ctx, w, h) => {
    ctx.fillStyle = '#bdbdbd';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 60; i++) {
      ctx.fillStyle = `rgba(40,30,20,${0.2 + Math.random() * 0.4})`;
      ctx.fillRect(Math.random() * w, 0, 1 + Math.random() * 3, h);
    }
  });
  const tuftTex = canvasTexture(128, 128, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    for (let i = 0; i < 70; i++) {
      const x = 10 + Math.random() * (w - 20);
      const v = 170 + Math.floor(Math.random() * 85);
      ctx.strokeStyle = `rgb(${v},${v},${v})`;
      ctx.lineWidth = 1.5 + Math.random() * 1.5;
      ctx.beginPath();
      ctx.moveTo(x, h);
      ctx.quadraticCurveTo(x + (Math.random() - 0.5) * 20, h * 0.5, x + (Math.random() - 0.5) * 40, h * (0.05 + Math.random() * 0.4));
      ctx.stroke();
    }
  });
  tuftTex.wrapS = tuftTex.wrapT = THREE.ClampToEdgeWrapping;
  MATS.foliage = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.88, map: leafTex });
  MATS.bark = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.95, map: barkTex });
  MATS.grass = new THREE.MeshStandardMaterial({ vertexColors: true, map: tuftTex, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 });
  MATS.galv = trackEnv(new THREE.MeshStandardMaterial({ vertexColors: true, metalness: 0.7, roughness: 0.38, envMap: env, envMapIntensity: 0.5 }));
  MATS.reflector = registerNight(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffc060, emissiveIntensity: 0.1 }), 'emissiveIntensity', 0.1, 2.2);
  MATS.field = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  MATS.glass = trackEnv(night(new THREE.MeshStandardMaterial({
    color: 0x5b7fa6, metalness: 0.7, roughness: 0.12, envMap: env, envMapIntensity: 0.9,
    emissive: 0xbfdcff, emissiveIntensity: 0,
  }), 'emissiveIntensity', 0, 0.45));
  MATS.water = trackEnv(new THREE.MeshStandardMaterial({ color: 0x2e6f8e, metalness: 0.4, roughness: 0.12, envMap: env, envMapIntensity: 0.8 }));
  MATS.lamp = night(new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xffd28a, emissiveIntensity: 0.05 }), 'emissiveIntensity', 0.05, 4);
  MATS.canopyLight = night(new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.1 }), 'emissiveIntensity', 0.1, 3);
  MATS.redLight = night(new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff1010, emissiveIntensity: 0.5 }), 'emissiveIntensity', 0.5, 4);
  MATS.stringLights = night(new THREE.MeshStandardMaterial({ color: 0xffe08a, emissive: 0xffc040, emissiveIntensity: 0.1 }), 'emissiveIntensity', 0.1, 4);
  MATS.pool = night(new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xffb060, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false,
  }), 'opacity', 0, 0.42);
  MATS.lampGlow = night(new THREE.MeshBasicMaterial({
    map: getGlowTexture(), color: 0xffcf80, transparent: true, opacity: 0,
    blending: THREE.AdditiveBlending, depthWrite: false, fog: false, toneMapped: false,
  }), 'opacity', 0, 0.9);
  for (const kind of ['apartment', 'office', 'shop', 'house']) {
    for (let v = 0; v < 2; v++) {
      const { map, emissiveMap } = makeFacade(kind);
      MATS[`fac_${kind}_${v}`] = night(new THREE.MeshStandardMaterial({
        vertexColors: true, map, emissiveMap, emissive: 0xffffff, emissiveIntensity: 0, roughness: 0.8,
      }), 'emissiveIntensity', 0, 0.85);
    }
  }
  ADS.forEach((ad, i) => {
    const tex = makeAdTexture(ad);
    MATS[`ad${i}`] = night(new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.25, roughness: 0.6,
    }), 'emissiveIntensity', 0.25, 1.1);
  });
}

/** A lit sign material for `text` (cached). */
function signMat(key, opts) {
  const k = `sign:${key}`;
  if (!MATS[k]) {
    const tex = makeSign(opts);
    MATS[k] = registerNight(new THREE.MeshStandardMaterial({
      map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.15, roughness: 0.55,
    }), 'emissiveIntensity', 0.15, 1.2);
  }
  return k;
}

// ---------- Geometry helpers ----------
function box(b, key, w, h, d, x, y, z, color = 0xffffff, rot) {
  b.add(key, new THREE.BoxGeometry(w, h, d), { pos: [x, y + h / 2, z], color, rot });
}
function facadeBox(b, key, w, h, d, x, y, z, color) {
  b.add(key, scaleBoxUVs(new THREE.BoxGeometry(w, h, d), w, h, d, 12), { pos: [x, y + h / 2, z], color });
}
function cyl(b, key, r, h, x, y, z, color = 0xffffff, seg = 12, r2 = r) {
  b.add(key, new THREE.CylinderGeometry(r, r2, h, seg), { pos: [x, y + h / 2, z], color });
}
function prism(b, key, w, h, d, x, y, z, color) {
  // triangular roof: w along x, ridge along z
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, 0);
  shape.lineTo(w / 2, 0);
  shape.lineTo(0, h);
  shape.closePath();
  const geo = new THREE.ExtrudeGeometry(shape, { depth: d, bevelEnabled: false });
  geo.translate(0, 0, -d / 2);
  b.add(key, geo, { pos: [x, y, z], color });
}
/** Sign plane: facing 'front' (towards the road) or 'driver' (+z). */
function sign(b, s, key, w, h, x, y, z, facing = 'front') {
  const rot = facing === 'front' ? [0, s === -1 ? Math.PI / 2 : -Math.PI / 2, 0] : [0, 0, 0];
  b.add(key, new THREE.PlaneGeometry(w, h), { pos: [x, y, z], rot });
}

const WALLS = [0xf1e3c8, 0xf7d9b5, 0xe8eef2, 0xf3e6a0, 0xdfe9d2, 0xf5cfc0, 0xffffff, 0xd8d2c4];
const BRIGHT = [0x3f7fd9, 0xe0588f, 0x52b788, 0xf4a261, 0x9b5de5, 0x2ec4b6, 0xf9c74f];
const fac = (kind) => `fac_${kind}_${randInt(0, 1)}`;

// ---------- Building templates ----------
// Each returns { F: frontage along z, D: depth along x, petrol?, lamps? }
const T = {
  apartment(b, s) {
    const F = rand(14, 19);
    const D = rand(11, 14);
    const floors = randInt(5, 13);
    const H = floors * 3;
    const tint = pick(WALLS);
    facadeBox(b, fac('apartment'), D, H, F, 0, 0, 0, tint);
    for (let f = 1; f < floors; f++) {
      for (const k of [-0.25, 0.25]) {
        box(b, 'solid', 1.2, 0.18, F * 0.32, -s * (D / 2 + 0.6), f * 3 - 0.1, k * F, 0xd6d0c4);
        box(b, 'metal', 0.06, 0.95, F * 0.32, -s * (D / 2 + 1.17), f * 3 + 0.08, k * F, 0x80868f);
      }
    }
    box(b, 'solid', D, 0.6, F, 0, H, 0, 0xcfc8ba);
    for (const z of [-F / 4, F / 4]) cyl(b, 'solid', 0.75, 1.3, s * D / 4, H + 0.6, z, 0x1d1f22); // water tanks
    return { F, D };
  },

  office(b, s) {
    const F = rand(15, 20);
    const D = rand(14, 18);
    const H = randInt(10, 22) * 3.4;
    facadeBox(b, fac('office'), D, H, F, 0, 0, 0, pick([0xffffff, 0xdfe8f0, 0xe8e4dc]));
    box(b, 'solid', D + 0.6, 1.2, F + 0.6, 0, H, 0, 0x9aa3ad);
    box(b, 'solid', D * 0.4, 3, F * 0.4, 0, H + 1.2, 0, 0x8a929c);
    cyl(b, 'metal', 0.08, 5, 0, H + 4.2, 0, 0x888888, 6);
    box(b, 'redLight', 0.35, 0.35, 0.35, 0, H + 9.2, 0);
    const name = pick(['INFOTECH PARK', 'SKYLINE CORP', 'NOVA TOWERS', 'ORBIT IT CITY']);
    sign(b, s, signMat(name, { text: name, bg: '#0a2540', fg: '#ffffff', w: 512, h: 96 }), F * 0.8, 2.4, -s * (D / 2 + 0.05), H - 2, 0);
    sign(b, s, signMat(name, { text: name, bg: '#0a2540', fg: '#ffffff', w: 512, h: 96 }), D * 0.85, 2.2, 0, H + 2.8, F * 0.2 + 0.05, 'driver');
    return { F, D };
  },

  mall(b, s) {
    const F = 36;
    const D = 24;
    const H = 16;
    const name = pick(['GALAXY MALL', 'ORION SQUARE MALL', 'CITY CENTRE MALL']);
    facadeBox(b, fac('shop'), D, H, F, 0, 0, 0, pick([0xf2efe9, 0xe9e2f2, 0xf2e9df]));
    box(b, 'glass', 0.4, H - 3, F * 0.7, -s * (D / 2 + 0.2), 2.5, 0); // glass curtain wall
    box(b, 'solid', 4, 0.5, 12, -s * (D / 2 + 2), 4, 0, 0xffffff); // entrance canopy
    box(b, 'canopyLight', 3.6, 0.05, 11.5, -s * (D / 2 + 2), 3.95, 0);
    sign(b, s, signMat(name, { text: name, bg: '#1b0b3a', fg: '#ffd84a', w: 1024, h: 160 }), F * 0.6, 3.2, -s * (D / 2 + 0.45), H - 2, 0);
    sign(b, s, signMat(name, { text: name, bg: '#1b0b3a', fg: '#ffd84a', w: 1024, h: 160 }), D * 0.9, 3.6, 0, H + 2.4, F / 2 + 0.05, 'driver');
    box(b, 'solid', D * 0.92, 4.4, 0.3, 0, H, F / 2 - 0.2, 0x2a2a35);
    const ad = `ad${randInt(0, ADS.length - 1)}`;
    sign(b, s, ad, 9, 4, -s * (D / 2 + 0.45), 7, F * 0.38);
    // parking lot with a few parked cars
    box(b, 'solid', 9, 0.04, F, -s * (D / 2 + 6), 0.02, 0, 0x3a3b40);
    for (let i = 0; i < 6; i++) {
      const z = -F / 2 + 4 + i * 5.6;
      box(b, 'solid', 0.12, 0.05, 2.4, -s * (D / 2 + 6), 0.05, z + 2.8, 0xffffff);
      if (Math.random() < 0.7) {
        const c = pick([0xd9dde4, 0x3a4150, 0xa31d2b, 0x1f4fa8, 0xececec, 0x20232a]);
        box(b, 'solid', 4.2, 0.8, 1.8, -s * (D / 2 + 6), 0.3, z, c);
        box(b, 'solid', 2.2, 0.6, 1.6, -s * (D / 2 + 6), 1.1, z, 0x1b2430);
      }
    }
    return { F, D: D + 12 };
  },

  hospital(b, s) {
    const F = rand(22, 28);
    const D = 16;
    const floors = randInt(4, 6);
    const H = floors * 3.4;
    const big = Math.random() < 0.5;
    const name = big ? 'MULTISPECIALITY HOSPITAL' : 'CITY HOSPITAL';
    facadeBox(b, fac('apartment'), D, H, F, 0, 0, 0, 0xf7f9fb);
    box(b, 'glass', 0.3, H - 1, 4, -s * (D / 2 + 0.1), 0.5, 0);
    box(b, 'solid', D + 0.4, 0.8, F + 0.4, 0, H, 0, 0x2f7fd0);
    const crossKey = signMat('cross', { text: '', bg: '#ffffff', icon: 'cross', w: 128, h: 128 });
    sign(b, s, crossKey, 4, 4, -s * (D / 2 + 0.2), H - 3, F * 0.3);
    sign(b, s, signMat(name, { text: name, bg: '#ffffff', fg: '#0b4fa8', w: 1024, h: 128, icon: 'cross', border: '#0b4fa8' }), F * 0.85, 2.4, 0, H + 1.9, F / 2 + 0.2, 'driver');
    box(b, 'solid', D * 0.9, 2.6, 0.3, 0, H + 0.6, F / 2 + 0.05, 0xffffff);
    sign(b, s, signMat(name, { text: name, bg: '#ffffff', fg: '#0b4fa8', w: 1024, h: 128, icon: 'cross' }), F * 0.7, 2, -s * (D / 2 + 0.2), H - 0.6, -F * 0.05);
    // emergency entrance
    box(b, 'solid', 3.6, 0.4, 7, -s * (D / 2 + 1.8), 3.4, -F * 0.25, 0xffffff);
    box(b, 'canopyLight', 3.4, 0.05, 6.6, -s * (D / 2 + 1.8), 3.35, -F * 0.25);
    sign(b, s, signMat('EMERGENCY', { text: 'EMERGENCY', bg: '#d0101f', fg: '#ffffff', w: 512, h: 112 }), 5.5, 1.2, -s * (D / 2 + 3.65), 4.3, -F * 0.25);
    sign(b, s, signMat('24/7', { text: '24/7 MEDICAL SERVICES', bg: '#0b4fa8', fg: '#ffffff', w: 768, h: 112 }), 7, 1.1, -s * (D / 2 + 0.2), 2.2, F * 0.3);
    return { F, D: D + 4 };
  },

  hotel(b, s) {
    const F = rand(16, 20);
    const D = 15;
    const H = randInt(7, 11) * 3.2;
    const name = pick(['HOTEL SKYLINE', 'THE GRAND PALACE', 'HOTEL ROYAL INN']);
    facadeBox(b, fac('apartment'), D, H, F, 0, 0, 0, pick([0xf3dcc0, 0xe7d2b8, 0xf0e4d2]));
    box(b, 'solid', D + 0.4, 0.8, F + 0.4, 0, H, 0, 0x7a4b2a);
    box(b, 'solid', 4, 0.4, 9, -s * (D / 2 + 2), 3.6, 0, 0x7a4b2a);
    box(b, 'canopyLight', 3.8, 0.05, 8.6, -s * (D / 2 + 2), 3.55, 0);
    sign(b, s, signMat(name, { text: name, sub: '★ ★ ★ ★', bg: '#2b1405', fg: '#ffd27a', w: 768, h: 192 }), D * 0.95, 3.4, 0, H + 2.5, F / 2 + 0.05, 'driver');
    box(b, 'solid', D * 0.9, 3.6, 0.3, 0, H + 0.6, F / 2 - 0.2, 0x2b1405);
    return { F, D: D + 4 };
  },

  cinema(b, s) {
    const F = 26;
    const D = 22;
    const H = 14;
    facadeBox(b, fac('shop'), D, H, F, 0, 0, 0, 0x3a2a4a);
    sign(b, s, 'ad5', F * 0.55, 8, -s * (D / 2 + 0.1), 5.5, -F * 0.12);
    sign(b, s, signMat('RAJ CINEMA', { text: 'RAJ CINEMA', sub: 'NOW SHOWING • 4 SCREENS', bg: '#120018', fg: '#ff4fd8', w: 1024, h: 220 }), F * 0.8, 3.6, 0, H + 2.2, F / 2 + 0.05, 'driver');
    box(b, 'solid', D * 0.9, 4.2, 0.3, 0, H + 0.1, F / 2 - 0.2, 0x120018);
    box(b, 'stringLights', 0.2, 0.2, F * 0.9, -s * (D / 2 + 0.2), H - 0.5, 0);
    return { F, D };
  },

  shops(b, s) {
    const F = rand(24, 32);
    const D = 10;
    const H = randInt(2, 3) * 3.3;
    facadeBox(b, fac('shop'), D, H, F, 0, 0, 0, pick(WALLS));
    const names = ['SHARMA SWEETS', 'MOBILE ZONE', 'MEDICAL STORE', 'KUMAR KIRANA', 'AUTO PARTS', 'CHAI CORNER', 'NEW FASHION', 'HARDWARE'];
    const n = 4;
    for (let i = 0; i < n; i++) {
      const text = pick(names);
      const bg = ['#c1121f', '#1d3557', '#2a9d8f', '#e76f51', '#6a4c93', '#e9c46a'][randInt(0, 5)];
      sign(b, s, signMat(`${text}:${bg}`, { text, bg, fg: '#ffffff', w: 512, h: 112 }), F / n - 0.6, 1.1, -s * (D / 2 + 0.06), 3.2, -F / 2 + (i + 0.5) * (F / n));
    }
    box(b, 'solid', 1.6, 0.12, F, -s * (D / 2 + 0.8), 2.9, 0, 0x6c757d); // awning
    return { F, D };
  },

  townHouse(b, s) {
    const F = rand(9, 13);
    const D = rand(9, 11);
    const H = randInt(2, 3) * 3.1;
    facadeBox(b, fac('house'), D, H, F, 0, 0, 0, pick(WALLS.concat(BRIGHT)));
    box(b, 'solid', D, 0.5, F, 0, H, 0, 0xd0cbc0);
    cyl(b, 'solid', 0.6, 1.1, 0, H + 0.5, 0, 0x1d1f22);
    return { F, D };
  },

  school(b, s) {
    const F = 32;
    const D = 12;
    const H = 3 * 3.3;
    const college = Math.random() < 0.3;
    const name = college ? 'GOVT. ENGINEERING COLLEGE' : 'SARASWATI PUBLIC SCHOOL';
    facadeBox(b, fac('house'), D, H, F, 0, 0, 0, 0xf3e3b8);
    for (let f = 1; f <= 3; f++) box(b, 'solid', D + 0.2, 0.3, F + 0.2, 0, f * 3.3 - 0.3, 0, 0x8a2c1c);
    sign(b, s, signMat(name, { text: name, bg: '#8a2c1c', fg: '#ffffff', w: 1024, h: 128 }), F * 0.75, 1.8, -s * (D / 2 + 0.06), H - 1.2, 0);
    // boundary wall with gate and flag pole
    box(b, 'solid', 0.3, 1.6, F + 6, -s * (D / 2 + 6), 0, 0, 0xe8d8b0);
    cyl(b, 'metal', 0.06, 8, -s * (D / 2 + 3), 0, F * 0.3, 0xcccccc, 6);
    box(b, 'solid', 0.02, 0.4, 1.8, -s * (D / 2 + 3), 7.2, F * 0.3 + 0.9, 0xff9933);
    box(b, 'solid', 0.02, 0.4, 1.8, -s * (D / 2 + 3), 6.8, F * 0.3 + 0.9, 0xffffff);
    box(b, 'solid', 0.02, 0.4, 1.8, -s * (D / 2 + 3), 6.4, F * 0.3 + 0.9, 0x138808);
    sign(b, s, signMat(name, { text: name, bg: '#8a2c1c', fg: '#ffffff', w: 1024, h: 128 }), 9, 1.3, -s * (D / 2 + 6.2), 2.0, -F * 0.3);
    return { F, D: D + 6 };
  },

  bank(b, s) {
    const F = 12;
    const D = 10;
    const H = 7;
    facadeBox(b, fac('office'), D, H, F, 0, 0, 0, 0xffffff);
    box(b, 'solid', D + 0.3, 0.6, F + 0.3, 0, H, 0, 0x0b3d91);
    sign(b, s, signMat('CITIZEN BANK', { text: 'CITIZEN BANK', bg: '#0b3d91', fg: '#ffffff', w: 768, h: 128 }), F * 0.9, 1.6, -s * (D / 2 + 0.06), H - 1.3, 0);
    sign(b, s, signMat('ATM', { text: 'ATM 24x7', bg: '#ffd21a', fg: '#0b3d91', w: 256, h: 112 }), 2.2, 1, -s * (D / 2 + 0.06), 2.6, F * 0.3);
    return { F, D };
  },

  restaurant(b, s) {
    const F = 16;
    const D = 11;
    const H = 4.2;
    const name = pick(['SPICE GARDEN RESTAURANT', 'ANNAPURNA FAMILY RESTAURANT', 'HIGHWAY KING FOODS']);
    facadeBox(b, fac('shop'), D, H, F, 0, 0, 0, pick([0xf4a261, 0xe9c46a, 0xffffff]));
    box(b, 'solid', D + 1, 0.4, F + 1, 0, H, 0, 0x6b2d0f);
    sign(b, s, signMat(name, { text: name, bg: '#6b2d0f', fg: '#ffd27a', w: 1024, h: 128 }), F * 0.9, 1.4, -s * (D / 2 + 0.55), H - 0.9, 0);
    box(b, 'stringLights', 0.15, 0.15, F, -s * (D / 2 + 0.55), H + 0.3, 0);
    return { F, D };
  },

  dhaba(b, s) {
    const F = 16;
    const D = 9;
    const name = pick(['SHER-E-PUNJAB DHABA', 'HIGHWAY DHABA • PURE VEG', 'APNA DHABA 24 HRS']);
    box(b, 'solid', D, 3.4, F, s * 1.5, 0, 0, pick([0xf2c14e, 0xe76f51, 0xf4f1de]));
    box(b, 'solid', D + 4, 0.15, F + 1, 0, 3.6, 0, 0x8d99ae, [0, 0, s * 0.06]); // tin roof over the open front
    for (const z of [-F / 2 + 0.3, 0, F / 2 - 0.3]) cyl(b, 'metal', 0.08, 3.6, -s * (D / 2 + 1.6), 0, z, 0x666666, 6);
    for (let i = 0; i < 4; i++) {
      // charpais (string cots) and tables
      box(b, 'solid', 1.0, 0.45, 1.9, -s * (D / 2 + 0.2), 0, -F / 2 + 2.5 + i * 3.6, 0xa47148);
    }
    box(b, 'stringLights', 0.12, 0.12, F, -s * (D / 2 + 1.9), 3.45, 0);
    sign(b, s, signMat(name, { text: name, bg: '#b5001f', fg: '#ffe066', w: 1024, h: 128 }), F * 0.95, 1.6, -s * (D / 2 + 2.08), 4.3, 0);
    // tall pole sign for drivers
    cyl(b, 'metal', 0.12, 7, -s * (D / 2 + 3.5), 0, F / 2 - 1, 0x555555, 6);
    sign(b, s, signMat(`${name}:pole`, { text: 'DHABA', sub: 'TEA • FOOD • PARKING', bg: '#b5001f', fg: '#ffe066', w: 512, h: 256 }), 4, 2, -s * (D / 2 + 3.5), 7.2, F / 2 - 0.85, 'driver');
    box(b, 'solid', 2.5, 2.6, 7.5, -s * (D / 2 + 6), 0.4, -F / 4, 0xff8f1f); // parked truck
    return { F, D: D + 6 };
  },

  petrolPump(b, s) {
    const F = 20;
    const D = 18;
    // canopy on pillars
    box(b, 'solid', 9, 0.9, 16, -s * 2, 5.2, 0, 0xffffff);
    box(b, 'solid', 9.1, 0.4, 16.1, -s * 2, 5.7, 0, 0x0b7a3b);
    box(b, 'canopyLight', 8.6, 0.05, 15.6, -s * 2, 5.15, 0);
    for (const x of [-3, 3]) for (const z of [-5, 5]) box(b, 'solid', 0.5, 5.2, 0.5, -s * 2 + x, 0, z, 0xe9ecef);
    for (const z of [-4.5, 0, 4.5]) {
      box(b, 'solid', 0.8, 1.7, 1.1, -s * 2, 0, z, 0xffffff);
      box(b, 'solid', 0.82, 0.4, 1.12, -s * 2, 1.3, z, 0x0b7a3b);
    }
    box(b, 'solid', 7, 3.6, 10, s * 6, 0, 0, 0xf8f9fa); // kiosk
    sign(b, s, signMat('SURYA FUELS', { text: 'SURYA FUELS', bg: '#0b7a3b', fg: '#ffd21a', w: 512, h: 112 }), 8, 1.6, -s * 6.55, 5.6, 0);
    // tall price sign facing drivers
    cyl(b, 'metal', 0.2, 8, -s * 8, 0, F / 2 - 1, 0x666666, 8);
    sign(b, s, signMat('SURYA PRICES', { text: 'SURYA FUELS', sub: 'PETROL 96.72  •  DIESEL 89.62', bg: '#0b7a3b', fg: '#ffd21a', subColor: '#ffffff', w: 512, h: 256 }), 4.2, 2.6, -s * 8, 8, F / 2 - 0.75, 'driver');
    box(b, 'solid', 12, 0.03, F, -s * 3, 0.01, 0, 0x45464c); // forecourt
    return { F, D: 14, petrol: true };
  },

  factory(b, s) {
    const F = rand(32, 40);
    const D = rand(22, 28);
    const H = rand(8, 11);
    const c = pick([0x9aa6b2, 0xb8b0a0, 0x8d99ae]);
    box(b, 'solid', D, H, F, 0, 0, 0, c);
    const teeth = 4;
    for (let i = 0; i < teeth; i++) prism(b, 'solid', D / teeth, 3, F, -D / 2 + (i + 0.5) * (D / teeth), H, 0, 0x6c7a89);
    for (const z of [-F / 3, F / 6]) {
      cyl(b, 'solid', 1, 22, s * D / 4, 0, z, 0xb0a99f, 12, 1.4);
      cyl(b, 'solid', 1.02, 2, s * D / 4, 18, z, 0xd62828, 12);
      box(b, 'redLight', 0.4, 0.4, 0.4, s * D / 4, 22.2, z);
    }
    const name = pick(['ACME STEEL WORKS', 'SURYA CEMENT LTD.', 'BHARAT TEXTILES']);
    sign(b, s, signMat(name, { text: name, bg: '#1d3557', fg: '#ffffff', w: 1024, h: 128 }), F * 0.6, 2.2, -s * (D / 2 + 0.06), H - 1.6, 0);
    box(b, 'metal', 0.1, 2.2, F + 8, -s * (D / 2 + 5), 0, 0, 0x7a7a7a); // fence
    return { F, D: D + 5 };
  },

  warehouse(b, s) {
    const F = rand(30, 38);
    const D = rand(18, 22);
    const H = rand(8, 10);
    box(b, 'solid', D, H, F, 0, 0, 0, pick([0x5c7a99, 0x8a9ba8, 0xa3b18a]));
    prism(b, 'solid', D, 2.2, F, 0, H, 0, 0x6b705c);
    for (let i = -1; i <= 1; i++) box(b, 'solid', 0.1, 5, 4.5, -s * (D / 2 + 0.05), 0, i * F / 3.5, 0x343a40);
    const name = pick(['SWIFT LOGISTICS PARK', 'NATIONAL COLD STORAGE', 'MEGA WAREHOUSING']);
    sign(b, s, signMat(name, { text: name, bg: '#ffffff', fg: '#c1121f', w: 1024, h: 128 }), F * 0.6, 1.8, -s * (D / 2 + 0.06), H - 1.3, 0);
    return { F, D };
  },

  waterTower(b, s) {
    for (const x of [-1.6, 1.6]) for (const z of [-1.6, 1.6]) cyl(b, 'metal', 0.18, 14, x, 0, z, 0x8d99ae, 6);
    cyl(b, 'solid', 3.6, 5, 0, 14, 0, 0xdedede, 16);
    prism(b, 'solid', 7.2, 1.5, 0.1, 0, 19, 0, 0xdedede);
    return { F: 10, D: 8 };
  },

  telecom(b, s) {
    const H = 34;
    for (const x of [-1, 1]) {
      for (const z of [-1, 1]) {
        b.add('metal', new THREE.CylinderGeometry(0.08, 0.12, H, 5), {
          pos: [x * 0.9, H / 2, z * 0.9], rot: [z * -0.04, 0, x * 0.04], color: 0xb0b6bd,
        });
      }
    }
    for (let y = 3; y < H - 2; y += 4) {
      const w = 2 * (1 - y / H) + 0.6;
      box(b, 'metal', w, 0.08, 0.08, 0, y, w / 2, 0xb0b6bd);
      box(b, 'metal', w, 0.08, 0.08, 0, y, -w / 2, 0xb0b6bd);
      box(b, 'metal', 0.08, 0.08, w, w / 2, y, 0, 0xb0b6bd);
      box(b, 'metal', 0.08, 0.08, w, -w / 2, y, 0, 0xb0b6bd);
    }
    for (let i = 0; i < 3; i++) box(b, 'solid', 0.3, 1.6, 0.5, Math.cos(i * 2.1) * 0.7, H - 4, Math.sin(i * 2.1) * 0.7, 0xf8f9fa);
    box(b, 'redLight', 0.4, 0.4, 0.4, 0, H, 0);
    return { F: 8, D: 6 };
  },

  village(b, s) {
    const n = randInt(2, 4);
    let z = -9;
    for (let i = 0; i < n; i++) {
      const w = rand(4.5, 6.5);
      const d = rand(4.5, 6);
      const h = rand(2.6, 3.2);
      const x = rand(-3, 3);
      box(b, 'solid', w, h, d, x, 0, z, pick([0x4a7bd1, 0xe58fb2, 0x9fd8c2, 0xe9c46a, 0xf1e3c8, 0xd9a066]));
      if (Math.random() < 0.55) prism(b, 'solid', w + 0.8, 1.6, d + 0.6, x, h, z, 0x8b4a2b);
      else box(b, 'solid', w + 0.2, 0.4, d + 0.2, x, h, z, 0xd8d2c4);
      box(b, 'solid', 0.06, 1.8, 0.9, x - s * (w / 2 + 0.01), 0, z, 0x5c3a1e); // door
      z += d + rand(1.5, 3);
    }
    b.add('solid', new THREE.ConeGeometry(1.4, 2.6, 8), { pos: [s * 4, 1.3, 7], color: 0xd4a72c }); // haystack
    box(b, 'solid', 1.0, 0.45, 1.9, -s * 4, 0, 4, 0xa47148); // charpai
    return { F: 22, D: 10 };
  },

  fields(b, s) {
    // patchwork of crops: wheat, mustard (yellow), rice paddies
    const crops = [0x7fae3c, 0xe0c84a, 0x5f9d36, 0x9cc25a, 0xc9b458, 0x4e8a3a];
    for (let i = 0; i < 2; i++) {
      for (let j = 0; j < 2; j++) {
        b.add('field', new THREE.PlaneGeometry(rand(15, 19), 19), {
          pos: [s * (i * 19 - 9), 0.04, j * 20 - 10], rot: [-Math.PI / 2, 0, 0], color: pick(crops),
        });
      }
    }
    for (let i = 0; i < 5; i++) {
      b.add('foliage', new THREE.IcosahedronGeometry(rand(1, 1.6), 0), {
        pos: [s * rand(-18, 18), 0.8, rand(-19, 19)], color: pick([0x3d6b2f, 0x4c7a34]),
      });
    }
    return { F: 40, D: 38 };
  },

  teaStall(b, s) {
    // tin-roofed chai stall with benches and plastic chairs
    for (const x of [-1.8, 1.8]) for (const z of [-2.5, 2.5]) b.add('solid', new THREE.CylinderGeometry(0.05, 0.05, 2.6, 6), { pos: [x, 1.3, z], color: 0xa8864a });
    box(b, 'solid', 4.2, 0.06, 5.8, 0, 2.6, 0, pick([0x2a6fb0, 0x3a8a4a, 0xb03a2a]), [0, 0, s * 0.12]);
    box(b, 'solid', 1.0, 1.0, 3.2, s * 1.2, 0, 0, 0x8a5a30); // counter
    cyl(b, 'metal', 0.18, 0.3, s * 1.2, 1.0, 0.6, 0xc8c8c8, 10); // kettle
    box(b, 'solid', 0.5, 0.45, 2.4, -s * 1.2, 0, 0, 0x6b4a2a); // bench
    for (let i = 0; i < 3; i++) box(b, 'solid', 0.45, 0.45, 0.45, -s * rand(-0.5, 2.5), 0, rand(-2, 2), 0xd62828);
    sign(b, s, signMat('CHAI', { text: 'CHAI • SNACKS', sub: 'GARAM CHAI ₹10', bg: '#ffd21a', fg: '#7a1d00', w: 512, h: 192 }), 3.4, 1.2, -s * 2.15, 3.2, 0);
    return { F: 8, D: 5 };
  },

  punctureShop(b, s) {
    box(b, 'solid', 3.5, 2.6, 4.5, s * 0.6, 0, 0, 0xb5651d);
    box(b, 'solid', 4.4, 0.08, 5, 0, 2.7, 0, 0x8d99ae, [0, 0, s * 0.1]);
    for (let i = 0; i < 5; i++) {
      b.add('solid', new THREE.TorusGeometry(0.32, 0.13, 8, 16), { pos: [-s * 1.7, 0.13 + i * 0.26, 1.2], rot: [Math.PI / 2, 0, 0], color: 0x1a1a1c });
    }
    b.add('solid', new THREE.TorusGeometry(0.35, 0.13, 8, 16), { pos: [-s * 1.35, 2.2, -1.6], rot: [0, Math.PI / 2, 0], color: 0x1a1a1c }); // hanging tyre sign
    box(b, 'solid', 0.6, 0.8, 0.6, -s * 1.2, 0, -1.0, 0xd62828); // air compressor
    sign(b, s, signMat('PUNCTURE', { text: 'PUNCTURE', sub: 'TYRE REPAIR • AIR', bg: '#111111', fg: '#ffd21a', w: 512, h: 192 }), 3.2, 1.1, -s * 1.2, 3.25, 0, 'front');
    cyl(b, 'metal', 0.05, 3, -s * 2.4, 0, 2.3, 0x666666, 6);
    sign(b, s, signMat('PUNCTURE2', { text: 'PUNCTURE', bg: '#ffd21a', fg: '#111111', w: 512, h: 128 }), 2.2, 0.6, -s * 2.4, 3.1, 2.32, 'driver');
    return { F: 7, D: 5 };
  },

  fruitStall(b, s) {
    box(b, 'solid', 1.6, 0.9, 2.6, 0, 0.3, 0, 0x7a4a26); // cart
    for (const z of [-0.9, 0.9]) b.add('solid', new THREE.TorusGeometry(0.3, 0.05, 6, 14), { pos: [0, 0.3, z], rot: [0, Math.PI / 2, 0], color: 0x2a2a2a });
    const fruit = [0xff8c00, 0xd62828, 0xffd21a, 0x6aa84f, 0x9b2d6f];
    for (let i = 0; i < 4; i++) {
      for (let k = 0; k < 7; k++) {
        b.add('solid', new THREE.IcosahedronGeometry(0.12, 0), {
          pos: [rand(-0.6, 0.6), 1.3, -1.05 + i * 0.7 + rand(-0.2, 0.2)], color: fruit[i % fruit.length],
        });
      }
    }
    cyl(b, 'metal', 0.03, 2.4, 0, 1.2, 0, 0x444444, 6);
    b.add('solid', new THREE.ConeGeometry(1.7, 0.6, 12), { pos: [0, 3.6, 0], color: pick([0xe63946, 0x1d3557, 0xffb703]) });
    return { F: 6, D: 4 };
  },

  huts(b, s) {
    // mud huts with thatched roofs and a cattle shelter
    const n = randInt(2, 3);
    for (let i = 0; i < n; i++) {
      const z = -6 + i * 6 + rand(-1, 1);
      const x = rand(-2, 2);
      const r = rand(1.8, 2.4);
      cyl(b, 'solid', r, 2.2, x, 0, z, pick([0xb5774a, 0xc98a55, 0xd9a066]), 14);
      b.add('solid', new THREE.ConeGeometry(r + 0.5, 2.0, 14), { pos: [x, 3.2, z], color: 0xb89b5e });
      box(b, 'solid', 0.06, 1.6, 0.8, x - s * (r + 0.01), 0, z, 0x3a2a1a);
    }
    for (const z of [6, 9]) for (const x of [-1.5, 1.5]) b.add('solid', new THREE.CylinderGeometry(0.07, 0.07, 2.2, 6), { pos: [s * 4 + x, 1.1, z], color: 0x8a6a40 });
    box(b, 'solid', 3.6, 0.1, 4, s * 4, 2.2, 7.5, 0xa89060);
    b.add('solid', new THREE.ConeGeometry(1.3, 2.4, 10), { pos: [-s * 3, 1.2, 8], color: 0xd4a72c });
    return { F: 22, D: 10 };
  },

  none() {
    return { F: rand(10, 20), D: 0 };
  },
};

// ---------- Roadside props ----------

const hash3 = (x, y, z) => {
  const h = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453;
  return h - Math.floor(h);
};

/**
 * A lumpy, smooth-shaded canopy blob with a colour gradient
 * (darker underneath, sunlit on top) baked into its vertices.
 */
function canopy(radius, detail, top, bottom, squash = 0.85) {
  let g = new THREE.IcosahedronGeometry(radius, detail);
  g.deleteAttribute('normal');
  g = mergeVertices(g);
  const pos = g.attributes.position;
  const v = new THREE.Vector3();
  const cTop = new THREE.Color(top);
  const cBot = new THREE.Color(bottom);
  const col = new THREE.Color();
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const n = hash3(Math.round(v.x * 50), Math.round(v.y * 50), Math.round(v.z * 50));
    v.multiplyScalar(1 + (n - 0.5) * 0.38);
    v.y *= squash;
    pos.setXYZ(i, v.x, v.y, v.z);
    const t = Math.min(1, Math.max(0, (v.y / (radius * squash) + 1) / 2));
    col.copy(cBot).lerp(cTop, t).multiplyScalar(0.85 + n * 0.3);
    colors.set([col.r, col.g, col.b], i * 3);
  }
  g.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  g.computeVertexNormals();
  return g;
}

const GREENS = [
  [0x6f9a3c, 0x23421a], // neem
  [0x5c8a34, 0x1d3a17], // mango (dark & dense)
  [0x7ea347, 0x2c4a1e], // light green
  [0x8a9a48, 0x3a4a22], // dusty dry-season green
];

function trunk(b, x, z, h, r, color = 0x5a4232, lean = 0) {
  b.add('bark', new THREE.CylinderGeometry(r * 0.7, r, h, 8), { pos: [x, h / 2, z], rot: [0, 0, lean], color });
}

function tree(b, x, z, kind, k) {
  const [top, bottom] = pick(GREENS);
  switch (kind) {
    case 'neem': {
      trunk(b, x, z, 2.6 * k, 0.24 * k);
      for (const [dx, dz, a] of [[0.6, 0.3, 0.6], [-0.5, -0.4, -0.7]]) {
        b.add('bark', new THREE.CylinderGeometry(0.06 * k, 0.11 * k, 1.6 * k, 6), {
          pos: [x + dx * k, 2.8 * k, z + dz * k], rot: [dz * 0.6, 0, a], color: 0x5a4232,
        });
      }
      const blobs = randInt(3, 5);
      for (let i = 0; i < blobs; i++) {
        const a = (i / blobs) * Math.PI * 2 + Math.random();
        const r = rand(1.2, 1.8) * k;
        b.add('foliage', canopy(r, 1, top, bottom), { pos: [x + Math.cos(a) * 1.1 * k, rand(3.3, 4.3) * k, z + Math.sin(a) * 1.1 * k] });
      }
      b.add('foliage', canopy(1.7 * k, 1, top, bottom), { pos: [x, 4.6 * k, z] });
      break;
    }
    case 'mango': {
      trunk(b, x, z, 1.8 * k, 0.3 * k);
      b.add('foliage', canopy(2.6 * k, 2, top, bottom, 0.75), { pos: [x, 3.6 * k, z] });
      b.add('foliage', canopy(1.6 * k, 1, top, bottom), { pos: [x + 1.4 * k, 3.2 * k, z + 0.6 * k] });
      break;
    }
    case 'eucalyptus': {
      trunk(b, x, z, 8 * k, 0.18 * k, 0xcfc6b4, rand(-0.06, 0.06));
      for (let i = 0; i < 3; i++) {
        b.add('foliage', canopy(rand(0.8, 1.2) * k, 1, 0x8fa66a, 0x3d5530, 1.3), { pos: [x + rand(-0.6, 0.6) * k, (6.5 + i * 1.3) * k, z + rand(-0.5, 0.5) * k] });
      }
      break;
    }
    case 'ashoka': {
      trunk(b, x, z, 1.2 * k, 0.14 * k);
      b.add('foliage', canopy(0.9 * k, 1, 0x4f7a2c, 0x1d3313, 3.2), { pos: [x, 3.8 * k, z] });
      break;
    }
    case 'palm': {
      // curved trunk from stacked segments, drooping fronds
      let px = x;
      let py = 0;
      const lean = rand(0.04, 0.12) * (Math.random() < 0.5 ? -1 : 1);
      for (let i = 0; i < 5; i++) {
        const h = 1.5 * k;
        b.add('bark', new THREE.CylinderGeometry(0.15 * k, 0.19 * k, h, 8), { pos: [px, py + h / 2, z], rot: [0, 0, -lean * i], color: 0x8a7050 });
        px += Math.sin(lean * i) * h;
        py += Math.cos(lean * i) * h * 0.98;
      }
      for (let l = 0; l < 9; l++) {
        const a = (l / 9) * Math.PI * 2;
        for (let seg = 0; seg < 2; seg++) {
          const len = 1.5 * k;
          const droop = 0.35 + seg * 0.55;
          const r = (0.7 + seg * 1.3) * k;
          b.add('foliage', new THREE.BoxGeometry(len, 0.05, 0.55 * k), {
            pos: [px + Math.cos(a) * r, py - seg * 0.6 * k, z + Math.sin(a) * r], rot: [0, -a, -droop], color: seg ? 0x3f6e24 : 0x548a2e,
          });
        }
      }
      break;
    }
    default: {
      // flowering bougainvillea bush - bright magenta
      b.add('foliage', canopy(rand(0.8, 1.2) * k, 1, pick([0xe0409a, 0xd03070, 0xff70b0]), 0x2c4a1e, 0.8), { pos: [x, 0.8 * k, z] });
    }
  }
}

function treeCluster(b, s, density) {
  const count = Math.round(rand(4, 8) * density);
  const kinds = ['neem', 'neem', 'mango', 'eucalyptus', 'palm', 'ashoka', 'bush'];
  for (let i = 0; i < count; i++) {
    tree(b, s * rand(11, 17), rand(-19, 19), pick(kinds), rand(0.8, 1.3));
  }
  // low bushes close to the road
  for (let i = 0; i < Math.round(5 * density) + 1; i++) {
    b.add('foliage', canopy(rand(0.35, 0.7), 1, 0x5f8a34, 0x24401a, 0.7), { pos: [s * rand(10, 13), 0.25, rand(-19, 19)] });
  }
  return { F: 40, D: 6 };
}

/** Clumps of grass on the verges (crossed alpha-textured cards). */
function grassVerge(b, s, amount) {
  for (let i = 0; i < amount; i++) {
    const x = s * rand(9.4, 16);
    const z = rand(-20, 20);
    const h = rand(0.35, 0.8);
    const color = pick([0x9cc060, 0x88a84c, 0xb8b868, 0x7a9a40]);
    for (const a of [0, Math.PI / 2]) {
      b.add('grass', new THREE.PlaneGeometry(rand(0.6, 1.1), h), { pos: [x, h / 2, z], rot: [0, a + rand(-0.3, 0.3), 0], color });
    }
  }
  return {};
}

// ---------- Road barriers ----------
/** Galvanised W-beam crash barrier on posts (countryside & industrial). */
function wBeam(b, s) {
  const x = s * 9.35;
  const prof = [[0, 0], [0.07, 0.045], [0.07, 0.11], [0.025, 0.155], [0.07, 0.2], [0.07, 0.265], [0, 0.31]];
  const shape = new THREE.Shape();
  prof.forEach(([px, py], i) => (i ? shape.lineTo(-s * px, py) : shape.moveTo(-s * px, py)));
  for (let i = prof.length - 1; i >= 0; i--) shape.lineTo(-s * (prof[i][0] - 0.008), prof[i][1]);
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 40, bevelEnabled: false, steps: 8 });
  geo.translate(0, 0, -20);
  b.add('galv', geo, { pos: [x, 0.45, 0], color: 0xffffff });
  for (let z = -20; z < 20; z += 4) {
    b.add('galv', new THREE.BoxGeometry(0.1, 0.8, 0.15), { pos: [x + s * 0.12, 0.4, z], color: 0xd0d4d8 });
    b.add('reflector', new THREE.BoxGeometry(0.02, 0.06, 0.1), { pos: [x - s * 0.075, 0.6, z] });
  }
  return {};
}

/** New-Jersey concrete barrier (city & urban highway). */
function jersey(b, s) {
  const x = s * 9.55;
  const p = [[-0.3, 0], [0.3, 0], [0.3, 0.08], [0.13, 0.3], [0.08, 0.81], [-0.08, 0.81], [-0.13, 0.3], [-0.3, 0.08]];
  const shape = new THREE.Shape();
  p.forEach(([px, py], i) => (i ? shape.lineTo(px, py) : shape.moveTo(px, py)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: 40, bevelEnabled: false, steps: 8 });
  geo.translate(0, 0, -20);
  b.add('solid', geo, { pos: [x, 0, 0], color: 0xc8c4ba });
  for (let z = -20; z < 20; z += 4) {
    b.add('solid', new THREE.BoxGeometry(0.62, 0.82, 0.04), { pos: [x, 0.41, z], color: 0x8a867e }); // joints
    b.add('reflector', new THREE.BoxGeometry(0.02, 0.07, 0.12), { pos: [x - s * 0.1, 0.65, z + 2] });
  }
  return {};
}

/** Pedestrian railing (towns). */
function railing(b, s) {
  const x = s * 9.4;
  for (const y of [0.45, 0.95]) b.add('galv', new THREE.BoxGeometry(0.05, 0.06, 40), { pos: [x, y, 0], color: 0xe0d050 });
  for (let z = -20; z < 20; z += 2) b.add('galv', new THREE.BoxGeometry(0.05, 1.0, 0.05), { pos: [x, 0.5, z], color: 0x30343a });
  return {};
}

/** Black & white delineator posts with reflectors (open countryside). */
function delineators(b, s) {
  for (let z = -15; z < 20; z += 20) {
    b.add('solid', new THREE.BoxGeometry(0.12, 1.0, 0.12), { pos: [s * 9.4, 0.5, z], color: 0xf2f2f2 });
    b.add('solid', new THREE.BoxGeometry(0.125, 0.18, 0.125), { pos: [s * 9.4, 0.85, z], color: 0x111111 });
    b.add('reflector', new THREE.BoxGeometry(0.13, 0.08, 0.13), { pos: [s * 9.4, 0.62, z] });
  }
  return {};
}

function streetLamp(b, s) {
  const px = s * 10.4;
  const z = s * 10;
  cyl(b, 'metal', 0.09, 8, px, 0, z, 0x6c757d, 8, 0.14);
  b.add('metal', new THREE.CylinderGeometry(0.06, 0.08, 3.6, 6), { pos: [px - s * 1.7, 8.15, z], rot: [0, 0, s * 1.38], color: 0x6c757d });
  box(b, 'metal', 0.95, 0.12, 0.45, px - s * 3.3, 8.18, z, 0x5a6068);
  box(b, 'lamp', 0.85, 0.05, 0.38, px - s * 3.3, 8.13, z);
  b.add('lampGlow', new THREE.PlaneGeometry(2.2, 2.2), { pos: [px - s * 3.3, 7.95, z + 0.25] });
  b.add('pool', new THREE.PlaneGeometry(9, 9), { pos: [px - s * 3.7, 0.05, z], rot: [-Math.PI / 2, 0, 0] });
  return { lamps: [[px - s * 3.3, 7.8, z]] };
}
function electricPoles(b, s) {
  const x = s * 12.5;
  box(b, 'solid', 0.28, 9, 0.28, x, 0, -20, 0xbdb8ad);
  box(b, 'solid', 0.18, 0.18, 2.6, x, 8.4, -20, 0xbdb8ad);
  box(b, 'solid', 2.6, 0.18, 0.18, x, 8.4, -20, 0xbdb8ad);
  for (const o of [-1.1, 0, 1.1]) {
    cyl(b, 'solid', 0.07, 0.25, x + o, 8.5, -20, 0x9c6644, 6);
    box(b, 'metal', 0.035, 0.035, 40, x + o, 8.68, 0, 0x2b2b2b); // wires to the next pole
  }
  return {};
}

function billboard(b, s, adIndex) {
  const x = s * rand(13, 16);
  const z = rand(-12, 12);
  const big = Math.random() < 0.5;
  const w = big ? 13 : 9;
  const h = big ? 5.6 : 4;
  const y = big ? 8 : 6.5;
  const yaw = -s * 0.32;
  for (const o of [-w * 0.3, w * 0.3]) {
    b.add('metal', new THREE.CylinderGeometry(0.18, 0.22, y, 8), { pos: [x + Math.cos(yaw) * o, y / 2, z - Math.sin(yaw) * o], color: 0x4a4e55 });
  }
  b.add('metal', new THREE.BoxGeometry(w + 0.5, h + 0.5, 0.3), { pos: [x, y + h / 2, z - 0.2], rot: [0, yaw, 0], color: 0x2b2d33 });
  b.add(`ad${adIndex}`, new THREE.PlaneGeometry(w, h), { pos: [x + Math.sin(yaw) * -0.02, y + h / 2, z - 0.03], rot: [0, yaw, 0] });
  for (const o of [-w / 3, 0, w / 3]) {
    b.add('lamp', new THREE.BoxGeometry(0.5, 0.18, 0.4), { pos: [x + Math.cos(yaw) * o, y + h + 0.5, z + 0.4 - Math.sin(yaw) * o], rot: [0, yaw, 0] });
  }
  return {};
}

function riverBank(b) {
  b.add('water', new THREE.PlaneGeometry(400, 40), { pos: [0, 0.3, 0], rot: [-Math.PI / 2, 0, 0] });
  for (const s of [-1, 1]) {
    b.add('foliage', new THREE.IcosahedronGeometry(2.5, 0), { pos: [s * rand(40, 80), 0.5, rand(-15, 15)], color: 0x3f6f2a });
  }
  return {};
}

// ---------- Template cache & pools ----------
const templates = new Map(); // key -> { merged, meta }
const pools = new Map(); // key -> [groups]

function template(key, build) {
  if (!templates.has(key)) {
    initMaterials();
    const b = new GeoBatch();
    const meta = build(b) || {};
    templates.set(key, { merged: b.merge(), meta });
  }
  return templates.get(key);
}

function instance(key, build) {
  const t = template(key, build);
  const pool = pools.get(key);
  const obj = pool && pool.length ? pool.pop() : meshesFromMerged(t.merged, MATS, { castShadow: true, receiveShadow: false });
  obj.userData.templateKey = key;
  obj.position.set(0, 0, 0);
  return { obj, meta: t.meta };
}

function recycle(obj) {
  const key = obj.userData.templateKey;
  if (!key) return;
  if (!pools.has(key)) pools.set(key, []);
  pools.get(key).push(obj);
}

/** Builds every template up front (called during loading) to avoid hitches. */
export function prewarmScenery() {
  initMaterials();
  for (const type of Object.keys(T)) {
    for (const s of [-1, 1]) for (let v = 0; v < VARIANTS; v++) template(`${type}:${s}:${v}`, (b) => T[type](b, s));
  }
  for (const s of [-1, 1]) {
    for (let v = 0; v < 6; v++) for (const d of TREE_DENSITIES) template(`trees:${s}:${v}:${d}`, (b) => treeCluster(b, s, d));
    for (const d of [10, 24, 40]) template(`grass:${s}:${d}`, (b) => grassVerge(b, s, d));
    for (const [name, fn] of Object.entries(BARRIERS)) template(`barrier:${name}:${s}`, (b) => fn(b, s));
    template(`lamp:${s}`, (b) => streetLamp(b, s));
    template(`poles:${s}`, (b) => electricPoles(b, s));
  }
}

/**
 * Fills one 40 m road segment with scenery for a zone.
 * @param {THREE.Group} content group to fill (cleared first)
 * @returns {{ lamps: number[][], petrol: object|null }}
 */
const TREE_DENSITIES = [1, 0.6, 0.35];
const BARRIERS = { wbeam: wBeam, jersey, railing, delineators };
const BARRIER_ODDS = {
  countryside: [['wbeam', 0.45], ['delineators', 0.55]],
  town: [['railing', 0.45], ['none', 0.55]],
  city: [['jersey', 0.7], ['railing', 0.3]],
  industrial: [['wbeam', 0.6], ['jersey', 0.4]],
  urban: [['jersey', 0.8], ['wbeam', 0.2]],
};
// barriers come in runs of several segments, like on a real highway
const barrierRun = { type: 'none', left: 0, zone: null };
const TALL = new Set(['apartment', 'office', 'hotel', 'hospital', 'townHouse', 'warehouse', 'factory', 'shops']);

/**
 * Fills one 40 m road segment with scenery for a zone.
 * @param {THREE.Group} content group to fill (cleared first)
 * @returns {{ lamps: number[][], petrol: object|null }}
 */
export function fillSegment(content, zoneId, { river = false, empty = false } = {}) {
  initMaterials();
  for (const child of [...content.children]) {
    content.remove(child);
    recycle(child);
  }
  const zone = ZONES[zoneId];
  const info = { lamps: [], petrol: null };
  if (empty) return info;
  const add = ({ obj, meta }, x = 0, z = 0, sx = 1, sy = 1, sz = 1) => {
    obj.position.set(x, 0, z);
    obj.scale.set(sx, sy, sz);
    content.add(obj);
    return meta;
  };

  if (river) {
    add(instance('river', (b) => riverBank(b)));
    return info;
  }

  if (barrierRun.left <= 0 || barrierRun.zone !== zoneId) {
    const odds = BARRIER_ODDS[zoneId];
    let r = Math.random();
    barrierRun.type = odds[odds.length - 1][0];
    for (const [type, p] of odds) {
      if ((r -= p) <= 0) {
        barrierRun.type = type;
        break;
      }
    }
    barrierRun.left = randInt(3, 9);
    barrierRun.zone = zoneId;
  }
  barrierRun.left--;

  for (const s of [-1, 1]) {
    if (zone.lamps) {
      const meta = add(instance(`lamp:${s}`, (b) => streetLamp(b, s)));
      info.lamps.push(...meta.lamps);
    }
    if (barrierRun.type !== 'none') {
      const type = barrierRun.type;
      add(instance(`barrier:${type}:${s}`, (b) => BARRIERS[type](b, s)));
    }
    if (zone.poles && s === -1) add(instance(`poles:${s}`, (b) => electricPoles(b, s)));
    if (Math.random() < zone.trees + 0.25) {
      const density = zone.trees > 0.6 ? 1 : zone.trees > 0.35 ? 0.6 : 0.35;
      // random height & mirroring along the road: the same template looks different every time
      add(instance(`trees:${s}:${randInt(0, 5)}:${density}`, (b) => treeCluster(b, s, density)), 0, 0, 1, rand(0.85, 1.2), Math.random() < 0.5 ? -1 : 1);
    }
    const grass = zone.trees > 0.6 ? 40 : zone.trees > 0.3 ? 24 : 10;
    add(instance(`grass:${s}:${grass}`, (b) => grassVerge(b, s, grass)), 0, 0, 1, 1, Math.random() < 0.5 ? -1 : 1);
    if (Math.random() < zone.billboards) {
      const ad = randInt(0, ADS.length - 1);
      add(instance(`billboard:${s}:${ad}`, (b) => billboard(b, s, ad)));
    }

    // building lots along this side
    let cursor = -20;
    const lotTypes = Object.entries(zone.lots).map(([type, weight]) => ({ type, weight }));
    while (cursor < 16) {
      const { type } = weightedPick(lotTypes);
      const key = `${type}:${s}:${randInt(0, VARIANTS - 1)}`;
      const t = template(key, (b) => T[type](b, s));
      const F = t.meta.F;
      if (type !== 'none') {
        const setback = rand(zone.setback[0], zone.setback[1]);
        const sy = TALL.has(type) ? rand(0.85, 1.2) : 1;
        const meta = add(instance(key, (b) => T[type](b, s)), s * (setback + t.meta.D / 2), cursor + F / 2, 1, sy, 1);
        if (meta.petrol) info.petrol = { side: s, z: cursor + F / 2 };
      }
      cursor += F + rand(2, 6);
    }
  }
  return info;
}
export { MATS as SCENERY_MATERIALS };




