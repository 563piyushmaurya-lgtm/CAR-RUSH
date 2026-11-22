import * as THREE from 'three';
import { CONFIG } from '../data/config.js';
import { TRAFFIC_TYPES, TRAFFIC_COLORS } from '../data/cars.js';
import {
  buildTrafficVehicle, buildCow, buildWorker, buildWarningTriangle, updateVehicleMaterials,
} from '../models/VehicleBuilder.js';
import { buildObstacle, OBSTACLE_TYPES, updateObstacleMaterials } from '../models/ObstacleBuilder.js';
import { buildCoin, buildPickup } from '../models/CoinBuilder.js';
import { lerp, rand, randInt, pick, shuffle, weightedPick, clamp, damp } from '../utils/math.js';

// =============================================================
// Spawner - creates, moves, recycles and DRIVES everything on the road:
// two-way traffic (with AI), obstacles, road events, coins & pickups.
//
// OBJECT POOLING: objects that leave the screen are hidden and reused.
//
// TRAFFIC AI: every vehicle keeps a safe gap to the vehicle ahead in
// its lane, brakes smoothly, randomly changes its cruising speed and
// overtakes slower traffic by changing lanes on its own side.
//
// FAIRNESS: before anything is placed (or a vehicle changes lane) we
// simulate the next few seconds on a lanes x time grid and check that
// the player can still reach a free lane at every moment, moving at
// most one lane per step. If not, the placement is rejected.
// =============================================================

const LANES = CONFIG.LANES;
const N = LANES.length;
const PLAYER_LEN = 4.6;
const PLAYER_W = 2.0;
const PAD = 0.35; // seconds of margin around each blocker
const STEP = 0.25; // seconds per simulation step (≈ one lane change)
const HORIZON = 7; // seconds simulated

const sameSideLanes = (dir) => LANES.map((_, i) => i).filter((i) => CONFIG.LANE_DIRECTION[i] === dir);

const EVENT_TYPES = [
  { id: 'construction', weight: 20, len: 26, width: 2.7 },
  { id: 'breakdown', weight: 22, len: 15, width: 2.5 },
  { id: 'accident', weight: 14, len: 13, width: 2.7 },
  { id: 'cow', weight: 22, len: 1.2, width: 1.9 },
  { id: 'checkpoint', weight: 14, len: 3, width: 2.7 },
];

export class Spawner {
  constructor(scene) {
    this.scene = scene;
    this.active = [];
    this.pools = new Map();
    this.time = 0;
    this.playerLane = CONFIG.START_LANE;
    this.playerX = LANES[CONFIG.START_LANE];
    this.events = []; // sound/feedback events for the Game (honks, passes)
    this.reset();
  }

  reset() {
    this.clear();
    this.waveDistance = CONFIG.FIRST_SPAWN_DISTANCE;
    this.coinDistance = 30;
    this.pickupDistance = 400;
    this.eventDistance = 450;
  }

  clear() {
    for (const e of this.active) this.release(e);
    this.active.length = 0;
    this.events.length = 0;
  }

  // ---------- pooling ----------
  take(key, create) {
    const pool = this.pools.get(key);
    const obj = pool && pool.length ? pool.pop() : create();
    this.scene.add(obj);
    return obj;
  }

  release(e) {
    this.scene.remove(e.obj);
    if (!this.pools.has(e.key)) this.pools.set(e.key, []);
    this.pools.get(e.key).push(e.obj);
  }

  isBlocker(e) {
    return (e.kind === 'traffic' || e.kind === 'obstacle') && !e.collected;
  }

  // ============ per frame ============
  update(dt, worldSpeed, { spawning, distance, playerLane, playerX }) {
    this.time += dt;
    this.playerLane = playerLane;
    this.playerX = playerX;
    updateObstacleMaterials(this.time);
    updateVehicleMaterials(this.time);

    for (const e of this.active) {
      if (e.kind === 'traffic') this.driveAI(e, dt, worldSpeed);
      else if (e.animal) this.animalAI(e, dt, worldSpeed);
    }

    for (let i = this.active.length - 1; i >= 0; i--) {
      const e = this.active[i];
      e.z += (worldSpeed - e.speed) * dt; // relative motion
      e.obj.position.set(e.x, e.y || 0, e.z);
      if (e.kind === 'coin' || e.kind === 'pickup') {
        e.obj.rotation.y += dt * (e.kind === 'coin' ? 3.2 : 1.6);
        e.obj.position.y = 0.95 + Math.sin(this.time * 4 + e.phase) * 0.12;
      }
      const gone = e.collected || e.z - e.len / 2 > CONFIG.DESPAWN_Z || e.z < -700;
      if (gone) {
        this.release(e);
        this.active.splice(i, 1);
      }
    }

    if (!spawning) return;
    const ws = Math.max(worldSpeed, 12);
    const d = clamp(distance / 5000, 0, 1); // difficulty 0..1

    this.waveDistance -= worldSpeed * dt;
    if (this.waveDistance <= 0) {
      this.spawnWave(ws, d);
      this.waveDistance = lerp(34, 13, d) + Math.random() * lerp(16, 8, d);
    }
    this.coinDistance -= worldSpeed * dt;
    if (this.coinDistance <= 0) {
      this.spawnCoinLine(ws);
      this.coinDistance = rand(38, 70);
    }
    this.pickupDistance -= worldSpeed * dt;
    if (this.pickupDistance <= 0) {
      this.spawnPickup(ws, pick(['fuel', 'fuel', 'repair', 'nitro']));
      this.pickupDistance = rand(380, 620);
    }
    this.eventDistance -= worldSpeed * dt;
    if (this.eventDistance <= 0) {
      this.spawnEvent(ws, d);
      this.eventDistance = lerp(700, 320, d) + rand(0, 250);
    }
  }

  // ============ traffic AI ============
  driveAI(e, dt, ws) {
    const dir = e.dir;
    const v = dir * e.speed; // speed along its own travel direction (>= 0)
    const p = -dir * e.z; // position along its own travel direction

    // --- find the closest thing ahead in the same lane ---
    let gap = Infinity;
    let leaderV = 0;
    let leaderIsPlayer = false;
    for (const o of this.active) {
      if (o === e || !this.isBlocker(o) || o.lane !== e.lane) continue;
      if (o.dir && o.dir !== dir) continue; // opposite traffic never shares a lane
      const g = (-dir * o.z - p) - (o.len + e.len) / 2;
      if (g > -1 && g < gap) {
        gap = g;
        leaderV = o.dir ? dir * o.speed : 0;
        leaderIsPlayer = false;
      }
    }
    // same-direction traffic behind the player must not rear-end it
    if (dir === 1 && e.z > 0 && Math.abs(this.playerX - e.x) < 2.2) {
      const g = e.z - (PLAYER_LEN + e.len) / 2;
      if (g < gap) {
        gap = g;
        leaderV = ws;
        leaderIsPlayer = true;
      }
    }

    const safeGap = 7 + v * 0.8;
    let target = e.desired;
    if (gap < safeGap * 2.5) target = Math.min(target, Math.max(0, leaderV + (gap - safeGap) * 0.6));
    const nv = v < target ? Math.min(target, v + 2.5 * dt) : Math.max(target, v - 9 * dt);
    e.speed = dir * nv;
    e.braking = nv < v - 0.05;

    if (leaderIsPlayer && gap < safeGap && !e.honked) {
      e.honked = true;
      this.events.push({ type: 'honk', x: e.x - this.playerX });
    }
    // oncoming driver flashes & honks at a player in its lane
    if (dir === -1 && !e.honked && e.z > -110 && e.z < -45 && Math.abs(this.playerX - e.x) < 1.6) {
      e.honked = true;
      this.events.push({ type: 'honk', x: e.x - this.playerX, oncoming: true });
    }

    // --- personality: change cruising speed now and then (only far away) ---
    e.moodTimer -= dt;
    const far = e.z < -75 || e.z > 25;
    if (e.moodTimer <= 0 && far) {
      e.desired = e.baseSpeed * rand(0.8, 1.12);
      e.moodTimer = rand(4, 9);
    }

    // --- overtaking: switch to the other lane on its own side ---
    e.laneCooldown -= dt;
    if (far && e.laneCooldown <= 0 && gap < safeGap * 2.2 && e.desired - leaderV > 2.5) {
      const options = sameSideLanes(dir).filter((l) => l !== e.lane);
      for (const target of options) {
        if (this.tryLaneChange(e, target, ws)) break;
      }
      e.laneCooldown = rand(3, 6);
    }

    // smooth lateral motion + a little yaw while changing lanes
    const tx = LANES[e.lane];
    e.x = damp(e.x, tx, 1.5, dt);
    e.obj.rotation.y = (dir === -1 ? Math.PI : 0) - dir * (tx - e.x) * 0.06;
  }

  tryLaneChange(e, lane, ws) {
    for (const o of this.active) {
      if (o === e || o.lane !== lane || o.kind === 'coin' || o.kind === 'pickup') continue;
      if (Math.abs(o.z - e.z) < (o.len + e.len) / 2 + 14) return false;
    }
    // simulate with the vehicle covering BOTH lanes while it moves across
    const ghost = { ...e, laneSet: [e.lane, lane] };
    if (!this.passable(ghost, ws, e)) return false;
    e.lane = lane;
    return true;
  }

  animalAI(e, dt, ws) {
    // cows amble slowly across lanes when far from the player
    e.crossTimer -= dt;
    if (e.crossTimer <= 0 && e.z < -80) {
      const next = clamp(e.lane + (Math.random() < 0.5 ? -1 : 1), 0, N - 1);
      if (next !== e.lane) this.tryLaneChange(e, next, ws);
      e.crossTimer = rand(2.5, 5);
    }
    const tx = LANES[e.lane];
    const moving = Math.abs(tx - e.x) > 0.05;
    e.x = damp(e.x, tx, 0.7, dt);
    const cow = e.obj.children[0];
    cow.rotation.y = tx < e.x ? Math.PI / 2 : -Math.PI / 2;
    cow.position.y = moving ? Math.abs(Math.sin(this.time * 6)) * 0.05 : 0;
  }

  // ============ fairness ============
  interval(e, ws) {
    const r = ws - e.speed;
    if (r <= 0.3) return null; // moving away - never reaches the player
    const t0 = (-PLAYER_LEN / 2 - (e.z + e.len / 2)) / r;
    const t1 = (PLAYER_LEN / 2 - (e.z - e.len / 2)) / r;
    return [t0 - PAD, t1 + PAD];
  }

  lanesOf(e) {
    if (e.laneSet) return e.laneSet;
    const out = [];
    for (let l = 0; l < N; l++) {
      if (Math.abs(LANES[l] - e.x) < (e.width + PLAYER_W) / 2 - 0.25) out.push(l);
    }
    if (!out.includes(e.lane)) out.push(e.lane);
    return out;
  }

  /** Can the player still find a way through if `extra` is added (and `exclude` ignored)? */
  passable(extra, ws, exclude = null) {
    const steps = Math.ceil(HORIZON / STEP);
    const grid = Array.from({ length: N }, () => new Uint8Array(steps + 1));
    const mark = (e) => {
      const iv = this.interval(e, ws);
      if (!iv || iv[1] < 0 || iv[0] > HORIZON) return;
      const s0 = Math.max(0, Math.floor(iv[0] / STEP));
      const s1 = Math.min(steps, Math.ceil(iv[1] / STEP));
      for (const l of this.lanesOf(e)) for (let s = s0; s <= s1; s++) grid[l][s] = 1;
    };
    for (const e of this.active) if (e !== exclude && this.isBlocker(e)) mark(e);
    if (extra) mark(extra);

    let reach = new Uint8Array(N);
    reach[this.playerLane] = 1;
    for (let s = 1; s <= steps; s++) {
      const next = new Uint8Array(N);
      let any = false;
      for (let l = 0; l < N; l++) {
        if (!reach[l]) continue;
        for (let m = l - 1; m <= l + 1; m++) {
          if (m < 0 || m >= N || grid[m][s]) continue;
          if (m !== l && grid[m][s - 1]) continue; // the lane must be free while moving into it
          next[m] = 1;
          any = true;
        }
      }
      if (!any) return false;
      reach = next;
    }
    return true;
  }

  /** Same-lane spacing at spawn time. */
  laneClear(lane, z, len, margin = 12) {
    return !this.active.some((o) => o.lane === lane && !o.collected && Math.abs(o.z - z) < (o.len + len) / 2 + margin);
  }

  // ============ spawning ============
  spawnWave(ws, d) {
    const count = Math.random() < lerp(0.25, 0.7, d) ? 2 : 1;
    let placed = 0;
    for (let tries = 0; tries < 6 && placed < count; tries++) {
      const roll = Math.random();
      let c;
      if (roll < 0.45) c = this.trafficCandidate(1, ws);
      else if (roll < lerp(0.85, 0.8, d)) c = this.trafficCandidate(-1, ws);
      else c = this.obstacleCandidate();
      if (this.place(c, ws)) placed++;
    }
  }

  place(c, ws) {
    if (!this.laneClear(c.lane, c.z, c.len)) return false;
    if ((c.kind === 'traffic' || c.kind === 'obstacle') && !this.passable(c, ws)) return false;
    this.spawn(c);
    return true;
  }

  trafficCandidate(dir, ws) {
    const type = weightedPick(TRAFFIC_TYPES);
    const lane = pick(sameSideLanes(dir));
    let base = rand(type.speed[0], type.speed[1]);
    if (dir === 1) base = Math.min(base, ws * 0.62); // you are always faster than your own traffic
    const len = type.len;
    const z = (dir === 1 ? CONFIG.SPAWN_Z : CONFIG.SPAWN_Z_ONCOMING) - len / 2;
    return {
      kind: 'traffic', key: `traffic:${type.id}`, type, lane, x: LANES[lane], z, len, width: type.width,
      dir, speed: dir * base, baseSpeed: base, desired: base, create: () => buildTrafficVehicle(type),
    };
  }

  obstacleCandidate() {
    const type = weightedPick(OBSTACLE_TYPES);
    const lane = randInt(0, N - 1);
    return {
      kind: 'obstacle', key: `obstacle:${type.id}`, lane, x: LANES[lane], z: CONFIG.SPAWN_Z - type.len / 2,
      len: type.len, width: type.width, speed: 0, dir: 0, damage: type.id === 'cones' ? 18 : 32,
      create: () => buildObstacle(type),
    };
  }

  spawnCoinLine(ws) {
    const count = randInt(5, 10);
    const spacing = 2.6;
    const len = (count - 1) * spacing + 1;
    for (const lane of shuffle(LANES.map((_, i) => i))) {
      const zc = CONFIG.SPAWN_Z - len / 2;
      if (!this.laneClear(lane, zc, len, 6)) continue;
      // don't lay coins right behind slower same-direction traffic in that lane
      for (let i = 0; i < count; i++) {
        this.spawn({
          kind: 'coin', key: 'coin', lane, x: LANES[lane], len: 1, width: 1, speed: 0, dir: 0,
          z: CONFIG.SPAWN_Z - i * spacing, phase: i * 0.5, create: buildCoin,
        });
      }
      return;
    }
  }

  spawnPickup(ws, type, lane = null, z = CONFIG.SPAWN_Z) {
    const lanes = lane === null ? shuffle(LANES.map((_, i) => i)) : [lane];
    for (const l of lanes) {
      if (!this.laneClear(l, z, 2, 6)) continue;
      this.spawn({
        kind: 'pickup', pickup: type, key: `pickup:${type}`, lane: l, x: LANES[l], z, len: type === 'station' ? 4 : 1.4,
        width: 1.6, speed: 0, dir: 0, phase: 0, create: () => buildPickup(type),
      });
      return true;
    }
    return false;
  }

  // ============ road events ============
  spawnEvent(ws, d) {
    const type = weightedPick(EVENT_TYPES);
    for (const lane of shuffle(LANES.map((_, i) => i))) {
      const c = this.eventCandidate(type, lane);
      if (this.place(c, ws)) {
        this.events.push({ type: 'event', id: type.id });
        return;
      }
    }
  }

  eventCandidate(type, lane) {
    const side = CONFIG.LANE_DIRECTION[lane]; // which way vehicles in this lane face
    return {
      // checkpoints park a police car on the nearest shoulder, so they depend on the lane
      kind: 'obstacle', key: `event:${type.id}:${side}:${type.id === 'checkpoint' ? lane : ''}`, event: type.id, lane, x: LANES[lane],
      z: CONFIG.SPAWN_Z - type.len / 2, len: type.len, width: type.width, speed: 0, dir: 0,
      animal: type.id === 'cow', crossTimer: rand(1, 3), damage: type.id === 'cow' ? 40 : 45,
      create: () => this.buildEvent(type, side, lane),
    };
  }

  buildEvent(type, side, lane) {
    const g = new THREE.Group();
    const add = (obj, x, z, ry = 0) => {
      obj.position.set(x, 0, z);
      obj.rotation.y = ry;
      g.add(obj);
      return obj;
    };
    const cone = OBSTACLE_TYPES.find((t) => t.id === 'cones');
    const L = type.len;
    switch (type.id) {
      case 'construction': {
        // lane closure: taper of cones, sign, barrier, workers
        add(buildObstacle(OBSTACLE_TYPES.find((t) => t.id === 'roadblock')), 0, L / 2 - 0.5);
        add(buildObstacle(cone), 0, L / 2 - 4);
        for (let z = -L / 2; z < L / 2 - 6; z += 5) add(buildObstacle(cone), 0, z);
        add(buildWorker(), -0.6, 2, 0.4);
        add(buildWorker(), 0.7, -5, -2.2);
        add(buildObstacle(OBSTACLE_TYPES.find((t) => t.id === 'crates')), 0.1, -L / 2 + 3);
        break;
      }
      case 'breakdown': {
        const t = weightedPick(TRAFFIC_TYPES.filter((v) => v.len > 4));
        const v = add(buildTrafficVehicle(t), 0, side === 1 ? -L / 2 + t.len / 2 : L / 2 - t.len / 2, side === 1 ? 0 : Math.PI);
        v.userData.setPaint(pick(TRAFFIC_COLORS), pick(TRAFFIC_COLORS));
        const amber = buildObstacle(OBSTACLE_TYPES.find((o) => o.id === 'barrier'));
        amber.scale.set(0.5, 0.5, 0.5);
        add(buildWarningTriangle(), 0, side === 1 ? L / 2 - 1 : -L / 2 + 1);
        add(amber, 0, side === 1 ? L / 2 - 3 : -L / 2 + 3);
        break;
      }
      case 'accident': {
        const a = add(buildTrafficVehicle(TRAFFIC_TYPES[0]), -0.3, -3, 0.5);
        a.userData.setPaint(pick(TRAFFIC_COLORS));
        const b = add(buildTrafficVehicle(TRAFFIC_TYPES[2]), 0.3, 3, -2.6);
        b.userData.setPaint(pick(TRAFFIC_COLORS));
        add(buildObstacle(cone), 0, L / 2 - 0.5);
        add(buildWorker(), 1.0, 0, 1.2);
        break;
      }
      case 'cow':
        return buildCow();
      case 'checkpoint': {
        add(buildObstacle(OBSTACLE_TYPES.find((t) => t.id === 'roadblock')), 0, 0);
        const police = add(buildTrafficVehicle({ id: 'police', builder: 'police' }), 0, -6, side === 1 ? 0.3 : Math.PI - 0.3);
        police.userData.setPaint('#f4f6fa', '#1238a8');
        const shoulder = Math.sign(LANES[lane]) * 7.4 - LANES[lane];
        police.position.x = shoulder;
        add(buildWorker(), shoulder * 0.6, 1);
        break;
      }
      default:
    }
    return g;
  }

  spawn(c) {
    const obj = this.take(c.key, c.create);
    obj.position.set(c.x, 0, c.z);
    obj.rotation.set(0, c.dir === -1 ? Math.PI : 0, 0);
    if (c.kind === 'traffic') {
      const bus = c.type.builder === 'bus' || c.type.builder === 'truck';
      obj.userData.setPaint(pick(TRAFFIC_COLORS), bus ? pick(['#ffcc00', '#e8172e', '#11a84a', '#1d4fd6']) : undefined);
    }
    this.active.push({
      ...c, obj, create: undefined, collected: false, hit: false,
      moodTimer: rand(3, 8), laneCooldown: rand(2, 5), minGap: Infinity, honked: false,
    });
  }
}
