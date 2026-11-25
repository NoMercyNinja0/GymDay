/* GymDay – a photo of a gym machine (v1.20; on its own since 1.21.2, when the Coach was taken out at the owner's request).
   A photo of a machine, bench or rack in the gym says what it is, which exercises in the library are done on it (with the person's
   own setup photos and notes for them), a few others, and how to set it up. Library → 📷 Machine. */
(function () {
  const A = window.App, S = window.Store, D = S.data, M = S.meta;
  const { esc, ACT } = A;
  // 1.21.2: the Coach is gone; its chat was kept only on this phone, so it goes too
  if (M && 'coach' in M) { delete M.coach; S.saveMeta(); }
  // =====================================================================================================
  // A photo of a gym machine
  // =====================================================================================================
  let mc = null;        // { pics, busy, res, err }
  function readMachine(list) {
    const names = S.allExercises().filter(e => !(D.ex[e.id] || {}).hide && e.track !== 'time').map(e => `${e.id}|${e.name}`).slice(0, 250);
    if (window.__machineAi) return Promise.resolve(window.__machineAi(list, names));
    const C = window.Cloud;
    if (!C || !C.configured || !C.machinePhoto) return Promise.reject({ message: 'Reading machine photos needs a GymDay account.' });
    if (!C.signedIn()) return Promise.reject({ message: 'Sign in (Settings → Account) to have machine photos read.' });
    return C.machinePhoto(list.map(x => String(x).replace(/^data:image\/\w+;base64,/, '')), names).catch(e => {
      if (e && e.status === 404) throw { message: "Reading machine photos isn't switched on for this account's server yet." };
      throw { message: (e && e.message) || "The photo couldn't be read. Try again." };
    });
  }
  function machineSheet() {
    const o = mc; if (!o) return;
    const pic = o.pics && o.pics[0] ? `<img class="mc-pic" src="${o.pics[0].thumb || o.pics[0].big}" alt="Your photo">` : '';
    let body;
    if (o.busy) body = `<p class="small"><span class="kc-spin"></span> Looking at the machine…</p><p class="xs dim mt4">The photo is sent to the AI service set up for your account, only to be read.</p>`;
    else if (o.err) body = `<p class="small">${esc(o.err)}</p>`;
    else {
      const m = o.res.machine || {}, exs = (m.ids || []).map(id => S.getEx(id)).filter(Boolean);
      const row = ex => { const xd = D.ex[ex.id] || {}, ph = (xd.photos || []).slice(0, 3).map(p => S.showPhoto(p)).filter(Boolean);
        return `<div class="list-item tap" data-act="mcOpen" data-id="${esc(ex.id)}">${A.thumb(ex)}<div class="grow" style="min-width:0"><div class="small" style="font-weight:600">${esc(ex.name)}</div><div class="xs muted ellipsis">${esc((ex.primary || []).join(', ') || ex.group || '')}</div>
          ${xd.notes ? `<div class="xs mt4"><span class="tag">Your setup</span> ${esc(String(xd.notes).slice(0, 120))}</div>` : ''}${ph.length ? `<div class="mc-ph">${ph.map(src => `<img src="${src}" alt="Your setup photo">`).join('')}</div>` : ''}</div><span class="accent">›</span></div>`; };
      body = `<h3 class="mc-name">${esc(m.name || 'Gym machine')}</h3>
        ${exs.length ? `<div class="sp-sub">In your library</div>${exs.map(row).join('')}` : '<p class="small muted mt8">None of the exercises in your library is done on it.</p>'}
        ${(m.other || []).length ? `<div class="sp-sub">Also done on it</div><p class="small">${esc(m.other.join(' · '))}</p>` : ''}
        ${(m.setup || []).length ? `<div class="sp-sub">Setting it up</div>${m.setup.map(x => `<p class="small mc-tip">• ${esc(x)}</p>`).join('')}` : ''}
        ${o.res.note ? `<p class="xs dim mt8">${esc(o.res.note)}</p>` : ''}`;
    }
    A.openSheet(`<h2>Machine photo</h2>${pic}${body}<div class="row mt16"><button class="btn grow" data-act="closeSheet">Close</button><button class="btn primary grow" data-act="mcShoot" ${o.busy ? 'disabled' : ''}>📷 Another machine</button></div>`, null, () => { if (mc === o && !o.busy) mc = null; });
    mc = o;
  }
  ACT.mcShoot = async () => {
    const F = window.Food; if (!F || !F.pickPhotos) return;
    const pics = await F.pickPhotos({ max: 2, side: 1024, q: 0.82 }); if (!pics || !pics.length) return;
    const o = mc = { pics, busy: true, res: null, err: '' }; machineSheet();
    try { o.res = await readMachine(pics.map(x => x.big)); if (!o.res || !o.res.machine) throw { message: "No gym machine could be made out in that photo. Try a photo of the whole machine." }; }
    catch (e) { o.err = (e && e.message) || "The photo couldn't be read."; }
    o.busy = false; if (mc === o) machineSheet();
  };
  ACT.mcOpen = el => { A.closeSheet(); A.go('exercise', { id: el.dataset.id }); };
  const libBtn = () => `<button class="btn sm" data-act="mcShoot" aria-label="Find exercises from a photo of a machine">📷 Machine</button>`;
  window.Machine = { libBtn, readMachine };
})();
