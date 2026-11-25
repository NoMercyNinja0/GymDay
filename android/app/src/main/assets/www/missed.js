/* GymDay v1.28 "Forgot to log?": when switched on (it needs Health Connect's "exercise" permission), a gym session the watch
   recorded that GymDay has no workout for is logged as an estimate: the day that was due then, with the weights and reps of
   its last time. It is marked "Not recorded in GymDay · estimated", shown to the person, and they are asked whether the
   weights changed from last time (No keeps it; Yes opens it to change). Looked for over the last 7 days, at most once an hour. */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !S) return;
  const { esc, ACT, $, VIEWS } = A, D = S.data, toast = m => window.toast(m), num = A.num;
  const HOUR = 3600000, DAY = 24 * HOUR;
  const N = () => (S.isAndroid && window.Android && window.Android.hcSessions ? window.Android : (window.__health && window.__health.hcSessions ? window.__health : null));
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const on = () => wOn() && D.settings.missOn === true && !!(N() || window.__hcSessions);
  const seenList = () => (Array.isArray(D.settings.missSeen) ? D.settings.missSeen : []);
  const remember = t => { D.settings.missSeen = seenList().concat([t]).slice(-60); };

  // ---------------- the watch's sessions (the answer comes back through window.onHealthData, shared with health.js)
  const waiting = {};
  const od = window.onHealthData;
  window.onHealthData = (key, json) => {
    const fn = waiting[key];
    if (!fn) { if (od) od(key, json); return; }
    delete waiting[key]; let r = json; try { if (typeof json === 'string') r = JSON.parse(json); } catch (e) { r = { ok: false }; } fn(r || { ok: false });
  };
  function sessions(from, to) {
    if (window.__hcSessions) return Promise.resolve(window.__hcSessions(from, to));                 // tests
    return new Promise(res => {
      const n = N(); if (!n) { res({ ok: false }); return; }
      const key = 'm' + S.uid(); waiting[key] = res;
      setTimeout(() => { if (waiting[key]) { delete waiting[key]; res({ ok: false, error: 'timeout' }); } }, 15000);
      try { n.hcSessions(key, Math.round(from), Math.round(to)); } catch (e) { delete waiting[key]; res({ ok: false }); }
    });
  }
  const gymish = x => x.kind === 'gym' || (x.kind === 'other' && /gym|weight|strength|lift/i.test(x.title || ''));

  // ---------------- the estimate: the day due then, from its last time
  function dayDue(t) {
    const days = D.days; if (!days.length) return null;
    if (D.settings.schedule && D.settings.week) { const id = D.settings.week[new Date(t).getDay()]; const d = id && S.getDay(id); if (d) return d; }
    const before = D.sessions.filter(s => s.start < t && !s.est).sort((a, b) => b.start - a.start)[0];
    const i = before ? days.findIndex(d => d.id === before.dayId) : -1;
    return days[(i + 1) % days.length];
  }
  // the last time each exercise was done before t (not an estimate): its working sets
  function lastBefore(exId, t) {
    for (const s of D.sessions.slice().sort((a, b) => b.start - a.start)) {
      if (s.start >= t || s.est) continue;
      const it = s.items.find(x => x.ex === exId && !x.skipped && x.sets.some(y => y.done)); if (it) return { s, sets: it.sets.filter(y => y.done) };
    }
    return null;
  }
  function estimate(x) {
    const day = dayDue(x.s); let items = [], from = null, name = '', dayId = '';
    if (day) {
      name = day.name; dayId = day.id;
      for (const p of day.items) { const l = lastBefore(p.ex, x.s); if (!l) continue; if (!from || l.s.start > from.start) from = l.s; items.push({ ex: p.ex, sets: l.sets.map(y => ({ w: y.w, r: y.r, done: true, ...(y.kind ? { kind: y.kind } : {}) })), skipped: false, ms: 0 }); }
    }
    if (!items.length) {                 // no plan (or nothing of it done before): the last workout again
      const last = D.sessions.filter(s => s.start < x.s && !s.est).sort((a, b) => b.start - a.start)[0]; if (!last) return null;
      from = last; name = last.dayName; dayId = last.dayId;
      items = last.items.filter(it => !it.skipped && it.sets.some(y => y.done)).map(it => ({ ex: it.ex, sets: it.sets.filter(y => y.done).map(y => ({ w: y.w, r: y.r, done: true, ...(y.kind ? { kind: y.kind } : {}) })), skipped: false, ms: 0 }));
    }
    if (!items.length) return null;
    return { id: S.uid(), dayId, dayName: name || 'Workout', start: x.s, end: x.e, keep: true, items,
      est: { from: from ? from.start : 0, app: String(x.app || '').slice(0, 60), title: String(x.title || '').slice(0, 60), at: Date.now(), ans: '' } };
  }
  const near = (x, s) => s.start < x.e + 3 * HOUR && (s.end || s.start) > x.s - 3 * HOUR;
  let busy = false, lastCheck = 0;
  async function check(force) {
    if (!on() || busy || (!force && Date.now() - lastCheck < HOUR)) return 0;
    busy = true; lastCheck = Date.now();
    try {
      const from = Math.max(Date.now() - 7 * DAY, num(D.settings.missFrom) || 0), r = await sessions(from, Date.now());
      if (!r || !r.ok) return 0;
      let made = 0;
      for (const x of (r.items || [])) {
        if (!gymish(x) || x.e > Date.now() || seenList().includes(x.s)) continue;
        if (D.sessions.some(s => near(x, s)) || (D.active && near(x, D.active))) { remember(x.s); continue; }
        const est = estimate(x); remember(x.s); if (!est) continue;
        const i = D.sessions.findIndex(s => s.start < est.start); D.sessions.splice(i < 0 ? D.sessions.length : i, 0, est); made++;
      }
      if (made || seenList().length) S.save(true);
      if (made) { const t = A.top().name; if (t === 'days' || t === 'history') A.rerender(); setTimeout(showNext, 600); }
      return made;
    } finally { busy = false; }
  }
  const unanswered = () => D.sessions.filter(s => s.est && !s.est.ans).sort((a, b) => b.start - a.start);

  // ---------------- showing it, and the question
  const when = s => { const d = new Date(s.start); return `${A.fmtDate(s.start)}, ${A.fmtClock(s.start)}${s.end ? '–' + A.fmtClock(s.end) : ''}`.replace(/,\s*$/, '') || d.toDateString(); };
  const mark = s => `<p class="small est-mark">⌚ <b>Not recorded in GymDay · estimated</b>${s.est.from ? ` from your last ${esc(s.dayName)} (${A.fmtDate(s.est.from)})` : ''}.</p>`;
  const list = s => s.items.map(it => { const ex = S.getEx(it.ex); return ex ? `<div class="list-item"><div class="grow small" style="font-weight:600">${esc(ex.name)}</div><div class="small muted" style="text-align:right">${esc(A.setsSummary(it.sets, ex))}</div></div>` : ''; }).join('');
  const ask = s => `<h3 class="mt12">Did your weights change from last time?</h3>
    <div class="row mt8" style="gap:8px"><button class="btn grow" data-act="missSame" data-id="${esc(s.id)}">No, keep it</button><button class="btn primary grow" data-act="missChanged" data-id="${esc(s.id)}">Yes, change them</button></div>`;
  function showNext() {
    const s = unanswered()[0]; if (!s || !$('#sheet') || !$('#sheet').classList.contains('hidden')) return;
    const w = when(s), on = /^(Today|Yesterday)\b/.test(w) ? w.charAt(0).toLowerCase() + w.slice(1) : 'on ' + w;      // "yesterday, 14:00–15:00"
    A.openSheet(`<h2>Logged from your watch</h2><p class="small mt8">Your watch recorded a gym session ${esc(on)} that wasn't recorded in GymDay. Here it is as <b>${esc(s.dayName)}</b>:</p>
      ${mark(s)}<div class="card" style="background:var(--bg3)">${list(s)}</div>${ask(s)}
      <button class="linkish xs mt12" data-act="missDrop" data-id="${esc(s.id)}">It wasn't a gym workout: remove it</button>`);
  }
  const find = id => D.sessions.find(s => s.id === id && s.est);
  ACT.missSame = el => { const s = find(el.dataset.id); if (!s) return; s.est.ans = 'same'; S.save(true); A.closeSheet(); A.rerender(); toast('Kept: the same weights as last time'); setTimeout(showNext, 400); };
  ACT.missChanged = el => { const s = find(el.dataset.id); if (!s) return; s.est.ans = 'changed'; S.save(true); A.closeSheet(); A.go('sessionEdit', { id: s.id }); };
  ACT.missDrop = el => {
    const s = find(el.dataset.id); if (!s) return;
    D.sessions = D.sessions.filter(x => x !== s); S.data.sessions = D.sessions; S.save(true); A.closeSheet(); A.rerender();
    toast('Removed'); setTimeout(showNext, 400);
  };
  // Today: until it's answered
  function missCard() {
    const l = wOn() ? unanswered() : []; if (!l.length) return '';
    const s = l[0];
    return `<div class="card" id="missCard"><div class="k2">⌚ Logged from your watch</div><p class="small mt4"><b>${esc(s.dayName)}</b> · ${esc(when(s))}: not recorded in GymDay, so it's estimated from last time.</p>
      ${ask(s)}<button class="linkish xs mt8" data-act="openSessionEst" data-id="${esc(s.id)}">See it${l.length > 1 ? ` · ${l.length - 1} more` : ''} ›</button></div>`;
  }
  ACT.openSessionEst = el => A.go('sessionDetail', { id: el.dataset.id });
  if (window.Insights && window.Insights.homeCards) { const h0 = window.Insights.homeCards; window.Insights.homeCards = () => missCard() + h0(); }
  // the workout's own page says so, and asks while it hasn't been answered
  if (VIEWS.sessionDetail) {
    const d0 = VIEWS.sessionDetail.html;
    VIEWS.sessionDetail.html = function (p) {
      const h = d0.call(this, p), s = D.sessions.find(x => x.id === (p && p.id)); if (!s || !s.est) return h;
      const add = `<div class="card est-card">${mark(s)}${s.est.ans ? `<p class="xs dim">${s.est.ans === 'same' ? 'You said the weights were the same as last time.' : 'You changed it after it was logged.'}</p>` : ask(s)}</div>`;
      const e = h.indexOf('data-act="editSession"'), i = e >= 0 ? h.indexOf('</div>', e) : -1;      // right under the page's title bar
      return i >= 0 ? h.slice(0, i + 6) + add + h.slice(i + 6) : add + h;
    };
  }

  // ---------------- switching it on
  ACT.missToggle = el => {
    if (D.settings.missOn) { D.settings.missOn = false; S.save(true); A.rerender(); toast('Off: GymDay no longer looks at your watch’s workouts'); return; }
    const n = N();
    if (window.__hcSessions || (n && window.__health)) { turnOn(true); return; }                 // tests
    if (!n) { toast('This needs the Android app and Health Connect'); A.rerender(); return; }
    try { n.hcSessionsAsk(); } catch (e) { toast("Health Connect couldn't be opened"); }
  };
  function turnOn(ok) {
    if (!ok) { toast('Not allowed: Health Connect said no. You can allow "Exercise" for GymDay in Health Connect.'); A.rerender(); return; }
    D.settings.missOn = true; D.settings.missFrom = Date.now() - 7 * DAY; S.save(true); A.rerender();
    toast('On: GymDay checks your watch’s gym sessions from the last 7 days'); check(true);
  }
  window.onHealthExerPerm = ok => turnOn(!!ok);
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => wOn() && (N() || window.__hcSessions) ? `<div class="row" style="padding:6px 0"><div class="grow">Forgot to log? Ask my watch<div class="xs dim">A gym session your watch recorded without a GymDay workout is logged, estimated from last time, and you're asked if the weights changed</div></div>
    <button class="btn sm ${D.settings.missOn ? 'primary' : ''}" data-act="missToggle" aria-pressed="${D.settings.missOn ? 'true' : 'false'}">${D.settings.missOn ? 'On' : 'Off'}</button></div>` : '');

  // look when the app opens and when it comes back (at most once an hour)
  setTimeout(() => { check().catch(() => { }); }, 2500);
  const r0 = window.appResume;
  window.appResume = () => { if (r0) r0(); setTimeout(() => { check().catch(() => { }); }, 1200); };
  window.Missed = { check, estimate, dayDue, unanswered, showNext, sessions, on };
})();
