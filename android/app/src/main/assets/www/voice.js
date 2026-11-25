/* GymDay v1.20 – voice logging during a workout, in English, Hindi or Tamil.
   The 🎤 on the workout screen opens the phone's own speech recogniser (Google's, through Android; nothing is recorded by GymDay and
   no microphone permission is needed). What it hears is read here:
     "60 kilo 8 reps", "60 for 8", "60 x 8", "साठ किलो आठ बार", "60 किलो 8", "அறுபது கிலோ எட்டு தடவை"  -> that set, ticked
     "8 reps" / "आठ बार" / "எட்டு தடவை"                                                          -> the reps, same weight, ticked
     "done" / "same again" / "हो गया" / "முடிஞ்சது"                                              -> the next set ticked as it is
     "next" / "अगला" / "அடுத்தது"                                                                -> the next exercise
     "pause" / "resume" / "undo" (unticks the set voice ticked last)
   The same 🎤 types into "Type what you ate". The language is set in Settings (During a workout). */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta;
  const { $, esc, ACT } = A;
  const toast = m => window.toast(m);
  const N = S.isAndroid ? window.Android : (window.__native || null);
  const has = f => !!N && typeof N[f] === 'function';
  const LANGS = [['en-IN', 'English'], ['hi-IN', 'हिंदी Hindi'], ['ta-IN', 'தமிழ் Tamil']];
  const lang = () => (LANGS.some(l => l[0] === D.settings.voiceLang) ? D.settings.voiceLang : 'en-IN');
  const on = () => D.settings.voice !== false;
  const can = () => !!(window.__voice || (has('voiceListen') && (!has('voiceOk') || N.voiceOk())));

  // ---------------- numbers in words ----------------
  const EN = { zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13, fourteen: 14,
    fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20, thirty: 30, forty: 40, fourty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90 };
  // romanised Hindi, as the English recogniser sometimes writes it
  const HR = { ek: 1, do: 2, teen: 3, char: 4, chaar: 4, paanch: 5, panch: 5, chhe: 6, che: 6, saat: 7, aath: 8, nau: 9, das: 10, gyarah: 11, barah: 12, terah: 13, chaudah: 14, pandrah: 15,
    solah: 16, satrah: 17, atharah: 18, unnis: 19, bees: 20, pachchis: 25, pachis: 25, tees: 30, chalis: 40, pachas: 50, saath: 60, sattar: 70, assi: 80, nabbe: 90 };
  const HI = 'एक दो तीन चार पाँच छह सात आठ नौ दस ग्यारह बारह तेरह चौदह पंद्रह सोलह सत्रह अठारह उन्नीस बीस इक्कीस बाईस तेईस चौबीस पच्चीस छब्बीस सत्ताईस अट्ठाईस उनतीस तीस इकतीस बत्तीस तैंतीस चौंतीस पैंतीस छत्तीस सैंतीस अड़तीस उनतालीस चालीस इकतालीस बयालीस तैंतालीस चवालीस पैंतालीस छियालीस सैंतालीस अड़तालीस उनचास पचास इक्यावन बावन तिरपन चौवन पचपन छप्पन सत्तावन अट्ठावन उनसठ साठ इकसठ बासठ तिरसठ चौंसठ पैंसठ छियासठ सड़सठ अड़सठ उनहत्तर सत्तर इकहत्तर बहत्तर तिहत्तर चौहत्तर पचहत्तर छिहत्तर सतहत्तर अठहत्तर उन्यासी अस्सी इक्यासी बयासी तिरासी चौरासी पचासी छियासी सत्तासी अट्ठासी नवासी नब्बे इक्यानवे बानवे तिरानवे चौरानवे पंचानवे छियानवे सत्तानवे अट्ठानवे निन्यानवे'.split(' ');
  const HIW = {}; HI.forEach((w, i) => { HIW[w] = i + 1; });
  Object.assign(HIW, { 'पांच': 5, 'छः': 6, 'छे': 6, 'छह': 6, 'पन्द्रह': 15, 'उन्तीस': 29, 'सौ': 100 });
  // Tamil: units, teens, tens, and the forms tens take before a unit (இருபத்தி ஐந்து = 25)
  const TA = { 'ஒன்று': 1, 'ஒண்ணு': 1, 'ஒரு': 1, 'இரண்டு': 2, 'ரெண்டு': 2, 'மூன்று': 3, 'மூணு': 3, 'நான்கு': 4, 'நாலு': 4, 'ஐந்து': 5, 'அஞ்சு': 5, 'ஆறு': 6, 'ஏழு': 7, 'எட்டு': 8, 'ஒன்பது': 9, 'பத்து': 10,
    'பதினொன்று': 11, 'பதினொண்ணு': 11, 'பன்னிரண்டு': 12, 'பன்னெண்டு': 12, 'பதிமூன்று': 13, 'பதிமூணு': 13, 'பதினான்கு': 14, 'பதினாலு': 14, 'பதினைந்து': 15, 'பதினஞ்சு': 15, 'பதினாறு': 16, 'பதினேழு': 17, 'பதினெட்டு': 18, 'பத்தொன்பது': 19,
    'இருபது': 20, 'முப்பது': 30, 'நாற்பது': 40, 'ஐம்பது': 50, 'அம்பது': 50, 'அறுபது': 60, 'எழுபது': 70, 'எண்பது': 80, 'தொண்ணூறு': 90, 'நூறு': 100 };
  const TA_TENS = { 'இருபத்து': 20, 'இருபத்தி': 20, 'முப்பத்து': 30, 'முப்பத்தி': 30, 'நாற்பத்து': 40, 'நாற்பத்தி': 40, 'ஐம்பத்து': 50, 'ஐம்பத்தி': 50, 'அம்பத்தி': 50, 'அறுபத்து': 60, 'அறுபத்தி': 60,
    'எழுபத்து': 70, 'எழுபத்தி': 70, 'எண்பத்து': 80, 'எண்பத்தி': 80, 'தொண்ணூற்று': 90, 'தொண்ணூற்றி': 90, 'நூற்று': 100, 'நூத்தி': 100, 'நூற்றி': 100 };
  const HALF = new Set(['half', 'आधा', 'साढ़े', 'साढे', 'அரை']);
  const W_UNIT = /^(kg|kgs|kilo|kilos|kilogram|kilograms|किलो|केजी|किग्रा|கிலோ|lb|lbs|pound|pounds)$/;
  const R_UNIT = /^(rep|reps|times|time|repetitions|बार|रेप|रेप्स|रैप|रैप्स|தடவை|முறை|ரெப்|ரெப்ஸ்)$/;
  // one phrase -> tokens, with every number written in words turned into digits
  function tokens(text) {
    const t = String(text || '').toLowerCase().replace(/[०-९]/g, d => String('०१२३४५६७८९'.indexOf(d))).replace(/[௦-௯]/g, d => String('௦௧௨௩௪௫௬௭௮௯'.indexOf(d)))
      .replace(/(\d)\s*(kg|kgs|lb|lbs)\b/g, '$1 $2').replace(/(\d)\s*x\s*(\d)/g, '$1 x $2').replace(/[,;!?।]+/g, ' ').replace(/(\d)\.(\d)/g, '$1#$2').replace(/\./g, ' ').replace(/#/g, '.');
    const raw = t.split(/\s+/).filter(Boolean), out = [];
    for (let i = 0; i < raw.length; i++) {
      let w = raw[i], v = null;
      if (/^\d+(\.\d+)?$/.test(w)) v = +w;
      else if (EN[w] != null) { v = EN[w]; if (v >= 20 && v % 10 === 0 && EN[raw[i + 1]] != null && EN[raw[i + 1]] < 10) { v += EN[raw[i + 1]]; i++; } }
      else if (w === 'hundred' || w === 'sau') v = 100;
      else if (HIW[w] != null) v = HIW[w];
      else if (HR[w] != null && w !== 'do') v = HR[w];
      else if (TA[w] != null) v = TA[w];
      else if (TA_TENS[w] != null) { v = TA_TENS[w]; const nx = TA[raw[i + 1]]; if (nx != null && nx < 10) { v += nx; i++; } }
      else { const tt = Object.keys(TA_TENS).find(k => w.startsWith(k) && TA[w.slice(k.length)] != null); if (tt) v = TA_TENS[tt] + TA[w.slice(tt.length)]; }
      if (v != null) {
        // "one hundred twenty", "एक सौ बीस", a number then "and a half" / "साढ़े" before it
        if ((raw[i + 1] === 'hundred' || raw[i + 1] === 'सौ' || raw[i + 1] === 'sau') && v < 10) { v *= 100; i++; const nx = raw[i + 1]; const n2 = nx == null ? null : /^\d+$/.test(nx) ? +nx : EN[nx] != null ? EN[nx] : HIW[nx] != null ? HIW[nx] : null; if (n2 != null && n2 < 100) { v += n2; i++; } }
        else if (v === 100) { const nx = raw[i + 1]; const n2 = nx == null ? null : /^\d+$/.test(nx) ? +nx : EN[nx] != null ? EN[nx] : HIW[nx] != null ? HIW[nx] : TA[nx] != null ? TA[nx] : null; if (n2 != null && n2 < 100) { v += n2; i++; } }
        const p = out[out.length - 1];
        if (p && p.half && !p.num) { out.pop(); v += 0.5; }                              // साढ़े बाईस = 22.5
        if (raw[i + 1] === 'and' && raw[i + 2] === 'a' && raw[i + 3] === 'half') { v += 0.5; i += 3; }
        else if (raw[i + 1] === 'point' && /^\d$/.test(raw[i + 2] || '')) { v += +raw[i + 2] / 10; i += 2; }
        else if (raw[i + 1] === 'point' && EN[raw[i + 2]] != null && EN[raw[i + 2]] < 10) { v += EN[raw[i + 2]] / 10; i += 2; }
        out.push({ num: true, v, w });
      } else out.push({ w, half: HALF.has(w) });
    }
    return out;
  }
  const CMD = [
    ['undo', /\b(undo|wrong|galat)\b|गलत|पिछला हटाओ|தப்பு|வேண்டாம்/],
    ['next', /\b(next|next exercise|agla|agli)\b|अगला|अगली|अगले|அடுத்தது|அடுத்த/],
    ['pause', /\b(pause|break|ruko)\b|रुको|रोको|पॉज़|நிறுத்து|ப்ரேக்/],
    ['resume', /\b(resume|continue|carry on|chalu)\b|चालू|फिर से शुरू|தொடரு|தொடர்/],
    ['tick', /\b(done|tick|same|same again|finished set|set done|ho gaya|ho gya|hogaya)\b|हो गया|हो गयी|हो गई|डन|वही|முடிஞ்சது|முடிந்தது|டன்|அதே/]
  ];
  // what was said -> { cmd } or { w, r } (either may be missing) or null
  function parse(text, track) {
    const tk = tokens(text), nums = tk.filter(x => x.num);
    if (!nums.length) { for (const [c, re] of CMD) if (re.test(String(text).toLowerCase())) return { cmd: c }; return null; }
    let w = null, r = null; const free = [];
    tk.forEach((x, i) => {
      if (!x.num) return;
      const nx = tk[i + 1], pv = tk[i - 1];
      if (nx && !nx.num && W_UNIT.test(nx.w)) w = x.v;
      else if (nx && !nx.num && R_UNIT.test(nx.w)) r = x.v;
      else if (pv && !pv.num && R_UNIT.test(pv.w) && pv.w !== 'times') r = x.v;          // "reps 8"
      else free.push(x.v);
    });
    if (track === 'time') { const f = free.slice(), mins = w != null ? w : f.shift(); return mins == null && r == null ? null : { w: mins != null ? mins : null, r: r != null ? r : f.length ? f[0] : null }; }      // minutes, then km or level
    if (track === 'bw') { if (w == null && r == null && free.length >= 2) { w = free[0]; r = free[1]; } else if (r == null && free.length) r = free[0]; return r == null && w == null ? null : { w, r }; }      // reps, and any weight added
    if (w == null && r == null && free.length >= 2) { w = free[0]; r = free[1]; }
    else if (w == null && r != null && free.length) w = free[0];
    else if (w != null && r == null && free.length) r = free[0];
    else if (w == null && r == null && free.length === 1) { if (Number.isInteger(free[0]) && free[0] <= 30) r = free[0]; else w = free[0]; }
    if (r != null && !(r > 0 && r <= 100 && Number.isInteger(r))) r = null;
    if (w != null && !(w >= 0 && w <= 1000)) w = null;
    return w == null && r == null ? null : { w, r };
  }

  // ---------------- doing it ----------------
  let lastTick = null;          // { it, s } the exercise and set voice ticked last, for "undo" (1.32: kept by itself, not by place, as exercises and sets can be moved)
  let want = null;              // what the next answer is for: 'set' or { into: <textarea id> }
  function listen(what) {
    if (!can()) { toast("Voice needs Google's speech service on this phone"); return; }
    want = what;
    const prompt = what === 'set' ? ({ 'hi-IN': 'बोलिए: 60 किलो 8 बार', 'ta-IN': 'சொல்லுங்கள்: 60 கிலோ 8 தடவை' })[lang()] || 'Say: 60 kilo 8 reps' : ({ 'hi-IN': 'आपने क्या खाया?', 'ta-IN': 'என்ன சாப்பிட்டீர்கள்?' })[lang()] || 'What did you eat?';
    if (window.__voice) { Promise.resolve(window.__voice(lang(), prompt)).then(r => window.onVoice(r, r ? 'ok' : 'cancel')); return; }
    N.voiceListen(lang(), prompt);
  }
  window.onVoice = (list, status) => {
    const w = want; want = null;
    const heard = (Array.isArray(list) ? list : []).map(String).filter(Boolean);
    if (!heard.length) { if (status === 'none') toast("Voice isn't available on this phone"); return; }
    if (w && w.into) { const el = document.getElementById(w.into); if (el) { el.value = (el.value.trim() ? el.value.trim() + ', ' : '') + heard[0]; el.dispatchEvent(new Event('input', { bubbles: true })); el.focus(); } return; }
    if (w === 'set') apply(heard);
  };
  function apply(heard) {
    const a = D.active; if (!a) return;
    const q = A.quickState ? A.quickState() : null, it = q && q.target, ex = it && S.getEx(it.ex);
    let got = null, said = heard[0];
    for (const h of heard) { const p = parse(h, ex ? ex.track : 'weight'); if (p) { got = p; said = h; break; } }
    if (!got) { toast(`Heard “${said}” but couldn't log it. Try: 60 kilo 8 reps`); return; }
    if (got.cmd === 'next') { const r = A.quick('next'); toast(r ? 'Next exercise' : 'No exercise left'); return; }
    if (got.cmd === 'pause' || got.cmd === 'resume') { A.quick(got.cmd); toast(got.cmd === 'pause' ? 'Paused' : 'Carrying on'); return; }
    if (got.cmd === 'undo') {
      const l = lastTick, si = l ? a.items.indexOf(l.it) : -1, ri = si >= 0 ? a.items[si].sets.indexOf(l.s) : -1, x = ri >= 0 ? a.items[si].sets[ri] : null;
      if (!x || !x.done) { toast('Nothing to undo'); return; }
      ACT.setDone({ dataset: { si: String(si), ri: String(ri) } }); lastTick = null; toast('Unticked'); return;
    }
    if (!it || !ex) { toast('No exercise to log. Say next, or add one'); return; }
    const si = a.items.indexOf(it); let ri = it.sets.findIndex(x => !x.done);
    if (ri < 0) { toast(`All sets of ${ex.name} are ticked. Say “next”`); return; }
    if (got.w != null && it.sets[ri].kind === 'w') {                 // a working weight said while warm-ups are left: they were skipped
      const wk = it.sets.findIndex(x => !x.done && x.kind !== 'w'), ww = wk >= 0 ? parseFloat(it.sets[wk].w) || 0 : 0;
      if (wk >= 0 && ww > 0 && got.w >= ww * 0.95) ri = wk;
    }
    if (!it.run && ACT.sxStart) ACT.sxStart({ dataset: { i: String(si) } });
    const s = it.sets[ri];
    if (got.w != null) s.w = String(got.w);
    if (got.r != null) s.r = String(got.r);
    ACT.setDone({ dataset: { si: String(si), ri: String(ri) } });
    lastTick = { it, s };
    const u = D.settings.unit || 'kg', wTxt = s.w !== '' && s.w != null ? (ex.track === 'time' ? `${s.w} min` : `${s.w} ${u}`) : '', rTxt = s.r !== '' && s.r != null && ex.track !== 'time' ? `${s.r} reps` : '';
    const which = s.kind === 'w' ? 'warm-up' : `set ${it.sets.filter((x, k) => k <= ri && x.kind !== 'w').length}`;
    toast(`✓ ${ex.name}, ${which}${wTxt || rTxt ? ': ' + [wTxt, rTxt].filter(Boolean).join(' × ') : ''}`);
    try { if (S.isAndroid && window.Android.vibrate) window.Android.vibrate(25); } catch (e) { }
  }
  ACT.voiceSet = () => listen('set');
  ACT.voiceInto = el => listen({ into: el.dataset.into });

  // the 🎤 on the workout screen, and in a text box
  const micButton = () => (on() && can() ? `<button class="btn sm icon micbtn" data-act="voiceSet" aria-label="Log a set by voice">🎤</button>` : '');
  const micFor = id => (can() ? `<button class="btn sm icon micbtn" data-act="voiceInto" data-into="${esc(id)}" aria-label="Say it">🎤</button>` : '');
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => (can() ? `<div class="row" style="padding:6px 0"><div class="grow">Voice logging<div class="xs dim">A 🎤 on the workout screen: say “60 kilo 8 reps” (or “done”, “next”) and the set is logged and ticked</div></div><input type="checkbox" data-bind="optVoice" ${on() ? 'checked' : ''} style="width:22px;height:22px"></div>
    ${on() ? `<div class="row voice-langs" style="padding:0 0 8px;gap:6px;flex-wrap:wrap">${LANGS.map(([k, nm]) => `<button class="chip ${lang() === k ? 'on' : ''}" data-act="voiceLang" data-v="${k}">${nm}</button>`).join('')}</div>` : ''}` : ''));
  ACT.voiceLang = el => { D.settings.voiceLang = el.dataset.v; S.save(); A.rerender(); };
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optVoice') { D.settings.voice = t.checked; S.save(); A.rerender(); } });
  void M;
  window.Voice = { parse, tokens, micButton, micFor, listen, can, lang, LANGS };
})();
