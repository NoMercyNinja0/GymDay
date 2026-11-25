/* GymDay v1.29 "How was it made?": after a meal photo, each cooked or put-together dish asks about what a photo can't show: the
   fat it was cooked in (which oil, butter or ghee, and how much), salt, pepper, sugar (white, brown, jaggery, honey, sweetener),
   milk, sauces and dressings, cheese and cream. Only the kinds that dish has: the server's AI lists them, each with its type and
   its best guess in grams, and counts the dish itself without them. Every question has Estimate (the AI's guess). Amounts are in
   spoons (½ tsp, 1 tbsp…) with a switch to grams (settings.ckUnit). Each answer becomes a line of the meal counted from GymDay's
   own food list ("Butter, salted · 1 tsp (in omelette)"). The answers for a dish are remembered and filled in next time
   (settings.ckLast, by the dish's name). On with nutrients-first photos; off with Settings → More features → "Ask how it was made". */
(function () {
  'use strict';
  const A = window.App, S = window.Store;
  if (!A || !S) return;
  const { esc, ACT, $ } = A, D = S.data, toast = m => window.toast(m);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const st = () => D.settings;
  const on = () => st().ckOn !== false && st().kcNut !== false;
  const inGrams = () => st().ckUnit === 'g';
  const r1 = v => Math.round(v * 10) / 10;

  // [type, its name on the line, food list ids (the first one the list has), grams in one teaspoon]
  const T = {
    fat: [['sunflower oil', 'Sunflower oil', ['u2710192', 'w11_016'], 4.5], ['groundnut oil', 'Groundnut oil', ['w11_003'], 4.5], ['mustard oil', 'Mustard oil', ['a14402005', 's172337'], 4.5],
      ['rice bran oil', 'Rice bran oil', ['a14402009', 's171013'], 4.5], ['olive oil', 'Olive oil', ['u2710186', 'w11_014'], 4.5], ['coconut oil', 'Coconut oil', ['u2710182', 'w11_002'], 4.5],
      ['sesame oil', 'Sesame oil', ['u2710190', 'k17-043'], 4.5], ['soybean oil', 'Soybean oil', ['u2710191', 'a14401009'], 4.5], ['vegetable oil', 'Vegetable oil', ['u2710180', 'w11_010'], 4.5],
      ['butter', 'Butter, salted', ['s173410', 'k17-685'], 4.7], ['unsalted butter', 'Butter, unsalted', ['w11_001', 'k17-661'], 4.7], ['ghee', 'Ghee', ['u2710168', 'a14102002'], 4.3]],
    salt: [['salt', 'Salt', ['a31301002', 'k17-367'], 6], ['rock salt', 'Rock salt (sendha namak)', ['a31301002', 'k17-367'], 5], ['black salt', 'Black salt (kala namak)', ['a31301002', 'k17-367'], 5],
      ['low sodium salt', 'Low-sodium salt', [], 6]],
    pepper: [['black pepper', 'Black pepper', ['a31302015', 'w13_014'], 2.3]],
    sugar: [['white sugar', 'White sugar', ['u2710257'], 4.2], ['brown sugar', 'Brown sugar', ['u2710260', 'k17-060'], 4.6], ['jaggery', 'Jaggery (gur)', ['u2710260', 'k17-060'], 4],
      ['honey', 'Honey', ['u2710281', 'k17-050'], 7], ['sweetener', 'Sweetener (no sugar)', [], 0.5]],
    milk: [['full cream milk', 'Full cream milk', ['g9bce73fde'], 5], ['toned milk', 'Toned milk', ['g06668d122'], 5], ['double toned milk', 'Double toned milk', ['g8751c351a'], 5],
      ['skimmed milk', 'Skimmed milk', ['k12-554'], 5], ['buffalo milk', 'Buffalo milk', ['g5e10ee154', 's171280'], 5], ['soy milk', 'Soy milk', ['u2705405'], 5],
      ['almond milk', 'Almond milk', ['u2705410'], 5], ['oat milk', 'Oat milk', ['u2705412'], 5]],
    sauce: [['mayonnaise', 'Mayonnaise', ['u2710204', 'iASC266'], 4.6], ['eggless mayonnaise', 'Eggless mayonnaise', ['u2710205'], 4.6], ['tomato ketchup', 'Tomato ketchup', ['k17-709', 'iBFP602'], 5.7],
      ['green chutney', 'Green chutney', ['iOSR098'], 5], ['tamarind chutney', 'Tamarind chutney', ['iASC281', 'iOSR096'], 6], ['coconut chutney', 'Coconut chutney', ['iASC386'], 5],
      ['schezwan sauce', 'Schezwan sauce', ['iOSR081'], 5], ['soy sauce', 'Soy sauce', ['u2707442', 'k17-721'], 5.3], ['vinaigrette', 'Vinaigrette dressing', ['a23303006'], 5], ['creamy dressing', 'Creamy salad dressing', ['u2710195'], 5]],
    cheese: [['processed cheese', 'Processed cheese', ['k12-527', 'u2705770'], 5], ['mozzarella', 'Mozzarella', ['u2705722'], 5], ['cheddar', 'Cheddar', ['u2705709'], 5], ['cheese spread', 'Cheese spread', ['u2705775'], 5]],
    cream: [['fresh cream', 'Fresh cream (25% fat)', ['k12-337'], 5], ['malai', 'Malai', ['w10_009'], 5], ['whipped cream', 'Whipped cream', ['u2705598'], 1.3]],
  };
  // the questions: what they ask, the amounts (in teaspoons; milk in ml, cheese in grams) and the words for none
  const K = {
    fat: { q: 'Cooked in', tsp: [['¼ tsp', 0.25], ['½ tsp', 0.5], ['1 tsp', 1], ['2 tsp', 2], ['1 tbsp', 3], ['2 tbsp', 6], ['3 tbsp', 9]], none: 'No fat', of: 'butter or oil' },
    salt: { q: 'Salt', tsp: [['A pinch', 0.07], ['⅛ tsp', 0.125], ['¼ tsp', 0.25], ['½ tsp', 0.5], ['1 tsp', 1]], none: 'No salt' },
    pepper: { q: 'Pepper', tsp: [['A pinch', 0.05], ['¼ tsp', 0.25], ['½ tsp', 0.5], ['1 tsp', 1]], none: 'None' },
    sugar: { q: 'Sugar', tsp: [['½ tsp', 0.5], ['1 tsp', 1], ['2 tsp', 2], ['3 tsp', 3], ['2 tbsp', 6]], none: 'No sugar' },
    milk: { q: 'Milk', ml: [['A splash', 20], ['¼ cup', 60], ['½ cup', 120], ['¾ cup', 180], ['1 cup', 240]], none: 'No milk' },
    sauce: { q: 'Sauce or dressing', tsp: [['1 tsp', 1], ['2 tsp', 2], ['1 tbsp', 3], ['2 tbsp', 6], ['3 tbsp', 9]], none: 'None' },
    cheese: { q: 'Cheese', g: [['1 tbsp grated', 7], ['2 tbsp grated', 14], ['¼ cup grated', 28], ['1 slice', 20], ['2 slices', 40]], none: 'None' },
    cream: { q: 'Cream', tsp: [['1 tsp', 1], ['1 tbsp', 3], ['2 tbsp', 6], ['¼ cup', 12]], none: 'None' },
  };
  const ORDER = ['fat', 'salt', 'pepper', 'sugar', 'milk', 'sauce', 'cheese', 'cream'];
  const typeOf = (k, t) => (T[k] || []).find(x => x[0] === t) || (T[k] || [])[0];
  const unitG = (k, t) => (K[k].ml ? 1.03 : K[k].g ? 1 : typeOf(k, t)[3]);
  // the amounts on offer for a kind and type: [words, grams]
  const amounts = (k, t) => (K[k].ml ? K[k].ml.map(([w, ml]) => [`${w} · ${ml} ml`, ml * 1.03]) : K[k].g ? K[k].g.map(([w, g]) => [w, g]) : K[k].tsp.map(([w, n]) => [w, r1(n * typeOf(k, t)[3] * 100) / 100]));
  // the words for an amount in grams: the closest spoon (within a fifth), else the grams
  function words(k, t, g) {
    if (!(g > 0)) return K[k].none.toLowerCase();
    if (inGrams()) return K[k].ml ? `${Math.round(g / 1.03)} ml` : `${r1(g)} g`;
    let best = null; for (const [w, ag] of amounts(k, t)) { const d = Math.abs(ag - g) / g; if (!best || d < best[1]) best = [w, d]; }
    return best && best[1] <= 0.2 ? best[0].replace(/ · \d+ ml$/, '').toLowerCase().replace(/^a /, 'a ') : (K[k].ml ? `${Math.round(g / 1.03)} ml` : `${r1(g)} g`);
  }
  const dishKey = name => String(name || '').toLowerCase().replace(/[(,].*$/, '').replace(/\d+(\.\d+)?/g, ' ').replace(/[^a-z ]+/g, ' ').replace(/\b(cup|cups|katori|bowl|plate|pieces?|slices?|g|ml|small|large|medium|half|one|two|three)\b/g, ' ').replace(/\s+/g, ' ').trim();
  const lastFor = name => { const L = st().ckLast || {}; return L[dishKey(name)] || null; };

  // ---------------- the state of one dish: x.hid (the AI's list), x.ca (the answers: kind → { t, g, w: 's' said, 'e' estimate, 'p' last time })
  function prefill(x) {
    if (x.ca) return;
    const last = lastFor(x.name), ca = {};
    for (const h of x.hid) if (last && last[h.kind]) ca[h.kind] = { t: last[h.kind].t, g: last[h.kind].g, w: 'p' };
    x.ca = ca;
  }
  const answerOf = (x, k) => { const a = x.ca && x.ca[k], h = x.hid.find(y => y.kind === k); return a || (h ? { t: h.type, g: h.grams, w: 'x' } : null); };
  const guessed = a => !a || a.w === 'e' || a.w === 'x';
  const leftOf = list => list.reduce((n, x) => n + x.hid.filter(h => !(x.ca && x.ca[h.kind])).length, 0);
  const leftText = n => `${n ? `${n} not answered yet: ${n === 1 ? 'it is' : 'they are'} counted as the estimate.` : 'All answered.'} Each is its own line in the meal, counted from GymDay’s food list.`;
  const dishes = shot => shot.items.filter(x => x.how === 'n' && Array.isArray(x.hid) && x.hid.length);
  let seq = 0;
  const lidOf = x => x.lid || (x.lid = 'd' + Date.now().toString(36) + (seq++));

  // ---------------- the sheet
  let cur = null;           // { shot, only (a lid or ''), done }
  let painting = false;
  const paint = (html, close) => { painting = true; try { A.openSheet(html, null, () => { if (!painting && close) close(); }); } finally { painting = false; } };
  function rowHtml(x, h) {
    const k = h.kind, a = answerOf(x, k), lid = esc(lidOf(x)), types = T[k], est = a && a.w === 'e', open = !a || a.w === 'x';
    const chip = (act, v, txt, onn, extra) => `<button class="chip ${onn ? 'on' : ''}" data-act="${act}" data-lid="${lid}" data-k="${k}" data-v="${esc(String(v))}"${extra || ''}>${esc(txt)}</button>`;
    let r = `<div class="ck-row" data-k="${k}"><div class="row"><b class="small grow">${K[k].q}</b>${a && a.w === 'p' ? '<span class="xs dim">last time</span>' : ''}</div>`;
    if (types.length > 1) r += `<div class="ck-chips">${types.map(t => chip('ckType', t[0], t[1].replace(/ \(.*\)$/, ''), !open && !est && a.t === t[0] && a.g > 0)).join('')}</div>`;
    if (inGrams()) {
      const v = !open && !est ? (K[k].ml ? Math.round(a.g / 1.03) : r1(a.g)) : '';
      r += `<div class="ck-chips"><label class="ck-g"><input class="input" type="number" inputmode="decimal" min="0" step="any" data-ck="g" data-lid="${lid}" data-k="${k}" value="${v}" placeholder="${K[k].ml ? 'ml' : 'g'}" aria-label="${esc(K[k].q)} in ${K[k].ml ? 'ml' : 'grams'}"><span class="xs muted">${K[k].ml ? 'ml' : 'g'}</span></label>${chip('ckAmt', 0, K[k].none, !open && !est && a.g === 0)}</div>`;
    } else {
      r += `<div class="ck-chips">${amounts(k, a ? a.t : h.type).map(([w, g]) => chip('ckAmt', g, w.replace(/ · \d+ ml$/, ''), !open && !est && a.g > 0 && Math.abs(a.g - g) < 0.01)).join('')}${chip('ckAmt', 0, K[k].none, !open && !est && a.g === 0)}</div>`;
    }
    const tw = typeOf(k, h.type)[1].replace(/ \(.*\)$/, '').toLowerCase();
    r += `<div class="ck-chips">${chip('ckEst', 1, `Estimate · about ${words(k, h.type, h.grams)}${types.length > 1 ? ' ' + tw : ''}`, est)}</div></div>`;
    return r;
  }
  function sheet() {
    const c = cur; if (!c) return;
    const list = dishes(c.shot).filter(x => !c.only || x.lid === c.only);
    if (!list.length) { const d = c.done; cur = null; A.closeSheet(); if (d) d(); return; }
    list.forEach(prefill);
    const left = leftOf(list);
    paint(`<h2>How was it made?</h2><p class="small muted">What the photo can’t show. Tap what you used, or <b>Estimate</b> if you don’t know.</p>
      <div class="set-pills ck-unit mt8" role="radiogroup" aria-label="Amounts in"><label><input type="radio" name="ckUnit" data-bind="ckUnit" value="s" ${inGrams() ? '' : 'checked'}><span>Spoons</span></label><label><input type="radio" name="ckUnit" data-bind="ckUnit" value="g" ${inGrams() ? 'checked' : ''}><span>Grams</span></label></div>
      ${list.map(x => `<div class="card ck-dish" data-lid="${esc(lidOf(x))}" style="background:var(--bg3)"><div class="small" style="font-weight:700">${esc(x.name)}</div>${x.hid.slice().sort((p, q) => ORDER.indexOf(p.kind) - ORDER.indexOf(q.kind)).map(h => rowHtml(x, h)).join('')}</div>`).join('')}
      <p class="xs dim" id="ckLeft">${leftText(left)}</p>
      <button class="btn primary block mt12" data-act="ckDone">Done</button>`, () => finish());
  }
  // answers become lines: each right after its dish, counted from the food list for those grams
  function lines(x) {
    const F = window.Food, out = [], short = String(x.name).replace(/[(,].*$/, '').trim().toLowerCase().slice(0, 24);
    for (const k of ORDER) {
      const h = x.hid.find(y => y.kind === k); if (!h) continue;
      const a = answerOf(x, k); if (!a || !(a.g > 0)) continue;
      const ty = typeOf(k, a.t), fid = ty[2].find(id => F && F.rowById && F.rowById(id)), t = fid && F.valuesAt ? F.valuesAt(fid, a.g) : null;
      const l = { name: `${ty[1]} · ${guessed(a) ? 'about ' : ''}${words(k, a.t, a.g)} (in ${short})`.slice(0, 60), kcal: t ? Math.round(t.v.kcal) : 0, g: r1(a.g), ck: { of: x.lid, k, t: ty[0], w: guessed(a) ? 'e' : 's' } };
      for (const m of ['p', 'c', 'f', 'fib']) l[m] = t ? t.v[m] : 0;
      if (t) { l.fid = t.fid; l.tb = { name: t.name, k: Math.round(t.v.kcal) }; l.pk = 1; }
      l.st = guessed(a) ? 'How it was made · the AI’s estimate' : 'How it was made · your answer';
      out.push(l);
    }
    return out;
  }
  function apply(shot) {
    const C = window.Calories;
    for (const x of dishes(shot)) {
      lidOf(x);
      shot.items = shot.items.filter(y => !(y.ck && y.ck.of === x.lid));
      const at = shot.items.indexOf(x), ls = lines(x).map(l => Object.assign(l, { b: C && C.snap ? C.snap(l) : undefined }));
      shot.items.splice(at + 1, 0, ...ls);
      // remembered for this dish (only what the person said)
      const said = {}; for (const [k, a] of Object.entries(x.ca || {})) if (a && !guessed(a)) said[k] = { t: a.t, g: a.g, w: 's' };
      if (Object.keys(said).length) {
        const L = st().ckLast = Object.assign({}, st().ckLast || {}), key = dishKey(x.name);
        if (key) { delete L[key]; L[key] = said; const ks = Object.keys(L); while (ks.length > 80) delete L[ks.shift()]; }
      }
    }
    S.save(true);
  }
  function finish() {
    const c = cur; if (!c) return; cur = null;
    apply(c.shot); if (c.done) c.done();
  }
  // ---------------- open it: after a photo is read (calories.js), or from a dish's line
  const wants = shot => on() && !!shot && !shot.editId && dishes(shot).some(x => !x.lid || !shot.items.some(y => y.ck && y.ck.of === x.lid));
  async function open(shot, done, only) {
    const F = window.Food; try { if (F && F.loadDb) await F.loadDb(); } catch (e) { /* the list is in the app */ }
    cur = { shot, done, only: only || '' }; sheet();
    const C = window.Calories; if (C && C.keep) C.keep(shot);
  }
  const find = el => { const c = cur; if (!c) return null; const x = c.shot.items.find(y => y.lid === el.dataset.lid); return x ? { x, k: el.dataset.k } : null; };
  const redrawKeep = () => { const p = document.querySelector('#sheet .panel'), y = p ? p.scrollTop : 0; sheet(); const q = document.querySelector('#sheet .panel'); if (q) q.scrollTop = y; };
  ACT.ckType = el => { const f = find(el); if (!f) return; const a = answerOf(f.x, f.k);
    // the same spoons of another kind of fat or sugar weigh a little differently
    const g = a && a.g > 0 && !K[f.k].ml && !K[f.k].g ? a.g / unitG(f.k, a.t) * unitG(f.k, el.dataset.v) : a ? a.g : 0;
    f.x.ca[f.k] = { t: el.dataset.v, g: Math.round(g * 100) / 100, w: 's' }; redrawKeep(); };
  ACT.ckAmt = el => { const f = find(el); if (!f) return; const a = answerOf(f.x, f.k); f.x.ca[f.k] = { t: a ? a.t : (f.x.hid.find(y => y.kind === f.k) || {}).type, g: num(el.dataset.v), w: 's' }; redrawKeep(); };
  ACT.ckEst = el => { const f = find(el); if (!f) return; const h = f.x.hid.find(y => y.kind === f.k); if (!h) return; f.x.ca[f.k] = { t: h.type, g: h.grams, w: 'e' }; redrawKeep(); };
  ACT.ckDone = () => { if (cur) A.closeSheet(); };
  ACT.ckOpen = el => {
    const C = window.Calories, shot = C && C.shot ? C.shot() : null; if (!shot) return;
    const x = shot.items.find(y => y.lid === el.dataset.lid); if (!x) return;
    open(shot, () => { if (C.keep) C.keep(shot); C.shotSheet(); }, x.lid);
  };
  document.addEventListener('change', e => {
    const t = e.target, b = t && t.dataset ? t.dataset.bind : '';
    if (b === 'ckUnit') { st().ckUnit = t.value === 'g' ? 'g' : 's'; S.save(true); if (cur) redrawKeep(); }
    else if (b === 'optCook') { st().ckOn = t.checked; S.save(true); toast(t.checked ? 'Meal photos ask how each dish was made' : 'Meal photos don’t ask how dishes were made'); }
  });
  document.addEventListener('input', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.ck !== 'g' || !cur) return;
    const f = find(t); if (!f) return; const v = num(t.value), a = answerOf(f.x, f.k);
    f.x.ca[f.k] = { t: a ? a.t : (f.x.hid.find(y => y.kind === f.k) || {}).type, g: K[f.k].ml ? r1(v * 1.03) : v, w: 's' };
    const left = document.getElementById('ckLeft'); if (left) left.textContent = leftText(leftOf(dishes(cur.shot).filter(x => !cur.only || x.lid === cur.only)));
  });
  // a dish's line in the meal says how it was made, and opens this again
  function summary(x) {
    const parts = ORDER.filter(k => x.hid.some(h => h.kind === k)).map(k => { const a = answerOf(x, k); if (!a) return ''; const ty = typeOf(k, a.t)[1].replace(/ \(.*\)$/, '').toLowerCase(); return a.g > 0 ? `${guessed(a) ? '~' : ''}${words(k, a.t, a.g)} ${ty}` : K[k].none.toLowerCase(); }).filter(Boolean);
    return parts.join(' · ');
  }
  const chipFor = (x, i) => (Array.isArray(x.hid) && x.hid.length && x.how === 'n' ? `<button class="kc-ck" data-act="ckOpen" data-lid="${esc(lidOf(x))}" data-i="${i}">🧂 How it was made: ${esc(summary(x))} <span class="accent">✎</span></button>` : '');
  // a dish's line taken out: its How-it-was-made lines go with it
  const del0 = ACT.kcRowDel;
  if (del0) ACT.kcRowDel = el => {
    const C = window.Calories, shot = C && C.shot ? C.shot() : null, x = shot && shot.items[+el.dataset.i], lid = x && x.lid;
    del0(el);
    if (lid && shot && shot.items.some(y => y.ck && y.ck.of === lid)) { shot.items = shot.items.filter(y => !(y.ck && y.ck.of === lid)); if (C.rows) C.rows(); }
  };
  // the switch, beside "Meal photos: nutrients first"
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => (window.Calories && window.Calories.on && window.Calories.on() && st().kcNut !== false ? `<div class="row" style="padding:6px 0"><div class="grow">Ask how it was made<div class="xs dim">After a meal photo: the oil or butter, salt, pepper, sugar, milk, sauces, cheese or cream in each dish, with Estimate when you don’t know</div></div><input type="checkbox" data-bind="optCook" ${on() ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  // the server's list for a dish: known kinds, the type the app knows (else the kind's first), grams (milk comes in ml)
  const tidy = list => (Array.isArray(list) ? list : []).filter(h => h && T[h.kind] && num(h.grams) > 0).slice(0, 8)
    .map(h => ({ kind: h.kind, type: typeOf(h.kind, String(h.type || '').toLowerCase())[0], grams: Math.round(num(h.grams) * (K[h.kind].ml ? 1.03 : 1) * 100) / 100 }));
  // what the AI's guesses add up to, for comparing the dish with the food list's version of it (which has them in)
  const hidKcal = hid => (hid || []).reduce((n, h) => { const F = window.Food, ty = typeOf(h.kind, h.type), fid = ty[2].find(id => F && F.rowById && F.rowById(id)), t = fid && F.valuesAt ? F.valuesAt(fid, h.grams) : null; return n + (t ? t.v.kcal : 0); }, 0);
  // a dish's line given the food list's own version of it (which has the usual oil, salt, sugar in): its How-it-was-made lines go
  const use0 = ACT.kcLineUse;
  if (use0) ACT.kcLineUse = el => {
    const C = window.Calories, shot = C && C.shot ? C.shot() : null, x = shot && shot.items[+el.dataset.i];
    use0(el);
    if (x && x.lid && x.how !== 'n' && shot && shot.items.some(y => y.ck && y.ck.of === x.lid)) { shot.items = shot.items.filter(y => !(y.ck && y.ck.of === x.lid)); delete x.hid; delete x.ca; if (C.rows) C.rows(); }
  };
  window.Cook = { on, wants, open, apply, lines, summary, chipFor, tidy, hidKcal,
    T, K, words, dishKey, amounts, cur: () => cur };
})();
