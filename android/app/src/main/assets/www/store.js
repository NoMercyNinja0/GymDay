/* GymDay – data layer. Persists through the Android bridge when present, otherwise localStorage. */
(function () {
  const A = window.Android;
  const isAndroid = !!(A && typeof A.load === 'function');

  const DEFAULT = {
    v: 1,
    settings: { unit: 'kg', rest: 90, autoRest: true, vibrate: true, reps: true, askSave: true },
    ex: {},          // id -> { max, maxDate, notes, photos:[], video }
    customEx: [],    // user-added exercises
    days: [],        // { id, name, created, items:[{ex, sets, reps}] }
    sessions: [],    // finished sessions
    body: [],        // body-weight entries { id, t, kg }
    meas: [],        // body measurements { id, t, site, v }
    food: [],        // things eaten { id, t, name, kcal, p }
    myFoods: [],     // foods the user saved { id, name, kcal, p, per }
    gone: {},        // deleted records: key -> when (so a delete reaches the user's other devices)
    active: null     // session in progress (stays on this device)
  };

  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  function loadRaw() {
    try {
      const s = isAndroid ? A.load() : localStorage.getItem('gymday');
      if (s) return JSON.parse(s);
    } catch (e) { console.warn('load failed', e); }
    return null;
  }

  // 1.30: the meal plan saved what you eat as 'v' / 'e' / 'n'; everything else reads 'veg' / 'egg' / 'nonveg'
  const DIET_LONG = { v: 'veg', e: 'egg', n: 'nonveg' };
  // 1.35.2: calmer at first. A new phone starts with these extras off, and a phone from before 1.35.2 switches to them once
  // (the owner asked for that on his own phone too). Every one is still in Settings → More features, to switch back on.
  // Today's page starts with five kinds of card (CALM_HIDE are the others, in Arrange this page). Tests keep the old ways
  // with window.__calm = false.
  const CALM = { askSave: false, deload: false, stuck: false, setAsk: false, patterns: false, strength: false, kcSmart: false, pNudge: false, brief: false, wrap: false, ckOn: false };
  const CALM_HIDE = ['sleepw', 'week7', 'fuel', 'shot', 'goals', 'stuck', 'easy', 'rec', 'busy', 'bal', 'pat', 'miss', 'harder', 'mile', 'wrapd'];
  function tidySettings(s) {
    if (DIET_LONG[s.diet]) s.diet = DIET_LONG[s.diet];
    if (!s.calm2 && window.__calm !== false) {
      Object.assign(s, CALM); s.calm2 = 1;
      if (s.home && (Array.isArray(s.home.order) || Array.isArray(s.home.hide))) s.home = { order: Array.isArray(s.home.order) ? s.home.order : [], hide: CALM_HIDE.slice() };
    }
    return s;
  }
  const data = Object.assign({}, DEFAULT, loadRaw() || {});
  data.settings = tidySettings(Object.assign({}, DEFAULT.settings, data.settings || {}));
  if (!data.gone) data.gone = {};
  // lists that travel with the account besides days and workouts: [key in the data, prefix of its change stamps]
  const LISTS = [['body', 'b:'], ['meas', 'm:'], ['food', 'f:'], ['myFoods', 'y:'], ['recipes', 'r:'], ['supps', 'n:'], ['splans', 'q:'], ['slog', 'l:'], ['places', 'w:'], ['acts', 'a:'], ['checks', 'z:'], ['sports', 'p:']];      // v1.8: my recipes, pinned supplements; v1.10: supplement schedules and the days changed; v1.11: restaurants eaten at
  for (const [k] of LISTS) if (!Array.isArray(data[k])) data[k] = [];

  // ---------- this device only: sign-in and sync bookkeeping (never part of the synced data) ----------
  function loadMeta() {
    try { const s = (isAndroid && A.metaLoad) ? A.metaLoad() : localStorage.getItem('gymday-meta'); if (s) return JSON.parse(s) || {}; } catch (e) { console.warn('meta load failed', e); }
    return {};
  }
  const meta = loadMeta();
  function saveMeta() {
    const s = JSON.stringify(meta);
    try { if (isAndroid && A.metaSave) A.metaSave(s); else localStorage.setItem('gymday-meta', s); } catch (e) { console.warn('meta save failed', e); }
  }

  // ---------- change stamps (for syncing between devices) ----------
  // Every record carries u = when it last changed, and a deleted record leaves a note in data.gone.
  // Both are worked out here at save time by comparing with the last saved copy, so no screen has to remember to.
  const exEmpty = d => !d || (!d.max && !d.orm && !String(d.notes || '').trim() && !(d.photos || []).length && !d.video && !d.fav && !d.hide && !d.goal);
  function records() {
    const out = [];
    for (const d of data.days) out.push(['d:' + d.id, d]);
    for (const s of data.sessions) out.push(['s:' + s.id, s]);
    for (const c of data.customEx) out.push(['c:' + c.id, c]);
    for (const [k, pre] of LISTS) for (const r of (data[k] || [])) out.push([pre + r.id, r]);
    for (const id in data.ex) if (!exEmpty(data.ex[id])) out.push(['x:' + id, data.ex[id]]);
    out.push(['set', data.settings]);
    return out;
  }
  const sig = rec => JSON.stringify(rec, (k, v) => (k === 'u' ? undefined : v));
  let snap = {};
  function resnap() { snap = {}; for (const [k, rec] of records()) snap[k] = sig(rec); }
  function stamp() {
    const now = Date.now(), seen = {};
    if (!data.gone) data.gone = {};
    for (const [k, rec] of records()) {
      seen[k] = 1; const s = sig(rec);
      if (snap[k] !== s) { rec.u = now; snap[k] = s; delete data.gone[k]; }
    }
    // v1.23 Recently deleted: what this save finds gone is kept on this phone for 30 days (snap holds its last saved text).
    // A big sweep in one go (a restored backup, "Delete all my data") is not a slip of the finger and is left out.
    const lost = Object.keys(snap).filter(k => !seen[k]), keep = !binOff && lost.length <= 150;
    let dirty = false;
    for (const k of lost) {
      if (keep && k !== 'set' && !BIN_SKIP.some(p => k.startsWith(p))) { if (!Array.isArray(meta.bin)) meta.bin = []; meta.bin.push({ k, j: snap[k], at: now }); dirty = true; }
      delete snap[k]; data.gone[k] = now;
    }
    if (Array.isArray(meta.bin) && meta.bin.length) {            // back again (Undo, or restored), or older than 30 days: out of the bin
      const n = meta.bin.length;
      meta.bin = meta.bin.filter(b => !seen[b.k] && now - b.at < BIN_DAYS * 86400000).slice(-BIN_MAX);
      if (dirty || meta.bin.length !== n) saveMeta();
    }
  }
  const BIN_DAYS = 30, BIN_MAX = 300, BIN_SKIP = ['l:', 'x:'];      // not kept: a supplement's day notes, an exercise's emptied record
  let binOff = false;
  // put deleted records back: [key@when, …]. Each gets a new change stamp, so the other devices get it back too.
  function binRestore(ids) {
    const want = new Set(ids); let n = 0;
    for (const b of (meta.bin || [])) {
      if (!want.has(b.k + '@' + b.at)) continue;
      let rec; try { rec = JSON.parse(b.j); } catch (e) { continue; }
      const pre = b.k.slice(0, 2), id = b.k.slice(2), l = LISTS.find(x => x[1] === pre);
      const list = pre === 'd:' ? data.days : pre === 's:' ? data.sessions : pre === 'c:' ? data.customEx : l ? (data[l[0]] = data[l[0]] || []) : null;
      if (!list || list.some(r => String(r.id) === id)) continue;
      list.push(rec); n++;
    }
    if (n) { data.sessions.sort((a, b) => b.start - a.start); save(true); }
    return n;
  }
  const bin = { list: () => (Array.isArray(meta.bin) ? meta.bin : []), restore: binRestore, empty: () => { meta.bin = []; saveMeta(); }, DAYS: BIN_DAYS };
  resnap();

  function write() {
    const s = JSON.stringify(data);
    try { if (isAndroid) A.save(s); else localStorage.setItem('gymday', s); } catch (e) { console.warn('save failed', e); }
  }

  let saveTimer = null;
  function save(now) {
    if (saveTimer) clearTimeout(saveTimer);
    const doSave = () => { saveTimer = null; stamp(); write(); };
    if (now) doSave(); else saveTimer = setTimeout(doSave, 400);   // one write after a burst of typing, not one per key
    if (window.Cloud) window.Cloud.touch();
  }
  // A change still waiting for its write is written at once when the page is closed, reloaded or put in the background.
  const flushSave = () => { if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; stamp(); write(); } };
  window.addEventListener('pagehide', flushSave);
  document.addEventListener('visibilitychange', () => { if (document.hidden) flushSave(); });

  // ---------- syncing: what goes to the account, and how two copies are combined ----------
  // Same text for the same content whatever order the keys are in (the server reorders keys).
  function stable(v) {
    if (v === null || typeof v !== 'object') return JSON.stringify(v === undefined ? null : v);
    if (Array.isArray(v)) return '[' + v.map(stable).join(',') + ']';
    return '{' + Object.keys(v).filter(k => v[k] !== undefined).sort().map(k => JSON.stringify(k) + ':' + stable(v[k])).join(',') + '}';
  }
  function hash(str) {
    let h1 = 0xdeadbeef, h2 = 0x41c6ce57;
    for (let i = 0, ch; i < str.length; i++) { ch = str.charCodeAt(i); h1 = Math.imul(h1 ^ ch, 2654435761); h2 = Math.imul(h2 ^ ch, 1597334677); }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
  }
  // Everything except the workout in progress.
  function syncDoc() {
    stamp();
    const ex = {}; for (const id in data.ex) if (!exEmpty(data.ex[id])) ex[id] = data.ex[id];
    return JSON.parse(JSON.stringify({ v: data.v || 1, settings: data.settings, ex, customEx: data.customEx, days: data.days, sessions: data.sessions, body: data.body || [], meas: data.meas || [], food: data.food || [], myFoods: data.myFoods || [], recipes: data.recipes || [], supps: data.supps || [], splans: data.splans || [], slog: data.slog || [], places: data.places || [], acts: data.acts || [], checks: data.checks || [], sports: data.sports || [], gone: data.gone || {} }));
  }
  // a = this device, b = the account. Record by record the newer one wins (the account's on a tie),
  // a record only one side has is kept, and a delete wins over anything older than it.
  function mergeDocs(a, b) {
    a = a || {}; b = b || {};
    const gone = Object.assign({}, b.gone || {});
    for (const k in (a.gone || {})) gone[k] = Math.max(gone[k] || 0, a.gone[k]);
    const alive = (k, rec) => !(gone[k] && gone[k] >= (rec.u || 0));
    // The account's order comes first and anything only this device has is added after it. Every device
    // follows the same rule, so they all end up with the same order instead of taking turns rewriting it.
    const list = (la, lb, pre) => {
      const map = new Map(), order = [];
      for (const r of lb || []) { if (r && r.id != null && !map.has(r.id)) { map.set(r.id, r); order.push(r.id); } }
      for (const r of la || []) {
        if (!r || r.id == null) continue;
        const cur = map.get(r.id);
        if (!cur) { map.set(r.id, r); order.push(r.id); } else if ((r.u || 0) > (cur.u || 0)) map.set(r.id, r);
      }
      return order.map(id => map.get(id)).filter(r => alive(pre + r.id, r));
    };
    const out = { v: Math.max(a.v || 1, b.v || 1) };
    const sa = a.settings || {}, sb = b.settings || {};
    out.settings = (b.settings && (sb.u || 0) >= (sa.u || 0)) ? sb : sa;
    out.ex = {};
    for (const id in (b.ex || {})) if (!exEmpty(b.ex[id])) out.ex[id] = b.ex[id];
    for (const id in (a.ex || {})) {
      const r = a.ex[id]; if (exEmpty(r)) continue;
      const cur = out.ex[id];
      if (!cur || (r.u || 0) > (cur.u || 0)) out.ex[id] = r;
    }
    for (const id in out.ex) if (!alive('x:' + id, out.ex[id])) delete out.ex[id];
    out.customEx = list(a.customEx, b.customEx, 'c:');
    out.days = list(a.days, b.days, 'd:');
    out.body = list(a.body, b.body, 'b:').sort((x, y) => (y.t || 0) - (x.t || 0));
    out.meas = list(a.meas, b.meas, 'm:').sort((x, y) => (y.t || 0) - (x.t || 0));
    out.food = list(a.food, b.food, 'f:').sort((x, y) => (y.t || 0) - (x.t || 0));
    out.myFoods = list(a.myFoods, b.myFoods, 'y:');
    out.recipes = list(a.recipes, b.recipes, 'r:');
    out.supps = list(a.supps, b.supps, 'n:');
    out.splans = list(a.splans, b.splans, 'q:');
    out.places = list(a.places, b.places, 'w:');
    out.acts = list(a.acts, b.acts, 'a:');
    out.sports = list(a.sports, b.sports, 'p:');                             // v1.17: activities added on the Food tab (sports.js)
    out.checks = list(a.checks, b.checks, 'z:');                             // v1.13: sleep and how sore, one a day (Recovery)                                   // v1.13: a day's activity read from watch screenshots
    out.slog = list(a.slog, b.slog, 'l:');
    out.sessions = list(a.sessions, b.sessions, 's:').sort((x, y) => ((y.start || 0) - (x.start || 0)) || (String(x.id) < String(y.id) ? -1 : 1));
    const old = Date.now() - 400 * 86400000;
    out.gone = {}; for (const k in gone) if (gone[k] > old) out.gone[k] = gone[k];
    return JSON.parse(JSON.stringify(out));
  }
  // Put a combined copy in place of what is in memory (the objects every screen already holds stay the same ones).
  function applyDoc(doc) {
    const active = data.active;
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, JSON.parse(JSON.stringify(DEFAULT)), JSON.parse(JSON.stringify(doc)));
    data.settings = tidySettings(Object.assign({}, DEFAULT.settings, data.settings || {}));
    if (!data.gone) data.gone = {};
    for (const [k] of LISTS) if (!Array.isArray(data[k])) data[k] = [];
    data.active = active;
    resnap();
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    write();
  }
  // Empty this device without leaving delete notes behind (used when switching account or signing out):
  // a note left here would later delete the same things from whichever account signs in next.
  function wipeLocal() {
    for (const id in data.ex) for (const p of (data.ex[id].photos || [])) deletePhoto(p);
    data.active = null;
    applyDoc({});
  }
  function hasData() { return !!(data.days.length || data.sessions.length || data.customEx.length || LISTS.some(([k]) => (data[k] || []).length) || Object.keys(data.ex).some(id => !exEmpty(data.ex[id]))); }

  // ---------- photos ----------
  const photoCache = {};
  function savePhoto(id, dataUrl) {
    photoCache[id] = dataUrl;
    if (isAndroid) return A.savePhoto(id, dataUrl);
    try { localStorage.setItem('gymday-photo-' + id, dataUrl); return true; } catch (e) { return false; }
  }
  // a photo fetched from the account: keep it for this visit even if the browser has no room to store it
  function cachePhoto(id, dataUrl) { if (!savePhoto(id, dataUrl)) photoCache[id] = dataUrl; }
  function loadPhoto(id) {
    if (photoCache[id]) return photoCache[id];
    let d = '';
    if (isAndroid) d = A.loadPhoto(id); else d = localStorage.getItem('gymday-photo-' + id) || '';
    if (d) photoCache[id] = d;
    return d;
  }
  // Each setup photo can have a small preview stored as 't_<id>'. When signed in, the full photo lives in the
  // account and only the preview stays on the phone (cloud.js); in phone-only mode the full photo stays here.
  function dropFull(id) {
    delete photoCache[id];
    if (isAndroid) A.deletePhoto(id); else localStorage.removeItem('gymday-photo-' + id);
  }
  function deletePhoto(id) { dropFull(id); dropFull('t_' + id); }
  const showPhoto = id => loadPhoto('t_' + id) || loadPhoto(id);        // what a small tile shows
  function memPhoto(id, dataUrl) { photoCache[id] = dataUrl; }           // held for this visit only, never stored

  // ---------- exercises ----------
  const GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Quads', 'Hamstrings', 'Glutes', 'Calves', 'Core', 'Cardio'];
  const EQUIP = ['Barbell', 'Dumbbell', 'Cable', 'Machine', 'Smith', 'Bodyweight', 'Cardio', 'Other'];

  function allExercises() { return window.EXERCISES.concat(data.customEx || []); }
  function getEx(id) { return allExercises().find(e => e.id === id); }
  function exData(id) {
    if (!data.ex[id]) data.ex[id] = { max: null, maxDate: null, notes: '', photos: [], video: '' };
    const d = data.ex[id];
    if (!d.photos) d.photos = [];
    return d;
  }

  // ---------- days ----------
  function addDay(name, items) {
    const d = { id: uid(), name: name || 'New day', created: Date.now(), items: items || [] };
    data.days.push(d); save(); return d;
  }
  function getDay(id) { return data.days.find(d => d.id === id); }
  function deleteDay(id) { data.days = data.days.filter(d => d.id !== id); save(); }

  // ---------- sessions / stats ----------
  function sessionsFor(exId) {
    const out = [];
    for (const s of data.sessions) {
      for (const it of s.items) {
        if (it.ex === exId && !it.skipped) {
          const done = (it.sets || []).filter(x => x.done);
          // warm-up sets are logged, but records, targets and charts are about the working sets (all: every ticked set)
          const hard = done.filter(x => x.kind !== 'w');
          if (done.length) out.push({ session: s, sets: hard.length ? hard : done, all: done, item: it });      // item: v1.25 (its own timer, its usual number of sets)
        }
      }
    }
    return out.sort((a, b) => b.session.start - a.session.start);
  }
  // the starting point for next time: the latest workout whose numbers the owner chose to keep
  function lastFor(exId) { return sessionsFor(exId).find(r => r.session.keep !== false) || null; }
  function bestFor(exId) {
    let best = null;
    for (const r of sessionsFor(exId)) for (const s of r.sets) {
      const w = +s.w || 0, reps = +s.r || 0;
      if (!best || w > best.w || (w === best.w && reps > best.r)) best = { w, r: reps, date: r.session.start };
    }
    return best;
  }
  function dayStats(dayId) {
    const ss = data.sessions.filter(s => s.dayId === dayId);
    return { count: ss.length, last: ss.length ? Math.max(...ss.map(s => s.start)) : null };
  }

  // ---------- backup ----------
  function exportJSON() {
    const photos = {};
    for (const id in data.ex) for (const p of (data.ex[id].photos || [])) { const d = loadPhoto(p) || loadPhoto('t_' + p); if (d) photos[p] = d; }
    return JSON.stringify({ app: 'gymday', exported: Date.now(), data, photos });
  }
  function importJSON(str) {
    const obj = JSON.parse(str);
    if (!obj || obj.app !== 'gymday' || !obj.data) throw new Error('Not a GymDay backup');
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, JSON.parse(JSON.stringify(DEFAULT)), obj.data);
    data.settings = tidySettings(Object.assign({}, DEFAULT.settings, data.settings || {}));
    if (!data.gone) data.gone = {};
    for (const id in (obj.photos || {})) savePhoto(id, obj.photos[id]);
    binOff = true; try { save(true); } finally { binOff = false; }
  }
  function resetAll() {
    for (const id in data.ex) for (const p of (data.ex[id].photos || [])) deletePhoto(p);
    Object.keys(data).forEach(k => delete data[k]);
    Object.assign(data, JSON.parse(JSON.stringify(DEFAULT)));
    binOff = true; try { save(true); } finally { binOff = false; }
    meta.bin = []; saveMeta();                                   // "Delete all my data" means all of it
  }

  // How long a workout took: from its start to its end, without the time it was paused.
  const gymMs = s => Math.max(0, (s.end || s.start) - s.start - (s.paused || 0));
  // The same for the workout that is running now (frozen while it is paused).
  const liveMs = (a, now) => Math.max(0, (a.pauseAt || now || Date.now()) - a.start - (a.paused || 0));
  // a ticked set that counts as work (a warm-up set does not)
  const work = x => !!x.done && x.kind !== 'w';
  window.Store = { CALM, CALM_HIDE, data, save, uid, isAndroid, gymMs, liveMs, work, GROUPS, EQUIP, allExercises, getEx, exData, addDay, getDay, deleteDay,
    sessionsFor, lastFor, bestFor, dayStats, savePhoto, loadPhoto, deletePhoto, dropFull, showPhoto, memPhoto, cachePhoto, exportJSON, importJSON, resetAll,
    meta, saveMeta, exEmpty, stable, hash, syncDoc, mergeDocs, applyDoc, wipeLocal, hasData, bin };
})();
