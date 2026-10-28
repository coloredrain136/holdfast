// Account progression helpers — pure functions (no DOM), shared by UI and the balance sim.
import { xpToNext, SKILLS, SKILL_BRANCH_ORDER, TOWERS, MAPS, TIER_INFO, XP_RULES, STAR_RULES, START_HEARTS, BASE_SELL_REFUND } from './config.js';

export function levelInfo(totalXp) {
  let level = 1, rem = Math.max(0, Math.floor(totalXp || 0));
  while (rem >= xpToNext(level)) { rem -= xpToNext(level); level++; if (level > 999) break; }
  return { level, into: rem, need: xpToNext(level) };
}

export function skillRank(skills, id) { return (skills && skills[id]) || 0; }
export function pointsSpent(skills) { return Object.values(skills || {}).reduce((a, b) => a + (b || 0), 0); }
export function pointsAvailable(save) { return levelInfo(save.xp).level - 1 - pointsSpent(save.skills); }

export function findNode(id) {
  for (const b of SKILL_BRANCH_ORDER) {
    const i = SKILLS[b].nodes.findIndex(n => n.id === id);
    if (i >= 0) return { branch: b, index: i, node: SKILLS[b].nodes[i] };
  }
  return null;
}
// 'maxed' | 'locked' | 'nopoints' | 'ok'
export function nodeState(save, id) {
  const f = findNode(id); if (!f) return 'locked';
  const r = skillRank(save.skills, id);
  if (r >= f.node.max) return 'maxed';
  if (f.index > 0 && skillRank(save.skills, SKILLS[f.branch].nodes[f.index - 1].id) < 1) return 'locked';
  if (pointsAvailable(save) < 1) return 'nopoints';
  return 'ok';
}

export function getMods(skills) {
  const r = id => skillRank(skills, id);
  const per = id => findNode(id).node.per;
  return {
    startGold: r('coffers') * per('coffers'),
    killGoldMult: 1 + r('bounty') * per('bounty'),
    sellRefund: BASE_SELL_REFUND + r('salvage') * per('salvage'),
    earlyMult: 1 + r('eager') * per('eager'),
    t1Discount: r('founding') * per('founding'),
    dmgMult: {
      archer: 1 + r('arrows') * per('arrows'),
      mage: 1 + r('arcane') * per('arcane'),
      bombard: 1 + r('powder') * per('powder'),
      frost: 1 + r('rime') * per('rime'),
      barracks: 1, ballista: 1,
    },
    rangeMult: 1 + r('eagle') * per('eagle'),
    critChance: r('keen') * per('keen'),
    bossDmgMult: 1 + r('slayer') * per('slayer'),
    startHearts: START_HEARTS + r('walls') * per('walls'),
    slowDurMult: 1 + r('deep') * per('deep'),
    soldierMult: 1 + r('drilled') * per('drilled'),
    bossHeartReduce: r('bulwark') * per('bulwark'),
  };
}

export function towerUnlocked(level, type) { return level >= (TOWERS[type]?.unlock || 99); }
export function mapUnlocked(save, idx) {
  if (idx === 0) return true;
  const prev = MAPS[idx - 1];
  return !!(save.maps[prev.id] && save.maps[prev.id].wins > 0);
}
export function starsFor(won, hearts) {
  if (!won) return 0;
  for (const r of STAR_RULES) if (hearts >= r.hearts) return r.stars;
  return 1;
}
export function totalStars(save) { return Object.values(save.maps || {}).reduce((a, m) => a + (m.stars || 0), 0); }

// XP breakdown for a finished run
export function runXp({ mapId, won, wavesCleared, kills, stars, prevStars }) {
  const map = MAPS.find(m => m.id === mapId);
  const waves = wavesCleared * XP_RULES.perWave;
  const killXp = Math.round(kills * XP_RULES.perKill);
  const win = won ? TIER_INFO[map.tier].winXp : 0;
  const newStars = Math.max(0, stars - (prevStars || 0));
  const starXp = newStars * XP_RULES.firstStar;
  return { waves, kills: killXp, win, stars: starXp, newStars, total: waves + killXp + win + starXp };
}
