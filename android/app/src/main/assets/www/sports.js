/* GymDay v1.17 – activities: a sport, a walk, a swim… added on the Food tab's Burnt card.
   Three ways: the calories typed (from a watch, an app or a machine), read from a photo of the watch's summary, or worked out from the
   sport, how long it was, how hard the person played and how tired they feel, with each sport's energy cost from the 2024 Adult
   Compendium of Physical Activities (sportdata.js). Nothing is counted twice: calories.js adds only what an activity burnt beyond the
   everyday burn's share of its minutes, and on a day counted from the watch's whole-day total, only what was done without the watch.
   A setting decides whether activities also show in History and count toward the weekly goal. */
(function () {
  const A = window.App, S = window.Store, D = S.data, C = window.Calories;
  const { $, esc, ACT } = A;
  if (!C) return;
  const st = () => D.settings;
  const toast = m => window.toast(m);
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const r1 = v => Math.round(v * 10) / 10;
  const g1 = v => String(r1(v));
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const dayStart = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const clock = ts => { const d = new Date(ts); let h = d.getHours(); const m = d.getMinutes(), ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return `${h}:${m < 10 ? '0' : ''}${m} ${ap}`; };
  const hhmm = ts => { const d = new Date(ts); return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`; };
  const fmtMin = m => { m = Math.round(m); return m >= 60 ? `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}` : `${m} min`; };
  const undoToast = (m, f) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, f) : toast(m));
  if (!Array.isArray(D.sports)) D.sports = [];

  // ---------------- the list (sportdata.js) ----------------
  const SD = window.SPORTDATA || { groups: [], list: [] };
  // [easy, moderate, hard, all out]: a 0 is worked out from the others, as the Compendium's own easy and hard entries usually differ
  const LIST = SD.list.map(r => {
    const [id, ic, name, g, aka, m, src, pop, kinds] = r, mid = m[1];
    const a = [m[0] || r1(mid * 0.75), mid, m[2] || r1(mid * 1.3), 0];
    a[3] = m[3] || r1(a[2] * 1.15);
    for (let i = 1; i < 4; i++) if (a[i] < a[i - 1]) a[i] = a[i - 1];
    const hay = fold(`${name} ${aka || ''}`);
    return { id, ic, name, g, aka: aka || '', a, given: m.map(v => v > 0), src, pop: !!pop, kinds: kinds || null, hay, words: hay.split(' ') };
  });
  const BY = new Map(LIST.map(x => [x.id, x]));
  const EFF = [['Easy', 'could chat the whole time'], ['Moderate', 'breathing harder'], ['Hard', 'hard to talk'], ['All out', 'as hard as I could']];
  const TIRED = [['Fresh', ''], ['A bit tired', ''], ['Tired', ''], ['Exhausted', '']];
  // how hard you played counts twice as much as how tired you feel: 0 = the easy value, 1 = moderate, 2 = hard, 3 = all out
  const levelOf = (e, t) => (2 * e + t) / 3;
  function metAt(sp, e, t) {
    const L = Math.max(0, Math.min(3, levelOf(e, t))), i = Math.min(2, Math.floor(L)), f = L - i;
    return r1(sp.a[i] + (sp.a[i + 1] - sp.a[i]) * f);
  }
  const kgNow = t => (C.weightKg ? C.weightKg(t) : 0) || 0;

  // ---------------- the sheet ----------------
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  let mv = null;     // { step: 'list' | 'form', q, g, id (when changing one), aid, name, t, mins, how, e, ti, k, kc, kk, shot, pics, busy, err, watch }
  const groupsHtml = g => `<div class="chips mv-groups">${SD.groups.map(([id, name, ic]) => `<button class="chip ${g === id ? 'on' : ''}" data-act="mvGroup" data-g="${id}">${ic} ${esc(name)}</button>`).join('')}</div>`;
  function perHour(sp) { const kg = kgNow(Date.now()) || 70; return Math.round(sp.a[1] * kg / 10) * 10; }
  function listItems(q, g) {
    const words = fold(q).split(' ').filter(Boolean);
    // every word typed starts a word of the name or its other names ("hu tu tu" is kabaddi, "swim" is swimming)
    let rows = words.length ? LIST.filter(x => words.every(w => x.words.some(y => y.startsWith(w)))) : LIST.filter(x => (g === 'pop' ? x.pop : x.g === g));
    if (words.length) rows = rows.slice().sort((a, b) => (b.hay.startsWith(words[0]) - a.hay.startsWith(words[0])) || (b.pop - a.pop));
    if (!rows.length) return `<p class="small muted mt8">Nothing called that. Pick <b>Another sport or activity</b> under Other sports and type its name.</p>
      <div class="list-item tap" data-act="mvPick" data-id="other"><span class="mv-ic">🏅</span><div class="grow"><div class="small" style="font-weight:600">Another sport or activity</div></div><span class="chev">›</span></div>`;
    return rows.map(x => `<div class="list-item tap" data-act="mvPick" data-id="${x.id}"><span class="mv-ic">${x.ic}</span><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(x.name)}</div><div class="xs muted">about ${n0(perHour(x))} kcal an hour at a moderate effort</div></div><span class="chev">›</span></div>`).join('');
  }
  const showSel = () => `<div class="row mt12 act-show"><div class="grow xs muted">Show my activities</div><select class="input" data-bind="actShow" aria-label="Show my activities">${[['cal', 'On the Food tab only'], ['hist', 'Also in History'], ['goal', 'History + weekly goal']].map(([v, l]) => `<option value="${v}" ${(st().actShow || 'cal') === v ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`;
  function listSheet() {
    const o = mv;
    A.openSheet(`<h2>Add an activity</h2><p class="xs muted">${esc(dayText(o.day))}. Pick what you did: you can type its calories${wOn() ? ', add a photo of your watch' : ''}, or say how long and how hard.</p>
      <div class="search mt8"><span class="ic">⌕</span><input class="input" id="mvQ" placeholder="Search: cricket, walk, kabaddi, yoga…" value="${esc(o.q || '')}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"></div>
      ${groupsHtml(o.q ? '' : o.g)}<div id="mvList" class="mt8">${listItems(o.q, o.g)}</div>
      ${showSel()}<p class="xs dim mt8">How much energy each one takes is from the 2024 Adult Compendium of Physical Activities.</p>`, null, () => { if (mv === o) mv = null; });
    mv = o;
  }
  function dayText(t0) { const t = dayStart(Date.now()), d = new Date(t0); return t0 === t ? 'Today' : t0 === dayStart(t - 3600000) ? 'Yesterday' : `${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d.getDay()]} ${d.getDate()} ${A.MONTHS_LONG[d.getMonth()]}`; }

  // what the person filled in, as the entry it would save
  function entryOf(o) {
    const sp = BY.get(o.aid), x = { t: o.t, mins: Math.round(num(o.mins)), aid: o.aid, name: o.aid === 'other' ? String(o.name || '').trim().slice(0, 40) : '', how: o.how };
    if (o.how === 'typed') { x.kc = Math.round(num(o.kc)); x.kk = o.kk || ''; }
    else if (o.how === 'shot') { x.shot = o.shot || null; }
    else if (sp) {
      if (sp.kinds && o.k >= 0 && sp.kinds[o.k]) { x.k = o.k; x.met = sp.kinds[o.k][1]; }
      else { x.e = o.e; x.ti = o.ti; x.met = metAt(sp, o.e, o.ti); }
    }
    if (o.watch === 0 || o.watch === 1) x.watch = o.watch;
    return x;
  }
  const dayInfo = t0 => C.dayOf(t0);
  // the calories, and what they add to the day, in words
  function resultHtml(o) {
    const sp = BY.get(o.aid), x = entryOf(o), d = dayInfo(o.day), mins = x.mins;
    if (!(mins >= 1) && o.how !== 'shot') return `<div class="mv-res"><span class="small muted">Type how long it was to see the calories.</span></div>`;
    if (o.how === 'typed' && !(x.kc > 0)) return `<div class="mv-res"><span class="small muted">${wOn() ? 'Type the calories your watch or app showed.' : 'Type the calories your app or the machine showed.'}</span></div>`;
    if (o.how === 'shot' && !(o.shot && o.shot.kcal > 0)) return '';
    if (o.how === 'shot' && !(mins >= 1)) return `<div class="mv-res"><span class="small muted">Type how long it was: it decides how much of it your everyday burn already counts.</span></div>`;
    const b = C.actBurn(x), add = C.addOf(b, x, d.base, d.onWatch, d.cut), kg = b.kg, lines = [], after = isAfter(d, x.t);
    if (o.how === 'est' && sp) {
      const k = x.k >= 0 && sp.kinds ? sp.kinds[x.k] : null;
      lines.push(k ? `${esc(sp.name)}, ${esc(k[0])}: ${g1(x.met)} METs (Compendium code ${esc(k[2])})` : `${esc(sp.name)}, ${EFF[o.e][0].toLowerCase()} effort, ${TIRED[o.ti][0].toLowerCase()}: ${g1(x.met)} METs`);
      lines.push(`${g1(x.met)} × ${g1(kg)} kg${b.guess ? ' (log your body weight for a closer number)' : ''} × ${fmtMin(mins)} ≈ ${n0(b.kcal)} kcal`);
    } else if (b.kind === 'active') lines.push(`Active calories leave out what your body burns at rest: about ${n0(b.restMin * mins)} kcal for ${fmtMin(mins)}, so ${n0(b.gross)} in all.`);
    let addTxt;
    if (after) addTxt = `It's after your watch's numbers (taken at ${clock(d.cut)}), and the rest of your day already counts about ${n0(b.per * mins)} kcal for ${fmtMin(mins)} at your usual pace, so <b>${n0(add)} kcal</b> are added to Burnt.`;
    else if (d.onWatch) addTxt = x.watch === 1 ? "It's already in your watch's total for the day, so nothing is added." : x.watch === 0 ? `Your watch's day total counts resting for that time (about ${n0(b.restMin * mins)} kcal), so ${n0(add)} kcal are added to Burnt.` : 'Was your watch on? Answer below so it is not counted twice.';
    else if (d.base != null) addTxt = `Your everyday burn already counts about ${n0(d.base / 1440 * mins)} kcal for ${fmtMin(mins)}, so <b>${n0(add)} kcal</b> are added to Burnt.`;
    else addTxt = `All ${n0(add)} kcal are added to Burnt (it counts workouts and activities only).`;
    return `<div class="mv-res"><div class="title">${o.how === 'est' ? '≈ ' : ''}${n0(b.kcal)} kcal</div><div class="small mt4">${addTxt}</div>${lines.length ? `<div class="xs muted mt4">${lines.join('<br>')}</div>` : ''}</div>`;
  }
  function formHtml(o) {
    const sp = BY.get(o.aid) || BY.get('other'), d = dayInfo(o.day), chip = (act, v, on, label, extra) => `<button class="chip ${on ? 'on' : ''}" data-act="${act}" data-v="${v}"${extra || ''}>${label}</button>`;
    let h = `${o.aid === 'other' ? `<div class="field mt8"><label class="lbl" for="mvName">What was it?</label><input class="input" id="mvName" maxlength="40" placeholder="For example: kite flying, tug of war" value="${esc(o.name || '')}"></div>` : ''}
      <div class="row mt8" style="gap:10px"><div class="field grow"><label class="lbl" for="mvAt">Started at</label><input class="input" id="mvAt" type="time" value="${hhmm(o.t)}"></div>
        <div class="field grow"><label class="lbl" for="mvMins">How long (minutes)</label><input class="input" id="mvMins" type="number" inputmode="numeric" min="1" max="720" value="${o.mins || ''}" placeholder="60"></div></div>
      <div class="chips">${[15, 30, 45, 60, 90, 120].map(m => chip('mvMinsSet', m, +o.mins === m, m < 60 ? `${m} min` : m === 60 ? '1 h' : `${g1(m / 60)} h`)).join('')}</div>
      <div class="kc-sec mt12">The calories</div>
      <div class="seg mv-how">${chip('mvHow', 'est', o.how === 'est', 'Work it out')}${chip('mvHow', 'typed', o.how === 'typed', 'Type them')}${wOn() || o.how === 'shot' ? chip('mvHow', 'shot', o.how === 'shot', '📷 Watch photo') : ''}</div>`;
    if (o.how === 'est') {
      if (sp.kinds) h += `<div class="field mt8"><label class="lbl" for="mvKind">${o.aid === 'swimming' ? 'Stroke and speed' : o.aid === 'skipping' ? 'How fast' : 'Speed'}, if you know it</label><select class="input" id="mvKind"><option value="-1">Not sure: go by how hard and how tired</option>${sp.kinds.map((k, i) => `<option value="${i}" ${o.k === i ? 'selected' : ''}>${esc(k[0])}</option>`).join('')}</select></div>`;
      if (!(sp.kinds && o.k >= 0)) h += `<div class="small mt8" style="font-weight:600">How hard did you play?</div><div class="chips mt4">${EFF.map((x, i) => chip('mvEff', i, o.e === i, x[0])).join('')}</div><div class="xs dim">${esc(EFF[o.e][1])}</div>
        <div class="small mt8" style="font-weight:600">How tired do you feel now?</div><div class="chips mt4">${TIRED.map((x, i) => chip('mvTired', i, o.ti === i, x[0])).join('')}</div>`;
      else h += `<p class="xs muted mt4">Your speed decides it.</p>`;
    } else if (o.how === 'typed') {
      h += `<div class="field mt8"><label class="lbl" for="mvKc">Calories it burnt (kcal)</label><input class="input" id="mvKc" type="number" inputmode="numeric" min="1" max="5000" value="${o.kc || ''}" placeholder="${wOn() ? 'From your watch, app or the machine' : 'From your app or the machine'}"></div>
        <div class="small" style="font-weight:600">That number is</div><div class="chips mt4">${chip('mvKk', 'total', o.kk === 'total', 'Total calories')}${chip('mvKk', 'active', o.kk === 'active', 'Active calories')}${chip('mvKk', '', !o.kk, 'Not sure')}</div>
        <p class="xs dim">Watches show "active" calories without what your body burns at rest, and "total" with it. Not sure counts it as total, so nothing is counted twice.</p>`;
    } else {
      const F = window.Food, n = (o.pics || []).length;
      if (n && F && F.photoStrip) h += F.photoStrip(o.pics, { tall: true, max: 10, what: 'Screenshot', del: o.busy ? '' : 'mvPicDel', add: o.busy ? '' : 'mvShotMore', addText: 'Add a screenshot' });
      if (o.busy) h += `<div class="kc-ai"><span class="kc-spin"></span> Reading ${n === 1 ? 'the screenshot' : `the ${n} screenshots together`}…</div>`;
      else if (o.err) h += `<p class="small mt8">${esc(o.err)}</p><div class="row mt8" style="gap:8px"><button class="btn grow" data-act="mvHow" data-v="typed">Type it instead</button><button class="btn primary grow" data-act="mvShotAgain">Try again</button></div>`;
      else if (o.shot) h += `<div class="mt8">${C.wkNumbers ? C.wkNumbers(o.shot) : ''}</div>`;
      else h += `<button class="btn block mt8" data-act="mvShots">📷 Choose screenshots of the activity</button><p class="xs dim mt4">The summary screen of your watch's app for this activity: its calories, time and heart rate are read for you (up to 10 screenshots).</p>`;
    }
    if (d.onWatch) h += `<div id="mvWatchQ"${isAfter(d, o.t) ? ' hidden' : ''}><div class="small mt12" style="font-weight:600">Was your watch on while you did this?</div><div class="chips mt4">${chip('mvWatchSet', 1, o.watch === 1, 'Yes, it was on')}${chip('mvWatchSet', 0, o.watch === 0, 'No')}</div>
      <p class="xs dim">This day's Burnt is your watch's total${d.cut != null ? ` up to ${clock(d.cut)}` : ''}, which already has whatever it recorded.</p></div>`;
    h += `<div id="mvRes" class="mt12">${resultHtml(o)}</div>
      <details class="kc-more-d mt8"><summary>Where the numbers come from</summary><p class="xs muted mt8">${esc(sp.src)}${sp.given.some(v => !v) && sp.id !== 'other' ? '. Values not given there are worked out from the others: easy is about a quarter less than moderate, hard about a third more, all out a sixth more than hard.' : ''}</p>
        <p class="xs muted mt8">METs (metabolic equivalents) are from the 2024 Adult Compendium of Physical Activities: 1 MET is about the energy of sitting still, roughly 1 kcal per kg of body weight an hour. How hard you played counts twice as much as how tired you feel. An estimate like this can easily be off by a fifth; your watch's number, when you have one, is closer.</p></details>
      <div class="row mt16" style="gap:8px">${o.id ? `<button class="btn danger" data-act="mvDel">Delete</button>` : `<button class="btn" data-act="mvBack">‹ Back</button>`}<button class="btn primary grow" data-act="mvSave">${o.id ? 'Save' : 'Add it'}</button></div>`;
    return h;
  }
  function formSheet() {
    const o = mv, sp = BY.get(o.aid) || BY.get('other');
    A.openSheet(`<h2>${sp.ic} ${esc(o.aid === 'other' && o.name ? o.name : sp.name)}</h2><div class="xs muted">${esc(dayText(o.day))}</div><div id="mvBody">${formHtml(o)}</div>`, null, () => { if (mv === o) mv = null; });
    mv = o;
  }
  const redrawForm = () => { const b = $('#mvBody'); if (b && mv) b.innerHTML = formHtml(mv); };
  // v1.21.8: started after the day's watch numbers were taken (so not in its total)
  const isAfter = (d, t) => !!(d && d.onWatch && d.cut != null && t >= d.cut);
  const timeSet = () => { const q = $('#mvWatchQ'); if (q && mv) q.hidden = isAfter(dayInfo(mv.day), mv.t); redrawRes(); };
  const redrawRes = () => { const r = $('#mvRes'); if (r && mv) r.innerHTML = resultHtml(mv); };
  // a start time typed for the day being added to
  function timeOn(day, v) { const m = /^(\d{1,2}):(\d{2})/.exec(v || ''); if (!m) return null; const d = new Date(day); d.setHours(+m[1], +m[2], 0, 0); return d.getTime(); }

  ACT.mvAdd = () => {
    const day = C.day ? C.day() : dayStart(Date.now());
    mv = { step: 'list', q: '', g: 'pop', day };
    listSheet();
  };
  ACT.mvGroup = el => { if (!mv) return; mv.g = el.dataset.g; mv.q = ''; const q = $('#mvQ'); if (q) q.value = ''; const l = $('#mvList'); if (l) l.innerHTML = listItems('', mv.g); document.querySelectorAll('.mv-groups .chip').forEach(c => c.classList.toggle('on', c.dataset.g === mv.g)); };
  ACT.mvPick = el => {
    const o = mv, sp = BY.get(el.dataset.id); if (!o || !sp) return;
    const now = Date.now(), today = o.day === dayStart(now), start = today ? Math.max(o.day, Math.floor((now - 3600000) / 300000) * 300000) : o.day + 17 * 3600000;
    Object.assign(o, { step: 'form', aid: sp.id, name: '', t: start, mins: '', how: 'est', e: 1, ti: 1, k: -1, kc: '', kk: '', shot: null, pics: [], busy: false, err: '', watch: null });
    formSheet();
  };
  ACT.mvBack = () => { const o = mv; if (!o) return; o.step = 'list'; listSheet(); };
  ACT.mvMinsSet = el => { if (!mv) return; mv.mins = +el.dataset.v; redrawForm(); };
  ACT.mvHow = el => { if (!mv) return; mv.how = el.dataset.v; mv.err = ''; redrawForm(); };
  ACT.mvEff = el => { if (!mv) return; mv.e = +el.dataset.v; redrawForm(); };
  ACT.mvTired = el => { if (!mv) return; mv.ti = +el.dataset.v; redrawForm(); };
  ACT.mvKk = el => { if (!mv) return; mv.kk = el.dataset.v; redrawForm(); };
  ACT.mvWatchSet = el => { if (!mv) return; mv.watch = +el.dataset.v; redrawForm(); };
  document.addEventListener('input', e => {
    const t = e.target; if (!mv || !t || !t.id) return;
    if (t.id === 'mvQ') { mv.q = t.value; const l = $('#mvList'); if (l) l.innerHTML = listItems(mv.q, mv.g); document.querySelectorAll('.mv-groups .chip').forEach(c => c.classList.toggle('on', !mv.q && c.dataset.g === mv.g)); }
    else if (t.id === 'mvMins') { mv.mins = t.value; document.querySelectorAll('[data-act="mvMinsSet"]').forEach(c => c.classList.toggle('on', +c.dataset.v === +t.value)); redrawRes(); }
    else if (t.id === 'mvKc') { mv.kc = t.value; redrawRes(); }
    else if (t.id === 'mvName') mv.name = t.value;
    else if (t.id === 'mvAt') { const v = timeOn(mv.day, t.value); if (v != null) { mv.t = v; timeSet(); } }
  });
  document.addEventListener('change', e => {
    const t = e.target; if (!mv || !t) return;
    if (t.id === 'mvKind') { mv.k = +t.value; redrawForm(); }
    else if (t.id === 'mvAt') { const v = timeOn(mv.day, t.value); if (v != null) { mv.t = v; timeSet(); } }
  });

  // ---------------- a photo of the watch ----------------
  const SHOT_SIDE = 1500;
  const ctxFor = o => { const sp = BY.get(o.aid); return `${o.aid === 'other' ? (o.name || 'an activity') : sp ? sp.name : 'an activity'}, ${dayText(o.day).toLowerCase()}, started about ${clock(o.t)}${num(o.mins) > 0 ? `, about ${Math.round(num(o.mins))} min` : ''}`; };
  async function shotRead(o) {
    Object.assign(o, { busy: true, err: '', shot: null }); redrawForm();
    let r;
    try { r = await C.readWorkout(o.pics.map(x => x.big), ctxFor(o)); }
    catch (e) { if (mv !== o) return; o.busy = false; o.err = (e && e.message) || "The screenshots couldn't be read. Type the calories instead."; redrawForm(); return; }
    if (mv !== o) return;
    o.busy = false;
    if (r && r.workout) {
      o.shot = C.shotOf(r.workout, o.pics.length);
      if (!(o.shot.kcal > 0)) { o.shot = null; o.err = 'No calories could be read in those screenshots. Type them instead, or say how long and how hard.'; }
      else if (!(num(o.mins) > 0) && o.shot.mins > 0) o.mins = Math.round(o.shot.mins);
    } else o.err = "No activity numbers could be read in those screenshots. Try the summary screen of your watch's app, or type the calories.";
    redrawForm();
  }
  ACT.mvShots = async () => {
    const o = mv, F = window.Food; if (!o || !F || !F.pickPhotos) return;
    const pics = await F.pickPhotos({ max: 10, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!pics.length || mv !== o) return;      // 1.35.2 (60): up to 10, was 4
    o.pics = pics; shotRead(o);
  };
  ACT.mvShotMore = async () => {
    const o = mv; if (!o || o.busy || (o.pics || []).length >= 10) return;
    const got = await window.Food.pickPhotos({ max: 10 - o.pics.length, limit: 10, side: SHOT_SIDE, q: 0.85 }); if (!got.length || mv !== o) return;
    o.pics = o.pics.concat(got).slice(0, 10); shotRead(o);
  };
  ACT.mvPicDel = el => { const o = mv; if (!o || o.busy || !o.pics || o.pics.length < 2) return; o.pics.splice(+el.dataset.i, 1); shotRead(o); };
  ACT.mvShotAgain = () => { if (mv && !mv.busy && mv.pics && mv.pics.length) shotRead(mv); };

  // ---------------- saving, changing, deleting ----------------
  const redrawAll = () => { if (C.redraw) C.redraw(); };
  ACT.mvSave = () => {
    const o = mv; if (!o) return;
    const x = entryOf(o), d = dayInfo(o.day);
    if (o.aid === 'other' && !x.name) { toast('Type what it was'); return; }
    if (!(x.mins >= 1 && x.mins <= 720)) { toast('Type how long it was, in minutes'); return; }
    if (o.how === 'typed' && !(x.kc >= 1 && x.kc <= 5000)) { toast("That calorie number doesn't look right"); return; }
    if (o.how === 'shot' && !(x.shot && x.shot.kcal > 0)) { toast('Add a screenshot first, or type the calories'); return; }
    if (d.onWatch && x.watch == null && !isAfter(d, x.t)) { toast('Say whether your watch was on'); return; }
    if (!(x.t >= o.day && x.t < o.day + 86400000 + 3600000)) x.t = o.day + 12 * 3600000;
    const was = o.id ? D.sports.find(y => y.id === o.id) : null;
    if (was) { const old = JSON.parse(JSON.stringify(was)); Object.keys(was).forEach(k => { if (k !== 'id') delete was[k]; }); Object.assign(was, x); S.save(true); mv = null; A.closeSheet(); redrawAll();
      undoToast('Activity changed', () => { const y = D.sports.find(z => z.id === old.id); if (y) { Object.keys(y).forEach(k => delete y[k]); Object.assign(y, old); S.save(true); redrawAll(); } }); return; }
    x.id = S.uid(); D.sports.push(x); S.save(true); mv = null; A.closeSheet(); redrawAll();
    const b = C.actBurn(x), add = C.addOf(b, x, d.base, d.onWatch, d.cut);
    undoToast(`${nameOf(x)} added · ${add > 0 ? `+${n0(add)} kcal to Burnt` : "already in your watch's total"}`, () => { const i = D.sports.findIndex(y => y.id === x.id); if (i >= 0) { D.sports.splice(i, 1); S.save(true); redrawAll(); } });
  };
  ACT.mvOpen = el => {
    const x = D.sports.find(y => y.id === el.dataset.id); if (!x) return;
    const sp = BY.get(x.aid) || BY.get('other');
    mv = { step: 'form', id: x.id, day: dayStart(x.t), aid: sp.id, name: x.name || '', t: x.t, mins: x.mins, how: x.how || 'est', e: x.e != null ? x.e : 1, ti: x.ti != null ? x.ti : 1, k: x.k != null ? x.k : -1,
      kc: x.kc || '', kk: x.kk || '', shot: x.shot || null, pics: [], busy: false, err: '', watch: x.watch === 0 || x.watch === 1 ? x.watch : null };
    formSheet();
  };
  ACT.mvDel = () => {
    const o = mv; if (!o || !o.id) return;
    const i = D.sports.findIndex(y => y.id === o.id); if (i < 0) return;
    const [x] = D.sports.splice(i, 1); S.save(true); mv = null; A.closeSheet(); redrawAll();
    undoToast(`${nameOf(x)} deleted`, () => { D.sports.push(x); S.save(true); redrawAll(); });
  };
  // the watch question, answered on the Burnt card
  ACT.mvWatch = el => { const x = D.sports.find(y => y.id === el.dataset.id); if (!x) return; x.watch = +el.dataset.v ? 1 : 0; S.save(true); redrawAll(); };

  // ---------------- on the Burnt card ----------------
  const nameOf = x => { const sp = BY.get(x.aid); return x.name || (sp ? sp.name : 'Activity'); };
  const icOf = x => { const sp = BY.get(x.aid); return sp ? sp.ic : '🏅'; };
  function howText(x) {
    if (x.how === 'typed') return `typed by you${x.kk === 'active' ? ', active calories' : x.kk === 'total' ? ', total calories' : ''}`;
    if (x.how === 'shot') return `from your watch's screenshots${x.shot && x.shot.app ? ' · ' + x.shot.app : ''}`;
    const sp = BY.get(x.aid);
    if (sp && sp.kinds && x.k >= 0 && sp.kinds[x.k]) return `estimate: ${sp.kinds[x.k][0]}`;
    return `estimate: ${EFF[x.e != null ? x.e : 1][0].toLowerCase()}, ${TIRED[x.ti != null ? x.ti : 1][0].toLowerCase()}`;
  }
  function rowHtml(y, d) {
    const x = y.x, b = y.b;
    let right = `<div class="small" style="font-weight:700">${x.how === 'est' || !x.how ? '≈ ' : ''}${n0(b.kcal)}</div>`, ask = '';
    let why = '';
    if (y.after) { right += `<div class="xs dim">adds ${n0(y.add)}</div>`; why = `<div class="xs dim kc-why">after your watch's numbers (${clock(d.cut)})</div>`; }
    else if (d.onWatch) {
      if (x.watch === 1) right += `<div class="xs dim">in the watch's total</div>`;
      else if (x.watch === 0) right += `<div class="xs dim">adds ${n0(y.add)}</div>`;
      else ask = `<div class="row mt4" style="gap:6px;flex-wrap:wrap"><span class="xs">Was your watch on for this?</span><button class="chip" data-act="mvWatch" data-id="${esc(x.id)}" data-v="1">Yes</button><button class="chip" data-act="mvWatch" data-id="${esc(x.id)}" data-v="0">No</button></div>`;
    } else if (d.base != null) { right += `<div class="xs dim">adds ${n0(y.add)}</div>`; why = `<div class="xs dim kc-why">everyday burn already counts ${n0(d.base / 1440 * b.mins)} for ${fmtMin(b.mins)}</div>`; }
    return `<div class="list-item tap mv-row" data-act="mvOpen" data-id="${esc(x.id)}"><span class="mv-ic">${icOf(x)}</span><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(nameOf(x))}</div><div class="xs muted">${clock(x.t)} · ${fmtMin(b.mins)} · ${esc(howText(x))}</div>${why}${ask}</div><div class="right">${right}</div></div>`;
  }

  // ---------------- History and the weekly goal (the person's choice) ----------------
  const showMode = () => (['hist', 'goal'].includes(st().actShow) ? st().actShow : 'cal');
  const inHistory = () => showMode() !== 'cal';
  const GOAL_MIN = 20;          // an activity counts toward the weekly goal from 20 minutes
  const goalCount = (from, to) => (showMode() === 'goal' ? D.sports.filter(x => x.t >= from && x.t < to && num(x.mins) >= GOAL_MIN).length : 0);
  function histItemHtml(x) {
    const b = C.actBurn(x);
    return `<div class="hist-item mv-hist" data-act="mvOpen" data-id="${esc(x.id)}"><div class="dot mv-dot"></div><div class="grow"><div style="font-weight:600">${icOf(x)} ${esc(nameOf(x))}</div>
      <div class="xs muted">${A.fmtDate(x.t)} · ${A.fmtClock(x.t)} · ${fmtMin(b.mins)} · ${x.how === 'est' || !x.how ? '≈ ' : ''}${n0(b.kcal)} kcal</div></div></div>`;
  }
  const histList = () => (inHistory() ? D.sports.slice() : []);
  // History's search: every word in the activity's name
  const histMatch = words => (inHistory() ? D.sports.filter(x => { const h = fold(nameOf(x) + ' ' + ((BY.get(x.aid) || {}).aka || '')).split(' '); return words.every(w => h.some(y => y.startsWith(fold(w)))); }) : []);

  window.Sports = { LIST, BY, metAt, levelOf, rowHtml, nameOf, inHistory, showMode, goalCount, histItemHtml, histList, histMatch, GOAL_MIN };
})();
