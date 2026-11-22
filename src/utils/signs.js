import * as THREE from 'three';
import { canvasTexture } from './textures.js';

// =============================================================
// Signs, facades and adverts - all painted with the Canvas 2D API.
// Every business, brand and movie here is fictional.
// =============================================================

const FONT = '"Segoe UI", Roboto, Arial, sans-serif';

function fitFont(ctx, text, weight, maxSize, maxWidth, family = FONT) {
  let size = maxSize;
  do {
    ctx.font = `${weight} ${size}px ${family}`;
    size -= 2;
  } while (ctx.measureText(text).width > maxWidth && size > 8);
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// ---------- Building facades: day map + night emissive map ----------
// One texture repeat = 12 m, i.e. 4 x 4 windows of 3 m. 512 px for detail.
function facadePair(drawDay, drawNight) {
  const map = canvasTexture(512, 512, drawDay);
  const emissiveMap = canvasTexture(512, 512, drawNight);
  map.anisotropy = 4;
  return { map, emissiveMap };
}

/** Rain stains & grime running down a wall - very typical of Indian buildings. */
function weather(ctx, w, h, strength = 0.12) {
  for (let i = 0; i < 26; i++) {
    const x = Math.random() * w;
    const y = Math.random() * h;
    const g = ctx.createLinearGradient(0, y, 0, y + 60 + Math.random() * 120);
    g.addColorStop(0, `rgba(60,55,45,${strength})`);
    g.addColorStop(1, 'rgba(60,55,45,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, 3 + Math.random() * 10, 180);
  }
  for (let i = 0; i < 4000; i++) {
    ctx.fillStyle = `rgba(0,0,0,${Math.random() * 0.05})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
  }
}

function glassPane(ctx, x, y, w, h) {
  const g = ctx.createLinearGradient(x, y, x + w, y + h);
  g.addColorStop(0, '#5a7896');
  g.addColorStop(0.45, '#2a3c52');
  g.addColorStop(0.55, '#3c5470');
  g.addColorStop(1, '#1d2a3a');
  ctx.fillStyle = g;
  ctx.fillRect(x, y, w, h);
}

export function makeFacade(kind) {
  const cells = [];
  for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) cells.push({ r, c, lit: Math.random() < 0.45, ac: Math.random() < 0.3, curtain: Math.random() });
  const litColors = ['#ffd9a0', '#ffe8c0', '#fff4dc', '#ffcf80', '#cfe8ff'];
  const S = 128; // pixels per 3 m cell

  if (kind === 'office') {
    return facadePair(
      (ctx, w, h) => {
        ctx.fillStyle = '#c9d0d8';
        ctx.fillRect(0, 0, w, h);
        for (const { r, c, curtain } of cells) {
          glassPane(ctx, c * S + 6, r * S + 10, S - 12, S - 22);
          // sky reflection band and a few drawn blinds
          ctx.fillStyle = 'rgba(200,225,250,0.18)';
          ctx.fillRect(c * S + 6, r * S + 10, S - 12, 18);
          if (curtain > 0.6) {
            ctx.fillStyle = 'rgba(230,230,220,0.35)';
            ctx.fillRect(c * S + 6, r * S + 10, S - 12, (S - 22) * (curtain - 0.5));
          }
          ctx.fillStyle = '#e6eaee';
          ctx.fillRect(c * S, r * S + S - 12, S, 12); // spandrel
          ctx.fillRect(c * S + S / 2 - 2, r * S + 10, 4, S - 22); // mullion
        }
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        for (const { r, c, lit } of cells) {
          if (!lit) continue;
          ctx.fillStyle = '#dfefff';
          ctx.fillRect(c * S + 6, r * S + 10, S - 12, S - 22);
        }
      }
    );
  }

  if (kind === 'shop') {
    const shopColors = ['#c1121f', '#1d3557', '#2a9d8f', '#e76f51', '#6a4c93', '#e9c46a'];
    return facadePair(
      (ctx, w, h) => {
        ctx.fillStyle = '#f2efe8';
        ctx.fillRect(0, 0, w, h);
        weather(ctx, w, h);
        for (let c = 0; c < 4; c++) {
          // ground floor (bottom quarter): rolling shutter or glass storefront
          const x = c * S;
          if (c % 2) {
            ctx.fillStyle = '#9aa1ab';
            ctx.fillRect(x + 6, 3 * S + 24, S - 12, S - 24);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            for (let y = 3 * S + 26; y < h; y += 6) ctx.fillRect(x + 6, y, S - 12, 2);
          } else {
            glassPane(ctx, x + 6, 3 * S + 24, S - 12, S - 24);
            ctx.fillStyle = 'rgba(255,240,200,0.25)';
            ctx.fillRect(x + 20, 3 * S + 60, 30, 40); // goods on display
          }
          ctx.fillStyle = shopColors[(c * 3) % shopColors.length];
          ctx.fillRect(x + 4, 3 * S + 6, S - 8, 16); // fascia
          // upper floors: windows with grills
          for (let r = 0; r < 3; r++) {
            const y = r * S;
            ctx.fillStyle = '#d6d0c4';
            ctx.fillRect(x + 26, y + 24, 76, 70);
            glassPane(ctx, x + 30, y + 28, 68, 62);
            ctx.fillStyle = '#3d4148';
            for (let k = 0; k < 6; k++) ctx.fillRect(x + 32 + k * 12, y + 28, 2, 62);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            ctx.fillRect(x + 22, y + 94, 84, 6); // sill shadow
          }
        }
      },
      (ctx, w, h) => {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, w, h);
        for (let c = 0; c < 4; c++) {
          ctx.fillStyle = '#ffe2a8';
          ctx.fillRect(c * S + 6, 3 * S + 24, S - 12, S - 24);
          ctx.fillStyle = shopColors[(c * 3) % shopColors.length];
          ctx.fillRect(c * S + 4, 3 * S + 6, S - 8, 16);
          for (let r = 0; r < 3; r++) {
            if (Math.random() < 0.4) {
              ctx.fillStyle = '#ffd9a0';
              ctx.fillRect(c * S + 30, r * S + 28, 68, 62);
            }
          }
        }
      }
    );
  }

  // 'apartment' (default) and 'house'
  const small = kind === 'house';
  const laundry = ['#e63946', '#f1faee', '#457b9d', '#ffb703', '#2a9d8f', '#ff70a6'];
  return facadePair(
    (ctx, w, h) => {
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, w, h);
      weather(ctx, w, h, small ? 0.16 : 0.1);
      for (const { r, c, ac } of cells) {
        const x = c * S;
        const y = r * S;
        ctx.fillStyle = 'rgba(0,0,0,0.10)';
        ctx.fillRect(x, y + S - 10, S, 10); // floor slab band
        const wx = small ? x + 36 : x + 18;
        const ww = small ? 56 : 92;
        const wh = small ? 60 : 72;
        ctx.fillStyle = '#cfc8bb';
        ctx.fillRect(wx - 5, y + 16, ww + 10, wh + 10); // frame
        glassPane(ctx, wx, y + 21, ww, wh);
        ctx.fillStyle = '#3a3e44';
        for (let k = 1; k < 6; k++) ctx.fillRect(wx + (ww / 6) * k, y + 21, 2, wh); // grill
        ctx.fillRect(wx, y + 21 + wh / 2, ww, 2);
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(wx - 7, y + 21 + wh + 4, ww + 14, 7); // sill
        if (ac && !small) {
          ctx.fillStyle = '#e8e8e4';
          ctx.fillRect(wx + ww - 34, y + 21 + wh + 12, 38, 22); // split AC unit
          ctx.fillStyle = '#9a9a96';
          for (let k = 0; k < 4; k++) ctx.fillRect(wx + ww - 30 + k * 8, y + 21 + wh + 16, 4, 14);
        }
        if (!small && c % 2 === 0) {
          ctx.fillStyle = '#7d838c';
          for (let k = 0; k < 10; k++) ctx.fillRect(x + 6 + k * 12, y + 86, 3, 30); // balcony rail
          ctx.fillRect(x + 4, y + 84, S - 8, 4);
          if (Math.random() < 0.5) {
            for (let k = 0; k < 4; k++) {
              ctx.fillStyle = laundry[Math.floor(Math.random() * laundry.length)];
              ctx.fillRect(x + 14 + k * 26, y + 70, 16, 22); // drying clothes
            }
          }
        }
      }
    },
    (ctx, w, h) => {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, w, h);
      for (const { r, c, lit } of cells) {
        if (!lit) continue;
        ctx.fillStyle = litColors[(r + c) % litColors.length];
        if (small) ctx.fillRect(c * S + 36, r * S + 21, 56, 60);
        else ctx.fillRect(c * S + 18, r * S + 21, 92, 72);
      }
    }
  );
}
// ---------- Text signs ----------
/**
 * A rectangular sign. Returns a texture.
 * @param {object} o { text, sub, bg, fg, w, h, border, icon: 'cross'|'fuel'|null }
 */
export function makeSign({ text, sub = '', bg = '#ffffff', fg = '#111111', w = 512, h = 128, border = null, icon = null, subColor = null }) {
  const tex = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);
    let left = 0;
    if (icon === 'cross') {
      const s = h * 0.62;
      const x = h * 0.18;
      const y = (h - s) / 2;
      ctx.fillStyle = '#e11d2e';
      ctx.fillRect(x + s / 3, y, s / 3, s);
      ctx.fillRect(x, y + s / 3, s, s / 3);
      left = h * 0.95;
    }
    ctx.fillStyle = fg;
    ctx.textBaseline = 'middle';
    ctx.textAlign = 'center';
    const cx = left + (w - left) / 2;
    if (sub) {
      fitFont(ctx, text, 900, h * 0.48, w - left - 30);
      ctx.fillText(text, cx, h * 0.38);
      ctx.fillStyle = subColor || fg;
      fitFont(ctx, sub, 700, h * 0.24, w - left - 30);
      ctx.fillText(sub, cx, h * 0.78);
    } else {
      fitFont(ctx, text, 900, h * 0.62, w - left - 30);
      ctx.fillText(text, cx, h * 0.54);
    }
    if (border) {
      ctx.strokeStyle = border;
      ctx.lineWidth = Math.max(4, h * 0.05);
      ctx.strokeRect(3, 3, w - 6, h - 6);
    }
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

// ---------- Highway signs ----------
function arrow(ctx, x, y, size, dir) {
  // dir: 'up' | 'left' | 'right' | 'upright' | 'upleft'
  const angle = { up: 0, right: Math.PI / 2, left: -Math.PI / 2, upright: Math.PI / 4, upleft: -Math.PI / 4 }[dir] || 0;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, -size / 2);
  ctx.lineTo(size * 0.42, -size * 0.05);
  ctx.lineTo(size * 0.14, -size * 0.05);
  ctx.lineTo(size * 0.14, size / 2);
  ctx.lineTo(-size * 0.14, size / 2);
  ctx.lineTo(-size * 0.14, -size * 0.05);
  ctx.lineTo(-size * 0.42, -size * 0.05);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

/** Green Indian highway direction sign: rows of { city, km, dir }. */
export function makeDirectionSign(rows, title = 'NH 44') {
  const w = 1024;
  const h = 512;
  const tex = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#0b7a3b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 10;
    roundRect(ctx, 14, 14, w - 28, h - 28, 22);
    ctx.stroke();
    // national highway shield
    ctx.fillStyle = '#ffffff';
    roundRect(ctx, 40, 36, 190, 70, 12);
    ctx.fill();
    ctx.fillStyle = '#0b7a3b';
    ctx.font = `900 46px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(title, 135, 73);

    const rowH = (h - 140) / rows.length;
    rows.forEach((row, i) => {
      const y = 140 + rowH * (i + 0.5);
      ctx.fillStyle = '#ffffff';
      arrow(ctx, 90, y, rowH * 0.62, row.dir);
      ctx.textAlign = 'left';
      fitFont(ctx, row.city, 800, rowH * 0.62, 560);
      ctx.fillText(row.city, 160, y + 4);
      ctx.textAlign = 'right';
      ctx.font = `800 ${Math.floor(rowH * 0.58)}px ${FONT}`;
      ctx.fillText(`${row.km} km`, w - 50, y + 4);
    });
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 8;
  return tex;
}

export function makeExitSign(city, km) {
  const w = 512;
  const h = 320;
  const tex = canvasTexture(w, h, (ctx) => {
    ctx.fillStyle = '#0b7a3b';
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 8;
    ctx.strokeRect(10, 10, w - 20, h - 20);
    ctx.fillStyle = '#ffd21a';
    ctx.fillRect(30, 30, 150, 60);
    ctx.fillStyle = '#111';
    ctx.font = `900 44px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('EXIT', 105, 62);
    ctx.fillStyle = '#fff';
    fitFont(ctx, city, 900, 70, w - 80);
    ctx.fillText(city, w / 2, 160);
    ctx.font = `800 52px ${FONT}`;
    ctx.fillText(km, w / 2 - 40, 250);
    arrow(ctx, w - 90, 245, 80, 'upleft');
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function makeSpeedLimitSign(limit) {
  const tex = canvasTexture(256, 256, (ctx) => {
    ctx.clearRect(0, 0, 256, 256);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(128, 128, 124, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#d6101f';
    ctx.lineWidth = 26;
    ctx.beginPath();
    ctx.arc(128, 128, 108, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#111';
    ctx.font = `900 ${limit >= 100 ? 92 : 108}px ${FONT}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(String(limit), 128, 136);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Red-bordered triangle warning sign with a curve arrow + text plate. */
export function makeWarningSign(kind) {
  const tex = canvasTexture(256, 340, (ctx) => {
    ctx.clearRect(0, 0, 256, 340);
    ctx.fillStyle = '#ffffff';
    ctx.strokeStyle = '#d6101f';
    ctx.lineWidth = 22;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(128, 18);
    ctx.lineTo(240, 214);
    ctx.lineTo(16, 214);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#111';
    ctx.fillStyle = '#111';
    ctx.lineWidth = 14;
    ctx.beginPath();
    if (kind === 'left' || kind === 'right') {
      const s = kind === 'left' ? -1 : 1;
      ctx.moveTo(128, 190);
      ctx.lineTo(128, 140);
      ctx.quadraticCurveTo(128, 100, 128 + s * 36, 96);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(128 + s * 54, 96);
      ctx.lineTo(128 + s * 30, 78);
      ctx.lineTo(128 + s * 30, 114);
      ctx.fill();
    } else if (kind === 'camera') {
      ctx.fillRect(84, 120, 76, 50);
      ctx.beginPath();
      ctx.arc(122, 145, 16, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
    } else {
      ctx.font = `900 120px ${FONT}`;
      ctx.textAlign = 'center';
      ctx.fillText('!', 128, 190);
    }
    const label = { left: 'LEFT CURVE AHEAD', right: 'RIGHT CURVE AHEAD', camera: 'SPEED CAMERA', works: 'MEN AT WORK' }[kind] || 'CAUTION';
    ctx.fillStyle = '#ffd21a';
    ctx.fillRect(8, 240, 240, 92);
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const words = label.split(' ');
    const line1 = words.slice(0, Math.ceil(words.length / 2)).join(' ');
    const line2 = words.slice(Math.ceil(words.length / 2)).join(' ');
    fitFont(ctx, line1, 900, 40, 220);
    ctx.fillText(line1, 128, 266);
    fitFont(ctx, line2, 900, 40, 220);
    ctx.fillText(line2, 128, 308);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/** Indian national-highway kilometre stone: yellow top, white body. */
export function makeKmStone(nh, city, km) {
  const tex = canvasTexture(128, 192, (ctx) => {
    ctx.fillStyle = '#f5f5f0';
    ctx.fillRect(0, 0, 128, 192);
    ctx.fillStyle = '#ffc61a';
    ctx.beginPath();
    ctx.moveTo(0, 70);
    ctx.lineTo(0, 30);
    ctx.quadraticCurveTo(64, -14, 128, 30);
    ctx.lineTo(128, 70);
    ctx.fill();
    ctx.fillStyle = '#111';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `900 22px ${FONT}`;
    ctx.fillText(nh, 64, 48);
    fitFont(ctx, city, 800, 22, 118);
    ctx.fillText(city, 64, 100);
    ctx.font = `900 40px ${FONT}`;
    ctx.fillText(String(km), 64, 148);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

// ---------- Billboards (fictional adverts) ----------
export const ADS = [
  { title: 'BIG SALE', sub: 'UP TO 70% OFF - THIS WEEKEND', c1: '#ff1f4b', c2: '#ffb300', art: 'tag' },
  { title: 'NEW CAR LAUNCH', sub: 'VOLTRA SPARK EV - BOOK NOW', c1: '#003b5c', c2: '#00b4d8', art: 'car' },
  { title: 'GALAXY MALL', sub: 'GRAND OPENING - 200+ BRANDS', c1: '#3a0ca3', c2: '#f72585', art: 'building' },
  { title: 'SPICE GARDEN', sub: 'BEST BIRYANI ON THE HIGHWAY', c1: '#8a1c00', c2: '#ff7b00', art: 'bowl' },
  { title: 'HOTEL SKYLINE', sub: 'LUXURY STAYS FROM ₹2,999', c1: '#1b263b', c2: '#c9a227', art: 'building' },
  { title: 'TOOFAN', sub: 'IN CINEMAS THIS FRIDAY', c1: '#0d0d0d', c2: '#9d0208', art: 'movie' },
  { title: 'NOVA PHONE X', sub: '5G • 200MP CAMERA • 2-DAY BATTERY', c1: '#10002b', c2: '#7b2cbf', art: 'phone' },
  { title: 'GREEN VALLEY HOMES', sub: '2 & 3 BHK FLATS • READY TO MOVE', c1: '#1b4332', c2: '#74c69d', art: 'building' },
  { title: 'CITY CARE HOSPITAL', sub: '24x7 EMERGENCY • CALL 108', c1: '#ffffff', c2: '#cfe8ff', art: 'cross', dark: true },
  { title: 'EXPLORE THE HILLS', sub: 'TOURISM DEPT. - VISIT THIS SUMMER', c1: '#023e8a', c2: '#90e0ef', art: 'mountain' },
  { title: 'MASALA CHAI', sub: 'FRESH • HOT • ₹10 ONLY', c1: '#6f1d1b', c2: '#bb9457', art: 'bowl' },
];

function drawArt(ctx, art, x, y, s, color) {
  ctx.save();
  ctx.translate(x, y);
  ctx.fillStyle = color;
  ctx.strokeStyle = color;
  ctx.lineWidth = s * 0.06;
  switch (art) {
    case 'car':
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.1);
      ctx.lineTo(-s * 0.42, -s * 0.05);
      ctx.lineTo(-s * 0.15, -s * 0.1);
      ctx.lineTo(0, -s * 0.25);
      ctx.lineTo(s * 0.25, -s * 0.25);
      ctx.lineTo(s * 0.45, -s * 0.05);
      ctx.lineTo(s * 0.5, s * 0.1);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.beginPath();
      ctx.arc(-s * 0.28, s * 0.12, s * 0.1, 0, Math.PI * 2);
      ctx.arc(s * 0.3, s * 0.12, s * 0.1, 0, Math.PI * 2);
      ctx.fill();
      break;
    case 'phone':
      roundRect(ctx, -s * 0.18, -s * 0.38, s * 0.36, s * 0.76, s * 0.06);
      ctx.fill();
      ctx.fillStyle = '#111';
      roundRect(ctx, -s * 0.15, -s * 0.33, s * 0.3, s * 0.64, s * 0.04);
      ctx.fill();
      break;
    case 'bowl':
      ctx.beginPath();
      ctx.arc(0, 0, s * 0.35, 0, Math.PI);
      ctx.fill();
      for (let i = -1; i <= 1; i++) {
        ctx.beginPath();
        ctx.moveTo(i * s * 0.12, -s * 0.05);
        ctx.quadraticCurveTo(i * s * 0.12 + s * 0.08, -s * 0.2, i * s * 0.12, -s * 0.35);
        ctx.stroke();
      }
      break;
    case 'building':
      for (let i = 0; i < 4; i++) ctx.fillRect(-s * 0.45 + i * s * 0.23, -s * (0.1 + (i % 2 ? 0.35 : 0.2)), s * 0.2, s * (0.5 + (i % 2 ? 0.35 : 0.2)));
      break;
    case 'movie':
      ctx.beginPath();
      ctx.moveTo(-s * 0.2, -s * 0.3);
      ctx.lineTo(s * 0.3, 0);
      ctx.lineTo(-s * 0.2, s * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    case 'cross':
      ctx.fillStyle = '#e11d2e';
      ctx.fillRect(-s * 0.1, -s * 0.32, s * 0.2, s * 0.64);
      ctx.fillRect(-s * 0.32, -s * 0.1, s * 0.64, s * 0.2);
      break;
    case 'mountain':
      ctx.beginPath();
      ctx.moveTo(-s * 0.5, s * 0.3);
      ctx.lineTo(-s * 0.15, -s * 0.3);
      ctx.lineTo(s * 0.05, 0);
      ctx.lineTo(s * 0.22, -s * 0.18);
      ctx.lineTo(s * 0.5, s * 0.3);
      ctx.closePath();
      ctx.fill();
      break;
    default: // price tag
      ctx.beginPath();
      ctx.moveTo(-s * 0.35, -s * 0.2);
      ctx.lineTo(s * 0.2, -s * 0.2);
      ctx.lineTo(s * 0.4, 0);
      ctx.lineTo(s * 0.2, s * 0.2);
      ctx.lineTo(-s * 0.35, s * 0.2);
      ctx.closePath();
      ctx.fill();
  }
  ctx.restore();
}

export function makeAdTexture(ad) {
  const w = 1024;
  const h = 448;
  const tex = canvasTexture(w, h, (ctx) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, ad.c1);
    g.addColorStop(1, ad.c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
    // light rays
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 8; i++) {
      ctx.beginPath();
      ctx.moveTo(w * 0.78, h * 0.5);
      ctx.lineTo(w * 0.78 + Math.cos(i * 0.8) * w, h * 0.5 + Math.sin(i * 0.8) * w);
      ctx.lineTo(w * 0.78 + Math.cos(i * 0.8 + 0.25) * w, h * 0.5 + Math.sin(i * 0.8 + 0.25) * w);
      ctx.fill();
    }
    const fg = ad.dark ? '#0b3d91' : '#ffffff';
    drawArt(ctx, ad.art, w * 0.8, h * 0.52, h * 0.7, ad.dark ? '#0b3d91' : 'rgba(255,255,255,0.92)');
    ctx.fillStyle = fg;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = 'rgba(0,0,0,0.4)';
    ctx.shadowBlur = ad.dark ? 0 : 12;
    fitFont(ctx, ad.title, 900, 120, w * 0.6);
    ctx.fillText(ad.title, 44, h * 0.4);
    ctx.shadowBlur = 0;
    ctx.fillStyle = ad.dark ? '#e11d2e' : '#ffe66d';
    fitFont(ctx, ad.sub, 800, 44, w * 0.62);
    ctx.fillText(ad.sub, 48, h * 0.72);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.anisotropy = 4;
  return tex;
}

/** Kerb stones: alternating black & white blocks (repeat along the road). */
export function makeKerbTexture() {
  return canvasTexture(64, 128, (ctx) => {
    ctx.fillStyle = '#f2f2f2';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#1a1a1a';
    ctx.fillRect(0, 64, 64, 64);
  });
}


/** Yellow & black chevron board pointing into a curve (dir -1 = left, 1 = right). */
export function makeChevronTexture(dir) {
  const tex = canvasTexture(128, 160, (ctx, w, h) => {
    ctx.fillStyle = '#ffd21a';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#111';
    for (const y of [30, 90]) {
      ctx.beginPath();
      const x0 = dir > 0 ? 30 : 98;
      const x1 = dir > 0 ? 98 : 30;
      ctx.moveTo(x0, y - 22);
      ctx.lineTo(x1, y + 18);
      ctx.lineTo(x0, y + 58);
      ctx.lineTo(x0 + (x1 - x0) * 0.3, y + 58);
      ctx.lineTo(x1 - (x1 - x0) * 0.3, y + 18);
      ctx.lineTo(x0 + (x1 - x0) * 0.3, y - 22);
      ctx.closePath();
      ctx.fill();
    }
    ctx.strokeStyle = '#111';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}
