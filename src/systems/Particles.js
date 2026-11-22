import * as THREE from 'three';
import { rand, pick } from '../utils/math.js';

// =============================================================
// Particles - sparks, debris, smoke and coin sparkles.
//
// Uses ONE InstancedMesh: the GPU draws hundreds of copies of the
// same little cube in a single draw call, each with its own
// position, size and colour. Much faster than hundreds of meshes.
// =============================================================

const _dummy = new THREE.Object3D();
const _color = new THREE.Color();

export class Particles {
  constructor(scene, max = 500) {
    this.max = max;
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshBasicMaterial({ toneMapped: false }),
      max
    );
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    this.mesh.frustumCulled = false;
    scene.add(this.mesh);

    this.items = [];
    for (let i = 0; i < max; i++) {
      this.items.push({
        alive: false, life: 0, maxLife: 1, size: 0.1, gravity: 0, drag: 0, world: 0, grow: false,
        pos: new THREE.Vector3(), vel: new THREE.Vector3(), rot: new THREE.Vector3(),
      });
      this.mesh.setColorAt(i, _color.set(0xffffff));
      this.hide(i);
    }
    this.cursor = 0;
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  hide(i) {
    _dummy.position.set(0, -1000, 0);
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    this.mesh.setMatrixAt(i, _dummy.matrix);
  }

  /**
   * Emit a burst of particles.
   * @param {THREE.Vector3} origin
   * @param {object} o options: count, colors, speed[min,max], up, life[min,max],
   *                   size[min,max], gravity, drag, world (0..1 follow road), grow, spread
   */
  burst(origin, o) {
    const {
      count = 20, colors = [0xffffff], speed = [2, 6], up = 2, life = [0.5, 1],
      size = [0.08, 0.15], gravity = 9, drag = 0, world = 0, grow = false, spread = 1,
    } = o;
    for (let n = 0; n < count; n++) {
      const i = this.cursor;
      this.cursor = (this.cursor + 1) % this.max;
      const p = this.items[i];
      p.alive = true;
      p.maxLife = p.life = rand(life[0], life[1]);
      p.size = rand(size[0], size[1]);
      p.gravity = gravity;
      p.drag = drag;
      p.world = world;
      p.grow = grow;
      p.pos.copy(origin);
      // random direction on a sphere, then scaled
      const dir = new THREE.Vector3(rand(-1, 1), rand(-1, 1), rand(-1, 1)).normalize();
      p.vel.copy(dir).multiplyScalar(rand(speed[0], speed[1]) * spread);
      p.vel.y += up;
      p.rot.set(rand(0, 6), rand(0, 6), rand(0, 6));
      this.mesh.setColorAt(i, _color.set(pick(colors)));
    }
    this.mesh.instanceColor.needsUpdate = true;
  }

  clear() {
    this.items.forEach((p, i) => {
      p.alive = false;
      this.hide(i);
    });
    this.mesh.instanceMatrix.needsUpdate = true;
  }

  update(dt, worldSpeed) {
    let any = false;
    for (let i = 0; i < this.max; i++) {
      const p = this.items[i];
      if (!p.alive) continue;
      any = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.alive = false;
        this.hide(i);
        continue;
      }
      p.vel.y -= p.gravity * dt;
      if (p.drag) p.vel.multiplyScalar(Math.max(0, 1 - p.drag * dt));
      p.pos.addScaledVector(p.vel, dt);
      p.pos.z += worldSpeed * p.world * dt; // drift with the road
      if (p.pos.y < 0.05 && p.gravity > 0) {
        p.pos.y = 0.05;
        p.vel.y *= -0.35; // little bounce
        p.vel.x *= 0.7;
        p.vel.z *= 0.7;
      }

      const t = p.life / p.maxLife;
      const s = p.grow ? p.size * (1.6 - t) : p.size * Math.sqrt(t);
      p.rot.x += dt * 6;
      p.rot.y += dt * 4;
      _dummy.position.copy(p.pos);
      _dummy.rotation.set(p.rot.x, p.rot.y, p.rot.z);
      _dummy.scale.setScalar(s);
      _dummy.updateMatrix();
      this.mesh.setMatrixAt(i, _dummy.matrix);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
