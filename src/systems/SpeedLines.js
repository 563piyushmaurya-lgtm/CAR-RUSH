import * as THREE from 'three';
import { rand, clamp, damp } from '../utils/math.js';

// Thin glowing streaks rushing past the camera at high speed.
// They fade in as you go faster, which makes speed "feel" faster.

const COUNT = 70;
const _dummy = new THREE.Object3D();

export class SpeedLines {
  constructor(scene) {
    this.material = new THREE.MeshBasicMaterial({
      color: 0xbff4ff, transparent: true, opacity: 0,
      blending: THREE.AdditiveBlending, depthWrite: false, toneMapped: false,
    });
    this.mesh = new THREE.InstancedMesh(new THREE.BoxGeometry(0.035, 0.035, 1), this.material, COUNT);
    this.mesh.frustumCulled = false;
    this.mesh.visible = false;
    scene.add(this.mesh);

    this.lines = [];
    for (let i = 0; i < COUNT; i++) {
      const line = { x: 0, y: 0, z: rand(-90, 10), len: rand(3, 7) };
      this.place(line);
      this.lines.push(line);
    }
  }

  place(line) {
    const side = Math.random() < 0.5 ? -1 : 1;
    line.x = side * rand(5.5, 14);
    line.y = rand(0.3, 7);
  }

  update(dt, speed, active) {
    const target = active ? clamp((speed - 26) / 22, 0, 1) * 0.55 : 0;
    this.material.opacity = damp(this.material.opacity, target, 3, dt);
    this.mesh.visible = this.material.opacity > 0.01;
    if (!this.mesh.visible) return;

    for (let i = 0; i < COUNT; i++) {
      const l = this.lines[i];
      l.z += speed * 2.2 * dt;
      if (l.z > 12) {
        l.z -= 100;
        this.place(l);
      }
      _dummy.position.set(l.x, l.y, l.z);
      _dummy.scale.set(1, 1, l.len);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
