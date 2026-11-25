/* GymDay 1.35.1 – how sore you are, worked out by GymDay and changed to how you feel.
   GymDay works out how sore each part of each muscle should be from your workouts (below), so the day after a triceps
   workout Today already says "Triceps: sore · mostly the long head". You change it muscle by muscle (Not, A bit, Sore,
   Very); GymDay spreads your answer over the muscle's parts the way the workouts loaded them. Settings → More features →
   "Soreness for each part" (off at first) lets you set each head or part yourself. It shows on Today (the day after a
   workout and the day after that), on Recovery, on each exercise during a workout, on a workout's page, and part by part in
   Trainer mode, whose Build me a workout goes easy on the sore parts. Answers are kept with the day: checks[].sg =
   { muscle: 0 … 3 } and, part by part, checks[].sp = { part: 0 … 3 }; Recovery counts the answers.
   Soreness after training (delayed-onset muscle soreness) is slight for the first hours, strongest 1 to 2½ days later and gone
   within about 5 days; sharp pain, swelling or pain that keeps getting worse is not it, so the sheet says to rest and see a
   doctor then. */
(function () {
  const A = window.App, S = window.Store, F = window.BodyFig, I = window.Insights, P = window.Progress;
  if (!A || !S || !F || !I || !P || !P.checkFor) return;
  const { $$, esc, ACT, VIEWS } = A, D = S.data, toast = m => window.toast(m), st = () => D.settings;
  const DAY = 86400000, HR = 3600000;
  const LV = ['Not sore', 'A bit sore', 'Sore', 'Very sore'], SHORT = ['Not', 'A bit', 'Sore', 'Very'];
  const days = (a, b) => Math.round((P.day0(b) - P.day0(a)) / DAY);
  const work = s => (s.items || []).some(it => !it.skipped && (it.sets || []).some(S.work));
  const uniq = l => [...new Set(l)];
  const perPart = () => !!st().sorePart;
  const partsOfG = g => F.PARTS.filter(id => F.group(id) === g);
  const clamp = v => Math.max(0, Math.min(3, v | 0));
  // a part's own name inside its muscle: "long head" in Triceps (long head), "upper chest", "lower back"
  // 1.35.2: in everyday words ("the outer and inner", not "the outer, vastus lateralis and inner, vastus medialis")
  const PLAIN = { 'outer, vastus lateralis': 'outer', 'inner, vastus medialis': 'inner', 'rectus femoris': 'middle', 'outer, biceps femoris': 'outer', 'gluteus maximus': 'main glute', 'gluteus medius': 'side glute', 'gluteus minimus': 'small glute', 'inner gastrocnemius': 'inner', 'outer gastrocnemius': 'outer', soleus: 'lower part', brachioradialis: 'top of the forearm', tibialis: 'front' };
  const short = id => { const n = F.name(id), m = /^(.+?) \(([^)]+)\)$/.exec(n), x = m ? (m[1] === F.group(id) ? m[2] : m[1].toLowerCase()) : n.toLowerCase(); return PLAIN[x] || x; };
  // the parts a workout worked a full set's worth or more (a set counts fully where an exercise is for a part, half where it
  // works it well, a quarter where it helps), the most worked first
  function hitOf(s) { const n = I.areaSets([s]); return Object.keys(n).filter(id => n[id] >= 1).sort((a, b) => n[b] - n[a]); }
  const groupsOf = s => uniq(hitOf(s).map(id => F.group(id)));

  // ---------------- worked out: how sore each part should be ----------------
  // Each workout of the last 6 days counts its work sets for a part: a full set where the exercise is for that part, a half
  // where it works it well, a quarter where it helps; an all-out set 1.25, one rep left 1.1, two left 1, an easy one 0.75. New
  // work makes the most soreness (what you do often makes less, the repeated-bout effect): an exercise not done in the 2 weeks
  // before counts 1.5 times, a muscle not trained in the 10 days before 1.3 times (1.8 at most; 1.3 for a first workout in
  // GymDay, whose history is not known). The workout's share then follows the soreness curve: nothing in the first 4 hours,
  // rising to the most at 30 hours, the most until 60, gone by 5½ days. A day is read at midday: a score of 3 is a bit
  // sore, 6.5 sore, 12 very sore. So 11 sets for the triceps you do every week are a bit sore the next day and sore the day
  // after; the same after weeks off, or new to you, are very sore the day after.
  const curve = h => (h < 4 ? 0 : h < 30 ? (h - 4) / 26 : h <= 60 ? 1 : h < 132 ? 1 - (h - 60) / 72 : 0);
  const EFF = x => (x.eff === 0 ? 1.25 : x.eff === 1 ? 1.1 : x.eff === 3 ? 0.75 : 1);
  const levelOf = x => (x >= 12 ? 3 : x >= 6.5 ? 2 : x >= 3 ? 1 : 0);
  const noon = t => P.day0(t) + 12 * HR;
  function earlier(s, n, test) {
    const t = s.start || s.end || 0;
    return (D.sessions || []).some(o => o !== s && (o.start || 0) < t && (o.start || 0) >= t - n * DAY && (o.items || []).some(it => !it.skipped && (it.sets || []).some(S.work) && test(it)));
  }
  function loadOf(s) {
    const out = {}, newG = {}, t = s.start || s.end || 0, known = (D.sessions || []).some(o => o !== s && (o.start || 0) < t && work(o));
    for (const it of s.items || []) {
      if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex) continue;
      let n = 0; for (const x of it.sets || []) if (S.work(x)) n += EFF(x); if (!n) continue;
      const fresh = earlier(s, 14, o => o.ex === it.ex) ? 1 : 1.5, p = I.exAreas(ex);
      for (const a of Object.keys(p.lv)) {
        const g = F.group(a);
        if (!(g in newG)) newG[g] = earlier(s, 10, o => { const e = S.getEx(o.ex); return !!e && Object.keys(I.exAreas(e).lv).some(b => F.group(b) === g); }) ? 1 : 1.3;
        out[a] = (out[a] || 0) + n * p.w(a) * (known ? Math.min(1.8, fresh * newG[g]) : 1.3);
      }
    }
    return out;
  }
  function estimate(t) {
    const sc = {};
    for (const s of D.sessions || []) {
      const e = s.end || s.start; if (!e || e > t || e < t - 6 * DAY || !work(s)) continue;
      const k = curve((t - e) / HR); if (!(k > 0)) continue;
      const L = loadOf(s); for (const a in L) sc[a] = (sc[a] || 0) + L[a] * k;
    }
    return sc;
  }
  // the day's soreness: { parts: {part: 0…3}, groups: {muscle: 0…3}, you: {muscle: true where you answered}, sc: the scores }.
  // Your answer for a muscle moves its parts up or down together from what GymDay worked out, so the most worked part is
  // what you said and the others keep their place below it; a part you set yourself is what you set.
  function levelsWith(sc, sg, sp) {
    const parts = {}, groups = {}, you = {};
    for (const g of F.GROUPS) {
      const ids = partsOfG(g), mx = Math.max(0, ...ids.map(id => sc[id] || 0)), e = levelOf(mx);
      if (sg && sg[g] != null) {
        const v = clamp(sg[g]); you[g] = true;
        // (when GymDay worked out "not sore" there are no steps to keep: the parts it worked most get your answer, a part worked
        // under 60% as much one step less, under 30% two; and when the workouts hardly touched the muscle, they say nothing about
        // where: every part gets your answer)
        const info = mx >= 1.5;
        for (const id of ids) { const r = info ? (sc[id] || 0) / mx : 1; parts[id] = !v || !(r > 0) ? 0 : !info ? v : e ? clamp(levelOf(sc[id]) + v - e) : clamp(v - (r >= 0.6 ? 0 : r >= 0.3 ? 1 : 2)); }
      } else for (const id of ids) parts[id] = levelOf(sc[id] || 0);
      for (const id of ids) if (sp && sp[id] != null) { parts[id] = clamp(sp[id]); you[g] = true; }
      groups[g] = Math.max(0, ...ids.map(id => parts[id]));
    }
    return { parts, groups, you, sc };
  }
  const MEMO = new Map();
  function levelsOn(t) {
    t = t || Date.now();
    const c = P.checkOf(t), last = (D.sessions || []).reduce((m, s) => Math.max(m, s.end || s.start || 0, s.u || 0), 0);
    const k = [P.day0(t), (D.sessions || []).length, last, JSON.stringify(c ? [c.sg, c.sp] : 0), Math.floor(Date.now() / 60000)].join('|');
    if (MEMO.has(k)) return MEMO.get(k);
    if (MEMO.size > 40) MEMO.clear();
    const v = levelsWith(estimate(noon(t)), c && c.sg, c && c.sp); MEMO.set(k, v); return v;
  }
  // a muscle's line: "Triceps: sore · mostly the long head"
  // (all its sore parts equally sore: the one worked clearly the most, or all of them)
  function which(lv, g) {
    const all = partsOfG(g), v = lv.groups[g], ids = all.filter(id => lv.parts[id] > 0).sort((a, b) => lv.parts[b] - lv.parts[a] || (lv.sc[b] || 0) - (lv.sc[a] || 0));
    if (!v || !ids.length || all.length < 2) return '';
    if (ids.length === 1) return `the ${short(ids[0])}`;
    const top = ids.filter(id => lv.parts[id] === v);
    if (top.length < ids.length) return `mostly the ${top.slice(0, 2).map(short).join(' and ')}`;
    if ((lv.sc[ids[0]] || 0) > (lv.sc[ids[1]] || 0) * 1.15) return `mostly the ${short(ids[0])}`;
    if (ids.length < all.length) return `the ${ids.slice(0, 2).map(short).join(' and ')}${ids.length > 2 ? ' and more' : ''}`;
    return all.every(id => /head$/.test(short(id))) ? `all ${all.length} heads` : 'all of it';
  }
  const dot = v => `<span class="sr-dot sr${v}"></span>`;
  const gLine = (lv, g) => { const w = which(lv, g); return `<div class="small sore-l">${dot(lv.groups[g])}<b>${esc(g)}</b>: ${LV[lv.groups[g]].toLowerCase()}${w ? ` <span class="muted">· ${esc(w)}</span>` : ''}</div>`; };
  const soreGroups = lv => F.GROUPS.filter(g => lv.groups[g] > 0).sort((a, b) => lv.groups[b] - lv.groups[a]);
  const figs = (level, opt, cls) => `<div class="sore-figs">${[false, true].map(b => F.svg(level, b, opt).replace('class="bodyfig anat"', `class="bodyfig anat ${cls || ''}"`)).join('')}</div>`;
  const legend = () => `<div class="legend sore-leg">${LV.map((t, i) => `<span><i class="sr${i}"></i>${t}</span>`).join('')}</div>`;

  // ---------------- the card on Today: the day after a workout and the day after that ----------------
  // workouts that ended 1 or 2 days ago and weren't asked about for that day yet: [{ s, d }]
  function pending(now) {
    now = now || Date.now(); const out = [];
    for (const s of D.sessions || []) {
      const t = s.end || s.start; if (!t || t > now) continue;
      const d = days(t, now); if (d < 1 || d > 2 || (s.sa || 0) >= d || !work(s)) continue;
      const hit = hitOf(s); if (hit.length) out.push({ s, d, hit });
    }
    return out.sort((a, b) => (a.s.end || a.s.start) - (b.s.end || b.s.start));
  }
  const when = d => (d === 1 ? 'yesterday' : '2 days ago');
  function homeCard() {
    const p = pending(); if (!p.length) return '';
    const lv = levelsOn(Date.now()), gs = soreGroups(lv); if (!gs.length) return '';
    const what = uniq(p.map(x => `${esc(x.s.dayName || 'your workout')} (${when(x.d)})`)).join(' and '), mine = gs.some(g => lv.you[g]);
    return `<div class="card" id="soreCard"><div class="row" style="align-items:flex-start;gap:10px"><div class="grow" style="min-width:0">
        <div class="k2">${p.every(x => x.d === 2) ? 'Still sore?' : 'Sore today'}</div>
        <div class="xs muted mt4">${mine ? 'What you said' : 'Worked out by GymDay'} after ${what}</div>
        <div class="sore-gl mt8">${gs.slice(0, 4).map(g => gLine(lv, g)).join('')}${gs.length > 4 ? `<div class="xs muted">and ${gs.length - 4} more</div>` : ''}</div></div>
        <div class="sore-mini" aria-hidden="true">${figs(id => lv.parts[id], { tip: () => '' }, 'mini sore')}</div></div>
      <div class="row mt12" style="gap:8px"><button class="btn grow" data-act="soreOk">That’s right</button><button class="btn primary grow" data-act="soreOpen">Change it ›</button></div>
      <div class="mt8" style="text-align:center"><button class="linkish xs" data-act="soreSkip">Not now</button></div></div>`;
  }
  const mark = list => { for (const x of list) x.s.sa = Math.max(x.s.sa || 0, x.d); };
  ACT.soreSkip = () => { mark(pending()); S.save(true); A.rerender(); };
  // "That's right": what GymDay worked out becomes your answer for those muscles
  ACT.soreOk = () => {
    const p = pending(), now = Date.now(), lv = levelsOn(now), c = P.checkFor(now); c.sg = c.sg || {};
    for (const g of uniq(soreGroups(lv).concat(p.flatMap(x => groupsOf(x.s))))) if (c.sg[g] == null) c.sg[g] = lv.groups[g];
    c.at = now; mark(p); S.save(true); A.rerender(); toast('Saved');
  };
  // (1.35) "Not sore": every muscle those workouts worked
  ACT.soreNone = () => {
    const p = pending(); if (!p.length) return; const c = P.checkFor(Date.now()); c.sg = c.sg || {};
    for (const g of uniq(p.flatMap(x => groupsOf(x.s)))) c.sg[g] = 0;
    c.at = Date.now(); mark(p); S.save(true); A.rerender(); toast('Saved: not sore');
  };

  // ---------------- the sheet: the body to tap, and each muscle (or part) with its four answers ----------------
  let sh = null;      // { sg, sp, back, groups, marks, sc }
  function open(marks) {
    const now = Date.now(), c = P.checkOf(now) || {}, lv = levelsOn(now);
    const recent = (D.sessions || []).filter(s => (s.end || s.start) > now - 5 * DAY && (s.end || s.start) <= now && work(s)).flatMap(groupsOf);
    // the sorest first; the order then stays put while you change them
    const groups = F.GROUPS.filter(g => recent.includes(g) || lv.groups[g] > 0 || (c.sg && c.sg[g] != null)).sort((a, b) => lv.groups[b] - lv.groups[a] || F.GROUPS.indexOf(a) - F.GROUPS.indexOf(b));
    // it opens on the side with more soreness to see (the triceps are on the back)
    const lit = b => F.AREAS.filter(x => x.view.includes(b ? 'b' : 'f')).reduce((t, x) => t + (lv.parts[x.id] || 0), 0);
    sh = { sg: Object.assign({}, c.sg || {}), sp: Object.assign({}, c.sp || {}), back: lit(true) > lit(false), groups, marks, sc: lv.sc };
    if (window.BodyZoom && window.BodyZoom.forget) window.BodyZoom.forget('sore-');
    A.openSheet(sheetHtml(), null, () => { sh = null; });
  }
  const shLv = () => levelsWith(sh.sc, sh.sg, sh.sp);
  ACT.soreOpen = () => open(pending());
  ACT.soreEdit = () => open([]);
  function sheetHtml() {
    const lv = shLv(), pp = perPart();
    const chips = (v, attrs, label) => `<div class="sore-chips" role="radiogroup" aria-label="${esc(label)}">${SHORT.map((t, i) => `<button class="chip ${v === i ? 'on' : ''}" ${attrs} data-v="${i}" aria-pressed="${v === i}">${t}</button>`).join('')}</div>`;
    const rows = sh.groups.map(g => {
      const w = which(lv, g), by = lv.you[g] ? 'you said' : 'worked out';
      let h = `<div class="sore-r" data-g="${esc(g)}"><div class="grow" style="min-width:0"><div class="small" style="font-weight:700">${esc(g)}</div><div class="xs dim">${w ? esc(w) + ' · ' : ''}${by}</div></div>${chips(lv.groups[g], `data-act="soreSetG" data-g="${esc(g)}"`, g)}</div>`;
      if (pp) h += partsOfG(g).filter(id => lv.parts[id] > 0 || (sh.sc[id] || 0) > 0 || sh.sp[id] != null).map(id => `<div class="sore-r sore-pr"><span class="small grow">${esc(short(id))}</span>${chips(lv.parts[id], `data-act="soreSet" data-part="${id}"`, F.name(id))}</div>`).join('');
      return h;
    }).join('');
    const sore = soreGroups(lv);
    return `<h2>How sore are you?</h2><p class="small muted">GymDay worked this out from your workouts. Change ${pp ? 'any muscle or part' : 'any muscle'} to how you feel: tap ${pp ? 'it' : 'the muscle'} on the body (again for more) or pick beside it.</p>
      <div class="bp-side bf-side" role="group" aria-label="Side of the body"><button class="chip ${sh.back ? '' : 'on'}" data-act="soreSide" data-v="f" aria-pressed="${!sh.back}">Front</button><button class="chip ${sh.back ? 'on' : ''}" data-act="soreSide" data-v="b" aria-pressed="${sh.back}">Back</button></div>
      <div class="sore-big bz" id="soreFig" data-bzk="sore-${sh.back ? 'b' : 'f'}">${F.svg(id => lv.parts[id], sh.back, { act: 'soreTap', tip: id => `${F.name(id)} · ${LV[lv.parts[id]].toLowerCase()}` }).replace('class="bodyfig anat"', 'class="bodyfig anat sore"')}</div>${legend()}
      ${rows ? `<div class="sore-list mt12">${rows}</div>` : ''}
      <p class="xs dim mt12">${pp ? '' : 'To set each head or part yourself: Settings → More features → Soreness for each part. '}Soreness after training usually peaks 1 to 2 days later and fades within about 5 days. Sharp pain, swelling, or pain that keeps getting worse is not normal soreness: rest that part and see a doctor. GymDay gives general fitness information, not medical advice.</p>
      ${sore.length && window.Stretch && window.Stretch.openFor ? `<button class="btn block mt12" data-act="soreStretch">🧘 Stretches for the sore muscles</button>` : ''}
      <div class="row mt12" style="gap:8px"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="soreSave">Save</button></div>`;
  }
  const redraw = () => { const p = document.querySelector('#sheet .panel'); if (!p || !sh) return; const y = p.scrollTop; p.innerHTML = '<div class="handle"></div>' + sheetHtml(); p.scrollTop = y; if (window.BodyZoom) window.BodyZoom.restore(); };
  // a muscle set by you: its parts follow it (a part set by hand for it before is let go)
  const setG = (g, v) => { sh.sg[g] = clamp(v); partsOfG(g).forEach(id => { delete sh.sp[id]; }); if (!sh.groups.includes(g)) sh.groups.push(g); };
  ACT.soreTap = el => {
    if (!sh) return; const id = el.dataset.part, g = F.group(id), lv = shLv();
    if (perPart()) { sh.sp[id] = (lv.parts[id] + 1) % 4; if (!sh.groups.includes(g)) sh.groups.push(g); } else setG(g, (lv.groups[g] + 1) % 4);
    redraw();
  };
  ACT.soreSetG = el => { if (!sh) return; setG(el.dataset.g, +el.dataset.v); redraw(); };
  ACT.soreSet = el => { if (!sh) return; const id = el.dataset.part; sh.sp[id] = clamp(+el.dataset.v); const g = F.group(id); if (!sh.groups.includes(g)) sh.groups.push(g); redraw(); };
  ACT.soreSide = el => { if (!sh) return; sh.back = el.dataset.v === 'b'; redraw(); };
  ACT.soreSave = () => {
    if (!sh) return; const lv = shLv(), c = P.checkFor(Date.now()), sg = {};
    for (const g of sh.groups) sg[g] = lv.groups[g];          // what the sheet shows is your answer, muscle by muscle
    c.sg = sg;
    const sp = {}; if (perPart()) for (const [id, v] of Object.entries(sh.sp)) sp[id] = clamp(v);
    if (Object.keys(sp).length) c.sp = sp; else delete c.sp;
    if (!Object.keys(sg).length) delete c.sg;
    c.at = Date.now(); mark(sh.marks); S.save(true);
    const n = Object.values(sg).filter(v => v > 0).length; sh = null; A.closeSheet(); A.rerender();
    toast(n ? `Saved: ${n} sore ${n === 1 ? 'muscle' : 'muscles'}` : 'Saved: not sore');
  };
  ACT.soreStretch = () => {
    if (!sh || !window.Stretch || !window.Stretch.openFor) return;
    const lv = shLv(), sore = soreGroups(lv);
    ACT.soreSave(); window.Stretch.openFor(sore);
  };

  // ---------------- on the Recovery page ----------------
  function recoveryCard() {
    const now = Date.now(), lv = levelsOn(now), gs = soreGroups(lv), mine = Object.keys(lv.you).length, hist = recent();
    return `<div class="card" id="rcSore"><div class="k2">How sore are you today?</div>
      <div class="xs muted mt4">${gs.length ? (mine ? 'What you said, part by part as GymDay spreads it' : 'Worked out by GymDay from your workouts; change it to how you feel') : mine ? 'Not sore today.' : (S.data.sessions || []).length ? 'Not sore today, from your workouts.' : 'Nothing yet: after your first workout GymDay works out how sore you should be.'}</div>
      ${gs.length ? `<div class="row mt8" style="align-items:flex-start;gap:10px"><div class="grow sore-gl" style="min-width:0">${gs.slice(0, 6).map(g => gLine(lv, g)).join('')}${gs.length > 6 ? `<div class="xs muted">and ${gs.length - 6} more</div>` : ''}</div>
        <div class="sore-mini" aria-hidden="true">${figs(id => lv.parts[id], { tip: () => '' }, 'mini sore')}</div></div>` : ''}
      <button class="btn block mt12" data-act="soreEdit">${gs.length || mine ? 'Change it ›' : 'How sore are you? ›'}</button>
      ${hist.length ? `<div class="mt12"><div class="xs dim" style="margin-bottom:4px">The last 14 days</div>${hist.map(h => `<div class="sore-h"><span class="xs dim">${esc(A.fmtDate(h.t))}</span><span class="xs">${h.top}</span></div>`).join('')}</div>` : ''}</div>`;
  }
  function recent() {
    const out = [], now = Date.now();
    for (let i = 1; i <= 14 && out.length < 7; i++) {
      const t = now - i * DAY, lv = levelsOn(t), gs = soreGroups(lv), c = P.checkOf(t), asked = !!(c && (c.sg || c.sp));
      if (!gs.length && !asked) continue;
      out.push({ t, top: gs.length ? gs.slice(0, 3).map(g => `${dot(lv.groups[g])}${esc(g)}`).join(', ') + (gs.length > 3 ? ` +${gs.length - 3}` : '') + (lv.you[gs[0]] ? '' : ' <span class="muted">· worked out</span>') : 'not sore' });
    }
    return out;
  }

  // ---------------- under each workout: what it left you with ----------------
  function afterHtml(s) {
    const t = s.end || s.start; if (!t || !work(s)) return '';
    const gs0 = groupsOf(s); if (!gs0.length) return '';
    const today = P.day0(Date.now());
    const lines = [1, 2].map(d => {
      const tt = t + d * DAY, ahead = P.day0(tt) > today, lv = levelsOn(tt), gs = gs0.filter(g => lv.groups[g] > 0).sort((a, b) => lv.groups[b] - lv.groups[a]);
      const by = ahead ? 'expected' : gs.some(g => lv.you[g]) ? 'you said' : 'worked out';
      return `<div class="sore-h"><span class="xs dim">${d === 1 ? 'Next day' : 'Day 2'}</span><span class="xs">${gs.length ? gs.map(g => { const w = which(lv, g); return `${dot(lv.groups[g])}${esc(g)} ${LV[lv.groups[g]].toLowerCase()}${w ? ` (${esc(w)})` : ''}`; }).join(', ') : 'not sore'} <span class="muted">· ${by}</span></span></div>`;
    });
    return `<div class="card"><div class="k2">Soreness after it</div><div class="mt8">${lines.join('')}</div></div>`;
  }
  if (VIEWS.sessionDetail) {
    const h0 = VIEWS.sessionDetail.html;
    VIEWS.sessionDetail.html = function (p) {
      const h = h0.call(this, p), s = (D.sessions || []).find(x => x.id === (p && p.id)); if (!s) return h;
      const more = afterHtml(s); return more ? h + more : h;
    };
  }

  // ---------------- during a workout: a line under each exercise for the muscles it works ----------------
  function exLine(ex) {
    if (!ex) return ''; const lv = levelsOn(Date.now()), p = I.exAreas(ex), lvOfG = {};
    for (const [id, l] of Object.entries(p.lv)) { if (l < 2) continue; const g = F.group(id); lvOfG[g] = Math.max(lvOfG[g] || 0, l); }      // 1.35.2: only the muscles it is for or works well, not a helper's
    const gs = Object.keys(lvOfG).filter(g => lv.groups[g] > 0).sort((a, b) => lvOfG[b] - lvOfG[a] || lv.groups[b] - lv.groups[a]);
    if (!gs.length) return '';
    return `<div class="sore-ex xs" aria-label="Soreness today: ${esc(gs.map(g => `${g} ${LV[lv.groups[g]].toLowerCase()}`).join(', '))}">${gs.slice(0, 3).map(g => `${dot(lv.groups[g])}${esc(g)}: ${LV[lv.groups[g]].toLowerCase()}`).join(' · ')}</div>`;
  }

  // ---------------- Trainer mode: each part's soreness ----------------
  function partsList(lv, n) {
    const ids = F.PARTS.filter(id => lv.parts[id] > 0).sort((a, b) => lv.parts[b] - lv.parts[a] || (lv.sc[b] || 0) - (lv.sc[a] || 0));
    return { ids, html: ids.slice(0, n || 8).map(id => `<span class="sore-p">${dot(lv.parts[id])}${esc(F.name(id))} <span class="muted">${LV[lv.parts[id]].toLowerCase()}</span></span>`).join('') + (ids.length > (n || 8) ? `<span class="sore-p muted">and ${ids.length - (n || 8)} more</span>` : '') };
  }
  function trainerHtml(inBuilder) {
    const lv = levelsOn(Date.now()), l = partsList(lv, inBuilder ? 12 : 6); if (!l.ids.length) return '';
    const mine = Object.keys(lv.you).length;
    return `<div class="sore-tr${inBuilder ? ' card' : ' mt12'}" id="${inBuilder ? 'bwSore' : 'trSore'}"><div class="row" style="align-items:flex-start;gap:10px"><div class="grow" style="min-width:0">
      <div class="xs dim">Sore today, part by part · ${mine ? 'from what you said' : 'worked out by GymDay'}</div><div class="sore-pl mt4">${l.html}</div>
      <div class="xs dim mt4">${inBuilder ? 'The workout goes easy on these: an exercise that works a very sore part most is picked only when nothing else fits, and one for a sore part gets 2 sets, not 3.' : 'Build me a workout goes easy on these.'} <button class="linkish xs" data-act="soreEdit">Change ›</button></div></div>
      ${inBuilder ? '' : `<div class="sore-mini" aria-hidden="true">${figs(id => lv.parts[id], { tip: () => '' }, 'mini sore')}</div>`}</div></div>`;
  }

  // the card goes on Today with the other recovery cards (and in Arrange this page as "How sore are you?")
  const home0 = I.homeCards; I.homeCards = () => homeCard() + home0();
  // Settings → More features: change each part (off at first: the whole muscle)
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => `<div class="row" style="padding:6px 0"><div class="grow">Soreness for each part<div class="xs dim">Change how sore each head or part of a muscle is (the long head, the upper chest…). Off: you change the whole muscle and GymDay works out its parts.</div></div><input type="checkbox" data-bind="optSorePart" ${perPart() ? 'checked' : ''} style="width:22px;height:22px"></div>`);
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optSorePart') { st().sorePart = t.checked; S.save(true); toast(t.checked ? 'Soreness: you can set each part now' : 'Soreness: by the whole muscle'); } });
  // Recovery counts what you said (worked-out soreness is not counted again: it comes from the same sets)
  const youParts = t => { const lv = levelsOn(t), out = {}; for (const g of Object.keys(lv.you)) for (const id of partsOfG(g)) out[id] = lv.parts[id]; return out; };
  window.Sore = { pending, hitOf, homeCard, recoveryCard, afterHtml, exLine, trainerHtml, levelsOn, levelsWith, estimate, youParts, LV, curve };
})();
