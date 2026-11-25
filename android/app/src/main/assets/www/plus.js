/* GymDay 1.25 · four things in the gym (plus.js).
   (1) Auto-progression, only while Track reps is on: a weight × reps exercise can have a rep range, say 8–12. When every
       working set at the top weight reached the top of the range last time, the next workout starts one step heavier at the
       bottom of the range (a line says so, with Undo). Until then the line says what to aim for.
   (2) Busy week: until the week ends, a workout starts as a short version (20, 25 or 30 minutes): the first exercise of each
       body part the day trains, then whatever else fits, 2 working sets each, at the usual weights. The numbers are kept as
       usual; the full number of sets comes back by itself afterwards (item.full).
   (3) Balance my week: body parts under 10 sets so far this week (the Muscles page's own count), and one tap that queues a
       few sets for them. The queue is used up by the next workouts of this week, 4 sets a workout at most, and ends with the week.
   (4) Form cue, only while Trainer mode is on: one short reminder per exercise shown big while lifting. GymDay has one for
       every kind of movement; a cue the person types for an exercise wins. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { esc, ACT, $ } = A, D = S.data, num = A.num;
  const st = () => D.settings, toast = m => window.toast(m);
  const I = () => window.Insights, T = () => window.Trainer;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  const work = x => x.kind !== 'w';

  // =========================================================================================== (1) auto-progression
  const RANGES = [[4, 6], [6, 8], [8, 12], [10, 15], [12, 20]];
  const rangeOf = id => { const x = (D.ex[id] || {}).rr; return A.repsOn() && Array.isArray(x) && +x[0] >= 1 && +x[1] > +x[0] ? [+x[0], +x[1]] : null; };
  const canRange = ex => !!ex && ex.track === 'weight' && A.repsOn();
  // called for every exercise block a workout starts with (app.js buildItem)
  // ============================================================== v1.27 the plateau plan
  // For an exercise that is stuck (Stuck alerts: no better set in 4 weeks), three weeks that change one thing each, the way the
  // stuck alert's own tips say: week 1 a lighter week at about 90% of the stuck weight with the same reps; week 2 one more set
  // at the stuck weight; week 3 one step heavier than the stuck weight, same reps. The weeks are calendar weeks from the one it
  // starts in. While it runs it, not auto-progression, sets the weights; afterwards the exercise goes on as before.
  const PLAT = ['A lighter week: about 90% of the weight, the same reps', 'One more set at the weight you were stuck at', 'One step heavier than where you were stuck, the same reps'];
  const platOf = id => { const x = (D.ex[id] || {}).plat; return x && x.at > 0 ? x : null; };
  const platWeek = (pl, now) => Math.floor((A.weekStartOf(now || Date.now()) - pl.at) / (7 * 86400000) + 0.01);
  function platBase(ex) {
    const last = S.lastFor(ex.id), sets = last ? last.sets.filter(x => x.done !== false && work(x)) : [];
    const top = sets.length ? Math.max(...sets.map(x => num(x.w))) : 0, at = sets.filter(x => num(x.w) === top);
    const r = at.length ? Math.max(...at.map(x => num(x.r))) : 0;
    return { w: top, r: Math.round(r), n: sets.length };
  }
  function platApply(item, ex) {
    const pl = platOf(ex.id); if (!pl) return false;
    const wi = platWeek(pl); if (wi < 0) return false;
    if (wi > 2) { delete S.exData(ex.id).plat; S.exData(ex.id).platDone = Date.now(); return false; }
    const step = A.wStepSize(ex), B = num(pl.w), R = num(pl.r), ws = item.sets.filter(work);
    if (!ws.length) return false;
    const round = v => Math.round(Math.round(v / step) * step * 100) / 100;
    if (wi === 0) ws.forEach(x => { if (B > 0) { x.w = A.fmtW(Math.max(step, round(B * 0.9))); if (R > 0) x.r = String(R); } else if (R > 0) x.r = String(Math.max(1, Math.round(R * 0.8))); });
    else if (wi === 1) { ws.forEach(x => { if (B > 0) x.w = A.fmtW(B); if (R > 0) x.r = String(R); }); const src = ws[ws.length - 1]; if (item.sets.length < 20) item.sets.splice(item.sets.indexOf(src) + 1, 0, { w: src.w, r: src.r, done: false }); }
    else ws.forEach(x => { if (B > 0) { x.w = A.fmtW(round(B + step)); if (R > 0) x.r = String(R); } else if (R > 0) x.r = String(R + 1); });
    item.plat = { wk: wi + 1 };
    return true;
  }
  function platCard(ex) {
    if (!ex || ex.track === 'time') return '';
    const pl = platOf(ex.id), E = window.Extras;
    if (pl) {
      const wi = Math.max(0, Math.min(2, platWeek(pl)));
      return `<div class="card" id="platCard"><div class="row"><div class="grow"><h3>🧭 Plateau plan · week ${wi + 1} of 3</h3><div class="xs muted mt4">Started when ${A.fmtW(pl.w)} ${A.unit()}${pl.r ? ` × ${pl.r}` : ''} hadn't gone up in 4 weeks.</div></div><button class="btn sm" data-act="platStop" data-id="${esc(ex.id)}">Stop</button></div>
        <ol class="plat-ol">${PLAT.map((t, i) => `<li class="${i === wi ? 'on' : i < wi ? 'past' : ''}">${t}</li>`).join('')}</ol></div>`;
    }
    const stuck = E && E.stuckList ? E.stuckList(true).some(p => p.ex.id === ex.id) : false;
    if (!stuck) return '';
    return `<div class="card" id="platCard"><h3>🧭 Stuck for 4 weeks</h3><p class="xs muted mt4">Three weeks that change one thing each: ${PLAT.map(t => t.charAt(0).toLowerCase() + t.slice(1)).join('; then ')}.</p><button class="btn primary block mt12" data-act="platStart" data-id="${esc(ex.id)}">Start a 3-week plan</button></div>`;
  }
  ACT.platStart = el => {
    const ex = S.getEx(el.dataset.id); if (!ex) return;
    const b = platBase(ex); if (!(b.w > 0 || b.r > 0)) { toast('Log this exercise once first'); return; }
    const xd = S.exData(ex.id); xd.plat = { at: A.weekStartOf(Date.now()), w: b.w, r: b.r }; delete xd.platDone;
    (S.meta.stuckHide || (S.meta.stuckHide = {}))[ex.id] = Date.now() + 14 * 86400000; S.saveMeta();       // the stuck alert waits until the plan is over
    S.save(true); A.rerender(); toast(`Plateau plan started: this week is a lighter week for ${ex.name}`);
  };
  ACT.platStop = el => { const xd = S.exData(el.dataset.id); if (!xd.plat) return; delete xd.plat; S.save(true); A.rerender(); toast('Plateau plan stopped'); };
  // ============================================================== v1.27 My sets per muscle: the editor
  function sgSheet() {
    A.openSheet(`<h2>Your weekly sets</h2><p class="small muted">How many sets a week you want for each body part. Balance my week and the Muscles page use these. Many lifters aim for 10 to 20.</p>
      <div class="card mt12 sg-card">${SG_BODY.map((g, i) => `<div class="row sg-row"><span class="grow small" style="font-weight:600">${g}</span><button class="stp-b" data-act="sgStep" data-i="${i}" data-d="-1" aria-label="Fewer sets for ${g}">−</button><b class="sg-v" id="sgV${i}">${tgt(g)}</b><button class="stp-b" data-act="sgStep" data-i="${i}" data-d="1" aria-label="More sets for ${g}">+</button></div>`).join('')}</div>
      <div class="row mt12"><button class="btn grow" data-act="sgReset">All back to ${LOW}</button><button class="btn primary grow" data-act="closeSheet">Done</button></div>`, null, () => { if (A.top().name === 'muscles' || A.top().name === 'days') A.rerender(); });
  }
  ACT.setsGoalOpen = () => sgSheet();
  ACT.sgStep = el => {
    const g = SG_BODY[+el.dataset.i]; if (!g) return;
    const v = Math.max(2, Math.min(30, tgt(g) + (+el.dataset.d || 0))), sg = st().setsGoal || (st().setsGoal = {});
    if (v === LOW) delete sg[g]; else sg[g] = v;
    S.save(true); const b = $('#sgV' + el.dataset.i); if (b) b.textContent = v;
  };
  ACT.sgReset = () => { delete st().setsGoal; S.save(true); SG_BODY.forEach((g, i) => { const b = $('#sgV' + i); if (b) b.textContent = LOW; }); toast(`Every body part back to ${LOW} sets a week`); };
  function built(item, ex, last, planNewer) {
    if (!ex || !item) return;
    // a busy week's short version left the usual number of sets behind: bring them back
    if (last && !planNewer && last.item && last.item.full > item.sets.length) {
      const src = item.sets[item.sets.length - 1];
      while (item.sets.length < Math.min(20, last.item.full)) item.sets.push({ w: src.w, r: src.r, done: false });
    }
    if (!planNewer && platApply(item, ex)) return;                // v1.27: a plateau plan decides this week, not auto-progression
    const rr = canRange(ex) ? rangeOf(ex.id) : null; if (!rr) return;
    delete item.tgt;                                              // the range says what to aim for
    item.rr = rr;
    if (!last || planNewer || (window.Progress && window.Progress.easyNow())) return;
    const done = last.sets.filter(x => num(x.w) > 0 && num(x.r) > 0); if (!done.length) return;
    const top = Math.max(...done.map(x => num(x.w))), at = done.filter(x => num(x.w) === top);
    if (!at.every(x => num(x.r) >= rr[1])) return;
    const to = Math.round((top + A.wStepSize(ex)) * 100) / 100;
    let n = 0;
    // each raised set remembers what it was (up0), so Undo still finds it after warm-up sets are put in front
    item.sets.forEach(x => { if (work(x) && num(x.w) === top) { x.up0 = [x.w, x.r]; x.w = A.fmtW(to); x.r = String(rr[0]); n++; } });
    if (n) item.up = { from: top, to, n: at.length, hi: rr[1] };
  }
  // a finished workout keeps none of this (item.full stays: it is how the usual number of sets comes back after a busy week)
  function finished(a) {
    if (!a) return;
    for (const it of a.items) { delete it.up; delete it.rr; delete it.balNew; (it.sets || []).forEach(x => { delete x.up0; }); }
  }
  ACT.upUndo = el => {
    const a = D.active, it = a && a.items[+el.dataset.i]; if (!it || !it.up) return;
    it.sets.forEach(x => { if (x.up0) { if (!x.done) { x.w = x.up0[0]; x.r = x.up0[1]; } delete x.up0; } });
    delete it.up; S.save(true); A.rerender(); toast('Back to last time’s weight');
  };
  function rangeCard(ex) {
    if (!canRange(ex)) return '';
    const rr = rangeOf(ex.id), step = `${A.fmtW(A.wStepSize(ex))} ${A.unit()}`;
    return `<div class="card" id="rrCard"><div class="row"><div class="grow"><h3>Auto-progression</h3><div class="xs muted mt4">${rr
      ? `Rep range <b>${rr[0]}–${rr[1]}</b>. When every working set reaches ${rr[1]}, the next workout starts ${step} heavier at ${rr[0]} reps.`
      : 'Give this exercise a rep range, say 8–12. When every working set reaches the top, the weight goes up by itself next time.'}</div></div>
      <button class="btn sm" data-act="rrSet" data-id="${esc(ex.id)}">${rr ? 'Change' : 'Set a range'}</button></div></div>`;
  }
  let rrCtx = null;
  function rrSheet() {
    const ex = S.getEx(rrCtx.id); if (!ex) return;
    const cur = rangeOf(ex.id), lo = rrCtx.lo, hi = rrCtx.hi;
    const others = [...new Set(D.days.flatMap(d => d.items.map(it => it.ex)))].filter(id => id !== ex.id && canRange(S.getEx(id)) && !rangeOf(id)).length;
    A.openSheet(`<h2>Rep range for ${esc(ex.name)}</h2>
      <p class="small muted">Stay at one weight until every working set reaches the top of the range. Then the next workout starts ${A.fmtW(A.wStepSize(ex))} ${A.unit()} heavier, back at the bottom of the range.</p>
      <div class="kc-opts mt12" role="group" aria-label="Rep range">${RANGES.map(([a, b]) => `<button class="chip ${lo === a && hi === b ? 'on' : ''}" data-act="rrPick" data-a="${a}" data-b="${b}" aria-pressed="${lo === a && hi === b}">${a}–${b}<span class="sub">${b <= 6 ? 'strength' : b <= 8 ? 'strength and size' : b <= 12 ? 'size' : b <= 15 ? 'size, lighter' : 'endurance'}</span></button>`).join('')}</div>
      <div class="row mt12" style="gap:10px"><div class="field grow"><label class="lbl" for="rrLo">From</label><input class="input" id="rrLo" type="number" inputmode="numeric" min="1" max="50" value="${lo || ''}"></div><div class="field grow"><label class="lbl" for="rrHi">To</label><input class="input" id="rrHi" type="number" inputmode="numeric" min="2" max="60" value="${hi || ''}"></div></div>
      ${others ? `<label class="row mt12" style="gap:10px"><input type="checkbox" id="rrAll" style="width:22px;height:22px"><span class="small grow">Use it for the ${plural(others, 'other weight exercise')} in my days that have no range yet</span></label>` : ''}
      <div class="row mt16">${cur ? `<button class="btn danger" data-act="rrOff">Turn off</button>` : `<button class="btn" data-act="closeSheet">Cancel</button>`}<button class="btn primary grow" data-act="rrSave">Save</button></div>`);
  }
  ACT.rrSet = el => { const cur = rangeOf(el.dataset.id) || [8, 12]; rrCtx = { id: el.dataset.id, lo: cur[0], hi: cur[1] }; rrSheet(); };
  ACT.rrPick = el => { if (!rrCtx) return; rrCtx.lo = +el.dataset.a; rrCtx.hi = +el.dataset.b; const all = $('#rrAll'), on = !!(all && all.checked); rrSheet(); const a2 = $('#rrAll'); if (a2) a2.checked = on; };
  ACT.rrSave = () => {
    if (!rrCtx) return;
    const lo = Math.round(num(($('#rrLo') || {}).value)), hi = Math.round(num(($('#rrHi') || {}).value));
    if (!(lo >= 1 && hi > lo && hi <= 60)) { toast('The top of the range has to be higher than the bottom'); return; }
    const all = $('#rrAll'), ids = [rrCtx.id];
    if (all && all.checked) for (const id of new Set(D.days.flatMap(d => d.items.map(it => it.ex)))) if (id !== rrCtx.id && canRange(S.getEx(id)) && !rangeOf(id)) ids.push(id);
    ids.forEach(id => { S.exData(id).rr = [lo, hi]; });
    rrCtx = null; S.save(true); A.closeSheet(); A.rerender();
    toast(ids.length > 1 ? `${lo}–${hi} reps set for ${ids.length} exercises` : `Rep range ${lo}–${hi} set`);
  };
  ACT.rrOff = () => { if (!rrCtx) return; delete S.exData(rrCtx.id).rr; rrCtx = null; S.save(true); A.closeSheet(); A.rerender(); toast('Auto-progression is off for this exercise'); };

  // =========================================================================================== (4) form cue
  // One cue for each kind of movement: the first rule that fits the exercise's name, else its body part's.
  const CUES = [
    [/farmer|suitcase carry/i, 'Stand tall, shoulders down'], [/turkish/i, 'Eyes on the bell'], [/windmill|bent press/i, 'Eyes on the bell, hips back'],
    [/shrug/i, 'Straight up, pause at the top'], [/face pull/i, 'Pull to the eyes, elbows high'], [/rear-delt|reverse pec deck/i, 'Lead with the elbows'],
    [/lateral raise/i, 'Lead with the elbows'], [/front raise/i, 'No swing, stop at eye level'], [/arnold/i, 'Turn as you press'],
    [/overhead press|shoulder press/i, 'Ribs down, press straight up'],
    [/wrist curl/i, 'Only the wrists move'], [/reverse curl/i, 'Elbows pinned, wrists straight'], [/nordic/i, 'Hips straight, lower slowly'],
    [/hamstring curl|leg curl/i, 'Hips down, slow on the way back'], [/preacher|spider curl|concentration/i, 'Full stretch, no swing'],
    [/hammer curl/i, 'Thumbs up, elbows still'], [/curl$|curl \(|cable curl|bar curl|dumbbell curl/i, 'Elbows still, no swing'],
    [/pushdown/i, 'Elbows pinned to your sides'], [/skull crusher|triceps extension/i, 'Elbows in, upper arms still'], [/close-grip bench/i, 'Elbows tucked'],
    [/dips? \(upright/i, 'Stay upright, elbows back'], [/dips? \(leaning/i, 'Lean forward, deep stretch'],
    [/pullover/i, 'Long arms, feel the stretch'], [/fly/i, 'Soft elbows, big arc'], [/push-up to side plank/i, 'Hips level, turn as one piece'],
    [/bench press|dumbbell press|chest press/i, 'Shoulder blades back and down'],
    [/straight-arm/i, 'Arms long, pull to the hips'], [/pulldown/i, 'Chest up, elbows to your pockets'], [/chin-up crunch/i, 'Knees up as you pull'],
    [/pull-up|chin-up/i, 'Chest to the bar, no swing'], [/inverted row/i, 'Body straight, chest to the bar'], [/pendlay/i, 'Flat back, bar from the floor'],
    [/\brow\b/i, 'Pull with the elbows, squeeze'], [/back extension|hyperextension/i, 'Hinge at the hips, no arching'], [/rack pull/i, 'Lats tight, hips through'],
    [/good morning/i, 'Hips back, soft knees'], [/rdl|romanian|stiff-leg/i, 'Hips back, bar close'], [/deadlift/i, 'Bar close, push the floor away'],
    [/hip thrust/i, 'Chin tucked, squeeze at the top'], [/kickback/i, 'Squeeze the glute, no arching'], [/abduction/i, 'Knees out, pause'], [/adduction/i, 'Squeeze in, slow out'],
    [/leg extension/i, 'Pause at the top'], [/leg press calf|calf raise/i, 'Full stretch, pause at the top'], [/leg press/i, 'Knees out, don’t lock them'],
    [/split squat|lunge|step-up/i, 'Front heel down, stay tall'], [/front squat/i, 'Elbows high, chest up'], [/squat/i, 'Chest up, knees out'],
    [/side plank|copenhagen/i, 'Hips high, straight line'], [/plank|bear|stir the pot|shoulder taps|up-down/i, 'Squeeze glutes, ribs down'],
    [/rollout|fallout/i, 'Ribs down, don’t let the hips sag'], [/hollow|dead bug|flutter|l-sit|vacuum/i, 'Lower back pressed down'], [/bird dog/i, 'Hips level, move slowly'],
    [/dragon flag/i, 'Body straight, lower slowly'], [/windshield/i, 'Shoulders down, slow turns'], [/toes-to-bar|hanging|captain|pike/i, 'No swing, curl the hips up'],
    [/pallof/i, 'Don’t let it turn you'], [/woodchop|cable lift|judo|landmine rotation|spell caster/i, 'Turn from the hips and ribs'],
    [/twist|figure 8|pass between/i, 'Turn the ribs, not just the arms'], [/side bend/i, 'Straight to the side, no leaning forward'],
    [/slam|sledgehammer|throw/i, 'Brace, then go hard'], [/mountain climber|spider crawl/i, 'Hips low, quick knees'],
    [/reverse crunch|hip raise|bottoms up|knee tuck|leg raise|toe touches|cocoon|v-up|jackknife|butt-up/i, 'Curl the hips, no swinging'],
    [/sit-up|otis/i, 'Roll up, chin off the chest'], [/crunch|heel taps/i, 'Ribs to hips, slow down'],
    [/rowing machine/i, 'Legs, then body, then arms'], [/treadmill|stair|elliptical/i, 'Stand tall, light on the rails'], [/bike/i, 'Soft knee at the bottom'], [/jump rope/i, 'Small hops, wrists turn the rope'],
  ];
  const GROUP_CUE = { Shoulders: 'Ribs down, no swing', Biceps: 'Elbows still, no swing', Forearms: 'Slow and controlled', Triceps: 'Elbows pinned', Chest: 'Shoulder blades back and down',
    Back: 'Pull with the elbows, squeeze', Quads: 'Chest up, knees out', Hamstrings: 'Hips back, slow down', Glutes: 'Squeeze at the top', Calves: 'Full stretch, pause at the top', Core: 'Ribs down, slow and controlled', Cardio: 'Stand tall, steady breathing' };
  const ownCue = ex => String((D.ex[ex.id] || {}).cue || '').trim();
  const appCue = ex => { for (const [re, c] of CUES) if (re.test(ex.name || '')) return c; return GROUP_CUE[ex.group] || 'Slow and controlled'; };
  const cueOf = ex => ownCue(ex) || appCue(ex);
  const cueOn = () => !!(T() && T().on());
  ACT.cueEdit = el => {
    const ex = S.getEx(el.dataset.id); if (!ex) return;
    A.openSheet(`<h2>Cue for ${esc(ex.name)}</h2>
      <p class="small muted">One short reminder, shown big while you lift. Write the thing you most often forget.</p>
      <div class="field mt8"><label class="lbl" for="cueIn">Your cue</label><input class="input" id="cueIn" maxlength="40" value="${esc(ownCue(ex))}" placeholder="${esc(appCue(ex))}" autocomplete="off" enterkeyhint="done"></div>
      <div class="xs dim mt4">Left empty, GymDay’s cue is used: “${esc(appCue(ex))}”.</div>
      ${ex.tip ? `<div class="card mt12"><div class="k2">The form tip</div><p class="small mt4">${esc(ex.tip)}</p></div>` : ''}
      <div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="cueSave" data-id="${esc(ex.id)}">Save</button></div>`);
  };
  ACT.cueSave = el => {
    const v = String(($('#cueIn') || {}).value || '').replace(/\s+/g, ' ').trim().slice(0, 40), xd = S.exData(el.dataset.id);
    if (v) xd.cue = v; else delete xd.cue;
    S.save(true); A.closeSheet(); A.rerender();
  };

  // =========================================================================================== (2) busy week
  const BUSY_SETS = 2, BUSY_LEN = [20, 25, 30];
  const busyNow = () => !!st().busyUntil && Date.now() < st().busyUntil;
  const busyMin = () => (BUSY_LEN.includes(+st().busyMin) ? +st().busyMin : 25);
  // minutes one set takes with its rest: from this exercise's own timed workouts, else two and a half
  function setMin(exId) {
    const rs = S.sessionsFor(exId).slice(0, 4).filter(r => r.item && r.item.ms > 0 && r.all.length);
    if (!rs.length) return 2.5;
    return Math.max(1.2, Math.min(4.5, rs.reduce((a, r) => a + r.item.ms / r.all.length, 0) / rs.length / 60000));
  }
  const groupOf = ex => { const P = I() && I().partsOf ? I().partsOf(ex).main : []; return ex.group && ex.group !== 'Other' ? ex.group : (P[0] || ex.group || ''); };
  function busyPick(d, minutes) {
    const budget = minutes || busyMin(), rows = d.items.map(it => S.getEx(it.ex)).filter(Boolean), cost = ex => BUSY_SETS * setMin(ex.id) + 1;      // a minute to change over
    const picked = new Set(), seen = new Set(); let used = 0;
    // the first exercise of each body part, in the day's own order, so nothing the day trains is left out whole
    for (const ex of rows) { const g = groupOf(ex); if (seen.has(g)) continue; if (picked.size >= 3 && used + cost(ex) > budget) continue; seen.add(g); picked.add(ex.id); used += cost(ex); }
    // then whatever else still fits
    for (const ex of rows) { if (picked.has(ex.id)) continue; if (used + cost(ex) <= budget) { picked.add(ex.id); used += cost(ex); } }
    return { ids: rows.filter(ex => picked.has(ex.id)).map(ex => ex.id), mins: Math.round(used), left: rows.filter(ex => !picked.has(ex.id)).map(ex => ex.name), budget };
  }
  const choosing = (d, choose) => { if (busyNow() && choose) busyPick(d).ids.forEach(id => choose.ids.add(id)); };
  const chooseChip = () => `<button class="chip ${busyNow() ? 'on' : ''}" data-act="busyToggle" aria-pressed="${busyNow()}">⚡ Busy week</button>`;
  function chooseNote(d, choose) {
    if (!busyNow() || !d) return '';
    const p = busyPick(d), n = choose ? d.items.filter(it => choose.ids.has(it.ex)).length + choose.extra.filter(x => choose.ids.has(x)).length : p.ids.length;
    return `<div class="card" id="busyNote" style="border-color:var(--accent)"><div class="small"><b>⚡ Busy week:</b> ${plural(p.ids.length, 'exercise')}, ${BUSY_SETS} working sets each, about ${p.mins} minutes. Your usual weights, so your strength stays.</div>
      ${p.left.length ? `<div class="xs muted mt4">Left out today: ${esc(p.left.join(', '))}. Tick more if you have the time${n !== p.ids.length ? ' (you changed the ticks)' : ''}.</div>` : ''}
      <div class="kc-opts mt8" role="group" aria-label="How long">${BUSY_LEN.map(m => `<button class="chip ${busyMin() === m ? 'on' : ''}" data-act="busyLen" data-v="${m}" aria-pressed="${busyMin() === m}">${m} min</button>`).join('')}</div></div>`;
  }
  const repick = () => { const c = A.chooseState ? A.chooseState() : null, d = c && S.getDay(c.dayId); if (c && d) { c.ids.clear(); if (busyNow()) busyPick(d).ids.forEach(id => c.ids.add(id)); } };
  const busySet = on => { if (on) st().busyUntil = A.weekStartOf(Date.now(), -1); else delete st().busyUntil; S.save(true); };
  ACT.busyToggle = () => { const on = !busyNow(); busySet(on); repick(); A.rerender(); toast(on ? `Busy week on: workouts start as a ${busyMin()}-minute version until Sunday` : 'Busy week ended'); };
  ACT.busyOff = () => { busySet(false); A.rerender(); toast('Busy week ended'); };
  ACT.busyLen = el => { const v = +el.dataset.v; if (!BUSY_LEN.includes(v)) return; st().busyMin = v; S.save(true); repick(); A.rerender(); };
  function busyCard() {
    if (!busyNow()) return '';
    return `<div class="card" id="busyCard" style="border-color:var(--accent)"><div class="row"><div class="grow"><div class="title">⚡ Busy week</div><div class="xs muted">Until ${A.fmtDate(st().busyUntil - 1)}: workouts start as a ${busyMin()}-minute version: the main exercise for each body part, ${BUSY_SETS} working sets, your usual weights.</div></div><button class="btn sm" data-act="busyOff">End it</button></div></div>`;
  }
  // a workout started in a busy week: two working sets of each exercise; the full number comes back afterwards (item.full)
  function makeBusy(a) {
    if (!a || a.easy || !busyNow()) return false;
    a.busy = true;
    for (const it of a.items) {
      const before = it.sets.length; let n = 0;
      it.sets = it.sets.filter(x => !work(x) || ++n <= BUSY_SETS);
      if (it.sets.length < before) it.full = before;
    }
    return true;
  }

  // =========================================================================================== (3) balance my week
  const LOW = 10, PER_WORKOUT = 4, PER_PART = 3;
  // v1.27 My sets per muscle: the person's own weekly target for each body part (settings.setsGoal), 10 unless they set one
  const SG_BODY = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];
  const tgt = g => { const v = +((st().setsGoal || {})[g]); return v >= 2 && v <= 30 ? v : LOW; };
  const customGoals = () => SG_BODY.some(g => tgt(g) !== LOW);
  const weekOf = now => A.weekStartOf(now || Date.now());
  const balQ = now => { const b = st().bal; return b && b.ws === weekOf(now) && Array.isArray(b.q) && b.q.length ? b : null; };
  // the exercise to add sets of for a body part: the one done most in the last 8 weeks, else the first in the days
  function exFor(g) {
    const since = Date.now() - 56 * 86400000, n = {};
    for (const s of D.sessions) { if (s.start < since) break; for (const it of s.items) { if (it.skipped) continue; const ex = S.getEx(it.ex); if (ex && ex.track !== 'time' && groupOf(ex) === g) n[ex.id] = (n[ex.id] || 0) + it.sets.filter(x => x.done && work(x)).length; } }
    const best = Object.keys(n).sort((a, b) => n[b] - n[a])[0]; if (best) return S.getEx(best);
    for (const d of D.days) for (const it of d.items) { const ex = S.getEx(it.ex); if (ex && ex.track !== 'time' && groupOf(ex) === g) return ex; }
    return null;
  }
  function balance(now) {
    now = now || Date.now();
    const In = I(); if (!In || !In.muscleStats) return { low: [], adds: [], left: 0 };
    const ws = weekOf(now), sets = In.muscleStats(ws, A.weekStartOf(now, -1)).sets;
    // what the rest of this week's plan still brings (with a weekly schedule): the days from today that have not been trained
    const plan = {}, sched = !!st().schedule, wk = st().week || {};
    let left = 0;
    if (sched) {
      const d0 = new Date(now); d0.setHours(0, 0, 0, 0);
      for (let t = d0.getTime(); t < ws + 7 * 86400000; t += 86400000) {
        const day = wk[new Date(t + 43200000).getDay()] && S.getDay(wk[new Date(t + 43200000).getDay()]); if (!day) continue;
        if (D.sessions.some(s => s.start >= t && s.start < t + 86400000)) continue;
        left++;
        for (const it of day.items) { const ex = S.getEx(it.ex); if (!ex) continue; const last = S.lastFor(ex.id), n = last ? last.sets.length : Math.max(1, Math.round(num(it.sets)) || 3), g = groupOf(ex); plan[g] = (plan[g] || 0) + n; }
      }
    } else {
      // no weekly plan: the workouts left in the weekly goal, taken as the next days in the order of the list (as Today does)
      const goal = st().weekGoal == null ? 3 : +st().weekGoal || 0; left = Math.max(1, goal - A.doneIn(ws, Infinity));
      const lastS = D.sessions[0], at = lastS ? D.days.findIndex(d => d.id === lastS.dayId) : -1;
      for (let k = 1; k <= Math.min(left, D.days.length); k++) {
        const day = D.days[(at + k) % D.days.length]; if (!day) continue;
        for (const it of day.items) { const ex = S.getEx(it.ex); if (!ex) continue; const last = S.lastFor(ex.id), n = last ? last.sets.length : Math.max(1, Math.round(num(it.sets)) || 3), g = groupOf(ex); plan[g] = (plan[g] || 0) + n; }
      }
    }
    const low = Object.keys(sets).map(g => ({ g, have: sets[g], coming: plan[g] || 0, ex: exFor(g) })).filter(x => x.ex && x.have + x.coming < tgt(x.g) - 0.5)
      .map(x => Object.assign(x, { need: Math.ceil(tgt(x.g) - x.have - x.coming) })).sort((a, b) => b.need - a.need);
    // two sets for each body part first (the one furthest behind first), then one more each while there is room
    let room = Math.max(1, left) * PER_WORKOUT; const give = low.map(() => 0);
    for (const step of [2, 1, 1, 1]) for (let i = 0; i < low.length && room > 0; i++) { const k = Math.min(step, Math.min(low[i].need, PER_PART * Math.max(1, left)) - give[i], room); if (k > 0) { give[i] += k; room -= k; } }
    const adds = low.map((x, i) => ({ g: x.g, ex: x.ex.id, name: x.ex.name, n: give[i] })).filter(x => x.n > 0);
    return { low, adds, left, sched };
  }
  const fmtSets = v => (Math.round(v * 10) / 10).toString();
  function balanceCard() {
    const q = balQ();
    if (q) return `<div class="card" id="balCard" style="border-color:var(--accent)"><div class="row"><div class="grow"><div class="title">⚖ Balance my week is on</div>
      <div class="xs muted mt4">Waiting for your next workout${q.q.length > 1 || q.q[0].n > PER_WORKOUT ? 's' : ''} this week: ${q.q.map(x => `<b>+${x.n}</b> ${esc(x.g)} (${esc((S.getEx(x.ex) || {}).name || '')})`).join(', ')}. At most ${PER_WORKOUT} extra sets a workout.</div></div><button class="btn sm" data-act="balOff">Cancel</button></div></div>`;
    const b = balance(); if (!b.adds.length) return '';
    return `<div class="card" id="balCard"><div class="title">⚖ Balance my week</div>
      <p class="small muted mt4">${customGoals() ? 'Under your weekly target' : `Under ${LOW} sets`} this week, even with ${b.sched ? 'what is still planned' : `your next ${b.left > 1 ? b.left + ' workouts' : 'workout'}`}: ${b.low.slice(0, 6).map(x => `<b>${esc(x.g)}</b> ${fmtSets(x.have)}${x.coming ? ' + ' + fmtSets(x.coming) + ' to come' : ''}`).join(', ')}.</p>
      <p class="small mt8">One tap adds ${b.adds.map(x => `<b>+${x.n}</b> ${plural(x.n, 'set').replace(/^\d+ /, '')} of ${esc(x.name)}`).join(', ')} to your next ${b.left > 1 ? 'workouts' : 'workout'} this week, on top of what you tick.</p>
      <button class="btn primary block mt12" data-act="balOn">Add them</button></div>`;
  }
  ACT.balOn = () => { const b = balance(); if (!b.adds.length) return; st().bal = { ws: weekOf(), q: b.adds.map(x => ({ g: x.g, ex: x.ex, n: x.n })) }; S.save(true); A.rerender(); toast('Added: they show up when you start your next workout'); };
  ACT.balOff = () => { delete st().bal; S.save(true); A.rerender(); toast('Balance sets cancelled'); };
  // a workout started this week takes up to four sets from the queue: more sets of an exercise it already has for that body
  // part, else the exercise is added for today
  function addBalance(a) {
    const b = balQ(); if (!b || !a || a.easy || a.busy) return 0;
    const In = I(), have = In && In.muscleStats ? In.muscleStats(b.ws, b.ws + 7 * 86400000).sets : {};
    // what this workout brings by itself: a body part it already takes to ten needs nothing more
    const bring = {}; a.items.forEach(i => { const ex = S.getEx(i.ex); if (ex && !i.skipped) { const g = groupOf(ex); bring[g] = (bring[g] || 0) + i.sets.filter(work).length; } });
    let total = 0;
    for (const x of b.q) {
      const need = Math.ceil(tgt(x.g) - (have[x.g] || 0) - (bring[x.g] || 0));
      if (need <= 0) { x.n = 0; continue; }
      if (total >= PER_WORKOUT) break;
      const k = Math.min(x.n, need, PER_PART, PER_WORKOUT - total); if (k <= 0) continue;
      let it = a.items.find(i => i.ex === x.ex) || a.items.find(i => { const ex = S.getEx(i.ex); return ex && ex.track !== 'time' && groupOf(ex) === x.g; });
      if (it) { const src = it.sets.filter(work).pop() || it.sets[it.sets.length - 1] || { w: '', r: '' }; for (let j = 0; j < k; j++) it.sets.push({ w: src.w, r: src.r, done: false }); }
      else if (S.getEx(x.ex)) {
        it = A.buildItem(x.ex, null); const ws = it.sets.filter(work), src = ws[ws.length - 1] || { w: '', r: '' };
        it.sets = ws.slice(0, k); while (it.sets.length < k) it.sets.push({ w: src.w, r: src.r, done: false });
        delete it.up; it.balNew = true; a.items.push(it);
      } else continue;
      it.bal = (it.bal || 0) + k; it.balG = x.g; x.n -= k; total += k;
    }
    b.q = b.q.filter(x => x.n > 0); if (!b.q.length) delete st().bal;
    return total;
  }
  function started(a) {
    makeBusy(a);
    const n = addBalance(a);
    if (n) setTimeout(() => toast(`⚖ ${plural(n, 'balance set')} added to this workout`), 600);
    else if (a && a.busy) setTimeout(() => toast(`⚡ Busy week: ${BUSY_SETS} working sets of each exercise`), 600);
  }

  // =========================================================================================== where these show
  // under an exercise in the running workout
  function itemLines(it, i, ex, fin) {
    if (!it || !ex || it.skipped) return '';
    let h = '';
    if (!fin && cueOn()) h += `<div class="pl-line pl-cue" data-act="cueEdit" data-id="${esc(ex.id)}" role="button" aria-label="Form cue: ${esc(cueOf(ex))}. Tap to change it"><span aria-hidden="true">💡</span><b class="grow">${esc(cueOf(ex))}</b></div>`;
    if (fin) return h;
    if (it.up) h += `<div class="pl-line pl-up"><span aria-hidden="true">⬆</span><div class="grow"><b>${A.fmtW(it.up.to)} ${A.unit()} today</b> <span class="muted">· ${it.up.hi} reps on ${it.up.n === 1 ? 'your top set' : 'every set'} at ${A.fmtW(it.up.from)} last time. Start again at ${it.rr ? it.rr[0] : ''} reps.</span></div><button class="btn sm" data-act="upUndo" data-i="${i}">Undo</button></div>`;
    else if (it.rr && A.repsOn()) h += `<div class="pl-line pl-rr"><span aria-hidden="true">🎯</span><div class="grow"><b>${it.rr[0]}–${it.rr[1]} reps</b> <span class="muted">· reach ${it.rr[1]} on every set and the weight goes up next time</span></div></div>`;
    if (it.plat) h += `<div class="pl-line pl-plat"><span aria-hidden="true">🧭</span><div class="grow"><b>Plateau plan · week ${it.plat.wk} of 3</b> <span class="muted">· ${PLAT[it.plat.wk - 1].charAt(0).toLowerCase() + PLAT[it.plat.wk - 1].slice(1)}</span></div></div>`;
    if (it.bal) h += `<div class="pl-line pl-bal"><span aria-hidden="true">⚖</span><div class="grow"><b>+${plural(it.bal, 'set')} for balance</b> <span class="muted">· ${esc(it.balG || 'this body part')} was under ${it.balG ? tgt(it.balG) : LOW} sets this week${it.balNew ? '; added for today' : ''}</span></div></div>`;
    return h;
  }
  if (window.Extras && window.Extras.exerciseExtra) { const ee0 = window.Extras.exerciseExtra; window.Extras.exerciseExtra = ex => ee0(ex) + platCard(ex) + rangeCard(ex); }
  if (I() && I().homeCards) { const In = I(), home0 = In.homeCards; In.homeCards = () => home0() + busyCard() + (balQ() ? balanceCard() : ''); }
  // a saved workout says when it was a busy week's short version, and which sets were there for balance
  if (I() && I().detailExtra) {
    const In = I(), de0 = In.detailExtra;
    In.detailExtra = s => {
      const bal = (s.items || []).filter(it => it.bal).map(it => `+${it.bal} ${esc((S.getEx(it.ex) || {}).name || '')}`);
      return (s.busy ? `<p class="xs dim" id="busyWas" style="padding:2px 4px 8px">⚡ A busy week’s short version: ${BUSY_SETS} working sets of each exercise, at your usual weights.</p>` : '')
        + (bal.length ? `<p class="xs dim" id="balWas" style="padding:2px 4px 8px">⚖ Extra sets for balance: ${bal.join(', ')}.</p>` : '') + de0(s);
    };
  }
  // the Muscles page, this week: the balance card above the body part list
  if (A.VIEWS.muscles) {
    const mh0 = A.VIEWS.muscles.html;
    A.VIEWS.muscles.html = function (p) { const h = mh0.call(this, p); if (!/<div class="sub">This week/.test(h)) return h; const c = balanceCard(); const at = h.indexOf('<div class="card">'); return c && at >= 0 ? h.slice(0, at) + c + h.slice(at) : h + c; };
  }
  const sw = (bind, on, title, sub) => `<div class="row" style="padding:6px 0"><div class="grow"><b>${title}</b><div class="xs dim">${sub}</div></div><input type="checkbox" data-bind="${bind}" ${on ? 'checked' : ''} style="width:22px;height:22px"></div>`;
  if (window.SettingsRows) window.SettingsRows.push(() => sw('optBusy', busyNow(), 'Busy week', `Until Sunday, workouts start as a ${busyMin()}-minute version: the main exercise for each body part, ${BUSY_SETS} working sets, your usual weights`)
    + (busyNow() ? `<div class="row" style="padding:0 0 8px"><span class="small grow">How long</span>${window.SetKit ? window.SetKit.seg('busyMin', busyMin(), BUSY_LEN.map(m => [m, m + ' min', m + ' minutes']), 'How long a busy-week workout is') : `<select class="input" data-bind="busyMin">${BUSY_LEN.map(m => `<option value="${m}" ${busyMin() === m ? 'selected' : ''}>${m} minutes</option>`).join('')}</select>`}</div>` : ''));
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset ? t.dataset.bind : '';
    if (b === 'optBusy') { busySet(t.checked); A.rerender(); toast(t.checked ? 'Busy week on: short workouts until Sunday' : 'Busy week ended'); }
    else if (b === 'busyMin') { const v = +t.value; if (BUSY_LEN.includes(v)) { st().busyMin = v; S.save(true); A.rerender(); } }
  });

  window.Plus = { setsGoal: tgt, customGoals, SG_BODY, platOf, platWeek, platCard, PLAT, built, started, finished, itemLines, choosing, chooseChip, chooseNote, rangeOf, rangeCard, cueOf, appCue, busyNow, busyPick, busyMin, makeBusy, balance, balanceCard, addBalance, CUES };
})();
