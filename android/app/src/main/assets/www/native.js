/* GymDay – the parts that live outside the app's own screen: the running workout on the lock screen and in the
   capsule at the top (Android 16 Live Updates), gym reminders, the home-screen widget and the optional fingerprint lock.
   The Android shell does the real work through window.Android; in a plain browser none of this exists
   (tests install a stand-in as window.__native). */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta;
  const { $, esc, ACT } = A;
  const toast = m => window.toast(m);
  const N = S.isAndroid ? window.Android : (window.__native || null);
  const has = f => !!N && typeof N[f] === 'function';
  const call = (f, ...args) => { try { return N[f](...args); } catch (e) { return undefined; } };

  // ---------------- running workout: lock screen + capsule ----------------
  let lastW = D.active ? '' : 'none';
  let lastStill = -1;
  function workoutSync() {
    const a = D.active;
    if (has('stillAt') && window.Extras) {            // a "still training?" notification if the workout is left running
      const at = a ? window.Extras.lastTouch(a) + window.Extras.STILL_MS : 0;
      if (at !== lastStill) { lastStill = at; call('stillAt', String(at)); }
    }
    if (!has('workoutCard')) return;
    if (!a || M.lockNote === false) { if (lastW !== 'none') { lastW = 'none'; call('workoutClear'); } return; }
    const card = cardOf(a), sig = JSON.stringify(card);
    if (sig === lastW) return;
    if (has('notifAllowed') && !call('notifAllowed') && !M.notifAsked) { M.notifAsked = true; S.saveMeta(); call('notifAsk'); }   // Android 13+ asks once
    lastW = sig;
    call('workoutCard', sig);
  }
  // What the capsule's card (and the widget, during a workout) shows. The timer counts by itself from `base`;
  // while paused it stands still at `elapsed`. btns: up to three [what, label] pairs, handed back to noteAction(what).
  function cardOf(a) {
    const q = A.quickState();
    const btns = q.paused ? [['resume', 'Resume'], ['finish', 'Finish workout']]
      : [q.canTick && ['tick', 'Tick set ✓'], q.canNext && ['next', q.nextLabel], q.allDone && ['finish', 'Finish workout'], ['pause', 'Pause']].filter(Boolean).slice(0, 3);
    return { title: a.dayName || 'Workout', text: q.text, chip: q.chip, base: a.start + (a.paused || 0), paused: q.paused, elapsed: q.paused ? S.liveMs(a) : 0,
      done: q.done, total: q.total, segs: q.segs, btns };
  }
  // A button on the card or the widget was pressed. Runs even while the app is not on screen.
  window.noteAction = what => {
    const a = D.active, r = A.quick(String(what));
    if (r === 'saved' && a) {
      const sets = a.items.reduce((n, it) => n + (it.skipped ? 0 : it.sets.filter(s => s.done).length), 0);
      if (has('workoutSaved')) call('workoutSaved', (a.dayName || 'Workout') + ' saved', `${A.fmtDur(S.gymMs(a))} in the gym · ${sets} set${sets === 1 ? '' : 's'}. Tap to see how it went.`);
    } else if (r === 'empty' && has('noteToast')) call('noteToast', 'No set is ticked yet, so there is nothing to save');
    syncAll();
    return r;
  };
  // The widget's Start button: open today's day, ready to start (or the running workout, if there is one).
  window.onWidgetStart = id => {
    if (D.active) { A.reset('days'); A.go('session'); return; }
    A.closeSheet(); A.reset('days');
    if (id === 'today') id = todayDay();          // the app-icon shortcut
    if (id && S.getDay(id)) ACT.startDay({ dataset: { id: String(id) } });
  };
  // Today's day: the one the weekly plan has for today; with no plan, the day after the last one trained, in the order of the list.
  function todayDay() {
    if (!D.days.length) { toast('Make a day first'); return ''; }
    if (D.settings.schedule) {
      const id = (D.settings.week || {})[new Date().getDay()];
      if (id && S.getDay(id)) return id;
      toast('Today is a rest day in your plan'); return '';
    }
    const last = D.sessions[0], i = last ? D.days.findIndex(d => d.id === last.dayId) : -1;
    return D.days[(i + 1) % D.days.length].id;
  }
  // The other app-icon shortcuts: Log body weight, Add food.
  window.onShortcut = to => {
    A.closeSheet();
    if (to === 'weight') { A.reset('history', 'body'); setTimeout(() => { const i = $('#bodyIn'); if (i) i.focus(); }, 350); }
    else if (to === 'food' && ACT.kcAddHome) { A.reset('days'); ACT.kcAddHome(); }
    else if (to === 'foodtab' && ACT.openCalories) { A.reset('days'); ACT.openCalories(); }                   // v1.20: the Food widget, the protein reminder
    else if (to === 'supps' && window.Supps) { A.reset('days'); A.go('supps', { day: window.Supps.today() }); }      // v1.20: a supplement reminder
    else if (to === 'mealphoto' && ACT.mealTile) { A.reset('days'); if (ACT.openCalories) ACT.openCalories(); ACT.mealTile(); }      // v1.28: the Meal photo tile
  };
  ACT.capsuleFix = () => call('capsuleOpen');
  window.onNotifPerm = ok => { if (ok) { lastW = ''; workoutSync(); } if (A.inSettings()) A.rerender(); };
  ACT.notifFix = () => { if (!M.notifAsked && has('notifAsk')) { M.notifAsked = true; S.saveMeta(); call('notifAsk'); } else call('notifOpen'); };

  // ---------------- home-screen widget ----------------
  let lastWid = '';
  function widgetSync() {
    if (!has('widgetData')) return;
    const ws = A.weekStartOf(Date.now()), n = A.doneIn ? A.doneIn(ws, Infinity) : D.sessions.filter(s => s.start >= ws).length, g = D.settings.weekGoal == null ? 3 : +D.settings.weekGoal || 0;
    const d0 = new Date(ws), wk = `week of ${d0.getDate()} ${A.MONTHS_LONG[d0.getMonth()].slice(0, 3)}`;
    const l1 = g ? `${n} of ${g} workouts · ${wk}` : `${n} workout${n === 1 ? '' : 's'} · ${wk}`;
    // with a weekly schedule the widget works out "Today: …" by itself, so it is still right after midnight
    const sched = !!D.settings.schedule && !D.active;
    const l2 = D.active ? 'Workout in progress: ' + D.active.dayName : D.sessions[0] ? `Last: ${D.sessions[0].dayName}` : 'Tap to start your first workout';
    // the full widget: which days of this week were trained (Monday first), the day planned for each weekday
    // (Sunday first, as the phone counts them) so it can show and start today's day by itself, and the running workout
    const days = [0, 0, 0, 0, 0, 0, 0]; D.sessions.forEach(s => { if (s.start >= ws) days[Math.min(6, Math.floor((s.start - ws) / 86400000))] = 1; });
    if (window.Sports && window.Sports.showMode() === 'goal') (D.sports || []).forEach(x => { if (x.t >= ws && +x.mins >= window.Sports.GOAL_MIN) days[Math.min(6, Math.floor((x.t - ws) / 86400000))] = 1; });     // v1.17
    const wkd = D.settings.week || {}, plan = [0, 1, 2, 3, 4, 5, 6].map(i => { const d = D.settings.schedule && wkd[i] && S.getDay(wkd[i]); return d ? { id: d.id, name: d.name } : null; });
    const data = { l1, l2, sched, n, goal: g, ws, days, plan, last: D.sessions[0] ? D.sessions[0].dayName : '', w: D.active ? cardOf(D.active) : null };
    const sig = JSON.stringify(data); if (sig === lastWid) return; lastWid = sig;
    call('widgetData', sig);
  }

  // ---------------- gym reminders (need the weekly schedule) ----------------
  let lastRem = '';
  function remindersSync() {
    if (!has('remindersSet')) return;
    const wk = D.settings.week || {}, days = [0, 1, 2, 3, 4, 5, 6].map(n => { const d = D.settings.schedule && wk[n] && S.getDay(wk[n]); return d ? d.name : ''; });
    const [h, m] = String(D.settings.remindAt || '17:00').split(':').map(Number);
    const cfg = JSON.stringify({ on: !!(D.settings.remind && D.settings.schedule), mins: (h || 0) * 60 + (m || 0), days });
    if (cfg === lastRem) return; lastRem = cfg;
    call('remindersSet', cfg);
  }

  // ---------------- v1.20: the Food widget, supplement reminders and the evening protein reminder ----------------
  const pad2 = n => String(n).padStart(2, '0');
  const dayKey = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const t0Now = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
  let lastFood = '', lastNudge = '', lastSupp = '';
  function foodNow() {
    const C = window.Calories, F = window.Food; if (!C || !F || !C.dayOf || !F.targets) return null;
    const t0 = t0Now(), d = C.dayOf(t0), tg = F.targets(t0);
    return { d, tg };
  }
  function foodSync() {
    if (!has('foodWidgetData')) return;
    const x = foodNow(); if (!x) return;
    const o = { day: dayKey(Date.now()), kcal: Math.round(x.d.eaten), kt: x.tg ? Math.round(x.tg.kcal) : 0, p: Math.round(x.d.protein * 10) / 10, pt: x.tg ? Math.round(x.tg.p) : 0 };
    const sig = JSON.stringify(o); if (sig === lastFood) return; lastFood = sig;
    call('foodWidgetData', sig);
  }
  const nudgeOn = () => D.settings.pNudge !== false && !!(window.Calories && window.Calories.on());
  function nudgeSync() {
    if (!has('proteinNudgeSet')) return;
    const x = foodNow(); if (!x) return;
    const [h, m] = String(D.settings.pNudgeAt || '19:00').split(':').map(Number);
    const o = { on: nudgeOn() && !!(x.tg && x.tg.p > 0), mins: (h || 0) * 60 + (m || 0), day: x.d.food.length ? dayKey(Date.now()) : '', got: Math.round(x.d.protein), goal: x.tg ? Math.round(x.tg.p) : 0 };
    const sig = JSON.stringify(o); if (sig === lastNudge) return; lastNudge = sig;
    call('proteinNudgeSet', sig);
  }
  function suppSync() {
    if (!has('suppRemindSet') || !window.Supps || !window.Supps.reminders) return;
    const list = window.Supps.reminders(14), sig = JSON.stringify(list); if (sig === lastSupp) return; lastSupp = sig;
    if (list.length && has('notifAllowed') && !call('notifAllowed') && !M.notifAsked) { M.notifAsked = true; S.saveMeta(); call('notifAsk'); }
    call('suppRemindSet', sig);
  }

  // ---------------- v1.25: the Today widget and the morning brief: one JSON for both (see Brief.java) ----------------
  // "day" is the day this was written on: readiness, what was eaten and "done" are only true for that day. "plan" is what is
  // known ahead (the planned workout and the calorie target of today and the seven days after), so the brief is right on a
  // morning when the app has not been opened yet. Readiness needs last night's sleep, so it is only ever said for "day".
  let lastToday = '', todayT = null;
  const briefOn = () => D.settings.brief !== false;
  const briefMin = () => { const m = /^(\d\d):(\d\d)$/.exec(String(D.settings.briefAt || '07:00')); return m ? Math.min(1439, (+m[1]) * 60 + (+m[2])) : 420; };
  // v1.27: the evening wrap-up (Wrap.java), on at 9 pm to start with (the owner's choice)
  const wrapOn = () => D.settings.wrap !== false;
  const wrapMin = () => { const m = /^(\d\d):(\d\d)$/.exec(String(D.settings.wrapAt || '21:00')); return m ? Math.min(1439, (+m[1]) * 60 + (+m[2])) : 1260; };
  function todayData(now) {
    now = now || Date.now();
    const C = window.Calories, F = window.Food, T = window.Today, R = window.Ready, d0 = new Date(now); d0.setHours(0, 0, 0, 0);
    const t0 = d0.getTime(), food = !!(C && C.on && C.on() && C.dayOf && F && F.targets), sched = !!D.settings.schedule, wk = D.settings.week || {};
    const at = i => { const d = new Date(t0); d.setDate(d.getDate() + i); return d; };
    const kt = t => { if (!food) return 0; try { const tg = F.targets(t); return tg && tg.kcal > 0 ? Math.round(tg.kcal) : 0; } catch (e) { return 0; } };
    const planned = d => { const day = sched && wk[d.getDay()] && S.getDay(wk[d.getDay()]); return day ? day.name : ''; };
    const nd = T && T.nextDay ? T.nextDay() : null, done = D.sessions.some(s => s.start >= t0 && s.start < t0 + 86400000);
    const plan = {};
    for (let i = 0; i < 8; i++) { const d = at(i), o = { w: planned(d), kt: kt(d.getTime()) }; if (!sched && nd) o.up = nd.name; plan[dayKey(d.getTime())] = o; }
    const o = { day: dayKey(now), kcal: 0, kt: kt(t0), done, next: '', when: '', plan, bOn: briefOn(), bMin: briefMin(), wOn: wrapOn(), wMin: wrapMin(), food, nf: 0 };
    if (food) {
      try { const dd = C.dayOf(t0); o.kcal = Math.round(dd.eaten || 0); o.p = Math.round(dd.protein || 0); o.nf = (dd.food || []).length; } catch (e) { }
      try { const tg = F.targets(t0); if (tg && tg.p > 0) o.pt = Math.round(tg.p); } catch (e) { }
    }
    const today = D.sessions.filter(s => s.start >= t0 && s.start < t0 + 86400000).map(s => s.dayName || 'Workout');      // v1.27: for the wrap-up
    if (today.length) o.wn = [...new Set(today)].join(' + ').slice(0, 60);
    if (sched) {
      // the next planned day: today's when it is still to do, else the first one after today
      for (let i = done ? 1 : 0; i < 8; i++) { const d = at(i), w = planned(d); if (w) { o.next = w; o.when = i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]; break; } }
    } else if (nd) o.next = nd.name;
    try { const r = R && R.readiness ? R.readiness(now) : null; if (r) { o.ready = r.score; o.rword = r.advice; } } catch (e) { }
    // 1.33 (38): the brief says when last night's sleep was in the safe or the danger zone
    try { const z = o.rword != null && window.Daily && window.Daily.zoneNow ? window.Daily.zoneNow('sleep') : ''; if (z) o.rword += z === 's' ? ' · sleep in the safe zone ✓' : ' · sleep in the danger zone ⚠'; } catch (e) { }
    return o;
  }
  function todaySync() {
    if (!has('todayData')) return;
    const sig = JSON.stringify(todayData()); if (sig === lastToday) return; lastToday = sig;
    if ((briefOn() || wrapOn()) && has('notifAllowed') && !call('notifAllowed') && !M.notifAsked) { M.notifAsked = true; S.saveMeta(); call('notifAsk'); }
    call('todayData', sig);
  }
  // readiness takes a moment to work out, so this one waits until the screens have been quiet for a second
  const todayLater = () => { clearTimeout(todayT); todayT = setTimeout(todaySync, 1200); };

  function syncAll() { workoutSync(); widgetSync(); remindersSync(); foodSync(); nudgeSync(); suppSync(); todayLater(); }
  let t = null; const queue = () => { clearTimeout(t); t = setTimeout(syncAll, 250); };
  if (N) {
    const save0 = S.save; S.save = function (now) { save0(now); queue(); };            // every change the screens make goes through here
    const after0 = A.afterRender; A.afterRender = name => { if (after0) after0(name); queue(); };
    setInterval(syncAll, 60000);
  }

  // ---------------- optional fingerprint lock ----------------
  let locked = false, enabling = false, pausedAt = 0;
  function lockNow() {
    if (!M.lock || !has('unlock') || !call('canLock')) return;
    locked = true;
    if (!$('#lock')) { const o = document.createElement('div'); o.id = 'lock'; o.className = 'lock'; o.innerHTML = `<div class="brand">Gym<span>Day</span></div><p class="muted">Locked</p><button class="btn primary" data-act="lockOpen">Unlock</button>`; document.body.appendChild(o); }
    call('unlock');
  }
  ACT.lockOpen = () => call('unlock');
  window.onUnlock = ok => {
    if (enabling) { enabling = false; if (ok) { M.lock = true; S.saveMeta(); toast('Fingerprint lock is on'); } else toast('Not turned on'); if (A.inSettings()) A.rerender(); return; }
    if (ok) { locked = false; const o = $('#lock'); if (o) o.remove(); }
  };
  const back0 = window.appBack; window.appBack = () => (locked ? false : back0());
  const pause0 = window.appPause; window.appPause = () => { pausedAt = Date.now(); if (pause0) pause0(); };
  const resume0 = window.appResume; window.appResume = () => {
    if (resume0) resume0();
    if (M.lock && !locked && pausedAt && Date.now() - pausedAt > 60000) lockNow();
    if (N && A.inSettings() && $('#sheet').classList.contains('hidden')) A.rerender();      // back from the phone's own settings
  };

  // ---------------- the rows these add to Settings → Extras ----------------
  function settingsRows() {
    if (!N) return '';
    const sw = (bind, on, title, sub, off) => `<div class="row" style="padding:6px 0"><div class="grow">${title}<div class="xs dim">${sub}</div></div><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''} ${off ? 'disabled' : ''} style="width:22px;height:22px"></div>`;
    let h = '';
    if (has('workoutCard')) {
      h += sw('optLockNote', M.lockNote !== false, 'Workout on the lock screen', 'Gym time, the current exercise and buttons to tick a set, go to the next exercise and pause. On Android 16 it also shows in the capsule at the top: tap the capsule for the buttons.');
      const cap = has('capsuleState') ? call('capsuleState') : 'na';
      if (M.lockNote !== false && cap === 'no') h += `<div class="row" style="padding:2px 0 8px"><span class="xs grow" style="color:var(--red)">The capsule is switched off for GymDay on this phone.</span><button class="btn sm" data-act="capsuleFix">Turn on</button></div>`;
      else if (M.lockNote !== false && cap === 'yes') h += `<div class="row" style="padding:2px 0 8px"><span class="xs dim grow">Capsule not showing? On a OnePlus it is off for new apps: open the phone's Settings, Notifications &amp; Quick Settings, Live Alerts, and turn on "Show Live Updates on Live Alerts" for GymDay.</span><button class="btn sm" data-act="capsuleFix">Open</button></div>`;
    }
    if (has('remindersSet')) {
      const ok = !!D.settings.schedule;
      h += sw('optRemind', !!D.settings.remind && ok, 'Gym reminders', ok ? 'A notification on your planned gym days' : 'Turn on the weekly schedule first', !ok);
      if (D.settings.remind && ok) h += `<div class="row" style="padding:0 0 8px"><span class="small grow">Remind me at</span><input class="input" type="time" data-bind="remindAt" value="${esc(D.settings.remindAt || '17:00')}" style="width:136px"></div>`;
    }
    if (has('proteinNudgeSet') && window.Calories && window.Calories.on()) {          // v1.20
      h += sw('optPNudge', D.settings.pNudge !== false, 'Evening protein reminder', 'If food is logged and protein is 10 g or more short of your target, a notification says how much is left');
      if (D.settings.pNudge !== false) h += `<div class="row" style="padding:0 0 8px"><span class="small grow">Remind me at</span><input class="input" type="time" data-bind="pNudgeAt" value="${esc(D.settings.pNudgeAt || '19:00')}" style="width:120px"></div>`;
    }
    if (has('todayData')) {                                                              // v1.25
      h += sw('optBrief', briefOn(), 'Morning brief', "One notification each morning: today's workout, your calorie target and, once GymDay has last night's sleep, your readiness");
      if (briefOn()) h += `<div class="row" style="padding:0 0 8px"><span class="small grow">Send it at</span><input class="input" type="time" data-bind="briefAt" value="${esc(D.settings.briefAt || '07:00')}" style="width:120px"></div>`;
      h += sw('optWrap', wrapOn(), 'Evening wrap-up', "One notification each evening: today's workout, calories and protein, and what is on tomorrow. On a day with nothing logged, a reminder to add the day's food");
      if (wrapOn()) h += `<div class="row" style="padding:0 0 8px"><span class="small grow">Send it at</span><input class="input" type="time" data-bind="wrapAt" value="${esc(D.settings.wrapAt || '21:00')}" style="width:120px"></div>`;
    }
    const supRem = !!(window.Supps && window.Supps.reminders && window.Supps.reminders(14).length), pRem = has('proteinNudgeSet') && nudgeOn(), bRem = has('todayData') && (briefOn() || wrapOn());      // v1.20, v1.25
    if (has('notifAllowed') && !call('notifAllowed') && ((has('workoutCard') && M.lockNote !== false) || (D.settings.remind && D.settings.schedule) || supRem || pRem || bRem))
      h += `<div class="row" style="padding:2px 0 8px"><span class="xs grow" style="color:var(--red)">Notifications are switched off for GymDay on this phone, so ${[has('workoutCard') && M.lockNote !== false ? 'the workout on the lock screen' : '', D.settings.remind && D.settings.schedule ? 'gym reminders' : '', supRem ? 'supplement reminders' : '', pRem ? 'the protein reminder' : '', bRem ? 'the morning brief' : ''].filter(Boolean).join(', ').replace(/, ([^,]*)$/, ' and $1')} can't show.</span><button class="btn sm" data-act="notifFix">Turn on</button></div>`;
    if (has('canLock')) { const can = !!call('canLock'); h += sw('optLock', !!M.lock && can, 'Fingerprint lock', can ? 'Ask for your fingerprint or the phone\'s PIN when GymDay opens' : 'Set a screen lock on this phone first', !can); }
    return h;
  }
  document.addEventListener('change', e => {
    const el = e.target, b = el.dataset.bind;
    if (b === 'optLockNote') { M.lockNote = el.checked; S.saveMeta(); lastW = lastW === 'none' ? 'none' : ''; workoutSync(); }
    else if (b === 'optRemind') {
      D.settings.remind = el.checked; S.save();
      if (el.checked && has('notifAllowed') && !call('notifAllowed')) call('notifAsk');
      A.rerender(); remindersSync();
    }
    else if (b === 'remindAt') { D.settings.remindAt = el.value || '17:00'; S.save(); remindersSync(); }
    else if (b === 'optPNudge') { D.settings.pNudge = el.checked; S.save(); if (el.checked && has('notifAllowed') && !call('notifAllowed')) call('notifAsk'); A.rerender(); nudgeSync(); }
    else if (b === 'pNudgeAt') { D.settings.pNudgeAt = /^\d\d:\d\d$/.test(el.value) ? el.value : '19:00'; S.save(); nudgeSync(); }
    else if (b === 'optBrief') { D.settings.brief = el.checked; S.save(); if (el.checked && has('notifAllowed') && !call('notifAllowed')) call('notifAsk'); A.rerender(); todaySync(); }
    else if (b === 'briefAt') { D.settings.briefAt = /^\d\d:\d\d$/.test(el.value) ? el.value : '07:00'; S.save(); todaySync(); }
    else if (b === 'optWrap') { D.settings.wrap = el.checked; S.save(); if (el.checked && has('notifAllowed') && !call('notifAllowed')) call('notifAsk'); A.rerender(); todaySync(); }
    else if (b === 'wrapAt') { D.settings.wrapAt = /^\d\d:\d\d$/.test(el.value) ? el.value : '21:00'; S.save(); todaySync(); }
    else if (b === 'optLock') {
      if (el.checked) { enabling = true; el.checked = false; call('unlock'); }      // prove the fingerprint works before locking the app with it
      else { M.lock = false; S.saveMeta(); toast('Fingerprint lock is off'); }
    }
  });

  window.Native = { settingsRows, todayData, changed: () => { remindersSync(); widgetSync(); foodSync(); nudgeSync(); suppSync(); todayLater(); } };
  if (N) { syncAll(); lockNow(); }
  try { const id = has('pendingStart') ? call('pendingStart') : ''; if (id) setTimeout(() => window.onWidgetStart(id === '-' ? '' : id), 500); } catch (e) { }
  try { const to = has('pendingGo') ? call('pendingGo') : ''; if (to) setTimeout(() => window.onShortcut(to), 500); } catch (e) { }
})();
