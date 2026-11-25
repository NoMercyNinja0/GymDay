/* GymDay 1.23 · the morning readiness score (ready.js).
   One number from 0 to 100 on Today, with what to do about it: go heavy, train as planned, go lighter, or rest.
   It is worked out from what GymDay already knows, each part scored 0–100 and weighed:
     sleep last night against what you need (35%) · how recovered the muscles of your next workout are (30%) ·
     resting heart rate and HRV against your usual (20%) · protein and calories yesterday (15%).
   A part with no data is left out and the others share its weight; the sheet says which parts counted.
   It is an estimate, not a measurement: the sheet says so, and how each part was scored. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { esc, ACT } = A, D = S.data;
  const st = () => D.settings;
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  const fScore = f => (f >= 1 ? 100 : f >= 0.95 ? 70 : 45);           // a recovery factor (1, 0.95, 0.9…) as a score
  const BANDS = [[80, 'Go heavy', 'You are well recovered: a good day to push for a little more.', 'good'], [60, 'Train as planned', 'Solid. Do the workout you planned.', 'ok'],
    [40, 'Go lighter', 'Take a set or two off each exercise, or use a little less weight.', 'low'], [0, 'Rest or keep it easy', 'Sleep, eat and walk today: you will get more from tomorrow.', 'rest']];
  const bandOf = sc => BANDS.find(b => sc >= b[0]);

  // 1.31: opt.day = the day whose muscles count (a past day's own workout; null = every body part). Without it: the next workout.
  function readiness(now, opt) {
    const P = window.Progress, C = window.Calories; if (!P || st().recovery === false) return null;
    now = now || Date.now();
    const t0 = day0(now), parts = [];
    // sleep
    const sl = P.sleepOf ? P.sleepOf(t0) : null, need = P.sleepNeed ? P.sleepNeed(C && C.ageNow ? C.ageNow() : 0) : 7;
    if (sl && sl.min > 0) { const r = sl.min / (need * 60), sc = Math.round(r >= 1 ? 100 : Math.max(10, 100 - (1 - r) * 160)); parts.push({ k: 'sleep', w: 35, sc, name: 'Sleep', text: `${hm(sl.min)} of the ${need} h you need`, how: 'Full marks for the hours you need; every 10% short takes 16 points off.' }); }
    else parts.push({ k: 'sleep', w: 35, sc: null, name: 'Sleep', text: 'not added for last night', how: 'Add last night\'s sleep to count it.', add: 'todaySleep' });
    // the muscles of the next workout (or all of them)
    if (P.recovery && D.sessions.length) {
      const g = P.groupRecovery(P.recovery(now)), T = window.Today, I = window.Insights, nd = opt && 'day' in opt ? opt.day : T && T.nextDay ? T.nextDay() : null;
      let names = [];
      if (nd && I && I.partsOf) nd.items.forEach(it => { const ex = S.getEx(it.ex); if (ex) I.partsOf(ex).main.forEach(n => { if (g[n] && !names.includes(n)) names.push(n); }); });
      const forDay = names.length > 0; if (!forDay) names = Object.keys(g);
      const sc = Math.round(names.reduce((a, n) => a + g[n].pct, 0) / names.length), low = names.slice().sort((a, b) => g[a].pct - g[b].pct).slice(0, 3);
      parts.push({ k: 'muscles', w: 30, sc, name: forDay ? `Muscles for ${nd.name}` : 'Muscles', text: low.map(n => `${n} ${g[n].pct}%`).join(' · '), how: forDay ? 'The average recovery of the body parts your next workout trains.' : 'The average recovery of all body parts.', open: 'openRecovery' });
    }
    // heart and food, from the same factors Recovery uses
    const fx = P.factors ? P.factors(now).list : [], heart = fx.find(x => x.k === 'heart'), pr = fx.find(x => x.k === 'protein'), kc = fx.find(x => x.k === 'kcal');
    if (heart && heart.tone !== 'none') parts.push({ k: 'heart', w: 20, sc: fScore(heart.f), name: 'Heart', text: heart.t.replace(/^Heart: /, ''), how: 'Full marks at about your usual. A resting heart rate 4 or more above it, or HRV at 80% of it or less, takes points off.' });
    else if (!window.Watch || window.Watch.on()) parts.push({ k: 'heart', w: 20, sc: null, name: 'Heart', text: 'no resting heart rate or HRV for today, or too few days to know your usual', how: 'Add your watch\'s numbers in Sleep & heart to count them.', add: 'todaySleep' });      // 1.33: no watch, no heart part
    const food = [pr, kc].filter(x => x && x.tone !== 'none' && /^(Protein|Calories): \d/.test(x.t));
    if (food.length) parts.push({ k: 'food', w: 15, sc: Math.round(food.reduce((a, x) => a + fScore(x.f), 0) / food.length), name: 'Food', text: food.map(x => x.t.replace(/^Calories: /, '').replace(/^Protein: /, 'protein ')).join(' · '), how: 'Full marks when you ate about what your body uses and reached your protein; points off when well under.' });
    else parts.push({ k: 'food', w: 15, sc: null, name: 'Food', text: 'no food logged yesterday', how: 'Log your food to count it.' });
    const known = parts.filter(p => p.sc != null); if (!known.length) return null;
    const wsum = known.reduce((a, p) => a + p.w, 0), score = Math.round(known.reduce((a, p) => a + p.sc * p.w, 0) / wsum), b = bandOf(score);
    return { score, parts, known: known.length, advice: b[1], say: b[2], tone: b[3], wsum };
  }
  ACT.readyOpen = () => {
    const r = readiness(); if (!r) return;
    const T = window.Today, share = p => Math.round(p.w / r.wsum * 100);
    A.openSheet(`<h2>Readiness</h2><div class="rd-top"><div class="rd-ring">${T ? T.ring(r.score / 100, 104, 10, 'tr-ready rd-' + r.tone) : ''}<div class="rd-n">${r.score}</div></div><div class="grow"><div class="rd-adv rd-${r.tone}">${esc(r.advice)}</div><p class="small">${esc(r.say)}</p></div></div>
      <div class="k2 mt16 mb8">What it is made of</div>
      ${r.parts.map(p => `<div class="rd-p ${p.sc == null ? 'off' : ''}"><div class="row"><b class="small grow">${esc(p.name)}</b><span class="small rd-s">${p.sc == null ? 'not counted' : p.sc + ' / 100 · ' + share(p) + '% of the score'}</span></div>
        ${p.sc == null ? '' : `<div class="rd-bar"><i style="width:${p.sc}%"></i></div>`}<div class="xs muted">${esc(p.text)}</div><div class="xs dim">${esc(p.how)}</div>
        ${p.add ? `<button class="btn sm mt8" data-act="readyGo" data-to="${p.add}">Add it</button>` : ''}${p.open ? `<button class="btn sm mt8" data-act="readyGo" data-to="${p.open}">See each muscle ›</button>` : ''}</div>`).join('')}
      <p class="xs dim mt12">${r.known} of ${r.parts.length} parts counted: each part is scored out of 100, weighed, and added up. 80 and over: go heavy. 60 to 79: train as planned. 40 to 59: go lighter. Under 40: rest. It is an estimate from what you logged, not a measurement, so trust how you feel over the number.</p>
      <button class="btn primary block mt16" data-act="closeSheet">Got it</button>`);
  };
  ACT.readyGo = el => { const f = ACT[el.dataset.to]; A.closeSheet(); if (f) f(el); };
  window.Ready = { readiness, bandOf };
})();
