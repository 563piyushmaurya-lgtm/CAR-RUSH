import * as THREE from 'three';

// =============================================================
// Procedural textures drawn with the 2D Canvas API.
// No image files needed - we "paint" road lines, windows and
// billboards with code, then hand the canvas to Three.js.
// =============================================================

export function canvasTexture(width, height, draw, { srgb = true } = {}) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  draw(canvas.getContext('2d'), width, height);
  const tex = new THREE.CanvasTexture(canvas);
  if (srgb) tex.colorSpace = THREE.SRGBColorSpace;
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  return tex;
}

/**
 * Asphalt for an undivided two-way highway:
 * paved shoulders, white edge lines, dashed lane lines and a double
 * yellow centre line between the two directions. One tile = `tileLength` m.
 */
export function makeRoadTexture(surfaceWidth, tileLength, lanes, directions) {
  return canvasTexture(1024, 1024, (ctx, w, h) => {
    const toPx = (x) => ((x + surfaceWidth / 2) / surfaceWidth) * w;
    const laneL = lanes[0] - 1.5;
    const laneR = lanes[lanes.length - 1] + 1.5;

    // shoulders (lighter, dusty) and carriageway
    ctx.fillStyle = '#5a5650';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = '#34353b';
    ctx.fillRect(toPx(laneL), 0, toPx(laneR) - toPx(laneL), h);

    // grainy asphalt noise
    for (let i = 0; i < 26000; i++) {
      const g = 30 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgba(${g},${g},${g + 4},0.5)`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 2);
    }
    // patch repairs & cracks for a lived-in Indian road
    for (let i = 0; i < 6; i++) {
      ctx.fillStyle = `rgba(20,20,22,${0.15 + Math.random() * 0.15})`;
      ctx.fillRect(toPx(laneL) + Math.random() * (toPx(laneR) - toPx(laneL) - 80), Math.random() * h, 40 + Math.random() * 90, 20 + Math.random() * 70);
    }
    // darker tyre tracks
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    for (const lx of lanes) for (const off of [-0.75, 0.75]) ctx.fillRect(toPx(lx + off) - 12, 0, 24, h);

    // solid white edge lines
    ctx.fillStyle = '#eef0f4';
    ctx.fillRect(toPx(laneL) - 7, 0, 12, h);
    ctx.fillRect(toPx(laneR) - 5, 0, 12, h);

    const dash = h * (4.5 / tileLength);
    for (let i = 0; i < lanes.length - 1; i++) {
      const x = toPx((lanes[i] + lanes[i + 1]) / 2);
      if (directions[i] !== directions[i + 1]) {
        // centre: double yellow line (no physical divider)
        ctx.fillStyle = '#f2c414';
        ctx.fillRect(x - 13, 0, 8, h);
        ctx.fillRect(x + 5, 0, 8, h);
      } else {
        ctx.fillStyle = '#eef0f4';
        ctx.fillRect(x - 5, (h - dash) / 2, 10, dash);
      }
    }
  });
}

export function makeGroundTexture() {
  return canvasTexture(256, 256, (ctx, w, h) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, w, h);
    // light/dark speckles; the ground material colour tints this per zone
    for (let i = 0; i < 4000; i++) {
      const v = 200 + Math.floor(Math.random() * 55);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 3, 3);
    }
    for (let i = 0; i < 1500; i++) {
      const v = 150 + Math.floor(Math.random() * 40);
      ctx.fillStyle = `rgb(${v},${v},${v})`;
      ctx.fillRect(Math.random() * w, Math.random() * h, 2, 4);
    }
  });
}
/** 4x4 grid of building windows, some lit. */
export function makeWindowTexture() {
  return canvasTexture(128, 128, (ctx, w, h) => {
    ctx.fillStyle = '#151a2b';
    ctx.fillRect(0, 0, w, h);
    const lit = ['#ffd79a', '#ffe9c4', '#8fe9ff', '#ff9ad5', '#ffcf7a'];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 4; c++) {
        const on = Math.random() < 0.42;
        ctx.fillStyle = on ? lit[Math.floor(Math.random() * lit.length)] : '#20263b';
        ctx.fillRect(c * 32 + 6, r * 32 + 8, 20, 16);
      }
    }
  });
}

let glowTexture = null;
/** Soft white radial gradient, used for glows, light pools and underglow. */
export function getGlowTexture() {
  if (glowTexture) return glowTexture;
  glowTexture = canvasTexture(128, 128, (ctx, w, h) => {
    const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, w / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.45)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);
  });
  glowTexture.wrapS = glowTexture.wrapT = THREE.ClampToEdgeWrapping;
  return glowTexture;
}

/** Roadside advert for one of our fictional brands. */
export function makeBillboardTexture({ brand, slogan, c1, c2, accent }) {
  const tex = canvasTexture(512, 230, (ctx, w, h) => {
    const g = ctx.createLinearGradient(0, 0, w, h);
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // diagonal speed stripes
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let i = 0; i < 7; i++) {
      const x = i * 90 + 120;
      ctx.beginPath();
      ctx.moveTo(x - 60, h);
      ctx.lineTo(x + 20, 0);
      ctx.lineTo(x + 50, 0);
      ctx.lineTo(x - 30, h);
      ctx.fill();
    }

    // brand name, shrunk until it fits
    let size = 82;
    ctx.textBaseline = 'middle';
    do {
      ctx.font = `900 ${size}px Orbitron, "Segoe UI", sans-serif`;
      size -= 4;
    } while (ctx.measureText(brand).width > w - 60 && size > 20);
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = accent;
    ctx.shadowBlur = 18;
    ctx.fillText(brand, 30, h * 0.42);

    ctx.shadowBlur = 0;
    ctx.font = '700 30px Rajdhani, "Segoe UI", sans-serif';
    ctx.fillStyle = accent;
    ctx.fillText(slogan.toUpperCase(), 34, h * 0.78);

    ctx.strokeStyle = accent;
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, w - 6, h - 6);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

/**
 * Scales a BoxGeometry's UVs so a window texture repeats once per `unit`
 * metres instead of stretching across the whole face.
 * Box faces are stored in order: +x, -x, +y, -y, +z, -z (4 vertices each).
 */
export function scaleBoxUVs(geo, w, h, d, unit) {
  const uv = geo.attributes.uv;
  for (let face = 0; face < 6; face++) {
    let su;
    let sv;
    if (face < 2) [su, sv] = [d / unit, h / unit]; // sides
    else if (face < 4) [su, sv] = [0, 0]; // roof / floor -> plain
    else [su, sv] = [w / unit, h / unit]; // front / back
    for (let i = 0; i < 4; i++) {
      const idx = face * 4 + i;
      uv.setXY(idx, uv.getX(idx) * su, uv.getY(idx) * sv);
    }
  }
  return geo;
}


// =============================================================
// HIGH-DETAIL ROAD: colour + normal (bumps) + roughness maps
// =============================================================

/** Tileable value noise (wraps at the edges so the road repeats seamlessly). */
function tileNoise(cells) {
  const g = new Float32Array(cells * cells).map(() => Math.random());
  const at = (x, y) => g[((y % cells) + cells) % cells * cells + (((x % cells) + cells) % cells)];
  return (u, v) => {
    const x = u * cells;
    const y = v * cells;
    const x0 = Math.floor(x);
    const y0 = Math.floor(y);
    const fx = x - x0;
    const fy = y - y0;
    const sx = fx * fx * (3 - 2 * fx);
    const sy = fy * fy * (3 - 2 * fy);
    const a = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * sx;
    const b = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * sx;
    return a + (b - a) * sy;
  };
}

/**
 * @returns {{ map, normalMap, roughnessMap }} three textures sharing one layout.
 * One tile = `tileLength` metres along the road.
 */
export function makeRoadMaps(surfaceWidth, tileLength, lanes, directions, size = 1024) {
  const w = size;
  const h = size;
  const toPx = (x) => ((x + surfaceWidth / 2) / surfaceWidth) * w;
  const laneL = toPx(lanes[0] - 1.5);
  const laneR = toPx(lanes[lanes.length - 1] + 1.5);
  const pxPerM = w / surfaceWidth;
  const n1 = tileNoise(6);
  const n2 = tileNoise(24);
  const n3 = tileNoise(96);
  const tracks = [];
  for (const lx of lanes) for (const off of [-0.8, 0.8]) tracks.push(toPx(lx + off));
  const centres = lanes.map(toPx);

  const color = new ImageData(w, h);
  const height = new Float32Array(w * h);
  const rough = new ImageData(w, h);
  for (let y = 0; y < h; y++) {
    const v = y / h;
    for (let x = 0; x < w; x++) {
      const u = x / w;
      const i = y * w + x;
      const inLane = x >= laneL && x <= laneR;
      let track = 0;
      for (const t of tracks) track += Math.exp(-(((x - t) / (0.32 * pxPerM)) ** 2));
      let oil = 0;
      for (const c of centres) oil += Math.exp(-(((x - c) / (0.22 * pxPerM)) ** 2));
      const grain = Math.random();
      const pebble = grain > 0.985 ? 1 : 0;
      let val = (inLane ? 60 : 92) + (n1(u, v) - 0.5) * 16 + (n2(u, v) - 0.5) * 12 + (n3(u, v) - 0.5) * 10 + (grain - 0.5) * 18;
      if (inLane) val -= track * 9 + oil * 7 * n2(u * 3, v * 3);
      val += pebble * 28;
      const r = inLane ? val : val * 1.07;
      const b = inLane ? val * 1.03 : val * 0.9;
      color.data.set([r, val, b, 255], i * 4);
      height[i] = n2(u, v) * 0.5 + n3(u, v) * 0.5 + pebble * 0.6 + grain * 0.25 - (inLane ? track * 0.2 : 0);
      const rv = inLane ? 225 - track * 55 : 245;
      rough.data.set([rv, rv, rv, 255], i * 4);
    }
  }

  // build canvases and draw repairs, cracks and markings on all of them
  const make = (img) => {
    const c = document.createElement('canvas');
    c.width = w;
    c.height = h;
    const ctx = c.getContext('2d');
    if (img) ctx.putImageData(img, 0, 0);
    return { c, ctx };
  };
  const col = make(color);
  const rgh = make(rough);
  const hgt = make(null);
  const himg = new ImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const v = Math.max(0, Math.min(255, height[i] * 160));
    himg.data.set([v, v, v, 255], i * 4);
  }
  hgt.ctx.putImageData(himg, 0, 0);

  // repair patches (slightly different asphalt with a dark seam)
  for (let k = 0; k < 5; k++) {
    const px = laneL + Math.random() * (laneR - laneL - 140);
    const py = Math.random() * (h - 160);
    const pw = 60 + Math.random() * 140;
    const ph = 40 + Math.random() * 120;
    col.ctx.fillStyle = `rgba(${Math.random() < 0.5 ? '30,30,34' : '75,75,78'},0.35)`;
    col.ctx.fillRect(px, py, pw, ph);
    col.ctx.strokeStyle = 'rgba(15,15,18,0.6)';
    col.ctx.lineWidth = 2;
    col.ctx.strokeRect(px, py, pw, ph);
    hgt.ctx.strokeStyle = '#000';
    hgt.ctx.lineWidth = 2;
    hgt.ctx.strokeRect(px, py, pw, ph);
  }
  // cracks: wandering dark lines
  for (let k = 0; k < 14; k++) {
    let cx = laneL + Math.random() * (laneR - laneL);
    let cy = Math.random() * h;
    const pts = [[cx, cy]];
    let dir = Math.random() * Math.PI * 2;
    for (let s = 0; s < 18; s++) {
      dir += (Math.random() - 0.5) * 0.9;
      cx += Math.cos(dir) * 9;
      cy += Math.sin(dir) * 9;
      pts.push([cx, cy]);
    }
    for (const [ctx, style] of [[col.ctx, 'rgba(12,12,14,0.7)'], [hgt.ctx, '#000']]) {
      ctx.strokeStyle = style;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i ? ctx.lineTo(px, py) : ctx.moveTo(px, py)));
      ctx.stroke();
    }
  }

  // road markings: thermoplastic paint, raised a little and worn at the edges
  const marks = [];
  marks.push({ x: laneL - 7, w: 12, y0: 0, y1: h, color: '#eef0f3' });
  marks.push({ x: laneR - 5, w: 12, y0: 0, y1: h, color: '#eef0f3' });
  const dash = h * (4.5 / tileLength);
  for (let i = 0; i < lanes.length - 1; i++) {
    const x = toPx((lanes[i] + lanes[i + 1]) / 2);
    if (directions[i] !== directions[i + 1]) {
      marks.push({ x: x - 14, w: 9, y0: 0, y1: h, color: '#f2c414' });
      marks.push({ x: x + 5, w: 9, y0: 0, y1: h, color: '#f2c414' });
    } else {
      marks.push({ x: x - 5, w: 10, y0: (h - dash) / 2, y1: (h + dash) / 2, color: '#eef0f3' });
    }
  }
  for (const m of marks) {
    col.ctx.fillStyle = m.color;
    col.ctx.fillRect(m.x, m.y0, m.w, m.y1 - m.y0);
    hgt.ctx.fillStyle = '#ffffff';
    hgt.ctx.fillRect(m.x, m.y0, m.w, m.y1 - m.y0);
    rgh.ctx.fillStyle = '#9a9a9a';
    rgh.ctx.fillRect(m.x, m.y0, m.w, m.y1 - m.y0);
    // wear: let asphalt show through in small specks
    col.ctx.fillStyle = 'rgba(55,55,60,0.75)';
    for (let k = 0; k < (m.y1 - m.y0) * 0.35; k++) {
      col.ctx.fillRect(m.x + Math.random() * m.w, m.y0 + Math.random() * (m.y1 - m.y0), 2, 2);
    }
  }

  // normal map from the height map (Sobel filter)
  const hd = hgt.ctx.getImageData(0, 0, w, h).data;
  const nrm = new ImageData(w, h);
  const H = (x, y) => hd[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
  const strength = 2.2;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const dx = (H(x - 1, y) - H(x + 1, y)) * strength;
      const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
      const len = Math.hypot(dx, dy, 1);
      nrm.data.set([((dx / len) * 0.5 + 0.5) * 255, ((dy / len) * 0.5 + 0.5) * 255, (1 / len) * 255, 255], (y * w + x) * 4);
    }
  }
  const nrmC = make(nrm);

  const wrap = (canvas, srgb) => {
    const t = new THREE.CanvasTexture(canvas);
    if (srgb) t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  };
  return { map: wrap(col.c, true), normalMap: wrap(nrmC.c, false), roughnessMap: wrap(rgh.c, false) };
}

/** Grass with dry patches and blade streaks (tinted per zone by the material colour). */
export function makeGrassTexture() {
  const n1 = tileNoise(4);
  const n2 = tileNoise(16);
  return canvasTexture(512, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const dry = Math.max(0, n1(u, v) - 0.55) * 2.2; // straw-coloured patches
        const b = 150 + (n2(u, v) - 0.5) * 70 + (Math.random() - 0.5) * 50;
        img.data.set([b * (1 + dry * 0.5), b * (1 + dry * 0.25), b * (1 - dry * 0.3), 255], (y * w + x) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 2500; i++) {
      const x = Math.random() * w;
      const y = Math.random() * h;
      const v = 110 + Math.random() * 120;
      ctx.strokeStyle = `rgba(${v},${v},${v},0.5)`;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + (Math.random() - 0.5) * 4, y - 4 - Math.random() * 6);
      ctx.stroke();
    }
  });
}

/** Red-brown Indian roadside soil with gravel and wheel ruts. */
export function makeVergeTexture() {
  const n = tileNoise(12);
  return canvasTexture(256, 512, (ctx, w, h) => {
    const img = ctx.createImageData(w, h);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const u = x / w;
        const v = y / h;
        const rut = Math.exp(-(((u - 0.35) / 0.05) ** 2)) * 0.25;
        const grassEdge = Math.max(0, (u - 0.72) / 0.28) * (0.6 + n(u * 2, v * 2) * 0.6);
        const s = (0.85 + (n(u, v) - 0.5) * 0.3 + (Math.random() - 0.5) * 0.25 - rut);
        const r = 150 * s * (1 - grassEdge) + 95 * grassEdge;
        const g = 98 * s * (1 - grassEdge) + 120 * grassEdge;
        const b = 66 * s * (1 - grassEdge) + 55 * grassEdge;
        img.data.set([r, g, b, 255], (y * w + x) * 4);
      }
    }
    ctx.putImageData(img, 0, 0);
    for (let i = 0; i < 900; i++) {
      const v = 120 + Math.random() * 100;
      ctx.fillStyle = `rgb(${v},${v * 0.95},${v * 0.88})`;
      ctx.fillRect(Math.random() * w * 0.8, Math.random() * h, 2, 2);
    }
  });
}
