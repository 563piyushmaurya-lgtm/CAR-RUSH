import { BEND } from '../utils/bend.js';
import { rand, pick, clamp } from '../utils/math.js';

// =============================================================
// RoadCurve - procedurally generates the road "program":
//   STRAIGHT -> LEFT CURVE -> STRAIGHT -> RIGHT CURVE -> ...
// Every section has a target curve/hill value. The live bend eases
// towards the section ahead of the player, so transitions are
// always smooth (never an abrupt direction change).
//
// Distances here use the world "odometer" (metres ever driven),
// so the road keeps generating in menus too.
// =============================================================

const LOOKAHEAD = 90; // start bending before the curve reaches the car
const EASE_DISTANCE = 75; // metres to mostly blend into a new section

const CURVES = {
  gentle: 0.00022,
  medium: 0.00038,
  sharp: 0.00055,
};

export class RoadCurve {
  constructor() {
    this.reset(0);
  }

  reset(odometer) {
    this.sections = [];
    this.end = odometer;
    this.curve = 0;
    this.hill = 0;
    this.lastWasCurve = false;
    this.difficulty = 0;
    this.extend(odometer + 2500);
  }

  /** Appends sections until the program reaches `until` metres. */
  extend(until) {
    while (this.end < until) {
      let s;
      if (this.lastWasCurve || Math.random() < 0.35) {
        // straights between curves (sometimes long ones)
        const long = Math.random() < 0.3;
        s = { type: long ? 'long-straight' : 'straight', len: long ? rand(600, 1000) : rand(180, 420), curve: 0 };
        this.lastWasCurve = false;
      } else {
        // harder curves become more likely the further you drive
        const d = this.difficulty;
        const strength = pick(d > 0.6 ? ['medium', 'sharp', 'medium'] : d > 0.25 ? ['gentle', 'medium'] : ['gentle', 'gentle', 'medium']);
        const dir = Math.random() < 0.5 ? -1 : 1;
        s = { type: dir < 0 ? 'left' : 'right', strength, len: rand(260, 520), curve: dir * CURVES[strength] };
        this.lastWasCurve = true;
      }
      // gentle crests and dips on some sections
      s.hill = Math.random() < 0.35 ? rand(-1, 1) * 0.00009 : 0;
      s.start = this.end;
      this.end += s.len;
      this.sections.push(s);
    }
  }

  sectionAt(dist) {
    for (const s of this.sections) {
      if (dist >= s.start && dist < s.start + s.len) return s;
    }
    return this.sections[this.sections.length - 1];
  }

  /**
   * @param {number} odometer total metres driven
   * @param {number} ds metres driven this frame
   */
  update(odometer, ds, difficulty) {
    this.difficulty = clamp(difficulty, 0, 1);
    this.extend(odometer + 2500);
    // forget sections far behind
    while (this.sections.length > 2 && this.sections[0].start + this.sections[0].len < odometer - 400) {
      this.sections.shift();
    }

    const target = this.sectionAt(odometer + LOOKAHEAD);
    const k = 1 - Math.exp(-Math.max(ds, 0) / EASE_DISTANCE);
    this.curve += (target.curve - this.curve) * k;
    this.hill += (target.hill - this.hill) * k;
    BEND.value.set(this.curve, this.hill);
  }

  /** Curve sections starting between two odometer values (for warning signs). */
  curvesStartingBetween(a, b) {
    return this.sections.filter((s) => s.curve !== 0 && s.start > a && s.start <= b);
  }
}
