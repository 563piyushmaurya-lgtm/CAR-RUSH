import { CONFIG } from '../data/config.js';
import { getCar } from '../data/cars.js';
import { WEATHER } from '../systems/Weather.js';
import { VIEW_LABELS } from '../systems/CameraRig.js';
import { ZONES } from '../world/Scenery.js';
import { Garage } from './Garage.js';
import { Shop } from './Shop.js';
import { byId, fmt, retrigger, animateNumber } from './helpers.js';

// =============================================================
// UIManager - all HTML overlays (menus, HUD, popups).
// The 3D game is drawn on the <canvas>; the UI is normal HTML on
// top of it. Buttons use data-action="..." and ONE click listener
// handles them all (this pattern is called "event delegation").
// Hold-buttons (brake / nitro) use data-hold and pointer events.
// =============================================================

export class UIManager {
  constructor(game) {
    this.game = game;
    this.root = byId('ui');

    this.screens = {};
    this.root.querySelectorAll('.screen[data-screen]').forEach((el) => {
      this.screens[el.dataset.screen] = el;
    });

    this.el = {
      hud: byId('hud'),
      score: byId('hud-score'),
      distance: byId('hud-distance'),
      zone: byId('hud-zone'),
      coins: byId('hud-coins'),
      coinsPill: byId('hud-coins-pill'),
      speed: byId('hud-speed'),
      gear: byId('hud-gear'),
      speedBar: byId('hud-speed-bar'),
      hp: byId('hud-hp'),
      fuel: byId('hud-fuel'),
      nitro: byId('hud-nitro'),
      limit: byId('hud-limit'),
      police: byId('police-banner'),
      policeTime: byId('police-time'),
      policeSpeed: byId('police-speed'),
      policeClose: byId('police-close'),
      nearMiss: byId('near-miss'),
      toasts: byId('toasts'),
      bigText: byId('big-text'),
      flash: byId('flash'),
      cracks: byId('cracks'),
      loader: byId('loader'),
      swipeHint: byId('swipe-hint'),
      missions: byId('missions-list'),
    };
    this.last = {};
    this.infoTimer = 0;

    this.garage = new Garage(game, this);
    this.shop = new Shop(game, this);

    const isTouch = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
    document.body.classList.toggle('is-touch', isTouch);

    this.root.addEventListener('click', (e) => this.onClick(e));
    this.bindHoldButtons();
    this.refreshWallet();
    this.updateSoundButtons();
    this.renderMissions();
  }

  onClick(e) {
    const btn = e.target.closest('[data-action]');
    if (!btn || btn.disabled) return;
    btn.blur(); // so Space doesn't "click" it again later
    const g = this.game;
    g.audio.click();

    switch (btn.dataset.action) {
      case 'play':
      case 'restart':
        g.startRun();
        break;
      case 'menu':
        g.goToMenu();
        break;
      case 'garage':
        g.openGarage();
        break;
      case 'shop':
        g.openShop();
        break;
      case 'pause':
        g.pause();
        break;
      case 'resume':
        g.resume();
        break;
      case 'toggle-sound':
        g.toggleSound();
        break;
      case 'day-mode':
        g.setDayMode(btn.dataset.mode);
        break;
      case 'weather':
        g.cycleWeather();
        break;
      case 'headlights':
        g.toggleHeadlights();
        break;
      case 'camera':
        g.cycleCamera();
        break;
      case 'horn':
        g.honkHorn();
        break;
      case 'garage-prev':
        this.garage.step(-1);
        break;
      case 'garage-next':
        this.garage.step(1);
        break;
      case 'garage-dot':
        this.garage.goTo(Number(btn.dataset.index));
        break;
      case 'garage-action':
        this.garage.primaryAction();
        break;
      case 'paint':
        this.garage.paint(btn.dataset.color);
        break;
      case 'shop-buy':
        this.shop.buy(btn.dataset.car);
        break;
      case 'shop-view':
        g.openGarage(btn.dataset.car);
        break;
      default:
    }
  }

  /** Touch/mouse hold buttons for brake & nitro. */
  bindHoldButtons() {
    this.root.querySelectorAll('[data-hold]').forEach((btn) => {
      const set = (down) => {
        btn.classList.toggle('held', down);
        if (btn.dataset.hold === 'brake') this.game.setBrake(down);
        else this.game.setNitro(down);
      };
      btn.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        btn.setPointerCapture(e.pointerId);
        set(true);
      });
      btn.addEventListener('pointerup', () => set(false));
      btn.addEventListener('pointercancel', () => set(false));
      btn.addEventListener('contextmenu', (e) => e.preventDefault());
    });
  }

  /** Shows one screen (or none) with a fade transition defined in CSS. */
  showScreen(name) {
    for (const [key, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', key === name);
    }
    document.body.dataset.screen = name || 'none';
  }

  setHud(visible) {
    this.el.hud.classList.toggle('active', visible);
    document.body.classList.toggle('driving', visible);
    if (!visible) this.setPolice(false);
  }

  hideLoader() {
    const l = this.el.loader;
    if (!l) return;
    setTimeout(() => l.classList.add('hidden'), 250);
    setTimeout(() => l.remove(), 1200);
    this.el.loader = null;
  }

  // ---------- shared values (coins, best, selected car) ----------
  refreshWallet() {
    const save = this.game.save;
    const d = save.data;
    const car = getCar(d.selectedCar);
    this.root.querySelectorAll('[data-bind="coins"]').forEach((el) => { el.textContent = fmt(d.coins); });
    this.root.querySelectorAll('[data-bind="best"]').forEach((el) => { el.textContent = fmt(d.bestScore); });
    this.root.querySelectorAll('[data-bind="car"]').forEach((el) => {
      el.innerHTML = `<i class="color-dot" style="background:${save.getColor(car)}"></i>${car.brand} ${car.model}`;
    });
  }

  updateSoundButtons() {
    document.body.classList.toggle('muted', this.game.save.data.muted);
  }

  /** Day/night, weather, headlight and camera buttons everywhere they appear. */
  updateControls() {
    const g = this.game;
    const bind = (name, value) => this.root.querySelectorAll(`[data-bind="${name}"]`).forEach((el) => { el.textContent = value; });
    this.root.querySelectorAll('[data-action="day-mode"]').forEach((b) => {
      b.classList.toggle('active', b.dataset.mode === g.dayNight.mode);
    });
    const w = g.weather.mode === 'auto' ? null : WEATHER[g.weather.mode];
    bind('weather-icon', (w || WEATHER[g.weather.state]).icon);
    bind('weather-label', w ? w.label : `AUTO · ${WEATHER[g.weather.state].label}`);
    const on = g.save.data.headlights;
    bind('headlight-state', on ? 'ON' : 'OFF');
    bind('headlight-cta', on ? 'TURN OFF' : 'TURN ON');
    this.root.querySelectorAll('[data-action="headlights"]').forEach((b) => b.classList.toggle('on', on));
    bind('camera-label', VIEW_LABELS[g.cameraRig.view]);
  }

  /** Clock, weather label, rain-on-windscreen - a few times per second. */
  updateWorldInfo(dt) {
    this.infoTimer -= dt;
    if (this.infoTimer > 0) return;
    this.infoTimer = 0.4;
    const g = this.game;
    this.root.querySelectorAll('[data-bind="clock"]').forEach((el) => {
      el.textContent = `${g.dayNight.clock} · ${g.dayNight.label}`;
    });
    if (g.weather.mode === 'auto') {
      this.root.querySelectorAll('[data-bind="weather-icon"]').forEach((el) => { el.textContent = g.weather.info.icon; });
      this.root.querySelectorAll('[data-bind="weather-label"]').forEach((el) => { el.textContent = `AUTO · ${g.weather.info.label}`; });
    }
    document.body.classList.toggle('raining', g.weather.p.rain > 0.25);
    if (this.el.zone) this.el.zone.textContent = ZONES[g.environment.zone].label.toUpperCase();
  }

  // ---------- missions (main menu) ----------
  renderMissions() {
    const list = this.game.missions.list();
    this.el.missions.innerHTML = list.map((m) => {
      const pct = Math.min(100, (m.progress / m.target) * 100);
      const unit = m.unit === 'm' ? ' m' : m.unit === 's' ? ' s' : '';
      const progress = m.done ? 'DONE' : `${fmt(Math.min(m.progress, m.target))} / ${fmt(m.target)}${unit}`;
      return `
        <li class="${m.daily ? 'daily' : ''} ${m.done ? 'done' : ''}">
          <div class="m-top"><span>${m.text}</span><b><span class="coin-icon"></span>${m.reward}</b></div>
          <div class="bar"><i style="width:${pct}%"></i></div>
          <small>${progress}</small>
        </li>`;
    }).join('');
  }

  // ---------- HUD ----------
  resetHud() {
    this.last = {};
    this.el.nearMiss.className = 'near-miss';
    this.el.cracks.className = '';
    if (document.body.classList.contains('is-touch')) {
      retrigger(this.el.swipeHint, 'show');
    }
  }

  setText(key, value) {
    if (this.last[key] === value) return; // only touch the DOM when something changed
    this.last[key] = value;
    this.el[key].textContent = value;
  }

  setBar(key, pct) {
    const v = Math.round(pct * 200) / 200;
    if (this.last[key] === v) return;
    this.last[key] = v;
    this.el[key].style.transform = `scaleX(${v})`;
  }

  updateHud(run, speed, { limit, police, braking }) {
    const kmh = Math.round(speed * CONFIG.KMH_FACTOR);
    this.setText('score', fmt(run.score));
    this.setText('distance', fmt(run.distance));
    this.setText('coins', fmt(run.coins));
    this.setText('speed', String(kmh));
    this.setText('gear', braking ? 'BRK' : `G${run.gear}`);
    this.setText('limit', String(limit));
    this.el.limit.classList.toggle('over', kmh > limit + 20);

    this.setBar('speedBar', Math.min(1, speed / (run.maxSpeed * CONFIG.NITRO_BOOST)));
    this.setBar('hp', run.hp / 100);
    this.setBar('fuel', run.fuel / 100);
    this.setBar('nitro', run.nitro);
    this.el.hud.classList.toggle('low-fuel', run.fuel < 20);
    this.el.hud.classList.toggle('low-hp', run.hp < 35);
    this.el.hud.classList.toggle('nitro-on', run.nitroActive);

    // windscreen cracks build up with damage
    const crack = run.hp < 35 ? 'heavy' : run.hp < 70 ? 'light' : '';
    if (this.last.crack !== crack) {
      this.last.crack = crack;
      this.el.cracks.className = crack;
    }

    if (police.active) {
      this.setText('policeTime', String(Math.max(0, Math.ceil(police.timeLeft))));
      this.el.policeSpeed.textContent = police.escapeKmh;
      this.el.policeClose.style.transform = `scaleX(${police.closeness.toFixed(2)})`;
    }

    const intensity = Math.min(1, Math.max(0, (speed - 22) / 28));
    if (Math.abs(intensity - (this.last.intensity || 0)) > 0.01) {
      this.last.intensity = intensity;
      document.documentElement.style.setProperty('--speed', intensity.toFixed(3));
    }
  }

  setPolice(active) {
    this.el.police.classList.toggle('show', active);
  }

  nearMiss(combo, bonus, oncoming) {
    const el = this.el.nearMiss;
    el.innerHTML = `<b>🔥 ${oncoming ? 'ONCOMING ' : ''}NEAR MISS!</b>${combo > 1 ? `<span class="combo">x${combo} COMBO</span>` : ''}<em>+${fmt(bonus)}</em>`;
    retrigger(el, 'show');
  }

  pulseCoins() {
    retrigger(this.el.coinsPill, 'bump');
  }

  toast(text, variant = '') {
    if (!text) return;
    const t = document.createElement('div');
    t.className = `toast ${variant}`;
    t.textContent = text;
    this.el.toasts.appendChild(t);
    while (this.el.toasts.children.length > 4) this.el.toasts.firstChild.remove();
    setTimeout(() => t.remove(), 2200);
  }

  bigText(text) {
    this.el.bigText.textContent = text;
    retrigger(this.el.bigText, 'show');
  }

  flash(kind = 'hit') {
    this.el.flash.dataset.kind = kind;
    retrigger(this.el.flash, 'on');
  }

  // ---------- Game over ----------
  showGameOver(r) {
    document.documentElement.style.setProperty('--speed', '0');
    byId('go-reason').textContent = r.reason || 'CRASHED!';
    animateNumber(byId('go-score'), 0, r.score, 1000);
    byId('go-distance').textContent = `${fmt(r.distance)} m`;
    byId('go-coins').textContent = `+${fmt(r.coins)}`;
    byId('go-best').textContent = fmt(r.best);
    byId('go-nearmiss').textContent = fmt(r.nearMisses);
    byId('go-topspeed').textContent = `${r.topSpeed} km/h`;
    const car = getCar(this.game.save.data.selectedCar);
    byId('go-car').textContent = car.model;
    byId('go-newbest').classList.toggle('show', r.isNewBest);
    this.refreshWallet();
    this.renderMissions();
    this.showScreen('gameover');
  }
}
