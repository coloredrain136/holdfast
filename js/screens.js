// Menu screens: Home, Campaign, Skills, Towers (codex), Settings, Results.
import { MAPS, TOWERS, TOWER_ORDER, FUTURE_TOWERS, ENEMIES, ENEMY_ORDER, SKILLS, SKILL_BRANCH_ORDER, TIER_INFO, BIOMES, APP_VERSION } from './config.js';
import { levelInfo, pointsAvailable, nodeState, skillRank, findNode, mapUnlocked, totalStars, towerUnlocked } from './progress.js';
import { iconURL, drawWorldMap, WORLD_NODES, WORLD_BANDS } from './render.js';
import { $, esc, ICON, toast, modal, bottomSheet, fmt } from './ui.js';

let app, act;
export function initScreens(appRef, actions) { app = appRef; act = actions; }

const root = () => $('screen');
function mount(html, onAct, dim = true) {
  const el = root();
  el.className = dim ? 'dim' : '';
  el.innerHTML = html;
  el.onclick = e => { const b = e.target.closest('[data-act]'); if (b) { act.sfx.tap(); onAct(b.dataset.act, b.dataset, b); } };
}
const topbar = (title, right = '') => `<div class="topbar"><button class="btn btn-icon glass" data-act="back" aria-label="Back">${ICON.back}</button><h2 class="display">${title}</h2>${right}</div>`;

export function renderScreen(name, params) {
  ({ home, campaign, skills, towers, settings, results }[name] || home)(params);
}

// ---------------- Home ----------------
function home() {
  const s = app.save, lv = levelInfo(s.xp), pts = pointsAvailable(s), run = s.run;
  const runMap = run && MAPS.find(m => m.id === run.mapId);
  const runCard = runMap ? `
    <div class="card glass" style="margin-top:12px">
      <div class="row"><div class="grow"><div class="label-s" style="margin:0 0 2px">Run in progress</div>
        <div style="font-weight:800;font-size:17px">${esc(runMap.name)}</div>
        <div class="muted" style="font-size:13px;margin-top:2px">${run.wave >= runMap.waves ? 'Boss wave' : `Wave ${run.wave + 1}/${runMap.waves}`} · ${ICON.heart.replace('class="ico"', 'class="ico" style="width:13px;height:13px;vertical-align:-2px"')} ${run.hearts} · ${ICON.coin.replace('class="ico"', 'class="ico" style="width:13px;height:13px;vertical-align:-2px"')} ${fmt(run.gold)}</div></div>
      </div>
      <div class="row" style="margin-top:10px"><button class="btn btn-gold grow" data-act="continue">Continue run</button><button class="btn" data-act="abandon">Abandon</button></div>
    </div>` : '';
  mount(`<div class="scr">
    <div class="title"><h1>Holdfast</h1><div class="tag">Hold the line</div></div>
    <div class="card glass lvl"><div class="badge"><small>LV</small><b>${lv.level}</b></div>
      <div style="flex:1"><div class="row"><div class="grow" style="font-weight:800">Level ${lv.level}</div><div class="gold" style="font-weight:800;display:flex;align-items:center;gap:4px">${ICON.star(true, 16)} ${totalStars(s)}/${MAPS.length * 3}</div></div>
      <div class="xpbar"><i style="width:${(100 * lv.into / lv.need).toFixed(1)}%"></i></div>
      <div class="faint" style="font-size:12px;margin-top:4px">${fmt(lv.into)} / ${fmt(lv.need)} XP to level ${lv.level + 1}</div></div></div>
    ${runCard}
    <div style="flex:1;min-height:16px"></div>
    <div class="menu">
      <button class="btn wide ${runMap ? 'glass' : 'btn-gold'}" data-act="campaign"><span>Campaign</span><small>${Object.values(s.maps).filter(m => m.wins).length}/${MAPS.length} maps beaten</small></button>
      <button class="btn glass" data-act="skills">Skills<small>Skill tree</small>${pts > 0 ? `<span class="dot">${pts}</span>` : ''}</button>
      <button class="btn glass" data-act="towers">Codex<small>Towers & foes</small></button>
      <button class="btn glass wide" data-act="settings" style="min-height:52px;font-size:16px">Settings</button>
    </div></div>`, a => {
    if (a === 'continue') act.startMap(run.mapId, { resume: true });
    if (a === 'abandon') modal({ title: 'Abandon this run?', text: `Your saved run on ${runMap.name} will be deleted. No XP is awarded.`, actions: [{ label: 'Abandon run', cls: 'btn-red', onClick: () => { s.run = null; act.save.write(); home(); } }, { label: 'Keep it' }] });
    if (a === 'campaign') act.showScreen('campaign');
    if (a === 'skills') act.showScreen('skills');
    if (a === 'towers') act.showScreen('towers');
    if (a === 'settings') act.showScreen('settings');
  });
}

// ---------------- Campaign ----------------
function campaign() {
  const s = app.save;
  let nextIdx = MAPS.findIndex((m, i) => mapUnlocked(s, i) && !(s.maps[m.id] && s.maps[m.id].wins));
  const nodes = MAPS.map((m, i) => {
    const [x, y] = WORLD_NODES[i], rec = s.maps[m.id] || {}, unlocked = mapUnlocked(s, i);
    const st = [0, 1, 2].map(k => k < (rec.stars || 0) ? '★' : '☆').join('');
    const cls = ['node', 'glass-strong', !unlocked ? 'locked' : '', rec.wins ? 'done' : '', i === nextIdx ? 'next' : ''].join(' ');
    return `<button class="${cls}" data-act="node" data-i="${i}" style="left:${x * 100}%;top:${y * 100}%;animation-delay:${i * 40}ms">
      ${unlocked ? `<div class="tl">${TIER_INFO[m.tier].letter}</div><div class="st">${st}</div>` : `${ICON.lock.replace('class="ico"', 'class="ico" style="width:28px;height:28px"')}`}
      <div class="nl">${esc(m.name)}</div></button>`;
  }).join('');
  const tags = WORLD_BANDS.map(b => `<div class="biome-tag" style="top:calc(${b.y0 * 100}% + 10px)">${BIOMES[b.biome].name}</div>`).join('');
  mount(`<div class="scr">${topbar('Campaign', `<div class="pill glass gold">${ICON.star(true, 16)} ${totalStars(s)}</div>`)}
    <div class="world" id="world"><canvas id="worldcv"></canvas>${tags}${nodes}</div></div>`, (a, d) => {
    if (a === 'back') act.showScreen('home');
    if (a === 'node') mapSheet(+d.i);
  });
  requestAnimationFrame(() => {
    const w = $('world'), c = $('worldcv'); if (!w || !c) return;
    const r = w.getBoundingClientRect(), dpr = Math.min(3, devicePixelRatio || 1);
    c.width = r.width * dpr; c.height = r.height * dpr;
    const ctx = c.getContext('2d'); ctx.setTransform(dpr, 0, 0, dpr, 0, 0); drawWorldMap(ctx, r.width, r.height);
  });
}
function estMinutes(m) { return m.tier === 'short' ? '4–6' : m.tier === 'medium' ? '10–15' : '20–25'; }
function mapSheet(i) {
  const s = app.save, m = MAPS[i], rec = s.maps[m.id] || {}, unlocked = mapUnlocked(s, i);
  const run = s.run, hasRunHere = run && run.mapId === m.id, hasRunElse = run && run.mapId !== m.id;
  const otherName = hasRunElse ? MAPS.find(x => x.id === run.mapId).name : '';
  const tier = TIER_INFO[m.tier];
  const html = `
    <div class="row"><span class="chip">${BIOMES[m.biome].name}</span><span class="chip" style="background:rgba(255,255,255,.08);color:var(--text-2);border-color:var(--glass-border)">${tier.label}</span></div>
    <h3 class="display" style="margin:10px 0 4px">${esc(m.name)}</h3>
    <div class="muted" style="font-size:14px">${m.waves} waves${m.boss ? ' + boss' : ''} · about ${estMinutes(m)} min</div>
    <div class="row" style="margin:12px 0">${[0, 1, 2].map(k => ICON.star(k < (rec.stars || 0), 26)).join('')}
      <div class="grow faint" style="font-size:12px;text-align:right">${rec.plays ? `Played ${rec.plays}× · best ${rec.bestHearts || 0}♥` : 'Not played yet'}<br>3★ = 18+ hearts left</div></div>
    ${!unlocked ? `<div class="muted" style="margin-bottom:12px">Beat <b>${esc(MAPS[i - 1].name)}</b> to unlock.</div>` : ''}
    <div class="stack">
      ${hasRunHere ? `<button class="btn btn-gold btn-block" data-a="resume">Continue saved run</button>` : ''}
      <button class="btn ${hasRunHere ? '' : 'btn-gold'} btn-block" data-a="play" ${unlocked ? '' : 'disabled'}>${hasRunHere ? 'Start over' : 'Play'}</button>
      <button class="btn btn-block" data-a="close">Close</button>
    </div>`;
  bottomSheet(html, (el, close) => el.addEventListener('click', e => {
    const b = e.target.closest('[data-a]'); if (!b) return; act.sfx.tap();
    if (b.dataset.a === 'close') close();
    if (b.dataset.a === 'resume') { close(); act.startMap(m.id, { resume: true }); }
    if (b.dataset.a === 'play') {
      close();
      if (run) modal({ title: 'Start a new run?', text: hasRunHere ? 'Your saved run on this map will be replaced.' : `Your saved run on ${otherName} will be lost.`, actions: [{ label: 'Start new run', cls: 'btn-gold', onClick: () => act.startMap(m.id) }, { label: 'Cancel' }] });
      else act.startMap(m.id);
    }
  }));
}

// ---------------- Skills ----------------
function skills() {
  const s = app.save, pts = pointsAvailable(s);
  const cols = SKILL_BRANCH_ORDER.map(bk => {
    const b = SKILLS[bk];
    const items = b.nodes.map((n, i) => {
      const r = skillRank(s.skills, n.id), st = nodeState(s, n.id);
      const prevOn = i === 0 || skillRank(s.skills, b.nodes[i - 1].id) > 0;
      return `${i ? `<div class="link ${prevOn ? 'on' : ''}"></div>` : ''}<button class="snode ${st} ${r >= n.max ? 'maxed' : ''}" data-act="node" data-id="${n.id}">
        <div class="sn">${esc(n.name)}</div><div class="pips">${Array.from({ length: n.max }, (_, k) => `<i class="${k < r ? 'on' : ''}"></i>`).join('')}</div></button>`;
    }).join('');
    return `<div class="branchcol glass" style="--c:${b.color}"><div class="bt" style="color:${b.color}">${b.name}</div>${items}</div>`;
  }).join('');
  mount(`<div class="scr">${topbar('Skills', `<div class="pill glass ${pts ? 'gold' : 'muted'}">${pts} point${pts === 1 ? '' : 's'}</div>`)}
    <div class="scroll"><div class="tree">${cols}</div>
    <div class="faint" style="font-size:12.5px;text-align:center;margin:12px 8px 4px">Earn 1 point per account level. Learn skills top to bottom in each branch.</div></div>
    <button class="btn glass btn-block" data-act="respec" style="margin-top:10px">Respec (free)</button></div>`, (a, d) => {
    if (a === 'back') act.showScreen('home');
    if (a === 'node') skillSheet(d.id);
    if (a === 'respec') {
      if (!Object.values(s.skills).some(Boolean)) { toast('No points spent yet'); return; }
      modal({ title: 'Reset all skills?', text: 'Every point comes back so you can rebuild your tree. It’s free.', actions: [{ label: 'Respec', cls: 'btn-gold', onClick: () => { s.skills = {}; act.save.write(); act.sfx.sell(); skills(); toast('Skill points refunded'); } }, { label: 'Cancel' }] });
    }
  });
}
function skillSheet(id) {
  const s = app.save, f = findNode(id), n = f.node, r = skillRank(s.skills, id), st = nodeState(s, id), b = SKILLS[f.branch];
  const reason = { locked: `Learn ${SKILLS[f.branch].nodes[f.index - 1]?.name} first`, nopoints: 'No skill points — level up to earn more', maxed: 'Maxed out' }[st];
  bottomSheet(`
    <div class="chip" style="color:${b.color};border-color:${b.color}55;background:${b.color}22">${b.name}</div>
    <h3 class="display" style="margin:10px 0 2px">${esc(n.name)}</h3>
    <div class="muted" style="font-size:14px">Rank ${r} / ${n.max}</div>
    <div class="stack" style="margin:14px 0">
      <div class="card" style="background:rgba(0,0,0,.25)"><div class="label-s" style="margin:0 0 4px">Now</div>${r ? esc(n.desc(r)) : '<span class="faint">Not learned</span>'}</div>
      ${r < n.max ? `<div class="card" style="background:rgba(0,0,0,.25)"><div class="label-s" style="margin:0 0 4px">Next rank</div>${esc(n.desc(r + 1))}</div>` : ''}
    </div>
    <div class="stack">${st === 'ok' ? `<button class="btn btn-gold btn-block" data-a="buy">Learn · 1 point</button>` : `<div class="muted" style="text-align:center;font-size:14px">${reason}</div>`}
    <button class="btn btn-block" data-a="close">Close</button></div>`, (el, close) => el.addEventListener('click', e => {
    const bt = e.target.closest('[data-a]'); if (!bt) return;
    if (bt.dataset.a === 'close') { act.sfx.tap(); close(); }
    if (bt.dataset.a === 'buy' && nodeState(s, id) === 'ok') { s.skills[id] = r + 1; act.save.write(); act.sfx.upgrade(); close(); skills(); }
  }));
}

// ---------------- Codex ----------------
let codexTab = 'towers'; const open = new Set();
function towers() {
  const lv = levelInfo(app.save.xp).level;
  const pct = v => Math.round(v * 100) + '%';
  let body = '';
  if (codexTab === 'towers') {
    body = TOWER_ORDER.map(id => {
      const d = TOWERS[id], unlocked = towerUnlocked(lv, id), isOpen = open.has(id);
      const bar = id === 'barracks';
      const rows = d.tiers.map((t, i) => bar
        ? `<tr><td>${i + 1}</td><td>${t.cost}</td><td>${t.hp}</td><td>${t.dmg}</td><td>${pct(t.armor)}</td></tr>`
        : `<tr><td>${i + 1}</td><td>${t.cost}</td><td>${t.dmg}${t.splash ? ` <span class="faint">(${t.splash})</span>` : ''}</td><td>${(1 / t.cd).toFixed(1)}</td><td>${t.range}</td></tr>`).join('');
      const head = bar ? '<tr><th>Tier</th><th>Cost</th><th>HP</th><th>Dmg</th><th>Armor</th></tr>' : '<tr><th>Tier</th><th>Cost</th><th>Dmg</th><th>/sec</th><th>Range</th></tr>';
      const br = Object.entries(d.branches).map(([k, b]) => `<div class="branch"><div class="bh"><img src="${iconURL('tower', id, { tier: 4, branch: k, px: 68 })}" alt=""><div><div class="bn">${esc(b.name)}</div><div class="faint" style="font-size:12px">${b.cost} gold</div></div></div><div class="bd">${esc(b.desc)}</div></div>`).join('');
      return `<div class="tcard glass ${unlocked ? '' : 'locked'}">
        <button class="th" data-act="toggle" data-id="${id}" style="width:100%;text-align:left"><img src="${iconURL('tower', id, { tier: 3, px: 112 })}" alt="">
          <div style="flex:1"><div class="nm">${esc(d.name)}</div><div class="muted" style="font-size:13px">${esc(d.role)}${d.air ? ' · hits air' : ' · ground only'}</div>
          <div style="margin-top:4px">${unlocked ? '<span class="chip" style="background:rgba(122,212,106,.15);color:#a8f09a;border-color:rgba(122,212,106,.35)">Unlocked</span>' : `<span class="chip">${ICON.lock.replace('class="ico"', 'class="ico" style="width:13px;height:13px"')} Unlocks at Lv ${d.unlock}</span>`}</div></div>
          <span class="faint" style="font-size:20px">${isOpen ? '–' : '+'}</span></button>
        ${isOpen ? `<div class="muted" style="font-size:13.5px;margin-top:10px">${esc(d.blurb)}</div><table class="tt">${head}${rows}</table><div class="label-s">Tier 4 · pick one</div><div class="branches">${br}</div>` : ''}
      </div>`;
    }).join('') + FUTURE_TOWERS.map(f => `<div class="tcard glass locked" style="opacity:.6"><div class="th"><div style="width:56px;height:56px;display:flex;align-items:center;justify-content:center;border-radius:14px;background:rgba(0,0,0,.25)">${ICON.lock.replace('class="ico"', 'class="ico" style="width:24px;height:24px"')}</div>
      <div style="flex:1"><div class="nm">${esc(f.name)}</div><div class="muted" style="font-size:13px">${esc(f.role)}</div><div class="faint" style="font-size:12px;margin-top:2px">Coming in a later build · Lv ${f.unlock}</div></div></div></div>`).join('');
  } else {
    body = ENEMY_ORDER.map(id => {
      const e = ENEMIES[id];
      return `<div class="tcard glass"><div class="th"><img src="${iconURL('enemy', id, { px: 112 })}" alt="">
        <div style="flex:1"><div class="nm">${esc(e.name)}${e.boss ? ' <span class="chip" style="background:rgba(239,107,90,.18);color:#ffb4a8;border-color:rgba(239,107,90,.4)">Boss</span>' : ''}</div><div class="muted" style="font-size:13px">${esc(e.trait)}</div></div></div>
        <div class="stats" style="margin:10px 0 0"><div class="stat" style="min-width:0"><div class="k">HP</div><div class="v">${e.boss ? '5k+' : e.hp}</div></div><div class="stat" style="min-width:0"><div class="k">Speed</div><div class="v">${e.speed}</div></div><div class="stat" style="min-width:0"><div class="k">Armor</div><div class="v">${pct(e.armor)}</div></div><div class="stat" style="min-width:0"><div class="k">M.Res</div><div class="v">${pct(e.mr)}</div></div><div class="stat" style="min-width:0"><div class="k">♥</div><div class="v">${e.hearts}</div></div></div></div>`;
    }).join('');
  }
  mount(`<div class="scr">${topbar('Codex')}
    <div class="seg" style="margin-bottom:12px"><button data-act="tab" data-t="towers" class="${codexTab === 'towers' ? 'on' : ''}">Towers</button><button data-act="tab" data-t="enemies" class="${codexTab === 'enemies' ? 'on' : ''}">Enemies</button></div>
    <div class="scroll stack" id="codexScroll">${body}</div></div>`, (a, d) => {
    if (a === 'back') act.showScreen('home');
    if (a === 'tab') { codexTab = d.t; towers(); }
    if (a === 'toggle') { const y = $('codexScroll').scrollTop; open.has(d.id) ? open.delete(d.id) : open.add(d.id); towers(); $('codexScroll').scrollTop = y; }
  });
}

// ---------------- Settings ----------------
function settings() {
  const s = app.save, lv = levelInfo(s.xp).level;
  mount(`<div class="scr">${topbar('Settings')}<div class="scroll stack">
    <div class="glass card" style="padding:0">
      <div class="set-row"><div class="grow"><b>Sound</b><div class="faint" style="font-size:12px">Silent switch may also mute it</div></div><button class="switch ${s.settings.sound ? 'on' : ''}" data-act="sound" aria-label="Sound"></button></div>
    </div>
    <div class="label-s">Backup</div>
    <div class="glass card" style="padding:0">
      <div class="set-row"><div class="grow"><b>Export backup</b><div class="faint" style="font-size:12px">Save a .json file (Files, iCloud Drive…)</div></div><button class="btn" data-act="export" style="min-height:38px">Export</button></div>
      <div class="set-row"><div class="grow"><b>Import backup</b><div class="faint" style="font-size:12px">Replaces progress on this device</div></div><button class="btn" data-act="import" style="min-height:38px">Import</button></div>
      <div class="set-row"><div class="grow"><b style="color:#ff9a8a">Reset save</b><div class="faint" style="font-size:12px">Erase everything and start over</div></div><button class="btn btn-red" data-act="reset" style="min-height:38px">Reset</button></div>
    </div>
    <input type="file" id="importFile" accept=".json,application/json" class="hidden">
    <div class="label-s">About</div>
    <div class="glass card" style="font-size:13.5px;line-height:1.5">
      <div class="row"><div class="grow muted">Version</div><b>${APP_VERSION}</b></div>
      <div class="row"><div class="grow muted">Account level</div><b>${lv}</b></div>
      <div class="row"><div class="grow muted">Stars</div><b>${totalStars(s)} / ${MAPS.length * 3}</b></div>
      <div class="row"><div class="grow muted">Runs · wins · kills</div><b>${s.stats.runs} · ${s.stats.wins} · ${fmt(s.stats.kills)}</b></div>
      <div class="faint" style="font-size:12px;margin-top:10px">Progress lives only on this device. The home-screen app and a Safari tab keep separate saves, and clearing Safari website data erases it — export a backup now and then.</div>
    </div></div></div>`, a => {
    if (a === 'back') act.showScreen('home');
    if (a === 'sound') { s.settings.sound = !s.settings.sound; act.setEnabled(s.settings.sound); act.save.write(); settings(); }
    if (a === 'export') doExport();
    if (a === 'import') $('importFile').click();
    if (a === 'reset') modal({ title: 'Reset all progress?', text: 'Levels, skills, stars and any saved run will be erased.', actions: [{ label: 'Reset', cls: 'btn-red', onClick: () => setTimeout(() => modal({ title: 'Are you sure?', text: 'This can’t be undone. Export a backup first if you might want it back.', actions: [{ label: 'Yes, erase everything', cls: 'btn-red', onClick: () => { app.save = act.save.reset(); act.setEnabled(app.save.settings.sound); toast('Save erased'); act.showScreen('home'); } }, { label: 'Cancel' }] }), 50) }, { label: 'Cancel' }] });
  });
  $('importFile').addEventListener('change', async e => {
    const f = e.target.files && e.target.files[0]; e.target.value = ''; if (!f) return;
    try {
      const { save, summary } = act.save.parseImport(await f.text());
      const curLv = levelInfo(app.save.xp).level;
      modal({ title: 'Import this backup?', html: `<p><b>Level ${summary.level}</b> · ${summary.stars}★ · ${summary.beaten}/${MAPS.length} maps beaten${summary.hasRun ? ' · saved run' : ''}${summary.exportedAt ? `<br><span class="faint" style="font-size:13px">Exported ${new Date(summary.exportedAt).toLocaleString()}</span>` : ''}</p><p style="font-size:13px">This replaces your current progress (Level ${curLv} · ${totalStars(app.save)}★).</p>`,
        actions: [{ label: 'Import', cls: 'btn-gold', onClick: () => { app.save = act.save.applyImport(save); act.setEnabled(app.save.settings.sound); toast('Backup imported'); settings(); } }, { label: 'Cancel' }] });
    } catch (err) { modal({ title: 'Couldn’t import', text: err.message || String(err), actions: [{ label: 'OK' }] }); }
  });
}
async function doExport() {
  const data = act.save.exportData(), d = new Date();
  const name = `holdfast-backup-${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}.json`;
  const blob = new Blob([data], { type: 'application/json' });
  try {
    const file = new File([blob], name, { type: 'application/json' });
    if (navigator.canShare && navigator.canShare({ files: [file] })) { await navigator.share({ files: [file], title: 'Holdfast backup' }); toast('Backup ready'); return; }
  } catch (e) { if (e && e.name === 'AbortError') return; }
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1500); toast('Backup downloaded');
}

// ---------------- Results ----------------
function results() {
  const r = app.lastResult; if (!r) return home();
  const m = MAPS.find(x => x.id === r.mapId);
  const pts = pointsAvailable(app.save);
  const lines = [['Waves cleared', r.xp.waves], ['Kills', r.xp.kills], r.won ? ['Victory bonus', r.xp.win] : null, r.xp.newStars ? [`New stars (${r.xp.newStars})`, r.xp.stars] : null].filter(Boolean);
  mount(`<div class="scr"><div class="results ${r.won ? 'win' : 'lose'}">
    <h1>${r.won ? 'Victory!' : 'Defeat'}</h1>
    <div class="muted" style="margin-top:4px">${esc(m.name)} · ${r.won ? `${r.hearts} hearts left` : `fell on ${r.wavesCleared >= m.waves ? 'the boss wave' : `wave ${r.wavesCleared + 1}`}`} · ${r.kills} kills</div>
    <div class="stars">${[0, 1, 2].map(() => ICON.bigStar).join('')}</div>
    <div class="card glass" style="margin-top:8px">
      <div class="lvl"><div class="badge"><small>LV</small><b id="rLv">${r.before.level}</b></div>
        <div style="flex:1;text-align:left"><div class="row"><div class="grow" style="font-weight:800">+${r.xp.total} XP</div><div id="rUp" class="lvlup"></div></div>
        <div class="xpbar"><i id="rBar" style="width:${(100 * r.before.into / r.before.need).toFixed(1)}%;transition:width .5s"></i></div></div></div>
      <div class="xplines">${lines.map(([k, v]) => `<div><span class="muted">${k}</span><b>+${v}</b></div>`).join('')}</div>
      <div id="rChips" class="row" style="flex-wrap:wrap;justify-content:center;margin-top:10px;gap:6px"></div>
    </div>
    <div class="stack" style="margin-top:16px">
      ${r.won && r.nextMap ? `<button class="btn btn-gold btn-block" data-act="next">Next map · ${esc(r.nextMap.name)}</button>` : ''}
      <div class="row"><button class="btn glass grow" data-act="retry">Retry</button><button class="btn glass grow" data-act="campaign">Campaign</button></div>
      <button class="btn glass btn-block ${pts > 0 ? '' : 'hidden'}" id="rSkills" data-act="skills">Spend ${pts} skill point${pts === 1 ? '' : 's'}</button>
    </div></div></div>`, a => {
    if (a === 'next') act.startMap(r.nextMap.id);
    if (a === 'retry') act.startMap(r.mapId);
    if (a === 'campaign') act.showScreen('campaign');
    if (a === 'skills') act.showScreen('skills');
  });
  // stars
  const svgs = root().querySelectorAll('.stars svg');
  for (let i = 0; i < r.stars; i++) setTimeout(() => { svgs[i] && svgs[i].classList.add('on'); act.sfx.coin(); }, 350 + i * 300);
  // XP bar animation through level-ups
  const lvEl = $('rLv'), bar = $('rBar'), up = $('rUp'), chips = $('rChips');
  let lvl = r.before.level, gained = r.after.level - r.before.level, step = 0;
  const finish = () => {
    if (gained > 0) chips.insertAdjacentHTML('beforeend', `<span class="chip">+${gained} skill point${gained > 1 ? 's' : ''}</span>`);
    for (const t of r.unlockedTowers) chips.insertAdjacentHTML('beforeend', `<span class="chip">New tower: ${esc(TOWERS[t].name)}</span>`);
    if (r.unlockedMap) chips.insertAdjacentHTML('beforeend', `<span class="chip">Unlocked: ${esc(r.unlockedMap.name)}</span>`);
  };
  const tick = () => {
    if (!$('rBar')) return;
    if (step < gained) {
      bar.style.width = '100%';
      setTimeout(() => { if (!$('rBar')) return; step++; lvl++; lvEl.textContent = lvl; up.textContent = 'Level up!'; act.sfx.levelup(); bar.style.transition = 'none'; bar.style.width = '0%'; void bar.offsetWidth; bar.style.transition = 'width .5s'; tick(); }, 550);
    } else { bar.style.width = (100 * r.after.into / r.after.need).toFixed(1) + '%'; finish(); }
  };
  setTimeout(tick, 400 + r.stars * 300);
}
