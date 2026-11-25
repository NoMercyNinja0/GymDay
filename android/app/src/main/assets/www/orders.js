/* GymDay v1.28: an order screenshot (Swiggy, Zomato, a bill) logged item by item with the restaurant's own numbers, looked up on
   the web by the server (56), and two packets compared per 100 g: protein for the calories, sugar, salt (57). Both need the
   account's server and count as one AI read each (the pack compare: one per pack). */
(function () {
  'use strict';
  const A = window.App, S = window.Store, F = window.Food;
  if (!A || !S || !F) return;
  const { esc, ACT, $ } = A, D = S.data, toast = m => window.toast(m);
  const num = v => { const n = parseFloat(v); return isFinite(n) ? n : 0; };
  const g1 = v => Math.round(num(v) * 10) / 10;
  const n0 = v => Math.round(num(v)).toLocaleString('en-IN');
  const fold = s => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
  const mealName = k => ((F.MEALS || []).find(m => m[0] === k) || [k, k])[1];
  const redraw = () => { const t = A.top().name; if (t === 'calories' || t === 'days') A.rerender(); };
  const spin = '<span class="kc-spin"></span>';

  // the server's read, or a test's stand-in: { r, err }
  async function ask(fn, stand, arg, what) {
    let r = null, err = '';
    try {
      if (window[stand]) r = await window[stand](arg);
      else {
        const Cl = window.Cloud;
        if (!Cl || !Cl.configured || !Cl[fn]) err = `${what} needs the account's server.`;
        else if (!Cl.signedIn()) err = `Sign in (Settings → Account) first: ${what.toLowerCase()} uses the account's server.`;
        else r = await Cl[fn](arg);
      }
    } catch (e) { err = (e && e.status === 404) ? `${what} isn't switched on for this account's server yet.` : ((e && e.message) || "That couldn't be read just now. Try again."); }
    return { r, err };
  }
  // a sheet drawn again in place (a changed amount, a pack read) keeps what it shows: only a real close lets it go
  let painting = false;
  const paint = (html, close) => { painting = true; try { A.openSheet(html, null, () => { if (!painting && close) close(); }); } finally { painting = false; } };
  const thumbs = pics => `<div class="ord-pics">${(pics || []).map(p => `<img src="${p.thumb || p.big}" alt="">`).join('')}</div>`;

  // ================================================================= 56: an order screenshot
  let ord = null;           // { pics, busy, meal, at, r, err, q: [amount of each item] }
  const BASIS = { restaurant: 'restaurant', 'delivery app': 'delivery app', 'other site': 'another site', estimate: 'estimate' };
  function ordSheet() {
    const o = ord; if (!o) return;
    if (o.busy) {
      paint(`<h2>Reading your order</h2>${thumbs(o.pics)}<p class="small muted mt12" id="ordBusy">${spin} Reading the items, then looking up each one's numbers at that restaurant… up to a minute.</p>
        <button class="btn block mt16" data-act="ordStop">Cancel</button>`, () => { if (ord === o) ord = null; });
      return;
    }
    if (!o.r) {
      paint(`<h2>Order not read</h2>${thumbs(o.pics)}<p class="small mt12">${esc(o.err || 'No food order could be read in that screenshot.')}</p>
        <p class="xs dim mt8">The screenshot works best when it shows the order's list of items (Swiggy and Zomato: Orders → the order → its details).</p>
        <div class="row mt16"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="ordShot" data-meal="${esc(o.meal)}">Another screenshot</button></div>`, () => { if (ord === o) ord = null; });
      return;
    }
    const r = o.r, rows = r.items.map((x, i) => {
      const q = o.q[i], has = x.kcal != null, off = !(q > 0);
      return `<div class="list-item ord-row ${off ? 'off' : ''}" data-i="${i}"><div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${esc(x.name)}</div>
        <div class="xs muted">${x.build ? esc(x.build) + ' · ' : ''}${has ? `${n0(x.kcal)} kcal · ${g1(x.protein)} g protein each · ${x.est ? '<span class="warn-t">estimate</span>' : 'from the ' + esc(BASIS[x.basis] || 'web')}` : 'no numbers found: add it with Search afterwards'}</div></div>
        ${has ? `<div class="ord-q"><button class="ib" data-act="ordQ" data-i="${i}" data-d="-0.5" aria-label="Less ${esc(x.name)}">−</button><span class="small" aria-live="polite">${q > 0 ? '×' + String(q).replace(/\.5$/, '½').replace(/^0½$/, '½') : 'none'}</span><button class="ib" data-act="ordQ" data-i="${i}" data-d="0.5" aria-label="More ${esc(x.name)}">+</button></div>` : ''}</div>`;
    }).join('');
    const tot = r.items.reduce((a, x, i) => a + (x.kcal != null ? x.kcal * (o.q[i] || 0) : 0), 0), nOn = r.items.filter((x, i) => x.kcal != null && o.q[i] > 0).length;
    paint(`<h2>${esc(r.place || 'Your order')}</h2><p class="small muted">${r.app ? esc(r.app) + ' · ' : ''}${r.items.length} item${r.items.length > 1 ? 's' : ''} read from the screenshot</p>
      <div class="kc-meals mt8" role="group" aria-label="Meal">${(F.MEALS || []).map(([k, nm]) => `<button class="chip ${o.meal === k ? 'on' : ''}" data-act="ordMeal" data-v="${k}">${nm}</button>`).join('')}</div>
      <div class="card mt8" id="ordRows" style="background:var(--bg3)">${rows}</div>
      <p class="xs dim">Shared it? Set each to what you ate: halves work, and “none” leaves it out.${r.note ? ' ' + esc(r.note) : ''}</p>
      ${(r.sources || []).length ? `<p class="xs dim mt4">Numbers from: ${r.sources.slice(0, 3).map(s => esc(s.title)).join(' · ')}</p>` : ''}${window.Safety ? window.Safety.aiLink('Order screenshot', (r.place || '') + ': ' + r.items.map(x => x.name).join(', ')) : ''}
      <button class="btn primary block mt12" data-act="ordAdd" ${nOn ? '' : 'disabled'}>${nOn ? `Add ${nOn} item${nOn > 1 ? 's' : ''} · ${n0(tot)} kcal` : 'Nothing to add'}</button>
      <button class="btn block mt8" data-act="closeSheet">Cancel</button>`, () => { if (ord === o) ord = null; });
  }
  ACT.ordShot = async (el, ev, opt) => {
    const o = opt || {}, meal = (el && el.dataset && el.dataset.meal) || o.meal || (F.mealFor ? F.mealFor() : 'l');
    const pics = o.pics && o.pics.length ? o.pics.slice(0, 4) : await F.pickPhotos({ max: 4, side: 2000, q: 0.85 });
    if (!pics || !pics.length) return;
    const mine = ord = { pics, busy: true, meal, at: o.place || '' };
    ordSheet();
    const { r, err } = await ask('orderShots', '__shotAi', pics.map(p => p.big), 'Reading order screenshots');
    if (ord !== mine) return;
    mine.busy = false;
    if (r && r.found && (r.items || []).length) { mine.r = r; mine.q = r.items.map(x => (x.kcal != null ? Math.max(0.5, num(x.qty) || 1) : 0)); }
    else mine.err = err || (r && r.note) || '';
    ordSheet();
  };
  ACT.ordStop = () => { ord = null; A.closeSheet(); };
  // from Search: what it does, then the screenshots
  ACT.ordIntro = () => A.openSheet(`<h2>Order screenshot</h2><p class="small muted">Ordered in? Pick the screenshot of your Swiggy or Zomato order (or a photo of the bill). Each item is logged with that restaurant's own numbers, looked up on the web.</p>
    <button class="btn primary block mt12" data-act="ordShot">🖼 Pick the screenshots</button><button class="btn block mt8" data-act="closeSheet">Cancel</button>`);
  ACT.ordMeal = el => { if (!ord) return; ord.meal = el.dataset.v; el.parentNode.querySelectorAll('.chip').forEach(c => c.classList.toggle('on', c === el)); };
  ACT.ordQ = el => {
    const o = ord, i = +el.dataset.i; if (!o || !o.r || !o.r.items[i]) return;
    o.q[i] = Math.max(0, Math.min(20, (o.q[i] || 0) + num(el.dataset.d)));
    const y = (document.querySelector('.sheet .panel') || {}).scrollTop; ordSheet(); const p = document.querySelector('.sheet .panel'); if (p && y) p.scrollTop = y;
  };
  ACT.ordAdd = () => {
    const o = ord, r = o && o.r; if (!r) return;
    const place = String(r.place || o.at || '').slice(0, 60); let n = 0, kc = 0;
    r.items.forEach((x, i) => {
      const q = o.q[i]; if (!(q > 0) || x.kcal == null) return;
      let nm = place && !fold(x.name).includes(fold(place).split(' ')[0]) ? `${x.name} (${place})` : x.name;
      if (x.build) nm += ' · ' + x.build;
      const e = { id: S.uid(), t: F.stampMeal ? F.stampMeal(o.meal) : Date.now(), meal: o.meal, name: nm.slice(0, 80), kcal: Math.round(x.kcal * q), p: g1(x.protein * q), c: g1(x.carbs * q), f: g1(x.fat * q),
        src: 'web', q, un: 'serving', per: '1 serving', web: { basis: x.basis === 'other site' ? 'database' : x.basis, est: x.est ? [x.name] : [], src: (r.sources || []).slice(0, 3).map(s => s.title), shot: 1 } };
      if (x.grams > 0) e.g = Math.round(x.grams * q);
      if (place) e.at = place;
      D.food.push(e); if (place && F.placeKeep) F.placeKeep(place, e);
      n++; kc += e.kcal;
    });
    if (!n) { toast('Nothing to add: set an amount first'); return; }
    S.save(true); if (F.recount) F.recount();
    ord = null; A.closeSheet(); redraw();
    toast(`Added ${n} item${n > 1 ? 's' : ''} to ${mealName(o.meal).toLowerCase()} · ${n0(kc)} kcal`);
  };
  // A picture shared to GymDay that is shaped like a phone screen (much taller than wide) may be an order: ask which it is.
  const sizeOf = src => new Promise(res => { const i = new Image(); i.onload = () => res([i.naturalWidth, i.naturalHeight]); i.onerror = () => res([0, 0]); i.src = src; });
  let asked = null;
  ACT.ordAsk = async pics => {
    const [w, h] = await sizeOf(pics[0].big);
    if (!(w > 0 && h >= 1.7 * w)) { ACT.kcPhoto(null, null, { pics }); return; }
    asked = pics;
    A.openSheet(`<h2>What is this?</h2>${thumbs(pics)}<p class="small muted mt8">It looks like a screenshot.</p>
      <div class="list-item tap mt8" data-act="ordAskGo" data-k="order"><span class="sp-ic">🧾</span><div class="grow"><div class="small" style="font-weight:600">A food order</div><div class="xs muted">Swiggy, Zomato or a bill: each item is logged with the restaurant's numbers</div></div><span class="chev">›</span></div>
      <div class="list-item tap" data-act="ordAskGo" data-k="meal"><span class="sp-ic">📷</span><div class="grow"><div class="small" style="font-weight:600">A meal photo</div><div class="xs muted">The AI reads the food in the picture</div></div><span class="chev">›</span></div>`, null, () => { asked = null; });
  };
  ACT.ordAskGo = el => { const pics = asked; asked = null; if (!pics) return; A.closeSheet(); if (el.dataset.k === 'order') ACT.ordShot(null, null, { pics }); else ACT.kcPhoto(null, null, { pics }); };

  // ================================================================= 57: which pack is better?
  let cmp = null;           // { a: slot, b: slot }; slot = { pics, busy, p, err }
  const SIDES = [['a', 'A'], ['b', 'B']];
  function slotHtml(k, nm) {
    const x = cmp[k];
    const btns = `<div class="row" style="gap:6px"><button class="btn sm grow" data-act="packShot" data-k="${k}" data-cam="1">📷 Photo</button><button class="btn sm grow" data-act="packShot" data-k="${k}">🖼 Gallery</button></div>`;
    if (!x) return `<div class="pk-slot"><div class="k2">Pack ${nm}</div><p class="xs muted">The nutrition table on the back</p>${btns}</div>`;
    if (x.busy) return `<div class="pk-slot"><div class="k2">Pack ${nm}</div>${thumbs(x.pics)}<p class="xs muted">${spin} Reading…</p></div>`;
    if (!x.p) return `<div class="pk-slot"><div class="k2">Pack ${nm}</div>${thumbs(x.pics)}<p class="xs">${esc(x.err)}</p>${btns}</div>`;
    return `<div class="pk-slot"><div class="k2">Pack ${nm}</div>${thumbs(x.pics)}<div class="small ellipsis" style="font-weight:600">${esc(x.p.product || 'Pack ' + nm)}</div><div class="xs muted ellipsis">${esc(x.p.brand || '')}</div>
      <button class="linkish xs" data-act="packShot" data-k="${k}" data-cam="1">Change</button></div>`;
  }
  // what each pack has per 100 g (or ml), and who wins each row
  function compare(pa, pb) {
    const a = pa.per100, b = pb.per100, rows = [], wins = { a: [], b: [] };
    const fmt = (v, u) => (v == null ? '–' : `${g1(v)}${u}`);
    const row = (label, va, vb, u, better, why) => {
      let w = '';
      if (better && va != null && vb != null && Math.abs(va - vb) > Math.max(0.05, 0.03 * Math.max(Math.abs(va), Math.abs(vb)))) w = (better === 'hi' ? va > vb : va < vb) ? 'a' : 'b';
      if (w && why) wins[w].push(why);
      rows.push({ label, a: fmt(va, u), b: fmt(vb, u), w });
    };
    const ppk = p => (p.kcal > 0 && p.protein != null ? p.protein / p.kcal * 100 : null);
    row('Calories', a.kcal, b.kcal, ' kcal');
    row('Protein', a.protein, b.protein, ' g');
    row('Protein per 100 kcal', ppk(a), ppk(b), ' g', 'hi', 'more protein for the calories');
    const added = a.added_sugars != null && b.added_sugars != null;
    row(added ? 'Added sugar' : 'Sugar', added ? a.added_sugars : a.sugars, added ? b.added_sugars : b.sugars, ' g', 'lo', 'less sugar');
    row('Saturated fat', a.sat_fat, b.sat_fat, ' g', 'lo', 'less saturated fat');
    row('Salt', a.salt_g, b.salt_g, ' g', 'lo', 'less salt');
    row('Fibre', a.fibre, b.fibre, ' g', 'hi', 'more fibre');
    const cost = p => (p.mrp > 0 && p.net > 0 && p.per100.protein > 0 ? p.mrp / (p.net * p.per100.protein / 100) * 100 : null);
    const ca = cost(pa), cb = cost(pb);
    if (ca != null && cb != null) row('Price of 100 g protein', ca, cb, '', 'lo', 'cheaper protein');
    rows.forEach(r => { if (r.label === 'Price of 100 g protein') { r.a = '₹' + Math.round(ca); r.b = '₹' + Math.round(cb); } });
    return { rows, wins };
  }
  function verdict(c, na, nb) {
    const A1 = c.wins.a.length, B1 = c.wins.b.length, list = xs => xs.length > 1 ? xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1] : xs[0] || '';
    if (!A1 && !B1) return 'They are about the same per 100 g.';
    if (A1 === B1) return `A close call: ${esc(na)} has ${list(c.wins.a)}; ${esc(nb)} has ${list(c.wins.b)}.`;
    const [w, l, ws, ls] = A1 > B1 ? [na, nb, c.wins.a, c.wins.b] : [nb, na, c.wins.b, c.wins.a];
    return `<b>${esc(w)}</b> is the better pick per 100 g: ${list(ws)}.${ls.length ? ` ${esc(l)} has ${list(ls)}.` : ''}`;
  }
  function cmpSheet() {
    if (!cmp) return;
    let h = `<h2>Which pack is better?</h2><p class="small muted">Take a photo of the nutrition table on each pack. Each read counts as one AI read.</p>
      <div class="pk-two mt8">${SIDES.map(([k, nm]) => slotHtml(k, nm)).join('')}</div>`;
    const pa = cmp.a && cmp.a.p, pb = cmp.b && cmp.b.p;
    if (pa && pb) {
      const c = compare(pa, pb), na = pa.product || 'Pack A', nb = pb.product || 'Pack B';
      h += `<div class="card mt12" id="pkTable" style="background:var(--bg3)"><div class="cmp-row pk-head"><span class="grow"></span><span>A</span><span>B</span></div>
        ${c.rows.map(r => `<div class="cmp-row"><span class="grow small muted">${r.label}</span><span class="${r.w === 'a' ? 'pk-win' : ''}">${r.a}${r.w === 'a' ? ' ✓' : ''}</span><span class="${r.w === 'b' ? 'pk-win' : ''}">${r.b}${r.w === 'b' ? ' ✓' : ''}</span></div>`).join('')}</div>
        <p class="small mt8" id="pkVerdict">${verdict(c, na, nb)}</p>
        <p class="xs dim mt4">Per 100 ${pa.unit === 'ml' || pb.unit === 'ml' ? (pa.unit === pb.unit ? 'ml' : 'g or ml') : 'g'}, as printed on each pack. How much you eat matters as much as which one.</p>`;
    }
    h += `<button class="btn block mt12" data-act="closeSheet">Done</button>`;
    const mine = cmp; paint(h, () => { if (cmp === mine) cmp = null; });
  }
  ACT.packCmp = () => { cmp = { a: null, b: null }; cmpSheet(); };
  ACT.packShot = async el => {
    const k = el.dataset.k, cam = !!el.dataset.cam, mine = cmp; if (!mine || (k !== 'a' && k !== 'b')) return;
    const pics = await F.pickPhotos({ max: cam ? 1 : 2, camera: cam, side: 1600 }); if (!pics || !pics.length || cmp !== mine) return;
    const slot = mine[k] = { pics, busy: true }; cmpSheet();
    const { r, err } = await ask('packRead', '__packAi', pics.map(p => p.big), 'Comparing packs');
    if (cmp !== mine || mine[k] !== slot) return;
    slot.busy = false; slot.p = r && r.pack && r.pack.per100 ? r.pack : null;
    if (!slot.p) slot.err = err || 'No nutrition table could be read. Try a sharper photo of the table on the back.';
    cmpSheet();
  };

  // ================================================================= 66: the Meal photo tile
  // The phone only opens the camera after a tap in the app, so the tile opens this, one tap away from the camera.
  ACT.mealTile = () => {
    A.openSheet(`<h2>Meal photo</h2><p class="small muted">A photo of what you're eating: the AI reads the food, you check it and add it.</p>
      <div class="kc-ways mt8" style="grid-template-columns:1fr 1fr"><button class="kc-way" data-act="mealTileGo" data-cam="1"><span>📷</span>Camera</button><button class="kc-way" data-act="mealTileGo"><span>🖼</span>Gallery</button></div>
      <button class="btn block mt12" data-act="closeSheet">Cancel</button>`);
  };
  ACT.mealTileGo = async el => {
    const cam = !!(el && el.dataset && el.dataset.cam), pics = await F.pickPhotos({ max: cam ? 1 : 4, camera: cam, side: 900, q: 0.8 });
    if (!pics || !pics.length) return;
    A.closeSheet(); ACT.kcPhoto(null, null, { pics });
  };

  window.Orders = { compare, verdict, open: () => ord, cmp: () => cmp };
})();
