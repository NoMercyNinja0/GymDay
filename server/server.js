// Stand-in for a Supabase project, for tests only: the same auth / rpc / storage calls the app makes,
// answered by a real Postgres (PGlite) running the real gymday-supabase-setup.sql.
const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { PGlite } = require('@electric-sql/pglite');

const SQL_FILE = path.join(__dirname, 'gymday-supabase-setup.sql');
const STUBS = `
  create role anon nologin; create role authenticated nologin;
  create schema auth;
  create table auth.users (id uuid primary key default gen_random_uuid(), email text unique not null, pw text not null default '',
                           meta jsonb not null default '{}', created_at timestamptz not null default now());
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema public, auth to anon, authenticated;
`;

async function createMock(opts = {}) {
  const db = new PGlite();
  await db.exec(STUBS);
  // GYMDAY_SQL=a.sql,b.sql runs those files in order instead (to try an update file on top of an older setup)
  const list = process.env.GYMDAY_SQL ? process.env.GYMDAY_SQL.split(',') : [SQL_FILE];
  for (const f of list) {
    const sql = fs.readFileSync(f, 'utf8');
    await db.exec(sql);
    await db.exec(sql);                     // must be safe to run twice
  }
  const tokens = new Map();                 // access token -> { uid, exp }
  const refresh = new Map();                // refresh token -> uid
  const files = new Map();                  // storage path -> { body, type }
  const otps = new Map();                   // email -> { code, exp }  (codes the real service would email)
  const state = { ttl: opts.ttl || 3600, confirm: !!opts.confirm, down: false, limit: false, calls: [] };
  const rnd = () => crypto.randomBytes(18).toString('hex');
  const fnCache = new Map();

  async function fnSig(name) {
    if (fnCache.has(name)) return fnCache.get(name);
    const r = await db.query(`select p.proargnames as names, array(select format_type(t, null) from unnest(p.proargtypes) t) as types
                              from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public' and p.proname = $1`, [name]);
    const sig = r.rows[0] ? { names: r.rows[0].names || [], types: r.rows[0].types || [] } : null;
    fnCache.set(name, sig); return sig;
  }
  function session(u) {
    const at = 'at_' + rnd(), rt = 'rt_' + rnd();
    tokens.set(at, { uid: u.id, exp: Date.now() + state.ttl * 1000 }); refresh.set(rt, u.id);
    return { access_token: at, token_type: 'bearer', expires_in: state.ttl, expires_at: Math.floor(Date.now() / 1000) + state.ttl, refresh_token: rt, user: pub(u) };
  }
  const pub = u => ({ id: u.id, email: u.email, user_metadata: u.meta, created_at: u.created_at });
  function who(req) {
    const h = req.headers.authorization || ''; const t = h.startsWith('Bearer ') ? h.slice(7) : '';
    const s = tokens.get(t);
    if (!s) return { uid: null, bad: !!t && t.startsWith('at_') };
    if (s.exp < Date.now()) return { uid: null, expired: true };
    return { uid: s.uid };
  }
  const send = (res, code, body, type) => {
    res.writeHead(code, { 'content-type': type || 'application/json', 'access-control-allow-origin': '*' });
    res.end(body == null ? '' : (Buffer.isBuffer(body) ? body : JSON.stringify(body)));
  };
  const readBody = req => new Promise(r => { const c = []; req.on('data', d => c.push(d)); req.on('end', () => r(Buffer.concat(c))); });

  const server = http.createServer(async (req, res) => {
    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-max-age': '600' });
        return res.end();
      }
      const url = new URL(req.url, 'http://x'); const p = url.pathname;
      const raw = await readBody(req);
      const json = () => { try { return JSON.parse(raw.toString('utf8') || '{}'); } catch (e) { return {}; } };
      if (p.startsWith('/__test/')) {
        const b = json();
        if (p === '/__test/expire') { for (const s of tokens.values()) s.exp = 0; return send(res, 200, { ok: true }); }
        if (p === '/__test/revoke') { for (const s of tokens.values()) s.exp = 0; refresh.clear(); return send(res, 200, { ok: true }); }
        if (p === '/__test/down') { state.down = !!b.down; return send(res, 200, { ok: true }); }
        if (p === '/__test/calls') { const c = state.calls.slice(); if (b.clear) state.calls.length = 0; return send(res, 200, c); }
        if (p === '/__test/sql') { const r = await db.query(b.q, b.args || []); return send(res, 200, r.rows); }
        if (p === '/__test/files') return send(res, 200, [...files.keys()]);
        if (p === '/__test/code') { const o = otps.get(String(b.email || '').trim().toLowerCase()); return send(res, 200, { code: o ? o.code : null }); }
        if (p === '/__test/limit') { state.limit = !!b.on; return send(res, 200, { ok: true }); }
        // the photo-reading function: fn = is it there at all, key = does it have an AI key, ai = how the AI service answers (ok | busy | nofood)
        if (p === '/__test/fn') { state.fn = !!b.on; state.aiKey = b.key !== false; state.ai = b.ai || 'ok'; return send(res, 200, { ok: true }); }
        if (p === '/__test/expirecodes') { for (const o of otps.values()) o.exp = 0; return send(res, 200, { ok: true }); }
        return send(res, 404, {});
      }
      if (state.down) { req.socket.destroy(); return; }
      state.calls.push(req.method + ' ' + p);
      if (!req.headers.apikey) return send(res, 401, { message: 'No API key found in request' });

      // ---------------- auth ----------------
      if (p === '/auth/v1/signup' && req.method === 'POST') {
        const b = json(); const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 422, { code: 422, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
        if (String(b.password || '').length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
        const ex = await db.query('select 1 from auth.users where email = $1', [email]);
        if (ex.rows.length) return send(res, 422, { code: 422, error_code: 'user_already_exists', msg: 'User already registered' });
        const r = await db.query('insert into auth.users (email, pw, meta) values ($1, $2, $3::jsonb) returning *', [email, b.password, JSON.stringify(b.data || {})]);
        if (state.confirm) return send(res, 200, Object.assign(pub(r.rows[0]), { confirmation_sent_at: new Date().toISOString() }));
        return send(res, 200, session(r.rows[0]));
      }
      if (p === '/auth/v1/settings' && req.method === 'GET') return send(res, 200, { external: { email: true }, disable_signup: false });
      // one-time codes by email, the way the app signs in
      if (p === '/auth/v1/otp' && req.method === 'POST') {
        const b = json(); const email = String(b.email || '').trim().toLowerCase();
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return send(res, 422, { code: 422, error_code: 'validation_failed', msg: 'Unable to validate email address: invalid format' });
        if (state.limit) return send(res, 429, { code: 429, error_code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded' });
        const ex = await db.query('select 1 from auth.users where email = $1', [email]);
        if (!ex.rows.length && b.create_user === false) return send(res, 422, { code: 422, error_code: 'otp_disabled', msg: 'Signups not allowed for otp' });
        otps.set(email, { code: String(crypto.randomInt(0, 1000000)).padStart(6, '0'), exp: Date.now() + 3600 * 1000 });
        return send(res, 200, {});
      }
      if (p === '/auth/v1/verify' && req.method === 'POST') {
        const b = json(); const email = String(b.email || '').trim().toLowerCase(); const o = otps.get(email);
        if (!['email', 'magiclink', 'signup'].includes(b.type) || !o || o.exp < Date.now() || o.code !== String(b.token || '').trim())
          return send(res, 403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
        otps.delete(email);
        let r = await db.query('select * from auth.users where email = $1', [email]);
        if (!r.rows.length) r = await db.query('insert into auth.users (email) values ($1) returning *', [email]);
        return send(res, 200, session(r.rows[0]));
      }
      if (p === '/auth/v1/token' && req.method === 'POST') {
        const b = json(); const g = url.searchParams.get('grant_type');
        if (g === 'password') {
          const r = await db.query('select * from auth.users where email = $1', [String(b.email || '').trim().toLowerCase()]);
          if (!r.rows.length || r.rows[0].pw !== b.password) return send(res, 400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
          return send(res, 200, session(r.rows[0]));
        }
        if (g === 'refresh_token') {
          const uid = refresh.get(b.refresh_token);
          const r = uid ? await db.query('select * from auth.users where id = $1', [uid]) : { rows: [] };
          if (!r.rows.length) return send(res, 400, { code: 400, error_code: 'refresh_token_not_found', msg: 'Invalid Refresh Token: Refresh Token Not Found' });
          refresh.delete(b.refresh_token);
          return send(res, 200, session(r.rows[0]));
        }
        return send(res, 400, { code: 400, error_code: 'invalid_grant', msg: 'unsupported grant' });
      }
      if (p === '/auth/v1/logout' && req.method === 'POST') {
        const h = (req.headers.authorization || '').slice(7); tokens.delete(h); return send(res, 204, null);
      }
      if (p === '/auth/v1/user') {
        const w = who(req); if (!w.uid) return send(res, 401, { code: 401, error_code: w.expired ? 'bad_jwt' : 'no_authorization', msg: w.expired ? 'invalid JWT: token is expired' : 'This endpoint requires a valid Bearer token' });
        if (req.method === 'PUT') {
          const b = json();
          if (b.password != null) {
            if (String(b.password).length < 6) return send(res, 422, { code: 422, error_code: 'weak_password', msg: 'Password should be at least 6 characters.' });
            await db.query('update auth.users set pw = $1 where id = $2', [b.password, w.uid]);
          }
          if (b.data) await db.query('update auth.users set meta = meta || $1::jsonb where id = $2', [JSON.stringify(b.data), w.uid]);
        }
        const r = await db.query('select * from auth.users where id = $1', [w.uid]);
        if (!r.rows.length) return send(res, 403, { code: 403, error_code: 'user_not_found', msg: 'User from sub claim in JWT does not exist' });
        return send(res, 200, pub(r.rows[0]));
      }

      // ---------------- rpc ----------------
      const m = p.match(/^\/rest\/v1\/rpc\/([a-z_0-9]+)$/);
      if (m && req.method === 'POST') {
        const w = who(req);
        if (w.expired || w.bad) return send(res, 401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null });
        const sig = await fnSig(m[1]);
        if (!sig) return send(res, 404, { code: 'PGRST202', message: 'Could not find the function public.' + m[1] + ' in the schema cache' });
        const b = json(); const parts = [], vals = [];
        for (const k of Object.keys(b)) {
          const i = sig.names.indexOf(k);
          if (i < 0) return send(res, 404, { code: 'PGRST202', message: 'Could not find the function public.' + m[1] + '(' + Object.keys(b).join(', ') + ') in the schema cache' });
          const t = sig.types[i]; const v = b[k];
          if (t === 'jsonb') { vals.push(JSON.stringify(v)); parts.push(`"${k}" => $${vals.length}::jsonb`); }
          else if (t === 'text[]') { vals.push(JSON.stringify(v || [])); parts.push(`"${k}" => array(select jsonb_array_elements_text($${vals.length}::jsonb))`); }
          else if (t === 'uuid[]') { vals.push(JSON.stringify(v || [])); parts.push(`"${k}" => array(select jsonb_array_elements_text($${vals.length}::jsonb))::uuid[]`); }
          else { vals.push(v == null ? null : String(v)); parts.push(`"${k}" => $${vals.length}::${t}`); }
        }
        try {
          let out;
          await db.transaction(async tx => {
            await tx.exec(`set local role ${w.uid ? 'authenticated' : 'anon'}; set local request.jwt.claim.sub = '${w.uid || ''}'`);
            const r = await tx.query(`select public.${m[1]}(${parts.join(', ')}) as r`, vals);
            out = r.rows[0].r;
          });
          return send(res, 200, out);
        } catch (e) {
          const code = e.code || 'P0001';
          return send(res, code === '42501' ? (w.uid ? 403 : 401) : 400, { code, message: e.message, details: null, hint: null });
        }
      }

      // ---------------- storage ----------------
      const s1 = p.match(/^\/storage\/v1\/object\/([a-z0-9-]+)\/(.+)$/);
      if (s1 && (req.method === 'POST' || req.method === 'PUT' || req.method === 'GET')) {
        const w = who(req);
        if (!w.uid) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: w.expired ? 'jwt expired' : 'new row violates row-level security policy' });
        const key = s1[1] + '/' + decodeURIComponent(s1[2]);
        if (s1[1] !== 'gymday-photos' || decodeURIComponent(s1[2]).split('/')[0] !== w.uid)
          return send(res, 400, { statusCode: req.method === 'GET' ? '404' : '403', error: 'Unauthorized', message: req.method === 'GET' ? 'Object not found' : 'new row violates row-level security policy' });
        if (req.method === 'GET') {
          const f = files.get(key); if (!f) return send(res, 400, { statusCode: '404', error: 'not_found', message: 'Object not found' });
          return send(res, 200, f.body, f.type);
        }
        if (files.has(key) && req.method === 'POST' && req.headers['x-upsert'] !== 'true') return send(res, 400, { statusCode: '409', error: 'Duplicate', message: 'The resource already exists' });
        files.set(key, { body: raw, type: req.headers['content-type'] || 'application/octet-stream' });
        return send(res, 200, { Key: key });
      }
      const s2 = p.match(/^\/storage\/v1\/object\/([a-z0-9-]+)$/);
      if (s2 && req.method === 'DELETE') {
        const w = who(req); if (!w.uid) return send(res, 400, { statusCode: '403', error: 'Unauthorized', message: 'jwt expired' });
        const gone = [];
        for (const pre of (json().prefixes || [])) { const key = s2[1] + '/' + pre; if (pre.split('/')[0] === w.uid && files.delete(key)) gone.push({ name: pre }); }
        return send(res, 200, gone);
      }
      // ---------------- the photo-reading Edge Function (the real code, with a stand-in for the AI service) ----------------
      if (p === '/functions/v1/gd-meal-photo') {
        if (!state.fn) return send(res, 404, { code: 'NOT_FOUND', message: 'Requested function was not found' });
        const { handler } = await import('./functions/gd-meal-photo/index.ts');
        const self = 'http://127.0.0.1:' + server.address().port;
        const env = k => ({ SUPABASE_URL: self, GEMINI_API_KEY: state.aiKey ? 'stand-in-key' : undefined })[k];
        const ai = async (u, init) => {
          if (String(u).startsWith(self)) return fetch(u, init);
          state.calls.push('AI ' + new URL(u).hostname);
          const reply = (st, body) => new Response(JSON.stringify(body), { status: st, headers: { 'content-type': 'application/json' } });
          if (state.ai === 'busy') return reply(429, { error: { message: 'quota' } });
          const items = state.ai === 'nofood' ? [] : [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }, { name: 'Dal, 1 bowl', kcal: 180, protein: 10 }];
          return reply(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ items, note: 'The oil is hard to see.' }) }] } }] });
        };
        const out = await handler(new Request(self + p, { method: req.method, headers: req.headers, body: raw }), env, ai);
        return send(res, out.status, JSON.parse(await out.text()));
      }
      send(res, 404, { message: 'not found: ' + req.method + ' ' + p });
    } catch (e) { send(res, 500, { message: String(e && e.message || e) }); }
  });
  await new Promise(r => server.listen(opts.port || 0, '127.0.0.1', r));
  return { server, db, state, port: server.address().port, url: 'http://127.0.0.1:' + server.address().port, close: () => new Promise(r => server.close(r)) };
}
module.exports = { createMock };
if (require.main === module) createMock({ port: +(process.argv[2] || 54321), ttl: +(process.argv[3] || 3600) }).then(m => console.log('mock supabase on ' + m.url));
