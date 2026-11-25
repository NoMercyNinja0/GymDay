/* GymDay – the body figure. 1.35: an anatomy drawing, front and back, male or female, with 43 muscle parts: the heads of
   the biceps and triceps, the four quads, inner and outer hamstrings, upper, mid and lower traps, the rhomboids, the calves'
   two heads and the soleus, the shins, the neck … Each part has fibre lines and a soft shading; the shapes are drawn once by
   tools/body_build.py into bodydata.js (window.BODYDATA). Only the left half is drawn; the right half is its mirror image.

   BodyFig.svg(level, back, opt)   level(areaId) -> 0 (not used) … 3 (most)
                                   opt.tip(areaId) -> words shown when the area is tapped (default: its name)
                                   opt.act         -> data-act put on every area (makes them buttons)
                                   opt.sel         -> area id drawn as picked
                                   opt.cls(areaId) -> extra classes for an area (the soreness sheet marks what a workout hit)
                                   opt.sex         -> 'm' or 'f' (default: Settings → Body figure, else About me)
   BodyFig.areasOf(name)           the areas a muscle name from the library lights up
   BodyFig.levels(ex)              { areaId: 3 | 2 | 1 } for an exercise: its own parts (exparts.js), else from its muscle names
   BodyFig.AREAS / .PARTS / .name(id) / .group(id) / .GROUPS / .inGroup(g) / .sex() */
(function () {
  const DATA = window.BODYDATA;
  // ---- names and body parts: [id, name, body part] in the order lists show them ----
  const META = [
    ['upperChest', 'Upper chest', 'Chest'], ['midChest', 'Mid chest', 'Chest'], ['lowerChest', 'Lower chest', 'Chest'], ['serratus', 'Serratus', 'Chest'],
    ['frontDelt', 'Front delts', 'Shoulders'], ['sideDelt', 'Side delts', 'Shoulders'], ['rearDelt', 'Rear delts', 'Shoulders'], ['rotatorCuff', 'Rotator cuff', 'Shoulders'],
    ['bicepsLong', 'Biceps (long head)', 'Biceps'], ['bicepsShort', 'Biceps (short head)', 'Biceps'], ['brachialis', 'Brachialis', 'Biceps'],
    ['tricepsLong', 'Triceps (long head)', 'Triceps'], ['tricepsLat', 'Triceps (lateral head)', 'Triceps'], ['tricepsMed', 'Triceps (medial head)', 'Triceps'],
    ['brachiorad', 'Forearm (brachioradialis)', 'Forearms'], ['foreFlex', 'Forearm flexors', 'Forearms'], ['foreExt', 'Forearm extensors', 'Forearms'],
    ['upperTraps', 'Upper traps', 'Back'], ['midTraps', 'Mid traps', 'Back'], ['lowerTraps', 'Lower traps', 'Back'], ['rhomboids', 'Rhomboids', 'Back'],
    ['teres', 'Teres major', 'Back'], ['latsUpper', 'Lats', 'Back'], ['latsLower', 'Lower lats', 'Back'], ['lowerBack', 'Lower back (erector spinae)', 'Back'], ['neck', 'Neck', 'Back'],
    ['absUpper', 'Upper abs', 'Core'], ['absLower', 'Lower abs', 'Core'], ['obliques', 'Obliques', 'Core'], ['hipFlexors', 'Hip flexors', 'Core'],
    ['rectusFem', 'Quads (rectus femoris)', 'Quads'], ['vastusLat', 'Quads (outer, vastus lateralis)', 'Quads'], ['vastusMed', 'Quads (inner, vastus medialis)', 'Quads'], ['adductors', 'Adductors (inner thigh)', 'Quads'],
    ['hamsOuter', 'Hamstrings (outer, biceps femoris)', 'Hamstrings'], ['hamsInner', 'Hamstrings (inner)', 'Hamstrings'],
    ['gluteMain', 'Glutes (gluteus maximus)', 'Glutes'], ['gluteSide', 'Side glutes (gluteus medius)', 'Glutes'], ['abductors', 'Outer hip (abductors)', 'Glutes'],
    ['gastroMed', 'Calves (inner gastrocnemius)', 'Calves'], ['gastroLat', 'Calves (outer gastrocnemius)', 'Calves'], ['soleus', 'Calves (soleus)', 'Calves'], ['tibialis', 'Shins (tibialis)', 'Calves'],
  ];
  const inView = (v, id) => DATA.m[v].parts.some(p => p[0] === id);
  const AREAS = META.map(([id, name, group]) => ({ id, name, group, view: (inView('f', id) ? 'f' : '') + (inView('b', id) ? 'b' : '') }));
  const BY = {}; AREAS.forEach(a => { BY[a.id] = a; });
  const GROUPS = ['Chest', 'Back', 'Shoulders', 'Biceps', 'Triceps', 'Forearms', 'Core', 'Quads', 'Hamstrings', 'Glutes', 'Calves'];
  const inGroup = g => AREAS.filter(a => a.group === g).map(a => a.id);
  const PARTS = AREAS.map(a => a.id);

  // ---- which areas a muscle name from the library (or someone's own exercise) lights up ----
  const delts = ['frontDelt', 'sideDelt', 'rearDelt'], chest = ['upperChest', 'midChest', 'lowerChest'], quads = ['rectusFem', 'vastusLat', 'vastusMed'];
  const hams = ['hamsOuter', 'hamsInner'], calves = ['gastroMed', 'gastroLat', 'soleus'], tri = ['tricepsLong', 'tricepsLat', 'tricepsMed'], abs = ['absUpper', 'absLower'];
  const NAMES = {
    'front delts': ['frontDelt'], 'side delts': ['sideDelt'], 'rear delts': ['rearDelt'], 'shoulders': delts, 'delts': delts, 'rotator cuff': ['rotatorCuff'],
    'upper chest': ['upperChest'], 'mid chest': ['midChest'], 'lower chest': ['lowerChest'], 'chest': chest, 'pecs': chest, 'serratus': ['serratus'],
    'biceps': ['bicepsLong', 'bicepsShort'], 'biceps (long head)': ['bicepsLong'], 'biceps (short head)': ['bicepsShort'], 'brachialis': ['brachialis'],
    'forearms': ['foreFlex', 'brachiorad', 'foreExt'], 'forearms (brachioradialis)': ['brachiorad'], 'brachioradialis': ['brachiorad'], 'forearm flexors': ['foreFlex'], 'forearm extensors': ['foreExt'], 'grip': ['foreFlex'],
    'triceps': tri, 'triceps (long head)': ['tricepsLong'], 'triceps (lateral head)': ['tricepsLat'], 'triceps (outer head)': ['tricepsLat'], 'triceps (medial head)': ['tricepsMed'],
    'abs': abs, 'abs (lower)': ['absLower'], 'lower abs': ['absLower'], 'upper abs': ['absUpper'], 'obliques': ['obliques'], 'core': ['absUpper', 'absLower', 'obliques'], 'hip flexors': ['hipFlexors'],
    'lats': ['latsUpper', 'latsLower'], 'lats (lower)': ['latsLower'], 'lower lats': ['latsLower'], 'upper back': ['rhomboids', 'midTraps', 'teres'], 'mid back': ['rhomboids', 'midTraps', 'lowerTraps'], 'lower back': ['lowerBack'],
    'mid traps': ['midTraps'], 'upper traps': ['upperTraps'], 'lower traps': ['lowerTraps'], 'traps': ['upperTraps', 'midTraps', 'lowerTraps'], 'teres major': ['teres'], 'rhomboids': ['rhomboids'], 'neck': ['neck'],
    'back': ['latsUpper', 'latsLower', 'rhomboids', 'midTraps', 'lowerTraps'],
    'glutes': ['gluteMain', 'gluteSide'], 'glutes (side)': ['gluteSide'], 'side glutes': ['gluteSide'], 'abductors': ['abductors', 'gluteSide'],
    'quads': quads, 'adductors': ['adductors'], 'adductors (inner thigh)': ['adductors'], 'hamstrings': hams,
    'calves': calves, 'calves (gastrocnemius)': ['gastroMed', 'gastroLat'], 'calves (soleus)': ['soleus'], 'shins': ['tibialis'], 'tibialis': ['tibialis'],
    'legs': quads.concat(hams, ['gluteMain'], calves), 'arms': ['bicepsLong', 'bicepsShort'].concat(tri),
  };
  // a name the list above does not know (someone's own exercise): go by the body part its words point at
  const GUESS = [[/forearm|brachiorad|grip|wrist/i, 'Forearms'], [/chest|pec/i, 'Chest'], [/delt|shoulder|rotator/i, 'Shoulders'], [/tricep/i, 'Triceps'], [/bicep|brachialis/i, 'Biceps'],
    [/\blats?\b|trap|rhomboid|back|erector|teres|neck/i, 'Back'], [/quad|thigh/i, 'Quads'], [/hamstring/i, 'Hamstrings'], [/glute|hip/i, 'Glutes'], [/calf|calves|soleus|shin/i, 'Calves'], [/\babs?\b|core|oblique/i, 'Core']];
  function areasOf(name) {
    const k = String(name || '').trim().toLowerCase(); if (!k) return [];
    if (NAMES[k]) return NAMES[k];
    for (const [re, g] of GUESS) if (re.test(k)) return inGroup(g);
    return [];
  }
  // An exercise's parts and how hard it works each: the library's own table (exparts.js), else its muscle names (the ones
  // it is for at 3, the ones that help at 2), else its whole body part.
  function levels(ex) {
    if (!ex) return {};
    if (ex.parts) return ex.parts;
    const out = {};
    (ex.secondary || []).forEach(m => areasOf(m).forEach(a => { out[a] = 2; }));
    (ex.primary || []).forEach(m => areasOf(m).forEach(a => { out[a] = 3; }));
    if (!Object.values(out).includes(3) && GROUPS.includes(ex.group)) inGroup(ex.group).forEach(a => { out[a] = 3; });
    return out;
  }

  // Settings → Body figure; when it was never set, About me (Food tab) decides
  function sex() {
    try { const st = (window.Store && window.Store.data && window.Store.data.settings) || {}; const f = st.figure || (st.me && st.me.sex === 'f' ? 'f' : 'm'); return f === 'f' ? 'f' : 'm'; }
    catch (e) { return 'm'; }
  }

  // the shading every part shares lives once in the page, in a hidden drawing of its own
  function defs() {
    if (document.getElementById('bf-defs')) return;
    const holder = document.createElement('div');
    holder.innerHTML = `<svg id="bf-defs" width="0" height="0" style="position:absolute;width:0;height:0;overflow:hidden" aria-hidden="true"><defs>
      <radialGradient id="bf-shade" cx=".38" cy=".3" r=".78"><stop offset="0" stop-color="#fff" stop-opacity=".2"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".24"/></radialGradient></defs></svg>`;
    (document.body || document.documentElement).appendChild(holder.firstChild);
  }
  const escA = s => String(s).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  const MIRROR = 'transform="translate(200,0) scale(-1,1)"';

  function svg(level, back, opt) {
    defs(); opt = opt || {};
    const sx = opt.sex === 'f' || opt.sex === 'm' ? opt.sex : sex(), V = DATA[sx][back ? 'b' : 'f'];
    const parts = V.parts.map(([id, , d, fb]) => {
      if (!BY[id]) return '';
      const l = Math.max(0, Math.min(3, level(id) | 0)), tip = opt.tip ? opt.tip(id) : BY[id].name, more = opt.cls ? opt.cls(id) : '';
      return `<g class="bm bm${l}${opt.sel === id ? ' sel' : ''}${more ? ' ' + more : ''}" data-part="${id}" data-tip="${escA(tip)}"${opt.act ? ` data-act="${opt.act}"` : ''}><title>${escA(BY[id].name)}</title>`
        + `<path class="bmf" d="${d}"/>${fb ? `<path class="bmx" d="${fb}"/>` : ''}<path class="bms" d="${d}"/></g>`;
    }).join('');
    const hair = V.hair ? `<path class="bf-hair" d="${V.hair}"/>` : '', extra = V.extra ? `<path class="bf-x" d="${V.extra}"/>` : '';
    return `<svg viewBox="22 6 156 424" class="bodyfig anat" data-sex="${sx}" role="img" aria-label="${back ? 'Back' : 'Front'} of the body">
      <g class="bf-base"><path d="${V.sil}"/><g ${MIRROR}><path d="${V.sil}"/></g>${extra}<g ${MIRROR}>${extra}</g></g>${hair ? `<g>${hair}<g ${MIRROR}>${hair}</g></g>` : ''}
      <g>${parts}</g><g ${MIRROR}>${parts}</g>
      <g class="bf-lines"><path d="${V.lines}"/><g ${MIRROR}><path d="${V.lines}"/></g></g></svg>`;
  }

  // Tapping an area names it under the figure (in the nearest .bodies box, which holds a .bf-tip line), with a link to the
  // exercises that work it hardest (1.35). A figure whose parts are buttons of their own (opt.act) handles the tap itself.
  document.addEventListener('click', e => {
    const p = e.target && e.target.closest ? e.target.closest('.bodyfig [data-part]') : null; if (!p || p.dataset.act) return;
    const wrap = p.closest('.bodies'); if (!wrap) return;
    wrap.querySelectorAll('.bm.sel').forEach(x => x.classList.remove('sel'));
    wrap.querySelectorAll(`[data-part="${p.dataset.part}"]`).forEach(x => x.classList.add('sel'));
    const tip = wrap.parentNode.querySelector('.bf-tip'); if (!tip) return;
    tip.textContent = p.dataset.tip || ''; tip.classList.add('on');
    if (wrap.dataset.find !== 'no' && window.App && window.App.ACT && window.App.ACT.bodyFind) {
      const b = document.createElement('button'); b.className = 'bf-find'; b.dataset.act = 'bodyFind'; b.dataset.part = p.dataset.part; b.textContent = 'Best exercises ›';
      tip.appendChild(document.createTextNode(' ')); tip.appendChild(b);
    }
  });

  window.BodyFig = { svg, areasOf, levels, sex, AREAS, PARTS, GROUPS, META, name: id => (BY[id] ? BY[id].name : ''), group: id => (BY[id] ? BY[id].group : ''), inGroup };
})();
