import * as THREE from 'three';
import { applyNight } from '../utils/nightLights.js';
import { setEnvFactor } from '../utils/envMap.js';
import { clamp, damp } from '../utils/math.js';

// =============================================================
// DayNight - a 24-hour cycle compressed into a few minutes.
//
// time t: 0 = midnight, 0.25 = 6 AM (dawn), 0.5 = noon, 0.75 = 6 PM.
// Colours come from "keyframes" and are blended in between, so
// day -> sunset -> night -> dawn changes are always smooth.
//
// Modes:  'day'   - glides to late morning and stays there
//         'night' - glides to ~10 PM and stays there
//         'auto'  - the clock keeps running (full cycle ≈ 5 min)
// =============================================================

const KEYS = [
  { t: 0.0, top: 0x02040c, mid: 0x08102a, hor: 0x18223e, fog: 0x0f1526, sun: 0x8aa0ff, sunI: 0.35, hs: 0x2a3a66, hg: 0x0a0a12, hi: 0.32, star: 1 },
  { t: 0.2, top: 0x040818, mid: 0x0e1a40, hor: 0x26325c, fog: 0x151d35, sun: 0x8aa0ff, sunI: 0.3, hs: 0x2a3a66, hg: 0x0a0a12, hi: 0.32, star: 0.9 },
  { t: 0.245, top: 0x1d2f5c, mid: 0x6a6f9a, hor: 0xf09a6a, fog: 0x8c7f8a, sun: 0xff9a5a, sunI: 0.9, hs: 0x8090c0, hg: 0x40302a, hi: 0.6, star: 0.2 },
  { t: 0.29, top: 0x3a78c8, mid: 0x9cc0e8, hor: 0xffd2a8, fog: 0xc6c2be, sun: 0xffd0a0, sunI: 2.0, hs: 0xa0c0ff, hg: 0x6a5a40, hi: 0.9, star: 0 },
  { t: 0.36, top: 0x2a74d8, mid: 0x7fb6f0, hor: 0xd6ebff, fog: 0xb9d3ee, sun: 0xfff4e0, sunI: 2.8, hs: 0xb0d0ff, hg: 0x6b6040, hi: 1.05, star: 0 },
  { t: 0.5, top: 0x1f6ce0, mid: 0x6aaaf5, hor: 0xd8ecff, fog: 0xc0daf2, sun: 0xffffff, sunI: 3.1, hs: 0xb8d6ff, hg: 0x6f6545, hi: 1.15, star: 0 },
  { t: 0.66, top: 0x2a6ccc, mid: 0x82b4e8, hor: 0xffe6c8, fog: 0xc9d2da, sun: 0xfff0d8, sunI: 2.7, hs: 0xb0c8f0, hg: 0x6b6040, hi: 1.0, star: 0 },
  { t: 0.725, top: 0x2c3e78, mid: 0xd8805a, hor: 0xffb055, fog: 0xc8906c, sun: 0xff9040, sunI: 1.7, hs: 0xffb080, hg: 0x503020, hi: 0.75, star: 0 },
  { t: 0.765, top: 0x141a40, mid: 0x5a2a5a, hor: 0xd0506a, fog: 0x4a2a4c, sun: 0xff6040, sunI: 0.6, hs: 0x80609a, hg: 0x201020, hi: 0.5, star: 0.3 },
  { t: 0.82, top: 0x040818, mid: 0x0e1a40, hor: 0x26325c, fog: 0x151d35, sun: 0x8aa0ff, sunI: 0.3, hs: 0x2a3a66, hg: 0x0a0a12, hi: 0.32, star: 0.9 },
  { t: 1.0, top: 0x02040c, mid: 0x08102a, hor: 0x18223e, fog: 0x0f1526, sun: 0x8aa0ff, sunI: 0.35, hs: 0x2a3a66, hg: 0x0a0a12, hi: 0.32, star: 1 },
];
const COLOR_KEYS = ['top', 'mid', 'hor', 'fog', 'sun', 'hs', 'hg'];
const TARGETS = { day: 0.42, night: 0.93 };
const _a = new THREE.Color();
const _b = new THREE.Color();

export class DayNight {
  constructor(mode = 'auto') {
    this.mode = mode;
    this.t = mode === 'night' ? TARGETS.night : TARGETS.day;
    this.autoSpeed = 1 / 300; // one full day in 5 minutes
    this.night = 0; // 0 = full day, 1 = full night
    this.lamps = 0; // street lights / windows factor (also on in bad weather)
    this.sunDir = new THREE.Vector3();
    this.moonDir = new THREE.Vector3();
    this.c = {};
    for (const k of COLOR_KEYS) this.c[k] = new THREE.Color();
    this.sample();
  }

  setMode(mode) {
    this.mode = mode;
  }

  get label() {
    const hours = (this.t * 24) % 24;
    if (hours >= 5 && hours < 7) return 'DAWN';
    if (hours >= 7 && hours < 17) return 'DAY';
    if (hours >= 17 && hours < 19.2) return 'SUNSET';
    return 'NIGHT';
  }

  get clock() {
    const mins = Math.floor(this.t * 24 * 60);
    const h = Math.floor(mins / 60) % 24;
    const m = mins % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  /** Interpolates every keyframe value at the current time. */
  sample() {
    let i = 0;
    while (i < KEYS.length - 2 && KEYS[i + 1].t <= this.t) i++;
    const a = KEYS[i];
    const b = KEYS[i + 1];
    const f = clamp((this.t - a.t) / (b.t - a.t), 0, 1);
    for (const k of COLOR_KEYS) this.c[k].copy(_a.set(a[k])).lerp(_b.set(b[k]), f);
    this.sunI = a.sunI + (b.sunI - a.sunI) * f;
    this.hemiI = a.hi + (b.hi - a.hi) * f;
    this.star = a.star + (b.star - a.star) * f;

    const theta = (this.t - 0.25) * Math.PI * 2;
    const elev = Math.sin(theta);
    this.sunDir.set(Math.cos(theta) * -0.6, elev, -0.8).normalize();
    this.moonDir.set(-this.sunDir.x, -this.sunDir.y, -0.8).normalize();
    this.night = clamp((0.1 - elev) / 0.25, 0, 1);
  }

  update(dt) {
    if (this.mode === 'auto') {
      this.t = (this.t + dt * this.autoSpeed) % 1;
    } else {
      // glide forward in time to the chosen hour (sunsets/sunrises play out naturally)
      const target = TARGETS[this.mode];
      const dist = (target - this.t + 1) % 1;
      if (dist > 0.001 && dist < 0.999) this.t = (this.t + Math.min(dist, dt * 0.1)) % 1;
    }
    this.sample();
  }

  /**
   * Pushes the current look into the scene.
   * @param {object} ctx { stage, environment, weather }
   */
  apply({ stage, environment, weather }, dt) {
    const w = weather.p;
    const gloom = clamp(w.cloud * 0.45 + w.rain * 0.3 + w.fog * 0.2, 0, 0.8);

    // sky
    const grey = _a.set(0x8a929c).multiplyScalar(1 - this.night * 0.85);
    const u = environment.skyUniforms;
    u.topColor.value.copy(this.c.top).lerp(grey, gloom * 0.7);
    u.midColor.value.copy(this.c.mid).lerp(grey, gloom * 0.8);
    u.horizonColor.value.copy(this.c.hor).lerp(grey, gloom * 0.85);
    u.sunColor.value.copy(this.c.sun).multiplyScalar(1 - gloom);
    u.sunDir.value.copy(this.sunDir);
    u.moonDir.value.copy(this.moonDir);
    u.starStrength.value = this.star * (1 - w.cloud * 0.9);
    u.cloudiness.value = w.cloud;
    u.cloudColor.value.copy(_b.set(0xf4f6fa)).lerp(_a.set(0x6c727c), w.rain * 0.8 + gloom * 0.3).multiplyScalar(1 - this.night * 0.88);

    // fog: colour follows the horizon, distance follows weather and night
    const fog = stage.scene.fog;
    fog.color.copy(this.c.fog).lerp(grey, gloom);
    const vis = weather.visibility;
    fog.near = (60 - this.night * 25) * vis;
    fog.far = Math.max(95, (340 - this.night * 110) * vis);
    stage.scene.background.copy(fog.color);

    // lights
    const sun = stage.sun;
    const isNight = this.night > 0.5;
    const dir = isNight ? this.moonDir : this.sunDir;
    stage.lightDir.set(dir.x, Math.max(dir.y, 0.25), 0.55).normalize();
    sun.color.copy(isNight ? _a.set(0x9db0ff) : this.c.sun);
    const sunI = isNight ? 0.4 : this.sunI;
    sun.intensity = damp(sun.intensity, sunI * (1 - gloom * 0.75) + weather.flash * 3, 8, dt);
    stage.hemi.color.copy(this.c.hs);
    stage.hemi.groundColor.copy(this.c.hg);
    stage.hemi.intensity = this.hemiI * (1 - gloom * 0.25) + weather.flash * 2;
    stage.renderer.toneMappingExposure = 1.0 + this.night * 0.25;

    environment.setMountainColor(_a.copy(fog.color).lerp(_b.set(0x1a1d26), 0.35 + this.night * 0.3));

    // street lights, windows, signs: on at night and in gloomy weather
    this.lamps = clamp(Math.max(this.night, gloom * 0.9), 0, 1);
    applyNight(this.lamps);

    // reflections dim at night, bloom gets stronger
    setEnvFactor((1 - this.night * 0.78) * (1 - gloom * 0.35));
    stage.setBloom(this.night);
  }
}

