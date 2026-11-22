// =============================================================
// Night-light registry.
// Any material can say "at night, set my <prop> to X; by day to Y".
// DayNight calls applyNight(n) every frame with n = 0 (day) .. 1 (night).
// Street lamps, windows, traffic lights, signs... all use this.
// =============================================================

const entries = [];

export function registerNight(material, prop, day, night) {
  entries.push({ material, prop, day, night });
  return material;
}

let last = -1;
export function applyNight(n) {
  if (Math.abs(n - last) < 0.002) return; // nothing changed
  last = n;
  for (const e of entries) {
    e.material[e.prop] = e.day + (e.night - e.day) * n;
  }
}

export function forceNightRefresh() {
  last = -1;
}
