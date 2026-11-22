import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';
import { envHolder } from '../utils/envMap.js';
import { getGlowTexture } from '../utils/textures.js';

// A gold coin: a thin disc with a raised centre.
// Geometry and material are shared by every coin (cheap to create many).

let geometry = null;
let material = null;

export function buildCoin() {
  if (!geometry) {
    const b = new GeoBatch();
    const faceCamera = [Math.PI / 2, 0, 0]; // stand the disc up, facing the player
    b.add('gold', new THREE.CylinderGeometry(0.48, 0.48, 0.1, 28), { rot: faceCamera });
    b.add('gold', new THREE.CylinderGeometry(0.32, 0.32, 0.16, 28), { rot: faceCamera });
    b.add('gold', new THREE.TorusGeometry(0.46, 0.04, 6, 28), {});
    geometry = b.merge().get('gold');
    material = new THREE.MeshStandardMaterial({
      color: 0xffc933,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0xb37400,
      emissiveIntensity: 0.6,
      envMap: envHolder.map,
      envMapIntensity: 1.2,
    });
  }
  const coin = new THREE.Mesh(geometry, material);
  coin.castShadow = true;
  return coin;
}

// ---------- Pickups: fuel can, repair kit, nitro bottle, petrol-pump lane ----------
let pickupMats = null;
function pickupMaterials() {
  if (pickupMats) return pickupMats;
  const std = (color, emissive = 0x000000, ei = 0) =>
    new THREE.MeshStandardMaterial({ color, roughness: 0.4, metalness: 0.3, emissive, emissiveIntensity: ei });
  pickupMats = {
    red: std(0xd8202a, 0x500000, 0.6),
    blue: std(0x1f6bff, 0x0a2a80, 0.8),
    cyan: std(0x00e5ff, 0x00a0c0, 1.2),
    steel: std(0xc8ced8),
    dark: std(0x1a1c22),
    green: std(0x22c55e, 0x0a5020, 0.8),
    yellow: std(0xffd21a, 0x806000, 0.8),
  };
  return pickupMats;
}

const pickupCache = new Map();
const BUILDERS = {
  fuel(b) {
    b.add('red', new THREE.BoxGeometry(0.62, 0.8, 0.3), { pos: [0, 0, 0] });
    b.add('red', new THREE.BoxGeometry(0.4, 0.08, 0.1), { pos: [-0.05, 0.45, 0] });
    b.add('steel', new THREE.CylinderGeometry(0.06, 0.06, 0.18, 8), { pos: [0.22, 0.48, 0], rot: [0, 0, -0.5] });
    b.add('yellow', new THREE.BoxGeometry(0.5, 0.14, 0.32), { pos: [0, -0.05, 0] });
  },
  repair(b) {
    b.add('blue', new THREE.BoxGeometry(0.8, 0.45, 0.36), { pos: [0, 0, 0] });
    b.add('dark', new THREE.BoxGeometry(0.4, 0.08, 0.1), { pos: [0, 0.3, 0] });
    b.add('steel', new THREE.BoxGeometry(0.55, 0.1, 0.4), { pos: [0, 0.06, 0], rot: [0, 0, 0.6] });
    b.add('steel', new THREE.TorusGeometry(0.1, 0.035, 6, 12), { pos: [0.27, 0.25, 0.2] });
  },
  nitro(b) {
    b.add('cyan', new THREE.CylinderGeometry(0.2, 0.2, 0.8, 16), { pos: [0, 0, 0] });
    b.add('steel', new THREE.CylinderGeometry(0.1, 0.15, 0.2, 12), { pos: [0, 0.5, 0] });
    b.add('dark', new THREE.CylinderGeometry(0.21, 0.21, 0.1, 16), { pos: [0, 0.15, 0] });
  },
  station(b) {
    // a big floating petrol-pump nozzle sign marking the refuel lane
    b.add('green', new THREE.BoxGeometry(0.9, 1.4, 0.4), { pos: [0, 0.2, 0] });
    b.add('yellow', new THREE.BoxGeometry(0.6, 0.4, 0.42), { pos: [0, 0.5, 0] });
    b.add('dark', new THREE.BoxGeometry(0.15, 0.6, 0.15), { pos: [0.55, 0.2, 0] });
    b.add('steel', new THREE.BoxGeometry(0.3, 0.12, 0.12), { pos: [0.65, 0.5, 0] });
  },
};

const GLOW_COLORS = { fuel: 0xff5040, repair: 0x40a0ff, nitro: 0x00e5ff, station: 0x40ff80 };

export function buildPickup(type) {
  if (!pickupCache.has(type)) {
    const b = new GeoBatch();
    BUILDERS[type](b);
    pickupCache.set(type, b.merge());
  }
  const group = meshesFromMerged(pickupCache.get(type), pickupMaterials(), { castShadow: true });
  const glow = new THREE.Mesh(
    new THREE.PlaneGeometry(type === 'station' ? 3.4 : 2, type === 'station' ? 3.4 : 2),
    new THREE.MeshBasicMaterial({
      map: getGlowTexture(), color: GLOW_COLORS[type], transparent: true, opacity: 0.7,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    })
  );
  group.add(glow);
  if (type === 'station') group.scale.setScalar(1.3);
  return group;
}
