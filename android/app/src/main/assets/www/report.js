/* GymDay 1.33 · a one-page report as a PDF (report.js): the last 7 or 30 days on one A4 page, for a coach, a doctor or
   parents. Workouts, sleep, food and protein, steps, readiness and body weight, with the safe and danger zones of the
   Insights charts and two small bar charts. Made right here in the app: no internet, nothing sent anywhere.
   The PDF is written by hand in plain ASCII (the standard Helvetica fonts, characters outside ASCII as WinAnsi codes),
   so it passes through the phone's file saving and sharing as text. Settings → Backup & export, and Insights. */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const { ACT, esc } = A, D = S.data;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const hm = m => { m = Math.round(m || 0); const h = Math.floor(m / 60), r = m % 60; return h ? `${h} h${r ? ' ' + r + ' min' : ''}` : `${r} min`; };

  // ---------------------------------------------------------------- a small PDF writer
  const WIN = { 0x2013: 0x96, 0x2014: 0x97, 0x2018: 0x91, 0x2019: 0x92, 0x201C: 0x93, 0x201D: 0x94, 0x2022: 0x95, 0x2026: 0x85, 0x20AC: 0x80, 0x2212: 0x2D, 0x2192: 0x3E, 0x2713: 0x76, 0x26A0: 0x21 };
  function pdfStr(t) {
    let o = '';
    for (const ch of String(t)) {
      const c = ch.codePointAt(0);
      if (ch === '(' || ch === ')' || ch === '\\') o += '\\' + ch;
      else if (c >= 32 && c < 127) o += ch;
      else { const w = c >= 0xA0 && c <= 0xFF ? c : WIN[c]; o += w ? '\\' + w.toString(8).padStart(3, '0') : (c > 0xFFFF ? '' : '?'); }
    }
    return o;
  }
  // Helvetica widths (1/1000 em) of the ASCII letters, for fitting text; others count as an average letter
  const HW = ' 278 !278 "355 #556 $556 %889 &667 \'191 (333 )333 *389 +584 ,278 -333 .278 /278 0556 1556 2556 3556 4556 5556 6556 7556 8556 9556 :278 ;278 <584 =584 >584 ?556 @1015 A667 B667 C722 D722 E667 F611 G778 H722 I278 J500 K667 L556 M833 N722 O778 P667 Q778 R722 S667 T611 U722 V667 W944 X667 Y667 Z611 [278 \\278 ]278 ^469 _556 `333 a556 b556 c500 d556 e556 f278 g556 h556 i222 j222 k500 l222 m833 n556 o556 p556 q556 r333 s500 t278 u556 v500 w722 x500 y500 z500'.split(' ').filter(Boolean);
  const W1 = {}; HW.forEach(x => { W1[x[0]] = +x.slice(1); }); W1[' '] = 278;
  const widthOf = (t, size, bold) => [...String(t)].reduce((a, ch) => a + (W1[ch] || 556) * (bold ? 1.05 : 1), 0) * size / 1000;
  function page() {
    const ops = [];
    const rgb = c => c.map(v => (v / 255).toFixed(3)).join(' ');
    return {
      ops,
      text(x, y, t, size, o) { o = o || {}; const f = o.bold ? 'F2' : 'F1'; let s = String(t);
        if (o.max) while (s.length > 3 && widthOf(s, size, o.bold) > o.max) s = s.slice(0, -2).trimEnd() + '…';
        const w = widthOf(s, size, o.bold), xx = o.align === 'right' ? x - w : o.align === 'center' ? x - w / 2 : x;
        ops.push(`BT ${rgb(o.color || [10, 19, 34])} rg /${f} ${size} Tf ${xx.toFixed(2)} ${y.toFixed(2)} Td (${pdfStr(s)}) Tj ET`); return w; },
      rect(x, y, w, h, color) { ops.push(`${rgb(color)} rg ${x.toFixed(2)} ${y.toFixed(2)} ${w.toFixed(2)} ${h.toFixed(2)} re f`); },
      line(x1, y1, x2, y2, color, w, dash) { ops.push(`${rgb(color)} RG ${(w || 0.6).toFixed(2)} w ${dash ? '[2 2] 0 d ' : '[] 0 d '}${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`); },
    };
  }
  function pdfOf(pg, title) {
    const stream = pg.ops.join('\n'), objs = [
      '<< /Type /Catalog /Pages 2 0 R >>',
      '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
      '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>',
      '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>',
      `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
      `<< /Title (${pdfStr(title)}) /Producer (GymDay) /Creator (GymDay) >>`,
    ];
    let out = '%PDF-1.4\n'; const at = [];
    objs.forEach((o, i) => { at.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const x = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + at.map(a => String(a).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R /Info 7 0 R >>\nstartxref\n${x}\n%%EOF\n`;
    return out;
  }

  // ---------------------------------------------------------------- the report
  const INK = [10, 19, 34], MUTED = [84, 98, 123], LINE = [211, 221, 237], BLUE = [21, 101, 224], GREEN = [9, 121, 83], RED = [202, 39, 55], AMBER = [176, 110, 0], PALE = [232, 241, 255];
  function build(n) {
    const Dl = window.Daily; if (!Dl || !Dl.daysBack) return null;
    const days = Dl.daysBack(n), r = Dl.rangeStats(days), Z = Dl.zoneCounts ? Dl.zoneCounts(days.map(f => f.t0)) : [];
    const C = window.Cloud, prof = C && C.signedIn && C.signedIn() && C.profile ? C.profile() : null;
    const a = new Date(days[0].t0), b = new Date(days[days.length - 1].t0);
    const fmt = d => d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
    const pg = page(); let y = 790; const L = 48, R = 547;
    pg.rect(0, 812, 595, 30, BLUE);
    pg.text(L, 822, 'GymDay', 13, { bold: true, color: [255, 255, 255] });
    pg.text(R, 822, `Report: the last ${n} days`, 11, { align: 'right', color: [255, 255, 255] });
    pg.text(L, y, prof && prof.name ? prof.name : 'My training, sleep and food', 20, { bold: true, max: R - L });
    y -= 20; pg.text(L, y, `${fmt(a)} to ${fmt(b)} · made ${fmt(new Date())}`, 10.5, { color: MUTED });
    y -= 26;
    // the numbers that matter, in four boxes
    const tiles = [
      ['Workouts', r.ws ? String(r.ws) : '–', r.ws ? `${hm(r.mins)} in all` : 'none logged'],
      ['Sleep a night', r.nights ? hm(r.sleep) : '–', r.nights ? `${r.enough} of ${r.nights} night${r.nights === 1 ? '' : 's'} reached ${r.need} h` : 'not logged'],
      ['Eaten a day', r.fd ? `${n0(r.kcal)} kcal` : '–', r.fd ? `on ${r.fd} day${r.fd === 1 ? '' : 's'} logged` : 'not logged'],
      ['Protein target', r.withP ? `${r.hitP} of ${r.withP}` : '–', r.withP ? 'days reached' : 'no target set'],
    ];
    const tw = (R - L - 3 * 10) / 4;
    tiles.forEach(([k, v, sub], i) => { const x = L + i * (tw + 10); pg.rect(x, y - 52, tw, 58, PALE); pg.text(x + 10, y - 10, k, 9, { color: MUTED, max: tw - 16 }); pg.text(x + 10, y - 30, v, 16, { bold: true, max: tw - 16 }); pg.text(x + 10, y - 44, sub, 8, { color: MUTED, max: tw - 16 }); });
    y -= 78;
    // two bar charts: sleep each night against the need, and food each day against the target
    const chart = (title, vals, goal, fmtV, color, unitTxt) => {
      pg.text(L, y, title, 12, { bold: true }); y -= 8;
      const H = 70, top = Math.max(goal || 0, ...vals.filter(v => v != null), 1) * 1.1, x0 = L + 34, w = R - x0, slot = w / vals.length, base = y - H;
      [0, 0.5, 1].forEach(f => { const v = top * f, yy = base + H * f; pg.line(x0, yy, R, yy, LINE, 0.5); pg.text(x0 - 4, yy - 3, fmtV(v), 7.5, { align: 'right', color: MUTED }); });
      vals.forEach((v, i) => { if (v == null || v <= 0) return; const h = H * v / top; pg.rect(x0 + slot * i + slot * 0.18, base, Math.max(1.2, slot * 0.64), h, color(v)); });
      if (goal) { const gy = base + H * goal / top; pg.line(x0, gy, R, gy, INK, 0.8, true); pg.text(R, gy + 3, unitTxt, 7.5, { align: 'right', color: MUTED }); }
      days.forEach((f, i) => { if (n <= 7 || i % 5 === 0 || i === days.length - 1) { const d = new Date(f.t0); pg.text(x0 + slot * (i + 0.5), base - 10, n <= 7 ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d.getDay()] : String(d.getDate()), 7.5, { align: 'center', color: MUTED }); } });
      y = base - 24;
    };
    const sl = days.map(f => (f.sleep ? f.sleep.min / 60 : null)), need = r.need;
    if (sl.some(v => v != null)) chart('Sleep each night', sl, need, v => (v ? `${Math.round(v)} h` : '0'), v => (v < need - 0.25 ? RED : BLUE), `you need ${need} h`);
    const ea = days.map(f => (f.food ? f.food.eaten : null)), tg = days.reduce((a, f) => (f.food && f.food.target ? f.food.target : a), 0);
    if (ea.some(v => v != null)) chart('Eaten each day', ea, tg, v => (v >= 1000 ? `${(v / 1000).toFixed(1)}k` : n0(v)), () => GREEN, tg ? `target ${n0(tg)} kcal` : '');
    // safe and danger zones
    if (Z.length) {
      pg.text(L, y, 'Safe zone, needs improvement, danger zone', 12, { bold: true }); y -= 16;      // 1.35: three steps
      const word = { sleep: 'nights', eaten: 'days', protein: 'days', ready: 'days' };
      Z.forEach(z => { pg.text(L, y, z.name, 10); pg.text(L + 120, y, `safe (${z.sTxt}): ${z.s} of ${z.n} ${word[z.k]}`, 10, { color: GREEN, max: 170 }); pg.text(L + 295, y, `needs improvement: ${z.w || 0}`, 10, { color: z.w ? AMBER : MUTED, max: 110 }); pg.text(L + 410, y, z.d ? `danger (${z.dTxt}): ${z.d}` : 'danger: none', 10, { color: z.d ? RED : MUTED, max: R - L - 410 }); y -= 14; });
      y -= 8;
    }
    // workouts: the exercises done most, with the best set
    const ex = new Map();
    days.forEach(f => f.ws.forEach(w => (w.s && w.s.items ? w.s.items : []).forEach(it => { const done = (it.sets || []).filter(x => x.done); if (!done.length) return; const e = ex.get(it.ex) || { n: 0, best: 0, sets: 0 }; e.n++; e.sets += done.length; done.forEach(x => { const v = parseFloat(x.w) || 0; if (v > e.best) e.best = v; }); ex.set(it.ex, e); })));
    if (ex.size) {
      pg.text(L, y, 'Exercises done most', 12, { bold: true }); y -= 16;
      [...ex.entries()].sort((p, q) => q[1].n - p[1].n || q[1].sets - p[1].sets).slice(0, 6).forEach(([id, e]) => {
        const x = S.getEx(id); pg.text(L, y, x ? x.name : id, 10, { max: 260 }); pg.text(L + 280, y, `${e.n} workout${e.n === 1 ? '' : 's'}, ${e.sets} set${e.sets === 1 ? '' : 's'}`, 10, { color: MUTED }); if (e.best) pg.text(R, y, `best ${A.fmtW(e.best)} ${A.unit()}`, 10, { align: 'right' }); y -= 14;
      });
      y -= 8;
    }
    // the rest in short
    const more = [];
    if (r.stp) more.push(`About ${n0(r.steps)} steps a day on ${r.stp} day${r.stp === 1 ? '' : 's'}.`);
    const rd = days.filter(f => f.ready && f.ready.score != null); if (rd.length) more.push(`Readiness ${Math.round(rd.reduce((s, f) => s + f.ready.score, 0) / rd.length)} out of 100 on average.`);
    if (r.wt.length > 1) { const w0 = r.wt[0].weight.kg, w1 = r.wt[r.wt.length - 1].weight.kg, d = Math.round((w1 - w0) * 10) / 10; more.push(`Body weight ${A.fmtW(w1)} kg, ${d === 0 ? 'the same as' : `${d > 0 ? '+' : '−'}${A.fmtW(Math.abs(d))} kg since`} the first weigh-in of these days.`); }
    else if (r.wt.length === 1) more.push(`Body weight ${A.fmtW(r.wt[0].weight.kg)} kg.`);
    if (more.length) { pg.text(L, y, 'Also', 12, { bold: true }); y -= 16; more.forEach(t => { pg.text(L, y, t, 10, { max: R - L }); y -= 14; }); }
    pg.line(L, 54, R, 54, LINE, 0.5);
    pg.text(L, 40, 'Made with GymDay from what was logged in the app. Zones: National Sleep Foundation (2015) and ICMR-NIN 2020.', 7.5, { color: MUTED });
    pg.text(L, 30, 'GymDay is not a doctor: ask one about anything that worries you.', 7.5, { color: MUTED });
    return pdfOf(pg, `GymDay report, the last ${n} days`);
  }

  // ---------------------------------------------------------------- the sheet: 7 or 30 days, Share or Save
  let rep = null;          // { n }
  const NB = () => (S.isAndroid ? window.Android : (window.__native || null));
  const fileName = n => { const d = new Date(), p2 = x => String(x).padStart(2, '0'); return `GymDay-report-${n}-days-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}.pdf`; };
  function sheet() {
    const n = rep.n, nb = NB();
    A.openSheet(`<h2>One-page report</h2><p class="small muted">A PDF of your last ${n} days on one page: workouts, sleep, food, protein and the zones (safe, needs improvement, danger). For a coach, a doctor or your parents.</p>
      <div class="chips mt8" role="group" aria-label="How many days">${[7, 30].map(k => `<button class="chip ${n === k ? 'on' : ''}" data-act="repN" data-n="${k}" aria-pressed="${n === k}">Last ${k} days</button>`).join('')}</div>
      ${nb ? `<div class="row mt16"><button class="btn primary grow" data-act="repShare">Share</button><button class="btn grow" data-act="repSave">Save on this phone</button></div>`
        : `<button class="btn primary block mt16" data-act="repSave">Download the PDF</button>`}
      <p class="xs dim mt8">Made on this phone: nothing is sent anywhere until you share it.</p>
      <button class="btn block mt8" data-act="closeSheet">Cancel</button>`, null, () => { rep = null; });
  }
  ACT.reportOpen = () => { if (!window.Daily) { window.toast('The report needs the Insights page'); return; } rep = { n: rep ? rep.n : 7 }; sheet(); };
  ACT.repN = el => { if (!rep) return; rep.n = +el.dataset.n === 30 ? 30 : 7; sheet(); };
  function made() { const pdf = rep && build(rep.n); if (!pdf) window.toast("The report couldn't be made"); return pdf; }
  ACT.repShare = () => {
    const pdf = made(); if (!pdf) return; const nb = NB(); let ok = false;
    try { ok = !!(nb && nb.shareFile && nb.shareFile(fileName(rep.n), 'application/pdf', pdf)); } catch (e) { }
    if (!ok) { ACT.repSave(); return; }
    A.closeSheet();
  };
  ACT.repSave = () => {
    const pdf = made(); if (!pdf) return; const nb = NB(), name = fileName(rep.n);
    if (nb) { let ok = false; try { if (nb.saveFile) { nb.saveFile(name, 'application/pdf', pdf); ok = true; } } catch (e) { } if (ok) A.closeSheet(); else window.toast("This phone couldn't save the file"); return; }
    const a = document.createElement('a'), url = URL.createObjectURL(new Blob([pdf], { type: 'application/pdf' }));
    a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 10000);
    A.closeSheet(); window.toast('Saved to your downloads');
  };
  window.Report = { build, pdfStr };
})();
