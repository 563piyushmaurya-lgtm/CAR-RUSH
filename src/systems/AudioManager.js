// =============================================================
// AudioManager - every sound is GENERATED with the Web Audio API.
// No audio files needed: we combine oscillators (pure tones) and
// filtered white noise, then shape their volume over time.
//
// Browsers block sound until the user clicks/taps once, so the
// AudioContext is created on the first interaction.
// =============================================================

const MASTER_VOLUME = 0.7;

export class AudioManager {
  constructor(muted = false) {
    this.muted = muted;
    this.ctx = null;
    this.engine = null;
    const unlock = () => this.ensure();
    window.addEventListener('pointerdown', unlock);
    window.addEventListener('keydown', unlock);
  }

  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = this.muted ? 0 : MASTER_VOLUME;
      this.master.connect(this.ctx.destination);

      // 1 second of white noise, reused for crashes and whooshes
      const len = this.ctx.sampleRate;
      this.noiseBuffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noiseBuffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume();
    return this.ctx;
  }

  setMuted(muted) {
    this.muted = muted;
    if (this.master) this.master.gain.setTargetAtTime(muted ? 0 : MASTER_VOLUME, this.ctx.currentTime, 0.05);
  }

  // ---------- building blocks ----------
  tone({ type = 'sine', freq = 440, to = null, duration = 0.15, volume = 0.2, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (to) osc.frequency.exponentialRampToValueAtTime(to, t + duration);
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.008);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    osc.connect(gain).connect(this.master);
    osc.start(t);
    osc.stop(t + duration + 0.05);
  }

  noise({ duration = 0.3, volume = 0.3, filter = 'lowpass', freq = 1000, to = null, delay = 0 }) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime + delay;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = filter;
    f.frequency.setValueAtTime(freq, t);
    if (to) f.frequency.exponentialRampToValueAtTime(to, t + duration);
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(volume, t + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + duration);
    src.connect(f).connect(gain).connect(this.master);
    src.start(t);
    src.stop(t + duration + 0.05);
  }

  // ---------- game sounds ----------
  click() {
    this.tone({ type: 'square', freq: 880, to: 660, duration: 0.06, volume: 0.06 });
  }

  coin() {
    this.tone({ type: 'sine', freq: 988, duration: 0.08, volume: 0.18 });
    this.tone({ type: 'sine', freq: 1480, duration: 0.18, volume: 0.16, delay: 0.06 });
  }

  swoosh() {
    this.noise({ duration: 0.18, volume: 0.12, filter: 'bandpass', freq: 900, to: 2800 });
  }

  speedUp() {
    this.tone({ type: 'triangle', freq: 440, to: 880, duration: 0.3, volume: 0.12 });
    this.tone({ type: 'triangle', freq: 660, to: 1320, duration: 0.3, volume: 0.08, delay: 0.08 });
  }

  crash() {
    this.noise({ duration: 0.9, volume: 0.8, filter: 'lowpass', freq: 3000, to: 150 });
    this.tone({ type: 'sawtooth', freq: 140, to: 35, duration: 0.6, volume: 0.35 });
    this.noise({ duration: 0.4, volume: 0.3, filter: 'highpass', freq: 3000, delay: 0.05 }); // glass
  }

  purchase() {
    [523, 659, 784, 1046].forEach((f, i) =>
      this.tone({ type: 'triangle', freq: f, duration: 0.25, volume: 0.15, delay: i * 0.08 })
    );
  }

  error() {
    this.tone({ type: 'square', freq: 220, to: 160, duration: 0.18, volume: 0.08 });
  }

  // ---------- continuous engine hum ----------
  startEngine() {
    const ctx = this.ensure();
    if (!ctx || this.engine) return;
    const t = ctx.currentTime;
    const osc1 = ctx.createOscillator();
    osc1.type = 'sawtooth';
    osc1.frequency.value = 60;
    const osc2 = ctx.createOscillator();
    osc2.type = 'square';
    osc2.frequency.value = 30;
    const sub = ctx.createGain();
    sub.gain.value = 0.5;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 500;
    filter.Q.value = 2;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.6);

    osc1.connect(filter);
    osc2.connect(sub).connect(filter);
    filter.connect(gain).connect(this.master);
    osc1.start();
    osc2.start();
    this.engine = { osc1, osc2, filter, gain };
  }

  /**
   * Engine pitch follows a simple gearbox model: within each gear the
   * revs climb, then drop when the next gear engages.
   */
  updateEngine(speed, { gear = 1, rev = 0.5, nitro = false, throttle = 1 } = {}) {
    if (!this.engine) return;
    const t = this.ctx.currentTime;
    const f = 42 + rev * 95 + gear * 7 + (nitro ? 18 : 0);
    this.engine.osc1.frequency.setTargetAtTime(f, t, 0.05);
    this.engine.osc2.frequency.setTargetAtTime(f * 0.5, t, 0.05);
    this.engine.filter.frequency.setTargetAtTime(300 + rev * 900 + speed * 10 + (nitro ? 600 : 0), t, 0.08);
    this.engine.gain.gain.setTargetAtTime((0.035 + throttle * 0.025) * (nitro ? 1.4 : 1), t, 0.1);
  }
  setEnginePaused(paused) {
    if (!this.engine) return;
    this.engine.gain.gain.setTargetAtTime(paused ? 0.0001 : 0.05, this.ctx.currentTime, 0.08);
  }

  stopEngine() {
    if (!this.engine) return;
    const e = this.engine;
    this.engine = null;
    const t = this.ctx.currentTime;
    e.gain.gain.cancelScheduledValues(t);
    e.gain.gain.setTargetAtTime(0.0001, t, 0.12);
    e.osc1.stop(t + 0.8);
    e.osc2.stop(t + 0.8);
  }

  // ---------- one-shot effects ----------
  gearShift() {
    this.noise({ duration: 0.06, volume: 0.05, filter: 'bandpass', freq: 1200 });
  }

  tireSqueal() {
    this.noise({ duration: 0.28, volume: 0.07, filter: 'bandpass', freq: 2600, to: 2100 });
  }

  nitroBurst() {
    this.noise({ duration: 0.7, volume: 0.25, filter: 'bandpass', freq: 400, to: 3000 });
    this.tone({ type: 'sawtooth', freq: 120, to: 260, duration: 0.5, volume: 0.06 });
  }

  horn() {
    this.tone({ type: 'square', freq: 392, duration: 0.45, volume: 0.07 });
    this.tone({ type: 'square', freq: 494, duration: 0.45, volume: 0.06 });
  }

  /** Another vehicle honking, panned left/right by its position. */
  honk(pan = 0) {
    const ctx = this.ensure();
    if (!ctx) return;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    const t = ctx.currentTime;
    for (const [freq, d] of [[300, 0], [300, 0.22]]) {
      const o = ctx.createOscillator();
      const g = ctx.createGain();
      o.type = 'square';
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + d);
      g.gain.exponentialRampToValueAtTime(0.05, t + d + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, t + d + 0.18);
      o.connect(g).connect(p);
      o.start(t + d);
      o.stop(t + d + 0.2);
    }
  }

  /** Whoosh of a vehicle passing close by. */
  passBy(pan = 0, strength = 1) {
    const ctx = this.ensure();
    if (!ctx) return;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    p.connect(this.master);
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    const f = ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.setValueAtTime(1400, t);
    f.frequency.exponentialRampToValueAtTime(350, t + 0.5);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.2 * strength, t + 0.08);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.5);
    src.connect(f).connect(g).connect(p);
    src.start(t);
    src.stop(t + 0.55);
  }

  nearMiss(combo = 1) {
    this.tone({ type: 'triangle', freq: 880 + combo * 90, duration: 0.18, volume: 0.1 });
    this.tone({ type: 'triangle', freq: 1320 + combo * 90, duration: 0.25, volume: 0.08, delay: 0.07 });
  }

  hit() {
    this.noise({ duration: 0.35, volume: 0.5, filter: 'bandpass', freq: 1800, to: 400 });
    this.tone({ type: 'square', freq: 180, to: 60, duration: 0.3, volume: 0.15 });
  }

  pickup() {
    [660, 990].forEach((f, i) => this.tone({ type: 'sine', freq: f, duration: 0.15, volume: 0.15, delay: i * 0.07 }));
  }

  thunder() {
    const delay = 0.2 + Math.random() * 0.8;
    this.noise({ duration: 2.8, volume: 0.6, filter: 'lowpass', freq: 400, to: 60, delay });
    this.noise({ duration: 0.4, volume: 0.3, filter: 'lowpass', freq: 1500, to: 200, delay });
  }

  mission() {
    [523, 784, 1046, 1318].forEach((f, i) => this.tone({ type: 'sine', freq: f, duration: 0.3, volume: 0.12, delay: i * 0.1 }));
  }

  busted() {
    this.tone({ type: 'square', freq: 520, to: 260, duration: 0.9, volume: 0.1 });
  }

  // ---------- environmental ambience ----------
  birds() {
    for (let i = 0; i < 3; i++) {
      const f = 2600 + Math.random() * 1600;
      this.tone({ type: 'sine', freq: f, to: f * 1.3, duration: 0.09, volume: 0.025, delay: i * 0.13 });
    }
  }

  crickets() {
    for (let i = 0; i < 6; i++) this.tone({ type: 'sine', freq: 4400, duration: 0.03, volume: 0.012, delay: i * 0.06 });
  }

  // ---------- continuous loops: wind, road, rain, siren ----------
  ensureLoops() {
    if (this.loops) return true;
    const ctx = this.ensure();
    if (!ctx) return false;
    // brown noise = smoothed white noise (deep rumble)
    const len = ctx.sampleRate * 2;
    const brown = ctx.createBuffer(1, len, ctx.sampleRate);
    const data = brown.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
      data[i] = last * 3.5;
    }
    const loop = (buffer, type, freq) => {
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const filter = ctx.createBiquadFilter();
      filter.type = type;
      filter.frequency.value = freq;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(filter).connect(gain).connect(this.master);
      src.start();
      return { filter, gain };
    };
    this.loops = {
      wind: loop(this.noiseBuffer, 'lowpass', 600),
      road: loop(brown, 'lowpass', 260),
      rain: loop(this.noiseBuffer, 'highpass', 2200),
    };
    return true;
  }

  setAmbience({ speed = 0, rain = 0, driving = false }) {
    if (!this.ctx || !this.ensureLoops()) return;
    const t = this.ctx.currentTime;
    const k = Math.min(1, speed / 55);
    this.loops.wind.gain.gain.setTargetAtTime(driving ? k * k * 0.11 : 0.01, t, 0.3);
    this.loops.wind.filter.frequency.setTargetAtTime(300 + speed * 22, t, 0.3);
    this.loops.road.gain.gain.setTargetAtTime(driving ? Math.min(1, speed / 25) * 0.09 : 0, t, 0.3);
    this.loops.rain.gain.gain.setTargetAtTime(rain * 0.16, t, 0.5);
  }

  startSiren() {
    const ctx = this.ensure();
    if (!ctx || this.siren) return;
    const osc = ctx.createOscillator();
    osc.type = 'square';
    osc.frequency.value = 780;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 0.9; // wail up and down
    const depth = ctx.createGain();
    depth.gain.value = 230;
    lfo.connect(depth).connect(osc.frequency);
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = 1800;
    const gain = ctx.createGain();
    gain.gain.value = 0.0001;
    gain.gain.setTargetAtTime(0.035, ctx.currentTime, 0.3);
    osc.connect(filter).connect(gain).connect(this.master);
    osc.start();
    lfo.start();
    this.siren = { osc, lfo, gain };
  }

  setSirenDistance(closeness) {
    if (this.siren) this.siren.gain.gain.setTargetAtTime(0.015 + closeness * 0.05, this.ctx.currentTime, 0.2);
  }

  stopSiren() {
    if (!this.siren) return;
    const s = this.siren;
    this.siren = null;
    const t = this.ctx.currentTime;
    s.gain.gain.setTargetAtTime(0.0001, t, 0.2);
    s.osc.stop(t + 1);
    s.lfo.stop(t + 1);
  }
}
