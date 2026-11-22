import * as THREE from 'three';
import { clamp, damp } from '../utils/math.js';
import { BEND, bendOffset } from '../utils/bend.js';

// =============================================================
// CameraRig - decides where the camera should be for each screen,
// then glides there smoothly. Also handles camera shake.
//
// Screen modes: 'play' | 'menu' | 'garage' | 'shop' | 'gameover'
// Driving views (press C or the camera button):
//   'chase'     classic third-person chase camera
//   'close'     lower and tighter behind the car
//   'cockpit'   first-person from the driver's seat
//   'cinematic' TV-style shots that change every few seconds
// =============================================================

export const VIEWS = ['chase', 'close', 'cockpit', 'cinematic'];
export const VIEW_LABELS = { chase: 'CHASE', close: 'CLOSE', cockpit: 'COCKPIT', cinematic: 'CINEMATIC' };

const _pos = new THREE.Vector3();
const _look = new THREE.Vector3();
const _right = new THREE.Vector3();
const _bend = { x: 0, y: 0 };
const UP = new THREE.Vector3(0, 1, 0);

export class CameraRig {
  constructor(camera) {
    this.camera = camera;
    this.pos = camera.position.clone();
    this.look = new THREE.Vector3(0, 1, -6);
    this.orbit = 0;
    this.shakeAmount = 0;
    this.view = 'chase';
    this.shotTimer = 0;
    this.shot = 0;
    this.roll = 0;
    // same breakpoint as the CSS that moves the garage panel to the bottom
    this.stackedLayout = matchMedia('(max-width: 900px), (max-aspect-ratio: 1/1)');
  }

  shake(amount) {
    this.shakeAmount = Math.max(this.shakeAmount, amount);
  }

  /**
   * @param {object} p { x, car, speed, nitro }
   */
  update(dt, mode, p) {
    const cam = this.camera;
    const portrait = clamp((1 - cam.aspect) / 0.5, 0, 1); // 0 landscape .. 1 tall phone
    const speedK = clamp((p.speed - 20) / 30, 0, 1);
    let fov = 60;
    let smooth = 3;
    let snap = false;
    let rollTarget = 0;

    if (mode === 'play') {
      const x = p.x;
      if (this.view === 'cockpit' && p.car) {
        const d = p.car.design;
        const headZ = -(d.cabin.roofFront + d.cabin.roofRear) / 2 - 0.1;
        _pos.set(x, d.h + d.cabin.roofH * 0.62, headZ);
        _look.set(x, d.h + d.cabin.roofH * 0.45, headZ - 30);
        fov = 70 + speedK * 8;
        snap = true;
      } else if (this.view === 'close') {
        _pos.set(x * 0.85, 2.3 + portrait * 2.4, 5.6 + portrait * 4.5);
        _look.set(x * 0.9, 0.9, -10);
        fov = 62 + speedK * 12 + portrait * 12;
        smooth = 8;
      } else if (this.view === 'cinematic') {
        this.shotTimer -= dt;
        if (this.shotTimer <= 0) {
          this.shot = (this.shot + 1) % 4;
          this.shotTimer = 6;
          snap = true;
        }
        const shots = [
          [[x + 2.6, 0.7, -9], [x, 0.8, 0]], // front bumper looking back
          [[x + 7, 1.4, 1], [x, 0.8, -2]], // side tracking
          [[x, 16, 20], [x, 0, -20]], // helicopter
          [[x - 3, 0.5, 6], [x, 1, -6]], // low rear corner
        ];
        _pos.set(...shots[this.shot][0]);
        _look.set(...shots[this.shot][1]);
        fov = 55;
        smooth = 6;
      } else {
        _pos.set(x * 0.55, 3.7 + portrait * 3.6, 7.6 + portrait * 5);
        _look.set(x * 0.7, 1.1, -10);
        fov = 60 + speedK * 14 + portrait * 12;
        smooth = 6;
      }
      if (p.nitro) fov += 8;
      // follow the road: look slightly into the curve and roll a touch
      bendOffset(_look.z - 20, _bend);
      _look.x += _bend.x * 0.6;
      _look.y += _bend.y * 0.5;
      rollTarget = -BEND.value.x * 120;
      // high-speed rumble
      const rumble = clamp((p.speed - 38) / 20, 0, 1) * 0.025 + (p.nitro ? 0.03 : 0);
      if (rumble > 0) this.shake(rumble);
    } else if (mode === 'gameover') {
      _pos.set(p.x + 3.5, 5.5 + portrait * 2, 9 + portrait * 3);
      _look.set(p.x, 0.8, -1);
      fov = 55 + portrait * 10;
      smooth = 1.5;
    } else if (mode === 'garage') {
      if (this.stackedLayout.matches) {
        const dist = 1.15 + portrait * 0.45;
        _pos.set(4.6 * dist, 2.4 + portrait * 1.2, 5.6 * dist);
        _look.set(0, -0.9 - portrait * 0.6, 0);
      } else {
        _pos.set(4.6, 2.1, 5.6);
        _look.set(0, 0.7, 0);
        _right.subVectors(_look, _pos).cross(UP).normalize();
        _look.addScaledVector(_right, 1.9);
      }
      fov = 50;
      smooth = 3.5;
    } else {
      // menu & shop: slow elliptical orbit
      this.orbit += dt * (mode === 'shop' ? 0.08 : 0.14);
      const a = this.orbit;
      const high = mode === 'shop' ? 1.5 : 0;
      _pos.set(Math.sin(a) * (6 + portrait * 2), 2.6 + high + Math.sin(a * 0.7) * 0.4, Math.cos(a) * (9.5 + portrait * 4));
      _look.set(0, 3.0 + high * 0.5, 0);
      fov = 55 + portrait * 10;
      smooth = 2;
    }

    if (snap) {
      this.pos.copy(_pos);
      this.look.copy(_look);
    } else {
      const f = 1 - Math.exp(-smooth * dt);
      this.pos.lerp(_pos, f);
      this.look.lerp(_look, f);
    }

    cam.position.copy(this.pos);
    if (this.shakeAmount > 0) {
      const s = this.shakeAmount;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s * 0.5;
      this.shakeAmount = Math.max(0, s - dt * 1.4);
    }
    cam.lookAt(this.look);
    this.roll = damp(this.roll, rollTarget, 2, dt);
    cam.rotateZ(this.roll);

    const newFov = damp(cam.fov, fov, 3, dt);
    if (Math.abs(newFov - cam.fov) > 0.01) {
      cam.fov = newFov;
      cam.updateProjectionMatrix();
    }
  }
}
