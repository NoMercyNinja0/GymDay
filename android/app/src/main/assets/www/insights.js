/* GymDay – looking at your training: muscles of the week, monthly recap, lift goals, how a workout felt,
   body weight, plus the optional weekly schedule, ready-made plans and the short tour. */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta;
  const { $, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  const DAY = 86400000, WD = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const dm = ts => { const d = new Date(ts); return `${d.getDate()} ${A.MONTHS_LONG[d.getMonth()].slice(0, 3)}`; };

  // =====================================================================================================
  // Muscles: sets per body part in a week, a body picture, and how long each part has rested
  // =====================================================================================================
  const BODY = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];
  const GROUP_OF = [[/forearm|brachiorad|grip|wrist/i, 'Forearms'], [/chest|pec/i, 'Chest'], [/delt|shoulder|rotator/i, 'Shoulders'], [/tricep/i, 'Triceps'], [/bicep|brachialis/i, 'Biceps'],
    [/\blats?\b|trap|rhomboid|back|erector|teres/i, 'Back'], [/quad/i, 'Quads'], [/hamstring/i, 'Hamstrings'], [/glute/i, 'Glutes'], [/calf|calves|soleus/i, 'Calves'], [/\babs?\b|core|oblique/i, 'Core']];
  const groupOf = name => { for (const [re, g] of GROUP_OF) if (re.test(name)) return g; return null; };
  // A ticked set counts fully for the exercise's own body part and half for each other part it also works.
  function muscleStats(from, to) {
    const sets = {}, last = {}; BODY.forEach(g => { sets[g] = 0; last[g] = 0; });
    for (const s of D.sessions) for (const it of s.items) {
      if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
      const n = it.sets.filter(S.work).length; if (!n) continue;
      const g = BODY.includes(ex.group) ? ex.group : groupOf((ex.primary || []).join(' '));
      const also = [...new Set((ex.secondary || []).map(groupOf).filter(x => x && x !== g))];
      [g].concat(also).forEach(x => { if (x && s.start > last[x]) last[x] = s.start; });      // any work counts towards "when was it last used"
      if (s.start < from || s.start >= to) continue;
      if (g) sets[g] += n;
      also.forEach(x => { sets[x] += n / 2; });
    }
    return { sets, last };
  }
  const lvl = v => (v >= 10 ? 3 : v >= 5 ? 2 : v > 0 ? 1 : 0), COL = ['var(--bf-mus)', 'var(--bf-h1)', 'var(--bf-h2)', 'var(--bf-h3)'];      // 1.35: the anatomy figure's colours
  const fmtSets = v => (Number.isInteger(v) ? String(v) : v.toFixed(1));
  // The body figure itself is drawn in body.js. level(part) = 0 … 3.
  // level(areaId) = 0 … 3; opt: see BodyFig.svg. Under the two figures sits the line that names a tapped part.
  const F = window.BodyFig;
  // v1.20: one big figure at a time, twice the old height so every part is easy to tap, with Front and Back to flip it. It opens on
  // the side with more to see (more parts coloured); a side picked by hand stays for that kind of map until the app is closed.
  const sideOf = {};
  const bodies = (level, cls, opt) => {
    const kind = String(cls || 'std').split(' ')[0] || 'std', lit = b => F.AREAS.filter(x => x.view.includes(b ? 'b' : 'f') && (level(x.id) | 0) > 0).length;
    const side = (opt && opt.side) || sideOf[kind] || (lit(true) > lit(false) ? 'b' : 'f'), fig = b => F.svg(level, b, opt).replace('class="bodyfig anat"', `class="bodyfig anat big ${cls || ''}"`);
    const chip = (v, nm) => `<button class="chip ${side === v ? 'on' : ''}" data-act="bfSide" data-v="${v}" aria-pressed="${side === v}">${nm}</button>`;
    // 1.35: the big maps zoom (bodyzoom.js): tap an area, then the part; the small ones (an exercise's or a workout's page) open full screen with ⤢
    const Z = window.BodyZoom, small = kind === 'sm', zc = small || !Z ? '' : ' bz';
    const full = small && Z ? `<button class="bf-full" data-act="bodyFull" data-r="${Z.register({ level, opt: Object.assign({}, opt, { legend: undefined }), legend: (opt && opt.legend) || '' })}" aria-label="Open the body map full screen">⤢</button>` : '';
    return `<div class="bodies one" data-side="${side}" data-kind="${kind}"><div class="bp-side bf-side" role="group" aria-label="Side of the body">${chip('f', 'Front')}${chip('b', 'Back')}</div>${full}
      <div class="bf-f${zc}" data-bzk="${kind}-f">${fig(false)}</div><div class="bf-b${zc}" data-bzk="${kind}-b">${fig(true)}</div></div><div class="bf-tip">${(opt && opt.hint) || (zc ? 'Tap an area to zoom in, then tap a part' : 'Tap a part of the body to see its name')}</div>`;
  };
  ACT.bfSide = el => {
    const w = el.closest('.bodies'); if (!w) return; const v = el.dataset.v === 'b' ? 'b' : 'f';
    w.dataset.side = v; sideOf[w.dataset.kind] = v;
    w.querySelectorAll('.bf-side .chip').forEach(c => { const on = c.dataset.v === v; c.classList.toggle('on', on); c.setAttribute('aria-pressed', String(on)); });
  };
  // The parts of the muscles an exercise works and how hard (1.35: BodyFig.levels, 3 = what it is for, 2 = works it well,
  // 1 = helps): main = its hardest-worked parts, help = the rest. w(part) = how much a set counts for that part.
  const W = [0, 0.25, 0.5, 1];
  function exAreas(ex) {
    const lv = F.levels(ex), top = Math.max(0, ...Object.values(lv)), main = new Set(), help = new Set();
    for (const [a, l] of Object.entries(lv)) (l === top ? main : help).add(a);
    return { main, help, lv, w: a => (main.has(a) ? 1 : W[lv[a] | 0] || 0) };
  }
  // Ticked sets per part: a full set for each part the exercise is for, half for a part it works well, a quarter for one it helps.
  function areaSets(sessions) {
    const sets = {}; F.AREAS.forEach(a => { sets[a.id] = 0; });
    for (const s of sessions) for (const it of (s.items || [])) {
      if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
      const n = (it.sets || []).filter(S.work).length; if (!n) continue;
      const p = exAreas(ex);
      for (const a of Object.keys(p.lv)) if (a in sets) sets[a] += n * p.w(a);
    }
    for (const a of Object.keys(sets)) sets[a] = Math.round(sets[a] * 100) / 100;
    return sets;
  }
  const setsTip = (sets, when) => id => `${F.name(id)} · ${sets[id] ? fmtSets(sets[id]) + (sets[id] === 1 ? ' set' : ' sets') : 'not worked'} ${when}`;
  // the body parts an exercise works: its main ones, and the ones that help
  function partsOf(ex) {
    const main = new Set(); if (BODY.includes(ex.group)) main.add(ex.group);
    (ex.primary || []).forEach(m => { const g = groupOf(m); if (g) main.add(g); });
    const help = new Set((ex.secondary || []).map(groupOf).filter(g => g && !main.has(g)));
    return { main: [...main], help: [...help] };
  }
  // One workout: ticked sets per body part (full credit for the exercise's own part, half for each helper), as a picture.
  function sessionSets(s) {
    const sets = {}; BODY.forEach(g => { sets[g] = 0; });
    for (const it of (s.items || [])) {
      if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
      const n = (it.sets || []).filter(S.work).length; if (!n) continue;
      const g = BODY.includes(ex.group) ? ex.group : groupOf((ex.primary || []).join(' '));
      if (g) sets[g] += n;
      [...new Set((ex.secondary || []).map(groupOf).filter(x => x && x !== g))].forEach(x => { sets[x] += n / 2; });
    }
    return sets;
  }
  function sessionBody(s) {
    const sets = sessionSets(s), got = BODY.filter(g => sets[g] > 0).sort((a, b) => sets[b] - sets[a]); if (!got.length) return '';
    const parts = areaSets([s]);
    const lv = v => (v >= 6 ? 3 : v >= 3 ? 2 : v > 0 ? 1 : 0);
    return `<div class="card bodycard"><h3>Muscles worked</h3>${bodies(id => lv(parts[id] || 0), 'sm', { tip: setsTip(parts, 'in this workout'), legend: '<div class="xs dim">Brighter means more sets in this workout.</div>' })}
      <div class="mt8">${got.map(g => `<span class="pill ${lv(sets[g]) === 3 ? 'accent' : ''}">${g} · ${fmtSets(sets[g])}</span>`).join('')}</div>
      <div class="xs dim">Sets per body part in this workout. Brighter means more.</div></div>`;
  }
  // 1.35: every part the exercise works, in three steps: what it is for (deep red), what it works well, what it helps
  function exerciseBody(ex) {
    const p = exAreas(ex); if (!p.main.size && !p.help.size) return '';
    const level = id => (p.main.has(id) ? 3 : p.lv[id] >= 2 ? 2 : p.lv[id] ? 1 : 0);
    const WHAT = ['not used here', 'helps', 'works it well', 'what it is for'];
    const of = l => F.PARTS.filter(id => level(id) === l).map(id => esc(F.name(id))).join(', ');
    const row = (l, t) => (of(l) ? `<div class="bf-leg"><i style="background:${COL[l]}"></i><span><b>${t}:</b> ${of(l)}</span></div>` : '');
    const legs = `<div class="bf-legs">${row(3, 'Hits hardest')}${row(2, 'Works well')}${row(1, 'Helps')}</div>`;
    return `<div class="card bodycard"><h3>Where you feel it</h3>${bodies(level, 'sm', { tip: id => F.name(id) + ' · ' + WHAT[level(id)], legend: legs })}${legs}</div>`;
  }
  let mOff = 0;      // 0 = this week, -1 = last week …
  VIEWS.muscles = {
    html() {
      const from = A.weekStartOf(Date.now(), -mOff), to = A.weekStartOf(Date.now(), -mOff - 1);
      const { sets, last } = muscleStats(from, to), max = Math.max(1, ...BODY.map(g => sets[g]));
      const parts = areaSets(D.sessions.filter(s => s.start >= from && s.start < to));
      const order = BODY.slice().sort((a, b) => sets[b] - sets[a]), missed = BODY.filter(g => !sets[g]), got = order.filter(g => sets[g] > 0);
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Muscles</h1><div class="sub">${mOff === 0 ? 'This week' : mOff === -1 ? 'Last week' : 'Week of ' + dm(from)} · ${dm(from)} – ${dm(to - 1)}</div></div>
        <button class="btn icon" data-act="muscleWeek" data-d="-1" aria-label="Earlier week">‹</button><button class="btn icon" data-act="muscleWeek" data-d="1" aria-label="Later week" ${mOff >= 0 ? 'disabled' : ''}>›</button></div>
        <div class="card">${bodies(id => lvl(parts[id] || 0), '', { tip: setsTip(parts, mOff === 0 ? 'this week' : 'that week') })}
        <div class="legend">${['none', '1–4 sets', '5–9', '10+'].map((t, i) => `<span><i style="background:${COL[i]}"></i>${t}</span>`).join('')}</div></div>`;
      if (!got.length) h += `<div class="card"><p class="small muted">No workouts logged in this week${mOff === 0 ? ' yet' : ''}.</p></div>`;
      else {
        const lo = got[got.length - 1], hi = got[0];
        h += `<div class="card"><p class="small">${got.length > 1 && sets[hi] >= 2 * sets[lo] ? `<b>${hi}</b> got ${fmtSets(sets[hi])} set${sets[hi] === 1 ? '' : 's'}, <b>${lo}</b> only ${fmtSets(sets[lo])}.` : `${plural(got.length, 'body part')} trained.`}${missed.length ? ` <span class="muted">Not trained${mOff === 0 ? ' yet' : ''}: ${missed.join(', ')}.</span>` : ''}</p></div>`;
      }
      // v1.27: against the person's own weekly target for each body part (Plus.setsGoal), 10 unless they set one
      const goalOf = g => (window.Plus && window.Plus.setsGoal ? window.Plus.setsGoal(g) : 10), own = !!(window.Plus && window.Plus.customGoals && window.Plus.customGoals());
      const capOf = g => Math.max(20, goalOf(g) + 10);
      const SC = Math.max(25, max, ...BODY.map(capOf)), inR = BODY.filter(g => sets[g] >= goalOf(g) && sets[g] <= capOf(g)).length;      // one scale with room for every band
      h += `<div class="card"><div class="row mb8"><div class="grow small"><b>${inR} of ${BODY.length}</b> ${own ? 'body parts at your weekly target' : 'body parts in the 10–20 sets range'}${mOff === 0 ? ' so far' : ''}</div>${own ? '' : '<span class="mzkey"><i class="mband"></i>10–20</span>'}<button class="btn sm" data-act="setsGoalOpen" style="margin-left:8px">${own ? 'Your targets' : 'Set targets'}</button></div>`;
      for (const g of order) {
        const days = last[g] ? Math.floor((Date.now() - last[g]) / DAY) : null;
        const rest = mOff !== 0 ? '' : days == null ? `<span class="dim">never trained</span>` : days >= 2 ? `<span class="green">ready</span> <span class="dim">· ${days} days rest</span>` : `<span class="accent">resting</span> <span class="dim">· worked ${days ? 'yesterday' : 'today'}</span>`;
        const mine = F.PARTS.filter(id => F.group(id) === g);       // the parts of this body part, with their own sets
        const sub = mine.length > 1 && mine.some(id => parts[id]) ? `<div class="mparts">${mine.map(id => `<span class="${parts[id] ? '' : 'zero'}">${esc(F.name(id))} <b>${fmtSets(parts[id] || 0)}</b></span>`).join('')}</div>` : '';
        const v = sets[g], gl = goalOf(g), cap = capOf(g), z = v > cap ? 'hi' : v >= gl ? 'ok' : 'lo';          // v1.20: against the 10 to 20 hard sets a week many lifters aim for
        const zt = gl === 10 ? (z === 'ok' ? 'in 10–20 ✓' : z === 'hi' ? 'over 20' : mOff === 0 ? `${fmtSets(10 - v)} to 10` : 'under 10')
          : (z === 'ok' ? `your ${gl} ✓` : z === 'hi' ? `over ${cap}` : mOff === 0 ? `${fmtSets(gl - v)} to your ${gl}` : `under your ${gl}`);
        h += `<div class="mrow"><div class="row"><span class="nm grow">${g}</span><span class="xs">${rest}</span><span class="n">${fmtSets(v)}</span></div><div class="bar mz10"><i class="mband" style="left:${(gl * 100 / SC).toFixed(2)}%;width:${((cap - gl) * 100 / SC).toFixed(2)}%"></i><div class="mz-${z}" style="width:${Math.min(100, v / SC * 100).toFixed(1)}%"></div></div>
          <div class="mzt mz-${z}">${zt}</div>${sub}</div>`;
      }
      return h + `</div><p class="xs dim" style="margin:0 2px">A ticked set counts fully for the exercise's own body part and half for each other part it also works. The small numbers under a body part are its parts: a set counts for every part the exercise is for. Many lifters aim for roughly 10 to 20 sets a week for each body part.</p>`;
    },
    leave() { mOff = 0; }
  };
  ACT.openMuscles = () => A.go('muscles');

  // ---------------- Library by body part: one big figure, front or back, tap a part, see the exercises that hit it ----------------
  // The figure fills the screen (v1.8) so every part is easy to hit with a thumb; Front and Back switch sides.
  let bp = '', bpBack = false;
  // 1.35: ranked by how hard each works the part: the ones it is for first, then the ones that work it well, then helpers
  const bpLists = () => {
    const main = [], help = [], well = [];
    if (bp) for (const ex of S.allExercises()) {
      if ((D.ex[ex.id] || {}).hide) continue; const p = exAreas(ex);
      if (p.main.has(bp)) main.push(ex); else if (p.lv[bp] >= 2) well.push(ex); else if (p.lv[bp]) help.push(ex);
    }
    const byName = (a, b) => a.name.localeCompare(b.name);
    main.sort((a, b) => exAreas(a).main.size - exAreas(b).main.size || byName(a, b));      // the most aimed at it first well.sort(byName); help.sort(byName);
    return { main, help: well.concat(help), well, few: help };
  };
  VIEWS.bodyPick = {
    html() {
      const { main, help, well, few } = bpLists();
      const fig = F.svg(id => (id === bp ? 3 : 0), bpBack, { act: 'bodyPart', sel: bp }).replace('class="bodyfig anat"', 'class="bodyfig anat xl"');
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>By body part</h1><div class="sub">Tap a part to see what trains it</div></div></div>
        <div class="bp-side" role="group" aria-label="Side of the body"><button class="chip ${bpBack ? '' : 'on'}" data-act="bodySide" data-v="f" aria-pressed="${!bpBack}">Front</button><button class="chip ${bpBack ? 'on' : ''}" data-act="bodySide" data-v="b" aria-pressed="${bpBack}">Back</button></div>
        <div class="bp-wrap"><div class="bodies bp-big"><div class="bz" data-bzk="pick-${bpBack ? 'b' : 'f'}">${fig}</div></div>
        ${bp ? `<div class="bf-tip on">${esc(F.name(bp))}</div><button class="btn primary block bp-go" data-act="bodyList">See ${plural(main.length + help.length, 'exercise')} for ${esc(F.name(bp).toLowerCase())} ↓</button>`
          : `<div class="bf-tip">Tap an area to zoom in, then tap a part</div>`}</div>`;
      if (!bp) return h;
      const row = ex => `<div class="list-item" data-act="openEx" data-id="${esc(ex.id)}">${A.thumb(ex)}<div class="grow"><div class="ellipsis" style="font-weight:600">${esc(ex.name)}</div><div class="xs muted ellipsis">${esc((ex.primary || []).join(', ') || ex.group || '')}</div></div><span class="chev">›</span></div>`;
      h += `<div class="card" id="bpList"><h3>Hits it hardest (${main.length})</h3>${main.length ? main.map(row).join('') : `<p class="small muted">No exercise in the library is aimed at this part.</p>`}</div>`;
      if (well.length) h += `<div class="card"><h3>Works it well (${well.length})</h3>${well.map(row).join('')}</div>`;
      if (few.length) h += `<div class="card"><h3>Helps (${few.length})</h3>${few.map(row).join('')}</div>`;
      return h;
    },
    leave() { bp = ''; }
  };
  ACT.bodyPick = () => A.go('bodyPick');
  // 1.35: "Best exercises ›" under any body map: the Library by body part, opened on that part and its side of the body
  ACT.bodyFind = el => { const id = el.dataset.part; if (!id) return; const a = F.AREAS.find(x => x.id === id); bp = id; bpBack = !!a && !a.view.includes('f'); A.go('bodyPick'); setTimeout(() => ACT.bodyList(), 60); };
  ACT.bodyPart = el => { bp = el.dataset.part === bp ? '' : el.dataset.part; A.rerender(); };
  ACT.bodySide = el => { const b = el.dataset.v === 'b'; if (b === bpBack) return; bpBack = b; A.rerender(); };
  ACT.bodyList = () => { const l = $('#bpList'); if (l) l.scrollIntoView({ behavior: window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' }); };
  ACT.muscleWeek = el => { mOff = Math.min(0, mOff + (+el.dataset.d)); A.rerender(); };

  // =====================================================================================================
  // Monthly recap
  // =====================================================================================================
  const rec = { y: new Date().getFullYear(), m: new Date().getMonth() };
  function monthStats(y, m) {
    const a = new Date(y, m, 1).getTime(), b = new Date(y, m + 1, 1).getTime(), ss = D.sessions.filter(s => s.start >= a && s.start < b);
    let ms = 0, sets = 0, vol = 0, prs = 0, longest = null; const exN = {}, wd = [0, 0, 0, 0, 0, 0, 0];
    for (const s of ss) {
      const d = S.gymMs(s); ms += d; if (!longest || d > longest.d) longest = { d, s };
      prs += (s.prs || []).length; wd[new Date(s.start).getDay()]++;
      for (const it of s.items) {
        if (it.skipped) continue; const done = it.sets.filter(x => x.done); if (!done.length) continue;
        const ex = S.getEx(it.ex); sets += done.length; exN[it.ex] = (exN[it.ex] || 0) + 1;
        if (ex && ex.track !== 'time') vol += done.reduce((t, x) => t + A.num(x.w) * A.num(x.r), 0);
      }
    }
    const mu = muscleStats(a, b).sets, topG = BODY.slice().sort((p, q) => mu[q] - mu[p])[0], topEx = Object.entries(exN).sort((p, q) => q[1] - p[1])[0];
    const bestWd = wd.indexOf(Math.max(...wd));
    return { n: ss.length, ms, sets, vol, prs, topG: mu[topG] ? topG : null, topGSets: mu[topG], topEx: topEx ? { ex: S.getEx(topEx[0]), n: topEx[1] } : null, longest, wd: ss.length ? bestWd : null, wdN: wd[bestWd] };
  }
  VIEWS.recap = {
    html() {
      const now = new Date(), cur = rec.y === now.getFullYear() && rec.m === now.getMonth();
      const t = monthStats(rec.y, rec.m), p = new Date(rec.y, rec.m - 1, 1), q = monthStats(p.getFullYear(), p.getMonth());
      const tile = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${A.MONTHS_LONG[rec.m]} ${rec.y}</h1><div class="sub">${cur ? 'Your month so far' : 'Your month'}</div></div>
        <button class="btn icon" data-act="recapMonth" data-d="-1" aria-label="Earlier month">‹</button><button class="btn icon" data-act="recapMonth" data-d="1" aria-label="Later month" ${cur ? 'disabled' : ''}>›</button></div>`;
      if (!t.n) return h + `<div class="empty"><div class="big">📅</div><h2>No workouts${cur ? ' yet' : ''}</h2><p>${cur ? 'Finish a workout and this month starts filling in.' : 'Nothing was logged in this month.'}</p></div>`;
      h += `<div class="stats">${tile(t.n, plural(t.n, 'workout').replace(/^\d+ /, ''))}${tile(A.fmtDur(t.ms), 'in the gym')}</div><div class="stats">${tile(t.sets, 'sets')}${A.repsOn() && t.vol ? tile(A.fmtBig(t.vol), A.unit() + ' lifted') : ''}</div><div class="card">`;
      const row = (k, v) => `<div class="cmp-row"><span class="grow muted">${k}</span><span style="text-align:right">${v}</span></div>`;
      if (t.prs) h += row('New records', `🏆 ${t.prs}`);
      if (t.topG) h += row('Most trained', `${t.topG} · ${fmtSets(t.topGSets)} set${t.topGSets === 1 ? '' : 's'}`);
      if (t.topEx && t.topEx.ex) h += row('Most done exercise', `${esc(t.topEx.ex.name)} · ${t.topEx.n}×`);
      if (t.longest) h += row('Longest workout', `${A.fmtDur(t.longest.d)} · ${esc(t.longest.s.dayName)}`);
      if (t.wd != null) h += row('Favourite day', `${WD[t.wd]} · ${t.wdN}×`);
      h += `</div>`;
      if (q.n) {
        const dn = t.n - q.n, dv = Math.round(t.vol - q.vol), sign = v => (v > 0 ? '+' : '−') + A.fmtBig(Math.abs(v));
        h += `<div class="card"><h3 class="mb8">Compared with ${A.MONTHS_LONG[p.getMonth()]}</h3>${row('Workouts', dn ? `<span class="${dn > 0 ? 'green' : ''}">${sign(dn)}</span>` : 'the same')}${row('Time in the gym', (t.ms - q.ms) ? `${t.ms > q.ms ? '+' : '−'}${A.fmtDur(Math.abs(t.ms - q.ms))}` : 'the same')}${A.repsOn() && (t.vol || q.vol) ? row('Weight lifted', dv ? `<span class="${dv > 0 ? 'green' : ''}">${sign(dv)} ${A.unit()}</span>` : 'the same') : ''}${cur ? `<p class="xs dim mt8">This month is still running.</p>` : ''}</div>`;
      }
      return h;
    },
    leave() { const n = new Date(); rec.y = n.getFullYear(); rec.m = n.getMonth(); }
  };
  ACT.openRecap = () => A.go('recap');
  ACT.recapMonth = el => { const d = new Date(rec.y, rec.m + (+el.dataset.d), 1); rec.y = d.getFullYear(); rec.m = d.getMonth(); A.rerender(); };

  // =====================================================================================================
  // Lift goals: a weight to reach on an exercise, optionally by a date
  // =====================================================================================================
  const topOf = (id, skip) => (A.recordsFor(id, skip).w || {}).v || 0;
  function goalBar(g, cur) {
    const from = Math.min(g.from || 0, g.w - 0.01), done = cur >= g.w, pct = done ? 100 : Math.max(0, Math.min(100, ((cur - from) / (g.w - from)) * 100));
    const left = g.by ? Math.ceil((g.by - Date.now()) / DAY) : null;
    return `<div class="meter"><div style="width:${pct}%;${done ? 'background:var(--green)' : ''}"></div></div><div class="row small"><span class="grow">${done ? '<b class="green">Reached 🎉</b>' : `<b>${A.fmtW(cur)}</b> of ${A.fmtW(g.w)} ${A.unit()} · ${A.fmtW(Math.round((g.w - cur) * 100) / 100)} to go`}</span><span class="xs muted">${left == null || done ? '' : left < 0 ? 'date passed' : left === 0 ? 'due today' : plural(left, 'day') + ' left'}</span></div>`;
  }
  function goalCard(ex) {
    if (ex.track !== 'weight') return '';
    const g = (D.ex[ex.id] || {}).goal;
    if (!g) return `<div class="card" id="goalCard"><div class="row"><div class="grow"><h3>Goal</h3><div class="xs muted mt4">Pick a weight to work towards.</div></div><button class="btn sm" data-act="goalSet" data-id="${ex.id}">Set a goal</button></div></div>`;
    return `<div class="card" id="goalCard"><div class="row"><h3 class="grow">Goal: ${A.fmtW(g.w)} ${A.unit()}${g.by ? ` <span class="xs muted" style="font-weight:400">by ${dm(g.by)}</span>` : ''}</h3><button class="btn sm ghost" data-act="goalSet" data-id="${ex.id}">Change</button></div>${goalBar(g, topOf(ex.id))}${window.Patterns && window.Patterns.liftLine(ex.id) ? `<p class="xs muted mt8 goal-eta">${window.Patterns.liftLine(ex.id)}</p>` : ''}</div>`;
  }
  ACT.goalSet = el => {
    const id = el.dataset.id, ex = S.getEx(id); if (!ex) return; const g = (D.ex[id] || {}).goal, now = new Date();
    const iso = ts => { const d = new Date(ts); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
    A.openSheet(`<h2>Goal for ${esc(ex.name)}</h2>
      <div class="field"><label class="lbl">Weight to reach (${A.unit()})</label><input class="input" id="goalW" type="number" inputmode="decimal" step="any" value="${g ? A.fmtW(g.w) : ''}" placeholder="e.g. 80" style="font-size:22px;font-weight:800"></div>
      <div class="field"><label class="lbl">By when (optional)</label><input class="input" id="goalBy" type="date" min="${iso(now)}" value="${g && g.by ? iso(g.by) : ''}"></div>
      <p class="xs dim mb12">Your heaviest logged set so far: ${topOf(id) ? A.fmtW(topOf(id)) + ' ' + A.unit() : 'none yet'}.</p>
      <div class="row"><button class="btn grow" data-act="${g ? 'goalDel' : 'closeSheet'}" data-id="${id}">${g ? 'Remove goal' : 'Cancel'}</button><button class="btn primary grow" data-act="goalSave" data-id="${id}">Save</button></div>`);
  };
  ACT.goalSave = el => {
    const w = A.num($('#goalW').value), by = $('#goalBy').value; if (!(w > 0)) { toast('Type the weight you want to reach'); return; }
    const xd = S.exData(el.dataset.id), old = xd.goal;
    xd.goal = { w, from: old && old.w === w ? old.from : topOf(el.dataset.id), at: Date.now() };
    if (by) { const [y, m, d] = by.split('-').map(Number); xd.goal.by = new Date(y, m - 1, d, 23, 59).getTime(); }
    S.save(); A.closeSheet(); A.rerender(); toast('Goal saved');
  };
  ACT.goalDel = el => { const xd = S.exData(el.dataset.id); delete xd.goal; S.save(); A.closeSheet(); A.rerender(); toast('Goal removed'); };
  const goalIds = () => Object.keys(D.ex).filter(id => D.ex[id].goal && S.getEx(id));
  function goalsHome() {
    const ids = goalIds(); if (!ids.length) return '';
    return `<div class="card" id="goalsHome"><h3 class="mb8">Goals</h3>${ids.slice(0, 4).map(id => `<div class="ghome" data-act="openEx" data-id="${id}"><div class="small" style="font-weight:600">${esc(S.getEx(id).name)} → ${A.fmtW(D.ex[id].goal.w)} ${A.unit()}</div>${goalBar(D.ex[id].goal, topOf(id))}</div>`).join('')}</div>`;
  }
  // goals this workout carried over the line
  const goalsReached = s => (s.keep === false ? [] : s.items.filter(it => !it.skipped).map(it => it.ex).filter((id, i, a) => a.indexOf(id) === i)
    .filter(id => { const g = (D.ex[id] || {}).goal; return g && S.getEx(id) && topOf(id) >= g.w && topOf(id, s.id) < g.w; }));

  // =====================================================================================================
  // How a workout felt: from the watch's heart rate when there is one, otherwise picked by hand
  // =====================================================================================================
  const FEEL = [['easy', 'Easy'], ['ok', 'OK'], ['hard', 'Hard']];
  // Average heart rate as a share of the highest the watch has ever seen in a workout (at least 185).
  function feelFromWatch(s) {
    if (!s.hc || !s.hc.avg) return null;
    const ref = Math.max(185, ...D.sessions.map(x => (x.hc && x.hc.max) || 0)), p = s.hc.avg / ref;
    return p >= 0.72 ? 'hard' : p >= 0.6 ? 'ok' : 'easy';
  }
  function autoFeel(s) { if (s.feel && s.feelBy === 'you') return; const f = feelFromWatch(s); if (f) { s.feel = f; s.feelBy = 'watch'; } }
  function feelHtml(s) {
    const cap = s.feel ? (s.feelBy === 'watch' ? `Worked out from your watch (average ♥ ${s.hc && s.hc.avg}). Tap to change it.` : 'Your own rating.') : 'How did it feel?';
    return `<div class="feel" data-feel="${esc(s.id)}"><div class="xs muted mb8">${cap}</div><div class="row">${FEEL.map(f => `<button class="chip ${s.feel === f[0] ? 'on' : ''}" data-act="feelSet" data-id="${esc(s.id)}" data-v="${f[0]}">${f[1]}</button>`).join('')}</div></div>`;
  }
  ACT.feelSet = el => {
    const s = D.sessions.find(x => x.id === el.dataset.id); if (!s) return;
    if (s.feel === el.dataset.v && s.feelBy === 'you') { delete s.feel; delete s.feelBy; } else { s.feel = el.dataset.v; s.feelBy = 'you'; }
    S.save(true);
    const box = el.closest('.feel'); if (box) box.outerHTML = feelHtml(s);
  };
  const summaryExtra0 = s => goalsReached(s).map(id => `<div class="pr">🎯 Goal reached: ${esc(S.getEx(id).name)} ${A.fmtW(D.ex[id].goal.w)} ${A.unit()}</div>`).join('') + `<div class="card" style="background:var(--bg3);margin-top:10px">${feelHtml(s)}</div>`;
  const detailExtra0 = s => `<div class="card">${feelHtml(s)}${s.note ? `<p class="small mt12" style="white-space:pre-wrap">${esc(s.note)}</p>` : `<p class="xs dim mt12">Add a note to this workout with Edit.</p>`}</div>`;

  // =====================================================================================================
  // Body weight
  // =====================================================================================================
  VIEWS.body = {
    html() {
      const list = (D.body || []).slice().sort((a, b) => b.t - a.t);
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Body weight</h1><div class="sub">${list.length ? plural(list.length, 'entry').replace('entrys', 'entries') : 'Only you see this'}</div></div></div>
        <div class="card"><div class="row"><input class="input grow" id="bodyIn" type="text" inputmode="decimal" autocomplete="off" placeholder="Today's weight in ${A.unit()}" enterkeyhint="done"><button class="btn primary" data-act="bodyAdd">Add</button></div>
        ${window.Health && window.Health.weightButton ? window.Health.weightButton() : ''}</div>`;
      if (list.length >= 2) {
        const pts = list.slice(0, 60).reverse(), tk = A.ticks3(Math.min(...pts.map(p => p.kg)), Math.max(...pts.map(p => p.kg)), true), lo = tk[0], hi = tk[2], span = hi - lo || 1, W = 320, H = 120;      // 1.33: round numbers on the left
        const x = i => 8 + (W - 16) * (i / (pts.length - 1)), y = v => 14 + (H - 34) * (1 - (v - lo) / span), d = pts[pts.length - 1].kg - pts[0].kg;
        h += `<div class="card">${A.withY(`<svg class="chart" viewBox="0 0 ${W} ${H}" role="img" aria-label="Body weight chart"${A.ptsAttr(pts.map((p, i) => [x(i), y(p.kg), A.fmtDate(p.t), `${A.fmtW(p.kg)} ${A.unit()}`]))}>${A.gridY(tk, y, 8, W - 8)}<polyline fill="none" stroke="var(--accent)" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round" points="${pts.map((p, i) => `${x(i).toFixed(1)},${y(p.kg).toFixed(1)}`).join(' ')}"/>
          ${pts.map((p, i) => `<circle cx="${x(i).toFixed(1)}" cy="${y(p.kg).toFixed(1)}" r="3" fill="var(--bg2)" stroke="var(--accent)" stroke-width="2"/>`).join('')}
          <text x="8" y="${H - 4}" font-size="11" fill="var(--dim)">${dm(pts[0].t)}</text><text x="${W - 8}" y="${H - 4}" font-size="11" fill="var(--dim)" text-anchor="end">${dm(pts[pts.length - 1].t)}</text></svg>`, tk, y, H, t => A.fmtW(t))}
          <p class="xs muted">Now <b>${A.fmtW(pts[pts.length - 1].kg)} ${A.unit()}</b> · ${d ? `${d > 0 ? '+' : '−'}${A.fmtW(Math.abs(Math.round(d * 10) / 10))} ${A.unit()} since ${dm(pts[0].t)}` : 'no change since ' + dm(pts[0].t)}</p></div>`;
      }
      if (list.length) h += `<div class="card">${list.map(b => `<div class="list-item"><div class="grow"><div class="small" style="font-weight:600">${A.fmtW(b.kg)} ${A.unit()}</div><div class="xs muted">${A.fmtDate(b.t)}${b.src ? ' · from Health Connect' : ''}</div></div><button class="ib x" data-act="bodyDel" data-id="${esc(b.id)}" aria-label="Remove">✕</button></div>`).join('')}</div>`;
      else h += `<div class="empty"><p>Add your weight now and then to see how it moves.</p></div>`;
      return h;
    },
    mount() { const i = $('#bodyIn'); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.bodyAdd(); }); }
  };
  function addWeight(kg, t, src) {
    if (!D.body) D.body = [];
    const day = ts => new Date(ts).toDateString();
    if (src && D.body.some(b => day(b.t) === day(t) && Math.abs(b.kg - kg) < 0.05)) return false;      // already have this reading
    const e = { id: 'b' + S.uid(), t, kg: Math.round(kg * 100) / 100 }; if (src) e.src = src;
    D.body.push(e); S.save(true); return true;
  }
  ACT.openBody = () => A.go('body');
  ACT.bodyAdd = () => { const raw = (($('#bodyIn') || {}).value || '').trim(), v = A.num(raw); if (!(v > 0)) { toast(raw ? `That isn't a weight. Type it in ${A.unit()}, like ${A.unit() === 'lb' ? '160' : '72.5'}` : 'Type your weight first'); return; } if (v > (A.unit() === 'lb' ? 1100 : 500)) { toast(`${A.fmtW(v)} ${A.unit()} is more than anyone weighs. Check the number.`); return; } addWeight(v, Date.now()); A.rerender(); toast('Added'); };
  ACT.bodyDel = el => { const b = (D.body || []).find(x => x.id === el.dataset.id); if (!b) return; D.body = D.body.filter(x => x !== b); S.save(true); A.rerender();
    if (window.Motion && window.Motion.undoToast) window.Motion.undoToast('Weigh-in removed', () => { if (!(D.body || []).includes(b)) { (D.body = D.body || []).push(b); D.body.sort((x, y) => x.t - y.t); S.save(true); A.rerender(); } }); else toast('Removed'); };

  // =====================================================================================================
  // Optional extras (off until switched on in Settings): weekly schedule, ready-made plans
  // =====================================================================================================
  const PLANS = [
    { name: 'Push / Pull / Legs', text: '3 days. Chest, shoulders and triceps; back and biceps; legs.', days: [
      ['Push', ['bench-press', 'incline-db-press', 'smith-ohp', 'cable-lateral-raise', 'triceps-pushdown', 'overhead-cable-ext']],
      ['Pull', ['lat-pulldown-wide', 'seated-cable-row', 'one-arm-db-row', 'reverse-pec-deck', 'cable-bar-curl', 'cable-hammer-curl']],
      ['Legs', ['back-squat', 'leg-press', 'romanian-deadlift', 'leg-extension', 'seated-leg-curl', 'standing-calf-raise']]] },
    { name: 'Upper / Lower', text: '2 days you can repeat twice a week.', days: [
      ['Upper body', ['bench-press', 'lat-pulldown-wide', 'smith-ohp', 'seated-cable-row', 'cable-bar-curl', 'triceps-pushdown']],
      ['Lower body', ['back-squat', 'romanian-deadlift', 'leg-press', 'seated-leg-curl', 'leg-extension', 'standing-calf-raise']]] },
    { name: 'Full body A / B', text: '2 short days that each train everything.', days: [
      ['Full body A', ['back-squat', 'bench-press', 'seated-cable-row', 'cable-lateral-raise', 'triceps-pushdown']],
      ['Full body B', ['romanian-deadlift', 'incline-db-press', 'lat-pulldown-wide', 'leg-press', 'cable-bar-curl']]] }];
  ACT.plansOpen = () => A.openSheet(`<h2>Ready-made plans</h2><p class="muted mb12">Adds the plan's days to your list. You can change them afterwards like any other day.</p>` +
    PLANS.map((p, i) => `<div class="card" style="background:var(--bg3)"><div class="row"><div class="grow"><div class="title">${p.name}</div><div class="xs muted mt4">${p.text}</div></div><button class="btn sm primary" data-act="planAdd" data-i="${i}">Add</button></div></div>`).join('') +
    `<button class="btn block" data-act="closeSheet">Close</button>`);
  ACT.planAdd = el => {
    const p = PLANS[+el.dataset.i]; if (!p) return;
    p.days.forEach(([name, ids]) => S.addDay(name, ids.filter(id => S.getEx(id)).map(ex => ({ ex, sets: 3, reps: 10 }))));
    A.closeSheet(); A.rerender(); toast(`${p.days.length} days added`);
  };
  const startOfDay = ts => { const d = new Date(ts); return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(); };
  function todayCard() {
    if (!D.settings.schedule) return '';
    const wd = new Date().getDay(), wk = D.settings.week || {}, d = wk[wd] && S.getDay(wk[wd]), nx = wk[(wd + 1) % 7] && S.getDay(wk[(wd + 1) % 7]);
    const done = d && D.sessions.some(s => s.dayId === d.id && s.start >= startOfDay(Date.now()));
    return `<div class="card" id="todayCard"><div class="row"><div class="grow" style="min-width:0"><div class="k2">Today · ${WD[wd]}</div><div class="title ellipsis">${d ? esc(d.name) : 'Rest day'}</div>
      <div class="xs muted mt4">Tomorrow: ${nx ? esc(nx.name) : 'rest'}</div></div>${d ? (done ? `<span class="pill green" style="margin:0">Done ✓</span>` : `<button class="btn sm primary" data-act="startDay" data-id="${d.id}">Start ▶</button>`) : ''}</div></div>`;
  }
  const homeCards = () => todayCard() + goalsHome();
  // v1.9: the extras sorted into a few groups, so the page reads like a menu instead of one long list.
  // A row whose switch isn't listed here (a follow-up line such as the schedule's days) stays with the row above it.
  const XGROUPS = [['plan', 'Planning your week'], ['workout', 'During a workout'], ['progress', 'Progress'], ['food', 'Food'], ['phone', 'This phone'], ['other', 'Other']];
  const XMAP = { optSchedule: ['plan', 1], 'act:homeArrange': ['plan', 0.5], optRemind: ['plan', 2], optPlans: ['plan', 3], optTrainer: ['plan', 4], optWarmups: ['plan', 4.1], optRecovery: ['plan', 5], optSorePart: ['plan', 5.1], optDeload: ['plan', 6],
    optNumpad: ['workout', 1], optEffort: ['workout', 2], optPrLive: ['workout', 3], optSetAsk: ['workout', 3.5], optVoice: ['workout', 3.7], optLockNote: ['workout', 4], optLive: ['workout', 5],
    optStuck: ['progress', 1], optStrength: ['progress', 2], optKcal: ['food', 1], optPNudge: ['food', 3], optSmartKcal: ['food', 2], optUsual: ['food', 4], optSnap: ['food', 5], optNut: ['food', 5.5], optAi: ['food', 5.7], 'act:kcMine': ['food', 6], optPatterns: ['progress', 3], optLock: ['phone', 1], 'act:notifFix': ['phone', 2] };
  const XICON = { plan: 'calendar', workout: 'dumbbell', progress: 'trend', food: 'food', phone: 'phone', other: 'more' };      // v1.26: an icon on each group
  function grouped(html) {
    const t = document.createElement('template'); t.innerHTML = html; const items = [];
    [...t.content.children].forEach((el, i) => {
      const k = el.matches('[data-bind],[data-act]') ? el : el.querySelector('[data-bind],[data-act]'), m = XMAP[k ? (k.dataset.bind || 'act:' + k.dataset.act) : ''];
      if (m || !items.length) items.push({ g: m ? m[0] : 'other', r: m ? m[1] : 99, i, h: el.outerHTML }); else items[items.length - 1].h += el.outerHTML;
    });
    return XGROUPS.map(([g, title]) => { const its = items.filter(x => x.g === g).sort((a, b) => a.r - b.r || a.i - b.i);
      return its.length ? `<div class="card xgrp" data-g="${g}"><h3 class="mb8">${window.SetKit ? window.SetKit.ic(XICON[g] || 'more', 16) : ''}${title}</h3>${its.map(x => x.h).join('')}</div>` : ''; }).join('');
  }
  function settingsCard() {
    const st = D.settings, wk = st.week || {};
    const sw = (bind, on, title, sub) => `<div class="row" style="padding:6px 0"><div class="grow">${title}<div class="xs dim">${sub}</div></div><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;
    return `<div id="extrasCard"><p class="small dim" style="margin:0 4px 12px">Switch on the extras you want. Each one says what it does.</p>${grouped(`
      ${sw('optSchedule', st.schedule, 'Weekly schedule', 'Give each weekday a day; the Today page shows what is on today')}
      ${st.schedule ? `<div class="sched">${[1, 2, 3, 4, 5, 6, 0].map(n => `<div class="row"><span class="small" style="width:92px">${WD[n]}</span><select class="input grow" data-bind="schedDay" data-n="${n}"><option value="">Rest</option>${D.days.map(d => `<option value="${d.id}" ${wk[n] === d.id ? 'selected' : ''}>${esc(d.name)}</option>`).join('')}</select></div>`).join('')}</div>` : ''}
      ${sw('optPlans', st.plans, 'Ready-made plans', 'Adds a Plans button above your days on the Today page')}
      ${window.Extras ? window.Extras.settingsRows() : ''}
      ${(window.SettingsRows || []).map(f => f()).join('')}
      ${window.Native ? window.Native.settingsRows() : ''}`)}</div>`;
  }
  document.addEventListener('change', e => {
    const t = e.target, b = t.dataset.bind;
    if (b === 'optSchedule') { D.settings.schedule = t.checked; S.save(); A.rerender(); }
    else if (b === 'optPlans') { D.settings.plans = t.checked; S.save(); }
    if (b === 'optSchedule' && window.Native) window.Native.changed();
    else if (b === 'schedDay') { const wk = Object.assign({}, D.settings.week || {}); if (t.value) wk[t.dataset.n] = t.value; else delete wk[t.dataset.n]; D.settings.week = wk; S.save(); if (window.Native) window.Native.changed(); }
  });

  // =====================================================================================================
  // The short tour (shown once on a phone that has nothing in it yet; again from Settings → About)
  // =====================================================================================================
  // 1.35.2: three steps (was four), and Food is one of them; clubs are a line, not a step (they need an account)
  const TOUR_OLD = [['🏋️', 'Build your days', 'A day is your list of exercises, like Push day or Leg day. Make your own, or start from the ready-made ones.'],
    ['✅', 'Log as you lift', 'Press Start, pick what you are doing today and tick each set. GymDay remembers your weights for next time.'],
    ['📈', 'See yourself improve', 'Records, charts, your weekly goal and the muscles you trained are all under History.'],
    ['👥', 'Train with friends', 'Start a club or join one with a code to see who trained this week and cheer each other on.']];          // the tests' (window.__calm = false)
  const TOUR_NEW = [['🏋️', 'Your days and workouts', 'A day is your list of exercises, like Push day or Leg day. Press Start, tap an exercise and tick each set: GymDay remembers your weights for next time.'],
    ['🍽', 'Food', 'Log what you eat with a photo, a barcode or a few typed words, and see it against your daily limits.'],
    ['📈', 'See yourself improve', 'Records, charts and the muscles you trained are under History. With an account you can also train with friends in clubs.']];
  const TOUR = window.__calm === false ? TOUR_OLD : TOUR_NEW;
  // 1.33: the tour ends with one question, "Do you wear a smartwatch?" (watch.js): No hides everything that needs one. Skip
  // goes to the question too, so it is asked once on every new phone; an account that already answered is not asked again.
  let tourI = 0;
  const askWatch = () => !!window.Watch && !window.Watch.answered();
  function tourSheet() {
    const n = TOUR.length + (askWatch() || tourI === TOUR.length ? 1 : 0), dots = `<div class="dots">${Array.from({ length: n }, (_, i) => `<i class="${i === tourI ? 'on' : ''}"></i>`).join('')}</div>`;
    if (tourI >= TOUR.length) {
      A.openSheet(`<div class="tour" id="tourWatch"><div class="big">⌚</div><h2>Do you wear a smartwatch?</h2><p class="muted">GymDay can bring in your sleep, heart rate and steps from a watch or band. No watch? Those parts stay out of your way. You can change this in Settings.</p>${dots}</div>
        <div class="row mt16"><button class="btn grow" data-act="tourWatch" data-v="0">No watch</button><button class="btn primary grow" data-act="tourWatch" data-v="1">Yes, I have one</button></div>`);
      return;
    }
    const t = TOUR[tourI], lastOne = tourI === TOUR.length - 1, more = askWatch();
    A.openSheet(`<div class="tour"><div class="big">${t[0]}</div><h2>${t[1]}</h2><p class="muted">${t[2]}</p>${dots}</div>
      <div class="row mt16">${lastOne && (!more || window.__calm === false) ? '' : `<button class="btn grow" data-act="${more ? 'tourSkip' : 'closeSheet'}">Skip</button>`}<button class="btn primary grow" data-act="${lastOne && !more ? 'closeSheet' : 'tourNext'}">${lastOne && !more ? "Let's go" : 'Next'}</button></div>`);
  }
  ACT.tourOpen = () => { tourI = 0; tourSheet(); };
  ACT.tourNext = () => { tourI = Math.min(TOUR.length - (askWatch() ? 0 : 1), tourI + 1); tourSheet(); };
  ACT.tourSkip = () => { tourI = TOUR.length; tourSheet(); };
  ACT.tourWatch = el => { A.closeSheet(); if (window.Watch) window.Watch.set(el.dataset.v === '1', true); if (el.dataset.v !== '1') window.toast('No watch: those parts are hidden. Settings brings them back.'); };
  A.afterRender = name => {
    if (name !== 'days' || M.toured) return;
    M.toured = true; S.saveMeta();
    if (!S.hasData()) setTimeout(() => { if ($('#sheet').classList.contains('hidden') && A.top().name === 'days') ACT.tourOpen(); }, 400);
  };

  // ---------------- share card: one workout as a picture ----------------
  function cardCanvas(s) {
    const Wd = 1080, Hd = 1350, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; const g = c.getContext('2d');
    const F = (px, w) => `${w || 700} ${px}px Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    const fit = (text, px, w, max) => { let t = String(text); g.font = F(px, w); while (px > 40 && g.measureText(t).width > max) { px -= 4; g.font = F(px, w); } while (t.length > 4 && g.measureText(t).width > max) t = t.slice(0, -2).trimEnd() + '…'; return t; };
    const box = (x, y, w, h, r, fill) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = fill; g.fill(); };
    const bg = g.createLinearGradient(0, 0, Wd, Hd); bg.addColorStop(0, '#0B111C'); bg.addColorStop(1, '#05080F'); g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    const top = g.createLinearGradient(0, 0, Wd, 0); top.addColorStop(0, '#3D8BFF'); top.addColorStop(1, '#22E3FF'); g.fillStyle = top; g.fillRect(0, 0, Wd, 16);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = F(56, 800); g.fillStyle = '#FFFFFF'; g.fillText('Gym', 72, 132); const bw = g.measureText('Gym').width; g.fillStyle = '#22E3FF'; g.fillText('Day', 72 + bw, 132);
    g.fillStyle = '#FFFFFF'; g.fillText(fit(s.dayName || 'Workout', 92, 800, Wd - 144), 72, 290);
    g.fillStyle = '#8C9BB6'; g.font = F(40, 500); g.fillText(`${new Date(s.start).toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })} · ${A.fmtClock(s.start)}`, 72, 356);
    // numbers
    let sets = 0, vol = 0; const lines = [];
    for (const it of (s.items || [])) {
      if (it.skipped) continue; const ex = S.getEx(it.ex), done = (it.sets || []).filter(x => x.done); if (!ex || !done.length) continue;
      sets += done.length; if (ex.track !== 'time') done.forEach(x => { vol += A.num(x.w) * A.num(x.r); });
      lines.push([ex.name, A.setsSummary(done, ex)]);
    }
    const tiles = [[A.fmtDur(S.gymMs(s)), 'gym time'], [String(lines.length), lines.length === 1 ? 'exercise' : 'exercises'], [String(sets), sets === 1 ? 'set' : 'sets']];
    if (vol > 0) tiles.push([A.fmtBig(vol) + ' ' + A.unit(), 'lifted']);
    const tw = (Wd - 144 - 24 * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => { const x = 72 + i * (tw + 24); box(x, 410, tw, 190, 28, '#121A29'); g.textAlign = 'center'; g.fillStyle = '#FFFFFF'; g.fillText(fit(t[0], 58, 800, tw - 28), x + tw / 2, 508); g.fillStyle = '#8C9BB6'; g.font = F(32, 500); g.fillText(t[1], x + tw / 2, 560); });
    g.textAlign = 'left'; let y = 668;
    const prs = (s.prs || []).length;
    if (prs) { box(72, y - 8, Wd - 144, 96, 24, '#0C2038'); g.fillStyle = '#22E3FF'; g.font = F(44, 800); g.fillText(`🏆  ${prs} new record${prs > 1 ? 's' : ''}`, 104, y + 56); y += 132; }
    if (s.hc && (s.hc.avg || s.hc.kcal)) { g.fillStyle = '#8C9BB6'; g.font = F(36, 500); g.fillText([s.hc.avg ? `♥ ${Math.round(s.hc.avg)} bpm on average` : '', s.hc.kcal ? `${Math.round(s.hc.kcal)} kcal` : ''].filter(Boolean).join('   ·   '), 72, y + 30); y += 84; }
    const room = Math.max(1, Math.floor((Hd - 120 - y) / 78)), show = lines.slice(0, lines.length > room ? room - 1 : room);
    show.forEach(l => {
      g.textAlign = 'right'; g.fillStyle = '#8C9BB6'; const r = fit(l[1], 34, 500, 420); g.fillText(r, Wd - 72, y + 44); const rw = g.measureText(r).width;
      g.textAlign = 'left'; g.fillStyle = '#FFFFFF'; g.fillText(fit(l[0], 40, 700, Wd - 144 - rw - 32), 72, y + 44);
      g.fillStyle = '#1C2940'; g.fillRect(72, y + 66, Wd - 144, 2); y += 78;
    });
    if (lines.length > show.length) { g.fillStyle = '#8C9BB6'; g.font = F(34, 500); g.fillText(`+ ${lines.length - show.length} more`, 72, y + 44); }
    g.textAlign = 'center'; g.fillStyle = '#5B6984'; g.font = F(30, 500); g.fillText('Logged with GymDay', Wd / 2, Hd - 48);
    return c;
  }
  let cardUrl = '';
  ACT.shareCard = el => {
    const s = D.sessions.find(x => x.id === el.dataset.id); if (!s) return;
    try { cardUrl = cardCanvas(s).toDataURL('image/jpeg', 0.9); } catch (e) { toast("Couldn't make the picture"); return; }
    A.openSheet(`<h2>Share this workout</h2><img id="cardImg" src="${cardUrl}" alt="A picture of this workout" style="width:100%;border-radius:14px;display:block;margin-top:10px">
      <div class="row mt12"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="shareCardGo" data-id="${esc(s.id)}">${S.isAndroid ? 'Share' : 'Save the picture'}</button></div>`, null, () => { cardUrl = ''; });
  };
  ACT.shareCardGo = el => {
    const s = D.sessions.find(x => x.id === el.dataset.id); if (!s || !cardUrl) return;
    const text = `${s.dayName || 'Workout'} · ${A.fmtDur(S.gymMs(s))} in the gym`;
    if (S.isAndroid) {
      let ok = false; try { ok = !!(window.Android.shareImage && window.Android.shareImage(cardUrl, text)); } catch (e) { }
      if (!ok) { try { window.Android.share(text); } catch (e) { } toast('This phone can only share the words, not the picture'); }
      A.closeSheet(); return;
    }
    const a = document.createElement('a'); a.href = cardUrl; a.download = `GymDay-${new Date(s.start).toISOString().slice(0, 10)}.jpg`; document.body.appendChild(a); a.click(); a.remove();
    A.closeSheet(); toast('Picture saved to your downloads');
  };

  // ---------------- the whole history as a spreadsheet (CSV): one row per ticked set ----------------
  // Text that starts like a formula gets a ' in front, so a spreadsheet shows it instead of running it.
  const csvCell = v => {
    if (v === null || v === undefined || v === '') return '';
    if (typeof v === 'number') return isFinite(v) ? String(v) : '';
    let s = String(v); if (/^[=+\-@\t\r]/.test(s)) s = "'" + s;
    return /[",\r\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  function historyCsv() {
    const p2 = n => String(n).padStart(2, '0'), rows = [];
    const head = ['Date', 'Start time', 'Day', 'Exercise', 'Body part', 'Set', `Weight (${A.unit()})`, 'Reps', 'Minutes', 'Km or level', 'Set time (seconds)', 'Gym time (minutes)'];
    let sets = 0, workouts = 0;
    for (const s of D.sessions.slice().sort((a, b) => a.start - b.start)) {              // oldest first
      const d = new Date(s.start), date = `${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}`, time = `${p2(d.getHours())}:${p2(d.getMinutes())}`;
      const gym = Math.round(S.gymMs(s) / 60000); let any = false;
      for (const it of (s.items || [])) {
        if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
        const timed = ex.track === 'time'; let n = 0;
        for (const x of (it.sets || [])) {
          if (!x.done) continue; n++; sets++; any = true;
          rows.push([date, time, s.dayName || 'Workout', ex.name, ex.group || '', n,
            timed ? '' : A.num(x.w), timed ? '' : (A.num(x.r) || ''), timed ? A.num(x.w) : '', timed ? (A.num(x.r) || '') : '',
            x.ms ? Math.round(x.ms / 1000) : '', gym]);
        }
      }
      if (any) workouts++;
    }
    // the mark at the very start tells Excel the file is UTF-8
    return { text: '﻿' + [head].concat(rows).map(r => r.map(csvCell).join(',')).join('\r\n') + '\r\n', sets, workouts };
  }
  const NB = S.isAndroid ? window.Android : (window.__native || null);
  let csvOut = null;
  const csvName = () => { const d = new Date(), p2 = n => String(n).padStart(2, '0'); return `GymDay-history-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.csv`; };
  ACT.sheetExport = () => {
    csvOut = historyCsv();
    if (!csvOut.sets) { csvOut = null; toast('No finished sets to export yet'); return; }
    const info = `${csvOut.sets} set${csvOut.sets === 1 ? '' : 's'} from ${csvOut.workouts} workout${csvOut.workouts === 1 ? '' : 's'}`;
    A.openSheet(`<h2>Export to a spreadsheet</h2><p class="muted">One row for every set you ticked: ${info}, oldest first. The file opens in Google Sheets or Excel.</p>
      ${NB ? `<div class="row mt16"><button class="btn primary grow" data-act="sheetShare">Share</button><button class="btn grow" data-act="sheetSave">Save on this phone</button></div>
        <p class="xs dim mt8">Share sends it to Drive, WhatsApp, email or any other app, and keeps a copy in Downloads → GymDay.</p>`
        : `<button class="btn primary block mt16" data-act="sheetSave">Download the file</button>`}
      <button class="btn block mt8" data-act="closeSheet">Cancel</button>`, null, () => { csvOut = null; });
  };
  ACT.sheetShare = () => {
    if (!csvOut) return; let ok = false;
    try { ok = !!(NB && NB.shareFile && NB.shareFile(csvName(), 'text/csv', csvOut.text)); } catch (e) { }
    if (!ok) { ACT.sheetSave(); return; }                    // an older phone that can't share a file: save it instead
    A.closeSheet();
  };
  ACT.sheetSave = () => {
    if (!csvOut) return; const text = csvOut.text;
    if (NB) {
      let ok = false; try { if (NB.saveFile) { NB.saveFile(csvName(), 'text/csv', text); ok = true; } } catch (e) { }
      if (ok) A.closeSheet(); else toast("This phone couldn't save the file");
      return;
    }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
    a.href = url; a.download = csvName(); document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    A.closeSheet(); toast('Saved to your downloads');
  };

  const summaryExtra = s => summaryExtra0(s) + sessionBody(s), detailExtra = s => sessionBody(s) + detailExtra0(s);
  window.Insights = { exerciseBody, sessionBody, sessionSets, partsOf, exAreas, areaSets, bodies, monthStats, historyCsv, homeCards, goalCard, summaryExtra, detailExtra, settingsCard, autoFeel, feelHtml, addWeight, muscleStats };
})();
