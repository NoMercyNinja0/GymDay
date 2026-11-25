/* GymDay v1.20 – three quicker ways to log Indian meals, all ending in the same list of lines a meal photo gives (each line a food
   of the food list with its grams, every number the food list's, each one changeable before saving):
     Type it   "2 rotis, 1 katori dal, rice 1 cup, curd" (or the 🎤, in English, Hindi or Tamil) is split into lines and matched
     Thali     a South Indian, North Indian, Gujarati, Bengali or Maharashtrian thali: tick what was on the plate, set how much
     Plan      tomorrow's meals, made from everyday Indian meals to fit the day's calories and protein, swapped meal by meal,
               then logged with one tap when it is eaten. */
(function () {
  const A = window.App, S = window.Store, D = S.data;
  const { $, esc, ACT } = A;
  const toast = m => window.toast(m);
  const F = () => window.Food, C = () => window.Calories;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const r1 = v => Math.round((v || 0) * 10) / 10;
  const MEALS = [['b', 'Breakfast'], ['ms', 'Morning snack'], ['l', 'Lunch'], ['es', 'Evening snack'], ['d', 'Dinner']];
  const mealNow = () => { const h = new Date().getHours(); return h < 11 ? 'b' : h < 12 ? 'ms' : h < 16 ? 'l' : h < 19 ? 'es' : 'd'; };
  const chips = (act, cur) => `<div class="kc-meals" role="group" aria-label="Meal">${MEALS.map(([k, nm]) => `<button class="chip ${cur === k ? 'on' : ''}" data-act="${act}" data-v="${k}">${nm}</button>`).join('')}</div>`;
  const pick = (el, key, o) => { if (!o) return; o[key] = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };

  // =====================================================================================================
  // Type it
  // =====================================================================================================
  // Hindi and Tamil food words (as the 🎤 writes them) in the words the food list uses
  const WORDS = { 'रोटी': 'roti', 'रोटियां': 'roti', 'रोटियाँ': 'roti', 'चपाती': 'chapati', 'दाल': 'dal', 'चावल': 'rice', 'सब्ज़ी': 'sabzi', 'सब्जी': 'sabzi', 'पनीर': 'paneer', 'दही': 'curd',
    'अंडा': 'egg', 'अंडे': 'eggs', 'दूध': 'milk', 'चाय': 'tea', 'कॉफी': 'coffee', 'कॉफ़ी': 'coffee', 'इडली': 'idli', 'डोसा': 'dosa', 'पोहा': 'poha', 'उपमा': 'upma', 'पराठा': 'paratha', 'परांठा': 'paratha',
    'राजमा': 'rajma', 'छोले': 'chole', 'आलू': 'aloo', 'खिचड़ी': 'khichdi', 'बिरयानी': 'biryani', 'चिकन': 'chicken', 'मछली': 'fish', 'केला': 'banana', 'केले': 'banana', 'सेब': 'apple', 'आम': 'mango',
    'कटोरी': 'katori', 'गिलास': 'glass', 'कप': 'cup', 'प्लेट': 'plate', 'आधा': 'half', 'आधी': 'half', 'सांभर': 'sambar', 'सलाद': 'salad', 'रायता': 'raita', 'लस्सी': 'lassi', 'छाछ': 'chaas',
    'சாதம்': 'rice', 'சோறு': 'rice', 'இட்லி': 'idli', 'தோசை': 'dosa', 'சாம்பார்': 'sambar', 'ரசம்': 'rasam', 'தயிர்': 'curd', 'பொங்கல்': 'pongal', 'சப்பாத்தி': 'chapati', 'பரோட்டா': 'parotta',
    'முட்டை': 'egg', 'கோழி': 'chicken', 'சிக்கன்': 'chicken', 'மீன்': 'fish', 'வாழைப்பழம்': 'banana', 'காபி': 'coffee', 'டீ': 'tea', 'பால்': 'milk', 'பருப்பு': 'dal', 'கூட்டு': 'kootu',
    'பொரியல்': 'poriyal', 'வடை': 'vada', 'உப்புமா': 'upma', 'பூரி': 'puri', 'கப்': 'cup', 'கிண்ணம்': 'katori', 'மோர்': 'buttermilk', 'அரை': 'half' };
  // the typed text -> one line per food: "2 rotis", "1 katori dal", "rice 1 cup"
  function splitMeal(text) {
    let t = String(text || '');
    const V = window.Voice;
    if (V && V.tokens && /[ऀ-ॿ஀-௿]/.test(t)) t = t.split(/\s*[,،;\n]\s*|\s+(?:और|மற்றும்)\s+/).map(part => V.tokens(part).map(x => (x.num ? String(x.v) : WORDS[x.w] || x.w)).join(' ')).join(', ');
    return t.split(/\s*[,;\n]+\s*|\s+(?:and|aur|plus|&)\s+|\s*\+\s*/i).map(s => s.replace(/^(i (had|ate)|ate|had)\s+/i, '').trim()).filter(s => s.length > 1).slice(0, 12);
  }
  let typed = null;     // { text, meal }
  function typeSheet() {
    const o = typed, V = window.Voice;
    A.openSheet(`<h2>Type what you ate</h2>${chips('mlTypeMeal', o.meal)}
      <div class="row ml-type mt8"><textarea class="input grow" id="mlTypeIn" rows="3" placeholder="2 rotis, 1 katori dal, rice 1 cup, curd" autocapitalize="off">${esc(o.text || '')}</textarea>${V ? V.micFor('mlTypeIn') : ''}</div>
      <p class="xs dim mt4">Separate foods with commas. Amounts help: 2 rotis, 1 katori, 1 cup, half plate, 150 g. ${V && V.can() ? 'The 🎤 understands English, Hindi and Tamil.' : ''}</p>
      <div class="row mt8 ml-ex" style="gap:6px;flex-wrap:wrap">${['2 idli, 1 katori sambar, filter coffee', '3 rotis, dal tadka, aloo sabzi, curd', '1 plate chicken biryani, raita'].map(x => `<button class="chip" data-act="mlTypeEx" data-v="${esc(x)}">${esc(x)}</button>`).join('')}</div>
      <div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="mlTypeGo">Work it out</button></div>`,
      s => { const i = s.querySelector('#mlTypeIn'); i.addEventListener('input', () => { if (typed) typed.text = i.value; }); if (!o.text) setTimeout(() => i.focus(), 250); }, () => { });
  }
  ACT.kcType = el => { typed = { text: '', meal: (el && el.dataset && el.dataset.meal) || (F() && F().mealFor ? F().mealFor() : mealNow()) }; typeSheet(); };
  ACT.mlTypeMeal = el => pick(el, 'meal', typed);
  ACT.mlTypeEx = el => { const i = $('#mlTypeIn'); if (i && typed) { i.value = typed.text = el.dataset.v; i.focus(); } };
  ACT.mlTypeGo = () => {
    const o = typed; if (!o) return; const i = $('#mlTypeIn'); if (i) o.text = i.value;
    const lines = splitMeal(o.text); if (!lines.length) { toast('Type what you ate first'); return; }
    typed = null;
    C().linesSheet({ items: lines.map(name => ({ name })), meal: o.meal, note: 'Each food was matched to the food list with the amount you typed (or its usual portion). Tap “Check this” where it guessed.' });
  };

  // =====================================================================================================
  // Thali
  // =====================================================================================================
  // [food id, what it is on the plate, how many, unit, grams in one, on the plate unless unticked]
  const THALI = [
    ['si', 'South Indian meals', [['g33043b4b0', 'Rice', 1.5, 'cup', 160, 1], ['iASC167', 'Sambar', 1, 'katori', 150, 1], ['iBFP176', 'Rasam', 1, 'katori', 150, 1], ['g4be45ccb4', 'Poriyal (beans)', 1, 'katori', 100, 1],
      ['iASC219', 'Avial / kootu', 1, 'katori', 120, 1], ['gabe0bd384', 'Curd', 1, 'katori', 150, 1], ['s168106', 'Appalam', 1, 'piece', 12, 1], ['iASC509', 'Pickle', 1, 'tsp', 10, 0],
      ['iASC285', 'Payasam', 1, 'katori', 150, 0], ['gb3fff370e', 'Buttermilk (mor)', 1, 'glass', 255, 0], ['iASC240', 'Chicken curry', 1, 'katori', 150, 0]]],
    ['ni', 'North Indian thali', [['iASC096', 'Roti', 2, 'roti', 43, 1], ['g5d7ac9da9', 'Dal tadka', 1, 'katori', 150, 1], ['u2710067', 'Sabzi', 1, 'katori', 150, 1], ['gf0c16a07c', 'Jeera rice', 1, 'katori', 120, 1],
      ['k17-832', 'Raita', 1, 'katori', 100, 1], ['u2709784', 'Salad (cucumber)', 1, 'serving', 60, 1], ['iASC215', 'Palak paneer', 1, 'katori', 150, 0], ['s168106', 'Papad', 1, 'piece', 12, 0],
      ['iASC509', 'Pickle', 1, 'tsp', 10, 0], ['iASC282', 'Kheer', 1, 'katori', 150, 0], ['iASC240', 'Chicken curry', 1, 'katori', 150, 0]]],
    ['gu', 'Gujarati thali', [['iASC096', 'Rotli', 3, 'rotli', 31, 1], ['g0ce250aa1', 'Dal', 1, 'katori', 150, 1], ['iBFP239', 'Shaak (potato)', 1, 'katori', 150, 1], ['u2708403', 'Rice', 1, 'katori', 120, 1],
      ['iBFP439', 'Khaman dhokla', 2, 'piece', 33, 1], ['gb3fff370e', 'Chaas', 1, 'glass', 255, 1], ['s168106', 'Papad', 1, 'piece', 12, 1], ['p8901262040013', 'Shrikhand', 1, 'katori', 100, 0]]],
    ['bn', 'Bengali thali', [['u2708403', 'Rice', 1.5, 'cup', 163, 1], ['g016e76e54', 'Masoor dal', 1, 'katori', 150, 1], ['g72e843da6', 'Macher jhol', 1, 'katori', 150, 1], ['iASC177', 'Begun bharta', 1, 'katori', 120, 1],
      ['iBFP239', 'Aloo (potato curry)', 1, 'katori', 120, 0], ['p8906059638329', 'Mishti doi', 1, 'cup', 80, 0], ['iBFP392', 'Rasgulla', 1, 'piece', 50, 0]]],
    ['mh', 'Maharashtrian thali', [['g5e1694689', 'Jowar bhakri', 1, 'bhakri', 60, 1], ['iASC096', 'Chapati', 1, 'chapati', 43, 1], ['g0c4d502c8', 'Varan (toor dal)', 1, 'katori', 150, 1], ['iBFP269', 'Bhaji (bhindi)', 1, 'katori', 120, 1],
      ['g3b8f641eb', 'Usal (matki)', 1, 'katori', 150, 1], ['u2708403', 'Rice', 1, 'katori', 120, 1], ['u2709784', 'Koshimbir (cucumber)', 1, 'serving', 60, 1], ['s168106', 'Papad', 1, 'piece', 12, 0],
      ['iASC467', 'Puran poli', 1, 'piece', 61, 0], ['g1641bc84f', 'Malvani chicken curry', 1, 'katori', 150, 0]]]
  ];
  const plural = (n, u) => (n <= 1 || ['katori', 'tsp'].includes(u) ? u : /(s|sh|ch|x)$/.test(u) ? u + 'es' : u + 's');
  const qText = (q, u) => `${q === 0.5 ? '½' : q % 1 === 0.5 ? `${Math.floor(q)}½` : q} ${plural(q, u)}`;
  const kcalOf = (fid, g) => { const t = F() && F().valuesAt ? F().valuesAt(fid, g) : null; return t ? t.v : null; };
  let th = null;        // { k, meal, rows: [{ fid, nm, q, u, g, on }] }
  function thaliSheet() {
    const o = th, T = THALI.find(x => x[0] === o.k) || THALI[0];
    let kc = 0, p = 0;
    const rows = o.rows.map((r, i) => {
      const v = kcalOf(r.fid, r.q * r.g); if (r.on && v) { kc += v.kcal; p += v.p; }
      return `<div class="ml-row ${r.on ? '' : 'off'}"><input type="checkbox" data-act="mlThOn" data-i="${i}" ${r.on ? 'checked' : ''} aria-label="${esc(r.nm)} on the plate"><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${esc(r.nm)}</div><div class="xs muted">${v ? n0(v.kcal) + ' kcal · P ' + r1(v.p) + ' g' : ''}</div></div>
        <div class="ml-step"><button class="ib" data-act="mlThQ" data-i="${i}" data-d="-1" aria-label="Less">−</button><span>${qText(r.q, r.u)}</span><button class="ib" data-act="mlThQ" data-i="${i}" data-d="1" aria-label="More">+</button></div></div>`;
    }).join('');
    A.openSheet(`<h2>Thali</h2><div class="row ml-kinds" style="gap:6px;flex-wrap:wrap">${THALI.map(([k, nm]) => `<button class="chip ${o.k === k ? 'on' : ''}" data-act="mlThKind" data-v="${k}">${nm}</button>`).join('')}</div>
      ${chips('mlThMeal', o.meal)}<p class="xs dim mt8">Tick what was on your plate and how much of it. Refills count: tap + for each one.</p>
      <div class="ml-rows">${rows}</div>
      <div class="row mt12"><div class="grow small">${esc(T[1])}</div><b>${n0(kc)} kcal</b><span class="xs muted" style="margin-left:8px">P ${r1(p)} g</span></div>
      <div class="row mt12"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="mlThGo" ${o.rows.some(r => r.on) ? '' : 'disabled'}>Check and save</button></div>`);
  }
  function thaliOpen(k, meal) {
    const T = THALI.find(x => x[0] === k) || THALI[0];
    th = { k: T[0], meal, rows: T[2].map(([fid, nm, q, u, g, on]) => ({ fid, nm, q, u, g, on: !!on })) };
    const go = () => { if (th) thaliSheet(); };
    if (F() && F().dbReady && !F().dbReady()) F().loadDb().then(go, go); else go();
  }
  ACT.kcThali = el => thaliOpen((D.settings.thali || 'si'), (el && el.dataset && el.dataset.meal) || (F() && F().mealFor ? F().mealFor() : mealNow()));
  ACT.mlThKind = el => { if (!th) return; D.settings.thali = el.dataset.v; S.save(); thaliOpen(el.dataset.v, th.meal); };
  ACT.mlThMeal = el => pick(el, 'meal', th);
  ACT.mlThOn = el => { const r = th && th.rows[+el.dataset.i]; if (!r) return; r.on = !r.on; thaliSheet(); };
  ACT.mlThQ = el => {
    const r = th && th.rows[+el.dataset.i]; if (!r) return;
    const step = ['katori', 'cup', 'glass'].includes(r.u) ? 0.5 : 1, n = Math.round((r.q + step * (+el.dataset.d)) * 2) / 2;
    if (n <= 0) { r.on = false; } else { r.q = Math.min(10, n); r.on = true; }
    thaliSheet();
  };
  ACT.mlThGo = () => {
    const o = th; if (!o) return; const T = THALI.find(x => x[0] === o.k) || THALI[0];
    const items = o.rows.filter(r => r.on).map(r => ({ name: `${r.nm}, ${qText(r.q, r.u)}`, fid: r.fid, g: Math.round(r.q * r.g) }));
    th = null;
    C().linesSheet({ items, meal: o.meal, title: T[1], note: 'Every number is the food list’s for the amount you set. Change a line or its grams if your plate was different.' });
  };

  // =====================================================================================================
  // Tomorrow's meals
  // =====================================================================================================
  // everyday Indian meals: [diet ('v' veg, 'e' with egg, 'n' with meat or fish), [[food id, name, how many, unit, grams in one], ...]]
  const OPTS = {
    b: [['v', [['u2708346', 'Idli', 3, 'idli', 38], ['iASC167', 'Sambar', 1, 'katori', 150]]],
      ['v', [['iBFP045', 'Vegetable poha', 1.5, 'katori', 150], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['iOSR100', 'Besan chilla', 2, 'chilla', 52], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['u2708489', 'Oats (cooked in milk)', 1, 'katori', 50], ['u2705385', 'Milk', 1, 'glass', 250], ['u2709224', 'Banana', 1, 'banana', 126]]],
      ['v', [['iBFP148', 'Plain dosa', 2, 'dosa', 65], ['iASC167', 'Sambar', 1, 'katori', 150]]],
      ['v', [['iBFP043', 'Vegetable upma', 1.5, 'katori', 150], ['u2705385', 'Milk', 1, 'glass', 250]]],
      ['e', [['gdb030de54', 'Masala omelette (2 eggs)', 1, 'omelette', 140], ['iASC096', 'Chapati', 2, 'chapati', 43]]],
      ['e', [['g06a1d517f', 'Egg bhurji (2 eggs)', 1, 'katori', 130], ['iASC096', 'Chapati', 2, 'chapati', 43]]]],
    l: [['v', [['g33043b4b0', 'Rice', 1.5, 'cup', 160], ['iASC167', 'Sambar', 1, 'katori', 150], ['g4be45ccb4', 'Beans poriyal', 1, 'katori', 100], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['iASC096', 'Chapati', 3, 'chapati', 43], ['g5d7ac9da9', 'Dal tadka', 1, 'katori', 150], ['u2710067', 'Vegetable curry', 1, 'katori', 150], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['iASC165', 'Rajma curry', 1.5, 'katori', 150], ['gf0c16a07c', 'Jeera rice', 1.5, 'katori', 120], ['u2709784', 'Cucumber salad', 1, 'serving', 60]]],
      ['v', [['iASC215', 'Palak paneer', 1, 'katori', 150], ['iASC096', 'Chapati', 3, 'chapati', 43], ['g5d7ac9da9', 'Dal tadka', 1, 'katori', 150]]],
      ['e', [['iBFP240', 'Egg curry', 1, 'katori', 150], ['g33043b4b0', 'Rice', 1, 'cup', 160], ['g5d7ac9da9', 'Dal tadka', 1, 'katori', 150]]],
      ['n', [['iASC240', 'Chicken curry', 1, 'katori', 150], ['g33043b4b0', 'Rice', 1.5, 'cup', 160], ['u2709784', 'Cucumber salad', 1, 'serving', 60]]],
      ['n', [['g1edf8e708', 'Chicken biryani', 1, 'plate', 300], ['k17-832', 'Raita', 1, 'katori', 100]]],
      ['n', [['iASC246', 'Fish curry', 1, 'katori', 150], ['g33043b4b0', 'Rice', 1.5, 'cup', 160], ['g4be45ccb4', 'Beans poriyal', 1, 'katori', 100]]]],
    es: [['v', [['g7d44822a8', 'Roasted chana', 1, 'handful', 30], ['u2709224', 'Banana', 1, 'banana', 126]]],
      ['v', [['g09d23a6af', 'Sprouts chaat', 1, 'bowl', 100], ['gb3fff370e', 'Buttermilk', 1, 'glass', 255]]],
      ['v', [['u2705385', 'Milk', 1, 'glass', 250], ['u2709215', 'Apple', 1, 'apple', 200]]],
      ['v', [['gabe0bd384', 'Curd', 1, 'katori', 150], ['u2709224', 'Banana', 1, 'banana', 126]]],
      ['v', [['g19be69e06', 'Boiled peanuts', 1, 'handful', 30], ['u2709215', 'Apple', 1, 'apple', 200]]],
      ['e', [['u2707154', 'Boiled eggs', 2, 'egg', 50], ['u2709224', 'Banana', 1, 'banana', 126]]]],
    d: [['v', [['iASC096', 'Chapati', 2, 'chapati', 43], ['iASC226', 'Kadhai paneer', 1, 'katori', 150], ['u2709784', 'Cucumber salad', 1, 'serving', 60]]],
      ['v', [['iBFP576', 'Khichdi', 1.5, 'katori', 150], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['iBFP148', 'Plain dosa', 2, 'dosa', 65], ['iASC167', 'Sambar', 1, 'katori', 150], ['gabe0bd384', 'Curd', 1, 'katori', 150]]],
      ['v', [['gb5d2b1667', 'Moong dal', 1, 'katori', 150], ['g33043b4b0', 'Rice', 1, 'cup', 160], ['u2710067', 'Vegetable curry', 1, 'katori', 150]]],
      ['e', [['g06a1d517f', 'Egg bhurji (2 eggs)', 1, 'katori', 130], ['iASC096', 'Chapati', 2, 'chapati', 43], ['g5d7ac9da9', 'Dal tadka', 1, 'katori', 150]]],
      ['n', [['iASC241', 'Tandoori chicken', 1, 'serving', 150], ['iASC096', 'Chapati', 2, 'chapati', 43], ['u2709784', 'Cucumber salad', 1, 'serving', 60]]],
      ['n', [['g8d369252f', 'Fish fry', 2, 'piece', 70], ['g33043b4b0', 'Rice', 1, 'cup', 160], ['iBFP176', 'Rasam', 1, 'katori', 150]]]]
  };
  const SHARE = { b: 0.25, l: 0.35, es: 0.12, d: 0.28 };
  // what you eat is kept as 'veg' / 'egg' / 'nonveg', the same words the Food tab and the review use (1.30: the plan used to save
  // 'v' / 'e' / 'n' there, which the review then showed as "undefined"); the meal lists keep their one-letter marks
  const DIETS = [['veg', 'Veg'], ['egg', 'Veg + eggs'], ['nonveg', 'Non-veg']];
  const CODE = { veg: 'v', egg: 'e', nonveg: 'n', v: 'v', e: 'e', n: 'n' }, LONG = { v: 'veg', e: 'egg', n: 'nonveg' };
  const longDiet = x => LONG[x] || (CODE[x] ? x : 'veg');
  const fits = (diet, d) => { const c = CODE[diet] || 'v'; return c === 'n' || d === 'v' || (c === 'e' && d === 'e'); };
  const countable = u => !['katori', 'cup', 'glass', 'bowl', 'serving', 'plate'].includes(u);
  const pad2 = n => String(n).padStart(2, '0');
  const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`; };
  const tomorrow0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() + 1); return d.getTime(); };
  // one meal at about `kcal`: the option's amounts scaled (0.6 to 1.6 times), whole pieces for rotis, idlis and eggs, half katoris
  function sized(opt, kcal) {
    const items = opt[1].map(([fid, nm, q, u, g]) => ({ fid, nm, q, u, g }));
    const base = items.reduce((a, x) => a + ((kcalOf(x.fid, x.q * x.g) || {}).kcal || 0), 0);
    const k = base > 0 ? Math.max(0.6, Math.min(1.6, kcal / base)) : 1;
    items.forEach(x => { x.q = countable(x.u) ? Math.max(1, Math.round(x.q * k)) : Math.max(0.5, Math.round(x.q * k * 2) / 2); });
    return items;
  }
  const sum = items => items.reduce((a, x) => { const v = kcalOf(x.fid, x.q * x.g) || {}; a.kcal += v.kcal || 0; a.p += v.p || 0; return a; }, { kcal: 0, p: 0 });
  // the plan: for each meal the option that fits the diet, picked by the seed (Swap moves one on), sized to its share of the day;
  // short of protein, the evening snack becomes the one with the most protein
  function makePlan(diet, tg, seed) {
    const plan = { day: keyOf(tomorrow0()), diet, kcal: tg.kcal, p: tg.p, meals: {} };
    for (const m of ['b', 'l', 'es', 'd']) {
      const list = OPTS[m].map((o, i) => [o, i]).filter(([o]) => fits(diet, o[0])), n = list.length;
      const at = ((seed[m] || 0) % n + n) % n, [opt, i] = list[at];
      plan.meals[m] = { i, items: sized(opt, tg.kcal * SHARE[m]) };
    }
    const tot = () => ['b', 'l', 'es', 'd'].reduce((a, m) => { const s = sum(plan.meals[m].items); a.kcal += s.kcal; a.p += s.p; return a; }, { kcal: 0, p: 0 });
    if (tot().p < tg.p - 10 && !(seed.es > 0)) {
      const best = OPTS.es.map((o, i) => [o, i]).filter(([o]) => fits(diet, o[0])).map(([o, i]) => ({ i, items: sized(o, tg.kcal * SHARE.es) })).sort((a, b) => sum(b.items).p - sum(a.items).p)[0];
      if (best) plan.meals.es = best;
    }
    const t = tot(); plan.got = { kcal: Math.round(t.kcal), p: Math.round(t.p) };
    return plan;
  }
  // "Idli × 3", "Banana × 2", "Rajma curry, 2½ katori", "Milk, 1½ glasses"
  const itemsText = items => items.map(x => (countable(x.u) && !['piece', 'handful', 'tsp'].includes(x.u) ? (x.q === 1 ? x.nm : `${x.nm} × ${x.q}`) : `${x.nm}, ${qText(x.q, x.u)}`)).join(' · ');
  let pl = null;        // { diet, seed: { b, l, es, d }, plan }
  function planSheet() {
    const o = pl, tg = F().targets(tomorrow0()); if (!tg) { toast('Set your daily target first'); return; }
    o.plan = makePlan(o.diet, tg, o.seed);
    const P = o.plan, d = new Date(tomorrow0());
    const card = m => { const x = P.meals[m], s = sum(x.items), nm = (MEALS.find(z => z[0] === m) || [])[1];
      return `<div class="ml-meal"><div class="row"><div class="grow"><b>${nm}</b> <span class="xs muted">· ${n0(s.kcal)} kcal · P ${Math.round(s.p)} g</span></div><button class="btn sm" data-act="mlPlSwap" data-m="${m}" aria-label="Another ${esc(nm).toLowerCase()}">↻ Swap</button></div><div class="small mt4">${esc(itemsText(x.items))}</div></div>`; };
    const okK = Math.abs(P.got.kcal - tg.kcal) <= tg.kcal * 0.1, okP = P.got.p >= tg.p - 10;
    A.openSheet(`<h2>Tomorrow's meals</h2><div class="xs muted">${d.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' })} · made to fit ${n0(tg.kcal)} kcal and ${Math.round(tg.p)} g protein</div>
      <div class="row mt12" style="gap:6px;flex-wrap:wrap">${DIETS.map(([k, nm]) => `<button class="chip ${o.diet === k ? 'on' : ''}" data-act="mlPlDiet" data-v="${k}">${nm}</button>`).join('')}</div>
      ${['b', 'l', 'es', 'd'].map(card).join('')}
      <div class="ml-tot mt12"><span class="grow">The day</span><b class="${okK ? '' : 'accent'}">${n0(P.got.kcal)} kcal</b><b class="${okP ? 'green' : 'accent'}" style="margin-left:12px">P ${P.got.p} g</b></div>
      ${okP ? '' : `<p class="xs dim mt4">Still ${Math.round(tg.p - P.got.p)} g short of protein: add curd, milk, paneer, eggs or a dal to a meal${longDiet(o.diet) === 'veg' ? ', or try Veg + eggs' : ''}.</p>`}
      <p class="xs dim mt8">Everyday Indian meals, sized to your day. Swap any meal you don't fancy. Tomorrow the Food tab shows the plan, and each meal is logged with one tap (and changed first if you ate a little differently).</p>
      <div class="row mt16"><button class="btn" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="mlPlSave">Save the plan</button></div>`);
  }
  ACT.mlPlan = () => { const old = D.mealPlan && D.mealPlan.day === keyOf(tomorrow0()) ? D.mealPlan : null; pl = { diet: longDiet(D.settings.diet || (old && old.diet) || 'veg'), seed: old && old.seed ? Object.assign({}, old.seed) : { b: new Date().getDate(), l: new Date().getDate() + 1, es: 0, d: new Date().getDate() + 2 } };
    const go = () => { if (pl) planSheet(); }; if (F() && F().dbReady && !F().dbReady()) F().loadDb().then(go, go); else go(); };
  ACT.mlPlDiet = el => { if (!pl) return; pl.diet = D.settings.diet = el.dataset.v; S.save(); planSheet(); };
  ACT.mlPlSwap = el => { if (!pl) return; const m = el.dataset.m; pl.seed[m] = (pl.seed[m] || 0) + 1; planSheet(); };
  ACT.mlPlSave = () => {
    const o = pl; if (!o || !o.plan) return;
    D.mealPlan = { day: o.plan.day, diet: o.diet, seed: o.seed, meals: {}, at: Date.now() };
    for (const m of ['b', 'l', 'es', 'd']) D.mealPlan.meals[m] = o.plan.meals[m].items.map(x => [x.fid, x.nm, x.q, x.u, x.g]);
    S.save(true); pl = null; A.closeSheet(); toast("Tomorrow's meals are planned"); if (A.top().name === 'calories') A.rerender();
  };
  // on the Food tab: today's plan with Log buttons, or the button to plan tomorrow
  function card(t0) {
    const tg = F() && F().targets ? F().targets(t0) : null, today = keyOf(Date.now()), day = keyOf(t0), P = D.mealPlan;
    if (P && P.day === day && P.meals) {
      const logged = new Set((P.done || []));
      return `<div class="card ml-card"><div class="row"><div class="grow"><div class="k2">${day === today ? "Today's plan" : 'The plan for this day'}</div></div>${day === today ? `<button class="btn sm" data-act="mlPlan">Plan tomorrow</button>` : ''}</div>
        ${['b', 'l', 'es', 'd'].map(m => { const its = (P.meals[m] || []).map(([fid, nm, q, u, g]) => ({ fid, nm, q, u, g })); if (!its.length) return ''; const s = sum(its), nm = (MEALS.find(z => z[0] === m) || [])[1];
          return `<div class="ml-meal"><div class="row"><div class="grow"><b>${nm}</b> <span class="xs muted">· ${n0(s.kcal)} kcal · P ${Math.round(s.p)} g</span></div>${logged.has(m) ? '<span class="pill green" style="margin:0">Logged ✓</span>' : `<button class="btn sm primary" data-act="mlPlLog" data-m="${m}">Log it</button>`}</div><div class="small mt4">${esc(itemsText(its))}</div></div>`; }).join('')}</div>`;
    }
    if (day !== today || !tg) return '';
    return `<button class="btn block ml-planbtn" data-act="mlPlan">📅 Plan tomorrow's meals</button>`;
  }
  ACT.mlPlLog = el => {
    const P = D.mealPlan, m = el.dataset.m; if (!P || !P.meals || !P.meals[m]) return;
    const nm = (MEALS.find(z => z[0] === m) || [])[1];
    C().linesSheet({ items: P.meals[m].map(([fid, n, q, u, g]) => ({ name: `${n}, ${qText(q, u)}`, fid, g: Math.round(q * g) })), meal: m, title: `${nm} (your plan)`, note: 'From your plan. Change anything you ate differently, then save.',
      saved: () => { P.done = [...new Set([...(P.done || []), m])]; S.save(true); } });
  };
  window.Meals = { splitMeal, THALI, OPTS, makePlan, card, sized, sum, qText, WORDS };
})();
