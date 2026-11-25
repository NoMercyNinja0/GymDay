/* GymDay v1.28: bodyweight progressions in Trainer mode (59), a club mate's workout as a day of your own (60), a program from a
   photo or pasted text (61), and the next milestone on your main lifts (65). */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !S) return;
  const { esc, ACT, $, VIEWS } = A, D = S.data, toast = m => window.toast(m), num = A.num;
  const DAY = 864e5, WEEK = 7 * DAY;
  const fold = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  // a sheet drawn again in place keeps its state: only a real close lets it go
  let painting = false;
  const paint = (html, close) => { painting = true; try { A.openSheet(html, null, () => { if (!painting && close) close(); }); } finally { painting = false; } };

  // ============================================================ 59: bodyweight progressions (Trainer mode only)
  // [reps in each of 3 working sets that mean the move has got easy, the next harder move, the reps to start that one at]
  const LADDER = {
    'knee-push-up': [15, 'push-up', 8], 'push-up': [15, 'decline-push-up', 8], 'decline-push-up': [15, 'archer-push-up', 5],
    'bench-dip': [15, 'dips-triceps', 6], 'inverted-row': [12, 'chin-up', 5], 'chin-up': [8, 'pull-up', 5],
  };
  const trainerOn = () => !!D.settings.trainer;
  // ready: the best 3 working sets of the last workout each at the target ("about": one rep short of it is fine, once)
  function readyOf(exId) {
    const L = LADDER[exId]; if (!L) return null;
    const last = S.lastFor(exId); if (!last) return null;
    const reps = (last.sets || []).filter(x => x.kind !== 'w' && !(num(x.w) > 0)).map(x => num(x.r)).filter(r => r > 0).sort((a, b) => b - a).slice(0, 3);
    if (reps.length < 3 || reps.some(r => r < L[0] - 1) || reps.reduce((a, b) => a + b, 0) < 3 * L[0] - 1) return null;
    const ex = S.getEx(exId), next = S.getEx(L[1]); if (!ex || !next) return null;
    return { ex, next, reps, sid: last.session.id, at: last.session.start, start: L[2] };
  }
  const skips = () => D.settings.ladderSkip || {};
  function readyList() {
    if (!trainerOn()) return [];
    const ids = new Set(), cut = Date.now() - 8 * WEEK;
    D.days.forEach(d => d.items.forEach(it => ids.add(it.ex)));
    D.sessions.filter(s => s.start > cut).forEach(s => s.items.forEach(it => ids.add(it.ex)));
    return [...ids].map(readyOf).filter(r => r && skips()[r.ex.id] !== r.sid).sort((a, b) => b.at - a.at);
  }
  function harderCard() {
    const l = readyList(); if (!l.length) return '';
    const r = l[0];
    return `<div class="card" id="harderCard"><div class="k2">💪 Ready for a harder move</div>
      <p class="small mt4"><b>${esc(r.ex.name)}</b>: ${r.reps.join(', ')} reps last time. Time to move up to <b>${esc(r.next.name)}</b>, starting at 3 × ${r.start}.</p>
      <div class="row mt8" style="gap:8px"><button class="btn grow" data-act="harderSkip" data-id="${esc(r.ex.id)}">Not yet</button><button class="btn primary grow" data-act="harderGo" data-id="${esc(r.ex.id)}">Switch in my plan</button></div>
      <p class="xs dim mt8">Trainer mode · your ${esc(r.ex.name.toLowerCase())} history stays${l.length > 1 ? ` · ${l.length - 1} more ready after this` : ''}</p></div>`;
  }
  ACT.harderGo = el => {
    const r = readyOf(el.dataset.id); if (!r) return;
    let n = 0;
    D.days.forEach(d => d.items.forEach(it => { if (it.ex === r.ex.id && !d.items.some(x => x.ex === r.next.id)) { it.ex = r.next.id; it.sets = 3; it.reps = r.start; it.planAt = Date.now(); n++; } }));
    // a workout going now: swapped too, if nothing of it is ticked yet
    if (D.active && !D.active.items.some(x => x.ex === r.next.id)) D.active.items.forEach((it, i) => { if (it.ex === r.ex.id && !it.sets.some(x => x.done)) D.active.items[i] = A.buildItem(r.next.id, { sets: 3, reps: r.start, planAt: Date.now() }); });
    D.settings.ladderSkip = Object.assign({}, skips(), { [r.ex.id]: r.sid });
    S.save(true); A.rerender();
    toast(n ? `${r.next.name} is in your plan now (3 × ${r.start})` : `Next time, do ${r.next.name} instead (3 × ${r.start})`);
  };
  ACT.harderSkip = el => {
    const r = readyOf(el.dataset.id); if (!r) return;
    D.settings.ladderSkip = Object.assign({}, skips(), { [r.ex.id]: r.sid }); S.save(true); A.rerender();
    toast(`OK: asked again after your next ${r.ex.name.toLowerCase()} workout`);
  };

  // ============================================================ matching names to the library (61 and 60)
  const STOP = new Set(['the', 'a', 'an', 'with', 'on', 'and', 'of', 'to', 'for', 'in', 'x', 'each', 'side', 'sets', 'reps']);
  const SYN = [[/\bdbs?\b/g, 'dumbbell'], [/\bbbs?\b/g, 'barbell'], [/\bkbs?\b/g, 'kettlebell'], [/\bohp\b/g, 'overhead press'], [/\brdls?\b/g, 'romanian deadlift'],
    [/\bsldl\b/g, 'stiff leg deadlift'], [/\bpull ?ups?\b/g, 'pull up'], [/\bchin ?ups?\b/g, 'chin up'], [/\b(push|press) ?ups?\b/g, 'push up'], [/\bpull ?downs?\b/g, 'pulldown'],
    [/\bpush ?downs?\b/g, 'pushdown'], [/\b(lat|side|lateral) raises?\b/g, 'lateral raise'], [/\bfl(y|ye|yes|ys|ies)\b/g, 'fly'], [/\bext\b/g, 'extension'], [/\bskull ?crushers?\b/g, 'skull crusher'],
    [/\btris\b/g, 'triceps'], [/\bhammies\b/g, 'hamstring'], [/\bsit ?ups?\b/g, 'sit up'], [/\bdead ?lifts?\b/g, 'deadlift'], [/\bdips\b/g, 'dip'], [/\bcalves\b/g, 'calf'], [/\bbiceps? curls?\b/g, 'curl'], [/\btriceps? (pushdown|extension)/g, 'triceps $1']];
  const toks = s => {
    let t = fold(s); for (const [re, to] of SYN) t = t.replace(re, to);
    return t.split(' ').filter(w => w && !STOP.has(w) && !/^\d+$/.test(w)).map(w => (w.length > 3 && /[^s]s$/.test(w) && !/(press|cross|abs|plus)$/.test(w) ? w.slice(0, -1) : w));
  };
  // words a library name adds that a program usually leaves out ("bench press" is the flat barbell one)
  const LOOSE = new Set(['barbell', 'flat', 'standing', 'back', 'grip', 'v', 'bar']);
  let seen = null;
  const better = (k, b) => { for (let i = 0; i < k.length; i++) if (k[i] !== b[i]) return k[i] > b[i]; return false; };
  function matchEx(name, strict) {
    const q = toks(name); if (!q.length) return null;
    const qs = new Set(q), qk = q.join(' ');
    if (!seen) { seen = {}; D.sessions.forEach(s => s.items.forEach(it => { seen[it.ex] = (seen[it.ex] || 0) + 1; })); setTimeout(() => { seen = null; }, 0); }
    let best = null;
    for (const e of S.allExercises()) {
      let sc = 0;
      for (const nm of [e.name].concat(e.aka || [])) {
        const c = toks(nm); if (!c.length) continue;
        if (c.join(' ') === qk) { sc = 2; break; }
        const cs = new Set(c.filter(w => qs.has(w) || !LOOSE.has(w))), inter = [...qs].filter(w => cs.has(w)).length, uni = qs.size + cs.size - inter;
        let v = inter / uni; if (inter === qs.size) v += 0.15;
        if (v > sc) sc = v;
      }
      if (sc < (strict ? 0.75 : 0.5)) continue;
      const k = [sc, seen[e.id] || 0, e.mine ? 1 : 0, -e.name.length];
      if (!best || better(k, best.k)) best = { e, k };
    }
    return best ? best.e : null;
  }
  const title = s => String(s || '').trim().replace(/\s+/g, ' ').replace(/\b[a-z]/g, c => c.toUpperCase()).slice(0, 60);
  const GROUP_OF = [[/\b(curl)\b/, 'Biceps'], [/\b(leg curl|hamstring|romanian|good morning|nordic)\b/, 'Hamstrings'], [/\b(tricep|pushdown|skull|dip|kickback)\b/, 'Triceps'],
    [/\b(chest|bench|fly|push up|pec)\b/, 'Chest'], [/\b(row|pulldown|pull up|chin up|lat|deadlift|back)\b/, 'Back'], [/\b(shoulder|overhead|lateral|delt|face pull|arnold|shrug)\b/, 'Shoulders'],
    [/\b(squat|leg press|lunge|leg extension|step up|quad)\b/, 'Quads'], [/\b(glute|hip thrust|bridge|abduct)\b/, 'Glutes'], [/\b(calf)\b/, 'Calves'],
    [/\b(plank|crunch|ab|core|sit up|leg raise|twist|hollow)\b/, 'Core'], [/\b(run|bike|cycle|treadmill|walk|jump rope|skipping|cardio|elliptical)\b/, 'Cardio'], [/\b(wrist|forearm|grip)\b/, 'Forearms']];
  const groupOf = (name, secs) => { const t = toks(name).join(' '); if (/\bleg curl\b/.test(t)) return 'Hamstrings'; for (const [re, g] of GROUP_OF) if (re.test(t)) return g; return secs ? 'Cardio' : 'Core'; };
  const equipOf = name => { const t = toks(name).join(' '); return /barbell|\bbar\b/.test(t) ? 'Barbell' : /dumbbell/.test(t) ? 'Dumbbell' : /cable|rope/.test(t) ? 'Cable' : /smith/.test(t) ? 'Smith' : /machine|press machine|leg press|pec deck/.test(t) ? 'Machine' : /push up|pull up|chin up|dip|plank|crunch|sit up/.test(t) ? 'Bodyweight' : 'Other'; };

  // ============================================================ 60: "Do this workout" on a club mate's workout
  const med = a => { if (!a.length) return 0; const s = a.slice().sort((p, q) => p - q); return s[s.length >> 1]; };
  // what an older app put into words: "60 kg × 8, 8, 6", "8, 8, 6 reps", "60 kg × 3 sets", "60×8, 62.5×6", "3 min, 2 min"
  function parseSets(t) {
    let m = t.match(/(\d+)\s*sets?\b/); if (m) return { n: +m[1], r: 0 };
    const nums = x => x.split(',').map(v => parseFloat(v)).filter(v => v > 0);
    m = t.match(/×\s*([\d.\s,]+)$/); if (m && !/×.*×/.test(t)) { const rs = nums(m[1]); return { n: rs.length, r: med(rs) }; }
    m = t.match(/^([\d\s,]+)\s*reps\b/); if (m) { const rs = nums(m[1]); return { n: rs.length, r: med(rs) }; }
    const parts = t.split(',').map(p => p.trim()).filter(Boolean), rs = parts.map(p => { const k = p.match(/×\s*(\d+)/); return k ? +k[1] : 0; }).filter(v => v > 0);
    return { n: parts.length || 3, r: med(rs) };
  }
  function itemsOfShared(f) {
    const items = [], miss = [];
    for (const x of ((f.detail && f.detail.items) || [])) {
      const ex = (x.ex && S.getEx(x.ex)) || matchEx(x.name, true);
      if (!ex) { miss.push(String(x.name || '').slice(0, 40)); continue; }
      if (items.some(o => o.ex === ex.id)) continue;
      let n = num(x.n), r = num(x.r);
      if (!n) { const p = parseSets(String(x.text || '')); n = p.n; r = r || p.r; }
      items.push({ ex: ex.id, sets: Math.max(1, Math.min(10, Math.round(n) || 3)), reps: ex.track === 'time' || !(r > 0) ? '' : Math.round(r) });
    }
    return { items, miss };
  }
  ACT.copyWorkout = el => {
    const CU = window.CloudUI, f = CU && CU.feedAt ? CU.feedAt(el.dataset.i) : null; if (!f || !f.detail) return;
    const { items, miss } = itemsOfShared(f);
    if (!items.length) { toast('None of these exercises are in your library'); return; }
    const who = String(f.name || 'club mate').trim().split(/\s+/)[0];
    const d = S.addDay(`${String(f.day_name || 'Workout').slice(0, 32)} (${who.slice(0, 16)})`, items);
    A.openSheet(`<h2>Added as a day</h2><p class="small mt8"><b>${esc(d.name)}</b>: ${plural(items.length, 'exercise')} with ${esc(who)}'s sets and reps. The weights are yours: an exercise you haven't done yet starts empty, and you pick as you go.</p>
      ${miss.length ? `<p class="xs dim mt8">Not in your library, so left out: ${esc(miss.join(', '))}.</p>` : ''}
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="closeSheet">Done</button><button class="btn primary grow" data-act="copyOpen" data-id="${esc(d.id)}">See the day</button></div>`);
  };
  ACT.copyOpen = el => { A.closeSheet(); A.reset('days'); if (S.getDay(el.dataset.id)) A.go('day', { id: el.dataset.id }); };

  // ============================================================ 61: a program from a photo or pasted text
  let prog = null;          // { busy, days: [{ name, on, items: [{ x, ex }] }], name, note }
  ACT.progImport = () => {
    prog = null;
    A.openSheet(`<h2>Import a program</h2><p class="small muted">A gym whiteboard, a printed plan, a screenshot of a post, or the text of a program: the AI reads the days and their exercises, and GymDay finds each one in its library.</p>
      <div class="kc-ways mt8" style="grid-template-columns:repeat(3,1fr)"><button class="kc-way" data-act="progShot" data-cam="1"><span>📷</span>Photo</button><button class="kc-way" data-act="progShot"><span>🖼</span>Gallery</button><button class="kc-way" data-act="progPaste"><span>📋</span>Paste text</button></div>
      <p class="xs dim mt8">One AI read. Nothing changes until you look the days over and add them.</p><button class="btn block mt12" data-act="closeSheet">Cancel</button>`);
  };
  ACT.progShot = async el => {
    const cam = !!(el && el.dataset && el.dataset.cam), F = window.Food;
    const pics = F && F.pickPhotos ? await F.pickPhotos({ max: cam ? 1 : 4, camera: cam, side: 1600 }) : [];
    if (pics && pics.length) progRead({ images: pics.map(p => p.big) });
  };
  ACT.progPaste = () => A.openSheet(`<h2>Paste a program</h2><p class="small muted">Days, exercises, sets and reps, as they're written.</p>
      <textarea class="input mt8" id="pgPaste" rows="10" maxlength="6000" style="height:auto;min-height:180px;line-height:1.4" placeholder="Day 1: Push&#10;Bench press 4×8&#10;Incline dumbbell press 3×10-12&#10;…"></textarea>
      <div class="row mt16"><button class="btn" data-act="progImport">Back</button><button class="btn primary grow" data-act="progPasteGo">Read it</button></div>`);
  ACT.progPasteGo = () => { const t = String(($('#pgPaste') || {}).value || '').trim(); if (t.length < 20) { toast('Paste the whole program first'); return; } progRead({ text: t }); };
  async function progRead(o) {
    const mine = prog = { busy: true };
    paint(`<h2>Reading the program</h2><p class="small muted mt12" id="pgBusy"><span class="kc-spin"></span> ${o.text ? 'Reading what you pasted' : 'Reading the photo'}… about 15 seconds.</p>`, () => { if (prog === mine) prog = null; });
    let r = null, err = '';
    try {
      if (window.__programAi) r = await window.__programAi(o);                                       // tests
      else {
        const Cl = window.Cloud;
        if (!Cl || !Cl.configured || !Cl.programRead) err = "Reading programs needs the account's server. Make the days by hand for now.";
        else if (!Cl.signedIn()) err = 'Sign in (Settings → Account) to have a program read. For now, make the days by hand.';
        else r = await Cl.programRead(o);
      }
    } catch (e) { err = (e && e.status === 404) ? "Reading programs isn't switched on for this account's server yet." : ((e && e.message) || "The program couldn't be read just now. Try again."); }
    if (prog !== mine) return;
    mine.busy = false;
    const pg = r && r.program;
    if (!pg || !(pg.days || []).length) {
      prog = null;
      A.openSheet(`<h2>Program not read</h2><p class="small mt12">${esc(err || 'No workout could be read from that. Try a clearer photo, or paste it as text.')}</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="progImport">Try again</button></div>`);
      return;
    }
    mine.name = String(pg.name || '').slice(0, 60); mine.note = String((r && r.note) || '').slice(0, 200);
    mine.days = pg.days.slice(0, 7).map(d => ({ name: String(d.name || 'Day').slice(0, 40), on: true, items: (d.items || []).slice(0, 15).map(x => ({ x, ex: matchEx(x.name) })) }));
    progSheet();
  }
  const setsText = x => `${x.sets || 3} × ${x.secs ? x.secs + ' s' : x.reps_hi ? `${x.reps}–${x.reps_hi}` : x.reps || '?'}`;
  function progSheet() {
    const o = prog; if (!o || !o.days) return;
    const on = o.days.filter(d => d.on), nNew = new Set(on.flatMap(d => d.items.filter(i => !i.ex).map(i => fold(i.x.name)))).size;
    const rows = o.days.map((d, di) => `<div class="card pg-day ${d.on ? '' : 'off'}" style="background:var(--bg3)"><div class="row"><b class="grow">${esc(d.name)}</b><button class="btn sm" data-act="progDay" data-i="${di}">${d.on ? 'Leave out' : 'Add it'}</button></div>
      ${d.items.map(i => `<div class="xs mt4"><span class="muted">${esc(i.x.name)} · ${setsText(i.x)}</span> → ${i.ex ? `<b>${esc(i.ex.name)}</b>` : `<b>new:</b> ${esc(title(i.x.name))}`}</div>`).join('')}</div>`).join('');
    paint(`<h2>${esc(o.name || 'Your program')}</h2><p class="small muted">${plural(o.days.length, 'day')} read. Each exercise is matched to the library; one that isn't there is added as your own.</p>
      <div class="mt8">${rows}</div>${o.note ? `<p class="xs dim">${esc(o.note)}</p>` : ''}${window.Safety ? window.Safety.aiLink('Program read', o.days.map(d => d.name + ': ' + d.items.map(i => i.x.name).join(', ')).join(' | ')) : ''}
      <button class="btn primary block mt12" data-act="progAdd" ${on.length ? '' : 'disabled'}>${on.length ? `Add ${plural(on.length, 'day')}${nNew ? ` and ${plural(nNew, 'new exercise')}` : ''}` : 'Nothing to add'}</button>
      <button class="btn block mt8" data-act="closeSheet">Cancel</button>`, () => { if (prog === o) prog = null; });
  }
  ACT.progDay = el => { const o = prog, d = o && o.days && o.days[+el.dataset.i]; if (!d) return; d.on = !d.on; progSheet(); };
  ACT.progAdd = () => {
    const o = prog; if (!o || !o.days) return;
    const made = new Map(); let nd = 0;
    D.ex = D.ex || {};
    for (const d of o.days.filter(x => x.on)) {
      const items = [];
      for (const i of d.items) {
        let ex = i.ex;
        if (!ex) {
          const k = fold(i.x.name); ex = made.get(k);
          if (!ex) { const g = groupOf(i.x.name, i.x.secs); ex = { id: 'c-' + S.uid(), name: title(i.x.name), group: g, primary: [g], secondary: [], equip: equipOf(i.x.name), tip: '', mine: true, track: i.x.secs ? 'time' : 'weight', alt: [], img: [], steps: [] }; D.customEx.push(ex); made.set(k, ex); }
        }
        if (items.some(t => t.ex === ex.id)) continue;
        const lo = Math.round(num(i.x.reps)), hi = Math.round(num(i.x.reps_hi));
        items.push({ ex: ex.id, sets: Math.max(1, Math.min(10, Math.round(num(i.x.sets)) || 3)), reps: i.x.secs || !(lo > 0) ? '' : lo });
        // a range of reps ("8-12") becomes the exercise's rep range, unless it has one already
        if (lo > 0 && hi > lo && A.repsOn()) { const st = D.ex[ex.id] = D.ex[ex.id] || {}; if (!Array.isArray(st.rr)) st.rr = [lo, hi]; }
      }
      if (items.length) { S.addDay(d.name, items); nd++; }
    }
    prog = null; S.save(true); A.closeSheet(); A.reset('days');
    toast(`Added ${plural(nd, 'day')}${made.size ? ` and ${plural(made.size, 'new exercise')}` : ''}`);
  };

  // ============================================================ 65: the next milestone on the main lifts
  // The main lifts: the 5 done most in the last 12 weeks (in at least 3 workouts). For a weight, the next round number above
  // the heaviest set (every 5 kg up to 40 kg, then every 10; every 10 lb up to 100, then every 25); for a bodyweight move,
  // the next 5 reps in one set. The pace is the slope of the heaviest set of each workout over the last 12 weeks.
  function mainLifts() {
    const cut = Date.now() - 12 * WEEK, n = {};
    D.sessions.filter(s => s.start > cut).forEach(s => s.items.forEach(it => { if (!it.skipped && it.sets.some(x => x.done && x.kind !== 'w')) n[it.ex] = (n[it.ex] || 0) + 1; }));
    return Object.keys(n).filter(id => n[id] >= 3).map(id => S.getEx(id)).filter(ex => ex && ex.track !== 'time' && ex.group !== 'Cardio').sort((a, b) => n[b.id] - n[a.id] || a.name.localeCompare(b.name)).slice(0, 5);
  }
  function tops(ex, since) {
    const out = [];
    D.sessions.forEach(s => {
      if (s.start < since) return; let v = 0;
      s.items.forEach(it => { if (it.ex !== ex.id || it.skipped) return; it.sets.forEach(x => { if (!x.done || x.kind === 'w') return; const y = ex.track === 'bw' ? (num(x.w) > 0 ? 0 : num(x.r)) : num(x.w); if (y > v) v = y; }); });
      if (v > 0) out.push([s.start, v]);
    });
    return out;
  }
  function mileOf(ex) {
    const all = tops(ex, 0); if (!all.length) return null;
    const best = Math.max(...all.map(p => p[1])), reps = ex.track === 'bw', kg = A.unit() !== 'lb';
    const step = reps ? 5 : kg ? (best < 40 ? 5 : 10) : (best < 100 ? 10 : 25), next = Math.floor(best / step + 1e-9) * step + step, prev = next - step;
    // pace: least squares over the last 12 weeks, in units a week
    const pts = tops(ex, Date.now() - 12 * WEEK); let weeks = 0;
    if (pts.length >= 3) {
      const xs = pts.map(p => p[0] / WEEK), ys = pts.map(p => p[1]), mx = xs.reduce((a, b) => a + b, 0) / xs.length, my = ys.reduce((a, b) => a + b, 0) / ys.length;
      const sxx = xs.reduce((a, x) => a + (x - mx) ** 2, 0), k = sxx > 0 ? xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / sxx : 0;
      if (k > 0.05) weeks = Math.ceil((next - best) / k);
    }
    return { ex, best, next, prev, left: Math.round((next - best) * 100) / 100, prog: Math.max(0, Math.min(1, (best - prev) / step)), weeks: weeks > 0 && weeks <= 26 ? weeks : 0, u: reps ? 'reps' : A.unit(), reps };
  }
  const fmtV = (v, m) => (m.reps ? String(v) : A.fmtW(v));
  function mileRow(m) {
    return `<div class="list-item" data-act="openEx" data-id="${esc(m.ex.id)}"><div class="grow" style="min-width:0"><div class="row"><span class="small ellipsis grow" style="font-weight:600">${esc(m.ex.name)}</span><span class="small accent">${fmtV(m.next, m)} ${m.u}</span></div>
      <div class="bar mt4"><div style="width:${Math.round(m.prog * 100)}%"></div></div>
      <div class="xs muted mt4">${m.reps ? `Best ${m.best} reps in one set` : `Heaviest ${fmtV(m.best, m)} ${m.u}`} · ${fmtV(m.left, m)} ${m.u} to go${m.weeks ? ` · about ${plural(m.weeks, 'week')} at your pace` : ''}</div></div></div>`;
  }
  const milesNow = () => mainLifts().map(mileOf).filter(Boolean);
  function milesCard() {
    const l = milesNow(); if (!l.length) return '';
    return `<div class="card" id="milesCard"><div class="k2">🎯 Next milestones</div>${l.map(mileRow).join('')}<p class="xs dim mt8">Your main lifts: the ones you did most in the last 12 weeks. A milestone is the next round number.</p></div>`;
  }
  // Today: only when one is close (three quarters of the way there, or one small step away)
  function mileCard() {
    const close = milesNow().filter(m => m.prog >= 0.75 || m.left <= (m.reps ? 1 : A.unit() === 'lb' ? 5 : 2.5)).sort((a, b) => b.prog - a.prog);
    if (!close.length) return '';
    const m = close[0];
    return `<div class="card" id="mileCard"><div class="k2">🎯 Almost there</div><p class="small mt4"><b>${esc(m.ex.name)}</b>: ${fmtV(m.left, m)} ${m.u} from ${fmtV(m.next, m)} ${m.u}.${m.weeks ? ` At your pace, about ${plural(m.weeks, 'week')}.` : ''}</p>
      <div class="bar mt8"><div style="width:${Math.round(m.prog * 100)}%"></div></div><button class="linkish xs mt8" data-act="openRecords">All milestones ›</button></div>`;
  }
  ACT.openRecords = () => A.go('records');
  if (VIEWS.records) {
    const r0 = VIEWS.records.html;
    VIEWS.records.html = function (p) { const h = r0.call(this, p), c = milesCard(), i = h.indexOf('<div class="card">'); return c && i >= 0 ? h.slice(0, i) + c + h.slice(i) : h; };
  }
  if (window.Extras && window.Extras.exerciseExtra) {
    const ee0 = window.Extras.exerciseExtra;
    window.Extras.exerciseExtra = ex => {
      const h = ee0(ex); if (!ex || !mainLifts().some(e => e.id === ex.id)) return h;
      const m = mileOf(ex); return m ? h + `<div class="card" id="exMile"><div class="k2">🎯 Next milestone</div>${mileRow(m).replace(' data-act="openEx"', '')}</div>` : h;
    };
  }

  // Today's cards
  if (window.Insights && window.Insights.homeCards) { const h0 = window.Insights.homeCards; window.Insights.homeCards = () => h0() + harderCard() + mileCard(); }
  window.Gym128 = { LADDER, readyOf, readyList, matchEx, toks, parseSets, itemsOfShared, mileOf, mainLifts, groupOf, equipOf, prog: () => prog };
})();
