// Guided tutorial on the Training Grounds map. Steps show a coach bubble + a highlight ring,
// optionally pause the battle, and gate which actions are allowed until the step is done.
import { $, esc } from './ui.js';

const A = 1, B = 4, C = 2; // spot indexes on TUTORIAL_MAP

const STEPS = [
  { id: 'intro', text: 'Enemies march down the road toward your castle. Stop them before they get through!', next: true, pause: true },
  { id: 'pad', text: 'Tap the glowing pad to build a tower.', target: { spot: A }, gate: { spot: A }, pause: true, until: 'radialOpen' },
  { id: 'archer', text: 'Tap the Archer once to see its range, then tap it again to build.', target: { ring: 'archer' }, gate: { spot: A, tower: 'archer' }, pause: true, until: 'build' },
  { id: 'hud', text: 'Hearts and gold live up here. Each enemy that reaches the castle costs hearts — lose all 20 and it falls.', target: { el: 'hud' }, next: true, pause: true },
  { id: 'start', text: 'Tap Start battle when you’re ready.', target: { el: 'callwave' }, gate: { act: 'callwave' }, until: 'waveStart' },
  { id: 'bomb', when: g => g.time > 5, text: 'Kills earn gold. Build a Bombard here — its shells blast whole groups.', target: { spot: B }, gate: { spot: B, tower: 'bombard' }, pause: true, until: 'build', ensureGold: 110 },
  { id: 'call', when: g => g.nextWaveIn > 0 && g.nextWaveIn < 14, text: 'The next wave starts on its own, but calling it early pays bonus gold. Tap it!', target: { el: 'callwave' }, gate: { act: 'callwave' }, pause: true, until: 'waveStart', expire: g => g.waveIdx >= 2 },
  { id: 'tapTower', when: g => g.time > 22, text: 'Tap your Archer to open its upgrades.', target: { tower: A }, gate: { towerSpot: A }, pause: true, until: 'sheetOpen', ensureGold: 110 },
  { id: 'upgrade', text: 'Upgrade it — more damage, faster shots and longer range.', target: { el: 'upgradeBtn' }, gate: { act: 'upgrade' }, pause: true, until: 'upgrade' },
  { id: 'speed', text: 'Tap here to speed up the battle (1× → 2× → 3×). Tap again to go back.', target: { el: 'bSpeed' }, pause: true, until: 'speed', next: true },
  { id: 'bats', when: g => g.waveIdx === 2 && g.nextWaveIn > 0, expire: g => g.waveIdx >= 3, text: 'These icons show the next wave. Bats are coming — they fly! Bombards and soldiers can’t hit flyers, but Archers can.', target: { el: 'cwFoes' }, next: true, pause: true },
  { id: 'mage', when: g => g.waveIdx === 3 && g.nextWaveIn > 0, expire: g => g.waveIdx >= 4, text: 'Armored Brutes shrug off arrows and shells. Build a Mage here — magic ignores armor.', target: { spot: C }, gate: { spot: C, tower: 'mage' }, pause: true, until: 'build', ensureGold: 100 },
  { id: 'tips', text: 'Tip: tap any enemy to see what beats it, and tap a tower to change its target. Now hold the line!', next: true, pause: true },
];

export class Tutorial {
  constructor(api) { this.api = api; this.i = 0; this.shown = false; this.done = false; this.lastKey = ''; }
  get step() { return this.done ? null : STEPS[this.i]; }
  get paused() { return this.shown && !!(this.step && this.step.pause); }
  gate() { return this.shown && this.step ? (this.step.gate || null) : null; }
  update(g) {
    const s = this.step;
    if (!s) return this._hide();
    if (!this.shown) {
      if (s.expire && s.expire(g)) { this._advance(); return; }
      if (s.when && !s.when(g)) return this._hide();
      this.shown = true;
      if (s.ensureGold && g.gold < s.ensureGold) g.gold = s.ensureGold;
      this._render();
    }
    this._place(g);
  }
  onEvent(name) {
    const s = this.step; if (!s || !this.shown) return;
    if (s.until === name) this._advance();
  }
  _advance() { this.i++; this.shown = false; this.lastKey = ''; if (this.i >= STEPS.length) { this.done = true; } this._hide(); this.api.changed && this.api.changed(); }
  skip() { this.done = true; this.shown = false; this._hide(); this.api.changed && this.api.changed(); }
  destroy() { this.done = true; this._hide(); }
  _render() {
    const s = this.step, el = $('coach');
    el.innerHTML = `<div class="coach-text">${esc(s.text)}</div><div class="coach-acts">
      <button class="coach-skip" data-c="skip">Skip tutorial</button><span class="coach-n">${this.i + 1}/${STEPS.length}</span>
      ${s.next ? `<button class="btn btn-gold coach-next" data-c="next">${s.until ? 'Got it' : 'Next'}</button>` : ''}</div>`;
    el.classList.remove('hidden');
    el.onclick = e => { const b = e.target.closest('[data-c]'); if (!b) return; if (b.dataset.c === 'next') this._advance(); else this.api.confirmSkip(); };
  }
  _hide() { $('coach').classList.add('hidden'); $('focus').classList.add('hidden'); }
  _place(g) {
    const s = this.step, f = $('focus'), coach = $('coach');
    let r = null;
    const T = s.target || {};
    if (T.spot != null) { const [x, y] = g.map.spots[T.spot]; const p = this.api.toScreen(x, y); r = { x: p.x, y: p.y, w: 64, h: 52 }; }
    else if (T.tower != null) { const t = g.towerAtSpot(T.tower); if (t) { const p = this.api.toScreen(t.x, t.y - 14); r = { x: p.x, y: p.y, w: 64, h: 76 }; } }
    else if (T.ring) { const b = document.querySelector(`.ring-btn[data-type=${T.ring}]`); if (b) { const q = b.getBoundingClientRect(); r = { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width + 14, h: q.height + 14 }; } }
    else if (T.el) { const b = $(T.el) || document.querySelector(`[data-tut=${T.el}]`); if (b && b.offsetParent !== null) { const q = b.getBoundingClientRect(); r = { x: q.left + q.width / 2, y: q.top + q.height / 2, w: q.width + 12, h: q.height + 12 }; } }
    const key = r ? [r.x, r.y, r.w, r.h].map(Math.round).join(',') : 'none';
    if (key !== this.lastKey) {
      this.lastKey = key;
      if (r) {
        f.style.left = (r.x - r.w / 2) + 'px'; f.style.top = (r.y - r.h / 2) + 'px'; f.style.width = r.w + 'px'; f.style.height = r.h + 'px';
        f.style.borderRadius = T.el || T.ring ? '20px' : '50%';
        f.classList.remove('hidden');
      } else f.classList.add('hidden');
      // keep the bubble away from the highlight
      const H = window.innerHeight, low = r && r.y > H * 0.5;
      coach.classList.toggle('top', !!low || !r); coach.classList.toggle('bottom', !!r && !low);
    }
  }
}
