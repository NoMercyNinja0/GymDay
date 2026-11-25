// Exercises the SQL through the stand-in server exactly as the app will: sign-up, sync, clubs, cheers, challenge, deletion.
const { createMock } = require('./server');
const assert = require('assert');
(async () => {
  const m = await createMock();
  const H = t => Object.assign({ apikey: 'k', 'content-type': 'application/json' }, t ? { authorization: 'Bearer ' + t } : {});
  const post = async (p, body, t) => { const r = await fetch(m.url + p, { method: 'POST', headers: H(t), body: JSON.stringify(body || {}) }); const tx = await r.text(); return { status: r.status, body: tx ? JSON.parse(tx) : null }; };
  const rpc = async (fn, args, t) => { const r = await post('/rest/v1/rpc/' + fn, args, t); if (r.status !== 200) throw Object.assign(new Error(r.body && r.body.message), { status: r.status }); return r.body; };
  const fails = async (fn, args, t, re) => { try { await rpc(fn, args, t); } catch (e) { assert.match(e.message, re, e.message); return e; } assert.fail(fn + ' should have failed'); };
  const code = async email => (await post('/__test/code', { email })).body.code;
  const signin = async email => { assert.equal((await post('/auth/v1/otp', { email, create_user: true })).status, 200); const r = await post('/auth/v1/verify', { type: 'email', email, token: await code(email) }); assert.equal(r.status, 200, JSON.stringify(r.body)); return r.body; };
  const signup = async (email, name) => { const b = await signin(email); await rpc('gd_set_profile', { p_name: name }, b.access_token); return { t: b.access_token, id: b.user.id, rt: b.refresh_token }; };

  // --- auth basics
  assert.equal((await post('/auth/v1/otp', { email: 'bad' })).status, 422);
  await post('/auth/v1/otp', { email: 'a@x.io' }); assert.equal((await post('/auth/v1/verify', { type: 'email', email: 'a@x.io', token: '000000x' })).body.error_code, 'otp_expired', 'a wrong code is refused');
  const A = await signup('a@x.io', 'Anba'), B = await signup('b@x.io', 'Bala'), C = await signup('c@x.io', 'Chitra');
  const again = await signin('A@x.io'); assert.equal(again.user.id, A.id, 'signing in again reaches the same account'); assert.equal((await rpc('gd_profile', {}, again.access_token)).name, 'Anba');
  assert.equal((await post('/auth/v1/verify', { type: 'email', email: 'a@x.io', token: '123456' })).status, 403, 'a code works once');
  assert.equal(await rpc('gd_rev', {}, A.t), 0);
  await post('/__test/limit', { on: true }); assert.equal((await post('/auth/v1/otp', { email: 'z@x.io' })).body.error_code, 'over_email_send_rate_limit'); await post('/__test/limit', { on: false });


  // --- nobody gets in without signing in, and tables are closed to direct reads
  const e0 = await fails('gd_profile', {}, null, /permission denied/); assert.equal(e0.status, 401);
  const direct = await m.db.query("select has_table_privilege('authenticated', 'public.gd_user_data', 'select') as a, has_table_privilege('anon', 'public.gd_workouts', 'select') as b");
  assert.deepEqual(direct.rows[0], { a: false, b: false });

  // --- profile
  assert.deepEqual(await rpc('gd_profile', {}, A.t), { name: 'Anba', share: 'summary', avatar_at: 0, admin: true });
  assert.equal((await rpc('gd_profile', {}, B.t)).admin, false, 'only the first account looks after the app');
  await fails('gd_set_profile', { p_name: 'x'.repeat(41) }, A.t, /too long/);
  await fails('gd_set_profile', { p_share: 'everyone' }, A.t, /Unknown sharing/);
  assert.equal((await rpc('gd_set_profile', { p_name: '  Anba A ' }, A.t)).name, 'Anba A');

  // --- data sync with conflict detection
  assert.equal(await rpc('gd_load', {}, A.t), null);
  assert.deepEqual(await rpc('gd_save', { p_data: { days: [1] }, p_base: 0 }, A.t), { ok: true, rev: 1 });
  assert.deepEqual(await rpc('gd_save', { p_data: { days: [1, 2] }, p_base: 1 }, A.t), { ok: true, rev: 2 });
  const stale = await rpc('gd_save', { p_data: { days: [9] }, p_base: 1 }, A.t);        // a second phone that is behind
  assert.deepEqual(stale, { ok: false, rev: 2, data: { days: [1, 2] } });
  const ld = await rpc('gd_load', {}, A.t); assert.equal(ld.rev, 2); assert.deepEqual(ld.data, { days: [1, 2] });
  assert.equal(await rpc('gd_load', {}, B.t), null, "B cannot see A's data");
  await fails('gd_save', { p_data: [1], p_base: 0 }, B.t, /Nothing to save/);

  // --- clubs
  const club = await rpc('gd_create_club', { p_name: ' Iron Crew ' }, A.t);
  assert.match(club.code, /^[A-HJ-NP-Z2-9]{6}$/); assert.equal(club.name, 'Iron Crew');
  await fails('gd_create_club', { p_name: '' }, A.t, /1 to 40/);
  assert.deepEqual(await rpc('gd_join_club', { p_code: 'ZZZZZZ' }, B.t), { ok: false, error: 'No club has that code. Check it and try again.' });
  const j = await rpc('gd_join_club', { p_code: ' ' + club.code.toLowerCase().slice(0, 3) + '-' + club.code.toLowerCase().slice(3) + ' ' }, B.t);
  assert.deepEqual(j, { ok: true, id: club.id, name: 'Iron Crew' });
  assert.equal((await rpc('gd_join_club', { p_code: club.code }, B.t)).ok, true, 'joining twice is harmless');
  const mine = await rpc('gd_my_clubs', {}, B.t); assert.equal(mine.length, 1); assert.equal(mine[0].members, 2); assert.equal(mine[0].is_owner, false);
  await fails('gd_club', { p_club: club.id, p_week: new Date().toISOString() }, C.t, /not in this club/);
  await fails('gd_rename_club', { p_club: club.id, p_name: 'Mine now' }, B.t, /Only the person who runs/);
  for (let i = 0; i < 10; i++) await rpc('gd_join_club', { p_code: 'AAAAA' + i }, C.t);
  await fails('gd_join_club', { p_code: club.code }, C.t, /Too many wrong codes/);
  await m.db.exec('delete from public.gd_join_tries');

  // --- sharing workouts, leaderboard, feed, cheers
  const now = Date.now(), week = new Date(now - 3 * 864e5).toISOString();
  const W = (id, ago, ms, extra) => Object.assign({ id, started_at: new Date(now - ago * 36e5).toISOString(), gym_ms: ms, day_name: 'Push', ex_count: 5, set_count: 15, detail: [{ n: 'Bench', s: [[60, 8]] }] }, extra || {});
  assert.equal(await rpc('gd_share_workouts', { p_items: [W('w1', 2, 50 * 6e4), W('w2', 26, 40 * 6e4), W('old', 24 * 20, 30 * 6e4)] }, A.t), 3);
  assert.equal(await rpc('gd_share_workouts', { p_items: [W('b1', 5, 70 * 6e4)] }, B.t), 1);
  let v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.deepEqual(v.board.map(r => [r.name, r.workouts, r.ms, r.me]), [['Anba A', 2, 90 * 6e4, false], ['Bala', 1, 70 * 6e4, true]]);
  assert.deepEqual(v.feed.map(f => f.id), ['w1', 'b1', 'w2', 'old']);
  assert.ok(v.feed.every(f => f.detail === null), 'summary sharing never carries the sets');
  assert.equal(v.club.is_owner, false); assert.equal(v.members.length, 2); assert.equal(v.challenge, null);
  assert.deepEqual(await rpc('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: true }, B.t), { cheers: 1, cheered: true });
  assert.deepEqual(await rpc('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: true }, B.t), { cheers: 1, cheered: true });
  await fails('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: true }, C.t, /not in a club with this person/);
  await fails('gd_cheer', { p_owner: A.id, p_workout: 'nope', p_on: true }, B.t, /no longer shared/);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, A.t);
  assert.deepEqual([v.feed[0].cheers, v.feed[0].cheered, v.feed[0].me], [1, false, true]);
  assert.deepEqual(await rpc('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: false }, B.t), { cheers: 0, cheered: false });
  // sharing "everything" carries the sets; back to summary strips them; "nothing" removes the workouts
  await rpc('gd_set_profile', { p_share: 'all' }, A.t);
  await rpc('gd_share_workouts', { p_items: [W('w1', 2, 55 * 6e4)] }, A.t);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.deepEqual(v.feed.find(f => f.id === 'w1').detail, [{ n: 'Bench', s: [[60, 8]] }]); assert.equal(v.feed.find(f => f.id === 'w1').gym_ms, 55 * 6e4);
  await rpc('gd_set_profile', { p_share: 'summary' }, A.t);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t); assert.equal(v.feed.find(f => f.id === 'w1').detail, null);
  assert.equal(await rpc('gd_unshare', { p_ids: ['w2', 'missing'] }, A.t), 1);
  await rpc('gd_set_profile', { p_share: 'none' }, B.t);
  assert.equal(await rpc('gd_share_workouts', { p_items: [W('b2', 1, 1e6)] }, B.t), 0);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, A.t);
  assert.deepEqual(v.feed.map(f => f.id), ['w1', 'old']); assert.deepEqual(v.board.map(r => r.workouts), [1, 0]);
  await rpc('gd_set_profile', { p_share: 'summary' }, B.t);
  await rpc('gd_share_workouts', { p_items: [W('b1', 5, 70 * 6e4)] }, B.t);

  // --- challenge
  await fails('gd_set_challenge', { p_club: club.id, p_title: 'x', p_metric: 'workouts', p_target: 10, p_start: week, p_end: new Date(now + 864e5).toISOString() }, B.t, /Only the person who runs/);
  await fails('gd_set_challenge', { p_club: club.id, p_title: 'x', p_metric: 'reps', p_target: 10, p_start: week, p_end: new Date(now + 864e5).toISOString() }, A.t, /Unknown challenge type/);
  await rpc('gd_set_challenge', { p_club: club.id, p_title: '20 workouts together', p_metric: 'workouts', p_target: 20, p_start: week, p_end: new Date(now + 864e5).toISOString() }, A.t);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.equal(v.challenge.total, 2); assert.deepEqual(v.challenge.by.map(x => [x.name, x.value]), [['Anba A', 1], ['Bala', 1]]);
  await rpc('gd_set_challenge', { p_club: club.id, p_title: 'Minutes', p_metric: 'minutes', p_target: 600, p_start: week, p_end: new Date(now + 864e5).toISOString() }, A.t);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.equal(v.challenge.total, 125); assert.deepEqual(v.challenge.by.map(x => x.value), [70, 55]);
  await rpc('gd_set_challenge', { p_club: club.id, p_title: '', p_metric: null, p_target: null, p_start: null, p_end: null }, A.t);
  assert.equal((await rpc('gd_club', { p_club: club.id, p_week: week }, B.t)).challenge, null);

  // ======================================================================= v1.5
  const club2 = () => rpc('gd_club', { p_club: club.id, p_week: week, p_now: week }, A.t);
  await m.db.exec("update public.gd_clubs set created_at = now() - interval '30 days'");

  // --- profile picture, club logo and description
  const PIC = 'data:image/jpeg;base64,' + 'A'.repeat(200);
  const pa = await rpc('gd_set_avatar', { p_avatar: PIC }, A.t); assert.ok(pa.avatar_at > 0);
  await fails('gd_set_avatar', { p_avatar: 'data:image/jpeg;base64,' + 'x'.repeat(50000) }, A.t, /too big/);
  await fails('gd_set_avatar', { p_avatar: 'http://x/y.jpg' }, A.t, /too big/);
  let pics = await rpc('gd_pics', { p_users: [A.id, B.id], p_clubs: [club.id] }, B.t);
  assert.deepEqual(pics, { users: { [A.id]: PIC }, clubs: {} });
  assert.deepEqual((await rpc('gd_pics', { p_users: [A.id], p_clubs: [club.id] }, C.t)), { users: {}, clubs: {} }, 'a stranger gets no pictures');
  await fails('gd_set_club_info', { p_club: club.id, p_descr: 'x' }, B.t, /Only the person who runs/);
  await rpc('gd_set_club_info', { p_club: club.id, p_descr: '  6am, no excuses ', p_logo: PIC, p_set_logo: true }, A.t);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.equal(v.club.descr, '6am, no excuses'); assert.ok(v.club.logo_at > 0);
  assert.equal(v.members.find(x => x.user_id === A.id).avatar_at, pa.avatar_at); assert.equal(v.members.find(x => x.user_id === B.id).avatar_at, 0);
  assert.equal((await rpc('gd_pics', { p_clubs: [club.id] }, B.t)).clubs[club.id], PIC);
  await rpc('gd_set_club_info', { p_club: club.id, p_descr: 'New words' }, A.t);
  let mc = (await rpc('gd_my_clubs', {}, B.t))[0]; assert.equal(mc.descr, 'New words'); assert.ok(mc.logo_at > 0, 'the logo is left alone unless asked');
  await rpc('gd_set_club_info', { p_club: club.id, p_descr: '', p_logo: null, p_set_logo: true }, A.t);
  mc = (await rpc('gd_my_clubs', {}, B.t))[0]; assert.equal(mc.descr, null); assert.equal(mc.logo_at, 0);
  assert.equal((await rpc('gd_set_avatar', { p_avatar: null }, A.t)).avatar_at, 0);

  // --- boards: weight lifted, records, streak, weekly winners
  await rpc('gd_share_workouts', { p_items: [W('w1', 2, 55 * 6e4, { volume: 5400.5, prs: 2 }), W('w3', 30, 30 * 6e4, { volume: 1000, prs: 1 }),
    W('p1', 24 * 5, 20 * 6e4), W('p2', 24 * 12, 20 * 6e4)] }, A.t);
  await rpc('gd_share_workouts', { p_items: [W('b1', 5, 70 * 6e4, { volume: 8000 })] }, B.t);
  v = await club2();
  assert.deepEqual(v.board.map(r => [r.name, r.workouts, +r.volume, +r.prs, r.streak]), [['Anba A', 2, 6400.5, 3, 4], ['Bala', 1, 8000, 0, 1]]);
  const fw = v.feed.find(f => f.id === 'w1'); assert.deepEqual([+fw.volume, fw.prs, fw.comments, fw.reactions, fw.mine], [5400.5, 2, 0, {}, null]);
  const ma = v.members.find(x => x.me); assert.deepEqual([ma.total, +ma.volume_all, +ma.prs_all, ma.streak, ma.wins], [5, 6400.5, 3, 4, 3]);
  assert.deepEqual(v.winners.map(x => [x.name, x.workouts, x.me]), [['Anba A', 1, true], ['Anba A', 1, true], ['Anba A', 1, true]]);
  assert.equal(new Date(v.winners[0].week).getTime(), new Date(week).getTime() - 7 * 864e5);
  v = await rpc('gd_club', { p_club: club.id, p_week: new Date(new Date(week).getTime() - 7 * 864e5).toISOString(), p_now: week }, A.t);   // looking at last week
  assert.deepEqual(v.board.map(r => [r.name, r.workouts, r.streak]), [['Anba A', 1, 4], ['Bala', 0, 1]], 'an earlier week keeps today\'s streaks');
  assert.equal(v.winners.length, 3);

  // --- reactions (one per person per workout) and comments
  let rx = await rpc('gd_react', { p_owner: A.id, p_workout: 'w1', p_kind: 'fire' }, B.t);
  assert.deepEqual(rx, { reactions: { fire: 1 }, mine: 'fire', cheers: 1, cheered: true });
  rx = await rpc('gd_react', { p_owner: A.id, p_workout: 'w1', p_kind: 'strong' }, B.t);
  assert.deepEqual(rx, { reactions: { strong: 1 }, mine: 'strong', cheers: 1, cheered: true });
  await fails('gd_react', { p_owner: A.id, p_workout: 'w1', p_kind: 'lol' }, B.t, /Unknown reaction/);
  await fails('gd_react', { p_owner: A.id, p_workout: 'w1', p_kind: 'fire' }, C.t, /not in a club/);
  assert.deepEqual(await rpc('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: true }, B.t), { cheers: 1, cheered: true }, 'the older app\'s cheer still works');
  let cs = await rpc('gd_comment', { p_owner: A.id, p_workout: 'w1', p_body: '  Strong work!  ' }, B.t);
  assert.deepEqual(cs.map(x => [x.name, x.body, x.me, x.can_delete]), [['Bala', 'Strong work!', true, true]]);
  cs = await rpc('gd_comment', { p_owner: A.id, p_workout: 'w1', p_body: 'Thanks' }, A.t); assert.equal(cs.length, 2);
  await fails('gd_comment', { p_owner: A.id, p_workout: 'w1', p_body: '   ' }, B.t, /Write something/);
  await fails('gd_comment', { p_owner: A.id, p_workout: 'w1', p_body: 'x'.repeat(301) }, B.t, /too long/);
  await fails('gd_comment', { p_owner: A.id, p_workout: 'w1', p_body: 'hi' }, C.t, /not in a club/);
  await fails('gd_comment', { p_owner: A.id, p_workout: 'nope', p_body: 'hi' }, B.t, /no longer shared/);
  await fails('gd_comments', { p_owner: A.id, p_workout: 'w1' }, C.t, /not in a club/);
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, A.t);
  const f1 = v.feed.find(f => f.id === 'w1'); assert.deepEqual([f1.comments, f1.reactions, f1.mine, f1.cheers, f1.cheered], [2, { strong: 1 }, null, 1, false]);

  // --- "going to the gym" posts
  const at3 = new Date(now + 3 * 36e5).toISOString();
  const pid = await rpc('gd_post_plan', { p_club: club.id, p_at: at3, p_note: ' Legs ' }, B.t);
  await fails('gd_post_plan', { p_club: club.id, p_at: new Date(now - 5 * 36e5).toISOString() }, B.t, /next two weeks/);
  await fails('gd_post_plan', { p_club: club.id, p_at: at3 }, C.t, /not in this club/);
  await fails('gd_join_plan', { p_plan: pid, p_on: true }, C.t, /post is gone/);
  v = await club2();
  assert.deepEqual(v.plans.map(x => [x.id, x.name, x.note, x.me, x.in, x.going.map(g => g.name)]), [[pid, 'Bala', 'Legs', false, false, ['Bala']]]);
  await rpc('gd_join_plan', { p_plan: pid, p_on: true }, A.t);
  v = await club2(); assert.deepEqual([v.plans[0].in, v.plans[0].going.map(g => g.name)], [true, ['Bala', 'Anba A']]);

  // --- what happened since I last looked
  const since = new Date(now - 36e5).toISOString();
  let news = await rpc('gd_news', { p_since: since }, A.t);
  assert.deepEqual([...new Set(news.map(x => x.type))].sort(), ['comment', 'member', 'plan', 'react', 'workout']);
  assert.ok(news.every(x => x.name === 'Bala'), 'my own doings are not news to me');
  assert.equal(news.find(x => x.type === 'comment').body, 'Strong work!'); assert.equal(news.find(x => x.type === 'react').kind, 'strong');
  news = await rpc('gd_news', { p_since: since }, B.t); assert.ok(news.some(x => x.type === 'join' && x.name === 'Anba A'));
  assert.deepEqual(await rpc('gd_news', { p_since: since }, C.t), [], 'nothing for someone in no club');
  assert.deepEqual(await rpc('gd_news', { p_since: new Date(now + 6e4).toISOString() }, A.t), []);
  await rpc('gd_join_plan', { p_plan: pid, p_on: false }, A.t);

  // the workout's owner can delete someone else's comment under it; others cannot delete what is not theirs
  await fails('gd_delete_comment', { p_id: cs[1].id }, B.t, /not yours/);
  cs = await rpc('gd_delete_comment', { p_id: cs[0].id }, A.t); assert.deepEqual(cs.map(x => x.body), ['Thanks']);
  rx = await rpc('gd_react', { p_owner: A.id, p_workout: 'w1', p_kind: null }, B.t);
  assert.deepEqual(rx, { reactions: {}, mine: null, cheers: 0, cheered: false });

  // --- best lifts: club records board and the member page
  assert.equal(await rpc('gd_share_bests', { p_items: [{ ex: 'bench', name: 'Bench Press', w: 80, reps: 5 }] }, A.t), 0, 'kept only for people who share everything');
  await rpc('gd_set_profile', { p_share: 'all' }, A.t); await rpc('gd_set_profile', { p_share: 'all' }, B.t);
  assert.equal(await rpc('gd_share_bests', { p_items: [{ ex: 'bench', name: 'Bench Press', w: 80, reps: 5 }, { ex: 'squat', name: 'Squat', w: 100, reps: 3 }, { ex: 'zero', name: 'Nothing', w: 0 }] }, A.t), 2);
  assert.equal(await rpc('gd_share_bests', { p_items: [{ ex: 'bench', name: 'Bench Press', w: 92.5, reps: 1 }] }, B.t), 1);
  v = await club2();
  assert.deepEqual(v.records.map(r => [r.ex, r.top.map(t => [t.name, +t.w, t.me])]), [['bench', [['Bala', 92.5, false], ['Anba A', 80, true]]], ['squat', [['Anba A', 100, true]]]]);
  assert.equal(await rpc('gd_share_bests', { p_items: [{ ex: 'bench', name: 'Bench Press', w: 85, reps: 5 }] }, A.t), 1);
  let mp = await rpc('gd_member', { p_user: A.id, p_week: week }, B.t);
  assert.deepEqual([mp.name, mp.me, mp.share, mp.streak, mp.all.workouts, mp.week.workouts, +mp.week.volume, mp.four.workouts, mp.recent.length, mp.clubs],
    ['Anba A', false, 'all', 4, 5, 2, 6400.5, 5, 5, ['Iron Crew']]);
  assert.deepEqual(mp.bests.map(b => [b.ex, +b.w]), [['bench', 85]], 'sending the list again replaces it');
  await fails('gd_member', { p_user: A.id, p_week: week }, C.t, /not in a club/);
  await rpc('gd_set_profile', { p_share: 'summary' }, B.t);
  v = await club2(); assert.deepEqual(v.records.map(r => [r.ex, r.top.length]), [['bench', 1]], 'back to a summary removes the best lifts');
  await rpc('gd_set_profile', { p_share: 'summary' }, A.t); assert.deepEqual((await club2()).records, []);

  // --- days put up to copy; what a person put into a club goes when they leave it
  const dayItems = [{ ex: 'bench', name: 'Bench Press', sets: 3, reps: 8 }];
  const sd = await rpc('gd_share_day', { p_club: club.id, p_name: ' Push day ', p_items: dayItems }, B.t);
  await fails('gd_share_day', { p_club: club.id, p_name: 'x', p_items: dayItems }, C.t, /not in this club/);
  await fails('gd_share_day', { p_club: club.id, p_name: 'x', p_items: [] }, B.t, /no exercises/);
  const sd2 = await rpc('gd_share_day', { p_club: club.id, p_name: 'Push day', p_items: dayItems.concat(dayItems) }, B.t);
  v = await club2(); assert.deepEqual(v.days.map(d => [d.id, d.name, d.by, d.me, d.items.length]), [[sd2, 'Push day', 'Bala', false, 2]], 'sharing a day again replaces it');
  assert.notEqual(sd, sd2);
  await rpc('gd_join_club', { p_code: club.code }, C.t);
  await fails('gd_unshare_day', { p_id: sd2 }, C.t, /not yours/);
  await fails('gd_delete_plan', { p_plan: pid }, C.t, /not yours/);
  const cd = await rpc('gd_share_day', { p_club: club.id, p_name: 'Chitra legs', p_items: dayItems }, C.t);
  const cp = await rpc('gd_post_plan', { p_club: club.id, p_at: at3 }, C.t);
  await rpc('gd_join_plan', { p_plan: pid, p_on: true }, C.t); await rpc('gd_join_plan', { p_plan: cp, p_on: true }, B.t);
  v = await club2(); assert.equal(v.days.length, 2); assert.equal(v.plans.length, 2); assert.deepEqual(v.plans[0].going.map(g => g.name).sort(), ['Bala', 'Chitra']);
  assert.equal(await rpc('gd_remove_member', { p_club: club.id, p_user: C.id }, A.t), true);
  v = await club2(); assert.deepEqual(v.days.map(d => d.id), [sd2]); assert.deepEqual(v.plans.map(x => [x.id, x.going.map(g => g.name)]), [[pid, ['Bala']]]);
  assert.equal(await rpc('gd_unshare_day', { p_id: sd2 }, A.t), true, 'the person who runs the club can take a day down');
  assert.equal(await rpc('gd_delete_plan', { p_plan: pid }, B.t), true); v = await club2(); assert.deepEqual([v.days, v.plans], [[], []]);
  assert.ok(cd && cp);

  // --- club chat (v1.6)
  let chat = await rpc('gd_chat', { p_club: club.id }, A.t); assert.deepEqual(chat, { messages: [], more: false });
  chat = await rpc('gd_chat_send', { p_club: club.id, p_body: '  Gym at 6?  ' }, B.t);
  assert.deepEqual(chat.messages.map(x => [x.name, x.body, x.me, x.can_delete]), [['Bala', 'Gym at 6?', true, true]]);
  chat = await rpc('gd_chat_send', { p_club: club.id, p_body: 'In.' }, A.t);
  assert.deepEqual(chat.messages.map(x => [x.name, x.body, x.me, x.can_delete]), [['Bala', 'Gym at 6?', false, true], ['Anba A', 'In.', true, true]], 'oldest first; the person who runs the club can delete any');
  assert.deepEqual((await rpc('gd_chat', { p_club: club.id }, B.t)).messages.map(x => x.can_delete), [true, false]);
  await fails('gd_chat', { p_club: club.id }, C.t, /not in this club/);
  await fails('gd_chat_send', { p_club: club.id, p_body: 'hi' }, C.t, /not in this club/);
  await fails('gd_chat_send', { p_club: club.id, p_body: '   ' }, B.t, /Write something/);
  await fails('gd_chat_send', { p_club: club.id, p_body: 'x'.repeat(501) }, B.t, /too long/);
  await fails('gd_chat_delete', { p_id: chat.messages[1].id }, B.t, /not yours/);
  const cn = await rpc('gd_news', { p_since: new Date(now - 36e5).toISOString() }, A.t);
  assert.ok(cn.some(x => x.type === 'chat' && x.name === 'Bala' && x.body === 'Gym at 6?' && x.club === 'Iron Crew'), 'chat shows in what is new');
  assert.ok(!cn.some(x => x.type === 'chat' && x.name === 'Anba A'), 'my own messages are not news to me');
  for (let i = 0; i < 55; i++) await m.db.query("insert into public.gd_messages (club_id, user_id, body, created_at) values ($1, $2, $3, now() - interval '1 day' - ($4 || ' minutes')::interval)", [club.id, B.id, 'old ' + i, String(i)]);
  chat = await rpc('gd_chat', { p_club: club.id }, A.t); assert.equal(chat.messages.length, 50); assert.equal(chat.more, true); assert.equal(chat.messages[49].body, 'In.');
  const older = await rpc('gd_chat', { p_club: club.id, p_before: chat.messages[0].at }, A.t); assert.equal(older.messages.length, 7); assert.equal(older.more, false);
  chat = await rpc('gd_chat_delete', { p_id: chat.messages[48].id }, A.t); assert.ok(!chat.messages.some(x => x.body === 'Gym at 6?'));
  await m.db.exec('delete from public.gd_messages');

  // --- inner helpers are closed; the invite link answers with a redirect and works without a sign-in
  await fails('gdx_streak', { p_user: A.id, p_week: week }, B.t, /permission denied/);
  const priv = await m.db.query(`select has_function_privilege('anon', 'public.gd_go(text)', 'execute') as go, has_function_privilege('anon', 'public.gd_news(timestamptz)', 'execute') as news,
      has_function_privilege('authenticated', 'public.gdx_out_of_club(uuid, uuid)', 'execute') as inner`);
  assert.deepEqual(priv.rows[0], { go: true, news: false, inner: false });
  await m.db.transaction(async tx => {
    await tx.exec('set local role anon');
    const g = await tx.query("select public.gd_go(' ab-c1 23!! ') as t");
    const h = await tx.query("select current_setting('response.status', true) as st, current_setting('response.headers', true) as h");
    assert.match(g.rows[0].t, /type ABC123$/); assert.equal(h.rows[0].st, '302'); assert.deepEqual(JSON.parse(h.rows[0].h), [{ Location: 'gymday://join/ABC123' }]);
  });
  // --- "a new version is out": anyone may ask, only the admin may announce
  assert.equal((await post('/rest/v1/rpc/gd_latest', {})).body, null);
  await fails('gd_set_latest', { p_code: 10, p_name: '1.6.0', p_url: 'https://x.io/a.apk' }, B.t, /Only the person who looks after/);
  await fails('gd_set_latest', { p_code: 10, p_name: '1.6.0', p_url: 'javascript:alert(1)' }, A.t, /https/);
  const lv = await rpc('gd_set_latest', { p_code: 10, p_name: '1.6.0', p_url: 'https://x.io/a.apk', p_notes: 'Faster' }, A.t);
  assert.deepEqual([lv.code, lv.name, lv.url, lv.notes], [10, '1.6.0', 'https://x.io/a.apk', 'Faster']);
  assert.equal((await post('/rest/v1/rpc/gd_latest', {})).body.code, 10, 'works without a sign-in');
  await rpc('gd_set_latest', { p_code: 11, p_name: '1.6.1', p_url: 'https://x.io/b.apk' }, A.t); assert.equal((await rpc('gd_latest', {}, B.t)).name, '1.6.1');
  await m.db.exec('delete from public.gd_app');

  // --- v1.7 training now: club mates see it, it fades 20 minutes after the last word, sharing nothing hides it
  assert.deepEqual(await rpc('gd_live_all', {}, A.t), []);
  const bShare = (await rpc('gd_profile', {}, B.t)).share; assert.notEqual(bShare, 'none');
  assert.equal(await rpc('gd_live', { p_on: true, p_day: '  Push day  ' }, B.t), true);
  let live = await rpc('gd_live_all', {}, A.t);
  assert.equal(live.length, 1); assert.deepEqual([live[0].club_id, live[0].user_id, live[0].name, live[0].me, live[0].day], [club.id, B.id, 'Bala', false, 'Push day']); assert.ok(live[0].since);
  assert.equal((await rpc('gd_live_all', {}, B.t))[0].me, true);
  await rpc('gd_live', { p_on: true, p_day: 'Push day' }, B.t); assert.equal((await rpc('gd_live_all', {}, A.t))[0].since, live[0].since, 'saying so again keeps the start time');
  await rpc('gd_live', { p_on: true, p_day: 'Somewhere else' }, C.t); assert.equal((await rpc('gd_live_all', {}, A.t)).length, 1, 'someone outside my clubs is not shown');
  assert.deepEqual(await rpc('gd_live_all', {}, C.t), []); await rpc('gd_live', { p_on: false }, C.t);
  await m.db.query("update public.gd_profiles set live_at = now() - interval '21 minutes' where user_id = $1", [B.id]);
  assert.deepEqual(await rpc('gd_live_all', {}, A.t), [], 'gone 20 minutes after the last word');
  await rpc('gd_live', { p_on: true, p_day: 'Legs' }, B.t); assert.notEqual((await rpc('gd_live_all', {}, A.t))[0].since, live[0].since, 'a new workout has a new start time');
  await m.db.query("update public.gd_profiles set share = 'none' where user_id = $1", [B.id]); assert.deepEqual(await rpc('gd_live_all', {}, A.t), [], 'sharing nothing hides it');
  await m.db.query("update public.gd_profiles set share = $2 where user_id = $1", [B.id, bShare]); assert.equal((await rpc('gd_live_all', {}, A.t)).length, 1);
  assert.equal(await rpc('gd_live', { p_on: false }, B.t), true); assert.deepEqual(await rpc('gd_live_all', {}, A.t), []);
  await fails('gd_live', { p_on: true, p_day: 'x'.repeat(200) }, null, /./);                       // not signed in
  await rpc('gd_live', { p_on: true, p_day: 'x'.repeat(200) }, B.t); assert.equal((await rpc('gd_live_all', {}, A.t))[0].day.length, 60); await rpc('gd_live', { p_on: false }, B.t);
  // --- v1.7 the count for reading meal photos: 40 a day for each person
  assert.equal(await rpc('gd_ai_use', {}, A.t), 1); assert.equal(await rpc('gd_ai_use', {}, A.t), 2); assert.equal(await rpc('gd_ai_use', {}, B.t), 1);
  await m.db.query("update public.gd_ai_use set n = 40 where user_id = $1", [A.id]);
  await fails('gd_ai_use', {}, A.t, /enough photos for today/);
  assert.equal((await m.db.query("select n from public.gd_ai_use where user_id = $1", [A.id])).rows[0].n, 40);
  assert.equal(await rpc('gd_ai_use', {}, B.t), 2, "one person's count does not stop another");
  await m.db.query("update public.gd_ai_use set day = day - 1 where user_id = $1", [A.id]); assert.equal(await rpc('gd_ai_use', {}, A.t), 1, 'a new day starts from one');
  await fails('gd_ai_use', {}, null, /./);                                                        // not signed in
  { const d = await post('/rest/v1/gd_ai_use?select=*', null, A.t); assert.notEqual(d.status, 200, 'the table itself is closed to the app'); }

  // running the setup file a second time changes nothing and breaks nothing
  await m.db.exec(require('fs').readFileSync(__dirname + '/gymday-supabase-setup.sql', 'utf8'));
  assert.equal((await club2()).members.length, 2);

  // --- owner tools, leaving, handing over
  await rpc('gd_join_club', { p_code: club.code }, C.t);
  await fails('gd_remove_member', { p_club: club.id, p_user: B.id }, C.t, /Only the person who runs/);
  assert.equal(await rpc('gd_remove_member', { p_club: club.id, p_user: C.id }, A.t), true);
  assert.equal((await rpc('gd_my_clubs', {}, C.t)).length, 0);
  assert.equal(await rpc('gd_leave_club', { p_club: club.id }, A.t), true);                 // owner leaves -> Bala runs it
  v = await rpc('gd_club', { p_club: club.id, p_week: week }, B.t);
  assert.equal(v.club.is_owner, true); assert.deepEqual(v.feed.map(f => f.id), ['b1'], "a person who left is no longer in the feed");
  await fails('gd_cheer', { p_owner: A.id, p_workout: 'w1', p_on: true }, B.t, /not in a club/);

  // --- token expiry and refresh
  await post('/__test/expire');
  const ex = await post('/rest/v1/rpc/gd_profile', {}, B.t); assert.equal(ex.status, 401); assert.equal(ex.body.message, 'JWT expired');
  const rf = await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: B.rt }); assert.ok(rf.body.access_token);
  assert.equal((await post('/auth/v1/token?grant_type=refresh_token', { refresh_token: B.rt })).status, 400, 'a refresh token works once');
  B.t = rf.body.access_token;

  // --- deleting an account removes everything of that person and hands over or removes their clubs
  const c2 = await rpc('gd_create_club', { p_name: 'Solo' }, B.t);
  const A2 = (await signin('a@x.io')).access_token;
  await rpc('gd_join_club', { p_code: club.code }, A2);
  assert.equal(await rpc('gd_delete_account', {}, B.t), true);
  const left = await m.db.query(`select (select count(*)::int from auth.users) as users, (select count(*)::int from public.gd_clubs) as clubs,
      (select count(*)::int from public.gd_workouts where user_id = $1) as w, (select count(*)::int from public.gd_profiles where user_id = $1) as p,
      (select owner from public.gd_clubs where id = $2) as owner`, [B.id, club.id]);
  assert.deepEqual(left.rows[0], { users: 2, clubs: 1, w: 0, p: 0, owner: A.id });
  assert.equal((await rpc('gd_my_clubs', {}, A2))[0].is_owner, true);

  await m.close();
  console.log('SQL + stand-in server: all checks passed');
})().catch(e => { console.error('FAILED:', e.stack || e); process.exit(1); });
