/* GymDay – Trainer mode (a switch in Settings, off until turned on):
   85 My gym's equipment: tick what the gym has; the library and the builder leave the rest out. Two lists (Gym, Home).
   74 Build me a workout: pick body parts and minutes, get a list made from the library.
   75 Programs with weeks: follow a program day by day; the app says what is next and moves on as workouts are saved. */
(function () {
  const A = window.App, S = window.Store, D = S.data, I = window.Insights, F = window.BodyFig;
  const { $, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  const st = () => D.settings;
  const on = () => !!st().trainer;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  window.SettingsRows = window.SettingsRows || [];
  const top = (title, sub) => `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${title}</h1><div class="sub">${sub}</div></div></div>`;

  // =====================================================================================================
  // 85 My gym's equipment
  // =====================================================================================================
  const KINDS = [['Barbell', 'Barbells and racks'], ['Dumbbell', 'Dumbbells'], ['Cable', 'Cable machines'], ['Machine', 'Weight machines'], ['Smith', 'Smith machine'], ['Bodyweight', 'Bodyweight (bars, floor)'], ['Cardio', 'Cardio machines'], ['Other', 'Other small kit']];
  const gyms = () => { if (!st().gyms) st().gyms = [{ id: 'gym', name: 'Gym', off: [] }, { id: 'home', name: 'Home', off: ['Barbell', 'Cable', 'Machine', 'Smith', 'Cardio'] }]; return st().gyms; };
  const gym = () => gyms().find(g => g.id === st().gymId) || gyms()[0];
  // whether the place being trained at has what the exercise needs (always yes when Trainer mode is off)
  const has = ex => !on() || !ex || !(gym().off || []).includes(ex.equip);
  const missing = () => (on() ? S.allExercises().filter(e => !has(e)).length : 0);
  VIEWS.gym = {
    html() {
      const g = gym();
      return top('My gym', 'Tick what it has. The library and the workout builder leave the rest out.') +
        `<div class="chips">${gyms().map(x => `<button class="chip ${x.id === g.id ? 'on' : ''}" data-act="gymPick" data-id="${x.id}">${esc(x.name)}</button>`).join('')}</div>
        <div class="card">${KINDS.map(([k, label]) => `<div class="row" style="padding:7px 0"><div class="grow">${label}<div class="xs dim">${plural(S.allExercises().filter(e => e.equip === k).length, 'exercise')}</div></div><input type="checkbox" data-bind="gymHas" data-k="${k}" ${(g.off || []).includes(k) ? '' : 'checked'} style="width:22px;height:22px"></div>`).join('')}</div>
        <p class="xs dim" style="margin:0 2px">${missing() ? `${plural(missing(), 'exercise')} left out at ${esc(g.name)}.` : 'Everything in the library is available here.'} To leave out one single machine, open it in the library and choose "Hide from the library".</p>`;
    }
  };
  ACT.openGym = () => A.go('gym');
  ACT.gymPick = el => { st().gymId = el.dataset.id; S.save(); A.rerender(); toast('Training at ' + gym().name); };
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset && t.dataset.bind;
    if (b === 'gymHas') { const g = gym(), k = t.dataset.k; g.off = (g.off || []).filter(x => x !== k); if (!t.checked) g.off.push(k); S.save(); A.rerender(); }
    else if (b === 'optTrainer') { st().trainer = t.checked; S.save(); A.rerender(); toast(t.checked ? 'Trainer mode is on: see the Today page' : 'Trainer mode is off'); }
  });

  // =====================================================================================================
  // 74 Build me a workout
  // =====================================================================================================
  const PARTS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core'];
  const BIG = ['Barbell', 'Smith', 'Machine', 'Dumbbell'];
  let bw = { parts: [], mins: 45, list: null, seed: 0 };
  const count = mins => Math.max(3, Math.round(mins / 9));
  // The list: for each chosen body part in turn, the exercise that adds the most parts not yet covered, favouring
  // favourites, the person's own list and what they have done before; big lifts first, small ones after.
  // 1.35.1: how sore each part is today (sore.js). The builder goes easy on sore parts: an exercise whose main part is very sore
  // is picked last (sore: after the others), and an exercise for a sore main part gets 2 sets, not 3.
  const soreParts = () => (window.Sore && window.Sore.levelsOn ? window.Sore.levelsOn(Date.now()).parts : {});
  const soreMain = (e, sl) => { let m = 0; sl = sl || soreParts(); I.exAreas(e).main.forEach(a => { m = Math.max(m, sl[a] || 0); }); return m; };
  const setsOf = (e, sl) => (soreMain(e, sl) >= 2 ? 2 : 3);
  function build(parts, mins, seed, skip) {
    // v1.21.9: exercises needing a partner, unusual kit or an advanced skill (`x`) only once done before or starred
    const pool = S.allExercises().filter(e => parts.includes(e.group) && has(e) && !(D.ex[e.id] || {}).hide && e.track !== 'time' && !(skip || []).includes(e.id)
      && !(e.x && !(D.ex[e.id] || {}).fav && !S.sessionsFor(e.id).length));
    const done = id => S.sessionsFor(id).length, covered = new Set(), out = [], n = Math.min(count(mins), pool.length), sl = soreParts();
    const rnd = id => { let h = seed * 131 + 7; for (const c of id) h = (h * 31 + c.charCodeAt(0)) % 9973; return h / 9973; };
    const score = e => { const p = I.exAreas(e); let fresh = 0; p.main.forEach(a => { if (!covered.has(a)) fresh++; });
      const sore = soreMain(e, sl);
      return fresh * 3 + ((D.ex[e.id] || {}).fav ? 2 : 0) + (e.mine ? 1 : 0) + (done(e.id) ? 1.5 : 0) + (BIG.includes(e.equip) && (e.secondary || []).length ? 1 : 0) + rnd(e.id) * 1.2 - (sore >= 3 ? 6 : sore === 2 ? 3 : 0); };
    for (let k = 0; out.length < n; k++) {
      const g = parts[k % parts.length], cands = pool.filter(e => e.group === g && !out.includes(e)); if (!cands.length) { if (parts.every(x => !pool.some(e => e.group === x && !out.includes(e)))) break; continue; }
      const best = cands.sort((a, b) => score(b) - score(a))[0]; out.push(best); I.exAreas(best).main.forEach(a => covered.add(a));
    }
    // big lifts first, then by body part in the order asked for
    return out.sort((a, b) => (BIG.includes(b.equip) && (b.secondary || []).length ? 1 : 0) - (BIG.includes(a.equip) && (a.secondary || []).length ? 1 : 0) || parts.indexOf(a.group) - parts.indexOf(b.group));
  }
  // nothing chosen: the body parts that are most recovered, upper or lower as a set
  function freshest() {
    if (!window.Progress) return ['Chest', 'Shoulders', 'Triceps'];
    const g = window.Progress.groupRecovery(window.Progress.recovery());
    const sets = [['Chest', 'Shoulders', 'Triceps'], ['Back', 'Biceps'], ['Quads', 'Hamstrings', 'Glutes', 'Calves']];
    // 1.35.1: sore muscles count as less rested (8 points a level)
    const sg = window.Sore && window.Sore.levelsOn ? window.Sore.levelsOn(Date.now()).groups : {};
    return sets.map(s => ({ s, p: s.reduce((t, x) => t + g[x].pct - 8 * (sg[x] || 0), 0) / s.length })).sort((a, b) => b.p - a.p)[0].s;
  }
  VIEWS.builder = {
    html() {
      let h = top('Build me a workout', gym() && on() ? 'From what ' + esc(gym().name) + ' has' : 'From your library') +
        `<div class="card"><div class="lbl">Body parts</div><div class="chipwrap">${PARTS.map(p => `<button class="chip ${bw.parts.includes(p) ? 'on' : ''}" data-act="bwPart" data-v="${p}">${p}</button>`).join('')}</div>
        <div class="xs dim mt8">${bw.parts.length ? '' : 'Nothing picked: I take the muscles that are most rested.'}</div>
        <div class="lbl mt12">How long</div><div class="chipwrap">${[30, 45, 60, 75].map(m => `<button class="chip ${bw.mins === m ? 'on' : ''}" data-act="bwMins" data-v="${m}">${m} min</button>`).join('')}</div>
        <button class="btn primary block mt16" data-act="bwMake">${bw.list ? 'Build it again' : 'Build it'}</button></div>${window.Sore && window.Sore.trainerHtml ? window.Sore.trainerHtml(true) : ''}`;
      if (!bw.list) return h;
      if (!bw.list.length) return h + `<div class="empty"><p>Nothing in the library fits. Tick more equipment in My gym or pick other body parts.</p></div>`;
      const sl = soreParts();
      h += `<div class="card"><h3>${plural(bw.list.length, 'exercise')} · about ${bw.list.length * 9} min</h3>${bw.list.map((e, i) => `<div class="list-item">${A.thumb(e)}<div class="grow" data-act="openEx" data-id="${esc(e.id)}"><div class="ellipsis" style="font-weight:600">${esc(e.name)}</div><div class="xs muted ellipsis">${esc((e.primary || []).join(', ') || e.group)} · ${setsOf(e, sl)} × 10${setsOf(e, sl) < 3 ? ' · sore' : ''}</div></div>
        <button class="ib" data-act="bwSwap" data-i="${i}" aria-label="Another one">↻</button><button class="ib x" data-act="bwDrop" data-i="${i}" aria-label="Leave out">✕</button></div>`).join('')}</div>
        <div class="row"><button class="btn grow" data-act="bwSave">Save as a day</button><button class="btn primary grow" data-act="bwStart">▶ Start now</button></div>`;
      return h;
    },
    leave() { bw.list = null; }
  };
  const bwParts = () => (bw.parts.length ? bw.parts : freshest());
  ACT.openBuilder = () => A.go('builder');
  ACT.bwPart = el => { const v = el.dataset.v; bw.parts = bw.parts.includes(v) ? bw.parts.filter(x => x !== v) : bw.parts.concat(v); bw.list = null; A.rerender(); };
  ACT.bwMins = el => { bw.mins = +el.dataset.v; bw.list = null; A.rerender(); };
  ACT.bwMake = () => { bw.seed++; bw.list = build(bwParts(), bw.mins, bw.seed); A.rerender(); };
  ACT.bwDrop = el => { bw.list.splice(+el.dataset.i, 1); A.rerender(); };
  ACT.bwSwap = el => {
    const i = +el.dataset.i, old = bw.list[i]; bw.seed++;
    const alt = build([old.group], 200, bw.seed, bw.list.map(e => e.id)).filter(e => !bw.list.includes(e))[0];
    if (!alt) { toast('Nothing else for ' + old.group.toLowerCase() + ' here'); return; }
    bw.list[i] = alt; A.rerender();
  };
  const bwName = () => bwParts().slice(0, 3).join(' + ') + (bwParts().length > 3 ? ' +' : '');
  const bwItems = () => { const sl = soreParts(); return bw.list.map(e => ({ ex: e.id, sets: setsOf(e, sl), reps: 10 })); };
  ACT.bwSave = () => { const d = S.addDay(bwName(), bwItems()); S.save(true); bw.list = null; A.reset('days'); A.go('day', { id: d.id }); toast('Saved as a day'); };
  ACT.bwStart = () => {
    if (D.active) { toast('Finish the workout that is running first'); return; }
    const d = S.addDay(bwName(), bwItems()); S.save(true); bw.list = null; A.reset('days'); ACT.startDay({ dataset: { id: d.id } });
  };

  // =====================================================================================================
  // 75 Programs with weeks
  // =====================================================================================================
  // week: the day of each session in one week, as indexes into days. reps: what to aim for in each week (the sets stay as written).
  const X = (ex, sets) => [ex, sets || 3];
  const PROGRAMS = [
    { id: 'ppl', name: 'Push / Pull / Legs', weeks: 6, text: '3 workouts a week. Chest, shoulders and triceps; back and biceps; legs.', week: [0, 1, 2], reps: [12, 12, 10, 10, 8, 8],
      days: [['Push', [X('bench-press', 4), X('incline-db-press'), X('smith-ohp'), X('cable-lateral-raise'), X('triceps-pushdown'), X('overhead-cable-ext')]],
        ['Pull', [X('lat-pulldown-wide', 4), X('seated-cable-row'), X('one-arm-db-row'), X('reverse-pec-deck'), X('cable-bar-curl'), X('cable-hammer-curl')]],
        ['Legs', [X('back-squat', 4), X('leg-press'), X('romanian-deadlift'), X('leg-extension'), X('seated-leg-curl'), X('standing-calf-raise')]]] },
    { id: 'ul', name: 'Upper / Lower', weeks: 8, text: '4 workouts a week: two for the upper body, two for the legs.', week: [0, 1, 2, 3], reps: [12, 12, 10, 10, 10, 8, 8, 8],
      days: [['Upper A', [X('bench-press', 4), X('seated-cable-row', 4), X('smith-ohp'), X('lat-pulldown-wide'), X('cable-bar-curl'), X('triceps-pushdown')]],
        ['Lower A', [X('back-squat', 4), X('romanian-deadlift'), X('leg-press'), X('seated-leg-curl'), X('standing-calf-raise')]],
        ['Upper B', [X('incline-db-press', 4), X('lat-pulldown-close', 4), X('cable-lateral-raise'), X('one-arm-db-row'), X('cable-hammer-curl'), X('overhead-cable-ext')]],
        ['Lower B', [X('leg-press', 4), X('lying-leg-curl'), X('bulgarian-split-squat'), X('leg-extension'), X('seated-calf-raise')]]] },
    { id: 'fb', name: 'Full body', weeks: 6, text: '3 workouts a week that each train everything. Good to start with.', week: [0, 1, 0, 1, 0, 1], perWeek: 3, reps: [12, 12, 10, 10, 8, 8],
      days: [['Full body A', [X('back-squat'), X('bench-press'), X('seated-cable-row'), X('cable-lateral-raise'), X('triceps-pushdown')]],
        ['Full body B', [X('romanian-deadlift'), X('incline-db-press'), X('lat-pulldown-wide'), X('leg-press'), X('cable-bar-curl')]]] },
    { id: '5x5', name: '5 × 5 strength', weeks: 8, text: '3 workouts a week on the big barbell lifts, five sets of five. Add a little weight each time it goes well.', week: [0, 1, 0, 1, 0, 1], perWeek: 3, reps: [5, 5, 5, 5, 5, 5, 5, 5],
      days: [['5 × 5 A', [X('back-squat', 5), X('bench-press', 5), X('barbell-row', 5)]],
        ['5 × 5 B', [X('back-squat', 5), X('barbell-ohp', 5), X('conventional-deadlift', 1)]]] },
  ];
  const progOf = id => PROGRAMS.find(p => p.id === id);
  const perWeek = p => p.perWeek || p.week.length;
  const total = p => p.weeks * perWeek(p);
  // where the person is: session number `at` (0-based), its week and which of the program's days it is
  function where() {
    const pg = st().program, p = pg && progOf(pg.id); if (!p) return null;
    const at = Math.min(pg.at || 0, total(p)), week = Math.min(p.weeks, Math.floor(at / perWeek(p)) + 1), idx = p.week[at % p.week.length];
    return { p, pg, at, week, idx, dayId: pg.dayIds[idx], day: S.getDay(pg.dayIds[idx]), done: at >= total(p) };
  }
  // put this week's reps on the program's days (as an edit of the plan, so it wins over last time's reps once)
  function applyWeek(p, pg, week) {
    const reps = p.reps[Math.min(p.reps.length, week) - 1]; if (!reps) return;
    pg.dayIds.forEach(id => { const d = S.getDay(id); if (d) d.items.forEach(it => { if (String(it.reps) !== String(reps)) { it.reps = reps; it.planAt = Date.now(); } }); });
  }
  function programCard() {
    const w = where(); if (!w) return '';
    if (w.done) return `<div class="card" id="progCard"><div class="title">${esc(w.p.name)} finished 🎉</div><p class="small muted mt4">All ${w.p.weeks} weeks done. Its days stay in your list.</p><div class="row mt12"><button class="btn grow" data-act="progStop">Close it</button><button class="btn primary grow" data-act="openPrograms">Pick the next one</button></div></div>`;
    const left = total(w.p) - w.at;
    return `<div class="card" id="progCard" style="border-color:var(--accent)"><div class="row"><div class="grow" style="min-width:0"><div class="k2">${esc(w.p.name)} · week ${w.week} of ${w.p.weeks}</div><div class="title ellipsis">Next: ${w.day ? esc(w.day.name) : 'a day that was deleted'}</div>
      <div class="bar mt8"><div style="width:${Math.round((w.at / total(w.p)) * 100)}%"></div></div><div class="xs muted mt4">${plural(left, 'workout')} to go · aim for ${w.p.reps[w.week - 1]} reps this week</div></div>
      ${w.day ? `<button class="btn sm primary" data-act="startDay" data-id="${w.day.id}">Start ▶</button>` : `<button class="btn sm" data-act="progSkip">Skip</button>`}</div></div>`;
  }
  VIEWS.programs = {
    html() {
      const w = where();
      let h = top('Programs', 'Follow one for a few weeks; GymDay says what is next');
      if (w && !w.done) h += `<div class="card" style="border-color:var(--accent)"><div class="row"><div class="grow"><div class="title">${esc(w.p.name)}</div><div class="xs muted">Week ${w.week} of ${w.p.weeks} · workout ${w.at + 1} of ${total(w.p)}</div></div></div>
        <div class="row mt12"><button class="btn grow" data-act="progSkip">Skip the next workout</button><button class="btn danger grow" data-act="progStopAsk">Stop this program</button></div></div>`;
      h += PROGRAMS.map(p => { const lost = p.days.reduce((n, d) => n + d[1].filter(([id]) => !has(S.getEx(id))).length, 0);
        return `<div class="card"><div class="row"><div class="grow"><div class="title">${p.name}</div><div class="xs muted mt4">${p.weeks} weeks · ${p.text}</div></div></div>
        <div class="xs dim mt8">${p.days.map(d => `<b>${d[0]}</b>: ${d[1].map(([id]) => (S.getEx(id) || {}).name || id).join(', ')}`).join('<br>')}</div>
        ${lost ? `<div class="xs mt8" style="color:#F5B841">${plural(lost, 'exercise')} need${lost === 1 ? 's' : ''} equipment ${esc(gym().name)} does not have; swap them in the day after starting.</div>` : ''}
        <button class="btn ${w && !w.done && w.p.id === p.id ? '' : 'primary'} block mt12" data-act="progStart" data-id="${p.id}" ${w && !w.done && w.p.id === p.id ? 'disabled' : ''}>${w && !w.done && w.p.id === p.id ? 'You are on this one' : 'Start this program'}</button></div>`; }).join('');
      return h;
    }
  };
  ACT.openPrograms = () => A.go('programs');
  ACT.progStart = el => {
    const p = progOf(el.dataset.id); if (!p) return;
    const w = where(); if (w && !w.done && !el.dataset.sure) { A.openSheet(`<h2>Switch to ${esc(p.name)}?</h2><p class="muted">You are in week ${w.week} of ${esc(w.p.name)}. Its days stay in your list; only the program's place is forgotten.</p><div class="row mt16"><button class="btn grow" data-act="closeSheet">Stay</button><button class="btn primary grow" data-act="progStart" data-id="${p.id}" data-sure="1">Switch</button></div>`); return; }
    const dayIds = p.days.map(([name, items]) => { const full = `${p.name} · ${name}`, old = D.days.find(d => d.name === full && d.prog === p.id);
      return (old || Object.assign(S.addDay(full, items.filter(([id]) => S.getEx(id)).map(([ex, sets]) => ({ ex, sets, reps: p.reps[0] }))), { prog: p.id })).id; });
    st().program = { id: p.id, start: Date.now(), at: 0, dayIds };
    applyWeek(p, st().program, 1); S.save(true); A.closeSheet(); A.reset('days'); toast(p.name + ' started');
  };
  ACT.progSkip = () => { const w = where(); if (!w) return; advance(w); S.save(true); A.rerender(); toast('Skipped'); };
  ACT.progStopAsk = () => A.openSheet(`<h2>Stop this program?</h2><p class="muted">Its days stay in your list. Only the program's place is forgotten.</p><div class="row mt16"><button class="btn grow" data-act="closeSheet">Keep going</button><button class="btn danger grow" data-act="progStop">Stop</button></div>`);
  ACT.progStop = () => { delete st().program; S.save(true); A.closeSheet(); A.rerender(); toast('Program closed'); };
  function advance(w) {
    w.pg.at = w.at + 1;
    const nw = Math.min(w.p.weeks, Math.floor(w.pg.at / perWeek(w.p)) + 1);
    if (nw !== w.week && w.pg.at < total(w.p)) applyWeek(w.p, w.pg, nw);
  }
  // a saved workout of the day that was next moves the program on
  const save0 = A.saveSession;
  function onSaved(s) { const w = where(); if (w && !w.done && s && s.dayId && s.dayId === w.dayId) { advance(w); S.save(true); } }

  // ---------------- where Trainer mode shows ----------------
  function trainerCard() {
    if (!on()) return '';
    return programCard() + `<div class="card" id="trainerCard"><div class="k2">Trainer</div><div class="row mt8" style="gap:8px;flex-wrap:wrap">
      <button class="btn sm" data-act="openBuilder">Build me a workout</button><button class="btn sm" data-act="openPrograms">Programs</button><button class="btn sm" data-act="openGym">My gym: ${esc(gym().name)}</button></div>${window.__calm === false && window.Sore && window.Sore.trainerHtml ? window.Sore.trainerHtml(false) : ''}</div>`;          // 1.35.2: soreness is on Today's own card once (not here too); the builder still shows it
  }
  const home0 = I.homeCards; I.homeCards = () => home0() + trainerCard();
  window.SettingsRows.unshift(() => `<div class="row" style="padding:6px 0"><div class="grow"><b>Trainer mode</b><div class="xs dim">Build me a workout, programs that run over weeks, and a list of what your gym has. They appear on the Today page.</div></div><input type="checkbox" data-bind="optTrainer" ${on() ? 'checked' : ''} style="width:22px;height:22px"></div>`);

  // =====================================================================================================
  // v1.20 Warm-up sets (Trainer mode; a switch under it, on until turned off). The first big lift for each body part in a workout
  // starts with a short ramp up to its first working set: about 40% x 10, 60% x 5 and 80% x 3 from 60 kg (135 lb), 50% x 8 and
  // 75% x 4 from 30 kg, 50% x 8 below that, rounded to the plates (2.5 kg / 5 lb) and never under the empty bar on a barbell or a
  // Smith machine. Only barbell, Smith, machine and dumbbell lifts of 20 kg (45 lb) and more, with a weight known from last time.
  // Warm-up sets are logged but never count for records, targets or a muscle's sets; one left unticked is simply not saved.
  // =====================================================================================================
  const WU_EQUIP = ['Barbell', 'Smith', 'Machine', 'Dumbbell'];
  const wuOn = () => on() && st().warmups !== false;
  function ramp(w, equip, lb) {
    const step = lb ? 5 : 2.5, bar = equip === 'Barbell' || equip === 'Smith' ? (lb ? 45 : 20) : step;
    const plan = w >= (lb ? 135 : 60) ? [[0.4, 10], [0.6, 5], [0.8, 3]] : w >= (lb ? 65 : 30) ? [[0.5, 8], [0.75, 4]] : [[0.5, 8]];
    const out = [];
    for (const [k, r] of plan) { const x = Math.max(bar, Math.round(w * k / step) * step); if (x < w && !out.some(o => o.w >= x)) out.push({ w: x, r }); }
    return out;
  }
  function warmups(a) {
    if (!wuOn() || !a || !Array.isArray(a.items)) return 0;
    const lb = (st().unit || 'kg') === 'lb', min = lb ? 45 : 20, reps = st().reps !== false, seen = new Set(); let n = 0;
    for (const it of a.items) {
      const ex = S.getEx(it.ex); if (!ex || it.skipped || ex.track !== 'weight' || !WU_EQUIP.includes(ex.equip) || seen.has(ex.group)) continue;
      if (it.sets.some(x => x.kind === 'w')) { seen.add(ex.group); continue; }          // warm-ups of its own, kept from last time
      const first = it.sets.find(x => x.kind !== 'w'), w = parseFloat(first && first.w) || 0;
      if (w < min) continue;                                                             // light: the next lift for this part may warm up
      const r = ramp(w, ex.equip, lb); if (!r.length) continue;
      it.sets.unshift(...r.map(x => ({ w: String(x.w), r: reps ? String(x.r) : '', done: false, kind: 'w', wu: 1 })));
      seen.add(ex.group); n += r.length;
    }
    return n;
  }
  // after the workout opens: what was added, with Undo
  function warmupNote(a, n) {
    if (!n || !a) return;
    const undo = () => { if (D.active !== a) return; a.items.forEach(it => { it.sets = it.sets.filter(x => !(x.wu && !x.done)); }); S.save(true); A.rerender(); };
    const msg = `${plural(n, 'warm-up set')} added before your first big lifts (Trainer mode)`;
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast(msg, undo); else toast(msg);
  }
  window.SettingsRows.splice(1, 0, () => (on() ? `<div class="row" style="padding:6px 0 6px 14px"><div class="grow">Warm-up sets<div class="xs dim">Trainer mode adds a short ramp (about 40%, 60% and 80% of your first working set) before the first big lift for each body part</div></div><input type="checkbox" data-bind="optWarmups" ${st().warmups !== false ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optWarmups') { st().warmups = t.checked; S.save(); toast(t.checked ? 'Warm-up sets are on' : 'Warm-up sets are off'); } });

  window.Trainer = { on, has, gym, gyms, missing, build, freshest, PROGRAMS, where, onSaved, programCard, warmups, warmupNote, ramp };
})();
