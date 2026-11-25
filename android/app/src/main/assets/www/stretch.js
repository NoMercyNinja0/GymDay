/* GymDay v1.20 – cool-down stretches after a workout.
   A few minutes of static stretches for the body parts the workout trained, the most trained first: up to 8 stretches,
   30 seconds each (each side for one-sided ones), one at a time with a countdown, a buzz at each change, and Pause, Back and Skip.
   Holding a static stretch 10 to 30 seconds to the point of mild tightness, not pain, is the American College of Sports Medicine's
   guidance for flexibility (ACSM's Guidelines for Exercise Testing and Prescription); stretching after training is for comfort and
   range of motion, it does not prevent soreness. Photos: the public-domain free-exercise-db project, as for the library. */
(function () {
  const A = window.App, S = window.Store, D = S.data;
  const { $, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  const HOLD = 30;
  // id, name, body parts it is for (the first is its main one), sides, how to do it
  const LIST = [
    ['elbows-back', 'Elbows back', ['Chest', 'Shoulders'], 1, 'Stand tall with both hands on your lower back, fingers pointing down. Gently draw your elbows back towards each other until you feel it across your chest. Breathe slowly.'],
    ['lat-wall', 'Lat stretch at the wall', ['Back'], 2, 'Stand side-on to a wall or a rack upright and rest your bent arm on it above your head. Lean into it until the side of your back stretches.'],
    ['childs-pose', "Child's pose", ['Back', 'Core'], 1, 'Kneel, walk your hands forward on the floor and sit back towards your heels. Let your chest sink and breathe into your back. Skip it if your knees hurt.'],
    ['upper-back', 'Upper back stretch', ['Back', 'Shoulders'], 1, 'Clasp your fingers in front of you, thumbs down. Round your shoulders and push your hands forward until you feel it between your shoulder blades.'],
    ['cross-body', 'Cross-body shoulder stretch', ['Shoulders'], 2, 'Bring one straight arm across your chest and hold it there with your other forearm. Keep the shoulder down, away from your ear.'],
    ['biceps', 'Biceps stretch', ['Biceps', 'Chest'], 1, 'Clasp your hands behind your back, straighten your arms and turn your palms down. Lift your arms slowly until the front of your arms stretches.'],
    ['triceps', 'Overhead triceps stretch', ['Triceps'], 2, 'Reach one hand down behind your head. Take that elbow with your other hand and gently pull it towards your head.'],
    ['forearm', 'Forearm stretch', ['Forearms'], 1, 'Kneel with your palms flat on the floor, fingers pointing back towards your knees. Lean back slowly until your wrists and forearms stretch.'],
    ['quad-side', 'Lying quad stretch', ['Quads'], 2, 'Lie on your side, hold your top foot behind you and draw the heel towards your glutes. Push that hip forward a little.'],
    ['hip-flexor', 'Kneeling hip flexor stretch', ['Quads', 'Glutes'], 2, 'Kneel on one knee with the other foot forward. Tuck your hips under and shift your weight forward until the front of the back hip stretches.'],
    ['ham-floor', 'Seated hamstring stretch', ['Hamstrings', 'Calves'], 2, 'Sit with one leg straight and the other foot against its inner thigh. Lean forward from your hips towards the ankle, keeping your back long.'],
    ['ham-lying', 'Lying hamstring stretch', ['Hamstrings'], 2, 'Lie on your back and raise one straight leg. Loop a band or a towel over the foot and pull gently; keep the other leg on the floor.'],
    ['figure4', 'Figure-4 glute stretch', ['Glutes'], 2, 'Lie on your back with your knees bent. Cross one ankle over the other knee, then pull both legs towards your chest.'],
    ['knee-across', 'Lying twist', ['Glutes', 'Core'], 2, 'Lie on your back and bring one bent knee across your body towards the floor, the other arm out to the side. Look away from the knee.'],
    ['calf-wall', 'Calf stretch at the wall', ['Calves'], 2, 'Hands on a wall, one foot back with its heel down and the knee straight. Lean in until the calf stretches.'],
    ['soleus', 'Bent-knee calf stretch', ['Calves'], 2, 'One foot a little ahead of the other. Bend both knees, keeping the back heel on the floor, until the lower calf stretches.'],
    ['side-bend', 'Standing side bend', ['Core'], 2, 'Feet wide, one hand on your hip, the other arm over your head. Bend to the side without leaning forward or back.'],
    ['cat', 'Cat stretch', ['Core', 'Back'], 1, 'On your hands and knees, pull your belly in and round your whole back, letting your head drop.']
  ].map(([id, name, parts, sides, how]) => ({ id, name, parts, sides, how, img: `img/st-${id}.jpg` }));
  const BY = {}; LIST.forEach(x => { BY[x.id] = x; });
  const FOR = { Chest: ['elbows-back', 'biceps'], Back: ['lat-wall', 'childs-pose', 'upper-back'], Shoulders: ['cross-body', 'elbows-back'], Biceps: ['biceps'], Triceps: ['triceps'],
    Forearms: ['forearm'], Core: ['side-bend', 'cat'], Quads: ['quad-side', 'hip-flexor'], Hamstrings: ['ham-floor', 'ham-lying'], Glutes: ['figure4', 'knee-across'], Calves: ['calf-wall', 'soleus'] };
  const LEGS = ['ham-floor', 'quad-side', 'hip-flexor', 'calf-wall'], ALL = ['childs-pose', 'cross-body', 'ham-floor', 'hip-flexor', 'figure4', 'calf-wall'];

  // The stretches for a workout: its body parts by the sets ticked (half for a part an exercise only helps), the most first;
  // one stretch each, a second for a part with 6 sets or more, up to 8 in all. Cardio only: the legs. Nothing ticked yet: the whole body.
  function pickFor(s) {
    const I = window.Insights, sets = s && I && I.sessionSets ? I.sessionSets(s) : {};
    const order = Object.keys(FOR).filter(g => (sets[g] || 0) > 0).sort((a, b) => sets[b] - sets[a]), out = [];
    const add = id => { if (!out.includes(id) && out.length < 8) out.push(id); };
    for (const g of order) add(FOR[g].find(id => !out.includes(id)) || FOR[g][0]);
    for (const g of order) if (sets[g] >= 6) { const id = FOR[g].find(x => !out.includes(x)); if (id) add(id); }
    if (!out.length) (s && (s.items || []).some(it => (S.getEx(it.ex) || {}).group === 'Cardio') ? LEGS : ALL).forEach(add);
    return out;
  }
  const secsOf = ids => ids.reduce((t, id) => t + HOLD * BY[id].sides, 0);
  const minsText = ids => { const m = Math.max(1, Math.round(secsOf(ids) / 60)); return `about ${m} min`; };

  // the running cool-down: { ids, i (stretch), side (0 / 1), left (seconds), run, done, from }
  let cd = null, tick = null;
  const sideText = (x, side) => (x.sides > 1 ? (side ? 'Right side' : 'Left side') : '');
  const buzz = ms => { try { if (S.isAndroid && window.Android && window.Android.vibrate) window.Android.vibrate(ms); } catch (e) { } };
  function step() {
    if (!cd || !cd.run) return;
    if (A.top().name !== 'cooldown') { cd.run = false; stopTick(); return; }          // left the screen some other way
    cd.left--;
    if (cd.left <= 0) { next(true); return; }
    const t = $('#cdLeft'); if (t) t.textContent = cd.left; const r = $('#cdRing'); if (r) r.style.setProperty('--p', String(cd.left / HOLD));
  }
  function next(auto) {
    const x = BY[cd.ids[cd.i]];
    if (x && x.sides > 1 && cd.side === 0) { cd.side = 1; cd.left = HOLD; buzz(120); A.rerender(); return; }
    cd.i++; cd.side = 0; cd.left = HOLD;
    if (cd.i >= cd.ids.length) { cd.done = true; cd.run = false; stopTick(); buzz(300); }
    else buzz(auto ? 200 : 40);
    A.rerender();
  }
  const stopTick = () => { clearInterval(tick); tick = null; };
  function startTick() { stopTick(); tick = setInterval(step, 1000); }

  VIEWS.cooldown = {
    html() {
      if (!cd) return `<div class="empty"><p>No cool-down open.</p></div>`;
      const n = cd.ids.length, x = BY[cd.ids[Math.min(cd.i, n - 1)]];
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Cool-down</h1><div class="sub">${n} stretches · ${minsText(cd.ids)} · 30 s each${cd.ids.some(id => BY[id].sides > 1) ? ' (each side)' : ''}</div></div></div>`;
      if (cd.done) {
        h += `<div class="card cd-done"><div class="cd-big">✓</div><h2>Cool-down done</h2><p class="small muted">${n} stretches for the parts you trained. Drink some water, and eat some protein in the next few hours.</p>
          <button class="btn primary block mt12" data-act="back">Done</button><button class="btn block mt8" data-act="coolAgain">Do it again</button></div>`;
      } else {
        h += `<div class="card cd-now"><div class="cd-img"><img src="${x.img}" alt=""></div>
          <div class="row mt12" style="align-items:flex-start;gap:12px"><div class="grow" style="min-width:0"><div class="xs muted">${cd.i + 1} of ${n}${sideText(x, cd.side) ? ' · <b class="accent">' + sideText(x, cd.side) + '</b>' : ''}</div><h2 class="cd-name">${esc(x.name)}</h2></div>
            <div class="cd-ring" id="cdRing" style="--p:${cd.left / HOLD}" role="timer" aria-label="Seconds left"><span id="cdLeft">${cd.left}</span><small>sec</small></div></div>
          <p class="small mt8">${esc(x.how)}</p><p class="xs dim mt4">Ease into it until it feels tight, never painful, and breathe slowly.</p>
          <div class="row mt12" style="gap:8px"><button class="btn" data-act="coolPrev" ${cd.i === 0 && cd.side === 0 ? 'disabled' : ''} aria-label="The stretch before">‹ Back</button>
            <button class="btn primary grow" data-act="coolRun">${cd.run ? 'Pause' : cd.left < HOLD || cd.i || cd.side ? 'Carry on' : '▶ Start'}</button><button class="btn" data-act="coolSkip">Skip ›</button></div></div>`;
      }
      h += `<div class="card"><h3 class="mb8">Your stretches</h3>${cd.ids.map((id, k) => { const y = BY[id], st = cd.done || k < cd.i ? 'done' : k === cd.i ? 'now' : '';
        return `<div class="list-item cd-row ${st}" data-act="coolGo" data-k="${k}"><img class="thumb" src="${y.img}" alt="" loading="lazy"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${st === 'done' ? '✓ ' : ''}${esc(y.name)}</div><div class="xs muted">${esc(y.parts.join(', '))} · ${y.sides > 1 ? '30 s each side' : '30 s'}</div></div></div>`; }).join('')}
        <p class="xs dim mt8">Holding each stretch about 30 seconds, tight but not painful, follows the American College of Sports Medicine's advice. It helps you loosen up after training; it doesn't stop soreness.</p></div>`;
      return h;
    },
    mount() { if (cd && cd.run && !tick) startTick(); if (S.isAndroid && window.Android && window.Android.keepAwake) window.Android.keepAwake(!!(cd && cd.run) || !!D.active); },
    leave() { stopTick(); if (cd) cd.run = false; if (S.isAndroid && window.Android && window.Android.keepAwake && !D.active) window.Android.keepAwake(false); }
  };
  function open(s) {
    cd = { ids: pickFor(s), i: 0, side: 0, left: HOLD, run: false, done: false };
    A.closeSheet(); A.go('cooldown');
  }
  ACT.coolOpen = el => { const id = el && el.dataset && el.dataset.id; open(id ? D.sessions.find(x => x.id === id) : D.active); };
  ACT.coolRun = () => { if (!cd || cd.done) return; cd.run = !cd.run; if (cd.run) { startTick(); buzz(30); } else stopTick(); A.rerender(); };
  ACT.coolSkip = () => { if (cd && !cd.done) { cd.left = HOLD; next(false); } };
  ACT.coolPrev = () => { if (!cd || cd.done) return; if (cd.side === 1) cd.side = 0; else if (cd.i > 0) { cd.i--; cd.side = 0; } cd.left = HOLD; A.rerender(); };
  ACT.coolGo = el => { if (!cd) return; const k = +el.dataset.k; if (!(k >= 0 && k < cd.ids.length)) return; cd.i = k; cd.side = 0; cd.left = HOLD; cd.done = false; A.rerender(); window.scrollTo(0, 0); };
  ACT.coolAgain = () => { if (!cd) return; Object.assign(cd, { i: 0, side: 0, left: HOLD, run: false, done: false }); A.rerender(); };

  // the buttons that open it: in a running workout once something is ticked, and on the "Workout saved" sheet
  const sessionButton = () => (D.active && D.active.items.some(it => it.sets.some(x => x.done)) ? `<button class="btn block mt12 cd-open" data-act="coolOpen">🧘 Cool-down stretches · ${minsText(pickFor(D.active))}</button>` : '');
  const sheetButton = s => (s && s.items.some(it => it.sets.some(x => x.done)) ? `<button class="btn block mt12 cd-open" data-act="coolOpen" data-id="${esc(s.id)}">🧘 Cool down: ${pickFor(s).length} stretches, ${minsText(pickFor(s))}</button>` : '');
  // 1.35: stretches for body parts that are sore (the soreness tracker): one for each part, the sorest first, a second when
  // there is room, up to 8; it does not make soreness go away faster, it helps you move more easily
  function openFor(groups) {
    const out = [], add = id => { if (BY[id] && !out.includes(id) && out.length < 8) out.push(id); };
    const gs = (groups || []).filter(g => FOR[g]);
    gs.forEach(g => add(FOR[g].find(id => !out.includes(id)) || FOR[g][0]));
    gs.forEach(g => { const id = FOR[g].find(x => !out.includes(x)); if (id) add(id); });
    if (!out.length) ALL.forEach(add);
    cd = { ids: out, i: 0, side: 0, left: HOLD, run: false, done: false };
    A.closeSheet(); A.go('cooldown');
  }
  window.Stretch = { LIST, BY, FOR, pickFor, open, openFor, sessionButton, sheetButton, HOLD, state: () => cd };
})();
