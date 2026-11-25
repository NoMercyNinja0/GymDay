/* GymDay 1.24 · automatic from your watch (hcauto.js).
   Last night's sleep with its stages, the night's resting heart rate, HRV, blood oxygen and breathing, and the day's steps and
   calories come in from Health Connect by themselves: no screenshots. Off until switched on in Settings → Watch & Google Health;
   it only ever reads. Three rules keep it honest:
   1. What the person typed, or read from screenshots, always wins: a night's number is only filled in or refreshed while it is
      still the one Health Connect put there (`hcv` on the night keeps what it wrote), and a day's numbers only while the day's
      record is Health Connect's own (`hc: 1` and not `typed`).
   2. What the person removed stays removed (`meta.hcD` / `meta.hcN` remember what was filled in on this phone).
   3. Calories are checked before they count: the watch's total is used when its resting part looks like a body's (against the
      app's own resting burn); otherwise only the active calories are, on top of the app's resting burn. Today is counted up to the
      newest thing the watch sent (`upto`), and the rest of the day at the usual pace, as with screenshots (1.21.8).
   On the phone the native side answers through window.Android.hcDay; tests install a stand-in as window.__health. */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta, H = window.Health;
  const { $, esc, ACT } = A;
  const toast = m => window.toast(m);
  const N = H && H.native ? H.native() : null;
  const st = () => (H && H.status ? H.status() : {});
  const KINDS = [['sleep', 'sleep'], ['rest', 'resting heart rate'], ['hrv', 'heart rate variability'], ['spo2', 'blood oxygen'], ['br', 'breathing rate'], ['steps', 'steps'], ['active', 'active calories'], ['total', 'total calories'], ['hr', 'heart rate']];
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const can = () => wOn() && !!N && !!N.hcDay && st().available === true;
  const perm = () => st().perm || {};
  // enough to be worth switching on: something beyond the workouts' heart rate, which the plain connection already reads
  const some = p => KINDS.some(([k]) => k !== 'hr' && p && p[k] === true);
  const on = () => D.settings.hcAuto === true && can() && some(perm());
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const pad = n => String(n).padStart(2, '0');
  const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const next = t0 => { const d = new Date(t0); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime(); };
  const back = (t0, n) => { const d = new Date(t0); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime(); };
  const tOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const minOfDay = ms => { const d = new Date(ms); return d.getHours() * 60 + d.getMinutes(); };
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  const clock24 = ts => (A.fmtClock ? A.fmtClock(ts) : new Date(ts).toTimeString().slice(0, 5));         // as the Settings card's other lines
  const clock = ts => { const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes(), ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return `${h}:${m < 10 ? '0' : ''}${m} ${ap}`; };   // as the Food tab says times
  // the apps that are known by their package name; any other shows as Health Connect alone
  const APPS = { 'com.sec.android.app.shealth': 'Samsung Health', 'com.fitbit.FitbitMobile': 'Fitbit', 'com.google.android.apps.fitness': 'Google Fit', 'com.garmin.android.apps.connectmobile': 'Garmin Connect',
    'com.huami.watch.hmwatchmanager': 'Zepp', 'com.xiaomi.wearable': 'Mi Fitness', 'com.whoop.android': 'WHOOP', 'com.withings.wiscale2': 'Withings', 'fi.polar.polarflow': 'Polar Flow', 'com.urbandroid.sleep': 'Sleep as Android', 'com.heytap.health.international': 'OHealth', 'com.heytap.health': 'OHealth' };
  const appName = pkg => (APPS[pkg] ? APPS[pkg] + ' · ' : '') + 'Health Connect';
  const num = (v, lo, hi) => (typeof v === 'number' && isFinite(v) && v >= lo && v <= hi ? v : 0);

  // ---------------------------------------------------------------- one night → D.checks (the morning it ended)
  const NIGHT = ['sleep', 'bed', 'wake', 'deep', 'rem', 'light', 'awake'], HEART = ['rest', 'hrv', 'spo2', 'br'];
  const has = (c, k) => !!c && c[k] != null && (k === 'bed' || k === 'wake' ? true : c[k] > 0);
  /** What Health Connect has for the night, in the night's own fields; a number outside what the form allows is left out. */
  function nightOf(r) {
    const o = {}, n = r && r.night;
    if (n && num(n.min, 30, 960)) {
      o.sleep = Math.round(n.min);
      if (n.start > 0 && n.end > n.start) { o.bed = minOfDay(n.start); o.wake = minOfDay(n.end); }
      if (n.staged) { for (const [k, hi] of [['deep', 600], ['rem', 600], ['light', 900], ['awake', 600]]) if (num(n[k], 1, hi)) o[k] = Math.round(n[k]); }
      o.app = appName(n.app || '');
    }
    if (num(r && r.rest, 25, 130)) o.rest = Math.round(r.rest);
    if (num(r && r.hrv, 5, 300)) o.hrv = Math.round(r.hrv);
    if (num(r && r.spo2, 70, 100)) o.spo2 = Math.round(r.spo2);
    if (num(r && r.br, 5, 40)) o.br = Math.round(r.br * 10) / 10;
    return o;
  }
  function applyNight(t0, r, now) {
    const key = keyOf(t0), got = nightOf(r);
    if (!Object.keys(got).length) return false;
    let c = (D.checks || []).find(x => x.d === key) || null;
    const filled = M.hcN && M.hcN[key];
    if (!c && filled) return false;                                   // it was filled in here before and the person cleared it
    const hv = (c && c.hcv) || {}, before = c ? JSON.stringify(c) : '';
    // a field may be written while it is empty and was never Health Connect's, or still holds what Health Connect put there
    const free = k => (has(c, k) ? hv[k] === c[k] : hv[k] == null);
    const w = {};
    if (got.sleep && free('sleep')) {                                 // the sleep and what belongs to it go together, or not at all
      w.sleep = got.sleep;
      for (const k of NIGHT) if (k !== 'sleep' && free(k)) w[k] = got[k] != null ? got[k] : null;
    }
    for (const k of HEART) if (got[k] && free(k)) w[k] = got[k];
    if (!Object.keys(w).length) return false;
    if (!c) { c = { id: 'chk-' + key.replace(/-/g, ''), d: key }; (D.checks = D.checks || []).push(c); }
    const nv = Object.assign({}, c.hcv || {});
    for (const k of Object.keys(w)) { if (w[k] == null) { if (hv[k] != null) { delete c[k]; delete nv[k]; } } else { c[k] = w[k]; nv[k] = w[k]; } }
    if (w.sleep) { c.sby = 'watch'; c.sapp = got.app; }
    c.hcv = nv;
    if (JSON.stringify(c) === before) return false;
    c.at = now; (M.hcN = M.hcN || {})[key] = now;
    return true;
  }

  // ---------------------------------------------------------------- one day → D.acts
  /** The calories of the day as the app counts them: { kt } the watch's total, or { ka } its active calories; neither when unsure. */
  function energyOf(r, t0, now) {
    const C = window.Calories, t1 = next(t0), end = r.upto > t0 ? Math.min(r.upto, t1) : Math.min(t1, now), part = Math.max(0, Math.min(1, (end - t0) / (t1 - t0)));
    const restDay = C && C.rest ? C.rest(t0) : null, rest = restDay != null ? restDay * part : null;
    const act = num(r.active, 1, 7000), tot = num(r.total, 1, 9000);
    if (tot && act) {
      // the total's resting part should look like a body's: between 0.6 and 1.6 times the app's own resting burn for those hours
      const basal = tot - act;
      if (rest != null ? basal >= rest * 0.6 && basal <= rest * 1.6 : basal >= 300 * part) return { kt: Math.round(tot), ka: Math.round(act) };
      return { ka: Math.round(act) };
    }
    if (act) return { ka: Math.round(act) };
    // a total alone: Android can estimate one with no watch at all, so it counts only when a heart rate shows a watch was on,
    // and when it is the size of a whole body's day so far
    if (tot && r.avg > 0 && (rest != null ? tot >= rest * 0.85 && tot <= rest * 3 : tot >= 800 * part)) return { kt: Math.round(tot) };
    return {};
  }
  function dayOf(r, t0, now) {
    const o = Object.assign({}, energyOf(r, t0, now));
    if (num(r.steps, 1, 200000)) o.steps = Math.round(r.steps);
    if (num(r.rest, 25, 130)) o.rest = Math.round(r.rest);
    if (num(r.avg, 25, 230)) o.avg = Math.round(r.avg);
    if (num(r.max, 25, 250)) o.max = Math.round(r.max);
    if (num(r.min, 20, 230)) o.min = Math.round(r.min);
    return o;
  }
  // the same numbers: `at` (when they were brought in) and `u` (the store's own stamp for syncing) are not numbers of the day
  const same = (a, b) => { const x = Object.assign({}, a), y = Object.assign({}, b); delete x.at; delete y.at; delete x.u; delete y.u; return JSON.stringify(Object.keys(x).sort().map(k => [k, x[k]])) === JSON.stringify(Object.keys(y).sort().map(k => [k, y[k]])); };
  function applyDay(t0, r, now) {
    const key = keyOf(t0), t1 = next(t0), list = (D.acts = D.acts || []), i = list.findIndex(a => a.d === key), old = i >= 0 ? list[i] : null;
    if (old && (!old.hc || old.typed)) return false;                  // typed, or read from screenshots: theirs
    if (!old && M.hcD && M.hcD[key]) return false;                    // brought in here before, and the person removed it
    const got = dayOf(r, t0, now);
    if (!got.kt && !got.ka && !got.steps) return false;               // nothing a day's record is made of
    const rec = Object.assign({ id: 'act-' + key.replace(/-/g, ''), d: key, hc: 1, app: 'Health Connect' }, got, { at: now });
    if (!got.kt) delete rec.kt; if (got.kt && got.ka >= got.kt) delete rec.ka;
    // today: counted up to the newest thing the watch sent (see cutOf in calories.js); a finished day is the whole day
    if (now < t1 && (rec.kt || rec.ka)) { if (r.upto > t0 && r.upto <= now) rec.upto = Math.round(r.upto); } else if (now >= t1) rec.whole = 1;
    if (old && same(old, rec)) return false;
    if (i >= 0) list[i] = rec; else list.push(rec);
    (M.hcD = M.hcD || {})[key] = now;
    return true;
  }

  // ---------------------------------------------------------------- asking and bringing in
  const read = t0 => H.ask(k => N.hcDay(k, String(t0), String(next(t0))));
  let busy = null;
  const redraw = () => { const a = document.activeElement; if (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName)) return; if (!$('#sheet').classList.contains('hidden')) return; A.rerender(); };
  /** The days to ask about: today and the two before (data often arrives late), the last 7 the first time, and any day of the
      last 30 that was brought in before it was over. */
  function daysToRead(now, first) {
    const t = day0(now), out = [];
    for (let i = 0; i < (first ? 7 : 3); i++) out.push(back(t, i));
    for (const a of D.acts || []) {
      if (!a.hc || a.typed || a.whole || out.length >= 10) continue;
      const t0 = tOf(a.d); if (t0 >= back(t, 30) && t0 < t && !out.includes(t0) && (a.upto || a.at) < next(t0)) out.push(t0);
    }
    return out;
  }
  function tidy(now) {
    for (const m of [M.hcD, M.hcN]) if (m) for (const k of Object.keys(m)) if (now - tOf(k) > 45 * 86400000) delete m[k];
  }
  function seen(now) {
    const t = day0(now), a = (D.acts || []).find(x => x.d === keyOf(t) && x.hc && !x.typed), c = (D.checks || []).find(x => x.d === keyOf(t) && x.hcv);
    const parts = [];
    if (c && c.hcv.sleep && c.sleep === c.hcv.sleep) parts.push(`sleep ${hm(c.sleep)}`);
    if (c && c.hcv.rest && c.rest === c.hcv.rest) parts.push(`resting ♥ ${c.rest}`);
    if (a && a.steps) parts.push(`${n0(a.steps)} steps`);
    if (a && (a.kt || a.ka)) parts.push(a.kt ? `${n0(a.kt)} kcal` : `${n0(a.ka)} active kcal`);
    return parts.join(' · ');
  }
  /** Asks Health Connect and files what it has. Answers { ok, changed, days, got } (got: days that had anything). */
  function sync(opt) {
    opt = opt || {};
    if (busy) return busy;
    if (!on()) return Promise.resolve({ ok: false, off: true });
    const now0 = Date.now();
    busy = (async () => {
      let changed = 0, got = 0, ok = 0;
      const first = !M.hcAutoAt || opt.first, days = opt.day != null ? [opt.day] : daysToRead(now0, first);
      for (const t0 of days) {
        let r; try { r = await read(t0); } catch (e) { r = null; }
        if (!r || !r.ok) continue;
        ok++;
        const now = Date.now();
        if (r.night || r.rest || r.hrv || r.spo2 || r.br || r.steps || r.active || r.total) got++;
        if (applyNight(t0, r, now)) changed++;
        if (applyDay(t0, r, now)) changed++;
      }
      const now = Date.now();
      if (ok) { M.hcAutoAt = now; M.hcAutoGot = got; tidy(now); S.saveMeta(); }
      if (changed) { S.save(true); redraw(); } else if (A.inSettings && A.inSettings()) redraw();
      return { ok: ok > 0, changed, days: days.length, got };
    })();
    const p = busy; p.then(() => { busy = null; }, () => { busy = null; });
    return p;
  }
  const due = () => on() && Date.now() - (M.hcAutoAt || 0) > 10 * 60000;
  const soon = ms => setTimeout(() => { if (due()) sync(); }, ms);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') soon(600); });
  const after0 = A.afterRender; A.afterRender = name => { if (after0) after0(name); if ((name === 'days' || name === 'calories' || name === 'recovery') && due()) soon(300); };

  // ---------------------------------------------------------------- switching it on and off
  function started() {
    D.settings.hcAuto = true; S.save(true);
    const p = perm(); if ((p.hr || p.active) && H.turnedOn && D.settings.health !== true) { D.settings.health = true; S.save(true); }     // the workouts' heart rate and calories too
    toast('Automatic is on: bringing in the last 7 days');
    sync({ first: true }).then(r => { if (r && r.ok) toast(r.changed ? 'Brought in from your watch' : r.got ? 'Up to date' : "Connected. Nothing from your watch in Health Connect yet"); });
    if (A.inSettings && A.inSettings()) A.rerender();
  }
  function ask() { try { if (N.hcAutoAsk) N.hcAutoAsk(); else N.hcRequest(); } catch (e) { toast('Could not open Health Connect'); } }
  window.onHealthAutoPerm = json => {
    let p = json; try { if (typeof json === 'string') p = JSON.parse(json); } catch (e) { p = {}; }
    if (some(p)) started();
    else { toast('Not allowed. Switch on what GymDay may read in Health Connect.'); if (A.inSettings && A.inSettings()) A.rerender(); }
  };
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bind !== 'optHcAuto') return;
    if (!t.checked) { D.settings.hcAuto = false; S.save(true); toast('Turned off. What was already brought in stays.'); A.rerender(); return; }
    t.checked = false;                                                // on only once Health Connect says yes
    const p = perm();
    if (['sleep', 'steps', 'rest', 'hrv'].some(k => p[k])) { started(); return; }      // already allowed (an earlier yes): no need to ask again
    ask();
  });
  ACT.hcAutoNow = async () => {
    if (!on()) { toast('Automatic from your watch is off (Settings → Watch & Google Health)'); return; }
    toast('Asking Health Connect…');
    const r = await sync({ force: true });
    toast(!r || !r.ok ? 'Health Connect did not answer' : r.changed ? 'Brought in from your watch' : r.got ? 'Already up to date' : 'Nothing from your watch in Health Connect yet');
  };
  // 1.32: "Turn on automatic" from Sleep from your watch: the same as switching it on in Settings
  function turnOn() { const p = perm(); if (['sleep', 'steps', 'rest', 'hrv'].some(k => p[k])) { started(); return true; } ask(); return false; }
  ACT.hcAutoAllow = () => { if (st().asked && N.hcOpen) { try { N.hcOpen(); } catch (e) { ask(); } } else ask(); };
  // a day the person removed can be brought in again from its own card
  ACT.hcAutoDay = async el => {
    const t0 = +el.dataset.t; if (!t0 || !on()) return;
    if (M.hcD) delete M.hcD[keyOf(t0)]; S.saveMeta(); toast('Asking Health Connect…');
    const r = await sync({ day: t0 });
    toast(r && r.changed ? 'Brought in from your watch' : 'Nothing from your watch for that day');
  };

  // ---------------------------------------------------------------- what the screens show
  /** The row on Settings → Watch & Google Health. */
  function row() {
    if (!can()) return '';
    const live = on(), p = perm(), miss = live ? KINDS.filter(([k]) => p[k] !== true && k !== 'hr' && k !== 'total' && k !== 'active').map(x => x[1]) : [];
    if (live && !p.active && !p.total) miss.push('calories');
    const at = M.hcAutoAt, s = live ? seen(Date.now()) : '';
    return `<div class="row mt12" id="hcAutoRow" style="padding:6px 0;border-top:1px solid var(--line)"><div class="grow">Automatic from your watch<div class="xs dim">Last night's sleep, resting heart rate and HRV, and the day's steps and calories come in by themselves from Health Connect. No screenshots. What you type always wins.</div></div>
      <input type="checkbox" data-bind="optHcAuto" ${live ? 'checked' : ''} style="width:22px;height:22px" aria-label="Automatic from your watch"></div>
      ${live ? `<p class="xs dim" id="hcAutoLine">${at ? `Last brought in ${esc(A.fmtDate(at))} · ${esc(clock24(at))}${s ? `. Today: ${esc(s)}.` : M.hcAutoGot ? '.' : ". Nothing from your watch yet: its app (Samsung Health, Fitbit, Garmin Connect, Zepp…) has to be set to share with Health Connect."}` : 'Bringing in…'}</p>
        ${miss.length ? `<p class="xs dim mt4" id="hcAutoMiss">Not allowed yet: ${esc(miss.join(', '))}.</p>` : ''}
        <div class="row mt8" style="gap:8px"><button class="btn sm grow" data-act="hcAutoNow">Bring in now</button>${miss.length ? '<button class="btn sm grow" data-act="hcAutoAllow">Allow more</button>' : ''}</div>` : ''}`;
  }
  /** Under "Your day, from your watch" on the Food tab: where the numbers came from, or how to get a removed day back. */
  function dayNote(a, t0) {
    if (a && a.hc && !a.typed) {
      const c = window.Calories && window.Calories.cutOf ? window.Calories.cutOf(a, t0, next(t0)) : null;
      return `<div class="xs muted" id="hcDayNote">Automatic · Health Connect${c != null ? ` · up to ${esc(clock(c))}` : ''}</div>`;
    }
    if (a || !on()) return '';
    return M.hcD && M.hcD[keyOf(t0)] ? `<button class="btn block ghost mt8" data-act="hcAutoDay" data-t="${t0}">↻ Bring it in from Health Connect again</button>`
      : `<p class="xs dim mt8" id="hcDayNone">Automatic is on, and Health Connect has nothing from your watch for ${t0 === day0(Date.now()) ? 'today yet' : 'that day'}. <span class="accent" data-act="hcAutoNow">Look again</span></p>`;
  }
  /** In the day's sheet, in place of the "these numbers are up to" control: Health Connect keeps that time itself. */
  function uptoNote(rec, t0) {
    const c = window.Calories.cutOf(rec, t0, next(t0));
    return `<p class="xs dim mt12" id="hcUpto">${c != null ? `Brought in by itself from Health Connect: counted up to ${esc(clock(c))}, the newest your watch sent, with the rest of the day at your usual pace. It updates when your watch sends more.`
      : 'Brought in by itself from Health Connect, for the whole day.'} Remove it, or add screenshots or type the numbers, and yours are used instead.</p>`;
  }
  /** On Recovery, when last night is still empty: nothing came yet, or the person cleared what came. */
  function nightNote() {
    if (!on()) return '';
    const key = keyOf(day0(Date.now()));
    return M.hcN && M.hcN[key] ? `<p class="xs dim mt8" id="hcNightNone">You cleared last night's numbers, so they are not brought in again by themselves. <span class="accent" data-act="hcAutoNight">Bring them in again</span></p>`
      : `<p class="xs dim mt8" id="hcNightNone">Automatic is on, and Health Connect has no sleep from your watch for last night yet. <span class="accent" data-act="hcAutoNow">Look again</span></p>`;
  }
  /** A night brought in now because the person asked for it (Recovery's "Bring them in again", 1.35.2's ⌚ on Today's sleep
      sheet): what they cleared before may be filled in again. Answers sync's { ok, changed, days, got }. */
  function night(t0) {
    if (!on()) return Promise.resolve({ ok: false, off: true });
    const key = keyOf(t0), c = (D.checks || []).find(x => x.d === key);
    if (M.hcN) delete M.hcN[key]; S.saveMeta();
    if (c && c.hcv) { for (const k of Object.keys(c.hcv)) if (!has(c, k)) delete c.hcv[k]; }        // what was cleared may be filled in again
    return sync({ day: t0 });
  }
  ACT.hcAutoNight = async () => {
    if (!on()) return;
    toast('Asking Health Connect…');
    const r = await night(day0(Date.now()));
    toast(r && r.changed ? 'Brought in from your watch' : 'Nothing from your watch for last night');
  };
  const mine = rec => !!(rec && rec.hc && !rec.typed);

  if (on()) setTimeout(() => { if (due()) sync(); }, 2500);
  window.HealthAuto = { turnOn, on, can, sync, night, applyNight, applyDay, energyOf, nightOf, dayOf, daysToRead, row, dayNote, uptoNote, nightNote, mine, KINDS, APPS };
})();
