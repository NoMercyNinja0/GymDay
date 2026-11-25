# GymDay server (optional)

GymDay works fully on the phone without a server. This folder is for accounts, clubs and AI photo reading, on [Supabase](https://supabase.com).

| File | What it is |
|---|---|
| `gymday-supabase-setup.sql` | The whole database: tables, row-level security and functions. Run it in a new project's SQL Editor. It is safe to run again. |
| `gymday-update-v1.5.sql` … `gymday-update-v1.8.sql` | Updates for older servers, one version at a time. A new project doesn't need them. |
| `gymday-supabase-setup.v17.sql` | The v1.7 setup, used by `test_sql18.js` to test the v1.8 update. |
| `functions/gd-meal-photo/index.ts` | The Edge Function that reads meal photos, labels and screenshots with an AI model. |
| `server.js` | A stand-in for Supabase for the tests only (a real Postgres in memory, through PGlite). |
| `test_sql.js`, `test_sql18.js`, `test_fn.mjs` | The tests. |

## Set up

1. Run `gymday-supabase-setup.sql` in the SQL Editor.
2. In **Authentication → Email Templates**, make "Magic link or OTP" and "Confirm sign up" show the 6-digit code with `{{ .Token }}`.
3. Create the Edge Function `gd-meal-photo` with `functions/gd-meal-photo/index.ts`.
4. Add the secret `ANTHROPIC_API_KEY` under **Edge Functions → Secrets**. Optional: `GD_AI_MODEL` picks the model. The function can also use `GEMINI_API_KEY` or `OPENAI_API_KEY`, with `GD_AI_PROVIDER` naming the one to use.
5. In the app, fill in `config.js` or tap **Settings → Connect the GymDay server**, with the project URL and its **publishable** key. Never put the secret key in the app.

The people who look after the server (they read reports in the app) are those listed in the `gd_admins` table. While that table is empty, it is the first account made.

## Test

Needs Node 22.6 or newer.

```bash
npm install
node test_sql.js
node test_sql18.js
node --experimental-strip-types test_fn.mjs
```
