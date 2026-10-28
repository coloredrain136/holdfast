// Holdfast — all art is drawn here in code (no image assets).
import { WORLD, BIOMES, ENEMIES, TOWERS } from './config.js';
import { mulberry32, hashStr, Path } from './engine.js';

const OUT = '#1c130e';            // dark outline color
const TAU = Math.PI * 2;
const M = 70;                     // background margin beyond the world rect

// ---------- small drawing helpers ----------
function ell(c, x, y, rx, ry, fill, stroke, lw = 1.4) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function circ(c, x, y, r, fill, stroke, lw) { ell(c, x, y, r, r, fill, stroke, lw); }
function poly(c, pts, fill, stroke, lw = 1.4) { c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.lineJoin = 'round'; c.stroke(); } }
function rrect(c, x, y, w, h, r, fill, stroke, lw = 1.4) { c.beginPath(); c.roundRect ? c.roundRect(x, y, w, h, r) : c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw; c.strokeStyle = stroke; c.stroke(); } }
function lgrad(c, x0, y0, x1, y1, stops) { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(s[0], s[1])); return g; }
function rgrad(c, x, y, r0, r1, stops) { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach(s => g.addColorStop(s[0], s[1])); return g; }
function shadow(c, x, y, rx, ry = rx * 0.38, a = 0.28) { ell(c, x, y, rx, ry, `rgba(0,0,0,${a})`); }
function line(c, x0, y0, x1, y1, color, w) { c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.strokeStyle = color; c.lineWidth = w; c.lineCap = 'round'; c.stroke(); }

// ---------- decorations ----------
function tree(c, x, y, s, r) {
  shadow(c, x + 3 * s, y + 2, 14 * s, 5 * s);
  rrect(c, x - 2.5 * s, y - 10 * s, 5 * s, 12 * s, 1.5, '#6b4628', OUT, 1.2);
  const g = rgrad(c, x - 5 * s, y - 26 * s, 2, 18 * s, [[0, '#9ccc5a'], [0.6, '#5f9a3a'], [1, '#3f7228']]);
  c.beginPath(); c.arc(x - 7 * s, y - 16 * s, 9 * s, 0, TAU); c.arc(x + 7 * s, y - 17 * s, 9 * s, 0, TAU); c.arc(x, y - 25 * s, 11 * s, 0, TAU);
  c.fillStyle = g; c.fill(); c.lineWidth = 1.3; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.arc(x - 7 * s, y - 16 * s, 9 * s - 0.7, 0, TAU); c.arc(x + 7 * s, y - 17 * s, 9 * s - 0.7, 0, TAU); c.arc(x, y - 25 * s, 11 * s - 0.7, 0, TAU); c.fillStyle = g; c.fill();
  circ(c, x - 4 * s, y - 29 * s, 3.5 * s, 'rgba(255,255,220,.25)');
  if (r < 0.3) { circ(c, x + 6 * s, y - 20 * s, 1.6 * s, '#d8413a'); circ(c, x - 6 * s, y - 14 * s, 1.6 * s, '#d8413a'); }
}
function pine(c, x, y, s, dark, snow) {
  shadow(c, x + 3 * s, y + 2, 12 * s, 4.5 * s);
  rrect(c, x - 2 * s, y - 6 * s, 4 * s, 8 * s, 1, '#4a3020', OUT, 1.1);
  const cols = dark ? ['#25402e', '#1d3426'] : ['#3d6b3a', '#2d5530'];
  for (let i = 0; i < 3; i++) {
    const yy = y - 6 * s - i * 9 * s, w = (13 - i * 3.2) * s;
    poly(c, [[x - w, yy], [x + w, yy], [x, yy - 15 * s]], lgrad(c, x - w, 0, x + w, 0, [[0, cols[0]], [1, cols[1]]]), OUT, 1.2);
    if (snow) poly(c, [[x - w * 0.55, yy - 6.5 * s], [x + w * 0.5, yy - 7 * s], [x, yy - 15 * s]], '#f3f8fc');
  }
}
function rock(c, x, y, s, col = '#8d8f94', hi = '#b6b8bd') {
  shadow(c, x + 2, y + 1, 9 * s, 3.5 * s);
  poly(c, [[x - 9 * s, y], [x - 7 * s, y - 7 * s], [x - 1 * s, y - 10 * s], [x + 7 * s, y - 7 * s], [x + 9 * s, y]], col, OUT, 1.2);
  poly(c, [[x - 6 * s, y - 6 * s], [x - 1 * s, y - 9 * s], [x + 3 * s, y - 7 * s], [x - 2 * s, y - 5 * s]], hi);
}
function bush(c, x, y, s, col) {
  shadow(c, x, y + 1, 10 * s, 3.5 * s);
  c.beginPath(); c.arc(x - 5 * s, y - 4 * s, 6 * s, 0, TAU); c.arc(x + 5 * s, y - 4 * s, 6 * s, 0, TAU); c.arc(x, y - 8 * s, 6.5 * s, 0, TAU);
  c.fillStyle = col; c.fill(); c.lineWidth = 1.1; c.strokeStyle = OUT; c.stroke();
  c.beginPath(); c.arc(x - 5 * s, y - 4 * s, 5.4 * s, 0, TAU); c.arc(x + 5 * s, y - 4 * s, 5.4 * s, 0, TAU); c.arc(x, y - 8 * s, 5.9 * s, 0, TAU); c.fill();
  circ(c, x - 2 * s, y - 10 * s, 2 * s, 'rgba(255,255,255,.2)');
}
function mushroom(c, x, y, s) {
  rrect(c, x - 1.5 * s, y - 5 * s, 3 * s, 5 * s, 1, '#efe4cf', OUT, 1);
  ell(c, x, y - 5 * s, 5 * s, 3.5 * s, '#c43b3b', OUT, 1); circ(c, x - 2 * s, y - 6 * s, 0.9 * s, '#fff'); circ(c, x + 1.8 * s, y - 5.5 * s, 0.8 * s, '#fff');
}
function deadTree(c, x, y, s) {
  shadow(c, x + 2, y + 1, 8 * s, 3 * s);
  c.lineCap = 'round';
  line(c, x, y, x, y - 22 * s, OUT, 5.5 * s); line(c, x, y, x, y - 22 * s, '#5a4636', 3.5 * s);
  for (const [a, l, h] of [[-0.8, 9, 12], [0.7, 10, 16], [-0.5, 6, 20]]) {
    const ex = x + Math.sin(a) * l * s, ey = y - h * s - Math.cos(a) * l * s * 0.6;
    line(c, x, y - h * s, ex, ey, OUT, 3.4 * s); line(c, x, y - h * s, ex, ey, '#5a4636', 1.8 * s);
  }
}
function flowers(c, x, y, rng, cols) { for (let i = 0; i < 5; i++) { const fx = x + (rng() - 0.5) * 16, fy = y + (rng() - 0.5) * 10; circ(c, fx, fy, 1.6, cols[Math.floor(rng() * cols.length)]); circ(c, fx, fy, 0.6, '#fff6b0'); } }
function snowDrift(c, x, y, s) { ell(c, x, y, 14 * s, 5 * s, '#f4f9fd'); ell(c, x - 4 * s, y - 2 * s, 6 * s, 2.5 * s, '#ffffff'); }

// ---------- background ----------
function segDist(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy; let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t)); return Math.hypot(px - (ax + dx * t), py - (ay + dy * t)); }
function pathDist(path, x, y) { let m = 1e9; for (let i = 1; i < path.length; i++) m = Math.min(m, segDist(x, y, path[i - 1][0], path[i - 1][1], path[i][0], path[i][1])); return m; }

export function drawBackground(c, map, opts = {}) {
  const B = BIOMES[map.biome], W = WORLD.w, H = WORLD.h, rng = mulberry32(hashStr(map.id + ':bg'));
  // ground
  c.fillStyle = lgrad(c, 0, -M, 0, H + M, [[0, B.ground[0]], [1, B.ground[1]]]); c.fillRect(-M, -M, W + 2 * M, H + 2 * M);
  for (let i = 0; i < 26; i++) {
    const x = -M + rng() * (W + 2 * M), y = -M + rng() * (H + 2 * M), r = 40 + rng() * 90;
    const light = rng() < 0.5;
    c.fillStyle = rgrad(c, x, y, 0, r, [[0, light ? 'rgba(255,255,230,.10)' : 'rgba(0,20,0,.12)'], [1, 'rgba(0,0,0,0)']]);
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  // ground texture
  for (let i = 0; i < 520; i++) {
    const x = -M + rng() * (W + 2 * M), y = -M + rng() * (H + 2 * M);
    if (map.biome === 'frostpeak') { circ(c, x, y, 0.6 + rng() * 1.1, rng() < 0.5 ? 'rgba(255,255,255,.7)' : 'rgba(120,150,180,.25)'); continue; }
    const col = rng() < 0.5 ? 'rgba(20,50,10,.35)' : 'rgba(210,240,140,.25)';
    c.strokeStyle = col; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 2, y); c.lineTo(x - 0.5, y - 4); c.moveTo(x + 2, y); c.lineTo(x + 0.5, y - 4.5); c.stroke();
  }
  // road
  const P = map.path, rw = WORLD.roadWidth;
  const stroke = (w, col, dash) => { c.beginPath(); c.moveTo(P[0][0], P[0][1]); for (let i = 1; i < P.length; i++) c.lineTo(P[i][0], P[i][1]); c.lineWidth = w; c.strokeStyle = col; c.lineJoin = 'round'; c.lineCap = 'round'; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]); };
  stroke(rw + 12, 'rgba(0,0,0,.18)');
  stroke(rw + 6, B.road[1]);
  stroke(rw, B.road[0]);
  stroke(rw * 0.42, 'rgba(255,255,255,.08)');
  const path = new Path(P);
  for (let d = 0; d < path.total; d += 7) {
    const p = path.at(d), off = (rng() - 0.5) * rw * 0.85;
    const x = p.x + Math.cos(p.a + Math.PI / 2) * off, y = p.y + Math.sin(p.a + Math.PI / 2) * off;
    if (rng() < 0.55) ell(c, x, y, 1.2 + rng() * 2, 0.9 + rng() * 1.3, rng() < 0.5 ? B.road[2] : B.road[1]);
  }
  if (map.biome === 'frostpeak') for (let d = 0; d < path.total; d += 30) { const p = path.at(d); const side = rng() < 0.5 ? -1 : 1; ell(c, p.x + Math.cos(p.a + Math.PI / 2) * side * rw * 0.5, p.y + Math.sin(p.a + Math.PI / 2) * side * rw * 0.5, 8, 3, 'rgba(255,255,255,.75)'); }
  // build pads
  for (const [x, y] of map.spots) drawPad(c, x, y, map.biome);
  // decorations
  const decos = [], spots = map.spots;
  for (let tries = 0; tries < 900 && decos.length < 70; tries++) {
    const x = -M * 0.6 + rng() * (W + M * 1.2), y = -M * 0.4 + rng() * (H + M * 0.6);
    if (pathDist(P, x, y) < rw / 2 + 20) continue;
    if (spots.some(([sx, sy]) => Math.hypot(sx - x, sy - y) < 34)) continue;
    if (y > H - 50 && Math.abs(x - P[P.length - 1][0]) < 90) continue; // keep the castle clear
    if (decos.some(d => Math.hypot(d.x - x, d.y - y) < 24)) continue;
    decos.push({ x, y, r: rng(), s: 0.75 + rng() * 0.45 });
  }
  decos.sort((a, b) => a.y - b.y);
  for (const d of decos) {
    if (map.biome === 'meadow') { if (d.r < 0.45) tree(c, d.x, d.y, d.s, rng()); else if (d.r < 0.65) bush(c, d.x, d.y, d.s, '#5f9a3a'); else if (d.r < 0.8) rock(c, d.x, d.y, d.s * 0.8); else flowers(c, d.x, d.y, rng, ['#f6d14b', '#f08bb0', '#ffffff', '#9ac6ff']); }
    else if (map.biome === 'darkwood') { if (d.r < 0.5) pine(c, d.x, d.y, d.s * 1.05, true, false); else if (d.r < 0.62) deadTree(c, d.x, d.y, d.s); else if (d.r < 0.78) { mushroom(c, d.x, d.y, d.s); mushroom(c, d.x + 6, d.y + 3, d.s * 0.7); } else if (d.r < 0.9) bush(c, d.x, d.y, d.s, '#2f4a32'); else { circ(c, d.x, d.y, 6, 'rgba(160,120,255,.18)'); circ(c, d.x, d.y, 1.8, '#c9b4ff'); } }
    else { if (d.r < 0.5) pine(c, d.x, d.y, d.s, false, true); else if (d.r < 0.7) rock(c, d.x, d.y, d.s * 0.9, '#8fa2b4', '#e8f2fa'); else snowDrift(c, d.x, d.y, d.s); }
  }
  if (map.biome === 'darkwood') { c.fillStyle = 'rgba(20,10,40,.12)'; c.fillRect(-M, -M, W + 2 * M, H + 2 * M); }
  drawEntrance(c, P, map.biome);
  drawCastle(c, P[P.length - 1][0], H - 4, map.biome);
}
function drawPad(c, x, y, biome) {
  shadow(c, x, y + 4, 21, 8, 0.25);
  ell(c, x, y + 2, 20, 9, biome === 'frostpeak' ? '#7f8c99' : '#6f6a62', OUT, 1.4);
  ell(c, x, y, 19, 8.5, biome === 'frostpeak' ? '#aebccb' : '#a39a8b');
  for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; line(c, x, y, x + Math.cos(a) * 18, y + Math.sin(a) * 8, 'rgba(60,50,40,.35)', 0.9); }
  ell(c, x, y, 7, 3, 'rgba(255,255,255,.12)');
}
function drawEntrance(c, P, biome) {
  // dark tunnel/cave where enemies come from
  let [x, y] = P[0]; const [nx, ny] = P[1];
  const a = Math.atan2(ny - y, nx - x);
  x = Math.max(-10, Math.min(WORLD.w + 10, x)); y = Math.max(-10, Math.min(WORLD.h + 10, y));
  const ex = x + Math.cos(a) * 26, ey = y + Math.sin(a) * 26;
  c.save(); c.translate(ex, ey); c.rotate(a - Math.PI / 2);
  c.fillStyle = rgrad(c, 0, -10, 2, 40, [[0, 'rgba(10,5,15,.85)'], [1, 'rgba(10,5,15,0)']]); c.fillRect(-55, -60, 110, 110);
  const rc = biome === 'frostpeak' ? ['#9fb2c4', '#dfeaf3'] : ['#77706a', '#a69e94'];
  for (const sx of [-1, 1]) for (let i = 0; i < 3; i++) rock(c, sx * (26 + i * 7), -6 - i * 9, 1 - i * 0.12, rc[0], rc[1]);
  c.restore();
}
function drawCastle(c, x, y, biome) {
  const stone = biome === 'frostpeak' ? ['#b9c6d2', '#8797a6'] : ['#b8ab98', '#8a7e6e'];
  // walls
  for (const sx of [-1, 1]) {
    const wx = x + sx * 44;
    rrect(c, wx - 26, y - 26, 52, 30, 2, lgrad(c, 0, y - 26, 0, y + 4, [[0, stone[0]], [1, stone[1]]]), OUT, 1.5);
    for (let i = 0; i < 4; i++) rrect(c, wx - 24 + i * 13, y - 32, 8, 7, 1, stone[0], OUT, 1.2);
    for (let r = 0; r < 3; r++) line(c, wx - 25, y - 18 + r * 8, wx + 25, y - 18 + r * 8, 'rgba(0,0,0,.18)', 0.8);
  }
  // gatehouse towers
  for (const sx of [-1, 1]) {
    const tx = x + sx * 24;
    rrect(c, tx - 10, y - 46, 20, 50, 2, lgrad(c, tx - 10, 0, tx + 10, 0, [[0, stone[0]], [1, stone[1]]]), OUT, 1.5);
    poly(c, [[tx - 13, y - 46], [tx + 13, y - 46], [tx, y - 66]], '#3f5a9c', OUT, 1.4);
    line(c, tx, y - 66, tx, y - 78, OUT, 1.4);
    poly(c, [[tx, y - 78], [tx + 11, y - 74], [tx, y - 70]], '#e8b54a', OUT, 1);
  }
  // gate arch
  c.beginPath(); c.moveTo(x - 14, y + 4); c.lineTo(x - 14, y - 22); c.arc(x, y - 22, 14, Math.PI, 0); c.lineTo(x + 14, y + 4); c.closePath();
  c.fillStyle = '#2a1a12'; c.fill(); c.lineWidth = 1.5; c.strokeStyle = OUT; c.stroke();
  for (let i = -10; i <= 10; i += 5) line(c, x + i, y - 30, x + i, y + 2, '#5b4a3a', 1.4);
  line(c, x - 13, y - 16, x + 13, y - 16, '#5b4a3a', 1.4);
}

// ---------- towers ----------
const ROOF = { archer: '#b5452f', ranger: '#3f8a3a', marksman: '#3c62a8' };
export function drawTower(c, t, time, opts = {}) {
  const { x, y, type, tier, branch } = t, s = 1 + (tier - 1) * 0.06, anim = (t.anim || 0) + (opts.phase || 0);
  shadow(c, x, y + 8, 19 * s, 7 * s, 0.3);
  c.save(); c.translate(x, y); c.scale(s, s);
  const firing = t.firing > 0;
  switch (type) {
    case 'archer': {
      // stone base
      rrect(c, -13, -6, 26, 16, 3, lgrad(c, -13, 0, 13, 0, [[0, '#b2a794'], [1, '#867b6b']]), OUT);
      line(c, -12, 1, 12, 1, 'rgba(0,0,0,.2)', 0.8); line(c, -3, -6, -3, 1, 'rgba(0,0,0,.2)', 0.8); line(c, 5, 1, 5, 10, 'rgba(0,0,0,.2)', 0.8);
      // wooden posts
      rrect(c, -12, -26, 4, 22, 1, '#7b5132', OUT, 1.2); rrect(c, 8, -26, 4, 22, 1, '#7b5132', OUT, 1.2);
      line(c, -9, -8, 9, -22, '#5e3c24', 2); line(c, 9, -8, -9, -22, '#5e3c24', 2);
      // platform
      rrect(c, -16, -30, 32, 7, 2, '#9a6a40', OUT);
      // archer(s)
      const n = branch === 'ranger' ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const ax = n === 2 ? (i ? 6 : -6) : 0;
        circ(c, ax, -36, 4.2, '#f0c8a0', OUT, 1.1);
        poly(c, [[ax - 5, -36], [ax + 5, -36], [ax, -44]], branch === 'marksman' ? '#3c62a8' : '#4c8a3e', OUT, 1);
        // bow pointing at target
        c.save(); c.translate(ax, -34); c.rotate(t.angle || 0);
        c.beginPath(); c.arc(6, 0, 6, -1.2, 1.2); c.strokeStyle = '#6b4220'; c.lineWidth = 1.8; c.stroke();
        line(c, 6 + Math.cos(-1.2) * 6, Math.sin(-1.2) * 6, 6 + Math.cos(1.2) * 6, Math.sin(1.2) * 6, '#eee', 0.6);
        if (!firing) line(c, 2, 0, 12, 0, '#d9c49a', 1);
        c.restore();
      }
      // roof
      if (tier >= 2) {
        const rc = ROOF[branch] || ROOF.archer;
        poly(c, [[-18, -44 - (n === 2 ? 2 : 0)], [18, -44 - (n === 2 ? 2 : 0)], [0, -60]], rc, OUT);
        poly(c, [[-18, -44], [0, -60], [-6, -44]], 'rgba(255,255,255,.18)');
        if (tier >= 3) { line(c, 0, -60, 0, -68, OUT, 1.2); poly(c, [[0, -68], [9, -65], [0, -62]], '#e8b54a', OUT, 0.8); }
      }
      if (branch === 'marksman') { circ(c, 12, -27, 2.4, '#e8b54a', OUT, 1); }
      break;
    }
    case 'mage': {
      const tc = branch === 'warlock' ? ['#3a8a8a', '#1f5c66'] : branch === 'archmage' ? ['#6a4bb5', '#3f2a80'] : ['#7e6a9e', '#56446f'];
      rrect(c, -13, -32, 26, 42, 4, lgrad(c, -13, 0, 13, 0, [[0, '#c7bdd6'], [1, '#8c809e']]), OUT);
      for (let r = 0; r < 4; r++) line(c, -12, -24 + r * 9, 12, -24 + r * 9, 'rgba(40,20,60,.22)', 0.8);
      rrect(c, -4, -2, 8, 12, [4, 4, 0, 0], '#3b2a52', OUT, 1);
      ell(c, 0, -32, 15, 5, tc[0], OUT); ell(c, 0, -33, 13, 3.8, tc[1]);
      // windows
      rrect(c, -9, -22, 4, 6, 2, '#ffd36a'); rrect(c, 5, -22, 4, 6, 2, '#ffd36a');
      if (tier >= 2) { poly(c, [[-15, -33], [15, -33], [9, -40], [-9, -40]], tc[0], OUT, 1.2); }
      if (tier >= 3) { for (const sx of [-1, 1]) poly(c, [[sx * 15, -33], [sx * 19, -48], [sx * 11, -36]], '#e8b54a', OUT, 1); }
      // orb
      const bob = Math.sin(anim * 2.4) * 2, oy = -50 + bob, big = branch === 'archmage' ? 1.35 : 1;
      const oc = branch === 'warlock' ? ['#cffff6', '#3fe0c8'] : branch === 'archmage' ? ['#fff4d8', '#ff9df0'] : ['#f4e8ff', '#b07bff'];
      c.fillStyle = rgrad(c, 0, oy, 0, 18 * big, [[0, oc[1] + 'aa'], [1, oc[1] + '00']]); c.fillRect(-20 * big, oy - 20 * big, 40 * big, 40 * big);
      circ(c, 0, oy, 6.5 * big * (firing ? 1.15 : 1), rgrad(c, -2, oy - 2, 1, 7 * big, [[0, oc[0]], [1, oc[1]]]), OUT, 1.2);
      circ(c, -2, oy - 2.5, 1.8 * big, 'rgba(255,255,255,.8)');
      if (branch === 'warlock') for (let i = 0; i < 3; i++) { const a = anim * 3 + i * 2.1; line(c, Math.cos(a) * 8, oy + Math.sin(a) * 8, Math.cos(a + 0.5) * 12, oy + Math.sin(a + 0.5) * 12, '#aef', 1); }
      break;
    }
    case 'bombard': {
      const acc = branch === 'firebomber' ? '#d8582c' : branch === 'mortar' ? '#5a6472' : '#8a5a3a';
      rrect(c, -17, -14, 34, 24, 6, lgrad(c, 0, -14, 0, 10, [[0, '#a9a091'], [1, '#776d60']]), OUT);
      for (let i = 0; i < 4; i++) rrect(c, -16 + i * 9, -19, 6, 6, 1, '#a9a091', OUT, 1.1);
      rrect(c, -17, -4, 34, 4, 1, acc, OUT, 1);
      if (branch === 'mortar') {
        ell(c, 0, -12, 11, 5, '#2b2f36', OUT); ell(c, 0, -13, 8, 3.5, '#0f1114');
        rrect(c, -8, -26, 16, 14, 3, lgrad(c, -8, 0, 8, 0, [[0, '#6c7480'], [1, '#3b414b']]), OUT); ell(c, 0, -26, 8, 3, '#111', OUT, 1);
      } else {
        const rec = firing ? -3 : 0;
        c.save(); c.translate(0, -10); c.rotate(t.angle || 0);
        rrect(c, -4 + rec, -5, 22, 10, 4, lgrad(c, 0, -5, 0, 5, [[0, '#59606b'], [1, '#262a31']]), OUT);
        rrect(c, 15 + rec, -6, 5, 12, 2, '#3a3f48', OUT, 1);
        c.restore();
        circ(c, 0, -10, 6, '#4b4f57', OUT, 1.2);
      }
      if (branch === 'firebomber') { const f = Math.sin(anim * 9) * 1.5; poly(c, [[-4, -20], [0, -30 - f], [4, -20]], '#ffb347'); poly(c, [[-2, -20], [0, -26 - f], [2, -20]], '#fff2a0'); }
      if (tier >= 3) { line(c, -14, -19, -14, -32, OUT, 1.2); poly(c, [[-14, -32], [-4, -29], [-14, -26]], '#e8b54a', OUT, 0.8); }
      break;
    }
    case 'frost': {
      const ic = branch === 'glacier' ? ['#e6f6ff', '#4aa3e6', '#2a6fb0'] : branch === 'blizzard' ? ['#ffffff', '#9fd8ff', '#5aa0d0'] : ['#f2fbff', '#8fd3ff', '#4c9cd6'];
      ell(c, 0, 4, 16, 7, '#8a96a3', OUT); ell(c, 0, 2, 14, 5.5, '#aab6c2');
      const crystal = (cx, h, w, lean) => { poly(c, [[cx - w, 2], [cx - w * 0.6 + lean, -h * 0.75], [cx + lean, -h], [cx + w * 0.6 + lean, -h * 0.75], [cx + w, 2]], lgrad(c, cx - w, 0, cx + w, 0, [[0, ic[0]], [0.5, ic[1]], [1, ic[2]]]), OUT, 1.2); line(c, cx + lean * 0.3, -h * 0.9, cx - w * 0.2, -2, 'rgba(255,255,255,.7)', 1); };
      crystal(-9, 18 + tier * 2, 4, -3); crystal(9, 16 + tier * 2, 4, 3);
      crystal(0, 34 + tier * 4, 7, 0);
      if (tier >= 3) crystal(-4, 22, 3, -6);
      const glint = (Math.sin(anim * 1.7) + 1) / 2;
      circ(c, 1, -26 - tier * 3, 1.5 + glint * 1.5, `rgba(255,255,255,${0.4 + glint * 0.6})`);
      if (branch === 'blizzard') for (let i = 0; i < 8; i++) { const a = anim * 1.8 + i * TAU / 8, r = 20 + Math.sin(anim * 3 + i) * 4; circ(c, Math.cos(a) * r, -12 + Math.sin(a) * r * 0.45, 1.4, 'rgba(255,255,255,.85)'); }
      break;
    }
    case 'barracks': {
      const ban = branch === 'knights' ? '#3c62a8' : branch === 'rangers' ? '#3f8a3a' : '#b5452f';
      rrect(c, -16, -14, 32, 24, 2, lgrad(c, 0, -14, 0, 10, [[0, '#a37a52'], [1, '#7a5636']]), OUT);
      for (let i = -12; i <= 12; i += 6) line(c, i, -13, i, 9, 'rgba(0,0,0,.18)', 0.8);
      rrect(c, -5, -4, 10, 14, [5, 5, 0, 0], '#3a2618', OUT, 1);
      const roof = branch === 'knights' ? ['#9aa6b4', '#6b7787'] : ['#c9a35a', '#9c7a3c'];
      poly(c, [[-20, -14], [20, -14], [12, -30], [-12, -30]], lgrad(c, 0, -30, 0, -14, [[0, roof[0]], [1, roof[1]]]), OUT);
      for (let i = -14; i <= 14; i += 5) line(c, i * 0.8, -29, i, -15, 'rgba(0,0,0,.15)', 0.8);
      line(c, 14, -14, 14, -46, OUT, 1.6);
      const wave = Math.sin(anim * 4) * 2;
      poly(c, [[14, -46], [28, -43 + wave], [14, -37]], ban, OUT, 1);
      if (tier >= 3) circ(c, 14, -47, 2, '#e8b54a', OUT, 0.8);
      if (tier >= 2) { rrect(c, -14, -9, 6, 5, 1, '#ffd36a'); }
      break;
    }
    case 'ballista': {
      const wood = branch === 'dragonbane' ? ['#8a3a2a', '#5a2018'] : branch === 'repeater' ? ['#a88a3a', '#6e5a22'] : ['#9a6a40', '#6b4628'];
      rrect(c, -16, -6, 32, 14, 3, lgrad(c, 0, -6, 0, 8, [[0, '#a9a091'], [1, '#776d60']]), OUT);
      rrect(c, -10, -14, 20, 10, 2, wood[1], OUT, 1.2);
      c.save(); c.translate(0, -14); c.rotate(t.angle || 0);
      rrect(c, -10, -3, 28, 6, 2, lgrad(c, 0, -3, 0, 3, [[0, wood[0]], [1, wood[1]]]), OUT, 1.2);
      c.beginPath(); c.moveTo(6, -16); c.quadraticCurveTo(14, 0, 6, 16); c.strokeStyle = OUT; c.lineWidth = 4; c.stroke(); c.strokeStyle = wood[0]; c.lineWidth = 2.4; c.stroke();
      line(c, 6, -16, firing ? 2 : -6, 0, '#eee', 0.8); line(c, 6, 16, firing ? 2 : -6, 0, '#eee', 0.8);
      if (!firing) { line(c, -6, 0, 22, 0, '#d8c08a', 2); poly(c, [[22, -3], [28, 0], [22, 3]], '#c0c6cc', OUT, 0.8); }
      if (branch === 'repeater') rrect(c, -8, -8, 10, 5, 1, '#c9a35a', OUT, 1);
      if (branch === 'dragonbane') { poly(c, [[-10, -3], [-16, -8], [-12, 0]], '#c43b3b', OUT, 1); poly(c, [[-10, 3], [-16, 8], [-12, 0]], '#c43b3b', OUT, 1); }
      c.restore();
      if (tier >= 3) { line(c, -14, -6, -14, -20, OUT, 1.2); poly(c, [[-14, -20], [-5, -17], [-14, -14]], '#e8b54a', OUT, 0.8); }
      break;
    }
  }
  // tier pips
  if (!opts.noPips) for (let i = 0; i < Math.min(tier, 3); i++) circ(c, -6 + i * 6, 15, 1.8, tier >= 4 ? '#ffd86b' : '#f3ead7', OUT, 0.8);
  if (tier >= 4 && !opts.noPips) { poly(c, [[0, 12], [3, 15], [0, 18], [-3, 15]], '#ffd86b', OUT, 0.8); }
  c.restore();
}

// ---------- enemies ----------
export function drawEnemy(c, e, time) {
  const d = e.def || ENEMIES[e.type], type = e.type;
  const face = Math.cos(e.a || 0) < -0.1 ? -1 : 1;
  const bob = Math.abs(Math.sin((e.walk || 0) * 1.2)) * 1.6;
  const fly = d.flying ? 16 + Math.sin((e.walk || 0) * 0.8) * 2 : 0;
  const frozen = e.frozen;
  shadow(c, e.x, e.y + 2, d.size * (d.flying ? 0.6 : 0.85), d.size * 0.3, d.flying ? 0.18 : 0.28);
  c.save(); c.translate(e.x, e.y - fly - (frozen ? 0 : bob)); c.scale(face, 1);
  const k = d.size / 12;
  switch (type) {
    case 'goblin': {
      ell(c, 0, -6, 6, 7, '#6fae3c', OUT, 1.2);
      rrect(c, -4, -7, 8, 6, 2, '#7a5636');
      ell(c, 0, -15, 6, 5.5, '#7fc048', OUT, 1.2);
      poly(c, [[-5, -16], [-13, -19], [-5, -13]], '#7fc048', OUT, 1); poly(c, [[5, -16], [12, -21], [5, -13]], '#7fc048', OUT, 1);
      circ(c, 2.5, -16, 1.4, '#ffe14d'); circ(c, 2.8, -16, 0.6, '#000');
      line(c, 5, -6, 11, -11, '#c9ced6', 1.6);
      break;
    }
    case 'orc': {
      ell(c, 0, -8, 8.5, 9, '#4f7a34', OUT, 1.3);
      rrect(c, -7, -10, 14, 8, 2, '#6b4628');
      line(c, -7, -14, 7, -4, '#3a2618', 1.5);
      ell(c, 1, -20, 7, 6.5, '#5f8e3c', OUT, 1.3);
      circ(c, 4, -21, 1.2, '#ff5a3a');
      poly(c, [[5, -16], [6, -13], [7, -16]], '#fff', OUT, 0.6);
      // axe
      line(c, 7, -4, 13, -18, '#6b4628', 2);
      poly(c, [[11, -20], [17, -22], [16, -14]], '#c9ced6', OUT, 1);
      break;
    }
    case 'brute': {
      ell(c, 0, -10, 11, 11, '#7b8693', OUT, 1.5);
      for (let i = 0; i < 3; i++) line(c, -9, -14 + i * 5, 9, -14 + i * 5, 'rgba(0,0,0,.25)', 1);
      rrect(c, -9, -30, 18, 13, [8, 8, 3, 3], lgrad(c, -9, 0, 9, 0, [[0, '#b5bdc6'], [1, '#6b7580']]), OUT, 1.4);
      line(c, -2, -24, 8, -24, '#1a1a1a', 2);
      poly(c, [[0, -30], [3, -36], [5, -30]], '#c9a35a', OUT, 0.8);
      // shield
      rrect(c, 6, -18, 9, 14, 3, '#5a646f', OUT, 1.3); circ(c, 10.5, -11, 1.8, '#c9a35a');
      break;
    }
    case 'wraith': {
      const fl = Math.sin((e.walk || 0) * 0.9) * 2, t2 = (e.walk || 0) * 2;
      c.globalAlpha = 0.85;
      c.beginPath(); c.moveTo(-8, -6); c.quadraticCurveTo(-9, -26, 0, -28); c.quadraticCurveTo(9, -26, 8, -6);
      for (let i = 0; i <= 4; i++) c.lineTo(8 - i * 4, -2 + (i % 2 ? -4 : 0) + Math.sin(t2 + i) * 1.5);
      c.closePath(); c.fillStyle = lgrad(c, 0, -28, 0, 0, [[0, '#8b6fc9'], [1, 'rgba(70,40,120,.3)']]); c.fill(); c.lineWidth = 1.2; c.strokeStyle = 'rgba(28,19,40,.8)'; c.stroke();
      c.globalAlpha = 1;
      ell(c, 1, -19, 5, 5, '#1d1230');
      circ(c, 3, -20 + fl * 0.2, 1.5, '#9dfcff'); circ(c, -0.5, -20 + fl * 0.2, 1.2, '#9dfcff');
      break;
    }
    case 'bat': {
      const flap = Math.sin((e.walk || 0) * 3.2);
      for (const sx of [-1, 1]) {
        c.beginPath(); c.moveTo(0, -4); c.quadraticCurveTo(sx * 8, -10 - flap * 6, sx * 15, -4 - flap * 8); c.quadraticCurveTo(sx * 10, -2, sx * 9, 0); c.quadraticCurveTo(sx * 5, -2, 0, -1);
        c.fillStyle = '#4a2f5e'; c.fill(); c.lineWidth = 1.1; c.strokeStyle = OUT; c.stroke();
      }
      ell(c, 0, -3, 4.5, 5, '#5c3a74', OUT, 1.1);
      poly(c, [[-3, -6], [-2, -11], [0, -7]], '#5c3a74', OUT, 0.8); poly(c, [[3, -6], [2, -11], [0, -7]], '#5c3a74', OUT, 0.8);
      circ(c, 1.8, -4, 1, '#ff4a4a'); circ(c, -1, -4, 0.9, '#ff4a4a');
      break;
    }
    case 'shaman': {
      ell(c, 0, -8, 7.5, 8.5, '#3f6a3a', OUT, 1.3);
      rrect(c, -7, -9, 14, 10, 3, '#7a3f8a');
      ell(c, 1, -19, 6.5, 6, '#5f8e3c', OUT, 1.2);
      circ(c, 3.5, -20, 1.2, '#ffe14d');
      for (let i = 0; i < 4; i++) poly(c, [[-5 + i * 3, -23], [-6 + i * 3.4, -32 - (i % 2) * 3], [-3 + i * 3, -23]], ['#e84a4a', '#f6d14b', '#4ac2e8', '#e84a4a'][i], OUT, 0.7);
      line(c, 9, 0, 9, -26, '#6b4628', 1.8);
      const g = (Math.sin((e.walk || 0) * 1.5) + 1) / 2;
      circ(c, 9, -28, 3.2 + g, '#7dff8a', OUT, 1); c.fillStyle = rgrad(c, 9, -28, 0, 10, [[0, 'rgba(125,255,138,.5)'], [1, 'rgba(125,255,138,0)']]); c.fillRect(-1, -38, 20, 20);
      break;
    }
    case 'ogre': {
      c.scale(1.05, 1.05);
      ell(c, 0, -16, 17, 17, '#8a6a5a', OUT, 1.8);
      ell(c, 0, -12, 11, 10, '#a3826e');
      rrect(c, -15, -16, 30, 9, 3, '#4a2f2a', OUT, 1.2);
      circ(c, 0, -12, 3, '#c9a35a', OUT, 1);
      ell(c, 2, -37, 11, 9.5, '#957362', OUT, 1.6);
      poly(c, [[-9, -42], [-15, -54], [-4, -45]], '#ece0c8', OUT, 1.1); poly(c, [[11, -42], [17, -54], [6, -45]], '#ece0c8', OUT, 1.1);
      rrect(c, -7, -48, 18, 6, 2, '#c9a35a', OUT, 1.1);
      for (let i = 0; i < 3; i++) poly(c, [[-5 + i * 6, -48], [-2 + i * 6, -54], [1 + i * 6, -48]], '#e8b54a', OUT, 0.8);
      circ(c, 6, -38, 1.8, '#ff3a2a'); circ(c, 0, -38, 1.6, '#ff3a2a');
      poly(c, [[3, -32], [5, -28], [7, -32]], '#fff', OUT, 0.7); poly(c, [[-2, -32], [0, -28], [2, -32]], '#fff', OUT, 0.7);
      // club
      c.save(); c.translate(15, -18); c.rotate(-0.6 + Math.sin((e.walk || 0) * 0.6) * 0.25);
      rrect(c, -3, -26, 7, 28, 3, '#6b4628', OUT, 1.4); ell(c, 0.5, -26, 7, 6, '#7b5132', OUT, 1.4);
      circ(c, -3, -28, 1.4, '#c9ced6'); circ(c, 4, -24, 1.4, '#c9ced6');
      c.restore();
      break;
    }
  }
  c.restore();
  // status overlays
  const top = e.y - fly - d.size * (d.boss ? 2.9 : 2.2) - 4;
  if (e.frozen) { rrect(c, e.x - d.size * 0.9, e.y - fly - d.size * 2.1, d.size * 1.8, d.size * 2.2, 3, 'rgba(180,230,255,.55)', 'rgba(255,255,255,.9)', 1); }
  else if (e.slowed) { ell(c, e.x, e.y + 1, d.size * 0.9, d.size * 0.35, 'rgba(140,210,255,.55)'); }
  if (e.burning) { const f = Math.sin(time * 20 + e.id) * 1.5; poly(c, [[e.x - 4, e.y - fly - 6], [e.x, e.y - fly - 16 - f], [e.x + 4, e.y - fly - 6]], 'rgba(255,140,40,.9)'); poly(c, [[e.x - 2, e.y - fly - 6], [e.x, e.y - fly - 11 - f], [e.x + 2, e.y - fly - 6]], 'rgba(255,240,150,.95)'); }
  if (e.flash > 0) { ell(c, e.x, e.y - fly - d.size, d.size * 0.9, d.size * 1.1, 'rgba(255,255,255,.55)'); }
  if (e.hp < e.maxHp) {
    const w = d.boss ? 40 : Math.max(16, d.size * 1.7), p = Math.max(0, e.hp / e.maxHp);
    rrect(c, e.x - w / 2 - 1, top - 1, w + 2, 5, 2, 'rgba(15,10,8,.85)');
    rrect(c, e.x - w / 2, top, w * p, 3, 1.5, p > 0.5 ? '#6fdc4a' : p > 0.25 ? '#f2c443' : '#ef5040');
  }
}

export function drawSoldier(c, so, branch, time) {
  if (so.dead) return;
  const knight = branch === 'knights', ranger = branch === 'rangers';
  const bob = so.moving ? Math.abs(Math.sin(so.anim * 10)) * 1.4 : 0;
  shadow(c, so.x, so.y + 2, 6, 2.4);
  c.save(); c.translate(so.x, so.y - bob);
  const face = so.target && so.target.x < so.x ? -1 : 1; c.scale(face, 1);
  ell(c, 0, -5, 4.5, 5.5, knight ? '#9aa6b4' : ranger ? '#3f8a3a' : '#3c62a8', OUT, 1.1);
  circ(c, 0, -12, 3.6, '#f0c8a0', OUT, 1);
  if (knight) { rrect(c, -4, -17, 8, 6, [4, 4, 1, 1], '#c0c8d2', OUT, 1); line(c, 0, -17, 0, -20, '#c43b3b', 1.6); }
  else if (ranger) poly(c, [[-4.5, -12], [4.5, -12], [0, -19]], '#2d6a2a', OUT, 0.9);
  else rrect(c, -4, -16.5, 8, 4.5, [4, 4, 0, 0], '#9aa6b4', OUT, 1);
  const sw = so.swing > 0 ? -1.2 : 0;
  c.save(); c.translate(4, -6); c.rotate(-0.6 + sw); line(c, 0, 0, 0, -10, '#d8dde3', 1.6); line(c, -2, -1, 2, -1, '#7b5132', 1.4); c.restore();
  if (knight) { rrect(c, -7, -9, 5, 8, 2, '#3c62a8', OUT, 1); }
  c.restore();
  if (so.hp < so.maxHp) { rrect(c, so.x - 7, so.y - 24, 14, 3, 1.5, 'rgba(15,10,8,.85)'); rrect(c, so.x - 6.5, so.y - 23.5, 13 * Math.max(0, so.hp / so.maxHp), 2, 1, '#6fdc4a'); }
  if (so.flash > 0) circ(c, so.x, so.y - 8, 6, 'rgba(255,80,60,.35)');
}

// ---------- projectiles ----------
export function drawProjectile(c, p, time) {
  switch (p.kind) {
    case 'arrow': { c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); const L = p.small ? 7 : 10; line(c, -L, 0, 0, 0, '#7b5132', 1.4); poly(c, [[0, -1.8], [3.5, 0], [0, 1.8]], '#dfe3e8'); line(c, -L, 0, -L + 2.5, -2, '#f3ead7', 1); line(c, -L, 0, -L + 2.5, 2, '#f3ead7', 1); c.restore(); break; }
    case 'orb': case 'bigorb': { const r = p.kind === 'bigorb' ? 6 : 4; c.fillStyle = rgrad(c, p.x, p.y, 0, r * 3, [[0, 'rgba(200,150,255,.7)'], [1, 'rgba(200,150,255,0)']]); c.fillRect(p.x - r * 3, p.y - r * 3, r * 6, r * 6); circ(c, p.x, p.y, r, rgrad(c, p.x - 1, p.y - 1, 0, r, [[0, '#ffffff'], [1, '#b07bff']])); break; }
    case 'shell': { shadow(c, p.x, p.y, 4, 1.6, 0.25); circ(c, p.x, p.y - (p.h || 0), p.big ? 5 : 4, p.burn ? '#5a2a18' : '#25282d', OUT, 1); circ(c, p.x - 1.2, p.y - (p.h || 0) - 1.2, 1.2, 'rgba(255,255,255,.5)'); if (p.burn) circ(c, p.x, p.y - (p.h || 0), 6, 'rgba(255,140,40,.35)'); break; }
    case 'shard': { c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); poly(c, [[-6, 0], [0, -2.6], [5, 0], [0, 2.6]], '#c8ecff', '#4c9cd6', 0.9); c.restore(); circ(c, p.x, p.y, 5, 'rgba(160,220,255,.25)'); break; }
    case 'bolt': { c.save(); c.translate(p.x, p.y); c.rotate(p.ang || 0); line(c, -16, 0, 4, 0, '#8a6038', 2.4); poly(c, [[4, -3.2], [10, 0], [4, 3.2]], '#c0c6cc', OUT, 0.8); line(c, -16, 0, -12, -3, '#c43b3b', 1.4); line(c, -16, 0, -12, 3, '#c43b3b', 1.4); c.restore(); line(c, p.x - Math.cos(p.ang) * 30, p.y - Math.sin(p.ang) * 30, p.x - Math.cos(p.ang) * 14, p.y - Math.sin(p.ang) * 14, 'rgba(255,255,255,.25)', 2); break; }
  }
}

// ---------- particles ----------
export class Particles {
  constructor() { this.list = []; this.chains = []; this.rng = mulberry32(7); }
  add(p) { if (this.list.length < 500) this.list.push(p); }
  burst(x, y, n, opts) {
    const r = this.rng;
    for (let i = 0; i < n; i++) {
      const a = r() * TAU, sp = (opts.speed || 60) * (0.4 + r() * 0.8);
      this.add({ x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp * (opts.flat || 0.7) - (opts.up || 0), g: opts.g ?? 120, life: 0, max: (opts.life || 0.5) * (0.6 + r() * 0.7), size: (opts.size || 2) * (0.6 + r() * 0.8), color: opts.colors[Math.floor(r() * opts.colors.length)], kind: opts.kind || 'dot' });
    }
  }
  event(ev) {
    switch (ev.t) {
      case 'boom':
        this.add({ x: ev.x, y: ev.y, life: 0, max: 0.35, kind: 'ring', r: ev.r, color: ev.fire ? '255,140,40' : '255,220,150' });
        this.burst(ev.x, ev.y - 4, ev.big ? 22 : 14, { colors: ev.fire ? ['#ff8a2a', '#ffd34a', '#ff4a2a'] : ['#ffd27a', '#ff9a3a', '#fff2c0'], speed: ev.big ? 120 : 90, up: 30, life: 0.5, size: 2.4 });
        this.burst(ev.x, ev.y - 6, ev.big ? 9 : 6, { colors: ['rgba(90,80,70,.55)', 'rgba(130,120,110,.5)'], speed: 30, up: 20, g: -20, life: 0.9, size: 7, kind: 'smoke' });
        break;
      case 'death':
        this.burst(ev.x, ev.y - (ev.flying ? 16 : 6), ev.boss ? 30 : 8, { colors: ['rgba(80,70,70,.6)', 'rgba(140,130,130,.5)'], speed: ev.boss ? 60 : 35, up: 10, g: -15, life: 0.6, size: ev.boss ? 9 : 5, kind: 'smoke' });
        this.add({ x: ev.x, y: ev.y - 10, vx: 0, vy: -34, g: 0, life: 0, max: 0.8, kind: 'coin', size: 3.2 });
        break;
      case 'hit': {
        const col = ev.kind === 'shard' ? ['#c8ecff', '#ffffff'] : ev.kind === 'orb' || ev.kind === 'bigorb' ? ['#d9b8ff', '#ffffff'] : ['#ffe7b0', '#ffffff'];
        this.burst(ev.x, ev.y, ev.crit ? 9 : 4, { colors: col, speed: ev.crit ? 80 : 50, life: 0.25, size: 1.6, g: 0 });
        if (ev.crit) this.add({ x: ev.x, y: ev.y - 12, vx: 0, vy: -30, g: 0, life: 0, max: 0.7, kind: 'text', text: 'CRIT', color: '#ffd86b' });
        break;
      }
      case 'freeze':
        this.add({ x: ev.x, y: ev.y - 6, life: 0, max: 0.4, kind: 'ring', r: 18, color: '170,225,255' });
        this.burst(ev.x, ev.y - 8, 8, { colors: ['#ffffff', '#bfe6ff'], speed: 40, life: 0.6, size: 1.8, g: 20, kind: 'flake' }); break;
      case 'heal':
        this.add({ x: ev.x, y: ev.y - 6, life: 0, max: 0.6, kind: 'ring', r: ev.r * 0.8, color: '125,255,138' });
        for (let i = 0; i < 4; i++) this.add({ x: ev.x + (this.rng() - 0.5) * 30, y: ev.y - 10 - this.rng() * 10, vx: 0, vy: -26, g: 0, life: 0, max: 0.8, kind: 'plus', size: 3, color: '#7dff8a' });
        break;
      case 'build': case 'upgrade':
        this.add({ x: ev.x, y: ev.y + 4, life: 0, max: 0.45, kind: 'ring', r: 26, color: ev.t === 'build' ? '230,215,180' : '255,216,107' });
        this.burst(ev.x, ev.y - 10, ev.t === 'build' ? 10 : 16, { colors: ev.t === 'build' ? ['rgba(180,160,130,.6)'] : ['#ffd86b', '#fff3c4'], speed: 50, up: ev.t === 'build' ? 0 : 40, g: ev.t === 'build' ? 0 : -30, life: 0.6, size: ev.t === 'build' ? 4 : 1.8, kind: ev.t === 'build' ? 'smoke' : 'dot' });
        break;
      case 'sell':
        this.burst(ev.x, ev.y - 8, 12, { colors: ['rgba(160,140,110,.6)'], speed: 50, life: 0.6, size: 5, g: 0, kind: 'smoke' });
        this.add({ x: ev.x, y: ev.y - 20, vx: 0, vy: -30, g: 0, life: 0, max: 0.9, kind: 'text', text: '+' + ev.gold, color: '#ffd86b' }); break;
      case 'chain': this.chains.push({ pts: ev.pts, life: 0, max: 0.2, seed: this.rng() * 1000 }); break;
      case 'clash': if (this.rng() < 0.4) this.burst(ev.x, ev.y - 8, 3, { colors: ['#ffffff', '#ffe7b0'], speed: 50, life: 0.15, size: 1.3, g: 0 }); break;
      case 'soldierDown': this.burst(ev.x, ev.y - 6, 6, { colors: ['rgba(120,110,110,.6)'], speed: 30, life: 0.5, size: 4, g: -10, kind: 'smoke' }); break;
    }
  }
  update(dt) {
    for (const p of this.list) { p.life += dt; if (p.vx !== undefined) { p.vy += (p.g || 0) * dt; p.x += p.vx * dt; p.y += p.vy * dt; } }
    this.list = this.list.filter(p => p.life < p.max);
    for (const ch of this.chains) ch.life += dt;
    this.chains = this.chains.filter(ch => ch.life < ch.max);
  }
  draw(c) {
    for (const ch of this.chains) {
      const a = 1 - ch.life / ch.max, r = mulberry32(Math.floor(ch.seed + ch.life * 40));
      for (const [w, col] of [[4, `rgba(120,240,255,${0.35 * a})`], [1.6, `rgba(240,255,255,${a})`]]) {
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
        case 'smoke': c.globalAlpha = a; circ(c, p.x, p.y, p.size * (0.6 + k * 0.8), p.color); c.globalAlpha = 1; break;
        case 'coin': c.globalAlpha = Math.min(1, a * 2); circ(c, p.x, p.y, p.size, '#f2c443', '#8a5a14', 1); circ(c, p.x - 0.8, p.y - 0.8, p.size * 0.35, '#fff6c0'); c.globalAlpha = 1; break;
        case 'text': c.globalAlpha = Math.min(1, a * 2); c.font = '800 10px -apple-system, system-ui, sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = 'rgba(20,12,6,.85)'; c.strokeText(p.text, p.x, p.y); c.fillStyle = p.color; c.fillText(p.text, p.x, p.y); c.globalAlpha = 1; break;
        case 'plus': c.globalAlpha = a; line(c, p.x - p.size, p.y, p.x + p.size, p.y, p.color, 1.8); line(c, p.x, p.y - p.size, p.x, p.y + p.size, p.color, 1.8); c.globalAlpha = 1; break;
        case 'flake': c.globalAlpha = a; line(c, p.x - p.size, p.y, p.x + p.size, p.y, p.color, 1); line(c, p.x, p.y - p.size, p.x, p.y + p.size, p.color, 1); c.globalAlpha = 1; break;
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
    this.particles = new Particles(); this.time = 0;
  }
  resize(cssW, cssH, rect) {
    this.dpr = Math.min(3, window.devicePixelRatio || 1);
    this.cssW = cssW; this.cssH = cssH;
    this.cv.width = Math.round(cssW * this.dpr); this.cv.height = Math.round(cssH * this.dpr);
    this.cv.style.width = cssW + 'px'; this.cv.style.height = cssH + 'px';
    const s = Math.min(rect.w / WORLD.w, rect.h / WORLD.h);
    this.view = { s, ox: rect.x + (rect.w - WORLD.w * s) / 2, oy: rect.y + (rect.h - WORLD.h * s) / 2 };
    if (this.map) this._buildBg();
  }
  setMap(map) { this.map = map; this.particles = new Particles(); this._buildBg(); }
  _buildBg() {
    const { s } = this.view, k = s * this.dpr;
    const cv = document.createElement('canvas');
    cv.width = Math.ceil((WORLD.w + 2 * M) * k); cv.height = Math.ceil((WORLD.h + 2 * M) * k);
    const c = cv.getContext('2d'); c.setTransform(k, 0, 0, k, M * k, M * k);
    drawBackground(c, this.map);
    this.bg = cv;
  }
  toWorld(cx, cy) { const v = this.view; return { x: (cx - v.ox) / v.s, y: (cy - v.oy) / v.s }; }
  toScreen(wx, wy) { const v = this.view; return { x: v.ox + wx * v.s, y: v.oy + wy * v.s }; }

  draw(game, ui, dt) {
    const c = this.c, v = this.view, d = this.dpr; this.time += dt;
    this.particles.update(dt);
    c.setTransform(1, 0, 0, 1, 0, 0);
    const B = BIOMES[this.map.biome];
    c.fillStyle = B.ground[1]; c.fillRect(0, 0, this.cv.width, this.cv.height);
    if (this.bg) c.drawImage(this.bg, Math.round((v.ox - M * v.s) * d), Math.round((v.oy - M * v.s) * d));
    c.setTransform(v.s * d, 0, 0, v.s * d, v.ox * d, v.oy * d);
    if (!game) return;
    const t = this.time;
    // empty-spot hints
    game.map.spots.forEach(([x, y], i) => {
      if (game.towerAtSpot(i)) return;
      const sel = ui.spot === i, pulse = (Math.sin(t * 3 + i) + 1) / 2;
      ell(c, x, y, 19, 8.5, sel ? 'rgba(255,216,107,.35)' : `rgba(255,240,200,${0.06 + pulse * 0.08})`, sel ? '#ffd86b' : null, 1.6);
      if (!sel) { c.globalAlpha = 0.55 + pulse * 0.3; line(c, x - 4, y - 1, x + 4, y - 1, '#fff7dc', 1.6); line(c, x, y - 4.5, x, y + 2.5, '#fff7dc', 1.6); c.globalAlpha = 1; }
    });
    // range preview
    const rangeAt = (x, y, r, col = '255,216,107') => { c.beginPath(); c.arc(x, y, r, 0, TAU); c.fillStyle = `rgba(${col},.10)`; c.fill(); c.setLineDash([6, 5]); c.strokeStyle = `rgba(${col},.75)`; c.lineWidth = 1.4; c.stroke(); c.setLineDash([]); };
    if (ui.preview) rangeAt(ui.preview.x, ui.preview.y, ui.preview.range, ui.preview.cant ? '255,110,90' : '255,216,107');
    if (ui.tower) { rangeAt(ui.tower.x, ui.tower.y, ui.tower.stats.range); if (ui.tower.rally) { ell(c, ui.tower.rally.x, ui.tower.rally.y, 12, 5, null, 'rgba(255,255,255,.8)', 1.2); } }
    // sort ground entities by y
    const items = [];
    for (const tw of game.towers) items.push({ y: tw.y, f: () => drawTower(c, tw, t) });
    for (const e of game.enemies) {
      e.frozen = game.time < e.frozenUntil; e.slowed = game.time < e.slowUntil; e.burning = game.time < e.burnUntil;
      if (!e.flying) items.push({ y: e.y, f: () => drawEnemy(c, e, t) });
    }
    for (const tw of game.towers) if (tw.soldiers) for (const so of tw.soldiers) items.push({ y: so.y, f: () => drawSoldier(c, so, tw.branch, t) });
    items.sort((a, b) => a.y - b.y); for (const it of items) it.f();
    if (ui.tower) { ell(c, ui.tower.x, ui.tower.y + 6, 22, 9, null, '#ffd86b', 2); }
    for (const p of game.projectiles) drawProjectile(c, p, t);
    for (const e of game.enemies) if (e.flying) drawEnemy(c, e, t);
    this.particles.draw(c);
    // boss bar drawn by UI
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
    const sc = px / 80; c.setTransform(sc, 0, 0, sc, px / 2, px * 0.7);
    const t = { x: 0, y: 0, type, tier: opts.tier || 3, branch: opts.branch || null, angle: -0.5, anim: 0.6, soldiers: [] };
    drawTower(c, t, 0, { noPips: true });
  } else if (kind === 'enemy') {
    const d = ENEMIES[type]; const sc = px / (d.boss ? 78 : 44); c.setTransform(sc, 0, 0, sc, px / 2, px * (d.flying ? 0.95 : 0.84));
    drawEnemy(c, { type, def: d, x: 0, y: 0, a: 0, walk: 1.3, hp: 1, maxHp: 1, id: 1 }, 0);
  }
  const url = cv.toDataURL('image/png'); iconCache.set(key, url); return url;
}

// ---------- campaign world map ----------
export const WORLD_NODES = [[0.28, 0.88], [0.70, 0.75], [0.32, 0.60], [0.68, 0.46], [0.30, 0.29], [0.66, 0.13]];
export const WORLD_BANDS = [{ biome: 'frostpeak', y0: 0, y1: 0.37 }, { biome: 'darkwood', y0: 0.37, y1: 0.67 }, { biome: 'meadow', y0: 0.67, y1: 1 }];
export function drawWorldMap(c, w, h) {
  const rng = mulberry32(4242), s = Math.min(1.2, w / 380);
  const g = c.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, '#e4eef5'); g.addColorStop(0.3, '#b8cddc'); g.addColorStop(0.37, '#5b7464'); g.addColorStop(0.42, '#34503a');
  g.addColorStop(0.62, '#2d4630'); g.addColorStop(0.69, '#5f8f3e'); g.addColorStop(1, '#7aa94c');
  c.fillStyle = g; c.fillRect(0, 0, w, h);
  for (let i = 0; i < 400; i++) { const x = rng() * w, y = rng() * h; circ(c, x, y, 0.6 + rng(), y < h * 0.37 ? 'rgba(255,255,255,.6)' : 'rgba(0,0,0,.12)'); }
  const pts = WORLD_NODES.map(([x, y]) => [x * w, y * h]);
  const full = [[pts[0][0] - 40 * s, h + 20], ...pts];
  const trail = (lw, col, dash) => {
    c.beginPath(); c.moveTo(full[0][0], full[0][1]);
    for (let i = 1; i < full.length; i++) { const [px, py] = full[i - 1], [x, y] = full[i]; const mx = (px + x) / 2, my = (py + y) / 2; c.quadraticCurveTo(px + (mx - px) * 0.2 + (x > px ? 30 : -30) * s, my + 30 * s, x, y); }
    c.lineWidth = lw; c.strokeStyle = col; c.lineCap = 'round'; c.lineJoin = 'round'; c.setLineDash(dash || []); c.stroke(); c.setLineDash([]);
  };
  trail(22 * s, 'rgba(0,0,0,.18)'); trail(16 * s, '#b49572'); trail(3 * s, 'rgba(255,240,210,.6)', [6 * s, 9 * s]);
  const decos = [];
  for (let k = 0; k < 600 && decos.length < 46; k++) {
    const x = rng() * w, y = 10 + rng() * (h - 10);
    if (pts.some(([px, py]) => Math.hypot(px - x, py - y) < 52 * s)) continue;
    let near = false; for (let i = 1; i < full.length; i++) { if (segDist(x, y, full[i - 1][0], full[i - 1][1], full[i][0], full[i][1]) < 30 * s) near = true; } if (near) continue;
    if (decos.some(d => Math.hypot(d.x - x, d.y - y) < 26 * s)) continue;
    decos.push({ x, y, r: rng() });
  }
  decos.sort((a, b) => a.y - b.y);
  for (const d of decos) {
    const yy = d.y / h;
    if (yy < 0.37) { if (d.r < 0.6) pine(c, d.x, d.y, 0.85 * s, false, true); else rock(c, d.x, d.y, 0.9 * s, '#8fa2b4', '#e8f2fa'); }
    else if (yy < 0.67) { if (d.r < 0.7) pine(c, d.x, d.y, 0.9 * s, true, false); else mushroom(c, d.x, d.y, 1.1 * s); }
    else { if (d.r < 0.6) tree(c, d.x, d.y, 0.8 * s, d.r); else bush(c, d.x, d.y, 0.9 * s, '#5f9a3a'); }
  }
}
