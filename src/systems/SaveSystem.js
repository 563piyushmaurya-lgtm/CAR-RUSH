import { STARTER_CAR_ID, CARS } from '../data/cars.js';

// =============================================================
// SaveSystem - stores progress in the browser's localStorage.
// localStorage only stores text, so we convert our data object
// to a JSON string when saving and parse it back when loading.
// =============================================================

const KEY = 'carRush.save.v1';

const DEFAULTS = {
  coins: 0,
  bestScore: 0,
  unlocked: [STARTER_CAR_ID],
  selectedCar: STARTER_CAR_ID,
  carColors: {}, // carId -> '#hex'
  muted: false,
  runs: 0,
  // added in the realism upgrade (old saves simply get these defaults)
  dayMode: 'auto', // 'day' | 'night' | 'auto'
  weatherMode: 'auto', // 'auto' | 'clear' | 'cloudy' | 'rain' | 'storm' | 'fog'
  cameraView: 'chase',
  headlights: false, // the player's choice - never changed automatically
  totalDistance: 0,
  missions: null,
  daily: null,
};

export class SaveSystem {
  constructor() {
    this.data = this.load();
  }

  load() {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(KEY)) || {};
    } catch {
      saved = {}; // corrupted or blocked storage -> start fresh
    }
    const data = { ...DEFAULTS, ...saved, carColors: { ...(saved.carColors || {}) } };

    // Sanity checks so a bad save can never break the game
    const ids = CARS.map((c) => c.id);
    data.unlocked = Array.isArray(data.unlocked) ? data.unlocked.filter((id) => ids.includes(id)) : [];
    if (!data.unlocked.includes(STARTER_CAR_ID)) data.unlocked.unshift(STARTER_CAR_ID);
    if (!data.unlocked.includes(data.selectedCar)) data.selectedCar = STARTER_CAR_ID;
    data.coins = Math.max(0, Math.floor(Number(data.coins) || 0));
    data.bestScore = Math.max(0, Math.floor(Number(data.bestScore) || 0));
    return data;
  }

  persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      // storage full or disabled (e.g. private mode) - game still works
    }
  }

  addCoins(n) {
    this.data.coins += n;
    this.persist();
  }

  /** Returns true if the purchase went through. */
  spendCoins(n) {
    if (this.data.coins < n) return false;
    this.data.coins -= n;
    this.persist();
    return true;
  }

  /** Records a finished run. Returns true if it is a new best score. */
  submitScore(score) {
    this.data.runs++;
    const isBest = score > this.data.bestScore;
    if (isBest) this.data.bestScore = score;
    this.persist();
    return isBest;
  }

  isUnlocked(id) {
    return this.data.unlocked.includes(id);
  }

  unlock(id) {
    if (!this.isUnlocked(id)) this.data.unlocked.push(id);
    this.persist();
  }

  select(id) {
    if (!this.isUnlocked(id)) return;
    this.data.selectedCar = id;
    this.persist();
  }

  getColor(car) {
    return this.data.carColors[car.id] || car.color;
  }

  setColor(id, hex) {
    this.data.carColors[id] = hex;
    this.persist();
  }

  setMuted(muted) {
    this.data.muted = muted;
    this.persist();
  }
}
