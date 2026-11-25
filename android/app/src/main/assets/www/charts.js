/* GymDay 1.22 · charts you can touch (charts.js).
   Every chart carries its points in data-pts: [[x, y, label, value], …] in the chart's own units (y = null for a bar chart).
   Put a finger on a chart, or slide along it: a guide line marks the nearest point and a label above the chart says
   whose day it is and its value. Sliding sideways reads the chart; sliding up or down still scrolls the page.
   A plain tap keeps doing what it did (on the calorie chart it picks that day). */
(function () {
  const A = window.App, S = window.Store;
  if (!A) return;
  const NS = 'http://www.w3.org/2000/svg';
  let live = null, hideT = 0, eatClick = 0, tip = null, shown = null;
  const ptsOf = svg => { if (!svg.__pts) { try { svg.__pts = JSON.parse(svg.dataset.pts) || []; } catch (e) { svg.__pts = []; } } return svg.__pts; };
  function layer(svg) {
    let g = svg.querySelector('g.scrub');
    if (!g) {
      g = document.createElementNS(NS, 'g'); g.setAttribute('class', 'scrub'); g.setAttribute('aria-hidden', 'true');
      ['line', 'circle'].forEach(tag => { const e = document.createElementNS(NS, tag); e.setAttribute('class', tag === 'line' ? 'scrub-l' : 'scrub-d'); g.appendChild(e); });
      svg.appendChild(g);
    }
    return g;
  }
  function nearest(svg, clientX) {
    const pts = ptsOf(svg); if (!pts.length) return -1;
    const r = svg.getBoundingClientRect(), vb = svg.viewBox.baseVal, x = (clientX - r.left) / r.width * vb.width + vb.x;
    let best = 0, bd = Infinity; pts.forEach((p, i) => { const d = Math.abs(p[0] - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  function show(svg, i) {
    const pts = ptsOf(svg), p = pts[i]; if (!p) return;
    const vb = svg.viewBox.baseVal, g = layer(svg), l = g.children[0], d = g.children[1], r = svg.getBoundingClientRect();
    if (shown && shown !== svg) clear(shown);
    shown = svg; svg.dataset.at = String(i);
    const lane = svg.classList.contains('di-svg');        // a lane chart (daily.js): the day letters are under it, not in it
    l.setAttribute('x1', p[0]); l.setAttribute('x2', p[0]); l.setAttribute('y1', vb.y + 2); l.setAttribute('y2', vb.y + vb.height - (lane ? 2 : 18));
    // 1.35.1: a lane chart's point has no height of its own: the dot drawn for that day gives it
    let py = p[1];
    if (py == null && lane) { const c = [...svg.querySelectorAll('circle.di-dt')].find(c => Math.abs(+c.getAttribute('cx') - p[0]) < 0.6); if (c) py = +c.getAttribute('cy'); }
    if (py == null) d.setAttribute('r', 0); else { d.setAttribute('r', 5); d.setAttribute('cx', p[0]); d.setAttribute('cy', py); }
    try { svg.dispatchEvent(new CustomEvent('chartread', { bubbles: true, detail: { i, p } })); } catch (e) { /* old WebView */ }
    // 1.35.1: a chart in a [data-read] box (the Recovery page's nights) marks the day with its band and says the value and the
    // day in the box's .rc-read line above the chart, in place of the label that floats over it
    const box = svg.closest('[data-read]'), out = box && box.querySelector('.rc-read');
    if (out) {
      const band = svg.querySelector('rect.di-sel');
      if (band) { const w = +band.getAttribute('width') || 0; band.style.transform = `translateX(${(p[0] - w / 2).toFixed(2)}px)`; band.removeAttribute('visibility'); }
      if (out.dataset.s == null) out.dataset.s = out.innerHTML;
      out.innerHTML = `<b>${A.esc(p[3])}</b> · ${A.esc(p[2])}`; out.classList.add('on');
      if (tip) tip.classList.add('hidden');
      return;
    }
    if (!tip) { tip = document.createElement('div'); tip.className = 'scrub-tip'; tip.id = 'scrubTip'; tip.setAttribute('aria-hidden', 'true'); document.getElementById('app').appendChild(tip); }
    tip.innerHTML = `<b>${A.esc(p[3])}</b><span>${A.esc(p[2])}</span>`;
    tip.classList.remove('hidden');
    const cx = r.left + (p[0] - vb.x) / vb.width * r.width, w = tip.offsetWidth, h = tip.offsetHeight;
    tip.style.left = Math.round(Math.max(8 + w / 2, Math.min(window.innerWidth - 8 - w / 2, cx))) + 'px';
    tip.style.top = Math.round(r.top - h - 6 >= 6 ? r.top - h - 6 : r.bottom + 6) + 'px';
  }
  function clear(svg) {
    const g = svg && svg.querySelector('g.scrub'); if (g) g.remove(); if (!svg) return; delete svg.dataset.at;
    const box = svg.closest('[data-read]'), out = box && box.querySelector('.rc-read'), band = box ? svg.querySelector('rect.di-sel') : null;
    if (out && out.dataset.s != null) { out.innerHTML = out.dataset.s; delete out.dataset.s; out.classList.remove('on'); }
    if (band) band.setAttribute('visibility', 'hidden');
  }
  function hide() { clearTimeout(hideT); if (shown) clear(shown); shown = null; if (tip) tip.classList.add('hidden'); }
  const chartAt = e => (e.target && e.target.closest ? e.target.closest('svg[data-pts]') : null);

  document.addEventListener('pointerdown', e => {
    const svg = chartAt(e); if (!svg) { if (shown) hide(); return; }
    clearTimeout(hideT);
    live = { svg, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false };
    const i = nearest(svg, e.clientX); if (i >= 0) show(svg, i);
  }, true);
  document.addEventListener('pointermove', e => {
    if (!live || e.pointerId !== live.id) return;
    if (!live.svg.isConnected) { live = null; hide(); return; }
    if (Math.abs(e.clientX - live.x) > 6) live.moved = true;
    const i = nearest(live.svg, e.clientX); if (i >= 0 && String(i) !== live.svg.dataset.at) show(live.svg, i);
  }, true);
  const end = e => {
    if (!live || (e.pointerId != null && e.pointerId !== live.id)) return;
    if (live.moved) { eatClick = Date.now(); const m = S.meta; if (!m.scrubbed) { m.scrubbed = 1; if (S.saveMeta) S.saveMeta(); document.querySelectorAll('.scrub-hint').forEach(h => h.remove()); } }
    live = null; clearTimeout(hideT); hideT = setTimeout(hide, 2600);
  };
  document.addEventListener('pointerup', end, true);
  document.addEventListener('pointercancel', e => { if (live && e.pointerId === live.id) { live = null; clearTimeout(hideT); hideT = setTimeout(hide, 900); } }, true);
  // a slide along a chart is not a tap on what lies under the finger when it lifts
  document.addEventListener('click', e => { if (Date.now() - eatClick < 400 && chartAt(e)) { e.stopPropagation(); e.preventDefault(); } eatClick = 0; }, true);
  window.addEventListener('scroll', () => { if (shown && !live) hide(); }, { passive: true });

  // until the first slide: one line under each chart saying it can be touched
  function hints() {
    if (S.meta.scrubbed) return;
    const all = [...document.querySelectorAll('#view svg[data-pts]')].filter(svg => !svg.closest('[data-read]'));      // 1.35.1: those say it themselves
    all.forEach(svg => {
      if (ptsOf(svg).length < 2 || svg.dataset.hinted) return;
      svg.dataset.hinted = '1';
      const first = all[0] === svg;
      if (first) svg.insertAdjacentHTML('afterend', '<p class="xs dim scrub-hint">☝ Slide a finger along a chart to read each value</p>');
    });
  }
  const after0 = A.afterRender;
  A.afterRender = name => { if (after0) after0(name); if (shown && !shown.isConnected) hide(); hints(); };

  window.Charts = { show, hide, nearest, ptsOf };
})();
