import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// =============================================================
// GeoBatch - a performance helper.
//
// A car made of 30 boxes = 30 "draw calls" (GPU requests) per frame.
// With 10 cars on screen that adds up fast, especially on phones.
// GeoBatch collects many small shapes and MERGES all shapes that use
// the same material into ONE geometry -> one mesh -> one draw call.
// =============================================================

const _matrix = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _euler = new THREE.Euler();
const _pos = new THREE.Vector3();
const _scale = new THREE.Vector3();
const KEEP = ['position', 'normal', 'uv', 'color'];
const _color = new THREE.Color();

export class GeoBatch {
  constructor() {
    this.parts = new Map(); // materialKey -> [geometries]
  }

  /**
   * Add a shape. The geometry is consumed (transformed in place).
   * @param {string} key  material name, e.g. 'paint' or 'glass'
   * @param {THREE.BufferGeometry} geometry
   * @param {{pos?:number[], rot?:number[], scale?:number[]}} transform
   */
  add(key, geometry, { pos = [0, 0, 0], rot = [0, 0, 0], scale = [1, 1, 1], color } = {}) {
    _euler.set(rot[0], rot[1], rot[2]);
    _quat.setFromEuler(_euler);
    _pos.set(pos[0], pos[1], pos[2]);
    _scale.set(scale[0], scale[1], scale[2]);
    _matrix.compose(_pos, _quat, _scale);

    // Merging needs every geometry in the same format (non-indexed)
    let geo = geometry;
    if (geo.index) {
      geo = geometry.toNonIndexed();
      geometry.dispose();
    }
    geo.applyMatrix4(_matrix);
    for (const name of Object.keys(geo.attributes)) {
      if (!KEEP.includes(name)) geo.deleteAttribute(name);
    }
    geo.clearGroups();

    // Every part gets a per-vertex colour. Materials with vertexColors: true
    // use it, so one material can paint many differently coloured buildings.
    // (Geometry that already has its own colours, like trees, keeps them.)
    if (color === undefined && geo.attributes.color) {
      if (!this.parts.has(key)) this.parts.set(key, []);
      this.parts.get(key).push(geo);
      return this;
    }
    _color.set(color === undefined ? 0xffffff : color);
    const count = geo.attributes.position.count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i++) {
      colors[i * 3] = _color.r;
      colors[i * 3 + 1] = _color.g;
      colors[i * 3 + 2] = _color.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    if (!this.parts.has(key)) this.parts.set(key, []);
    this.parts.get(key).push(geo);
    return this;
  }

  /** Returns a Map of materialKey -> merged BufferGeometry. */
  merge() {
    const result = new Map();
    for (const [key, list] of this.parts) {
      const merged = mergeGeometries(list, false);
      merged.computeBoundingSphere();
      result.set(key, merged);
      list.forEach((g) => g.dispose());
    }
    this.parts.clear();
    return result;
  }
}

/** Turns a merged geometry map into a Group of meshes. */
export function meshesFromMerged(merged, materials, { castShadow = false, receiveShadow = false } = {}) {
  const group = new THREE.Group();
  for (const [key, geo] of merged) {
    const mat = materials[key];
    if (!mat) throw new Error(`GeoBatch: no material named "${key}"`);
    const mesh = new THREE.Mesh(geo, mat);
    mesh.name = key;
    mesh.castShadow = castShadow && !mat.transparent;
    mesh.receiveShadow = receiveShadow;
    group.add(mesh);
  }
  return group;
}


