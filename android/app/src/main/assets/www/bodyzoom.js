/* GymDay 1.35 – a body map you can zoom into, so even the small parts (the brachialis, a head of the triceps, the teres)
   are easy to tap exactly. Any anatomy figure inside a .bz box works this way:
     · the first tap zooms into the area it lands on (a shoulder, an arm, the chest, the core, a thigh, a calf …), smoothly;
     · zoomed in, a tap picks the part under the finger; a tap just off a part (on the skin or a line) picks the nearest one;
     · two fingers pinch to zoom in or out, one finger drags the zoomed body, and "Whole body" zooms back out.
   A zoom stays when the page is drawn again (picking a part redraws the list under it), until another page opens.
   The small maps (an exercise's page, a workout's page) get a ⤢ button that opens the same map full screen. */
(function () {
  const A = window.App, F = window.BodyFig; if (!A || !F) return;
  const { $$, ACT } = A;
  const FULL = [22, 6, 156, 424];
  const reduce = () => window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  // the areas a tap zooms into, each the muscles around the part under the finger: c = across the middle of the body (both
  // halves), s = one side (the arm, shoulder or leg that was tapped). Each is fitted to the parts' own outlines, so it is right
  // for the female figure too.
  const AREA = {
    f: [['Neck and traps', 'c', 'neck upperTraps'], ['Shoulder', 's', 'frontDelt sideDelt'], ['Chest', 'c', 'upperChest midChest lowerChest serratus'],
      ['Upper arm', 's', 'bicepsLong bicepsShort brachialis'], ['Forearm', 's', 'brachiorad foreFlex'], ['Core', 'c', 'absUpper absLower obliques'],
      ['Hip and thigh', 's', 'hipFlexors abductors vastusLat rectusFem vastusMed adductors'], ['Lower leg', 's', 'tibialis soleus gastroMed gastroLat']],
    b: [['Neck and traps', 'c', 'neck upperTraps'], ['Shoulder', 's', 'rearDelt rotatorCuff teres'], ['Upper back', 'c', 'midTraps rhomboids latsUpper lowerTraps'],
      ['Lower back', 'c', 'latsLower lowerBack'], ['Upper arm', 's', 'tricepsLong tricepsLat tricepsMed'], ['Forearm', 's', 'foreExt'],
      ['Glutes', 'c', 'gluteMain gluteSide'], ['Hamstrings', 's', 'hamsOuter hamsInner'], ['Calves', 's', 'gastroLat gastroMed soleus']],
  };
  const BOX = {};
  function boxOf(sx, v, id) {           // a part's outline box on the left half, from its path's points
    const k = sx + v + id; if (BOX[k]) return BOX[k];
    const B = window.BODYDATA, P = B && B[sx] && B[sx][v] ? B[sx][v].parts.find(p => p[0] === id) : null; if (!P) return null;
    const n = (P[2].match(/-?\d*\.?\d+/g) || []).map(Number), xs = n.filter((_, i) => i % 2 === 0), ys = n.filter((_, i) => i % 2 === 1);
    return (BOX[k] = [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]);
  }
  function areaOf(svg, id, x) {
    const v = isBack(svg) ? 'b' : 'f', sx = svg.dataset.sex === 'f' ? 'f' : 'm', a = AREA[v].find(r => r[2].split(' ').includes(id)); if (!a) return null;
    const bs = a[2].split(' ').map(p => boxOf(sx, v, p)).filter(Boolean); if (!bs.length) return null;
    let r = [Math.min(...bs.map(b => b[0])), Math.min(...bs.map(b => b[1])), Math.max(...bs.map(b => b[2])), Math.max(...bs.map(b => b[3]))];
    if (a[1] === 'c') r = [Math.min(r[0], 200 - r[2]), r[1], Math.max(r[2], 200 - r[0]), r[3]];
    else if (x > 100) r = [200 - r[2], r[1], 200 - r[0], r[3]];
    return [a[0], r[0] - 4, r[1] - 4, r[2] + 4, r[3] + 4];
  }
  const isBack = svg => /^Back/.test(svg.getAttribute('aria-label') || '');
  // the view box that shows a rectangle as big as it can in the box the figure is drawn in (at most 7 pixels to a unit: the
  // smallest part is then about a finger wide, and a small area keeps enough of what is around it to see where you are)
  function fit(svg, x0, y0, x1, y1) {
    const r = svg.getBoundingClientRect(), ar = r.width / Math.max(1, r.height);
    let w = Math.max(x1 - x0, r.width / 7), h = Math.max(y1 - y0, r.height / 7);
    if (w / h < ar) w = h * ar; else h = w / ar;
    const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
    return [cx - w / 2, cy - h / 2, w, h];
  }
  const get = svg => (svg.getAttribute('viewBox') || FULL.join(' ')).split(/[\s,]+/).map(Number);
  const set = (svg, vb) => svg.setAttribute('viewBox', vb.map(v => +v.toFixed(2)).join(' '));
  const kept = {};          // data-bzk -> { vb, name } while the page that drew it is open
  let keptView = '';
  function zoomed(bz, on, name) {
    bz.classList.toggle('zoomed', !!on);
    let bar = bz.querySelector('.bz-bar');
    if (on && !bar) { bar = document.createElement('div'); bar.className = 'bz-bar'; bz.appendChild(bar); }
    if (bar) bar.innerHTML = on ? `<span class="bz-name">${A.esc(name || 'Zoomed in')}</span><button class="bz-out" data-act="bzOut" aria-label="Whole body: zoom out">Whole body</button>` : '';
    if (!on && bar) bar.remove();
  }
  function animate(svg, to, done) {
    const from = get(svg); if (reduce()) { set(svg, to); if (done) done(); return; }
    const t0 = performance.now(), T = 220, ease = t => 1 - Math.pow(1 - t, 3);
    const step = now => { const t = Math.min(1, (now - t0) / T), k = ease(t); set(svg, from.map((v, i) => v + (to[i] - v) * k)); if (t < 1) requestAnimationFrame(step); else if (done) done(); };
    requestAnimationFrame(step);
  }
  const keep = (bz, svg, name) => { const k = bz.dataset.bzk; if (k) kept[k] = { vb: get(svg), name }; keptView = (A.top() || {}).name || ''; };
  const drop = bz => { const k = bz.dataset.bzk; if (k) delete kept[k]; };
  // the point under a finger, in the figure's units
  function at(svg, x, y) { const m = svg.getScreenCTM(); if (!m) return null; const p = new DOMPoint(x, y).matrixTransform(m.inverse()); return [p.x, p.y]; }
  function zoomAt(bz, svg, x, y, part) {
    const p = at(svg, x, y); if (!p) return;
    const a = (part && areaOf(svg, part, p[0])) || ['Zoomed in', p[0] - 24, p[1] - 38, p[0] + 24, p[1] + 38];
    const to = fit(svg, a[1], a[2], a[3], a[4]);
    zoomed(bz, true, a[0]); animate(svg, to, () => keep(bz, svg, a[0]));
    const tip = bz.closest('.bodies, .sore-big, .bp-wrap'), line = tip && tip.parentNode && tip.parentNode.querySelector('.bf-tip');
    if (line && !line.classList.contains('on')) line.textContent = 'Now tap the exact part';
  }
  function out(bz) { const svg = bz.querySelector('svg.bodyfig'); if (!svg) return; drop(bz); zoomed(bz, false); animate(svg, FULL); }
  ACT.bzOut = el => { const bz = el.closest('.bz'); if (bz) out(bz); };
  // a tap just off a part: the nearest part within about 12 px of the finger
  function nearest(x, y) {
    for (const r of [4, 8, 12]) for (let k = 0; k < 12; k++) {
      const a = k * Math.PI / 6, el = document.elementFromPoint(x + Math.cos(a) * r, y + Math.sin(a) * r), p = el && el.closest ? el.closest('.bz [data-part]') : null;
      if (p) return p;
    }
    return null;
  }
  // ---- taps: zoom first, then pick (a click made by a key goes straight to the part) ----
  let swallow = false;
  document.addEventListener('click', e => {
    const t = e.target; if (!t || !t.closest) return;
    const bz = t.closest('.bz'); if (!bz || t.closest('.bz-bar')) return;
    const svg = bz.querySelector('svg.bodyfig'); if (!svg || !svg.contains(t)) return;
    if (swallow) { swallow = false; e.stopPropagation(); e.preventDefault(); return; }
    if (e.detail === 0 && t.closest('[data-part]')) return;
    if (!bz.classList.contains('zoomed')) {
      const on = t.closest('[data-part]') || nearest(e.clientX, e.clientY);
      e.stopPropagation(); e.preventDefault(); zoomAt(bz, svg, e.clientX, e.clientY, on && svg.contains(on) ? on.dataset.part : ''); return;
    }
    if (!t.closest('[data-part]')) { const p = nearest(e.clientX, e.clientY); e.stopPropagation(); e.preventDefault(); if (p) p.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, clientX: e.clientX, clientY: e.clientY, detail: 1 })); }
  }, true);
  // ---- pinch and drag ----
  const P = new Map(); let g = null;
  const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1]);
  document.addEventListener('pointerdown', e => {
    const bz = e.target && e.target.closest ? e.target.closest('.bz') : null; if (!bz || e.target.closest('.bz-bar')) return;
    const svg = bz.querySelector('svg.bodyfig'); if (!svg || !svg.contains(e.target)) return;
    P.set(e.pointerId, [e.clientX, e.clientY]);
    if (!g || g.bz !== bz) g = { bz, svg, moved: false };
    const pts = [...P.values()]; g.vb0 = get(svg); g.p0 = pts.map(p => p.slice()); g.n = pts.length;
    if (g.n === 2) g.d0 = dist(pts[0], pts[1]);
  }, { passive: true });
  document.addEventListener('pointermove', e => {
    if (!g || !P.has(e.pointerId)) return;
    P.set(e.pointerId, [e.clientX, e.clientY]); const pts = [...P.values()], svg = g.svg, r = svg.getBoundingClientRect(), vb0 = g.vb0;
    const upx = vb0[2] / Math.max(1, r.width);          // figure units in one pixel
    if (pts.length >= 2 && g.d0) {
      const d = dist(pts[0], pts[1]); if (Math.abs(d - g.d0) < 6 && !g.moved) return;
      g.moved = true; const s = Math.max(0.4, d / g.d0);
      let w = Math.min(FULL[2] * 1.6, Math.max(FULL[2] / 7, vb0[2] / s)); const h = w * vb0[3] / vb0[2];
      const mx = (g.p0[0][0] + g.p0[1][0]) / 2 - r.left, my = (g.p0[0][1] + g.p0[1][1]) / 2 - r.top;     // keep the point between the fingers where it was
      const fx = vb0[0] + mx * upx, fy = vb0[1] + my * upx;
      const vb = [fx - (mx / r.width) * w, fy - (my / r.height) * h, w, h];
      set(svg, vb);
      const z = w < FULL[2] * 0.95; if (z !== g.bz.classList.contains('zoomed')) zoomed(g.bz, z, 'Zoomed in');
    } else if (pts.length === 1 && g.bz.classList.contains('zoomed')) {
      const dx = pts[0][0] - g.p0[0][0], dy = pts[0][1] - g.p0[0][1]; if (!g.moved && Math.hypot(dx, dy) < 7) return;
      g.moved = true; set(svg, [vb0[0] - dx * upx, vb0[1] - dy * upx, vb0[2], vb0[3]]);
    }
  }, { passive: true });
  const up = e => {
    if (!g || !P.has(e.pointerId)) return; P.delete(e.pointerId);
    if (g.moved) { swallow = e.type === 'pointerup'; setTimeout(() => { swallow = false; }, 350); if (g.bz.classList.contains('zoomed')) keep(g.bz, g.svg, (kept[g.bz.dataset.bzk] || {}).name || 'Zoomed in'); else drop(g.bz); }
    if (!P.size) g = null; else { const pts = [...P.values()]; g.vb0 = get(g.svg); g.p0 = pts.map(p => p.slice()); g.n = pts.length; g.d0 = 0; }
  };
  document.addEventListener('pointerup', up, { passive: true });
  document.addEventListener('pointercancel', up, { passive: true });
  // ---- a zoom stays through a redraw of the same page ----
  function restore() {
    const v = (A.top() || {}).name || '';
    if (v !== keptView) { for (const k of Object.keys(kept)) delete kept[k]; keptView = v; }
    $$('.bz[data-bzk]').forEach(bz => { const k = kept[bz.dataset.bzk], svg = bz.querySelector('svg.bodyfig'); if (!k || !svg) return; set(svg, k.vb); zoomed(bz, true, k.name); });
  }
  { const after0 = A.afterRender; A.afterRender = name => { if (after0) after0(name); restore(); }; }
  // the soreness sheet and the full-screen map are drawn in a sheet: they keep their zoom by the same box
  window.BodyZoom = { restore, out, zoomAt, forget: pre => { for (const k of Object.keys(kept)) if (k.startsWith(pre)) delete kept[k]; } };

  // ---- the small maps open full screen: the same map, big, with zoom ----
  const REG = new Map(); let rn = 0;
  function register(cfg) { rn++; REG.set(rn, cfg); if (REG.size > 30) REG.delete(REG.keys().next().value); return rn; }
  ACT.bodyFull = el => {
    const cfg = REG.get(+el.dataset.r); if (!cfg || !window.Insights || !window.Insights.bodies) return;
    const card = el.closest('.card'), h = card && card.querySelector('h3') ? card.querySelector('h3').textContent : 'Body map', w = el.closest('.bodies');
    window.BodyZoom.forget('full-');           // a new full-screen map starts with the whole body
    A.openSheet(`<h2>${A.esc(h)}</h2><p class="small muted">Tap an area to zoom in, then tap a part. Pinch to zoom, drag to look around.</p>${window.Insights.bodies(cfg.level, 'full', Object.assign({}, cfg.opt, { side: w ? w.dataset.side : '' }))}${cfg.legend || ''}`);
  };
  window.BodyZoom.register = register;
})();
