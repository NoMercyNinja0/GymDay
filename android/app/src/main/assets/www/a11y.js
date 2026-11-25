/* GymDay – accessibility (1.21). Nothing changes for a finger; TalkBack (the phone's screen reader) and a keyboard can
   now reach, name and press everything:
   - anything tappable that isn't a real button (a card, a list row, a muscle on the body map) is announced as a button,
     has a place in the order, and Enter or Space presses it;
   - switches and drop-downs are named after their row ("Voice logging, switch, on"), with the row's small print read
     after; tapping anywhere on a switch's row flips it;
   - buttons that are only a symbol (‹, ✕, +) get words;
   - pop-up messages ("Saved", "Moved to lunch") are read out; a sheet is a dialog: the reader starts in it, and comes
     back to where it was when the sheet closes;
   - the tab you are on is marked, card headings sit under the screen's title, pictures without words are skipped,
     and choice chips say which one is picked. */
(function () {
  const A = window.App;
  const NATIVE = /^(BUTTON|A|INPUT|SELECT|TEXTAREA|SUMMARY|LABEL|OPTION|DETAILS)$/;
  const SYM = /^[\s\p{P}\p{S}\p{Extended_Pictographic}‍️]*$/u;          // nothing but symbols, punctuation or emoji
  const LABELS = {
    back: 'Back', pickCancel: 'Back', delPhoto: 'Remove this photo', bodyDel: 'Remove',
    spPlN: el => (/\+/.test(el.textContent) ? 'One more' : 'One less'),
    kcDay: el => { const d = new Date(+el.dataset.t || 0); return 'Open ' + d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' }); },
  };
  const flat = s => String(s || '').replace(/\s+/g, ' ').trim();
  const named = el => !!(flat(el.getAttribute('aria-label')) || el.getAttribute('aria-labelledby') || flat(el.getAttribute('title')));
  let uid = 0;
  const idOf = el => el.id || (el.id = 'a11y' + (++uid));

  // the words of a row's title: its text without the small print under it
  function rowTitle(row) {
    const g = row.querySelector('.grow') || row; const c = g.cloneNode(true);
    c.querySelectorAll('.xs, .dim, .sub, small, input, select, button, textarea, svg').forEach(x => x.remove());
    return flat(c.textContent);
  }

  function fix(root) {
    if (!root || !root.querySelectorAll) return;
    // tappable things that aren't buttons
    root.querySelectorAll('[data-act]').forEach(el => {
      const tag = el.tagName.toUpperCase();
      if (!NATIVE.test(tag)) {
        // a card that holds buttons of its own stays a plain card: a button can't hold buttons (TalkBack would lose them)
        if (!el.hasAttribute('role') && el.querySelector('button, a[href], input, select, textarea, [data-act]')) return;
        if (!el.hasAttribute('role')) el.setAttribute('role', 'button');
        if (el.getAttribute('role') === 'button' && !el.hasAttribute('tabindex') && !el.closest('[aria-hidden="true"]')) el.setAttribute('tabindex', '0');
      }
      if (el.dataset.act === 'bodyPart' && !named(el) && window.BodyFig) { const nm = window.BodyFig.name(el.dataset.part || ''); if (nm) el.setAttribute('aria-label', nm); }
      if (!named(el)) {
        const t = flat(el.textContent), w = LABELS[el.dataset.act];
        if ((!t || SYM.test(t)) && w) el.setAttribute('aria-label', typeof w === 'function' ? w(el) : w);
      } else if (!NATIVE.test(tag) || tag === 'BUTTON') {
        // a name must hold the words you can see (TalkBack users and voice control say what they see)
        const lab = flat(el.getAttribute('aria-label')), vis = flat(el.innerText || el.textContent);
        if (lab && vis.length > 2 && /[\p{L}\p{N}]{2}/u.test(vis) && !lab.toLowerCase().includes(vis.toLowerCase()) && vis.length < 80) el.setAttribute('aria-label', vis + ', ' + lab);
      }
    });
    // switches, boxes and drop-downs: named after their row
    root.querySelectorAll('input:not([type=hidden]):not([type=file]), select, textarea').forEach(inp => {
      if (inp.type === 'checkbox' && inp.closest('.row') && !inp.hasAttribute('role') && inp.closest('.card, #extrasCard, .sheet')) inp.setAttribute('role', 'switch');
      if (inp.closest('label') || named(inp) || (inp.id && document.querySelector(`label[for="${inp.id}"]`))) return;
      const row = inp.closest('.row, .list-item, .ml-row');
      const title = row ? rowTitle(row) : '';
      const prev = inp.previousElementSibling;
      const lbl = prev && /^(LABEL|SPAN|DIV)$/.test(prev.tagName) && prev.classList.contains('lbl') ? flat(prev.textContent) : '';
      const name = title || lbl || flat(inp.getAttribute('placeholder'));
      if (name) inp.setAttribute('aria-label', name);
      const small = row && row.querySelector('.grow .xs, .grow .dim');
      if (small && !inp.hasAttribute('aria-describedby')) inp.setAttribute('aria-describedby', idOf(small));
    });
    // a picture you can tap parts of (the body map) is a group of buttons, not one picture
    root.querySelectorAll('svg[role="img"]').forEach(sv => { if (sv.querySelector('[data-act]')) sv.setAttribute('role', 'group'); });
    // pictures that say nothing are skipped, decorative icons too
    root.querySelectorAll('img:not([alt])').forEach(im => im.setAttribute('alt', ''));
    root.querySelectorAll('svg:not([role]):not([aria-hidden])').forEach(sv => { if (!sv.querySelector('[data-act]') && !sv.closest('[data-act]') && !flat(sv.textContent)) sv.setAttribute('aria-hidden', 'true'); });
    root.querySelectorAll('.nav-btn svg, .chev, .kci-chev, .handle').forEach(x => x.setAttribute('aria-hidden', 'true'));
    // chips that pick one of a few say which one is picked
    root.querySelectorAll('button.chip').forEach(ch => {
      const box = ch.parentElement; if (!box) return;
      const sib = [...box.children].filter(x => x.matches('button.chip'));
      if (sib.length > 1 && sib.some(x => x.classList.contains('on'))) ch.setAttribute('aria-pressed', ch.classList.contains('on') ? 'true' : 'false');
    });
    // card headings sit one step under the screen's title
    if (root.id === 'view' || root.querySelector('.top h1')) root.querySelectorAll('h3:not([aria-level])').forEach(h => h.setAttribute('aria-level', '2'));
  }

  function fixNav() {
    document.querySelectorAll('.nav-btn').forEach(b => { if (b.classList.contains('on')) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current'); });
  }

  // ---------------- the screen, the sheet and the bottom bar: fixed whenever they are drawn ----------------
  const view = document.getElementById('view'), sheet = document.getElementById('sheet'), toast = document.getElementById('toast'), nav = document.getElementById('nav');
  let queued = false;
  const later = recs => {
    if (queued || (recs && !recs.some(r => [...r.addedNodes].some(n => n.nodeType === 1)))) return;      // a number counting up or a clock ticking: nothing new to name
    queued = true; Promise.resolve().then(() => { queued = false; fix(view); if (!sheet.classList.contains('hidden')) fix(sheet); fixNav(); });
  };
  new MutationObserver(later).observe(view, { childList: true, subtree: true });
  new MutationObserver(later).observe(sheet, { childList: true, subtree: true });
  if (nav) { fix(nav); new MutationObserver(fixNav).observe(nav, { attributes: true, subtree: true, attributeFilter: ['class'] }); }
  fix(view); fixNav();

  // pop-up messages are read out
  if (toast) { toast.setAttribute('role', 'status'); toast.setAttribute('aria-live', 'polite'); toast.setAttribute('aria-atomic', 'true'); }

  // a sheet is a dialog: the reader starts in it and goes back where it was afterwards
  let back = null, open = false;
  function sheetState() {
    const on = !sheet.classList.contains('hidden') && !!sheet.querySelector('.panel');
    if (on) {
      const panel = sheet.querySelector('.panel'), h = panel.querySelector('h2, h1, h3');
      sheet.setAttribute('role', 'dialog'); sheet.setAttribute('aria-modal', 'true');
      if (h) sheet.setAttribute('aria-labelledby', idOf(h)); else sheet.removeAttribute('aria-labelledby');
      fix(sheet);
      if (!open) {
        open = true;
        const a = document.activeElement; back = a && a !== document.body && !sheet.contains(a) ? a : null;
        if (!panel.contains(document.activeElement)) { panel.setAttribute('tabindex', '-1'); try { panel.focus({ preventScroll: true }); } catch (e) { } }
      } else if (!sheet.contains(document.activeElement) && document.activeElement === document.body) {
        // drawn again (the same sheet with new content): keep the reader inside it
        panel.setAttribute('tabindex', '-1'); try { panel.focus({ preventScroll: true }); } catch (e) { }
      }
    } else if (open) {
      open = false; sheet.removeAttribute('role'); sheet.removeAttribute('aria-modal'); sheet.removeAttribute('aria-labelledby');
      const b = back; back = null;
      if (b && document.body.contains(b) && (document.activeElement === document.body || !document.activeElement || sheet.contains(document.activeElement))) { try { b.focus({ preventScroll: true }); } catch (e) { } }
    }
  }
  new MutationObserver(sheetState).observe(sheet, { attributes: true, attributeFilter: ['class'], childList: true });

  // Enter or Space presses anything that is announced as a button
  document.addEventListener('keydown', e => {
    if (e.key !== 'Enter' && e.key !== ' ' && e.key !== 'Spacebar') return;
    const el = e.target; if (!el || !el.getAttribute || NATIVE.test(el.tagName.toUpperCase())) return;
    if (el.getAttribute('role') !== 'button') return;
    e.preventDefault(); el.click();
  });

  // tapping the words of a switch's row flips the switch (a bigger target than the little box)
  document.addEventListener('click', e => {
    const t = e.target; if (!t || !t.closest || e.defaultPrevented) return;
    const row = t.closest('.row'); if (!row) return;
    const inp = row.lastElementChild; if (!inp || inp.tagName !== 'INPUT' || inp.type !== 'checkbox' || inp.disabled) return;
    if (t === inp || t.closest('button, a, input, select, textarea, label, summary, [data-act], [role=button]')) return;
    if (row.querySelectorAll('input, select, textarea, button, [data-act]').length !== 1) return;
    inp.click();
  });

  window.A11y = { fix, LABELS };
})();
