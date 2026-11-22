// =============================================================
// Car data. This is "data-driven design": every car is just an
// object here. To add a new car, copy one entry and change values -
// the garage, shop and 3D builder pick it up automatically.
//
// All brands below are fictional and original to CAR RUSH.
//
// design: numbers used by CarBuilder to shape the car's 3D body.
//   len / width      size of the car
//   clearance        gap between road and body
//   noseH / h / tailH  height of the nose, the belt line and the tail
//   cabin            where the glass cabin starts/ends (+ = towards front)
//   spoiler          'none' | 'lip' | 'wing' | 'big'
//   extras           decoration pieces (see CarBuilder.js)
// =============================================================

export const STARTER_CAR_ID = 'voltra-spark';

export const PAINT_COLORS = [
  { name: 'Neon Cyan', hex: '#00e5ff' },
  { name: 'Racing Red', hex: '#ff2e4d' },
  { name: 'Sunburst Orange', hex: '#ff8a00' },
  { name: 'Solar Yellow', hex: '#ffd500' },
  { name: 'Jungle Green', hex: '#2fae62' },
  { name: 'Volt Lime', hex: '#a6ff3a' },
  { name: 'Royal Blue', hex: '#2f6bff' },
  { name: 'Ultra Violet', hex: '#9b5cff' },
  { name: 'Hot Pink', hex: '#ff3fa4' },
  { name: 'Pearl White', hex: '#f2f4f8' },
  { name: 'Gunmetal', hex: '#4a5160' },
  { name: 'Midnight Black', hex: '#16181d' },
  { name: 'Liquid Gold', hex: '#d4a640' },
];

export const CARS = [
  {
    id: 'voltra-spark',
    brand: 'VOLTRA',
    model: 'Spark',
    price: 0,
    color: '#00e5ff',
    accent: '#ff3d8b',
    tagline: 'A nimble electric starter with a hungry spirit.',
    stats: { speed: 4, handling: 6, accel: 5 },
    design: {
      len: 4.2, width: 1.9, clearance: 0.3, noseH: 0.62, h: 0.92, tailH: 0.9,
      cabin: { front: 0.55, roofFront: -0.05, roofRear: -0.8, rear: -1.45, roofH: 0.48 },
      wheelR: 0.36, wheelW: 0.32, axle: 0.82, spoiler: 'lip', extras: ['sideStripe'],
    },
  },
  {
    id: 'nimbus-zephyr',
    brand: 'NIMBUS',
    model: 'Zephyr',
    price: 150,
    color: '#f2f4f8',
    accent: '#2f6bff',
    tagline: 'Smooth grand tourer that glides between lanes.',
    stats: { speed: 5, handling: 7, accel: 5 },
    design: {
      len: 4.5, width: 1.9, clearance: 0.28, noseH: 0.66, h: 0.95, tailH: 0.93,
      cabin: { front: 0.5, roofFront: -0.1, roofRear: -1.0, rear: -1.7, roofH: 0.5 },
      wheelR: 0.37, wheelW: 0.32, axle: 0.85, spoiler: 'none', extras: ['chromeLine', 'stripe'],
    },
  },
  {
    id: 'krag-bullhorn',
    brand: 'KRAG MOTORS',
    model: 'Bullhorn',
    price: 300,
    color: '#ff8a00',
    accent: '#16181d',
    tagline: 'Old-school muscle. Loud, proud and quick off the line.',
    stats: { speed: 6, handling: 4, accel: 8 },
    design: {
      len: 4.7, width: 2.0, clearance: 0.3, noseH: 0.82, h: 1.0, tailH: 0.98,
      cabin: { front: 0.1, roofFront: -0.45, roofRear: -1.2, rear: -1.75, roofH: 0.5 },
      wheelR: 0.4, wheelW: 0.36, axle: 0.9, spoiler: 'lip', extras: ['hoodScoop', 'twinStripe'],
    },
  },
  {
    id: 'ferrox-ridgeback',
    brand: 'FERROX',
    model: 'Ridgeback',
    price: 500,
    color: '#2fae62',
    accent: '#ffd500',
    tagline: 'Rugged off-roader with a roof light bar.',
    stats: { speed: 5, handling: 5, accel: 6 },
    design: {
      len: 4.4, width: 2.05, clearance: 0.45, noseH: 1.0, h: 1.15, tailH: 1.15,
      cabin: { front: 0.55, roofFront: 0.25, roofRear: -1.75, rear: -1.95, roofH: 0.68 },
      wheelR: 0.48, wheelW: 0.42, axle: 0.85, spoiler: 'none', extras: ['roofRack', 'lightbar', 'bullbar'],
    },
  },
  {
    id: 'aurex-phantom',
    brand: 'AUREX',
    model: 'Phantom',
    price: 800,
    color: '#9b5cff',
    accent: '#d4a640',
    tagline: 'Luxury cruiser with gold trim and silent power.',
    stats: { speed: 7, handling: 6, accel: 6 },
    design: {
      len: 4.9, width: 1.95, clearance: 0.3, noseH: 0.7, h: 1.0, tailH: 0.96,
      cabin: { front: 0.45, roofFront: -0.25, roofRear: -1.25, rear: -2.0, roofH: 0.52 },
      wheelR: 0.39, wheelW: 0.34, axle: 0.95, spoiler: 'none', extras: ['chromeLine', 'sideStripe'],
    },
  },
  {
    id: 'vantor-blitz',
    brand: 'VANTOR',
    model: 'Blitz GT',
    price: 1200,
    color: '#ff2e4d',
    accent: '#f2f4f8',
    tagline: 'Track-bred racer with a towering rear wing.',
    stats: { speed: 8, handling: 8, accel: 7 },
    design: {
      len: 4.4, width: 1.95, clearance: 0.25, noseH: 0.52, h: 0.85, tailH: 0.88,
      cabin: { front: 0.35, roofFront: -0.25, roofRear: -0.95, rear: -1.55, roofH: 0.45 },
      wheelR: 0.37, wheelW: 0.36, axle: 0.82, spoiler: 'big', extras: ['stripe', 'sideVents'],
    },
  },
  {
    id: 'solace-mirage',
    brand: 'SOLACE',
    model: 'Mirage',
    price: 1800,
    color: '#ffd500',
    accent: '#16181d',
    tagline: 'Razor-sharp wedge that slices through traffic.',
    stats: { speed: 8, handling: 9, accel: 8 },
    design: {
      len: 4.5, width: 2.0, clearance: 0.24, noseH: 0.42, h: 0.8, tailH: 0.9,
      cabin: { front: 0.7, roofFront: -0.2, roofRear: -0.7, rear: -1.4, roofH: 0.42 },
      wheelR: 0.37, wheelW: 0.36, axle: 0.85, spoiler: 'wing', extras: ['fins', 'sideVents'],
    },
  },
  {
    id: 'nova-eclipse',
    brand: 'NOVA',
    model: 'Eclipse X',
    price: 2500,
    color: '#16181d',
    accent: '#00e5ff',
    tagline: 'The ultimate hypercar. Neon underglow included.',
    stats: { speed: 10, handling: 9, accel: 10 },
    design: {
      len: 4.7, width: 2.05, clearance: 0.22, noseH: 0.4, h: 0.78, tailH: 0.86,
      cabin: { front: 0.6, roofFront: -0.3, roofRear: -0.85, rear: -1.6, roofH: 0.42 },
      wheelR: 0.38, wheelW: 0.38, axle: 0.88, spoiler: 'big', extras: ['fins', 'neonUnder', 'stripe'],
    },
  },
];

// ---------- Driving feel ----------
// Each car belongs to a class with its own physics personality.
//   mass         heavier = slower to change lanes, more stable, rolls more
//   steer        lane-change responsiveness
//   highSpeedSteer  how much steering softens at high speed (1 = none)
//   roll         body lean in lane changes and curves
//   fuel         fuel used per km (lower = better economy)
//   damage       how much collision damage the body absorbs (1 = normal)
export const CAR_CLASSES = {
  compact: { label: 'Compact EV', mass: 1.0, steer: 1.0, highSpeedSteer: 0.85, roll: 1.0, fuel: 0.8, damage: 1.0 },
  gt: { label: 'Grand Tourer', mass: 1.15, steer: 1.0, highSpeedSteer: 0.9, roll: 0.8, fuel: 1.0, damage: 0.95 },
  muscle: { label: 'Muscle', mass: 1.3, steer: 0.85, highSpeedSteer: 0.8, roll: 1.2, fuel: 1.4, damage: 0.85 },
  suv: { label: 'Heavy SUV', mass: 1.7, steer: 0.72, highSpeedSteer: 0.85, roll: 1.6, fuel: 1.3, damage: 0.7 },
  luxury: { label: 'Luxury', mass: 1.5, steer: 0.85, highSpeedSteer: 0.95, roll: 0.7, fuel: 1.2, damage: 0.8 },
  track: { label: 'Track Racer', mass: 1.0, steer: 1.2, highSpeedSteer: 0.95, roll: 0.6, fuel: 1.2, damage: 1.1 },
  supercar: { label: 'Supercar', mass: 0.95, steer: 1.35, highSpeedSteer: 0.75, roll: 0.55, fuel: 1.5, damage: 1.15 },
  hyper: { label: 'Hypercar', mass: 1.0, steer: 1.3, highSpeedSteer: 0.9, roll: 0.5, fuel: 1.6, damage: 1.0 },
};

const CLASS_OF = {
  'voltra-spark': 'compact',
  'nimbus-zephyr': 'gt',
  'krag-bullhorn': 'muscle',
  'ferrox-ridgeback': 'suv',
  'aurex-phantom': 'luxury',
  'vantor-blitz': 'track',
  'solace-mirage': 'supercar',
  'nova-eclipse': 'hyper',
};
// visual style per class: body roundness (superellipse n), wheel design, black roof
const LOOK = {
  compact: { round: 3.4, wheelStyle: 'multi' },
  gt: { round: 3.4, wheelStyle: 'turbine' },
  muscle: { round: 4.4, wheelStyle: 'sport5', roofBlack: true },
  suv: { round: 5.4, wheelStyle: 'offroad' },
  luxury: { round: 3.8, wheelStyle: 'luxury' },
  track: { round: 3.0, wheelStyle: 'sport5', roofBlack: true },
  supercar: { round: 2.9, wheelStyle: 'multi', roofBlack: true },
  hyper: { round: 2.8, wheelStyle: 'turbine', roofBlack: true },
};
for (const car of CARS) {
  car.class = CLASS_OF[car.id] || 'compact';
  car.physics = CAR_CLASSES[car.class];
  Object.assign(car.design, LOOK[car.class]);
  car.caliper = car.accent === '#16181d' ? '#d0202a' : car.accent;
  // Optional: set car.modelUrl = '/models/your-car.glb' to load a licensed
  // GLTF model instead of the procedural body (see CarBuilder.loadCarModel).
}

export function getCar(id) {
  return CARS.find((c) => c.id === id) || CARS[0];
}

// ---------- Traffic vehicles (not playable) ----------
// speed = the traffic car's own forward speed range. The player is
// faster, so traffic appears to move towards the player.
export const TRAFFIC_TYPES = [
  {
    id: 'sedan', weight: 30, speed: [8, 15], len: 4.5, width: 1.85,
    design: {
      len: 4.5, width: 1.85, clearance: 0.3, noseH: 0.72, h: 0.95, tailH: 0.95,
      cabin: { front: 0.6, roofFront: 0.0, roofRear: -1.1, rear: -1.7, roofH: 0.55 },
      wheelR: 0.36, wheelW: 0.3, axle: 0.85, spoiler: 'none', extras: ['chromeLine'], round: 3.8, wheelStyle: 'basic',
    },
  },
  {
    id: 'hatch', weight: 26, speed: [8, 14], len: 3.8, width: 1.72,
    design: {
      len: 3.8, width: 1.72, clearance: 0.3, noseH: 0.74, h: 0.98, tailH: 1.0,
      cabin: { front: 0.75, roofFront: 0.2, roofRear: -1.45, rear: -1.75, roofH: 0.6 },
      wheelR: 0.33, wheelW: 0.26, axle: 0.62, spoiler: 'lip', extras: [], round: 3.9, wheelStyle: 'basic',
    },
  },
  {
    id: 'sports', weight: 14, speed: [11, 17], len: 4.3, width: 1.9,
    design: {
      len: 4.3, width: 1.9, clearance: 0.27, noseH: 0.55, h: 0.88, tailH: 0.9,
      cabin: { front: 0.45, roofFront: -0.15, roofRear: -0.9, rear: -1.5, roofH: 0.46 },
      wheelR: 0.36, wheelW: 0.32, axle: 0.82, spoiler: 'wing', extras: [], round: 3.1, wheelStyle: 'multi', roofBlack: true,
    },
  },
  {
    id: 'suv', weight: 20, speed: [8, 14], len: 4.6, width: 2.0,
    design: {
      len: 4.6, width: 2.0, clearance: 0.4, noseH: 1.0, h: 1.12, tailH: 1.12,
      cabin: { front: 0.65, roofFront: 0.3, roofRear: -1.95, rear: -2.1, roofH: 0.72 },
      wheelR: 0.44, wheelW: 0.36, axle: 0.9, spoiler: 'none', extras: ['roofRack'], round: 5.6, wheelStyle: 'sport5',
    },
  },
  {
    id: 'van', weight: 14, speed: [7, 12], len: 5.0, width: 2.0,
    design: {
      len: 5.0, width: 2.0, clearance: 0.35, noseH: 1.0, h: 1.1, tailH: 1.1,
      cabin: { front: 1.35, roofFront: 0.85, roofRear: -2.35, rear: -2.45, roofH: 1.1 },
      wheelR: 0.4, wheelW: 0.34, axle: 0.95, spoiler: 'none', extras: ['cargo'], round: 6, wheelStyle: 'basic',
    },
  },
  { id: 'truck', weight: 12, speed: [7, 11], len: 8.6, width: 2.45, builder: 'truck' },
  { id: 'bus', weight: 9, speed: [9, 14], len: 11, width: 2.55, builder: 'bus' },
  { id: 'auto', weight: 8, speed: [6, 9], len: 2.8, width: 1.45, builder: 'auto' },
];

// Special vehicles that are spawned by events, not randomly
export const POLICE_TYPE = { id: 'police', len: 4.5, width: 1.85, builder: 'police' };

export const TRAFFIC_COLORS = [
  '#d9dde4', '#3a4150', '#a31d2b', '#1f4fa8', '#ececec',
  '#6b7a8f', '#2b6e4f', '#c9a227', '#7a3fb0', '#e05a1a', '#20232a',
];

