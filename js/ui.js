// Shared UI helpers: modal, toast, bottom sheet, inline SVG icons.
export const $ = id => document.getElementById(id);
export const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

export const ICON = {
  heart: '<svg class="ico" viewBox="0 0 24 24"><path fill="#ef5a4a" stroke="#4a120c" stroke-width="1.5" d="M12 21s-7.5-4.6-9.5-9.2C1.1 8.5 3.3 5 6.8 5c2 0 3.6 1.1 5.2 3 1.6-1.9 3.2-3 5.2-3 3.5 0 5.7 3.5 4.3 6.8C19.5 16.4 12 21 12 21z"/><ellipse cx="8" cy="9" rx="2" ry="1.3" fill="rgba(255,255,255,.45)"/></svg>',
  coin: '<svg class="ico" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="#f2c443" stroke="#7a4e10" stroke-width="1.6"/><circle cx="12" cy="12" r="5.6" fill="none" stroke="#b98424" stroke-width="1.4"/><ellipse cx="9" cy="8.5" rx="2.4" ry="1.4" fill="rgba(255,255,255,.55)"/></svg>',
  star: (on = true, size = 18) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24"><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="${on ? '#ffd24a' : 'rgba(255,255,255,.18)'}" stroke="${on ? '#8a5a10' : 'rgba(255,255,255,.25)'}" stroke-width="1.4" stroke-linejoin="round"/></svg>`,
  bigStar: '<svg viewBox="0 0 24 24"><defs><linearGradient id="sg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff2b0"/><stop offset=".55" stop-color="#ffcc33"/><stop offset="1" stop-color="#d48a12"/></linearGradient></defs><path d="M12 2.5l2.9 6 6.6.9-4.8 4.6 1.2 6.5L12 17.4l-5.9 3.1 1.2-6.5L2.5 9.4l6.6-.9z" fill="url(#sg)" stroke="#7a4a08" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  back: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M15 5l-7 7 7 7"/></svg>',
  close: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  lock: '<svg class="ico" viewBox="0 0 24 24"><rect x="5" y="10.5" width="14" height="10" rx="2.5" fill="#d8cdb8" stroke="#2a1d12" stroke-width="1.5"/><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" fill="none" stroke="#efe6d2" stroke-width="2.2"/></svg>',
  sword: '<svg class="ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M14.5 4H20v5.5L9 20.5 3.5 15z"/><path d="M5 13l6 6M3 21l3-3"/></svg>',
};

let toastTimer = null;
export function toast(text, ms = 1700) {
  const el = $('toast'); el.textContent = text; el.classList.remove('hidden');
  el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
  clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
}

// actions: [{label, cls, onClick, keepOpen}]
export function modal({ title, text = '', html = '', actions = [] }) {
  const el = $('modal');
  el.innerHTML = `<div class="box glass-strong"><h3>${esc(title)}</h3>${text ? `<p>${esc(text)}</p>` : ''}${html}<div class="acts">${actions.map((a, i) => `<button class="btn btn-block ${a.cls || ''}" data-i="${i}">${a.label}</button>`).join('')}</div></div>`;
  el.classList.remove('hidden');
  el.onclick = e => {
    const b = e.target.closest('button[data-i]');
    if (!b) return;
    const a = actions[+b.dataset.i];
    if (!a.keepOpen) closeModal();
    a.onClick && a.onClick();
  };
}
export function closeModal() { const el = $('modal'); el.classList.add('hidden'); el.innerHTML = ''; el.onclick = null; }
export function modalOpen() { return !$('modal').classList.contains('hidden'); }

// generic bottom sheet; returns close fn. bind(rootEl, close) wires events.
export function bottomSheet(html, bind) {
  const wrap = document.createElement('div'); wrap.className = 'bsheet-wrap';
  wrap.innerHTML = `<div class="bsheet glass-strong">${html}</div>`;
  document.body.appendChild(wrap);
  const close = () => wrap.remove();
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
  bind && bind(wrap.firstElementChild, close);
  return close;
}
export function fmt(n) { return Math.round(n).toLocaleString('en-US'); }
