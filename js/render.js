// Holdfast — all art is drawn here in code (no image assets).
// holdfast-2: soft outlines + shading, textured ground/road, animated scenery (sprites with wind sway),
// ambient life per biome, enemy walk cycles, death animations, tower build/recoil/aim easing, interpolation.
import { WORLD, BIOMES, ENEMIES, TOWERS } from './config.js';
import { mulberry32, hashStr, Path } from './engine.js';

const OUT = 'rgba(42,27,16,.62)';   // soft outline
const OUT2 = 'rgba(42,27,16,.38)';  // lighter detail lines
const TAU = Math.PI * 2;
const M = 170;                      // background margin beyond the world rect (fills any screen shape)
const FONT = 'ui-rounded, "SF Pro Rounded", -apple-system, system-ui, sans-serif';

// ---------- small drawing helpers ----------
function ell(c, x, y, rx, ry, fill, stroke, lw = 1.1) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function circ(c, x, y, r, fill, stroke, lw) { ell(c, x, y, r, r, fill, stroke, lw); }
function poly(c, pts, fill, stroke, lw = 1.1) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); } }
function rrect(c, x, y, w, h, r, fill, stroke, lw = 1.1) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function lg(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function rg(c, x, y, r0, r1, stops, fx, fy) { const g = c.createRadialGradient(fx ?? x, fy ?? y, r0, x, y, r1); for (const [o, col] of stops) g.addColorStop(o, col); return g; }
function line(c, x0, y0, x1, y1, color, w) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); }
function limb(c, x0, y0, x1, y1, w, col) { line(c, x0, y0, x1, y1, OUT, w + 1.6); line(c, x0, y0, x1, y1, col, w); }
let shadowCv = null;
function softShadow(c, x, y, rx, ry, a = 0.3) {
  // one cached blurred ellipse, scaled per use (much cheaper than a gradient per call)
  if (!shadowCv) {
    shadowCv = document.createElement('canvas'); shadowCv.width = shadowCv.height = 64;
    const g = shadowCv.getContext('2d'), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, 'rgba(0,0,0,1)'); gr.addColorStop(0.55, 'rgba(0,0,0,.6)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
  }
  const ga = c.globalAlpha; c.globalAlpha = ga * a; c.drawImage(shadowCv, x - rx, y - ry, rx * 2, ry * 2); c.globalAlpha = ga;
}
const easeOutBack = t => { const c1 = 1.70158, c3 = c1 + 1; return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2); };
const clamp01 = v => Math.max(0, Math.min(1, v));
const lerpAngle = (a, b, k) => { let d = ((b - a + Math.PI) % TAU + TAU) % TAU - Math.PI; return a + d * k; };

// Gradient memo: gradients defined in local (translated) space can be reused every frame.
const gmemo = new WeakMap();
function G(c, key, make) { let m = gmemo.get(c); if (!m) { m = new Map(); gmemo.set(c, m); } let g = m.get(key); if (!g) { g = make(); m.set(key, g); } return g; }

// ---------- sprites ----------
function makeSprite(w, h, ox, oy, k, draw) {
  const cv = document.createElement('canvas');
  cv.width = Math.max(1, Math.ceil(w * k)); cv.height = Math.max(1, Math.ceil(h * k));
  const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, ox * k, oy * k); draw(c);
  return { cv, w, h, ox, oy };
}
function drawSprite(c, s, x, y) { c.drawImage(s.cv, x - s.ox, y - s.oy, s.w, s.h); }
function makeNoise(w, h, rng, colA, colB, alpha = 1) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const c = cv.getContext('2d'), img = c.createImageData(w, h);
  for (let i = 0; i < w * h; i++) {
    const t = rng();
    img.data[i * 4] = colA[0] + (colB[0] - colA[0]) * t; img.data[i * 4 + 1] = colA[1] + (colB[1] - colA[1]) * t;
    img.data[i * 4 + 2] = colA[2] + (colB[2] - colA[2]) * t; img.data[i * 4 + 3] = 255 * alpha;
  }
  c.putImageData(img, 0, 0); return cv;
}
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];

// ---------- decoration art (drawn into sprites) ----------
function treeTrunk(c, s) {
  c.beginPath(); c.moveTo(-3.2 * s, 2); c.quadraticCurveTo(-2 * s, -6 * s, -1.6 * s, -13 * s); c.lineTo(1.6 * s, -13 * s); c.quadraticCurveTo(2 * s, -6 * s, 3.2 * s, 2); c.closePath();
  c.fillStyle = lg(c, -3 * s, 0, 3 * s, 0, [[0, '#7a5232'], [1, '#4f331d']]); c.fill(); c.lineWidth = 1; c.strokeStyle = OUT; c.stroke();
}
function treeCanopy(c, s, v, palette) {
  const blobs = [[-7.5, -4, 8.5], [7.5, -5, 8.5], [0, -12, 10.5], [-3, -2, 7], [4, -1, 6.5]].map(([x, y, r]) => [x * s, y * s, r * s * (0.92 + v * 0.16)]);
  c.lineWidth = 2; c.strokeStyle = 'rgba(30,45,15,.55)';
  for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  const g = rg(c, -3 * s, -14 * s, 2, 20 * s, [[0, palette[0]], [0.55, palette[1]], [1, palette[2]]], -5 * s, -17 * s);
  for (const [x, y, r] of blobs) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); }
  // leaf clusters for texture
  const rr = mulberry32(Math.floor(v * 1e6));
  for (let i = 0; i < 16; i++) { const a = rr() * TAU, d = rr() * 11 * s; const x = Math.cos(a) * d, y = -7 * s + Math.sin(a) * d * 0.8; circ(c, x, y, (1.4 + rr() * 1.6) * s, y < -9 * s ? 'rgba(255,255,210,.16)' : 'rgba(20,50,10,.16)'); }
  if (v < 0.35) for (let i = 0; i < 4; i++) circ(c, (rr() - 0.5) * 16 * s, -4 * s - rr() * 10 * s, 1.5 * s, '#d9483f', 'rgba(90,20,10,.5)', 0.6);
}
function pineArt(c, s, dark, snow) {
  c.beginPath(); c.moveTo(-1.8 * s, 2); c.lineTo(-1.4 * s, -6 * s); c.lineTo(1.4 * s, -6 * s); c.lineTo(1.8 * s, 2); c.closePath(); c.fillStyle = '#4a3020'; c.fill();
  const cols = dark ? ['#2e4d36', '#1a3022', '#244030'] : ['#4b7f45', '#2c5530', '#3b6a3a'];
  for (let i = 0; i < 3; i++) {
    const yy = -4 * s - i * 8.5 * s, w = (12.5 - i * 3) * s, h = 14 * s;
    c.beginPath(); c.moveTo(-w, yy); c.quadraticCurveTo(-w * 0.4, yy - h * 0.35, 0, yy - h); c.quadraticCurveTo(w * 0.4, yy - h * 0.35, w, yy); c.quadraticCurveTo(0, yy + 2.5 * s, -w, yy); c.closePath();
    c.fillStyle = lg(c, -w, 0, w, 0, [[0, cols[0]], [0.6, cols[2]], [1, cols[1]]]); c.fill(); c.lineWidth = 1; c.strokeStyle = OUT; c.stroke();
    if (snow) { c.beginPath(); c.moveTo(-w * 0.6, yy - h * 0.38); c.quadraticCurveTo(0, yy - h * 0.3, w * 0.55, yy - h * 0.42); c.lineTo(0, yy - h); c.closePath(); c.fillStyle = '#f5fafd'; c.fill(); }
  }
}
function bushArt(c, s, col, berries) {
  const b = [[-5, -4, 6], [5, -4, 6], [0, -8, 6.5]].map(([x, y, r]) => [x * s, y * s, r * s]);
  c.lineWidth = 1.8; c.strokeStyle = 'rgba(25,40,15,.5)'; for (const [x, y, r] of b) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.stroke(); }
  const g = rg(c, -2 * s, -10 * s, 1, 12 * s, [[0, col[0]], [1, col[1]]]);
  for (const [x, y, r] of b) { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = g; c.fill(); }
  if (berries) for (const [x, y] of [[-4, -6], [3, -9], [5, -3]]) circ(c, x * s, y * s, 1.2 * s, berries);
}
function flowerArt(c, rng, cols) {
  for (let i = 0; i < 5; i++) {
    const fx = (rng() - 0.5) * 14, fy = (rng() - 0.5) * 6, h = 4 + rng() * 4;
    line(c, fx, fy, fx + (rng() - 0.5) * 2, fy - h, '#4f8a35', 0.9);
    const col = cols[Math.floor(rng() * cols.length)];
    for (let p = 0; p < 5; p++) { const a = p / 5 * TAU; circ(c, fx + Math.cos(a) * 1.5, fy - h + Math.sin(a) * 1.5, 1.2, col); }
    circ(c, fx, fy - h, 0.9, '#ffe27a');
  }
}
function grassArt(c, s, cols) {
  for (let i = 0; i < 6; i++) {
    const x = (i - 2.5) * 1.6 * s, h = (5 + (i % 3) * 2.2) * s, bend = (i - 2.5) * 0.8 * s;
    c.beginPath(); c.moveTo(x - 0.9 * s, 0); c.quadraticCurveTo(x + bend * 0.3, -h * 0.6, x + bend, -h); c.quadraticCurveTo(x + bend * 0.2, -h * 0.5, x + 0.9 * s, 0); c.closePath();
    c.fillStyle = cols[i % cols.length]; c.fill();
  }
}
function rockArt(c, x, y, s, col, hi) {
  softShadow(c, x + 1.5, y + 1, 10 * s, 3.6 * s, 0.3);
  c.beginPath(); c.moveTo(x - 9 * s, y); c.quadraticCurveTo(x - 9 * s, y - 7 * s, x - 3 * s, y - 9.5 * s); c.quadraticCurveTo(x + 4 * s, y - 11 * s, x + 8 * s, y - 6 * s); c.quadraticCurveTo(x + 10 * s, y - 2 * s, x + 9 * s, y); c.closePath();
  c.fillStyle = lg(c, x, y - 10 * s, x, y, [[0, hi], [1, col]]); c.fill(); c.lineWidth = 1; c.strokeStyle = OUT; c.stroke();
  ell(c, x - 2.5 * s, y - 7.5 * s, 3 * s, 1.3 * s, 'rgba(255,255,255,.28)');
}
function mushroomArt(c, x, y, s) {
  rrect(c, x - 1.4 * s, y - 5 * s, 2.8 * s, 5 * s, 1.2, '#f1e7d2', OUT, 0.8);
  c.beginPath(); c.ellipse(x, y - 5 * s, 5 * s, 3.6 * s, 0, Math.PI, 0); c.closePath(); c.fillStyle = lg(c, 0, y - 9 * s, 0, y - 5 * s, [[0, '#e0544b'], [1, '#a82f2f']]); c.fill(); c.lineWidth = 0.8; c.strokeStyle = OUT; c.stroke();
  circ(c, x - 2 * s, y - 6.6 * s, 0.9 * s, '#fff'); circ(c, x + 1.8 * s, y - 6 * s, 0.8 * s, '#fff');
}
function deadTreeArt(c, x, y, s) {
  softShadow(c, x + 2, y + 1, 8 * s, 3 * s, 0.25);
  const br = (x0, y0, x1, y1, w) => { line(c, x0, y0, x1, y1, OUT, w + 1.4); line(c, x0, y0, x1, y1, '#5d4a3a', w); };
  br(x, y, x, y - 22 * s, 3.6 * s);
  for (const [a, l, h] of [[-0.8, 9, 12], [0.7, 10, 16], [-0.5, 6, 20]]) br(x, y - h * s, x + Math.sin(a) * l * s, y - h * s - Math.cos(a) * l * s * 0.6, 1.7 * s);
}
function snowDriftArt(c, x, y, s) { ell(c, x, y + 1, 15 * s, 5 * s, 'rgba(120,150,180,.18)'); ell(c, x, y, 14 * s, 4.6 * s, '#f6fafd'); ell(c, x - 4 * s, y - 1.5 * s, 6 * s, 2 * s, '#ffffff'); }

// ---------- static background ----------
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }
function pathDist(path, x, y) { let m = 1e9; for (let i = 1; i < path.length; i++) m = Math.min(m, segDist(x, y, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])); return m; }

const GROUND_TONES = {
  meadow: { low: ['#5f9440', '#7cae4f'], mid: ['#4e8236', '#8fbf5c'], grass: ['#4c8a33', '#6aa645', '#87bd57'] },
  darkwood: { low: ['#2c4630', '#3f6141'], mid: ['#24392a', '#4a6b44'], grass: ['#2a4a2e', '#3a5e3a', '#4c7246'] },
  frostpeak: { low: ['#c4d8e6', '#e6f0f6'], mid: ['#b2c9da', '#f4f9fc'], grass: ['#9fb6c6', '#c3d4e0', '#e2ecf3'] },
};

// Plans scenery for a map: static items go in the cached background, dynamic ones are animated each frame.
export function planScenery(map) {
  const rng = mulberry32(hashStr(map.id + ':scenery'));
  const P = map.path, rw = WORLD.roadWidth, W = WORLD.w, H = WORLD.h;
  const items = [];
  const ok = (x, y, minPath, minSpot, minOther) => {
    if (pathDist(P, x, y) < minPath) return false;
    if (map.spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < minSpot)) return false;
    if (y > H - 60 && Math.abs(x - P[P.length - 1][0]) < 95) return false;
    if (items.some(d => Math.hypot(d.x - x, d.y - y) < minOther)) return false;
    return true;
  };
  for (let tries = 0; tries < 1400 && items.length < 80; tries++) {
    const x = -M * 0.55 + rng() * (W + M * 1.1), y = -M * 0.35 + rng() * (H + M * 0.6);
    if (!ok(x, y, rw / 2 + 22, 36, 24)) continue;
    const r = rng(), s = 0.8 + rng() * 0.4, ph = rng() * TAU;
    let kind;
    if (map.biome === 'meadow') kind = r < 0.42 ? 'tree' : r < 0.6 ? 'bush' : r < 0.72 ? 'rock' : 'flowers';
    else if (map.biome === 'darkwood') kind = r < 0.5 ? 'pine' : r < 0.6 ? 'dead' : r < 0.74 ? 'mush' : r < 0.88 ? 'bush' : 'glowflower';
    else kind = r < 0.5 ? 'pine' : r < 0.7 ? 'rock' : 'drift';
    items.push({ kind, x, y, s, ph, v: rng() });
  }
  // grass tufts, denser near the road edges
  const path = new Path(P);
  for (let d = 0; d < path.total; d += 16) {
    if (rng() < 0.5) continue;
    const p = path.at(d), side = rng() < 0.5 ? -1 : 1, off = rw / 2 + 4 + rng() * 8;
    const x = p.x + Math.cos(p.a + Math.PI / 2) * off * side, y = p.y + Math.sin(p.a + Math.PI / 2) * off * side;
    if (pathDist(P, x, y) < rw / 2 + 2) continue;
    if (map.spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 24)) continue;
    items.push({ kind: 'grass', x, y, s: 0.7 + rng() * 0.5, ph: rng() * TAU, v: rng() });
  }
  for (let i = 0; i < 36; i++) {
    const x = -M * 0.5 + rng() * (W + M), y = -M * 0.3 + rng() * (H + M * 0.6);
    if (pathDist(P, x, y) < rw / 2 + 8 || map.spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 26)) continue;
    items.push({ kind: 'grass', x, y, s: 0.6 + rng() * 0.5, ph: rng() * TAU, v: rng() });
  }
  const isStatic = k => k === 'rock' || k === 'dead' || k === 'mush' || k === 'drift';
  return { statics: items.filter(d => isStatic(d.kind)), dynamics: items.filter(d => !isStatic(d.kind)).sort((a, b) => a.y - b.y), castle: P[P.length - 1][0] };
}

export function drawBackground(c, map, scenery, k) {
  const B = BIOMES[map.biome], T = GROUND_TONES[map.biome], W = WORLD.w, H = WORLD.h, rng = mulberry32(hashStr(map.id + ':bg'));
  const X0 = -M, Y0 = -M, WW = W + 2 * M, HH = H + 2 * M;
  c.imageSmoothingEnabled = true; c.imageSmoothingQuality = 'high';
  c.fillStyle = lg(c, 0, Y0, 0, Y0 + HH, [[0, B.ground[0]], [1, B.ground[1]]]); c.fillRect(X0, Y0, WW, HH);
  // soft organic variation: low + mid frequency noise, smoothed by upscaling
  c.globalAlpha = 0.55; c.drawImage(makeNoise(18, 26, rng, hex(T.low[0]), hex(T.low[1])), X0, Y0, WW, HH);
  c.globalAlpha = 0.22; c.drawImage(makeNoise(60, 86, rng, hex(T.mid[0]), hex(T.mid[1])), X0, Y0, WW, HH);
  c.globalAlpha = 1;
  // gentle light pools
  for (let i = 0; i < 10; i++) {
    const x = X0 + rng() * WW, y = Y0 + rng() * HH, r = 70 + rng() * 110;
    c.fillStyle = rg(c, x, y, 0, r, [[0, map.biome === 'frostpeak' ? 'rgba(255,255,255,.22)' : 'rgba(255,250,200,.09)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // fine grain (soft, low alpha)
  for (let i = 0; i < 900; i++) {
    const x = X0 + rng() * WW, y = Y0 + rng() * HH;
    circ(c, x, y, 0.5 + rng() * 0.9, rng() < 0.5 ? 'rgba(255,255,255,.06)' : 'rgba(0,0,0,.05)');
  }
  // ---- road ----
  const P = map.path, rw = WORLD.roadWidth, path = new Path(P);
  const trace = cc => { cc.beginPath(); cc.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) cc.lineTo(P[i][0], P[i][1]); };
  const sk = (cc, w, col) => { trace(cc); cc.lineWidth = w; cc.strokeStyle = col; cc.lineJoin = 'round'; cc.lineCap = 'round'; cc.stroke(); };
  sk(c, rw + 22, 'rgba(0,0,0,.045)'); sk(c, rw + 15, 'rgba(0,0,0,.06)'); sk(c, rw + 9, map.biome === 'frostpeak' ? 'rgba(90,110,130,.22)' : 'rgba(40,55,20,.22)');
  const rc = document.createElement('canvas'); rc.width = Math.ceil(WW * k); rc.height = Math.ceil(HH * k);
  const r = rc.getContext('2d'); r.setTransform(k, 0, 0, k, M * k, M * k);
  sk(r, rw + 4, B.road[1]); sk(r, rw, B.road[0]);
  r.globalCompositeOperation = 'source-atop';
  r.globalAlpha = 0.35; r.drawImage(makeNoise(70, 110, rng, hex(B.road[1]), hex(B.road[2])), X0, Y0, WW, HH);
  r.globalAlpha = 0.18; r.drawImage(makeNoise(200, 320, rng, [0, 0, 0], [255, 255, 255]), X0, Y0, WW, HH);
  r.globalAlpha = 1;
  // wheel ruts + worn center
  for (const off of [-8, 8]) {
    r.beginPath();
    for (let d = 0; d <= path.total; d += 4) { const p = path.at(d); const x = p.x + Math.cos(p.a + Math.PI / 2) * off, y = p.y + Math.sin(p.a + Math.PI / 2) * off; d ? r.lineTo(x, y) : r.moveTo(x, y); }
    r.lineWidth = 3.2; r.strokeStyle = 'rgba(60,40,20,.13)'; r.lineJoin = 'round'; r.stroke();
  }
  sk(r, rw * 0.3, 'rgba(255,255,255,.07)');
  // inner edge shading (darker rim inside the road)
  r.globalCompositeOperation = 'source-atop'; trace(r); r.lineWidth = rw + 4; r.strokeStyle = 'rgba(0,0,0,0)'; r.stroke();
  for (let d = 0; d < path.total; d += 5) {
    const p = path.at(d), off = (rng() - 0.5) * rw * 0.85;
    const x = p.x + Math.cos(p.a + Math.PI / 2) * off, y = p.y + Math.sin(p.a + Math.PI / 2) * off;
    if (rng() < 0.5) { const s = 0.8 + rng() * 1.6; ell(r, x, y + 0.5, s, s * 0.7, 'rgba(0,0,0,.12)'); ell(r, x, y, s, s * 0.7, rng() < 0.5 ? B.road[2] : B.road[1]); }
  }
  c.drawImage(rc, X0, Y0, WW, HH);
  if (map.biome === 'frostpeak') for (let d = 0; d < path.total; d += 26) { const p = path.at(d); const side = rng() < 0.5 ? -1 : 1; ell(c, p.x + Math.cos(p.a + Math.PI / 2) * side * rw * 0.52, p.y + Math.sin(p.a + Math.PI / 2) * side * rw * 0.52, 9, 3.2, 'rgba(255,255,255,.8)'); }
  // pads
  for (const [x, y] of map.spots) drawPad(c, x, y, map.biome);
  // static scenery
  for (const d of [...scenery.statics].sort((a, b) => a.y - b.y)) {
    if (d.kind === 'rock') map.biome === 'frostpeak' ? rockArt(c, d.x, d.y, d.s * 0.9, '#8ea1b3', '#eef5fa') : rockArt(c, d.x, d.y, d.s * 0.85, '#7f8287', '#c3c5c9');
    else if (d.kind === 'dead') deadTreeArt(c, d.x, d.y, d.s);
    else if (d.kind === 'mush') { mushroomArt(c, d.x, d.y, d.s); mushroomArt(c, d.x + 6, d.y + 3, d.s * 0.7); }
    else if (d.kind === 'drift') snowDriftArt(c, d.x, d.y, d.s);
  }
  drawEntrance(c, P, map.biome);
  drawCastleBase(c, scenery.castle, H - 4, map.biome);
  if (map.biome === 'darkwood') { c.fillStyle = 'rgba(25,12,45,.10)'; c.fillRect(X0, Y0, WW, HH); }
}
function drawPad(c, x, y, biome) {
  const frost = biome === 'frostpeak';
  softShadow(c, x, y + 4, 24, 9, 0.32);
  ell(c, x, y + 2.2, 20.5, 9.2, frost ? '#748392' : '#655e55', OUT, 1);
  ell(c, x, y, 19.5, 8.6, lg(c, 0, y - 8, 0, y + 8, [[0, frost ? '#c9d5e0' : '#b8ae9c'], [1, frost ? '#97a7b6' : '#8e8475']]));
  for (let i = 0; i < 8; i++) { const a = i / 8 * TAU + 0.2; line(c, x + Math.cos(a) * 9, y + Math.sin(a) * 4, x + Math.cos(a) * 18.5, y + Math.sin(a) * 8.2, 'rgba(50,40,30,.22)', 0.8); }
  ell(c, x, y, 9, 4, frost ? '#a9b8c6' : '#9a907f', 'rgba(50,40,30,.25)', 0.8);
  ell(c, x - 5, y - 4, 7, 2, 'rgba(255,255,255,.18)');
  if (!frost) { circ(c, x + 14, y + 3, 2.2, 'rgba(90,140,60,.55)'); circ(c, x - 15, y + 2, 1.6, 'rgba(90,140,60,.45)'); }
}
function drawEntrance(c, P, biome) {
  let [x, y] = P[0]; const [nx, ny] = P[1];
  const a = Math.atan2(ny - y, nx - x);
  x = Math.max(-6, Math.min(WORLD.w + 6, x)); y = Math.max(-6, Math.min(WORLD.h + 6, y));
  const ex = x + Math.cos(a) * 24, ey = y + Math.sin(a) * 24;
  c.save(); c.translate(ex, ey); c.rotate(a - Math.PI / 2);
  c.fillStyle = rg(c, 0, -14, 2, 46, [[0, 'rgba(8,4,14,.9)'], [0.6, 'rgba(8,4,14,.45)'], [1, 'rgba(8,4,14,0)']]); c.fillRect(-60, -64, 120, 116);
  const rc = biome === 'frostpeak' ? ['#8ea1b3', '#eef5fa'] : biome === 'darkwood' ? ['#5c5852', '#8f877c'] : ['#7c766e', '#b4ab9f'];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) rockArt(c, sx * (27 + i * 8), -4 - i * 10, 1.05 - i * 0.12, rc[0], rc[1]);
  c.restore();
}
export function entrancePos(P) { let [x, y] = P[0]; const [nx, ny] = P[1]; const a = Math.atan2(ny - y, nx - x); x = Math.max(-6, Math.min(WORLD.w + 6, x)); y = Math.max(-6, Math.min(WORLD.h + 6, y)); return { x: x + Math.cos(a) * 24, y: y + Math.sin(a) * 24, a }; }
function drawCastleBase(c, x, y, biome) {
  const st = biome === 'frostpeak' ? ['#cfd9e2', '#95a5b4'] : ['#cdbfa9', '#93866f'];
  softShadow(c, x, y + 2, 90, 10, 0.3);
  for (const sx of [-1, 1]) {
    const wx = x + sx * 46;
    rrect(c, wx - 27, y - 27, 54, 31, 3, lg(c, 0, y - 27, 0, y + 4, [[0, st[0]], [1, st[1]]]), OUT, 1.1);
    for (let i = 0; i < 4; i++) rrect(c, wx - 25 + i * 13.5, y - 33, 9, 7.5, 1.5, st[0], OUT, 1);
    for (let rr = 0; rr < 3; rr++) { line(c, wx - 26, y - 19 + rr * 8, wx + 26, y - 19 + rr * 8, 'rgba(60,40,20,.14)', 0.7); for (let j = 0; j < 4; j++) line(c, wx - 20 + j * 13 + (rr % 2) * 6, y - 27 + rr * 8, wx - 20 + j * 13 + (rr % 2) * 6, y - 19 + rr * 8, 'rgba(60,40,20,.10)', 0.7); }
  }
  for (const sx of [-1, 1]) {
    const tx = x + sx * 24;
    rrect(c, tx - 11, y - 48, 22, 52, 3, lg(c, tx - 11, 0, tx + 11, 0, [[0, st[0]], [1, st[1]]]), OUT, 1.1);
    rrect(c, tx - 3, y - 38, 6, 9, [3, 3, 0, 0], '#3a2a20');
    c.beginPath(); c.moveTo(tx - 14, y - 47); c.quadraticCurveTo(tx - 6, y - 56, tx, y - 70); c.quadraticCurveTo(tx + 6, y - 56, tx + 14, y - 47); c.closePath();
    c.fillStyle = lg(c, tx - 14, 0, tx + 14, 0, [[0, '#5a78c0'], [1, '#2f4a8c']]); c.fill(); c.lineWidth = 1.1; c.strokeStyle = OUT; c.stroke();
    line(c, tx, y - 70, tx, y - 82, '#3a2a20', 1.4);
  }
  c.beginPath(); c.moveTo(x - 14, y + 4); c.lineTo(x - 14, y - 22); c.arc(x, y - 22, 14, Math.PI, 0); c.lineTo(x + 14, y + 4); c.closePath();
  c.fillStyle = lg(c, 0, y - 36, 0, y + 4, [[0, '#2a1a12'], [1, '#120a06']]); c.fill(); c.lineWidth = 1.2; c.strokeStyle = OUT; c.stroke();
  for (let i = -10; i <= 10; i += 5) line(c, x + i, y - 31, x + i, y + 2, 'rgba(120,95,70,.75)', 1.3);
  line(c, x - 13, y - 16, x + 13, y - 16, 'rgba(120,95,70,.75)', 1.3);
}

// ---------- towers ----------
const ROOF = { archer: ['#d0583c', '#9a3424'], ranger: ['#4f9a48', '#2e6a2a'], marksman: ['#4f76c0', '#2d4b8c'] };
function stoneBase(c, w, h, top, cols = ['#c4b8a3', '#8c8170']) {
  rrect(c, -w / 2, top, w, h, 4, G(c, 'stone' + w + top + cols[0], () => lg(c, -w / 2, 0, w / 2, 0, [[0, cols[0]], [1, cols[1]]])), OUT, 1.1);
  for (let r = 1; r < Math.floor(h / 6); r++) line(c, -w / 2 + 1, top + r * 6, w / 2 - 1, top + r * 6, 'rgba(60,45,30,.16)', 0.7);
  ell(c, -w / 4, top + 2, w / 4, 1.4, 'rgba(255,255,255,.22)');
}
function flag(c, x, y, len, col, t, ph = 0) {
  line(c, x, y + len * 0.95, x, y - 2, '#4a3220', 1.4);
  c.beginPath(); c.moveTo(x, y);
  const n = 6;
  for (let i = 1; i <= n; i++) { const u = i / n; c.lineTo(x + u * len, y + Math.sin(t * 6 + ph - u * 3) * 1.8 * u + u * 1.5); }
  for (let i = n; i >= 0; i--) { const u = i / n; c.lineTo(x + u * len, y + 7 - u * 1.5 + Math.sin(t * 6 + ph - u * 3) * 1.8 * u); }
  c.closePath(); c.fillStyle = col; c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke();
}
export function drawTower(c, t, time, opts = {}) {
  const { x, y, type, tier, branch } = t;
  const anim = t.anim ?? 1, life = time + (t.id || 0) * 1.7;
  let s = 1 + (tier - 1) * 0.055;
  const pop = anim < 0.45 ? easeOutBack(clamp01(anim / 0.45)) : 1;
  const pulse = t.pulseT > 0 ? Math.sin((1 - t.pulseT / 0.45) * Math.PI) * 0.09 : 0;
  if (!opts.icon) softShadow(c, x, y + 8, 22 * s * pop, 8 * s * pop, 0.34);
  c.save(); c.translate(x, y); c.scale(s * pop * (1 + pulse), s * pop * (1 - pulse * 0.6));
  const firing = t.firing > 0;
  const aim = t.drawAngle ?? t.angle ?? -0.6;
  const ready = t.stats ? clamp01(1 - (t.cd || 0) / t.stats.cd) : 1;
  switch (type) {
    case 'archer': {
      stoneBase(c, 26, 16, -6);
      for (const sx of [-1, 1]) rrect(c, sx * 10 - 2, -27, 4, 22, 1.5, G(c, 'post', () => lg(c, -2, 0, 2, 0, [[0, '#8a5d38'], [1, '#5e3c22']])), OUT, 1);
      line(c, -9, -8, 9, -22, 'rgba(80,50,28,.9)', 1.8); line(c, 9, -8, -9, -22, 'rgba(80,50,28,.9)', 1.8);
      rrect(c, -16.5, -31, 33, 7, 2.5, G(c, 'plat', () => lg(c, 0, -31, 0, -24, [[0, '#b07a4a'], [1, '#7a5030']])), OUT, 1);
      for (let i = -12; i <= 12; i += 6) line(c, i, -30, i, -25, 'rgba(60,35,18,.35)', 0.7);
      const n = branch === 'ranger' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ax = n === 2 ? (i ? 6.5 : -6.5) : 0, sway = Math.sin(life * 1.6 + i) * 0.6;
        // body + head
        ell(c, ax, -34, 4, 4.4, branch === 'marksman' ? '#3f5f9c' : '#4f8a3e', OUT, 0.9);
        circ(c, ax + sway * 0.3, -39.5, 3.8, G(c, 'skin', () => rg(c, -1, -1, 0.5, 4, [[0, '#f6d6b2'], [1, '#d9a87e']])), OUT, 0.9);
        c.beginPath(); c.moveTo(ax - 4.6, -39.5); c.quadraticCurveTo(ax + sway * 0.3, -48, ax + 4.6, -39.5); c.closePath(); c.fillStyle = branch === 'marksman' ? '#2d4b8c' : '#3a6e2e'; c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke();
        // bow aimed at target, string drawn back as the shot charges
        c.save(); c.translate(ax, -35); c.rotate(aim);
        const pull = firing ? 0 : ready * 4.5, bl = branch === 'marksman' ? 7.5 : 6;
        c.beginPath(); c.arc(4, 0, bl, -1.25, 1.25); c.strokeStyle = OUT; c.lineWidth = 3.2; c.stroke(); c.strokeStyle = '#8a5428'; c.lineWidth = 1.8; c.stroke();
        const tx = 4 + Math.cos(1.25) * bl, ty = Math.sin(1.25) * bl;
        c.beginPath(); c.moveTo(tx, -ty); c.lineTo(tx - pull, 0); c.lineTo(tx, ty); c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = 0.6; c.stroke();
        if (!firing && ready > 0.25) { line(c, tx - pull, 0, tx - pull + 11, 0, '#d9c49a', 1); poly(c, [[tx - pull + 11, -1.4], [tx - pull + 13.5, 0], [tx - pull + 11, 1.4]], '#dfe4ea'); }
        c.restore();
      }
      if (tier >= 2) {
        const rc = ROOF[branch] || ROOF.archer, yy = -45 - (n === 2 ? 2 : 0);
        c.beginPath(); c.moveTo(-19, yy); c.quadraticCurveTo(-8, yy - 6, 0, -62); c.quadraticCurveTo(8, yy - 6, 19, yy); c.quadraticCurveTo(0, yy + 3, -19, yy); c.closePath();
        c.fillStyle = G(c, 'roof' + (branch || ''), () => lg(c, -19, 0, 19, 0, [[0, rc[0]], [1, rc[1]]])); c.fill(); c.lineWidth = 1.1; c.strokeStyle = OUT; c.stroke();
        c.beginPath(); c.moveTo(-16, yy); c.quadraticCurveTo(-7, yy - 5, -1, -59); c.lineTo(-6, yy); c.closePath(); c.fillStyle = 'rgba(255,255,255,.16)'; c.fill();
        if (tier >= 3) flag(c, 0, -70, 10, '#ffcf5a', life);
      }
      break;
    }
    case 'mage': {
      const tc = branch === 'warlock' ? ['#46a3a0', '#1f5c66'] : branch === 'archmage' ? ['#7a5bd0', '#3f2a80'] : ['#8e7aae', '#56446f'];
      rrect(c, -13, -33, 26, 43, 5, G(c, 'mwall', () => lg(c, -13, 0, 13, 0, [[0, '#d6cde3'], [0.5, '#b4a8c6'], [1, '#867a99']])), OUT, 1.1);
      for (let r = 0; r < 4; r++) line(c, -12, -25 + r * 9, 12, -25 + r * 9, 'rgba(50,30,70,.15)', 0.7);
      rrect(c, -4, -2, 8, 12, [4, 4, 0, 0], '#3b2a52', OUT, 0.9);
      const win = 0.7 + Math.sin(life * 2.2) * 0.3;
      for (const sx of [-1, 1]) { rrect(c, sx * 7 - 2, -23, 4, 6.5, 2, `rgba(255,${190 + win * 40},90,${0.75 + win * 0.25})`); }
      ell(c, 0, -33, 15.5, 5, tc[0], OUT, 1); ell(c, 0, -34, 13, 3.6, tc[1]);
      if (tier >= 2) poly(c, [[-15, -34], [15, -34], [9, -41], [-9, -41]], tc[0], OUT, 1);
      if (tier >= 3) for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 14, -35); c.quadraticCurveTo(sx * 19, -42, sx * 17, -50); c.quadraticCurveTo(sx * 15, -42, sx * 10, -37); c.closePath(); c.fillStyle = '#f2c14e'; c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke(); }
      const bob = Math.sin(life * 2.4) * 2.2, oy = -52 + bob, big = branch === 'archmage' ? 1.35 : 1;
      const oc = branch === 'warlock' ? ['#e6fffb', '#3fe0c8', '63,224,200'] : branch === 'archmage' ? ['#fff4e0', '#ff8fe8', '255,143,232'] : ['#f7eeff', '#b07bff', '176,123,255'];
      // rune ring
      c.save(); c.translate(0, oy); c.scale(1, 0.38); c.rotate(life * 1.3);
      c.setLineDash([3, 4]); c.beginPath(); c.arc(0, 0, 13 * big, 0, TAU); c.strokeStyle = `rgba(${oc[2]},.6)`; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]);
      c.restore();
      const glow = (firing ? 1.4 : 1) * (0.85 + Math.sin(life * 3) * 0.15);
      c.fillStyle = rg(c, 0, oy, 0, 20 * big * glow, [[0, `rgba(${oc[2]},.55)`], [1, `rgba(${oc[2]},0)`]]); c.fillRect(-24 * big, oy - 24 * big, 48 * big, 48 * big);
      circ(c, 0, oy, 6.5 * big * (firing ? 1.15 : 1), rg(c, -2, oy - 2, 0.5, 7 * big, [[0, oc[0]], [1, oc[1]]], -2.5, oy - 2.5), 'rgba(40,20,60,.5)', 1);
      circ(c, -2, oy - 2.5, 1.7 * big, 'rgba(255,255,255,.85)');
      if (branch === 'warlock') for (let i = 0; i < 3; i++) { const a = life * 3 + i * 2.1; line(c, Math.cos(a) * 8, oy + Math.sin(a) * 8, Math.cos(a + 0.5) * 12, oy + Math.sin(a + 0.5) * 12, 'rgba(190,255,250,.9)', 1); }
      break;
    }
    case 'bombard': {
      const acc = branch === 'firebomber' ? '#d8582c' : branch === 'mortar' ? '#5a6472' : '#8a5a3a';
      rrect(c, -17.5, -14, 35, 24, 7, G(c, 'bwall', () => lg(c, 0, -14, 0, 10, [[0, '#bcb3a3'], [1, '#7b7163']])), OUT, 1.1);
      for (let i = 0; i < 4; i++) rrect(c, -16.5 + i * 9, -19.5, 6.5, 6.5, 1.5, '#b2a999', OUT, 0.9);
      rrect(c, -17.5, -4, 35, 4, 1.5, acc, OUT, 0.9);
      const rec = firing ? -3.5 * (t.firing / 0.18) : 0;
      if (branch === 'mortar') {
        ell(c, 0, -12, 11, 5, '#2b2f36', OUT, 1); ell(c, 0, -13, 8, 3.4, '#0f1114');
        c.save(); c.translate(0, -14 - rec * 0.6);
        rrect(c, -8, -14, 16, 14, 4, G(c, 'mortar', () => lg(c, -8, 0, 8, 0, [[0, '#7c8490'], [1, '#3b414b']])), OUT, 1); ell(c, 0, -14, 8, 3, '#141619', OUT, 0.9);
        c.restore();
      } else {
        c.save(); c.translate(0, -10); c.rotate(aim);
        rrect(c, -4 + rec, -5, 23, 10, 5, G(c, 'barrel', () => lg(c, 0, -5, 0, 5, [[0, '#6c7480'], [0.45, '#3d434d'], [1, '#22262c']])), OUT, 1);
        rrect(c, 16 + rec, -6, 5, 12, 2.5, '#3a3f48', OUT, 0.9);
        line(c, rec, -2.6, 15 + rec, -2.6, 'rgba(255,255,255,.22)', 1);
        c.restore();
        circ(c, 0, -10, 6, '#4b4f57', OUT, 1); circ(c, -1.5, -11.5, 1.6, 'rgba(255,255,255,.25)');
      }
      if (branch === 'firebomber') { const f = Math.sin(life * 9) * 1.5; poly(c, [[-4, -20], [0, -31 - f], [4, -20]], '#ffb347'); poly(c, [[-2, -20], [0, -26 - f], [2, -20]], '#fff2a0'); }
      if (tier >= 3) flag(c, -14, -34, 9, '#ffcf5a', life, 1);
      break;
    }
    case 'frost': {
      const ic = branch === 'glacier' ? ['#eef9ff', '#5ab0ee', '#2a6fb0'] : branch === 'blizzard' ? ['#ffffff', '#a8dcff', '#5aa0d0'] : ['#f4fbff', '#97d6ff', '#4c9cd6'];
      ell(c, 0, 4, 16.5, 7, '#7f8c99', OUT, 1); ell(c, 0, 2, 14.5, 5.6, lg(c, 0, -4, 0, 8, [[0, '#c3ced8'], [1, '#8d99a5']]));
      const shine = (life * 0.5) % 1;
      const crystal = (cx, h, w, lean, key) => {
        c.beginPath(); c.moveTo(cx - w, 2); c.lineTo(cx - w * 0.6 + lean, -h * 0.75); c.lineTo(cx + lean, -h); c.lineTo(cx + w * 0.6 + lean, -h * 0.75); c.lineTo(cx + w, 2); c.closePath();
        c.fillStyle = G(c, 'cr' + key + (branch || '') + h, () => lg(c, cx - w, 0, cx + w, 0, [[0, ic[0]], [0.5, ic[1]], [1, ic[2]]])); c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(30,60,100,.55)'; c.stroke();
        c.save(); c.clip();
        const sy = -h - 6 + shine * (h + 14);
        c.fillStyle = 'rgba(255,255,255,.45)'; c.beginPath(); c.moveTo(cx - w - 2, sy); c.lineTo(cx + w + 2, sy - 6); c.lineTo(cx + w + 2, sy - 3); c.lineTo(cx - w - 2, sy + 3); c.closePath(); c.fill();
        c.restore();
        line(c, cx + lean * 0.3, -h * 0.88, cx - w * 0.2, -2, 'rgba(255,255,255,.6)', 0.9);
      };
      const h0 = 18 + tier * 2;
      crystal(-9, h0, 4, -3, 'a'); crystal(9, h0 - 2, 4, 3, 'b');
      crystal(0, 34 + tier * 4, 7, 0, 'c');
      if (tier >= 3) crystal(-4, 22, 3, -6, 'd');
      for (let i = 0; i < 3; i++) { const a = life * 1.2 + i * TAU / 3, rr = 15; const fx = Math.cos(a) * rr, fy = -24 + Math.sin(a) * rr * 0.35; poly(c, [[fx, fy - 2.5], [fx + 1.4, fy], [fx, fy + 2.5], [fx - 1.4, fy]], 'rgba(220,245,255,.9)'); }
      if (branch === 'blizzard') for (let i = 0; i < 10; i++) { const a = life * 1.8 + i * TAU / 10, r = 21 + Math.sin(life * 3 + i) * 4; circ(c, Math.cos(a) * r, -12 + Math.sin(a) * r * 0.45, 1.3, 'rgba(255,255,255,.85)'); }
      break;
    }
    case 'barracks': {
      const ban = branch === 'knights' ? '#4f76c0' : branch === 'rangers' ? '#4f9a48' : '#d0583c';
      rrect(c, -16, -14, 32, 24, 3, G(c, 'bk', () => lg(c, 0, -14, 0, 10, [[0, '#b48a5e'], [1, '#7a5636']])), OUT, 1.1);
      for (let i = -12; i <= 12; i += 6) line(c, i, -13, i, 9, 'rgba(60,35,18,.16)', 0.7);
      rrect(c, -5, -4, 10, 14, [5, 5, 0, 0], '#3a2618', OUT, 0.9); circ(c, 2.5, 3, 0.8, '#d8b25a');
      const roof = branch === 'knights' ? ['#a9b4c2', '#6b7787'] : ['#d6b56a', '#9c7a3c'];
      c.beginPath(); c.moveTo(-21, -13); c.lineTo(-12, -31); c.lineTo(12, -31); c.lineTo(21, -13); c.closePath();
      c.fillStyle = G(c, 'bkr' + (branch || ''), () => lg(c, 0, -31, 0, -13, [[0, roof[0]], [1, roof[1]]])); c.fill(); c.lineWidth = 1.1; c.strokeStyle = OUT; c.stroke();
      for (let i = -14; i <= 14; i += 5) line(c, i * 0.75, -30, i, -14, 'rgba(60,40,20,.13)', 0.7);
      rrect(c, 7, -38, 6, 10, 1, '#8a7a6a', OUT, 0.9);
      flag(c, -14, -46, 13, ban, life);
      if (tier >= 2) rrect(c, -14, -9, 6, 5, 1, `rgba(255,214,110,${0.7 + Math.sin(life * 2) * 0.2})`);
      break;
    }
    case 'ballista': {
      const wood = branch === 'dragonbane' ? ['#9a4632', '#5a2018'] : branch === 'repeater' ? ['#b89a4a', '#6e5a22'] : ['#a8784a', '#6b4628'];
      rrect(c, -16.5, -6, 33, 14, 4, G(c, 'blb', () => lg(c, 0, -6, 0, 8, [[0, '#bcb3a3'], [1, '#7b7163']])), OUT, 1.1);
      rrect(c, -10, -14, 20, 10, 2.5, wood[1], OUT, 1);
      const rec = firing ? -3 * (t.firing / 0.18) : 0;
      c.save(); c.translate(0, -14); c.rotate(aim);
      rrect(c, -10 + rec, -3, 28, 6, 2.5, G(c, 'bls' + (branch || ''), () => lg(c, 0, -3, 0, 3, [[0, wood[0]], [1, wood[1]]])), OUT, 1);
      const pull = firing ? 0 : ready * 8;
      c.beginPath(); c.moveTo(6, -16); c.quadraticCurveTo(14 - pull * 0.3, 0, 6, 16); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke(); c.strokeStyle = wood[0]; c.lineWidth = 2.4; c.stroke();
      line(c, 6, -16, 2 - pull, 0, 'rgba(255,255,255,.85)', 0.8); line(c, 6, 16, 2 - pull, 0, 'rgba(255,255,255,.85)', 0.8);
      if (!firing && ready > 0.3) { line(c, 2 - pull, 0, 24 - pull * 0.4, 0, '#d8c08a', 2); poly(c, [[24 - pull * 0.4, -3], [30 - pull * 0.4, 0], [24 - pull * 0.4, 3]], '#c8ced4', OUT, 0.7); }
      if (branch === 'repeater') rrect(c, -8, -8, 10, 5, 1.5, '#c9a35a', OUT, 0.9);
      if (branch === 'dragonbane') { poly(c, [[-10, -3], [-16, -8], [-12, 0]], '#c43b3b', OUT, 0.9); poly(c, [[-10, 3], [-16, 8], [-12, 0]], '#c43b3b', OUT, 0.9); }
      c.restore();
      if (tier >= 3) flag(c, -14, -22, 9, '#ffcf5a', life, 2);
      break;
    }
  }
  if (!opts.noPips) {
    for (let i = 0; i < Math.min(tier, 3); i++) circ(c, -6 + i * 6, 15, 1.9, tier >= 4 ? '#ffd86b' : '#f6eedc', OUT, 0.7);
    if (tier >= 4) poly(c, [[0, 12], [3, 15], [0, 18], [-3, 15]], '#ffd86b', OUT, 0.7);
  }
  c.restore();
}

// ---------- enemies ----------
// A shared walking rig: legs + arms swing, body bobs and squashes. ph = walk phase.
function legs(c, ph, hipY, hipX, len, w, col, stomp = 1) {
  for (const side of [-1, 1]) {
    const sw = Math.sin(ph) * side * 0.55 * stomp;
    const x0 = hipX * side, fx = x0 + Math.sin(sw) * len, fy = hipY + Math.cos(sw) * len - Math.max(0, -Math.cos(ph) * side) * 1.2;
    limb(c, x0, hipY, fx, fy, w, col);
    ell(c, fx + 1, fy + 0.4, w * 0.75, w * 0.45, '#3a2818');
  }
}
export function drawEnemy(c, e, time, opts = {}) {
  const d = e.def || ENEMIES[e.type], type = e.type;
  const ph = (e.walk || 0) * 1.7;
  const face = e.faceS ?? 1;
  const moving = !e.blockedBy && !e.frozen;
  const bob = moving ? Math.abs(Math.sin(ph)) * 1.4 : Math.sin(time * 3) * 0.3;
  const fly = d.flying ? 17 + Math.sin((e.walk || 0) * 0.8) * 2.5 : 0;
  const alpha = opts.alpha ?? 1;
  if (!opts.noShadow) softShadow(c, e.x, e.y + 2, d.size * (d.flying ? 0.75 : 1.05), d.size * 0.36, d.flying ? 0.2 : 0.32);
  c.save(); c.globalAlpha = alpha;
  c.translate(e.x, e.y - fly);
  if (opts.tilt) c.rotate(opts.tilt);
  const hit = e.flash > 0 ? 1 + e.flash * 1.6 : 1;
  c.scale(face * hit, (1 - (moving ? Math.abs(Math.cos(ph)) * 0.035 : 0)) * hit);
  c.translate(0, -bob);
  switch (type) {
    case 'goblin': {
      limb(c, -2, -10, -5 - Math.sin(ph) * 2.5, -5, 2, '#5f9a35');
      legs(c, ph, -4.5, 2.2, 4.4, 2.4, '#5f9a35');
      ell(c, 0, -8.5, 5.2, 5.8, G(c, 'gob-b', () => rg(c, -1.5, -10, 0.5, 7, [[0, '#9ad35c'], [1, '#4e8a2c']])), OUT, 1);
      c.beginPath(); c.moveTo(-5, -7); c.lineTo(5, -7); c.lineTo(4, -3); c.lineTo(-4, -3); c.closePath(); c.fillStyle = '#7a5636'; c.fill();
      const ear = Math.sin(ph) * 0.12;
      c.save(); c.translate(-4, -16); c.rotate(-0.2 + ear); poly(c, [[0, 0], [-8, -3], [0, 3]], '#86c44c', OUT, 0.9); c.restore();
      c.save(); c.translate(4.5, -16.5); c.rotate(0.15 - ear); poly(c, [[0, 0], [7.5, -4.5], [0, 3]], '#86c44c', OUT, 0.9); c.restore();
      ell(c, 0.8, -15.5, 5.8, 5.2, G(c, 'gob-h', () => rg(c, -1, -17, 0.5, 6.5, [[0, '#a6dc68'], [1, '#5c9a34']])), OUT, 1);
      circ(c, 3, -16.2, 1.6, '#fff8c8'); circ(c, 3.5, -16.2, 0.8, '#1a120a');
      line(c, 1.5, -12.8, 4.8, -13.2, 'rgba(40,20,10,.7)', 0.8);
      limb(c, 2, -10, 5 + Math.sin(ph) * 2.5, -5.5, 2, '#6fae3c');
      line(c, 5 + Math.sin(ph) * 2.5, -5.5, 10 + Math.sin(ph) * 2.5, -9, '#d4d9e0', 1.5);
      break;
    }
    case 'orc': {
      limb(c, -3, -14, -6 - Math.sin(ph) * 3, -7, 3, '#4c7a32');
      legs(c, ph, -6, 3, 5.6, 3.2, '#3e6229');
      ell(c, 0, -10.5, 8, 8.6, G(c, 'orc-b', () => rg(c, -2, -13, 1, 10, [[0, '#76a64c'], [1, '#3f6a28']])), OUT, 1.1);
      rrect(c, -7, -11, 14, 7, 2, '#6b4628');
      line(c, -7, -16, 7, -6, '#3a2618', 1.6);
      ell(c, -5, -16, 4, 3, '#8a7a6a', OUT, 0.9);
      ell(c, 1.5, -21.5, 6.8, 6.3, G(c, 'orc-h', () => rg(c, -1, -24, 1, 8, [[0, '#7fb052'], [1, '#4c7a30']])), OUT, 1.1);
      line(c, 0, -24, 6.5, -23, 'rgba(30,20,10,.7)', 1.2);
      circ(c, 4.5, -22, 1.2, '#ff6a3a');
      poly(c, [[5, -17.5], [6.2, -14.5], [7.2, -17.5]], '#fffbe8', OUT, 0.5); poly(c, [[1.5, -17.5], [2.5, -15], [3.5, -17.5]], '#fffbe8', OUT, 0.5);
      // axe arm
      const sw = e.blockedBy ? Math.sin(time * 6) * 0.9 : Math.sin(ph) * 0.4;
      c.save(); c.translate(3, -13); c.rotate(0.3 + sw);
      limb(c, 0, 0, 0, 7, 3, '#5c8a3a');
      line(c, 0, 7, 0, -9, '#6b4628', 2);
      c.beginPath(); c.moveTo(0, -9); c.quadraticCurveTo(8, -12, 7, -3); c.lineTo(0, -5); c.closePath(); c.fillStyle = lg(c, 0, -10, 7, -3, [[0, '#e8ecf0'], [1, '#9aa2ac']]); c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke();
      c.restore();
      break;
    }
    case 'brute': {
      legs(c, ph * 0.85, -7, 4, 6, 4.4, '#55606b', 0.8);
      ell(c, 0, -13, 11, 11, G(c, 'br-b', () => rg(c, -3, -17, 1, 13, [[0, '#c9d1da'], [0.6, '#7b8693'], [1, '#4f5964']])), OUT, 1.2);
      for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(0, -8 - i * 5, 9.5, Math.PI * 0.15, Math.PI * 0.85); c.strokeStyle = 'rgba(30,35,45,.3)'; c.lineWidth = 1; c.stroke(); }
      rrect(c, -9, -34, 18, 14, [9, 9, 3, 3], G(c, 'br-h', () => lg(c, -9, 0, 9, 0, [[0, '#dce2e8'], [1, '#6b7580']])), OUT, 1.1);
      rrect(c, -1, -28, 9, 2.6, 1.2, '#14161a');
      circ(c, 5, -26.7, 0.9, `rgba(255,120,60,${0.6 + Math.sin(time * 4) * 0.3})`);
      poly(c, [[0, -34], [2.5, -40], [5, -34]], '#d6b066', OUT, 0.7);
      const sh = Math.sin(ph * 0.85) * 1;
      rrect(c, 6, -21 + sh, 10, 15, 3.5, G(c, 'br-s', () => lg(c, 6, 0, 16, 0, [[0, '#7b8692'], [1, '#4a535e']])), OUT, 1.1);
      circ(c, 11, -13.5 + sh, 2, '#d6b066', OUT, 0.6);
      break;
    }
    case 'wraith': {
      const t2 = (e.walk || 0) * 2;
      c.globalAlpha = alpha * (0.78 + Math.sin(time * 3 + (e.id || 0)) * 0.12);
      c.fillStyle = G(c, 'wr-glow', () => rg(c, 0, -16, 2, 22, [[0, 'rgba(150,110,230,.35)'], [1, 'rgba(150,110,230,0)']])); c.fillRect(-22, -38, 44, 44);
      c.beginPath(); c.moveTo(-8, -8); c.quadraticCurveTo(-10, -27, 0, -30); c.quadraticCurveTo(10, -27, 8, -8);
      for (let i = 0; i <= 6; i++) { const u = i / 6; c.lineTo(8 - u * 16, -3 + Math.sin(t2 * 1.6 + u * 7) * 2.4 + (i % 2 ? -2.5 : 0)); }
      c.closePath(); c.fillStyle = G(c, 'wr-b', () => lg(c, 0, -30, 0, 0, [[0, '#9b7fdb'], [0.7, 'rgba(80,50,140,.75)'], [1, 'rgba(60,30,110,.15)']])); c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(40,20,70,.55)'; c.stroke();
      // reaching sleeve
      c.beginPath(); c.moveTo(4, -18); c.quadraticCurveTo(12, -16 + Math.sin(t2) * 2, 14, -11 + Math.sin(t2) * 2); c.quadraticCurveTo(9, -12, 4, -12); c.closePath(); c.fillStyle = 'rgba(120,90,200,.75)'; c.fill();
      c.globalAlpha = alpha;
      ell(c, 1.5, -21, 5, 5, '#170c28');
      for (const [ex, r] of [[3.4, 1.5], [-0.3, 1.2]]) { circ(c, ex, -21.5, r * 2.4, 'rgba(140,250,255,.25)'); circ(c, ex, -21.5, r, '#bffcff'); }
      break;
    }
    case 'bat': {
      const flap = Math.sin((e.walk || 0) * 3.4);
      for (const sx of [-1, 1]) {
        c.save(); c.scale(sx, 1); c.rotate(-flap * 0.45);
        c.beginPath(); c.moveTo(1, -4); c.quadraticCurveTo(7, -12, 15, -8); c.quadraticCurveTo(13, -5, 12, -2); c.quadraticCurveTo(9, -4, 8, -1); c.quadraticCurveTo(5, -3, 2, -1); c.closePath();
        c.fillStyle = G(c, 'bat-w', () => lg(c, 0, -10, 0, 0, [[0, '#6a4588'], [1, '#3e2458']])); c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke();
        line(c, 2, -3, 14, -8, 'rgba(30,15,40,.5)', 0.6); line(c, 3, -3, 11, -2.5, 'rgba(30,15,40,.5)', 0.6);
        c.restore();
      }
      ell(c, 0, -3.5, 4.4, 5, G(c, 'bat-b', () => rg(c, -1, -5, 0.5, 5.5, [[0, '#7b52a0'], [1, '#43285e']])), OUT, 0.9);
      poly(c, [[-3, -6.5], [-2.2, -11.5], [-0.4, -7.5]], '#6a4588', OUT, 0.7); poly(c, [[3, -6.5], [2.2, -11.5], [0.4, -7.5]], '#6a4588', OUT, 0.7);
      circ(c, 1.7, -4.5, 0.9, '#ff5a5a'); circ(c, -1.2, -4.5, 0.8, '#ff5a5a');
      poly(c, [[0, -1.6], [0.6, 0.2], [1.2, -1.6]], '#fff');
      break;
    }
    case 'shaman': {
      // robe sways instead of visible legs
      const sway = Math.sin(ph) * 1.4;
      for (const sx of [-1, 1]) ell(c, sx * 2.5 + Math.sin(ph) * sx * 1.5, -0.5, 2.2, 1.3, '#3a2818');
      c.beginPath(); c.moveTo(-6, -15); c.quadraticCurveTo(-8, -6, -7 - sway, 0); c.lineTo(7 - sway, 0); c.quadraticCurveTo(8, -6, 6, -15); c.closePath();
      c.fillStyle = G(c, 'sh-r', () => lg(c, -7, 0, 7, 0, [[0, '#9a56ad'], [1, '#5a2a6e']])); c.fill(); c.lineWidth = 1; c.strokeStyle = OUT; c.stroke();
      line(c, -6.5 - sway * 0.5, -3, 6.5 - sway * 0.5, -3, '#e8c25a', 1.2);
      ell(c, 0, -15, 6, 4, '#4c7a32', OUT, 0.9);
      ell(c, 1, -20, 6.2, 5.8, G(c, 'sh-h', () => rg(c, -1, -22, 0.5, 7, [[0, '#7fb052'], [1, '#4c7a30']])), OUT, 1);
      circ(c, 3.6, -20.5, 1.2, '#ffe14d');
      for (let i = 0; i < 5; i++) { const fx = -5 + i * 2.6; c.beginPath(); c.moveTo(fx - 1, -24); c.quadraticCurveTo(fx - 1.6 + Math.sin(time * 2 + i) * 0.6, -30, fx + (i - 2) * 0.6, -33 - (i % 2) * 3); c.quadraticCurveTo(fx + 0.6, -29, fx + 1, -24); c.fillStyle = ['#e84a4a', '#f6d14b', '#4ac2e8', '#f6d14b', '#e84a4a'][i]; c.fill(); }
      line(c, 9, 1, 9 + sway * 0.4, -27, '#6b4628', 1.9);
      const g = (Math.sin(time * 3 + (e.id || 0)) + 1) / 2;
      c.fillStyle = rg(c, 9, -29, 0, 11, [[0, `rgba(125,255,138,${0.35 + g * 0.3})`], [1, 'rgba(125,255,138,0)']]); c.fillRect(-2, -40, 22, 22);
      circ(c, 9 + sway * 0.4, -29, 3 + g * 0.6, rg(c, 8, -30, 0.3, 3.6, [[0, '#e6ffe8'], [1, '#4fdc66']]), OUT, 0.8);
      limb(c, 3, -14, 8.5, -13, 2.6, '#5c8a3a');
      break;
    }
    case 'ogre': {
      c.scale(1.05, 1.05);
      legs(c, ph * 0.7, -10, 7, 9, 7, '#7a5a4c', 0.75);
      ell(c, 0, -20, 17, 17, G(c, 'og-b', () => rg(c, -4, -26, 2, 20, [[0, '#b3917c'], [0.65, '#8a6a5a'], [1, '#5e463b']])), OUT, 1.3);
      ell(c, 0, -15, 11, 9.5, 'rgba(255,230,210,.18)');
      rrect(c, -15, -19, 30, 9, 3, '#4a2f2a', OUT, 1); circ(c, 0, -15, 3, '#d6b066', OUT, 0.8);
      ell(c, 2, -41, 11, 9.5, G(c, 'og-h', () => rg(c, 0, -44, 1, 12, [[0, '#a9867a'], [1, '#6e5246']])), OUT, 1.2);
      for (const sx of [-1, 1]) { c.beginPath(); c.moveTo(sx * 8 + 2, -46); c.quadraticCurveTo(sx * 16 + 2, -50, sx * 15 + 2, -60); c.quadraticCurveTo(sx * 12 + 2, -52, sx * 4 + 2, -48); c.closePath(); c.fillStyle = '#efe4cc'; c.fill(); c.lineWidth = 0.9; c.strokeStyle = OUT; c.stroke(); }
      rrect(c, -7, -52, 18, 6, 2, '#d6b066', OUT, 0.9);
      for (let i = 0; i < 3; i++) poly(c, [[-5 + i * 6, -52], [-2 + i * 6, -58], [1 + i * 6, -52]], '#f2c14e', OUT, 0.7);
      line(c, -2, -45.5, 4, -44.5, 'rgba(30,15,10,.75)', 1.4); line(c, 6, -44.5, 10, -45.5, 'rgba(30,15,10,.75)', 1.4);
      circ(c, 7, -42, 1.7, '#ff4a2a'); circ(c, 1, -42, 1.5, '#ff4a2a');
      poly(c, [[3, -36], [5, -32], [7, -36]], '#fff', OUT, 0.5); poly(c, [[-2, -36], [0, -32], [2, -36]], '#fff', OUT, 0.5);
      const sw = e.blockedBy ? -0.9 + Math.abs(Math.sin(time * 2.4)) * 1.4 : -0.6 + Math.sin(ph * 0.7) * 0.25;
      c.save(); c.translate(14, -24); c.rotate(sw);
      limb(c, 0, 0, 4, 8, 6, '#8a6a5a');
      c.translate(4, 8); rrect(c, -3, -28, 7, 30, 3.5, '#6b4628', OUT, 1.1); ell(c, 0.5, -28, 7.5, 6.5, lg(c, -7, -34, 8, -22, [[0, '#94653e'], [1, '#5e3c22']]), OUT, 1.1);
      circ(c, -3, -30, 1.4, '#c9ced6'); circ(c, 4, -25, 1.4, '#c9ced6');
      c.restore();
      break;
    }
  }
  c.restore();
  if (opts.bare) return;
  const top = e.y - fly - d.size * (d.boss ? 3.1 : 2.3) - 4;
  if (e.frozen) {
    rrect(c, e.x - d.size * 0.95, e.y - fly - d.size * 2.2, d.size * 1.9, d.size * 2.3, 4, 'rgba(185,232,255,.5)', 'rgba(255,255,255,.85)', 1);
    line(c, e.x - d.size * 0.6, e.y - fly - d.size * 1.9, e.x - d.size * 0.2, e.y - fly - d.size * 0.6, 'rgba(255,255,255,.7)', 1.2);
  } else if (e.slowed) {
    ell(c, e.x, e.y + 1, d.size * 1.0, d.size * 0.38, 'rgba(140,210,255,.45)');
  }
  if (e.burning) { const f = Math.sin(time * 20 + (e.id || 0)) * 1.5; poly(c, [[e.x - 4, e.y - fly - 6], [e.x, e.y - fly - 17 - f], [e.x + 4, e.y - fly - 6]], 'rgba(255,140,40,.85)'); poly(c, [[e.x - 2, e.y - fly - 6], [e.x, e.y - fly - 12 - f], [e.x + 2, e.y - fly - 6]], 'rgba(255,240,150,.95)'); }
  const shown = e.dhp ?? e.hp;
  if (shown < e.maxHp - 0.5) {
    const w = d.boss ? 42 : Math.max(16, d.size * 1.8), p = Math.max(0, shown / e.maxHp), pr = Math.max(0, e.hp / e.maxHp);
    rrect(c, e.x - w / 2 - 1.2, top - 1.2, w + 2.4, 5.4, 2.7, 'rgba(15,10,8,.78)');
    rrect(c, e.x - w / 2, top, w * p, 3, 1.5, 'rgba(255,255,255,.55)');
    rrect(c, e.x - w / 2, top, w * pr, 3, 1.5, pr > 0.5 ? '#72de4f' : pr > 0.25 ? '#f2c443' : '#ef5040');
  }
}

export function drawSoldier(c, so, branch, time) {
  if (so.dead) return;
  const knight = branch === 'knights', ranger = branch === 'rangers';
  const ph = so.anim * 11;
  const bob = so.moving ? Math.abs(Math.sin(ph)) * 1.2 : 0;
  softShadow(c, so.x, so.y + 2, 7, 2.6, 0.3);
  c.save(); c.translate(so.x, so.y - bob);
  c.scale(so.faceS ?? 1, 1);
  const body = knight ? '#9aa6b4' : ranger ? '#4f9a48' : '#4f76c0';
  if (so.moving) legs(c, ph, -3, 1.8, 3.4, 2, '#5a4a3a'); else { limb(c, -1.8, -3, -1.8, 0.4, 2, '#5a4a3a'); limb(c, 1.8, -3, 1.8, 0.4, 2, '#5a4a3a'); }
  ell(c, 0, -6, 4.4, 5, body, OUT, 0.9);
  circ(c, 0, -12.5, 3.5, '#f3cfa6', OUT, 0.8);
  if (knight) { rrect(c, -4, -17.5, 8, 6.5, [4, 4, 1, 1], lg(c, -4, 0, 4, 0, [[0, '#e0e6ec'], [1, '#8a96a3']]), OUT, 0.8); line(c, 0, -17.5, 0, -21, '#d8483a', 1.6); }
  else if (ranger) { c.beginPath(); c.moveTo(-4.5, -12.5); c.quadraticCurveTo(0, -21, 4.5, -12.5); c.closePath(); c.fillStyle = '#2d6a2a'; c.fill(); }
  else rrect(c, -4, -17, 8, 4.8, [4, 4, 0, 0], '#a9b4c2', OUT, 0.8);
  const swing = so.swing > 0 ? (1 - so.swing / 0.2) : 0;
  c.save(); c.translate(3.5, -7); c.rotate(-0.5 - Math.sin(swing * Math.PI) * 1.6);
  line(c, 0, 0, 0, -10, '#e4e8ec', 1.6); line(c, -2, -1, 2, -1, '#7b5132', 1.4); c.restore();
  if (knight) rrect(c, -7.5, -10, 5, 8, 2, '#4f76c0', OUT, 0.8);
  c.restore();
  if (so.hp < so.maxHp) { rrect(c, so.x - 7, so.y - 25, 14, 3, 1.5, 'rgba(15,10,8,.78)'); rrect(c, so.x - 6.5, so.y - 24.5, 13 * Math.max(0, so.hp / so.maxHp), 2, 1, '#72de4f'); }
  if (so.flash > 0) circ(c, so.x, so.y - 8, 6, 'rgba(255,90,60,.3)');
}

// ---------- projectiles ----------
function trail(c, p, col, w) {
  const tr = p.trail; if (!tr || tr.length < 2) return;
  for (let i = 1; i < tr.length; i++) { const a = i / tr.length; line(c, tr[i - 1][0], tr[i - 1][1], tr[i][0], tr[i][1], col.replace('A', (a * 0.6).toFixed(2)), w * a); }
}
export function drawProjectile(c, p, time) {
  switch (p.kind) {
    case 'arrow': { trail(c, p, 'rgba(255,255,255,A)', 1.4); c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); const L = p.small ? 7 : 10; line(c, -L, 0, 0, 0, '#8a5d38', 1.4); poly(c, [[0, -1.8], [3.6, 0], [0, 1.8]], '#e4e8ec'); line(c, -L, 0, -L + 2.6, -2, '#f6eedc', 1); line(c, -L, 0, -L + 2.6, 2, '#f6eedc', 1); c.restore(); break; }
    case 'orb': case 'bigorb': { const r = p.kind === 'bigorb' ? 6 : 4; trail(c, p, 'rgba(200,150,255,A)', r * 1.6); c.fillStyle = rg(c, p.x, p.y, 0, r * 3.2, [[0, 'rgba(210,160,255,.75)'], [1, 'rgba(210,160,255,0)']]); c.fillRect(p.x - r * 3.2, p.y - r * 3.2, r * 6.4, r * 6.4); circ(c, p.x, p.y, r, rg(c, p.x - 1, p.y - 1, 0, r, [[0, '#ffffff'], [1, '#b07bff']])); break; }
    case 'shell': { const h = p.h || 0; softShadow(c, p.x, p.y, 5, 2, 0.28); trail(c, { trail: p.trail }, p.burn ? 'rgba(255,150,60,A)' : 'rgba(200,200,200,A)', 2.5); circ(c, p.x, p.y - h, p.big ? 5 : 4, rg(c, p.x - 1.5, p.y - h - 1.5, 0.3, 5, [[0, p.burn ? '#9a4a28' : '#5a5f68'], [1, p.burn ? '#3a1408' : '#16181c']]), OUT, 0.8); if (p.burn) circ(c, p.x, p.y - h, 7, 'rgba(255,140,40,.3)'); break; }
    case 'shard': { trail(c, p, 'rgba(190,235,255,A)', 2.2); c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); poly(c, [[-6, 0], [0, -2.6], [5, 0], [0, 2.6]], '#d4f0ff', '#4c9cd6', 0.8); c.restore(); circ(c, p.x, p.y, 5, 'rgba(160,220,255,.22)'); break; }
    case 'bolt': { trail(c, p, 'rgba(255,255,255,A)', 2.4); c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); line(c, -16, 0, 4, 0, '#9a6a40', 2.4); poly(c, [[4, -3.2], [10, 0], [4, 3.2]], '#c8ced4', OUT, 0.7); line(c, -16, 0, -12, -3, '#c43b3b', 1.3); line(c, -16, 0, -12, 3, '#c43b3b', 1.3); c.restore(); break; }
  }
}

// ---------- particles ----------
export class Particles {
  constructor() { this.list = []; this.chains = []; this.rng = mulberry32(7); }
  add(p) { if (this.list.length < 600) this.list.push(p); }
  burst(x, y, n, o) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = (o.speed || 60) * (0.4 + r() * 0.8);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (o.flat || 0.7) - (o.up || 0), g: o.g ?? 120, drag: o.drag ?? 0, life: 0, max: (o.life || 0.5) * (0.6 + r() * 0.7), size: (o.size || 2) * (0.6 + r() * 0.8), color: o.colors[Math.floor(r() * o.colors.length)], kind: o.kind || 'dot' });
    }
  }
  event(ev, renderer) {
    switch (ev.t) {
      case 'boom':
        this.add({ x: ev.x, y: ev.y, life: 0, max: 0.38, kind: 'ring', r: ev.r, color: ev.fire ? '255,140,40' : '255,220,150' });
        this.add({ x: ev.x, y: ev.y - 4, life: 0, max: 0.22, kind: 'flash', size: ev.r * 0.8, color: ev.fire ? '255,150,60' : '255,230,170' });
        this.burst(ev.x, ev.y - 4, ev.big ? 22 : 14, { colors: ev.fire ? ['#ff8a2a', '#ffd34a', '#ff4a2a'] : ['#ffd27a', '#ff9a3a', '#fff2c0'], speed: ev.big ? 120 : 90, up: 30, life: 0.5, size: 2.2, kind: 'glow' });
        this.burst(ev.x, ev.y - 6, ev.big ? 10 : 7, { colors: ['rgba(110,100,90,.5)', 'rgba(150,140,130,.45)'], speed: 34, up: 18, g: -24, drag: 1.5, life: 1.0, size: 7, kind: 'smoke' });
        break;
      case 'death':
        renderer && renderer.corpse(ev);
        this.add({ x: ev.x, y: ev.y - 10, vx: 0, vy: -36, g: 0, life: 0, max: 0.85, kind: 'coin', size: 3.2 });
        break;
      case 'hit': {
        const col = ev.kind === 'shard' ? ['#c8ecff', '#ffffff'] : ev.kind === 'orb' || ev.kind === 'bigorb' ? ['#d9b8ff', '#ffffff'] : ['#ffe7b0', '#ffffff'];
        this.burst(ev.x, ev.y, ev.crit ? 9 : 4, { colors: col, speed: ev.crit ? 80 : 50, life: 0.25, size: 1.5, g: 0, kind: 'glow' });
        if (ev.crit) this.add({ x: ev.x, y: ev.y - 12, vx: 0, vy: -32, g: 0, life: 0, max: 0.75, kind: 'text', text: 'CRIT', color: '#ffd86b' });
        break;
      }
      case 'shoot':
        if (ev.kind === 'cannon' && ev.mx != null) this.burst(ev.mx, ev.my, 5, { colors: ['rgba(200,195,185,.55)'], speed: 22, up: 8, g: -18, drag: 2, life: 0.7, size: 4, kind: 'smoke' });
        break;
      case 'freeze':
        this.add({ x: ev.x, y: ev.y - 6, life: 0, max: 0.4, kind: 'ring', r: 18, color: '170,225,255' });
        this.burst(ev.x, ev.y - 8, 8, { colors: ['#ffffff', '#bfe6ff'], speed: 40, life: 0.6, size: 1.8, g: 20, kind: 'flake' }); break;
      case 'heal':
        this.add({ x: ev.x, y: ev.y - 6, life: 0, max: 0.6, kind: 'ring', r: ev.r * 0.8, color: '125,255,138' });
        for (let i = 0; i < 4; i++) this.add({ x: ev.x + (this.rng() - 0.5) * 30, y: ev.y - 10 - this.rng() * 10, vx: 0, vy: -26, g: 0, life: 0, max: 0.8, kind: 'plus', size: 3, color: '#7dff8a' });
        break;
      case 'build': case 'upgrade':
        this.add({ x: ev.x, y: ev.y + 4, life: 0, max: 0.45, kind: 'ring', r: 28, color: ev.t === 'build' ? '230,215,180' : '255,216,107' });
        this.burst(ev.x, ev.y + 4, ev.t === 'build' ? 12 : 18, { colors: ev.t === 'build' ? ['rgba(190,170,140,.55)'] : ['#ffd86b', '#fff3c4'], speed: ev.t === 'build' ? 55 : 50, up: ev.t === 'build' ? 0 : 40, g: ev.t === 'build' ? 0 : -30, drag: 2, life: 0.7, size: ev.t === 'build' ? 4.5 : 1.8, kind: ev.t === 'build' ? 'smoke' : 'glow' });
        renderer && renderer.towerPulse(ev.x, ev.y);
        break;
      case 'sell':
        this.burst(ev.x, ev.y - 8, 12, { colors: ['rgba(170,150,120,.55)'], speed: 50, life: 0.6, size: 5, g: 0, drag: 2, kind: 'smoke' });
        this.add({ x: ev.x, y: ev.y - 20, vx: 0, vy: -30, g: 0, life: 0, max: 0.9, kind: 'text', text: '+' + ev.gold, color: '#ffd86b' }); break;
      case 'leak':
        if (ev.x != null) this.burst(ev.x, Math.min(ev.y, WORLD.h - 10), 10, { colors: ['#ff6a5a', '#ffb0a0'], speed: 50, up: 20, life: 0.5, size: 2, kind: 'glow' });
        break;
      case 'chain': this.chains.push({ pts: ev.pts, life: 0, max: 0.22, seed: this.rng() * 1000 }); break;
      case 'clash': if (this.rng() < 0.4) this.burst(ev.x, ev.y - 8, 3, { colors: ['#ffffff', '#ffe7b0'], speed: 50, life: 0.15, size: 1.3, g: 0, kind: 'glow' }); break;
      case 'soldierDown': this.burst(ev.x, ev.y - 6, 6, { colors: ['rgba(120,110,110,.55)'], speed: 30, life: 0.5, size: 4, g: -10, kind: 'smoke' }); break;
    }
  }
  update(dt) {
    for (const p of this.list) {
      p.life += dt;
      if (p.vx !== undefined) { if (p.drag) { const f = Math.max(0, 1 - p.drag * dt); p.vx *= f; p.vy *= f; } p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; }
      if (p.kind === 'leaf') { p.x += Math.sin(p.life * 3 + p.ph) * 12 * dt; p.rot += dt * 2.5; }
    }
    this.list = this.list.filter(p => p.life < p.max);
    for (const ch of this.chains) ch.life += dt;
    this.chains = this.chains.filter(ch => ch.life < ch.max);
  }
  draw(c) {
    for (const ch of this.chains) {
      const a = 1 - ch.life / ch.max, r = mulberry32(Math.floor(ch.seed + ch.life * 40));
      for (const [w, col] of [[5, `rgba(120,240,255,${0.3 * a})`], [1.6, `rgba(240,255,255,${a})`]]) {
        c.beginPath(); c.moveTo(ch.pts[0][0], ch.pts[0][1]);
        for (let i = 1; i < ch.pts.length; i++) {
          const [ax, ay] = ch.pts[i - 1], [bx, by] = ch.pts[i];
          for (let k = 1; k <= 4; k++) { const t = k / 5; c.lineTo(ax + (bx - ax) * t + (r() - 0.5) * 10, ay + (by - ay) * t + (r() - 0.5) * 10); }
          c.lineTo(bx, by);
        }
        c.strokeStyle = col; c.lineWidth = w; c.lineJoin = 'round'; c.stroke();
      }
    }
    for (const p of this.list) {
      const k = p.life / p.max, a = 1 - k;
      switch (p.kind) {
        case 'ring': c.beginPath(); c.arc(p.x, p.y, p.r * (0.3 + k * 0.8), 0, TAU); c.strokeStyle = `rgba(${p.color},${a * 0.8})`; c.lineWidth = 3 * a + 0.5; c.stroke(); break;
        case 'flash': c.fillStyle = rg(c, p.x, p.y, 0, p.size, [[0, `rgba(${p.color},${a * 0.8})`], [1, `rgba(${p.color},0)`]]); c.fillRect(p.x - p.size, p.y - p.size, p.size * 2, p.size * 2); break;
        case 'smoke': c.globalAlpha = a * 0.9; circ(c, p.x, p.y, p.size * (0.6 + k * 0.9), p.color); c.globalAlpha = 1; break;
        case 'glow': c.globalAlpha = a; c.fillStyle = rg(c, p.x, p.y, 0, p.size * 2.4, [[0, p.color], [1, 'rgba(255,255,255,0)']]); c.fillRect(p.x - p.size * 2.4, p.y - p.size * 2.4, p.size * 4.8, p.size * 4.8); c.globalAlpha = 1; break;
        case 'coin': c.globalAlpha = Math.min(1, a * 2); circ(c, p.x, p.y, p.size, '#f2c443', '#8a5a14', 0.9); circ(c, p.x - 0.8, p.y - 0.8, p.size * 0.35, '#fff6c0'); c.globalAlpha = 1; break;
        case 'text': c.globalAlpha = Math.min(1, a * 2); c.font = `900 10px ${FONT}`; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,.85)'; c.strokeText(p.text, p.x, p.y); c.fillStyle = p.color; c.fillText(p.text, p.x, p.y); c.globalAlpha = 1; break;
        case 'plus': c.globalAlpha = a; line(c, p.x - p.size, p.y, p.x + p.size, p.y, p.color, 1.8); line(c, p.x, p.y - p.size, p.x, p.y + p.size, p.color, 1.8); c.globalAlpha = 1; break;
        case 'flake': c.globalAlpha = a; line(c, p.x - p.size, p.y, p.x + p.size, p.y, p.color, 1); line(c, p.x, p.y - p.size, p.x, p.y + p.size, p.color, 1); c.globalAlpha = 1; break;
        case 'leaf': c.globalAlpha = Math.min(1, a * 2.5); c.save(); c.translate(p.x, p.y); c.rotate(p.rot); ell(c, 0, 0, 2.2, 1.1, p.color); c.restore(); c.globalAlpha = 1; break;
        default: c.globalAlpha = a; circ(c, p.x, p.y, p.size, p.color); c.globalAlpha = 1;
      }
    }
  }
}

// ---------- renderer ----------
export class Renderer {
  constructor(canvas) {
    this.cv = canvas; this.c = canvas.getContext('2d');
    this.dpr = 1; this.view = { s: 1, ox: 0, oy: 0 }; this.map = null; this.bg = null;
    this.particles = new Particles(); this.time = 0; this.corpses = []; this.ambient = null; this.sprites = null;
    this.game = null;
  }
  resize(cssW, cssH, rect) {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = cssW; this.cssH = cssH;
    const w = Math.round(cssW * this.dpr), h = Math.round(cssH * this.dpr);
    if (this.cv.width !== w || this.cv.height !== h) { this.cv.width = w; this.cv.height = h; }
    const s = Math.min(rect.w / WORLD.w, rect.h / WORLD.h);
    const nv = { s, ox: rect.x + (rect.w - WORLD.w * s) / 2, oy: rect.y + (rect.h - WORLD.h * s) / 2 };
    const scaleChanged = !this.view || Math.abs(nv.s - this.view.s) > 1e-4 || this._dprBuilt !== this.dpr;
    this.view = nv;
    if (this.map && scaleChanged) this._build();
  }
  setMap(map) {
    this.map = map; this.particles = new Particles(); this.corpses = [];
    this.scenery = planScenery(map); this._initAmbient(); this._build();
  }
  _build() {
    const k = this.view.s * this.dpr; this._dprBuilt = this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((WORLD.w + 2 * M) * k); cv.height = Math.ceil((WORLD.h + 2 * M) * k);
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, M * k, M * k);
    drawBackground(c, this.map, this.scenery, k);
    this.bg = cv;
    this._buildSprites(k);
  }
  _buildSprites(k) {
    const b = this.map.biome, sp = {};
    const rng = mulberry32(99);
    const treePal = [['#a9d466', '#64a03c', '#3d6e26'], ['#b6d46a', '#6fa040', '#466f28'], ['#9cc95e', '#5a9238', '#36652a']];
    sp.trunk = makeSprite(10, 18, 5, 15, k, c => treeTrunk(c, 1));
    sp.canopies = treePal.map((pal, i) => makeSprite(46, 44, 23, 34, k, c => treeCanopy(c, 1, i / 3 + 0.05, pal)));
    sp.pine = [0, 1].map(i => makeSprite(32, 46, 16, 42, k, c => pineArt(c, 1 - i * 0.1, b === 'darkwood', b === 'frostpeak')));
    sp.bush = makeSprite(28, 20, 14, 16, k, c => bushArt(c, 1, b === 'darkwood' ? ['#4a6e48', '#22382a'] : ['#7dbb4f', '#3f7a2a'], b === 'meadow' ? '#e0504a' : null));
    sp.flowers = [['#f6d14b', '#ffffff'], ['#f08bb0', '#ffffff'], ['#9ac6ff', '#f6d14b']].map(cols => makeSprite(20, 16, 10, 12, k, c => flowerArt(c, rng, cols)));
    sp.glowflower = makeSprite(16, 14, 8, 11, k, c => flowerArt(c, rng, ['#c9b4ff', '#8fe3ff']));
    const gc = GROUND_TONES[b].grass;
    sp.grass = [0, 1].map(i => makeSprite(16, 14, 8, 12, k, c => grassArt(c, 1 - i * 0.2, i ? [gc[1], gc[2], gc[0]] : [gc[0], gc[1], gc[2]])));
    this.sprites = sp;
  }
  _initAmbient() {
    const rng = mulberry32(hashStr(this.map.id + ':amb')), b = this.map.biome, W = WORLD.w, H = WORLD.h;
    const A = { clouds: [], bugs: [], flakes: [], fog: [] };
    if (b !== 'darkwood') for (let i = 0; i < 3; i++) A.clouds.push({ x: rng() * (W + 400) - 200, y: rng() * H, r: 110 + rng() * 80, sp: 5 + rng() * 4 });
    if (b === 'meadow') for (let i = 0; i < 5; i++) A.bugs.push({ kind: 'butterfly', bx: rng() * W, by: rng() * H, ph: rng() * TAU, col: ['#ffd84a', '#ff9ac8', '#ffffff', '#9ad0ff'][i % 4] });
    if (b === 'darkwood') { for (let i = 0; i < 22; i++) A.bugs.push({ kind: 'firefly', bx: rng() * W, by: rng() * H, ph: rng() * TAU }); for (let i = 0; i < 5; i++) A.fog.push({ x: rng() * (W + 300) - 150, y: rng() * H, r: 90 + rng() * 70, sp: 4 + rng() * 3 }); }
    if (b === 'frostpeak') for (let i = 0; i < 80; i++) A.flakes.push({ x: rng() * (W + 2 * 60) - 60, y: rng() * (H + 120) - 60, r: 0.6 + rng() * 1.5, sp: 14 + rng() * 22, ph: rng() * TAU });
    this.ambient = A; this.leafT = 0;
  }
  corpse(ev) { this.corpses.push({ type: ev.type, x: ev.x, y: ev.y, a: ev.a || 0, face: ev.face ?? 1, flying: ev.flying, boss: ev.boss, t: 0, id: Math.random() * 100 }); }
  towerPulse(x, y) { const g = this.game; if (!g) return; const t = g.towers.find(t => Math.abs(t.x - x) < 1 && Math.abs(t.y - y) < 1); if (t) t.pulseT = 0.45; }
  toWorld(cx, cy) { const v = this.view; return { x: (cx - v.ox) / v.s, y: (cy - v.oy) / v.s }; }
  toScreen(wx, wy) { const v = this.view; return { x: v.ox + wx * v.s, y: v.oy + wy * v.s }; }

  _visible() { const a = this.toWorld(0, 0), b = this.toWorld(this.cssW || 400, this.cssH || 800); return { x0: a.x - 24, x1: b.x + 24, y0: a.y - 4, y1: b.y + 50 }; }
  _wind(t, x) { return Math.sin(t * 1.25 + x * 0.018) * 0.6 + Math.sin(t * 0.43 + x * 0.006 + 1.3) * 0.4; }
  _drawScenery(c, d, t) {
    const sp = this.sprites, w = this._wind(t, d.x + d.y * 0.3) * (this.map.biome === 'frostpeak' ? 0.5 : 1);
    switch (d.kind) {
      case 'tree': {
        softShadow(c, d.x + 4 * d.s, d.y + 2, 16 * d.s, 5.5 * d.s, 0.3);
        c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s);
        drawSprite(c, sp.trunk, 0, 0);
        c.translate(0, -12); c.rotate(w * 0.035 + Math.sin(t * 2.3 + d.ph) * 0.008); c.translate(w * 0.8, 0);
        drawSprite(c, sp.canopies[Math.floor(d.v * 3) % 3], 0, 0);
        c.restore(); break;
      }
      case 'pine': {
        softShadow(c, d.x + 3 * d.s, d.y + 2, 13 * d.s, 4.5 * d.s, 0.3);
        c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s); c.transform(1, 0, -w * 0.05, 1, 0, 0);
        drawSprite(c, sp.pine[d.v < 0.5 ? 0 : 1], 0, 0); c.restore(); break;
      }
      case 'bush': { softShadow(c, d.x, d.y + 1, 11 * d.s, 3.6 * d.s, 0.28); c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s); c.transform(1, 0, -w * 0.04, 1, 0, 0); drawSprite(c, sp.bush, 0, 0); c.restore(); break; }
      case 'flowers': case 'glowflower': {
        c.save(); c.translate(d.x, d.y); c.transform(1, 0, -w * 0.18, 1, 0, 0);
        drawSprite(c, d.kind === 'flowers' ? sp.flowers[Math.floor(d.v * 3) % 3] : sp.glowflower, 0, 0); c.restore();
        if (d.kind === 'glowflower') { const g = 0.5 + Math.sin(t * 2 + d.ph) * 0.5; c.fillStyle = rg(c, d.x, d.y - 6, 0, 12, [[0, `rgba(170,140,255,${0.25 * g})`], [1, 'rgba(170,140,255,0)']]); c.fillRect(d.x - 12, d.y - 18, 24, 24); }
        break;
      }
      case 'grass': { c.save(); c.translate(d.x, d.y); c.scale(d.s, d.s); c.transform(1, 0, -w * 0.28 - Math.sin(t * 3 + d.ph) * 0.04, 1, 0, 0); drawSprite(c, sp.grass[d.v < 0.5 ? 0 : 1], 0, 0); c.restore(); break; }
    }
  }
  _drawLiveStatics(c, t) {
    // castle flags + entrance torches
    const x = this.scenery.castle, y = WORLD.h - 4;
    for (const sx of [-1, 1]) flag(c, x + sx * 24, y - 82, 12, '#ffcf5a', t, sx);
    const en = entrancePos(this.map.path), ca = Math.cos(en.a - Math.PI / 2), sa = Math.sin(en.a - Math.PI / 2);
    for (const sx of [-1, 1]) {
      const lx = sx * 18, ly = 4, tx = en.x + lx * ca - ly * sa, ty = en.y + lx * sa + ly * ca, f = Math.sin(t * 13 + sx) * 1.2 + Math.sin(t * 7.3) * 0.8;
      line(c, tx, ty + 8, tx, ty - 2, '#5a3a22', 2);
      c.fillStyle = rg(c, tx, ty - 6, 0, 16, [[0, 'rgba(255,170,70,.35)'], [1, 'rgba(255,170,70,0)']]); c.fillRect(tx - 16, ty - 22, 32, 32);
      poly(c, [[tx - 3, ty - 2], [tx + f * 0.4, ty - 11 - f], [tx + 3, ty - 2]], '#ff9a3a'); poly(c, [[tx - 1.5, ty - 2], [tx + f * 0.3, ty - 7 - f * 0.6], [tx + 1.5, ty - 2]], '#fff0a0');
    }
  }
  _drawAmbient(c, t, dt) {
    const A = this.ambient, W = WORLD.w, H = WORLD.h; if (!A) return;
    for (const b of A.bugs) {
      if (b.kind === 'butterfly') {
        const x = b.bx + Math.sin(t * 0.35 + b.ph) * 60 + Math.sin(t * 1.3 + b.ph * 2) * 10, y = b.by + Math.cos(t * 0.28 + b.ph) * 40 + Math.sin(t * 2.1 + b.ph) * 6;
        const flap = Math.abs(Math.sin(t * 16 + b.ph));
        softShadow(c, x, y + 14, 3, 1.2, 0.12);
        for (const sx of [-1, 1]) ell(c, x + sx * 2.4 * flap, y, 2.6 * flap + 0.3, 2.2, b.col, 'rgba(40,30,20,.4)', 0.5);
        line(c, x, y - 1.5, x, y + 1.5, '#3a2a1a', 0.8);
      } else {
        const x = b.bx + Math.sin(t * 0.25 + b.ph) * 40 + Math.sin(t * 0.9 + b.ph * 3) * 8, y = b.by + Math.cos(t * 0.2 + b.ph) * 30;
        const g = Math.max(0, Math.sin(t * 1.7 + b.ph * 5));
        c.fillStyle = rg(c, x, y, 0, 8, [[0, `rgba(220,255,140,${0.55 * g})`], [1, 'rgba(220,255,140,0)']]); c.fillRect(x - 8, y - 8, 16, 16);
        circ(c, x, y, 0.9, `rgba(255,255,200,${0.4 + g * 0.6})`);
      }
    }
    for (const f of A.fog) { f.x += f.sp * dt; if (f.x > W + 200) f.x = -200; c.save(); c.translate(f.x, f.y); c.scale(1.6, 0.6); c.fillStyle = rg(c, 0, 0, 0, f.r, [[0, 'rgba(200,190,230,.08)'], [1, 'rgba(200,190,230,0)']]); c.beginPath(); c.arc(0, 0, f.r, 0, TAU); c.fill(); c.restore(); }
    for (const fl of A.flakes) {
      fl.y += fl.sp * dt; fl.x += (Math.sin(t * 0.8 + fl.ph) * 10 + 6) * dt;
      if (fl.y > H + 60) { fl.y = -60; fl.x = Math.random() * (W + 120) - 60; }
      if (fl.x > W + 60) fl.x = -60;
      circ(c, fl.x, fl.y, fl.r, 'rgba(255,255,255,.85)');
    }
    for (const cl of A.clouds) { cl.x += cl.sp * dt; if (cl.x - cl.r * 1.6 > W + 60) { cl.x = -cl.r * 1.6 - 60; cl.y = Math.random() * H; } c.save(); c.translate(cl.x, cl.y); c.scale(1.6, 0.7); c.fillStyle = rg(c, 0, 0, 0, cl.r, [[0, 'rgba(10,25,45,.10)'], [0.6, 'rgba(10,25,45,.06)'], [1, 'rgba(10,25,45,0)']]); c.beginPath(); c.arc(0, 0, cl.r, 0, TAU); c.fill(); c.restore(); }
    // falling leaves from meadow trees
    if (this.map.biome === 'meadow' && dt > 0) {
      this.leafT -= dt;
      if (this.leafT <= 0) {
        this.leafT = 0.6 + Math.random() * 1.2;
        const trees = this.scenery.dynamics.filter(d => d.kind === 'tree' && d.x > -20 && d.x < W + 20 && d.y > 0 && d.y < H + 20);
        const tr = trees[Math.floor(Math.random() * trees.length)];
        if (tr) this.particles.add({ x: tr.x + (Math.random() - 0.5) * 18, y: tr.y - 24 * tr.s, vx: 6, vy: 9, g: 0, life: 0, max: 3.2, kind: 'leaf', rot: Math.random() * TAU, ph: Math.random() * TAU, color: ['#8fc456', '#c9b84a', '#6fa040'][Math.floor(Math.random() * 3)] });
      }
    }
  }

  // alpha: 0..1 interpolation between the last two logic ticks
  draw(game, ui, dt, alpha = 1) {
    const c = this.c, v = this.view, d = this.dpr; this.time += dt; this.game = game;
    const t = this.time;
    this.particles.update(dt);
    c.setTransform(1, 0, 0, 1, 0, 0);
    c.fillStyle = BIOMES[this.map.biome].ground[1]; c.fillRect(0, 0, this.cv.width, this.cv.height);
    if (this.bg) c.drawImage(this.bg, Math.round((v.ox - M * v.s) * d), Math.round((v.oy - M * v.s) * d));
    c.setTransform(v.s * d, 0, 0, v.s * d, v.ox * d, v.oy * d);
    if (!game) {
      const vis = this._visible();
      for (const s of this.scenery.dynamics) if (s.x > vis.x0 && s.x < vis.x1 && s.y > vis.y0 && s.y < vis.y1) this._drawScenery(c, s, t);
      this._drawLiveStatics(c, t); this._drawAmbient(c, t, dt); return;
    }
    // interpolate positions for smooth motion
    const L = (o) => { if (o.px === undefined) return; o._x = o.x; o._y = o.y; o.x = o.px + (o.x - o.px) * alpha; o.y = o.py + (o.y - o.py) * alpha; };
    const R = (o) => { if (o._x === undefined) return; o.x = o._x; o.y = o._y; o._x = undefined; };
    const movers = [...game.enemies, ...game.projectiles];
    for (const tw of game.towers) if (tw.soldiers) movers.push(...tw.soldiers);
    for (const o of movers) L(o);
    // per-frame visual state easing
    for (const e of game.enemies) {
      e.frozen = game.time < e.frozenUntil; e.slowed = game.time < e.slowUntil; e.burning = game.time < e.burnUntil;
      const cx = Math.cos(e.a || 0); if (Math.abs(cx) > 0.25) e.faceT = cx < 0 ? -1 : 1; if (e.faceT === undefined) e.faceT = 1;
      e.faceS = e.faceS === undefined ? e.faceT : e.faceS + (e.faceT - e.faceS) * Math.min(1, dt * 10);
      e.dhp = e.dhp === undefined ? e.hp : e.dhp + (e.hp - e.dhp) * Math.min(1, dt * 4);
      if (e.burning && Math.random() < dt * 8) this.particles.add({ x: e.x + (Math.random() - 0.5) * 6, y: e.y - 8, vx: 0, vy: -20, g: 0, life: 0, max: 0.5, kind: 'glow', size: 1.5, color: 'rgba(255,150,50,.9)' });
      if (e.type === 'wraith' && Math.random() < dt * 4) this.particles.add({ x: e.x, y: e.y - 6, vx: (Math.random() - 0.5) * 8, vy: -8, g: 0, life: 0, max: 0.8, kind: 'smoke', size: 2.5, color: 'rgba(150,110,230,.35)' });
      if (e.boss && !e.blockedBy && Math.random() < dt * 2.5) this.particles.add({ x: e.x + (Math.random() - 0.5) * 20, y: e.y, vx: (Math.random() - 0.5) * 20, vy: -6, g: 0, drag: 2, life: 0, max: 0.6, kind: 'smoke', size: 4, color: 'rgba(150,130,100,.35)' });
    }
    for (const tw of game.towers) {
      tw.drawAngle = tw.drawAngle === undefined ? tw.angle : lerpAngle(tw.drawAngle, tw.angle, Math.min(1, dt * 14));
      if (tw.pulseT > 0) tw.pulseT -= dt;
      if (tw.type === 'barracks' && Math.random() < dt * 1.3) this.particles.add({ x: tw.x + 10, y: tw.y - 40, vx: 3, vy: -12, g: 0, drag: 0.5, life: 0, max: 2, kind: 'smoke', size: 2.6, color: 'rgba(200,195,190,.35)' });
      if (tw.type === 'mage' && Math.random() < dt * 2.5) this.particles.add({ x: tw.x + (Math.random() - 0.5) * 16, y: tw.y - 52 + (Math.random() - 0.5) * 10, vx: 0, vy: -10, g: 0, life: 0, max: 0.9, kind: 'glow', size: 1.2, color: tw.branch === 'warlock' ? 'rgba(120,255,240,.9)' : 'rgba(210,170,255,.9)' });
      if (tw.soldiers) for (const so of tw.soldiers) { const tf = so.target ? (so.target.x < so.x ? -1 : 1) : (so.hx < so.x - 1 ? -1 : so.hx > so.x + 1 ? 1 : (so.faceT ?? 1)); so.faceT = tf; so.faceS = so.faceS === undefined ? tf : so.faceS + (tf - so.faceS) * Math.min(1, dt * 10); }
    }
    for (const p of game.projectiles) { if (!p.trail) p.trail = []; if (dt > 0) { p.trail.push([p.x, p.y - (p.h || 0)]); if (p.trail.length > 6) p.trail.shift(); } }
    // empty pad hints
    game.map.spots.forEach(([x, y], i) => {
      if (game.towerAtSpot(i)) return;
      const sel = ui.spot === i, pulse = (Math.sin(t * 2.6 + i) + 1) / 2, gate = ui.gateSpot != null && ui.gateSpot !== i;
      if (gate) return;
      ell(c, x, y, 19, 8.5, sel ? 'rgba(255,216,107,.35)' : `rgba(255,240,200,${0.05 + pulse * 0.08})`, sel ? '#ffd86b' : null, 1.6);
      if (!sel) { c.globalAlpha = 0.5 + pulse * 0.35; line(c, x - 4, y - 0.5, x + 4, y - 0.5, '#fff7dc', 1.5); line(c, x, y - 4.5, x, y + 3.5, '#fff7dc', 1.5); c.globalAlpha = 1; }
    });
    const rangeAt = (x, y, r, col = '255,216,107') => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = `rgba(${col},.10)`; c.fill(); c.setLineDash([6, 5]); c.lineDashOffset = -t * 12; c.strokeStyle = `rgba(${col},.8)`; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]); };
    if (ui.preview) rangeAt(ui.preview.x, ui.preview.y, ui.preview.range, ui.preview.cant ? '255,110,90' : '255,216,107');
    if (ui.tower) {
      rangeAt(ui.tower.x, ui.tower.y, ui.tower.stats.range);
      if (ui.tower.rally) { const rx = ui.tower.rally.x, ry = ui.tower.rally.y; ell(c, rx, ry, 14, 6, ui.rallyMode ? 'rgba(255,216,107,.25)' : null, 'rgba(255,255,255,.85)', 1.3); flag(c, rx, ry - 14, 9, '#ffcf5a', t); }
    }
    // y-sorted scene
    const items = [];
    const vis = this._visible();
    for (const s of this.scenery.dynamics) if (s.x > vis.x0 && s.x < vis.x1 && s.y > vis.y0 && s.y < vis.y1) items.push({ y: s.y, f: () => this._drawScenery(c, s, t) });
    for (const tw of game.towers) items.push({ y: tw.y, f: () => drawTower(c, tw, t) });
    for (const e of game.enemies) if (!e.flying) items.push({ y: e.y, f: () => drawEnemy(c, e, t, { alpha: clamp01(e.dist / 18 + 0.15) }) });
    for (const tw of game.towers) if (tw.soldiers) for (const so of tw.soldiers) items.push({ y: so.y, f: () => drawSoldier(c, so, tw.branch, t) });
    for (const cp of this.corpses) if (!cp.flying) items.push({ y: cp.y - 1, f: () => this._drawCorpse(c, cp, t) });
    items.sort((a, b) => a.y - b.y); for (const it of items) it.f();
    this._drawLiveStatics(c, t);
    if (ui.tower) ell(c, ui.tower.x, ui.tower.y + 6, 23, 9.5, null, `rgba(255,216,107,${0.7 + Math.sin(t * 5) * 0.3})`, 2);
    if (ui.enemy && ui.enemy.alive) { const e = ui.enemy; ell(c, e.x, e.y + 2, e.def.size * 1.3, e.def.size * 0.5, null, `rgba(255,216,107,${0.7 + Math.sin(t * 6) * 0.3})`, 1.6); }
    for (const p of game.projectiles) drawProjectile(c, p, t);
    for (const cp of this.corpses) if (cp.flying) this._drawCorpse(c, cp, t);
    for (const e of game.enemies) if (e.flying) drawEnemy(c, e, t);
    this.particles.draw(c);
    this._drawAmbient(c, t, dt);
    for (const cp of this.corpses) cp.t += dt;
    this.corpses = this.corpses.filter(cp => cp.t < 0.6);
    for (const o of movers) R(o);
  }
  _drawCorpse(c, cp, t) {
    const k = cp.t / 0.6, d = ENEMIES[cp.type];
    const e = { type: cp.type, def: d, x: cp.x, y: cp.y + (cp.flying ? k * 18 : 0), a: cp.a, faceS: cp.face, walk: 0, hp: 1, maxHp: 1, id: cp.id };
    if (k > 0.55 && !cp.puffed) { cp.puffed = true; this.particles.burst(cp.x, cp.y - 6, cp.boss ? 26 : 7, { colors: ['rgba(110,100,100,.5)', 'rgba(150,140,140,.45)'], speed: cp.boss ? 60 : 30, up: 8, g: -15, drag: 1.5, life: 0.6, size: cp.boss ? 9 : 4.5, kind: 'smoke' }); }
    drawEnemy(c, e, t, { alpha: 1 - k * k, tilt: -cp.face * Math.min(1, k * 2.2) * 1.3, bare: true, noShadow: k > 0.4 });
  }
}

// ---------- icon factory for the DOM UI ----------
const iconCache = new Map();
export function iconURL(kind, type, opts = {}) {
  const key = kind + ':' + type + ':' + JSON.stringify(opts);
  if (iconCache.has(key)) return iconCache.get(key);
  const px = opts.px || 96, cv = document.createElement('canvas'); cv.width = px; cv.height = px;
  const c = cv.getContext('2d');
  if (kind === 'tower') {
    const tr = opts.tier || 3, sc = px / (tr <= 1 ? 60 : tr === 2 ? 72 : 80); c.setTransform(sc, 0, 0, sc, px / 2, px * (tr <= 1 ? 0.8 : 0.79));
    drawTower(c, { x: 0, y: 0, type, tier: opts.tier || 3, branch: opts.branch || null, angle: -0.5, drawAngle: -0.5, anim: 1, soldiers: [] }, 0.6, { noPips: true, icon: true });
  } else if (kind === 'enemy') {
    const d = ENEMIES[type]; const sc = px / (d.boss ? 80 : 44); c.setTransform(sc, 0, 0, sc, px / 2, px * (d.flying ? 0.98 : 0.86));
    drawEnemy(c, { type, def: d, x: 0, y: 0, a: 0, walk: 0.6, hp: 1, maxHp: 1, id: 1, faceS: 1 }, 0, { bare: true });
  }
  const url = cv.toDataURL('image/png'); iconCache.set(key, url); return url;
}

// ---------- campaign world map ----------
export const WORLD_NODES = [[0.28, 0.88], [0.70, 0.75], [0.32, 0.60], [0.68, 0.46], [0.30, 0.29], [0.66, 0.13]];
export const WORLD_BANDS = [{ biome: 'frostpeak', y0: 0, y1: 0.37 }, { biome: 'darkwood', y0: 0.37, y1: 0.67 }, { biome: 'meadow', y0: 0.67, y1: 1 }];
export function drawWorldMap(c, w, h) {
  const rng = mulberry32(4242), s = Math.min(1.2, w / 380);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e8f1f7'); g.addColorStop(0.3, '#bfd3e1'); g.addColorStop(0.37, '#5b7464'); g.addColorStop(0.42, '#34503a');
  g.addColorStop(0.62, '#2d4630'); g.addColorStop(0.69, '#669a42'); g.addColorStop(1, '#80b052');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  const pts = WORLD_NODES.map(([x, y]) => [x * w, y * h]);
  const full = [[pts[0][0] - 40 * s, h + 20], ...pts];
  const trail = (lw, col, dash) => {
    c.beginPath(); c.moveTo(full[0][0], full[0][1]);
    for (let i = 1; i < full.length; i++) { const [px, py] = full[i - 1], [x, y] = full[i]; const mx = (px + x) / 2, my = (py + y) / 2; c.quadraticCurveTo(px + (mx - px) * 0.2 + (x > px ? 30 : -30) * s, my + 30 * s, x, y); }
    c.lineWidth = lw; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
  };
  trail(24 * s, 'rgba(0,0,0,.12)'); trail(16 * s, '#b99a74'); trail(3 * s, 'rgba(255,240,210,.65)', [6 * s, 9 * s]);
  const decos = [];
  for (let k = 0; k < 700 && decos.length < 50; k++) {
    const x = rng() * w, y = 10 + rng() * (h - 10);
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 52 * s)) continue;
    let near = false; for (let i = 1; i < full.length; i++) { if (segDist(x, y, full[i - 1][0], full[i - 1][1], full[i][0], full[i][1]) < 30 * s) near = true; } if (near) continue;
    if (decos.some(d => Math.hypot(d.x - x, d.y - y) < 26 * s)) continue;
    decos.push({ x, y, r: rng() });
  }
  decos.sort((a, b) => a.y - b.y);
  for (const d of decos) {
    const yy = d.y / h;
    c.save(); c.translate(d.x, d.y);
    if (yy < 0.37) { if (d.r < 0.6) { softShadow(c, 3, 2, 11 * s, 4 * s, 0.25); c.scale(0.85 * s, 0.85 * s); pineArt(c, 1, false, true); } else rockArt(c, 0, 0, 0.9 * s, '#8ea1b3', '#eef5fa'); }
    else if (yy < 0.67) { if (d.r < 0.7) { softShadow(c, 3, 2, 11 * s, 4 * s, 0.25); c.scale(0.9 * s, 0.9 * s); pineArt(c, 1, true, false); } else mushroomArt(c, 0, 0, 1.1 * s); }
    else { softShadow(c, 3, 2, 13 * s, 4.5 * s, 0.25); c.scale(0.8 * s, 0.8 * s); if (d.r < 0.6) { treeTrunk(c, 1); c.translate(0, -12); treeCanopy(c, 1, d.r, ['#a9d466', '#64a03c', '#3d6e26']); } else bushArt(c, 1, ['#7dbb4f', '#3f7a2a'], '#e0504a'); }
    c.restore();
  }
}
