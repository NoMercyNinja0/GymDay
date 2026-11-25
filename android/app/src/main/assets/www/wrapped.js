/* GymDay v1.28 "Your year, wrapped": the year told as a short story of cards, tap by tap, with a picture to share at the end.
   On Today from 1 December to 10 January (then the year just ended); from the Year page at any time. Everything is worked out
   on the phone from the person's own log (Extras.yearStats and the food log). */
(function () {
  'use strict';
  const A = window.App, S = window.Store, X = window.Extras;
  if (!A || !S || !X || !X.yearStats) return;
  const { esc, ACT, $, VIEWS } = A, D = S.data, toast = m => window.toast(m), num = A.num;
  const big = n => Math.round(n).toLocaleString('en-IN');
  const plural = (n, w) => `${big(n)} ${w}${n === 1 ? '' : 's'}`;
  const MONTHS = A.MONTHS_LONG || ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  const WDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  // the year to show on Today: December shows this year, early January the one just ended
  function wrapYear(now) {
    const d = new Date(now || Date.now());
    if (d.getMonth() === 11) return d.getFullYear();
    if (d.getMonth() === 0 && d.getDate() <= 10) return d.getFullYear() - 1;
    return 0;
  }
  function foodStats(y) {
    const a = new Date(y, 0, 1).getTime(), b = new Date(y + 1, 0, 1).getTime(), days = {};
    let n = 0;
    for (const f of D.food || []) { if (!(f.t >= a && f.t < b)) continue; n++; const k = new Date(f.t).toDateString(); days[k] = (days[k] || 0) + num(f.p); }
    const ds = Object.keys(days).length;
    return { n, days: ds, prot: ds ? Object.values(days).reduce((p, q) => p + q, 0) / ds : 0 };
  }
  // the cards: [big line, small line, emoji]
  function story(y) {
    const t = X.yearStats(y); if (!t.n) return null;
    const c = [[`${plural(t.n, 'workout')}`, `${A.fmtDur(t.ms)} in the gym in ${y}`, '🏋️']];
    if (t.bestM !== null) c.push([`${MONTHS[t.bestM]}`, `was your month: ${plural(t.months[t.bestM].n, 'workout')}`, '📅']);
    if (t.streak > 1) c.push([`${t.streak} weeks in a row`, 'your longest run without missing a week', '🔥']);
    if (t.topEx && t.topEx.ex) c.push([esc(t.topEx.ex.name), `your most done exercise: ${plural(t.topEx.n, 'workout')}`, '⭐']);
    if (t.heavy) c.push([`${A.fmtW(t.heavy.w)} ${A.unit()}`, `your heaviest lift: ${esc(t.heavy.ex.name)}${t.heavy.r ? ' × ' + t.heavy.r : ''}${t.prs ? ` · ${plural(t.prs, 'new record')} this year` : ''}`, '🏆']);
    if (t.vol > 0 && A.repsOn()) {
      const kg = A.unit() === 'lb' ? t.vol * 0.45359237 : t.vol, el = kg / 6000;
      c.push([`${big(t.vol)} ${A.unit()}`, `lifted in all${el >= 1 ? `: about ${el >= 10 ? big(el) : Math.round(el * 10) / 10} elephant${el >= 1.05 ? 's' : ''}` : ''}`, '🐘']);
    }
    if (t.wd !== null) c.push([WDAY[t.wd] + 's', `your favourite day to train: ${plural(t.wdN, 'time')}`, '🗓']);
    const f = foodStats(y);
    if (f.n >= 20) c.push([`${plural(f.n, 'food')} logged`, `on ${plural(f.days, 'day')}${f.prot >= 1 ? ` · ${Math.round(f.prot)} g protein a day on average` : ''}`, '🍽']);
    c.push([`That was ${y}`, 'Here’s to the next one. Share your year?', '🎉']);
    return { y, cards: c, t, f };
  }
  let st = null;            // { y, cards, i }
  function draw() {
    const o = st; if (!o) return;
    const [h, s, e] = o.cards[o.i], last = o.i === o.cards.length - 1;
    A.openSheet(`<div class="wrap-story" style="--wi:${o.i}"><div class="wrap-bars">${o.cards.map((x, i) => `<i class="${i <= o.i ? 'on' : ''}"></i>`).join('')}</div>
      <button class="wrap-x" data-act="wrapClose" aria-label="Close">✕</button>
      <div class="wrap-k">Your ${o.y}, wrapped</div><div class="wrap-e" aria-hidden="true">${e}</div><div class="wrap-h">${h}</div><div class="wrap-s">${s}</div>
      <div class="wrap-nav"><button class="wrap-tap" data-act="wrapStep" data-d="-1" aria-label="Back" ${o.i ? '' : 'disabled'}>‹</button><span class="xs">${o.i + 1} / ${o.cards.length}</span>${last ? `<button class="btn primary" data-act="wrapShare">Share my year</button>` : `<button class="wrap-tap" data-act="wrapStep" data-d="1" aria-label="Next">›</button>`}</div></div>`, null, () => { if (st === o && !o.keep) st = null; });
  }
  ACT.wrapOpen = el => {
    const y = +(el && el.dataset && el.dataset.y) || wrapYear() || new Date().getFullYear(), s = story(y);
    if (!s) { toast(`No workouts logged in ${y} yet`); if (A.top().name !== 'year') A.go('year'); return; }
    st = { y, cards: s.cards, i: 0, s }; draw();
  };
  ACT.wrapStep = el => { const o = st; if (!o) return; o.i = Math.max(0, Math.min(o.cards.length - 1, o.i + (+el.dataset.d || 0))); o.keep = true; draw(); o.keep = false; };
  ACT.wrapClose = () => { st = null; A.closeSheet(); };
  // the picture: a phone-sized story with the year's numbers
  function picture(s) {
    const W = 1080, H = 1920, c = document.createElement('canvas'); c.width = W; c.height = H;
    const g = c.getContext('2d'), grad = g.createLinearGradient(0, 0, W, H);
    grad.addColorStop(0, '#1d2b64'); grad.addColorStop(1, '#3d9bff'); g.fillStyle = grad; g.fillRect(0, 0, W, H);
    g.fillStyle = '#fff'; g.textAlign = 'left';
    g.font = '600 56px system-ui, sans-serif'; g.fillText(`My ${s.y} in GymDay`, 90, 220);
    const strip = v => String(v).replace(/<[^>]*>/g, '').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");
    let y = 400;
    for (const [h, sub] of s.cards.slice(0, -1).slice(0, 7)) {
      g.font = '700 76px system-ui, sans-serif'; g.fillText(strip(h).slice(0, 26), 90, y);
      g.font = '400 40px system-ui, sans-serif'; g.globalAlpha = 0.85; g.fillText(strip(sub).slice(0, 48), 90, y + 60); g.globalAlpha = 1;
      y += 200;
    }
    g.font = '500 36px system-ui, sans-serif'; g.globalAlpha = 0.8; g.fillText('GymDay', 90, H - 110); g.globalAlpha = 1;
    return c;
  }
  ACT.wrapShare = () => {
    const o = st; if (!o) return;
    let url = ''; try { url = picture(o.s).toDataURL('image/jpeg', 0.9); } catch (e) { toast("Couldn't make the picture"); return; }
    const text = `My ${o.y} in GymDay: ${o.s.t.n} workouts`;
    if (S.isAndroid) {
      let ok = false; try { ok = !!(window.Android.shareImage && window.Android.shareImage(url, text)); } catch (e) { }
      if (!ok) { try { window.Android.share(text); } catch (e) { } toast('This phone can only share the words, not the picture'); }
      return;
    }
    const a = document.createElement('a'); a.href = url; a.download = `GymDay-${o.y}-wrapped.jpg`; document.body.appendChild(a); a.click(); a.remove();
    toast('Picture saved to your downloads');
  };
  // Today, in December and early January
  function wrapCard() {
    const y = wrapYear(); if (!y || !X.yearStats(y).n) return '';
    return `<div class="card" id="wrapCard"><div class="row"><div class="grow"><div class="k2">🎁 Your ${y}, wrapped</div><div class="small mt4">Your year in GymDay, card by card, and a picture to share.</div></div>
      <button class="btn primary sm" data-act="wrapOpen" data-y="${y}">Open</button></div></div>`;
  }
  if (window.Insights && window.Insights.homeCards) { const h0 = window.Insights.homeCards; window.Insights.homeCards = () => wrapCard() + h0(); }
  // the Year page: at any time
  if (VIEWS.year) {
    const y0 = VIEWS.year.html;
    VIEWS.year.html = function (p) {
      const h = y0.call(this, p), m = h.match(/<h1>(\d{4})<\/h1>/), y = m ? +m[1] : 0;
      if (!y || !X.yearStats(y).n) return h;
      return h + `<button class="btn block mt12" id="wrapBtn" data-act="wrapOpen" data-y="${y}">🎁 Your ${y}, wrapped</button>`;
    };
  }
  window.Wrapped = { story, wrapYear, foodStats, picture, open: () => st };
})();
