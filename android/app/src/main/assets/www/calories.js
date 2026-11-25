/* GymDay – calories: what you ate, what you burnt, and the difference.
   Food goes in by picking from a list, typing it, or a photo (read by an AI service when the account's server has one set up,
   otherwise you type the number next to the picture). Burnt comes from your watch when it has it, from what you typed
   for that workout, or from an estimate: how long the workout was, your body weight and how hard you said it felt.
   Nothing here judges a day: the numbers are shown plainly, and a goal only appears if you type one. */
(function () {
  const A = window.App, S = window.Store, D = S.data, I = window.Insights;
  const { $, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  const DAY = 86400000;
  const st = () => D.settings;
  const on = () => st().kcal !== false;
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const mode = () => (st().kcMode === 'all' ? 'all' : 'workouts');
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const nextDay = t0 => { const d = new Date(t0); d.setDate(d.getDate() + 1); return d.getTime(); };
  const prevDay = t0 => { const d = new Date(t0); d.setDate(d.getDate() - 1); return d.getTime(); };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dm = ts => { const d = new Date(ts); return `${d.getDate()} ${A.MONTHS_LONG[d.getMonth()].slice(0, 3)}`; };
  const clock = ts => { const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes(), ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return `${h}:${m < 10 ? '0' : ''}${m} ${ap}`; };
  const top = (title, sub) => `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${title}</h1><div class="sub">${sub}</div></div></div>`;
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  if (!Array.isArray(D.food)) D.food = [];
  if (!Array.isArray(D.myFoods)) D.myFoods = [];

  const FOODS = [];          // v1.8: the food list is foods.js (about 30,000 foods with the v1.11 packs and menus), searched by food.js

  // =====================================================================================================
  // Burnt
  // =====================================================================================================
  // body weight in kg nearest before a moment (or the earliest after it); null when none was ever logged
  function weightKg(t) {
    const b = (D.body || []).filter(x => x.kg > 0); if (!b.length) return null;
    const before = b.filter(x => x.t <= t).sort((x, y) => y.t - x.t)[0];
    return (before || b.slice().sort((x, y) => x.t - y.t)[0]).kg;
  }
  const me = () => st().me || {};
  const ageNow = () => { const m = me(); return m.age > 0 ? m.age + Math.floor((Date.now() - (m.ageAt || Date.now())) / (365.25 * DAY)) : 0; };
  // v1.18: the daily energy need follows ICMR-NIN 2020 (Nutrient Requirements for Indians, RDA and EAR), for ages 10 to 100.
  // Adults (19 and up): BMR from the FAO/WHO/UNU 2004 equations (Schofield 1985, by age band and weight), lowered 10% for men and 9% for
  // women as ICMR-NIN 2020 does for Indians, × the physical activity level (PAL): 1.4 mostly sitting, 1.8 moderate, 2.3 heavy (ICMR-NIN's
  // sedentary / moderate / heavy work: they give its own table back, a 65 kg man 2,105 / 2,707 / 3,459 against 2,110 / 2,710 / 3,470
  // kcal and a 55 kg woman 1,658 / 2,132 / 2,724 against 1,660 / 2,130 / 2,720), and 1.6 for GymDay's lightly active step between.
  // 10 to 18: ICMR-NIN keeps the FAO/WHO/UNU 2004 method for children and adolescents, without lowering the BMR: BMR (Schofield, 10-18
  // years) × the PAL of moderate activity for the age + the energy stored in growing (FAO/WHO/UNU 2004 tables 4.1-4.3); a light
  // lifestyle needs 15% less and a heavy one 15% more (section 4.4.3), with the lightly active step between. It gives ICMR-NIN's table
  // back for its reference adolescents (boys 10-12: 2,220, 13-15: 2,860, 16-18: 3,320; girls 2,060 / 2,400 / 2,500 kcal).
  // Workouts and activities are added on top ("Outside the gym I am"). Height is asked but these equations go by weight.
  const ACTS = [['1.2', 'Mostly sitting'], ['1.3', 'Lightly active'], ['1.4', 'Active'], ['1.6', 'Very active']];
  const ACT_SUB = ['desk, classes, screens; little walking', 'on my feet some of the day', 'on my feet most of the day, or a physical job', 'hard physical work most of the day'];
  const actLevel = () => ({ '1.3': 1, '1.4': 2, '1.6': 3 })[String(st().kcAct)] || 0;
  const actK = () => +ACTS[actLevel()][0];
  const ADULT_PAL = [1.4, 1.6, 1.8, 2.3], TEEN_K = [0.85, 0.925, 1, 1.15];
  // FAO/WHO/UNU 2004 tables 4.2 and 4.3, ages 10-11 … 17-18: the PAL of moderate activity and the energy stored in growth (kcal a day)
  const TEEN = { m: { pal: [1.71, 1.75, 1.79, 1.82, 1.84, 1.84, 1.84, 1.83], eg: [22, 25, 29, 33, 33, 30, 24, 15] },
    f: { pal: [1.71, 1.74, 1.76, 1.76, 1.75, 1.73, 1.73, 1.72], eg: [25, 25, 26, 24, 19, 12, 5, 0] } };
  // FAO/WHO/UNU 2004 table 5.2 (Schofield): kcal a day = k × weight + c, for 18-30, 30-60 and 60 and over
  const SCHO = { m: [[15.057, 692.2], [11.472, 873.1], [11.711, 587.7]], f: [[14.818, 486.6], [8.126, 845.6], [9.082, 658.5]] };
  function bmrOf(sex, a, w) {
    if (a <= 18) return sex === 'm' ? 17.686 * w + 658.2 : 13.384 * w + 692.6;            // 10-18 years (Schofield), not lowered for children
    const [k, c] = SCHO[sex][a < 30 ? 0 : a < 60 ? 1 : 2];
    return (k * w + c) * (sex === 'm' ? 0.90 : 0.91);
  }
  function needOf(sex, a, w, lvl) {
    if (a <= 18) { const i = Math.max(0, Math.min(7, a - 10)), T = TEEN[sex]; return (bmrOf(sex, a, w) * T.pal[i] + T.eg[i]) * TEEN_K[lvl]; }
    return bmrOf(sex, a, w) * ADULT_PAL[lvl];
  }
  // a body not given as male or female: halfway between the two
  const bySex = f => { const s = me().sex; return s === 'm' || s === 'f' ? f(s) : (f('m') + f('f')) / 2; };
  const known = t => { const m = me(), w = weightKg(t || Date.now()), a = ageNow(); return m.h > 0 && a > 0 && w ? { a: Math.max(10, a), w } : null; };
  // Energy the body uses at rest in a day (BMR as above); null until height and age are known
  function rest(t) { const k = known(t); return k ? bySex(s => bmrOf(s, k.a, k.w)) : null; }
  // the whole day's need at the person's activity outside the gym, rounded to 10 kcal
  const everyday = t => { const k = known(t); return k ? Math.round(bySex(s => needOf(s, k.a, k.w, actLevel())) / 10) * 10 : null; };
  // v1.21.10: the everyday burn in its parts: the body at rest, and the rest of a normal day (moving about, digesting food, and
  // growing under 19), at the activity level set in About me
  const everydayParts = t => {
    const e = everyday(t), r = rest(t), k = known(t); if (e == null || r == null) return null;
    return { every: e, rest: Math.round(r), life: Math.max(0, e - Math.round(r)), level: (ACTS.find(a => a[0] === String(st().kcAct)) || ACTS[0])[1], kg: k ? k.w : null, young: k ? k.a < 19 : false };
  };
  const FEELS = { easy: 'easy', ok: 'OK', hard: 'hard' };
  // v1.17: the everyday burn already counts the whole day, the time of a workout or an activity included (at the person's usual pace
  // of a day), so only what it burnt beyond that is added: its calories minus the everyday burn's share of those minutes. Calories
  // that leave out the resting part ("active") get it back first. `per` is that share a minute: the everyday burn ÷ 1440, or the
  // resting burn's on a day counted from the watch.
  const restPerMin = t => { const r = rest(t); return (r != null ? r : (weightKg(t) || 70) * 24) / 1440; };
  const everyPerMin = t => { const e = everyday(t); return e != null ? e / 1440 : restPerMin(t); };
  const beyond = (gross, mins, per) => Math.max(0, Math.round(gross - per * mins));
  // What one workout burnt: { kcal (what is shown), net (what it adds to the everyday burn), src: typed | watch | shot | est | none }
  function burnOf(s) {
    const mins = Math.max(0, S.gymMs(s) / 60000), w = weightKg(s.start), restMin = restPerMin(s.start), per = everyPerMin(s.start);
    // v1.21.8: also `gross` (with the resting part), `cm` (the minutes the everyday share is taken for) and `per`, to say what is added and why
    if (s.man && s.man.kcal > 0) return { kcal: s.man.kcal, net: beyond(s.man.kcal, mins, per), src: 'typed', mins, gross: s.man.kcal, cm: mins, per };
    // v1.12: read from screenshots of the watch's or app's summary (total calories include the resting part, over the watch's own time)
    if (s.shot && s.shot.kcal > 0) { const m = s.shot.mins || mins, g = s.shot.kcal + (s.shot.kind === 'active' ? restMin * m : 0); return { kcal: s.shot.kcal, net: beyond(g, m, per), src: 'shot', app: s.shot.app || '', mins, gross: g, cm: m, per, active: s.shot.kind === 'active', restMin }; }
    if (s.hc && s.hc.kcal > 0) { const g = s.hc.kcal + (s.hc.kind === 'total' ? 0 : restMin * mins); return { kcal: s.hc.kcal, net: beyond(g, mins, per), src: 'watch', mins, gross: g, cm: mins, per, active: s.hc.kind !== 'total', restMin }; }
    if (!(mins >= 1)) return { kcal: 0, net: 0, src: 'none', mins, gross: 0, cm: 0, per };
    // lifting weights uses about 3.5 times resting energy when it is easy and about 6 times when it is hard
    const met = s.feel === 'easy' ? 3.5 : s.feel === 'hard' ? 6 : s.feel === 'ok' ? 5 : 4.5, kg = w || 70;
    return { kcal: Math.round(met * kg * mins / 60 / 5) * 5, net: beyond(met * kg * mins / 60, mins, per), src: 'est', mins, kg, guess: !w, feel: s.feel, gross: met * kg * mins / 60, cm: mins, per };
  }
  // what an activity adds to its day's Burnt (see dayOf). v1.21.8: on a day counted from the watch, one that started after the watch's
  // numbers were taken (`cut`) can't be in its total: the rest of that day counts at the usual pace, so it adds what it burnt beyond that
  const addOf = (b, x, base, onWatch, cut) => (onWatch ? (cut != null && x.t >= cut ? beyond(b.gross, b.mins, b.per) : x.watch === 0 ? beyond(b.gross, b.mins, b.restMin) : 0)
    : base != null ? beyond(b.gross, b.mins, base / 1440) : b.kcal);
  // v1.21.8: when the watch's numbers for a day were taken: the time the person set (`upto`), else when they were added (`at`); only a
  // time inside that day counts (numbers added the next day, or marked as the whole day, cover all of it)
  const cutOf = (act, t0, t1) => { if (!act || act.whole) return null; const c = act.upto || act.at; return c >= t0 && c < t1 ? c : null; };
  // 1.24: the day's numbers came in by themselves from Health Connect (hcauto.js), and nobody has typed over them
  const viaHc = act => !!(act && act.hc && !act.typed);
  // v1.17: an activity added on the Food tab (sports.js): { kcal (shown), gross (with the resting part), mins, src: est | typed | shot }
  function actBurn(x) {
    const mins = Math.max(0, num(x.mins)), w = weightKg(x.t), kg = w || 70, restMin = restPerMin(x.t);
    let kcal = 0, kind = '';
    if (x.how === 'typed') { kcal = Math.round(num(x.kc)); kind = x.kk || ''; }
    else if (x.how === 'shot') { kcal = Math.round(num(x.shot && x.shot.kcal)); kind = (x.shot && x.shot.kind) || ''; }
    else kcal = Math.round(num(x.met) * kg * mins / 60 / 5) * 5;
    const gross = (x.how === 'typed' || x.how === 'shot' ? kcal : num(x.met) * kg * mins / 60) + (kind === 'active' ? restMin * mins : 0);
    return { kcal, gross, mins, src: x.how || 'est', kind, kg, guess: !w && (x.how || 'est') === 'est', restMin, per: everyPerMin(x.t) };
  }
  const srcText = b => b.src === 'typed' ? 'typed by you' : b.src === 'watch' ? 'from your watch' : b.src === 'shot' ? `from your screenshots${b.app ? ' · ' + b.app : ''}` : b.src === 'est'
    ? `estimate: ${Math.round(b.mins)} min${b.feel ? ' that felt ' + FEELS[b.feel] : ''} at ${A.fmtW(Math.round(b.kg))} kg${b.guess ? ' (log your body weight for a closer number)' : ''}` : 'no time recorded';

  function dayOf(t0) {
    const t1 = nextDay(t0);
    const food = (D.food || []).filter(f => f.t >= t0 && f.t < t1).sort((a, b) => a.t - b.t);
    const ws = D.sessions.filter(s => s.start >= t0 && s.start < t1).sort((a, b) => a.start - b.start).map(s => ({ s, b: burnOf(s) }));
    const eaten = food.reduce((a, f) => a + (f.kcal || 0), 0), protein = food.reduce((a, f) => a + (f.p || 0), 0);
    const carbs = food.reduce((a, f) => a + (f.c || 0), 0), fat = food.reduce((a, f) => a + (f.f || 0), 0), fibre = food.reduce((a, f) => a + (f.fib || 0), 0);
    const sp = (D.sports || []).filter(x => x.t >= t0 && x.t < t1).sort((a, b) => a.t - b.t).map(x => ({ x, b: actBurn(x) }));
    const base = mode() === 'all' ? everyday(t0) : null;
    const act = actOf(t0), onWatch = !!(act && (act.kt > 0 || (act.ka > 0 && rest(t0) != null))), cut = onWatch ? cutOf(act, t0, t1) : null;
    // v1.17: what each activity adds. On a day counted from the watch, one done with the watch on is already in its total (one not yet
    // answered counts as on until it is: it can't be counted twice); one done without it adds what it burnt beyond resting.
    // v1.21.8: one that started after the watch's numbers were taken adds what it burnt beyond the usual pace (see addOf)
    for (const y of sp) { y.after = cut != null && y.x.t >= cut; y.add = addOf(y.b, y.x, base, onWatch, cut); }
    // what each workout adds: beyond the everyday burn's share of its time; on a watch day nothing (it is in the watch's total)
    // unless it started after the watch's numbers were taken (v1.21.8); with Burnt counting workouts only, all of it
    for (const x of ws) { x.after = cut != null && x.s.start >= cut; x.add = onWatch ? (x.after ? x.b.net : 0) : base != null ? x.b.net : x.b.kcal; }
    const gym = ws.reduce((a, x) => a + x.b.kcal, 0) + sp.reduce((a, y) => a + y.b.kcal, 0), net = ws.reduce((a, x) => a + x.b.net, 0), spAdd = sp.reduce((a, y) => a + y.add, 0);
    let burnt = base != null ? base + net + spAdd : ws.reduce((a, x) => a + x.b.kcal, 0) + spAdd, watch = '', wv = 0, tail = 0;
    // v1.13: the whole day read from the watch's screenshots counts instead (its total already has the workouts in it).
    // v1.21.8: numbers taken during the day (`cut`) cover the day up to then: the rest of the day counts at the usual pace (`tail`;
    // with only active calories, the resting part of the whole day is already in), and the workouts after it add theirs (`wAfter`)
    const wAfter = ws.reduce((a, x) => a + (x.after ? x.add : 0), 0), left = cut != null ? (t1 - cut) / 60000 : 0;
    if (act && act.kt > 0) { watch = 'total'; wv = act.kt; tail = Math.round(everyPerMin(t0) * left); burnt = wv + tail + wAfter + spAdd; }
    else if (act && act.ka > 0) { const r = rest(t0); if (r != null) { watch = 'active'; wv = Math.round(r + act.ka); tail = Math.round(Math.max(0, everyPerMin(t0) - restPerMin(t0)) * left); burnt = wv + tail + wAfter + spAdd; } }
    return { t0, food, ws, sp, eaten, protein, carbs, fat, fibre, gym, base, burnt, watch, act, onWatch, cut, wv, tail, diff: eaten - burnt };
  }

  // =====================================================================================================
  // The screen
  // =====================================================================================================
  let cur = dayStart(Date.now()), span = 7, moreOpen = false;          // 1.35.2: "More about this day" stays open once opened (until the app restarts)
  // 1.35.2: GymDay left open overnight: at the next look (or at midnight) the Food tab moves on to the new day if it was on
  // today, so breakfast doesn't go into yesterday. tidy.js calls this and redraws.
  let todayWas = cur;
  function rollDay() { const t = dayStart(Date.now()); if (t === todayWas) return false; if (cur === todayWas) cur = t; todayWas = t; return true; }
  const isToday = () => cur === dayStart(Date.now());
  const dayLabel = t0 => { const t = dayStart(Date.now()); return t0 === t ? 'Today' : t0 === prevDay(t) ? 'Yesterday' : `${WD[new Date(t0).getDay()]} ${dm(t0)}`; };
  const thumbOf = f => (f.pic ? S.loadPhoto(f.pic) : '');

  function chart() {
    const days = []; let t = dayStart(Date.now()); for (let i = 0; i < span; i++) { days.unshift(dayOf(t)); t = prevDay(t); }
    const goal = goalKcal(), tk = A.ticks3(0, Math.max(500, goal, ...days.map(d => Math.max(d.eaten, d.burnt))), true), hi = tk[2];      // 1.33: round numbers on the left
    const W = 320, H = 150, L = 6, B = 22, T = 10, slot = (W - 2 * L) / span, bw = Math.max(2, Math.min(13, slot / 2 - (span > 10 ? 0.6 : 2)));
    const y = v => T + (H - T - B) * (1 - v / hi);
    let g = '';
    days.forEach((d, i) => {
      const cx = L + slot * (i + 0.5), sel = d.t0 === cur;
      if (sel) g += `<rect x="${(cx - slot / 2).toFixed(1)}" y="${T - 6}" width="${slot.toFixed(1)}" height="${H - T - B + 8}" rx="6" fill="var(--bg3)"/>`;
      if (d.eaten) g += `<rect class="kc-e" x="${(cx - bw - 0.5).toFixed(1)}" y="${y(d.eaten).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y(d.eaten)).toFixed(1)}" rx="${Math.min(3, bw / 2)}"/>`;
      if (d.burnt) g += `<rect class="kc-b" x="${(cx + 0.5).toFixed(1)}" y="${y(d.burnt).toFixed(1)}" width="${bw.toFixed(1)}" height="${(H - B - y(d.burnt)).toFixed(1)}" rx="${Math.min(3, bw / 2)}"/>`;
      if (span <= 10 || (span - 1 - i) % 5 === 0) g += `<text x="${cx.toFixed(1)}" y="${H - 6}" font-size="11" text-anchor="middle" fill="var(--${sel ? 'text' : 'dim'})">${span <= 10 ? WD[new Date(d.t0).getDay()][0] : new Date(d.t0).getDate()}</text>`;
      g += `<rect x="${(cx - slot / 2).toFixed(1)}" y="0" width="${slot.toFixed(1)}" height="${H}" fill="transparent" data-act="kcDay" data-t="${d.t0}"/>`;
    });
    if (goal) g = `<line x1="${L}" x2="${W - L}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}" stroke="var(--dim)" stroke-width="1" stroke-dasharray="3 4"/>` + g;
    g = A.gridY(tk, y, L, W - L) + g;
    const logged = days.filter(d => d.food.length), avg = (list, k) => list.length ? list.reduce((a, d) => a + d[k], 0) / list.length : 0;
    const sum = logged.length
      ? `On the ${logged.length} day${logged.length === 1 ? '' : 's'} with food logged: about <b>${n0(avg(logged, 'eaten'))}</b> eaten and <b>${n0(avg(logged, 'burnt'))}</b> burnt a day, a difference of <b>${diffText(avg(logged, 'eaten') - avg(logged, 'burnt'))}</b>.`
      : `No food logged in these ${span} days. Burnt: about <b>${n0(avg(days, 'burnt'))}</b> a day.`;
    return `<div class="card" id="kcChart"><div class="row"><h3 class="grow" style="margin:0">Eaten and burnt</h3>
      <button class="chip ${span === 7 ? 'on' : ''}" data-act="kcSpan" data-n="7">7 days</button><button class="chip ${span === 30 ? 'on' : ''}" data-act="kcSpan" data-n="30">30 days</button></div>
      ${A.withY(`<svg class="chart kc-chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Calories eaten and burnt each day"${A.ptsAttr(days.map((d, i) => [L + slot * (i + 0.5), null, dayLabel(d.t0), `${n0(d.eaten)} eaten · ${n0(d.burnt)} burnt`]))}>${g}</svg>`, tk, y, H, t => (t >= 10000 ? Math.round(t / 1000) + 'k' : n0(t)), 'mt8')}
      <div class="kc-key"><span><i class="kc-e"></i>Eaten</span><span><i class="kc-b"></i>Burnt</span>${goal ? '<span><i class="kc-g"></i>Your goal</span>' : ''}</div>
      <p class="xs muted mt8">${sum}</p><button class="btn sm mt8" data-act="kcWeek">Weekly report</button></div>`;
  }
  const diffText = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))} kcal`;
  // the daily target in kcal (food.js works it out from a goal), else the typed goal, else none
  const goalKcal = t => { const F = window.Food, tg = F && F.targets ? F.targets(t) : null; return tg && tg.kcal > 0 ? tg.kcal : st().kcGoal > 0 ? st().kcGoal : 0; };

  VIEWS.calories = {
    html() {
      if (st().water) { delete st().water; S.save(); }                       // v1.13: water was taken out of the app, with what it had kept
      const d = dayOf(cur), all = mode() === 'all', goal = goalKcal(cur), F = window.Food;
      // v1.12: the Food tab (second in the bottom bar); opened from another screen it has a back button
      let h = `<div class="top">${A.depth() > 1 ? '<button class="back" data-act="back">‹</button>' : ''}<div class="grow"><h1>Food</h1><div class="sub">What you eat, against your daily limits</div></div><button class="btn sm" data-act="kcMe">About me</button></div>`
        + `<div class="kc-day"><button class="ib" data-act="kcPrev" aria-label="The day before">‹</button><div class="grow"><b>${dayLabel(cur)}</b></div>${isToday() ? '' : `<button class="chip sm today-pill" data-act="kcToday">Today ›</button>`}<button class="ib" data-act="kcNext" ${isToday() ? 'disabled' : ''} aria-label="The day after">›</button></div>
        <div class="stats"><div class="stat tap kc-stat-go" id="kcEaten" data-act="kcEatenWhy"><div class="k2">Eaten <span class="kc-go" aria-hidden="true">›</span></div><div class="v">${n0(d.eaten)}</div><div class="k">kcal${d.protein ? ` · ${Math.round(d.protein)} g protein` : ''}</div></div>
          <div class="stat tap kc-stat-go" id="kcBurnt" data-act="kcBurntWhy"><div class="k2">Burnt <span class="kc-go" aria-hidden="true">›</span></div><div class="v">${n0(d.burnt)}</div><div class="k">${d.watch ? 'whole day, your watch' : d.base != null ? 'everyday + workouts' : 'in workouts'}</div></div></div>`
      ;
      // 1.35.2 (calmer Food tab): the ways to add food come straight after the day's numbers, then the one question and the
      // target; the rarely needed cards are under "More about this day" at the bottom (tests keep the old order with __calm)
      const calm = window.__calm !== false;
      const pre = (window.Review ? window.Review.askCard() : '') + (F ? F.targetCard(d) : '') + (window.Review ? window.Review.card(d) : '');
      if (!calm) h += pre;
      const diffCard = `<div class="card" id="kcDiff"><div class="row"><div class="grow"><div class="k2">Eaten − burnt</div><div class="title">${diffText(d.diff)}</div></div>
          ${goal ? `<div class="right"><div class="k2">Target</div><div class="small">${n0(goal)} · ${d.eaten <= goal ? n0(goal - d.eaten) + ' left' : n0(d.eaten - goal) + ' over'}</div></div>` : ''}</div>
          <p class="xs muted mt8">${d.watch && d.cut != null ? `Burnt is ${d.watch === 'total' ? "your watch's total" : "your resting burn plus your watch's active calories"} up to ${clock(d.cut)}, ${viaHc(d.act) ? 'the newest it sent through Health Connect' : 'when its numbers were taken'}, plus the rest of the day at your usual pace and what you did after it.` : d.watch === 'total' ? (viaHc(d.act) ? "Burnt is your watch's total for the whole day, from Health Connect (your workouts are in it)." : d.act && d.act.typed ? "Burnt is your watch's total for the whole day, as you typed it (your workouts are in it)." : "Burnt is your watch's total for the whole day, read from its screenshots (your workouts are in it).") : d.watch === 'active' ? "Burnt is your resting burn plus your watch's active calories for the day." : d.base != null ? 'Burnt is your everyday burn for the whole day plus what your workouts and activities added on top of it.' : all ? `To count everyday burn too, add your height and age. <span class="accent" data-act="kcMe">About me</span>` : `Burnt counts workouts and activities only, so this is not your whole day. <span class="accent" data-act="kcMe">Count everyday burn too</span>`}</p></div>`;
      h += `<div class="kc-adds"><button class="btn primary" data-act="kcAdd">+ Add food</button><button class="btn" data-act="kcPhoto">📷 Photo</button><button class="btn" data-act="kcScan">▥ Scan</button></div>
        <div class="kc-adds2"><button class="btn kc-outbtn" data-act="kcOut">🍽 Eating out</button>${F && F.whatNow && isToday() ? `<button class="btn kc-whatbtn" data-act="kcWhatNow">🤔 What should I eat?</button>` : ''}</div>`;
      if (calm) h += pre;
      h += waitCard() + weekCard();                         // v1.27: photos taken without a signal
      h += F ? F.mealsHtml(d) + (window.Meals ? window.Meals.card(cur) : '') + F.pinsHtml(d) + (window.Supps ? window.Supps.card(cur) : '') : '';
      h += actCard(d);
      // v1.17: what each one adds on top of the everyday burn (the everyday burn already counts its time at your usual pace).
      // v1.21.8: and why, in a line under it; on a watch day, in its total or (started after its numbers were taken) what it adds
      const addsTo = x => (d.watch ? (x.after ? `<div class="xs dim">adds ${n0(x.add)}</div>` : `<div class="xs dim">in your watch's total</div>`) : d.base != null ? `<div class="xs dim">adds ${n0(x.add)}</div>` : '');
      const whyTo = x => (x.b.src === 'none' ? '' : d.watch ? (x.after ? `<div class="xs dim kc-why">after your watch's numbers (${clock(d.cut)})</div>` : '')
        : d.base != null ? `<div class="xs dim kc-why">everyday burn already counts ${n0(x.b.per * x.b.cm)} for ${minText(x.b.cm)}</div>` : '');
      const SP = window.Sports;
      h += `<div class="card" id="kcWork"><h3>Burnt</h3>${d.ws.map(x => `<div class="list-item tap" data-act="kcOpenS" data-id="${esc(x.s.id)}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(x.s.dayName || 'Workout')}</div><div class="xs muted">${srcText(x.b)}</div>${whyTo(x)}</div><div class="right"><div class="small" style="font-weight:700">${x.b.src === 'est' ? '≈ ' : ''}${n0(x.b.kcal)}</div>${addsTo(x)}</div></div>`).join('')}
        ${SP ? d.sp.map(y => SP.rowHtml(y, d)).join('') : ''}${d.ws.length || d.sp.length ? '' : `<p class="small muted">No workout or activity ${isToday() ? 'yet today' : 'that day'}.</p>`}
        ${d.base != null && !(d.watch && d.cut != null) ? `<div class="list-item"><div class="grow"><div class="small" style="font-weight:600">Everyday burn</div><div class="xs muted">ICMR-NIN 2020, from your weight, age and how active you are</div></div><div class="small" style="font-weight:700">≈ ${n0(d.base)}</div></div>` : ''}
        ${d.watch ? `<div class="list-item tap" data-act="acView" id="kcWatchRow"><div class="grow"><div class="small" style="font-weight:600">${d.cut != null ? `Your watch, up to ${clock(d.cut)}` : 'Whole day, from your watch'}</div><div class="xs muted">${d.cut == null ? (d.watch === 'total' ? `counted as Burnt instead of the lines above${d.sp.some(y => y.add > 0) ? ', with what you did without the watch on top' : ''}` : 'your resting burn + its active calories, counted as Burnt')
          : `${d.watch === 'total' ? 'its total' : 'your resting burn + its active calories'}, with whatever it recorded before then · ${viaHc(d.act) ? 'kept up to date from Health Connect' : 'tap to change the time'}`}</div></div><div class="small" style="font-weight:700">${n0(d.cut == null ? d.burnt : d.wv)}</div></div>` : ''}
        ${d.watch && d.cut != null ? `<div class="list-item" id="kcTailRow"><div class="grow"><div class="small" style="font-weight:600">Rest of the day after ${clock(d.cut)}</div><div class="xs muted">at your usual pace, until you add new numbers from your watch</div></div><div class="small" style="font-weight:700">+ ${n0(d.tail)}</div></div>` : ''}
        ${SP ? `<button class="btn block mt12" data-act="mvAdd">+ Add an activity</button><div class="xs dim mt4" style="text-align:center">A sport, a walk, a swim… by its calories${wOn() ? ', a photo of your watch' : ''}, or how long and how hard</div>` : ''}</div>`;
      if (calm) h += `<details class="card kc-moreday" id="kcMore"${moreOpen ? ' open' : ''}><summary class="kc-moreday-s">More about this day <span class="xs dim">eaten − burnt, the chart, body weight</span></summary>${diffCard + chart() + weightCard()}</details>`;
      else h += diffCard + chart() + weightCard();
      h += `<details class="card kc-how"><summary>How these numbers are worked out</summary>
        <p class="xs muted mt8"><b>Eaten</b> is what you log. The food list holds about 21,000 foods (30,000 with the packets and menus) from open food tables (the US Department of Agriculture, the Indian Nutrient Databank, the UK's McCance and Widdowson's, Australia's AUSNUT, the FAO's West African table and, for Indian fruits, coconut water and sugarcane juice, ICMR-NIN's Indian Food Composition Tables 2017), with typical values, plus about 580 versions made different ways (rice by variety, rotis by flour, milk by fat, fish by Indian name, regional dishes) that GymDay worked out from those tables, each with a note saying how; a home recipe, the oil used and the size of the serving all change the real number. About 30 protein powders, protein foods and creatines carry their maker's own label numbers (searched in November 2026; makers change recipes, so check your tub). About 8,900 Indian packets come from Open Food Facts, from their labels as people entered them (© Open Food Facts contributors, open data under the Open Database License, ODbL); a packet not in the app is looked up online there. McDonald's India's menu comes from its published nutrition booklet (North & East); Pizza Hut's personal pan pizzas from its nutrition booklet; KFC, Burger King, Subway, Starbucks, La Pino'z and Wow! Momo from the numbers they list on Swiggy (read 16 November 2026), each checked against its own calories, with protein, carbs and fat worked out from a typical recipe where a chain lists only calories (marked as estimates); a few Domino's items are FatSecret India's estimates, because Domino's doesn't publish its numbers where they could be read. A dish that isn't in the app can be looked up on the web, with the pages the numbers came from. The 165 restaurant dishes under Eating out are foods from these tables served at restaurant portions; GymDay worked out the few that are not in a table from their recipes, each with a note.</p>
        <p class="xs muted mt8"><b>Closer numbers (1.13)</b>: chapatis and rotis count as cooked (the Indian Nutrient Databank's number is for the dough, which put a chapati about a quarter too low): a medium one of 43 g is about 100 kcal. The Databank's chai has no sugar, so there are versions with 1½ and 2½ teaspoons a cup, and the overview asks about sugar in plain tea and ghee on rotis. Each line the AI reads from a meal photo takes the food list's numbers at the grams it saw, because photo apps tend to guess big plates too low (1.14: at home and eaten out, with vitamins and minerals too). Your home cooking's oil (asked once) adds about 3 g of fat to 100 g of curries, dals, sabzis, rice dishes and parathas from the Indian list when you cook with more oil, or takes off up to 2 g with less.</p>
        <p class="xs muted mt8"><b>Burnt for the whole day</b>: when you add screenshots of your watch app's summary for a day, its total for the day is used (your workouts are already in it); with only active calories, your resting burn plus those. Numbers taken during the day (1.21.8) count up to that time: the rest of the day counts at your usual pace, and workouts and activities after it add what they burnt beyond that. The time is when you added them; change it in the watch's day if you took them earlier.</p>
        <p class="xs muted mt8"><b>What a workout adds (1.21.8)</b>: your everyday burn already counts every minute of the day, gym time included, at your usual pace, so a workout adds what it burnt beyond that. Each workout shows how much of it is already counted and what it adds.</p>
        <p class="xs muted mt8"><b>Burnt in a workout</b> is taken from your watch when it recorded the workout, or from what you typed for it. Without either it is an estimate from how long the workout was, your body weight and how hard you said it felt. An estimate like this can easily be off by a fifth.</p>
        <p class="xs muted mt8"><b>Activities (1.17)</b>: a sport, a walk or a swim is added with its calories from your watch (typed, or read from a photo of it), or worked out from how long it was, how hard you played and how tired you feel, with the energy each one takes from the 2024 Adult Compendium of Physical Activities (metabolic equivalents, METs: 1 MET is about 1 kcal per kg of body weight an hour). <b>Nothing is counted twice:</b> the everyday burn already counts every minute of the day at your usual pace, so a workout or an activity adds only what it burnt beyond that (its calories minus the everyday burn's share of its minutes; calories that leave out resting get that part back first). On a day counted from your watch's whole-day total, an activity done with the watch on is already in it; one done without it adds what it burnt beyond resting.</p>
        <p class="xs muted mt8"><b>Everyday burn</b> is what a body of your weight, age and sex uses in a day at your activity outside the gym, by ICMR-NIN 2020 (see Daily limits below), also an estimate. You choose in Settings whether it is counted.</p>
        <p class="xs muted mt8"><b>Vitamins and minerals</b>: 25 of them for each food, from the same food tables (a food whose table has no number for one isn't counted for it), plus your supplements, against the daily needs that ICMR-NIN 2020 sets for your age and sex, with the safe upper limits.</p>
        <p class="xs muted mt8"><b>Caffeine, the smart target and planned meals (1.20)</b>: caffeine is counted from the US Department of Agriculture's own numbers for its foods, and for other foods from the same drink's US number by name (brewed coffee 40 mg in 100 g, coffee with milk 36, tea 20, cola 10, energy drinks 32, espresso 212), against 400 mg a day for adults (US FDA, EFSA, Health Canada) or 2.5 mg a kg under 18 (Health Canada). The smart target compares what you logged with your weight trend over 3 weeks (7,700 kcal a kg) and only suggests a change, at most 250 kcal at a time. Typed meals, thalis and planned meals use the food list's numbers for each food, like a meal photo.</p>
        <p class="xs muted mt8"><b>Fresh Indian foods (1.19)</b>: tender coconut water and malai, sugarcane juice, juice-stall juices, nimbu pani, fresh lime soda, chaas, lassi and other fresh drinks (sweet, salted or no sugar), street snacks made fresh, and Indian fruits, mango and banana kinds. ICMR-NIN's Indian Food Composition Tables 2017 measured 54 of them on Indian produce; the drinks and snacks are worked out from it (or another table where it has nothing), each with a note saying how. Its vitamin D for plant foods is left out: other tables find none in them.</p>
        <p class="xs muted mt8"><b>Daily limits (1.18, ICMR-NIN 2020)</b>: calories from your goal and what a day like your last two weeks uses, with safe limits (a cut is never more than 500 kcal and is smaller for anyone under 18), or your own numbers. Your everyday need follows ICMR-NIN's Nutrient Requirements for Indians (2020): for adults, your basal burn from the FAO/WHO/UNU equations for your age and weight, lowered 10% for men and 9% for women as ICMR-NIN does for Indians, times 1.4 mostly sitting, 1.6 lightly active, 1.8 active or 2.3 very active (ICMR-NIN's sedentary, moderate and heavy, which give a 65 kg man its 2,110 / 2,710 / 3,470 kcal); for 10 to 18 years, the FAO/WHO/UNU 2004 method ICMR-NIN keeps for children (basal burn × the activity level for the age, plus the energy that growing stores; 15% less for a sitting day, 15% more for a very active one). Protein 1.6 g for each kg (1.8 when cutting), the amount for someone who trains, never under ICMR-NIN's minimum for your age (0.83 to 0.91 g a kg); fat about 27% of calories (20 to 35%); carbs the rest (45 to 65%); fibre 15 g for each 1,000 kcal (ICMR-NIN: 30 g in 2,000 kcal). Saturated fat under 10% of calories (WHO, ICMR-NIN), salt 5 g (2,000 mg sodium, ICMR-NIN), sugars 90 g in 2,000 kcal for all sugars (the UK and EU reference intake), with ICMR-NIN's 5% of calories for added sugar shown under the bars. Sugar and saturated fat come from the food tables; the Indian Nutrient Databank gives added sugar only, so an Indian recipe's milk or fruit sugar isn't counted.</p>
        <p class="xs muted mt8"><b>Checked</b>: every Indian Nutrient Databank recipe's calories now fit its own protein, carbs, fat and fibre (a few, like chicken pulao, didn't); a dozen recipes whose 100 g was far too dry (plain dosa at 381 kcal in 100 g) were scaled to the same dish in the other tables, keeping the calories of one piece; foreign packs were taken out.</p>
        <p class="xs muted mt8"><b>Overview</b>: worked out by the app from what you logged, against your daily limits. A vitamin or mineral counts as low under half of what you need, and only when most of the foods have a number for it (food lists rarely count the iodine in iodised salt). The foods it suggests are everyday ones with the most of what is missing for their size, picked by what you eat.</p>
        <p class="xs muted mt8"><b>Effort</b> is your average heart rate as a share of your maximum (the highest your watch has recorded in a workout, or 208 − 0.7 × your age), in the American College of Sports Medicine's bands: under 57% very light, 57–63% light, 64–76% moderate, 77–95% vigorous, 96% and over near-maximal. Steps a day follow Tudor-Locke and others (2008), whose bands are for adults: under 5,000 mostly sitting, from 5,000 lightly active, 7,500 fairly active, 10,000 active and 12,500 very active.</p>
        <p class="xs muted mt8">Treat all of it as a guide to the trend over weeks, not an exact count for one day.</p></details>`;
      return h;
    },
    refresh() { return Promise.resolve(); }
  };
  ACT.openCalories = () => { cur = dayStart(Date.now()); A.setRoot('calories'); };
  document.addEventListener('toggle', e => { const t = e.target; if (t && t.id === 'kcMore') moreOpen = t.open; }, true);

  // ---------------------------------------------------------------- v1.12: body weight and the weekly report (v1.13: water taken out)
  const keyDay = t0 => { const d = new Date(t0); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  function weightCard() {
    const b = (D.body || []).filter(x => x.kg > 0).sort((x, y) => x.t - y.t), now = Date.now(), pts = b.filter(x => x.t >= now - 90 * DAY), last = b[b.length - 1];
    const ago = days => { for (let i = b.length - 1; i >= 0; i--) if (b[i].t <= now - days * DAY) return b[i]; return null; };
    const old = ago(30), ch = last && old ? Math.round((last.kg - old.kg) * 10) / 10 : null;
    let g = '';
    if (pts.length >= 2) {
      const W = 320, H = 110, tk = A.ticks3(Math.min(...pts.map(p => p.kg)), Math.max(...pts.map(p => p.kg)), true), lo = tk[0], hi = tk[2];      // 1.33: round numbers on the left
      const x = t => 8 + (W - 16) * (t - (now - 90 * DAY)) / (90 * DAY), y = v => 10 + (H - 30) * (1 - (v - lo) / (hi - lo || 1));
      g = `<svg class="chart kc-wchart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight over 90 days"${A.ptsAttr(pts.map(p => [x(p.t), y(p.kg), A.fmtDate(p.t), `${A.fmtW(p.kg)} ${A.unit()}`]))}>${A.gridY(tk, y, 8, W - 8)}<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map(p => x(p.t).toFixed(1) + ',' + y(p.kg).toFixed(1)).join(' ')}"/>${pts.map(p => `<circle cx="${x(p.t).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="2.6" fill="var(--accent)"/>`).join('')}
        <text x="8" y="${H - 4}" font-size="11" fill="var(--dim)">90 days ago</text><text x="${W - 8}" y="${H - 4}" font-size="11" text-anchor="end" fill="var(--dim)">today</text></svg>`;
      g = A.withY(g, tk, y, H, t => A.fmtW(t), 'mt8');
    }
    return `<div class="card" id="kcWeight"><div class="row"><div class="grow"><h3 style="margin:0">Body weight</h3><div class="xs muted">${last ? `${A.fmtW(last.kg)} ${A.unit()} on ${dm(last.t)}${ch != null ? ` · ${ch > 0 ? '+' : ch < 0 ? '−' : ''}${A.fmtW(Math.abs(ch))} in 30 days` : ''}` : 'Weigh yourself once a week, at the same time of day, and see whether your target is working.'}</div></div><button class="btn sm" data-act="kcWeigh">+ Weight</button></div>${g}
      ${pts.length === 1 ? '<p class="xs dim mt8">Log it again next week to see the line.</p>' : ''}</div>`;
  }
  ACT.kcWeigh = () => A.openSheet(`<h2>Body weight</h2><p class="small muted">Weigh yourself at the same time of day each time, ideally in the morning.</p>
    <div class="row mt12" style="gap:10px"><input class="input grow" id="kcWIn" type="text" inputmode="decimal" autocomplete="off" placeholder="Today's weight in ${A.unit()}"><button class="btn primary" data-act="kcWeighSave">Save</button></div>`,
    sh => { const i = sh.querySelector('#kcWIn'); if (i) setTimeout(() => i.focus(), 200); });
  ACT.kcWeighSave = () => {
    const raw = (($('#kcWIn') || {}).value || '').trim(), v = A.num(raw); if (!(v > 20 && v < 400)) { toast(!raw ? 'Type your weight first' : v >= 400 ? `${A.fmtW(v)} is more than anyone weighs. Check the number.` : `That isn't a weight. Type it in ${A.unit()}, like 72.5`); return; }      // 1.35.2: 72,5 works; a clear word for 0 or 9999
    if (window.Insights && window.Insights.addWeight) window.Insights.addWeight(v, Date.now()); else { (D.body = D.body || []).push({ id: 'b' + S.uid(), t: Date.now(), kg: v }); S.save(true); }
    A.closeSheet(); toast('Weight saved'); A.rerender();
  };
  // the week report: the 7 days to the last Sunday (on a Sunday, to today)
  function weekOf(endT0) {
    const days = []; let t = endT0; for (let i = 0; i < 7; i++) { days.unshift(dayOf(t)); t = prevDay(t); }
    const F = window.Food, tg = F && F.targets ? F.targets(endT0) : null, logged = days.filter(d => d.food.length);
    const avg = k => logged.length ? logged.reduce((a, d) => a + d[k], 0) / logged.length : 0;
    const onKcal = tg ? logged.filter(d => Math.abs(d.eaten - tg.kcal) <= 0.1 * tg.kcal).length : 0, onP = tg ? logged.filter(d => d.protein >= tg.p * 0.95).length : 0;
    let streak = 0; if (tg) for (let i = days.length - 1; i >= 0 && days[i].food.length && days[i].protein >= tg.p * 0.95; i--) streak++;
    const best = tg && logged.length ? logged.slice().sort((a, b) => (Math.abs(a.eaten - tg.kcal) / tg.kcal + (a.protein >= tg.p * 0.95 ? 0 : 1)) - (Math.abs(b.eaten - tg.kcal) / tg.kcal + (b.protein >= tg.p * 0.95 ? 0 : 1)))[0] : null;
    const bw = (D.body || []).filter(x => x.kg > 0 && x.t >= days[0].t0 && x.t < nextDay(endT0)).sort((x, y) => x.t - y.t);
    return { days, tg, logged, kcal: avg('eaten'), p: avg('protein'), c: avg('carbs'), f: avg('fat'), onKcal, onP, streak, best, wch: bw.length >= 2 ? bw[bw.length - 1].kg - bw[0].kg : null };
  }
  const lastSunday = () => { let t = dayStart(Date.now()); while (new Date(t).getDay() !== 0) t = prevDay(t); return t; };
  function weekCard() {
    const dow = new Date().getDay(); if (dow !== 0 && dow !== 1) return '';                // on Sundays and Mondays
    const w = weekOf(lastSunday()); if (w.logged.length < 2) return '';
    return `<div class="card tap kc-weekcard" id="kcWeekCard" data-act="kcWeek"><div class="row"><div class="grow"><div class="k2">Your week</div>
      <div class="small"><b>${n0(w.kcal)}</b> kcal and <b>${Math.round(w.p)} g</b> protein a day${w.tg ? ` · on target ${w.onKcal} of ${w.logged.length} days` : ''}</div></div><span class="accent small">Report ›</span></div></div>`;
  }
  // 1.33 (38): the week in the safe and danger zones of the Insights charts
  function zoneRows(t0s) {
    const Z = window.Daily && window.Daily.zoneCounts ? window.Daily.zoneCounts(t0s) : []; if (!Z.length) return '';
    const word = { sleep: 'nights', eaten: 'days', protein: 'days', ready: 'days' };
    return `<div class="kc-sec">Safe, needs improvement, danger</div>` + Z.map(z => `<div class="kc-read-r"><span>${esc(z.name)}</span><b><span class="di-zs di-zs-s" aria-hidden="true">✓</span> ${z.s} of ${z.n} ${word[z.k]}${z.w ? ` · <span class="di-zs di-zs-w" aria-hidden="true">!</span> ${z.w}` : ''}${z.d ? ` · <span class="di-zs di-zs-d" aria-hidden="true">⚠</span> ${z.d}` : ''}</b></div>`).join('')
      + `<p class="xs dim mt4">✓ safe zone · ! needs improvement · ⚠ danger zone (${Z.filter(z => z.d).map(z => `${z.name.toLowerCase()} ${z.dTxt}`).join(', ') || 'none this week'}).</p>`;      // 1.35: three steps
  }
  ACT.kcWeek = () => {
    const end = lastSunday(), w = weekOf(end), tg = w.tg;
    const row = (k, v) => `<div class="kc-read-r"><span>${k}</span><b>${v}</b></div>`;
    A.openSheet(`<h2>Your week</h2><p class="small muted">${dm(w.days[0].t0)} to ${dm(end)} · food logged on ${w.logged.length} of 7 days</p>
      ${w.logged.length ? `<div class="kc-sec">A day, on average</div>
      ${row('Calories', `${n0(w.kcal)} kcal${tg ? ` of ${n0(tg.kcal)}` : ''}`)}${row('Protein', `${Math.round(w.p)} g${tg ? ` of ${tg.p} g` : ''}`)}${row('Carbs', `${Math.round(w.c)} g${tg ? ` of ${tg.c} g` : ''}`)}${row('Fat', `${Math.round(w.f)} g${tg ? ` of ${tg.f} g` : ''}`)}
      ${tg ? `<div class="kc-sec">Against your limits</div>${row('Calories within 10% of target', `${w.onKcal} of ${w.logged.length} days`)}${row('Protein reached', `${w.onP} of ${w.logged.length} days`)}${row('Protein streak', `${w.streak} day${w.streak === 1 ? '' : 's'} in a row`)}${w.best ? row('Best day', `${WD[new Date(w.best.t0).getDay()]} ${dm(w.best.t0)}: ${n0(w.best.eaten)} kcal, ${Math.round(w.best.protein)} g protein`) : ''}` : '<p class="small muted mt8">Set your daily limits on the Food tab to see how the week went against them.</p>'}
      ${zoneRows(w.days.map(x => x.t0))}
      <div class="kc-sec">Also</div>${row('Body weight', w.wch == null ? 'weigh in twice in a week to see the change' : `${w.wch > 0 ? '+' : w.wch < 0 ? '−' : ''}${A.fmtW(Math.abs(Math.round(w.wch * 10) / 10))} ${A.unit()}`)}` : '<p class="small muted mt12">No food was logged that week.</p>'}
      <p class="xs dim mt12">A week's average says more than any single day: aim for most days close to your targets, not perfect ones.</p>
      <button class="btn block mt16" data-act="closeSheet">Close</button>`);
  };
  ACT.kcPrev = () => { cur = prevDay(cur); A.rerender(); };
  ACT.kcNext = () => { if (!isToday()) { cur = nextDay(cur); A.rerender(); } };
  ACT.kcToday = () => { cur = dayStart(Date.now()); A.rerender(); };
  ACT.kcDay = el => { cur = +el.dataset.t; A.rerender(); };
  ACT.kcSpan = el => { span = +el.dataset.n === 30 ? 30 : 7; A.rerender(); };
  ACT.kcOpenS = el => { A.closeSheet(); A.go('sessionDetail', { id: el.dataset.id }); };
  ACT.kcBurntAdd = () => { if (ACT.mvAdd) ACT.mvAdd(); };            // v1.21.12: the activity sheet takes the Burnt sheet's place
  // v1.21.10: tap Burnt on the Food tab: what it is made of, with the person's own numbers
  ACT.kcBurntWhy = () => {
    const t0 = cur, d = dayOf(t0), dl = dayLabel(t0), ep = everydayParts(t0), SP = window.Sports;
    const line = (name, sub, v, act, id, cls) => `<div class="list-item${act ? ' tap' : ''} ${cls || ''}"${act ? ` data-act="${act}" data-id="${esc(id)}"` : ''}><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${name}</div>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div><div class="small right" style="font-weight:700">${v}</div></div>`;
    const wsRows = d.ws.map(x => line(esc(x.s.dayName || 'Workout'), `${srcText(x.b)}${x.b.src === 'none' ? '' : ` · ${n0(x.b.kcal)} kcal`}${d.watch && !x.after ? " · in your watch's total" : !d.watch && d.base != null && x.b.src !== 'none' ? ` · ${n0(x.b.per * x.b.cm)} of it already in your everyday burn` : ''}`, d.watch && !x.after ? '0' : `+ ${n0(x.add)}`, 'kcOpenS', x.s.id)).join('');
    const spRows = d.sp.map(y => line(`${esc(SP && SP.nameOf ? SP.nameOf(y.x) : (y.x.name || 'Activity'))}`, `${minText(y.b.mins)} · ${n0(y.b.kcal)} kcal${d.watch && !y.after && y.x.watch !== 0 ? " · in your watch's total" : ''}`, `+ ${n0(y.add)}`, 'mvOpen', y.x.id)).join('');
    const wsAdd = d.ws.reduce((a, x) => a + (d.watch && !x.after ? 0 : x.add), 0), spAdd = d.sp.reduce((a, y) => a + y.add, 0);
    let top = '', sum = '';
    if (d.watch) {
      top = line(d.cut != null ? `Your watch, up to ${clock(d.cut)}` : 'Your watch, the whole day', d.watch === 'total' ? (viaHc(d.act) ? 'its total, brought in from Health Connect' : d.act && d.act.typed ? 'its total for the day, as you typed it' : 'its total for the day, from its screenshots') : 'your resting burn + its active calories', n0(d.cut != null ? d.wv : (d.watch === 'total' ? d.act.kt : d.wv)), 'acView', '')
        + (d.cut != null ? line(`Rest of the day after ${clock(d.cut)}`, 'at your usual pace', `+ ${n0(d.tail)}`) : '');
      sum = `${n0(d.cut != null ? d.wv : (d.watch === 'total' ? d.act.kt : d.wv))}${d.tail ? ` + ${n0(d.tail)}` : ''}${wsAdd ? ` + ${n0(wsAdd)}` : ''}${spAdd ? ` + ${n0(spAdd)}` : ''} = <b>${n0(d.burnt)} kcal</b>`;
    } else if (d.base != null) {
      top = line('Everyday burn', `${ep ? `your body at rest ${n0(ep.rest)} + a normal day's moving about${ep.young ? ' and growing' : ''} ${n0(ep.life)} (${esc(ep.level.toLowerCase())})` : 'from About me'}`, n0(d.base), '', '');
      sum = `${n0(d.base)}${wsAdd ? ` + ${n0(wsAdd)}` : ''}${spAdd ? ` + ${n0(spAdd)}` : ''} = <b>${n0(d.burnt)} kcal</b>`;
    } else sum = `<b>${n0(d.burnt)} kcal</b> from workouts and activities`;
    const none = !d.ws.length && !d.sp.length ? `<p class="xs dim">No workouts or activities ${dl === 'Today' ? 'today' : 'that day'}${d.base != null && !d.watch ? ', so Burnt is just your everyday burn' : ''}.</p>` : '';
    const how = d.watch ? `<p class="xs muted mt8">On a day with your watch's numbers, they are used instead of GymDay's everyday burn${d.cut != null ? ', up to when they were taken' : ''}. Workouts and activities in them add nothing more.</p>`
      : d.base != null ? `<p class="xs muted mt8">Your <b>everyday burn</b> is what your body uses in a normal day: at rest (from your weight${ep && ep.kg ? `, ${g1(ep.kg)} kg` : ''}, height, age and sex, by ICMR-NIN 2020) plus moving about at the level you set in About me (<b>${esc(ep ? ep.level : '')}</b>). It already counts every minute of the day, gym time included, so each workout or activity adds only what it burnt beyond that.</p>`
      : `<p class="xs muted mt8">Burnt counts workouts and activities only (About me → Count everyday burn is off)${ep ? `. Your everyday burn would be about ${n0(ep.every)} kcal` : ''}.</p>`;
    // v1.21.12: add an activity from here too (by its calories, a photo of the watch, or how long and how hard)
    const addBtn = SP ? `<button class="btn primary block mt12" data-act="kcBurntAdd">+ Add an activity</button><div class="xs dim mt4" style="text-align:center">A sport, a walk, a swim… type its calories${wOn() ? ', add a photo of your watch' : ''}, or say how long and how hard</div>` : '';
    A.openSheet(`<h2>Burnt</h2><p class="small muted">${esc(dl)}</p>
      <div class="stats mt8"><div class="stat"><div class="k2">Burnt</div><div class="v">${n0(d.burnt)}</div><div class="k">kcal</div></div></div>
      <div class="sp-sub">What it's made of</div>${top}${wsRows}${spRows}${none}
      <p class="small mt8 kc-sum">${sum}</p>${addBtn}${how}
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="kcMe">About me</button><button class="btn grow" data-act="closeSheet">Close</button></div>`);
  };
  const redraw = () => { const t = A.top().name; if (t === 'calories' || t === 'days' || t === 'sessionDetail' || t === 'settings' || t === 'setPage' || t === 'micros' || t === 'supps' || t === 'history' || t === 'dayx' || t === 'insights') A.rerender(); };
  // a moment on the day being looked at: now for today, otherwise the same time of day on that day
  const stampFor = () => { if (isToday() || A.top().name !== 'calories') return Date.now(); const n = new Date(), d = new Date(cur); d.setHours(n.getHours(), n.getMinutes(), 0, 0); return d.getTime(); };
  function addFood(o) {
    const f = { id: S.uid(), t: o.t || stampFor(), name: String(o.name || 'Food').replace(/\s+/g, ' ').trim().slice(0, 600) || 'Food', kcal: Math.max(0, Math.round(num(o.kcal))) };
    const p = Math.round(num(o.p) * 10) / 10; if (p > 0) f.p = p;
    if (o.src) f.src = o.src; if (o.pic) f.pic = o.pic; if (o.per) f.per = String(o.per).slice(0, 40);
    for (const k of ['c', 'f', 'fib', 'cr']) { const v = Math.round(num(o[k]) * 10) / 10; if (v > 0) f[k] = v; }
    if (o.meal) f.meal = o.meal;
    D.food.push(f); S.save(true); return f;
  }

  // ---------------------------------------------------------------- a photo of the meal
  // The picture is made small before anything else: about 900 px for reading, and a thumbnail kept on this phone.
  function shrink(img, side, q) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
  }
  // v1.12: up to 4 photos of one meal (different dishes, or one from two sides), read together: [{ big, thumb }]
  function pickMeal(max) {
    const F = window.Food;
    if (F && F.pickPhotos) return F.pickPhotos({ max: max || 4, side: 900, q: 0.8 });
    const load = src => new Promise(res => { const img = new Image(); img.onload = () => { try { res({ big: shrink(img, 900, 0.8), thumb: shrink(img, 160, 0.6) }); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; });
    if (window.__pickImage) return Promise.resolve(window.__pickImage()).then(d => (d ? load(d).then(r => [r || { big: d, thumb: d }]) : []));     // tests
    return Promise.resolve([]);
  }
  const bigsOf = m => (m.pics && m.pics.length ? m.pics.map(x => x.big) : m.big ? [m.big] : []);
  // Ask the account's server to read the picture. Resolves to { items: [{name, kcal, p}], note, questions } or throws with a message for people.
  // answers: the person's answers to the AI's questions (the second read); without them the first read may ask (v1.8.1)
  // v1.12: dataUrl can be a list: several photos of the same meal, read together as one
  function readPhoto(dataUrl, answers, outside) {
    const list = Array.isArray(dataUrl) ? dataUrl : [dataUrl];
    if (window.__mealAi) return Promise.resolve(window.__mealAi(list.length > 1 ? list : list[0], answers, outside));                  // tests
    const C = window.Cloud;
    if (!C || !C.configured) return Promise.reject({ quiet: true, message: 'Type what it was and its calories.' });
    if (!C.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have photos read for you. For now, type what it was and its calories.' });
    if (!C.mealPhoto) return Promise.reject({ quiet: true, message: 'Type what it was and its calories.' });
    const F = window.Food;
    const more = answers ? { answers } : { ask: (F && F.ASK) || 3 }; if (outside) more.out = 1;          // v1.11: a restaurant meal
    more.grams = 1;                                                                                     // v1.12: each item's weight too
    if (nutOn()) more.nut = 1;                                                                          // v1.26: and its nutrients, so the calories are calculated from them (a switch: off = the food list, as 1.16 to 1.25)
    if (nutOn() && window.Cook && window.Cook.on()) more.hid = 1;                                     // v1.29: and what a photo can't show (the oil, salt, sugar…), to ask about
    const raw = list.map(x => String(x).replace(/^data:image\/\w+;base64,/, ''));
    return C.mealPhoto(raw.length > 1 ? raw : raw[0], more).catch(e => {
      if (e && e.status === 404) throw { setup: true, message: "Reading photos isn't switched on for this account's server yet. Type what it was and its calories." };
      const msg = (e && e.message) || "The photo couldn't be read.";
      throw { message: /\btype\b/i.test(msg) ? msg : msg + ' You can type it instead.', offline: e && e.offline };     // the server's own words often say so already
    });
  }
  // v1.11: every line keeps the numbers it was worked out from (b), so changing it changes them accordingly:
  //   the amount in its name ("2 rotis" -> "3 rotis")   scales its numbers
  //   a different food ("chicken curry" -> "paneer…")   the AI reads the same photo again with the change (the food list when it can't)
  //   new calories                                       protein, carbs and fat scale with them
  //   new protein, carbs or fat                          calories follow: 4 kcal a gram of protein or carbs, 9 of fat
  // A saved photo meal keeps its lines and photo, so it opens the same way later.
  let shot = null;
  const nutOn = () => st().kcNut !== false;                 // v1.26: Settings → More features → Food → Meal photos: nutrients first
  const MEAL_N = { b: 'Breakfast', ms: 'Morning snack', l: 'Lunch', es: 'Evening snack', d: 'Dinner' };
  const r1 = v => Math.round((v || 0) * 10) / 10, g1 = v => (v >= 10 ? String(Math.round(v)) : String(r1(v)));
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%½¼¾⅓⅔.\/]+/g, ' ').trim();
  const KEYS = ['kcal', 'p', 'c', 'f', 'fib'];
  const snap = x => { const o = { name: String(x.name || '').trim(), g: num(x.g) }; for (const k of KEYS) o[k] = num(x[k]); return o; };
  const shotSum = () => shot.items.reduce((a, x) => a + Math.max(0, Math.round(num(x.kcal))), 0);
  const macText = x => `P ${g1(num(x.p))} · C ${g1(num(x.c))} · F ${g1(num(x.f))} g`;
  function shotRow(x, i) {
    return `<div class="kc-line" data-i="${i}">
      <div class="row kc-row"><textarea class="input grow grow-box" data-kc="name" data-i="${i}" rows="1" maxlength="600" enterkeyhint="done" placeholder="What is it, and how much" aria-label="What is it, and how much">${esc(x.name || '')}</textarea><input class="input kc-num" data-kc="kcal" data-i="${i}" type="number" inputmode="numeric" value="${x.kcal > 0 ? Math.round(x.kcal) : ''}" placeholder="kcal">${shot.items.length > 1 ? `<button class="ib x" data-act="kcRowDel" data-i="${i}" aria-label="Remove this line">✕</button>` : ''}</div>
      <div class="kc-lmeta"><label class="kc-gw xs muted" title="Weighed it? Type the grams and the numbers follow"><input class="input kc-gin" data-kc="g" data-i="${i}" type="number" inputmode="decimal" step="any" value="${num(x.g) > 0 ? Math.round(x.g) : ''}" placeholder="?" aria-label="Grams"> g</label><button class="kc-mac xs muted" data-act="kcRowMac" data-i="${i}" aria-expanded="${x.open ? 'true' : 'false'}"><span id="kcMac${i}">${macText(x)}</span> ${x.open ? '▴' : '▾'}</button><span class="xs ${x.st === 'busy' ? 'muted' : 'dim'} kc-lst" id="kcLst${i}">${stHtml(x, i)}</span></div><div class="kc-amt" id="kcAmt${i}">${amtHtml(x, i)}</div>
      ${x.open ? `<div class="row kc-macs">${[['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat']].map(([k, nm]) => `<label class="grow"><span class="xs muted">${nm} g</span><input class="input" data-kc="${k}" data-i="${i}" type="number" inputmode="decimal" step="any" value="${num(x[k]) > 0 ? r1(x[k]) : ''}" placeholder="0"></label>`).join('')}</div>` : ''}
      ${x.pick ? pickHtml(x, i) : ''}${window.Cook && x.hid ? window.Cook.chipFor(x, i) : ''}
    </div>`;
  }
  const shotRows = () => shot.items.map(shotRow).join('');
  const busyLines = () => shot && shot.items.some(x => x.st === 'busy');
  function shotSheet() {
    const keep = shot, edit = !!shot.editId;
    const F = window.Food, pics = shot.pics && shot.pics.length ? shot.pics : null, more = !edit && !shot.busy && pics && pics.length < 4;
    const head = pics && pics.length > 1 && F && F.photoStrip ? F.photoStrip(pics, { what: 'Photo', del: edit || shot.busy ? '' : 'kcShotPicDel', add: more ? 'kcShotMore' : '', addText: 'Add a photo' })
      : shot.big ? `<img class="kc-shot" src="${shot.big}" alt="Your meal">${more ? `<button class="kc-addpic" data-act="kcShotMore">+ Add another photo of this meal <span class="xs muted">· all of them are read together</span></button>` : ''}` : '';
    A.openSheet(`<h2>${edit ? 'Change this meal' : shot.typed ? esc(shot.title || 'What you ate') : pics && pics.length > 1 ? `Meal photos · ${pics.length}` : 'Meal photo'}</h2>${head}${shot.typed && !edit && shot.meal && MEAL_N[shot.meal] ? `<div class="xs muted" style="margin:-4px 0 8px">${MEAL_N[shot.meal]}</div>` : ''}
      <div id="kcAi" class="kc-ai">${shot.busy ? `<span class="kc-spin"></span> ${shot.again ? 'Reading it again with your answers…' : pics && pics.length > 1 ? `Reading the ${pics.length} photos together…` : 'Reading the photo…'}<div class="xs dim mt4">The picture is sent to the AI service set up for your account, only to be read.</div>` : shot.note ? `<span class="xs muted">${esc(shot.note)}</span>` : ''}${!shot.busy && shot.told ? `<div class="xs dim mt4">Your answers: ${esc(shot.told)}</div>` : ''}</div>
      ${shot.off && !edit ? `<div class="kc-off" id="kcOff"><div class="small"><b>No signal.</b> ${shot.wait ? 'This photo keeps waiting. Open it again when the phone is online, or type the meal below.' : 'Keep this photo and it is read when you are back online, or type the meal below.'}</div>
        <div class="row mt8">${shot.wait ? `<button class="btn grow" data-act="kcWaitDrop" data-id="${esc(shot.wait)}">Remove this photo</button>` : `<button class="btn primary grow" data-act="kcShotLater">Read it when I’m online</button>`}</div></div>`
    : shot.wait && !edit ? `<div class="xs muted" id="kcWaited" style="margin:0 0 8px">Taken ${dayLabel(dayStart(shot.t0)).toLowerCase()} at ${clock(shot.t0)}; it is logged for that time. <button class="kc-lk" data-act="kcWaitDrop" data-id="${esc(shot.wait)}">Remove this photo</button></div>` : ''}
      <div id="kcRows">${shotRows()}</div>
      <div class="row mt8"><button class="btn sm" data-act="kcRowAdd">+ Another line</button><div class="grow right small">Total <b id="kcSum">${n0(shotSum())}</b> kcal</div></div>
      ${shot.ai || edit || shot.typed ? `<p class="xs dim mt8">${shot.ai ? (shot.items.some(x => x.how === 'n' && x.per) ? 'Calories are calculated from each food’s nutrients: 4 kcal for a gram of protein or carbs, 9 for fat, 2 for fibre. ' : shot.items.some(x => x.how === 'l' && x.per) ? 'The numbers are the pack’s own, for the amount shown. ' : "The AI only saw what each food is and how much; every number is from the food list. ") : ''}Change a food or its amount and its numbers change with it; type calories, protein, carbs or fat to set them yourself.</p>` : ''}
      ${shot.ai && !edit && window.Safety ? window.Safety.aiLink('Meal photo', (shot.items || []).map(x => x.name).join(', ')) : ''}
      ${edit && window.Leftover ? `<button class="btn block mt12" data-act="lvOpen" data-meal="${esc((D.food.find(x => x.id === shot.editId) || {}).meal || '')}">🍽 Leftovers: what was left on the plate</button>` : ''}
      <div class="row mt16">${edit ? `<button class="btn danger" data-act="kcShotDel">Remove</button>` : `<button class="btn" data-act="closeSheet">Cancel</button>`}<button class="btn primary grow" data-act="kcShotSave">${edit ? 'Save' : 'Save meal'}</button></div>`,
      s => {
        const panel = s.querySelector('.panel');
        panel.addEventListener('focusin', e => { const t = e.target, k = t.dataset && t.dataset.kc, it = k && shot && shot.items[+t.dataset.i]; if (it && k !== 'name') it.ref = snap(it); });
        panel.addEventListener('input', e => {
          const t = e.target, k = t.dataset && t.dataset.kc; if (!k || !shot) return; const i = +t.dataset.i, it = shot.items[i]; if (!it) return;
          if (k === 'pq') {                                                     // v1.16: search the food list for this line
            const F = window.Food, res = $('#kcPickRes' + i), list = F && F.searchList ? F.searchList(t.value) : [];
            if (res) res.innerHTML = list.map(a => `<button class="kc-alt" data-act="kcLineUse" data-i="${i}" data-fid="${esc(a.id)}"><span class="grow">${esc(a.name)}</span><span class="xs muted">${a.kcal} kcal in 100 g</span></button>`).join('') || (t.value.trim() ? '<p class="xs muted mt4">Nothing found. Type its calories in the box above instead.</p>' : '');
            return;
          }
          if (k === 'name') { it.name = t.value; clearTimeout(it.tm); it.tm = setTimeout(() => settle(i), 1600); return; }
          const ref = it.ref || (it.ref = snap(it)), v = num(t.value), typed = it.typed || (it.typed = {});
          if (k === 'g') {                                      // v1.12: weighed it: every number follows the grams (what was typed stays)
            it.g = v; it.st = ''; typed.g = 1; it.gw = 1;          // v1.27: an amount the person gave themselves (Your usual portion learns from these)
            if (ref.g > 0 && v > 0) for (const m of KEYS) if (!typed[m]) it[m] = m === 'kcal' ? Math.round(ref.kcal * v / ref.g) : ref[m] * v / ref.g;
            paintLine(i, 'g'); return;
          }
          typed[k] = 1; it.st = ''; delete it.chk; delete it.pick; nutOff(it);     // what the person typed themselves is never changed for them
          if (k === 'kcal') {                                   // new calories: protein, carbs and fat keep their share
            it.kcal = v;
            if (ref.kcal > 0) for (const m of ['p', 'c', 'f', 'fib']) if (!typed[m]) it[m] = ref[m] * v / ref.kcal;
            if (ref.kcal > 0 && ref.g > 0 && !typed.g && v > 0) it.g = Math.round(ref.g * v / ref.kcal);      // v1.14: more of the same food
            paintLine(i, 'kcal');
          } else {                                              // new protein, carbs or fat: the calories follow
            it[k] = v;
            if (!typed.kcal) it.kcal = Math.max(0, Math.round(ref.kcal + (k === 'f' ? 9 : 4) * (v - ref[k])));
            paintLine(i, k);
          }
          const sum = $('#kcSum'); if (sum) sum.textContent = n0(shotSum());
        });
        panel.addEventListener('change', e => { const t = e.target; if (t.dataset && t.dataset.kc === 'name' && shot) { const i = +t.dataset.i; clearTimeout((shot.items[i] || {}).tm); settle(i); } });
      }, () => { if (shot === keep) shot = null; });
    shot = keep;      // opening a sheet closes the one before it, which is this same sheet while the photo is being read
  }
  // one line's numbers, without touching the box being typed in
  function paintLine(i, typing) {
    const it = shot && shot.items[i]; if (!it) return;
    const m = $('#kcMac' + i); if (m) m.textContent = macText(it);
    const kc = document.querySelector(`[data-kc="kcal"][data-i="${i}"]`); if (kc && typing !== 'kcal') kc.value = it.kcal > 0 ? Math.round(it.kcal) : '';
    const gb = document.querySelector(`[data-kc="g"][data-i="${i}"]`); if (gb && typing !== 'g') gb.value = num(it.g) > 0 ? Math.round(it.g) : '';
    for (const k of ['p', 'c', 'f']) { const x = document.querySelector(`[data-kc="${k}"][data-i="${i}"]`); if (x && typing !== k) x.value = num(it[k]) > 0 ? r1(it[k]) : ''; }
    const st = $('#kcLst' + i); if (st) { st.className = `xs ${it.st === 'busy' ? 'muted' : 'dim'} kc-lst`; st.innerHTML = stHtml(it, i); }
    const am = $('#kcAmt' + i); if (am) am.innerHTML = amtHtml(it, i);
    const sum = $('#kcSum'); if (sum) sum.textContent = n0(shotSum());
  }
  // ---------------------------------------------------------------- amounts in a name: "2 rotis", "1½ cups", "half katori"
  const QW = { half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, a: 1, an: 1 };
  const UF = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };
  function qtyOf(s) {
    const t = String(s || '').toLowerCase();
    const m = /(\d+(?:\.\d+)?)?\s*([½¼¾⅓⅔])|(\d+(?:\.\d+)?)\s*\/\s*(\d+)|(\d+(?:\.\d+)?)|\b(half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|twelve)\b/.exec(t);
    if (!m) return null;
    let n = 0;
    if (m[2]) n = (m[1] ? +m[1] : 0) + UF[m[2]];
    else if (m[3]) n = +m[3] / Math.max(1, +m[4]);
    else if (m[5]) n = +m[5];
    else n = QW[m[6]];
    const rest = (t.slice(0, m.index) + ' # ' + t.slice(m.index + m[0].length)).split(/[^a-z#]+/).filter(Boolean).map(w => (w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w)).join(' ');
    return n > 0 ? { n, rest } : null;
  }
  function amountRatio(was, now) {
    const a = qtyOf(was), b = qtyOf(now);
    return a && b && a.rest === b.rest && a.n !== b.n ? b.n / a.n : 0;
  }
  // a line's name was changed: scale it, or have it worked out again
  const pending = new Set(); let pendTm = 0;
  function settle(i) {
    const it = shot && shot.items[i]; if (!it) return;
    const now = String(it.name || '').trim(), was = it.b ? it.b.name : '';
    if (!now || fold(now) === fold(was)) return;
    if (!it.b || !(it.b.kcal > 0) || !was) { it.b = snap(it); return; }           // a line typed from scratch: nothing to work out from
    const k = amountRatio(was, now);
    if (k) {
      for (const m of KEYS) it[m] = num(it[m]) * k;
      if (num(it.g) > 0) it.g = Math.round(num(it.g) * k);
      it.kcal = Math.round(it.kcal); it.b = snap(it); it.ref = null; it.typed = null; it.st = `Changed for the new amount (× ${g1(k)})`;
      paintLine(i); return;
    }
    it.st = 'busy'; it.from = it.from || was; paintLine(i);
    pending.add(i); clearTimeout(pendTm); pendTm = setTimeout(rework, 700);
  }
  // the AI reads the same photo again, told the meal as it now is; the lines that weren't changed keep their numbers
  async function rework() {
    const mine = shot; if (!mine) return;
    const idx = [...pending].filter(i => mine.items[i] && mine.items[i].st === 'busy'); pending.clear();
    if (!idx.length) return;
    let got = null;
    if (bigsOf(mine).length && mine.bigOk !== false) {
      const list = mine.items.map((x, i) => `${i + 1}) ${String(x.name || '').trim() || 'something else'}`).join('; ');
      const fixes = idx.map(i => `line ${i + 1} is "${String(mine.items[i].name).trim()}", not "${mine.items[i].from}"`).join('; ');
      const answers = [{ q: 'Are the foods and amounts right?', a: `The person corrected the list: ${fixes}. The meal is exactly these ${mine.items.length} items, in this order: ${list}. Give one item for each, in the same order; judge each portion from the photo unless the person gave an amount.` }];
      try { got = itemsOf(await readPhoto(bigsOf(mine), answers, mine.out)); } catch (e) { got = null; }
    }
    if (shot !== mine) return;
    const F = window.Food; try { if (F && F.loadDb) await F.loadDb(); } catch (e) { /* the list is in the app: hardly ever */ }
    if (shot !== mine) return;
    for (const i of idx) {
      const it = mine.items[i]; if (!it || it.st !== 'busy') continue;
      let v = got && got.length === mine.items.length ? got[i] : got ? bestMatch(got, it.name) : null;
      it.g = v && num(v.g) > 0 ? num(v.g) : 0;                         // the AI's grams for the new food, never the old food's
      nutOff(it);
      if (v && v.how && v.per) { for (const k of KEYS) it[k] = num(v[k]); it.how = v.how; it.per = v.per; if (v.lab) it.lab = v.lab; }      // v1.26: the new food, worked out from its nutrients
      if (useNut(it, mine.out)) { /* its numbers are calculated from the new food's nutrients */ }
      else if (F && F.dbReady && F.dbReady()) useTable(it, mine.out);     // v1.16: the numbers are the food list's (with no AI: for the amount named)
      else { for (const k of KEYS) it[k] = 0; it.st = "Couldn't work this one out: type its calories"; delete it.fid; delete it.tb; }
      it.b = snap(it); it.ref = null; it.typed = null; delete it.from; paintLine(i);
    }
  }
  const words = s => new Set(fold(s).split(' ').filter(w => w.length > 2 && !/^\d/.test(w)));
  function bestMatch(list, name) {
    const a = words(name); let best = null, sc = 0;
    for (const x of list) { const b = words(x.name); let n = 0; a.forEach(w => { if (b.has(w)) n++; }); if (n > sc) { sc = n; best = x; } }
    return best;
  }
  const itemsOf = r => ((r && r.items) || []).filter(x => x && x.name).slice(0, 12).map(x => nutOf(x, { name: String(x.name).slice(0, 60), kcal: Math.max(0, Math.round(num(x.kcal))), p: Math.max(0, num(x.p != null ? x.p : x.protein)),
    c: Math.max(0, num(x.c != null ? x.c : x.carbs)), f: Math.max(0, num(x.f != null ? x.f : x.fat)), fib: Math.max(0, num(x.fib != null ? x.fib : x.fibre != null ? x.fibre : x.fiber)),
    g: num(x.grams != null ? x.grams : x.g) > 0 ? Math.round(num(x.grams != null ? x.grams : x.g)) : 0 }));
  // v1.26: how the server worked a line out: 'n' from its nutrients (the AI's grams x what 100 g of the food holds), 'l' from a
  // packet's printed table. per: what 100 g holds (k: its calories); lab: the pack (u: g or ml, sv: one serving, pk: all of it).
  function nutOf(x, o) {
    const how = x.how === 'label' || x.how === 'l' ? 'l' : x.how === 'nutrients' || x.how === 'n' ? 'n' : '', q = x.per100 || x.per, pick = (a, b) => num(q[a] != null ? q[a] : q[b]);
    if (!how || !(o.g > 0) || !q || typeof q !== 'object') return o;
    o.how = how; o.per = { k: Math.max(0, Math.round(pick('kcal', 'k'))), p: r1(pick('protein', 'p')), c: r1(pick('carbs', 'c')), f: r1(pick('fat', 'f')), fib: r1(pick('fibre', 'fib')) };
    if (pick('alcohol', 'alc') > 0) o.per.alc = r1(pick('alcohol', 'alc'));
    if (how === 'n' && window.Cook && window.Cook.on() && Array.isArray(x.hidden)) { const h = window.Cook.tidy(x.hidden); if (h.length) o.hid = h; }      // v1.29: how it was made
    const l = x.label || x.lab;
    if (how === 'l' && l && typeof l === 'object') o.lab = { u: (l.unit || l.u) === 'ml' ? 'ml' : 'g', sv: Math.max(0, num(l.serving_g != null ? l.serving_g : l.sv)), pk: Math.max(0, num(l.pack_g != null ? l.pack_g : l.pk)), pr: l.printed || l.pr ? 1 : 0 };
    return o;
  }
  // v1.16: the AI only says what each food is and how many grams. The app works out every number from the food list (at home the
  // home-made version, eaten out the restaurant one) and never uses the AI's. When it isn't sure which food in the list a line is,
  // it counts the closest one and marks the line "Check this" (chk), with the closest foods to pick from. A line with no food in the
  // list at all counts nothing until one is picked or its calories are typed.
  function useTable(x, out) {
    const F = window.Food, ai = num(x.kcal);
    if (!F || !F.lineFood || !(F.dbReady && F.dbReady())) { x.chk = 1; return false; }      // the list couldn't open (it is in the app, so hardly ever)
    let t = F.lineFood(x.name, num(x.g), { out: !!out, ai });
    delete x.pick; delete x.pk; delete x.fn;
    // no grams from the AI: the amount in its name ("Rice, 1 cup"). 1.35.2 (59): a typed "2 rotis" whose food matched surely isn't
    // asked about just because it has an amount (every typed line with an amount said "Check this")
    if (t && !(num(x.g) > 0)) { const gn = gramsFromName(x.name, t.fid); if (gn > 0) t = Object.assign(F.valuesAt(t.fid, gn), { sure: false, match: window.__calm !== false ? t.match : undefined }); }
    if (!t) { for (const k of KEYS) x[k] = 0; delete x.fid; delete x.tb; x.chk = 1; x.st = ''; x.b = snap(x); return false; }
    for (const k of KEYS) x[k] = k === 'kcal' ? Math.round(t.v.kcal) : t.v[k];
    x.g = Math.round(t.g); x.fid = t.fid; x.tb = { name: t.name, k: Math.round(t.v.kcal) };
    if (t.sure || (x.tl && t.match)) delete x.chk; else x.chk = 1;          // v1.20: a typed line whose words matched a food surely is not asked about
    x.st = `Food list: ${t.name}, ${Math.round(x.g)} g`;
    x.b = snap(x);
    return true;
  }
  // v1.26: nutrients first. A line the server worked out from its nutrients (how 'n') or copied from a packet's printed table
  // (how 'l') keeps those numbers: its calories were calculated from them (4 kcal a gram of protein or carbs, 9 of fat, 2 of
  // fibre, 7 of alcohol), not guessed and not looked up. The food list stays one tap away ("Food list") for a line that looks
  // off, and still counts every line the server could not work out.
  const nutText = x => (x.how === 'l' ? `From the pack's label: ${n0(x.per.k)} kcal in 100 ${x.lab && x.lab.u === 'ml' ? 'ml' : 'g'}` : `From its nutrients${x.per.alc > 0 ? ', with its alcohol' : ''}: ${n0(x.per.k)} kcal in 100 g`);
  const nutOff = x => { delete x.how; delete x.per; delete x.lab; delete x.lk; };
  // The food list is the second opinion: when it is sure which food a line is and its calories for the same grams are far from
  // the worked-out ones (half as much again or more, either way, and at least 100 kcal), the line says "Check this" with the list's number (lk),
  // and the person picks. A packet's printed table is not second-guessed.
  function useNut(x, out) {
    if (!x.how || !x.per || !(num(x.g) > 0)) { nutOff(x); return false; }
    delete x.pick; delete x.pk; delete x.fn; delete x.fid; delete x.tb; delete x.chk; delete x.lk; delete x.kf;
    x.st = nutText(x);
    const F = window.Food;
    if (x.how === 'n' && F && F.lineFood && F.dbReady && F.dbReady()) {
      // v1.29: a dish asked about (How was it made?) is counted without its oil, salt, sugar…: they are added back to compare it with the list's
      const hk = x.hid && window.Cook && window.Cook.hidKcal ? window.Cook.hidKcal(x.hid) : 0;
      const t = F.lineFood(x.name, num(x.g), { out: !!out, ai: num(x.kcal) + hk }), a = Math.round(num(x.kcal) + hk), b = t && t.sure && t.v ? Math.round(t.v.kcal) : 0;
      if (t && t.sure && t.fid) x.kf = t.fid;                 // v1.27: which food of the list this is, for "Your usual" 
      if (b > 0 && Math.abs(a - b) >= 100 && (a > b * 1.5 || b > a * 1.5)) { x.chk = 1; x.lk = { fid: t.fid, name: t.name, k: b }; }
    }
    x.b = snap(x);
    return true;
  }
  function checkLines(mine) {
    let n = 0;
    for (const x of mine.items) if (useNut(x, mine.out) || useTable(x, mine.out)) n++;
    return n;
  }
  // a packet read off its label: one serving, half the pack or all of it, in one tap
  // v1.27 Your usual portion: when the person has chosen the amount of this food themselves often enough (Food.usual), and it is
  // not what this line counts, one tap sets it.
  function amtHtml(x, i) {
    let h = '';
    if (x.how === 'l' && x.per && x.lab) {
      const u = x.lab.u === 'ml' ? 'ml' : 'g', seen = new Set();
      h = [[x.lab.sv, '1 serving'], [x.lab.pk / 2, 'Half the pack'], [x.lab.pk, 'Whole pack']].filter(([g]) => g >= 1 && !seen.has(Math.round(g)) && seen.add(Math.round(g)))
        .map(([g, t]) => `<button class="chip${Math.round(g) === Math.round(num(x.g)) ? ' on' : ''}" data-act="kcLabAmt" data-i="${i}" data-g="${Math.round(g)}">${t} · ${Math.round(g)} ${u}</button>`).join('');
    }
    const F = window.Food, us = F && F.usual && !x.gw && x.st !== 'busy' && (x.fid || x.kf) ? F.usual(x.fid || x.kf) : null, g = num(x.g);
    if (us && us.g > 0 && (!(g > 0) || Math.abs(us.g - g) / g > 0.15)) h += `<button class="chip" data-act="kcUsualAmt" data-i="${i}" data-g="${us.g}">Your usual · ${us.g} g</button>`;
    return h;
  }
  // grams in a millilitre, roughly, for a spoon of a food the list gives no spoon for
  const densityOf = nm => { const t = String(nm || '').toLowerCase();
    return /\bghee\b/.test(t) ? 0.86 : /\boils?\b/.test(t) ? 0.9 : /^butter\b/.test(t) ? 0.94 : /\b(sugar|jaggery|gur)\b/.test(t) ? 0.84 : /\bsalt\b/.test(t) ? 1.2
      : /\b(honey|syrup|jam)\b/.test(t) ? 1.4 : /\b(flour|atta|maida|besan|powder|oats)\b/.test(t) ? 0.55 : 1; };
  // an amount named in a line ("Rice, 1 cup", "Roti, 3", "Dal, 150 g") in grams of the list's food: its matching portion × the count, or its usual one
  function gramsFromName(name, fid) {
    const F = window.Food, row = F && F.rowById ? F.rowById(fid) : null; if (!row || !F.dbFood) return 0;
    const food = F.dbFood(row), t = String(name || '').toLowerCase(), q = qtyOf(name), n = q ? q.n : 1;
    const gm = /(\d+(?:\.\d+)?)\s*(g|gm|gms|grams?|ml)\b/.exec(t); if (gm) return +gm[1];
    // 1.35.2: "a handful of almonds" was 1 almond (1 g); a handful is the food's own handful, else about 30 g
    if (/\b(handfuls?|fistfuls?|mutthi|mutthi bhar)\b/.test(t)) { const o = food.units.find(x => /handful/i.test(x.label) && !x.gram && !x.ml && x.g > 0); const one = o ? o.g / ((/^\s*(\d+(?:\.\d+)?)\s/.exec(o.label) || [0, 1])[1] || 1) : 30; return Math.max(1, Math.round(one * n)); }
    const uw = /\b(katori|cup|bowl|plate|piece|slice|glass|roti|chapati|idli|dosa|egg|tbsp|tablespoon|tsp|teaspoon|serving|scoop)/.exec(t);
    // 1.35: spoons are spoons. "2 tsp" of a food that has no teaspoon among its measures was counted as 2 of its first measure
    // (a cup of oil: 448 g); now it is worked out from its tablespoon (3 teaspoons) or cup (48), else a spoon's volume × how heavy
    // that food is (oil 0.9 g a ml, as the cooking answers count it: 4.5 g a teaspoon)
    const sw = uw ? ({ teaspoon: 'tsp', tablespoon: 'tbsp' }[uw[1]] || uw[1]) : '';
    if (sw === 'tsp' || sw === 'tbsp') {
      const LB = { tsp: /\b(tsp|teaspoons?)\b/i, tbsp: /\b(tbsp|tablespoons?)\b/i, cup: /\bcups?\b/i };
      const per = k => { const o = food.units.find(x => LB[k].test(x.label) && !x.gram && !x.ml && x.g > 0); if (!o) return 0; const m = /^\s*(\d+(?:\.\d+)?)\s/.exec(o.label); return o.g / (m && +m[1] > 0 ? +m[1] : 1); };
      const one = per(sw) || (sw === 'tsp' ? per('tbsp') / 3 : per('tsp') * 3) || per('cup') / (sw === 'tsp' ? 48 : 16) || (sw === 'tsp' ? 5 : 15) * densityOf(food.name || row.name || name);
      return Math.max(1, Math.round(one * n));
    }
    const d = food.units[food.def], u = (uw && food.units.find(x => new RegExp('\\b' + uw[1], 'i').test(x.label) && !x.gram && !x.ml)) || (d && !d.gram && !d.ml ? d : null);
    if (!q && !uw) return 0;                                   // no amount named: the list's usual portion stays
    return u && u.g > 0 ? Math.round(u.g * n) : 0;
  }
  // the line's status: where its numbers come from, or "Check this" with the food it was counted as
  function stHtml(x, i) {
    if (x.st === 'busy') return '<span class="kc-spin"></span> Working out the new numbers…';
    if (x.chk && x.how && x.per && x.lk) return `<button class="kc-chk" data-act="kcLinePick" data-i="${i}">Check this: the food list says ${n0(x.lk.k)} kcal (${esc(x.lk.name)}) ›</button>`;
    if (x.chk) return `<button class="kc-chk" data-act="kcLinePick" data-i="${i}">${x.fid ? `Check this: counted as ${esc(x.tb ? x.tb.name : x.fn || x.name)}` : 'Not in the food list: pick the food'} ›</button>`;
    if (x.how && x.per) return `${esc(x.st || nutText(x))} <button class="kc-lk" data-act="kcLinePick" data-i="${i}">Food list ›</button>`;
    return esc(x.st || '');
  }
  // the closest foods for a line, and the food list's search, under it
  function pickHtml(x, i) {
    const F = window.Food, alts = F && F.altsFor ? F.altsFor(x.name, { out: !!(shot && shot.out) }, x.fid) : [];
    return `<div class="kc-pick" id="kcPick${i}"><div class="xs muted">Which food is it? ${num(x.g) > 0 ? `Counted for ${Math.round(x.g)} g.` : ''}</div>
      ${alts.map(a => `<button class="kc-alt" data-act="kcLineUse" data-i="${i}" data-fid="${esc(a.id)}"><span class="grow">${esc(a.name)}</span><span class="xs muted">${a.kcal} kcal in 100 g</span></button>`).join('')}
      ${x.fid ? `<button class="kc-alt" data-act="kcLineUse" data-i="${i}" data-fid="${esc(x.fid)}"><span class="grow">Keep ${esc(x.tb ? x.tb.name : 'this')}</span><span class="xs accent">✓</span></button>` : x.how && x.per ? `<button class="kc-alt" data-act="kcLineKeep" data-i="${i}"><span class="grow">Keep the numbers from ${x.how === 'l' ? "the pack's label" : 'its nutrients'}${num(x.kcal) > 0 ? ` (${n0(Math.round(x.kcal))} kcal)` : ''}</span><span class="xs accent">✓</span></button>` : ''}
      <input class="input mt8" data-kc="pq" data-i="${i}" type="search" placeholder="Search the food list" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <div id="kcPickRes${i}"></div></div>`;
  }
  // the AI's read, put into the lines to check and correct
  function useRead(mine, r, note) {
    const items = itemsOf(r); mine.busy = false;
    if (items.length) {
      mine.items = items.map(x => Object.assign(x, { b: snap(x) })); mine.ai = true; mine.note = note || (r && r.note ? String(r.note).slice(0, 200) : '');
      const n = checkLines(mine);
      const chk = items.filter(x => x.chk).length;
      const nn = items.filter(x => x.how === 'n').length, nl = items.filter(x => x.how === 'l').length, rest = items.length - nn - nl;
      const said = !nn && !nl ? "The AI saw the foods and their grams; every number is the food list's for those grams."
        : (nn ? "The AI worked out each food's weight and nutrients; the calories are calculated from them." : '') + (nl ? `${nn ? ' ' : ''}${nl === 1 && !nn && !rest ? 'The numbers are' : nl === 1 ? 'One line is' : nl + ' lines are'} copied from the pack's printed table, for the amount shown.` : '') + (rest ? ` ${rest === 1 ? 'One line is' : rest + ' lines are'} from the food list.` : '');
      mine.note = (mine.note ? mine.note + ' ' : '') + said + (chk ? ` ${chk === 1 ? 'One line' : chk + ' lines'} to check: tap “Check this” to pick the right food.` : '');
    }
    else { mine.items = [{ name: '', kcal: 0 }]; mine.ai = false; mine.note = note ? note.replace(/,? so this is its first guess\..*$/, '. Type what it was and its calories.') : "The photo couldn't be read as food. Type what it was and its calories."; }
  }
  ACT.kcPhoto = async (el, ev, opt) => {
    const o = opt || {}, pics = o.pics && o.pics.length ? o.pics.slice(0, 4) : await pickMeal(4); if (!pics.length) return;      // v1.27: o.pics = photos shared to GymDay
    const mine = shot = { pics, big: pics[0].big, thumb: pics[0].thumb, items: [{ name: '', kcal: 0 }], busy: true, note: '', ai: false, out: !!o.out, place: o.place || '', meal: o.meal || '' };
    readShot(mine);
  };
  // v1.12: another photo of the same meal, or one taken out: all of them are read again, together
  ACT.kcShotMore = async () => {
    const mine = shot; if (!mine || mine.editId || mine.busy) return;
    const have = bigsOf(mine).length; if (have >= 4) return;
    const got = await pickMeal(4 - have); if (!got.length || shot !== mine) return;
    mine.pics = (mine.pics && mine.pics.length ? mine.pics : [{ big: mine.big, thumb: mine.thumb }]).concat(got).slice(0, 4);
    readShot(mine);
  };
  ACT.kcShotPicDel = el => {
    const mine = shot; if (!mine || mine.editId || mine.busy || !mine.pics || mine.pics.length < 2) return;
    mine.pics.splice(+el.dataset.i, 1); readShot(mine);
  };
  // v1.29: a read with a dish to ask about goes to "How was it made?" first, then to the meal
  const cookFirst = mine => !!(window.Cook && window.Cook.wants(mine));
  const afterRead = mine => { if (cookFirst(mine)) window.Cook.open(mine, () => { if (shot === mine || !shot) { shot = mine; shotSheet(); } }); else shotSheet(); };
  async function readShot(mine) {
    Object.assign(mine, { big: mine.pics[0].big, thumb: mine.pics[0].thumb, busy: true, again: false, told: '', note: '', ai: false, bigOk: true, off: false, items: [{ name: '', kcal: 0 }] });
    shotSheet();
    const F0 = window.Food, dbP = F0 && F0.loadDb ? F0.loadDb().catch(() => null) : Promise.resolve(null);     // v1.13: the tables, to check the lines
    let r;
    try { if (!online()) throw { offline: true }; r = await readPhoto(bigsOf(mine), null, mine.out); await dbP; }
    catch (e) {
      if (shot !== mine) return; mine.busy = false; mine.bigOk = false;
      mine.off = !!(e && e.offline) || !online();                       // v1.27: no signal: the photo can wait and be read later
      mine.note = mine.off ? '' : (e && e.message) || 'Type what it was and its calories.'; shotSheet(); return;
    }
    if (shot !== mine) return;
    const F = window.Food, qs = F && F.askList ? F.askList(r) : [];
    if (!qs.length) { useRead(mine, r); if (!cookFirst(mine) && quickOk(mine)) { quickSave(mine); return; } afterRead(mine); return; }
    // v1.8.1: the AI couldn't tell something that matters, so it asks first, then reads the photo again with the answers
    mine.busy = false;
    F.ask({ qs, img: mine.big,
      done: async answers => {
        if (shot !== mine) return;
        mine.busy = true; mine.again = true; mine.told = answers.map(x => x.a).filter(a => a !== 'Not sure').join(' · '); shotSheet();
        let r2;
        try { r2 = await readPhoto(bigsOf(mine), answers, mine.out); }
        catch (e) { if (shot !== mine) return; useRead(mine, r, "It couldn't read the photo again just now, so this is its first guess. Correct anything that looks off."); afterRead(mine); return; }
        if (shot !== mine) return;
        useRead(mine, itemsOf(r2).length ? r2 : r); afterRead(mine);
      },
      skip: () => { if (shot !== mine) return; useRead(mine, r, itemsOf(r).length ? '' : 'Type what it was and its calories.'); afterRead(mine); },
      cancel: () => { if (shot === mine) shot = null; } });
    shot = mine;      // opening the questions closed the photo sheet, which let go of this photo
  }
  // ---------------- v1.27: photos without signal ----------------
  // A meal photo that cannot be read because the phone is offline is kept (its pictures in the phone's photo store, a line in
  // Store.meta.kcWait: phone only) and read when the person opens it from the Food tab once they are back online. It is never
  // logged without a look (the owner's choice), and it is logged for the time the photo was taken.
  const online = () => (window.__online != null ? !!window.__online : navigator.onLine !== false);
  const waits = () => (Array.isArray(S.meta.kcWait) ? S.meta.kcWait : (S.meta.kcWait = []));
  function waitDone(id) {
    const w = waits().find(x => x.id === id); if (!w) return;
    (w.pics || []).concat([w.id + '-t']).forEach(p => { try { S.deletePhoto(p); } catch (e) { } });
    S.meta.kcWait = waits().filter(x => x !== w); S.saveMeta();
  }
  function waitCard() {
    const w = waits(); if (!w.length) return '';
    return `<div class="card" id="kcWait"><h3>📷 ${w.length === 1 ? 'A photo is' : w.length + ' photos are'} waiting to be read</h3>
      <p class="xs muted mt4">${online() ? 'You are online: open one and it is read. Nothing is logged until you have looked at it.' : 'No signal yet. Open one when the phone is online again.'}</p>
      ${w.map(x => { const th = S.loadPhoto(x.id + '-t'); return `<div class="list-item tap" data-act="kcWaitOpen" data-id="${esc(x.id)}">${th ? `<img class="kc-thumb" src="${th}" alt="">` : ''}<div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${MEAL_N[x.meal] || 'Meal'}${x.out ? ' · eaten out' : ''}</div><div class="xs muted">${dayLabel(dayStart(x.t))} · ${clock(x.t)}${(x.pics || []).length > 1 ? ` · ${x.pics.length} photos` : ''}</div></div><span class="chev">›</span></div>`; }).join('')}</div>`;
  }
  ACT.kcShotLater = () => {
    const mine = shot; if (!mine || mine.editId || mine.wait) return;
    const pics = mine.pics && mine.pics.length ? mine.pics : mine.big ? [{ big: mine.big, thumb: mine.thumb }] : []; if (!pics.length) return;
    const id = 'w' + S.uid(), ids = [];
    pics.forEach((p, i) => { if (S.savePhoto(`${id}-${i}`, p.big) !== false) ids.push(`${id}-${i}`); });
    if (!ids.length) { toast("The photo couldn't be kept on this phone. Type the meal instead."); return; }
    S.savePhoto(id + '-t', pics[0].thumb || pics[0].big);
    const F = window.Food, t = stampFor();
    waits().push({ id, t, meal: mine.meal || (F && F.mealFor ? F.mealFor() : ''), out: !!mine.out, place: mine.place || '', pics: ids });
    S.saveMeta(); shot = null; A.closeSheet(); toast('Photo kept. Open it on the Food tab when you are back online.'); redraw();
  };
  ACT.kcWaitOpen = el => {
    const w = waits().find(x => x.id === el.dataset.id); if (!w) return;
    const pics = (w.pics || []).map(id => S.loadPhoto(id)).filter(Boolean).map(b => ({ big: b, thumb: b }));
    if (!pics.length) { waitDone(w.id); toast('That photo is no longer on this phone'); redraw(); return; }
    const th = S.loadPhoto(w.id + '-t'); if (th) pics[0].thumb = th;
    const mine = shot = { pics, big: pics[0].big, thumb: pics[0].thumb, items: [{ name: '', kcal: 0 }], busy: true, note: '', ai: false, out: !!w.out, place: w.place || '', meal: w.meal || '', wait: w.id, t0: w.t };
    readShot(mine);
  };
  ACT.kcWaitDrop = el => {
    const id = el.dataset.id; if (!waits().some(x => x.id === id)) return;
    if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'Tap again to remove it'; return; }
    waitDone(id); if (shot && shot.wait === id) { shot = null; A.closeSheet(); } toast('Photo removed'); redraw();
  };
  window.addEventListener('online', () => { if (waits().length) { toast(waits().length === 1 ? 'Back online: a photo is waiting on the Food tab' : `Back online: ${waits().length} photos are waiting on the Food tab`); redraw(); } });
  // ---------------- v1.27: Share to GymDay ----------------
  // Photos sent to GymDay from the gallery or another app (MainActivity makes them smaller and keeps them until the page asks):
  // they open as a meal photo, as if taken here. Up to 4, read together.
  window.onSharedPhotos = async () => {
    let list = [];
    try { list = window.__shared ? window.__shared : JSON.parse((S.isAndroid && window.Android && window.Android.sharedPhotos && window.Android.sharedPhotos()) || '[]'); } catch (e) { list = []; }
    window.__shared = null;
    if (!Array.isArray(list) || !list.length) return false;
    if (!on()) { toast('Switch on Calories first (Settings → More features → Food) to log a meal photo'); return false; }
    const F = window.Food, pics = F && F.picsFrom ? await F.picsFrom(list.slice(0, 4), { side: 900, q: 0.8 }) : list.slice(0, 4).map(x => ({ big: x, thumb: x }));
    if (!pics.length) { toast("That picture couldn't be opened"); return false; }
    A.closeSheet(); cur = dayStart(Date.now()); if (A.top().name !== 'calories' || A.depth() > 1) A.setRoot('calories');
    setTimeout(() => (ACT.ordAsk ? ACT.ordAsk(pics, list) : ACT.kcPhoto(null, null, { pics })), 80);      // v1.28: a screenshot may be an order
    return true;
  };
  setTimeout(() => { try { window.onSharedPhotos(); } catch (e) { } }, 900);          // opened by a share: the photos are waiting
  // v1.23 Quick snap: a photo the reader was sure about (it asked nothing, every line was found in the food list with
  // its grams, none is marked "Check this") is logged at once, with Edit and Undo in the message. Anything less clear
  // opens the meal for a look first, as before. Not for a meal eaten out (that one is kept with its place) nor a changed meal.
  const snapOn = () => window.__snap !== false && st().kcSnap !== false;
  function quickOk(mine) {
    return snapOn() && shot === mine && mine.ai && !mine.editId && !mine.out && !mine.typed && !mine.saved && !mine.wait && mine.items.length >= 1
      && mine.items.every(x => String(x.name || '').trim() && num(x.kcal) > 0 && num(x.g) > 0 && (x.fid || (x.how && x.per)) && !x.chk && !x.busy);
  }
  function quickSave(mine) {
    mine.saved = (f, packs, unkeep) => {
      const names = (f.items || []).map(x => String(x.name || '').replace(/,.*$/, '').trim()).filter(Boolean), say = names.slice(0, 2).join(', ') + (names.length > 2 ? ` +${names.length - 2}` : '');
      const U = window.Motion && window.Motion.undoToast;
      if (U) U(`Logged: ${say || 'your meal'} · ${n0(f.kcal)} kcal${packs && packs.length ? ' · kept in My foods' : ''}`, () => { [f.pic, f.big].concat(f.more || []).filter(Boolean).forEach(p => S.deletePhoto(p)); D.food = D.food.filter(x => x.id !== f.id); if (packs && packs.length && unkeep) unkeep(); S.save(true); redraw(); },
        { label: 'Edit', fn: () => { if (ACT.kcShotEdit) ACT.kcShotEdit(f); } });
    };
    ACT.kcShotSave();
  }
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => (on() ? `<div class="row" style="padding:6px 0"><div class="grow">Quick snap<div class="xs dim">A clear photo of a meal is logged straight away, with Edit and Undo. An unclear one still shows you what it read first</div></div><input type="checkbox" data-bind="optSnap" ${st().kcSnap !== false ? 'checked' : ''} style="width:22px;height:22px"></div>
    <div class="row" style="padding:6px 0"><div class="grow">Usual meals<div class="xs dim">An empty meal offers what you usually eat then, to add in one tap</div></div><input type="checkbox" data-bind="optUsual" ${st().kcUsual !== false ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  // v1.26: where a meal photo's numbers come from. On (the start): the AI works out each food's weight and nutrients and the
  // calories are calculated from them. Off: as from 1.16 to 1.25, the AI only names the food and its weight and the food list gives every number.
  window.SettingsRows.push(() => (on() ? `<div class="row" style="padding:6px 0"><div class="grow">Meal photos: nutrients first<div class="xs dim">The photo AI works out each food’s weight and what it holds, and the calories are calculated from that; a packet’s printed table is copied. Off: the AI only names the food and its weight, and every number is from GymDay’s food list</div></div><input type="checkbox" data-bind="optNut" ${nutOn() ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset ? t.dataset.bind : '';
    if (b === 'optNut') { st().kcNut = t.checked; S.save(true); toast(t.checked ? 'Meal photos: worked out from their nutrients' : 'Meal photos: every number from the food list'); return; }
    if (b === 'optSnap') { st().kcSnap = t.checked; S.save(true); toast(t.checked ? 'Quick snap is on' : 'Quick snap is off: every photo meal is shown first'); }
    else if (b === 'optUsual') { st().kcUsual = t.checked; S.save(true); toast(t.checked ? 'Usual meals are offered' : 'Usual meals are not offered'); }
  });
  ACT.kcRowAdd = () => { if (!shot) return; shot.items.push({ name: '', kcal: 0 }); $('#kcRows').innerHTML = shotRows(); };
  ACT.kcRowDel = el => { if (!shot) return; shot.items.splice(+el.dataset.i, 1); $('#kcRows').innerHTML = shotRows(); $('#kcSum').textContent = n0(shotSum()); };
  ACT.kcRowMac = el => { if (!shot) return; const it = shot.items[+el.dataset.i]; if (!it) return; it.open = !it.open; $('#kcRows').innerHTML = shotRows(); };
  const lineOut = x => { const o = { name: String(x.name || '').replace(/\s+/g, ' ').trim().slice(0, 600), kcal: Math.max(0, Math.round(num(x.kcal))) }; for (const k of ['p', 'c', 'f', 'fib']) { const v = r1(num(x[k])); if (v > 0) o[k] = v; } if (num(x.g) > 0) o.g = Math.round(num(x.g)); if (x.fid) o.fid = x.fid; if (x.pk) o.pk = 1; if (x.chk) { o.chk = 1; if (x.tb && x.tb.name) o.fn = x.tb.name; else if (x.fn) o.fn = x.fn; } if (x.how && x.per && !x.fid) { o.how = x.how; o.per = x.per; if (x.lab) o.lab = x.lab; if (x.chk && x.lk) o.lk = x.lk; } if (x.gw && num(x.g) > 0) o.gw = 1; if (x.kf && !x.fid) o.kf = x.kf; if (x.hid) { o.hid = x.hid; if (x.lid) o.lid = x.lid; if (x.ca) o.ca = x.ca; } if (x.ck) o.ck = x.ck; return o; };
  // v1.27 Save a pack once: a packet read off its label is kept in My foods (for one serving when the label gave its size, else
  // for 100 g or ml, with the pack's size), so next time it is one tap and no photo. Never twice under one name. Returns what
  // was kept, for the Undo.
  function keepPacks(items) {
    const out = [];
    for (const x of items) {
      if (x.how !== 'l' || !x.per || !(x.per.k > 0)) continue;
      const name = String(x.name || '').replace(/,[^,]*$/, '').replace(/\s+/g, ' ').trim().slice(0, 600); if (!name || D.myFoods.some(m => fold(m.name) === fold(name))) continue;
      const u = x.lab && x.lab.u === 'ml' ? 'ml' : 'g', sv = x.lab && x.lab.sv > 0 ? r1(x.lab.sv) : 0, k = (sv || 100) / 100;
      const m = { id: S.uid(), name, per: sv ? '1 serving' : '100 ' + u, g: sv || 100, kcal: Math.round(x.per.k * k), lab: 1 };
      for (const a of ['p', 'c', 'f', 'fib']) { const v = r1(num(x.per[a]) * k); if (v > 0) m[a] = v; }
      if (x.lab && x.lab.pk > 0) m.pack = r1(x.lab.pk);
      D.myFoods.push(m); out.push(m);
    }
    return out;
  }
  ACT.kcShotSave = () => {
    if (!shot) return;
    // a name still being typed is settled first; numbers still being worked out are waited for
    shot.items.forEach((it, i) => { if (it.tm) { clearTimeout(it.tm); it.tm = 0; settle(i); } });
    if (busyLines()) { toast('Working out the new numbers… one moment'); const mine = shot; setTimeout(() => { if (shot === mine && !busyLines()) ACT.kcShotSave(); }, 1500); return; }
    const items = shot.items.filter(x => String(x.name || '').trim() || num(x.kcal) > 0), total = shotSum();
    if (!(total > 0)) { toast('Type the calories first'); return; }
    const name = items.map(x => String(x.name || '').trim()).filter(Boolean).join(', ') || 'Meal', sum = k => items.reduce((a, x) => a + num(x[k]), 0);
    const F0 = window.Food, lines = items.map(lineOut).map(o => (F0 && F0.matchLine ? F0.matchLine(o) : o)), done = !!(F0 && F0.dbReady && F0.dbReady());
    if (shot.editId) {
      const e = D.food.find(x => x.id === shot.editId);
      if (e) {
        e.name = name.slice(0, 600); e.kcal = total; e.items = lines; if (done) e.rc = F0.RC || 1;
        for (const k of ['p', 'c', 'f', 'fib']) { const v = Math.round(sum(k) * 10) / 10; if (v > 0) e[k] = v; else delete e[k]; }
        S.save(true);
      }
      shot = null; A.closeSheet(); toast('Saved'); redraw(); return;
    }
    const id = 'meal-' + S.uid();
    const kept = shot.thumb ? S.savePhoto(id, shot.thumb) !== false : false;          // v1.20: a typed meal, a thali or a planned meal has no photo
    // the reading-size photo is kept for a month, so a saved meal can be read again when it is changed
    const bigKept = shot.big && shot.bigOk !== false && S.savePhoto(id + '-big', shot.big) !== false;
    const more = bigKept && shot.pics ? shot.pics.slice(1).map((x, i) => (S.savePhoto(`${id}-big${i + 2}`, x.big) !== false ? `${id}-big${i + 2}` : '')).filter(Boolean) : [];
    const F = window.Food, meal = shot.meal || (F && F.mealFor ? F.mealFor() : '');
    const f = addFood({ name: shot.typed && shot.title ? shot.title : name, kcal: total, p: sum('p'), c: sum('c'), f: sum('f'), fib: sum('fib'), src: shot.typed ? 'typed' : shot.ai ? 'ai' : 'photo', pic: kept ? id : '', meal, t: shot.t0 || 0 });      // v1.27: a photo that waited is logged when it was taken
    f.items = lines; if (done) f.rc = F0.RC || 1; if (bigKept) f.big = id + '-big'; if (more.length) f.more = more;
    if (shot.out) { f.out = 1; if (shot.place) { f.at = shot.place; if (F && F.placeKeep) F.placeKeep(shot.place, f); } }      // eaten out: kept with the place
    const packs = keepPacks(items);                                                       // v1.27: packets read off their label go to My foods
    if (shot.wait) waitDone(shot.wait);                                                   // v1.27: it waited for a signal; now it is logged
    S.save(true);
    const after = shot.saved, unkeep = () => { D.myFoods = D.myFoods.filter(m => !packs.includes(m)); S.save(true); };
    shot = null; A.closeSheet();
    if (packs.length && !after) undoToast(`Meal added · ${n0(total)} kcal · ${packs.length === 1 ? packs[0].name : packs.length + ' packs'} kept in My foods`, () => { unkeep(); toast('Not kept in My foods'); });
    else toast(`Meal added · ${n0(total)} kcal`);
    if (after) after(f, packs, unkeep); redraw();
  };
  // v1.20: lines without a photo: typed ("2 rotis, dal, rice"), a thali, a planned meal. A line given its food from the list (fid and
  // grams) counts that food for those grams; one given only words is matched to the food list like a photo's line.
  // o: { items: [{ name, fid?, g? }], meal, title, note, saved (called with the saved entry) }
  async function linesSheet(o) {
    const F = window.Food; try { if (F && F.loadDb) await F.loadDb(); } catch (e) { /* the list is in the app */ }
    const mine = shot = { pics: null, big: '', thumb: '', items: [], busy: false, note: o.note || '', ai: false, out: false, meal: o.meal || '', typed: true, title: o.title || '', saved: o.saved || null };
    for (const l of o.items || []) {
      const x = { name: String(l.name || '').replace(/\s+/g, ' ').trim().slice(0, 600), kcal: 0 }; if (!x.name) continue;
      const t = l.fid && num(l.g) > 0 && F && F.valuesAt ? F.valuesAt(l.fid, num(l.g)) : null;
      if (t) { for (const k of KEYS) x[k] = k === 'kcal' ? Math.round(t.v.kcal) : t.v[k]; x.g = Math.round(t.g); x.fid = t.fid; x.tb = { name: t.name, k: Math.round(t.v.kcal) }; x.pk = 1; x.st = `Food list: ${t.name}, ${Math.round(x.g)} g`; x.b = snap(x); }
      else { x.tl = 1; useTable(x, false); }
      mine.items.push(x);
    }
    if (!mine.items.length) mine.items = [{ name: '', kcal: 0 }];
    if (shot === mine) shotSheet();
  }
  // changing a saved photo meal: its lines again, with its photo
  // v1.16: "Check this": the closest foods, or the food list's search, for one line
  ACT.kcLinePick = el => {
    if (!shot) return; const i = +el.dataset.i, it = shot.items[i]; if (!it) return;
    const F = window.Food;
    const open = () => { it.pick = !it.pick; const rows = $('#kcRows'); if (rows) rows.innerHTML = shotRows(); const q = it.pick && document.querySelector(`[data-kc="pq"][data-i="${i}"]`); if (q && !(F.altsFor(it.name, { out: !!shot.out }, it.fid) || []).length) q.focus(); };
    if (F && F.dbReady && !F.dbReady()) { F.loadDb().then(open).catch(() => toast("The food list couldn't open")); return; }
    open();
  };
  ACT.kcLineUse = el => {
    if (!shot) return; const i = +el.dataset.i, it = shot.items[i], F = window.Food; if (!it || !F || !F.valuesAt) return;
    const t = F.valuesAt(el.dataset.fid, num(it.g)); if (!t) return;
    for (const k of KEYS) it[k] = k === 'kcal' ? Math.round(t.v.kcal) : t.v[k];
    it.g = Math.round(t.g); it.fid = t.fid; it.tb = { name: t.name, k: Math.round(t.v.kcal) }; it.pk = 1; delete it.chk; delete it.pick; delete it.fn; nutOff(it);
    it.st = `Food list: ${t.name}, ${Math.round(it.g)} g (you picked it)`; it.b = snap(it); it.ref = null; it.typed = null;
    const rows = $('#kcRows'); if (rows) rows.innerHTML = shotRows();
    const sum = $('#kcSum'); if (sum) sum.textContent = n0(shotSum());
    try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(8); } catch (x) { }
  };
  ACT.kcLineKeep = el => {                                    // v1.26: the worked-out numbers stay, and the line is not asked about again
    if (!shot) return; const i = +el.dataset.i, it = shot.items[i]; if (!it) return;
    delete it.chk; delete it.lk; delete it.pick; if (it.how && it.per) it.st = nutText(it);
    const rows = $('#kcRows'); if (rows) rows.innerHTML = shotRows();
  };
  ACT.kcUsualAmt = el => {                                    // v1.27: the amount of this food the person usually has (kcUsual is the usual meals’ button)
    if (!shot) return; const i = +el.dataset.i, it = shot.items[i], g = num(el.dataset.g), F = window.Food, was = num(it && it.g); if (!it || !(g > 0)) return;
    const t = it.fid && F && F.valuesAt ? F.valuesAt(it.fid, g) : null;
    if (t) { for (const k of KEYS) it[k] = k === 'kcal' ? Math.round(t.v.kcal) : t.v[k]; it.tb = { name: t.name, k: Math.round(t.v.kcal) }; it.st = `Food list: ${t.name}, ${Math.round(g)} g · your usual amount`; }
    else if (it.per) { const m = g / 100; it.kcal = Math.round(it.per.k * m); it.p = it.per.p * m; it.c = it.per.c * m; it.f = it.per.f * m; it.fib = it.per.fib * m; it.st = nutText(it); }
    else if (was > 0) { for (const k of KEYS) it[k] = k === 'kcal' ? Math.round(num(it.kcal) * g / was) : num(it[k]) * g / was; it.st = 'Your usual amount'; }
    else return;
    it.g = Math.round(g); it.gw = 1; it.b = snap(it); it.ref = null; it.typed = null; paintLine(i);
    try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(8); } catch (x) { }
  };
  ACT.kcLabAmt = el => {
    if (!shot) return; const i = +el.dataset.i, it = shot.items[i], g = num(el.dataset.g); if (!it || !it.per || !(g > 0)) return;
    const m = g / 100; it.g = Math.round(g); it.gw = 1; it.kcal = Math.round(it.per.k * m); it.p = it.per.p * m; it.c = it.per.c * m; it.f = it.per.f * m; it.fib = it.per.fib * m;
    const said = String(el.textContent || '').split('·')[0].trim().toLowerCase(), nm = String(it.name || '').trim();          // the name says the amount too
    if (said && nm) { it.name = ((nm.includes(',') ? nm.replace(/,[^,]*$/, '') : nm) + ', ' + said).slice(0, 600); const box = document.querySelector(`[data-kc="name"][data-i="${i}"]`); if (box) { box.value = it.name; if (window.GrowBox) window.GrowBox.fit(box); } }
    it.st = nutText(it); it.b = snap(it); it.ref = null; it.typed = null; paintLine(i);
  };
  ACT.kcShotEdit = e => {
    if (!e || !Array.isArray(e.items) || !e.items.length) return false;
    const F0 = window.Food; if (F0 && F0.loadDb) F0.loadDb().catch(() => { });          // v1.14: the list, for the lines' foods
    const big = e.big ? S.loadPhoto(e.big) : '', thumb = e.pic ? S.loadPhoto(e.pic) : '';
    const others = big && Array.isArray(e.more) ? e.more.map(id => S.loadPhoto(id)).filter(Boolean) : [];
    shot = { big: big || thumb, bigOk: !!big, thumb, items: e.items.map(x => Object.assign({}, x, { b: snap(x) }, x.how && x.per ? { st: nutText(x) } : {})), ai: e.src === 'ai', editId: e.id,
      pics: others.length ? [{ big, thumb }].concat(others.map(x => ({ big: x, thumb: x }))) : null,
      note: big ? '' : thumb ? "The full photo isn't kept any more, so a changed food is looked up in the food list." : (e.pic || e.big) ? 'The photo is on the phone that took it, so a changed food is looked up in the food list.' : '' };
    shotSheet(); return true;
  };
  ACT.kcShotDel = () => {
    if (!shot || !shot.editId) return; const i = D.food.findIndex(x => x.id === shot.editId); if (i < 0) return;
    const f = D.food.splice(i, 1)[0]; shot = null; S.save(true); A.closeSheet(); redraw();
    const undo = window.Motion && window.Motion.undoToast ? window.Motion.undoToast : null;
    if (undo) undo(f.name + ' removed', () => { D.food.push(f); S.save(true); redraw(); }); else toast(f.name + ' removed');
    if (f.pic || f.big) setTimeout(() => { if (!D.food.includes(f)) { if (f.pic && !D.food.some(x => x.pic === f.pic)) S.deletePhoto(f.pic); if (f.big) S.deletePhoto(f.big); (f.more || []).forEach(id => S.deletePhoto(id)); } }, 8000);
  };
  // reading-size photos older than a month are let go (the thumbnail stays)
  setTimeout(() => {
    const old = Date.now() - 30 * 86400000; let ch = false;
    for (const e of D.food || []) if (e.big && e.t < old) { try { S.deletePhoto(e.big); (e.more || []).forEach(id => S.deletePhoto(id)); } catch (x) { } delete e.big; delete e.more; ch = true; }
    if (ch) S.save(true);
  }, 4000);

  // =====================================================================================================
  // On a workout: what it burnt, and typing the numbers from a watch
  // =====================================================================================================
  function burnCard(s) {
    if (!on() || !s || !s.id) return '';
    const b = burnOf(s), m = s.man || {};
    const hr = m.avg || m.lo || m.hi ? `<p class="small mt8">♥ ${m.avg ? `${m.avg} on average` : ''}${m.avg && (m.lo || m.hi) ? ' · ' : ''}${m.lo && m.hi ? `${m.lo}–${m.hi}` : m.hi ? `up to ${m.hi}` : m.lo ? `from ${m.lo}` : ''} <span class="xs dim">typed by you</span></p>` : '';
    return `<div class="card" id="kcBurn"><div class="row"><div class="grow" style="min-width:0"><div class="k2">Calories burnt</div><div class="title">${b.src === 'none' ? '–' : (b.src === 'est' ? '≈ ' : '') + n0(b.kcal) + ' kcal'}</div><div class="xs muted">${esc(srcText(b))}</div></div>
      <button class="btn sm" data-act="kcStats" data-id="${esc(s.id)}">${s.man ? 'Change' : 'Type it'}</button></div>${addLine(s, b)}${hr}${wkCardPart(s)}</div>`;
  }
  // v1.21.8: what a workout adds to its day's Burnt, and why (the everyday burn already counts its time; a watch's day total has it)
  const minText = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
  function addLine(s, b) {
    if (b.src === 'none') return '';
    const d = dayOf(dayStart(s.start)), x = d.ws.find(y => y.s.id === s.id); if (!x) return '';
    const share = n0(b.per * b.cm), rest = b.active ? ` Active calories leave out what your body burns at rest anyway (about ${n0(b.restMin * b.cm)} kcal), so ${n0(b.gross)} in all.` : '';
    let t;
    if (d.watch && !x.after) t = `It's in your watch's total for ${d.cut != null ? `the day up to ${clock(d.cut)}` : 'the day'}, so nothing more is added to Burnt.`;
    else if (d.watch) t = `It was after your watch's numbers (taken at ${clock(d.cut)}), and the rest of your day already counts about ${share} kcal for its ${minText(b.cm)}, so it adds <b>${n0(x.add)} kcal</b> to Burnt.${rest}`;
    else if (d.base == null) t = `All of it is added to Burnt (Burnt counts workouts and activities only).`;
    else if (x.add > 0) t = `Adds <b>${n0(x.add)} kcal</b> to the day's Burnt: your everyday burn already counts about ${share} kcal for its ${minText(b.cm)}, so only the rest is added.${rest}`;
    else t = `Your everyday burn already counts about ${share} kcal for its ${minText(b.cm)}, as much as this workout burnt${b.active ? ' with its resting part' : ''}, so nothing more is added.`;
    return `<p class="xs muted mt8 kc-addline">${t}</p>`;
  }
  let statsId = null;
  ACT.kcStats = el => {
    const s = D.sessions.find(x => x.id === el.dataset.id); if (!s) return; statsId = s.id;
    const m = s.man || {}, hc = s.hc && !s.hc.none ? s.hc : s.shot ? { kcal: s.shot.kcal, avg: s.shot.avg, min: s.shot.min, max: s.shot.max } : {}, from = s.hc && !s.hc.none ? 'watch: ' : 'screenshots: ', f = (id, label, v, ph) => `<div class="grow"><label class="lbl">${label}</label><input class="input" id="${id}" type="number" inputmode="numeric" value="${v > 0 ? v : ''}" placeholder="${ph || '–'}"></div>`;
    A.openSheet(`<h2>Calories and heart rate</h2><p class="muted small">${wOn() ? 'Type what your watch or the machine showed for this workout.' : 'Type what the machine or your app showed for this workout.'} Leave a box empty if you don't have it.</p>
      <div class="field mt12">${f('kcMK', 'Calories burnt (kcal)', m.kcal, hc.kcal ? from + hc.kcal : '')}</div>
      <div class="field">${f('kcMA', 'Average heart rate', m.avg, hc.avg ? from + hc.avg : '')}</div>
      <div class="row" style="gap:10px">${f('kcML', 'Lowest', m.lo, hc.min ? from + hc.min : '')}${f('kcMH', 'Highest', m.hi, hc.max ? from + hc.max : '')}</div>
      ${wOn() ? `<p class="xs dim mt8">What you type here is used instead of the watch's numbers for this workout.</p>
      <button class="btn block mt12" data-act="kcWkShots" data-id="${esc(s.id)}">📷 Read screenshots from your watch instead</button>` : ''}
      ${wOn() && window.Health && S.isAndroid ? `<button class="btn block mt12" data-act="kcFromWatch">Get them from my watch instead</button>` : ''}
      <div class="row mt12">${s.man ? `<button class="btn danger" data-act="kcStatsClear">Clear</button>` : `<button class="btn" data-act="closeSheet">Cancel</button>`}<button class="btn primary grow" data-act="kcStatsSave">Save</button></div>`);
  };
  ACT.kcStatsSave = () => {
    const s = D.sessions.find(x => x.id === statsId); if (!s) return;
    const v = id => Math.round(num(($('#' + id) || {}).value)), m = { kcal: v('kcMK'), avg: v('kcMA'), lo: v('kcML'), hi: v('kcMH') };
    if (m.kcal < 0 || m.kcal > 5000) { toast("That calorie number doesn't look right"); return; }
    for (const k of ['avg', 'lo', 'hi']) if (m[k] && (m[k] < 30 || m[k] > 240)) { toast('A heart rate is between 30 and 240'); return; }
    if (m.lo && m.hi && m.lo > m.hi) { const t = m.lo; m.lo = m.hi; m.hi = t; }
    Object.keys(m).forEach(k => { if (!(m[k] > 0)) delete m[k]; });
    if (Object.keys(m).length) s.man = m; else delete s.man;
    S.save(true); A.closeSheet(); toast('Saved'); redraw();
  };
  ACT.kcStatsClear = () => { const s = D.sessions.find(x => x.id === statsId); if (!s) return; const was = s.man; delete s.man; S.save(true); A.closeSheet(); redraw(); undoToast('Your numbers cleared', () => { s.man = was; S.save(true); redraw(); }); };
  ACT.kcFromWatch = () => { const id = statsId; A.closeSheet(); if (ACT.hcRefresh) ACT.hcRefresh({ dataset: { id } }); };

  // =====================================================================================================
  // v1.12: screenshots from a watch or fitness app after a workout (up to 10 since 1.35.2, was 4; read together): calories, heart rate,
  // time in zones, duration, steps and anything else on them. The numbers are kept with the workout (s.shot);
  // the pictures are not. What they say is explained in plain words.
  // =====================================================================================================
  let wk = null;                 // { id, pics, busy, err, res: { workout, note }, view }
  const pctOf = (a, b) => Math.round(a / b * 100);
  const fmtMin = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`; };
  const undoToast = (m, f) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, f) : toast(m));
  // the highest heart rate to compare with: 208 − 0.7 × age (Tanaka 2001), or the highest one recorded in a workout when that is higher
  function hrMaxOf(id, now) {
    const a = ageNow(); let top = 0;
    for (const x of D.sessions) { if (x.id === id) continue; for (const v of [x.hc && !x.hc.none ? x.hc.max : 0, x.shot ? x.shot.max : 0, x.man ? x.man.hi : 0]) if (v > top && v <= 230) top = v; }
    const est = a >= 8 && a <= 100 ? Math.round(208 - 0.7 * a) : 0;
    if (now > Math.max(top, est) && now <= 230 && (top || est)) return { v: now, how: 'the highest in any of your workouts: this one' };
    return top > est ? { v: top, how: 'the highest your watch has recorded in a workout' } : est ? { v: est, how: `estimated from your age: 208 − 0.7 × ${a}` } : { v: 0, how: '' };
  }
  // the American College of Sports Medicine's levels, by average heart rate as a share of the maximum
  const EFFORT = [[96, 'Near your maximum'], [77, 'Vigorous'], [64, 'Moderate'], [57, 'Light'], [0, 'Very light']];
  const effortOf = p => EFFORT.find(e => p >= e[0])[1];
  const effortName = p => (p >= 96 ? 'Near-maximal' : effortOf(p));                                    // v1.13: in "... effort"
  const effortA = p => 'A ' + effortName(p).toLowerCase();                                             // as in: A moderate workout
  // zones from the easiest to the hardest: by their heart rates, or the number in their name
  function sortZones(zs) {
    const z = (zs || []).filter(x => x && x.n && x.m >= 0);
    if (z.length && z.every(x => x.lo > 0)) return z.slice().sort((a, b) => a.lo - b.lo);
    const no = x => { const m = /(?:zone|z)\s*(\d)/i.exec(x.n); return m ? +m[1] : null; };
    return z.every(x => no(x) != null) ? z.slice().sort((a, b) => no(a) - no(b)) : z;
  }
  const ZC = ['#8EA4C8', '#4FB3F6', '#4CCB8F', '#F5B83D', '#F2564B'];
  const zoneColor = (i, n) => ZC[n <= 1 ? 0 : Math.round(i * (ZC.length - 1) / (n - 1))];
  function zonesHtml(w, compact) {
    const zs = sortZones(w.zones), tot = zs.reduce((a, z) => a + z.m, 0); if (!(tot > 0)) return '';
    const bar = `<div class="kc-zbar" aria-label="Time in each heart-rate zone">${zs.map((z, i) => (z.m > 0 ? `<i style="width:${(z.m / tot * 100).toFixed(1)}%;background:${zoneColor(i, zs.length)}"></i>` : '')).join('')}</div>`;
    if (compact) return bar;
    return bar + `<div class="kc-zl">${zs.map((z, i) => `<div class="row xs"><span class="kc-zd" style="background:${zoneColor(i, zs.length)}"></span><span class="grow">${esc(z.n)}${z.lo && z.hi ? ` <span class="dim">${z.lo}–${z.hi}</span>` : ''}</span><b>${fmtMin(z.m)}</b><span class="muted kc-zp">${pctOf(z.m, tot)}%</span></div>`).join('')}</div>`;
  }
  // what the server read, in the shape kept with the workout (only what was read)
  function shotOf(w, n) {
    const o = { kcal: Math.round(num(w.kcal)), kind: w.kcal_kind || '', avg: Math.round(num(w.avg_hr)), max: Math.round(num(w.max_hr)), min: Math.round(num(w.min_hr)), mins: Math.round(num(w.duration_min) * 10) / 10,
      zones: (w.zones || []).map(z => ({ n: String(z.name || '').slice(0, 40), m: num(z.min), lo: Math.round(num(z.low)), hi: Math.round(num(z.high)) })).filter(z => z.n),
      steps: Math.round(num(w.steps)), km: Math.round(num(w.distance_km) * 100) / 100, other: (w.other || []).map(x => ({ n: String(x.name || '').slice(0, 40), v: String(x.value || '').slice(0, 40) })).filter(x => x.n && x.v),
      app: String(w.app || '').slice(0, 40), n: n || 1, at: Date.now() };
    for (const k of Object.keys(o)) if (o[k] === 0 || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
    return o;
  }
  // what the numbers say, line by line
  function wkAnalysis(s, w) {
    const out = [], ref = w.avg || w.max ? hrMaxOf(s.id, w.max || 0) : { v: 0 }, gym = S.gymMs(s) / 60000;
    let p = 0;
    if (w.avg && ref.v) { p = pctOf(w.avg, ref.v); out.push({ h: `${effortOf(p)} effort`, t: `Your heart rate averaged ${w.avg} bpm: ${p}% of your maximum of about ${ref.v} (${ref.how}).` }); }
    else if (w.avg) out.push({ h: 'Average heart rate', t: `${w.avg} bpm. Add your age in About me to see how hard that was for you.` });
    if (w.max && ref.v) { const q = pctOf(w.max, ref.v); out.push({ h: 'Hardest moment', t: `${w.max} bpm at the top: ${q}% of your maximum${q >= 90 ? ', so your hardest sets came close to your limit' : q >= 77 ? ', a vigorous moment' : ''}.` }); }
    const zs = sortZones(w.zones), zt = zs.reduce((a, z) => a + z.m, 0);
    if (zt > 0) { const top = zs.slice().sort((a, b) => b.m - a.m)[0]; out.push({ h: 'Time in zones', t: `Most of it in ${top.n}: ${fmtMin(top.m)} of ${fmtMin(zt)} (${pctOf(top.m, zt)}%).` }); }
    const m = w.mins || gym;
    if (w.kcal && m >= 1) out.push({ h: 'Burn rate', t: `${n0(w.kcal)} kcal in ${fmtMin(m)}: about ${(w.kcal / m).toFixed(1)} kcal a minute${w.kind === 'total' ? ' (total calories, with what your body burns at rest)' : w.kind === 'active' ? ' (active calories)' : ''}.` });
    if (w.mins && gym >= 1 && Math.abs(w.mins - gym) > Math.max(10, gym * 0.25)) out.push({ warn: true, h: 'Check they are from this workout', t: `The screenshots show ${fmtMin(w.mins)}, but this workout took ${fmtMin(gym)} in the app.` });
    const prev = D.sessions.filter(x => x.id !== s.id && x.shot && x.shot.avg && x.start < s.start).sort((a, b) => b.start - a.start).slice(0, 5);
    if (w.avg && prev.length >= 2) { const av = Math.round(prev.reduce((a, x) => a + x.shot.avg, 0) / prev.length), d = w.avg - av; out.push({ h: 'Against your last workouts', t: Math.abs(d) < 3 ? `About the same heart rate as your last ${prev.length} read workouts (${av} on average).` : `${Math.abs(d)} bpm ${d > 0 ? 'higher' : 'lower'} on average than your last ${prev.length} read workouts (${av}).` }); }
    const est = burnOf(Object.assign({}, s, { man: null, shot: null, hc: null }));
    if (w.kcal && est.src === 'est') out.push({ h: "The app's own estimate", t: `About ${n0(est.kcal)} kcal from your time and weight; ${w.app || 'your watch'} says ${n0(w.kcal)}. The watch's number is the one used.` });
    if (w.steps || w.km) out.push({ h: 'Steps and distance', t: [w.steps ? `${n0(w.steps)} steps` : '', w.km ? `${w.km} km` : ''].filter(Boolean).join(' · ') + '.' });
    if (p && p < 77) out.push({ note: true, t: 'Lifting is done in sets with rests between them, so its average heart rate sits lower than in running or cycling. Judge a lifting day more by your sets and weights.' });
    return out;
  }
  const tile = (v, k) => `<div class="kc-wt"><b>${v}</b><span>${k}</span></div>`;
  function wkNumbers(w) {
    const t = [];
    if (w.kcal) t.push(tile(n0(w.kcal), w.kind === 'total' ? 'kcal, total' : w.kind === 'active' ? 'kcal, active' : 'kcal'));
    if (w.mins) t.push(tile(fmtMin(w.mins), 'workout time'));
    if (w.avg) t.push(tile(w.avg, '♥ average'));
    if (w.max) t.push(tile(w.max, '♥ highest'));
    if (w.min) t.push(tile(w.min, '♥ lowest'));
    if (w.steps) t.push(tile(n0(w.steps), 'steps'));
    if (w.km) t.push(tile(w.km, 'km'));
    return `${t.length ? `<div class="kc-wtiles">${t.join('')}</div>` : ''}${zonesHtml(w)}${(w.other || []).length ? `<div class="kc-read mt8">${w.other.map(o => `<div class="kc-read-r"><span>${esc(o.n)}</span><b>${esc(o.v)}</b></div>`).join('')}</div>` : ''}`;
  }
  function wkLines(s, w) {
    const L = wkAnalysis(s, w); if (!L.length) return '';
    return `<div class="kc-sec mt12">What it says</div><div class="kc-wan">${L.map(x => (x.note ? `<p class="xs dim mt8">${esc(x.t)}</p>` : `<div class="kc-wl${x.warn ? ' warn' : ''}"><b>${esc(x.h)}</b><span class="small">${esc(x.t)}</span></div>`)).join('')}</div>`;
  }
  // on the Calories burnt card: what the screenshots said in one look, or the button to add them
  function wkCardPart(s) {
    const w = s.shot;
    if (!w) return wOn() ? `<button class="btn block mt12" data-act="kcWkShots" data-id="${esc(s.id)}">📷 Screenshots from your watch or app</button>` : '';
    const ref = w.avg ? hrMaxOf(s.id, w.max || 0) : { v: 0 }, p = ref.v ? pctOf(w.avg, ref.v) : 0;
    return `<div class="kc-wsum tap" data-act="kcWkView" data-id="${esc(s.id)}"><div class="row" style="gap:10px">${p ? effortSvg(p, true) : ''}<div class="grow" style="min-width:0"><div class="small"><b>${p ? effortName(p) + ' effort' : 'From your screenshots'}</b></div>
      <div class="xs muted">${[w.avg ? `♥ ${w.avg} average` : '', w.min && w.max ? `${w.min}–${w.max}` : w.max ? `up to ${w.max}` : '', w.mins ? fmtMin(w.mins) : ''].filter(Boolean).join(' · ')}</div>${w.kcal ? `<div class="xs muted">${n0(w.kcal)} kcal: ${esc(equivOf(w.kcal))}</div>` : ''}</div></div>
      ${zonesHtml(w, true)}<div class="row mt4"><span class="xs muted grow">${p ? `${p}% of your maximum heart rate` : ''}</span><span class="xs accent">What it says ›</span></div></div>`;
  }
  function readWorkout(list, ctx) {
    if (window.__workoutAi) return Promise.resolve(window.__workoutAi(list, ctx));                    // tests
    const C = window.Cloud;
    if (!C || !C.configured || !C.workoutShots) return Promise.reject({ message: 'Reading screenshots needs a GymDay account. Type the calories for now.' });
    if (!C.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have screenshots read for you. For now, type the calories.' });
    return C.workoutShots(list.map(x => String(x).replace(/^data:image\/\w+;base64,/, '')), ctx).catch(e => {
      if (e && e.status === 404) throw { message: "Reading screenshots isn't switched on for this account's server yet. Type the calories." };
      throw { message: (e && e.message) || "The screenshots couldn't be read. Type the calories instead." };
    });
  }
  // the workout in words, so the right one is read when the screenshots show more than one
  const ctxOf = s => {
    const d = new Date(s.start), groups = [...new Set((s.items || []).filter(it => !it.skipped).map(it => (S.getEx(it.ex) || {}).group).filter(Boolean))].slice(0, 3).join(', ').toLowerCase();
    return `${d.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}, started ${d.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}, ${Math.round(S.gymMs(s) / 60000)} min in the app${groups ? ', ' + groups : ''}`;
  };
  function wkSheet() {
    const o = wk; if (!o) return;
    const s = D.sessions.find(x => x.id === o.id); if (!s) { wk = null; return; }
    const F = window.Food, w = o.view ? s.shot : o.res ? shotOf(o.res.workout, o.pics.length) : null, n = (o.pics || []).length;
    const strip = n && F && F.photoStrip ? F.photoStrip(o.pics, { tall: true, max: 10, what: 'Screenshot', del: o.busy ? '' : 'kcWkPicDel', add: o.busy ? '' : 'kcWkMore', addText: 'Add a screenshot' }) : '';
    let body;
    if (o.busy) body = `<div class="kc-ai"><span class="kc-spin"></span> Reading ${n === 1 ? 'the screenshot' : `the ${n} screenshots together`}…<div class="xs dim mt4">Calories, heart rate, zones, time, steps and anything else on them. They are sent to the AI service set up for your account, only to be read, and are not kept.</div></div>`;
    else if (o.err) body = `<p class="small mt8">${esc(o.err)}</p><div class="row mt12" style="gap:8px"><button class="btn grow" data-act="kcWkType">Type it instead</button><button class="btn primary grow" data-act="kcWkAgain">Try again</button></div>`;
    else if (w) body = wkPicture(s, w) + `<details class="kc-more-d mt12"><summary>All the numbers</summary>${wkNumbers(w)}${wkLines(s, w)}</details>` + (o.res && o.res.note ? `<p class="xs dim mt8">What the AI saw: ${esc(String(o.res.note).slice(0, 200))}</p>` : '')
      + (o.view ? `<div class="row mt16" style="gap:8px"><button class="btn danger" data-act="kcWkDel">Remove</button><button class="btn grow" data-act="kcWkNew">New screenshots</button><button class="btn primary grow" data-act="closeSheet">Done</button></div>`
        : `${s.man ? `<p class="xs muted mt8">Saving these replaces the numbers you typed for this workout.</p>` : ''}<div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="kcWkSave">Save to this workout</button></div>`);
    else body = '';
    A.openSheet(`<h2>${o.view ? 'From your watch' : 'Workout screenshots'}</h2><div class="xs muted mb8">${esc(A.fmtDate ? `${A.fmtDate(s.start)} · ${A.fmtClock(s.start)}` : '')}${o.view && w && w.app ? ' · ' + esc(w.app) : ''}</div>${strip}${body}`, null, () => { if (wk === o) wk = null; });
    wk = o;            // opening a sheet closes the one before it, which can be this same sheet
  }
  async function wkRead(o) {
    const s = D.sessions.find(x => x.id === o.id); if (!s) return;
    Object.assign(o, { busy: true, err: '', res: null, view: false }); wkSheet();
    let r;
    try { r = await readWorkout(o.pics.map(x => x.big), ctxOf(s)); }
    catch (e) { if (wk !== o) return; o.busy = false; o.err = (e && e.message) || "The screenshots couldn't be read. Type the calories instead."; wkSheet(); return; }
    if (wk !== o) return;
    o.busy = false;
    if (r && r.workout) o.res = r; else o.err = "No workout numbers could be read in those screenshots. Try the summary screen of your watch's app, or type the calories.";
    wkSheet();
  }
  const SHOT_SIDE = 1500;          // screenshots keep more of their size than food photos: small print has to stay readable
  ACT.kcWkShots = async el => {
    const id = el.dataset.id, F = window.Food; if (!D.sessions.some(x => x.id === id) || !F || !F.pickPhotos) return;
    const pics = await F.pickPhotos({ max: 10, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!pics.length) return;      // 1.35.2 (60): up to 10, was 4
    wkRead(wk = { id, pics });
  };
  ACT.kcWkMore = async () => {
    const o = wk; if (!o || o.busy || o.view || (o.pics || []).length >= 10) return;
    const got = await window.Food.pickPhotos({ max: 10 - o.pics.length, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!got.length || wk !== o) return;
    o.pics = o.pics.concat(got).slice(0, 10); wkRead(o);
  };
  ACT.kcWkPicDel = el => { const o = wk; if (!o || o.busy || !o.pics || o.pics.length < 2) return; o.pics.splice(+el.dataset.i, 1); wkRead(o); };
  ACT.kcWkAgain = () => { if (wk && !wk.busy && wk.pics && wk.pics.length) wkRead(wk); };
  ACT.kcWkType = () => { const o = wk; wk = null; A.closeSheet(); if (o) ACT.kcStats({ dataset: { id: o.id } }); };
  ACT.kcWkView = el => { if (!D.sessions.some(x => x.id === el.dataset.id && x.shot)) return; wk = { id: el.dataset.id, pics: [], view: true }; wkSheet(); };
  ACT.kcWkNew = () => { const o = wk; if (!o) return; wk = null; A.closeSheet(); ACT.kcWkShots({ dataset: { id: o.id } }); };
  const burnRedraw = s => { const c = $('#kcBurn'); if (c) c.outerHTML = burnCard(s); redraw(); };
  ACT.kcWkSave = () => {
    const o = wk; if (!o || !o.res || !o.res.workout) return;
    const s = D.sessions.find(x => x.id === o.id); if (!s) return;
    const was = { shot: s.shot, man: s.man };
    s.shot = shotOf(o.res.workout, o.pics.length);
    if (s.man) delete s.man;                    // the newest numbers count; what was typed comes back with Undo
    S.save(true); wk = null; A.closeSheet(); burnRedraw(s);
    undoToast(was.man ? 'Saved · the numbers you typed were replaced' : 'Saved to this workout', () => { if (was.shot) s.shot = was.shot; else delete s.shot; if (was.man) s.man = was.man; S.save(true); burnRedraw(s); });
  };
  ACT.kcWkDel = () => {
    const o = wk, s = o && D.sessions.find(x => x.id === o.id); if (!s || !s.shot) return;
    const was = s.shot; delete s.shot; S.save(true); wk = null; A.closeSheet(); burnRedraw(s);
    undoToast('Screenshot numbers removed', () => { s.shot = was; S.save(true); burnRedraw(s); });
  };

  // =====================================================================================================
  // v1.13: what a workout's or a whole day's screenshots say, as a picture and a few plain sentences
  // =====================================================================================================
  // the effort gauge: average heart rate as a share of the maximum, over the American College of Sports Medicine's bands
  const BANDS = [[40, 57, '#8EA4C8'], [57, 64, '#4FB3F6'], [64, 77, '#4CCB8F'], [77, 96, '#F5B83D'], [96, 100, '#F2564B']];
  function effortSvg(p, small) {
    const W = small ? 64 : 200, H = small ? 40 : 118, cx = W / 2, cy = small ? 36 : 104, r = small ? 26 : 84, sw = small ? 7 : 16, lo = 40, hi = 100;
    const at = v => { const a = Math.PI * (1 - (Math.min(hi, Math.max(lo, v)) - lo) / (hi - lo)); return [cx + r * Math.cos(a), cy - r * Math.sin(a)]; };
    const arc = (a, b, col) => { const [x1, y1] = at(a), [x2, y2] = at(b); return `<path d="M${x1.toFixed(1)} ${y1.toFixed(1)} A${r} ${r} 0 0 1 ${x2.toFixed(1)} ${y2.toFixed(1)}" stroke="${col}" stroke-width="${sw}" fill="none"/>`; };
    const [nx, ny] = (() => { const a = Math.PI * (1 - (Math.min(hi, Math.max(lo, p)) - lo) / (hi - lo)), L = r - (small ? 2 : 6); return [cx + L * Math.cos(a), cy - L * Math.sin(a)]; })();
    return `<svg class="kc-gauge${small ? ' sm' : ''}" viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" role="img" aria-label="Effort: ${p}% of your maximum heart rate">${BANDS.map(b => arc(b[0], b[1], b[2])).join('')}
      <line x1="${cx}" y1="${cy}" x2="${nx.toFixed(1)}" y2="${ny.toFixed(1)}" stroke="var(--text)" stroke-width="${small ? 2 : 3.5}" stroke-linecap="round"/><circle cx="${cx}" cy="${cy}" r="${small ? 3 : 6}" fill="var(--text)"/>
</svg>`;
  }
  // calories as everyday food, from the food list: a medium chapati (43 g) is about 100 kcal, a banana (126 g) about 120,
  // a plate of chicken biryani (300 g) about 490
  function equivOf(k) {
    if (!(k > 0)) return '';
    if (k < 90) return 'about half a banana';
    if (k < 300) { const n = Math.round(k / 120); return `about ${n <= 1 ? 'a banana' : n + ' bananas'}`; }
    if (k < 1200) { const n = Math.round(k / 100); return `about ${n} medium chapatis`; }
    const n = Math.round(k / 490 * 2) / 2; return `about ${n % 1 ? n.toFixed(1) : n} plates of chicken biryani`;
  }
  const bigNum = (v, k) => `<div class="kc-num"><b>${v}</b><span>${k}</span></div>`;
  function wkPicture(s, w) {
    const ref = w.avg || w.max ? hrMaxOf(s.id, w.max || 0) : { v: 0 }, p = w.avg && ref.v ? pctOf(w.avg, ref.v) : 0;
    const zs = sortZones(w.zones), zt = zs.reduce((a, z) => a + z.m, 0), top = zt > 0 ? zs.slice().sort((a, b) => b.m - a.m)[0] : null;
    const words = [];
    if (p) words.push(`${effortA(p)} workout: your heart averaged ${w.avg} beats a minute, ${p}% of your maximum.`);
    if (top) words.push(`Most of it was in ${top.n}: ${fmtMin(top.m)} of ${fmtMin(zt)}.`);
    if (w.kcal) words.push(`You burnt ${n0(w.kcal)} kcal${w.kind === 'total' ? ' (with what your body burns at rest)' : ''}: ${equivOf(w.kcal)}.`);
    if (w.max && ref.v) { const q = pctOf(w.max, ref.v); words.push(q >= 90 ? `Your hardest sets took you to ${w.max}, close to your limit.` : `At its hardest your heart reached ${w.max}.`); }
    const big = [w.kcal ? bigNum(n0(w.kcal), 'kcal') : '', w.mins ? bigNum(fmtMin(w.mins), 'time') : '', w.avg ? bigNum(w.avg, '♥ average') : ''].filter(Boolean).join('');
    return `<div class="kc-pic">${p ? `<div class="kc-gwrap">${effortSvg(p)}<div class="kc-glab"><b>${effortName(p)} effort</b><span class="xs muted">${p}% of your maximum heart rate</span></div></div>` : ''}${big ? `<div class="kc-nums">${big}</div>` : ''}${zonesHtml(w, true)}</div>
      <div class="kc-words">${words.map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  }

  // ---------------------------------------------------------------- a whole day from the watch: the card on the Food tab
  const actOf = t0 => (D.acts || []).find(a => a.d === keyDay(t0)) || null;
  // steps a day for adults (Tudor-Locke and others, 2008)
  const stepBand = n => (n >= 12500 ? 'very active' : n >= 10000 ? 'active' : n >= 7500 ? 'fairly active' : n >= 5000 ? 'lightly active' : 'mostly sitting');
  function dayWords(a, d) {
    const out = [];
    if (a.steps) out.push(`${n0(a.steps)} steps: ${stepBand(a.steps)}${a.km ? `, ${a.km} km` : ''}.`);
    if (a.kt) out.push(`Your watch says you burnt ${n0(a.kt)} kcal${d && d.cut != null && d.act === a ? ` by ${clock(d.cut)}` : ''}${a.ka ? `, ${n0(a.ka)} of them from moving` : ''}: ${equivOf(a.kt)}.`);
    else if (a.ka) out.push(`You burnt ${n0(a.ka)} kcal from moving: ${equivOf(a.ka)}.`);
    if (d && d.eaten > 0 && d.burnt > 0) { const df = Math.round(d.eaten - d.burnt); out.push(Math.abs(df) < 100 ? `You ate ${n0(d.eaten)} kcal: about what you burnt.` : `You ate ${n0(d.eaten)} kcal: ${n0(Math.abs(df))} ${df > 0 ? 'more' : 'less'} than you burnt.`); }
    const hr = [a.rest ? `your heart rested at ${a.rest} beats a minute` : '', a.sleep ? `you slept ${fmtMin(a.sleep)}` : ''].filter(Boolean);
    if (hr.length) out.push(hr.join(' and ').replace(/^./, c => c.toUpperCase()) + '.');
    return out;
  }
  function stepBar(n) {
    const max = 15000, w = Math.min(100, n / max * 100), marks = [5000, 7500, 10000, 12500];
    return `<div class="kc-steps"><div class="kc-sbar"><i style="width:${w.toFixed(1)}%"></i>${marks.map(m => `<em style="left:${(m / max * 100).toFixed(1)}%"></em>`).join('')}</div><div class="kc-slab xs muted"><span style="left:0">0</span><span style="left:33.3%">5k</span><span style="left:66.7%">10k</span><span style="left:100%">15k</span></div></div>`;
  }
  function actPicture(a, d) {
    // 1.24: numbers taken during the day say up to when, and the Eaten / Burnt bars use the day's Burnt, the same number as
    // everywhere else (the watch's so far, the rest of the day at the usual pace, and what came after)
    const part = d && d.cut != null && d.act === a, bt = d && d.burnt > 0 ? d.burnt : a.kt;
    const big = [a.steps ? bigNum(n0(a.steps), 'steps') : '', a.kt ? bigNum(n0(a.kt), part ? `kcal by ${clock(d.cut)}` : 'kcal burnt') : a.ka ? bigNum(n0(a.ka), 'kcal active') : '', a.rest ? bigNum(a.rest, '♥ resting') : a.sleep ? bigNum(fmtMin(a.sleep), 'sleep') : ''].filter(Boolean).join('');
    const vs = d && d.eaten > 0 && a.kt ? (() => { const m = Math.max(d.eaten, bt); return `<div class="kc-vs"><div class="row xs"><span class="grow">Eaten</span><b>${n0(d.eaten)}</b></div><div class="kc-vbar e"><i style="width:${(d.eaten / m * 100).toFixed(1)}%"></i></div><div class="row xs mt4"><span class="grow">Burnt</span><b>${n0(bt)}</b></div><div class="kc-vbar b"><i style="width:${(bt / m * 100).toFixed(1)}%"></i></div></div>`; })() : '';
    return `<div class="kc-pic">${big ? `<div class="kc-nums">${big}</div>` : ''}${a.steps ? stepBar(a.steps) : ''}${vs}${a.zones && a.zones.length ? zonesHtml({ zones: a.zones }, true) : ''}</div>
      <div class="kc-words">${dayWords(a, d).map(t => `<p>${esc(t)}</p>`).join('')}</div>`;
  }
  function actCard(d) {
    const a = d.act, HA = window.HealthAuto, note = HA && HA.dayNote ? HA.dayNote(a, d.t0) : '';       // 1.24: automatic from the watch
    if (!a && !wOn()) return '';
    if (!a) return `<div class="card" id="acCard"><div class="row"><div class="grow"><div class="k2">Your day, from your watch</div><div class="xs muted">Screenshots of your watch app's summary for the day: steps, calories, heart rate, sleep</div></div></div>
      ${note}<button class="btn block mt8" data-act="acShots">📷 Add screenshots of ${isToday() ? 'today' : 'that day'}</button><button class="btn block ghost mt8" data-act="acType">✎ Type the day's calories instead</button></div>`;
    return `<div class="card tap" id="acCard" data-act="acView"><div class="row"><div class="grow"><div class="k2">Your day, from your watch</div>${note}</div><span class="xs accent">More ›</span></div>${actPicture(a, d)}</div>`;
  }
  // ---------------------------------------------------------------- reading a day's screenshots
  let ac = null;              // { t0, pics, busy, err, res, view }
  const actRec = (day, n, key) => {
    const z = (day.zones || []).map(x => ({ n: String(x.name || '').slice(0, 40), m: num(x.min), lo: Math.round(num(x.low)), hi: Math.round(num(x.high)) })).filter(x => x.n);
    const o = { id: 'act-' + key.replace(/-/g, ''), d: key, kt: Math.round(num(day.kcal_total)), ka: Math.round(num(day.kcal_active)), steps: Math.round(num(day.steps)), km: Math.round(num(day.distance_km) * 100) / 100,
      amin: Math.round(num(day.active_min)), floors: Math.round(num(day.floors)), rest: Math.round(num(day.hr_rest)), avg: Math.round(num(day.hr_avg)), max: Math.round(num(day.hr_max)), min: Math.round(num(day.hr_min)),
      zones: z, sleep: Math.round(num(day.sleep_min)), sscore: Math.round(num(day.sleep_score)), hrv: Math.round(num(day.hrv_ms)), other: (day.other || []).map(x => ({ n: String(x.name || '').slice(0, 40), v: String(x.value || '').slice(0, 40) })).filter(x => x.n && x.v), app: String(day.app || '').slice(0, 40), n, at: Date.now() };
    for (const k of Object.keys(o)) if (o[k] === 0 || o[k] === '' || (Array.isArray(o[k]) && !o[k].length)) delete o[k];
    return o;
  };
  const dateText = key => { const [y, m, dd] = key.split('-').map(Number); const t = new Date(y, m - 1, dd).getTime(); return dayLabel(t); };
  function readDay(list, ctx) {
    if (window.__dayAi) return Promise.resolve(window.__dayAi(list, ctx));                        // tests
    const Cl = window.Cloud;
    if (!Cl || !Cl.configured || !Cl.dayShots) return Promise.reject({ message: 'Reading screenshots needs a GymDay account.' });
    if (!Cl.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have screenshots read for you.' });
    return Cl.dayShots(list.map(x => String(x).replace(/^data:image\/\w+;base64,/, '')), ctx).catch(e => {
      if (e && e.status === 404) throw { message: "Reading screenshots isn't switched on for this account's server yet." };
      throw { message: (e && e.message) || "The screenshots couldn't be read. Try again." };
    });
  }
  const longDate = t => new Date(t).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  function acSheet() {
    const o = ac; if (!o) return;
    const F = window.Food, n = (o.pics || []).length, key = keyDay(o.t0), rec = o.view ? actOf(o.t0) : o.res ? actRec(o.res.day, n, key) : null;
    const strip = n && F && F.photoStrip ? F.photoStrip(o.pics, { tall: true, max: 10, what: 'Screenshot', del: o.busy ? '' : 'acPicDel', add: o.busy ? '' : 'acMore', addText: 'Add a screenshot' }) : '';
    let body = '';
    if (o.busy) body = `<div class="kc-ai"><span class="kc-spin"></span> Reading ${n === 1 ? 'the screenshot' : `the ${n} screenshots together`}…<div class="xs dim mt4">Steps, calories, heart rate, sleep and anything else on them. They are sent to the AI service set up for your account, only to be read, and are not kept.</div></div>`;
    else if (o.err) body = `<p class="small mt8">${esc(o.err)}</p><div class="row mt12" style="gap:8px"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="acAgain">Try again</button></div>`;
    else if (o.workout) body = `<p class="small mt8">These look like one workout's summary, not a whole day. Open that workout (History) and add them on its Calories burnt card.</p><button class="btn block mt12" data-act="closeSheet">Close</button>`;
    else if (rec) {
      const d = dayOf(o.t0), dd = o.view ? d : Object.assign({}, d, { burnt: rec.kt || d.burnt }), other = o.res && o.res.day && o.res.day.date && o.res.day.date !== key ? o.res.day.date : '';
      const all = [rec.km ? ['Distance', `${rec.km} km`] : null, rec.amin ? ['Active time', fmtMin(rec.amin)] : null, rec.floors ? ['Floors', rec.floors] : null, rec.ka && rec.kt ? ['Active calories', `${n0(rec.ka)} kcal`] : null,
        rec.avg ? ['Heart rate, average', rec.avg] : null, rec.max ? ['Heart rate, highest', rec.max] : null, rec.min ? ['Heart rate, lowest', rec.min] : null, rec.sleep ? ['Sleep', fmtMin(rec.sleep)] : null].filter(Boolean)
        .concat((rec.other || []).map(x => [x.n, x.v])).map(([k, v]) => `<div class="kc-read-r"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('');
      body = actPicture(rec, dd) + (all || (rec.zones || []).length ? `<details class="kc-more-d mt12"><summary>All the numbers</summary>${all ? `<div class="kc-read mt8">${all}</div>` : ''}${(rec.zones || []).length ? zonesHtml({ zones: rec.zones }) : ''}</details>` : '')
        + (o.res && o.res.note ? `<p class="xs dim mt8">What the AI saw: ${esc(String(o.res.note).slice(0, 200))}</p>` : '')
        + (rec.kt || rec.ka ? `<p class="xs muted mt8">Saved, the Food tab counts ${rec.kt ? "your watch's total" : 'your resting burn plus these active calories'} as Burnt for ${esc(dateText(key).toLowerCase())}${!o.view && o.t0 === dayStart(Date.now()) ? ', up to now: the rest of the day and whatever you do after it count on top (you can change the time later)' : ''}.</p>` : '')
        + (o.view && (rec.kt || rec.ka) ? (window.HealthAuto && window.HealthAuto.mine(rec) ? window.HealthAuto.uptoNote(rec, o.t0) : uptoHtml(rec, o.t0)) : o.view && window.HealthAuto && window.HealthAuto.mine(rec) ? window.HealthAuto.uptoNote(rec, o.t0) : '')
        + (other ? `<div class="kc-wl warn mt8"><b>These say ${esc(dateText(other))}</b><span class="small">You are on ${esc(dateText(key))}. <span class="accent" data-act="acOtherDay" data-d="${esc(other)}">Save them to ${esc(dateText(other).toLowerCase())} instead</span></span></div>` : '')
        + (o.view ? `<div class="row mt16" style="gap:8px"><button class="btn danger" data-act="acDel">Remove</button><button class="btn grow" data-act="${rec.typed ? 'acType' : 'acNew'}">${rec.typed ? 'Change' : 'New screenshots'}</button><button class="btn primary grow" data-act="closeSheet">Done</button></div>`
          : `<div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="acSave">Save to ${esc(dateText(key).toLowerCase())}</button></div>`);
    }
    A.openSheet(`<h2>${o.view ? 'Your day, from your watch' : 'Your day: screenshots'}</h2><div class="xs muted mb8">${esc(dateText(key))}${rec && rec.app ? ' · ' + esc(rec.app) : ''}${rec && rec.typed ? ' · typed by you' : ''}</div>${strip}${body}`, null, () => { if (ac === o) ac = null; });
    ac = o;
  }
  async function acRead(o) {
    const t = new Date();
    Object.assign(o, { busy: true, err: '', res: null, view: false, workout: false }); acSheet();
    let r;
    try { r = await readDay(o.pics.map(x => x.big), `Today is ${longDate(t.getTime())}; the day being logged is ${longDate(o.t0)}`); }
    catch (e) { if (ac !== o) return; o.busy = false; o.err = (e && e.message) || "The screenshots couldn't be read. Try again."; acSheet(); return; }
    if (ac !== o) return;
    o.busy = false;
    if (r && r.shows === 'workout') o.workout = true; else if (r && r.day) o.res = r; else o.err = "No activity numbers could be read in those screenshots. Try your watch app's summary for the day.";
    acSheet();
  }
  ACT.acShots = async () => {
    const F = window.Food; if (!F || !F.pickPhotos) return;
    const pics = await F.pickPhotos({ max: 10, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!pics.length) return;      // 1.35.2 (60): up to 10, was 4
    acRead(ac = { t0: cur, pics });
  };
  ACT.acMore = async () => { const o = ac; if (!o || o.busy || o.view || o.pics.length >= 10) return; const got = await window.Food.pickPhotos({ max: 10 - o.pics.length, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!got.length || ac !== o) return; o.pics = o.pics.concat(got).slice(0, 10); acRead(o); };
  ACT.acPicDel = el => { const o = ac; if (!o || o.busy || !o.pics || o.pics.length < 2) return; o.pics.splice(+el.dataset.i, 1); acRead(o); };
  ACT.acAgain = () => { if (ac && !ac.busy && ac.pics && ac.pics.length) acRead(ac); };
  ACT.acView = () => { if (!actOf(cur)) return; ac = { t0: cur, pics: [], view: true }; acSheet(); };
  // v1.21.8: the time the watch's numbers were taken (the time they were added, or one the person sets), or the whole day
  const hm = t => { const d = new Date(t); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  function uptoHtml(rec, t0) {
    const t1 = nextDay(t0), c = cutOf(rec, t0, t1), during = (rec.upto || rec.at) >= t0 && (rec.upto || rec.at) < t1;
    if (!during && !rec.whole) return '';
    return `<div class="kc-upto mt12"><div class="row" style="gap:10px;align-items:center"><label class="small grow" for="acUpto" style="font-weight:600">These numbers are up to</label><input class="input" id="acUpto" type="time" value="${c != null ? hm(c) : ''}" style="width:auto;max-width:9rem"></div>
      <div class="chips mt4"><button class="chip ${rec.whole ? 'on' : ''}" data-act="acWhole" aria-pressed="${rec.whole ? 'true' : 'false'}">They're for the whole day</button></div>
      <p class="xs dim mt4">${rec.whole ? 'Counted as the whole day: your workouts and activities are taken as being in them.' : `What came after ${c != null ? clock(c) : 'that time'} is added on top: the rest of the day at your usual pace, and workouts and activities after it. Took the screenshots earlier? Set the time they show.`}</p></div>`;
  }
  ACT.acWhole = () => { const o = ac, rec = o && actOf(o.t0); if (!rec) return; if (rec.whole) delete rec.whole; else rec.whole = 1; S.save(true); acSheet(); A.rerender(); };
  ACT.acNew = () => { A.closeSheet(); ac = null; ACT.acShots(); };
  function acStore(o, key) {
    const rec = actRec(o.res.day, o.pics.length, key), i = (D.acts = D.acts || []).findIndex(x => x.d === key), was = i >= 0 ? D.acts[i] : null;
    if (i >= 0) D.acts[i] = rec; else D.acts.push(rec);
    S.save(true); ac = null; A.closeSheet(); A.rerender();
    undoToast(`Saved to ${dateText(key).toLowerCase()}`, () => { const j = D.acts.findIndex(x => x.d === key); if (j >= 0) { if (was) D.acts[j] = was; else D.acts.splice(j, 1); } S.save(true); A.rerender(); });
  }
  ACT.acSave = () => { const o = ac; if (o && o.res && o.res.day) acStore(o, keyDay(o.t0)); };
  ACT.acOtherDay = el => { const o = ac, k = el.dataset.d; if (!o || !o.res || !/^\d{4}-\d\d-\d\d$/.test(k)) return; const [y, m, dd] = k.split('-').map(Number); cur = new Date(y, m - 1, dd).getTime(); acStore(o, k); };
  // v1.17: the day's calories typed from the watch or its app, instead of screenshots
  ACT.acType = () => {
    const a = actOf(cur) || {}, f = (id, label, v, ph) => `<div class="field"><label class="lbl" for="${id}">${label}</label><input class="input" id="${id}" type="number" inputmode="numeric" min="0" value="${v || ''}" placeholder="${ph}"></div>`;
    A.openSheet(`<h2>Your day's calories</h2><div class="xs muted mb8">${esc(dateText(keyDay(cur)))}</div>
      <p class="small muted">Type what your watch or its app shows for the whole day. The total (with what your body burns at rest) is best; only active calories work too.</p>
      ${f('acKt', 'Calories burnt, total (kcal)', a.kt, 'For example 2,400')}${f('acKa', 'or only active calories (kcal)', a.kt ? '' : a.ka, 'For example 600')}${f('acSt', 'Steps (if you like)', a.steps, '')}
      <p class="xs dim">Saved, Burnt for the day is this total (your workouts are in it), or your resting burn plus the active calories. Activities you add for the day ask whether your watch was on, so nothing is counted twice.</p>
      <div class="row mt12"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="acTypeSave">Save</button></div>`);
  };
  ACT.acTypeSave = () => {
    const v = id => Math.round(num(($('#' + id) || {}).value)), kt = v('acKt'), ka = v('acKa'), steps = v('acSt'), key = keyDay(cur);
    if (!(kt > 0) && !(ka > 0)) { toast("Type the day's total or its active calories"); return; }
    if (kt > 9000 || ka > 7000 || (kt > 0 && kt < 800)) { toast("That calorie number doesn't look like a whole day's"); return; }
    if (!(kt > 0) && rest(cur) == null) { toast('Active calories need your height and age (About me), or type the total'); return; }
    const old = actOf(cur), rec = Object.assign({}, old || {}, { id: 'act-' + key.replace(/-/g, ''), d: key, typed: 1, at: Date.now() });
    delete rec.upto; delete rec.whole;                                     // v1.21.8: new numbers, taken now
    delete rec.kt; delete rec.ka; if (kt > 0) rec.kt = kt; else rec.ka = ka; if (steps > 0) rec.steps = steps;
    const i = (D.acts = D.acts || []).findIndex(x => x.d === key), was = i >= 0 ? D.acts[i] : null;
    if (i >= 0) D.acts[i] = rec; else D.acts.push(rec);
    S.save(true); A.closeSheet(); A.rerender();
    undoToast(`Saved to ${dateText(key).toLowerCase()}`, () => { const j = D.acts.findIndex(x => x.d === key); if (j >= 0) { if (was) D.acts[j] = was; else D.acts.splice(j, 1); } S.save(true); A.rerender(); });
  };
  ACT.acDel = () => {
    const i = (D.acts || []).findIndex(x => x.d === keyDay(cur)); if (i < 0) return;
    const was = D.acts.splice(i, 1)[0]; S.save(true); ac = null; A.closeSheet(); A.rerender();
    undoToast('Removed', () => { D.acts.push(was); S.save(true); A.rerender(); });
  };

  // =====================================================================================================
  // About me, Settings, the card on the Days screen
  // =====================================================================================================
  ACT.kcMe = () => {
    const m = me(), w = weightKg(Date.now()), sex = m.sex || '';
    A.openSheet(`<h2>About me</h2><p class="muted small">Used only to estimate your everyday burn (ICMR-NIN 2020, for ages 10 to 100). It stays with your own data.</p>
      <div class="row mt12" style="gap:10px"><div class="grow"><label class="lbl">Height (cm)</label><input class="input" id="kcH" type="number" inputmode="decimal" value="${m.h > 0 ? m.h : ''}" placeholder="e.g. 172"></div>
      <div class="grow"><label class="lbl">Age</label><input class="input" id="kcA" type="number" inputmode="numeric" value="${ageNow() || ''}" placeholder="years"></div></div>
      <label class="lbl mt12">Body</label><div class="row" style="gap:8px"><button class="chip ${sex === 'm' ? 'on' : ''}" data-act="kcSex" data-v="m">Male</button><button class="chip ${sex === 'f' ? 'on' : ''}" data-act="kcSex" data-v="f">Female</button><button class="chip ${!sex ? 'on' : ''}" data-act="kcSex" data-v="">Rather not say</button></div>
      <label class="lbl mt12">Outside the gym I am</label><div class="row kc-acts" style="gap:8px;flex-wrap:wrap">${ACTS.map((a, i) => `<button class="chip ${String(actK()) === a[0] ? 'on' : ''}" data-act="kcAct" data-v="${a[0]}">${a[1]}<span class="sub">${ACT_SUB[i]}</span></button>`).join('')}</div>
      <p class="xs dim">Your workouts and activities are added on top, so leave them out here.</p>
      <div class="field mt12"><label class="lbl">Daily calorie goal · optional</label><input class="input" id="kcG" type="number" inputmode="numeric" value="${st().kcGoal > 0 ? st().kcGoal : ''}" placeholder="leave empty for none"></div>
      <p class="xs dim">${w ? `Body weight: ${A.fmtW(Math.round(w * 10) / 10)} kg, from your last entry.` : 'Log your body weight too (History → Body weight); until then 70 kg is assumed.'}</p>
      ${ACT.rvPrefs ? `<button class="btn block mt12 kc-me-eat" data-act="rvPrefs">What I eat, oil and salt in my cooking ›</button>` : ''}
      <div class="row mt12" style="padding:6px 0"><div class="grow">Count everyday burn<div class="xs dim">Off = Burnt shows workouts only</div></div><input type="checkbox" id="kcAll" ${mode() === 'all' ? 'checked' : ''} style="width:22px;height:22px"></div>
      <div class="row mt12"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="kcMeSave">Save</button></div>`,
      s => { s.dataset.sex = sex; s.dataset.act2 = String(actK()); });
  };
  const chipPick = (el, key) => { const s = $('#sheet'); s.dataset[key] = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcSex = el => chipPick(el, 'sex'); ACT.kcAct = el => chipPick(el, 'act2');
  ACT.kcMeSave = () => {
    const s = $('#sheet'), h = num(($('#kcH') || {}).value), a = Math.round(num(($('#kcA') || {}).value)), g = Math.round(num(($('#kcG') || {}).value));
    if (h && (h < 90 || h > 250)) { toast('Height is in centimetres, e.g. 172'); return; }
    if (a && (a < 10 || a > 100)) { toast("That age doesn't look right"); return; }
    if (g && (g < 500 || g > 10000)) { toast('A daily goal is usually between 500 and 10,000'); return; }
    const all = ($('#kcAll') || {}).checked;
    if (all && !(h && a)) { toast('Everyday burn needs your height and age'); return; }
    st().me = { h: h || 0, age: a || 0, ageAt: Date.now(), sex: s.dataset.sex || '' };
    st().kcAct = s.dataset.act2 || '1.2'; st().kcGoal = g || 0; st().kcMode = all ? 'all' : 'workouts';
    S.save(true); A.closeSheet(); toast('Saved'); redraw();
  };
  // v1.13: a workout's screenshots are easy to add later: a card on Days for 12 hours after a workout with no calories yet,
  // and a 📷 on such workouts in History
  const noBurn = s => !!s && !(s.man && s.man.kcal > 0) && !(s.shot && s.shot.kcal > 0) && !(s.hc && !s.hc.none && s.hc.kcal > 0);
  function shotAskCard() {
    if (!on() || D.active || !wOn()) return '';
    const s = D.sessions.reduce((a, x) => (!a || (x.end || x.start) > (a.end || a.start) ? x : a), null), skip = S.meta.shotSkip || {};
    if (!s || Date.now() - (s.end || s.start) > 12 * 3600000 || !noBurn(s) || skip[s.id]) return '';
    return `<div class="card" id="kcShotAsk"><div class="k2">📷 Add your watch's screenshots?</div><div class="small mt4">${esc(s.dayName || 'Your workout')}, ${clock(s.start)}, has no calories from your watch yet. Screenshots of its summary give the calories, heart rate and how hard it was.</div>
      <div class="row mt12" style="gap:8px"><button class="btn sm ghost" data-act="kcShotSkip" data-id="${esc(s.id)}">Not now</button><button class="btn sm primary grow" data-act="kcWkShots" data-id="${esc(s.id)}">📷 Add screenshots</button></div></div>`;
  }
  ACT.kcShotSkip = el => { S.meta.shotSkip = { [el.dataset.id]: 1 }; S.saveMeta(); A.rerender(); };
  // 1.35.2: only on the last 3 days' workouts (an old workout's screenshots are rarely added; a 📷 on every row was noise)
  const shotBtn = s => (on() && wOn() && noBurn(s) && (window.__calm === false || Date.now() - (s.start || 0) < 3 * DAY) ? `<button class="btn sm ghost hist-shot" data-act="kcWkShots" data-id="${esc(s.id)}" aria-label="Add screenshots from your watch">📷</button>` : '');
  function homeCard() {
    if (!on() || window.Today) return '';          // v1.22: the Today page's rings show the day's food and burn (today.js, the same #kcCard)
    const d = dayOf(dayStart(Date.now()));
    return `<div class="card tap" id="kcCard" data-act="openCalories"><div class="row"><div class="grow" style="min-width:0"><div class="k2">Calories today</div>
      <div class="small"><b>${n0(d.eaten)}</b> eaten${goalKcal() ? ` of ${n0(goalKcal())}` : ''} · <b>${n0(d.burnt)}</b> burnt${d.food.length ? ` · <b>${diffText(d.diff)}</b>` : ''}</div>${d.protein ? `<div class="xs muted">${Math.round(d.protein)} g protein</div>` : ''}</div><button class="btn sm" data-act="kcAddHome">+ Food</button></div></div>`;
  }
  if (I) {
    const home0 = I.homeCards; I.homeCards = () => shotAskCard() + home0() + homeCard();
    const det0 = I.detailExtra; I.detailExtra = s => burnCard(s) + det0(s);
    const sum0 = I.summaryExtra; I.summaryExtra = s => sum0(s) + burnCard(s);
    // how hard it felt changes the estimate, so the card follows the answer
    const feel0 = ACT.feelSet; if (feel0) ACT.feelSet = (el, e) => { feel0(el, e); const c = $('#kcBurn'), x = D.sessions.find(y => y.id === el.dataset.id); if (c && x) c.outerHTML = burnCard(x); };
  }
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => `<div class="row" style="padding:6px 0"><div class="grow">Calories<div class="xs dim">Food log, calories burnt and the chart; the rings on the Today page</div></div><input type="checkbox" data-bind="optKcal" ${on() ? 'checked' : ''} style="width:22px;height:22px"></div>`
    + (on() ? `<div class="row" style="padding:6px 0"><div class="grow">Calories burnt counts<div class="xs dim">${mode() === 'all' && rest() == null ? 'Everyday burn needs your height and age: tap About me' : 'Everyday burn: ICMR-NIN 2020, from your weight, age and activity'}</div></div>${window.SetKit ? window.SetKit.seg('kcMode', mode() === 'all' ? 'all' : 'workouts', [['workouts', 'Workouts only'], ['all', '+ Everyday burn', 'Workouts and everyday burn']], 'Calories burnt counts', { wide: true }) : `<select class="input" data-bind="kcMode"><option value="workouts" ${mode() === 'workouts' ? 'selected' : ''}>Workouts only</option><option value="all" ${mode() === 'all' ? 'selected' : ''}>Workouts + everyday burn</option></select>`}</div>
      <div class="row set-wrap" style="padding:6px 0"><div class="grow">Activities you add<div class="xs dim">${st().actShow === 'goal' ? 'Each one of 20 minutes or more counts as a workout toward your weekly goal' : "Sports, walks, swims… added on the Food tab's Burnt card"}</div></div><select class="input" data-bind="actShow">${[['cal', 'On the Food tab only'], ['hist', 'Also in History'], ['goal', 'History + weekly goal']].map(([v, l]) => `<option value="${v}" ${(st().actShow || 'cal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>
      <div class="row" style="padding:6px 0"><div class="grow">About me and my goal<div class="xs dim">${me().h > 0 && ageNow() ? `${me().h} cm, ${ageNow()} years${st().kcGoal > 0 ? `, goal ${n0(st().kcGoal)} kcal` : ''}` : 'Height, age and an optional daily goal'}</div></div><button class="btn sm" data-act="kcMe">Open</button></div>` : ''));
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset && t.dataset.bind;
    if (b === 'optKcal') { st().kcal = t.checked; S.save(); A.rerender(); }
    else if (b === 'kcMode') { st().kcMode = t.value === 'all' ? 'all' : 'workouts'; S.save(); A.rerender(); if (st().kcMode === 'all' && rest() == null) ACT.kcMe(); }
    else if (b === 'actShow') { st().actShow = ['hist', 'goal'].includes(t.value) ? t.value : 'cal'; S.save(); A.rerender(); }
    else if (t && t.id === 'acUpto' && ac && ac.view) {                    // v1.21.8: the time the watch's numbers were taken
      const rec = actOf(ac.t0), m = /^(\d\d):(\d\d)$/.exec(t.value || ''); if (!rec || !m) return;
      const v = ac.t0 + (+m[1]) * 3600000 + (+m[2]) * 60000; if (!(v >= ac.t0 && v < nextDay(ac.t0))) return;
      rec.upto = v; delete rec.whole; S.save(true); acSheet(); A.rerender();
    }
  });

  window.Calories = { rollDay, linesSheet, FOODS, burnOf, shotBtn, dayOf, dayLabel, everyday, rest, weightKg, addFood, homeCard, burnCard, on, ageNow, prevDay,
    day: () => cur, toToday: () => { cur = dayStart(Date.now()); }, stampFor,
    // v1.29 (cook.js): the photo being looked at, kept while another sheet is up, its sheet and its lines
    shot: () => shot, keep: m => { shot = m; }, shotSheet: () => { if (shot) shotSheet(); }, snap,
    rows: () => { const r = $('#kcRows'); if (r && shot) r.innerHTML = shotRows(); const t = $('#kcSum'); if (t && shot) t.textContent = n0(shotSum()); },
    actBurn, addOf, cutOf, actOf, everydayParts, ACTS, ACT_SUB, actLevel, bmrOf, needOf, readWorkout, shotOf, wkNumbers, fmtMin, restPerMin, everyPerMin, mode, redraw, setDay: t0 => { cur = dayStart(t0); } };
})();
