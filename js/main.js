// Holdfast — app controller: game loop, game screen (HUD, build menu, tower panel), routing.
import { APP_VERSION, TICK, MAPS, TOWERS, TOWER_ORDER, ENEMIES } from './config.js';
import { Game, computeStats, TARGET_MODES } from './engine.js';
import { Renderer, iconURL } from './render.js';
import * as Save from './save.js';
import { sfx, unlock, setEnabled, suspend } from './audio.js';
import { getMods, levelInfo, towerUnlocked, starsFor, runXp, mapUnlocked } from './progress.js';
import { $, esc, ICON, toast, modal, closeModal, modalOpen, fmt } from './ui.js';
import { initScreens, renderScreen } from './screens.js';

const app = {
  version: APP_VERSION,
  save: Save.load(),
  game: null, screen: 'home', speed: 1, paused: false,
  ui: { spot: null, tower: null, preview: null, choice: null, sellArm: 0 },
  lastResult: null, mods: null,
};
window.__holdfast = app; // handy for debugging in Safari dev tools
setEnabled(app.save.settings.sound);

const cv = $('cv');
const renderer = new Renderer(cv);
app.renderer = renderer;

// ---------- layout ----------
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
document.body.appendChild(probe);
function safe() { const cs = getComputedStyle(probe); return { t: parseFloat(cs.paddingTop) || 0, b: parseFloat(cs.paddingBottom) || 0 }; }
function gameRect() {
  const s = safe(), W = window.innerWidth, H = window.innerHeight;
  const top = s.t + 6 + 46 + 4, bottom = s.b + 8 + 64 + 6;
  return { x: 0, y: top, w: W, h: Math.max(200, H - top - bottom) };
}
app.gameRect = gameRect;
let menuDirty = true;
function layout() {
  renderer.resize(window.innerWidth, window.innerHeight, gameRect());
  menuDirty = true;
  if (app.ui.spot != null) renderRadial();
}
window.addEventListener('resize', layout);
window.addEventListener('orientationchange', () => setTimeout(layout, 250));

// ---------- routing ----------
function menuMap() {
  const s = app.save; let idx = 0;
  for (let i = 0; i < MAPS.length; i++) if (mapUnlocked(s, i)) idx = i;
  return MAPS[idx];
}
function showScreen(name, params = {}) {
  app.screen = name;
  const inGame = name === 'game';
  $('hud').classList.toggle('hidden', !inGame);
  $('bar').classList.toggle('hidden', !inGame);
  if (!inGame) { closeAll(); $('boss').classList.add('hidden'); }
  if (inGame) { $('screen').innerHTML = ''; $('screen').className = ''; return; }
  if (name !== 'results' && (!renderer.map || renderer.map !== menuMap())) renderer.setMap(menuMap());
  menuDirty = true;
  renderScreen(name, params);
}
app.showScreen = showScreen;

// ---------- runs ----------
function startMap(mapId, { resume = false } = {}) {
  const map = MAPS.find(m => m.id === mapId);
  app.mods = getMods(app.save.skills);
  const snap = resume && app.save.run && app.save.run.mapId === mapId ? app.save.run : null;
  if (!resume) { app.save.run = null; Save.write(); }
  app.game = new Game({ map, mods: app.mods, snapshot: snap });
  app.paused = false; app.speed = 1; app.ending = false; acc = 0;
  $('bSpeed').textContent = '1×';
  renderer.setMap(map);
  hudCache = {};
  showScreen('game');
  if (snap) toast(`Resumed · Wave ${Math.min(snap.wave + 1, map.waves)}${snap.wave >= map.waves ? ' (Boss)' : ''}`);
  else toast(map.name);
}
app.startMap = startMap;

function endRun(won) {
  const g = app.game, map = g.map, s = app.save;
  const prev = s.maps[map.id] || { stars: 0, wins: 0, plays: 0, bestHearts: 0 };
  const stars = starsFor(won, g.hearts);
  const wavesCleared = won ? g.totalWaves : Math.max(0, g.waveIdx - 1);
  const xp = runXp({ mapId: map.id, won, wavesCleared, kills: g.kills, stars, prevStars: prev.stars });
  const before = levelInfo(s.xp);
  s.xp += xp.total;
  const after = levelInfo(s.xp);
  s.maps[map.id] = { stars: Math.max(prev.stars || 0, stars), wins: (prev.wins || 0) + (won ? 1 : 0), plays: (prev.plays || 0) + 1, bestHearts: Math.max(prev.bestHearts || 0, won ? g.hearts : 0) };
  s.stats.runs++; if (won) s.stats.wins++; s.stats.kills += g.kills;
  s.run = null; Save.write();
  const idx = MAPS.indexOf(map);
  const unlockedTowers = TOWER_ORDER.filter(t => TOWERS[t].unlock > before.level && TOWERS[t].unlock <= after.level);
  const unlockedMap = won && !prev.wins && MAPS[idx + 1] ? MAPS[idx + 1] : null;
  app.lastResult = { won, mapId: map.id, stars, hearts: g.hearts, kills: g.kills, wavesCleared, totalWaves: g.totalWaves, xp, beforeXp: s.xp - xp.total, afterXp: s.xp, before, after, unlockedTowers, unlockedMap, nextMap: won && MAPS[idx + 1] ? MAPS[idx + 1] : null };
  won ? sfx.win() : sfx.lose();
  app.game = null;
  showScreen('results');
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const g = app.game;
  if (g && app.screen === 'game') {
    if (!app.paused && g.state === 'running') {
      acc += dt * app.speed; let n = 0;
      while (acc >= TICK && n < 16) { g.step(TICK); acc -= TICK; n++; drainEvents(); if (g.state !== 'running') break; }
      if (n >= 16) acc = 0;
    }
    drainEvents();
    renderer.draw(g, app.ui, app.paused ? 0 : dt * app.speed);
    updateHud();
  } else if (menuDirty) { renderer.draw(null, {}, 0); menuDirty = false; }
  requestAnimationFrame(frame);
}

function drainEvents() {
  const g = app.game; if (!g || !g.events.length) return;
  const evs = g.events; g.events = [];
  for (const ev of evs) {
    renderer.particles.event(ev);
    switch (ev.t) {
      case 'shoot': ({ arrow: sfx.arrow, magic: sfx.magic, zap: sfx.zap, cannon: sfx.cannon, frost: sfx.frost, bolt: sfx.bolt }[ev.kind] || (() => {}))(); break;
      case 'boom': sfx.explosion(ev.big); break;
      case 'freeze': sfx.freeze(); break;
      case 'heal': sfx.heal(); break;
      case 'clash': sfx.clash(); break;
      case 'death': if (Math.random() < 0.5) sfx.coin(); break;
      case 'build': sfx.build(); break;
      case 'upgrade': sfx.upgrade(); break;
      case 'sell': sfx.sell(); break;
      case 'early': toast(`Called early · +${ev.gold} gold`, 1300); sfx.coin(); break;
      case 'boss': sfx.boss(); toast('The Ogre Warlord approaches!', 2200); break;
      case 'leak': {
        sfx.leak();
        const v = $('vignette'); v.classList.add('on'); setTimeout(() => v.classList.remove('on'), 60);
        const h = $('hHearts'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
        break;
      }
      case 'waveStart':
        app.save.run = ev.snapshot; Save.write();
        sfx.horn();
        break;
      case 'win': case 'lose':
        if (!app.ending) { app.ending = true; setTimeout(() => { if (app.game === g) endRun(ev.t === 'win'); }, 1100); }
        break;
    }
  }
}

// ---------- HUD ----------
let hudCache = {};
function setHtml(id, key, html) { if (hudCache[id] !== key) { hudCache[id] = key; $(id).innerHTML = html; } }
function updateHud() {
  const g = app.game;
  setHtml('hHearts', g.hearts, `${ICON.heart}<span>${g.hearts}</span>`);
  setHtml('hGold', g.gold, `${ICON.coin}<span>${fmt(g.gold)}</span>`);
  const waveTxt = g.isBossWave ? 'Boss wave' : `Wave ${Math.max(1, g.displayWave)}/${g.map.waves}${g.map.boss ? '+B' : ''}`;
  setHtml('hWave', waveTxt, `<span>${waveTxt}</span>`);
  // call-wave button
  const cw = $('callwave'); let t1, t2, mode;
  const nextIsBoss = g.map.boss && g.waveIdx === g.map.waves;
  if (g.state === 'ready') { mode = 'ready'; t1 = 'Start battle'; t2 = 'Build towers, then tap'; }
  else if (g.waveIdx >= g.totalWaves) { mode = 'busy'; t1 = g.isBossWave ? 'Boss!' : 'Final wave!'; t2 = 'Clear the field'; }
  else if (g.nextWaveIn > 0) { mode = 'ready'; t1 = nextIsBoss ? 'Call the boss' : `Call wave ${g.waveIdx + 1}`; t2 = `${Math.ceil(g.nextWaveIn)}s · +${g.earlyBonus()} gold`; }
  else { mode = 'busy'; t1 = `Wave ${g.displayWave} marching`; t2 = 'Next wave up soon'; }
  const key = mode + t1 + t2;
  if (hudCache.cw !== key) { hudCache.cw = key; cw.className = 'glass ' + mode; $('cw1').textContent = t1; $('cw2').textContent = t2; }
  const pv = g.waveIdx < g.totalWaves ? g.nextWavePreview() : null;
  const pk = pv ? pv.n + ':' + pv.list.map(x => x.type + x.count).join(',') : '';
  if (hudCache.pv !== pk) {
    hudCache.pv = pk;
    $('cwFoes').innerHTML = pv ? pv.list.slice(0, 4).map(f => `<div class="foe"><img src="${iconURL('enemy', f.type, { px: 52 })}" alt=""><b>${f.count}</b></div>`).join('') : '';
  }
  // boss bar
  const boss = g.enemies.find(e => e.boss && e.alive);
  if (boss) { $('boss').classList.remove('hidden'); $('bossFill').style.width = (100 * Math.max(0, boss.hp) / boss.maxHp).toFixed(1) + '%'; }
  else if (hudCache.boss !== false) $('boss').classList.add('hidden');
  hudCache.boss = !!boss;
  // live-refresh open panels when gold changes
  if (hudCache.panelGold !== g.gold) {
    hudCache.panelGold = g.gold;
    if (app.ui.spot != null) renderRadial();
    if (app.ui.tower) renderSheet();
  }
}

// ---------- input ----------
let down = null;
cv.addEventListener('pointerdown', e => { unlock(); down = { x: e.clientX, y: e.clientY, t: performance.now() }; });
cv.addEventListener('pointerup', e => {
  if (!down) return;
  const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y), dtm = performance.now() - down.t; down = null;
  if (moved < 16 && dtm < 700) onTap(e.clientX, e.clientY);
});
document.addEventListener('pointerdown', () => unlock(), { capture: true });
document.addEventListener('touchmove', e => { if (!e.target.closest('.scroll')) e.preventDefault(); }, { passive: false });
document.addEventListener('gesturestart', e => e.preventDefault());
document.addEventListener('dblclick', e => e.preventDefault());
document.addEventListener('contextmenu', e => e.preventDefault());

function onTap(cx, cy) {
  const g = app.game; if (!g || app.screen !== 'game' || modalOpen()) return;
  const w = renderer.toWorld(cx, cy);
  let best = null, bd = 26;
  for (const t of g.towers) { const d = Math.hypot(t.x - w.x, t.y - 8 - w.y); if (d < bd) { bd = d; best = t; } }
  if (best) { if (app.ui.tower === best) closeAll(); else selectTower(best); sfx.tap(); return; }
  let si = -1; bd = 28;
  g.map.spots.forEach(([x, y], i) => { if (g.towerAtSpot(i)) return; const d = Math.hypot(x - w.x, y - w.y); if (d < bd) { bd = d; si = i; } });
  if (si >= 0) { if (app.ui.spot === si) closeAll(); else openRadial(si); sfx.tap(); return; }
  closeAll();
}
function closeAll() {
  app.ui = { spot: null, tower: null, preview: null, choice: null, sellArm: 0 };
  $('radial').classList.add('hidden'); $('radial').innerHTML = '';
  $('sheet').classList.add('hidden'); $('sheet').innerHTML = '';
}

// ---------- radial build menu ----------
function openRadial(i) { closeAll(); app.ui.spot = i; app.ui.fresh = true; renderRadial(); }
function renderRadial() {
  const g = app.game, i = app.ui.spot; if (!g || i == null) return;
  if (g.towerAtSpot(i)) { closeAll(); return; }
  const [wx, wy] = g.map.spots[i];
  const sp = renderer.toScreen(wx, wy), R = 80, rect = gameRect();
  const cx = Math.max(R + 32, Math.min(window.innerWidth - R - 32, sp.x));
  const cy = Math.max(rect.y + R + 30, Math.min(rect.y + rect.h - R - 30, sp.y));
  const level = levelInfo(app.save.xp).level, fresh = app.ui.fresh; app.ui.fresh = false;
  let html = '';
  TOWER_ORDER.forEach((type, k) => {
    const a = -Math.PI / 2 + k * (Math.PI * 2 / TOWER_ORDER.length);
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const locked = !towerUnlocked(level, type), cost = g.buildCost(type), poor = g.gold < cost;
    const cls = ['ring-btn', 'glass-strong', locked ? 'locked' : poor ? 'poor' : '', app.ui.choice === type ? 'sel' : ''].join(' ');
    html += `<button class="${cls}" data-type="${type}" style="left:${x}px;top:${y}px;${fresh ? `animation-delay:${k * 18}ms` : 'animation:none'}">
      <img src="${iconURL('tower', type, { tier: 1, px: 92 })}" alt="${TOWERS[type].name}">
      ${locked ? `<span class="lock">${ICON.lock}</span><span class="cost">Lv ${TOWERS[type].unlock}</span>` : `<span class="cost">${cost}</span>`}
    </button>`;
  });
  if (app.ui.choice) {
    const d = TOWERS[app.ui.choice], cost = g.buildCost(app.ui.choice), poor = g.gold < cost;
    html += `<div class="label glass-strong" style="left:${cx}px;top:${cy}px">${esc(d.name)}<small>${poor ? `Need ${cost - g.gold}g` : 'Tap to build'}</small></div>`;
  }
  const el = $('radial'); el.innerHTML = html; el.classList.remove('hidden');
}
$('radial').addEventListener('click', e => {
  const b = e.target.closest('.ring-btn'); if (!b) return;
  const g = app.game, type = b.dataset.type, level = levelInfo(app.save.xp).level;
  if (!towerUnlocked(level, type)) { toast(`${TOWERS[type].name} unlocks at account level ${TOWERS[type].unlock}`); sfx.tap(); return; }
  const cost = g.buildCost(type), [x, y] = g.map.spots[app.ui.spot];
  if (app.ui.choice === type) {
    if (g.gold < cost) { toast('Not enough gold'); return; }
    g.build(app.ui.spot, type); closeAll(); return;
  }
  app.ui.choice = type;
  app.ui.preview = { x, y, range: computeStats(type, 1, null, app.mods).range, cant: g.gold < cost };
  sfx.tap(); renderRadial();
});

// ---------- tower panel ----------
function selectTower(t) { closeAll(); app.ui.tower = t; renderSheet(); }
function statList(t, s, n) {
  const d = (k, a, b, f = v => Math.round(v)) => { const up = n && b != null && Math.round(b * 10) !== Math.round(a * 10) ? `<span class="up">+${f(b - a)}</span>` : ''; return `<div class="stat"><div class="k">${k}</div><div class="v">${f(a)}${up}</div></div>`; };
  const rate = cd => (1 / cd);
  const pct = v => Math.round(v * 100) + '%';
  const out = [];
  if (t.type === 'barracks') {
    out.push(d('Soldiers', s.soldiers, n && n.soldiers));
    out.push(d('Health', s.hp, n && n.hp)); out.push(d('Damage', s.dmg, n && n.dmg));
    out.push(`<div class="stat"><div class="k">Armor</div><div class="v">${pct(s.armor)}</div></div>`);
    if (s.bow) out.push(`<div class="stat"><div class="k">Bows</div><div class="v">${Math.round(s.bow.dmg)}</div></div>`);
    return out.join('');
  }
  if (s.aura) { out.push(d('Dmg/sec', s.auraDps, null)); out.push(`<div class="stat"><div class="k">Slow</div><div class="v">${pct(s.slow)}</div></div>`); out.push(d('Range', s.range, null)); return out.join(''); }
  out.push(d('Damage', s.dmg, n && n.dmg));
  out.push(d('Per sec', rate(s.cd), n && rate(n.cd), v => v.toFixed(1)));
  out.push(d('Range', s.range, n && n.range));
  if (s.splash) out.push(d('Splash', s.splash, n && n.splash));
  if (s.slow) out.push(`<div class="stat"><div class="k">Slow</div><div class="v">${pct(s.slow)}</div></div>`);
  if (s.multishot) out.push(`<div class="stat"><div class="k">Arrows</div><div class="v">×${s.multishot}</div></div>`);
  if (s.chain) out.push(`<div class="stat"><div class="k">Chains</div><div class="v">${s.chain}</div></div>`);
  if (s.burn) out.push(`<div class="stat"><div class="k">Burn</div><div class="v">${s.burn}/s</div></div>`);
  if (s.freezeChance) out.push(`<div class="stat"><div class="k">Freeze</div><div class="v">${pct(s.freezeChance)}</div></div>`);
  if (s.crit > 0.001) out.push(`<div class="stat"><div class="k">Crit</div><div class="v">${pct(s.crit)}</div></div>`);
  if (s.bonusVsBossAir) out.push(`<div class="stat"><div class="k">vs Boss/Air</div><div class="v">×${s.bonusVsBossAir}</div></div>`);
  return out.join('');
}
function renderSheet() {
  const g = app.game, t = app.ui.tower, el = $('sheet');
  if (!g || !t || !g.towers.includes(t)) { closeAll(); return; }
  const def = TOWERS[t.type], s = t.stats;
  const name = t.branch ? def.branches[t.branch].name : def.name;
  const next = t.tier < 3 ? computeStats(t.type, t.tier + 1, null, app.mods) : null;
  let up = '';
  if (t.tier < 3) {
    const cost = g.upgradeCost(t), poor = g.gold < cost;
    up = `<button class="btn btn-gold btn-block ${poor ? 'disabled-look' : ''}" data-act="upgrade" style="${poor ? 'opacity:.55' : ''}">Upgrade to Tier ${t.tier + 1} · ${ICON.coin} ${cost}</button>`;
  } else if (t.tier === 3) {
    up = `<div class="label-s">Choose a specialization</div><div class="branches">${Object.entries(def.branches).map(([k, b]) => {
      const poor = g.gold < b.cost;
      return `<div class="branch"><div class="bh"><img src="${iconURL('tower', t.type, { tier: 4, branch: k, px: 68 })}" alt=""><div class="bn">${esc(b.name)}</div></div><div class="bd">${esc(b.desc)}</div><button class="btn btn-gold" data-act="branch" data-k="${k}" style="${poor ? 'opacity:.55' : ''}">${ICON.coin} ${b.cost}</button></div>`;
    }).join('')}</div>`;
  } else up = `<div class="muted" style="text-align:center;font-size:14px;padding:4px 0">Fully upgraded</div>`;
  const tgt = t.type !== 'barracks' && !s.aura ? `<div class="label-s">Target</div><div class="seg">${TARGET_MODES.map(m => `<button data-act="target" data-m="${m}" class="${t.targeting === m ? 'on' : ''}">${{ first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' }[m]}</button>`).join('')}</div>` : '';
  const armed = performance.now() - app.ui.sellArm < 2500;
  el.innerHTML = `
    <div class="sheet-head"><img src="${iconURL('tower', t.type, { tier: t.tier, branch: t.branch, px: 96 })}" alt="">
      <div class="grow" style="flex:1"><div class="nm">${esc(name)}</div><div class="sub">Tier ${t.tier} · ${esc(def.role)}</div></div>
      <button class="btn btn-icon" data-act="close" aria-label="Close">${ICON.close}</button></div>
    <div class="stats">${statList(t, s, next)}</div>
    ${up}${tgt}
    <div class="row" style="margin-top:12px"><div class="grow faint" style="font-size:12px">Spent ${t.spent} gold</div>
      <button class="btn ${armed ? 'btn-red' : ''}" data-act="sell" style="min-height:40px">${armed ? 'Tap to confirm' : `Sell · +${g.sellValue(t)}`}</button></div>`;
  const sp = renderer.toScreen(t.x, t.y);
  el.style.top = ''; el.style.bottom = '';
  if (sp.y > window.innerHeight * 0.52) { el.style.top = `calc(${safe().t + 58}px)`; el.style.bottom = 'auto'; }
  el.classList.remove('hidden');
}
$('sheet').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const g = app.game, t = app.ui.tower; if (!g || !t) return;
  switch (b.dataset.act) {
    case 'close': closeAll(); break;
    case 'upgrade': if (!g.upgrade(t)) toast('Not enough gold'); renderSheet(); break;
    case 'branch': if (!g.chooseBranch(t, b.dataset.k)) toast('Not enough gold'); renderSheet(); break;
    case 'target': g.setTargeting(t, b.dataset.m); sfx.tap(); renderSheet(); break;
    case 'sell':
      if (performance.now() - app.ui.sellArm < 2500) { g.sell(t); closeAll(); }
      else { app.ui.sellArm = performance.now(); sfx.tap(); renderSheet(); setTimeout(() => { if (app.ui.tower === t) renderSheet(); }, 2600); }
      break;
  }
});

// ---------- bottom bar ----------
$('callwave').addEventListener('click', () => {
  const g = app.game; if (!g) return;
  if (g.canCallWave()) { g.callWave(); closeAll(); }
});
$('bSpeed').addEventListener('click', () => { app.speed = app.speed === 1 ? 2 : 1; $('bSpeed').textContent = app.speed + '×'; sfx.tap(); });
$('bPause').addEventListener('click', () => pause());

function pause() {
  const g = app.game; if (!g || app.paused) return;
  app.paused = true; closeAll();
  const saved = app.save.run && app.save.run.mapId === g.map.id;
  modal({
    title: 'Paused',
    html: `<p>${esc(g.map.name)} · ${g.isBossWave ? 'Boss wave' : `Wave ${Math.max(1, g.displayWave)}/${g.map.waves}`}<br><span class="faint" style="font-size:13px">${saved ? 'Progress auto-saves at the start of every wave.' : 'Nothing saved yet — the run saves when wave 1 starts.'}</span></p>`,
    actions: [
      { label: 'Resume', cls: 'btn-gold', onClick: () => { app.paused = false; } },
      { label: `Sound: ${app.save.settings.sound ? 'On' : 'Off'}`, keepOpen: true, onClick: () => { app.save.settings.sound = !app.save.settings.sound; setEnabled(app.save.settings.sound); Save.write(); closeModal(); app.paused = false; pause(); } },
      { label: 'Restart map', onClick: () => modal({ title: 'Restart this map?', text: 'Your current run will be lost.', actions: [{ label: 'Restart', cls: 'btn-red', onClick: () => startMap(g.map.id) }, { label: 'Cancel', onClick: () => { app.paused = false; pause(); } }] }) },
      { label: 'Quit to menu', onClick: () => { app.game = null; app.paused = false; showScreen('home'); toast(saved ? 'Run saved — continue from Home' : 'Run ended'); } },
    ],
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (app.screen === 'game' && app.game && app.game.state === 'running' && !app.paused) pause(); suspend(); }
  else checkUpdate();
});
window.addEventListener('pagehide', () => { if (app.screen === 'game' && app.game && app.game.state === 'running' && !app.paused) pause(); });

// ---------- updates + offline ----------
async function checkUpdate() {
  try {
    const r = await fetch('version.json?t=' + Date.now(), { cache: 'no-store' });
    if (!r.ok) return;
    const v = await r.json();
    if (v.version && v.version !== APP_VERSION) $('update').classList.remove('hidden');
  } catch (_) { /* offline */ }
}
$('update').addEventListener('click', () => location.reload());
if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
setTimeout(checkUpdate, 3000); setInterval(checkUpdate, 10 * 60 * 1000);

// ---------- boot ----------
initScreens(app, { startMap, showScreen, save: Save, sfx, setEnabled });
layout();
$('boot').remove();
showScreen('home');
requestAnimationFrame(frame);
