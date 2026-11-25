/* GymDay 1.32 · Sleep from your watch (sleepwatch.js).
   One place for last night's sleep from any watch. The first time it asks which watch you wear, then shows the easiest way
   for that watch on this phone:
   · automatic, every morning: through Health Connect on Android or Apple Health on iPhone (hcauto.js does the reading),
     with the one thing to switch on in the watch's own app so its sleep gets there;
   · a screenshot of the watch app's sleep screen, read by AI (progress.js, rcSleepShots): works with every watch, and is
     the first way for watches whose app does not share sleep (Noise, boAt and Fire-Boltt on Android; Samsung and OnePlus
     watches only work with Android phones, so on an iPhone);
   · or typing it (rcSleepForm).
   It opens from a card on Today while last night's sleep is not in yet (Arrange key 'sleepw'), from Recovery's sleep card
   and from today's "+ Sleep" on a day's page. The chosen watch is D.settings.watch (synced); the card's "not today" is
   meta.swHide (this phone). */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { $, esc, ACT } = A, D = S.data, M = S.meta;
  const HA = () => window.HealthAuto || null;
  const ios = () => { try { return document.documentElement.classList.contains('ios') || !!(window.Android && window.Android.platform && window.Android.platform() === 'ios'); } catch (e) { return false; } };
  const hub = () => (ios() ? 'Apple Health' : 'Health Connect');
  const can = () => !!(HA() && HA().can && HA().can());
  const autoOn = () => !!(HA() && HA().on && HA().on());
  const pad = n => String(n).padStart(2, '0');
  const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const hm = m => { m = Math.round(m); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };
  const recOn = () => D.settings.recovery !== false;
  const wOn = () => !window.Watch || window.Watch.on();          // 1.33: off = no watch (watch.js)

  // [key, name, its app, the way on Android, on iPhone, what to switch on in its app (Android), (iPhone)]
  // ways: 'auto' = it shares sleep, so automatic first; 'try' = automatic may work, screenshot if not; 'shot' = screenshot first
  const WATCHES = [
    ['oneplus', 'OnePlus or OPPO', 'OHealth', 'auto', 'shot', 'In OHealth: Profile → Health Connect → Connect, and allow Sleep.', 'OnePlus and OPPO watches work with Android phones, so on this iPhone use a screenshot from OHealth.'],
    ['samsung', 'Samsung Galaxy Watch', 'Samsung Health', 'auto', 'shot', 'In Samsung Health: Settings → Health Connect, and allow Sleep.', 'Galaxy watches work with Android phones, so on this iPhone use a screenshot from Samsung Health.'],
    ['noise', 'Noise', 'NoiseFit', 'shot', 'auto', 'A screenshot is the sure way. Automatic works only if NoiseFit shares sleep with Health Connect on your phone.', 'In NoiseFit: connect Apple Health and allow Sleep.'],
    ['boat', 'boAt', 'your boAt app', 'shot', 'try', 'A screenshot is the sure way: boAt’s apps often share only steps with Health Connect, not sleep.', 'Some boAt apps share sleep with Apple Health (allow Sleep in the app); boAt Crest shares only steps, so use a screenshot.'],
    ['fireboltt', 'Fire-Boltt', 'your Fire-Boltt app', 'shot', 'try', 'A screenshot is the sure way. Automatic works only if your Fire-Boltt app shares sleep with Health Connect.', 'In Fireboltt Pro: allow Apple Health. If no sleep comes in, use a screenshot.'],
    ['apple', 'Apple Watch', 'the Health app', 'shot', 'auto', 'An Apple Watch works with an iPhone: use GymDay on your iPhone, or a screenshot of the Health app’s sleep.', 'Nothing to set up on the watch: just let GymDay read Sleep in Apple Health.'],
    ['other', 'Another watch', 'your watch’s app', 'try', 'try', 'Fitbit, Garmin, Amazfit (Zepp), Mi Fitness and others: in your watch’s app, find Health Connect and allow Sleep.', 'In your watch’s app, find Apple Health and allow Sleep.'],
  ];
  const watchOf = k => WATCHES.find(w => w[0] === k) || null;
  const mine = () => watchOf(D.settings.watch);
  const wayOf = w => (w ? w[ios() ? 4 : 3] : 'try');
  const tipOf = w => (w ? w[ios() ? 6 : 5] : '');

  function lastNight() { const P = window.Progress, n = P && P.nightOf ? P.nightOf(day0(Date.now())) : null; return n && n.sl ? n.sl : null; }      // { min, by, app, … }

  // ------------------------------------------------------------------------------------------------ the sheet
  function sheetHtml() {
    const w = mine(), n = lastNight(), way = wayOf(w);
    let h = `<h2>Sleep from your watch</h2>`;
    h += n && n.min > 0 ? `<p class="small" id="swHave">Last night: <b>${esc(hm(n.min))}</b> ${n.by === 'watch' ? `from your watch${n.app ? ' · ' + esc(n.app) : ''}` : 'typed by you'}.</p>`
      : `<p class="small muted" id="swHave">Last night’s sleep isn’t in yet.</p>`;
    h += `<div class="lbl mt12">Which watch do you wear?</div><div class="chips sw-chips" id="swWatch" role="group" aria-label="Your watch">${WATCHES.map(x => `<button class="chip ${w && w[0] === x[0] ? 'on' : ''}" data-act="swPick" data-k="${x[0]}" aria-pressed="${!!w && w[0] === x[0]}">${esc(x[1])}</button>`).join('')}</div>`;
    const none = window.Watch ? `<button class="btn ghost block mt4" data-act="watchNone" id="swNone">I don’t have a watch</button>` : '';
    if (!w) return h + `<p class="xs dim mt8">GymDay then shows the easiest way for that watch. You can change it any time.</p><button class="btn ghost block mt12" data-act="swType">✎ Type it instead</button>${none}`;
    const auto = autoCard(w, way), shot = shotCard(w, way);
    h += way === 'shot' ? shot + auto : auto + shot;
    h += `<button class="btn ghost block mt8" data-act="swType">✎ Type it instead</button>${none}`;
    return h;
  }
  function autoCard(w, way) {
    const first = way !== 'shot', tip = tipOf(w);
    let body;
    if (!can()) body = `<p class="xs dim mt4">${ios() ? 'Needs the GymDay app on your iPhone.' : 'Needs the GymDay app on your Android phone, with Health Connect.'}</p>`;
    else if (autoOn()) body = `<p class="xs mt4" id="swAutoState"><span class="green">On.</span> ${(lastNight() || {}).min > 0 ? 'It comes in by itself when you open GymDay.' : 'Nothing from your watch for last night yet.'}</p>
      <button class="btn sm block mt8" data-act="swNow">Get last night’s now</button>`;
    else body = `<button class="btn sm ${first ? 'primary' : ''} block mt8" data-act="swAutoOn">Turn on automatic</button>`;
    return `<div class="sw-way ${first ? 'sw-first' : ''}" id="swAuto"><div class="sw-h"><span class="sw-i" aria-hidden="true">⚡</span><b>Automatically, every morning</b>${first ? '<span class="sw-best">Easiest</span>' : ''}</div>
      <p class="xs muted mt4">Through ${esc(hub())}: your sleep, its stages and your resting heart rate come in by themselves.</p>
      ${tip ? `<p class="xs mt4 sw-tip" id="swTip">${esc(tip)}</p>` : ''}${body}</div>`;
  }
  function shotCard(w, way) {
    const first = way === 'shot';
    return `<div class="sw-way ${first ? 'sw-first' : ''}" id="swShot"><div class="sw-h"><span class="sw-i" aria-hidden="true">📷</span><b>From a screenshot</b>${first ? '<span class="sw-best">Easiest</span>' : ''}</div>
      <p class="xs muted mt4">Open ${esc(w[2])}, take a screenshot of last night’s sleep, then choose it here. Works with every watch.</p>
      <button class="btn sm ${first ? 'primary' : ''} block mt8" data-act="swShot">📷 Choose the screenshot</button></div>`;
  }
  const redrawSheet = () => { const p = document.querySelector('#sheet .panel'); if (p && $('#swWatch')) { p.innerHTML = sheetHtml(); } };
  ACT.sleepWatch = () => { if (!wOn()) { if (ACT.rcSleepForm) ACT.rcSleepForm(); return; } A.openSheet(sheetHtml()); };      // no watch: straight to typing it
  ACT.swPick = el => { const k = el.dataset.k; if (!watchOf(k)) return; D.settings.watch = k; S.save(true); redrawSheet(); };
  ACT.swAutoOn = () => {
    const H = HA(); if (!H || !H.turnOn) return;
    A.closeSheet(); H.turnOn();
  };
  ACT.swNow = () => { A.closeSheet(); if (ACT.hcAutoNow) ACT.hcAutoNow(); };
  ACT.swShot = () => { A.closeSheet(); if (ACT.rcSleepShots) ACT.rcSleepShots(); };
  ACT.swType = () => { A.closeSheet(); if (ACT.rcSleepForm) ACT.rcSleepForm(); };

  // ------------------------------------------------------------------------------------------------ the card on Today
  function homeCard() {
    if (!recOn() || !wOn()) return '';
    if (window.__tips === false && !window.__swCard) return '';          // tests: off in the quiet mode the other suites use
    const now = new Date(), hr = now.getHours(); if (hr < 4 || hr >= 20) return '';        // the morning after, until the evening
    const n = lastNight(); if (n && n.min > 0) return '';
    if (M.swHide === keyOf(now)) return '';
    const w = mine(), sub = autoOn() ? `Automatic is on, but nothing came from your watch yet.` : w ? (wayOf(w) === 'shot' ? `A screenshot from ${w[2]} brings it in.` : `Bring it in from ${w[2]}.`) : 'Bring it in from your watch, or type it.';
    return `<div class="card sw-card" id="swCard"><div class="row" style="gap:10px;align-items:flex-start"><span class="sw-ci" aria-hidden="true">😴</span><div class="grow"><div class="title" style="font-size:calc(16px * var(--fs))">Last night’s sleep isn’t in yet</div>
      <div class="xs muted mt4">${esc(sub)}</div></div><button class="sw-x" data-act="swHide" aria-label="Not today">✕</button></div>
      <button class="btn sm primary block mt12" data-act="sleepWatch">⌚ Get it from your watch</button></div>`;
  }
  ACT.swHide = () => { M.swHide = keyOf(Date.now()); if (S.saveMeta) S.saveMeta(); const c = $('#swCard'); if (c) c.remove(); };
  if (window.Today && window.Today.top) { const top0 = window.Today.top; window.Today.top = () => homeCard() + top0(); }
  window.SleepWatch = { WATCHES, sheetHtml, homeCard, watchOf, ios };
})();
