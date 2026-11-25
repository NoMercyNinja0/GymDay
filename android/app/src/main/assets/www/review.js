/* GymDay v1.13: the food overview on the Food tab, worked out by the app from what was logged: what is going well, what is still
   missing (with foods that fit what the person eats), what is over the limit, which foods to cut down, and extras that are easy to
   forget to log. It asks once what the person eats (veg / veg + eggs / non-veg) and how much oil their home cooking uses, and
   (v1.14) how much salt. */
(function () {
  'use strict';
  const A = window.App, S = window.Store, D = S.data, ACT = A.ACT, esc = A.esc;
  const st = () => D.settings;
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const g1 = v => (v >= 10 ? String(Math.round(v)) : String(Math.round(v * 10) / 10));
  const toast = m => (window.toast ? window.toast(m) : null);
  const undoToast = (m, f) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, f) : toast(m));
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, ' ').trim();
  const DIETS = [['veg', 'Vegetarian'], ['egg', 'Vegetarian + eggs'], ['nonveg', 'Non-veg']];
  const OILS = [['less', 'Less oil'], ['usual', 'Usual'], ['more', 'More oil']];
  const DIET_WORD = { veg: 'vegetarian', egg: 'vegetarian with eggs', nonveg: 'non-veg' };
  const OIL_WORD = { less: 'less oil than usual recipes', usual: 'usual amounts of oil', more: 'more oil than usual recipes' };
  const SALTS = [['none', 'No salt'], ['less', 'Less salt'], ['usual', 'Usual'], ['more', 'More salt']];          // v1.21.7: No salt
  const SALT_WORD = { none: 'no salt', less: 'less salt', usual: 'usual salt', more: 'more salt' };
  const redraw = () => { if (A.top().name === 'calories') A.rerender(); };

  // ---------------------------------------------------------------- the two questions, asked once
  const chips = (k, list, cur) => `<div class="row ks-chips" data-k="${k}" data-v="${esc(cur || '')}">${list.map(([v, nm]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="ksPick" data-v="${v}">${nm}</button>`).join('')}</div>`;
  const askBody = () => `<label class="lbl mt8">I eat</label>${chips('diet', DIETS, st().diet)}
    <label class="lbl mt12">My home cooking uses</label>${chips('oil', OILS, st().oil || 'usual')}
    <label class="lbl mt12">Salt in my home cooking</label>${chips('salt', SALTS, st().salt || 'usual')}
    <p class="xs dim mt8">What you eat picks the foods the overview suggests. The oil changes curries, sabzis, dals, biryanis, pulaos, upma, poha and parathas from the food list: about 3 g more fat in 100 g with more oil, up to 2 g less with less.</p>${saltNote}`;
  const saltNote = `<p class="xs dim mt4">The salt changes the sodium of savoury home dishes from the food list (dals, sambar, curries, rice dishes, idli, dosa, parathas): only what the ingredients have with no salt, about 30% less with less salt, about 60% more with more. Food eaten out isn't changed. One dish can have its own salt: tap it on the Food tab.</p>`;
  function askCard() {
    // 1.35.2: one question up front, what you eat; oil and salt start as "usual" and are changed in About me
    if (window.__calm !== false) {
      if (st().diet) return '';
      return `<div class="card rv-ask" id="rvAsk"><div class="k2">What do you eat?</div><p class="xs muted mt4">So the foods GymDay suggests fit you. Oil and salt in your cooking are in About me.</p>${chips('diet', DIETS, '')}<button class="btn primary block mt12" data-act="rvAskSave">Save</button></div>`;
    }
    if (st().diet && st().salt) return '';
    if (st().diet) return `<div class="card rv-ask" id="rvAsk"><div class="k2">One more quick question</div><label class="lbl mt8">Salt in my home cooking</label>${chips('salt', SALTS, 'usual')}${saltNote}<button class="btn primary block mt12" data-act="rvAskSave">Save</button></div>`;
    return `<div class="card rv-ask" id="rvAsk"><div class="k2">First, three quick questions</div>${askBody()}<button class="btn primary block mt12" data-act="rvAskSave">Save</button></div>`;
  }
  const picked = (root, k) => { const r = root && root.querySelector(`.ks-chips[data-k="${k}"]`); return r ? r.dataset.v || '' : ''; };
  function saveAsk(root) {
    const diet = picked(root, 'diet') || st().diet || '', oil = picked(root, 'oil') || st().oil || 'usual', salt = picked(root, 'salt') || st().salt || 'usual';
    if (!DIETS.some(x => x[0] === diet)) { toast('Pick what you eat'); return false; }
    st().diet = diet; st().oil = OILS.some(x => x[0] === oil) ? oil : 'usual'; st().salt = SALTS.some(x => x[0] === salt) ? salt : 'usual';
    const ask = root.querySelector('#rvAskAgain'); if (ask && ask.checked) { delete st().rvNoSugar; delete st().rvNoGhee; }
    S.save(true); return true;
  }
  ACT.rvAskSave = () => { if (saveAsk(document.querySelector('#rvAsk'))) { toast('Saved: you can change these in the overview'); redraw(); } };
  ACT.rvPrefs = () => A.openSheet(`<h2>What you eat</h2>${askBody()}${st().rvNoSugar || st().rvNoGhee ? `<label class="row mt12" style="gap:8px;align-items:center"><input type="checkbox" id="rvAskAgain"><span class="small">Ask again about ${[st().rvNoSugar ? 'sugar in tea and coffee' : '', st().rvNoGhee ? 'ghee on rotis' : ''].filter(Boolean).join(' and ')}</span></label>` : ''}<div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="rvPrefsSave">Save</button></div>`);
  ACT.rvPrefsSave = () => { if (saveAsk(document.querySelector('#sheet'))) { A.closeSheet(); toast('Saved'); redraw(); } };

  // ---------------------------------------------------------------- foods to suggest for what is missing, by what the person eats
  // [name in the food list, grams, how it is said]
  const SUG = {
    p: { veg: [['Paneer (cottage cheese)', 100, 'paneer, 100 g'], ['Soya chunks (textured vegetable protein), dry', 30, 'soya chunks, 30 g dry'], ['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori'], ['Curd (dahi) from toned milk', 150, 'curd, 1 katori'], ['Toned milk (3% fat)', 250, 'milk, 1 glass'], ['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori']],
      egg: [['Egg, whole, boiled or poached', 100, '2 boiled eggs']], nonveg: [['Chicken breast, grilled without sauce, skin not eaten', 100, 'grilled chicken breast, 100 g'], ['Rohu (rui), cooked', 100, 'fish, 100 g']] },
    fib: { veg: [['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori'], ['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori'], ['Guava, raw', 55, '1 guava'], ['Pears, raw', 180, '1 pear'], ['Apple, raw', 165, '1 apple'], ['Chapati/Roti', 86, '2 chapatis']] },
    fe: { veg: [['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori'], ['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori'], ['Spinach, cooked, boiled, drained, without salt', 100, 'cooked spinach, 100 g'], ['Seeds, sesame seeds, whole, dried', 10, 'til, 1 tablespoon'], ['Dates, dried, flesh and skin', 30, '3 dates']],
      egg: [['Egg, whole, boiled or poached', 100, '2 boiled eggs']], nonveg: [['Game meat, goat, cooked, roasted', 100, 'mutton, 100 g']] },
    ca: { veg: [['Toned milk (3% fat)', 250, 'milk, 1 glass'], ['Curd (dahi) from toned milk', 150, 'curd, 1 katori'], ['Paneer (cottage cheese)', 100, 'paneer, 100 g'], ['Seeds, sesame seeds, whole, dried', 10, 'til, 1 tablespoon'], ['Ragi (finger millet, nachni, kezhvaragu, mandua), cooked like rice', 150, 'ragi, 1 katori']] },
    vc: { veg: [['Guava, raw', 55, '1 guava'], ['Orange, raw', 154, '1 orange'], ['Tomatoes, red, ripe, raw, year round average', 100, '1 tomato'], ['Papaya, raw', 150, 'papaya, 1 cup']] },
    va: { veg: [['Carrots, raw', 60, '1 carrot'], ['Papaya, raw', 150, 'papaya, 1 cup'], ['Mango, raw', 165, '1 cup mango'], ['Sweet potato, boiled', 130, '1 sweet potato'], ['Spinach, cooked, boiled, drained, without salt', 100, 'cooked spinach, 100 g']] },
    b12: { veg: [['Toned milk (3% fat)', 250, 'milk, 1 glass'], ['Curd (dahi) from toned milk', 150, 'curd, 1 katori'], ['Paneer (cottage cheese)', 100, 'paneer, 100 g']],
      egg: [['Egg, whole, boiled or poached', 100, '2 boiled eggs']], nonveg: [['Rohu (rui), cooked', 100, 'fish, 100 g'], ['Game meat, goat, cooked, roasted', 100, 'mutton, 100 g']] },
    vd: { veg: [['Toned milk (3% fat)', 250, 'milk, 1 glass (fortified milk has more)']], egg: [['Egg, whole, boiled or poached', 100, '2 boiled eggs']], nonveg: [['Fish, mackerel, baked or broiled', 100, 'mackerel, 100 g']] },
    b9: { veg: [['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori'], ['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori'], ['Spinach, cooked, boiled, drained, without salt', 100, 'cooked spinach, 100 g'], ['Dal tadka (moong dal)', 150, 'moong dal, 1 katori']] },
    mg: { veg: [['Almonds', 15, '10 almonds'], ['Pumpkin seeds', 15, 'pumpkin seeds, 1 tablespoon'], ['Banana, raw', 126, '1 banana'], ['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori']] },
    zn: { veg: [['Pumpkin seeds', 15, 'pumpkin seeds, 1 tablespoon'], ['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori'], ['Cashews', 15, '10 cashews'], ['Paneer (cottage cheese)', 100, 'paneer, 100 g']],
      nonveg: [['Game meat, goat, cooked, roasted', 100, 'mutton, 100 g']] },
    k: { veg: [['Banana, raw', 126, '1 banana'], ['Coconut water, unsweetened', 240, 'coconut water, 1 glass'], ['Potato, boiled', 150, '1 potato'], ['Rajma (kidney beans), cooked plain', 150, 'rajma, 1 katori']] },
    al: { veg: [['Flax seeds', 10, 'flax seeds, 1 tablespoon'], ['Chia seeds', 10, 'chia seeds, 1 tablespoon'], ['Nuts, walnuts, english', 15, '4 walnut halves']] },
    b3: { veg: [['Peanuts', 30, 'peanuts, a handful (30 g)'], ['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori']],
      nonveg: [['Chicken breast, grilled without sauce, skin not eaten', 100, 'grilled chicken breast, 100 g'], ['Rohu (rui), cooked', 100, 'fish, 100 g']] },
    b6: { veg: [['Banana, raw', 126, '1 banana'], ['Kabuli chana (white chickpeas), cooked plain', 150, 'chana, 1 katori'], ['Potato, boiled', 150, '1 potato'], ['Peanuts', 30, 'peanuts, a handful (30 g)']],
      nonveg: [['Chicken breast, grilled without sauce, skin not eaten', 100, 'grilled chicken breast, 100 g']] },
    o3: { veg: [], nonveg: [['Sardine (mathi, chaala, tarli, pedvey), cooked', 100, 'sardines, 100 g'], ['Fish, mackerel, baked or broiled', 100, 'mackerel, 100 g']] },
  };
  const NOTE = { io: 'Iodised salt is the main source, and food lists rarely count it: use iodised salt at home.', vd: 'Sunlight on your arms and face for 15 to 30 minutes most days is the main source; few foods have much.', b12: 'Vegetarians often fall short of B12: ask a doctor whether you need a supplement.', o3: 'Plant omega-3 (flax, chia, walnuts) counts too.' };
  function suggest(k) {
    const F = window.Food, SP = window.Supps, diet = st().diet || 'veg', set = SUG[k]; if (!set || !F || !F.byName) return [];
    const list = (set.veg || []).concat(diet !== 'veg' ? set.egg || [] : [], diet === 'nonveg' ? set.nonveg || [] : []);
    const out = [];
    for (const [nm, g, say] of (diet === 'nonveg' ? list.slice().reverse() : list)) {
      const x = F.byName(nm); if (!x) continue;
      let v = 0;
      if (k === 'p' || k === 'fib' || k === 'kcal') v = num(x[k === 'fib' ? 'fib' : k]) * g / 100;
      else { const r = SP && SP.rowOf ? SP.rowOf(x.id) : null, i = SP && SP.KEYS ? SP.KEYS.indexOf(k) : -1; v = r && i >= 0 && r[i] != null ? r[i] * g / 100 : 0; }
      if (v > 0) out.push({ say, v, id: x.id, g });
      if (out.length >= 3) break;
    }
    return out;
  }

  // ---------------------------------------------------------------- swaps for foods that go over a limit
  const SWAPS = [
    [/\b(jamun|jamen|jambu|gulab|jalebi|halwa|ladoo|laddu|burfi|barfi|rasgulla|rasmalai|kheer|payasam|mithai|sweet|cake|pastry|brownie|ice cream|kulfi|chocolate|dessert|doughnut|donut)\b/i, 'fruit, or one small piece instead of several'],
    [/\b(samosa|pakora|pakoda|bhaji|bhajji|vada|bonda|kachori|chips|fries|namkeen|bhujia|mixture|puri|poori|bhatura|bhature|nuggets|fried)\b/i, 'roasted chana, makhana or a steamed snack such as idli or dhokla'],
    [/\b(cola|soda|soft drink|juice|frooti|maaza|cold drink|energy drink|milkshake|shake|frappe|iced tea)\b/i, 'buttermilk, nimbu pani without sugar or plain water'],
    [/\b(biscuit|cookie|rusk|khari|toast)\b/i, 'a handful of nuts or a fruit'],
    [/\b(butter chicken|makhani|malai|korma|cream|paneer butter|shahi)\b/i, 'a dal, a dry sabzi or a tomato-onion curry'],
    [/\b(pizza|burger|sandwich|roll|wrap|noodles|pasta|maggi)\b/i, 'a home-style thali: dal, sabzi, roti or rice'],
    [/\b(pickle|achar|papad|chutney|sauce|ketchup)\b/i, 'a smaller spoonful'],
    [/\b(chai|tea|coffee)\b/i, 'less sugar in each cup'],
  ];
  const swapFor = name => { for (const [re, s] of SWAPS) if (re.test(name)) return s; return ''; };

  // ---------------------------------------------------------------- the overview of one day, or of the last 7 days
  // span 1: the day t0 (today counts as "so far" before 8 pm); span 7: an average logged day of the 7 days to t0
  function look(t0, span) {
    const C = window.Calories, F = window.Food, SP = window.Supps; if (!C || !F || !SP) return null;
    const days = []; let t = t0; for (let i = 0; i < span; i++) { days.unshift(C.dayOf(t)); t = C.prevDay(t); }
    const logged = days.filter(d => d.food.length), n = logged.length; if (!n) return { empty: true, span };
    const today0 = (() => { const x = new Date(); x.setHours(0, 0, 0, 0); return x.getTime(); })();
    const partial = span === 1 && t0 === today0 && (window.__rvHour != null ? window.__rvHour : new Date().getHours()) < 20;       // __rvHour: tests
    const tg = F.targets(t0), L = F.limitsFor(tg), avg = k => logged.reduce((a, d) => a + (d[k] || 0), 0) / n;
    const eat = { kcal: avg('eaten'), p: avg('protein'), c: avg('carbs'), f: avg('fat'), fib: avg('fibre') };
    const ready = SP.ready && SP.ready();
    const keys = logged.map(d => SP.keyOf(d.t0));
    const ex = keys.map(k => SP.dayExtra(k)), dd = ready ? keys.map(k => SP.dayData(k)) : [];
    const lim = { sg: ex.reduce((a, x) => a + x.sg, 0) / n, sf: ex.reduce((a, x) => a + x.sf, 0) / n, salt: ready ? dd.reduce((a, x) => a + ((x.tot || {}).na || 0), 0) / n * 2.5 / 1000 : null };
    const nofig = ex.reduce((a, x) => a + (x.foods - Math.min(x.nsg, x.nsf)), 0);
    const good = [], miss = [], over = [], cut = [], easy = [];
    const sofar = partial ? ' so far' : '', week = span > 1;
    // calories
    if (tg) {
      const r = eat.kcal / tg.kcal, gain = tg.goal === 'gain', lose = tg.goal === 'lose';
      if (r > (gain ? 1.15 : 1.1)) over.push({ k: 'kcal', h: 'Calories over your target', t: `${n0(eat.kcal)} of ${n0(tg.kcal)} kcal${week ? ' a day' : ''}: ${n0(eat.kcal - tg.kcal)} over.` });
      else if (!partial && Math.abs(r - 1) <= 0.1) good.push({ h: 'Calories on target', t: `${n0(eat.kcal)} of ${n0(tg.kcal)} kcal${week ? ' a day, on average' : ''}.` });
      else if (!partial && r < (lose ? 0.75 : 0.85)) {
        const young = C.ageNow && C.ageNow() && C.ageNow() < 18;
        miss.push({ k: 'kcal', h: 'Well under your calorie target', t: `${n0(eat.kcal)} of ${n0(tg.kcal)} kcal${week ? ' a day' : ''}: ${n0(tg.kcal - eat.kcal)} short.${young ? ' A growing body needs enough food: try to get close to your target.' : lose ? ' Eating far below your target is hard to keep up and can cost muscle.' : ''} If you ate more than you logged, add it, so the numbers stay true.` });
      } else if (partial && r < 1) miss.push({ k: 'kcal', soft: true, h: 'Calories left today', t: `${n0(tg.kcal - eat.kcal)} kcal to your target of ${n0(tg.kcal)}.` });
    }
    // protein and fibre
    if (tg) {
      for (const [k, nm, gl, ml] of [['p', 'Protein', 0.95, 0.8], ['fib', 'Fibre', 0.9, 0.75]]) {
        const v = eat[k], tv = tg[k]; if (!(tv > 0)) continue;
        if (v >= tv * gl) good.push({ h: `${nm} reached`, t: `${g1(v)} of ${tv} g${week ? ' a day' : ''}.` });
        else if (partial || v < tv * ml) miss.push({ k, soft: partial, h: partial ? `${nm} still to go` : `Low on ${nm.toLowerCase()}`, t: `${g1(v)} of ${tv} g${week ? ' a day' : sofar}: ${g1(tv - v)} g to go.`, sug: suggest(k), unit: 'g' });
      }
      if (!partial && eat.f > tg.f * 1.15) over.push({ k: 'f', h: 'Fat over your target', t: `${g1(eat.f)} of ${tg.f} g${week ? ' a day' : ''}.` });
      if (!partial && eat.c > tg.c * 1.2) over.push({ k: 'c', h: 'Carbs over your target', t: `${g1(eat.c)} of ${tg.c} g${week ? ' a day' : ''}.` });
    }
    // sugars, saturated fat and salt
    const lims = [['sg', 'Sugars', lim.sg, L.sg], ['sf', 'Saturated fat', lim.sf, L.sf], ['salt', 'Salt', lim.salt, L.salt]];
    let under = 0;
    for (const [k, nm, v, l] of lims) {
      if (v == null) continue;
      if (v > l) over.push({ k, h: `${nm} over the limit`, t: `${g1(v)} of ${l} g${week ? ' a day' : ''}${sofar}.` }); else under++;
    }
    if (!partial && under === 3) good.push({ h: 'Under the limits', t: `Sugars, saturated fat and salt.${nofig ? ` ${nofig === 1 ? 'One food has' : nofig + ' foods have'} no number for sugars or saturated fat, so the real totals can be higher.` : ''}` });
    // vitamins and minerals (once the list of them is open)
    let low = [];
    if (ready) {
      const N = SP.myNeeds(), gaps = {}, nf = dd.reduce((a, x) => a + x.foods, 0); for (const d of dd) for (const k in d.gaps) gaps[k] = (gaps[k] || 0) + d.gaps[k];
      const sum = {}; for (const d of dd) for (const k in d.tot) sum[k] = (sum[k] || 0) + d.tot[k] / n;
      const supp = {}; for (const d of dd) for (const k in d.supp) supp[k] = (supp[k] || 0) + d.supp[k] / n;
      const avgD = { tot: sum, supp, food: {} };
      // v1.15: omega-3 is one need, as on the Vitamins page (plant or fish / algae, whichever is nearer its need)
      const ss = (SP.rowsOf ? SP.rowsOf(avgD, N) : SP.KEYS.map(k => SP.standing(k, avgD, N))).filter(s => s.need > 0 && s.k !== 'na');
      const met = ss.filter(s => s.pct >= 100), nm = s => (s.k === 'omega' ? 'Omega-3' : nameOf(s.k));
      if (!partial && met.length >= 3) good.push({ h: `${met.length} of ${ss.length} vitamins and minerals met`, t: met.slice(0, 6).map(nm).join(', ') + (met.length > 6 ? ' and more.' : '.') });
      // a nutrient most of the foods have no number for would look low when it isn't (iodine, which comes with salt, most of all)
      const sure = k => (k === 'omega' ? sure('al') || sure('o3') : !(nf > 0 && (gaps[k] || 0) > nf / 2) && !(k === 'io' && !(sum.io > 0)));
      low = partial ? [] : ss.filter(s => s.pct < 50 && sure(s.k)).sort((a, b) => a.pct - b.pct).slice(0, 4);
      const diet = st().diet || 'veg';
      for (const s of low) {
        if (s.k === 'omega') { miss.push({ k: s.use, h: 'Low on omega-3', t: `${s.pct}% of what you need${week ? ' a day' : ''}. Plant omega-3 (flax, chia, walnuts) or fish once or twice a week both count.`, sug: (diet === 'nonveg' ? suggest('o3').map(x => Object.assign(x, { unit: unitOf('o3') })) : []).concat(suggest('al').map(x => Object.assign(x, { unit: unitOf('al') }))).slice(0, 3), unit: unitOf(s.use), micro: true, omega: true }); continue; }
        miss.push({ k: s.k, h: `Low on ${lowName(s.k)}`, t: `${s.pct}% of what you need${week ? ' a day' : ''}.${NOTE[s.k] ? ' ' + NOTE[s.k] : ''}`, sug: suggest(s.k), unit: unitOf(s.k), micro: true });
      }
      for (const s of SP.KEYS.map(k => SP.standing(k, avgD, N)).filter(s => s.over || s.hi)) over.push({ k: s.k, h: `${nameOf(s.k)} above the safe limit`, t: `Mostly from ${s.scope === 'supp' ? 'supplements' : 'what you ate'}: check the doses on the Supplements page.` });
    }
    // what to cut down: the foods behind each thing that is over
    const ent = []; for (const d of logged) for (const e of d.food) ent.push(e);
    const byName = (vals) => {                                                   // [{ name, v, q, n }] largest first, the same food added up
      const m = new Map();
      for (const x of vals) { const k = fold(x.name); const y = m.get(k) || { name: x.name, v: 0, n: 0, q: 0, kcal: 0 }; y.v += x.v; y.n++; y.q += num(x.q); y.kcal += num(x.kcal); m.set(k, y); }
      return [...m.values()].sort((a, b) => b.v - a.v);
    };
    const kcalOf = e => num(e.kcal);
    for (const o of over) {
      let vals = null, unit = 'g', what = '';
      if (o.k === 'kcal') { vals = ent.map(e => ({ name: e.name, v: kcalOf(e), q: e.q, kcal: e.kcal })); unit = 'kcal'; what = 'calories'; }
      else if (o.k === 'f') { vals = ent.map(e => ({ name: e.name, v: num(e.f), q: e.q, kcal: e.kcal })); what = 'fat'; }
      else if (o.k === 'c') { vals = ent.map(e => ({ name: e.name, v: num(e.c), q: e.q, kcal: e.kcal })); what = 'carbs'; }
      else if (o.k === 'sg' || o.k === 'sf') { vals = [].concat(...ex.map(x => x.by[o.k])).map(x => ({ name: x.name, v: x.v, q: (ent.find(e => e.id === x.id) || {}).q, kcal: (ent.find(e => e.id === x.id) || {}).kcal })); what = o.k === 'sg' ? 'sugars' : 'saturated fat'; }
      else if (o.k === 'salt') { vals = [].concat(...dd.map(d => (d.by.na || []).map(x => ({ name: x.name, v: x.v * 2.5 / 1000 })))); what = 'salt'; }
      if (!vals) continue;
      const tot = vals.reduce((a, x) => a + x.v, 0); if (!(tot > 0)) continue;
      const top = byName(vals).filter(x => x.v > 0).slice(0, 2).filter((x, i) => i === 0 || x.v / tot >= 0.2);       // a second food only when it adds a fifth
      o.from = top.map(x => x.name);
      for (const x of top) {
        if (cut.some(c => fold(c.name) === fold(x.name))) { const c = cut.find(c => fold(c.name) === fold(x.name)); c.why.push(`${unit === 'kcal' ? n0(x.v / n) + ' kcal' : g1(x.v / n) + ' g ' + what}`); continue; }
        const share = Math.round(x.v / tot * 100), sw = swapFor(x.name);
        const half = !week && x.q >= 2 ? `Having half saves about ${n0(x.kcal / 2)} kcal.` : '';
        cut.push({ name: x.name, why: [`${unit === 'kcal' ? n0(x.v / n) + ' kcal' : g1(x.v / n) + ' g ' + what}${week ? ' a day' : ''} (${share}% of the ${what})`], times: week ? x.n : 0, half, swap: sw });
      }
    }
    // easy to miss: sugar in tea or coffee, ghee on rotis (a single day only)
    if (span === 1) {
      const d = logged[0], has = re => d.food.some(e => re.test(e.name));
      const plainTea = d.food.filter(e => /\b(chai|tea|coffee)\b/i.test(e.name) && !/sugar|sweet|latte|mocha|frapp|cold|shake|iced|green/i.test(e.name) && num(e.kcal) < 60);
      if (plainTea.length && !st().rvNoSugar && !has(/^sugar\b/i)) easy.push({ h: `Sugar in your ${/coffee/i.test(plainTea[0].name) ? 'coffee' : 'chai'}?`, t: `${plainTea.length === 1 ? 'It was' : `${plainTea.length} cups were`} logged without sugar. A teaspoon is about 20 kcal.`, add: 'sugar', meal: plainTea[0].meal || '', n: plainTea.length });
      const rotis = d.food.filter(e => /\b(chapati|roti|phulka|rotli|bhakri)\b/i.test(e.name) && !/butter|ghee|paratha|naan/i.test(e.name));
      if (rotis.length && !st().rvNoGhee && !has(/\b(ghee|butter)\b/i)) easy.push({ h: 'Ghee or butter on your rotis?', t: 'A teaspoon of ghee is about 45 kcal and is easy to forget.', add: 'ghee', meal: rotis[0].meal || '', n: 1 });
    }
    return { span, n, partial, tg, eat, lim, L, good, miss, over, cut, easy, ready, low };
  }
  const nameOf = k => { const x = (window.SUPPDATA ? window.SUPPDATA.NUTS : []).find(y => y[0] === k); return x ? x[1] : k; };
  const lowName = k => nameOf(k).replace(/^(?!Vitamin)(\w)/, c => c.toLowerCase());
  const unitOf = k => { const x = (window.SUPPDATA ? window.SUPPDATA.NUTS : []).find(y => y[0] === k); return x ? x[2] : ''; };
  const amt = (v, u) => (u === 'mcg' || u === 'mg' ? `${g1(v)} ${u}` : `${g1(v)} ${u || 'g'}`);

  // ---------------------------------------------------------------- on the Food tab
  let span = 1, loading = false;
  function card(d) {
    const F = window.Food, SP = window.Supps; if (!F || !F.targets || !F.targets(d.t0)) return '';
    if (SP && SP.ready && !SP.ready() && !loading && D.food.length) { loading = true; SP.loadMicro().then(() => { loading = false; redraw(); }).catch(() => { loading = false; }); }
    const o = look(d.t0, span);
    const head = `<div class="row"><div class="k2 grow">Overview</div><div class="rv-span"><button class="chip ${span === 1 ? 'on' : ''}" data-act="rvSpan" data-n="1">${d.t0 === new Date().setHours(0, 0, 0, 0) ? 'Today' : 'That day'}</button><button class="chip ${span === 7 ? 'on' : ''}" data-act="rvSpan" data-n="7">7 days</button></div></div>`;
    if (!o || o.empty) return `<div class="card" id="rvCard">${head}<p class="small muted mt8">Log your food and this shows what is going well, what is missing and what to cut down.</p></div>`;
    const lines = [];
    const named = o.over.length && o.over[0].from && o.over[0].from.length ? o.over[0].from[0] : '';
    if (o.over.length) lines.push(['warn', '⚠', `${o.over[0].h}${named ? `: mostly ${named}` : ''}`]);
    const cuts = o.cut.filter(c => c.name !== named);                              // the card doesn't name the same food twice
    if (cuts.length) lines.push(['cut', '✂', `Cut down: ${cuts.slice(0, 2).map(c => c.name).join(', ')}`]);
    const ms = o.miss.filter(m => !m.micro), mm = o.miss.filter(m => m.micro);
    if (ms.length) lines.push(['miss', '↓', ms.map(m => m.h).slice(0, 2).join(' · ')]);
    if (o.easy.length) lines.push(['easy', '+', o.easy[0].h]);
    if (mm.length) lines.push(['miss', '↓', `Low on ${mm.map(m => m.h.replace(/^Low on /, '')).join(', ')}`]);
    if (o.good.length) lines.push(['good', '✓', o.good.map(g => g.h).slice(0, 2).join(' · ')]);
    return `<div class="card tap" id="rvCard" data-act="rvOpen">${head}<div class="rv-lines mt8">${lines.slice(0, 4).map(([c, i, t]) => `<div class="rv-l ${c}"><span class="rv-i">${i}</span><span class="small">${esc(t)}</span></div>`).join('')}</div>
      <div class="row mt8"><span class="xs muted grow">${o.partial ? 'So far today' : span > 1 ? `An average day of the ${o.n} with food logged` : ''}</span><span class="xs accent">Full overview ›</span></div></div>`;
  }
  ACT.rvSpan = (el, ev) => { if (ev && ev.stopPropagation) ev.stopPropagation(); span = +el.dataset.n === 7 ? 7 : 1; redraw(); };

  // ---------------------------------------------------------------- the full overview
  function sheet() {
    const C = window.Calories, t0 = C && C.day ? C.day() : new Date().setHours(0, 0, 0, 0), o = look(t0, span);
    if (!o || o.empty) { A.openSheet(`<h2>Overview</h2><p class="small muted">Nothing logged ${span > 1 ? 'in these 7 days' : 'that day'} yet.</p><button class="btn block mt12" data-act="closeSheet">Close</button>`); return; }
    const sec = (title, cls, items) => (items.length ? `<div class="rv-sec ${cls}"><div class="kc-sec">${title}</div>${items.join('')}</div>` : '');
    const row = (h, t, extra) => `<div class="rv-row"><b>${esc(h)}</b><span class="small">${esc(t)}</span>${extra || ''}</div>`;
    const sugHtml = m => (m.sug && m.sug.length ? `<div class="rv-sug">${m.sug.map(s => `<span class="rv-chip">${esc(s.say)}<b>+${amt(s.v, s.unit || m.unit)}</b></span>`).join('')}</div>` : '');
    const goods = o.good.map(g => row(g.h, g.t));
    const misses = o.miss.map(m => row(m.h, m.t, sugHtml(m)));
    const overs = o.over.map(x => row(x.h, x.t + (x.from && x.from.length ? ` Mostly ${x.from.join(' and ')}.` : '')));
    const cuts = o.cut.map(c => row(c.name, `${c.why.join(' · ')}.${c.times > 1 ? ` Eaten ${c.times} times.` : ''}${c.half ? ' ' + c.half : ''}${c.swap ? ` Instead: ${c.swap}.` : ''}`));
    const easies = o.easy.map((e, i) => row(e.h, e.t, `<div class="row mt4" style="gap:8px;flex-wrap:wrap"><button class="btn sm" data-act="rvAdd" data-i="${i}">+ Add ${e.add === 'sugar' ? (e.n > 1 ? `${e.n} teaspoons of sugar` : 'a teaspoon of sugar') : 'a teaspoon of ghee'}</button><button class="btn sm ghost" data-act="rvNever" data-i="${i}">${e.add === 'sugar' ? "I don't take sugar" : "I don't add any"}</button></div>`));
    rvEasy = o.easy;
    const diet = DIET_WORD[st().diet] ? `You eat: ${DIET_WORD[st().diet]} · home cooking: ${OIL_WORD[st().oil || 'usual']}, ${SALT_WORD[st().salt || 'usual']}` : 'Tell GymDay what you eat for better suggestions';
    A.openSheet(`<h2>Overview</h2><div class="row mb8" style="gap:8px"><button class="chip ${span === 1 ? 'on' : ''}" data-act="rvSheetSpan" data-n="1">${o.partial ? 'Today so far' : 'That day'}</button><button class="chip ${span === 7 ? 'on' : ''}" data-act="rvSheetSpan" data-n="7">7 days</button></div>
      <p class="xs muted">${span > 1 ? `An average day of the ${o.n} with food logged in the last 7 days.` : o.partial ? 'The day is not over: what is missing is what is still to go.' : 'Everything logged that day.'} Against your daily limits${o.tg ? ` (${n0(o.tg.kcal)} kcal, ${o.tg.p} g protein)` : ''}.</p>
      ${sec('Over the limit', 'warn', overs)}${sec('Cut down', 'cut', cuts)}${sec(o.partial ? 'Still to go' : 'Missing', 'miss', misses)}${sec('Going well', 'good', goods)}${sec('Easy to forget', 'easy', easies)}
      ${!o.ready ? '<p class="xs dim mt8"><span class="kc-spin"></span> Adding up vitamins and minerals…</p>' : ''}
      <p class="xs dim mt12">${esc(diet)}. <span class="accent" data-act="rvPrefs">Change</span></p>
      <p class="xs dim mt4">Worked out by the app from what you logged: a guide over days and weeks, not exact for one meal. Suggestions are everyday foods with the most of what is missing for their size.</p>
      <button class="btn block mt12" data-act="closeSheet">Close</button>`);
    if (!o.ready && window.Supps) window.Supps.loadMicro().then(() => { if (document.querySelector('#sheet .rv-sec, #sheet .kc-spin')) sheet(); }).catch(() => { });
  }
  let rvEasy = [];
  ACT.rvOpen = () => sheet();
  ACT.rvSheetSpan = el => { span = +el.dataset.n === 7 ? 7 : 1; sheet(); redraw(); };
  // one tap: the forgotten extra, in the same meal
  ACT.rvAdd = el => {
    const e = rvEasy[+el.dataset.i], F = window.Food, C = window.Calories; if (!e || !F) return;
    F.loadDb().then(() => {
      const x = F.byName(e.add === 'sugar' ? 'Sugars, granulated' : 'Ghee, butter'); if (!x) { toast("That food isn't in the list"); return; }
      const f = F.dbFood(x), gi = Math.max(0, f.units.findIndex(u => u.gram)), meal = e.meal || F.mealAt(Date.now());
      const t0 = C && C.day ? C.day() : new Date().setHours(0, 0, 0, 0), en = F.entryOf(f, 5 * (e.n || 1), gi, meal, F.stampMeal(meal, t0));
      en.name = e.add === 'sugar' ? `Sugar, ${e.n > 1 ? e.n + ' teaspoons' : '1 teaspoon'}` : 'Ghee, 1 teaspoon';
      D.food.push(en); S.save(true); A.closeSheet(); redraw();
      undoToast(`${en.name} added · ${n0(en.kcal)} kcal`, () => { D.food = D.food.filter(y => y.id !== en.id); S.save(true); redraw(); });
    });
  };

  // "I don't take sugar" / "I don't add any": stop asking (Change in the overview's What you eat brings it back)
  ACT.rvNever = el => {
    const e = rvEasy[+el.dataset.i]; if (!e) return;
    const k = e.add === 'sugar' ? 'rvNoSugar' : 'rvNoGhee'; st()[k] = true; S.save(true); sheet(); redraw();
    undoToast("OK, it won't ask again", () => { delete st()[k]; S.save(true); redraw(); });
  };
  window.Review = { askCard, card, look, suggest };
})();
