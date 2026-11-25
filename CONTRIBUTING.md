# Contributing to GymDay

Thanks for wanting to help. Bug reports, ideas and small fixes are all welcome.

## Reporting a bug or suggesting an idea

Open an [issue](../../issues/new/choose) and pick **Bug report** or **Idea**. For a bug, say which phone you use, which version of GymDay (Settings → About GymDay) and the steps that make it happen. A screenshot helps a lot.

Security problems go by email instead: see [SECURITY.md](SECURITY.md).

## Changing the code

1. Fork the repository and make a branch for your change.
2. Build and test, as the README explains:
   - Android: `cd android && ./gradlew assembleDebug testDebugUnitTest`
   - Server: `cd server && npm install && npm test`
   - Page scripts: from `android/app/src/main/assets/www`, run `node ../../../../../../tools/shape.js` (after `npm install acorn` at the top folder). It should say `0 with something other than a self-running function`.
3. Keep each change small and about one thing.
4. Open a pull request saying what changed and why. The same tests run on GitHub automatically.

## How the code is written

- The app is plain HTML, CSS and JavaScript in `android/app/src/main/assets/www`, with no framework and no build step besides joining the scripts.
- Every script is one self-running function (or plain `window.X = …` lines), so the scripts can be joined into one file safely.
- Words in the app are plain and short, for people who don't know gym or nutrition terms.
- Never commit keys, passwords or a server address. `config.js` stays empty, with `url: ''`.

By contributing, you agree that your changes are shared under the [MIT Licence](LICENSE).
