/* GymDay – which server the app talks to. This copy has none, so everything is saved on the phone ("On this phone").
   For accounts and clubs, set up your own Supabase project (server/README.md) and fill in its URL and its *publishable*
   key here, or tap Settings → Connect the GymDay server in the app. Never put the project's secret key in the app. */
window.GYMDAY_CLOUD = window.GYMDAY_CLOUD || { url: '', key: '' };

// This build. Keep in step with versionCode / versionName in app/build.gradle.kts.
window.GYMDAY_APP = { code: 60, name: '1.35.2' };
