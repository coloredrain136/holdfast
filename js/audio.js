// Original SFX synthesized with Web Audio. Starts after the first tap (iOS rule).
let ctx = null, master = null, noiseBuf = null, enabled = true;
const last = {};

export function setEnabled(on) { enabled = !!on; if (master) master.gain.value = enabled ? 0.55 : 0; }
export function unlock() {
  try {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
      ctx = new AC(); master = ctx.createGain(); master.gain.value = enabled ? 0.55 : 0;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
      master.connect(comp); comp.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    }
    if (ctx.state === 'suspended') ctx.resume();
  } catch (e) { /* audio unavailable */ }
}
export function suspend() { if (ctx && ctx.state === 'running') ctx.suspend(); }

function ok(name, gapMs) {
  if (!ctx || !enabled || ctx.state !== 'running') return false;
  const now = performance.now(); if (last[name] && now - last[name] < gapMs) return false;
  last[name] = now; return true;
}
function env(g, t, a, peak, dec) { g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(peak, t + a); g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec); }
function tone(type, f0, f1, dur, vol, when = 0) {
  const t = ctx.currentTime + when, o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.setValueAtTime(f0, t); if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
  env(g, t, 0.005, vol, dur); o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
}
function noise(dur, vol, filterType, f0, f1, q = 1, when = 0) {
  const t = ctx.currentTime + when, s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  s.buffer = noiseBuf; f.type = filterType; f.frequency.setValueAtTime(f0, t); if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur); f.Q.value = q;
  env(g, t, 0.004, vol, dur); s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
}

export const sfx = {
  arrow() { if (!ok('arrow', 70)) return; noise(0.07, 0.25, 'bandpass', 2600, 1200, 3); tone('triangle', 520 + Math.random() * 60, 300, 0.08, 0.12); },
  magic() { if (!ok('magic', 90)) return; tone('sine', 660, 1320, 0.18, 0.12); tone('triangle', 990, 1980, 0.14, 0.06, 0.02); },
  zap() { if (!ok('zap', 110)) return; noise(0.12, 0.2, 'highpass', 3000, 6000, 1); tone('sawtooth', 1400, 300, 0.12, 0.05); },
  cannon() { if (!ok('cannon', 120)) return; tone('sine', 160, 60, 0.18, 0.35); noise(0.1, 0.2, 'lowpass', 1200, 300); },
  explosion(big) { if (!ok('boom', 90)) return; noise(big ? 0.7 : 0.45, big ? 0.6 : 0.45, 'lowpass', big ? 900 : 1400, 80, 0.7); tone('sine', 90, 35, big ? 0.5 : 0.35, 0.45); },
  frost() { if (!ok('frost', 110)) return; [1568, 2093, 2637].forEach((f, i) => tone('sine', f, f * 1.02, 0.25, 0.05, i * 0.03)); noise(0.18, 0.08, 'highpass', 5000, 8000); },
  freeze() { if (!ok('freeze', 200)) return; noise(0.35, 0.18, 'bandpass', 4000, 9000, 4); tone('triangle', 2400, 3200, 0.3, 0.06); },
  bolt() { if (!ok('bolt', 120)) return; tone('square', 220, 90, 0.12, 0.12); noise(0.15, 0.22, 'bandpass', 900, 400, 2); },
  clash() { if (!ok('clash', 140)) return; tone('square', 1800 + Math.random() * 400, 900, 0.05, 0.05); noise(0.05, 0.12, 'highpass', 4000, 3000); },
  coin() { if (!ok('coin', 60)) return; tone('square', 988, 0, 0.06, 0.06); tone('square', 1319, 0, 0.12, 0.06, 0.06); },
  build() { if (!ok('build', 100)) return; tone('sine', 180, 120, 0.12, 0.3); noise(0.08, 0.2, 'lowpass', 800, 200); tone('triangle', 660, 0, 0.1, 0.08, 0.08); },
  upgrade() { if (!ok('upgrade', 150)) return; [523, 659, 784, 1047].forEach((f, i) => tone('triangle', f, 0, 0.14, 0.09, i * 0.06)); },
  sell() { if (!ok('sell', 150)) return; [1047, 784, 659].forEach((f, i) => tone('triangle', f, 0, 0.1, 0.07, i * 0.05)); },
  horn() { if (!ok('horn', 600)) return; tone('sawtooth', 196, 0, 0.5, 0.12); tone('sawtooth', 294, 0, 0.6, 0.1, 0.35); tone('sine', 98, 0, 0.9, 0.12); },
  leak() { if (!ok('leak', 200)) return; tone('sine', 140, 70, 0.3, 0.35); tone('square', 110, 0, 0.12, 0.05); },
  heal() { if (!ok('heal', 400)) return; tone('sine', 880, 1320, 0.25, 0.04); },
  tap() { if (!ok('tap', 40)) return; tone('sine', 1200, 900, 0.04, 0.05); },
  win() { if (!ok('win', 1000)) return; [523, 659, 784, 1047, 1319].forEach((f, i) => tone('triangle', f, 0, 0.3, 0.12, i * 0.12)); },
  lose() { if (!ok('lose', 1000)) return; [392, 349, 311, 262].forEach((f, i) => tone('sawtooth', f, f * 0.98, 0.35, 0.07, i * 0.22)); },
  levelup() { if (!ok('lvl', 300)) return; [784, 988, 1175, 1568].forEach((f, i) => tone('square', f, 0, 0.12, 0.06, i * 0.07)); },
  boss() { if (!ok('bossroar', 2000)) return; tone('sawtooth', 110, 55, 1.0, 0.18); noise(0.9, 0.25, 'lowpass', 600, 120, 1); },
};
