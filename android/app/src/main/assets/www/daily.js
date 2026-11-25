/* GymDay 1.31 · daily insights (daily.js).
   Two screens and a card. Everything is read from what the other modules already work out (Calories.dayOf, Food.targets,
   Progress.nightOf / sleepNeed, Ready.readiness, Insights.sessionSets and the Store), so every number is the one that Today,
   Food, Recovery and History show.
   · Insights (VIEWS.insights): the last 7 or 30 days as charts lined up by day, one lane for each thing GymDay tracks: sleep,
     training, eaten, protein, steps, burnt, readiness, resting heart rate, HRV and body weight. A lane with nothing in those
     days is left out. Swipe the day card under the day bar (1.35), slide a finger across the charts, tap a day, or use ‹ ›:
     the card and every lane then show that day, and "Open day" (or a tap on the card) goes to its page.
   · A day (VIEWS.dayx): the day in a few plain sentences, rings for the targets, then a card for each part that has something:
     each workout, sleep, food, movement, readiness, body weight. Swipe left or right (or ‹ ›) for the day before or after.
   · Today: the card "Last 7 days" (the first three lanes that have something); a tap on a day opens it.
   History's week strip and calendar open a day's page too (app.js). Nothing is stored except the range last picked
   (meta.diN, this phone only). */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !A.VIEWS) return;
  const { $, $$, esc, ACT, VIEWS } = A, D = S.data, M = S.meta;
  const st = () => D.settings;
  const num = A.num || (v => +v || 0);
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const plus = (t0, n) => { const d = new Date(t0); return new Date(d.getFullYear(), d.getMonth(), d.getDate() + n).getTime(); };
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WDL = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const calm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const clk = m => { m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), r = m % 60; return `${h % 12 || 12}:${String(r).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`; };
  const pct = (a, b) => (b > 0 ? Math.round(a / b * 100) : 0);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const dayLong = t0 => { const d = new Date(t0); return `${WDL[d.getDay()]} ${d.getDate()} ${A.MONTHS_LONG[d.getMonth()]}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
  const agoText = t0 => { const n = Math.round((day0(Date.now()) - t0) / 86400000); return n < 14 ? `${n} days ago` : n < 70 ? `${Math.round(n / 7)} weeks ago` : `${Math.round(n / 30.4)} months ago`; };
  const recOn = () => st().recovery !== false;
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const foodOn = () => { const C = window.Calories; return !!(C && C.on && C.on()); };
  const ageNow = () => { const C = window.Calories; return C && C.ageNow ? C.ageNow() : 0; };
  const needH = () => { const P = window.Progress; return P && P.sleepNeed ? P.sleepNeed(ageNow()) : 7; };
  // your usual: the middle value of the 14 days before (at least 3 of them), the way Recovery works out a usual heart rate
  function usual(get, t0) {
    const v = []; for (let i = 1; i <= 14; i++) { const x = get(plus(t0, -i)); if (x > 0) v.push(x); }
    if (v.length < 3) return 0; v.sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  const stepsOn = t0 => { const C = window.Calories, a = C && C.actOf ? C.actOf(t0) : null; return (a && a.steps) || 0; };

  // =====================================================================================================
  // One day's facts
  // =====================================================================================================
  // one workout: the same counting as History (every ticked set; weight lifted leaves timed exercises out)
  function wFacts(s, lite) {
    const C = window.Calories, I = window.Insights;
    let sets = 0, vol = 0; const rows = [];
    for (const it of (s.items || [])) {
      if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
      const done = (it.sets || []).filter(x => x.done); if (!done.length) continue;
      const timed = ex.track === 'time';
      sets += done.length; if (!timed) vol += done.reduce((a, x) => a + num(x.w) * num(x.r), 0);
      if (!lite) rows.push({ ex, n: done.length, text: A.setsSummary(done, ex), d: deltaOf(ex, done, s) });
    }
    const mins = S.gymMs(s) / 60000, b = C && C.burnOf ? C.burnOf(s) : null, o = { s, sets, vol, mins, kcal: b ? Math.round(b.kcal) : 0, rows, prs: (s.prs || []).length };
    if (lite) return o;
    const bp = I && I.sessionSets ? I.sessionSets(s) : {};
    o.parts = Object.keys(bp).filter(g => bp[g] > 0).sort((a, b2) => bp[b2] - bp[a]).map(g => ({ g, n: bp[g] }));
    // the same day the time before, as the "Workout saved" sheet compares
    const prev = D.sessions.filter(x => x.dayId === s.dayId && x.id !== s.id && x.start < s.start).sort((a, b2) => b2.start - a.start)[0] || null;
    if (prev) { const p = wFacts(prev, true); o.prev = { t: prev.start, vol: p.vol, sets: p.sets, mins: p.mins }; }
    o.hr = (s.hc && s.hc.avg) || (s.shot && s.shot.avg) || 0;
    return o;
  }
  // an exercise against the time before (the last workout before this one that had it and whose numbers were kept):
  // the heaviest set; for body-weight moves with no added weight the reps; for timed ones the minutes
  function deltaOf(ex, done, s) {
    const before = S.sessionsFor(ex.id).find(r => r.session.start < s.start && r.session.keep !== false && r.session.id !== s.id);
    if (!before) return null;
    const top = l => l.reduce((m, x) => Math.max(m, num(x.w)), 0), reps = l => l.reduce((a, x) => a + num(x.r), 0), tot = l => l.reduce((a, x) => a + num(x.w), 0);
    const mine = done.filter(S.work), was = before.all.filter(S.work);
    if (!mine.length || !was.length) return null;
    let d, unit;
    if (ex.track === 'time') { d = tot(mine) - tot(was); unit = 'min'; }
    else if (top(mine) > 0 || top(was) > 0) { d = top(mine) - top(was); unit = A.unit(); }
    else { d = reps(mine) - reps(was); unit = Math.abs(d) === 1 ? 'rep' : 'reps'; }
    d = Math.round(d * 100) / 100;
    return { d, unit, t: before.session.start };
  }
  // the first day anything was logged (so ‹ stops there)
  let firstMemo = null;
  function firstDay() {
    if (firstMemo && firstMemo.n === D.sessions.length + (D.food || []).length + (D.body || []).length + (D.checks || []).length + (D.acts || []).length + (D.sports || []).length) return firstMemo.t;
    let t = day0(Date.now());
    const take = v => { if (v > 0 && v < t) t = v; };
    D.sessions.forEach(s => take(s.start)); (D.food || []).forEach(f => take(f.t)); (D.body || []).forEach(b => take(b.t)); (D.sports || []).forEach(x => take(x.t));
    const ofKey = k => { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(k || ''); return m ? new Date(+m[1], +m[2] - 1, +m[3]).getTime() : 0; };
    (D.checks || []).forEach(c => take(ofKey(c.d))); (D.acts || []).forEach(a => take(ofKey(a.d)));
    firstMemo = { t: day0(t), n: D.sessions.length + (D.food || []).length + (D.body || []).length + (D.checks || []).length + (D.acts || []).length + (D.sports || []).length };
    return firstMemo.t;
  }

  /** Everything GymDay knows about the day that starts at t0. `lite` leaves out what only the day's own page shows. */
  function facts(t0, lite) {
    const C = window.Calories, P = window.Progress, F = window.Food, R = window.Ready, now = Date.now(), today = day0(now);
    const o = { t0, isToday: t0 === today, future: t0 > today, ws: [], sp: [] };
    const d = C && C.dayOf ? C.dayOf(t0) : null, t1 = plus(t0, 1);
    // the night that ended this morning, and the night's heart
    if (P && P.nightOf && recOn()) {
      const n = P.nightOf(t0);
      if (n.sl && n.sl.min > 0) o.sleep = Object.assign({ need: needH() }, n.sl);
      if (n.rest || n.hrv || n.spo2 || n.br) o.heart = { rest: n.rest || 0, hrv: n.hrv || 0, spo2: n.spo2 || 0, br: n.br || 0, uRest: !lite && P.usualOf ? P.usualOf('rest', t0) : 0, uHrv: !lite && P.usualOf ? P.usualOf('hrv', t0) : 0 };
    }
    // workouts and activities
    o.ws = D.sessions.filter(s => s.start >= t0 && s.start < t1).sort((a, b) => a.start - b.start).map(s => wFacts(s, lite));
    const SP = window.Sports;
    o.sp = (D.sports || []).filter(x => x.t >= t0 && x.t < t1).sort((a, b) => a.t - b.t).map(x => { const b = C && C.actBurn ? C.actBurn(x) : null; return { x, name: SP && SP.nameOf ? SP.nameOf(x) : 'Activity', mins: b ? b.mins : num(x.mins), kcal: b ? Math.round(b.kcal) : 0 }; });
    o.trainMin = o.ws.reduce((a, w) => a + w.mins, 0) + o.sp.reduce((a, y) => a + y.mins, 0);
    // food
    if (d && foodOn() && d.food.length) {
      const tg = F && F.targets ? F.targets(t0) : null;
      o.food = { eaten: d.eaten, protein: d.protein, carbs: d.carbs, fat: d.fat, fibre: d.fibre, n: d.food.length, target: tg && tg.kcal > 0 ? tg.kcal : 0, pT: tg && tg.p > 0 ? tg.p : 0, cT: tg && tg.c > 0 ? tg.c : 0, fT: tg && tg.f > 0 ? tg.f : 0 };
      if (!lite && F && F.MEALS && F.mealOf) {
        const by = {}; d.food.forEach(f => { const k = F.mealOf(f); by[k] = (by[k] || 0) + (f.kcal || 0); });
        o.food.meals = F.MEALS.map(m => ({ k: m[0], name: m[1], kcal: by[m[0]] || 0 })).filter(m => m.kcal > 0);
      }
    }
    // movement: steps, and what was burnt when there is more to it than the everyday estimate
    const act = d ? d.act : (C && C.actOf ? C.actOf(t0) : null), steps = (act && act.steps) || 0;
    const moved = !!(d && foodOn() && (d.watch || d.ws.length || d.sp.length));
    if (steps || moved) {
      o.move = { steps, burnt: d && foodOn() ? d.burnt : 0, watch: d ? d.watch : '', base: d ? d.base : null, avg: (act && act.avg) || 0, max: (act && act.max) || 0, min: (act && act.min) || 0, app: (act && act.app) || '' };
      if (d && d.base != null && !d.watch) { o.move.wAdd = d.ws.reduce((a, x) => a + (x.add || 0), 0); o.move.sAdd = d.sp.reduce((a, y) => a + (y.add || 0), 0); }
      if (!lite && steps) o.move.uSteps = usual(stepsOn, t0);
    }
    if (d && foodOn()) o.burnt = d.burnt;
    // readiness: today's is Today's own number; an earlier day's is that morning's (9 am, or just before its first workout).
    // Worked out only when asked for (it is the costly part, and Today's card rarely shows it)
    if (R && R.readiness && recOn() && !o.future) {
      let r;
      Object.defineProperty(o, 'ready', { enumerable: true, configurable: true, get() {
        if (r === undefined) {
          if (o.isToday) r = R.readiness() || null;
          else { const w0 = o.ws[0] ? o.ws[0].s : null, at = Math.min(t0 + 9 * 3600000, w0 ? w0.start - 60000 : Infinity); r = R.readiness(Math.max(at, t0 + 60000), { day: w0 ? S.getDay(w0.dayId) || null : null }) || null;
            if (r && !r.parts.some(p => p.sc != null && p.k !== 'muscles')) r = null; }      // rested muscles alone say nothing about a day long past
        }
        return r || undefined;
      } });
    }
    // body weight: the day's last weigh-in, against the one before
    const ws = (D.body || []).filter(b => b.t >= t0 && b.t < t1).sort((a, b) => b.t - a.t);
    if (ws.length) { const prev = (D.body || []).filter(b => b.t < t0).sort((a, b) => b.t - a.t)[0] || null; o.weight = { kg: +ws[0].kg, prev: prev ? { kg: +prev.kg, t: prev.t } : null }; }
    o.any = !!(o.sleep || o.heart || o.ws.length || o.sp.length || o.food || o.move || o.weight);
    return o;
  }

  // =====================================================================================================
  // The day in words
  // =====================================================================================================
  const kgTxt = v => (Math.round(v * 10) / 10).toFixed(1).replace(/\.0$/, '');
  const volTxt = v => `${A.fmtBig(v)} ${A.unit()}`;
  function words(f) {
    const out = [], sofar = f.isToday ? ' so far' : '';
    for (const w of f.ws) {
      let t = `<b>${esc(w.s.dayName || 'Workout')}</b>: ${hm(w.mins)}, ${plural(w.sets, 'set')}${w.vol > 0 ? `, ${volTxt(w.vol)} lifted` : ''}`;
      if (w.prev && w.prev.vol > 0 && w.vol > 0) { const p = Math.round((w.vol - w.prev.vol) / w.prev.vol * 100); t += p === 0 ? ', the same as last time' : `, ${Math.abs(p)}% ${p > 0 ? 'more' : 'less'} than last time`; }
      if (w.prs) t += `. ${plural(w.prs, 'record')} 🏆`;
      out.push(['🏋', t + (w.prs ? '' : '.')]);
    }
    if (f.sp.length) out.push(['🏃', f.sp.map(y => `${esc(y.name)}, ${hm(y.mins)}`).join(' · ') + '.']);
    if (!f.ws.length && !f.sp.length && f.any) out.push(['🛋', f.isToday ? 'No workout yet today.' : 'No workout: a rest day.']);
    if (f.sleep) {
      const short = f.sleep.need * 60 - f.sleep.min;
      out.push(['😴', `Slept <b>${hm(f.sleep.min)}</b>${short > 15 ? `, ${hm(short)} less than the ${f.sleep.need} h you need` : `: enough (you need ${f.sleep.need} h)`}.`]);
    }
    if (f.food) {
      let t = `Ate <b>${n0(f.food.eaten)} kcal</b>${sofar}`;
      if (f.food.target) t += ` of your ${n0(f.food.target)}`;
      t += f.food.pT ? `, with ${n0(f.food.protein)} g of the ${n0(f.food.pT)} g of protein${f.food.protein >= f.food.pT ? ' ✓' : ''}` : `, with ${n0(f.food.protein)} g of protein`;
      out.push(['🍽', t + '.']);
    }
    if (f.move && f.move.steps) {
      const u = f.move.uSteps || 0, dlt = f.move.steps - u;
      out.push(['👟', `<b>${n0(f.move.steps)} steps</b>${sofar}${u ? (Math.abs(dlt) < u * 0.1 ? ', about your usual' : `, ${n0(Math.abs(dlt))} ${dlt > 0 ? 'more' : 'fewer'} than your usual ${n0(u)}`) : ''}.`]);
    }
    if (f.ready) out.push(['⚡', `Readiness${f.isToday ? '' : ' that morning'} <b>${f.ready.score}</b>: ${esc(f.ready.advice.toLowerCase())}.`]);
    if (f.weight) {
      const p = f.weight.prev, dl = p ? Math.round((f.weight.kg - p.kg) * 10) / 10 : 0;
      out.push(['⚖', `Weighed <b>${kgTxt(f.weight.kg)} kg</b>${p ? (dl === 0 ? `, the same as ${A.whenText(p.t)}` : `, ${kgTxt(Math.abs(dl))} kg ${dl > 0 ? 'more' : 'less'} than ${A.whenText(p.t)}`) : ''}.`]);
    }
    return out;
  }
  // one short line for a day (the Insights bar and the Today card's labels)
  function gist(f) {
    const b = [];
    if (f.ws.length) b.push(f.ws.map(w => w.s.dayName || 'Workout').join(' + ')); else if (f.sp.length) b.push(f.sp.map(y => y.name).join(' + '));
    if (f.sleep) b.push(`slept ${hm(f.sleep.min)}`);
    if (f.food) b.push(`${n0(f.food.eaten)} kcal`);
    if (f.move && f.move.steps) b.push(`${n0(f.move.steps)} steps`);
    return b.length ? b.join(' · ') : 'nothing logged';
  }

  // several days in words: only counts and averages of what was logged, nothing guessed
  function rangeStats(days) {
    const need = needH(), nights = days.filter(f => f.sleep), fd = days.filter(f => f.food), withP = fd.filter(f => f.food.pT), stp = days.filter(f => f.move && f.move.steps), wt = days.filter(f => f.weight);
    const avg = (l, get) => (l.length ? l.reduce((a, f) => a + get(f), 0) / l.length : 0);
    return { need, ws: days.reduce((a, f) => a + f.ws.length, 0), sp: days.reduce((a, f) => a + f.sp.length, 0), mins: days.reduce((a, f) => a + f.trainMin, 0),
      nights: nights.length, enough: nights.filter(f => need * 60 - f.sleep.min <= 15).length, sleep: avg(nights, f => f.sleep.min),
      fd: fd.length, kcal: avg(fd, f => f.food.eaten), withP: withP.length, hitP: withP.filter(f => f.food.protein >= f.food.pT).length,
      stp: stp.length, steps: avg(stp, f => f.move.steps), best: stp.length ? stp.reduce((a, f) => (f.move.steps > a.move.steps ? f : a)) : null, wt };
  }
  function rangeWords(days) {
    const r = rangeStats(days), out = [];
    if (r.ws || r.sp) out.push(['🏋', `<b>${[r.ws ? plural(r.ws, 'workout') : '', r.sp ? (r.sp === 1 ? '1 activity' : r.sp + ' activities') : ''].filter(Boolean).join(' and ')}</b>: ${hm(r.mins)} in all.`]);
    if (r.nights) out.push(['😴', `Slept <b>${hm(r.sleep)}</b> a night on average: ${r.enough === r.nights ? (r.nights === 1 ? 'enough' : `enough on all ${r.nights} nights`) : `${r.enough} of ${r.nights} night${r.nights === 1 ? '' : 's'} reached the ${r.need} h you need`}.`]);
    if (r.fd) out.push(['🍽', `Ate about <b>${n0(r.kcal)} kcal</b> a day on the ${plural(r.fd, 'day')} logged${r.withP ? `; protein target reached on ${r.hitP} of ${r.withP}` : ''}.`]);
    if (r.stp) out.push(['👟', `About <b>${n0(r.steps)} steps</b> a day${r.stp > 1 ? `; the most ${r.best.isToday ? 'today' : A.whenText(r.best.t0)}: ${n0(r.best.move.steps)}` : ''}.`]);
    if (r.wt.length > 1) { const a = r.wt[0], b = r.wt[r.wt.length - 1], dl = Math.round((b.weight.kg - a.weight.kg) * 10) / 10; out.push(['⚖', `Body weight <b>${kgTxt(b.weight.kg)} kg</b>, ${dl === 0 ? 'the same as' : `${kgTxt(Math.abs(dl))} kg ${dl > 0 ? 'more' : 'less'} than`} ${A.whenText(a.t0)}.`]); }
    return out;
  }
  function rangeLine(days) {
    const r = rangeStats(days);
    return [r.ws ? plural(r.ws, 'workout') : '', r.nights ? `sleep ${hm(r.sleep)} a night` : '', r.fd ? `${n0(r.kcal)} kcal a day` : '', !r.nights && !r.fd && r.stp ? `${n0(r.steps)} steps a day` : ''].filter(Boolean).join(' · ');
  }

  // =====================================================================================================
  // Lanes: one chart a thing, the days side by side
  // =====================================================================================================
  // k, name, bar | line, the day's value (null = nothing), how a value reads, the target line, extra words after the average
  const LANES = [
    { k: 'sleep', name: 'Sleep', kind: 'bar', get: f => (f.sleep ? f.sleep.min / 60 : null), fmt: v => hm(v * 60), goal: () => needH(), goalTxt: g => `need ${g} h`, low: (v, g) => (g - v) * 60 > 15 },
    { k: 'train', name: 'Training', kind: 'bar', get: f => (f.trainMin > 0 ? f.trainMin : null), fmt: v => hm(v), total: true },
    { k: 'eaten', name: 'Eaten', kind: 'bar', get: f => (f.food ? f.food.eaten : null), fmt: v => `${n0(v)} kcal`, goal: days => lastOf(days, f => f.food && f.food.target), goalTxt: g => `target ${n0(g)}`, soFar: true },
    { k: 'protein', name: 'Protein', kind: 'bar', get: f => (f.food ? f.food.protein : null), fmt: v => `${n0(v)} g`, goal: days => lastOf(days, f => f.food && f.food.pT), goalTxt: g => `target ${n0(g)} g`, soFar: true },
    { k: 'steps', name: 'Steps', kind: 'bar', get: f => (f.move && f.move.steps ? f.move.steps : null), fmt: v => n0(v) },
    { k: 'burnt', name: 'Burnt', kind: 'bar', get: f => (f.burnt > 0 ? f.burnt : null), fmt: v => `${n0(v)} kcal`, when: days => days.some(f => f.move && (f.move.watch || f.ws.length || f.sp.length)) },
    { k: 'ready', name: 'Readiness', kind: 'line', get: f => (f.ready ? f.ready.score : null), fmt: v => String(Math.round(v)), lo: 0, hi: 100 },
    { k: 'rest', name: 'Resting heart rate', kind: 'line', get: f => (f.heart && f.heart.rest ? f.heart.rest : null), fmt: v => `${Math.round(v)} bpm` },
    { k: 'hrv', name: 'HRV', kind: 'line', get: f => (f.heart && f.heart.hrv ? f.heart.hrv : null), fmt: v => `${Math.round(v)} ms` },
    { k: 'weight', name: 'Body weight', kind: 'line', join: true, get: f => (f.weight ? f.weight.kg : null), fmt: v => `${kgTxt(v)} kg` },      // weigh-ins are days apart: the line joins them
  ];
  const laneBy = k => LANES.find(x => x.k === k);
  function lastOf(days, get) { for (let i = days.length - 1; i >= 0; i--) { const v = get(days[i]); if (v > 0) return v; } return 0; }
  const W = 320, PAD = 2;
  const slotOf = n => (W - 2 * PAD) / n, cxOf = (i, n) => PAD + slotOf(n) * (i + 0.5);
  // the y axis: three round numbers that fit the days shown (and the target, so its dashed line is on the chart), never below
  // 0; readiness is always 0 to 100. Lines show how the days differ; the numbers on the axis say by how much.
  const NICE = [1, 1.2, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10];
  function nice(x) { if (!(x > 0)) return 1; const e = Math.pow(10, Math.floor(Math.log10(x))); for (const m of NICE) if (m * e >= x - 1e-9) return m * e; return 10 * e; }
  // sleep (hours) and training (minutes) step by clock-friendly amounts: 15 min, 30 min, 1 h…
  const STEPS = { sleep: [0.25, 0.5, 1, 1.5, 2, 3, 4, 6], train: [5, 10, 15, 20, 30, 45, 60, 90, 120, 180] };
  function niceFor(L, x) { const st = STEPS[L.k]; if (!st) return nice(x); for (const v of st) if (v >= x - 1e-9) return v; const top = st[st.length - 1]; return top * Math.ceil(x / top); }
  function scaleOf(L, have, goal) {
    if (L.lo != null && L.hi != null) return { lo: L.lo, hi: L.hi, step: (L.hi - L.lo) / 2 };
    const all = goal > 0 ? have.concat([goal]) : have, mn = Math.min(...all), mx = Math.max(...all);
    let step = niceFor(L, Math.max((mx - mn) / 2, Math.abs(mx) * 0.01, 0.1)), lo = Math.max(0, Math.floor(mn / step + 1e-9) * step);
    for (let k = 0; k < 8 && lo + 2 * step < mx - 1e-9; k++) { step = niceFor(L, (mx - lo) / 2 + 1e-9); lo = Math.max(0, Math.floor(mn / step + 1e-9) * step); }
    return { lo, hi: lo + 2 * step, step };
  }
  const short = v => { const r = Math.round(v * 100) / 100; return String(r); };
  // how an axis number reads, per lane: "8 h", "1h 30", "2.5k", "69.3"
  function tick(L, v) {
    if (L.k === 'sleep') { const m = Math.round(v * 60), hh = Math.floor(m / 60), mm = m % 60; return !m ? '0' : `${hh}h${mm ? String(mm).padStart(2, '0') : ''}`; }
    if (L.k === 'train') { const m = Math.round(v); return !m ? '0' : m < 60 ? `${m}m` : m % 60 ? `${Math.floor(m / 60)}h${m % 60}` : `${m / 60}h`; }
    if (L.k === 'steps') return v >= 1000 ? `${short(v / 1000)}k` : short(v);
    if (L.k === 'eaten' || L.k === 'burnt') return v >= 10000 ? `${short(v / 1000)}k` : n0(v);
    return short(v);
  }
  // =====================================================================================================
  // 1.33 · Zones: a green safe zone and a red danger zone behind the lanes that have a healthy range
  // =====================================================================================================
  // { s: [from, to] | null, d: [from, to] | null, sTxt, dTxt } in the lane's own units (±Infinity = open), or null for a lane
  // without zones. Every edge is a number GymDay already uses, or a published range:
  //   sleep     safe = the hours recommended for the age (National Sleep Foundation 2015: 9-11 h to 12, 8-10 h for teenagers, 7-9 h
  //             for adults, 7-8 h from 65); danger = less than "may be appropriate" for anyone that age (under 7 h to 17, under 6 h
  //             for adults, under 5 h from 65)
  //   eaten     safe = within a tenth of the day's target; danger = under the safe minimum a target is never set below
  //             (Food.kcalMin: the resting burn and a tenth more). Eating over the target is never a danger zone
  //   protein   safe = the target or more; danger = under ICMR-NIN's RDA for the age and body weight (Food.protMin), the least for
  //             someone who doesn't train (half the target when no weight is logged)
  //   ready     safe = 60 and over (train as planned, go heavy); danger = under 40 (rest), Ready's own bands
  //   rest, hrv against your usual, the lines Recovery scores with: safe = under 4 beats above it / over 80% of it;
  //             danger = 7 or more beats above it / 70% of it or less. No usual yet (under 3 readings in 14 days): no zones
  // Body weight, steps, training and what was burnt have no zones: no one range is healthy for everybody.
  const INF = Infinity, EPS = 1e-6;
  // 1.35: three steps. Between the safe zone and the danger zone lies "needs improvement" (amber), and the danger zone is kept
  // for what is really bad:
  //   sleep     needs improvement = up to 2 hours short of the hours recommended for the age; danger = more than 2 hours short
  //             (under 6 h to 17, under 5 h from 18: "very short sleep")
  //   eaten     needs improvement = under the safe band down to what the body burns at rest; danger = under the resting burn
  //   protein   needs improvement = under the target down to ICMR-NIN's average requirement (EAR, about 0.8 of the RDA:
  //             0.66 against 0.83 g/kg for adults); danger = under it
  //   ready     needs improvement = 40 to 59 (train lighter); danger = under 40 (Ready says rest)
  //   rest, hrv needs improvement = between Recovery's two lines; danger = past the second one, as before
  function zonesOf(L, days, goal) {
    const last = days && days.length ? days[days.length - 1] : null, t = last ? last.t0 : day0(Date.now()), P = window.Progress, F = window.Food, C = window.Calories;
    if (L.k === 'sleep') {
      if (!recOn()) return null;
      const age = ageNow(), need = needH(), top = age >= 65 ? 8 : need + 2, red = need - 2;
      return { s: [need, top], w: [red, need - EPS], d: [-INF, red - EPS], sTxt: `${need} to ${top} h`, wTxt: `${red} to ${need} h`, dTxt: `under ${red} h` };
    }
    if (L.k === 'eaten') {
      const min = F && F.kcalMin ? F.kcalMin(t) : 0, lo = Math.max(goal * 0.9, min), hi = goal * 1.1;
      if (!(goal > 0) && !(min > 0)) return null;
      const rest0 = C && C.rest ? C.rest(t) || 0 : 0, rest = Math.round((rest0 > 0 ? rest0 : min / 1.1) / 10) * 10;
      const sOk = goal > 0 && hi > lo, wTop = sOk ? lo : min;
      return { s: sOk ? [lo, hi] : null, w: rest > 0 && wTop > rest ? [rest, wTop - EPS] : null, d: rest > 0 ? [-INF, rest - EPS] : null,
        sTxt: 'close to your target', wTxt: `${n0(rest)} to ${n0(wTop)} kcal`, dTxt: `under ${n0(rest)} kcal` };
    }
    if (L.k === 'protein') {
      const rda = F && F.protMin ? F.protMin(t) : 0, ear = Math.round(rda > 0 ? rda * 0.8 : goal * 0.4), red = goal > 0 ? Math.min(ear, goal * 0.6) : ear;
      if (!(goal > 0) && !(red > 0)) return null;
      return { s: goal > 0 ? [goal, INF] : null, w: goal > red && red > 0 ? [red, goal - EPS] : null, d: red > 0 ? [-INF, red - EPS] : null,
        sTxt: `${n0(goal)} g or more`, wTxt: `${n0(red)} to ${n0(goal)} g`, dTxt: `under ${n0(red)} g` };
    }
    if (L.k === 'ready') return { s: [60, INF], w: [40, 60 - EPS], d: [-INF, 40 - EPS], sTxt: '60 or more', wTxt: '40 to 59', dTxt: 'under 40' };
    if (L.k === 'rest' || L.k === 'hrv') {
      const u = P && P.usualOf ? P.usualOf(L.k, t) : 0; if (!(u > 0)) return null;
      if (L.k === 'rest') return { s: [-INF, u + 4 - EPS], w: [u + 4, u + 7 - EPS], d: [u + 7, INF], sTxt: `up to ${Math.ceil(u + 4) - 1} bpm`, wTxt: `${Math.ceil(u + 4)} to ${Math.ceil(u + 7) - 1} bpm`, dTxt: `${Math.ceil(u + 7)} bpm or more`, u };
      return { s: [u * 0.8 + EPS, INF], w: [u * 0.7 + EPS, u * 0.8], d: [-INF, u * 0.7], sTxt: `${Math.floor(u * 0.8) + 1} ms or more`, wTxt: `${Math.floor(u * 0.7) + 1} to ${Math.floor(u * 0.8)} ms`, dTxt: `${Math.floor(u * 0.7)} ms or less`, u };
    }
    return null;
  }
  // once the page is drawn the real sizes are known: a name wider than its chart is cut to "Safe zone" or "Danger zone", and one
  // that still does not fit inside its band is not shown (the mark beside the number and the hint still say which is which)
  function fitZones() {
    $$('#view .di-plot.di-zoned').forEach(p => {
      const sv = p.querySelector('.di-svg'); if (!sv) return;
      const r0 = sv.getBoundingClientRect(), k = r0.height / (+(sv.getAttribute('viewBox') || '').split(' ')[3] || 1);
      p.querySelectorAll('.di-zl').forEach(z => {
        const band = p.querySelector('.di-zn-' + (z.classList.contains('di-zl-s') ? 's' : z.classList.contains('di-zl-w') ? 'w' : 'd')); if (!band) return;
        const top = r0.top + (+band.getAttribute('y')) * k, bot = top + (+band.getAttribute('height')) * k;
        const out = () => { const r = z.getBoundingClientRect(); return r.top < top - 1.5 || r.bottom > bot + 1.5 || z.scrollWidth > z.clientWidth + 1; };
        z.style.visibility = '';
        if (out() && z.dataset.s && z.lastChild && z.lastChild.nodeType === 3) z.lastChild.textContent = z.dataset.s;
        if (out()) z.style.visibility = 'hidden';
      });
    });
  }
  { const after0 = A.afterRender; A.afterRender = name => { if (after0) after0(name); if (name === 'insights' || name === 'dayx' || name === 'recovery') fitZones(); }; }
  // 1.33 (1): one lane's chart in the 1.32 look (numbers on the left, dots, the zones) for another page: the Recovery page's nights.
  // A finger on it reads each day (charts.js). 1.35.1: big (the height comes from the page: 160 is about 2½ times the old one),
  // with bigger day letters; the day you read is marked and its value and day go in the line above the chart. Each point
  // carries its day (the 5th item) for Open in Insights.
  function laneChart(k, days, h) {
    const L = laneBy(k); if (!L) return '';
    const vals = days.map(f => L.get(f)); if (!vals.some(v => v != null)) return '';
    const n = days.length, pts = ` data-pts="${esc(JSON.stringify(days.map((f, i) => [+cxOf(i, n).toFixed(1), null, f.isToday ? 'Today' : A.fmtDate(f.t0), vals[i] == null ? 'nothing added' : L.fmt(vals[i]), f.t0])))}"`;
    return `<div class="di-lane rc-lane${h >= 120 ? ' rc-big' : ''}" data-k="${k}">${laneSvg(L, vals, days, -1, h || 60, laneLabel(L, vals, days), true, pts)}${axisRow(days, -1, h >= 120)}</div>`;
  }
  const zin = (r, v) => !!r && v >= r[0] && v <= r[1];
  // 'd' in the danger zone, 'w' needs improvement (1.35), 's' in the safe zone, '' in none. Today's food is not judged: the day isn't over
  const zstat = (L, z, f, v) => (!z || v == null || (L.soFar && f && f.isToday) ? '' : zin(z.d, v) ? 'd' : zin(z.w, v) ? 'w' : zin(z.s, v) ? 's' : '');
  const zWords = z => [z.s ? `safe zone ${z.sTxt}` : '', z.w ? `needs improvement ${z.wTxt}` : '', z.d ? `danger zone ${z.dTxt}` : ''].filter(Boolean).join(', ');
  const ZNAME = { s: 'In the safe zone', w: 'Needs improvement', d: 'In the danger zone' }, ZIC = { s: '✓', w: '!', d: '⚠' };
  // a chart with zones shows a strip of each: its numbers reach a little past the edge where each zone begins, and may start on a
  // rounder part of a step (half an hour for sleep, an even number…), so the strips cost the line as little height as possible
  const ZSLEEP = { 0.25: 0.25, 0.5: 0.5, 1: 0.5, 1.5: 0.5, 2: 1, 3: 1, 4: 1, 6: 1 }, ZPART = { 1: 0.5, 1.2: 0.6, 1.5: 0.5, 2: 1, 2.5: 0.5, 3: 1, 4: 2, 6: 2, 8: 4, 10: 5 };
  function unitOf(L, step) {
    if (L.k === 'sleep') return ZSLEEP[step] || step;
    const e = Math.pow(10, Math.floor(Math.log10(step) + 1e-9)), m = Math.round(step / e * 10) / 10, u = m === 5 ? (e >= 10 ? e : step) : (ZPART[m] || m) * e;      // 50 may start on a 10; 5 only on a 5
    return u >= 1 ? u : step;
  }
  function scaleZoned(L, have, goal, z) {
    if (L.lo != null && L.hi != null) return scaleOf(L, have, goal);
    // where each zone begins, and the side it lies on: a band with two ends counts from the end that faces the other zone
    const edge = r => (!r ? null : !isFinite(r[0]) ? [r[1], -1] : !isFinite(r[1]) ? [r[0], 1] : z.d && r !== z.d && z.d[0] >= r[1] ? [r[1], -1] : [r[0], 1]);
    const es = [edge(z.s), edge(z.d)].filter(Boolean), base = (goal > 0 ? have.concat([goal]) : have.slice()).concat(es.map(x => x[0]));
    let mn = Math.min(...base), mx = Math.max(...base); const pad = Math.max(mx - mn, Math.abs(mx) * 0.02, 0.2) * 0.16;
    es.forEach(x => { if (x[1] > 0) mx = Math.max(mx, x[0] + pad); else mn = Math.min(mn, x[0] - pad); });
    mn = Math.max(0, mn);
    let step = niceFor(L, Math.max((mx - mn) / 2, Math.abs(mx) * 0.01, 0.1));
    for (let k = 0; k < 14; k++) {
      const u = unitOf(L, step), lo = Math.max(0, Math.floor(mn / u + 1e-9) * u);
      if (lo + 2 * step >= mx - 1e-9) return { lo, hi: lo + 2 * step, step };
      step = niceFor(L, step * 1.0001);
    }
    return scaleOf(L, [mn, mx], 0);
  }

  /** One lane's picture: a line through the days that have a number, broken where a day has none (a small dot marks it).
      vals: a number or null for each day; sel: the picked day (-1 for none); h: the height in the chart's own units;
      axis: three numbers on the left and faint lines across (Insights and a day's page; not the small charts on Today). */
  function laneSvg(L, vals, days, sel, h, label, axis, extra) {
    const n = vals.length, slot = slotOf(n), have = vals.filter(v => v != null), T = 5, B = 5;
    const goal = L.goal ? (L.goal(days) || 0) : 0, z = have.length ? zonesOf(L, days, goal) : null;
    const sc = !have.length ? { lo: 0, hi: 1, step: 0.5 } : axis && z ? scaleZoned(L, have, goal, z) : scaleOf(L, have, goal);
    const y = v => T + (h - T - B) * (1 - (v - sc.lo) / Math.max(1e-9, sc.hi - sc.lo));
    const ticks = [sc.lo, sc.lo + sc.step, sc.hi];
    let g = `<rect class="di-sel" x="0" y="0" width="${slot.toFixed(2)}" height="${h}" rx="5" style="transform:translateX(${(PAD + slot * Math.max(0, sel)).toFixed(2)}px)"${sel < 0 ? ' visibility="hidden"' : ''}/>`;
    // 1.33: the zones, as soft bands from edge to edge behind everything, each named on the chart where it is tall enough.
    // The name goes where it crosses the least of the line: above or below the target line, at the band's far end or its near
    // one, on the left or the right
    let zl = '';
    if (axis && z) {
      const pts = vals.map((v, i) => (v == null ? null : [cxOf(i, n), y(v)])), gy = goal && goal <= sc.hi ? y(goal) : -99;
      const hits = (x0, x1, cy) => {
        let k = 0;
        pts.forEach((p, i) => {
          if (!p) return;
          if (p[0] >= x0 - 5 && p[0] <= x1 + 5 && Math.abs(p[1] - cy) < 10) k += 3;
          const q = pts[i + 1]; if (!q) return;
          for (let j = 1; j < 8; j++) { const x = p[0] + (q[0] - p[0]) * j / 8, yy = p[1] + (q[1] - p[1]) * j / 8; if (x >= x0 && x <= x1 && Math.abs(yy - cy) < 7.5) k++; }
        });
        return k;
      };
      const fs = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--fs')) || 1;
      const ux = Math.max(0.45, (Math.min(window.innerWidth || 393, 600) - 64 - 45 * fs) / W);       // pixels in one chart unit: the card's width less the numbers on the side
      const band = (r, c, name, txt, ic) => {
        if (!r) return; const a = Math.max(r[0], sc.lo), b = Math.min(r[1], sc.hi); if (!(b > a)) return;
        const top = r[1] >= sc.hi, bot = r[0] <= sc.lo, y1 = top ? 0 : y(b), y2 = bot ? h : y(a);
        g += `<rect class="di-zn di-zn-${c}" x="${PAD}" width="${W - 2 * PAD}" y="${y1.toFixed(1)}" height="${(y2 - y1).toFixed(1)}" rx="4"/>`;
        // the room for the name: the band, or the taller part of it beside the target line
        let a1 = y1, b1 = y2; if (gy > y1 + 1 && gy < y2 - 1) { if (gy - y1 >= y2 - gy) b1 = gy - 1; else a1 = gy + 1; }
        if (b1 - a1 < 11.5 * fs / ux) return;
        const half = 7 * fs / ux, ys = b1 - a1 <= 24 * fs / ux ? [(a1 + b1) / 2] : top ? [a1 + half + 1, b1 - half - 1] : bot ? [b1 - half - 1, a1 + half + 1] : [(a1 + b1) / 2];
        const wU = Math.min(W - 2 * PAD - 14, ((name.length + txt.length + 3) * 5.2 + 16) * fs / ux), full = W - 2 * PAD;
        let best = null;
        ys.forEach(cy => [0, 1].forEach(right => { const x0 = right ? full - 7 - wU : 7, k = hits(x0, x0 + wU, cy); if (!best || k < best.k) best = { k, cy, right }; }));
        if (best.k > 8) return;                 // the line would run through the name wherever it went: better no name than one struck through
        zl += `<span class="di-zl di-zl-${c}${best.right ? ' r' : ''}" data-s="${name}" style="top:${(best.cy / h * 100).toFixed(2)}%"><i>${ic}</i>${name} · ${esc(txt)}</span>`;
      };
      band(z.s, 's', 'Safe zone', z.sTxt, '✓'); band(z.w, 'w', 'Needs improvement', z.wTxt, '!'); band(z.d, 'd', 'Danger zone', z.dTxt, '⚠');
    }
    if (axis) ticks.forEach(t => { g += `<line class="di-grid" x1="${PAD}" x2="${W - PAD}" y1="${y(t).toFixed(1)}" y2="${y(t).toFixed(1)}"/>`; });
    if (goal && goal <= sc.hi) g += `<line class="di-goal" x1="${PAD}" x2="${W - PAD}" y1="${y(goal).toFixed(1)}" y2="${y(goal).toFixed(1)}"/>`;
    // the line, in runs of days next to each other that all have a number
    let run = [];
    const flush = () => { if (run.length > 1) g += `<path class="di-ln di-ln-${L.k}" pathLength="1" d="M${run.map(p => p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' L')}"/>`; run = []; };      // a path: pathLength on other shapes is not read by every browser
    vals.forEach((v, i) => { if (v == null) { if (!L.join) flush(); } else run.push([cxOf(i, n), y(v)]); });
    flush();
    const r = h <= 34 ? 2.2 : n <= 7 ? 3.4 : 2.4;
    vals.forEach((v, i) => {
      if (v == null) { g += `<circle class="di-none" cx="${cxOf(i, n).toFixed(1)}" cy="${(h - B).toFixed(1)}" r="1.3"/>`; return; }
      const zs = zstat(L, z, days[i], v), dz = zs === 'd';
      g += `<circle class="di-dt di-dt-${L.k}${L.low && goal && L.low(v, goal) ? ' lo' : ''}${dz ? ' dz' : zs === 'w' ? ' wz' : ''}" cx="${cxOf(i, n).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${dz ? r + 0.6 : r}"/>`;
    });
    const svg = `<svg class="di-svg" viewBox="0 0 ${W} ${h}" preserveAspectRatio="none" role="img" aria-label="${esc(label)}" focusable="false"${extra || ''}>${g}</svg>`;
    if (!axis) return svg;
    return `<div class="di-plot${zl ? ' di-zoned' : ''}"><div class="di-y" aria-hidden="true">${ticks.map(t => `<span style="top:${(y(t) / h * 100).toFixed(2)}%">${esc(tick(L, t))}</span>`).join('')}</div>${zl ? `<div class="di-zls" aria-hidden="true">${zl}</div>` : ''}${svg}</div>`;
  }
  // the day letters under charts that have a y axis start where the charts do
  const axisRow = (days, sel, big) => `<div class="di-axw">${axisSvg(days, sel, big)}</div>`;
  // the letters or dates under the lanes (1.35.1: big ones under the Recovery page's big charts)
  function axisSvg(days, sel, big) {
    const n = days.length;
    const t = days.map((f, i) => {
      const d = new Date(f.t0), show = n <= 7 || i === n - 1 || (n - 1 - i) % 5 === 0;
      return show ? `<text class="di-ax${big ? ' big' : ''}${i === sel ? ' on' : ''}${f.isToday ? ' now' : ''}" data-i="${i}" x="${cxOf(i, n).toFixed(1)}" y="${big ? 15 : 11}" text-anchor="middle">${n <= 7 ? WD[d.getDay()][0] : d.getDate()}</text>` : '';
    }).join('');
    return `<svg class="di-axis" viewBox="0 0 ${W} ${big ? 19 : 14}" aria-hidden="true" focusable="false">${t}</svg>`;
  }
  const avgOf = a => { const b = a.filter(v => v != null); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : 0; };
  function laneSub(L, vals, days, plain) {
    const have = vals.filter(v => v != null), n = have.length, goal = L.goal ? (L.goal(days) || 0) : 0, bits = [];
    if (L.total) { const k = days.reduce((a, f) => a + f.ws.length + f.sp.length, 0); bits.push(`${hm(have.reduce((a, v) => a + v, 0))} in ${plural(k, 'session')}`); }
    else if (L.kind === 'line' && n > 1 && L.k !== 'ready') bits.push(`${L.fmt(Math.min(...have)).replace(/ [a-z]+$/, '')} to ${L.fmt(Math.max(...have))}`);
    else bits.push(`average ${L.fmt(avgOf(vals))}`);
    if (goal && L.goalTxt && !plain) bits.push(L.goalTxt(goal));
    if (L.k === 'sleep' && goal && n) { const debt = have.reduce((a, v) => a + Math.max(0, goal - v), 0); if (debt >= 0.5) bits.push(`${hm(Math.round(debt * 60))} short in all`); }      // 1.33 (39): the sleep debt
    return bits.join(' · ');
  }
  const laneLabel = (L, vals, days) => { const z = zonesOf(L, days, L.goal ? (L.goal(days) || 0) : 0), zw = z ? zWords(z) : '';
    return `${L.name} on each of the last ${days.length} days: ${laneSub(L, vals, days)}; ${vals.filter(v => v != null).length} of ${days.length} days have a number${zw ? '; ' + zw : ''}`; };
  // beside a day's number: ✓ in the safe zone, ! needs improvement, ⚠ in the danger zone (never colour alone)
  const zmark = (k, zs) => `<span class="di-zs${zs ? ' di-zs-' + zs : ''}" id="diZ-${k}" role="img" aria-label="${ZNAME[zs] || ''}"${zs ? '' : ' hidden'}>${ZIC[zs] || ''}</span>`;
  // the lanes that have something to show, in order; `max` stops at that many (Today's card shows three)
  function lanesOf(days, max) {
    const out = [];
    for (const L of LANES) {
      if (max && out.length >= max) break;
      const vals = days.map(f => L.get(f));
      if (vals.some(v => v != null) && (!L.when || L.when(days))) out.push({ L, vals, z: zonesOf(L, days, L.goal ? (L.goal(days) || 0) : 0) });
    }
    return out;
  }
  const daysBack = n => { const t = day0(Date.now()), out = []; for (let i = n - 1; i >= 0; i--) out.push(facts(plus(t, -i), true)); return out; };

  // =====================================================================================================
  // Insights: the last 7 or 30 days
  // =====================================================================================================
  let cur = null;                      // the Insights page as drawn: { days, lanes, sel }
  let anim = false;                    // the next draw may play its entrance (a range change or a new day, not a background redraw)
  const rangeN = () => (M.diN === 30 ? 30 : 7);
  function selText(f) { return { name: f.isToday ? 'Today' : A.fmtDate(f.t0), sub: gist(f) }; }
  // 1.35: a card for each day under the day bar, with that day's numbers: swipe it for the day before or after (the cards snap one
  // at a time, and the charts' band glides along); a tap opens the day. The neighbours peek in at the sides.
  const DICON = { sleep: '😴', train: '💪', eaten: '🍽', protein: '🥚', steps: '👟', burnt: '🔥', ready: '⚡', rest: '❤️', hrv: '💓', weight: '⚖️' };
  function dayCard(f, i, lanes, sel) {
    const items = lanes.map(({ L, vals, z }) => {
      const v = vals[i], zs = zstat(L, z, f, v);
      let lab = L.name, val = v == null ? '–' : L.fmt(v), off = v == null;
      if (L.k === 'train') {
        const names = f.ws.map(w => w.s.dayName || 'Workout').concat(f.sp.map(y => y.name));
        lab = v == null ? 'Workout' : `Workout · ${hm(v)}`; val = names.length ? names.join(' + ') : f.isToday ? 'None yet' : 'Rest day'; off = !names.length;
      } else if (L.soFar && f.isToday && v != null) lab += ' so far';
      if (L.k === 'rest') lab = 'Resting heart';
      return `<span class="di-dci${off ? ' off' : ''}" data-k="${L.k}"><span class="di-dce" aria-hidden="true">${DICON[L.k] || '•'}</span><span class="di-dct"><span class="di-dcl">${esc(lab)}</span>`
        + `<span class="di-dcv">${esc(val)}${zs ? ` <span class="di-zs di-zs-${zs}" role="img" aria-label="${ZNAME[zs]}">${ZIC[zs]}</span>` : ''}</span></span></span>`;
    }).join('');
    const nm = f.isToday ? 'Today' : dayLong(f.t0);
    return `<div class="di-dc${i === sel ? ' on' : ''}" data-i="${i}" role="group" aria-label="${esc(nm)}"><div class="di-dcc">
      <div class="di-dch"><b>${esc(nm)}</b><button class="di-dco" data-act="diOpenCard" data-i="${i}" aria-label="Open ${esc(nm)}">Open ›</button></div>
      <div class="di-dcg">${items}</div></div></div>`;
  }
  const dotsHtml = (n, sel) => (n <= 10
    ? `<div class="di-dots" id="diDots" aria-hidden="true">${Array.from({ length: n }, (_, i) => `<i class="${i === sel ? 'on' : ''}"></i>`).join('')}</div>`
    : `<div class="di-dots di-pos" id="diDots" aria-hidden="true"><i style="width:${(100 / n).toFixed(3)}%;transform:translateX(${sel * 100}%)"></i></div>`);
  // where the cards are: the one nearest the middle; and moving them to a day (smoothly unless motion is reduced)
  let cardLock = false, cardT = 0, cardRaf = 0;
  const cardAt = box => { const c = box.scrollLeft + box.clientWidth / 2; let best = 0, bd = Infinity; box.querySelectorAll('.di-dc').forEach((el, i) => { const d = Math.abs(el.offsetLeft + el.offsetWidth / 2 - c); if (d < bd) { bd = d; best = i; } }); return best; };
  function settleCards() { const box = $('#diCards'); if (!box || !cur) return; const i = cardAt(box); if (i !== cur.sel) pick(i, 'card'); }
  function toCard(i, smooth) {
    const box = $('#diCards'), el = box && box.querySelectorAll('.di-dc')[i]; if (!el) return;
    const left = Math.max(0, Math.min(box.scrollWidth - box.clientWidth, el.offsetLeft + el.offsetWidth / 2 - box.clientWidth / 2));
    if (Math.abs(box.scrollLeft - left) < 2) return;
    const soft = smooth && !calm();
    cardLock = true; clearTimeout(cardT);
    box.scrollTo({ left, behavior: soft ? 'smooth' : 'auto' });
    cardT = setTimeout(() => { cardLock = false; settleCards(); }, soft ? 520 : 90);
  }
  function bindCards() {
    const box = $('#diCards'); if (!box || box.dataset.bound) return; box.dataset.bound = '1';
    toCard(cur ? cur.sel : 0, false);
    box.addEventListener('scroll', () => {
      if (cardLock) { clearTimeout(cardT); cardT = setTimeout(() => { cardLock = false; settleCards(); }, 160); return; }
      if (cardRaf) return;
      cardRaf = requestAnimationFrame(() => { cardRaf = 0; settleCards(); });
    }, { passive: true });
    // a tap on a card: the one in the middle opens its day; one peeking in at the side comes to the middle
    box.addEventListener('click', e => {
      const c = e.target.closest('.di-dc'); if (!c || e.target.closest('button') || !cur) return;
      const i = +c.dataset.i; if (!cur.days[i]) return;
      if (i !== cur.sel) pick(i); else openDay(cur.days[i].t0);
    });
  }
  ACT.diOpenCard = el => { const i = +el.dataset.i; if (cur && cur.days[i]) openDay(cur.days[i].t0); };
  VIEWS.insights = {
    html() {
      const n = rangeN(), days = daysBack(n), lanes = lanesOf(days), sel = cur && cur.n === n && cur.sel < n ? cur.sel : n - 1;
      cur = { n, days, lanes, sel };
      let h = `<div class="top"><button class="back" data-act="back" aria-label="Back">‹</button><div class="grow"><h1>Insights</h1><div class="sub">Your days side by side</div></div></div>
        <div class="row di-range"><span class="k2 grow">The last</span><div class="di-chips">${[7, 30].map(k => `<button class="chip ${n === k ? 'on' : ''}" data-act="diRange" data-n="${k}" aria-pressed="${n === k}">${k} days</button>`).join('')}</div>${window.Report ? `<button class="chip" data-act="reportOpen" aria-label="One-page report as a PDF">📄 PDF</button>` : ''}</div>`;
      if (!lanes.length) {
        return h + `<div class="empty"><div class="big">📊</div><h2>Nothing to chart yet</h2><p>Log a workout, some food, last night's sleep or your body weight, and each one gets a chart here, a day beside a day.</p>
          <div class="mt16"><button class="btn primary" data-act="quickAdd">+ Add something</button></div></div>`;
      }
      const s = selText(days[sel]), rw = rangeWords(days);
      const shortH = rw.length ? `<div class="card di-card di-short" id="diRangeShort"><div class="k2">These ${n} days in short</div>${rw.map(x => `<div class="di-w"><span class="di-wi" aria-hidden="true">${x[0]}</span><div class="small grow">${x[1]}</div></div>`).join('')}</div>` : '';            // 1.35: the days in short, shown below the charts
      h += `<div class="di-bar" id="diBar"><button class="btn icon" data-act="diStep" data-d="-1" aria-label="The day before" ${sel <= 0 ? 'disabled' : ''}>‹</button>
          <div class="grow di-bar-t" aria-live="polite"><b id="diSelName">${esc(s.name)}</b><span class="xs muted ellipsis" id="diSelSub">${esc(s.sub)}</span></div>
          <button class="btn icon" data-act="diStep" data-d="1" aria-label="The day after" ${sel >= n - 1 ? 'disabled' : ''}>›</button>
          <button class="btn sm primary" data-act="diOpenSel" id="diOpenSel">Open day ›</button></div>
        <div class="di-dcs" id="diCards" role="region" aria-label="Days, one card each: swipe for the day before or after">${days.map((f, i) => dayCard(f, i, lanes, sel)).join('')}</div>${dotsHtml(n, sel)}
        <div class="card di-lanes${anim && !calm() ? ' di-anim' : ''}" id="diLanes" data-n="${n}">`;
      for (const { L, vals, z } of lanes) {
        const v = vals[sel];
        h += `<div class="di-lane" data-k="${L.k}"><div class="row di-lh"><div class="grow" style="min-width:0"><button class="di-go small" data-act="diPage" data-k="${L.k}" aria-label="${L.name}: open its page">${L.name}<span aria-hidden="true"> ›</span></button><span class="xs muted di-ls"> ${esc(laneSub(L, vals, days))}</span></div>${z ? zmark(L.k, zstat(L, z, days[sel], v)) : ''}<span class="di-v${v == null ? ' off' : ''}" id="diV-${L.k}">${v == null ? '–' : esc(L.fmt(v))}</span></div>
          ${laneSvg(L, vals, days, sel, 96, laneLabel(L, vals, days), true)}</div>`;
      }
      h += `${axisRow(days, sel)}</div>
        <p class="xs dim di-hint">Swipe the day card, or slide a finger across the charts, to go from day to day. A dashed line is your target; where the line breaks, a small dot marks a day with nothing logged.${lanes.some(x => x.z) ? ` Green is the safe zone, amber needs improvement, red the danger zone. <button class="linkish" data-act="diZones">What the zones mean</button>` : ''} General fitness information, not medical advice.</p>
        ${shortH}<div class="row di-more"><span class="xs muted">More:</span>${window.Patterns ? `<button class="chip" data-act="patOpen">Patterns</button>` : ''}<button class="chip" data-act="openRecap">This month</button><button class="chip" data-act="openYear">Year</button>${recOn() ? `<button class="chip" data-act="openRecovery">Recovery</button>` : ''}</div>`;
      anim = false;
      return h;
    },
    mount() { bindLanes(); bindCards(); }
  };
  // pick day i without redrawing: the band in every lane, each lane's number, the bar's words, the day card (1.35)
  function pick(i, src) {
    if (!cur || i < 0 || i >= cur.n || !$('#diLanes')) return;
    cur.sel = i; const slot = slotOf(cur.n);
    $$('#diLanes .di-sel').forEach(r => { r.removeAttribute('visibility'); r.style.transform = `translateX(${(PAD + slot * i).toFixed(2)}px)`; });
    for (const { L, vals, z } of cur.lanes) {
      const el = $('#diV-' + L.k), v = vals[i]; if (el) { el.textContent = v == null ? '–' : L.fmt(v); el.classList.toggle('off', v == null); }
      const zm = z ? $('#diZ-' + L.k) : null; if (zm) zm.outerHTML = zmark(L.k, zstat(L, z, cur.days[i], v));
    }
    $$('#diLanes .di-ax').forEach(t => t.classList.toggle('on', +t.dataset.i === i));
    const s = selText(cur.days[i]), nm = $('#diSelName'), sb = $('#diSelSub'); if (nm) nm.textContent = s.name; if (sb) sb.textContent = s.sub;
    const b = $$('#diBar [data-act="diStep"]'); if (b[0]) b[0].disabled = i <= 0; if (b[1]) b[1].disabled = i >= cur.n - 1;
    $$('#diCards .di-dc').forEach((c, k) => c.classList.toggle('on', k === i));
    const dots = $('#diDots');
    if (dots) { if (dots.classList.contains('di-pos')) { const t = dots.firstElementChild; if (t) t.style.transform = `translateX(${i * 100}%)`; } else dots.querySelectorAll('i').forEach((d, k) => d.classList.toggle('on', k === i)); }
    if (src !== 'card') toCard(i, true);
  }
  // a finger on the lanes: a tap picks the day under it, a sideways slide reads day after day; up and down still scrolls
  function bindLanes() {
    const box = $('#diLanes'); if (!box || box.dataset.bound) return; box.dataset.bound = '1';
    let p = null;
    const at = x => { const sv = box.querySelector('.di-svg'); if (!sv || !cur) return -1; const r = sv.getBoundingClientRect(); return Math.max(0, Math.min(cur.n - 1, Math.floor(((x - r.left) / r.width * W - PAD) / slotOf(cur.n)))); };
    box.addEventListener('pointerdown', e => { if (e.button > 0) return; p = { id: e.pointerId, x: e.clientX, y: e.clientY, slide: e.pointerType === 'mouse' }; if (p.slide) pick(at(e.clientX)); });
    box.addEventListener('pointermove', e => {
      if (!p || e.pointerId !== p.id) return;
      if (!p.slide) { const dx = Math.abs(e.clientX - p.x), dy = Math.abs(e.clientY - p.y); if (dx > 6 && dx > dy) p.slide = true; else return; }
      const i = at(e.clientX); if (i >= 0 && i !== cur.sel) pick(i);
    });
    box.addEventListener('pointerup', e => { if (!p || e.pointerId !== p.id) return; const tap = !p.slide && Math.abs(e.clientX - p.x) < 10 && Math.abs(e.clientY - p.y) < 10; p = null; if (tap) pick(at(e.clientX)); });
    box.addEventListener('pointercancel', () => { p = null; });
  }
  ACT.diOpen = () => { anim = true; cur = null; A.go('insights'); };
  // 1.35.1: Insights on one day, over 7 or 30 days (the Recovery page's nights: Open in Insights)
  function openAt(t, n) {
    n = n === 30 ? 30 : 7;
    if (rangeN() !== n) { M.diN = n; if (S.saveMeta) S.saveMeta(); }
    const back = Math.round((day0(Date.now()) - day0(t || Date.now())) / 86400000);
    anim = true; cur = { n, sel: Math.max(0, Math.min(n - 1, n - 1 - back)) }; A.go('insights');
  }
  // 1.33: what the two zones mean on each chart that has them, in plain words, and where the numbers come from
  const ZWHY = {
    sleep: 'Green is the hours recommended for your age. Amber is up to 2 hours short of them. Red is more than 2 hours short: very short sleep.',
    eaten: 'Green is within a tenth of your calorie target. Amber is under that, down to what your body burns at rest. Red is under the resting burn. Eating over your target is never marked.',
    protein: 'Green is your protein target or more. Amber is under it, down to the average a body needs even without training (ICMR-NIN). Red is under that.',
    ready: 'Green: train as planned or go heavy. Amber: train lighter. Red: Ready says rest.',
    rest: 'Against your own usual (the middle of the last 14 days). Amber is 4 to 6 beats above it. Red is 7 or more, which can mean you are tired, stressed or getting ill.',
    hrv: 'Against your own usual. Amber is 70 to 80% of it. Red is 70% or less, which can mean your body is still recovering.',
  };
  function zonesSheet(days) {
    const rows = LANES.filter(L => ZWHY[L.k] && (wOn() || (L.k !== 'rest' && L.k !== 'hrv'))).map(L => {
      const z = zonesOf(L, days, L.goal ? (L.goal(days) || 0) : 0);
      const body = z ? `<div class="small di-zr">${[z.s ? `<span class="di-zk"><i class="di-zs-s">✓</i> Safe zone</span> ${esc(z.sTxt)}` : '', z.w ? `<span class="di-zk"><i class="di-zs-w">!</i> Needs improvement</span> ${esc(z.wTxt)}` : '', z.d ? `<span class="di-zk"><i class="di-zs-d">⚠</i> Danger zone</span> ${esc(z.dTxt)}` : ''].filter(Boolean).join('<br>')}</div>`
        : `<div class="small muted di-zr">${L.k === 'rest' || L.k === 'hrv' ? 'No zones yet: GymDay needs readings on 3 of the last 14 days to know your usual.' : L.k === 'sleep' ? 'No zones while Recovery is turned off.' : 'No zones yet: set a daily target on the Food tab.'}</div>`;
      return `<div class="di-zrow" data-k="${L.k}"><b>${L.name}</b>${body}<div class="xs muted">${ZWHY[L.k]}</div></div>`;
    }).join('');
    return `<h2>Safe, needs improvement, danger</h2><p class="small muted">The charts that have a healthy range show three zones. Green is the safe zone, amber needs improvement, and red, the danger zone, is only for what is really low.</p>
      <div class="di-zrows">${rows}</div>
      <p class="xs dim mt12">One day in amber or red is no cause for alarm: it is several in a row that matter. Today's food is never marked, because the day isn't over. Body weight, steps and training have no zones: no one range is healthy for everybody.</p>
      <p class="xs dim">Sleep: National Sleep Foundation (2015) and the American Academy of Sleep Medicine. Protein: ICMR-NIN, Nutrient Requirements for Indians (2020). The other lines are the ones GymDay's Recovery, Readiness and calorie target already use. GymDay gives general fitness information, not medical advice: if a number worries you, ask a doctor.</p>
      <button class="btn primary block mt16" data-act="closeSheet">Got it</button>`;
  }
  ACT.diZones = () => A.openSheet(zonesSheet(cur && cur.days ? cur.days : daysBack(7)));
  ACT.diRange = el => { const n = +el.dataset.n === 30 ? 30 : 7; if (n === rangeN()) return; M.diN = n; if (S.saveMeta) S.saveMeta(); cur = null; anim = true; A.rerender(); };
  ACT.diStep = el => { if (cur) pick(cur.sel + (+el.dataset.d || 0)); };
  ACT.diOpenSel = () => { if (cur && cur.days[cur.sel]) openDay(cur.days[cur.sel].t0); };

  // =====================================================================================================
  // A day
  // =====================================================================================================
  let slide = '';                      // 'l' | 'r': the way the next day page comes in
  function openDay(t) {
    const t0 = Math.min(day0(t), day0(Date.now()));
    anim = true; slide = '';
    if (A.top().name === 'dayx') { A.top().params = { t: t0 }; A.render(); } else A.go('dayx', { t: t0 });
  }
  ACT.diDay = el => openDay(+el.dataset.t);
  const ring = (p, size, w, cls) => (window.Today && window.Today.ring ? window.Today.ring(p, size, w, cls) : '');
  const hbar = (v, max, cls, lbl) => `<div class="bar di-hb ${cls || ''}"${lbl ? ` role="img" aria-label="${esc(lbl)}"` : ''}><div style="width:${Math.max(0, Math.min(100, max > 0 ? v / max * 100 : 0)).toFixed(1)}%"></div></div>`;
  const stat = (v, k) => `<div class="di-st"><div class="v">${v}</div><div class="k">${k}</div></div>`;
  const head = (ic, title, sub, right) => `<div class="row di-ch"><span class="di-ic" aria-hidden="true">${ic}</span><div class="grow" style="min-width:0"><h3>${title}</h3>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div>${right || ''}</div>`;
  const go = (act, text, data) => `<button class="btn sm di-go" data-act="${act}"${data || ''}>${text} ›</button>`;

  function ringsRow(f) {
    const out = [];
    const tile = (to, cls, p, mid, k, v) => out.push(`<button class="di-rt" data-act="diGo" data-to="${to}"><span class="di-rr">${ring(p, 58, 7, cls)}<span class="di-rm">${mid}</span></span><span class="di-rk">${k}</span><span class="xs muted di-rv">${v}</span></button>`);
    if (f.sleep) tile('diSleep', 'tr-sleep', f.sleep.min / (f.sleep.need * 60), pct(f.sleep.min, f.sleep.need * 60) + '%', 'Sleep', hm(f.sleep.min));
    if (f.food && f.food.target) tile('diFood', 'tr-kcal', f.food.eaten / f.food.target, pct(f.food.eaten, f.food.target) + '%', 'Eaten', `${n0(f.food.eaten)} kcal`);
    if (f.food && f.food.pT) tile('diFood', 'tr-p', f.food.protein / f.food.pT, pct(f.food.protein, f.food.pT) + '%', 'Protein', `${n0(f.food.protein)} g`);
    if (f.ready) tile('diReady', 'tr-ready rd-' + f.ready.tone, f.ready.score / 100, String(f.ready.score), 'Readiness', esc(f.ready.advice.toLowerCase()));
    return out.length > 1 ? `<div class="di-rings di-rings-${out.length}">${out.join('')}</div>` : '';
  }
  function workoutCard(w, i) {
    const s = w.s, top = w.parts && w.parts.length ? w.parts[0].n : 0, fmtSets = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
    let h = `<div class="card di-card" id="diW${i}">${head('🏋', esc(s.dayName || 'Workout'), `started ${A.fmtClock(s.start)}${w.hr ? ` · average ♥ ${w.hr}` : ''}`, go('openSession', 'Open', ` data-id="${esc(s.id)}"`))}
      <div class="di-sts">${stat(A.fmtDur(S.gymMs(s)), 'gym time')}${stat(w.sets, w.sets === 1 ? 'set' : 'sets')}${w.vol > 0 ? stat(A.fmtBig(w.vol), A.unit() + ' lifted') : ''}${w.kcal ? stat(n0(w.kcal), 'kcal') : ''}</div>`;
    if (w.prev && w.prev.vol > 0 && w.vol > 0) {
      const p = Math.round((w.vol - w.prev.vol) / w.prev.vol * 100), m = Math.max(w.vol, w.prev.vol);
      h += `<div class="di-cmp"><div class="row"><span class="xs muted grow">Weight lifted, against ${esc(A.whenText(w.prev.t).replace(/^on /, ''))}</span><b class="small ${p > 0 ? 'di-up' : p < 0 ? 'di-dn' : ''}">${p > 0 ? '▲ ' : p < 0 ? '▼ ' : ''}${p === 0 ? 'the same' : Math.abs(p) + '%'}</b></div>
        <div class="di-two"><span class="xs">This time</span>${hbar(w.vol, m, 'di-now', `This time ${volTxt(w.vol)}`)}<span class="xs di-n">${A.fmtBig(w.vol)}</span><span class="xs muted">Last time</span>${hbar(w.prev.vol, m, 'di-was', `Last time ${volTxt(w.prev.vol)}`)}<span class="xs muted di-n">${A.fmtBig(w.prev.vol)}</span></div></div>`;
    }
    if (s.prs && s.prs.length) h += `<div class="di-prs">${s.prs.map(p => { const ex = S.getEx(p.ex); return `<span class="pill accent">🏆 ${esc(ex ? ex.name : 'Exercise')} · ${esc(String(p.text || ''))}</span>`; }).join('')}</div>`;
    if (w.parts && w.parts.length) {
      h += `<div class="k2 mt12">Sets for each body part</div><div class="di-parts">${w.parts.map(p => `<span class="small">${esc(p.g)}</span>${hbar(p.n, top, 'di-part', `${p.g}: ${fmtSets(p.n)} set${p.n === 1 ? '' : 's'}`)}<b class="small di-n">${fmtSets(p.n)}</b>`).join('')}</div>`;
    }
    if (w.rows.length) {
      h += `<div class="k2 mt12">Exercises, against the time before</div><div class="di-exs">${w.rows.map(r => {
        const d = r.d, tag = !d ? `<span class="xs dim">first time</span>` : d.d === 0 ? `<span class="xs muted">the same</span>` : `<b class="xs ${d.d > 0 ? 'di-up' : 'di-dn'}">${d.d > 0 ? '▲ +' : '▼ −'}${A.fmtW(Math.abs(d.d))} ${d.unit}</b>`;
        return `<div class="row di-ex"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(r.ex.name)}</div><div class="xs muted ellipsis">${esc(r.text)}</div></div>${tag}</div>`;
      }).join('')}</div>`;
    }
    return h + `</div>`;
  }
  // the night on a line from 6 pm to noon, with the time asleep filled in
  function nightLine(sl) {
    if (sl.bed == null || sl.wake == null) return '';
    const from = 18 * 60, span = 18 * 60, rel = m => (((m - from) % 1440) + 1440) % 1440;
    let a = rel(sl.bed), b = rel(sl.wake); if (a > span) a = 0; if (b > span || b <= a) b = span;
    const P = window.Progress, ticks = [[0, '6 pm'], [360, '12 am'], [720, '6 am'], [1080, '12 pm']];
    return `<div class="di-night" role="img" aria-label="In bed from ${clk(sl.bed)} to ${clk(sl.wake)}"><div class="di-nt"><i style="left:${(a / span * 100).toFixed(1)}%;width:${((b - a) / span * 100).toFixed(1)}%"></i></div>
      <div class="di-nx">${ticks.map(t => `<span style="left:${(t[0] / span * 100).toFixed(1)}%">${t[1]}</span>`).join('')}</div></div>
      <div class="row small mt8"><span class="grow">🛏 ${clk(sl.bed)} → ${clk(sl.wake)}</span>${P && P.inBed ? `<span class="xs muted">in bed ${hm(P.inBed(sl.bed, sl.wake))}</span>` : ''}</div>`;
  }
  function weekBars(t0, L, h) {
    const days = []; for (let i = 6; i >= 0; i--) days.push(facts(plus(t0, -i), true));
    const vals = days.map(f => L.get(f)); if (vals.filter(v => v != null).length < 2) return '';
    return `<div class="di-wk"><div class="xs muted">The week to this day · ${esc(laneSub(L, vals, days, true))}</div>${laneSvg(L, vals, days, 6, h || 76, laneLabel(L, vals, days), true)}${axisRow(days, 6)}</div>`;
  }
  function sleepCard(f) {
    const sl = f.sleep, P = window.Progress, hb = f.heart;
    let h = `<div class="card di-card" id="diSleep">${head('😴', 'Sleep', `${f.isToday ? 'last night' : 'the night before'}${sl && sl.app ? ' · ' + esc(sl.app) : sl && sl.by === 'watch' ? ' · from your watch' : ''}`, recOn() ? go('openRecovery', 'Recovery') : '')}`;
    if (sl) {
      const short = sl.need * 60 - sl.min;
      h += `<div class="row di-big"><div class="grow"><span class="di-num">${hm(sl.min)}</span>${sl.score ? ` <span class="pill">score ${sl.score}</span>` : ''}</div><span class="xs ${short > 15 ? 'di-warn' : 'di-ok'}">${short > 15 ? hm(short) + ' short' : 'enough ✓'}</span></div>
        ${hbar(sl.min, sl.need * 60, 'di-sl' + (short > 15 ? ' lo' : ''), `${hm(sl.min)} of the ${sl.need} hours you need`)}<div class="xs muted mt4">of the ${sl.need} h you need</div>
        ${P && P.stageBar ? P.stageBar(sl) : ''}${nightLine(sl)}`;
    }
    if (hb) {
      const vs = (v, u, more) => (!u ? '' : Math.abs(v - u) < (more ? 3 : 4) ? `about your usual ${Math.round(u)}` : `${Math.round(Math.abs(v - u))} ${v > u ? 'above' : 'below'} your usual ${Math.round(u)}`);
      const t = (k, v, unit, sub) => (v ? `<div class="di-ht"><div class="k2">${k}</div><div class="v">${v}<small> ${unit}</small></div>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div>` : '');
      h += `<div class="di-hts${sl ? ' mt12' : ''}">${t('Resting heart rate', hb.rest, 'bpm', vs(hb.rest, hb.uRest, true))}${t('HRV', hb.hrv, 'ms', vs(hb.hrv, hb.uHrv, false))}${t('Blood oxygen', hb.spo2, '%', 'while asleep')}${t('Breathing', hb.br, '/min', 'while asleep')}</div>`;
    }
    if (sl) h += weekBars(f.t0, laneBy('sleep'));
    return h + `</div>`;
  }
  function foodCard(f) {
    const fd = f.food, left = fd.target ? fd.target - fd.eaten : 0;
    const mac = (k, v, t, cls) => `<span class="small">${k}</span>${hbar(v, t || Math.max(v, 1), cls, `${k}: ${n0(v)} g${t ? ' of ' + n0(t) : ''}`)}<span class="xs di-n"><b>${n0(v)}</b>${t ? ` / ${n0(t)}` : ''} g</span>`;
    let h = `<div class="card di-card" id="diFood">${head('🍽', 'Food', plural(fd.n, 'thing') + ' logged', go('diFoodOpen', 'Open', ` data-t="${f.t0}"`))}
      <div class="di-food"><div class="di-fr">${ring(fd.target ? fd.eaten / fd.target : 0, 96, 10, 'tr-kcal')}<div class="di-fc"><div class="di-fn">${n0(fd.eaten)}</div><div class="xs muted">kcal</div></div></div>
        <div class="grow" style="min-width:0"><div class="small">${fd.target ? (left >= 0 ? (f.isToday ? `<b>${n0(left)}</b> kcal left of ${n0(fd.target)}` : `<b>${n0(left)}</b> kcal under your ${n0(fd.target)} target`) : `<b>${n0(-left)}</b> kcal over your ${n0(fd.target)} target`) : 'No daily target set'}</div>
          <div class="di-macs mt8">${mac('Protein', fd.protein, fd.pT, 'di-p')}${mac('Carbs', fd.carbs, fd.cT, 'di-c')}${mac('Fat', fd.fat, fd.fT, 'di-f')}</div></div></div>`;
    if (fd.meals && fd.meals.length) {
      const tot = fd.meals.reduce((a, m) => a + m.kcal, 0);
      h += `<div class="k2 mt12">By meal</div><div class="di-meals" role="img" aria-label="${esc(fd.meals.map(m => `${m.name} ${n0(m.kcal)} kcal`).join(', '))}">${fd.meals.map(m => `<i class="di-m-${m.k}" style="width:${(m.kcal / tot * 100).toFixed(1)}%"></i>`).join('')}</div>
        <div class="di-ml">${fd.meals.map(m => `<span><i class="di-m-${m.k}"></i>${esc(m.name)} <b>${n0(m.kcal)}</b></span>`).join('')}</div>`;
    }
    return h + weekBars(f.t0, laneBy('eaten')) + `</div>`;
  }
  function moveCard(f) {
    const mv = f.move;
    let h = `<div class="card di-card" id="diMove">${head('👟', 'Movement', mv.app ? esc(mv.app) : mv.watch ? 'from your watch' : mv.steps || mv.burnt ? 'steps and what you burnt' : 'activities', '')}`;
    if (mv.steps) {
      const u = mv.uSteps || 0, m = Math.max(mv.steps, u, 1);
      h += `<div class="row di-big"><div class="grow"><span class="di-num">${n0(mv.steps)}</span> <span class="small muted">steps</span></div>${u ? `<span class="xs muted">your usual ${n0(u)}</span>` : ''}</div>${hbar(mv.steps, m, 'di-steps', `${n0(mv.steps)} steps`)}`;
    }
    if (mv.burnt > 0) {
      h += `<div class="row di-big${mv.steps ? ' mt12' : ''}"><div class="grow"><span class="di-num">${n0(mv.burnt)}</span> <span class="small muted">kcal burnt</span></div><span class="xs muted">${mv.watch ? 'from your watch' : mv.base != null ? 'everyday + training' : 'training'}</span></div>`;
      if (mv.base != null && !mv.watch && (mv.wAdd > 0 || mv.sAdd > 0)) {
        const parts = [['base', 'Everyday', mv.base], ['w', 'Workouts', mv.wAdd], ['s', 'Activities', mv.sAdd]].filter(x => x[2] > 0), tot = parts.reduce((a, x) => a + x[2], 0);
        h += `<div class="di-meals" role="img" aria-label="${esc(parts.map(x => `${x[1]} ${n0(x[2])} kcal`).join(', '))}">${parts.map(x => `<i class="di-k-${x[0]}" style="width:${(x[2] / tot * 100).toFixed(1)}%"></i>`).join('')}</div>
          <div class="di-ml">${parts.map(x => `<span><i class="di-k-${x[0]}"></i>${x[1]} <b>${n0(x[2])}</b></span>`).join('')}</div>`;
      }
    }
    if (wOn() && (mv.avg || mv.max)) h += `<div class="xs muted mt8">Heart rate over the day: ${[mv.avg ? `average ${mv.avg}` : '', mv.max ? `highest ${mv.max}` : '', mv.min ? `lowest ${mv.min}` : ''].filter(Boolean).join(' · ')}</div>`;
    if (f.sp.length) h += `<div class="k2 mt12">Activities</div>${f.sp.map(y => `<button class="row di-ex di-arow" data-act="mvOpen" data-id="${esc(y.x.id)}"><span class="grow small" style="font-weight:600">${esc(y.name)}</span><span class="xs muted">${hm(y.mins)}${y.kcal ? ` · ${n0(y.kcal)} kcal` : ''}</span><span class="di-chev" aria-hidden="true">›</span></button>`).join('')}`;
    return h + (mv.steps ? weekBars(f.t0, laneBy('steps')) : '') + `</div>`;
  }
  function readyCard(f) {
    const r = f.ready, share = p => Math.round(p.w / r.wsum * 100);
    return `<div class="card di-card" id="diReady">${head('⚡', 'Readiness', f.isToday ? 'this morning' : 'that morning', f.isToday ? go('readyOpen', 'How') : '')}
      <div class="row di-rdy"><span class="di-rr">${ring(r.score / 100, 72, 8, 'tr-ready rd-' + r.tone)}<span class="di-rm big">${r.score}</span></span><div class="grow"><div class="rd-adv rd-${r.tone}">${esc(r.advice)}</div><div class="xs muted">${esc(r.say)}</div></div></div>
      <div class="di-prows mt12">${r.parts.filter(p => p.sc != null).map(p => `<div class="di-prow"><div class="row"><span class="small grow">${esc(p.name)}</span><b class="small di-n">${p.sc}</b></div>${hbar(p.sc, 100, 'di-part', `${p.name}: ${p.sc} out of 100`)}</div>`).join('')}</div>
      <div class="xs dim mt8">${r.known} of ${r.parts.length} parts counted${r.parts.some(p => p.sc == null) ? ': ' + r.parts.filter(p => p.sc == null).map(p => esc(p.name.toLowerCase())).join(', ') + ' had no numbers' : ''}. An estimate from what you logged, not a measurement.</div></div>`;
  }
  function weightCard(f) {
    const w = f.weight, p = w.prev, dl = p ? Math.round((w.kg - p.kg) * 10) / 10 : 0;
    const days = []; for (let i = 29; i >= 0; i--) days.push(facts(plus(f.t0, -i), true));
    const L = laneBy('weight'), vals = days.map(x => L.get(x));
    return `<div class="card di-card" id="diWeight">${head('⚖', 'Body weight', p ? `${dl === 0 ? 'the same as' : `${kgTxt(Math.abs(dl))} kg ${dl > 0 ? 'more' : 'less'} than`} ${esc(A.whenText(p.t))}` : 'your first weigh-in', go('openBody', 'Open'))}
      <div class="row di-big"><div class="grow"><span class="di-num">${kgTxt(w.kg)}</span> <span class="small muted">kg</span></div></div>
      ${vals.filter(v => v != null).length > 1 ? `<div class="di-wk"><div class="xs muted">The 30 days to this day · ${esc(laneSub(L, vals, days, true))}</div>${laneSvg(L, vals, days, 29, 84, laneLabel(L, vals, days), true)}</div>` : ''}</div>`;
  }
  // what the day has nothing for, with the way to add it
  function missing(f) {
    const b = [];
    if (recOn() && !f.sleep) b.push(f.isToday && ACT.sleepWatch ? `<button class="chip" data-act="sleepWatch">+ Sleep</button>` : `<button class="chip" data-act="rcSleepForm" data-t="${f.t0}">+ Sleep</button>`);
    if (foodOn() && !f.food) b.push(`<button class="chip" data-act="diFoodOpen" data-t="${f.t0}">+ Food</button>`);
    if (!f.weight && f.isToday) b.push(`<button class="chip" data-act="openBody">+ Body weight</button>`);
    return b.length ? `<div class="row di-miss"><span class="xs muted">Not logged ${f.isToday ? 'yet' : 'on this day'}:</span>${b.join('')}</div>` : '';
  }
  VIEWS.dayx = {
    html(p) {
      const today = day0(Date.now()), t0 = Math.min(day0(+p.t || today), today), f = facts(t0, false), first = firstDay();
      const w = words(f), cls = slide && !calm() ? ` di-in-${slide}` : anim && !calm() ? ' di-anim' : '';
      let h = `<div class="top"><button class="back" data-act="back" aria-label="Back">‹</button><div class="grow"><h1>${esc(f.isToday ? 'Today' : A.fmtDate(t0))}</h1><div class="sub">${esc(/^(Today|Yesterday)$/.test(A.fmtDate(t0)) ? dayLong(t0) : agoText(t0))}</div></div>
          ${f.isToday ? '' : `<button class="chip sm today-pill" data-act="diToday">Today ›</button>`}<button class="btn icon" data-act="diPrev" aria-label="The day before" ${t0 <= first ? 'disabled' : ''}>‹</button><button class="btn icon" data-act="diNext" aria-label="The day after" ${f.isToday ? 'disabled' : ''}>›</button></div>
        <div class="di-day${cls}" id="diDay" data-t="${t0}">`;
      if (!f.any) {
        h += `<div class="empty"><div class="big">🗓</div><h2>Nothing logged ${f.isToday ? 'yet today' : 'on this day'}</h2><p>${f.isToday ? 'As you log a workout, food, sleep or your weight, this page fills in.' : 'Swipe left or right for another day.'}</p></div>${missing(f)}`;
      } else {
        h += `<div class="card di-card di-short" id="diShort"><div class="k2">The day in short</div>${w.map(x => `<div class="di-w"><span class="di-wi" aria-hidden="true">${x[0]}</span><div class="small grow">${x[1]}</div>${f.isToday ? '<div class="mt12"><button class="btn primary" data-act="quickAdd">+ Add something</button></div>' : ''}</div>`).join('')}</div>${ringsRow(f)}`;
        f.ws.forEach((x, i) => { h += workoutCard(x, i); });
        if (f.sleep || f.heart) h += sleepCard(f);
        if (f.food) h += foodCard(f);
        if (f.move || f.sp.length) h += moveCard(f.move ? f : Object.assign({}, f, { move: { steps: 0, burnt: 0, watch: '', base: null, avg: 0, max: 0, min: 0, app: '' } }));
        if (f.ready) h += readyCard(f);
        if (f.weight) h += weightCard(f);
        h += missing(f);
      }
      h += `<button class="btn block di-all" data-act="diOpen">📊 All your days side by side</button></div>`;
      anim = false; slide = '';
      return h;
    },
    mount() { bindSwipe(); }
  };
  function stepDay(d) {
    const el = $('#diDay'); if (!el) return false;
    const t0 = +el.dataset.t, to = plus(t0, d), today = day0(Date.now());
    if (to > today || to < firstDay()) return false;
    slide = d > 0 ? 'r' : 'l'; A.top().params = { t: to }; A.render();
    return true;
  }
  ACT.diToday = () => { const today = day0(Date.now()), el = $('#diDay'); if (!el || +el.dataset.t >= today) return; slide = 'r'; A.top().params = { t: today }; A.render(); };      // 1.33 (20)
  ACT.diPrev = () => { stepDay(-1); };
  ACT.diNext = () => { stepDay(1); };
  ACT.diGo = el => { const c = $('#' + el.dataset.to); if (c) c.scrollIntoView({ behavior: calm() ? 'auto' : 'smooth', block: 'start' }); };
  ACT.diFoodOpen = el => { const C = window.Calories; if (!C || !ACT.openCalories) return; ACT.openCalories(); if (C.setDay && +el.dataset.t) { C.setDay(+el.dataset.t); A.rerender(); } };
  // a sideways swipe on the page: the day follows the finger, then the next (or the one before) slides in
  function bindSwipe() {
    const el = $('#diDay'); if (!el || el.dataset.bound) return; el.dataset.bound = '1';
    let p = null;
    el.addEventListener('pointerdown', e => {
      p = null; if (e.pointerType === 'mouse' || e.button > 0) return;
      if (e.clientX < 28 || e.clientX > window.innerWidth - 28) return;                 // the phone's own back gesture lives at the edges
      if (e.target.closest('input, textarea, select, .ptiles')) return;
      p = { id: e.pointerId, x: e.clientX, y: e.clientY, on: false, dx: 0, t: Date.now() };
    });
    el.addEventListener('pointermove', e => {
      if (!p || e.pointerId !== p.id) return;
      const dx = e.clientX - p.x, dy = e.clientY - p.y;
      if (!p.on) { if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy) * 1.5) return; p.on = true; el.classList.add('di-drag'); el.dataset.swiped = '1'; }
      const t0 = +el.dataset.t, can = dx < 0 ? plus(t0, 1) <= day0(Date.now()) : plus(t0, -1) >= firstDay();
      p.dx = can ? dx : dx / 4;                                                         // the last day pulls back
      if (!calm()) { el.style.transform = `translateX(${p.dx.toFixed(0)}px)`; el.style.opacity = String(Math.max(0.35, 1 - Math.abs(p.dx) / 420)); }
    });
    const end = e => {
      if (!p || (e.pointerId != null && e.pointerId !== p.id)) return; const q = p; p = null;
      if (!q.on) return;
      const fast = Math.abs(q.dx) / Math.max(1, Date.now() - q.t) > 0.5, far = Math.abs(q.dx) > 80 || (fast && Math.abs(q.dx) > 36);
      el.classList.remove('di-drag'); setTimeout(() => { delete el.dataset.swiped; }, 350);
      if (e.type === 'pointerup' && far && stepDay(q.dx < 0 ? 1 : -1)) return;
      el.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s'; el.style.transform = ''; el.style.opacity = '';
      setTimeout(() => { el.style.transition = ''; }, 220);
    };
    el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
    // a swipe is not also a tap on what the finger lifted from
    el.addEventListener('click', e => { if (el.dataset.swiped) { e.stopPropagation(); e.preventDefault(); } }, true);
  }

  // =====================================================================================================
  // Today: the last 7 days
  // =====================================================================================================
  function homeCard() {
    const days = daysBack(7), lanes = lanesOf(days, 3);
    if (!lanes.length) return '';
    const lbl = f => `${f.isToday ? 'Today' : dayLong(f.t0)}: ${gist(f)}`, line = rangeLine(days);
    return `<div class="card di-home" id="diCard"><div class="row"><div class="grow"><div class="k2">Last 7 days</div></div><button class="linkish xs" data-act="diOpen">All insights ›</button></div>
      ${line ? `<div class="xs muted di-hline">${esc(line)}</div>` : ''}
      <div class="di-hl">${lanes.map(({ L, vals }) => `<div class="di-hrow"><button class="xs muted di-hk di-go" data-act="diPage" data-k="${L.k}" aria-label="${L.name}: open its page">${L.name}</button>${laneSvg(L, vals, days, -1, 30, laneLabel(L, vals, days))}</div>`).join('')}
        <div class="di-hrow"><span class="di-hk"></span>${axisSvg(days, 6)}</div>
        <div class="di-hbtns">${days.map(f => `<button data-act="diDay" data-t="${f.t0}" aria-label="${esc(lbl(f))}"></button>`).join('')}</div></div>
      <div class="xs dim mt4">Tap a day to open it.</div></div>`;
  }
  // after the rings and the next workout, before the other cards
  if (window.Today && window.Today.top) { const top0 = window.Today.top; window.Today.top = () => top0() + homeCard(); }

  // 1.33 (37): today's mark for a tile on the Today page: 's' (✓) in the safe zone, 'd' (⚠) in the danger zone, '' neither.
  // Today's food is judged only once its target is reached (a ✓: the day isn't over, so never a ⚠)
  let zKept = null, saves = 0;
  { const save0 = S.save; S.save = function () { saves++; return save0.apply(this, arguments); }; }          // any change starts the marks again
  function zoneNow(k) {
    const L = laneBy(k); if (!L) return '';
    const t0 = day0(Date.now());
    if (!zKept || zKept.t0 !== t0 || zKept.n !== saves || Date.now() - zKept.at > 30000) zKept = { t0, at: Date.now(), n: saves, days: daysBack(7) };
    const days = zKept.days, f = days[days.length - 1], v = L.get(f), z = zonesOf(L, days, L.goal ? (L.goal(days) || 0) : 0);
    if (v == null || !z) return '';
    if (L.soFar) return zin(z.s, v) ? 's' : '';
    return zstat(L, z, f, v);      // 1.35: 'w' too
  }
  // 1.33 (38): how many days of a stretch were in each zone, for the weekly report: [{ name, s, d, n, sTxt, dTxt }]
  function zoneCounts(t0s) {
    const days = t0s.map(t => facts(t, true)), out = [];
    for (const k of ['sleep', 'eaten', 'protein', 'ready']) {
      const L = laneBy(k), z = zonesOf(L, days, L.goal ? (L.goal(days) || 0) : 0); if (!z) continue;
      let sN = 0, wN = 0, dN = 0, n = 0;
      days.forEach(f => { const v = L.get(f); if (v == null || (L.soFar && f.isToday)) return; n++; if (zin(z.d, v)) dN++; else if (zin(z.w, v)) wN++; else if (zin(z.s, v)) sN++; });
      if (n) out.push({ k, name: L.name, s: sN, w: wN, d: dN, n, sTxt: z.sTxt, wTxt: z.wTxt || '', dTxt: z.dTxt });
    }
    return out;
  }
  const zoneMark = k => { const z = zoneNow(k); return z ? ` <span class="di-zs di-zs-${z}" role="img" aria-label="${ZNAME[z]}">${ZIC[z]}</span>` : ''; };
  // 1.33 (10): a chart's name opens the page it comes from
  const GO = { sleep: 'recovery', rest: 'recovery', hrv: 'recovery', ready: 'recovery', weight: 'body', train: 'history', eaten: 'calories', protein: 'calories', steps: 'calories', burnt: 'calories' };
  ACT.diPage = el => {          // (not diGo: that one scrolls a day's page to a card)
    const v = GO[el.dataset.k]; if (!v) return;
    if (v === 'history' || v === 'calories') { if (v === 'calories' && ACT.openCalories) ACT.openCalories(); else A.setRoot(v); } else A.go(v);
  };
  window.Daily = { facts, words, gist, lanesOf, daysBack, LANES, homeCard, openDay, firstDay, usual, rangeStats, rangeWords, rangeLine, laneChart, openAt, zoneNow, zoneMark, zoneCounts, fresh: () => { zKept = null; } };
})();
