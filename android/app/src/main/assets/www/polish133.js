/* GymDay 1.33 – the small things that make the app quicker to use, all in one place:
   bold letters in search results (Mark), a glow on a new row (Glow), a fast second tap that counts once, the current tab
   scrolling back to the top, the Clubs tab only when signed in, a ↑ Top button on long pages, Enter / Done on the keyboard
   moving on and saving, sheets that keep the box being typed in above the keyboard and the Save button in reach, typing
   kept when a sheet is closed by mistake, pictures that load as you scroll and fade in, and placeholders while waiting. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc } = A;
  const calm = () => document.documentElement.classList.contains('calm') || (window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);

  // ---------------------------------------------------------------- (22) the letters typed, in bold
  const fold1 = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  function Mark(name, q, alts) {
    const toks = fold1(q).replace(/[^a-z0-9%]+/g, ' ').trim().split(' ').filter(Boolean);
    if (!toks.length) return esc(name);
    const set = new Set();
    toks.forEach(t => { (alts ? alts(t) : [t]).forEach(a => { const w = fold1(a).replace(/[^a-z0-9%]+/g, ' ').trim().split(' ')[0]; if (w) set.add(w); }); set.add(t); });
    const needles = [...set].sort((a, b) => b.length - a.length);
    return String(name).split(/([^A-Za-z0-9À-ɏ%]+)/).map(part => {
      const f = fold1(part); if (!f || !/[a-z0-9]/.test(f)) return esc(part);
      const n = needles.find(a => f.startsWith(a)); if (!n) return esc(part);
      const k = f.length === part.length ? n.length : part.length;
      return `<b class="mk">${esc(part.slice(0, k))}</b>${esc(part.slice(k))}`;
    }).join('');
  }
  window.Mark = Mark;

  // ---------------------------------------------------------------- (33) a new row glows once, so you see where it went
  function Glow(el, scroll) {
    if (!el) return;
    if (scroll) { const r = el.getBoundingClientRect(); if (r.top < 60 || r.bottom > innerHeight - 90) el.scrollIntoView({ block: 'center', behavior: calm() ? 'auto' : 'smooth' }); }
    if (calm()) return;
    el.classList.remove('glow133'); void el.offsetWidth; el.classList.add('glow133');
    setTimeout(() => el.classList.remove('glow133'), 1200);
  }
  window.Glow = Glow;
  // glow whatever has data-glow on the next drawing of the page (a module sets A.glowNext = [ids or selectors])
  const after0 = A.afterRender;
  A.afterRender = name => {
    if (after0) after0(name);
    clubsTab(); topBtn();
    const g = A.glowNext; A.glowNext = null;
    if (g && g.length) requestAnimationFrame(() => g.forEach((s, i) => { const el = typeof s === 'string' ? document.querySelector(s) : s; if (el) Glow(el, i === 0); }));
    lazyPics();
  };

  // ---------------------------------------------------------------- (24) a fast second tap on Add, Save or Finish counts once
  const REPEAT = /(More|Less|Plus|Minus|Step|Bump|Inc|Dec|Num|Key|Digit|Prev|Next|Tog|Frac|Tab|Sort|Unit|Mode|Size|Bone|Gv|Rice|Rq|Dym|Zoom|Page|Dot|Day|Meal|Swipe|Pick|Chip|Filter|Cu)$/;
  const COMMIT = /(Add|Save|Finish|Done|Create|Send|Post|Join|Import|Upload|Log|Go|Copy|Repeat|Quick|Use|Start|Apply|Set|Keep|Confirm|Yes|Ok)$/;
  let lastTap = null;
  document.addEventListener('click', e => {
    const el = e.target.closest && e.target.closest('[data-act]'); if (!el) return;
    const act = el.dataset.act || '';
    if (REPEAT.test(act) || !(COMMIT.test(act) || el.classList.contains('primary'))) return;
    const now = Date.now();
    if (lastTap && lastTap.act === act && lastTap.el === el && now - lastTap.t < 350) { e.stopImmediatePropagation(); e.preventDefault(); return; }
    lastTap = { act, el, t: now };
  }, true);
  // typing in between makes the next tap a new one (Save, fix the number, Save again)
  document.addEventListener('input', () => { lastTap = null; }, true);
  document.addEventListener('change', () => { lastTap = null; }, true);

  // ---------------------------------------------------------------- (19) the tab you are on: back to its top, smoothly
  const nav = $('#nav');
  if (nav) nav.addEventListener('click', e => {
    const b = e.target.closest('[data-nav]'); if (!b) return;
    if (A.depth() === 1 && A.top().name === b.dataset.nav && window.scrollY > 4 && !document.querySelector('#sheet:not(.hidden)')) {
      e.stopImmediatePropagation(); window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
    }
  }, true);

  // ---------------------------------------------------------------- (14) the Clubs tab once you are signed in
  // (signed out, Clubs is in Settings under Account and in the search, so it is moved, never gone)
  function clubsTab() {
    const b = document.querySelector('.nav-btn[data-nav="clubs"]'); if (!b) return;
    const C = window.Cloud, on = !C || !C.signedIn || C.signedIn() || A.top().name === 'clubs' || (S.meta && S.meta.pendingJoin);
    b.style.display = on ? '' : 'none';
  }
  A.clubsTab = clubsTab;

  // ---------------------------------------------------------------- (12) ↑ Top on long pages
  let tb = null;
  function topBtn() {
    if (!tb) {
      tb = document.createElement('button'); tb.className = 'top133'; tb.type = 'button'; tb.hidden = true; tb.setAttribute('aria-label', 'Back to the top');
      tb.innerHTML = '<span aria-hidden="true">↑</span> Top';
      tb.addEventListener('click', () => { window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' }); });
      document.body.appendChild(tb);
    }
    tbCheck();
  }
  // it shows when the page is being scrolled back up (the way to the top), and keeps out of the way while reading on down:
  // sitting over the bottom of the list, it would otherwise take the touch meant for the row under it
  let tbY = 0, tbUp = false;
  function tbCheck() {
    if (!tb) return;
    const y = window.scrollY; if (y < tbY - 4) tbUp = true; else if (y > tbY + 4) tbUp = false; tbY = y;
    const long = document.documentElement.scrollHeight > innerHeight * 2.2, far = y > innerHeight * 1.2;
    const show = long && far && tbUp && !document.body.classList.contains('no-nav') && !document.body.classList.contains('typing') && !document.body.classList.contains('kc-dragging');
    if (tb.hidden === show) tb.hidden = !show;
  }
  let tbT = 0;
  window.addEventListener('scroll', () => { if (!tbT) tbT = requestAnimationFrame(() => { tbT = 0; tbCheck(); }); }, { passive: true });

  // ---------------------------------------------------------------- (21) Enter / Done: on to the next box, and from the last one, save
  const sheet = $('#sheet');
  // boxes that already do something of their own on Enter (send, save, search): left to themselves
  const OWN = new Set(['kcQ', 'kcOutQ', 'kcMenuQ', 'kcMenuP', 'kcPkG', 'rcLink', 'spQ', 'findQ', 'dayNameIn', 'maxIn', 'authEmail', 'authCode', 'authName', 'acctNameIn', 'clubNameIn', 'clubCodeIn', 'chatIn', 'cmIn', 'bodyIn', 'measIn']);
  const boxes = p => [...p.querySelectorAll('input:not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]):not([type=search]):not([disabled]), select:not([disabled])')].filter(i => i.offsetParent !== null && !i.closest('[hidden]'));
  const mainBtn = p => { const l = [...p.querySelectorAll('.btn.primary:not([disabled])')].filter(b => b.offsetParent !== null && !b.hidden); return l[l.length - 1] || null; };
  function hints(p) {
    const l = boxes(p).filter(i => i.tagName === 'INPUT' && !OWN.has(i.id) && !i.hasAttribute('enterkeyhint'));
    const all = boxes(p);
    l.forEach(i => { const at = all.indexOf(i); i.setAttribute('enterkeyhint', at >= 0 && at < all.length - 1 ? 'next' : mainBtn(p) ? 'done' : 'enter'); });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || e.defaultPrevented || e.isComposing) return;
    const t = e.target; if (!t || t.tagName !== 'INPUT' || OWN.has(t.id) || t.type === 'search' || t.dataset.noenter != null || t.getAttribute('enterkeyhint') === 'search') return;
    const p = t.closest('#sheet .panel'); if (!p) return;
    const all = boxes(p), at = all.indexOf(t);
    e.preventDefault();
    if (at >= 0 && at < all.length - 1) { const n = all[at + 1]; n.focus(); if (n.select && n.tagName === 'INPUT') try { n.select(); } catch (x) { } return; }
    const b = mainBtn(p); t.blur(); if (b) b.click();
  });

  // ---------------------------------------------------------------- (23) the keyboard never hides the box; (28) Save stays in reach
  const vv = window.visualViewport;
  function fit() { if (vv) document.documentElement.style.setProperty('--vvh', Math.round(vv.height) + 'px'); }
  if (vv) { vv.addEventListener('resize', () => { fit(); keepSeen(); }); fit(); }
  // a box that brings up the keyboard (a switch or a tick box does not, and scrolling back to one would undo the person's own scrolling)
  const typing = a => a.tagName === 'TEXTAREA' || a.tagName === 'SELECT' || (a.tagName === 'INPUT' && !/^(checkbox|radio|range|button|submit|reset|color|file|hidden|image)$/.test(a.type));
  function keepSeen() {
    const a = document.activeElement; if (!a || !a.closest || !a.closest('#sheet .panel') || !typing(a)) return;
    const r = a.getBoundingClientRect(), h = vv ? vv.height + vv.offsetTop : innerHeight;
    if (r.bottom > h - 12 || r.top < 8) a.scrollIntoView({ block: 'center', behavior: 'auto' });
  }
  document.addEventListener('focusin', e => { if (e.target.closest && e.target.closest('#sheet .panel')) setTimeout(keepSeen, 320); });
  function stickSave(p) {
    if (!p || p.scrollHeight <= p.clientHeight + 40) return;
    const b = mainBtn(p); if (!b) return;
    let row = b; while (row.parentElement && row.parentElement !== p) row = row.parentElement;
    if (row === b || row.querySelector('input, textarea, select, .kc-list, .list-item')) return;
    const kids = [...p.children].filter(c => c.offsetParent !== null && !c.classList.contains('handle'));
    if (kids[kids.length - 1] === row) row.classList.add('stick133');
  }

  // ---------------------------------------------------------------- (32) what you typed is kept if a sheet is closed by mistake
  const DR = () => (S.meta.drafts && typeof S.meta.drafts === 'object' ? S.meta.drafts : (S.meta.drafts = {}));
  let cur = null;          // { sig, base: {id: value}, el: panel }
  // (a search box is never kept: typing in one is looking, not writing)
  const isSearch = i => /q$/i.test(i.id) || i.getAttribute('enterkeyhint') === 'search' || /^search/i.test(i.placeholder || '') || OWN.has(i.id);
  const fields = p => [...p.querySelectorAll('input[id], textarea[id]')].filter(i => !/^(checkbox|radio|file|range|search|password|hidden)$/.test(i.type) && !isSearch(i) && !i.dataset.nodraft);
  const sigOf = p => { const h = p.querySelector('h2'), f = fields(p); return f.length ? ((h ? h.textContent.trim().slice(0, 60) : '') + '|' + f.map(i => i.id).sort().join(',')) : ''; };
  function opened(p) {
    const sig = sigOf(p); if (!sig) { cur = null; return; }
    const base = {}; fields(p).forEach(i => { base[i.id] = i.value; });
    cur = { sig, base, el: p };
    const d = DR()[sig];
    if (!d) return;
    if (Date.now() - d.t > 86400000 || Object.keys(d.base).some(k => base[k] !== d.base[k])) { delete DR()[sig]; S.saveMeta(); return; }
    let back = 0; fields(p).forEach(i => { if (d.vals[i.id] != null && d.vals[i.id] !== i.value) { i.value = d.vals[i.id]; back++; i.dispatchEvent(new Event('input', { bubbles: true })); } });
    if (back) { const n = document.createElement('p'); n.className = 'xs draft133'; n.innerHTML = 'What you typed last time is back. <button class="linkish" type="button">Clear it</button>';
      n.querySelector('button').addEventListener('click', () => { fields(p).forEach(i => { if (base[i.id] != null) { i.value = base[i.id]; i.dispatchEvent(new Event('input', { bubbles: true })); } }); delete DR()[sig]; S.saveMeta(); n.remove(); });
      const h = p.querySelector('h2'); if (h) h.insertAdjacentElement('afterend', n); else p.prepend(n); }
  }
  let dT = 0;
  document.addEventListener('input', e => {
    if (!cur || !e.target.closest || !cur.el.contains(e.target) || !e.target.id || !fields(cur.el).includes(e.target)) return;
    clearTimeout(dT); dT = setTimeout(() => {
      if (!cur || !cur.el.isConnected) return;
      const vals = {}; let changed = false; fields(cur.el).forEach(i => { vals[i.id] = i.value; if (i.value !== cur.base[i.id]) changed = true; });
      if (changed) DR()[cur.sig] = { base: cur.base, vals, t: Date.now() }; else delete DR()[cur.sig];
      const ks = Object.keys(DR()); if (ks.length > 12) ks.sort((a, b) => DR()[a].t - DR()[b].t).slice(0, ks.length - 12).forEach(k => delete DR()[k]);
      S.saveMeta();
    }, 350);
  }, true);
  // saving (the main button) means the draft is done; if the sheet is still there afterwards (a check failed), it is kept again
  document.addEventListener('click', e => {
    const b = e.target.closest && e.target.closest('#sheet .btn.primary'); if (!b || !cur) return;
    const c = cur; clearTimeout(dT);
    if (DR()[c.sig]) { delete DR()[c.sig]; S.saveMeta(); }
    setTimeout(() => { if (c.el.isConnected && cur === c) { const vals = {}; let ch = false; fields(c.el).forEach(i => { vals[i.id] = i.value; if (i.value !== c.base[i.id]) ch = true; }); if (ch) { DR()[c.sig] = { base: c.base, vals, t: Date.now() }; S.saveMeta(); } } }, 400);
  }, true);

  // a sheet opening: Enter hints, the Save row, the draft
  if (sheet) new MutationObserver(() => {
    const p = sheet.querySelector('.panel');
    if (!p || sheet.classList.contains('hidden')) { cur = null; return; }
    if (p.dataset.p133) return; p.dataset.p133 = '1';
    hints(p); opened(p); requestAnimationFrame(() => stickSave(p)); lazyPics(p);
  }).observe(sheet, { childList: true });

  // ---------------------------------------------------------------- (13, 36) pictures load as they come into view, and fade in
  function lazyPics(root) {
    (root || document).querySelectorAll('img.thumb:not([data-f133]), .lib-img img:not([data-f133]), img.ex-img:not([data-f133])').forEach(img => {
      img.dataset.f133 = '1'; if (!img.hasAttribute('loading')) img.loading = 'lazy'; img.decoding = 'async';
      if (img.complete && img.naturalWidth) return;
      img.classList.add('fade133'); img.addEventListener('load', () => img.classList.add('in'), { once: true }); img.addEventListener('error', () => img.classList.add('in'), { once: true });
    });
  }

  // ---------------------------------------------------------------- (2, 48) the 1.32 look for every chart: round numbers on the left
  const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  const niceUp = x => { if (!(x > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))); for (const m of NICE) if (m * e >= x - 1e-9) return m * e; return 10 * e; };
  // three round numbers from at most lo to at least hi (never below 0 when floor0)
  A.ticks3 = (lo, hi, floor0) => {
    if (!(hi > lo)) { const d = Math.max(Math.abs(lo) * 0.05, 1); lo -= d; hi += d; }
    let st = niceUp((hi - lo) / 2), a = Math.floor(lo / st + 1e-9) * st;
    for (let k = 0; k < 12 && a + 2 * st < hi - 1e-9; k++) { st = niceUp(st * 1.001); a = Math.floor(lo / st + 1e-9) * st; }
    if (floor0 && a < 0) { a = 0; while (2 * st < hi - 1e-9) st = niceUp(st * 1.001); }
    const r = v => Math.round(v * 1e6) / 1e6;
    return [r(a), r(a + st), r(a + 2 * st)];
  };
  A.gridY = (ticks, yOf, x0, x1) => ticks.map(t => `<line class="di-grid" x1="${x0}" x2="${x1}" y1="${yOf(t).toFixed(1)}" y2="${yOf(t).toFixed(1)}"/>`).join('');
  A.withY = (svg, ticks, yOf, H, fmt, cls) => `<div class="di-plot y133${cls ? ' ' + cls : ''}"><div class="di-y" aria-hidden="true">${ticks.map(t => `<span style="top:${(yOf(t) / H * 100).toFixed(2)}%">${esc(fmt ? fmt(t) : String(t))}</span>`).join('')}</div>${svg}</div>`;

  // ---------------------------------------------------------------- (46) no dead ends: Back closes whatever is open first
  // (the number pad, a chart's reading, the ↑ Top button's page jump is nothing to close), and only then goes back a screen
  const back0 = window.appBack;
  window.appBack = () => {
    const pad = document.getElementById('npad');
    if (pad && !pad.classList.contains('hidden')) { const x = pad.querySelector('[data-k="close"]'); if (x) { x.click(); return true; } }
    const tip = document.getElementById('scrubTip'); if (tip && !tip.classList.contains('hidden')) { tip.classList.add('hidden'); }
    if (A.backHook && A.backHook()) return true;          // a page in a mode of its own (ticking foods) leaves that mode first
    return back0 ? back0() : false;
  };

  // ---------------------------------------------------------------- (31) while waiting: grey placeholder rows that shimmer, not a blank
  A.skel = (n, cls) => `<div class="skel133${cls ? ' ' + cls : ''}" aria-busy="true" aria-label="Loading">${Array.from({ length: n || 3 }, (_, i) => `<div class="skel-row"><span class="skel-dot"></span><span class="skel-line" style="width:${[72, 54, 64, 48][i % 4]}%"></span></div>`).join('')}</div>`;
})();
