import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { CONFIG } from '../data/config.js';

// =============================================================
// SceneSetup - the Three.js basics from Milestone 1, grown up:
// renderer, scene, camera, lights, reflections and resizing.
// =============================================================

export class SceneSetup {
  constructor(canvas) {
    this.isMobile = matchMedia('(pointer: coarse)').matches;

    // ---------- Renderer ----------
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.isMobile ? 1.5 : 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; // cinematic colour response
    this.renderer.toneMappingExposure = 1.1;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;

    // ---------- Scene ----------
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(CONFIG.FOG_COLOR);
    this.scene.fog = new THREE.Fog(CONFIG.FOG_COLOR, CONFIG.FOG_NEAR, CONFIG.FOG_FAR);

    // ---------- Camera ----------
    // near = 0.25 m keeps depth precision good enough for the bloom render target
    this.camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.25, 1500);
    this.camera.position.set(0, 3.7, 7.6);

    // ---------- Reflections ----------
    // Shiny materials (car paint, glass, chrome) reflect a blurred OUTDOOR
    // scene: blue sky above, a bright horizon band, darker ground below
    // and a sun. That horizon line running along a curved car body is
    // what makes paint read as "real car" instead of plastic.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.envMap = pmrem.fromScene(this.createEnvScene(), 0.02).texture;
    pmrem.dispose();

    // ---------- Post-processing: bloom (desktop only) ----------
    // Bright things (lamps, LED lights, signs at night) get a soft glow.
    this.composer = null;
    if (!this.isMobile) {
      const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
      const target = new THREE.WebGLRenderTarget(size.x, size.y, { type: THREE.HalfFloatType, samples: 4 });
      this.composer = new EffectComposer(this.renderer, target);
      this.composer.addPass(new RenderPass(this.scene, this.camera));
      this.bloom = new UnrealBloomPass(new THREE.Vector2(size.x / 2, size.y / 2), 0.3, 0.5, 1.0);
      this.composer.addPass(this.bloom);
      this.composer.addPass(new OutputPass());
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(window.innerWidth, window.innerHeight);
    }

    // ---------- Lights ----------
    // Colours & intensities are driven every frame by DayNight.
    this.hemi = new THREE.HemisphereLight(0xb8d6ff, 0x6f6545, 1.1);
    this.scene.add(this.hemi);

    // Main sun/moon light with shadows. It follows the player so the
    // shadow area (a small box) is always around the action.
    this.lightDir = new THREE.Vector3(0.3, 0.8, 0.55).normalize();
    this.sun = new THREE.DirectionalLight(0xffffff, 3);
    this.sun.castShadow = true;
    const size = this.isMobile ? 1024 : 2048;
    this.sun.shadow.mapSize.set(size, size);
    const sc = this.sun.shadow.camera;
    sc.left = -18;
    sc.right = 18;
    sc.top = 18;
    sc.bottom = -18;
    sc.near = 1;
    sc.far = 90;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    this.scene.add(this.sun, this.sun.target);

    this.followTarget(0);
    window.addEventListener('resize', () => this.resize());
  }

  followTarget(x) {
    this.sun.target.position.set(x, 0, -8);
    this.sun.position.set(x + this.lightDir.x * 40, this.lightDir.y * 40, -8 + this.lightDir.z * 40);
  }
  createEnvScene() {
    const scene = new THREE.Scene();
    const sky = new THREE.Mesh(
      new THREE.SphereGeometry(50, 32, 16),
      new THREE.ShaderMaterial({
        side: THREE.BackSide,
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: `
          varying vec3 vP;
          void main() {
            float h = normalize(vP).y;
            vec3 sky = mix(vec3(0.9, 0.93, 0.97), vec3(0.22, 0.42, 0.78), smoothstep(0.0, 0.55, h));
            vec3 ground = mix(vec3(0.32, 0.3, 0.27), vec3(0.08, 0.08, 0.09), smoothstep(0.0, -0.35, h));
            vec3 c = h > 0.0 ? sky : ground;
            c += vec3(0.6) * smoothstep(0.035, 0.0, abs(h)); // bright horizon line
            gl_FragColor = vec4(c, 1.0);
          }`,
      })
    );
    const sun = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(9, 8.5, 7.5) }));
    sun.position.set(18, 28, 22);
    scene.add(sky, sun);
    // two soft "studio strips" give long highlights along body panels
    for (const z of [-14, 14]) {
      const strip = new THREE.Mesh(new THREE.PlaneGeometry(40, 2), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 2.2, 2.2), side: THREE.DoubleSide }));
      strip.position.set(0, 22, z);
      strip.rotation.x = Math.PI / 2;
      scene.add(strip);
    }
    return scene;
  }

  /** Bloom strength/threshold follow the time of day (DayNight calls this). */
  setBloom(night) {
    if (!this.bloom) return;
    this.bloom.strength = 0.2 + night * 0.32;
    this.bloom.threshold = 1.05 - night * 0.2;
    this.bloom.radius = 0.45;
  }

  resize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(w, h);
    if (this.composer) {
      this.composer.setPixelRatio(this.renderer.getPixelRatio());
      this.composer.setSize(w, h);
    }
  }

  render() {
    if (this.composer) this.composer.render();
    else this.renderer.render(this.scene, this.camera);
  }
}





