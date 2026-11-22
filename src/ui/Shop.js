import { CARS, getCar } from '../data/cars.js';
import { byId, fmt, retrigger, statBarsHTML, carSilhouetteSVG } from './helpers.js';

// =============================================================
// Shop - a grid of every car with its price. Coins earned while
// driving are spent here to unlock new cars.
// =============================================================

const LOCK_ICON = `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor" aria-hidden="true">
  <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 0 1 6 0v3H9z"/></svg>`;

export class Shop {
  constructor(game, ui) {
    this.game = game;
    this.ui = ui;
    this.grid = byId('shop-grid');
    this.scroller = byId('shop-scroll');
  }

  open() {
    this.render();
    this.scroller.scrollTop = 0;
  }

  card(car) {
    const save = this.game.save;
    const owned = save.isUnlocked(car.id);
    const equipped = save.data.selectedCar === car.id;
    const afford = save.data.coins >= car.price;
    const color = owned ? save.getColor(car) : car.color;

    let button;
    if (owned) {
      button = `<button class="btn btn-glass btn-wide" data-action="shop-view" data-car="${car.id}">
        ${equipped ? '&#10003; EQUIPPED' : 'OWNED &middot; VIEW'}</button>`;
    } else {
      button = `<button class="btn btn-wide ${afford ? 'btn-gold' : 'btn-locked'}" data-action="shop-buy" data-car="${car.id}">
        <span class="coin-icon"></span>${fmt(car.price)}</button>`;
    }

    return `
      <article class="shop-card glass ${owned ? 'owned' : 'locked'}" data-car="${car.id}" style="--car:${car.color}">
        <div class="card-art">
          ${carSilhouetteSVG(color, car.accent)}
          ${owned ? '' : `<span class="lock-badge" aria-label="Locked">${LOCK_ICON}</span>`}
          <span class="unlocked-stamp">UNLOCKED!</span>
        </div>
        <div class="card-body">
          <span class="car-brand">${car.brand}</span>
          <h3 class="card-model">${car.model}</h3>
          <div class="stats compact">${statBarsHTML(car.stats, true)}</div>
          ${button}
        </div>
      </article>`;
  }

  render(highlightId) {
    this.grid.innerHTML = CARS.map((c) => this.card(c)).join('');
    if (highlightId) {
      const card = this.grid.querySelector(`[data-car="${highlightId}"]`);
      if (card) retrigger(card, 'just-bought');
    }
  }

  buy(id) {
    const car = getCar(id);
    const save = this.game.save;
    if (!this.game.purchaseCar(id)) {
      this.ui.toast(`Need ${fmt(car.price - save.data.coins)} more coins`, 'warn');
      const card = this.grid.querySelector(`.shop-card[data-car="${id}"]`);
      if (card) retrigger(card, 'shake');
      return;
    }
    this.ui.toast(`${car.brand} ${car.model} UNLOCKED!`, 'gold');
    this.render(id);
    this.ui.refreshWallet();
  }
}
