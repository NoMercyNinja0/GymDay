/* GymDay 1.23 · Patterns and goal dates (patterns.js).
   Patterns: things in your own log that are easy to miss, worked out on the phone from what you logged, each with the
   numbers behind it and how it was worked out: protein or calories that change at weekends, how often the protein target
   was reached, short sleep, a lift going up, lifts that are stuck, body parts out of balance, weeks the goal was reached,
   days with no food logged. Each needs a minimum of data before it speaks. A card on Today shows the first two;
   History → Progress has the whole list. Switch: Settings → More features → Progress → Patterns.
   Goal dates: "at this pace, 72 kg around 14 Jan" from the trend of your weigh-ins (Body weight page; a goal weight is
   settings.goalKg), and for each lift goal on its exercise page. No dates for losing weight under 18, nor for a goal
   under a healthy weight for your height. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc, ACT, VIEWS } = A, D = S.data, DAY = 86400000;
  const st = () => D.settings, num = A.num;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US'), r1 = v => Math.round(v * 10) / 10;
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const back = (t0, n) => { const d = new Date(t0); d.setDate(d.getDate() - n); return d.getTime(); };
  const hm = h => { const m = Math.round(h * 60); return `${Math.floor(m / 60)} h${m % 60 ? ' ' + (m % 60) + ' min' : ''}`; };
  const dm = t => { const d = new Date(t); return `${d.getDate()} ${A.MONTHS_LONG[d.getMonth()].slice(0, 3)}${d.getFullYear() !== new Date().getFullYear() ? ' ' + d.getFullYear() : ''}`; };
  const on = () => st().patterns !== false;
  const calOn = () => !!(window.Calories && window.Calories.on && window.Calories.on());
  // the slope of a straight line through the points, per day (least squares); null with fewer than 2 different days
  function slope(pts) {
    const n = pts.length; if (n < 2) return null;
    const mx = pts.reduce((a, p) => a + p.t, 0) / n, my = pts.reduce((a, p) => a + p.v, 0) / n;
    let sxx = 0, sxy = 0; for (const p of pts) { sxx += (p.t - mx) * (p.t - mx); sxy += (p.t - mx) * (p.v - my); }
    return sxx > 0 ? sxy / sxx * DAY : null;
  }

  // ---------------- the days' food, straight from the log ----------------
  function foodDays(n) {
    const t0 = day0(Date.now()), out = [];
    for (let i = 1; i <= n; i++) {
      const a = back(t0, i), b = back(t0, i - 1); let kcal = 0, p = 0, c = 0;
      for (const e of D.food) if (e.t >= a && e.t < b) { kcal += e.kcal || 0; p += e.p || 0; c++; }
      out.push({ t: a, kcal, p, logged: c >= 2 || kcal >= 800, wd: new Date(a).getDay() });
    }
    return out;
  }
  const avg = (list, k) => (list.length ? list.reduce((a, x) => a + x[k], 0) / list.length : 0);

  // ---------------- each pattern: null, or { id, tone: fix | good | info, ic, t, x, how, go: [label, action] } ----------------
  const RULES = [
    function proteinWeekend() {
      if (!calOn()) return null;
      const d = foodDays(28).filter(x => x.logged), we = d.filter(x => x.wd === 0 || x.wd === 6), wk = d.filter(x => x.wd > 0 && x.wd < 6);
      if (we.length < 3 || wk.length < 6) return null;
      const a = avg(we, 'p'), b = avg(wk, 'p'); if (!(b > 0) || a > b * 0.85 || b - a < 10) return null;
      return { id: 'pwe', tone: 'fix', ic: '🥚', t: 'Protein drops at weekends', x: `About ${n0(a)} g on Saturdays and Sundays against ${n0(b)} g on weekdays.`,
        how: `The average protein on days with food logged in the last 4 weeks: ${we.length} weekend days and ${wk.length} weekdays. Shown when weekends are 15% or more lower (and at least 10 g).`, go: ['Open Food', 'openCalories'] };
    },
    function kcalWeekend() {
      if (!calOn()) return null;
      const d = foodDays(28).filter(x => x.logged), we = d.filter(x => x.wd === 0 || x.wd === 6), wk = d.filter(x => x.wd > 0 && x.wd < 6);
      if (we.length < 3 || wk.length < 6) return null;
      const a = avg(we, 'kcal'), b = avg(wk, 'kcal'); if (!(b > 0) || Math.abs(a - b) < 200 || (a < b * 1.15 && a > b * 0.85)) return null;
      return { id: 'kwe', tone: 'info', ic: '📆', t: a > b ? 'You eat more at weekends' : 'You eat less at weekends', x: `About ${n0(a)} kcal on Saturdays and Sundays against ${n0(b)} on weekdays.`,
        how: `The average calories on days with food logged in the last 4 weeks: ${we.length} weekend days and ${wk.length} weekdays. Shown when the two differ by 15% or more. Neither is wrong: it is worth knowing when your weight is not moving the way you want.`, go: ['Open Food', 'openCalories'] };
    },
    function proteinHit() {
      const F = window.Food; if (!calOn() || !F || !F.targets) return null;
      const tg = F.targets(day0(Date.now())); if (!tg || !(tg.p > 0)) return null;
      const d = foodDays(14).filter(x => x.logged); if (d.length < 5) return null;
      const hit = d.filter(x => x.p >= tg.p * 0.95).length, r = hit / d.length;
      if (r >= 0.8) return { id: 'phi', tone: 'good', ic: '💪', t: 'Protein target reached most days', x: `On ${hit} of the last ${d.length} days you logged (target ${n0(tg.p)} g).`, how: 'A day counts when its protein is within 5% of your target or over it. Days with no food logged are left out.', go: ['Open Food', 'openCalories'] };
      if (r <= 0.4) return { id: 'plo', tone: 'fix', ic: '🥚', t: 'Protein target missed most days', x: `Reached on ${hit} of the last ${d.length} days you logged (target ${n0(tg.p)} g, average ${n0(avg(d, 'p'))} g).`, how: 'A day counts when its protein is within 5% of your target or over it. Days with no food logged are left out.', go: ['What should I eat?', 'kcWhatNow'] };
      return null;
    },
    function sleep() {
      const P = window.Progress, C = window.Calories; if (!P || !P.sleepOf || st().recovery === false) return null;
      const t0 = day0(Date.now()), need = P.sleepNeed ? P.sleepNeed(C && C.ageNow ? C.ageNow() : 0) : 7, hrs = [];
      for (let i = 0; i < 14; i++) { const s = P.sleepOf(back(t0, i)); if (s && s.min > 0) hrs.push(s.min / 60); }
      if (hrs.length < 5) return null;
      const a = hrs.reduce((x, y) => x + y, 0) / hrs.length, short = hrs.filter(h => h < need).length;
      if (a <= need - 0.5) return { id: 'slp', tone: 'fix', ic: '😴', t: 'Short on sleep', x: `${hm(a)} a night on average; you need ${need} h. Under it on ${short} of ${hrs.length} nights.`, how: `The nights with sleep added in the last 14 days, against the ${need} hours advised for your age. Shown when the average is half an hour or more short.`, go: ['Sleep & heart', 'openRecovery'] };
      if (a >= need) return { id: 'slg', tone: 'good', ic: '😴', t: 'Sleeping enough', x: `${hm(a)} a night on average over ${hrs.length} nights (you need ${need} h).`, how: `The nights with sleep added in the last 14 days, against the ${need} hours advised for your age.`, go: ['Sleep & heart', 'openRecovery'] };
      return null;
    },
    function liftUp() {
      const now = Date.now(), a = now - 28 * DAY, b = now - 56 * DAY, per = {};
      for (const s of D.sessions) {
        if (s.start < b || s.keep === false) continue;
        for (const it of s.items) { if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex || ex.track !== 'weight') continue;
          let best = 0; for (const x of (it.sets || [])) if (S.work(x) && A.okForE(x)) best = Math.max(best, A.e1rm(num(x.w), num(x.r)));
          if (!best) continue; const p = per[ex.id] || (per[ex.id] = { ex, r: 0, rn: 0, p: 0, pn: 0 });
          if (s.start >= a) { p.rn++; p.r = Math.max(p.r, best); } else { p.pn++; p.p = Math.max(p.p, best); } }
      }
      const up = Object.values(per).filter(p => p.rn >= 2 && p.pn >= 1 && p.r >= p.p * 1.04).sort((x, y) => y.r / y.p - x.r / x.p)[0];
      if (!up) return null;
      return { id: 'lup', tone: 'good', ic: '📈', t: `${up.ex.name} is going up`, x: `Up ${Math.round((up.r / up.p - 1) * 100)}% in 4 weeks: estimated one-rep max ${A.fmtW(Math.round(up.p * 2) / 2)} → ${A.fmtW(Math.round(up.r * 2) / 2)} ${A.unit()}.`,
        how: 'Your strongest set (weight × (1 + reps ÷ 30), sets of 1 to 12 reps) in the last 4 weeks against the 4 weeks before. The lift that rose the most is shown, from 4% up.', go: ['Open it', 'openEx', up.ex.id] };
    },
    function stuck() {
      const X = window.Extras; if (!X || !X.stuckList) return null;
      const l = X.stuckList(true); if (!l.length) return null;
      return { id: 'stk', tone: 'fix', ic: '🧱', t: l.length === 1 ? `${l[0].ex.name} is stuck` : `${l.length} lifts are stuck`, x: `${l.slice(0, 3).map(p => p.ex.name).join(', ')}${l.length > 3 ? '…' : ''}: no better set in 4 weeks.`,
        how: 'Done at least 3 times in the last 4 weeks with no set stronger than in the 8 weeks before. Try fewer reps with a little more weight for two weeks, or one lighter week, then come back to it.', go: ['Open it', 'openEx', l[0].ex.id], home: false };
    },
    function balance() {
      const P = window.Progress; if (!P || !P.balance) return null;
      const b = P.balance(28), off = b.pairs.filter(p => p.off)[0]; if (!off || b.n < 6) return null;
      return { id: 'bal', tone: 'fix', ic: '⚖️', t: `Falling behind: ${(off.x >= off.y ? off.b : off.a).toLowerCase()}`, x: off.text, how: `Ticked working sets in your last 4 weeks (${b.n} workouts): ${off.a} ${r1(off.x)}, ${off.b} ${r1(off.y)}. A set counts 1 for each part its exercise is for and ½ for the parts that help.`, go: ['Open Balance', 'openBalance'] };
    },
    function weeks() {
      const g = st().weekGoal == null ? 3 : +st().weekGoal || 0; if (!g) return null;
      const now = Date.now(); let hit = 0, n = 0; const counts = [];
      for (let w = 1; w <= 6; w++) { const a = A.weekStartOf(now, w), z = A.weekStartOf(now, w - 1), c = A.doneIn(a, z); counts.push(c); n++; if (c >= g) hit++; }
      if (D.sessions.length < 4 || !D.sessions.some(s => s.start < A.weekStartOf(now, 5))) return null;      // needs 6 weeks of history
      if (hit >= 5) return { id: 'wkg', tone: 'good', ic: '🔥', t: 'You keep showing up', x: `Weekly goal of ${g} reached in ${hit} of the last 6 weeks.`, how: 'The six full weeks before this one, Monday to Sunday.', go: ['Open History', 'root:history'] };
      if (hit <= 2) { const med = counts.slice().sort((x, y) => x - y)[2]; return { id: 'wkl', tone: 'fix', ic: '🗓', t: 'The weekly goal is rarely reached', x: `Reached in ${hit} of the last 6 weeks. You usually do ${med} a week${med >= 1 && med < g ? `: a goal of ${med} may fit better for now` : ''}.`, how: 'The six full weeks before this one, Monday to Sunday. A goal you reach most weeks keeps a streak going; raise it once it is easy.', go: ['Change the goal', 'goalEdit'] }; }
      return null;
    },
    function gaps() {
      if (!calOn()) return null;
      const d28 = foodDays(28), d7 = d28.slice(0, 7), miss = d7.filter(x => !x.logged).length;
      if (d28.filter(x => x.logged).length < 7 || miss < 3) return null;
      return { id: 'gap', tone: 'info', ic: '📝', t: 'Some days have no food logged', x: `${miss} of the last 7 days. Averages and patterns only count the days you logged.`, how: 'A day counts as logged with two or more foods, or 800 kcal or more.', go: ['Open Food', 'openCalories'] };
    },
  ];
  const ORDER = { fix: 0, good: 1, info: 2 };
  let memo = null, memoKey = '';
  function all(force) {
    if (!on()) return [];
    const key = [D.food.length, D.sessions.length, (D.checks || []).length, (D.body || []).length, st().weekGoal, st().kcal, Math.floor(Date.now() / 600000)].join('|');
    if (!force && memo && key === memoKey) return memo;
    const out = []; for (const f of RULES) { try { const r = f(); if (r) out.push(r); } catch (e) { /* one rule failing never hides the others */ } }
    out.sort((a, b) => ORDER[a.tone] - ORDER[b.tone]);
    memo = out; memoKey = key; return out;
  }
  const run = go => { if (!go) return; const [, act, arg] = go; A.closeSheet(); if (act.startsWith('root:')) A.setRoot(act.slice(5)); else if (act === 'openEx') A.go('exercise', { id: arg }); else if (ACT[act]) ACT[act]({ dataset: {} }); };
  const itemHtml = (p, act) => `<div class="list-item tap pat-it pat-${p.tone}" data-act="${act}" data-id="${p.id}"><span class="pat-ic" aria-hidden="true">${p.ic}</span><div class="grow" style="min-width:0"><div class="small" style="font-weight:700">${esc(p.t)}</div><div class="xs muted">${esc(p.x)}</div></div><span class="chev">›</span></div>`;
  function homeCard() {
    const list = all().filter(p => p.home !== false); if (!list.length) return '';
    return `<div class="card" id="patCard"><div class="row"><div class="k2 grow">Patterns</div><span class="xs accent" data-act="patOpen" role="button" tabindex="0">See all ${all().length} ›</span></div>${list.slice(0, 2).map(p => itemHtml(p, 'patWhy')).join('')}</div>`;
  }
  ACT.patOpen = () => A.go('patterns');
  ACT.patWhy = el => {
    const p = all().find(x => x.id === el.dataset.id); if (!p) return;
    A.openSheet(`<div class="here-h"><span class="here-ic" aria-hidden="true">${p.ic}</span><h2>${esc(p.t)}</h2></div><p>${esc(p.x)}</p><div class="k2 mt16 mb8">How it is worked out</div><p class="small muted">${esc(p.how)}</p>
      <div class="row mt16">${p.go ? `<button class="btn grow" data-act="patGo" data-id="${p.id}">${esc(p.go[0])}</button>` : ''}<button class="btn primary grow" data-act="closeSheet">Got it</button></div>`);
  };
  ACT.patGo = el => { const p = all().find(x => x.id === el.dataset.id); if (p) run(p.go); };
  VIEWS.patterns = {
    html() {
      const list = all(true), sec = (tone, title) => { const l = list.filter(p => p.tone === tone); return l.length ? `<div class="sec-h"><span>${title}</span><span class="sec-n">${l.length}</span></div><div class="card pat-g">${l.map(p => itemHtml(p, 'patWhy')).join('')}</div>` : ''; };
      const g = goalLines();
      return `<div class="top"><button class="back" data-act="back" aria-label="Back">‹</button><div class="grow"><h1>Patterns</h1><div class="sub">From your own log, worked out on this phone</div></div></div>
        ${!on() ? `<div class="empty"><p>Patterns are switched off.</p><p class="small muted mt8">Settings → More features → Progress → Patterns.</p><div class="mt12"><button class="btn primary" data-act="setGo" data-p="extras">Open More features</button></div></div>` : list.length || g ? sec('fix', 'Worth a look') + sec('good', 'Going well') + sec('info', 'Good to know') + g
          : `<div class="empty"><div class="big">🔎</div><p>Nothing to show yet.</p><p class="small muted mt8">Patterns appear after about two weeks of workouts, food or sleep: each one needs enough days before it says anything.</p></div>`}
        <p class="xs dim" style="text-align:center;margin-top:14px">Tap one to see its numbers and how it was worked out. Nothing here leaves your phone.</p>`;
    }
  };

  // ---------------- goal dates ----------------
  const toKg = v => (A.unit() === 'lb' ? v * 0.45359237 : v);
  // body weight: { kind: none | few | date | flat | away | noDate, … }
  function weightEta() {
    const goal = num(st().goalKg); if (!(goal > 0)) return { kind: 'none' };
    const now = Date.now(), all = (D.body || []).filter(b => b.t <= now + 60000).sort((a, b) => a.t - b.t), last = all[all.length - 1];
    if (!last) return { kind: 'few', goal };
    const C = window.Calories, age = C && C.ageNow ? C.ageNow() : 0, h = num((st().me || {}).h), cur = last.kg, losing = goal < cur - 0.05;
    if (Math.abs(goal - cur) <= 0.05) return { kind: 'there', goal, cur };
    if (losing && age > 0 && age < 18) return { kind: 'noDate', goal, cur, why: 'GymDay does not give dates for losing weight while you are still growing. A doctor or dietitian can say what a healthy weight is for you.' };
    if (losing && h > 0 && !(age > 0 && age < 18) && toKg(goal) / Math.pow(h / 100, 2) < 18.5) return { kind: 'noDate', goal, cur, why: 'That goal is under the healthy range for your height (a BMI below 18.5), so GymDay gives no date for it.' };
    const pts = all.filter(b => b.t >= now - 28 * DAY).map(b => ({ t: b.t, v: b.kg }));
    if (pts.length < 4 || pts[pts.length - 1].t - pts[0].t < 10 * DAY) return { kind: 'few', goal, cur, n: pts.length };
    const perWeek = slope(pts) * 7, need = goal - cur, toward = need > 0 ? perWeek : -perWeek;
    if (Math.abs(perWeek) < 0.05) return { kind: 'flat', goal, cur, perWeek, n: pts.length };
    if (toward <= 0) return { kind: 'away', goal, cur, perWeek, n: pts.length };
    const weeks = Math.abs(need) / toward, fast = need > 0 ? perWeek > 0.5 * (A.unit() === 'lb' ? 2.2046 : 1) : -perWeek > cur * 0.01;
    return { kind: 'date', goal, cur, perWeek, weeks, at: now + weeks * 7 * DAY, far: weeks > 104, fast, gain: need > 0, n: pts.length };
  }
  function weightLine() {
    const e = weightEta(), u = A.unit(), sg = v => (v > 0 ? '+' : '−') + A.fmtW(Math.abs(r1(v)));
    if (e.kind === 'none') return '';
    if (e.kind === 'there') return `You are at your goal weight of <b>${A.fmtW(e.goal)} ${u}</b> 🎉`;
    if (e.kind === 'noDate') return esc(e.why);
    if (e.kind === 'few') return `Goal <b>${A.fmtW(e.goal)} ${u}</b>. Weigh yourself at least 4 times over 10 days or more and GymDay will say when you would reach it.`;
    if (e.kind === 'flat') return `Goal <b>${A.fmtW(e.goal)} ${u}</b>. Your weight has been steady over the last 4 weeks, so at this pace it is not getting closer.`;
    if (e.kind === 'away') return `Goal <b>${A.fmtW(e.goal)} ${u}</b>. Your weight is moving the other way (${sg(e.perWeek)} ${u} a week over the last 4 weeks), so at this pace it is not getting closer.`;
    return `At this pace (${sg(e.perWeek)} ${u} a week over your last ${e.n} weigh-ins) you reach <b>${A.fmtW(e.goal)} ${u}</b> ${e.far ? 'in more than two years' : `around <b>${dm(e.at)}</b>`}.${e.fast ? (e.gain ? ' That is quick: slower gain is usually more muscle and less fat.' : ' That is quick: slower is easier to keep.') : ''}`;
  }
  // a lift's goal: from the heaviest working set of each workout in the last 8 weeks
  function liftEta(id) {
    const g = (D.ex[id] || {}).goal; if (!g || !(g.w > 0)) return { kind: 'none' };
    const cur = (A.recordsFor(id).w || {}).v || 0; if (cur >= g.w) return { kind: 'there' };
    const now = Date.now(), pts = S.sessionsFor(id).filter(r => r.session.keep !== false && r.session.start >= now - 56 * DAY).map(r => ({ t: r.session.start, v: Math.max(0, ...r.sets.map(x => num(x.w))) })).filter(p => p.v > 0).reverse();
    if (pts.length < 4 || pts[pts.length - 1].t - pts[0].t < 14 * DAY) return { kind: 'few', n: pts.length };
    const perWeek = slope(pts) * 7; if (!(perWeek >= 0.1 * (A.unit() === 'lb' ? 2.2 : 1))) return { kind: 'flat', perWeek, n: pts.length };
    const weeks = (g.w - cur) / perWeek;
    return { kind: 'date', perWeek, weeks, at: now + weeks * 7 * DAY, far: weeks > 104, n: pts.length, late: g.by ? Math.round((now + weeks * 7 * DAY - g.by) / DAY) : null };
  }
  function liftLine(id) {
    const e = liftEta(id), u = A.unit();
    if (e.kind === 'none' || e.kind === 'there') return '';
    if (e.kind === 'few') return 'Do this exercise in 4 workouts over 2 weeks or more and GymDay will say when you would reach the goal.';
    if (e.kind === 'flat') return `Your heaviest set has not been rising over your last ${e.n} workouts, so at this pace the goal is not getting closer.`;
    return `At this pace (+${A.fmtW(r1(e.perWeek))} ${u} a week over your last ${e.n} workouts) ${e.far ? 'in more than two years' : `around <b>${dm(e.at)}</b>`}${e.late == null || e.far ? '' : e.late > 3 ? `, ${e.late} days after your date` : e.late < -3 ? `, ${-e.late} days ahead of your date` : ', right on your date'}.`;
  }
  function goalLines() {
    const rows = [], w = weightLine(); if (w) rows.push(`<div class="list-item tap pat-it" data-act="openBody"><span class="pat-ic" aria-hidden="true">⚖</span><div class="grow" style="min-width:0"><div class="small" style="font-weight:700">Body weight</div><div class="xs muted">${w}</div></div><span class="chev">›</span></div>`);
    Object.keys(D.ex).filter(id => D.ex[id].goal && S.getEx(id)).forEach(id => { const l = liftLine(id); if (l) rows.push(`<div class="list-item tap pat-it" data-act="openEx" data-id="${esc(id)}"><span class="pat-ic" aria-hidden="true">🎯</span><div class="grow" style="min-width:0"><div class="small" style="font-weight:700">${esc(S.getEx(id).name)} → ${A.fmtW(D.ex[id].goal.w)} ${A.unit()}</div><div class="xs muted">${l}</div></div><span class="chev">›</span></div>`); });
    return rows.length ? `<div class="sec-h"><span>Goal dates</span><span class="sec-n">${rows.length}</span></div><div class="card pat-g">${rows.join('')}</div>` : '';
  }
  // the goal weight on the Body weight page
  function bodyGoalCard() {
    const g = num(st().goalKg), line = weightLine();
    return `<div class="card" id="goalKgCard"><div class="row"><div class="grow"><h3>Goal weight</h3>${g > 0 ? '' : `<div class="xs muted mt4">Set one and GymDay says when you would reach it at your pace.</div>`}</div>${g > 0 ? `<button class="btn sm ghost" data-act="goalKgSet">Change</button>` : `<button class="btn sm" data-act="goalKgSet">Set a goal</button>`}</div>${line ? `<p class="small mt8 goal-eta">${line}</p><p class="xs dim mt4">A straight line through your weigh-ins of the last 4 weeks. One weigh-in can swing a kilo with water and food, so the date moves as you log.</p>` : ''}</div>`;
  }
  ACT.goalKgSet = () => { const g = num(st().goalKg); A.openSheet(`<h2>Goal weight</h2><p class="small muted">The weight you are working towards. GymDay only uses it to say when you would get there at your pace.</p>
    <div class="row mt12" style="gap:10px"><input class="input grow" id="goalKgIn" type="number" inputmode="decimal" step="any" placeholder="Goal in ${A.unit()}" value="${g > 0 ? g : ''}"><button class="btn primary" data-act="goalKgSave">Save</button></div>${g > 0 ? `<button class="btn ghost block mt12" data-act="goalKgDel">Remove the goal</button>` : ''}`, sh => { const i = sh.querySelector('#goalKgIn'); if (i) setTimeout(() => i.focus(), 200); }); };
  ACT.goalKgSave = () => { const v = num(($('#goalKgIn') || {}).value), lb = A.unit() === 'lb'; if (!(v >= (lb ? 55 : 25) && v <= (lb ? 550 : 250))) { window.toast('Type the weight you are aiming for'); return; } st().goalKg = Math.round(v * 10) / 10; S.save(true); A.closeSheet(); A.rerender(); window.toast('Goal weight saved'); };
  ACT.goalKgDel = () => { delete st().goalKg; S.save(true); A.closeSheet(); A.rerender(); window.toast('Goal weight removed'); };

  // ---------------- where they show ----------------
  const I = window.Insights;
  if (I) { const home0 = I.homeCards; I.homeCards = () => home0() + homeCard(); }
  const body0 = VIEWS.body && VIEWS.body.html;
  if (body0) VIEWS.body.html = function (p) { const h = body0.call(this, p), i = h.indexOf('<div class="card">', h.indexOf('id="bodyIn"')); return i > 0 ? h.slice(0, i) + bodyGoalCard() + h.slice(i) : h + bodyGoalCard(); };
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => `<div class="row" style="padding:6px 0"><div class="grow">Patterns<div class="xs dim">Spots things in your log that are easy to miss, like protein dropping at weekends or a lift going up, with the numbers behind each</div></div><input type="checkbox" data-bind="optPatterns" ${on() ? 'checked' : ''} style="width:22px;height:22px"></div>`);
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optPatterns') { st().patterns = t.checked; memo = null; S.save(true); window.toast(t.checked ? 'Patterns are on' : 'Patterns are off'); } });

  window.Patterns = { all, slope, weightEta, weightLine, liftEta, liftLine, homeCard, foodDays };
})();
