# Security

If you find a security problem in GymDay (for example a way to read someone else's workouts, food log or club chat, or to get around sign-in), please email **gymday89@gmail.com** instead of opening a public issue. Say what you found and how to repeat it.

You'll get a reply within a few days, and a fix will be released as soon as it's ready. Please give it time to reach people's phones before you share the details.

## How GymDay keeps data safe

- Everything is saved on the phone first. Nothing leaves it unless you sign in.
- On the server, every table has row-level security, and the app can only call checked functions, never read tables directly.
- The AI key lives only on the server (Supabase Edge Function secrets). The app holds the **publishable** key, which is meant to be public.
- Signing keys and passwords are never in this repository (see `.gitignore`).
