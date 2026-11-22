// Holds the reflection (environment) map once SceneSetup creates it.
// Car paint, glass, chrome and coins read it so they look shiny.
export const envHolder = { map: null };

// Materials whose reflections should dim at night / in bad weather.
// DayNight scales each one's envMapIntensity from its "base" value.
const tracked = new Set();
let factor = 1;

export function trackEnv(material, base = material.envMapIntensity) {
  material.userData.envBase = base;
  material.envMapIntensity = base * factor;
  tracked.add(material);
  return material;
}

export function untrackEnv(material) {
  tracked.delete(material);
}

export function setEnvFactor(f) {
  if (Math.abs(f - factor) < 0.01) return;
  factor = f;
  for (const m of tracked) m.envMapIntensity = m.userData.envBase * f;
}
