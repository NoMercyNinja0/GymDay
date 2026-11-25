/* GymDay 1.25 · three things on the progress pages (glance.js).
   (1) Year at a glance: on the Year page, every day of the year as a small square. A filled square is a day trained (a workout,
       or an activity of 20 minutes or more when those count towards the weekly goal); a dot is a day with food logged.
   (2) This month against last month: on the month page, the two side by side. A month still running is set against the same
       days of the month before (1–20 against 1–20), so it is a fair comparison. Workouts, gym time, weight lifted and sets;
       and, where they were logged, protein and calories a day, sleep a night, steps a day and body weight.
   (3) The month as a picture to share: workouts, gym time, weight lifted, the lifts that went up, the weeks in a row and, only
       when its switch is turned on, the change in body weight. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { esc, ACT, $ } = A, D = S.data, num = A.num;
  const toast = m => window.toast(m);
  const DAY = 86400000, pad = n => String(n).padStart(2, '0');
  const key = t => { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
  const MON = i => A.MONTHS_LONG[i];
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;

  // =========================================================================================== (1) the year, day by day
  function daySets(y) {
    const a = new Date(y, 0, 1).getTime(), b = new Date(y + 1, 0, 1).getTime(), gym = new Set(), food = new Set(), SP = window.Sports;
    for (const s of D.sessions) if (s.start >= a && s.start < b) gym.add(key(s.start));
    if (SP && SP.showMode && SP.showMode() === 'goal') for (const x of D.sports || []) if (x.t >= a && x.t < b && +x.mins >= SP.GOAL_MIN) gym.add(key(x.t));
    for (const e of D.food || []) if (e.t >= a && e.t < b && !e.sp) food.add(key(e.t));
    return { gym, food };
  }
  function heatCard(y) {
    const { gym, food } = daySets(y); if (!gym.size && !food.size) return '';
    const now = Date.now(), CELL = 10, STEP = 12, LEFT = 14, TOP = 14, W = LEFT + 27 * STEP, H = TOP + 7 * STEP;
    const half = m0 => {
      const first = new Date(y, m0, 1), last = new Date(y, m0 + 6, 0), start = new Date(first); start.setDate(first.getDate() - ((first.getDay() + 6) % 7));      // the Monday on or before the 1st
      let cells = '', labels = '';
      for (const d = new Date(first); d <= last; d.setDate(d.getDate() + 1)) {
        const col = Math.floor(Math.round((d - start) / DAY) / 7), row = (d.getDay() + 6) % 7, k = key(d.getTime()), g = gym.has(k), f = food.has(k), x = LEFT + col * STEP, yy = TOP + row * STEP;
        cells += `<rect x="${x}" y="${yy}" width="${CELL}" height="${CELL}" rx="2.5" class="${d.getTime() > now ? 'hm-f' : g ? 'hm-g' : 'hm-0'}"/>` + (f ? `<circle cx="${x + CELL / 2}" cy="${yy + CELL / 2}" r="2" class="hm-d${g ? ' on' : ''}"/>` : '');
        if (d.getDate() === 1) labels += `<text x="${x}" y="9" class="hm-t">${MON(d.getMonth()).slice(0, 3)}</text>`;
      }
      return `<svg viewBox="0 0 ${W} ${H}" width="100%" aria-hidden="true" focusable="false">${labels}<text x="0" y="${TOP + 8}" class="hm-t">M</text><text x="0" y="${TOP + 3 * STEP + 8}" class="hm-t">T</text><text x="0" y="${TOP + 6 * STEP + 8}" class="hm-t">S</text>${cells}</svg>`;
    };
    const both = [...gym].filter(k => food.has(k)).length;
    const say = `Trained on ${plural(gym.size, 'day')}${food.size ? `, food logged on ${plural(food.size, 'day')}, both on ${both}` : ''}`;
    return `<div class="card" id="heatCard"><h3>Every day of ${y}</h3><div class="hm-wrap" role="img" aria-label="${esc(say)}">${half(0)}${half(6)}</div>
      <div class="legend mt8"><span><i class="hm-key g"></i>trained</span><span><i class="hm-key d"></i>food logged</span></div>
      <p class="small mt8" id="heatSay"><b>${gym.size}</b> ${gym.size === 1 ? 'day' : 'days'} trained${food.size ? ` · <b>${food.size}</b> with food logged · <b>${both}</b> with both` : ''}</p></div>`;
  }
  if (A.VIEWS.year) {
    const y0 = A.VIEWS.year.html;
    A.VIEWS.year.html = function (p) {
      const h = y0.call(this, p), m = /<h1>(\d{4})<\/h1>/.exec(h); if (!m) return h;
      const card = heatCard(+m[1]); if (!card) return h;
      const at = h.indexOf('<div class="card"><h3>Workouts each month</h3>');
      return at >= 0 ? h.slice(0, at) + card + h.slice(at) : h + card;
    };
  }

  // =========================================================================================== (2) this month against last month
  function stats(a, b) {
    const C = window.Calories, P = window.Progress, end = Math.min(b, Date.now()), ss = D.sessions.filter(s => s.start >= a && s.start < b);
    let ms = 0, sets = 0, vol = 0;
    for (const s of ss) { ms += S.gymMs(s); for (const it of s.items) { if (it.skipped) continue; const done = it.sets.filter(x => x.done), ex = S.getEx(it.ex); sets += done.length; if (ex && ex.track !== 'time') vol += done.reduce((t, x) => t + num(x.w) * num(x.r), 0); } }
    const stepsOf = {}; (D.acts || []).forEach(x => { if (x && x.d && x.steps > 0) stepsOf[x.d] = x.steps; });
    let fd = 0, kcal = 0, prot = 0, sn = 0, sleep = 0, stn = 0, steps = 0;
    const food = !!(C && C.on && C.on() && C.dayOf);
    for (const d = new Date(a); d.getTime() < end; d.setDate(d.getDate() + 1)) {
      const t = d.getTime();
      if (food) { const x = C.dayOf(t); if (x && x.food && x.food.length) { fd++; kcal += x.eaten || 0; prot += x.protein || 0; } }
      if (P && P.sleepOf) { const s = P.sleepOf(t); if (s && s.min > 0) { sn++; sleep += s.min; } }
      const st = stepsOf[key(t)]; if (st) { stn++; steps += st; }
    }
    const bw = (D.body || []).filter(x => x.t >= a && x.t < b && x.kg > 0).sort((p, q) => q.t - p.t)[0];
    return { n: ss.length, ms, sets, vol, fd, kcal: fd ? kcal / fd : null, prot: fd ? prot / fd : null, sn, sleep: sn ? sleep / sn : null, stn, steps: stn ? steps / stn : null, kg: bw ? bw.kg : null };
  }
  const hm = m => { m = Math.round(m); return `${Math.floor(m / 60)} h ${pad(m % 60)}`; };
  function versus(y, m, now) {
    now = now || Date.now();
    const t = new Date(now), cur = t.getFullYear() === y && t.getMonth() === m, days = cur ? t.getDate() : 0;
    const p = new Date(y, m - 1, 1), py = p.getFullYear(), pm = p.getMonth();
    const a1 = new Date(y, m, 1).getTime(), b1 = new Date(y, m + 1, 1).getTime();
    const a0 = p.getTime(), e0 = new Date(py, pm + 1, 1).getTime(), b0 = cur ? Math.min(e0, new Date(py, pm, 1 + days).getTime()) : e0;
    return { cur, days, pm, py, now: stats(a1, b1), was: stats(a0, b0) };
  }
  function vsCard(y, m) {
    const v = versus(y, m), n = v.now, w = v.was, kgU = A.unit() === 'lb' ? 2.20462 : 1;
    const rows = [];
    // [label, this, last, the two numbers for the arrow (null = no arrow), more is better]
    const add = (label, a, b, x, z, up) => { if (a == null && b == null) return; rows.push({ label, a: a == null ? '–' : a, b: b == null ? '–' : b, x, z, up }); };
    if (n.n || w.n) {
      add('Workouts', String(n.n), String(w.n), n.n, w.n, true);
      add('Time in the gym', A.fmtDur(n.ms), A.fmtDur(w.ms), n.ms, w.ms, true);
      if (A.repsOn() && (n.vol || w.vol)) add(`Weight lifted (${A.unit()})`, A.fmtBig(n.vol), A.fmtBig(w.vol), n.vol, w.vol, true);
      add('Sets', String(n.sets), String(w.sets), n.sets, w.sets, true);
    }
    if (n.fd || w.fd) {
      add('Protein a day (g)', n.prot == null ? null : String(Math.round(n.prot)), w.prot == null ? null : String(Math.round(w.prot)), n.prot, w.prot, true);
      add('Calories a day', n.kcal == null ? null : A.fmtBig(n.kcal), w.kcal == null ? null : A.fmtBig(w.kcal), null, null, false);
    }
    if (n.sn || w.sn) add('Sleep a night', n.sleep == null ? null : hm(n.sleep), w.sleep == null ? null : hm(w.sleep), n.sleep, w.sleep, true);
    if (n.stn || w.stn) add('Steps a day', n.steps == null ? null : A.fmtBig(n.steps), w.steps == null ? null : A.fmtBig(w.steps), n.steps, w.steps, true);
    if (n.kg != null || w.kg != null) add(`Body weight (${A.unit()})`, n.kg == null ? null : A.fmtW(Math.round(n.kg * kgU * 10) / 10), w.kg == null ? null : A.fmtW(Math.round(w.kg * kgU * 10) / 10), null, null, false);
    if (!rows.length || !(w.n || w.fd || w.sn || w.stn || w.kg != null)) return '';
    const arrow = r => { if (r.x == null || r.z == null || !(r.z > 0) || !(r.x >= 0)) return '<span class="mv-d"></span>'; const d = (r.x - r.z) / r.z; if (Math.abs(d) < 0.02) return '<span class="mv-d dim">=</span>'; return `<span class="mv-d ${d > 0 ? 'green' : 'dim'}" aria-label="${d > 0 ? 'up' : 'down'} ${Math.round(Math.abs(d) * 100)} percent">${d > 0 ? '▲' : '▼'} ${Math.round(Math.abs(d) * 100)}%</span>`; };
    const thisName = MON(m).slice(0, 3), lastName = MON(v.pm).slice(0, 3);
    return `<div class="card" id="vsCard"><h3 class="mb8">${v.cur ? `${MON(m)} so far against ${MON(v.pm)}` : `${MON(m)} against ${MON(v.pm)}`}</h3>
      <div class="mv-row mv-h"><span></span><span>${v.cur ? `1–${v.days} ${thisName}` : thisName}</span><span>${v.cur ? `1–${Math.min(v.days, new Date(v.py, v.pm + 1, 0).getDate())} ${lastName}` : lastName}</span><span></span></div>
      ${rows.map(r => `<div class="mv-row"><span class="muted">${r.label}</span><span><b>${r.a}</b></span><span>${r.b}</span>${arrow(r)}</div>`).join('')}
      <p class="xs dim mt8">${v.cur ? `This month is still running, so it is set against the same ${plural(v.days, 'day')} of ${MON(v.pm)}. ` : ''}${n.fd || w.fd ? 'Food, sleep and steps are averages over the days that have them.' : ''}</p></div>`;
  }
  if (A.VIEWS.recap) {
    const r0 = A.VIEWS.recap.html;
    A.VIEWS.recap.html = function (p) {
      let h = r0.call(this, p);
      const m = /<h1>([A-Za-z]+) (\d{4})<\/h1>/.exec(h), mi = m ? A.MONTHS_LONG.indexOf(m[1]) : -1; if (mi < 0) return h;
      const y = +m[2], old = h.indexOf('<div class="card"><h3 class="mb8">Compared with ');
      const card = vsCard(y, mi), share = monthFacts(y, mi).n ? `<button class="btn block mb8" id="monthShare" data-act="monthCard" data-y="${y}" data-m="${mi}">Share ${esc(MON(mi))} as a picture</button>` : '';
      if (card && old >= 0) h = h.slice(0, old);              // the fuller comparison takes the old card's place
      return h + card + share;
    };
  }

  // =========================================================================================== (3) the month as a picture
  // the lifts that went up: the heaviest working set of the month against the heaviest before it (kept workouts only)
  function liftsUp(a, b) {
    const before = {}, inMonth = {};
    for (const s of D.sessions) {
      if (s.keep === false || s.start >= b) continue;
      for (const it of s.items) {
        if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex || ex.track !== 'weight') continue;
        const top = Math.max(0, ...it.sets.filter(S.work).map(x => num(x.w))); if (!(top > 0)) continue;
        const o = s.start >= a ? inMonth : before; if (!o[ex.id] || top > o[ex.id]) o[ex.id] = top;
      }
    }
    return Object.keys(inMonth).filter(id => before[id] > 0 && inMonth[id] > before[id]).map(id => ({ name: S.getEx(id).name, from: before[id], to: inMonth[id], pct: (inMonth[id] - before[id]) / before[id] }))
      .sort((p, q) => q.pct - p.pct);
  }
  function monthFacts(y, m) {
    const a = new Date(y, m, 1).getTime(), b = new Date(y, m + 1, 1).getTime(), s = stats(a, b), T = window.Today;
    const bw = (D.body || []).filter(x => x.kg > 0).sort((p, q) => p.t - q.t), first = bw.filter(x => x.t < a).pop() || bw.find(x => x.t >= a && x.t < b), last = bw.filter(x => x.t >= a && x.t < b).pop();
    const now = new Date(), cur = now.getFullYear() === y && now.getMonth() === m;
    return { y, m, n: s.n, ms: s.ms, vol: s.vol, sets: s.sets, ups: liftsUp(a, b), streak: cur && T && T.week ? T.week().streak : 0, kg: first && last && first !== last ? last.kg - first.kg : null, cur };
  }
  function monthCanvas(f, withKg) {
    const Wd = 1080, Hd = 1350, c = document.createElement('canvas'); c.width = Wd; c.height = Hd; const g = c.getContext('2d');
    const F = (px, w) => `${w || 700} ${px}px Roboto, "Segoe UI", "Helvetica Neue", Arial, sans-serif`;
    const fit = (text, px, w, max) => { let t = String(text); g.font = F(px, w); while (px > 32 && g.measureText(t).width > max) { px -= 4; g.font = F(px, w); } while (t.length > 4 && g.measureText(t).width > max) t = t.slice(0, -2).trimEnd() + '…'; return t; };
    const box = (x, y, w, h, r, fill) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); g.fillStyle = fill; g.fill(); };
    const bg = g.createLinearGradient(0, 0, Wd, Hd); bg.addColorStop(0, '#0B111C'); bg.addColorStop(1, '#05080F'); g.fillStyle = bg; g.fillRect(0, 0, Wd, Hd);
    const top = g.createLinearGradient(0, 0, Wd, 0); top.addColorStop(0, '#3D8BFF'); top.addColorStop(1, '#22E3FF'); g.fillStyle = top; g.fillRect(0, 0, Wd, 16);
    g.textBaseline = 'alphabetic'; g.textAlign = 'left';
    g.font = F(56, 800); g.fillStyle = '#FFFFFF'; g.fillText('Gym', 72, 132); const bw = g.measureText('Gym').width; g.fillStyle = '#22E3FF'; g.fillText('Day', 72 + bw, 132);
    g.fillStyle = '#FFFFFF'; g.fillText(fit(`${MON(f.m)} ${f.y}`, 96, 800, Wd - 144), 72, 290);
    g.fillStyle = '#8C9BB6'; g.font = F(40, 500); g.fillText(f.cur ? 'My month so far' : 'My month', 72, 356);
    const tiles = [[String(f.n), f.n === 1 ? 'workout' : 'workouts'], [A.fmtDur(f.ms), 'in the gym']];
    if (A.repsOn() && f.vol > 0) tiles.push([A.fmtBig(f.vol) + ' ' + A.unit(), 'lifted']);
    const tw = (Wd - 144 - 24 * (tiles.length - 1)) / tiles.length;
    tiles.forEach((t, i) => { const x = 72 + i * (tw + 24); box(x, 410, tw, 200, 28, '#121A29'); g.textAlign = 'center'; g.fillStyle = '#FFFFFF'; g.fillText(fit(t[0], 64, 800, tw - 28), x + tw / 2, 512); g.fillStyle = '#8C9BB6'; g.font = F(32, 500); g.fillText(t[1], x + tw / 2, 566); });
    g.textAlign = 'left'; let y = 690;
    const badge = (text, fill, ink) => { box(72, y - 8, Wd - 144, 96, 24, fill); g.fillStyle = ink; g.fillText(fit(text, 44, 800, Wd - 208), 104, y + 56); y += 124; };
    if (f.streak > 1) badge(`🔥  ${f.streak} weeks in a row`, '#2A1A0A', '#FFB454');
    if (withKg && f.kg != null && Math.abs(f.kg) >= 0.05) { const u = A.unit() === 'lb' ? 2.20462 : 1, d = Math.round(Math.abs(f.kg) * u * 10) / 10; badge(`⚖  Body weight ${f.kg > 0 ? 'up' : 'down'} ${A.fmtW(d)} ${A.unit()}`, '#0C2038', '#22E3FF'); }
    if (f.ups.length) {
      g.fillStyle = '#8C9BB6'; g.font = F(34, 700); g.fillText('LIFTS THAT WENT UP', 72, y + 30); y += 62;
      const room = Math.max(1, Math.floor((Hd - 130 - y) / 82)), show = f.ups.slice(0, f.ups.length > room ? room - 1 : room);
      show.forEach(l => {
        g.textAlign = 'right'; g.fillStyle = '#3DDC97'; const r = fit(`${A.fmtW(l.from)} → ${A.fmtW(l.to)} ${A.unit()}`, 36, 700, 430); g.fillText(r, Wd - 72, y + 46); const rw = g.measureText(r).width;
        g.textAlign = 'left'; g.fillStyle = '#FFFFFF'; g.fillText(fit(l.name, 40, 700, Wd - 144 - rw - 32), 72, y + 46);
        g.fillStyle = '#1C2940'; g.fillRect(72, y + 70, Wd - 144, 2); y += 82;
      });
      if (f.ups.length > show.length) { g.fillStyle = '#8C9BB6'; g.font = F(34, 500); g.fillText(`+ ${f.ups.length - show.length} more`, 72, y + 44); }
    } else { g.fillStyle = '#8C9BB6'; g.font = F(38, 500); g.fillText(plural(f.sets, 'set') + ' done', 72, y + 40); }
    g.textAlign = 'center'; g.fillStyle = '#5B6984'; g.font = F(30, 500); g.fillText('Logged with GymDay', Wd / 2, Hd - 48);
    return c;
  }
  let mc = null;                     // { f, url, kg }
  function monthSheet() {
    const me = mc, f = me.f;                                   // a sheet that is closed only forgets its own picture
    try { me.url = monthCanvas(f, me.kg).toDataURL('image/jpeg', 0.9); } catch (e) { mc = null; toast("Couldn't make the picture"); return; }
    A.openSheet(`<h2>Share ${esc(MON(f.m))} as a picture</h2><img id="monthImg" src="${me.url}" alt="A picture of your month: ${plural(f.n, 'workout')}, ${esc(A.fmtDur(f.ms))} in the gym${f.ups.length ? ', ' + plural(f.ups.length, 'lift') + ' that went up' : ''}" style="width:100%;border-radius:14px;display:block;margin-top:10px">
      ${f.kg != null && Math.abs(f.kg) >= 0.05 ? `<label class="row mt12" style="gap:10px"><input type="checkbox" data-bind="monthKg" ${me.kg ? 'checked' : ''} style="width:22px;height:22px"><span class="small grow">Show my body weight change on it<span class="xs dim" style="display:block">Off unless you turn it on: this picture can go to anyone.</span></span></label>` : ''}
      <div class="row mt12"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="monthCardGo">${S.isAndroid ? 'Share' : 'Save the picture'}</button></div>`, null, () => { if (mc === me) mc = null; });
  }
  ACT.monthCard = el => { const f = monthFacts(+el.dataset.y, +el.dataset.m); if (!f.n) { toast('No workouts in this month to share'); return; } mc = { f, url: '', kg: false }; monthSheet(); };
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'monthKg' && mc) { const f = mc.f, on = t.checked; mc = { f, url: '', kg: on }; monthSheet(); } });
  ACT.monthCardGo = () => {
    if (!mc || !mc.url) return;
    const f = mc.f, text = `${MON(f.m)} ${f.y}: ${plural(f.n, 'workout')}, ${A.fmtDur(f.ms)} in the gym`;
    if (S.isAndroid) {
      let ok = false; try { ok = !!(window.Android.shareImage && window.Android.shareImage(mc.url, text)); } catch (e) { }
      if (!ok) { try { window.Android.share(text); } catch (e) { } toast('This phone can only share the words, not the picture'); }
      A.closeSheet(); return;
    }
    const a = document.createElement('a'); a.href = mc.url; a.download = `GymDay-${f.y}-${pad(f.m + 1)}.jpg`; document.body.appendChild(a); a.click(); a.remove();
    A.closeSheet(); toast('Picture saved to your downloads');
  };

  window.Glance = { daySets, heatCard, stats, versus, vsCard, liftsUp, monthFacts, monthCanvas };
})();
