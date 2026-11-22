import * as THREE from 'three';
import { GeoBatch, meshesFromMerged } from '../utils/GeoBatch.js';

// =============================================================
// Static road hazards. Each type lists its size for collisions:
//   width = across the road (x), len = along the road (z)
// =============================================================

export const OBSTACLE_TYPES = [
  { id: 'barrier', weight: 30, len: 0.8, width: 2.5 },
  { id: 'cones', weight: 25, len: 0.9, width: 2.4 },
  { id: 'roadblock', weight: 25, len: 0.8, width: 2.7 },
  { id: 'crates', weight: 20, len: 1.8, width: 2.2 },
];

let mats = null;
function materials() {
  if (mats) return mats;
  mats = {
    concrete: new THREE.MeshStandardMaterial({ color: 0xc4c8d2, roughness: 0.85 }),
    red: new THREE.MeshStandardMaterial({ color: 0xe0283c, roughness: 0.5, emissive: 0x400008, emissiveIntensity: 0.6 }),
    white: new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.4, emissive: 0x333333, emissiveIntensity: 0.4 }),
    orange: new THREE.MeshStandardMaterial({ color: 0xff6a00, roughness: 0.5, emissive: 0x662200, emissiveIntensity: 0.5 }),
    black: new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.8 }),
    wood: new THREE.MeshStandardMaterial({ color: 0xa8743f, roughness: 0.85 }),
    woodDark: new THREE.MeshStandardMaterial({ color: 0x6b4423, roughness: 0.9 }),
    amber: new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffa000, emissiveIntensity: 3 }),
  };
  return mats;
}

/** Makes the amber warning lamps blink. Call once per frame. */
export function updateObstacleMaterials(time) {
  if (mats) mats.amber.emissiveIntensity = Math.sin(time * 9) > 0 ? 3.2 : 0.25;
}

function stripedBoard(b, width, height, y, z, segments) {
  const seg = width / segments;
  for (let i = 0; i < segments; i++) {
    b.add(i % 2 ? 'white' : 'red', new THREE.BoxGeometry(seg, height, 0.06), {
      pos: [-width / 2 + seg * (i + 0.5), y, z],
    });
  }
}

const builders = {
  barrier(b) {
    b.add('concrete', new THREE.BoxGeometry(2.5, 0.35, 0.75), { pos: [0, 0.175, 0] });
    b.add('concrete', new THREE.BoxGeometry(2.5, 0.55, 0.4), { pos: [0, 0.62, 0] });
    stripedBoard(b, 2.5, 0.4, 0.62, 0.22, 5);
    for (const s of [-1, 1]) b.add('amber', new THREE.BoxGeometry(0.16, 0.14, 0.16), { pos: [s * 1.0, 0.98, 0] });
  },
  cones(b) {
    for (const x of [-0.85, 0, 0.85]) {
      b.add('black', new THREE.BoxGeometry(0.6, 0.05, 0.6), { pos: [x, 0.025, 0] });
      b.add('orange', new THREE.ConeGeometry(0.28, 0.85, 14), { pos: [x, 0.475, 0] });
      b.add('white', new THREE.CylinderGeometry(0.14, 0.18, 0.13, 14), { pos: [x, 0.48, 0] });
    }
  },
  roadblock(b) {
    for (const s of [-1, 1]) {
      b.add('white', new THREE.BoxGeometry(0.1, 1.1, 0.1), { pos: [s * 1.25, 0.55, 0] });
      b.add('black', new THREE.BoxGeometry(0.12, 0.06, 0.7), { pos: [s * 1.25, 0.03, 0] });
      b.add('amber', new THREE.BoxGeometry(0.2, 0.18, 0.14), { pos: [s * 1.25, 1.2, 0] });
    }
    stripedBoard(b, 2.7, 0.24, 0.85, 0.06, 6);
    stripedBoard(b, 2.7, 0.24, 0.45, 0.06, 6);
  },
  crates(b) {
    b.add('wood', new THREE.BoxGeometry(0.9, 0.9, 0.9), { pos: [-0.55, 0.45, 0], rot: [0, 0.2, 0] });
    b.add('wood', new THREE.BoxGeometry(0.8, 0.8, 0.8), { pos: [0.5, 0.4, 0.3], rot: [0, -0.3, 0] });
    b.add('wood', new THREE.BoxGeometry(0.7, 0.7, 0.7), { pos: [-0.4, 1.25, 0.1], rot: [0, 0.5, 0] });
    b.add('woodDark', new THREE.BoxGeometry(0.92, 0.12, 0.92), { pos: [-0.55, 0.45, 0], rot: [0, 0.2, 0] });
    b.add('woodDark', new THREE.BoxGeometry(0.82, 0.1, 0.82), { pos: [0.5, 0.4, 0.3], rot: [0, -0.3, 0] });
    b.add('black', new THREE.TorusGeometry(0.32, 0.14, 8, 16), { pos: [0.65, 0.15, -0.55], rot: [Math.PI / 2, 0, 0] });
  },
};

const cache = new Map();

export function buildObstacle(type) {
  if (!cache.has(type.id)) {
    const b = new GeoBatch();
    builders[type.id](b);
    cache.set(type.id, b.merge());
  }
  return meshesFromMerged(cache.get(type.id), materials(), { castShadow: true });
}
