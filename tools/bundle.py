#!/usr/bin/env python3
"""bundle.py: the copy of the page that ships (GymDay 1.24, the speed pass).

    python3 tools/bundle.py android/app/src/main/assets/www /tmp/gymday-www

Copies the page (src) to dst with ONE change, which makes the app start faster and changes nothing else:

The page's own scripts (the <script src="…"> lines of index.html, in their order: 41 files) are joined into one file, gymday.js,
and index.html names only that one. A phone opens one file instead of 41. Measured on a processor slowed down 4 times, with a
full account: the scripts are ready in 271 ms instead of 340, and the first screen is drawn at 395 ms instead of 495 (a fifth
sooner). Every script is a self-running function (or plain `window.X = …` lines) with nothing declared at the top, so joined
they run exactly as they did apart; each sits in its own try block, so one that fails still leaves the others running, as
separate files do, and the failure is still reported. tools/shape.js checks that every script still has that shape.

Tried and NOT done: writing the two big food tables (foods.js, foodmicro.js) as JSON.parse('…'). In plain Node it reads twice
as fast, but in the phone's browser it was a third SLOWER (394 ms against 301): the browser reads a big script file on another
thread while the app keeps running, and JSON.parse has to run on the app's own thread. They stay as they are.

The app's build does the same joining (the bundleWww task in gymapp/app/build.gradle.kts), so what ships is this copy. Before a
release the tests run against this copy, and the files inside the APK are compared with it (`diff -rq`): both must agree, byte
for byte. Everything else (styles, pictures, the food tables) is copied as it is. The source files stay as they are, for
working on and for quick test runs."""
import os, re, shutil, sys

TAG = re.compile(r'<script src="([^"]+)"></script>\n')
HEAD = '/* GymDay: the page\'s scripts in one file, in the page\'s order. Made at build time from the files named below (tools/bundle.py). */\n'


def read(path):
    with open(path, 'rb') as f: return f.read().decode('utf-8')


def write(path, text):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, 'wb') as f: f.write(text.encode('utf-8'))


def bundle(src, dst):
    if os.path.exists(dst): shutil.rmtree(dst)
    os.makedirs(dst)
    html = read(os.path.join(src, 'index.html'))
    names = TAG.findall(html)
    if len(names) < 30: raise SystemExit('index.html does not list the scripts as expected')
    out = [HEAD]
    for n in names:
        t = read(os.path.join(src, n))
        out.append('/* ==== ' + n + ' ==== */\ntry {\n' + t + ('' if t.endswith('\n') else '\n') + '} catch (e) { setTimeout(function () { throw e; }, 0); }\n')
    write(os.path.join(dst, 'gymday.js'), ''.join(out))
    first = [True]
    def one(m):
        if first[0]: first[0] = False; return '<script src="gymday.js"></script>\n'
        return ''
    write(os.path.join(dst, 'index.html'), TAG.sub(one, html))
    skip = set(names) | {'index.html'}
    for root, dirs, files in os.walk(src):
        for f in files:
            p = os.path.join(root, f); rel = os.path.relpath(p, src)
            if rel in skip: continue
            to = os.path.join(dst, rel)
            os.makedirs(os.path.dirname(to), exist_ok=True); shutil.copyfile(p, to)
    return names


if __name__ == '__main__':
    if len(sys.argv) != 3: raise SystemExit(__doc__)
    n = bundle(sys.argv[1], sys.argv[2])
    size = os.path.getsize(os.path.join(sys.argv[2], 'gymday.js'))
    print(f'{len(n)} scripts joined into gymday.js ({size / 1048576:.2f} MB); copy in {sys.argv[2]}')
