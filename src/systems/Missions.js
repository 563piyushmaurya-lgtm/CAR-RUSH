import { pick } from '../utils/math.js';

// =============================================================
// Missions & daily challenge.
// Three missions are active at a time; finishing one pays coins
// and a new one takes its place. One extra DAILY challenge changes
// every calendar day and pays double.
//
// Mission kinds:
//   'run'   - must be achieved within ONE run (progress resets)
//   'total' - accumulates across runs
// =============================================================

export const MISSION_POOL = [
  { id: 'nohit2k', text: 'Drive 2 km without a collision', target: 2000, kind: 'run', stat: 'cleanDistance', reward: 150, unit: 'm' },
  { id: 'nearmiss5', text: 'Perform 5 near misses in one run', target: 5, kind: 'run', stat: 'nearMisses', reward: 120 },
  { id: 'coins100', text: 'Collect 100 coins', target: 100, kind: 'total', stat: 'coins', reward: 100 },
  { id: 'speed150', text: 'Drive above 150 km/h for 30 seconds', target: 30, kind: 'run', stat: 'fastTime', reward: 150, unit: 's' },
  { id: 'night60', text: 'Survive 60 seconds of night traffic', target: 60, kind: 'run', stat: 'nightTime', reward: 150, unit: 's' },
  { id: 'nitro5', text: 'Fire nitro 5 times', target: 5, kind: 'total', stat: 'nitroUses', reward: 80 },
  { id: 'dist5k', text: 'Drive 5 km in total', target: 5000, kind: 'total', stat: 'distance', reward: 120, unit: 'm' },
  { id: 'escape', text: 'Escape a police chase', target: 1, kind: 'total', stat: 'escapes', reward: 200 },
  { id: 'oncoming3', text: '3 near misses with oncoming traffic', target: 3, kind: 'run', stat: 'oncomingMisses', reward: 160 },
  { id: 'rain1k', text: 'Drive 1 km in the rain', target: 1000, kind: 'total', stat: 'rainDistance', reward: 120, unit: 'm' },
  { id: 'combo4', text: 'Reach a x4 near-miss combo', target: 4, kind: 'run', stat: 'bestCombo', reward: 180 },
  { id: 'fuel3', text: 'Refuel 3 times', target: 3, kind: 'total', stat: 'refuels', reward: 90 },
];

const today = () => new Date().toISOString().slice(0, 10);

export class Missions {
  constructor(save) {
    this.save = save;
    this.completed = []; // missions finished since last read (for toasts)
    const d = save.data;
    if (!Array.isArray(d.missions)) d.missions = [];
    d.missions = d.missions.filter((m) => MISSION_POOL.some((p) => p.id === m.id));
    while (d.missions.length < 3) d.missions.push(this.fresh(d.missions.map((m) => m.id)));
    if (!d.daily || d.daily.date !== today()) {
      const def = pick(MISSION_POOL);
      d.daily = { date: today(), id: def.id, progress: 0, done: false };
    }
    save.persist();
  }

  fresh(exclude = []) {
    const def = pick(MISSION_POOL.filter((m) => !exclude.includes(m.id)));
    return { id: def.id, progress: 0 };
  }

  def(id) {
    return MISSION_POOL.find((m) => m.id === id);
  }

  /** All missions for the UI. */
  list() {
    const d = this.save.data;
    const daily = d.daily;
    const dDef = this.def(daily.id);
    return [
      ...d.missions.map((m) => ({ ...this.def(m.id), progress: m.progress, daily: false })),
      { ...dDef, text: `DAILY: ${dDef.text}`, target: dDef.target * 2, reward: dDef.reward * 2, progress: daily.progress, done: daily.done, daily: true },
    ];
  }

  onRunStart() {
    const d = this.save.data;
    for (const m of d.missions) if (this.def(m.id).kind === 'run') m.progress = 0;
    if (!d.daily.done && this.def(d.daily.id).kind === 'run') d.daily.progress = 0;
  }

  /**
   * Report gameplay stats.
   * @param {string} stat
   * @param {number} value  for 'run' missions: the current run value; for 'total': an increment
   */
  report(stat, value) {
    const d = this.save.data;
    let changed = false;
    d.missions.forEach((m, i) => {
      const def = this.def(m.id);
      if (def.stat !== stat) return;
      m.progress = def.kind === 'run' ? Math.max(m.progress, value) : m.progress + value;
      changed = true;
      if (m.progress >= def.target) {
        this.completed.push({ text: def.text, reward: def.reward });
        d.coins += def.reward;
        d.missions[i] = this.fresh(d.missions.map((x) => x.id));
      }
    });
    const daily = d.daily;
    const dDef = this.def(daily.id);
    if (!daily.done && dDef.stat === stat) {
      daily.progress = dDef.kind === 'run' ? Math.max(daily.progress, value) : daily.progress + value;
      changed = true;
      if (daily.progress >= dDef.target * 2) {
        daily.done = true;
        this.completed.push({ text: `DAILY: ${dDef.text}`, reward: dDef.reward * 2 });
        d.coins += dDef.reward * 2;
      }
    }
    return changed;
  }

  /** Saves progress (called at the end of a run, not every frame). */
  persist() {
    this.save.persist();
  }
}
