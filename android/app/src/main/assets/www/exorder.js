/* GymDay 1.32 · Move an exercise during a workout (exorder.js).
   Press and hold an exercise (its picture, name or numbers) for about 0.4 s, then drag it up or down and let go.
   While the finger is down every exercise folds to its top line, so the whole workout fits on the screen; on letting go
   they open again as they were, the moved exercise stays where it was let go, and the rest glide to their places.
   The new order is only for this workout: the day keeps its own order. It works on Edit workout too, and
   ⋯ → Move up / Move down still does the same with one tap (the way for TalkBack or a keyboard).
   The touch handling is the one for moving a set (setx.js) and a food (food.js): moving first is a scroll, not a hold;
   the finger's events are also listened for on the element first touched (a redraw can take it off the page); and
   kc-dragging holds back sync redraws and pull-to-refresh while an exercise is carried. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, $$, ACT } = A, M = S.meta;
  const HOLD = 420, SLOP = 6;          // the same as for sets and food: SLOP is under the phone's own 8 px
  const VIEWS_OK = ['session', 'sessionEdit'];
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const buzz = ms => { try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  let dg = null;          // { card, cs, it, from, to, n, rows, nos, tops, hs, gap, x0, y0, yl, sy0, x, y, y1, on, pid, t, raf, last, acc, moved, dy, spacer }
  let done = 0;           // the tap that ends a drag must not also open, fold or tick anything

  const cards = () => $$('#view .sx');
  // where a hold can start: an exercise's top line (its picture, name and numbers), never its buttons or boxes
  function headAt(el) {
    if (!el || !el.closest) return null;
    const head = el.closest('#view .sx > .head'); if (!head) return null;
    if (el.closest('button, input, select, textarea, a')) return null;
    const v = $('#view'); if (!v || v.classList.contains('focus-mode')) return null;          // Focus shows one exercise
    if (!VIEWS_OK.includes(A.top().name)) return null;
    return head;
  }
  // the screen an exercise can be carried in: under the workout's sticky top bar, above the bottom bar
  function topEdge() { const t = document.querySelector('#view .session-top'); if (t) { const r = t.getBoundingClientRect(); if (r.height > 0) return Math.max(0, r.bottom); } return 0; }
  function botEdge() { const n = document.getElementById('nav'); if (n && !n.classList.contains('hidden')) { const r = n.getBoundingClientRect(); if (r.height > 0) return Math.min(window.innerHeight, r.top); } return window.innerHeight; }

  function arm(head, x, y, pid, grip) {
    stop(false);
    if (document.body.classList.contains('kc-dragging')) return;          // a set or a food is being carried
    const card = head.closest('.sx'), cs = A.curSession();
    if (!card || !cs || cs.items.length < 2 || cards().length !== cs.items.length) return;      // one exercise: nothing to move past
    const from = +card.dataset.i; if (!(from >= 0) || !cs.items[from]) return;
    dg = { card, cs, it: cs.items[from], from, x0: x, y0: y, x, y, on: false, pid, grip: !!grip };
    dg.t = setTimeout(lift, grip ? 90 : HOLD);
  }
  function lift() {
    if (!dg || dg.on || !document.body.contains(dg.card)) { stop(false); return; }
    if (A.curSession() !== dg.cs || dg.cs.items[dg.from] !== dg.it) { stop(false); return; }
    if (window.SetX && window.SetX.hidePad) window.SetX.hidePad();          // the number pad goes away while an exercise is carried
    const ae = document.activeElement; if (ae && ae !== document.body && ae.blur) ae.blur();
    const r0 = dg.card.getBoundingClientRect().top;
    document.body.classList.add('ex-fold', 'kc-dragging', 'sx-dragging');
    // the folding above the held exercise pulls it up the screen: scroll so it stays under the finger, with room added
    // at the bottom when the page has become too short for that
    const sp = document.createElement('div'); sp.id = 'exSpacer'; sp.setAttribute('aria-hidden', 'true');
    const view = $('#view'); if (view) view.appendChild(sp); dg.spacer = sp;
    const want = window.scrollY + dg.card.getBoundingClientRect().top - r0;
    const max = document.documentElement.scrollHeight - window.innerHeight;
    if (want > max) sp.style.height = Math.ceil(want - max) + 'px';
    window.scrollTo(0, Math.max(0, want));
    dg.rows = cards(); dg.n = dg.rows.length;
    if (dg.rows.indexOf(dg.card) !== dg.from || dg.n !== dg.cs.items.length) { stop(false); return; }
    dg.nos = dg.rows.map(r => { const b = r.querySelector('.th .no'); return b ? b.textContent : null; });
    dg.sy0 = window.scrollY;
    dg.tops = dg.rows.map(r => r.getBoundingClientRect().top + window.scrollY);          // where each exercise sits, folded
    dg.hs = dg.rows.map(r => r.offsetHeight);
    dg.gap = Math.max(0, dg.tops[1] - dg.tops[0] - dg.hs[0]);
    Object.assign(dg, { to: dg.from, on: true, moved: false, last: 0, acc: 0, yl: dg.y, y1: dg.y, dy: 0 });
    dg.card.classList.add('ex-lift'); dg.rows.forEach(r => { if (r !== dg.card) r.classList.add('ex-shift'); });
    buzz(15);
    paint(); dg.raf = requestAnimationFrame(tick);
  }
  function paint() {
    if (!dg || !dg.on) return;
    const n = dg.n, f = dg.from, h = dg.hs[f];
    const lo = dg.tops[0] - dg.tops[f], hi = dg.tops[n - 1] + dg.hs[n - 1] - h - dg.tops[f];
    const dy = Math.max(lo, Math.min(hi, (dg.y + window.scrollY) - (dg.yl + dg.sy0)));
    dg.dy = dy; dg.card.style.transform = `translate3d(0, ${dy.toFixed(1)}px, 0) scale(1.02)`;
    // an exercise it is carried over makes room once the carried one's edge passes its middle
    const top = dg.tops[f] + dy, bot = top + h; let to = f;
    for (let j = 0; j < n; j++) {
      if (j === f) continue;
      const c = dg.tops[j] + dg.hs[j] / 2;
      if (j < f && top < c) to = Math.min(to, j);
      if (j > f && bot > c) to = Math.max(to, j);
    }
    const step = h + dg.gap;
    for (let j = 0; j < n; j++) {
      if (j === f) continue;
      const shift = j >= to && j < f ? step : j <= to && j > f ? -step : 0;
      dg.rows[j].style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
    }
    // the numbers follow, so the carried exercise shows the place it would take
    dg.rows.forEach((r, j) => {
      if (dg.nos[j] == null) return;
      const k = j === f ? to : j >= to && j < f ? j + 1 : j <= to && j > f ? j - 1 : j;
      const b = r.querySelector('.th .no'); if (b && b.textContent !== String(k + 1)) b.textContent = String(k + 1);
    });
    if (to !== dg.to) { dg.to = to; buzz(6); }
  }
  // one exercise drawn again meanwhile (a set ticked by voice, a heart-rate line): carry on with the new one
  function regrab() {
    const rows = cards(), cs = A.curSession();
    if (rows.length !== dg.n || cs !== dg.cs || cs.items[dg.from] !== dg.it) return false;
    dg.rows = rows; dg.card = rows[dg.from];
    dg.card.classList.add('ex-lift'); rows.forEach(r => { if (r !== dg.card) r.classList.add('ex-shift'); });
    const view = $('#view'); if (dg.spacer && view && !view.contains(dg.spacer)) view.appendChild(dg.spacer);
    return true;
  }
  function tick(now) {
    if (!dg || !dg.on) return;
    if (!dg.rows.every(r => document.body.contains(r)) && !regrab()) { stop(false); return; }
    const dt = dg.last ? Math.min(48, Math.max(0, now - dg.last)) : 16; dg.last = now;
    if (!dg.moved && Math.abs(dg.y - dg.y1) > 14) dg.moved = true;          // nothing scrolls until the exercise is really carried
    const top = topEdge(), bot = botEdge(), zone = Math.min(90, (bot - top) * 0.16), n = dg.n;
    let v = 0;                                                                // px a second; up is negative
    if (dg.moved) {
      if (dg.y < top + zone && dg.y < dg.y1 - 6) v = -Math.min(1, (top + zone - dg.y) / zone);
      else if (dg.y > bot - zone && dg.y > dg.y1 + 6) v = Math.min(1, (dg.y - (bot - zone)) / zone);
      v = v ? Math.sign(v) * (140 + 900 * v * v) : 0;
      if (v < 0 && dg.tops[0] - window.scrollY >= top + 8) v = 0;                         // the first one is in view: no further up
      if (v > 0 && dg.tops[n - 1] + dg.hs[n - 1] - window.scrollY <= bot - 8) v = 0;    // the last one is in view: no further down
    }
    if (v) {
      dg.acc += v * dt / 1000;
      const px = dg.acc < 0 ? Math.ceil(dg.acc) : Math.floor(dg.acc);
      if (px) { const y0 = window.scrollY; window.scrollBy(0, px); dg.acc -= px; if (window.scrollY === y0) dg.acc = 0; }
    } else dg.acc = 0;
    paint(); dg.raf = requestAnimationFrame(tick);
  }
  function stop(commit) {
    if (!dg) return; const d = dg; dg = null;
    clearTimeout(d.t); cancelAnimationFrame(d.raf);
    if (!d.on) return;
    done = Date.now();
    const cs = A.curSession();
    const ok = commit && d.to !== d.from && cs === d.cs && cs.items.length === d.n && cs.items[d.from] === d.it;
    // where each exercise is on the screen now (folded, carried), to glide from there into the opened list
    const was = new Map();
    d.rows.forEach((r, j) => { if (document.body.contains(r) && d.cs.items[j]) was.set(d.cs.items[j], r.getBoundingClientRect().top); });
    const land = was.get(d.it);
    d.rows.forEach(r => { r.style.transform = ''; r.classList.remove('ex-lift', 'ex-shift'); });
    document.body.classList.remove('ex-fold', 'kc-dragging', 'sx-dragging');
    if (d.spacer) d.spacer.remove();
    if (ok) {
      const it = cs.items.splice(d.from, 1)[0]; cs.items.splice(d.to, 0, it); S.save(true);
      if (!M.exTip) { M.exTip = 1; if (S.saveMeta) S.saveMeta(); }          // the tip has done its job
    }
    if (VIEWS_OK.includes(A.top().name)) { A.rerender(); settle(was, d.it, land); }
    if (ok) tell(d.cs, d.it, d.from, d.to);
  }
  // the moved exercise stays where it was let go; the others glide from where they were to their opened places
  function settle(was, moved, land) {
    const cs = A.curSession(); if (!cs) return;
    const rows = cards(), card = rows[cs.items.indexOf(moved)];
    if (card && land != null) { const dy = card.getBoundingClientRect().top - land; if (Math.abs(dy) > 0.5) window.scrollBy(0, dy); }
    if (calm()) return;
    rows.forEach((r, j) => {
      const old = was.get(cs.items[j]); if (old == null) return;
      const dy = old - r.getBoundingClientRect().top;
      if (Math.abs(dy) < 1 || Math.abs(dy) > window.innerHeight) return;
      r.style.transition = 'none'; r.style.transform = `translateY(${dy.toFixed(1)}px)`; void r.offsetWidth;
      r.style.transition = 'transform .2s cubic-bezier(.2, .8, .2, 1)'; r.style.transform = '';
      setTimeout(() => { r.style.transition = ''; r.style.transform = ''; }, 260);
    });
  }
  function tell(cs, it, from, to) {
    const ex = S.getEx(it.ex), msg = `${ex ? ex.name : 'Exercise'} is now number ${to + 1}`;
    const undo = () => {
      if (A.curSession() !== cs) return;
      const k = cs.items.indexOf(it); if (k < 0) return;
      cs.items.splice(k, 1); cs.items.splice(Math.min(from, cs.items.length), 0, it); S.save(true);
      if (VIEWS_OK.includes(A.top().name)) A.rerender();
    };
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast(msg, undo); else if (window.toast) window.toast(msg);
  }

  // touch. The finger's events keep going to the element it first touched, even after a redraw has taken it off the page,
  // so they are also listened for on that element (as for sets and food).
  let tEl = null;
  function tMove(e) {
    if (e.__xo) return; e.__xo = true;
    if (!dg || dg.pid !== 'touch') return;
    const t = e.touches[0]; if (!t) return; dg.x = t.clientX; dg.y = t.clientY;
    if (!dg.on) {          // still deciding: moving first, or the page already scrolling, means a scroll and not a hold
      if (dg.grip && e.cancelable && Math.abs(dg.y - dg.y0) > SLOP) { clearTimeout(dg.t); e.preventDefault(); lift(); return; }      // 1.33: from the ≡ grip, moving is carrying
      if (!e.cancelable || Math.abs(dg.x - dg.x0) > SLOP || Math.abs(dg.y - dg.y0) > SLOP) stop(false);
      return;
    }
    if (e.cancelable) e.preventDefault();          // the exercise is held: the page must not scroll under the finger as well
  }
  function tEnd(e) {
    if (e.__xo) return; e.__xo = true;
    if (dg && dg.pid === 'touch') {
      if (e.changedTouches[0] && dg.on) { dg.x = e.changedTouches[0].clientX; dg.y = e.changedTouches[0].clientY; paint(); }
      if (dg.on && e.cancelable) e.preventDefault();          // no tap on whatever opened up under the finger
      stop(true);
    }
    untouch();
  }
  function tCancel(e) { if (e.__xo) return; e.__xo = true; if (dg && dg.pid === 'touch') stop(false); untouch(); }
  function untouch() { if (!tEl) return; tEl.removeEventListener('touchmove', tMove); tEl.removeEventListener('touchend', tEnd); tEl.removeEventListener('touchcancel', tCancel); tEl = null; }
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { stop(false); return; }
    const h = headAt(e.target); if (!h) return;
    untouch(); tEl = e.target;
    tEl.addEventListener('touchmove', tMove, { passive: false }); tEl.addEventListener('touchend', tEnd); tEl.addEventListener('touchcancel', tCancel);
    arm(h, e.touches[0].clientX, e.touches[0].clientY, 'touch', e.target.closest && e.target.closest('.sx-grip'));
  }, { passive: true });
  document.addEventListener('touchmove', tMove, { passive: false });
  document.addEventListener('touchend', tEnd);
  document.addEventListener('touchcancel', tCancel);
  // mouse (the laptop copy): hold the button down the same time
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; const h = headAt(e.target); if (h) arm(h, e.clientX, e.clientY, 'mouse', e.target.closest && e.target.closest('.sx-grip')); });
  document.addEventListener('pointermove', e => {
    if (!dg || dg.pid !== 'mouse' || e.pointerType !== 'mouse') return;
    dg.x = e.clientX; dg.y = e.clientY;
    if (!dg.on) { if (dg.grip && Math.abs(dg.y - dg.y0) > SLOP) { clearTimeout(dg.t); lift(); e.preventDefault(); return; } if (Math.abs(dg.x - dg.x0) > SLOP || Math.abs(dg.y - dg.y0) > SLOP) stop(false); return; }
    e.preventDefault();
  });
  document.addEventListener('pointerup', e => { if (dg && dg.pid === 'mouse' && e.pointerType === 'mouse') { dg.x = e.clientX; dg.y = e.clientY; if (dg.on) paint(); stop(true); } });
  document.addEventListener('click', e => { if (Date.now() - done < 350 && e.target.closest && e.target.closest('#view')) { e.stopPropagation(); e.preventDefault(); done = 0; } }, true);
  document.addEventListener('contextmenu', e => { if (headAt(e.target)) e.preventDefault(); });       // a long press shows no menu
  document.addEventListener('dragstart', e => { if (headAt(e.target)) e.preventDefault(); });        // nor drags the picture out
  window.addEventListener('blur', () => stop(false));
  document.addEventListener('visibilitychange', () => { if (document.hidden) stop(false); });

  // a one-line tip on the workout until the first move (or ✕)
  function tip(a) {
    if (M.exTip || !a || !a.items || a.items.length < 2) return '';
    if (window.__tips === false && !window.__exTip) return '';          // tests: off with the other first-time tips
    return `<div class="ex-tip" id="exTip"><span class="ex-tip-i" aria-hidden="true">↕</span><span class="grow">Drag ≡ to move an exercise (or press and hold it).</span><button class="ex-tip-x" data-act="exTipX" aria-label="Hide this tip">✕</button></div>`;
  }
  ACT.exTipX = () => { M.exTip = 1; if (S.saveMeta) S.saveMeta(); const t = $('#exTip'); if (t) t.remove(); };

  window.ExOrder = { tip, HOLD, active: () => !!(dg && dg.on) };
})();
