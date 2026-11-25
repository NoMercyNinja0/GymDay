/* GymDay – account, sync and clubs. Talks to the GymDay Supabase project with plain fetch (no library). */
(function () {
  const S = window.Store, M = S.meta;
  // The server is normally built into the app (config.js). A copy built without one can be pointed at a server by hand.
  const baked = window.GYMDAY_CLOUD && window.GYMDAY_CLOUD.url && window.GYMDAY_CLOUD.key ? window.GYMDAY_CLOUD : null;
  const cfg = baked || M.server || {};
  const base = String(cfg.url || '').replace(/\/+$/, '');
  const configured = /^https?:\/\//.test(base) && !!cfg.key;
  const BUCKET = 'gymday-photos';

  // ---------------- small event bus: 'status' | 'data' | 'auth' | 'photos' ----------------
  const listeners = [];
  const state = { status: 'idle', error: '', lastSync: M.lastSync || 0 };   // idle | syncing | ok | offline | error | signedout
  function fire(ev) { listeners.forEach(fn => { try { fn(ev, state); } catch (e) { console.warn(e); } }); }
  function setStatus(s, err) { state.status = s; state.error = err || ''; fire('status'); }

  // ---------------- http ----------------
  function CloudError(msg, o) { const e = new Error(msg); Object.assign(e, o || {}); return e; }
  function friendly(status, j) {
    const code = j && (j.error_code || j.code || j.error), msg = (j && (j.msg || j.message || j.error_description)) || '';
    if (code === 'P0001' && msg) return msg;                       // our own messages from the server, written for people
    if (code === 'over_email_send_rate_limit' || code === 'over_request_rate_limit' || status === 429) return 'Too many tries just now. Wait a minute, then try again.';
    if (code === 'otp_expired' || /expired or is invalid/i.test(msg)) return 'That code is wrong or has run out. Check it, or send a new one.';
    if (code === 'validation_failed' || code === 'email_address_invalid' || /validate email|invalid format/i.test(msg)) return "That doesn't look like an email address.";
    if (code === 'otp_disabled' || code === 'signup_disabled' || code === 'email_provider_disabled') return 'Signing in by email code is switched off on the server.';
    if (code === 'PGRST202' || code === '42883') return "The GymDay server isn't set up yet (its setup file hasn't been run).";
    if (status >= 500) return 'The server had a problem. Try again in a moment.';
    return msg || ('Something went wrong (' + status + ').');
  }
  async function http(path, opt) {
    opt = opt || {};
    const headers = Object.assign({ apikey: cfg.key }, opt.headers || {});
    if (opt.token) headers.Authorization = 'Bearer ' + opt.token;
    let body = opt.body;
    if (body != null && !(body instanceof Blob)) { headers['Content-Type'] = 'application/json'; body = JSON.stringify(body); }
    const ctl = new AbortController(), timer = setTimeout(() => ctl.abort(), opt.timeout || 25000);
    let res, text = '', blob = null;
    try {
      res = await fetch(base + path, { method: opt.method || 'POST', headers, body, signal: ctl.signal });
      if (opt.blob && res.ok) blob = await res.blob(); else text = await res.text();
    } catch (e) { throw CloudError("Can't reach the server. Check your internet connection.", { offline: true }); }
    finally { clearTimeout(timer); }
    if (blob) return blob;
    let json = null; try { json = text ? JSON.parse(text) : null; } catch (e) { }
    if (!res.ok) throw CloudError(friendly(res.status, json), { status: res.status, code: json && (json.error_code || json.code || json.error), raw: text });
    return json;
  }

  // ---------------- sign-in by emailed code ----------------
  const signedIn = () => configured && !!(M.session && M.session.refresh_token);
  function keep(sess) {
    M.session = { access_token: sess.access_token, refresh_token: sess.refresh_token,
      expires_at: sess.expires_at || Math.floor(Date.now() / 1000) + (sess.expires_in || 3600),
      user: { id: sess.user.id, email: sess.user.email } };
    S.saveMeta();
  }
  function forget() {
    Object.keys((M.pics || {}).u || {}).forEach(k => S.deletePhoto('av_' + k)); Object.keys((M.pics || {}).c || {}).forEach(k => S.deletePhoto('lg_' + k));
    M.session = null; M.rev = null; M.hash = null; M.shared = {}; M.photos = {}; M.profile = null; M.pics = null; M.bestsHash = null; M.newsSeen = null; S.saveMeta();
  }
  async function sendCode(email) { await http('/auth/v1/otp', { body: { email, create_user: true } }); }
  async function verifyCode(email, token) {
    const s = await http('/auth/v1/verify', { body: { type: 'email', email, token } });
    if (!s || !s.access_token || !s.user) throw CloudError('Could not sign in. Send a new code and try again.');
    forget(); keep(s); setStatus('idle'); fire('auth');
    return M.session.user;
  }
  // 1.30: an account that was given a password in Supabase signs in with it. For app store reviewers, who cannot read the
  // emailed code: everyone else signs in by code as before (GymDay never asks anyone to make a password).
  async function signInPassword(email, password) {
    let s;
    try { s = await http('/auth/v1/token?grant_type=password', { body: { email, password } }); }
    catch (e) { if (e.status === 400 || e.status === 401) throw CloudError('That email and password did not work.', { status: e.status }); throw e; }
    if (!s || !s.access_token || !s.user) throw CloudError('Could not sign in. Try again.');
    forget(); keep(s); setStatus('idle'); fire('auth');
    return M.session.user;
  }
  let refreshing = null;
  function refresh() {
    if (!refreshing) refreshing = (async () => {
      try { keep(await http('/auth/v1/token?grant_type=refresh_token', { body: { refresh_token: M.session.refresh_token } })); }
      catch (e) {
        if (!e.offline && e.status >= 400 && e.status < 500 && e.status !== 429) {   // the sign-in itself is no longer good
          M.session = null; M.rev = null; M.hash = null; S.saveMeta(); setStatus('signedout'); fire('auth');
          throw CloudError('You were signed out. Sign in again to keep saving to your account.', { signedOut: true });
        }
        throw e;
      } finally { refreshing = null; }
    })();
    return refreshing;
  }
  async function authed(fn) {
    if (!signedIn()) throw CloudError('Sign in first.', { signedOut: true });
    if (M.session.expires_at - Date.now() / 1000 < 60) await refresh();
    try { return await fn(M.session.access_token); }
    catch (e) {
      if (!e.offline && (e.status === 401 || /jwt/i.test(e.raw || ''))) { await refresh(); return fn(M.session.access_token); }
      throw e;
    }
  }
  const rpc = (fn, args) => authed(t => http('/rest/v1/rpc/' + fn, { body: args || {}, token: t }));
  // training now (v1.7): say that a workout is running (again every few minutes), and ask who in my clubs is training
  const live = (on, day) => rpc('gd_live', { p_on: !!on, p_day: day || '' });
  const liveNow = () => rpc('gd_live_all');
  // ---------------- 1.35.2: a yes before anything is read by AI (Apple's guideline 5.1.2(i)) ----------------
  // Photos, screenshots and the words of a food, a place or a recipe go to GymDay's server, which asks Claude (an AI made by
  // Anthropic) to read them. The first time, GymDay says so and asks. The answer is kept in settings.aiOk; Settings → More
  // features can take it back (then it asks again). The test server (127.0.0.1) needs no answer unless a test wants the question.
  const aiOk = () => !!((S.data.settings || {}).aiOk);
  const aiTest = () => (window.__calm === false || /^https?:\/\/(127\.0\.0\.1|localhost)([:/]|$)/.test(base)) && !window.__aiAskTest;
  let aiWait = null, aiDone = null;
  function aiAsk() {
    if (aiOk() || aiTest()) return Promise.resolve(true);
    if (aiWait) return aiWait;
    aiWait = new Promise(res => {
      const d = document.createElement('div'); d.className = 'ai-ask'; d.id = 'aiAsk';
      d.setAttribute('role', 'dialog'); d.setAttribute('aria-modal', 'true'); d.setAttribute('aria-labelledby', 'aiAskH');
      d.innerHTML = `<div class="panel"><h2 id="aiAskH">Let AI read it?</h2>
        <p class="small mt8">To read a photo, a screenshot, a recipe or the name of a food, GymDay sends it to GymDay's server, which asks <b>Claude, an AI made by Anthropic</b>, what it shows.</p>
        <ul class="small mt8 ai-ask-l"><li>Only what you choose is sent, nothing else about you.</li><li>It is used only to answer you. GymDay's server doesn't keep it.</li><li>Without it, you can still type everything yourself.</li></ul>
        <p class="xs dim mt8">You can change this any time in Settings → More features. <span class="accent" role="button" tabindex="0" data-ai="pp">Privacy policy</span></p>
        <div class="row mt16"><button class="btn grow" data-ai="no">Not now</button><button class="btn primary grow" data-ai="yes">Allow</button></div></div>`;
      aiDone = ok => { d.remove(); aiWait = null; aiDone = null; if (ok) { S.data.settings.aiOk = Date.now(); S.save(); } res(!!ok); };
      d.addEventListener('click', e => {
        e.stopPropagation(); const b = e.target.closest('[data-ai]');
        if (!b) { if (e.target === d && aiDone) aiDone(false); return; }
        if (b.dataset.ai === 'pp') { const A = window.App; if (A && A.ACT && A.ACT.privacyOpen) A.ACT.privacyOpen(); return; }
        if (aiDone) aiDone(b.dataset.ai === 'yes');
      });
      document.body.appendChild(d);
      try { d.querySelector('[data-ai="yes"]').focus(); } catch (e) {}
    });
    return aiWait;
  }
  const aiDismiss = () => { if (!aiDone) return false; aiDone(false); return true; };          // the phone's Back button
  const aiSet = on => { if (on) S.data.settings.aiOk = S.data.settings.aiOk || Date.now(); else delete S.data.settings.aiOk; S.save(); };
  const NO_AI = 'Not sent: reading by AI is off. Type it instead, or turn it on in Settings → More features.';
  const aiCall = f => aiAsk().then(ok => (ok ? authed(f) : Promise.reject(CloudError(NO_AI, { aiNo: true }))));
  // a meal photo (base64 JPEG) read by the AI service set up on the server; answers { items: [{ name, kcal, protein }], note }
  // v1.8.1: `more` is { ask: 3 } (the AI may answer with questions first) or { answers: [{ q, a }] } (the second read)
  // v1.12: img can be a list of up to 4 photos of the same meal or packet, read together
  const imgs = img => (Array.isArray(img) ? (img.length > 1 ? { images: img.slice(0, 4) } : { image: img[0] }) : { image: img });
  const mealPhoto = (img, more) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: Object.assign(imgs(img), more || {}), token: t, timeout: 60000 }));
  // v1.8: the label on a protein or creatine packet: brand, serving size and what one serving holds
  const labelPhoto = (img, more) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: Object.assign(imgs(img), { kind: 'label' }, more || {}), token: t, timeout: 60000 }));
  // v1.12: screenshots from a watch or fitness app after a workout (ctx: the workout in words, so the right one is read)
  // 1.35.2 (60): a watch's screenshots (a workout, a day, a night) go up to 10 at a time. The server takes about 6 MB of pictures in
  // all, so when they come to more, the biggest are made smaller first. A server from before 1.35.2 reads only the first 4 and
  // says nothing about it; this one answers how many it read (`read`), so the person is told when only 4 were read.
  const SHOTS_MAX = 10, SHOTS_ALL = 5600000;
  const smaller = b64 => new Promise(res => {
    const img = new Image();
    img.onload = () => { try { const w = Math.max(1, Math.round(img.naturalWidth * 0.8)), h = Math.max(1, Math.round(img.naturalHeight * 0.8)), c = document.createElement('canvas');
      c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0, w, h); const out = c.toDataURL('image/jpeg', 0.72).replace(/^data:image\/\w+;base64,/, ''); res(out.length < b64.length ? out : b64); } catch (e) { res(b64); } };
    img.onerror = () => res(b64); img.src = 'data:image/jpeg;base64,' + b64;
  });
  async function fitShots(list) {
    let out = (list || []).slice(0, SHOTS_MAX);
    for (let pass = 0; pass < 3; pass++) {
      if (out.reduce((a, x) => a + x.length, 0) <= SHOTS_ALL) break;
      const each = SHOTS_ALL / out.length; out = await Promise.all(out.map(x => (x.length > each ? smaller(x) : x)));
    }
    return out;
  }
  const shots = (kind, list, ctx) => fitShots(list).then(images => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind, images, ctx: ctx || '' }, token: t, timeout: images.length > 4 ? 110000 : 60000 }))
    .then(r => { if (images.length > 4 && r && r.read == null && window.toast) window.toast('Only the first 4 screenshots were read: the server isn’t up to date yet'); return r; }));
  const workoutShots = (list, ctx) => shots('workout', list, ctx);
  // v1.13: screenshots of a whole day's activity summary (steps, the day's calories, heart rate, sleep)
  const dayShots = (list, ctx) => shots('day', list, ctx);
  // v1.13: what was left on the plate: the meal's photos first (before), then the plate after; lines = the meal's foods
  const leftShots = (list, lines, before) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'left', images: list.slice(0, 4), lines: (lines || []).slice(0, 12), before: before || 0 }, token: t, timeout: 60000 }));
  const sleepShots = (list, ctx) => shots('sleep', list, ctx);
  // v1.12: a dish from a restaurant, cafe or shop, looked up on the web by the same server (Google Search through its Gemini key)
  const webLookup = (q, where) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'web', q, where: where || '' }, token: t, timeout: 60000 }));
  // v1.20: a photo of a gym machine, with the library's exercises as "id|name" lines to pick from
  // v1.25: a restaurant's menu and one item with its choices (from the web), a recipe from photos or pasted text, what is in the fridge
  const menuLookup = (place, where) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'menu', place, where: where || '' }, token: t, timeout: 120000 }));
  const orderLookup = (q, place) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'order', q, place: place || '' }, token: t, timeout: 60000 }));
  // v1.28: a recipe from a link too (the server opens the page)
  const recipeRead = o => aiCall(t => http('/functions/v1/gd-meal-photo', { body: Object.assign({ kind: 'recipe' }, o && o.url ? { url: String(o.url).slice(0, 500) } : o && o.text ? { text: String(o.text).slice(0, 6000) } : { images: ((o && o.images) || []).slice(0, 4) }), token: t, timeout: o && o.url ? 90000 : 60000 }));
  // v1.28: an order screenshot (with the restaurant's numbers from the web), a packet's table to compare, a workout program
  const orderShots = list => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'shot', images: list.slice(0, 4) }, token: t, timeout: 120000 }));
  const packRead = list => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'pack', images: list.slice(0, 2) }, token: t, timeout: 60000 }));
  const programRead = o => aiCall(t => http('/functions/v1/gd-meal-photo', { body: Object.assign({ kind: 'program' }, o && o.text ? { text: String(o.text).slice(0, 6000) } : { images: ((o && o.images) || []).slice(0, 4) }), token: t, timeout: 60000 }));
  const fridgeRead = (list, ctx) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'fridge', images: list.slice(0, 4), ctx: ctx || '' }, token: t, timeout: 60000 }));
  const machinePhoto = (list, names) => aiCall(t => http('/functions/v1/gd-meal-photo', { body: { kind: 'machine', images: list.slice(0, 2), list: (names || []).slice(0, 250) }, token: t, timeout: 60000 }));
  async function signOut() {
    const t = M.session && M.session.access_token;
    clearTimeout(timer); clearTimeout(retryT);
    if (t) { try { await http('/auth/v1/logout?scope=local', { token: t, timeout: 6000 }); } catch (e) { } }
    forget(); setStatus('idle'); fire('auth');
  }

  // ---------------- profile ----------------
  async function loadProfile() { const p = await rpc('gd_profile'); M.profile = p || null; S.saveMeta(); return M.profile; }
  async function setProfile(name, share) {
    const before = M.profile && M.profile.share;
    const p = await rpc('gd_set_profile', { p_name: name == null ? null : name, p_share: share == null ? null : share });
    M.profile = p;
    if (!before || (share && share !== before)) M.shared = {};      // what club mates see changed: send it again in the new form
    S.saveMeta(); fire('auth');
    extras();
    return p;
  }

  // ---------------- sync ----------------
  let busy = false, queued = false, queuedPull = false, timer = null, retryT = null, backoff = 0, lastPull = 0;
  function touch() { if (!signedIn()) return; clearTimeout(timer); timer = setTimeout(() => sync(false), 2500); }
  // r = { rev, data } from the account. No awaits in here, so nothing typed meanwhile can be lost.
  function mergeIn(r) {
    const local = S.syncDoc(), merged = S.mergeDocs(local, r.data), sm = S.stable(merged);
    let changed = false;
    if (sm !== S.stable(local)) { S.applyDoc(merged); changed = true; }
    M.rev = r.rev;
    M.hash = sm === S.stable(r.data) ? S.hash(sm) : null;
    return changed;
  }
  async function sync(pull) {
    if (!signedIn()) return false;
    if (busy) { queued = true; queuedPull = queuedPull || !!pull; return false; }
    busy = true; clearTimeout(timer); clearTimeout(retryT); setStatus('syncing');
    let applied = false, ok = false;
    try {
      if (pull || M.rev == null) {
        const rev = await rpc('gd_rev');
        lastPull = Date.now();
        if (rev > 0 && rev !== M.rev) { const r = await rpc('gd_load'); if (r && r.data) applied = mergeIn(r) || applied; }
        else if (!rev) M.rev = 0;
      }
      for (let i = 0; i < 6; i++) {
        const doc = S.syncDoc(), h = S.hash(S.stable(doc));
        if (h === M.hash && M.rev) break;
        const res = await rpc('gd_save', { p_data: doc, p_base: M.rev || 0 });
        if (res && res.ok) { M.rev = res.rev; M.hash = h; break; }
        applied = mergeIn(res) || applied;                       // another device saved first: combine, then try again
      }
      M.lastSync = state.lastSync = Date.now();
      M.owner = { id: M.session.user.id, email: M.session.user.email };
      S.saveMeta(); backoff = 0; ok = true;
      setStatus('ok');
    } catch (e) {
      if (e.signedOut) setStatus('signedout', e.message);
      else {
        setStatus(e.offline ? 'offline' : 'error', e.message);
        backoff = Math.min(backoff ? backoff * 2 : 15000, 300000);
        retryT = setTimeout(() => sync(true), backoff);
      }
    } finally {
      busy = false;
      if (applied) fire('data');
      if (queued && signedIn()) { const p = queuedPull; queued = false; queuedPull = false; setTimeout(() => sync(p), 30); }
      else { queued = false; queuedPull = false; }
    }
    if (ok) extras();
    return ok;
  }

  // ---------------- after a sync: setup photos, and what club mates see ----------------
  let extraBusy = false, extraAgain = false;
  async function extras() {
    if (!signedIn()) return;
    if (extraBusy) { extraAgain = true; return; }
    extraBusy = true;
    try { await syncPhotos(); await shareWorkouts(); await shareBests(); }
    catch (e) { if (!e.offline) console.warn('after-sync step failed: ' + e.message); }
    finally { extraBusy = false; if (extraAgain) { extraAgain = false; setTimeout(extras, 50); } }
  }
  function dataUrlToBlob(d) {
    const i = d.indexOf(','), bin = atob(i >= 0 ? d.slice(i + 1) : d), u8 = new Uint8Array(bin.length);
    for (let k = 0; k < bin.length; k++) u8[k] = bin.charCodeAt(k);
    return new Blob([u8], { type: 'image/jpeg' });
  }
  const blobToDataUrl = b => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(String(r.result).replace(/^data:[^;,]*/, 'data:image/jpeg')); r.onerror = rej; r.readAsDataURL(b); });
  const missing = {};   // photos the account does not have (asked once per visit)
  let holdFull = false; // set while full photos are being brought back to stay (sign-out, account deletion)
  const photoPath = p => `/storage/v1/object/${BUCKET}/${M.session.user.id}/${encodeURIComponent(p)}.jpg`;
  const photoRefs = () => { const r = new Set(), D = S.data; for (const id in D.ex) for (const p of (D.ex[id].photos || [])) r.add(p); return r; };
  const download = async p => blobToDataUrl(await authed(t => http(photoPath(p), { method: 'GET', token: t, blob: true, timeout: 60000 })));
  function makeThumb(dataUrl) {
    return new Promise((res, rej) => {
      const img = new Image();
      img.onload = () => {
        const sc = Math.min(1, 240 / Math.max(img.naturalWidth, img.naturalHeight, 1)), c = document.createElement('canvas');
        c.width = Math.max(1, Math.round(img.naturalWidth * sc)); c.height = Math.max(1, Math.round(img.naturalHeight * sc));
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        res(c.toDataURL('image/jpeg', 0.7));
      };
      img.onerror = () => rej(new Error('bad image'));
      img.src = dataUrl;
    });
  }
  // The full photo for looking at (from the phone if it is still here, otherwise from the account, kept for this visit only).
  async function fullPhoto(p) {
    const local = S.loadPhoto(p); if (local) return local;
    const d = await download(p); S.memPhoto(p, d); return d;
  }
  // Bring every full photo back: stored on the phone (before signing out or deleting the account) or just held (for a backup file).
  async function fetchAllPhotos(store) {
    if (store) holdFull = true;
    for (const p of photoRefs()) {
      if (S.loadPhoto(p)) continue;
      let d; try { d = await download(p); } catch (e) { if (e.offline || e.signedOut) throw e; continue; }
      if (store) { if (!S.savePhoto(p, d)) S.memPhoto(p, d); } else S.memPhoto(p, d);
    }
  }
  // Signed in, full setup photos live in the account and only a small preview stays on the phone.
  async function syncPhotos() {
    const uid = M.session.user.id;
    if (!M.photos) M.photos = {};
    const refs = photoRefs();
    let got = 0;
    for (const p of refs) {
      if (!signedIn() || M.session.user.id !== uid) return;
      const local = S.loadPhoto(p);
      if (local) {
        if (!S.loadPhoto('t_' + p)) { try { S.savePhoto('t_' + p, await makeThumb(local)); } catch (e) { } }
        if (!M.photos[p]) {
          await authed(t => http(photoPath(p), { body: dataUrlToBlob(local), token: t, headers: { 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, timeout: 60000 }));
          M.photos[p] = 1; S.saveMeta();
        }
        if (!holdFull && S.loadPhoto('t_' + p)) S.dropFull(p);   // safely in the account: the phone keeps only the preview
      } else if (!S.loadPhoto('t_' + p) && !missing[p]) {
        try { const d = await download(p); S.savePhoto('t_' + p, await makeThumb(d)); M.photos[p] = 1; S.saveMeta(); got++; }
        catch (e) { if (e.offline || e.signedOut) throw e; missing[p] = 1; }
      } else if (!M.photos[p] && !missing[p]) { M.photos[p] = 1; S.saveMeta(); }
    }
    const dead = Object.keys(M.photos).filter(p => !refs.has(p));
    if (dead.length) {
      await authed(t => http(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: { prefixes: dead.map(p => uid + '/' + p + '.jpg') }, token: t }));
      dead.forEach(p => { delete M.photos[p]; S.deletePhoto(p); }); S.saveMeta();
    }
    if (got) fire('photos');
  }
  // Club boards compare people who may use different units, so what is sent is always in kg.
  const perKg = () => (S.data.settings.unit === 'lb' ? 0.45359237 : 1);
  const n0 = v => { const n = parseFloat(v); return isNaN(n) ? 0 : n; };
  function shareItem(s, full) {
    let exN = 0, setN = 0, vol = 0; const items = [];
    for (const it of (s.items || [])) {
      if (it.skipped) continue;
      const done = (it.sets || []).filter(x => x.done); if (!done.length) continue;
      exN++; setN += done.length;
      const ex = S.getEx(it.ex);
      if (ex && ex.track !== 'time') done.forEach(x => { vol += n0(x.w) * n0(x.r); });
      // v1.28: the exercise's id and the sets and reps too, so a club mate can do the same workout ("Do this workout")
      if (full && ex) { const rs = done.map(x => n0(x.r)).filter(r => r > 0).sort((p, q) => p - q); items.push({ name: ex.name, text: api.describe ? String(api.describe(done, ex)) : done.length + ' sets', ex: ex.id, n: done.length, r: rs.length ? rs[rs.length >> 1] : 0 }); }
    }
    if (!setN || !s.start) return null;
    return { id: String(s.id), started_at: new Date(s.start).toISOString(), gym_ms: Math.max(0, Math.round(S.gymMs(s))),
      day_name: String(s.dayName || 'Workout').slice(0, 60), ex_count: exN, set_count: setN, detail: full ? { items: items.slice(0, 40) } : null,
      volume: Math.round(vol * perKg() * 10) / 10, prs: (s.prs || []).length };
  }
  // Best lift per exercise, for the club records board. Only people who share "everything" send any.
  async function shareBests() {
    const prof = M.profile; if (!prof || api.old) return;
    let items = [];
    if (prof.share === 'all') {
      const best = {};
      for (const s of S.data.sessions) {
        if (s.keep === false) continue;
        for (const it of (s.items || [])) {
          if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex || ex.track === 'time') continue;
          for (const x of (it.sets || [])) {
            const w = n0(x.w), r = n0(x.r); if (!x.done || w <= 0) continue;
            const b = best[ex.id];
            if (!b || w > b.w || (w === b.w && r > b.reps)) best[ex.id] = { ex: ex.id, name: String(ex.name).slice(0, 60), w, reps: r, at: new Date(s.start).toISOString() };
          }
        }
      }
      items = Object.keys(best).sort().map(k => Object.assign(best[k], { w: Math.round(best[k].w * perKg() * 100) / 100 })).slice(0, 400);
    }
    const h = prof.share + '|' + S.hash(S.stable(items));
    if (M.bestsHash === h) return;
    try { await rpc('gd_share_bests', { p_items: items }); }
    catch (e) { if (e.code !== 'PGRST202') throw e; }               // a server that has not had the v1.5 setup yet
    M.bestsHash = h; S.saveMeta();
  }
  async function shareWorkouts() {
    const prof = M.profile; if (!prof) return;
    if (!M.shared) M.shared = {};
    if (prof.share === 'none') { if (Object.keys(M.shared).length) { M.shared = {}; S.saveMeta(); } return; }
    const items = S.data.sessions.map(s => shareItem(s, prof.share === 'all')).filter(Boolean);
    const ids = new Set(items.map(i => i.id));
    const todo = items.map(it => [it, S.hash(S.stable(it))]).filter(x => M.shared[x[0].id] !== x[1]);
    for (let i = 0; i < todo.length; i += 100) {
      const part = todo.slice(i, i + 100);
      await rpc('gd_share_workouts', { p_items: part.map(x => x[0]) });
      part.forEach(x => { M.shared[x[0].id] = x[1]; }); S.saveMeta();
    }
    const gone = Object.keys(M.shared).filter(id => !ids.has(id));
    if (gone.length) { await rpc('gd_unshare', { p_ids: gone }); gone.forEach(id => delete M.shared[id]); S.saveMeta(); }
  }

  // ---------------- clubs ----------------
  const clubs = {
    list: () => rpc('gd_my_clubs'),
    // p_now is new in v1.5; a server still on the older setup does not know it, so fall back and remember (api.old)
    get: async (id, week, now) => {
      if (!api.old) {
        try { return await rpc('gd_club', { p_club: id, p_week: week, p_now: now || week }); }
        catch (e) { if (e.code !== 'PGRST202') throw e; api.old = true; }
      }
      return rpc('gd_club', { p_club: id, p_week: week });
    },
    create: name => rpc('gd_create_club', { p_name: name }),
    join: code => rpc('gd_join_club', { p_code: code }),
    leave: id => rpc('gd_leave_club', { p_club: id }),
    remove: id => rpc('gd_delete_club', { p_club: id }),
    rename: (id, name) => rpc('gd_rename_club', { p_club: id, p_name: name }),
    removeMember: (id, user) => rpc('gd_remove_member', { p_club: id, p_user: user }),
    setChallenge: (id, c) => rpc('gd_set_challenge', { p_club: id, p_title: c ? c.title : null, p_metric: c ? c.metric : null, p_target: c ? c.target : null, p_start: c ? c.start : null, p_end: c ? c.end : null }),
    cheer: (owner, workout, on) => rpc('gd_cheer', { p_owner: owner, p_workout: workout, p_on: !!on }),
    react: (owner, workout, kind) => rpc('gd_react', { p_owner: owner, p_workout: workout, p_kind: kind || null }),
    comments: (owner, workout) => rpc('gd_comments', { p_owner: owner, p_workout: workout }),
    comment: (owner, workout, body) => rpc('gd_comment', { p_owner: owner, p_workout: workout, p_body: body }),
    deleteComment: id => rpc('gd_delete_comment', { p_id: id }),
    setInfo: (id, descr, logo, setLogo) => rpc('gd_set_club_info', { p_club: id, p_descr: descr || '', p_logo: logo || null, p_set_logo: !!setLogo }),
    shareDay: (id, name, items) => rpc('gd_share_day', { p_club: id, p_name: name, p_items: items }),
    unshareDay: dayId => rpc('gd_unshare_day', { p_id: dayId }),
    postPlan: (id, at, note) => rpc('gd_post_plan', { p_club: id, p_at: at, p_note: note || '' }),
    joinPlan: (plan, on) => rpc('gd_join_plan', { p_plan: plan, p_on: !!on }),
    deletePlan: plan => rpc('gd_delete_plan', { p_plan: plan }),
    member: (user, week) => rpc('gd_member', { p_user: user, p_week: week }),
    chat: (id, before) => rpc('gd_chat', { p_club: id, p_before: before || null }),
    chatSend: (id, body) => rpc('gd_chat_send', { p_club: id, p_body: body }),
    chatDelete: msgId => rpc('gd_chat_delete', { p_id: msgId }),
    news: since => rpc('gd_news', { p_since: since || null }),
    pics: (users, clubIds) => rpc('gd_pics', { p_users: users || [], p_clubs: clubIds || [] }),
    // 1.30 (server v1.8): report and block, which the app stores ask for; the person who looks after GymDay deals with reports
    report: (kind, club, user, item, reason, note, body) => rpc('gd_report', { p_kind: kind, p_club: club || null, p_user: user || null, p_item: item || null, p_reason: reason, p_note: note || '', p_body: body || '' }),
    block: (user, on) => rpc('gd_block', { p_user: user, p_on: !!on }),
    blocks: () => rpc('gd_blocks'),
    reports: () => rpc('gd_reports_open'),
    reportDone: (id, action) => rpc('gd_report_done', { p_id: id, p_action: action || 'none' }),
  };
  async function setAvatar(dataUrl) { const p = await rpc('gd_set_avatar', { p_avatar: dataUrl || null }); M.profile = p; S.saveMeta(); fire('auth'); return p; }
  // The newest version friends should have (anyone may ask, signed in or not). null when the server does not say.
  async function latest() {
    try { return await http('/rest/v1/rpc/gd_latest', { body: {}, token: signedIn() ? M.session.access_token : null, timeout: 12000 }); }
    catch (e) { return null; }
  }
  const setLatest = (code, name, url, notes) => rpc('gd_set_latest', { p_code: code, p_name: name, p_url: url, p_notes: notes || '' });
  const inviteLink = code => base + '/rest/v1/rpc/gd_go?c=' + encodeURIComponent(code) + '&apikey=' + encodeURIComponent(cfg.key);

  async function deleteAccount() {
    const uid = M.session.user.id, names = Object.keys(M.photos || {}).map(p => uid + '/' + p + '.jpg');
    clearTimeout(timer); clearTimeout(retryT);
    await fetchAllPhotos(true);                                  // the phone keeps its workouts, so give it its photos back first
    if (names.length) { try { await authed(t => http(`/storage/v1/object/${BUCKET}`, { method: 'DELETE', body: { prefixes: names }, token: t })); } catch (e) { if (e.offline) throw e; } }
    await rpc('gd_delete_account');
    forget(); M.owner = null; S.saveMeta(); setStatus('idle'); fire('auth');
  }

  // ---------------- keeping up to date ----------------
  function wake() { if (signedIn() && !document.hidden && Date.now() - lastPull > 20000) sync(true); }
  function start() {
    if (!configured) return;
    document.addEventListener('visibilitychange', wake);
    window.addEventListener('online', () => { if (signedIn()) sync(true); });
    const resume0 = window.appResume; window.appResume = () => { if (resume0) resume0(); wake(); };
    setInterval(() => { if (signedIn() && !document.hidden && Date.now() - lastPull > 170000) sync(true); }, 60000);
    if (signedIn()) { sync(true); if (!M.profile) loadProfile().then(() => { fire('auth'); extras(); }).catch(() => { }); }
  }

  const api = window.Cloud = {
    configured, manual: configured && !baked, host: base.replace(/^https?:\/\//, ''), signedIn, state, on: fn => listeners.push(fn),
    user: () => (M.session ? M.session.user : null), profile: () => M.profile || null,
    sendCode, verifyCode, signInPassword, signOut, loadProfile, setProfile, setAvatar, deleteAccount, latest, setLatest, inviteLink,
    sync, touch, clubs, start, fullPhoto, fetchAllPhotos, mealPhoto, labelPhoto, workoutShots, dayShots, sleepShots, fitShots, menuLookup, orderLookup, recipeRead, fridgeRead, orderShots, packRead, programRead, leftShots, webLookup, machinePhoto, live, liveNow, aiOk, aiAsk, aiDismiss, aiSet, describe: null, old: false
  };
})();
