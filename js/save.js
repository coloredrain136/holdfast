// Save system: localStorage `holdfast_save`, versioned schema with migrations, export/import.
import { SAVE_KEY, SAVE_SCHEMA, APP_VERSION, MAPS } from './config.js';
import { levelInfo, totalStars } from './progress.js';

export function freshSave() {
  return {
    schema: SAVE_SCHEMA, createdAt: Date.now(), updatedAt: Date.now(),
    xp: 0, skills: {}, maps: {}, stats: { runs: 0, wins: 0, kills: 0 },
    settings: { sound: true, speed: 1 }, run: null,
    seen: { enemies: [] }, tutorialDone: false,
  };
}

// Add a function per schema bump: MIGRATIONS[n] upgrades a schema-n save to n+1.
const MIGRATIONS = {
  // schema 1 → 2 (holdfast-2): first-sighting enemy cards, saved speed, tutorial flag
  1: s => {
    // anything on maps already played counts as seen, so returning players don't get intro cards for goblins
    const seen = new Set();
    for (const m of MAPS) { const r = (s.maps || {})[m.id]; if (r && r.plays) { Object.keys(m.intro).forEach(k => seen.add(k)); if (m.boss && r.wins) seen.add('ogre'); } }
    s.seen = { enemies: [...seen] }; s.settings = { ...(s.settings || {}), speed: 1 }; s.tutorialDone = Object.values(s.maps || {}).some(r => r.wins > 0); return s; },
};

export function migrate(s) {
  if (!s || typeof s !== 'object') throw new Error('Not a save file');
  let v = s.schema || 1;
  if (v > SAVE_SCHEMA) throw new Error(`Save is from a newer version (schema ${v}). Update the app first.`);
  while (v < SAVE_SCHEMA) { const m = MIGRATIONS[v]; if (!m) throw new Error(`No migration for schema ${v}`); s = m(s); v++; s.schema = v; }
  // fill any missing defaults
  const d = freshSave();
  for (const k of Object.keys(d)) if (s[k] === undefined) s[k] = d[k];
  s.settings = { ...d.settings, ...s.settings };
  s.stats = { ...d.stats, ...s.stats };
  s.seen = { ...d.seen, ...s.seen };
  for (const id of Object.keys(s.maps)) if (!MAPS.find(m => m.id === id)) delete s.maps[id];
  if (s.run && !MAPS.find(m => m.id === s.run.mapId)) s.run = null;
  return s;
}

let current = null;
export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    current = raw ? migrate(JSON.parse(raw)) : freshSave();
  } catch (e) {
    console.warn('Save load failed, starting fresh', e);
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) localStorage.setItem(SAVE_KEY + '_broken_' + Date.now(), raw); } catch (_) {}
    current = freshSave();
  }
  return current;
}
export function get() { return current || load(); }
export function write() {
  if (!current) return false;
  current.updatedAt = Date.now();
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(current)); return true; }
  catch (e) { console.warn('Save write failed', e); return false; }
}
export function reset() { current = freshSave(); write(); return current; }

export function exportData() {
  const s = get();
  return JSON.stringify({ app: 'holdfast', exportedAt: new Date().toISOString(), version: APP_VERSION, save: s }, null, 2);
}
// Returns {save, summary} or throws with a readable message. Does NOT apply.
export function parseImport(text) {
  let obj;
  try { obj = JSON.parse(text); } catch (_) { throw new Error('That file isn’t valid JSON.'); }
  const s = obj && obj.app === 'holdfast' ? obj.save : obj;
  if (!s || typeof s !== 'object' || typeof s.schema !== 'number' || s.xp === undefined) throw new Error('That doesn’t look like a Holdfast backup.');
  const save = migrate(JSON.parse(JSON.stringify(s)));
  const lv = levelInfo(save.xp).level;
  const beaten = Object.values(save.maps).filter(m => m.wins > 0).length;
  return { save, summary: { level: lv, stars: totalStars(save), beaten, exportedAt: obj.exportedAt || null, schema: s.schema, hasRun: !!save.run } };
}
export function applyImport(save) { current = save; write(); return current; }
