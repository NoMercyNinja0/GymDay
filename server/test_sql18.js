// v1.8 (app store rules): report a message, a person, a club or an AI answer; block and unblock; the person who looks after
// GymDay sees open reports and deals with them. Run on the full setup and on the v1.7 setup with the update on top.
const { createMock } = require('./server');
const assert = require('assert');

async function run(label) {
  const m = await createMock();
  const H = t => Object.assign({ apikey: 'k', 'content-type': 'application/json' }, t ? { authorization: 'Bearer ' + t } : {});
  const post = async (p, body, t) => { const r = await fetch(m.url + p, { method: 'POST', headers: H(t), body: JSON.stringify(body || {}) }); const tx = await r.text(); return { status: r.status, body: tx ? JSON.parse(tx) : null }; };
  const rpc = async (fn, args, t) => { const r = await post('/rest/v1/rpc/' + fn, args, t); if (r.status !== 200) throw Object.assign(new Error(r.body && r.body.message), { status: r.status }); return r.body; };
  const fails = async (fn, args, t, re) => { try { await rpc(fn, args, t); } catch (e) { assert.match(e.message, re, e.message); return e; } assert.fail(fn + ' should have failed'); };
  const code = async email => (await post('/__test/code', { email })).body.code;
  const signin = async email => { await post('/auth/v1/otp', { email, create_user: true }); const r = await post('/auth/v1/verify', { type: 'email', email, token: await code(email) }); return r.body; };
  const signup = async (email, name) => { const b = await signin(email); await rpc('gd_set_profile', { p_name: name }, b.access_token); return { t: b.access_token, id: b.user.id }; };

  const A = await signup('a@x.io', 'Anba'), B = await signup('b@x.io', 'Bala'), C = await signup('c@x.io', 'Chitra');
  const club = await rpc('gd_create_club', { p_name: 'Iron Crew' }, A.t);
  await rpc('gd_join_club', { p_code: club.code }, B.t);
  await rpc('gd_join_club', { p_code: club.code }, C.t);
  const chat = await rpc('gd_chat_send', { p_club: club.id, p_body: 'you are all useless' }, B.t);
  const msg = chat.messages.find(x => x.body === 'you are all useless');

  // --- reporting
  assert.deepEqual(await rpc('gd_report', { p_kind: 'message', p_club: club.id, p_user: B.id, p_item: msg.id, p_reason: 'Bullying', p_note: 'mean' }, C.t), { ok: true });
  await rpc('gd_report', { p_kind: 'user', p_club: club.id, p_user: B.id, p_reason: 'Spam' }, C.t);
  await rpc('gd_report', { p_kind: 'club', p_club: club.id, p_reason: 'Offensive name' }, C.t);
  await rpc('gd_report', { p_kind: 'ai', p_reason: 'Wrong', p_body: 'meal photo: 2 rotis, dal 150 g', p_note: 'it was rice' }, C.t);
  await fails('gd_report', { p_kind: 'video', p_reason: 'x' }, C.t, /Unknown kind/);
  await fails('gd_report', { p_kind: 'ai', p_reason: ' ' }, C.t, /Choose what is wrong/);
  const D = await signup('d@x.io', 'Dev');
  await fails('gd_report', { p_kind: 'club', p_club: club.id, p_reason: 'x' }, D.t, /not in this club/);
  await fails('gd_report', { p_kind: 'message', p_item: msg.id, p_reason: 'x' }, D.t, /not in this club/);
  const direct = await m.db.query("select has_table_privilege('authenticated', 'public.gd_reports', 'select') as a, has_table_privilege('authenticated', 'public.gd_blocks', 'insert') as b");
  assert.deepEqual(direct.rows[0], { a: false, b: false }, 'reports and blocks are closed to direct reads and writes');

  // --- only the person who looks after GymDay (the first account) sees and deals with them
  await fails('gd_reports_open', {}, B.t, /Only the person who looks after GymDay/);
  let open = await rpc('gd_reports_open', {}, A.t);
  assert.equal(open.length, 4);
  const rm = open.find(r => r.kind === 'message');
  assert.equal(rm.body, 'you are all useless', 'the message is kept as it was');
  assert.equal(rm.user, 'Bala'); assert.equal(rm.by, 'Chitra'); assert.equal(rm.club, 'Iron Crew'); assert.equal(rm.gone, false);
  assert.equal(open.find(r => r.kind === 'club').body, 'Iron Crew');
  assert.equal(open.find(r => r.kind === 'ai').note, 'it was rice');
  await fails('gd_report_done', { p_id: rm.id, p_action: 'both' }, B.t, /Only the person/);
  open = await rpc('gd_report_done', { p_id: rm.id, p_action: 'both' }, A.t);
  assert.equal(open.length, 3, 'a dealt-with report leaves the list');
  const after = await rpc('gd_chat', { p_club: club.id }, A.t);
  assert.ok(!after.messages.some(x => x.id === msg.id), 'the message is taken down');
  await fails('gd_chat', { p_club: club.id }, B.t, /not in this club/);
  const done = await m.db.query('select outcome from gd_reports where id = $1', [rm.id]);
  assert.equal(done.rows[0].outcome, 'deleted, removed');
  // the person who runs the club is never removed from it this way
  const ru = await rpc('gd_report', { p_kind: 'user', p_club: club.id, p_user: A.id, p_reason: 'Spam' }, C.t);
  assert.deepEqual(ru, { ok: true });
  const ownRep = (await rpc('gd_reports_open', {}, A.t)).find(r => r.user_id === A.id);
  await rpc('gd_report_done', { p_id: ownRep.id, p_action: 'remove' }, A.t);
  assert.match((await m.db.query('select outcome from gd_reports where id = $1', [ownRep.id])).rows[0].outcome, /runs the club/);

  // --- blocking
  assert.deepEqual(await rpc('gd_blocks', {}, C.t), []);
  assert.deepEqual(await rpc('gd_block', { p_user: B.id, p_on: true }, C.t), [{ user_id: B.id, name: 'Bala' }]);
  assert.deepEqual(await rpc('gd_block', { p_user: B.id, p_on: true }, C.t), [{ user_id: B.id, name: 'Bala' }], 'blocking twice is harmless');
  await fails('gd_block', { p_user: C.id, p_on: true }, C.t, /yourself/);
  assert.deepEqual(await rpc('gd_blocks', {}, B.t), [], 'the blocked person is not told');
  assert.deepEqual(await rpc('gd_block', { p_user: B.id, p_on: false }, C.t), []);

  // --- deleting an account takes its reports and blocks with it
  await rpc('gd_block', { p_user: A.id, p_on: true }, C.t);
  await rpc('gd_delete_account', {}, C.t);
  assert.equal((await m.db.query('select count(*)::int as n from gd_blocks')).rows[0].n, 0);
  assert.equal((await m.db.query('select count(*)::int as n from gd_reports where reporter = $1', [C.id])).rows[0].n, 0);

  // --- a busy reporter is slowed down
  for (let i = 0; i < 30; i++) await rpc('gd_report', { p_kind: 'ai', p_reason: 'Wrong' }, B.t);
  await fails('gd_report', { p_kind: 'ai', p_reason: 'Wrong' }, B.t, /a lot of reports/);
  await m.close();
  console.log(label + ': all v1.8 checks passed');
}

(async () => {
  await run('full setup');
  process.env.GYMDAY_SQL = ['gymday-supabase-setup.v17.sql', 'gymday-update-v1.8.sql'].map(f => __dirname + '/' + f).join(',');
  await run('v1.7 setup + v1.8 update');
})().catch(e => { console.error(e); process.exit(1); });
