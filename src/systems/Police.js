import { POLICE_TYPE } from '../data/cars.js';
import { buildTrafficVehicle } from '../models/VehicleBuilder.js';
import { damp, clamp } from '../utils/math.js';

// =============================================================
// Police - chase after you are caught speeding by a speed camera.
//
// A police car appears behind you with lights & siren.
//   * Keep your speed above ESCAPE_KMH and it falls behind -> ESCAPED
//   * Survive CHASE_TIME seconds -> it gives up -> ESCAPED
//   * Drop below that speed and it closes in; if it stays right on
//     your bumper for 2 seconds -> BUSTED (game over)
// =============================================================

const ESCAPE_KMH = 130;
const CHASE_TIME = 30;
const CATCH_Z = 6.5;

export class Police {
  constructor(scene) {
    this.car = buildTrafficVehicle(POLICE_TYPE);
    this.car.userData.setPaint('#f4f6fa', '#1238a8');
    this.car.visible = false;
    scene.add(this.car);
    this.reset();
  }

  reset() {
    this.active = false;
    this.z = 80;
    this.x = 0;
    this.timeLeft = 0;
    this.catchTimer = 0;
    this.car.visible = false;
  }

  start(playerX) {
    if (this.active) return false;
    this.active = true;
    this.z = 70; // behind the player
    this.x = playerX;
    this.timeLeft = CHASE_TIME;
    this.catchTimer = 0;
    this.car.visible = true;
    return true;
  }

  get escapeKmh() {
    return ESCAPE_KMH;
  }

  /**
   * @returns {'escaped'|'busted'|null}
   */
  update(dt, worldSpeed, playerX) {
    if (!this.active) return null;
    this.timeLeft -= dt;

    // the police car is a bit faster than the escape speed limit
    const policeTop = ESCAPE_KMH / 3.6 + 1.5;
    // closes in at full speed; once near, creeps up to your bumper
    const wanted = this.z > 14 ? policeTop : worldSpeed + 2;
    const policeSpeed = Math.min(wanted, policeTop);
    this.z += (worldSpeed - policeSpeed) * dt; // z > 0 = behind the player
    this.z = Math.max(this.z, CATCH_Z - 1);
    this.x = damp(this.x, playerX, 1.6, dt);
    this.car.position.set(this.x, 0, this.z);
    this.car.rotation.y = 0;

    if (this.z < CATCH_Z + 1.5) this.catchTimer += dt;
    else this.catchTimer = Math.max(0, this.catchTimer - dt);

    if (this.catchTimer > 2) {
      this.active = false;
      return 'busted';
    }
    if (this.z > 140 || this.timeLeft <= 0) {
      this.reset();
      return 'escaped';
    }
    return null;
  }

  /** 0 = far away, 1 = on your bumper (for the HUD). */
  get closeness() {
    return clamp(1 - (this.z - CATCH_Z) / 60, 0, 1);
  }
}
