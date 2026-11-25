/* GymDay – added in v1.6: "still training?" for a workout left running, stuck alerts, your own badges,
   the year in review, and a picture of your own for custom exercises. */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta, I = window.Insights;
  const { $, esc, ACT, VIEWS } = A;
  const toast = m => window.toast(m);
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const DAY = 86400000, WEEK = 7 * DAY;
  const sheetOpen = () => !$('#sheet').classList.contains('hidden');
  const onDay = t => { const d = A.fmtDate(t); return /^(Today|Yesterday)$/.test(d) ? d.toLowerCase() : 'on ' + d; };

  // ============================================================== "Still training?" (a workout left running)
  const STILL_MS = 2 * 3600000;           // the owner's choice: ask after 2 hours with no set ticked
  const lastTick = a => { let t = 0; for (const it of a.items) for (const x of (it.sets || [])) if (x.done && x.t > t) t = x.t; return t; };
  // the last sign of life: start, an exercise started or finished, a set ticked, or "yes, still going"
  function lastTouch(a) {
    let t = Math.max(a.start || 0, a.stillAt || 0, a.pauseAt || 0, lastTick(a));
    for (const it of a.items) { if (it.run > t) t = it.run; if (it.finAt > t) t = it.finAt; }
    return t;
  }
  let stillFor = 0;                       // the state we last asked about, so the question is not repeated every minute
  function stillCheck() {
    const a = D.active; if (!a || sheetOpen()) return;
    const t = lastTouch(a); if (Date.now() - t < STILL_MS || stillFor === t) return;
    stillFor = t;
    const tick = lastTick(a), ran = A.fmtDur(Date.now() - a.start);
    A.openSheet(`<h2>Still training?</h2>
      <p class="muted">${esc(a.dayName || 'Your workout')} has been running for ${ran}. ${tick ? `Your last set was ticked ${onDay(tick)} at ${A.fmtClock(tick)}.` : 'No set has been ticked yet.'}</p>
      <div class="menu mt16">
        <button class="btn block" data-act="stillYes">Yes, still going</button>
        ${tick ? `<button class="btn block" data-act="stillEnd" data-t="${tick}">Finish it at ${A.fmtClock(tick)}, my last set</button>` : ''}
        ${tick ? `<button class="btn block" data-act="stillEnd" data-t="0">Finish it now</button>` : `<button class="btn danger block" data-act="discard">Throw this workout away</button>`}
      </div>`);
  }
  ACT.stillYes = () => { if (D.active) { D.active.stillAt = Date.now(); stillFor = 0; S.save(true); } A.closeSheet(); };
  ACT.stillEnd = el => { const t = +el.dataset.t || 0; A.closeSheet(); if (D.active) A.saveSession(t || undefined); };
  setInterval(() => { if (!document.hidden) stillCheck(); }, 60000);
  const resume0 = window.appResume; window.appResume = () => { if (resume0) resume0(); setTimeout(stillCheck, 400); };
  setTimeout(stillCheck, 1500);

  // ============================================================== stuck alerts
  const STUCK_DAYS = 28;                  // the owner's choice: 4 weeks without progress
  const TIPS = ['Try fewer reps with a little more weight for two weeks.', 'Take one lighter week at about 90%, then come back to it.', 'Add one more set at the same weight before going heavier.'];
  // how strong a set is: weight scaled by reps (so 60 × 8 beats 60 × 6); reps alone for body-weight moves
  const strength = x => { const w = A.num(x.w), r = A.num(x.r); return w > 0 ? (A.repsOn() && r > 0 ? w * (1 + Math.min(r, 12) / 30) : w) : r; };
  function stuckList(all) {
    if (D.settings.stuck === false) return [];
    const now = Date.now(), from = now - STUCK_DAYS * DAY, back = from - 56 * DAY, per = {}, hide = M.stuckHide || {};
    for (const s of D.sessions) {
      if (s.start < back || s.keep === false) continue;
      for (const it of s.items) {
        if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex || ex.track === 'time') continue;
        let best = 0; for (const x of (it.sets || [])) if (x.done) best = Math.max(best, strength(x));
        if (!best) continue;
        const p = per[ex.id] || (per[ex.id] = { ex, recent: 0, rn: 0, prev: 0, pn: 0 });
        if (s.start >= from) { p.rn++; p.recent = Math.max(p.recent, best); } else { p.pn++; p.prev = Math.max(p.prev, best); }
      }
    }
    // stuck = done at least 3 times in these 4 weeks, with no better set than before, and not simply coming back from a break
    return Object.values(per).filter(p => p.rn >= 3 && p.pn >= 1 && p.recent <= p.prev * 1.001 && p.recent >= p.prev * 0.9 && (all || !(hide[p.ex.id] > now - 14 * DAY)))
      .sort((x, y) => y.rn - x.rn || x.ex.name.localeCompare(y.ex.name));
  }
  const tipFor = id => TIPS[[...String(id)].reduce((n, c) => n + c.charCodeAt(0), 0) % TIPS.length];
  function stuckCard() {
    const list = stuckList().slice(0, 2); if (!list.length) return '';
    return `<div class="card" id="stuckCard"><h3>Stuck for 4 weeks</h3>${list.map(p => `<div class="stuck"><div class="grow" data-act="openEx" data-id="${esc(p.ex.id)}"><div class="small"><b>${esc(p.ex.name)}</b> hasn't gone up.</div><div class="xs muted">${tipFor(p.ex.id)}</div></div>
      ${window.Plus && window.Plus.platCard ? `<button class="btn sm" data-act="platStart" data-id="${esc(p.ex.id)}">3-week plan</button>` : ''}<button class="btn sm ghost" data-act="stuckOk" data-id="${esc(p.ex.id)}">Got it</button></div>`).join('')}</div>`;
  }
  ACT.stuckOk = el => { (M.stuckHide || (M.stuckHide = {}))[el.dataset.id] = Date.now(); S.saveMeta(); A.rerender(); };

  // ============================================================== your own badges
  const kg = v => v * (D.settings.unit === 'lb' ? 0.45359237 : 1);
  function totals() {
    const t = { n: D.sessions.length, vol: 0, dayVol: 0, prs: 0, ms: 0, early: 0, weekMax: 0, exN: 0, streak: 0 };
    const weeks = {}, exs = new Set();
    for (const s of D.sessions) {
      let v = 0;
      for (const it of s.items) { if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue; const done = (it.sets || []).filter(x => x.done); if (!done.length) continue; exs.add(ex.id); if (ex.track !== 'time') done.forEach(x => { v += A.num(x.w) * A.num(x.r); }); }
      v = kg(v); t.vol += v; if (v > t.dayVol) t.dayVol = v;
      t.prs += (s.prs || []).length; t.ms += Math.max(0, S.gymMs(s));
      if (new Date(s.start).getHours() < 7) t.early++;
      const w = A.weekStartOf(s.start); weeks[w] = (weeks[w] || 0) + 1;
    }
    t.exN = exs.size;
    const keys = Object.keys(weeks).map(Number).sort((a, b) => a - b); let run = 0, prev = null;
    for (const w of keys) { run = prev !== null && Math.abs(w - prev - WEEK) < 2 * 3600000 ? run + 1 : 1; prev = w; if (run > t.streak) t.streak = run; if (weeks[w] > t.weekMax) t.weekMax = weeks[w]; }
    return t;
  }
  const big = n => Math.round(n).toLocaleString('en-US');
  const BADGES = [
    ['first', '🎬', 'First workout', 'Finish one workout', t => [t.n, 1]],
    ['w10', '🔟', '10 workouts', 'Finish 10 workouts', t => [t.n, 10]],
    ['w25', '🥉', '25 workouts', 'Finish 25 workouts', t => [t.n, 25]],
    ['w50', '🥈', '50 workouts', 'Finish 50 workouts', t => [t.n, 50]],
    ['w100', '💯', '100 workouts', 'Finish 100 workouts', t => [t.n, 100]],
    ['w250', '👑', '250 workouts', 'Finish 250 workouts', t => [t.n, 250]],
    ['s4', '🔥', '4 weeks in a row', 'Train every week for 4 weeks', t => [t.streak, 4]],
    ['s8', '🔥', '8 weeks in a row', 'Train every week for 8 weeks', t => [t.streak, 8]],
    ['s12', '☄️', '12 weeks in a row', 'Train every week for 12 weeks', t => [t.streak, 12]],
    ['week5', '⚡', '5 in a week', 'Finish 5 workouts in one week', t => [t.weekMax, 5]],
    ['v1k', '🏋️', '1,000 kg day', 'Lift 1,000 kg in one workout (weight × reps, added up)', t => [t.dayVol, 1000]],
    ['v5k', '🏋️', '5,000 kg day', 'Lift 5,000 kg in one workout', t => [t.dayVol, 5000]],
    ['v10k', '🦾', '10,000 kg day', 'Lift 10,000 kg in one workout', t => [t.dayVol, 10000]],
    ['t100', '🚚', '100 tonnes', 'Lift 100,000 kg in total', t => [t.vol, 100000]],
    ['pr1', '🏆', 'First record', 'Set a personal record', t => [t.prs, 1]],
    ['pr10', '🏆', '10 records', 'Set 10 personal records', t => [t.prs, 10]],
    ['pr50', '🎯', '50 records', 'Set 50 personal records', t => [t.prs, 50]],
    ['h24', '⏱', 'A full day', 'Spend 24 hours in the gym in total', t => [t.ms / 3600000, 24]],
    ['h100', '⏳', '100 hours', 'Spend 100 hours in the gym in total', t => [t.ms / 3600000, 100]],
    ['early', '🌅', 'Early bird', 'Start 5 workouts before 7 am', t => [t.early, 5]],
    ['var20', '🧭', 'Explorer', 'Log 20 different exercises', t => [t.exN, 20]],
  ];
  // Marks what has been earned (kept in settings.badges with the date) and returns the ones earned just now.
  // The very first check only takes stock, so an update does not announce twenty old badges at once.
  function checkBadges() {
    const first = !D.settings.badges, have = D.settings.badges || (D.settings.badges = {}), t = totals(), fresh = [];
    for (const b of BADGES) { const [v, need] = b[4](t); if (v >= need && !have[b[0]]) { have[b[0]] = Date.now(); if (!first) fresh.push(b); } }
    if (fresh.length || first) S.save();
    return fresh;
  }
  VIEWS.badges = {
    html() {
      checkBadges(); const have = D.settings.badges || {}, t = totals(), got = BADGES.filter(b => have[b[0]]).length;
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Badges</h1><div class="sub">${got} of ${BADGES.length} earned</div></div></div><div class="bgrid">`;
      for (const b of BADGES) {
        const [v, need] = b[4](t), on = !!have[b[0]];
        h += `<div class="bdg ${on ? 'on' : ''}"><div class="em">${b[1]}</div><div class="nm">${b[2]}</div><div class="xs ${on ? 'muted' : 'dim'}">${on ? 'Earned ' + onDay(have[b[0]]) : esc(b[3])}</div>
          ${on ? '' : `<div class="meter"><div style="width:${Math.min(100, (v / need) * 100)}%"></div></div><div class="xs dim">${big(Math.min(v, need))} of ${big(need)}</div>`}</div>`;
      }
      return h + `</div><p class="xs dim mt12">Badges count everything on this phone, with or without a club.</p>`;
    }
  };
  ACT.openBadges = () => A.go('badges');
  // new badges show on the "Workout saved" summary
  let lastNew = { id: null, list: [] };
  const summary0 = I.summaryExtra;
  I.summaryExtra = s => {
    if (lastNew.id !== s.id) lastNew = { id: s.id, list: checkBadges() };
    return summary0(s) + lastNew.list.map(b => `<div class="pr">🎖 New badge: ${b[1]} ${esc(b[2])}</div>`).join('');
  };

  // ============================================================== the year in review
  const yr = { y: new Date().getFullYear() };
  function yearStats(y) {
    const a = new Date(y, 0, 1).getTime(), b = new Date(y + 1, 0, 1).getTime(), months = [], out = { n: 0, ms: 0, sets: 0, vol: 0, prs: 0 };
    for (let m = 0; m < 12; m++) { const t = I.monthStats(y, m); months.push(t); out.n += t.n; out.ms += t.ms; out.sets += t.sets; out.vol += t.vol; out.prs += t.prs; }
    out.months = months;
    const ss = D.sessions.filter(s => s.start >= a && s.start < b), exN = {}, wd = [0, 0, 0, 0, 0, 0, 0], weeks = new Set(); let longest = null, heavy = null;
    for (const s of ss) {
      const d = S.gymMs(s); if (!longest || d > longest.d) longest = { d, s };
      wd[new Date(s.start).getDay()]++; weeks.add(A.weekStartOf(s.start));
      for (const it of s.items) {
        if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue; const done = (it.sets || []).filter(x => x.done); if (!done.length) continue;
        exN[ex.id] = (exN[ex.id] || 0) + 1;
        if (ex.track !== 'time') done.forEach(x => { const w = A.num(x.w); if (w > 0 && (!heavy || w > heavy.w)) heavy = { w, r: A.num(x.r), ex }; });
      }
    }
    const top = Object.entries(exN).sort((p, q) => q[1] - p[1])[0]; out.topEx = top ? { ex: S.getEx(top[0]), n: top[1] } : null;
    const mu = I.muscleStats(a, b).sets, g = Object.keys(mu).sort((p, q) => mu[q] - mu[p])[0]; out.topG = g && mu[g] ? g : null;
    out.longest = longest; out.heavy = heavy; out.wd = ss.length ? wd.indexOf(Math.max(...wd)) : null; out.wdN = Math.max(...wd);
    const ws = [...weeks].sort((p, q) => p - q); let run = 0, best = 0, prev = null;
    for (const w of ws) { run = prev !== null && Math.abs(w - prev - WEEK) < 2 * 3600000 ? run + 1 : 1; prev = w; if (run > best) best = run; }
    out.streak = best; out.bestM = out.n ? months.map((t, i) => [t.n, i]).sort((p, q) => q[0] - p[0])[0][1] : null;
    out.badges = Object.values(D.settings.badges || {}).filter(t => t >= a && t < b).length;
    return out;
  }
  const WDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  VIEWS.year = {
    html() {
      const now = new Date(), cur = yr.y === now.getFullYear(), t = yearStats(yr.y);
      const tile = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${yr.y}</h1><div class="sub">${cur ? 'Your year so far' : 'Your year'}</div></div>
        <button class="btn icon" data-act="yearStep" data-d="-1" aria-label="Earlier year">‹</button><button class="btn icon" data-act="yearStep" data-d="1" aria-label="Later year" ${cur ? 'disabled' : ''}>›</button></div>`;
      if (!t.n) return h + `<div class="empty"><div class="big">🗓</div><h2>No workouts${cur ? ' yet' : ''}</h2><p>${cur ? 'Finish a workout and this year starts filling in.' : 'Nothing was logged in this year.'}</p></div>`;
      h += `<div class="stats">${tile(t.n, t.n === 1 ? 'workout' : 'workouts')}${tile(A.fmtDur(t.ms), 'in the gym')}</div><div class="stats">${tile(big(t.sets), 'sets')}${A.repsOn() && t.vol ? tile(A.fmtBig(t.vol), A.unit() + ' lifted') : ''}</div>`;
      const max = Math.max(1, ...t.months.map(m => m.n));
      h += `<div class="card"><h3>Workouts each month</h3><div class="ybars">${t.months.map((m, i) => `<div class="yb ${i === t.bestM ? 'best' : ''}"><span class="n">${m.n || ''}</span><i style="height:${m.n ? Math.max(6, (m.n / max) * 100) : 2}%"></i><span class="m">${A.MONTHS_LONG[i].slice(0, 1)}</span></div>`).join('')}</div></div>`;
      const row = (k, v) => `<div class="cmp-row"><span class="grow muted">${k}</span><span style="text-align:right">${v}</span></div>`;
      h += `<div class="card">`;
      if (t.bestM !== null) h += row('Best month', `${A.MONTHS_LONG[t.bestM]} · ${plural(t.months[t.bestM].n, 'workout')}`);
      if (t.streak > 1) h += row('Longest run', `🔥 ${t.streak} weeks in a row`);
      if (t.prs) h += row('New records', `🏆 ${t.prs}`);
      if (t.badges) h += row('Badges earned', `🎖 ${t.badges}`);
      if (t.heavy) h += row('Heaviest lift', `${esc(t.heavy.ex.name)} · ${A.fmtW(t.heavy.w)} ${A.unit()}${t.heavy.r ? ' × ' + t.heavy.r : ''}`);
      if (t.topG) h += row('Most trained', esc(t.topG));
      if (t.topEx && t.topEx.ex) h += row('Most done exercise', `${esc(t.topEx.ex.name)} · ${t.topEx.n}×`);
      if (t.longest) h += row('Longest workout', `${A.fmtDur(t.longest.d)} · ${esc(t.longest.s.dayName)}`);
      if (t.wd !== null) h += row('Favourite day', `${WDAY[t.wd]} · ${t.wdN}×`);
      return h + `</div>`;
    },
    leave() { yr.y = new Date().getFullYear(); }
  };
  ACT.openYear = () => A.go('year');
  ACT.yearStep = el => { yr.y = Math.min(new Date().getFullYear(), yr.y + (+el.dataset.d)); A.rerender(); };

  // ============================================================== a picture of your own for a custom exercise
  // Kept inside the exercise itself as a small JPEG, so it shows everywhere a library picture does and travels with the account.
  function pickPicture(w, h) {
    if (window.__pickImage) return Promise.resolve(window.__pickImage());              // tests
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]; inp.remove(); if (!f) { resolve(null); return; }
        const url = URL.createObjectURL(f), img = new Image();
        img.onload = () => {
          const k = Math.max(w / img.naturalWidth, h / img.naturalHeight), sw = w / k, sh = h / k, c = document.createElement('canvas'); c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, (img.naturalWidth - sw) / 2, (img.naturalHeight - sh) / 2, sw, sh, 0, 0, w, h);
          URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.72));
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast("That picture couldn't be opened"); resolve(null); };
        img.src = url;
      });
      inp.click();
    });
  }
  const custom = id => (D.customEx || []).find(e => e.id === id);
  ACT.customPic = async el => {
    const ex = custom(el.dataset.id); if (!ex) return;
    const pic = await pickPicture(480, 360); if (!pic) return;
    ex.img = [pic]; S.save(true); A.rerender(); toast('Picture saved');
  };
  ACT.customPicNone = el => { const ex = custom(el.dataset.id); if (!ex) return; delete ex.img; S.save(true); A.rerender(); toast('Picture removed'); };

  // what the exercise page adds: a stuck note, and the picture buttons for a custom exercise
  function exerciseExtra(ex) {
    let h = '';
    const st = stuckList(true).find(p => p.ex.id === ex.id);
    if (st && !(window.Plus && window.Plus.platCard)) h += `<div class="card"><div class="small"><b>Stuck for 4 weeks.</b> Your best set hasn't gone up.</div><div class="xs muted mt4">${tipFor(ex.id)}</div></div>`;      // v1.27: the plateau plan's card says it instead
    if (String(ex.id).startsWith('c-')) {
      const has = ex.img && ex.img.length;
      h += `<button class="btn block mt8" data-act="customPic" data-id="${esc(ex.id)}">${has ? 'Change the picture' : 'Add a picture'}</button>`;
      if (has) h += `<button class="btn ghost block mt8" data-act="customPicNone" data-id="${esc(ex.id)}">Remove the picture</button>`;
    }
    return h;
  }
  const settingsRows = () => `<div class="row" style="padding:6px 0"><div class="grow">Stuck alerts<div class="xs dim">Tells you when an exercise hasn't gone up in 4 weeks</div></div><input type="checkbox" data-bind="optStuck" ${D.settings.stuck !== false ? 'checked' : ''} style="width:22px;height:22px"></div>`;
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optStuck') { D.settings.stuck = t.checked; S.save(); } });

  const home0 = I.homeCards; I.homeCards = () => home0() + stuckCard();
  window.Extras = { lastTouch, lastTick, stillCheck, STILL_MS, stuckList, totals, checkBadges, BADGES, yearStats, exerciseExtra, settingsRows };
})();
