/* GymDay v1.13: leftovers. What was left on the plate is taken off a meal: from a photo of the plate (read with the meal's own
   photo when there is one), from grams typed for each food, or from one weight for all the leftovers together (split between the
   foods). It is kept as one "Leftovers" line in the meal, with minus numbers, so every total on the Food tab already counts it. */
(function () {
  'use strict';
  const A = window.App, S = window.Store, D = S.data, ACT = A.ACT, esc = A.esc, $ = A.$;
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const r1 = v => Math.round(v * 10) / 10;
  const toast = m => window.toast(m);
  const undoToast = (m, f) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, f) : toast(m));
  const KEYS = ['kcal', 'p', 'c', 'f', 'fib'];
  const redraw = () => { if (A.top().name === 'calories') A.rerender(); };
  const F = () => window.Food, C = () => window.Calories;
  const dayStart = () => (C() && C().day ? C().day() : new Date().setHours(0, 0, 0, 0));
  const mealName = m => { const x = (F() && F().MEALS || []).find(y => y[0] === m); return x ? x[1] : 'Meal'; };

  // the foods of one meal on one day, each food of a meal photo on its own: [{ of, item, name, g (served), kcal, p, c, f, fib, fid }]
  function entriesOf(t0, meal) { const d = C().dayOf(t0); return d.food.filter(e => F().mealOf(e) === meal); }
  function linesOf(t0, meal) {
    const out = [];
    for (const e of entriesOf(t0, meal)) {
      if (e.src === 'left' || e.sp || e.pin || !(num(e.kcal) > 0)) continue;           // supplements and scoops aren't left on a plate
      if (Array.isArray(e.items) && e.items.length) e.items.forEach((x, i) => { if (num(x.kcal) > 0) out.push({ of: e.id, item: i, name: String(x.name || 'Food'), g: num(x.g), kcal: num(x.kcal), p: num(x.p), c: num(x.c), f: num(x.f), fib: num(x.fib), fid: x.fid || x.mfid || '', mg: x.fid ? 0 : num(x.mg) }); });
      else out.push({ of: e.id, item: null, name: String(e.name || 'Food'), g: num(e.g), kcal: num(e.kcal), p: num(e.p), c: num(e.c), f: num(e.f), fib: num(e.fib), fid: e.fid || e.mfid || '', mg: e.fid ? 0 : num(e.mg) });
    }
    return out;
  }
  const leftOf = (t0, meal) => entriesOf(t0, meal).find(e => e.src === 'left') || null;
  // how much of a food is left: grams of what was served, or a share for a food logged without grams
  const shareOf = l => (l.g > 0 && l.left != null ? Math.min(1, Math.max(0, l.left / l.g)) : l.pct != null ? Math.min(1, Math.max(0, l.pct / 100)) : 0);
  function totals(lines) { const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 }; for (const l of lines) { const s = shareOf(l); for (const k of KEYS) t[k] += l[k] * s; } return t; }

  let lv = null;            // { t0, meal, lines, total, pics, busy, err, note, by, id }
  function open(meal) {
    const t0 = dayStart(), lines = linesOf(t0, meal);
    if (!lines.length) { toast('Log the meal first, then its leftovers'); return; }
    const was = leftOf(t0, meal), parts = (was && was.left && was.left.parts) || [];
    for (const l of lines) {
      const p = parts.find(x => x.of === l.of && (x.item == null ? l.item == null : x.item === l.item));
      if (p) { if (l.g > 0 && p.g > 0) l.left = p.g; else if (p.share != null) l.pct = Math.round(p.share * 100); }
    }
    lv = { t0, meal, lines, total: '', pics: [], by: (was && was.left && was.left.by) || '', id: was ? was.id : '' };
    sheet();
  }
  const row = (l, i) => `<div class="lv-r"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(l.name)}</div><div class="xs muted">${l.g > 0 ? `served ${n0(l.g)} g · ` : ''}${n0(l.kcal)} kcal</div></div>
    ${l.g > 0 ? `<input class="input lv-in" type="number" inputmode="decimal" min="0" step="any" data-i="${i}" data-k="g" value="${l.left != null ? l.left : ''}" placeholder="0" aria-label="Grams left of ${esc(l.name)}"><span class="xs muted lv-u">g left</span>`
      : `<input class="input lv-in" type="number" inputmode="numeric" min="0" max="100" data-i="${i}" data-k="pct" value="${l.pct != null ? l.pct : ''}" placeholder="0" aria-label="Share left of ${esc(l.name)}"><span class="xs muted lv-u">% left</span>`}</div>`;
  const sumHtml = () => { const t = totals(lv.lines); return t.kcal > 0.5 ? `Takes off <b>${n0(t.kcal)} kcal</b>${t.p >= 1 ? ` · P ${r1(t.p)} g` : ''}${t.c >= 1 ? ` · C ${r1(t.c)} g` : ''}${t.f >= 1 ? ` · F ${r1(t.f)} g` : ''}` : 'Nothing left yet: type what is left, or take a photo of the plate.'; };
  function sheet() {
    const o = lv; if (!o) return;
    const Fd = F(), anyG = o.lines.some(l => l.g > 0), before = beforePics(o).length;
    const strip = o.pics.length && Fd.photoStrip ? Fd.photoStrip(o.pics, { what: 'Photo', del: o.busy ? '' : 'lvPicDel', add: o.busy || o.pics.length >= 2 ? '' : 'lvMore', addText: 'Another photo' }) : '';
    A.openSheet(`<h2>Leftovers · ${esc(mealName(o.meal))}</h2>
      <button class="btn block" data-act="lvPhoto" ${o.busy ? 'disabled' : ''}>📷 Photo of what's left</button>
      <p class="xs dim mt4">${before ? `The AI compares it with the meal's photo${before > 1 ? 's' : ''}` : 'The AI looks at what is on the plate'} and the foods below.</p>
      ${strip}${o.busy ? '<div class="kc-ai"><span class="kc-spin"></span> Reading what is left…</div>' : ''}${o.err ? `<p class="small mt8">${esc(o.err)}</p>` : ''}${o.note ? `<p class="xs dim mt8">What the AI saw: ${esc(o.note)}</p>` : ''}
      <div class="kc-sec">What's left of each food</div><div id="lvRows">${o.lines.map(row).join('')}</div>
      ${anyG ? `<div class="kc-sec">Or weigh all of it together</div><div class="row" style="gap:8px;align-items:center"><input class="input grow" id="lvTotal" type="number" inputmode="decimal" min="0" step="any" value="${esc(o.total)}" placeholder="All the leftovers, in grams"><span class="xs muted">g</span></div>
        <p class="xs dim mt4">Split between the foods ${o.by === 'photo' ? 'by what the photo shows' : 'by how much of each was served'}.</p>` : ''}
      <p class="small mt12" id="lvSum">${sumHtml()}</p>
      <div class="row mt16" style="gap:8px">${o.id ? '<button class="btn danger" data-act="lvDel">Remove</button>' : '<button class="btn" data-act="closeSheet">Cancel</button>'}<button class="btn primary grow" data-act="lvSave">Save</button></div>`, null, () => { if (lv === o) lv = null; });
    lv = o;
  }
  // typing keeps the keyboard where it is: only the numbers change
  document.addEventListener('input', e => {
    const t = e.target; if (!lv || !t) return;
    if (t.classList && t.classList.contains('lv-in')) {
      const l = lv.lines[+t.dataset.i]; if (!l) return;
      const v = t.value === '' ? null : Math.max(0, num(t.value));
      if (t.dataset.k === 'g') l.left = v == null ? null : Math.min(v, l.g); else l.pct = v == null ? null : Math.min(100, v);
      lv.total = ''; const tot = $('#lvTotal'); if (tot) tot.value = '';
      if (lv.by !== 'photo') lv.by = 'each';
    } else if (t.id === 'lvTotal') {
      lv.total = t.value; split(num(t.value)); lv.by = lv.by === 'photo' ? 'photo' : 'total';
      document.querySelectorAll('#lvRows .lv-in[data-k="g"]').forEach(x => { const l = lv.lines[+x.dataset.i]; x.value = l.left != null ? l.left : ''; });
    } else return;
    const s = $('#lvSum'); if (s) s.innerHTML = sumHtml();
  });
  // one weight for all of it: shared by what the photo saw, else by how much of each food was served
  function split(total) {
    const ls = lv.lines.filter(l => l.g > 0); if (!ls.length) return;
    const w = ls.map(l => (lv.by === 'photo' && l.seen != null ? l.seen : l.g)), sum = w.reduce((a, x) => a + x, 0) || 1;
    ls.forEach((l, i) => { l.left = total > 0 ? Math.min(l.g, Math.round(total * w[i] / sum)) : null; });
  }

  // ---------------------------------------------------------------- a photo of the plate
  function beforePics(o) {
    const out = [];
    for (const e of entriesOf(o.t0, o.meal)) {
      if (e.src === 'left') continue;
      for (const id of [e.big, e.pic]) { const p = id ? S.loadPhoto(id) : ''; if (p) { out.push(p); break; } }
      if (out.length >= 2) break;
    }
    return out;
  }
  function readLeft(images, lines, nb) {
    if (window.__leftAi) return Promise.resolve(window.__leftAi(images, lines, nb));                 // tests
    const Cl = window.Cloud;
    if (!Cl || !Cl.configured || !Cl.leftShots) return Promise.reject({ message: 'Reading photos needs a GymDay account. Type the grams instead.' });
    if (!Cl.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have the photo read, or type the grams.' });
    return Cl.leftShots(images.map(x => String(x).replace(/^data:image\/\w+;base64,/, '')), lines, nb).catch(e => {
      if (e && e.status === 404) throw { message: "Reading photos isn't switched on for this account's server yet. Type the grams instead." };
      throw { message: (e && e.message) || "The photo couldn't be read. Type the grams instead." };
    });
  }
  async function read(o) {
    Object.assign(o, { busy: true, err: '', note: '' }); sheet();
    const before = beforePics(o).slice(0, 4 - o.pics.length), lines = o.lines.map(l => ({ name: l.name, g: l.g > 0 ? Math.round(l.g) : null }));
    let r;
    try { r = await readLeft(before.concat(o.pics.map(x => x.big)), lines, before.length); }
    catch (e) { if (lv !== o) return; o.busy = false; o.err = (e && e.message) || "The photo couldn't be read. Type the grams instead."; sheet(); return; }
    if (lv !== o) return;
    o.busy = false;
    const got = r && Array.isArray(r.left) ? r.left : [];
    if (!got.length) { o.err = "What's left on the plate couldn't be read. Type the grams instead."; sheet(); return; }
    o.lines.forEach((l, i) => {
      const x = got.find(y => y.i === i + 1), share = x ? (x.share != null ? num(x.share) : l.g > 0 && x.g != null ? num(x.g) / l.g : 0) : 0;
      const g = x && x.g != null ? num(x.g) : l.g > 0 ? share * l.g : 0;
      if (l.g > 0) { l.left = Math.min(l.g, Math.round(g)); l.seen = l.left; } else l.pct = Math.round(Math.min(1, share) * 100);
    });
    o.by = 'photo'; o.total = ''; o.note = String((r && r.note) || '').slice(0, 200);
    sheet();
  }
  ACT.lvPhoto = async () => { const o = lv; if (!o || o.busy) return; const got = await F().pickPhotos({ max: 2, side: 900, q: 0.8 }); if (!got.length || lv !== o) return; o.pics = got.slice(0, 2); read(o); };
  ACT.lvMore = async () => { const o = lv; if (!o || o.busy || o.pics.length >= 2) return; const got = await F().pickPhotos({ max: 1, side: 900, q: 0.8 }); if (!got.length || lv !== o) return; o.pics = o.pics.concat(got).slice(0, 2); read(o); };
  ACT.lvPicDel = el => { const o = lv; if (!o || o.busy) return; o.pics.splice(+el.dataset.i, 1); if (o.pics.length) read(o); else { o.note = ''; sheet(); } };

  // ---------------------------------------------------------------- saving: one Leftovers line in the meal, with minus numbers
  ACT.lvOpen = el => { A.closeSheet(); open(el.dataset.meal); };
  ACT.lvSave = () => {
    const o = lv; if (!o) return;
    const parts = o.lines.map(l => ({ l, s: shareOf(l) })).filter(x => x.s > 0).map(({ l, s }) => {
      const p = { of: l.of, item: l.item, name: l.name.slice(0, 60), share: Math.round(s * 1000) / 1000 };
      if (l.g > 0) p.g = Math.round(l.g * s); if (l.fid) p.fid = l.fid;
      if (!(l.g > 0) && l.mg > 0) p.g = Math.round(l.mg * s);      // v1.14: a food matched by its name: the grams its calories make
      for (const k of KEYS) p[k] = r1(l[k] * s);
      return p;
    });
    const was = o.id ? D.food.find(e => e.id === o.id) : null, wasCopy = was ? JSON.parse(JSON.stringify(was)) : null;
    if (!parts.length) { if (was) ACT.lvDel(); else { lv = null; A.closeSheet(); } return; }
    const t = totals(o.lines), last = entriesOf(o.t0, o.meal).filter(e => e.src !== 'left').reduce((m, e) => Math.max(m, e.t), o.t0);
    const e = was || { id: 'lv-' + S.uid() };
    Object.assign(e, { t: Math.min(last + 1000, o.t0 + 86399000), meal: o.meal, name: 'Leftovers', src: 'left', kcal: -Math.round(t.kcal), left: { by: o.by || 'each', parts } });
    for (const k of ['p', 'c', 'f', 'fib']) { const v = r1(t[k]); if (v > 0) e[k] = -v; else delete e[k]; }
    if (!was) D.food.push(e);
    S.save(true); lv = null; A.closeSheet(); redraw();
    undoToast(`Leftovers: −${n0(t.kcal)} kcal`, () => { if (wasCopy) Object.assign(e, wasCopy); else D.food = D.food.filter(x => x.id !== e.id); S.save(true); redraw(); });
  };
  ACT.lvDel = () => {
    const o = lv, e = o && o.id ? D.food.find(x => x.id === o.id) : null; if (!e) return;
    D.food = D.food.filter(x => x !== e); S.save(true); lv = null; A.closeSheet(); redraw();
    undoToast('Leftovers removed', () => { D.food.push(e); S.save(true); redraw(); });
  };
  // the line in the meal
  function rowHtml(e) {
    const parts = (e.left && e.left.parts) || [];
    const what = parts.slice(0, 3).map(p => (p.g ? `${n0(p.g)} g ` : `${Math.round(p.share * 100)}% of `) + p.name.split(/[,(]/)[0].trim().toLowerCase()).join(', ') + (parts.length > 3 ? '…' : '');
    return `<div class="list-item tap kc-left" data-act="kcInfo" data-id="${esc(e.id)}" data-meal="${esc(e.meal || '')}"><span class="kc-left-i">🍽</span><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">Leftovers</div>
      <div class="xs muted ellipsis">${esc(what)}${e.left && e.left.by === 'photo' ? ' · from a photo' : ''}</div></div><div class="small" style="font-weight:700">−${n0(-e.kcal)}</div></div>`;
  }
  // ---------------------------------------------------------------- 1.24 (check-up): a Leftovers line stays in step with its foods
  // The line takes off what was left of particular foods of its meal. If one of those foods is deleted, its part goes; if it is
  // moved to another meal or day, its part goes with it (into that meal's Leftovers line); if it was made smaller than what was
  // "left" of it, the part is cut to the food. So a meal can never show less than nothing, and nothing is taken off a food that
  // is not there. A part dropped because its food was deleted is remembered while the app is open, so Undo brings it back.
  const day0 = t => new Date(t).setHours(0, 0, 0, 0);
  const stash = new Map();           // food id → [{ p, by }] for parts dropped in this sitting
  const isLeft = e => !!e && e.src === 'left' && e.left && Array.isArray(e.left.parts);
  const samePart = (x, p) => x.of === p.of && (x.item == null ? p.item == null : x.item === p.item);
  function retotal(e) {
    const t = { kcal: 0, p: 0, c: 0, f: 0, fib: 0 };
    for (const p of e.left.parts) for (const k of KEYS) t[k] += num(p[k]);
    e.kcal = -Math.round(t.kcal);
    for (const k of ['p', 'c', 'f', 'fib']) { const v = r1(t[k]); if (v > 0) e[k] = -v; else delete e[k]; }
  }
  function fit() {
    const Fd = F(); if (!Fd || !Fd.mealOf || !Array.isArray(D.food)) return false;
    const lefts = D.food.filter(isLeft);
    if (!lefts.length && !stash.size) return false;
    const byId = new Map(); for (const e of D.food) if (e && e.id) byId.set(e.id, e);
    const dirty = new Set(), moved = [];
    for (const e of lefts) {
      const keep = [];
      for (const p of e.left.parts) {
        if (p.of == null) { keep.push(p); continue; }                 // a part that names no food (not made by this screen) is left as it is
        const f = byId.get(p.of);
        if (!f || f.src === 'left') { const l = stash.get(p.of) || []; if (!l.some(x => samePart(x.p, p))) l.push({ p, by: e.left.by }); stash.set(p.of, l); dirty.add(e); continue; }       // the food is gone
        let whole = num(f.kcal);
        if (p.item != null) {                                           // one food of a photo meal: by its place, or by its name if the place changed
          const its = Array.isArray(f.items) ? f.items : [];
          let x = its[p.item]; if (!x || String(x.name || 'Food').slice(0, 60) !== p.name) { const i = its.findIndex(y => String(y.name || 'Food').slice(0, 60) === p.name); if (i < 0) { dirty.add(e); continue; } p.item = i; x = its[i]; dirty.add(e); }
          whole = num(x.kcal);
        }
        if (num(p.kcal) > whole) { const k = whole > 0 ? whole / num(p.kcal) : 0; for (const key of KEYS) if (p[key] != null) p[key] = r1(num(p[key]) * k); if (p.g) p.g = Math.round(p.g * k); if (!(num(p.kcal) > 0)) { dirty.add(e); continue; } if (num(p.kcal) > whole) p.kcal = whole; dirty.add(e); }   // never more than the food has now
        if (day0(f.t) !== day0(e.t) || Fd.mealOf(f) !== Fd.mealOf(e)) { moved.push({ p, f, by: e.left.by }); dirty.add(e); continue; }                                  // the food moved: its leftovers go with it
        keep.push(p);
      }
      if (keep.length !== e.left.parts.length) e.left.parts = keep;
    }
    // a food that came back (Undo) gets back what was left of it
    for (const [id, list] of stash) { const f = byId.get(id); if (!f || f.src === 'left') continue; for (const x of list) moved.push({ p: x.p, f, by: x.by }); stash.delete(id); }
    for (const { p, f, by } of moved) {
      const d = day0(f.t), m = Fd.mealOf(f);
      let dst = D.food.find(x => isLeft(x) && day0(x.t) === d && Fd.mealOf(x) === m);
      if (!dst) { dst = { id: 'lv-' + S.uid(), t: Math.min(f.t + 1000, d + 86399000), meal: m, name: 'Leftovers', src: 'left', kcal: 0, left: { by: by || 'each', parts: [] } }; D.food.push(dst); }
      const i = dst.left.parts.findIndex(x => samePart(x, p)); if (i >= 0) dst.left.parts[i] = p; else dst.left.parts.push(p);
      dirty.add(dst);
    }
    if (!dirty.size) return false;
    const gone = new Set();
    for (const e of dirty) { if (e.left.parts.length) retotal(e); else gone.add(e); }
    if (gone.size) D.food = D.food.filter(e => !gone.has(e));
    return true;
  }
  // every change the screens make is saved through Store.save: the lines are put in step just before
  const save0 = S.save; S.save = function (now) { try { fit(); } catch (e) { /* never in the way of saving */ } return save0.call(S, now); };
  window.Leftover = { open, rowHtml, linesOf, shareOf, fit };
})();
