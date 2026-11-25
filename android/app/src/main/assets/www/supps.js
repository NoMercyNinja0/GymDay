/* GymDay v1.10 – supplements, and the day's vitamins and minerals.

   What you take (D.splans, synced): a multivitamin, omega-3, vitamin D, zinc… from the list of Indian brands and plain
   versions in suppdata.js, your own product read from a photo of its label or typed in, or a pinned protein / creatine
   (food.js). Each one has a dose, how many times a day, and how often: every day, every other day, every few days, set
   weekdays or once a week. Days it is due count as taken automatically (when "add it for me" is on); a day you skipped,
   or took more or less, is kept in D.slog. A protein or creatine with a schedule is added to the food diary instead,
   because it has calories.

   The day's vitamins and minerals: the food diary (foodmicro.js: 25 vitamins and minerals for the food list, loaded only
   when needed; My recipes through their ingredients) plus supplements, against the day's need for the person's age and
   sex (ICMR-NIN 2020) and the safe upper limits. */
(function () {
  const A = window.App, S = window.Store, D = S && S.data, SD = window.SUPPDATA;
  if (!A || !D || !SD) return;
  const { $, esc, ACT, VIEWS } = A;
  const toast = m => window.toast(m);
  const undoToast = (m, undo) => (window.Motion && window.Motion.undoToast ? window.Motion.undoToast(m, undo) : toast(m));
  const DAY = 86400000;
  const num = v => { const x = parseFloat(String(v == null ? '' : v).replace(',', '.')); return isFinite(x) ? x : 0; };
  const fold = s => String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9%]+/g, ' ').trim();
  const lists = () => { for (const k of ['splans', 'slog']) if (!Array.isArray(D[k])) D[k] = []; };
  lists();
  const NUT = {}; SD.NUTS.forEach(([k, name, unit, short, kind, dp]) => { NUT[k] = { k, name, unit, short, kind, dp }; });
  const KEYS = SD.KEYS;
  const CATI = new Map(SD.CAT.map(c => [c.id, c]));
  const vib = () => { try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(8); } catch (e) { } };

  // ---------------------------------------------------------------- numbers
  const fmtN = v => { v = +v || 0; const a = Math.abs(v), dp = a >= 100 ? 0 : a >= 1 ? 1 : a >= 0.1 ? 2 : 3; return (+v.toFixed(dp)).toLocaleString('en-US', { maximumFractionDigits: dp }); };
  const amt = (v, k) => `${fmtN(v)} ${NUT[k].unit}` + (k === 'vd' && v > 0 ? ` (${Math.round(v * 40).toLocaleString('en-US')} IU)` : '');
  const fmtQ = q => { q = Math.round(q * 100) / 100; const w = Math.floor(q), f = q - w; return Math.abs(f - 0.5) < 0.01 ? (w || '') + '½' : Math.abs(f - 0.25) < 0.01 ? (w || '') + '¼' : String(q); };
  const pctOf = (v, need) => (need > 0 ? Math.round(v / need * 100) : 0);
  // for a list: vitamin D in IU, as Indian packs print it; 10 times the need and more as "×"
  const rowAmt = (v, k) => (k === 'vd' ? `${Math.round(v * 40).toLocaleString('en-US')} IU` : `${fmtN(v)} ${NUT[k].unit}`);
  const rowNeed = (v, k) => (k === 'vd' ? Math.round(v * 40).toLocaleString('en-US') : fmtN(v));
  const pctText = s => (s.pct >= 1000 ? `${Math.round(s.v / s.need)}×` : `${s.pct}%`);

  // ---------------------------------------------------------------- days ('2026-11-16', the phone's own calendar)
  const pad = n => String(n).padStart(2, '0');
  const keyOf = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const startOf = key => { const [y, m, d] = key.split('-').map(Number); return new Date(y, m - 1, d).getTime(); };
  const addDays = (key, n) => { const [y, m, d] = key.split('-').map(Number); return keyOf(new Date(y, m - 1, d + n, 12).getTime()); };
  const between = (a, b) => Math.round((startOf(b) - startOf(a)) / DAY);
  const today = () => keyOf(Date.now());
  const wday = key => new Date(startOf(key)).getDay();
  const WD = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'], WD1 = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dayText = key => { const t = today(); if (key === t) return 'Today'; if (key === addDays(t, -1)) return 'Yesterday'; if (key === addDays(t, 1)) return 'Tomorrow'; const d = new Date(startOf(key)); return `${WD[d.getDay()]}, ${d.getDate()} ${MON[d.getMonth()]}`; };
  const shortDate = key => { const d = new Date(startOf(key)); return `${d.getDate()} ${MON[d.getMonth()]}`; };

  // ---------------------------------------------------------------- what each plan is
  // plan: { id, ref: 'c:<list id>' | 'n:<pinned supplement id>' | '' (own: { b, n, form, per, pic }), per (own numbers for a listed one),
  //         d: units each time, x: times a day, fr: day | alt | n | days | week, n: every n days, days: [weekdays], when, auto, runs: [[from, to]] }
  function prodOf(p) {
    if (!p) return null;
    const r = p.ref || '';
    if (r.startsWith('c:')) {
      const c = CATI.get(r.slice(2)); if (!c) return null;
      return { b: c.b, n: c.n, form: c.form, per: p.per || c.per, src: p.per ? 'Your numbers (changed from the list)' : c.src, note: c.note, cat: c.cat, kind: 'cat', listed: c };
    }
    if (r.startsWith('n:')) {
      const sp = (D.supps || []).find(x => String(x.id) === r.slice(2)); if (!sp) return null;
      return { b: sp.brand || '', n: sp.name || '', form: 'serving', serv: sp.serv || '1 serving', per: sp.m || {}, kind: 'pin', sp, macro: true, src: 'Your pinned supplement' };
    }
    const o = p.own || {};
    return { b: o.b || '', n: o.n || 'My supplement', form: o.form || 'tablet', per: o.per || {}, kind: 'own', pic: o.pic || '', src: o.src || 'Your own numbers', note: o.note || '' };
  }
  const nameOf = pr => (pr ? [pr.b, pr.n].map(s => String(s || '').trim()).filter(Boolean).join(' ') || 'Supplement' : 'Removed supplement');
  const unitW = (pr, n) => {
    if (!pr) return '';
    if (pr.kind === 'pin') return pr.serv.replace(/^1\s+/, '') + (n === 1 ? '' : '');
    const f = SD.FORMS[pr.form] || [pr.form, pr.form + 's']; return n === 1 ? f[0] : f[1];
  };
  const doseText = (pr, n) => (pr && pr.kind === 'pin' ? `${fmtQ(n)} × ${unitW(pr, n)}` : `${fmtQ(n)} ${unitW(pr, n)}`);
  const perDay = p => Math.max(0, num(p.d) || 1) * Math.max(1, Math.round(num(p.x)) || 1);
  const WHEN = [['am', 'Morning'], ['bf', 'With breakfast'], ['lu', 'After lunch'], ['pm', 'Evening'], ['nt', 'Night']];
  const whenText = p => (WHEN.find(w => w[0] === p.when) || [, ''])[1];
  function freqText(p) {
    const x = Math.max(1, p.x || 1), t = x === 2 ? 'twice' : x === 3 ? '3 times' : '';
    const on = (p.days || []).slice().sort((a, b) => a - b);
    switch (p.fr) {
      case 'alt': return (t ? t + ' a day, ' : '') + 'every other day';
      case 'n': return (t ? t + ' a day, ' : '') + `every ${Math.max(2, p.n || 2)} days`;
      case 'days': return (t ? t + ' a day on ' : 'On ') + (on.length ? on.map(d => WD[d]).join(', ') : 'no days yet');
      case 'week': return (t ? t + ' a day, ' : '') + 'once a week' + (on.length ? ` (${WD[on[0]]})` : '');
      default: return t ? t + ' a day' : 'every day';
    }
  }
  const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
  const runOf = (p, key) => (p.runs || []).find(([a, b]) => key >= a && (!b || key <= b));
  const paused = p => !(p.runs || []).some(([, b]) => !b);
  function due(p, key) {
    const run = runOf(p, key); if (!run) return false;
    const from = run[0];
    switch (p.fr) {
      case 'alt': return between(from, key) % 2 === 0;
      case 'n': return between(from, key) % Math.max(2, p.n || 2) === 0;
      case 'days': return (p.days || []).includes(wday(key));
      case 'week': return (p.days && p.days.length ? p.days.slice(0, 1) : [wday(from)]).includes(wday(key));
      default: return true;
    }
  }
  // the next day it is due, from (and including) a day, within a month
  function nextDue(p, key) { for (let i = 0; i < 32; i++) { const k = addDays(key, i); if (due(p, k)) return k; } return ''; }

  // ---------------------------------------------------------------- what was taken on a day
  const logId = (p, key) => p.id + '@' + key;
  const logOf = (p, key) => (D.slog || []).find(l => l.id === logId(p, key));
  const spans = new Map();
  const inDay = (e, key) => { let r = spans.get(key); if (!r) { r = [startOf(key), startOf(addDays(key, 1))]; spans.set(key, r); } return e.t >= r[0] && e.t < r[1]; };
  const macroEntries = (p, key) => (D.food || []).filter(e => e.sp === p.id && inDay(e, key));
  const isMacro = p => (p.ref || '').startsWith('n:');
  // units taken that day: what was ticked or changed, else the dose when it was due (up to today) and "add it for me" is on
  function takenOn(p, key) {
    if (isMacro(p)) return macroEntries(p, key).reduce((a, e) => a + (num(e.q) || 1), 0);
    const l = logOf(p, key); if (l) return Math.max(0, num(l.n));
    return key <= today() && p.auto !== false && due(p, key) ? perDay(p) : 0;
  }
  const changedOn = (p, key) => !!logOf(p, key);
  function setLog(p, key, n) {
    lists();
    const id = logId(p, key), i = D.slog.findIndex(l => l.id === id);
    const def = p.auto !== false && due(p, key) ? perDay(p) : 0;
    if (n === def && !isMacro(p)) { if (i >= 0) D.slog.splice(i, 1); return; }
    const rec = { id, p: p.id, d: key, n: Math.round(n * 100) / 100 };
    if (i >= 0) D.slog[i] = Object.assign({}, D.slog[i], rec); else D.slog.push(rec);
  }
  // a protein or creatine: the food diary holds it (it has calories). One entry a day, with a fixed id so two phones agree.
  const mealOfWhen = w => ({ am: 'b', bf: 'b', lu: 'l', pm: 'es', nt: 'd' })[w] || '';
  const autoId = (p, key) => `sp-${p.id}-${key.replace(/-/g, '')}`;
  function addMacro(p, key, n) {
    const pr = prodOf(p), F = window.Food; if (!pr || !F || !F.suppFood || !F.entryOf) return null;
    const meal = mealOfWhen(p.when) || (key === today() ? F.mealAt(Date.now()) : 'b');
    const m = (F.MEALS || []).find(x => x[0] === meal), d = new Date(startOf(key)); d.setHours(m ? m[2] : 8, 0, 0, 0);
    const t = key === today() ? Math.min(Date.now(), d.getTime()) : d.getTime();
    const e = F.entryOf(F.suppFood(pr.sp), n, 0, meal, t);
    e.id = autoId(p, key); e.sp = p.id;
    D.food.push(e); return e;
  }
  function setTaken(p, key, n) {
    n = Math.max(0, Math.round(n * 100) / 100);
    if (isMacro(p)) {
      const ids = new Set(macroEntries(p, key).map(e => e.id)); D.food = D.food.filter(e => !ids.has(e.id));
      if (n > 0) addMacro(p, key, n);
      const i = D.slog.findIndex(l => l.id === logId(p, key));
      if (n === 0) { const rec = { id: logId(p, key), p: p.id, d: key, n: 0 }; if (i >= 0) D.slog[i] = Object.assign({}, D.slog[i], rec); else D.slog.push(rec); }
      else if (i >= 0) D.slog.splice(i, 1);
    } else setLog(p, key, n);
    S.save(true);
  }
  // add today's protein / creatine doses that are due (once; a deleted or unticked one stays away)
  let ticked = '';
  function tick() {
    lists();
    const key = today(); let added = 0;
    for (const p of D.splans) {
      if (!isMacro(p) || p.auto === false || !due(p, key) || macroEntries(p, key).length || logOf(p, key)) continue;
      if (D.gone && D.gone['f:' + autoId(p, key)]) continue;
      if (addMacro(p, key, perDay(p))) added++;
    }
    if (added) S.save(true);
    ticked = key; return added;
  }

  // ---------------------------------------------------------------- vitamins and minerals of the food list
  let FM = null, fmWait = null; const rows = new Map();
  function loadMicro() {
    if (FM) return Promise.resolve(FM);
    if (window.FOODMICRO) { FM = window.FOODMICRO; return Promise.resolve(FM); }
    if (!fmWait) fmWait = new Promise((res, rej) => {
      const s = document.createElement('script'); s.src = 'foodmicro.js'; s.async = true;
      s.onload = () => { FM = window.FOODMICRO || null; if (FM) res(FM); else { fmWait = null; rej(new Error('no data')); } };
      s.onerror = () => { fmWait = null; s.remove(); rej(new Error("The vitamin list couldn't be opened")); };
      document.head.appendChild(s);
    });
    return fmWait;
  }
  const ready = () => !!(FM || window.FOODMICRO);
  // per 100 g of a food in the list, in the order of SD.KEYS (FM.k is the same order); null where the table has no number
  function rowOf(fid) {
    if (!FM && window.FOODMICRO) FM = window.FOODMICRO;
    if (!FM) return null;
    if (rows.has(fid)) return rows.get(fid);
    const s = FM.d[fid]; let r = null;
    if (s != null) { const parts = s.split(','); r = KEYS.map((k, i) => (parts[i] === undefined || parts[i] === '' ? null : +parts[i])); }
    rows.set(fid, r); return r;
  }
  const addTo = (o, per, k) => { for (const key in per) if (per[key] > 0 && NUT[key]) o[key] = (o[key] || 0) + per[key] * k; };
  // v1.14: home cooking with less or more salt than usual (asked with the oil question): the sodium of the home dishes in the list
  // (FOODMICRO.s) is scaled to the less salty or the saltier quarter of the Indian tables' salted dishes. Not for food eaten out.
  // v1.21.7: also No salt (only what the ingredients have: at most 60 mg in 100 g, the line below which a dish counts as unsalted),
  // and one food can have its own level (its entry's `salt`), which wins over the home setting, eaten out too.
  const SALT_K = { less: 0.7, more: 1.6 }, SALT_CAP = 60, SALT_LEVELS = [['none', 'No salt'], ['less', 'Less'], ['usual', 'Usual'], ['more', 'More']];
  let saltIds = null, orsIds = null;
  const okLevel = v => v === 'none' || v === 'usual' || !!SALT_K[v];
  const homeSalt = () => { const v = (D.settings || {}).salt; return okLevel(v) ? v : 'usual'; };
  // the salt a food is counted with: its own, else usual when eaten out, else the home setting
  const saltLevel = e => (e && okLevel(e.salt) ? e.salt : e && (e.out || e.at) ? 'usual' : homeSalt());
  function isSalted(fid) {
    if (!saltIds) { const F = FM || window.FOODMICRO; if (!F || !F.s) return false; saltIds = new Set(String(F.s).split(',')); }
    return saltIds.has(String(fid));
  }
  function isOrs(fid) {
    if (!orsIds) { const F = FM || window.FOODMICRO; if (!F) return false; orsIds = new Set(String(F.ors || '').split(',').filter(Boolean)); }
    return orsIds.has(String(fid));
  }
  // the sodium in 100 g of a food, at the salt it was cooked with
  function saltNa(fid, e, na) {
    if (!(na > 0) || !isSalted(fid)) return na;
    const lv = saltLevel(e);
    return lv === 'none' ? Math.min(na, SALT_CAP) : na * (SALT_K[lv] || 1);
  }
  // does an entry hold a home dish the salt changes? (its food, or one of a photo meal's foods)
  function saltable(e) {
    if (!e || e.src === 'left' || (!FM && !window.FOODMICRO)) return false;
    if (e.fid && isSalted(e.fid)) return true;
    const pp = partsOf(e); return !!(pp && pp.parts.some(p => isSalted(p.fid)));
  }
  // v1.14: the foods of an entry with their grams: a food from the list; each line of a photo meal (its food, or its name's food);
  // a typed food or a web answer (its name's food, for the grams its calories make). [{ fid, g, name }], and the lines with none
  function partsOf(e) {
    if (Array.isArray(e.items) && e.items.length && !e.fid) {
      const parts = [], miss = [];
      for (const x of e.items) {
        if (x.fid && num(x.g) > 0) parts.push({ fid: String(x.fid), g: num(x.g), name: x.name });
        else if (x.mfid && num(x.mg) > 0) parts.push({ fid: String(x.mfid), g: num(x.mg), name: x.name });
        else if (num(x.kcal) > 0) miss.push(String(x.name || 'Food'));
      }
      return { parts, miss };
    }
    if (!e.fid && e.mfid && num(e.mg) > 0) return { parts: [{ fid: String(e.mfid), g: num(e.mg), name: e.name }], miss: [] };
    return null;
  }
  // one diary entry -> { v: { key: amount }, gaps: [keys the table has no number for] } or null (no vitamin data)
  function entryMicro(e, depth) {
    if (e.src === 'left' && e.left && Array.isArray(e.left.parts)) {         // v1.13: leftovers: what each food left would have given, taken off
      const v = {}; let any = false;
      const of = (D.food || []).find(x => x.id === e.left.parts.map(p => p.of).find(Boolean)) || {};          // the meal it was left from: its salt
      for (const p of e.left.parts) { const m = p.fid && p.g > 0 ? entryMicro({ fid: p.fid, g: p.g, salt: of.salt, out: of.out, at: of.at }, 1) : null; if (m) { any = true; addTo(v, m.v, -1); } }
      return any ? { v, gaps: [] } : null;
    }
    const pp = depth ? null : partsOf(e);
    if (pp) {                                                              // v1.14: a photo meal, a typed food, a web answer
      const v = {}, gaps = new Set(); let n = 0;
      for (const p of pp.parts) { const m = entryMicro({ fid: p.fid, g: p.g, out: e.out, at: e.at, salt: e.salt }, 1); if (m) { n++; addTo(v, m.v, 1); m.gaps.forEach(k => gaps.add(k)); } else pp.miss.push(p.name || 'Food'); }
      return n ? { v, gaps: [...gaps], n, miss: pp.miss } : null;
    }
    const fid = String(e.fid || '');
    if (!fid) return null;
    if (fid.startsWith('r:')) {
      if (depth) return null;
      const r = (D.recipes || []).find(x => 'r:' + x.id === fid); if (!r || !(r.items || []).length) return null;
      const tot = {}, gaps = new Set(); let kcal = 0, any = false;
      for (const it of r.items) { kcal += it.kcal || 0; const m = entryMicro(it, 1); if (m) { any = true; addTo(tot, m.v, 1); m.gaps.forEach(g => gaps.add(g)); } }
      if (!any) return null;
      const n = Math.max(1, num(r.serves) || 1), q = num(e.q) || 1, un = String(e.un || '');
      // the share of the whole recipe eaten, from how it was measured (servings, the whole pot, grams of the cooked weight)
      const share = /^whole/.test(un) ? q : un === 'g' && r.cooked > 0 ? q / r.cooked : /serving/.test(un) || !un ? q / n : kcal > 0 ? (e.kcal || 0) / kcal : q / n;
      const v = {}; addTo(v, tot, share); return { v, gaps: [...gaps] };
    }
    if (fid.startsWith('n:') || fid.startsWith('y:')) {
      const id = fid.slice(2), it = fid.startsWith('n:') ? (D.supps || []).find(x => String(x.id) === id) : (D.myFoods || []).find(x => String(x.id) === id);
      if (!it || !it.m || !Object.keys(it.m).length) return null;
      const per = it.g > 0 && e.g > 0 ? e.g / it.g : (num(e.q) || 1);       // the label is per serving
      const v = {}; addTo(v, it.m, per); return { v, gaps: [] };
    }
    if (fid.includes(':')) return null;                                    // a packet from Open Food Facts: not counted
    const row = rowOf(fid); if (!row) return null;
    const g = num(e.g); if (!(g > 0)) return null;
    const v = {}, gaps = [];
    KEYS.forEach((k, i) => { if (row[i] == null) gaps.push(k); else if (row[i] > 0) v[k] = (k === 'na' ? saltNa(fid, e, row[i]) : row[i]) * g / 100; });
    return { v, gaps };
  }
  // v1.20: supplement reminders. A plan with a reminder time (rem, "HH:MM") rings on the days it is due; the phone gets the list for the
  // next `days` days, soonest first: [{ t, id, title, text }]. Today's is left out once it was ticked or changed on the Supplements page.
  const REM_AT = { am: '07:30', bf: '08:30', lu: '14:00', pm: '18:30', nt: '21:30' };
  const remDefault = w => REM_AT[w] || '09:00';
  function reminders(days) {
    lists(); const out = [], now = Date.now(), t0 = today();
    for (const p of D.splans || []) {
      if (!p.rem || !/^\d\d:\d\d$/.test(p.rem) || paused(p)) continue;
      const [h, m] = p.rem.split(':').map(Number), pr = prodOf(p), title = nameOf(pr);
      const text = `${doseText(pr, num(p.d) || 1)}${(p.x || 1) > 1 ? `, ${(p.x || 1) === 2 ? 'twice' : '3 times'} today` : ''} · tap to tick it off`;
      for (let i = 0; i < (days || 14); i++) {
        const key = addDays(t0, i); if (!due(p, key) || (i === 0 && !isMacro(p) && logOf(p, key))) continue;
        const [y, mo, d] = key.split('-').map(Number), t = new Date(y, mo - 1, d, h, m, 0, 0).getTime();
        if (t > now) out.push({ t, id: String(p.id), title, text });
      }
    }
    return out.sort((a, b) => a.t - b.t).slice(0, 80);
  }
  // v1.20: one food's sugars and saturated fat, as dayExtra counts them for a day: { sg, sf, nsg, nsf, n } (n: its foods; nsg / nsf:
  // how many of them have a number for it). Leftovers take theirs off.
  function entryExtra(e) {
    if (!FM && window.FOODMICRO) FM = window.FOODMICRO;
    const out = { sg: 0, sf: 0, nsg: 0, nsf: 0, n: 0 }, ig = FM ? FM.k.indexOf('sg') : -1, ifa = FM ? FM.k.indexOf('sf') : -1;
    const one = (fid, g, sign) => {
      out.n++; const str = FM && fid && !String(fid).includes(':') ? FM.d[fid] : null; if (str == null || !(g > 0)) return;
      const ps = str.split(','), at = i => (i >= 0 && ps[i] !== undefined && ps[i] !== '' ? +ps[i] : null), a = at(ig), b = at(ifa);
      if (a != null) { out.sg += sign * a * g / 100; out.nsg++; } if (b != null) { out.sf += sign * b * g / 100; out.nsf++; }
    };
    if (e.src === 'left') { for (const x of (e.left && e.left.parts) || []) one(x.fid, num(x.g), -1); return out; }
    const pp = partsOf(e);
    if (pp) { pp.parts.forEach(x => one(x.fid, x.g, 1)); out.n += pp.miss.length; } else one(String(e.fid || ''), num(e.g), 1);
    return out;
  }
  // everything for one day: { tot, food, supp, by: { key: [{ name, v, from }] }, gaps: { key: n foods }, foods, nodata: [names], plans: [...] }
  function dayData(key) {
    lists(); fixFlax();
    const out = { key, tot: {}, food: {}, supp: {}, by: {}, gaps: {}, foods: 0, nodata: [], taken: [] };
    const push = (k, name, v, from) => { (out.by[k] = out.by[k] || []).push({ name, v, from }); };
    for (const e of (D.food || [])) {
      if (!inDay(e, key)) continue;
      const m = entryMicro(e, 0);
      if (!m) { if (e.src !== 'left') out.nodata.push(e.name); continue; }
      if (e.src !== 'left') out.foods += m.n || 1;
      if (m.miss) out.nodata.push(...m.miss);
      for (const k in m.v) { out.food[k] = (out.food[k] || 0) + m.v[k]; if (m.v[k] > 0) push(k, e.name, m.v[k], e.sp ? 'supp' : 'food'); }
      m.gaps.forEach(k => { out.gaps[k] = (out.gaps[k] || 0) + 1; });
    }
    for (const p of D.splans) {
      if (isMacro(p)) continue;                                            // counted with the food it was logged as
      const n = takenOn(p, key); if (!(n > 0)) continue;
      const pr = prodOf(p); if (!pr) continue;
      out.taken.push({ p, n });
      for (const k in pr.per) { const v = num(pr.per[k]) * n; if (v > 0 && NUT[k]) { out.supp[k] = (out.supp[k] || 0) + v; push(k, nameOf(pr), v, 'supp'); } }
    }
    for (const k of KEYS) { const t = (out.food[k] || 0) + (out.supp[k] || 0); if (t > 0) out.tot[k] = t; }
    return out;
  }
  // v1.12: sugars and saturated fat (not vitamins, so kept out of KEYS), for the Food tab's limits:
  // { sg, sf, foods, nsg, nsf } = grams, the foods logged that day, and how many of them had a number for each
  function dayExtra(key) {
    if (!FM && window.FOODMICRO) FM = window.FOODMICRO;
    const out = { sg: 0, sf: 0, foods: 0, nsg: 0, nsf: 0, by: { sg: [], sf: [] } }, ig = FM ? FM.k.indexOf('sg') : -1, ifa = FM ? FM.k.indexOf('sf') : -1;      // v1.13: by = each food's share
    for (const e of (D.food || [])) {
      if (!inDay(e, key)) continue;
      if (e.src === 'left') {                                                  // v1.13: leftovers take their sugars and saturated fat off
        for (const p of (e.left && e.left.parts) || []) { const s = FM && p.fid && !String(p.fid).includes(':') ? FM.d[p.fid] : null; if (!s || !(p.g > 0)) continue;
          const ps = s.split(','), at = i => (i >= 0 && ps[i] !== undefined && ps[i] !== '' ? +ps[i] : null), a = at(ig), b = at(ifa);
          if (a != null) out.sg -= a * p.g / 100; if (b != null) out.sf -= b * p.g / 100; }
        continue;
      }
      const pp = partsOf(e), list = pp ? pp.parts.map(p => ({ fid: p.fid, g: p.g, name: e.items ? `${e.name}: ${p.name}` : e.name })).concat(pp.miss.map(() => ({ fid: '', g: 0 }))) : [{ fid: String(e.fid || ''), g: num(e.g), name: e.name }];
      for (const p of list) {                                              // v1.14: each food of a photo meal, and typed foods by their name
        out.foods++;
        const str = FM && p.fid && !p.fid.includes(':') ? FM.d[p.fid] : null, g = p.g;
        if (str == null || !(g > 0)) continue;
        const parts = str.split(','), at = i => (i >= 0 && parts[i] !== undefined && parts[i] !== '' ? +parts[i] : null), sg = at(ig), sf = at(ifa);
        if (sg != null) { out.sg += sg * g / 100; out.nsg++; if (sg > 0) out.by.sg.push({ name: p.name, v: sg * g / 100, id: e.id }); }
        if (sf != null) { out.sf += sf * g / 100; out.nsf++; if (sf > 0) out.by.sf.push({ name: p.name, v: sf * g / 100, id: e.id }); }
      }
    }
    return out;
  }
  // the same over several days (an average day)
  function avgData(key, n) {
    const days = []; for (let i = 0; i < n; i++) days.push(dayData(addDays(key, -i)));
    const out = { key, avg: n, tot: {}, food: {}, supp: {}, by: {}, gaps: {}, foods: 0, nodata: [], taken: [] };
    for (const d of days) {
      for (const k in d.food) out.food[k] = (out.food[k] || 0) + d.food[k] / n;
      for (const k in d.supp) out.supp[k] = (out.supp[k] || 0) + d.supp[k] / n;
      for (const k in d.by) for (const x of d.by[k]) { const list = out.by[k] = out.by[k] || []; const same = list.find(y => y.name === x.name && y.from === x.from); if (same) same.v += x.v / n; else list.push({ name: x.name, v: x.v / n, from: x.from }); }
      out.foods += d.foods; out.nodata.push(...d.nodata);
    }
    for (const k of KEYS) { const t = (out.food[k] || 0) + (out.supp[k] || 0); if (t > 0) out.tot[k] = t; }
    return out;
  }
  // the person's needs (About me: age, sex; Settings: activity)
  function myNeeds() {
    const C = window.Calories, me = (D.settings && D.settings.me) || {};
    const age = C && C.ageNow ? C.ageNow() : 0, act = parseFloat((D.settings || {}).kcAct) || 1.2;
    return SD.needs(age, me.sex || '', act);
  }
  const bandText = N => {
    const me = (D.settings && D.settings.me) || {}, sx = me.sex === 'f' ? 'girls' : me.sex === 'm' ? 'boys' : 'boys and girls';
    if (N.band === '10') return `${sx}, 10–12 years`; if (N.band === '13') return `${sx}, 13–15 years`; if (N.band === '16') return `${sx}, 16–18 years`;
    const who = me.sex === 'f' ? 'women' : me.sex === 'm' ? 'men' : 'adults';
    return `${who}${N.lvl ? ', ' + ({ sed: 'mostly sitting', mod: 'moderately active', hvy: 'very active' })[N.lvl] : ''}`;
  };
  // how one nutrient stands: { v, need, pct, over (above the safe limit), low, scope, ulV (the amount the limit is checked on) }
  function standing(k, d, N) {
    const n = N.o[k] || {}, v = d.tot[k] || 0, ulV = n.scope === 'supp' ? (d.supp[k] || 0) : v;
    const over = n.ul > 0 && ulV > n.ul, hi = n.hi > 0 && v > n.hi, max = n.max > 0 && v > n.max;
    return { k, v, need: n.need || 0, pct: pctOf(v, n.need), ul: n.ul || 0, scope: n.scope, ulBy: n.ulBy, ulV, over, hi, max, maxV: n.max || 0, why: n.why || '' };
  }
  // v1.15: omega-3 as one need everywhere (the Food tab card, the Supplements page, the overview), as the Vitamins page has shown it
  // since v1.12: plant omega-3 (ALA) or fish or algae omega-3 (EPA + DHA), whichever is nearer its need. `use` is that kind (its
  // numbers fill the bar); `o3` and `al` are both, for the split. k is 'omega'.
  function omegaOne(d, N) {
    const o3 = standing('o3', d, N), al = standing('al', d, N), pa = al.need > 0 ? al.v / al.need : 0, po = o3.need > 0 ? o3.v / o3.need : 0, u = pa >= po ? al : o3;
    return Object.assign({}, u, { k: 'omega', use: u.k, o3, al, pct: Math.round(Math.max(pa, po) * 100), over: o3.over || al.over, hi: o3.hi || al.hi, max: false, maxV: 0, need: Math.max(o3.need, al.need) > 0 ? u.need || 1 : 0 });
  }
  // the needs shown as rows: every vitamin and mineral, with the two omega-3s as that one
  const rowsOf = (d, N) => KEYS.filter(k => k !== 'o3' && k !== 'al').map(k => standing(k, d, N)).concat([omegaOne(d, N)]);

  // ---------------------------------------------------------------- shared bits of the screens
  const top = (title, sub, right) => `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>${title}</h1><div class="sub">${sub}</div></div>${right || ''}</div>`;
  const ICON = { tablet: '💊', capsule: '💊', softgel: '🟡', sachet: '🧂', gummy: '🍬', ml: '🧴', drop: '💧', scoop: '🥤', strip: '🩹', serving: '🥤' };
  const iconOf = pr => (pr && pr.kind === 'pin' ? (pr.sp && pr.sp.kind === 'creatine' ? '⚡' : '🥤') : ICON[pr && pr.form] || '💊');
  const CAT_KEY = { omega: 'o3', vd: 'vd', b12: 'b12', ca: 'ca', fe: 'fe', zn: 'zn', mg: 'mg', vc: 'vc', ve: 've', b7: 'b7', b9: 'b9' };
  const mainOf = (pr, n, first) => {                                       // "D3 400 IU · Zinc 17 mg · B12 2.4 mcg …" (first: the one being looked for)
    if (!pr) return '';
    const per = pr.per || {}, ks = KEYS.filter(k => num(per[k]) > 0);
    if (pr.kind === 'pin') { const sp = pr.sp; return [sp.p > 0 ? `${fmtN(sp.p * n)} g protein` : '', sp.cr > 0 ? `${fmtN(sp.cr * n)} g creatine` : '', sp.kcal > 0 ? `${Math.round(sp.kcal * n)} kcal` : ''].filter(Boolean).join(' · ') || 'Counted in your food'; }
    const N = myNeeds();
    ks.sort((a, b) => (b === first) - (a === first) || (num(per[b]) / ((N.o[b] || {}).need || 1e9)) - (num(per[a]) / ((N.o[a] || {}).need || 1e9)));
    return ks.slice(0, 4).map(k => `${NUT[k].short} ${k === 'vd' ? Math.round(per[k] * n * 40).toLocaleString('en-US') + ' IU' : fmtN(per[k] * n) + ' ' + NUT[k].unit}`).join(' · ') + (ks.length > 4 ? ` · +${ks.length - 4} more` : '');
  };
  // a bar: food (solid) and supplements (lighter) against the need
  function bar(s, d) {
    if (s.maxV) { const w = Math.min(100, s.v / s.maxV * 100); return `<div class="mn-bar"><i class="${s.max ? 'over' : 'f'}" style="width:${w}%"></i></div>`; }
    if (!(s.need > 0)) return '';
    const fw = Math.min(100, (d.food[s.k] || 0) / s.need * 100), sw = Math.min(100 - fw, (d.supp[s.k] || 0) / s.need * 100);
    return `<div class="mn-bar${s.over ? ' over' : ''}"><i class="f" style="width:${fw}%"></i><i class="s" style="width:${sw}%"></i></div>`;
  }
  const flag = s => (s.over || s.hi ? '<span class="mn-warn" aria-label="Above the safe limit">⚠</span>' : s.max ? '<span class="mn-warn">⚠</span>' : '');

  // v1.15: an OG-3 Veg softgel saved by its owner from the label counted 1 g of plant omega-3, the weight of its flax seed oil. The
  // label gives no omega-3 figure; cold-pressed flax seed oil is 53% ALA (USDA), so a softgel is 0.53 g, as in the built-in list.
  // Once, and said once.
  function fixFlax() {
    let n = 0;
    for (const p of D.splans || []) {
      const o = p.own; if (!o || o.flax15) continue;
      const nm = `${o.b || ''} ${o.n || ''}`;
      if (!/\bog[\s-]?3\b/i.test(nm) || !/veg|flax|atasi|linseed/i.test(nm + ' ' + (o.src || ''))) continue;
      const al = num((o.per || {}).al); if (!(al >= 0.9 && al <= 1.1)) continue;
      o.per = Object.assign({}, o.per, { al: 0.53 }); o.flax15 = 1; o.src = (o.src ? o.src + ' · ' : '') + 'Plant omega-3 set to 0.53 g a softgel: its 1000 mg is the flax seed oil, about half of which is omega-3'; n++;
    }
    if (n) { S.save(true); setTimeout(() => toast('OG-3 Veg now counts 0.53 g of plant omega-3 a softgel (its 1000 mg is flax seed oil)'), 400); }
  }
  // ---------------------------------------------------------------- the card on the food page
  let cardLoading = false;
  function card(t0) {
    lists(); fixFlax();
    if (keyOf(Date.now()) !== ticked) { if (tick()) setTimeout(() => A.rerender(), 0); }
    const key = keyOf(t0 || Date.now()), plans = D.splans.filter(p => prodOf(p) && (due(p, key) || takenOn(p, key) > 0));
    const chips = plans.map(p => {
      const pr = prodOf(p), n = takenOn(p, key), on = n > 0;
      return `<span class="sp-cw"><button class="sp-chip ${on ? 'on' : ''}" data-act="spToggle" data-id="${esc(p.id)}" data-day="${key}" aria-pressed="${on}"><span class="sp-ck">${on ? '✓' : ''}</span><span class="ellipsis">${esc(nameOf(pr))}</span><span class="xs">${esc(doseText(pr, on ? n : perDay(p)))}</span></button>${on ? `<button class="sp-less" data-act="spLessOne" data-id="${esc(p.id)}" data-day="${key}" aria-label="Take back one dose of ${esc(nameOf(pr))}">−</button>` : ''}</span>`;
    }).join('');
    let mini = '';
    if (ready()) {
      const d = dayData(key), N = myNeeds();
      const ss = rowsOf(d, N).filter(s => s.need > 0 || s.maxV);
      const warn = ss.filter(s => s.over || s.hi || s.max), low = ss.filter(s => s.need > 0 && !s.over && ['vd', 'b12', 'fe', 'ca', 'zn', 'mg', 'b9', 'omega', 'vc', 'va'].includes(s.k)).sort((a, b) => a.pct - b.pct);
      const show = warn.concat(low).slice(0, 4), om = s => s.k === 'omega';
      if (d.foods || d.taken.length) mini = `<div class="sp-mini">${show.map(s => `<div class="sp-m tap" data-act="${om(s) ? 'spOmega' : 'spNut'}" data-k="${s.k}" data-day="${key}"><div class="row"><span class="grow xs">${om(s) ? 'Omega-3' : NUT[s.k].short}${flag(s)}</span><b class="xs">${s.maxV ? fmtN(s.v) + ' mg' : pctText(s)}</b></div>${bar(om(s) ? Object.assign({}, s, { k: s.use }) : s, d)}</div>`).join('')}</div>`;
    } else if (!cardLoading && (plans.length || (D.food || []).some(e => inDay(e, key)))) { cardLoading = true; loadMicro().then(() => { cardLoading = false; if (A.top().name === 'calories') A.rerender(); }).catch(() => { cardLoading = false; }); }
    const any = D.splans.some(p => prodOf(p));
    return `<div class="card" id="spCard"><div class="row"><div class="grow"><div class="k2">Supplements and vitamins</div>
        <div class="xs muted">${plans.length ? `${plans.filter(p => takenOn(p, key) > 0).length} of ${plans.length} taken ${key === today() ? 'today' : 'that day'} · tap one to change it` : any ? 'Nothing due that day' : 'Multivitamins, omega-3, vitamin D, zinc… counted with your food'}</div></div>
        <button class="btn sm" data-act="spOpen" data-day="${key}">${any ? 'Manage' : '+ Add'}</button></div>
      ${chips ? `<div class="sp-chips">${chips}</div>` : ''}${mini}
      <button class="sp-link" data-act="spMicro" data-day="${key}">All vitamins and minerals ${key === today() ? 'today' : 'that day'} ›</button></div>`;
  }

  // ---------------------------------------------------------------- the Supplements page
  let dayKey = '';
  const curDay = params => (params && params.day) || dayKey || today();
  VIEWS.supps = {
    html(params) {
      lists(); fixFlax();
      if (keyOf(Date.now()) !== ticked) tick();
      const key = curDay(params), t = today();
      const all = D.splans.filter(p => prodOf(p) || isMacro(p));
      let h = top('Supplements', 'What you take, and when', `<button class="btn sm primary" data-act="spAdd">+ Add</button>`);
      h += `<div class="kc-day"><button class="ib" data-act="spDayGo" data-d="-1" aria-label="The day before">‹</button><div class="grow"><b>${dayText(key)}</b>${key !== t ? ` <span class="xs accent" data-act="spDayGo" data-d="0">· back to today</span>` : ''}</div><button class="ib" data-act="spDayGo" data-d="1" aria-label="The next day" ${key >= t ? 'disabled' : ''}>›</button></div>`;
      if (!all.length) {
        return h + `<div class="card sp-empty"><div class="sp-big">💊</div><h3>Add what you take</h3><p class="small muted">Pick your multivitamin, omega-3, vitamin D, zinc or any other from popular Indian brands, a plain one by its dose, or take a photo of the label. Say how much and how often, and it is counted for you every day it is due.</p>
          <button class="btn primary block mt12" data-act="spAdd">+ Add a supplement</button></div>` + microTeaser(key);
      }
      const dueNow = all.filter(p => due(p, key) || takenOn(p, key) > 0 || changedOn(p, key)), rest = all.filter(p => !dueNow.includes(p));
      h += `<div class="card"><div class="row"><h3 class="grow" style="margin:0">${key === t ? 'Today' : dayText(key)}</h3><span class="xs muted">${dueNow.filter(p => takenOn(p, key) > 0).length} of ${dueNow.length} taken</span></div>`;
      if (!dueNow.length) h += `<p class="small muted mt8">Nothing is due ${key === t ? 'today' : 'that day'}.</p>`;
      for (const p of dueNow) h += checkRow(p, key);
      if (rest.length) h += `<div class="sp-sub">Not due ${key === t ? 'today' : 'that day'}</div>` + rest.map(p => { const pr = prodOf(p), nx = paused(p) ? '' : nextDue(p, addDays(key, 1)); return `<div class="list-item"><span class="sp-ic dim">${iconOf(pr)}</span><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(nameOf(pr))}</div><div class="xs muted">${paused(p) ? 'Paused' : nx ? 'Next: ' + dayText(nx) : cap(freqText(p))}</div></div><button class="btn sm" data-act="spExtra" data-id="${esc(p.id)}" data-day="${key}">Took it</button></div>`; }).join('');
      h += `</div>`;
      h += `<div class="card"><h3>My supplements</h3>${all.map(p => planRow(p)).join('')}
        <button class="btn block mt12" data-act="spAdd">+ Add another</button></div>`;
      return h + microTeaser(key) + `<p class="xs dim" style="margin:4px 4px 16px">Supplements are counted on the days they are due, from the day you add them. Tick a day off if you skipped it. This is a log, not medical advice: ask a doctor before taking high doses.</p>`;
    },
    refresh() { return Promise.resolve(); }
  };
  function checkRow(p, key) {
    const pr = prodOf(p), n = takenOn(p, key), on = n > 0, isDue = due(p, key), ch = changedOn(p, key);
    if (!pr) return `<div class="list-item"><span class="sp-ic dim">?</span><div class="grow"><div class="small">A supplement you removed</div></div><button class="btn sm" data-act="spEdit" data-id="${esc(p.id)}">Fix</button></div>`;
    const how = [whenText(p), isMacro(p) ? 'in your food diary' : p.auto !== false && isDue && !ch ? 'counted for you' : ch && isDue && n !== perDay(p) ? (n ? 'changed' : 'skipped') : !isDue && n ? 'an extra day' : ''].filter(Boolean).join(' · ');
    return `<div class="sp-row ${on ? 'on' : ''}" data-id="${esc(p.id)}">
      <button class="sp-tick" data-act="spToggle" data-id="${esc(p.id)}" data-day="${key}" aria-label="${on ? 'Taken: tap if you skipped it' : 'Not taken: tap when you take it'}" aria-pressed="${on}">${on ? '✓' : ''}</button>
      <div class="grow tap" style="min-width:0" data-act="spEdit" data-id="${esc(p.id)}"><div class="small ellipsis" style="font-weight:600">${esc(nameOf(pr))}</div>
        <div class="xs muted ellipsis">${esc(doseText(pr, on ? n : perDay(p)))}${how ? ' · ' + esc(how) : ''}</div><div class="xs dim ellipsis">${esc(mainOf(pr, on ? n : perDay(p)))}</div></div>
      <div class="sp-step"><button class="ib" data-act="spLess" data-id="${esc(p.id)}" data-day="${key}" aria-label="Less">−</button><b>${fmtQ(n)}</b><button class="ib" data-act="spMore" data-id="${esc(p.id)}" data-day="${key}" aria-label="More">+</button></div></div>`;
  }
  function planRow(p) {
    const pr = prodOf(p), ps = paused(p), since = (p.runs || [])[0];
    return `<div class="list-item tap ${ps ? 'sp-paused' : ''}" data-act="spEdit" data-id="${esc(p.id)}"><span class="sp-ic">${iconOf(pr)}</span>
      <div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(nameOf(pr))}</div>
      <div class="xs muted ellipsis">${pr ? esc(doseText(pr, num(p.d) || 1)) + ', ' : ''}${esc(freqText(p))}${p.auto === false ? ' · you tick it' : ''}</div>
      <div class="xs dim">${ps ? 'Paused' : since ? 'Since ' + shortDate(since[0]) : ''}</div></div>
      <button class="btn sm" data-act="${ps ? 'spResume' : 'spPause'}" data-id="${esc(p.id)}">${ps ? 'Resume' : 'Pause'}</button></div>`;
  }
  function microTeaser(key) {
    if (!ready()) { loadMicro().then(() => { const n = A.top().name; if (n === 'supps') A.rerender(); }).catch(() => { }); return `<div class="card"><div class="small muted"><span class="kc-spin"></span> Adding up vitamins and minerals…</div></div>`; }
    const d = dayData(key), N = myNeeds(), ss = rowsOf(d, N).filter(s => s.need > 0 || s.maxV);
    const warn = ss.filter(s => s.over || s.hi || s.max), met = ss.filter(s => s.need > 0 && s.pct >= 100).length, half = ss.filter(s => s.need > 0 && s.pct < 50).length;
    return `<div class="card tap" data-act="spMicro" data-day="${key}"><div class="row"><div class="grow"><div class="k2">Vitamins and minerals ${key === today() ? 'today' : 'that day'}</div>
      <div class="small mt4">${d.foods || d.taken.length ? `<b>${met}</b> of ${ss.filter(s => s.need > 0).length} needs met · <b>${half}</b> under half${warn.length ? ` · <span class="red"><b>${warn.length}</b> above the safe limit</span>` : ''}` : 'Log food or tick a supplement to see them'}</div>
      <div class="xs muted">Food and supplements together, for ${esc(bandText(N))}</div></div><span class="chev">›</span></div></div>`;
  }
  ACT.spOpen = el => { dayKey = (el && el.dataset.day) || today(); A.go('supps', { day: dayKey }); };
  ACT.spDayGo = el => { const d = +el.dataset.d, t = today(), cur = curDay(A.top().params); let k = d === 0 ? t : addDays(cur, d); if (k > t) k = t; dayKey = k; A.top().params = Object.assign({}, A.top().params, { day: k }); A.rerender(); };
  const planBy = id => D.splans.find(p => String(p.id) === String(id));
  function redraw() { const n = A.top().name; if (['supps', 'calories', 'micros'].includes(n)) A.rerender(); }
  ACT.spToggle = (el, ev) => {
    if (ev) ev.stopPropagation();
    const p = planBy(el.dataset.id), key = el.dataset.day || today(); if (!p) return;
    const was = takenOn(p, key), n = was > 0 ? 0 : perDay(p);
    setTaken(p, key, n); vib(); redraw();
    const pr = prodOf(p);
    undoToast(n ? `${nameOf(pr)}: taken` : `${nameOf(pr)}: not taken ${key === today() ? 'today' : 'that day'}`, () => { setTaken(p, key, was); redraw(); });
  };
  const step = (el, by) => { const p = planBy(el.dataset.id), key = el.dataset.day || today(); if (!p) return; const pr = prodOf(p), unit = pr && (pr.form === 'ml' || pr.form === 'drop') ? 1 : 0.5; setTaken(p, key, Math.max(0, takenOn(p, key) + by * unit)); vib(); redraw(); };
  ACT.spMore = (el, ev) => { if (ev) ev.stopPropagation(); step(el, 1); };
  // v1.12: the − next to a taken one on the food page: one dose back (two tablets twice a day: two tablets), with a way back
  ACT.spLessOne = (el, ev) => {
    if (ev) ev.stopPropagation();
    const p = planBy(el.dataset.id), key = el.dataset.day || today(); if (!p) return;
    const was = takenOn(p, key), n = Math.max(0, was - (num(p.d) || 1)), pr = prodOf(p);
    setTaken(p, key, n); vib(); redraw();
    undoToast(n ? `${nameOf(pr)}: ${doseText(pr, n)} now` : `${nameOf(pr)}: not taken ${key === today() ? 'today' : 'that day'}`, () => { setTaken(p, key, was); redraw(); });
  };
  ACT.spLess = (el, ev) => { if (ev) ev.stopPropagation(); step(el, -1); };
  ACT.spExtra = el => { const p = planBy(el.dataset.id), key = el.dataset.day || today(); if (!p) return; setTaken(p, key, takenOn(p, key) + (num(p.d) || 1)); vib(); redraw(); toast('Counted for ' + dayText(key).toLowerCase()); };
  ACT.spPause = (el, ev) => {
    if (ev) ev.stopPropagation();
    const p = planBy(el.dataset.id); if (!p) return;
    const t = today(), keep = JSON.stringify(p.runs || []);
    // today stays counted only if it was already ticked or changed
    const end = changedOn(p, t) || (isMacro(p) && macroEntries(p, t).length) ? t : addDays(t, -1);
    p.runs = (p.runs || []).map(r => (r[1] ? r : [r[0], end])).filter(r => r[1] >= r[0]);
    S.save(true); redraw();
    undoToast(`${nameOf(prodOf(p))} paused: the days before stay counted`, () => { p.runs = JSON.parse(keep); S.save(true); redraw(); });
  };
  ACT.spResume = (el, ev) => {
    if (ev) ev.stopPropagation();
    const p = planBy(el.dataset.id); if (!p) return;
    const t = today(), runs = (p.runs || []).slice(), last = runs[runs.length - 1];
    if (last && last[1] && last[1] >= addDays(t, -1)) last[1] = null; else runs.push([t, null]);
    p.runs = runs; S.save(true); tick(); redraw(); toast(`${nameOf(prodOf(p))}: counted again from today`);
  };

  // ---------------------------------------------------------------- adding: the list of brands and plain ones
  let add = null;
  const HAY = new Map();         // each product's search text, made once
  const hay = c => { let h = HAY.get(c.id); if (!h) { h = ' ' + fold(`${c.b} ${c.n} ${(SD.CATS.find(x => x[0] === c.cat) || [])[1]} ${c.alias || ''} ${Object.keys(c.per).map(k => NUT[k].name).join(' ')}`) ; HAY.set(c.id, h); } return h; };
  // the list under the search box: typing redraws only this and the chips, never the box itself (redrawing the box made the keyboard flicker and letters jump)
  function addListHtml(st) {
    const q = st.q.trim().toLowerCase(), words = fold(q).split(' ').filter(Boolean);
    let list = SD.CAT.filter(c => !st.cat || c.cat === st.cat);
    if (words.length) list = SD.CAT.filter(c => { const h = hay(c); return words.every(w => h.includes(' ' + w) || (w.length > 2 && h.includes(w))); });
    const brands = list.filter(c => c.b), plain = list.filter(c => !c.b);
    const first = words.length ? KEYS.find(k => SD.WORDS[k] && SD.WORDS[k].test(q)) : CAT_KEY[st.cat];
    const row = c => `<div class="list-item tap" data-act="spPick" data-id="${esc(c.id)}"><span class="sp-ic">${ICON[c.form] || '💊'}</span><div class="grow" style="min-width:0">
      <div class="small ellipsis" style="font-weight:600">${esc(c.b ? c.b + ' ' + c.n : c.n)}</div><div class="xs muted ellipsis">1 ${esc((SD.FORMS[c.form] || [c.form])[0])}: ${esc(mainOf({ per: c.per, kind: 'cat' }, 1, first))}</div></div><span class="chev">›</span></div>`;
    const pins = (D.supps || []).filter(sp => !D.splans.some(p => p.ref === 'n:' + sp.id));
    return `${brands.length ? `<div class="sp-sub">Brands${brands.length > 12 ? ` · ${brands.length}` : ''}</div>${brands.map(row).join('')}` : ''}${plain.length ? `<div class="sp-sub">Plain, by dose</div>${plain.map(row).join('')}` : ''}${!brands.length && !plain.length ? `<p class="small muted mt12">Nothing by that name in the list. Take a photo of its label or type it in: both work for any brand.</p>` : ''}
      ${pins.length && !words.length && (!st.cat || st.cat === 'other') ? `<div class="sp-sub">Your protein and creatine</div>${pins.map(sp => `<div class="list-item tap" data-act="spPickPin" data-id="${esc(sp.id)}"><span class="sp-ic">${sp.kind === 'creatine' ? '⚡' : '🥤'}</span><div class="grow"><div class="small" style="font-weight:600">${esc([sp.brand, sp.name].filter(Boolean).join(' '))}</div><div class="xs muted">Give it a schedule: added to your food each day it is due</div></div><span class="chev">›</span></div>`).join('')}` : ''}`;
  }
  const catChips = st => [['', 'All']].concat(SD.CATS).map(([k, nm]) => `<button class="chip ${st.cat === k && !st.q.trim() ? 'on' : ''}" data-act="spCat" data-k="${k}">${nm}</button>`).join('');
  function addPaint() { if (!add) return; const l = $('#spList'); if (l) l.innerHTML = addListHtml(add); const c = $('#spCats'); if (c) c.innerHTML = catChips(add); }
  function addSheet() {
    const st = add || (add = { cat: '', q: '' });
    A.openSheet(`<h2>Add a supplement</h2>
      <input class="input" id="spQ" type="search" placeholder="Search: zinc, Centrum, fish oil, D3…" value="${esc(st.q)}" autocomplete="off" autocapitalize="off" spellcheck="false" enterkeyhint="search">
      <div class="sp-cats mt8" id="spCats" role="group" aria-label="Kind">${catChips(st)}</div>
      <div class="kc-ways mt12"><button class="kc-way" data-act="spOwnPhoto" data-cam="1"><span>📷</span>Photo of the label</button><button class="kc-way" data-act="spOwnPhoto"><span>🖼</span>From the gallery</button><button class="kc-way" data-act="spOwnType"><span>✎</span>Type it in</button></div>
      <div id="spList">${addListHtml(st)}</div>
      <p class="xs dim mt12">Numbers come from each maker's label as sold in India (Nov 2026). Makers change their formulas: check your pack, and change any number on the next screen.</p>`,
      s => {
        const i = s.querySelector('#spQ'); if (!i) return;
        i.addEventListener('input', () => { if (!add) return; add.q = i.value; clearTimeout(add.tm); add.tm = setTimeout(addPaint, 120); });
        i.addEventListener('keydown', e => { if (e.key === 'Enter') i.blur(); });
      });
  }
  ACT.spAdd = () => { add = { cat: '', q: '' }; addSheet(); };
  ACT.spCat = el => {
    add = add || { cat: '', q: '' }; add.cat = el.dataset.k; add.q = ''; clearTimeout(add.tm);
    const i = $('#spQ'), l = $('#spList');
    if (i && l) { i.value = ''; addPaint(); l.scrollIntoView({ block: 'nearest' }); } else addSheet();
  };
  ACT.spPick = el => { const c = CATI.get(el.dataset.id); if (!c) return; plan = { id: '', ref: 'c:' + c.id, d: c.d || 1, x: 1, fr: c.fr || 'day', n: 2, days: c.fr === 'week' ? [new Date().getDay()] : [], when: '', auto: true }; planSheet(); };
  ACT.spPickPin = el => { const sp = (D.supps || []).find(x => String(x.id) === el.dataset.id); if (!sp) return; plan = { id: '', ref: 'n:' + sp.id, d: 1, x: 1, fr: 'day', n: 2, days: [], when: sp.kind === 'creatine' ? 'am' : '', auto: true }; planSheet(); };

  // ---------------------------------------------------------------- one supplement: how much, how often
  let plan = null;
  function planSheet() {
    const p = plan, pr = prodOf(p) || { n: 'Removed supplement', per: {}, kind: 'gone' }, N = myNeeds(), fr = p.fr || 'day';
    const per = pr.per || {}, ks = KEYS.filter(k => num(per[k]) > 0), dose = perDay(p);
    const lines = ks.map(k => {
      const v = num(per[k]) * dose, n = N.o[k] || {}, pc = pctOf(v, n.need), over = n.ul > 0 && v > n.ul;
      return `<div class="kc-read-r"><span>${esc(NUT[k].name)}</span><b>${esc(amt(v, k))}${n.need > 0 ? ` <span class="xs ${over ? 'red' : 'muted'}">${over ? '⚠ ' : ''}${pc >= 1000 ? Math.round(v / n.need) + '×' : pc + '%'}</span>` : ''}</b></div>`;
    }).join('');
    const overK = ks.filter(k => (N.o[k] || {}).ul > 0 && num(per[k]) * dose > N.o[k].ul);
    const freqChips = [['day', 'Every day'], ['alt', 'Every other day'], ['days', 'Some days'], ['week', 'Once a week'], ['n', 'Every few days']];
    const wkd = fr === 'days' || fr === 'week';
    A.openSheet(`<div class="row"><span class="sp-ic big">${iconOf(pr)}</span><div class="grow" style="min-width:0"><h2 style="margin:0">${esc(nameOf(pr))}</h2><div class="xs muted">${esc(pr.kind === 'pin' ? 'Counted in your food diary on the days it is due' : (pr.src || ''))}</div></div></div>
      ${pr.note ? `<p class="xs dim mt8">${esc(pr.note)}</p>` : ''}
      <label class="lbl mt12">How much each time</label>
      <div class="kc-qty"><button class="btn" data-act="spPlD" data-by="-1" aria-label="Less">−</button><div class="sp-q"><b id="spPlD">${fmtQ(num(p.d) || 1)}</b> <span class="small muted">${esc(unitW(pr, num(p.d) || 1))}</span></div><button class="btn" data-act="spPlD" data-by="1" aria-label="More">+</button></div>
      <label class="lbl mt12">Times a day</label>
      <div class="row" style="gap:8px">${[1, 2, 3].map(x => `<button class="chip ${(p.x || 1) === x ? 'on' : ''}" data-act="spPlX" data-x="${x}">${x === 1 ? 'Once' : x === 2 ? 'Twice' : '3 times'}</button>`).join('')}</div>
      <label class="lbl mt12">How often</label>
      <div class="row" style="gap:8px;flex-wrap:wrap">${freqChips.map(([k, nm]) => `<button class="chip ${fr === k ? 'on' : ''}" data-act="spPlFr" data-fr="${k}">${nm}</button>`).join('')}</div>
      ${wkd ? `<div class="sp-wd mt8" role="group" aria-label="Days">${WD1.map((d, i) => `<button class="sp-d ${(p.days || []).includes(i) ? 'on' : ''}" data-act="spPlDay" data-i="${i}" aria-label="${WD[i]}">${d}</button>`).join('')}</div><div class="xs muted mt4">${fr === 'week' ? 'Pick the day of the week' : 'Pick the days'}</div>` : ''}
      ${fr === 'n' ? `<div class="kc-qty mt8"><button class="btn" data-act="spPlN" data-by="-1">−</button><div class="sp-q">every <b>${Math.max(2, p.n || 2)}</b> days</div><button class="btn" data-act="spPlN" data-by="1">+</button></div>` : ''}
      <label class="lbl mt12">When (for your list)</label>
      <div class="row" style="gap:8px;flex-wrap:wrap">${WHEN.map(([k, nm]) => `<button class="chip ${p.when === k ? 'on' : ''}" data-act="spPlWhen" data-w="${k}">${nm}</button>`).join('')}</div>
      <div class="row mt12 sp-rem"><div class="grow"><b>Remind me</b><div class="xs muted">${p.rem ? 'A notification at this time on the days it is due' : 'A notification on the days it is due'}</div></div>${p.rem ? `<input class="input" type="time" id="spPlRemT" value="${esc(p.rem)}" style="width:118px">` : ''}<input type="checkbox" data-act="spPlRem" ${p.rem ? 'checked' : ''} aria-label="Remind me" style="width:22px;height:22px"></div>
      <label class="sp-auto mt12"><input type="checkbox" id="spPlAuto" ${p.auto !== false ? 'checked' : ''}> <span><b>Count it for me</b><br><span class="xs muted">${pr.kind === 'pin' ? 'Added to your food diary each day it is due. Untick a day if you skip it.' : 'Counted every day it is due, from today. Untick a day in your list if you skip it.'}</span></span></label>
      <div class="sp-sum mt12"><b>${esc(cap(freqText(p)))}</b><span class="xs muted"> · ${esc(doseText(pr, num(p.d) || 1))} each time${(p.x || 1) > 1 ? `, ${esc(doseText(pr, dose))} a day` : ''}</span></div>
      ${pr.kind !== 'pin' && ks.length ? `<details class="kc-read mt8" ${overK.length ? 'open' : ''}><summary class="kc-read-h"><b>One day's dose</b><span class="xs muted">% of your daily need</span></summary>${lines}</details>` : ''}
      ${overK.length ? `<p class="xs red mt8">⚠ ${esc(overK.map(k => NUT[k].name).join(', '))}: this dose alone is above the safe upper limit for ${esc(bandText(N))}. That can be right for a while if a doctor prescribed it; otherwise take less.</p>` : ''}
      ${pr.kind === 'cat' || pr.kind === 'own' ? `<button class="sp-link" data-act="spPlNums">${pr.kind === 'cat' ? 'Your pack says something else? Change the numbers' : 'Change what one ' + esc(unitW(pr, 1)) + ' holds'}</button>` : ''}
      <div class="row mt16" style="gap:8px">${p.id ? `<button class="btn danger" data-act="spPlDel">Delete</button>` : `<button class="btn" data-act="closeSheet">Cancel</button>`}<button class="btn primary grow" data-act="spPlSave">${p.id ? 'Save' : 'Add it'}</button></div>`);
  }
  const keepAuto = () => { const c = $('#spPlAuto'); if (c && plan) plan.auto = c.checked; const r = $('#spPlRemT'); if (r && plan && plan.rem && /^\d\d:\d\d$/.test(r.value)) plan.rem = r.value; };
  ACT.spPlRem = () => { keepAuto(); if (!plan) return; plan.rem = plan.rem ? '' : remDefault(plan.when); planSheet(); };          // v1.20
  ACT.spPlD = el => { keepAuto(); plan.d = Math.max(0.5, Math.min(20, (num(plan.d) || 1) + 0.5 * (+el.dataset.by))); planSheet(); };
  ACT.spPlX = el => { keepAuto(); plan.x = +el.dataset.x; planSheet(); };
  ACT.spPlFr = el => { keepAuto(); plan.fr = el.dataset.fr; if (plan.fr === 'week' && !(plan.days || []).length) plan.days = [new Date().getDay()]; if (plan.fr === 'days' && !(plan.days || []).length) plan.days = [1, 3, 5]; if (plan.fr === 'week') plan.days = (plan.days || []).slice(0, 1); planSheet(); };
  ACT.spPlDay = el => { keepAuto(); const i = +el.dataset.i; if (plan.fr === 'week') plan.days = [i]; else { const s = new Set(plan.days || []); if (s.has(i)) s.delete(i); else s.add(i); plan.days = [...s].sort(); } planSheet(); };
  ACT.spPlN = el => { keepAuto(); plan.n = Math.max(2, Math.min(30, (plan.n || 2) + (+el.dataset.by))); planSheet(); };
  ACT.spPlWhen = el => { keepAuto(); plan.when = plan.when === el.dataset.w ? '' : el.dataset.w; planSheet(); };
  ACT.spPlSave = () => {
    keepAuto(); const p = plan; if (!p) return;
    if ((p.fr === 'days') && !(p.days || []).length) { toast('Pick at least one day'); return; }
    const t = today(), isNew = !p.id;
    const o = { id: p.id || S.uid(), ref: p.ref || '', d: Math.round((num(p.d) || 1) * 100) / 100, x: Math.max(1, Math.min(3, p.x || 1)), fr: p.fr || 'day', when: p.when || '', auto: p.auto !== false };
    if (o.fr === 'n') o.n = Math.max(2, p.n || 2);
    if (p.rem && /^\d\d:\d\d$/.test(p.rem)) o.rem = p.rem;                                                  // v1.20: its reminder
    if (o.fr === 'days' || o.fr === 'week') o.days = (p.days || []).slice(0, o.fr === 'week' ? 1 : 7);
    if (p.own) o.own = p.own;
    if (p.per) o.per = p.per;
    const old = isNew ? null : planBy(p.id);
    o.runs = old && old.runs && old.runs.length ? old.runs : [[t, null]];
    if (isNew && D.splans.some(x => x.ref && x.ref === o.ref && !paused(x))) { toast('That one is already in your list'); return; }
    if (old) { for (const k of Object.keys(old)) if (k !== 'u') delete old[k]; Object.assign(old, o); }
    else D.splans.push(o);
    S.save(true); plan = null; add = null; A.closeSheet(); tick();
    const pr = prodOf(o);
    toast(isNew ? `${nameOf(pr)} added: ${freqText(o)}` : 'Saved');
    if (A.top().name !== 'supps' && isNew) A.go('supps', { day: today() }); else redraw();
  };
  ACT.spEdit = (el, ev) => { if (ev) ev.stopPropagation(); const p = planBy(el.dataset.id); if (!p) return; plan = JSON.parse(JSON.stringify(p)); delete plan.u; planSheet(); };
  ACT.spPlDel = () => {
    const p = plan && planBy(plan.id); if (!p) { A.closeSheet(); return; }
    A.openSheet(`<h2>Delete ${esc(nameOf(prodOf(p)))}?</h2><p class="small muted">Deleting takes it off every day it was counted, back to when you added it. To stop taking it but keep the days you took it, pause it instead.</p>
      <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="spPlPause">Pause instead</button><button class="btn danger grow" data-act="spPlDel2">Delete</button></div>`);
  };
  ACT.spPlPause = () => { const p = plan && planBy(plan.id); plan = null; A.closeSheet(); if (p && !paused(p)) ACT.spPause({ dataset: { id: p.id } }); };
  ACT.spPlDel2 = () => {
    const p = plan && planBy(plan.id); if (!p) return;
    const i = D.splans.indexOf(p), logs = D.slog.filter(l => l.p === p.id), foods = (D.food || []).filter(e => e.sp === p.id && e.id === autoId(p, keyOf(e.t)));
    D.splans.splice(i, 1); D.slog = D.slog.filter(l => l.p !== p.id);
    const pic = p.own && p.own.pic;                                      // the label photo goes too, once the undo has passed
    if (pic && S.deletePhoto) setTimeout(() => { if (!D.splans.some(x => x.own && x.own.pic === pic)) S.deletePhoto(pic); }, 8000);
    const fids = new Set(foods.map(e => e.id)); D.food = D.food.filter(e => !fids.has(e.id));
    S.save(true); plan = null; A.closeSheet(); redraw();
    undoToast(nameOf(prodOf(p)) + ' deleted', () => { D.splans.splice(Math.min(i, D.splans.length), 0, p); D.slog.push(...logs); D.food.push(...foods); S.save(true); redraw(); });
  };
  // a listed one with other numbers on the pack: the plan keeps its own copy; your own one: change it
  ACT.spPlNums = () => { keepAuto(); const pr = prodOf(plan); if (!pr) return; own = { b: pr.b, n: pr.n, form: pr.form, lines: linesOf(pr.per), back: 'plan', listed: pr.kind === 'cat' }; ownSheet('type'); };

  // ---------------------------------------------------------------- your own: a photo of the label, or typed in
  let own = null;
  const UNITS = ['mg', 'mcg', 'IU', 'g'];
  const linesOf = per => KEYS.filter(k => num(per[k]) > 0).map(k => ({ k, v: +(+per[k]).toFixed(3), u: NUT[k].unit }));
  // an amount as printed -> the units above (vitamin D 40 IU = 1 mcg; vitamin A 1 IU = 0.3 mcg; vitamin E 1 IU = 0.67 mg)
  function toUnit(k, v, unit) {
    v = num(v); if (!(v > 0) || !NUT[k]) return 0;
    const u = String(unit || NUT[k].unit).toLowerCase().replace('µ', 'mc').replace(/^ug$/, 'mcg').replace(/^i\.?u\.?$/, 'iu');
    if (u === 'iu') return k === 'vd' ? v / 40 : k === 'va' ? v * 0.3 : k === 've' ? v * 0.67 : 0;
    const mcg = u === 'g' ? v * 1e6 : u === 'mg' ? v * 1000 : u === 'mcg' ? v : u === 'ng' ? v / 1000 : NaN;
    if (!isFinite(mcg)) return v;
    return NUT[k].unit === 'mg' ? mcg / 1000 : NUT[k].unit === 'g' ? mcg / 1e6 : mcg;
  }
  function ownSheet(mode) {
    const o = own; if (!o) return;
    const im = o.big || o.thumb || '';
    let body;
    if (mode === 'reading') body = `<div class="kc-ai"><span class="kc-spin"></span> ${o.again ? 'Reading the label again with your answers…' : 'Reading the label…'}<div class="xs dim mt4">Each vitamin and mineral, and what one tablet or capsule holds.</div></div>`;
    else if (mode === 'confirm') {
      body = `<p class="small mt8">This is what the label says. <b>Is it right?</b></p>
        <div class="kc-read"><div class="kc-read-h"><b>${esc([o.b, o.n].filter(Boolean).join(' ') || 'Your supplement')}</b><span class="xs muted">one ${esc((SD.FORMS[o.form] || [o.form])[0])}</span></div>
        ${o.lines.map(l => `<div class="kc-read-r"><span>${esc(NUT[l.k].name)}</span><b>${esc(fmtN(l.v))} ${esc(l.u)}</b></div>`).join('')}</div>
        ${o.note ? `<p class="xs dim mt8">${esc(o.note)}</p>` : ''}
        <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="spOwnFix">Change something</button><button class="btn primary grow" data-act="spOwnSave">Yes, next</button></div>`;
    } else {
      const sel = (i, l) => `<select class="input sp-sel" data-i="${i}" data-f="k" aria-label="Vitamin or mineral">${KEYS.map(k => `<option value="${k}" ${l.k === k ? 'selected' : ''}>${esc(NUT[k].name)}</option>`).join('')}</select>`;
      const usel = (i, l) => `<select class="input sp-u" data-i="${i}" data-f="u" aria-label="Unit">${UNITS.map(u => `<option ${l.u === u ? 'selected' : ''}>${u}</option>`).join('')}</select>`;
      body = `${o.note ? `<p class="xs muted mt8">${esc(o.note)}</p>` : ''}
        ${o.listed ? '' : `<div class="row mt12" style="gap:10px"><div class="grow"><label class="lbl">Brand</label><input class="input" id="spOwnB" maxlength="40" value="${esc(o.b || '')}" placeholder="e.g. HealthKart"></div><div class="grow"><label class="lbl">Product</label><input class="input" id="spOwnN" maxlength="60" value="${esc(o.n || '')}" placeholder="e.g. Zinc 50"></div></div>
        <label class="lbl mt12">It comes as</label><div class="row" style="gap:8px;flex-wrap:wrap">${Object.keys(SD.FORMS).filter(f => f !== 'scoop').map(f => `<button class="chip ${o.form === f ? 'on' : ''}" data-act="spOwnForm" data-f="${f}">${SD.FORMS[f][0]}</button>`).join('')}</div>`}
        <p class="xs muted mt12">What <b>one ${esc((SD.FORMS[o.form] || [o.form])[0])}</b> holds (the label's "each ${esc((SD.FORMS[o.form] || [o.form])[0])} contains"). IU are fine: they are turned into mcg for you.</p>
        <div id="spLines">${o.lines.map((l, i) => `<div class="sp-line">${sel(i, l)}<input class="input sp-v" type="text" inputmode="decimal" data-i="${i}" data-f="v" value="${l.v > 0 ? esc(String(l.v)) : ''}" placeholder="–" aria-label="Amount">${usel(i, l)}<button class="ib x" data-act="spOwnDel" data-i="${i}" aria-label="Remove">×</button></div>`).join('')}</div>
        <button class="btn sm mt8" data-act="spOwnLine">+ Add a vitamin or mineral</button>
        <div class="row mt16" style="gap:8px"><button class="btn grow" data-act="${o.back === 'plan' ? 'spOwnBack' : 'closeSheet'}">${o.back === 'plan' ? 'Back' : 'Cancel'}</button><button class="btn primary grow" data-act="spOwnSave">Next</button></div>`;
    }
    const F = window.Food, pics = o.pics && o.pics.length ? o.pics : null, more = pics && mode !== 'reading' && pics.length < 4 && !o.listed;
    const head = pics && pics.length > 1 && F && F.photoStrip ? F.photoStrip(pics, { what: 'Photo', del: mode === 'reading' ? '' : 'spOwnPicDel', add: more ? 'spOwnMore' : '', addText: 'Add a photo' })
      : im ? `<img class="kc-shot kc-pack" src="${im}" alt="The label">${more ? `<button class="kc-addpic" data-act="spOwnMore">+ Add another photo of the pack <span class="xs muted">· all of them are read together</span></button>` : ''}` : '';
    A.openSheet(`<h2>${mode === 'confirm' ? 'Check the label' : o.listed ? 'The numbers on your pack' : 'Your supplement'}</h2>${head}${body}`,
      s => { s.querySelectorAll('[data-f]').forEach(inp => inp.addEventListener('change', () => { if (!own || !own.lines[+inp.dataset.i]) return; if (inp.dataset.f === 'k') { ownKeep(); const l = own.lines[+inp.dataset.i]; l.k = inp.value; l.u = NUT[l.k].unit; ownSheet('type'); } else ownKeep(); })); },
      () => { if (mode === 'reading' && own === o && o.busy) own = null; });
  }
  // what is typed in the open form, into the draft (before it is drawn again)
  function ownKeep() {
    const o = own; if (!o) return;
    const b = $('#spOwnB'), n = $('#spOwnN'); if (b) o.b = b.value.trim(); if (n) o.n = n.value.trim();
    document.querySelectorAll('#spLines [data-f]').forEach(inp => { const l = o.lines[+inp.dataset.i]; if (!l) return; if (inp.dataset.f === 'v') l.v = num(inp.value); else if (inp.dataset.f === 'u') l.u = inp.value; else l.k = inp.value; });
  }
  ACT.spOwnType = () => { own = { b: '', n: '', form: 'tablet', lines: [{ k: 'vd', v: 0, u: 'IU' }], back: '' }; ownSheet('type'); };
  ACT.spOwnForm = el => { ownKeep(); own.form = el.dataset.f; ownSheet('type'); };
  ACT.spOwnLine = () => { ownKeep(); const used = new Set(own.lines.map(l => l.k)), k = KEYS.find(x => !used.has(x)) || 'vc'; own.lines.push({ k, v: 0, u: NUT[k].unit }); ownSheet('type'); };
  ACT.spOwnDel = el => { ownKeep(); own.lines.splice(+el.dataset.i, 1); ownSheet('type'); };
  ACT.spOwnFix = () => { own.note = ''; ownSheet('type'); };
  ACT.spOwnBack = () => { own = null; planSheet(); };
  ACT.spOwnSave = () => {
    ownKeep(); const o = own; if (!o) return;
    const per = {}; for (const l of o.lines) { const v = toUnit(l.k, l.v, l.u); if (v > 0) per[l.k] = Math.round(((per[l.k] || 0) + v) * 1000) / 1000; }
    if (!Object.keys(per).length) { toast('Type at least one vitamin or mineral and its amount'); return; }
    if (!o.listed && !o.b && !o.n) { toast('Type its brand or name'); return; }
    for (const k in per) if (per[k] > (NUT[k].unit === 'mg' ? 20000 : NUT[k].unit === 'g' ? 20 : 1000000)) { toast(`${NUT[k].name} looks far too high: check the unit`); return; }
    if (o.back === 'plan' && plan) {
      if (o.listed) plan.per = per; else plan.own = Object.assign({}, plan.own || {}, { per });
      own = null; planSheet(); return;
    }
    plan = { id: '', ref: '', own: { b: o.b.slice(0, 40), n: o.n.slice(0, 60), form: o.form, per, src: o.read ? 'Read from your photo of the label' : 'Typed from the label' }, d: 1, x: 1, fr: 'day', n: 2, days: [], when: '', auto: true };
    if (o.thumb) { const id = 'supv-' + S.uid(); if (S.savePhoto && S.savePhoto(id, o.thumb) !== false) plan.own.pic = id; }
    own = null; planSheet();
  };
  // photos: the same picker and resizing as the food photos
  function pickPhoto(camera) {
    const shrink = (img, max, q) => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); return c.toDataURL('image/jpeg', q); };
    const load = src => new Promise(res => { const img = new Image(); img.onload = () => { try { res({ big: shrink(img, 1100, 0.82), thumb: shrink(img, 160, 0.6) }); } catch (e) { res(null); } }; img.onerror = () => res(null); img.src = src; });
    if (window.__pickImage) return Promise.resolve(window.__pickImage()).then(d => (d ? load(d).then(r => r || { big: d, thumb: d }) : null));
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; if (camera) inp.capture = 'environment'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.addEventListener('change', () => { const f = inp.files && inp.files[0]; inp.remove(); if (!f) { resolve(null); return; } const url = URL.createObjectURL(f); load(url).then(r => { URL.revokeObjectURL(url); if (!r) toast("That picture couldn't be opened"); resolve(r); }); });
      inp.click();
    });
  }
  // v1.12: up to 4 photos of the same packet, read together (the gallery lets you pick several at once)
  const pickPhotos = (max, camera) => (window.Food && window.Food.pickPhotos ? window.Food.pickPhotos({ max, camera, side: 1100, q: 0.82 }) : pickPhoto(camera).then(p => (p ? [p] : [])));
  const bigsOf = o => (o.pics && o.pics.length ? o.pics.map(x => x.big) : o.big ? [o.big] : []);
  function readSupp(dataUrl, answers) {
    const list = Array.isArray(dataUrl) ? dataUrl : [dataUrl];
    if (window.__suppAi) return Promise.resolve(window.__suppAi(list.length > 1 ? list : list[0], answers));          // tests
    const Cl = window.Cloud;
    if (!Cl || !Cl.configured || !Cl.labelPhoto) return Promise.reject({ quiet: true, message: 'Type what the label says.' });
    if (!Cl.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have the label read for you. For now, type what it says.' });
    const F = window.Food;
    const raw = list.map(x => String(x).replace(/^data:image\/\w+;base64,/, ''));
    return Cl.labelPhoto(raw.length > 1 ? raw : raw[0], answers ? { kind: 'supp', answers } : { kind: 'supp', ask: (F && F.ASK) || 3 }).catch(e => {
      if (e && e.status === 404) throw { message: "Reading labels isn't switched on for this account's server yet. Type what it says." };
      const msg = (e && e.message) || "The label couldn't be read.";
      throw { message: /\btype\b/i.test(msg) ? msg : msg + ' You can type it instead.' };
    });
  }
  // the server's answer -> lines in the form; an old server answers like a meal photo: nothing usable
  function useRead(o, r, note) {
    const L = (r && r.supp) || null;
    o.busy = false;
    if (!L || !Array.isArray(L.items) || !L.items.length) { o.note = note || "The label couldn't be read from that photo. Type what it says, or try a sharper photo of the list of vitamins and minerals."; if (!o.lines.length) o.lines = [{ k: 'vd', v: 0, u: 'IU' }]; ownSheet('type'); return; }
    o.b = String(L.brand || o.b || '').slice(0, 40); o.n = String(L.product || o.n || '').slice(0, 60);
    if (SD.FORMS[L.form]) o.form = L.form;
    const lines = [];
    for (const it of L.items) {
      let k = String(it.key || ''), v = num(it.amount), u = String(it.unit || '');
      if (k === 'bc') { k = 'va'; v = /iu/i.test(u) ? v * 0.3 : toUnit('va', v, u) / 2; u = 'mcg'; }       // beta-carotene from a tablet: 2 mcg = 1 mcg vitamin A
      if (!NUT[k] || !(v > 0)) continue;
      if (!/^(mg|mcg|µg|ug|iu|g)$/i.test(u)) u = NUT[k].unit;
      lines.push({ k, v: Math.round(v * 1000) / 1000, u: /^i\.?u/i.test(u) ? 'IU' : u.toLowerCase().replace('µg', 'mcg').replace('ug', 'mcg') });
    }
    if (!lines.length) { o.note = note || "No vitamins or minerals could be read on that label. Type them in."; o.lines = [{ k: 'vd', v: 0, u: 'IU' }]; ownSheet('type'); return; }
    // v1.15: one capsule holds at most about 1 g of oil, and flax seed oil is about 53% plant omega-3 (USDA), so more than 0.65 g of ALA
    // in one is the oil's weight read as omega-3 (OG-3 Veg's label: "flax seed oil 1000 mg")
    let flax = '';
    if (['softgel', 'capsule'].includes(o.form)) for (const l of lines) { const g = l.k === 'al' ? toUnit('al', l.v, l.u) : 0; if (g > 0.65 && g <= 2) { l.v = Math.round(g * 0.534 * 100) / 100; l.u = 'g'; flax = `The label's ${fmtN(g * 1000)} mg looks like the oil's weight: counted as ${fmtN(l.v)} g of plant omega-3 (flax seed oil is about 53% omega-3).`; } }
    o.lines = lines; o.read = true; o.note = [flax, note || (r.note ? String(r.note).slice(0, 200) : '')].filter(Boolean).join(' ');
    ownSheet('confirm');
  }
  ACT.spOwnPhoto = async el => {
    const ds = (el && el.dataset) || {}, had = ds.more && own && own.pics ? own.pics : [];
    if (had.length >= 4) return;
    const got = await pickPhotos(4 - had.length, !!ds.cam); if (!got.length) return;
    if (ds.more && (!own || own.pics !== had)) return;                                   // the sheet was closed meanwhile
    const pics = had.concat(got).slice(0, 4);
    const mine = own = ds.more ? Object.assign(own, { pics, thumb: pics[0].thumb, big: pics[0].big }) : { b: '', n: '', form: 'tablet', lines: [], back: '', pics, thumb: pics[0].thumb, big: pics[0].big };
    readOwnPics(mine);
  };
  ACT.spOwnMore = () => ACT.spOwnPhoto({ dataset: { more: '1' } });
  ACT.spOwnPicDel = el => { const o = own; if (!o || o.busy || !o.pics || o.pics.length < 2) return; o.pics.splice(+el.dataset.i, 1); o.thumb = o.pics[0].thumb; o.big = o.pics[0].big; readOwnPics(o); };
  // the label's photos, read together (again after one is added or taken out)
  async function readOwnPics(mine) {
    mine.busy = true; mine.again = false; mine.note = '';
    ownSheet('reading');
    let r;
    try { r = await readSupp(bigsOf(mine)); }
    catch (e) { if (own !== mine) return; mine.busy = false; mine.note = (e && e.message) || 'Type what the label says.'; mine.lines = [{ k: 'vd', v: 0, u: 'IU' }]; ownSheet('type'); return; }
    if (own !== mine) return;
    mine.busy = false;                                                     // (the question sheet replaces the reading one)
    const F = window.Food, qs = F && F.askList ? F.askList(r) : [];
    if (!qs.length) { useRead(mine, r); return; }
    F.ask({ qs, img: mine.big, intro: "Part of the label couldn't be read. Tap an answer, or type your own.",
      done: async answers => {
        if (own !== mine) return;
        mine.busy = true; mine.again = true; ownSheet('reading');
        let r2;
        try { r2 = await readSupp(bigsOf(mine), answers); }
        catch (e) { if (own !== mine) return; useRead(mine, r, "It couldn't read the label again just now, so this is what it read the first time."); return; }
        if (own !== mine) return;
        useRead(mine, r2 && r2.supp ? r2 : r);
      },
      skip: () => { if (own === mine) useRead(mine, r); },
      cancel: () => { if (own === mine) own = null; } });
  }

  // ---------------------------------------------------------------- the Vitamins and minerals page
  let mode = 'day';
  VIEWS.micros = {
    html(params) {
      const key = curDay(params), t = today();
      let h = top('Vitamins and minerals', 'Food and supplements, against your daily needs', `<button class="btn sm" data-act="kcMe">About me</button>`);
      h += `<div class="kc-day"><button class="ib" data-act="spMDay" data-d="-1" aria-label="The day before">‹</button><div class="grow"><b>${mode === 'week' ? 'The 7 days to ' + dayText(key).toLowerCase() : dayText(key)}</b>${key !== t ? ` <span class="xs accent" data-act="spMDay" data-d="0">· back to today</span>` : ''}</div><button class="ib" data-act="spMDay" data-d="1" aria-label="The next day" ${key >= t ? 'disabled' : ''}>›</button></div>
        <div class="row mb8" style="gap:8px"><button class="chip ${mode === 'day' ? 'on' : ''}" data-act="spMMode" data-m="day">One day</button><button class="chip ${mode === 'week' ? 'on' : ''}" data-act="spMMode" data-m="week">7-day average</button></div>`;
      if (!ready()) { loadMicro().then(() => { if (A.top().name === 'micros') A.rerender(); }).catch(() => { toast("The vitamin list couldn't be opened"); }); return h + `<div class="card"><div class="small muted"><span class="kc-spin"></span> Adding up the vitamins and minerals in your food…</div></div>`; }
      const d = mode === 'week' ? avgData(key, 7) : dayData(key), N = myNeeds();
      const ss = KEYS.map(k => standing(k, d, N));
      const warn = ss.filter(s => s.over || s.hi || s.max);
      if (N.guessed) h += `<div class="card sp-note"><p class="small">These are needs for ${esc(bandText(N))}. <b>Add your age and sex in About me</b> for your own.</p><button class="btn sm mt8" data-act="kcMe">About me</button></div>`;
      if (warn.length) h += `<div class="card sp-warn"><b>⚠ Above the safe limit: ${esc(warn.map(s => NUT[s.k].short).join(', '))}</b><p class="xs mt4">Tap one to see where it came from. A doctor may prescribe more than this for a while: then follow them.</p></div>`;
      if (!d.foods && !d.taken.length) h += `<div class="card"><p class="small muted">Nothing logged ${mode === 'week' ? 'in these days' : key === t ? 'yet today' : 'that day'}. Log your food, and add your supplements: <span class="accent" data-act="spOpen" data-day="${key}">Supplements</span></p></div>`;
      const group = (title, kind) => {
        const list = ss.filter(s => NUT[s.k].kind === kind);
        return `<div class="card"><h3>${title}</h3>${list.map(s => {
          // v1.14: "no numbers" when none of the foods counted has a number for it (not 0, which would mean the foods have none of it)
          const none = !(s.v > 0) && (!d.foods || (d.gaps[s.k] || 0) >= d.foods);
          const nd = s.need > 0, right = s.maxV ? `<span class="xs muted">max ${fmtN(s.maxV)}</span>` : nd && !none ? pctText(s) : '';
          return `<div class="mrow tap" data-act="spNut" data-k="${s.k}" data-day="${key}"><div class="row"><span class="nm grow">${esc(NUT[s.k].name)}${flag(s)}</span><span class="xs muted">${s.v > 0 ? esc(rowAmt(s.v, s.k)) + (nd ? ' of ' + esc(rowNeed(s.need, s.k)) : '') : none ? 'no numbers yet' : '0' + (nd ? ' of ' + esc(rowNeed(s.need, s.k)) : '')}</span><span class="n">${right}</span></div>${bar(s, d)}</div>`;
        }).join('')}</div>`;
      };
      h += group('Vitamins', 'v') + group('Minerals', 'm') + omegaCard(ss, d, key);
      h += `<div class="sp-key"><span><i class="f"></i>From food</span><span><i class="s"></i>From supplements</span></div>`;
      const nd = [...new Set(d.nodata)];
      h += `<p class="xs dim" style="margin:8px 4px">${d.foods ? `Counted from ${d.foods} food${d.foods === 1 ? '' : 's'}${mode === 'week' ? ' over the 7 days' : ''}.` : ''} ${nd.length ? `No vitamin numbers for ${nd.length > 3 ? nd.length + ' foods' : nd.map(x => '“' + esc(x) + '”').join(', ')} (foods the list doesn't have, and packets).` : ''}
        Daily needs: ICMR-NIN 2020 for ${esc(bandText(N))}. Safe limits: ICMR-NIN 2020 and, where it gives none, the US National Academies. Food values come from the food tables; some foods leave out a vitamin, so a real day can be a bit higher. Photo meals count each food the AI saw at its grams; typed foods count the list's food of the same name. Savoury home dishes whose recipes leave out the salt count typical home salt${(D.settings || {}).salt === 'less' ? ', less of it as you cook' : (D.settings || {}).salt === 'more' ? ', more of it as you cook' : ''}.</p>`;
      return h;
    },
    refresh() { return Promise.resolve(); }
  };
  // v1.12: omega-3 is one row. Plant omega-3 (ALA: flax, walnuts, chia) and fish or algae omega-3 (EPA + DHA) have different needs,
  // so the row counts as covered when either one is; the split, with both needs, is in its sheet.
  function omegaParts(ss) { const o3 = ss.find(s => s.k === 'o3') || { v: 0, need: 0 }, al = ss.find(s => s.k === 'al') || { v: 0, need: 0 }; return { o3, al }; }
  function omegaCard(ss, d, key) {
    const { o3, al } = omegaParts(ss), pa = al.need > 0 ? al.v / al.need : 0, po = o3.need > 0 ? o3.v / o3.need : 0, pct = omegaOne(d, myNeeds()).pct;
    const tot = al.v + o3.v / 1000, warn = o3.hi || o3.over || al.over;
    const fw = Math.min(100, pa >= po ? ((d.food.al || 0) / (al.need || 1)) * 100 : ((d.food.o3 || 0) / (o3.need || 1)) * 100), sw = Math.min(100 - fw, Math.max(pa, po) * 100 - fw);
    return `<div class="card"><h3>Omega-3</h3><div class="mrow tap" data-act="spOmega" data-day="${key}"><div class="row"><span class="nm grow">Omega-3${warn ? '<span class="mn-warn">⚠</span>' : ''}</span><span class="xs muted">${tot > 0 ? fmtN(tot) + ' g' : '–'}</span><span class="n">${pct ? `<span class="xs ${pct >= 100 ? 'green' : 'muted'}">${pct}%</span>` : ''}</span></div>
      <div class="mn-bar"><i class="f" style="width:${Math.max(0, fw)}%"></i><i class="s" style="width:${Math.max(0, sw)}%"></i></div>
      <div class="xs dim mt4">Plant ${al.v > 0 ? fmtN(al.v) + ' g' : '0 g'} · fish or algae ${o3.v > 0 ? fmtN(o3.v) + ' mg' : '0 mg'} · tap to see the split</div></div></div>`;
  }
  ACT.spOmega = el => {
    const key = el.dataset.day || today();
    if (!ready()) { loadMicro().then(() => ACT.spOmega(el)).catch(() => { }); return; }
    const d = mode === 'week' && A.top().name === 'micros' ? avgData(key, 7) : dayData(key), N = myNeeds(), ss = ['o3', 'al'].map(k => standing(k, d, N)), { o3, al } = omegaParts(ss);
    const part = (s, title, unit, need, note) => {
      const by = (d.by[s.k] || []).slice().sort((a, b) => b.v - a.v);
      return `<div class="sp-sub">${title}</div><div class="stats mt4"><div class="stat"><div class="k2">${mode === 'week' && A.top().name === 'micros' ? 'A day, on average' : dayText(key)}</div><div class="v">${s.v > 0 ? esc(fmtN(s.v)) : '0'}</div><div class="k">${unit}</div></div>
        <div class="stat"><div class="k2">Your need</div><div class="v">${s.need > 0 ? esc(fmtN(s.need)) : '–'}</div><div class="k">${unit}${s.need > 0 ? ` · ${s.pct}%` : ''}</div></div></div>
        ${by.length ? by.map(x => `<div class="kc-read-r"><span class="ellipsis">${x.from === 'supp' ? '💊 ' : ''}${esc(x.name)}</span><b>${esc(amt(x.v, s.k))}</b></div>`).join('') : `<p class="small muted">None ${mode === 'week' ? 'in these days' : 'that day'}.</p>`}
        <p class="xs dim mt4">${need} ${esc(GOOD[s.k] ? 'Good sources: ' + GOOD[s.k] + '.' : '')}</p>`;
    };
    A.openSheet(`<h2>Omega-3</h2><p class="small muted">Two kinds, with different needs. Covering either one counts as covered; fish or algae omega-3 does more for the heart and brain, and the body makes only a little of it from plant omega-3.</p>
      ${o3.hi ? `<div class="sp-warn small">⚠ More than 5 g of EPA + DHA a day from supplements is more than has been tested as safe.</div>` : ''}
      ${part(al, 'Plant omega-3 (ALA): flax, chia, walnuts, veg omega-3 capsules', 'g', `Need: ${fmtN(al.need)} g, the US National Academies' adequate intake for your age and sex (ICMR-NIN gives no number in grams).`)}
      ${part(o3, 'Fish or algae omega-3 (EPA + DHA)', 'mg', 'Need: 250 mg, what most food bodies (FAO/WHO, EFSA) recommend.')}
      <button class="btn block mt16" data-act="closeSheet">Close</button>`);
  };
  ACT.spMicro = el => { dayKey = (el && el.dataset.day) || today(); A.go('micros', { day: dayKey }); };
  ACT.spMDay = el => { const d = +el.dataset.d, t = today(), cur = curDay(A.top().params); let k = d === 0 ? t : addDays(cur, d); if (k > t) k = t; dayKey = k; A.top().params = Object.assign({}, A.top().params, { day: k }); A.rerender(); };
  ACT.spMMode = el => { mode = el.dataset.m === 'week' ? 'week' : 'day'; A.rerender(); };
  const GOOD = {
    va: 'carrots, sweet potato, spinach and other green leaves, mango, papaya, milk and eggs', vd: 'sunlight on the skin, eggs, fatty fish and fortified milk',
    ve: 'nuts (almonds), seeds (sunflower), and oils', vk: 'green leafy vegetables (spinach, methi, cabbage)', vc: 'amla, guava, oranges, lemon, tomatoes and capsicum',
    b1: 'whole grains, dals and pulses, nuts', b2: 'milk, curd, eggs and green leaves', b3: 'peanuts, meat, fish, whole grains', b5: 'eggs, milk, whole grains and most foods',
    b6: 'bananas, chickpeas, potatoes, fish and chicken', b7: 'eggs, peanuts and seeds', b9: 'dals, chickpeas, rajma, green leaves', b12: 'milk, curd, paneer, eggs, fish and meat (plants have almost none)',
    ca: 'milk, curd, paneer, ragi, sesame (til) and green leaves', fe: 'green leaves, dals, rajma, jaggery, meat and fish, best with vitamin C', mg: 'nuts, seeds, whole grains and dals',
    zn: 'meat, eggs, dals, nuts and seeds', k: 'bananas, potatoes, coconut water, dals and green leaves', na: 'salt, pickles, papad and packaged snacks hold most of it',
    ph: 'milk, dals, meat and whole grains', se: 'eggs, fish, meat and whole grains', cu: 'nuts, seeds, whole grains', mn: 'whole grains, nuts, tea', io: 'iodised salt, milk, eggs and fish',
    o3: 'fatty fish (sardines, mackerel, salmon) once or twice a week, or algae oil; flax and walnuts give plant omega-3 (ALA), which the body turns into only a little EPA and DHA',
    al: 'flaxseed (alsi) and its oil, chia seeds, walnuts, mustard and soybean oil, and green leaves',
  };
  // v1.21.7: the salt in home cooking, right where sodium is shown (this sheet and the Food tab's Salt bar), and the ORS note
  const SALT_SAY = { none: 'No salt: only what the ingredients have.', less: 'Less: about 30% less than a typical Indian recipe.', usual: 'Usual: as much as typical Indian recipes.', more: 'More: about 60% more than a typical Indian recipe.' };
  function saltHtml(key, from) {
    const lv = homeSalt(), ors = (D.food || []).some(e => inDay(e, key) && isOrs(e.fid));
    return `<div class="sp-salt"><div class="sp-sub">Salt in your home cooking</div>
      <div class="row ks-chips sp-salt-ch" role="group" aria-label="Salt in your home cooking">${SALT_LEVELS.map(([v, nm]) => `<button class="chip ${lv === v ? 'on' : ''}" data-act="spSalt" data-v="${v}" data-day="${esc(key)}" data-from="${from}" aria-pressed="${lv === v}">${nm}</button>`).join('')}</div>
      <p class="xs dim mt4">${SALT_SAY[lv]} It changes the home-cooked dishes from the food list (dals, sambar, curries, sabzis, rice dishes, idli, dosa, parathas), not food eaten out. One dish can have its own: tap it on the Food tab, then Salt.</p>
      ${ors ? `<p class="xs mt8 sp-ors">💧 ORS (oral rehydration salts) is meant to be salty: it puts back the salt you lose in sweat or with diarrhoea. It counts here, but it's fine when you need it.</p>` : ''}</div>`;
  }
  ACT.spSalt = el => {
    const v = el.dataset.v; if (!okLevel(v)) return;
    D.settings.salt = v; S.save(true);
    if (el.dataset.from === 'mac' && ACT.kcMac) ACT.kcMac({ dataset: { k: 'na' } }); else ACT.spNut({ dataset: { k: 'na', day: el.dataset.day } });      // the sheet again, with the new numbers
    redraw();
  };
  ACT.spNut = el => {
    const k = el.dataset.k, key = el.dataset.day || today(); if (!NUT[k]) return;
    if (!ready()) { loadMicro().then(() => ACT.spNut(el)).catch(() => { }); return; }
    const d = mode === 'week' && A.top().name === 'micros' ? avgData(key, 7) : dayData(key), N = myNeeds(), s = standing(k, d, N), n = N.o[k] || {};
    const by = (d.by[k] || []).slice().sort((a, b) => b.v - a.v);
    const gap = d.gaps[k] || 0;
    A.openSheet(`<h2>${esc(NUT[k].name)}</h2>
      <div class="stats mt8"><div class="stat"><div class="k2">${mode === 'week' && A.top().name === 'micros' ? 'A day, on average' : dayText(key)}</div><div class="v">${s.v > 0 ? esc(fmtN(s.v)) : '0'}</div><div class="k">${esc(NUT[k].unit)}${k === 'vd' && s.v ? ' · ' + Math.round(s.v * 40).toLocaleString('en-US') + ' IU' : ''}</div></div>
        <div class="stat"><div class="k2">${s.maxV ? 'Keep under' : 'Your need'}</div><div class="v">${s.maxV ? esc(fmtN(s.maxV)) : s.need > 0 ? esc(fmtN(s.need)) : '–'}</div><div class="k">${s.maxV || s.need > 0 ? esc(NUT[k].unit) + (s.need > 0 ? ` · ${s.pct}%` : '') : 'no Indian value'}</div></div></div>
      ${s.over ? `<div class="sp-warn small">⚠ ${s.scope === 'supp' ? 'Supplements alone give' : 'This is'} <b>${esc(amt(s.ulV, k))}</b>, above the safe upper limit of <b>${esc(amt(s.ul, k))}</b> a day${s.scope === 'supp' ? ' from supplements' : ''}: ${esc(s.why)}. ${k === 'vd' || k === 'fe' ? 'Doctors prescribe higher doses for a while to fix a deficiency; then follow their plan.' : 'If a doctor didn\'t prescribe this, take less.'}</div>` : ''}
      ${s.max ? `<div class="sp-warn small">⚠ More than ${esc(fmtN(s.maxV))} mg of sodium a day raises blood pressure over time. Most of it is salt.</div>` : ''}
      ${k === 'na' ? saltHtml(key, 'nut') : ''}
      ${s.hi ? `<div class="sp-warn small">⚠ More than 5 g of EPA + DHA a day from supplements is more than has been tested as safe.</div>` : ''}
      <div class="sp-sub">Where it came from</div>
      ${by.length ? by.map(x => `<div class="kc-read-r"><span class="ellipsis">${x.from === 'supp' ? '💊 ' : ''}${esc(x.name)}</span><b>${esc(amt(x.v, k))}</b></div>`).join('') : `<p class="small muted">None of ${mode === 'week' ? 'these days\'' : 'the day\'s'} food or supplements had any.</p>`}
      ${gap ? `<p class="xs dim mt4">${gap} food${gap === 1 ? "'s table has" : "s' tables have"} no number for ${esc(NUT[k].name.toLowerCase())}, so ${gap === 1 ? 'it isn\'t' : 'they aren\'t'} counted here.</p>` : ''}
      <p class="small mt12"><b>Good sources:</b> ${esc(GOOD[k] || '')}.</p>
      <p class="xs dim mt8">${s.need > 0 && k !== 'o3' && k !== 'al' ? `Need: ICMR-NIN 2020, ${esc(bandText(N))}.` : ''} ${n.ul ? `Safe upper limit: ${esc(fmtN(n.ul))} ${esc(NUT[k].unit)} a day${n.scope === 'supp' ? ' from supplements' : ''} (${esc(n.ulBy)}).` : k === 'o3' ? 'No Indian value: 250 mg is the amount most food bodies (FAO/WHO, EFSA) recommend for adults.' : k === 'al' ? `No Indian value in grams (ICMR-NIN asks vegetarians to eat flax, chia, walnuts and greens): ${esc(fmtN(s.need))} g is the US National Academies' adequate intake for your age and sex. The body turns less than a seventh of it into EPA and DHA, so it doesn't stand in for fish or algae oil.` : ''}</p>
      <button class="btn block mt16" data-act="closeSheet">Close</button>`);
  };

  // ---------------------------------------------------------------- keep today's doses in step
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible' && keyOf(Date.now()) !== ticked) { if (tick()) redraw(); } });
  setTimeout(() => { if (tick()) redraw(); }, 0);
  window.Supps = { reminders, entryMicro, entryExtra, rowOf, KEYS, card, tick, dayData, dayExtra, ready, avgData, myNeeds, standing, omegaOne, rowsOf, loadMicro, prodOf, takenOn, due, setTaken, toUnit, keyOf, addDays, freqText, today, SALT_LEVELS, saltLevel, homeSalt, saltable, isSalted, isOrs, saltHtml };
})();
