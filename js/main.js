// Holdfast — app controller: game loop, game screen (HUD, build ring, tower panel), home demo, tutorial, routing.
import { APP_VERSION, TICK, MAPS, TOWERS, TOWER_ORDER, ENEMIES, TUTORIAL_MAP, TUTORIAL_XP, ENEMY_TIPS, SPEEDS } from './config.js';
import { Game, computeStats, TARGET_MODES } from './engine.js';
import { Renderer, iconURL } from './render.js';
import * as Save from './save.js';
import { sfx, unlock, setEnabled, suspend } from './audio.js';
import { getMods, levelInfo, towerUnlocked, starsFor, runXp, mapUnlocked } from './progress.js';
import { $, esc, ICON, toast, modal, closeModal, modalOpen, fmt } from './ui.js';
import { initScreens, renderScreen } from './screens.js';
import { Tutorial } from './tutorial.js';

const app = {
  version: APP_VERSION,
  save: Save.load(),
  game: null, demo: null, screen: 'home', speed: 1, paused: false, tut: null,
  ui: { spot: null, tower: null, preview: null, choice: null, sellArm: 0, enemy: null, rallyMode: false },
  lastResult: null, mods: null,
};
window.__holdfast = app; // handy for debugging in Safari dev tools
setEnabled(app.save.settings.sound);
app.speed = SPEEDS.includes(app.save.settings.speed) ? app.save.settings.speed : 1;

const cv = $('cv');
const renderer = new Renderer(cv);
app.renderer = renderer;

// ---------- layout ----------
// Size from the canvas's real CSS box (position:fixed; inset:0), not window.innerHeight:
// iOS home-screen apps can report a too-short innerHeight at launch, which left a gap.
const probe = document.createElement('div');
probe.style.cssText = 'position:fixed;visibility:hidden;pointer-events:none;padding:env(safe-area-inset-top) 0 env(safe-area-inset-bottom) 0';
document.body.appendChild(probe);
const VP = { gap: 0, topClear: 0 };
function safe() { const cs = getComputedStyle(probe); return { t: (parseFloat(cs.paddingTop) || 0) + VP.topClear, b: parseFloat(cs.paddingBottom) || 0 }; }
// iOS home-screen apps: the layout viewport can stop ~50pt short of the real screen bottom (a WebKit bug),
// leaving a dead strip. Measure the gap against the physical screen and stretch fixed layers into it.
// iOS 27 also blurs the top edge of apps, so keep the HUD below it.
function measureViewport() {
  const root = document.documentElement.style;
  const rawTop = parseFloat(getComputedStyle(probe).paddingTop) || 0;
  VP.topClear = rawTop > 20 ? 26 : 0;
  const standalone = navigator.standalone === true || (window.matchMedia && matchMedia('(display-mode: standalone)').matches);
  let gap = 0;
  if (standalone) {
    const layoutH = $('vpprobe').getBoundingClientRect().height || window.innerHeight;
    const portrait = window.innerHeight >= window.innerWidth;
    const full = portrait ? Math.max(screen.width, screen.height) : Math.min(screen.width, screen.height);
    const g = Math.round(full - layoutH);
    if (g > 2 && g < 140) gap = g;
  }
  VP.gap = gap;
  root.setProperty('--vgap', gap + 'px'); root.setProperty('--top-clear', VP.topClear + 'px');
}
app.vp = VP;
function viewport() {
  const r = cv.getBoundingClientRect();
  return { W: Math.round(r.width) || window.innerWidth, H: Math.round(r.height) || window.innerHeight };
}
function gameRect() {
  const s = safe(), { W, H } = viewport();
  const top = s.t + 6 + 26, bottom = s.b + 8 + 64 + 6; // map tucks slightly under the glass HUD
  return { x: 0, y: top, w: W, h: Math.max(200, H - top - bottom) };
}
function homeRect() { const { W, H } = viewport(); return { x: 0, y: 0, w: W, h: H }; }
app.gameRect = gameRect;
let menuDirty = true, lastLayoutKey = '';
function layout(force = false) {
  measureViewport();
  const { W, H } = viewport(), s = safe();
  const key = [W, H, s.t, s.b, VP.gap, app.screen === 'game' ? 'g' : 'm', window.devicePixelRatio].join(',');
  if (!force && key === lastLayoutKey) return;
  lastLayoutKey = key;
  renderer.resize(W, H, app.screen === 'game' ? gameRect() : homeRect());
  menuDirty = true;
  if (app.ui.spot != null) renderRadial();
}
window.addEventListener('resize', () => layout());
window.addEventListener('orientationchange', () => setTimeout(() => layout(), 300));
if (window.visualViewport) window.visualViewport.addEventListener('resize', () => layout());
if (window.ResizeObserver) new ResizeObserver(() => layout()).observe(cv);
window.addEventListener('pageshow', () => setTimeout(() => layout(true), 50));

// ---------- routing ----------
function nextMapIdx() {
  const s = app.save; let idx = 0;
  for (let i = 0; i < MAPS.length; i++) if (mapUnlocked(s, i)) idx = i;
  return idx;
}
function ensureDemo() {
  const map = MAPS[0];
  if (app.demo && app.demo.state === 'running') { if (renderer.map !== map) renderer.setMap(map); return; }
  const g = new Game({ map, mods: getMods({}), seed: 11 });
  g.gold = 1e6;
  const plan = [['archer', 3, 'ranger'], ['mage', 3], ['bombard', 3, 'mortar'], ['frost', 2], ['barracks', 3, 'knights'], ['archer', 2], ['ballista', 3], ['mage', 3, 'warlock'], ['bombard', 2], ['frost', 3, 'blizzard'], ['archer', 3, 'marksman']];
  map.spots.forEach((_, i) => {
    const [type, tier, br] = plan[i % plan.length]; const t = g.build(i, type); if (!t) return;
    while (t.tier < Math.min(3, tier)) g.upgrade(t);
    if (br) g.chooseBranch(t, br);
    t.anim = 1;
  });
  g.callWave(); g.events = [];
  app.demo = g;
  if (renderer.map !== map) renderer.setMap(map);
}
function showScreen(name, params = {}) {
  const wasGame = app.screen === 'game';
  app.screen = name;
  const inGame = name === 'game';
  document.body.classList.toggle('in-game', inGame);
  $('hud').classList.toggle('hidden', !inGame);
  $('bar').classList.toggle('hidden', !inGame);
  if (!inGame) { closeAll(); $('boss').classList.add('hidden'); $('einfo').classList.add('hidden'); if (app.tut) { app.tut.destroy(); app.tut = null; } }
  if (inGame) { $('screen').innerHTML = ''; $('screen').className = ''; layout(true); return; }
  if (name === 'home' || (wasGame && name !== 'results') || !renderer.map) { ensureDemo(); }
  layout(true);
  menuDirty = true;
  renderScreen(name, params);
}
app.showScreen = showScreen;

// ---------- runs ----------
function startMap(mapId, { resume = false, tutorial = false } = {}) {
  const map = tutorial ? TUTORIAL_MAP : MAPS.find(m => m.id === mapId);
  app.mods = getMods(app.save.skills);
  const snap = !tutorial && resume && app.save.run && app.save.run.mapId === mapId ? app.save.run : null;
  if (!resume && !tutorial) { app.save.run = null; Save.write(); }
  app.game = new Game({ map, mods: tutorial ? getMods({}) : app.mods, snapshot: snap });
  app.paused = false; app.ending = false; acc = 0;
  if (tutorial) app.speed = 1;
  $('bSpeed').textContent = app.speed + '×';
  renderer.setMap(map);
  hudCache = {};
  showScreen('game');
  if (tutorial) app.tut = new Tutorial({ toScreen: (x, y) => renderer.toScreen(x, y), confirmSkip, changed: () => {} });
  if (snap) toast(`Resumed · ${snap.wave >= map.waves ? 'Boss wave' : `Wave ${snap.wave + 1}`}`);
  else if (!tutorial) toast(map.name);
}
app.startMap = startMap;
app.startTutorial = () => startMap(null, { tutorial: true });
function confirmSkip() {
  app.paused = true;
  modal({ title: 'Skip the tutorial?', text: 'You can replay it any time from the Campaign screen.', actions: [
    { label: 'Skip tutorial', cls: 'btn-red', onClick: () => { app.paused = false; if (app.tut) app.tut.skip(); } },
    { label: 'Keep learning', onClick: () => { app.paused = false; } }] });
}

function endRun(won) {
  const g = app.game, map = g.map, s = app.save;
  if (map.tutorial) {
    const first = won && !s.tutorialDone;
    const before = levelInfo(s.xp);
    if (won) s.tutorialDone = true;
    if (first) s.xp += TUTORIAL_XP;
    const after = levelInfo(s.xp);
    Save.write();
    app.lastResult = { tutorial: true, won, mapId: map.id, map, stars: starsFor(won, g.hearts), hearts: g.hearts, kills: g.kills, wavesCleared: won ? g.totalWaves : Math.max(0, g.waveIdx - 1), totalWaves: g.totalWaves,
      xp: { waves: 0, kills: 0, win: first ? TUTORIAL_XP : 0, stars: 0, newStars: 0, total: first ? TUTORIAL_XP : 0 }, before, after, unlockedTowers: [], unlockedMap: null, nextMap: won ? MAPS[0] : null };
    won ? sfx.win() : sfx.lose();
    app.game = null; showScreen('results'); return;
  }
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
  app.lastResult = { won, mapId: map.id, map, stars, hearts: g.hearts, kills: g.kills, wavesCleared, totalWaves: g.totalWaves, xp, before, after, unlockedTowers, unlockedMap, nextMap: won && MAPS[idx + 1] ? MAPS[idx + 1] : null };
  won ? sfx.win() : sfx.lose();
  app.game = null;
  showScreen('results');
}

// ---------- loop ----------
let last = performance.now(), acc = 0, demoAcc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); last = now;
  const g = app.game;
  if (g && app.screen === 'game') {
    if (app.tut) { app.tut.update(g); const gt = app.tut.gate(); app.ui.gateSpot = gt && gt.spot != null ? gt.spot : null; } else app.ui.gateSpot = null;
    const running = !app.paused && !(app.tut && app.tut.paused) && g.state === 'running';
    if (running) {
      acc += dt * app.speed; let n = 0;
      while (acc >= TICK && n < 24) { g.step(TICK); acc -= TICK; n++; drainEvents(); if (g.state !== 'running') break; }
      if (n >= 24) acc = 0;
    }
    drainEvents();
    renderer.draw(g, app.ui, running ? dt * app.speed : 0, running ? Math.min(1, acc / TICK) : 1);
    updateHud();
  } else if (app.screen === 'home' && app.demo) {
    const d = app.demo;
    demoAcc += dt; let n = 0;
    while (demoAcc >= TICK && n < 8) { d.step(TICK); demoAcc -= TICK; n++; d.hearts = 20; if (d.nextWaveIn > 4) d.nextWaveIn = 4; }
    for (const ev of d.events) renderer.particles.event(ev, renderer); d.events = [];
    if (d.state !== 'running') { app.demo = null; ensureDemo(); }
    renderer.draw(app.demo, {}, dt, Math.min(1, demoAcc / TICK));
  } else if (menuDirty) { renderer.draw(app.demo && renderer.map === app.demo.map ? app.demo : null, {}, 0, 1); menuDirty = false; }
  requestAnimationFrame(frame);
}

function drainEvents() {
  const g = app.game; if (!g || !g.events.length) return;
  const evs = g.events; g.events = [];
  for (const ev of evs) {
    renderer.particles.event(ev, renderer);
    switch (ev.t) {
      case 'shoot': ({ arrow: sfx.arrow, magic: sfx.magic, zap: sfx.zap, cannon: sfx.cannon, frost: sfx.frost, bolt: sfx.bolt }[ev.kind] || (() => {}))(); break;
      case 'boom': sfx.explosion(ev.big); break;
      case 'freeze': sfx.freeze(); break;
      case 'heal': sfx.heal(); break;
      case 'clash': sfx.clash(); break;
      case 'death': if (Math.random() < 0.5) sfx.coin(); if (app.ui.enemy && !app.ui.enemy.alive) hideEnemyInfo(); break;
      case 'build': sfx.build(); app.tut && app.tut.onEvent('build'); break;
      case 'upgrade': sfx.upgrade(); app.tut && app.tut.onEvent('upgrade'); break;
      case 'sell': sfx.sell(); break;
      case 'early': toast(`Called early · +${ev.gold} gold`, 1300); sfx.coin(); break;
      case 'boss': sfx.boss(); toast('The Ogre Warlord approaches!', 2200); break;
      case 'firstSpawn': firstSighting(ev.type); break;
      case 'leak': {
        sfx.leak();
        const v = $('vignette'); v.classList.add('on'); setTimeout(() => v.classList.remove('on'), 60);
        const h = $('hHearts'); h.classList.remove('hit'); void h.offsetWidth; h.classList.add('hit');
        break;
      }
      case 'waveStart':
        if (!g.map.tutorial) { app.save.run = ev.snapshot; Save.write(); }
        sfx.horn(); app.tut && app.tut.onEvent('waveStart');
        break;
      case 'win': case 'lose':
        if (!app.ending) { app.ending = true; setTimeout(() => { if (app.game === g) endRun(ev.t === 'win'); }, 1200); }
        break;
    }
  }
}

// First time ever seeing an enemy type: pause and explain it.
function firstSighting(type) {
  const g = app.game; if (!g || g.map.tutorial) return;
  const seen = app.save.seen.enemies; if (seen.includes(type)) return;
  seen.push(type); Save.write();
  const e = ENEMIES[type];
  app.paused = true;
  modal({ title: `New enemy: ${e.name}`, html: `<img src="${iconURL('enemy', type, { px: 160 })}" alt="" style="width:96px;height:96px;margin:-4px auto 4px;display:block"><p>${esc(ENEMY_TIPS[type] || e.trait)}</p>`,
    actions: [{ label: 'Got it', cls: 'btn-gold', onClick: () => { app.paused = false; } }] });
}

// ---------- HUD ----------
let hudCache = {};
function setHtml(id, key, html) { if (hudCache[id] !== key) { hudCache[id] = key; $(id).innerHTML = html; } }
function updateHud() {
  const g = app.game;
  setHtml('hHearts', g.hearts, `${ICON.heart}<span>${g.hearts}</span>`);
  setHtml('hGold', g.gold, `${ICON.coin}<span>${fmt(g.gold)}</span>`);
  const waveTxt = g.isBossWave ? 'Boss wave' : `Wave ${Math.max(1, g.displayWave)}/${g.map.waves}${g.map.boss ? ' + Boss' : ''}`;
  setHtml('hWave', waveTxt, `<span>${waveTxt}</span>`);
  const cw = $('callwave'); let t1, t2, mode;
  const nextIsBoss = g.map.boss && g.waveIdx === g.map.waves;
  if (g.state === 'ready') { mode = 'ready'; t1 = 'Start battle'; t2 = 'Free refunds until you start'; }
  else if (g.waveIdx >= g.totalWaves) { mode = 'busy'; t1 = g.isBossWave ? 'Boss!' : 'Final wave!'; t2 = 'Clear the field'; }
  else if (g.nextWaveIn > 0) { mode = 'ready'; t1 = nextIsBoss ? 'Call the boss' : `Call wave ${g.waveIdx + 1}`; t2 = `${Math.ceil(g.nextWaveIn)}s · +${g.earlyBonus()} gold`; }
  else { mode = 'busy'; t1 = `Wave ${g.displayWave} marching`; t2 = 'Next wave up soon'; }
  const key = mode + t1 + t2;
  if (hudCache.cw !== key) { hudCache.cw = key; cw.className = 'glass ' + mode; $('cw1').textContent = t1; $('cw2').textContent = t2; }
  const pv = g.waveIdx < g.totalWaves ? g.nextWavePreview() : null;
  const pk = pv ? pv.n + ':' + pv.list.map(x => x.type + x.count).join(',') : '';
  if (hudCache.pv !== pk) {
    hudCache.pv = pk;
    $('cwFoes').innerHTML = pv ? pv.list.slice(0, 4).map(f => `<div class="foe"><img src="${iconURL('enemy', f.type, { px: 56 })}" alt=""><b>${f.count}</b>${ENEMIES[f.type].flying ? '<i class="fly"></i>' : ''}</div>`).join('') : '';
  }
  const boss = g.enemies.find(e => e.boss && e.alive);
  if (boss) { $('boss').classList.remove('hidden'); $('bossFill').style.width = (100 * Math.max(0, boss.hp) / boss.maxHp).toFixed(1) + '%'; }
  else if (hudCache.boss !== false) $('boss').classList.add('hidden');
  hudCache.boss = !!boss;
  if (app.ui.enemy) renderEnemyInfo();
  if (hudCache.panelGold !== g.gold || hudCache.panelState !== g.state) {
    hudCache.panelGold = g.gold; hudCache.panelState = g.state;
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
  const gate = app.tut ? app.tut.gate() : null;
  // rally placement mode
  if (app.ui.rallyMode && app.ui.tower) {
    const t = app.ui.tower;
    if (g.setRally(t, w.x, w.y)) { sfx.tap(); toast('Rally point moved'); }
    else toast('Pick a spot on the road inside the circle');
    app.ui.rallyMode = false; renderSheet(); return;
  }
  let best = null, bd = 26;
  for (const t of g.towers) { const d = Math.hypot(t.x - w.x, t.y - 10 - w.y); if (d < bd) { bd = d; best = t; } }
  if (best) {
    if (gate && gate.towerSpot !== best.spot) return;
    if (app.ui.tower === best) closeAll(); else selectTower(best); sfx.tap(); return;
  }
  if (!gate) {
    let en = null; bd = 20;
    for (const e of g.enemies) { if (!e.alive) continue; const d = Math.hypot(e.x - w.x, e.y - (e.flying ? 24 : 10) - w.y); if (d < bd) { bd = d; en = e; } }
    if (en) { closeAll(); showEnemyInfo(en); sfx.tap(); return; }
  }
  let si = -1; bd = 28;
  g.map.spots.forEach(([x, y], i) => { if (g.towerAtSpot(i)) return; const d = Math.hypot(x - w.x, y - w.y); if (d < bd) { bd = d; si = i; } });
  if (si >= 0) {
    if (gate && gate.spot !== si) return;
    if (app.ui.spot === si) { if (!gate) closeAll(); } else openRadial(si); sfx.tap(); return;
  }
  if (gate && gate.spot != null && app.ui.spot === gate.spot) return; // keep the ring open during the tutorial
  closeAll();
}
function closeAll() {
  app.ui = { spot: null, tower: null, preview: null, choice: null, sellArm: 0, enemy: null, rallyMode: false, gateSpot: app.ui.gateSpot };
  $('radial').classList.add('hidden'); $('radial').innerHTML = '';
  $('sheet').classList.add('hidden'); $('sheet').innerHTML = '';
  $('einfo').classList.add('hidden');
}

// ---------- enemy info ----------
let einfoTimer = null;
function showEnemyInfo(e) { app.ui.enemy = e; hudCache.einfo = ''; renderEnemyInfo(); clearTimeout(einfoTimer); einfoTimer = setTimeout(hideEnemyInfo, 5000); }
function hideEnemyInfo() { app.ui.enemy = null; $('einfo').classList.add('hidden'); }
function renderEnemyInfo() {
  const e = app.ui.enemy; if (!e || !e.alive) return hideEnemyInfo();
  const d = e.def, pct = v => Math.round(v * 100) + '%';
  const key = e.id + ':' + Math.ceil(e.hp);
  if (hudCache.einfo === key) return; hudCache.einfo = key;
  const el = $('einfo');
  el.innerHTML = `<img src="${iconURL('enemy', e.type, { px: 96 })}" alt=""><div class="ei-main"><div class="ei-name">${esc(d.name)}${d.flying ? ' <span class="ei-tag">Flying</span>' : ''}${d.boss ? ' <span class="ei-tag red">Boss</span>' : ''}</div>
    <div class="ei-bar"><i style="width:${(100 * Math.max(0, e.hp) / e.maxHp).toFixed(1)}%"></i></div>
    <div class="ei-stats">${fmt(Math.max(0, e.hp))}/${fmt(e.maxHp)} HP · Armor ${pct(d.armor)} · Magic res ${pct(d.mr)}</div>
    <div class="ei-tip">${esc(ENEMY_TIPS[e.type] || d.trait)}</div></div>`;
  el.classList.remove('hidden');
}
$('einfo').addEventListener('click', hideEnemyInfo);

// ---------- radial build menu ----------
function openRadial(i) { closeAll(); app.ui.spot = i; app.ui.fresh = true; renderRadial(); app.tut && app.tut.onEvent('radialOpen'); }
function renderRadial() {
  const g = app.game, i = app.ui.spot; if (!g || i == null) return;
  if (g.towerAtSpot(i)) { closeAll(); return; }
  const [wx, wy] = g.map.spots[i];
  const sp = renderer.toScreen(wx, wy), R = 80, rect = gameRect(), { W } = viewport();
  const cx = Math.max(R + 32, Math.min(W - R - 32, sp.x));
  const cy = Math.max(rect.y + R + 34, Math.min(rect.y + rect.h - R - 30, sp.y));
  const level = levelInfo(app.save.xp).level, fresh = app.ui.fresh; app.ui.fresh = false;
  const gate = app.tut ? app.tut.gate() : null, tutorial = g.map.tutorial;
  let html = '';
  TOWER_ORDER.forEach((type, k) => {
    const a = -Math.PI / 2 + k * (Math.PI * 2 / TOWER_ORDER.length);
    const x = cx + Math.cos(a) * R, y = cy + Math.sin(a) * R;
    const locked = tutorial ? !['archer', 'mage', 'bombard', 'frost'].includes(type) : !towerUnlocked(level, type);
    const cost = g.buildCost(type), poor = g.gold < cost, dim = gate && gate.tower && gate.tower !== type;
    const cls = ['ring-btn', 'glass-strong', locked ? 'locked' : poor ? 'poor' : '', app.ui.choice === type ? 'sel' : '', dim ? 'dim' : ''].join(' ');
    html += `<button class="${cls}" data-type="${type}" style="left:${x}px;top:${y}px;${fresh ? `animation-delay:${k * 22}ms` : 'animation:none'}">
      <img src="${iconURL('tower', type, { tier: 1, px: 104 })}" alt="${TOWERS[type].name}">
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
  const gate = app.tut ? app.tut.gate() : null;
  if (gate && gate.tower && gate.tower !== type) { toast(`Pick the ${TOWERS[gate.tower].name}`); return; }
  const locked = g.map.tutorial ? !['archer', 'mage', 'bombard', 'frost'].includes(type) : !towerUnlocked(level, type);
  if (locked) { toast(`${TOWERS[type].name} unlocks at account level ${TOWERS[type].unlock}`); sfx.tap(); return; }
  const cost = g.buildCost(type), [x, y] = g.map.spots[app.ui.spot];
  if (app.ui.choice === type) {
    if (g.gold < cost) { toast('Not enough gold'); return; }
    g.build(app.ui.spot, type); closeAll(); return;
  }
  app.ui.choice = type;
  app.ui.preview = { x, y, range: computeStats(type, 1, null, app.mods || getMods({})).range, cant: g.gold < cost };
  sfx.tap(); renderRadial();
});

// ---------- tower panel ----------
function selectTower(t) { closeAll(); app.ui.tower = t; renderSheet(); app.tut && app.tut.onEvent('sheetOpen'); }
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
  const def = TOWERS[t.type], s = t.stats, mods = app.mods || getMods({});
  const name = t.branch ? def.branches[t.branch].name : def.name;
  const next = t.tier < 3 ? computeStats(t.type, t.tier + 1, null, mods) : null;
  let up = '';
  if (t.tier < 3) {
    const cost = g.upgradeCost(t), poor = g.gold < cost;
    up = `<button class="btn btn-gold btn-block" id="upgradeBtn" data-act="upgrade" style="${poor ? 'opacity:.55' : ''}">Upgrade to Tier ${t.tier + 1} · ${ICON.coin} ${cost}</button>`;
  } else if (t.tier === 3) {
    up = `<div class="label-s">Choose a specialization</div><div class="branches">${Object.entries(def.branches).map(([k, b]) => {
      const poor = g.gold < b.cost;
      return `<div class="branch"><div class="bh"><img src="${iconURL('tower', t.type, { tier: 4, branch: k, px: 76 })}" alt=""><div class="bn">${esc(b.name)}</div></div><div class="bd">${esc(b.desc)}</div><button class="btn btn-gold" data-act="branch" data-k="${k}" style="${poor ? 'opacity:.55' : ''}">${ICON.coin} ${b.cost}</button></div>`;
    }).join('')}</div>`;
  } else up = `<div class="muted" style="text-align:center;font-size:14px;padding:4px 0">Fully upgraded</div>`;
  const tgt = t.type !== 'barracks' && !s.aura ? `<div class="label-s">Target</div><div class="seg">${TARGET_MODES.map(m => `<button data-act="target" data-m="${m}" class="${t.targeting === m ? 'on' : ''}">${{ first: 'First', last: 'Last', strong: 'Strongest', close: 'Closest' }[m]}</button>`).join('')}</div>` : '';
  const rally = t.type === 'barracks' ? `<button class="btn btn-block" data-act="rally" style="margin-top:10px;min-height:42px">${app.ui.rallyMode ? 'Tap the road inside the circle…' : 'Move rally point'}</button>` : '';
  const armed = performance.now() - app.ui.sellArm < 2500, full = g.state === 'ready';
  el.innerHTML = `
    <div class="sheet-head"><img src="${iconURL('tower', t.type, { tier: t.tier, branch: t.branch, px: 104 })}" alt="">
      <div class="grow" style="flex:1"><div class="nm">${esc(name)}</div><div class="sub">Tier ${t.tier} · ${esc(def.role)}</div></div>
      <button class="btn btn-icon" data-act="close" aria-label="Close">${ICON.close}</button></div>
    <div class="stats">${statList(t, s, next)}</div>
    ${up}${tgt}${rally}
    <div class="row" style="margin-top:12px"><div class="grow faint" style="font-size:12px">${full ? 'Full refund before the battle starts' : `Spent ${t.spent} gold`}</div>
      <button class="btn ${armed ? 'btn-red' : ''}" data-act="sell" style="min-height:40px">${armed ? 'Tap to confirm' : `Sell · +${g.sellValue(t)}`}</button></div>`;
  const sp = renderer.toScreen(t.x, t.y);
  el.style.top = ''; el.style.bottom = '';
  if (sp.y > viewport().H * 0.52) { el.style.top = `calc(${safe().t + 58}px)`; el.style.bottom = 'auto'; }
  el.classList.toggle('rally-mode', !!app.ui.rallyMode);
  el.classList.remove('hidden');
}
$('sheet').addEventListener('click', e => {
  const b = e.target.closest('[data-act]'); if (!b) return;
  const g = app.game, t = app.ui.tower; if (!g || !t) return;
  const gate = app.tut ? app.tut.gate() : null;
  if (gate && gate.act === 'upgrade' && b.dataset.act !== 'upgrade') return;
  switch (b.dataset.act) {
    case 'close': closeAll(); break;
    case 'upgrade': if (!g.upgrade(t)) toast('Not enough gold'); renderSheet(); break;
    case 'branch': if (!g.chooseBranch(t, b.dataset.k)) toast('Not enough gold'); renderSheet(); break;
    case 'target': g.setTargeting(t, b.dataset.m); sfx.tap(); renderSheet(); break;
    case 'rally': app.ui.rallyMode = !app.ui.rallyMode; sfx.tap(); renderSheet(); break;
    case 'sell':
      if (performance.now() - app.ui.sellArm < 2500) { g.sell(t); closeAll(); }
      else { app.ui.sellArm = performance.now(); sfx.tap(); renderSheet(); setTimeout(() => { if (app.ui.tower === t) renderSheet(); }, 2600); }
      break;
  }
});

// ---------- bottom bar ----------
$('callwave').addEventListener('click', () => {
  const g = app.game; if (!g) return;
  const gate = app.tut ? app.tut.gate() : null;
  if (gate && gate.act !== 'callwave') return;
  if (g.canCallWave()) { g.callWave(); closeAll(); }
});
$('bSpeed').addEventListener('click', () => {
  app.speed = SPEEDS[(SPEEDS.indexOf(app.speed) + 1) % SPEEDS.length];
  $('bSpeed').textContent = app.speed + '×'; sfx.tap();
  if (!(app.game && app.game.map.tutorial)) { app.save.settings.speed = app.speed; Save.write(); }
  app.tut && app.tut.onEvent('speed');
});
$('bPause').addEventListener('click', () => pause());

function pause() {
  const g = app.game; if (!g || app.paused) return;
  app.paused = true; closeAll();
  const tut = g.map.tutorial, saved = !tut && app.save.run && app.save.run.mapId === g.map.id;
  modal({
    title: 'Paused',
    html: `<p>${esc(g.map.name)} · ${g.isBossWave ? 'Boss wave' : `Wave ${Math.max(1, g.displayWave)}/${g.map.waves}`}<br><span class="faint" style="font-size:13px">${tut ? 'Tutorial runs aren’t saved.' : saved ? 'Progress auto-saves at the start of every wave.' : 'Nothing saved yet — the run saves when wave 1 starts.'}</span></p>`,
    actions: [
      { label: 'Resume', cls: 'btn-gold', onClick: () => { app.paused = false; } },
      { label: `Sound: ${app.save.settings.sound ? 'On' : 'Off'}`, keepOpen: true, onClick: () => { app.save.settings.sound = !app.save.settings.sound; setEnabled(app.save.settings.sound); Save.write(); closeModal(); app.paused = false; pause(); } },
      { label: 'Restart map', onClick: () => modal({ title: 'Restart this map?', text: 'Your current run will be lost.', actions: [{ label: 'Restart', cls: 'btn-red', onClick: () => tut ? app.startTutorial() : startMap(g.map.id) }, { label: 'Cancel', onClick: () => { app.paused = false; pause(); } }] }) },
      { label: 'Quit to menu', onClick: () => { app.game = null; app.paused = false; showScreen('home'); if (!tut) toast(saved ? 'Run saved — continue from Home' : 'Run ended'); } },
    ],
  });
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (app.screen === 'game' && app.game && app.game.state === 'running' && !app.paused) pause(); suspend(); }
  else { checkUpdate(); setTimeout(() => layout(true), 60); }
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
initScreens(app, { startMap, startTutorial: app.startTutorial, showScreen, save: Save, sfx, setEnabled });
layout(true);
$('boot').remove();
showScreen('home');
[120, 500, 1500].forEach(ms => setTimeout(() => layout(true), ms)); // iOS settles the real viewport late
requestAnimationFrame(frame);
