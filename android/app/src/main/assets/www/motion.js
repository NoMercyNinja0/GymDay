/* GymDay – motion and touch: screens that slide in, sheets you can swipe down, swiping between the main tabs,
   a ripple and a light buzz under your finger, bars that grow, and a little confetti for a record or a badge.
   Nothing here changes what the app does; with "reduce motion" switched on in the phone the animations are skipped. */
(function () {
  const A = window.App, S = window.Store;
  const $ = s => document.querySelector(s);
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const buzz = ms => { try { if (S.isAndroid && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  const sheetOpen = () => !$('#sheet').classList.contains('hidden');

  // ---------------- screens: forward slides in from the right, back from the left, a tab change rises ----------------
  let lastName = '', lastDepth = 0, clearT = null;
  const after0 = A.afterRender;
  A.afterRender = name => {
    if (after0) after0(name);
    const depth = A.depth(), v = $('#view');
    const kind = name === lastName ? '' : depth > lastDepth ? 'f' : depth < lastDepth ? 'b' : 't';
    lastName = name; lastDepth = depth;
    if (!kind || !v || calm()) return;
    v.classList.remove('vin-f', 'vin-b', 'vin-t'); void v.offsetWidth; v.classList.add('vin-' + kind);
    clearTimeout(clearT); clearT = setTimeout(() => v.classList.remove('vin-f', 'vin-b', 'vin-t'), 520);
  };

  // ---------------- sheets: drag down to close; a closing sheet slides away instead of vanishing ----------------
  let drag = null;
  const sheet = $('#sheet');
  sheet.addEventListener('touchstart', e => {
    const panel = sheet.querySelector('.panel'); if (!panel || e.touches.length !== 1) return;
    const t = e.target;
    if (!panel.contains(t) || panel.scrollTop > 0) return;
    if (t.closest('input, textarea, select, .chat-list, .cm-list, .bz.zoomed, [data-nodrag]')) return;      // 1.35: a zoomed body map drags the body
    const inner = t.closest('.cm-list, .chat-list'); if (inner && inner.scrollTop > 0) return;
    drag = { panel, y: e.touches[0].clientY, x: e.touches[0].clientX, t: Date.now(), dy: 0, on: false };
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!drag) return;
    if (e.touches.length > 1) {          // 1.35: a second finger (a pinch on a body map) is never a drag of the sheet
      const d = drag; drag = null;
      if (d.on) { sheet.style.removeProperty('--veil-o'); d.panel.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; d.panel.style.transform = ''; setTimeout(() => { d.panel.style.transition = ''; }, 220); }
      return;
    }
    const dy = e.touches[0].clientY - drag.y, dx = e.touches[0].clientX - drag.x;
    if (!drag.on) {
      if (dy < -6 || Math.abs(dx) > Math.abs(dy) + 6) { drag = null; return; }      // scrolling up or sideways: not ours
      if (dy < 8) return;
      drag.on = true; drag.panel.style.transition = 'none'; drag.panel.style.animation = 'none';
    }
    drag.dy = Math.max(0, dy);
    drag.panel.style.transform = `translateY(${drag.dy}px)`;
    sheet.style.setProperty('--veil-o', String(Math.max(0.25, 1 - drag.dy / 420)));
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  const endDrag = () => {
    if (!drag) return; const d = drag; drag = null; if (!d.on) return;
    const fast = d.dy / Math.max(1, Date.now() - d.t) > 0.55;
    sheet.style.removeProperty('--veil-o');
    if (d.dy > 110 || (fast && d.dy > 40)) { buzz(6); d.panel.style.transform = ''; A.closeSheet(d.dy); }
    else { d.panel.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1)'; d.panel.style.transform = ''; setTimeout(() => { d.panel.style.transition = ''; }, 220); }
  };
  sheet.addEventListener('touchend', endDrag); sheet.addEventListener('touchcancel', endDrag);
  // Called by closeSheet just before the sheet is emptied: leaves a picture of it that slides down and fades.
  function ghost(s, from) {
    if (calm()) return;
    const panel = s.querySelector('.panel'); if (!panel) return;
    const g = document.createElement('div'); g.className = 'sheet-ghost';
    g.innerHTML = `<div class="panel">${panel.innerHTML.replace(/\s(data-act|data-bind|id|name)="[^"]*"/g, '')}</div>`;
    const gp = g.firstChild; gp.scrollTop = panel.scrollTop; if (typeof from === 'number' && from > 0) gp.style.setProperty('--from', from + 'px');
    document.body.appendChild(g); setTimeout(() => g.remove(), 260);
  }

  // 1.35.2: the swipe left / right on a page that changed the main tab is gone (it was easy to set off while scrolling a row
  // sideways, and it went in an old order). Tabs change by tapping the bottom bar, or by sliding a finger along it (below).
  // ---------------- a ripple where you touch, and a light buzz on the main controls ----------------
  const RIP = '.btn, .chip, .nav-btn, .card.tap, .ex-card, .opt, .stat.tap, .bdg';
  document.addEventListener('pointerdown', e => {
    if (calm() || e.button > 0) return;
    const el = e.target.closest && e.target.closest(RIP); if (!el || el.disabled) return;
    const r = el.getBoundingClientRect(), d = Math.max(r.width, r.height) * 2, s = document.createElement('span');
    s.className = 'rip'; s.style.width = s.style.height = d + 'px'; s.style.left = (e.clientX - r.left - d / 2) + 'px'; s.style.top = (e.clientY - r.top - d / 2) + 'px';
    el.appendChild(s); setTimeout(() => s.remove(), 520);
  }, { passive: true });
  document.addEventListener('click', e => { if (e.target.closest && e.target.closest('.nav-btn, .btn.primary, .chip, .rxpick button, .fab')) buzz(8); }, true);

  // ---------------- confetti when the "Workout saved" sheet shows a record, a reached goal or a new badge ----------------
  function celebrate() {
    if (calm()) return;
    const box = document.createElement('div'); box.className = 'confetti';
    const cols = ['#22E3FF', '#3D9BFF', '#34E3A0', '#FFFFFF', '#7CB8FF'];
    for (let i = 0; i < 26; i++) {
      const p = document.createElement('i');
      p.style.left = (8 + Math.random() * 84) + '%'; p.style.background = cols[i % cols.length];
      p.style.animationDelay = (Math.random() * 0.25) + 's'; p.style.animationDuration = (1.1 + Math.random() * 0.7) + 's';
      p.style.setProperty('--dx', (Math.random() * 120 - 60) + 'px'); p.style.setProperty('--rot', (Math.random() * 720 - 360) + 'deg');
      box.appendChild(p);
    }
    document.body.appendChild(box); buzz(20); setTimeout(() => box.remove(), 2200);
  }
  new MutationObserver(() => { const h2 = sheet.querySelector('.panel h2'); if (h2 && /Workout saved/.test(h2.textContent) && sheet.querySelector('.pr') && !sheet.dataset.party) { sheet.dataset.party = '1'; celebrate(); } if (!sheet.querySelector('.panel')) delete sheet.dataset.party; })
    .observe(sheet, { childList: true });

  window.Motion = { ghost, celebrate };
})();

/* ---------------------------------------------------------------------------------------------------
   v1.7 – the bottom bar's sliding highlight and drag, and small touch details:
   hold − / + to run a weight up or down, tap a number to replace it, Next on the keyboard walks
   weight → reps → next set, a ticked set pops, finishing an exercise glides to the next one,
   "Removed · Undo" for small removals, pull down to refresh where a screen can be refreshed,
   numbers that count up when a screen opens, press and hold a day for its quick actions.
   --------------------------------------------------------------------------------------------------- */
(function () {
  const A = window.App, S = window.Store, D = S.data, ACT = A.ACT;
  const $ = s => document.querySelector(s), $$ = s => [...document.querySelectorAll(s)];
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const buzz = ms => { try { if (S.isAndroid && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  const nav = $('#nav');

  // ---------------- bottom bar: one highlight that slides, and that follows a finger dragged along the bar; the screen changes as it goes ----------------
  const pill = document.createElement('span'); pill.id = 'navpill'; nav.insertBefore(pill, nav.firstChild); nav.classList.add('has-pill');
  const btns = () => $$('#nav .nav-btn').filter(b => !b.hidden && b.offsetWidth > 0 && getComputedStyle(b).display !== 'none');          // 1.35.2: not a hidden tab (Clubs when signed out)
  function place(b, instant) {
    if (!b) { pill.style.opacity = '0'; return; }
    pill.style.transition = instant || calm() ? 'none' : '';
    pill.style.opacity = '1'; pill.style.width = b.offsetWidth + 'px'; pill.style.transform = `translateX(${b.offsetLeft}px)`;
  }
  const placeOn = instant => place($('#nav .nav-btn.on'), instant);
  let first = true;
  const after1 = A.afterRender;
  A.afterRender = name => { if (after1) after1(name); if (!nav.classList.contains('dragging')) placeOn(first); first = false; };      // while a finger slides the highlight, the finger places it
  window.addEventListener('resize', () => placeOn(true));
  placeOn(true);

  let nd = null;                                   // a drag along the bar
  nav.addEventListener('touchstart', e => { if (e.touches.length === 1) nd = { x: e.touches[0].clientX, on: false, to: null }; }, { passive: true });
  nav.addEventListener('touchmove', e => {
    if (!nd) return; const x = e.touches[0].clientX;
    if (!nd.on) { if (Math.abs(x - nd.x) < 12) return; nd.on = true; pill.style.transition = 'none'; nav.classList.add('dragging'); }
    const r = nav.getBoundingClientRect(), list = btns(), w = list[0].offsetWidth;
    const min = list[0].offsetLeft, max = list[list.length - 1].offsetLeft;
    pill.style.transform = `translateX(${Math.max(min, Math.min(max, x - r.left - w / 2))}px)`;
    const b = list.reduce((best, cur) => (Math.abs(cur.offsetLeft + w / 2 - (x - r.left)) < Math.abs(best.offsetLeft + w / 2 - (x - r.left)) ? cur : best), list[0]);
    if (b !== nd.to) { nd.to = b; list.forEach(q => q.classList.toggle('aim', q === b)); switchTo(b); }
    if (e.cancelable) e.preventDefault();
  }, { passive: false });
  // the screen changes as soon as the finger reaches another tab, not when it lifts; one redraw per frame at most
  let wantTab = null, tabFrame = 0;
  const goNow = () => { tabFrame = 0; const b = wantTab; wantTab = null; if (b && !b.classList.contains('on')) { buzz(6); b.click(); } };
  function switchTo(b) { wantTab = b; if (!tabFrame) tabFrame = requestAnimationFrame(goNow); }
  const navEnd = e => {
    if (!nd) return; const d = nd; nd = null;
    if (tabFrame) { cancelAnimationFrame(tabFrame); goNow(); }      // a quick flick: the last tab it reached
    nav.classList.remove('dragging'); btns().forEach(q => q.classList.remove('aim'));
    if (!d.on) return;
    if (e.cancelable) e.preventDefault();          // the drag is not also a tap
    pill.style.transition = '';
    placeOn();
  };
  nav.addEventListener('touchend', navEnd); nav.addEventListener('touchcancel', navEnd);
  // tapping the tab you are already on, at its first screen, glides back to the top instead of redrawing it
  nav.addEventListener('click', e => {
    const b = e.target.closest('.nav-btn'); if (!b || !b.classList.contains('on') || A.depth() !== 1 || window.scrollY < 40) return;
    e.stopPropagation(); window.scrollTo({ top: 0, behavior: calm() ? 'auto' : 'smooth' });
  }, true);

  // ---------------- hold − / + on a weight to keep it moving ----------------
  let hold = null, swallow = false;              // swallow: the tap that ends a hold must not count as one more step
  const stopHold = () => { if (!hold) return; clearTimeout(hold.t); clearInterval(hold.i); if (hold.ran) { swallow = true; setTimeout(() => { swallow = false; }, 350); } hold = null; };
  document.addEventListener('pointerdown', e => {
    const b = e.target.closest && e.target.closest('.stb[data-act="wStep"]'); if (!b) return;
    stopHold(); swallow = false;
    const h = { ran: false, t: 0, i: 0 }; hold = h;
    h.t = setTimeout(() => { h.i = setInterval(() => { if (hold !== h || !document.body.contains(b)) return stopHold(); h.ran = true; ACT.wStep(b); buzz(3); }, 85); }, 420);
  });
  ['pointerup', 'pointercancel', 'touchend', 'touchcancel'].forEach(t => document.addEventListener(t, stopHold));
  window.addEventListener('blur', stopHold);
  document.addEventListener('click', e => { if (swallow && e.target.closest && e.target.closest('.stb')) { swallow = false; e.stopPropagation(); e.preventDefault(); } }, true);

  // ---------------- numbers in a workout: tap to replace, Next walks on ----------------
  document.addEventListener('focusin', e => {
    const el = e.target; if (!el.matches || !el.matches('.set-row input.num, .npick input')) return;
    el.setAttribute('enterkeyhint', 'next');
    setTimeout(() => { try { el.select(); } catch (err) { } }, 0);
  });
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' || !e.target.matches || !e.target.matches('.set-row input.num')) return;
    const all = $$('.sx.open .set-row input.num'), i = all.indexOf(e.target); if (i < 0) return;
    e.preventDefault(); if (all[i + 1]) all[i + 1].focus(); else e.target.blur();
  });

  // ---------------- a ticked set pops; finishing an exercise glides to the next one ----------------
  const wrap = (name, fn) => { const f0 = ACT[name]; if (f0) ACT[name] = function (el) { const r = f0.apply(this, arguments); try { fn(el); } catch (e) { } return r; }; };
  wrap('setDone', el => {
    const b = $(`.set-row .ok[data-si="${el.dataset.si}"][data-ri="${el.dataset.ri}"]`); if (!b || calm()) return;
    if (b.closest('.set-row').classList.contains('done')) { b.classList.add('pop'); buzz(12); setTimeout(() => b.classList.remove('pop'), 400); }
  });
  wrap('sxDone', () => {
    const next = $$('#view .sx').find(x => !x.classList.contains('done') && !x.classList.contains('skipped')); if (!next) return;
    setTimeout(() => next.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }), 60);
  });

  // ---------------- "Removed · Undo" ----------------
  let undoT = null;
  // v1.23: `more` = { label, fn } adds a second button before Undo (Edit, for a meal logged straight from its photo)
  function undoToast(msg, undo, more) {
    const t = $('#toast'); t.innerHTML = `<span>${A.esc(msg)}</span>${more ? `<button class="undo alt">${A.esc(more.label)}</button>` : ''}<button class="undo">Undo</button>`; t.classList.remove('hidden'); t.classList.add('with-undo');
    clearTimeout(undoT); const done = () => { t.classList.add('hidden'); t.classList.remove('with-undo'); };
    t.querySelector('.undo:not(.alt)').onclick = () => { done(); undo(); };
    if (more) t.querySelector('.undo.alt').onclick = () => { done(); more.fn(); };
    undoT = setTimeout(done, more ? 8000 : 5000);
  }
  const toast0 = window.toast; window.toast = m => { clearTimeout(undoT); $('#toast').classList.remove('with-undo'); toast0(m); };
  // 1.33 (47): something that could not be done, in plain words, with Try again when trying again can help (no internet, the
  // server busy); a "no" from the server (not allowed, not found) is only said
  A.failToast = (e, retry) => {
    const msg = (e && e.message) || String(e || 'Something went wrong'), again = retry && (!e || e.offline || !e.status || e.status >= 500 || e.status === 429);
    if (!again) { window.toast(msg); return; }
    const t = $('#toast'); t.innerHTML = `<span>${A.esc(msg)}</span><button class="undo">Try again</button>`; t.classList.remove('hidden'); t.classList.add('with-undo');
    clearTimeout(undoT); const done = () => { t.classList.add('hidden'); t.classList.remove('with-undo'); };
    t.querySelector('.undo').onclick = () => { done(); retry(); };
    undoT = setTimeout(done, 7000);
  };
  // removing an exercise from a day: straight away, with a way back, instead of a question first
  ACT.dayRemove = el => {
    const d = S.getDay(el.dataset.id), i = +el.dataset.i; if (!d || !d.items[i]) return;
    const item = d.items.splice(i, 1)[0], ex = S.getEx(item.ex);
    S.save(true); A.rerender(); buzz(8);
    undoToast((ex ? ex.name : 'Exercise') + ' removed', () => { const dd = S.getDay(d.id); if (!dd) return; dd.items.splice(Math.min(i, dd.items.length), 0, item); S.save(true); if (A.top().name === 'day') A.rerender(); });
  };
  // removing an exercise from a workout goes straight away, with a way back (1.33: ticked sets too; Recently deleted keeps the workout)
  ACT.sxRemoveYes = el => {
    const s = A.curSession(), i = +el.dataset.i, item = s && s.items[i]; if (!item) return;
    const ex = S.getEx(item.ex);
    s.items.splice(i, 1); S.save(true); A.closeSheet(); A.rerender();
    const n = item.sets.filter(x => x.done).length;          // 1.33 (25): with ticked sets too, at once and with Undo
    undoToast((ex ? ex.name : 'Exercise') + ' removed' + (n ? ` with its ${n} ticked set${n === 1 ? '' : 's'}` : ''), () => { const cur = A.curSession(); if (cur !== s) return; s.items.splice(Math.min(i, s.items.length), 0, item); S.save(true); if (['session', 'sessionEdit'].includes(A.top().name)) A.rerender(); });
  };

  // ---------------- pull down to refresh (on screens that say how: VIEWS[name].refresh) ----------------
  let pd = null; const ptr = document.createElement('div'); ptr.id = 'ptr'; ptr.innerHTML = '<i></i>'; document.body.appendChild(ptr);
  const canRefresh = () => { const v = A.VIEWS[A.top().name]; return v && typeof v.refresh === 'function' && $('#sheet').classList.contains('hidden'); };
  document.addEventListener('touchstart', e => { pd = null; if (e.touches.length === 1 && window.scrollY <= 0 && canRefresh() && !e.target.closest('.chat-list, input, textarea, #nav, .bz.zoomed')) pd = { y: e.touches[0].clientY, x: e.touches[0].clientX, d: 0, on: false }; }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (!pd) return;
    if (document.body.classList.contains('kc-dragging')) { pd = null; ptr.classList.remove('ready'); ptr.style.opacity = '0'; ptr.style.transform = ''; return; }      // a food being dragged to another meal
    const dy = e.touches[0].clientY - pd.y, dx = e.touches[0].clientX - pd.x;
    if (!pd.on) { if (dy < 0 || Math.abs(dx) > Math.abs(dy)) { pd = null; return; } if (dy < 14) return; pd.on = true; }
    pd.d = Math.min(110, dy * 0.5); ptr.style.transform = `translate(-50%, ${pd.d}px)`; ptr.style.opacity = String(Math.min(1, pd.d / 60)); ptr.classList.toggle('ready', pd.d >= 64);
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (!pd) return; const d = pd; pd = null; if (!d.on) return;
    if (d.d >= 64 && canRefresh()) { ptr.classList.add('spin'); buzz(10); try { A.VIEWS[A.top().name].refresh(A.top().params || {}); } catch (e) { } setTimeout(() => { ptr.classList.remove('spin', 'ready'); ptr.style.opacity = '0'; ptr.style.transform = ''; }, 700); }
    else { ptr.classList.remove('ready'); ptr.style.opacity = '0'; ptr.style.transform = ''; }
  });

  // ---------------- numbers count up when a screen opens ----------------
  let lastView = '';
  const after2 = A.afterRender;
  A.afterRender = name => {
    if (after2) after2(name);
    if (name === lastView || calm()) { lastView = name; return; } lastView = name;
    $$('#view .stat .v, #view .mrow .n, #view .countup').forEach(el => {
      const m = /^(\d{1,6})(\.\d)?$/.exec(el.textContent.trim()); if (!m || el.children.length) return;
      const to = parseFloat(m[0]), dec = m[2] ? 1 : 0, t0 = performance.now(), full = el.textContent; if (to < 2) return;
      const step = now => { const k = Math.min(1, (now - t0) / 520), e = 1 - Math.pow(1 - k, 3); if (!document.body.contains(el)) return; el.textContent = k >= 1 ? full : (to * e).toFixed(dec); if (k < 1) requestAnimationFrame(step); };
      requestAnimationFrame(step);
    });
  };

  // ---------------- press and hold a day for its quick actions ----------------
  let lp = null;
  const lpStop = () => { if (lp) { clearTimeout(lp.t); lp = null; } };
  document.addEventListener('touchstart', e => {
    lpStop(); const c = e.target.closest && e.target.closest('.card.tap[data-act="openDay"]'); if (!c || e.touches.length !== 1 || e.target.closest('button')) return;
    const x = e.touches[0].clientX, y = e.touches[0].clientY;
    lp = { x, y, t: setTimeout(() => { lp = null; const d = S.getDay(c.dataset.id); if (!d) return; buzz(18); c.dataset.held = '1'; setTimeout(() => { delete c.dataset.held; }, 900); dayMenu(d); }, 520) };
  }, { passive: true });
  document.addEventListener('touchmove', e => { if (lp && (Math.abs(e.touches[0].clientX - lp.x) > 10 || Math.abs(e.touches[0].clientY - lp.y) > 10)) lpStop(); }, { passive: true });
  document.addEventListener('touchend', lpStop); document.addEventListener('touchcancel', lpStop);
  document.addEventListener('click', e => { const c = e.target.closest && e.target.closest('.card.tap[data-held]'); if (c) { delete c.dataset.held; e.stopPropagation(); e.preventDefault(); } }, true);   // the hold is not also a tap
  document.addEventListener('contextmenu', e => { if (e.target.closest && e.target.closest('.card.tap[data-act="openDay"]')) e.preventDefault(); });
  function dayMenu(d) {
    A.openSheet(`<h2>${A.esc(d.name)}</h2><div class="menu">
      ${d.items.length ? `<button class="btn block primary" data-act="dayMenuStart" data-id="${d.id}">▶&nbsp; Start this day</button>` : ''}
      <button class="btn block" data-act="dayMenuOpen" data-id="${d.id}">Open and edit</button>
      <button class="btn block" data-act="dayDuplicate" data-id="${d.id}">Make a copy</button>
      <button class="btn block danger" data-act="deleteDay" data-id="${d.id}">Delete this day</button></div>`);
  }
  ACT.dayMenuOpen = el => { A.closeSheet(); A.go('day', { id: el.dataset.id }); };
  ACT.dayMenuStart = el => { A.closeSheet(); ACT.startDay(el); };
  ACT.dayDuplicate = el => {
    const d = S.getDay(el.dataset.id); if (!d) return;
    const names = D.days.map(x => x.name); let name = d.name + ' copy', n = 2; while (names.includes(name)) name = `${d.name} copy ${n++}`;
    S.addDay(name, d.items.map(i => ({ ex: i.ex, sets: i.sets, reps: i.reps }))); S.save(true); A.closeSheet(); A.rerender(); window.toast('Copied as ' + name);
  };

  window.Motion.undoToast = undoToast;
})();
