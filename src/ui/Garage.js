import { CARS, PAINT_COLORS } from '../data/cars.js';
import { byId, fmt, retrigger, statBarsHTML } from './helpers.js';

// =============================================================
// Garage - browse every car on a 3D turntable, see stats,
// change paint (instant preview), buy locked cars and equip.
// =============================================================

export class Garage {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.index = 0;
    this.previewColor = null;

    this.el = {
      panel: byId('garage-panel'),
      brand: byId('g-brand'),
      model: byId('g-model'),
      status: byId('g-status'),
      tagline: byId('g-tagline'),
      stats: byId('g-stats'),
      swatches: byId('g-swatches'),
      paintName: byId('g-paint-name'),
      paintNote: byId('g-paint-note'),
      action: byId('g-action'),
      dots: byId('g-dots'),
      counter: byId('g-counter'),
    };

    this.el.swatches.innerHTML = PAINT_COLORS.map((c) => `
      <button class="swatch" data-action="paint" data-color="${c.hex}" title="${c.name}"
              aria-label="${c.name}" style="--swatch:${c.hex}"></button>`).join('');
    this.el.dots.innerHTML = CARS.map((c, i) => `
      <button class="dot" data-action="garage-dot" data-index="${i}" aria-label="${c.brand} ${c.model}"></button>`).join('');
  }

  get car() {
    return CARS[this.index];
  }

  open(carId) {
    const id = carId || this.game.save.data.selectedCar;
    this.index = Math.max(0, CARS.findIndex((c) => c.id === id));
    this.previewColor = null;
    this.render(true);
  }

  step(dir) {
    this.goTo((this.index + dir + CARS.length) % CARS.length);
  }

  goTo(i) {
    if (i === this.index) return;
    this.index = i;
    this.previewColor = null;
    this.render(true);
  }

  paint(hex) {
    const save = this.game.save;
    this.previewColor = hex;
    if (save.isUnlocked(this.car.id)) {
      save.setColor(this.car.id, hex); // owned cars save their paint
      this.ui.refreshWallet();
    }
    this.game.player.setColor(hex);
    this.render(false);
  }

  primaryAction() {
    const car = this.car;
    const save = this.game.save;

    if (!save.isUnlocked(car.id)) {
      if (!this.game.purchaseCar(car.id)) {
        this.ui.toast(`Need ${fmt(car.price - save.data.coins)} more coins`, 'warn');
        retrigger(this.el.action, 'shake');
        return;
      }
      if (this.previewColor) save.setColor(car.id, this.previewColor);
      save.select(car.id);
      this.ui.toast(`${car.brand} ${car.model} UNLOCKED!`, 'gold');
      this.game.celebrate(car);
    } else if (save.data.selectedCar !== car.id) {
      save.select(car.id);
      this.ui.toast(`${car.model} equipped`, 'info');
    }
    this.ui.refreshWallet();
    this.render(false);
  }

  render(rebuildModel) {
    const car = this.car;
    const save = this.game.save;
    const owned = save.isUnlocked(car.id);
    const selected = save.data.selectedCar === car.id;
    const color = this.previewColor || save.getColor(car);

    if (rebuildModel) {
      this.game.player.setCar(car, color);
      retrigger(this.el.panel, 'swap');
    }

    this.el.brand.textContent = car.brand;
    this.el.model.textContent = car.model;
    this.el.tagline.textContent = `${car.physics.label} · ${car.tagline}`;
    this.el.counter.textContent = `${this.index + 1} / ${CARS.length}`;
    this.el.stats.innerHTML = statBarsHTML(car.stats);
    this.el.panel.style.setProperty('--car-accent', car.accent === '#16181d' ? car.color : car.accent);

    let status = 'LOCKED';
    if (selected) status = 'EQUIPPED';
    else if (owned) status = 'OWNED';
    this.el.status.textContent = status;
    this.el.status.className = `status-badge ${status.toLowerCase()}`;

    this.el.swatches.querySelectorAll('.swatch').forEach((s) => {
      s.classList.toggle('active', s.dataset.color.toLowerCase() === color.toLowerCase());
    });
    const paintInfo = PAINT_COLORS.find((p) => p.hex.toLowerCase() === color.toLowerCase());
    this.el.paintName.textContent = paintInfo ? paintInfo.name : 'Custom';
    this.el.paintNote.textContent = owned
      ? 'Paint is saved automatically.'
      : 'Preview only - unlock this car to keep the paint.';

    const btn = this.el.action;
    btn.disabled = false;
    if (!owned) {
      const afford = save.data.coins >= car.price;
      btn.className = `btn btn-wide ${afford ? 'btn-gold' : 'btn-locked'}`;
      btn.innerHTML = `<span class="coin-icon"></span> UNLOCK FOR ${fmt(car.price)}`;
    } else if (selected) {
      btn.className = 'btn btn-wide btn-glass';
      btn.innerHTML = '&#10003; EQUIPPED';
      btn.disabled = true;
    } else {
      btn.className = 'btn btn-wide btn-primary';
      btn.textContent = 'SELECT CAR';
    }

    this.el.dots.querySelectorAll('.dot').forEach((d, i) => {
      d.classList.toggle('active', i === this.index);
      d.classList.toggle('locked', !save.isUnlocked(CARS[i].id));
    });
  }
}
