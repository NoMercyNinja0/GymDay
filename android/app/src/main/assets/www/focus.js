/* GymDay 1.23 · Focus workout (focus.js) and the smart next set (Trainer mode).
   Focus: the workout still opens as the full list. "◎ Focus" in its bar shows one exercise at a time with big numbers:
   dots and ‹ › (or a swipe) move between exercises, and one big button says what comes next: Start, Done (and on to the
   next), or Finish. It follows the exercise being timed. "☰ List" goes back; the choice is kept on this phone
   (Store.meta.focus). Nothing about the workout itself changes: the same sets, timers, menus and number pad.
   Next set (only with Trainer mode on, for weight × reps exercises): after a working set is ticked, a line under it says
   what to load for the next one, from that set and how hard it felt, with Use to fill it in. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc, ACT, VIEWS } = A, D = S.data, M = S.meta;
  const num = A.num;
  const on = () => !!M.focus;
  let fi = -1, key = 0, lastRun = -1;

  function current() {
    const a = D.active; if (!a || !a.items.length) return -1;
    if (key !== a.start) { key = a.start; fi = -1; lastRun = -1; }
    const run = a.items.findIndex(x => x.run);
    if (run >= 0 && run !== lastRun) fi = run;                    // it follows the exercise being timed
    lastRun = run;
    if (fi < 0 || fi >= a.items.length) { const n = a.items.findIndex(x => !x.fin && !x.skipped); fi = n >= 0 ? n : 0; }
    return fi;
  }
  const at = it => { if (!on()) return false; const a = D.active; return !!a && A.top().name === 'session' && a.items[current()] === it; };
  // the next exercise still to do after this one (going round once), or -1
  function nextAfter(a, i) { for (let k = 1; k <= a.items.length; k++) { const j = (i + k) % a.items.length, it = a.items[j]; if (j !== i && !it.fin && !it.skipped && S.getEx(it.ex)) return j; } return -1; }
  const nameOf = it => { const ex = S.getEx(it.ex); return ex ? ex.name : 'Exercise'; };

  function pagerHtml(a, i) {
    const n = a.items.length;
    return `<div class="fx-pager" id="fxPager"><button class="btn icon" data-act="fxGo" data-d="-1" aria-label="Previous exercise" ${i <= 0 ? 'disabled' : ''}>‹</button>
      <div class="fx-mid"><div class="fx-count">Exercise ${i + 1} of ${n}</div><div class="fx-dots" role="group" aria-label="Exercises">${a.items.map((it, k) => `<button class="fx-dot ${k === i ? 'on' : ''} ${it.fin ? 'done' : ''} ${it.skipped ? 'skip' : ''}" data-act="fxTo" data-i="${k}" aria-label="Exercise ${k + 1}: ${esc(nameOf(it))}${it.fin ? ', done' : it.skipped ? ', skipped' : ''}"${k === i ? ' aria-current="true"' : ''}></button>`).join('')}</div></div>
      <button class="btn icon" data-act="fxGo" data-d="1" aria-label="Next exercise" ${i >= n - 1 ? 'disabled' : ''}>›</button></div>`;
  }
  function footHtml(a, i) {
    const it = a.items[i], nx = nextAfter(a, i), nxName = nx >= 0 ? esc(nameOf(a.items[nx])) : '';
    const toNext = nx >= 0 ? `<button class="btn primary block fx-cta" data-act="fxTo" data-i="${nx}">Next: ${nxName} ›</button>` : `<button class="btn primary block fx-cta" data-act="finish">Finish workout ✓</button>`;
    let h;
    if (it.skipped || !S.getEx(it.ex) || it.fin) h = toNext;
    else if (it.run) h = `<button class="btn primary block fx-cta" data-act="fxDone" data-i="${i}">Done ✓${nxName ? `<span class="fx-nx">next: ${nxName}</span>` : ''}</button>`;
    else h = `<button class="btn primary block fx-cta" data-act="sxStart" data-i="${i}">▶ ${it.ms ? 'Resume' : 'Start'} this exercise</button><button class="btn ghost block fx-skip" data-act="fxDone" data-i="${i}">Done without timing it ✓</button>`;
    return `<div class="fx-foot" id="fxFoot">${h}<p class="xs dim fx-hint">Swipe left or right to change exercise</p></div>`;
  }
  function chrome() {
    const a = D.active, view = $('#view'); if (!view || A.top().name !== 'session') return;
    const strip = view.querySelector('.session-strip');
    if (a && strip && !strip.querySelector('[data-act="focusToggle"]')) strip.insertAdjacentHTML('beforeend', `<button class="btn sm fx-tog" data-act="focusToggle" aria-pressed="${on()}">${on() ? '☰ List' : '◎ Focus'}</button>`);
    view.classList.toggle('focus-mode', !!a && on());
    const oldP = $('#fxPager'), oldF = $('#fxFoot');
    if (!a || !on()) { if (oldP) oldP.remove(); if (oldF) oldF.remove(); return; }
    const i = current(), card = view.querySelector(`.sx[data-i="${i}"]`); if (!card) return;
    const p = pagerHtml(a, i), f = footHtml(a, i);
    if (oldP) { if (oldP.dataset.h !== p) { oldP.outerHTML = p; $('#fxPager').dataset.h = p; } } else { card.insertAdjacentHTML('beforebegin', p); $('#fxPager').dataset.h = p; }
    if (oldF) { if (oldF.dataset.h !== f) { oldF.outerHTML = f; $('#fxFoot').dataset.h = f; } } else { card.insertAdjacentHTML('afterend', f); $('#fxFoot').dataset.h = f; }
  }
  const v = VIEWS.session, mount0 = v.mount;
  v.mount = function (p) { if (mount0) mount0.call(this, p); chrome(); };
  // one exercise block redrawn by itself (a set ticked, a weight stepped): the pager and the big button follow
  const viewEl = $('#view');
  if (viewEl) new MutationObserver(list => { if (!on() || A.top().name !== 'session') return; if (list.some(m => [...m.addedNodes].some(n => n.nodeType === 1 && n.classList && n.classList.contains('sx')))) chrome(); }).observe(viewEl, { childList: true });

  const go = i => { const a = D.active; if (!a) return; fi = Math.max(0, Math.min(a.items.length - 1, i)); A.rerender(); window.scrollTo(0, 0); };
  ACT.focusToggle = () => {
    M.focus = !M.focus; if (S.saveMeta) S.saveMeta();
    if (M.focus) { fi = -1; lastRun = -1; }
    A.rerender(); window.scrollTo(0, 0);
    window.toast(M.focus ? 'Focus: one exercise at a time' : 'Back to the full list');
  };
  ACT.fxGo = el => go(current() + (+el.dataset.d));
  ACT.fxTo = el => go(+el.dataset.i);
  ACT.fxDone = el => {
    const a = D.active, i = +el.dataset.i; if (!a || !a.items[i]) return;
    const n = nextAfter(a, i);
    ACT.sxDone({ dataset: { i: String(i) } });
    if (n >= 0) go(n); else window.scrollTo(0, 0);
  };
  // a sideways swipe on the exercise changes exercise (not from a number box, a button or a set's number, which have their own gestures)
  let sw = null;
  document.addEventListener('pointerdown', e => {
    if (!on() || A.top().name !== 'session') return;
    const card = e.target.closest && e.target.closest('.sx.fx, #fxPager, #fxFoot'); if (!card || e.target.closest('input, button, .set-row, .eff, .nxt, .tgt')) { sw = null; return; }
    sw = { id: e.pointerId, x: e.clientX, y: e.clientY };
  }, true);
  const swEnd = e => {
    if (!sw || e.pointerId !== sw.id) return;
    const dx = e.clientX - sw.x, dy = e.clientY - sw.y; sw = null;
    if (Math.abs(dx) < 64 || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    const a = D.active; if (!a) return; const i = current(), j = i + (dx < 0 ? 1 : -1);
    if (j < 0 || j >= a.items.length) return;
    go(j);
  };
  document.addEventListener('pointerup', swEnd, true);
  document.addEventListener('pointercancel', () => { sw = null; }, true);

  window.Focus = { at, on, current, nextAfter };

  // ---------------- the smart next set (Trainer mode) ----------------
  const trainer = () => !!(window.Trainer && window.Trainer.on && window.Trainer.on());
  const roundTo = (x, step) => Math.round(x / step) * step;
  // from the set just done: [weight, reps, why]
  function suggest(ex, s) {
    const w = num(s.w), r = num(s.r), step = A.wStepSize(ex), u = A.unit();
    if (!(w > 0) || !(r > 0)) return null;
    if (s.eff === 3) return { w: w + step, r, why: `that felt easy, so ${A.fmtW(step)} ${u} more` };
    if (s.eff === 2) return { w, r, why: 'two left in you is right where a set should be: the same again' };
    if (s.eff === 1) return { w, r: Math.max(1, r - 1), why: 'one left in you: same weight, a rep fewer is fine' };
    if (s.eff === 0) { const lw = Math.min(w - step, roundTo(w * 0.92, step)); return lw > 0 ? { w: lw, r, why: 'that was all out: a little lighter keeps your reps' } : { w, r: Math.max(1, r - 2), why: 'that was all out: fewer reps this time' }; }
    return { w, r, why: 'the same again' + (window.SetX && D.settings.effort !== false ? ' (say how hard it was for a closer suggestion)' : '') };
  }
  function nextIdx(it, r) { for (let k = r + 1; k < it.sets.length; k++) { const x = it.sets[k]; if (x.done) return -1; if (x.kind === 'w' || x.kind === 'd') continue; return k; } return -1; }
  function under(it, s, i, r, edit) {
    if (edit || !trainer() || !A.repsOn() || !s.done || s.kind === 'w' || s.kind === 'd') return '';
    const ex = S.getEx(it.ex); if (!ex || ex.track !== 'weight' || it.fin) return '';
    if (it.sets.slice(r + 1).some(x => x.done)) return '';              // only under the last set ticked
    const k = nextIdx(it, r); if (k < 0) return '';
    const g = suggest(ex, s); if (!g) return '';
    const nx = it.sets[k], same = num(nx.w) === g.w && num(nx.r) === g.r;
    return `<div class="nxt" data-i="${i}" data-r="${k}"><span aria-hidden="true">➜</span><div class="grow" data-act="why" data-why="nextset"><b>Next set: ${A.fmtW(g.w)} ${A.unit()} × ${A.fmtW(g.r)}</b> <span class="muted">· ${esc(g.why)}</span></div>${same ? '<span class="use ok">✓ filled in</span>' : `<button class="use" data-act="nxtUse" data-i="${i}" data-r="${k}" data-w="${g.w}" data-n="${g.r}">Use</button>`}</div>`;
  }
  ACT.nxtUse = el => {
    const a = D.active, it = a && a.items[+el.dataset.i], x = it && it.sets[+el.dataset.r]; if (!x || x.done || A.inEdit()) return;
    x.w = A.fmtW(+el.dataset.w); x.r = A.fmtW(+el.dataset.n);
    S.save(true); A.refreshSx(+el.dataset.i);
  };
  window.NextSet = { under, suggest };
})();
