/* GymDay – how the app looks: one colour scheme (electric blue + cyan) on a dark or a light background.
   The choice is kept on this phone (Store.meta.theme: 'dark' | 'light' | 'auto' = same as the phone).
   1.21: and the text size (Store.meta.textSize: 'phone' = the phone's own font size, or S / M / L / XL); style.css scales
   every font by --fs, big numbers and titles by --fsl (half as much), and data-fs="big" lets a few crowded rows rearrange. */
(function () {
  const S = window.Store, M = S.meta;
  const mq = window.matchMedia ? window.matchMedia('(prefers-color-scheme: light)') : null;
  const mode = () => (['dark', 'light', 'auto'].includes(M.theme) ? M.theme : 'dark');
  const isLight = () => mode() === 'light' || (mode() === 'auto' && !!mq && mq.matches);
  function apply() {
    const light = isLight();
    document.documentElement.dataset.theme = light ? 'light' : 'dark';
    const tc = document.querySelector('meta[name="theme-color"]'); if (tc) tc.setAttribute('content', light ? '#F2F6FC' : '#05080F');
    try { if (S.isAndroid && window.Android.themeBars) window.Android.themeBars(light); } catch (e) { }      // status bar and the phone's own buttons
  }
  if (mq) { if (mq.addEventListener) mq.addEventListener('change', apply); else if (mq.addListener) mq.addListener(apply); }
  apply();
  // ---------------- the look (1.22): Glass (frosted see-through cards, soft glow, bigger numbers), or the look before it ----------------
  // Store.meta.look: 'glass' (the default) | 'classic'. glass.css holds every Glass rule under html[data-look="glass"].
  const LOOKS = [['glass', 'Glass (new)'], ['classic', 'Classic']];
  const lookMode = () => (M.look === 'classic' ? 'classic' : 'glass');
  function applyLook() { document.documentElement.dataset.look = lookMode(); }
  applyLook();
  // ---------------- text size (1.21) ----------------
  const SIZES = [['phone', 'Same as phone'], ['S', 'Small'], ['M', 'Normal'], ['L', 'Large'], ['XL', 'Extra large']];
  const SCALE = { S: 0.9, M: 1, L: 1.15, XL: 1.3 };
  const sizeMode = () => (SIZES.some(z => z[0] === M.textSize) ? M.textSize : 'phone');
  const phoneScale = () => {
    let f = window.__fontScale || 1;                                       // (the tests' stand-in for the phone)
    try { if (S.isAndroid && window.Android && window.Android.fontScale) f = +window.Android.fontScale() || 1; } catch (e) { }
    return f;
  };
  const fsNow = () => { const m = sizeMode(), f = m === 'phone' ? phoneScale() : SCALE[m]; return Math.min(1.6, Math.max(0.85, +f || 1)); };
  function applySize() {
    const f = fsNow(), h = document.documentElement;
    h.style.setProperty('--fs', String(+f.toFixed(3))); h.style.setProperty('--fsl', String(+(1 + (f - 1) * 0.5).toFixed(3)));
    if (f >= 1.12) h.dataset.fs = 'big'; else delete h.dataset.fs;
  }
  applySize();
  // v1.26: Theme and Style are pills, Text size a small box; each row has its icon
  function settingsCard() {
    const m = mode(), o = (v, t) => `<option value="${v}" ${m === v ? 'selected' : ''}>${t}</option>`;
    const z = sizeMode(), ph = Math.round(phoneScale() * 100), K = window.SetKit;
    if (!K) return `<div class="card"><h3>Look</h3><div class="row" style="padding:6px 0"><div class="grow">Theme<div class="xs dim">Dark or light background</div></div>
      <select class="input" data-bind="theme" style="width:158px">${o('dark', 'Dark')}${o('light', 'Light')}${o('auto', 'Same as phone')}</select></div></div>`;
    return `<div class="card set-card"><h3>Look</h3>
      <div class="row">${K.tile('moon')}<div class="grow">Theme<div class="xs dim">Dark or light background; Auto follows your phone</div></div>${K.seg('theme', m, [['dark', 'Dark'], ['light', 'Light'], ['auto', 'Auto', 'Same as phone']], 'Theme', { wide: true })}</div>
      <div class="row">${K.tile('sparkles')}<div class="grow">Style<div class="xs dim">${lookMode() === 'glass' ? 'Frosted cards, soft glow, bigger numbers' : 'The look GymDay had before 1.22'}</div></div>${K.seg('look', lookMode(), LOOKS.map(([v, t]) => [v, t.replace(/\s*\(new\)/, '')]), 'Style', { wide: true })}</div>
      <div class="row">${K.tile('text')}<div class="grow">Text size<div class="xs dim">${z === 'phone' ? `Auto follows your phone's font size${ph !== 100 ? ` (${ph}% now)` : ''}` : 'Bigger or smaller text everywhere in GymDay'}</div></div>
      <select class="input" data-bind="textSize" aria-label="Text size">${SIZES.map(([v, t]) => `<option value="${v}" ${z === v ? 'selected' : ''}>${v === 'phone' ? 'Auto' : t}</option>`).join('')}</select></div>
      ${window.BodyFig ? `<div class="row">${K.tile('user')}<div class="grow">Body figure<div class="xs dim">The body on muscle maps, recovery and soreness</div></div>${K.seg('figure', window.BodyFig.sex(), [['m', 'Male'], ['f', 'Female']], 'Body figure')}</div>` : ''}</div>`;
  }
  document.addEventListener('change', e => {
    const t = e.target; if (!t || !t.dataset) return;
    if (t.dataset.bind === 'theme') { M.theme = t.value; S.saveMeta(); apply(); }
    else if (t.dataset.bind === 'look') { M.look = t.value === 'classic' ? 'classic' : 'glass'; S.saveMeta(); applyLook(); if (window.App && window.App.rerender) window.App.rerender(); }
    else if (t.dataset.bind === 'textSize') { M.textSize = t.value; S.saveMeta(); applySize(); if (window.App && window.App.rerender) window.App.rerender(); }
    else if (t.dataset.bind === 'figure') { S.data.settings.figure = t.value === 'f' ? 'f' : 'm'; S.save(true); if (window.App && window.App.rerender) window.App.rerender(); }      // 1.35
  });
  window.Look = { apply, mode, isLight, settingsCard, applySize, fsNow, sizeMode, lookMode, applyLook };
})();
