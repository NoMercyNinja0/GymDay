#!/usr/bin/env python3
"""Makes the iPhone app's copy of the page (www/) from the Android build's joined copy (app/build/www-bundle/www, made by the
bundleWww Gradle task or tools/bundle.py), with the words that are about Android changed to their iPhone versions: Apple Health
for Health Connect, Control Center for Quick Settings, Face ID for the fingerprint, the Lock Screen for Android 16's capsule.
Only whole phrases of the page's text are changed, never the code. Each change must be found, so a reworded Android text is
noticed here rather than slipping through. Run:  python3 tools/make_www.py [path to the Android www bundle]"""
import os, shutil, sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, '..', 'android', 'app', 'build', 'www-bundle', 'www')
DST = os.path.join(ROOT, 'www')

# (Android words, iPhone words, how many times at least)
WORDS = [
    ('On Android 16 it also shows in the capsule at the top: tap the capsule for the buttons.',
     'On iPhone it also shows on the Lock Screen and in the Dynamic Island, with the same buttons.', 1),
    ('Pull down the shade, tap ✎ (edit) and drag GymDay’s “Meal photo” or “Add food” tile in.',
     'Open Control Center, tap + at the top left, then Add a Control, and search for GymDay: add “Meal photo” or “Add food”.', 1),
    ('Add GymDay’s Meal photo and Add food tiles to your pull-down shade.', 'Add GymDay’s Meal photo and Add food buttons to Control Center.', 1),
    ('Quick Settings tiles and new dropdowns', 'Control Center buttons and new dropdowns', 1),
    ('Quick Settings tiles (1.28)', 'Control Center buttons (1.28)', 2),
    ('Long-press your home screen → Widgets → GymDay → GymDay food', 'Press and hold your Home Screen, tap Edit → Add Widget → GymDay → GymDay food', 1),
    ('Press and hold your home screen, choose Widgets, then GymDay today.', 'Press and hold your Home Screen, tap Edit → Add Widget, then GymDay today.', 1),
    ('Fingerprint lock', 'Face ID lock', 1),
    ("Ask for your fingerprint or the phone\\'s PIN when GymDay opens", "Ask for Face ID or the iPhone\\'s passcode when GymDay opens", 1),
    ('Android can estimate one with no watch at all', 'an iPhone can estimate one with no watch at all', 1),
    ('Health Connect (Google Health)', 'Apple Health', 1),
    ('Health Connect, a free app from Google', 'Apple Health', 1),
    ('Watch &amp; Google Health', 'Watch &amp; Apple Health', 0),
    ('Watch & Google Health', 'Watch & Apple Health', 1),
    ('Google Health', 'Apple Health', 0),
    ('Health Connect', 'Apple Health', 20),
    # the watch apps people have on an iPhone (Samsung Health and Google Fit are Android's); an Apple Watch shares by itself
    ('(Samsung Health, Fitbit, Garmin Connect, Zepp…)', '(Garmin Connect, Fitbit, Zepp…; an Apple Watch does it by itself)', 1),
    ('(Samsung Health, Fitbit, Garmin Connect, Strava…)', '(Garmin Connect, Fitbit, Strava…; an Apple Watch does it by itself)', 1),
    ('(Samsung Health, Fitbit, Garmin Connect, Zepp, Mi Fitness and others)', '(Garmin Connect, Fitbit, Zepp, Mi Fitness and others; an Apple Watch does it by itself)', 1),
    ('(Samsung Health, Google Fit, Fitbit, Garmin and others)', '(the Fitness app, Fitbit, Garmin and others)', 1),
]


def main():
    if not os.path.isfile(os.path.join(SRC, 'gymday.js')):
        sys.exit('No joined page at ' + SRC + ': build the Android app (or run tools/bundle.py) first')
    if os.path.isdir(DST):
        shutil.rmtree(DST)
    shutil.copytree(SRC, DST)
    p = os.path.join(DST, 'gymday.js')
    s = open(p, encoding='utf-8').read()
    for old, new, at_least in WORDS:
        n = s.count(old)
        if n < at_least:
            sys.exit(f'Expected "{old}" at least {at_least}× in the page, found {n}: the Android words changed, so update tools/make_www.py')
        s = s.replace(old, new)
    open(p, 'w', encoding='utf-8').write(s)
    # a few touches for Safari's engine: no grey flash on a tap, no callout on a long press, no text selection on buttons
    h = os.path.join(DST, 'index.html')
    html = open(h, encoding='utf-8').read()
    css = ('<style>html.ios{-webkit-text-size-adjust:100%}html.ios *{-webkit-tap-highlight-color:transparent}'
           'html.ios button,html.ios .btn,html.ios [data-act]{-webkit-touch-callout:none;-webkit-user-select:none;user-select:none}'
           'html.ios input,html.ios textarea{-webkit-user-select:text;user-select:text}</style>\n')
    if '</head>' not in html:
        sys.exit('index.html has no </head>')
    html = html.replace('</head>', css + '</head>', 1)
    if 'viewport-fit' not in html:
        html = html.replace('name="viewport" content="', 'name="viewport" content="viewport-fit=cover, ', 1)
    open(h, 'w', encoding='utf-8').write(html)
    left = [w for w in ('Health Connect', 'Quick Settings', 'pull-down shade') if w in s]
    files = sum(len(f) for _, _, f in os.walk(DST))
    print('www for iPhone:', files, 'files;', 'Android words left:', left or 'none')


main()
