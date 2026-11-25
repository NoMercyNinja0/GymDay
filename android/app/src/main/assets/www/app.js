/* GymDay – UI, navigation and workout logic */
(function () {
  const S = window.Store, D = S.data;
  const $ = (sel, el) => (el || document).querySelector(sel);
  const $$ = (sel, el) => Array.from((el || document).querySelectorAll(sel));
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const viewEl = $('#view');
  const unit = () => D.settings.unit || 'kg';

  // ---------------- helpers ----------------
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function fmtDate(ts) {
    const d = new Date(ts), now = new Date();
    const sameDay = (a, b) => a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
    if (sameDay(d, now)) return 'Today';
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (sameDay(d, y)) return 'Yesterday';
    return `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}` + (d.getFullYear() !== now.getFullYear() ? ' ' + d.getFullYear() : '');
  }
  function fmtClock(ts) { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; }
  function fmtDur(ms) { const s = Math.max(0, Math.round(ms / 1000)); const m = Math.floor(s / 60); const h = Math.floor(m / 60); return h ? `${h} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; }          // 1.35.2: “1 h 8 min”, as sleep is written (was “1h 8m”)
  function fmtTimer(ms) { const s = Math.max(0, Math.floor(ms / 1000)); const m = Math.floor(s / 60), h = Math.floor(m / 60); return (h ? h + ':' : '') + `${String(m % 60).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function fmtShort(ms) { const s = Math.max(0, Math.round(ms / 1000)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; }
  function num(v) { const n = parseFloat(String(v == null ? '' : v).trim().replace(',', '.')); return isNaN(n) ? 0 : n; }      // 1.35.2: 72,5 is 72.5
  function fmtW(w) { return (Math.round(w * 100) / 100).toString(); }

  function thumb(ex, cls) {
    if (ex.img && ex.img.length) return `<img class="thumb ${cls || ''}" src="${ex.img[0]}" alt="" loading="lazy">`;
    return `<div class="thumb-ph ${cls || ''}">${esc(ex.name[0])}</div>`;
  }
  const repsOn = () => D.settings.reps !== false;
  function setsSummary(sets, ex) {
    const done = sets.filter(s => s.done);
    if (!done.length) return '';
    const track = ex ? ex.track : 'weight';
    const n = done.length, nSets = `${n} set${n > 1 ? 's' : ''}`;
    if (track === 'time') return done.map(s => `${fmtW(num(s.w))} min` + (num(s.r) ? ` (${fmtW(num(s.r))})` : '')).join(', ');
    const ws = done.map(s => num(s.w));
    const sameW = ws.every(w => w === ws[0]);
    const hasReps = repsOn() && done.some(s => num(s.r) > 0);
    const pre = track === 'bw' ? '+' : '';
    if (track === 'bw' && ws.every(w => !w)) return hasReps ? `${done.map(s => num(s.r)).join(', ')} reps` : nSets;
    if (!hasReps) return sameW ? `${pre}${fmtW(ws[0])} ${unit()} × ${nSets}` : `${pre}${ws.map(fmtW).join(', ')} ${unit()}`;
    if (sameW) return `${pre}${fmtW(ws[0])} ${unit()} × ${done.map(s => num(s.r)).join(', ')}`;
    return done.map(s => `${pre}${fmtW(num(s.w))}` + (num(s.r) ? `×${num(s.r)}` : '')).join(', ');
  }
  function trackCols(track) {
    if (track === 'time') return ['min', 'km / level'];
    if (track === 'bw') return ['+' + unit(), 'reps'];
    return [unit(), 'reps'];
  }
  // the second column is reps; it is hidden when reps are switched off (cardio keeps its km / level column)
  const twoCols = track => track === 'time' || repsOn();
  function bestText(b, ex) {
    if (!b) return '—';
    if (ex.track === 'time') return `${fmtW(b.w)} min`;
    if (ex.track === 'bw' && !b.w) return repsOn() && b.r ? `${b.r} reps` : '—';
    return `${fmtW(b.w)} ${unit()}` + (repsOn() && b.r ? ` × ${b.r}` : '');
  }
  const pad2 = n => String(n).padStart(2, '0');
  // a date inside a sentence: "today", "yesterday" or "on Sat 7 Nov"
  const whenText = ts => { const d = fmtDate(ts); return /^(Today|Yesterday)$/.test(d) ? d.toLowerCase() : 'on ' + d; };
  const sinceText = ts => { const d = fmtDate(ts); return /^(Today|Yesterday)$/.test(d) ? d.toLowerCase() : d; };
  const wStepSize = ex => (ex && ex.track === 'time' ? 1 : (unit() === 'lb' ? 5 : 2.5));
  const fmtBig = v => Math.round(v).toLocaleString('en-US');
  // Estimated one-rep max (Epley formula). Only sets of 1 to 12 reps are used; beyond that the estimate is poor.
  const e1rm = (w, r) => (r <= 1 ? w : w * (1 + r / 30));
  const okForE = s => num(s.w) > 0 && num(s.r) >= 1 && num(s.r) <= 12;
  // Records for one exercise from kept workouts. skipId leaves one workout out (to know what stood before it).
  function recordsFor(exId, skipId) {
    const r = { w: null, e: null, vol: null };
    for (const rec of S.sessionsFor(exId)) {
      const s = rec.session; if (s.keep === false || s.id === skipId) continue;
      let vol = 0;
      for (const x of rec.sets) {
        const w = num(x.w), reps = num(x.r);
        if (w > 0 && (!r.w || w > r.w.v)) r.w = { v: w, r: reps, date: s.start };
        if (okForE(x)) { const v = e1rm(w, reps); if (!r.e || v > r.e.v) r.e = { v, w, r: reps, date: s.start }; }
        vol += w * reps;
      }
      if (vol > 0 && (!r.vol || vol > r.vol.v)) r.vol = { v: vol, date: s.start };
    }
    return r;
  }
  // What a finished workout beat. Only real improvements count: the first time an exercise is logged sets no record.
  function newRecords(s) {
    if (s.keep === false) return [];
    const out = [];
    for (const it of s.items) {
      if (it.skipped) continue;
      const ex = S.getEx(it.ex); if (!ex || ex.track === 'time') continue;
      const done = it.sets.filter(S.work); if (!done.length) continue;
      const before = recordsFor(ex.id, s.id);
      const topW = Math.max(0, ...done.map(x => num(x.w)));
      const heavier = topW > 0 && before.w && topW > before.w.v;
      if (heavier) out.push({ ex: ex.id, kind: 'Heaviest weight', text: `${fmtW(topW)} ${unit()} (was ${fmtW(before.w.v)})` });
      if (!repsOn()) continue;
      const best = done.filter(okForE).sort((a, b) => e1rm(num(b.w), num(b.r)) - e1rm(num(a.w), num(a.r)))[0];
      if (!heavier && best && before.e && e1rm(num(best.w), num(best.r)) > before.e.v + 0.01)
        out.push({ ex: ex.id, kind: 'Strongest set', text: `${fmtW(num(best.w))} × ${num(best.r)} (was ${fmtW(before.e.w)} × ${before.e.r})` });
      const vol = done.reduce((t, x) => t + num(x.w) * num(x.r), 0);
      if (vol > 0 && before.vol && vol > before.vol.v) out.push({ ex: ex.id, kind: 'Most lifted in one workout', text: `${fmtBig(vol)} ${unit()} (was ${fmtBig(before.vol.v)})` });
    }
    return out;
  }
  // What to aim for today: more weight when every set at last time's top weight reached the reps aimed for, otherwise one more rep.
  function targetFor(ex, last, planned) {
    if (!ex || ex.track !== 'weight' || !repsOn() || !last) return null;
    const done = last.sets.filter(s => num(s.w) > 0 && num(s.r) > 0); if (!done.length) return null;
    const top = Math.max(...done.map(s => num(s.w))), at = done.filter(s => num(s.w) === top);
    const most = Math.max(...at.map(s => num(s.r))), low = Math.min(...at.map(s => num(s.r)));
    const aim = num(planned && planned.reps) || most;
    if (low >= aim) return { w: top + wStepSize(ex), r: aim, up: true };
    return { w: top, r: low + 1, up: false };
  }
  // Weeks start on Monday.
  function weekStartOf(ts, back) { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - ((d.getDay() + 6) % 7) - 7 * (back || 0)).getTime(); }
  const weekGoal = () => (D.settings.weekGoal == null ? 3 : +D.settings.weekGoal || 0);
  // v1.17: workouts in a time span, with the activities of 20 minutes or more when the person chose to count them (sports.js)
  const doneIn = (a, z) => D.sessions.filter(s => s.start >= a && s.start < z).length + (window.Sports ? window.Sports.goalCount(a, z) : 0);
  function goalCard() {
    const g = weekGoal(); if (!g) return '';
    const ws = weekStartOf(Date.now()), n = doneIn(ws, Infinity);
    let streak = n >= g ? 1 : 0;
    for (let b = 1; b < 520; b++) { const a = weekStartOf(Date.now(), b), z = weekStartOf(Date.now(), b - 1); if (doneIn(a, z) >= g) streak++; else break; }
    const C = 2 * Math.PI * 20, p = Math.min(1, n / g);
    return `<div class="card tap goal" data-act="goalEdit"><svg width="52" height="52" viewBox="0 0 52 52" aria-hidden="true"><circle cx="26" cy="26" r="20" fill="none" stroke="var(--bg3)" stroke-width="6"/>${p > 0 ? `<circle cx="26" cy="26" r="20" fill="none" stroke="${n >= g ? 'var(--green)' : 'var(--accent)'}" stroke-width="6" stroke-linecap="round" stroke-dasharray="${C * p} ${C}" transform="rotate(-90 26 26)"/>` : ''}<text x="26" y="31" text-anchor="middle" font-size="15" font-weight="800" fill="currentColor">${n}/${g}</text></svg>
      <div class="grow"><div class="title">${n >= g ? 'Weekly goal reached 🎉' : `${g - n} more workout${g - n > 1 ? 's' : ''} this week`}</div>
      <div class="small muted mt4">Goal: ${g} a week${streak ? ` · 🔥 ${streak} week${streak > 1 ? 's' : ''} in a row` : ''}</div></div><span class="chev">›</span></div>`;
  }

  // ---------------- toast / sheet / lightbox ----------------
  let toastT = null;
  window.toast = function (msg) {
    const t = $('#toast'); t.textContent = msg; t.classList.remove('hidden');
    clearTimeout(toastT); toastT = setTimeout(() => { if (t.textContent === msg) t.classList.add('hidden'); }, 2200);     // v1.17: never hides a newer message (an Undo shown since)
  };
  let sheetMount = null, sheetClose = null;
  function openSheet(html, mount, onClose) {
    const s = $('#sheet');
    if (sheetClose) { const cb = sheetClose; sheetClose = null; cb(); }
    s.innerHTML = `<div class="panel"><div class="handle"></div>${html}</div>`;
    s.classList.remove('hidden');
    sheetMount = mount || null;
    sheetClose = onClose || null;
    if (mount) mount(s);
  }
  function closeSheet(from) {
    const s = $('#sheet');
    if (s.classList.contains('hidden')) return false;
    if (window.Motion) window.Motion.ghost(s, from);          // a picture of the sheet slides away; the sheet itself is gone at once
    s.classList.add('hidden'); s.innerHTML = ''; sheetMount = null;
    const cb = sheetClose; sheetClose = null; if (cb) cb();
    return true;
  }
  function openLightbox(src, p) {
    const d = document.createElement('div'); d.className = 'lightbox'; d.id = 'lightbox';
    d.innerHTML = `<img src="${src}" alt="" data-p="${esc(p || '')}">`; d.addEventListener('click', closeLightbox);
    document.body.appendChild(d);
  }
  function closeLightbox() { const d = $('#lightbox'); if (!d) return false; d.remove(); return true; }

  const undo = (m, f) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, f) : toast(m));          // 1.33: a delete with a way back
  // ---------------- navigation ----------------
  let stack = [{ name: 'days' }];
  let rootName = 'days';
  const scrollMemo = {};
  function go(name, params) { stack.push({ name, params: params || {} }); render(); }
  function leaving(entry) { const v = VIEWS[entry.name]; if (v && v.leave) v.leave(entry.params || {}); }
  function back() { if (stack.length > 1) { leaving(stack.pop()); render(true); return true; } return false; }
  function setRoot(name) { stack.forEach(leaving); rootName = name; stack = [{ name, params: {} }]; render(); }
  // 1.35.2: Back first closes the AI question, a picture, a sheet or a page; on another tab's first page it goes to Today,
  // and only on Today does it leave the app (as most phone apps do)
  window.appBack = function () {
    if (window.Cloud && window.Cloud.aiDismiss && window.Cloud.aiDismiss()) return true;
    if (closeLightbox()) return true; if (closeSheet()) return true; if (pick && stack[stack.length - 1].name === 'picker') { lib = pick.saved; pick = null; }
    if (back()) return true;
    if (stack.length === 1 && window.__calm !== false && ['calories', 'library', 'clubs', 'history', 'settings'].includes(rootName) && !$('#nav').classList.contains('hidden')) { setRoot('days'); return true; }
    return false;
  };
  window.appPause = function () { S.save(true); };

  let viewTimers = [];
  function later(fn, ms, repeat) { const id = repeat ? setInterval(fn, ms) : setTimeout(fn, ms); viewTimers.push({ id, repeat }); return id; }
  function clearViewTimers() { viewTimers.forEach(t => t.repeat ? clearInterval(t.id) : clearTimeout(t.id)); viewTimers = []; }

  function render(restoreScroll) {
    const cur = stack[stack.length - 1];
    const v = VIEWS[cur.name];
    clearViewTimers();
    viewEl.className = 'view' + (cur.name === 'session' ? ' session-mode' : '') + (cur.name === 'choose' ? ' choose-mode' : '');
    viewEl.innerHTML = v.html(cur.params);
    if (v.mount) v.mount(cur.params);
    const key = cur.name + JSON.stringify(cur.params || {});
    window.scrollTo(0, restoreScroll && scrollMemo[key] ? scrollMemo[key] : 0);
    $$('.nav-btn').forEach(b => b.classList.toggle('on', b.dataset.nav === rootName));
    const nf = $('#navFood'); if (nf) nf.style.display = window.Calories && !window.Calories.on() ? 'none' : '';      // v1.12: the Food tab, unless calories are switched off
    const noNav = ['session', 'picker', 'choose'].includes(cur.name) || !!v.noNav;
    $('#nav').classList.toggle('hidden', noNav);
    document.body.classList.toggle('no-nav', noNav);
    if (window.App && window.App.afterRender) window.App.afterRender(cur.name);
  }
  function rerender() { // keep scroll position
    const cur = stack[stack.length - 1];
    scrollMemo[cur.name + JSON.stringify(cur.params || {})] = window.scrollY;
    render(true);
  }
  window.addEventListener('scroll', () => { const cur = stack[stack.length - 1]; scrollMemo[cur.name + JSON.stringify(cur.params || {})] = window.scrollY; }, { passive: true });

  // ---------------- starter days ----------------
  const STARTERS = [
    { name: 'Chest & Triceps (Push)', items: ['bench-press', 'incline-db-press', 'cable-fly-high', 'pec-deck', 'triceps-pushdown', 'overhead-cable-ext'] },
    { name: 'Back & Biceps (Pull)', items: ['lat-pulldown-wide', 'seated-cable-row', 'one-arm-db-row', 'straight-arm-pulldown', 'cable-bar-curl', 'cable-hammer-curl'] },
    { name: 'Legs', items: ['back-squat', 'leg-press', 'leg-extension', 'seated-leg-curl', 'romanian-deadlift', 'standing-calf-raise'] },
    { name: 'Shoulders & Arms', items: ['smith-ohp', 'cable-lateral-raise', 'reverse-pec-deck', 'db-shrug', 'preacher-curl', 'bayesian-curl', 'single-arm-pushdown'] },
    { name: 'Arm Day', items: ['cable-bar-curl', 'preacher-curl', 'cable-hammer-curl', 'triceps-pushdown', 'overhead-cable-ext', 'skull-crusher'] },
  ];
  // 1.35.2: a custom exercise's muscles are picked from the names the library uses (they were typed, so they rarely matched)
  const CX_MUS = ['Upper chest', 'Mid chest', 'Lower chest', 'Front delts', 'Side delts', 'Rear delts', 'Lats', 'Upper back', 'Mid back', 'Lower back', 'Upper traps', 'Biceps', 'Brachialis', 'Triceps', 'Forearms', 'Abs', 'Obliques', 'Glutes', 'Quads', 'Hamstrings', 'Adductors', 'Calves'];
  // 1.35.2: the starter days' names written the same way (the old ones stay for the tests)
  const STARTER_NAMES = ['Push: chest & triceps', 'Pull: back & biceps', 'Legs', 'Shoulders & arms', 'Arms'];

  // ---------------- VIEWS ----------------
  const VIEWS = {};

  // ===== Days (home) =====
  // v1.9: a greeting with the person's first name (when signed in) and today's date
  function greeting() {
    const hr = new Date().getHours(), p = S.meta && S.meta.profile, nm = p && p.name ? String(p.name).trim().split(/\s+/)[0] : '';
    return (hr < 5 ? 'Good night' : hr < 12 ? 'Good morning' : hr < 17 ? 'Good afternoon' : 'Good evening') + (nm ? ', ' + nm : '');
  }
  const todayLong = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  VIEWS.days = {
    html() {
      // v1.22: this is the Today page: the day in rings and the next workout first (today.js), then the cards, then your days
      let h = `<div class="top home-top"><div class="grow"><div class="eyebrow">${esc(todayLong())}</div><h1>${esc(greeting())}</h1></div></div>`;
      if (D.active) {
        h += `<div class="card tap" data-act="resume" style="background:var(--accent-bg);border-color:var(--accent);box-shadow:var(--glow)"><div class="row"><div class="grow"><div class="title accent">Workout in progress</div>
          <div class="small muted">${esc(D.active.dayName)} · ${D.active.pauseAt ? 'paused at ' + fmtDur(S.liveMs(D.active)) : 'started ' + fmtDur(Date.now() - D.active.start) + ' ago'}</div></div><span class="btn sm primary">Open ▶</span></div></div>`;
      }
      h += window.CloudUI && window.CloudUI.banner ? window.CloudUI.banner() : '';
      h += window.Today ? window.Today.top() : '';
      const glance = (window.Today ? '' : goalCard()) + (window.Insights ? window.Insights.homeCards() : '');      // v1.22: the week's goal is in Today's rings
      if (glance) h += `<div class="sec-h"><span>At a glance</span></div>` + glance;
      if (!D.days.length) {
        h += `<div class="empty"><div class="big">🏋️</div><h2>No days yet</h2><p>Create a day and pick the exercises you want in it, or start from 5 ready-made days for a usual gym.</p>
          <div class="mt16"><button class="btn primary" data-act="newDay">Create a day</button></div>
          <div class="mt8"><button class="btn" data-act="addStarters">Add 5 starter days</button></div>${ACT.progImport ? `<div class="mt8"><button class="btn" data-act="progImport">Import a program</button></div>` : ''}${D.settings.plans ? `<div class="mt8"><button class="btn" data-act="plansOpen">Plans</button></div>` : ''}</div>`;
      }
      const dayBtns = `${D.settings.plans ? `<button class="btn sm" data-act="plansOpen">Plans</button>` : ''}<button class="btn sm" data-act="newDay">+ New day</button>`;
      if (D.days.length) h += `<div class="sec-h"><span>Your days</span><span class="sec-n">${D.days.length}</span><span class="seg">${dayBtns}</span></div>`;
      for (const d of D.days) {
        const st = S.dayStats(d.id);
        const groups = [...new Set(d.items.map(i => (S.getEx(i.ex) || {}).group).filter(Boolean))];
        h += `<div class="card tap" data-act="openDay" data-id="${d.id}">
          <div class="row"><div class="grow"><div class="title">${esc(d.name)}</div>
            <div class="small muted mt4">${d.items.length} exercise${d.items.length === 1 ? '' : 's'}${st.count ? ` · done ${st.count}× · last ${fmtDate(st.last)}` : ' · not done yet'}</div>
            <div class="mt8">${groups.map(g => `<span class="pill">${esc(g)}</span>`).join('')}</div></div>
            <button class="btn sm primary" data-act="startDay" data-id="${d.id}">Start ▶</button></div></div>`;
      }
      if (ACT.progImport && (D.days.length || window.__calm === false)) h += `<button class="linkish xs mt8" data-act="progImport">📷 Import a program from a photo or text</button>`;      // v1.28 (1.35.2: not twice when there are no days yet)
      return h;
    }
  };

  // ===== Day: a numbered pool of exercises — drag to reorder, edit sets × reps, remove, + to add =====
  let planCtx = null; // { dayId, i } while the sets × reps panel is open
  // What the next workout will start from: the last workout, unless the plan was edited after it.
  function planLine(it, ex) {
    const last = S.lastFor(ex.id);
    const planNewer = !!last && num(it.planAt) > last.session.start;
    if (last && !planNewer) return 'Last: ' + setsSummary(last.sets, ex);
    const sets = Math.max(1, Math.round(num(it.sets)) || (last ? last.sets.length : 3));
    const reps = repsOn() && ex.track !== 'time' && num(it.reps) ? ` × ${fmtW(num(it.reps))}` : '';
    return `Plan: ${sets} set${sets > 1 ? 's' : ''}${reps}`;
  }
  function planSave() {
    const d = planCtx && S.getDay(planCtx.dayId); const it = d && d.items[planCtx.i]; if (!it) return;
    const sIn = $('#planSets'), rIn = $('#planReps');
    if (sIn) { const v = Math.round(num(sIn.value)); if (v >= 1) it.sets = Math.min(20, v); }
    if (rIn) { const v = num(rIn.value); it.reps = v > 0 ? v : ''; }
    it.planAt = Date.now();
    S.save();
  }
  VIEWS.day = {
    html({ id }) {
      const d = S.getDay(id); if (!d) return `<div class="empty">Day not found</div>`;
      const st = S.dayStats(id);
      let h = `<div class="top day-top"><button class="back" data-act="back">‹</button><div class="grow" data-act="renameDay" data-id="${id}"><h1 class="ellipsis" style="font-size:22px">${esc(d.name)} <span class="dim" style="font-size:14px;font-weight:400">✎</span></h1>
        <div class="sub">${d.items.length} exercise${d.items.length === 1 ? '' : 's'} to choose from${st.count ? ` · done ${st.count}×` : ''}</div></div>${d.items.length ? `<button class="btn sm primary" data-act="startDay" data-id="${id}">▶ Start</button>` : ''}<button class="btn icon" data-act="pickFor" data-id="${id}" aria-label="Add exercises" style="font-size:24px;font-weight:700;color:var(--accent)">+</button></div>`;
      if (!d.items.length) h += `<div class="empty"><p>No exercises in this day yet.</p><div class="mt12"><button class="btn primary" data-act="pickFor" data-id="${id}">+ Add exercises</button></div></div>`;
      else {
        h += `<div class="card" id="dayList">`;
        let n = 0;
        d.items.forEach((it, i) => {
          const ex = S.getEx(it.ex); if (!ex) return;
          const xd = D.ex[ex.id] || {};
          h += `<div class="day-row" data-i="${i}"><div class="grip" aria-label="Drag to reorder">≡</div>
            <div class="th" data-act="openEx" data-id="${ex.id}">${thumb(ex)}<span class="no">${++n}</span></div>
            <div class="grow" data-act="openEx" data-id="${ex.id}"><div class="nm">${esc(ex.name)}</div>
              <div class="xs muted ellipsis">${esc(ex.primary.join(', '))}</div>
              <div class="xs mt4 plan-ln"><span class="dim">${esc(planLine(it, ex))}</span>${xd.max ? ` · <span class="accent">top ${fmtW(xd.max)}</span>` : ''}</div></div>
            <button class="ib" data-act="planOpen" data-id="${id}" data-i="${i}" aria-label="Edit sets and reps">✎</button>
            <button class="ib x" data-act="dayRemove" data-id="${id}" data-i="${i}" aria-label="Remove">✕</button></div>`;
        });
        h += `</div><p class="xs dim" style="margin:-2px 2px 12px">Hold ≡ and drag to change the order. ▶ Start is at the top.</p>`;
      }
      h += `<button class="btn ghost block mt12" data-act="deleteDay" data-id="${id}">Delete this day</button>`;
      return h;
    },
    mount({ id }) { dayDragMount(id); }
  };
  // Drag a row by its grip to reorder the day. While the finger is down rows only move with transforms
  // (nothing is re-inserted, so the touch is never lost); on release the new order is saved and redrawn.
  function dayDragMount(dayId) {
    const list = $('#dayList'); const d = S.getDay(dayId); if (!list || !d) return;
    let g = null;
    const place = () => {
      const dy = g.y - g.y0 + (window.scrollY - g.s0);
      g.row.style.transform = `translateY(${dy}px)`;
      const c = g.mid[g.from] + dy;
      let to = g.from;
      for (let j = g.from + 1; j < g.rows.length; j++) if (c > g.mid[j]) to = j;
      for (let j = g.from - 1; j >= 0; j--) if (c < g.mid[j]) to = j;
      g.to = to;
      g.rows.forEach((r, j) => {
        if (j === g.from) return;
        const sh = (j < g.from && j >= to) ? g.h : (j > g.from && j <= to) ? -g.h : 0;
        r.style.transform = sh ? `translateY(${sh}px)` : '';
      });
    };
    const tick = () => {
      if (!g) return;
      if (!document.body.contains(g.row)) { g = null; return; }
      const edge = 90, vh = window.innerHeight;
      if (g.y < edge) window.scrollBy(0, -Math.ceil((edge - g.y) / 6));
      else if (g.y > vh - edge) window.scrollBy(0, Math.ceil((g.y - (vh - edge)) / 6));
      place();
      g.raf = requestAnimationFrame(tick);
    };
    const end = commit => {
      if (!g) return;
      cancelAnimationFrame(g.raf);
      const { from, to, rows } = g; g = null;
      if (commit && to !== from) {
        const order = rows.map(r => +r.dataset.i);
        const [moved] = order.splice(from, 1); order.splice(to, 0, moved);
        const shown = new Set(order);
        d.items = order.map(i => d.items[i]).concat(d.items.filter((_, i) => !shown.has(i)));
        S.save(true);
      }
      rerender();
    };
    list.addEventListener('pointerdown', e => {
      const grip = e.target.closest('.grip'); if (!grip || g) return;
      const row = grip.closest('.day-row'); const rows = $$('.day-row', list);
      const from = rows.indexOf(row); if (from < 0) return;
      e.preventDefault();
      const rects = rows.map(r => r.getBoundingClientRect());
      g = { row, rows, from, to: from, id: e.pointerId, y0: e.clientY, y: e.clientY, s0: window.scrollY, h: rects[from].height, mid: rects.map(r => r.top + window.scrollY + r.height / 2) };
      try { grip.setPointerCapture(e.pointerId); } catch (err) { }
      row.classList.add('dragging');
      rows.forEach(r => { if (r !== row) r.classList.add('shift'); });
      if (S.isAndroid) window.Android.vibrate(15);
      g.raf = requestAnimationFrame(tick);
    });
    list.addEventListener('pointermove', e => { if (g && e.pointerId === g.id) { g.y = e.clientY; e.preventDefault(); } });
    list.addEventListener('pointerup', e => { if (g && e.pointerId === g.id) { g.y = e.clientY; place(); end(true); } });
    list.addEventListener('pointercancel', e => { if (g && e.pointerId === g.id) end(false); });
  }

  // ===== Library / picker =====
  let lib = { q: '', group: 'All', equip: 'All' };
  let pick = null; // { mode:'day'|'session'|'choose'|'swap', dayId, idx, label, ids:Set, have:Set (already there), saved:lib filters }
  // 1.33: an exercise picked from a search keeps that search for next time (on this phone)
  function libKeepQ() {
    const t = (lib.q || '').trim().slice(0, 30); if (t.length < 2) return;
    const l = Array.isArray(S.meta.libQs) ? S.meta.libQs : (S.meta.libQs = []), i = l.findIndex(x => x.toLowerCase() === t.toLowerCase());
    if (i >= 0) l.splice(i, 1); l.unshift(t); l.length = Math.min(l.length, 6); S.saveMeta();
  }
  // 1.33 (43): picking exercises, the ones you have done most in the last 90 days come first (a recent one counts more)
  function usage() {
    const m = new Map(); if (!(stack[stack.length - 1].name === 'picker' && !lib.q.trim() && lib.group === 'All')) return m;
    const now = Date.now(), from = now - 90 * 86400000;
    for (const x of D.sessions) if (x.start >= from) for (const it of x.items || []) if (it.sets && it.sets.some(y => y.done)) m.set(it.ex, (m.get(it.ex) || 0) + 1 + (x.start > now - 21 * 86400000 ? 1 : 0));
    return m;
  }
  function libraryFiltered() {
    const toks = lib.q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    const xd = id => D.ex[id] || {};
    const use = usage();
    return S.allExercises().filter(e => {
      if (lib.group === 'Hidden') return !!xd(e.id).hide;
      if (xd(e.id).hide) return false;                                  // hidden exercises only show under "Hidden"
      if (window.Trainer && !window.Trainer.has(e) && !lib.all) return false;      // not at the gym being trained at (Trainer mode)
      if (lib.group === 'Fav') return !!xd(e.id).fav;
      if (lib.group === 'Mine' && !e.mine) return false;
      if (lib.group !== 'All' && lib.group !== 'Mine' && e.group !== lib.group) return false;
      if (lib.equip !== 'All' && e.equip !== lib.equip) return false;
      if (toks.length) { const hay = (e.name + ' ' + (e.aka || []).join(' ') + ' ' + e.primary.join(' ') + ' ' + (e.secondary || []).join(' ') + ' ' + e.group + ' ' + e.equip).toLowerCase(); if (!toks.every(t => hay.includes(t))) return false; }
      return true;
    }).map((e, i) => ({ e, i, f: xd(e.id).fav ? 0 : 1, u: use.get(e.id) || 0 })).sort((a, b) => a.f - b.f || b.u - a.u || a.i - b.i).map(x => x.e);   // favourites first (1.33: in the picker, then the ones you do most)
  }
  function libHeadHtml(pickMode) {
    if (!pickMode) return `<div class="top lib-top"><div class="grow"><h1>Library</h1><div class="sub">${S.allExercises().length} exercises · tap one for setup, max & history</div></div><div class="top-acts"><button class="btn sm" data-act="bodyPick">Body map</button>${window.Machine ? window.Machine.libBtn() : ''}<button class="btn sm" data-act="customEx">+ Custom</button></div></div>`;
    const n = pick.ids.size, swap = pick.mode === 'swap';
    return `<div class="top"><button class="back" data-act="pickCancel">‹</button><div class="grow"><h1>${swap ? 'Swap exercise' : 'Pick exercises'}</h1><div class="sub ellipsis">${swap ? 'Replacing ' + esc(pick.label || '') : n + ' selected'}</div></div>
      <button class="btn sm primary" data-act="pickDone" ${swap && !n ? 'disabled' : ''}>${swap ? 'Swap' : `Add (${n})`}</button></div>
      ${swap ? '' : `<div class="bottom-bar pickbar"><button class="btn primary block" data-act="pickDone" ${n ? '' : 'disabled'}>${n ? `Done · add ${n} exercise${n === 1 ? '' : 's'}` : 'Tick the exercises you want'}</button></div>`}`;
  }
  function libChipsHtml() {
    const anyHidden = Object.keys(D.ex).some(id => D.ex[id].hide), lbl = { Mine: '★ Popular', Fav: '♥ Favourites' };          // 1.35.2: the gym's usual exercises (was “My list”); your own picks are ♥ Favourites
    return `<div class="chips">${['All', 'Fav', 'Mine'].concat(S.GROUPS, anyHidden || lib.group === 'Hidden' ? ['Hidden'] : []).map(g => `<button class="chip ${lib.group === g ? 'on' : ''}" data-act="libGroup" data-g="${g}">${lbl[g] || g}</button>`).join('')}</div>
      <div class="chips">${['All'].concat(S.EQUIP).map(g => `<button class="chip ${lib.equip === g ? 'on' : ''}" data-act="libEquip" data-g="${g}">${g}</button>`).join('')}</div>`;
  }
  function libResultsHtml(pickMode) {
    const list = libraryFiltered(), T = window.Trainer;
    let h = T && T.on() && T.missing() ? `<div class="lib-gym"><span class="grow">${lib.all ? 'Showing everything' : `${T.missing()} left out: ${esc(T.gym().name)} does not have the equipment`}</span><button data-act="libAll">${lib.all ? 'Only what it has' : 'Show all'}</button></div>` : '';
    const lq = Array.isArray(S.meta.libQs) ? S.meta.libQs : [];          // 1.33: the last exercise searches, while the box is empty
    if (!lib.q && lq.length) h += `<div class="kc-rq lib-rq" role="group" aria-label="Your last searches"><span class="xs muted">Searched</span>${lq.map(x => `<button class="chip sm" data-act="libRq" data-v="${esc(x)}">${esc(x)}</button>`).join('')}<button class="chip sm ghost" data-act="libRqClear" aria-label="Forget these searches">✕</button></div>`;
    h += list.length ? '' : `<div class="empty"><p>Nothing matches.</p></div>`;
    h += `<div class="grid">`;
    for (const e of list) {
      const xd = D.ex[e.id] || {};
      const picked = pickMode && pick.ids.has(e.id);
      const have = pickMode && pick.have && pick.have.has(e.id);
      h += `<div class="ex-card ${pickMode ? 'pk' : ''} ${picked ? 'picked' : ''} ${have ? 'have' : ''}" data-act="${pickMode ? (have ? 'pickHave' : 'pickToggle') : 'openEx'}" data-id="${e.id}">
        ${e.img && e.img.length ? `<img src="${e.img[0]}" alt="" loading="lazy">` : `<div class="ph">${esc(e.name[0])}</div>`}
        ${xd.fav ? `<span class="badge fav">♥</span>` : (e.mine ? `<span class="badge">★</span>` : '')}${have ? `<span class="max">✓ added</span>` : (xd.max ? `<span class="max">${fmtW(xd.max)} ${unit()}</span>` : '')}
        <div class="body"><div class="name">${lib.q && window.Mark ? window.Mark(e.name, lib.q) : esc(e.name)}</div><div class="mus">${esc(e.primary.join(', '))}</div></div>
        ${pickMode && !have ? `<div class="check">${picked ? '✓' : ''}</div>` : ''}</div>`;
    }
    return h + `</div>`;
  }
  function libraryHtml(pickMode) {
    return `<div id="libHead">${libHeadHtml(pickMode)}</div>
      <div class="search"><span class="ic">⌕</span><input class="input" id="libq" placeholder="Search exercise or muscle" value="${esc(lib.q)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button class="clr ${lib.q ? '' : 'hidden'}" id="libClr" data-act="libClear" aria-label="Clear search">✕</button></div>
      <div id="libChips">${libChipsHtml()}</div><div id="libResults">${libResultsHtml(pickMode)}</div>`;
  }
  // Redraw the list around the search box without replacing the box itself. Replacing it on every
  // keystroke restarted the phone keyboard each time, which broke hold-to-delete and word suggestions.
  function libRefresh(resultsOnly) {
    const pickMode = stack[stack.length - 1].name === 'picker';
    const head = $('#libHead'), chips = $('#libChips'), res = $('#libResults');
    if (!head || !chips || !res) { rerender(); return; }
    if (!resultsOnly) {
      const sl = $$('.chips', chips).map(c => c.scrollLeft);
      head.innerHTML = libHeadHtml(pickMode);
      chips.innerHTML = libChipsHtml();
      $$('.chips', chips).forEach((c, i) => { c.scrollLeft = sl[i] || 0; });
    }
    res.innerHTML = libResultsHtml(pickMode);
    const clr = $('#libClr'); if (clr) clr.classList.toggle('hidden', !lib.q);
  }
  function libraryMount() {
    const q = $('#libq');
    if (q) q.addEventListener('input', () => { lib.q = q.value; libRefresh(true); });
    // bring a pre-selected filter chip (e.g. the body part when swapping) into view
    $$('#libChips .chips').forEach(row => { const on = $('.chip.on', row); if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - 60); });
  }
  VIEWS.library = { html() { return libraryHtml(false); }, mount: libraryMount };
  VIEWS.picker = { html() { return libraryHtml(true); }, mount: libraryMount };

  // setup photos grid (exercise page and the setup panel inside a workout)
  function photosHtml(id) {
    const xd = S.exData(id);
    return xd.photos.map(p => { const src = S.showPhoto(p); return `<div class="photo" data-act="viewPhoto" data-p="${p}">${src ? `<img src="${src}" alt="">` : `<div class="wait">loading…</div>`}<button class="del" data-act="delPhoto" data-id="${id}" data-p="${p}">✕</button></div>`; }).join('') +
      `<div class="photo add" data-act="addPhoto" data-id="${id}"><span class="plus">+</span><span class="xs">Setup photo</span></div>`;
  }
  let setupCtx = null; // exercise id while the setup panel is open inside a workout
  function setupLine(ex) {
    const xd = D.ex[ex.id] || {};
    const note = (xd.notes || '').trim().replace(/\s+/g, ' ');
    const n = (xd.photos || []).length, ph = n ? `${n} photo${n > 1 ? 's' : ''}` : '';
    if (!note && !n) return `<div class="setup-ln none" data-act="sxSetup" data-id="${ex.id}">+ Setup note</div>`;
    return `<div class="setup-ln" data-act="sxSetup" data-id="${ex.id}"><span class="tag">Setup</span>${esc(note)}${note && ph ? ' · ' : ''}${ph ? `<span class="ph">${ph}</span>` : ''}</div>`;
  }

  // ===== Exercise detail =====
  VIEWS.exercise = {
    html({ id }) {
      const ex = S.getEx(id); if (!ex) return `<div class="empty">Exercise not found</div>`;
      const xd = S.exData(id);
      const hist = S.sessionsFor(id);
      const best = S.bestFor(id);
      const cols = trackCols(ex.track);
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1 style="font-size:21px">${esc(ex.name)}</h1>
        <div class="sub">${esc(ex.group)} · ${esc(ex.equip)}${ex.mine ? ' · ★ popular' : ''}</div></div>
        <button class="btn icon" data-act="favToggle" data-id="${id}" aria-label="Favourite" style="font-size:20px;${xd.fav ? 'color:var(--red)' : ''}">${xd.fav ? '♥' : '♡'}</button></div>`;
      if (ex.img && ex.img.length) h += `<div class="hero" data-act="heroTap"><img id="hero" src="${ex.img[0]}" alt="">${ex.img.length > 1 ? '<div class="frame" id="heroLbl">start → end</div>' : ''}</div>`;
      h += `<div class="mt12"><div class="hits"><span class="k">Hits</span><div>${ex.primary.map(m => `<span class="pill accent">${esc(m)}</span>`).join('')}</div></div>
        ${ex.secondary.length ? `<div class="hits"><span class="k">Also</span><div>${ex.secondary.map(m => `<span class="pill">${esc(m)}</span>`).join('')}</div></div>` : ''}</div>`;
      if (window.Insights && window.Insights.exerciseBody) h += window.Insights.exerciseBody(ex);
      if (ex.tip) h += `<p class="small muted mt4">${esc(ex.tip)}</p>`;
      if (ex.alt && ex.alt.length) h += `<div class="mt8">${ex.alt.map(a => `<span class="pill blue">${esc(a)}</span>`).join('')}</div>`;

      // top set + one-rep max (timed exercises only have a best time)
      const u = ex.track === 'time' ? 'min' : unit();
      const tile = (k, label, val, sub) => `<div class="stat tap" data-act="editMax" data-id="${id}" data-k="${k}"><div class="k2">${label}</div>
        <div class="v">${val ? fmtW(val) + ` <span class="muted" style="font-size:15px;font-weight:600">${u}</span>` : '<span class="dim">—</span>'}</div><div class="k">${sub}</div></div>`;
      h += `<div class="stats mt16">${tile('max', ex.track === 'time' ? 'Best time' : 'Top set', xd.max, xd.max ? `updates itself${xd.maxDate ? ' · ' + fmtDate(xd.maxDate) : ''}` : 'tap to enter')}
        ${ex.track === 'time' ? '' : tile('orm', 'One-rep max', xd.orm, xd.orm ? `typed by you${xd.ormDate ? ' · ' + fmtDate(xd.ormDate) : ''}` : 'tap to enter')}</div>
        ${best ? `<p class="xs dim" style="margin:-4px 2px 12px">Best logged set: ${esc(bestText(best, ex))}</p>` : ''}`;
      const est = ex.track === 'weight' && repsOn() ? recordsFor(id).e : null;
      if (est) h += `<p class="xs dim" style="margin:-8px 2px 12px">Estimated one-rep max: <b class="accent">${fmtW(Math.round(est.v * 2) / 2)} ${unit()}</b>, worked out from ${fmtW(est.w)} × ${est.r} ${whenText(est.date)}.</p>`;
      // 1.35.2: How to do it and + Add to a day come first (they were four screens down, after the goal, setup, video and history)
      let pCh = '', pSet = '', pVid = '', pHist = '', pHow = '';
      pCh += chartCard(ex, hist) + (window.Insights ? window.Insights.goalCard(ex) : '');

      // setup
      pSet += `<div class="card"><h3>My setup</h3><p class="xs dim">Seat height, pin number, grip, bench angle… Shown under the exercise name during a workout.</p>
        <textarea class="input mt8" data-bind="notes" data-id="${id}" placeholder="e.g. seat 4, pin 7, handles at ear height">${esc(xd.notes)}</textarea>
        <div class="photos">${photosHtml(id)}</div></div>`;

      // video
      pVid += `<div class="card"><h3>Form video</h3><div class="row mt8"><button class="btn grow" data-act="video" data-id="${id}">▶ ${xd.video ? 'Open my saved video' : ex.video ? 'Watch how to do it' : 'Search on YouTube'}</button></div>
        <input class="input mt8" data-bind="video" data-id="${id}" value="${esc(xd.video)}" placeholder="Paste a YouTube link to save your own" inputmode="url"></div>`;

      // history
      pHist += `<div class="card"><div class="row"><h3 class="grow">History</h3><span class="xs muted">${hist.length ? `done ${hist.length}×` : 'not logged yet'}</span></div>`;
      for (const r of hist.slice(0, 6)) pHist += `<div class="list-item"><div class="grow"><div class="small">${fmtDate(r.session.start)} <span class="dim">· ${esc(r.session.dayName)}</span></div></div><div class="small" style="font-weight:600">${esc(setsSummary(r.sets, ex))}</div></div>`;
      if (hist.length > 6) pHist += `<div class="xs dim mt8">${hist.length - 6} older sessions in History</div>`;
      pHist += `</div>`;

      if (ex.steps && ex.steps.length) pHow += `<div class="card"><h3>How to do it</h3><ol class="steps">${ex.steps.map(s => `<li>${esc(s)}</li>`).join('')}</ol></div>`;

      const pAdd = `<button class="btn block" data-act="addToDay" data-id="${id}">+ Add to a day</button>`;
      if (window.__calm === false) h += pCh + pSet + pVid + pHist + pHow + pAdd;
      else h += pHow + pAdd + `<div class="mt12"></div>` + pCh + pHist + pSet + pVid;
      h += `<button class="btn ghost block mt8" data-act="hideToggle" data-id="${id}">${xd.hide ? 'Show in the library again' : 'Hide from the library'}</button>`;
      if (window.Extras) h += window.Extras.exerciseExtra(ex);
      if (ex.id.startsWith('c-')) h += `<button class="btn ghost block mt8" data-act="deleteCustom" data-id="${id}">Delete custom exercise</button>`;
      h += `<div class="mt16" style="height:8px"></div>`;
      return h;
    },
    mount({ id }) {
      const ex = S.getEx(id);
      if (ex && ex.img && ex.img.length > 1) {
        let f = 0;
        later(() => { const im = $('#hero'); if (!im) return; f = 1 - f; im.src = ex.img[f]; const l = $('#heroLbl'); if (l) l.textContent = f ? 'end position' : 'start position'; }, 1400, true);
      }
    }
  };

  // ===== Choose today's exercises (shown when a day is started) =====
  let choose = null; // { dayId, ids:Set of ticked exercise ids, extra:[ids added for today only] }
  function lastDaySession(dayId) { return D.sessions.filter(s => s.dayId === dayId).sort((a, b) => b.start - a.start)[0] || null; }
  function lastLine(ex) {
    const last = S.lastFor(ex.id);
    return last ? `Last: ${setsSummary(last.sets, ex)} · ${fmtDate(last.session.start)}` : 'Not done yet';
  }
  function chooseRows(d) {
    return d.items.map(it => ({ ex: S.getEx(it.ex), extra: false })).concat(choose.extra.map(x => ({ ex: S.getEx(x), extra: true }))).filter(r => r.ex);
  }
  function openChoose(d) {
    if (!d.items.length) { toast('Add exercises to this day first'); const cur = stack[stack.length - 1]; if (!(cur.name === 'day' && cur.params.id === d.id)) go('day', { id: d.id }); return; }
    choose = { dayId: d.id, ids: new Set(), extra: [] };
    if (window.Plus) window.Plus.choosing(d, choose);                 // v1.25: a busy week ticks its short version
    // 1.33 (7): it opens with last time's exercises ticked (the first time, all of them), so Start is one tap away
    if (!choose.ids.size && window.__preTick !== false) {
      const prev = lastDaySession(d.id), did = prev ? new Set(prev.items.filter(it => !it.skipped && it.sets.some(x => x.done)).map(it => it.ex)) : null;
      const ids = chooseRows(d).map(r => r.ex.id).filter(id => !did || did.has(id));
      if (ids.length) { choose.ids = new Set(ids); choose.pre = prev ? 'last' : 'all'; }
    }
    go('choose', { id: d.id });
  }
  VIEWS.choose = {
    html({ id }) {
      const d = S.getDay(id);
      if (!d || !choose || choose.dayId !== id) return `<div class="empty"><p>Pick a day to start.</p><div class="mt12"><button class="btn primary" data-act="root" data-nav="days">Go to days</button></div></div>`;
      const rows = chooseRows(d);
      const n = rows.filter(r => choose.ids.has(r.ex.id)).length;
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1 class="ellipsis">${esc(d.name)}</h1><div class="sub">${choose.pre === 'last' ? 'Ticked: what you did last time. Change anything' : choose.pre === 'all' ? 'All ticked. Untick what you skip today' : "Tick what you're doing today"}</div></div></div>
        <div class="chips"><button class="chip" data-act="chooseAll">Tick all</button><button class="chip" data-act="chooseNone">Clear</button>${lastDaySession(id) ? `<button class="chip" data-act="chooseLast">Same as last time</button>` : ''}${window.Plus ? window.Plus.chooseChip() : ''}</div>${window.Plus ? window.Plus.chooseNote(d, choose) : ''}
        <div class="card">`;
      for (const r of rows) {
        const on = choose.ids.has(r.ex.id);
        h += `<div class="list-item pick-row ${on ? 'on' : ''}" data-act="chooseToggle" data-id="${r.ex.id}">${thumb(r.ex)}<div class="grow"><div class="ellipsis" style="font-weight:600">${esc(r.ex.name)}</div>
          <div class="xs muted ellipsis">${esc(r.ex.primary.join(', '))}${r.extra ? ' · <span class="accent">today only</span>' : ''}</div>
          <div class="xs dim ellipsis mt4">${esc(lastLine(r.ex))}</div>${window.Sore && window.Sore.exLine ? window.Sore.exLine(r.ex) : ''}</div><div class="ck">${on ? '✓' : ''}</div></div>`;
      }
      h += `</div><button class="btn block" data-act="chooseAdd">+ Add another exercise</button>
        <div class="bottom-bar"><button class="btn primary block" data-act="chooseStart" ${n ? '' : 'disabled'}>${n ? `Start workout · ${n} exercise${n > 1 ? 's' : ''} ▶` : 'Tick at least one exercise'}</button></div>`;
      return h;
    },
    leave() { choose = null; }
  };
  // After adding exercises that are not in the day's list: ask whether to keep them in the day.
  function askAddToDay(dayId, ids) {
    const d = dayId ? S.getDay(dayId) : null; if (!d) return;
    const fresh = ids.filter(ex => S.getEx(ex) && !d.items.some(i => i.ex === ex));
    if (!fresh.length) return;
    openSheet(`<h2>Save to "${esc(d.name)}" too?</h2><p class="muted">${esc(fresh.map(ex => S.getEx(ex).name).join(', '))} ${fresh.length > 1 ? "aren't" : "isn't"} in this day's list yet.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Just for today</button><button class="btn primary grow" data-act="addExtrasToDay" data-day="${d.id}" data-ids="${fresh.join(',')}">Add to day</button></div>`);
  }

  // ===== Session (the live workout, or a saved one opened for editing from History) =====
  function curEntry() { for (let i = stack.length - 1; i >= 0; i--) if (stack[i].name === 'session' || stack[i].name === 'sessionEdit') return stack[i]; return null; }
  function inEdit() { const e = curEntry(); return !!e && e.name === 'sessionEdit'; }
  function curSession() { const e = curEntry(); if (e && e.name === 'sessionEdit') return D.sessions.find(s => s.id === e.params.id) || null; return D.active; }
  function itemMeta(it, ex, edit) {
    const xd = D.ex[ex.id] || {};
    const parts = [];
    if (!edit) { const last = S.lastFor(ex.id); if (last) parts.push(`Last: ${setsSummary(last.sets, ex)}`); }
    if (edit && it.ms) parts.push(`Time ${fmtShort(it.ms)}`);
    if (xd.max) parts.push(`${ex.track === 'time' ? 'Best' : 'Top set'} ${fmtW(xd.max)} ${ex.track === 'time' ? 'min' : unit()}`);
    if (xd.orm && ex.track !== 'time') parts.push(`One-rep max ${fmtW(xd.orm)} ${unit()}`);
    if (!parts.length) parts.push(ex.primary.join(', '));
    return parts.join(' · ');
  }
  // ----- timing -----
  // Gym time is simply now minus the workout's start, so it keeps running whatever else happens.
  // One exercise at a time is "running": it.run = when its current stretch began, it.ms = time banked so far.
  const exMs = it => (it.ms || 0) + (it.run ? Date.now() - it.run : 0);
  function pauseRunning(s, except) { s.items.forEach(x => { if (x.run && x !== except) { x.ms = (x.ms || 0) + (Date.now() - x.run); x.run = null; } }); }
  // ----- pause: gym time and the running exercise both stop; a.paused adds up the time spent paused -----
  const IC_PAUSE = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><rect x="6" y="5" width="4" height="14" rx="1.2" fill="currentColor"/><rect x="14" y="5" width="4" height="14" rx="1.2" fill="currentColor"/></svg>';
  const IC_PLAY = '<svg class="ic" viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M8 5.2v13.6a1 1 0 0 0 1.5.86l11-6.8a1 1 0 0 0 0-1.72l-11-6.8A1 1 0 0 0 8 5.2z" fill="currentColor"/></svg>';
  function pauseWorkout() {
    const a = D.active; if (!a || a.pauseAt) return false;
    const run = a.items.find(x => x.run);
    pauseRunning(a);
    a.pauseAt = Date.now(); a.stillAt = a.pauseAt;
    if (run) a.pauseEx = run.ex; else delete a.pauseEx;
    return true;
  }
  function resumeWorkout() {
    const a = D.active; if (!a || !a.pauseAt) return false;
    const now = Date.now();
    a.paused = (a.paused || 0) + Math.max(0, now - a.pauseAt); delete a.pauseAt; a.stillAt = now;
    const it = a.pauseEx && a.items.find(x => x.ex === a.pauseEx && !x.fin && !x.skipped);
    if (it && !a.items.some(x => x.run)) it.run = now;         // the exercise that was running carries on
    delete a.pauseEx;
    return true;
  }

  // ----- the workout driven from outside this screen: the capsule's card and the home-screen widget -----
  // Where the workout stands: the exercise in hand, the one after it, and what the buttons may do.
  function quickState() {
    const a = D.active; if (!a) return null;
    const live = a.items.filter(it => !it.skipped && S.getEx(it.ex));
    const cur = live.find(x => x.run) || (a.pauseAt && a.pauseEx ? live.find(x => x.ex === a.pauseEx && !x.fin) : null) || null;
    const next = live.find(x => !x.fin && x !== cur) || null;
    const target = cur || next, left = target ? target.sets.filter(s => !s.done).length : 0;
    const total = live.reduce((n, it) => n + it.sets.length, 0), done = live.reduce((n, it) => n + it.sets.filter(s => s.done).length, 0);
    const fin = live.filter(x => x.fin).length;
    let text, chip;                                      // chip: the few characters the capsule itself has room for
    if (cur) { const ex = S.getEx(cur.ex), n = cur.sets.length, d = n - left; text = left ? `${ex.name} · set ${d + 1} of ${n}` : `${ex.name} · all ${n} sets done`; chip = left ? (n < 10 ? `Set ${d + 1}/${n}` : `${d + 1}/${n}`) : `${n}/${n} ✓`; }
    else if (next) { text = `Next: ${S.getEx(next.ex).name} · ${fin} of ${live.length} done`; chip = 'Next up'; }
    else { text = live.length ? `All ${live.length} exercises done` : 'No exercises yet'; chip = live.length ? 'Done' : ''; }
    if (a.pauseAt) chip = 'Paused';
    return { a, cur, next, target, text, chip, total, done, segs: live.map(it => it.sets.length), fin, count: live.length,
      paused: !!a.pauseAt, canTick: !!(target && left), canNext: !!(cur || next), nextLabel: cur && !next ? 'Finish exercise' : 'Next exercise', allDone: !cur && !next && live.length > 0 };
  }
  // what: 'tick' | 'next' | 'pause' | 'resume' | 'finish'. Returns a short word for what happened ('' = nothing to do).
  function quick(what) {
    const q = quickState(); if (!q || inEdit()) return '';
    const a = q.a, now = Date.now();
    const begin = it => { pauseRunning(a, it); if (!it.run) it.run = Date.now(); it.fin = false; delete it.finAt; it.open = true; };
    let did = '';
    if (what === 'pause') did = pauseWorkout() ? 'paused' : '';
    else if (what === 'resume') did = resumeWorkout() ? 'resumed' : '';
    else if (what === 'tick') {
      if (!q.canTick) return '';
      if (a.pauseAt) { if (!q.cur) delete a.pauseEx; resumeWorkout(); }
      const it = q.target; if (!it.run) begin(it);
      const s = it.sets.find(x => !x.done), at = exMs(it), prev = it.sets.reduce((m, x) => (x.done && x.at != null) ? Math.max(m, x.at) : m, 0);
      s.done = true; s.t = now; s.at = at; s.ms = at - prev > 0 ? at - prev : null;
      did = 'ticked';
    } else if (what === 'next') {
      if (!q.canNext) return '';
      if (a.pauseAt) { delete a.pauseEx; resumeWorkout(); }
      if (q.cur) { const it = q.cur; if (it.run) { it.ms = (it.ms || 0) + (Date.now() - it.run); it.run = null; } it.fin = true; it.finAt = Date.now(); it.open = false; }
      if (q.next) begin(q.next);
      did = 'next';
    } else if (what === 'finish') {
      if (!q.done) return 'empty';                       // nothing ticked: finishing would only throw the workout away, so that stays in the app
      saveSession(); return 'saved';
    }
    if (did) { S.save(true); const on = stack[stack.length - 1].name; if (on === 'session' || on === 'days') rerender(); }
    return did;
  }

  // v1.23: in Focus (focus.js) the one exercise on screen is always open
  function isOpen(it, edit) { if (!edit && window.Focus && window.Focus.at(it)) return true; return edit ? it.open !== false : (it.open != null ? it.open : !!it.run); }
  function sessionExHtml(it, i) {
    const ex = S.getEx(it.ex);
    if (!ex) return `<div class="sx" data-i="${i}"><div class="head"><div class="grow"><div class="name dim">Deleted exercise</div></div><button class="btn sm ghost" data-act="sxRemoveYes" data-i="${i}">Remove</button></div></div>`;
    const edit = inEdit();
    const cols = trackCols(ex.track), two = twoCols(ex.track);
    const doneN = it.sets.filter(s => s.done).length;
    const allDone = it.sets.length && doneN === it.sets.length;
    const running = !edit && !!it.run, fin = !edit && !!it.fin, t = exMs(it);
    const open = !it.skipped && isOpen(it, edit);
    const mark = edit ? allDone : fin;
    const cs0 = curSession(), grip = !!cs0 && cs0.items.length > 1 && !(window.Focus && window.Focus.on && window.Focus.on());          // 1.33 (3): ≡ to drag it
    const meta = fin ? `Done${t ? ' · ' + fmtShort(t) : ''} · ${doneN} set${doneN === 1 ? '' : 's'} ticked`
      : (!edit && !running && t ? `Paused at ${fmtShort(t)} · ` : '') + itemMeta(it, ex, edit);
    const right = it.skipped ? ''
      : open ? `<button class="btn icon" data-act="sxMenu" data-i="${i}" aria-label="More options">⋯</button>`
        : (fin || edit) ? `<button class="btn icon" data-act="toggleSx" data-i="${i}" aria-label="Show sets">▾</button>`
          : `<button class="btn sm primary" data-act="sxStart" data-i="${i}">▶ ${t ? 'Resume' : 'Start'}</button>`;
    let h = `<div class="sx ${mark ? 'done' : ''} ${running ? 'running' : ''} ${open ? 'open' : ''} ${it.skipped ? 'skipped' : ''}${!edit && window.Focus && window.Focus.at(it) ? ' fx' : ''}" data-i="${i}">
      <div class="head">${grip ? '<span class="sx-grip" aria-hidden="true" title="Drag to move">≡</span>' : ''}<div class="th" data-act="openExFromSession" data-id="${ex.id}">${thumb(ex)}<span class="no">${i + 1}</span></div><div class="grow" data-act="toggleSx" data-i="${i}"><div class="name">${mark ? '✓ ' : ''}${esc(ex.name)}</div>
        <div class="meta">${esc(meta)}</div>${!edit && !fin && !it.skipped && window.Sore && window.Sore.exLine ? window.Sore.exLine(ex) : ''}${fin && !open ? '' : setupLine(ex)}</div>${right}</div>
      <div class="prog"><div style="width:${it.sets.length ? (doneN / it.sets.length) * 100 : 0}%"></div></div>`;
    if (open) {
      if (!edit) {
        h += running
          ? `<div class="sx-run on"><span class="dot"></span><span class="sx-timer" data-i="${i}">${fmtTimer(t)}</span><span class="grow"></span><button class="btn sm primary" data-act="sxDone" data-i="${i}">Done ✓</button></div>`
          : fin
            ? `<div class="sx-run"><span class="green small" style="font-weight:700">✓ Done${t ? ' · ' + fmtShort(t) : ''}</span><span class="grow"></span><button class="btn sm" data-act="goBackTo" data-i="${i}">↩ Go back</button></div>`
            : `<div class="sx-run"><span class="muted small">${t ? 'Paused · ' + fmtShort(t) : 'Not started'}</span><span class="grow"></span><button class="btn sm primary" data-act="sxStart" data-i="${i}">▶ ${t ? 'Resume' : 'Start'}</button><button class="btn sm" data-act="sxDone" data-i="${i}">Done ✓</button></div>`;
      }
      if (!edit && !fin && it.tgt && S.getEx(it.ex)) h += `<div class="tgt" data-act="tgtUse" data-i="${i}"><span>🎯</span><div class="grow"><b>${fmtW(it.tgt.w)} ${unit()} × ${fmtW(it.tgt.r)}</b> <span class="muted">${it.tgt.up ? '· you hit all your reps last time, go heavier' : '· one more rep than last time'}</span></div><span class="use">Use</span></div>`;
      if (!edit && window.Plus) h += window.Plus.itemLines(it, i, ex, fin);      // v1.25: the form cue, the rep range, balance sets
      h += `<div class="sets mt8 ${two ? '' : 'one-col'}"><div class="set-hdr"><span>set</span><span>${cols[0]}</span>${two ? `<span>${cols[1]}</span>` : ''}<span></span></div>`;
      it.sets.forEach((s, r) => {
        const X = window.SetX;
        h += `<div class="set-row ${s.done ? 'done' : ''} ${s.kind ? 'k-' + s.kind : ''} ${s.done && s.eff != null ? 'eff-' + s.eff : ''}"><button class="n" data-act="setKind" data-si="${i}" data-ri="${r}" aria-label="${X ? X.mark(s, r, it.sets) : r + 1}: label or move this set">${X ? X.mark(s, r, it.sets) : r + 1}</button>
          <div class="wst"><button class="stb" data-act="wStep" data-si="${i}" data-ri="${r}" data-d="-1" aria-label="Less">−</button><input class="input num" type="number" inputmode="decimal" step="any" placeholder="${cols[0]}" value="${s.w == null ? '' : esc(s.w)}" data-si="${i}" data-ri="${r}" data-f="w"><button class="stb" data-act="wStep" data-si="${i}" data-ri="${r}" data-d="1" aria-label="More">+</button></div>
          ${two ? `<input class="input num" type="number" inputmode="decimal" step="any" placeholder="${cols[1]}" value="${s.r == null ? '' : esc(s.r)}" data-si="${i}" data-ri="${r}" data-f="r">` : ''}
          <button class="ok" data-act="setDone" data-si="${i}" data-ri="${r}">${s.done ? `<span>✓</span>${s.ms ? `<span class="st">${fmtShort(s.ms)}</span>` : ''}` : '○'}</button></div>`;
        if (X) h += X.under(it, s, i, r, edit);
        if (window.NextSet) h += window.NextSet.under(it, s, i, r, edit);          // v1.23, Trainer mode: what to load for the next set
      });
      const fa = fillFrom(it, i), faTxt = fa ? `${fa.w != null && fa.w !== '' ? fmtW(+fa.w) + (ex.track === 'time' ? '' : ' ' + unit()) : ''}${two && fa.r != null && fa.r !== '' ? ' × ' + fmtW(+fa.r) : ''}`.trim() : '';
      if (fa) h += `<button class="sx-fill" data-act="setsAll" data-i="${i}" data-ri="${fa.ri}"><span aria-hidden="true">↧</span> ${esc(faTxt)} for the other sets</button>`;
      h += `</div><div class="actions"><button class="btn sm" data-act="addSet" data-i="${i}">+ Set</button><button class="btn sm ghost" data-act="removeSet" data-i="${i}">− Set</button>
        <span class="grow"></span><button class="btn sm ghost" data-act="sxSwap" data-i="${i}">Swap</button><button class="btn sm ghost red" data-act="sxRemove" data-i="${i}">Remove</button></div>`;
    } else if (it.skipped) {
      h += `<div class="actions"><button class="btn sm ghost" data-act="unskipEx" data-i="${i}">Skipped — undo</button><span class="grow"></span><button class="btn sm ghost red" data-act="sxRemoveYes" data-i="${i}">Remove</button></div>`;
    }
    h += `</div>`;
    return h;
  }
  VIEWS.session = {
    html() {
      const a = D.active; if (a) liveTops(a);
      if (!a) return `<div class="empty"><p>No workout in progress.</p><div class="mt12"><button class="btn primary" data-act="root" data-nav="days">Go to days</button></div></div>`;
      const finN = a.items.filter(x => x.fin).length;
      let h = `<div class="session-top"><div class="session-bar"><button class="back" data-act="back">‹</button><div class="grow"><div class="ellipsis" style="font-weight:700">${esc(a.dayName)}</div><div class="timer ${a.pauseAt ? 'paused' : ''}"><span class="lbl">${a.pauseAt ? 'Paused' : 'Gym time'}</span><span id="elapsed">${fmtTimer(S.liveMs(a))}</span></div></div>
        ${window.Voice ? window.Voice.micButton() : ''}<button class="btn sm icon pausebtn" data-act="pauseToggle" aria-label="${a.pauseAt ? 'Resume workout' : 'Pause workout'}">${a.pauseAt ? IC_PLAY : IC_PAUSE}</button>
        <button class="btn sm primary" data-act="finish">Finish</button></div>
        <div class="session-strip"><span class="xs muted">${finN} of ${a.items.length} exercise${a.items.length === 1 ? '' : 's'} done${a.keep === false ? ' · numbers not saved for next time' : ''}</span><span class="grow"></span>${finN ? `<button class="btn sm" data-act="goBack">↩ Go back</button>` : ''}</div>
        <div class="session-prog" aria-hidden="true"><div style="width:${a.items.length ? Math.round(finN / a.items.length * 100) : 0}%"></div></div></div>`;
      if (a.pauseAt) h += `<div class="card pausecard"><div class="row"><div class="grow"><div class="title">Workout paused</div><div class="xs muted">Gym time is not counting. Ticking a set also carries on.</div></div><button class="btn primary" data-act="pauseToggle">${IC_PLAY} Resume</button></div></div>`;
      if (!a.items.length) h += `<div class="empty"><p>No exercises in this workout yet.</p></div>`;
      if (window.ExOrder) h += window.ExOrder.tip(a);          // v1.32: "Press and hold an exercise to move it", until the first move
      a.items.forEach((it, i) => { h += sessionExHtml(it, i); });
      h += `<button class="btn block mt8" data-act="sxAdd">+ Add exercise</button>${window.Stretch ? window.Stretch.sessionButton() : ''}
        <button class="btn ghost block mt12" data-act="discard">Discard workout</button>`;
      return h;
    },
    mount() {
      later(() => {
        const a = D.active; if (!a) return;
        const e = $('#elapsed'); if (e) e.textContent = fmtTimer(S.liveMs(a));
        $$('.sx-timer').forEach(n => { const it = a.items[+n.dataset.i]; if (it) n.textContent = fmtTimer(exMs(it)); });
      }, 1000, true);
      if (S.isAndroid) window.Android.keepAwake(true);
    }
  };
  VIEWS.sessionEdit = {
    html({ id }) {
      const s = D.sessions.find(x => x.id === id); if (!s) return `<div class="empty">Not found</div>`;
      const d = new Date(s.start), now = new Date();
      const dateV = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`, timeV = `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
      const today = `${now.getFullYear()}-${pad2(now.getMonth() + 1)}-${pad2(now.getDate())}`;
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Edit workout</h1><div class="sub">Saves as you go · only ticked sets count</div></div><button class="btn sm primary" data-act="back">Done</button></div>
        <div class="card"><div class="field"><label class="lbl">Name</label><input class="input" data-bind="sessName" value="${esc(s.dayName)}"></div>
          <div class="field"><label class="lbl">Date</label><input class="input" type="date" data-bind="sessDate" value="${dateV}" min="2000-01-01" max="${today}"></div>
          <div class="row"><div class="grow"><label class="lbl">Start time</label><input class="input" type="time" data-bind="sessTime" value="${timeV}"></div>
          <div class="grow"><label class="lbl">Gym time (min)</label><input class="input" type="number" inputmode="numeric" data-bind="sessDur" value="${Math.round(S.gymMs(s) / 60000)}"></div></div>
          <div class="field mt12" style="margin-bottom:0"><label class="lbl">Note</label><textarea class="input" data-bind="sessNote" placeholder="Anything you want to remember about this workout" style="min-height:64px">${esc(s.note || '')}</textarea></div>
          <div class="row mt12"><div class="grow small">Use these numbers as my starting point next time</div><input type="checkbox" data-bind="sessKeep" ${s.keep !== false ? 'checked' : ''} style="width:22px;height:22px"></div></div>`;
      if (!s.items.length) h += `<div class="empty"><p>No exercises in this workout.</p></div>`;
      s.items.forEach((it, i) => { h += sessionExHtml(it, i); });
      h += `<button class="btn block mt8" data-act="sxAdd">+ Add exercise</button>
        <button class="btn ghost block mt12" data-act="deleteSession" data-id="${id}">Delete this workout</button>`;
      return h;
    },
    leave({ id }) { afterEdit(id); }
  };
  function applySessTime() {
    const s = curSession(); if (!s || !inEdit()) return;
    const dv = ($('[data-bind="sessDate"]') || {}).value, tv = ($('[data-bind="sessTime"]') || {}).value, mins = Math.max(0, num(($('[data-bind="sessDur"]') || {}).value));
    if (dv && tv) {
      const [Y, M, Dd] = dv.split('-').map(Number), [hh, mm] = tv.split(':').map(Number);
      const st = new Date(Y, M - 1, Dd, hh, mm).getTime();
      if (!isNaN(st) && st >= 946684800000) s.start = st;          // 1.30: a date typed before 2000 (or before 1970: below zero) is not taken
    }
    s.end = s.start + mins * 60000 + (s.paused || 0);
    S.save();
  }
  // Raise the stored max weight for any exercise this workout beat.
  function bumpMax(s) {
    for (const it of s.items) {
      delete it.collapsed; delete it.open;
      if (it.skipped || s.keep === false) continue;      // a workout saved with "No" never moves Top set
      const ex = S.getEx(it.ex); if (!ex) continue;
      const xd = S.exData(ex.id);
      const top = it.sets.filter(x => S.work(x) && num(x.w) > 0).reduce((m, x) => Math.max(m, num(x.w)), 0);
      if (top && (!xd.max || top > xd.max)) { xd.max = top; xd.maxDate = s.end || s.start; }
    }
  }
  // v1.13: Top set moves the moment a heavier set is ticked (warm-ups don't count, nor a workout whose numbers aren't kept).
  // a.tb keeps each exercise's Top set from before this workout, so unticking, a fixed typo, Undo or Discard puts it back.
  function liveTop(a, exId) {
    const ex = S.getEx(exId); if (!a || !ex) return null;
    const xd = S.exData(exId), tb = a.tb || (a.tb = {});
    if (!tb[exId]) tb[exId] = { max: xd.max || null, maxDate: xd.maxDate || null };
    const base = tb[exId], was = xd.max || 0;
    let top = 0;
    if (a.keep !== false) for (const it of a.items) if (it.ex === exId && !it.skipped) for (const x of it.sets) if (S.work(x) && num(x.w) > top) top = num(x.w);
    if (top > (base.max || 0)) { if (xd.max !== top) { xd.max = top; xd.maxDate = Date.now(); } }
    else if (xd.max !== base.max) { xd.max = base.max; xd.maxDate = base.maxDate; }
    if ((xd.max || 0) !== was) S.save();
    return { ex, top: xd.max || 0, was, base: base.max || 0 };
  }
  const liveTops = a => { if (a && !inEdit()) new Set(a.items.map(it => it.ex)).forEach(id => liveTop(a, id)); };
  function restoreTops(a) {
    for (const id in (a && a.tb) || {}) { const xd = S.exData(id); xd.max = a.tb[id].max; xd.maxDate = a.tb[id].maxDate; }
  }
  function topSay(a, it, set, r, si, ri, said) {
    const time = r.ex.track === 'time', u = time ? 'min' : unit();
    const msg = said ? `🏆 ${said} · Top set updated` : r.was ? `🏆 New ${time ? 'best time' : 'top set'} on ${r.ex.name}: ${fmtW(r.top)} ${u} (was ${fmtW(r.was)} ${u})` : `🏆 ${time ? 'Best time' : 'Top set'} for ${r.ex.name}: ${fmtW(r.top)} ${u}`;
    const undo = () => { if (D.active !== a || !set.done || a.items[si] !== it || it.sets[ri] !== set) return; ACT.setDone({ dataset: { si: String(si), ri: String(ri) } }); };   // Undo = the tick undone
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast(msg, undo); else toast(msg);
  }
  function afterEdit(id) {
    const s = D.sessions.find(x => x.id === id);
    if (s) { bumpMax(s); const prs = newRecords(s); if (prs.length) s.prs = prs; else delete s.prs; }
    D.sessions.sort((a, b) => b.start - a.start);
    S.save(true);
    if (s && window.Health) window.Health.attach(id, true);     // its date or time may have changed
  }
  // 1.33 (34): the set just typed in, offered for every set that isn't ticked yet and has other numbers
  let lastTyped = null;          // { s: session, i, ri }
  function fillFrom(it, i) {
    const cs = curSession(); if (!cs || it.sets.length < 2) return null;
    const ri = lastTyped && lastTyped.s === cs && lastTyped.i === i && it.sets[lastTyped.ri] ? lastTyped.ri : it.sets.findIndex(x => x.w != null && x.w !== '');
    const src = it.sets[ri]; if (!src || ((src.w == null || src.w === '') && (src.r == null || src.r === ''))) return null;
    const diff = it.sets.some((x, r) => r !== ri && !x.done && (String(x.w ?? '') !== String(src.w ?? '') || String(x.r ?? '') !== String(src.r ?? '')));
    return diff ? { ri, w: src.w, r: src.r } : null;
  }
  document.addEventListener('input', e => { const t = e.target; if (t.dataset && t.dataset.si != null && t.dataset.ri != null && (t.dataset.f === 'w' || t.dataset.f === 'r')) lastTyped = { s: curSession(), i: +t.dataset.si, ri: +t.dataset.ri }; }, true);
  // (the button shows the next time the exercise is drawn: after a tick, a new set, opening it)
  function refreshSx(i) {
    const s = curSession(); const old = $(`.sx[data-i="${i}"]`); if (!s || !old || !s.items[i]) return;
    if (s === D.active && !inEdit()) liveTop(s, s.items[i].ex);
    const tmp = document.createElement('div'); tmp.innerHTML = sessionExHtml(s.items[i], i);
    // 1.33: the exercise redrawn stays where it was on the screen. Left alone, the browser's scroll anchoring keeps the one
    // below it in place instead, so opening an exercise on a scrolled page pushed its own name up out of sight
    const keep = document.body.classList.contains('sx-dragging') ? null : old.getBoundingClientRect().top;
    const nu = tmp.firstElementChild; old.replaceWith(nu);
    if (keep != null && keep > -40 && keep < window.innerHeight) { const d = nu.getBoundingClientRect().top - keep; if (Math.abs(d) > 1) window.scrollBy(0, d); }
  }
  // A new exercise block. The number of sets, the weights (and reps) start from the last time this exercise
  // was done, on any day. The day's planned sets x reps are only used the first time.
  function buildItem(exId, planned) {
    const ex = S.getEx(exId);
    const last = S.lastFor(exId);
    // a plan edited (✎) after the last workout wins for the next one; otherwise last time wins
    const planNewer = !!planned && !!last && num(planned.planAt) > last.session.start;
    const was = last ? (last.all || last.sets) : null;          // every set ticked last time, warm-ups included
    const n = Math.max(1, Math.round((last && !planNewer) ? was.length : (num(planned && planned.sets) || (last ? last.sets.length : 3))) || 3);
    const isTime = !!ex && ex.track === 'time';
    const sets = [];
    for (let k = 0; k < n; k++) {
      const ls = last ? (planNewer ? last.sets[Math.min(k, last.sets.length - 1)] : was[Math.min(k, was.length - 1)]) : null;
      let r = '';
      if (isTime) r = ls ? ls.r : '';
      else if (repsOn()) {
        const pr = (planned && planned.reps) || '', lr = (ls && ls.r !== '' && ls.r != null) ? ls.r : '';
        r = planNewer ? (pr !== '' ? pr : lr) : (lr !== '' ? lr : pr);
      }
      const one = { w: ls ? ls.w : '', r, done: false };
      if (ls && ls.kind === 'w' && !planNewer && k < was.length) one.kind = 'w';      // a warm-up set stays a warm-up set
      sets.push(one);
    }
    const item = { ex: exId, sets, skipped: false, ms: 0 };
    const tgt = targetFor(ex, last, planned); if (tgt) item.tgt = tgt;
    if (window.Plus) window.Plus.built(item, ex, last, planNewer);      // v1.25: a rep range moves the weight up by itself
    return item;
  }
  // keep = false: the workout is logged as usual, but its sets/reps/weights are not the starting point next time
  let pendingStart = null; // { dayId, ids } while the "save today's numbers?" question is open
  function beginPending(keep) { const p = pendingStart; pendingStart = null; const d = p && S.getDay(p.dayId); if (d) startSession(d, p.ids, keep); }
  function startSession(day, exIds, keep) {
    const planned = id => day.items.find(it => it.ex === id) || null;
    D.active = { id: S.uid(), dayId: day.id, dayName: day.name, start: Date.now(), keep: keep !== false, items: exIds.filter(id => S.getEx(id)).map(id => buildItem(id, planned(id))) };
    if (window.Progress) window.Progress.makeEasy(D.active);          // in an easy week: half the sets, and not carried forward
    if (window.Plus) window.Plus.started(D.active, day);              // v1.25: a busy week's short version, and this week's balance sets
    const wu = window.Trainer && window.Trainer.warmups ? window.Trainer.warmups(D.active) : 0;      // v1.20: Trainer mode's warm-up sets
    S.save(true);
    choose = null;
    rootName = 'days';
    stack = [{ name: 'days', params: {} }];
    go('session');
    if (wu) window.Trainer.warmupNote(D.active, wu);
  }
  function finishSession() {
    const a = D.active; if (!a) return;
    const done = a.items.flatMap(it => it.skipped ? [] : it.sets.filter(s => s.done).map(s => ({ it, s })));
    if (!done.length) {
      openSheet(`<h2>Nothing logged yet</h2><p class="muted">Tick the ○ next to a set when you finish it. Do you want to discard this workout?</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Keep going</button><button class="btn danger grow" data-act="discard">Discard</button></div>`);
      return;
    }
    const vol = done.reduce((t, { it, s }) => { const ex = S.getEx(it.ex); return ex && ex.track !== 'time' ? t + num(s.w) * num(s.r) : t; }, 0);
    const prs = [];
    for (const it of (a.keep === false ? [] : a.items)) {
      if (it.skipped) continue;
      const ex = S.getEx(it.ex); if (!ex) continue;
      const xd = S.exData(ex.id);
      const top = it.sets.filter(s => S.work(s) && num(s.w) > 0).reduce((m, s) => Math.max(m, num(s.w)), 0);
      const old = a.tb && a.tb[ex.id] ? a.tb[ex.id].max : xd.max;                   // v1.13: Top set may have moved already
      if (top && (!old || top > old) && !prs.some(p => p.ex === ex)) prs.push({ ex, w: top, old });
    }
    const exCount = a.items.filter(it => !it.skipped && it.sets.some(s => s.done)).length;
    const exT = a.items.reduce((sum, it) => sum + exMs(it), 0);
    openSheet(`<h2>Finish workout?</h2>
      <div class="stats"><div class="stat"><div class="v">${fmtDur(S.liveMs(a))}</div><div class="k">gym time</div></div><div class="stat"><div class="v">${exCount}</div><div class="k">${exCount === 1 ? 'exercise' : 'exercises'}</div></div><div class="stat"><div class="v">${done.length}</div><div class="k">sets</div></div></div>
      ${exT ? `<p class="small muted mb8">Time on exercises: <b>${fmtDur(exT)}</b></p>` : ''}
      ${a.keep === false ? `<p class="xs dim mb8">You chose not to save these numbers for next time; the workout is still logged.</p>` : ''}
      ${vol ? `<p class="small muted mb12">Total lifted: <b class="accent">${fmtW(vol)} ${unit()}</b></p>` : ''}
      ${prs.filter(p => p.old).map(p => `<div class="pr">🏆 New top set on ${esc(p.ex.name)}: ${fmtW(p.w)} ${unit()} (was ${fmtW(p.old)})</div>`).join('')}
      ${prs.some(p => !p.old) ? `<p class="xs dim mb8">Top set will be recorded for: ${prs.filter(p => !p.old).map(p => esc(p.ex.name) + ' ' + fmtW(p.w) + ' ' + unit()).join(', ')}</p>` : ''}
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Keep going</button><button class="btn primary grow" data-act="saveSession">Save workout</button></div>`);
  }
  // endAt: finish the workout at an earlier moment (a workout that was left running), otherwise now
  function saveSession(endAt) {
    const a = D.active; if (!a) return;
    const now = endAt && endAt > a.start && endAt < Date.now() ? endAt : Date.now();
    a.items.forEach(it => { if (it.run) it.ms = (it.ms || 0) + Math.max(0, now - it.run); delete it.run; delete it.fin; delete it.finAt; delete it.open; });
    if (a.pauseAt) a.paused = (a.paused || 0) + Math.max(0, now - a.pauseAt);      // the pause it was finished in is not gym time either
    delete a.pauseAt; delete a.pauseEx; if (!a.paused) delete a.paused;
    a.end = now; delete a.stillAt;
    a.items.forEach(it => { delete it.tgt; });
    if (window.Plus) window.Plus.finished(a);                         // v1.25
    const prs = newRecords(a); if (prs.length) a.prs = prs; else delete a.prs;
    bumpMax(a); delete a.tb;
    D.sessions.unshift(a);
    D.sessions.sort((x, y) => y.start - x.start);
    D.active = null;
    S.save(true);
    if (S.isAndroid) window.Android.keepAwake(false);
    if (window.Trainer) window.Trainer.onSaved(a);
    closeSheet();
    setRoot('history');
    summarySheet(a);
    if (window.Health) window.Health.attach(a.id);
  }

  // After saving: what was done, any records, and how it compares with the last time this day was done.
  function sessStat(x) {
    let sets = 0, vol = 0; const top = {};
    for (const it of x.items) {
      if (it.skipped) continue; const ex = S.getEx(it.ex);
      for (const st of it.sets) if (st.done) { sets++; if (ex && ex.track !== 'time') { vol += num(st.w) * num(st.r); top[it.ex] = Math.max(top[it.ex] || 0, num(st.w)); } }
    }
    return { sets, vol, ms: S.gymMs(x), top };
  }
  function compareHtml(s) {
    const prev = D.sessions.filter(x => x.dayId === s.dayId && x.id !== s.id && x.start < s.start).sort((a, b) => b.start - a.start)[0];
    if (!prev) return `<p class="xs dim mt12">Do this day again and you'll see here how it compares.</p>`;
    const a = sessStat(s), b = sessStat(prev), rows = [];
    const row = (k, v, cls) => rows.push(`<div class="cmp-row"><span class="grow muted">${k}</span><span class="${cls || ''}">${v}</span></div>`);
    const dm = Math.round((a.ms - b.ms) / 60000);
    row('Gym time', dm ? `${Math.abs(dm)} min ${dm < 0 ? 'shorter' : 'longer'}` : 'the same');
    const ds = a.sets - b.sets; row('Sets', ds ? `${ds > 0 ? '+' : '−'}${Math.abs(ds)}` : 'the same', ds > 0 ? 'green' : '');
    if (repsOn() && (a.vol || b.vol)) { const dv = Math.round(a.vol - b.vol); row('Total weight lifted', dv ? `${dv > 0 ? '+' : '−'}${fmtBig(Math.abs(dv))} ${unit()}` : 'the same', dv > 0 ? 'green' : ''); }
    for (const id of Object.keys(a.top)) {
      const ex = S.getEx(id); if (!ex || !b.top[id] || a.top[id] === b.top[id]) continue;
      row(esc(ex.name), `${fmtW(b.top[id])} → ${fmtW(a.top[id])} ${unit()} ${a.top[id] > b.top[id] ? '↑' : '↓'}`, a.top[id] > b.top[id] ? 'green' : '');
    }
    return `<h3 class="mt16 mb8">Compared with ${sinceText(prev.start)}</h3><div class="cmp">${rows.slice(0, 9).join('')}</div>`;
  }
  const prsHtml = prs => prs.map(p => { const ex = S.getEx(p.ex); return `<div class="pr">🏆 ${esc(ex ? ex.name : 'Exercise')} · ${esc(p.kind.toLowerCase())}: ${esc(p.text)}</div>`; }).join('');
  function summarySheet(s) {
    const st = sessStat(s), exN = s.items.filter(it => !it.skipped && it.sets.some(x => x.done)).length;
    openSheet(`<h2>Workout saved 💪</h2>
      <div class="stats"><div class="stat"><div class="v">${fmtDur(st.ms)}</div><div class="k">gym time</div></div><div class="stat"><div class="v">${exN}</div><div class="k">${exN === 1 ? 'exercise' : 'exercises'}</div></div><div class="stat"><div class="v">${st.sets}</div><div class="k">sets</div></div></div>
      ${s.prs && s.prs.length ? `<h3 class="mb8">New record${s.prs.length > 1 ? 's' : ''}</h3>${prsHtml(s.prs)}` : ''}
      ${window.Insights ? window.Insights.summaryExtra(s) : ''}
      ${compareHtml(s)}
      ${window.Stretch ? window.Stretch.sheetButton(s) : ''}
      <button class="btn primary block mt16" data-act="closeSheet">Done</button>`, null, () => rerender());      // redraw History: watch data may have arrived meanwhile
  }
  // A small line chart for one exercise.
  let chartMetric = 'top';
  function chartCard(ex, hist) {
    const timed = ex.track === 'time';
    const metrics = timed ? [['top', 'Longest']] : (repsOn() ? [['top', 'Top set'], ['e', 'Est. one-rep max'], ['vol', 'Total lifted']] : [['top', 'Top set']]);
    const m = metrics.some(x => x[0] === chartMetric) ? chartMetric : 'top';
    const val = r => m === 'vol' ? r.sets.reduce((t, x) => t + num(x.w) * num(x.r), 0) : m === 'e' ? Math.max(0, ...r.sets.filter(okForE).map(x => e1rm(num(x.w), num(x.r)))) : Math.max(0, ...r.sets.map(x => num(x.w)));
    const pts = hist.slice().reverse().map(r => ({ t: r.session.start, v: val(r) })).filter(p => p.v > 0).slice(-30);
    let h = `<div class="card" id="chartCard"><div class="row"><h3 class="grow">Progress</h3><span class="xs muted">${pts.length ? pts.length + ' workout' + (pts.length > 1 ? 's' : '') : ''}</span></div>`;
    if (metrics.length > 1) h += `<div class="chips mt8" style="margin-bottom:0">${metrics.map(x => `<button class="chip ${m === x[0] ? 'on' : ''}" data-act="chartMetric" data-m="${x[0]}">${x[1]}</button>`).join('')}</div>`;
    if (pts.length < 2) return h + `<p class="small muted mt8">Log this exercise in two workouts and a chart of your progress appears here.</p></div>`;
    const W = 320, H = 130, L = 8, R = 8, T = 10, B = 20, tk = window.App.ticks3(Math.min(...pts.map(p => p.v)), Math.max(...pts.map(p => p.v)), true), lo = tk[0], hi = tk[2], span = hi - lo || 1;      // 1.33: round numbers on the left
    const x = i => L + (W - L - R) * (pts.length === 1 ? 0.5 : i / (pts.length - 1)), y = v => T + (H - T - B) * (1 - (v - lo) / span);
    const u = timed ? 'min' : unit(), f = v => m === 'vol' ? fmtBig(v) : fmtW(Math.round(v * 2) / 2);
    const last = pts[pts.length - 1], first = pts[0], diff = last.v - first.v;
    h += window.App.withY(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Progress chart: ${f(first.v)} to ${f(last.v)} ${u}"${window.App.ptsAttr(pts.map((p, i) => [x(i), y(p.v), fmtDate(p.t), `${f(p.v)} ${u}`]))}>${window.App.gridY(tk, y, L, W - R)}
      <polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ')}"/>
      ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="${i === pts.length - 1 ? 4.5 : 3}" fill="${i === pts.length - 1 ? 'var(--accent)' : 'var(--bg2)'}" stroke="var(--accent)" stroke-width="2"/>`).join('')}
      <text x="${L}" y="${H - 4}" font-size="11" fill="var(--dim)">${fmtDate(first.t)}</text><text x="${W - R}" y="${H - 4}" font-size="11" fill="var(--dim)" text-anchor="end">${fmtDate(last.t)}</text>
      </svg>`, tk, y, H, v => f(v)) + `
      <p class="xs muted">Now <b>${f(last.v)} ${u}</b> · ${diff === 0 ? 'same as' : (diff > 0 ? `<span class="green">+${f(Math.abs(diff))} ${u}</span> since` : `−${f(Math.abs(diff))} ${u} since`)} ${sinceText(first.t)}</p></div>`;
    return h;
  }

  const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const hist = { mode: 'list', q: '', y: new Date().getFullYear(), m: new Date().getMonth() };
  function histItemHtml(s, extra) {
    const sets = s.items.reduce((t, it) => t + (it.skipped ? 0 : it.sets.filter(x => x.done).length), 0);
    return `<div class="hist-item" data-act="openSession" data-id="${s.id}"><div class="dot"></div><div class="grow"><div style="font-weight:600">${esc(s.dayName)}${s.prs && s.prs.length ? ` <span class="xs">🏆${s.prs.length > 1 ? s.prs.length : ''}</span>` : ''}</div>
      <div class="xs muted">${fmtDate(s.start)} · ${fmtClock(s.start)} · gym time ${fmtDur(S.gymMs(s))} · ${sets} set${sets === 1 ? '' : 's'}${s.hc && s.hc.avg ? ` · <span class="nw">♥ ${s.hc.avg}</span>` : s.shot && s.shot.avg ? ` · <span class="nw">♥ ${s.shot.avg}</span>` : ''}</div>${extra ? `<div class="xs accent mt4">${extra}</div>` : ''}</div>${window.Calories && window.Calories.shotBtn ? window.Calories.shotBtn(s) : ''}<span class="chev">›</span></div>`;
  }
  // Search: every word has to appear in the day name or an exercise name; a number means "a set at least this heavy".
  function histListHtml() {
    const words = hist.q.trim().toLowerCase().split(/\s+/).filter(Boolean), isNum = w => /^\d+(\.\d+)?$/.test(w);
    const nums = words.filter(isNum).map(Number), toks = words.filter(w => !isNum(w));
    const SP = window.Sports, spl = SP ? SP.histList() : [];
    if (!words.length) {
      if (!spl.length) return `<div class="card">${D.sessions.map(s => histItemHtml(s)).join('')}</div>`;
      const all = D.sessions.map(s => ({ t: s.start, h: histItemHtml(s) })).concat(spl.map(x => ({ t: x.t, h: SP.histItemHtml(x) }))).sort((a, b) => b.t - a.t);
      return `<div class="card">${all.map(x => x.h).join('')}</div>`;
    }
    const out = [];
    for (const s of D.sessions) {
      const its = s.items.filter(it => !it.skipped && it.sets.some(x => x.done)).map(it => ({ it, ex: S.getEx(it.ex) })).filter(x => x.ex);
      const nm = x => (x.ex.name + ' ' + (x.ex.aka || []).join(' ')).toLowerCase();
      if (!toks.every(t => (s.dayName + ' ' + its.map(nm).join(' ')).toLowerCase().includes(t))) continue;
      const named = its.filter(x => toks.some(t => nm(x).includes(t))), pool = named.length ? named : its;
      const hit = pool.filter(x => nums.every(n => x.it.sets.some(st => st.done && num(st.w) >= n)));
      if (nums.length && !hit.length) continue;
      out.push(histItemHtml(s, (nums.length ? hit : named).slice(0, 2).map(x => `${esc(x.ex.name)}: ${esc(setsSummary(x.it.sets, x.ex))}`).join(' · ')));
    }
    if (SP && !nums.length) for (const x of SP.histMatch(toks)) out.push(SP.histItemHtml(x));
    return out.length ? `<p class="xs dim" style="margin:0 2px 8px">${out.length} workout${out.length > 1 ? 's' : ''} found</p><div class="card">${out.join('')}</div>`
      : `<div class="empty"><p>Nothing matches. Try an exercise, a day name, or a name with a weight, like "bench 60".</p></div>`;
  }
  function histRefresh() { const l = $('#histList'); if (l) l.innerHTML = histListHtml(); const c = $('#histClr'); if (c) c.classList.toggle('hidden', !hist.q); }
  function calendarHtml() {
    const first = new Date(hist.y, hist.m, 1), days = new Date(hist.y, hist.m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7, today = new Date();
    const by = {}; for (const s of D.sessions) { const d = new Date(s.start); if (d.getFullYear() === hist.y && d.getMonth() === hist.m) (by[d.getDate()] = by[d.getDate()] || []).push(s); }
    const SP = window.Sports, byA = {}; if (SP) for (const x of SP.histList()) { const d = new Date(x.t); if (d.getFullYear() === hist.y && d.getMonth() === hist.m) (byA[d.getDate()] = byA[d.getDate()] || []).push(x); }
    const n = Object.values(by).reduce((t, a) => t + a.length, 0), thisMonth = hist.y === today.getFullYear() && hist.m === today.getMonth();
    let h = `<div class="card"><div class="row"><button class="btn icon" data-act="histMonth" data-d="-1" aria-label="Earlier month">‹</button><div class="grow" style="text-align:center"><div class="title">${MONTHS_LONG[hist.m]} ${hist.y}</div><div class="xs muted">${n} workout${n === 1 ? '' : 's'}</div></div><button class="btn icon" data-act="histMonth" data-d="1" aria-label="Later month" ${thisMonth ? 'disabled' : ''}>›</button></div>
      <div class="cal mt12">${['M', 'T', 'W', 'T', 'F', 'S', 'S'].map(d => `<div class="hd">${d}</div>`).join('')}${'<div></div>'.repeat(lead)}`;
    for (let d = 1; d <= days; d++) {
      const on = by[d], k = (on ? on.length : 0) + (byA[d] ? byA[d].length : 0);
      // 1.31: every day that has come opens its page (its workouts are on it); without daily.js a highlighted day opens its workout
      const past = new Date(hist.y, hist.m, d).getTime() <= today.getTime();
      h += `<div class="cd ${on ? 'on' : byA[d] ? 'on mv-on' : ''} ${thisMonth && today.getDate() === d ? 'today' : ''}" ${ACT.diDay ? (past ? `data-act="diDay" data-t="${new Date(hist.y, hist.m, d).getTime()}"` : '') : k ? `data-act="calDay" data-d="${d}"` : ''}>${d}${k > 1 ? `<span class="x">${k}</span>` : ''}</div>`;
    }
    return h + `</div><p class="xs dim mt12">${ACT.diDay ? 'Tap a day to open it: its workout, sleep, food and the rest.' : 'Tap a highlighted day to open its workout.'}</p></div>`;
  }

  // ===== History =====
  VIEWS.history = {
    html() {
      const ss = D.sessions;
      const now = new Date();
      const startOfDay = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
      const monday = new Date(now); monday.setDate(now.getDate() - ((now.getDay() + 6) % 7)); const weekStart = startOfDay(monday);
      const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const thisWeek = ss.filter(s => s.start >= weekStart).length;
      const thisMonth = ss.filter(s => s.start >= monthStart).length;
      // 1.24 (check-up): activities that count towards the weekly goal are said next to the week's workouts, so this adds up to
      // the week on Today (workouts + those activities)
      const weekActs = window.Sports && window.Sports.goalCount ? window.Sports.goalCount(weekStart, Infinity) : 0;
      let h = `<div class="top"><div class="grow"><h1>History</h1><div class="sub">${ss.length ? ss.length + (ss.length === 1 ? ' workout logged' : ' workouts logged') : 'Your finished workouts'}</div></div></div>
        <div class="stats"><div class="stat"><div class="v">${thisWeek}</div><div class="k">this week${weekActs ? ` + ${weekActs} ${weekActs === 1 ? 'activity' : 'activities'}` : ''}</div></div><div class="stat"><div class="v">${thisMonth}</div><div class="k">this month</div></div><div class="stat"><div class="v">${ss.length}</div><div class="k">total</div></div></div>
        <div class="week">`;
      for (let i = 0; i < 7; i++) {
        const d = new Date(weekStart + i * 86400000); const ds = startOfDay(d);
        const on = ss.some(s => startOfDay(new Date(s.start)) === ds) || (window.Sports ? window.Sports.histList().some(x => startOfDay(new Date(x.t)) === ds) : false);
        // 1.31: a day that has come opens its page (daily.js); a day still ahead is plain
        const ahead = ds > startOfDay(now) || !ACT.diDay;
        h += `<${ahead ? 'div' : `button data-act="diDay" data-t="${ds}"`} class="d ${on ? 'on' : ''} ${ds === startOfDay(now) ? 'today' : ''}"><div>${DAYS[d.getDay()]}</div><div class="n">${d.getDate()}</div>${on && !ahead ? '<span class="sr-only">, trained</span>' : ''}</${ahead ? 'div' : 'button'}>`;
      }
      h += `</div>`;
      if (!ss.length && !(window.Sports && window.Sports.histList().length)) h += `<div class="empty"><div class="big">◷</div><h2>Nothing yet</h2><p>Finish a workout and it shows up here with every set you logged.</p><div class="mt12"><button class="btn primary" data-act="root" data-nav="days">Start a workout</button></div></div>`;
      else {
        // v1.9: the progress pages as labelled tiles in their own row, apart from how the list is shown
        const tile = (act, ic, lbl) => `<button class="ptile" data-act="${act}"><span class="ptile-ic">${ic}</span><span>${lbl}</span></button>`;
        h += `<div class="sec-h"><span>Progress</span></div><div class="ptiles">${ACT.diOpen ? tile('diOpen', '📊', 'Insights') : ''}${tile('openRecords', '🏆', 'Records')}${tile('openMuscles', '💪', 'Muscles')}${tile('openRecovery', '🔋', 'Recovery')}${tile('openBalance', '⚖️', 'Balance')}${tile('openStrength', '📈', 'Strength')}${tile('openRecap', '🗓', 'This month')}${tile('openYear', '📅', 'Year')}${tile('openBadges', '🎖', 'Badges')}${window.Patterns ? tile('patOpen', '🔎', 'Patterns') : ''}${window.Calories && window.Calories.on() ? tile('openCalories', '🍽', 'Calories') + (window.Supps ? tile('spMicro', '💊', 'Vitamins') : '') : ''}${tile('openBody', '⚖', 'Body weight')}${tile('openMeasure', '📏', 'Measurements')}</div>
          <div class="sec-h"><span>Workouts</span><span class="seg"><button class="chip ${hist.mode === 'list' ? 'on' : ''}" data-act="histMode" data-m="list">List</button><button class="chip ${hist.mode === 'cal' ? 'on' : ''}" data-act="histMode" data-m="cal">Calendar</button></span></div>`;
        if (hist.mode === 'cal') h += calendarHtml();
        else h += `<div class="search"><span class="ic">⌕</span><input class="input" id="histq" placeholder="Search: bench 60, leg day…" aria-label="Search a day, an exercise, or a weight like bench 60" value="${esc(hist.q)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button class="clr ${hist.q ? '' : 'hidden'}" id="histClr" data-act="histClear" aria-label="Clear search">✕</button></div><div id="histList">${histListHtml()}</div>`;
      }
      // exercise counts
      const counts = {};
      for (const s of ss) for (const it of s.items) if (!it.skipped && it.sets.some(x => x.done)) counts[it.ex] = (counts[it.ex] || 0) + 1;
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 8);
      if (top.length) {
        h += `<h3 class="mt16 mb8">Most trained</h3><div class="card">`;
        for (const [id, n] of top) { const ex = S.getEx(id); if (!ex) continue; const b = S.bestFor(id); h += `<div class="list-item" data-act="openEx" data-id="${id}">${thumb(ex)}<div class="grow"><div class="small ellipsis" style="font-weight:600">${esc(ex.name)}</div><div class="xs muted">${n}× · best ${esc(bestText(b, ex))}</div></div><span class="chev">›</span></div>`; }
        h += `</div>`;
      }
      return h;
    },
    // the list is redrawn around the search box, never the box itself (it would restart the phone keyboard)
    mount() { const q = $('#histq'); if (q) q.addEventListener('input', () => { hist.q = q.value; histRefresh(); }); }
  };
  VIEWS.records = {
    html() {
      const ids = [...new Set(D.sessions.flatMap(s => s.items.filter(it => !it.skipped && it.sets.some(x => x.done)).map(it => it.ex)))];
      const rows = ids.map(id => ({ ex: S.getEx(id), r: recordsFor(id) })).filter(x => x.ex && x.ex.track !== 'time' && x.r.w).sort((a, b) => a.ex.name.localeCompare(b.ex.name));
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Records</h1><div class="sub">${rows.length ? `Your best on ${rows.length} exercise${rows.length > 1 ? 's' : ''}` : 'Your best lifts'}</div></div></div>`;
      if (!rows.length) return h + `<div class="empty"><div class="big">🏆</div><h2>No records yet</h2><p>Log a workout with weights and your best lifts are kept here.</p><div class="mt12"><button class="btn primary" data-act="root" data-nav="days">Start a workout</button></div></div>`;
      h += `<div class="card">`;
      for (const { ex, r } of rows) h += `<div class="list-item" data-act="openEx" data-id="${ex.id}">${thumb(ex)}<div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(ex.name)}</div>
        <div class="xs muted">Heaviest <b class="accent">${fmtW(r.w.v)} ${unit()}</b> · ${fmtDate(r.w.date)}</div>
        ${repsOn() && r.e ? `<div class="xs muted">Strongest set ${fmtW(r.e.w)} × ${r.e.r} · about ${fmtW(Math.round(r.e.v * 2) / 2)} for one rep</div>` : ''}
        ${repsOn() && r.vol ? `<div class="xs muted">Most in one workout ${fmtBig(r.vol.v)} ${unit()}</div>` : ''}</div><span class="chev">›</span></div>`;
      return h + `</div>`;
    }
  };
  VIEWS.sessionDetail = {
    html({ id }) {
      const s = D.sessions.find(x => x.id === id); if (!s) return `<div class="empty">Not found</div>`;
      // 1.35.2: what you did (the exercises and sets) first; calories, heart rate and the muscle map after them
      const calm = window.__calm !== false, hd = window.Health ? window.Health.detailHtml(s) : '', dx = window.Insights ? window.Insights.detailExtra(s) : '';
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1 class="ellipsis">${esc(s.dayName)}</h1><div class="sub">${fmtDate(s.start)} · ${fmtClock(s.start)} · gym time ${fmtDur(S.gymMs(s))}</div></div><button class="btn sm" data-act="editSession" data-id="${id}">Edit</button></div>${calm ? '' : hd}${s.prs && s.prs.length ? prsHtml(s.prs) : ''}${calm ? '' : dx}<div class="card">`;
      if (!s.items.length) h += `<div class="muted small" style="padding:6px 0">No exercises in this workout.</div>`;
      if (s.keep === false) h += `<p class="xs dim" style="padding:2px 0 8px">These numbers are not used as your starting point next time (you answered No). Edit the workout to change that.</p>`;
      for (const it of s.items) {
        const ex = S.getEx(it.ex); if (!ex) continue;
        const done = it.sets.filter(x => x.done);
        h += `<div class="list-item" data-act="openEx" data-id="${ex.id}">${thumb(ex)}<div class="grow"><div class="small ellipsis" style="font-weight:600">${esc(ex.name)}</div>
          <div class="xs ${it.skipped || !done.length ? 'dim' : 'muted'}">${it.skipped ? 'skipped' : (done.length ? esc(setsSummary(done, ex)) : 'no sets logged')}${!it.skipped && it.ms ? ` · <span class="accent">${fmtShort(it.ms)}</span>` : ''}</div></div><span class="chev">›</span></div>`;
      }
      h += `</div>${calm ? hd + dx : ''}<button class="btn block mb8" data-act="shareCard" data-id="${id}">Share as a picture</button><button class="btn ghost block" data-act="deleteSession" data-id="${id}">Delete this workout</button>`;
      return h;
    },
    mount({ id }) { if (window.Health) window.Health.opened(id); }
  };

  // ===== Settings =====
  // v1.9: the everyday settings on the page; extras, the watch, backups, help and the credits one tap away (setPage)
  // v1.26: a new look. The account on top; then tidy rows, each with an icon and what it is set to (two or three choices are
  // pills, a longer list is a small box that opens the phone's own list); Sign out and Delete my account are on the Account
  // page behind the top card. Every setting that was here still is.
  const kit = () => window.SetKit || { ic: () => '', tile: () => '<span class="set-ic"></span>', seg: () => '', val: () => '' };
  const goRow = (act, icon, title, sub) => `<button class="btn set-go" data-act="${act}">${kit().tile(icon)}<span class="grow">${title}${sub ? `<span class="xs dim">${sub}</span>` : ''}</span><span class="chev">›</span></button>`;
  const backupCards = () => `<div class="card set-card"><h3>${kit().ic('archive', 16)}Backup</h3>
          ${goRow('export', 'download', 'Export backup', 'Everything — days, logs, max weights, notes and photos — in one file. Save it to Drive now and then.')}${goRow('import', 'upload', 'Import backup', 'Bring everything back from a backup file')}${goRow('sheetExport', 'sheet', 'Export to a spreadsheet', 'Every set you have logged, as a file for Google Sheets or Excel.')}${window.Report ? goRow('reportOpen', 'trend', 'One-page report (PDF)', 'Your last 7 or 30 days on one page, for a coach, a doctor or your parents.') : ''}</div>
        <div class="card set-danger"><h3>${kit().ic('warn', 16)}Danger zone</h3><p class="xs dim mt4">Removes every day, workout, food entry and photo from this phone${window.Cloud && window.Cloud.signedIn() ? ' and your account' : ''}. It can't be undone.</p><button class="btn danger block mt12" data-act="reset">Delete all my data</button></div>`;
  const aboutCard = () => `<div class="card set-about"><span class="set-mark">${kit().ic('dumbbell', 30)}</span><h3>GymDay ${(window.GYMDAY_APP || {}).name || ''}</h3><p class="small muted mt4">Made by Venu Anand A, with Claude.</p></div>
        <div class="card set-card set-list">${goRow('whatsNew', 'gift', "What's new in this version")}${goRow('tourOpen', 'play', 'See the short tour again')}${goRow('privacyOpen', 'eye', 'Privacy policy', 'What GymDay keeps, where, and who sees it')}${window.Safety && window.Safety.rulesOk ? goRow('ugcRules', 'scroll', 'Club rules') : ''}${goRow('feedback', 'mail', 'Contact', 'gymday89@gmail.com')}</div>
        <div class="card"><h3>${kit().ic('scroll', 16)}Credits</h3><p class="credit mt8">Exercise photos are from the public-domain <i>free-exercise-db</i> project. Foods: the US Department of Agriculture's FoodData Central (FNDDS 2021–2023 and SR Legacy, public domain); the Indian Nutrient Databank (INDB) by Anuvaad; McCance and Widdowson's Composition of Foods Integrated Dataset 2021 (UK), which contains public sector information licensed under the Open Government Licence v3.0; AUSNUT 2023 by Food Standards Australia New Zealand (CC BY 4.0); and the FAO/INFOODS Food Composition Table for Western Africa 2019 (CC BY-NC-SA 3.0 IGO); finger millet (ragi) from the FAO's <i>Sorghum and millets in human nutrition</i> (1995). The food versions (rice by variety, rotis by flour and so on) are worked out by GymDay from these tables, each with a note saying how. About 8,900 Indian packets (and barcodes looked up online) come from Open Food Facts, © Open Food Facts contributors, made available under the Open Database Licence (ODbL). McDonald's India's menu is from McDonald's India (North & East) published nutrition booklet; Pizza Hut's from its nutrition booklet; KFC, Burger King, Subway, Starbucks, La Pino'z, Wow! Momo and Third Wave Coffee from the numbers they list on Swiggy (November 2026); a few Domino's items from FatSecret India. Supplement labels were checked against each maker's own label pictures or pharmacy listings (November 2026). ${window.Cloud && window.Cloud.signedIn() ? 'Your workouts are saved on this phone and in your GymDay account. Club mates only see what you chose under Account.' : 'Your data stays on this phone unless you sign in to an account or export a backup.'} The icons on the Settings pages are from Lucide (ISC License).</p>${window.CloudUI && window.CloudUI.aboutRow ? window.CloudUI.aboutRow() : ''}</div>`;
  const SETPAGES = {
    account: ['Account', 'Your name and picture, what club mates see, sign out', 'user', () => (window.CloudUI && window.CloudUI.accountPage ? window.CloudUI.accountPage() : '')],
    extras: ['More features', 'Schedule, plans, alerts, calories, the number pad and more', 'toggles', () => (window.Insights ? window.Insights.settingsCard() : '')],
    health: ['Watch & Google Health', 'Sleep, heart rate, steps, calories and weight from your watch', 'watch', () => (window.Health ? window.Health.settingsCard() : '')],
    data: ['Backup & export', 'Save everything to a file, export to a spreadsheet, delete data', 'backup', backupCards],
    about: ['About GymDay', 'Version, the short tour, credits', 'info', aboutCard],
  };
  VIEWS.setPage = {
    html({ p }) { const pg = SETPAGES[p] || SETPAGES.extras; return `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${pg[0]}</h1></div></div><div class="set-page" data-p="${SETPAGES[p] ? p : 'extras'}">${pg[3]() || `<div class="empty"><p>Nothing to set here on this device.</p></div>`}</div>`; }
  };
  // a row that opens one of those pages: its icon, its name, a line on what is inside and (v) what it is set to
  const setRow = (p, act, v) => { const pg = SETPAGES[p]; return `<div class="list-item set-nav" data-act="${act || 'setGo'}" data-p="${p}">${kit().tile(pg[2])}<div class="grow"><div class="set-t">${pg[0]}</div><div class="xs dim">${pg[1]}</div></div>${kit().val(v)}<span class="chev">›</span></div>`; };
  VIEWS.settings = {
    html() {
      const s = D.settings, K = kit(), hc = window.Health ? window.Health.settingsCard() : '', ex = window.Insights ? window.Insights.settingsCard() : '';
      const on = (ex.match(/<input type="checkbox"[^>]*\schecked/g) || []).length;                    // how many extras are switched on
      return `<div class="top"><div class="grow"><h1>Settings</h1></div></div><div class="set-page" data-p="main">
        ${window.CloudUI ? window.CloudUI.settingsCard() : ''}
        <div class="card set-card"><h3>Workouts</h3>
        <div class="row">${K.tile('weight')}<div class="grow">Weight unit</div>${K.seg('unit', s.unit === 'lb' ? 'lb' : 'kg', [['kg', 'kg'], ['lb', 'lb']], 'Weight unit')}</div>
        <div class="row">${K.tile('ask')}<div class="grow">Ask before saving a workout's numbers for next time<div class="xs dim">Off = always use them as your starting point next time</div></div><input type="checkbox" data-bind="askSave" ${s.askSave !== false ? 'checked' : ''} style="width:22px;height:22px"></div>
        <div class="row">${K.tile('repeat')}<div class="grow">Track reps<div class="xs dim">Off = each set is just weight + tick</div></div><input type="checkbox" data-bind="reps" ${s.reps !== false ? 'checked' : ''} style="width:22px;height:22px"></div>
        <div class="row">${K.tile('target')}<div class="grow">Weekly goal<div class="xs dim">Workouts you want each week, shown on the Today page</div></div><select class="input" data-bind="weekGoal" aria-label="Weekly goal">${[0, 1, 2, 3, 4, 5, 6, 7].map(n => `<option value="${n}" ${weekGoal() === n ? 'selected' : ''}>${n || 'Off'}</option>`).join('')}</select></div>
        </div>
        ${window.Watch ? window.Watch.settingsCard() : ''}
        ${window.Look ? window.Look.settingsCard() : ''}
        <div class="card set-card set-list">${setRow('extras', '', on ? on + ' on' : '')}${hc ? setRow('health', '', window.Health.on && window.Health.on() ? 'On' : '') : ''}${setRow('data')}<div class="list-item set-nav" data-act="helpOpen">${K.tile('help')}<div class="grow"><div class="set-t">Help & tips</div><div class="xs dim">How each part of GymDay works, in plain words</div></div><span class="chev">›</span></div><div class="list-item set-nav" data-act="feedback" role="button" tabindex="0">${K.tile('mail')}<div class="grow"><div class="set-t">Send feedback</div><div class="xs dim">An idea or something wrong? An email to GymDay, with your app version</div></div><span class="chev">›</span></div>${setRow('about', '', (window.GYMDAY_APP || {}).name || '')}</div></div>`;
    }
  };
  // ---------------- actions ----------------
  const ACT = {
    back() { window.appBack(); },
    setGo(el) { go('setPage', { p: el.dataset.p }); },
    root(el) { setRoot(el.dataset.nav); },
    closeSheet() { closeSheet(); },
    // 1.35.2: the name first, and the day is made only on Save (Cancel no longer leaves an empty "New day" behind)
    newDay() {
      openSheet(`<h2>New day</h2><input class="input" id="dayNameIn" value="" placeholder="e.g. Push day, Leg day" enterkeyhint="done">
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="newDaySave">Save</button></div>`,
        () => { const i = $('#dayNameIn'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.newDaySave(); }); });
    },
    newDaySave() { const inp = $('#dayNameIn'); const v = (inp ? inp.value.trim() : '') || 'New day'; const d = S.addDay(v.slice(0, 80), []); closeSheet(); go('day', { id: d.id }); },
    addStarters() { STARTERS.forEach((s, i) => S.addDay(window.__calm === false ? s.name : STARTER_NAMES[i] || s.name, s.items.filter(id => S.getEx(id)).map(ex => ({ ex, sets: 3, reps: 10 })))); render(); toast('5 starter days added — edit them however you like'); },
    openDay(el) { go('day', { id: el.dataset.id }); },
    renameDay(el) {
      const d = S.getDay(el.dataset.id); if (!d) return;
      openSheet(`<h2>Day name</h2><input class="input" id="dayNameIn" value="${esc(d.name)}" placeholder="e.g. Arm day" enterkeyhint="done">
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="saveDayName" data-id="${d.id}">Save</button></div>`,
        () => { const i = $('#dayNameIn'); i.focus(); i.select(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.saveDayName({ dataset: { id: d.id } }); }); });
    },
    saveDayName(el) { const d = S.getDay(el.dataset.id); const inp = $('#dayNameIn'); const v = inp ? inp.value.trim() : ''; if (d && v) { d.name = v; S.save(); } closeSheet(); rerender(); },
    planOpen(el) {
      const d = S.getDay(el.dataset.id); const i = +el.dataset.i; const it = d && d.items[i]; const ex = it && S.getEx(it.ex); if (!ex) return;
      const last = S.lastFor(ex.id);
      const sets = Math.max(1, Math.round(num(it.sets)) || (last ? last.sets.length : 3));
      const stepper = (f, val, mode) => `<div class="stp"><div class="k">${f}</div><button class="stp-b" data-act="planStep" data-f="${f}" data-d="-1" aria-label="Fewer ${f}">−</button>
        <input class="input num" id="plan${f}" data-bind="plan${f}" type="number" inputmode="${mode}" step="any" value="${val}" placeholder="–">
        <button class="stp-b" data-act="planStep" data-f="${f}" data-d="1" aria-label="More ${f}">+</button></div>`;
      planCtx = { dayId: d.id, i };
      openSheet(`<h2>${esc(ex.name)}</h2>${stepper('Sets', sets, 'numeric')}${repsOn() && ex.track !== 'time' ? stepper('Reps', num(it.reps) ? fmtW(num(it.reps)) : '', 'decimal') : ''}
        <p class="xs dim mb12">Your next workout starts with these. After that the app remembers what you actually did.</p>
        <button class="btn primary block" data-act="closeSheet">Done</button>`, null, () => { planCtx = null; rerender(); });
    },
    planStep(el) {
      const f = el.dataset.f, inp = $('#plan' + f); if (!inp) return;
      const dir = +el.dataset.d; let v = num(inp.value);
      if (f === 'Sets') v = Math.min(20, Math.max(1, Math.round(v) + dir));
      else if (!v) v = dir > 0 ? 10 : 0;                                   // empty box: + starts at 10
      else v = Math.min(200, Math.max(0, Math.round((v + dir * 0.5) * 2) / 2));
      inp.value = v ? fmtW(v) : '';
      planSave();
    },
    // 1.33 (11, 25): deleting is done at once, with Undo (and Recently deleted), instead of "Are you sure?"
    dayRemove(el) { ACT.dayRemoveYes(el); },
    dayRemoveYes(el) {
      const d = S.getDay(el.dataset.id), i = +el.dataset.i, it = d && d.items[i]; if (!it) return; const ex = S.getEx(it.ex);
      d.items.splice(i, 1); S.save(true); closeSheet(); rerender();
      undo(`${ex ? ex.name : 'Exercise'} taken out of ${d.name}`, () => { const d2 = S.getDay(d.id); if (!d2) return; d2.items.splice(Math.min(i, d2.items.length), 0, it); S.save(true); rerender(); });
    },
    deleteDay(el) { ACT.deleteDayYes(el); },
    deleteDayYes(el) {
      const i = D.days.findIndex(x => x.id === el.dataset.id); if (i < 0) return; const d = D.days[i];
      S.deleteDay(d.id); closeSheet(); setRoot('days');
      undo(`"${d.name}" deleted · your workouts stay in History`, () => { if (D.days.some(x => x.id === d.id)) return; D.days.splice(Math.min(i, D.days.length), 0, d); S.save(true); rerender(); });
    },
    startDay(el) {
      const d = S.getDay(el.dataset.id); if (!d) return;
      if (D.active) {
        openSheet(`<h2>A workout is already in progress</h2><p class="muted">${esc(D.active.dayName)} — started ${fmtDur(Date.now() - D.active.start)} ago. Starting a new one discards it.</p>
          <div class="row mt16"><button class="btn primary grow" data-act="resumeFromSheet">Resume it</button><button class="btn danger grow" data-act="startDayForce" data-id="${d.id}">Start a new one</button></div>`);
        return;
      }
      openChoose(d);
    },
    resume() { go('session'); },
    resumeFromSheet() { closeSheet(); rootName = 'days'; stack = [{ name: 'days', params: {} }]; go('session'); },
    startDayForce(el) { closeSheet(); const d = S.getDay(el.dataset.id); if (d) openChoose(d); },
    chooseToggle(el) { if (!choose) return; const id = el.dataset.id; if (choose.ids.has(id)) choose.ids.delete(id); else choose.ids.add(id); rerender(); },
    chooseAll() { const d = choose && S.getDay(choose.dayId); if (!d) return; chooseRows(d).forEach(r => choose.ids.add(r.ex.id)); rerender(); },
    chooseNone() { if (!choose) return; choose.ids.clear(); rerender(); },
    chooseLast() {
      const d = choose && S.getDay(choose.dayId); const prev = d && lastDaySession(d.id); if (!prev) return;
      const did = new Set(prev.items.filter(it => !it.skipped && it.sets.some(x => x.done)).map(it => it.ex));
      choose.ids = new Set(chooseRows(d).map(r => r.ex.id).filter(id => did.has(id)));
      rerender();
    },
    chooseAdd() {
      const d = choose && S.getDay(choose.dayId); if (!d) return;
      pick = { mode: 'choose', dayId: d.id, ids: new Set(), have: new Set(d.items.map(i => i.ex).concat(choose.extra)), saved: lib };
      lib = { q: '', group: 'All', equip: 'All' }; go('picker');
    },
    chooseStart() {
      const d = choose && S.getDay(choose.dayId); if (!d) return;
      const ids = chooseRows(d).map(r => r.ex.id).filter(id => choose.ids.has(id));
      if (!ids.length) { toast('Tick at least one exercise'); return; }
      if (D.settings.askSave === false || (window.Progress && window.Progress.easyNow())) { startSession(d, ids, true); return; }
      pendingStart = { dayId: d.id, ids };
      openSheet(`<h2>Save today's numbers for next time?</h2><p class="muted">Yes: the sets, reps and weights you do today become your starting point next time. No: the workout is still logged, but next time starts from your earlier numbers.</p>
        <div class="row mt16"><button class="btn grow" data-act="askSaveNo">No</button><button class="btn primary grow" data-act="askSaveYes">Yes</button></div>`);
    },
    askSaveNo() { closeSheet(); beginPending(false); },
    askSaveYes() {
      if (!pendingStart) return;
      openSheet(`<h2>Saved for next time</h2><p class="muted">Want this every time without being asked? You can turn the question back on in Settings.</p>
        <button class="btn primary block mt16" data-act="askSaveAlways">Always save, don't ask again</button>
        <button class="btn block mt8" data-act="askSaveOnce">Ask me next time</button>`, null, () => beginPending(true));
    },
    askSaveOnce() { closeSheet(); },
    askSaveAlways() { D.settings.askSave = false; S.save(); closeSheet(); },
    addExtrasToDay(el) {
      const d = S.getDay(el.dataset.day); const ids = (el.dataset.ids || '').split(',').filter(Boolean);
      if (d) { ids.forEach(ex => { if (!d.items.some(i => i.ex === ex)) d.items.push({ ex, sets: 3, reps: '' }); }); S.save(true); }
      if (choose && d && choose.dayId === d.id) choose.extra = choose.extra.filter(ex => !ids.includes(ex));
      closeSheet(); rerender(); if (d) toast('Saved to ' + d.name);
    },
    pickFor(el) { const d = S.getDay(el.dataset.id); pick = { mode: 'day', dayId: el.dataset.id, ids: new Set(), have: new Set(d ? d.items.map(i => i.ex) : []), saved: lib }; lib = { q: '', group: 'All', equip: 'All' }; go('picker'); },
    pickForSession() { const s = curSession(); if (!s) return; closeSheet(); pick = { mode: 'session', ids: new Set(), have: new Set(s.items.map(x => x.ex)), saved: lib }; lib = { q: '', group: 'All', equip: 'All' }; go('picker'); },
    pickToggle(el) {
      libKeepQ();
      const id = el.dataset.id;
      if (pick.mode === 'swap') pick.ids = new Set(pick.ids.has(id) ? [] : [id]);
      else if (pick.ids.has(id)) pick.ids.delete(id); else pick.ids.add(id);
      libRefresh();
    },
    libAll() { lib.all = !lib.all; libRefresh(); },
    pickHave() { toast(pick && (pick.mode === 'session' || pick.mode === 'swap') ? 'Already in this workout' : 'Already in the list'); },
    pickCancel() { if (pick) lib = pick.saved; pick = null; back(); },
    pickDone() {
      if (!pick) return;
      const p = pick, ids = [...p.ids];
      const plural = n => `${n} exercise${n > 1 ? 's' : ''} added`;
      lib = p.saved; pick = null;
      if (p.mode === 'day') {
        const d = S.getDay(p.dayId); if (d) ids.forEach(ex => { if (!d.items.some(i => i.ex === ex)) d.items.push({ ex, sets: 3, reps: '' }); });
        S.save(); back();
        if (ids.length) toast(plural(ids.length));
      } else if (p.mode === 'session') {
        const s = curSession(), edit = inEdit();
        const added = s ? ids.filter(ex => !s.items.some(i => i.ex === ex)) : [];
        added.forEach(ex => s.items.push(buildItem(ex, null)));
        S.save(true); back();
        if (added.length) toast(plural(added.length));
        if (s && !edit) askAddToDay(s.dayId, added);
      } else if (p.mode === 'swap') {
        const s = curSession(), edit = inEdit(), id = ids[0];
        if (s && id && s.items[p.idx] && !s.items.some(i => i.ex === id)) {
          const day = s.dayId ? S.getDay(s.dayId) : null;
          const planned = day ? day.items.find(it => it.ex === id) : null;
          s.items[p.idx] = buildItem(id, planned || { sets: s.items[p.idx].sets.length });
          S.save(true); back(); toast('Swapped');
          if (!edit) askAddToDay(s.dayId, [id]);
        } else back();
      } else if (p.mode === 'choose') {
        const d = S.getDay(p.dayId);
        const fresh = d && choose ? ids.filter(ex => !d.items.some(i => i.ex === ex) && !choose.extra.includes(ex)) : [];
        if (choose) { fresh.forEach(ex => choose.extra.push(ex)); ids.forEach(ex => choose.ids.add(ex)); }
        back();
        askAddToDay(p.dayId, fresh);
      } else back();
    },
    libGroup(el) { lib.group = el.dataset.g; libRefresh(); },
    libEquip(el) { lib.equip = el.dataset.g; libRefresh(); },
    libClear() { lib.q = ''; const q = $('#libq'); if (q) { q.value = ''; q.focus(); } libRefresh(true); },
    openEx(el) { libKeepQ(); go('exercise', { id: el.dataset.id }); },
    libRq(el) { lib.q = el.dataset.v || ''; const q = $('#libq'); if (q) q.value = lib.q; libRefresh(true); },
    libRqClear() { S.meta.libQs = []; S.saveMeta(); libRefresh(true); },
    openExFromSession(el) { go('exercise', { id: el.dataset.id }); },
    heroTap() { const ex = S.getEx(stack[stack.length - 1].params.id); const im = $('#hero'); if (!ex || !im || ex.img.length < 2) return; const f = im.src.endsWith(ex.img[0]) ? 1 : 0; im.src = ex.img[f]; },
    editMax(el) {
      const id = el.dataset.id, k = el.dataset.k === 'orm' ? 'orm' : 'max', ex = S.getEx(id), xd = S.exData(id);
      const timed = ex.track === 'time';
      const title = k === 'orm' ? 'One-rep max' : (timed ? 'Best time' : 'Top set');
      const hint = k === 'orm' ? 'The most you can lift for a single rep. It only changes when you type it here.'
        : (timed ? 'Your longest time. It also updates itself the moment you tick a longer one.' : 'The heaviest weight you use for a normal set. It also rises by itself the moment you tick a heavier set.');
      openSheet(`<h2>${title} — ${esc(ex.name)}</h2>
        <div class="row"><input class="input" id="maxIn" type="number" inputmode="decimal" step="any" value="${xd[k] || ''}" placeholder="0" style="font-size:24px;font-weight:800"><span class="muted">${timed ? 'min' : unit()}</span></div>
        <p class="xs dim mt8">${hint}</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="saveMax" data-id="${id}" data-k="${k}">Save</button></div>`,
        () => { const i = $('#maxIn'); i.focus(); i.select(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.saveMax({ dataset: { id, k } }); }); });
    },
    saveMax(el) {
      const xd = S.exData(el.dataset.id), k = el.dataset.k === 'orm' ? 'orm' : 'max'; const inp = $('#maxIn'); if (!inp) return;
      const v = num(inp.value); xd[k] = v > 0 ? v : null; xd[k + 'Date'] = v > 0 ? Date.now() : null;
      const a = D.active; if (k === 'max' && a && a.tb) { a.tb[el.dataset.id] = { max: xd.max, maxDate: xd.maxDate }; liveTop(a, el.dataset.id); }
      S.save(); closeSheet(); rerender();
    },
    sxSetup(el) {
      const id = el.dataset.id, ex = S.getEx(id); if (!ex) return; const xd = S.exData(id);
      openSheet(`<h2>Setup — ${esc(ex.name)}</h2>
        <textarea class="input" data-bind="notes" data-id="${id}" placeholder="e.g. seat 4, pin 7, handles at ear height">${esc(xd.notes)}</textarea>
        <div class="photos">${photosHtml(id)}</div>
        <button class="btn primary block mt16" data-act="closeSheet">Done</button>`, null, () => { setupCtx = null; rerender(); });
      setupCtx = id;
    },
    addPhoto(el) { pendingPhotoEx = el.dataset.id; $('#photoInput').value = ''; $('#photoInput').click(); },
    // Signed in, the full photo is kept in the account: show the small copy at once, then swap the full one in.
    viewPhoto(el) {
      const p = el.dataset.p, full = S.loadPhoto(p), small = full || S.showPhoto(p);
      if (small) openLightbox(small, p);
      if (!full && window.Cloud && window.Cloud.signedIn()) {
        window.Cloud.fullPhoto(p).then(d => { if (!d) return; if (!small) openLightbox(d, p); else { const im = $('#lightbox img'); if (im && im.dataset.p === p) im.src = d; } })
          .catch(() => toast(small ? 'The full-size photo needs internet' : 'This photo needs internet'));
      }
    },
    delPhoto(el, e) { e.stopPropagation(); const xd = S.exData(el.dataset.id), pid = el.dataset.p, at = xd.photos.indexOf(pid), exId = el.dataset.id; xd.photos = xd.photos.filter(p => p !== pid); S.save();
      // 1.33: Undo for a few seconds; the photo file goes once Undo has gone
      let back = false; undo('Photo removed', () => { back = true; const x2 = S.exData(exId); if (!x2.photos.includes(pid)) x2.photos.splice(Math.max(0, at), 0, pid); S.save(); if (setupCtx === exId) ACT.sxSetup({ dataset: { id: exId } }); else rerender(); });
      setTimeout(() => { if (!back && !S.exData(exId).photos.includes(pid)) S.deletePhoto(pid); }, 9000); if (setupCtx === el.dataset.id) ACT.sxSetup({ dataset: { id: el.dataset.id } }); else rerender(); },
    video(el) {
      const ex = S.getEx(el.dataset.id), xd = S.exData(el.dataset.id);
      // your own link first, then the video picked for this exercise, then a YouTube search
      const url = xd.video && /^https?:\/\//.test(xd.video) ? xd.video
        : ex.video ? 'https://www.youtube.com/watch?v=' + ex.video
        : 'https://www.youtube.com/results?search_query=' + encodeURIComponent(ex.name + ' proper form');
      if (S.isAndroid) window.Android.openUrl(url); else window.open(url, '_blank');
    },
    addToDay(el) {
      const id = el.dataset.id;
      if (!D.days.length) { toast('Create a day first'); return; }
      openSheet(`<h2>Add to which day?</h2>${D.days.map(d => { const has = d.items.some(i => i.ex === id); return `<button class="btn block mb8 ${has ? 'ghost' : ''}" data-act="addToDayYes" data-id="${id}" data-day="${d.id}" ${has ? 'disabled' : ''}>${esc(d.name)}${has ? ' — already in' : ''}</button>`; }).join('')}`);
    },
    addToDayYes(el) { const d = S.getDay(el.dataset.day); if (d) { d.items.push({ ex: el.dataset.id, sets: 3, reps: '' }); S.save(); } closeSheet(); toast('Added to ' + d.name); },
    cxMus(el) { const on = !el.classList.contains('on'); el.classList.toggle('on', on); el.setAttribute('aria-pressed', String(on)); },
    customEx() {
      openSheet(`<h2>Custom exercise</h2>
        <div class="field"><label class="lbl">Name</label><input class="input" id="cxName" placeholder="e.g. Landmine press"></div>
        <div class="field"><label class="lbl">Body part</label><select class="input" id="cxGroup">${S.GROUPS.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl">Muscles it works <span class="xs dim">(tap all that fit)</span></label><div class="chips cx-mus" id="cxMusP">${CX_MUS.map(m => `<button class="chip" data-act="cxMus" data-v="${esc(m)}" aria-pressed="false">${esc(m)}</button>`).join('')}</div>
          <input class="input mt8" id="cxMus" placeholder="Others, comma separated (optional)"></div>
        <div class="field"><label class="lbl">Equipment</label><select class="input" id="cxEquip">${S.EQUIP.map(g => `<option>${g}</option>`).join('')}</select></div>
        <div class="field"><label class="lbl">How to log it</label><select class="input" id="cxTrack"><option value="weight">weight × reps</option><option value="bw">bodyweight (reps, optional added weight)</option><option value="time">time (minutes)</option></select></div>
        <div class="row"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="customExSave">Add</button></div>`, () => $('#cxName').focus());
    },
    customExSave() {
      const name = $('#cxName').value.trim(); if (!name) { toast('Give it a name'); return; }
      const picked = $$('#cxMusP .chip.on').map(b => b.dataset.v), mus = [...new Set(picked.concat($('#cxMus').value.split(',').map(s => s.trim()).filter(Boolean)))];
      D.customEx.push({ id: 'c-' + S.uid(), name, group: $('#cxGroup').value, primary: mus.length ? mus : [$('#cxGroup').value], secondary: [], equip: $('#cxEquip').value, tip: '', mine: true, track: $('#cxTrack').value, alt: [], img: [], steps: [] });
      S.save(); closeSheet(); rerender(); toast('Added to library');
    },
    deleteCustom(el) { const id = el.dataset.id; D.customEx = D.customEx.filter(e => e.id !== id); D.days.forEach(d => d.items = d.items.filter(i => i.ex !== id)); S.save(); back(); toast('Deleted'); },
    // session (live or being edited)
    toggleSx(el) {
      const s = curSession(); const it = s && s.items[+el.dataset.i]; if (!it) return; it.open = !isOpen(it, inEdit());
      // 1.35.2: opening an exercise that hasn't started starts it (no separate ▶ Start needed); a paused workout stays paused
      if (it.open && !inEdit() && s === D.active && !it.run && !it.fin && !it.skipped && !s.pauseAt && window.__calm !== false) { pauseRunning(s, it); it.run = Date.now(); S.save(true); rerender(); return; }
      S.save(); refreshSx(+el.dataset.i);
    },
    setDone(el) {
      const cs = curSession(); const it = cs && cs.items[+el.dataset.si]; const s = it && it.sets[+el.dataset.ri]; if (!s) return;
      if (!inEdit() && cs.pauseAt) resumeWorkout();
      s.done = !s.done;
      let whole = false;                                 // 1.35.2: the exercise's finished state changed: redraw the whole screen
      if (!inEdit()) {
        const calm = window.__calm !== false;          // tests keep the old ways (Start and Done by hand) with __calm = false
        if (calm && s.done && !it.run && !it.fin && cs === D.active) { pauseRunning(cs, it); it.run = Date.now(); whole = true; }      // 1.35.2: a tick starts it
        if (s.done) {   // time for this set = exercise time since the previous tick (or since Start for the first one)
          const at = exMs(it), prev = it.sets.reduce((m, x) => (x !== s && x.done && x.at != null) ? Math.max(m, x.at) : m, 0);
          s.t = Date.now(); s.at = at; s.ms = at - prev > 0 ? at - prev : null;
        } else { delete s.t; delete s.at; delete s.ms; delete s.eff; }
        const said = window.SetX ? window.SetX.ticked(cs, it, s, +el.dataset.si, +el.dataset.ri) : '';
        const r = liveTop(cs, it.ex);                   // v1.13: one message, the record alert's words with Top set's Undo
        // 1.35.2: only when a best from before this workout is beaten, and once per new best (not again after an untick)
        const told = cs.tbSaid || (cs.tbSaid = {});
        if (s.done && r && r.top > r.was && (!calm || (r.base > 0 && r.top > (told[it.ex] || 0)))) { told[it.ex] = r.top; topSay(cs, it, s, r, +el.dataset.si, +el.dataset.ri, said); }
        // 1.35.2: the last set ticked finishes the exercise (its time stops; ↩ Go back opens it again); an untick undoes that
        const all = it.sets.length > 0 && it.sets.every(x => x.done);
        if (calm && all && !it.fin && cs === D.active) { if (it.run) { it.ms = (it.ms || 0) + (Date.now() - it.run); it.run = null; } it.fin = true; it.finAt = Date.now(); it.open = true; whole = true; }
        else if (calm && !all && it.fin && !s.done) { it.fin = false; delete it.finAt; whole = true; }
      }
      S.save(true); if (whole) rerender(); else refreshSx(+el.dataset.si);
    },
    sxStart(el) {
      const s = D.active; const it = s && s.items[+el.dataset.i]; if (!it || inEdit()) return;
      if (s.pauseAt) { delete s.pauseEx; resumeWorkout(); }
      pauseRunning(s, it);
      if (!it.run) it.run = Date.now();
      it.fin = false; delete it.finAt; it.open = true;
      S.save(true); rerender();
    },
    sxDone(el) {   // no confirmation: Go back undoes it
      const s = D.active; const it = s && s.items[+el.dataset.i]; if (!it || inEdit()) return;
      if (it.run) { it.ms = (it.ms || 0) + (Date.now() - it.run); it.run = null; }
      it.fin = true; it.finAt = Date.now(); it.open = false;
      S.save(true); rerender();
    },
    goBack() {
      const s = D.active; if (!s) return;
      const fins = s.items.map((it, i) => ({ it, i })).filter(x => x.it.fin && S.getEx(x.it.ex)).sort((a, b) => (b.it.finAt || 0) - (a.it.finAt || 0));
      if (!fins.length) { toast('Nothing is marked done yet'); return; }
      if (fins.length === 1) { ACT.goBackTo({ dataset: { i: String(fins[0].i) } }); return; }
      openSheet(`<h2>Go back to which exercise?</h2><div class="card" style="background:var(--bg3)">` +
        fins.map(({ it, i }) => { const ex = S.getEx(it.ex); return `<div class="list-item" data-act="goBackTo" data-i="${i}">${thumb(ex)}<div class="grow"><div class="ellipsis small" style="font-weight:600">${i + 1}. ${esc(ex.name)}</div><div class="xs muted">done${it.ms ? ' · ' + fmtShort(it.ms) : ''}</div></div><span class="chev">›</span></div>`; }).join('') +
        `</div><button class="btn block" data-act="closeSheet">Cancel</button>`);
    },
    goBackTo(el) {
      const s = D.active; const i = +el.dataset.i; const it = s && s.items[i]; if (!it || !it.fin) return;
      const ex = S.getEx(it.ex), cur = s.items.find(x => x.run), curEx = cur && S.getEx(cur.ex);
      openSheet(`<h2>Go back to ${esc(ex ? ex.name : 'this exercise')}?</h2><p class="muted">It opens again and its timer carries on${it.ms ? ' from ' + fmtShort(it.ms) : ''}.${curEx ? ` ${esc(curEx.name)} is paused and keeps its time.` : ''}</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="goBackYes" data-i="${i}">Go back</button></div>`);
    },
    goBackYes(el) {
      const s = D.active; const i = +el.dataset.i; const it = s && s.items[i]; if (!it) return;
      pauseRunning(s, it);
      it.fin = false; delete it.finAt; if (!it.run) it.run = Date.now(); it.open = true;
      S.save(true); closeSheet(); rerender();
      const node = $(`.sx[data-i="${i}"]`); if (node) node.scrollIntoView({ block: 'center' });
    },
    // v1.13: + Set asks which kind (on unless switched off in Settings › More features › During a workout); the first time
    // it also says where to switch it off
    setsAll(el) {
      const cs = curSession(), i = +el.dataset.i, it = cs && cs.items[i], src = it && it.sets[+el.dataset.ri]; if (!src) return;
      const was = it.sets.map(x => [x.w, x.r]); let n = 0;
      it.sets.forEach((x, r) => { if (x === src || x.done) return; if (src.w != null && src.w !== '') x.w = src.w; if (src.r != null && src.r !== '') x.r = src.r; n++; });
      S.save(); refreshSx(i);
      if (window.Motion && window.Motion.undoToast) window.Motion.undoToast(`Copied to ${n} set${n === 1 ? '' : 's'}`, () => { it.sets.forEach((x, r) => { if (was[r]) { x.w = was[r][0]; x.r = was[r][1]; } }); S.save(); refreshSx(i); });
    },
    addSet(el) {
      const s = curSession(); const it = s && s.items[+el.dataset.i]; if (!it) return;
      if (D.settings.setAsk === false) { ACT.addSetKind({ dataset: { i: el.dataset.i, k: '' } }); return; }
      const first = !S.meta.setAskSeen; if (first) { S.meta.setAskSeen = 1; S.saveMeta(); }
      const b = (k, t, sub) => `<button class="btn block mb8" data-act="addSetKind" data-i="${el.dataset.i}" data-k="${k}"><div>${t}</div><div class="xs muted" style="font-weight:500">${sub}</div></button>`;
      openSheet(`<h2>Add a set</h2>${b('', 'Normal set', 'the same weight and reps as the last one')}${b('w', 'Warm-up', 'logged, but not counted for records or for the muscle')}${b('d', 'Drop set', 'the same reps; type the lighter weight')}
        ${first ? `<p class="xs dim mt8">You can switch this question off in Settings › More features › During a workout. New sets are then normal sets straight away.</p>` : ''}
        <button class="btn ghost block mt8" data-act="closeSheet">Cancel</button>`);
    },
    addSetKind(el) {
      const s = curSession(); const i = +el.dataset.i, it = s && s.items[i]; if (!it) return;
      const last = it.sets[it.sets.length - 1], k = el.dataset.k || '', set = { w: k === 'd' || !last ? '' : last.w, r: last ? last.r : '', done: false };
      if (k === 'w' || k === 'd') set.kind = k;
      it.sets.push(set); S.save(); closeSheet(); refreshSx(i);
      { const rows = $$(`.sx[data-i="${i}"] .set-row`); if (window.Glow && rows.length) window.Glow(rows[rows.length - 1]); }          // 1.33 (33): the new set glows once
      if (k === 'd') { const inp = $(`.sx[data-i="${i}"] input[data-f="w"][data-ri="${it.sets.length - 1}"]`); if (inp) inp.focus(); }      // straight to the lighter weight
    },
    removeSet(el) {
      const s = curSession(), i = +el.dataset.i, it = s && s.items[i]; if (!it || it.sets.length <= 1) return;
      const x = it.sets.pop(); S.save(); refreshSx(i);
      if (x && (x.done || (x.w != null && x.w !== '') || (x.r != null && x.r !== ''))) undo(`Set ${it.sets.length + 1} removed`, () => { if (curSession() !== s) return; it.sets.push(x); S.save(); refreshSx(i); });
    },
    unskipEx(el) { const s = curSession(); const it = s && s.items[+el.dataset.i]; if (!it) return; it.skipped = false; S.save(); refreshSx(+el.dataset.i); },
    sxMenu(el) {
      const s = curSession(); const i = +el.dataset.i; const it = s && s.items[i]; if (!it) return;
      const ex = S.getEx(it.ex);
      openSheet(`<h2>${esc(ex ? ex.name : 'Exercise')}</h2><div class="menu">
        ${ex ? `<button class="btn block" data-act="sxInfo" data-id="${ex.id}">ⓘ&nbsp; Setup, photos & info</button>` : ''}
        <button class="btn block" data-act="sxMove" data-i="${i}" data-dir="-1" ${i === 0 ? 'disabled' : ''}>▲&nbsp; Move up</button>
        <button class="btn block" data-act="sxMove" data-i="${i}" data-dir="1" ${i === s.items.length - 1 ? 'disabled' : ''}>▼&nbsp; Move down</button>
        <button class="btn block" data-act="sxSwap" data-i="${i}">⇄&nbsp; Swap for another exercise</button>
        <button class="btn danger block" data-act="sxRemove" data-i="${i}">✕&nbsp; Remove from this workout</button></div>`);
    },
    sxInfo(el) { closeSheet(); go('exercise', { id: el.dataset.id }); },
    sxMove(el) {
      const s = curSession(); const i = +el.dataset.i, j = i + (+el.dataset.dir); if (!s || j < 0 || j >= s.items.length) return;
      [s.items[i], s.items[j]] = [s.items[j], s.items[i]]; S.save(true); closeSheet(); rerender();
    },
    sxRemove(el) { ACT.sxRemoveYes(el); },
    sxRemoveYes(el) {
      const s = curSession(), i = +el.dataset.i, it = s && s.items[i]; if (!it) return; const ex = S.getEx(it.ex), n = it.sets.filter(x => x.done).length;
      s.items.splice(i, 1); S.save(true); closeSheet(); rerender();
      undo(`${ex ? ex.name : 'Exercise'} removed${n ? ` with its ${n} ticked set${n === 1 ? '' : 's'}` : ''}`, () => { if (curSession() !== s || s.items.includes(it)) return; s.items.splice(Math.min(i, s.items.length), 0, it); S.save(true); rerender(); });
    },
    sxSwap(el) {
      const s = curSession(); const i = +el.dataset.i; const it = s && s.items[i]; if (!it) return;
      const n = it.sets.filter(x => x.done).length; const ex = S.getEx(it.ex);
      if (n && !el.dataset.sure) {
        openSheet(`<h2>Swap ${esc(ex ? ex.name : 'this exercise')}?</h2><p class="muted">The ${n} set${n > 1 ? 's' : ''} you ticked for it will be removed. To keep them, add the other exercise instead.</p>
          <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="sxSwap" data-i="${i}" data-sure="1">Choose replacement</button></div>`);
        return;
      }
      closeSheet();
      pick = { mode: 'swap', idx: i, label: ex ? ex.name : '', ids: new Set(), have: new Set(s.items.map(x => x.ex)), saved: lib };
      lib = { q: '', group: ex && S.GROUPS.includes(ex.group) ? ex.group : 'All', equip: 'All' };
      go('picker');
    },
    sxAdd() {
      const s = curSession(); if (!s) return;
      const day = s.dayId ? S.getDay(s.dayId) : null;
      const have = new Set(s.items.map(x => x.ex));
      const more = day ? day.items.map(it => S.getEx(it.ex)).filter(ex => ex && !have.has(ex.id)) : [];
      if (!more.length) { ACT.pickForSession(); return; }
      openSheet(`<h2>Add exercise</h2><p class="xs dim mb8">Still in ${esc(day.name)}:</p><div class="card" style="background:var(--bg3)">` +
        more.map(ex => `<div class="list-item" data-act="sxAddOne" data-id="${ex.id}">${thumb(ex)}<div class="grow"><div class="ellipsis small" style="font-weight:600">${esc(ex.name)}</div><div class="xs muted ellipsis">${esc(ex.primary.join(', '))}</div></div><span class="accent" style="font-size:24px;font-weight:700">+</span></div>`).join('') +
        `</div><button class="btn block" data-act="pickForSession">Browse the full library</button>`);
    },
    sxAddOne(el) {
      const s = curSession(); if (!s || s.items.some(i => i.ex === el.dataset.id)) return;
      const day = s.dayId ? S.getDay(s.dayId) : null;
      s.items.push(buildItem(el.dataset.id, day ? day.items.find(it => it.ex === el.dataset.id) : null));
      S.save(true); closeSheet(); rerender(); toast('Added');
    },
    finish() { finishSession(); },
    saveSession() { saveSession(); },
    pauseToggle() { const a = D.active; if (!a || inEdit()) return; if (a.pauseAt) { resumeWorkout(); toast('Carrying on'); } else { pauseWorkout(); toast('Paused'); } S.save(true); rerender(); },
    discard() {
      openSheet(`<h2>Discard this workout?</h2><p class="muted">Nothing from it will be saved.</p><div class="row mt16"><button class="btn grow" data-act="closeSheet">Keep it</button><button class="btn danger grow" data-act="discardYes">Discard</button></div>`);
    },
    discardYes() { restoreTops(D.active); D.active = null; S.save(true); if (S.isAndroid) window.Android.keepAwake(false); closeSheet(); setRoot('days'); toast('Workout discarded'); },
    openSession(el) { closeSheet(); go('sessionDetail', { id: el.dataset.id }); },
    openRecords() { go('records'); },
    histMode(el) { hist.mode = el.dataset.m; rerender(); },
    histMonth(el) { const d = new Date(hist.y, hist.m + (+el.dataset.d), 1); hist.y = d.getFullYear(); hist.m = d.getMonth(); rerender(); },
    histClear() { hist.q = ''; const q = $('#histq'); if (q) { q.value = ''; q.focus(); } histRefresh(); },
    calDay(el) {
      const day = +el.dataset.d, list = D.sessions.filter(s => { const d = new Date(s.start); return d.getFullYear() === hist.y && d.getMonth() === hist.m && d.getDate() === day; });
      const SP = window.Sports, acts = SP ? SP.histList().filter(x => { const d = new Date(x.t); return d.getFullYear() === hist.y && d.getMonth() === hist.m && d.getDate() === day; }) : [];
      if (list.length === 1 && !acts.length) go('sessionDetail', { id: list[0].id });
      else if (acts.length === 1 && !list.length) ACT.mvOpen({ dataset: { id: acts[0].id } });
      else if (list.length || acts.length) openSheet(`<h2>${day} ${MONTHS_LONG[hist.m]}</h2><div class="card" style="background:var(--bg3)">${list.map(s => ({ t: s.start, h: histItemHtml(s) })).concat(acts.map(x => ({ t: x.t, h: SP.histItemHtml(x) }))).sort((a, b) => a.t - b.t).map(x => x.h).join('')}</div><button class="btn block" data-act="closeSheet">Close</button>`);
    },
    goalEdit() {
      const g0 = weekGoal(), n0 = doneIn(weekStartOf(Date.now()), Infinity);
      openSheet(`<h2>Weekly goal</h2>${g0 ? `<p class="mb8" id="goalNow"><b>${n0} of ${g0}</b> done this week${n0 >= g0 ? ' · goal reached 🎉' : ` · ${g0 - n0} more to go`}. <span class="muted">${window.Sports && window.Sports.showMode() === 'goal' ? `Gym workouts count, and so do activities of ${window.Sports.GOAL_MIN} minutes or more.` : 'Gym workouts count.'} The week starts on Monday.</span></p>` : ''}<p class="muted mb12">How many workouts do you want each week?</p>
        <div class="stp"><div class="k">Workouts</div><button class="stp-b" data-act="goalStep" data-d="-1" aria-label="Fewer">−</button><input class="input num" id="goalIn" type="number" value="${weekGoal() || 3}" readonly><button class="stp-b" data-act="goalStep" data-d="1" aria-label="More">+</button></div>
        <button class="btn primary block mt16" data-act="closeSheet">Done</button><button class="btn ghost block mt8" data-act="goalOff">Don't show a weekly goal</button>`, null, () => rerender());
    },
    goalStep(el) { const v = Math.min(7, Math.max(1, (weekGoal() || 3) + (+el.dataset.d))); D.settings.weekGoal = v; S.save(); const i = $('#goalIn'); if (i) i.value = v; },
    goalOff() { D.settings.weekGoal = 0; S.save(); closeSheet(); toast('Weekly goal hidden. Turn it back on in Settings.'); },
    favToggle(el) { const xd = S.exData(el.dataset.id); if (xd.fav) delete xd.fav; else xd.fav = true; S.save(); rerender(); toast(xd.fav ? 'Added to favourites' : 'Removed from favourites'); },
    hideToggle(el) { const xd = S.exData(el.dataset.id); if (xd.hide) delete xd.hide; else xd.hide = true; S.save(); rerender(); toast(xd.hide ? 'Hidden. It is under "Hidden" in the library.' : 'Back in the library'); },
    chartMetric(el) { chartMetric = el.dataset.m; rerender(); },
    wStep(el) {
      const cs = curSession(); const it = cs && cs.items[+el.dataset.si]; const s = it && it.sets[+el.dataset.ri]; if (!s) return;
      const v = Math.max(0, Math.round((num(s.w) + (+el.dataset.d) * wStepSize(S.getEx(it.ex))) * 100) / 100);
      s.w = v ? fmtW(v) : ''; S.save();
      const inp = $(`input[data-si="${el.dataset.si}"][data-ri="${el.dataset.ri}"][data-f="w"]`); if (inp) inp.value = s.w;
    },
    tgtUse(el) {
      const a = D.active; const it = a && a.items[+el.dataset.i]; if (!it || !it.tgt || inEdit()) return;
      it.sets.forEach(x => { if (!x.done) { x.w = fmtW(it.tgt.w); x.r = fmtW(it.tgt.r); } });
      S.save(true); refreshSx(+el.dataset.i); toast('Filled in for the sets you have left');
    },
    editSession(el) { go('sessionEdit', { id: el.dataset.id }); },
    deleteSession(el) { ACT.deleteSessionYes(el); },
    deleteSessionYes(el) {
      const x = D.sessions.find(s => s.id === el.dataset.id); if (!x) return;
      D.sessions = D.sessions.filter(s => s.id !== x.id); S.save(true); closeSheet(); setRoot('history');
      undo(`${x.dayName || 'Workout'} of ${fmtDate(x.start)} deleted`, () => { if (D.sessions.some(s => s.id === x.id)) return; D.sessions.push(x); D.sessions.sort((a, b) => a.start - b.start); S.save(true); rerender(); });
    },
    // 1.33 (49): feedback by email, with the app's version and the phone's model filled in (nothing else about you)
    // 1.35.2: the privacy policy, from About, the sign-in screen, the welcome screen, club rules and the AI question
    privacyOpen() { const url = window.GYMDAY_PRIVACY || 'https://claude.ai/artifact/XrUPwNsM99sMBKQJ52obsr'; if (S.isAndroid && window.Android && window.Android.openUrl) window.Android.openUrl(url); else window.open(url, '_blank'); },
    feedback() {
      const app = window.GYMDAY_APP || {}, ua = navigator.userAgent || '';
      const am = /Android ([\d.]+); ([^;)]+?)(?: Build\/|\))/.exec(ua), im = /(iPhone|iPad)[^;]*; CPU (?:iPhone )?OS ([\d_]+)/.exec(ua);
      const phone = am ? `${am[2].trim()}, Android ${am[1]}` : im ? `${im[1]}, iOS ${im[2].replace(/_/g, '.')}` : (S.isAndroid ? 'Android' : 'a browser');
      const body = `\n\n\n---\nGymDay ${app.name || ''} (${app.code || ''})\nPhone: ${phone}\nText size: ${(document.documentElement.style.getPropertyValue('--fs') || '1').trim()} · Theme: ${document.documentElement.dataset.theme || 'dark'}`;
      const url = `mailto:gymday89@gmail.com?subject=${encodeURIComponent('GymDay feedback (' + (app.name || '') + ')')}&body=${encodeURIComponent(body)}`;
      if (S.isAndroid && window.Android && window.Android.openUrl) { window.Android.openUrl(url); return; }
      openSheet(`<h2>Send feedback</h2><p class="small">Write to <b>gymday89@gmail.com</b> and say which version you have: GymDay ${esc(app.name || '')} (${esc(String(app.code || ''))}).</p><a class="btn primary block mt16" href="${esc(url)}">Open my email app</a><button class="btn block mt8" data-act="closeSheet">Close</button>`);          // a browser: the address, and a link it may open
    },
    // settings
    async export() {
      // signed in, the full photos are in the account: fetch them so the backup file is complete
      if (window.Cloud && window.Cloud.signedIn()) { toast('Getting your photos for the backup…'); try { await window.Cloud.fetchAllPhotos(false); } catch (e) { toast("Couldn't fetch every photo; the backup has the small copies"); } }
      const json = S.exportJSON();
      if (S.isAndroid) window.Android.exportBackup(json);
      else { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([json], { type: 'application/json' })); a.download = 'gymday-backup.json'; a.click(); }
    },
    import() {
      if (S.isAndroid) window.Android.importBackup();
      else { const i = document.createElement('input'); i.type = 'file'; i.accept = '.json,application/json'; i.onchange = () => { const f = i.files[0]; if (!f) return; const r = new FileReader(); r.onload = () => window.onBackupImported(r.result); r.readAsText(f); }; i.click(); }
    },
    reset() {
      openSheet(`<h2>Delete everything?</h2><p class="muted">Days, workout history, max weights, notes and photos${window.Cloud && window.Cloud.signedIn() ? ' — on this phone <b>and in your account</b>, so they disappear from your other devices and your clubs too' : ''}. This cannot be undone — export a backup first if you're not sure.</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" data-act="resetYes">Delete all</button></div>`);
    },
    // signed in: the delete also reaches the account and other devices; signed out: only this phone is emptied
    resetYes() { if (window.Cloud && window.Cloud.signedIn()) S.resetAll(); else S.wipeLocal(); closeSheet(); setRoot('days'); toast('All data deleted'); },
  };
  window.onBackupImported = function (json) {
    try { S.importJSON(json); setRoot('days'); toast('Backup restored'); }
    catch (e) { toast('That file is not a GymDay backup'); }
  };

  // ---------------- photos ----------------
  let pendingPhotoEx = null;
  function fileToJpeg(file, max, q) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight));
        const c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        resolve(c.toDataURL('image/jpeg', q));
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('bad image')); };
      img.src = url;
    });
  }
  $('#photoInput').addEventListener('change', async e => {
    const files = Array.from(e.target.files || []); const exId = pendingPhotoEx; pendingPhotoEx = null;
    if (!files.length || !exId) return;
    toast(files.length > 1 ? 'Adding photos…' : 'Adding photo…');
    const xd = S.exData(exId);
    let ok = 0;
    for (const f of files) {
      try {
        const data = await fileToJpeg(f, 1280, 0.82); const pid = 'p' + S.uid();
        if (S.savePhoto(pid, data)) { xd.photos.push(pid); ok++; try { S.savePhoto('t_' + pid, await fileToJpeg(f, 240, 0.7)); } catch (e2) { } }
      } catch (err) { console.warn(err); }
    }
    S.save(true);
    if (setupCtx === exId) ACT.sxSetup({ dataset: { id: exId } }); else rerender();
    toast(ok ? `${ok} photo${ok > 1 ? 's' : ''} saved` : 'Could not read that photo');
  });

  // ---------------- event wiring ----------------
  document.addEventListener('click', e => {
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = ACT[el.dataset.act];
    if (fn) { e.preventDefault(); fn(el, e); }
  });
  // 1.35.2: on iPhone (WebKit) a tap becomes a click only on an element that is, or sits inside, something with a click listener of
  // its own; the taps are handled on document, which doesn't count, so a tappable card, row or exercise (a div, not a button) did
  // nothing on iPhone. An empty listener on the app's box makes everything inside it tappable there, as on Android.
  $('#app').addEventListener('click', () => { });
  $('#nav').addEventListener('click', e => { const b = e.target.closest('[data-nav]'); if (b) setRoot(b.dataset.nav); });
  $('#sheet').addEventListener('click', e => { if (e.target.id === 'sheet') closeSheet(); }); // tap outside the panel closes it
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.dataset.si != null) { // session set field
      const cs = curSession(); const it = cs && cs.items[+t.dataset.si]; if (!it || !it.sets[+t.dataset.ri]) return;
      it.sets[+t.dataset.ri][t.dataset.f] = t.value; S.save();
      if (t.dataset.f === 'w' && cs === D.active && !inEdit() && it.sets[+t.dataset.ri].done) liveTop(cs, it.ex);      // a fixed typo puts Top set right
      return;
    }
    const b = t.dataset.bind;
    if (!b) return;
    if (b === 'planSets' || b === 'planReps') planSave();
    else if (b === 'notes') { S.exData(t.dataset.id).notes = t.value; S.save(); }
    else if (b === 'video') { S.exData(t.dataset.id).video = t.value.trim(); S.save(); }
    else if (b === 'sessName') { const s = curSession(); if (s && inEdit()) { s.dayName = t.value.trim() || 'Workout'; S.save(); } }
    else if (b === 'sessDur') applySessTime();
    else if (b === 'sessNote') { const s = curSession(); if (s && inEdit()) { if (t.value.trim()) s.note = t.value; else delete s.note; S.save(); } }
  });
  document.addEventListener('change', e => {
    const t = e.target, b = t.dataset.bind;
    if (!b) return;
    if (b === 'unit') { D.settings.unit = t.value; S.save(); }
    else if (b === 'reps') { D.settings.reps = t.checked; S.save(); }
    else if (b === 'askSave') { D.settings.askSave = t.checked; S.save(); }
    else if (b === 'weekGoal') { D.settings.weekGoal = +t.value || 0; S.save(); }
    else if (b === 'sessKeep') { const cs = curSession(); if (cs && inEdit()) { cs.keep = t.checked; S.save(); } }
    else if (b === 'sessDate' || b === 'sessTime' || b === 'sessDur') applySessTime();
    else if (b === 'video') { const v = $('[data-act="video"]'); if (v) v.textContent = '▶ ' + (t.value.trim() ? 'Open my saved video' : (S.getEx(t.dataset.id) || {}).video ? 'Watch how to do it' : 'Search on YouTube'); }
  });
  // keep the keyboard from pushing the sticky rest bar around
  document.addEventListener('focusin', e => { if (e.target.matches('input,textarea')) document.body.classList.add('typing'); });
  document.addEventListener('focusout', () => document.body.classList.remove('typing'));

  // ---------------- shared with the account / clubs screens (cloudui.js) ----------------
  window.App = { e1rm, okForE, saveSession, quick, quickState, pauseWorkout, resumeWorkout, fmtTimer, 
    VIEWS, ACT, $, $$, esc, go, back, setRoot, render, rerender, openSheet, closeSheet, later,
    fmtDate, fmtClock, fmtDur, setsSummary, fmtW, fmtBig, num, unit, repsOn, thumb, weekStartOf, doneIn, recordsFor, whenText, sinceText, refreshSx, curSession, inEdit,
    MONTHS_LONG, afterRender: null,
    top: () => stack[stack.length - 1], depth: () => stack.length, rootName: () => (stack[0] || {}).name || 'days',
    // v1.22: a chart's points for the finger to read (charts.js): [[x, y or null, label, value], …]
    wStepSize, buildItem, chooseState: () => choose,
    ptsAttr: list => ` data-pts="${esc(JSON.stringify(list.map(p => [+(+p[0]).toFixed(1), p[1] == null ? null : +(+p[1]).toFixed(1), String(p[2]), String(p[3])])))}"`,
    inSettings: () => ['settings', 'setPage'].includes(stack[stack.length - 1].name),     // v1.9: Settings and the pages behind it
    // start again from a root tab, optionally with one screen on top of it
    reset(root, name, params) { stack.forEach(leaving); rootName = root; stack = [{ name: root, params: {} }]; if (name) stack.push({ name, params: params || {} }); render(); },
    boot(first) {
      if (D.active) stack = [{ name: 'days', params: {} }, { name: 'session', params: {} }];
      else if (first) stack = [{ name: first, params: {} }];
      render();
    }
  };
})();
