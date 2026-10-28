// Holdfast — data tables. Balance lives here: edit numbers, not code.
export const APP_VERSION = 'holdfast-1';
export const SAVE_KEY = 'holdfast_save';
export const SAVE_SCHEMA = 1;

// Logical playfield (all game coordinates use this space)
export const WORLD = { w: 400, h: 640, roadWidth: 36 };
export const TICK = 1 / 60;               // fixed logic step (s)
export const START_HEARTS = 20;
export const WAVE_BREAK = 16;             // seconds between waves (auto-countdown)
export const EARLY_GOLD_PER_SEC = 2;      // bonus per second skipped when calling early
export const BASE_SELL_REFUND = 0.7;
export const STAR_RULES = [ { stars: 3, hearts: 18 }, { stars: 2, hearts: 10 }, { stars: 1, hearts: 1 } ];

// ---------------- Towers ----------------
// tiers[0..2] = tier 1..3. branches = tier 4 choices. cost = cost to reach that tier.
// dmgType: 'phys' | 'magic'. air: can hit flying.
export const TOWERS = {
  archer: {
    name: 'Archer', role: 'Fast single-target', dmgType: 'phys', air: true, unlock: 1, family: 'archer',
    blurb: 'Quick volleys of arrows. Hits flyers. Struggles against armor.',
    tiers: [
      { cost: 70,  dmg: 6,  cd: 0.6,  range: 118 },
      { cost: 110, dmg: 10, cd: 0.55, range: 128 },
      { cost: 160, dmg: 15, cd: 0.5,  range: 138 },
    ],
    branches: {
      ranger:   { name: 'Ranger',   cost: 260, dmg: 16, cd: 0.32, range: 145, multishot: 2, desc: 'Rapid fire, 2 arrows at once' },
      marksman: { name: 'Marksman', cost: 260, dmg: 42, cd: 0.95, range: 210, crit: 0.25, critMult: 2.5, desc: 'Long range, 25% crits for 2.5×' },
    },
  },
  mage: {
    name: 'Mage', role: 'Magic damage, ignores armor', dmgType: 'magic', air: true, unlock: 1, family: 'mage',
    blurb: 'Arcane bolts that melt armored foes. Weak against wraiths.',
    tiers: [
      { cost: 100, dmg: 14, cd: 1.2,  range: 108 },
      { cost: 160, dmg: 24, cd: 1.15, range: 114 },
      { cost: 220, dmg: 38, cd: 1.1,  range: 120 },
    ],
    branches: {
      archmage: { name: 'Archmage', cost: 300, dmg: 100, cd: 1.3, range: 132, desc: 'Huge arcane bolts' },
      warlock:  { name: 'Warlock',  cost: 300, dmg: 46, cd: 1.0, range: 126, chain: 3, chainFalloff: 0.7, chainRange: 75, desc: 'Lightning chains to 3 more foes' },
    },
  },
  bombard: {
    name: 'Bombard', role: 'Splash damage', dmgType: 'phys', air: false, unlock: 1, family: 'bombard',
    blurb: 'Lobs shells that blast groups. Cannot hit flyers.',
    tiers: [
      { cost: 110, dmg: 14, cd: 1.8,  range: 112, splash: 40 },
      { cost: 170, dmg: 25, cd: 1.75, range: 118, splash: 44 },
      { cost: 240, dmg: 40, cd: 1.7,  range: 124, splash: 48 },
    ],
    branches: {
      mortar:     { name: 'Siege Mortar', cost: 320, dmg: 85, cd: 2.4, range: 178, splash: 72, desc: 'Massive blasts from far away' },
      firebomber: { name: 'Firebomber',   cost: 320, dmg: 42, cd: 1.6, range: 130, splash: 52, burn: 14, burnDur: 3, desc: 'Sets foes ablaze (burn ignores armor)' },
    },
  },
  frost: {
    name: 'Frost', role: 'Slows enemies', dmgType: 'magic', air: true, unlock: 1, family: 'frost',
    blurb: 'Chilling shards slow everything they touch.',
    tiers: [
      { cost: 90,  dmg: 4,  cd: 1.0, range: 104, slow: 0.30, slowDur: 1.5 },
      { cost: 140, dmg: 7,  cd: 1.0, range: 110, slow: 0.38, slowDur: 1.7 },
      { cost: 190, dmg: 11, cd: 1.0, range: 116, slow: 0.45, slowDur: 2.0 },
    ],
    branches: {
      glacier:  { name: 'Glacier',  cost: 260, dmg: 18, cd: 0.95, range: 122, slow: 0.5, slowDur: 2.0, freezeChance: 0.22, freezeDur: 1.0, desc: '22% chance to freeze solid (not bosses)' },
      blizzard: { name: 'Blizzard', cost: 260, dmg: 0,  cd: 0.25, range: 112, slow: 0.55, slowDur: 0.4, aura: true, auraDps: 9, desc: 'Constant slowing storm around the tower' },
    },
  },
  barracks: {
    name: 'Barracks', role: 'Soldiers block the path', dmgType: 'phys', air: false, unlock: 3, family: 'barracks',
    blurb: 'Three soldiers hold the road. Flyers ignore them.',
    tiers: [
      { cost: 120, range: 95, soldiers: 3, hp: 60,  dmg: 4,  cd: 1.0, armor: 0.1, respawn: 10 },
      { cost: 170, range: 100, soldiers: 3, hp: 100, dmg: 7,  cd: 1.0, armor: 0.15, respawn: 10 },
      { cost: 230, range: 105, soldiers: 3, hp: 150, dmg: 11, cd: 1.0, armor: 0.2, respawn: 9 },
    ],
    branches: {
      knights: { name: 'Knights',       cost: 300, range: 110, soldiers: 3, hp: 320, dmg: 17, cd: 1.0, armor: 0.5, respawn: 9, desc: 'Heavily armored, very tanky' },
      rangers: { name: "Rangers' Camp", cost: 300, range: 110, soldiers: 3, hp: 150, dmg: 10, cd: 1.0, armor: 0.2, respawn: 9, bow: { dmg: 15, cd: 1.1, range: 115 }, desc: 'Soldiers carry bows and shoot flyers' },
    },
  },
  ballista: {
    name: 'Ballista', role: 'Long range, pierces a line', dmgType: 'phys', air: true, unlock: 6, family: 'ballista',
    blurb: 'Giant bolts that punch through every foe in a line.',
    tiers: [
      { cost: 130, dmg: 30, cd: 2.2, range: 190, pierce: true },
      { cost: 190, dmg: 48, cd: 2.1, range: 200, pierce: true },
      { cost: 260, dmg: 72, cd: 2.0, range: 210, pierce: true },
    ],
    branches: {
      dragonbane: { name: 'Dragonbane', cost: 340, dmg: 150, cd: 2.2, range: 235, pierce: true, bonusVsBossAir: 2, desc: '2× damage to bosses and flyers' },
      repeater:   { name: 'Repeater',   cost: 340, dmg: 60,  cd: 0.8, range: 205, pierce: true, desc: 'Rapid-fire bolts' },
    },
  },
};
// Order shown in the radial build menu + codex
export const TOWER_ORDER = ['archer', 'mage', 'bombard', 'frost', 'barracks', 'ballista'];
// Later-phase towers shown locked in the codex only (not buildable in Build 1)
export const FUTURE_TOWERS = [
  { id: 'alchemist', name: 'Alchemist', role: 'Stacking poison', unlock: 9 },
  { id: 'storm', name: 'Storm Spire', role: 'Chain lightning', unlock: 12 },
  { id: 'druid', name: 'Druid Grove', role: 'Roots enemies', unlock: 15 },
  { id: 'treasury', name: 'Treasury', role: 'Makes gold each wave', unlock: 18 },
];

// ---------------- Enemies ----------------
// armor cuts physical, mr cuts magic (0..1). hearts = cost if it leaks. atk = melee vs soldiers.
export const ENEMIES = {
  goblin:  { name: 'Goblin',        hp: 22,   speed: 60, armor: 0,    mr: 0,    gold: 4,   hearts: 1, atk: 3,  size: 9,  pts: 1,   gap: 0.42, trait: 'Fast, weak, swarms' },
  orc:     { name: 'Orc Grunt',     hp: 62,   speed: 42, armor: 0.1,  mr: 0,    gold: 7,   hearts: 1, atk: 6,  size: 12, pts: 2.5, gap: 0.9,  trait: 'Standard foot soldier' },
  brute:   { name: 'Armored Brute', hp: 130,  speed: 31, armor: 0.6,  mr: 0,    gold: 13,  hearts: 2, atk: 10, size: 14, pts: 5,   gap: 1.4,  trait: 'Heavy armor — use Mage' },
  wraith:  { name: 'Wraith',        hp: 72,   speed: 46, armor: 0.1,  mr: 0.65, gold: 10,  hearts: 1, atk: 6,  size: 12, pts: 3.5, gap: 0.95, trait: 'Resists magic — use Archer/Bombard' },
  bat:     { name: 'Bat Swarm',     hp: 26,   speed: 68, armor: 0,    mr: 0,    gold: 5,   hearts: 1, atk: 0,  size: 10, pts: 1.3, gap: 0.5,  flying: true, trait: 'Flies — Bombard and soldiers can’t hit' },
  shaman:  { name: 'Shaman',        hp: 70,   speed: 37, armor: 0,    mr: 0.3,  gold: 14,  hearts: 1, atk: 4,  size: 12, pts: 5,   gap: 1.6,  heal: { pct: 0.08, every: 2.5, radius: 70 }, trait: 'Heals nearby foes — kill first' },
  ogre:    { name: 'Ogre Warlord',  hp: 5200, speed: 20, armor: 0.35, mr: 0.25, gold: 250, hearts: 5, atk: 45, size: 22, pts: 0,   gap: 0,    boss: true, trait: 'Boss — costs 5 hearts' },
};
export const ENEMY_ORDER = ['goblin', 'orc', 'brute', 'wraith', 'bat', 'shaman', 'ogre'];

// ---------------- Maps ----------------
// path: waypoints in WORLD space. spots: build pads. intro: wave each enemy type first appears.
export const MAPS = [
  { id: 'greenvale', name: 'Greenvale Road', biome: 'meadow', tier: 'short', waves: 10, startGold: 260, hpMult: 1.0, budgetMult: 1.0,
    intro: { goblin: 1, orc: 2, bat: 5, brute: 7 },
    path: [[200,-30],[200,110],[90,110],[90,260],[310,260],[310,420],[120,420],[120,560],[200,560],[200,670]],
    spots: [[268,204],[40,208],[140,208],[204,210],[132,310],[260,310],[360,334],[220,364],[156,370],[228,476],[170,504]] },
  { id: 'millbrook', name: 'Millbrook Crossing', biome: 'meadow', tier: 'short', waves: 10, startGold: 280, hpMult: 1.0, budgetMult: 1.05,
    intro: { goblin: 1, orc: 1, wraith: 4, bat: 3, brute: 6, shaman: 8 },
    path: [[60,-30],[60,150],[330,150],[330,320],[70,320],[70,500],[300,500],[300,670]],
    spots: [[118,94],[246,100],[166,206],[238,206],[88,264],[280,264],[248,376],[126,394],[208,444],[200,550],[350,566]] },
  { id: 'thornhollow', name: 'Thornhollow', biome: 'darkwood', tier: 'medium', waves: 20, startGold: 300, hpMult: 1.0, budgetMult: 1.0,
    intro: { goblin: 1, orc: 1, wraith: 3, bat: 5, brute: 6, shaman: 9 },
    path: [[340,-30],[340,90],[60,90],[60,230],[260,230],[260,350],[80,350],[80,480],[330,480],[330,600],[200,600],[200,670]],
    spots: [[106,146],[234,146],[298,146],[166,180],[310,272],[150,280],[214,280],[82,294],[30,408],[186,424],[282,424],[122,530],[242,530]] },
  { id: 'witchmire', name: 'Witchmire', biome: 'darkwood', tier: 'medium', waves: 20, startGold: 320, hpMult: 1.05, budgetMult: 1.05,
    intro: { goblin: 1, orc: 1, bat: 2, wraith: 4, shaman: 6, brute: 7 },
    path: [[-30,80],[320,80],[320,240],[90,240],[90,400],[320,400],[320,540],[150,540],[150,670]],
    spots: [[148,136],[270,154],[370,154],[206,184],[198,290],[262,296],[40,314],[300,350],[140,354],[188,450],[124,456],[254,490],[246,590]] },
  { id: 'frostfang', name: 'Frostfang Pass', biome: 'frostpeak', tier: 'long', waves: 35, boss: true, startGold: 340, hpMult: 1.0, budgetMult: 0.95, bossHp: 5200,
    intro: { goblin: 1, orc: 1, bat: 3, wraith: 5, brute: 7, shaman: 10 },
    path: [[200,-30],[200,70],[60,70],[60,200],[340,200],[340,320],[140,320],[140,430],[340,430],[340,560],[60,560],[60,670]],
    spots: [[256,68],[142,126],[206,144],[270,144],[126,256],[222,256],[284,274],[84,346],[314,370],[234,376],[84,418],[150,486],[222,486],[290,496],[74,504]] },
  { id: 'glacierkeep', name: 'Glacier Keep', biome: 'frostpeak', tier: 'long', waves: 35, boss: true, startGold: 360, hpMult: 1.05, budgetMult: 1.0, bossHp: 6500,
    intro: { goblin: 1, orc: 1, bat: 2, wraith: 3, brute: 5, shaman: 7 },
    path: [[430,100],[90,100],[90,220],[310,220],[310,340],[90,340],[90,470],[310,470],[310,600],[200,600],[200,670]],
    spots: [[308,156],[34,158],[204,170],[366,262],[260,270],[116,290],[196,290],[140,390],[308,414],[236,420],[34,446],[132,526],[196,526],[260,552],[366,568]] },
];
export const TIER_INFO = {
  short:  { label: 'Short',  letter: 'S', winXp: 40 },
  medium: { label: 'Medium', letter: 'M', winXp: 90 },
  long:   { label: 'Long',   letter: 'L', winXp: 170 },
};
export const BIOMES = {
  meadow:    { name: 'Meadow',    ground: ['#6f9a45', '#5d8a3a'], road: ['#b8946a', '#9b7a52', '#d4b48a'], accent: '#a6d36a' },
  darkwood:  { name: 'Darkwood',  ground: ['#3c5a3a', '#2c4630'], road: ['#8a6f55', '#6e5642', '#a68a6c'], accent: '#9d7fd6' },
  frostpeak: { name: 'Frostpeak', ground: ['#cfe0ea', '#a9c3d4'], road: ['#9aa7b4', '#7d8a99', '#c0cad4'], accent: '#8fd3ff' },
};

// ---------------- Waves ----------------
// Generated from map data so every map scales the same way. Tune the constants below.
export const WAVE_TUNING = {
  baseBudget: 8, budgetPerWave: 3.3, hpPerWave: 0.07, maxSpawnSecs: 22, groupGap: 1.6,
};

// ---------------- Account progression ----------------
export const XP_RULES = { perWave: 5, perKill: 0.3, firstStar: 25 };
export function xpToNext(level) { return Math.round(80 + 35 * Math.pow(level - 1, 1.3)); }

// ---------------- Skill tree ----------------
// Nodes unlock in order down each branch (need ≥1 rank in the node above).
export const SKILLS = {
  economy: { name: 'Economy', color: '#e8b54a', nodes: [
    { id: 'coffers',  name: 'Deep Coffers',      max: 3, per: 20,   desc: r => `+${20 * r} starting gold` },
    { id: 'bounty',   name: 'Bounty',            max: 3, per: 0.08, desc: r => `+${8 * r}% gold per kill` },
    { id: 'salvage',  name: 'Salvage',           max: 2, per: 0.05, desc: r => `Sell refund ${70 + 5 * r}%` },
    { id: 'eager',    name: 'Eager Call',        max: 2, per: 0.25, desc: r => `+${25 * r}% early-call bonus` },
    { id: 'founding', name: 'Cheap Foundations', max: 3, per: 0.05, desc: r => `Tier-1 towers ${5 * r}% cheaper` },
  ]},
  firepower: { name: 'Firepower', color: '#ef6b4a', nodes: [
    { id: 'arrows',  name: 'Sharpened Arrows', max: 3, per: 0.08, desc: r => `Archer +${8 * r}% damage` },
    { id: 'arcane',  name: 'Arcane Focus',     max: 3, per: 0.08, desc: r => `Mage +${8 * r}% damage` },
    { id: 'powder',  name: 'Black Powder',     max: 3, per: 0.08, desc: r => `Bombard +${8 * r}% damage` },
    { id: 'rime',    name: 'Biting Rime',      max: 3, per: 0.15, desc: r => `Frost +${15 * r}% damage` },
    { id: 'eagle',   name: 'Eagle Eye',        max: 3, per: 0.04, desc: r => `All towers +${4 * r}% range` },
    { id: 'keen',    name: 'Keen Edge',        max: 3, per: 0.03, desc: r => `+${3 * r}% crit chance (2× dmg)` },
    { id: 'slayer',  name: 'Giantslayer',      max: 3, per: 0.10, desc: r => `+${10 * r}% damage to bosses` },
  ]},
  fortitude: { name: 'Fortitude', color: '#6fb6ff', nodes: [
    { id: 'walls',   name: 'Stout Walls',     max: 3, per: 2,    desc: r => `+${2 * r} starting hearts` },
    { id: 'deep',    name: 'Deep Freeze',     max: 2, per: 0.15, desc: r => `Frost slows last ${15 * r}% longer` },
    { id: 'drilled', name: 'Drilled Soldiers',max: 3, per: 0.15, desc: r => `Soldiers +${15 * r}% health & damage` },
    { id: 'bulwark', name: 'Bulwark',         max: 2, per: 1,    desc: r => `Bosses cost ${r} fewer heart${r > 1 ? 's' : ''}` },
  ]},
};
export const SKILL_BRANCH_ORDER = ['economy', 'firepower', 'fortitude'];
