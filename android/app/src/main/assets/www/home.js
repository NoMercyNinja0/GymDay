/* GymDay v1.27 Arrange your Today page: the person chooses which cards show on Today and in what order
   (settings.home = { order: [keys], hide: [keys] }). Hiding a card only takes it off Today; what it does stays on. The cards
   are found in Today's own page by their ids, so nothing that draws them had to change. Until the person arranges something,
   Today is exactly as before, with an "Arrange this page" link under its cards. */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !A.VIEWS || !A.VIEWS.days) return;
  const { esc, ACT, $, VIEWS } = A, D = S.data, toast = m => window.toast(m);
  // [key, the name in the list, how to find it on Today]
  const CARDS = [
    ['sleepw', 'Last night’s sleep, until it’s in', el => el.id === 'swCard'],                  // v1.32
    ['hero', 'Rings: today’s calories, or the week', el => el.id === 'kcCard' || el.id === 'weekHero'],
    ['tiles', 'Tiles: sleep, the week, readiness', el => el.classList.contains('tts')],
    ['next', 'Next workout', el => el.id === 'nextCard'],
    ['week7', 'Last 7 days in charts', el => el.id === 'diCard'],                    // v1.31
    ['today', 'Today in your weekly plan', el => el.id === 'todayCard'],
    ['fuel', 'Fuel for today’s workout', el => el.id === 'fuelCard'],
    ['shot', 'Add your watch’s screenshots', el => el.id === 'kcShotAsk'],
    ['goals', 'Goals', el => el.id === 'goalsHome'],
    ['stuck', 'Stuck for 4 weeks', el => el.id === 'stuckCard'],
    ['easy', 'Easy-week reminder', el => el.id === 'easyCard'],
    ['sore', 'How sore are you? (after a workout)', el => el.id === 'soreCard'],      // 1.35
    ['rec', 'Recovery', el => el.id === 'recCard'],
    ['trainer', 'Trainer and programs', el => el.id === 'trainerCard' || el.id === 'progCard'],
    ['busy', 'Busy week', el => el.id === 'busyCard'],
    ['bal', 'Balance my week', el => el.id === 'balCard'],
    ['pat', 'Patterns', el => el.id === 'patCard' || el.classList.contains('pat-g')],
    ['miss', 'Logged from your watch', el => el.id === 'missCard'],                 // v1.28
    ['harder', 'Ready for a harder move', el => el.id === 'harderCard'],
    ['mile', 'Next milestone', el => el.id === 'mileCard'],
    ['wrapd', 'Your year, wrapped', el => el.id === 'wrapCard'],
  ];
  const KEYS = CARDS.map(c => c[0]), nameOf = k => (CARDS.find(c => c[0] === k) || [k, k])[1];
  const keyOf = el => { for (const c of CARDS) if (c[2](el)) return c[0]; return ''; };
  function home() {
    // 1.35.2: until the person arranges Today, it starts with five kinds of card (Store.CALM_HIDE are hidden, not gone)
    const h = D.settings.home || (window.__calm === false ? {} : { hide: S.CALM_HIDE || [] }), order = (Array.isArray(h.order) ? h.order : []).filter(k => KEYS.includes(k)), hide = (Array.isArray(h.hide) ? h.hide : []).filter(k => KEYS.includes(k));
    return { order, hide, custom: !!(order.length || hide.length) };
  }
  // every card in the person's order: the ones they placed first, then the rest as Today has them
  const ordered = cfg => cfg.order.concat(KEYS.filter(k => !cfg.order.includes(k)));
  const LINK = `<button class="linkish home-arr" data-act="homeArrange">⇅ Arrange this page</button>`;
  const h0 = VIEWS.days.html;
  VIEWS.days.html = function (p) {
    const h = h0.call(this, p);
    const t = document.createElement('template'); t.innerHTML = h;
    const kids = [...t.content.children], a = kids.findIndex(el => keyOf(el));
    if (a < 0) return h;
    let b = kids.findIndex((el, i) => i > a && (el.classList.contains('empty') || (el.classList.contains('sec-h') && !/at a glance/i.test(el.textContent))));
    if (b < 0) b = kids.length;
    const region = kids.slice(a, b), anchor = kids[b] || null, cfg = home(), link = document.createElement('template'); link.innerHTML = LINK;
    if (!cfg.custom) { t.content.insertBefore(link.content, anchor); return t.innerHTML; }
    const rank = k => { const i = ordered(cfg).indexOf(k); return i >= 0 ? i : 1000; };
    const items = region.filter(el => !el.classList.contains('sec-h')).map((el, i) => ({ el, k: keyOf(el) || 'other', i }));
    region.forEach(el => el.remove());
    items.filter(x => !cfg.hide.includes(x.k)).sort((x, y) => rank(x.k) - rank(y.k) || x.i - y.i).forEach(x => t.content.insertBefore(x.el, anchor));
    t.content.insertBefore(link.content, anchor);
    return t.innerHTML;
  };
  // ---------------- the sheet: drag ≡ (or ↑ ↓) to order, the switch to show or hide
  const rowHtml = (k, cfg) => `<div class="row ar-row" data-k="${k}"><span class="ar-grip" aria-hidden="true">≡</span><span class="grow small" style="font-weight:600">${esc(nameOf(k))}</span>
    <button class="ib ar-mv" data-act="homeMove" data-k="${k}" data-d="-1" aria-label="Move ${esc(nameOf(k))} up">↑</button><button class="ib ar-mv" data-act="homeMove" data-k="${k}" data-d="1" aria-label="Move ${esc(nameOf(k))} down">↓</button>
    <input type="checkbox" data-bind="homeShow" data-k="${k}" ${cfg.hide.includes(k) ? '' : 'checked'} aria-label="Show ${esc(nameOf(k))} on Today"></div>`;
  // 1.33: without a watch (watch.js) the three cards a watch brings are not on the list; their place in the order is kept
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const WATCH_KEYS = ['sleepw', 'shot', 'miss'], shown = k => wOn() || !WATCH_KEYS.includes(k);
  const listHtml = () => { const cfg = home(); return ordered(cfg).map(k => (shown(k) ? rowHtml(k, cfg) : `<div class="ar-row" data-k="${k}" hidden></div>`)).join(''); };
  const save = (order, hide) => { const cfg = home(); D.settings.home = { order: order || ordered(cfg), hide: hide || cfg.hide }; S.save(true); };
  function mount(sh) {
    const list = sh.querySelector('#arList'); if (!list) return;
    let dg = null;
    list.addEventListener('pointerdown', e => {
      const g = e.target.closest('.ar-grip'); if (!g) return;
      e.preventDefault(); dg = { row: g.closest('.ar-row') }; dg.row.classList.add('ar-lift');
      try { g.setPointerCapture(e.pointerId); } catch (x) { }
    });
    list.addEventListener('pointermove', e => {
      if (!dg) return;
      const over = [...list.querySelectorAll('.ar-row')].find(r => { if (r === dg.row) return false; const b = r.getBoundingClientRect(); return e.clientY >= b.top && e.clientY <= b.bottom; });
      if (!over) return;
      const b = over.getBoundingClientRect(); list.insertBefore(dg.row, e.clientY > b.top + b.height / 2 ? over.nextSibling : over);
    });
    const end = () => { if (!dg) return; dg.row.classList.remove('ar-lift'); dg = null; save([...list.querySelectorAll('.ar-row')].map(r => r.dataset.k)); };
    list.addEventListener('pointerup', end); list.addEventListener('pointercancel', end);
  }
  ACT.homeArrange = () => {
    A.openSheet(`<h2>Arrange your Today page</h2><p class="small muted">Drag ≡ (or use ↑ ↓) to change the order. Switch a card off to take it off Today; what it does stays on. Some cards only show when they have something to say.</p>
      <div class="card mt12 ar-list" id="arList">${listHtml()}</div>
      <div class="row mt12"><button class="btn grow" data-act="homeReset">Back to the usual</button><button class="btn primary grow" data-act="closeSheet">Done</button></div>`, mount, () => { if (A.top().name === 'days') A.rerender(); });
  };
  ACT.homeMove = el => {
    const cfg = home(), o = ordered(cfg), i = o.indexOf(el.dataset.k), d = +el.dataset.d || 0; let j = i + d;
    while (j >= 0 && j < o.length && !shown(o[j])) j += d;                 // over the cards that are not on the list
    if (i < 0 || !d || j < 0 || j >= o.length) return;
    o.splice(j, 0, o.splice(i, 1)[0]); save(o);
    const l = $('#arList'); if (l) l.innerHTML = listHtml();
    const b = document.querySelector(`.ar-mv[data-k="${el.dataset.k}"][data-d="${el.dataset.d}"]`); if (b) b.focus();
  };
  ACT.homeReset = () => { delete D.settings.home; S.save(true); const l = $('#arList'); if (l) l.innerHTML = listHtml(); toast('Today is back to the usual order'); };
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bind !== 'homeShow') return;
    const cfg = home(), k = t.dataset.k, hide = cfg.hide.filter(x => x !== k); if (!t.checked) hide.push(k);
    save(null, hide);
  });
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => `<div class="row" style="padding:6px 0"><div class="grow">Arrange the Today page<div class="xs dim">Which cards show on Today, and in what order</div></div><button class="btn sm" data-act="homeArrange">Arrange</button></div>`);
  window.Home = { CARDS, KEYS, home, ordered, keyOf };
})();
