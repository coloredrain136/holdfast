// Holdfast — game simulation. No DOM. Fixed timestep: call step() once per TICK.
import { TOWERS, ENEMIES, WAVE_TUNING, WAVE_BREAK, EARLY_GOLD_PER_SEC, TICK, MAPS } from './config.js';

// ---------- utilities ----------
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) >>> 0; let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

// ---------- path ----------
export class Path {
  constructor(points) {
    this.pts = points; this.cum = [0];
    for (let i = 1; i < points.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(points[i][0] - points[i - 1][0], points[i][1] - points[i - 1][1]));
    this.total = this.cum[this.cum.length - 1];
  }
  at(d) {
    d = Math.max(0, Math.min(this.total, d));
    let i = 1; while (i < this.cum.length - 1 && this.cum[i] < d) i++;
    const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
    const L = this.cum[i] - this.cum[i - 1] || 1, t = (d - this.cum[i - 1]) / L;
    return { x: ax + (bx - ax) * t, y: ay + (by - ay) * t, a: Math.atan2(by - ay, bx - ax) };
  }
  nearest(x, y) { // returns {d, x, y, dist}
    let best = { d: 0, x: 0, y: 0, dist: 1e9 };
    for (let i = 1; i < this.pts.length; i++) {
      const [ax, ay] = this.pts[i - 1], [bx, by] = this.pts[i];
      const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
      let t = l ? ((x - ax) * dx + (y - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
      const px = ax + dx * t, py = ay + dy * t, dd = Math.hypot(x - px, y - py);
      if (dd < best.dist) best = { d: this.cum[i - 1] + Math.sqrt(l) * t, x: px, y: py, dist: dd };
    }
    return best;
  }
}

// ---------- waves ----------
export function generateWaves(map) {
  if (map.waveList) return map.waveList.map((groups, i) => ({ n: i + 1, hpMult: map.hpMult || 1, groups: groups.map(g => ({ ...g })) }));
  const T = WAVE_TUNING, rng = mulberry32(hashStr(map.id + ':waves'));
  const waves = [];
  for (let w = 1; w <= map.waves; w++) {
    const avail = Object.keys(map.intro).filter(k => map.intro[k] <= w);
    const fresh = avail.filter(k => map.intro[k] === w && w > 1);
    let budget = (T.baseBudget + T.budgetPerWave * (w - 1)) * map.budgetMult;
    if (w % 5 === 0) budget *= 1.15; // pressure spike every 5th wave
    const hpMult = (1 + T.hpPerWave * (w - 1)) * map.hpMult;
    const k = Math.min(avail.length, 1 + (w > 2 ? 1 : 0) + (w > 7 && rng() < 0.6 ? 1 : 0));
    const picks = [...fresh];
    const pool = avail.filter(a => !picks.includes(a));
    while (picks.length < k && pool.length) picks.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
    // shares: featured type gets more
    const weights = picks.map((p, i) => (i === 0 ? 1.4 : 1) * (0.7 + rng() * 0.6));
    const wsum = weights.reduce((a, b) => a + b, 0);
    let groups = picks.map((type, i) => {
      const e = ENEMIES[type];
      const count = Math.max(1, Math.round((budget * weights[i] / wsum) / e.pts));
      return { type, count, gap: e.gap };
    });
    // order: tough first sometimes, swarms first otherwise
    if (rng() < 0.5) groups.reverse();
    let spawnSecs = groups.reduce((a, g) => a + g.count * g.gap, 0) + (groups.length - 1) * T.groupGap;
    if (spawnSecs > T.maxSpawnSecs) {
      const f = (T.maxSpawnSecs - (groups.length - 1) * T.groupGap) / (spawnSecs - (groups.length - 1) * T.groupGap);
      groups.forEach(g => { g.gap = Math.max(0.22, g.gap * f); });
    }
    waves.push({ n: w, hpMult, groups });
  }
  if (map.boss) {
    const w = map.waves + 1, hpMult = (1 + T.hpPerWave * (w - 1)) * map.hpMult;
    waves.push({ n: w, boss: true, hpMult, groups: [
      { type: 'orc', count: 8, gap: 0.7 },
      { type: 'ogre', count: 1, gap: 1, hp: map.bossHp },
      { type: 'brute', count: 4, gap: 1.2 },
      { type: 'shaman', count: 2, gap: 1.5 },
    ]});
  }
  return waves;
}

// ---------- tower stats ----------
export function baseStats(type, tier, branch) {
  const def = TOWERS[type];
  if (tier >= 4 && branch) return def.branches[branch];
  return def.tiers[Math.max(0, Math.min(2, tier - 1))];
}
export function computeStats(type, tier, branch, mods) {
  const def = TOWERS[type], s = { ...baseStats(type, tier, branch) };
  const fam = mods.dmgMult[def.family] || 1;
  if (s.dmg != null) s.dmg *= fam;
  if (s.auraDps != null) s.auraDps *= fam;
  s.range *= mods.rangeMult;
  if (s.slowDur) s.slowDur *= mods.slowDurMult;
  if (s.hp) { s.hp *= mods.soldierMult; s.dmg *= mods.soldierMult; }
  if (s.bow) s.bow = { ...s.bow, dmg: s.bow.dmg * mods.soldierMult };
  s.crit = (s.crit || 0) + mods.critChance;
  s.critMult = s.critMult || 2;
  s.dmgType = def.dmgType; s.air = def.air;
  return s;
}

const TARGET_MODES = ['first', 'last', 'strong', 'close'];
export { TARGET_MODES };

// ---------- game ----------
let _id = 1;
export class Game {
  constructor({ map, mods, snapshot = null, seed = null }) {
    this.map = typeof map === 'string' ? MAPS.find(m => m.id === map) : map;
    this.mods = mods;
    this.path = new Path(this.map.path);
    this.waves = generateWaves(this.map);
    this.totalWaves = this.waves.length;
    this.rng = mulberry32(seed ?? (Date.now() & 0xffffffff));
    this.time = 0;
    this.gold = this.map.startGold + mods.startGold;
    this.hearts = mods.startHearts;
    this.startHearts = mods.startHearts;
    this.kills = 0;
    this.waveIdx = 0;            // number of waves started
    this.state = 'ready';        // ready | running | won | lost
    this.nextWaveIn = 0;         // countdown (s) once current wave finished spawning
    this.spawnQueue = [];        // [{at, type, hp}]
    this.enemies = []; this.towers = []; this.projectiles = []; this.events = [];
    this.leaks = 0; this.seenTypes = new Set();
    if (snapshot) this._restore(snapshot);
  }

  // ----- info -----
  get displayWave() { return Math.min(this.waveIdx, this.map.waves); }
  get isBossWave() { return this.map.boss && this.waveIdx > this.map.waves; }
  canCallWave() { return (this.state === 'ready' || (this.state === 'running' && this.nextWaveIn > 0)) && this.waveIdx < this.totalWaves; }
  earlyBonus() { return this.state === 'running' && this.nextWaveIn > 0 ? Math.round(this.nextWaveIn * EARLY_GOLD_PER_SEC * this.mods.earlyMult) : 0; }
  nextWavePreview() {
    const w = this.waves[this.waveIdx]; if (!w) return null;
    const m = {}; w.groups.forEach(g => { m[g.type] = (m[g.type] || 0) + g.count; });
    return { n: w.n, boss: !!w.boss, list: Object.entries(m).map(([type, count]) => ({ type, count })) };
  }
  buildCost(type) { return Math.round(TOWERS[type].tiers[0].cost * (1 - this.mods.t1Discount)); }
  upgradeCost(t) {
    if (t.tier < 3) return TOWERS[t.type].tiers[t.tier].cost;
    return null; // tier 3 → choose a branch
  }
  branchCost(t, key) { return TOWERS[t.type].branches[key].cost; }
  sellValue(t) { return this.state === 'ready' ? t.spent : Math.floor(t.spent * this.mods.sellRefund); }
  towerAtSpot(i) { return this.towers.find(t => t.spot === i) || null; }

  // ----- actions -----
  callWave() {
    if (!this.canCallWave()) return false;
    const bonus = this.earlyBonus();
    if (bonus > 0) { this.gold += bonus; this.events.push({ t: 'early', gold: bonus }); }
    this._startWave();
    return true;
  }
  build(spot, type) {
    if (this.state === 'won' || this.state === 'lost') return false;
    if (this.towerAtSpot(spot)) return false;
    const cost = this.buildCost(type);
    if (this.gold < cost) return false;
    const [x, y] = this.map.spots[spot];
    this.gold -= cost;
    const t = { id: _id++, type, spot, x, y, tier: 1, branch: null, targeting: 'first', spent: cost, cd: 0.2, angle: -Math.PI / 2, anim: 0, soldiers: [] };
    this._refresh(t);
    this.towers.push(t);
    this.events.push({ t: 'build', x, y, type });
    return t;
  }
  upgrade(t) {
    const cost = this.upgradeCost(t); if (cost == null || this.gold < cost) return false;
    this.gold -= cost; t.spent += cost; t.tier++; this._refresh(t);
    this.events.push({ t: 'upgrade', x: t.x, y: t.y }); return true;
  }
  chooseBranch(t, key) {
    if (t.tier !== 3) return false;
    const cost = this.branchCost(t, key); if (this.gold < cost) return false;
    this.gold -= cost; t.spent += cost; t.tier = 4; t.branch = key; this._refresh(t);
    this.events.push({ t: 'upgrade', x: t.x, y: t.y, branch: true }); return true;
  }
  sell(t) {
    const v = this.sellValue(t);
    this._releaseSoldiers(t);
    this.towers = this.towers.filter(o => o !== t);
    this.gold += v; this.events.push({ t: 'sell', x: t.x, y: t.y, gold: v }); return v;
  }
  setTargeting(t, mode) { if (TARGET_MODES.includes(mode)) t.targeting = mode; }
  // Barracks: move rally point to the road point nearest (x,y). Must be in range. Returns true if moved.
  setRally(t, x, y) {
    if (t.type !== 'barracks') return false;
    const n = this.path.nearest(x, y);
    if (n.dist > 40 || Math.hypot(n.x - t.x, n.y - t.y) > t.stats.range) return false;
    t.rallyPick = { x: n.x, y: n.y }; this._setupSoldiers(t, true); return true;
  }

  // ----- snapshot (taken at wave start, before spawning) -----
  snapshot() {
    return {
      v: 1, mapId: this.map.id, wave: this.waveIdx, gold: this.gold, hearts: this.hearts, startHearts: this.startHearts,
      kills: this.kills, leaks: this.leaks,
      towers: this.towers.map(t => ({ spot: t.spot, type: t.type, tier: t.tier, branch: t.branch, targeting: t.targeting, spent: t.spent, rally: t.rallyPick || null })),
      enemies: this.enemies.filter(e => e.alive).map(e => ({ type: e.type, hp: Math.round(e.hp), maxHp: Math.round(e.maxHp), dist: Math.round(e.dist), off: e.off })),
      savedAt: Date.now(),
    };
  }
  _restore(s) {
    this.gold = s.gold; this.hearts = s.hearts; this.startHearts = s.startHearts || this.startHearts;
    this.kills = s.kills || 0; this.leaks = s.leaks || 0;
    for (const o of s.towers || []) {
      if (!TOWERS[o.type] || !this.map.spots[o.spot]) continue;
      const [x, y] = this.map.spots[o.spot];
      const t = { id: _id++, type: o.type, spot: o.spot, x, y, tier: o.tier, branch: o.branch, targeting: o.targeting || 'first', spent: o.spent, cd: 0.3, angle: -Math.PI / 2, anim: 1, soldiers: [], rallyPick: o.rally || null };
      this._refresh(t); this.towers.push(t);
    }
    for (const o of s.enemies || []) {
      if (!ENEMIES[o.type]) continue;
      const e = this._makeEnemy(o.type, 1, o.maxHp); e.hp = o.hp; e.dist = o.dist; e.off = o.off ?? e.off;
      this._place(e); e.px = e.x; e.py = e.y; this.enemies.push(e);
    }
    this.waveIdx = s.wave;
    this.state = 'ready';
    this._startWave(true); // the saved wave starts again from the top
  }

  // ----- internals -----
  _refresh(t) {
    t.stats = computeStats(t.type, t.tier, t.branch, this.mods);
    if (t.type === 'barracks') this._setupSoldiers(t);
  }
  _startWave(resumed = false) {
    const w = this.waves[this.waveIdx]; if (!w) return;
    if (!resumed) this.events.push({ t: 'waveStart', n: w.n, snapshot: this.snapshot() });
    else this.events.push({ t: 'waveStart', n: w.n, resumed: true, snapshot: this.snapshot() });
    this.state = 'running'; this.nextWaveIn = 0;
    let at = this.time + 0.4;
    for (const g of w.groups) {
      for (let i = 0; i < g.count; i++) { this.spawnQueue.push({ at, type: g.type, hpMult: w.hpMult, hp: g.hp }); at += g.gap; }
      at += WAVE_TUNING.groupGap;
    }
    this.spawnQueue.sort((a, b) => a.at - b.at);
    this.waveIdx++;
  }
  _makeEnemy(type, hpMult, fixedHp) {
    const d = ENEMIES[type];
    const maxHp = fixedHp || Math.round(d.hp * hpMult);
    const offMax = d.flying ? 16 : d.boss ? 2 : 9;
    return { id: _id++, type, def: d, hp: maxHp, maxHp, dist: 0, off: (this.rng() * 2 - 1) * offMax, x: 0, y: 0, a: 0,
      slow: 0, slowUntil: 0, frozenUntil: 0, burnDps: 0, burnUntil: 0, blockedBy: null, atkCd: 1, healCd: d.heal ? d.heal.every : 0,
      alive: true, flash: 0, flying: !!d.flying, boss: !!d.boss, walk: this.rng() * 10 };
  }
  _place(e) {
    const p = this.path.at(e.dist);
    e.x = p.x + Math.cos(p.a + Math.PI / 2) * e.off; e.y = p.y + Math.sin(p.a + Math.PI / 2) * e.off; e.a = p.a;
  }
  _setupSoldiers(t, keepHp = false) {
    const s = t.stats, old = t.soldiers || [];
    const near = this.path.nearest(t.x, t.y);
    t.rally = t.rallyPick ? { ...t.rallyPick } : { x: near.x, y: near.y };
    const offs = [[0, -12], [-12, 9], [12, 9]];
    t.soldiers = [];
    for (let i = 0; i < s.soldiers; i++) {
      const prev = old[i];
      const hx = t.rally.x + offs[i][0], hy = t.rally.y + offs[i][1];
      t.soldiers.push({ id: _id++, i, x: prev && !prev.dead ? prev.x : t.x, y: prev && !prev.dead ? prev.y : t.y, hx, hy,
        hp: keepHp && prev ? Math.min(s.hp, prev.hp) : s.hp, maxHp: s.hp, dead: keepHp && prev ? prev.dead : false, respawn: keepHp && prev ? prev.respawn : 0, target: null, atkCd: 0.5, bowCd: 0.5, anim: 0 });
      if (prev && prev.target && prev.target.blockedBy === prev) prev.target.blockedBy = null;
    }
  }
  _releaseSoldiers(t) { for (const so of t.soldiers || []) if (so.target && so.target.blockedBy === so) so.target.blockedBy = null; }

  damage(e, amount, type, opts = {}) {
    if (!e.alive) return 0;
    let dmg = amount;
    if (type === 'phys') dmg *= 1 - e.def.armor;
    else if (type === 'magic') dmg *= 1 - e.def.mr;
    if (e.boss) dmg *= this.mods.bossDmgMult;
    e.hp -= dmg; e.flash = 0.08;
    if (e.hp <= 0) this._kill(e);
    return dmg;
  }
  _kill(e) {
    e.alive = false;
    if (e.blockedBy) { e.blockedBy.target = null; e.blockedBy = null; }
    const g = Math.round(e.def.gold * this.mods.killGoldMult);
    this.gold += g; this.kills++;
    this.events.push({ t: 'death', x: e.x, y: e.y, a: e.a, type: e.type, gold: g, flying: e.flying, boss: e.boss, face: e.face });
  }
  _targets(t, range, air, from = t) {
    const r2 = range * range, out = [];
    for (const e of this.enemies) if (e.alive && (air || !e.flying) && dist2(from.x, from.y, e.x, e.y) <= r2) out.push(e);
    return out;
  }
  _pick(list, mode, t) {
    if (!list.length) return null;
    let best = list[0];
    for (const e of list) {
      if (mode === 'first' ? e.dist > best.dist : mode === 'last' ? e.dist < best.dist
        : mode === 'strong' ? e.hp > best.hp : dist2(t.x, t.y, e.x, e.y) < dist2(t.x, t.y, best.x, best.y)) best = e;
    }
    return best;
  }
  _sortBy(list, mode, t) {
    const key = mode === 'first' ? e => -e.dist : mode === 'last' ? e => e.dist : mode === 'strong' ? e => -e.hp : e => dist2(t.x, t.y, e.x, e.y);
    return list.slice().sort((a, b) => key(a) - key(b));
  }
  _rollDmg(s, base) {
    if (s.crit > 0 && this.rng() < s.crit) return { dmg: base * s.critMult, crit: true };
    return { dmg: base, crit: false };
  }
  _predict(e, secs) {
    if (e.blockedBy || this.time < e.frozenUntil) return { x: e.x, y: e.y };
    const sp = e.def.speed * (1 - (this.time < e.slowUntil ? e.slow : 0));
    const p = this.path.at(e.dist + sp * secs);
    return { x: p.x + Math.cos(p.a + Math.PI / 2) * e.off, y: p.y + Math.sin(p.a + Math.PI / 2) * e.off };
  }

  step(dt = TICK) {
    if (this.state !== 'running') return;
    this.time += dt;
    for (const e of this.enemies) { e.px = e.x; e.py = e.y; }
    for (const p of this.projectiles) { p.px = p.x; p.py = p.y; p.ph = p.h; }
    for (const t of this.towers) if (t.soldiers) for (const so of t.soldiers) { so.px = so.x; so.py = so.y; }
    // spawns
    while (this.spawnQueue.length && this.spawnQueue[0].at <= this.time) {
      const q = this.spawnQueue.shift();
      const e = this._makeEnemy(q.type, q.hpMult, q.hp); this._place(e); e.px = e.x; e.py = e.y; this.enemies.push(e);
      if (!this.seenTypes.has(e.type)) { this.seenTypes.add(e.type); this.events.push({ t: 'firstSpawn', type: e.type }); }
      if (e.boss) this.events.push({ t: 'boss', x: e.x, y: e.y });
    }
    if (!this.spawnQueue.length && this.nextWaveIn <= 0 && this.waveIdx < this.totalWaves && !this._breakStarted) {
      this.nextWaveIn = WAVE_BREAK; this._breakStarted = true;
    }
    if (this.nextWaveIn > 0) {
      this.nextWaveIn -= dt;
      if (this.nextWaveIn <= 0) { this.nextWaveIn = 0; this._startWave(); }
    }
    if (this.spawnQueue.length) this._breakStarted = false;

    this._updateEnemies(dt);
    for (const t of this.towers) this._updateTower(t, dt);
    this._updateProjectiles(dt);
    this.enemies = this.enemies.filter(e => e.alive);

    if (this.hearts <= 0) { this.hearts = 0; this.state = 'lost'; this.events.push({ t: 'lose' }); return; }
    if (this.waveIdx >= this.totalWaves && !this.spawnQueue.length && !this.enemies.length) {
      this.state = 'won'; this.events.push({ t: 'win' });
    }
  }

  _updateEnemies(dt) {
    const now = this.time;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.flash > 0) e.flash -= dt;
      if (now < e.burnUntil) { this.damage(e, e.burnDps * dt, 'true'); if (!e.alive) continue; }
      if (e.def.heal) {
        e.healCd -= dt;
        if (e.healCd <= 0) {
          e.healCd = e.def.heal.every; const r2 = e.def.heal.radius ** 2; let any = false;
          for (const o of this.enemies) if (o.alive && !o.boss && o.hp < o.maxHp && dist2(e.x, e.y, o.x, o.y) <= r2) { o.hp = Math.min(o.maxHp, o.hp + o.maxHp * e.def.heal.pct); any = true; }
          if (any) this.events.push({ t: 'heal', x: e.x, y: e.y, r: e.def.heal.radius });
        }
      }
      const frozen = now < e.frozenUntil;
      // fighting a soldier
      const so = e.blockedBy;
      if (so && (so.dead || so.target !== e)) e.blockedBy = null;
      if (e.blockedBy) {
        if (!frozen) {
          e.atkCd -= dt;
          if (e.atkCd <= 0) { e.atkCd = 1; this._hitSoldier(e.blockedBy, e.def.atk); }
        }
        e.walk += dt * 2;
        continue;
      }
      if (frozen) continue;
      const slow = now < e.slowUntil ? e.slow : 0;
      e.dist += e.def.speed * (1 - slow) * dt;
      e.walk += dt * (1 - slow) * (e.def.speed / 10);
      if (e.dist >= this.path.total) {
        e.alive = false;
        const cost = e.boss ? Math.max(1, e.def.hearts - this.mods.bossHeartReduce) : e.def.hearts;
        this.hearts -= cost; this.leaks += cost;
        this.events.push({ t: 'leak', hearts: cost, boss: e.boss, x: e.x, y: e.y });
        continue;
      }
      this._place(e);
    }
  }
  _hitSoldier(so, atk) {
    if (so.dead) return;
    const t = so.tower;
    so.hp -= atk * (1 - (so.armor || 0)); so.flash = 0.1;
    if (so.hp <= 0) {
      so.dead = true; so.respawn = so.respawnTime || 10;
      if (so.target && so.target.blockedBy === so) so.target.blockedBy = null;
      so.target = null;
      this.events.push({ t: 'soldierDown', x: so.x, y: so.y });
    }
  }

  _updateTower(t, dt) {
    const s = t.stats; t.anim += dt;
    if (t.type === 'barracks') return this._updateBarracks(t, dt);
    t.cd -= dt;
    if (s.aura) { // Blizzard
      if (t.cd <= 0) {
        t.cd = s.cd;
        const list = this._targets(t, s.range, true);
        for (const e of list) { this._applySlow(e, s.slow, s.slowDur); this.damage(e, s.auraDps * s.cd, 'magic'); }
        if (list.length) t.firing = 0.3;
      }
      if (t.firing > 0) t.firing -= dt;
      return;
    }
    if (t.firing > 0) t.firing -= dt;
    if (t.cd > 0) return;
    const list = this._targets(t, s.range, s.air);
    if (!list.length) return;
    const target = this._pick(list, t.targeting, t);
    t.cd = s.cd; t.firing = 0.18;
    t.angle = Math.atan2(target.y - t.y, target.x - t.x);
    const top = { x: t.x, y: t.y - 22 };
    switch (t.type) {
      case 'archer': {
        const targets = s.multishot ? this._sortBy(list, t.targeting, t).slice(0, s.multishot) : [target];
        for (const e of targets) {
          const r = this._rollDmg(s, s.dmg);
          this.projectiles.push({ kind: 'arrow', x: top.x, y: top.y, target: e, speed: 460, dmg: r.dmg, crit: r.crit, dmgType: 'phys', tx: e.x, ty: e.y });
        }
        this.events.push({ t: 'shoot', kind: 'arrow', x: t.x, y: t.y });
        break;
      }
      case 'mage': {
        const r = this._rollDmg(s, s.dmg);
        if (s.chain) {
          const hit = [target]; let cur = target, amt = r.dmg;
          const pts = [[top.x, top.y - 6], [target.x, target.y]];
          this.damage(target, amt, 'magic');
          for (let i = 0; i < s.chain; i++) {
            amt *= s.chainFalloff;
            let nb = null, bd = s.chainRange * s.chainRange;
            for (const e of this.enemies) { if (!e.alive || hit.includes(e)) continue; const d = dist2(cur.x, cur.y, e.x, e.y); if (d < bd) { bd = d; nb = e; } }
            if (!nb) break;
            hit.push(nb); pts.push([nb.x, nb.y]); this.damage(nb, amt, 'magic'); cur = nb;
          }
          this.events.push({ t: 'chain', pts }); this.events.push({ t: 'shoot', kind: 'zap', x: t.x, y: t.y });
        } else {
          this.projectiles.push({ kind: s.dmg > 80 ? 'bigorb' : 'orb', x: top.x, y: top.y - 6, target, speed: 270, dmg: r.dmg, crit: r.crit, dmgType: 'magic', tx: target.x, ty: target.y });
          this.events.push({ t: 'shoot', kind: 'magic', x: t.x, y: t.y });
        }
        break;
      }
      case 'bombard': {
        const flight = 0.75 + Math.hypot(target.x - t.x, target.y - t.y) / 600;
        const p = this._predict(target, flight);
        const r = this._rollDmg(s, s.dmg);
        this.projectiles.push({ kind: 'shell', x: t.x, y: t.y - 14, sx: t.x, sy: t.y - 14, tx: p.x, ty: p.y, t: 0, dur: flight, dmg: r.dmg, splash: s.splash, burn: s.burn, burnDur: s.burnDur, big: s.splash > 60 });
        this.events.push({ t: 'shoot', kind: 'cannon', x: t.x, y: t.y, mx: s.splash > 60 ? t.x : t.x + Math.cos(t.angle) * 22, my: s.splash > 60 ? t.y - 30 : t.y - 10 + Math.sin(t.angle) * 22 });
        break;
      }
      case 'frost': {
        const r = this._rollDmg(s, s.dmg);
        this.projectiles.push({ kind: 'shard', x: top.x, y: top.y - 4, target, speed: 330, dmg: r.dmg, dmgType: 'magic', slow: s.slow, slowDur: s.slowDur, freezeChance: s.freezeChance || 0, freezeDur: s.freezeDur || 0, tx: target.x, ty: target.y });
        this.events.push({ t: 'shoot', kind: 'frost', x: t.x, y: t.y });
        break;
      }
      case 'ballista': {
        const lead = this._predict(target, Math.hypot(target.x - t.x, target.y - t.y) / 720);
        const ang = Math.atan2(lead.y - t.y, lead.x - t.x); t.angle = ang;
        const r = this._rollDmg(s, s.dmg);
        this.projectiles.push({ kind: 'bolt', x: t.x, y: t.y - 10, vx: Math.cos(ang) * 720, vy: Math.sin(ang) * 720, left: s.range * 1.2, dmg: r.dmg, crit: r.crit, bonus: s.bonusVsBossAir || 1, hit: new Set(), ang });
        this.events.push({ t: 'shoot', kind: 'bolt', x: t.x, y: t.y });
        break;
      }
    }
  }

  _updateBarracks(t, dt) {
    const s = t.stats, rally = t.rally, engage2 = 50 * 50;
    for (const so of t.soldiers) {
      so.tower = t; so.armor = s.armor; so.respawnTime = s.respawn; so.anim += dt;
      if (so.flash > 0) so.flash -= dt;
      if (so.dead) {
        so.respawn -= dt;
        if (so.respawn <= 0) { so.dead = false; so.hp = so.maxHp; so.x = t.x; so.y = t.y + 6; so.target = null; }
        continue;
      }
      // regen when idle
      if (!so.target && so.hp < so.maxHp) so.hp = Math.min(so.maxHp, so.hp + so.maxHp * 0.08 * dt);
      if (so.target && (!so.target.alive || so.target.flying || dist2(rally.x, rally.y, so.target.x, so.target.y) > engage2 * 2.2)) {
        if (so.target.blockedBy === so) so.target.blockedBy = null; so.target = null;
      }
      if (!so.target) {
        let best = null, bestScore = 1e9;
        for (const e of this.enemies) {
          if (!e.alive || e.flying) continue;
          const d = dist2(rally.x, rally.y, e.x, e.y); if (d > engage2) continue;
          const taken = e.blockedBy && e.blockedBy !== so ? 1e6 : 0;
          const score = taken - e.dist;
          if (score < bestScore) { bestScore = score; best = e; }
        }
        if (best) so.target = best;
      }
      let gx = so.hx, gy = so.hy;
      if (so.target) {
        const e = so.target; const ang = Math.atan2(so.y - e.y, so.x - e.x);
        gx = e.x + Math.cos(ang) * 13; gy = e.y + Math.sin(ang) * 13;
      }
      const dx = gx - so.x, dy = gy - so.y, dd = Math.hypot(dx, dy), sp = 85 * dt;
      if (dd > 1) { so.x += dx / dd * Math.min(sp, dd); so.y += dy / dd * Math.min(sp, dd); so.moving = true; } else so.moving = false;
      if (so.target) {
        const e = so.target, close = dist2(so.x, so.y, e.x, e.y) < 20 * 20;
        if (close) {
          if (!e.blockedBy) e.blockedBy = so;
          so.atkCd -= dt;
          if (so.atkCd <= 0) { so.atkCd = s.cd; this.damage(e, s.dmg, 'phys'); so.swing = 0.2; this.events.push({ t: 'clash', x: e.x, y: e.y }); if (!e.alive) so.target = null; }
        }
      }
      if (so.swing > 0) so.swing -= dt;
      if (s.bow && (!so.target || dist2(so.x, so.y, so.target.x, so.target.y) > 22 * 22)) {
        so.bowCd -= dt;
        if (so.bowCd <= 0) {
          const list = this._targets(so, s.bow.range, true, so);
          if (list.length) {
            const e = this._pick(list, 'first', so); so.bowCd = s.bow.cd;
            this.projectiles.push({ kind: 'arrow', x: so.x, y: so.y - 6, target: e, speed: 420, dmg: s.bow.dmg, dmgType: 'phys', tx: e.x, ty: e.y, small: true });
          }
        }
      }
    }
  }

  _applySlow(e, amt, dur) {
    if (this.time < e.slowUntil && e.slow > amt) { e.slowUntil = Math.max(e.slowUntil, this.time + dur * 0.5); return; }
    e.slow = e.boss ? amt * 0.6 : amt; e.slowUntil = Math.max(e.slowUntil, this.time + dur);
  }

  _updateProjectiles(dt) {
    const keep = [];
    for (const p of this.projectiles) {
      if (p.kind === 'shell') {
        p.t += dt; const k = Math.min(1, p.t / p.dur);
        p.x = p.sx + (p.tx - p.sx) * k; p.y = p.sy + (p.ty - p.sy) * k; p.h = Math.sin(k * Math.PI) * (40 + p.dur * 30);
        if (k >= 1) {
          const r2 = p.splash * p.splash;
          for (const e of this.enemies) {
            if (!e.alive || e.flying) continue;
            const d2 = dist2(p.tx, p.ty, e.x, e.y); if (d2 > r2) continue;
            const fall = 1 - 0.5 * Math.sqrt(d2) / p.splash;
            this.damage(e, p.dmg * fall, 'phys');
            if (p.burn && e.alive) { e.burnDps = p.burn; e.burnUntil = this.time + p.burnDur; }
          }
          this.events.push({ t: 'boom', x: p.tx, y: p.ty, r: p.splash, fire: !!p.burn, big: p.big });
          continue;
        }
        keep.push(p); continue;
      }
      if (p.kind === 'bolt') {
        const nx = p.x + p.vx * dt, ny = p.y + p.vy * dt;
        for (const e of this.enemies) {
          if (!e.alive || p.hit.has(e.id)) continue;
          if (segDist(e.x, e.y, p.x, p.y, nx, ny) <= 10 + e.def.size * 0.5) {
            p.hit.add(e.id);
            const mult = (e.boss || e.flying) ? p.bonus : 1;
            this.damage(e, p.dmg * mult, 'phys');
            this.events.push({ t: 'hit', kind: 'bolt', x: e.x, y: e.y });
          }
        }
        p.x = nx; p.y = ny; p.left -= Math.hypot(p.vx, p.vy) * dt;
        if (p.left > 0) keep.push(p);
        continue;
      }
      // homing
      const e = p.target;
      if (e && e.alive) { p.tx = e.x; p.ty = e.y - (e.flying ? 14 : 4); }
      const dx = p.tx - p.x, dy = p.ty - p.y, d = Math.hypot(dx, dy), stepLen = p.speed * dt;
      p.ang = Math.atan2(dy, dx);
      if (d <= stepLen + 2) {
        if (e && e.alive) {
          this.damage(e, p.dmg, p.dmgType);
          if (p.kind === 'shard' && e.alive) {
            this._applySlow(e, p.slow, p.slowDur);
            if (p.freezeChance && !e.boss && this.rng() < p.freezeChance) { e.frozenUntil = this.time + p.freezeDur; this.events.push({ t: 'freeze', x: e.x, y: e.y }); }
          }
          this.events.push({ t: 'hit', kind: p.kind, x: p.tx, y: p.ty, crit: p.crit });
        }
        continue;
      }
      p.x += dx / d * stepLen; p.y += dy / d * stepLen;
      keep.push(p);
    }
    this.projectiles = keep;
  }
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l = dx * dx + dy * dy;
  let t = l ? ((px - ax) * dx + (py - ay) * dy) / l : 0; t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - (ax + dx * t), py - (ay + dy * t));
}
