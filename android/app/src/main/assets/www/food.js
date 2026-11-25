/* GymDay – the food diary (v1.8).
   About 21,000 foods from open food tables (USDA, the Indian Nutrient Databank, the UK's McCance and Widdowson's,
   Australia's AUSNUT 2023, the FAO's West African table and, from v1.19, ICMR-NIN's IFCT 2017), plus about 580 versions of everyday foods made different ways
   (v1.8.1: rice by variety, rotis by flour, dals by pulse, milk by fat, fish by Indian name, regional biryanis and curries,
   millets), each worked out from those tables with a note saying how,
   each with calories, protein, carbs, fat and fibre and its own ways of measuring it: katori, cup, piece, slice, bowl,
   grams, ounces and more. Food goes into the day's meals; a meal can be repeated or copied, foods can be kept as
   favourites, My foods and My recipes; a packet's barcode is looked up in Open Food Facts; and protein powder,
   creatine and other supplements are pinned at the top so one tap logs a serving.
   Daily targets come from a goal (lose a little, keep, gain) and the everyday-burn estimate, with safe limits, or are typed. */
(function () {
  const A = window.App, S = window.Store, D = S.data, C = window.Calories;
  if (!A || !C) return;
  const { $, esc, ACT } = A;
  const toast = m => window.toast(m);
  const undoToast = (m, undo) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, undo) : toast(m));
  const st = () => D.settings;
  const DAY = 86400000;
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const r1 = v => Math.round((v || 0) * 10) / 10;
  const g1 = v => (v >= 10 ? String(Math.round(v)) : String(r1(v)));
  const FR = [[0.25, '¼'], [0.5, '½'], [0.75, '¾'], [0.333, '⅓'], [0.667, '⅔']];
  // 1.5 → "1½", 0.25 → "¼", 2 → "2", 2.4 → "2.4"
  function fmtQ(q) {
    q = Math.round(q * 1000) / 1000; const w = Math.floor(q), fr = q - w;
    if (fr < 0.01) return String(w);
    const m = FR.find(f => Math.abs(f[0] - fr) < 0.01); if (m) return (w || '') + m[1];
    return String(Math.round(q * 100) / 100);
  }
  for (const k of ['food', 'myFoods', 'recipes', 'supps']) if (!Array.isArray(D[k])) D[k] = [];
  const NUT = ['kcal', 'p', 'c', 'f', 'fib', 'cr'];
  const zero = () => ({ kcal: 0, p: 0, c: 0, f: 0, fib: 0, cr: 0 });
  const times = (b, k) => { const o = {}; for (const n of NUT) o[n] = (b[n] || 0) * k; return o; };
  // 1.35.2 (build 59): adding food, more accurate and easier. The search puts the everyday food a word means first (as Type it
  // and the photo reader count it), an amount can be typed with the food ("2 roti", "100 g paneer"), a food starts at an amount
  // people eat (a teaspoon of sugar, 10 almonds, 100 g of chicken, not a cup), and the amount screen's quick amounts fit the
  // measure (rotis 1-4, grams 50-250). window.__calm === false keeps the old ways for the tests of older versions.
  const NW = () => window.__calm !== false;

  // =====================================================================================================
  // Meals
  // =====================================================================================================
  const MEALS = [['b', 'Breakfast', 8], ['ms', 'Morning snack', 11], ['l', 'Lunch', 13], ['es', 'Evening snack', 17], ['d', 'Dinner', 20]];
  const MEAL_NAME = {}; MEALS.forEach(m => { MEAL_NAME[m[0]] = m[1]; });
  function mealAt(t) { const d = new Date(t), m = d.getHours() * 60 + d.getMinutes(); return m < 240 ? 'd' : m < 630 ? 'b' : m < 720 ? 'ms' : m < 930 ? 'l' : m < 1140 ? 'es' : 'd'; }
  const mealOf = f => (MEAL_NAME[f.meal] ? f.meal : mealAt(f.t));
  const day0 = () => (C.day ? C.day() : (() => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); })());
  const isToday = t0 => { const d = new Date(); d.setHours(0, 0, 0, 0); return t0 === d.getTime(); };
  // the moment an entry gets: now for today, otherwise the meal's usual time on the day being looked at
  function stampMeal(meal, t0) {
    t0 = t0 == null ? day0() : t0;
    if (isToday(t0) && (mealAt(Date.now()) === meal || !meal)) return Date.now();
    const m = MEALS.find(x => x[0] === meal) || MEALS[2], d = new Date(t0); d.setHours(m[2], 0, 0, 0);
    return isToday(t0) && d.getTime() > Date.now() ? Date.now() : d.getTime();
  }
  const mealNow = () => (isToday(day0()) ? mealAt(Date.now()) : 'l');
  const redraw = () => { const t = A.top().name; if (t === 'calories' || t === 'days' || t === 'settings' || t === 'setPage') A.rerender(); };

  // =====================================================================================================
  // The food list: foods.js (about 2 MB) is loaded the first time it is needed
  // =====================================================================================================
  let DB = null, dbWait = null;
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
  function prep(raw) {
    const list = raw.f.map(r => ({ id: r[0], name: r[1], cu: r[2], kcal: r[3], p: r[4], c: r[5], f: r[6], fib: r[7], ps: r[8], src: r[9], gr: r[10], pop: r[11] === 1, note: r[12] || '', cr: r[13] || 0, key: ' ' + fold(r[1]) }));
    const byId = new Map(); list.forEach(x => byId.set(x.id, x));
    return { list, byId, cu: raw.cu || [], gr: raw.gr || [], srcs: raw.src || [], bc: raw.bc || {}, out: raw.out || null };
  }
  function loadDb() {
    if (DB) return Promise.resolve(DB);
    if (window.FOODDB) { DB = prep(window.FOODDB); return Promise.resolve(DB); }
    if (!dbWait) dbWait = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'foods.js'; s.async = true;
      s.onload = () => { try { DB = prep(window.FOODDB); res(DB); } catch (e) { dbWait = null; rej(e); } };
      s.onerror = () => { dbWait = null; s.remove(); rej(new Error("The food list couldn't be opened")); };
      document.head.appendChild(s);
    });
    return dbWait;
  }
  // Words people use for the same food. A search word matches the start of any word in a food's name.
  const SYN = {
    curd: ['curd', 'yogurt', 'yoghurt', 'dahi'], dahi: ['dahi', 'curd', 'yogurt'], yoghurt: ['yogurt', 'yoghurt', 'curd'],
    brinjal: ['brinjal', 'eggplant', 'aubergine', 'baingan'], baingan: ['baingan', 'brinjal', 'eggplant'], aubergine: ['aubergine', 'eggplant', 'brinjal'], eggplant: ['eggplant', 'aubergine', 'brinjal'],
    bhindi: ['bhindi', 'okra', 'ladies finger'], okra: ['okra', 'bhindi'], capsicum: ['capsicum', 'bell pepper', 'sweet pepper', 'peppers sweet'],
    coriander: ['coriander', 'cilantro'], cilantro: ['cilantro', 'coriander'], courgette: ['courgette', 'zucchini'], zucchini: ['zucchini', 'courgette'],
    prawn: ['prawn', 'shrimp'], prawns: ['prawn', 'shrimp'], shrimp: ['shrimp', 'prawn'], mutton: ['mutton', 'lamb', 'goat'], goat: ['goat', 'mutton'],
    groundnut: ['groundnut', 'peanut'], groundnuts: ['groundnut', 'peanut'], chapati: ['chapati', 'chapatti', 'roti', 'phulka'], chapatti: ['chapati', 'chapatti', 'roti'], roti: ['roti', 'chapati', 'chapatti'], phulka: ['phulka', 'chapati', 'roti'],
    maize: ['maize', 'corn'], biscuit: ['biscuit', 'cookie'], biscuits: ['biscuit', 'cookie'], cookie: ['cookie', 'biscuit'], keema: ['keema', 'minced', 'mince', 'ground'], mince: ['mince', 'minced', 'ground', 'keema'],
    aloo: ['aloo', 'alu', 'potato'], alu: ['alu', 'aloo', 'potato'], gobi: ['gobi', 'gobhi', 'cauliflower'], gobhi: ['gobhi', 'gobi', 'cauliflower'], palak: ['palak', 'spinach'], methi: ['methi', 'fenugreek'],
    chana: ['chana', 'channa', 'chole', 'chickpea', 'garbanzo'], chole: ['chole', 'chana', 'chickpea'], chickpea: ['chickpea', 'chana', 'garbanzo'],
    dal: ['dal', 'dhal', 'daal', 'dahl', 'lentil'], dhal: ['dhal', 'dal', 'daal', 'lentil'], daal: ['daal', 'dal', 'dhal', 'lentil'], lentil: ['lentil', 'dal', 'dhal'],
    paneer: ['paneer', 'cottage cheese'], atta: ['atta', 'whole wheat flour', 'wheat flour'], maida: ['maida', 'flour, white', 'all purpose flour', 'wheat flour'],
    besan: ['besan', 'gram flour', 'chickpea flour'], sooji: ['sooji', 'suji', 'rava', 'semolina'], suji: ['suji', 'sooji', 'rava', 'semolina'], rava: ['rava', 'suji', 'semolina'], semolina: ['semolina', 'suji', 'rava'],
    poha: ['poha', 'flattened rice', 'chiwda'], sabudana: ['sabudana', 'tapioca', 'sago'], makhana: ['makhana', 'lotus seed', 'fox nut'], jaggery: ['jaggery', 'gur'],
    crisps: ['crisps', 'chips'], mb: ['muscleblaze'], twt: ['whole truth'], gsw: ['gold standard'], fries: ['fries', 'french fries', 'chips'], soda: ['soda', 'soft drink', 'cola', 'carbonated'], coke: ['cola', 'coke'], cola: ['cola', 'coke'],
    oats: ['oats', 'oat', 'oatmeal', 'porridge'], porridge: ['porridge', 'oatmeal', 'oats'], whey: ['whey', 'protein powder'], omelet: ['omelet', 'omelette', 'omlet'], omelette: ['omelette', 'omelet', 'omlet'],
    yogurt: ['yogurt', 'yoghurt', 'curd'], doughnut: ['doughnut', 'donut'], donut: ['donut', 'doughnut'], kebab: ['kebab', 'kabob', 'kebob', 'kabab'], kabab: ['kabab', 'kebab'],
    biryani: ['biryani', 'biriyani', 'biriani'], biriyani: ['biriyani', 'biryani'], idly: ['idly', 'idli'], idli: ['idli', 'idly'], dosa: ['dosa', 'dosai'], momo: ['momo', 'dumpling'], momos: ['momos', 'momo', 'dumpling'],
    egg: ['egg'], eggs: ['egg'], chips: ['chips', 'crisps', 'fries'], ladoo: ['ladoo', 'laddu', 'laddoo'], laddu: ['laddu', 'ladoo'],
    rajma: ['rajma', 'rajmah', 'kidney bean'], protein: ['protein', 'whey'], makhani: ['makhani', 'butter'], kheer: ['kheer', 'rice pudding', 'payasam'], payasam: ['payasam', 'kheer'],
    noodles: ['noodles', 'noodle', 'chow mein', 'lo mein', 'ramen'], shake: ['shake', 'milkshake', 'smoothie'], juice: ['juice'], salad: ['salad', 'raita', 'kachumber'],
    shawarma: ['shawarma', 'kebab wrap', 'doner', 'gyro'], chai: ['chai', 'tea'], tikka: ['tikka', 'tandoori', 'shaslik'], paratha: ['paratha', 'parantha', 'parotta'], parantha: ['parantha', 'paratha'],
    maggi: ['maggi', 'instant noodles', 'noodles, instant', 'ramen'], bhature: ['bhature', 'bhatura'], bhatura: ['bhatura', 'bhature'], dumpling: ['dumpling', 'momo', 'dim sim', 'gyoza', 'wonton'],
    // v1.8.1: the names of the food versions (rice, millets, pulses, fish) in Indian languages
    ragi: ['ragi', 'finger millet', 'nachni'], nachni: ['nachni', 'ragi'], kezhvaragu: ['kezhvaragu', 'ragi'], mandua: ['mandua', 'ragi'],
    jowar: ['jowar', 'sorghum', 'jola'], jola: ['jola', 'jowar'], jolada: ['jolada', 'jowar'], cholam: ['cholam', 'jowar', 'sorghum'], sorghum: ['sorghum', 'jowar'],
    bajra: ['bajra', 'bajre', 'pearl millet'], bajre: ['bajre', 'bajra'], kambu: ['kambu', 'bajra', 'pearl millet'], sajje: ['sajje', 'bajra'],
    thinai: ['thinai', 'foxtail'], kangni: ['kangni', 'foxtail'], navane: ['navane', 'foxtail'], varagu: ['varagu', 'kodo'], kodra: ['kodra', 'kodo'],
    samai: ['samai', 'little millet'], kutki: ['kutki', 'little millet'], kuthiraivali: ['kuthiraivali', 'barnyard'], sanwa: ['sanwa', 'barnyard'], jhangora: ['jhangora', 'barnyard'],
    panivaragu: ['panivaragu', 'proso'], korale: ['korale', 'browntop'], kuttu: ['kuttu', 'buckwheat'], buckwheat: ['buckwheat', 'kuttu'], rajgira: ['rajgira', 'amaranth'], amaranth: ['amaranth', 'rajgira'],
    seeraga: ['seeraga', 'jeeraga'], jeeraga: ['jeeraga', 'seeraga'], jeera: ['jeera', 'cumin', 'zeera'], jeerakasala: ['jeerakasala', 'kaima'], masuri: ['masuri', 'masoori'], masoori: ['masoori', 'masuri'],
    matta: ['matta', 'rosematta', 'red rice'], kavuni: ['kavuni', 'black rice'], puzhungal: ['puzhungal', 'parboiled'], ukda: ['ukda', 'parboiled'], akki: ['akki', 'rice'],
    neichoru: ['neichoru', 'ghee rice'], puliyodarai: ['puliyodarai', 'puliyogare', 'tamarind rice'], puliyogare: ['puliyogare', 'puliyodarai', 'tamarind rice'], mudde: ['mudde', 'ragi ball'],
    toor: ['toor', 'tuvar', 'arhar', 'pigeon pea'], tuvar: ['tuvar', 'toor', 'arhar'], arhar: ['arhar', 'toor'], tuvaram: ['tuvaram', 'toor'],
    moong: ['moong', 'mung', 'green gram'], mung: ['mung', 'moong'], masoor: ['masoor', 'red lentil'], urad: ['urad', 'ulundu', 'black gram', 'mungo'], ulundu: ['ulundu', 'urad'],
    lobia: ['lobia', 'black-eyed', 'black eyed', 'cowpea', 'karamani'], karamani: ['karamani', 'lobia'], matki: ['matki', 'moth'], sundal: ['sundal'],
    vanjaram: ['vanjaram', 'seer fish', 'surmai'], surmai: ['surmai', 'seer fish', 'vanjaram'], seer: ['seer', 'vanjaram', 'surmai'], neymeen: ['neymeen', 'seer fish'], kingfish: ['king fish', 'seer fish'],
    bangda: ['bangda', 'ayala', 'indian mackerel'], ayala: ['ayala', 'bangda', 'indian mackerel'], aiyla: ['aiyla', 'ayala'], kanangeluthi: ['kanangeluthi', 'indian mackerel'],
    mathi: ['mathi', 'chaala', 'sardine'], chaala: ['chaala', 'mathi', 'sardine'], sardine: ['sardine', 'mathi'], nethili: ['nethili', 'kozhuva', 'anchovy'], kozhuva: ['kozhuva', 'nethili', 'anchovy'], anchovy: ['anchovy', 'nethili'],
    pomfret: ['pomfret', 'paplet', 'vavval', 'avoli'], paplet: ['paplet', 'pomfret'], vavval: ['vavval', 'pomfret'], avoli: ['avoli', 'pomfret'], ilish: ['ilish', 'hilsa'], hilsa: ['hilsa', 'ilish'],
    rui: ['rui', 'rohu'], catla: ['catla', 'katla'], katla: ['katla', 'catla'], pangasius: ['pangasius', 'basa'], basa: ['basa', 'pangasius'], rawas: ['rawas', 'indian salmon'],
    bhetki: ['bhetki', 'barramundi'], koduva: ['koduva', 'barramundi'], sankara: ['sankara', 'red snapper'], kalava: ['kalava', 'grouper'], choora: ['choora', 'tuna'], poomeen: ['poomeen', 'milkfish'],
    eral: ['eral', 'prawn'], jhinga: ['jhinga', 'prawn'], chemmeen: ['chemmeen', 'prawn'], kolambi: ['kolambi', 'prawn'], nandu: ['nandu', 'crab'], kekda: ['kekda', 'crab'], kanava: ['kanava', 'squid'],
    meen: ['meen', 'fish'], machli: ['machli', 'fish'], macher: ['macher', 'fish'], mutta: ['mutta', 'egg'], anda: ['anda', 'egg'], kozhi: ['kozhi', 'chicken'], murgh: ['murgh', 'chicken'],
    gosht: ['gosht', 'mutton'], kaleji: ['kaleji', 'liver'], makhan: ['makhan', 'butter'], chakka: ['chakka', 'hung curd'], bhakri: ['bhakri', 'bhakhri'], godhuma: ['godhuma', 'wheat'],
    // v1.19: fresh Indian foods by their Indian names
    nariyal: ['nariyal', 'coconut'], naariyal: ['naariyal', 'nariyal', 'coconut'], nariyel: ['nariyel', 'nariyal', 'coconut'], elaneer: ['elaneer', 'tender coconut'], ilaneer: ['ilaneer', 'elaneer', 'tender coconut'],
    eleneer: ['eleneer', 'elaneer', 'tender coconut'], daab: ['daab', 'tender coconut'], dab: ['dab', 'daab', 'tender coconut'], ganna: ['ganna', 'ganne', 'sugarcane'], ganne: ['ganne', 'sugarcane'],
    gannay: ['gannay', 'ganne', 'sugarcane'], karumbu: ['karumbu', 'sugarcane'], kabbu: ['kabbu', 'sugarcane'], sugercane: ['sugarcane'],
    nimbu: ['nimbu', 'lemon', 'lime'], nimboo: ['nimboo', 'nimbu', 'lemon'], limbu: ['limbu', 'nimbu', 'lemon'], shikanji: ['shikanji', 'shikanjvi', 'nimbu'], shikanjvi: ['shikanjvi', 'shikanji'],
    chaas: ['chaas', 'buttermilk', 'chhach'], chaach: ['chaach', 'chaas', 'buttermilk'], chhach: ['chhach', 'chaas', 'buttermilk'], chhaas: ['chhaas', 'chaas', 'buttermilk'], mattha: ['mattha', 'chaas'],
    majjige: ['majjige', 'chaas', 'buttermilk'], moru: ['moru', 'neer mor', 'buttermilk'], mor: ['mor', 'moru', 'buttermilk'], buttermilk: ['buttermilk', 'chaas'],
    mosambi: ['mosambi', 'sweet lime', 'musambi'], musambi: ['musambi', 'mosambi', 'sweet lime'], mausambi: ['mausambi', 'mosambi', 'sweet lime'], mosumbi: ['mosumbi', 'mosambi'],
    sathukudi: ['sathukudi', 'mosambi', 'sweet lime'], battayi: ['battayi', 'mosambi', 'sweet lime'], santra: ['santra', 'orange'], kinnow: ['kinnow', 'santra', 'orange'],
    tarbooz: ['tarbooz', 'watermelon', 'tarbuj'], tarbuj: ['tarbuj', 'tarbooz', 'watermelon'], tarbuz: ['tarbuz', 'tarbooz', 'watermelon'], kalingad: ['kalingad', 'tarbooz', 'watermelon'],
    kharbuja: ['kharbuja', 'muskmelon', 'kharbooja'], kharbooja: ['kharbooja', 'kharbuja', 'muskmelon'], anar: ['anar', 'pomegranate'], ananas: ['ananas', 'pineapple'],
    papita: ['papita', 'papaya'], angoor: ['angoor', 'grapes'], amrood: ['amrood', 'guava', 'amrud'], amrud: ['amrud', 'amrood', 'guava'], peru: ['peru', 'amrood', 'guava'],
    chikoo: ['chikoo', 'sapota', 'chiku'], chiku: ['chiku', 'chikoo', 'sapota'], sapota: ['sapota', 'chikoo'], sitaphal: ['sitaphal', 'custard apple', 'sharifa'], sharifa: ['sharifa', 'sitaphal'],
    kathal: ['kathal', 'jackfruit'], phanas: ['phanas', 'kathal', 'jackfruit'], jamun: ['jamun', 'jambul'], jambul: ['jambul', 'jamun'], naval: ['naval', 'jamun'], nungu: ['nungu', 'ice apple', 'tadgola'],
    tadgola: ['tadgola', 'nungu', 'ice apple'], singhara: ['singhara', 'water chestnut', 'shingada'], shingada: ['shingada', 'singhara'], kela: ['kela', 'banana'], aam: ['aam', 'mango'],
    hapus: ['hapus', 'alphonso'], aapus: ['aapus', 'alphonso'], alphanso: ['alphonso'], dussehri: ['dussehri', 'dasheri'], dashehari: ['dashehari', 'dasheri'],
    bhutta: ['bhutta', 'corn', 'butta'], butta: ['butta', 'bhutta', 'corn'], makka: ['makka', 'corn', 'bhutta'], shakarkandi: ['shakarkandi', 'sweet potato'], shakarkand: ['shakarkand', 'shakarkandi', 'sweet potato'],
    moongphali: ['moongphali', 'peanuts'], mungfali: ['mungfali', 'moongphali', 'peanuts'], murmura: ['murmura', 'puffed rice'], kurmura: ['kurmura', 'murmura', 'puffed rice'], mandakki: ['mandakki', 'murmura', 'puffed rice'],
    jhalmuri: ['jhal muri'], chat: ['chat', 'chaat'], chaat: ['chaat', 'chat'], falooda: ['falooda', 'faluda'], faluda: ['faluda', 'falooda'], jigarthanda: ['jigarthanda', 'jigardanda'], jigardanda: ['jigardanda', 'jigarthanda'], jigirthanda: ['jigirthanda', 'jigarthanda'], jigartanda: ['jigartanda', 'jigarthanda'], jigardhanda: ['jigardhanda', 'jigarthanda'],      // 1.34: the owner typed "jigardanda"
    // v1.21.3: fizzy drinks as people type them
    lehar: ['lehar', 'evervess'], lehor: ['lehor', 'lehar', 'evervess'], evervess: ['evervess', 'lehar'], thumsup: ['thumsup', 'thums up'], thumbs: ['thumbs', 'thums'],
    redbull: ['redbull', 'red bull'], cocacola: ['cocacola', 'coca cola'], zeera: ['zeera', 'jeera', 'cumin'], sparkling: ['sparkling', 'soda', 'carbonated'],
    // v1.33: the world's dishes as people spell them
    spaetzle: ['spaetzle', 'spatzle'], kaesespaetzle: ['kaesespaetzle', 'kasespatzle'], roesti: ['roesti', 'rosti'], pasteis: ['pasteis', 'pastel'],
    varenyky: ['varenyky', 'vareniki'], souvlakia: ['souvlakia', 'souvlaki'], dolma: ['dolma', 'dolmades'], tajine: ['tajine', 'tagine'], tagine: ['tagine', 'tajine'],
    chigae: ['chigae', 'jjigae'], gimbap: ['gimbap', 'kimbap'], potsticker: ['potsticker', 'gyoza', 'jiaozi'], shumai: ['shumai', 'siu mai'], kofte: ['kofte', 'kofta'],
    // v1.33: regional names for the new Indian foods
    garijalu: ['garijalu', 'somas', 'karanji'], jantikalu: ['jantikalu', 'murukku', 'chakli'], karappusa: ['karappusa', 'kara sev', 'omapodi'], karapusa: ['karapusa', 'kara sev', 'omapodi'], ukadiche: ['ukadiche', 'kozhukattai', 'modak'], arisa: ['arisa', 'athirasam'], pappu: ['pappu', 'dal'], paruppu: ['paruppu', 'dal'], parippu: ['parippu', 'dal'], bele: ['bele', 'dal'], payasa: ['payasa', 'payasam', 'kheer'], payesh: ['payesh', 'payasam', 'kheer'], pradhaman: ['pradhaman', 'payasam'], golgappa: ['golgappa', 'pani puri'], golgappe: ['golgappe', 'pani puri'], puchka: ['puchka', 'pani puri'], phuchka: ['phuchka', 'pani puri'], gupchup: ['gupchup', 'pani puri'], vada: ['vada', 'vadai', 'vade'], vadai: ['vadai', 'vada'], vade: ['vade', 'vada'], bara: ['bara', 'bada', 'vada'], bada: ['bada', 'bara', 'vada'], bhajji: ['bhajji', 'bajji'], bajji: ['bajji', 'bhajji'], pakoda: ['pakoda', 'pakora', 'pakodi'], pakora: ['pakora', 'pakoda'], pakodi: ['pakodi', 'pakoda'], ladu: ['ladu', 'laddu', 'ladoo'], laddoo: ['laddoo', 'laddu', 'ladoo'], halva: ['halva', 'halwa'], halwa: ['halwa', 'halva'], barfi: ['barfi', 'burfi'], burfi: ['burfi', 'barfi'], kachauri: ['kachauri', 'kachori'], idiyappam: ['idiyappam', 'idiappam', 'string hoppers'], idiappam: ['idiappam', 'idiyappam'], iddiyappam: ['idiyappam'], shavige: ['shavige', 'semiya', 'vermicelli', 'sevai'], semiya: ['semiya', 'vermicelli', 'seviyan'], seviyan: ['seviyan', 'vermicelli', 'semiya'], sevai: ['sevai', 'idiyappam', 'semiya'], avalakki: ['avalakki', 'poha', 'aval'], aval: ['aval', 'poha', 'flattened rice'], atukulu: ['atukulu', 'poha'], chivda: ['chivda', 'chiwda'], chiwda: ['chiwda', 'chivda'], palya: ['palya', 'poriyal', 'thoran'], poriyal: ['poriyal', 'thoran', 'palya'], thoran: ['thoran', 'poriyal'], upperi: ['upperi', 'chips'], huli: ['huli', 'sambar'], saaru: ['saaru', 'rasam'], charu: ['charu', 'rasam'], kuzhambu: ['kuzhambu', 'kulambu'], kulambu: ['kulambu', 'kuzhambu'], kheema: ['kheema', 'keema', 'mince'], mamsam: ['mamsam', 'mutton'], kodi: ['kodi', 'chicken'], kori: ['kori', 'chicken'], murg: ['murg', 'murgh', 'chicken'], maach: ['maach', 'macher', 'fish'], chingri: ['chingri', 'prawn'], doi: ['doi', 'curd', 'dahi'], kaapi: ['kaapi', 'coffee'], kapi: ['kapi', 'coffee'], sharbat: ['sharbat', 'sherbet', 'sarbath'], sarbath: ['sarbath', 'sharbat'], sherbat: ['sherbat', 'sharbat'], pitha: ['pitha', 'pithe', 'pittha'], pithe: ['pithe', 'pitha'], pittha: ['pittha', 'pitha'], kati: ['kati', 'kathi'], pao: ['pao', 'pav'], kozhukattai: ['kozhukattai', 'kozhukkattai', 'modak'], kozhukkattai: ['kozhukkattai', 'kozhukattai'], modak: ['modak', 'modakam', 'kozhukattai'], kesari: ['kesari', 'sheera'], sheera: ['sheera', 'kesari', 'sooji halwa'], holige: ['holige', 'obbattu', 'boli', 'puran poli'], obbattu: ['obbattu', 'boli', 'holige'], puranpoli: ['puran poli', 'boli'], chakli: ['chakli', 'murukku', 'chakkuli'], murukku: ['murukku', 'chakli'], mixture: ['mixture', 'chivda', 'namkeen'], namkeen: ['namkeen', 'mixture']
  };
  Object.assign(SYN, { chapathi: ['chapathi', 'chapati', 'roti'], chappathi: ['chappathi', 'chapathi', 'chapati', 'roti'], chapathis: ['chapathi', 'chapati', 'roti'],
    parotta: ['parotta', 'porotta', 'barotta'], porotta: ['porotta', 'parotta'], barotta: ['barotta', 'parotta'] });      // 1.35.2 (59): Chennai spellings
  const altsOf = t => (SYN[t] || (t.length > 3 && t.endsWith('s') ? [t, t.slice(0, -1)] : [t])).map(fold);      // folded like the names: 'noodles, instant' → 'noodles instant'
  // [food, score] best first; cu = a cuisine's number or -1 for all
  // 1.24 (speed). Three things, none of which changes an answer or its order:
  // 1. the words to look for are put together once per search instead of once per food;
  // 2. the last searches are kept: deleting letters, typing them again and switching cuisine ask for the same ones;
  // 3. a search that only adds letters to the words of the one before looks through that one's matches instead of all
  //    31,000 foods: whatever has "chick" at the start of a word had "chic" there too. (Not when a word starts to stand for
  //    others: "cur" becoming "curd" also means yogurt and dahi, which "cur" never matched; then everything is searched.)
  const sKept = new Map(), S_KEEP = 32, S_FULL = 6000;
  let sLast = null, dbAt = null, dbFor = null;
  const placeIn = () => { if (dbFor !== DB) { dbAt = new Map(); DB.list.forEach((x, i) => dbAt.set(x, i)); dbFor = DB; } return dbAt; };
  function search(q, cu) {
    if (!DB) return [];
    const fq = fold(q), toks = fq.split(' ').filter(Boolean);
    if (!toks.length) return [];
    const cuk = cu >= 0 ? cu : -1, ck = cuk + '|' + toks.join(' '), kept = sKept.get(ck);
    if (kept && kept.db === DB) {
      sKept.delete(ck); sKept.set(ck, kept);                 // the newest is kept longest
      for (const x of kept.best) if (x.near) delete x.near;
      for (const x of kept.near) x.near = true;
      if (kept.full) sLast = kept;
      return kept.best.concat(kept.near);
    }
    const alts = toks.map(altsOf), needles = alts.map(a => a.map(t => ' ' + t)), out = [], full = [];
    // every word now looked for begins with a word looked for last time: the matches are among last time's
    const from = sLast && sLast.db === DB && sLast.cu === cuk && sLast.full && sLast.needles.length === needles.length
      && needles.every((a, i) => a.every(t => sLast.needles[i].some(o => t.startsWith(o)))) ? sLast : null;
    for (const x of from ? from.full : DB.list) {
      if (cu >= 0 && x.cu !== cu) continue;
      let sc = 0, ok = true;
      for (const a of needles) {
        let best = -1, whole = false;
        // 1.35.2: a whole word counts more than the start of a longer one ("egg" is egg before eggplant)
        for (const t of a) { const i = x.key.indexOf(t); if (i >= 0 && (best < 0 || i < best)) { best = i; const nx = x.key.charAt(i + t.length); whole = !nx || !/[a-z0-9]/.test(nx); } }
        if (best < 0) { ok = false; break; }
        sc += best === 0 ? (whole ? 30 : 16) : best < 12 ? (whole ? 12 : 8) : 4;
      }
      if (!ok) continue;
      full.push(x);
      out.push([sc + extra(x, toks.length === 1 ? alts[0] : [fq]), x]);
    }
    // 1.35.2: one word that names Indian food too ("roti", "curd"): the other cuisines' dishes and the foreign packs come after it
    // (roti canai and two Indonesian packs came before tandoori roti); plain foods of no cuisine (rice, egg, milk) are not moved
    if (toks.length === 1) {
      const w = ' ' + toks[0] + ' ', has = x => (' ' + x.key + ' ').replace(/[^a-z0-9]+/g, ' ').includes(w);
      if (out.some(r => r[1].cu === 0 && has(r[1]))) for (const r of out) if (r[1].cu >= 1 && r[1].cu <= 12) r[0] -= 25;
    }
    out.sort((a, b) => b[0] - a[0] || (a[1].key < b[1].key ? -1 : 1));
    // 1.35.2: a few everyday words go straight to the everyday food ("curd" is home curd, not yogurt or curd rice)
    const sf = toks.length === 1 && SEARCH_FIRST[toks[0]];
    if (sf) { const i = out.findIndex(r => r[1].name === sf); if (i > 0) out.unshift(out.splice(i, 1)[0]); }
    // 1.35.2 (59): the everyday food the words mean comes first, the one Type it and the photo reader count ("tea" is chai with milk
    // and sugar, "egg" a boiled egg, "rice" cooked rice, "dal" dal tadka, "coffee" filter coffee), even when its name hasn't the word typed
    if (NW()) {
      const nm = everyday(toks);
      if (nm && nm !== sf) { const i = out.findIndex(r => r[1].name === nm); if (i > 0) out.unshift(out.splice(i, 1)[0]); else if (i < 0) { const x = rowByName(nm); if (x && (cu < 0 || x.cu === cu)) out.unshift([0, x]); } }
    }
    let best = out.slice(0, 80).map(r => r[1]);
    // v1.11: a label GymDay checked by hand (source 7) comes before the packs of the same thing from Open Food Facts (8)
    const p8 = best.findIndex(x => x.src === 8);
    if (p8 >= 0) { const mine = best.filter((x, i) => x.src === 7 && i > p8); if (mine.length) { best = best.filter(x => !mine.includes(x)); best.splice(p8, 0, ...mine); } }
    for (const x of best) if (x.near) delete x.near;        // v1.19: a food an earlier search (the photo matcher's too) marked as a close match is a full match here
    let nearList = [], nearAll = null;
    if (!(best.length >= 8 || toks.length < 2)) {
      // "paneer butter masala": also the foods that have all but one of the words
      const seen = new Set(best), near = [];
      // those are among last time's matches and near matches too, when last time looked for near matches (in the list's own order)
      let pool = DB.list;
      if (from && from.nearAll) { const at = placeIn(); pool = from.full.concat(from.nearAll).sort((a, b) => at.get(a) - at.get(b)); }
      nearAll = [];
      for (const x of pool) {
        if (seen.has(x) || (cu >= 0 && x.cu !== cu)) continue;
        let hits = 0, sc = 0;
        for (const a of needles) { let b = -1; for (const t of a) { const i = x.key.indexOf(t); if (i >= 0 && (b < 0 || i < b)) b = i; } if (b >= 0) { hits++; sc += b === 0 ? 30 : 8; } }
        if (hits >= toks.length - 1 && hits >= 1) { nearAll.push(x); near.push([sc + extra(x, null) - 40, x]); }
      }
      near.sort((a, b) => b[0] - a[0]);
      nearList = near.slice(0, 40).map(r => { r[1].near = true; return r[1]; });
    }
    // what the next search may look through: only kept while it is short enough to be worth keeping
    const small = full.length <= S_FULL && (!nearAll || nearAll.length <= S_FULL);
    const mine = { db: DB, cu: cuk, needles, best: best.slice(), near: nearList.slice(), full: small ? full : null, nearAll: small ? nearAll : null };
    sLast = { db: DB, cu: cuk, needles, full, nearAll };
    sKept.set(ck, mine);
    if (sKept.size > S_KEEP) sKept.delete(sKept.keys().next().value);
    return nearList.length ? best.concat(nearList) : best;
  }
  // 1.35.2 (59): more everyday words for the search (only the search: Type it and the photo reader have ALIAS)
  // 1.35.2 (59): paneer is the measured Indian paneer (McCance and Widdowson's: 26 g protein, 1 g carbs, 25 g fat in 100 g, near
  // Amul's label of 20, 4.5 and 25), not USDA's "Paneer (cottage cheese)" with 22.5 g carbs; for Type it and the photo reader too
  const ALIAS2 = { paneer: 'Cheese, Paneer', 'paneer cube': 'Cheese, Paneer', 'fresh paneer': 'Cheese, Paneer', 'malai paneer': 'Cheese, Paneer', 'paneer piece': 'Cheese, Paneer' };
  const SEARCH_FIRST2 = { paneer: 'Cheese, Paneer', 'fresh paneer': 'Cheese, Paneer', 'paneer cubes': 'Cheese, Paneer', roti: 'Chapati/Roti', rotis: 'Chapati/Roti', chapathi: 'Chapati/Roti', chappathi: 'Chapati/Roti', parotta: 'Kerala parotta', porotta: 'Kerala parotta', barotta: 'Kerala parotta', 'kerala parotta': 'Kerala parotta',
    oats: 'Oats, raw', oat: 'Oats, raw', 'rolled oats': 'Oats, raw', 'oats raw': 'Oats, raw', 'raw oats': 'Oats, raw' };
  let nmAt = null, nmFor = null;
  const rowByName = nm => { if (!DB) return null; if (nmFor !== DB) { nmAt = new Map(); for (const x of DB.list) if (!nmAt.has(x.name)) nmAt.set(x.name, x); nmFor = DB; } return nmAt.get(nm) || null; };
  function everyday(toks) {
    const words = toks.map(lstem), k = words.join(' '), k2 = words.filter(w => !LPLAIN.has(w)).join(' ');
    return SEARCH_FIRST2[toks.join(' ')] || SEARCH_FIRST2[k] || ALIAS[k] || (k2 && k2 !== k ? SEARCH_FIRST2[k2] || ALIAS[k2] : '') || '';
  }
  const SEARCH_FIRST = { curd: 'Curd (dahi) from toned milk', dahi: 'Curd (dahi) from toned milk', chapati: 'Chapati/Roti', chapatti: 'Chapati/Roti', phulka: 'Chapati/Roti' };
  const KINDS = /^(whey|protein|creatine|isolate|concentrate|yeast|casein|bar|lassi)$/;          // 1.35.2: not paneer (a brand came before plain paneer)
  function extra(x, qs) {             // qs: the query, or for one word every word it can stand for (curd: yogurt too)
    const k = x.key.slice(1); let sc = 0, b = 0;
    // 1.35.2: a name that ends with the word counts nearly as much as one that starts with it (tandoori roti, butter naan:
    // Indian names put the food last), and a word the typed one stands for counts less than the word typed (curd before yogurt)
    (qs || []).forEach((q, i) => { if (!q) return; const v = k === q ? 120 : k.startsWith(q + ' ') ? 50 : k.endsWith(' ' + q) ? 45 : k.startsWith(q) ? 35 : 0; b = Math.max(b, i === 0 ? v : v * 0.6); });
    if (qs && qs[0] && k.startsWith(qs[0])) b += 12;      // the word typed beats a word it stands for (brinjal before eggplant)
    sc += b;
    if (NW() && qs && qs[0] && k === qs[0] + ' raw') sc += 40;       // 1.35.2 (59): "orange" is the fruit before orange juice
    if (x.pop) sc += 45;                       // the plain everyday version: boiled egg, cooked rice, roti, dal…
    if (x.cu === 0 && qs && qs[0] && (' ' + k + ' ').replace(/[^a-z0-9]+/g, ' ').includes(' ' + qs[0].split(' ')[0] + ' ')) sc += 18;      // 1.35.2: Indian food first when it has the very word typed (tandoori roti before roti canai and the foreign packs)
    if (x.src === 1 && x.note.startsWith("INDB's own")) sc -= 140;  // 1.34: an INDB recipe found far off comes after the usual one its note names (kulfi, appam, rasmalai…), staple or not
    sc += [8, 8, 0, 4, 4, 1, 8, 8, 0, 6, 0, 0, 0, 9][x.src] || 0;   // v1.19: 13 = ICMR-NIN's IFCT 2017, measured on Indian food, a little ahead   // dishes as eaten first (US, India, GymDay's versions), then the UK and Australian tables, then raw ingredients; packs (8) only when their name is typed
    // v1.9.1: "whey", "protein", "creatine"… bring up the brands (their names start with the maker, so they'd sink below "Whey, acid, dried")
    if (x.src === 7 && qs && qs[0]) { const w = qs[0].split(' ')[0]; if (KINDS.test(w) && x.key.includes(' ' + w)) sc += 100; }      // right after the everyday one ("Whey protein powder")
    return sc - Math.min(30, k.length / 5);    // shorter names first
  }
  function browse(cu) { return DB ? DB.list.filter(x => x.cu === cu && x.src !== 2).sort((a, b) => (a.key < b.key ? -1 : 1)).slice(0, 150) : []; }

  // ---------------------------------------------------------------- a food, ready to be measured
  // { fid, name, sub, base: values for factor 1, units: [{ label, f (factor of base), g (grams), gram (the 'g' unit) }], def: unit index, kind }
  const LIQ = /\b(milk|juice|tea|coffee|soda|water|lassi|buttermilk|chaas|shake|smoothie|drink|beer|wine|cola|lemonade|beverage|nectar|kombucha|kefir|cocoa|latte|cappuccino|espresso|soup|broth|stock)\b/i;
  // a label that repeats its own weight ("1 serving (25 g)" of 25 g) loses it: the weight is written after every amount anyway
  const bare = s => String(s || '').replace(/\s*\([\d.]+\s*g\)$/, ''), sameUnit = (label, un) => label === un || bare(label) === bare(un);
  function portionsOf(ps) {
    return ps ? ps.split(';').map(s => {
      const i = s.lastIndexOf('|'), g = +s.slice(i + 1); let label = s.slice(0, i);
      const m = label.match(/\s*\(([\d.]+)\s*g\)$/); if (m && Math.abs(+m[1] - g) < 0.6) label = label.slice(0, m.index);
      return mineUnit({ label, g });
    }).filter(u => u.g > 0 && u.label) : [];
  }
  // v1.23 My bowl, glass and spoon: a katori, bowl, glass, cup, tablespoon or teaspoon in the food list is a standard
  // size (150, 250, 250, 240, 15 and 5 ml, or the size its label gives). Sizes the person measured (settings.mine, in ml)
  // scale those units, for every food. Units with other words in front ("1 small glass", "1 serving spoon") are left alone.
  const MINE = [['katori', 'Katori (small bowl)', 150, /^katoris?$/], ['bowl', 'Bowl', 250, /^bowls?$/], ['glass', 'Glass', 250, /^glass(es)?$/], ['cup', 'Cup', 240, /^cups?$/], ['tbsp', 'Tablespoon', 15, /^(tablespoons?|tbsp)$/], ['tsp', 'Teaspoon', 5, /^(teaspoons?|tsp)$/]];
  const mineOf = () => (st().mine && typeof st().mine === 'object' ? st().mine : {});
  function mineKind(label) { const m = /^(?:([\d.]+)\s+)?([a-z]+)\b/i.exec(label || ''); if (!m) return null; const k = MINE.find(x => x[3].test(m[2].toLowerCase())); return k ? { k: k[0], std: k[2], n: +m[1] > 0 ? +m[1] : 1 } : null; }
  function mineUnit(u) {
    const kind = mineKind(u.label); if (!kind) return u;
    u.mk = kind.k;
    const my = +mineOf()[kind.k]; if (!(my > 0)) return u;
    const ml = /\(([\d.]+)\s*ml\)/i.exec(u.label), std = ml ? +ml[1] / kind.n : kind.std;
    if (!(std > 0) || Math.abs(my - std) < 0.5) return u;
    u.g = Math.round(u.g * my / std * 10) / 10; u.mine = my;
    if (ml) u.label = u.label.replace(ml[0], `(${Math.round(my * kind.n)} ml)`);
    return u;
  }
  // v1.13: home cooking with more or less oil than the recipes in the tables (asked once on the Food tab): curries, sabzis, dals,
  // biryanis, pulaos, upma, poha and parathas from the Indian tables and GymDay's versions get 3 g more fat in 100 g, or up to 2 g less
  const OILY = /\b(curry|sabzi|sabji|subzi|masala|fry|stir|bhurji|kurma|korma|kootu|kuzhambu|poriyal|thoran|avial|aviyal|dal|daal|dhal|sambar|kadhi|kadai|kadhai|makhani|do ?pyaza|keema|chole|chana|channa|rajma|biryani|pulao|pulav|pilaf|fried rice|khichdi|khichri|upma|poha|paratha|parantha|thepla|bharta|bhartha|bhindi|baingan|aloo|gobi|palak|saag|methi|matar|mushroom|paneer|tadka|tarka|jeera rice|lemon rice|tamarind rice|pongal|vangi|bisi bele|sundal|bhujia)\b/i;
  const NOT_OILY = /\b(halwa|kheer|payasam|ladoo|laddu|burfi|barfi|jamun|jalebi|rasgulla|rasmalai|sandesh|mysore pak|sweet|chutney|raita|salad|soup|pickle|achar|juice|shake|lassi|chai|tea|coffee|pakora|pakoda|samosa|vada|wada|bonda|kachori|puri|poori|bhatura|bhature|chips|fritter|cutlet|tikki|roll|rolls|sandwich|pizza|burger|raw|boiled|steamed|powder|flour|mix|premix|plain|cooked|sprouted|sprouts|soaked|pancake|omelette|omelet|omlet|tart|biscuit|cookie|cake|fricassee|dosa|uttapam|cheese|pasta|noodles|chat masala|chaat masala|garam masala)\b/i;
  const OIL_WORD = { more: 'more oil than the recipe: 3 g more fat in 100 g', less: 'less oil than the recipe: less fat in 100 g' };
  function oilDelta(x) {
    const lvl = st().oil; if (lvl !== 'more' && lvl !== 'less') return 0;
    if (!(x.src === 1 || x.src === 6) || !OILY.test(x.name) || NOT_OILY.test(x.name) || !(x.f >= 1 && x.f <= 25)) return 0;
    return lvl === 'more' ? 3 : -Math.min(2, Math.round(x.f * 5) / 10);
  }
  // 1.35.2 (59): the amount a food starts at, as people eat it. The tables' first measure was often a cup of anything (a cup of
  // sugar: 802 kcal; of paneer: 736), one almond, a slice of mango, a tablespoon of cooked rice, an American 480 ml coffee or a
  // whole 1 kg packet of suji. [the measure, how many of it (0: one, or 100 g)]
  const SPOONY = /^(sugar|brown sugar|jaggery|gur|honey|salt|syrup|maple syrup|golden syrup|jam|jelly|marmalade|ketchup|tomato ketchup|tomato sauce|mayonnaise|mayo|mustard|vinegar|soy sauce|chil+i sauce|hot sauce|barbecue sauce|bbq sauce|peanut butter|almond butter|nutella|chocolate spread|butter|margarine|cream cheese|cream|whipped cream|sour cream|chocolate syrup|condensed milk|salad dressing)\b|\b(dressing|spread|syrup|ketchup|mayonnaise|chutney powder|podi|pickle|achar|relish)\b/i;
  const NOT_SPOON = /\b(chicken|paneer|naan|roti|cookies?|biscuits?|cakes?|bread|toast|sandwich|fish|mutton|rice|noodles|pasta|pizza|burger|popcorn|milk|lassi|tea|coffee|soup|chips|croissant|muffin|bun|roll|puff|chocolate bar|ice cream|candy)\b/i;
  const TSP1 = /^(sugar|brown sugar|jaggery|gur|salt)\b/i;
  const SPOON_OK = /\b(spread|butter|oil|ghee|sauce|dressing|syrup|honey|sugar|jaggery|jam|jelly|paste|powder|spices?|seeds?|herbs?|seasoning|salt|pepper|vinegar|essence|extract|bitters|cocoa|instant|gravy|stock|chutney|pickle|achar|relish|mustard|ketchup|mayonnaise|cream|yeast|baking|gelatine?|lard|dripping|margarine|tahini|hummus|dip|masala|podi|chilli|chili|garlic|ginger|juice|desiccated|grated|flax|chia|sesame|flour|breadcrumbs|batter|sprinkles)\b/i;
  const MEATY = /\b(chicken|mutton|lamb|goat|beef|pork|fish|prawns?|shrimps?|crab|lobster|paneer|tofu|cheese|turkey|salmon|tuna|meat|keema|mince|squid)\b/i;
  const DISHY = /\b(curry|gravy|masala|soup|stew|rice|salad|biryani|pulao|noodles?|pasta|dip|sauce|casserole|chowder|kurma|korma|stroganoff|with|and|sandwich|wrap|roll|pie|pizza|burger|spread|dressing|loaf|balls?|cake|kofta|bake|jalfrezi|handi|kadai|kadhai|makhani|lollipop|65|platter|sub|taco|burrito|quesadilla|omelet|omelette|nuggets|popcorn|fingers|strips)\b/i;
  const PIECE_U = /^1 (breast|thigh|drumstick|leg|wing|fillet|steak|cutlet|kebab|patty|chop|tikka|seekh|boti)\b/i;
  function sensible(x, units, def) {
    const nm = x.name, u = units[def], gi = units.findIndex(v => v.gram);
    if (!u) return [def, 0];
    const hh = v => !v.gram && !v.ml && v.label !== 'oz', find = re => units.findIndex(v => hh(v) && re.test(v.label));
    // sugar, honey, jam, sauces, dressings, spreads: a spoon (sugar, jaggery and salt a teaspoon)
    if (SPOONY.test(nm) && !NOT_SPOON.test(nm) && !/^1 (tbsp|tablespoons?|tsp|teaspoons?|sachet|packet|individual|cube|portion|serving|pat)\b/i.test(u.label)) {
      const t = TSP1.test(nm) ? find(/^1 (tsp|teaspoons?)\b/i) : -1, i = t >= 0 ? t : find(/^1 (tbsp|tablespoons?)\b/i);
      if (i >= 0) return [i, 0];
    }
    // a whole packet of more than 250 g (a kilo of suji) or 600 kcal (200 g of thattai): one serving of it, else 100 g (15 g of ghee or oil)
    if (/^1 pack\b/.test(u.label) && (u.g > 250 || x.kcal * u.g / 100 > 600)) {
      const i = units.findIndex(v => hh(v) && !/^1 pack\b/.test(v.label)); if (i >= 0) return [i, 0];
      if (gi >= 0) return [gi, x.kcal >= 700 && /\b(oils?|ghee|butter|vanaspati|dalda)\b/i.test(nm) ? 15 : 0];
    }
    // a tablespoon of cooked rice or barley (the Australian table's first measure): a cup, katori or piece of it, else 100 g
    if (/^1 (tbsp|tablespoons?|tsp|teaspoons?)\b/i.test(u.label) && !SPOON_OK.test(nm) && !SPOONY.test(nm) && x.kcal < 500) {
      const i = find(/^1 (cup|katori|bowl|glass|piece|slice|serving|medium|small|large|whole|fruit|roti|egg|biscuit|bar)\b/i); return [i >= 0 ? i : gi >= 0 ? gi : def, 0];
    }
    // chicken, fish, paneer or tofu by the cup: a piece the table has (a breast, a fillet), cheese by the slice, else 100 g
    if (MEATY.test(nm) && !DISHY.test(nm) && /^1 cups?\b/i.test(u.label)) {
      const pc = find(PIECE_U); if (pc >= 0 && units[pc].g >= 25 && units[pc].g <= 250) return [pc, 0];
      const sl = /\bcheese\b/i.test(nm) && !/paneer|cottage/i.test(nm) ? find(/^1 slice\b/i) : -1; if (sl >= 0) return [sl, 0];
      if (gi >= 0) return [gi, 0];
    }
    // an American coffee shop's 480 ml "medium": a cup or a glass
    if (/^1 (medium|regular|large)\b/i.test(u.label) && u.g >= 400 && LIQ.test(nm)) { const i = units.findIndex(v => hh(v) && /^1 (cup|glass|mug|can)\b/i.test(v.label) && v.g <= 400); if (i >= 0) return [i, 0]; }
    // a slice of mango, one grape or berry: the fruit, or a cup of it
    if (/,\s*raw\b|\bfruit\b/i.test(nm) && /^1 (slice|chunk|piece|wedge|segment|berry|grape|cherry)\b/i.test(u.label) && u.g < 40) {
      const w = nm.split(/[ ,]/)[0].toLowerCase().replace(/(es|s)$/, ''), i = units.findIndex(v => hh(v) && new RegExp('^1 (' + w + '|fruit|medium|whole)\\b', 'i').test(v.label));
      const c = i >= 0 ? i : find(/^1 cups?\b/i); if (c >= 0) return [c, 0];
    }
    // one almond, peanut or raisin (under 3 g): about 12 g of them (10 almonds)
    if (hh(u) && u.g > 0 && u.g < 3) return [def, Math.min(30, Math.max(5, Math.round(12 / u.g / 5) * 5))];
    if (/^oats, raw$/i.test(nm) && /^1 cup\b/.test(u.label)) return [def, 0.5];          // a cup of raw oats is 80 g: half a cup
    if (/^cheese, paneer$/i.test(nm)) { const i = find(/^1 small katori\b/i); if (i >= 0) return [i, 0]; }      // paneer: 100 g, not one cube
    return [def, 0];
  }
  function dbFood(x) {
    const base = { kcal: x.kcal, p: x.p, c: x.c, f: x.f, fib: x.fib, cr: x.cr || 0 };       // per 100 g (v1.9.1: brands of creatine carry it)
    const od = oilDelta(x); if (od) { base.f = Math.round((base.f + od) * 10) / 10; base.kcal = Math.round((base.kcal + 9 * od) * 10) / 10; }
    const units = portionsOf(x.ps).map(u => ({ label: u.label, g: u.g, f: u.g / 100, mk: u.mk, mine: u.mine }));
    units.push({ label: 'g', g: 1, f: 0.01, gram: true });
    units.push({ label: 'oz', g: 28.35, f: 0.2835 });
    if ((x.src !== 7 && LIQ.test(x.name)) || /drink|beverage|milk|juice|soup/i.test(DB.gr[x.gr] || '')) {      // a brand's name ("Filter Coffee" powder) doesn't make it a drink
      const floz = units.find(u => /^1 fl oz\b/.test(u.label)), cup = units.find(u => /^1 cup\b/.test(u.label));
      const gml = floz ? floz.g / 29.57 : cup ? cup.g / 240 : 1;
      if (gml > 0.8 && gml < 1.3) units.push({ label: 'ml', g: gml, f: gml / 100, ml: true });
    }
    let def = units.findIndex(u => /^1 (medium|regular)\b/i.test(u.label));
    // 1.35: a cooking fat's usual amount is a spoon, not its first measure (a cup of oil or ghee is about 1,960 kcal)
    if (def < 0 && x.kcal >= 700 && /\b(oils?|ghee|vanaspati|dalda)\b|^butter\b/i.test(x.name)) def = units.findIndex(u => /^1 (tbsp|tablespoon)\b/i.test(u.label));
    if (def < 0) def = units.findIndex(u => !u.gram && !u.ml && u.label !== 'oz' && !/typical serving/i.test(u.label));
    if (def < 0) def = units.findIndex(u => u.gram);            // no household measure in the table: 100 g
    let defQ = 0; if (NW()) [def, defQ] = sensible(x, units, def);
    const cu = x.cu >= 0 ? DB.cu[x.cu] : '';
    const note = x.src === 8 ? `Barcode ${x.id.slice(1)}. The pack's label as shared on Open Food Facts: check it against your pack, makers change recipes.` : x.note || '';
    return { fid: x.id, name: x.name, sub: [cu, DB.srcs[x.src]].filter(Boolean).join(' · '), tag: [cu, SHORT[x.src]].filter(Boolean).join(' · '), note: od ? (note ? note + ' ' : '') + `Your home cooking: ${OIL_WORD[st().oil]}.` : note, base, units, def, defQ, kind: 'db', per100: true, src: x.src, oil: od };
  }
  // v1.13: the food in the tables that a photo line names ("Dal tadka, 1 katori" → Dal tadka), with its numbers for the grams the AI judged.
  // Only a confident match: most of the line's words are in the food's name, it is a dish as eaten (not raw, dry or a powder), and its
  // calories are not wildly different from the AI's (2.5 times or more either way means it is probably another food).
  const LSTOP = new Set(['with', 'and', 'the', 'some', 'small', 'medium', 'large', 'big', 'full', 'half', 'plate', 'plates', 'bowl', 'bowls', 'katori', 'katoris', 'cup', 'cups', 'glass', 'piece', 'pieces', 'pcs', 'slice', 'slices', 'serving', 'servings', 'tbsp', 'tsp', 'gms', 'grams', 'homemade', 'home', 'style', 'indian', 'fresh', 'hot', 'one', 'two', 'three', 'four', 'five', 'six',
    // v1.15: the amounts the photo reader writes into its lines ("Sambar with carrots and shallots, approx. 0.3 cup")
    'approx', 'approximately', 'about', 'around', 'roughly', 'estimated', 'est', 'portion', 'portions', 'handful', 'spoon', 'spoons', 'tablespoon', 'tablespoons', 'teaspoon', 'teaspoons', 'ladle', 'ladles', 'glasses', 'sized', 'size', 'nos', 'each', 'quarter', 'dish', 'food', 'item', 'meal', 'special', 'tasty', 'delicious', 'yummy', 'leftover', 'leftovers']);
  const AMTW = new Set([...LSTOP, 'g', 'gm', 'ml', 'kg', 'of', 'a', 'an', 'x', 'no', 'pc', 'little', 'bit', 'few', 'seven', 'eight', 'nine', 'ten']);
  const isAmt = part => fold(part).replace(/\d+/g, ' ').split(' ').filter(Boolean).every(w => AMTW.has(w));     // "approx. 0.3 cup", "3 pieces", "2"
  const LPLAIN = new Set(['cooked', 'boiled', 'plain', 'white', 'steamed', 'average', 'prepared', 'regular', 'typical', 'edible', 'part',
    'restaurant', 'recipe', 'from', 'takeaway', 'homemade']);                 // v1.16: home or restaurant is a choice of version, not another food
  // v1.16: a food whose name starts with one of these is a part of a dish (the sauce of a pasta), never the dish a line names
  const PARTW = new Set('sauce gravy dressing dip topping spread seasoning stock broth batter dough paste marinade syrup icing frosting filling crust base'.split(' '));
  // vegetables a line may name that a dish in the tables calls "vegetables" ("Pasta with cream sauce and added vegetables")
  const VEGW = new Set('mushroom carrot pea bean capsicum pepper broccoli spinach corn onion tomato cabbage cauliflower zucchini brinjal eggplant okra beetroot potato'.split(' '));
  const lstem = w => (w.length > 4 && w.endsWith('es') && !w.endsWith('ses') ? w.slice(0, -2) : w.length > 3 && w.endsWith('s') ? w.slice(0, -1) : w);
  // v1.14: the everyday name of a food → the food in the list it means (the words matched alone pick a dish: "Curd" was a curd dip,
  // "Rice" a salted American rice, "Boiled egg" the white only). The key is the line's words without the plain ones, in order.
  const ALIAS = (() => {
    const o = {}, put = (name, keys) => keys.split('|').forEach(k => { o[k.split(' ').map(lstem).join(' ')] = name; });
    put('Curd (dahi) from toned milk', 'curd|dahi|yogurt|yoghurt|curd dahi|dahi curd|home curd|homemade curd|thayir|mosaru|perugu');
    put('Ponni rice, cooked', 'rice|sona masoori rice|ponni rice|chawal|sadam|annam|rice chawal');
    put('Egg, whole, boiled or poached', 'egg|hard egg|egg hard|whole egg');
    put('Paneer (cottage cheese)', 'paneer|cottage cheese|paneer cube');
    put('Kidney bean curry (Rajmah curry)', 'rajma|rajmah|rajma curry|rajma masala|rajma gravy|kidney bean curry');
    put('Chickpeas curry (Safed channa curry)', 'chole|chhole|chana masala|chole masala|channa masala|chana curry|chole curry|chickpea curry|kabuli chana curry');
    put('Oatmeal Porridge', 'oat|oatmeal|oat porridge|oatmeal porridge|oats porridge');
    put('Instant noodles, cooked (masala noodles, as made from a 70 g pack)', 'maggi|maggie|maggi noodle|maggi masala|maggi masala noodle|instant noodle|masala noodle|yippee|yippee noodle|top ramen');      // 1.35.2: "maggi" was a Japanese ramen bowl
    put('Peanuts', 'peanut|groundnut|moongfali|roasted peanut|peanut roasted');
    put('Ghee, clarified butter', 'ghee|cow ghee|desi ghee|pure ghee|clarified butter|neyyi|tuppa');      // 1.35: "ghee" was matched to a sweet fried in it
    put('Sunflower oil', 'oil|cooking oil|refined oil|refined sunflower oil');                               // 1.35: "oil" alone is the usual cooking oil
    put('Chai with milk and sugar (1½ tsp a cup)', 'tea|milk tea|masala tea|masala chai|chai|ginger tea|elaichi tea');
    put('Gulab jamen/jambu, homemade', 'gulab jamun|gulab jamoon');                 // v1.19: "jamun" alone is the fruit now (below)
    // v1.19: fresh Indian foods by the names a photo line or a person uses (keys are the words without the plain ones: "corn on the cob" → corn cob)
    put('Coconut water, tender (elaneer, nariyal pani, daab, ilaneer)', 'coconut water|tender coconut|tender coconut water|elaneer|ilaneer|eleneer|nariyal pani|nariyal paani|naariyal pani|daab|daab water|fresh coconut water|green coconut water|coconut water fresh|tender coconut drink');
    put('Buttermilk, masala chaas (salted and spiced: mattha, majjige, ghol)', 'buttermilk|chaas|chaach|chhach|chhachh|chhaas|masala chaas|masala buttermilk|spiced buttermilk|mattha|majjige|indian buttermilk|salted buttermilk|chaas buttermilk|buttermilk chaas|ghol');
    put('Neer mor (thin spiced buttermilk, moru, sambharam)', 'neer mor|moru|sambharam|nir mor|neermor');
    put('Sugarcane juice (ganne ka ras, karumbu juice, oos ras)', 'sugarcane juice|ganne ras|ganna juice|ganne juice|karumbu juice|cane juice|sugar cane juice|ganna ras|sugarcane');
    put('Mosambi juice, fresh, no sugar (sweet lime, sathukudi)', 'mosambi juice|sweet lime juice|musambi juice|mausambi juice|mosumbi juice|sathukudi juice|fresh mosambi juice');
    put('Mosambi (sweet lime, sathukudi, battayi), fruit', 'mosambi|musambi|mausambi|sweet lime|sathukudi|battayi');
    put('Nimbu pani, sweet and salted (shikanji, shikanjvi)', 'nimbu pani|nimbu paani|nimboo pani|shikanji|shikanjvi|lemon pani|masala nimbu pani');
    put('Nimbu pani, sweet (lemonade, nimbu sharbat)', 'nimbu sharbat|sweet nimbu pani|sweet lemon water');
    put('Nimbu pani, no sugar (lemon water)', 'lemon water|lime water|warm lemon water');
    put('Fresh lime soda, sweet', 'fresh lime soda|lime soda|nimbu soda|fresh lime');
    put('Goli soda / banta (sweet lemon soda)', 'goli soda|banta|banta soda|marble soda|lemon soda');
    put('Bhutta, roasted, with lemon and salt (desi corn on the cob)', 'bhutta|butta|roasted bhutta|bhutta roasted|roasted corn|corn cob|roasted corn cob|desi corn|masala bhutta|grilled corn|charcoal corn|corn roasted|grilled corn cob');
    put('Sweet corn cup with butter (masala corn, corn chaat)', 'corn chaat|masala corn|sweet corn cup|corn cup|butter corn|american corn cup|sweet corn chaat|butter sweet corn');
    put('Jamun (jambul, naval pazham, neredu, nerale)', 'jamun|jamun fruit|java plum|black plum|jambul|naval pazham|indian blackberry|jambolan|neredu');
    put('Sitaphal (custard apple, sharifa, seetha pazham)', 'custard apple|sitaphal|sitafal|sugar apple|sharifa|seetha pazham|seethaphal');
    put('Chikoo (sapota, chiku)', 'chikoo|chiku|sapota|sapodilla|chickoo');
    put('Kathal, ripe (jackfruit bulbs, chakka, palapazham, phanas)', 'jackfruit|ripe jackfruit|jackfruit bulb|kathal|chakka pazham|palapazham|phanas|jack fruit');
    put('Nungu (ice apple, tadgola, palm fruit, thati munjalu)', 'ice apple|nungu|tadgola|palm fruit|palmyra fruit|toddy palm fruit|thati munjalu');
    put('Amla (Indian gooseberry, nellikai, usirikaya)', 'amla|indian gooseberry|nellikai|nellikka|amla fruit|gooseberry');
    put('Fruit chaat (cut fruits with chaat masala and lemon)', 'fruit chaat|fruit chat|chaat fruit|cut fruit chaat|masala fruit');
    put('Jungle jalebi (ganga imli, kodukkapuli, Manila tamarind)', 'jungle jalebi|ganga imli|manila tamarind|kodukkapuli|vilayati imli');
    put('Ber (Indian jujube, bor, elanthai, regu pandu)', 'ber|indian jujube|ber fruit|elanthai|jujube|bor fruit');
    put('Shakarkandi, roasted (sweet potato, plain)', 'shakarkandi|roasted shakarkandi|roasted sweet potato|shakarkand|baked sweet potato');
    put('Shakarkandi chaat (roasted sweet potato with lemon and chaat masala)', 'shakarkandi chaat|sweet potato chaat|shakarkand chaat');
    put('Sweet lassi, thick (Punjabi lassi)', 'punjabi lassi|thick lassi|sweet lassi|meethi lassi|lassi sweet');
    put('Roasted chana (bhuna chana, phutana, futana)', 'roasted chana|bhuna chana|roasted gram|phutana|futana|roasted chickpea|chana roasted|roasted bengal gram');
    put('Murmura (puffed rice, mandakki, pori, kurmura)', 'murmura|puffed rice|mandakki|kurmura|muri|pori');
    put('Jhal muri (puffed rice with mustard oil, Kolkata)', 'jhal muri|jhalmuri|jhaal muri');
    put('Bhel puri', 'bhel|bhel puri|bhelpuri|bhel poori|bhel chaat');
    put('Singhara, raw (water chestnut, shingada)', 'singhara|water chestnut|shingada|singhada');
    put('Vada', 'vada|medu vada|uzhunnu vada|ulundu vadai|vadai|medhu vadai|urad vada');
    put('Rice kheer (Chawal ki kheer)', 'kheer|rice kheer|payasam|rice payasam|chawal kheer');
    put('Vegetable curry', 'vegetable curry|veg curry|mixed vegetable curry|mix veg|mixed veg|mixed vegetable|mixed vegetable sabzi|sabzi|subzi|sabji|mixed sabzi|vegetable sabzi|veg sabzi');
    put('Dal tadka (toor dal)', 'dal|daal|dhal|dal tadka|dal fry|yellow dal|toor dal|arhar dal|tuvar dal');
    put('Rice dal porridge (Chawal dal ki khichdi/khichri)', 'khichdi|khichri|khichadi|moong dal khichdi|dal khichdi');
    put('Rasam with tamarind (Puli rasam/ Chintapandu rasam/ Charu/Saaru)', 'rasam|puli rasam|tamarind rasam|tomato rasam|pepper rasam|saaru|charu|chaaru');
    put('Jeera rice with basmati rice', 'jeera rice|cumin rice|zeera rice');
    put('Rice, brown, wholegrain, boiled in unsalted water', 'brown rice|rice brown');
    put('Filter coffee with milk and sugar', 'coffee|filter coffee|milk coffee|kaapi|kapi|south indian coffee');
    put('Dates, dried, flesh and skin', 'date|dates|khajoor|khajur|dried date|dry date');
    put('Walnuts, kernel only', 'walnut|akhrot');
    put('Puri, homemade', 'poori|puri|puri bhaji|poori masala');
    put('Ladoo, round ball', 'ladoo|laddu|laddoo|besan ladoo|boondi ladoo');
    put('Paneer in butter sauce', 'paneer butter masala|paneer makhani|butter paneer|paneer butter');
    put('Butter chicken', 'butter chicken|chicken makhani|murgh makhani');
    return o;
  })();
  const CHAIN2 = new Set(['burger', 'pizza', 'la', 'third', 'wow', 'taco', 'dunkin', 'baskin', 'cafe', 'biryani', 'madurai', 'hotel', 'the', 'k']);
  const isChainRow = x => (x.src >= 9 && x.src <= 12) || x.src === 14 || /^Restaurant chains: /.test((DB && DB.gr[x.gr]) || '');      // v1.34: the famous places too
  const RAWOK = /fruit|vegetable|nut|seed|salad|banana|apple|citrus|berr|melon|grape|tomato|lettuce|onion|carrot|cucumber|mango|orange/i;
  // v1.15: a line is tried as written without its brackets, then each name around a "/" ("Beetroot poriyal / stir-fry"), then the dish
  // before "with" ("Sambar with carrots and shallots") or before a comma, then what the brackets say; the first that finds a food wins
  let lastSure = false;                // v1.16: the last bestRow found the food itself (an alias, or every word with at most one more)
  const SAUCES = [[/\b(red|arrabbiata|arrabiata|marinara|napoletana) sauce\b/gi, 'tomato-based sauce'], [/\b(white|alfredo|bechamel|béchamel|cheese|creamy) sauce\b/gi, 'cream sauce'],
    [/\b(arrabb?iata|marinara|napoletana)\b/gi, 'in tomato-based sauce'], [/\balfredo\b/gi, 'in cream sauce']];       // "Penne alfredo" is a pasta in cream sauce
  // v1.15/1.16: the ways a line can be written, tried in order: each name around a "/" ("Beetroot poriyal / stir-fry") with what
  // comes after "with" as a detail that may or may not be in the food's name ("Sambar with carrots and shallots"); then the dish
  // before a comma or "in"; what the brackets say; the last word when it is a kind of dish. Only the first way may be a loose match,
  // and only a match of the first way is "sure".
  const stemsOf = t => [...new Set(fold(t).replace(/\b\d+(\.\d+)?\b/g, ' ').split(' ').filter(w => w.length > 2 && !LSTOP.has(w) && !/^\d/.test(w)).map(lstem))];
  function bestRow(name, strict, opts) {
    lastSure = false;
    if (!DB) return null;
    let raw = String(name || ''); for (const [re, to] of SAUCES) raw = raw.replace(re, to);
    const main = raw.replace(/\([^)]*\)/g, ' '), tries = [], seen = new Set();
    const add = (x, tail) => { x = String(x || '').trim(); if (x && !isAmt(x) && !seen.has(x)) { seen.add(x); tries.push([x, tail || []]); } };
    const alts = main.split('/').map(x => x.trim()).filter(Boolean);
    for (const a of alts) { const [hd, ...tl] = a.split(/\bwith\b/i); add(hd, stemsOf(tl.join(' '))); }
    for (const a of alts) { const hd = a.split(/\bwith\b/i)[0]; add(hd.split(',')[0]); add(hd.split(/\bin\b/i)[0].split(',')[0]); }
    (raw.match(/\(([^)]*)\)/g) || []).forEach(x => add(x.slice(1, -1)));
    const hw = lastWord(main.split(/\b(?:with|in)\b|,/i)[0]);                       // "Mushroom pasta in cream sauce" is a pasta
    if (hw && DISHW.has(hw)) add(hw);                                                  // "Mixed vegetable sambar" → sambar
    for (let i = 0; i < tries.length; i++) {
      const r = bestOne(tries[i][0], strict || i > 0, opts, hw, tries[i][1]); if (!r) continue;
      let sure = i === 0 && lastSure;
      if (!sure) for (let j = i + 1; j < tries.length; j++) { const r2 = bestOne(tries[j][0], true, opts, hw, []); if (r2 && r2.id === r.id && lastSure) { sure = true; break; } }
      lastSure = sure;
      return r;
    }
    return null;
  }
  const DISHW = new Set('sambar sambhar rasam curry poriyal thoran kootu kuzhambu kurma korma dal daal rice biryani pulao khichdi pongal dosa idli uttapam roti chapati paratha sabzi sabji fry upma poha halwa kheer payasam salad soup raita chutney pickle vada bonda bajji pakora samosa roll sandwich burger pizza noodles pasta spaghetti penne macaroni fettuccine lasagna lasagne risotto wrap burrito taco stew porridge cake ladoo tikka kebab omelette bhurji'.split(' ').map(lstem));
  function lastWord(name) { const w = fold(name).replace(/\b\d+(\.\d+)?\b/g, ' ').split(' ').filter(x => x.length > 2 && !LSTOP.has(x) && !/^\d/.test(x)); return w.length ? lstem(w[w.length - 1]) : ''; }
  const VEGN = new Set(['vegetable', 'vegetabl', 'veg', 'veggie']);
  const SEASONW = new Set('salt pepper lemon lime chilli chili spice spices herb herbs coriander cilantro mint ketchup vinegar seasoning'.split(' ').map(lstem)), RICEW = lstem('rice');      // v1.21.5
  const PASTAW = new Set('penne spaghetti fettuccine fettucine macaroni fusilli linguine rigatoni farfalle noodle'.split(' ').map(lstem));
  // a food that is a part of a dish: its name starts with one ("Sauce, pasta, white") or its dish before "with" or a comma is one ("Spaghetti sauce with added vegetables")
  const isPart = nm => PARTW.has(lstem(nm.split(' ')[0])) || PARTW.has(lastWord(nm.split(/\bwith\b|,/)[0]));
  const MEATW = new Set('ham bacon beef pork meat meatball chicken turkey mutton lamb goat fish tuna salmon prawn shrimp crab sausage pepperoni egg'.split(' ').map(lstem));
  function bestOne(name, strict, opts, hw, tail) {
    const out = !!(opts && opts.out);
    tail = (tail || []).filter(w => !LPLAIN.has(w));
    const q = fold(name).replace(/\b\d+(\.\d+)?\b/g, ' ');
    const words = [...new Set(q.split(' ').filter(w => w.length > 2 && !LSTOP.has(w) && !/^\d/.test(w)).map(lstem))];
    if (!words.length) return null;
    const wk = words.filter(w => !LPLAIN.has(w) || (w === 'white' && words.includes('egg'))).join(' ');
    const ak = (NW() && ALIAS2[wk]) || ALIAS[wk], al = ak && DB.list.find(x => x.name === ak);
    // v1.21.5: plain rice is the alias for "rice", but a line that names foods after "with" ("Rice with soya chunks and vegetables",
    // "Rice with sambar") is the rice dish of them when the list has one: a rice whose name has every one of those foods.
    // Vegetables in general and seasonings (salt, lemon…) don't make a dish.
    const riceTail = al && words.length === 1 && words[0] === RICEW ? tail.filter(w => !words.includes(w) && !VEGW.has(w) && !VEGN.has(w) && !SEASONW.has(w)) : [];
    if (al && !riceTail.length) { lastSure = true; return al; }
    const all = words.concat(tail.filter(w => !words.includes(w)));
    const veg = all.some(w => VEGW.has(w)), part = PARTW.has(hw || words[words.length - 1]);      // the line itself is a sauce (or the like)
    const said = new Set(all), meatSaid = all.some(w => MEATW.has(w));
    const qw = new Set(fold(name + ' ' + tail.join(' ')).split(' ')), syn = new Set(); all.forEach(w => (SYN[w] || []).forEach(x => syn.add(lstem(fold(x)))));
    const lw = hw && DISHW.has(hw) && words.includes(hw) ? hw : words.length >= 2 && DISHW.has(words[words.length - 1]) ? words[words.length - 1] : '';
    const has = (nw, w) => nw.has(w) || (SYN[w] || []).some(y => nw.has(lstem(fold(y)))) || (VEGW.has(w) && [...VEGN].some(v => nw.has(v))) || (PASTAW.has(w) && nw.has('pasta'));
    let best = null, bs = -1e9, bq = null;
    const cands = search(words.join(' '), -1).slice(0, 80), ids = new Set(cands.map(x => x.id));
    const more = q2 => { if (q2) for (const x of search(q2, -1).slice(0, 40)) if (!ids.has(x.id)) { ids.add(x.id); cands.push(x); } };
    if (veg || tail.length) more(all.filter(w => !VEGW.has(w)).join(' '));            // "with added vegetables" for a mushroom pasta
    if (all.some(w => PASTAW.has(w))) more(all.map(w => (PASTAW.has(w) ? 'pasta' : w)).filter(w => !VEGW.has(w)).join(' '));      // spaghetti, penne… are pasta in the tables
    for (const x of cands) {
      if (x.src === 8 || x.src === 7) continue;                                       // packets and brands only by their own name
      const nm = fold(x.name), cw = nm.split(' ').filter(w => w.length > 2 && !LSTOP.has(w)).map(lstem), nw = new Set(cw);
      const mw = new Set(fold(String(x.name).replace(/\([^)]*\)/g, ' ')).split(' ').filter(w => w.length > 2 && !LSTOP.has(w)).map(lstem));      // without the other names in brackets
      if (isChainRow(x)) { const n0 = nm.split(' '), chain = n0.slice(0, CHAIN2.has(n0[0]) ? 2 : 1); if (!chain.every(w => qw.has(w))) continue; }      // a chain's dish only when the line names the chain
      if (/\begg (white|yolk)\b/.test(nm) && !/\b(white|yolk)\b/.test(q)) continue;      // an egg is the whole egg
      if (!part && isPart(nm)) continue;                                                 // v1.16: a sauce only when the line is a sauce
      if (lw && !has(nw, lw)) continue;
      const hit = words.filter(w => has(nw, w)).length, cover = hit / words.length, opt = tail.filter(w => !words.includes(w) && has(nw, w)).length;
      if (cover < 0.6) continue;
      const rawOk = RAWOK.test(DB.gr[x.gr] || '');                                    // fruit, vegetables and nuts are eaten raw
      if (/\b(raw|uncooked|dry|dried|powder|flour|mix|premix|instant|frozen|canned)\b/.test(nm.replace(rawOk ? /\braw\b/g : /^$/, ' ')) && !/\b(raw|dry|dried|powder|salad|instant)\b/.test(q)) continue;
      // words the line didn't say count against a food, except the plain ones ("white, cooked" rice is just rice); meat it didn't say, more
      const ex = [...mw].filter(w => !said.has(w) && !LPLAIN.has(w) && !syn.has(w) && !(rawOk && w === 'raw') && !(veg && VEGN.has(w)) && w !== 'added' && !(VEGN.has(w) && all.some(v => VEGN.has(v))));
      const extra = ex.length, meat = meatSaid ? 0 : ex.filter(w => MEATW.has(w)).length;
      if (strict && (cover < 1 || extra > (words.length >= 2 ? 1 : 0))) continue;      // v1.14: by name alone, only the food itself ("Dates" is not a date chutney)
      // v1.16: eaten out, the restaurant version of a dish; at home, the home-made one
      const rest = /\b(restaurant|takeaway|take away)\b/.test(nm), home = /\b(home recipe|homemade|home made)\b/.test(nm);
      const sc = cover * 10 - extra * 0.6 - meat * 2.4 + opt * 2 + (cover === 1 && !extra ? 1 : 0) + (x.pop ? 1.5 : 0) + ([1, 6, 9, 10, 11].includes(x.src) ? 0.8 : 0) + (out ? (rest ? 1.2 : home ? -0.6 : 0) : (home ? 1.2 : rest ? -0.6 : 0)) - (/\b(ready to heat|frozen meal|diet)\b/.test(nm) ? 1 : 0);
      if (sc > bs) { bs = sc; best = x; bq = { cover, extra }; }
    }
    if (al) {                                                                           // v1.21.5: the rice dish, or plain rice after all
      const bw = best && new Set(fold(best.name).split(' ').filter(w => w.length > 2 && !LSTOP.has(w)).map(lstem));
      if (!(best && riceTail.every(w => has(bw, w)) && lastWord(String(best.name).split(/\bwith\b|,|\(/i)[0]) === RICEW)) { lastSure = true; return al; }
    }
    if (best) lastSure = bq.cover === 1 && bq.extra <= 1;
    return best;
  }
  // v1.16: the AI only says what a food is and how much; its numbers are never used. Every line gets a food from the list: the match
  // above, or the closest guess (sure: false, so the line says "Check this" and offers the closest foods). No grams: the food's own
  // first portion. Very far from what the AI thought it was (4×): probably another food, so also "Check this".
  function guessRow(name, opts) {
    const main = String(name || '').replace(/\([^)]*\)/g, ' ');
    const ws = fold(main).replace(/\b\d+(\.\d+)?\b/g, ' ').split(' ').filter(w => w.length > 2 && !LSTOP.has(w) && !LPLAIN.has(w) && !/^\d/.test(w));
    for (const w of ws.slice().reverse()) { const r = bestOne(w, true, opts, ''); if (r) return r; }   // the dish word first ("pasta"), then the rest
    return search(ws.join(' '), -1).find(x => x.src !== 7 && x.src !== 8 && (x.src < 9 || x.src > 12) && !isPart(fold(x.name))) || null;
  }
  const firstGrams = f => { const d = (f.units || [])[f.def]; if (NW() && d && d.g > 0 && (d.gram || f.defQ > 0)) return d.g * (f.defQ > 0 ? f.defQ : d.gram ? 100 : 1); const u = d && !d.gram && !d.ml && d.g > 0 ? d : (f.units || []).find(u => !u.gram && !u.ml && u.label !== 'oz' && u.g > 0); return u ? u.g : 100; };
  function lineFood(name, g, opts) {
    if (!DB) return null;
    opts = opts || {};
    let best = bestRow(name, false, opts), sure = lastSure;
    if (!best) { best = guessRow(name, opts); sure = false; }
    if (!best) return null;
    const f = dbFood(best), grams = g > 0 ? g : firstGrams(f), v = {}, match = sure;          // match (v1.20): the name alone matched surely
    for (const m of ['kcal', 'p', 'c', 'f', 'fib']) v[m] = num(f.base[m]) * grams / 100;
    if (!(g > 0) || (opts.ai > 0 && (v.kcal > opts.ai * 4 || v.kcal * 4 < opts.ai))) sure = false;      // 4×: the AI guesses low, but not that low
    return { name: best.name, fid: best.id, src: best.src, g: grams, v, sure, match };
  }
  // the numbers of a food the person picked, for the line's grams
  function valuesAt(fid, g) {
    const x = DB && DB.byId.get(fid); if (!x) return null;
    const f = dbFood(x), grams = g > 0 ? g : firstGrams(f), v = {};
    for (const m of ['kcal', 'p', 'c', 'f', 'fib']) v[m] = num(f.base[m]) * grams / 100;
    return { name: x.name, fid: x.id, g: grams, v };
  }
  // the closest foods for a line, for "Check this": the pick first, then the list's own search for its words (no packets or chains)
  function altsFor(name, opts, fid) {
    if (!DB) return [];
    let nm0 = String(name || ''); for (const [re, to] of SAUCES) nm0 = nm0.replace(re, to);
    const main = nm0.replace(/\([^)]*\)/g, ' ');
    const ws = fold(main).replace(/\b\d+(\.\d+)?\b/g, ' ').split(' ').filter(w => w.length > 2 && !LSTOP.has(w) && !/^\d/.test(w));
    const hw = lastWord(main.split(/\b(?:with|in)\b|,/i)[0]), partOk = PARTW.has(hw);
    const names = new Set(), out = [], seen = new Set(fid ? [fid] : []), push = x => { if (x && !seen.has(x.id) && !names.has(x.name) && x.src !== 7 && x.src !== 8 && (x.src < 9 || x.src > 12) && (partOk || !isPart(fold(x.name)))) { seen.add(x.id); names.add(x.name); out.push(x); } };
    if (fid && DB.byId.get(fid)) names.add(DB.byId.get(fid).name);
    push(bestRow(name, false, opts)); push(guessRow(name, opts));
    for (const x of search(ws.join(' '), -1).slice(0, 30)) { push(x); if (out.length >= 6) break; }
    if (out.length < 6 && ws.some(w => PASTAW.has(lstem(w)))) for (const x of search(ws.map(w => (PASTAW.has(lstem(w)) ? 'pasta' : w)).join(' '), -1).slice(0, 30)) { push(x); if (out.length >= 6) break; }
    if (out.length < 6) { const h = lastWord(main.split(/\b(?:with|in)\b|,/i)[0]); if (h) for (const x of search(h, -1).slice(0, 20)) { push(x); if (out.length >= 6) break; } }
    return out.slice(0, 6).map(x => ({ id: x.id, name: x.name, kcal: Math.round(num(dbFood(x).base.kcal)) }));
  }
  function searchList(q) {
    if (!DB || !String(q || '').trim()) return [];
    return search(q, -1).filter(x => x.src !== 8).slice(0, 8).map(x => ({ id: x.id, name: x.name, kcal: Math.round(num(dbFood(x).base.kcal)) }));
  }
  function tableFor(name, g, aiKcal, opts) {
    if (!DB || !(g > 0)) return null;
    const best = bestRow(name, false, opts); if (!best) return null;
    const f = dbFood(best), k = g / 100, v = {};
    for (const m of ['kcal', 'p', 'c', 'f', 'fib']) v[m] = num(f.base[m]) * k;
    if (aiKcal > 0 && (v.kcal > aiKcal * 2.5 || v.kcal * 2.5 < aiKcal)) return null;
    return { name: best.name, fid: best.id, src: best.src, g, v, oil: f.oil || 0 };
  }
  // v1.14: a food logged by its name only (typed, a web answer, a photo line the list couldn't count) gets the list's food of that
  // name for its vitamins and minerals: { fid, name, g } with the grams its calories make (the calories stay as logged). Not for a
  // name that is several foods ("Rice, dal, sabzi"), and not when the grams would be past belief.
  function nameFor(name, kcal) {
    if (!DB || !(kcal > 0) || /\b(whey|protein|shake|supplement|powder|capsules?|tablets?|gainer)\b/i.test(name)) return null;     // supplements are logged as supplements
    const parts = String(name || '').replace(/\([^)]*\)/g, ' ').replace(/\bwith\b.*$/i, ' ').split(/,|\+|&|\band\b/i).map(x => x.trim()).filter(x => x && !isAmt(x));
    if (parts.length !== 1) return null;                                    // several foods in one name ("Rice, dal, sabzi")
    const best = bestRow(parts[0], true); if (!best) return null;
    const per = num(dbFood(best).base.kcal); if (!(per >= 5)) return null;
    const g = kcal / per * 100; if (!(g >= 1 && g <= 2500)) return null;
    return { fid: best.id, name: best.name, g: Math.round(g) };
  }
  // a photo line (or a typed food, a web answer) whose numbers aren't the list's: its name's food, for vitamins and minerals. With
  // grams, only a food whose calories for those grams are near its own (else it is probably another food); without, nameFor.
  function matchLine(o) {
    if (!DB || o.fid || !(num(o.kcal) > 0)) return o;
    delete o.mfid; delete o.mg;
    if (num(o.g) > 0) { const t = tableFor(o.name, num(o.g), num(o.kcal)); if (t) { o.mfid = t.fid; o.mg = Math.round(num(o.g)); } return o; }
    const m = nameFor(o.name, num(o.kcal)); if (m) { o.mfid = m.fid; o.mg = m.g; }
    return o;
  }
  // v1.14: the app's own numbers for what was logged without a food from the list, once for each entry (rc). A photo meal's lines
  // that have grams get the list's calories, protein, carbs, fat and fibre for those grams (the lines are what the AI saw, the
  // numbers are the app's); every other line, and a typed food or a web answer, keeps its calories and gets its name's food for
  // vitamins and minerals. Returns how many photo lines got new numbers. A meal whose total was set by hand keeps it.
  const RC = 4;                         // v1.15: entries counted by v1.14 (rc 1) are tried again with the better matching; v1.16 (rc 3): no AI numbers left; v1.21.5 (rc 4): rice with soya chunks, sambar, curd or ghee is that rice dish
  function fixEntry(e) {
    if (!e || (e.rc || 0) >= RC || e.src === 'left') return 0;
    let ch = 0;
    if (Array.isArray(e.items) && e.items.length && !e.fid) {
      const sum0 = e.items.reduce((a, x) => a + Math.round(num(x.kcal)), 0), whole = Math.abs(sum0 - num(e.kcal)) <= 2;
      for (const x of e.items) {
        if (x.pk || x.how) continue;                                         // the person picked this food themselves; v1.26: or it was worked out from its nutrients or a pack's label
        // v1.16: every line from the food list, matched again (1.14 and 1.15 sometimes took a sauce for the dish). A line without
        // grams (before 1.12) keeps its calories, as grams of the list's food.
        let t = whole ? lineFood(x.name, num(x.g), { out: !!(e.out || e.at), ai: num(x.kcal) }) : null;
        if (t && !(num(x.g) > 0) && num(x.kcal) > 0 && t.v.kcal > 0) t = Object.assign(valuesAt(t.fid, t.g * num(x.kcal) / t.v.kcal), { sure: false });
        if (t) {
          const was = x.fid, k0 = Math.round(num(x.kcal));
          for (const k of ['kcal', 'p', 'c', 'f', 'fib']) { const v = k === 'kcal' ? Math.round(t.v.kcal) : r1(t.v[k]); if (v > 0 || k === 'kcal') x[k] = v; else delete x[k]; }
          x.fid = t.fid; x.g = Math.round(t.g); delete x.mfid; delete x.mg; if (t.sure) { delete x.chk; delete x.fn; } else { x.chk = 1; x.fn = t.name; }
          if (was !== x.fid || k0 !== x.kcal) ch++;
        } else if (!x.fid && !x.mfid) matchLine(x);
      }
      if (ch) {
        e.kcal = e.items.reduce((a, x) => a + Math.round(num(x.kcal)), 0);
        for (const k of ['p', 'c', 'f', 'fib']) { const v = r1(e.items.reduce((a, x) => a + num(x[k]), 0)); if (v > 0) e[k] = v; else delete e[k]; }
      }
    } else if (!e.fid && num(e.kcal) > 0 && e.name) matchLine(e);
    e.rc = RC;
    return ch;
  }
  // a meal's leftovers follow its lines' new numbers (each part keeps its share)
  function fixLeft(ids) {
    for (const lv of D.food || []) {
      if (lv.src !== 'left' || !lv.left || !Array.isArray(lv.left.parts)) continue;
      let ch = false;
      for (const p of lv.left.parts) {
        if (!ids.has(p.of) || p.item == null) continue;
        const e = D.food.find(x => x.id === p.of), x = e && e.items && e.items[p.item]; if (!x) continue;
        const s = num(p.share); if (!(s > 0)) continue;
        for (const k of ['kcal', 'p', 'c', 'f', 'fib']) p[k] = r1(num(x[k]) * s);
        if (x.fid || x.mfid) { p.fid = x.fid || x.mfid; const g = num(x.g) > 0 ? num(x.g) : num(x.mg); if (g > 0) p.g = Math.round(g * s); }
        ch = true;
      }
      if (ch) {
        lv.kcal = -Math.round(lv.left.parts.reduce((a, p) => a + num(p.kcal), 0));
        for (const k of ['p', 'c', 'f', 'fib']) { const v = r1(lv.left.parts.reduce((a, p) => a + num(p[k]), 0)); if (v > 0) lv[k] = -v; else delete lv[k]; }
      }
    }
  }
  const needsFix = e => e && (e.rc || 0) < RC && e.src !== 'left' && !e.sp && (Array.isArray(e.items) && e.items.length ? !e.fid : !e.fid && num(e.kcal) > 0 && !!e.name);
  let fixing = null;
  // every entry still to do; past photo meals whose calories change are said once, with Undo
  function recount() {
    if (fixing) return fixing;
    if (!(D.food || []).some(needsFix)) return Promise.resolve(0);
    fixing = loadDb().then(async () => { try {
      const todo = D.food.filter(needsFix); if (!todo.length) return 0;
      const before = new Map(todo.map(e => [e.id, JSON.parse(JSON.stringify(e))])), lefts = D.food.filter(e => e.src === 'left').map(e => [e, JSON.parse(JSON.stringify(e))]);
      let kcal0 = 0, kcal1 = 0; const meals = [];
      for (let i = 0; i < todo.length; i++) {                              // a few at a time, so the screen never stalls
        const e = todo[i], k0 = num(e.kcal), n = fixEntry(e); if (n) { kcal0 += k0; kcal1 += num(e.kcal); meals.push(e.id); }
        if (i % 4 === 3) await new Promise(r => setTimeout(r, 0));
      }
      if (meals.length) fixLeft(new Set(meals));
      S.save(true);
      if (A.top().name === 'calories') A.rerender();
      if (meals.length) {
        const d = Math.round(kcal1 - kcal0), say = `${meals.length} photo meal${meals.length === 1 ? '' : 's'} recounted from the food list${d ? ` · ${d > 0 ? '+' : '−'}${n0(Math.abs(d))} kcal in all` : ''}`;
        const undo = window.Motion && window.Motion.undoToast;
        if (undo) undo(say, () => {
          for (const e of D.food) { const b = before.get(e.id); if (b && meals.includes(e.id)) { for (const k of Object.keys(e)) delete e[k]; Object.assign(e, b, { rc: RC }); (e.items || []).forEach(matchLine); } }
          for (const [e, b] of lefts) if (D.food.includes(e)) { for (const k of Object.keys(e)) delete e[k]; Object.assign(e, b); }
          S.save(true); if (A.top().name === 'calories') A.rerender();
        }); else toast(say);
      }
      return meals.length;
    } finally { fixing = null; } }, () => { fixing = null; return 0; }).catch(() => 0);
    return fixing;
  }
  const SHORT = ['USDA', 'INDB', 'USDA', 'UK', 'AU', 'FAO', 'GymDay', 'Label', 'Pack', 'Menu', 'Menu', 'Menu, est.', 'Est.', 'ICMR-NIN', 'Menu, est.'];          // the table each food comes from, short, for lists
  const myId = id => 'y:' + id, recId = id => 'r:' + id, supId = id => 'n:' + id;
  // v1.27 Your usual portion: the amount of a food the person chose themselves, the middle one of their last 12 in 120 days:
  // foods added from the list, My foods or a scan with an amount, and photo or typed lines whose grams they typed or picked
  // (gw). Grams the AI estimated are never learned from. At least 3 are needed. { g, n } or null.
  let usualMemo = null, usualKey = '';
  function usualMap() {
    const last = D.food[D.food.length - 1], key = D.food.length + ':' + (last ? last.id + ':' + (last.u || 0) : '');
    if (usualMemo && usualKey === key) return usualMemo;
    const since = Date.now() - 120 * 86400000, by = new Map(), add = (fid, g, t) => { if (!fid || !(g > 0)) return; if (!by.has(fid)) by.set(fid, []); by.get(fid).push([t, g]); };
    for (const e of D.food) {
      if (!(e.t >= since)) continue;
      if (Array.isArray(e.items) && e.items.length) { for (const x of e.items) if (x.gw) add(x.fid || x.kf, num(x.g), e.t); }
      else if (e.fid && (e.src === 'list' || e.src === 'my' || e.src === 'scan')) add(e.fid, num(e.g), e.t);
    }
    const out = new Map();
    for (const [fid, a] of by) { if (a.length < 3) continue; const g = a.sort((x, y) => y[0] - x[0]).slice(0, 12).map(x => x[1]).sort((x, y) => x - y); out.set(fid, { g: Math.round(g[Math.floor((g.length - 1) / 2)]), n: g.length }); }
    usualMemo = out; usualKey = key; return out;
  }
  const usual = fid => (fid ? usualMap().get(fid) || null : null);
  function myFood(m) {
    const base = { kcal: num(m.kcal), p: num(m.p), c: num(m.c), f: num(m.f), fib: num(m.fib), cr: num(m.cr) };       // per serving
    const units = [{ label: m.per || '1 serving', f: 1, g: m.g > 0 ? m.g : 0 }];
    if (m.g > 0 && m.pack > 0 && Math.abs(m.pack - m.g) >= 0.6) units.push({ label: '1 pack', g: m.pack, f: m.pack / m.g });          // 1.21.1: a scanned packet's size
    if (m.g > 0) { units.push({ label: 'g', g: 1, f: 1 / m.g, gram: true }); units.push({ label: 'oz', g: 28.35, f: 28.35 / m.g }); }
    return { fid: myId(m.id), name: m.name, sub: m.code ? 'My foods · barcode ' + m.code : m.lab ? 'My foods · from its label' : 'My foods', base, units, def: 0, kind: 'my', code: m.code || '' };
  }
  function recipeFood(r) {
    const n = Math.max(1, num(r.serves) || 1), tot = recipeTotal(r), base = times(tot, 1 / n);
    const units = [{ label: '1 serving', f: 1 }, { label: `whole recipe (${fmtQ(n)} serving${n === 1 ? '' : 's'})`, f: n }];
    if (r.cooked > 0) { const per = r.cooked / n; units[0].g = per; units.push({ label: 'g', g: 1, f: 1 / per, gram: true }); }
    return { fid: recId(r.id), name: r.name, sub: `My recipe · ${r.items.length} ingredient${r.items.length === 1 ? '' : 's'}`, base, units, def: 0, kind: 'recipe' };
  }
  function suppFood(sp) {
    const base = { kcal: num(sp.kcal), p: num(sp.p), c: num(sp.c), f: num(sp.f), fib: num(sp.fib), cr: num(sp.cr) };
    const units = [{ label: sp.serv || '1 serving', f: 1, g: sp.g > 0 ? sp.g : 0 }];
    if (sp.g > 0) units.push({ label: 'g', g: 1, f: 1 / sp.g, gram: true });
    return { fid: supId(sp.id), name: suppName(sp), sub: KIND[sp.kind] || 'Supplement', base, units, def: 0, kind: 'supp' };
  }
  // a product from Open Food Facts: per 100 g when the label gives it, otherwise per serving
  function offFood(p) {
    const has100 = p.per100 && p.per100.kcal != null, base = Object.assign(zero(), has100 ? p.per100 : p.perServ || {});
    const units = [];
    if (has100) {
      if (p.servG > 0) units.push({ label: p.serv ? `serving (${p.serv})` : `serving (${g1(p.servG)} g)`, g: p.servG, f: p.servG / 100 });
      const pg = qtyG(p.qty); if (pg > 0 && !(p.servG > 0 && Math.abs(pg - p.servG) < 0.6)) units.push({ label: '1 pack', g: pg, f: pg / 100 });          // 1.21.1: the whole packet
      units.push({ label: 'g', g: 1, f: 0.01, gram: true }); units.push({ label: 'oz', g: 28.35, f: 0.2835 });
    } else units.push({ label: p.serv ? `serving (${p.serv})` : '1 serving', f: 1, g: p.servG || 0 });
    return { fid: 'o:' + p.code, name: p.name, sub: 'Open Food Facts' + (p.code ? ' · ' + p.code : ''), base, units, def: 0, kind: 'off', per100: has100, off: p };
  }
  // an entry with no food behind it (typed, a photo): the same again
  function againFood(e) {
    return { fid: '', name: e.name, sub: 'Same as ' + (e.src === 'ai' || e.src === 'photo' ? 'the photo' : 'before'), base: { kcal: e.kcal || 0, p: e.p || 0, c: e.c || 0, f: e.f || 0, fib: e.fib || 0, cr: e.cr || 0 }, units: [{ label: e.per && !/same as/.test(e.per) ? e.per : 'as before', f: 1 }], def: 0, kind: 'again', from: e };
  }
  function foodById(fid) {
    if (!fid) return null;
    const [k, id] = [fid.slice(0, 2), fid.slice(2)];
    if (k === 'y:') { const m = D.myFoods.find(x => String(x.id) === id); return m ? myFood(m) : null; }
    if (k === 'r:') { const r = D.recipes.find(x => String(x.id) === id); return r ? recipeFood(r) : null; }
    if (k === 'n:') { const s = D.supps.find(x => String(x.id) === id); return s ? suppFood(s) : null; }
    if (DB) { const x = DB.byId.get(fid); return x ? dbFood(x) : null; }
    return null;
  }

  // =====================================================================================================
  // Logging
  // =====================================================================================================
  function entryOf(food, q, ui, meal, t) {
    const u = food.units[ui] || food.units[0], v = times(food.base, u.f * q);
    const e = { id: S.uid(), t: t || stampMeal(meal), meal, name: String(food.name || 'Food').slice(0, 80), kcal: Math.max(0, Math.round(v.kcal)) };
    for (const k of ['p', 'c', 'f', 'fib', 'cr']) { const x = r1(v[k]); if (x > 0) e[k] = x; }
    if (food.fid) e.fid = food.fid;
    e.q = Math.round(q * 1000) / 1000; e.un = u.label;          // (u is the store's 'last changed' stamp on every record)
    if (u.g > 0) e.g = Math.round(u.g * q * 10) / 10;
    e.per = amountText(q, u);
    e.src = { db: 'list', my: 'my', recipe: 'recipe', supp: 'supp', off: 'scan', again: (food.from && food.from.src) || 'typed' }[food.kind] || 'list';
    if (food.kind === 'off') { e.b = food.base; e.uf = u.f; e.ul = food.units.map(x => [x.label, r1(x.f * 1000) / 1000, x.g || 0]); }
    if (food.kind === 'again' && food.from && food.from.pic) e.pic = food.from.pic;
    if (food.kind === 'again' && food.from && Array.isArray(food.from.items) && food.from.items.length) {      // v1.14: a photo meal again keeps its foods
      const k = u.f * q;
      e.items = food.from.items.map(x => { const o = { name: x.name, kcal: Math.round(num(x.kcal) * k) }; for (const m of ['p', 'c', 'f', 'fib']) if (num(x[m]) > 0) o[m] = r1(num(x[m]) * k);
        for (const m of ['g', 'mg']) if (num(x[m]) > 0) o[m] = Math.round(num(x[m]) * k); if (x.fid) o.fid = x.fid; if (x.mfid) o.mfid = x.mfid; return o; });
      if (food.from.rc) e.rc = food.from.rc;
    }
    return e;
  }
  function unitText(u) { if (!u) return ''; if (u.gram) return 'g'; if (u.ml) return 'ml'; if (u.label === 'oz') return 'oz'; return u.label.replace(/^1 pack\b/, '1 whole packet').replace(/^1 /, ''); }
  const plural = w => (/(ss|sh|ch|x|z)$/i.test(w) ? w + 'es' : /s$/i.test(w) ? w : /[^aeiou]y$/i.test(w) ? w.slice(0, -1) + 'ies' : w + 's');
  function amountText(q, u) {
    if (!u) return fmtQ(q);
    if (u.gram || u.ml || u.label === 'oz') return `${g1(q)} ${unitText(u)}`;
    // 1.21.1: "2 servings", "2 whole packets"; a size already in the name ("serving (250 ml)") is said once, as the total
    let name = unitText(u); const pm = name.match(/\s*\((?:about\s+)?([\d.,]+)\s*(g|ml)\)\s*$/i), ml = !!pm && /ml/i.test(pm[2]);          // 1.35.2: “(about 160 g)” too, so it isn't said twice
    if (pm && u.g > 0) name = name.slice(0, pm.index);
    if (q > 1) name = name.replace(/^(serving|whole packet)\b/, '$1s');
    const g = u.g > 0 ? ` (${g1(u.g * q)} ${ml ? 'ml' : 'g'})` : '';
    if (NW() && q > 1 && /^1 /.test(u.label)) name = name.replace(/^([^,(]*?)([a-z]+)(\s*)(?=$|[,(])/i, (m0, pre, w, sp) => (/^(katori|tsp|tbsp|oz|fl|g|ml|kg|nfs|medium|small|large|regular)$/i.test(w) ? m0 : pre + plural(w) + sp));      // 1.35.2 (59): 2 rotis, 3 idlis, 2 rumali rotis
    return /^1 /.test(u.label) || /^(serving|whole|as before)/.test(u.label) ? `${fmtQ(q)} ${name}${g}` : `${fmtQ(q)} × ${name}${g}`;
  }
  function log(e) { D.food.push(e); S.save(true); return e; }
  // an entry's food again, measured the way it was (for changing it)
  function foodOfEntry(e) {
    if (e.b && e.ul) return { fid: e.fid, name: e.name, sub: 'Open Food Facts', base: e.b, units: e.ul.map(x => ({ label: x[0], f: x[1], g: x[2], gram: x[0] === 'g' })), def: 0, kind: 'off' };
    return e.fid ? foodById(e.fid) : null;
  }

  // =====================================================================================================
  // Daily targets: from a goal and the everyday-burn estimate, with safe limits, or typed
  // =====================================================================================================
  const GOALS = [['lose', 'Lose a little'], ['keep', 'Keep my weight'], ['gain', 'Gain muscle']];
  const plan = () => st().kcPlan || null;
  const ageNow = () => (C.ageNow ? C.ageNow() : 0);
  // what a day like the last two weeks uses: everyday burn plus the average a day that workouts and activities added
  function upkeep(t) { const u = upkeepParts(t); return u ? u.m : null; }
  // v1.21.10: in its parts: the everyday burn, and what the last 14 days' workouts and activities added, as an average a day
  function upkeepParts(t) {
    const base = C.everyday ? C.everyday(t || Date.now()) : null; if (base == null) return null;
    const from = Date.now() - 14 * DAY, ws = D.sessions.filter(s => s.start >= from), sps = (D.sports || []).filter(x => x.t >= from);
    const sp = C.actBurn && C.addOf ? sps.reduce((a, x) => a + C.addOf(C.actBurn(x), x, C.everyday(x.t), false), 0) : 0;     // v1.17: activities too
    const wsAdd = ws.reduce((a, s) => a + (C.burnOf(s).net || 0), 0), extra = (wsAdd + sp) / 14;
    return { base, extra, wsN: ws.length, spN: sps.length, wsAdd, spAdd: sp, m: Math.round((base + extra) / 10) * 10 };
  }
  // the safe minimum a calorie target is never set below: the resting burn and a tenth more, at least 1,400 kcal (women), 1,600 (men)
  // or 1,500. 1.33: the charts' danger zone for calories starts under it (daily.js)
  function kcalFloor(t) { const rest = C.rest ? C.rest(t || Date.now()) || 0 : 0, sex = (st().me || {}).sex; return Math.max(rest * 1.1, sex === 'f' ? 1400 : sex === 'm' ? 1600 : 1500); }
  const kcalMin = t => Math.round(kcalFloor(t) / 10) * 10;
  // the least protein a body needs in a day (ICMR-NIN's RDA for the age and sex, see protRda), for the weight logged; 0 with no weight
  function protMin(t) { const kg = C.weightKg ? C.weightKg(t || Date.now()) || 0 : 0; return kg > 0 ? Math.round(protRda() * kg) : 0; }
  function auto(goal, t) {
    const m0 = upkeep(t); if (m0 == null) return null;
    const pl0 = plan(), adj = smartOn() && pl0 && pl0.auto && num(pl0.adj) ? num(pl0.adj) : 0, m = m0 + adj;          // v1.20: the smart target's change
    const kg = (C.weightKg && C.weightKg(t || Date.now())) || 70, young = ageNow() > 0 && ageNow() < 18;
    let kcal = m, note = '';
    if (goal === 'lose') {
      const cut = young ? Math.min(0.10 * m, 250) : Math.min(0.15 * m, 500);
      const floor = kcalFloor(t);
      kcal = Math.max(m - cut, Math.min(m, floor));
      note = young ? 'A small, gentle cut, because you are still growing. A doctor or dietitian can help with a plan that suits you.' : 'About 15% under what you use, never more than 500 kcal, and never below a safe minimum.';
    } else if (goal === 'gain') { kcal = m + Math.min(0.10 * m, 300); note = 'About 10% over what you use (at most 300 kcal), for slow, lean gains.'; }
    else note = 'What a day like your last two weeks uses.';
    kcal = Math.round(kcal / 10) * 10;
    return Object.assign(split(kcal, kg, goal === 'lose'), { kcal, goal, auto: true, note: adj ? note + ` It includes your smart change of ${adj > 0 ? '+' : '−'}${n0(Math.abs(adj))} kcal, from your weight trend.` : note, upkeep: m, kg, guessKg: !(C.weightKg && C.weightKg(Date.now())), adj, formula: m0 });
  }

  // =====================================================================================================
  // v1.20 Smart calorie target (Settings → Food: on until turned off). What a body really uses is what it ate, less what its weight
  // change stands for: over the last three weeks, the average of the days with food logged (at least 800 kcal and two foods, so
  // half-logged days don't count), minus the weight trend (a straight line through the weigh-ins) × 7,700 kcal a kg. When that is
  // 100 kcal or more away from GymDay's estimate, the Food tab suggests moving the target by the difference, at most 250 kcal at a
  // time and 500 in all (under 18: at most 200 down), rounded to 50. Nothing changes until the person taps to use it. It needs 4
  // weigh-ins over 10 days and 10 logged days; after a change it waits two weeks, after "Not now" one week.
  // =====================================================================================================
  function smartOn() { return st().kcSmart !== false; }
  function smartRead(now) {
    const pl = plan(); if (!pl || !pl.auto || !smartOn() || !C.dayOf) return null;
    const end = new Date(now || Date.now()).setHours(0, 0, 0, 0), from = end - 21 * DAY;
    const ws = (D.body || []).filter(x => x.kg > 0 && x.t >= from && x.t < end + DAY).sort((a, b) => a.t - b.t);
    const days = []; for (let t = from; t < end; t += DAY) { const d = C.dayOf(t); if (d.eaten >= 800 && d.food.filter(e => e.src !== 'left').length >= 2) days.push(d.eaten); }
    const okW = ws.length >= 4 && ws[ws.length - 1].t - ws[0].t >= 10 * DAY, okF = days.length >= 10;
    if (!okW || !okF) return { ready: false, weighs: ws.length, days: days.length };
    const xs = ws.map(w => (w.t - ws[0].t) / DAY), ys = ws.map(w => w.kg), mx = xs.reduce((a, x) => a + x, 0) / xs.length, my = ys.reduce((a, y) => a + y, 0) / ys.length;
    const den = xs.reduce((a, x) => a + (x - mx) * (x - mx), 0); if (!(den > 0)) return { ready: false, weighs: ws.length, days: days.length };
    const slope = xs.reduce((a, x, i) => a + (x - mx) * (ys[i] - my), 0) / den;                       // kg a day
    const ate = days.reduce((a, x) => a + x, 0) / days.length, used = ate - slope * 7700, est = upkeep(end);
    if (est == null) return null;
    const young = ageNow() > 0 && ageNow() < 18, old = num(pl.adj);
    let want = Math.round((used - est) / 50) * 50; want = Math.max(young ? -200 : -500, Math.min(500, want));
    let step = want - old; step = Math.max(-250, Math.min(250, step)); step = Math.round(step / 50) * 50;
    return { ready: true, slope, ate: Math.round(ate), used: Math.round(used), est, old, step, adj: old + step, weighs: ws.length, days: days.length, kgChange: slope * ((ws[ws.length - 1].t - ws[0].t) / DAY), span: Math.round((ws[ws.length - 1].t - ws[0].t) / DAY) };
  }
  function smartCard(t0) {
    const pl = plan(), today = new Date().setHours(0, 0, 0, 0); if (t0 !== today || !pl || !pl.auto || !smartOn()) return '';
    if (pl.smartSkip && Date.now() - pl.smartSkip < 7 * DAY) return '';
    if (pl.adjAt && Date.now() - pl.adjAt < 14 * DAY) return '';
    const r = smartRead(); if (!r || !r.ready || Math.abs(r.step) < 100) return '';
    const tg = targets(), now = tg ? tg.kcal : 0, next = now + r.step, up = r.kgChange >= 0;
    return `<div class="card kc-smart" id="kcSmart"><div class="k2">🎯 Smart target</div>
      <p class="small mt4">${Math.abs(r.kgChange) < 0.15 ? `Your weight stayed about the same over ${r.span} days` : `Your weight went ${up ? 'up' : 'down'} about ${g1(Math.abs(r.kgChange))} kg in ${r.span} days`} while you logged about ${n0(r.ate)} kcal a day, so your body uses about <b>${n0(r.used)} kcal</b> a day: ${n0(Math.abs(r.used - r.est))} ${r.used > r.est ? 'more' : 'less'} than GymDay worked out.</p>
      <p class="small mt8">Suggested target: <b>${n0(next)} kcal</b> a day (${r.step > 0 ? '+' : '−'}${n0(Math.abs(r.step))}).</p>
      <p class="xs dim mt4">It's only as right as your log: it assumes you log everything you eat and weigh yourself the same way each time.${ageNow() > 0 && ageNow() < 18 ? ' You are still growing, so it never lowers your target much.' : ''}</p>
      <div class="row mt12" style="gap:8px"><button class="btn grow" data-act="kcSmartNo">Not now</button><button class="btn primary grow" data-act="kcSmartUse" data-v="${r.adj}">Use ${n0(next)} kcal</button></div></div>`;
  }
  ACT.kcSmartUse = el => {
    const pl = plan(); if (!pl || !pl.auto) return; const was = { adj: pl.adj, adjAt: pl.adjAt };
    pl.adj = Math.round(num(el.dataset.v)); pl.adjAt = Date.now(); if (!pl.adj) delete pl.adj; S.save(true); redraw();
    undoToast(`Daily target changed to ${n0((targets() || {}).kcal)} kcal`, () => { if (was.adj) pl.adj = was.adj; else delete pl.adj; if (was.adjAt) pl.adjAt = was.adjAt; else delete pl.adjAt; S.save(true); redraw(); });
  };
  ACT.kcSmartNo = () => { const pl = plan(); if (!pl) return; pl.smartSkip = Date.now(); S.save(true); redraw(); toast("OK. It will look again in a week"); };
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => (C.on && C.on() ? `<div class="row" style="padding:6px 0"><div class="grow">Smart calorie target<div class="xs dim">Suggests a new daily target from your weight trend and what you log; nothing changes until you tap to use it. Off: no suggestions, and the target goes back to GymDay's formula</div></div><input type="checkbox" data-bind="optSmartKcal" ${smartOn() ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bind !== 'optSmartKcal') return;
    st().kcSmart = t.checked; const pl = plan(); if (!t.checked && pl) { delete pl.adj; delete pl.adjAt; delete pl.smartSkip; }
    S.save(true); toast(t.checked ? 'Smart calorie target is on' : 'Smart calorie target is off: the target is back to the formula');
  });
  // v1.18: protein, fat, carbs and fibre for a day of `kcal`, checked against ICMR-NIN 2020 (Nutrient Requirements for Indians):
  // protein 1.6 g a kg (1.8 when cutting) for someone who trains (sports nutrition: 1.4-2.0 g a kg; 1.6 is where gains level off),
  //   never under ICMR-NIN's RDA for the age and sex (0.83-0.91 g a kg, its table 2a), which is the minimum for someone who doesn't;
  // fat about 27% of calories and at least 0.6 g a kg, kept between 20% (ICMR-NIN's minimum for adults) and 35% (its upper AMDR);
  // carbs the rest, kept within 45-65% of calories (ICMR-NIN's AMDR from 3 years) when fat can make the room;
  // fibre 15 g for each 1,000 kcal (ICMR-NIN 2020: about 30 g in 2,000 kcal; its table gives a 2,110 kcal man 30 g, a 2,710 kcal one 40 g).
  const protRda = () => {
    const a = ageNow(), f = (st().me || {}).sex === 'f';
    if (!(a > 0) || a > 18) return 0.83;
    return a <= 12 ? (f ? 0.90 : 0.91) : a <= 15 ? (f ? 0.87 : 0.89) : (f ? 0.83 : 0.86);
  };
  function split(kcal, kg, lose) {
    const p = Math.round(Math.max(protRda(), Math.min(2.2, lose ? 1.8 : 1.6)) * kg / 5) * 5;
    let f = Math.min(Math.max(0.6 * kg, 0.27 * kcal / 9), 0.35 * kcal / 9);
    if ((kcal - p * 4 - f * 9) < 0.45 * kcal) f = Math.max(0.20 * kcal / 9, (0.55 * kcal - p * 4) / 9);          // room for carbs: fat down, not under 20%
    if ((kcal - p * 4 - f * 9) > 0.65 * kcal) f = Math.min(0.35 * kcal / 9, (0.35 * kcal - p * 4) / 9);          // carbs over 65%: a little more fat
    f = Math.round(f / 5) * 5;
    const c = Math.max(0, Math.round((kcal - p * 4 - f * 9) / 4 / 5) * 5), fib = Math.round(kcal / 1000 * 15);
    return { p, c, f, fib };
  }
  // the targets in force: { kcal, p, c, f, fib, goal, auto } or null when none is set
  function targets(t) {
    const pl = plan();
    if (pl && pl.auto) { const a = auto(pl.goal, t); if (a) return a; }
    if (pl && !pl.auto && pl.kcal > 0) return Object.assign({ goal: pl.goal || '' }, pl);
    if (st().kcGoal > 0) { const g = st().kcGoal, kg = (C.weightKg && C.weightKg(Date.now())) || 70; return Object.assign(split(g, kg, false), { kcal: g, goal: '', auto: false }); }
    return null;
  }

  // =====================================================================================================
  // On the Calories screen
  // =====================================================================================================
  const totals = list => { const o = zero(); for (const e of list) for (const k of NUT) o[k] += e[k] || 0; return o; };
  function ring(v, max) {
    const R = 30, L = 2 * Math.PI * R, k = max > 0 ? Math.min(1, v / max) : 0, over = max > 0 && v > max;
    return `<svg class="kc-ring" viewBox="0 0 76 76" aria-hidden="true"><circle cx="38" cy="38" r="${R}" class="kc-ring0"/><circle cx="38" cy="38" r="${R}" class="kc-ring1${over ? ' over' : ''}" stroke-dasharray="${(L * k).toFixed(1)} ${L.toFixed(1)}" transform="rotate(-90 38 38)"/></svg>`;
  }
  const MAC = [['p', 'Protein'], ['c', 'Carbs'], ['f', 'Fat'], ['fib', 'Fibre']];
  // v1.12: limits to stay under. Saturated fat: under 10% of the day's calories (WHO, ICMR-NIN). Salt: 5 g (ICMR-NIN, WHO).
  // Sugars: 90 g in a 2,000 kcal day (the UK and EU reference intake for all sugars, milk and fruit included), scaled to the target:
  // the food tables don't keep added sugar apart, so ICMR-NIN's own limit (added sugar under 5% of calories, Dietary Guidelines for
  // Indians 2024: about 25 g in 2,000 kcal) is shown in words under the bars, as `add`.
  const limitsFor = tg => { const k = tg && tg.kcal > 0 ? tg.kcal : 2000; return { sg: Math.round(90 * k / 2000), sf: Math.round(k * 0.1 / 9), salt: 5, add: Math.round(k * 0.05 / 4) }; };
  const macBar = (k, nm, v, t, kind, extra) => {
    const pct = t > 0 ? v / t * 100 : 0, w = Math.min(100, pct), cls = kind === 'goal' ? (pct >= 100 ? ' met' : '') : kind === 'range' ? (pct > 110 ? ' over' : '') : (pct > 100 ? ' over' : '');
    return `<div class="kc-mac${cls}" data-k="${k}" data-act="kcMac" role="button" tabindex="0" aria-label="${nm}: see the target and today's foods"><div class="xs kc-mac-n">${nm} <span class="kc-go">›</span></div><div class="bar"><div style="width:${w.toFixed(1)}%"></div></div><div class="xs muted"><b>${g1(v)}</b>${t ? ` / ${n0(t)}` : ''} g${extra || ''}</div></div>`;
  };
  // v1.20 Caffeine. A food from the US tables (FNDDS 2021-2023, SR Legacy) counts USDA's own caffeine number (caf.js); any other food
  // counts by its name, with USDA's number for the same drink, in mg in 100 g: espresso 212, brewed coffee 40, coffee with milk (latte)
  // 36, instant coffee made up 26, tea 20 (Indian chai is brewed strong, so hot black tea's number), green tea 12, cola 10, energy drinks
  // 32 (Red Bull: 80 mg in 250 ml), dark chocolate 80, milk chocolate 20, cocoa powder 230. A drink logged with no weight counts one cup
  // (150 g). The limit: 400 mg a day for adults (US FDA, EFSA, Health Canada); under 18, 2.5 mg for each kg of body weight (Health
  // Canada's advice for children and teenagers), 100 mg when no weight is logged.
  const CAF_RULES = [[/\b(espresso|ristretto|doppio)\b/, 212], [/\bcold brew\b|\bamericano\b|\bblack coffee\b|\bcoffee,? (brewed|black)\b/, 40], [/\bdecaf/, 1],
    [/\b(latte|cappuccino|flat white|macchiato|mocha|kaapi|filter coffee|cold coffee|frappe|frappuccino)\b|\bcoffee\b.*\bmilk\b/, 36], [/\binstant coffee|nescafe|\bbru\b/, 26], [/\bcoffee\b/, 36],
    [/\bgreen tea\b|\bmatcha\b/, 12], [/\b(chai|tea)\b/, 20], [/\b(cola|coke|thums up|pepsi|diet coke)\b/, 10], [/\b(energy drink|red bull|monster|sting energy|\bsting\b|hell energy|charged)\b/, 32],
    [/\bdark chocolate\b|\bchocolate, dark\b/, 80], [/\bcocoa powder\b/, 230], [/\bchocolate\b/, 20]];
  const CAF_NOT = /\b(biscuit|biscuits|cookie|cookies|cake|rusk|bun|teaspoon|tea time|teatime|tea-time|steak|tea tree|chocolate milk|milkshake|ice cream|flavou?red milk|herbal|tulsi|chamomile|peppermint|ginger lemon|lemongrass|hibiscus|rooibos|cola nut|coca-cola zero caffeine)\b/;
  function cafPer100(fid, name) {
    const C0 = window.CAFFEINE; if (C0 && fid && C0[fid] != null) return C0[fid];
    if (fid && /^[us]\d/.test(fid)) return 0;                                 // a US table food with no caffeine number has none
    const nm = String(name || '').toLowerCase(); if (!nm || CAF_NOT.test(nm)) return 0;
    for (const [re, v] of CAF_RULES) if (re.test(nm)) return v;
    return 0;
  }
  // mg of caffeine in one diary entry (a photo, typed or thali meal by each of its foods; leftovers take theirs off)
  function entryCaf(e) {
    if (e.src === 'left') return -((e.left && e.left.parts) || []).reduce((a, x) => a + (num(x.g) > 0 ? cafPer100(x.fid, x.name) * num(x.g) / 100 : 0), 0);
    if (Array.isArray(e.items) && e.items.length && !e.fid) return e.items.reduce((a, x) => { const g = num(x.g) || (cafPer100(x.fid, x.tb ? x.tb.name : x.name) ? 150 : 0); return a + cafPer100(x.fid, x.tb ? x.tb.name : x.name) * g / 100; }, 0);
    const per = cafPer100(e.fid, e.name); if (!per) return 0;
    return per * (num(e.g) > 0 ? num(e.g) : 150) / 100;
  }
  const cafLimit = () => { const a = ageNow(); if (a > 0 && a < 18) { const kg = C.weightKg ? C.weightKg(Date.now()) : 0; return kg > 0 ? Math.round(2.5 * kg) : 100; } return 400; };
  const dayCaf = d => Math.max(0, d.food.reduce((a, e) => a + entryCaf(e), 0));
  function limitBars(d, tg) {
    const SP = window.Supps; if (!SP || !SP.dayExtra) return '';
    if (!SP.ready()) { SP.loadMicro().then(() => { if (A.top().name === 'calories') A.rerender(); }).catch(() => { }); return `<div class="xs dim mt8"><span class="kc-spin"></span> Adding up sugar, saturated fat and salt…</div>`; }
    const key = SP.keyOf(d.t0), x = SP.dayExtra(key), na = (SP.dayData(key).tot || {}).na || 0, L = limitsFor(tg);
    const part = n => (x.foods > n ? ` <span class="dim" title="Some foods have no number for this">·</span>` : '');
    const cf = dayCaf(d), cl = cafLimit(), cfPct = cl > 0 ? cf / cl * 100 : 0;          // v1.20: caffeine, in mg
    const cfBar = `<div class="kc-mac kc-caf${cfPct > 100 ? ' over' : ''}" data-k="cf" data-act="kcMac" role="button" tabindex="0" aria-label="Caffeine: see the limit and today's foods"><div class="xs kc-mac-n">Caffeine <span class="kc-go">›</span></div><div class="bar"><div style="width:${Math.min(100, cfPct).toFixed(1)}%"></div></div><div class="xs muted"><b>${n0(cf)}</b> / ${n0(cl)} mg</div></div>`;
    return `<div class="kc-sec">Stay under</div><div class="kc-macs kc-lims">${macBar('sg', 'Sugars', x.sg, L.sg, 'limit', part(x.nsg))}${macBar('sf', 'Sat. fat', x.sf, L.sf, 'limit', part(x.nsf))}${macBar('na', 'Salt', na * 2.5 / 1000, L.salt, 'limit')}${cfBar}</div>
      <p class="xs dim mt4">Sugars counts all sugar, milk and fruit included. ICMR-NIN asks to keep <b>added</b> sugar (in tea, sweets, drinks) under ${L.add} g a day, 5% of your calories.</p>
      ${x.foods > Math.min(x.nsg, x.nsf) ? `<p class="xs dim mt4">${x.foods - Math.min(x.nsg, x.nsf)} of today's ${x.foods} foods have no sugar or saturated fat number (foods the list doesn't have), so these can be a little low.</p>` : ''}`;
  }
  // 1.35.2: on the Food tab a small card with one button; the form itself opens in a sheet (it was a whole screen up front)
  function setupCard() {
    if (window.__calm === false) return setupForm();
    return `<div class="card kc-tgask" id="kcTargetAsk"><div class="row" style="gap:10px"><div class="grow" style="min-width:0"><div class="k2">Your daily limits</div><p class="small muted mt4">Your weight, height, age and goal, once: then GymDay shows what you need each day.</p></div><button class="btn sm primary" data-act="kcSetupOpen">Set them</button></div></div>`;
  }
  ACT.kcSetupOpen = () => A.openSheet(`<h2>Your daily limits</h2>${setupForm()}`);
  function setupForm() {
    const m = st().me || {}, w = C.weightKg ? C.weightKg(Date.now()) : null, age = ageNow(), sex = m.sex || '', act = String(st().kcAct || '1.2'), goal = (plan() || {}).goal || 'keep';
    const chips = (k, list, cur) => `<div class="row ks-chips" data-k="${k}" data-v="${esc(cur)}">${list.map(([v, nm]) => `<button class="chip ${cur === v ? 'on' : ''}" data-act="ksPick" data-v="${v}">${nm}</button>`).join('')}</div>`;
    return `<div class="card" id="kcTarget"><div class="k2">Your daily limits</div><p class="small muted">Fill this in once: GymDay works out the calories, protein, carbs, fat and fibre your body needs, and the bars below fill up as you eat.</p>
      <div class="row mt8" style="gap:8px"><div class="grow"><label class="lbl">Weight (${A.unit()})</label><input class="input" id="ksW" type="number" inputmode="decimal" value="${w ? A.fmtW(Math.round(w * 10) / 10) : ''}" placeholder="${A.unit()}"></div>
        <div class="grow"><label class="lbl">Height (cm)</label><input class="input" id="ksH" type="number" inputmode="decimal" value="${m.h > 0 ? m.h : ''}" placeholder="cm"></div>
        <div class="grow"><label class="lbl">Age</label><input class="input" id="ksA" type="number" inputmode="numeric" value="${age || ''}" placeholder="years"></div></div>
      <label class="lbl mt8">Body</label>${chips('sex', [['m', 'Male'], ['f', 'Female']], sex)}
      <label class="lbl mt8">Outside the gym I am</label>${chips('act', (C.ACTS || [['1.2', 'Mostly sitting'], ['1.4', 'On my feet a lot'], ['1.6', 'Very active']]).map((a, i) => [a[0], a[1] + (C.ACT_SUB ? `<span class="sub">${C.ACT_SUB[i]}</span>` : '')]), act)}
      <p class="xs dim">Your workouts are added on top, so leave them out here.</p>
      <label class="lbl mt8">My goal</label>${chips('goal', GOALS, goal)}
      <button class="btn primary block mt12" data-act="kcSetup">Show my limits</button></div>`;
  }
  ACT.ksPick = el => { const row = el.parentNode; row.dataset.v = el.dataset.v; row.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcSetup = () => {
    const card = $('#kcTarget'), pick = k => ((card && card.querySelector(`.ks-chips[data-k="${k}"]`)) || {}).dataset || {};
    const w = num(($('#ksW') || {}).value), h = num(($('#ksH') || {}).value), a = Math.round(num(($('#ksA') || {}).value)), sex = pick('sex').v || '', act = pick('act').v || '1.2', goal = pick('goal').v || 'keep';
    if (!(w > 20 && w < 400)) { toast('Type your weight'); return; }
    if (!(h >= 90 && h <= 250)) { toast('Type your height in centimetres, e.g. 172'); return; }
    if (!(a >= 10 && a <= 100)) { toast('Type your age'); return; }
    if (sex !== 'm' && sex !== 'f') { toast('Pick male or female: the formulas differ'); return; }
    const last = C.weightKg ? C.weightKg(Date.now()) : null;
    if (!last || Math.abs(A.fmtW(last) - w) > 0.05) { if (window.Insights && window.Insights.addWeight) window.Insights.addWeight(w, Date.now()); }
    st().me = { h, age: a, ageAt: Date.now(), sex }; st().kcAct = act; st().kcPlan = { goal, auto: true }; st().kcGoal = 0;
    S.save(true); A.closeSheet(); toast('Your daily limits are set'); redraw();
  };
  function targetCard(d) {
    const tg = targets(d.t0), tot = totals(d.food);
    if (!tg) return setupCard();
    return smartCard(d.t0) + targetCard0(d, tg, tot);
  }
  function targetCard0(d, tg, tot) {
    const bars = MAC.map(([k, nm]) => macBar(k, nm, tot[k], tg[k], k === 'p' || k === 'fib' ? 'goal' : 'range')).join('');
    const cr = tot.cr > 0 ? `<div class="xs muted mt8">Creatine: <b>${g1(tot.cr)} g</b></div>` : '';
    const left = tg.kcal - tot.kcal, gl = (GOALS.find(g => g[0] === tg.goal) || [])[1];
    return `<div class="card" id="kcTarget"><div class="row" style="gap:12px">${ring(tot.kcal, tg.kcal)}<div class="grow" style="min-width:0"><div class="k2">Daily target${gl ? ' · ' + gl.toLowerCase() : ''}${tg.adj ? ` · smart ${tg.adj > 0 ? '+' : '−'}${n0(Math.abs(tg.adj))}` : ''}</div>
      <div class="title"><b>${n0(tot.kcal)}</b> <span class="muted small">/ ${n0(tg.kcal)} kcal</span></div><div class="xs ${left >= 0 ? 'muted' : 'accent'}">${left >= 0 ? `${n0(left)} left` : `${n0(-left)} over`}</div>${tgWhyBtn(tg)}</div>
      <button class="btn sm" data-act="kcPlan">Change</button></div><div class="kc-sec">Reach</div><div class="kc-macs">${bars}</div>${limitBars(d, tg)}${cr}
      <button class="kc-vit mt12" data-act="spMicro" data-day="${window.Supps ? window.Supps.keyOf(d.t0) : ''}"><span class="grow">Vitamins and minerals</span><span class="accent">›</span></button></div>`;
  }

  // ---------------------------------------------------------------- v1.21.10: how the calorie target is worked out
  // The target is a usual day (the everyday burn + the daily average of what the last 14 days' workouts and activities added, and a
  // smart change if one was taken) plus or minus the goal's part: the same on rest days, on purpose. A line on the card, and a sheet.
  function tgWhyBtn(tg) {
    const pl = plan(), typed = !!(pl && pl.auto === false && pl.kcal > 0) || (!pl && st().kcGoal > 0);
    const txt = typed || !tg.upkeep ? 'the number you typed' : tg.goal === 'gain' ? `usual day ${n0(tg.upkeep)} + ${n0(tg.kcal - tg.upkeep)} to gain` : tg.goal === 'lose' ? `usual day ${n0(tg.upkeep)} − ${n0(tg.upkeep - tg.kcal)} to lose` : `your usual day, ${n0(tg.upkeep)}`;
    return `<button class="kc-tgwhy" data-act="kcTargetWhy">${txt} <span aria-hidden="true">›</span></button>`;
  }
  ACT.kcTargetWhy = () => {
    const t0 = C.day ? C.day() : Date.now(), tg = targets(t0); if (!tg) return;
    const pl = plan(), typed = !!(pl && pl.auto === false && pl.kcal > 0) || (!pl && st().kcGoal > 0);
    const ep = C.everydayParts ? C.everydayParts(t0) : null, u = upkeepParts(t0), mine = typed ? auto((pl && pl.goal) || 'keep', t0) : null;
    const row = (name, sub, v, cls) => `<div class="list-item ${cls || ''}"><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${name}</div>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div><div class="small right" style="font-weight:700">${v}</div></div>`;
    let body;
    if (typed) body = `<p class="small">Your target of <b>${n0(tg.kcal)} kcal</b> is the number you typed in <b>Change</b>.${mine ? ` GymDay's own, worked out from your usual day, would be <b>${n0(mine.kcal)} kcal</b>.` : ''}</p>`;
    else {
      const adj = tg.adj || 0, gp = tg.kcal - tg.upkeep, ex = u ? Math.round(u.extra) : 0;
      body = (ep ? row('Everyday burn', `your body at rest ${n0(ep.rest)} + a normal day's moving about${ep.young ? ' and growing' : ''} ${n0(ep.life)} (${esc(ep.level.toLowerCase())})`, n0(ep.every)) : '')
        + (u ? row('Your workouts and activities', `the last 14 days: ${u.wsN} workout${u.wsN === 1 ? '' : 's'}${u.spN ? ` and ${u.spN} activit${u.spN === 1 ? 'y' : 'ies'}` : ''} added ${n0(u.wsAdd + u.spAdd)} kcal, about ${n0(ex)} a day`, `+ ${n0(ex)}`) : '')
        + (adj ? row('Smart change', 'from your weight trend, which you took', `${adj > 0 ? '+' : '−'} ${n0(Math.abs(adj))}`) : '')
        + row('Your usual day', 'rounded to 10 kcal', `≈ ${n0(tg.upkeep)}`, 'kc-tw-sum')
        + (tg.goal === 'gain' ? row('To gain muscle', 'about 10% more, at most 300 kcal, for slow, lean gains', `+ ${n0(gp)}`) : tg.goal === 'lose' ? row('To lose fat', 'a little under what you use', `− ${n0(-gp)}`) : '')
        + row('Your daily target', '', `${n0(tg.kcal)} kcal`, 'kc-tw-sum')
        + `<p class="xs muted mt8"><b>It stays the same on rest days, on purpose.</b> Muscle is built over weeks, and a lot of it on rest days, so eating about the same every day suits ${tg.goal === 'gain' ? 'gaining' : 'your goal'}. Your Burnt changes with each day instead: on a rest day it is lower, so that day's "eaten − burnt" shows a bigger surplus, and the days even out over the week. The target moves when your weight, your activity level or your last two weeks change.</p>`;
    }
    A.openSheet(`<h2>Your daily target</h2>${body}
      <p class="xs dim mt8">An estimate from general guidelines (ICMR-NIN 2020), not medical advice. If you have a health condition, ask a doctor or dietitian what is right for you.</p>
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="kcPlan">Change</button><button class="btn grow" data-act="closeSheet">Close</button></div>`);
  };

  // ---------------------------------------------------------------- v1.21.10: tap Eaten to see what made it up
  ACT.kcEatenWhy = () => {
    const t0 = C.day ? C.day() : Date.now(), d = C.dayOf(t0), dl = C.dayLabel ? C.dayLabel(t0) : 'Today', tot = totals(d.food), K = Math.max(0, tot.kcal);
    const pc = (g, per) => (K > 0 ? Math.round(g * per / K * 100) : 0);
    const mac = (nm, g, per) => `<div class="kc-ew-m"><div class="k2">${nm}</div><div class="v">${n0(g)} g</div>${per ? `<div class="k">${pc(g, per)}% of kcal</div>` : '<div class="k">&nbsp;</div>'}</div>`;
    const F = macFoods('kcal', d), top = F.rows.filter(r => r.v > 0).slice(0, 5);
    const meal = m => ((MEALS.find(x => x[0] === m) || [])[1] || '');
    // the amount, when there is one (typed foods often have only calories); a photo meal says how many foods
    const amt = e => { if (e.src === 'left') return 'not eaten'; if (Array.isArray(e.items) && e.items.length && !e.fid) return `${e.items.length} food${e.items.length === 1 ? '' : 's'}`;
      return e.per ? String(e.per) : num(e.g) > 0 ? `${g1(e.g)} g` : ''; };
    const topHtml = top.length ? top.map(r => `<div class="kc-read-r"><span class="ellipsis">${r.supp ? '💊 ' : ''}${esc(r.name)}${r.n > 1 ? ` <small class="kc-dim">× ${r.n}</small>` : ''}${r.meals.length ? ` <small class="kc-dim">· ${esc(r.meals.map(meal).filter(Boolean).join(', '))}</small>` : ''}</span><b>${n0(r.v)}</b><small class="kc-dim">${K > 0 ? Math.round(r.v / K * 100) : 0}%</small></div>`).join('') : '';
    const byMeal = MEALS.map(([m, nm]) => {
      const es = d.food.filter(e => mealOf(e) === m); if (!es.length) return '';
      const kc = es.reduce((a, e) => a + num(e.kcal), 0), p = es.reduce((a, e) => a + num(e.p), 0);
      return `<div class="kc-ew-meal"><div class="row"><b class="grow">${nm}</b><span class="small"><b>${n0(kc)}</b> kcal${p ? ` · ${n0(p)} g protein` : ''}${K > 0 ? ` <small class="kc-dim">· ${Math.round(kc / K * 100)}%</small>` : ''}</span></div>
        ${es.map(e => `<div class="list-item tap kc-ew-f" data-act="kcInfo" data-id="${esc(e.id)}"><div class="grow" style="min-width:0"><div class="small ellipsis">${e.src === 'left' ? '🍽 ' : ''}${esc(e.src === 'left' ? 'Leftovers' : e.name)}</div>${amt(e) ? `<div class="xs muted ellipsis">${esc(amt(e))}</div>` : ''}</div><div class="right small"><b>${n0(e.kcal)}</b>${num(e.p) ? `<div class="xs muted">${g1(e.p)} g protein</div>` : ''}</div></div>`).join('')}</div>`;
    }).join('');
    A.openSheet(`<h2>Eaten</h2><p class="small muted">${esc(dl)}</p>
      ${d.food.length ? `<div class="stats mt8"><div class="stat"><div class="k2">Eaten</div><div class="v">${n0(K)}</div><div class="k">kcal</div></div></div>
      <div class="kc-ew-macs mt8">${mac('Protein', tot.p, 4)}${mac('Carbs', tot.c, 4)}${mac('Fat', tot.f, 9)}${mac('Fibre', tot.fib, 0)}</div>
      <div class="sp-sub">Most of it came from</div><div class="kc-ew-top">${topHtml}</div>
      <div class="sp-sub">By meal</div>${byMeal}<p class="xs dim mt8">Tap a food to see everything in it, or to change it.</p>`
      : `<p class="small muted mt8">No food logged ${dl === 'Today' ? 'today' : 'that day'} yet.</p>`}
      <button class="btn block mt16" data-act="closeSheet">Close</button>`);
  };

  // ---------------------------------------------------------------- v1.19: tap a bar to see its target
  // The day's amount against the target, how the target is set (with this person's own numbers), and the day's foods that gave it,
  // most first. It only shows: the card's Change button is still the way to change a target.
  const MAC_INFO = { p: ['Protein', 'goal'], c: ['Carbs', 'range'], f: ['Fat', 'range'], fib: ['Fibre', 'goal'], sg: ['Sugars', 'limit'], sf: ['Saturated fat', 'limit'], na: ['Salt', 'limit'], cf: ['Caffeine', 'limit'] };
  const pctOf = (g, per, kcal) => (kcal > 0 ? Math.round(g * per / kcal * 100) : 0);
  // how the target for k is set, as short paragraphs
  function macWhy(k, tg, t0) {
    const pl = plan(), typed = !!(pl && pl.auto === false && pl.kcal > 0), legacy = !pl && st().kcGoal > 0;
    const kcal = tg.kcal, K = n0(kcal), goal = tg.goal || 'keep', lose = goal === 'lose';
    const kg = tg.kg || (C.weightKg && C.weightKg(t0)) || (C.weightKg && C.weightKg(Date.now())) || 70, guess = tg.auto ? !!tg.guessKg : !(C.weightKg && C.weightKg(Date.now()));
    const mine = typed ? auto(goal, t0) : null, own = (what, v) => `You typed ${what} in <b>Change</b>.${mine ? ` GymDay's own number would be ${v(mine)}.` : ''}`;
    const P = [], a = ageNow(), sex = (st().me || {}).sex, rda = protRda();
    const kcalLine = () => {
      if (typed) return `Your ${K} kcal a day is the number you typed in <b>Change</b>.`;
      if (legacy) return `Your ${K} kcal a day is the goal you typed.`;
      const up = tg.upkeep ? n0(tg.upkeep) : '';
      return `Your ${K} kcal a day ${goal === 'gain' ? `is what a day like your last two weeks uses (${up} kcal) plus about 10%, at most 300 kcal, to gain muscle slowly` : goal === 'lose' ? `is what a day like your last two weeks uses (${up} kcal) less a small, safe cut` : `is what a day like your last two weeks uses`}.${tg.adj ? ` That includes your smart change of ${tg.adj > 0 ? '+' : '−'}${n0(Math.abs(tg.adj))} kcal from your weight trend (GymDay's formula alone says ${n0(tg.formula)}).` : ''}`;
    };
    if (k === 'p') {
      if (typed) P.push(own(`${n0(tg.p)} g`, m => `${n0(m.p)} g`));
      else {
        const per = Math.max(rda, lose ? 1.8 : 1.6);
        P.push(`<b>${per} g for each kg you weigh</b>: ${per} × ${g1(kg)} kg = ${g1(per * kg)} g, rounded to <b>${n0(tg.p)} g</b>.${guess ? ' No body weight is logged yet, so 70 kg is used: log your weight for your own number.' : ''}`);
        P.push(lose ? 'While eating less to lose fat, a little more protein (1.8 g a kg) helps keep your muscle.'
          : 'In studies of people who lift weights, extra protein stops adding muscle at about 1.6 g a kg a day; sports nutrition advice is 1.4 to 2.0 g.');
      }
      P.push(`ICMR-NIN 2020's daily need for ${a > 0 && a <= 18 ? `a ${sex === 'f' ? 'girl' : sex === 'm' ? 'boy' : 'child'} of ${a}` : 'an adult'} who doesn't train is ${rda} g a kg (${n0(rda * kg)} g). Training needs more, and GymDay never sets less than that.`);
    } else if (k === 'c') {
      if (typed) P.push(own(`${n0(tg.c)} g`, m => `${n0(m.c)} g`));
      else {
        const pk = tg.p * 4, fk = tg.f * 9, left = kcal - pk - fk, pc = pctOf(tg.c, 4, kcal);
        P.push(`Carbs fill the rest of your ${K} kcal after protein (${n0(tg.p)} g × 4 = ${n0(pk)} kcal) and fat (${n0(tg.f)} g × 9 = ${n0(fk)} kcal): ${n0(left)} kcal ÷ 4 = ${g1(left / 4)} g, rounded to <b>${n0(tg.c)} g</b>, ${pc}% of your calories.`);
        P.push(`ICMR-NIN advises 45% to 65% of calories from carbs.${pc < 45 ? ' Yours is under 45% because protein and the minimum fat take up more of your calories.' : pc > 65 ? ' Yours is over 65% because fat is already at its 35% top.' : ''}`);
      }
      P.push(kcalLine());
      P.push('Carbs and fat are a guide: a little over or under is fine while your calories are on target. The bar changes colour when you are more than 10% over.');
    } else if (k === 'f') {
      if (typed) P.push(own(`${n0(tg.f)} g`, m => `${n0(m.f)} g`));
      else {
        const base = Math.min(Math.max(0.6 * kg, 0.27 * kcal / 9), 0.35 * kcal / 9), rest = (kcal - tg.p * 4 - base * 9) / kcal;
        const floorKg = 0.6 * kg > 0.27 * kcal / 9;
        P.push(`${floorKg ? `At least 0.6 g for each kg you weigh (${g1(0.6 * kg)} g), more than 27% of your calories would give.` : `About 27% of your ${K} kcal: ${n0(0.27 * kcal)} kcal ÷ 9 kcal a gram = ${g1(0.27 * kcal / 9)} g.`}${rest < 0.45 ? ' Then a little less, to leave 45% of your calories for carbs.' : rest > 0.65 ? ' Then a little more, so carbs stay under 65% of your calories.' : ''} Rounded: <b>${n0(tg.f)} g</b>, ${pctOf(tg.f, 9, kcal)}% of your calories.`);
        P.push("ICMR-NIN asks for at least 20% of calories from fat; GymDay keeps it between 20% and 35%.");
      }
      P.push(kcalLine());
      P.push('Carbs and fat are a guide: a little over or under is fine while your calories are on target. The bar changes colour when you are more than 10% over.');
    } else if (k === 'fib') {
      if (typed) P.push(own(`${n0(tg.fib)} g`, m => `${n0(m.fib)} g`));
      else P.push(`<b>15 g for every 1,000 kcal</b> you eat: ${K} kcal × 15 ÷ 1,000 = <b>${n0(tg.fib)} g</b>. ICMR-NIN 2020 advises about 30 g in a 2,000 kcal day, so the target grows with your calories.`);
      if (!typed) P.push(kcalLine());
    } else if (k === 'sg') {
      const L = limitsFor(tg);
      P.push(`<b>90 g in a 2,000 kcal day</b> (the UK and EU reference intake for all sugars), for your ${K} kcal: 90 × ${K} ÷ 2,000 = <b>${n0(L.sg)} g</b>.`);
      P.push(`This counts all sugar, the sugar in milk and fruit too, because the food tables don't keep added sugar apart. ICMR-NIN's own limit is for <b>added</b> sugar (in tea, sweets, cold drinks): under 5% of your calories, about ${n0(L.add)} g a day.`);
    } else if (k === 'sf') {
      const L = limitsFor(tg);
      P.push(`<b>Under 10% of your calories</b> (ICMR-NIN and WHO): 10% of ${K} kcal is ${n0(kcal * 0.1)} kcal, ÷ 9 kcal a gram = <b>${n0(L.sf)} g</b>.`);
      P.push('Saturated fat is mostly in ghee, butter, cheese, cream, coconut oil, fatty meat, and in biscuits and fried snacks made with palm oil or vanaspati.');
    } else if (k === 'cf') {
      const young = a > 0 && a < 18, kgW = C.weightKg ? C.weightKg(Date.now()) : 0;
      P.push(young ? (kgW > 0 ? `<b>2.5 mg for each kg you weigh</b>: 2.5 × ${g1(kgW)} kg = <b>${n0(cafLimit())} mg</b>. That is Health Canada's limit for children and teenagers; caffeine hits a growing body harder, and energy drinks are not advised under 18.` : `<b>100 mg</b> until your body weight is logged; then 2.5 mg for each kg you weigh (Health Canada's limit for children and teenagers).`)
        : '<b>400 mg a day</b>: the most that is safe for healthy adults (US FDA, the European Food Safety Authority and Health Canada). About 4 cups of brewed coffee.');
      P.push('Counted from each food: the US tables give caffeine for their foods; other foods count by their name with the US number for the same drink. A cup of chai has about 30 mg, filter coffee with milk about 55, an espresso about 60, a 250 ml can of Red Bull 80, a 300 ml cola about 30. A pre-workout counts only if you log it as a food.');
    } else if (k === 'na') {
      const s = (D.settings || {}).salt;
      P.push('<b>5 g of salt a day</b>, about 2,000 mg of sodium: the limit ICMR-NIN and WHO set for everyone, whatever your calories.');
      P.push(`GymDay counts your foods' sodium × 2.5 as salt. Home dishes whose recipes leave the salt out count the salt usually cooked with${s === 'none' ? ', and none at all, as you said you cook without salt (only what the ingredients have)' : s === 'less' ? ', less of it, as you said you cook with less' : s === 'more' ? ', more of it, as you said you cook with more' : ''}. A dish can have its own salt: tap it on the Food tab, then Salt.`);
    }
    return P.map(x => `<p class="small mt8">${x}</p>`).join('');
  }
  // the day's foods behind k: [{ name, v, n, meal }] most first (photo meals by each food in them), plus foods with no number for it
  function macFoods(k, d) {
    const rows = [], key = window.Supps ? window.Supps.keyOf(d.t0) : '', SP = window.Supps;
    let none = 0, total = 0;
    if (k === 'cf') {                     // v1.20: caffeine, by each food
      for (const e of d.food) {
        const its = e.src !== 'left' && Array.isArray(e.items) && e.items.length && !e.fid ? e.items : null;
        if (its) { for (const x of its) { const nm = x.tb ? x.tb.name : x.name, g = num(x.g) || (cafPer100(x.fid, nm) ? 150 : 0), v = cafPer100(x.fid, nm) * g / 100; if (v > 0) { total += v; const y = rows.find(r => r.name === (x.name || e.name)); if (y) { y.v += v; y.n++; } else rows.push({ name: x.name || e.name, v, n: 1, meals: e.meal ? [e.meal] : [] }); } } continue; }
        const v = entryCaf(e); if (!v) continue; total += v;
        const nm = e.src === 'left' ? 'Leftovers (not drunk)' : e.name, y = rows.find(r => r.name === nm);
        if (y) { y.v += v; y.n++; } else rows.push({ name: nm, v, n: 1, meals: e.meal ? [e.meal] : [] });
      }
      rows.sort((a, b) => b.v - a.v);
      return { rows: rows.filter(r => Math.abs(r.v) >= 0.5), none: 0, total: Math.max(0, total) };
    }
    const add = (name, v, meal, supp) => { const nm = String(name || 'Food'), y = rows.find(r => r.name === nm && !!r.supp === !!supp); if (y) { y.v += v; y.n++; if (meal && !y.meals.includes(meal)) y.meals.push(meal); } else rows.push({ name: nm, v, n: 1, meals: meal ? [meal] : [], supp }); };
    if (k === 'p' || k === 'c' || k === 'f' || k === 'fib' || k === 'kcal') {          // v1.21.10: calories too (the Eaten sheet)
      for (const e of d.food) {
        total += num(e[k]);
        if (e.src === 'left') { if (num(e[k])) add('Leftovers (not eaten)', num(e[k]), e.meal); continue; }
        const its = Array.isArray(e.items) && e.items.length && !e.fid ? e.items : null;
        if (its && its.some(x => num(x[k]) > 0)) { for (const x of its) if (num(x[k]) > 0) add(x.name || e.name, num(x[k]), e.meal); continue; }
        if (num(e[k]) > 0) add(e.name, num(e[k]), e.meal);
        else if (num(e.kcal) > 0 && ['p', 'c', 'f', 'fib'].every(j => e[j] == null) && !(its && its.some(x => ['p', 'c', 'f', 'fib'].some(j => num(x[j]) > 0)))) none++;
      }
    } else if (SP && SP.ready()) {
      if (k === 'na') {
        const dd = SP.dayData(key); total = (dd.tot.na || 0) * 2.5 / 1000;
        for (const x of dd.by.na || []) add(x.name, x.v * 2.5 / 1000, '', x.from === 'supp');
        none = (dd.gaps.na || 0) + dd.nodata.length;
      } else {
        const x = SP.dayExtra(key); total = x[k];
        for (const r of x.by[k] || []) { const e = d.food.find(y => y.id === r.id), nm = e && Array.isArray(e.items) && r.name.startsWith(e.name + ': ') ? r.name.slice(e.name.length + 2) : r.name; add(nm, r.v, e ? e.meal : ''); }
        none = x.foods - (k === 'sg' ? x.nsg : x.nsf);
      }
      const sum = rows.reduce((a, r) => a + r.v, 0);
      if (total - sum < -0.05) add('Leftovers (not eaten)', total - sum, '');
    }
    rows.sort((a, b) => b.v - a.v);
    return { rows: rows.filter(r => Math.abs(r.v) >= 0.05), none, total };
  }
  ACT.kcMac = el => {
    const k = el.dataset.k, info = MAC_INFO[k]; if (!info) return;
    const SP = window.Supps;
    if ((k === 'sg' || k === 'sf' || k === 'na') && SP && !SP.ready()) { SP.loadMicro().then(() => ACT.kcMac(el)).catch(() => { }); return; }
    const t0 = C.day ? C.day() : Date.now(), d = C.dayOf(t0), tg = targets(t0); if (!tg) return;
    const [name, kind] = info, L = limitsFor(tg), F = macFoods(k, d);
    const target = k === 'sg' ? L.sg : k === 'sf' ? L.sf : k === 'na' ? L.salt : k === 'cf' ? cafLimit() : tg[k], v = Math.max(0, F.total), unit = k === 'na' ? 'g salt' : k === 'cf' ? 'mg' : 'g';
    const fmt = x => (k === 'na' ? String(r1(x)) : k === 'cf' ? n0(x) : g1(x)), pct = target > 0 ? Math.round(v / target * 100) : 0;
    const dl = C.dayLabel ? C.dayLabel(t0) : 'Today';
    let status;
    if (kind === 'goal') status = v >= target ? `<b>Reached</b>${v > target ? ` (${fmt(v - target)} g above, which is fine)` : ''}.` : `<b>${fmt(target - v)} g</b> to go to reach ${n0(target)} g.`;
    else if (kind === 'range') status = v <= target ? `<b>${fmt(target - v)} g</b> left of ${n0(target)} g.` : `<b>${fmt(v - target)} g</b> over${v > target * 1.1 ? ', more than 10% over' : ', within 10%, which is fine'}.`;
    else status = v <= target ? `<b>${fmt(target - v)} ${unit}</b> under the limit.` : `<b>${fmt(v - target)} ${unit}</b> over the limit.`;
    const meal = m => ((MEALS.find(x => x[0] === m) || [])[1] || '');
    const rowsHtml = F.rows.length ? F.rows.map(r => `<div class="kc-read-r"><span class="ellipsis">${r.supp ? '💊 ' : ''}${esc(r.name)}${r.n > 1 ? ` <small class="kc-dim">× ${r.n}</small>` : ''}${r.meals.length ? ` <small class="kc-dim">· ${esc(r.meals.map(meal).filter(Boolean).join(', '))}</small>` : ''}</span><b>${r.v < 0 ? '−' : ''}${fmt(Math.abs(r.v))} ${unit}${v > 0 && r.v > 0 ? `<small class="kc-pct">${Math.round(r.v / v * 100)}%</small>` : ''}</b></div>`).join('')
      : `<p class="small muted">${d.food.length ? `None of ${dl === 'Today' ? "today's" : 'the day\'s'} foods had any.` : `No food logged ${dl === 'Today' ? 'today' : 'that day'} yet.`}</p>`;
    const noneTxt = F.none > 0 ? `<p class="xs dim mt4">${F.none} food${F.none === 1 ? ' has' : 's have'} no ${({ p: 'protein', c: 'carbs', f: 'fat', fib: 'fibre', sg: 'sugar', sf: 'saturated fat', na: 'salt' })[k]} number (${k === 'p' || k === 'c' || k === 'f' || k === 'fib' ? 'logged with calories only' : "foods the list doesn't have"}), so ${F.none === 1 ? 'it adds' : 'they add'} nothing here and the total can be a little low.</p>` : '';
    A.openSheet(`<h2>${esc(name)}</h2>
      <div class="stats mt8"><div class="stat"><div class="k2">${esc(dl)}</div><div class="v">${fmt(v)}</div><div class="k">${unit}</div></div>
        <div class="stat"><div class="k2">${kind === 'limit' ? 'Keep under' : 'Your target'}</div><div class="v">${n0(target)}</div><div class="k">${unit} · ${pct}%</div></div></div>
      <p class="small kc-mac-st">${status}</p>${k === 'na' && SP && SP.saltHtml ? SP.saltHtml(SP.keyOf(t0), 'mac') : ''}
      <div class="sp-sub">How it is set</div>${macWhy(k, tg, t0)}
      <div class="sp-sub">${dl === 'Today' ? "Today's foods" : 'Foods that day'}</div>${rowsHtml}${noneTxt}
      <button class="btn block mt16" data-act="closeSheet">Close</button>`);
  };

  // ---------------------------------------------------------------- pinned supplements
  const KIND = { protein: 'Protein powder', creatine: 'Creatine', other: 'Supplement' };
  // how many servings an entry is: logged in grams, it is its weight over one serving's
  const servingsOf = (e, sp) => (sp.g > 0 && num(e.g) > 0 ? num(e.g) / sp.g : e.un === 'g' ? 0 : num(e.q) || 1);
  const suppName = sp => [sp.brand, sp.name].map(s => String(s || '').trim()).filter(Boolean).join(' ') || KIND[sp.kind] || 'Supplement';
  function pinsHtml(d) {
    const pins = D.supps.filter(sp => sp.pin !== false);
    const card = sp => {
      const n = d.food.filter(e => e.fid === supId(sp.id)).reduce((a, e) => a + servingsOf(e, sp), 0), im = sp.pic ? S.loadPhoto(sp.pic) : '';
      const what = sp.kind === 'creatine' ? `${g1(num(sp.cr) || num(sp.g))} g creatine` : `${g1(num(sp.p))} g protein · ${n0(sp.kcal)} kcal`;
      return `<div class="kc-pin" data-id="${esc(sp.id)}"><button class="kc-pin-main" data-act="kcSuppAdd" data-id="${esc(sp.id)}" aria-label="Add one ${esc(sp.serv || 'serving')} of ${esc(suppName(sp))}">
        ${im ? `<img src="${im}" alt="">` : `<span class="kc-pin-ic">${sp.kind === 'creatine' ? 'Cr' : sp.kind === 'protein' ? 'P' : '+'}</span>`}
        <span class="kc-pin-t"><b class="ellipsis">${esc(suppName(sp))}</b><span class="xs muted ellipsis">${esc(sp.serv || '1 serving')} · ${what}</span><span class="xs ${n ? 'green' : 'dim'}">${n ? `${isToday(d.t0) ? 'Today' : 'That day'}: ${fmtQ(Math.round(n * 100) / 100)} ×` : 'Tap to add one'}</span></span></button>
        <button class="kc-pin-ed" data-act="kcSuppEdit" data-id="${esc(sp.id)}" aria-label="Change ${esc(suppName(sp))}">✎</button>${n ? `<button class="kc-pin-less" data-act="kcSuppLess" data-id="${esc(sp.id)}" aria-label="Take back one ${esc(String(sp.serv || 'serving').replace(/^1\s+/, ''))} of ${esc(suppName(sp))}">−</button>` : ''}</div>`;
    };
    return `<div id="kcPins" class="kc-pins">${pins.map(card).join('')}<button class="kc-pin kc-pin-new" data-act="kcSuppNew"><span class="kc-pin-ic">+</span><span class="kc-pin-t"><b>${pins.length ? 'Another supplement' : 'Your protein or creatine'}</b><span class="xs muted">Photo of the packet, barcode or typed: then one tap adds a serving</span></span></button></div>`;
  }

  // ---------------------------------------------------------------- the meals
  function mealsHtml(d) {
    const by = {}; MEALS.forEach(m => { by[m[0]] = []; });
    d.food.forEach(e => by[mealOf(e)].push(e));
    const row = e => { if (e.src === 'left' && window.Leftover) return window.Leftover.rowHtml(e);       // v1.13: what was left on the plate
      const im = e.pic ? S.loadPhoto(e.pic) : ''; const mac = [e.p ? `P ${g1(e.p)}` : '', e.c ? `C ${g1(e.c)}` : '', e.f ? `F ${g1(e.f)}` : ''].filter(Boolean).join(' · ');
      const on = selOn && sel.ids.has(e.id);
      return `<div class="list-item tap${selOn ? ' kc-selrow' : ''}${on ? ' on' : ''}" data-act="${selOn ? 'kcSelTog' : 'kcInfo'}" data-id="${esc(e.id)}"${selOn ? ` role="checkbox" aria-checked="${on}"` : ''}>${selOn ? `<span class="kc-tick" aria-hidden="true">${on ? '✓' : ''}</span>` : ''}${im ? `<img class="kc-thumb" src="${im}" alt="">` : ''}<div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(e.name)}</div>
        <div class="xs muted ellipsis">${esc(e.per && !/^same as/.test(e.per) ? e.per : '')}${e.per && mac && !/^same as/.test(e.per) ? ' · ' : ''}${mac}${e.src === 'ai' ? ' · read from the photo' : ''}${(e.items || []).some(x => x.chk) ? ' · <span class="kc-chkdot">check a food</span>' : ''}</div></div>${!selOn && bumpable(e) ? `<span class="kc-bump"><button class="kc-bb" data-act="kcBump" data-id="${esc(e.id)}" data-d="-1" aria-label="Less ${esc(e.name)}">−</button><button class="kc-bb" data-act="kcBump" data-id="${esc(e.id)}" data-d="1" aria-label="More ${esc(e.name)}">+</button></span>` : ''}<div class="small" style="font-weight:700">${n0(e.kcal)}</div></div>${selOn ? '' : window.Odd ? window.Odd.foodStrip(e) : ''}`; };
    const selOn = !!(sel && sel.t0 === d.t0);
    const y = C.prevDay ? C.prevDay(d.t0) : d.t0 - DAY;
    let h = `<div id="kcFood">`;
    if (!d.food.length) {
      const yd = C.dayOf ? C.dayOf(y) : null;
      h += `<div class="card kc-empty"><p class="small muted">Nothing eaten is logged for ${isToday(d.t0) ? 'today' : 'this day'} yet.</p>${yd && yd.food.length ? `<button class="btn sm mt8" data-act="kcCopyDay">Copy all of ${isToday(d.t0) ? "yesterday's" : 'the day before’s'} food (${n0(yd.eaten)} kcal)</button>` : ''}</div>`;
    }
    for (const [k, nm] of MEALS) {
      const list = by[k].sort((a, b) => a.t - b.t), kc = list.reduce((a, e) => a + (e.kcal || 0), 0), usual = list.length ? '' : usualHtml(k, d.t0);
      // 1.35.2: an empty snack is one slim "+ Morning snack" line, not a whole card
      if (!list.length && (k === 'ms' || k === 'es') && !usual && !selOn && window.__calm !== false) { h += `<div class="kc-snack0" data-meal="${k}"><button class="btn sm ghost" data-act="kcAdd" data-meal="${k}">+ ${nm}</button></div>`; continue; }
      h += `<div class="card kc-meal" data-meal="${k}"><div class="row kc-mh"><div class="grow"><b>${nm}</b>${list.length ? ` <span class="xs muted">· ${n0(kc)} kcal</span>` : ''}</div>
        <button class="ib kc-more" data-act="kcMealMenu" data-meal="${k}" aria-label="More for ${nm}">⋯</button><button class="btn sm" data-act="kcAdd" data-meal="${k}">+ Add</button></div>${list.map(row).join('')}${usual}</div>`;
    }
    if (selOn) h += `<div class="kc-selbar" role="region" aria-label="Selected foods"><b class="grow" aria-live="polite">${sel.ids.size} selected</b><button class="btn sm" data-act="kcSelMove" ${sel.ids.size ? '' : 'disabled'}>Move</button><button class="btn sm" data-act="kcSelCopy" ${sel.ids.size ? '' : 'disabled'}>Copy</button><button class="btn sm danger" data-act="kcSelDel" ${sel.ids.size ? '' : 'disabled'}>Delete</button><button class="btn sm primary" data-act="kcSelDone">Done</button></div>`;
    return h + `</div>`;
  }
  // 1.33 (18): − and + on a food logged from the list change it by one step (one serving, half a serving, 10 g) in place
  const bumpable = e => !!(e.fid && e.un && e.un !== 'pieces' && !e.pc && !(e.items && e.items.length) && !/^[n]:/.test(e.fid) && e.src !== 'ai' && e.src !== 'photo' && e.src !== 'left' && e.src !== 'web');
  ACT.kcBump = el => {
    const e = D.food.find(x => x.id === el.dataset.id); if (!e || !bumpable(e)) return;
    const go = () => {
      const f = foodOfEntry(e), ui = f ? f.units.findIndex(u => sameUnit(u.label, e.un)) : -1;
      if (!f || ui < 0) { toast('Tap the food to change it'); return; }
      const st0 = stepOf(f.units[ui]), q0 = num(e.q) || 1, d = +el.dataset.d;
      const q = d > 0 ? Math.floor(q0 / st0 + 1e-9) * st0 + st0 : Math.ceil(q0 / st0 - 1e-9) * st0 - st0;
      const i = D.food.indexOf(e); if (i < 0) return;
      if (!(q > 0)) {           // below the last step: it goes, with Undo
        D.food.splice(i, 1); S.save(true); redraw();
        undoToast(`${e.name} removed`, () => { D.food.push(e); S.save(true); redraw(); });
        return;
      }
      const n = entryOf(f, q, ui, mealOf(e), e.t); n.id = e.id; for (const k of ['pic', 'big', 'at']) if (e[k]) n[k] = e[k]; if (e.src) n.src = e.src;
      D.food[i] = n; S.save(true); redraw();
      const row = document.querySelector(`.kc-meal [data-id="${CSS.escape(n.id)}"]`); if (row) { const b = row.querySelector('.small[style*="700"]'); if (b) b.classList.add('kc-bumped'); }
    };
    if (e.fid && !/^[yrno]:/.test(e.fid) && !DB) loadDb().then(go, () => toast("The food list couldn't be opened")); else go();
  };
  // 1.33 (17): several foods at once: tick them, then move, copy or delete them together
  let sel = null;          // { t0: the day, ids: Set of entry ids }
  ACT.kcSelStart = el => {
    const t0 = day0(), meal = el && el.dataset ? el.dataset.meal : '';
    sel = { t0, ids: new Set(meal ? mealList(t0, meal).filter(e => e.src !== 'left').map(e => e.id) : []) };
    A.closeSheet(); A.rerender(); toast('Tap foods to tick or untick them');
  };
  ACT.kcSelTog = el => { if (!sel) return; const id = el.dataset.id; if (sel.ids.has(id)) sel.ids.delete(id); else sel.ids.add(id); A.rerender(); };
  ACT.kcSelDone = () => { sel = null; A.rerender(); };
  { const hook0 = A.backHook; A.backHook = () => { if (sel && A.top().name === 'calories' && $('#sheet').classList.contains('hidden')) { sel = null; A.rerender(); return true; } return hook0 ? hook0() : false; }; }          // Back leaves ticking first
  const selList = () => (sel ? D.food.filter(e => sel.ids.has(e.id) && e.src !== 'left') : []);
  ACT.kcSelMove = () => {
    const l = selList(); if (!l.length) return;
    A.openSheet(`<h2>Move ${l.length} food${l.length === 1 ? '' : 's'}</h2><p class="small muted">To which meal?</p>
      <div class="kc-meals mt8">${MEALS.map(([k, nm]) => `<button class="chip" data-act="kcSelMoveTo" data-v="${k}">${nm}</button>`).join('')}</div>
      <button class="btn block mt16" data-act="closeSheet">Cancel</button>`);
  };
  ACT.kcSelMoveTo = el => {
    const m = el.dataset.v, l = selList(); if (!MEAL_NAME[m] || !l.length) return;
    const was = l.map(e => [e, e.meal]); l.forEach(e => { e.meal = m; }); S.save(true); A.closeSheet(); sel = null; redraw();
    undoToast(`${l.length} food${l.length === 1 ? '' : 's'} moved to ${MEAL_NAME[m].toLowerCase()}`, () => { was.forEach(([e, w]) => { if (w) e.meal = w; else delete e.meal; }); S.save(true); redraw(); });
  };
  ACT.kcSelDel = () => {
    const l = selList(); if (!l.length) return;
    const ids = new Set(l.map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id)); S.save(true); sel = null; redraw();
    undoToast(`${l.length} food${l.length === 1 ? '' : 's'} removed`, () => { D.food.push(...l); S.save(true); redraw(); });
  };
  ACT.kcSelCopy = () => { const l = selList(); if (l.length) daysSheet(l, '', 'sel'); };
  // 1.33 (42): the same meal on several days: tick the days (a week either side), and the meal it goes to
  let cp = null;          // { list, meal ('' = each food's own meal), days: Set of day starts, from }
  function daysSheet(list, meal, from) {
    cp = cp && cp.list === list ? cp : { list, meal, days: new Set(), from };
    const t0 = day0(), days = []; for (let i = -6; i <= 7; i++) { const x = new Date(t0); x.setDate(x.getDate() + i); x.setHours(0, 0, 0, 0); if (x.getTime() !== t0) days.push(x.getTime()); }
    const lbl = t => { const x = new Date(t); return isToday(t) ? 'Today' : `${x.toLocaleDateString('en-GB', { weekday: 'short' })} ${x.getDate()}`; };
    const kc = list.reduce((a, e) => a + (e.kcal || 0), 0);
    A.openSheet(`<h2>Copy to other days</h2><p class="small muted">${list.length} food${list.length === 1 ? '' : 's'} · ${n0(kc)} kcal. Tick every day it goes to.</p>
      <div class="kc-days mt8" role="group" aria-label="Days">${days.map(t => `<button class="chip ${cp.days.has(t) ? 'on' : ''}" data-act="kcCpDay" data-t="${t}" aria-pressed="${cp.days.has(t)}">${lbl(t)}</button>`).join('')}</div>
      <label class="lbl mt12">Meal</label><div class="kc-meals">${from === 'sel' ? `<button class="chip ${!cp.meal ? 'on' : ''}" data-act="kcCpMeal" data-v="">As they are</button>` : ''}${MEALS.map(([k, nm]) => `<button class="chip ${cp.meal === k ? 'on' : ''}" data-act="kcCpMeal" data-v="${k}">${nm}</button>`).join('')}</div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="kcCpGo" ${cp.days.size ? '' : 'disabled'}>Copy${cp.days.size ? ` to ${cp.days.size} day${cp.days.size === 1 ? '' : 's'}` : ''}</button></div>`, null, () => { if (cp && cp.done) cp = null; });
  }
  ACT.kcCpDay = el => { if (!cp) return; const t = +el.dataset.t; if (cp.days.has(t)) cp.days.delete(t); else cp.days.add(t); daysSheet(cp.list, cp.meal, cp.from); };
  ACT.kcCpMeal = el => { if (!cp) return; cp.meal = el.dataset.v || ''; daysSheet(cp.list, cp.meal, cp.from); };
  ACT.kcCpGo = () => {
    if (!cp || !cp.days.size) return;
    const made = []; [...cp.days].sort().forEach(t => cp.list.filter(e => e.src !== 'left').forEach(e => made.push(log(copyOf(e, t, cp.meal || mealOf(e))))));
    const n = cp.days.size; cp.done = true; cp = null; if (sel) sel = null; A.closeSheet(); redraw();
    undoToast(`Copied to ${n} day${n === 1 ? '' : 's'} · ${made.length} food${made.length === 1 ? '' : 's'}`, () => { const ids = new Set(made.map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id)); S.save(true); redraw(); });
  };
  ACT.kcMealDays = el => { const l = mealList(day0(), el.dataset.meal).filter(e => e.src !== 'left'); if (l.length) daysSheet(l, el.dataset.meal, 'meal'); };

  // =====================================================================================================
  // Adding food: search, browse, recent, frequent, favourites, My foods, My recipes
  // =====================================================================================================
  let add = null;          // { meal, q, tab, cu, online: [], busy, recipe (a recipe being made) }
  const favs = () => (Array.isArray(st().kcFav) ? st().kcFav : (st().kcFav = []));
  let shown = [];
  const key = f => f.fid || 'n:' + fold(f.name);
  function history(days) {
    const from = Date.now() - days * DAY, seen = new Map();
    for (const e of D.food.slice().sort((a, b) => b.t - a.t)) {
      if (e.t < from) break;
      const k = e.fid || 't:' + fold(e.name); const s = seen.get(k); if (s) { s.n++; continue; }
      seen.set(k, { e, n: 1 });
    }
    return [...seen.values()];
  }
  // 1.33 (15): the amount each food was last logged at by hand (from the list, not a photo or typed line), so a search
  // result shows it and the amount screen starts on it. Built from the log each time the list is painted (a few thousand entries).
  function lastMap() {
    const m = new Map();
    for (const e of D.food) if (e.fid && (e.un || e.pc) && e.src !== 'ai' && e.src !== 'photo' && e.src !== 'web' && e.src !== 'left') { const o = m.get(e.fid); if (!o || e.t > o.t) m.set(e.fid, e); }
    return m;
  }
  // 1.33 (16): the last searches that a food was added from (on this phone)
  const rqs = () => (Array.isArray(S.meta.kcQs) ? S.meta.kcQs : (S.meta.kcQs = []));
  function rqKeep(q) {
    q = String(q || '').trim().slice(0, 40); if (q.length < 2) return;
    const l = rqs(), f = fold(q), i = l.findIndex(x => fold(x) === f); if (i >= 0) l.splice(i, 1);
    l.unshift(q); l.length = Math.min(l.length, 8); S.saveMeta();
  }
  // 1.33 (22): the letters typed, in bold, in each result's name
  let hiQ = '';
  const nameHtml = n => (hiQ && window.Mark ? window.Mark(n, hiQ, altsOf) : esc(n));
  // 1.33 (27): "Did you mean…?" A word that starts no word in the list is put right with the nearest word that does
  // (one letter off, or two in a long word: missing, extra, wrong or two swapped), the commoner word first.
  let vocab = null; const dymKept = new Map();
  function vocabOf() {
    if (vocab && vocab.db === DB) return vocab.w;
    const m = new Map();
    for (const x of DB.list) for (const w of x.key.split(' ')) if (w.length >= 3 && !/\d/.test(w)) { const c = m.get(w) || [0, 0]; c[x.src === 8 ? 1 : 0]++; m.set(w, c); }
    vocab = { db: DB, w: [...m.entries()].map(([w, c]) => [w, c[0] * 4 + c[1], c[0] > 0 || c[1] >= 10]) }; return vocab.w;      // [word, weight, known: in a food table or in 10 packs or more]
  }
  function dist(a, b, max) {         // optimal string alignment distance, given up once it is over max
    const n = a.length, m = b.length; if (Math.abs(n - m) > max) return max + 1;
    let p2 = null, p = Array.from({ length: m + 1 }, (_, j) => j);
    for (let i = 1; i <= n; i++) {
      const c = [i]; let low = i;
      for (let j = 1; j <= m; j++) {
        let v = Math.min(p[j] + 1, c[j - 1] + 1, p[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        if (p2 && i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) v = Math.min(v, p2[j - 2] + 1);
        c.push(v); if (v < low) low = v;
      }
      if (low > max) return max + 1;
      p2 = p; p = c;
    }
    return p[m];
  }
  function didYouMean(q, have) {
    if (!DB) return '';
    const fq0 = fold(q), k = fq0 + '|' + (have || 0); if (dymKept.has(k)) return dymKept.get(k);
    const toks = fq0.split(' ').filter(Boolean); let out = '';
    if (toks.length && toks.length <= 4) {
      const W = vocabOf(); let changed = false;
      const fixed = toks.map(t => {
        if (t.length < 4 || /\d/.test(t)) return t;
        const alts = altsOf(t);
        if (W.some(([w, , ok]) => ok && alts.some(a => w.startsWith(a.split(' ')[0])))) return t;      // a word only a few packs spell that way ("chiken") is a slip too
        const max = t.length >= 7 ? 2 : 1; let best = '', bd = max + 1, bn = 0;
        for (const [w, n, ok] of W) {
          if (!ok || w.length < t.length - max) continue;
          const d = Math.min(dist(t, w, max), w.length > t.length ? dist(t, w.slice(0, t.length), max) : max + 1);
          if (d < bd || (d === bd && n > bn)) { bd = d; best = w; bn = n; }
        }
        if (bd > max) return t;
        changed = true; return best;
      });
      if (changed) { const fq = fixed.join(' '); if (search(fq, -1).filter(x => !x.near).length > (have || 0)) out = fq; }
    }
    dymKept.set(k, out); if (dymKept.size > 40) dymKept.delete(dymKept.keys().next().value);
    return out;
  }
  ACT.kcDym = el => { if (!add) return; add.q = el.dataset.v || ''; const i = $('#kcQ'); if (i) i.value = add.q; add.online = []; paint(); };
  ACT.kcRq = el => { if (!add) return; add.q = el.dataset.v || ''; const i = $('#kcQ'); if (i) i.value = add.q; add.online = []; paint(); };
  ACT.kcRqClear = () => { S.meta.kcQs = []; S.saveMeta(); if (add) paint(); };
  // 1.33 (41): sort the foods found by protein or calories (in 100 g)
  ACT.kcSort = el => { if (!add) return; add.sort = el.dataset.v || ''; paint(); };
  function histFood(h) { const f = h.e.fid ? (foodOfEntry(h.e) || null) : null; if (f) { f.last = h.e; return f; } return againFood(h.e); }
  // 1.35.2 (59): the amount a row shows and its + adds: the one typed with the search ("2 roti"), else the last one, else the usual one
  function shownAmt(food) {
    if (food.want) return food.want;
    if (food.last && food.last.un) { const i = food.units.findIndex(x => sameUnit(x.label, food.last.un)); if (i >= 0) return { ui: i, q: food.last.q > 0 ? food.last.q : 1 }; }
    const ui = food.units[food.def] ? food.def : 0, u = food.units[ui];
    return { ui, q: food.defQ > 0 ? food.defQ : u && u.gram ? 100 : 1 };
  }
  function rowHtml(food, i) {
    if (food.last && food.last.pc && !(NW() && food.want)) {
      const l = food.last, star = favs().includes(key(food)) ? '<span class="kc-star on" aria-label="Favourite">★</span>' : '';
      return `<div class="list-item tap" data-act="kcPick" data-i="${i}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${star}${nameHtml(food.name)}</div>
      <div class="xs muted ellipsis">${esc(l.per || '')}${l.p >= 1 ? ` · P ${g1(l.p)} g` : ''}</div></div><div class="small" style="font-weight:700">${n0(l.kcal)}</div>${plusBtn(food, i)}</div>`;
    }
    let u = food.units[food.last ? Math.max(0, food.units.findIndex(x => sameUnit(x.label, food.last.un))) : food.def] || food.units[0];
    let q = food.last && food.last.q > 0 ? food.last.q : u.gram ? 100 : 1;
    if (NW()) { const a = shownAmt(food); u = food.units[a.ui] || food.units[0]; q = a.q; }
    const v = times(food.base, u.f * q);
    const star = favs().includes(key(food)) ? '<span class="kc-star on" aria-label="Favourite">★</span>' : '';
    return `<div class="list-item tap" data-act="kcPick" data-i="${i}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${star}${nameHtml(food.name)}</div>
      <div class="xs muted ellipsis">${esc(amountText(q, u))}${v.p >= 1 ? ` · P ${g1(v.p)} g` : ''}${food.tag || food.sub ? ' · ' + esc(food.tag || food.sub) : ''}</div></div><div class="small" style="font-weight:700">${n0(v.kcal)}</div>${plusBtn(food, i)}</div>`;
  }
  // 1.33 (40): ＋ adds the food at the amount its row shows (the last amount, or one serving) without opening it
  const plusBtn = (food, i) => (add && !add.recipe && (food.kind !== 'again' || food.from) ? `<button class="kc-plus" data-act="kcQuick" data-i="${i}" aria-label="Add ${esc(food.name)} as shown">+</button>` : '');
  function quickEntry(food, meal) {
    if (NW() && food.want) { const a = food.want; return entryOf(food, a.q, food.units[a.ui] ? a.ui : 0, meal); }
    if (food.last && food.last.pc) { const pi = pieceOf(food); if (pi) return pieceEntry(food, pi, Object.assign(pcDefault(pi), food.last.pc, { on: true }), meal); }
    const ui = Math.max(0, food.last ? food.units.findIndex(x => sameUnit(x.label, food.last.un)) : food.def || 0), u = food.units[ui] || food.units[0];
    const q = food.last && food.last.q > 0 ? food.last.q : u.gram ? 100 : 1;
    if (NW()) { const a = shownAmt(food); return entryOf(food, a.q, food.units[a.ui] ? a.ui : 0, meal); }
    return entryOf(food, q, food.units[ui] ? ui : 0, meal);
  }
  ACT.kcQuick = el => {
    const f = shown[+el.dataset.i]; if (!f || !add) return;
    const e = log(quickEntry(f, add.meal || mealNow()));
    if (f.kind === 'off' && f.off && f.off.code && !D.myFoods.some(m => m.code === f.off.code)) keepOff(f.off);
    kept(e, f.name); redraw();
    const row = el.closest('.list-item'); if (row && window.Glow) window.Glow(row);
  };
  // after a food is added from the search: the search stays open for the next one (8), with what was added and Done
  function kept(e, nm) {
    if (!add) return;
    if (add.q) rqKeep(add.q);
    add.added = (add.added || []).concat([{ id: e.id, name: nm, kcal: e.kcal }]);
    const b = $('#kcAdded'); if (b) b.outerHTML = addedHtml(); else paint();
    const dn = $('#kcAddDone'); if (dn) dn.hidden = false;
    undoToast(`${nm} added to ${MEAL_NAME[e.meal].toLowerCase()} · ${n0(e.kcal)} kcal`, () => {
      D.food = D.food.filter(x => x.id !== e.id); S.save(true);
      if (add && add.added) { add.added = add.added.filter(x => x.id !== e.id); const b2 = $('#kcAdded'); if (b2) b2.outerHTML = addedHtml(); }
      redraw();
    });
  }
  const addedHtml = () => {
    const l = (add && add.added) || []; if (!l.length) return '<div id="kcAdded" hidden></div>';
    const tot = l.reduce((a, x) => a + (x.kcal || 0), 0), last = l[l.length - 1];
    return `<div id="kcAdded" class="kc-added" role="status">✓ <b>${esc(last.name)}</b> added${l.length > 1 ? ` · ${l.length} foods, ${n0(tot)} kcal so far` : ` · ${n0(last.kcal)} kcal`}</div>`;
  };
  ACT.kcAddDone = () => { A.closeSheet(); add = null; };          // (closing first: what was added glows, see glowAdded)
  // 1.33 (33): when the search closes, what was added from it glows once in its meal (the first one scrolled into view)
  function glowAdded(list) {
    if (!list || !list.length || !window.Glow) return;
    setTimeout(() => { if (!$('#sheet').classList.contains('hidden')) return; list.forEach((x, i) => { const r = document.querySelector(`.kc-meal .list-item[data-id="${CSS.escape(x.id)}"]`); if (r) window.Glow(r, i === 0); }); }, 60);
  }
  // ---------------------------------------------------------------- 1.23: your usual meals, and "What should I eat now?"
  // A meal's usual: the foods that were in that meal on at least 40% of the days it was logged in the 28 days before
  // (and on at least 3 of them), each at the amount it was had last. Offered in the meal while it is empty.
  const dayStartOf = t => { const x = new Date(t); x.setHours(0, 0, 0, 0); return x.getTime(); };
  function usualOf(meal, t0) {
    if (st().kcUsual === false) return null;
    const from = t0 - 28 * DAY, days = new Map();
    for (const e of D.food) { if (e.t < from || e.t >= t0 || e.src === 'left' || e.sp || mealOf(e) !== meal) continue; const k = dayStartOf(e.t); if (!days.has(k)) days.set(k, []); days.get(k).push(e); }
    const n = days.size; if (n < 3) return null;
    const seen = new Map();
    for (const [k, list] of days) for (const e of list) { const id = e.fid || 't:' + fold(e.name); if (!seen.has(id)) seen.set(id, { e, days: new Set() }); const x = seen.get(id); x.days.add(k); if (e.t > x.e.t) x.e = e; }
    const items = [...seen.values()].filter(x => x.days.size >= 3 && x.days.size / n >= 0.4).sort((a, b) => b.days.size - a.days.size || (a.e.t % DAY) - (b.e.t % DAY)).slice(0, 6).map(x => x.e);
    if (!items.length) return null;
    return { meal, items, n, kcal: items.reduce((a, e) => a + (e.kcal || 0), 0), p: items.reduce((a, e) => a + (e.p || 0), 0) };
  }
  function usualHtml(meal, t0) {
    const u = usualOf(meal, t0); if (!u) return '';
    const names = u.items.slice(0, 3).map(e => esc(e.name)).join(' · ') + (u.items.length > 3 ? ` · and ${u.items.length - 3} more` : '');
    return `<div class="kc-usual" data-meal="${meal}"><div class="grow" style="min-width:0"><div class="xs muted">Your usual ${MEAL_NAME[meal].toLowerCase()}</div><div class="small ellipsis" style="font-weight:600">${names}</div><div class="xs muted">${n0(u.kcal)} kcal · ${g1(u.p)} g protein</div></div><button class="btn sm primary" data-act="kcUsual" data-meal="${meal}">+ Add</button></div>`;
  }
  function addUsual(meal, t0) {
    const u = usualOf(meal, t0); if (!u) return null;
    const made = u.items.map(e => copyOf(e, t0, meal)); made.forEach(e => { delete e.ok; D.food.push(e); }); S.save(true);
    const ids = new Set(made.map(e => e.id));
    undoToast(`Your usual ${MEAL_NAME[meal].toLowerCase()} added · ${n0(u.kcal)} kcal`, () => { D.food = D.food.filter(x => !ids.has(x.id)); S.save(true); redraw(); });
    redraw(); return made;
  }
  ACT.kcUsual = el => { addUsual(el.dataset.meal, day0()); };
  // the usual for the meal the clock says, if today's is still empty (for the + sheet)
  function usualNow() { const t0 = dayStartOf(Date.now()), m = mealAt(Date.now()); if (D.food.some(e => e.t >= t0 && e.t < t0 + DAY && mealOf(e) === m)) return null; return usualOf(m, t0); }
  ACT.kcUsualNow = () => { const t0 = dayStartOf(Date.now()); if (C.toToday) C.toToday(); addUsual(mealAt(Date.now()), t0); };

  // "What should I eat now?": from foods you logged in the last 60 days, the ones that best fill what is left of today.
  const SHARE = { b: 0.25, ms: 0.08, l: 0.32, es: 0.10, d: 0.25 };
  function whatNow() {
    const t0 = dayStartOf(Date.now()), d = C.dayOf(t0), tg = targets(t0), meal = mealAt(Date.now());
    if (!tg) return { none: 'target' };
    const leftK = Math.round(tg.kcal - d.eaten), leftP = Math.max(0, Math.round(tg.p - (d.protein || 0)));
    const order = MEALS.map(m => m[0]), has = m => d.food.some(e => mealOf(e) === m), open = order.slice(order.indexOf(meal)).filter(m => m === meal || !has(m));
    const part = SHARE[meal] / open.reduce((a, m) => a + SHARE[m], 0);
    const budget = leftK > 0 ? Math.max(120, Math.round(leftK * part / 10) * 10) : 0, wantP = Math.round(leftP * part);
    const eatenNow = new Set(d.food.map(e => e.fid || 't:' + fold(e.name)));
    const cands = history(60).filter(h => h.e.src !== 'left' && !h.e.sp && h.e.kcal > 0 && !(h.e.items && h.e.items.length > 1)).map(h => ({ e: h.e, n: h.n, kcal: h.e.kcal, p: h.e.p || 0 }));
    if (cands.length < 4) return { none: 'history', leftK, leftP, meal, budget };
    let list;
    if (leftK <= 60) list = cands.filter(c => c.kcal <= 160).sort((a, b) => a.kcal - b.kcal || b.p - a.p);                       // at or over the target: the lightest things you eat
    else {
      list = cands.filter(c => c.kcal <= Math.max(budget * 1.3, 180)).map(c => {
        const ps = wantP > 0 ? Math.min(c.p, wantP) / wantP : c.p / Math.max(c.kcal, 1) * 4, close = budget ? Math.max(0, 1 - Math.abs(c.kcal - budget) / budget) : 0;
        return Object.assign(c, { sc: (leftP > 0 ? 0.6 : 0.2) * Math.min(1, ps) + (leftP > 0 ? 0.3 : 0.7) * close + 0.1 * Math.min(1, c.n / 5) + (eatenNow.has(c.e.fid || 't:' + fold(c.e.name)) ? -0.15 : 0) });
      }).sort((a, b) => b.sc - a.sc);
    }
    return { leftK, leftP, meal, budget, wantP, list: list.slice(0, 6), tg, usual: leftK > 60 ? usualOf(meal, t0) : null, has: has(meal) };
  }
  function whatSheet() {
    const w = whatNow(), mn = w.meal ? MEAL_NAME[w.meal].toLowerCase() : '', fs = fuelState();
    let h = `<h2>What should I eat now?</h2>${fs ? `<div class="card mb12" id="fuelNow"><div class="k2">⚡ Fuel for today’s workout</div>${fuelHtml(fs, true)}</div>` : ''}`;
    if (w.none === 'target') h += `<p class="muted">Set your daily target first (the card at the top of the Food tab), so GymDay knows what is left of your day.</p>`;
    else {
      h += `<div class="stats"><div class="stat"><div class="k2">${w.leftK >= 0 ? 'Calories left' : 'Over today'}</div><div class="v">${n0(Math.abs(w.leftK))}</div><div class="k">kcal</div></div><div class="stat"><div class="k2">Protein to go</div><div class="v">${w.leftP > 0 ? n0(w.leftP) : '✓'}</div><div class="k">${w.leftP > 0 ? 'g' : 'target reached'}</div></div></div>`;
      if (w.none === 'history') h += `<p class="muted mt12">Log your food for a few days and GymDay will suggest from what you actually eat.</p>`;
      else {
        h += `<p class="small mt12">${w.leftK > 60 ? `For ${mn}: about <b>${n0(w.budget)} kcal</b>${w.wantP > 0 ? ` with <b>${n0(w.wantP)} g</b> of protein or more` : ''}, so the rest of the day still fits.` : w.leftK >= -60 ? `You are at your target for today. Still hungry? These are the lightest things you eat:` : `You are ${n0(-w.leftK)} kcal over today's target. One day over changes nothing; if you are hungry, eat. The lightest things you eat:`}</p>`;
        if (w.usual && !w.has) h += `<div class="kc-usual mt12"><div class="grow" style="min-width:0"><div class="xs muted">Your usual ${mn}</div><div class="small ellipsis" style="font-weight:600">${w.usual.items.slice(0, 3).map(e => esc(e.name)).join(' · ')}${w.usual.items.length > 3 ? ' …' : ''}</div><div class="xs muted">${n0(w.usual.kcal)} kcal · ${g1(w.usual.p)} g protein</div></div><button class="btn sm primary" data-act="kcWhatUsual">+ Add</button></div>`;
        h += `<div class="sp-sub">From what you eat</div>` + (w.list.length ? `<div class="kc-what">${w.list.map((c, i) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(c.e.name)}</div><div class="xs muted ellipsis">${esc(c.e.per && !/^same as/.test(c.e.per) ? c.e.per + ' · ' : '')}${n0(c.kcal)} kcal · ${g1(c.p)} g protein${w.leftP > 0 && c.p >= 1 ? ` · <span class="green">${Math.min(100, Math.round(c.p / w.leftP * 100))}% of the protein left</span>` : ''}</div></div><button class="btn sm" data-act="kcWhatAdd" data-i="${i}">+ Add</button></div>`).join('')}</div>` : `<p class="small muted">Nothing you have logged lately fits what is left. Search for something small instead.</p>`);
        h += `<p class="xs dim mt12">Suggestions are foods you logged in the last 60 days, at the amount you last had, ranked by how much of the protein and calories left for ${mn || 'now'} they fill. They are ideas, not rules.</p>`;
      }
    }
    whatList = (w.list || []).map(c => c.e);
    h += `<div class="list-item tap mt12" data-act="kcFridgeStart"><span class="sp-ic">📷</span><div class="grow"><div class="small" style="font-weight:600">What can I make?</div><div class="xs muted">A photo of your fridge or shelf: dishes from what you have, with what they bring</div></div><span class="chev">›</span></div>
      <div class="list-item tap" data-act="kcProteinMeals"><span class="sp-ic">🥚</span><div class="grow"><div class="small" style="font-weight:600">Protein per meal</div><div class="xs muted">Which of your meals are light on protein, and what from your own foods fixes it</div></div><span class="chev">›</span></div>`;
    A.openSheet(h + `<div class="row mt16"><button class="btn grow" data-act="kcAdd">Search food</button><button class="btn primary grow" data-act="closeSheet">Done</button></div>`);
  }
  let whatList = [];
  ACT.kcWhatNow = () => { if (C.toToday) C.toToday(); if (A.top().name !== 'calories') A.setRoot('calories'); whatSheet(); };
  ACT.kcWhatAdd = el => {
    const e = whatList[+el.dataset.i]; if (!e) return;
    const t0 = dayStartOf(Date.now()), o = copyOf(e, t0, mealAt(Date.now())); delete o.ok; D.food.push(o); S.save(true); redraw();
    whatSheet(); toast(`${o.name} added to ${MEAL_NAME[o.meal].toLowerCase()} · ${n0(o.kcal)} kcal`);
  };
  ACT.kcWhatUsual = () => { const t0 = dayStartOf(Date.now()); addUsual(mealAt(Date.now()), t0); whatSheet(); };

  // 1.22: the search-everything page (find.js): your foods and recipes first, then the food list, as the add sheet's own rows
  // (a tap opens the amount sheet for today, at the meal for this time of day)
  function findRows(q, n) {
    shown = []; add = null;
    const fq = fold(q); if (!fq) return [];
    if (C.toToday) C.toToday();
    const push = f => { shown.push(f); return rowHtml(f, shown.length - 1); };
    const hit = name => { const k = ' ' + fold(name); return fq.split(' ').every(t => altsOf(t).some(a => k.includes(' ' + a))); };
    const rows = D.myFoods.filter(m => hit(m.name)).map(myFood).concat(D.recipes.filter(r => hit(r.name)).map(recipeFood)).map(push);
    hiQ = q;
    if (DB) { const all = search(q, -1); all.forEach(x => { delete x.near; }); for (const x of all) { if (rows.length >= n) break; rows.push(push(dbFood(x))); } }
    hiQ = '';
    return rows.slice(0, n);
  }
  // 1.35.2 (59): an amount typed with the food: "2 roti", "100g chicken", "1 cup rice", "half plate biryani", "rice 1 cup", "milk 200 ml"
  const AU = { g: 'g', gm: 'g', gms: 'g', gram: 'g', grams: 'g', gr: 'g', kg: 'kg', ml: 'ml', l: 'l', ltr: 'l', litre: 'l', liter: 'l', litres: 'l', liters: 'l',
    cup: 'cup', cups: 'cup', mug: 'cup', mugs: 'cup', katori: 'katori', katoris: 'katori', bowl: 'bowl', bowls: 'bowl', glass: 'glass', glasses: 'glass', tumbler: 'glass', tumblers: 'glass',
    plate: 'plate', plates: 'plate', piece: 'piece', pieces: 'piece', pc: 'piece', pcs: 'piece', slice: 'slice', slices: 'slice', tbsp: 'tbsp', tablespoon: 'tbsp', tablespoons: 'tbsp',
    tsp: 'tsp', teaspoon: 'tsp', teaspoons: 'tsp', scoop: 'scoop', scoops: 'scoop', serving: 'serving', servings: 'serving', handful: 'handful', handfuls: 'handful' };
  const QN = { half: 0.5, quarter: 0.25, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, a: 1, an: 1 }, QF = { '½': 0.5, '¼': 0.25, '¾': 0.75 };
  const AMT_N = '(\\d+(?:\\.\\d+)?(?:\\s*[½¼¾])?|\\d+\\s*/\\s*\\d+|[½¼¾]|half|quarter|one|two|three|four|five|six|seven|eight|nine|ten|an?)';
  const AMT_U = '(' + Object.keys(AU).sort((a, b) => b.length - a.length).join('|') + ')';
  const AMT_A = new RegExp('^' + AMT_N + '\\s*' + AMT_U + '?\\.?\\s+(?:of\\s+)?(.+)$'), AMT_B = new RegExp('^(.+?)\\s+' + AMT_N + '\\s*' + AMT_U + '?\\.?$');
  function amtOf(q) {
    const t = String(q || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2').replace(/\s+/g, ' ').trim(); if (!t) return null;
    const val = x => { x = x.trim(); if (QN[x] != null) return QN[x]; const f = /^(\d+)\s*\/\s*(\d+)$/.exec(x); if (f) return +f[1] / Math.max(1, +f[2]); const m = /^(\d+(?:\.\d+)?)?\s*([½¼¾])?$/.exec(x); return m ? (m[1] ? +m[1] : 0) + (m[2] ? QF[m[2]] : 0) : 0; };
    let m = AMT_A.exec(t), n = 0, u = '', rest = '', w = '';
    if (m) { w = m[1]; n = val(m[1]); u = m[2] ? AU[m[2]] : ''; rest = m[3]; }
    else if ((m = AMT_B.exec(t))) { rest = m[1]; w = m[2]; n = val(m[2]); u = m[3] ? AU[m[3]] : ''; }
    rest = String(rest || '').trim();
    if (!(n > 0) || rest.length < 3) return null;
    if (u === 'kg') { u = 'g'; n *= 1000; } if (u === 'l') { u = 'ml'; n *= 1000; }
    if (!u && n > 30) return null;                   // "chicken 65": part of the name, not how many
    if (!(n <= 5000)) return null;
    return { n: Math.round(n * 1000) / 1000, u, q: rest, w };
  }
  const UNIT_RE = { cup: /^1 cups?\b/i, katori: /\bkatoris?\b/i, bowl: /\bbowls?\b/i, glass: /\b(glass(es)?|tumblers?)\b/i, plate: /\bplates?\b/i, piece: /\b(pieces?|pcs?)\b/i, slice: /\bslices?\b/i,
    tbsp: /\b(tbsp|tablespoons?)\b/i, tsp: /\b(tsp|teaspoons?)\b/i, scoop: /\bscoops?\b/i, serving: /\bservings?\b/i, handful: /\bhandfuls?\b/i };
  const STD_G = { cup: 240, katori: 150, bowl: 250, glass: 250, plate: 300, tbsp: 15, tsp: 5, scoop: 30, handful: 30 };
  // the typed amount in one food's measures: { ui, q }
  function wantFor(food, a) {
    if (!a || !food || !Array.isArray(food.units) || !food.units.length) return null;
    const U = food.units, gi = U.findIndex(u => u.gram), mi = U.findIndex(u => u.ml), hh = u => !u.gram && !u.ml && u.label !== 'oz';
    const cnt = u => { const m = /^\s*(\d+(?:\.\d+)?)\s/.exec(u.label); return m && +m[1] > 0 ? +m[1] : 1; };
    if (a.u === 'g') return gi >= 0 ? { ui: gi, q: a.n } : null;
    if (a.u === 'ml') return mi >= 0 ? { ui: mi, q: a.n } : gi >= 0 ? { ui: gi, q: a.n } : null;
    if (a.u) {
      const re = UNIT_RE[a.u], i = re ? U.findIndex(u => hh(u) && re.test(u.label)) : -1;
      if (i >= 0) return { ui: i, q: a.n / cnt(U[i]) };
      if (STD_G[a.u] && mi >= 0 && /^(glass|cup|bowl|katori)$/.test(a.u)) return { ui: mi, q: Math.round(STD_G[a.u] * a.n) };
      if (STD_G[a.u] && gi >= 0) return { ui: gi, q: Math.round(STD_G[a.u] * a.n) };
    }
    // how many: of its usual measure when that counts things (1 roti, 1 egg, 1 idli), else of its first measure
    const d = U[food.def] && hh(U[food.def]) ? food.def : U.findIndex(hh);
    return d >= 0 ? { ui: d, q: a.n / cnt(U[d]) } : null;
  }
  const amtWord = a => (a.u === 'g' || a.u === 'ml' ? `${g1(a.n)} ${a.u}` : a.u ? `${fmtQ(a.n)} ${a.u}${a.n > 1 && !/^(katori|tbsp|tsp)$/.test(a.u) ? (a.u === 'glass' ? 'es' : 's') : ''}` : fmtQ(a.n));
  const TABS = [['recent', 'Recent'], ['pop', 'Popular'], ['freq', 'Frequent'], ['fav', 'Favourites'], ['my', 'My foods'], ['rec', 'My recipes']];
  function listHtml() {
    shown = [];
    const push = f => { shown.push(f); return rowHtml(f, shown.length - 1); };
    const q0 = (add.q || '').trim(), LM = lastMap();
    // 1.35.2 (59): "2 roti" looks for roti and counts each food for 2 of it (not when the number is in a food's name: "5 star", "chicken 65")
    let aq = NW() && q0 ? amtOf(q0) : null;
    if (aq && !aq.u) {
      const ph = ' ' + fold(aq.w + ' ' + aq.q.split(' ')[0]);
      if (/^(fry|fried|boil|boiled|roast|roasted|bake|baked|grill|grilled|done|cooked|raw)$/.test(aq.q)) aq = null;          // "half fry", "half boil"
      else if (!/^an?$/.test(aq.w) && DB && search(q0, -1).filter(x => !x.near).slice(0, 3).some(x => x.key.startsWith(ph) || ((x.src === 7 || x.src === 8) && (x.key + ' ').includes(ph + ' ')))) aq = null;      // "5 star", "24 mantra"
    }
    const q = aq ? aq.q : q0, fq = fold(q), wantOf = f => { if (aq) f.want = wantFor(f, aq); return f; };
    const pushD = x => { const f = dbFood(x), l = LM.get(f.fid); if (l) f.last = l; return push(wantOf(f)); };
    let h = '';
    if (!DB) h += `<p class="small muted mt12"><span class="kc-spin"></span> Opening the food list…</p>`;
    if (q) {
      const hit = name => { const k = ' ' + fold(name); return fq.split(' ').every(t => altsOf(t).some(a => k.includes(' ' + a))); };
      const mine = D.myFoods.filter(m => hit(m.name)).map(myFood), recs = D.recipes.filter(r => hit(r.name)).map(recipeFood);
      hiQ = q;
      if (aq) h += `<p class="xs muted kc-amtq" role="status">Amount you typed: <b>${esc(amtWord(aq))}</b>. Tap + to add it, or a food to change it.</p>`;
      if (mine.length || recs.length) h += `<div class="kc-sec">Yours</div>` + mine.concat(recs).map(f => push(wantOf(f))).join('');
      const all = DB ? search(q, add.cu) : [], near = all.filter(x => x.near); let res = all.filter(x => !x.near);
      all.forEach(x => { delete x.near; });
      const dym = DB && res.length < 3 ? didYouMean(q, res.length) : '';
      if (dym) { h += `<div class="list-item tap kc-dym" data-act="kcDym" data-v="${esc(dym)}"><div class="grow small">Did you mean <b>${esc(dym)}</b>?</div><div class="accent">›</div></div>`; if (!res.length) { hiQ = dym; h += `<div class="kc-sec">Foods for “${esc(dym)}”</div>` + search(dym, add.cu).filter(x => !x.near).slice(0, 8).map(pushD).join(''); hiQ = q; } }
      if (res.length > 1) {
        const so = add.sort || '';
        if (so === 'p') res = res.slice().sort((a, b) => (b.p || 0) - (a.p || 0)); else if (so === 'kcal') res = res.slice().sort((a, b) => (a.kcal || 0) - (b.kcal || 0));
        h += `<div class="kc-sort" role="group" aria-label="Sort the foods found"><span class="xs muted">Sort</span>${[['', 'Best match'], ['p', 'Most protein'], ['kcal', 'Fewest kcal']].map(([k, nm]) => `<button class="chip sm ${so === k ? 'on' : ''}" data-act="kcSort" data-v="${k}" aria-pressed="${so === k}">${nm}</button>`).join('')}${so ? '<span class="xs dim">in 100 g</span>' : ''}</div>`;
      }
      if (res.length) h += `<div class="kc-sec">${add.cu >= 0 ? esc(DB.cu[add.cu]) + ' · ' : ''}Foods · ${res.length >= 80 ? 'best 80 matches' : res.length + ' found'}</div>` + res.map(pushD).join('');
      if (near.length) h += `<div class="kc-sec">Close matches</div>` + near.map(pushD).join('');
      hiQ = '';
      if (add.online && add.online.length) h += `<div class="kc-sec">Packaged foods · Open Food Facts</div>` + add.online.map(p => push(offFood(p))).join('');
      if (DB && !all.length && !mine.length && !recs.length) h += `<p class="small muted mt12">Nothing in the list matches “${esc(q)}”${add.cu >= 0 ? ` in ${esc(DB.cu[add.cu])}` : ''}.</p>`;
      h += `<div class="list-item tap" data-act="kcOnline"><div class="grow"><div class="small" style="font-weight:600">${add.busy ? '<span class="kc-spin"></span> Searching packaged foods…' : `Search packaged foods online for “${esc(q)}”`}</div><div class="xs muted">Open Food Facts: millions of products, with their labels</div></div><div class="accent">›</div></div>`;
      h += `<div class="list-item tap" data-act="kcOwn"><div class="grow"><div class="small" style="font-weight:600">Add “${esc(q)}” with your own numbers</div><div class="xs muted">calories, and protein, carbs, fat and fibre if you know them</div></div><div class="accent">›</div></div>`;
      return h;
    }
    if (add.cu >= 0 && DB) {
      const list = browse(add.cu);
      return h + `<div class="kc-sec">${esc(DB.cu[add.cu])} · ${list.length >= 150 ? 'the first 150, type to find more' : list.length + ' foods'}</div>` + list.map(pushD).join('');
    }
    if (!add.recipe && rqs().length) h += `<div class="kc-rq" role="group" aria-label="Your last searches"><span class="xs muted">Searched</span>${rqs().map(x => `<button class="chip sm" data-act="kcRq" data-v="${esc(x)}">${esc(x)}</button>`).join('')}<button class="chip sm ghost" data-act="kcRqClear" aria-label="Forget these searches">✕</button></div>`;
    h += `<div class="kc-tabs">${TABS.map(([k, nm]) => `<button class="chip ${add.tab === k ? 'on' : ''}" data-act="kcTab" data-v="${k}">${nm}</button>`).join('')}</div>`;
    let list = [];
    if (add.tab === 'recent') list = history(90).slice(0, 25).map(histFood);
    else if (add.tab === 'pop') list = DB ? popList().map(dbFood) : [];
    else if (add.tab === 'freq') list = history(60).filter(x => x.n >= 2).sort((a, b) => b.n - a.n).slice(0, 25).map(histFood);
    else if (add.tab === 'fav') list = favs().map(k => { if (k.startsWith('n:')) { const e = D.food.slice().reverse().find(x => !x.fid && 'n:' + fold(x.name) === k); return e ? againFood(e) : null; } return foodById(k); }).filter(Boolean);
    else if (add.tab === 'my') list = D.myFoods.map(myFood);
    else if (add.tab === 'rec') list = D.recipes.map(recipeFood);
    h += list.map(push).join('');
    if (!list.length && !(add.tab === 'pop' && !DB)) h += `<p class="small muted mt12">${{ recent: 'Foods you add show up here.', pop: '', freq: 'Foods you add often show up here.', fav: 'Tap ☆ on a food to keep it here.', my: 'Foods you make or scan are kept here.', rec: 'A recipe adds up its ingredients, so a home dish is one tap.' }[add.tab]}</p>`;
    if (add.tab === 'my') h += `<button class="btn block mt12" data-act="kcNewFood">+ New food</button>`;
    if (add.tab === 'rec') h += `<button class="btn block mt12" data-act="kcRecipeNew">+ New recipe</button><div class="kc-ways mt8"><button class="kc-way" data-act="kcRecipeShot" data-cam="1"><span>📷</span>Photo of a recipe</button><button class="kc-way" data-act="kcRecipeShot"><span>🖼</span>From the gallery</button><button class="kc-way" data-act="kcRecipePaste"><span>📋</span>Paste one</button><button class="kc-way" data-act="kcRecipeLink"><span>🔗</span>From a link</button></div><p class="xs dim mt4">A cookbook page, a screenshot, pasted text or a link (a recipe site or a YouTube video): the AI reads the ingredients, GymDay counts them from its own food list.</p>`;
    return h;
  }
  function cuChips() {
    if (!DB) return '';
    return `<div class="kc-cus" role="group" aria-label="Cuisine"><button class="chip ${add.cu < 0 ? 'on' : ''}" data-act="kcCu" data-v="-1">All</button>${DB.cu.map((c, i) => `<button class="chip ${add.cu === i ? 'on' : ''}" data-act="kcCu" data-v="${i}">${esc(c)}</button>`).join('')}</div>`;
  }
  const paint = () => { const l = $('#kcList'); if (l) l.innerHTML = listHtml(); const c = $('#kcCus'); if (c) c.innerHTML = cuChips(); };
  function addSheet() {
    const rec = add.recipe;
    A.openSheet(`<div class="kc-add"><div class="row"><h2 class="grow" style="margin:0">${rec ? 'Add an ingredient' : 'Add to ' + esc(MEAL_NAME[add.meal]).toLowerCase()}</h2>${rec ? `<button class="btn sm" data-act="kcRecipeBack">Back to recipe</button>` : `<button class="btn sm primary" id="kcAddDone" data-act="kcAddDone" ${add.added && add.added.length ? '' : 'hidden'}>Done</button>`}</div>${rec ? '' : addedHtml()}
      ${rec ? '' : `<div class="kc-meals" role="group" aria-label="Meal">${MEALS.map(([k, nm]) => `<button class="chip ${add.meal === k ? 'on' : ''}" data-act="kcMealPick" data-v="${k}">${nm}</button>`).join('')}</div>`}
      <input class="input" id="kcQ" placeholder="Search 30,000 foods: dosa, ragi roti, Maggi…" autocomplete="off" enterkeyhint="search" value="${esc(add.q || '')}">
      ${rec ? '' : window.__calm === false || add.ways ? `<div class="kc-ways"><button class="kc-way" data-act="kcPhoto"><span>📷</span>Photo</button><button class="kc-way" data-act="kcScan"><span>▥</span>Barcode</button><button class="kc-way" data-act="kcOwn"><span>✎</span>Quick add</button><button class="kc-way" data-act="kcRecipeNew"><span>🍲</span>Recipe</button><button class="kc-way" data-act="kcType" data-meal="${esc(add.meal)}"><span>✍</span>Type it</button><button class="kc-way" data-act="kcThali" data-meal="${esc(add.meal)}"><span>🍛</span>Thali</button>${window.Orders ? `<button class="kc-way" data-act="ordShot" data-meal="${esc(add.meal)}"><span>🧾</span>Order</button><button class="kc-way" data-act="packCmp"><span>⚖</span>Compare</button>` : ''}</div>`
        : `<div class="kc-ways kc-ways4"><button class="kc-way" data-act="kcPhoto"><span>📷</span>Photo</button><button class="kc-way" data-act="kcScan"><span>▥</span>Barcode</button><button class="kc-way" data-act="kcType" data-meal="${esc(add.meal)}"><span>✍</span>Type it</button><button class="kc-way" data-act="kcWaysAll" aria-label="More ways to add: quick add, recipe, thali, order, compare"><span>⋯</span>More</button></div>`}
      <div id="kcCus">${cuChips()}</div><div id="kcList" class="kc-list">${listHtml()}</div></div>`,
      s => {
        s.querySelector('.panel').classList.add('kc-tall');
        const i = s.querySelector('#kcQ'); let tm = 0;
        i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (!add) return; add.q = i.value; add.online = []; paint(); }, 110); });
        i.addEventListener('keydown', e => { if (e.key === 'Enter') { i.blur(); } });
      }, () => { const a = add; glowAdded(a && a.added ? a.added.slice() : []); });
    if (!DB) loadDb().then(() => { if (add && $('#kcList')) paint(); }).catch(e => { const l = $('#kcList'); if (l) l.innerHTML = `<p class="small muted mt12">${esc(e.message || "The food list couldn't be opened")}. Quick add still works.</p>`; });
  }
  ACT.kcAdd = el => {
    const meal = el && el.dataset && MEAL_NAME[el.dataset.meal] ? el.dataset.meal : (add && add.meal) || mealNow();
    add = { meal, q: '', tab: D.food.length ? 'recent' : 'pop', cu: -1, online: [] };
    addSheet();
  };
  ACT.kcAddHome = () => { if (C.toToday) C.toToday(); A.go('calories'); add = null; ACT.kcAdd(); };
  ACT.kcMealPick = el => { if (!add) return; add.meal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); const h = $('.kc-add h2'); if (h) h.textContent = 'Add to ' + MEAL_NAME[add.meal].toLowerCase(); };
  ACT.kcTab = el => { if (!add) return; add.tab = el.dataset.v; paint(); };
  ACT.kcCu = el => { if (!add) return; const v = +el.dataset.v; add.cu = add.cu === v ? -1 : v; paint(); };
  ACT.kcOnline = async () => {
    if (!add || add.busy) return; const q = (add.q || '').trim(); if (!q) return;
    add.busy = true; paint();
    try { add.online = await offSearch(q); if (!add.online.length) toast('No packaged food found online for that'); }
    catch (e) { toast((e && e.message) || "Couldn't search online. Check the internet connection."); }
    if (add) { add.busy = false; paint(); }
  };

  // =====================================================================================================
  // v1.11: Eating out. A photo of the plate first (the AI is told it's a restaurant meal), then the person's own restaurants
  // (each keeps what was eaten there, synced), chain menus (McDonald's India) and restaurant dishes by cuisine at the
  // serving sizes restaurants give (foods.js doc.out, built by food_eatout.py).
  // =====================================================================================================
  const places = () => (Array.isArray(D.places) ? D.places : (D.places = []));
  let out = null;            // { meal, place (id or ''), view: '' | 'cat' | 'chain' | 'place', i, q }
  let lastPlace = '';        // the restaurant picked last, until the app is closed
  let outShown = [];
  const outCats = () => (DB && DB.out && Array.isArray(DB.out.c) ? DB.out.c : []);
  // a dish as a restaurant serves it: its restaurant servings first, under the name on the menu
  function outFood(fid, shown) {
    const x = DB && DB.byId.get(fid); if (!x) return null;
    const f = dbFood(x), ps = portionsOf((DB.out && DB.out.p && DB.out.p[fid + '|' + shown]) || '');
    if (ps.length) { f.units = ps.map(u => ({ label: u.label, g: u.g, f: u.g / 100 })).concat(f.units); f.def = 0; f.defQ = 0; }
    if (shown && fold(shown) !== fold(x.name)) { f.note = `Counted as “${x.name}” from the food list. ${f.note || ''}`.trim(); f.name = shown; }
    f.sub = 'Eating out · ' + (f.sub || ''); return f;
  }
  let chainsKept = null;
  function chainsOf() {
    if (chainsKept && chainsKept.db === DB) return chainsKept.list;
    const by = new Map(), meta = (DB.out && DB.out.k) || {};
    for (const x of DB.list) if (isChainRow(x)) { const g = String(DB.gr[x.gr] || '').replace(/^Restaurant chains: /, ''); if (!by.has(g)) by.set(g, []); by.get(g).push(x); }
    const list = [...by.entries()].map(([name, rows]) => ({ name, rows: rows.sort((a, b) => (a.key < b.key ? -1 : 1)), kind: (meta[name] || [])[0] || 'Fast food & pizza', city: (meta[name] || [])[1] || '' }))
      .sort((a, b) => (a.name.toLowerCase() < b.name.toLowerCase() ? -1 : 1));
    chainsKept = { db: DB, list };
    return list;
  }
  // v1.34: where a chain's numbers come from, in a few words
  const chainWhere = c => c.rows.every(x => x.src === 12) ? 'estimates from a nutrition database' : c.rows.every(x => x.src === 14) ? 'worked out by GymDay from its menu'
    : c.rows.some(x => x.src === 11 || x.src === 14) ? 'its own numbers, some worked out' : 'its own numbers';
  const PKINDS = ['South Indian', 'Biryani & kebabs', 'North Indian & street food', 'Sweets & desserts', 'Cafés & bakeries', 'Fast food & pizza'];
  const KIND_IC = { 'South Indian': '🥞', 'Biryani & kebabs': '🍛', 'North Indian & street food': '🍲', 'Sweets & desserts': '🍨', 'Cafés & bakeries': '☕', 'Fast food & pizza': '🍔' };
  const chainRow = c => `<div class="list-item tap" data-act="kcOutChain" data-v="${esc(c.name)}"><span class="sp-ic">${KIND_IC[c.kind] || '🍔'}</span><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${esc(c.name)}</div><div class="xs muted ellipsis">${c.city ? esc(c.city) + ' · ' : ''}${c.rows.length} items, ${chainWhere(c)}</div></div><span class="chev">›</span></div>`;
  function chainsHtml() {
    const all = chainsOf(), open = out.kinds || (out.kinds = {});
    return PKINDS.map(k => { const cs = all.filter(c => c.kind === k); if (!cs.length) return ''; const on = !!open[k];
      return `<button class="list-item tap kc-kind" data-act="kcOutKind" data-v="${esc(k)}" aria-expanded="${on}"><span class="sp-ic">${KIND_IC[k]}</span><div class="grow" style="min-width:0;text-align:left"><div class="small" style="font-weight:600">${esc(k)}</div><div class="xs muted ellipsis">${esc(cs.slice(0, 4).map(c => c.name).join(', '))}${cs.length > 4 ? '…' : ''}</div></div><span class="xs muted">${cs.length}</span><span class="chev">${on ? '⌃' : '⌄'}</span></button>${on ? `<div class="kc-kindlist">${cs.map(chainRow).join('')}</div>` : ''}`; }).join('');
  }
  const placeOf = id => places().find(p => p.id === id) || null;
  // what was eaten at a restaurant is kept with it: the same food and amount is one tap next time
  function placeKeep(id, e) {
    const p = placeOf(id); if (!p) return;
    const k = (e.fid || '') + '|' + fold(e.name), items = Array.isArray(p.items) ? p.items : (p.items = []);
    const keep = { k, name: e.name, kcal: e.kcal, per: e.per || '' };
    for (const f of ['fid', 'q', 'un', 'g', 'p', 'c', 'f', 'fib']) if (e[f] != null && e[f] !== '') keep[f] = e[f];
    if (e.pc) keep.pc = e.pc; if (Array.isArray(e.items)) keep.items = e.items;
    const i = items.findIndex(x => x.k === k);
    if (i >= 0) { keep.n = (items[i].n || 1) + 1; items.splice(i, 1); } else keep.n = 1;
    items.unshift(keep); if (items.length > 80) items.length = 80;
    p.t = Date.now(); S.save(true);
  }
  function outRow(f, i, sub) {
    const u = f.units[f.def] || f.units[0], v = times(f.base, u.f * (u.gram ? 100 : 1));
    return `<div class="list-item tap" data-act="kcOutPick" data-i="${i}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(f.name)}</div>
      <div class="xs muted ellipsis">${esc(sub || amountText(u.gram ? 100 : 1, u))}${v.p >= 1 ? ` · P ${g1(v.p)} g` : ''}</div></div><div class="small" style="font-weight:700">${n0(v.kcal)}</div></div>`;
  }
  // a dish eaten at one of the person's restaurants, as it was logged there
  function keptRow(it, i) {
    return `<div class="list-item tap" data-act="kcOutPick" data-i="${i}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(it.name)}</div>
      <div class="xs muted ellipsis">${esc(it.per || '')}${it.p >= 1 ? ` · P ${g1(it.p)} g` : ''}${it.n > 1 ? ` · had ${it.n} times` : ''}</div></div><div class="small" style="font-weight:700">${n0(it.kcal)}</div><button class="ib kc-again" data-act="kcOutAgain" data-i="${i}" aria-label="Add ${esc(it.name)} again">+</button></div>`;
  }
  function outListHtml() {
    outShown = [];
    const push = (f, sub) => { outShown.push(f); return outRow(f, outShown.length - 1, sub); };
    const q = fold(out.q || '');
    if (!DB) return `<p class="small muted mt12"><span class="kc-spin"></span> Opening the menus…</p>`;
    if (q) {
      const qw = q.split(' ').filter(Boolean).map(altsOf);           // 1.34: other spellings too ("jigardanda" finds Jigarthanda)
      const hit = s => { const t = ' ' + fold(s); return qw.every(a => a.some(w => t.includes(' ' + w))); };
      let h = '';
      const pl = places().filter(p => hit(p.name));
      if (pl.length) h += `<div class="kc-sec">Your restaurants</div>` + pl.map(p => `<div class="list-item tap" data-act="kcOutPlace" data-id="${esc(p.id)}"><span class="sp-ic">📍</span><div class="grow small" style="font-weight:600">${esc(p.name)}</div><span class="chev">›</span></div>`).join('');
      const dishes = []; for (const [, ds] of outCats()) for (const [fid, shown] of ds) if (hit(shown)) dishes.push([fid, shown]);
      if (dishes.length) h += `<div class="kc-sec">Restaurant dishes</div>` + dishes.slice(0, 40).map(([fid, shown]) => { const f = outFood(fid, shown); return f ? push(f) : ''; }).join('');
      const plc = chainsOf().filter(c => hit(c.name) || hit(c.name + ' ' + c.city));
      if (plc.length) h += `<div class="kc-sec">Places</div>` + plc.slice(0, 8).map(chainRow).join('');
      const ch = []; for (const c of chainsOf()) for (const x of c.rows) if (hit(x.name)) ch.push(x);
      if (ch.length) h += `<div class="kc-sec">Chains</div>` + ch.slice(0, 30).map(x => push(dbFood(x))).join('');
      if (!h) h += `<p class="small muted mt12">No restaurant dish called “${esc(out.q)}” in the app. Look it up on the web, take a photo of it, or look in the whole food list.</p>`;
      h += `<div class="list-item tap" data-act="kcMenu" data-q="${esc(out.q)}"><span class="sp-ic">🌐</span><div class="grow"><div class="small" style="font-weight:600">Is “${esc(out.q)}” a restaurant? Get its menu</div><div class="xs muted">The menu it serves now, from the web, then each item with its sizes and choices</div></div><div class="accent">›</div></div>`;
      h += `<div class="list-item tap" data-act="kcOutWeb" data-q="${esc(out.q)}"><span class="sp-ic">🔎</span><div class="grow"><div class="small" style="font-weight:600">Look up “${esc(out.q)}” on the web</div><div class="xs muted">The calories and macros, from the restaurant's own numbers where they're online</div></div><div class="accent">›</div></div>`;
      return h + `<div class="list-item tap" data-act="kcOutAll"><div class="grow"><div class="small" style="font-weight:600">Search the whole food list for “${esc(out.q)}”</div><div class="xs muted">30,000 foods and packs</div></div><div class="accent">›</div></div>`;
    }
    if (out.view === 'cat') {
      const c = outCats()[out.i]; if (!c) { out.view = ''; return outListHtml(); }
      return `<button class="btn sm mt8" data-act="kcOutHome">‹ All</button><div class="kc-sec">${esc(c[0])} · ${c[1].length}</div>` + c[1].map(([fid, shown]) => { const f = outFood(fid, shown); return f ? push(f) : ''; }).join('');
    }
    if (out.view === 'chain') {
      const c = chainsOf().find(x => x.name === out.i); if (!c) { out.view = ''; return outListHtml(); }
      return `<button class="btn sm mt8" data-act="kcOutHome">‹ All</button><div class="kc-sec">${esc(c.name)} · ${c.rows.length} items</div><p class="xs muted">${c.city ? esc(c.city) + '. ' : ''}Numbers: ${chainWhere(c)}${c.rows.some(x => x.src === 14) ? '. Tap a dish to see how' : ''}.</p>` + c.rows.map(x => push(dbFood(x))).join('');
    }
    if (out.view === 'place') {
      const p = placeOf(out.i); if (!p) { out.view = ''; return outListHtml(); }
      const items = (p.items || []).slice().sort((a, b) => (b.n || 1) - (a.n || 1));
      outShown = items.map(it => ({ kept: it }));
      return `<div class="row mt8"><button class="btn sm" data-act="kcOutHome">‹ All</button><div class="grow"></div><button class="btn sm danger" data-act="kcOutForget" data-id="${esc(p.id)}">Forget this place</button></div>
        <div class="kc-sec">📍 ${esc(p.name)}${items.length ? ` · what you've had here` : ''}</div>${items.map(keptRow).join('')}
        ${items.length ? '' : `<p class="small muted mt8">Nothing yet. Take a photo of your plate, or pick dishes below: they're kept with ${esc(p.name)} for next time.</p>`}
        <div class="list-item tap mt8" data-act="kcMenu" data-q="${esc(p.name)}"><span class="sp-ic">🌐</span><div class="grow"><div class="small" style="font-weight:600">${esc(p.name)}’s menu from the web</div><div class="xs muted">What it serves now, with each item's sizes and choices</div></div><span class="chev">›</span></div>
        <div class="kc-sec">Restaurant dishes</div>${catsHtml()}`;
    }
    const ps = places().slice().sort((a, b) => (b.t || 0) - (a.t || 0));
    return `<div class="kc-sec">Your restaurants</div>
      <div class="kc-fr kc-places">${ps.slice(0, 12).map(p => `<button class="chip ${out.place === p.id ? 'on' : ''}" data-act="kcOutPlace" data-id="${esc(p.id)}">📍 ${esc(p.name)}</button>`).join('')}<button class="chip" data-act="kcOutNew">+ A place</button></div>
      ${ps.length ? '' : `<p class="xs dim mt4">Add the place you're eating at: what you eat there is kept with it, so next time it's one tap.</p>`}
      <div class="kc-sec">Chains and famous places</div>${chainsHtml()}
      <div class="list-item tap" data-act="kcMenu"><span class="sp-ic">🌐</span><div class="grow"><div class="small" style="font-weight:600">A restaurant's menu from the web</div><div class="xs muted">The menu it serves now, then each item with its sizes, milk, extras and other choices</div></div><span class="chev">›</span></div>
      ${window.Orders ? `<div class="list-item tap" data-act="ordShot" data-meal="${esc(out ? out.meal : '')}"><span class="sp-ic">🧾</span><div class="grow"><div class="small" style="font-weight:600">From an order screenshot</div><div class="xs muted">Swiggy, Zomato or a bill: each item with that restaurant's numbers</div></div><span class="chev">›</span></div>` : ''}
      <div class="list-item tap" data-act="kcOutWeb"><span class="sp-ic">🔎</span><div class="grow"><div class="small" style="font-weight:600">Not here? Look it up on the web</div><div class="xs muted">Type the order in your own words (“flat white, small, skimmed milk”): the numbers are found online, with the pages they came from</div></div><span class="chev">›</span></div>
      <div class="kc-sec">Restaurant dishes</div>${catsHtml()}`;
  }
  const catsHtml = () => outCats().map(([c, ds], i) => `<div class="list-item tap" data-act="kcOutCat" data-i="${i}"><div class="grow"><div class="small" style="font-weight:600">${esc(c)}</div><div class="xs muted ellipsis">${esc(ds.slice(0, 4).map(d => d[1]).join(', '))}…</div></div><span class="xs muted">${ds.length}</span><span class="chev">›</span></div>`).join('');
  const outPaint = () => { const l = $('#kcOutList'); if (l) l.innerHTML = outListHtml(); const at = $('#kcOutAt'); if (at) at.innerHTML = atHtml(); };
  const atHtml = () => { const p = out && out.place ? placeOf(out.place) : null; return p ? `📍 At <b>${esc(p.name)}</b> · <button class="linkish" data-act="kcOutLeave">not here</button>` : ''; };
  function outSheet() {
    out = out || { meal: mealNow(), place: lastPlace, view: '', i: 0, q: '' };
    A.openSheet(`<div class="kc-add"><h2 style="margin:0">Eating out</h2>
      <div class="kc-meals mt8" role="group" aria-label="Meal">${MEALS.map(([k, nm]) => `<button class="chip ${out.meal === k ? 'on' : ''}" data-act="kcOutMeal" data-v="${k}">${nm}</button>`).join('')}</div>
      <p class="small mt8" id="kcOutAt">${atHtml()}</p>
      <button class="btn primary block mt8 kc-outphoto" data-act="kcOutPhoto">📷 Photo of your plate<span class="xs">The AI reads it as a restaurant meal: bigger portions, more oil</span></button>
      <input class="input mt12" id="kcOutQ" placeholder="Search: butter naan, dosa, McSpicy, a restaurant…" autocomplete="off" enterkeyhint="search" value="${esc(out.q || '')}">
      <div id="kcOutList" class="kc-list">${outListHtml()}</div></div>`,
      s => {
        s.querySelector('.panel').classList.add('kc-tall');
        const i = s.querySelector('#kcOutQ'); let tm = 0;
        i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (!out) return; out.q = i.value; outPaint(); }, 120); });
        i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
      });
    if (!DB) loadDb().then(() => { if (out && $('#kcOutList')) outPaint(); }).catch(() => { });
  }
  ACT.kcOut = () => { out = null; outSheet(); };
  ACT.kcOutMeal = el => { if (!out) return; out.meal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcOutHome = () => { if (!out) return; out.view = ''; out.q = ''; const i = $('#kcOutQ'); if (i) i.value = ''; outPaint(); };
  ACT.kcOutCat = el => { if (!out) return; out.view = 'cat'; out.i = +el.dataset.i; outPaint(); $('#kcOutList').scrollIntoView({ block: 'start' }); };
  ACT.kcOutKind = el => { if (!out) return; const k = el.dataset.v; out.kinds = out.kinds || {}; out.kinds[k] = !out.kinds[k]; outPaint(); };
  ACT.kcOutChain = el => { if (!out) return; out.view = 'chain'; out.i = el.dataset.v; outPaint(); $('#kcOutList').scrollIntoView({ block: 'start' }); };
  ACT.kcOutPlace = el => { if (!out) return; const id = el.dataset.id; out.place = lastPlace = id; out.view = 'place'; out.i = id; out.q = ''; const i = $('#kcOutQ'); if (i) i.value = ''; outPaint(); };
  ACT.kcOutLeave = () => { if (!out) return; out.place = lastPlace = ''; if (out.view === 'place') out.view = ''; outPaint(); };
  ACT.kcOutNew = () => {
    A.openSheet(`<h2>Where are you eating?</h2><input class="input mt8" id="kcPlaceName" maxlength="60" placeholder="e.g. Paradise Biryani, Koramangala" autocomplete="off">
      <p class="xs dim mt8">What you eat here is kept with it, so next time it's one tap. It's kept with your data, and synced if you're signed in.</p>
      <div class="row mt16"><button class="btn" data-act="kcOutNewBack">Back</button><button class="btn primary grow" data-act="kcOutNewSave">Eating here</button></div>`,
      s => { const i = s.querySelector('#kcPlaceName'); if (i && !('ontouchstart' in window)) i.focus(); });
  };
  ACT.kcOutNewBack = () => outSheet();
  ACT.kcOutNewSave = () => {
    const name = String(($('#kcPlaceName') || {}).value || '').trim().slice(0, 60); if (!name) { toast('Type the name of the place'); return; }
    let p = places().find(x => fold(x.name) === fold(name));
    if (!p) { p = { id: S.uid(), name, items: [], t: Date.now() }; places().push(p); S.save(true); }
    out = out || { meal: mealNow(), view: '', i: 0, q: '' }; out.place = lastPlace = p.id; out.view = 'place'; out.i = p.id; out.q = ''; outSheet();
  };
  ACT.kcOutForget = el => {
    const id = el.dataset.id, p = placeOf(id); if (!p) return;
    D.places = places().filter(x => x.id !== id); if (D.gone) D.gone['w:' + id] = Date.now(); S.save(true);
    if (out) { if (out.place === id) out.place = ''; out.view = ''; } if (lastPlace === id) lastPlace = '';
    outPaint();
    undoToast(`${p.name} forgotten`, () => { places().push(p); if (D.gone) delete D.gone['w:' + id]; S.save(true); outPaint(); });
  };
  ACT.kcOutAll = () => { const q = out ? out.q : ''; add = { meal: out ? out.meal : mealNow(), q, tab: 'recent', cu: -1, online: [] }; addSheet(); };
  ACT.kcOutPick = el => {
    const x = outShown[+el.dataset.i]; if (!x || !out) return;
    if (x.kept) {                                            // the same as last time at this place
      const it = x.kept, f = it.fid ? (outFood(it.fid, it.name) || foodById(it.fid)) : null;
      if (f && (f.units.some(u => sameUnit(u.label, it.un)) || (it.pc && pieceOf(f)))) return openPick(f, { back: 'out', meal: out.meal, entry: it });
      return ACT.kcOutAgain(el);
    }
    openPick(x, { back: 'out', meal: out.meal, byAmount: true });
  };
  // one tap: the same dish and amount as last time at this place
  ACT.kcOutAgain = (el, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const x = outShown[+el.dataset.i]; if (!x || !x.kept || !out) return; const it = x.kept;
    const e = { id: S.uid(), t: stampMeal(out.meal), meal: out.meal, name: it.name, kcal: it.kcal || 0, src: it.fid ? 'list' : 'typed' };
    for (const f of ['fid', 'q', 'un', 'g', 'p', 'c', 'f', 'fib', 'per', 'pc', 'items']) if (it[f] != null) e[f] = it[f];
    if (out.place) e.at = out.place;
    log(e); if (out.place) placeKeep(out.place, e);
    redraw(); outPaint();
    undoToast(`${it.name} added to ${MEAL_NAME[e.meal].toLowerCase()} · ${n0(e.kcal)} kcal`, () => { D.food = D.food.filter(y => y.id !== e.id); S.save(true); redraw(); });
  };
  // ---------------------------------------------------------------- v1.12: a dish that isn't in the app, looked up on the web
  let web = null;
  const BASIS = { restaurant: "the restaurant's own numbers", 'delivery app': 'its Swiggy or Zomato listing', database: 'a nutrition database', estimate: 'an estimate from the recipe' };
  // v1.25: an item's choices. Its sizes carry the whole item's numbers; every other choice says what it changes (minus allowed),
  // growing with the size where the server marked it. sel = one index for a pick-one group, a list of indexes for a pick-any group.
  const selOf = r => ((r && r.groups) || []).map(g => {
    if (!g.one) return g.options.map((o, i) => (o.sel ? i : -1)).filter(i => i >= 0);
    const s = g.options.findIndex(o => o.sel), u = g.options.findIndex(o => o.usual);
    return s >= 0 ? s : Math.max(0, u);
  });
  function orderCalc(r, sel) {
    const gs = (r && r.groups) || [], zi = gs.findIndex(g => g.sizes), names = [], amt = o => (o && (o.ml || o.grams)) || 0;
    let kcal = r.kcal || 0, p = r.protein || 0, c = r.carbs || 0, f = r.fat || 0, fib = r.fibre != null ? r.fibre : null, g = r.grams || 0, k = 1, est = false, serving = r.serving || '';
    if (zi >= 0 && sel) {
      const zg = gs[zi], o = zg.options[sel[zi]], u = zg.options.find(x => x.usual) || zg.options[0];
      if (o) {
        names.push(o.name);
        if (o !== u) {
          k = amt(o) && amt(u) ? amt(o) / amt(u) : (u.kcal > 0 ? o.kcal / u.kcal : 1);
          kcal = o.kcal; p = o.protein; c = o.carbs; f = o.fat; if (fib != null) fib *= k; g = amt(o) || g * k; if (o.est) est = true;
          serving = o.name + (o.ml ? ` (${n0(o.ml)} ml)` : o.grams ? ` (${n0(o.grams)} g)` : '');
        }
      }
    }
    gs.forEach((gr, i) => {
      if (i === zi || !sel) return;
      for (const j of (gr.one ? [sel[i]] : (sel[i] || []))) {
        const o = gr.options[j]; if (!o || o.usual) continue;
        const m = o.scales ? k : 1;
        kcal += o.kcal * m; p += o.protein * m; c += o.carbs * m; f += o.fat * m; names.push(o.name); if (o.est) est = true;
      }
    });
    return { kcal: Math.max(0, kcal), p: Math.max(0, p), c: Math.max(0, c), f: Math.max(0, f), fib: fib != null ? Math.max(0, fib) : null, g, names, est, serving, k };
  }
  function webResHtml() {
    const w = web, r = w && w.r; if (!r || !r.found) return '';
    const calc = orderCalc(r, w.sel), est = new Set(r.estimated || []);
    const m = (k, nm, v) => `<div class="stat"><div class="k2">${nm}</div><div class="v">${g1(v * w.n)}</div><div class="k">g${est.has(k) || calc.est ? ' · estimate' : ''}</div></div>`;
    const sub = (o, gr) => {
      if (gr.sizes) return `${o.ml ? n0(o.ml) + ' ml · ' : o.grams ? n0(o.grams) + ' g · ' : ''}${n0(o.kcal)} kcal`;
      if (o.usual) return 'as it comes';
      const v = Math.round(o.kcal * (o.scales ? calc.k : 1));
      return `${o.est ? '≈ ' : ''}${v > 0 ? '+' : v < 0 ? '−' : ''}${n0(Math.abs(v))} kcal`;
    };
    const groups = (r.groups || []).map((gr, gi) => `<div class="kc-sec">${esc(gr.name)}${gr.one ? '' : ' · pick any'}</div><div class="kc-opts" role="group" aria-label="${esc(gr.name)}">${gr.options.map((o, oi) => {
      const on = gr.one ? w.sel[gi] === oi : (w.sel[gi] || []).includes(oi);
      return `<button class="chip ${on ? 'on' : ''}" data-act="kcWebOpt" data-g="${gi}" data-i="${oi}" aria-pressed="${on}">${esc(o.name)}<span class="sub">${sub(o, gr)}</span></button>`;
    }).join('')}</div>`).join('');
    return `<div class="card mt12 kc-webres"><div class="small" style="font-weight:700">${esc(r.name)}</div><div class="xs muted">${esc([r.place, calc.serving].filter(Boolean).join(' · '))}</div>
        <div class="row mt8" style="gap:8px;align-items:baseline"><div class="title">${calc.est ? '≈ ' : ''}<b>${n0(calc.kcal * w.n)}</b> kcal</div><span class="kc-badge ${r.basis === 'restaurant' || r.basis === 'delivery app' ? 'b-table' : 'b-est'}">${esc(BASIS[r.basis] || 'online')}</span></div>
        <div class="stats mt8">${m('protein', 'Protein', calc.p)}${m('carbs', 'Carbs', calc.c)}${m('fat', 'Fat', calc.f)}</div>
        ${groups}
        ${calc.est ? `<p class="xs muted mt8">≈ The restaurant doesn't publish numbers for every choice, so those were worked out from what goes in.</p>` : ''}
        ${r.note ? `<p class="xs muted mt8">${esc(r.note)}</p>` : ''}
        ${(r.sources || []).length ? `<div class="xs mt8 kc-web-src">From: ${r.sources.map((x, i) => `<a href="#" data-act="kcWebLink" data-i="${i}">${esc(x.title)}</a>`).join(' · ')}</div>` : ''}
        ${w.at ? `<p class="xs dim mt8">Kept on this phone since ${agoWords(w.at)} · <button class="linkish" data-act="kcWebGo">Look again</button></p>` : ''}
        <p class="xs dim mt8">Found online by the AI, so check it against the menu if you can. Restaurants change their recipes.</p></div>
        <div class="kc-qty"><button class="btn" data-act="kcWebN" data-d="-0.5" aria-label="Less">−</button><div class="grow"><b>${fmtQ(w.n)}</b><div class="xs muted">${w.n === 1 ? 'serving' : 'servings'}</div></div><button class="btn" data-act="kcWebN" data-d="0.5" aria-label="More">+</button></div>
        <button class="btn primary block mt12" data-act="kcWebAdd">Add to ${esc(MEAL_NAME[w.meal].toLowerCase())}</button>`;
  }
  const webPaint = () => { const el = $('#kcWebRes'); if (el && web && web.r && web.r.found) el.innerHTML = webResHtml(); else webSheet(); };
  function webSheet() {
    const w = web, r = w.r;
    let body = '';
    if (w.busy) body = `<p class="small muted mt12"><span class="kc-spin"></span> Searching the web for ${esc(w.q)}${w.where ? ' at ' + esc(w.where) : ''}… this can take half a minute.</p>`;
    else if (w.err) body = `<p class="small mt12">${esc(w.err)}</p>`;
    else if (r && r.found) body = `<div id="kcWebRes">${webResHtml()}</div>`;
    else if (r) body = `<p class="small mt12">Couldn't find ${esc(w.q)} online${w.where ? ' at ' + esc(w.where) : ''}.</p>${(r.alts || []).length ? `<div class="kc-sec">Did you mean</div><div class="row" style="gap:8px;flex-wrap:wrap">${r.alts.map(a => `<button class="chip" data-act="kcWebAlt" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}`;
    const failed = !w.busy && (w.err || (r && !r.found)), fromMenu = w.from === 'menu' && !!menu;
    A.openSheet(`<h2>Look it up on the web</h2>
      <label class="lbl mt8">The dish or drink</label><input class="input" id="kcWebQ" maxlength="120" value="${esc(w.q)}" placeholder="e.g. Flat white, small, skimmed milk" autocomplete="off">
      <div class="xs dim mt4">Say the size and any changes in your own words: they come back as choices you can tap.</div>
      <label class="lbl mt8">The restaurant · optional</label><input class="input" id="kcWebW" maxlength="60" value="${esc(w.where)}" placeholder="e.g. Starbucks, KFC, a local cafe" autocomplete="off">
      <button class="btn ${r && r.found ? '' : 'primary'} block mt12" data-act="kcWebGo" ${w.busy ? 'disabled' : ''}>🔎 Search the web</button>
      ${body}
      ${failed ? `<button class="btn primary block mt12" data-act="kcOutPhoto">📷 Take a photo of it instead</button>` : ''}
      <button class="btn block mt8" data-act="kcWebBack">${fromMenu ? '‹ Back to the menu' : '‹ Back to eating out'}</button>`);
  }
  ACT.kcOutWeb = el => {
    const p = out && out.place ? placeOf(out.place) : null;
    web = { q: (el && el.dataset && el.dataset.q) || (out && out.q) || '', where: p ? p.name : '', meal: out ? out.meal : mealNow(), n: 1, r: null, sel: [] };
    webSheet(); if (web.q) setTimeout(() => ACT.kcWebGo(), 0);
  };
  ACT.kcWebBack = () => { const m = web && web.from === 'menu' && menu; web = null; if (m) menuSheet(); else outSheet(); };
  ACT.kcWebAlt = el => { if (!web) return; web.q = el.dataset.v; ACT.kcWebGo(); };
  ACT.kcWebN = el => { if (!web) return; web.n = Math.max(0.5, Math.min(10, web.n + (+el.dataset.d || 0))); webPaint(); };
  ACT.kcWebOpt = el => {
    const w = web, r = w && w.r; if (!r || !r.found) return;
    const gi = +el.dataset.g, oi = +el.dataset.i, gr = (r.groups || [])[gi]; if (!gr || !gr.options[oi]) return;
    if (gr.one) w.sel[gi] = oi;
    else { const a = (w.sel[gi] || []).slice(), at = a.indexOf(oi); if (at >= 0) a.splice(at, 1); else a.push(oi); w.sel[gi] = a.sort((x, y) => x - y); }
    webPaint();
  };
  ACT.kcWebLink = (el, ev) => { if (ev && ev.preventDefault) ev.preventDefault(); const x = web && web.r && (web.r.sources || [])[+el.dataset.i]; if (x && /^https:\/\//.test(x.uri)) window.open(x.uri, '_blank'); };
  ACT.kcWebGo = async () => {
    if (!web) return;
    const qi = $('#kcWebQ'), wi = $('#kcWebW');
    if (qi) web.q = String(qi.value || '').trim(); if (wi) web.where = String(wi.value || '').trim();
    if (web.q.length < 2) { toast('Type the dish first'); return; }
    const mine = web; mine.busy = true; mine.err = ''; mine.r = null; mine.n = 1; mine.sel = []; mine.at = 0; webSheet();
    let r = null, err = '';
    try {
      if (window.__orderAi) r = await window.__orderAi(mine.q, mine.where);                                            // tests
      else if (window.__webAi) r = await window.__webAi(mine.q, mine.where);                                           // tests from before 1.25
      else {
        const Cl = window.Cloud;
        if (!Cl || !Cl.configured || !Cl.webLookup) err = "Looking dishes up needs the account's server. Take a photo of it instead.";
        else if (!Cl.signedIn()) err = 'Sign in (Settings → Account) to look dishes up on the web. For now, take a photo of it.';
        else r = Cl.orderLookup ? await Cl.orderLookup(mine.q, mine.where) : await Cl.webLookup(mine.q, mine.where);
      }
    } catch (e) { err = (e && e.status === 404) ? "Looking dishes up isn't switched on for this account's server yet. Take a photo of it instead." : ((e && e.message) || "The web search didn't answer. Try again, or take a photo of it."); }
    if (web !== mine) return;
    mine.busy = false; mine.err = err; mine.r = r; mine.sel = selOf(r);
    // an item opened from a fetched menu is kept with that menu, so the same order next time costs nothing
    if (r && r.found && mine.from === 'menu' && mine.ik && menuKey(mine.q) === mine.ik && menu) {
      const sv = savedMenu(menu.place);
      if (sv) {
        sv.items = sv.items || {}; sv.items[mine.ik] = { at: Date.now(), r };
        const ks = Object.keys(sv.items).sort((a, b) => sv.items[b].at - sv.items[a].at); ks.slice(ITEM_KEEP).forEach(k => delete sv.items[k]);
        S.saveMeta();
      }
    }
    webSheet();
  };
  ACT.kcWebAdd = () => {
    const w = web, r = w && w.r; if (!r || !r.found) return;
    const calc = orderCalc(r, w.sel), opts = calc.names;
    let nm = r.place && !fold(r.name).includes(fold(r.place).split(' ')[0]) ? `${r.name} (${r.place})` : r.name;
    if (opts.length) nm += ' · ' + opts.join(', ');
    const e = { id: S.uid(), t: stampMeal(w.meal), meal: w.meal, name: nm.slice(0, 80),
      kcal: Math.round(calc.kcal * w.n), p: g1(calc.p * w.n), c: g1(calc.c * w.n), f: g1(calc.f * w.n), src: 'web', q: w.n, un: 'serving', per: calc.serving || '1 serving',
      web: { basis: r.basis, est: r.estimated || [], src: (r.sources || []).slice(0, 3).map(x => x.title) } };
    if (opts.length) e.web.opts = opts.slice(0, 12);
    if (calc.est) e.web.ch = 1;
    if (calc.fib != null) e.fib = g1(calc.fib * w.n);
    if (calc.g > 0) e.g = Math.round(calc.g * w.n);
    if (out && out.place) e.at = out.place;
    log(e); if (out && out.place) placeKeep(out.place, e); recount();
    const back = w.from === 'menu' && !!menu;
    web = null; if (back) menuSheet(); else A.closeSheet();
    redraw();
    undoToast(`${e.name} added · ${n0(e.kcal)} kcal`, () => { D.food = D.food.filter(y => y.id !== e.id); S.save(true); redraw(); });
  };

  // ---------------------------------------------------------------- v1.25: a restaurant's menu from the web
  // The first time a restaurant is opened on a day its menu is fetched; opened again that day it is not fetched again; a place
  // that isn't opened is never fetched: only its name is kept, for one tap next time. (The owner, 20 Nov 2026, after 7 days, 2 days
  // and a month: 10:38 "fetch the data everytime the resturant is opened and if not the data is not fetched but only the restaurant
  // name is fetched", 10:57 "if the menu is not opened have the most economical thing and if the menu is opened on the same day no
  // need to refresh it".) Opened again within ten minutes is the same visit even across midnight, and going to an item and back
  // never fetches. settings.menuDays lets the person change it: 0 = once a day, 2, 7, 30 days, -1 = only with Refresh.
  // The last menu fetched stays on this phone (Store.meta, never synced) to show while a new one is on its way or when a fetch
  // fails. Nothing runs in the background.
  const MENU_KEEP = 12, ITEM_KEEP = 40, DAY_MS = 86400000, GRACE_MS = 10 * 60000;
  const MENU_AGES = [[0, 'the first time I open it each day', ''], [2, 'after 2 days', 'two days'], [7, 'after a week', 'a week'], [30, 'after a month', 'a month'], [-1, 'only when I tap Refresh', '']];
  const menuDays = () => { const v = D.settings.menuDays == null ? 0 : +D.settings.menuDays; return MENU_AGES.some(c => c[0] === v) ? v : 0; };
  const MBASIS = { restaurant: 'its own menu', 'delivery app': 'its Swiggy or Zomato listing', 'other site': 'another website' };
  const menus = () => (S.meta.menus && typeof S.meta.menus === 'object' ? S.meta.menus : (S.meta.menus = {}));
  const menuKey = s => fold(s).replace(/[^a-z0-9 ]/g, '').trim();
  const fresh = at => { if (!(at > 0)) return false; const age = Date.now() - at, d = menuDays(); return age < GRACE_MS || d < 0 || (d === 0 && new Date(at).toDateString() === new Date(at + age).toDateString()) || (d > 0 && age < d * DAY_MS); };
  const agoWords = at => { const d = Math.floor((Date.now() - at) / DAY_MS); return d <= 0 ? 'today' : d === 1 ? 'yesterday' : d + ' days ago'; };
  function savedMenu(place) {
    const m = menus(), k = menuKey(place); if (!k) return null;
    if (m[k]) return m[k];
    for (const x of Object.keys(m)) if (m[x].r && menuKey(m[x].r.place) === k) return m[x];
    return null;
  }
  let menu = null;                                            // { place, q, busy, err, r, at, old }
  // v1.27 Best picks on a menu: what fits what is left of today. Each item's own calories (where the menu shows them) against
  // this meal's share of the calories left, worked out as What should I eat now? does; its protein from the closest
  // restaurant food in GymDay's list for those calories (so "about"). The three that fit best, filling the protein still to go,
  // are at the top; every item that fits gets a ✓. Nothing is marked without a daily target.
  function menuFit(r) {
    if (!r || !r.found || !C || !C.dayOf) return null;
    let w; try { w = whatNow(); } catch (e) { return null; }
    if (!w || w.none === 'target') return null;
    if (!(w.leftK > 60)) return { over: true, w, best: [], fit: new Set() };
    const budget = Math.max(150, w.budget || 0), wantP = w.wantP || 0, all = [];
    r.groups.forEach((g, gi) => g.items.forEach((it, ii) => {
      if (!(it.kcal > 0)) return;
      let p = 0; try { const t = lineFood(it.name, 100, { out: true }); if (t && t.v && t.v.kcal > 0) p = Math.round(num(t.v.p) / t.v.kcal * it.kcal); } catch (e) { }
      const fits = it.kcal <= budget * 1.15, close = Math.max(0, 1 - Math.abs(it.kcal - budget) / budget), ps = wantP > 0 ? Math.min(p, wantP) / wantP : Math.min(1, p * 4 / it.kcal / 0.3);
      all.push({ gi, ii, it, p, fits, sc: 0.55 * close + 0.45 * ps });
    }));
    const ok = all.filter(x => x.fits);
    return { w, budget, best: ok.slice().sort((a, b) => b.sc - a.sc).slice(0, 3), fit: new Set(ok.map(x => x.gi + ':' + x.ii)), n: all.length };
  }
  function menuListHtml() {
    const m = menu, r = m && m.r; if (!r || !r.found) return '';
    const q = fold(m.q || ''), hit = s => !q || q.split(' ').every(w => (' ' + fold(s)).includes(' ' + w));
    const fit = q ? null : menuFit(r), mn = fit && fit.w.meal ? MEAL_NAME[fit.w.meal].toLowerCase() : 'now';
    const top = !fit ? '' : fit.over ? `<p class="xs muted mt8" id="kcBest">You are at or over today’s calories, so nothing here is marked as fitting.</p>`
      : !fit.n ? '' : fit.best.length ? `<div class="kc-sec" id="kcBest">Best picks for ${esc(mn)} · about ${n0(fit.budget)} kcal left for it</div>` + fit.best.map(x => `<div class="list-item tap kc-best" data-act="kcMenuItem" data-g="${x.gi}" data-i="${x.ii}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(x.it.name)}</div><div class="xs muted">${n0(x.it.kcal)} kcal${x.p ? ` · about ${n0(x.p)} g protein` : ''}${fit.w.leftP > 0 && x.p ? ` · <span class="green">${Math.min(100, Math.round(x.p / fit.w.leftP * 100))}% of the protein to go</span>` : ''}</div></div><span class="chev">›</span></div>`).join('')
      : `<p class="xs muted mt8" id="kcBest">Nothing with calories on this menu fits the about ${n0(fit.budget)} kcal left for ${esc(mn)}.</p>`;
    const h = r.groups.map((g, gi) => {
      const its = g.items.map((it, ii) => [it, ii]).filter(([it]) => hit(it.name) || hit(g.name));
      return its.length ? `<div class="kc-sec">${esc(g.name)}</div>` + its.map(([it, ii]) => `<div class="list-item tap" data-act="kcMenuItem" data-g="${gi}" data-i="${ii}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${it.veg === true ? '<span class="kc-veg" role="img" aria-label="Vegetarian"></span>' : it.veg === false ? '<span class="kc-veg non" role="img" aria-label="Not vegetarian"></span>' : ''}${esc(it.name)}</div>${it.serving ? `<div class="xs muted ellipsis">${esc(it.serving)}</div>` : ''}</div>${fit && fit.fit.has(gi + ':' + ii) ? '<span class="kc-fit" role="img" aria-label="Fits what is left today">✓</span>' : ''}${it.kcal ? `<span class="xs muted">${n0(it.kcal)} kcal</span>` : ''}<span class="chev">›</span></div>`).join('') : '';
    }).join('');
    return h ? top + h : `<p class="small muted mt12">Nothing on this menu matches “${esc(m.q)}”.</p>`;
  }
  function menuSheet() {
    const m = menu, r = m.r;
    let body = '';
    if (m.busy && !(r && r.found)) body = `<p class="small muted mt12" id="kcMenuBusy"><span class="kc-spin"></span> Finding ${esc(m.place)}'s menu on the web… this can take a minute.</p>`;
    else if (r && r.found) {
      const n = r.groups.reduce((a, g) => a + g.items.length, 0);
      body = `${m.busy ? `<p class="small muted mt12" id="kcMenuBusy"><span class="kc-spin"></span> Getting the menu it serves now… this can take a minute. Meanwhile, here is the one fetched ${agoWords(m.at)}.</p>` : ''}${m.err ? `<p class="small mt12">${esc(m.err)}</p>` : ''}
        <p class="xs muted mt12" id="kcMenuAbout"><b>${esc(r.place || m.place)}</b> · ${n} items${r.as_of ? ' · menu of ' + esc(r.as_of) : ''} · from ${esc(MBASIS[r.basis] || 'the web')} · fetched ${agoWords(m.at)}${m.busy ? '' : ` · <button class="linkish" data-act="kcMenuRefresh">Refresh</button>`}</p>
        <input class="input mt8" id="kcMenuQ" placeholder="Find on this menu" autocomplete="off" enterkeyhint="search" value="${esc(m.q || '')}">
        <div id="kcMenuList" class="kc-list">${menuListHtml()}</div>
        ${r.more ? `<p class="xs dim mt8">The menu is longer than this list. For anything missing, use the row below.</p>` : ''}
        <div class="list-item tap mt8" data-act="kcMenuOther"><span class="sp-ic">🔎</span><div class="grow"><div class="small" style="font-weight:600">Something else from ${esc(r.place || m.place)}</div><div class="xs muted">Type the order in your own words, with its size and changes</div></div><span class="chev">›</span></div>
        ${r.note ? `<p class="xs muted mt8">${esc(r.note)}</p>` : ''}
        ${(r.sources || []).length ? `<div class="xs mt8 kc-web-src">From: ${r.sources.map((x, i) => `<a href="#" data-act="kcMenuLink" data-i="${i}">${esc(x.title)}</a>`).join(' · ')}</div>` : ''}
        <p class="xs dim mt8">Found online by the AI. Menus change, so check against the menu in front of you. Tap an item for its sizes and choices.</p>
        <div class="row mt12" id="kcMenuAge" style="gap:10px;align-items:center"><label class="xs muted grow" for="kcMenuDays">This restaurant’s menu is fetched again</label><select class="input" id="kcMenuDays" data-bind="menuDays" style="width:auto;max-width:56%">${MENU_AGES.map(([v, t]) => `<option value="${v}" ${menuDays() === v ? 'selected' : ''}>${t}</option>`).join('')}</select></div>`;
    } else if (m.err) body = `<p class="small mt12">${esc(m.err)}</p>`;
    else if (r) body = `<p class="small mt12">Couldn't find a menu for ${esc(m.place)} online.</p>${(r.alts || []).length ? `<div class="kc-sec">Did you mean</div><div class="row" style="gap:8px;flex-wrap:wrap">${r.alts.map(a => `<button class="chip" data-act="kcMenuAlt" data-v="${esc(a)}">${esc(a)}</button>`).join('')}</div>` : ''}
        <p class="xs dim mt8">A small local place may have no menu online. Take a photo of your plate instead, or look up one dish.</p>`;
    const kept = Object.values(menus()).filter(x => x && x.r && x.r.found).sort((a, b) => (b.at || 0) - (a.at || 0));
    const keptHtml = !m.busy && !(r && r.found) && kept.length ? `<div class="kc-sec">Restaurants you have looked up</div><div class="kc-opts">${kept.map(x => `<button class="chip" data-act="kcMenuOpen" data-v="${esc(x.typed)}">${esc(x.r.place || x.typed)}<span class="sub">${fresh(x.at) ? 'fetched ' + agoWords(x.at) : 'tap to fetch its menu now'}</span></button>`).join('')}</div>` : '';
    A.openSheet(`<div class="kc-add"><h2 style="margin:0">A menu from the web</h2>
      <label class="lbl mt8">The restaurant, cafe or shop</label><input class="input" id="kcMenuP" maxlength="60" value="${esc(m.place)}" placeholder="e.g. Starbucks, Haldiram's, a cafe near you" autocomplete="off" enterkeyhint="search">
      <button class="btn ${r && r.found ? '' : 'primary'} block mt12" data-act="kcMenuGo" ${m.busy ? 'disabled' : ''}>🌐 Get the menu</button>
      ${!m.busy && !r && !m.err ? `<p class="xs dim mt8">The AI searches the web for the menu this place serves now. ${menuDays() === 0 ? 'It is fetched the first time you open the restaurant each day; open it again that day and it shows at once, at no cost. A place you don’t open is never fetched.' : menuDays() > 0 ? `A menu you have fetched is kept on this phone and fetched again when you open it after ${MENU_AGES.find(c => c[0] === menuDays())[2]}.` : 'A menu you have fetched is kept on this phone and only fetched again when you tap Refresh.'}</p>` : ''}
      ${body}${keptHtml}
      <button class="btn block mt12" data-act="kcMenuBack">‹ Back to eating out</button></div>`,
      s => {
        s.querySelector('.panel').classList.add('kc-tall');
        const i = s.querySelector('#kcMenuQ'), pi = s.querySelector('#kcMenuP'); let tm = 0;
        if (i) i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { if (!menu) return; menu.q = i.value; const l = $('#kcMenuList'); if (l) l.innerHTML = menuListHtml(); }, 120); });
        if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
        if (pi) pi.addEventListener('keydown', e => { if (e.key === 'Enter') { pi.blur(); ACT.kcMenuGo(); } });
      });
  }
  const menuShow = sv => { menu.r = sv.r; menu.at = sv.at; menu.place = sv.typed || menu.place; menu.err = ''; menu.q = ''; };
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset || t.dataset.bind !== 'menuDays') return;
    const v = +t.value; if (!MENU_AGES.some(c => c[0] === v)) return;
    D.settings.menuDays = v; S.save(true); toast(v === 0 ? 'Menus are fetched the first time you open a restaurant each day' : v > 0 ? `Menus are fetched again after ${MENU_AGES.find(c => c[0] === v)[2]}` : 'Menus are only fetched again when you tap Refresh');
  });
  ACT.kcMenu = el => {
    const p = out && out.place ? placeOf(out.place) : null, typed = (el && el.dataset && el.dataset.q) || '';
    menu = { place: typed || (p ? p.name : ''), q: '', r: null, at: 0, err: '' };
    const sv = menu.place ? savedMenu(menu.place) : null;
    if (sv && fresh(sv.at)) { menuShow(sv); menuSheet(); }
    else { menuSheet(); if (typed || sv) setTimeout(() => ACT.kcMenuGo(), 0); }
  };
  ACT.kcMenuBack = () => { menu = null; outSheet(); };
  ACT.kcMenuOpen = el => { if (!menu) return; menu.place = el.dataset.v || ''; const pi = $('#kcMenuP'); if (pi) pi.value = menu.place; ACT.kcMenuGo(); };
  ACT.kcMenuAlt = el => { if (!menu) return; const pi = $('#kcMenuP'); if (pi) pi.value = el.dataset.v || ''; ACT.kcMenuGo(); };
  ACT.kcMenuRefresh = () => ACT.kcMenuGo(null, null, true);
  ACT.kcMenuLink = (el, ev) => { if (ev && ev.preventDefault) ev.preventDefault(); const x = menu && menu.r && (menu.r.sources || [])[+el.dataset.i]; if (x && /^https:\/\//.test(x.uri)) window.open(x.uri, '_blank'); };
  const menuFly = {};                                         // a fetch on its way, by place: opening the place again joins it instead of paying twice
  function menuFetch(place) {
    const k = menuKey(place); if (menuFly[k]) return menuFly[k];
    const run = (async () => {
      let r = null, err = '';
      try {
        if (window.__menuAi) r = await window.__menuAi(place);                                                        // tests
        else {
          const Cl = window.Cloud;
          if (!Cl || !Cl.configured || !Cl.menuLookup) err = "Getting menus needs the account's server. Take a photo of your plate instead.";
          else if (!Cl.signedIn()) err = 'Sign in (Settings → Account) to get menus from the web.';
          else r = await Cl.menuLookup(place, '');
        }
      } catch (e) { err = (e && e.status === 404) ? "Getting menus isn't switched on for this account's server yet." : ((e && e.message) || "The web search didn't answer. Try again in a minute."); }
      let keep = null;
      if (r && r.found) {
        // kept even when the sheet was left meanwhile (it was paid for); the same place fetched again keeps the items opened from it
        const m = menus(), old = savedMenu(place);
        keep = { typed: place, at: Date.now(), r: { found: true, place: r.place || '', as_of: r.as_of || '', basis: r.basis || '', more: !!r.more, groups: r.groups || [], note: r.note || '', sources: (r.sources || []).slice(0, 5) }, items: (old && old.items) || {} };
        for (const x of Object.keys(m)) if (m[x] === old) delete m[x];
        m[k] = keep;
        Object.keys(m).sort((a, b) => (m[b].at || 0) - (m[a].at || 0)).slice(MENU_KEEP).forEach(x => delete m[x]);
        S.saveMeta();
      }
      return { r, err, keep };
    })();
    menuFly[k] = run; run.then(() => { delete menuFly[k]; }, () => { delete menuFly[k]; });
    return run;
  }
  ACT.kcMenuGo = async (_el, _ev, force) => {
    if (!menu || menu.busy) return;
    const pi = $('#kcMenuP'); if (pi) menu.place = String(pi.value || '').trim();
    if (menu.place.length < 2) { toast('Type the name of the place first'); return; }
    const mine = menu, sv = savedMenu(mine.place);
    if (sv && fresh(sv.at) && force !== true) { menuShow(sv); menuSheet(); return; }
    mine.busy = true; mine.err = '';
    if (sv && sv.r && sv.r.found) menuShow(sv); else mine.r = null;          // the last menu fetched shows while the new one is on its way
    menuSheet();
    const { r, err, keep } = await menuFetch(mine.place);
    if (menu !== mine) return;                                  // the sheet was left: what came is kept for next time, nothing is drawn
    mine.busy = false;
    const q0 = mine.q, typing = !!document.activeElement && document.activeElement.id === 'kcMenuQ';
    if (keep) { menuShow(keep); mine.q = q0; }
    else if (sv && sv.r && sv.r.found) { menuShow(sv); mine.q = q0; mine.err = (err || "Couldn't find a newer menu just now.") + ` Showing the menu fetched ${agoWords(sv.at)}.`; }      // better than nothing
    else { mine.err = err; mine.r = r; }
    if (web) return;                                            // an item is open: the menu is drawn when the person comes back to it
    menuSheet();
    if (typing) { const i = $('#kcMenuQ'); if (i) { i.focus(); try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* not a text box */ } } }
  };
  ACT.kcMenuItem = el => {
    const r = menu && menu.r, g = r && r.groups[+el.dataset.g], it = g && g.items[+el.dataset.i]; if (!it) return;
    const sv = savedMenu(menu.place), ik = menuKey(it.name), c = sv && sv.items && sv.items[ik];
    web = { q: it.name, where: r.place || menu.place, meal: out ? out.meal : mealNow(), n: 1, r: null, sel: [], from: 'menu', ik };
    if (c && c.r && c.r.found && fresh(c.at)) { web.r = c.r; web.sel = selOf(c.r); web.at = c.at; webSheet(); }
    else { webSheet(); setTimeout(() => ACT.kcWebGo(), 0); }
  };
  ACT.kcMenuOther = () => { if (!menu) return; web = { q: '', where: (menu.r && menu.r.place) || menu.place, meal: out ? out.meal : mealNow(), n: 1, r: null, sel: [], from: 'menu' }; webSheet(); };
  ACT.kcOutPhoto = () => { const o = { out: true, place: out ? out.place : '', meal: out ? out.meal : '' }; A.closeSheet(); if (ACT.kcPhoto) ACT.kcPhoto(null, null, o); };

  // =====================================================================================================
  // v1.11: counting pieces. A curry is pieces + gravy, counted apart: the pieces as the cooked meat, fish, egg or paneer, and
  // the gravy as what is left of the dish's numbers once a usual share of pieces is taken out (a chicken curry is about 40%
  // chicken by weight). Fried and grilled dishes are pieces only; a biryani is its rice plus the pieces on top.
  // Sizes are the part eaten (no bone): small / medium / large, bone-in or boneless.
  // =====================================================================================================
  const PC_MEAT = { chicken: 'g97716cd13', mutton: 'g1be1d9a41', fish: 'gaa55b8e05', prawn: 'g83bcf5ec7', egg: 'u2707154', paneer: 'k12-495' };
  const PC_SHARE = { chicken: 0.4, mutton: 0.4, fish: 0.4, prawn: 0.35, egg: 0.35, paneer: 0.3 };
  const PC_SIZE = {
    chicken: { bone: [30, 45, 65], boneless: [15, 25, 40] }, mutton: { bone: [20, 35, 50], boneless: [15, 25, 40] },
    fish: { bone: [40, 60, 90], boneless: [25, 40, 60] }, prawn: { each: [5, 10, 20] }, egg: { each: [40, 50, 60] }, paneer: { each: [10, 15, 25] } };
  const PC_WHAT = { chicken: ['piece', 'pieces'], mutton: ['piece', 'pieces'], fish: ['piece', 'pieces'], prawn: ['prawn', 'prawns'], egg: ['egg', 'eggs'], paneer: ['paneer cube', 'paneer cubes'] };
  const PC_WORD = [['prawn', /\b(prawns?|shrimps?|jhinga|eral|chemmeen|kolambi|royyala)\b/], ['egg', /\b(egg|eggs|anda|mutta|motte)\b/], ['paneer', /\b(paneer|cottage cheese)\b/],
    ['chicken', /\b(chicken|murgh|murg|kozhi|koli)\b/], ['mutton', /\b(mutton|lamb|goat|gosht|mangsho)\b/],
    ['fish', /\b(fish|meen|machli|macher|rohu|rui|seer|surmai|vanjaram|pomfret|bangda|ayala|mackerel|sardines?|mathi|katla|catla|hilsa|ilish|basa|tilapia|tuna|salmon|bhetki|kingfish|neymeen|karimeen|pangasius|rawas|sankara|kalava)\b/]];
  const PC_NOT = /\b(keema|kheema|mince|minced|soup|sandwich|burger|pizza|rolls?|wraps?|kathi|salad|noodles?|fried rice|pasta|momos?|dumplings?|samosa|puffs?|pie|pickle|achar|powder|paste|raw|dried|sauce|stock|broth|frankie|paratha|parantha|dosa|uttapam|omelet|omelette|scrambled|bhurji|cakes?|pudding|halwa|kheer|chilla|cheela|patties|sandwiches|curry cut|cooked \(|spread|frozen|canned|breaded|nuggets?|fingers?|sausages?|salami|ham|bacon|biscuits?|or turkey|excluding|separable|trimmed|weighed with|giblets|broilers or fryers|with rice|rice with|and rice|nuggets?|potato|potatoes|chips|stir fry|stir-fry)\b/;
  const PC_BIRYANI = /\b(biryani|biriyani|biriani|pulao|pulav|tehri)\b/;
  const PC_CURRY = /\b(curry|curried|gravy|masala|korma|kurma|qorma|makhani|butter|kadai|kadhai|karahi|handi|rogan|vindaloo|stew|pyaza|saag|saagwala|palak|xacuti|chettinad|salan|jalfrezi|bhuna|kosha|kalia|jhol|moilee|molee|pulusu|kuzhambu|kulambu|varutha|lababdar|pasanda|shahi|matar|mughlai|nihari|rezala|kolhapuri|malvani|goan|kerala|dum|mappas|peri peri curry)\b/;
  const PC_DRY = /\b(tandoori|tikka|kebabs?|kababs?|kabobs?|seekh|shami|galouti|reshmi|malai|tangdi|lollipops?|wings?|drumsticks?|65|fry|fried|pakoras?|pakodas?|grilled|barbecued?|bbq|chilli|chili|manchurian|popcorn|strips?|tenders?|cutlets?|chops?|sukka|roast|roasted|pepper|tawa|rava|amritsari|broast)\b/;
  const PC_BONELESS = /\b(butter chicken|makhani|tikka|malai|reshmi|chilli|chili|manchurian|65|popcorn|strips?|boneless|kebabs?|kababs?|seekh|shami|galouti|lababdar|kadai|kadhai|jalfrezi|fillets?)\b/;
  const pcCache = new Map();
  // null, or { kind, mode: 'curry' | 'dry' | 'biryani', sizes: { bone, boneless } | { each }, meat (per 100 g), rest (gravy or rice, per 100 g) }
  function pieceOf(food) {
    if (!food || food.kind !== 'db' || !DB) return null;
    if (pcCache.has(food.fid)) return pcCache.get(food.fid);
    const x = DB.byId.get(food.fid), nm = ' ' + fold(food.name) + ' ';
    let r = null;
    if (x && x.src !== 2 && x.src !== 8 && x.src !== 9 && !PC_NOT.test(nm)) {          // dishes, not SR Legacy's cuts, packs or menus
      const kind = (PC_WORD.find(([, rx]) => rx.test(nm)) || [])[0];
      const mode = !kind ? '' : PC_BIRYANI.test(nm) ? 'biryani' : PC_CURRY.test(nm) ? 'curry' : PC_DRY.test(nm) && kind !== 'egg' ? 'dry' : '';
      if (mode) r = pcBuild(food, kind, mode, nm);
    }
    pcCache.set(food.fid, r); return r;
  }
  function pcBuild(food, kind, mode, nm) {
    const sizes = mode === 'dry' ? dryPieceSizes(kind, nm) : PC_SIZE[kind];
    const r = { kind, mode, sizes, bone: !!sizes.bone, boneless: !!sizes.boneless, defBone: sizes.bone && !(sizes.boneless && PC_BONELESS.test(nm)) ? 1 : 0 };
    if (mode === 'dry') { r.meat = food.base; return r; }
    const m0 = DB.byId.get(PC_MEAT[kind]); if (!m0) return null;
    const meat = { kcal: m0.kcal, p: m0.p, c: m0.c, f: m0.f, fib: m0.fib, cr: 0 }, d = food.base;
    // the usual share of pieces, made smaller when this dish's own numbers can't hold that much meat (a thin, light curry)
    let m = mode === 'biryani' ? 0.22 : PC_SHARE[kind];
    for (const k of ['p', 'kcal']) if (meat[k] > 0) m = Math.min(m, 0.9 * (d[k] || 0) / meat[k]);
    m = Math.max(0, m);
    const rest = {}; for (const k of NUT) rest[k] = Math.max(0, ((d[k] || 0) - m * (meat[k] || 0)) / (1 - m));
    r.meat = meat; r.rest = rest; r.share = m; r.meatName = m0.name;
    return r;
  }
  function dryPieceSizes(kind, nm) {
    if (kind === 'paneer') return { each: [15, 25, 35] };
    if (kind === 'prawn') return PC_SIZE.prawn;
    if (/\b(wings?|lollipops?)\b/.test(nm)) return { bone: [20, 30, 40] };
    if (/\b(kebabs?|kababs?|kabobs?|seekh|shami|galouti|cutlets?|chops?)\b/.test(nm)) return { each: [30, 45, 60] };
    if (kind === 'fish') return { bone: [40, 60, 90], boneless: [30, 45, 70] };
    if (/\b(tandoori|tangdi|drumsticks?|roast|roasted|broast|fried chicken|chicken fry|leg)\b/.test(nm) && !/\btikka\b/.test(nm)) return { bone: [60, 90, 130], boneless: [25, 35, 50] };
    if (kind === 'mutton') return { bone: [20, 35, 50], boneless: [15, 25, 40] };
    return { each: [15, 25, 35] };                     // tikka, 65, chilli, manchurian, malai: bite-size boneless pieces
  }
  const PC_SZN = ['small', 'medium', 'large'];
  const pcGrams = (pi, pc) => { const z = pi.sizes.each || (pc.b && pi.sizes.bone ? pi.sizes.bone : pi.sizes.boneless || pi.sizes.bone); return z[Math.max(0, Math.min(2, pc.s))]; };
  const PC_KATORI = 150, PC_RICE = { k: 100, p: 250 };          // a katori of gravy; biryani rice by the katori and by the plate
  const pcRestG = (pi, pc) => (pi.mode === 'biryani' ? (pc.rp ? PC_RICE.p : PC_RICE.k) * (pc.gv || 0) : pi.mode === 'curry' ? PC_KATORI * (pc.gv || 0) : 0);
  function pcVals(pi, pc) {
    const pg = (pc.n || 0) * pcGrams(pi, pc), rg = pcRestG(pi, pc), a = times(pi.meat, pg / 100), b = pi.rest ? times(pi.rest, rg / 100) : times(pi.meat, 0);
    const o = {}; for (const k of NUT) o[k] = (a[k] || 0) + (b[k] || 0);
    o.g = pg + rg; return o;
  }
  function pcText(pi, pc) {
    const w = PC_WHAT[pi.kind] || ['piece', 'pieces'], n = pc.n || 0;
    const what = pi.mode === 'dry' && (pi.kind === 'chicken' || pi.kind === 'mutton' || pi.kind === 'fish') ? ['piece', 'pieces'] : w;
    const sz = [PC_SZN[pc.s] || 'medium', pi.bone && pi.boneless ? (pc.b ? 'bone-in' : 'boneless') : pi.bone ? 'bone-in' : ''].filter(Boolean).join(', ');
    const pcs = n > 0 ? `${fmtQ(n)} ${n === 1 ? what[0] : what[1]} (${sz})` : '';
    const rest = pi.mode === 'curry' && pc.gv > 0 ? `${fmtQ(pc.gv)} katori gravy` : pi.mode === 'biryani' && pc.gv > 0 ? `${fmtQ(pc.gv)} ${pc.rp ? (pc.gv > 1 ? 'plates' : 'plate') : 'katori'} rice` : '';
    return pi.mode === 'biryani' ? [rest, pcs].filter(Boolean).join(' + ') : [pcs, rest].filter(Boolean).join(' + ') || 'nothing yet';
  }
  function pcDefault(pi) {
    return { on: true, n: pi.kind === 'paneer' ? 6 : pi.kind === 'prawn' ? 6 : 2, s: 1, b: pi.defBone, gv: pi.mode === 'curry' ? 0.5 : pi.mode === 'biryani' ? 1 : 0, rp: pi.mode === 'biryani' ? 1 : 0 };
  }
  function pcHtml(pi, pc) {
    const w = PC_WHAT[pi.kind] || ['piece', 'pieces'], z = n => g1(pcGrams(pi, Object.assign({}, pc, { s: n })));
    const gvs = pi.mode === 'curry' ? [0, 0.25, 0.5, 0.75, 1, 1.5, 2] : [0, 0.5, 1, 1.5, 2];
    return `<div id="kcPc">
      <label class="lbl mt12">${pi.mode === 'dry' ? 'How many pieces' : `How many ${esc(pi.mode === 'dry' ? 'pieces' : w[1])}`}</label>
      <div class="kc-qty"><button class="btn" data-act="kcPcLess" aria-label="One fewer">−</button><input class="input kc-qin" id="kcPcN" type="text" inputmode="decimal" value="${g1n(pc.n)}" aria-label="Pieces"><button class="btn" data-act="kcPcMore" aria-label="One more">+</button></div>
      <label class="lbl mt12">Size of a piece <span class="xs dim">(the part eaten)</span></label>
      <div class="kc-fr" id="kcPcS">${PC_SZN.map((nm, i) => `<button class="chip ${pc.s === i ? 'on' : ''}" data-act="kcPcSize" data-v="${i}">${nm[0].toUpperCase() + nm.slice(1)} <span class="dim">${z(i)} g</span></button>`).join('')}</div>
      ${pi.bone && pi.boneless ? `<div class="kc-fr mt8" id="kcPcB"><button class="chip ${pc.b ? 'on' : ''}" data-act="kcPcBone" data-v="1">Bone-in</button><button class="chip ${!pc.b ? 'on' : ''}" data-act="kcPcBone" data-v="0">Boneless</button></div>` : ''}
      ${pi.mode === 'dry' ? '' : `<label class="lbl mt12">${pi.mode === 'curry' ? 'Gravy <span class="xs dim">(katori, 150 g)</span>' : 'Rice'}</label>
      ${pi.mode === 'biryani' ? `<div class="kc-fr" id="kcPcR"><button class="chip ${!pc.rp ? 'on' : ''}" data-act="kcPcRice" data-v="0">Katori <span class="dim">${PC_RICE.k} g</span></button><button class="chip ${pc.rp ? 'on' : ''}" data-act="kcPcRice" data-v="1">Plate <span class="dim">${PC_RICE.p} g</span></button></div>` : ''}
      <div class="kc-fr mt8" id="kcPcG">${gvs.map(x => `<button class="chip ${Math.abs((pc.gv || 0) - x) < 0.001 ? 'on' : ''}" data-act="kcPcGv" data-v="${x}">${x ? fmtQ(x) : 'None'}</button>`).join('')}</div>`}
      <p class="xs dim mt8">${pi.mode === 'dry' ? `Each piece counts as ${esc(food0name(pi))}.` : `Pieces count as ${esc(String(pi.meatName || '').toLowerCase())}; the ${pi.mode === 'curry' ? 'gravy' : 'rice'} is the rest of the dish (worked out with ${Math.round(pi.share * 100)}% of it as pieces).`}</p>
    </div>`;
  }
  const food0name = () => (pk && pk.food ? pk.food.name.toLowerCase() : 'the dish');
  function pcPaint() {
    if (!pk || !pk.pc || !pk.pi) return;
    const pc = pk.pc, ni = $('#kcPcN'); if (ni && document.activeElement !== ni) ni.value = g1n(pc.n);
    document.querySelectorAll('#kcPcS .chip').forEach(c => c.classList.toggle('on', +c.dataset.v === pc.s));
    document.querySelectorAll('#kcPcB .chip').forEach(c => c.classList.toggle('on', +c.dataset.v === (pc.b ? 1 : 0)));
    document.querySelectorAll('#kcPcR .chip').forEach(c => c.classList.toggle('on', +c.dataset.v === (pc.rp ? 1 : 0)));
    document.querySelectorAll('#kcPcG .chip').forEach(c => c.classList.toggle('on', Math.abs(+c.dataset.v - (pc.gv || 0)) < 0.001));
    document.querySelectorAll('#kcPcS .chip .dim').forEach((d, i) => { d.textContent = g1(pcGrams(pk.pi, Object.assign({}, pc, { s: i }))) + ' g'; });
  }
  // an entry made by pieces: the food's id, the pieces and gravy kept (pc), so changing it opens the same way
  function pieceEntry(food, pi, pc, meal, t) {
    const v = pcVals(pi, pc);
    const e = { id: S.uid(), t: t || stampMeal(meal), meal, name: String(food.name || 'Food').slice(0, 80), kcal: Math.max(0, Math.round(v.kcal)) };
    for (const k of ['p', 'c', 'f', 'fib', 'cr']) { const x = r1(v[k]); if (x > 0) e[k] = x; }
    e.fid = food.fid; e.q = pc.n; e.un = 'pieces'; e.g = Math.round(v.g * 10) / 10; e.per = pcText(pi, pc);
    e.pc = { n: pc.n, s: pc.s, b: pc.b ? 1 : 0, gv: pc.gv || 0, rp: pc.rp ? 1 : 0 }; e.src = 'list';
    return e;
  }

  // ---------------------------------------------------------------- how much of it
  let pk = null;           // { food, q, ui, meal, editId, back: 'add' | 'recipe', pi (pieces: what they are), pc (pieces: how many) }
  function pkVals() { if (pk.pc && pk.pc.on && pk.pi) return pcVals(pk.pi, pk.pc); const u = pk.food.units[pk.ui]; return times(pk.food.base, u.f * pk.q); }
  function pkPaint() {
    const v = pkVals(), u = pk.food.units[pk.ui], set = (id, x) => { const e = $('#' + id); if (e) e.textContent = x; };
    set('kcTot', n0(v.kcal)); set('kcN', pk.pc && pk.pc.on && pk.pi ? pcText(pk.pi, pk.pc) + (v.g > 0 ? ` · ${g1(v.g)} g` : '') : amountText(pk.q, u));
    pcPaint();
    MAC.forEach(([k]) => set('kcV' + k, g1(v[k])));
    const cr = $('#kcVcr'); if (cr) cr.textContent = g1(v.cr);
    const qi = $('#kcQty'); if (qi && document.activeElement !== qi) qi.value = g1n(pk.q);
    const fr = $('#kcFr'); if (fr && NW()) { const sig = quickQs(u).join(','); if (fr.dataset.sig !== sig) { fr.dataset.sig = sig; fr.innerHTML = frChips(u); } }
    document.querySelectorAll('#kcUnits .chip').forEach((c, i) => c.classList.toggle('on', (c.dataset.i != null ? +c.dataset.i : i) === pk.ui));
    document.querySelectorAll('#kcFr .chip').forEach(c => c.classList.toggle('on', Math.abs(+c.dataset.v - pk.q) < 0.001));
    const P = packInfo(pk.food);
    if (P) {
      document.querySelectorAll('.kc-pkb').forEach(b => { const on = b.dataset.w === 's' ? pk.ui === P.si : P.pi >= 0 && pk.ui === P.pi; b.classList.toggle('on', on); b.setAttribute('aria-pressed', String(on)); });
      const l = $('#kcPkLine'); if (l) l.innerHTML = packLine();
    }
  }
  const g1n = q => String(Math.round(q * 100) / 100);
  // 1.35.2 (59): the quick amounts under the box fit the measure: rotis and eggs 1 to 4, almonds 5 to 30, katoris ½ to 3, grams 50 to 250
  function quickQs(u) {
    if (!NW() || !u) return [0.25, 0.5, 0.75, 1, 1.5, 2, 3];
    if (u.gram) return [50, 100, 150, 200, 250];
    if (u.ml) return [100, 150, 200, 250, 300];
    if (u.label === 'oz' || /^1 (fl )?oz\b/i.test(u.label)) return [1, 2, 3, 4, 6];
    if (/^1 (tbsp|tablespoons?|tsp|teaspoons?)\b/i.test(u.label)) return [0.5, 1, 2, 3, 4];
    if (u.g > 0 && u.g < 3) return [5, 10, 15, 20, 30];
    if (/^1 (cups?|katoris?|bowls?|glass|plates?|mugs?|tumblers?|ladles?|servings?|scoops?|cans?|bottles?|pack)\b/i.test(u.label) || u.g >= 150) return [0.5, 1, 1.5, 2, 3];
    return [0.5, 1, 2, 3, 4];
  }
  const frChips = u => quickQs(u).map(x => `<button class="chip" data-act="kcFrac" data-v="${x}">${NW() && u && u.gram ? x + ' g' : NW() && u && u.ml ? x + ' ml' : fmtQ(x)}</button>`).join('');
  // "1/2", "1 1/2", "½", "1½" as a number
  const fracOf = v => { const t = String(v == null ? '' : v).trim(); let m = /^(\d+)\s+(\d+)\s*\/\s*(\d+)$/.exec(t); if (m) return +m[1] + +m[2] / Math.max(1, +m[3]); m = /^(\d+)\s*\/\s*(\d+)$/.exec(t); if (m) return +m[1] / Math.max(1, +m[2]);
    m = /^(\d+(?:[.,]\d+)?)?\s*([½¼¾])$/.exec(t); if (m) return (m[1] ? num(m[1]) : 0) + QF[m[2]]; return num(t); };
  // measures nobody in India counts with (USDA's "Guideline amount per fl oz of beverage", a Keurig cup), and a second "oz"
  const JUNK_U = /^(guideline amount|1 100 calorie|1 keurig|1 microwave cup|1 fast food order|1 small pot|1 large pot|1 single serving container)/i;
  function unitsShown(f) {
    const all = f.units.map((u, i) => i); if (!NW()) return all;
    const ownOz = f.units.some(u => /^1 oz\b/i.test(u.label)), many = f.units.filter(u => !u.gram && !u.ml && u.label !== 'oz').length >= 2;
    return all.filter(i => { const u = f.units[i]; if (pk && i === pk.ui) return true; if (u.label === 'oz') return !(ownOz || many); return !JUNK_U.test(u.label); });
  }
  const stepOf = u => (u.gram || u.ml ? 10 : u.label === 'oz' ? 0.5 : 0.5);
  // v1.12: where a food's numbers come from, as a small coloured badge (Help explains them)
  const BADGE = { 0: ['Food table', 'b-table'], 1: ['Food table', 'b-table'], 2: ['Food table', 'b-table'], 3: ['Food table', 'b-table'], 4: ['Food table', 'b-table'], 5: ['Food table', 'b-table'],
    6: ['Worked out by GymDay', 'b-est'], 7: ['Checked label', 'b-label'], 8: ['Packet, typed in by shoppers', 'b-shop'], 9: ["Chain's own numbers", 'b-label'], 10: ["Chain's own numbers", 'b-label'],
    11: ['Calories from the chain, the rest estimated', 'b-est'], 12: ['Estimate from a nutrition database', 'b-est'], 13: ['Indian food table (ICMR-NIN)', 'b-table'] };
  const KINDB = { my: ['Your food', 'b-shop'], recipe: ['Your recipe', 'b-shop'], supp: ['Your supplement', 'b-label'], off: ['Packet, typed in by shoppers', 'b-shop'] };
  const ENTRYB = { ai: ['AI estimate from a photo', 'b-est'], photo: ['AI estimate from a photo', 'b-est'], web: ['Found online', 'b-est'], typed: ['Typed by you', 'b-shop'], scan: ['Packet, typed in by shoppers', 'b-shop'] };
  function badgeOf(f) {
    if (f.kind === 'db' && BADGE[f.src]) return BADGE[f.src];
    if (KINDB[f.kind]) return KINDB[f.kind];
    if (f.kind === 'again' && f.from) return ENTRYB[f.from.src] || ['As logged before', 'b-shop'];
    return null;
  }
  const badge = f => { const b = badgeOf(f); return b ? `<span class="kc-badge ${b[1]}">${esc(b[0])}</span>` : ''; };
  // =====================================================================================================
  // 1.21.1: a packet's label gives its numbers per serving, so a packaged food asks plainly: one serving, or the whole packet?
  // Two big choices on the amount screen and a line saying exactly what is being added. When the label doesn't say how big the
  // packet is, Whole packet asks once for the weight printed on it and keeps it for that food (settings.packG). The screen starts
  // on what was logged last time for that food (the first time, per serving). Packaged foods: the Open Food Facts packs in the
  // list, products found online or by barcode, and scanned products kept in My foods.
  // =====================================================================================================
  const packG = () => (st().packG && typeof st().packG === 'object' ? st().packG : (st().packG = {}));
  const isPack = u => !!u && /^1 pack\b/.test(u.label);
  function qtyG(s) {          // "200 g", "1 kg", "6 x 25 g", "500 ml" → grams (ml as grams); 0 when unclear
    const t = String(s || '').toLowerCase().replace(/(\d),(\d)/g, '$1.$2'), k = u => (/^k/.test(u) || /^l/.test(u) ? 1000 : /^cl/.test(u) ? 10 : 1);
    let m = t.match(/(\d+(?:\.\d+)?)\s*[x×*]\s*(\d+(?:\.\d+)?)\s*(kg|gm|gr|g|ml|cl|ltr|litres?|liters?|l)\b/);
    let g = m ? +m[1] * +m[2] * k(m[3]) : 0;
    if (!g) { m = t.match(/(\d+(?:\.\d+)?)\s*(kg|gm|grams?|gr|g|ml|cl|ltr|litres?|liters?|l)\b/); g = m ? +m[1] * k(m[2]) : 0; }
    return g >= 1 && g <= 10000 ? Math.round(g * 10) / 10 : 0;
  }
  function packInfo(f) {
    if (!f || !(f.kind === 'off' || (f.kind === 'db' && f.src === 8) || (f.kind === 'my' && f.code))) return null;
    return { si: f.units.findIndex(u => !u.gram && !u.ml && u.label !== 'oz' && !isPack(u)), pi: f.units.findIndex(isPack), gi: f.units.findIndex(u => u.gram) };
  }
  function addPack(f, g) {          // a remembered or typed packet size becomes a unit, after the serving
    const P = packInfo(f); if (!P || P.pi >= 0 || P.gi < 0 || !(g > 0)) return false;
    f.units.splice(P.si >= 0 ? P.si + 1 : 0, 0, { label: '1 pack', g, f: f.units[P.gi].f * g });
    return true;
  }
  const wtOf = u => { const m = u.label.match(/\(([\d.,]+\s*(?:g|ml|l|kg))\)/i); return m ? m[1] : `${g1(u.g)} g`; };
  function packLine() {
    const P = packInfo(pk.food); if (!P) return '';
    const U = pk.food.units, u = U[pk.ui], sv = P.si >= 0 ? U[P.si] : null, pu = P.pi >= 0 ? U[P.pi] : null, q = pk.q;
    if (u === sv) {
      const tot = sv.g * q, whole = pu && Math.abs(tot - pu.g) <= pu.g * 0.03;
      return `You're adding <b>${esc(amountText(q, sv))}</b>${whole ? ', about the whole packet.' : pu && tot < pu.g ? `, not the whole packet (${esc(wtOf(pu))}).` : !pu && q === 1 ? ', not the whole packet.' : '.'}`;
    }
    if (u === pu) return `You're adding <b>${q === 1 ? `the whole packet (${esc(wtOf(pu))})` : esc(amountText(q, pu))}</b>${sv && sv.g > 0 && q === 1 && pu.g / sv.g >= 1.5 ? `, about ${fmtQ(Math.round(pu.g / sv.g * 2) / 2)} servings.` : '.'}`;
    return `You're adding <b>${esc(amountText(q, u))}</b>.`;
  }
  function packHtml() {
    const P = packInfo(pk.food); if (!P) return '';
    const U = pk.food.units, sv = P.si >= 0 ? U[P.si] : null, pu = P.pi >= 0 ? U[P.pi] : null;
    const btn = (w, on, top, sub) => `<button class="kc-pkb${on ? ' on' : ''}" data-act="kcPkWay" data-w="${w}" aria-pressed="${on}"><b>${top}</b><span>${esc(sub)}</span></button>`;
    return `<div class="kc-pk" role="group" aria-label="One serving or the whole packet">${sv ? btn('s', pk.ui === P.si, 'Per serving', sv.label === '1 serving' || /^serving\b/.test(sv.label) ? wtOf(sv) : `${unitText(sv)} · ${g1(sv.g)} g`) : ''}${btn('p', !!pu && pk.ui === P.pi, 'Whole packet', pu ? wtOf(pu) : 'Add its weight')}</div>
      <div id="kcPkAsk"></div><p class="kc-pkline" id="kcPkLine" aria-live="polite">${packLine()}</p>`;
  }
  ACT.kcPkWay = el => {
    if (!pk) return; const P = packInfo(pk.food); if (!P) return;
    if (el.dataset.w === 's') { if (P.si >= 0) { pk.ui = P.si; pk.q = 1; pkPaint(); } return; }
    if (P.pi >= 0) { pk.ui = P.pi; pk.q = 1; pkPaint(); return; }
    if (P.gi < 0) { toast("This food has no weight to work from: use Per serving"); return; }
    const box = $('#kcPkAsk'); if (!box) return;
    box.innerHTML = `<div class="kc-pkask"><label class="lbl" for="kcPkG">Weight of the whole packet, from its label</label><div class="row"><input class="input" id="kcPkG" type="text" inputmode="decimal" placeholder="for example 200" aria-label="Weight of the whole packet in grams"><span class="muted">g</span><button class="btn primary" data-act="kcPkSet">Use</button></div></div>`;
    const i = $('#kcPkG'); if (i) { i.addEventListener('keydown', e => { if (e.key === 'Enter') { e.preventDefault(); ACT.kcPkSet(); } }); setTimeout(() => i.focus(), 30); }
  };
  ACT.kcPkSet = () => {
    if (!pk) return; const i = $('#kcPkG'), g = Math.round(num(i && i.value) * 10) / 10;
    if (!(g >= 1 && g <= 10000)) { toast('Type the weight printed on the packet, in grams'); return; }
    if (pk.food.fid) { packG()[pk.food.fid] = g; S.save(true); }
    if (!addPack(pk.food, g)) return;
    const P = packInfo(pk.food); pk.ui = P.pi; pk.q = 1; pickSheet();
  };
  function pickSheet() {
    const f = pk.food, fav = favs().includes(key(f)), v = pkVals(), u = f.units[pk.ui];
    const per = f.per100 ? `<p class="xs dim mt8">Per 100 ${f.src === 7 && /^Label per 100 ml:/.test(f.note || '') ? 'ml' : 'g'}: ${n0(f.base.kcal)} kcal · protein ${g1(f.base.p)} g · carbs ${g1(f.base.c)} g · fat ${g1(f.base.f)} g · fibre ${g1(f.base.fib)} g</p>` : '';
    A.openSheet(`<div class="row"><h2 class="grow${String(f.name || '').length > 60 ? ' h2-long' : ''}" style="margin:0">${esc(f.name)}</h2>${f.kind !== 'again' ? `<button class="ib kc-fav ${fav ? 'on' : ''}" data-act="kcFav" aria-label="${fav ? 'Remove from favourites' : 'Keep as a favourite'}" aria-pressed="${fav}">${fav ? '★' : '☆'}</button>` : ''}</div>
      <p class="xs muted">${badge(f)} ${f.sub ? esc(f.sub) : ''}</p>${f.note ? (f.note.length > 90 && window.__calm !== false ? `<details class="kc-notex"><summary class="xs dim">ⓘ How these numbers were worked out</summary><p class="xs dim kc-note">${esc(f.note)}</p></details>` : `<p class="xs dim kc-note">${esc(f.note)}</p>`) : ''}
      <div class="kc-big"><div><span id="kcTot" class="kc-kcal">${n0(v.kcal)}</span> kcal</div><div class="xs muted" id="kcN">${esc(amountText(pk.q, u))}</div></div>
      <div class="kc-mrow">${MAC.map(([k, nm]) => `<div><b id="kcV${k}">${g1(v[k])}</b><span class="xs muted">${nm} g</span></div>`).join('')}${f.base.cr > 0 ? `<div><b id="kcVcr">${g1(v.cr)}</b><span class="xs muted">Creatine g</span></div>` : ''}</div>
      ${pk.pi ? `<div class="kc-fr mt12" id="kcPcM" role="group" aria-label="Count by"><button class="chip ${pk.pc && pk.pc.on ? 'on' : ''}" data-act="kcPcMode" data-v="1">By pieces</button><button class="chip ${!(pk.pc && pk.pc.on) ? 'on' : ''}" data-act="kcPcMode" data-v="0">By amount</button></div>` : ''}
      ${packHtml()}
      ${pk.pi && pk.pc && pk.pc.on ? pcHtml(pk.pi, pk.pc) : `<label class="lbl mt12">How much</label>
      <div class="kc-qty"><button class="btn" data-act="kcLess" aria-label="Less">−</button><input class="input kc-qin" id="kcQty" type="text" inputmode="decimal" value="${g1n(pk.q)}" aria-label="Amount"><button class="btn" data-act="kcMore" aria-label="More">+</button></div>
      <div class="kc-fr" id="kcFr" data-sig="${quickQs(u).join(',')}">${frChips(u)}</div>
      <div class="row mt12"><label class="lbl grow" style="margin:0">Measured in</label>${f.units.some(x => x.gram) ? `<button class="chip ${st().gramsFirst ? 'on' : ''}" data-act="kcGramsFirst" aria-pressed="${st().gramsFirst ? 'true' : 'false'}" title="New foods start in grams, for weighing on a kitchen scale">⚖ Weigh in grams</button>` : ''}</div>
      <div class="kc-units" id="kcUnits">${unitsShown(f).map(i => { const x = f.units[i]; return `<button class="chip ${i === pk.ui ? 'on' : ''}" data-act="kcUnit" data-i="${i}">${esc(NW() ? unitText(x).replace(/\s*\((?:about\s+)?[\d.,]+\s*g\)$/i, '') : unitText(x))}${x.g > 0 && !x.gram && !x.ml && x.label !== 'oz' && !/\(\d+(\.\d+)? ?ml\)$/.test(x.label) ? ` <span class="dim">${g1(x.g)} g</span>` : ''}</button>`; }).join('')}</div>${mineLine(f)}`}
      ${pk.back === 'recipe' ? '' : `<label class="lbl mt12">Meal</label><div class="kc-meals">${MEALS.map(([k, nm]) => `<button class="chip ${pk.meal === k ? 'on' : ''}" data-act="kcPkMeal" data-v="${k}">${nm}</button>`).join('')}</div>`}
      ${per}
      <div class="row mt16">${pk.editId ? `<button class="btn danger" data-act="kcDel">Remove</button>` : `<button class="btn" data-act="kcPkBack">Back</button>`}<button class="btn primary grow" data-act="kcPickAdd">${pk.editId ? 'Save' : pk.back === 'recipe' ? 'Add to recipe' : 'Add'}</button></div>`,
      s => {
        const qi = s.querySelector('#kcQty');
        if (qi) { qi.addEventListener('input', () => {
          if (NW() && pk) {
            const m = /^\s*(\d+(?:[.,]\d+)?)\s*(g|gm|gms|grams?|ml)\s*$/i.exec(qi.value), wi = m ? pk.food.units.findIndex(u => (/ml/i.test(m[2]) ? u.ml : u.gram)) : -1;
            if (m && wi >= 0) { if (!(pk.pc && pk.pc.on)) { pk.ui = wi; pk.q = Math.max(0.01, num(m[1])); qi.value = g1n(pk.q); pkPaint(); } return; }
            const x = fracOf(qi.value); if (x > 0 && x <= 100000) { pk.q = x; pkPaint(); } return;
          }
          const x = num(qi.value); if (x > 0 && x <= 100000) { pk.q = x; pkPaint(); } }); qi.addEventListener('focus', () => qi.select()); }
        const ni = s.querySelector('#kcPcN');
        if (ni) { ni.addEventListener('input', () => { const x = num(ni.value); if (x >= 0 && x <= 200 && pk && pk.pc) { pk.pc.n = Math.round(x * 2) / 2; pkPaint(); } }); ni.addEventListener('focus', () => ni.select()); }
      });
    pkPaint();
  }
  function openPick(food, o) {
    o = o || {};
    if (packInfo(food) && food.fid) {          // 1.21.1: a remembered packet size; and it starts on what was logged last time for this food
      if (packG()[food.fid] > 0) addPack(food, packG()[food.fid]);
      if (!o.entry && !food.last) { let l = null; for (const e of D.food) if (e.fid === food.fid && e.un && (!l || e.t > l.t)) l = e; if (l) food.last = l; }
    }
    if (!o.entry && !food.last && food.fid) { const l = lastMap().get(food.fid); if (l) food.last = l; }       // 1.33 (15)
    let ui = food.def || 0, q = 1;
    if (o.entry && o.entry.un) { const i = food.units.findIndex(x => sameUnit(x.label, o.entry.un)); if (i >= 0) { ui = i; q = o.entry.q > 0 ? o.entry.q : 1; } }
    else if (food.last && food.last.un) { const i = food.units.findIndex(x => sameUnit(x.label, food.last.un)); if (i >= 0) { ui = i; q = food.last.q > 0 ? food.last.q : 1; } }
    const want = NW() && !o.entry && food.want && food.units[food.want.ui] ? food.want : null;
    // v1.12: with a kitchen scale (Weigh in grams), a food not logged before starts in grams, with a by-pieces dish counted by amount
    const gi = food.units.findIndex(x => x.gram);
    if (st().gramsFirst && gi >= 0 && !(o.entry || food.last) && !want) { ui = gi; q = 100; o.byAmount = true; }
    if (food.units[ui] && food.units[ui].gram && !(o.entry || food.last) && !want) q = 100;
    if (want) { ui = want.ui; q = want.q; o.byAmount = true; }             // 1.35.2 (59): "2 roti" opens on 2 rotis
    else if (NW() && !(o.entry || food.last) && food.defQ > 0 && ui === food.def) q = food.defQ;      // 10 almonds
    pk = { food, q, ui, meal: o.meal || (add && add.meal) || mealNow(), editId: o.editId || null, back: o.back || (add && add.recipe ? 'recipe' : 'add') };
    // v1.11: a curry, a fried or grilled dish or a biryani opens counted by pieces, unless it was last logged by amount
    const pi = pieceOf(food);
    if (pi) {
      pk.pi = pi;
      const was = o.entry || food.last;
      pk.pc = was && was.pc ? Object.assign(pcDefault(pi), was.pc, { on: true }) : Object.assign(pcDefault(pi), { on: !(was && was.un) && !o.byAmount });
    }
    pickSheet();
  }
  ACT.kcPcMode = el => { if (!pk || !pk.pc) return; pk.pc.on = el.dataset.v === '1'; pickSheet(); };
  const pcSet = n => { if (!pk || !pk.pc) return; pk.pc.n = Math.max(0, Math.min(200, n)); pkPaint(); };
  ACT.kcPcMore = () => { if (pk && pk.pc) pcSet(Math.floor(pk.pc.n + 1e-9) + 1); };
  ACT.kcPcLess = () => { if (pk && pk.pc) pcSet(Math.ceil(pk.pc.n - 1e-9) - 1); };
  ACT.kcPcSize = el => { if (!pk || !pk.pc) return; pk.pc.s = +el.dataset.v; pkPaint(); };
  ACT.kcPcBone = el => { if (!pk || !pk.pc) return; pk.pc.b = +el.dataset.v; pkPaint(); };
  ACT.kcPcGv = el => { if (!pk || !pk.pc) return; pk.pc.gv = +el.dataset.v; pkPaint(); };
  ACT.kcPcRice = el => { if (!pk || !pk.pc) return; pk.pc.rp = +el.dataset.v; pkPaint(); };
  ACT.kcPick = el => { const f = shown[+el.dataset.i]; if (!f) return; if (add) add.q0 = add.q || ''; openPick(f); };      // (search results carry their last amount: see lastMap)
  const setQ = q => { if (!pk) return; pk.q = Math.max(0.01, Math.min(100000, Math.round(q * 1000) / 1000)); pkPaint(); };
  ACT.kcMore = () => { if (!pk) return; const s = stepOf(pk.food.units[pk.ui]); setQ(Math.floor(pk.q / s + 1e-9) * s + s); };
  ACT.kcLess = () => { if (!pk) return; const s = stepOf(pk.food.units[pk.ui]), n = Math.ceil(pk.q / s - 1e-9) * s - s; setQ(n > 0 ? n : s >= 1 ? 1 : 0.25); };
  ACT.kcFrac = el => setQ(+el.dataset.v);
  ACT.kcGramsFirst = () => {
    st().gramsFirst = !st().gramsFirst; S.save(true);
    if (pk && st().gramsFirst) { const gi = pk.food.units.findIndex(x => x.gram); if (gi >= 0 && gi !== pk.ui) { const el = document.querySelector(`[data-act="kcUnit"][data-i="${gi}"]`); if (el) { ACT.kcUnit(el); } } if (pk.pc) pk.pc.on = false; }
    if (pk) pickSheet();
    toast(st().gramsFirst ? 'New foods start in grams: weigh them and type the number' : 'New foods start in their usual serving');
  };
  ACT.kcUnit = el => {
    if (!pk) return; const i = +el.dataset.i, a = pk.food.units[pk.ui], b = pk.food.units[i]; if (!b || i === pk.ui) return;
    // switching keeps about the same amount of food when both sizes are known (v1.21.3: but a drink's glass, can or bottle counts one whole)
    const grams = a.g > 0 ? a.g * pk.q : 0;
    pk.ui = i; pk.q = grams > 0 && b.g > 0 ? (b.gram || b.ml ? Math.round(grams / b.g) : /^(glass|can|bottle) \(\d+ ml\)$/.test(b.label) ? 1 : Math.max(0.25, Math.round(grams / b.g * 4) / 4)) : (b.gram ? 100 : 1);
    pkPaint();
  };
  ACT.kcPkMeal = el => { if (!pk) return; pk.meal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcPkBack = () => { if (pk && pk.back === 'recipe') { pk = null; return recipeSheet(); } if (pk && pk.back === 'out') { pk = null; return outSheet(); } pk = null; if (add) addSheet(); else A.closeSheet(); };
  ACT.kcFav = el => {
    if (!pk) return; const k = key(pk.food), l = favs(), i = l.indexOf(k);
    if (i >= 0) l.splice(i, 1); else l.unshift(k);
    S.save(true); const on = i < 0; el.classList.toggle('on', on); el.textContent = on ? '★' : '☆'; el.setAttribute('aria-pressed', String(on));
    toast(on ? 'Kept in favourites' : 'Removed from favourites');
  };
  ACT.kcPickAdd = () => {
    if (!pk) return; const f = pk.food, byPc = !!(pk.pc && pk.pc.on && pk.pi);
    if (byPc ? !(pcVals(pk.pi, pk.pc).g > 0) : !(pk.q > 0)) { toast(byPc ? 'Add a piece or some gravy' : 'Type how much'); return; }
    const make = (meal, t) => (byPc ? pieceEntry(f, pk.pi, pk.pc, meal, t) : entryOf(f, pk.q, pk.ui, meal, t));
    if (pk.back === 'recipe' && recipe) {
      const e = make(null, Date.now()); delete e.t; delete e.meal; delete e.id;
      recipe.items.push(e); pk = null; recipeSheet(); return;
    }
    if (pk.editId) {
      const i = D.food.findIndex(x => x.id === pk.editId); if (i < 0) { pk = null; A.closeSheet(); return; }
      const old = D.food[i], e = make(pk.meal, old.t);
      e.id = old.id; if (old.pic) e.pic = old.pic; if (old.src === 'ai' || old.src === 'photo') e.src = old.src;
      if (pk.meal !== mealOf(old) && isToday(day0()) === false) e.t = stampMeal(pk.meal, day0());
      D.food[i] = e; S.save(true); pk = null; add = null; A.closeSheet(); toast('Saved'); redraw(); return;
    }
    const e = log(make(pk.meal));
    if (pk.back === 'out' && out && out.place) { e.at = out.place; placeKeep(out.place, e); }
    if (f.kind === 'off' && f.off && f.off.code && !D.myFoods.some(m => m.code === f.off.code)) keepOff(f.off);
    const nm = f.name, kc = e.kcal, back = pk.back, a0 = add; pk = null; add = null;
    if (back === 'add' && a0 && !a0.recipe && window.__keepAdd !== false) {          // 1.33 (8): the search stays open for the next food (tests of older versions: window.__keepAdd = false)
      add = Object.assign(a0, { q: '', online: [], cu: -1, tab: 'recent', sort: '' });
      if (a0.q0) rqKeep(a0.q0);
      addSheet(); add.q0 = ''; kept(e, nm); redraw(); return;
    }
    if (back === 'out' && out) outSheet(); else A.closeSheet();          // eating out: back to the menu for the next dish
    undoToast(`${nm} added to ${MEAL_NAME[e.meal].toLowerCase()} · ${n0(kc)} kcal`, () => { D.food = D.food.filter(x => x.id !== e.id); S.save(true); redraw(); });
    redraw();
  };
  // changing an entry: the food it came from when it is still known, otherwise its numbers
  const edit0 = ACT.kcEdit;
  ACT.kcEdit = el => {
    const e = D.food.find(x => x.id === el.dataset.id); if (!e) return;
    if (Array.isArray(e.items) && e.items.length && ACT.kcShotEdit && ACT.kcShotEdit(e)) return;          // v1.11: a photo meal opens with its lines
    const open = () => { const f = foodOfEntry(e); if (f && (f.units.some(u => sameUnit(u.label, e.un)) || (e.pc && pieceOf(f)))) { add = null; openPick(f, { entry: e, editId: e.id, meal: mealOf(e) }); } else ownSheet(e); };
    if (e.fid && !e.fid.match(/^[yrno]:/) && !DB) loadDb().then(open, () => ownSheet(e)); else open();
  };
  void edit0;

  // =====================================================================================================
  // v1.20: tap a food to see everything in it. Calories, protein, carbs, fat and fibre against the day's targets; sugars, saturated
  // fat and salt against their limits; then, one tap away, the vitamins and minerals against the day's needs (ICMR-NIN 2020, as on
  // the Vitamins page). A meal read from a photo lists each of its foods too. The ✎ at the top right opens the screens that change
  // it (what tapping a food did before).
  // =====================================================================================================
  let infoId = null;
  const pctOfDay = (v, t) => (t > 0 && v ? Math.round(v / t * 100) : null);
  function infoRow(nm, v, unit, t, dec, kind) {
    const pc = pctOfDay(v, t), w = pc == null ? 0 : Math.max(0, Math.min(100, pc));
    const av = Math.abs(v || 0), k = av >= 10 ? 1 : av >= 1 ? 10 : 100, val = v == null ? '–' : av >= 10 ? n0(v) : String(Math.round(v * k) / k);      // 2 figures for small amounts
    return `<div class="kci-row${kind ? ' kci-' + kind : ''}"><span class="grow">${nm}</span><b>${val}${v == null ? '' : ' ' + unit}</b><span class="kci-pct">${pc == null ? '' : pc + '%'}</span></div>`
      + (t > 0 && v ? `<div class="kci-bar${kind === 'limit' && pc > 100 ? ' over' : ''}"><div style="width:${w}%"></div></div>` : '');
  }
  function infoVitamins(e) {
    const SP = window.Supps, SD = window.SUPPDATA; if (!SP || !SD || !SP.entryMicro) return '';
    if (!SP.ready()) {
      const id = e.id; SP.loadMicro().then(() => { if (infoId === id) infoSheet(D.food.find(x => x.id === id)); }).catch(() => { });
      return `<p class="xs dim"><span class="kc-spin"></span> Adding up its vitamins and minerals…</p>`;
    }
    const m = SP.entryMicro(e, 0);
    if (!m) return `<p class="xs muted">${e.src === 'left' ? 'The foods left have no vitamin and mineral numbers.' : "This food has no vitamin and mineral numbers (it isn't from the food list, or was typed by you)."}</p>`;
    const N = SP.myNeeds(), gaps = new Set(m.gaps || []);
    const rows = SD.NUTS.map(([k, nm, unit, , , dec]) => {
      const need = (N.o[k] || {}).need || 0, v = m.v[k] || 0;
      if (!v && gaps.has(k)) return `<div class="kci-row kci-none"><span class="grow">${nm}</span><span class="xs dim">no number in the table</span><span class="kci-pct"></span></div>`;
      return infoRow(nm, v, unit, need, dec, 'mn');
    }).join('');
    const miss = (m.miss || []).length ? `<p class="xs dim mt8">Not counted here: ${esc(m.miss.slice(0, 4).join(', '))}${m.miss.length > 4 ? '…' : ''} (no numbers for ${m.miss.length === 1 ? 'it' : 'them'}).</p>` : '';
    return `${rows}${miss}<p class="xs dim mt8">The % is of what you need in a whole day for your age and sex (ICMR-NIN 2020).</p>`;
  }
  function infoSheet(e) {
    if (!e) { infoId = null; return; }
    const left = e.src === 'left', tg = targets(e.t), L = limitsFor(tg), SP = window.Supps;
    const d = new Date(e.t), when = `${MEAL_NAME[mealOf(e)] || 'Food'} · ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
    const amt = e.per && !/^same as/.test(e.per) ? e.per : num(e.g) > 0 ? `${Math.round(num(e.g))} g` : '';
    const big = e.big ? S.loadPhoto(e.big) : '', pic = big || (e.pic ? S.loadPhoto(e.pic) : '');
    const x = SP && SP.ready() && SP.entryExtra ? SP.entryExtra(e) : null, mi = SP && SP.ready() && SP.entryMicro ? SP.entryMicro(e, 0) : null;
    const na = mi && mi.v && mi.v.na != null ? mi.v.na : null;
    const kc = tg && tg.kcal > 0 ? pctOfDay(e.kcal, tg.kcal) : null;
    let h = `<div class="row kci-head"><div class="grow" style="min-width:0"><h2 class="kci-name${!left && String(e.name || '').length > 60 ? ' h2-long' : ''}">${esc(left ? 'Leftovers' : e.name)}</h2><div class="xs muted mt4">${esc(when)}${amt ? ' · ' + esc(amt) : ''}</div></div>
      <button class="kci-pen" id="kcInfoEdit" data-act="kcInfoEdit" data-id="${esc(e.id)}" aria-label="Change this food" title="Change">✎</button></div>
      ${pic ? `<img class="kci-pic${big ? '' : ' sm'}" src="${pic}" alt="">` : ''}
      <div class="kci-kcal"><b>${left ? '−' + n0(-e.kcal) : n0(e.kcal)}</b> kcal${kc != null ? ` <span class="small muted">· ${kc}% of your ${n0(tg.kcal)} kcal day</span>` : ''}</div>
      ${left ? '' : `<div class="kci-move" role="group" aria-label="Move to another meal"><span class="kci-mvl" aria-hidden="true">Move to</span>${MEALS.map(([k, nm]) => `<button class="chip${mealOf(e) === k ? ' on' : ''}" data-act="kcMoveTo" data-id="${esc(e.id)}" data-v="${k}" aria-pressed="${mealOf(e) === k}">${nm}</button>`).join('')}</div>`}
      <div class="kci-sec">Reach</div>
      ${infoRow('Protein', num(e.p), 'g', tg ? tg.p : 0, 1, 'goal')}${infoRow('Carbs', num(e.c), 'g', tg ? tg.c : 0, 1, 'range')}${infoRow('Fat', num(e.f), 'g', tg ? tg.f : 0, 1, 'range')}${infoRow('Fibre', num(e.fib), 'g', tg ? tg.fib : 0, 1, 'goal')}
      ${num(e.cr) > 0 ? infoRow('Creatine', num(e.cr), 'g', 0, 1) : ''}
      <div class="kci-sec">Stay under</div>
      ${infoRow('Sugars', x && x.nsg ? x.sg : null, 'g', L.sg, 1, 'limit')}${infoRow('Sat. fat', x && x.nsf ? x.sf : null, 'g', L.sf, 1, 'limit')}${infoRow('Salt', na == null ? null : na * 2.5 / 1000, 'g', L.salt, 1, 'limit')}
      ${!left && SP && SP.ready() && SP.saltable && SP.saltable(e) ? saltRow(e) : ''}${!left ? oilRow(e) : ''}`;
    if (!tg) h += `<p class="xs dim mt8">Set your daily target (Food tab, Your daily limits) to see how much of your day each one is.</p>`;
    const lines = left ? ((e.left && e.left.parts) || []) : Array.isArray(e.items) ? e.items : [];
    if (lines.length) {
      h += `<div class="kci-sec">${left ? 'Left on the plate' : `In this meal · ${lines.length} food${lines.length === 1 ? '' : 's'}`}</div>` + lines.map(l => {
        const sg = left ? -1 : 1, g = num(l.g), mac = [['P', l.p], ['C', l.c], ['F', l.f], ['Fibre', l.fib]].filter(([, v]) => num(v) > 0).map(([k, v]) => `${k} ${g1(num(v))}`).join(' · ');
        return `<div class="kci-food"><div class="row"><span class="grow small" style="font-weight:600">${esc(l.name || 'Food')}</span><b class="small">${sg < 0 ? '−' : ''}${n0(num(l.kcal))} kcal</b></div>
          <div class="xs muted">${g > 0 ? `${n0(g)} g` : l.share ? `${Math.round(l.share * 100)}% of it` : ''}${(g > 0 || l.share) && mac ? ' · ' : ''}${mac}${l.chk ? ' · <span class="kc-chkdot">check this food</span>' : ''}</div></div>`;
      }).join('');
    }
    h += `<details class="kci-vm"${A.top().name === 'calories' && infoOpen ? ' open' : ''}><summary><span class="grow">Vitamins and minerals</span><span class="kci-chev" aria-hidden="true">›</span></summary>${infoVitamins(e)}</details>`;
    const row = !left && e.fid && DB ? DB.byId.get(e.fid) : null, srcName = row && DB.srcs[row.src];
    const from = left ? 'Taken off the meal it was left from.' : e.src === 'ai' ? "Read from your photo: the AI named each food and its grams; every number is the food list's for those grams."
      : row && row.src === 6 ? 'Numbers worked out by GymDay from the food tables for this version of the dish.' : srcName ? 'Numbers from ' + srcName + '.' : e.src === 'typed' ? 'Typed by you; each food was matched to the food list.' : !e.fid && !lines.length ? 'Your own numbers.' : '';
    if (from) h += `<p class="xs dim mt12">${esc(from)}</p>`;
    const tok = ++infoTok;       // the sheet it replaces (the same food, drawn again) must not let go of this one
    A.openSheet(`<div class="kci">${h}</div>`, s => { const dt = s.querySelector('.kci-vm'); if (dt) dt.addEventListener('toggle', () => { infoOpen = dt.open; }); }, () => { if (infoTok === tok) infoId = null; });
    infoId = e.id;
  }
  // v1.21.7: the salt this one dish was cooked with (No salt / Less / Usual / More); the home setting (Sodium page) otherwise
  const SALT_WORD = { none: 'no salt', less: 'less salt', usual: 'usual salt', more: 'more salt' };
  function saltRow(e) {
    const SP = window.Supps, lv = SP.saltLevel(e), out = !!(e.out || e.at);
    return `<div class="kci-salt" role="group" aria-label="Salt in this food"><span class="kci-mvl" aria-hidden="true">Salt</span>${SP.SALT_LEVELS.map(([v, nm]) => `<button class="chip${lv === v ? ' on' : ''}" data-act="kcSalt" data-id="${esc(e.id)}" data-v="${v}" aria-pressed="${lv === v}">${nm}</button>`).join('')}</div>
      <p class="xs dim kci-salt-note">${e.salt ? 'Set for this food. ' : ''}${out ? 'Eaten out: counted with usual salt unless you pick one.' : `Your home cooking: ${SALT_WORD[SP.homeSalt()]} (change it on the Sodium page).`}</p>`;
  }
  ACT.kcSalt = el => {
    const e = D.food.find(x => x.id === el.dataset.id), SP = window.Supps, v = el.dataset.v;
    if (!e || !SP || !SP.SALT_LEVELS.some(x => x[0] === v)) return;
    const def = e.out || e.at ? 'usual' : SP.homeSalt();
    if (v === def) delete e.salt; else e.salt = v;                      // the same as the default: it follows the home setting again
    S.save(true); infoSheet(e); redraw();
  };
  // ---- 1.23: my bowl, glass and spoon (the sheet, its line on the amount sheet, its row in Settings)
  function mineLine(f) {
    const kinds = [...new Set((f.units || []).map(u => u.mk).filter(Boolean))]; if (!kinds.length) return '';
    const m = mineOf(), set = kinds.filter(k => +m[k] > 0), nm = k => MINE.find(x => x[0] === k)[1].replace(/ \(.*/, '').toLowerCase();
    return `<p class="xs dim kc-mine">${set.length ? `Using your own ${set.map(k => `${nm(k)} (${n0(m[k])} ml)`).join(', ')}.` : `A ${kinds.map(nm).join(' or ')} here is the usual size (${kinds.map(k => MINE.find(x => x[0] === k)[2] + ' ml').join(', ')}).`} <span class="accent" data-act="kcMine" role="button" tabindex="0">${set.length ? 'Change' : 'Is yours different? Set it once'}</span></p>`;
  }
  ACT.kcMine = () => {
    const m = mineOf(), back = pk ? 1 : 0;
    A.openSheet(`<h2>My bowl, glass and spoon</h2><p class="small muted">Measure yours once and every food uses your sizes. Fill it with water to where you usually fill it, then pour the water into a measuring jug, or weigh it (1 g of water is 1 ml). Leave a box empty to keep the usual size.</p>
      <div class="kc-minef">${MINE.map(([k, nm, std]) => `<label class="rc-f"><span class="xs muted">${nm}</span><span class="rc-fi"><input class="input" id="mine_${k}" type="number" inputmode="decimal" min="1" max="2000" step="any" placeholder="${std}" value="${+m[k] > 0 ? m[k] : ''}"><small>ml</small></span></label>`).join('')}</div>
      <p class="xs dim mt8">Usual sizes: katori 150 ml, bowl 250 ml, glass 250 ml, cup 240 ml, tablespoon 15 ml, teaspoon 5 ml. Food you have already logged keeps its numbers; this counts from now on.</p>
      <div class="row mt16"><button class="btn" data-act="kcMineClear">Usual sizes</button><button class="btn primary grow" data-act="kcMineSave" data-back="${back}">Save</button></div>`);
  };
  const LIM = { katori: [40, 600], bowl: [80, 1500], glass: [60, 1000], cup: [50, 800], tbsp: [5, 40], tsp: [2, 15] };
  function mineDone(msg, back) { S.save(true); A.closeSheet(); toast(msg); if (back && pk) { const f = pk.food.fid && DB ? foodById(pk.food.fid) : null; if (f) { const o = { meal: pk.meal, editId: pk.editId, back: pk.back }; openPick(f, o); } } else redraw(); if (A.inSettings()) A.rerender(); }
  ACT.kcMineSave = el => {
    const out = {};
    for (const [k, nm] of MINE) { const raw = String(($('#mine_' + k) || {}).value || '').trim(); if (!raw) continue; const v = num(raw); if (!(v >= LIM[k][0] && v <= LIM[k][1])) { toast(`${nm.replace(/ \(.*/, '')}: type its size in ml (${LIM[k][0]} to ${n0(LIM[k][1])})`); return; } out[k] = Math.round(v * 10) / 10; }
    if (Object.keys(out).length) st().mine = out; else delete st().mine;
    mineDone(Object.keys(out).length ? 'Saved: foods now use your sizes' : 'Back to the usual sizes', el.dataset.back === '1');
  };
  ACT.kcMineClear = () => { delete st().mine; mineDone('Back to the usual sizes', false); };
  window.SettingsRows.push(() => (C.on && C.on() ? `<div class="row" style="padding:6px 0"><div class="grow">My bowl, glass and spoon<div class="xs dim">${Object.keys(mineOf()).length ? 'Yours: ' + MINE.filter(x => +mineOf()[x[0]] > 0).map(x => `${x[1].replace(/ \(.*/, '').toLowerCase()} ${n0(mineOf()[x[0]])} ml`).join(', ') : 'Measure your katori, bowl, glass, cup and spoons once; every food then uses your sizes'}</div></div><button class="btn sm" data-act="kcMine">${Object.keys(mineOf()).length ? 'Change' : 'Set'}</button></div>` : ''));

  // ---- 1.23: the oil in one dish, like its salt: Less / Usual / More. The entry's fat and calories move by what the
  // level changes in each home-cooked food in it (curries, dals, sabzis, rice dishes, parathas: the same foods the
  // home-cooking setting applies to). `ob` is the level its numbers hold now and `obk` the calories at that moment:
  // if the entry is changed afterwards its numbers are fresh, at the home level, and the note is dropped.
  const OIL_LEVELS = [['less', 'Less'], ['usual', 'Usual'], ['more', 'More']];
  const OIL_SAY = { less: 'less oil', usual: 'usual oil', more: 'more oil' };
  const homeOil = () => (st().oil === 'more' || st().oil === 'less' ? st().oil : 'usual');
  const oilAt = (x, lvl) => (lvl === 'more' ? 3 : lvl === 'less' ? -Math.min(2, Math.round(x.f * 5) / 10) : 0);      // grams of fat in 100 g, against the recipe
  const oilable = x => !!x && (x.src === 1 || x.src === 6) && OILY.test(x.name) && !NOT_OILY.test(x.name) && x.f >= 1 && x.f <= 25;
  function oilParts(e) {
    if (!DB || !e || e.src === 'left') return [];
    if (Array.isArray(e.items) && e.items.length) return e.items.map(x => ({ line: x, row: x.fid ? DB.byId.get(x.fid) : null, g: num(x.g) })).filter(p => oilable(p.row) && p.g > 0);
    const row = e.fid && !String(e.fid).includes(':') ? DB.byId.get(e.fid) : null, g = num(e.g);
    return oilable(row) && g > 0 ? [{ line: null, row, g }] : [];
  }
  const oilLevel = e => (e.ob && e.obk === e.kcal && OIL_LEVELS.some(l => l[0] === e.ob) ? e.ob : homeOil());
  function setOil(e, v) {
    const parts = oilParts(e), was = oilLevel(e); if (!parts.length || !OIL_LEVELS.some(l => l[0] === v)) return false;
    let df = 0;
    for (const p of parts) { const d = (oilAt(p.row, v) - oilAt(p.row, was)) * p.g / 100; df += d; if (p.line) { p.line.f = Math.max(0, r1(num(p.line.f) + d)); p.line.kcal = Math.max(0, Math.round(num(p.line.kcal) + 9 * d)); } }
    e.f = Math.max(0, r1(num(e.f) + df)); e.kcal = Math.max(0, Math.round(num(e.kcal) + 9 * df));
    if (v === homeOil()) { delete e.ob; delete e.obk; } else { e.ob = v; e.obk = e.kcal; }
    return true;
  }
  function oilRow(e) {
    const parts = oilParts(e); if (!parts.length) return '';
    const lv = oilLevel(e), g = parts.reduce((a, p) => a + p.g, 0);
    const eff = v => { const d = parts.reduce((a, p) => a + (oilAt(p.row, v) - oilAt(p.row, lv)) * p.g / 100, 0); return Math.round(9 * d); };
    return `<div class="kci-salt kci-oil" role="group" aria-label="Oil in this food"><span class="kci-mvl" aria-hidden="true">Oil</span>${OIL_LEVELS.map(([v, nm]) => `<button class="chip${lv === v ? ' on' : ''}" data-act="kcOil" data-id="${esc(e.id)}" data-v="${v}" aria-pressed="${lv === v}">${nm}</button>`).join('')}</div>
      <p class="xs dim kci-salt-note">${lv !== homeOil() ? 'Set for this food. ' : ''}${lv !== 'more' ? `More would add about ${n0(eff('more'))} kcal here` : `Usual would take off about ${n0(-eff('usual'))} kcal here`}${parts.length > 1 || (e.items || []).length > 1 ? ` (the ${parts.length} home-cooked food${parts.length === 1 ? '' : 's'} in it, ${n0(g)} g)` : ''}. Your home cooking: ${OIL_SAY[homeOil()]} (change it under Overview → What you eat).</p>`;
  }
  ACT.kcOil = el => {
    const e = D.food.find(x => x.id === el.dataset.id); if (!e) return;
    if (setOil(e, el.dataset.v)) { S.save(true); infoSheet(e); redraw(); }
  };
  let infoOpen = false, infoTok = 0;
  ACT.kcInfo = el => {
    const e = D.food.find(x => x.id === (el && el.dataset && el.dataset.id)); if (!e) return;
    infoOpen = false;
    if (!DB && e.fid && !String(e.fid).includes(':')) loadDb().then(() => { if (infoId === e.id) infoSheet(e); }).catch(() => { });
    infoSheet(e);
  };
  ACT.kcInfoEdit = el => {
    const e = D.food.find(x => x.id === el.dataset.id); if (!e) return;
    infoId = null;
    if (e.src === 'left' && ACT.lvOpen) ACT.lvOpen({ dataset: { meal: e.meal || '' } }); else { A.closeSheet(); ACT.kcEdit({ dataset: { id: e.id } }); }
  };

  // ---------------------------------------------------------------- quick add / typed, and changing a typed entry
  let ownId = null;
  function ownSheet(e) {
    ownId = e && e.id ? e.id : null;
    const v = e || {}, meal = ownId ? mealOf(v) : (add && add.meal) || mealNow();
    const fld = (id, label, val, mode) => `<div class="grow"><label class="lbl">${label}</label><input class="input" id="${id}" type="number" inputmode="${mode || 'decimal'}" step="any" value="${val > 0 ? val : ''}" placeholder="–"></div>`;
    A.openSheet(`<h2>${ownId ? 'Change this entry' : 'Quick add'}</h2>
      <div class="field"><label class="lbl" for="kcName">What was it</label><textarea class="input grow-box" id="kcName" rows="1" maxlength="600" enterkeyhint="done" placeholder="e.g. home dal and two rotis">${esc(v.name || (add && add.q) || '')}</textarea></div>
      <div class="row" style="gap:10px">${fld('kcKcal', 'Calories (kcal)', v.kcal, 'numeric')}${fld('kcProt', 'Protein (g)', v.p)}</div>
      <div class="row mt8" style="gap:10px">${fld('kcCarb', 'Carbs (g)', v.c)}${fld('kcFat', 'Fat (g)', v.f)}${fld('kcFib', 'Fibre (g)', v.fib)}</div>
      <p class="xs dim mt8">Only calories are needed. A packet's label has the rest. Change protein, carbs or fat and the calories follow (4 kcal a gram, 9 for fat); change the calories and the rest keep their share.</p>
      <label class="lbl mt12">Meal</label><div class="kc-meals" id="kcOwnMeal">${MEALS.map(([k, nm]) => `<button class="chip ${meal === k ? 'on' : ''}" data-act="kcOwnMeal" data-v="${k}">${nm}</button>`).join('')}</div>
      ${ownId ? '' : `<div class="row mt12"><div class="grow small">Keep it in My foods<div class="xs dim">so next time it is one tap</div></div><input type="checkbox" id="kcKeep" style="width:22px;height:22px"></div>`}
      <div class="row mt16">${ownId ? `<button class="btn danger" data-act="kcDel">Remove</button>` : `<button class="btn" data-act="kcOwnBack">Back</button>`}<button class="btn primary grow" data-act="kcOwnSave">${ownId ? 'Save' : 'Add'}</button></div>`,
      s => { s.dataset.meal = meal; const i = s.querySelector(v.name ? '#kcKcal' : '#kcName'); if (i && !('ontouchstart' in window)) i.focus(); follow(s); });
    pk = null;
  }
  // v1.11: the numbers move together. Each box remembers the numbers when it was entered, so typing 3, 30, 300 works.
  function follow(s) {
    const F = { kcKcal: 'kcal', kcProt: 'p', kcCarb: 'c', kcFat: 'f', kcFib: 'fib' }, box = k => s.querySelector('#' + Object.keys(F).find(id => F[id] === k));
    const now = () => { const o = {}; for (const id in F) o[F[id]] = num((s.querySelector('#' + id) || {}).value); return o; };
    let ref = null; const typed = new Set();          // what the person typed themselves is never changed for them
    s.querySelector('.panel').addEventListener('focusin', e => { if (F[e.target.id]) ref = now(); });
    s.querySelector('.panel').addEventListener('input', e => {
      const k = F[e.target.id]; if (!k) return; typed.add(k); if (k === 'fib') return; if (!ref) ref = now();
      const v = num(e.target.value), r2 = x => Math.round(x * 10) / 10;
      if (k === 'kcal') {
        if (!(ref.kcal > 0)) return;                                   // nothing to keep the share of
        for (const m of ['p', 'c', 'f', 'fib']) { const b = box(m); if (b && ref[m] > 0 && !typed.has(m)) b.value = r2(ref[m] * v / ref.kcal); }
      } else {
        const b = box('kcal'); if (!b || typed.has('kcal')) return;
        const base = ref.kcal > 0 ? ref.kcal : 4 * (ref.p + ref.c) + 9 * ref.f;
        const kc = Math.max(0, Math.round(base + (k === 'f' ? 9 : 4) * (v - ref[k])));
        b.value = kc > 0 ? kc : '';
      }
    });
  }
  ACT.kcOwn = () => ownSheet(null);
  ACT.kcOwnBack = () => { if (add) addSheet(); else A.closeSheet(); };
  ACT.kcOwnMeal = el => { const s = $('#sheet'); s.dataset.meal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcOwnSave = () => {
    const val = id => num(($('#' + id) || {}).value), name = (($('#kcName') || {}).value || '').replace(/\s+/g, ' ').trim(), kcal = val('kcKcal');
    const meal = MEAL_NAME[$('#sheet').dataset.meal] ? $('#sheet').dataset.meal : mealNow();
    if (!name) { toast('Give it a name first'); return; }
    if (!(kcal > 0) || kcal > 20000) { toast('Type its calories'); return; }
    const mac = { p: val('kcProt'), c: val('kcCarb'), f: val('kcFat'), fib: val('kcFib') };
    if (Object.values(mac).some(x => x < 0 || x > 2000)) { toast("A number doesn't look right"); return; }
    if (ownId) {
      const e = D.food.find(x => x.id === ownId);
      if (e) {
        e.name = name.slice(0, 600); e.kcal = Math.round(kcal);
        for (const k in mac) { if (mac[k] > 0) e[k] = r1(mac[k]); else delete e[k]; }
        if (e.src === 'ai') e.src = 'photo';
        if (meal !== mealOf(e)) { e.meal = meal; if (!isToday(day0())) e.t = stampMeal(meal, day0()); } else e.meal = meal;
        delete e.fid; delete e.q; delete e.un; delete e.b; delete e.ul; delete e.uf; delete e.mfid; delete e.mg; delete e.rc;
        if (e.per && !/^same as/.test(e.per) && e.src !== 'photo') delete e.per;
        S.save(true);
      }
      ownId = null; A.closeSheet(); toast('Saved'); redraw(); recount(); return;
    }
    const e = { id: S.uid(), t: stampMeal(meal), meal, name: name.slice(0, 600), kcal: Math.round(kcal), src: 'typed' };
    for (const k in mac) if (mac[k] > 0) e[k] = r1(mac[k]);
    log(e); recount();
    if (($('#kcKeep') || {}).checked && !D.myFoods.some(x => fold(x.name) === fold(name))) { D.myFoods.push(Object.assign({ id: S.uid(), name: name.slice(0, 600), kcal: Math.round(kcal), per: '1 serving' }, ...Object.keys(mac).map(k => (mac[k] > 0 ? { [k]: r1(mac[k]) } : {})))); S.save(true); }
    add = null; A.closeSheet(); toast(`${name} added · ${n0(kcal)} kcal`); redraw();
  };
  ACT.kcDel = () => {
    const id = (pk && pk.editId) || ownId; const i = D.food.findIndex(x => x.id === id); if (i < 0) return;
    const f = D.food.splice(i, 1)[0]; pk = null; ownId = null; S.save(true); A.closeSheet(); redraw();
    undoToast(f.name + ' removed', () => { D.food.push(f); S.save(true); redraw(); });
    if (f.pic) setTimeout(() => { if (!D.food.some(x => x.pic === f.pic)) S.deletePhoto(f.pic); }, 8000);
  };

  // ---------------------------------------------------------------- My foods: a new one
  function newFoodSheet(m) {
    m = m || {};
    const fld = (id, label, val) => `<div class="grow"><label class="lbl">${label}</label><input class="input" id="${id}" type="number" inputmode="decimal" step="any" value="${val > 0 ? val : ''}" placeholder="–"></div>`;
    A.openSheet(`<h2>${m.id ? 'Change my food' : 'New food'}</h2>
      <div class="field"><label class="lbl" for="mfName">Name</label><textarea class="input grow-box" id="mfName" rows="1" maxlength="600" enterkeyhint="done" placeholder="e.g. Mom's rajma">${esc(m.name || '')}</textarea></div>
      <div class="row" style="gap:10px"><div class="grow"><label class="lbl">One serving is</label><input class="input" id="mfPer" maxlength="40" value="${esc(m.per || '1 serving')}" placeholder="1 katori, 1 bar, 1 cup…"></div>${fld('mfG', 'It weighs (g) · optional', m.g)}</div>
      <p class="xs muted mt8">What one serving holds:</p>
      <div class="row" style="gap:10px">${fld('mfKcal', 'Calories', m.kcal)}${fld('mfP', 'Protein (g)', m.p)}</div>
      <div class="row mt8" style="gap:10px">${fld('mfC', 'Carbs (g)', m.c)}${fld('mfF', 'Fat (g)', m.f)}${fld('mfFib', 'Fibre (g)', m.fib)}</div>
      <div class="row mt16">${m.id ? `<button class="btn danger" data-act="kcMyDel" data-id="${esc(m.id)}">Delete</button>` : `<button class="btn" data-act="kcOwnBack">Back</button>`}<button class="btn primary grow" data-act="kcNewFoodSave" data-id="${esc(m.id || '')}">Save</button></div>`);
  }
  ACT.kcNewFood = () => newFoodSheet(null);
  ACT.kcNewFoodSave = el => {
    const v = id => num(($('#' + id) || {}).value), name = (($('#mfName') || {}).value || '').replace(/\s+/g, ' ').trim();
    if (!name) { toast('Give it a name first'); return; }
    if (!(v('mfKcal') > 0)) { toast('Type its calories'); return; }
    const m = { name: name.slice(0, 600), per: ((($('#mfPer') || {}).value || '').trim() || '1 serving').slice(0, 40), kcal: Math.round(v('mfKcal')) };
    for (const [k, id] of [['g', 'mfG'], ['p', 'mfP'], ['c', 'mfC'], ['f', 'mfF'], ['fib', 'mfFib']]) if (v(id) > 0) m[k] = r1(v(id));
    const old = el.dataset.id ? D.myFoods.find(x => String(x.id) === el.dataset.id) : null;
    if (old) { for (const k of ['g', 'p', 'c', 'f', 'fib']) delete old[k]; Object.assign(old, m); } else D.myFoods.push(Object.assign({ id: S.uid() }, m));
    S.save(true); toast(old ? 'Saved' : `${m.name} is in My foods`);
    if (add) { add.tab = 'my'; add.q = ''; addSheet(); } else A.closeSheet();
  };
  ACT.kcMyDel = el => {
    const i = D.myFoods.findIndex(x => String(x.id) === el.dataset.id); if (i < 0) return;
    const m = D.myFoods.splice(i, 1)[0]; S.save(true); undoToast(m.name + ' deleted from My foods', () => { D.myFoods.push(m); S.save(true); });
    if (add) addSheet(); else A.closeSheet();
  };

  // =====================================================================================================
  // My recipes: ingredients from the list, divided into servings
  // =====================================================================================================
  let recipe = null;       // the recipe being made or changed: { id?, name, serves, cooked, items: [entry-like] }
  function recipeTotal(r) { return totals(r.items || []); }
  function recipeSheet() {
    const r = recipe, tot = recipeTotal(r), n = Math.max(1, num(r.serves) || 1);
    A.openSheet(`<h2>${r.id ? 'Change recipe' : 'New recipe'}</h2>
      ${r.ai ? `<p class="xs muted" id="rcAi">Read by the AI: what goes in and how much${r.guess ? '. It guessed the number of servings, so check it' : ''}. Every number below is from GymDay's own food list for that weight. Remove what is wrong and add the right food.${r.note ? ' ' + esc(r.note) : ''}</p>` : ''}
      <div class="field"><label class="lbl" for="rcName">Name</label><textarea class="input grow-box" id="rcName" rows="1" maxlength="600" enterkeyhint="done" placeholder="e.g. Chicken curry, my way">${esc(r.name || '')}</textarea></div>
      <div class="row" style="gap:10px"><div class="grow"><label class="lbl">It makes (servings)</label><input class="input" id="rcServes" type="number" inputmode="decimal" step="any" value="${r.serves || 1}"></div>
        <div class="grow"><label class="lbl">Cooked weight (g) · optional</label><input class="input" id="rcCooked" type="number" inputmode="decimal" step="any" value="${r.cooked > 0 ? r.cooked : ''}" placeholder="–"></div></div>
      <div class="kc-sec">Ingredients</div><div id="rcItems">${r.items.length ? r.items.map((e, i) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(e.name)}</div><div class="xs muted">${esc(e.per || '')}${e.as && fold(e.as) !== fold(e.name) ? ` · for “${esc(e.as)}”` : ''}${e.miss ? ' · <span class="accent">not in the food list: remove it and add the right food</span>' : e.chk ? ' · <span class="accent">check</span>' : ''}</div></div><div class="small" style="font-weight:700">${n0(e.kcal)}</div><button class="ib x" data-act="kcRecipeDelItem" data-i="${i}" aria-label="Remove ${esc(e.name)}">✕</button></div>`).join('') : `<p class="small muted">No ingredients yet.</p>`}</div>
      <button class="btn block mt8" data-act="kcRecipeAddItem">+ Add an ingredient</button>
      <p class="small mt12">Whole recipe: <b>${n0(tot.kcal)}</b> kcal · P ${g1(tot.p)} · C ${g1(tot.c)} · F ${g1(tot.f)} g<br><span class="muted">One serving: <b>${n0(tot.kcal / n)}</b> kcal · ${g1(tot.p / n)} g protein</span></p>
      <div class="row mt16">${r.id ? `<button class="btn danger" data-act="kcRecipeDel">Delete</button>` : `<button class="btn" data-act="kcRecipeCancel">Cancel</button>`}<button class="btn primary grow" data-act="kcRecipeSave">Save recipe</button></div>`,
      s => s.querySelector('.panel').addEventListener('input', e => {
        const t = e.target; if (!recipe) return;
        if (t.id === 'rcName') recipe.name = t.value.replace(/\s+/g, ' '); else if (t.id === 'rcServes') recipe.serves = num(t.value); else if (t.id === 'rcCooked') recipe.cooked = num(t.value);
      }));
  }
  ACT.kcRecipeNew = () => { recipe = { name: '', serves: 1, cooked: 0, items: [], meal: add ? add.meal : mealNow() }; add = null; recipeSheet(); };
  ACT.kcRecipeAddItem = () => { if (!recipe) return; add = { meal: recipe.meal || mealNow(), q: '', tab: 'recent', cu: -1, online: [], recipe }; addSheet(); };
  ACT.kcRecipeBack = () => { add = null; if (recipe) recipeSheet(); };
  ACT.kcRecipeDelItem = el => { if (!recipe) return; recipe.items.splice(+el.dataset.i, 1); recipeSheet(); };
  ACT.kcRecipeCancel = () => { recipe = null; A.closeSheet(); };
  ACT.kcRecipeSave = () => {
    if (!recipe) return; const name = String(recipe.name || '').trim();
    if (!name) { toast('Give the recipe a name'); return; }
    if (!recipe.items.some(e => !e.miss)) { toast('Add at least one ingredient'); return; }
    if (!(num(recipe.serves) > 0) || num(recipe.serves) > 100) { toast('How many servings does it make?'); return; }
    const r = { id: recipe.id || S.uid(), name: name.slice(0, 600), serves: Math.round(num(recipe.serves) * 100) / 100, items: recipe.items.filter(e => !e.miss).map(e => { const o = Object.assign({}, e); delete o.id; delete o.t; delete o.meal; delete o.pic; delete o.u; delete o.chk; delete o.as; return o; }) };
    if (recipe.cooked > 0) r.cooked = Math.round(recipe.cooked);
    const i = D.recipes.findIndex(x => x.id === r.id); if (i >= 0) D.recipes[i] = r; else D.recipes.push(r);
    S.save(true); const meal = recipe.meal; recipe = null; toast(`${r.name} saved in My recipes`);
    add = { meal: meal || mealNow(), q: '', tab: 'rec', cu: -1, online: [] }; addSheet();
  };
  ACT.kcRecipeDel = () => {
    if (!recipe || !recipe.id) return; const i = D.recipes.findIndex(x => x.id === recipe.id); if (i < 0) return;
    const r = D.recipes.splice(i, 1)[0]; S.save(true); recipe = null; A.closeSheet(); undoToast(r.name + ' deleted', () => { D.recipes.push(r); S.save(true); });
  };
  ACT.kcRecipeEdit = el => { const r = D.recipes.find(x => x.id === el.dataset.id); if (!r) return; recipe = JSON.parse(JSON.stringify(r)); recipeSheet(); };

  // ---------------------------------------------------------------- v1.25: a recipe read from photos or from pasted text
  // The AI only says what goes in and how much (grams). Every number is the food list's own for that weight, as with a photo of
  // a meal. A food the list isn't sure of is marked "check"; one it doesn't have counts nothing until the right food is added.
  let rread = null;
  function ingredient(name, grams) {
    const lf = lineFood(name, grams), f = lf ? foodById(lf.fid) : null;
    if (!f) return { name: String(name).slice(0, 60), kcal: 0, per: `${n0(grams)} g`, g: Math.round(grams), chk: 1, miss: 1 };
    const e = entryOf(f, lf.g, Math.max(0, f.units.findIndex(u => u.gram)), null, Date.now());
    delete e.t; delete e.meal; delete e.id;
    if (!lf.sure) e.chk = 1;
    e.as = String(name).slice(0, 60);                 // what the recipe called it
    return e;
  }
  async function recipeFrom(o) {
    const meal = add ? add.meal : ((recipe && recipe.meal) || mealNow()), mine = rread = {};
    A.openSheet(`<h2>Reading the recipe</h2><p class="small muted mt12"><span class="kc-spin"></span> ${o.url ? 'Opening the link and reading the recipe… up to a minute.' : o.text ? 'Reading what you pasted… about 10 seconds.' : 'Reading the photo… about 10 seconds.'}</p>`);
    let r = null, err = '';
    try {
      if (window.__recipeAi) r = await window.__recipeAi(o);                                                           // tests
      else {
        const Cl = window.Cloud;
        if (!Cl || !Cl.configured || !Cl.recipeRead) err = "Reading recipes needs the account's server. Add the ingredients by hand for now.";
        else if (!Cl.signedIn()) err = 'Sign in (Settings → Account) to have recipes read. For now, add the ingredients by hand.';
        else r = await Cl.recipeRead(o);
      }
      if (!DB) await loadDb();
    } catch (e) { err = (e && e.status === 404) ? "Reading recipes isn't switched on for this account's server yet." : ((e && e.message) || "The recipe couldn't be read just now. Try again."); }
    if (rread !== mine) return; rread = null;
    const rc = r && r.recipe;
    if (!rc || !(rc.items || []).length) {
      A.openSheet(`<h2>Recipe not read</h2><p class="small mt12">${esc(err || (o.url ? "No recipe could be read from that link. Copy the recipe's text from the page and paste it instead." : 'No recipe could be read from that. Try a clearer photo, or paste the recipe as text.'))}</p>
        <div class="row mt16">${o.url ? `<button class="btn grow" data-act="kcRecipePaste">Paste the text</button>` : `<button class="btn grow" data-act="kcRecipeNew">Add it by hand</button>`}<button class="btn primary grow" data-act="closeSheet">Close</button></div>`);
      return;
    }
    recipe = { name: String(rc.name || '').slice(0, 80), serves: num(rc.serves) > 0 ? num(rc.serves) : 1, cooked: 0, items: rc.items.slice(0, 40).map(x => ingredient(x.name, num(x.grams))), meal, ai: 1, guess: !!rc.serves_guess, note: String(r.note || '').slice(0, 200) };
    if (o.url) recipe.link = String(o.url).slice(0, 500);            // v1.28: where it came from
    add = null; recipeSheet();
  }
  ACT.kcRecipeShot = async el => { const cam = !!(el && el.dataset && el.dataset.cam), pics = await pickPhotos({ max: cam ? 1 : 4, camera: cam, side: 1600 }); if (!pics || !pics.length) return; recipeFrom({ images: pics.map(p => p.big) }); };
  ACT.kcRecipePaste = () => {
    A.openSheet(`<h2>Paste a recipe</h2><p class="small muted">The ingredients with their amounts, and how many it serves if it says. The steps can stay in; they are ignored.</p>
      <textarea class="input mt8" id="rcPaste" rows="10" maxlength="6000" style="height:auto;min-height:180px;line-height:1.4" placeholder="Paneer butter masala (serves 4)&#10;250 g paneer&#10;2 tbsp butter&#10;400 g tomatoes&#10;…"></textarea>
      <div class="row mt16"><button class="btn" data-act="kcRecipeTab">Back</button><button class="btn primary grow" data-act="kcRecipeRead">Read it</button></div>`);
  };
  ACT.kcRecipeTab = () => { add = add || { meal: mealNow(), q: '', tab: 'rec', cu: -1, online: [] }; add.tab = 'rec'; addSheet(); };
  ACT.kcRecipeRead = () => {
    const t = String(($('#rcPaste') || {}).value || '').trim(), u = linkIn(t);
    if (u && t.length < u.length + 40) { recipeFrom({ url: u }); return; }        // v1.28: just a link (and maybe a few words) is opened
    if (t.length < 20) { toast('Paste the whole recipe first'); return; } recipeFrom({ text: t });
  };
  // v1.28: a recipe from a link: a recipe site, a YouTube video (its description), a post. Some sites (Instagram) don't open for the server.
  const linkIn = t => { const m = String(t || '').match(/https?:\/\/[^\s"<>]{4,500}/i); return m ? m[0].replace(/[).,;!?'"]+$/, '') : ''; };
  ACT.kcRecipeLink = () => {
    A.openSheet(`<h2>Recipe from a link</h2><p class="small muted">Paste the link of a recipe page or a YouTube cooking video. The AI opens it and reads the ingredients; GymDay counts them from its own food list.</p>
      <input class="input mt8" id="rcLink" type="url" inputmode="url" autocomplete="off" placeholder="https://…" enterkeyhint="go">
      <p class="xs dim mt8">Instagram and some other sites don't open for apps. If a link doesn't work, copy the recipe's text and use Paste one.</p>
      <div class="row mt16"><button class="btn" data-act="kcRecipeTab">Back</button><button class="btn primary grow" data-act="kcRecipeLinkGo">Read it</button></div>`,
      sh => { const i = sh.querySelector('#rcLink'); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.kcRecipeLinkGo(); }); });
  };
  ACT.kcRecipeLinkGo = () => { const u = linkIn(($('#rcLink') || {}).value); if (!u) { toast('Paste the whole link, starting with https://'); return; } recipeFrom({ url: u }); };

  // ---------------------------------------------------------------- v1.25: protein per meal
  // The last 14 days with food logged (not today, which isn't over): what each meal brought on the days it was eaten, against its
  // share of the day's protein target (the shares "What should I eat now?" uses). A main meal under 70% of its share, eaten on 3
  // or more of those days, is light. The fixes are the person's own foods of the last 60 days with the most protein for their calories.
  function proteinMeals(now) {
    const t0 = dayStartOf(now || Date.now()), tg = targets(t0), per = {};
    MEALS.forEach(m => { per[m[0]] = { days: 0, p: 0 }; });
    let days = 0, sum = 0;
    for (let i = 1; i <= 28 && days < 14; i++) {
      const dt = new Date(t0); dt.setDate(dt.getDate() - i);
      const d = C.dayOf(dt.getTime()); if (!d || !d.food || !d.food.length) continue;
      days++; sum += d.protein || 0;
      const seen = {};
      for (const e of d.food) { const m = mealOf(e); if (per[m]) { per[m].p += num(e.p); seen[m] = 1; } }
      Object.keys(seen).forEach(m => { per[m].days++; });
    }
    if (!tg || !(tg.p > 0)) return { days, none: 'target' };
    if (days < 3) return { days, none: 'days' };
    const rows = MEALS.map(([m]) => { const x = per[m], avg = x.days ? x.p / x.days : 0, aim = tg.p * SHARE[m], main = SHARE[m] >= 0.2; return { m, days: x.days, avg, aim, main, light: main && x.days >= 3 && avg < 0.7 * aim }; });
    return { days, tg, avgDay: sum / days, rows };
  }
  // something to add to the meal, not a second meal: at most 350 kcal, a good share of it protein; what fills more of the gap
  // and is richer in protein comes first, with a little extra for foods already eaten at that meal
  function proteinFix(m, gap) {
    gap = Math.max(5, gap || 0);
    return history(60).filter(h => h.e.src !== 'left' && !h.e.sp && h.e.kcal > 0 && h.e.kcal <= 350 && num(h.e.p) >= 4 && num(h.e.p) * 4 / h.e.kcal >= 0.18 && !(h.e.items && h.e.items.length > 1))
      .map(h => ({ e: h.e, sc: 0.6 * Math.min(1, num(h.e.p) / gap) + 0.3 * Math.min(1, num(h.e.p) * 4 / h.e.kcal / 0.6) + (mealOf(h.e) === m ? 0.1 : 0) }))
      .sort((a, b) => b.sc - a.sc).slice(0, 3).map(x => x.e);
  }
  // ---------------------------------------------------------------- v1.27: Fuel for today's workout (Trainer mode only)
  // What to eat before and after today's workout, timed to when the person usually trains (the middle start time of their last
  // 10 workouts; at least 3 are needed). Following the ISSN position stand on nutrient timing (2017): a meal with carbohydrate
  // and some protein in the hours before, something small and easy (mostly carbohydrate) in the last hour, and 20–40 g of
  // protein afterwards (about 0.3 g for each kg of body weight). The foods come from the person's own log of the last 60 days,
  // at the amount they last had; nothing is added without a tap.
  const fuelOn = () => !!D.settings.trainer;
  function usualStart() {
    const ss = D.sessions.slice().sort((a, b) => b.start - a.start).slice(0, 10).map(x => { const d = new Date(x.start); return d.getHours() * 60 + d.getMinutes(); });
    if (ss.length < 3) return null; ss.sort((a, b) => a - b); return ss[Math.floor((ss.length - 1) / 2)];
  }
  const hm = m => { let h = Math.floor(m / 60) % 24; const mm = m % 60, ap = h < 12 ? 'am' : 'pm'; h = h % 12 || 12; return `${h}:${mm < 10 ? '0' : ''}${mm} ${ap}`; };
  function fuelState(now) {
    now = now || Date.now();
    if (!fuelOn() || D.active) return null;
    const t0 = dayStartOf(now), mins = Math.round((now - t0) / 60000), today = D.sessions.filter(x => x.start >= t0 && x.start < t0 + DAY);
    const kg = (() => { const b = (D.body || []).filter(x => x.kg > 0).sort((x, y) => y.t - x.t)[0]; return b ? b.kg : 0; })();
    const pGoal = kg > 0 ? Math.max(15, Math.min(40, Math.round(kg * 0.3))) : 20;
    if (today.length) {
      const end = Math.max(...today.map(x => x.end || x.start));
      return now - end <= 3 * 3600000 ? { k: 'after', ago: Math.max(0, Math.round((now - end) / 60000)), pGoal, kg } : null;
    }
    const sched = !!D.settings.schedule, wk = D.settings.week || {};
    if (sched && !(wk[new Date(now).getDay()] && S.getDay(wk[new Date(now).getDay()]))) return null;      // a rest day in the weekly plan
    if (!sched && D.sessions.filter(x => x.start >= now - 14 * DAY).length < 2) return null;
    const u = usualStart(); if (u == null) return null;
    const until = u - mins;
    if (until > 240 || until < -30) return null;
    return { k: until > 60 ? 'meal' : 'snack', at: u, until, pGoal, kg };
  }
  let fuelList = [];
  function fuelFoods(st) {
    const share = (e, k, f) => num(e[k]) * f / Math.max(1, e.kcal);
    const h = history(60).map(x => x.e).filter(e => e.src !== 'left' && !e.sp && e.kcal > 0 && !(e.items && e.items.length > 1));
    let list;
    if (st.k === 'meal') list = h.filter(e => e.kcal >= 250 && e.kcal <= 700 && share(e, 'c', 4) >= 0.45 && share(e, 'f', 9) <= 0.3).sort((a, b) => Math.abs(a.kcal - 450) - Math.abs(b.kcal - 450));
    else if (st.k === 'snack') list = h.filter(e => e.kcal >= 60 && e.kcal <= 250 && share(e, 'c', 4) >= 0.55 && share(e, 'f', 9) <= 0.25 && num(e.fib) <= 4).sort((a, b) => share(b, 'c', 4) - share(a, 'c', 4) || a.kcal - b.kcal);
    else list = h.filter(e => num(e.p) >= st.pGoal * 0.6 && e.kcal <= 650).sort((a, b) => Math.abs(num(a.p) - st.pGoal) - Math.abs(num(b.p) - st.pGoal) || num(b.p) * 4 / b.kcal - num(a.p) * 4 / a.kcal);
    return list.slice(0, 2);
  }
  function fuelHtml(st, inSheet) {
    const C0 = window.Calories, cal = !!(C0 && C0.on && C0.on());
    const say = st.k === 'after' ? `<b>After your workout${st.ago > 5 ? ` (${st.ago < 60 ? st.ago + ' min' : Math.round(st.ago / 60) + ' h'} ago)` : ''}:</b> about ${st.pGoal} g of protein${st.kg ? ` (0.3 g for each of your ${Math.round(st.kg)} kg)` : ''}, with some carbs, within the next couple of hours.`
      : st.k === 'meal' ? `<b>Before your workout</b> <span class="muted">(you usually start at ${hm(st.at)}, in about ${st.until >= 90 ? Math.round(st.until / 60) + ' h' : st.until + ' min'})</span>: a normal meal with carbs and some protein, not too heavy on fat or fibre.`
      : `<b>${st.until > 0 ? `Your workout is in about ${st.until} min` : 'Workout time'}</b> <span class="muted">(you usually start at ${hm(st.at)})</span>: if you are hungry, something small and easy, mostly carbs, like a banana or toast.`;
    const foods = cal ? fuelFoods(st) : [];
    fuelList = foods;
    return `<div class="small${inSheet ? '' : ' mt4'}">${say}</div>${foods.length ? `<div class="fu-list mt8">${foods.map((e, i) => `<div class="list-item"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(e.name)}</div><div class="xs muted">${n0(e.kcal)} kcal${num(e.p) ? ` · ${g1(num(e.p))} g protein` : ''}${num(e.c) ? ` · ${g1(num(e.c))} g carbs` : ''}</div></div><button class="btn sm" data-act="fuelAdd" data-i="${i}">+ Add</button></div>`).join('')}</div>` : cal ? `<p class="xs muted mt8">Nothing in your last 60 days fits this well yet.</p>` : ''}`;
  }
  function fuelCard() {
    const st = fuelState(); if (!st) return '';
    return `<div class="card" id="fuelCard"><div class="k2">⚡ Fuel for today’s workout</div>${fuelHtml(st)}<p class="xs dim mt8">Trainer mode · timed to when you usually train · ideas, not rules.</p></div>`;
  }
  ACT.fuelAdd = el => {
    const e = fuelList[+el.dataset.i]; if (!e) return;
    const o = copyOf(e, dayStartOf(Date.now()), mealAt(Date.now())); delete o.ok; D.food.push(o); S.save(true); redraw();
    undoToast(`${o.name} added to ${MEAL_NAME[o.meal].toLowerCase()} · ${n0(o.kcal)} kcal`, () => { D.food = D.food.filter(y => y.id !== o.id); S.save(true); redraw(); });
  };
  if (window.Insights && window.Insights.homeCards) { const fh0 = window.Insights.homeCards; window.Insights.homeCards = () => fh0() + fuelCard(); }
  let pmList = [];
  function proteinSheet() {
    const r = proteinMeals(); pmList = [];
    let h = `<h2>Protein per meal</h2>`;
    if (r.none === 'target') h += `<p class="muted">Set your daily target first (the card at the top of the Food tab), so GymDay knows how much protein a day you are aiming for.</p>`;
    else if (r.none) h += `<p class="muted">Log your food on ${3 - r.days} more day${3 - r.days === 1 ? '' : 's'} and this shows which of your meals are light on protein.</p>`;
    else {
      const light = r.rows.filter(x => x.light), names = light.map(x => MEAL_NAME[x.m]).join(' and ');
      h += `<p class="small">${light.length ? `<b>${names}</b> ${light.length > 1 ? 'are' : 'is'} light on protein.` : 'None of your main meals is light on protein.'} <span class="muted">Your last ${r.days} logged days: ${n0(r.avgDay)} g a day, against a target of ${n0(r.tg.p)} g.</span></p><div class="card mt12">`;
      for (const x of r.rows) {
        if (!x.days && !x.main) continue;
        h += `<div class="pm-row ${x.light ? 'low' : ''}"><div class="row"><span class="grow small" style="font-weight:600">${MEAL_NAME[x.m]}</span><span class="small"><b>${g1(x.avg)}</b> of ${n0(x.aim)} g</span></div>
          <div class="bar mt4" role="img" aria-label="${n0(x.avg)} of ${n0(x.aim)} grams"><div style="width:${Math.min(100, x.aim ? x.avg / x.aim * 100 : 0).toFixed(0)}%"></div></div>
          <div class="xs muted mt4">${x.days ? `logged on ${x.days} of ${r.days} days` : 'not logged on these days'}${x.light ? ' · <b>light</b>' : ''}</div>`;
        if (x.light) {
          const fx = proteinFix(x.m, x.aim - x.avg);
          if (fx.length) h += `<div class="xs mt8">From what you eat, any one of these would lift it:</div>` + fx.map(e => { pmList.push({ e, m: x.m }); return `<div class="list-item tap" data-act="kcPmAdd" data-i="${pmList.length - 1}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(e.name)}</div><div class="xs muted ellipsis">${esc(e.per && !/^same as/.test(e.per) ? e.per + ' · ' : '')}${n0(e.kcal)} kcal</div></div><span class="small green" style="font-weight:700">+${g1(num(e.p))} g</span><span class="accent small" style="font-weight:700">Add</span></div>`; }).join('');
          else h += `<div class="xs muted mt8">Nothing you logged lately is rich in protein. Eggs, curd, paneer, dal, milk, chicken or fish would lift it.</div>`;
        }
        h += `</div>`;
      }
      h += `</div><p class="xs dim mt12">Each meal's aim is its usual share of your day's protein target: about a quarter at breakfast and at dinner, a third at lunch, the rest in snacks. Spreading protein over the day helps your muscles use it; the day's total still matters most. Add puts the food in today's meal.</p>`;
    }
    A.openSheet(h + `<button class="btn primary block mt16" data-act="closeSheet">Done</button>`);
  }
  ACT.kcProteinMeals = () => { if (C.toToday) C.toToday(); if (A.top().name !== 'calories') A.setRoot('calories'); proteinSheet(); };
  ACT.kcPmAdd = el => {
    const x = pmList[+el.dataset.i]; if (!x) return;
    const o = copyOf(x.e, dayStartOf(Date.now()), x.m); delete o.ok; D.food.push(o); S.save(true); redraw();
    A.closeSheet(); undoToast(`${o.name} added to ${MEAL_NAME[o.meal].toLowerCase()} · ${n0(o.kcal)} kcal`, () => { D.food = D.food.filter(y => y.id !== o.id); S.save(true); redraw(); });
  };

  // ---------------------------------------------------------------- v1.25: What can I make? (a photo of the fridge or a shelf)
  // The AI says what it can see and a few dishes as foods with grams. GymDay counts each dish from its own food list and says
  // whether it fits what is left of today; picking one opens it as lines to check and add, like a typed meal.
  const DIET_WORDS = { veg: 'vegetarian, no eggs', egg: 'vegetarian who eats eggs', nonveg: 'eats meat, fish and eggs' };
  let fridge = null;
  function dishNums(d) {
    let kcal = 0, p = 0, miss = 0;
    for (const x of d.items) { const lf = lineFood(x.name, num(x.grams)); if (lf) { kcal += lf.v.kcal; p += lf.v.p; } else miss++; }
    return { kcal: Math.round(kcal), p: Math.round(p), miss };
  }
  function fridgeSheet() {
    const fr = fridge; if (!fr) return;
    let h = `<h2>What can I make?</h2>`;
    if (fr.busy) h += `<p class="small muted mt12"><span class="kc-spin"></span> Looking at what you have… about 15 seconds.</p>`;
    else if (fr.err) h += `<p class="small mt12">${esc(fr.err)}</p><button class="btn primary block mt12" data-act="kcFridgeStart">📷 Try another photo</button>`;
    else {
      const w = whatNow(), mn = MEAL_NAME[fr.meal].toLowerCase(), budget = w && w.budget > 0 ? w.budget : 0;
      if (fr.seen.length) h += `<p class="small mt8"><span class="muted">I can see:</span> ${esc(fr.seen.join(', '))}.</p>`;
      if (w && !w.none) h += `<p class="small mt8">Left today: <b>${n0(Math.max(0, w.leftK))} kcal</b>${w.leftP > 0 ? ` and <b>${n0(w.leftP)} g</b> of protein` : ''}${budget ? `. A sensible ${mn}: about ${n0(budget)} kcal.` : '.'}</p>`;
      h += fr.dishes.map((d, i) => {
        const fit = !budget ? '' : d.kcal <= budget * 1.3 ? `<span class="kc-badge b-label">fits ${mn}</span>` : `<span class="kc-badge b-est">more than ${mn}'s share</span>`;
        return `<div class="card mt12 kc-dish"><div class="row" style="gap:8px;align-items:baseline"><div class="small grow" style="font-weight:700">${esc(d.name)}</div>${fit}</div>
          <div class="small mt4"><b>${n0(d.kcal)}</b> kcal · <b>${n0(d.p)}</b> g protein${d.mins ? ` · about ${n0(d.mins)} min` : ''}</div>
          <div class="xs muted mt4">${esc(d.items.map(x => `${x.name} ${n0(x.grams)} g`).join(' · '))}${d.miss ? ` · ${d.miss} not in the food list` : ''}</div>
          ${d.uses.length ? `<div class="xs muted mt4">Uses your ${esc(d.uses.join(', '))}</div>` : ''}
          ${d.how.length ? `<details class="mt8"><summary class="xs accent">How to make it</summary><ol class="xs" style="margin:6px 0 0 18px;padding:0">${d.how.map(s => `<li>${esc(s)}</li>`).join('')}</ol></details>` : ''}
          <button class="btn sm primary mt8" data-act="kcFridgeUse" data-i="${i}">Add to ${esc(mn)}</button></div>`;
      }).join('');
      h += `<p class="xs dim mt12">The dishes are the AI's ideas from your photo. The calories and protein are GymDay's own, counted from its food list for one serving, so check the amounts when you add one.</p>
        ${fr.note ? `<p class="xs muted mt4">${esc(fr.note)}</p>` : ''}<button class="btn block mt12" data-act="kcFridgeStart">📷 Another photo</button>`;
    }
    A.openSheet(h + `<button class="btn block mt8" data-act="closeSheet">Close</button>`);
  }
  // the camera for what is in front of you, or up to three pictures already taken
  ACT.kcFridgeStart = () => {
    A.openSheet(`<h2>What can I make?</h2><p class="muted small">A photo of the inside of your fridge, a kitchen shelf or your shopping. GymDay suggests a few dishes from what it can see and counts each one.</p>
      <div class="kc-ways mt16"><button class="kc-way" data-act="kcFridge" data-cam="1"><span>📷</span>Take a photo</button><button class="kc-way" data-act="kcFridge"><span>🖼</span>From the gallery</button></div>
      <p class="xs dim mt12">Best photo: the door open, the light on, labels facing you. The picture is sent to the AI service set up for your account, only to be read.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button></div>`);
  };
  ACT.kcFridge = async el => {
    const cam = !!(el && el.dataset && el.dataset.cam);
    const pics = await pickPhotos({ max: cam ? 1 : 3, camera: cam, side: 1400 }); if (!pics || !pics.length) return;
    if (C.toToday) C.toToday();
    const mine = fridge = { busy: true, meal: mealAt(Date.now()), seen: [], dishes: [], note: '' }; fridgeSheet();
    let r = null, err = '';
    try {
      const ctx = [DIET_WORDS[D.settings.diet] || '', 'wants enough protein'].filter(Boolean).join('; ');
      if (window.__fridgeAi) r = await window.__fridgeAi(pics.map(p => p.big), ctx);                                   // tests
      else {
        const Cl = window.Cloud;
        if (!Cl || !Cl.configured || !Cl.fridgeRead) err = "This needs the account's server.";
        else if (!Cl.signedIn()) err = 'Sign in (Settings → Account) to use What can I make?';
        else r = await Cl.fridgeRead(pics.map(p => p.big), ctx);
      }
      if (!DB) await loadDb();
    } catch (e) { err = (e && e.status === 404) ? "This isn't switched on for this account's server yet." : ((e && e.message) || "The photo couldn't be read just now. Try again."); }
    if (fridge !== mine) return;
    mine.busy = false;
    if (!r || !(r.dishes || []).length) { mine.err = err || 'No food could be made out in that photo. Try a closer photo with the light on.'; fridgeSheet(); return; }
    const budget = (whatNow() || {}).budget || 0;
    mine.seen = (r.seen || []).slice(0, 30); mine.note = String(r.note || '').slice(0, 200);
    mine.dishes = r.dishes.slice(0, 6).map(d => Object.assign({ name: String(d.name || 'Dish').slice(0, 60), uses: (d.uses || []).slice(0, 8), how: (d.how || []).slice(0, 5), mins: num(d.mins), items: (d.items || []).filter(x => x && x.name && num(x.grams) > 0).slice(0, 8) }))
      .filter(d => d.items.length).map(d => Object.assign(d, dishNums(d)));
    // the ones that fit this meal first, then the most protein
    mine.dishes.sort((a, b) => ((budget && a.kcal <= budget * 1.3 ? 0 : 1) - (budget && b.kcal <= budget * 1.3 ? 0 : 1)) || (b.p - a.p));
    if (!mine.dishes.length) mine.err = 'No dish could be worked out from that photo. Try another one.';
    fridgeSheet();
  };
  ACT.kcFridgeUse = el => {
    const fr = fridge, d = fr && fr.dishes[+el.dataset.i]; if (!d || !C.linesSheet) return;
    C.linesSheet({ items: d.items.map(x => ({ name: `${x.name}, ${Math.round(num(x.grams))} g` })), meal: fr.meal, title: d.name, note: 'From What can I make? Check the amounts against what you really serve yourself.' });
  };

  // =====================================================================================================
  // A meal again: repeat yesterday's, copy to today, save as a recipe, clear
  // =====================================================================================================
  const copyOf = (e, t0, meal) => { const o = Object.assign({}, e, { id: S.uid(), meal: meal || mealOf(e) }); o.t = stampMeal(o.meal, t0); delete o.u; delete o.pic; return o; };
  function mealList(t0, meal) { const d = C.dayOf(t0); return d.food.filter(e => mealOf(e) === meal); }
  const d0food = t0 => C.dayOf(t0).food.filter(e => e.src !== 'left');
  ACT.kcMealMenu = el => {
    const meal = el.dataset.meal, t0 = day0(), y = C.prevDay ? C.prevDay(t0) : t0 - DAY, mine = mealList(t0, meal), ys = mealList(y, meal), nm = MEAL_NAME[meal];
    const b = (act, label, sub) => `<div class="list-item tap" data-act="${act}" data-meal="${meal}"><div class="grow"><div class="small" style="font-weight:600">${label}</div>${sub ? `<div class="xs muted">${sub}</div>` : ''}</div><div class="accent">›</div></div>`;
    A.openSheet(`<h2>${nm}</h2>
      ${ys.length ? b('kcMealRepeat', `Repeat ${isToday(t0) ? "yesterday's" : 'the day before’s'} ${nm.toLowerCase()}`, ys.map(e => esc(e.name)).join(', ').slice(0, 120) + ` · ${n0(ys.reduce((a, e) => a + e.kcal, 0))} kcal`) : ''}
      ${mine.length && !isToday(t0) ? b('kcMealToday', 'Copy this meal to today', `as today's ${nm.toLowerCase()}`) : ''}
      ${mine.some(e => e.src !== 'left') ? b('kcMealDays', 'Copy to other days', 'the same meal on several days, a week either side') : ''}
      ${d0food(t0).length >= 2 ? b('kcSelStart', 'Select foods', 'tick several, then move, copy or delete them together') : ''}
      ${mine.some(e => e.src !== 'left') ? b('lvOpen', mine.some(e => e.src === 'left') ? 'Change the leftovers' : 'Leftovers', 'a photo of what is left on the plate, or its weight from your scale') : ''}
      ${mine.filter(e => e.src !== 'left').length >= 2 ? b('kcMealRecipe', 'Save this meal as a recipe', 'then it is one tap next time') : ''}
      ${mine.length ? b('kcMealClear', `Clear ${nm.toLowerCase()}`, `${mine.length} item${mine.length === 1 ? '' : 's'}`) : ''}
      ${!ys.length && !mine.length ? `<p class="small muted">Nothing here yet, and nothing in ${nm.toLowerCase()} the day before to repeat.</p>` : ''}
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="kcAdd" data-meal="${meal}">+ Add food</button></div>`);
  };
  ACT.kcMealRepeat = el => {
    const meal = el.dataset.meal, t0 = day0(), y = C.prevDay ? C.prevDay(t0) : t0 - DAY, ys = mealList(y, meal); if (!ys.length) return;
    const made = ys.filter(e => e.src !== 'left').map(e => log(copyOf(e, t0, meal))); A.closeSheet(); redraw();      // leftovers stay with the meal they were left from
    undoToast(`${MEAL_NAME[meal]} repeated · ${n0(made.reduce((a, e) => a + e.kcal, 0))} kcal`, () => { const ids = new Set(made.map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id)); S.save(true); redraw(); });
  };
  ACT.kcMealToday = el => {
    const meal = el.dataset.meal, mine = mealList(day0(), meal); if (!mine.length) return;
    const t = new Date(); t.setHours(0, 0, 0, 0); const made = mine.filter(e => e.src !== 'left').map(e => log(copyOf(e, t.getTime(), meal)));
    A.closeSheet(); toast(`Copied to today's ${MEAL_NAME[meal].toLowerCase()} · ${n0(made.reduce((a, e) => a + e.kcal, 0))} kcal`); redraw();
  };
  ACT.kcMealClear = el => {
    const meal = el.dataset.meal, mine = mealList(day0(), meal); if (!mine.length) return;
    const ids = new Set(mine.map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id)); S.save(true); A.closeSheet(); redraw();
    undoToast(`${MEAL_NAME[meal]} cleared`, () => { D.food.push(...mine); S.save(true); redraw(); });
  };
  ACT.kcMealRecipe = el => {
    const meal = el.dataset.meal, mine = mealList(day0(), meal); if (mine.length < 2) return;
    recipe = { name: MEAL_NAME[meal] + ' as usual', serves: 1, cooked: 0, meal, items: mine.filter(e => e.src !== 'left').map(e => { const o = Object.assign({}, e); delete o.id; delete o.t; delete o.meal; delete o.pic; delete o.u; return o; }) };
    recipeSheet();
  };
  ACT.kcCopyDay = () => {
    const t0 = day0(), y = C.prevDay ? C.prevDay(t0) : t0 - DAY, ys = C.dayOf(y).food; if (!ys.length) return;
    const made = ys.filter(e => e.src !== 'left').map(e => log(copyOf(e, t0))); redraw();
    undoToast(`Copied ${made.length} item${made.length === 1 ? '' : 's'} · ${n0(made.reduce((a, e) => a + e.kcal, 0))} kcal`, () => { const ids = new Set(made.map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id)); S.save(true); redraw(); });
  };

  // =====================================================================================================
  // Daily target sheet
  // =====================================================================================================
  ACT.kcPlan = () => {
    const pl = plan() || {}, goal = pl.goal || 'keep', a = auto(goal), cur = targets() || a || {}, young = ageNow() > 0 && ageNow() < 18;
    const fld = (id, label, v) => `<div class="grow"><label class="lbl">${label}</label><input class="input kp" id="${id}" type="number" inputmode="numeric" value="${v > 0 ? Math.round(v) : ''}" placeholder="–"></div>`;
    A.openSheet(`<h2>Daily target</h2>
      <label class="lbl">My goal</label><div class="row" style="gap:8px;flex-wrap:wrap" id="kpGoal">${GOALS.map(([k, nm]) => `<button class="chip ${goal === k ? 'on' : ''}" data-act="kcPlanGoal" data-v="${k}">${nm}</button>`).join('')}</div>
      <p class="xs muted mt8" id="kpNote">${a ? esc(a.note) + (a.guessKg ? ' Log your body weight for a closer number; 70 kg is assumed.' : '') : 'To work these out for you, add your height and age in About me. Or type your own numbers below.'}</p>
      ${young ? `<p class="xs mt8 kc-young">You're under 18 and still growing, so GymDay keeps any cut small and never sets a low target. Eating enough protein and energy matters more than the number on the scale.</p>` : ''}
      <div class="row mt12" style="gap:10px">${fld('kpKcal', 'Calories (kcal)', cur.kcal)}${fld('kpP', 'Protein (g)', cur.p)}</div>
      <div class="row mt8" style="gap:10px">${fld('kpC', 'Carbs (g)', cur.c)}${fld('kpF', 'Fat (g)', cur.f)}${fld('kpFib', 'Fibre (g)', cur.fib)}</div>
      <p class="xs dim mt8">${pl.auto === false ? 'These are your own numbers.' : 'Change any number to use your own; protein is about 1.6 g for each kg you weigh.'}</p>
      <div class="row mt16">${a ? `<button class="btn" data-act="kcPlanAuto">Work it out for me</button>` : `<button class="btn" data-act="kcMe">About me</button>`}<button class="btn primary grow" data-act="kcPlanSave">Save</button></div>
      ${plan() || st().kcGoal > 0 ? `<button class="btn block mt8 subtle" data-act="kcPlanOff">No target</button>` : ''}`,
      s => { s.dataset.goal = goal; s.dataset.typed = pl.auto === false ? '1' : ''; s.querySelector('.panel').addEventListener('input', e => { if (e.target.classList.contains('kp')) s.dataset.typed = '1'; }); });
  };
  ACT.kcPlanGoal = el => {
    const s = $('#sheet'); s.dataset.goal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el));
    const a = auto(el.dataset.v); if (!a) return;
    s.dataset.typed = ''; [['kpKcal', 'kcal'], ['kpP', 'p'], ['kpC', 'c'], ['kpF', 'f'], ['kpFib', 'fib']].forEach(([id, k]) => { const i = $('#' + id); if (i) i.value = a[k]; });
    const n = $('#kpNote'); if (n) n.textContent = a.note;
  };
  ACT.kcPlanAuto = () => { const s = $('#sheet'), el = s.querySelector(`[data-act="kcPlanGoal"][data-v="${s.dataset.goal}"]`); if (el) ACT.kcPlanGoal(el); };
  ACT.kcPlanSave = () => {
    const s = $('#sheet'), goal = s.dataset.goal || 'keep', v = id => Math.round(num(($('#' + id) || {}).value)), a = auto(goal);
    if (!s.dataset.typed && a) { const old = plan() || {}; st().kcPlan = Object.assign({ goal, auto: true }, old.auto && old.adj ? { adj: old.adj, adjAt: old.adjAt } : {}); st().kcGoal = 0; S.save(true); A.closeSheet(); toast('Target set'); redraw(); return; }
    const t = { goal, auto: false, kcal: v('kpKcal'), p: v('kpP'), c: v('kpC'), f: v('kpF'), fib: v('kpFib') };
    if (!(t.kcal >= 800 && t.kcal <= 10000)) { toast('A daily target is between 800 and 10,000 kcal'); return; }
    const young = ageNow() > 0 && ageNow() < 18, up = upkeep();
    if (young && up && t.kcal < up - 300) { toast(`While you're still growing, keep it within 300 kcal of what you use (about ${n0(up)})`); return; }
    for (const k of ['p', 'c', 'f', 'fib']) if (t[k] < 0 || t[k] > 1500) { toast("A number doesn't look right"); return; }
    st().kcPlan = t; st().kcGoal = t.kcal; S.save(true); A.closeSheet(); toast('Target saved'); redraw();
  };
  ACT.kcPlanOff = () => { delete st().kcPlan; st().kcGoal = 0; S.save(true); A.closeSheet(); toast('No daily target'); redraw(); };

  // =====================================================================================================
  // Barcodes and Open Food Facts
  // =====================================================================================================
  const OFF = 'https://world.openfoodfacts.org';
  const FIELDS = 'code,product_name,product_name_en,generic_name,brands,serving_size,serving_quantity,quantity,nutriments';
  async function getJson(url, ms) {
    const ctl = window.AbortController ? new AbortController() : null, tm = setTimeout(() => ctl && ctl.abort(), ms || 12000);
    try { const r = await fetch(url, { signal: ctl ? ctl.signal : undefined }); if (!r.ok) throw { status: r.status }; return await r.json(); }
    catch (e) { if (e && e.status === 404) return null; throw new Error("Couldn't reach Open Food Facts. Check the internet connection."); }
    finally { clearTimeout(tm); }
  }
  function parseOff(p) {
    if (!p) return null; const n = p.nutriments || {}, kc = (a, b) => (n[a] != null ? num(n[a]) : n[b] != null ? num(n[b]) / 4.184 : null);
    const k100 = kc('energy-kcal_100g', 'energy_100g'), kS = kc('energy-kcal_serving', 'energy_serving');
    const per = suf => ({ kcal: suf === '_100g' ? k100 : kS, p: num(n['proteins' + suf]), c: num(n['carbohydrates' + suf]), f: num(n['fat' + suf]), fib: num(n['fiber' + suf]), cr: 0 });
    const one = v => (Array.isArray(v) ? v[0] || '' : v || '');                                // the newer search gives lists
    const name = String(one(p.product_name) || one(p.product_name_en) || one(p.generic_name) || '').trim(), brand = String(one(p.brands)).split(',')[0].trim();
    if (!name && !brand) return null;
    const named = brand && name && fold(name).includes(fold(brand)) ? name : [brand, name].filter(Boolean).join(' ');       // "Haldiram Aloo Bhujia", not "Haldiram Haldiram …"
    return { code: String(p.code || ''), name: named.slice(0, 80) || 'Product', brand, product: name, serv: String(p.serving_size || '').slice(0, 30), servG: num(p.serving_quantity),
      per100: k100 != null ? per('_100g') : null, perServ: kS != null ? per('_serving') : null, qty: String(p.quantity || '') };
  }
  async function offProduct(code) {
    if (window.__off) return parseOff(await window.__off(code));                              // tests
    const j = await getJson(`${OFF}/api/v2/product/${encodeURIComponent(code)}.json?fields=${FIELDS}`);
    return j && j.status === 1 ? parseOff(j.product) : null;
  }
  // v1.11: Open Food Facts' newer search (search.openfoodfacts.org, quick, and it answers apps that aren't signed in);
  // the older one is tried if it fails. Indian products first; ones already in the built-in list are left out (they're above).
  async function offSearch(q) {
    let list;
    if (window.__offSearch) list = await window.__offSearch(q);                              // tests
    else {
      try { list = ((await getJson(`https://search.openfoodfacts.org/search?q=${encodeURIComponent(q)}&page_size=40&langs=en&fields=${FIELDS},countries_tags`, 12000)) || {}).hits || []; }
      catch (e) { list = null; }
      if (!list || !list.length) list = ((await getJson(`${OFF}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${FIELDS}`, 15000)) || {}).products || [];
    }
    const india = p => (Array.isArray(p.countries_tags) ? p.countries_tags : []).includes('en:india');
    const have = c => !!(DB && c && (DB.byId.has('p' + c) || DB.bc[c]));
    return list.slice().sort((a, b) => india(b) - india(a)).map(parseOff)
      .filter(p => p && !have(p.code) && (p.per100 && p.per100.kcal != null || p.perServ && p.perServ.kcal != null)).slice(0, 20);
  }
  // a scanned product is kept in My foods, so the next scan needs no internet
  function keepOff(p) {
    const f = offFood(p), u = f.units[0], v = times(f.base, u.f);
    const m = { id: S.uid(), name: p.name, code: p.code, per: unitText(u) === 'g' ? '100 g' : unitText(u), kcal: Math.round(v.kcal) };
    const pg = qtyG(p.qty); if (pg > 0) m.pack = pg;          // 1.21.1
    if (u.gram) { m.per = '100 g'; m.g = 100; const w = times(f.base, 1); m.kcal = Math.round(w.kcal); for (const k of ['p', 'c', 'f', 'fib']) if (w[k] > 0) m[k] = r1(w[k]); }
    else { if (u.g > 0) m.g = r1(u.g); for (const k of ['p', 'c', 'f', 'fib']) if (v[k] > 0) m[k] = r1(v[k]); }
    D.myFoods.push(m); S.save(true); return m;
  }
  // The number on a barcode: Play services' scanner on the phone, typed anywhere else (or when the scanner isn't there)
  let scanWait = null;
  window.onBarcode = (k, code, err) => { const w = scanWait; scanWait = null; if (w) w(code ? { code } : { err: err || 'cancelled' }); };
  function scanCode(why) {
    if (window.__scan) return Promise.resolve(window.__scan()).then(c => (c ? { code: String(c) } : { err: 'cancelled' }));      // tests
    if (S.isAndroid && window.Android && window.Android.scanBarcode) return new Promise(res => { scanWait = res; try { window.Android.scanBarcode(why || 'food'); } catch (e) { scanWait = null; res({ err: 'unavailable' }); } });
    return Promise.resolve({ err: 'unavailable' });
  }
  function typeCode(title, then) {
    A.openSheet(`<h2>${title}</h2><p class="muted small">Type the numbers under the barcode.</p>
      <input class="input mt8" id="kcCode" type="text" inputmode="numeric" maxlength="14" placeholder="e.g. 8901234567890" autocomplete="off">
      <div class="row mt16"><button class="btn" data-act="closeSheet">Cancel</button><button class="btn primary grow" data-act="kcCodeGo">Look it up</button></div>`,
      s => { s.dataset.next = then; const i = s.querySelector('#kcCode'); if (!('ontouchstart' in window)) i.focus(); });
  }
  // a barcode in the built-in list of Indian packs (v1.11): found without the internet; other pack sizes of a product too
  async function packOf(code) {
    try { await loadDb(); } catch (e) { return null; }
    const c = String(code || '').replace(/\D/g, ''); if (!c) return null;
    for (const t of [c, c.replace(/^0+/, ''), '0' + c]) { const x = DB.byId.get('p' + t) || (DB.bc[t] ? DB.byId.get(DB.bc[t]) : null); if (x) return x; }
    return null;
  }
  // a pack from the list, in the shape a product from Open Food Facts has (for a protein tub pinned from its barcode)
  function packAsOff(x, code) {
    const u = portionsOf(x.ps)[0], m = /\(([^)]*)\)/.exec(u ? u.label : '');
    const base = { kcal: x.kcal, p: x.p, c: x.c, f: x.f, fib: x.fib, cr: x.cr || 0 };
    return { code, name: x.name, brand: '', product: x.name, serv: u && /serving/.test(u.label) && m ? m[1] : '', servG: u && /serving/.test(u.label) ? u.g : 0, per100: base, perServ: null, qty: '' };
  }
  async function lookUp(code, forSupp) {
    const mine = D.myFoods.find(m => m.code === code);
    if (mine && !forSupp) { add = add || { meal: mealNow(), q: '', tab: 'my', cu: -1, online: [] }; return openPick(myFood(mine)); }
    const pack = await packOf(code);
    if (pack) {
      if (forSupp) return suppFromOff(packAsOff(pack, code));
      add = add || { meal: mealNow(), q: '', tab: 'my', cu: -1, online: [] }; return openPick(dbFood(pack));
    }
    toast('Looking up ' + code + '…');
    let p = null;
    try { p = await offProduct(code); } catch (e) { toast(e.message); if (forSupp) suppForm(Object.assign(suppDraft || {}, { code }), 'type'); return; }
    if (!p) { toast("That barcode isn't in Open Food Facts yet. Type it in instead."); if (forSupp) suppForm(Object.assign(suppDraft || {}, { code }), 'type'); else ownSheet({ name: '' }); return; }
    if (forSupp) return suppFromOff(p);
    add = add || { meal: mealNow(), q: '', tab: 'my', cu: -1, online: [] };
    openPick(offFood(p));
  }
  // started from the page (not from inside the add sheet): any earlier, closed add sheet's meal no longer counts
  const fromPage = el => !(el && el.closest && el.closest('.kc-add'));
  const photo0 = ACT.kcPhoto;
  if (photo0) ACT.kcPhoto = (el, e, o) => { if (fromPage(el)) add = null; return photo0(el, e, o); };
  ACT.kcScan = async el => {
    const forSupp = !!(el && el.dataset && el.dataset.for === 'supp');
    if (!forSupp && fromPage(el)) add = null;
    const r = await scanCode(forSupp ? 'supp' : 'food');
    if (r.code) return lookUp(r.code, forSupp);
    if (r.err === 'cancelled') return;
    if (r.err === 'not_product') toast("That isn't a product barcode");
    if (r.err === 'downloading') toast('Google Play is getting the barcode scanner ready. Try again in a minute, or type the number now.');
    typeCode(forSupp ? 'Barcode on the packet' : 'Barcode', forSupp ? 'supp' : 'food');
  };
  ACT.kcCodeGo = () => {
    const c = String(($('#kcCode') || {}).value || '').replace(/\D/g, ''), forSupp = $('#sheet').dataset.next === 'supp';
    if (c.length < 6 || c.length > 14) { toast('A barcode has 8 to 14 numbers'); return; }
    lookUp(c, forSupp);
  };

  // =====================================================================================================
  // Supplements: protein, creatine and others, pinned at the top of the food page
  // =====================================================================================================
  let suppDraft = null;          // { id?, kind, brand, name, serv, g, kcal, p, c, f, fib, cr, pic, thumb, code, read (what the AI read) }
  // a photo of the packet, made smaller first: 1200 px to read the small print, and a thumbnail kept on this phone
  function shrink(img, side, q) {
    const k = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight)), c = document.createElement('canvas');
    c.width = Math.max(1, Math.round(img.naturalWidth * k)); c.height = Math.max(1, Math.round(img.naturalHeight * k));
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q);
  }
  function pickPhoto(camera) {
    const load = src => new Promise(res => { const img = new Image(); img.onload = () => { try { res({ big: shrink(img, 1200, 0.85), thumb: shrink(img, 160, 0.6) }); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; });
    if (window.__pickImage) return Promise.resolve(window.__pickImage(camera)).then(d => (d ? load(d).then(r => r || { big: d, thumb: d }) : null));      // tests
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (camera) inp.setAttribute('capture', 'environment'); inp.style.display = 'none'; document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]; inp.remove(); if (!f) { resolve(null); return; }
        const url = URL.createObjectURL(f); load(url).then(r => { URL.revokeObjectURL(url); if (!r) toast("That picture couldn't be opened"); resolve(r); });
      });
      inp.click();
    });
  }
  // v1.12: one photo or several (up to max) of the same meal or product, each made smaller first: [{ big, thumb }].
  // The gallery lets you pick several at once; the camera takes one at a time, and "+ Add a photo" adds the next.
  // v1.27: pictures handed over as data (shared to GymDay from another app), made smaller the same way: [{ big, thumb }]
  async function picsFrom(list, o) {
    o = o || {}; const side = o.side || 1200, q = o.q || 0.85, out = [];
    const load = src => new Promise(res => { const img = new Image(); img.onload = () => { try { res({ big: shrink(img, side, q), thumb: shrink(img, 160, 0.6) }); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; });
    for (const x of (list || []).slice(0, 4)) { if (typeof x !== 'string' || !/^data:image\//.test(x)) continue; out.push((await load(x)) || { big: x, thumb: x }); }
    return out;
  }
  async function pickPhotos(o) {
    o = o || {};
    // 1.35.2: every picture picked here is for GymDay's server to read: an account and a yes to AI reading come first
    if (!o.noAi && window.__calm !== false && window.Cloud && window.Cloud.aiReady && !(await window.Cloud.aiReady(o.what))) return [];      // (tests with __calm = false: as before)
    // 1.35.2 (60): up to 10 for watch screenshots (o.limit: the most the caller takes in all, for the message)
    const max = Math.max(1, Math.min(10, o.max || 1)), side = o.side || 1200, q = o.q || 0.85;
    const load = src => new Promise(res => { const img = new Image(); img.onload = () => { try { res({ big: shrink(img, side, q), thumb: shrink(img, 160, 0.6) }); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; });
    if (window.__pickImage) return Promise.resolve(window.__pickImage(!!o.camera, max)).then(async d => {          // tests: one picture, or a list of them
      const out = []; for (const x of (Array.isArray(d) ? d : d ? [d] : []).slice(0, max)) out.push((await load(x)) || { big: x, thumb: x }); return out;
    });
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none';
      if (o.camera) inp.setAttribute('capture', 'environment'); else if (max > 1) inp.multiple = true;
      document.body.appendChild(inp);
      inp.addEventListener('change', async () => {
        const fs = Array.from(inp.files || []); inp.remove();
        if (fs.length > max) toast(`Up to ${o.limit || 4} ${o.limit > 4 ? 'screenshots' : 'photos'}: ${max === 1 ? 'the first one is' : `the first ${max} are`} used`);
        const out = [];
        for (const f of fs.slice(0, max)) { const url = URL.createObjectURL(f); const r = await load(url); URL.revokeObjectURL(url); if (r) out.push(r); }
        if (fs.length && !out.length) toast(fs.length > 1 ? "Those pictures couldn't be opened" : "That picture couldn't be opened");
        resolve(out);
      });
      inp.click();
    });
  }
  // the photos of one meal or product side by side, each with an ✕ (del: its action), and room for more (add: its action)
  function photoStrip(pics, o) {
    o = o || {};
    return `<div class="kc-strip${o.tall ? ' tall' : ''}">${pics.map((x, i) => `<div class="kc-sp"><img src="${x.big || x.thumb}" alt="${esc(o.what || 'Photo')} ${i + 1}"><span class="kc-sp-n">${i + 1}</span>${o.del && pics.length > 1 ? `<button class="kc-sp-x" data-act="${o.del}" data-i="${i}" aria-label="Remove ${esc((o.what || 'photo').toLowerCase())} ${i + 1}">✕</button>` : ''}</div>`).join('')}${o.add && pics.length < (o.max || 4) ? `<button class="kc-sp-add" data-act="${o.add}"><span>+</span>${esc(o.addText || 'Add a photo')}<small>${pics.length} of 4</small></button>` : ''}</div>`;
  }
  const bigsOf = d => (d.pics && d.pics.length ? d.pics.map(x => x.big) : d.big ? [d.big] : []);
  // answers: the person's answers to the AI's questions (the second read), or nothing (the first read, which may ask)
  // v1.12: dataUrl can be a list: several photos of the same packet (the front and the back), read together
  function readLabel(dataUrl, answers) {
    const list = Array.isArray(dataUrl) ? dataUrl : [dataUrl];
    if (window.__labelAi) return Promise.resolve(window.__labelAi(list.length > 1 ? list : list[0], answers));              // tests
    const Cl = window.Cloud;
    if (!Cl || !Cl.configured || !Cl.labelPhoto) return Promise.reject({ quiet: true, message: 'Type what the label says.' });
    if (!Cl.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have the label read for you. For now, type what it says.' });
    const raw = list.map(x => String(x).replace(/^data:image\/\w+;base64,/, ''));
    return Cl.labelPhoto(raw.length > 1 ? raw : raw[0], answers ? { answers } : { ask: ASK }).catch(e => {
      if (e && e.status === 404) throw { message: "Reading labels isn't switched on for this account's server yet. Type what it says." };
      const msg = (e && e.message) || "The label couldn't be read.";
      throw { message: /\btype\b/i.test(msg) ? msg : msg + ' You can type it instead.' };
    });
  }
  const SFIELDS = [['spKcal', 'kcal', 'Calories'], ['spP', 'p', 'Protein (g)'], ['spC', 'c', 'Carbs (g)'], ['spF', 'f', 'Fat (g)'], ['spFib', 'fib', 'Fibre (g)'], ['spCr', 'cr', 'Creatine (g)']];
  function suppStart() {
    const k = (suppDraft && suppDraft.kind) || 'protein';
    A.openSheet(`<h2>Add a supplement</h2><p class="muted small">Pinned at the top of your food page: one tap adds a serving, and it counts in your calories and protein.</p>
      <label class="lbl mt12">What is it</label><div class="row" style="gap:8px;flex-wrap:wrap" id="spKind">${Object.entries(KIND).map(([v, nm]) => `<button class="chip ${k === v ? 'on' : ''}" data-act="kcSuppKind" data-v="${v}">${nm}</button>`).join('')}</div>
      <div class="kc-ways mt16"><button class="kc-way" data-act="kcSuppPhoto" data-cam="1"><span>📷</span>Photo of the label</button><button class="kc-way" data-act="kcSuppPhoto"><span>🖼</span>From the gallery</button><button class="kc-way" data-act="kcScan" data-for="supp"><span>▥</span>Barcode</button><button class="kc-way" data-act="kcSuppType"><span>✎</span>Type it</button></div>
      <p class="xs dim mt12">Best photo: the nutrition table on the back, flat and in focus. The picture is sent to the AI service set up for your account, only to be read.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button></div>`);
  }
  ACT.kcSuppNew = () => { suppDraft = { kind: 'protein' }; suppStart(); };
  ACT.kcSuppKind = el => { suppDraft = suppDraft || {}; suppDraft.kind = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.kcSuppType = () => { suppForm(Object.assign({ serv: suppDraft && suppDraft.kind === 'creatine' ? '1 scoop' : '1 scoop' }, suppDraft || {}), 'type'); };
  ACT.kcSuppPhoto = async el => {
    const ds = (el && el.dataset) || {}, had = ds.more && suppDraft && suppDraft.pics ? suppDraft.pics : [];
    if (had.length >= 4) return;
    const got = await pickPhotos({ max: 4 - had.length, camera: !!ds.cam, side: 1200, q: 0.85 }); if (!got.length) return;
    if (ds.more && (!suppDraft || suppDraft.pics !== had)) return;                       // the sheet was closed meanwhile
    const pics = had.concat(got).slice(0, 4);
    const mine = suppDraft = Object.assign(suppDraft || { kind: 'protein' }, { pics, thumb: pics[0].thumb, big: pics[0].big, busy: true, note: '', again: false });
    readSuppPics(mine);
  };
  // the label's photos, read together (again after one is added or taken out)
  async function readSuppPics(mine) {
    mine.busy = true; mine.again = false; mine.note = '';
    suppForm(mine, 'reading');
    let r;
    try { r = await readLabel(bigsOf(mine)); }
    catch (e) { if (suppDraft !== mine) return; mine.busy = false; mine.note = (e && e.message) || 'Type what the label says.'; suppForm(mine, 'type'); return; }
    if (suppDraft !== mine) return;
    mine.busy = false;
    const qs = askList(r);
    if (!qs.length) { useLabel(mine, r); return; }
    // part of it couldn't be read: the AI's questions first, then a second read with the answers
    ask({ qs, img: mine.big, intro: "Part of the label couldn't be read. Tap an answer, or type your own.",
      done: async answers => {
        if (suppDraft !== mine) return;
        mine.busy = true; mine.again = true; suppForm(mine, 'reading');
        let r2;
        try { r2 = await readLabel(bigsOf(mine), answers); }
        catch (e) { if (suppDraft !== mine) return; useLabel(mine, r, r && r.label ? "It couldn't read the label again just now, so this is what it read the first time." : "It couldn't read the label again just now. Type what it says."); return; }
        if (suppDraft !== mine) return;
        mine.busy = false; useLabel(mine, r2 && r2.label ? r2 : r);
      },
      skip: () => { if (suppDraft === mine) useLabel(mine, r); },
      cancel: () => { if (suppDraft === mine) suppDraft = null; } });
  }
  ACT.kcSuppPicDel = el => {
    const d = suppDraft; if (!d || d.busy || !d.pics || d.pics.length < 2) return;
    d.pics.splice(+el.dataset.i, 1); d.thumb = d.pics[0].thumb; d.big = d.pics[0].big;
    readSuppPics(d);
  };
  // what the AI read (r = the server's answer), shown back for a yes or no; nothing usable: typing it in
  function useLabel(mine, r, note) {
    const L = (r && r.label) || {};
    const got = { brand: String(L.brand || '').slice(0, 40), name: String(L.product || L.name || '').slice(0, 60), serv: String(L.serving_label || L.serving || '').slice(0, 30), g: num(L.serving_g),
      kcal: num(L.kcal), p: num(L.protein != null ? L.protein : L.p), c: num(L.carbs != null ? L.carbs : L.c), f: num(L.fat != null ? L.fat : L.f), fib: num(L.fibre != null ? L.fibre : L.fiber != null ? L.fiber : L.fib), cr: num(L.creatine_g != null ? L.creatine_g : L.cr) };
    if (L.kind && KIND[L.kind]) got.kind = L.kind;
    mine.busy = false;
    if (got.brand || got.name || got.kcal || got.p || got.cr) { mine.read = got; Object.assign(mine, got); if (!mine.serv) mine.serv = '1 scoop'; mine.note = note || (r && r.note ? String(r.note).slice(0, 200) : ''); suppForm(mine, 'confirm'); }
    else { mine.note = note || "The label couldn't be read from that photo. Type what it says, or try a sharper photo of the nutrition table."; suppForm(mine, 'type'); }
  }
  function suppFromOff(p) {
    const d = Object.assign(suppDraft || { kind: 'protein' }, { code: p.code, brand: p.brand, name: p.product || p.name });
    const per = p.perServ && p.perServ.kcal != null ? p.perServ : null, k = per ? 1 : p.servG > 0 ? p.servG / 100 : null;
    const v = per || (k && p.per100 ? times(p.per100, k) : null);
    d.serv = p.serv ? (/scoop/i.test(p.serv) ? p.serv : '1 serving (' + p.serv + ')') : '1 scoop'; if (p.servG > 0) d.g = r1(p.servG);
    if (v) { d.kcal = Math.round(v.kcal || 0); d.p = r1(v.p); d.c = r1(v.c); d.f = r1(v.f); d.fib = r1(v.fib); }
    d.read = v ? { brand: d.brand, name: d.name, serv: d.serv, g: d.g, kcal: d.kcal, p: d.p, c: d.c, f: d.f, fib: d.fib, cr: d.cr || 0 } : null;
    d.note = v ? 'From Open Food Facts.' : "Open Food Facts knows this product but not what one serving holds. Type it from the label.";
    suppDraft = d; suppForm(d, v ? 'confirm' : 'type');
  }
  // mode: reading (the AI is reading the photo) · confirm (show what was read: right or not?) · type (a form to fill in or correct)
  function suppForm(d, mode) {
    suppDraft = d; const keep = d, im = d.big || d.thumb || (d.pic ? S.loadPhoto(d.pic) : '');      // the big picture to check against; only the thumbnail is kept
    const kindRow = `<div class="row" style="gap:8px;flex-wrap:wrap">${Object.entries(KIND).map(([v, nm]) => `<button class="chip ${d.kind === v ? 'on' : ''}" data-act="kcSuppKind" data-v="${v}">${nm}</button>`).join('')}</div>`;
    let body;
    if (mode === 'reading') body = `<div class="kc-ai"><span class="kc-spin"></span> ${d.again ? 'Reading the label again with your answers…' : 'Reading the label…'}<div class="xs dim mt4">Brand, serving size and what one serving holds.</div></div>`;
    else if (mode === 'confirm') {
      const r = d.read || d, line = (k, label, unit) => (num(r[k]) > 0 ? `<div class="kc-read-r"><span>${label}</span><b>${g1(num(r[k]))}${unit}</b></div>` : '');
      body = `<p class="small mt8">${d.code && !d.thumb ? 'Found it' : 'This is what the label says'}. <b>Is it right?</b></p>
        <div class="kc-read"><div class="kc-read-h"><b>${esc(suppName(r) || 'Your supplement')}</b><span class="xs muted">${esc(KIND[d.kind] || '')}</span></div>
          <div class="kc-read-r"><span>One serving</span><b>${esc(r.serv || '1 scoop')}${num(r.g) > 0 ? ` · ${g1(num(r.g))} g` : ''}</b></div>
          ${line('kcal', 'Calories', ' kcal')}${line('p', 'Protein', ' g')}${line('c', 'Carbs', ' g')}${line('f', 'Fat', ' g')}${line('fib', 'Fibre', ' g')}${line('cr', 'Creatine', ' g')}</div>
        ${d.note ? `<p class="xs dim mt8">${esc(d.note)}</p>` : ''}
        <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="kcSuppNo">No, I'll type it</button><button class="btn grow" data-act="kcSuppFix">Change something</button></div>
        <button class="btn primary block mt8" data-act="kcSuppYes">Yes, save it</button>`;
    } else {
      const fld = ([id, k, label]) => `<div class="grow"><label class="lbl">${label}</label><input class="input" id="${id}" type="number" inputmode="decimal" step="any" value="${num(d[k]) > 0 ? g1n(num(d[k])) : ''}" placeholder="–"></div>`;
      body = `${d.note ? `<p class="xs ${d.read ? 'dim' : 'muted'} mt8">${esc(d.note)}</p>` : ''}
        <label class="lbl mt12">What is it</label>${kindRow}
        <div class="row mt12" style="gap:10px"><div class="grow"><label class="lbl">Brand</label><input class="input" id="spBrand" maxlength="40" value="${esc(d.brand || '')}" placeholder="e.g. MuscleBlaze"></div><div class="grow"><label class="lbl">Product</label><input class="input" id="spName" maxlength="60" value="${esc(d.name || '')}" placeholder="e.g. Biozyme Whey"></div></div>
        <div class="row mt8" style="gap:10px"><div class="grow"><label class="lbl">One serving is</label><input class="input" id="spServ" maxlength="30" value="${esc(d.serv || '1 scoop')}" placeholder="1 scoop"></div><div class="grow"><label class="lbl">It weighs (g)</label><input class="input" id="spG" type="number" inputmode="decimal" step="any" value="${num(d.g) > 0 ? g1n(num(d.g)) : ''}" placeholder="e.g. 33"></div></div>
        <p class="xs muted mt12">What one serving holds (the label's “per serving” column):</p>
        <div class="row" style="gap:10px">${SFIELDS.slice(0, 2).map(fld).join('')}</div>
        <div class="row mt8" style="gap:10px">${SFIELDS.slice(2, 5).map(fld).join('')}</div>
        <div class="row mt8" style="gap:10px">${fld(SFIELDS[5])}<div class="grow"></div></div>
        <div class="row mt16">${d.id ? `<button class="btn danger" data-act="kcSuppDel">Delete</button>` : `<button class="btn" data-act="closeSheet">Cancel</button>`}<button class="btn primary grow" data-act="kcSuppSave">Save and pin it</button></div>`;
    }
    const pics = !d.id && d.pics && d.pics.length ? d.pics : null, more = pics && mode !== 'reading' && pics.length < 4;
    const head = pics && pics.length > 1 ? photoStrip(pics, { what: 'Photo', del: mode === 'reading' ? '' : 'kcSuppPicDel', add: more ? 'kcSuppMore' : '', addText: 'Add a photo' })
      : im ? `<img class="kc-shot kc-pack" src="${im}" alt="The packet">${more ? `<button class="kc-addpic" data-act="kcSuppMore">+ Add another photo of the pack <span class="xs muted">· the front and the back are read together</span></button>` : ''}` : '';
    A.openSheet(`<h2>${d.id ? 'Change supplement' : mode === 'confirm' ? 'Check the label' : 'Your supplement'}</h2>${head}${body}`,
      null, () => { if (mode === 'reading' && suppDraft === keep && keep.busy) suppDraft = null; });      // closed while reading: the answer is dropped
  }
  ACT.kcSuppMore = () => ACT.kcSuppPhoto({ dataset: { more: '1' } });
  ACT.kcSuppYes = () => { if (!suppDraft) return; saveSupp(Object.assign({}, suppDraft, suppDraft.read || {}), true); };
  ACT.kcSuppFix = () => { if (suppDraft) suppForm(suppDraft, 'type'); };
  ACT.kcSuppNo = () => { if (!suppDraft) return; for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'cr', 'g']) delete suppDraft[k]; suppDraft.read = null; suppDraft.note = 'Type the numbers from the label: the “per serving” column.'; suppForm(suppDraft, 'type'); };
  ACT.kcSuppSave = () => {
    const d = suppDraft; if (!d) return;
    const v = id => num(($('#' + id) || {}).value), t = id => String(($('#' + id) || {}).value || '').trim();
    const o = Object.assign({}, d, { brand: t('spBrand').slice(0, 40), name: t('spName').slice(0, 60), serv: (t('spServ') || '1 scoop').slice(0, 30), g: v('spG') });
    SFIELDS.forEach(([id, k]) => { o[k] = v(id); });
    if (!o.brand && !o.name) { toast('Type its brand or name'); return; }
    if (o.kind === 'creatine' && !(o.cr > 0) && o.g > 0) o.cr = o.g;          // a scoop of creatine is creatine
    if (!(o.kcal > 0) && !(o.p > 0) && !(o.cr > 0)) { toast(o.kind === 'creatine' ? 'Type how many grams of creatine one serving has' : 'Type its calories and protein per serving'); return; }
    if (o.kcal > 2000 || o.p > 200 || o.cr > 50 || o.g > 1000) { toast("A number doesn't look right"); return; }
    saveSupp(o, false);
  };
  function saveSupp(o, confirmed) {
    const sp = { id: o.id || S.uid(), kind: KIND[o.kind] ? o.kind : 'other', brand: String(o.brand || '').slice(0, 40), name: String(o.name || '').slice(0, 60), serv: String(o.serv || '1 scoop').slice(0, 30), pin: true };
    for (const k of ['g', 'kcal', 'p', 'c', 'f', 'fib', 'cr']) { const x = num(o[k]); if (x > 0) sp[k] = k === 'kcal' ? Math.round(x) : r1(x); }
    if (!sp.brand && !sp.name) sp.name = KIND[sp.kind];
    if (o.code) sp.code = String(o.code);
    if (confirmed) sp.ok = 1;
    if (o.thumb) { const id = 'supp-' + sp.id; if (S.savePhoto(id, o.thumb) !== false) sp.pic = id; } else if (o.pic) sp.pic = o.pic;
    const i = D.supps.findIndex(x => x.id === sp.id); if (i >= 0) D.supps[i] = Object.assign({}, D.supps[i], sp); else D.supps.push(sp);
    S.save(true); suppDraft = null; A.closeSheet(); toast(`${suppName(sp)} pinned: tap it to add a serving`); redraw();
  }
  ACT.kcSuppEdit = (el, e) => { if (e) e.stopPropagation(); const sp = D.supps.find(x => x.id === el.dataset.id); if (!sp) return; suppForm(JSON.parse(JSON.stringify(sp)), 'type'); };
  ACT.kcSuppDel = () => {
    const d = suppDraft; if (!d || !d.id) return; const i = D.supps.findIndex(x => x.id === d.id); if (i < 0) return;
    const sp = D.supps.splice(i, 1)[0]; S.save(true); suppDraft = null; A.closeSheet(); redraw();
    undoToast(suppName(sp) + ' unpinned', () => { D.supps.splice(Math.min(i, D.supps.length), 0, sp); S.save(true); redraw(); });
  };
  // one tap: one serving, now (or in the usual meal on another day), with a way back
  ACT.kcSuppAdd = el => {
    const sp = D.supps.find(x => x.id === el.dataset.id); if (!sp) return;
    const t0 = day0(), meal = isToday(t0) ? mealAt(Date.now()) : 'b', e = log(entryOf(suppFood(sp), 1, 0, meal, stampMeal(meal, t0)));
    try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(8); } catch (x) { }
    redraw();
    undoToast(`${suppName(sp)}: ${sp.serv || '1 serving'} added${sp.kind === 'creatine' ? '' : ` · ${g1(num(sp.p))} g protein`}`, () => { D.food = D.food.filter(x => x.id !== e.id); S.save(true); redraw(); });
  };

  // v1.12: the − on a pinned card takes one serving back from the day shown: from the latest one first, with a way back
  ACT.kcSuppLess = (el, ev) => {
    if (ev && ev.stopPropagation) ev.stopPropagation();
    const sp = D.supps.find(x => x.id === el.dataset.id); if (!sp) return;
    const t0 = day0(), t1 = (() => { const x = new Date(t0); x.setDate(x.getDate() + 1); return x.getTime(); })(), fid = supId(sp.id);
    const e = D.food.filter(x => x.fid === fid && x.t >= t0 && x.t < t1).sort((a, b) => b.t - a.t)[0]; if (!e) return;
    const was = JSON.parse(JSON.stringify(e)), food = suppFood(sp), grams = e.un === 'g', one = grams ? num(sp.g) : 1, q = num(e.q) || 1;
    if (q - one > 0.001) {                                       // two scoops in one go: one scoop less
      const ui = Math.max(0, food.units.findIndex(u => u.label === e.un)), ne = entryOf(food, q - one, ui, e.meal, e.t);
      for (const k of ['kcal', 'p', 'c', 'f', 'fib', 'cr', 'g']) { if (ne[k] != null) e[k] = ne[k]; else delete e[k]; }
      e.q = ne.q; e.per = ne.per; S.save(true);
    } else { D.food = D.food.filter(x => x !== e); S.save(true); }
    try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(8); } catch (x) { }
    redraw();
    undoToast(`${suppName(sp)}: one ${String(sp.serv || 'serving').replace(/^1\s+/, '')} taken back`, () => { const i = D.food.findIndex(x => x.id === was.id); if (i >= 0) D.food[i] = was; else D.food.push(was); S.save(true); redraw(); });
  };

  // =====================================================================================================
  // When the AI can't tell (v1.8.1): it asks up to 3 questions with tap answers, then reads the photo again with
  // them. A choice can be typed instead ("Other…"), and "Skip, just guess" keeps its first guess.
  // Used by meal photos (calories.js) and label photos (below).
  // =====================================================================================================
  const ASK = 3;
  let asking = null;        // { qs, ans: [{ on: [choice indexes], other, typing }], done(answers), skip(), cancel(), moved }
  const clean = (v, n) => String(v == null ? '' : v).replace(/\s+/g, ' ').trim().slice(0, n);
  // the questions in the server's answer, checked again here: at most 3, each with up to 4 different choices
  function askList(r) {
    const out = [], qs = r && Array.isArray(r.questions) ? r.questions : [];
    for (const x of qs) {
      const q = clean(x && (x.q || x.question), 160); if (!q) continue;
      const options = [], seen = new Set();
      for (const o of Array.isArray(x.options) ? x.options : []) {
        const t = clean(typeof o === 'object' && o ? o.label || o.text : o, 50), k = t.toLowerCase();
        if (!t || seen.has(k) || /^(other|others|something else|not sure|don'?t know|skip)\b/i.test(t)) continue;
        seen.add(k); options.push(t); if (options.length === 4) break;
      }
      out.push({ q, options, multi: !!x.multi && options.length > 1 });
      if (out.length === ASK) break;
    }
    return out;
  }
  function askOne(a, i) {
    const x = a.qs[i], s = a.ans[i];
    return `<div class="kc-q" data-qi="${i}"><div class="kc-q-t">${a.qs.length > 1 ? `<span class="kc-q-n">${i + 1}</span>` : ''}<span>${esc(x.q)}${x.multi ? ' <span class="xs dim">(pick any)</span>' : ''}</span></div>
      <div class="kc-q-o">${x.options.map((o, j) => `<button class="chip${s.on.includes(j) ? ' on' : ''}" data-act="kcQPick" data-qi="${i}" data-oi="${j}" aria-pressed="${s.on.includes(j)}">${esc(o)}</button>`).join('')}${x.options.length ? `<button class="chip${s.typing ? ' on' : ''}" data-act="kcQOther" data-qi="${i}" aria-pressed="${s.typing}">Other…</button>` : ''}</div>
      <input class="input mt8${s.typing ? '' : ' hidden'}" data-kq="${i}" maxlength="80" placeholder="Type your answer" value="${esc(s.other)}" enterkeyhint="done" autocomplete="off"></div>`;
  }
  // o: { qs, img, title, intro, done(answers), skip(), cancel() }
  function ask(o) {
    const a = asking = { qs: o.qs, ans: o.qs.map(x => ({ on: [], other: '', typing: !x.options.length })), done: o.done, skip: o.skip, cancel: o.cancel, moved: false };
    A.openSheet(`<h2>${esc(o.title || 'A few quick questions')}</h2>${o.img ? `<img class="kc-shot kc-ask-img" src="${o.img}" alt="Your photo">` : ''}
      <p class="small muted mt8">${esc(o.intro || "The AI couldn't tell everything from the photo. Tap an answer, or type your own.")}</p>
      <div id="kcQs">${a.qs.map((x, i) => askOne(a, i)).join('')}</div>
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="kcQSkip">Skip, just guess</button><button class="btn primary grow" data-act="kcQDone">Done</button></div>`,
      s => s.querySelector('.panel').addEventListener('input', e => { const t = e.target, i = t && t.dataset ? t.dataset.kq : null; if (i == null || asking !== a || !a.ans[+i]) return; a.ans[+i].other = t.value; }),
      () => { if (asking === a && !a.moved) { asking = null; if (a.cancel) a.cancel(); } });       // closed: nothing is logged
  }
  function askRedraw(a, i, focus) {
    const el = document.querySelector(`#kcQs .kc-q[data-qi="${i}"]`); if (!el) return;
    el.outerHTML = askOne(a, i);
    if (focus) { const inp = document.querySelector(`#kcQs [data-kq="${i}"]`); if (inp) { inp.focus(); try { inp.setSelectionRange(inp.value.length, inp.value.length); } catch (e) { } } }
  }
  ACT.kcQPick = el => {
    const a = asking, i = +el.dataset.qi, j = +el.dataset.oi; if (!a || !a.qs[i]) return;
    const s = a.ans[i];
    if (a.qs[i].multi) s.on = s.on.includes(j) ? s.on.filter(x => x !== j) : s.on.concat(j).sort((p, q) => p - q);
    else { s.on = s.on.length === 1 && s.on[0] === j ? [] : [j]; s.typing = false; }      // one answer: tapping it again clears it
    askRedraw(a, i);
  };
  ACT.kcQOther = el => {
    const a = asking, i = +el.dataset.qi; if (!a || !a.qs[i]) return;
    const s = a.ans[i]; s.typing = !s.typing; if (s.typing && !a.qs[i].multi) s.on = [];
    askRedraw(a, i, s.typing);
  };
  // [{ q, a }]: the choices picked and anything typed; nothing → "Not sure"
  function answersOf(a) {
    return a.qs.map((x, i) => {
      const s = a.ans[i], typed = s.typing ? clean(s.other, 80) : '';
      return { q: x.q, a: s.on.map(j => x.options[j]).filter(Boolean).concat(typed ? [typed] : []).join(', ') || 'Not sure' };
    });
  }
  ACT.kcQDone = () => {
    const a = asking; if (!a) return;
    const ans = answersOf(a); a.moved = true; asking = null;
    if (ans.every(x => x.a === 'Not sure')) a.skip(); else a.done(ans);        // nothing answered: the first guess, without a second read
  };
  ACT.kcQSkip = () => { const a = asking; if (!a) return; a.moved = true; asking = null; a.skip(); };

  // =====================================================================================================
  // Press and hold a food, then drag it to another meal (v1.8.1). Order inside a meal stays by time.
  // Touch: hold still ~0.42 s (moving first is a scroll); mouse on a laptop: hold the button down the same time.
  // 1.21, smoother: the page only scrolls once the food is carried towards the top or bottom edge, at the same speed on
  // a 60, 90 or 120 Hz screen; the meal under the finger comes from the cards' boxes, so the outline doesn't blink off in
  // the gaps between cards; a redraw meanwhile (a sync, say) keeps hold of the food; on letting go the meal it went to
  // stays put on the screen and the food glides into its place (or back where it was, when nothing changes).
  // =====================================================================================================
  const HOLD = 420, SLOP = 6;           // SLOP: under the phone's own 8 px, so a scroll that has begun never turns into a drag
  let dg = null;            // { row, id, from, ghost, x, y, x0, y0, y1, target, raf, on, pid, moved, last, acc }
  let dragDone = 0;         // the tap that ends a drag must not also open the food
  const dgCalm = () => !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  const dgBuzz = ms => { try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  const rowAt = el => (el && el.closest ? el.closest('#kcFood .kc-meal .list-item[data-act="kcInfo"]:not(.kc-left)') : null);
  const foodRow = id => [...document.querySelectorAll('#kcFood .kc-meal .list-item[data-act="kcInfo"]')].find(r => r.dataset.id === id) || null;
  const mealCard = m => document.querySelector(`#kcFood .kc-meal[data-meal="${m}"]`);
  // where the bottom bar starts: nothing under it can take a drop, and the bottom scroll zone ends there
  const viewBottom = () => { const n = document.getElementById('nav'); if (n && !n.classList.contains('hidden')) { const r = n.getBoundingClientRect(); if (r.height > 0) return Math.min(window.innerHeight, r.top); } return window.innerHeight; };
  function mealCardAt(y) {
    y = Math.min(y, viewBottom() - 1);
    let best = null, bd = Infinity;
    for (const c of document.querySelectorAll('#kcFood .kc-meal')) {
      const r = c.getBoundingClientRect();
      if (y >= r.top && y <= r.bottom) return c;
      const d = y < r.top ? r.top - y : y - r.bottom; if (d < bd) { bd = d; best = c; }
    }
    return bd <= 28 ? best : null;          // in the gap between two cards: the nearer one, so the outline never blinks off
  }
  function dragArm(row, x, y, pid) {
    dragStop(false);
    dg = { row, id: row.dataset.id, from: row.closest('.kc-meal').dataset.meal, x, y, x0: x, y0: y, on: false, pid };
    dg.t = setTimeout(dragLift, HOLD);
  }
  function dragLift() {
    if (!dg || dg.on || !document.body.contains(dg.row)) { dragStop(false); return; }
    const r = dg.row.getBoundingClientRect(), g = dg.row.cloneNode(true);
    g.classList.add('kc-ghost'); g.style.transition = 'none'; g.removeAttribute('data-act'); g.removeAttribute('tabindex'); g.removeAttribute('role'); g.setAttribute('aria-hidden', 'true');
    g.style.left = r.left + 'px'; g.style.top = r.top + 'px'; g.style.width = r.width + 'px';
    const to = document.createElement('span'); to.className = 'kc-ghost-to'; g.appendChild(to);          // "→ Lunch" while over another meal
    document.body.appendChild(g);
    Object.assign(dg, { ghost: g, on: true, target: dg.from, y1: dg.y, moved: false, last: 0, acc: 0 });
    dg.row.classList.add('kc-lift'); document.body.classList.add('kc-dragging');
    dgBuzz(15);
    dragPaint(); dg.raf = requestAnimationFrame(dragTick);
  }
  function dragPaint() {
    if (!dg || !dg.on) return;
    dg.ghost.style.transform = `translate3d(0, ${dg.y - dg.y0}px, 0) scale(1.03)`;
    const card = mealCardAt(dg.y), meal = card ? card.dataset.meal : null;
    if (meal === dg.target && (!card || meal === dg.from || card.classList.contains('kc-drop'))) return;
    const other = !!card && meal !== dg.from, changed = meal !== dg.target;
    dg.target = meal;
    document.querySelectorAll('#kcFood .kc-meal.kc-drop').forEach(c => { if (c !== card || !other) c.classList.remove('kc-drop'); });
    if (other) { card.classList.add('kc-drop'); if (changed) dgBuzz(6); }
    const to = dg.ghost.querySelector('.kc-ghost-to'); if (to) to.textContent = other ? '→ ' + MEAL_NAME[meal] : '';
  }
  function dragTick(now) {
    if (!dg || !dg.on) return;
    const dt = dg.last ? Math.min(48, Math.max(0, now - dg.last)) : 16; dg.last = now;
    if (!dg.moved && Math.abs(dg.y - dg.y1) > 14) dg.moved = true;           // nothing scrolls until the food is really carried
    const bot = viewBottom(), zone = Math.min(110, bot * 0.16);
    let v = 0;                                                                // px a second; up is negative
    if (dg.moved) {
      // only towards the way the food went: lifted low on the screen and carried up, the page doesn't run downwards
      if (dg.y < zone && dg.y < dg.y1 - 6) v = -Math.min(1, (zone - dg.y) / zone);
      else if (dg.y > bot - zone && dg.y > dg.y1 + 6) v = Math.min(1, (dg.y - (bot - zone)) / zone);
      v = v ? Math.sign(v) * (140 + 1060 * v * v) : 0;
    }
    if (v) {
      dg.acc += v * dt / 1000;
      const step = dg.acc < 0 ? Math.ceil(dg.acc) : Math.floor(dg.acc);
      if (step) { const sy = window.scrollY; window.scrollBy(0, step); dg.acc -= step; if (window.scrollY === sy) dg.acc = 0; }
    } else dg.acc = 0;
    dragPaint(); dg.raf = requestAnimationFrame(dragTick);
  }
  // the ghost glides onto a row's place, then goes; with "reduce motion" it simply goes
  function settle(g, row, done) {
    if (!g) { if (done) done(); return; }
    const r = row && document.body.contains(row) ? row.getBoundingClientRect() : null;
    let fin = false; const end = () => { if (fin) return; fin = true; g.remove(); if (done) done(); };
    if (!r || !r.height || dgCalm()) { end(); return; }
    g.style.transition = 'transform .17s cubic-bezier(.2, .8, .2, 1), box-shadow .17s';
    g.style.transform = `translate3d(0, ${r.top - (parseFloat(g.style.top) || 0)}px, 0) scale(1)`; g.style.boxShadow = 'none';
    g.addEventListener('transitionend', end, { once: true }); setTimeout(end, 220);
  }
  function dragStop(commit) {
    if (!dg) return; const d = dg; dg = null;
    clearTimeout(d.t); cancelAnimationFrame(d.raf);
    if (!d.on) return;
    dragDone = Date.now();
    document.body.classList.remove('kc-dragging');
    document.querySelectorAll('#kcFood .kc-meal.kc-drop').forEach(c => c.classList.remove('kc-drop'));
    if (commit && d.target && d.target !== d.from && MEAL_NAME[d.target]) { moveTo(d.id, d.target, d.ghost, d.row); return; }
    const row = document.body.contains(d.row) ? d.row : foodRow(d.id);          // let go over its own meal (or nowhere): it floats back
    settle(d.ghost, row, () => { if (row) row.classList.remove('kc-lift'); if (d.row) d.row.classList.remove('kc-lift'); });
  }
  function moveTo(id, meal, ghost, oldRow) {
    const e = D.food.find(x => x.id === id); if (!e) { if (ghost) ghost.remove(); return; }
    if (oldRow) oldRow.classList.remove('kc-lift');
    const tops = {}; MEALS.forEach(([k]) => { const c = mealCard(k); if (c) tops[k] = c.getBoundingClientRect().top; });
    const was = e.meal; e.meal = meal; S.save(true); redraw();
    // the meal it went to stays where it was on the screen, however much the meals above it grew or shrank
    const c1 = mealCard(meal);
    if (c1 && tops[meal] != null) { const dy = c1.getBoundingClientRect().top - tops[meal]; if (Math.abs(dy) > 0.5) window.scrollBy(0, dy); }
    // the other meals slide to their new places instead of jumping there
    if (!dgCalm()) MEALS.forEach(([k]) => {
      const c = mealCard(k); if (!c || tops[k] == null || k === meal) return;
      const dy = tops[k] - c.getBoundingClientRect().top; if (Math.abs(dy) < 1 || Math.abs(dy) > window.innerHeight) return;
      c.style.transition = 'none'; c.style.transform = `translateY(${dy}px)`; void c.offsetWidth;
      c.style.transition = 'transform .2s cubic-bezier(.2, .8, .2, 1)'; c.style.transform = '';
      setTimeout(() => { c.style.transition = ''; }, 260);
    });
    const row = foodRow(id);
    if (row && ghost) { row.classList.add('kc-landing'); settle(ghost, row, () => row.classList.remove('kc-landing')); }
    else if (ghost) ghost.remove();
    undoToast(`${e.name} moved to ${MEAL_NAME[meal].toLowerCase()}`, () => { const x = D.food.find(y => y.id === id); if (!x) return; if (was) x.meal = was; else delete x.meal; S.save(true); redraw(); });
  }
  // the one-tap way, from a food's details (1.21): no dragging needed, and TalkBack can do it too
  ACT.kcMoveTo = el => {
    const id = el.dataset.id, m = el.dataset.v, e = D.food.find(x => x.id === id);
    if (!e || !MEAL_NAME[m] || mealOf(e) === m) return;
    infoId = null; A.closeSheet(); moveTo(id, m);
  };
  // touch. The finger's events keep going to the element it first touched, even after a redraw has taken that element
  // off the page, and from there they no longer reach the document; so they are also listened for on that element (1.21).
  let tEl = null;
  function tMove(e) {
    if (e.__kc) return; e.__kc = true;
    if (!dg || dg.pid !== 'touch') return;
    const t = e.touches[0]; if (!t) return; dg.x = t.clientX; dg.y = t.clientY;
    if (!dg.on) {          // still deciding: moving first, or the page already scrolling, means a scroll and not a drag
      if (!e.cancelable || Math.abs(dg.x - dg.x0) > SLOP || Math.abs(dg.y - dg.y0) > SLOP) dragStop(false);
      return;
    }
    if (e.cancelable) e.preventDefault();          // the food is held: the page must not scroll under the finger as well
  }
  function tEnd(e) {
    if (e.__kc) return; e.__kc = true;
    if (dg && dg.pid === 'touch') { if (e.changedTouches[0] && dg.on) { dg.x = e.changedTouches[0].clientX; dg.y = e.changedTouches[0].clientY; dragPaint(); } if (dg.on && e.cancelable) e.preventDefault(); dragStop(true); }
    untouch();
  }
  function tCancel(e) { if (e.__kc) return; e.__kc = true; if (dg && dg.pid === 'touch') dragStop(false); untouch(); }
  function untouch() { if (!tEl) return; tEl.removeEventListener('touchmove', tMove); tEl.removeEventListener('touchend', tEnd); tEl.removeEventListener('touchcancel', tCancel); tEl = null; }
  document.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { dragStop(false); return; }
    const row = rowAt(e.target); if (!row) return;
    untouch(); tEl = e.target;
    tEl.addEventListener('touchmove', tMove, { passive: false }); tEl.addEventListener('touchend', tEnd); tEl.addEventListener('touchcancel', tCancel);
    dragArm(row, e.touches[0].clientX, e.touches[0].clientY, 'touch');
  }, { passive: true });
  document.addEventListener('touchmove', tMove, { passive: false });          // (also what lets a held food stop the page scrolling)
  document.addEventListener('touchend', tEnd);
  document.addEventListener('touchcancel', tCancel);
  // mouse (the laptop copy)
  document.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse' || e.button !== 0) return;
    const row = rowAt(e.target); if (!row) return;
    dragArm(row, e.clientX, e.clientY, 'mouse');
  });
  document.addEventListener('pointermove', e => {
    if (!dg || dg.pid !== 'mouse' || e.pointerType !== 'mouse') return;
    dg.x = e.clientX; dg.y = e.clientY;
    if (!dg.on) { if (Math.abs(dg.x - dg.x0) > SLOP || Math.abs(dg.y - dg.y0) > SLOP) dragStop(false); return; }
    e.preventDefault();
  });
  document.addEventListener('pointerup', e => { if (dg && dg.pid === 'mouse' && e.pointerType === 'mouse') { dg.x = e.clientX; dg.y = e.clientY; dragPaint(); dragStop(true); } });
  document.addEventListener('click', e => { if (Date.now() - dragDone < 350 && rowAt(e.target)) { e.stopPropagation(); e.preventDefault(); dragDone = 0; } }, true);
  document.addEventListener('contextmenu', e => { if (rowAt(e.target)) e.preventDefault(); });       // a long press shows no menu
  document.addEventListener('dragstart', e => { if (rowAt(e.target)) e.preventDefault(); });        // nor starts the phone's own picture drag
  const after9 = A.afterRender;
  A.afterRender = name => {
    if (after9) after9(name);
    if (!dg || document.body.contains(dg.row)) return;
    const row = dg.on && name === 'calories' ? foodRow(dg.id) : null;          // drawn again mid-drag: keep hold of the same food
    if (!row) { dragStop(false); return; }
    dg.row = row; row.classList.add('kc-lift'); dg.target = undefined; dragPaint();
  };

  if (window.__recount !== false) setTimeout(() => { recount(); }, 2500);       // v1.14: past photo meals and typed foods, once (tests: __recount)
  // 1.35.2: Popular starts with what people here eat most days (it was A to Z: Ada pradhaman, Adai…), then the other Indian
  // dishes, then the rest, each name once
  const POP_TOP = ['chapati/roti', 'rice, white, cooked', 'dal', 'egg, whole, boiled', 'toned milk', 'curd (dahi)', 'banana, raw', 'idli', 'plain dosa', 'poha', 'upma',
    'paneer (cottage cheese)', 'chicken breast, grilled', 'chicken curry', 'sambar', 'plain parantha', 'egg omelet or scrambled', 'chai (milk tea', 'filter coffee', 'oatmeal porridge',
    'whey protein powder', 'peanut butter', 'almonds', 'apple, raw', 'kidney bean curry', 'chickpeas curry', 'soya chunks curry', 'chicken biryani', 'curd rice', 'masala dosa',
    'palak paneer', 'butter chicken', 'bread, wheat', 'buttermilk', 'sweet potato, boiled', 'potato, boiled', 'creatine monohydrate'];
  let popMemo = null;
  function popList() {
    if (popMemo && popMemo.db === DB) return popMemo.l;
    const all = DB.list.filter(x => x.pop), seen = new Set(), out = [], low = x => x.name.toLowerCase();
    const take = x => { const k = low(x); if (seen.has(k)) return; seen.add(k); out.push(x); };
    for (const t of POP_TOP) { const x = all.find(y => low(y) === t) || all.find(y => low(y).startsWith(t)); if (x) take(x); }
    all.slice().sort((a, b) => (a.cu === 0) - (b.cu === 0) || (a.key < b.key ? 1 : -1)).reverse().forEach(take);
    popMemo = { db: DB, l: out }; return out;
  }
  // 1.35.2: Add food shows Photo, Barcode, Type it and More; More shows the other five (Quick add, Recipe, Thali, Order, Compare)
  ACT.kcWaysAll = () => { if (!add) return; add.ways = true; addSheet(); };
  window.Food = { dym: (q, n) => didYouMean(q, n || 0), fuelState, fuelCard, menuFit, usual, picsFrom, proteinMeals, proteinFix, orderCalc, selOf, menuFresh: at => fresh(at), searchFresh: () => { sKept.clear(); sLast = null; }, openPick: (f, o) => openPick(f, o), packInfo, qtyG, offFood, smartRead, cafPer100, entryCaf, cafLimit, dayCaf, pickPhotos, photoStrip, tableFor, nameFor, matchLine, fixEntry, recount, RC, isAmt, lineFood, valuesAt, altsFor, searchList, findRows, usualOf, usualNow, whatNow, oilParts, oilLevel, setOil, MINE, mineUnit, portionsOf, rowById: id => (DB ? DB.byId.get(id) || null : null), dbReady: () => !!DB, dbRaw: () => DB, chainsOf: () => (DB ? chainsOf() : []), oilDelta, limitsFor, stampMeal, byName: n => (DB ? DB.list.find(x => x.name === n) || null : null), placeKeep, mealFor: () => (add && add.meal) || mealNow(), loadDb, search: (q, cu) => search(q, cu == null ? -1 : cu), dbFood, targets, auto, kcalMin, protMin, targetCard, pinsHtml, mealsHtml, mealAt, mealOf, MEALS, entryOf, amountText, fmtQ, offProduct, parseOff, totals, unitsOf: x => dbFood(x).units, myFood, recipeFood, suppFood, ASK, ask, askList };
})();
