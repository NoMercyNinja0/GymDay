/* GymDay 1.23 · Recently deleted (bin.js).
   Anything deleted on this phone (a workout, a food, a day, a weigh-in, an activity, a recipe…) is kept for 30 days and can
   be put back, even after the Undo message has gone. Settings → Backup & export → Recently deleted.
   The store fills the bin at save time (store.js: Store.bin); it is kept on this phone only (Store.meta.bin) and never
   holds what a sync, a restored backup or "Delete all my data" removed. Photos are not kept. */
(function () {
  const A = window.App, S = window.Store;
  if (!A || !S.bin) return;
  const { $, esc, ACT, VIEWS } = A, D = S.data;
  const n0 = v => Math.round(v || 0).toLocaleString('en-US');
  const MEAL = { b: 'Breakfast', ms: 'Morning snack', l: 'Lunch', es: 'Evening snack', d: 'Dinner' };
  const day = t => { const d0 = new Date().setHours(0, 0, 0, 0), x = new Date(t).setHours(0, 0, 0, 0); return x === d0 ? 'today' : x === d0 - 86400000 ? 'yesterday' : A.fmtDate(t); };
  const KINDS = {
    's:': ['🏋', 'Workout', r => `${r.dayName || 'Workout'}`, r => `${A.fmtDate(r.start)} · ${(n => `${n} set${n === 1 ? '' : 's'}`)((r.items || []).reduce((n, it) => n + (it.skipped ? 0 : (it.sets || []).filter(x => x.done).length), 0))}`],
    'd:': ['🗓', 'Day', r => r.name || 'A day', r => `${(r.items || []).length} exercise${(r.items || []).length === 1 ? '' : 's'}`],
    'f:': ['🍽', 'Food', r => r.name || 'A food', r => `${r.src === 'left' ? 'leftovers' : n0(r.kcal) + ' kcal'}${MEAL[r.meal] ? ' · ' + MEAL[r.meal].toLowerCase() : ''} · ${day(r.t)}`],
    'b:': ['⚖', 'Body weight', r => `${A.fmtW(r.kg)} ${A.unit()}`, r => A.fmtDate(r.t)],
    'm:': ['📏', 'Measurement', r => `${r.site || 'Measurement'} ${A.fmtW(r.v)}`, r => A.fmtDate(r.t)],
    'p:': ['🏃', 'Activity', r => (window.Sports && window.Sports.nameOf ? window.Sports.nameOf(r) : r.name || 'Activity'), r => `${n0(r.mins)} min · ${day(r.t)}`],
    'y:': ['🥣', 'My food', r => r.name || 'A food of yours', r => `${n0(r.kcal)} kcal${r.per ? ' · ' + r.per : ''}`],
    'r:': ['🍲', 'Recipe', r => r.name || 'A recipe', r => `${(r.items || []).length} ingredient${(r.items || []).length === 1 ? '' : 's'}`],
    'n:': ['💊', 'Pinned supplement', r => [r.brand, r.name].filter(Boolean).join(' ') || 'A supplement', () => 'your protein or creatine'],
    'q:': ['💊', 'Supplement schedule', r => (r.own && (r.own.n || r.own.b)) || 'A supplement you take', () => 'its schedule'],
    'w:': ['📍', 'Restaurant', r => r.name || 'A place', r => `${(r.items || []).length} dish${(r.items || []).length === 1 ? '' : 'es'} kept`],
    'a:': ['⌚', 'Day from your watch', () => 'Your watch\'s numbers', r => (r.id ? String(r.id).replace(/^act-(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1') : '')],
    'z:': ['😴', 'Sleep & heart', () => 'A night\'s numbers', r => (r.id ? String(r.id).replace(/^chk-(\d{4})(\d{2})(\d{2})$/, '$3/$2/$1') : '')],
    'c:': ['✚', 'Your own exercise', r => r.name || 'An exercise', r => r.group || ''],
  };
  const parse = b => { try { return JSON.parse(b.j); } catch (e) { return null; } };
  const idOf = b => b.k + '@' + b.at;
  const ago = t => { const m = Math.max(0, Math.round((Date.now() - t) / 60000)); return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} day${Math.round(m / 1440) === 1 ? '' : 's'} ago`; };
  const left = t => { const d = Math.max(0, Math.ceil((t + S.bin.DAYS * 86400000 - Date.now()) / 86400000)); return d <= 1 ? 'goes tomorrow' : `kept ${d} more days`; };
  function items() {
    return S.bin.list().map(b => { const r = parse(b), K = KINDS[b.k.slice(0, 2)]; return r && K ? { b, r, K, id: idOf(b) } : null; }).filter(Boolean).sort((x, y) => y.b.at - x.b.at);
  }
  const count = () => items().length;

  VIEWS.bin = {
    html() {
      const list = items();
      let h = `<div class="top"><button class="back" data-act="back" aria-label="Back">‹</button><div class="grow"><h1>Recently deleted</h1><div class="sub">Kept on this phone for ${S.bin.DAYS} days, then gone for good</div></div></div>`;
      if (!list.length) return h + `<div class="empty"><div class="big">🗑</div><p>Nothing here.</p><p class="small muted mt8">When you delete a workout, a food, a day, a weigh-in or an activity, it waits here for ${S.bin.DAYS} days in case you want it back.</p></div>`;
      // things deleted in the same moment (a cleared meal, a day's food) stay together
      const groups = []; list.forEach(x => { const g = groups[groups.length - 1]; if (g && g.at === x.b.at) g.rows.push(x); else groups.push({ at: x.b.at, rows: [x] }); });
      h += groups.map(g => `<div class="card bin-g"><div class="row bin-h"><span class="xs muted grow">Deleted ${ago(g.at)} · ${left(g.at)}</span>${g.rows.length > 1 ? `<button class="btn sm" data-act="binAll" data-at="${g.at}">Put all ${g.rows.length} back</button>` : ''}</div>
        ${g.rows.map(x => `<div class="list-item bin-it"><span class="find-ic" aria-hidden="true">${x.K[0]}</span><div class="grow" style="min-width:0"><div class="small ellipsis" style="font-weight:600">${esc(x.K[2](x.r))}</div><div class="xs muted ellipsis">${esc(x.K[1])}${x.K[3](x.r) ? ' · ' + esc(x.K[3](x.r)) : ''}</div></div><button class="btn sm primary" data-act="binBack" data-id="${esc(x.id)}">Put back</button></div>`).join('')}</div>`).join('');
      return h + `<p class="xs dim" style="text-align:center;margin:14px 0 8px">Photos are not kept. Putting something back also brings it back on your other phones.</p><button class="btn ghost block" data-act="binEmpty">Empty this list now</button>`;
    }
  };
  const done = (n, what) => { A.rerender(); window.toast(n ? `Put back: ${what}` : 'It is already back'); };
  ACT.binOpen = () => { A.closeSheet(); if (A.top().name === 'bin') A.rerender(); else A.go('bin'); };
  ACT.binBack = el => { const x = items().find(i => i.id === el.dataset.id); if (!x) return; done(S.bin.restore([x.id]), x.K[2](x.r)); };
  ACT.binAll = el => { const rows = items().filter(i => String(i.b.at) === el.dataset.at); if (!rows.length) return; done(S.bin.restore(rows.map(r => r.id)), `${rows.length} things`); };
  ACT.binEmpty = el => {
    if (el.dataset.sure !== '1') { el.dataset.sure = '1'; el.textContent = 'Tap again to empty it for good'; el.classList.add('red'); return; }
    S.bin.empty(); A.rerender(); window.toast('Emptied');
  };
  // its row on Settings → Backup & export
  const row = () => `<div class="card set-card set-list"><div class="list-item set-nav tap" data-act="binOpen">${window.SetKit ? window.SetKit.tile('trash') : '<span class="set-ic">🗑</span>'}<div class="grow"><div class="set-t">Recently deleted${count() ? ` (${count()})` : ''}</div><div class="xs dim">Put back a workout, food, day or weigh-in deleted in the last ${S.bin.DAYS} days</div></div><span class="chev">›</span></div></div>`;
  const page0 = VIEWS.setPage.html;
  VIEWS.setPage.html = function (p) { const h = page0.call(this, p); return p && p.p === 'data' ? h.replace('<div class="card set-danger">', row() + '<div class="card set-danger">') : h; };

  window.Bin = { items, count };
})();
