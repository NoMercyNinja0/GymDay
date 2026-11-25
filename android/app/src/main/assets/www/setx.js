/* GymDay – more about a single set:
   71 how hard it was (one tap after ticking: Easy / 2 more in me / 1 more / All out),
   72 labels (tap the set's number: warm-up, drop set, to failure; warm-ups do not count for records),
   81 a record announced the moment the set that beats it is ticked,
   82 a big number pad of GymDay's own for weights and reps, instead of the phone's keyboard,
   1.21.6 moving a set: hold its number, then drag it up or down (or Move up / Move down in its menu). */
(function () {
  const A = window.App, S = window.Store, D = S.data;
  const { $, $$, esc, ACT } = A;
  const st = () => D.settings;
  const buzz = ms => { try { if (S.isAndroid && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  window.SettingsRows = window.SettingsRows || [];
  const sw = (bind, on, title, sub) => `<div class="row" style="padding:6px 0"><div class="grow">${title}<div class="xs dim">${sub}</div></div><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;

  // ---------------- 72 labels ----------------
  const KINDS = [['', 'Normal set', ''], ['w', 'Warm-up', 'W'], ['d', 'Drop set', 'D'], ['f', 'To failure', 'F']];
  const kindOf = k => KINDS.find(x => x[0] === (k || '')) || KINDS[0];
  // what stands where the set's number is: its number among the working sets, or the letter of its label
  // 1.35.2: given the exercise's sets, a normal set's number counts normal sets only (after two warm-ups the first real set is 1, not 3)
  const mark = (s, r, sets) => (s.kind ? kindOf(s.kind)[2] : Array.isArray(sets) ? sets.slice(0, r + 1).filter(x => !x.kind).length : r + 1);
  ACT.setKind = el => {
    const cs = A.curSession(), it = cs && cs.items[+el.dataset.si], s = it && it.sets[+el.dataset.ri]; if (!s) return;
    A.openSheet(`<h2>Set ${+el.dataset.ri + 1}</h2><div class="menu">${KINDS.map(k => `<button class="btn block ${(s.kind || '') === k[0] ? 'primary' : ''}" data-act="setKindPick" data-si="${el.dataset.si}" data-ri="${el.dataset.ri}" data-k="${k[0]}">${k[2] ? `<b class="kl">${k[2]}</b>&nbsp; ` : ''}${k[1]}</button>`).join('')}</div>
      ${moveBtns(it, +el.dataset.si, +el.dataset.ri)}<p class="xs dim mt12">A warm-up set is logged but is left out of your records, your targets and the sets counted for each muscle.</p>`);
  };
  // 1.21.6: the one-tap way to move a set (TalkBack too); dragging is below
  function moveBtns(it, si, ri) {
    const n = it.sets.length; if (n < 2) return '';
    const b = (d, lbl, off) => `<button class="btn grow" data-act="setMove" data-si="${si}" data-ri="${ri}" data-d="${d}" ${off ? 'disabled' : ''}>${lbl}</button>`;
    return `<div class="row mt12 sx-mv" style="gap:8px">${b(-1, '↑ Move up', ri === 0)}${b(1, '↓ Move down', ri === n - 1)}</div><p class="xs dim mt8">Or hold a set's number, then drag it up or down.</p>`;
  }
  ACT.setMove = el => {
    const cs = A.curSession(), si = +el.dataset.si, it = cs && cs.items[si], from = +el.dataset.ri, to = from + (+el.dataset.d || 0);
    if (!it || !it.sets[from] || to < 0 || to >= it.sets.length || to === from) return;
    A.closeSheet(); moveSet(cs, it, si, from, to, null);
  };
  ACT.setKindPick = el => {
    const cs = A.curSession(), it = cs && cs.items[+el.dataset.si], s = it && it.sets[+el.dataset.ri]; if (!s) return;
    if (el.dataset.k) s.kind = el.dataset.k; else delete s.kind;
    if (s.kind === 'f' && s.done) s.eff = 0;                       // to failure is all out by definition
    S.save(true); A.closeSheet(); A.refreshSx(+el.dataset.si);
  };

  // ---------------- 1.21.6 move a set: hold its number, then drag it up or down ----------------
  // In a workout and in History → Edit. Everything goes with the set (weight, reps, the tick and its time, its label and how
  // hard it was); the numbers 1, 2, 3… follow. Touch: hold still ~0.42 s (moving first is a scroll); a quick tap still opens
  // the set's label. Mouse (the laptop copy): hold the button down the same time. The page scrolls only when the set is carried
  // to the top or bottom edge, and never past the first or last set. Undo puts it back.
  const SHOLD = 420, SSLOP = 6;
  let sd = null;            // { btn, row, sets, rows, si, from, to, x0, y0, sy0, y1, x, y, on, pid, t, raf, last, acc, moved, tops, hs, gap, dy }
  let sdDone = 0;           // the tap that ends a drag must not also open the set's label
  const sdCalm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const numAt = el => (el && el.closest ? el.closest('#view .sx .sets .set-row > button.n[data-act="setKind"]') : null);
  const rowsOf = sets => [...sets.children].filter(c => c.classList && c.classList.contains('set-row'));
  // the screen the set can be carried in: under the workout's sticky top bar, above the bottom bar
  function sdTop() { const t = document.querySelector('#view .session-top'); if (t) { const r = t.getBoundingClientRect(); if (r.height > 0) return Math.max(0, r.bottom); } return 0; }
  function sdBottom() { const n = document.getElementById('nav'); if (n && !n.classList.contains('hidden')) { const r = n.getBoundingClientRect(); if (r.height > 0) return Math.min(window.innerHeight, r.top); } return window.innerHeight; }
  function sdArm(btn, x, y, pid) {
    sdStop(false);
    const row = btn.closest('.set-row'), sets = row && row.parentElement;
    if (!sets || rowsOf(sets).length < 2) return;          // one set: nothing to move it past (a tap still labels it)
    sd = { btn, row, sets, si: +btn.dataset.si, x0: x, y0: y, x, y, on: false, pid };
    sd.t = setTimeout(sdLift, SHOLD);
  }
  function sdLift() {
    if (!sd || sd.on || !document.body.contains(sd.row)) { sdStop(false); return; }
    hide();                                                  // the number pad goes away while a set is carried
    const ae = document.activeElement; if (ae && ae.blur && ae.closest && ae.closest('.set-row')) ae.blur();
    sd.sets.querySelectorAll('.eff').forEach(e => { e.style.display = 'none'; });      // "How hard?" comes back under its set after the drop
    sd.rows = rowsOf(sd.sets); sd.from = sd.rows.indexOf(sd.row);
    if (sd.from < 0) { sdStop(false); return; }
    sd.sy0 = window.scrollY;
    sd.tops = sd.rows.map(r => r.getBoundingClientRect().top + window.scrollY);         // where each set sits on the page
    sd.hs = sd.rows.map(r => r.offsetHeight);
    sd.gap = Math.max(0, sd.tops[1] - sd.tops[0] - sd.hs[0]);
    Object.assign(sd, { to: sd.from, on: true, moved: false, last: 0, acc: 0, y1: sd.y, dy: 0 });
    sd.row.classList.add('sx-lift'); sd.rows.forEach(r => { if (r !== sd.row) r.classList.add('sx-shift'); });
    document.body.classList.add('kc-dragging', 'sx-dragging');          // kc-dragging: no redraw after a sync, no pull-to-refresh meanwhile
    buzz(15);
    sdPaint(); sd.raf = requestAnimationFrame(sdTick);
  }
  function sdPaint() {
    if (!sd || !sd.on) return;
    const n = sd.rows.length, f = sd.from, h = sd.hs[f], step = h + sd.gap;
    const lo = sd.tops[0] - sd.tops[f], hi = sd.tops[n - 1] + sd.hs[n - 1] - h - sd.tops[f];
    const dy = Math.max(lo, Math.min(hi, (sd.y + window.scrollY) - (sd.y0 + sd.sy0)));
    sd.dy = dy; sd.row.style.transform = `translate3d(0, ${dy}px, 0)`;
    // a set it is carried over makes room once the carried set's edge passes its middle (so the first and last places are reachable)
    const top = sd.tops[f] + dy, bot = top + h; let to = f;
    for (let j = 0; j < n; j++) {
      if (j === f) continue;
      const c = sd.tops[j] + sd.hs[j] / 2;
      if (j < f && top < c) to = Math.min(to, j);
      if (j > f && bot > c) to = Math.max(to, j);
    }
    for (let j = 0; j < n; j++) {
      if (j === f) continue;
      const shift = j >= to && j < f ? step : j <= to && j > f ? -step : 0;
      sd.rows[j].style.transform = shift ? `translate3d(0, ${shift}px, 0)` : '';
    }
    if (to !== sd.to) { sd.to = to; buzz(6); }
  }
  function sdTick(now) {
    if (!sd || !sd.on) return;
    if (!document.body.contains(sd.row)) { sdStop(false); return; }        // drawn again meanwhile: the set stays where it was
    const dt = sd.last ? Math.min(48, Math.max(0, now - sd.last)) : 16; sd.last = now;
    if (!sd.moved && Math.abs(sd.y - sd.y1) > 14) sd.moved = true;          // nothing scrolls until the set is really carried
    const top = sdTop(), bot = sdBottom(), zone = Math.min(90, (bot - top) * 0.16), n = sd.rows.length;
    let v = 0;                                                                // px a second; up is negative
    if (sd.moved) {
      if (sd.y < top + zone && sd.y < sd.y1 - 6) v = -Math.min(1, (top + zone - sd.y) / zone);
      else if (sd.y > bot - zone && sd.y > sd.y1 + 6) v = Math.min(1, (sd.y - (bot - zone)) / zone);
      v = v ? Math.sign(v) * (140 + 900 * v * v) : 0;
      if (v < 0 && sd.tops[0] - window.scrollY >= top + 8) v = 0;                         // the first set is in view: no further up
      if (v > 0 && sd.tops[n - 1] + sd.hs[n - 1] - window.scrollY <= bot - 8) v = 0;    // the last set is in view: no further down
    }
    if (v) {
      sd.acc += v * dt / 1000;
      const px = sd.acc < 0 ? Math.ceil(sd.acc) : Math.floor(sd.acc);
      if (px) { const y0 = window.scrollY; window.scrollBy(0, px); sd.acc -= px; if (window.scrollY === y0) sd.acc = 0; }
    } else sd.acc = 0;
    sdPaint(); sd.raf = requestAnimationFrame(sdTick);
  }
  function sdStop(commit) {
    if (!sd) return; const d = sd; sd = null;
    clearTimeout(d.t); cancelAnimationFrame(d.raf);
    if (!d.on) return;
    sdDone = Date.now();
    document.body.classList.remove('kc-dragging', 'sx-dragging');
    const cs = A.curSession(), it = cs && cs.items[d.si];
    const ok = commit && it && d.to !== d.from && document.body.contains(d.row) && it.sets.length === d.rows.length;
    if (ok) { moveSet(cs, it, d.si, d.from, d.to, d.tops[d.from] + d.dy - window.scrollY); return; }
    // let go where it was (or the list changed meanwhile): it settles back
    d.rows.forEach(r => { r.style.transform = ''; r.classList.remove('sx-shift'); });
    d.row.classList.remove('sx-lift');
    d.sets.querySelectorAll('.eff').forEach(e => { e.style.display = ''; });
    if (!sdCalm() && document.body.contains(d.row) && Math.abs(d.dy) > 0.5) {
      d.row.style.transition = 'none'; d.row.style.transform = `translateY(${d.dy}px)`; void d.row.offsetWidth;
      d.row.style.transition = 'transform .17s cubic-bezier(.2, .8, .2, 1)'; d.row.style.transform = '';
      setTimeout(() => { d.row.style.transition = ''; }, 220);
    }
  }
  // the move itself (drag, or Move up / down); landTop: where the set was let go on the screen, so it glides into its place
  function moveSet(cs, it, si, from, to, landTop) {
    const s = it.sets.splice(from, 1)[0]; it.sets.splice(to, 0, s);
    S.save(true); A.refreshSx(si);
    const card = $(`#view .sx[data-i="${si}"]`), row = card ? rowsOf(card.querySelector('.sets') || card).filter(Boolean)[to] : null;
    if (row && landTop != null && !sdCalm()) {
      const dy = landTop - row.getBoundingClientRect().top;
      if (Math.abs(dy) > 0.5 && Math.abs(dy) < window.innerHeight) {
        row.style.transition = 'none'; row.style.transform = `translateY(${dy}px)`; void row.offsetWidth;
        row.style.transition = 'transform .17s cubic-bezier(.2, .8, .2, 1)'; row.style.transform = '';
        setTimeout(() => { row.style.transition = ''; }, 220);
      }
    }
    const msg = `Set ${from + 1} moved to ${to + 1}`;
    const undo = () => {
      if (A.curSession() !== cs || cs.items[si] !== it) return;
      const k = it.sets.indexOf(s); if (k < 0) return;
      it.sets.splice(k, 1); it.sets.splice(Math.min(from, it.sets.length), 0, s); S.save(true); A.refreshSx(si);
    };
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast(msg, undo); else if (window.toast) window.toast(msg);
  }
  // touch. The finger's events keep going to the element it first touched, even after a redraw has taken it off the page,
  // so they are also listened for on that element (as for food in 1.21).
  let sdEl = null;
  function sdTMove(e) {
    if (e.__sd) return; e.__sd = true;
    if (!sd || sd.pid !== 'touch') return;
    const t = e.touches[0]; if (!t) return; sd.x = t.clientX; sd.y = t.clientY;
    if (!sd.on) {          // still deciding: moving first, or the page already scrolling, means a scroll and not a drag
      if (!e.cancelable || Math.abs(sd.x - sd.x0) > SSLOP || Math.abs(sd.y - sd.y0) > SSLOP) sdStop(false);
      return;
    }
    if (e.cancelable) e.preventDefault();          // the set is held: the page must not scroll under the finger as well
  }
  function sdTEnd(e) {
    if (e.__sd) return; e.__sd = true;
    if (sd && sd.pid === 'touch') {
      if (e.changedTouches[0] && sd.on) { sd.x = e.changedTouches[0].clientX; sd.y = e.changedTouches[0].clientY; sdPaint(); }
      if (sd.on && e.cancelable) e.preventDefault();
      sdStop(true);
    }
    sdUntouch();
  }
  function sdTCancel(e) { if (e.__sd) return; e.__sd = true; if (sd && sd.pid === 'touch') sdStop(false); sdUntouch(); }
  function sdUntouch() { if (!sdEl) return; sdEl.removeEventListener('touchmove', sdTMove); sdEl.removeEventListener('touchend', sdTEnd); sdEl.removeEventListener('touchcancel', sdTCancel); sdEl = null; }
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { sdStop(false); return; }
    const b = numAt(e.target); if (!b) return;
    sdUntouch(); sdEl = e.target;
    sdEl.addEventListener('touchmove', sdTMove, { passive: false }); sdEl.addEventListener('touchend', sdTEnd); sdEl.addEventListener('touchcancel', sdTCancel);
    sdArm(b, e.touches[0].clientX, e.touches[0].clientY, 'touch');
  }, { passive: true });
  document.addEventListener('touchmove', sdTMove, { passive: false });
  document.addEventListener('touchend', sdTEnd);
  document.addEventListener('touchcancel', sdTCancel);
  // mouse (the laptop copy)
  document.addEventListener('pointerdown', e => { if (e.pointerType !== 'mouse' || e.button !== 0) return; const b = numAt(e.target); if (b) sdArm(b, e.clientX, e.clientY, 'mouse'); });
  document.addEventListener('pointermove', e => {
    if (!sd || sd.pid !== 'mouse' || e.pointerType !== 'mouse') return;
    sd.x = e.clientX; sd.y = e.clientY;
    if (!sd.on) { if (Math.abs(sd.x - sd.x0) > SSLOP || Math.abs(sd.y - sd.y0) > SSLOP) sdStop(false); return; }
    e.preventDefault();
  });
  document.addEventListener('pointerup', e => { if (sd && sd.pid === 'mouse' && e.pointerType === 'mouse') { sd.x = e.clientX; sd.y = e.clientY; if (sd.on) sdPaint(); sdStop(true); } });
  document.addEventListener('click', e => { if (Date.now() - sdDone < 350 && numAt(e.target)) { e.stopPropagation(); e.preventDefault(); sdDone = 0; } }, true);
  document.addEventListener('contextmenu', e => { if (numAt(e.target)) e.preventDefault(); });       // a long press shows no menu
  window.addEventListener('blur', () => sdStop(false));

  // ---------------- 71 how hard was it ----------------
  const EFF = [[3, 'Easy'], [2, '2 more in me'], [1, '1 more'], [0, 'All out']];
  const effName = v => (EFF.find(e => e[0] === v) || ['', ''])[1];
  let ask = null;                                    // the set just ticked, waiting for its answer: { s }
  const effOn = () => st().effort !== false;
  function under(it, s, i, r, edit) {
    if (!s.done || !effOn() || s.kind === 'w') return '';
    if (!ask || ask.s !== s) return '';
    return `<div class="eff"><span class="xs muted">${window.__calm === false ? 'How hard?' : 'How hard was it?'}</span>${EFF.map(e => `<button class="chip ${s.eff === e[0] ? 'on' : ''}" data-act="effSet" data-si="${i}" data-ri="${r}" data-v="${e[0]}">${e[1]}</button>`).join('')}</div>`;
  }
  ACT.effSet = el => {
    const cs = A.curSession(), it = cs && cs.items[+el.dataset.si], s = it && it.sets[+el.dataset.ri]; if (!s) return;
    const v = +el.dataset.v; if (s.eff === v) delete s.eff; else s.eff = v;
    const at = padAt();                              // answering must not put the number pad away
    S.save(true); A.refreshSx(+el.dataset.si);
    if (at) { const inp = $(`.set-row input.num[data-si="${at.si}"][data-ri="${at.ri}"][data-f="${at.f}"]`); if (inp) inp.focus(); }
  };

  // ---------------- 81 a record, the moment it happens ----------------
  function recordNow(cs, it, s) {                     // v1.13: returns what it said, so the Top set message can carry it
    if (cs.keep === false || s.kind === 'w' || st().prLive === false) return '';
    const ex = S.getEx(it.ex); if (!ex || ex.track === 'time') return '';
    const w = A.num(s.w), r = A.num(s.r); if (!(w > 0)) return '';
    const before = A.recordsFor(ex.id, cs.id), live = it.pr || (it.pr = {});
    const wasW = Math.max(before.w ? before.w.v : 0, live.w || 0);
    if (before.w && w > wasW) { live.w = w; return say(`New record on ${ex.name}: ${A.fmtW(w)} ${A.unit()} (was ${A.fmtW(before.w.v)})`); }
    if (!A.repsOn() || !A.okForE(s)) return '';
    const e = A.e1rm(w, r), wasE = Math.max(before.e ? before.e.v : 0, live.e || 0);
    if (before.e && e > wasE + 0.01) { live.e = e; return say(`Strongest set yet on ${ex.name}: ${A.fmtW(w)} × ${r}`); }
    return '';
  }
  function say(msg) {
    window.toast('🏆 ' + msg); buzz(40);
    if (window.Motion && window.Motion.celebrate) window.Motion.celebrate();
    return msg;
  }

  // called by the workout screen when a set is ticked or unticked
  function ticked(cs, it, s) {
    if (!s.done) { if (ask && ask.s === s) ask = null; return; }
    if (s.kind === 'f') s.eff = 0;
    // 1.35.2: asked once per exercise, under its last set (it was under every set)
    const last = it.sets.every(x => x.done) || window.__calm === false;
    ask = effOn() && s.kind !== 'w' && s.eff == null && last ? { s } : (ask && ask.s === s ? ask : null);
    return recordNow(cs, it, s);
  }
  const after0 = A.afterRender; let lastView = '';
  A.afterRender = name => { if (after0) after0(name); if (name !== lastView) { lastView = name; if (name !== 'session') ask = null; } };

  window.SettingsRows.push(() => (window.__calm === false ? sw('optEffort', effOn(), 'Ask how hard each set was', 'One tap after you tick a set: Easy, 2 more in me, 1 more or All out') : sw('optEffort', effOn(), 'Ask how hard an exercise was', 'One tap after its last set: Easy, 2 more in me, 1 more or All out'))
    + sw('optPrLive', st().prLive !== false, 'Record alert in the workout', 'Says so the moment a set beats your best')
    + sw('optSetAsk', st().setAsk !== false, 'Ask which kind of set when adding one', '+ Set asks: normal set, warm-up or drop set. Off: a normal set straight away'));
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset && t.dataset.bind;
    if (b === 'optEffort') { st().effort = t.checked; S.save(); } else if (b === 'optPrLive') { st().prLive = t.checked; S.save(); }
    else if (b === 'optSetAsk') { st().setAsk = t.checked; S.save(); }
    else if (b === 'optNumpad') { st().numpad = t.checked; S.save(); }
  });

  // ---------------- 82 the big number pad ----------------
  // on a phone or tablet; window.__numpad lets a test switch it on or off whatever the device
  const touch = () => (window.__numpad === false ? false : S.isAndroid || !!(window.matchMedia && window.matchMedia('(pointer: coarse)').matches) || !!window.__numpad);
  const padOn = () => st().numpad !== false && touch();
  window.SettingsRows.push(() => (touch() ? sw('optNumpad', st().numpad !== false, 'Big number pad', 'GymDay\'s own large keys for weights and reps instead of the phone\'s keyboard') : ''));
  let pad = null, cur = null, buf = '', fresh = true;
  function padAt() { return cur && pad && !pad.classList.contains('hidden') ? { si: cur.dataset.si, ri: cur.dataset.ri, f: cur.dataset.f } : null; }
  const FIELD = { w: 'weight', r: 'reps' };
  function build() {
    pad = document.createElement('div'); pad.id = 'npad'; pad.className = 'hidden';
    const k = (v, cls, lbl) => `<button class="nk ${cls || ''}" data-k="${v}">${lbl || v}</button>`;
    pad.innerHTML = `<div class="np-top"><span class="np-what"></span><div class="np-chips" role="group" aria-label="Recent numbers" hidden></div><span class="np-val"></span><button class="nk np-x" data-k="close" aria-label="Close">Done</button></div>
      <div class="np-grid">
        ${k(7)}${k(8)}${k(9)}${k('dn', 'fn', '−')}
        ${k(4)}${k(5)}${k(6)}${k('up', 'fn', '+')}
        ${k(1)}${k(2)}${k(3)}${k('next', 'fn', 'Next')}
        ${k('.')}${k(0)}${k('del', '', '⌫')}${k('tick', 'fn go', '✓ Tick')}
      </div>`;
    document.body.appendChild(pad);
    // the keys never take the focus away from the box being filled in
    pad.addEventListener('pointerdown', e => { e.preventDefault(); });
    pad.addEventListener('click', e => { const c = e.target.closest('[data-v]'); if (c && cur) { buzz(4); put(c.dataset.v); fresh = true; paint(); return; } const b = e.target.closest('[data-k]'); if (b) key(b.dataset.k); });
  }
  const rowOf = el => el.closest('.set-row');
  function show(el) {
    if (!pad) build();
    cur = el; buf = el.value || ''; fresh = true;
    el.setAttribute('inputmode', 'none');
    pad.classList.remove('hidden'); document.body.classList.add('npad-open'); paint();
    setTimeout(() => { if (cur === el) el.scrollIntoView({ block: 'center', behavior: 'smooth' }); }, 30);
  }
  function hide() { if (pad) pad.classList.add('hidden'); document.body.classList.remove('npad-open'); cur = null; }
  function paint() {
    if (!cur) return;
    const row = rowOf(cur), n = row ? [...row.parentNode.querySelectorAll('.set-row')].indexOf(row) + 1 : 0;
    pad.querySelector('.np-what').textContent = `Set ${n} · ${cur.placeholder || FIELD[cur.dataset.f] || ''}`;
    pad.querySelector('.np-val').textContent = buf === '' ? '–' : buf;
    const step = cur.dataset.f === 'w' ? '' : '1';
    pad.querySelector('[data-k="dn"]').textContent = '− ' + step; pad.querySelector('[data-k="up"]').textContent = '+ ' + step;
    pad.querySelector('[data-k="tick"]').textContent = row && row.classList.contains('done') ? 'Untick' : '✓ Tick';
    chips();
  }
  // 1.33 (29): the numbers used lately for this exercise, one tap each: this workout's other sets, then the last workouts
  function recent(exId, f, now) {
    const out = [], add = v => { const n = parseFloat(v); if (n > 0 && !out.includes(n)) out.push(n); };
    const cs = A.curSession(), it = cs && cs.items[+cur.dataset.si];
    if (it) it.sets.forEach((x, r) => { if (r !== +cur.dataset.ri) add(x[f]); });
    const past = D.sessions.filter(x => x !== cs && x.items && x.items.some(i => i.ex === exId)).sort((a, b) => b.start - a.start).slice(0, 4);
    for (const x of past) for (const i of x.items) if (i.ex === exId) i.sets.filter(y => y.done).forEach(y => add(y[f]));
    const v = parseFloat(now);
    return out.filter(n => n !== v).sort((a, b) => (v > 0 ? Math.abs(a - v) - Math.abs(b - v) : 0) || b - a).slice(0, 5).sort((a, b) => a - b);
  }
  function chips() {
    const box = pad.querySelector('.np-chips'); if (!box) return;
    const cs = A.curSession(), it = cs && cs.items[+cur.dataset.si], f = cur.dataset.f;
    const l = it && (f === 'w' || f === 'r') ? recent(it.ex, f, cur.value) : [];
    box.innerHTML = l.map(n => `<button class="np-chip" data-v="${n}" aria-label="${A.fmtW(n)}${f === 'w' ? ' ' + A.unit() : ' reps'}">${A.fmtW(n)}</button>`).join('');
    box.hidden = !l.length; pad.classList.toggle('has-chips', !!l.length);          // in the top line, in place of its label: the pad is no taller
  }
  function put(v) {
    buf = v; const n = v === '' || v === '.' ? '' : String(parseFloat(v));
    cur.value = n === 'NaN' ? '' : n; cur.dispatchEvent(new Event('input', { bubbles: true })); paint();
  }
  function key(k) {
    if (!cur || !document.body.contains(cur)) return hide();
    buzz(4);
    if (/^\d$/.test(k)) { const b = fresh ? '' : buf; fresh = false; if (b.replace('.', '').length >= 6) return; put(b === '0' ? k : b + k); }
    else if (k === '.') { const b = fresh ? '' : buf; fresh = false; if (!b.includes('.')) put((b || '0') + '.'); }
    else if (k === 'del') { fresh = false; put(buf.slice(0, -1)); }
    else if (k === 'up' || k === 'dn') {
      const d = k === 'up' ? 1 : -1, row = rowOf(cur), stb = cur.dataset.f === 'w' && row ? row.querySelector(`.stb[data-d="${d}"]`) : null;
      if (stb) { ACT.wStep(stb); buf = cur.value; } else { const v = Math.max(0, (parseFloat(buf) || 0) + d); buf = String(v); cur.value = buf; cur.dispatchEvent(new Event('input', { bubbles: true })); }
      fresh = true; paint();
    }
    else if (k === 'next') { const all = $$('.sx.open .set-row input.num'), i = all.indexOf(cur); if (all[i + 1]) all[i + 1].focus(); else { cur.blur(); hide(); } }
    else if (k === 'tick') {
      const row = rowOf(cur), ok = row && row.querySelector('.ok'), si = cur.dataset.si, ri = +cur.dataset.ri; if (!ok) return;
      const was = row.classList.contains('done');
      ok.click();                                                  // the block is redrawn: find the next set's first box in the new one
      const nxt = was ? null : $(`.set-row input.num[data-si="${si}"][data-ri="${ri + 1}"]`);
      if (nxt) nxt.focus(); else hide();
    }
    else if (k === 'close') { cur.blur(); hide(); }
  }
  // Only GymDay's pad may show. v1.8 marked each box inputmode="none" before it could take the focus, but on the
  // owner's OnePlus (Android 16) the phone's keyboard still opened under the pad. v1.8.2: while the pad is on, the
  // boxes are also read-only, so the phone's keyboard has nothing it could type into (the pad fills them in itself),
  // and Android is asked to close its keyboard as the box takes the focus and twice more just after, in case it was
  // already open for another box or opens late. With the pad switched off the boxes are ordinary number boxes again.
  const PADDED = '.set-row input.num';
  function lock(el) { el.dataset.pad = '1'; el.setAttribute('inputmode', 'none'); el.readOnly = true; }
  function unlock(el) { if (el.dataset.pad !== '1') return; delete el.dataset.pad; el.readOnly = false; el.setAttribute('inputmode', 'decimal'); }
  const mark0 = root => { const on = padOn(); (root || document).querySelectorAll(PADDED).forEach(on ? lock : unlock); };
  const hideKb = () => { try { if (S.isAndroid && window.Android && window.Android.hideKeyboard) window.Android.hideKeyboard(); } catch (e) { } };
  const hideKbSoon = el => { hideKb(); [150, 450].forEach(ms => setTimeout(() => { if (cur === el) hideKb(); }, ms)); };
  ['pointerdown', 'touchstart', 'mousedown'].forEach(t => document.addEventListener(t, e => {
    const el = e.target && e.target.closest && e.target.closest(PADDED); if (!el) return;
    if (padOn()) lock(el); else unlock(el);           // switched off since it was drawn: the phone's keyboard may open for this tap
  }, { capture: true, passive: true }));
  document.addEventListener('focusin', e => {
    const el = e.target; if (!el.matches || !el.matches(PADDED)) return;
    if (padOn()) { lock(el); show(el); hideKbSoon(el); } else unlock(el);
  });
  if (window.MutationObserver) new MutationObserver(list => { if (!padOn()) return; for (const m of list) for (const n of m.addedNodes) if (n.nodeType === 1) { if (n.matches && n.matches(PADDED)) lock(n); else if (n.querySelector) n.querySelectorAll(PADDED).forEach(lock); } })
    .observe(document.body, { childList: true, subtree: true });
  document.addEventListener('focusout', e => {
    if (!cur || e.target !== cur) return;
    setTimeout(() => { const a = document.activeElement; if (!(a && a.matches && a.matches('.set-row input.num'))) hide(); }, 80);
  });
  const after1 = A.afterRender;
  A.afterRender = name => { if (after1) after1(name); mark0(); if (cur && !document.body.contains(cur)) hide(); if (name !== 'session' && name !== 'sessionEdit') hide(); };

  window.SetX = { mark, under, ticked, effName, EFF, KINDS, kindOf, hidePad: hide };
})();
