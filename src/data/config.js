// =============================================================
// Game tuning values.
// Change numbers here to rebalance the game - no other file needed.
// Units: 1 unit = 1 metre, speeds are metres per second (m/s).
// =============================================================

export const CONFIG = {
  // Road layout: an undivided two-way highway, Indian style (keep LEFT).
  // Lanes 0-1 carry traffic in YOUR direction, lanes 2-3 are ONCOMING.
  // You may drive in any lane - overtaking in oncoming lanes is risky!
  LANES: [-4.5, -1.5, 1.5, 4.5],
  LANE_DIRECTION: [1, 1, -1, -1], // 1 = same way as you, -1 = oncoming
  START_LANE: 1,
  ROAD_WIDTH: 12, // the 4 lanes
  ROAD_SURFACE_WIDTH: 17, // lanes + paved shoulders

  // Atmosphere (DayNight & Weather change fog at runtime)
  FOG_COLOR: 0x9cb8d8,
  FOG_NEAR: 60,
  FOG_FAR: 320,

  // Speed & difficulty (m/s; 1 m/s = 3.6 km/h)
  START_SPEED: 22, // ~80 km/h when a run begins
  SPEED_GAIN: 0.3, // the speed cap grows this much every second
  BASE_MAX_SPEED: 40, // + car speed stat * 1.6  -> ~166-200 km/h
  MENU_SPEED: 14,
  SHOP_SPEED: 6,
  BRAKE_DECEL: 16, // m/s² when braking on a dry road
  NITRO_BOOST: 1.3, // top speed multiplier while nitro burns

  // Spawning (z is negative = in front of the player)
  SPAWN_Z: -170, // same-direction objects
  SPAWN_Z_ONCOMING: -235, // oncoming traffic closes fast, so spawn farther
  DESPAWN_Z: 30,
  FIRST_SPAWN_DISTANCE: 70,

  // Scoring
  COIN_SCORE: 10,
  NEAR_MISS_SCORE: 50,
  KMH_FACTOR: 3.6, // m/s -> km/h
};
