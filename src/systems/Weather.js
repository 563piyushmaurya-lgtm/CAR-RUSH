import * as THREE from 'three';
import { clamp, damp, rand, weightedPick } from '../utils/math.js';

// =============================================================
// Weather - clear, cloudy, rain, storm (heavy rain + thunder), fog.
//
// Each weather type is a set of target values. The live values
// glide towards them over several seconds, so weather never snaps.
//   cloud  0..1  sky cover
//   rain   0..1  rain particles + sound
//   fog    0..1  visibility loss
//   wet    0..1  road wetness (lags behind rain, dries slowly)
//
// Fairness: visibility never drops below ~95 m of fog distance,
// traffic lights shine through fog, and grip only drops ~18%.
// =============================================================

export const WEATHER = {
  clear: { label: 'CLEAR', icon: '☀️', cloud: 0.12, rain: 0, fog: 0 },
  cloudy: { label: 'CLOUDY', icon: '☁️', cloud: 0.75, rain: 0, fog: 0.12 },
  rain: { label: 'RAIN', icon: '🌧️', cloud: 0.9, rain: 0.5, fog: 0.3 },
  storm: { label: 'HEAVY RAIN', icon: '⛈️', cloud: 1, rain: 1, fog: 0.45 },
  fog: { label: 'FOG', icon: '🌫️', cloud: 0.5, rain: 0, fog: 1 },
};
const AUTO_WEIGHTS = [
  { id: 'clear', weight: 5 },
  { id: 'cloudy', weight: 3 },
  { id: 'rain', weight: 2.5 },
  { id: 'storm', weight: 1.2 },
  { id: 'fog', weight: 1.5 },
];

const DROPS = 3500;

const RAIN_VERTEX = /* glsl */ `
  uniform float uTime;
  uniform float uRun;
  uniform vec3 uCam;
  attribute float aEnd;
  attribute float aSpeed;
  varying float vAlpha;
  void main() {
    vec3 p = position;
    p.y = mod(p.y - uTime * aSpeed, 26.0);
    p.z = mod(p.z + uRun, 60.0) - 50.0;
    vec3 wp = vec3(uCam.x + p.x, uCam.y + p.y - 9.0, p.z);
    wp.y -= aEnd * 0.9;
    wp.z += aEnd * 0.35;
    vAlpha = 1.0 - aEnd * 0.8;
    gl_Position = projectionMatrix * viewMatrix * vec4(wp, 1.0);
  }
`;
const RAIN_FRAGMENT = /* glsl */ `
  uniform float uOpacity;
  varying float vAlpha;
  void main() {
    gl_FragColor = vec4(0.78, 0.84, 0.95, uOpacity * vAlpha * 0.5);
  }
`;

export class Weather {
  constructor(scene, mode = 'auto') {
    this.mode = mode;
    this.state = mode === 'auto' ? 'clear' : mode;
    this.timer = rand(40, 70);
    this.p = { cloud: 0.12, rain: 0, fog: 0, wet: 0 };
    this.flash = 0;
    this.thunderTimer = rand(6, 14);
    this.events = [];
    this.run = 0;
    this.createRain(scene);
  }

  createRain(scene) {
    const pos = new Float32Array(DROPS * 2 * 3);
    const end = new Float32Array(DROPS * 2);
    const speed = new Float32Array(DROPS * 2);
    for (let i = 0; i < DROPS; i++) {
      const x = rand(-28, 28);
      const y = rand(0, 26);
      const z = rand(0, 60);
      const s = rand(18, 26);
      for (let k = 0; k < 2; k++) {
        const j = i * 2 + k;
        pos.set([x, y, z], j * 3);
        end[j] = k;
        speed[j] = s;
      }
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    geo.setAttribute('aSpeed', new THREE.BufferAttribute(speed, 1));
    this.rainUniforms = {
      uTime: { value: 0 },
      uRun: { value: 0 },
      uCam: { value: new THREE.Vector3() },
      uOpacity: { value: 0 },
    };
    this.rain = new THREE.LineSegments(geo, new THREE.ShaderMaterial({
      uniforms: this.rainUniforms,
      vertexShader: RAIN_VERTEX,
      fragmentShader: RAIN_FRAGMENT,
      transparent: true,
      depthWrite: false,
    }));
    this.rain.frustumCulled = false;
    this.rain.visible = false;
    scene.add(this.rain);
  }

  setMode(mode) {
    this.mode = mode;
    if (mode !== 'auto') this.state = mode;
    else this.timer = rand(30, 60);
  }

  get info() {
    return WEATHER[this.state];
  }

  /** Multiplier for fog distances (1 = clear). */
  get visibility() {
    return (1 - this.p.fog * 0.62) * (1 - this.p.rain * 0.3);
  }

  /** Tyre grip: wet roads steer and brake a little worse. */
  get grip() {
    return 1 - this.p.wet * 0.18;
  }

  update(dt, camera, worldSpeed) {
    if (this.mode === 'auto') {
      this.timer -= dt;
      if (this.timer <= 0) {
        this.state = weightedPick(AUTO_WEIGHTS.filter((w) => w.id !== this.state)).id;
        this.timer = rand(45, 90);
        this.events.push({ type: 'weather', state: this.state });
      }
    }

    const target = WEATHER[this.state];
    this.p.cloud = damp(this.p.cloud, target.cloud, 0.35, dt);
    this.p.rain = damp(this.p.rain, target.rain, 0.3, dt);
    this.p.fog = damp(this.p.fog, target.fog, 0.3, dt);
    const wetTarget = this.p.rain > 0.15 ? 1 : 0;
    this.p.wet = clamp(this.p.wet + (wetTarget ? 0.12 : -0.025) * dt, 0, 1);

    // rain particles follow the camera
    this.run += worldSpeed * dt;
    const u = this.rainUniforms;
    u.uTime.value += dt;
    u.uRun.value = this.run % 60;
    u.uCam.value.copy(camera.position);
    u.uOpacity.value = this.p.rain;
    this.rain.visible = this.p.rain > 0.02;

    // thunder & lightning in storms
    this.flash = Math.max(0, this.flash - dt * 3);
    if (this.p.rain > 0.75) {
      this.thunderTimer -= dt;
      if (this.thunderTimer <= 0) {
        this.flash = 1;
        this.thunderTimer = rand(8, 18);
        this.events.push({ type: 'thunder' });
      }
    }
  }
}
