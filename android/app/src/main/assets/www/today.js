/* GymDay 1.22 · the Today page and the + button.
   Today (the first tab, where Days was; your days are still on it): the day at a glance in rings: calories eaten against the
   target, protein, what was burnt, last night's sleep, how recovered the muscles are, the week's workouts, and the next workout
   with Start. Every ring and number opens what is behind it. Built from what the other modules already work out
   (Calories.dayOf, Food.targets, Progress.sleepOf / recovery, App.doneIn), so the numbers are the same everywhere.
   The + button floats above the bottom bar on every tab: food, a meal photo, a barcode, eating out, an activity, body weight,
   sleep, or starting a workout, each one tap away. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc, ACT, VIEWS } = A, D = S.data;
  const st = () => D.settings;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r : ''}` : `${r} min`; };
  let rid = 0;

  // a ring: how much of a target is filled (0 to 1); `cls` picks its colours (tr-kcal, tr-p, tr-sleep, tr-rec, tr-week)
  function ring(p, size, w, cls) {
    const r = (size - w) / 2, c = size / 2, C = 2 * Math.PI * r, k = Math.max(0, Math.min(1, +p || 0)), id = 'trg' + (++rid);
    return `<svg class="tring ${cls || ''}" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" aria-hidden="true" focusable="false">
      <defs><linearGradient id="${id}" x1="0" y1="0" x2="1" y2="1"><stop offset="0" class="tr-a"/><stop offset="1" class="tr-b"/></linearGradient></defs>
      <circle cx="${c}" cy="${c}" r="${r}" fill="none" class="tr-track" stroke-width="${w}"/>
      ${k > 0 ? `<circle cx="${c}" cy="${c}" r="${r}" fill="none" stroke="url(#${id})" stroke-width="${w}" stroke-linecap="round" class="tr-arc ring-g" style="--c:${C.toFixed(1)};--k:${(C * k).toFixed(1)}" stroke-dasharray="${(C * k).toFixed(1)} ${C.toFixed(1)}" transform="rotate(-90 ${c} ${c})"/>` : ''}</svg>`;
  }

  // ---------------- the week's workouts and the streak (the same counting as the weekly goal card) ----------------
  function week() {
    const g = st().weekGoal == null ? 3 : +st().weekGoal || 0, now = Date.now();
    const n = A.doneIn(A.weekStartOf(now), Infinity);
    let streak = g && n >= g ? 1 : 0;
    if (g) for (let b = 1; b < 520; b++) { if (A.doneIn(A.weekStartOf(now, b), A.weekStartOf(now, b - 1)) >= g) streak++; else break; }
    return { g, n, streak };
  }
  // ---------------- the next workout: today's day in the weekly plan, else the day after the last one trained ----------------
  function nextDay() {
    if (!D.days.length) return null;
    if (st().schedule) { const id = (st().week || {})[new Date().getDay()]; return (id && S.getDay(id)) || null; }
    const last = D.sessions[0], i = last ? D.days.findIndex(d => d.id === last.dayId) : -1;
    return D.days[(i + 1) % D.days.length];
  }
  const trainedToday = () => D.sessions.find(s => s.start >= day0(Date.now())) || null;

  // ---------------- the hero: food and burn in rings ----------------
  function hero() {
    const C = window.Calories, F = window.Food;
    if (!C || !C.on || !C.on()) return '';
    const t0 = day0(Date.now()), d = C.dayOf(t0), tg = F && F.targets ? F.targets(t0) : null;
    const goal = tg ? tg.kcal : (C.goalKcal ? C.goalKcal() : 0), left = goal ? goal - d.eaten : 0;
    const pG = tg && tg.p ? tg.p : 0, p = Math.round(d.protein || 0);
    const side = [
      `<div class="th-row"><span class="th-mini">${ring(pG ? p / pG : 0, 38, 5, 'tr-p')}</span><div class="grow"><div class="th-v"><b>${n0(p)}</b> g protein${window.Daily && window.Daily.zoneMark ? window.Daily.zoneMark('protein') : ''}</div>${pG ? `<div class="th-sub">${p >= pG ? 'target reached ✓' : `of ${n0(pG)} g`}</div>` : ''}</div></div>`,
      `<div class="th-row"><span class="th-mini th-ic" aria-hidden="true">🔥</span><div class="grow"><div class="th-v"><b>${n0(d.burnt)}</b> burnt</div><div class="th-sub">${d.watch ? 'from your watch' : d.base != null ? 'everyday + workouts' : 'workouts and activities'}</div>${d.act && d.act.steps ? `<div class="th-sub" id="thSteps">${n0(d.act.steps)} steps</div>` : ''}</div></div>`,
    ].join('');
    return `<div class="card tap today-hero" id="kcCard" data-act="openCalories">
      <div class="th-main"><div class="th-ring">${ring(goal ? d.eaten / goal : 0, 132, 12, 'tr-kcal')}<div class="th-c"><div class="th-n countup">${n0(d.eaten)}</div><div class="th-l">kcal eaten</div></div></div>
        <div class="th-side">${side}</div></div>
      ${window.Odd && window.Odd.today().length ? `<div class="th-odd small">⚠ ${window.Odd.today().length === 1 ? 'One food' : window.Odd.today().length + ' foods'} to check on the Food tab: the number looks unusual ›</div>` : ''}
      <div class="row th-foot"><div class="grow small">${goal ? (left >= 0 ? `<b>${n0(left)}</b> kcal left of ${n0(goal)}` : `<b>${n0(-left)}</b> kcal over ${n0(goal)}`) : 'No daily target yet: set one on the Food tab'}</div><button class="btn sm" data-act="kcAddHome">+ Food</button></div></div>`;
  }

  // Food tracking off: the big ring is the week's workouts against the goal (the same words as the weekly goal card had)
  function trainHero() {
    const w = week(); if (!w.g) return '';
    const last = D.sessions[0], left = w.g - w.n, done = w.n >= w.g;
    const side = [
      `<div class="th-row"><span class="th-mini th-ic" aria-hidden="true">🔥</span><div class="grow"><div class="th-v"><b>${w.streak}</b> week${w.streak === 1 ? '' : 's'} in a row</div><div class="xs muted">${w.streak ? 'goal reached each week' : 'reach the goal to start one'}</div></div></div>`,
      last ? `<div class="th-row"><span class="th-mini th-ic" aria-hidden="true">🏋</span><div class="grow" style="min-width:0"><div class="th-v ellipsis"><b class="th-s">${esc(last.dayName || 'Workout')}</b></div><div class="xs muted">last workout · ${esc(A.sinceText ? A.sinceText(last.start) : A.fmtDate(last.start))}</div></div></div>` : '',
    ].join('');
    return `<div class="card tap today-hero goal" id="weekHero" data-act="goalEdit">
      <div class="th-main"><div class="th-ring">${ring(w.n / w.g, 132, 12, done ? 'tr-p' : 'tr-kcal')}<div class="th-c"><div class="th-n">${w.n}<span class="th-of"> / ${w.g}</span></div><div class="th-l">this week</div></div></div>
        <div class="th-side">${side}</div></div>
      <div class="row th-foot"><div class="grow"><div class="title">${done ? 'Weekly goal reached 🎉' : `${left} more workout${left > 1 ? 's' : ''} this week`}</div><div class="small muted mt4">Goal: ${w.g} a week${w.streak ? ` · 🔥 ${w.streak} week${w.streak > 1 ? 's' : ''} in a row` : ''}</div></div><span class="chev">›</span></div></div>`;
  }

  // ---------------- small ring tiles: sleep, recovery, the week ----------------
  function tiles(noWeek) {
    const P = window.Progress, C = window.Calories, out = [], zm = k => (window.Daily && window.Daily.zoneMark ? window.Daily.zoneMark(k) : '');      // 1.33 (37): ✓ or ⚠
    if (P && P.sleepOf && st().recovery !== false) {
      const sl = P.sleepOf(day0(Date.now())), need = P.sleepNeed ? P.sleepNeed(C && C.ageNow ? C.ageNow() : 0) : 7;
      out.push(`<button class="tt" data-act="${sl ? 'openRecovery' : 'todaySleep'}" id="ttSleep">${ring(sl ? sl.min / (need * 60) : 0, 46, 6, 'tr-sleep')}<span class="tt-b"><span class="k2">Sleep</span><span class="tt-v">${sl ? hm(sl.min) + zm('sleep') : 'Add'}</span><span class="xs muted">${sl ? `need ${need} h` : 'last night'}</span></span></button>`);
    }
    const rd = window.Ready ? window.Ready.readiness() : null;
    // v1.23: the readiness score takes the place of the plain recovery average (the muscles are one part of it)
    if (rd) out.push(`<button class="tt" data-act="readyOpen" id="ttReady">${ring(rd.score / 100, 46, 6, 'tr-ready rd-' + rd.tone)}<span class="tt-b"><span class="k2">Readiness</span><span class="tt-v">${rd.score}${zm('ready')}</span><span class="xs muted ellipsis">${esc(rd.advice.toLowerCase())}</span></span></button>`);
    else if (P && P.recovery && st().recovery !== false && D.sessions.length) {
      const g = P.groupRecovery(P.recovery()), all = Object.keys(g), avg = all.length ? Math.round(all.reduce((a, x) => a + g[x].pct, 0) / all.length) : 100;
      const low = all.slice().sort((a, b) => g[a].pct - g[b].pct)[0];
      out.push(`<button class="tt" data-act="openRecovery" id="ttRec">${ring(avg / 100, 46, 6, 'tr-rec')}<span class="tt-b"><span class="k2">Recovery</span><span class="tt-v">${avg}%</span><span class="xs muted ellipsis">${low && g[low].pct < 100 ? `${esc(low)} ${g[low].pct}%` : 'all fresh'}</span></span></button>`);
    }
    const w = week(), left = w.g - w.n;
    if (w.g && !noWeek) out.push(`<button class="tt goal" data-act="goalEdit" id="ttWeek">${ring(w.n / w.g, 46, 6, w.n >= w.g ? 'tr-p' : 'tr-week')}<span class="tt-b"><span class="k2">Workouts</span><span class="tt-v">${w.n} <span class="tt-of">of</span> ${w.g}</span><span class="xs muted">${left > 0 ? `${left} more to go` : 'this week 🎉'}</span></span></button>`);
    return out.length ? `<div class="tts tts-${out.length}">${out.join('')}</div>` : '';
  }
  // 1.33 (9): the Sleep tile with nothing for last night: hours on a slider and Save, right here (the rest is one tap away)
  // 1.35.2 (60): and, with a watch, from this sheet too: 📷 its app's sleep screenshots (up to 10, read together, as on Recovery)
  // or ⌚ last night from the watch now (Health Connect; Apple Health on the iPhone), or how to set that up when it isn't yet
  const wOn = () => !window.Watch || window.Watch.on();          // off = no watch (watch.js)
  ACT.todaySleep = () => {
    const P = window.Progress, C = window.Calories;
    if (!P || !P.saveSleep) { A.go('recovery'); if (ACT.rcSleepForm) setTimeout(() => ACT.rcSleepForm(), 60); return; }
    const need = P.sleepNeed ? P.sleepNeed(C && C.ageNow ? C.ageNow() : 0) : 7, shots = wOn() && !!ACT.rcSleepShots, watch = wOn() && !!(window.HealthAuto || ACT.sleepWatch);
    A.openSheet(`<h2>Last night's sleep</h2><p class="small muted">How long did you sleep? Time asleep, not only in bed.</p>
      <div class="row mt12" style="gap:12px;align-items:center"><input type="range" id="tdSl" min="3" max="12" step="0.5" value="${need}" class="grow" aria-label="Hours asleep"><b id="tdSlV" style="min-width:76px;text-align:right">${hm(need * 60)}</b></div>
      ${shots || watch ? `<div class="row mt12" id="tdSlW" style="gap:8px">${shots ? '<button class="btn sm grow" data-act="todaySleepShots" id="tdSlShots">📷 Screenshots</button>' : ''}${watch ? '<button class="btn sm grow" data-act="todaySleepWatch" id="tdSlWatch">⌚ From your watch</button>' : ''}</div>
      <p class="xs dim mt8" id="tdSlNote" role="status">${shots ? 'Up to 10 screenshots of your watch app’s sleep, read together.' : 'Last night’s sleep from your watch.'}</p>` : ''}
      <div class="row mt16"><button class="btn grow" data-act="todaySleepMore">Bedtime and more</button><button class="btn primary grow" data-act="todaySleepSave">Save</button></div>`,
      sh => { const i = sh.querySelector('#tdSl'), o = sh.querySelector('#tdSlV'); if (i && o) i.addEventListener('input', () => { o.textContent = hm(+i.value * 60); }); });
  };
  // 📷: the screenshots are picked with this sheet still open (back here if none are picked); what was read opens in its place
  ACT.todaySleepShots = () => { if (ACT.rcSleepShots) ACT.rcSleepShots(); };
  // ⌚: last night now, from the watch; not set up yet (or no watch connection on this phone): the watch's own page says how
  let swBusy = false;
  ACT.todaySleepWatch = async () => {
    const HA = window.HealthAuto, P = window.Progress, t0 = day0(Date.now());
    if (!HA || !HA.on || !HA.on() || !HA.night) { A.closeSheet(); if (ACT.sleepWatch) ACT.sleepWatch(); else { A.go('recovery'); } return; }
    if (swBusy) return; swBusy = true;
    const b = $('#tdSlWatch'); if (b) { b.disabled = true; b.textContent = 'Asking Health Connect…'; }
    let r = null; try { r = await HA.night(t0); } catch (e) { r = null; } finally { swBusy = false; }
    const sl = P && P.sleepOf ? P.sleepOf(t0) : null, here = $('#tdSlWatch');
    if (sl) { if (here) A.closeSheet(); A.glowNext = ['#ttSleep']; A.rerender(); window.toast(`From your watch · ${hm(sl.min)}`); return; }
    if (!here) return;                                                    // the sheet was closed meanwhile
    here.disabled = false; here.textContent = '⌚ Try again';
    const note = $('#tdSlNote'); if (note) note.textContent = !r || !r.ok ? 'Health Connect didn’t answer. Try again in a moment.'
      : 'Health Connect has no sleep from your watch for last night yet. Open your watch’s app so it syncs, then try again, or add 📷 Screenshots.';
  };
  ACT.todaySleepSave = () => {
    const i = $('#tdSl'), P = window.Progress; if (!i || !P || !P.saveSleep) return;
    const min = Math.round(+i.value * 60); P.saveSleep(min); A.closeSheet(); A.glowNext = ['#ttSleep']; A.rerender(); window.toast(`Sleep saved · ${hm(min)}`);
  };
  ACT.todaySleepMore = () => { A.closeSheet(); A.go('recovery'); if (ACT.rcSleepForm) setTimeout(() => ACT.rcSleepForm(), 60); };

  // ---------------- the next workout ----------------
  function nextCard() {
    if (D.active || !D.days.length || st().schedule) return '';              // a running workout has its own card; a weekly plan has "Today"
    // 1.35.2: not before the first workout (it only repeated the first day card below); after today's workout it says what is
    // next time, with no Start (it pushed a second workout the same day); readiness only when its tile is hidden
    if (!D.sessions.length && window.__calm !== false) return '';
    const d = nextDay(); if (!d) return '';
    const done = trainedToday(), stt = S.dayStats(d.id), H = window.Home, tilesOff = !!(H && H.home && H.home().hide.includes('tiles'));
    return `<div class="card today-next" id="nextCard"><div class="row"><div class="grow" style="min-width:0"><div class="k2">${done ? 'Done today ✓ · next time' : 'Next workout'}</div><div class="title ellipsis">${esc(d.name)}</div>
      <div class="xs muted mt4">${d.items.length} exercise${d.items.length === 1 ? '' : 's'}${stt.count ? ` · last ${A.fmtDate(stt.last)}` : ' · not done yet'}</div>${tilesOff || window.__calm === false ? rdLine() : ''}</div>
      ${done && window.__calm !== false ? '' : `<button class="btn sm ${done ? '' : 'primary'}" data-act="startNext" data-id="${esc(d.id)}">Start ▶</button>`}</div></div>`;
  }

  // the readiness advice next to the workout it is about
  function rdLine() { const r = window.Ready ? window.Ready.readiness() : null; return r && !trainedToday() ? `<div class="xs mt4 rd-line rd-${r.tone}" data-act="readyOpen">Readiness ${r.score} · ${esc(r.advice.toLowerCase())} ›</div>` : ''; }
  ACT.startNext = el => ACT.startDay(el);          // its own name, so the day rows below stay the only "startDay" buttons
  const top = () => { const h = hero(); return (h || trainHero()) + tiles(!h) + nextCard(); };

  // ---------------- the + button ----------------
  const ROOTS_ALL = ['days', 'calories', 'library', 'clubs', 'history', 'settings'], ROOTS = ['days', 'calories'];          // 1.35.2: only on Today and Food (it covered rows and arrows on the other tabs)
  let fab = null;
  function fabPaint(name) {
    if (!fab) { fab = document.createElement('button'); fab.id = 'fab'; fab.className = 'qfab'; fab.dataset.act = 'quickAdd'; fab.setAttribute('aria-label', 'Add something'); fab.innerHTML = '<span aria-hidden="true">+</span>'; document.getElementById('app').appendChild(fab); }
    const show = (window.__calm === false ? ROOTS_ALL : ROOTS).includes(name) && A.depth() === 1 && !document.body.classList.contains('no-nav') && !$('.welcome, .auth');
    fab.classList.toggle('hidden', !show); document.body.classList.toggle('has-fab', !!show);
  }
  const after0 = A.afterRender;
  // 1.35.2: on the first screen (the page at its top) the + steps aside while it would sit on a button, like the Next workout
  // card's Start or the daily target's Change; further down it comes and goes with the scrolling as before
  function onButton() {
    if (!fab || window.__calm === false || fab.classList.contains('hidden') || window.scrollY > 40) return false;
    const f = { left: fab.offsetLeft, top: fab.offsetTop, right: fab.offsetLeft + fab.offsetWidth, bottom: fab.offsetTop + fab.offsetHeight };          // where it sits, not where its step-aside moved it
    if (!(f.right > f.left)) return false;
    return [...document.querySelectorAll('#view .btn')].some(b => { const r = b.getBoundingClientRect(); return r.width > 0 && r.left < f.right && r.right > f.left && r.top < f.bottom && r.bottom > f.top; });
  }
  A.afterRender = name => { if (after0) after0(name); fabPaint(name); if (fab) fab.classList.toggle('away', onButton()); lastY = window.scrollY; };
  // scrolling down: the + steps aside so it never sits on what is being read; scrolling up, or back at the top: it returns
  let lastY = 0;
  window.addEventListener('scroll', () => {
    if (!fab) return; const y = window.scrollY, d = y - lastY;
    if (Math.abs(d) < 6) return;
    fab.classList.toggle('away', (d > 0 && y > 80) || onButton()); lastY = y;
  }, { passive: true });

  function quickTiles() {
    const C = window.Calories, food = !!(C && C.on && C.on()), nd = nextDay(), t = [];
    const tile = (act, ic, name, sub) => `<button class="qa" data-act="quickGo" data-to="${act}"><span class="qa-ic" aria-hidden="true">${ic}</span><span class="qa-t">${name}</span><span class="xs muted">${sub}</span></button>`;
    if (D.active) t.push(tile('workout', '▶', 'Open your workout', esc(D.active.dayName || 'in progress')));
    else t.push(tile('workout', '▶', 'Start a workout', nd ? esc(nd.name) : D.days.length ? 'rest day in your plan: pick a day' : 'make your first day'));
    const us = food && window.Food && window.Food.usualNow ? window.Food.usualNow() : null;
    if (us) t.push(tile('usual', '⭐', 'Your usual ' + ({ b: 'breakfast', ms: 'snack', l: 'lunch', es: 'snack', d: 'dinner' })[us.meal], `${n0(us.kcal)} kcal · one tap`));
    if (food) t.push(tile('food', '🍽', 'Add food', 'search or type it'), tile('photo', '📷', 'Meal photo', 'the app reads it'), tile('scan', '▥', 'Scan a barcode', 'a packet'),
      tile('out', '🍴', 'Eating out', 'restaurant dishes'), tile('activity', '🏃', 'Add an activity', 'a sport, a walk, a swim'));
    t.push(tile('weight', '⚖', 'Body weight', 'log today\'s'), tile('sleep', '😴', 'Sleep & heart', 'last night'));
    return t.join('');
  }
  ACT.quickAdd = () => A.openSheet(`<h2>Add</h2><div class="qas">${quickTiles()}</div><button class="btn block mt12" data-act="closeSheet">Close</button>`);
  ACT.quickGo = el => {
    const to = el.dataset.to, C = window.Calories; A.closeSheet();
    const foodTab = fn => { if (ACT.openCalories) ACT.openCalories(); if (fn) setTimeout(fn, 30); };
    if (to === 'workout') {
      if (D.active) { A.reset('days'); A.go('session'); return; }
      const d = nextDay(); A.setRoot('days');
      if (d) ACT.startDay({ dataset: { id: String(d.id) } }); else if (!D.days.length) window.toast('Make a day first: + New day'); else window.toast('Pick a day and press Start ▶');
    } else if (to === 'food') foodTab(() => ACT.kcAdd && ACT.kcAdd());
    else if (to === 'usual') foodTab(() => ACT.kcUsualNow && ACT.kcUsualNow());
    else if (to === 'photo') foodTab(() => ACT.kcPhoto && ACT.kcPhoto());
    else if (to === 'scan') foodTab(() => ACT.kcScan && ACT.kcScan());
    else if (to === 'out') foodTab(() => ACT.kcOut && ACT.kcOut());
    else if (to === 'activity') foodTab(() => ACT.mvAdd && ACT.mvAdd());
    else if (to === 'weight') { if (window.onShortcut) window.onShortcut('weight'); }
    else if (to === 'sleep') { A.reset('days', 'recovery'); if (ACT.rcSleepForm) setTimeout(() => ACT.rcSleepForm(), 60); }
  };

  window.Today = { top, hero, trainHero, tiles, nextCard, ring, week, nextDay, quickTiles };
})();
