/* GymDay 1.30 – what the app stores ask of an app where people post things (club chat, comments, names, pictures, club names):
   anything can be reported, a person can be blocked, the club rules are agreed to before joining, and words others may find
   offensive are masked. An AI answer can be reported too (Google Play asks that of apps that use AI). Reports go to the person
   who looks after GymDay, who sees them in Settings → Account → Reports and can take a message down or take someone out of a club.
   Blocking hides that person's messages, comments and workouts from you; they are not told. Needs server v1.8; until the
   server has it, a report waits on this phone and blocking works on this phone only. */
(function () {
  'use strict';
  const A = window.App, S = window.Store, C = window.Cloud;
  if (!A || !S) return;
  const { esc, ACT, VIEWS, $ } = A, M = S.meta, toast = m => window.toast(m);
  const signedIn = () => !!(C && C.configured && C.signedIn && C.signedIn());

  // ---------------- words masked in what people write (chat and comments), both ways
  const BAD = ['fuck', 'fucking', 'fucker', 'fucked', 'motherfucker', 'shit', 'bullshit', 'bitch', 'bastard', 'asshole', 'arsehole', 'dickhead',
    'cunt', 'slut', 'whore', 'nigger', 'nigga', 'faggot', 'fag', 'retard', 'chutiya', 'chutiye', 'madarchod', 'behenchod', 'bhenchod', 'bhosdike',
    'bhosdi', 'randi', 'gandu', 'gaandu', 'lauda', 'lavda', 'lund', 'harami', 'kamina', 'kutiya'];
  const RE = new RegExp('\\b(' + BAD.join('|') + ')\\b', 'gi');
  const clean = t => String(t == null ? '' : t).replace(RE, w => w[0] + '*'.repeat(Math.max(2, w.length - 1)));

  // ---------------- people blocked: { id: name }, on this phone and (server v1.8) in the account
  const blocked = () => (M.blocked && typeof M.blocked === 'object' ? M.blocked : (M.blocked = {}));
  const isBlocked = id => !!(id && blocked()[id]);
  function setBlocked(list) {
    if (!Array.isArray(list)) return;
    const o = {}; list.forEach(b => { if (b && b.user_id) o[b.user_id] = String(b.name || 'Someone'); });
    M.blocked = o; S.saveMeta();
  }
  const missing = e => !!(e && (e.code === 'PGRST202' || /Could not find the function/i.test(e.message || '')));

  // What comes from the account is filtered on the way in (a blocked person's messages, comments, news and workouts), and what
  // this phone writes is masked on the way out.
  if (C && C.clubs) {
    const K = C.clubs;
    const msgs = r => { if (r && Array.isArray(r.messages)) r.messages = r.messages.filter(m => !isBlocked(m.user_id)).map(m => Object.assign(m, { body: clean(m.body) })); return r; };
    const list = l => (Array.isArray(l) ? l.filter(c => !isBlocked(c.user_id)).map(c => Object.assign(c, { body: clean(c.body) })) : l);
    const news = l => (Array.isArray(l) ? l.filter(n => !isBlocked(n.user_id)).map(n => (n.body ? Object.assign(n, { body: clean(n.body) }) : n)) : l);
    const club = d => { if (d && Array.isArray(d.feed)) d.feed = d.feed.filter(f => !isBlocked(f.owner_id)); return d; };
    const wrap = (name, after, before) => {
      const f = K[name]; if (typeof f !== 'function') return;
      K[name] = (...a) => { if (before) a = before(a); return Promise.resolve(f(...a)).then(after); };
    };
    wrap('chat', msgs); wrap('chatSend', msgs, a => [a[0], clean(a[1])]); wrap('chatDelete', msgs);
    wrap('comments', list); wrap('comment', list, a => [a[0], a[1], clean(a[2])]); wrap('deleteComment', list);
    wrap('news', news); wrap('get', club);
  }

  // ---------------- reporting
  const REASONS = {
    message: ['Bullying or harassment', 'Hate or offensive words', 'Sexual or violent', 'Spam', 'Something else'],
    comment: ['Bullying or harassment', 'Hate or offensive words', 'Sexual or violent', 'Spam', 'Something else'],
    user: ['Bullying or harassment', 'Offensive name or picture', 'Pretending to be someone', 'Spam', 'Something else'],
    club: ['Offensive name, logo or description', 'Spam', 'Something else'],
    ai: ['Wrong or made up', 'Offensive or harmful', 'Something else'],
  };
  let rep = null;
  function repSheet() {
    const k = rep.k, opts = REASONS[k] || REASONS.user;
    const title = k === 'ai' ? 'Report this AI answer' : k === 'club' ? 'Report this club' : k === 'user' ? `Report ${esc(rep.name || 'this person')}` : k === 'comment' ? 'Report this comment' : 'Report this message';
    const canBlock = (k === 'message' || k === 'comment' || k === 'user') && rep.user && !isBlocked(rep.user);
    A.openSheet(`<h2>${title}</h2>${rep.body && k !== 'ai' ? `<div class="card small muted" style="margin:8px 0 4px">“${esc(rep.body.slice(0, 200))}”</div>` : ''}
      <p class="small muted">${k === 'ai' ? 'What is wrong with what the AI said?' : 'What is wrong?'}</p>
      ${opts.map(o => `<div class="opt ${rep.pick === o ? 'on' : ''}" data-act="ugcPick" data-v="${esc(o)}" role="radio" aria-checked="${rep.pick === o}"><div class="rd"></div><div class="grow title">${esc(o)}</div></div>`).join('')}
      <div class="field mt12"><label class="lbl" for="ugcNote">More detail (if you like)</label><textarea class="input" id="ugcNote" maxlength="500" rows="2">${esc(rep.note || '')}</textarea></div>
      ${canBlock ? `<label class="row tap mt8" style="gap:10px"><input type="checkbox" id="ugcAlsoBlock" ${rep.also ? 'checked' : ''}><span class="small">Also block ${esc(rep.name || 'them')}</span></label>` : ''}
      <p class="xs dim mt8">${k === 'ai' ? 'It goes to the person who looks after GymDay, with what the AI said, to make the AI better.' : 'It goes to the person who looks after GymDay, who can take it down and remove people who break the club rules. Nobody else is told who reported.'}</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn primary grow" id="ugcSend" data-act="ugcSend" ${rep.pick ? '' : 'disabled'}>Send report</button></div>`);
  }
  ACT.ugcReport = el => {
    const d = el.dataset || {};
    if (!signedIn()) { toast('Sign in to send a report'); return; }
    rep = { k: d.k || 'user', club: d.id || '', user: d.u || '', item: d.m || '', name: d.n || '', body: d.b || '', pick: '', note: '', also: true };
    repSheet();
  };
  ACT.ugcPick = el => { if (!rep) return; const n = $('#ugcNote'), b = $('#ugcAlsoBlock'); rep.note = n ? n.value : rep.note; rep.also = b ? b.checked : rep.also; rep.pick = el.dataset.v; repSheet(); };
  async function sendOne(r) {
    await C.clubs.report(r.k, r.club || null, r.user || null, r.item || null, r.pick, r.note || '', r.body || '');
  }
  ACT.ugcSend = async () => {
    if (!rep || !rep.pick) return;
    const n = $('#ugcNote'), b = $('#ugcAlsoBlock'), btn = $('#ugcSend');
    rep.note = n ? n.value.trim().slice(0, 500) : ''; const also = !!(b && b.checked);
    const r = rep; if (btn) { btn.disabled = true; btn.textContent = 'Sending…'; }
    let queued = false;
    try { await sendOne(r); }
    catch (e) {
      if (missing(e) || e.offline || /fetch|network|offline/i.test(e.message || '')) { queued = true; M.reportQ = (Array.isArray(M.reportQ) ? M.reportQ : []).concat([r]).slice(-30); S.saveMeta(); }
      else { if (btn) { btn.disabled = false; btn.textContent = 'Send report'; } toast(e.message || 'Could not send the report'); return; }
    }
    rep = null; A.closeSheet();
    if (also && r.user) await block(r.user, r.name);
    toast(queued ? 'Thanks. Your report is kept and goes as soon as it can.' : 'Thanks for telling us. It will be looked at.');
  };
  async function flushReports() {
    const q = Array.isArray(M.reportQ) ? M.reportQ.slice() : []; if (!q.length || !signedIn()) return;
    const left = [];
    for (const r of q) { try { await sendOne(r); } catch (e) { left.push(r); } }
    M.reportQ = left; S.saveMeta();
  }

  // ---------------- blocking
  async function block(id, name) {
    blocked()[id] = String(name || 'Someone'); S.saveMeta();
    try { setBlocked(await C.clubs.block(id, true)); } catch (e) { /* kept on this phone; the account gets it once the server has v1.8 */ }
    A.rerender();
  }
  ACT.ugcBlock = el => {
    const d = el.dataset;
    A.openSheet(`<h2>Block ${esc(d.n || 'this person')}?</h2><p class="muted">You won't see their messages, comments or workouts in your clubs. They are not told. You can unblock them in Settings → Account.</p>
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Cancel</button><button class="btn danger grow" data-act="ugcBlockYes" data-u="${esc(d.u)}" data-n="${esc(d.n || '')}">Block</button></div>`);
  };
  ACT.ugcBlockYes = async el => { A.closeSheet(); await block(el.dataset.u, el.dataset.n); toast('Blocked'); };
  ACT.ugcUnblock = async el => {
    const id = el.dataset.u; delete blocked()[id]; S.saveMeta();
    try { setBlocked(await C.clubs.block(id, false)); } catch (e) { }
    toast('Unblocked. Their messages show again the next time the club loads.');
    if (!$('#sheet').classList.contains('hidden') && $('#ugcBlocked')) ACT.ugcBlockedList(); else A.rerender();
  };
  ACT.ugcBlockedList = () => {
    const b = blocked(), ids = Object.keys(b);
    A.openSheet(`<h2>Blocked people</h2><div id="ugcBlocked">${ids.length ? ids.map(id => `<div class="list-item"><div class="grow small" style="font-weight:600">${esc(b[id])}</div><button class="btn sm" data-act="ugcUnblock" data-u="${esc(id)}">Unblock</button></div>`).join('') : '<p class="small muted">Nobody.</p>'}</div>
      <button class="btn block mt16" data-act="closeSheet">Done</button>`);
  };

  // ---------------- the club rules, agreed to once before joining, starting or opening a club
  const RULES = `<ol class="small" style="padding-left:20px;line-height:1.55;margin:10px 0">
      <li>Be kind. No bullying, threats or hate.</li><li>No sexual or violent content, and nothing illegal.</li>
      <li>Use your own name, and pictures of yourself or your gym.</li><li>Report anything that breaks these rules: “report” on a message, ⚑ on a comment, or Report on a person's page.</li></ol>
    <p class="xs dim">Reports go to the person who looks after GymDay, who can take things down and take people out of clubs. Anyone who keeps breaking these rules can lose their account.</p>`;
  let after = null;
  const rulesOk = () => !!M.rulesOk;
  function rules(then) {
    after = then;
    A.openSheet(`<h2>Club rules</h2><p class="muted">Clubs are for training together. To use them, agree to these:</p>${RULES}
      <div class="row mt16"><button class="btn grow" data-act="closeSheet">Not now</button><button class="btn primary grow" data-act="ugcRulesOk">I agree</button></div>`);
  }
  ACT.ugcRulesOk = () => { M.rulesOk = Date.now(); S.saveMeta(); A.closeSheet(); const t = after; after = null; if (t) setTimeout(t, 60); };
  ACT.ugcRules = () => A.openSheet(`<h2>Club rules</h2>${RULES}<p class="xs dim mt8"><span class="accent" role="button" data-act="privacyOpen">Privacy policy</span></p><button class="btn block mt16" data-act="closeSheet">Done</button>`);
  ['clubNew', 'clubJoin', 'joinLinkGo', 'clubOpen'].forEach(k => {
    const f = ACT[k]; if (typeof f !== 'function') return;
    ACT[k] = el => (rulesOk() || !signedIn() ? f(el) : rules(() => f(el)));         // signed out, the button goes to sign-in first, as before
  });

  // ---------------- the person who looks after GymDay: the open reports
  let reps = null, repsErr = '', repsAt = 0, repsBusy = false;
  const isAdmin = () => { try { const p = C && C.profile && C.profile(); return !!(p && p.admin); } catch (e) { return false; } };
  function loadReps() {
    if (repsBusy) return; repsBusy = true; repsAt = Date.now();
    const done = () => { repsBusy = false; if (A.top && A.top().name === 'reports') A.rerender(); };
    C.clubs.reports().then(l => { reps = Array.isArray(l) ? l : []; repsErr = ''; done(); })
      .catch(e => { repsErr = missing(e) ? 'The GymDay server needs its v1.8 update first (gymday-update-v1.8.sql).' : e.message; done(); });
  }
  const KIND = { message: 'Chat message', comment: 'Comment', user: 'Person', club: 'Club', ai: 'AI answer' };
  VIEWS.reports = {
    refresh() { loadReps(); },
    html() {
      let h = `<div class="top"><button class="back" data-act="back">‹</button><div class="grow"><h1>Reports</h1><div class="sub">What people reported, oldest at the bottom</div></div></div>`;
      if (repsErr) return h + `<div class="card"><p class="small muted">${esc(repsErr)}</p><button class="btn sm mt12" data-act="repAgain">Try again</button></div>`;
      if (!reps) return h + `<div class="card"><p class="small muted">Loading…</p></div>`;
      if (!reps.length) return h + `<div class="card"><p class="small muted">Nothing to look at. 🎉</p></div>`;
      return h + reps.map(r => {
        const t = new Date(r.at), i = `data-r="${esc(r.id)}"`;
        const canDel = (r.kind === 'message' || r.kind === 'comment') && r.item_id && !r.gone, canRemove = !!(r.club_id && r.user_id);
        return `<div class="card"><div class="xs muted">${esc(KIND[r.kind] || r.kind)} · ${A.fmtDate(t.getTime())}, ${A.fmtClock(t.getTime())} · from ${esc(r.by || 'someone')}</div>
          <div class="title mt4">${esc(r.reason)}</div>
          ${r.user ? `<div class="small">About: <b>${esc(r.user)}</b>${r.club ? ` in ${esc(r.club)}` : ''}</div>` : r.club ? `<div class="small">Club: <b>${esc(r.club)}</b></div>` : ''}
          ${r.body ? `<div class="small muted mt8" style="white-space:pre-wrap">“${esc(r.body)}”${r.gone ? ' <span class="xs dim">(already taken down)</span>' : ''}</div>` : ''}
          ${r.note ? `<div class="xs mt8">Their note: ${esc(r.note)}</div>` : ''}
          <div class="row mt12" style="flex-wrap:wrap;gap:8px">${canDel ? `<button class="btn sm" data-act="repDo" data-a="delete" ${i}>Take it down</button>` : ''}${canRemove ? `<button class="btn sm" data-act="repDo" data-a="remove" ${i}>Remove from club</button>` : ''}${canDel && canRemove ? `<button class="btn sm danger" data-act="repDo" data-a="both" ${i}>Both</button>` : ''}<button class="btn sm ghost" data-act="repDo" data-a="none" ${i}>Nothing wrong</button></div></div>`;
      }).join('');
    },
    mount() { if ((!reps && !repsErr) || Date.now() - repsAt > 60000) loadReps(); }        // each draw mounts again: load at most once a minute (1.35.2: a failed load waits for Try again, it no longer loops)
  };
  ACT.repDo = async el => { el.disabled = true; try { reps = await C.clubs.reportDone(el.dataset.r, el.dataset.a); toast('Done'); A.rerender(); } catch (e) { el.disabled = false; toast(e.message); } };
  ACT.repOpen = () => A.go('reports');
  ACT.repAgain = () => { repsErr = ''; reps = null; repsAt = 0; A.rerender(); };

  // ---------------- pieces the other screens put in
  window.Safety = {
    clean, isBlocked, blocked, rulesOk,
    /** ⚑ on a chat message or comment that is not your own */
    msgLink: (kind, m, clubId) => `<span class="ugc-rep" role="button" data-act="ugcReport" data-k="${kind}" data-m="${esc(m.id)}" data-id="${esc(clubId || '')}" data-u="${esc(m.user_id)}" data-n="${esc(m.name || '')}" data-b="${esc(String(m.body || '').slice(0, 300))}">report</span>`,
    /** Report and Block on a club mate's page */
    memberCard: (u, name, me) => (me || !u ? '' : `<div class="card"><h3>Safety</h3><div class="row mt8" style="gap:8px"><button class="btn grow" data-act="ugcReport" data-k="user" data-u="${esc(u)}" data-n="${esc(name)}">⚑ Report</button>${isBlocked(u)
      ? `<button class="btn grow" data-act="ugcUnblock" data-u="${esc(u)}">Unblock</button>` : `<button class="btn danger grow" data-act="ugcBlock" data-u="${esc(u)}" data-n="${esc(name)}">Block</button>`}</div>
      <p class="xs dim mt8">Blocking hides their messages, comments and workouts from you. They are not told. <span class="accent" role="button" data-act="ugcRules">Club rules</span></p></div>`),
    /** Report this club (in the club's ⋯ menu, for people who don't run it) */
    clubButton: id => `<button class="btn block" data-act="ugcReport" data-k="club" data-id="${esc(id)}">⚑&nbsp; Report this club</button>`,
    /** the rows on the Account page: blocked people, and Reports for the person who looks after GymDay */
    accountRows: K => {
      const n = Object.keys(blocked()).length, rows = [];
      rows.push(`<div class="row tap" data-act="ugcBlockedList">${K ? K.tile('user') : ''}<div class="grow">Blocked people<div class="xs dim">${n ? n + (n === 1 ? ' person' : ' people') : 'Nobody'}</div></div><span class="chev">›</span></div>`);
      rows.push(`<div class="row tap" data-act="ugcRules">${K ? K.tile('info') : ''}<div class="grow">Club rules</div><span class="chev">›</span></div>`);
      if (isAdmin()) rows.push(`<div class="row tap" data-act="repOpen">${K ? K.tile('warn') : ''}<div class="grow">Reports<div class="xs dim">What people reported in clubs and about AI answers</div></div><span class="chev">›</span></div>`);
      return `<div class="card set-card"><h3>Safety</h3>${rows.join('')}</div>`;
    },
    /** "Report this AI answer" under an AI result; body = what the AI said, in short */
    aiLink: (what, body) => `<p class="xs dim mt8"><span class="accent" role="button" data-act="ugcReport" data-k="ai" data-n="${esc(what)}" data-b="${esc((what + ': ' + String(body || '')).slice(0, 500))}">⚑ Report this AI answer</span></p>`,
  };

  // once signed in: the blocked list from the account, and any report still waiting
  function sync() { if (!signedIn()) return; C.clubs.blocks().then(setBlocked).catch(() => { }); flushReports(); }
  setTimeout(sync, 5000);
  if (C && C.on) C.on(ev => { if (ev === 'auth') setTimeout(sync, 800); });
})();
