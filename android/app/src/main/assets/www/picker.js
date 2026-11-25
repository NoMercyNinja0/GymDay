/* GymDay v1.28: every dropdown opens GymDay's own menu right under its box, in the app's look, instead of the phone's grey
   dialog. The <select> itself stays in the page (its value, its label, what happens when it changes): only the list it opens
   is GymDay's. A tap, a click, Enter or Space opens it; a choice sets the value and sends "change" as the phone's list would.
   Back, Escape or a tap outside closes it. A select with data-native="1" (or a multi-select) keeps the phone's list. */
(function () {
  'use strict';
  const A = window.App; if (!A) return;
  const esc = A.esc;
  let cur = null;            // { sel, layer }
  const selOf = t => { const s = t && t.closest ? t.closest('select') : null; return s && !s.multiple && !(s.size > 1) && !s.disabled && s.dataset.native !== '1' ? s : null; };
  function labelOf(sel) {
    const a = sel.getAttribute('aria-label'); if (a) return a;
    if (sel.labels && sel.labels.length) return sel.labels[0].textContent.trim();
    const row = sel.closest('.row'), g = row && row.querySelector('.grow');
    return g ? g.textContent.trim().split('\n')[0].slice(0, 60) : 'Choose';
  }
  const item = op => op.hidden ? '' : `<button type="button" class="nsel-o ${op.selected ? 'on' : ''}" role="option" aria-selected="${op.selected ? 'true' : 'false'}" data-v="${esc(op.value)}" ${op.disabled ? 'disabled' : ''}><span class="grow">${esc(op.textContent.trim())}</span>${op.selected ? '<span class="nsel-ck" aria-hidden="true">✓</span>' : ''}</button>`;
  function close(refocus) {
    const o = cur; if (!o) return false; cur = null;
    o.layer.remove();
    if (refocus !== false && document.body.contains(o.sel)) { try { o.sel.focus({ preventScroll: true }); } catch (e) { } }
    return true;
  }
  // the page may have been drawn again while the menu was open: the same select in the new page
  function live(sel) {
    if (document.body.contains(sel)) return sel;
    if (sel.id) return document.getElementById(sel.id);
    if (sel.dataset.bind) return document.querySelector(`select[data-bind="${CSS.escape(sel.dataset.bind)}"]`);
    return null;
  }
  function choose(v) {
    const o = cur; if (!o) return;
    close(false);
    const sel = live(o.sel); if (!sel) return;
    try { sel.focus({ preventScroll: true }); } catch (e) { }
    if (sel.value === v) return;
    sel.value = v;
    sel.dispatchEvent(new Event('input', { bubbles: true }));
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  }
  function open(sel) {
    if (cur) close(false);
    if (!sel.options.length) return;
    let h = '';
    for (const c of sel.children) {
      if (c.tagName === 'OPTGROUP') h += `<div class="nsel-g" role="presentation">${esc(c.label)}</div>` + [...c.children].map(item).join('');
      else if (c.tagName === 'OPTION') h += item(c);
    }
    const layer = document.createElement('div');
    layer.className = 'nsel-layer';
    layer.innerHTML = `<div class="nsel-pop" role="listbox" aria-label="${esc(labelOf(sel))}" style="visibility:hidden">${h}</div>`;
    document.body.appendChild(layer);
    cur = { sel, layer };
    // under the box when it fits, else above it; as wide as the box (at least 200 px), inside the screen
    const pop = layer.firstElementChild, r = sel.getBoundingClientRect(), vw = window.innerWidth, vh = window.innerHeight, m = 8;
    const w = Math.min(vw - 2 * m, Math.max(200, r.width));
    pop.style.width = w + 'px';
    pop.style.left = Math.max(m, Math.min(r.left, vw - w - m)) + 'px';
    const below = vh - r.bottom - m - 6, above = r.top - m - 6, want = Math.min(pop.scrollHeight, vh * 0.6);
    if (below >= want || below >= above) { pop.style.top = (r.bottom + 6) + 'px'; pop.style.maxHeight = Math.max(120, below) + 'px'; }
    else { pop.style.maxHeight = Math.max(120, above) + 'px'; pop.style.top = Math.max(m, r.top - 6 - Math.min(want, above)) + 'px'; }
    pop.style.visibility = '';
    const on = pop.querySelector('.nsel-o.on') || pop.querySelector('.nsel-o:not([disabled])');
    if (on) { on.scrollIntoView({ block: 'nearest' }); try { on.focus({ preventScroll: true }); } catch (e) { } }
    layer.addEventListener('click', e => {
      const b = e.target.closest('.nsel-o');
      if (b) { if (!b.disabled) choose(b.dataset.v); return; }
      if (!e.target.closest('.nsel-pop')) close();
    });
  }
  // a tap (not a scroll) on a select: our menu instead of the phone's list
  let t0 = null;
  document.addEventListener('touchstart', e => { const s = selOf(e.target); t0 = s && e.touches.length === 1 ? { s, x: e.touches[0].clientX, y: e.touches[0].clientY, at: Date.now() } : null; }, { capture: true, passive: true });
  document.addEventListener('touchend', e => {
    const t = t0; t0 = null; if (!t || !e.changedTouches.length) return;
    const p = e.changedTouches[0];
    if (Math.abs(p.clientX - t.x) > 10 || Math.abs(p.clientY - t.y) > 10 || Date.now() - t.at > 800 || selOf(document.elementFromPoint(p.clientX, p.clientY)) !== t.s) return;
    if (e.cancelable) e.preventDefault();
    open(t.s);
  }, { capture: true, passive: false });
  document.addEventListener('mousedown', e => { const s = selOf(e.target); if (!s || e.button !== 0) return; e.preventDefault(); if (!cur || cur.sel !== s) open(s); }, true);
  document.addEventListener('click', e => { const s = selOf(e.target); if (!s) return; e.preventDefault(); if (!cur) open(s); }, true);
  document.addEventListener('keydown', e => {
    if (cur) {
      const list = [...cur.layer.querySelectorAll('.nsel-o:not([disabled])')], i = list.indexOf(document.activeElement);
      if (e.key === 'Escape' || e.key === 'Tab') { e.preventDefault(); close(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); const n = list[Math.max(0, Math.min(list.length - 1, (i < 0 ? 0 : i) + (e.key === 'ArrowDown' ? 1 : -1)))]; if (n) n.focus(); }
      else if (e.key === 'Home' || e.key === 'End') { e.preventDefault(); const n = e.key === 'Home' ? list[0] : list[list.length - 1]; if (n) n.focus(); }
      return;
    }
    const s = selOf(e.target);
    if (s && (e.key === 'Enter' || e.key === ' ' || e.key === 'F4' || (e.altKey && (e.key === 'ArrowDown' || e.key === 'ArrowUp')))) { e.preventDefault(); open(s); }
  }, true);
  // the phone's back button and a page drawn again close it
  const back0 = window.appBack;
  window.appBack = () => (close() ? true : back0 ? back0() : false);
  window.addEventListener('resize', () => { if (cur) close(false); });
  window.Picker = { open, close, isOpen: () => !!cur };
})();
