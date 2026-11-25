/* GymDay – account screens (sign in by emailed code, name, what to share) and clubs. */
(function () {
  const A = window.App, C = window.Cloud, S = window.Store, M = S.meta, D = S.data;
  const { $, $$, esc, VIEWS, ACT } = A;
  const toast = m => window.toast(m);
  C.describe = (sets, ex) => A.setsSummary(sets, ex);

  // Redraw the current screen after something arrived from the account, but never under someone's fingers:
  // wait while a text box has the keyboard or a panel is open.
  let pendingRender = false;
  function soft() {
    const a = document.activeElement, typing = !!a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName);
    if (typing || !$('#sheet').classList.contains('hidden') || document.body.classList.contains('kc-dragging')) { pendingRender = true; return; }      // 1.21: not under a food being dragged either
    pendingRender = false; A.rerender();
  }
  setInterval(() => { if (pendingRender) soft(); }, 1200);

  const initial = n => esc((String(n || '?').trim()[0] || '?').toUpperCase());
  const COLORS = ['#B45309', '#0F7C8C', '#7048C8', '#B3261E', '#2F7D32', '#1D5FBF', '#A21C6B'];
  const colorOf = n => { let h = 7; for (const ch of String(n || '')) h = (h * 31 + ch.charCodeAt(0)) % 9973; return COLORS[h % COLORS.length]; };
  const av = (n, cls) => `<span class="av ${cls || ''}" style="background:${colorOf(n)}">${initial(n)}</span>`;
  const plural = (n, w) => `${n} ${w}${n === 1 ? '' : 's'}`;
  function showErr(msg) { const e = $('#authErr'); if (e) { e.textContent = msg; e.classList.remove('hidden'); } else toast(msg); }
  function setBusy(id, on, label) {
    const b = $('#' + id); if (!b) return;
    if (on) { b.dataset.label = b.textContent; b.textContent = label; b.disabled = true; }
    else { if (b.dataset.label) b.textContent = b.dataset.label; b.disabled = false; }
  }
  const brand = `<div class="brand">Gym<span>Day</span></div>`;

  // =====================================================================================================
  // First launch: where to keep the workouts
  // =====================================================================================================
  let wPick = 'cloud';
  const auth = { email: '', from: 'days', first: false, sentAt: 0, busy: false };
  VIEWS.welcome = {
    noNav: true,
    html() {
      const opt = (v, title, text) => `<div class="opt ${wPick === v ? 'on' : ''}" data-act="wOpt" data-v="${v}"><div class="rd"></div><div class="grow"><div class="title">${title}</div><div class="small muted mt4">${text}</div></div></div>`;
      return `<div class="auth">${brand}<h1>Where should your workouts be kept?</h1>
        ${opt('cloud', 'In my account', 'Sign in with your email. Your workouts come back on a new phone, work on two devices, and you can train with friends in clubs.')}
        ${opt('phone', 'On this phone only', 'No account. Nothing leaves this phone.')}
        <button class="btn primary block mt16" data-act="wGo">Continue</button>
        <p class="xs dim mt12">You can change this any time in Settings. <span class="accent" role="button" data-act="privacyOpen">Privacy policy</span></p></div>`;
    }
  };
  ACT.wOpt = el => { wPick = el.dataset.v; A.rerender(); };
  ACT.wGo = () => {
    if (wPick === 'phone') { M.welcomed = true; S.saveMeta(); A.reset('days'); toast('Saving on this phone only'); return; }
    auth.first = true; auth.from = 'days'; A.go('signin');
  };

  // =====================================================================================================
  // Sign in: email -> code -> name   (the same steps as Run maxx)
  // =====================================================================================================
  VIEWS.signin = {
    noNav: true,
    html() {
      return `<div class="auth">${A.depth() > 1 ? `<button class="back" data-act="back" aria-label="Back">‹</button>` : ''}${brand}<h1>Sign in</h1>
        <p class="muted mt8">Enter your email and we’ll send you a sign-in code.</p>
        <div class="field mt16"><label class="lbl" for="authEmail">Email</label><input class="input" id="authEmail" type="email" inputmode="email" autocomplete="email" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="you@example.com" enterkeyhint="send" value="${esc(auth.email)}"></div>
        <div class="auth-err hidden" id="authErr"></div>
        <button class="btn primary block" id="authBtn" data-act="authSend">Email me a code</button>
        ${auth.first ? `<button class="btn ghost block mt8" data-act="authSkip">Use this phone only instead</button>` : ''}
        <div class="auth-foot"><span>🔒</span><span>No password to remember: a new code comes each time you sign in.</span></div>
        <p class="xs dim mt12" style="text-align:center"><span class="accent" role="button" data-act="authPwOpen">Sign in with a password</span> · only for an account that was given one</p>
        <p class="xs dim mt12 auth-legal" style="text-align:center"><span class="accent" role="button" data-act="privacyOpen">Privacy policy</span> · <span class="accent" role="button" data-act="ugcRules">Club rules</span></p></div>`;
    },
    mount() { const i = $('#authEmail'); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.authSend(); }); }
  };
  ACT.authSkip = () => { M.welcomed = true; S.saveMeta(); A.reset('days'); toast('Saving on this phone only'); };
  ACT.authSend = async () => {
    const inp = $('#authEmail'), email = (inp ? inp.value : auth.email).trim().toLowerCase();
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) { showErr("That doesn't look like an email address."); return; }
    if (auth.busy) return; auth.busy = true; setBusy('authBtn', true, 'Sending…');
    try { await C.sendCode(email); auth.email = email; auth.sentAt = Date.now(); A.go('code'); }
    catch (e) { showErr(e.message); }
    finally { auth.busy = false; setBusy('authBtn', false); }
  };
  const resendLeft = () => Math.max(0, 60 - Math.floor((Date.now() - auth.sentAt) / 1000));
  VIEWS.code = {
    noNav: true,
    html() {
      const left = resendLeft();
      return `<div class="auth">${brand}<h1>Sign in</h1>
        <p class="muted mt8">We emailed a code to <b>${esc(auth.email)}</b>.</p>
        <div class="field mt16"><label class="lbl" for="authCode">Code</label><input class="input code" id="authCode" type="text" inputmode="numeric" autocomplete="one-time-code" placeholder="123456" maxlength="10" enterkeyhint="done"></div>
        <div class="auth-err hidden" id="authErr"></div>
        <button class="btn primary block" id="authBtn" data-act="authVerify">Sign in</button>
        <button class="btn ghost block mt8" data-act="authOther">Use a different email</button>
        <button class="btn ghost block" id="authResend" data-act="authResend" ${left ? 'disabled' : ''}>${left ? `Send a new code (in ${left}s)` : 'Send a new code'}</button>
        <div class="auth-foot"><span>✉</span><span>Didn’t get it? Check your spam folder, or send a new code.</span></div></div>`;
    },
    mount() {
      const i = $('#authCode');
      if (i) {
        i.addEventListener('input', () => { const v = i.value.replace(/\D/g, ''); if (v !== i.value) i.value = v; });
        i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.authVerify(); });
      }
      A.later(() => { const b = $('#authResend'); if (!b || b.dataset.label) return; const left = resendLeft(); b.disabled = !!left; b.textContent = left ? `Send a new code (in ${left}s)` : 'Send a new code'; }, 1000, true);
    }
  };
  ACT.authOther = () => { A.back(); };
  ACT.authResend = async () => {
    if (auth.busy || resendLeft()) return; auth.busy = true; setBusy('authResend', true, 'Sending…');
    try { await C.sendCode(auth.email); auth.sentAt = Date.now(); toast('New code sent'); }
    catch (e) { showErr(e.message); }
    finally { auth.busy = false; setBusy('authResend', false); }
  };
  ACT.authVerify = async () => {
    const code = (($('#authCode') || {}).value || '').replace(/\D/g, '');
    if (code.length < 6) { showErr('Type the code from the email (6 digits).'); return; }
    if (auth.busy) return; auth.busy = true; setBusy('authBtn', true, 'Signing in…');
    try { await C.verifyCode(auth.email, code); await afterSignIn(); }
    catch (e) { showErr(e.message); setBusy('authBtn', false); }
    finally { auth.busy = false; }
  };
  // 1.30: a password, only for an account given one (the app stores' reviewers cannot read the emailed code)
  ACT.authPwOpen = () => {
    const em = (($('#authEmail') || {}).value || auth.email || '').trim();
    A.openSheet(`<h2>Sign in with a password</h2><p class="small muted">Only for an account that was given a password. Everyone else signs in with the emailed code.</p>
      <div class="field mt12"><label class="lbl" for="pwEmail">Email</label><input class="input" id="pwEmail" type="email" inputmode="email" autocomplete="username" autocapitalize="off" autocorrect="off" spellcheck="false" value="${esc(em)}"></div>
      <div class="field"><label class="lbl" for="pwPass">Password</label><input class="input" id="pwPass" type="password" autocomplete="current-password"></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="pwBtn" data-act="authPwGo">Sign in</button></div>`);
  };
  ACT.authPwGo = async () => {
    const email = (($('#pwEmail') || {}).value || '').trim(), pw = ($('#pwPass') || {}).value || '';
    if (!/^\S+@\S+\.\S+$/.test(email) || !pw) { showErr('Type the email and its password.'); return; }
    if (auth.busy) return; auth.busy = true; setBusy('pwBtn', true, 'Signing in…');
    try { auth.email = email; await C.signInPassword(email, pw); A.closeSheet(); await afterSignIn(); }
    catch (e) { showErr(e.message); setBusy('pwBtn', false); }
    finally { auth.busy = false; }
  };
  let otherChoice = null;
  function askOtherAccount(email) {
    return new Promise(res => {
      let done = false;
      otherChoice = v => { if (done) return; done = true; res(v); A.closeSheet(); };
      A.openSheet(`<h2>This phone has workouts from another account</h2><p class="muted">They were saved from <b>${esc(email || 'a different account')}</b>. What should happen to them?</p>
        <button class="btn primary block mt16" data-act="otherPick" data-v="clean">Start clean with this account</button>
        <button class="btn block mt8" data-act="otherPick" data-v="add">Add them to this account</button>
        <button class="btn ghost block mt8" data-act="otherPick" data-v="cancel">Cancel sign-in</button>`, null, () => { if (!done) { done = true; res('cancel'); } });
    });
  }
  ACT.otherPick = el => { if (otherChoice) otherChoice(el.dataset.v); };
  async function afterSignIn() {
    let prof = null;
    try { prof = await C.loadProfile(); } catch (e) { if (e.signedOut) throw e; }   // offline right now: the name is asked for later
    const u = C.user(), own = M.owner;
    if (own && own.id !== u.id && S.hasData()) {
      const pick = await askOtherAccount(own.email);
      if (pick === 'cancel') { await C.signOut(); A.reset(auth.from || 'days'); toast('Sign-in cancelled'); return; }
      if (pick === 'clean') S.wipeLocal();
    }
    M.welcomed = true; M.owner = { id: u.id, email: u.email }; S.saveMeta();
    clubList = null; clubData = {};
    C.sync(true);
    if (!prof) A.reset(auth.from || 'days', 'name');
    else { A.reset(auth.from || 'days'); toast('Signed in as ' + prof.name); }
  }
  VIEWS.name = {
    noNav: true,
    html() {
      return `<div class="auth">${brand}<h1>What should we call you?</h1>
        <p class="muted mt8">This is the name your club mates see. You can change it later in Settings.</p>
        <div class="field mt16"><label class="lbl" for="authName">Your name</label><input class="input" id="authName" maxlength="40" autocomplete="given-name" autocapitalize="words" placeholder="e.g. Max" enterkeyhint="done"></div>
        <div class="auth-err hidden" id="authErr"></div>
        <button class="btn primary block" id="authBtn" data-act="authName">Continue</button></div>`;
    },
    mount() { const i = $('#authName'); if (i) i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.authName(); }); }
  };
  ACT.authName = async () => {
    const name = (($('#authName') || {}).value || '').trim();
    if (!name) { showErr('Type a name first.'); return; }
    if (auth.busy) return; auth.busy = true; setBusy('authBtn', true, 'Saving…');
    try { await C.setProfile(name, null); A.reset(auth.from || 'days'); toast('Welcome, ' + name); }
    catch (e) { showErr(e.message); setBusy('authBtn', false); }
    finally { auth.busy = false; }
  };

  // =====================================================================================================
  // Settings: the Account card
  // =====================================================================================================
  function ago(ts) {
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if (s < 60) return 'just now';
    if (s < 3600) return `${Math.floor(s / 60)} min ago`;
    if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
    return A.fmtDate(ts);
  }
  function syncLine() {
    const st = C.state;
    if (st.status === 'syncing') return `<span class="muted">Saving to your account…</span>`;
    if (st.status === 'offline') return `<span class="accent">Offline.</span> <span class="muted">Your changes are safe on this phone and go to your account when you're back online.</span>`;
    if (st.status === 'error') return `<span class="red">Couldn't save to your account:</span> <span class="muted">${esc(st.error)}</span>`;
    if (st.status === 'signedout') return `<span class="red">Signed out.</span> <span class="muted">Sign in again to keep saving to your account.</span>`;
    if (st.lastSync) return `<span class="green">✓ Saved to your account</span> <span class="muted">· ${ago(st.lastSync)}</span>`;
    return `<span class="muted">Not saved to your account yet</span>`;
  }
  const SHARE = [['summary', 'A summary'], ['all', 'Everything'], ['none', 'Nothing']];
  const SHARE_HINT = { summary: 'They see the day name, your gym time, how many exercises and sets, the total weight you lifted and how many records you set — not the weight on each exercise.', all: 'They also see each exercise with its weights and reps, and your best lifts count on the club records board.', none: "They see none of your workouts, and you don't count on club boards or challenges." };
  // v1.26: the top card of Settings. Signed in: your picture, name and e-mail with the saving line, and a tap opens the
  // Account page (accountPage below), where the name, the picture, what club mates see, Sync now, Sign out and Delete my
  // account now live. Not signed in: where things are saved, and the way in.
  const kit = () => window.SetKit || { ic: () => '', tile: () => '<span class="set-ic"></span>', seg: () => '', val: () => '' };
  function settingsCard() {
    const K = kit();
    if (!C.configured) return `<div class="card set-hero" id="acctCard"><div class="set-hero-in">${K.tile('cloudoff')}<div class="hero-main"><div class="set-name">On this phone</div><p class="xs muted mt4">Saving to: <b>this phone only</b>. Accounts and clubs need the GymDay server, which this copy of the app isn't connected to yet.</p></div></div>
      <button class="btn block mt12" data-act="srvOpen">Connect the GymDay server</button></div>`;
    if (!C.signedIn()) {
      return `<div class="card set-hero" id="acctCard"><div class="set-hero-in">${K.tile('cloudoff')}<div class="hero-main"><div class="set-name">Not signed in</div><p class="xs muted mt4">Saving to: <b>this phone only</b>.</p></div></div>
        <button class="btn primary block mt12" data-act="acctSignIn">Sign in to save to your account</button>
        <p class="xs dim mt8">An account brings your workouts back on a new phone, keeps two devices in step, and lets you join clubs.</p>
        <button class="btn ghost block mt8" data-act="root" data-nav="clubs">👥 Clubs: train with friends</button>
        ${C.manual ? `<button class="btn ghost block mt8" data-act="srvOpen">Server: ${esc(C.host)} · change</button>` : ''}</div>`;          // 1.33 (14): Clubs is here while its tab is hidden
    }
    const u = C.user(), p = C.profile();
    return `<div class="card set-hero tap" id="acctCard" data-act="${p ? 'setGo' : 'acctName'}" data-p="account" role="button" aria-label="Account"><div class="set-hero-in">${face(u.id, p ? p.name : u.email, p ? p.avatar_at : 0, 'xl')}
      <div class="hero-main"><div class="set-name ellipsis">${p ? esc(p.name) : '<span class="accent">Choose your name</span>'}</div><div class="xs muted ellipsis">${esc(u.email)}</div>
      <div class="sync-ln" id="syncLine">${syncLine()}</div></div><span class="chev">›</span></div></div>`;
  }
  function accountPage() {
    if (!C.configured || !C.signedIn()) return settingsCard();
    const K = kit(), u = C.user(), p = C.profile();
    return `<div class="card set-hero" id="acctCard"><div class="set-hero-in col">${face(u.id, p ? p.name : u.email, p ? p.avatar_at : 0, 'xl')}
        <div class="set-name">${p ? esc(p.name) : '<span class="accent">Choose your name</span>'}</div><div class="xs muted">${esc(u.email)}</div></div></div>
      <div class="card set-card"><h3>Profile</h3>
        <div class="row tap" data-act="acctName">${K.tile('pencil')}<div class="grow">Name<div class="xs dim">What your club mates see</div></div>${K.val(p ? p.name : 'Choose')}<span class="chev">›</span></div>
        ${p && !C.old ? `<div class="row tap" data-act="acctPic">${K.tile('camera')}<div class="grow">${+p.avatar_at ? 'Change my profile picture' : 'Add a profile picture'}</div><span class="chev">›</span></div>` : ''}
        <div class="row">${K.tile('eye')}<div class="grow">What club mates see of my workouts<div class="xs dim" id="shareHint">${p ? SHARE_HINT[p.share] || '' : 'Choose your name first.'}</div></div>${K.seg('share', p ? p.share : '', SHARE.map(o => [o[0], o[1].replace(/^A s/, 'S')]), 'What club mates see of my workouts', { wide: true, off: !p })}</div>
      </div>
      <div class="card set-card"><h3>Saving</h3>
        <div class="row">${K.tile('cloud')}<div class="grow">Saving to your account<div class="xs dim">With a copy on this phone.</div><div class="xs sync-ln" id="syncLine">${syncLine()}</div></div><button class="btn sm" data-act="acctSync">Sync now</button></div>
      </div>
      ${window.Safety ? window.Safety.accountRows(K) : ''}
      <div class="card set-card">
        <div class="row tap" data-act="acctSignOut">${K.tile('logout')}<div class="grow">Sign out</div><span class="chev">›</span></div>
        <div class="row tap danger" data-act="acctDelete">${K.tile('trash', 'red')}<div class="grow">Delete my account<div class="xs dim">Removes your account and what is saved in it. The workouts on this phone stay.</div></div><span class="chev">›</span></div>
      </div>`;
  }
  // Only for a copy of the app built without a server inside it: point it at one by hand.
  ACT.srvOpen = () => {
    const cur = M.server || {};
    A.openSheet(`<h2>Connect the GymDay server</h2><p class="muted mb12">From your GymDay project in Supabase: the Project URL and the <b>publishable</b> key (never the secret key).</p>
      <div class="field"><label class="lbl">Project URL</label><input class="input" id="srvUrl" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://xxxx.supabase.co" value="${esc(cur.url || '')}"></div>
      <div class="field"><label class="lbl">Publishable key</label><input class="input" id="srvKey" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="sb_publishable_…" value="${esc(cur.key || '')}"></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row"><button class="btn grow" data-act="${cur.url ? 'srvClear' : 'closeSheet'}">${cur.url ? 'Disconnect' : 'Cancel'}</button><button class="btn primary grow" id="srvBtn" data-act="srvSave">Connect</button></div>`);
  };
  ACT.srvSave = async () => {
    let url = ($('#srvUrl').value || '').trim().replace(/\/+$/, ''); const key = ($('#srvKey').value || '').trim();
    if (url && !/^https?:\/\//i.test(url)) url = 'https://' + url;
    if (!/^https?:\/\/[^\s/]+\.[^\s/]+$/i.test(url)) { showErr('That Project URL does not look right. It looks like https://xxxx.supabase.co'); return; }
    let role = ''; try { role = JSON.parse(atob(key.split('.')[1].replace(/-/g, '+').replace(/_/g, '/'))).role || ''; } catch (e) { }
    if (/^sb_secret_/.test(key) || role === 'service_role') { showErr('That is the secret key. Use the publishable key instead; the secret one must never go into an app.'); return; }
    if (key.length < 20) { showErr('Paste the publishable key (it starts with sb_publishable_).'); return; }
    setBusy('srvBtn', true, 'Checking…');
    try {
      const r = await fetch(url + '/auth/v1/settings', { headers: { apikey: key } });
      if (!r.ok) { setBusy('srvBtn', false); showErr(r.status === 401 || r.status === 403 ? "The server didn't accept that key. Check you copied the whole publishable key." : 'That server answered with an error (' + r.status + ').'); return; }
    } catch (e) { setBusy('srvBtn', false); showErr("Can't reach that server. Check the URL and your internet connection."); return; }
    if (C.signedIn()) await C.signOut();
    M.server = { url, key }; S.saveMeta(); S.save(true); location.reload();
  };
  ACT.srvClear = async () => { if (C.signedIn()) await C.signOut(); delete M.server; S.saveMeta(); S.save(true); location.reload(); };
  // 1.35.2: before the camera or the file picker opens for something only GymDay's server can read: an account first
  // (said before the photo is taken, with a Sign in button), then the one-time question about AI reading (cloud.js).
  C.aiReady = what => {
    if (!C.configured) { toast("Reading by AI isn't set up in this copy of GymDay. Type it instead."); return Promise.resolve(false); }
    if (!C.signedIn()) {
      A.openSheet(`<h2>This needs an account</h2><p class="small mt8">${esc(what || 'Photos and screenshots')} are read on GymDay's server, so this works once you're signed in. It's free, and your workouts are kept in your account too.</p><p class="small muted mt8">For now, you can type it yourself.</p>
        <button class="btn primary block mt16" data-act="aiSignIn">Sign in</button><button class="btn block mt8" data-act="closeSheet">Not now</button>`);
      return Promise.resolve(false);
    }
    return C.aiAsk();
  };
  ACT.aiSignIn = () => { A.closeSheet(); const r = (A.rootName && A.rootName()) || 'days'; auth.first = false; auth.from = ['days', 'calories', 'library', 'clubs', 'history', 'settings'].includes(r) ? r : 'days'; A.go('signin'); };
  ACT.acctSignIn = () => { auth.first = false; auth.from = A.top().name === 'clubs' ? 'clubs' : 'settings'; A.go('signin'); };
  ACT.acctName = () => {
    const p = C.profile();
    A.openSheet(`<h2>Your name</h2><p class="muted mb12">This is what your club mates see.</p><input class="input" id="acctNameIn" maxlength="40" value="${esc(p ? p.name : '')}" placeholder="e.g. Max" enterkeyhint="done">
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="acctNameBtn" data-act="acctNameSave">Save</button></div>`,
      () => { const i = $('#acctNameIn'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.acctNameSave(); }); });
  };
  ACT.acctNameSave = async () => {
    const name = (($('#acctNameIn') || {}).value || '').trim(); if (!name) { toast('Type a name first'); return; }
    setBusy('acctNameBtn', true, 'Saving…');
    try { await C.setProfile(name, null); A.closeSheet(); A.rerender(); toast('Name saved'); }
    catch (e) { setBusy('acctNameBtn', false); (A.failToast ? A.failToast(e, () => ACT.acctNameSave()) : toast(e.message)); }
  };
  ACT.acctSync = async () => {
    if (C.state.status === 'syncing') return;
    const ok = await C.sync(true);
    toast(ok ? 'Saved to your account' : (C.state.status === 'offline' ? "Can't reach the server right now" : "Couldn't save to your account"));
  };
  ACT.acctSignOut = () => {
    A.openSheet(`<h2>Sign out?</h2><p class="muted">GymDay stops saving to your account from this phone. Your account and your clubs stay as they are.</p>
      ${D.active ? `<p class="small accent mt8">Removing workouts from this phone also discards the workout in progress.</p>` : ''}
      <button class="btn primary block mt16" data-act="signOutKeep">Sign out, keep my workouts on this phone</button>
      <button class="btn danger block mt8" data-act="signOutWipe">Sign out and remove them from this phone</button>
      <button class="btn ghost block mt8" data-act="closeSheet">Cancel</button>`);
  };
  async function settle() { for (let i = 0; i < 40 && C.state.status === 'syncing'; i++) await new Promise(r => setTimeout(r, 250)); return C.sync(true); }
  ACT.signOutKeep = async () => {
    A.closeSheet(); toast('Signing out…');
    await settle();                                   // one last save if we can; the workouts stay here either way
    try { await C.fetchAllPhotos(true); } catch (e) { toast("Couldn't fetch your full-size setup photos; the small copies stay"); }
    await C.signOut(); clubList = null; clubData = {};
    A.rerender(); toast('Signed out. Saving on this phone only.');
  };
  ACT.signOutWipe = async () => {
    A.closeSheet(); toast('Saving one last time…');
    if (!(await settle())) { toast("Couldn't reach your account, so nothing was removed. Try again when you're online."); return; }
    await C.signOut(); S.wipeLocal(); M.owner = null; S.saveMeta(); clubList = null; clubData = {};
    A.reset('settings'); toast('Signed out. This phone is empty now.');
  };
  ACT.acctDelete = () => {
    A.openSheet(`<h2>Delete your account?</h2><p class="muted">This removes your account, the workouts and setup photos saved in it, and takes you out of your clubs. A club you run passes to its longest-standing member. It can't be undone.</p>
      <p class="small muted mt8">The workouts on this phone stay here.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" id="acctDelBtn" data-act="acctDeleteYes">Delete account</button></div>`);
  };
  ACT.acctDeleteYes = async () => {
    setBusy('acctDelBtn', true, 'Deleting…');
    try { await C.deleteAccount(); clubList = null; clubData = {}; A.closeSheet(); A.rerender(); toast('Account deleted. Your workouts are still on this phone.'); }
    catch (e) { if (C.signedIn()) setBusy('acctDelBtn', false); else { A.closeSheet(); A.rerender(); } toast(e.message); }
  };
  document.addEventListener('change', async e => {
    const t = e.target; if (t.dataset.bind !== 'share') return;
    const hint = $('#shareHint'); if (hint) hint.textContent = SHARE_HINT[t.value] || '';
    try { await C.setProfile(null, t.value); toast(t.value === 'none' ? 'Club mates no longer see your workouts' : 'Saved'); }
    catch (err) { toast(err.message); A.rerender(); }
  });

  // =====================================================================================================
  // Clubs
  // =====================================================================================================
  let clubList = null, clubListAt = 0, clubListTry = 0, clubListErr = '';
  let clubData = {}, clubTry = {}, clubErr = {};       // by "id|week"
  let weekOff = 0;
  const onView = (name, id) => { const t = A.top(); return t.name === name && (id == null || (t.params || {}).id === id); };
  function loadClubs(force) {
    if (!force && Date.now() - clubListTry < 12000) return;
    clubListTry = Date.now();
    C.clubs.list().then(l => { clubList = l || []; clubListAt = Date.now(); clubListErr = ''; if (onView('clubs')) soft(); })
      .catch(e => { clubListErr = e.message; if (onView('clubs')) soft(); });
  }
  function weekStart(off) {
    const n = new Date(), d = new Date(n.getFullYear(), n.getMonth(), n.getDate());
    d.setDate(d.getDate() - ((d.getDay() + 6) % 7) + 7 * (off || 0));
    return d;
  }
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const dm = d => `${d.getDate()} ${MON[d.getMonth()]}`;
  const ckey = id => id + '|' + weekOff;
  function loadClub(id, force) {
    const k = ckey(id);
    if (!force && Date.now() - (clubTry[k] || 0) < 12000) return;
    clubTry[k] = Date.now();
    C.clubs.get(id, weekStart(weekOff).toISOString(), weekStart(0).toISOString()).then(d => { clubData[k] = d; clubErr[k] = ''; if (onView('club', id)) soft(); })
      .catch(e => { clubErr[k] = e.message; if (onView('club', id)) soft(); });
  }
  const refreshClub = id => { loadClub(id, true); clubListTry = 0; clubListAt = 0; };

  // what a club screen shows while its data is on the way: grey shapes of what is coming, instead of a word
  const SKEL = `<div class="skel" aria-label="Loading"><div class="sk card"><i class="w60"></i><i class="w90"></i><i class="w40"></i></div><div class="sk card"><i class="w50"></i><i class="w80"></i></div><div class="sk card"><i class="w70"></i><i class="w30"></i><i class="w90"></i></div></div>`;
  VIEWS.clubs = {
    refresh() { ACT.clubsRetry(); loadLive(true); },
    html() {
      let h = `<div class="top"><div class="grow"><h1>Clubs</h1><div class="sub">Train with friends</div></div></div>`;
      if (!C.configured) return h + `<div class="empty"><div class="big">👥</div><h2>Not switched on yet</h2><p>Clubs need the GymDay server, which isn't connected in this version.</p></div>`;
      if (!C.signedIn()) return h + `<div class="empty"><div class="big">👥</div><h2>Train with friends</h2><p>Start a club, share its code, and see who trained this week. Clubs need an account.</p>
        <div class="mt16"><button class="btn primary" data-act="acctSignIn">Sign in</button></div></div>`;
      if (!C.profile()) return h + `<div class="card"><div class="title">One thing first</div><p class="small muted mt4">Choose the name your club mates will see.</p><button class="btn primary block mt12" data-act="clubNeedName">Choose a name</button></div>`;
      h += `<div class="row mb12"><button class="btn primary grow" data-act="clubNew">+ Start a club</button><button class="btn grow" data-act="clubJoin">Join with a code</button></div>`;
      if (!clubList) return h + (clubListErr ? `<div class="card"><p class="small muted">${esc(clubListErr)}</p><button class="btn block mt12" data-act="clubsRetry">Try again</button></div>` : SKEL);
      if (!clubList.length) return h + `<div class="empty"><div class="big">👥</div><h2>No clubs yet</h2><p>Start one and send the code to your friends, or join theirs with a code.</p></div>`;
      h += newsCard();
      for (const c of clubList) {
        h += `<div class="card tap" data-act="clubOpen" data-id="${esc(c.id)}"><div class="row">${crest(c.id, c.name, c.logo_at, 'lg')}<div class="grow" style="min-width:0"><div class="title ellipsis">${esc(c.name)}</div>
          <div class="small muted mt4">${plural(c.members, 'member')}${c.is_owner ? ' · you run this club' : ''}</div>
          ${c.descr ? `<div class="xs dim ellipsis mt4">${esc(c.descr)}</div>` : ''}
          ${c.challenge ? `<div class="mt8"><span class="pill accent">⚑ ${esc(c.challenge)}</span></div>` : ''}${liveLine(c.id)}</div><span class="chev">›</span></div></div>`;
      }
      if (clubListErr) h += `<p class="xs dim">Showing what was loaded last. ${esc(clubListErr)}</p>`;
      return h;
    },
    mount() {
      if (!C.signedIn()) return;
      if (!C.profile()) { if (Date.now() - clubListTry > 12000) { clubListTry = Date.now(); C.loadProfile().then(p => { if (p && onView('clubs')) soft(); }).catch(() => { }); } return; }
      if (!clubList || Date.now() - clubListAt > 15000) loadClubs();
      loadLive(); loadNews(); if (news && unread()) A.later(newsSeen, 1500);
    }
  };
  ACT.clubsRetry = () => { clubListErr = ''; loadClubs(true); loadNews(true); A.rerender(); };
  ACT.clubNeedName = () => { auth.from = 'clubs'; A.go('name'); };
  // opening a club always fetches it fresh (what was loaded before is shown meanwhile, unless told to drop it)
  function openClub(id, drop) { weekOff = 0; clubTry[ckey(id)] = 0; if (drop) delete clubData[ckey(id)]; A.go('club', { id }); }
  ACT.clubOpen = el => openClub(el.dataset.id);
  ACT.clubNew = () => {
    A.openSheet(`<h2>Start a club</h2><p class="muted mb12">You get a code to send to your friends.</p><input class="input" id="clubNameIn" maxlength="40" placeholder="Club name, e.g. 6am crew" enterkeyhint="done">
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="clubNewBtn" data-act="clubNewSave">Start club</button></div>`,
      () => { const i = $('#clubNameIn'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.clubNewSave(); }); });
  };
  ACT.clubNewSave = async () => {
    const name = (($('#clubNameIn') || {}).value || '').trim(); if (!name) { showErr('Give the club a name.'); return; }
    setBusy('clubNewBtn', true, 'Starting…');
    try {
      const c = await C.clubs.create(name);
      clubList = null; clubListTry = 0; A.closeSheet(); openClub(c.id, true);
      inviteSheet(c.name, c.code, true);
    } catch (e) { setBusy('clubNewBtn', false); showErr(e.message); }
  };
  ACT.clubJoin = () => {
    A.openSheet(`<h2>Join a club</h2><p class="muted mb12">Type the 6-character code your friend sent you.</p><input class="input code" id="clubCodeIn" maxlength="12" autocapitalize="characters" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="ABC123" enterkeyhint="done">
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="clubJoinBtn" data-act="clubJoinGo">Join</button></div>`,
      () => { const i = $('#clubCodeIn'); i.focus(); i.addEventListener('keydown', e => { if (e.key === 'Enter') ACT.clubJoinGo(); }); });
  };
  ACT.clubJoinGo = async () => {
    const code = (($('#clubCodeIn') || {}).value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
    if (code.length < 4) { showErr('Type the code first.'); return; }
    setBusy('clubJoinBtn', true, 'Joining…');
    try {
      const r = await C.clubs.join(code);
      if (!r || !r.ok) { setBusy('clubJoinBtn', false); showErr((r && r.error) || 'No club has that code.'); return; }
      clubList = null; clubListTry = 0; A.closeSheet(); openClub(r.id, true); toast('You joined ' + r.name);
    } catch (e) { setBusy('clubJoinBtn', false); showErr(e.message); }
  };
  function inviteSheet(name, code, fresh) {
    A.openSheet(`<h2>${fresh ? 'Club started 🎉' : 'Invite friends'}</h2>
      <p class="muted">${C.old ? 'Friends open GymDay, tap <b>Clubs → Join with a code</b>, and type:' : 'Send the invite link: tapping it opens GymDay and joins the club. The code works too, under <b>Clubs → Join with a code</b>:'}</p>
      <div class="codebox" id="clubCodeBox">${esc(code)}</div>
      <button class="btn primary block" data-act="clubShare" data-name="${esc(name)}" data-code="${esc(code)}">${C.old ? 'Share the code' : 'Share the invite link'}</button>
      <button class="btn block mt8" data-act="closeSheet">Done</button>`);
  }
  ACT.clubInvite = el => { const d = clubData[ckey(el.dataset.id)]; if (d) inviteSheet(d.club.name, d.club.code, false); };
  ACT.clubShare = async el => {
    const how = `In GymDay tap Clubs → Join with a code and type: ${el.dataset.code}`;
    const text = C.old ? `Join my GymDay club "${el.dataset.name}". ${how}`
      : `Join my GymDay club "${el.dataset.name}":\n${C.inviteLink(el.dataset.code)}\n\nIf the link doesn't open the app: ${how}`;
    try {
      if (S.isAndroid && window.Android.share) { window.Android.share(text); return; }
      if (navigator.share) { await navigator.share({ text }); return; }
      await navigator.clipboard.writeText(text); toast('Copied. Paste it to your friends.');
    } catch (e) { toast('Code: ' + el.dataset.code); }
  };
  // An invite link was tapped (gymday://join/CODE): ask, then join. Not signed in yet → remember it until they are.
  const cleanCode = c => String(c || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase().slice(0, 12);
  function joinAsk(code) {
    A.openSheet(`<h2>Join this club?</h2><p class="muted">You opened an invite with the code <b>${esc(code)}</b>.</p><div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="joinLinkNo">Not now</button><button class="btn primary grow" id="joinLinkBtn" data-act="joinLinkGo" data-code="${esc(code)}">Join</button></div>`);
  }
  window.onJoinLink = raw => {
    const code = cleanCode(raw); if (code.length < 4) return;
    if (!C.configured) { toast("This copy of GymDay isn't connected to the GymDay server."); return; }
    M.pendingJoin = code; S.saveMeta();
    if (C.signedIn() && C.profile()) { joinShown = code; joinAsk(code); }
    else toast('Sign in first. Then GymDay asks you to join the club.');
  };
  ACT.joinLinkNo = () => { delete M.pendingJoin; S.saveMeta(); A.closeSheet(); };
  ACT.joinLinkGo = async el => {
    setBusy('joinLinkBtn', true, 'Joining…');
    try {
      const r = await C.clubs.join(el.dataset.code);
      if (!r || !r.ok) { setBusy('joinLinkBtn', false); showErr((r && r.error) || 'No club has that code.'); return; }
      delete M.pendingJoin; S.saveMeta(); clubList = null; clubListTry = 0; A.closeSheet(); A.reset('clubs'); openClub(r.id, true); toast('You joined ' + r.name);
    } catch (e) { setBusy('joinLinkBtn', false); showErr(e.message); }
  };

  function challengeHtml(d) {
    const ch = d.challenge;
    if (!ch) return d.club.is_owner ? `<div class="card"><div class="row"><div class="grow"><div class="title">No club challenge yet</div><div class="small muted mt4">Set a shared goal, like 30 workouts in 30 days.</div></div><button class="btn sm" data-act="clubChallenge" data-id="${esc(d.club.id)}">Set one</button></div></div>` : '';
    const now = Date.now(), st = new Date(ch.start).getTime(), en = new Date(ch.end).getTime(), day = 86400000;
    const total = +ch.total || 0, pct = Math.max(0, Math.min(100, (total / ch.target) * 100)), unit = ch.metric === 'minutes' ? 'minutes in the gym' : 'workouts';
    const left = now < st ? `starts in ${plural(Math.ceil((st - now) / day), 'day')}` : now >= en ? 'finished' : (en - now < day ? 'ends today' : `${plural(Math.ceil((en - now) / day), 'day')} left`);
    const tops = (ch.by || []).filter(x => +x.value > 0).slice(0, 3);
    return `<div class="card ch"><div class="row"><div class="grow" style="min-width:0"><div class="k2">Club challenge</div><div class="title ellipsis">${esc(ch.title)}</div></div><span class="pill ${total >= ch.target ? 'green' : 'accent'}" style="margin:0">${total >= ch.target ? '🏆 done' : left}</span></div>
      <div class="meter"><div style="width:${pct}%"></div></div>
      <div class="row small"><span class="grow"><b>${total}</b> of ${ch.target} ${unit}</span><span class="muted xs">${dm(new Date(st))} – ${dm(new Date(en - 1))}</span></div>
      ${tops.length ? `<div class="xs muted mt8">${tops.map(x => `${esc(x.name)}${x.me ? ' (you)' : ''} ${x.value}`).join(' · ')}</div>` : `<div class="xs dim mt8">Nobody has added to it yet.</div>`}</div>`;
  }
  const KINDS = [['clap', '👏'], ['fire', '🔥'], ['strong', '💪'], ['wow', '😮'], ['heart', '❤️']];
  const emo = k => (KINDS.find(x => x[0] === k) || KINDS[0])[1];
  const perKg = () => (D.settings.unit === 'lb' ? 0.45359237 : 1);                              // the server keeps kg; show this person's unit
  const big = kg => `${A.fmtBig((+kg || 0) / perKg())} ${A.unit()}`;                             // a total
  const wt = kg => `${A.fmtW(Math.round(((+kg || 0) / perKg()) * 10) / 10)} ${A.unit()}`;        // one lift
  const isNew = d => !!d && d.winners !== undefined;                                             // the server has had the v1.5 setup
  const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const day0 = t => { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); };
  const dayWord = t => { const n = Math.round((day0(t) - day0(Date.now())) / 86400000); return n === 0 ? 'today' : n === 1 ? 'tomorrow' : n === -1 ? 'yesterday' : n > 1 && n < 7 ? 'on ' + DAYS[new Date(t).getDay()] : A.fmtDate(t); };
  const agoShort = at => { const m = Math.max(0, Math.round((Date.now() - new Date(at).getTime()) / 60000)); return m < 1 ? 'now' : m < 60 ? m + ' min' : m < 1440 ? Math.round(m / 60) + ' h' : Math.round(m / 1440) + ' d'; };
  let clubTab = 'home', boardBy = 'workouts';

  const BOARDS = [['workouts', 'Workouts'], ['volume', 'Weight lifted'], ['prs', 'Records'], ['streak', 'Streak']];
  function boardHtml(d, id) {
    const ws = weekStart(weekOff), we = new Date(ws); we.setDate(we.getDate() + 6);
    const by = isNew(d) ? boardBy : 'workouts';
    const val = b => +(by === 'workouts' ? b.workouts : by === 'volume' ? b.volume : by === 'prs' ? b.prs : b.streak) || 0;
    const label = b => {
      const n = val(b); if (!n) return by === 'workouts' ? 'none yet' : '';
      return by === 'workouts' ? `${plural(n, 'workout')} · ${A.fmtDur(+b.ms || 0)}` : by === 'volume' ? big(n) : by === 'prs' ? `🏆 ${plural(n, 'record')}` : `🔥 ${plural(n, 'week')} in a row`;
    };
    const list = by === 'workouts' ? d.board : d.board.slice().sort((a, b) => val(b) - val(a) || String(a.name).localeCompare(String(b.name)));
    const max = Math.max(1, ...list.map(val));
    let rank = 0, prev = null, shown = 0;
    const rows = list.map(b => {
      const n = val(b); shown++;
      if (n !== prev) { rank = shown; prev = n; }
      return `<div class="board-row ${b.me ? 'me' : ''}" ${isNew(d) ? `data-act="memberOpen" data-u="${esc(b.user_id)}" data-id="${esc(id)}"` : ''}><div class="rk">${n ? rank : '–'}</div>${face(b.user_id, b.name, b.avatar_at)}<div class="grow" style="min-width:0"><div class="row"><span class="nm grow ellipsis">${esc(b.name)}${b.me ? ' <span class="dim">(you)</span>' : ''}</span><span class="xs muted">${label(b)}</span></div>
        <div class="bar"><div style="width:${(n / max) * 100}%"></div></div></div></div>`;
    }).join('');
    const chips = isNew(d) ? `<div class="chips mt8" style="margin-bottom:0">${BOARDS.map(x => `<button class="chip ${by === x[0] ? 'on' : ''}" data-act="boardBy" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>` : '';
    const note = by === 'streak' ? `<div class="xs dim mt8">Weeks in a row with at least one workout, up to today.</div>` : by === 'workouts' ? '' : `<div class="xs dim mt8">${by === 'volume' ? 'Weight × reps of every set, added up.' : 'New personal records set in the week.'}</div>`;
    return `<div class="card"><div class="row"><div class="grow"><h3>${weekOff === 0 ? 'This week' : weekOff === -1 ? 'Last week' : 'Week of ' + dm(ws)}</h3><div class="xs dim">${dm(ws)} – ${dm(we)}</div></div>
      <button class="btn icon" data-act="clubWeek" data-id="${esc(id)}" data-d="-1" aria-label="Earlier week">‹</button><button class="btn icon" data-act="clubWeek" data-id="${esc(id)}" data-d="1" aria-label="Later week" ${weekOff >= 0 ? 'disabled' : ''}>›</button></div>
      ${chips}<div class="mt8">${rows}</div>${note}</div>`;
  }
  ACT.boardBy = el => { boardBy = el.dataset.v; A.rerender(); };

  function reactHtml(f, i) {
    const rs = f.reactions || {};
    const counts = KINDS.filter(k => +rs[k[0]] > 0).map(k => `<span class="rxc ${f.mine === k[0] ? 'on' : ''}">${k[1]} ${+rs[k[0]]}</span>`).join('');
    return `${counts}${f.me ? '' : `<button class="rxb ${f.mine ? 'on' : ''}" data-act="reactOpen" data-i="${i}">${f.mine ? 'Change' : '＋ React'}</button>`}<button class="rxb" data-act="commentsOpen" data-i="${i}">💬${+f.comments ? ' ' + (+f.comments) : ' Comment'}</button>`;
  }
  function feedHtml(d) {
    if (!d.feed.length) return `<div class="card"><p class="small muted">Nothing here yet. Finished workouts show up here, unless someone chose to share nothing.</p></div>`;
    const nw = isNew(d);
    return `<div class="card">` + d.feed.map((f, i) => {
      const t = new Date(f.started_at).getTime();
      const more = nw ? [(+f.volume ? big(f.volume) : ''), (+f.prs ? `🏆 ${plural(+f.prs, 'record')}` : '')].filter(Boolean).join(' · ') : '';
      const body = `<div data-act="feedOpen" data-i="${i}"><div class="small ellipsis"><b>${esc(f.name)}</b>${f.me ? ' <span class="dim">(you)</span>' : ''} · ${esc(f.day_name || 'Workout')}</div>
        <div class="xs muted">${A.fmtDate(t)} · ${A.fmtClock(t)} · gym time ${A.fmtDur(+f.gym_ms || 0)}</div>
        <div class="xs dim">${plural(f.ex_count, 'exercise')} · ${plural(f.set_count, 'set')}${more ? ' · ' + more : ''}${f.detail ? ' · tap for the sets' : ''}</div></div>`;
      if (!nw) return `<div class="feed-item">${av(f.name)}<div class="grow" style="min-width:0">${body}</div>
        <button class="cheer ${f.cheered ? 'on' : ''}" data-act="cheer" data-i="${i}" aria-label="Cheer" ${f.me ? 'disabled' : ''}>👏${+f.cheers ? `<span>${f.cheers}</span>` : ''}</button></div>`;
      return `<div class="feed-item v2"><span data-act="memberOpen" data-u="${esc(f.owner_id)}" data-id="${esc(d.club.id)}">${face(f.owner_id, f.name, f.avatar_at)}</span><div class="grow" style="min-width:0">${body}<div class="rx" id="rx${i}">${reactHtml(f, i)}</div></div></div>`;
    }).join('') + `</div>`;
  }
  function plansHtml(d, id) {
    const rows = (d.plans || []).map(p => {
      const t = new Date(p.at).getTime(), others = (p.going || []).filter(g => g.user_id !== p.user_id);
      return `<div class="plan">${face(p.user_id, p.name, p.avatar_at)}<div class="grow" style="min-width:0"><div class="small"><b>${esc(p.name)}</b>${p.me ? ' <span class="dim">(you)</span>' : ''} · ${dayWord(t)}, ${A.fmtClock(t)}</div>
        ${p.note ? `<div class="xs muted ellipsis">${esc(p.note)}</div>` : ''}<div class="xs dim">${others.length ? 'Coming too: ' + others.map(g => esc(g.name) + (g.me ? ' (you)' : '')).join(', ') : 'Nobody else yet'}</div></div>
        ${p.me ? `<button class="btn sm ghost" data-act="planDel" data-p="${esc(p.id)}" data-id="${esc(id)}">Take down</button>`
          : `<button class="btn sm ${p.in ? '' : 'primary'}" data-act="planJoin" data-p="${esc(p.id)}" data-id="${esc(id)}" data-on="${p.in ? 0 : 1}">${p.in ? "I'm out" : "I'm in"}</button>`}</div>`;
    }).join('');
    return `<div class="card"><div class="row"><div class="grow"><h3>Going to the gym</h3>${rows ? '' : `<div class="xs dim mt4">Say when you're going, so a club mate can come along.</div>`}</div><button class="btn sm" data-act="planNew" data-id="${esc(id)}">I'm going</button></div>${rows ? `<div class="mt8">${rows}</div>` : ''}</div>`;
  }
  function winnerHtml(d) {
    const w = (d.winners || [])[0]; if (!w || weekOff !== 0 || Math.abs(new Date(w.week).getTime() - weekStart(-1).getTime()) > 7200000) return '';
    return `<div class="card win" data-act="clubTab" data-v="trophies"><span class="big">🏆</span><div class="grow"><div class="k2">Last week's winner</div><div class="title ellipsis">${esc(w.name)}${w.me ? ' (you)' : ''}</div><div class="xs muted">${plural(+w.workouts, 'workout')} · ${A.fmtDur(+w.ms || 0)} in the gym</div></div><span class="chev">›</span></div>`;
  }
  function recordsHtml(d) {
    const rs = d.records || [];
    if (!rs.length) return `<div class="empty"><div class="big">🏅</div><h2>No club records yet</h2><p>The heaviest lift on each exercise shows here, for members who share <b>Everything</b> (Settings → Account → What club mates see).</p></div>`;
    const medal = ['🥇', '🥈', '🥉'];
    return rs.map(r => {
      const ex = S.getEx(r.ex), name = ex ? ex.name : (r.name || 'Exercise');
      return `<div class="card"><div class="title ellipsis">${esc(name)}</div>${r.top.slice(0, 5).map((t, i) => `<div class="rec-row ${t.me ? 'me' : ''}"><span class="md">${medal[i] || (i + 1)}</span><span class="grow ellipsis">${esc(t.name)}${t.me ? ' <span class="dim">(you)</span>' : ''}</span><b>${wt(t.w)}</b>${+t.reps ? `<span class="xs muted">× ${+t.reps}</span>` : ''}</div>`).join('')}</div>`;
    }).join('') + `<p class="xs dim">Only members who share Everything are listed.</p>`;
  }
  function daysHtml(d, id) {
    let h = `<button class="btn primary block mb12" data-act="dayShare" data-id="${esc(id)}">Share one of my days</button>`;
    if (!(d.days || []).length) return h + `<div class="empty"><div class="big">📋</div><h2>No shared days yet</h2><p>Put one of your days here and club mates can copy it into their own list.</p></div>`;
    return h + d.days.map((x, i) => `<div class="card"><div class="row" data-act="dayPeek" data-i="${i}"><div class="grow" style="min-width:0"><div class="title ellipsis">${esc(x.name)}</div><div class="small muted mt4">${plural((x.items || []).length, 'exercise')} · from ${esc(x.by)}${x.me ? ' (you)' : ''}</div></div><span class="chev">›</span></div>
      <div class="row mt12">${x.me || d.club.is_owner ? `<button class="btn grow" data-act="dayDown" data-d="${esc(x.id)}" data-id="${esc(id)}">Take down</button>` : ''}${x.me ? '' : `<button class="btn primary grow" data-act="dayCopy" data-i="${i}">Copy to my days</button>`}</div></div>`).join('');
  }
  function trophiesHtml(d) {
    const ws = d.winners || [];
    if (!ws.length) return `<div class="empty"><div class="big">🏆</div><h2>No trophies yet</h2><p>Whoever trains the most in a week wins it: most workouts, then most time in the gym. The first trophy is handed out when this week ends.</p></div>`;
    const shelf = d.members.filter(m => +m.wins > 0).sort((a, b) => b.wins - a.wins || String(a.name).localeCompare(String(b.name)));
    return `<div class="card"><h3>Trophy shelf</h3><div class="xs dim">The last 12 weeks</div><div class="mt8">${shelf.map(m => `<div class="list-item" data-act="memberOpen" data-u="${esc(m.user_id)}" data-id="${esc(d.club.id)}">${face(m.user_id, m.name, m.avatar_at)}<div class="grow ellipsis small" style="font-weight:600">${esc(m.name)}${m.me ? ' <span class="dim">(you)</span>' : ''}</div><div>${'🏆'.repeat(Math.min(+m.wins, 6))}${+m.wins > 6 ? ' ×' + m.wins : ''}</div></div>`).join('')}</div></div>
      <div class="card"><h3>Week by week</h3><div class="mt8">${ws.map(w => { const s = new Date(w.week), e = new Date(s); e.setDate(e.getDate() + 6);
        return `<div class="list-item"><div class="grow"><div class="small" style="font-weight:600">🏆 ${esc(w.name)}${w.me ? ' <span class="dim">(you)</span>' : ''}</div><div class="xs muted">${dm(s)} – ${dm(e)}</div></div><div class="xs muted">${plural(+w.workouts, 'workout')}</div></div>`; }).join('')}</div></div>
      <p class="xs dim">Most workouts in the week wins; a tie goes to whoever spent longer in the gym.</p>`;
  }
  // ---- club chat: a simple message board. Only the list is repainted when messages arrive, so typing is never interrupted.
  let chatData = {}, chatDraft = {}, chatBusy = false;
  function chatRows(id) {
    const c = chatData[id];
    if (!c) return A.skel ? A.skel(3) : `<p class="small muted">Loading…</p>`;          // 1.33 (31): placeholders, not a blank
    if (c.none) return `<p class="small muted">Chat arrives with the next update of the GymDay server.</p>`;
    if (c.err && !c.list.length) return `<p class="small muted">${esc(c.err)}</p>`;
    if (!c.list.length) return `<p class="small muted">No messages yet. Say hello to the club.</p>`;
    let day = '';
    const sf = window.Safety, shown = sf ? c.list.filter(m => !sf.isBlocked(m.user_id)) : c.list;      // 1.30: blocked people's messages are not shown
    return (c.more ? `<button class="btn sm ghost block" data-act="chatEarlier" data-id="${esc(id)}">Earlier messages</button>` : '') + shown.map(m => {
      const t = new Date(m.at).getTime(), d = A.fmtDate(t), head = d !== day ? `<div class="msg-day">${d}</div>` : ''; day = d;
      return `${head}<div class="msg ${m.me ? 'me' : ''}">${m.me ? '' : face(m.user_id, m.name, m.avatar_at)}<div class="bub">${m.me ? '' : `<div class="who">${esc(m.name)}</div>`}<div class="txt">${esc(sf ? sf.clean(m.body) : m.body)}</div><div class="when">${A.fmtClock(t)}${m.can_delete ? ` · <span data-act="chatDel" data-m="${esc(m.id)}" data-id="${esc(id)}">delete</span>` : ''}${!m.me && sf ? ' · ' + sf.msgLink('message', m, id) : ''}</div></div></div>`;
    }).join('');
  }
  function paintChat(id, toEnd) {
    const b = $('#chatList'); if (!b || b.dataset.id !== id) return;
    const atEnd = b.scrollHeight - b.scrollTop - b.clientHeight < 60;
    b.innerHTML = chatRows(id); if (toEnd || atEnd) b.scrollTop = b.scrollHeight;
  }
  function setChat(id, r, keepOlder) {
    const old = chatData[id], fresh = (r && r.messages) || [];
    if (keepOlder && old && old.list.length && fresh.length) {             // keep earlier pages that were already loaded
      const first = fresh[0].at, older = old.list.filter(m => m.at < first);
      chatData[id] = { list: older.concat(fresh), more: older.length ? old.more : !!r.more, err: '' };
    } else chatData[id] = { list: fresh, more: !!(r && r.more), err: '' };
  }
  function loadChat(id, toEnd) {
    C.clubs.chat(id).then(r => { const had = !!chatData[id]; setChat(id, r, true); paintChat(id, toEnd || !had); })
      .catch(e => { if (e.code === 'PGRST202') chatData[id] = { list: [], none: true }; else if (chatData[id]) chatData[id].err = e.message; else chatData[id] = { list: [], more: false, err: e.message }; paintChat(id); });
  }
  function chatHtml(id) {
    return `<div class="card chat"><div id="chatList" class="chat-list" data-id="${esc(id)}">${chatRows(id)}</div>
      <div class="row mt12"><input class="input grow" id="chatIn" maxlength="500" placeholder="Message the club" enterkeyhint="send" autocomplete="off" value="${esc(chatDraft[id] || '')}" data-id="${esc(id)}"><button class="btn primary" id="chatBtn" data-act="chatSend" data-id="${esc(id)}">Send</button></div>
      <div class="auth-err hidden mt8" id="authErr"></div></div>`;
  }
  document.addEventListener('input', e => { const t = e.target; if (t && t.id === 'chatIn') chatDraft[t.dataset.id] = t.value; });
  document.addEventListener('keydown', e => { const t = e.target; if (t && t.id === 'chatIn' && e.key === 'Enter') ACT.chatSend({ dataset: { id: t.dataset.id } }); });
  ACT.chatSend = async el => {
    const id = el.dataset.id, inp = $('#chatIn'), body = ((inp || {}).value || '').trim(); if (chatBusy) return;
    if (!body) { showErr('Write something first.'); return; }
    chatBusy = true; setBusy('chatBtn', true, '…');
    try { const r = await C.clubs.chatSend(id, body); setChat(id, r, true); chatDraft[id] = ''; if ($('#chatIn')) $('#chatIn').value = ''; const eb = $('#authErr'); if (eb) eb.classList.add('hidden'); paintChat(id, true); }
    catch (e) { showErr(e.message); }
    chatBusy = false; setBusy('chatBtn', false);
  };
  ACT.chatDel = async el => { try { setChat(el.dataset.id, await C.clubs.chatDelete(el.dataset.m), true); const c = chatData[el.dataset.id]; if (c) c.list = c.list.filter(m => m.id !== el.dataset.m); paintChat(el.dataset.id); } catch (e) { toast(e.message); } };
  ACT.chatRefresh = el => loadChat(el.dataset.id);
  ACT.chatEarlier = async el => {
    const id = el.dataset.id, c = chatData[id]; if (!c || !c.list.length) return; el.disabled = true;
    try { const r = await C.clubs.chat(id, c.list[0].at), b = $('#chatList'), h0 = b ? b.scrollHeight : 0; c.list = (r.messages || []).concat(c.list); c.more = !!r.more; paintChat(id); if (b) b.scrollTop = b.scrollHeight - h0; }
    catch (e) { el.disabled = false; (A.failToast ? A.failToast(e, () => ACT.chatEarlier(el)) : toast(e.message)); }
  };
  const TABS = [['home', 'Club'], ['chat', 'Chat'], ['records', 'Records'], ['days', 'Days'], ['trophies', 'Trophies']];
  VIEWS.club = {
    refresh(p) { ACT.clubRetry({ dataset: { id: p.id } }); loadLive(true); if (clubTab === 'chat') loadChat(p.id); },
    html({ id }) {
      const d = clubData[ckey(id)], known = (clubList || []).find(c => c.id === id), err = clubErr[ckey(id)];
      const name = d ? d.club.name : known ? known.name : 'Club';
      let h = `<div class="top"><button class="back" data-act="back">‹</button>${d && +d.club.logo_at ? crest(id, name, d.club.logo_at) : ''}<div class="grow" style="min-width:0"><h1 class="ellipsis" style="font-size:22px">${esc(name)}</h1>
        <div class="sub">${d ? plural(d.members.length, 'member') + (d.club.is_owner ? ' · you run this club' : '') : err ? '&nbsp;' : 'Loading…'}</div></div>
        ${d ? `<button class="btn sm primary" data-act="clubInvite" data-id="${esc(id)}">Invite</button><button class="btn icon" data-act="clubMenu" data-id="${esc(id)}" aria-label="More">⋯</button>` : ''}</div>`;
      if (!d) return h + (err ? `<div class="card"><p class="small muted">${esc(err)}</p><button class="btn block mt12" data-act="clubRetry" data-id="${esc(id)}">Try again</button></div>` : SKEL);
      const nw = isNew(d), tab = nw ? clubTab : 'home';
      if (nw) h += `<div class="chips">${TABS.map(x => `<button class="chip ${tab === x[0] ? 'on' : ''}" data-act="clubTab" data-v="${x[0]}">${x[1]}</button>`).join('')}</div>`;
      if (tab === 'chat') h += chatHtml(id);
      else if (tab === 'records') h += recordsHtml(d);
      else if (tab === 'days') h += daysHtml(d, id);
      else if (tab === 'trophies') h += trophiesHtml(d);
      else {
        if (d.club.descr) h += `<p class="small muted mb12" style="white-space:pre-wrap">${esc(d.club.descr)}</p>`;
        const p = C.profile();
        if (p && p.share === 'none') h += `<div class="card"><p class="small muted">You're sharing nothing with clubs, so your workouts don't count here. Change it in Settings → Account.</p></div>`;
        h += liveStrip(id) + (nw ? plansHtml(d, id) : '') + challengeHtml(d) + (nw ? winnerHtml(d) : '') + boardHtml(d, id) + `<h3 class="mt16 mb8">Latest from the club</h3>` + feedHtml(d);
      }
      if (err) h += `<p class="xs dim">Showing what was loaded last. ${esc(err)}</p>`;
      return h;
    },
    mount({ id }) {
      loadClub(id); A.later(() => { if (!document.hidden) loadClub(id); }, 45000, true);       // stays fresh while it is open
      loadLive(); A.later(() => { if (!document.hidden) loadLive(true); }, 60000, true);
      if (clubTab === 'chat') { const b = $('#chatList'); if (b) b.scrollTop = b.scrollHeight; loadChat(id); A.later(() => { if (!document.hidden && clubTab === 'chat') loadChat(id); }, 12000, true); }
    },
    leave() { weekOff = 0; clubTab = 'home'; boardBy = 'workouts'; }
  };
  ACT.clubTab = el => { clubTab = el.dataset.v; window.scrollTo(0, 0); A.rerender(); };
  ACT.clubRetry = el => { clubErr[ckey(el.dataset.id)] = ''; loadClub(el.dataset.id, true); A.rerender(); };
  ACT.clubWeek = el => { weekOff = Math.min(0, weekOff + (+el.dataset.d)); clubTab = 'home'; clubTry[ckey(el.dataset.id)] = 0; A.rerender(); };
  const curClub = () => { const t = A.top(); return t.name === 'club' ? clubData[ckey(t.params.id)] : null; };
  ACT.feedOpen = el => {
    const d = curClub(), f = d && d.feed[+el.dataset.i]; if (!f || !f.detail || !(f.detail.items || []).length) return;
    A.openSheet(`<h2>${esc(f.name)} · ${esc(f.day_name || 'Workout')}</h2><div class="card" style="background:var(--bg3)">${f.detail.items.map(x => `<div class="list-item"><div class="grow small" style="font-weight:600">${esc(x.name)}</div><div class="small muted" style="text-align:right">${esc(x.text)}</div></div>`).join('')}</div>
      ${ACT.copyWorkout ? `<button class="btn primary block mb8" data-act="copyWorkout" data-i="${esc(el.dataset.i)}">Do this workout</button>` : ''}<button class="btn block" data-act="closeSheet">Close</button>`);
  };
  ACT.cheer = async el => {                    // only on a server that has not had the v1.5 setup
    const d = curClub(), f = d && d.feed[+el.dataset.i]; if (!f || f.me || f.busy) return;
    const was = { c: f.cheered, n: +f.cheers || 0 };
    const paint = () => { el.classList.toggle('on', !!f.cheered); el.innerHTML = '👏' + (+f.cheers ? `<span>${f.cheers}</span>` : ''); };
    f.busy = true; f.cheered = !was.c; f.cheers = Math.max(0, was.n + (f.cheered ? 1 : -1)); paint();
    try { const r = await C.clubs.cheer(f.owner_id, f.id, f.cheered); f.cheers = +r.cheers || 0; f.cheered = !!r.cheered; }
    catch (e) { f.cheered = was.c; f.cheers = was.n; toast(e.message); }
    f.busy = false; if (document.body.contains(el)) paint();
  };
  // ---- reactions: one per person per workout
  ACT.reactOpen = el => {
    const d = curClub(), f = d && d.feed[+el.dataset.i]; if (!f || f.me) return;
    A.openSheet(`<h2>React to ${esc(f.name)}'s workout</h2><div class="rxpick">${KINDS.map(k => `<button class="${f.mine === k[0] ? 'on' : ''}" data-act="reactSet" data-i="${el.dataset.i}" data-k="${k[0]}" aria-label="${k[0]}">${k[1]}</button>`).join('')}</div>
      ${f.mine ? `<button class="btn block mt12" data-act="reactSet" data-i="${el.dataset.i}" data-k="">Take my reaction away</button>` : ''}<button class="btn block mt8" data-act="closeSheet">Cancel</button>`);
  };
  ACT.reactSet = async el => {
    const d = curClub(), i = +el.dataset.i, f = d && d.feed[i]; if (!f || f.busy) return;
    const k = el.dataset.k || null; A.closeSheet(); f.busy = true;
    try { const r = await C.clubs.react(f.owner_id, f.id, k); f.reactions = r.reactions || {}; f.mine = r.mine || null; f.cheers = +r.cheers || 0; f.cheered = !!r.cheered; }
    catch (e) { (A.failToast ? A.failToast(e, () => ACT.reactSet(el)) : toast(e.message)); }
    f.busy = false; const box = $('#rx' + i); if (box && curClub() === d) box.innerHTML = reactHtml(f, i);
  };
  // ---- comments
  let cmt = null;      // the workout whose comments are open: { f, list, err }
  function commentsBody() {
    if (!cmt) return '';
    if (cmt.err) return `<p class="small muted">${esc(cmt.err)}</p>`;
    if (!cmt.list) return A.skel ? A.skel(2) : `<p class="small muted">Loading…</p>`;
    if (!cmt.list.length) return `<p class="small muted">No comments yet.</p>`;
    const sf = window.Safety;
    return cmt.list.filter(c => !(sf && sf.isBlocked(c.user_id))).map(c => { const t = new Date(c.at).getTime();
      return `<div class="cm">${face(c.user_id, c.name, c.avatar_at)}<div class="grow" style="min-width:0"><div class="xs muted"><b>${esc(c.name)}</b>${c.me ? ' (you)' : ''} · ${A.fmtDate(t)}, ${A.fmtClock(t)}</div><div class="small cm-b">${esc(sf ? sf.clean(c.body) : c.body)}</div></div>${!c.me && sf ? `<button class="btn icon ghost" data-act="ugcReport" data-k="comment" data-m="${esc(c.id)}" data-u="${esc(c.user_id)}" data-n="${esc(c.name)}" data-b="${esc(String(c.body || '').slice(0, 300))}" aria-label="Report this comment">⚑</button>` : ''}${c.can_delete ? `<button class="btn icon ghost" data-act="commentDel" data-c="${esc(c.id)}" aria-label="Delete this comment">✕</button>` : ''}</div>`; }).join('');
  }
  const paintComments = () => { const b = $('#cmList'); if (b) { b.innerHTML = commentsBody(); b.scrollTop = b.scrollHeight; } };
  function setComments(f, l) { if (!cmt || cmt.f !== f) return; cmt.list = l || []; cmt.err = ''; f.comments = cmt.list.length; paintComments(); }
  ACT.commentsOpen = el => {
    const d = curClub(), f = d && d.feed[+el.dataset.i]; if (!f) return;
    cmt = { f, list: null, err: '' };
    A.openSheet(`<h2>${esc(f.name)} · ${esc(f.day_name || 'Workout')}</h2><div id="cmList" class="cm-list">${commentsBody()}</div>
      <div class="row mt12"><input class="input grow" id="cmIn" maxlength="300" placeholder="Write a comment" enterkeyhint="send" autocomplete="off"><button class="btn primary" id="cmBtn" data-act="commentSend">Send</button></div>
      <div class="auth-err hidden" id="authErr"></div><button class="btn block mt12" data-act="closeSheet">Close</button>`,
      () => { $('#cmIn').addEventListener('keydown', e => { if (e.key === 'Enter') ACT.commentSend(); }); },
      () => { cmt = null; if (onView('club')) A.rerender(); });
    C.clubs.comments(f.owner_id, f.id).then(l => setComments(f, l)).catch(e => { if (cmt && cmt.f === f) { cmt.err = e.message; paintComments(); } });
  };
  ACT.commentSend = async () => {
    if (!cmt || cmt.busy) return; const f = cmt.f, inp = $('#cmIn'), body = ((inp || {}).value || '').trim();
    if (!body) { showErr('Write something first.'); return; }
    cmt.busy = true; setBusy('cmBtn', true, '…');
    try { const l = await C.clubs.comment(f.owner_id, f.id, body); if (cmt && cmt.f === f) { inp.value = ''; setComments(f, l); } } catch (e) { showErr(e.message); }
    if (cmt) cmt.busy = false; setBusy('cmBtn', false);
  };
  ACT.commentDel = async el => { if (!cmt) return; const f = cmt.f; try { setComments(f, await C.clubs.deleteComment(el.dataset.c)); } catch (e) { toast(e.message); } };
  // ---- "going to the gym" posts
  ACT.planNew = el => {
    const now = new Date(), def = new Date(now.getTime() + 3600000); def.setMinutes(def.getMinutes() < 30 ? 30 : 60, 0, 0);
    const first = day0(def) > day0(now) ? 1 : 0, p2 = n => String(n).padStart(2, '0');
    const opts = [0, 1, 2, 3, 4, 5, 6].map(n => { const x = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n); return `<option value="${n}" ${n === first ? 'selected' : ''}>${n === 0 ? 'Today' : n === 1 ? 'Tomorrow' : DAYS[x.getDay()] + ', ' + dm(x)}</option>`; }).join('');
    A.openSheet(`<h2>I'm going to the gym</h2><p class="muted mb12">Your club mates see this and can say they're coming too.</p>
      <div class="row"><div class="field grow"><label class="lbl">Day</label><select class="input" id="plDay">${opts}</select></div><div class="field grow"><label class="lbl">Time</label><input class="input" id="plTime" type="time" value="${p2(def.getHours())}:${p2(def.getMinutes())}"></div></div>
      <div class="field"><label class="lbl">Note, if you like</label><input class="input" id="plNote" maxlength="120" placeholder="e.g. Legs" autocomplete="off"></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="plBtn" data-act="planSave" data-id="${esc(el.dataset.id)}">Post</button></div>`);
  };
  ACT.planSave = el => {
    const id = el.dataset.id, n = +$('#plDay').value || 0, tm = String($('#plTime').value || '').split(':').map(Number), now = new Date();
    if (tm.length < 2 || isNaN(tm[0]) || isNaN(tm[1])) { showErr('Pick a time.'); return; }
    const at = new Date(now.getFullYear(), now.getMonth(), now.getDate() + n, tm[0], tm[1]);
    if (at.getTime() < now.getTime() - 30 * 60000) { showErr('That time has already passed.'); return; }
    clubDo('plBtn', 'Posting…', () => C.clubs.postPlan(id, at.toISOString(), $('#plNote').value.trim()), () => { refreshClub(id); toast('Posted to the club'); });
  };
  ACT.planJoin = async el => {
    el.disabled = true;
    try { await C.clubs.joinPlan(el.dataset.p, el.dataset.on === '1'); toast(el.dataset.on === '1' ? "You're in" : "You're out"); } catch (e) { (A.failToast ? A.failToast(e, () => ACT.planJoin(el)) : toast(e.message)); }
    refreshClub(el.dataset.id);
  };
  ACT.planDel = async el => { el.disabled = true; try { await C.clubs.deletePlan(el.dataset.p); toast('Taken down'); } catch (e) { toast(e.message); } refreshClub(el.dataset.id); };
  // ---- days to copy
  const dayLines = items => (items || []).map(it => { const ex = S.getEx(it.ex); return `<div class="list-item"><div class="grow small" style="font-weight:600">${esc(ex ? ex.name : (it.name || 'Exercise'))}${ex ? '' : ' <span class="dim xs">(not in your library)</span>'}</div><div class="small muted">${+it.sets || 3} × ${+it.reps || 10}</div></div>`; }).join('');
  ACT.dayPeek = el => {
    const d = curClub(), x = d && (d.days || [])[+el.dataset.i]; if (!x) return;
    A.openSheet(`<h2>${esc(x.name)}</h2><p class="muted">From ${esc(x.by)}</p><div class="card mt12" style="background:var(--bg3)">${dayLines(x.items)}</div>
      <div class="row">${x.me ? '' : `<button class="btn primary grow" data-act="dayCopy" data-i="${el.dataset.i}">Copy to my days</button>`}<button class="btn grow" data-act="closeSheet">Close</button></div>`);
  };
  ACT.dayCopy = el => {
    const d = curClub(), x = d && (d.days || [])[+el.dataset.i]; if (!x) return;
    const items = (x.items || []).filter(it => S.getEx(it.ex)).map(it => ({ ex: it.ex, sets: Math.max(1, Math.min(20, Math.round(+it.sets) || 3)), reps: Math.max(1, Math.min(100, +it.reps || 10)) }));
    const missed = (x.items || []).length - items.length;
    if (!items.length) { toast("None of those exercises are in your library"); return; }
    S.addDay(String(x.name).slice(0, 40), items); S.save(true); A.closeSheet();
    toast(missed ? `Copied to your days. ${plural(missed, 'exercise')} not in your library ${missed === 1 ? 'was' : 'were'} left out.` : 'Copied to your days');
  };
  ACT.dayShare = el => {
    const id = el.dataset.id;
    if (!D.days.length) { toast('You have no days yet'); return; }
    A.openSheet(`<h2>Share one of my days</h2><p class="muted mb12">Club mates see its exercises with sets × reps (no weights) and can copy it.</p><div class="menu">${D.days.map(x => `<button class="btn block" data-act="dayShareGo" data-id="${esc(id)}" data-d="${esc(x.id)}" ${x.items.length ? '' : 'disabled'}>${esc(x.name)} <span class="dim">· ${plural(x.items.length, 'exercise')}</span></button>`).join('')}</div>
      <div class="auth-err hidden" id="authErr"></div><button class="btn block" data-act="closeSheet">Cancel</button>`);
  };
  ACT.dayShareGo = async el => {
    const id = el.dataset.id, x = S.getDay(el.dataset.d); if (!x) return;
    const items = x.items.map(it => { const ex = S.getEx(it.ex); return ex ? { ex: it.ex, name: String(ex.name).slice(0, 60), sets: +it.sets || 3, reps: +it.reps || 10 } : null; }).filter(Boolean).slice(0, 40);
    el.disabled = true;
    try { await C.clubs.shareDay(id, String(x.name).slice(0, 40), items); A.closeSheet(); clubTab = 'days'; refreshClub(id); toast('Shared with the club'); }
    catch (e) { el.disabled = false; showErr(e.message); }
  };
  ACT.dayDown = async el => { el.disabled = true; try { await C.clubs.unshareDay(el.dataset.d); toast('Taken down'); } catch (e) { toast(e.message); } refreshClub(el.dataset.id); };

  ACT.clubMenu = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return; const own = d.club.is_owner, i = `data-id="${esc(id)}"`;
    A.openSheet(`<h2>${esc(d.club.name)}</h2><div class="menu">
      <button class="btn block" data-act="clubMembers" ${i}>👥&nbsp; Members (${d.members.length})</button>
      ${own ? `${isNew(d) ? `<button class="btn block" data-act="clubInfo" ${i}>🖼&nbsp; Logo and description</button>` : ''}
        <button class="btn block" data-act="clubChallenge" ${i}>⚑&nbsp; ${d.challenge ? 'Change the challenge' : 'Set a challenge'}</button>
        ${d.challenge ? `<button class="btn block" data-act="clubChallengeEnd" ${i}>✕&nbsp; End the challenge</button>` : ''}
        <button class="btn block" data-act="clubRename" ${i}>✎&nbsp; Rename the club</button>` : ''}
      ${!own && window.Safety ? window.Safety.clubButton(id) : ''}
      <button class="btn block" data-act="clubLeave" ${i}>↩&nbsp; Leave the club</button>
      ${own ? `<button class="btn danger block" data-act="clubDelete" ${i}>🗑&nbsp; Delete the club</button>` : ''}</div>`);
  };
  // ---- club logo and description (the person who runs the club)
  let infoLogo;        // undefined = leave as it is, '' = remove, 'data:…' = new picture
  const infoLogoHtml = (id, d) => { const cur = infoLogo === undefined ? picGet('c', id, +d.club.logo_at || 0) : infoLogo; return cur ? `<span class="av sq xl img"><img src="${cur}" alt=""></span>` : `<span class="av sq xl" style="background:${colorOf(d.club.name)}">${initial(d.club.name)}</span>`; };
  ACT.clubInfo = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return; infoLogo = undefined;
    A.openSheet(`<h2>Logo and description</h2>
      <div class="row mb12"><span id="infoLogo">${infoLogoHtml(id, d)}</span><div class="grow"><button class="btn sm block" data-act="clubLogoPick" data-id="${esc(id)}">Choose a picture</button><button class="btn sm ghost block mt8" data-act="clubLogoNone" data-id="${esc(id)}">No logo</button></div></div>
      <div class="field"><label class="lbl">Description</label><textarea class="input" id="clubDescr" maxlength="200" rows="3" placeholder="What this club is about, where and when you train">${esc(d.club.descr || '')}</textarea></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="clubInfoBtn" data-act="clubInfoSave" data-id="${esc(id)}">Save</button></div>`);
  };
  const paintInfoLogo = id => { const b = $('#infoLogo'), d = clubData[ckey(id)]; if (b && d) b.innerHTML = infoLogoHtml(id, d); };
  ACT.clubLogoPick = async el => { const pic = await pickSquare(); if (pic) { infoLogo = pic; paintInfoLogo(el.dataset.id); } };
  ACT.clubLogoNone = el => { infoLogo = ''; paintInfoLogo(el.dataset.id); };
  ACT.clubInfoSave = el => {
    const id = el.dataset.id, descr = ($('#clubDescr').value || '').trim(), logo = infoLogo;
    clubDo('clubInfoBtn', 'Saving…', () => C.clubs.setInfo(id, descr, logo || null, logo !== undefined), () => { clubList = null; refreshClub(id); toast('Saved'); });
  };

  ACT.clubMembers = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return; const nw = isNew(d);
    A.openSheet(`<h2>Members</h2><div class="card" style="background:var(--bg3)">${d.members.map(m => `<div class="list-item"><span class="row grow" style="min-width:0" ${nw ? `data-act="memberOpen" data-u="${esc(m.user_id)}" data-id="${esc(id)}"` : ''}>${face(m.user_id, m.name, m.avatar_at)}<div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(m.name)}${m.me ? ' <span class="dim">(you)</span>' : ''}</div><div class="xs muted ellipsis">${nw ? esc(titleOf(m)) + ' ' + badgesOf(m).map(b => b[0]).join('') : ''}${m.is_owner ? (nw ? ' · ' : '') + 'runs the club' : ''}</div></div></span>
      ${d.club.is_owner && !m.me ? `<button class="btn sm ghost red" data-act="clubKick" data-id="${esc(id)}" data-u="${esc(m.user_id)}" data-name="${esc(m.name)}">Remove</button>` : ''}</div>`).join('')}</div>
      <button class="btn block" data-act="closeSheet">Close</button>`);
  };
  ACT.clubKick = el => {
    A.openSheet(`<h2>Remove ${esc(el.dataset.name)}?</h2><p class="muted">They leave the club's board and feed. They can join again with the code.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" id="clubKickBtn" data-act="clubKickYes" data-id="${esc(el.dataset.id)}" data-u="${esc(el.dataset.u)}">Remove</button></div>`);
  };
  async function clubDo(btn, label, fn, done) {
    setBusy(btn, true, label);
    try { await fn(); A.closeSheet(); done(); } catch (e) { setBusy(btn, false); showErr(e.message); }
  }
  ACT.clubKickYes = el => clubDo('clubKickBtn', 'Removing…', () => C.clubs.removeMember(el.dataset.id, el.dataset.u), () => { refreshClub(el.dataset.id); toast('Removed'); });
  ACT.clubRename = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return;
    A.openSheet(`<h2>Rename the club</h2><input class="input" id="clubNameIn" maxlength="40" value="${esc(d.club.name)}" enterkeyhint="done"><div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="clubRenBtn" data-act="clubRenameSave" data-id="${esc(id)}">Save</button></div>`, () => { const i = $('#clubNameIn'); i.focus(); i.select(); });
  };
  ACT.clubRenameSave = el => {
    const name = (($('#clubNameIn') || {}).value || '').trim(); if (!name) { showErr('Give the club a name.'); return; }
    clubDo('clubRenBtn', 'Saving…', () => C.clubs.rename(el.dataset.id, name), () => { clubList = null; refreshClub(el.dataset.id); toast('Renamed'); });
  };
  ACT.clubLeave = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return;
    const last = d.members.length === 1;
    A.openSheet(`<h2>Leave ${esc(d.club.name)}?</h2><p class="muted">${last ? 'You are the only member, so the club is deleted.' : d.club.is_owner ? 'The club passes to the member who joined first after you.' : 'You can join again with the code.'}</p><div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" id="clubLeaveBtn" data-act="clubLeaveYes" data-id="${esc(id)}">Leave</button></div>`);
  };
  const outOfClub = msg => { clubList = null; clubListTry = 0; clubData = {}; A.reset('clubs'); toast(msg); };
  ACT.clubLeaveYes = el => clubDo('clubLeaveBtn', 'Leaving…', () => C.clubs.leave(el.dataset.id), () => outOfClub('You left the club'));
  ACT.clubDelete = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return;
    A.openSheet(`<h2>Delete ${esc(d.club.name)}?</h2><p class="muted">The club, its board and its feed are removed for all ${plural(d.members.length, 'member')}. Everyone keeps their own workouts.</p><div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" id="clubDelBtn" data-act="clubDeleteYes" data-id="${esc(id)}">Delete club</button></div>`);
  };
  ACT.clubDeleteYes = el => clubDo('clubDelBtn', 'Deleting…', () => C.clubs.remove(el.dataset.id), () => outOfClub('Club deleted'));
  ACT.clubChallenge = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return; const ch = d.challenge;
    A.openSheet(`<h2>Club challenge</h2>
      <div class="field"><label class="lbl">Name</label><input class="input" id="chTitle" maxlength="60" value="${esc(ch ? ch.title : '')}" placeholder="e.g. 30 workouts in November"></div>
      <div class="field"><label class="lbl">Count</label><select class="input" id="chMetric"><option value="workouts" ${ch && ch.metric === 'minutes' ? '' : 'selected'}>Workouts</option><option value="minutes" ${ch && ch.metric === 'minutes' ? 'selected' : ''}>Minutes in the gym</option></select></div>
      <div class="field"><label class="lbl">Target for the whole club together</label><input class="input" id="chTarget" type="number" inputmode="numeric" value="${ch ? ch.target : ''}" placeholder="e.g. 30"></div>
      <div class="field"><label class="lbl">Runs for</label><select class="input" id="chLen">${ch ? `<option value="keep" selected>Keep the same dates</option>` : ''}<option value="7">1 week from today</option><option value="14">2 weeks from today</option><option value="30" ${ch ? '' : 'selected'}>30 days from today</option></select></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="chBtn" data-act="clubChallengeSave" data-id="${esc(id)}">Save</button></div>`);
  };
  ACT.clubChallengeSave = el => {
    const id = el.dataset.id, d = clubData[ckey(id)]; if (!d) return;
    const title = $('#chTitle').value.trim(), target = Math.round(parseFloat($('#chTarget').value)), len = $('#chLen').value;
    if (!title) { showErr('Give the challenge a name.'); return; }
    if (!(target >= 1)) { showErr('Type a target, like 30.'); return; }
    let start, end;
    if (len === 'keep' && d.challenge) { start = d.challenge.start; end = d.challenge.end; }
    else { const n = new Date(), s = new Date(n.getFullYear(), n.getMonth(), n.getDate()), e = new Date(s); e.setDate(e.getDate() + (+len || 30)); start = s.toISOString(); end = e.toISOString(); }
    clubDo('chBtn', 'Saving…', () => C.clubs.setChallenge(id, { title, metric: $('#chMetric').value, target, start, end }), () => { refreshClub(id); toast('Challenge saved'); });
  };
  ACT.clubChallengeEnd = el => {
    A.openSheet(`<h2>End the challenge?</h2><p class="muted">It disappears from the club. Nobody's workouts change.</p><div class="auth-err hidden" id="authErr"></div>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" id="chEndBtn" data-act="clubChallengeEndYes" data-id="${esc(el.dataset.id)}">End it</button></div>`);
  };
  ACT.clubChallengeEndYes = el => clubDo('chEndBtn', 'Ending…', () => C.clubs.setChallenge(el.dataset.id, null), () => { refreshClub(el.dataset.id); toast('Challenge ended'); });

  document.addEventListener('input', e => { if (e.target.matches && e.target.matches('input, select')) { const x = $('#authErr'); if (x) x.classList.add('hidden'); } });

  // =====================================================================================================
  // Pictures: profile pictures and club logos. Fetched once, then kept on the phone until they change.
  // =====================================================================================================
  const picMem = {}; let picWant = { u: {}, c: {} }, picTimer = null;
  function picGet(kind, id, stamp) {
    if (!stamp || !id) return '';
    const P = M.pics || (M.pics = { u: {}, c: {} }), key = (kind === 'u' ? 'av_' : 'lg_') + id;
    if (+P[kind][id] === +stamp) { if (picMem[key] === undefined) picMem[key] = S.loadPhoto(key) || ''; if (picMem[key]) return picMem[key]; }
    if (C.signedIn() && !C.old) { picWant[kind][id] = +stamp; clearTimeout(picTimer); picTimer = setTimeout(picFetch, 80); }
    return '';
  }
  async function picFetch() {
    const w = picWant; picWant = { u: {}, c: {} };
    const us = Object.keys(w.u).slice(0, 80), cs = Object.keys(w.c).slice(0, 80);
    if ((!us.length && !cs.length) || !C.signedIn()) return;
    try {
      const r = await C.clubs.pics(us, cs), P = M.pics || (M.pics = { u: {}, c: {} }); let got = false;
      us.forEach(id => { const d = r && r.users && r.users[id]; if (d) { S.savePhoto('av_' + id, d); picMem['av_' + id] = d; P.u[id] = w.u[id]; got = true; } });
      cs.forEach(id => { const d = r && r.clubs && r.clubs[id]; if (d) { S.savePhoto('lg_' + id, d); picMem['lg_' + id] = d; P.c[id] = w.c[id]; got = true; } });
      if (got) { S.saveMeta(); soft(); }
    } catch (e) { if (e.code === 'PGRST202') C.old = true; }
  }
  function face(id, name, stamp, cls) { const d = picGet('u', id, +stamp || 0); return d ? `<span class="av img ${cls || ''}"><img src="${d}" alt=""></span>` : av(name, cls); }
  function crest(id, name, stamp, cls) { const d = picGet('c', id, +stamp || 0); return d ? `<span class="av sq img ${cls || ''}"><img src="${d}" alt=""></span>` : av(name, 'sq ' + (cls || '')); }
  // Ask for a photo and hand back a small square JPEG (the middle of the picture).
  function pickSquare(size) {
    size = size || 128;
    if (window.__pickImage) return Promise.resolve(window.__pickImage());            // tests
    return new Promise(resolve => {
      const inp = document.createElement('input'); inp.type = 'file'; inp.accept = 'image/*'; inp.style.display = 'none'; document.body.appendChild(inp);
      inp.addEventListener('change', () => {
        const f = inp.files && inp.files[0]; inp.remove(); if (!f) { resolve(null); return; }
        const url = URL.createObjectURL(f), img = new Image();
        img.onload = () => {
          const s = Math.min(img.naturalWidth, img.naturalHeight), c = document.createElement('canvas'); c.width = c.height = size;
          c.getContext('2d').drawImage(img, (img.naturalWidth - s) / 2, (img.naturalHeight - s) / 2, s, s, 0, 0, size, size);
          URL.revokeObjectURL(url); resolve(c.toDataURL('image/jpeg', 0.78));
        };
        img.onerror = () => { URL.revokeObjectURL(url); toast("That picture couldn't be opened"); resolve(null); };
        img.src = url;
      });
      inp.click();
    });
  }
  // ---- my own profile picture (Settings → Account)
  ACT.acctPic = () => {
    const p = C.profile(); if (!p) { toast('Choose your name first'); return; }
    A.openSheet(`<h2>Profile picture</h2><p class="muted mb12">Your club mates see it next to your name.</p>
      <div class="menu"><button class="btn block" data-act="acctPicPick">🖼&nbsp; Choose a photo</button>${+p.avatar_at ? `<button class="btn block" data-act="acctPicNone">✕&nbsp; Remove my picture</button>` : ''}</div>
      <div class="auth-err hidden" id="authErr"></div><button class="btn block" data-act="closeSheet">Cancel</button>`);
  };
  async function saveAvatar(pic) {
    try {
      const p = await C.setAvatar(pic), uid = C.user().id, P = M.pics || (M.pics = { u: {}, c: {} });
      if (pic) { S.savePhoto('av_' + uid, pic); picMem['av_' + uid] = pic; P.u[uid] = +p.avatar_at; } else { S.deletePhoto('av_' + uid); delete picMem['av_' + uid]; delete P.u[uid]; }
      S.saveMeta(); clubData = {}; A.closeSheet(); A.rerender(); toast(pic ? 'Picture saved' : 'Picture removed');
    } catch (e) { showErr(e.code === 'PGRST202' ? "The server needs its update first." : e.message); }
  }
  ACT.acctPicPick = async () => { const pic = await pickSquare(); if (pic) saveAvatar(pic); };
  ACT.acctPicNone = () => saveAvatar(null);

  // =====================================================================================================
  // Titles and badges, worked out from what the club already knows about a member
  // =====================================================================================================
  const TITLES = [[0, 'Newcomer'], [5, 'Regular'], [15, 'Committed'], [30, 'Iron regular'], [60, 'Machine'], [120, 'Legend']];
  const titleOf = m => { let t = TITLES[0][1]; for (const x of TITLES) if ((+m.total || 0) >= x[0]) t = x[1]; return t; };
  function badgesOf(m) {
    const b = [], vol = +m.volume_all || 0;
    if (+m.wins > 0) b.push(['🏆', `Weekly winner${+m.wins > 1 ? ' ×' + m.wins : ''}`]);
    if (+m.streak >= 2) b.push(['🔥', `${m.streak} weeks in a row`]);
    if (+m.prs_all >= 10) b.push(['🎯', `${m.prs_all} records`]);
    if (vol >= 100000) b.push(['🏋️', '100-tonne club']); else if (vol >= 25000) b.push(['🏋️', '25-tonne club']); else if (vol >= 5000) b.push(['🏋️', '5-tonne club']);
    if (m.is_owner) b.push(['⭐', 'Runs the club']);
    return b;
  }

  // =====================================================================================================
  // A club mate's page, with "you and them" side by side
  // =====================================================================================================
  let memData = {}, memErr = {}, memAt = {};
  function loadMember(u) {
    memAt[u] = Date.now();
    C.clubs.member(u, weekStart(0).toISOString()).then(d => { memData[u] = d; memErr[u] = ''; if (onView('member')) soft(); })
      .catch(e => { memErr[u] = e.message; if (onView('member')) soft(); });
  }
  function sessVol(s) { let v = 0; for (const it of (s.items || [])) { if (it.skipped) continue; const ex = S.getEx(it.ex); if (!ex || ex.track === 'time') continue; for (const x of (it.sets || [])) if (x.done) v += A.num(x.w) * A.num(x.r); } return v; }
  function myStats() {
    const ws = weekStart(0).getTime(), w4 = ws - 21 * 86400000, wk = 7 * 86400000; let week = 0, four = 0, vol4 = 0; const weeks = new Set();
    for (const s of D.sessions) {
      if (s.start >= ws) week++;
      if (s.start >= w4) { four++; vol4 += sessVol(s); }
      if (s.start < ws + wk) weeks.add(-Math.floor((s.start - ws) / wk));
    }
    let streak = 0, i = weeks.has(0) ? 0 : 1; while (weeks.has(i)) { streak++; i++; }
    return { week, four, vol4: vol4 * perKg(), streak };
  }
  function compareCard(d) {
    const me = myStats(), rows = [];
    const row = (k, a, b, fa, fb) => rows.push(`<div class="vs-row"><span class="${a > b ? 'hi' : ''}">${fa === undefined ? a : fa}</span><span class="k">${k}</span><span class="${b > a ? 'hi' : ''}">${fb === undefined ? b : fb}</span></div>`);
    row('Workouts this week', me.week, +d.week.workouts || 0);
    row('Workouts, last 4 weeks', me.four, +d.four.workouts || 0);
    row('Weight lifted, last 4 weeks', Math.round(me.vol4), Math.round(+d.four.volume || 0), big(me.vol4), big(d.four.volume));
    row('Weeks in a row', me.streak, +d.streak || 0);
    const lifts = (d.bests || []).map(b => { const ex = S.getEx(b.ex), r = ex ? A.recordsFor(b.ex).w : null; return ex && r ? { name: ex.name, mine: r.v * perKg(), theirs: +b.w } : null; }).filter(Boolean)
      .sort((a, b) => Math.max(b.mine, b.theirs) - Math.max(a.mine, a.theirs)).slice(0, 12);
    lifts.forEach(l => row(esc(l.name), Math.round(l.mine * 10), Math.round(l.theirs * 10), wt(l.mine), wt(l.theirs)));
    return `<div class="card"><h3>You and ${esc(d.name)}</h3><div class="vs-row head"><span>You</span><span class="k"></span><span>${esc(d.name)}</span></div>${rows.join('')}
      <div class="xs dim mt8">${d.share === 'all' ? (lifts.length ? 'Lifts: the heaviest weight each of you has logged, for exercises you both do.' : 'You have no exercises in common yet.') : `${esc(d.name)} doesn't share weights, so single lifts can't be compared.`} Your side uses everything on this phone.</div></div>`;
  }
  VIEWS.member = {
    refresh(p) { ACT.memberRetry({ dataset: { u: p.u } }); },
    html({ u, id }) {
      const d = memData[u], cd = id ? (clubData[ckey(id)] || clubData[id + '|0']) : null, cm = cd ? cd.members.find(m => m.user_id === u) : null;
      const name = d ? d.name : cm ? cm.name : 'Club mate';
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow" style="min-width:0"><h1 class="ellipsis" style="font-size:22px">${esc(name)}</h1><div class="sub">Club mate</div></div></div>`;
      if (!d) return h + (memErr[u] ? `<div class="card"><p class="small muted">${esc(memErr[u])}</p><button class="btn block mt12" data-act="memberRetry" data-u="${esc(u)}">Try again</button></div>` : SKEL);
      const st = { total: +d.all.workouts || 0, volume_all: +d.all.volume || 0, prs_all: +d.all.prs || 0, streak: +d.streak || 0, wins: cm ? +cm.wins || 0 : 0, is_owner: !!(cm && cm.is_owner) };
      const badges = badgesOf(st), since = new Date(d.since);
      h += `<div class="card"><div class="row">${face(u, d.name, d.avatar_at, 'xl')}<div class="grow" style="min-width:0"><div class="title ellipsis">${esc(d.name)}${d.me ? ' <span class="dim">(you)</span>' : ''}</div>
        <div class="small muted">${esc(titleOf(st))} · on GymDay since ${MON[since.getMonth()]} ${since.getFullYear()}</div></div></div>
        ${badges.length ? `<div class="badges">${badges.map(b => `<span class="pill">${b[0]} ${esc(b[1])}</span>`).join('')}</div>` : ''}</div>`;
      if (d.share === 'none') return h + `<div class="card"><p class="small muted">${d.me ? "You're" : esc(d.name) + ' is'} sharing nothing with clubs, so there is nothing more to show here.</p></div>`;
      const cell = (v, k) => `<div class="stat"><div class="v">${v}</div><div class="k">${k}</div></div>`;
      h += `<div class="card"><h3>This week</h3><div class="mstats mt8">${cell(+d.week.workouts || 0, 'workouts')}${cell(A.fmtDur(+d.week.ms || 0), 'in the gym')}${cell(big(d.week.volume), 'lifted')}</div>
        <h3 class="mt12">All shared workouts</h3><div class="mstats mt8">${cell(st.total, 'workouts')}${cell(big(st.volume_all), 'lifted')}${cell(st.prs_all, 'records')}</div></div>`;
      if (!d.me) h += compareCard(d);
      if ((d.bests || []).length) h += `<div class="card"><h3>Best lifts</h3><div class="mt8">${d.bests.slice(0, 30).map(b => { const ex = S.getEx(b.ex); return `<div class="list-item"><div class="grow small ellipsis" style="font-weight:600">${esc(ex ? ex.name : (b.name || 'Exercise'))}</div><div class="small"><b>${wt(b.w)}</b>${+b.reps ? ` <span class="muted">× ${+b.reps}</span>` : ''}</div></div>`; }).join('')}</div></div>`;
      h += `<div class="card"><h3>Latest workouts</h3><div class="mt8">${(d.recent || []).length ? d.recent.map((w, i) => { const t = new Date(w.started_at).getTime();
        return `<div class="list-item" data-act="memberWorkout" data-u="${esc(u)}" data-i="${i}"><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(w.day_name || 'Workout')}${+w.prs ? ' 🏆' : ''}</div><div class="xs muted">${A.fmtDate(t)} · ${A.fmtDur(+w.gym_ms || 0)} · ${plural(w.set_count, 'set')}${+w.volume ? ' · ' + big(w.volume) : ''}</div></div>${w.detail ? '<span class="chev">›</span>' : ''}</div>`; }).join('') : `<p class="small muted">None shared yet.</p>`}</div></div>`;
      if (window.Safety) h += window.Safety.memberCard(u, d.name, d.me);          // 1.30: report and block (the app stores ask for these)
      return h;
    },
    mount({ u }) { if (!memData[u] || Date.now() - (memAt[u] || 0) > 30000) loadMember(u); }
  };
  ACT.memberOpen = el => { const u = el.dataset.u; if (!u) return; if (!$('#sheet').classList.contains('hidden')) A.closeSheet(); A.go('member', { u, id: el.dataset.id || '' }); };
  ACT.memberRetry = el => { memErr[el.dataset.u] = ''; loadMember(el.dataset.u); A.rerender(); };
  ACT.memberWorkout = el => {
    const d = memData[el.dataset.u], w = d && d.recent[+el.dataset.i]; if (!w || !w.detail || !(w.detail.items || []).length) return;
    A.openSheet(`<h2>${esc(d.name)} · ${esc(w.day_name || 'Workout')}</h2><div class="card" style="background:var(--bg3)">${w.detail.items.map(x => `<div class="list-item"><div class="grow small" style="font-weight:600">${esc(x.name)}</div><div class="small muted" style="text-align:right">${esc(x.text)}</div></div>`).join('')}</div>
      <button class="btn block" data-act="closeSheet">Close</button>`);
  };

  // =====================================================================================================
  // What's new in my clubs (shown on the Clubs tab, with a dot on the tab while something is unread)
  // =====================================================================================================
  let news = null, newsAt = 0, newsAll = false;
  const newsT = n => new Date(n.at).getTime();
  const unread = () => (news || []).filter(n => newsT(n) > (M.newsSeen || 0)).length;
  function paintDot() {
    let d = $('#clubDot');
    if (!d) { const nb = $('.nav-btn[data-nav="clubs"]'); if (!nb) return; nb.insertAdjacentHTML('beforeend', '<i class="ndot hidden" id="clubDot"></i>'); d = $('#clubDot'); }
    d.classList.toggle('hidden', !unread());
  }
  function loadNews(force) {
    if (!C.signedIn() || !C.profile() || C.old) return;
    if (!force && Date.now() - newsAt < 60000) return;
    newsAt = Date.now();
    C.clubs.news(new Date(Date.now() - 7 * 86400000).toISOString()).then(l => { news = l || []; paintDot(); if (onView('clubs')) soft(); })
      .catch(e => { if (e.code === 'PGRST202') C.old = true; });
  }
  function newsLine(n) {
    const who = `<b>${esc(n.name)}</b>`, w = n.when ? new Date(n.when).getTime() : 0;
    switch (n.type) {
      case 'react': return `${emo(n.kind)} ${who} reacted to your ${esc(n.day_name || 'workout')}`;
      case 'comment': return `💬 ${who} on your ${esc(n.day_name || 'workout')}: “${esc(n.body)}”`;
      case 'workout': return `✅ ${who} finished ${esc(n.day_name || 'a workout')}${+n.prs ? ` · 🏆 ${plural(+n.prs, 'record')}` : ''}`;
      case 'plan': return `🏋️ ${who} is going to the gym ${dayWord(w)}, ${A.fmtClock(w)}${n.note ? ' · ' + esc(n.note) : ''} <span class="dim">(${esc(n.club)})</span>`;
      case 'join': return `🤝 ${who} is coming with you ${dayWord(w)}, ${A.fmtClock(w)}`;
      case 'member': return `👋 ${who} joined ${esc(n.club)}`;
      case 'chat': return `💬 ${who} in ${esc(n.club)}: “${esc(n.body)}”`;
      default: return who;
    }
  }
  function newsCard() {
    if (!news || !news.length) return '';
    const seen = M.newsSeen || 0;
    return `<div class="card"><div class="row"><h3 class="grow">What's new</h3>${news.length > 4 ? `<button class="btn sm ghost" data-act="newsAll">${newsAll ? 'Show less' : 'Show all ' + news.length}</button>` : ''}</div>
      <div class="mt8">${news.slice(0, newsAll ? 60 : 4).map(n => `<div class="news ${newsT(n) > seen ? 'new' : ''}"><div class="grow small">${newsLine(n)}</div><span class="xs dim">${agoShort(n.at)}</span></div>`).join('')}</div></div>`;
  }
  ACT.newsAll = () => { newsAll = !newsAll; A.rerender(); };
  function newsSeen() { if (!news || !unread()) return; M.newsSeen = Math.max(M.newsSeen || 0, ...news.map(newsT)); S.saveMeta(); paintDot(); }
  setInterval(() => { if (!document.hidden) loadNews(); }, 180000);

  // =====================================================================================================
  // "A new version is out" banner, and (for the person who looks after GymDay) telling friends about one
  // =====================================================================================================
  const APP = window.GYMDAY_APP || { code: 0, name: '' };
  function checkLatest(force) {
    if (!C.signedIn() || (!force && Date.now() - (M.latestAt || 0) < 6 * 3600000)) return;      // phone-only mode never talks to the server
    C.latest().then(v => { M.latestAt = Date.now(); M.latest = v && v.code ? { code: +v.code, name: String(v.name || ''), url: String(v.url || ''), notes: String(v.notes || '') } : null; S.saveMeta(); if (onView('days')) soft(); });
  }
  // 1.30: a copy installed from Google Play is updated by Google Play, and an iPhone by the App Store: no banner, no announcing
  const storeCopy = () => { if (window.GYMDAY_IOS) return true; try { return !!(S.isAndroid && window.Android.installer && /^com\.(android\.vending|google\.android\.feedback)$/.test(window.Android.installer() || '')); } catch (e) { return false; } };
  function banner() {
    const v = M.latest; if (storeCopy() || !v || !(v.code > APP.code) || !/^https:\/\//i.test(v.url)) return '';
    if (M.latestHide && M.latestHide.code === v.code && Date.now() - M.latestHide.at < 3 * 86400000) return '';
    return `<div class="card upd"><div class="title">GymDay ${esc(v.name)} is out</div><p class="small muted mt4">${v.notes ? esc(v.notes.replace(/[.!\s]+$/, '')) + '.' : 'A newer version than the one on this phone.'} Your workouts stay as they are when you install it.</p>
      <div class="row mt12"><button class="btn grow" data-act="updLater">Later</button><button class="btn primary grow" data-act="updGet">Get it</button></div></div>`;
  }
  ACT.updLater = () => { M.latestHide = { code: M.latest.code, at: Date.now() }; S.saveMeta(); A.rerender(); };
  ACT.updGet = () => { const u = M.latest && M.latest.url; if (!u) return; if (S.isAndroid && window.Android.openUrl) window.Android.openUrl(u); else window.open(u, '_blank'); };
  function aboutRow() {
    const p = C.profile(); if (storeCopy() || !C.signedIn() || !p || !p.admin || !APP.code) return '';
    return `<button class="btn block mt12" data-act="announceOpen">Tell friends about a new version</button>`;
  }
  ACT.announceOpen = () => {
    A.openSheet(`<h2>Tell friends about this version</h2><p class="muted mb12">Everyone on an older GymDay gets a banner with a button that opens your link. This phone has <b>${esc(APP.name)}</b>, so that is the version announced.</p>
      <div class="field"><label class="lbl">Link to the new app file (.apk)</label><input class="input" id="annUrl" inputmode="url" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="https://…" value="${esc((M.latest && M.latest.code === APP.code && M.latest.url) || '')}"></div>
      <div class="field"><label class="lbl">What is new, in a line</label><input class="input" id="annNotes" maxlength="200" placeholder="e.g. Club records and comments"></div>
      <div class="auth-err hidden" id="authErr"></div>
      <div class="row"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="annBtn" data-act="announceSave">Announce</button></div>`);
  };
  ACT.announceSave = () => {
    const url = ($('#annUrl').value || '').trim(), notes = ($('#annNotes').value || '').trim();
    if (!/^https:\/\/\S+$/i.test(url)) { showErr('Paste a link that starts with https://'); return; }
    clubDo('annBtn', 'Saving…', () => C.setLatest(APP.code, APP.name, url, notes), () => { M.latestAt = 0; checkLatest(true); toast('Announced'); });
  };

  // =====================================================================================================
  // Keep the screens in step with the account
  // =====================================================================================================
  C.on(ev => {
    if (ev === 'status') { const l = $('#syncLine'); if (l) l.innerHTML = syncLine(); }
    else if (ev === 'data' || ev === 'photos') soft();
    else if (ev === 'auth') {
      if (!C.signedIn()) { clubList = null; clubData = {}; memData = {}; chatData = {}; chatDraft = {}; news = null; paintDot(); }
      else if (C.profile()) loadNews();
      if (['settings', 'setPage', 'clubs'].includes(A.top().name)) soft();
    }
  });
  setInterval(() => { const l = $('#syncLine'); if (l && C.state.status === 'ok') l.innerHTML = syncLine(); }, 30000);

  window.CloudUI = { settingsCard, accountPage, banner, aboutRow, feedAt: i => { const d = curClub(); return d && d.feed ? d.feed[+i] || null : null; } };      // v1.28: feedAt for "Do this workout"
  A.boot(C.configured && !M.welcomed && !C.signedIn() ? 'welcome' : null);
  C.start();
  paintDot(); setTimeout(() => { loadNews(); checkLatest(); }, 1500);
  const resume1 = window.appResume; window.appResume = () => { if (resume1) resume1(); loadNews(); checkLatest(); };
  // opened by an invite link while the app was closed
  try { const c = S.isAndroid && window.Android.pendingJoin ? window.Android.pendingJoin() : ''; if (c) setTimeout(() => window.onJoinLink(c), 600); } catch (e) { }
  // ============================================================== training now (v1.7)
  // While a workout is running the app tells the server every few minutes; club mates see "training now" next to the name.
  // The server forgets it 20 minutes after the last word, so a phone that dies mid-workout does not stay "training" for ever.
  // Off with one switch in Settings, and never sent by someone who shares nothing with clubs.
  let liveList = null, liveAt = 0, liveOld = false, liveBusy = false;
  const liveOn = () => D.settings.live !== false;
  function loadLive(force) {
    if (liveOld || liveBusy || !C.signedIn() || !C.profile()) return;
    if (!force && liveList && Date.now() - liveAt < 30000) return;
    liveBusy = true;
    C.liveNow().then(l => { const was = JSON.stringify(liveList); liveList = Array.isArray(l) ? l : []; liveAt = Date.now(); if (JSON.stringify(liveList) !== was && (onView('clubs') || onView('club'))) soft(); })
      .catch(e => { if (e && e.code === 'PGRST202') liveOld = true; })                 // a server that has not had its v1.7 update: the feature just stays hidden
      .then(() => { liveBusy = false; });
  }
  const liveIn = id => (liveList || []).filter(x => x.club_id === id);
  const sinceMin = t => Math.max(0, Math.round((Date.now() - new Date(t).getTime()) / 60000));
  function liveLine(id) {
    const l = liveIn(id); if (!l.length) return '';
    const who = l.map(x => (x.me ? 'You' : x.name));
    return `<div class="live-line mt8"><i class="live-dot"></i>${esc(who.length > 2 ? `${who[0]}, ${who[1]} and ${who.length - 2} more` : who.join(' and '))} ${l.length === 1 && !l[0].me ? 'is' : 'are'} training now</div>`;
  }
  function liveStrip(id) {
    const l = liveIn(id); if (!l.length) return '';
    return `<div class="card" id="liveCard"><div class="k2"><i class="live-dot"></i>Training now</div>${l.map(x => `<div class="list-item ${x.me ? '' : 'tap'}" ${x.me ? '' : `data-act="memberOpen" data-u="${esc(x.user_id)}" data-id="${esc(id)}"`}>${av(x.name)}<div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${x.me ? 'You' : esc(x.name)}</div>
      <div class="xs muted ellipsis">${x.day ? esc(x.day) + ' · ' : ''}${sinceMin(x.since) < 1 ? 'just started' : sinceMin(x.since) + ' min in'}</div></div></div>`).join('')}</div>`;
  }
  let beatState = null, beatAt = 0;
  function liveBeat() {
    if (liveOld || !C.configured || !C.signedIn() || !C.profile()) return;
    const want = !!D.active && liveOn() && C.profile().share !== 'none', now = Date.now();
    if (beatState === null && !want) { beatState = false; return; }             // nothing running when the app opened: nothing to say
    if (want === beatState && (!want || now - beatAt < 240000)) return;
    beatState = want; beatAt = now;
    C.live(want, want ? (D.active.dayName || '') : '').then(() => { if (liveList) loadLive(true); })
      .catch(e => { if (e && e.code === 'PGRST202') liveOld = true; else beatState = null; });       // try again at the next chance
  }
  setInterval(liveBeat, 60000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) liveBeat(); });
  const after0 = A.afterRender;
  A.afterRender = name => { if (after0) after0(name); liveBeat(); };
  window.SettingsRows = window.SettingsRows || [];
  window.SettingsRows.push(() => (C.configured && C.signedIn() ? `<div class="row" style="padding:6px 0"><div class="grow">Show my clubs when I'm training<div class="xs dim">A “training now” mark next to your name while a workout is running</div></div><input type="checkbox" data-bind="optLive" ${liveOn() ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optLive') { D.settings.live = t.checked; S.save(); liveBeat(); } });
  // 1.35.2: reading by AI, said plainly and switched off here (then GymDay asks again before reading anything)
  window.SettingsRows.push(() => (C.configured && C.aiOk ? `<div class="row" style="padding:6px 0"><div class="grow">Let AI read photos<div class="xs dim">The photos, screenshots and food names you choose are read on GymDay's server by Claude, an AI made by Anthropic. Off: GymDay asks first.</div></div><input type="checkbox" data-bind="optAi" ${C.aiOk() ? 'checked' : ''} style="width:22px;height:22px"></div>` : ''));
  document.addEventListener('change', e => { const t = e.target; if (t && t.dataset && t.dataset.bind === 'optAi') { C.aiSet(t.checked); toast(t.checked ? 'AI reading is on' : 'AI reading is off: GymDay asks before reading anything'); } });

  // an invite link that is still waiting (tapped before signing in, or before the app had started): ask once the person is in
  let joinShown = '';
  const after1 = A.afterRender;
  A.afterRender = name => {
    if (after1) after1(name);
    const code = M.pendingJoin;
    if (code && code !== joinShown && C.signedIn() && C.profile() && !(VIEWS[name] || {}).noNav && $('#sheet').classList.contains('hidden')) { joinShown = code; joinAsk(code); }
  };
  if (M.pendingJoin) setTimeout(() => A.afterRender(A.top().name), 1200);
})();
