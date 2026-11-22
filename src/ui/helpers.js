// Small DOM helpers shared by the UI screens.

export const byId = (id) => document.getElementById(id);

export const fmt = (n) => Math.floor(n).toLocaleString('en-US');

/** Restart a CSS animation by removing and re-adding a class. */
export function retrigger(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth; // forces the browser to notice the removal
  el.classList.add(cls);
}

/** Counts a number up from `from` to `to` over `ms` milliseconds. */
export function animateNumber(el, from, to, ms = 800) {
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / ms);
    const eased = 1 - (1 - t) ** 3; // ease-out cubic
    el.textContent = fmt(from + (to - from) * eased);
    if (t < 1) requestAnimationFrame(step);
  };
  requestAnimationFrame(step);
}

const STAT_LABELS = { speed: 'SPEED', handling: 'HANDLING', accel: 'ACCELERATION' };

export function statBarsHTML(stats, compact = false) {
  return Object.entries(STAT_LABELS)
    .map(([key, label]) => `
      <div class="stat ${compact ? 'compact' : ''}">
        <span class="stat-label">${compact ? label.slice(0, 5) : label}</span>
        <div class="stat-bar"><i style="width:${stats[key] * 10}%"></i></div>
        ${compact ? '' : `<b class="stat-value">${stats[key]}</b>`}
      </div>`)
    .join('');
}

/** Side-view car silhouette used on shop cards. */
export function carSilhouetteSVG(color, accent) {
  return `
  <svg viewBox="0 0 220 90" class="car-svg" aria-hidden="true">
    <ellipse cx="110" cy="78" rx="96" ry="7" fill="rgba(0,0,0,0.45)"/>
    <path d="M14 62 L20 48 Q34 42 60 39 L88 24 Q100 17 124 17 L144 19 Q162 23 178 36 L198 40 Q208 42 208 52 L208 62 Z"
          fill="${color}" stroke="rgba(255,255,255,0.35)" stroke-width="1.5"/>
    <path d="M94 27 Q103 22 122 22 L140 23 Q152 26 162 36 L92 38 Z" fill="rgba(8,16,32,0.9)"/>
    <line x1="127" y1="22" x2="127" y2="37" stroke="${color}" stroke-width="3"/>
    <rect x="24" y="52" width="180" height="3" rx="1.5" fill="${accent}" opacity="0.9"/>
    <rect x="198" y="44" width="10" height="4" rx="2" fill="#eaf6ff"/>
    <rect x="14" y="46" width="8" height="4" rx="2" fill="#ff2340"/>
    <circle cx="58" cy="63" r="13" fill="#0b0b0e" stroke="#9aa3b5" stroke-width="3"/>
    <circle cx="166" cy="63" r="13" fill="#0b0b0e" stroke="#9aa3b5" stroke-width="3"/>
    <circle cx="58" cy="63" r="4" fill="#cfd6e2"/>
    <circle cx="166" cy="63" r="4" fill="#cfd6e2"/>
  </svg>`;
}
