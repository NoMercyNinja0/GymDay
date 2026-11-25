/* GymDay – reading your training:
   76 recovery: how recovered each part of each muscle is (an estimate from sets, effort and time passed),
   78 balance: push against pull, upper body against legs, and parts of a muscle against each other over 4 weeks,
   79 body measurements,
   80 strength level per lift (a rough guide from your best lift and your body weight),
   73 a reminder to take an easier week after several hard ones, and an "easy week" that halves the sets. */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta, I = window.Insights, F = window.BodyFig;
  const { $, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  const DAY = 86400000, HOUR = 3600000;
  const st = () => D.settings;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const fmt1 = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  window.SettingsRows = window.SettingsRows || [];
  const sw = (bind, on, title, sub) => `<div class="row" style="padding:6px 0"><div class="grow">${title}<div class="xs dim">${sub}</div></div><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;
  const top = (title, sub) => `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${title}</h1><div class="sub">${sub}</div></div></div>`;

  // =====================================================================================================
  // 76 Recovery (v1.13: also sleep, how sore you feel, protein and calories, resting heart rate and HRV, and age)
  // =====================================================================================================
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const back = (t, n) => { const d = new Date(t); return new Date(d.getFullYear(), d.getMonth(), d.getDate() - n).getTime(); };
  const checkOf = t => (D.checks || []).find(c => c.d === keyOf(t)) || null;          // one a day: { id, d, sleep, sby, sscore, deep, rem, rest, hrv, sapp, sore }
  const actOf = t => (D.acts || []).find(a => a.d === keyOf(t)) || null;              // the day's screenshots on the Food tab
  function checkFor(t) { let c = checkOf(t); if (!c) { c = { id: 'chk-' + keyOf(t).replace(/-/g, ''), d: keyOf(t) }; (D.checks = D.checks || []).push(c); } return c; }
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  // last night: typed here or read from sleep screenshots, else the sleep on the day's screenshots (Food tab)
  function sleepOf(t) {
    const c = checkOf(t), a = actOf(t);
    // v1.21.11: also light sleep, time awake, bedtime and wake time (minutes after midnight), blood oxygen and breathing rate
    if (c && c.sleep > 0) return { min: c.sleep, by: c.sby || 'you', score: c.sscore || 0, deep: c.deep || 0, rem: c.rem || 0, light: c.light || 0, awake: c.awake || 0,
      bed: c.bed != null ? c.bed : null, wake: c.wake != null ? c.wake : null, app: c.sapp || '' };
    if (a && a.sleep > 0) return { min: a.sleep, by: 'watch', score: a.sscore || 0, deep: 0, rem: 0, light: 0, awake: 0, bed: null, wake: null, app: a.app || '' };
    return null;
  }
  // v1.21.11: everything for one night (the morning it ended): sleep, its stages, the heart, blood oxygen and breathing
  function nightOf(t) {
    const c = checkOf(t) || {}, sl = sleepOf(t);
    return { sl, rest: restOn(t), hrv: hrvOn(t), spo2: wOn() ? c.spo2 || 0 : 0, br: wOn() ? c.br || 0 : 0 };
  }
  // 1.33: with the watch switched off (watch.js) there are no heart numbers to show or to score; the saved ones stay where they are
  const restOn = t => { if (!wOn()) return 0; const c = checkOf(t), a = actOf(t); return (c && c.rest) || (a && a.rest) || 0; };
  const hrvOn = t => { if (!wOn()) return 0; const c = checkOf(t), a = actOf(t); return (c && c.hrv) || (a && a.hrv) || 0; };
  // your usual: the middle reading of the 14 days before (at least 3 readings)
  function usual(get, t) {
    const v = []; for (let i = 1; i <= 14; i++) { const x = get(back(t, i)); if (x > 0) v.push(x); }
    if (v.length < 3) return 0; v.sort((a, b) => a - b); const m = v.length >> 1; return v.length % 2 ? v[m] : (v[m - 1] + v[m]) / 2;
  }
  // the American Academy of Sleep Medicine: 9 to 12 hours from 6 to 12, 8 to 10 from 13 to 18, at least 7 for adults
  const sleepNeed = age => (age && age < 13 ? 9 : age && age < 18 ? 8 : 7);
  // each factor: { k, f: the pace it allows (1 = your usual, 0.9 = a tenth slower), tone: good | slow | none, t: what it is, w: what it means }
  function factors(now) {
    now = now || Date.now();
    const t0 = day0(now), C = window.Calories, Fd = window.Food, out = [], age = C && C.ageNow ? C.ageNow() : 0;
    const need = sleepNeed(age), sl = sleepOf(t0);
    if (sl) {
      // a night without sleep cut muscle-building by 18% in one study (Lamon and others, 2021), so even a very short night slows things by under a fifth
      const short = need - sl.min / 60, f = short <= 0.25 ? 1 : short <= 1 ? 0.95 : short <= 2 ? 0.9 : short <= 4 ? 0.85 : 0.82;
      out.push({ k: 'sleep', f, tone: f < 1 ? 'slow' : 'good', t: `Sleep: ${hm(sl.min)}${sl.score ? ` (sleep score ${sl.score})` : ''}`,
        w: f < 1 ? `under the ${need} hours ${age && age < 18 ? 'a teenager needs' : 'you need'}: muscles rebuild more slowly after a short night` : `${need} hours or more: what recovery needs` });
    } else out.push({ k: 'sleep', f: 1, tone: 'none', t: 'Sleep: not answered yet', w: 'Answer at the top to count it' });
    if (C && C.dayOf && Fd && Fd.targets) {                                       // the last whole day with food logged: yesterday or the day before
      let d = null; for (let i = 1; i <= 2 && !d; i++) { const x = C.dayOf(back(t0, i)); if (x.food.length) d = x; }
      if (d) {
        const tg = Fd.targets(d.t0), kg = C.weightKg ? C.weightKg(d.t0) : 0, pNeed = tg && tg.p > 0 ? tg.p : kg ? Math.round(kg * 1.6) : 0, when = d.t0 === back(t0, 1) ? 'yesterday' : 'the day before';
        if (pNeed) {
          const r = d.protein / pNeed, f = r >= 0.9 ? 1 : r >= 0.7 ? 0.95 : 0.9;
          out.push({ k: 'protein', f, tone: f < 1 ? 'slow' : 'good', t: `Protein: ${Math.round(d.protein)} of ${pNeed} g ${when}`, w: f < 1 ? 'muscles need protein to repair: less than you need slows them a little' : 'enough to repair your muscles' });
        }
        const up = tg && tg.upkeep ? tg.upkeep : C.everyday ? C.everyday(d.t0) : 0;
        if (up) {
          const r = d.eaten / up, f = r >= 0.85 ? 1 : r >= 0.7 ? 0.95 : 0.9;
          out.push({ k: 'kcal', f, tone: f < 1 ? 'slow' : 'good', t: `Calories: ${n0(d.eaten)} of the ${n0(up)} your body uses, ${when}`, w: f < 1 ? "eating well under what you use slows recovery (if you ate more and didn't log it, add it)" : 'enough energy to recover' });
        }
      } else out.push({ k: 'protein', f: 1, tone: 'none', t: 'Protein and calories: no food logged yesterday', w: 'Log your food on the Food tab to count them' });
    }
    const rr = restOn(t0), hv = hrvOn(t0), ur = usual(restOn, t0), uh = usual(hrvOn, t0);
    if (rr || hv) {
      let f = 1; const bits = [], why = [];
      if (rr && ur) { const fr = rr - ur >= 7 ? 0.9 : rr - ur >= 4 ? 0.95 : 1; f = Math.min(f, fr); bits.push(`resting ${rr} (usual ${Math.round(ur)})`); if (fr < 1) why.push('a resting heart rate above your usual'); }
      else if (rr) bits.push(`resting ${rr}`);
      if (hv && uh) { const fh = hv / uh <= 0.7 ? 0.9 : hv / uh <= 0.8 ? 0.95 : 1; f = Math.min(f, fh); bits.push(`HRV ${hv} ms (usual ${Math.round(uh)})`); if (fh < 1) why.push('an HRV below your usual'); }
      else if (hv) bits.push(`HRV ${hv} ms`);
      out.push({ k: 'heart', f, tone: f < 1 ? 'slow' : ur || uh ? 'good' : 'none', t: `Heart: ${bits.join(', ')}`,
        w: f < 1 ? `${why.join(' and ')} can mean your body is still recovering (or that you're ill or stressed)` : ur || uh ? 'about your usual' : 'a few more days of readings will show your usual' });
    } else if (wOn()) out.push({ k: 'heart', f: 1, tone: 'none', t: 'Resting heart rate and HRV: no reading today', w: 'Screenshots of your watch\'s sleep summary add them' });
    if (age) { const f = age >= 70 ? 0.85 : age >= 60 ? 0.9 : 1; out.push({ k: 'age', f, tone: f < 1 ? 'slow' : 'good', t: `Age: ${age}`, w: f < 1 ? 'from 60, GymDay allows a little longer' : age < 18 ? 'young muscles recover quickly' : 'no change' }); }
    else out.push({ k: 'age', f: 1, tone: 'none', t: 'Age: not set', w: 'Add it in About me on the Food tab' });
    return { k: Math.round(Math.max(0.6, out.reduce((a, x) => a * x.f, 1)) * 100) / 100, list: out };
  }
  const SORE = ['Very sore', 'Sore', 'Nearly recovered', 'Fully recovered'];
  // Every workout of the last four days tires the parts it used: 8 hard sets tire a part fully, fewer sets less.
  // A part is back after 48 hours for light work, up to 72 for a full load. An all-out set counts a quarter more,
  // an easy one a quarter less. It is an estimate, not a measurement.
  function recovery(now) {
    now = now || Date.now();
    const fx = factors(now), k = fx.k;                                      // v1.13: slower with a short night, little protein, a raised resting heart rate…
    const fat = {}, left = {}; F.AREAS.forEach(a => { fat[a.id] = 0; left[a.id] = 0; });
    // 1.31: asked about an earlier time (a past day's readiness), the workout running now is not part of it
    const list = D.sessions.filter(s => (s.end || s.start) > now - 5 * DAY && s.start <= now).concat(D.active && D.active.start <= now ? [D.active] : []);
    for (const s of list) {
      const sets = {};
      for (const it of (s.items || [])) {
        if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
        let n = 0; for (const x of (it.sets || [])) if (S.work(x)) n += x.eff === 0 ? 1.25 : x.eff === 1 ? 1.1 : x.eff === 3 ? 0.75 : 1;
        if (!n) continue; const p = I.exAreas(ex);
        for (const a of Object.keys(p.lv)) sets[a] = (sets[a] || 0) + n * p.w(a);      // 1.35: a full set, a half or a quarter, by how hard it works the part
      }
      const h = Math.max(0, (now - (s === D.active ? now : (s.end || s.start))) / HOUR);
      for (const a of Object.keys(sets)) { const load = Math.min(1, sets[a] / 8), T = (48 + 24 * load) / k; if (h < T) { fat[a] += load * (1 - h / T); left[a] = Math.max(left[a], T - h); } }
    }
    const rec = {}; F.AREAS.forEach(a => { rec[a.id] = Math.round((1 - Math.min(1, fat[a.id])) * 20) * 5; });
    const trained = new Set(F.AREAS.filter(a => fat[a.id] > 0.001).map(a => F.group(a.id)).filter(Boolean));
    // how sore you said a body part feels today comes first: very sore is red, sore yellow, nearly recovered green
    const c = checkOf(now), sore = (c && c.sore) || {};
    for (const id of Object.keys(rec)) {
      const v = sore[F.group(id)]; if (v == null) continue;
      const l = left[id] || 0;
      if (v === 0) { rec[id] = Math.min(rec[id], 30); left[id] = Math.max(l, 30); }
      else if (v === 1) { rec[id] = Math.min(Math.max(rec[id], 35), 60); left[id] = Math.min(Math.max(l, 12), 48); }
      else if (v === 2) { rec[id] = Math.min(Math.max(rec[id], 65), 85); left[id] = Math.min(Math.max(l, 3), 18); }
      else { rec[id] = 100; left[id] = 0; }
    }
    // 1.35: how sore each part is (the soreness tracker, 1 a bit, 2 sore, 3 very sore) counts for that part alone; 1.35.1: what
    // you said for a muscle, spread over its parts (sore.js); what GymDay worked out by itself is not counted again
    const sp = window.Sore && window.Sore.youParts ? window.Sore.youParts(now) : ((c && c.sp) || {});
    for (const id of Object.keys(sp)) {
      if (!(id in rec)) continue; const v = sp[id], l = left[id] || 0;
      if (v >= 3) { rec[id] = Math.min(rec[id], 30); left[id] = Math.max(l, 30); }
      else if (v === 2) { rec[id] = Math.min(Math.max(rec[id], 35), 60); left[id] = Math.min(Math.max(l, 12), 48); }
      else if (v === 1) { rec[id] = Math.min(Math.max(rec[id], 65), 85); left[id] = Math.min(Math.max(l, 3), 18); }
    }
    return { rec, left, k, fx, trained, sore, sp };
  }
  // a body part is as recovered as its most tired part
  function groupRecovery(r) {
    const out = {}; F.GROUPS.forEach(g => { const ids = F.PARTS.filter(id => F.group(id) === g); out[g] = { pct: Math.min(...ids.map(id => r.rec[id])), left: Math.max(...ids.map(id => r.left[id])), tired: ids.filter(id => r.rec[id] < 90).sort((a, b) => r.rec[a] - r.rec[b]) }; });
    return out;
  }
  // how rested a day is: the recovery of what its exercises are for, weighted by their planned sets
  function dayRest(d, r) {
    let sum = 0, w = 0;
    for (const it of d.items) { const ex = S.getEx(it.ex); if (!ex) continue; const p = I.exAreas(ex), n = Math.max(1, +it.sets || 3); p.main.forEach(a => { sum += r.rec[a] * n; w += n; }); }
    return w ? Math.round(sum / w) : null;
  }
  // v1.13: colours on the Recovery screen. v1.19: four: green fully recovered (100%), blue almost ready (65-99%), yellow recovering,
  // red sore (under 35%). Blue is level 3 on the body map (.bodyfig.rec .bm3).
  const recLevel = p => (p >= 100 ? 0 : p >= 65 ? 3 : p >= 35 ? 1 : 2);
  const recCls = p => ['rc-g', 'rc-y', 'rc-r', 'rc-b'][recLevel(p)];
  const recent = () => D.sessions.some(s => (s.end || s.start) > Date.now() - 5 * DAY) || !!D.active;
  function recoveryCard() {
    if (st().recovery === false || !recent()) return '';
    const g = groupRecovery(recovery()), fresh = F.GROUPS.filter(x => g[x].pct >= 90), tired = F.GROUPS.filter(x => g[x].pct < 90).sort((a, b) => g[a].pct - g[b].pct);
    if (!tired.length) return '';
    return `<div class="card tap" id="recCard" data-act="openRecovery"><div class="row"><div class="grow" style="min-width:0"><div class="k2">Recovery</div>
      <div class="small mt4">${tired.slice(0, 4).map(x => `<span class="pill ${['green', 'yellow', 'red', 'blue'][recLevel(g[x].pct)]}" style="margin-bottom:4px">${x} ${g[x].pct}%</span>`).join('')}</div>
      <div class="xs muted">${fresh.length ? 'Fresh: ' + fresh.slice(0, 6).join(', ') + (fresh.length > 6 ? '…' : '') : 'Everything is still recovering.'}</div></div><span class="chev">›</span></div></div>`;
  }
  VIEWS.recovery = {
    html() {
      const r = recovery(), g = groupRecovery(r);
      let h = top('Recovery', `An estimate from your sets, how hard they were, the time since, your sleep${wOn() ? ', food and heart' : ' and food'}, and how you feel`) + sleepCard() + trendCard() + (window.Sore ? window.Sore.recoveryCard(r) : soreCard(r, g)) + factorsCard(r) +
        `<div class="card">${I.bodies(id => recLevel(r.rec[id]), 'rec', { tip: id => `${F.name(id)} · ${r.rec[id]}% recovered` })}
        <div class="legend">${[['ready', 'var(--rc-g)'], ['almost ready', 'var(--rc-b)'], ['recovering', 'var(--rc-y)'], ['sore', 'var(--rc-r)']].map(([t, c]) => `<span><i style="background:${c}"></i>${t}</span>`).join('')}</div></div>`;
      const days = D.days.map(d => ({ d, p: dayRest(d, r) })).filter(x => x.p != null).sort((a, b) => b.p - a.p);
      if (days.length) h += `<div class="card"><h3>Your days, most rested first</h3>${days.map(x => `<div class="list-item"><div class="grow"><div class="ellipsis" style="font-weight:600">${esc(x.d.name)}</div><div class="bar mt4 ${recCls(x.p)}"><div style="width:${x.p}%"></div></div></div><span class="small${recLevel(x.p) === 3 ? ' rc-t rc-b' : ''}" style="min-width:44px;text-align:right">${x.p}%</span><button class="btn sm ${x === days[0] && x.p >= 85 ? 'primary' : ''}" data-act="startDay" data-id="${x.d.id}">Start</button></div>`).join('')}</div>`;
      h += `<div class="card">`;
      for (const x of F.GROUPS.slice().sort((a, b) => g[a].pct - g[b].pct)) {
        const hrs = Math.ceil(g[x].left), left = `about ${hrs >= 24 ? Math.round(hrs / 24 * 2) / 2 + ' days' : hrs + ' h'}`;
        const when = g[x].pct >= 100 ? `<span class="rc-t rc-g">ready</span>` : g[x].pct >= 65 ? `<span class="rc-t rc-b">almost ready</span>` : `<span class="rc-t ${recCls(g[x].pct)}">${left} to go</span>`;
        h += `<div class="mrow"><div class="row"><span class="nm grow">${x}</span><span class="xs">${when}</span><span class="n">${g[x].pct}%</span></div><div class="bar ${recCls(g[x].pct)}"><div style="width:${g[x].pct}%"></div></div>
          ${g[x].tired.length && F.PARTS.filter(id => F.group(id) === x).length > 1 ? `<div class="mparts">${g[x].tired.map(id => `<span>${esc(F.name(id))} <b>${r.rec[id]}%</b></span>`).join('')}</div>` : ''}</div>`;
      }
      return h + `</div><p class="xs dim" style="margin:0 2px">Eight hard sets tire a part fully; it is counted as back after two to three days, longer after a short night, a day with little protein or food, or a resting heart rate above your usual. Sets you marked All out count a little more, Easy ones a little less. How you say your muscles feel comes first. GymDay gives general fitness information, not medical advice.</p>`;
    }
  };
  ACT.openRecovery = () => A.go('recovery');

  // =====================================================================================================
  // 78 Balance
  // =====================================================================================================
  function classOf(ex) {
    const g = ex.group;
    if (g === 'Chest' || g === 'Triceps') return 'push';
    if (g === 'Back' || g === 'Biceps' || g === 'Forearms') return 'pull';
    if (g === 'Shoulders') { const p = I.exAreas(ex).main; return (p.has('rearDelt') || p.has('rotatorCuff')) && !p.has('frontDelt') && !p.has('sideDelt') ? 'pull' : 'push'; }
    if (['Quads', 'Hamstrings', 'Glutes', 'Calves'].includes(g)) return 'legs';
    return g === 'Core' ? 'core' : '';
  }
  function balance(days) {
    const from = Date.now() - (days || 28) * DAY, ss = D.sessions.filter(s => s.start >= from);
    const cls = { push: 0, pull: 0, legs: 0, core: 0 };
    for (const s of ss) for (const it of s.items) { if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue; const c = classOf(ex), n = it.sets.filter(S.work).length; if (c) cls[c] += n; }
    const p = I.areaSets(ss), sum = ids => ids.reduce((t, id) => t + (p[id] || 0), 0);
    // [left name, left sets, right name, right sets, how far apart is fine, what to do when the left / the right is behind]
    const pairs = [
      ['Pushing', cls.push, 'Pulling', cls.pull, 2, 'Add a press for the chest or shoulders.', 'Add a row or a pulldown.'],
      ['Upper body', cls.push + cls.pull, 'Legs', cls.legs, 3, 'Add an upper-body day or a few sets.', 'Give your legs a day of their own.'],
      ['Upper chest', p.upperChest, 'Lower chest', p.lowerChest, 2.5, 'An incline press or a low-to-high fly hits the upper chest.', 'A decline press, dips or a high-to-low fly hit the lower chest.'],
      ['Front delts', p.frontDelt, 'Rear delts', p.rearDelt, 2.5, 'An overhead press works the front of the shoulder.', 'Face pulls or a reverse fly work the back of the shoulder.'],
      ['Quads', sum(['rectusFem', 'vastusLat', 'vastusMed']) / 3, 'Hamstrings', sum(['hamsOuter', 'hamsInner']) / 2, 2.5, 'Squats, leg press or leg extensions work the quads.', 'A leg curl or a Romanian deadlift works the hamstrings.'],
      ['Biceps', sum(['bicepsLong', 'bicepsShort']) / 2, 'Triceps', sum(['tricepsLong', 'tricepsLat', 'tricepsMed']) / 3, 2.5, 'Add a curl.', 'Add a pushdown or an overhead extension.'],
    ];
    return { n: ss.length, cls, pairs: pairs.map(([a, x, b, y, lim, fixA, fixB]) => {
      const lo = Math.min(x, y), hi = Math.max(x, y), few = hi < 4, ratio = lo > 0 ? hi / lo : Infinity;
      const off = !few && ratio >= lim, lean = !few && !off && ratio >= 1.5;
      const big = x >= y ? a : b, small = x >= y ? b : a;
      const text = few ? 'Not enough sets yet to say.' : off ? (lo === 0 ? `${small} got none. ${x >= y ? fixB : fixA}` : `About ${fmt1(Math.round(ratio * 10) / 10)} times more ${big.toLowerCase()} than ${small.toLowerCase()}. ${x >= y ? fixB : fixA}`) : lean ? `A little more ${big.toLowerCase()} than ${small.toLowerCase()}.` : 'Balanced.';
      return { a, x, b, y, off, lean, few, text };
    }) };
  }
  VIEWS.balance = {
    html() {
      const b = balance();
      let h = top('Balance', 'Your last 4 weeks · ' + plural(b.n, 'workout'));
      if (!b.n) return h + `<div class="empty"><p>Log a few workouts and this shows what you train a lot and what you leave out.</p><div class="mt12"><button class="btn primary" data-act="root" data-nav="days">Start a workout</button></div></div>`;
      const off = b.pairs.filter(p => p.off);
      h += `<div class="card"><p class="small">${off.length ? `<b>${plural(off.length, 'thing')}</b> to even out.` : 'Nothing is far out of balance.'} <span class="muted">A ticked working set counts for each part its exercise is for, half for the parts that help.</span></p></div><div class="card">`;
      for (const p of b.pairs) {
        const tot = p.x + p.y || 1;
        h += `<div class="brow ${p.off ? 'off' : ''}"><div class="row"><span class="nm">${p.a}</span><span class="n">${fmt1(Math.round(p.x * 10) / 10)}</span><span class="grow"></span><span class="n">${fmt1(Math.round(p.y * 10) / 10)}</span><span class="nm r">${p.b}</span></div>
          <div class="bbar"><i style="width:${(p.x / tot) * 100}%"></i><i class="r" style="width:${(p.y / tot) * 100}%"></i></div><div class="xs ${p.off ? '' : 'dim'}">${p.text}</div></div>`;
      }
      return h + `</div>`;
    }
  };
  ACT.openBalance = () => A.go('balance');

  // =====================================================================================================
  // 79 Body measurements
  // =====================================================================================================
  const SITES = ['Chest', 'Waist', 'Hips', 'Shoulders', 'Upper arm', 'Forearm', 'Thigh', 'Calf', 'Neck'];
  const lenUnit = () => (st().lenUnit === 'in' ? 'in' : 'cm');
  let site = 'Waist';
  const dm = ts => { const d = new Date(ts); return `${d.getDate()} ${A.MONTHS_LONG[d.getMonth()].slice(0, 3)}`; };
  VIEWS.measure = {
    html() {
      const all = (D.meas || []).slice().sort((a, b) => b.t - a.t), list = all.filter(m => m.site === site);
      let h = top('Measurements', 'Only you see this') + `<div class="chips">${SITES.map(x => `<button class="chip ${x === site ? 'on' : ''}" data-act="measSite" data-v="${x}">${x}${all.some(m => m.site === x) ? '' : ''}</button>`).join('')}</div>
        <div class="card"><div class="row"><input class="input grow" id="measIn" type="number" inputmode="decimal" step="any" placeholder="${site} in ${lenUnit()}" enterkeyhint="done"><button class="btn primary" data-act="measAdd">Add</button></div>
        <div class="row mt8"><span class="xs muted grow">Measure at the same spot each time, relaxed, at the same time of day.</span>${window.SetKit ? window.SetKit.seg('lenUnit', lenUnit() === 'in' ? 'in' : 'cm', [['cm', 'cm'], ['in', 'inches']], 'Unit for measurements') : '<select class="input" data-bind="lenUnit"><option value="cm">cm</option><option value="in">inches</option></select>'}</div></div>`;
      if (list.length >= 2) {
        const pts = list.slice(0, 60).reverse(), tk = A.ticks3(Math.min(...pts.map(p => p.v)), Math.max(...pts.map(p => p.v)), true), lo = tk[0], hi = tk[2], span = hi - lo || 1, W = 320, H = 120;      // 1.33: round numbers on the left
        const x = i => 8 + (W - 16) * (i / (pts.length - 1)), y = v => 14 + (H - 34) * (1 - (v - lo) / span), d = Math.round((pts[pts.length - 1].v - pts[0].v) * 10) / 10;
        h += `<div class="card">${A.withY(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="${site} chart"${A.ptsAttr(pts.map((p, i) => [x(i), y(p.v), A.fmtDate(p.t), `${A.fmtW(p.v)} ${lenUnit()}`]))}>${A.gridY(tk, y, 8, W - 8)}<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => x(i).toFixed(1) + ',' + y(p.v).toFixed(1)).join(' ')}"/>
          ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.v).toFixed(1)}" r="3" fill="var(--bg2)" stroke="var(--accent)" stroke-width="2"/>`).join('')}
          <text x="8" y="${H - 4}" font-size="11" fill="var(--dim)">${dm(pts[0].t)}</text><text x="${W - 8}" y="${H - 4}" font-size="11" fill="var(--dim)" text-anchor="end">${dm(pts[pts.length - 1].t)}</text></svg>`, tk, y, H, t => A.fmtW(t))}
          <p class="xs muted">${site} now <b>${A.fmtW(pts[pts.length - 1].v)} ${lenUnit()}</b> · ${d ? `${d > 0 ? '+' : '−'}${A.fmtW(Math.abs(d))} ${lenUnit()} since ${dm(pts[0].t)}` : 'no change since ' + dm(pts[0].t)}</p></div>`;
      }
      if (list.length) h += `<div class="card">${list.map(m => `<div class="list-item"><div class="grow"><div class="small" style="font-weight:600">${A.fmtW(m.v)} ${lenUnit()}</div><div class="xs muted">${A.fmtDate(m.t)}</div></div><button class="ib x" data-act="measDel" data-id="${esc(m.id)}" aria-label="Remove">✕</button></div>`).join('')}</div>`;
      else h += `<div class="empty"><p>Nothing for ${site.toLowerCase()} yet.</p></div>`;
      const have = SITES.filter(x => all.some(m => m.site === x));
      if (have.length > 1) h += `<div class="card"><h3>Latest</h3>${have.map(x => { const l = all.filter(m => m.site === x), d = l.length > 1 ? Math.round((l[0].v - l[l.length - 1].v) * 10) / 10 : 0; return `<div class="cmp-row"><span class="grow muted">${x}</span><span>${A.fmtW(l[0].v)} ${lenUnit()}${d ? ` <span class="dim">(${d > 0 ? '+' : '−'}${A.fmtW(Math.abs(d))})</span>` : ''}</span></div>`; }).join('')}</div>`;
      return h;
    },
    mount() { const i = $('#measIn'); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.measAdd(); }); }
  };
  ACT.openMeasure = () => A.go('measure');
  ACT.measSite = el => { site = el.dataset.v; A.rerender(); };
  ACT.measAdd = () => {
    const v = parseFloat(($('#measIn') || {}).value); if (!(v > 0) || v > 500) { toast('Type a number first'); return; }
    if (!D.meas) D.meas = [];
    D.meas.push({ id: S.uid(), t: Date.now(), site, v: Math.round(v * 10) / 10 }); S.save(true); A.rerender(); toast(site + ' saved');
  };
  ACT.measDel = el => { const m = (D.meas || []).find(x => x.id === el.dataset.id); if (!m) return; D.meas = D.meas.filter(x => x !== m); S.save(true); A.rerender();
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast('Measurement removed', () => { if (!(D.meas || []).includes(m)) { (D.meas = D.meas || []).push(m); D.meas.sort((x, y) => x.t - y.t); S.save(true); A.rerender(); } }); else toast('Removed'); };

  // =====================================================================================================
  // 80 Strength level
  // =====================================================================================================
  // One-rep max as a multiple of body weight where each level starts. A rough guide many lifters use; it knows
  // nothing about age, height or how long someone has trained.
  const LEVELS = ['Beginner', 'Novice', 'Intermediate', 'Advanced', 'Elite'];
  const STD = {
    bench: { name: 'Bench press', m: [0.5, 0.75, 1.25, 1.75, 2.0], f: [0.25, 0.5, 0.75, 1.0, 1.5], ids: ['bench-press'] },
    squat: { name: 'Squat', m: [0.75, 1.25, 1.5, 2.25, 2.75], f: [0.5, 0.75, 1.25, 1.5, 2.0], ids: ['back-squat'] },
    deadlift: { name: 'Deadlift', m: [1.0, 1.5, 2.0, 2.5, 3.0], f: [0.5, 1.0, 1.25, 1.75, 2.25], ids: ['conventional-deadlift', 'sumo-deadlift'] },
    ohp: { name: 'Overhead press', m: [0.35, 0.55, 0.8, 1.1, 1.4], f: [0.2, 0.35, 0.5, 0.75, 1.0], ids: ['barbell-ohp'] },
    row: { name: 'Barbell row', m: [0.5, 0.75, 1.0, 1.5, 1.75], f: [0.25, 0.4, 0.65, 0.9, 1.2], ids: ['barbell-row', 'pendlay-row'] },
  };
  const stdOf = ex => Object.keys(STD).find(k => STD[k].ids.includes(ex.id)) || null;
  const bodyNow = () => { const l = (D.body || []).slice().sort((a, b) => b.t - a.t)[0]; return l ? +l.kg : 0; };
  const who = () => { const v = st().stdFor || (st().me || {}).sex; return v === 'f' ? 'f' : v === 'm' ? 'm' : ''; };      // 1.35.2: About me's answer until Men / Women is tapped
  // the best the person has shown on it: the estimated one-rep max of the strongest set (or the heaviest weight when reps are off)
  function bestOf(ex) { const r = A.recordsFor(ex.id, 'none'); return r.e ? { v: r.e.v, text: `${A.fmtW(r.e.w)} × ${r.e.r}` } : r.w ? { v: r.w.v, text: `${A.fmtW(r.w.v)} ${A.unit()}` } : null; }
  function levelOf(ex) {
    const k = stdOf(ex), bw = bodyNow(), b = bestOf(ex), w = who(); if (!k || !bw || !b || !w) return null;
    const t = STD[k][w], ratio = b.v / bw; let i = -1; t.forEach((x, n) => { if (ratio >= x) i = n; });
    const next = i < t.length - 1 ? t[i + 1] * bw : null, from = i >= 0 ? t[i] * bw : 0;
    return { key: k, i, name: i < 0 ? 'Getting started' : LEVELS[i], ratio, best: b, bw, next, nextName: i < t.length - 1 ? LEVELS[i + 1] : '', prog: next ? Math.max(0, Math.min(1, (b.v - from) / (next - from))) : 1 };
  }
  const round = v => A.fmtW(Math.round(v * 2) / 2);
  const whoPick = () => `<div class="row" style="gap:8px"><span class="xs muted grow">Compare with the usual numbers for</span><button class="chip ${who() === 'm' ? 'on' : ''}" data-act="stdFor" data-v="m">Men</button><button class="chip ${who() === 'f' ? 'on' : ''}" data-act="stdFor" data-v="f">Women</button></div>`;
  function strengthCard(ex) {
    if (!stdOf(ex) || st().strength === false) return '';
    const need = !bodyNow() ? `<p class="small muted">Add your body weight (History, Body weight) and this shows where your ${esc(STD[stdOf(ex)].name.toLowerCase())} stands.</p><button class="btn sm mt8" data-act="openBody">Add body weight</button>`
      : !bestOf(ex) ? `<p class="small muted">Log a set and this shows where it stands for your body weight.</p>` : !who() ? whoPick() : '';
    if (need) return `<div class="card" id="lvlCard"><h3>Strength level</h3>${need}</div>`;
    const l = levelOf(ex);
    return `<div class="card" id="lvlCard"><div class="row"><h3 class="grow" style="margin:0">Strength level</h3><span class="pill accent" style="margin:0">${l.name}</span></div>
      <div class="bar mt12"><div style="width:${Math.round(l.prog * 100)}%"></div></div>
      <p class="small mt8">Your best is about <b>${round(l.best.v)} ${A.unit()}</b> for one rep (${l.best.text}), <b>${fmt1(Math.round(l.ratio * 100) / 100)}×</b> your body weight.${l.next ? ` <span class="muted">${l.nextName} starts at ${round(l.next)} ${A.unit()}.</span>` : ''}</p>
      <div class="mt8">${whoPick()}</div><p class="xs dim mt8">A rough guide lifters use. It does not know your age, height or how long you have trained.</p></div>`;
  }
  ACT.stdFor = el => { st().stdFor = el.dataset.v; S.save(); A.rerender(); };
  VIEWS.strength = {
    html() {
      let h = top('Strength levels', 'From your best lift and your body weight');
      if (!bodyNow()) return h + `<div class="empty"><p>Add your body weight first.</p><div class="mt12"><button class="btn primary" data-act="openBody">Add body weight</button></div></div>`;
      h += `<div class="card">${whoPick()}${who() ? '' : '<p class="small muted mt8">Pick one to see where each of your lifts stands.</p>'}</div>`; if (!who()) return h;
      const rows = [];
      for (const k of Object.keys(STD)) {
        const exs = STD[k].ids.map(S.getEx).filter(Boolean).map(ex => ({ ex, l: levelOf(ex) })).filter(x => x.l).sort((a, b) => b.l.best.v - a.l.best.v);
        rows.push(exs.length ? { k, ex: exs[0].ex, l: exs[0].l } : { k });
      }
      h += `<div class="card">${rows.map(r => r.l ? `<div class="list-item" data-act="openEx" data-id="${esc(r.ex.id)}"><div class="grow"><div class="row"><span style="font-weight:600" class="grow">${STD[r.k].name}</span><span class="pill ${r.l.i >= 2 ? 'accent' : ''}" style="margin:0">${r.l.name}</span></div>
          <div class="bar mt8"><div style="width:${Math.round(r.l.prog * 100)}%"></div></div><div class="xs muted mt4">${round(r.l.best.v)} ${A.unit()} · ${fmt1(Math.round(r.l.ratio * 100) / 100)}× body weight${r.l.next ? ` · ${r.l.nextName} at ${round(r.l.next)}` : ''}</div></div><span class="chev">›</span></div>`
        : `<div class="list-item"><div class="grow"><span class="muted">${STD[r.k].name}</span><div class="xs dim">Not logged yet</div></div></div>`).join('')}</div>
        <p class="xs dim" style="margin:0 2px">Body weight used: ${A.fmtW(bodyNow())} ${A.unit()} (your latest entry). Levels are a rough guide from the weight lifted for one rep compared with body weight. They do not know your age, height or how long you have trained.</p>`;
      return h;
    }
  };
  ACT.openStrength = () => A.go('strength');

  // =====================================================================================================
  // 73 Easy week
  // =====================================================================================================
  const HARD_RUN = 5;                                 // this many full hard weeks in a row, and an easier one is suggested
  const weekSets = (from, to) => D.sessions.filter(s => s.start >= from && s.start < to).reduce((n, s) => n + s.items.reduce((m, it) => m + (it.skipped ? 0 : it.sets.filter(S.work).length), 0), 0);
  // how many finished weeks in a row (ending with last week) were hard: at least 3 workouts (or the weekly goal) and not clearly lighter than the weeks around them
  function hardRun() {
    const goal = Math.max(2, Math.min(3, st().weekGoal == null ? 3 : +st().weekGoal || 3)), weeks = [];
    for (let k = 1; k <= 12; k++) { const from = A.weekStartOf(Date.now(), k), to = A.weekStartOf(Date.now(), k - 1); weeks.push({ n: D.sessions.filter(s => s.start >= from && s.start < to && !s.easy).length, sets: weekSets(from, to) }); }
    const top3 = weeks.map(w => w.sets).sort((a, b) => b - a).slice(0, 3), usual = top3.length ? top3.reduce((a, b) => a + b, 0) / top3.length : 0;
    let run = 0; for (const w of weeks) { if (w.n >= goal && w.sets >= 0.6 * usual) run++; else break; }
    return run;
  }
  const easyNow = () => !!st().easyUntil && Date.now() < st().easyUntil;
  function easyCard() {
    if (easyNow()) return `<div class="card" id="easyCard" style="border-color:var(--accent)"><div class="row"><div class="grow"><div class="title">Easy week</div><div class="xs muted">Until ${A.fmtDate(st().easyUntil - 1)}: workouts start with half the sets, and their numbers are not carried into next week.</div></div><button class="btn sm" data-act="easyOff">End it</button></div></div>`;
    if (st().deload === false || (M.easyHide || 0) > Date.now()) return '';
    const run = hardRun(); if (run < HARD_RUN) return '';
    return `<div class="card" id="easyCard"><div class="title">${run} hard weeks in a row</div><p class="small muted mt4">Many lifters take an easier week about now: the same exercises with about half the sets. It often brings the numbers back up.</p>
      <div class="row mt12"><button class="btn grow" data-act="easyLater">Not now</button><button class="btn primary grow" data-act="easyOn">Make this an easy week</button></div></div>`;
  }
  ACT.easyOn = () => { st().easyUntil = A.weekStartOf(Date.now(), -1); S.save(true); A.rerender(); toast('Easy week on: workouts start with half the sets'); };
  ACT.easyOff = () => { delete st().easyUntil; S.save(true); A.rerender(); toast('Easy week ended'); };
  ACT.easyLater = () => { M.easyHide = Date.now() + 14 * DAY; S.saveMeta(); A.rerender(); };
  // a workout started in an easy week: half the sets of each exercise (at least two when it had two), no "beat last time", not carried forward
  function makeEasy(a) {
    if (!a || !easyNow()) return false;
    a.easy = true; a.keep = false;
    for (const it of a.items) { const n = it.sets.length, keep = Math.max(Math.min(n, 2), Math.ceil(n / 2)); it.sets = it.sets.slice(0, keep); delete it.tgt; }
    return true;
  }

  // ---------------- where these show ----------------
  const home0 = I.homeCards; I.homeCards = () => home0() + easyCard() + recoveryCard();
  if (window.Extras && window.Extras.exerciseExtra) { const ee0 = window.Extras.exerciseExtra; window.Extras.exerciseExtra = ex => ee0(ex) + strengthCard(ex); }
  window.SettingsRows.push(() => sw('optRecovery', st().recovery !== false, 'Recovery on the Today page', 'Which muscles are still recovering and which are fresh')
    + sw('optDeload', st().deload !== false, 'Easy-week reminder', `Suggests a lighter week after ${HARD_RUN} hard weeks in a row`)
    + sw('optStrength', st().strength !== false, 'Strength level', 'On the big barbell lifts: where your best stands for your body weight'));
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset && t.dataset.bind;
    if (b === 'optRecovery') { st().recovery = t.checked; S.save(); } else if (b === 'optDeload') { st().deload = t.checked; S.save(); } else if (b === 'optStrength') { st().strength = t.checked; S.save(); }
    else if (b === 'lenUnit') { st().lenUnit = t.value; S.save(); A.rerender(); }
  });

  // ---------------------------------------------------------------- v1.13: the questions on the Recovery screen
  let rcEdit = false;
  // v1.21.11: Sleep & heart, inside Recovery: last night at a glance (time asleep against what you need, bedtime and wake time, the
  // stages, resting heart rate and HRV against your usual, blood oxygen and breathing), the last 7 or 30 nights, and every number
  // typed in a form or read from screenshots of the watch app
  const clk = m => { if (m == null) return ''; m = ((Math.round(m) % 1440) + 1440) % 1440; const h = Math.floor(m / 60), r = m % 60, ap = h < 12 ? 'am' : 'pm'; return `${h % 12 || 12}:${String(r).padStart(2, '0')} ${ap}`; };
  const inBed = (bed, wake) => (bed == null || wake == null ? 0 : ((wake - bed) % 1440 + 1440) % 1440);
  function stageBar(sl) {
    const parts = [['deep', 'Deep', sl.deep], ['rem', 'REM', sl.rem], ['light', 'Light', sl.light], ['awake', 'Awake', sl.awake]].filter(x => x[2] > 0);
    if (!parts.length) return '';
    const tot = parts.reduce((a, x) => a + x[2], 0);
    return `<div class="rc-stages mt8" role="img" aria-label="${parts.map(x => `${x[1]} ${hm(x[2])}`).join(', ')}">${parts.map(x => `<i class="rc-st-${x[0]}" style="width:${(x[2] / tot * 100).toFixed(1)}%"></i>`).join('')}</div>
      <div class="rc-stl">${parts.map(x => `<span><i class="rc-st-${x[0]}"></i>${x[1]} <b>${hm(x[2])}</b></span>`).join('')}</div>`;
  }
  function heartTiles(n, t0) {
    const ur = usual(restOn, t0), uh = usual(hrvOn, t0);
    const tile = (k, v, unit, sub, cls) => `<div class="rc-ht ${cls || ''}"><div class="k2">${k}</div><div class="v">${v ? `${v}<small> ${unit}</small>` : '–'}</div><div class="xs muted">${sub}</div></div>`;
    const vs = (v, u, more) => (!v ? 'not added' : !u ? 'your usual shows after 3 nights' : Math.abs(v - u) < (more ? 3 : 4) ? `about your usual (${Math.round(u)})` : `${Math.round(Math.abs(v - u))} ${v > u ? 'above' : 'below'} your usual`);
    return `<div class="rc-hts mt12">${tile('Resting heart rate', n.rest, 'bpm', vs(n.rest, ur, true), n.rest && ur && n.rest - ur >= 4 ? 'warn' : '')}${tile('HRV', n.hrv, 'ms', vs(n.hrv, uh, false), n.hrv && uh && n.hrv <= uh * 0.8 ? 'warn' : '')}
      ${tile('Blood oxygen', n.spo2, '%', n.spo2 ? (n.spo2 < 90 ? 'low' : 'while asleep') : 'not added', n.spo2 && n.spo2 < 90 ? 'warn' : '')}${tile('Breathing', n.br, '/min', n.br ? 'breaths a minute asleep' : 'not added', '')}</div>`;
  }
  function sleepWords(n, need, age, t0) {
    const sl = n.sl, w = [], ur = usual(restOn, t0), uh = usual(hrvOn, t0);
    if (sl) w.push(sl.min >= need * 60 ? `Enough sleep: you need ${need} hours or more${age && age < 18 ? ' as a teenager' : ''}.` : `${hm(need * 60 - sl.min)} under the ${need} hours you need${age && age < 18 ? ' as a teenager' : ''}.`);
    if (n.rest && ur && n.rest - ur >= 4) w.push('A resting heart rate well above your usual can mean you are tired, stressed or getting ill.');
    if (n.hrv && uh && n.hrv <= uh * 0.8) w.push('HRV well below your usual: your body may still be recovering.');
    if (n.spo2 && n.spo2 < 90) w.push('Most people read 95% or more. If your watch often shows under 90% while you sleep, mention it to a doctor.');
    if (n.br && (n.br < 10 || n.br > 22)) w.push('Breathing while asleep is usually 12 to 20 a minute; watch readings vary.');
    return w.length ? `<div class="rv-lines mt8">${w.map(x => `<div class="rv-l"><span class="rv-i">•</span><div class="small grow">${x}</div></div>`).join('')}</div>` : '';
  }
  function sleepCard() {
    const t0 = day0(Date.now()), sl = sleepOf(t0), C = window.Calories, age = C && C.ageNow ? C.ageNow() : 0, need = sleepNeed(age), n = nightOf(t0);
    if (sl && !rcEdit) {
      const ib = inBed(sl.bed, sl.wake);
      return `<div class="card" id="rcSleep"><div class="row"><div class="grow" style="min-width:0"><div class="k2">${wOn() ? 'Sleep &amp; heart' : 'Sleep'} · last night</div>
        <div class="title">${hm(sl.min)}<span class="small muted"> asleep</span>${sl.score ? ` <span class="rc-score">sleep score ${sl.score}</span>` : ''}</div>
        <div class="xs muted">${sl.by === 'watch' ? 'from your watch' + (sl.app ? ' · ' + esc(sl.app) : '') : 'typed by you'}</div>
        ${sl.bed != null || sl.wake != null ? `<div class="small mt4">${sl.bed != null ? `Bed ${clk(sl.bed)}` : ''}${sl.bed != null && sl.wake != null ? ' → ' : ''}${sl.wake != null ? `up ${clk(sl.wake)}` : ''}${ib ? ` <span class="xs muted">· ${hm(ib)} in bed</span>` : ''}</div>` : ''}</div>
        <button class="btn sm ghost" data-act="rcSleepEdit">Change</button></div>
        ${stageBar(sl)}${wOn() ? heartTiles(n, t0) : ''}${sleepWords(n, need, age, t0)}
        <div class="row mt12" style="gap:8px"><button class="btn sm grow" data-act="rcSleepForm">✎ Type the numbers</button>${wOn() ? `<button class="btn sm grow" data-act="rcSleepShots">📷 Screenshots</button>` : ''}</div></div>`;
    }
    const v = sl ? Math.round(sl.min / 30) / 2 : need;
    return `<div class="card" id="rcSleep"><div class="k2">${wOn() ? 'Sleep &amp; heart' : 'Sleep'} · last night</div><div class="small mt4" style="font-weight:600">How long did you sleep last night?</div>
      <div class="row mt8" style="gap:12px;align-items:center"><input type="range" id="rcSl" min="3" max="12" step="0.5" value="${v}" class="grow" aria-label="Hours asleep"><b id="rcSlV" style="min-width:76px;text-align:right">${hm(v * 60)}</b></div>
      <div class="row mt12" style="gap:8px">${wOn() ? `<button class="btn sm" data-act="${ACT.sleepWatch ? 'sleepWatch' : 'rcSleepShots'}">⌚ From your watch</button>` : ''}<button class="btn sm primary grow" data-act="rcSleepSave">Save</button></div>
      <button class="btn sm ghost block mt8" data-act="rcSleepForm">${wOn() ? '✎ Bedtime, stages, heart rate, HRV, oxygen, breathing' : '✎ Bedtime and wake-up time'}</button>
      ${!sl && (n.rest || n.hrv || n.spo2 || n.br) ? heartTiles(n, t0) : ''}${!sl && wOn() && window.HealthAuto && window.HealthAuto.nightNote ? window.HealthAuto.nightNote() : ''}
      <p class="xs dim mt8">Time asleep, not only in bed. ${age && age < 18 ? 'Teenagers need 8 to 10 hours.' : age && age < 13 ? 'Children need 9 to 12 hours.' : 'Adults need at least 7 hours.'}${wOn() ? ' With a watch: up to 10 screenshots of its sleep summary, read together, with your resting heart rate and HRV.' : ''}</p></div>`;
  }
  document.addEventListener('input', e => { if (e.target && e.target.id === 'rcSl') { const o = $('#rcSlV'); if (o) o.textContent = hm(+e.target.value * 60); } });
  ACT.rcSleepEdit = () => { rcEdit = true; A.rerender(); };
  ACT.rcSleepSave = () => {
    const i = $('#rcSl'); if (!i) return; const c = checkFor(Date.now());
    c.sleep = Math.round(+i.value * 60); c.sby = 'you'; delete c.sscore; delete c.deep; delete c.rem; delete c.sapp; c.at = Date.now();
    rcEdit = false; S.save(true); A.rerender(); toast('Saved');
  };
  let trendN = 7;
  function trendCard() {
    const t0 = day0(Date.now()), N = trendN, C = window.Calories, age = C && C.ageNow ? C.ageNow() : 0, need = sleepNeed(age);
    const days = []; for (let i = N - 1; i >= 0; i--) { const t = back(t0, i); days.push({ t, n: nightOf(t) }); }
    const sv = days.map(x => (x.n.sl ? x.n.sl.min / 60 : 0)), rv = days.map(x => x.n.rest || 0), hv = days.map(x => x.n.hrv || 0), ov = days.map(x => x.n.spo2 || 0), bv = days.map(x => x.n.br || 0);
    const has = a => a.filter(v => v > 0), avg = a => { const b = has(a); return b.length ? b.reduce((x, y) => x + y, 0) / b.length : 0; };
    if (!has(sv).length && !has(rv).length && !has(hv).length && !has(ov).length && !has(bv).length) return `<div class="card" id="rcTrend"><div class="k2">Your nights</div><p class="xs muted mt4">Your last nights show here once you add a few: sleep against what you need${wOn() ? ', resting heart rate and HRV' : ''}.</p></div>`;
    const W = 300, H = 74, P = 4, bw = (W - P * 2) / N, lab = i => { const d = new Date(days[i].t); return N <= 7 ? 'SMTWTFS'[d.getDay()] : `${d.getDate()}`; };
    const xs = i => P + bw * i + bw / 2;
    const labels = days.map((x, i) => (N <= 7 || i === 0 || i === N - 1 || i === (N >> 1) ? `<text x="${xs(i).toFixed(1)}" y="${H + 12}" text-anchor="middle" class="rc-tl">${lab(i)}</text>` : '')).join('');
    let bars = bars0, line = line0;
    function bars0() {
      const top = Math.max(need + 2, ...sv, 1), y = v => H - v / top * (H - 6);
      return `<svg viewBox="0 0 ${W} ${H + 16}" class="rc-chart" role="img" aria-label="Sleep each night: average ${hm(avg(sv) * 60)}, you need ${need} hours"${A.ptsAttr(days.map((x, i) => [xs(i), null, 'the night to ' + A.fmtDate(x.t), sv[i] > 0 ? hm(sv[i] * 60) + ' asleep' : 'nothing added']))}>
        ${sv.map((v, i) => (v > 0 ? `<rect x="${(P + bw * i + bw * 0.18).toFixed(1)}" y="${y(v).toFixed(1)}" width="${(bw * 0.64).toFixed(1)}" height="${(H - y(v)).toFixed(1)}" rx="2" class="rc-b ${v < need ? 'lo' : ''}"/>` : '')).join('')}
        <line x1="${P}" x2="${W - P}" y1="${y(need).toFixed(1)}" y2="${y(need).toFixed(1)}" class="rc-need"/><text x="${W - P}" y="${(y(need) - 3).toFixed(1)}" text-anchor="end" class="rc-tl">${need} h</text>${labels}</svg>`;
    }
    function line0(vals, cls, label) {
      const pts = vals.map((v, i) => [i, v]).filter(x => x[1] > 0); if (pts.length < 2) return '';
      const lo = Math.min(...pts.map(x => x[1])), hi = Math.max(...pts.map(x => x[1])), pad = Math.max(2, (hi - lo) * 0.2), a = lo - pad, b = hi + pad, y = v => H - (v - a) / (b - a) * (H - 8) - 4;
      return `<svg viewBox="0 0 ${W} ${H + 16}" class="rc-chart" role="img" aria-label="${label}"${A.ptsAttr(pts.map(([i, v]) => [xs(i), y(v), A.fmtDate(days[i].t), `${Math.round(v * 10) / 10} ${cls === 'hr' ? 'bpm' : 'ms'}`]))}><polyline points="${pts.map(([i, v]) => `${xs(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')}" class="rc-ln ${cls}"/>
        ${pts.map(([i, v]) => `<circle cx="${xs(i).toFixed(1)}" cy="${y(v).toFixed(1)}" r="${N <= 7 ? 3 : 2}" class="rc-dt ${cls}"/>`).join('')}
        <text x="${P}" y="9" class="rc-tl">${Math.round(hi)}</text><text x="${P}" y="${H - 2}" class="rc-tl">${Math.round(lo)}</text>${labels}</svg>`;
    }
    const short = has(sv).filter(v => v < need).length;
    // 1.33 (1): the charts of the Insights page (numbers on the left, dots, safe and danger zones), when it is there
    const DL = window.Daily && window.Daily.laneChart, fd = DL ? window.Daily.daysBack(N) : null;
    // 1.35.1: big charts (about 2½ times as tall as before); a finger on one marks the night and says it above the chart
    if (DL) { bars = () => DL('sleep', fd, 160) || bars0(); line = (vals, cls, label) => DL(cls === 'hr' ? 'rest' : 'hrv', fd, 160) || line0(vals, cls, label); }
    const sec = (title, sub, chart) => `<div class="rc-tr mt12"${DL ? ' data-read' : ''}><div class="row rc-trh"><b class="small grow">${title}</b><span class="xs muted rc-read">${sub}</span></div>${chart}</div>`;
    return `<div class="card" id="rcTrend"><div class="row"><div class="k2 grow">Your nights</div><div class="chips">${[7, 30].map(n => `<button class="chip ${N === n ? 'on' : ''}" data-act="rcTrendN" data-n="${n}" aria-pressed="${N === n}">${n} days</button>`).join('')}</div></div>
      ${has(sv).length ? sec('Sleep', `average ${hm(avg(sv) * 60)}${short ? ` · ${short} of ${has(sv).length} night${has(sv).length === 1 ? '' : 's'} under ${need} h` : ''}`, bars()) + debtLine(has(sv), need) : ''}
      ${has(rv).length ? sec('Resting heart rate', `average ${Math.round(avg(rv))} bpm · lowest ${Math.min(...has(rv))}`, line(rv, 'hr', `Resting heart rate: average ${Math.round(avg(rv))} beats a minute`)) : ''}
      ${has(hv).length ? sec('HRV', `average ${Math.round(avg(hv))} ms`, line(hv, 'hrv', `HRV: average ${Math.round(avg(hv))} milliseconds`)) : ''}
      ${has(ov).length || has(bv).length ? `<p class="small mt12">${has(ov).length ? `Blood oxygen: average <b>${Math.round(avg(ov))}%</b>` : ''}${has(ov).length && has(bv).length ? ' · ' : ''}${has(bv).length ? `Breathing: average <b>${Math.round(avg(bv) * 10) / 10}</b> a minute` : ''}</p>` : ''}
      ${wOn() ? `<p class="xs dim mt8">Higher HRV and a lower resting heart rate than usual mostly mean you are well recovered. Watches measure these differently, so compare with your own usual, not with other people.</p>` : ''}
      ${DL && window.Daily.openAt && (has(sv).length || has(rv).length || has(hv).length) ? `<p class="xs dim mt8 rc-slide">☝ Slide a finger along a chart to read each night.</p><button class="btn sm block mt8" data-act="rcOpenIns" id="rcOpenIns">${rcAt ? insWord(rcAt) : 'Open in Insights ›'}</button>` : ''}</div>`;
  }
  // 1.35.1: Open in Insights: on the night last read on a chart here, or today
  let rcAt = 0;
  const insWord = t => (P0(t) === P0(Date.now()) ? 'Open today in Insights ›' : `Open ${A.fmtDate(t)} in Insights ›`);
  const P0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  document.addEventListener('chartread', e => {
    const t = e.detail && e.detail.p && e.detail.p[4]; if (!t || !e.target.closest || !e.target.closest('#rcTrend')) return;
    rcAt = t; const b = document.getElementById('rcOpenIns'); if (b) b.textContent = insWord(t);
  });
  ACT.rcOpenIns = () => { if (window.Daily && window.Daily.openAt) window.Daily.openAt(rcAt || Date.now(), trendN); };
  // 1.33 (39): the sleep debt of the nights shown: the hours short of what you need, added up (a long night does not pay a short one back)
  function debtLine(nights, need) {
    const d = nights.reduce((a, v) => a + Math.max(0, need - v), 0);
    return `<p class="xs mt4 rc-debt" id="rcDebt">${d >= 0.5 ? `<b>Sleep debt: ${hm(Math.round(d * 60))}</b> short of your ${need} h over ${nights.length} night${nights.length === 1 ? '' : 's'}. An early night or two pays it back.` : `<span class="di-zs di-zs-s" aria-hidden="true">✓</span> No sleep debt over these ${nights.length} night${nights.length === 1 ? '' : 's'}.`}</p>`;
  }
  ACT.rcTrendN = el => { trendN = +el.dataset.n === 30 ? 30 : 7; rcAt = 0; A.rerender(); };
  // ---- every number for a night, typed
  let sf = null;              // { t } the morning the night ended
  const numIn = (id, v, lbl, unit, min, max, step) => `<label class="rc-f"><span class="xs muted">${lbl}</span><span class="rc-fi"><input class="input" id="${id}" type="number" inputmode="${step && step < 1 ? 'decimal' : 'numeric'}" min="${min}" max="${max}" step="${step || 1}" value="${v || v === 0 ? v : ''}">${unit ? `<small>${unit}</small>` : ''}</span></label>`;
  const tIn = (id, m, lbl) => `<label class="rc-f"><span class="xs muted">${lbl}</span><input class="input" id="${id}" type="time" value="${m == null ? '' : `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`}"></label>`;
  function sfSheet() {
    const o = sf; if (!o) return; const t = o.t, c = checkOf(t) || {}, sl = sleepOf(t), n = nightOf(t), today = keyOf(t) === keyOf(Date.now());
    const asleep = sl ? sl.min : 0;
    const w = wOn();
    A.openSheet(`<h2>${w ? 'Sleep &amp; heart' : 'Sleep'}</h2>
      <label class="rc-f"><span class="xs muted">The night that ended on</span><input class="input" id="rcSfDay" type="date" max="${keyOf(Date.now())}" value="${keyOf(t)}"></label>
      <div class="sp-sub">Sleep</div>
      <div class="rc-fg">${tIn('rcSfBed', sl && sl.bed != null ? sl.bed : c.bed != null ? c.bed : null, 'Went to bed')}${tIn('rcSfWake', sl && sl.wake != null ? sl.wake : c.wake != null ? c.wake : null, 'Woke up')}</div>
      <div class="rc-fg">${numIn('rcSfH', asleep ? Math.floor(asleep / 60) : '', 'Asleep: hours', 'h', 0, 16)}${numIn('rcSfM', asleep ? asleep % 60 : '', 'and minutes', 'min', 0, 59)}</div>
      <p class="xs dim" id="rcSfHint">${sl && sl.bed != null && sl.wake != null ? `${hm(inBed(sl.bed, sl.wake))} in bed.` : 'Time asleep, not only in bed. Leave it empty to count the time in bed less the time awake.'}</p>
      ${!w ? '' : `<details class="rc-more"${window.__calm === false || c.sscore || c.deep || c.rem || c.light || c.awake || c.rest || c.hrv || c.spo2 || c.br ? ' open' : ''}><summary>More from your watch <span class="xs dim">score, stages, heart</span></summary>${numIn('rcSfSc', c.sscore || '', 'Sleep score (from your watch)', '/ 100', 0, 100)}
      <div class="sp-sub">Stages <span class="xs muted">(minutes)</span></div>
      <div class="rc-fg rc-fg4">${numIn('rcSfDp', c.deep || '', 'Deep', '', 0, 600)}${numIn('rcSfRm', c.rem || '', 'REM', '', 0, 600)}${numIn('rcSfLt', c.light || '', 'Light', '', 0, 900)}${numIn('rcSfAw', c.awake || '', 'Awake', '', 0, 600)}</div>
      <div class="sp-sub">Heart, oxygen and breathing</div>
      <div class="rc-fg">${numIn('rcSfHr', c.rest || n.rest || '', 'Resting heart rate', 'bpm', 25, 130)}${numIn('rcSfHv', c.hrv || n.hrv || '', 'HRV', 'ms', 5, 300)}</div>
      <div class="rc-fg">${numIn('rcSfOx', c.spo2 || '', 'Blood oxygen while asleep', '%', 70, 100)}${numIn('rcSfBr', c.br || '', 'Breathing while asleep', '/min', 5, 40, 0.1)}</div>
      <p class="xs dim mt8">Leave out what your watch doesn't show. ${today ? 'Recovery counts last night\'s sleep, heart rate and HRV.' : ''}</p></details>`}
      <div class="row mt16" style="gap:8px">${checkOf(t) && (c.sleep || (w && (c.rest || c.hrv || c.spo2 || c.br))) ? '<button class="btn" data-act="rcSfClear">Clear</button>' : ''}<button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="rcSfSave">Save</button></div>`, null, () => { if (sf === o) sf = null; });
    sf = o;
  }
  // 1.31: a day's page opens it for that morning (data-t); everywhere else it is last night
  ACT.rcSleepForm = el => { const t = el && el.dataset && +el.dataset.t ? day0(+el.dataset.t) : day0(Date.now()); sf = { t: Math.min(t, day0(Date.now())) }; sfSheet(); };
  const val = id => { const i = $('#' + id); if (!i || String(i.value).trim() === '') return null; const v = +i.value; return isFinite(v) ? v : NaN; };
  const tval = id => { const i = $('#' + id), m = i && /^(\d\d):(\d\d)$/.exec(i.value || ''); return m ? (+m[1]) * 60 + (+m[2]) : null; };
  ACT.rcSfSave = () => {
    const o = sf; if (!o) return;
    const bed = tval('rcSfBed'), wake = tval('rcSfWake'), h = val('rcSfH'), m = val('rcSfM'), sc = val('rcSfSc'), dp = val('rcSfDp'), rm = val('rcSfRm'), lt = val('rcSfLt'), aw = val('rcSfAw'),
      hr = val('rcSfHr'), hv = val('rcSfHv'), ox = val('rcSfOx'), br = val('rcSfBr');
    const bad = (v, a, b) => v != null && (isNaN(v) || v < a || v > b);
    const checks = [[h, 0, 16, 'hours asleep'], [m, 0, 59, 'minutes'], [sc, 0, 100, 'sleep score'], [dp, 0, 600, 'deep sleep'], [rm, 0, 600, 'REM sleep'], [lt, 0, 900, 'light sleep'], [aw, 0, 600, 'time awake'],
      [hr, 25, 130, 'resting heart rate (25 to 130)'], [hv, 5, 300, 'HRV (5 to 300 ms)'], [ox, 70, 100, 'blood oxygen (70 to 100%)'], [br, 5, 40, 'breathing (5 to 40 a minute)']];
    const wrong = checks.find(([v, a, b]) => bad(v, a, b)); if (wrong) { toast(`Check the ${wrong[3]}`); return; }
    let asleep = h != null || m != null ? Math.round((h || 0) * 60 + (m || 0)) : null;
    if (asleep == null && bed != null && wake != null) asleep = Math.max(0, inBed(bed, wake) - (aw || 0));
    if (asleep != null && (asleep < 30 || asleep > 16 * 60)) { toast('Check the time asleep'); return; }
    const sl0 = sleepOf(o.t), c = checkFor(o.t), was = c.sleep;
    // the time asleep as it was shown (from the watch) stays the watch's; a new one is yours
    if (asleep != null && asleep !== was) { const same = !!sl0 && sl0.min === asleep; c.sleep = asleep; c.sby = same ? sl0.by : 'you'; if (same && sl0.app) c.sapp = sl0.app; else if (!same) delete c.sapp; }
    const set = (k, v, r) => { if (v == null) delete c[k]; else c[k] = r ? Math.round(v * r) / r : Math.round(v); };
    set('bed', bed); set('wake', wake);
    if (wOn()) { set('sscore', sc); set('deep', dp); set('rem', rm); set('light', lt); set('awake', aw); set('rest', hr); set('hrv', hv); set('spo2', ox); set('br', br, 10); }      // 1.33: not on the form without a watch, so left as they are
    if (!c.sleep && !c.rest && !c.hrv && !c.spo2 && !c.br && !c.sore && !(c.sp && Object.keys(c.sp).length) && !(c.sg && Object.keys(c.sg).length)) { D.checks = D.checks.filter(x => x !== c); }
    c.at = Date.now(); S.save(true); sf = null; rcEdit = false; A.closeSheet(); A.rerender(); toast('Saved');
  };
  ACT.rcSfClear = () => {
    const o = sf; if (!o) return; const c = checkOf(o.t); if (!c) return; const old = JSON.parse(JSON.stringify(c));
    // 1.33: without a watch the form shows only the times, so only they are cleared: what a watch saved for the night stays
    for (const k of wOn() ? ['sleep', 'sby', 'sscore', 'deep', 'rem', 'light', 'awake', 'bed', 'wake', 'rest', 'hrv', 'spo2', 'br', 'sapp'] : ['sleep', 'sby', 'bed', 'wake', 'sapp']) delete c[k];
    if ((!c.sore || !Object.keys(c.sore).length) && !(c.sp && Object.keys(c.sp).length) && !(c.sg && Object.keys(c.sg).length) && !['sscore', 'deep', 'rem', 'light', 'awake', 'rest', 'hrv', 'spo2', 'br'].some(k => c[k])) D.checks = D.checks.filter(x => x !== c);
    S.save(true); sf = null; A.closeSheet(); A.rerender();
    const T = window.Motion && window.Motion.undoToast;
    if (T) T('Cleared that night', () => { const i = (D.checks || []).findIndex(x => x.id === old.id); if (i >= 0) D.checks[i] = old; else (D.checks = D.checks || []).push(old); S.save(true); A.rerender(); }); else toast('Cleared');
  };
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !sf) return;
    if (t.id === 'rcSfDay') { const m = /^(\d{4})-(\d\d)-(\d\d)$/.exec(t.value || ''); if (!m) return; const v = new Date(+m[1], +m[2] - 1, +m[3]).getTime(); if (v > Date.now()) return; sf.t = day0(v); sfSheet(); }
    else if (t.id === 'rcSfBed' || t.id === 'rcSfWake') { const b = tval('rcSfBed'), w = tval('rcSfWake'), o = $('#rcSfHint'); if (o) o.textContent = b != null && w != null ? `${hm(inBed(b, w))} in bed.` : 'Time asleep, not only in bed. Leave it empty to count the time in bed less the time awake.'; }
  });
  function soreCard(r, g) {
    const groups = F.GROUPS.filter(x => r.trained.has(x)); if (!groups.length) return '';
    return `<div class="card" id="rcSore"><div class="k2">How do your muscles feel?</div><div class="xs muted">The ones you trained in the last few days. It counts for today.</div>
      ${groups.map(x => `<div class="rc-sr"><div class="row"><span class="small grow" style="font-weight:600">${esc(x)}</span><span class="xs muted">${g[x].pct}%</span></div>
        <div class="rc-sc">${SORE.map((t, i) => `<button class="chip ${r.sore[x] === i ? 'on' : ''}" data-act="rcSore" data-g="${esc(x)}" data-v="${i}">${t}</button>`).join('')}</div></div>`).join('')}</div>`;
  }
  ACT.rcSore = el => {
    const c = checkFor(Date.now()), g = el.dataset.g, v = +el.dataset.v; c.sore = c.sore || {};
    if (c.sore[g] === v) delete c.sore[g]; else c.sore[g] = v; c.at = Date.now(); S.save(true); A.rerender();
  };
  function factorsCard(r) {
    const fx = r.fx, slow = fx.list.filter(x => x.tone === 'slow'), icon = { good: '✓', slow: '↓', none: '–' };
    const head = slow.length ? `Your muscles are recovering at about ${Math.round(fx.k * 100)}% of the usual pace` : fx.list.some(x => x.tone === 'good') ? 'Nothing is slowing your recovery today' : 'Answer the questions above to count more than your sets';
    return `<div class="card" id="rcFactors"><div class="k2">What's helping and what's slowing</div><div class="small mt4" style="font-weight:600">${head}</div>
      <div class="rv-lines mt8">${fx.list.map(x => `<div class="rv-l ${x.tone === 'slow' ? 'warn' : x.tone === 'good' ? 'good' : ''}"><span class="rv-i">${icon[x.tone]}</span><div class="grow" style="min-width:0"><div class="small">${esc(x.t)}</div><div class="xs muted">${esc(x.w)}</div></div></div>`).join('')}</div>
      ${slow.length ? `<p class="xs dim mt8">The times on this screen are already about ${Math.round((1 / fx.k - 1) * 100)}% longer because of this.</p>` : ''}</div>`;
  }
  // sleep screenshots from a watch: up to 10 (1.35.2, was 4), read together
  let sl = null;              // { pics, busy, err, res }
  function slSheet() {
    const o = sl; if (!o) return;
    const Fd = window.Food, n = o.pics.length, d = o.res && o.res.day;
    const strip = Fd && Fd.photoStrip ? Fd.photoStrip(o.pics, { tall: true, max: 10, what: 'Screenshot', del: o.busy ? '' : 'rcSlPicDel', add: o.busy ? '' : 'rcSlMore', addText: 'Add a screenshot' }) : '';
    let body = '';
    if (o.busy) body = `<div class="kc-ai"><span class="kc-spin"></span> Reading ${n === 1 ? 'the screenshot' : `the ${n} screenshots together`}…<div class="xs dim mt4">Time asleep, sleep score, deep and REM sleep, resting heart rate and HRV. They are sent to the AI service set up for your account, only to be read, and are not kept.</div></div>`;
    else if (o.err) body = `<p class="small mt8">${esc(o.err)}</p><div class="row mt12" style="gap:8px"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="rcSlAgain">Try again</button></div>`;
    else if (d) {
      const rows = [d.sleep_min ? ['Asleep', hm(d.sleep_min)] : null, d.sleep_score ? ['Sleep score', d.sleep_score] : null, d.deep_min ? ['Deep sleep', hm(d.deep_min)] : null, d.rem_min ? ['REM sleep', hm(d.rem_min)] : null,
        d.hr_rest ? ['Resting heart rate', d.hr_rest] : null, d.hrv_ms ? ['HRV', d.hrv_ms + ' ms'] : null].filter(Boolean).concat((d.other || []).map(x => [x.name, x.value]));
      body = `<div class="kc-read mt8">${rows.map(([k, v]) => `<div class="kc-read-r"><span>${esc(k)}</span><b>${esc(String(v))}</b></div>`).join('')}</div>${d.date_text ? `<p class="xs muted mt8">The night ending ${esc(d.date_text)}</p>` : ''}
        ${o.res.note ? `<p class="xs dim mt4">What the AI saw: ${esc(String(o.res.note).slice(0, 200))}</p>` : ''}${d.sleep_min ? '' : '<p class="xs muted mt8">No time asleep was read: type it on the Recovery screen.</p>'}
        <div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="rcSlSave">Save to last night</button></div>`;
    }
    A.openSheet(`<h2>Last night's sleep</h2>${strip}${body}`, null, () => { if (sl === o) sl = null; });
    sl = o;
  }
  function readSleep(list, ctx) {
    if (window.__sleepAi) return Promise.resolve(window.__sleepAi(list, ctx));                      // tests
    const Cl = window.Cloud;
    if (!Cl || !Cl.configured || !Cl.sleepShots) return Promise.reject({ message: 'Reading screenshots needs a GymDay account.' });
    if (!Cl.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have screenshots read for you.' });
    return Cl.sleepShots(list.map(x => String(x).replace(/^data:image\/\w+;base64,/, '')), ctx).catch(e => {
      if (e && e.status === 404) throw { message: "Reading screenshots isn't switched on for this account's server yet." };
      throw { message: (e && e.message) || "The screenshots couldn't be read. Try again." };
    });
  }
  async function slRead(o) {
    Object.assign(o, { busy: true, err: '', res: null }); slSheet();
    let r; const t = new Date().toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
    try { r = await readSleep(o.pics.map(x => x.big), `Today is ${t}; the night being logged ended this morning`); }
    catch (e) { if (sl !== o) return; o.busy = false; o.err = (e && e.message) || "The screenshots couldn't be read. Try again."; slSheet(); return; }
    if (sl !== o) return;
    o.busy = false;
    if (r && r.shows === 'workout') o.err = "These look like a workout's summary, not a night's sleep. Add them to that workout in History (📷).";
    else if (r && r.day) o.res = r; else o.err = "No sleep numbers could be read in those screenshots. Try your watch app's sleep summary.";
    slSheet();
  }
  ACT.rcSleepShots = async () => { const Fd = window.Food; if (!Fd || !Fd.pickPhotos) return; const pics = await Fd.pickPhotos({ max: 10, limit: 10, side: 1500, q: 0.85 }); if (!pics.length) return; slRead(sl = { pics }); };
  ACT.rcSlMore = async () => { const o = sl; if (!o || o.busy || o.pics.length >= 10) return; const got = await window.Food.pickPhotos({ max: 10 - o.pics.length, limit: 10, side: 1500, q: 0.85 }); if (!got.length || sl !== o) return; o.pics = o.pics.concat(got).slice(0, 10); slRead(o); };
  ACT.rcSlPicDel = el => { const o = sl; if (!o || o.busy || o.pics.length < 2) return; o.pics.splice(+el.dataset.i, 1); slRead(o); };
  ACT.rcSlAgain = () => { if (sl && !sl.busy && sl.pics.length) slRead(sl); };
  // v1.21.11: what the reader lists under "other": "3 h 10 min", "190 min", "1:25", "96%", "14 brpm", "11:40 PM"
  const parseMin = v => { v = String(v || '').toLowerCase(); let m = /(\d+)\s*h(?:ours?|rs?)?\s*(?:(\d+)\s*m)?/.exec(v); if (m) return (+m[1]) * 60 + (+(m[2] || 0));
    m = /^(\d{1,2}):(\d\d)$/.exec(v.trim()); if (m) return (+m[1]) * 60 + (+m[2]); m = /(\d+(?:\.\d+)?)\s*m/.exec(v); if (m) return Math.round(+m[1]); m = /^(\d+)$/.exec(v.trim()); return m ? +m[1] : 0; };
  const parseNum = v => { const m = /(\d+(?:\.\d+)?)/.exec(String(v || '')); return m ? +m[1] : 0; };
  const parseClock = v => { const m = /(\d{1,2})[:.](\d\d)\s*(am|pm)?/i.exec(String(v || '')); if (!m) return null; let h = +m[1] % 24; const ap = (m[3] || '').toLowerCase();
    if (ap === 'pm' && h < 12) h += 12; if (ap === 'am' && h === 12) h = 0; return h * 60 + (+m[2]); };
  function otherNums(list) {
    const o = {};
    for (const x of list || []) {
      const n = String(x.name || '').toLowerCase(), v = x.value;
      if (/light/.test(n)) o.light = parseMin(v);
      else if (/spo2|oxygen|o2 sat/.test(n)) o.spo2 = parseNum(v); else if (/breath|respirat/.test(n)) o.br = parseNum(v);
      else if (/bed ?time|went to bed|fell asleep|sleep start|sleep onset|asleep at|in bed at/.test(n)) o.bed = parseClock(v);
      else if (/woke|wake ?up|wake-up|wakeup|wake time|sleep end|got up/.test(n)) o.wake = parseClock(v);
      else if (/awake/.test(n)) o.awake = parseMin(v);
      else if (/time in bed|sleep time|sleep window/.test(n) && /[–-]|to/.test(String(v))) { const p = String(v).split(/\s*(?:–|-|to)\s*/); if (p.length === 2) { o.bed = parseClock(p[0]); o.wake = parseClock(p[1]); } }
    }
    for (const k of Object.keys(o)) if (o[k] == null || (typeof o[k] === 'number' && !(o[k] > 0) && k !== 'bed' && k !== 'wake')) delete o[k];
    if (o.spo2 && (o.spo2 < 70 || o.spo2 > 100)) delete o.spo2; if (o.br && (o.br < 5 || o.br > 40)) delete o.br;
    return o;
  }
  ACT.rcSlSave = () => {
    const o = sl; if (!o || !o.res || !o.res.day) return; const d = o.res.day, c = checkFor(Date.now());
    if (d.sleep_min > 0) { c.sleep = Math.round(d.sleep_min); c.sby = 'watch'; for (const k of ['sscore', 'deep', 'rem', 'light', 'awake', 'bed', 'wake', 'spo2', 'br']) delete c[k]; }
    for (const [k, f] of [['sscore', 'sleep_score'], ['deep', 'deep_min'], ['rem', 'rem_min'], ['rest', 'hr_rest'], ['hrv', 'hrv_ms']]) if (d[f] > 0) c[k] = Math.round(d[f]);
    const ex = otherNums(d.other); for (const k of Object.keys(ex)) c[k] = k === 'br' ? Math.round(ex[k] * 10) / 10 : Math.round(ex[k]);
    if (d.app) c.sapp = String(d.app).slice(0, 40); c.at = Date.now();
    S.save(true); sl = null; rcEdit = false; A.closeSheet(); A.rerender(); toast('Saved');
  };

  // 1.33 (9): last night's sleep in one step, from the Today page's Sleep tile
  function saveSleep(min) {
    const c = checkFor(Date.now()); c.sleep = Math.round(min); c.sby = 'you'; delete c.sscore; delete c.deep; delete c.rem; delete c.sapp; c.at = Date.now(); S.save(true);
  }
  window.Progress = { saveSleep, recovery, factors, sleepOf, sleepNeed, nightOf, otherNums, groupRecovery, dayRest, balance, classOf, levelOf, stdOf, hardRun, easyNow, makeEasy, SITES, STD,
    // 1.31 (daily.js): the stages bar, the time in bed and a night's usual heart numbers, as Recovery draws and counts them
    stageBar, inBed, usualOf: (k, t) => usual(k === 'hrv' ? hrvOn : restOn, t),
    checkOf, checkFor, keyOf, day0 };      // 1.35: for the soreness tracker (sore.js)
})();
