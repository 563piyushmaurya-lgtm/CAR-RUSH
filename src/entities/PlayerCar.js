import * as THREE from 'three';
import { CONFIG } from '../data/config.js';
import { buildPlayerCar, loadCarModel, glowMaterial, disposePaint } from '../models/CarBuilder.js';
import { getGlowTexture } from '../utils/textures.js';
import { BEND } from '../utils/bend.js';
import { damp, clamp } from '../utils/math.js';

// =============================================================
// PlayerCar - the car you drive.
//
// Hierarchy:  root (lane position, crash spin, garage turntable)
//               └─ body (lean / bounce animation)
//                    └─ model (the 3D car from CarBuilder or a GLTF)
//
// Driving feel comes from the car's class (cars.js -> CAR_CLASSES):
// heavy SUVs change lanes slower and lean more, supercars are twitchy,
// steering softens at high speed, and wet roads reduce grip.
// =============================================================

const LANES = CONFIG.LANES;

export class PlayerCar {
  constructor(scene) {
    this.root = new THREE.Group();
    this.body = new THREE.Group();
    this.root.add(this.body);
    scene.add(this.root);

    this.model = null;
    this.car = null;
    this.carId = null;
    this.lane = CONFIG.START_LANE;
    this.prevLane = this.lane;
    this.x = LANES[this.lane];
    this.vx = 0;
    this.handling = 5;
    this.physics = { mass: 1, steer: 1, highSpeedSteer: 0.9, roll: 1 };
    this.grip = 1;
    this.hitWidth = 1.7;
    this.hitLength = 3.9;
    this.crashed = false;
    this.spinVelocity = 0;
    this.time = 0;
    this.headlightsOn = false;
    this.braking = false;
    this.nitro = false;
    this.damage = 0;
    this.loadToken = 0;

    this.createHeadlights();
    this.createNitroFlames();
    this.turntable = this.createTurntable(scene);
  }

  // ---------- Headlights (manual!) ----------
  createHeadlights() {
    // one real spotlight lights the road and roadside objects
    this.spot = new THREE.SpotLight(0xfff2dc, 0, 75, 0.5, 0.55, 1.2);
    this.spot.position.set(0, 0.9, -2.2);
    this.spot.target.position.set(0, 0, -30);
    this.root.add(this.spot, this.spot.target);

    // and a soft beam on the asphalt for the glow look
    this.beam = new THREE.Mesh(
      new THREE.PlaneGeometry(5, 18),
      new THREE.MeshBasicMaterial({
        map: getGlowTexture(), color: 0xdcecff, transparent: true, opacity: 0,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    this.beam.rotation.x = -Math.PI / 2;
    this.beam.position.set(0, 0.05, -12);
    this.root.add(this.beam);
  }

  setHeadlights(on) {
    this.headlightsOn = on;
  }

  createNitroFlames() {
    this.flames = [];
    for (const s of [-1, 1]) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.13, 1.1, 10), glowMaterial(0x3ad0ff, 0));
      f.material.map = null;
      f.rotation.x = -Math.PI / 2;
      this.body.add(f);
      f.userData.side = s;
      this.flames.push(f);
    }
  }

  /** Glowing showroom platform shown in the garage. */
  createTurntable(scene) {
    const group = new THREE.Group();
    const disc = new THREE.Mesh(
      new THREE.CylinderGeometry(3.3, 3.4, 0.08, 64),
      new THREE.MeshStandardMaterial({ color: 0x14161c, metalness: 0.35, roughness: 0.4 })
    );
    disc.position.y = 0.03;
    disc.receiveShadow = true;
    const ring = new THREE.Mesh(
      new THREE.TorusGeometry(3.35, 0.05, 8, 96),
      new THREE.MeshBasicMaterial({ color: 0x00e5ff, toneMapped: false })
    );
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.08;
    const glow = new THREE.Mesh(
      new THREE.PlaneGeometry(10, 10),
      new THREE.MeshBasicMaterial({
        map: getGlowTexture(), color: 0x0088ff, transparent: true, opacity: 0.22,
        blending: THREE.AdditiveBlending, depthWrite: false,
      })
    );
    glow.rotation.x = -Math.PI / 2;
    glow.position.y = 0.09;
    group.add(disc, ring, glow);
    group.scale.setScalar(0.001);
    group.visible = false;
    scene.add(group);
    return group;
  }

  /** Swap to a different car model (or just recolour if it's the same car). */
  setCar(car, colorHex) {
    if (this.carId === car.id && this.model) {
      this.setColor(colorHex);
      return;
    }
    this.useModel(buildPlayerCar(car, colorHex));
    this.car = car;
    this.carId = car.id;
    this.physics = car.physics;
    this.hitWidth = car.design.width - 0.2;
    this.hitLength = car.design.len - 0.4;
    const h2 = car.design.len / 2;
    this.flames.forEach((f) => f.position.set(f.userData.side * 0.45, car.design.clearance + 0.12, h2 + 0.65));
    this.spot.position.z = -h2;
    this.beam.position.z = -(h2 + 8);

    // Optional licensed GLTF model replaces the procedural body when loaded
    if (car.modelUrl) {
      const token = ++this.loadToken;
      loadCarModel(car, colorHex)
        .then((model) => {
          if (token === this.loadToken) this.useModel(model);
        })
        .catch((err) => console.warn(`Could not load ${car.modelUrl}, keeping the procedural car.`, err));
    } else {
      this.loadToken++;
    }
  }

  useModel(model) {
    if (this.model) {
      this.body.remove(this.model);
      disposePaint(this.model.userData.paint);
    }
    this.model = model;
    this.body.add(model);
    this.baseColor = model.userData.paint.color.clone(); // remember the new car's own colour
    this.applyDamageLook();
  }

  setColor(hex) {
    if (this.model) {
      this.model.userData.paint.color.set(hex);
      this.baseColor = new THREE.Color(hex);
      this.applyDamageLook();
    }
  }

  /** Damage makes the paint duller and darker (scratches & dirt). */
  setDamage(d) {
    this.damage = d;
    this.applyDamageLook();
  }

  applyDamageLook() {
    if (!this.model) return;
    const paint = this.model.userData.paint;
    if (!this.baseColor) this.baseColor = paint.color.clone();
    const d = this.damage / 100;
    paint.color.copy(this.baseColor).multiplyScalar(1 - d * 0.45);
    paint.roughness = 0.38 + d * 0.5;
    paint.clearcoat = 1 - d * 0.9;
  }

  reset() {
    this.lane = CONFIG.START_LANE;
    this.prevLane = this.lane;
    this.x = LANES[this.lane];
    this.vx = 0;
    this.crashed = false;
    this.spinVelocity = 0;
    this.nitro = false;
    this.braking = false;
    this.setDamage(0);
    this.root.position.set(0, 0, 0);
    this.root.rotation.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.body.position.set(0, 0, 0);
  }

  moveLeft() {
    if (this.crashed || this.lane === 0) return false;
    this.prevLane = this.lane;
    this.lane--;
    return true;
  }

  moveRight() {
    if (this.crashed || this.lane === LANES.length - 1) return false;
    this.prevLane = this.lane;
    this.lane++;
    return true;
  }

  /** Bounced back after a side swipe. */
  bounceBack() {
    this.lane = this.prevLane;
  }

  crash(direction) {
    this.crashed = true;
    this.spinVelocity = direction * 7;
  }

  /**
   * @param {number} dt seconds since last frame
   * @param {number} speed world speed (for wheel spin & bounce)
   * @param {string} mode 'garage' | 'drive'
   */
  update(dt, speed, mode) {
    this.time += dt;
    const garage = mode === 'garage';
    const p = this.physics;

    if (this.crashed) {
      this.root.rotation.y += this.spinVelocity * dt;
      this.spinVelocity = damp(this.spinVelocity, 0, 2.5, dt);
      this.body.rotation.z = damp(this.body.rotation.z, 0.12 * Math.sign(this.spinVelocity), 6, dt);
    } else {
      // Lateral physics: a spring towards the lane centre, limited by grip.
      // Heavier cars respond slower; steering softens at high speed.
      const targetX = garage ? 0 : LANES[this.lane];
      const speedFactor = 1 - clamp((speed - 25) / 30, 0, 1) * (1 - p.highSpeedSteer);
      const stiffness = (95 + this.handling * 12) * p.steer * speedFactor / p.mass;
      const dampRatio = 2 * Math.sqrt(stiffness) * 0.95; // just under critical damping
      const ax = (targetX - this.x) * stiffness - this.vx * dampRatio;
      const maxAx = 130 * this.grip / Math.sqrt(p.mass);
      this.vx += clamp(ax, -maxAx, maxAx) * dt;
      this.x += this.vx * dt;
      if (garage) {
        this.x = damp(this.x, 0, 6, dt);
        this.vx = 0;
      }

      // Lean: nose points into the lane change, body rolls outward;
      // curves add a little body roll too.
      const curveRoll = BEND.value.x * 220 * Math.min(1, speed / 30);
      this.body.rotation.y = damp(this.body.rotation.y, clamp(-this.vx * 0.022, -0.22, 0.22), 14, dt);
      this.body.rotation.z = damp(this.body.rotation.z, clamp(this.vx * 0.006 * p.roll + curveRoll * p.roll, -0.12, 0.12), 8, dt);
      // nose dips under braking, lifts with nitro
      const pitch = this.braking ? 0.025 : this.nitro ? -0.02 : 0;
      this.body.rotation.x = damp(this.body.rotation.x, pitch * p.mass, 6, dt);

      if (garage) {
        this.root.rotation.y += dt * 0.45;
      } else {
        const r = Math.atan2(Math.sin(this.root.rotation.y), Math.cos(this.root.rotation.y));
        this.root.rotation.y = damp(r, 0, 4, dt);
      }
    }
    this.root.position.x = this.x;

    // suspension bounce
    this.body.position.y = speed > 1 ? Math.sin(this.time * 18) * 0.012 * Math.min(1, speed / 30) : 0;

    // spin the wheels: distance / radius = angle
    if (this.model) {
      const spin = (speed * dt) / this.model.userData.wheelR;
      for (const w of this.model.userData.wheels) w.rotation.x -= spin;

      // lights: headlights only when the PLAYER turns them on
      const L = this.model.userData.lights;
      const on = this.headlightsOn && !garage;
      L.headlight.emissiveIntensity = damp(L.headlight.emissiveIntensity, on ? 3 : 0.15, 10, dt);
      L.headGlow.opacity = damp(L.headGlow.opacity, on ? 1 : 0, 10, dt);
      const tail = this.braking ? 1 : on ? 0.55 : 0.12;
      L.tailGlow.opacity = damp(L.tailGlow.opacity, tail, 12, dt);
    }
    const lightOn = this.headlightsOn && !garage;
    this.spot.intensity = damp(this.spot.intensity, lightOn ? 220 : 0, 10, dt);
    this.beam.material.opacity = damp(this.beam.material.opacity, lightOn ? 0.35 : 0, 10, dt);

    // nitro flames
    for (const f of this.flames) {
      f.material.opacity = damp(f.material.opacity, this.nitro ? 0.9 : 0, 14, dt);
      f.scale.y = 0.8 + Math.random() * 0.5;
      f.visible = f.material.opacity > 0.02;
    }

    // turntable fades in/out
    const s = damp(this.turntable.scale.x, garage ? 1 : 0.001, 6, dt);
    this.turntable.scale.setScalar(s);
    this.turntable.visible = s > 0.01;
  }
}



