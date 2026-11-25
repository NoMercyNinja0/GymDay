/* GymDay 1.23 · the typo catcher (odd.js): "Is this right?" for entries that look like a slip of the finger.
   - A set: a weight far above (or far below) what this exercise has ever seen, or a rep count no set has, is asked
     about BEFORE it is ticked, because a ticked set moves Top set and can set a record.
   - A food: one entry of 1,500 kcal or more (900 in a snack), 1.5 kg or more, or 15 or more pieces gets a line under it
     in the meal: Yes (kept, never asked again: entry.ok) or Change. Today's ring says when a food is waiting.
   - Body weight: outside 25–250 kg, or more than 8% away from the last weigh-in of the past 30 days.
   - An activity: longer than 5 hours, or more than 2,500 kcal.
   Nothing is ever changed or refused: the question has "Yes" on it. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc, ACT } = A, D = S.data;
  const num = A.num, n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const lb = () => A.unit() === 'lb';
  const okSets = new WeakSet();

  // ---------------- a set ----------------
  function oddSet(cs, it, s) {
    const ex = S.getEx(it.ex); if (!ex || s.kind === 'w') return '';
    const w = num(s.w), r = num(s.r), u = A.unit();
    if (ex.track === 'time') return w > 180 ? `${A.fmtW(w)} minutes is a very long hold` : '';
    if (A.repsOn() && r > (ex.track === 'bw' ? 300 : 60)) return `${A.fmtW(r)} reps in one set`;
    if (ex.track !== 'weight' || !(w > 0)) return '';
    const before = cs === D.active && cs.tb && cs.tb[ex.id] ? num(cs.tb[ex.id].max) : num((D.ex[ex.id] || {}).max);
    const others = it.sets.filter(x => x !== s && x.done && x.kind !== 'w').map(x => num(x.w));
    const ref = Math.max(before || 0, ...others, 0);
    if (ref > 0) {
      if (w > Math.max(ref * 1.5, ref + (lb() ? 45 : 20))) return `${A.fmtW(w)} ${u} is a big jump: your heaviest set of this so far is ${A.fmtW(ref)} ${u}`;
      if (!s.kind && ref >= (lb() ? 45 : 20) && w < ref * 0.25) return `${A.fmtW(w)} ${u} is far below your usual here (${A.fmtW(ref)} ${u})`;
      return '';
    }
    return w > (lb() ? 660 : 300) ? `${A.fmtW(w)} ${u} is more than almost anyone lifts` : '';
  }
  const setDone0 = ACT.setDone;
  ACT.setDone = el => {
    const cs = A.curSession(), it = cs && cs.items[+el.dataset.si], s = it && it.sets[+el.dataset.ri];
    if (s && !s.done && !okSets.has(s)) {
      const why = oddSet(cs, it, s);
      if (why) {
        const ex = S.getEx(it.ex), u = ex.track === 'time' ? 'min' : A.unit();
        A.openSheet(`<h2>Is this right?</h2><p class="odd-big">${ex.track === 'bw' ? '' : `${esc(A.fmtW(num(s.w)))} ${u}`}${A.repsOn() && ex.track !== 'time' && num(s.r) ? `${ex.track === 'bw' ? '' : ' × '}${esc(A.fmtW(num(s.r)))}${ex.track === 'bw' ? ' reps' : ''}` : ''}</p><p class="muted">${esc(ex.name)}: ${esc(why)}.</p>
          <p class="small muted mt8">Ticking a set can move your Top set and records, so GymDay checks odd numbers first.</p>
          <div class="row mt16"><button class="btn grow" data-act="oddSetFix" data-si="${el.dataset.si}" data-ri="${el.dataset.ri}">Change it</button><button class="btn primary grow" data-act="oddSetYes" data-si="${el.dataset.si}" data-ri="${el.dataset.ri}">Yes, tick it</button></div>`);
        return;
      }
    }
    return setDone0(el);
  };
  ACT.oddSetYes = el => { const cs = A.curSession(), it = cs && cs.items[+el.dataset.si], s = it && it.sets[+el.dataset.ri]; A.closeSheet(); if (!s) return; okSets.add(s); setDone0({ dataset: { si: el.dataset.si, ri: el.dataset.ri } }); };
  ACT.oddSetFix = el => { A.closeSheet(); setTimeout(() => { const i = $(`.sx[data-i="${el.dataset.si}"] input[data-ri="${el.dataset.ri}"][data-f="w"], .sx[data-i="${el.dataset.si}"] input[data-ri="${el.dataset.ri}"]`); if (i) { i.scrollIntoView({ block: 'center' }); i.focus(); if (i.select && !i.readOnly) i.select(); } }, 80); };

  // ---------------- a food ----------------
  const COUNT_RE = /\b(g|gram|grams|ml|kg|l|oz|kcal)\b/i;
  function oddFood(e) {
    if (!e || e.ok || e.src === 'left' || !(e.kcal > 0)) return '';
    const many = (e.items || []).length > 1, meal = e.meal, snack = meal === 'ms' || meal === 'es';
    if (e.kcal >= (many ? 2500 : 1500)) return `${n0(e.kcal)} kcal ${many ? 'in one meal photo' : 'for one food'}`;
    if (!many && snack && e.kcal >= 900) return `${n0(e.kcal)} kcal is a lot for a snack`;
    if (!many && num(e.g) >= 1500) return `${n0(e.g)} g of it`;
    if (!many && num(e.q) >= 15 && e.un && !COUNT_RE.test(e.un) && e.un !== 'g' && e.un !== 'ml') return `${A.fmtW(num(e.q))} × ${e.un.replace(/^1\s+/, '')}`;
    return '';
  }
  const foodStrip = e => { const why = oddFood(e); return why ? `<div class="odd" data-id="${esc(e.id)}"><span class="odd-t"><b>Is this right?</b> ${esc(why)}.</span><button class="btn sm" data-act="oddFoodFix" data-id="${esc(e.id)}">Change</button><button class="btn sm primary" data-act="oddFoodYes" data-id="${esc(e.id)}">Yes</button></div>` : ''; };
  ACT.oddFoodYes = el => { const e = D.food.find(x => x.id === el.dataset.id); if (!e) return; e.ok = 1; S.save(true); const strip = el.closest('.odd'); if (strip) strip.remove(); if (A.top().name === 'days') A.rerender(); };
  ACT.oddFoodFix = el => { if (ACT.kcEdit) ACT.kcEdit({ dataset: { id: el.dataset.id } }); };
  const oddToday = () => { const t0 = new Date().setHours(0, 0, 0, 0); return D.food.filter(e => e.t >= t0 && e.t < t0 + 86400000 && oddFood(e)); };

  // ---------------- body weight ----------------
  function oddWeight(v) {
    const u = A.unit(), lo = lb() ? 55 : 25, hi = lb() ? 550 : 250;
    if (v < lo || v > hi) return `${A.fmtW(v)} ${u} is outside what GymDay expects for a body weight`;
    const now = Date.now(), last = (D.body || []).filter(b => b.t <= now + 60000).sort((a, b) => b.t - a.t)[0];
    if (last && now - last.t < 30 * 86400000 && Math.abs(v - last.kg) / last.kg > 0.08) return `last time (${A.fmtDate(last.t)}) you were ${A.fmtW(last.kg)} ${u}`;
    return '';
  }
  let okW = null;
  const guardWeight = (name, inputSel) => {
    const f0 = ACT[name]; if (!f0) return;
    ACT[name] = el => {
      const v = num(($(inputSel) || {}).value);
      if (v > 0 && okW !== v) {
        const why = oddWeight(v);
        if (why) {
          const box = $(inputSel), host = box && box.closest('.card, .panel');
          const old = host && host.querySelector('.odd'); if (old) old.remove();
          if (host) host.insertAdjacentHTML('beforeend', `<div class="odd odd-w mt12"><span class="odd-t"><b>Is this right?</b> ${esc(A.fmtW(v))} ${A.unit()}: ${esc(why)}.</span><button class="btn sm" data-act="oddWFix" data-sel="${esc(inputSel)}">Change</button><button class="btn sm primary" data-act="oddWYes" data-n="${name}" data-v="${v}">Yes</button></div>`);
          return;
        }
      }
      okW = null; return f0(el);
    };
  };
  guardWeight('bodyAdd', '#bodyIn'); guardWeight('kcWeighSave', '#kcWIn');
  ACT.oddWYes = el => { okW = +el.dataset.v; const strip = el.closest('.odd'); if (strip) strip.remove(); ACT[el.dataset.n](); };
  ACT.oddWFix = el => { const strip = el.closest('.odd'); if (strip) strip.remove(); const i = $(el.dataset.sel); if (i) { i.focus(); if (i.select) i.select(); } };

  // ---------------- an activity ----------------
  const mvSave0 = ACT.mvSave;
  let okMv = '';
  if (mvSave0) ACT.mvSave = el => {
    const sh = $('#sheet .panel'); if (!sh) return mvSave0(el);
    const mins = num((sh.querySelector('#mvMins, [data-mv="mins"], input[id*="Min"]') || {}).value), kc = num((sh.querySelector('#mvKc, [data-mv="kc"], input[id*="Kc"], input[id*="kcal"]') || {}).value);
    const why = mins > 300 ? `${n0(mins)} minutes is ${Math.round(mins / 6) / 10} hours` : kc > 2500 ? `${n0(kc)} kcal in one activity` : '', key = mins + '|' + kc;
    if (why && okMv !== key) {
      const old = sh.querySelector('.odd'); if (old) old.remove();
      const btn = sh.querySelector('[data-act="mvSave"]'), host = btn ? btn.closest('.row') || btn : null;
      (host || sh).insertAdjacentHTML(host ? 'beforebegin' : 'beforeend', `<div class="odd odd-w mt12"><span class="odd-t"><b>Is this right?</b> ${esc(why)}.</span><button class="btn sm primary" data-act="oddMvYes" data-k="${esc(key)}">Yes</button></div>`);
      const o = sh.querySelector('.odd'); if (o) o.scrollIntoView({ block: 'center' });
      return;
    }
    okMv = ''; return mvSave0(el);
  };
  ACT.oddMvYes = el => { okMv = el.dataset.k; const strip = el.closest('.odd'); if (strip) strip.remove(); ACT.mvSave(); };

  window.Odd = { set: oddSet, food: oddFood, weight: oddWeight, foodStrip, today: oddToday };
})();
