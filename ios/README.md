# GymDay for iPhone

The same GymDay as on Android, in an iPhone app. The web app (`www/`, made from the Android build by `tools/make_www.py`) runs inside the app, and the app answers the web app's "Android" bridge with iPhone parts: Apple Health, reminders, Live Activity, widgets, Control Center buttons, Share from Photos, Face ID, voice and barcodes.

* `App/`: the app (Swift): the screen, the bridge, Apple Health, reminders, files, sharing.
* `Widgets/`: home-screen widgets (Week, Today, Food), Control Center buttons, the running workout on the Lock Screen.
* `Share/`: "Share → GymDay" from Photos.
* `Shared/`: code used by more than one of them.
* `tools/make_www.py`: copies the Android build's web app to `www/`, changing the words that are about Android into their iPhone versions (Apple Health for Health Connect, Control Center for Quick Settings, Face ID for the fingerprint).
* `tools/gen_project.py`: writes `GymDay.xcodeproj`. Run it again after adding or removing a Swift file.

## Run it

From the top folder of the repository:

```bash
cd android && ./gradlew :app:bundleWww && cd ..   # makes android/app/build/www-bundle/www
python3 ios/tools/make_www.py                      # makes ios/www (git ignores it)
open ios/GymDay.xcodeproj
```

Pick an iPhone simulator and press Run. The app needs iOS 18 or newer.

## Your own team and app IDs

Running on a real iPhone or sending the app to the App Store needs an Apple developer team (a free Personal Team is enough for your own iPhone). Write the project again with your team and your own app ID:

```bash
GYMDAY_TEAM=YOUR_TEAM_ID GYMDAY_ID=com.yourname.gymday python3 ios/tools/gen_project.py
```

* `GYMDAY_TEAM`: your Team ID (Xcode → Settings → Accounts). Empty: pick a team in Xcode's Signing & Capabilities.
* `GYMDAY_ID`: the root of the bundle IDs. Debug (Xcode's Run) uses `GYMDAY_ID.dev`, Release (Product → Archive) uses `GYMDAY_ID`, and the widgets and Share extension add `.widgets` and `.share`. Without it, the project keeps GymDay's own IDs (`app.gymday`), which only GymDay's team can sign.

Xcode's automatic signing registers the IDs and the App Group the first time.
