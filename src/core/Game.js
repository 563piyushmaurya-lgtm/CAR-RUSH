import '../utils/bend.js'; // must patch the shaders before any material compiles
import * as THREE from 'three';
import { CONFIG } from '../data/config.js';
import { getCar } from '../data/cars.js';
import { SceneSetup } from './SceneSetup.js';
import { InputManager } from './InputManager.js';
import { Environment } from '../world/Environment.js';
import { Spawner } from '../world/Spawner.js';
import { RoadCurve } from '../world/RoadCurve.js';
import { Structures, SPEED_LIMITS } from '../world/Structures.js';
import { ZONES } from '../world/Scenery.js';
import { PlayerCar } from '../entities/PlayerCar.js';
import { CameraRig, VIEWS } from '../systems/CameraRig.js';
import { Particles } from '../systems/Particles.js';
import { SpeedLines } from '../systems/SpeedLines.js';
import { SaveSystem } from '../systems/SaveSystem.js';
import { AudioManager } from '../systems/AudioManager.js';
import { DayNight } from '../systems/DayNight.js';
import { Weather, WEATHER } from '../systems/Weather.js';
import { Police } from '../systems/Police.js';
import { Missions } from '../systems/Missions.js';
import { UIManager } from '../ui/UIManager.js';
import { envHolder } from '../utils/envMap.js';
import { damp, clamp } from '../utils/math.js';

// =============================================================
// Game - the "director". Owns every system, runs the game loop
// and switches between states (a "state machine"):
//
//   MENU ──► PLAYING ──► CRASHED ──► GAME_OVER
//    │ ▲       │ ▲                      │
//    ▼ │       ▼ │                      ▼
//  GARAGE    PAUSED               (restart / menu)
//  SHOP
// =============================================================

export const STATE = {
  MENU: 'menu',
  GARAGE: 'garage',
  SHOP: 'shop',
  PLAYING: 'playing',
  PAUSED: 'paused',
  CRASHED: 'crashed',
  GAME_OVER: 'gameover',
};

const GEARS = [0, 12, 20, 28, 36, 44, 999]; // m/s where each gear tops out
const WEATHER_ORDER = ['auto', 'clear', 'cloudy', 'rain', 'storm', 'fog'];
const EVENT_TOASTS = {
  construction: '⚠ ROAD WORKS AHEAD',
  breakdown: '⚠ BROKEN-DOWN VEHICLE AHEAD',
  accident: '⚠ ACCIDENT AHEAD',
  cow: '🐄 ANIMAL ON THE ROAD',
  checkpoint: '🚓 POLICE CHECKPOINT AHEAD',
};

const _tmp = new THREE.Vector3();

export class Game {
  constructor(canvas) {
    this.save = new SaveSystem();
    this.audio = new AudioManager(this.save.data.muted);

    this.stage = new SceneSetup(canvas);
    envHolder.map = this.stage.envMap; // must be set before any car is built
    const scene = this.stage.scene;

    this.curve = new RoadCurve();
    this.structures = new Structures(scene, this.curve);
    this.environment = new Environment(scene, this.stage.renderer, this.structures);
    this.spawner = new Spawner(scene);
    this.particles = new Particles(scene);
    this.speedLines = new SpeedLines(scene);
    this.player = new PlayerCar(scene);
    this.police = new Police(scene);
    this.cameraRig = new CameraRig(this.stage.camera);
    this.cameraRig.view = VIEWS.includes(this.save.data.cameraView) ? this.save.data.cameraView : 'chase';
    this.dayNight = new DayNight(this.save.data.dayMode);
    this.weather = new Weather(scene, this.save.data.weatherMode);
    this.missions = new Missions(this.save);
    this.player.setHeadlights(this.save.data.headlights);

    this.state = STATE.MENU;
    this.worldSpeed = CONFIG.MENU_SPEED;
    this.odometer = 0;
    this.run = this.newRun(getCar(this.save.data.selectedCar));
    this.lastResult = null;
    this.crashTimer = 0;
    this.smokeTimer = 0;
    this.ambienceTimer = 3;
    this.missionTimer = 0;
    this.brakeHeld = false;
    this.nitroHeld = false;
    this.lastZone = null;
    this.lastTime = performance.now();
    this.firstFrame = true;

    this.equipSelectedCar();
    this.ui = new UIManager(this);

    this.input = new InputManager({
      onLeft: () => this.steer(-1, false),
      onRight: () => this.steer(1, false),
      onSwipeLeft: () => this.steer(-1, true),
      onSwipeRight: () => this.steer(1, true),
      onPause: () => this.togglePause(),
      onBrake: (down) => this.setBrake(down),
      onNitro: (down) => this.setNitro(down),
      onHorn: () => this.honkHorn(),
      onHeadlights: () => this.toggleHeadlights(),
      onCamera: () => this.cycleCamera(),
      onConfirm: () => {
        if (this.state === STATE.MENU || this.state === STATE.GAME_OVER) this.startRun();
      },
    });

    // Auto-pause when the player switches tabs
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === STATE.PLAYING) this.pause();
    });

    this.ui.showScreen('menu');
    this.ui.updateControls();
    this.loop = this.loop.bind(this);
  }

  start() {
    requestAnimationFrame(this.loop);
  }

  newRun(car) {
    return {
      distance: 0,
      coins: 0,
      bonus: 0,
      score: 0,
      time: 0,
      level: 0,
      nextMilestone: 1000,
      maxSpeed: CONFIG.BASE_MAX_SPEED + car.stats.speed * 1.6,
      accel: (3 + car.stats.accel * 0.9) / Math.pow(car.physics.mass, 0.35),
      hp: 100,
      fuel: 100,
      nitro: 0.5,
      nitroActive: false,
      nitroCooldown: 0,
      invuln: 0,
      combo: 0,
      comboTimer: 0,
      bestCombo: 0,
      nearMisses: 0,
      oncomingMisses: 0,
      cleanDistance: 0,
      fastTime: 0,
      nightTime: 0,
      rainDistance: 0,
      topSpeed: 0,
      gear: 1,
      rev: 0,
      shiftTimer: 0,
      lowFuelWarned: false,
    };
  }

  // ============ State changes ============

  startRun() {
    const car = getCar(this.save.data.selectedCar);
    this.equipSelectedCar();
    this.spawner.reset();
    this.particles.clear();
    this.player.reset();
    this.police.reset();
    this.audio.stopSiren();
    this.player.handling = car.stats.handling;
    this.run = this.newRun(car);
    this.missions.onRunStart();
    this.state = STATE.PLAYING;
    this.player.root.visible = true;
    this.applyCameraView();

    this.ui.showScreen(null);
    this.ui.setHud(true);
    this.ui.resetHud();
    this.ui.bigText('GO!');
    this.audio.startEngine();
  }

  pause() {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.PAUSED;
    this.brakeHeld = false;
    this.nitroHeld = false;
    this.ui.showScreen('pause');
    this.audio.setEnginePaused(true);
    this.audio.setAmbience({ speed: 0, rain: 0, driving: false });
  }

  resume() {
    if (this.state !== STATE.PAUSED) return;
    this.state = STATE.PLAYING;
    this.ui.showScreen(null);
    this.audio.setEnginePaused(false);
    this.lastTime = performance.now();
  }

  togglePause() {
    if (this.state === STATE.PLAYING) this.pause();
    else if (this.state === STATE.PAUSED) this.resume();
  }

  leaveRun() {
    this.spawner.clear();
    this.particles.clear();
    this.police.reset();
    this.audio.stopSiren();
    this.audio.stopEngine();
    this.player.reset();
    this.player.root.visible = true;
    this.ui.setHud(false);
  }

  goToMenu() {
    this.state = STATE.MENU;
    this.leaveRun();
    this.equipSelectedCar();
    this.ui.refreshWallet();
    this.ui.renderMissions();
    this.ui.showScreen('menu');
  }

  openGarage(carId) {
    this.state = STATE.GARAGE;
    this.leaveRun();
    this.ui.showScreen('garage');
    this.ui.garage.open(carId);
  }

  openShop() {
    this.state = STATE.SHOP;
    this.leaveRun();
    this.equipSelectedCar();
    this.ui.shop.open();
    this.ui.showScreen('shop');
  }

  /** Ends the run (crash, busted, out of fuel...) and saves progress. */
  finishRun(reason) {
    if (this.state !== STATE.PLAYING) return;
    this.state = STATE.CRASHED;
    this.crashTimer = 1.6;
    this.brakeHeld = false;
    this.nitroHeld = false;
    this.audio.stopEngine();
    this.audio.stopSiren();

    const r = this.run;
    this.save.addCoins(r.coins);
    this.save.data.totalDistance += r.distance;
    this.missions.report('distance', r.distance);
    this.missions.report('coins', r.coins);
    this.missions.report('rainDistance', r.rainDistance);
    const isNewBest = this.save.submitScore(r.score);
    this.missions.persist();
    this.lastResult = {
      reason,
      score: r.score,
      distance: r.distance,
      coins: r.coins,
      best: this.save.data.bestScore,
      nearMisses: r.nearMisses,
      topSpeed: Math.round(r.topSpeed * CONFIG.KMH_FACTOR),
      isNewBest,
    };
    this.flushMissionToasts();
  }

  crash(hit, reason = 'CRASHED!') {
    const px = this.player.x;
    const dir = hit.x === px ? (Math.random() < 0.5 ? -1 : 1) : Math.sign(px - hit.x);
    this.player.crash(dir || 1);
    this.player.setDamage(100);

    const at = _tmp.set((px + hit.x) / 2, 0.8, -this.player.hitLength / 2);
    const paint = this.save.getColor(getCar(this.save.data.selectedCar));
    this.particles.burst(at, {
      count: 70, colors: [0xffd27a, 0xff8a00, 0xffffff, 0xffe066], speed: [6, 14], up: 4,
      life: [0.4, 1.0], size: [0.05, 0.12], gravity: 14,
    });
    this.particles.burst(at, {
      count: 30, colors: [paint, 0x15161a, 0xaab2c0], speed: [3, 8], up: 5,
      life: [1.0, 1.8], size: [0.12, 0.32], gravity: 14,
    });
    this.particles.burst(at, {
      count: 24, colors: [0x55565e, 0x3c3d44, 0x777880], speed: [0.5, 2], up: 2.2,
      life: [1.2, 2.2], size: [0.4, 0.9], gravity: -0.5, drag: 1.5, grow: true,
    });
    this.cameraRig.shake(1.0);
    this.audio.crash();
    this.ui.flash();
    if (navigator.vibrate) navigator.vibrate(250);
    this.finishRun(reason);
  }

  // ============ Controls ============

  steer(dir, fromSwipe) {
    if (this.state === STATE.PLAYING) {
      const moved = dir < 0 ? this.player.moveLeft() : this.player.moveRight();
      if (moved) {
        this.audio.swoosh();
        if (this.worldSpeed > 38) this.audio.tireSqueal();
      }
    } else if (this.state === STATE.GARAGE && !fromSwipe) {
      this.ui.garage.step(dir);
    }
  }

  setBrake(down) {
    this.brakeHeld = down && this.state === STATE.PLAYING;
  }

  setNitro(down) {
    this.nitroHeld = down && this.state === STATE.PLAYING;
  }

  honkHorn() {
    if (this.state === STATE.PLAYING || this.state === STATE.MENU) this.audio.horn();
  }

  toggleHeadlights() {
    const on = !this.save.data.headlights;
    this.save.data.headlights = on;
    this.save.persist();
    this.player.setHeadlights(on);
    this.audio.click();
    this.ui.updateControls();
  }

  setDayMode(mode) {
    this.save.data.dayMode = mode;
    this.save.persist();
    this.dayNight.setMode(mode);
    this.ui.updateControls();
  }

  cycleWeather() {
    const i = WEATHER_ORDER.indexOf(this.weather.mode);
    const mode = WEATHER_ORDER[(i + 1) % WEATHER_ORDER.length];
    this.weather.setMode(mode);
    this.save.data.weatherMode = mode;
    this.save.persist();
    this.ui.updateControls();
  }

  cycleCamera() {
    const i = VIEWS.indexOf(this.cameraRig.view);
    this.cameraRig.view = VIEWS[(i + 1) % VIEWS.length];
    this.save.data.cameraView = this.cameraRig.view;
    this.save.persist();
    this.applyCameraView();
    this.ui.updateControls();
  }

  applyCameraView() {
    const cockpit = this.cameraRig.view === 'cockpit' && (this.state === STATE.PLAYING || this.state === STATE.PAUSED);
    this.player.body.visible = !cockpit;
    document.body.classList.toggle('cockpit', cockpit);
  }

  equipSelectedCar() {
    const car = getCar(this.save.data.selectedCar);
    this.player.setCar(car, this.save.getColor(car));
  }

  /** Tries to buy a car. Returns true on success. */
  purchaseCar(id) {
    const car = getCar(id);
    if (this.save.isUnlocked(id)) return true;
    if (!this.save.spendCoins(car.price)) {
      this.audio.error();
      return false;
    }
    this.save.unlock(id);
    this.audio.purchase();
    this.ui.refreshWallet();
    return true;
  }

  /** Confetti burst around the car (garage purchase). */
  celebrate(car) {
    this.particles.burst(_tmp.set(0, 1.2, 0), {
      count: 120, colors: [car.color, car.accent, 0xffc933, 0xffffff], speed: [3, 8], up: 7,
      life: [1.2, 2.0], size: [0.08, 0.18], gravity: 9,
    });
  }

  toggleSound() {
    const muted = !this.save.data.muted;
    this.save.setMuted(muted);
    this.audio.setMuted(muted);
    this.ui.updateSoundButtons();
  }

  // ============ Game loop ============

  loop(now) {
    requestAnimationFrame(this.loop);

    // Delta time in seconds, capped so a lag spike can't teleport things
    const dt = Math.min((now - this.lastTime) / 1000, 0.05);
    this.lastTime = now;

    if (this.state === STATE.PAUSED) {
      this.stage.render();
      return;
    }

    switch (this.state) {
      case STATE.PLAYING:
        this.updateRun(dt);
        break;
      case STATE.CRASHED:
        this.updateCrash(dt);
        break;
      default: {
        const target = { menu: CONFIG.MENU_SPEED, shop: CONFIG.SHOP_SPEED }[this.state] || 0;
        this.worldSpeed = damp(this.worldSpeed, target, 1.5, dt);
      }
    }

    const playing = this.state === STATE.PLAYING;
    const ds = this.worldSpeed * dt;
    this.odometer += ds;
    const camera = this.stage.camera;

    // world
    this.curve.update(this.odometer, ds, this.run.distance / 6000);
    this.structures.update(dt, this.odometer, {
      zoneAt: (d) => this.environment.zones.zoneAt(d).zone,
      playerSpeedKmh: this.worldSpeed * CONFIG.KMH_FACTOR,
    });
    this.weather.update(dt, camera, this.worldSpeed);
    this.dayNight.update(dt);
    this.dayNight.apply({ stage: this.stage, environment: this.environment, weather: this.weather }, dt);
    this.environment.update(dt, this.worldSpeed, this.odometer, camera, this.dayNight.lamps);
    this.environment.setWetness(this.weather.p.wet);

    // actors
    this.player.grip = this.weather.grip;
    this.player.braking = playing && this.brakeHeld;
    this.player.nitro = playing && this.run.nitroActive;
    this.spawner.update(dt, this.worldSpeed, {
      spawning: playing, distance: this.run.distance, playerLane: this.player.lane, playerX: this.player.x,
    });
    this.player.update(dt, this.worldSpeed, this.state === STATE.GARAGE ? 'garage' : 'drive');
    this.particles.update(dt, this.worldSpeed);
    this.speedLines.update(dt, this.worldSpeed * (this.player.nitro ? 1.3 : 1), playing);
    this.cameraRig.update(dt, this.cameraMode(), {
      x: this.player.x, car: this.player.car, speed: this.worldSpeed, nitro: this.player.nitro,
    });
    this.stage.followTarget(this.player.x);

    this.handleEvents(playing);
    this.updateAmbience(dt, playing);
    this.ui.updateWorldInfo(dt);
    this.stage.render();

    if (this.firstFrame) {
      this.firstFrame = false;
      this.ui.hideLoader();
    }
  }

  cameraMode() {
    switch (this.state) {
      case STATE.PLAYING:
      case STATE.CRASHED:
        return 'play';
      case STATE.GAME_OVER:
        return 'gameover';
      case STATE.GARAGE:
        return 'garage';
      case STATE.SHOP:
        return 'shop';
      default:
        return 'menu';
    }
  }

  // ============ Driving ============

  updateRun(dt) {
    const r = this.run;
    const phys = this.player.physics;
    const grip = this.weather.grip;
    r.time += dt;

    // --- target speed: grows over time (difficulty), reduced by damage ---
    const perf = 1 - ((100 - r.hp) / 100) * 0.15;
    let cap = Math.min(r.maxSpeed * perf, CONFIG.START_SPEED + r.time * CONFIG.SPEED_GAIN);

    // --- nitro ---
    const wantNitro = this.nitroHeld && r.nitro > 0.03 && r.nitroCooldown <= 0 && r.fuel > 0;
    if (wantNitro && !r.nitroActive) {
      r.nitroActive = true;
      this.audio.nitroBurst();
      this.cameraRig.shake(0.3);
      this.missions.report('nitroUses', 1);
    } else if (!wantNitro && r.nitroActive) {
      r.nitroActive = false;
      r.nitroCooldown = 1.0;
    }
    if (r.nitroActive) {
      r.nitro = Math.max(0, r.nitro - 0.28 * dt);
      cap *= CONFIG.NITRO_BOOST;
      if (Math.random() < 0.6) {
        this.particles.burst(_tmp.set(this.player.x, 0.4, this.player.hitLength / 2 + 0.6), {
          count: 1, colors: [0x3ad0ff, 0x9ff0ff], speed: [0.5, 1.5], up: 0.5, life: [0.15, 0.3], size: [0.1, 0.2], gravity: 0, world: 1,
        });
      }
    } else {
      r.nitroCooldown -= dt;
      r.nitro = Math.min(1, r.nitro + 0.03 * dt);
    }

    // --- throttle, brake, coasting ---
    let v = this.worldSpeed;
    if (this.brakeHeld) {
      v = Math.max(0, v - CONFIG.BRAKE_DECEL * grip * dt);
    } else if (r.fuel <= 0) {
      v = Math.max(0, v - 3 * dt);
    } else if (v < cap) {
      const shiftLoss = r.shiftTimer > 0 ? 0.35 : 1;
      const a = r.accel * (r.nitroActive ? 2.2 : 1) * (1 - 0.6 * (v / cap) ** 2) * shiftLoss;
      v = Math.min(cap, v + a * dt);
    } else {
      v = Math.max(cap, v - 5 * dt);
    }
    this.worldSpeed = v;

    // --- gearbox (used for sound and acceleration dips) ---
    let gear = 1;
    while (gear < GEARS.length - 1 && v > GEARS[gear]) gear++;
    if (gear > r.gear && !this.brakeHeld) {
      this.audio.gearShift();
      r.shiftTimer = 0.15;
    }
    r.gear = gear;
    r.rev = clamp((v - GEARS[gear - 1]) / (GEARS[gear] - GEARS[gear - 1] || 1), 0, 1);
    r.shiftTimer -= dt;

    // --- fuel: faster & nitro burn more; every car has its own economy ---
    const burn = 0.75 * phys.fuel * (0.35 + (v / 40) ** 1.5) * (r.nitroActive ? 2 : 1);
    r.fuel = Math.max(0, r.fuel - burn * dt);
    if (r.fuel < 20 && !r.lowFuelWarned) {
      r.lowFuelWarned = true;
      this.ui.toast('⛽ LOW FUEL - grab a fuel can or petrol pump!', 'warn');
    }
    if (r.fuel <= 0 && v < 1.5) {
      this.finishRun('OUT OF FUEL');
      return;
    }

    // --- progress & stats ---
    r.distance += v * dt;
    r.cleanDistance += v * dt;
    if (v * CONFIG.KMH_FACTOR > 150) r.fastTime += dt;
    if (this.dayNight.night > 0.6) r.nightTime += dt;
    if (this.weather.p.rain > 0.2) r.rainDistance += v * dt;
    r.topSpeed = Math.max(r.topSpeed, v);
    r.invuln -= dt;
    r.comboTimer -= dt;
    if (r.comboTimer <= 0) r.combo = 0;
    r.score = Math.floor(r.distance) + r.coins * CONFIG.COIN_SCORE + r.bonus;

    const level = Math.floor((v - CONFIG.START_SPEED) / 5);
    if (level > r.level) {
      r.level = level;
      this.ui.toast('SPEED UP!', 'info');
      this.audio.speedUp();
    }
    if (r.distance >= r.nextMilestone) {
      this.ui.toast(`${(r.nextMilestone / 1000).toLocaleString('en-US')} km!`, 'gold');
      r.nextMilestone += 1000;
    }

    // run missions are checked a few times per second
    this.missionTimer -= dt;
    if (this.missionTimer <= 0) {
      this.missionTimer = 0.3;
      this.missions.report('cleanDistance', r.cleanDistance);
      this.missions.report('fastTime', r.fastTime);
      this.missions.report('nightTime', r.nightTime);
      this.flushMissionToasts();
    }

    // smoke from a badly damaged car
    if (r.hp < 50 && Math.random() < (60 - r.hp) / 120) {
      this.particles.burst(_tmp.set(this.player.x, 1.0, -this.player.hitLength / 2 + 0.3), {
        count: 1, colors: [0x55565e, 0x2c2d33], speed: [0.2, 0.8], up: 1.6, life: [0.6, 1.2], size: [0.3, 0.6],
        gravity: -0.3, drag: 1, grow: true, world: 1,
      });
    }

    this.checkCollisions();
    if (this.state !== STATE.PLAYING) return;
    this.updatePolice(dt);
    if (this.state !== STATE.PLAYING) return;

    this.audio.updateEngine(v, { gear: r.gear, rev: r.rev, nitro: r.nitroActive, throttle: this.brakeHeld ? 0 : 1 });
    this.ui.updateHud(r, v, {
      limit: SPEED_LIMITS[this.environment.zone],
      police: this.police,
      braking: this.brakeHeld,
    });
  }

  /**
   * Axis-aligned box test: two rectangles overlap when they overlap
   * on BOTH the x axis (across the road) and z axis (along the road).
   * The player is always at z = 0. Also tracks near misses.
   */
  checkCollisions() {
    const p = this.player;
    for (const e of this.spawner.active) {
      if (e.collected) continue;
      const dx = Math.abs(e.x - p.x);
      const dz = Math.abs(e.z);
      if (e.kind === 'coin') {
        if (dx < 1.3 && dz < p.hitLength / 2 + 0.4) this.collectCoin(e);
        continue;
      }
      if (e.kind === 'pickup') {
        if (dx < 1.7 && dz < p.hitLength / 2 + e.len / 2) this.collectPickup(e);
        continue;
      }
      const overX = (e.width + p.hitWidth) / 2 - 0.15 - dx;
      const overZ = (e.len + p.hitLength) / 2 - 0.1 - dz;
      if (overX > 0 && overZ > 0) {
        if (!e.hit && this.run.invuln <= 0) {
          this.collide(e, overX, overZ);
          if (this.state !== STATE.PLAYING) return;
        }
        continue;
      }
      // near-miss tracking: smallest side gap while alongside
      if (e.kind === 'traffic' && !e.hit) {
        if (overZ > 0) {
          e.minGap = Math.min(e.minGap, -overX);
          e.alongside = true;
        } else if (e.alongside && e.z > 0) {
          e.alongside = false;
          if (e.minGap < 1.0 && !e.nearMissed) {
            e.nearMissed = true;
            this.nearMiss(e);
          } else if (e.minGap < 3.5) {
            this.audio.passBy((e.x - p.x) / 4, 0.5);
          }
        }
      }
    }
  }

  /** Non-fatal hits cost health; a head-on crash or 0 HP ends the run. */
  collide(e, overX, overZ) {
    const r = this.run;
    const phys = this.player.physics;
    const side = overX < overZ * 0.45; // you drove into it sideways
    let damage;
    let fatal = false;
    if (e.kind === 'traffic' && e.dir === -1 && !side) fatal = true;
    else if (e.kind === 'traffic') damage = side ? 22 : clamp((this.worldSpeed - e.speed) * 2, 25, 70);
    else damage = e.damage || 30;

    if (!fatal) damage *= phys.damage;
    if (fatal || r.hp - damage <= 0) {
      r.hp = 0;
      this.crash(e, fatal ? 'HEAD-ON COLLISION!' : 'CAR WRECKED!');
      return;
    }

    r.hp -= damage;
    r.invuln = 1.3;
    r.cleanDistance = 0;
    r.combo = 0;
    e.hit = true;
    this.player.setDamage(100 - r.hp);

    const at = _tmp.set((this.player.x + e.x) / 2, 0.7, side ? 0 : -this.player.hitLength / 2);
    this.particles.burst(at, {
      count: 35, colors: [0xffd27a, 0xff8a00, 0xffffff], speed: [4, 10], up: 3, life: [0.3, 0.8], size: [0.05, 0.1], gravity: 12, world: 0.5,
    });
    this.cameraRig.shake(0.6);
    this.audio.hit();
    this.ui.flash();
    this.ui.toast(`-${Math.round(damage)} HP`, 'warn');
    if (navigator.vibrate) navigator.vibrate(120);

    if (e.kind === 'obstacle' && !e.event) {
      // small obstacles get smashed out of the way
      e.collected = true;
      this.particles.burst(_tmp.set(e.x, 0.6, e.z), {
        count: 25, colors: [0xff6a00, 0xffffff, 0xa8743f, 0xc4c8d2], speed: [3, 8], up: 5, life: [0.8, 1.4], size: [0.1, 0.3], gravity: 14, world: 1,
      });
    }
    if (side) {
      this.player.bounceBack();
    } else {
      this.worldSpeed = e.kind === 'traffic' ? Math.max(0, e.speed - 4) : this.worldSpeed * 0.5;
      if (e.kind === 'obstacle' && e.event) {
        // shoved into a neighbouring lane away from the blockage
        const lanes = CONFIG.LANES.length;
        const target = this.player.prevLane !== e.lane ? this.player.prevLane : clamp(e.lane + (e.lane < lanes / 2 ? 1 : -1), 0, lanes - 1);
        this.player.prevLane = this.player.lane;
        this.player.lane = target;
      }
    }
  }

  nearMiss(e) {
    const r = this.run;
    const oncoming = e.dir === -1;
    r.combo = r.comboTimer > 0 ? r.combo + 1 : 1;
    r.comboTimer = 3;
    r.bestCombo = Math.max(r.bestCombo, r.combo);
    const bonus = CONFIG.NEAR_MISS_SCORE * r.combo * (oncoming ? 2 : 1);
    r.bonus += bonus;
    r.coins += oncoming ? 2 : 1;
    r.nitro = Math.min(1, r.nitro + 0.12);
    r.nearMisses++;
    if (oncoming) r.oncomingMisses++;
    this.missions.report('nearMisses', r.nearMisses);
    this.missions.report('oncomingMisses', r.oncomingMisses);
    this.missions.report('bestCombo', r.bestCombo);
    this.ui.nearMiss(r.combo, bonus, oncoming);
    this.audio.nearMiss(r.combo);
    this.audio.passBy((e.x - this.player.x) / 3, 1);
  }

  collectCoin(e) {
    e.collected = true; // the spawner recycles it next update
    this.run.coins++;
    this.particles.burst(_tmp.set(e.x, 1, e.z), {
      count: 14, colors: [0xffd84a, 0xfff2b0, 0xffb300], speed: [2, 5], up: 2.5,
      life: [0.35, 0.65], size: [0.07, 0.14], gravity: 6, world: 1,
    });
    this.audio.coin();
    this.ui.pulseCoins();
  }

  collectPickup(e) {
    e.collected = true;
    const r = this.run;
    const colors = { fuel: 0xff5040, repair: 0x40a0ff, nitro: 0x00e5ff, station: 0x40ff80 }[e.pickup];
    this.particles.burst(_tmp.set(e.x, 1, e.z), {
      count: 24, colors: [colors, 0xffffff], speed: [2, 6], up: 3, life: [0.4, 0.8], size: [0.08, 0.16], gravity: 5, world: 1,
    });
    this.audio.pickup();
    if (e.pickup === 'fuel') {
      r.fuel = Math.min(100, r.fuel + 40);
      r.lowFuelWarned = false;
      this.ui.toast('⛽ +40 FUEL', 'gold');
    } else if (e.pickup === 'station') {
      r.fuel = 100;
      r.lowFuelWarned = false;
      this.missions.report('refuels', 1);
      this.ui.toast('⛽ PETROL PUMP - TANK FULL!', 'gold');
    } else if (e.pickup === 'repair') {
      r.hp = Math.min(100, r.hp + 35);
      this.player.setDamage(100 - r.hp);
      this.ui.toast('🔧 +35 HEALTH', 'info');
    } else if (e.pickup === 'nitro') {
      r.nitro = Math.min(1, r.nitro + 0.5);
      this.ui.toast('⚡ +NITRO', 'info');
    }
  }

  updatePolice(dt) {
    if (!this.police.active) return;
    const result = this.police.update(dt, this.worldSpeed, this.player.x);
    this.audio.setSirenDistance(this.police.closeness);
    if (result === 'busted') {
      this.audio.busted();
      this.ui.setPolice(false);
      this.finishRun('BUSTED!');
    } else if (result === 'escaped') {
      this.audio.stopSiren();
      this.run.coins += 50;
      this.missions.report('escapes', 1);
      this.ui.setPolice(false);
      this.ui.toast('🚓 YOU ESCAPED THE POLICE! +50 COINS', 'gold');
    }
  }

  updateCrash(dt) {
    this.worldSpeed = damp(this.worldSpeed, 0, 3.5, dt);
    if (this.player.crashed) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.09;
        this.particles.burst(_tmp.set(this.player.x, 0.9, 0), {
          count: 2, colors: [0x4a4b52, 0x6a6b72], speed: [0.2, 0.8], up: 1.8,
          life: [1, 1.8], size: [0.35, 0.7], gravity: -0.4, drag: 1, grow: true,
        });
      }
    }
    this.crashTimer -= dt;
    if (this.crashTimer <= 0) {
      this.state = STATE.GAME_OVER;
      this.police.reset();
      this.applyCameraView();
      this.ui.setHud(false);
      this.ui.showGameOver(this.lastResult);
    }
  }

  // ============ Events from the world ============

  handleEvents(playing) {
    for (const ev of this.spawner.events) {
      if (ev.type === 'honk') this.audio.honk(ev.x / 6);
      if (ev.type === 'event' && playing) this.ui.toast(EVENT_TOASTS[ev.id], 'warn');
    }
    this.spawner.events.length = 0;

    for (const ev of this.environment.events) {
      // a petrol pump beside the road: its lane becomes a refuel lane
      if (ev.type === 'petrol' && playing && ev.z < -80) {
        this.spawner.spawnPickup(this.worldSpeed, 'station', ev.side < 0 ? 0 : CONFIG.LANES.length - 1, ev.z);
      }
    }
    this.environment.events.length = 0;

    for (const ev of this.structures.events) {
      if (ev.type === 'speedCamera' && playing) {
        if (ev.speed > ev.limit && !this.police.active) {
          this.police.start(this.player.x);
          this.audio.startSiren();
          this.ui.setPolice(true);
          this.ui.toast(`📸 CAUGHT SPEEDING: ${Math.round(ev.speed)} km/h!`, 'warn');
        } else if (ev.speed <= ev.limit) {
          this.ui.toast('📸 Speed camera: OK', 'info');
        }
      }
    }
    this.structures.events.length = 0;

    for (const ev of this.weather.events) {
      if (ev.type === 'thunder') {
        this.audio.thunder();
        this.ui.flash('lightning');
      }
      if (ev.type === 'weather') {
        this.ui.toast(`${WEATHER[ev.state].icon} ${WEATHER[ev.state].label}`, 'info');
        this.ui.updateControls();
      }
    }
    this.weather.events.length = 0;

    // zone announcements
    if (this.environment.zone !== this.lastZone) {
      if (this.lastZone && playing) this.ui.toast(`ENTERING ${ZONES[this.environment.zone].label.toUpperCase()}`, 'zone');
      this.lastZone = this.environment.zone;
    }
  }

  updateAmbience(dt, playing) {
    this.audio.setAmbience({ speed: this.worldSpeed, rain: this.weather.p.rain, driving: playing });
    this.ambienceTimer -= dt;
    if (this.ambienceTimer <= 0 && this.audio.ctx && (playing || this.state === STATE.MENU)) {
      this.ambienceTimer = 2 + Math.random() * 4;
      if (this.dayNight.night > 0.6) this.audio.crickets();
      else if (this.environment.zone === 'countryside' && this.weather.p.rain < 0.2) this.audio.birds();
    }
  }

  flushMissionToasts() {
    for (const m of this.missions.completed) {
      this.ui.toast(`✅ MISSION: ${m.text} +${m.reward}`, 'gold');
      this.audio.mission();
    }
    if (this.missions.completed.length) {
      this.missions.completed.length = 0;
      this.save.persist();
      this.ui.refreshWallet();
    }
  }
}
