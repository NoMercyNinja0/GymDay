/* GymDay 1.22 · no doubts (guide.js): the 🔍 and ? at the top of every screen, how each number is worked out, and "What's new".
   - Top tools: a 🔍 (search everything, find.js) on the six tabs, and a ? on every screen: what the screen is for, in two
     lines, the numbers on it with how each is worked out, and a button to its Help topic.
   - Tap a number: stat tiles that did nothing when tapped now open their explanation (a small ⓘ marks them).
   - What's new: after an update, one sheet with what changed since the version this phone last opened, each with a
     "Show me" button. A fresh install is not shown it (the tour covers that). Kept in Store.meta.seenVer (this phone only).
   Tests switch the automatic sheet off with window.__tips = false. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, $$, esc, ACT, VIEWS } = A, D = S.data;
  const st = () => D.settings;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const u = () => A.unit();
  const ROOTS = ['days', 'calories', 'library', 'clubs', 'history', 'settings'];
  const calOn = () => !!(window.Calories && window.Calories.on && window.Calories.on());

  // ---------------- what each screen is for: [icon, title, text, help topic] (the first-time tips cover the rest) ----------------
  const ABOUT = {
    days: ['◎', 'Today', 'Your day at a glance. The big ring is what you have eaten against today\'s target, with protein and what you burnt beside it. The small rings are last night\'s sleep, how recovered your muscles are and this week\'s workouts. Tap any of them to open what is behind it. Your workout days are below: Start ▶ begins one.', 'start'],
    badges: ['🎖', 'Badges', 'Each badge is earned by training: workouts done, weeks in a row, weight lifted and more. A badge you don\'t have yet shows what it takes and how far along you are.', 'progress'],
    balance: ['⚖️', 'Balance', 'Your last 4 weeks as pairs: pushing against pulling, upper body against legs, and so on. It says what to even out so nothing falls behind.', 'progress'],
    body: ['⚖', 'Body weight', 'Your weight over time. Add it whenever you weigh yourself; the chart and “Now” use the latest one, and so do your calorie numbers.', 'progress'],
    bodyPick: ['🧍', 'By body part', 'Tap a part of the body, front or back, to see the exercises that train it.', 'library'],
    builder: ['🤖', 'Build me a workout', 'Pick body parts and how long you have, and GymDay builds a workout from what your gym has. Pick nothing and it takes the muscles that are most rested.', 'days'],
    gym: ['🏠', 'My gym', 'Tick the equipment your gym has. The library and the workout builder then leave out what you can\'t do there.', 'library'],
    measure: ['📏', 'Measurements', 'Tape measurements over time: chest, waist, arms and more. Measure at the same spot, relaxed, at the same time of day. Only you see this.', 'progress'],
    micros: ['🥦', 'Vitamins and minerals', 'What your food and supplements gave you, against what you need each day. Look at one day or a 7-day average.', 'food'],
    muscles: ['💪', 'Muscles', 'How many working sets each body part got in a week, on the body map. Use ‹ › to look at other weeks.', 'progress'],
    programs: ['📋', 'Programs', 'Ready-made programs that run for a few weeks. Follow one and GymDay says which workout is next.', 'days'],
    recap: ['🗓', 'Your month', 'One month of training: workouts, time in the gym, sets and weight lifted, compared with the month before.', 'progress'],
    records: ['🏆', 'Records', 'Your best on every exercise: the heaviest weight, the strongest set and the most lifted in one workout. Tap an exercise to open it.', 'progress'],
    recovery: ['🔋', 'Recovery', 'How rested each muscle is, and last night\'s sleep and heart numbers at the top. Type them in or add a screenshot from your watch app.', 'progress'],
    sessionDetail: ['✓', 'A saved workout', 'Every set of one workout, its calories, and its heart rate if you added it. Edit changes anything.', 'progress'],
    sessionEdit: ['✎', 'Editing a workout', 'Change the name, date, time and every set. It saves as you go, and only ticked sets count. Press and hold an exercise’s name and drag it to change the order.', 'progress'],
    setPage: ['⚙️', 'Settings', 'Switches for the parts of GymDay you want. Each row says what it does; nothing here deletes data except “Delete all my data”.', 'start'],
    strength: ['📈', 'Strength levels', 'Where your main lifts stand for your body weight, from Beginner upwards, and how far the next level is.', 'progress'],
    supps: ['💊', 'Supplements', 'What you take and when. Each one is counted on the days it is due, and its vitamins and minerals are added to your day.', 'food'],
    year: ['📅', 'Your year', 'The whole year: workouts each month, your best month, longest run of weeks, records and badges.', 'progress'],
    insights: ['📊', 'Insights', 'Your last 7 or 30 days, a day beside a day: a card with the day\'s numbers, then one chart for each thing GymDay tracks (sleep, training, food, steps, readiness, heart, body weight), then those days in a few sentences. Swipe the card for the day before or after, or slide a finger across the charts: the card and every chart show that day. Tap the card to open that day\'s own page. A chart only shows when those days have something for it.', 'progress'],
    dayx: ['🗓', 'A day', 'Everything about one day: the day in a few sentences, rings for your targets, then a card for each workout, your sleep the night before, food, movement, readiness and body weight. Swipe left or right, or use ‹ ›, for another day. Each card\'s button opens the page that has the details.', 'progress'],
    patterns: ['🔎', 'Patterns', 'Things in your own log that are easy to miss: what changes at weekends, lifts going up or stuck, sleep, body parts falling behind, and when you would reach your goals at your pace. Each needs enough days before it says anything; tap one for its numbers.', 'progress'],
    bin: ['🗑', 'Recently deleted', 'What you deleted on this phone in the last 30 days. Put back brings it back exactly as it was (photos are not kept). After 30 days it is gone for good.', 'data'],
    club: ['👥', 'A club', 'What your club mates did this week. You choose in Settings what they see of you.', 'clubs'],
    member: ['👤', 'A club mate', 'What this club mate shares with the club.', 'clubs'],
  };
  const ACCOUNT = ['👤', 'Account', 'Your name and picture, what your club mates see of your workouts, and where your data is saved. Sign out and Delete my account are at the bottom; both ask before they do anything.', 'clubs'];      // v1.26
  const aboutOf = name => (name === 'setPage' && ((A.top().params || {}).p === 'account') ? ACCOUNT : ABOUT[name] || ((window.Help || {}).TIPS || {})[name] || null);

  // ---------------- how each number is worked out ----------------
  // key → [title, () => html]; `p` = the open screen's params (an exercise's id, a workout's id)
  const exNow = () => { const t = A.top(); return t.name === 'exercise' && t.params ? S.getEx(t.params.id) : null; };
  const WHY = {
    top: ['Top set', () => `<p>The heaviest weight you have ticked for a working set of this exercise.</p><p class="mt8">It moves up by itself the moment you tick a heavier set. Warm-up sets don't count, and neither does a workout you saved without keeping its numbers. You can also type it: tap the tile.</p>`],
    orm: ['One-rep max', () => {
      const ex = exNow(), r = ex ? A.recordsFor(ex.id).e : null;
      const eg = r && r.r > 1 ? `Your strongest set here: ${A.fmtW(r.w)} ${u()} × ${r.r} → ${A.fmtW(r.w)} × ${(1 + r.r / 30).toFixed(2)} = about <b>${A.fmtW(Math.round(r.v * 2) / 2)} ${u()}</b>.` : `Example: 50 ${u()} × 9 reps → 50 × 1.3 = about <b>65 ${u()}</b>.`;
      return `<p>The most you could lift for a single rep.</p><p class="mt8">The <b>One-rep max</b> tile is a number you type yourself after testing it.</p><p class="mt8">“Est. one-rep max” on the chart and “Strongest set” in Records are estimates from your sets:</p><p class="why-f">weight × (1 + reps ÷ 30)</p><p>${eg}</p><p class="mt8 small muted">Only sets of 1 to 12 reps are used: beyond that the estimate stops being reliable.</p>`;
    }],
    vol: ['Weight lifted', () => `<p>Weight × reps for every set you ticked, added up.</p><p class="why-f">3 sets of 50 ${u()} × 10 reps = 1,500 ${u()}</p><p class="small muted">Timed exercises, like a plank, add nothing here. Skipped exercises don't count.</p>`],
    gym: ['Gym time', () => `<p>From the moment you pressed Start to the moment you finished, without any time the workout was paused.</p><p class="mt8 small muted">Got the times wrong? Open the workout in History and press Edit.</p>`],
    setcount: ['Sets', () => `<p>Every set you ticked ✓. Sets you left unticked and skipped exercises don't count.</p>`],
    count: ['Workouts', () => `<p>Every workout you saved. “This week” starts on Monday and “this month” on the 1st.</p><p class="mt8 small muted">Sports and other activities are listed in History too if you chose that in Settings, but these three numbers are gym workouts.</p>`],
    msets: ['Sets per body part', () => `<p>A ticked working set counts <b>1</b> for each body part its exercise is for, and <b>½</b> for each part that helps. Warm-up sets don't count.</p><p class="why-f">3 sets of bench press = 3 for chest, 1½ each for shoulders and triceps</p><p class="small muted">10 to 20 sets a week for a body part is the range most people grow well on; fewer usually maintains.</p>`],
    rec: ['Recovery %', () => `<p>An estimate of how rested a muscle is: 100% is fresh.</p><p class="mt8">Every workout of the last four days tires the parts it used: 8 hard sets tire a part fully, fewer sets less. A part is back after about 48 hours for light work and up to 72 hours for a full load. A set you marked all-out counts a quarter more, an easy one a quarter less.</p><p class="mt8">A short night, too little protein or food the day before, or a resting heart rate above your usual each slow it a little. The Recovery page lists what counted today.</p><p class="mt8 small muted">It is a guide, not a measurement: if a muscle still hurts, give it another day.</p>`],
    sleepneed: ['Sleep you need', () => { const C = window.Calories, a = C && C.ageNow ? C.ageNow() : 0; return `<p>The target on the sleep ring follows the usual advice by age: 9 hours under 13, 8 hours from 13 to 17, 7 hours for adults.</p><p class="mt8 small muted">${a ? 'Yours comes from the age in About me (Food tab).' : 'Add your age in About me (Food tab) so it fits you; until then it is 7 hours.'}</p>`; }],
    week: ['This week', () => { const g = st().weekGoal == null ? 3 : +st().weekGoal || 0; return `<p>Workouts done since Monday, against your weekly goal${g ? ` of <b>${g}</b>` : ''}.</p><p class="mt8">The 🔥 streak counts the weeks in a row in which you reached the goal.</p><p class="mt8 small muted">Change the goal by tapping the ring, or in Settings → Weekly goal.</p>`; }],
    kcal: ['Eaten, burnt and your target', () => `<p>The big ring fills as you eat towards today's target.</p><p class="mt8">Each of these numbers has its own explanation on the Food tab: tap <b>Eaten</b>, <b>Burnt</b>, or “usual day …” under the target.</p>`],
    str: ['Strength level', () => `<p>Your strongest set on the lift, as an estimated one-rep max, divided by your body weight, against the usual numbers for each level.</p><p class="why-f">estimated one-rep max ÷ body weight</p><p class="small muted">It uses your latest body weight and the group you picked at the top. The bar shows how far the next level is.</p>`],
    bal: ['Balance', () => `<p>Ticked working sets from your last 4 weeks, as pairs. A set counts 1 for each body part its exercise is for and ½ for the parts that help.</p><p class="mt8 small muted">A pair is called balanced when the two sides are close; otherwise it says which side to give more sets.</p>`],
    ready: ['Readiness', () => `<p>One number from 0 to 100 for how ready you are to train today, with what to do about it.</p><p class="mt8">Four parts, each scored out of 100: <b>sleep</b> last night against what you need (35% of the score), the <b>muscles</b> of your next workout (30%), your <b>heart</b>: resting heart rate and HRV against your usual (20%), and <b>food</b> yesterday: protein and calories (15%). A part with nothing logged is left out and the others share its weight.</p><p class="mt8"><b>80+</b> go heavy · <b>60–79</b> train as planned · <b>40–59</b> go lighter · <b>under 40</b> rest.</p><p class="mt8 small muted">Tap the Readiness ring on Today to see each part's score today. It is an estimate: how you feel comes first.</p>`],
    nextset: ['Next set', () => `<p>With Trainer mode on, GymDay suggests the next set from the one you just ticked and how hard you said it was:</p><p class="mt8"><b>Easy</b>: one step heavier, the same reps.<br><b>2 more in me</b>: the same again. That is where most sets should end.<br><b>1 more</b>: the same weight, one rep fewer is fine.<br><b>All out</b>: about 8% lighter, so you can keep your reps.</p><p class="mt8 small muted">No answer to “How hard?”: the same again. It is a suggestion: tap Use to fill it in, or type what you like. Warm-up and drop sets are left alone.</p>`],
    trend: ['Weight change', () => `<p>“Now” is your latest weigh-in. The change is the difference between it and the first weigh-in on the chart.</p><p class="mt8 small muted">One weigh-in can swing a kilo with water and food, so judge by the line over a couple of weeks.</p>`],
  };
  // which numbers each screen shows
  const NUMS = { days: () => (calOn() ? ['kcal', 'week', 'sleepneed', 'ready', 'rec'] : ['week', 'sleepneed', 'ready', 'rec']), exercise: ['top', 'orm', 'vol'], records: ['orm', 'vol'], history: ['count'], sessionDetail: ['gym', 'vol'],
    muscles: ['msets'], recovery: ['rec', 'sleepneed'], strength: ['str'], balance: ['bal'], body: ['trend'], recap: ['gym', 'setcount', 'vol'], year: ['gym', 'setcount', 'vol'] };
  const numsOf = name => { const n = NUMS[name]; return typeof n === 'function' ? n() : n || []; };
  ACT.why = el => {
    const w = WHY[el.dataset.why]; if (!w) return;
    A.openSheet(`<h2>${esc(w[0])}</h2><div class="why-b">${w[1]()}</div><button class="btn primary block mt16" data-act="closeSheet">Got it</button>`);
  };
  // stat tiles that did nothing when tapped: the label decides which explanation opens
  const STAT = [[/gym time|in the gym/i, 'gym'], [/lifted/i, 'vol'], [/^sets$/i, 'setcount'], [/^(this week|this month|total|workouts?)$/i, 'count']];
  function mark(view) {
    view.querySelectorAll('.stat:not([data-act])').forEach(t => {
      const k = t.querySelector('.k'); if (!k) return;
      const lbl = k.textContent.trim(), hit = STAT.find(([re]) => re.test(lbl)); if (!hit) return;
      t.dataset.act = 'why'; t.dataset.why = hit[1]; t.classList.add('why');
    });
  }

  // ---------------- the 🔍 and ? at the top ----------------
  const NO_TOOLS = ['find', 'help', 'welcome', 'signin', 'code', 'name', 'session', 'choose', 'picker'];
  function tools() {
    const view = $('#view'); if (!view) return;
    const name = A.top().name;
    mark(view);
    if (NO_TOOLS.includes(name)) return;
    const top = view.querySelector('.top'); if (!top || top.querySelector('.top-tools')) return;
    const isRoot = ROOTS.includes(name) && A.depth() === 1;
    top.insertAdjacentHTML('beforeend', `<span class="top-tools">${isRoot && VIEWS.find ? `<button class="tool" data-act="findOpen" aria-label="Search everything"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" aria-hidden="true"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/></svg></button>` : ''}${aboutOf(name) ? `<button class="tool" data-act="helpHere" aria-label="About this screen">?</button>` : ''}</span>`);
  }
  let queued = false;
  const later = () => { if (queued) return; queued = true; Promise.resolve().then(() => { queued = false; tools(); }); };
  const viewEl = $('#view');
  if (viewEl) new MutationObserver(later).observe(viewEl, { childList: true, subtree: true });
  const after0 = A.afterRender;
  A.afterRender = name => { if (after0) after0(name); tools(); showNewSoon(); };

  ACT.helpHere = () => {
    const name = A.top().name, a = aboutOf(name); if (!a) return;
    const nums = numsOf(name);
    A.openSheet(`<div class="here-h"><span class="here-ic" aria-hidden="true">${a[0]}</span><h2>${esc(a[1])}</h2></div><p>${esc(a[2])}</p>
      ${nums.length ? `<div class="k2 mt16 mb8">The numbers here</div><div class="card here-nums">${nums.map(k => `<div class="list-item tap" data-act="why" data-why="${k}"><div class="grow small" style="font-weight:600">${esc(WHY[k][0])}</div><span class="xs muted">how it's worked out</span><span class="chev">›</span></div>`).join('')}</div>` : ''}
      <div class="row mt16"><button class="btn grow" data-act="helpOpen" data-s="${a[3]}">More help</button><button class="btn primary grow" data-act="closeSheet">Got it</button></div>`);
  };

  // ---------------- What's new ----------------
  // newest first; [version code, version name, [[icon, title, text, button, what the button does]]]
  const go = fn => () => { A.closeSheet(); setTimeout(fn, 30); };
  // the place of a Help question within its topic, by the first words of its title
  const helpAt = (sec, words) => { const s = ((window.Help || {}).HELP || []).find(x => x[0] === sec); const i = s ? s[3].findIndex(q => q[0].replace(/^[“"]/, '').startsWith(words)) : -1; return i < 0 ? 0 : i; };
  const NEWS = [
    [60, '1.35.2', [
      ['🧹', 'Calmer and simpler', 'After a long real-user test, GymDay starts quieter: Today shows five kinds of card, a tip shows on three screens, the save question and the daily reminders are off at first, and How hard? is asked once per exercise. Everything is still in Settings → More features and Arrange this page.', 'Arrange Today', go(() => { A.setRoot('days'); setTimeout(() => A.ACT.homeArrange && A.ACT.homeArrange(), 60); })],
      ['✅', 'Fewer taps in a workout', 'Tap an exercise to start it, and the last set you tick finishes it. ▶ Start and Done ✓ are still there when you want them. Your first real set is 1 again after warm-ups.', 'Go to Today', go(() => A.setRoot('days'))],
      ['🍛', 'Food, tidied', 'Add food comes first on the Food tab, with Photo, Barcode and Type it (More has the rest). 333 Indian foods got a real serving (1 butter naan, 1 katori dum aloo…), Popular starts with what you eat most days, and search puts Indian everyday food first.', 'See the Food tab', go(() => A.setRoot('calories'))],
      ['🎯', 'Adding food, easier', 'Type an amount with the food, like “2 roti”, “100 g paneer” or “1 cup rice”, and tap +. Search puts the everyday food first (tea is chai with milk, egg a boiled egg), foods start at an amount people eat (a teaspoon of sugar, 10 almonds, 100 g of chicken), and the quick amounts fit what you measure in.', 'Add food now', go(() => { A.setRoot('calories'); setTimeout(() => A.ACT.kcAdd && A.ACT.kcAdd(), 80); })],
      ['😴', 'Sleep, right from Today', 'Tap Sleep on Today when last night isn’t in: slide the hours, add up to 10 screenshots of your watch app’s sleep (read together), or bring last night in from your watch with one tap. Workout, activity and day screenshots take up to 10 too.', 'Add last night’s sleep', go(() => { A.setRoot('days'); setTimeout(() => A.ACT.todaySleep && A.ACT.todaySleep(), 80); }), () => !window.Watch || window.Watch.on()],
      ['🔒', 'Your privacy, in the open', 'About has the privacy policy and a contact. Before a photo or a screenshot is read by AI, GymDay asks once and says who reads it: Claude, an AI made by Anthropic. You can turn it off in Settings → More features.', 'See About', go(() => A.go('setPage', { p: 'about' }))],
      ['🛠', 'Fixes', 'Today and Food move on to the new day when GymDay was left open overnight; Back goes to Today first; swiping a page no longer changes the tab; a new day is made only when you save its name; durations read the same everywhere.', 'Go to Today', go(() => A.setRoot('days'))],
    ]],
    [57, '1.35.1', [
      ['🧮', 'Soreness worked out for you', 'The day after a workout, GymDay works out how sore you should be from your sets, how hard they were, the time since, and whether the exercise or the muscle was new to you. Today says it, like “Triceps: sore · mostly the long head”. That’s right keeps it; Change it sets each muscle to how you feel.', 'See how sore', go(() => A.go('recovery'))],
      ['🏋️', 'Soreness in your workout', 'During a workout, each exercise says how sore the muscles it works are today, like “Chest: sore · Triceps: a bit sore”, so you know before you start it.', 'Go to Today', go(() => A.setRoot('days'))],
      ['🧑‍🏫', 'Trainer: sore parts', 'Trainer mode shows how sore each part is, the sorest first. Build me a workout goes easy on them: it keeps away from very sore parts when it can, and gives an exercise for a sore part 2 sets, not 3.', 'Build a workout', go(() => A.go('builder'))],
      ['🎛', 'Each part, if you like', 'You change soreness for the whole muscle, and GymDay spreads it over its parts by how hard each one worked. To set each head or part yourself (the long head, the upper chest…), turn on Settings → More features → Soreness for each part.', 'Open the switch', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'extras' }); })],
      ['📈', 'Bigger night charts', 'On Recovery, Your nights’ charts are about 2½ times as tall, with bigger numbers and day letters. Slide a finger along one: the night is marked and its value and day show above the chart. Open in Insights takes you to that night.', 'See your nights', go(() => A.go('recovery'))],
    ]],
    [56, '1.35', [
      ['💪', 'A new body, part by part', 'The body map is drawn again, muscle by muscle, and every muscle is split into its parts: 43 in all, like the long head, short head and brachialis of the biceps, the three heads of the triceps and of the delts, and the upper, middle and lower chest. Settings → Look → Body figure picks a male or a female figure.', 'Find exercises by muscle', go(() => A.go('bodyPick'))],
      ['🎯', 'Every exercise, part by part', 'All 223 exercises show what they hit hardest (deep red), what they work well and what they help. On the body part page, tap a part, then Best exercises: the ones that hit it hardest come first.', 'Open the Library', go(() => A.setRoot('library'))],
      ['🔍', 'Big and easy to tap', 'Tap an area of the body and it zooms in, then tap the exact part. Pinch to zoom, drag to look around, and Whole body zooms back out. The small maps on an exercise’s or a workout’s page open full screen with ⤢.', 'Try it', go(() => A.go('bodyPick'))],
      ['🩹', 'How sore are you?', 'The day after a workout, and the day after that, Today asks how sore you are. Tap the sore parts, then Save: it counts for Recovery, and stretches for those parts are one tap away. A workout’s page shows how sore it left you.', 'Open Recovery', go(() => A.go('recovery'))],
      ['👉', 'Swipe through your days', 'Insights has a card for each day with all its numbers. Swipe it left or right for the day after or before, and the charts follow. On Today, the week tile now says Workouts: 4 of 3 means 4 workouts done of the 3 you planned.', 'Open Insights', go(() => ACT.diOpen && ACT.diOpen())],
      ['🚦', 'Needs improvement', 'The zones on the charts have three steps now: green is the safe zone, amber needs improvement, and red, the danger zone, is only for what is really low.', 'Show me', go(() => ACT.diOpen && ACT.diOpen())],
      ['✏️', 'Longer food names', 'A food’s name can be up to about 100 words now, and its box grows so you can read every word. And a teaspoon typed in a meal (“2 tsp oil”) is counted as a teaspoon.', 'Go to Food', go(() => A.setRoot('calories'))],
    ]],
    [55, '1.34', [
      ['🍽', 'Famous places in Eating out', 'Food → Eating out → Chains and famous places: 53 famous places from all over India, grouped into South Indian, biryani and kebabs, North Indian and street food, sweets and desserts, and cafés. Madurai’s Famous Jigarthanda and Madurai Famous Jigarthanda, Murugan Idli Shop, A2B, Saravana Bhavan, Rameshwaram Cafe, Paradise, Karim’s and many more. Type a place or a city to find it.', 'Open Eating out', go(() => ACT.kcOut && ACT.kcOut())],
      ['🧾', 'Their own numbers, or worked out', 'Dindigul Thalappakatti and Biryani By Kilo list their own calories, so those are used. Every other place’s dishes say they were worked out from a usual recipe at the size that place serves. Tap a dish to see how.', 'See Famous Jigarthanda', go(() => { if (!ACT.kcOut) return; ACT.kcOut(); ACT.kcOutChain({ dataset: { v: 'Madurai Famous Jigarthanda' } }); })],
      ['✅', 'Every food checked', 'All 32,000 foods were checked. These were far off and are fixed: curd rice and appam were counted too high; boiled kappa (tapioca), shrikhand, amrakhand, rasmalai and rasgulla too low. Restaurant-style dal makhani, paneer tikka, seekh kebab, korma, palak paneer, kadai paneer, kulfi and kheer were added, and Eating out and search show them first.', 'Open Food', go(() => ACT.openCalories && ACT.openCalories())],
    ]],
    [54, '1.33', [
      ['🚦', 'Safe zone and danger zone', 'The charts that have a healthy range now show it: a green safe zone and a red danger zone behind the line, each named on the chart. Sleep, calories eaten, protein, readiness, resting heart rate and HRV have them, and a day in the danger zone gets a red dot. Eating over your target is never a danger zone.', 'Show me', go(() => ACT.diOpen && ACT.diOpen())],
      ['⌚', 'No watch? Switch it off', 'Settings → Watch → “I have a smartwatch or band”. Switched off, everything that needs a watch is hidden and paused, and sleep is typed by hand. Nothing you logged is deleted, and a new phone asks once at the end of the short tour.', 'Open Settings', go(() => A.setRoot('settings'))],
      ['🍛', 'More than 900 new dishes', 'Foods from every part of India (athirasam, kozhukattai, sadya dishes, pithas, street food) and from around the world, from ramen and bulgogi to jollof rice, pelmeni and feijoada. No lab measures these, so each one says it was worked out from a home recipe.', 'Search a food', go(() => { if (ACT.openCalories) ACT.openCalories(); setTimeout(() => ACT.kcAdd && ACT.kcAdd(), 60); })],
      ['⚡', 'Faster food logging', 'Your usual amount comes first. Recent searches, “Did you mean”, and ＋ to add straight from the list. The sheet stays open so you can keep adding. Pick several foods at once, change a logged food with − and ＋, and copy a meal to other days.', 'Try it', go(() => { if (ACT.openCalories) ACT.openCalories(); setTimeout(() => ACT.kcAdd && ACT.kcAdd(), 60); })],
      ['🏋', 'Quicker workouts', 'Last time’s exercises come ticked. Your recent weights sit above the number pad, and “for the other sets” fills the rest in one tap. Drag ≡ to move an exercise. The exercises you do most come first in the list.', 'OK', go(() => A.setRoot('days'))],
      ['↩', 'Undo instead of “Are you sure?”', 'Deleting a workout, a day, a set, a food or a measurement happens at once, with an Undo button for a few seconds.', 'Open History', go(() => A.setRoot('history'))],
      ['📈', 'Every graph in the new look', 'All the graphs now have numbers up the side and the safe zone. Tap a graph’s name to open its page. The weekly report and the morning note say how many days were in the safe zone, and Recovery shows your sleep debt.', 'Show me', go(() => ACT.diOpen && ACT.diOpen())],
      ['📄', 'A one-page report', 'Your last 7 or 30 days on one A4 page as a PDF, to send to a coach or a doctor. Settings → Backup & export → One-page report.', 'Make one', go(() => ACT.reportOpen && ACT.reportOpen())],
      ['✨', 'Smoother everywhere', 'Tap the tab you are on to go back to the top. Enter or Done saves. The keyboard never covers the box you type in, and what you typed comes back if a sheet closes by mistake. Bigger buttons, and Clubs shows once you sign in.', 'OK', go(() => A.setRoot('days'))],
      ['✉', 'Send feedback', 'Settings → Send feedback writes an email to us with your app version and phone already in it.', 'Write one', go(() => ACT.feedback && ACT.feedback())],
    ]],
    [53, '1.32.1', [
      ['📈', 'Line graphs with numbers', 'Insights and a day’s page now draw each thing as a line through your days, twice as tall, with its numbers up the side and faint lines across. A day with nothing logged breaks the line, so it never looks like zero.', 'Show me', go(() => ACT.diOpen && ACT.diOpen())],
    ]],
    [52, '1.32', [
      ['↕', 'Move exercises during a workout', 'Press and hold an exercise’s name for a moment, then drag it up or down and let go. While you drag, every exercise folds to one line so you see the whole workout; when you let go they open again. The new order is only for this workout: your day keeps its own order. It works when you edit a saved workout too.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'Changing the order of exercises (1.32)') }))],
      ['⌚', 'Sleep from your watch, made easy', 'Tell GymDay which watch you wear (OnePlus, Samsung, Noise, boAt, Fire-Boltt, Apple Watch or another) and it shows the easiest way to bring in last night’s sleep: automatically every morning, or from one screenshot of your watch’s app. A card on Today reminds you while last night isn’t in yet.', 'Set it up', go(() => ACT.sleepWatch && ACT.sleepWatch())],
    ]],
    [51, '1.31', [
      ['📊', 'Insights: your days side by side', 'Sleep, training, food, steps, readiness, heart rate and body weight as charts for the last 7 or 30 days, lined up by day. Slide a finger across to read a day. It opens from the new Last 7 days card on Today and from History.', 'Show me', go(() => ACT.diOpen && ACT.diOpen())],
      ['🗓', 'A page for every day', 'Tap a day (on Today’s card, in Insights, or in History’s week and calendar) for that day in a few sentences and charts: each workout against the time before, your sleep, food, movement and readiness. Swipe for the day before or after.', 'Open today', go(() => window.Daily && window.Daily.openDay(Date.now()))],
    ]],
    [50, '1.30', [
      ['📱', 'Ready for Android 16', 'GymDay now fits phones that draw right to the screen’s edges: nothing hides under the status bar, the phone’s buttons or the keyboard, and the back gesture closes a sheet or goes back a screen.', 'OK', go(() => A.setRoot('days'))],
      ['🛡', 'Report and block in clubs', 'Any message, comment or person in a club can be reported, and a person blocked. Before using clubs you agree to the club rules. An AI answer can be reported too.', 'How it works', go(() => A.go('help', { s: 'clubs', i: helpAt('clubs', 'Report and block (1.30)') }))],
    ]],
    [49, '1.29', [
      ['🧂', 'How was it made?', 'After a meal photo, each dish asks about the oil or butter it was cooked in, salt, pepper, sugar (even jaggery or honey), milk, sauces, cheese and cream, with Estimate when you don’t know. Your answers are filled in next time.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'How was it made? (1.29)') }))],
    ]],
    [48, '1.28', [
      ['🧾', 'Order screenshots and pack compare', 'Ordered on Swiggy or Zomato? Add the order’s screenshot: each item is logged with that restaurant’s numbers. And Compare puts two packets side by side per 100 g.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Order screenshots (1.28)') }))],
      ['🔗', 'A recipe from a link', 'Paste a recipe site or YouTube link and it becomes one of My recipes, counted from GymDay’s own food list.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'A recipe from a link (1.28)') }))],
      ['📷', 'Import a program, or a club mate’s workout', 'A whiteboard photo or pasted program becomes your days. In a club, Do this workout makes a mate’s workout one of your days.', 'Import', go(() => { A.setRoot('days'); setTimeout(() => A.ACT.progImport(), 60); })],
      ['⌚', 'Forgot to log?', 'Your watch recorded a gym session GymDay doesn’t have? It is logged as estimated from last time, and you’re asked if the weights changed.', 'Turn it on', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'extras' }); })],
      ['🎯', 'Next milestones', 'Each main lift’s next round number, how close you are, and about when at your pace. Harder bodyweight moves come with Trainer mode.', 'See them', go(() => { A.setRoot('history'); A.go('records'); })],
      ['⚡', 'Quick Settings tiles and new dropdowns', 'Add GymDay’s Meal photo and Add food tiles to your pull-down shade. Every dropdown now opens GymDay’s own menu. And in December: your year, wrapped.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Quick Settings tiles (1.28)') }))],
    ]],
    [47, '1.27', [
      ['🏷', 'Packs and portions', 'A packet read from its label is kept in My foods, so next time it is one tap. And GymDay learns how much of a food you usually have and offers it on a photo line.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Save a pack once') }))],
      ['📶', 'Photos without signal, and Share', 'No internet? Keep the meal photo and it is read later, before anything is logged. And share a photo from your gallery or WhatsApp straight to GymDay.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Photos without signal') }))],
      ['✅', 'Best picks and workout fuel', 'A fetched menu marks what fits what is left of today. With Trainer mode on, Today says what to eat before and after your workout.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Best picks on a menu') }))],
      ['🎯', 'Your sets, and a plan when stuck', 'Set your own weekly sets for each body part. An exercise stuck for 4 weeks can start a 3-week plateau plan.', 'Set targets', go(() => { A.setRoot('history'); A.go('muscles'); setTimeout(() => A.ACT.setsGoalOpen(), 60); })],
      ['⇅', 'Arrange your Today page', 'Choose which cards show on Today and put them in your own order.', 'Arrange', go(() => { A.setRoot('days'); setTimeout(() => A.ACT.homeArrange(), 60); })],
      ['🌙', 'Evening wrap-up at 9 pm', 'One notification each evening with today’s workout, calories and protein, and what is on tomorrow; on a day with nothing logged, a reminder to log.', 'Set the time', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'extras' }); })],
    ]],
    [46, '1.26', [
      ['⚙️', 'Settings, a new look', 'Your account at the top, then tidy rows with icons that show what they are set to. Short choices are pills you tap. Sign out and Delete my account are on the Account page: tap your name. Nothing was taken out.', 'Open Settings', go(() => A.setRoot('settings'))],
      ['🧪', 'Meal photos: nutrients first', 'The photo AI now works out each food’s weight and what it holds (protein, carbs, fat, fibre), and the calories are calculated from those: 4, 4, 9 and 2 kcal a gram. It no longer needs the food to be in the food list.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Meal photos: nutrients first') }))],
      ['🏷', 'A packet in a meal photo', 'When the photo shows a packet’s nutrition table, its numbers are copied, not estimated. One tap sets 1 serving, half the pack or all of it.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'A packet in a meal photo') }))],
    ]],
    [45, '1.25', [
      ['🌐', 'Restaurant menus from the web', 'In Eating out, type a restaurant or cafe: GymDay finds the menu it serves now. Tap an item and pick its size, milk and extras; the numbers follow your choices. Or type the whole order in one line.', 'Open Eating out', go(() => { ACT.openCalories(); setTimeout(() => ACT.kcOut && ACT.kcOut(), 60); })],
      ['⬆', 'Auto-progression', 'Give an exercise a rep range, say 8–12. When every set reaches the top, the next workout starts one step heavier. On each exercise’s page, while Track reps is on.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'Auto-progression') }))],
      ['⚡', 'Busy week', 'A 20, 25 or 30 minute version of your day: the main exercise for each body part, 2 working sets, your usual weights. Tap ⚡ Busy week when you pick your exercises.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'Busy week') }))],
      ['⚖', 'Balance my week', 'The Muscles page shows the body parts still under 10 sets this week and adds a few sets for them to your next workout in one tap.', 'Open Muscles', go(() => { A.setRoot('history'); A.go('muscles'); })],
      ['💡', 'Form cues', 'With Trainer mode on, each exercise shows one short reminder in big letters while you lift. Tap it to write your own.', 'Trainer mode', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'extras' }); })],
      ['📷', 'Recipes, and What can I make?', 'Add food → My recipes reads a recipe from a photo or pasted text. What should I eat now? can look at a photo of your fridge and suggest dishes, and shows which meals are light on protein.', 'What should I eat now?', go(() => ACT.kcWhatNow && ACT.kcWhatNow())],
      ['🌅', 'Morning brief and Today widget', 'One notification each morning with your workout, calorie target and readiness. And a new home-screen widget: readiness, calories left and your next workout.', 'Set the time', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'extras' }); }), () => !!(window.Native && window.Native.todayData && S.isAndroid)],
      ['🗓', 'Your year and your month', 'The Year page shows every day you trained and logged food. The month page sets this month against the last one, fairly, and makes a picture to share.', 'Open this month', go(() => { A.setRoot('history'); A.go('recap'); })],
    ]],
    [44, '1.24', [
      ['⌚', 'Automatic from your watch', 'Sleep, resting heart rate, HRV, steps and the day\'s calories come in from Health Connect by themselves. No screenshots. What you type always wins.', 'Switch it on', go(() => { A.setRoot('settings'); A.go('setPage', { p: 'health' }); }), () => !!(window.HealthAuto && window.HealthAuto.can())],
      ['👣', 'Steps on Today', 'With a watch day, Today shows your steps next to Burnt.', 'Open Today', go(() => A.setRoot('days')), () => !!(window.HealthAuto && window.HealthAuto.can())],
      ['🧮', 'One number everywhere', 'Every screen was checked against the others. Eaten and Burnt now read the same on Today, the Food tab and the watch card, leftovers follow their food when you move or remove it, and History says which activities counted towards your week.', 'Open Food', go(() => ACT.openCalories())],
      ['⚡', 'Faster, and checked from end to end', 'The app opens sooner and the food search keeps up with your typing. Before this version went out, tens of thousands of random taps and odd entries were tried on every screen.', 'Search a food', go(() => { ACT.openCalories(); setTimeout(() => ACT.kcAdd && ACT.kcAdd(), 60); })],
    ]],
    [43, '1.23', [
      ['◎', 'Focus workout', 'One exercise at a time with big numbers. The workout still opens as the list: tap ◎ Focus in its bar.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'Focus') }))],
      ['🔋', 'Readiness', 'A score from 0 to 100 on Today from your sleep, muscles, heart and food, with what to do: go heavy, go lighter or rest.', 'Show me', go(() => { A.setRoot('days'); if (ACT.readyOpen) ACT.readyOpen(); })],
      ['⭐', 'Your usual meals', 'An empty meal offers what you usually eat then. One tap adds it all.', 'Open Food', go(() => ACT.openCalories())],
      ['🤔', 'What should I eat now?', 'Foods you already eat that best fill what is left of today\'s protein and calories.', 'Ask it', go(() => ACT.kcWhatNow && ACT.kcWhatNow())],
      ['📷', 'Quick snap', 'A clear photo of a meal is logged straight away, with Edit and Undo.', 'How it works', go(() => A.go('help', { s: 'food', i: helpAt('food', 'Quick snap') }))],
      ['🔎', 'Patterns and goal dates', 'What your own log shows, like protein dropping at weekends, and when you would reach your goals at your pace.', 'Open Patterns', go(() => A.reset('history', 'patterns'))],
      ['🥣', 'My bowl, glass and spoon', 'Measure yours once and every katori, glass and spoon uses your sizes. Oil can be set per dish too.', 'Set mine', go(() => { ACT.openCalories(); setTimeout(() => ACT.kcMine && ACT.kcMine(), 60); })],
      ['❓', '“Is this right?”', 'Odd entries, like 525 kg instead of 52.5, are asked about before they count.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'Is this right') }))],
      ['🗑', 'Recently deleted', 'Anything you delete can be put back for 30 days.', 'Open it', go(() => ACT.binOpen && ACT.binOpen())],
      ['➜', 'The next set (Trainer mode)', 'After each set, a suggestion for the next one from how hard it felt.', 'How it works', go(() => A.go('help', { s: 'workout', i: helpAt('workout', 'The next set') }))],
    ]],
    [42, '1.22', [
      ['✨', 'A new look: Glass', 'Frosted cards, glowing rings and bigger numbers, in dark and light. The look from before is still there.', 'Choose the look', go(() => { A.setRoot('settings'); setTimeout(() => { const r = $('[data-bind="look"]'); if (r) { const f = r.closest('.field, .row') || r; f.scrollIntoView({ block: 'center' }); f.classList.add('find-flash'); setTimeout(() => f.classList.remove('find-flash'), 2200); } }, 80); })],
      ['◎', 'Today', 'The first tab is now Today: calories, protein, burnt, sleep, recovery and your next workout together. Your days are still on it.', 'Open Today', go(() => A.setRoot('days'))],
      ['＋', 'One + button', 'On every tab: add food, a meal photo, an activity, your weight or sleep, or start a workout.', 'Open it', go(() => { A.setRoot('days'); ACT.quickAdd(); })],
      ['🔍', 'Search everything', 'One box finds foods, exercises, past workouts, settings and help. It is the 🔍 at the top of every tab.', 'Search', go(() => ACT.findOpen())],
      ['👆', 'Charts you can touch', 'Slide a finger along any chart to read each day\'s value.', 'Open a chart', go(() => A.reset('history', 'body'))],
      ['?', 'No more guessing', 'A ? at the top of every screen says what it is for and how its numbers are worked out. Tiles marked ⓘ explain themselves when tapped.', 'Show me', go(() => { A.setRoot('history'); setTimeout(() => ACT.helpHere(), 60); })],
    ]],
  ];
  const codeNow = () => +(window.GYMDAY_APP || {}).code || 0;
  function newsHtml(since) {
    const list = NEWS.filter(n => n[0] > since);
    const use = list.length ? list : NEWS.slice(0, 1);
    return `<h2>What's new</h2><p class="muted mb12">GymDay ${esc((window.GYMDAY_APP || {}).name || '')}${list.length > 1 ? ` · everything since your last version` : ''}</p>
      <div class="wn">${use.map(([code, nm, items]) => (use.length > 1 ? `<div class="k2 mt12 mb8">Version ${esc(nm)}</div>` : '') + items.map((it, i) => (it[5] && !it[5]() ? '' : `<div class="wn-it"><span class="wn-ic" aria-hidden="true">${it[0]}</span><div class="grow"><div class="wn-t">${esc(it[1])}</div><div class="small muted">${esc(it[2])}</div><button class="btn sm mt8" data-act="newsGo" data-c="${code}" data-i="${i}">${esc(it[3])} ›</button></div></div>`)).join('')).join('')}</div>
      <button class="btn primary block mt16" data-act="closeSheet">Got it</button>`;
  }
  const seen = () => { const m = S.meta; if (m.seenVer !== codeNow()) { m.seenVer = codeNow(); if (S.saveMeta) S.saveMeta(); } };
  ACT.whatsNew = el => { const since = el && el.dataset && el.dataset.since != null ? +el.dataset.since : codeNow() - 1; A.openSheet(newsHtml(since)); seen(); };
  ACT.newsGo = el => { const n = NEWS.find(x => x[0] === +el.dataset.c), it = n && n[2][+el.dataset.i]; if (it) it[4](); };
  // after an update: once, on a tab, when nothing else is open. A fresh install starts at this version without the sheet.
  let asked = false;
  // read before the first screen is drawn (the tour marks itself as seen on that first draw)
  const fresh = S.meta.seenVer == null && !S.meta.toured && !D.sessions.length && !D.food.length && !D.days.length;
  function showNewSoon() {
    if (asked) return;
    const m = S.meta, code = codeNow(); if (!code) return;
    if (fresh) { asked = true; seen(); return; }                                                                    // a fresh install: the tour covers it
    if (m.seenVer != null && m.seenVer >= code) { asked = true; return; }
    if (window.__tips === false) return;
    const t = A.top(); if (!ROOTS.includes(t.name) || A.depth() !== 1 || D.active) return;
    asked = true;
    const since = m.seenVer == null ? 41 : m.seenVer;
    setTimeout(() => { const sh = $('#sheet'); if (sh && !sh.classList.contains('hidden')) { asked = false; return; } if (!ROOTS.includes(A.top().name)) { asked = false; return; } A.openSheet(newsHtml(since)); seen(); }, 700);
  }

  window.Guide = { ABOUT, WHY, NEWS, numsOf, newsHtml, tools };
})();
