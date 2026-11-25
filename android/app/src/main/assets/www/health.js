/* GymDay – heart rate and calories from the watch, read from Health Connect (Google Health) for the time of each workout,
   and (88, only when switched on, per phone) each finished workout written there as a strength-training session.
   On the phone the native side answers through window.Android.hc*; in a plain browser there is nothing to read
   (tests install a stand-in as window.__health). */
(function () {
  const A = window.App, S = window.Store, D = S.data;
  const { $, esc, ACT } = A;
  const M = S.meta;
  const toast = m => window.toast(m);
  const N = (S.isAndroid && window.Android.hcStatus) ? window.Android : (window.__health || null);
  const status = () => { if (!N) return { sdk: 0, available: false, granted: false }; try { return JSON.parse(N.hcStatus()) || {}; } catch (e) { return { sdk: 0, available: false, granted: false }; } };
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const on = () => wOn() && !!N && D.settings.health === true && status().granted === true;
  const redraw = () => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; if (!$('#sheet').classList.contains('hidden')) return; A.rerender(); };

  const waiting = {}, tried = {};
  window.onHealthData = (key, json) => { const fn = waiting[key]; delete waiting[key]; if (fn) { let r = json; try { if (typeof json === 'string') r = JSON.parse(json); } catch (e) { r = { ok: false }; } fn(r || { ok: false }); } };
  function read(start, end) {
    return new Promise(res => {
      const key = 'h' + S.uid(); waiting[key] = res;
      setTimeout(() => { if (waiting[key]) { delete waiting[key]; res({ ok: false, error: 'timeout' }); } }, 15000);
      try { N.hcRead(key, String(Math.round(start)), String(Math.round(Math.max(end, start + 60000)))); } catch (e) { delete waiting[key]; res({ ok: false, error: String(e) }); }
    });
  }
  // Ask Health Connect about one finished workout and keep the answer with it.
  async function attach(id, force) {
    const s = D.sessions.find(x => x.id === id); if (!s || !on()) return;
    if (!force && s.hc && !s.hc.none) return;
    tried[id] = Date.now();
    const r = await read(s.start, s.end || s.start);
    const cur = D.sessions.find(x => x.id === id); if (!cur || !r.ok) return;
    const n = v => (typeof v === 'number' && isFinite(v) && v > 0) ? Math.round(v) : null;
    const hc = { avg: n(r.avg), max: n(r.max), min: n(r.min), kcal: n(r.kcal), kind: r.kind || '', at: Date.now() };
    if (!hc.avg && !hc.kcal) { if (cur.hc && !cur.hc.none) return; cur.hc = { none: true, at: Date.now() }; }   // nothing recorded (yet): the watch may sync later
    else { cur.hc = hc; if (window.Insights) window.Insights.autoFeel(cur); }      // the watch also tells how hard it was
    S.save(true);
    const box = document.querySelector('.feel[data-feel="' + id + '"]'); if (box && window.Insights) box.outerHTML = window.Insights.feelHtml(cur);   // the "how it felt" box, if it is on screen
    const t = A.top(); if ((t.name === 'sessionDetail' && t.params.id === id) || t.name === 'history') redraw();
  }
  // Opening a recent workout that has no watch data yet looks again (watches often sync a while after the workout).
  function opened(id) {
    const s = D.sessions.find(x => x.id === id); if (!s || !on()) return;
    if (s.hc && !s.hc.none) return;
    if (Date.now() - (s.end || s.start) > 7 * 86400000) return;
    if (Date.now() - (tried[id] || 0) < 60000) return;
    attach(id, true);
  }
  function detailHtml(s) {
    const h = s.hc;
    if (h && !h.none) {
      const tile = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
      return `<div class="hc">${h.avg ? tile('♥ ' + h.avg, 'average heart rate') : ''}${h.max ? tile(h.max, 'highest') : ''}${h.kcal ? tile(h.kcal, h.kind === 'total' ? 'kcal in total' : 'kcal burned') : ''}</div>
        <p class="xs dim" style="margin:-4px 2px 10px">From your watch, through Health Connect. Only you see this. <span class="accent" data-act="hcRefresh" data-id="${esc(s.id)}">Refresh</span></p>`;
    }
    if (!on()) return '';
    return `<p class="xs dim" style="margin:0 2px 10px">No heart rate or calories from your watch for this time${h && h.none ? ' yet' : ''}. <span class="accent" data-act="hcRefresh" data-id="${esc(s.id)}">Look again</span></p>`;
  }
  ACT.hcRefresh = async el => { toast('Asking Health Connect…'); await attach(el.dataset.id, true); const s = D.sessions.find(x => x.id === el.dataset.id); toast(s && s.hc && !s.hc.none ? 'Updated' : 'Nothing from your watch for that time yet'); };

  function settingsCard() {
    if (!N || !wOn()) return '';
    const st = status();
    const head = `<div class="card" id="hcCard"><h3>${window.SetKit ? window.SetKit.ic('watch', 16) : ''}Watch &amp; Google Health</h3>`;
    if (!st.available && st.install) return head + `<p class="small muted mt8">Heart rate and calories from your watch come through Health Connect, a free app from Google. This phone doesn't have it yet, or it needs an update.</p>
      <button class="btn primary block mt12" data-act="hcOpen">Get Health Connect</button><p class="xs dim mt8">Install it, then come back here and tap Connect.</p></div>`;
    if (!st.available) return head + `<p class="small muted mt8">Heart rate and calories from your watch need Health Connect, and this phone can't use it.</p></div>`;
    if (on()) return head + `<p class="small mt8"><span class="green">✓ Connected.</span> <span class="muted">After each workout GymDay adds the heart rate and calories your watch recorded while you were in the gym. Only you see them.</span></p>
      <div class="row mt12"><button class="btn grow" data-act="hcOff">Turn off</button><button class="btn grow" data-act="hcOpen">Open Health Connect</button></div>
      <p class="xs dim mt8">Nothing showing? Your watch's app (Samsung Health, Fitbit, Garmin Connect, Strava…) has to be set to share with Health Connect.</p>${autoRow(st)}${writeRow(st)}</div>`;
    return head + `<p class="small muted mt8">Add the heart rate and calories from your watch to each workout. GymDay reads them from Health Connect (Google Health) for the time you were in the gym.</p>
      <button class="btn primary block mt12" data-act="hcOn">Connect</button>
      ${st.asked && !st.granted ? `<button class="btn ghost block mt8" data-act="hcOpen">Allow it in Health Connect instead</button>` : ''}${autoRow(st)}${writeRow(st)}</div>`;
  }
  const autoRow = st => (window.HealthAuto && window.HealthAuto.row ? window.HealthAuto.row(st) : '');      // 1.24: automatic from the watch
  function turnedOn() {
    D.settings.health = true; S.save(true); toast('Connected to Health Connect');
    D.sessions.filter(s => !s.hc && Date.now() - (s.end || s.start) < 3 * 86400000).slice(0, 5).forEach(s => attach(s.id));   // the last few days too
    if (A.inSettings()) redraw();
  }
  ACT.hcOn = () => { if (status().granted) { turnedOn(); return; } try { N.hcRequest(); } catch (e) { toast('Could not open Health Connect'); } };
  ACT.hcOff = () => { D.settings.health = false; S.save(true); A.rerender(); toast('Turned off. Workouts keep what was already added.'); };
  ACT.hcOpen = () => { try { N.hcOpen(); } catch (e) { toast('Could not open Health Connect'); } };
  window.onHealthPerm = granted => {
    if (granted) turnedOn();
    else { toast('Not allowed. GymDay needs heart rate or calories to be switched on.'); if (A.inSettings()) redraw(); }
  };
  // ----- 88: finished workouts into Health Connect (this phone only; off until switched on) -----
  const writeOn = () => wOn() && !!N && !!N.hcWrite && M.hcWrite === true;
  function writeRow(st) {
    if (!N || !N.hcWrite) return '';
    const live = writeOn() && st.write, lost = writeOn() && !st.write;
    return `<div class="row mt12" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow">Put my workouts in Health Connect<div class="xs dim">${lost ? 'Not allowed any more in Health Connect. Switch it off and on to allow it again.'
      : 'Each finished workout, with its name, time and exercises, so other health apps see it. If your watch already records your gym sessions they will show twice.'}</div></div>
      <input type="checkbox" data-bind="optHcWrite" ${live ? 'checked' : ''} style="width:22px;height:22px"></div>${live && M.hcLast ? `<p class="xs dim">Last sent ${A.fmtDate(M.hcLast)} · ${A.fmtClock(M.hcLast)}</p>` : ''}`;
  }
  function ask(fn) {
    return new Promise(res => {
      const key = 'x' + S.uid(); waiting[key] = res;
      setTimeout(() => { if (waiting[key]) { delete waiting[key]; res({ ok: false, error: 'timeout' }); } }, 15000);
      try { fn(key); } catch (e) { delete waiting[key]; res({ ok: false, error: String(e) }); }
    });
  }
  // what goes to Health Connect for one workout: start and end, its name, and a short list of what was done
  function entryOf(s) {
    const start = s.start, end = Math.max(s.end || 0, start + Math.max(60000, S.gymMs(s)));
    if (!(start > 0) || S.gymMs(s) < 60000) return null;
    const parts = [];
    let sets = 0;
    for (const it of (s.items || [])) {
      if (it.skipped) continue;
      const n = (it.sets || []).filter(x => S.work(x)).length, ex = S.getEx(it.ex); if (!n || !ex) continue;
      sets += n; parts.push(`${ex.name} (${n})`);
    }
    if (!sets) return null;
    const notes = `${parts.length} exercise${parts.length === 1 ? '' : 's'}, ${sets} set${sets === 1 ? '' : 's'}: ${parts.join(', ')}. Logged with GymDay.`;
    return { id: s.id, start, end, title: s.dayName || 'Workout', notes };
  }
  let pushing = false, pushT = 0;
  async function push() {
    if (pushing || !writeOn()) return;
    const st = status(); if (!st.available) return;
    if (!st.write) return;
    pushing = true;
    try {
      const sent = M.hcSent || (M.hcSent = {}), from = M.hcFrom || 0;
      let n = 0, done = 0;
      for (const s of D.sessions) {
        if (n >= 20) break;
        if (s.est) continue;                     // v1.28: a workout estimated from the watch's own session is already in Health Connect
        if (!(s.id in sent) && (s.end || s.start) < from) continue;
        const e = entryOf(s); if (!e) continue;
        const sig = JSON.stringify([e.start, e.end, e.title, e.notes]);
        if (sent[s.id] === sig) continue;
        n++;
        const r = await ask(k => N.hcWrite(k, JSON.stringify(Object.assign({ v: Date.now() }, e))));
        if (r.ok) { sent[s.id] = sig; M.hcLast = Date.now(); S.saveMeta(); done++; }
        else { if (r.need) { M.hcWrite = false; S.saveMeta(); } break; }        // not allowed any more, or Health Connect is busy: stop for now
      }
      // workouts deleted in GymDay come out of Health Connect too (a few tries, then they are let go)
      const gone = Object.keys(sent).filter(id => !D.sessions.some(s => s.id === id)).slice(0, 50);
      if (gone.length && writeOn()) {
        const r = await ask(k => N.hcRemove(k, JSON.stringify(gone)));
        M.hcDelTries = r.ok ? 0 : (M.hcDelTries || 0) + 1;
        if (r.ok || M.hcDelTries > 3) { gone.forEach(id => delete sent[id]); M.hcDelTries = 0; }
        S.saveMeta();
      }
      if (done && A.inSettings()) redraw();                 // the "Last sent" line
    } finally { pushing = false; }
  }
  const pushSoon = () => { clearTimeout(pushT); pushT = setTimeout(push, 3000); };
  const after0 = A.afterRender; A.afterRender = name => { if (after0) after0(name); if (writeOn()) pushSoon(); };
  function writeStart() {
    M.hcWrite = true; if (!M.hcFrom) M.hcFrom = Date.now() - 7 * 86400000;      // the last week's workouts go too
    S.saveMeta(); toast('Your workouts will go to Health Connect'); push();
    const cb = $('[data-bind="optHcWrite"]'); if (cb) cb.checked = true;
    if (A.inSettings()) A.rerender();                     // the switch was just tapped, so it has the focus: draw it again anyway
  }
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bind !== 'optHcWrite') return;
    if (!t.checked) { M.hcWrite = false; S.saveMeta(); toast('Turned off. What is already in Health Connect stays there.'); A.rerender(); return; }
    t.checked = false;                                                      // on only once Health Connect says yes
    if (status().write) { writeStart(); return; }
    try { N.hcWriteAsk(); } catch (ex) { toast('Could not open Health Connect'); }
  });
  window.onHealthWritePerm = ok => { if (ok) writeStart(); else { toast('Not allowed. GymDay needs "Exercise" switched on for writing in Health Connect.'); if (A.inSettings()) redraw(); } };

  // Health Connect's "why does this app want my data" link lands here.
  window.showHealthPrivacy = () => A.openSheet(`<h2>GymDay and your health data</h2>
    <p class="muted">GymDay reads two things from Health Connect for the time of each workout you log: <b>heart rate</b> and <b>calories burned</b>. It adds the average and highest heart rate and the calories to that workout.</p>
    <p class="muted mt8">Only if you switch on <b>Automatic from your watch</b>, it also reads, for today and the last few days: <b>sleep</b> (how long, bedtime, wake-up and the stages), <b>resting heart rate</b>, <b>heart rate variability</b>, <b>blood oxygen</b> and <b>breathing rate</b> from the night, and the day's <b>steps</b> and <b>calories</b>. They fill in Recovery, your readiness score and Burnt on the Food tab, so you don't need screenshots. Each kind can be allowed or not in Health Connect.</p>
    <p class="muted mt8">The numbers are saved on this phone and, if you signed in, in your own GymDay account. Club mates never see them. Nothing is sold, used for ads, or used for anything else.</p>
    <p class="muted mt8">GymDay writes to Health Connect only if you switch on <b>Put my workouts in Health Connect</b>: then each finished workout goes there as a strength-training session with its name, its start and end, and a list of its exercises, so your other health apps can see it. Deleting the workout in GymDay takes it out again.</p>
    <p class="muted mt8">You can turn it off in Settings, or take the permission back in Health Connect, at any time.</p>
    <button class="btn primary block mt16" data-act="closeSheet">OK</button>`);

  // ----- body weight readings from Health Connect (a scale or a watch app puts them there) -----
  function weightButton() {
    if (!N || !N.hcWeight || !status().available || !wOn()) return '';
    return `<button class="btn block mt12" data-act="hcWeight">Bring in from Health Connect</button><p class="xs dim mt8">Reads the weights your scale or watch app saved there in the last 3 months.</p>`;
  }
  function pullWeight() {
    const key = 'w' + S.uid();
    waiting[key] = r => {
      if (r.need) { try { N.hcWeightAsk(); } catch (e) { toast('Could not open Health Connect'); } return; }
      if (!r.ok) { toast('Could not read from Health Connect'); return; }
      const perKg = D.settings.unit === 'lb' ? 2.20462 : 1; let n = 0;
      (r.items || []).forEach(x => { if (x && x.kg > 0 && window.Insights.addWeight(x.kg * perKg, x.t, 'hc')) n++; });
      toast(n ? `${n} weight${n > 1 ? 's' : ''} added` : ((r.items || []).length ? 'Nothing new in Health Connect' : 'No weights in Health Connect yet'));
      if (A.top().name === 'body') A.rerender();
    };
    setTimeout(() => { if (waiting[key]) { delete waiting[key]; toast('Health Connect did not answer'); } }, 15000);
    try { N.hcWeight(key); } catch (e) { delete waiting[key]; toast('Could not read from Health Connect'); }
  }
  ACT.hcWeight = () => { toast('Asking Health Connect…'); pullWeight(); };
  window.onHealthWeightPerm = ok => { if (ok) pullWeight(); else toast('Not allowed. GymDay needs "Weight" switched on in Health Connect.'); };

  if (writeOn()) setTimeout(push, 4000);
  window.Health = { attach, opened, detailHtml, settingsCard, weightButton, entryOf, push, writeOn, native: () => N, status, ask, on, turnedOn };
})();
