import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';
import {
  makeDirectionSign, makeExitSign, makeSpeedLimitSign, makeWarningSign, makeKmStone, makeChevronTexture,
} from '../utils/signs.js';
import { registerNight } from '../utils/nightLights.js';
import { buildTrafficVehicle } from '../models/VehicleBuilder.js';
import { TRAFFIC_TYPES, TRAFFIC_COLORS } from '../data/cars.js';
import { ELEVATION } from './Scenery.js';
import { rand, pick } from '../utils/math.js';

// =============================================================
// Structures - highway infrastructure placed by DISTANCE:
//   * overhead gantries with green Indian direction signs
//   * curve warnings (placed before real curves from RoadCurve)
//   * speed-limit signs (per zone) and speed cameras
//   * exit signs, kilometre stones
//   * overpasses you drive under (with traffic crossing on top)
//   * elevated sections: flyovers over cities & bridges over rivers
// Every item moves towards the player like the rest of the world
// and is removed once behind the camera.
// =============================================================

const AHEAD = 380; // how far ahead structures are created (hidden in fog)
const EDGE = 10.2; // x of poles just outside the kerb and crash barriers

export const SPEED_LIMITS = { countryside: 100, town: 60, city: 80, industrial: 80, urban: 80 };

// A fictional-but-plausible national highway route through real Indian cities
const CITIES = ['GWALIOR', 'AGRA', 'MATHURA', 'DELHI', 'JAIPUR', 'AJMER', 'UDAIPUR', 'INDORE', 'UJJAIN', 'BHOPAL', 'SAGAR', 'JHANSI', 'KANPUR', 'LUCKNOW', 'NAGPUR'];

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xbdb8ae, roughness: 0.92 }),
    darkConcrete: new THREE.MeshStandardMaterial({ color: 0x8c877e, roughness: 0.95 }),
    metal: new THREE.MeshStandardMaterial({ color: 0x9aa1a9, metalness: 0.6, roughness: 0.4 }),
    signBack: new THREE.MeshStandardMaterial({ color: 0x6b7178, metalness: 0.5, roughness: 0.5 }),
    yellow: new THREE.MeshStandardMaterial({ color: 0xffc61a, roughness: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf2f2ee, roughness: 0.7 }),
    black: new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.7 }),
    lamp: registerNight(new THREE.MeshStandardMaterial({ color: 0xfff0d0, emissive: 0xfff0d0, emissiveIntensity: 0.05 }), 'emissiveIntensity', 0.05, 3),
  };
  return mats;
}

/** Sign face material (reflective: glows a little more at night, like retro-reflective sheeting). */
function faceMaterial(tex, transparent = false) {
  return registerNight(new THREE.MeshStandardMaterial({
    map: tex, emissiveMap: tex, emissive: 0xffffff, emissiveIntensity: 0.12, roughness: 0.5,
    transparent, alphaTest: transparent ? 0.5 : 0,
  }), 'emissiveIntensity', 0.12, 0.75);
}

const cache = new Map();
function cachedGroup(key, build) {
  if (!cache.has(key)) {
    const b = new GeoBatch();
    build(b);
    cache.set(key, b.merge());
  }
  return meshesFromMerged(cache.get(key), materials(), { castShadow: true });
}

function plane(tex, w, h, transparent = false) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), faceMaterial(tex, transparent));
  m.userData.disposeTexture = tex;
  return m;
}

export class Structures {
  constructor(scene, curve) {
    this.scene = scene;
    this.curve = curve;
    this.items = [];
    this.events = [];
    this.reset(0);
  }

  reset(odometer) {
    for (const it of this.items) this.remove(it);
    this.items = [];
    this.events = [];
    this.nextGantry = odometer + 500;
    this.nextKm = Math.ceil((odometer + AHEAD) / 1000) * 1000;
    this.nextStone = Math.ceil((odometer + AHEAD) / 200) * 200;
    this.nextOverpass = odometer + rand(900, 1500);
    this.nextCamera = odometer + rand(1500, 2500);
    this.nextExit = odometer + rand(1200, 2000);
    this.signedCurves = new Set();
    this.lastZone = null;
    this.sections = []; // elevated sections { start, end, type }
    this.nextElevated = odometer + rand(1800, 2600);
    this.parapetCursor = 0;
    // route: absolute odometer position (m) of each upcoming city
    this.route = [];
    let at = odometer + rand(15, 30) * 1000;
    for (let i = 0; i < 6; i++) {
      this.route.push({ city: pick(CITIES.filter((c) => !this.route.some((r) => r.city === c))), at });
      at += rand(25, 90) * 1000;
    }
  }

  // ---------- elevated sections ----------
  sectionAt(dist, margin = 0) {
    return this.sections.find((s) => dist >= s.start - margin && dist < s.end + margin) || null;
  }

  isElevatedAt(dist) {
    return this.sectionAt(dist);
  }

  // ---------- lifecycle ----------
  add(obj, odometerAt, odometer, extra = {}) {
    obj.position.z = -(odometerAt - odometer);
    this.scene.add(obj);
    const it = { obj, at: odometerAt, ...extra };
    this.items.push(it);
    return it;
  }

  remove(it) {
    this.scene.remove(it.obj);
    it.obj.traverse((o) => {
      if (o.userData.disposeTexture) {
        o.userData.disposeTexture.dispose();
        o.material.dispose();
        o.geometry.dispose();
      }
    });
  }

  update(dt, odometer, { zoneAt, playerSpeedKmh }) {
    const horizon = odometer + AHEAD;

    // move & recycle
    for (let i = this.items.length - 1; i >= 0; i--) {
      const it = this.items[i];
      const z = -(it.at - odometer);
      it.obj.position.z = z;
      if (it.crossers) {
        for (const c of it.crossers) {
          c.position.x += c.userData.vx * dt;
          if (Math.abs(c.position.x) > 34) c.position.x = -Math.sign(c.position.x) * 34;
        }
      }
      if (it.camera && !it.triggered && z > 0) {
        it.triggered = true;
        this.events.push({ type: 'speedCamera', limit: it.camera, speed: playerSpeedKmh });
      }
      if (z > 70) {
        this.remove(it);
        this.items.splice(i, 1);
      }
    }

    // schedule an elevated section ahead
    if (this.nextElevated < horizon + 600) {
      const start = this.nextElevated;
      const type = zoneAt(start) === 'countryside' ? 'river' : 'flyover';
      const len = type === 'river' ? rand(260, 420) : rand(380, 640);
      this.sections.push({ start, end: start + len, type });
      this.parapetCursor = start;
      this.nextElevated = start + len + rand(2400, 4000);
      this.signAt(start - 250, odometer, makeWarningSign('caution'), 'warning');
    }
    this.sections = this.sections.filter((s) => s.end > odometer - 200);
    for (const s of this.sections) {
      while (this.parapetCursor < s.end && this.parapetCursor < horizon && this.parapetCursor >= s.start) {
        this.add(this.parapet(s.type), this.parapetCursor + 10, odometer);
        this.parapetCursor += 20;
      }
    }

    // gantry with green direction signs
    if (this.nextGantry < horizon) {
      if (!this.sectionAt(this.nextGantry, 30)) this.add(this.gantry(odometer), this.nextGantry, odometer);
      this.nextGantry += rand(900, 1500);
    }

    // overpasses
    if (this.nextOverpass < horizon) {
      if (!this.sectionAt(this.nextOverpass, 60)) {
        const { group, crossers } = this.overpass();
        this.add(group, this.nextOverpass, odometer, { crossers });
      }
      this.nextOverpass += rand(1400, 2600);
    }

    // curve warnings ~80 m before real curves
    for (const c of this.curve.curvesStartingBetween(odometer + 120, horizon + 80)) {
      if (this.signedCurves.has(c.start)) continue;
      this.signedCurves.add(c.start);
      this.signAt(c.start - 80, odometer, makeWarningSign(c.curve < 0 ? 'left' : 'right'), 'warning');
      // yellow & black chevron boards on the outside of the bend
      const dir = c.curve < 0 ? -1 : 1;
      for (let i = 0; i < 5; i++) this.add(this.chevron(dir), c.start + 10 + i * 22, odometer);
    }

    // speed limit when the zone changes
    const zone = zoneAt(horizon);
    if (zone !== this.lastZone) {
      if (this.lastZone !== null) this.signAt(horizon, odometer, makeSpeedLimitSign(SPEED_LIMITS[zone]), 'round');
      this.lastZone = zone;
    }

    // speed camera: warning sign, then the camera 180 m later
    if (this.nextCamera < horizon - 180) {
      const limit = SPEED_LIMITS[zoneAt(this.nextCamera)] + 20; // a little tolerance
      this.signAt(this.nextCamera, odometer, makeWarningSign('camera'), 'warning');
      this.signAt(this.nextCamera + 30, odometer, makeSpeedLimitSign(limit - 20), 'round');
      this.add(this.cameraPole(), this.nextCamera + 180, odometer, { camera: limit });
      this.nextCamera += rand(2200, 3600);
    }

    // exit sign towards the next city
    if (this.nextExit < horizon) {
      const next = this.route[0];
      const km = Math.max(1, Math.round((next.at - this.nextExit) / 1000));
      this.signAt(this.nextExit, odometer, makeExitSign(next.city, `${Math.min(km, 2)} km`), 'exit');
      this.nextExit += rand(2500, 4000);
    }

    // kilometre stones every km, small white stones every 200 m
    while (this.nextStone < horizon) {
      if (this.nextStone % 1000 === 0) {
        const next = this.route[0];
        const km = Math.max(0, Math.round((next.at - this.nextStone) / 1000));
        this.add(this.kmStone(next.city, km), this.nextStone, odometer);
      } else {
        this.add(cachedGroup('hm', (b) => this.hectoStone(b)), this.nextStone, odometer);
      }
      this.nextStone += 200;
    }

    // advance the route when we reach a city
    if (this.route[0].at < odometer) {
      this.route.shift();
      const last = this.route[this.route.length - 1];
      this.route.push({ city: pick(CITIES.filter((c) => !this.route.some((r) => r.city === c))), at: last.at + rand(25, 90) * 1000 });
    }
  }

  // ---------- builders ----------
  signAt(at, odometer, tex, kind) {
    const g = new THREE.Group();
    const m = materials();
    const h = kind === 'exit' ? 4.2 : 2.6;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, h, 6), m.metal);
    pole.position.y = h / 2;
    g.add(pole);
    let face;
    if (kind === 'round') face = plane(tex, 1.3, 1.3, true);
    else if (kind === 'exit') face = plane(tex, 3.4, 2.1);
    else face = plane(tex, 1.4, 1.86, true);
    face.position.y = h + (kind === 'exit' ? 0.6 : 0.5);
    face.position.z = 0.05;
    g.add(face);
    if (kind === 'exit') {
      const pole2 = pole.clone();
      pole2.position.x = 1.2;
      pole.position.x = -1.2;
      g.add(pole2);
    }
    g.position.x = -EDGE; // keep left: signs stand on the left shoulder
    if (kind === 'exit') g.position.x = -EDGE - 1.5;
    this.add(g, at, odometer);
  }

  gantry(odometer) {
    const g = cachedGroup('gantry', (b) => {
      const span = EDGE * 2 + 1;
      for (const s of [-1, 1]) {
        b.add('metal', new THREE.CylinderGeometry(0.22, 0.28, 9, 10), { pos: [s * EDGE, 4.5, 0] });
        b.add('concrete', new THREE.BoxGeometry(1.2, 0.6, 1.2), { pos: [s * EDGE, 0.3, 0] });
      }
      for (const y of [7.3, 8.9]) b.add('metal', new THREE.BoxGeometry(span, 0.18, 0.18), { pos: [0, y, 0] });
      for (let x = -EDGE; x < EDGE; x += 1.6) {
        b.add('metal', new THREE.BoxGeometry(0.08, 1.9, 0.08), { pos: [x + 0.8, 8.1, 0], rot: [0, 0, 0.7] });
      }
      // back of the panel over the oncoming lanes (we see its rear)
      b.add('signBack', new THREE.BoxGeometry(8.2, 3.8, 0.12), { pos: [4.0, 8.1, 0.2] });
      b.add('signBack', new THREE.BoxGeometry(8.6, 4.4, 0.1), { pos: [-3.9, 8.2, -0.25] });
      for (const x of [-6.5, -3.9, -1.3]) b.add('lamp', new THREE.BoxGeometry(0.5, 0.15, 0.5), { pos: [x, 10.55, 0.3] });
    });

    // live distances: they count down as you drive
    const [first, second, third] = this.route;
    const km = (r) => Math.max(1, Math.round((r.at - (odometer + AHEAD)) / 1000));
    const rows = [
      { city: first.city, km: km(first), dir: 'up' },
      { city: second.city, km: km(second), dir: 'upleft' },
      { city: third.city, km: km(third), dir: 'up' },
    ];
    const face = plane(makeDirectionSign(rows, 'NH 44'), 8.4, 4.2);
    face.position.set(-3.9, 8.2, -0.19);
    face.rotation.y = 0;
    // the face must look towards the player (+z)
    face.position.z = -0.19 + 0.07;
    g.add(face);
    return g;
  }

  overpass() {
    const group = cachedGroup('overpass', (b) => {
      // deck crossing over the highway
      b.add('concrete', new THREE.BoxGeometry(72, 1.3, 11), { pos: [0, 8.25, 0] });
      b.add('darkConcrete', new THREE.BoxGeometry(72, 0.7, 9), { pos: [0, 7.25, 0] });
      for (const s of [-1, 1]) {
        b.add('concrete', new THREE.BoxGeometry(72, 1.0, 0.35), { pos: [0, 9.4, s * 5.3] }); // parapets
        for (const x of [EDGE + 0.8, 26]) {
          b.add('concrete', new THREE.BoxGeometry(1.5, 7.6, 1.5), { pos: [s * x, 3.8, -2.8] });
          b.add('concrete', new THREE.BoxGeometry(1.5, 7.6, 1.5), { pos: [s * x, 3.8, 2.8] });
          b.add('darkConcrete', new THREE.BoxGeometry(2.2, 0.8, 9), { pos: [s * x, 7.2, 0] });
        }
      }
      for (let x = -34; x <= 34; x += 8.5) b.add('lamp', new THREE.BoxGeometry(0.4, 0.12, 0.4), { pos: [x, 7.0, 0] });
    });
    // vehicles crossing on the bridge
    const crossers = [];
    for (let i = 0; i < 2; i++) {
      const type = pick(TRAFFIC_TYPES.filter((t) => !t.builder || t.builder === 'auto'));
      const v = buildTrafficVehicle(type);
      v.userData.setPaint(pick(TRAFFIC_COLORS));
      const dir = i === 0 ? 1 : -1;
      v.rotation.y = dir === 1 ? -Math.PI / 2 : Math.PI / 2;
      v.position.set(rand(-30, 30), 8.9, dir * 2.4);
      v.userData.vx = dir * rand(9, 14);
      group.add(v);
      crossers.push(v);
    }
    return { group, crossers };
  }

  parapet(type) {
    return cachedGroup(`parapet:${type}`, (b) => {
      for (const s of [-1, 1]) {
        b.add('concrete', new THREE.BoxGeometry(0.45, 1.1, 20), { pos: [s * (EDGE - 0.6), 0.55, 0] });
        b.add('metal', new THREE.BoxGeometry(0.1, 0.12, 20), { pos: [s * (EDGE - 0.6), 1.25, 0] });
        b.add('darkConcrete', new THREE.BoxGeometry(0.6, 1.8, 20), { pos: [s * (EDGE - 0.35), -0.9, 0] }); // deck fascia
      }
      // pier under the deck every 20 m
      const h = ELEVATION - 1.6;
      b.add('concrete', new THREE.BoxGeometry(type === 'river' ? 3 : 2.2, h, 2.2), { pos: [0, -1.6 - h / 2, 0] });
      b.add('darkConcrete', new THREE.BoxGeometry(17, 1.2, 2.4), { pos: [0, -2.2, 0] }); // cross beam
      if (type === 'river') {
        for (const s of [-1, 1]) b.add('concrete', new THREE.BoxGeometry(1.6, h, 1.6), { pos: [s * 6.5, -1.6 - h / 2, 0] });
      }
    });
  }

  chevron(dir) {
    const key = `chevron:${dir}`;
    if (!this.chevronTex) this.chevronTex = {};
    if (!this.chevronTex[key]) this.chevronTex[key] = faceMaterial(makeChevronTexture(dir)); // shared per direction
    const g = new THREE.Group();
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.6, 6), materials().metal);
    pole.position.y = 0.8;
    const face = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 0.9), this.chevronTex[key]);
    face.position.set(0, 1.9, 0.03);
    g.add(pole, face);
    g.position.x = -dir * EDGE; // the outer side of the curve
    return g;
  }

  cameraPole() {
    return cachedGroup('speedcam', (b) => {
      b.add('metal', new THREE.CylinderGeometry(0.12, 0.15, 6.5, 8), { pos: [-EDGE, 3.25, 0] });
      b.add('metal', new THREE.BoxGeometry(3.2, 0.12, 0.12), { pos: [-EDGE + 1.6, 6.4, 0] });
      b.add('black', new THREE.BoxGeometry(0.5, 0.45, 0.8), { pos: [-EDGE + 3, 6.1, 0] });
      b.add('lamp', new THREE.BoxGeometry(0.3, 0.2, 0.05), { pos: [-EDGE + 3, 6.1, 0.42] });
    });
  }

  kmStone(city, km) {
    const g = new THREE.Group();
    const stone = cachedGroup('kmstone', (b) => {
      b.add('white', new THREE.BoxGeometry(0.6, 0.85, 0.28), { pos: [0, 0.42, 0] });
      b.add('yellow', new THREE.CylinderGeometry(0.3, 0.3, 0.28, 12, 1, false, 0, Math.PI), { pos: [0, 0.85, 0], rot: [Math.PI / 2, 0, Math.PI / 2] });
    });
    g.add(stone);
    const face = plane(makeKmStone('NH 44', city, km), 0.58, 0.95);
    face.position.set(0, 0.62, 0.15);
    g.add(face);
    g.position.x = -EDGE + 0.2;
    return g;
  }

  hectoStone(b) {
    b.add('white', new THREE.BoxGeometry(0.3, 0.5, 0.2), { pos: [-EDGE + 0.2, 0.25, 0] });
    b.add('yellow', new THREE.BoxGeometry(0.31, 0.12, 0.21), { pos: [-EDGE + 0.2, 0.5, 0] });
  }
}


