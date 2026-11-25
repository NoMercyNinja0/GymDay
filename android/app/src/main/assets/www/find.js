/* GymDay 1.22 · Search everything from one box (find.js).
   The 🔍 at the top of every tab (and "Search" in the + sheet) opens one page that looks through: places in the app
   ("add an activity", "sleep", "body map"), every settings row, the exercises, the foods (yours first, then the food list),
   your days, your past workouts, and the Help page. A hit opens the thing itself: a setting opens its page with the row lit up,
   a food opens its amount sheet for today, a help answer opens at that question.
   Nothing here is synced or sent anywhere; the last few searches are kept on this phone (Store.meta.finds). */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, $$, esc, ACT, VIEWS } = A, D = S.data;
  const st = () => D.settings;
  const fold = s => String(s == null ? '' : s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9ऀ-෿]+/g, ' ').trim();
  const calOn = () => !!(window.Calories && window.Calories.on && window.Calories.on());
  const trainerOn = () => !!(window.Trainer && window.Trainer.on && window.Trainer.on());
  const recOn = () => st().recovery !== false;
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)
  let q = '', more = {}, hits = [], setIdx = null, wantFocus = false;

  // how well the typed words match a name (and its extra words): 0 = not at all
  function score(toks, name, extra) {
    const n = fold(name), nw = n.split(' '), xw = extra ? fold(extra).split(' ') : [];
    let sc = 0;
    for (const t of toks) {
      if (nw.some(w => w.startsWith(t))) sc += nw[0].startsWith(t) ? 12 : 8;
      else if (t.length >= 3 && n.includes(t)) sc += 5;
      else if (xw.some(w => w.startsWith(t))) sc += 3;
      else if (t.length >= 4 && xw.some(w => w.includes(t))) sc += 1;
      else return 0;
    }
    const all = toks.join(' ');
    if (n === all) sc += 20; else if (n.startsWith(all)) sc += 10;
    return sc;
  }

  // ---------------- places in the app ----------------
  const root = r => () => A.setRoot(r);
  const page = (r, v, p) => () => A.reset(r, v, p);
  const quick = to => () => ACT.quickGo({ dataset: { to } });
  const foodTab = fn => () => { ACT.openCalories(); setTimeout(fn, 40); };
  // [icon, title, more words to find it by, what it does, shown when]
  const DEST = [
    ['◎', 'Today', 'home dashboard rings summary start page', root('days')],
    ['🍽', 'Food', 'calories eaten meals breakfast lunch dinner snacks log diet', () => ACT.openCalories(), calOn],
    ['📚', 'Library', 'exercises list all movements', root('library')],
    ['👥', 'Clubs', 'friends club mates join code leaderboard', root('clubs')],
    ['📊', 'History', 'past workouts log calendar progress', root('history')],
    ['⚙️', 'Settings', 'options preferences', root('settings')],
    ['▶', 'Start a workout', 'begin train gym session next day', quick('workout')],
    ['＋', 'New day', 'create make a workout day routine split', () => { A.setRoot('days'); ACT.newDay(); }],
    ['🍽', 'Add food', 'log eat meal search food calories', quick('food'), calOn],
    ['📷', 'Meal photo', 'camera picture snap plate photo of food', quick('photo'), calOn],
    ['▥', 'Scan a barcode', 'packet packaged label scanner', quick('scan'), calOn],
    ['🍴', 'Eating out', 'restaurant menu cafe takeaway swiggy zomato dish', quick('out'), calOn],
    ['🏃', 'Add an activity', 'sport walk run swim cycle cricket football badminton yoga steps burnt cardio manual', quick('activity'), calOn],
    ['🔥', 'Calories burnt', 'burn everyday resting workouts watch active', foodTab(() => ACT.kcBurntWhy && ACT.kcBurntWhy()), calOn],
    ['🎯', 'Daily target', 'calorie goal gain lose cut bulk maintain keep weight plan protein target', foodTab(() => ACT.kcPlan && ACT.kcPlan()), calOn],
    ['🙂', 'About me', 'height age sex activity level body details', foodTab(() => ACT.kcMe && ACT.kcMe()), calOn],
    ['💊', 'Supplements', 'creatine whey protein powder vitamins tablets ors electrolyte caffeine', () => A.reset('calories', 'supps', { day: window.Supps.today() }), () => calOn() && !!window.Supps],
    ['🥦', 'Vitamins & minerals', 'micros iron calcium b12 vitamin d sodium salt potassium zinc magnesium', () => { A.setRoot('calories'); ACT.spMicro(); }, () => calOn() && !!window.Supps && !!ACT.spMicro],
    ['⚖', 'Body weight', 'weigh scale kg weight log chart trend', quick('weight')],
    ['📏', 'Measurements', 'waist chest arms thighs tape body fat', page('history', 'measure')],
    ['😴', 'Sleep & heart', 'sleep resting heart rate hrv blood oxygen spo2 breathing bedtime wake night', quick('sleep'), recOn],
    ['🔋', 'Recovery', 'rest sore fresh tired muscles ready', page('history', 'recovery'), recOn],
    ['💪', 'Muscles', 'sets per muscle body map volume weekly balance my week lagging behind', page('history', 'muscles')],
    ['🏆', 'Records', 'personal best pr max heaviest 1rm', page('history', 'records')],
    ['📈', 'Strength level', 'beginner intermediate advanced standards how strong', page('history', 'strength')],
    ['⚖️', 'Balance', 'push pull ratio front back upper lower', page('history', 'balance')],
    ['📊', 'Insights', 'charts graphs days side by side week month trends sleep training steps eaten daily insights last 7 30 days', () => ACT.diOpen && ACT.diOpen(), () => !!ACT.diOpen],
    ['⌚', 'Sleep from your watch', 'sleep watch import bring in last night health connect apple health screenshot oneplus samsung noise boat fire-boltt', () => ACT.sleepWatch && ACT.sleepWatch(), () => !!ACT.sleepWatch && wOn()],
    ['🗓', 'Today’s page', 'day page summary the day in short insights today workout sleep food charts', () => window.Daily && window.Daily.openDay(Date.now()), () => !!window.Daily],
    ['🗓', 'This month', 'recap summary month compare last month against versus share picture card', page('history', 'recap')],
    ['📅', 'Year in review', 'year heatmap heat map calendar total every day trained food logged', page('history', 'year')],
    ['🎖', 'Badges', 'achievements awards streak medals', page('history', 'badges')],
    ['🌐', 'A restaurant’s menu from the web', 'menu restaurant cafe starbucks eating out order size milk extras customise customize web search', foodTab(() => ACT.kcMenu && ACT.kcMenu()), () => calOn() && !!ACT.kcMenu],
    ['📷', 'What can I make?', 'fridge shelf photo cook dishes ideas ingredients what to make', () => ACT.kcFridgeStart(), () => calOn() && !!ACT.kcFridgeStart],
    ['🥚', 'Protein per meal', 'protein breakfast lunch dinner light meal spread which meal', () => ACT.kcProteinMeals(), () => calOn() && !!ACT.kcProteinMeals],
    ['📋', 'Recipe from a photo or text', 'recipe paste cookbook screenshot ingredients read my recipes', foodTab(() => { if (ACT.kcAdd) ACT.kcAdd(); setTimeout(() => ACT.kcRecipeTab && ACT.kcRecipeTab(), 80); }), () => calOn() && !!ACT.kcRecipeTab],
    ['🤔', 'What should I eat now?', 'suggest food hungry what to eat protein left calories left ideas', () => ACT.kcWhatNow(), () => calOn() && !!ACT.kcWhatNow],
    ['🥣', 'My bowl, glass and spoon', 'katori cup tablespoon teaspoon size measure portion utensil ml', foodTab(() => ACT.kcMine && ACT.kcMine()), () => calOn() && !!ACT.kcMine],
    ['🔋', 'Readiness', 'ready score go heavy lighter rest today how recovered', () => { A.setRoot('days'); if (window.Ready && window.Ready.readiness()) ACT.readyOpen(); else ACT.openRecovery(); }, () => recOn() && !!ACT.readyOpen],
    ['🎯', 'Goal weight', 'target weight when will i reach date pace', page('history', 'body')],
    ['🔎', 'Patterns', 'insights trends habits weekend protein stuck goal date when will i reach', page('history', 'patterns'), () => !!VIEWS.patterns],
    ['🔥', 'Weekly goal', 'streak workouts a week target', () => { A.setRoot('days'); ACT.goalEdit(); }],
    ['🤖', 'Build me a workout', 'trainer generate plan ai suggest', page('days', 'builder'), trainerOn],
    ['📋', 'Programs', 'trainer program weeks ppl 5x5 routine plan', page('days', 'programs'), trainerOn],
    ['🏠', 'My gym', 'equipment machines home gym what i have', page('days', 'gym'), trainerOn],
    ['⇅', 'Arrange your Today page', 'order cards hide reorder today home page layout move', () => { A.setRoot('days'); setTimeout(() => A.ACT.homeArrange(), 60); }],
    ['🎯', 'Your weekly sets per body part', 'targets sets per muscle week goal volume balance', () => { A.setRoot('history'); A.go('muscles'); setTimeout(() => A.ACT.setsGoalOpen(), 60); }],
    ['🌙', 'Evening wrap-up', 'notification night 9 pm summary reminder log food', page('settings', 'setPage', { p: 'extras' })],
    ['🩹', 'Soreness for each part', 'sore soreness doms aching muscle head part long head upper chest each part how sore', page('settings', 'setPage', { p: 'extras' })],
    ['🧂', 'How was it made? (meal photos)', 'oil butter ghee salt pepper sugar jaggery honey milk sauce mayo cheese cream cooked estimate meal photo questions', page('settings', 'setPage', { p: 'extras' }), () => !!window.Cook],
    ['🧾', 'Order screenshot', 'swiggy zomato bill delivery order ordered in restaurant food screenshot log items', () => { A.setRoot('days'); ACT.ordIntro(); }, () => !!ACT.ordIntro],
    ['⚖', 'Which pack is better?', 'compare two packs packets labels nutrition protein sugar salt per 100 g healthier', () => { A.setRoot('days'); ACT.packCmp(); }, () => !!ACT.packCmp],
    ['🔗', 'Recipe from a link', 'youtube instagram recipe link url website import recipe', () => { A.setRoot('days'); if (ACT.kcAddHome) { ACT.kcAddHome(); setTimeout(() => ACT.kcRecipeLink(), 80); } }, () => !!ACT.kcRecipeLink],
    ['📷', 'Import a program', 'program photo whiteboard plan paste text routine days import split', () => { A.setRoot('days'); ACT.progImport(); }, () => !!ACT.progImport],
    ['⌚', 'Forgot to log? Ask my watch', 'missed workout watch recorded gym session estimate health connect forgot log', page('settings', 'setPage', { p: 'extras' }), () => !!window.Missed && wOn()],
    ['🎯', 'Next milestones', 'milestone round number goal next weight records main lifts how close', page('history', 'records')],
    ['🎁', 'Your year, wrapped', 'wrapped year review story share 2026 recap december', () => { A.setRoot('days'); ACT.wrapOpen(); }, () => !!ACT.wrapOpen],
    ['💪', 'Harder bodyweight moves', 'push up progression knee decline archer dips pull up chin up inverted row harder trainer', page('settings', 'setPage', { p: 'extras' }), trainerOn],
    ['👤', 'Account', 'sign out delete my account name profile picture club mates see share sync now saving blocked people unblock report reports club rules', page('settings', 'setPage', { p: 'account' }), () => !!(window.Cloud && window.Cloud.configured && window.Cloud.signedIn())],
    ['💾', 'Backup & export', 'save restore import export spreadsheet csv file delete all data', page('settings', 'setPage', { p: 'data' })],
    ['⌚', 'I have a smartwatch or band', 'watch smartwatch band no watch hide turn off switch heart rate sleep from watch health connect apple health', page('settings')],
    ['⌚', 'Watch & Google Health', 'health connect smartwatch heart rate steps noise fitbit samsung sync sleep automatic garmin zepp', page('settings', 'setPage', { p: 'health' }), () => !!(window.Health && window.Health.settingsCard && window.Health.settingsCard())],
    ['🗑', 'Recently deleted', 'bin trash restore undo deleted removed bring back recover put back', () => ACT.binOpen(), () => !!ACT.binOpen],
    ['✨', 'More features', 'switches options schedule plans alerts number pad trainer mode voice', page('settings', 'setPage', { p: 'extras' })],
    ['ⓘ', 'About GymDay', 'version credits tour', page('settings', 'setPage', { p: 'about' })],
    ['?', 'Help & tips', 'how to guide questions faq explain', page('settings', 'help')],
    ['📄', 'One-page report (PDF)', 'report pdf print coach doctor parents summary week month share', () => ACT.reportOpen()],          // 1.33 (50)
    ['✉', 'Send feedback', 'feedback idea problem bug report email contact support suggestion', () => ACT.feedback()],          // 1.33 (49)
    ['🆕', 'What\'s new', 'update changes new features version', () => ACT.whatsNew && ACT.whatsNew(), () => !!ACT.whatsNew],
  ];

  // ---------------- every settings row, read off the settings pages themselves so it never goes stale ----------------
  const rowTitle = el => { const g = el.cloneNode(true); g.querySelectorAll('.xs, select, input, button, .chev').forEach(x => x.remove()); return g.textContent.replace(/\s+/g, ' ').trim(); };
  const KIND = { row: '.row > .grow, .field > .lbl, .field > label', btn: 'button.btn', h3: '.card > h3' };
  function settingsIndex() {
    if (setIdx) return setIdx;
    const out = [], seen = new Set(), box = document.createElement('div');
    const scan = (html, p, where) => {
      box.innerHTML = html;
      Object.keys(KIND).forEach(kind => box.querySelectorAll(KIND[kind]).forEach(g => {
        const t = rowTitle(g), x = kind === 'row' ? g.querySelector('.xs') : null, d = x ? x.textContent.replace(/\s+/g, ' ').trim() : '';
        if (!t || t.length > 70 || seen.has(t) || /^(GymDay \d|Credits$)/.test(t) || (kind === 'btn' && !/\s/.test(t))) return;      // one-word buttons (Open, Change) say nothing by themselves
        seen.add(t); out.push({ t, d, p, where, kind });
      }));
    };
    try { scan(VIEWS.settings.html(), '', 'Settings'); } catch (e) { /* a page that can't be drawn right now is skipped */ }
    [['account', 'Account'], ['extras', 'More features'], ['health', 'Watch & Google Health'], ['data', 'Backup & export'], ['about', 'About GymDay']].forEach(([p, nm]) => { try { scan(VIEWS.setPage.html({ p }), p, 'Settings → ' + nm); } catch (e) { /* skipped */ } });
    return (setIdx = out);
  }
  function openSetting(i) {
    const s = settingsIndex()[i]; if (!s) return;
    if (s.p) A.reset('settings', 'setPage', { p: s.p }); else A.setRoot('settings');
    setTimeout(() => {
      const el = $$(KIND[s.kind].split(', ').map(k => '#view ' + k).join(', ')).find(g => rowTitle(g) === s.t); if (!el) return;
      const row = s.kind === 'row' ? el.closest('.row, .field') || el : el;
      row.scrollIntoView({ block: 'center' }); row.classList.add('find-flash'); setTimeout(() => row.classList.remove('find-flash'), 2200);
    }, 60);
  }

  // ---------------- searching ----------------
  const N = { go: 4, set: 4, ex: 5, food: 5, day: 3, wo: 4, help: 4 };
  function search(text) {
    const toks = fold(text).split(' ').filter(Boolean), out = { go: [], set: [], ex: [], food: [], day: [], wo: [], help: [] };
    if (!toks.length) return out;
    DEST.forEach((d, i) => { if (d[4] && !d[4]()) return; const sc = score(toks, d[1], d[2]); if (sc) out.go.push({ sc, i }); });
    settingsIndex().forEach((s, i) => { const sc = score(toks, s.t, s.d); if (sc) out.set.push({ sc, i }); });
    const xd = id => D.ex[id] || {};
    S.allExercises().forEach(e => { if (xd(e.id).hide) return; const sc = score(toks, e.name, (e.aka || []).join(' ') + ' ' + e.primary.join(' ') + ' ' + (e.secondary || []).join(' ') + ' ' + e.group + ' ' + e.equip); if (sc) out.ex.push({ sc: sc + (xd(e.id).fav ? 2 : 0) + (xd(e.id).max ? 1 : 0), e }); });
    D.days.forEach(d => { const sc = score(toks, d.name, d.items.map(it => (S.getEx(it.ex) || {}).name || '').join(' ')); if (sc) out.day.push({ sc, d }); });
    D.sessions.forEach(s => { const sc = score(toks, s.dayName, s.items.filter(it => !it.skipped).map(it => (S.getEx(it.ex) || {}).name || '').join(' ')); if (sc) out.wo.push({ sc: 1, s }); });      // newest first, as they are kept
    ((window.Help || {}).HELP || []).forEach(([id, ic, title, qs]) => qs.forEach(([qq, a], i) => { if (window.Help.shown && !window.Help.shown(id, i)) return; const sc = score(toks, qq, a + ' ' + title); if (sc) out.help.push({ sc, id, i, q: window.__calm === false ? qq : String(qq).replace(/\s*\(1\.\d+(?:\.\d+)?(?:,\s*([^)]*))?\)\s*$/, (m, g) => (g ? ` (${g})` : '')), ic }); }));          // 1.35.2: no version number in the title
    ['go', 'set', 'ex', 'day', 'help'].forEach(k => out[k].sort((a, b) => b.sc - a.sc));
    return out;
  }
  const item = (act, data, ic, name, sub) => `<div class="list-item tap find-it" data-act="${act}" ${data}><span class="find-ic" aria-hidden="true">${ic}</span><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${name}</div>${sub ? `<div class="xs muted ellipsis">${sub}</div>` : ''}</div><span class="chev">›</span></div>`;
  function group(key, title, rows, total) {
    if (!rows.length) return '';
    const n = more[key] ? rows.length : Math.min(rows.length, N[key]);
    return `<div class="sec-h find-h"><span>${title}</span><span class="sec-n">${total == null ? rows.length : total}</span></div><div class="card find-g" data-g="${key}">${rows.slice(0, n).join('')}${rows.length > n ? `<button class="btn ghost block find-more" data-act="findMore" data-g="${key}">Show all ${rows.length}</button>` : ''}</div>`;
  }
  function resultsHtml() {
    const text = q.trim();
    if (!text) return startHtml();
    const r = search(text), F = window.Food;
    hits = r;
    const mk = t => (window.Mark ? window.Mark(t, text) : esc(t));          // 1.33: the letters typed, in bold
    let foods = [];
    if (calOn() && F && F.findRows) foods = F.findRows(text, more.food ? 40 : 12);
    const h = group('go', 'Go to', r.go.map(x => { const d = DEST[x.i]; return item('findGo', `data-i="${x.i}"`, d[0], mk(d[1]), ''); }))
      + group('set', 'Settings', r.set.map(x => { const s = settingsIndex()[x.i]; return item('findSet', `data-i="${x.i}"`, '⚙️', mk(s.t), esc(s.where) + (s.d ? ' · ' + esc(s.d) : '')); }))
      + group('ex', 'Exercises', r.ex.map(x => item('findEx', `data-id="${esc(x.e.id)}"`, '🏋', mk(x.e.name), esc(x.e.group) + ' · ' + esc(x.e.equip))))
      + (foods.length ? group('food', 'Foods', foods) : calOn() && F && F.dbReady && !F.dbReady() ? `<div class="sec-h find-h"><span>Foods</span></div><p class="small muted" style="margin:0 4px 12px"><span class="kc-spin"></span> Opening the food list…</p>` : '')
      + group('day', 'Your days', r.day.map(x => item('findDay', `data-id="${esc(x.d.id)}"`, '🗓', mk(x.d.name), `${x.d.items.length} exercise${x.d.items.length === 1 ? '' : 's'}`)))
      + group('wo', 'Past workouts', r.wo.map(x => item('openSession', `data-id="${esc(x.s.id)}"`, '✓', esc(x.s.dayName), esc(A.fmtDate(x.s.start)))))
      + group('help', 'Help', r.help.map(x => item('findHelp', `data-s="${x.id}" data-i="${x.i}"`, x.ic, mk(x.q), '')));
    return h || `<div class="empty"><div class="big">🔍</div><p>Nothing matches “${esc(text)}”.</p><p class="small muted mt8">Try fewer letters, or another word: “sleep”, “backup”, “squat”, “dal”.</p></div>`;
  }
  const START = ['Add food', 'Add an activity', 'Body weight', 'Sleep & heart', 'Records', 'Muscles', 'Daily target', 'Backup & export', 'Help & tips'];
  function startHtml() {
    const fs = (S.meta.finds || []).slice(0, 6);
    const tiles = START.map(t => DEST.findIndex(d => d[1] === t)).filter(i => i >= 0 && (!DEST[i][4] || DEST[i][4]()));
    return `${fs.length ? `<div class="sec-h find-h"><span>Recent</span><span class="seg"><button class="btn sm ghost" data-act="findForget">Clear</button></span></div><div class="chips find-rec">${fs.map(f => `<button class="chip" data-act="findAgain" data-q="${esc(f)}">${esc(f)}</button>`).join('')}</div>` : ''}
      <div class="sec-h find-h"><span>Jump to</span></div><div class="card find-g">${tiles.map(i => item('findGo', `data-i="${i}"`, DEST[i][0], esc(DEST[i][1]), '')).join('')}</div>
      <p class="xs dim" style="text-align:center;margin-top:14px">Type anything: a food, an exercise, a setting, or a question like “how do I back up”.</p>`;
  }
  function paint() { const r = $('#findRes'); if (r) r.innerHTML = resultsHtml(); const c = $('#findClr'); if (c) c.classList.toggle('hidden', !q); }
  const keep = () => { const t = q.trim(); if (t.length < 2) return; const m = S.meta; m.finds = [t].concat((m.finds || []).filter(x => fold(x) !== fold(t))).slice(0, 6); if (S.saveMeta) S.saveMeta(); };

  VIEWS.find = {
    noNav: true,
    html() {
      return `<div class="top find-top"><button class="back" data-act="back" aria-label="Back">‹</button><div class="search grow"><span class="ic" aria-hidden="true">⌕</span><input class="input" id="findQ" placeholder="Search everything" aria-label="Search foods, exercises, settings and help" aria-label="Search everything" value="${esc(q)}" autocomplete="off" autocorrect="off" spellcheck="false" enterkeyhint="search"><button class="clr ${q ? '' : 'hidden'}" id="findClr" data-act="findClear" aria-label="Clear search">✕</button></div></div>
        <div id="findRes">${resultsHtml()}</div>`;
    },
    mount() {
      const i = $('#findQ'); if (!i) return;
      let tm = 0;
      i.addEventListener('input', () => { clearTimeout(tm); tm = setTimeout(() => { q = i.value; more = {}; paint(); }, 90); });
      i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
      if (wantFocus) { wantFocus = false; setTimeout(() => { try { i.focus(); } catch (e) { /* no keyboard */ } }, 60); }
      const F = window.Food;
      if (calOn() && F && F.loadDb && F.dbReady && !F.dbReady()) F.loadDb().then(() => { if ($('#findRes')) paint(); }).catch(() => {});
    },
    leave() { setIdx = null; }
  };
  ACT.findOpen = () => { if (A.top().name === 'find') return; q = ''; more = {}; setIdx = null; wantFocus = true; A.closeSheet(); A.go('find'); };
  ACT.findClear = () => { q = ''; more = {}; const i = $('#findQ'); if (i) { i.value = ''; i.focus(); } paint(); };
  ACT.findMore = el => { more[el.dataset.g] = true; paint(); };
  ACT.findAgain = el => { q = el.dataset.q || ''; more = {}; const i = $('#findQ'); if (i) i.value = q; paint(); };
  ACT.findForget = () => { S.meta.finds = []; if (S.saveMeta) S.saveMeta(); paint(); };
  ACT.findGo = el => { const d = DEST[+el.dataset.i]; if (!d) return; keep(); d[3](); };
  ACT.findSet = el => { keep(); openSetting(+el.dataset.i); };
  ACT.findEx = el => { keep(); A.go('exercise', { id: el.dataset.id }); };
  ACT.findDay = el => { keep(); A.go('day', { id: el.dataset.id }); };
  ACT.findHelp = el => { keep(); A.go('help', { s: el.dataset.s, i: +el.dataset.i }); };
  document.addEventListener('click', e => { const t = e.target.closest && e.target.closest('#findRes [data-act="kcPick"], #findRes [data-act="openSession"]'); if (t) keep(); }, true);

  window.Find = { search, score, DEST, settingsIndex, fold };
})();
