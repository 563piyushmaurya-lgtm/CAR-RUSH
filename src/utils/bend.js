import * as THREE from 'three';

// =============================================================
// CURVED WORLD (road curves & hills)
//
// Endless runners usually fake road curves by BENDING the world in
// the vertex shader: every vertex ahead of the player is pushed
// sideways (and up/down) by  bend * distance².
// Near the car nothing changes; far away the road swings left/right.
//
// Why this is great for us:
//  * gameplay logic (lanes, collisions, spawning) stays in a simple
//    straight coordinate system - nothing has to "follow" the curve,
//    because EVERYTHING drawn with a standard material bends together.
//  * it costs almost nothing on the GPU.
//
// Limitation: it is a visual effect. The car always drives "straight"
// in game logic; curves change what you see, not the lane maths.
//
// We patch two of Three.js's built-in shader snippets ("chunks") once,
// before any material compiles, and give every material a shared
// uniform via Material.prototype.onBeforeCompile.
// =============================================================

export const BEND = { value: new THREE.Vector2(0, 0) }; // x = curve, y = hill
export const BEND_LIMIT = 260; // metres; beyond this the bend stops growing

THREE.ShaderChunk.common += /* glsl */ `
uniform vec2 uBend;
vec4 bendWorld( vec4 wp ) {
  float d = clamp( -wp.z, 0.0, ${BEND_LIMIT.toFixed(1)} );
  wp.x += uBend.x * d * d;
  wp.y += uBend.y * d * d;
  return wp;
}
`;

THREE.ShaderChunk.project_vertex = THREE.ShaderChunk.project_vertex.replace(
  'mvPosition = modelViewMatrix * mvPosition;',
  'mvPosition = viewMatrix * bendWorld( modelMatrix * mvPosition );'
);

THREE.ShaderChunk.worldpos_vertex = THREE.ShaderChunk.worldpos_vertex.replace(
  'worldPosition = modelMatrix * worldPosition;',
  'worldPosition = bendWorld( modelMatrix * worldPosition );'
);

// Every material (including the internal shadow materials) gets the uniform.
THREE.Material.prototype.onBeforeCompile = function onBeforeCompile(shader) {
  shader.uniforms.uBend = BEND;
};

/** CPU version of the bend - for things positioned in JS (lights, sun). */
export function bendOffset(z, out = { x: 0, y: 0 }) {
  const d = Math.min(Math.max(-z, 0), BEND_LIMIT);
  out.x = BEND.value.x * d * d;
  out.y = BEND.value.y * d * d;
  return out;
}
