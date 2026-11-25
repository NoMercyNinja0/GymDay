// The photo-reading function, run under Node with stand-ins for the database check and the three AI services.
import assert from 'node:assert/strict';
import { tidyNut, promptFor, NUT_HEAD, kcalOf } from './functions/gd-meal-photo/index.ts';
import { tidyShot, tidyPack, tidyProgram, SHOT_HEAD, PACK_HEAD, PROGRAM_HEAD, RECIPE_URL_HEAD } from './functions/gd-meal-photo/index.ts';
import { tidyHidden, HID_KINDS, HID_RULES } from './functions/gd-meal-photo/index.ts';
import { handler, tidy, tidyLabel, tidySupp, tidyQuestions, tidyAnswers, tidyWeb, tidyWorkout, tidyDay, tidyLeft, WEB_HEAD, LIMITS, tidyMachine, MACHINE_HEAD, tidyMenu, tidyOrder, tidyRecipe, tidyFridge, MENU_HEAD, ORDER_HEAD, RECIPE_HEAD, FRIDGE_HEAD } from './functions/gd-meal-photo/index.ts';

const IMG = 'A'.repeat(4000);
const GOOD = JSON.stringify({ items: [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }, { name: 'Dal, 1 bowl', kcal: 180.4, protein: 10.26 }], note: 'Oil is hard to see.' });
const res = (status, body) => new Response(typeof body === 'string' ? body : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
function world(o = {}) {
  const calls = [];
  const f = async (url, init = {}) => {
    const u = String(url), h = Object.fromEntries(Object.entries(init.headers || {}).map(([k, v]) => [k.toLowerCase(), v])), body = init.body ? JSON.parse(init.body) : null;
    calls.push({ u, h, body });
    if (u.endsWith('/rest/v1/rpc/gd_ai_use')) return o.rpc ? o.rpc(h) : res(200, 1);
    if (u.includes('generativelanguage.googleapis.com/v1beta/models?')) return res(200, { models: o.models || [] });
    if (u.includes('generativelanguage.googleapis.com')) return o.gemini ? o.gemini(u, body) : res(200, { candidates: [{ content: { parts: [{ text: GOOD }] } }] });
    if (u.includes('api.anthropic.com')) return o.claude ? o.claude(body) : res(200, { content: [{ type: 'thinking', thinking: 'hm' }, { type: 'text', text: '```json\n' + GOOD + '\n```' }] });
    if (u.includes('api.openai.com')) return o.openai ? o.openai(body) : res(200, { choices: [{ message: { content: GOOD } }] });
    throw new Error('unexpected call ' + u);
  };
  const vars = Object.assign({ SUPABASE_URL: 'https://proj.supabase.co/', SUPABASE_ANON_KEY: 'anon-env' }, o.env || {});
  return { f, calls, env: k => vars[k] };
}
const req = (body, headers = { authorization: 'Bearer user-token', apikey: 'pub-key' }, method = 'POST') =>
  new Request('https://proj.supabase.co/functions/v1/gd-meal-photo', { method, headers: { 'Content-Type': 'application/json', ...headers }, body: method === 'POST' ? (typeof body === 'string' ? body : JSON.stringify(body)) : undefined });
const run = async (w, r) => { const x = await handler(r, w.env, w.f); return { status: x.status, cors: x.headers.get('access-control-allow-origin'), body: x.status === 200 && x.headers.get('content-type') === null ? await x.text() : await x.json().catch(() => null) }; };

// --- the browser's question before the real call, and things that are not a proper request
let w = world({ env: { GEMINI_API_KEY: 'g-key' } });
let r = await handler(req(null, {}, 'OPTIONS'), w.env, w.f); assert.equal(r.status, 200); assert.equal(r.headers.get('access-control-allow-origin'), '*'); assert.match(r.headers.get('access-control-allow-headers'), /authorization/); assert.equal(w.calls.length, 0);
r = await run(w, req(null, {}, 'GET')); assert.equal(r.status, 405);
r = await run(w, req({ image: IMG }, {})); assert.equal(r.status, 401); assert.equal(r.body.reason, 'signed_out'); assert.equal(r.cors, '*'); assert.equal(w.calls.length, 0, 'nothing is asked without a sign-in');
r = await run(w, req('not json')); assert.equal(r.status, 400);
r = await run(w, req({ image: 'short' })); assert.equal(r.status, 400); assert.match(r.body.message, /No photo/);
r = await run(w, req({ image: 'A'.repeat(2000001) })); assert.equal(r.status, 413);
r = await run(w, req({ image: IMG + '<script>' })); assert.equal(r.status, 400);
assert.equal(w.calls.length, 0, 'a bad request never reaches the database or the AI');

// --- no key on the server
w = world(); r = await run(w, req({ image: IMG })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_key'); assert.equal(r.body.code, 'P0001'); assert.match(r.body.message, /no AI key/); assert.equal(w.calls.length, 0);

// --- Gemini: the usual way
w = world({ env: { GEMINI_API_KEY: 'g-key' } }); r = await run(w, req({ image: 'data:image/png;base64,' + IMG }));
assert.equal(r.status, 200); assert.deepEqual(r.body, { items: [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }, { name: 'Dal, 1 bowl', kcal: 180, protein: 10.3 }], note: 'Oil is hard to see.', by: 'gemini' });
assert.equal(w.calls.length, 2);
assert.deepEqual([w.calls[0].u, w.calls[0].h.authorization, w.calls[0].h.apikey], ['https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'Bearer user-token', 'pub-key'], "the person's own sign-in is what gets counted");
assert.equal(w.calls[1].u, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-flash-latest:generateContent'); assert.equal(w.calls[1].h['x-goog-api-key'], 'g-key');
assert.deepEqual(w.calls[1].body.contents[0].parts[0], { inline_data: { mime_type: 'image/png', data: IMG } }); assert.equal(w.calls[1].body.generationConfig.responseMimeType, 'application/json');
assert.ok(!JSON.stringify(r.body).includes('g-key'));
// the app's key header is missing: the function's own is used
w = world({ env: { GEMINI_API_KEY: 'g-key' } }); await run(w, req({ image: IMG }, { authorization: 'Bearer t' })); assert.equal(w.calls[0].h.apikey, 'anon-env');

// --- the daily count and the sign-in are the database's call
w = world({ env: { GEMINI_API_KEY: 'g' }, rpc: () => res(400, { code: 'P0001', message: 'That is enough photos for today. Type the calories for this one.' }) });
r = await run(w, req({ image: IMG })); assert.equal(r.status, 429); assert.equal(r.body.reason, 'limit'); assert.match(r.body.message, /enough photos/); assert.equal(w.calls.length, 1, 'the AI is not asked past the limit');
w = world({ env: { GEMINI_API_KEY: 'g' }, rpc: () => res(401, { code: 'PGRST301', message: 'JWT expired' }) }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 401); assert.equal(w.calls.length, 1);
w = world({ env: { GEMINI_API_KEY: 'g' }, rpc: () => res(403, { code: '28000', message: 'Not signed in' }) }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 401);
w = world({ env: { GEMINI_API_KEY: 'g' }, rpc: () => res(404, { code: 'PGRST202', message: 'Could not find the function' }) }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'old_server');
w = world({ env: { GEMINI_API_KEY: 'g' }, rpc: () => { throw new Error('down'); } }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 502); assert.equal(w.calls.length, 1);

// --- Gemini: a retired model name is replaced by the newest Flash model the key can use
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: u => (u.includes('gemini-flash-latest') ? res(404, { error: { message: 'not found' } }) : res(200, { candidates: [{ content: { parts: [{ text: GOOD }] } }] })),
  models: [{ name: 'models/gemini-3.5-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-3.8-flash-lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-10.1-flash', supportedGenerationMethods: ['generateContent'] }, { name: 'models/gemini-embedding-2', supportedGenerationMethods: ['embedContent'] }, { name: 'models/gemini-3.8-flash-image', supportedGenerationMethods: ['generateContent'] }] });
r = await run(w, req({ image: IMG })); assert.equal(r.status, 200); assert.match(w.calls[3].u, /models\/gemini-10\.1-flash:generateContent$/);
// a model named by the owner is used as it is, and a wrong name is reported, not replaced
w = world({ env: { GEMINI_API_KEY: 'g', GD_AI_MODEL: 'gemini-9-flash' }, gemini: () => res(404, {}) }); r = await run(w, req({ image: IMG }));
assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_model'); assert.match(w.calls[1].u, /gemini-9-flash/); assert.equal(w.calls.length, 2);

// --- Claude and OpenAI, and choosing between several keys
w = world({ env: { ANTHROPIC_API_KEY: 'c-key' } }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 200); assert.equal(r.body.by, 'claude'); assert.equal(r.body.items.length, 2);
assert.deepEqual([w.calls[1].u, w.calls[1].h['x-api-key'], w.calls[1].h['anthropic-version'], w.calls[1].body.model], ['https://api.anthropic.com/v1/messages', 'c-key', '2023-06-01', 'claude-haiku-5-5']);
assert.deepEqual(w.calls[1].body.messages[0].content[0], { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: IMG } });
w = world({ env: { OPENAI_API_KEY: 'o-key' } }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 200); assert.equal(r.body.by, 'openai');
assert.deepEqual([w.calls[1].u, w.calls[1].h.authorization, w.calls[1].body.model], ['https://api.openai.com/v1/chat/completions', 'Bearer o-key', 'gpt-6-luna']);
assert.equal(w.calls[1].body.reasoning_effort, 'low', 'the built-in model thinks only a little');
w = world({ env: { OPENAI_API_KEY: 'o-key', GD_AI_MODEL: 'gpt-4o' } }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 200);
assert.equal(w.calls[1].body.model, 'gpt-4o'); assert.equal('reasoning_effort' in w.calls[1].body, false, 'a model set by hand gets no thinking setting it may not know');
assert.equal(w.calls[1].body.messages[0].content[1].image_url.url, 'data:image/jpeg;base64,' + IMG);
w = world({ env: { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'c', OPENAI_API_KEY: 'o' } }); assert.equal((await run(w, req({ image: IMG }))).body.by, 'gemini');
w = world({ env: { GEMINI_API_KEY: 'g', ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: ' Anthropic ', GD_AI_MODEL: 'claude-sonnet-5-5' } }); r = await run(w, req({ image: IMG })); assert.equal(r.body.by, 'claude'); assert.equal(w.calls[1].body.model, 'claude-sonnet-5-5');
w = world({ env: { GEMINI_API_KEY: 'g', GD_AI_PROVIDER: 'openai' } }); assert.equal((await run(w, req({ image: IMG }))).body.by, 'gemini', 'a provider with no key falls back to one that has');

// --- when the AI service says no
for (const [st, reason, status] of [[429, 'ai_busy', 503], [403, 'bad_key', 503], [401, 'bad_key', 503], [400, 'ai_refused', 422], [500, 'ai_failed', 502]]) {
  w = world({ env: { GEMINI_API_KEY: 'secret-g-key' }, gemini: () => res(st, { error: { message: 'API key secret-g-key is bad' } }) }); r = await run(w, req({ image: IMG }));
  assert.equal(r.status, status, String(st)); assert.equal(r.body.reason, reason); assert.ok(!JSON.stringify(r.body).includes('secret-g-key'), "the service's own words are not passed on"); assert.equal(r.body.detail, 'gemini ' + st);
}
w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => { throw new Error('network'); } }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 502); assert.equal(r.body.detail, 'openai 504');
// no food in the picture, or an answer that is not what was asked for
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(200, { candidates: [{ content: { parts: [{ text: '{"items":[],"note":"A keyboard."}' }] } }] }) }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_food');
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(200, { candidates: [] }) }); assert.equal((await run(w, req({ image: IMG }))).status, 422);
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: 'I cannot help with that.' }] }) }); assert.equal((await run(w, req({ image: IMG }))).status, 422);

// --- tidying the answer
assert.deepEqual(tidy('Here you go:\n```json\n{"items":[{"name":"  Idli,   2 ","kcal":"100","protein":"4.04"},{"name":"","kcal":50},{"name":"Bad","kcal":-5},{"name":"Huge","kcal":99999},{"name":"Chai","calories":90}],"note":123}\n```'),
  { items: [{ name: 'Idli, 2', kcal: 100, protein: 4 }, { name: 'Chai', kcal: 90, protein: 0 }], note: '' });
assert.equal(tidy(JSON.stringify({ items: Array.from({ length: 30 }, (_, i) => ({ name: 'x' + i, kcal: 1 })) })).items.length, 12);
assert.equal(tidy(JSON.stringify({ items: [{ name: 'y'.repeat(200), kcal: 1 }], note: 'n'.repeat(900) })).items[0].name.length, 60);
assert.deepEqual(tidy('nonsense'), { items: [], note: '' }); assert.deepEqual(tidy('{"items":"no"}'), { items: [], note: '' });
// --- v1.8: macros per item when the AI gives them
assert.deepEqual(tidy('{"items":[{"name":"Rice, 1 cup","kcal":205,"protein":4,"carbs":"44.6","fat":0.44,"fiber":0.6},{"name":"Water","kcal":0,"protein":0,"carbs":0}]}').items,
  [{ name: 'Rice, 1 cup', kcal: 205, protein: 4, carbs: 44.6, fat: 0.4, fibre: 0.6 }, { name: 'Water', kcal: 0, protein: 0 }]);
assert.match(w.calls.length >= 0 && (await (async () => { const x = world({ env: { GEMINI_API_KEY: 'g' } }); await run(x, req({ image: IMG })); return x.calls[1].body.contents[0].parts[1].text; })()), /carbohydrates, fat and fibre/);

// --- v1.8: the label on a supplement packet
const LBL = JSON.stringify({ label: { brand: ' MuscleBlaze ', product: 'Biozyme Performance Whey', kind: 'protein', serving_label: '1 scoop (33 g)', serving_g: 33, kcal: 131.6, protein: '25', carbs: 3.2, fat: 2.1, fibre: null, creatine_g: null, servings_per_pack: 30, net_g: 1000 }, note: 'Per serving column used.' });
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: (u, body) => res(200, { candidates: [{ content: { parts: [{ text: LBL }] } }] }) });
r = await run(w, req({ image: IMG, kind: 'label' }));
assert.equal(r.status, 200); assert.equal(r.body.by, 'gemini'); assert.equal(r.body.note, 'Per serving column used.');
assert.deepEqual(r.body.label, { brand: 'MuscleBlaze', product: 'Biozyme Performance Whey', kind: 'protein', serving_label: '1 scoop (33 g)', serving_g: 33, kcal: 132, protein: 25, carbs: 3.2, fat: 2.1, fibre: null, creatine_g: null, servings_per_pack: 30, net_g: 1000 });
assert.match(w.calls[1].body.contents[0].parts[1].text, /label on a supplement/); assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'a label read is counted like a meal photo');
// the same for Claude and OpenAI
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: LBL }] }) }); r = await run(w, req({ image: IMG, kind: 'label' })); assert.equal(r.body.label.protein, 25); assert.match(w.calls[1].body.messages[0].content[1].text, /ONE SERVING/);
w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: LBL } }] }) }); r = await run(w, req({ image: IMG, kind: 'label' })); assert.equal(r.body.label.kind, 'protein'); assert.match(w.calls[1].body.messages[0].content[0].text, /creatine/);
// nothing readable, odd numbers and an unknown kind
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(200, { candidates: [{ content: { parts: [{ text: '{"label":{"brand":null,"kcal":null}}' }] } }] }) });
r = await run(w, req({ image: IMG, kind: 'label' })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_label'); assert.match(r.body.message, /label/);
assert.deepEqual(tidyLabel('{"label":{"brand":"X","kind":"pills","kcal":99999,"protein":-3,"creatine_g":"5","serving_g":"5 g"}}').label,
  { brand: 'X', product: '', kind: 'other', serving_label: '', serving_g: null, kcal: null, protein: null, carbs: null, fat: null, fibre: null, creatine_g: 5, servings_per_pack: null, net_g: null });
assert.deepEqual(tidyLabel('no json'), { label: null, note: '' });
// the label's own words for busy and no key
w = world(); r = await run(w, req({ image: IMG, kind: 'label' })); assert.match(r.body.message, /Type what the label says/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, {}) }); r = await run(w, req({ image: IMG, kind: 'label' })); assert.match(r.body.message, /Type what the label says/);

// --- v1.8.1: up to N questions when the photo leaves something open, then a second read with the answers
const said = (x) => x.calls[1].body.contents[0].parts[1].text;
const gem = (obj) => () => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] });
const QS = [{ q: 'What is the white dish on the left?', options: ['Plain rice', 'Upma', 'Other', 'upma', 'Curd rice', 'Khichdi', 'Lemon rice'], multi: true },
  { q: '  How many   rotis are in the stack? ', options: [2, 3, 4], multi: 'true' }, { q: 'Was there sugar in the tea?', options: ['Yes', 'No', 'Not sure'] }, { q: 'Fourth?', options: ['a', 'b'] }];
// an app from before v1.8.1 sends no `ask`: the very same prompt as before, and no questions in the answer even if the AI adds some
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }], note: '', questions: QS }) });
r = await run(w, req({ image: IMG }));
assert.equal(r.status, 200); assert.equal('questions' in r.body, false, 'old apps never see questions');
assert.equal(said(w), `You are reading a photo of a meal for a calorie log.
List each distinct food or drink you can see. For each one give a short name that includes the portion you see (for example "Rice, 1 cup" or "Roti, 2"), your best estimate of its calories in kcal, and its protein, carbohydrates, fat and fibre in grams.
Indian home and restaurant dishes are common. Use the plate, bowl, hand or cutlery for scale. Count the oil, ghee or butter a dish is usually cooked with.
Give one realistic number per item, not a range. Do not add items you cannot see.
If the photo shows no food or drink, return an empty list.
Reply with JSON only, in exactly this shape:
{"items":[{"name":"Rice, 1 cup","kcal":205,"protein":4,"carbs":45,"fat":0.4,"fibre":0.6}],"note":"one short sentence on what was hard to judge, or an empty string"}`, 'the v1.8 prompt, word for word');
// ask: 3 → at most 3 questions, choices tidied (no "Other"/"Not sure", no repeats, at most 4), and the best guess kept for skipping
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }], note: 'Hard to tell.', questions: QS }) });
r = await run(w, req({ image: IMG, ask: 3 }));
assert.equal(r.status, 200); assert.equal(r.body.items.length, 1); assert.equal(r.body.note, 'Hard to tell.');
assert.deepEqual(r.body.questions, [{ q: 'What is the white dish on the left?', options: ['Plain rice', 'Upma', 'Curd rice', 'Khichdi'], multi: true },
  { q: 'How many rotis are in the stack?', options: ['2', '3', '4'], multi: true }, { q: 'Was there sugar in the tea?', options: ['Yes', 'No'], multi: false }]);
assert.match(said(w), /up to 3 short questions/); assert.match(said(w), /how much there was/); assert.match(said(w), /how it was cooked/); assert.match(said(w), /sugar in tea/);
assert.match(said(w), /"questions":\[\]\}$/, 'the shape asks for a questions list'); assert.match(said(w), /never add "Other"/);
assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use');
// a clear photo: an empty list of questions
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Idli, 2', kcal: 120, protein: 4 }], note: '', questions: [] }) });
r = await run(w, req({ image: IMG, ask: 3 })); assert.equal(r.status, 200); assert.deepEqual(r.body.questions, []);
// one question only, and odd values of ask
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Tea', kcal: 60 }], questions: QS }) });
r = await run(w, req({ image: IMG, ask: 1 })); assert.equal(r.body.questions.length, 1); assert.match(said(w), /ask the person one short question before/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Tea', kcal: 60 }], questions: QS }) });
r = await run(w, req({ image: IMG, ask: 99 })); assert.equal(r.body.questions.length, 4); assert.match(said(w), /up to 5 short questions/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Tea', kcal: 60 }], questions: QS }) });
r = await run(w, req({ image: IMG, ask: 'lots' })); assert.equal('questions' in r.body, false);
// nothing it can name yet, but questions to ask: still an answer; nothing and no questions: as before
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [], note: 'Too dark.', questions: [{ q: 'What is in the bowl?', options: ['Dal', 'Sambar', 'Rasam'] }] }) });
r = await run(w, req({ image: IMG, ask: 3 })); assert.equal(r.status, 200); assert.deepEqual(r.body.items, []); assert.equal(r.body.questions[0].options.length, 3);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [], questions: [] }) });
r = await run(w, req({ image: IMG, ask: 3 })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_food');
// the second read: the answers go to the AI, it is told not to ask again, and no questions come back even if it does
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Upma, 1 katori', kcal: 250, protein: 6 }], note: '', questions: QS }) });
r = await run(w, req({ image: IMG, ask: 3, answers: [{ q: 'What is the white dish on the left?', a: 'Upma' }, { q: 'How many rotis are in the stack?', a: '' }, { q: '', a: 'lost' }] }));
assert.equal(r.status, 200); assert.equal('questions' in r.body, false); assert.equal(r.body.items[0].name, 'Upma, 1 katori');
assert.match(said(w), /- What is the white dish on the left\? Answer: Upma\n- How many rotis are in the stack\? Answer: Not sure\n/);
assert.match(said(w), /Do not ask anything more/); assert.doesNotMatch(said(w), /"questions"/); assert.doesNotMatch(said(w), /You may ask/);
assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'the second read is counted too');
// Claude and OpenAI get the same words
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: JSON.stringify({ items: [{ name: 'Tea', kcal: 60 }], questions: QS }) }] }) });
r = await run(w, req({ image: IMG, ask: 2 })); assert.equal(r.body.questions.length, 2); assert.match(w.calls[1].body.messages[0].content[1].text, /up to 2 short questions/);
w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: JSON.stringify({ items: [{ name: 'Tea', kcal: 60 }], questions: QS }) } }] }) });
r = await run(w, req({ image: IMG, answers: [{ q: 'Sugar?', a: 'Yes, 2 spoons' }] })); assert.equal('questions' in r.body, false); assert.match(w.calls[1].body.messages[0].content[0].text, /Sugar\? Answer: Yes, 2 spoons/);
// labels: questions about what can't be read, with whatever was read kept
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ label: { brand: 'MuscleBlaze', product: null, kind: 'protein', kcal: null }, note: 'Flavour cut off.', questions: [{ q: 'Which flavour is it?', options: ['Rich Chocolate', 'Cafe Mocha', 'Other'] }, { q: 'How much is one scoop?', options: ['33 g', '35 g'] }] }) });
r = await run(w, req({ image: IMG, kind: 'label', ask: 3 }));
assert.equal(r.status, 200); assert.equal(r.body.label.brand, 'MuscleBlaze'); assert.deepEqual(r.body.questions.map(x => x.options), [['Rich Chocolate', 'Cafe Mocha'], ['33 g', '35 g']]);
assert.match(said(w), /label on a supplement/); assert.match(said(w), /which product or flavour/); assert.match(said(w), /"net_g":1000\},"note":"[^"]+","questions":\[\]\}$/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ label: { brand: null }, questions: [{ q: 'Is this whey protein or a mass gainer?', options: ['Whey protein', 'Mass gainer'] }] }) });
r = await run(w, req({ image: IMG, kind: 'label', ask: 3 })); assert.equal(r.status, 200); assert.equal(r.body.label, null); assert.equal(r.body.questions.length, 1);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ label: { brand: null }, questions: [] }) });
r = await run(w, req({ image: IMG, kind: 'label', ask: 3 })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_label');
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ label: { brand: 'MB', kcal: 130, protein: 25 }, questions: QS }) });
r = await run(w, req({ image: IMG, kind: 'label', answers: [{ q: 'How much is one scoop?', a: '35 g' }] }));
assert.equal('questions' in r.body, false); assert.match(said(w), /How much is one scoop\? Answer: 35 g/); assert.match(said(w), /ONE SERVING/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ image: IMG, kind: 'label' })); assert.equal(said(w).includes('questions'), false, 'old label prompt unchanged');
// the tidying on its own
assert.deepEqual(tidyQuestions('no', 3), []); assert.deepEqual(tidyQuestions(QS, 0), []); assert.deepEqual(tidyQuestions([null, 5, { q: '' }, { question: 'Q?', choices: [{ label: 'A' }, { text: 'B' }] }], 3), [{ q: 'Q?', options: ['A', 'B'], multi: false }]);
assert.equal(tidyQuestions([{ q: 'x'.repeat(400), options: ['y'.repeat(99)] }], 1)[0].q.length, 160); assert.equal(tidyQuestions([{ q: 'x', options: ['y'.repeat(99)] }], 1)[0].options[0].length, 50);
assert.deepEqual(tidyQuestions([{ q: 'Open question?' }], 3), [{ q: 'Open question?', options: [], multi: false }], 'a question with no choices is answered by typing');
assert.deepEqual(tidyAnswers([{ q: 'A?', a: 'yes' }, { q: 'B?', a: null }, { q: 'C?', a: 7 }, {}, 'x', { q: 'D?' }, { q: 'E?' }, { q: 'F?' }, { q: 'G?' }]),
  [{ q: 'A?', a: 'yes' }, { q: 'B?', a: 'Not sure' }, { q: 'C?', a: '7' }, { q: 'D?', a: 'Not sure' }, { q: 'E?', a: 'Not sure' }]);
assert.deepEqual(tidyAnswers('no'), []); assert.equal(tidyAnswers([{ q: 'Q?', a: 'z'.repeat(500) }])[0].a.length, 120);
assert.deepEqual(tidy('{"items":[{"name":"Tea","kcal":60}],"questions":[{"q":"Sugar?","options":["Yes","No"]}]}'), { items: [{ name: 'Tea', kcal: 60, protein: 0 }], note: '' }, 'tidy without ask leaves questions out');

// --- v1.9: Gemini thinks a little, a slow or failing model is tried once more with Flash-Lite, and each call leaves one log line
const logs = []; const log0 = console.log, err0 = console.error;
const quiet = () => { console.log = (...a) => logs.push(a.join(' ')); console.error = (...a) => logs.push(a.join(' ')); };
const loud = () => { console.log = log0; console.error = err0; };
const OKG = () => res(200, { candidates: [{ content: { parts: [{ text: 'thinking out loud', thought: true }, { text: GOOD }] } }] });
quiet();
try {
  // the usual read: Flash, asked to think only a little; thoughts the service sends back are not read as the answer
  w = world({ env: { GEMINI_API_KEY: 'AIzaSyFAKE-key-1234567890' }, gemini: OKG }); r = await run(w, req({ image: IMG, ask: 3 }));
  assert.equal(r.status, 200); assert.equal(r.body.items.length, 2); assert.equal(w.calls.length, 2);
  assert.deepEqual(w.calls[1].body.generationConfig, { responseMimeType: 'application/json', thinkingConfig: { thinkingLevel: 'low' } });
  assert.match(logs.at(-1), /gemini-flash-latest answered in \d+ ms/);
  // Google busy (503): Flash-Lite answers instead, with no thinking setting of its own
  logs.length = 0;
  w = world({ env: { GEMINI_API_KEY: 'AIzaSyFAKE-key-1234567890' }, gemini: u => (u.includes('flash-lite') ? OKG() : res(503, { error: { code: 503, message: 'The model is overloaded. Please try again later.', status: 'UNAVAILABLE' } })) });
  r = await run(w, req({ image: IMG, ask: 3 })); assert.equal(r.status, 200); assert.equal(r.body.by, 'gemini');
  assert.deepEqual(w.calls.slice(1).map(c => c.u.split('/models/')[1]), ['gemini-flash-latest:generateContent', 'gemini-flash-lite-latest:generateContent']);
  assert.equal('thinkingConfig' in w.calls[2].body.generationConfig, false);
  assert.ok(logs.some(l => /gemini-flash-latest failed after \d+ ms: 503 The model is overloaded/.test(l)), logs.join('\n'));
  assert.ok(logs.some(l => /gemini-flash-lite-latest answered/.test(l)));
  // used up for the day on Flash (429): Flash-Lite has its own allowance
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: u => (u.includes('flash-lite') ? OKG() : res(429, { error: { message: 'Quota exceeded' } })) }); assert.equal((await run(w, req({ image: IMG }))).status, 200);
  // no answer in time: the call is cut off and Flash-Lite gets the rest of the time
  Object.assign(LIMITS, { total: 3000, first: 60, lite: 2000 });
  const hang = (body, init) => new Promise((_ok, no) => init.signal.addEventListener('abort', () => no(new DOMException('aborted', 'AbortError'))));
  const w2 = world({ env: { GEMINI_API_KEY: 'g' } }); const f0 = w2.f;
  w2.f = async (u, init = {}) => (String(u).includes('gemini-flash-latest:') ? (w2.calls.push({ u: String(u) }), hang(u, init)) : f0(u, init));
  logs.length = 0; const t0 = Date.now(); r = await run(w2, req({ image: IMG }));
  assert.equal(r.status, 200); assert.ok(Date.now() - t0 < 1500, 'cut off, not waited out'); assert.ok(logs.some(l => /gemini-flash-latest failed after \d+ ms: 504 no answer within/.test(l)), logs.join('\n'));
  // nothing answers: the person hears it couldn't be read, and the whole thing stays inside the time
  const w3 = world({ env: { GEMINI_API_KEY: 'g' } }); w3.f = async (u, init = {}) => (String(u).includes('googleapis') ? hang(u, init) : res(200, 1));
  Object.assign(LIMITS, { total: 400, first: 150, lite: 2000 }); const t1 = Date.now(); r = await run(w3, req({ image: IMG }));
  assert.equal(r.status, 502); assert.equal(r.body.reason, 'ai_failed'); assert.equal(r.body.detail, 'gemini 504'); assert.ok(Date.now() - t1 < 1200, 'never longer than the total');
  Object.assign(LIMITS, { total: 50000, first: 28000, lite: 25000 });
  // a model that doesn't know the thinking setting: asked again without it, same model
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: (u, body) => (body.generationConfig.thinkingConfig ? res(400, { error: { message: 'Thinking level is not supported for this model.' } }) : OKG()) });
  r = await run(w, req({ image: IMG })); assert.equal(r.status, 200); assert.equal(w.calls.length, 3); assert.equal(w.calls[2].u, w.calls[1].u);
  // a refused key and a photo the AI won't take are not sent to Flash-Lite
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(403, { error: { message: 'Permission denied' } }) }); r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'bad_key'); assert.equal(w.calls.length, 2);
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(400, { error: { message: 'Unable to process input image.' } }) }); r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'ai_refused'); assert.equal(w.calls.length, 3, 'once with, once without the thinking setting, no Flash-Lite');
  // the owner set Flash-Lite by hand: no second try with the same model
  w = world({ env: { GEMINI_API_KEY: 'g', GD_AI_MODEL: 'gemini-flash-lite-latest' }, gemini: () => res(500, {}) }); r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'ai_failed'); assert.equal(w.calls.length, 2);
  // the log never holds the key or the photo, even when the service's own words repeat the key
  logs.length = 0;
  w = world({ env: { GEMINI_API_KEY: 'AIzaSyFAKE-key-1234567890' }, gemini: () => res(500, { error: { message: 'Bad key AIzaSyFAKE-key-1234567890 sent ' + IMG.slice(0, 50) } }) }); r = await run(w, req({ image: IMG }));
  assert.equal(r.body.reason, 'ai_failed'); assert.ok(logs.length >= 3, logs.join('\n'));
  for (const l of logs) { assert.ok(!l.includes('AIzaSyFAKE'), l); assert.ok(!l.includes(IMG.slice(0, 40)), 'no photo in the log'); }
  assert.ok(logs.some(l => /gave up \(gemini 500\)/.test(l)));
} finally { loud(); }

// --- v1.9 snacks: apps that let the AI ask are told about homemade and packaged snacks; older apps get the old words
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, ask: 3 })); let t = said(w);
assert.match(t, /homemade or packaged/); assert.match(t, /groundnut, coconut, sunflower or palm oil, or ghee/); assert.match(t, /how much of it was eaten/); assert.match(t, /count only what was eaten/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, answers: [{ q: 'Is the murukku homemade or packaged?', a: 'Homemade' }] })); t = said(w);
assert.match(t, /Snacks are common too/); assert.match(t, /the oil a snack was fried in/); assert.match(t, /Answer: Homemade/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG })); t = said(w); assert.ok(!/Snacks are common/.test(t) && !/homemade or packaged/.test(t), 'apps before v1.8.1 get the old prompt word for word');
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, kind: 'label', ask: 3 })); assert.ok(!/Snacks are common/.test(said(w)), 'labels are not about snacks');

console.log('photo-reading function: all checks passed');

// --- v1.10: a vitamin or mineral label (kind "supp")
const SUP = { supp: { brand: ' HealthKart ', product: 'HK Vitals Multivitamin', form: 'tablet', serving_label: '1 tablet', items: [
  { key: 'vd', name: 'Vitamin D3', amount: 400, unit: 'IU' }, { key: 'ZN', name: 'Zinc (as zinc sulphate)', amount: '17', unit: 'mg' }, { key: 'b12', amount: 2.4, unit: 'µg' },
  { key: 'o3', name: 'EPA', amount: 180, unit: 'mg' }, { key: 'o3', name: 'DHA', amount: 120, unit: 'mg' }, { key: 'cr', name: 'Chromium', amount: 35, unit: 'mcg' },
  { key: 'va', amount: 0, unit: 'mcg' }, { key: 'vc', amount: 40, unit: 'grams?' }, { key: 'b9', amount: 200, unit: 'mcg' }, { key: 'vd', amount: 5, unit: 'mcg' }] }, note: 'Zinc worked out from zinc sulphate.' };
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(SUP) });
r = await run(w, req({ image: IMG, kind: 'supp' }));
assert.equal(r.status, 200); assert.equal(r.body.by, 'gemini'); assert.equal('questions' in r.body, false);
assert.deepEqual(r.body.supp, { brand: 'HealthKart', product: 'HK Vitals Multivitamin', form: 'tablet', serving_label: '1 tablet', items: [
  { key: 'vd', name: 'Vitamin D3', amount: 400, unit: 'IU' }, { key: 'zn', name: 'Zinc (as zinc sulphate)', amount: 17, unit: 'mg' }, { key: 'b12', name: '', amount: 2.4, unit: 'mcg' },
  { key: 'o3', name: 'EPA', amount: 300, unit: 'mg' }, { key: 'b9', name: '', amount: 200, unit: 'mcg' }] }, 'known keys only, EPA + DHA added, the second vitamin D line in other units left out');
assert.equal(r.body.note, 'Zinc worked out from zinc sulphate.');
assert.match(said(w), /vitamin, mineral, fish-oil or plant omega-3 supplement/); assert.match(said(w), /elemental zinc 22.5 mg/); assert.match(said(w), /"items":\[\{"key":"vd"/);
assert.doesNotMatch(said(w), /You may ask/); assert.doesNotMatch(said(w), /Snacks are common/); assert.doesNotMatch(said(w), /creatine/);
assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'counted like any other read');
// asking: blurred amounts, and the answers on the second read
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ supp: { brand: 'Uprise', items: [] }, questions: [{ q: 'How much vitamin D3 is in one capsule?', options: ['60000 IU', '1000 IU', 'Not sure'] }] }) });
r = await run(w, req({ image: IMG, kind: 'supp', ask: 3 }));
assert.equal(r.status, 200); assert.equal(r.body.supp.brand, 'Uprise'); assert.deepEqual(r.body.questions, [{ q: 'How much vitamin D3 is in one capsule?', options: ['60000 IU', '1000 IU'], multi: false }]);
assert.match(said(w), /up to 3 short questions/); assert.match(said(w), /blurred or cut off/); assert.match(said(w), /"questions":\[\]\}$/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ supp: { brand: 'Uprise', product: 'D3 60K', form: 'capsule', items: [{ key: 'vd', amount: 60000, unit: 'I.U.' }] } }) });
r = await run(w, req({ image: IMG, kind: 'supp', answers: [{ q: 'How much vitamin D3 is in one capsule?', a: '60000 IU' }] }));
assert.equal(r.status, 200); assert.deepEqual(r.body.supp.items, [{ key: 'vd', name: '', amount: 60000, unit: 'IU' }]); assert.equal(r.body.supp.form, 'capsule'); assert.equal('questions' in r.body, false);
assert.match(said(w), /Answer: 60000 IU/); assert.match(said(w), /name, serving size and numbers/); assert.doesNotMatch(said(w), /"questions"/);
// nothing readable: typing it in, in the label's words
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ supp: { brand: 'X', items: [{ key: 'herb', amount: 5, unit: 'mg' }] } }) });
r = await run(w, req({ image: IMG, kind: 'supp' })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_label'); assert.match(r.body.message, /No vitamins or minerals/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, {}) }); r = await run(w, req({ image: IMG, kind: 'supp' })); assert.match(r.body.message, /Type what the label says/);
w = world(); r = await run(w, req({ image: IMG, kind: 'supp' })); assert.match(r.body.message, /Type what the label says/);
// Claude and OpenAI read it with the same words
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: JSON.stringify(SUP) }] }) }); r = await run(w, req({ image: IMG, kind: 'supp' }));
assert.equal(r.body.supp.items.length, 5); assert.match(w.calls[1].body.messages[0].content[1].text, /vitamin, mineral, fish-oil or plant omega-3 supplement/);
w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: JSON.stringify(SUP) } }] }) }); r = await run(w, req({ image: IMG, kind: 'supp' }));
assert.equal(r.body.supp.items.length, 5);
// the checks on their own
assert.deepEqual(tidySupp('no json'), { supp: null, note: '' });
assert.deepEqual(tidySupp('{"supp":{"brand":"B","form":"pill","items":[{"key":"fe","amount":1e9,"unit":"mg"},{"key":"fe","amount":"x","unit":"mg"}]}}').supp, { brand: 'B', product: '', form: 'tablet', serving_label: '', items: [] });
assert.deepEqual(tidySupp('{"supp":{"name":"Zinc 50","items":[{"key":"zn","amount":50,"unit":"MG"}]}}', 2), { supp: { brand: '', product: 'Zinc 50', form: 'tablet', serving_label: '', items: [{ key: 'zn', name: '', amount: 50, unit: 'mg' }] }, note: '', questions: [] });
// the other two kinds are unchanged by this
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, kind: 'label' })); assert.doesNotMatch(said(w), /fish-oil/); assert.match(said(w), /label on a supplement or food packet/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG })); assert.doesNotMatch(said(w), /fish-oil/); assert.match(said(w), /photo of a meal/);
console.log('test_fn v1.10 supplement labels: ok');

// ---------------------------------------------------------------- v1.11: plant omega-3, strips, pieces, and meals eaten out
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ supp: { brand: 'Carbamide Forte', product: 'Flaxseed Oil 1000 mg', form: 'softgel', items: [{ key: 'al', name: 'Omega-3 (ALA)', amount: 0.5, unit: 'g' }, { key: 'o6', name: 'Omega-6', amount: 125, unit: 'mg' }] } }) });
r = await run(w, req({ image: IMG, kind: 'supp' }));
assert.equal(r.status, 200); assert.deepEqual(r.body.supp.items, [{ key: 'al', name: 'Omega-3 (ALA)', amount: 0.5, unit: 'g' }], 'ALA kept as al, omega-6 left out');
assert.match(said(w), /al plant omega-3 ALA/); assert.match(said(w), /never count the weight of the whole oil as omega-3/); assert.match(said(w), /"strip" for an oral strip/);
assert.equal(tidySupp('{"supp":{"brand":"WN","form":"strip","items":[{"key":"b12","amount":2.2,"unit":"mcg"}]}}').supp.form, 'strip');
// pieces: new apps are asked to count them; apps before v1.8.1 keep the v1.8 prompt word for word
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Chicken curry, 3 pieces with 1 katori gravy', kcal: 450, protein: 35, carbs: 10, fat: 30, fibre: 2 }], questions: [] }) });
r = await run(w, req({ image: IMG, ask: 2 })); assert.equal(r.status, 200); assert.match(said(w), /how many pieces you can see and how much gravy/); assert.doesNotMatch(said(w), /eaten out/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG })); assert.doesNotMatch(said(w), /pieces you can see/);
// a meal eaten out: the AI is told, with or without questions; labels never get it
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Butter chicken, 1 plate', kcal: 520, protein: 32, carbs: 14, fat: 38, fibre: 2 }], questions: [] }) });
r = await run(w, req({ image: IMG, ask: 2, out: 1 })); assert.equal(r.status, 200); assert.match(said(w), /This meal was eaten out, at a restaurant/); assert.match(said(w), /Restaurant portions are usually bigger/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Dosa', kcal: 300, protein: 6, carbs: 45, fat: 10, fibre: 3 }] }) });
r = await run(w, req({ image: IMG, out: 1, answers: [{ q: 'How many dosas?', a: '1' }] })); assert.equal(r.status, 200); assert.match(said(w), /eaten out/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, kind: 'label', out: 1 })); assert.doesNotMatch(said(w), /eaten out/);
console.log('test_fn v1.11 plant omega-3, strips, pieces, eating out: ok');


// ---------------------------------------------------------------- v1.12: each item's weight, and looking a dish up on the web
// grams: only apps that ask get it; everything else keeps its prompt word for word
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Rice, 1 cup', grams: 158.6, kcal: 205, protein: 4, carbs: 45, fat: 0.4 }, { name: 'Dal, 1 katori', grams: 'lots', kcal: 180, protein: 9 }], questions: [] }) });
r = await run(w, req({ image: IMG, ask: 2, grams: 1 })); assert.equal(r.status, 200);
assert.match(said(w), /For each item also give "grams": how much of it there is as served/); assert.match(said(w), /"name":"Rice, 1 cup","grams":160,"kcal":205/);
assert.equal(r.body.items[0].grams, 159); assert.equal(r.body.items[1].grams, undefined, 'a weight that is not a number is left out');
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, ask: 2 })); assert.doesNotMatch(said(w), /"grams"/, 'not asked, not told');
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG })); const old = said(w); assert.doesNotMatch(old, /"grams"|pieces you can see/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, grams: 1 })); assert.match(said(w), /"grams"/); assert.ok(said(w).startsWith(old.split('\n').slice(0, 2).join('\n')), 'the same opening');
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG, kind: 'label', grams: 1 })); assert.doesNotMatch(said(w), /"grams"/, 'labels never get it');
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Dosa', grams: 120, kcal: 300, protein: 6 }] }) });
r = await run(w, req({ image: IMG, grams: 1, answers: [{ q: 'How many dosas?', a: '1' }] })); assert.match(said(w), /"grams"/); assert.equal(r.body.items[0].grams, 120);

// the web: no photo, Google Search on gemini-2.5-flash, the pages it used
const ZING = { found: true, name: 'Chicken Zinger Burger', place: 'KFC India', serving: '1 burger (180 g)', grams: 180, kcal: 467.4, protein: 21, carbs: 45, fat: 22, fibre: 2, basis: 'Restaurant', estimated: ['fiber', 'fibre', 'kcal'], note: "From KFC India's menu.", alts: [] };
const ground = (obj, chunks) => () => res(200, { candidates: [{ content: { parts: [{ text: 'Here it is:\n```json\n' + JSON.stringify(obj) + '\n```' }] }, groundingMetadata: { groundingChunks: chunks } }] });
const CH = [{ web: { uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc', title: 'kfc.co.in' } }, { web: { uri: 'https://x/y', title: 'kfc.co.in' } }, { web: { uri: 'http://plain', title: 'old' } }, { web: { uri: 'https://www.swiggy.com/r', title: 'swiggy.com' } }];
w = world({ env: { GEMINI_API_KEY: 'g-key' }, gemini: ground(ZING, CH) });
r = await run(w, req({ kind: 'web', q: '  Zinger   burger ', where: 'KFC' }));
assert.equal(r.status, 200);
assert.deepEqual(r.body, { found: true, name: 'Chicken Zinger Burger', place: 'KFC India', serving: '1 burger (180 g)', kcal: 467, protein: 21, carbs: 45, fat: 22, basis: 'restaurant', estimated: ['fibre'], note: "From KFC India's menu.", alts: [],
  sources: [{ title: 'kfc.co.in', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/abc' }, { title: 'swiggy.com', uri: 'https://www.swiggy.com/r' }], fibre: 2, grams: 180, by: 'gemini' });
assert.equal(w.calls.length, 2); assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'counted like a photo');
assert.equal(w.calls[1].u, 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent');
assert.deepEqual(w.calls[1].body.tools, [{ google_search: {} }]); assert.equal(w.calls[1].body.generationConfig.responseMimeType, undefined); assert.deepEqual(w.calls[1].body.generationConfig.thinkingConfig, { thinkingBudget: 1024 });
const wp = w.calls[1].body.contents[0].parts; assert.equal(wp.length, 1, 'no photo'); assert.match(wp[0].text, /The person typed: "Zinger burger", from "KFC"/); assert.match(wp[0].text, /Swiggy or Zomato/); assert.match(wp[0].text, /Reply with JSON only/);
assert.equal(WEB_HEAD('Masala dosa', '').includes('from "'), false);
// not found: close matches, no numbers
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: ground({ found: false, name: '', kcal: 0, alts: ['Zinger Burger', 7, 'Classic Zinger', 'A', 'B'], note: 'Not on the menu.' }, []) });
r = await run(w, req({ kind: 'web', q: 'Zingy thing', where: 'KFC' })); assert.equal(r.status, 200); assert.deepEqual(r.body, { found: false, alts: ['Zinger Burger', 'Classic Zinger', 'A'], note: 'Not on the menu.', sources: [], by: 'gemini' });
assert.equal(tidyWeb('{"found":true,"name":"X","kcal":0}').found, false, 'no calories is not a find'); assert.equal(tidyWeb('nonsense').found, false);
assert.equal(tidyWeb('{"found":"true","name":"X","kcal":300,"protein":900,"basis":"blog"}').protein, 0); assert.equal(tidyWeb('{"found":true,"name":"X","kcal":300,"basis":"blog"}').basis, 'database');
// bad requests never reach the database or the AI
w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ kind: 'web', q: ' x ' })); assert.equal(r.status, 400); assert.equal(w.calls.length, 0);
r = await run(w, req({ kind: 'web', q: 'Zinger' }, {})); assert.equal(r.status, 401); assert.equal(w.calls.length, 0);
w = world(); r = await run(w, req({ kind: 'web', q: 'Zinger' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_key'); assert.match(r.body.message, /Take a photo/);
// the free model retired or search refused on it: the newest Flash is tried once
let seenWeb = []; w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: (u, b) => { seenWeb.push(u); return u.includes('2.5') ? res(404, { error: { message: 'gone' } }) : ground(ZING, CH)(); } });
r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.status, 200); assert.equal(r.body.found, true);
assert.ok(seenWeb[1].includes('/gemini-flash-latest:'), seenWeb.join()); assert.deepEqual(w.calls[2].body.generationConfig.thinkingConfig, { thinkingLevel: 'low' });
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(400, { error: { message: 'Search grounding is not supported' } }) });
r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_web'); assert.match(r.body.message, /Take a photo/); assert.equal(w.calls.length, 3, 'two tries, no more');
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, { error: { message: 'quota' } }) });
r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.body.reason, 'ai_busy'); assert.match(r.body.message, /free searches/);
w = world({ env: { GEMINI_API_KEY: 'g', GD_WEB_MODEL: 'gemini-9-flash' }, gemini: ground(ZING, []) }); await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.ok(w.calls[1].u.includes('/gemini-9-flash:'));
// Claude: its web search tool and the pages it read; ChatGPT's key: a photo instead
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'server_tool_use', name: 'web_search' }, { type: 'web_search_tool_result', content: [{ type: 'web_search_result', url: 'https://www.zomato.com/kfc', title: 'KFC menu - Zomato' }, { url: 'https://www.zomato.com/kfc' }] }, { type: 'text', text: 'Found it. ' }, { type: 'text', text: JSON.stringify(ZING) }] }) });
r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.status, 200); assert.equal(r.body.kcal, 467); assert.deepEqual(r.body.sources, [{ title: 'KFC menu - Zomato', uri: 'https://www.zomato.com/kfc' }]); assert.equal(r.body.by, 'claude');
assert.equal(w.calls[1].body.tools[0].type, 'web_search_20250305'); assert.equal(w.calls[1].body.tools[0].max_uses, 3);
w = world({ env: { OPENAI_API_KEY: 'o' } }); r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_web'); assert.equal(w.calls.length, 0, 'not counted, no AI call');
console.log('test_fn v1.12 grams and web lookup: ok');

// ---------------------------------------------------------------- v1.12: several photos, and workout screenshots
const IMG2 = 'B'.repeat(3000), IMG3 = 'data:image/png;base64,' + 'C'.repeat(3000);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ items: [{ name: 'Rice, 1 cup', kcal: 205, protein: 4 }, { name: 'Dal, 1 katori', kcal: 180, protein: 9 }], questions: [] }) });
r = await run(w, req({ images: [IMG, IMG2, IMG3], ask: 2, grams: 1 })); assert.equal(r.status, 200); assert.equal(r.body.items.length, 2);
let parts = w.calls[1].body.contents[0].parts; assert.equal(parts.length, 4);
assert.deepEqual(parts.slice(0, 3).map(x => x.inline_data.mime_type), ['image/jpeg', 'image/jpeg', 'image/png']); assert.equal(parts[2].inline_data.data, 'C'.repeat(3000));
assert.match(parts[3].text, /There are 3 photos of the same meal/); assert.match(parts[3].text, /list each food once/); assert.ok(parts[3].text.indexOf('There are 3 photos') < parts[3].text.indexOf('Reply with JSON'));
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ images: [IMG] })); assert.doesNotMatch(said(w), /There are/, 'one photo: the prompt as before');
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ image: IMG })); const one = said(w);
w = world({ env: { GEMINI_API_KEY: 'g' } }); await run(w, req({ images: [IMG, IMG2] })); assert.equal(w.calls[1].body.contents[0].parts[2].text.replace(/\nThere are 2 photos[^\n]*/, ''), one, 'two photos: the same prompt plus one line');
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ supp: { brand: 'WN', product: 'Omega', form: 'softgel', items: [{ key: 'al', amount: 0.5, unit: 'g' }] } }) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'supp' })); assert.equal(r.status, 200); assert.match(w.calls[1].body.contents[0].parts[2].text, /There are 2 photos of the same product/);
w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ images: [IMG, IMG2, IMG, IMG2, IMG] })); assert.equal(w.calls[1].body.contents[0].parts.length, 5, 'at most 4 photos');
w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ images: [IMG, 'short'] })); assert.equal(r.status, 400); assert.equal(w.calls.length, 0);
r = await run(w, req({ images: ['A'.repeat(1900000), 'A'.repeat(1900000), 'A'.repeat(1900000), 'A'.repeat(1900000)] })); assert.equal(r.status, 413); assert.match(r.body.message, /too big together/);
w = world({ env: { ANTHROPIC_API_KEY: 'c' } }); await run(w, req({ images: [IMG, IMG2] })); assert.equal(w.calls[1].body.messages[0].content.filter(b => b.type === 'image').length, 2);
w = world({ env: { OPENAI_API_KEY: 'o' } }); await run(w, req({ images: [IMG, IMG2] })); assert.equal(w.calls[1].body.messages[0].content.filter(b => b.type === 'image_url').length, 2);
// workout screenshots
const WK = { app: 'Samsung Health', kcal: 312.4, kcal_kind: 'Active', avg_hr: 128, max_hr: 171, min_hr: 82, duration_min: 58.25, zones: [{ name: 'Zone 2 (fat burn)', min: 21, low: 115, high: 137 }, { name: '', min: 3 }, { zone: 'Peak', minutes: 4 }], steps: 'n/a', distance_km: null, other: [{ name: 'Training effect', value: 3.1 }, { name: 'x' }], note: 'Summary screen.' };
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(WK) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'workout', ctx: 'Mon 16 Nov, 7:05 pm, 58 min of chest and triceps' }));
assert.equal(r.status, 200);
assert.deepEqual(r.body.workout, { app: 'Samsung Health', kcal: 312, kcal_kind: 'active', avg_hr: 128, max_hr: 171, min_hr: 82, duration_min: 58.3, zones: [{ name: 'Zone 2 (fat burn)', min: 21, low: 115, high: 137 }, { name: 'Peak', min: 4, low: null, high: null }], steps: null, distance_km: null, other: [{ name: 'Training effect', value: '3.1' }] });
assert.equal(r.body.note, 'Summary screen.'); assert.equal(r.body.by, 'gemini'); assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'counted like a photo');
const wp2 = w.calls[1].body.contents[0].parts; assert.equal(wp2.length, 3); assert.match(wp2[2].text, /reading 2 screenshots from a fitness watch/); assert.match(wp2[2].text, /The workout in the log: Mon 16 Nov, 7:05 pm, 58 min of chest and triceps\./); assert.match(wp2[2].text, /Never guess a number/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ app: 'Fit', kcal: null, note: 'A step count screen.' }) });
r = await run(w, req({ images: [IMG], kind: 'workout' })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_data');
assert.equal(tidyWorkout('{"avg_hr":150,"max_hr":120,"min_hr":160}').workout.max_hr, null); assert.equal(tidyWorkout('{"avg_hr":150,"max_hr":120,"min_hr":160}').workout.min_hr, null);
assert.equal(tidyWorkout('nonsense').workout, null);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, { error: { message: 'quota' } }) }); r = await run(w, req({ images: [IMG], kind: 'workout' })); assert.equal(r.body.reason, 'ai_busy'); assert.match(r.body.message, /Type the calories/);
w = world(); r = await run(w, req({ images: [IMG], kind: 'workout' })); assert.equal(r.body.reason, 'no_key'); assert.match(r.body.message, /Reading screenshots/);
console.log('test_fn v1.12 several photos and workout screenshots: ok');

// ---------------------------------------------------------------- v1.13: a whole day's activity summary
const DAYR = { shows: 'day', app: 'Samsung Health', date: '2026-11-16', date_text: 'Mon, 16 Nov', steps: 8432.4, distance_km: 6.123, kcal_total: 2310, kcal_active: 540, active_min: 64, floors: null,
  hr_rest: 62, hr_avg: 78, hr_max: 164, hr_min: 55, zones: [{ name: 'Zone 2', min: 45, low: 115, high: 135 }, { name: 'Zone 3' }], sleep_min: 425, other: [{ name: 'Stress', value: '32, low' }], note: 'The Today screen.' };
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(DAYR) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'day', ctx: 'Today is Mon 16 Nov 2026; the day being logged is Mon 16 Nov 2026' }));
assert.equal(r.status, 200); assert.equal(r.body.shows, 'day'); assert.equal(r.body.by, 'gemini'); assert.equal(r.body.note, 'The Today screen.');
assert.deepEqual(r.body.day, { app: 'Samsung Health', date: '2026-11-16', date_text: 'Mon, 16 Nov', steps: 8432, distance_km: 6.12, kcal_total: 2310, kcal_active: 540, active_min: 64, floors: null,
  hr_rest: 62, hr_avg: 78, hr_max: 164, hr_min: 55, zones: [{ name: 'Zone 2', min: 45, low: 115, high: 135 }], sleep_min: 425, sleep_score: null, deep_min: null, rem_min: null, hrv_ms: null, other: [{ name: 'Stress', value: '32, low' }] });
assert.equal(w.calls[0].u, 'https://proj.supabase.co/rest/v1/rpc/gd_ai_use', 'counted like a photo');
const dp = w.calls[1].body.contents[0].parts; assert.equal(dp.length, 3); assert.match(dp[2].text, /activity summary for one whole day/); assert.match(dp[2].text, /Today is Mon 16 Nov 2026/); assert.match(dp[2].text, /"kcal_total"/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ shows: 'workout', kcal_active: 300, note: 'A workout summary.' }) });
r = await run(w, req({ images: [IMG], kind: 'day' })); assert.equal(r.status, 200); assert.equal(r.body.shows, 'workout'); assert.equal(r.body.day, null);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ shows: 'day', note: 'A settings page.' }) });
r = await run(w, req({ images: [IMG], kind: 'day' })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_data');
assert.equal(tidyDay('{"kcal_total":400,"kcal_active":600}').day.kcal_total, null, 'total under active: not a total');
assert.equal(tidyDay('{"date":"16 Nov","steps":10}').day.date, null, 'a date only as YYYY-MM-DD');
assert.equal(tidyDay('{"kcal_total":50000}').day, null);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, { error: { message: 'quota' } }) }); r = await run(w, req({ images: [IMG], kind: 'day' })); assert.equal(r.body.reason, 'ai_busy');
w = world(); r = await run(w, req({ images: [IMG], kind: 'day' })); assert.equal(r.body.reason, 'no_key');
w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: JSON.stringify(DAYR) }] }) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'day' })); assert.equal(r.body.day.steps, 8432); assert.equal(w.calls[1].body.messages[0].content.filter(b => b.type === 'image').length, 2);
console.log('test_fn v1.13 whole-day activity: ok');

// ---------------------------------------------------------------- v1.13: a night's sleep, for the Recovery screen
const SLR = { shows: 'day', app: 'Samsung Health', date: '2026-11-17', date_text: 'Tue, 17 Nov', sleep_min: 412, sleep_score: 81, deep_min: 70, rem_min: 96, hr_rest: 57, hrv_ms: 52.4, other: [{ name: 'SpO2', value: '96%' }], note: 'A sleep summary.' };
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(SLR) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'sleep', ctx: 'Today is Tue 17 Nov 2026; the night being logged ended this morning' }));
assert.equal(r.status, 200); assert.equal(r.body.shows, 'day');
assert.equal(r.body.day.sleep_min, 412); assert.equal(r.body.day.sleep_score, 81); assert.equal(r.body.day.deep_min, 70); assert.equal(r.body.day.rem_min, 96); assert.equal(r.body.day.hr_rest, 57); assert.equal(r.body.day.hrv_ms, 52);
const sp = w.calls[1].body.contents[0].parts; assert.equal(sp.length, 3); assert.match(sp[2].text, /sleep summary for one night/); assert.match(sp[2].text, /"hrv_ms"/); assert.match(sp[2].text, /night being logged ended this morning/);
assert.doesNotMatch(sp[2].text, /activity summary for one whole day/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ shows: 'day', note: 'A home screen.' }) });
r = await run(w, req({ images: [IMG], kind: 'sleep' })); assert.equal(r.status, 422); assert.match(r.body.message || r.body.error || '', /No sleep numbers/);
assert.equal(tidyDay('{"sleep_min":300,"deep_min":200,"rem_min":150}').day.deep_min, null, 'deep and REM bigger than the sleep: misread');
assert.equal(tidyDay('{"hrv_ms":900}').day, null, 'an HRV out of range is dropped');
assert.equal(tidyDay('{"hrv_ms":45}').day.hrv_ms, 45, 'an HRV alone is enough to keep');
console.log('test_fn v1.13 sleep: ok');

// ---------------------------------------------------------------- v1.13: leftovers on the plate
const LFR = { left: [{ i: 1, g: 42.4, share: 0.21 }, { i: 2, g: 0, share: 0 }, { i: 9, g: 10 }], note: 'Some rice is left.' };
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(LFR) });
r = await run(w, req({ images: [IMG, IMG2], kind: 'left', before: 1, lines: [{ name: 'Rice, cooked', g: 200 }, { name: 'Dal tadka', g: 150 }] }));
assert.equal(r.status, 200); assert.deepEqual(r.body.left, [{ i: 1, g: 42, share: 0.21 }, { i: 2, g: 0, share: 0 }]); assert.equal(r.body.note, 'Some rice is left.');
const lp = w.calls[1].body.contents[0].parts; assert.equal(lp.length, 3);
assert.match(lp[2].text, /The first photo shows a meal before it was eaten; the last photo shows what was left/); assert.match(lp[2].text, /1\. Rice, cooked, 200 g\n2\. Dal tadka, 150 g/); assert.match(lp[2].text, /"share"/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(LFR) });
r = await run(w, req({ images: [IMG], kind: 'left', lines: [{ name: 'Rice' }] })); assert.equal(r.status, 200);
assert.match(w.calls[1].body.contents[0].parts[1].text, /^The photo shows what was left on the plate/);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(LFR) });
r = await run(w, req({ images: [IMG], kind: 'left', lines: [] })); assert.equal(r.status, 400);
w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ left: [], note: 'An empty plate photo.' }) });
r = await run(w, req({ images: [IMG], kind: 'left', lines: [{ name: 'Rice', g: 100 }] })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_data');
assert.deepEqual(tidyLeft('{"left":[{"i":1,"share":1.5},{"i":1,"g":20},{"i":1,"g":30}]}', 1).left, [{ i: 1, g: 20, share: null }], 'a share over 1 is dropped; one answer a food');
console.log('test_fn v1.13 leftovers: ok');

// ---------------------------------------------------------------- v1.20: a photo of a gym machine (the coach was taken out in 1.21.2)
{
  const g = (txt) => () => res(200, { candidates: [{ content: { parts: [{ text: txt }] } }] });
  let w, r;
  // a coach question is now an ordinary request without a photo: refused before any AI call or count
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: g('{"answer":"hi"}') });
  r = await run(w, req({ kind: 'coach', q: 'how am I doing', ctx: 'Age 17.' }));
  assert.equal(r.status, 400); assert.equal(w.calls.length, 0, 'not counted, no AI call');
  // the machine: only ids from the person's list, other names, setup tips
  const LIST = ['lat-pulldown|Lat pulldown', 'seated-cable-row|Seated cable row', 'tricep-pushdown|Tricep pushdown', 'bad line', 'x|' + 'y'.repeat(200)];
  const MA = JSON.stringify({ is_gym: true, machine: 'Lat pulldown machine', ids: ['lat-pulldown', 'made-up', 'lat-pulldown', 'seated-cable-row'], other: ['Straight-arm pulldown', 'Close-grip pulldown', 'a', 'b'], setup: ['Lock your knees under the pad.', 'Grip a little wider than your shoulders.', '3', '4', '5'], note: '' });
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: g(MA) });
  r = await run(w, req({ kind: 'machine', images: [IMG], list: LIST }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.machine, { name: 'Lat pulldown machine', ids: ['lat-pulldown', 'seated-cable-row'], other: ['Straight-arm pulldown', 'Close-grip pulldown', 'a'], setup: ['Lock your knees under the pad.', 'Grip a little wider than your shoulders.', '3', '4'] });
  const mp = w.calls[1].body.contents[0].parts; assert.equal(mp.length, 2); assert.ok(mp[0].inline_data);
  assert.match(mp[1].text, /lat-pulldown\|Lat pulldown\nseated-cable-row\|Seated cable row\ntricep-pushdown\|Tricep pushdown\nx\|y/); assert.ok(!mp[1].text.includes('bad line'));
  r = await run(world({ env: { GEMINI_API_KEY: 'g' }, gemini: g('{"is_gym":false,"machine":"","ids":[]}') }), req({ kind: 'machine', images: [IMG], list: LIST })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_machine');
  r = await run(world({ env: { GEMINI_API_KEY: 'g' } }), req({ kind: 'machine', list: LIST })); assert.equal(r.status, 400, 'a machine needs a photo');
  assert.equal(tidyMachine('{"machine":"Smith machine","ids":["a"]}', new Set(['a'])).machine.ids[0], 'a');
  assert.match(MACHINE_HEAD(2, 'a|b'), /2 photos/);
  console.log('test_fn v1.20 machine (and no coach): ok');
}

// ---------------------------------------------------------------- 18 Nov 2026: the AI account is out of credit
{
  const NOCRED = () => res(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits.' } });
  const C = { env: { ANTHROPIC_API_KEY: 'c', GEMINI_API_KEY: 'g', GD_AI_PROVIDER: 'claude' }, claude: NOCRED };
  const OUT = "The app's AI allowance for this month is used up. ";
  const cases = [
    [{ image: IMG }, 'Type the calories for this one.'],
    [{ image: IMG, ask: 3 }, 'Type the calories for this one.'],
    [{ image: IMG, kind: 'label' }, 'Type what the label says.'],
    [{ image: IMG, kind: 'supp' }, 'Type what the label says.'],
    [{ kind: 'web', q: 'Zinger burger', where: 'KFC' }, 'Type the calories for now.'],
    [{ images: [IMG], kind: 'workout' }, 'Type the calories for now.'],
    [{ images: [IMG], kind: 'day' }, 'Type the numbers for now.'],
    [{ images: [IMG], kind: 'sleep' }, 'Type the numbers for now.'],
    [{ images: [IMG], kind: 'machine', list: ['lat-pulldown|Lat pulldown'] }, 'Find the exercise in your list for now.'],
    [{ images: [IMG, IMG2], kind: 'left', before: 1, lines: [{ name: 'Rice, cooked', g: 200 }] }, 'Type the grams instead.'],
  ];
  for (const [body, then] of cases) {
    const w = world(C), r = await run(w, req(body));
    assert.equal(r.status, 503, JSON.stringify(body)); assert.equal(r.body.reason, 'no_credit'); assert.equal(r.body.code, 'P0001');
    assert.equal(r.body.message, OUT + then); assert.match(r.body.detail, /^claude .*402$/);
    assert.equal(w.calls.filter(c => c.u.includes('api.anthropic.com')).length, 1, 'asked once, not again');
    assert.equal(w.calls.filter(c => c.u.includes('googleapis')).length, 0, 'never handed to Gemini');
  }
  // ChatGPT's maker says it with a 429
  let w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(429, { error: { message: 'You exceeded your current quota, please check your plan and billing details.', type: 'insufficient_quota' } }) });
  let r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'no_credit');
  // anything else is told as before
  w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Could not process image' } }) });
  r = await run(w, req({ image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'ai_refused');
  w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(429, { type: 'error', error: { type: 'rate_limit_error', message: 'Number of request tokens has exceeded your per-minute rate limit' } }) });
  r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'ai_busy');
  w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(401, { type: 'error', error: { type: 'authentication_error', message: 'invalid x-api-key' } }) });
  r = await run(w, req({ image: IMG })); assert.equal(r.body.reason, 'bad_key');
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(429, { error: { message: 'Resource has been exhausted (e.g. check quota).' } }) });
  r = await run(w, req({ images: [IMG], kind: 'workout' })); assert.equal(r.body.reason, 'ai_busy');
  // with both keys and GD_AI_PROVIDER=claude, Claude reads it; with only the Claude key, too
  w = world({ env: { ANTHROPIC_API_KEY: 'c', GEMINI_API_KEY: 'g', GD_AI_PROVIDER: 'claude' } }); r = await run(w, req({ image: IMG })); assert.equal(r.body.by, 'claude');
  w = world({ env: { ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: 'claude' } }); r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(w.calls[1].body.tools[0].type, 'web_search_20250305');
  console.log('test_fn out of credit: ok');
}
// one log line per Claude call: the model, the time and the tokens; never the key
{
  const lines = [], keep = [console.log, console.error];
  console.log = (...a) => lines.push(a.join(' ')); console.error = (...a) => lines.push('E ' + a.join(' '));
  try {
    const K = 'sk-ant-api03-' + 'x'.repeat(40);
    let w = world({ env: { ANTHROPIC_API_KEY: K }, claude: () => res(200, { content: [{ type: 'text', text: GOOD }], usage: { input_tokens: 1234, output_tokens: 210 } }) });
    let r = await run(w, req({ image: IMG })); assert.equal(r.status, 200);
    w = world({ env: { ANTHROPIC_API_KEY: K }, claude: () => res(200, { content: [{ type: 'text', text: '{"found":false}' }], usage: { input_tokens: 9000, output_tokens: 300, server_tool_use: { web_search_requests: 2 } } }) });
    await run(w, req({ kind: 'web', q: 'Zinger burger' }));
    w = world({ env: { ANTHROPIC_API_KEY: K }, claude: () => res(400, { type: 'error', error: { type: 'invalid_request_error', message: 'Your credit balance is too low to access the Anthropic API. Key ' + K } }) });
    await run(w, req({ image: IMG }));
  } finally { [console.log, console.error] = keep; }
  assert.match(lines[0], /^gd-meal-photo: claude-haiku-5-5 answered in \d+ ms \(1234 in, 210 out\)$/);
  assert.ok(lines.some(l => /^gd-meal-photo web: claude-haiku-5-5 answered in \d+ ms \(9000 in, 300 out, 2 searches\)$/.test(l)), lines.join('\n'));
  assert.ok(lines.some(l => /^E gd-meal-photo: claude-haiku-5-5 failed after \d+ ms: 402 Your credit balance is too low/.test(l)), lines.join('\n'));
  assert.ok(lines.every(l => !l.includes('sk-ant')), 'the key is never logged');
  console.log('test_fn Claude log lines: ok');
}

// v1.25: a restaurant's menu, one item with its choices, a recipe, and what is in the fridge
{
  const C = { ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: 'claude' }, txt = o => res(200, { content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: 'end_turn' });
  // --- the menu: names, calories only where shown, no repeats, at most 120, groups without items dropped
  const MENU = { found: true, place: 'Brew House India', as_of: 'November 2026', basis: 'restaurant', more: true, note: 'From its own menu page.',
    groups: [{ name: 'Hot coffee', items: [{ name: 'Flat White', serving: 'Short, 237 ml', kcal: 110, veg: true }, { name: ' Caffe   Latte ' }, { name: 'flat white', kcal: 999 }, { name: '' }, 'Americano', { name: 'Mocha', kcal: -4 }, { name: 'Tea', kcal: 99999 }] },
      { name: '', items: [{ name: 'Croissant', kcal: 231.6, veg: false }] }, { name: 'Empty', items: [] }], alts: [] };
  let m = tidyMenu(JSON.stringify(MENU), [{ title: 'Menu', uri: 'https://b.example/menu' }]);
  assert.deepEqual(m.groups, [{ name: 'Hot coffee', items: [{ name: 'Flat White', kcal: 110, serving: 'Short, 237 ml', veg: true }, { name: 'Caffe Latte' }, { name: 'Americano' }, { name: 'Mocha' }, { name: 'Tea' }] }, { name: 'Menu', items: [{ name: 'Croissant', kcal: 232, veg: false }] }]);
  assert.equal(m.found, true); assert.equal(m.place, 'Brew House India'); assert.equal(m.as_of, 'November 2026'); assert.equal(m.basis, 'restaurant'); assert.equal(m.more, true); assert.equal(m.sources.length, 1);
  assert.equal(tidyMenu(JSON.stringify({ ...MENU, basis: 'made up' })).basis, 'other site');
  assert.deepEqual(tidyMenu(JSON.stringify({ found: false, alts: ['Brew Haus', 'Brew Home', 'B', 'C'], note: 'No menu found.' })), { found: false, alts: ['Brew Haus', 'Brew Home', 'B'], note: 'No menu found.', sources: [] });
  assert.equal(tidyMenu(JSON.stringify({ found: true, groups: [] })).found, false, 'a menu with nothing on it was not found');
  assert.equal(tidyMenu('not json at all').found, false);
  const big = { found: true, groups: [{ name: 'All', items: Array.from({ length: 300 }, (_, i) => ({ name: 'Dish ' + i })) }] };
  assert.equal(tidyMenu(JSON.stringify(big)).groups[0].items.length, 120);
  // --- one item with its choices
  const ORD = { found: true, name: 'Flat White', place: 'Brew House India', build: 'Short, with whole milk', serving: 'Short (237 ml)', grams: 237, kcal: 110, protein: 7, carbs: 9, fat: 5, basis: 'restaurant', estimated: [],
    groups: [{ name: 'Size', one: true, sizes: true, options: [{ name: 'Picco', ml: 177, kcal: 85, protein: 5, carbs: 7, fat: 4, sel: true }, { name: 'Short', ml: 237, kcal: 110, protein: 7, carbs: 9, fat: 5 }, { name: 'Tall', ml: 354, kcal: 170, protein: 11, carbs: 14, fat: 8, sel: true }, { name: 'Ghost', ml: 100 }, { name: 'picco', kcal: 1 }] },
      { name: 'Milk', options: [{ name: 'Whole milk', kcal: 0 }, { name: 'Skimmed milk', kcal: -40, protein: 0.26, carbs: 0.5, fat: -5.04, scales: true, est: true, sel: true }, { name: 'Oat', kcal: -9999 }] },
      { name: 'Add-ons', one: false, options: [{ name: 'Extra shot', kcal: 3, usual: true, sel: true }, { name: 'Vanilla syrup', kcal: 20, carbs: 5, est: true }] },
      { name: 'Second sizes', sizes: true, options: [{ name: 'A', kcal: 10 }, { name: 'B', kcal: 20 }] }, { name: 'Nothing', options: [] }, { name: '', options: [{ name: 'X', kcal: 1 }] },
      { name: 'Seven', options: [{ name: 'Y', kcal: 1 }] }], alts: [] };
  let o = tidyOrder(JSON.stringify(ORD));
  assert.equal(o.found, true); assert.equal(o.kcal, 110); assert.equal(o.build, 'Short, with whole milk'); assert.equal(o.groups.length, 4, JSON.stringify(o.groups.map(g => g.name)));
  assert.deepEqual(o.groups[0], { name: 'Size', one: true, sizes: true, options: [{ name: 'Picco', kcal: 85, protein: 5, carbs: 7, fat: 4, ml: 177, sel: true }, { name: 'Short', kcal: 110, protein: 7, carbs: 9, fat: 5, ml: 237, usual: true }, { name: 'Tall', kcal: 170, protein: 11, carbs: 14, fat: 8, ml: 354 }] }, 'the size closest to the item is the usual one; only the first asked-for size stays');
  assert.deepEqual(o.groups[1], { name: 'Milk', one: true, options: [{ name: 'Whole milk', kcal: 0, protein: 0, carbs: 0, fat: 0, usual: true }, { name: 'Skimmed milk', kcal: -40, protein: 0.3, carbs: 0.5, fat: -5, scales: true, est: true, sel: true }] }, 'the choice that changes nothing is the usual one; a number out of range drops the choice');
  assert.deepEqual(o.groups[2], { name: 'Add-ons', one: false, options: [{ name: 'Extra shot', kcal: 3, protein: 0, carbs: 0, fat: 0, sel: true }, { name: 'Vanilla syrup', kcal: 20, protein: 0, carbs: 5, fat: 0, est: true }] });
  assert.deepEqual(o.groups[3], { name: 'Second sizes', one: true, options: [{ name: 'A', kcal: 10, protein: 0, carbs: 0, fat: 0, usual: true }, { name: 'B', kcal: 20, protein: 0, carbs: 0, fat: 0 }] }, 'only one group is the sizes');
  assert.deepEqual(tidyOrder(JSON.stringify({ ...ORD, groups: undefined })).groups, []);
  assert.equal(tidyOrder(JSON.stringify({ found: false, alts: ['Flat White'] })).found, false); assert.equal(tidyOrder(JSON.stringify({ ...ORD, kcal: 0 })).found, false);
  // --- what is asked and how: the prompts, five searches and the page reader for a menu, four and one for an item
  let seen = [];
  let w = world({ env: C, claude: b => { seen.push(b); return txt(MENU); } });
  let r = await run(w, req({ kind: 'menu', place: '  Brew   House ', where: 'Pune' }));
  assert.equal(r.status, 200); assert.equal(r.body.found, true); assert.equal(r.body.by, 'claude'); assert.equal(r.body.groups[0].items[0].name, 'Flat White');
  assert.equal(seen.length, 1); assert.equal(seen[0].max_tokens, 8000); assert.equal(seen[0].model, 'claude-haiku-5-5');
  assert.deepEqual(seen[0].tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'IN' } }, { type: 'web_fetch_20250910', name: 'web_fetch', max_uses: 2, max_content_tokens: 30000 }]);
  assert.equal(seen[0].messages.length, 1); assert.match(seen[0].messages[0].content, /The person typed: "Brew House", in or near "Pune"\./); assert.match(seen[0].messages[0].content, /Do not work out calories yourself/); assert.match(seen[0].messages[0].content, /Reply with JSON only/);
  assert.equal(MENU_HEAD('X', '').includes('in or near'), false);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt(ORD); } });
  r = await run(w, req({ kind: 'order', q: 'flat white picco  skimmed milk', place: 'Starbucks' }));
  assert.equal(r.status, 200); assert.equal(r.body.found, true); assert.equal(r.body.groups.length, 4); assert.equal(seen[0].max_tokens, 4000);
  assert.deepEqual(seen[0].tools.map(t => [t.type, t.max_uses]), [['web_search_20250305', 4], ['web_fetch_20250910', 1]]);
  assert.match(seen[0].messages[0].content, /The person typed: "flat white picco skimmed milk", from "Starbucks"\./); assert.match(ORDER_HEAD('a b', ''), /The person typed: "a b"\.\n/);
  // the plain web lookup is asked exactly as before
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt({ found: true, name: 'Zinger', kcal: 467 }); } });
  r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(r.body.found, true);
  assert.deepEqual(Object.keys(seen[0]), ['model', 'max_tokens', 'tools', 'messages']); assert.equal(seen[0].max_tokens, 3000);
  assert.deepEqual(seen[0].tools, [{ type: 'web_search_20250305', name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'IN' } }]);
  // the page reader refused (400): once more with the search alone; a second 400 is the end
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return b.tools.length > 1 ? res(400, { error: { message: 'web fetch is not enabled' } }) : txt(MENU); } });
  r = await run(w, req({ kind: 'menu', place: 'Brew House' })); assert.equal(r.status, 200); assert.equal(r.body.found, true); assert.equal(seen.length, 2); assert.equal(seen[1].tools.length, 1);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return res(400, { error: { message: 'no' } }); } });
  r = await run(w, req({ kind: 'menu', place: 'Brew House' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_web'); assert.equal(seen.length, 2);
  // a paused turn is sent back as it came and the pieces are read together (at most three requests)
  seen = []; const half = JSON.stringify(MENU), cut = 60;
  w = world({ env: C, claude: b => { seen.push(JSON.parse(JSON.stringify(b)));
    return seen.length === 1 ? res(200, { content: [{ type: 'server_tool_use', id: 's1', name: 'web_search', input: { query: 'brew house menu' } }, { type: 'web_search_tool_result', tool_use_id: 's1', content: [{ type: 'web_search_result', url: 'https://b.example/menu', title: 'Brew House menu', encrypted_content: 'ENC' }, { type: 'web_search_result', url: 'http://plain.example/', title: 'not https' }] }, { type: 'text', text: half.slice(0, cut) }], stop_reason: 'pause_turn' })
      : res(200, { content: [{ type: 'web_search_tool_result', tool_use_id: 's2', content: { type: 'web_search_tool_result_error', error_code: 'max_uses_exceeded' } }, { type: 'text', text: half.slice(cut) }], stop_reason: 'end_turn' }); } });
  r = await run(w, req({ kind: 'menu', place: 'Brew House' }));
  assert.equal(r.status, 200); assert.equal(r.body.found, true); assert.equal(r.body.groups.length, 2); assert.deepEqual(r.body.sources, [{ title: 'Brew House menu', uri: 'https://b.example/menu' }]);
  assert.equal(seen.length, 2); assert.equal(seen[1].messages.length, 2); assert.equal(seen[1].messages[1].role, 'assistant'); assert.equal(seen[1].messages[1].content[1].content[0].encrypted_content, 'ENC', 'sent back unchanged');
  seen = []; w = world({ env: C, claude: b => { seen.push(1); return res(200, { content: [{ type: 'text', text: '' }], stop_reason: 'pause_turn' }); } });
  r = await run(w, req({ kind: 'menu', place: 'Brew House' })); assert.equal(seen.length, 3); assert.equal(r.body.found, false);
  // what is not a proper ask, signed out, no key, and what each failure says
  w = world({ env: C });
  r = await run(w, req({ kind: 'menu', place: ' x ' })); assert.equal(r.status, 400); assert.match(r.body.message, /name of the place/); assert.equal(w.calls.length, 0);
  r = await run(w, req({ kind: 'order', q: 'a' })); assert.equal(r.status, 400); assert.match(r.body.message, /what you ordered/);
  r = await run(w, req({ kind: 'menu', place: 'Brew House' }, {})); assert.equal(r.status, 401);
  r = await run(world(), req({ kind: 'menu', place: 'Brew House' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_key');
  r = await run(world({ env: { OPENAI_API_KEY: 'o' } }), req({ kind: 'order', q: 'flat white' })); assert.equal(r.body.reason, 'no_web');
  for (const [st, reason, re] of [[402, 'no_credit', /used up\. Type the dish for now\./], [429, 'ai_busy', /busy just now/], [401, 'no_web', /can't search the web/], [404, 'no_model', /not found/], [500, 'ai_failed', /didn't answer/]]) {
    w = world({ env: C, claude: () => res(st === 402 ? 400 : st, { error: { message: st === 402 ? 'Your credit balance is too low to access the Anthropic API.' : 'x' } }) });
    r = await run(w, req({ kind: 'menu', place: 'Brew House' })); assert.equal(r.body.reason, reason, st + ' ' + JSON.stringify(r.body)); assert.match(r.body.message, re);
  }
  w = world({ env: C, rpc: () => res(400, { code: 'P0001', message: 'That is 40 today.' }) }); r = await run(w, req({ kind: 'order', q: 'flat white' })); assert.equal(r.status, 429); assert.equal(w.calls.length, 1);
  // Gemini still answers both with its own search
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(ORD) }] }, groundingMetadata: { groundingChunks: [{ web: { uri: 'https://s.example/n', title: 'Nutrition' } }] } }] }) });
  r = await run(w, req({ kind: 'order', q: 'flat white' })); assert.equal(r.status, 200); assert.equal(r.body.by, 'gemini'); assert.equal(r.body.groups.length, 4); assert.equal(r.body.sources.length, 1);

  // --- a recipe: from photos or from pasted text; ingredients and grams only
  const REC = { is_recipe: true, name: ' Paneer  butter masala ', serves: 4, serves_guess: false, items: [{ name: 'Paneer', grams: 250 }, { name: 'Butter', g: 30.26 }, { name: 'Cream', ml: 60 }, { name: '', grams: 5 }, { name: 'Air', grams: 0 }, { name: 'Tomato', grams: 400, kcal: 72 }], note: 'The last line was cut off.', kcal: 1800 };
  let rc = tidyRecipe(JSON.stringify(REC));
  assert.deepEqual(rc, { recipe: { name: 'Paneer butter masala', serves: 4, serves_guess: false, items: [{ name: 'Paneer', grams: 250 }, { name: 'Butter', grams: 30.3 }, { name: 'Cream', grams: 60 }, { name: 'Tomato', grams: 400 }] }, note: 'The last line was cut off.' }, 'no calories ever come through');
  assert.deepEqual(tidyRecipe(JSON.stringify({ ...REC, serves: null })).recipe.serves, 1); assert.equal(tidyRecipe(JSON.stringify({ ...REC, serves: 'a few' })).recipe.serves_guess, true);
  assert.equal(tidyRecipe(JSON.stringify({ is_recipe: false, note: 'A photo of a cat.' })).recipe, null); assert.equal(tidyRecipe(JSON.stringify({ is_recipe: true, items: [] })).recipe, null); assert.equal(tidyRecipe('??').recipe, null);
  assert.equal(tidyRecipe(JSON.stringify({ items: Array.from({ length: 80 }, (_, i) => ({ name: 'I' + i, grams: 1 })) })).recipe.items.length, 40);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt(REC); } });
  const PASTE = 'Paneer butter masala\r\n\r\n  250 g   paneer \n2 tbsp butter\n\n400 g tomatoes\nServes 4';
  r = await run(w, req({ kind: 'recipe', text: PASTE }));
  assert.equal(r.status, 200); assert.equal(r.body.recipe.items.length, 4); assert.equal(r.body.by, 'claude'); assert.equal(seen[0].tools, undefined);
  assert.deepEqual(seen[0].messages[0].content.map(c => c.type), ['text'], 'no photo goes with pasted text');
  assert.ok(seen[0].messages[0].content[0].text.includes('"""\nPaneer butter masala\n250 g paneer\n2 tbsp butter\n400 g tomatoes\nServes 4\n"""'), seen[0].messages[0].content[0].text.slice(0, 400));
  assert.match(seen[0].messages[0].content[0].text, /that the person pasted as text/); assert.match(seen[0].messages[0].content[0].text, /Do not give calories/);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt(REC); } });
  r = await run(w, req({ kind: 'recipe', images: [IMG, IMG] })); assert.equal(r.status, 200);
  assert.deepEqual(seen[0].messages[0].content.map(c => c.type), ['image', 'image', 'text']); assert.match(seen[0].messages[0].content[2].text, /from 2 photos \(a cookbook page/); assert.equal(RECIPE_HEAD(1, '').includes('from a photo'), true);
  r = await run(world({ env: C }), req({ kind: 'recipe', text: 'too short' })); assert.equal(r.status, 400); assert.match(r.body.message, /Paste the recipe, or take a photo/);
  r = await run(world({ env: C }), req({ kind: 'recipe' })); assert.equal(r.status, 400);
  r = await run(world({ env: C, claude: () => txt({ is_recipe: false }) }), req({ kind: 'recipe', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_recipe');
  r = await run(world({ env: C, claude: () => res(400, { error: { message: 'Your credit balance is too low to access the Anthropic API.' } }) }), req({ kind: 'recipe', image: IMG })); assert.equal(r.body.reason, 'no_credit'); assert.match(r.body.message, /Add the ingredients by hand/);
  r = await run(world({ env: C, claude: () => res(400, { error: { message: 'bad image' } }) }), req({ kind: 'recipe', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'ai_refused');
  r = await run(world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: JSON.stringify(REC) } }] }) }), req({ kind: 'recipe', text: PASTE })); assert.equal(r.status, 200); assert.equal(r.body.by, 'openai');

  // --- the fridge: what is seen, dishes as foods with grams, never a calorie
  const FR = { is_food: true, seen: ['Eggs', ' Paneer ', '', 'Spinach'], dishes: [{ name: 'Palak paneer with rotis', uses: ['Paneer', 'Spinach'], items: [{ name: 'Palak paneer', grams: 200, kcal: 300 }, { name: 'Roti', g: 60 }, { name: 'Nothing' }], mins: 30, how: ['Blanch the spinach', 'Fry the spices', 'Simmer'], kcal: 500 },
    { name: 'Just a name' }, { name: '', items: [{ name: 'X', grams: 5 }] }, { name: 'Egg bhurji', items: [{ name: 'Egg bhurji', grams: 150 }], mins: 'quick' }], note: '' };
  let fr = tidyFridge(JSON.stringify(FR));
  assert.deepEqual(fr, { food: true, seen: ['Eggs', 'Paneer', 'Spinach'], dishes: [{ name: 'Palak paneer with rotis', uses: ['Paneer', 'Spinach'], items: [{ name: 'Palak paneer', grams: 200 }, { name: 'Roti', grams: 60 }], how: ['Blanch the spinach', 'Fry the spices', 'Simmer'], mins: 30 }, { name: 'Egg bhurji', uses: [], items: [{ name: 'Egg bhurji', grams: 150 }], how: [] }], note: '' });
  assert.equal(tidyFridge(JSON.stringify({ is_food: false })).food, false); assert.equal(tidyFridge(JSON.stringify({ seen: ['Eggs'], dishes: [] })).food, false); assert.equal(tidyFridge('').food, false);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt(FR); } });
  r = await run(w, req({ kind: 'fridge', images: [IMG], ctx: ' vegetarian;   likes  eggs ' }));
  assert.equal(r.status, 200); assert.deepEqual(Object.keys(r.body), ['seen', 'dishes', 'note', 'by']); assert.equal(r.body.dishes.length, 2);
  assert.match(seen[0].messages[0].content[1].text, /About the person: vegetarian; likes eggs\./); assert.match(seen[0].messages[0].content[1].text, /Do not give calories/); assert.equal(FRIDGE_HEAD(2, '').includes('About the person'), false);
  r = await run(world({ env: C }), req({ kind: 'fridge' })); assert.equal(r.status, 400); assert.match(r.body.message, /No photo was sent/);
  r = await run(world({ env: C, claude: () => txt({ is_food: false }) }), req({ kind: 'fridge', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_food');
  // the kinds that were there before still read a photo the same way
  w = world({ env: C }); r = await run(w, req({ image: IMG })); assert.equal(r.status, 200); assert.equal(r.body.items.length, 2);
  r = await run(world({ env: C }), req({})); assert.equal(r.status, 400); assert.match(r.body.message, /No photo was sent/);
  console.log('test_fn v1.25 menus, orders, recipes, fridge: ok');
}

// ============================================================== v1.26: nutrients first, calories calculated from them
{
  const C = { ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: 'claude' }, txt = o => res(200, { content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: 'end_turn' });
  assert.equal(kcalOf(10, 20, 5), 165); assert.equal(kcalOf(10, 20, 5, 4, 3), 194);
  // an estimated food: grams x what 100 g holds; the AI's own calories are never used
  const RICE = { name: ' Rice,  1 cup ', grams: 160, kcal: 999, per100: { protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4, alcohol: 0 } };
  let n = tidyNut(JSON.stringify({ items: [RICE], note: ' Hard  to see the dal. ' }));
  assert.deepEqual(n, { items: [{ name: 'Rice, 1 cup', kcal: 202, protein: 4.3, grams: 160, carbs: 44.8, fat: 0.5, fibre: 0.6, how: 'nutrients', per100: { kcal: 126, protein: 2.7, carbs: 28, fat: 0.3, fibre: 0.4 } }], note: 'Hard to see the dal.' });
  const one = o => tidyNut(JSON.stringify({ items: [o] })).items[0];
  let b = one({ name: 'Beer, 1 bottle', grams: 330, per100: { protein: 0.5, carbs: 3.6, fat: 0, fibre: 0, alcohol: 3.9 } });
  assert.equal(b.kcal, 144); assert.equal(b.alcohol, 12.9); assert.equal(b.per100.alcohol, 3.9); assert.equal(b.fat, undefined);
  b = one({ name: 'Impossible', grams: 100, per100: { protein: 60, carbs: 60, fat: 30 } });                 // 150 g in 100 g: brought down to 100
  assert.deepEqual(b.per100, { kcal: 500, protein: 40, carbs: 40, fat: 20, fibre: 0 }); assert.equal(b.kcal, 500);
  assert.deepEqual(one({ name: 'Water, 1 glass', grams: 250, per100: { protein: 0, carbs: 0, fat: 0, fibre: 0 } }), { name: 'Water, 1 glass', kcal: 0, protein: 0, grams: 250, how: 'nutrients', per100: { kcal: 0, protein: 0, carbs: 0, fat: 0, fibre: 0 } });
  assert.deepEqual(one({ name: 'No weight', per100: { protein: 5 } }), { name: 'No weight', kcal: 0, protein: 0 }, 'no grams: nothing is worked out');
  assert.deepEqual(one({ name: 'No nutrients', grams: 80, kcal: 300 }), { name: 'No nutrients', kcal: 0, protein: 0, grams: 80 });
  assert.deepEqual(one({ name: 'Short keys', g: 100, per100: { p: 10, c: 10, f: 10, fiber: 5 } }).per100, { kcal: 180, protein: 10, carbs: 10, fat: 10, fibre: 5 });
  // a packet's printed table: copied, and counted for the amount had
  const BAR = { name: 'Protein bar (Brand), 1 bar', grams: 60, label: { basis: '100 g', kcal: 380, protein: 33, carbs: 35, fat: 12, fibre: 8, serving_g: 60, pack_g: 60 } };
  assert.deepEqual(one(BAR), { name: 'Protein bar (Brand), 1 bar', kcal: 228, protein: 19.8, grams: 60, carbs: 21, fat: 7.2, fibre: 4.8, how: 'label', per100: { kcal: 380, protein: 33, carbs: 35, fat: 12, fibre: 8 }, label: { printed: true, unit: 'g', serving_g: 60, pack_g: 60 } });
  b = one({ name: 'Chips, half the pack', grams: 45, label: { basis: 'Serving', kcal: 150, protein: 3, carbs: 18, fat: 7, serving_g: 30, pack_g: 90 } });
  assert.equal(b.per100.kcal, 500); assert.equal(b.kcal, 225); assert.equal(b.protein, 4.5); assert.deepEqual(b.label, { printed: true, unit: 'g', serving_g: 30, pack_g: 90 });
  b = one({ name: 'Juice, 1 glass', grams: 200, label: { basis: '100 ML', kcal: 45, protein: 0.5, carbs: 10.5, fat: 0 } });
  assert.equal(b.kcal, 90); assert.equal(b.label.unit, 'ml'); assert.equal(b.label.serving_g, undefined);
  b = one({ name: 'Muesli', grams: 50, label: { basis: '100 g', kcal: null, protein: 10, carbs: 60, fat: 20, fibre: 5 } });
  assert.equal(b.per100.kcal, 470); assert.equal(b.kcal, 235); assert.equal(b.label.printed, false, 'no energy printed: calculated from the printed nutrients');
  b = one({ name: 'kJ as kcal', grams: 100, label: { basis: '100 g', kcal: 1590, protein: 10, carbs: 60, fat: 20, fibre: 5 } });
  assert.equal(b.kcal, 470); assert.equal(b.label.printed, false);
  b = one({ name: 'One sachet', grams: 40, label: { basis: 'serving', kcal: 160, protein: 4, carbs: 24, fat: 5 } });           // no serving size printed: what was had is one serving
  assert.equal(b.kcal, 160); assert.equal(b.per100.kcal, 400); assert.equal(b.protein, 4);
  assert.deepEqual(one({ name: 'Odd column', grams: 40, label: { basis: 'per pack', kcal: 160 } }), { name: 'Odd column', kcal: 0, protein: 0, grams: 40 });
  assert.deepEqual(one({ name: 'Blurred', grams: 40, label: { basis: '100 g' } }), { name: 'Blurred', kcal: 0, protein: 0, grams: 40 });
  n = tidyNut(JSON.stringify({ items: Array.from({ length: 20 }, (_, i) => ({ name: 'Food ' + i, grams: 10, per100: { carbs: 10 } })).concat([{ name: '' }]), questions: [{ q: 'How much of the pack did you eat?', options: ['All of it', 'Half'] }] }), 3);
  assert.equal(n.items.length, 12); assert.equal(n.questions.length, 1); assert.equal(tidyNut('not json').items.length, 0);
  // the prompt: nutrients and grams, never calories; the old prompts are untouched
  const P1 = promptFor('meal', 0, [], false, true, 1, true);
  assert.ok(P1.startsWith(NUT_HEAD)); assert.match(P1, /never give calories for a food you estimate/); assert.match(P1, /"per100":\{"protein":2\.7/); assert.equal(/"kcal":205/.test(P1), false); assert.match(P1, /Snacks are common too/);
  assert.match(promptFor('meal', 3, [], true, true, 1, true), /eaten out[\s\S]*You may ask the person up to 3 short questions[\s\S]*"questions":\[\]\}$/);
  assert.match(promptFor('meal', 0, [{ q: 'How many rotis?', a: '3' }], false, true, 1, true), /- How many rotis\? Answer: 3[\s\S]*"per100"/);
  assert.match(promptFor('meal', 0, [], false, true, 2, true), /There are 2 photos of the same meal[\s\S]*Reply with JSON only/);
  for (const a of [['meal', 0, [], false, false, 1], ['meal', 3, [], false, true, 1], ['meal', 0, [], true, true, 2], ['label', 3, [], false, false, 1], ['supp', 0, [], false, false, 1]]) {
    assert.equal(promptFor(...a), promptFor(...a, false)); assert.equal(promptFor(...a).includes('per100'), false, 'older apps keep their prompts');
  }
  assert.equal(promptFor('label', 3, [], false, true, 1, true), promptFor('label', 3, [], false, true, 1), 'a label read is never changed by nut');
  // through the function
  let seen = [], w = world({ env: C, claude: x => { seen.push(x); return txt({ items: [RICE, BAR], note: '', questions: [] }); } });
  let r = await run(w, req({ image: IMG, grams: 1, nut: 1, ask: 3 }));
  assert.equal(r.status, 200); assert.equal(r.body.calc, 1); assert.deepEqual(r.body.items.map(x => [x.kcal, x.how]), [[202, 'nutrients'], [228, 'label']]); assert.deepEqual(r.body.questions, []);
  assert.match(seen[0].messages[0].content[1].text, /"per100"/); assert.match(seen[0].messages[0].content[1].text, /You may ask the person/);
  seen = []; w = world({ env: C, claude: x => { seen.push(x); return txt({ items: [{ name: 'Rice, 1 cup', grams: 160, kcal: 205, protein: 4 }] }); } });
  r = await run(w, req({ image: IMG, grams: 1 }));
  assert.equal(r.status, 200); assert.equal(r.body.calc, undefined); assert.equal(r.body.items[0].kcal, 205); assert.equal(seen[0].messages[0].content[1].text.includes('per100'), false, 'an app that does not ask for it gets what it always got');
  seen = []; w = world({ env: C, claude: x => { seen.push(x); return txt({ label: { brand: 'B', product: 'Whey', kind: 'protein', kcal: 120, protein: 24 } }); } });
  r = await run(w, req({ image: IMG, kind: 'label', nut: 1 })); assert.equal(r.status, 200); assert.equal(r.body.label.kcal, 120); assert.equal(r.body.calc, undefined);
  r = await run(world({ env: C, claude: () => txt({ items: [] }) }), req({ image: IMG, grams: 1, nut: 1 })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_food');
  r = await run(world({ env: C, claude: () => txt({ items: [{ name: 'Mystery', grams: 100 }] }) }), req({ image: IMG, grams: 1, nut: 1 })); assert.equal(r.status, 200); assert.deepEqual(r.body.items, [{ name: 'Mystery', kcal: 0, protein: 0, grams: 100 }]);
  r = await run(world({ env: { GEMINI_API_KEY: 'g' }, gemini: () => res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify({ items: [RICE] }) }] } }] }) }), req({ images: [IMG, IMG], grams: 1, nut: 1 })); assert.equal(r.status, 200); assert.equal(r.body.items[0].kcal, 202); assert.equal(r.body.by, 'gemini');
  console.log('test_fn v1.26 nutrients first: ok');
}

// ============================================================== v1.28: an order screenshot, a pack to compare, a program, a recipe from a link
{
  const C = { ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: 'claude' }, txt = o => res(200, { content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: 'end_turn' });
  // --- the order screenshot: items with their numbers, quantities 1-20, fees never items
  const SHOT = { found: true, place: ' Biryani  Blues ', app: 'Swiggy', note: '', items: [
    { name: 'Chicken dum biryani', qty: 2, build: 'Full', grams: 450, kcal: 812.4, protein: 38.26, carbs: 95, fat: 30, est: false, basis: 'restaurant' },
    { name: 'Gulab jamun (2 pcs)', qty: 0, kcal: 300, protein: 4, carbs: 50, fat: 10, est: true, basis: 'made up' },
    { name: 'Coke', quantity: 99, kcal: -5 }, { name: '' }, 'Raita' ] };
  let o = tidyShot(JSON.stringify(SHOT), [{ title: 'Menu', uri: 'https://b.example' }]);
  assert.equal(o.found, true); assert.equal(o.place, 'Biryani Blues'); assert.equal(o.app, 'Swiggy'); assert.equal(o.sources.length, 1);
  assert.deepEqual(o.items, [
    { name: 'Chicken dum biryani', qty: 2, build: 'Full', kcal: 812, protein: 38.3, carbs: 95, fat: 30, grams: 450, est: false, basis: 'restaurant' },
    { name: 'Gulab jamun (2 pcs)', qty: 1, kcal: 300, protein: 4, carbs: 50, fat: 10, est: true, basis: 'estimate' },
    { name: 'Coke', qty: 20 }]);
  assert.deepEqual(tidyShot(JSON.stringify({ found: false, note: 'Not an order.' })), { found: false, note: 'Not an order.', sources: [] });
  assert.equal(tidyShot(JSON.stringify({ found: true, items: [] })).found, false); assert.equal(tidyShot('nope').found, false);
  assert.equal(tidyShot(JSON.stringify({ found: true, items: Array.from({ length: 30 }, (_, i) => ({ name: 'D' + i, kcal: 1 })) })).items.length, 15);
  assert.match(SHOT_HEAD(1), /a screenshot of a food order/); assert.match(SHOT_HEAD(2), /2 screenshots/); assert.match(SHOT_HEAD(1), /Leave out delivery fees, taxes/);
  // through the function: the picture and the search in one call, with the page reader; Gemini gets the picture too
  let seen = [], w = world({ env: C, claude: b => { seen.push(b); return txt(SHOT); } });
  let r = await run(w, req({ kind: 'shot', images: [IMG, IMG] }));
  assert.equal(r.status, 200); assert.equal(r.body.found, true); assert.equal(r.body.items.length, 3); assert.equal(r.body.by, 'claude');
  assert.equal(seen[0].max_tokens, 6000); assert.deepEqual(seen[0].tools.map(t => [t.type, t.max_uses]), [['web_search_20250305', 6], ['web_fetch_20250910', 1]]);
  const c0 = seen[0].messages[0].content; assert.equal(c0.length, 3); assert.equal(c0[0].type, 'image'); assert.equal(c0[0].source.data, IMG); assert.match(c0[2].text, /2 screenshots of a food order[\s\S]*Reply with JSON only/);
  let gseen = []; w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: (u, b) => { gseen.push([u, b]); return res(200, { candidates: [{ content: { parts: [{ text: JSON.stringify(SHOT) }] } }] }); } });
  r = await run(w, req({ kind: 'shot', image: IMG })); assert.equal(r.status, 200); assert.equal(r.body.by, 'gemini');
  assert.match(gseen[0][0], /gemini-2\.5-flash/); assert.deepEqual(gseen[0][1].tools, [{ google_search: {} }]); assert.equal(gseen[0][1].contents[0].parts[0].inline_data.data, IMG);
  r = await run(world({ env: C, claude: () => txt({ found: false }) }), req({ kind: 'shot', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_order');
  r = await run(world({ env: { OPENAI_API_KEY: 'o' } }), req({ kind: 'shot', image: IMG })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_web');
  r = await run(world({ env: C }), req({ kind: 'shot' })); assert.equal(r.status, 400, 'a screenshot is needed');
  r = await run(world({ env: C, claude: () => res(429, { error: { message: 'busy' } }) }), req({ kind: 'shot', image: IMG })); assert.equal(r.status, 503); assert.match(r.body.message, /web search is busy/);
  // the plain web lookup still sends just its words
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt({ found: true, name: 'Zinger', kcal: 467 }); } });
  r = await run(w, req({ kind: 'web', q: 'Zinger burger' })); assert.equal(typeof seen[0].messages[0].content, 'string');

  // --- a pack: per 100 g, sugars, salt from sodium, kJ read as kcal, per serving turned into per 100 g
  let p = tidyPack(JSON.stringify({ pack: { brand: ' Lays ', product: 'Classic salted', basis: 'per 100 g', kcal: 544, protein: 6.8, carbs: 52, sugars: 1.2, added_sugars: null, fat: 34, sat_fat: 15.4, fibre: 3, sodium_mg: 590, net_g: 52, mrp: 20 }, note: '' }));
  assert.deepEqual(p.pack, { brand: 'Lays', product: 'Classic salted', unit: 'g', per100: { kcal: 544, protein: 6.8, carbs: 52, sugars: 1.2, added_sugars: null, fat: 34, sat_fat: 15.4, fibre: 3, salt_g: 1.5 }, net: 52, mrp: 20 });
  p = tidyPack(JSON.stringify({ pack: { product: 'Bar', basis: 'serving', serving_g: 40, kcal: 160, protein: 10, carbs: 18, sugars: 8, fat: 6, salt_g: 0.2 } }));
  assert.deepEqual(p.pack.per100, { kcal: 400, protein: 25, carbs: 45, sugars: 20, added_sugars: null, fat: 15, sat_fat: null, fibre: null, salt_g: 0.5 });
  p = tidyPack(JSON.stringify({ pack: { product: 'Juice', basis: '100 ml', kcal: 1900, protein: 0, carbs: 11, fat: 0 } }));
  assert.equal(p.pack.unit, 'ml'); assert.equal(p.pack.per100.kcal, 454, 'kJ read as kcal is turned into kcal');
  assert.equal(tidyPack(JSON.stringify({ pack: { basis: 'serving', kcal: 100, protein: 5 } })).pack, null, 'a serving with no weight cannot be compared');
  assert.equal(tidyPack(JSON.stringify({ pack: { basis: '100 g' } })).pack, null); assert.equal(tidyPack('x').pack, null);
  assert.match(PACK_HEAD(1), /per 100 g column/); assert.match(PACK_HEAD(2), /2 photos of the same packet/);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt({ pack: { product: 'Bar', basis: '100 g', kcal: 400, protein: 25, carbs: 45, fat: 15 } }); } });
  r = await run(w, req({ kind: 'pack', images: [IMG, IMG] })); assert.equal(r.status, 200); assert.equal(r.body.pack.per100.protein, 25); assert.equal(seen[0].tools, undefined, 'no web search for a label');
  r = await run(world({ env: C, claude: () => txt({ pack: {} }) }), req({ kind: 'pack', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_label');
  r = await run(world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: JSON.stringify({ pack: { basis: '100 g', kcal: 50, protein: 1 } }) } }] }) }), req({ kind: 'pack', image: IMG }));
  assert.equal(r.status, 200, 'OpenAI reads labels too');

  // --- a program: days in order, sets 1-10, a range of reps, seconds for holds, at most 7 days and 15 exercises
  let g = tidyProgram(JSON.stringify({ is_program: true, name: 'PPL', note: '', days: [
    { name: ' Push ', items: [{ name: 'Barbell bench press', sets: 4, reps: 8, reps_hi: 12, note: 'pause' }, { name: 'Plank', sets: 3, secs: 45 }, { name: 'Dips', sets: 40, reps: 300 }, { name: 'Odd', sets: 0, reps: 10, reps_hi: 5 }, { name: '' }] },
    { name: '', items: [{ name: 'Squat', sets: 5, reps: 5 }] }, { name: 'Empty', items: [] }] }));
  assert.deepEqual(g.program, { name: 'PPL', days: [
    { name: 'Push', items: [{ name: 'Barbell bench press', sets: 4, reps: 8, reps_hi: 12, note: 'pause' }, { name: 'Plank', sets: 3, secs: 45 }, { name: 'Dips', sets: 10, reps: 10 }, { name: 'Odd', sets: 3, reps: 10 }] },
    { name: 'Day 2', items: [{ name: 'Squat', sets: 5, reps: 5 }] }] });
  assert.equal(tidyProgram(JSON.stringify({ is_program: false, note: 'A shopping list.' })).program, null); assert.equal(tidyProgram('x').program, null);
  assert.equal(tidyProgram(JSON.stringify({ days: Array.from({ length: 9 }, () => ({ name: 'D', items: Array.from({ length: 20 }, (_, i) => ({ name: 'E' + i, sets: 3, reps: 10 })) })) })).program.days.length, 7);
  assert.match(PROGRAM_HEAD(1, ''), /from a photo \(a gym whiteboard/); assert.match(PROGRAM_HEAD(0, 'Day 1 bench 4x8'), /pasted as text[\s\S]*Day 1 bench 4x8/);
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt({ days: [{ name: 'A', items: [{ name: 'Squat', sets: 3, reps: 5 }] }] }); } });
  r = await run(w, req({ kind: 'program', text: 'Day A: squat 3x5, bench 3x5, row 3x5' })); assert.equal(r.status, 200); assert.equal(r.body.program.days[0].items[0].name, 'Squat');
  assert.deepEqual(seen[0].messages[0].content.map(c => c.type), ['text'], 'pasted text: no picture is sent'); assert.match(seen[0].messages[0].content[0].text, /squat 3x5/);
  r = await run(w, req({ kind: 'program', image: IMG })); assert.equal(r.status, 200); assert.equal(seen[1].messages[0].content[0].type, 'image');
  r = await run(world({ env: C }), req({ kind: 'program', text: 'short' })); assert.equal(r.status, 400); assert.match(r.body.message, /Paste the program/);
  r = await run(world({ env: C, claude: () => txt({ is_program: false }) }), req({ kind: 'program', image: IMG })); assert.equal(r.status, 422); assert.equal(r.body.reason, 'no_program');

  // --- a recipe from a link: the page reader, then the same recipe shape; a bad link is refused before anything is counted
  const REC = { is_recipe: true, name: 'Paneer bhurji', serves: 2, serves_guess: false, items: [{ name: 'Paneer', grams: 200 }, { name: 'Onion', grams: 110 }], note: '' };
  seen = []; w = world({ env: C, claude: b => { seen.push(b); return txt(REC); } });
  r = await run(w, req({ kind: 'recipe', url: 'https://www.youtube.com/watch?v=abc123' }));
  assert.equal(r.status, 200); assert.equal(r.body.recipe.name, 'Paneer bhurji'); assert.deepEqual(r.body.sources, []);
  assert.deepEqual(seen[0].tools.map(t => [t.type, t.max_uses]), [['web_search_20250305', 1], ['web_fetch_20250910', 2]]);
  assert.match(seen[0].messages[0].content, /Open this page with the web fetch tool: https:\/\/www\.youtube\.com\/watch\?v=abc123/); assert.match(RECIPE_URL_HEAD('https://x.example/r'), /never make one up/);
  const before = w.calls.length;
  r = await run(w, req({ kind: 'recipe', url: 'javascript:alert(1)' })); assert.equal(r.status, 400); assert.match(r.body.message, /link does not look right/); assert.equal(w.calls.length, before, 'nothing is counted');
  r = await run(world({ env: C, claude: () => txt({ is_recipe: false, note: 'The page needs a login.' }) }), req({ kind: 'recipe', url: 'https://www.instagram.com/p/xyz/' }));
  assert.equal(r.status, 422); assert.match(r.body.message, /^The page needs a login\. Some sites \(Instagram, for one\)/);
  r = await run(world({ env: { OPENAI_API_KEY: 'o' } }), req({ kind: 'recipe', url: 'https://x.example/r' })); assert.equal(r.status, 503); assert.equal(r.body.reason, 'no_web');
  // pasted text and photos are read as before
  seen = []; w = world({ env: { OPENAI_API_KEY: 'o' }, openai: b => { seen.push(b); return res(200, { choices: [{ message: { content: JSON.stringify(REC) } }] }); } });
  r = await run(w, req({ kind: 'recipe', text: 'Paneer bhurji: 200 g paneer, 1 onion, spices. Serves 2.' })); assert.equal(r.status, 200); assert.equal(r.body.sources, undefined);
  console.log('test_fn v1.28 order screenshots, packs, programs, recipe links: ok');
}

// ============================================================== v1.29: how it was made (what a photo can't show in a dish)
{
  const C = { ANTHROPIC_API_KEY: 'c', GD_AI_PROVIDER: 'claude' }, txt = o => res(200, { content: [{ type: 'text', text: JSON.stringify(o) }], stop_reason: 'end_turn' });
  // the list, checked: known kinds and types, one of each kind, grams in range
  assert.deepEqual(tidyHidden([{ kind: 'fat', type: 'Butter', grams: 5 }, { kind: 'salt', type: 'pink himalayan', grams: 1.5 }, { kind: 'fat', type: 'ghee', grams: 3 },
    { kind: 'msg', type: 'msg', grams: 1 }, { kind: 'pepper', grams: 0.3 }, { kind: 'milk', type: 'toned milk', ml: 120 }, { kind: 'sugar', type: 'jaggery', grams: 0 }, { kind: 'cream', type: 'malai', grams: 900 }]),
    [{ kind: 'fat', type: 'butter', grams: 5 }, { kind: 'salt', type: 'salt', grams: 1.5 }, { kind: 'pepper', type: 'black pepper', grams: 0.3 }, { kind: 'milk', type: 'toned milk', grams: 120 }]);
  assert.deepEqual(tidyHidden('nope'), []); assert.deepEqual(Object.keys(HID_KINDS), ['fat', 'salt', 'pepper', 'sugar', 'milk', 'sauce', 'cheese', 'cream']);
  assert.ok(HID_KINDS.sugar.includes('jaggery') && HID_KINDS.fat.includes('mustard oil') && HID_KINDS.milk.includes('double toned milk'));
  // a dish keeps its list; a packet's label never has one
  const OM = { name: 'Omelette, 2 eggs', grams: 110, per100: { protein: 11.5, carbs: 2.5, fat: 9, fibre: 0.4 }, hidden: [{ kind: 'fat', type: 'butter', grams: 5 }, { kind: 'salt', type: 'salt', grams: 1.5 }] };
  let n = tidyNut(JSON.stringify({ items: [OM, { name: 'Chips', grams: 30, label: { basis: '100 g', kcal: 500, protein: 6, carbs: 60, fat: 25 }, hidden: [{ kind: 'salt', grams: 1 }] }] }));
  assert.deepEqual(n.items[0].hidden, [{ kind: 'fat', type: 'butter', grams: 5 }, { kind: 'salt', type: 'salt', grams: 1.5 }]); assert.equal(n.items[1].hidden, undefined);
  assert.equal(n.items[0].kcal, Math.round(kcalOf(11.5, 2.5, 9, 0.4) * 1.1), 'the dish without what was hidden');
  // the prompt: only with hid and nut; everything else word for word as before
  const P = promptFor('meal', 3, [], false, true, 1, true, true);
  assert.ok(P.includes(HID_RULES) && /"hidden":\[\{"kind":"fat","type":"butter","grams":5\}/.test(P) && /You may ask the person up to 3 short questions/.test(P), P.slice(-600));
  assert.match(HID_RULES, /"fat" \(sunflower oil, groundnut oil, mustard oil/); assert.match(HID_RULES, /replaces the rule above/);
  assert.equal(promptFor('meal', 3, [], false, true, 1, true), promptFor('meal', 3, [], false, true, 1, true, false), 'apps that do not send hid');
  assert.equal(promptFor('meal', 3, [], false, true, 1, true).includes('How it was made'), false);
  assert.equal(promptFor('meal', 0, [], false, true, 1, false, true).includes('How it was made'), false, 'hid only together with nut');
  assert.match(promptFor('meal', 0, [{ q: 'Oil?', a: 'Butter' }], false, true, 2, true, true), /How it was made[\s\S]*Answer: Butter[\s\S]*There are 2 photos[\s\S]*"hidden"/);
  // through the function
  let seen = [], w = world({ env: C, claude: x => { seen.push(x); return txt({ items: [OM], note: '', questions: [] }); } });
  let r = await run(w, req({ image: IMG, grams: 1, nut: 1, hid: 1, ask: 3 }));
  assert.equal(r.status, 200); assert.deepEqual(r.body.items[0].hidden, [{ kind: 'fat', type: 'butter', grams: 5 }, { kind: 'salt', type: 'salt', grams: 1.5 }]);
  assert.ok(seen[0].messages[0].content[1].text.includes(HID_RULES));
  seen = []; w = world({ env: C, claude: x => { seen.push(x); return txt({ items: [OM] }); } });
  r = await run(w, req({ image: IMG, grams: 1, hid: 1 })); assert.equal(seen[0].messages[0].content[1].text.includes('How it was made'), false, 'without nut, hid changes nothing');
  r = await run(world({ env: C, claude: () => txt({ label: { brand: 'B', product: 'Whey', kind: 'protein', kcal: 120, protein: 24 } }) }), req({ image: IMG, kind: 'label', nut: 1, hid: 1 })); assert.equal(r.status, 200);
  console.log('test_fn v1.29 how it was made: ok');
}

// ---------------------------------------------------------------- 1.35.2 (60): watch screenshots up to 10, read together
{
  const TWELVE = Array.from({ length: 12 }, (_, i) => String.fromCharCode(65 + i).repeat(3000));
  let w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(SLR) });
  let r = await run(w, req({ images: TWELVE, kind: 'sleep', ctx: 'Today is Wed 25 Nov 2026; the night being logged ended this morning' }));
  assert.equal(r.status, 200); assert.equal(r.body.read, 10, 'sleep: the first 10 of 12 are read');
  let parts = w.calls[1].body.contents[0].parts; assert.equal(parts.length, 11); assert.match(parts[10].text, /reading 10 screenshots of a fitness watch/);
  assert.deepEqual(parts.slice(0, 10).map(p => p.inline_data.data[0]).join(''), 'ABCDEFGHIJ', 'in the order they were picked');
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(DAYR) }); r = await run(w, req({ images: TWELVE.slice(0, 7), kind: 'day' }));
  assert.equal(r.status, 200); assert.equal(r.body.read, 7); assert.equal(w.calls[1].body.contents[0].parts.length, 8);
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(WK) }); r = await run(w, req({ images: TWELVE, kind: 'workout' }));
  assert.equal(r.status, 200); assert.equal(r.body.read, 10); assert.equal(w.calls[1].body.contents[0].parts.length, 11); assert.match(w.calls[1].body.contents[0].parts[10].text, /reading 10 screenshots from a fitness watch/);
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem({ shows: 'workout', note: 'A workout.' }) }); r = await run(w, req({ images: TWELVE.slice(0, 2), kind: 'sleep' }));
  assert.equal(r.body.shows, 'workout'); assert.equal(r.body.read, 2);
  // everything else is still read 4 at a time
  w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ images: TWELVE })); assert.equal(w.calls[1].body.contents[0].parts.length, 5, 'a meal: 4 photos');
  assert.equal(r.body.read, undefined, 'a meal answer is as before');
  w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ images: TWELVE, kind: 'label' })); assert.equal(w.calls[1].body.contents[0].parts.length, 5, 'a label: 4 photos');
  w = world({ env: { GEMINI_API_KEY: 'g' } }); r = await run(w, req({ images: TWELVE, kind: 'shot' })); assert.ok(w.calls.filter(c => c.u.includes('generativelanguage')).every(c => c.body.contents[0].parts.filter(p => p.inline_data).length <= 4), 'an order screenshot: 4');
  // Claude and OpenAI get all 10 too
  w = world({ env: { ANTHROPIC_API_KEY: 'c' }, claude: () => res(200, { content: [{ type: 'text', text: JSON.stringify(SLR) }] }) }); r = await run(w, req({ images: TWELVE, kind: 'sleep' }));
  assert.equal(r.status, 200); assert.equal(r.body.read, 10); assert.equal(w.calls[1].body.messages[0].content.filter(b => b.type === 'image').length, 10);
  w = world({ env: { OPENAI_API_KEY: 'o' }, openai: () => res(200, { choices: [{ message: { content: JSON.stringify(WK) } }] }) }); r = await run(w, req({ images: TWELVE, kind: 'workout' }));
  assert.equal(r.status, 200); assert.equal(w.calls[1].body.messages[0].content.filter(b => b.type === 'image_url').length, 10);
  // the limit on all the pictures together still holds
  r = await run(world({ env: { GEMINI_API_KEY: 'g' } }), req({ images: Array(10).fill('A'.repeat(700000)), kind: 'sleep' })); assert.equal(r.status, 413); assert.match(r.body.message, /too big together/);
  console.log('test_fn 1.35.2 ten watch screenshots: ok');
}

// ---------------------------------------------------------------- 1.35.2 (60): a night in the words the app reads
{
  const { tidySleep, rangeOf } = await import('./functions/gd-meal-photo/index.ts');
  assert.deepEqual(rangeOf('1:00 – 8:35 AM'), ['1:00 AM', '8:35 AM']);
  assert.deepEqual(rangeOf('11:30 – 7:10 AM'), ['11:30 PM', '7:10 AM'], 'the start is the night before');
  assert.deepEqual(rangeOf('12:20 - 6:05 am'), ['12:20 AM', '6:05 AM']);
  assert.deepEqual(rangeOf('23:40 to 07:05'), ['23:40', '07:05']);
  assert.deepEqual(rangeOf('10:45 PM – 6:30 AM'), ['10:45 PM', '6:30 AM']);
  assert.equal(rangeOf('7m later than average'), null); assert.equal(rangeOf('37–55 BPM'), null);
  // what an AI may answer for the 7 photos of an Apple Watch (Sleep Score, its details, Sleep Stages, Heart Rate, Vitals x3)
  const loose = { shows: 'day', app: 'Apple Health', date: '2026-11-25', sleep_min: 450, sleep_score: 97, deep_min: 100, rem_min: 149, hr_rest: null, hrv_ms: null,
    other: [{ name: 'Bedtime', value: '7m later than average' }, { name: 'Sleep', value: '1:00 – 8:35 AM' }, { name: 'Core', value: '3h 21m' }, { name: 'Awake', value: '5m' }, { name: 'Interruptions', value: '3 wake-ups, 5m total' },
      { name: 'Heart rate range', value: '37–55 BPM' }, { name: 'Heart Rate', value: '39 BPM' }, { name: 'Respiratory Rate', value: '15.5 BrPM' }, { name: 'Blood Oxygen', value: '95.9%' }], note: 'Apple Watch sleep and vitals.' };
  let out = tidySleep(JSON.stringify(loose));
  assert.deepEqual(out.day.other.slice(0, 4), [{ name: 'Bedtime', value: '1:00 AM' }, { name: 'Wake-up time', value: '8:35 AM' }, { name: 'SpO2', value: '95.9%' }, { name: 'Breathing rate', value: '15.5 brpm' }], JSON.stringify(out.day.other));
  assert.ok(out.day.other.some(o => o.name === 'Light sleep (core)' && o.value === '3h 21m') && out.day.other.some(o => o.name === 'Awake'));
  assert.ok(!out.day.other.some(o => /7m later/.test(o.value)) && !out.day.other.some(o => /1:00 – 8:35/.test(o.value)), 'no second, different reading of the times');
  assert.equal(out.day.hr_rest, 39, 'the heart rate while asleep, not the range'); assert.equal(out.day.sleep_score, 97); assert.equal(out.day.sleep_min, 450);
  // the new fields, as the prompt asks for them
  out = tidySleep(JSON.stringify({ shows: 'day', sleep_min: 450, bed_time: '1:00 AM', wake_time: '8:35 am', spo2: 95.9, breath_rate: 15.5, hr_rest: 39, other: [{ name: 'Wrist temperature', value: '+0.2°C' }] }));
  assert.deepEqual(out.day.other, [{ name: 'Bedtime', value: '1:00 AM' }, { name: 'Wake-up time', value: '8:35 AM' }, { name: 'SpO2', value: '95.9%' }, { name: 'Breathing rate', value: '15.5 brpm' }, { name: 'Wrist temperature', value: '+0.2°C' }]);
  // a resting heart rate given stays; a range is never one; numbers out of range are dropped
  out = tidySleep(JSON.stringify({ sleep_min: 400, hr_rest: 52, other: [{ name: 'Heart rate', value: '39 BPM' }] })); assert.equal(out.day.hr_rest, 52);
  out = tidySleep(JSON.stringify({ sleep_min: 400, other: [{ name: 'Heart rate', value: '37–55 BPM' }, { name: 'SpO2', value: '45%' }, { name: 'Max heart rate', value: '90' }] })); assert.equal(out.day.hr_rest, null); assert.ok(!out.day.other.some(o => o.name === 'SpO2'));
  // vitals alone are still a night's numbers
  out = tidySleep(JSON.stringify({ other: [{ name: 'Blood Oxygen', value: '95.9%' }] })); assert.ok(out.day && out.day.other[0].name === 'SpO2');
  assert.equal(tidySleep('nonsense').day, null);
  // through the function: kind sleep uses it, kind day doesn't
  let w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(loose) });
  let r = await run(w, req({ images: Array(7).fill(IMG), kind: 'sleep', ctx: 'Today is Wed 25 Nov 2026; the night being logged ended this morning' }));
  assert.equal(r.status, 200); assert.equal(r.body.read, 7); assert.equal(r.body.day.hr_rest, 39); assert.deepEqual(r.body.day.other[0], { name: 'Bedtime', value: '1:00 AM' });
  const said7 = w.calls[1].body.contents[0].parts[7].text;
  assert.match(said7, /photos of the watch's own screen/); assert.match(said7, /"bed_time"/); assert.match(said7, /never a range/); assert.match(said7, /reading 7 screenshots of a fitness watch/);
  w = world({ env: { GEMINI_API_KEY: 'g' }, gemini: gem(DAYR) }); r = await run(w, req({ images: [IMG], kind: 'day' })); assert.deepEqual(r.body.day.other, [{ name: 'Stress', value: '32, low' }], 'a day as before');
  console.log('test_fn 1.35.2 a night in the app\'s words: ok');
}
