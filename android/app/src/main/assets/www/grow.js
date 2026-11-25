/* GymDay 1.35 – text boxes that grow. A <textarea class="grow-box"> starts one line high and gets taller as you type, so a long
   food name (up to about 100 words) can be read whole. A name has no new lines: Enter ends the typing (as Done does), and a line
   break pasted in becomes a space. Boxes drawn later (a page, a sheet) are sized as they appear. */
(function () {
  const SEL = 'textarea.grow-box';
  function fit(el) {
    if (!el || !el.isConnected || !el.getClientRects().length) return;          // not on the screen yet: sized when it is
    el.style.height = 'auto'; el.style.height = (el.scrollHeight + 2) + 'px';
  }
  const all = root => (root || document).querySelectorAll(SEL).forEach(fit);
  document.addEventListener('input', e => {
    const t = e.target; if (!t || !t.matches || !t.matches(SEL)) return;
    if (/[\r\n]/.test(t.value)) { const p = t.selectionStart; t.value = t.value.replace(/\s*[\r\n]+\s*/g, ' '); try { t.setSelectionRange(p, p); } catch (x) { /* fine */ } t.dispatchEvent(new Event('input', { bubbles: true })); return; }
    fit(t);
  });
  document.addEventListener('keydown', e => { const t = e.target; if (e.key === 'Enter' && t && t.matches && t.matches(SEL)) { e.preventDefault(); t.blur(); } });
  document.addEventListener('focusin', e => { const t = e.target; if (t && t.matches && t.matches(SEL)) fit(t); });
  new MutationObserver(ms => {
    for (const m of ms) for (const n of m.addedNodes) {
      if (n.nodeType !== 1) continue;
      if (n.matches && n.matches(SEL)) fit(n); else if (n.querySelector && n.querySelector(SEL)) n.querySelectorAll(SEL).forEach(fit);
    }
  }).observe(document.documentElement, { childList: true, subtree: true });
  let rt = 0; window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(() => all(), 120); });
  window.GrowBox = { fit, all, MAX: 600 };
})();
