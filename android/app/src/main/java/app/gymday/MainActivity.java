package app.gymday;

import android.content.ContentValues;
import android.provider.MediaStore;
import android.app.Activity;
import android.app.KeyguardManager;
import android.content.ClipData;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.VibrationEffect;
import android.os.Vibrator;
import android.util.Base64;
import android.graphics.Color;
import android.view.WindowManager;
import android.widget.FrameLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.ViewCompat;
import androidx.core.view.WindowCompat;
import androidx.core.view.WindowInsetsCompat;
import androidx.core.view.WindowInsetsControllerCompat;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.File;
import java.io.FileInputStream;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.text.SimpleDateFormat;
import java.util.ArrayList;
import java.util.Date;
import java.util.Locale;

/**
 * GymDay – thin native shell around the HTML/JS app in assets/www.
 * Everything the web side needs from Android goes through the "Android" JS bridge:
 * persistent storage, setup photos, backup export/import, keep-awake, vibration, external links, sharing text.
 */
public class MainActivity extends Activity {

    private static final int REQ_FILE_CHOOSER = 1;
    private static final int REQ_EXPORT = 2;
    private static final int REQ_IMPORT = 3;
    private static final int REQ_HEALTH = 4;
    private static final int REQ_NOTIF = 5;
    private static final int REQ_HEALTH_WEIGHT = 6;
    private static final int REQ_HEALTH_WRITE = 7;
    private static final int REQ_HEALTH_AUTO = 9;     // 1.24: the readings for "automatic from your watch"
    private static final int REQ_VOICE = 8;
    private static final int REQ_HEALTH_EXER = 10;    // 1.28: workouts from the watch, for "forgot to log?"

    private WebView web;
    /** 1.30 (Android 16): the page sits in this frame, which keeps it clear of the status bar, the phone's own buttons, a camera
     *  cut-out and the keyboard. Android 15 and newer draw every app edge to edge; older phones are set up the same way here, so
     *  every phone behaves alike. The frame has the app's background colour, so the see-through bars show the app's colour. */
    private FrameLayout frame;
    private int barBg = 0xFF05080F;
    /** 1.30: Android 13 and newer hand the back gesture to this (Android 16 no longer calls onBackPressed for apps made for it). */
    private Object backCb;
    private ValueCallback<Uri[]> fileCallback;
    /** Where the camera puts a photo asked for by the page (in this app's own cache, shared through FileProvider). */
    private Uri cameraShot;
    private File cameraShotFile;
    private String pendingExport;
    private String pendingExportDone = "Backup saved";
    /** The screen that is open now, if any: the buttons on the workout card and the widget are handed to its page. */
    private static java.lang.ref.WeakReference<MainActivity> live = new java.lang.ref.WeakReference<>(null);

    static MainActivity live() {
        return live.get();
    }

    /** A card or widget button (tick, next, pause, resume, finish). False when there is no page to hand it to. */
    boolean act(String what) {
        if (web == null || !ActionReceiver.known(what)) return false;
        web.evaluateJavascript("(function(){try{return window.noteAction?String(window.noteAction('" + what + "')):'nopage'}catch(e){return 'error'}})()",
                v -> {
                    if ("\"nopage\"".equals(v)) WorkoutNotifier.openOnly(getApplicationContext());     // the page is still loading
                });
        return true;
    }
    private HealthSource health;       // Android 14+: the phone's own Health Connect; older: the Health Connect app. Made when first needed.

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        web = new WebView(this);
        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);
        s.setAllowFileAccess(true);
        s.setAllowContentAccess(true);
        // The app's own pages are local files; this lets them talk to the GymDay server (sign-in, sync, clubs).
        // Nothing from the internet is ever loaded into this WebView: other links open in the browser.
        s.setAllowUniversalAccessFromFileURLs(true);
        s.setMediaPlaybackRequiresUserGesture(false);
        s.setTextZoom(100);          // GymDay scales its text itself, by the phone's font size or the size picked in Settings (1.21)
        s.setSupportZoom(false);
        s.setBuiltInZoomControls(false);
        s.setDisplayZoomControls(false);
        web.setBackgroundColor(0xFF0F1115);
        web.setOverScrollMode(WebView.OVER_SCROLL_NEVER);
        web.addJavascriptInterface(new Bridge(), "Android");

        web.setWebViewClient(new WebViewClient() {
            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri u = request.getUrl();
                String scheme = u.getScheme();
                if ("file".equals(scheme)) return false;
                openExternal(u);
                return true;
            }
        });

        web.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) fileCallback.onReceiveValue(null);
                fileCallback = callback;
                cameraShot = null;
                Intent camera = cameraIntent();
                // <input capture>: straight to the camera (a packet's label); otherwise the gallery, with the camera offered too
                if (params != null && params.isCaptureEnabled() && camera != null) {
                    try {
                        startActivityForResult(camera, REQ_FILE_CHOOSER);
                        return true;
                    } catch (Exception e) {
                        cameraShot = null;
                    }
                }
                Intent i = new Intent(Intent.ACTION_GET_CONTENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("image/*");
                boolean many = params != null && params.getMode() == FileChooserParams.MODE_OPEN_MULTIPLE;
                if (many) i.putExtra(Intent.EXTRA_ALLOW_MULTIPLE, true);
                Intent chooser = Intent.createChooser(i, "Choose a photo");
                // several photos (v1.12: a meal, a packet's front and back): picked together from the gallery, or taken one at a time
                if (camera != null) chooser.putExtra(Intent.EXTRA_INITIAL_INTENTS, new Intent[]{camera});
                try {
                    startActivityForResult(chooser, REQ_FILE_CHOOSER);
                } catch (Exception e) {
                    fileCallback = null;
                    cameraShot = null;
                    return false;
                }
                return true;
            }
        });

        frame = new FrameLayout(this);
        frame.setBackgroundColor(barBg);
        frame.addView(web, new FrameLayout.LayoutParams(FrameLayout.LayoutParams.MATCH_PARENT, FrameLayout.LayoutParams.MATCH_PARENT));
        setContentView(frame);
        edgeToEdge();
        if (Build.VERSION.SDK_INT >= 33) {
            android.window.OnBackInvokedCallback cb = this::goBack;
            backCb = cb;
            getOnBackInvokedDispatcher().registerOnBackInvokedCallback(android.window.OnBackInvokedDispatcher.PRIORITY_DEFAULT, cb);
        }
        web.loadUrl("file:///android_asset/www/index.html");
        healthPrivacy(getIntent());
        if (savedInstanceState == null) joinLink(getIntent());      // not again when the screen is merely rebuilt
        if (savedInstanceState == null) startLink(getIntent());
        if (savedInstanceState == null) goLink(getIntent());
        if (savedInstanceState == null) shareLink(getIntent());      // v1.27: opened by "Share" from another app
        live = new java.lang.ref.WeakReference<>(this);
    }

    /** A camera app that saves its photo where the page can read it; null when the phone has no camera app. */
    private Intent cameraIntent() {
        try {
            File dir = new File(getCacheDir(), "camera");
            if (!dir.isDirectory() && !dir.mkdirs()) return null;
            File[] old = dir.listFiles();          // only the latest photo is ever needed
            if (old != null) for (File f : old) if (f.lastModified() < System.currentTimeMillis() - 3600_000L) //noinspection ResultOfMethodCallIgnored
                f.delete();
            cameraShotFile = new File(dir, "shot-" + System.currentTimeMillis() + ".jpg");
            cameraShot = androidx.core.content.FileProvider.getUriForFile(this, getPackageName() + ".files", cameraShotFile);
            Intent i = new Intent(MediaStore.ACTION_IMAGE_CAPTURE);
            i.putExtra(MediaStore.EXTRA_OUTPUT, cameraShot);
            i.addFlags(Intent.FLAG_GRANT_WRITE_URI_PERMISSION | Intent.FLAG_GRANT_READ_URI_PERMISSION);
            i.setClipData(ClipData.newRawUri("photo", cameraShot));
            return i.resolveActivity(getPackageManager()) != null ? i : null;
        } catch (Exception e) {
            cameraShot = null;
            return null;
        }
    }

    /** Edge to edge on every Android version, with the page padded clear of the bars, a cut-out and the keyboard (in place of the
     *  window resizing for the keyboard, which edge-to-edge windows no longer do). */
    private void edgeToEdge() {
        try {
            android.view.Window w = getWindow();
            WindowCompat.setDecorFitsSystemWindows(w, false);
            if (Build.VERSION.SDK_INT < 35) {          // Android 15+ ignores bar colours: the bars are see-through there already
                //noinspection deprecation
                w.setStatusBarColor(Color.TRANSPARENT);
                //noinspection deprecation
                w.setNavigationBarColor(Color.TRANSPARENT);
            }
            if (Build.VERSION.SDK_INT >= 29) {         // no grey veil behind the three-button bar: the frame's colour shows instead
                w.setNavigationBarContrastEnforced(false);
                w.setStatusBarContrastEnforced(false);
            }
            if (Build.VERSION.SDK_INT >= 28) {
                WindowManager.LayoutParams lp = w.getAttributes();
                lp.layoutInDisplayCutoutMode = Build.VERSION.SDK_INT >= 30 ? WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_ALWAYS
                        : WindowManager.LayoutParams.LAYOUT_IN_DISPLAY_CUTOUT_MODE_SHORT_EDGES;
                w.setAttributes(lp);
            }
        } catch (Throwable ignored) {
        }
        ViewCompat.setOnApplyWindowInsetsListener(frame, (v, insets) -> {
            int[] pad = padFor(insets);
            v.setPadding(pad[0], pad[1], pad[2], pad[3]);
            return WindowInsetsCompat.CONSUMED;
        });
        barIcons(false);
    }

    /** left, top, right, bottom: the bars and a cut-out on every side, and at the bottom whichever is taller, the button bar or the keyboard. */
    static int[] padFor(WindowInsetsCompat insets) {
        Insets bars = insets.getInsets(WindowInsetsCompat.Type.systemBars() | WindowInsetsCompat.Type.displayCutout());
        Insets ime = insets.getInsets(WindowInsetsCompat.Type.ime());
        return new int[]{bars.left, bars.top, bars.right, Math.max(bars.bottom, ime.bottom)};
    }

    /** Dark icons on the bars for the Light look, light icons for the Dark look. */
    private void barIcons(boolean light) {
        try {
            WindowInsetsControllerCompat c = WindowCompat.getInsetsController(getWindow(), getWindow().getDecorView());
            c.setAppearanceLightStatusBars(light);
            c.setAppearanceLightNavigationBars(light);
        } catch (Throwable ignored) {
        }
    }

    /** Back (button or gesture): the page goes back first (it closes a sheet or a screen); when it has nothing to close, GymDay goes to the background. */
    void goBack() {
        if (web == null) {
            moveTaskToBack(true);
            return;
        }
        web.evaluateJavascript(
                "(function(){try{return window.appBack?String(window.appBack()):'false'}catch(e){return 'false'}})()",
                value -> {
                    if (!"\"true\"".equals(value)) moveTaskToBack(true);
                });
    }

    @Override
    protected void onDestroy() {
        if (live.get() == this) live = new java.lang.ref.WeakReference<>(null);
        if (Build.VERSION.SDK_INT >= 33 && backCb != null) {
            try {
                getOnBackInvokedDispatcher().unregisterOnBackInvokedCallback((android.window.OnBackInvokedCallback) backCb);
            } catch (Throwable ignored) {
            }
        }
        try {       // the page goes with this screen, so the card's buttons would do nothing: offer "tap to open" instead
            if (!isChangingConfigurations()) WorkoutNotifier.openOnly(getApplicationContext());
        } catch (Throwable ignored) {
        }
        super.onDestroy();
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        healthPrivacy(intent);
        joinLink(intent);
        startLink(intent);
        goLink(intent);
        shareLink(intent);
    }

    /** v1.27 Share to GymDay: photos shared from the gallery or another app (up to 4), made smaller on a background thread and
     *  kept until the page asks for them (sharedPhotos()); the page then opens them as a meal photo. */
    private String shared = "";

    private void shareLink(Intent intent) {
        try {
            if (intent == null) return;
            String a = intent.getAction();
            if (!Intent.ACTION_SEND.equals(a) && !Intent.ACTION_SEND_MULTIPLE.equals(a)) return;
            if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
            String type = intent.getType();
            if (type == null || !type.startsWith("image/")) return;
            final ArrayList<Uri> uris = new ArrayList<>();
            if (Intent.ACTION_SEND.equals(a)) {
                Uri u = intent.getParcelableExtra(Intent.EXTRA_STREAM);
                if (u != null) uris.add(u);
            } else {
                ArrayList<Uri> l = intent.getParcelableArrayListExtra(Intent.EXTRA_STREAM);
                if (l != null) uris.addAll(l);
            }
            ClipData cd = intent.getClipData();
            if (uris.isEmpty() && cd != null) for (int i = 0; i < cd.getItemCount() && i < 4; i++) {
                Uri u = cd.getItemAt(i).getUri();
                if (u != null) uris.add(u);
            }
            if (uris.isEmpty()) return;
            new Thread(() -> {
                JSONArray out = new JSONArray();
                for (int i = 0; i < uris.size() && out.length() < 4; i++) {
                    String d = SharedPhoto.dataUrl(getContentResolver(), uris.get(i), 1600);
                    if (d != null) out.put(d);
                }
                runOnUiThread(() -> {
                    if (out.length() == 0) {
                        if (web != null) toast("That picture couldn't be opened");
                        return;
                    }
                    shared = out.toString();
                    if (web != null) web.evaluateJavascript("window.onSharedPhotos&&window.onSharedPhotos()", null);
                });
            }).start();
        } catch (Exception ignored) {
        }
    }

    static final String ACTION_START = "app.gymday.START";
    private String startDay = "";

    /** The widget's Start button: hand the day to the page ("-" = just the list of days), or keep it until the page asks. */
    private void startLink(Intent intent) {
        try {
            if (intent == null || !ACTION_START.equals(intent.getAction())) return;
            if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;     // reopened from the recent-apps list, not from the widget
            String id = intent.getStringExtra("day");
            id = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
            if (id.isEmpty() || id.length() > 40) id = "-";
            startDay = id;
            if (web != null) web.evaluateJavascript("window.onWidgetStart&&(window.onWidgetStart(" + JSONObject.quote("-".equals(id) ? "" : id) + "),window.Android.pendingStart())", null);
        } catch (Exception ignored) {
        }
    }

    static final String ACTION_GO = "app.gymday.GO";
    private String goTo = "";

    /** A long-press shortcut on the app icon ("Log body weight", "Add food"): hand the screen to the page, or keep it until the page asks. */
    private void goLink(Intent intent) {
        try {
            if (intent == null || !ACTION_GO.equals(intent.getAction())) return;
            if ((intent.getFlags() & Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY) != 0) return;
            String to = intent.getStringExtra("to");
            if (!"weight".equals(to) && !"food".equals(to) && !"foodtab".equals(to) && !"supps".equals(to) && !"mealphoto".equals(to)) return;      // v1.20: the Food widget, reminders; 1.28: the Meal photo tile
            goTo = to;
            if (web != null) web.evaluateJavascript("window.onShortcut&&(window.onShortcut(" + JSONObject.quote(to) + "),window.Android.pendingGo())", null);
        } catch (Exception ignored) {
        }
    }

    /** Health Connect's "how does this app use my data" link opens the app; show the explanation. */
    private String joinCode = "";

    /** Opened through an invite link (gymday://join/CODE): hand the code to the page, or keep it until the page asks. */
    private void joinLink(Intent intent) {
        try {
            Uri u = intent == null ? null : intent.getData();
            if (u == null || !Intent.ACTION_VIEW.equals(intent.getAction()) || !"gymday".equals(u.getScheme()) || !"join".equals(u.getHost())) return;
            String code = u.getLastPathSegment();
            if (code == null) return;
            code = code.replaceAll("[^A-Za-z0-9]", "");
            if (code.length() < 4 || code.length() > 12) return;
            joinCode = code;
            if (web != null) web.evaluateJavascript("window.onJoinLink&&(window.onJoinLink('" + code + "'),window.Android.pendingJoin())", null);
        } catch (Exception ignored) {
        }
    }

    private void healthPrivacy(Intent intent) {
        String a = intent == null ? null : intent.getAction();
        if ("android.intent.action.VIEW_PERMISSION_USAGE".equals(a) || "androidx.health.ACTION_SHOW_PERMISSIONS_RATIONALE".equals(a)) {
            web.postDelayed(() -> web.evaluateJavascript("window.showHealthPrivacy&&window.showHealthPrivacy()", null), 900);
        }
    }

    private HealthSource health() {
        if (health == null) {
            try {
                health = Build.VERSION.SDK_INT >= 34 ? new HealthBridge(this) : new HealthCompat(this);
            } catch (Throwable t) {
                return null;
            }
        }
        return health;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode == REQ_HEALTH) {
            HealthSource h = health();
            boolean ok = h != null && h.granted();
            web.evaluateJavascript("window.onHealthPerm&&window.onHealthPerm(" + ok + ")", null);
        } else if (requestCode == REQ_HEALTH_WEIGHT) {
            HealthSource h = health();
            boolean ok = h != null && h.has(HealthBridge.WEIGHT);
            web.evaluateJavascript("window.onHealthWeightPerm&&window.onHealthWeightPerm(" + ok + ")", null);
        } else if (requestCode == REQ_HEALTH_WRITE) {
            HealthSource h = health();
            boolean ok = h != null && h.has(HealthBridge.WRITE);
            web.evaluateJavascript("window.onHealthWritePerm&&window.onHealthWritePerm(" + ok + ")", null);
        } else if (requestCode == REQ_HEALTH_AUTO) {
            web.evaluateJavascript("window.onHealthAutoPerm&&window.onHealthAutoPerm(" + JSONObject.quote(autoPerms()) + ")", null);
        } else if (requestCode == REQ_HEALTH_EXER) {
            HealthSource h = health();
            boolean ok = h != null && h.has(HealthBridge.EXER);
            web.evaluateJavascript("window.onHealthExerPerm&&window.onHealthExerPerm(" + ok + ")", null);
        } else if (requestCode == REQ_NOTIF) {
            web.evaluateJavascript("window.onNotifPerm&&window.onNotifPerm(" + WorkoutNotifier.allowed(this) + ")", null);
        }
    }

    private void openExternal(Uri u) {
        try {
            Intent i = new Intent(Intent.ACTION_VIEW, u);
            i.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
            startActivity(i);
        } catch (Exception ignored) {
        }
    }

    /** Android 12 and older only. Android 13 and newer (Android 16's back gesture included) use the callback set in onCreate,
     *  which the manifest turns on, so this is never the path there. */
    @SuppressWarnings("deprecation")
    @android.annotation.SuppressLint("GestureBackNavigation")
    @Override
    public void onBackPressed() {
        goBack();
    }


    @Override
    protected void onPause() {
        super.onPause();
        web.evaluateJavascript("window.appPause&&window.appPause()", null);
    }

    @Override
    protected void onResume() {
        super.onResume();
        if (web != null) web.evaluateJavascript("window.appResume&&window.appResume()", null);
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if ((requestCode == REQ_HEALTH || requestCode == REQ_HEALTH_WEIGHT || requestCode == REQ_HEALTH_WRITE || requestCode == REQ_HEALTH_AUTO || requestCode == REQ_HEALTH_EXER) && health instanceof HealthCompat) {
            // Android 13 and older: the answer from Health Connect's own "allow" screen
            final HealthCompat hc = (HealthCompat) health;
            final int req = requestCode;
            hc.afterRequest(resultCode, data, () -> {
                if (req == REQ_HEALTH_AUTO) {
                    final String p = autoPerms();
                    runOnUiThread(() -> web.evaluateJavascript("window.onHealthAutoPerm&&window.onHealthAutoPerm(" + JSONObject.quote(p) + ")", null));
                    return;
                }
                final boolean ok = req == REQ_HEALTH_WEIGHT ? hc.has(HealthBridge.WEIGHT) : req == REQ_HEALTH_WRITE ? hc.has(HealthBridge.WRITE) : req == REQ_HEALTH_EXER ? hc.has(HealthBridge.EXER) : hc.granted();
                final String fn = req == REQ_HEALTH_WEIGHT ? "onHealthWeightPerm" : req == REQ_HEALTH_WRITE ? "onHealthWritePerm" : req == REQ_HEALTH_EXER ? "onHealthExerPerm" : "onHealthPerm";
                runOnUiThread(() -> web.evaluateJavascript("window." + fn + "&&window." + fn + "(" + ok + ")", null));
            });
            return;
        }
        if (requestCode == REQ_FILE_CHOOSER) {
            Uri[] result = null;
            boolean fromCamera = cameraShot != null && resultCode == RESULT_OK && (data == null || (data.getData() == null && data.getClipData() == null));
            if (fromCamera && cameraShotFile != null && cameraShotFile.length() > 0) {
                result = new Uri[]{cameraShot};
            } else if (resultCode == RESULT_OK && data != null) {
                ArrayList<Uri> uris = new ArrayList<>();
                ClipData clip = data.getClipData();
                if (clip != null) {
                    for (int i = 0; i < clip.getItemCount(); i++) uris.add(clip.getItemAt(i).getUri());
                } else if (data.getData() != null) {
                    uris.add(data.getData());
                }
                if (!uris.isEmpty()) result = uris.toArray(new Uri[0]);
            }
            if (fileCallback != null) fileCallback.onReceiveValue(result);
            fileCallback = null;
            cameraShot = null;
        } else if (requestCode == REQ_EXPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null && pendingExport != null) {
                try (OutputStream os = getContentResolver().openOutputStream(data.getData())) {
                    os.write(pendingExport.getBytes(StandardCharsets.UTF_8));
                    toast(pendingExportDone);
                } catch (Exception e) {
                    toast("Could not save the file");
                }
            }
            pendingExport = null;
        } else if (requestCode == REQ_VOICE) {
            // v1.20: what the speech recogniser heard, best guess first (or nothing, when it was cancelled)
            JSONArray heard = new JSONArray();
            if (resultCode == RESULT_OK && data != null) {
                ArrayList<String> r = data.getStringArrayListExtra(android.speech.RecognizerIntent.EXTRA_RESULTS);
                if (r != null) for (String x : r) heard.put(x);
            }
            web.evaluateJavascript("window.onVoice&&window.onVoice(" + heard + "," + JSONObject.quote(resultCode == RESULT_OK ? "ok" : "cancel") + ")", null);
        } else if (requestCode == REQ_IMPORT) {
            if (resultCode == RESULT_OK && data != null && data.getData() != null) {
                try (InputStream is = getContentResolver().openInputStream(data.getData())) {
                    String json = readAll(is);
                    web.evaluateJavascript("window.onBackupImported&&window.onBackupImported(" + JSONObject.quote(json) + ")", null);
                } catch (Exception e) {
                    toast("Could not read that file");
                }
            }
        }
    }

    /** Which of the readings for "automatic from your watch" may be read now, as JSON: {"steps":true,"sleep":false,…}. Not on the main thread on Android 13 and older. */
    private String autoPerms() {
        try {
            HealthSource h = health();
            return HealthDay.perms(h != null && h.available() ? h.allowed(HealthBridge.AUTO) : null).toString();
        } catch (Throwable t) {
            return "{}";
        }
    }

    private void healthAnswer(String key, String json) {
        runOnUiThread(() -> web.evaluateJavascript("window.onHealthData&&window.onHealthData(" + JSONObject.quote(key) + "," + JSONObject.quote(json) + ")", null));
    }

    private void toast(String msg) {
        web.evaluateJavascript("window.toast&&window.toast(" + JSONObject.quote(msg) + ")", null);
    }

    // ---------- helpers ----------

    private File dataFile() {
        return new File(getFilesDir(), "gymday-data.json");
    }

    private File metaFile() {
        return new File(getFilesDir(), "gymday-meta.json");
    }

    private File photoDir() {
        File d = new File(getFilesDir(), "photos");
        if (!d.exists()) d.mkdirs();
        return d;
    }

    private static String safeId(String id) {
        return id == null ? "x" : id.replaceAll("[^A-Za-z0-9_-]", "");
    }

    private static String readAll(InputStream is) throws Exception {
        ByteArrayOutputStream bo = new ByteArrayOutputStream();
        byte[] buf = new byte[16384];
        int n;
        while ((n = is.read(buf)) > 0) bo.write(buf, 0, n);
        return new String(bo.toByteArray(), StandardCharsets.UTF_8);
    }

    private static byte[] readBytes(File f) throws Exception {
        try (FileInputStream in = new FileInputStream(f)) {
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            byte[] buf = new byte[16384];
            int n;
            while ((n = in.read(buf)) > 0) bo.write(buf, 0, n);
            return bo.toByteArray();
        }
    }

    private static void writeAtomic(File target, byte[] bytes) throws Exception {
        File tmp = new File(target.getParentFile(), target.getName() + ".tmp");
        try (FileOutputStream out = new FileOutputStream(tmp)) {
            out.write(bytes);
            out.getFD().sync();
        }
        if (!tmp.renameTo(target)) {
            target.delete();
            tmp.renameTo(target);
        }
    }

    // ---------- JS bridge ----------

    class Bridge {

        @JavascriptInterface
        public String platform() {
            return "android";
        }

        /** 1.30: which app installed this copy ("com.android.vending" is Google Play, which then keeps it up to date, so the
         *  page shows no "new version" banner); "" when it was installed by hand from the APK file. */
        @SuppressWarnings("deprecation")
        @JavascriptInterface
        public String installer() {
            try {
                String n = Build.VERSION.SDK_INT >= 30 ? getPackageManager().getInstallSourceInfo(getPackageName()).getInstallingPackageName()
                        : getPackageManager().getInstallerPackageName(getPackageName());
                return n == null ? "" : n;
            } catch (Throwable t) {
                return "";
            }
        }

        @JavascriptInterface
        public String load() {
            try {
                File f = dataFile();
                if (!f.exists()) return "";
                return new String(readBytes(f), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean save(String json) {
            try {
                writeAtomic(dataFile(), json.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Device-only bookkeeping: sign-in and sync state. Kept apart from the workout data. */
        @JavascriptInterface
        public String metaLoad() {
            try {
                File f = metaFile();
                if (!f.exists()) return "";
                return new String(readBytes(f), StandardCharsets.UTF_8);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public boolean metaSave(String json) {
            try {
                writeAtomic(metaFile(), json.getBytes(StandardCharsets.UTF_8));
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        /** Opens Android's share sheet with a piece of text (used for club invite codes). */
        @JavascriptInterface
        public void share(String text) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(Intent.ACTION_SEND);
                    i.setType("text/plain");
                    i.putExtra(Intent.EXTRA_TEXT, text);
                    startActivity(Intent.createChooser(i, "Share"));
                } catch (Exception e) {
                    toast("Nothing to share with");
                }
            });
        }

        // ----- watch data through Health Connect (Android 14+), read-only -----

        @JavascriptInterface
        public String hcStatus() {
            JSONObject o = new JSONObject();
            try {
                HealthSource h = health();
                o.put("sdk", Build.VERSION.SDK_INT);
                o.put("available", h != null && h.available());
                o.put("install", h instanceof HealthCompat && ((HealthCompat) h).installable());
                o.put("granted", h != null && h.available() && h.granted());
                o.put("write", h != null && h.available() && h.has(HealthBridge.WRITE));
                o.put("perm", new JSONObject(autoPerms()));          // 1.24: what "automatic from your watch" may read
                o.put("asked", getPreferences(MODE_PRIVATE).getBoolean("hcAsked", false));
            } catch (Exception ignored) {
            }
            return o.toString();
        }

        @JavascriptInterface
        public void hcRequest() {
            runOnUiThread(() -> {
                HealthSource h = health();
                if (h == null || !h.available()) {
                    if (h instanceof HealthCompat && ((HealthCompat) h).installable()) h.open();       // to Google Play, to get Health Connect
                    else toast("This phone can't use Health Connect");
                    return;
                }
                getPreferences(MODE_PRIVATE).edit().putBoolean("hcAsked", true).apply();
                try {
                    h.request(HealthBridge.PERMS, REQ_HEALTH);
                } catch (Exception e) {
                    h.open();
                }
            });
        }

        /** start / end are epoch milliseconds, sent as text so no precision is lost on the way. */
        @JavascriptInterface
        public void hcRead(final String key, String start, String end) {
            final HealthSource h = health();
            long s, e;
            try {
                s = (long) Double.parseDouble(start);
                e = (long) Double.parseDouble(end);
            } catch (Exception ex) {
                s = 0;
                e = 0;
            }
            if (h == null || !h.available() || s <= 0 || e <= s) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.read(s, e, json -> healthAnswer(key, json));
            } catch (Exception ex) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        /** 1.24, automatic from the watch: one day's numbers and the night that ended in it (HealthDay has the answer's shape).
         *  start / end are that day's midnights on this phone, epoch milliseconds as text. Read only. */
        @JavascriptInterface
        public void hcDay(final String key, String start, String end) {
            final HealthSource h = health();
            long s, e;
            try {
                s = (long) Double.parseDouble(start);
                e = (long) Double.parseDouble(end);
            } catch (Exception ex) {
                s = 0;
                e = 0;
            }
            if (h == null || !h.available() || s <= 0 || e <= s || e - s > 26L * 3600000L) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.readDay(s, e, System.currentTimeMillis(), json -> healthAnswer(key, json));
            } catch (Throwable ex) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        /** Shows Health Connect's own "allow" screen for those readings; the answer goes to window.onHealthAutoPerm. */
        @JavascriptInterface
        public void hcAutoAsk() {
            runOnUiThread(() -> {
                HealthSource h = health();
                if (h == null || !h.available()) {
                    if (h instanceof HealthCompat && ((HealthCompat) h).installable()) h.open();       // to Google Play, to get Health Connect
                    else toast("This phone can't use Health Connect");
                    return;
                }
                getPreferences(MODE_PRIVATE).edit().putBoolean("hcAsked", true).apply();
                try {
                    h.request(HealthBridge.AUTO, REQ_HEALTH_AUTO);
                } catch (Exception e) {
                    h.open();
                }
            });
        }

        @JavascriptInterface
        public void hcOpen() {
            runOnUiThread(() -> {
                HealthSource h = health();
                if (h != null) h.open();
                else toast("This phone can't use Health Connect");
            });
        }

        @JavascriptInterface
        public void hcWeight(final String key) {
            final HealthSource h = health();
            if (h == null || !h.available()) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.readWeight(json -> healthAnswer(key, json));
            } catch (Exception e) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        @JavascriptInterface
        public void hcWeightAsk() {
            runOnUiThread(() -> {
                try {
                    HealthSource hs = health();
                    if (hs == null) return;
                    hs.request(new String[]{HealthBridge.WEIGHT}, REQ_HEALTH_WEIGHT);
                } catch (Exception e) {
                    HealthSource h = health();
                    if (h != null) h.open();
                }
            });
        }

        /** 1.28, "forgot to log?": workouts other apps (a watch) put into Health Connect between from and to (ms), as Sessions describes. */
        @JavascriptInterface
        public void hcSessions(final String key, final double from, final double to) {
            final HealthSource h = health();
            if (h == null || !h.available()) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.readSessions((long) from, (long) to, json -> healthAnswer(key, json));
            } catch (Exception e) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        /** Shows Health Connect's own screen to allow reading workouts; the answer comes back in window.onHealthExerPerm(true|false). */
        @JavascriptInterface
        public void hcSessionsAsk() {
            runOnUiThread(() -> {
                try {
                    HealthSource hs = health();
                    if (hs == null) return;
                    hs.request(new String[]{HealthBridge.EXER}, REQ_HEALTH_EXER);
                } catch (Exception e) {
                    HealthSource h = health();
                    if (h != null) h.open();
                }
            });
        }

        /** Puts one finished workout into Health Connect, or updates it: json as WorkoutEntry describes. Only after the person turned it on. */
        @JavascriptInterface
        public void hcWrite(final String key, final String json) {
            final HealthSource h = health();
            if (h == null || !h.available()) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.write(json, r -> healthAnswer(key, r));
            } catch (Exception e) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        /** Takes workouts back out of Health Connect: idsJson is a JSON list of GymDay workout ids. */
        @JavascriptInterface
        public void hcRemove(final String key, final String idsJson) {
            final HealthSource h = health();
            String[] ids;
            try {
                JSONArray a = new JSONArray(idsJson);
                ids = new String[Math.min(a.length(), 50)];
                for (int i = 0; i < ids.length; i++) ids[i] = a.optString(i, "");
            } catch (Exception e) {
                ids = new String[0];
            }
            if (h == null || !h.available()) {
                healthAnswer(key, "{\"ok\":false}");
                return;
            }
            try {
                h.remove(ids, r -> healthAnswer(key, r));
            } catch (Exception e) {
                healthAnswer(key, "{\"ok\":false}");
            }
        }

        @JavascriptInterface
        public void hcWriteAsk() {
            runOnUiThread(() -> {
                try {
                    HealthSource hs = health();
                    if (hs == null) return;
                    hs.request(new String[]{HealthBridge.WRITE}, REQ_HEALTH_WRITE);
                } catch (Exception e) {
                    HealthSource h = health();
                    if (h != null) h.open();
                }
            });
        }

        /** v1.27: the photos shared to GymDay, as a JSON list of data URLs ("[]" when none); handed over once. */
        @JavascriptInterface
        public String sharedPhotos() {
            String s = shared;
            shared = "";
            return s.isEmpty() ? "[]" : s;
        }

        @JavascriptInterface
        public String pendingGo() {
            String g = goTo;
            goTo = "";
            return g;
        }

        // ----- the running workout on the lock screen / in the capsule, reminders, widget -----

        /** The running workout as a card with buttons; see WorkoutNotifier for the JSON. */
        @JavascriptInterface
        public void workoutCard(final String json) {
            try {
                new JSONObject(json);       // only a well-formed card is kept
                WorkoutNotifier.prefs(MainActivity.this).edit().putString("wCard", json).putBoolean("wOpenOnly", false).apply();
            } catch (Exception e) {
                return;
            }
            runOnUiThread(() -> {
                try {
                    WorkoutNotifier.show(MainActivity.this, true);
                } catch (Throwable ignored) {
                }
            });
        }

        /** After Finish on the card or the widget. */
        @JavascriptInterface
        public void workoutSaved(final String title, final String text) {
            runOnUiThread(() -> {
                try {
                    WorkoutNotifier.saved(MainActivity.this, title, text);
                } catch (Throwable ignored) {
                }
            });
        }

        /** A word for the person when a card button could not do anything (the app may not be on screen). */
        @JavascriptInterface
        public void noteToast(final String msg) {
            runOnUiThread(() -> {
                try {
                    android.widget.Toast.makeText(getApplicationContext(), msg, android.widget.Toast.LENGTH_SHORT).show();
                } catch (Throwable ignored) {
                }
            });
        }

        /** "yes" / "no": whether this phone lets GymDay use the capsule at the top; "na" before Android 16. */
        @JavascriptInterface
        public String capsuleState() {
            try {
                if (Build.VERSION.SDK_INT < 36) return "na";
                return Live36.allowed(MainActivity.this) ? "yes" : "no";
            } catch (Throwable t) {
                return "na";
            }
        }

        /** The phone's switch for GymDay in the capsule (Android 16), or its notification settings if that screen is missing. */
        @JavascriptInterface
        public void capsuleOpen() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent("android.settings.APP_NOTIFICATION_PROMOTION_SETTINGS");
                    i.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
                    startActivity(i);
                } catch (Throwable e) {
                    try {
                        Intent i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
                        i.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
                        startActivity(i);
                    } catch (Throwable e2) {
                        toast("Open the phone's Settings, then Notifications, then Live Alerts");
                    }
                }
            });
        }

        /** The day the widget's Start button asked for, once ("-" = no particular day, "" = it was not pressed). */
        @JavascriptInterface
        public String pendingStart() {
            String d = startDay;
            startDay = "";
            return d;
        }

        @JavascriptInterface
        public void workoutClear() {
            try {
                WorkoutNotifier.clearWorkout(MainActivity.this);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public boolean notifAllowed() {
            try {
                return WorkoutNotifier.allowed(MainActivity.this);
            } catch (Exception e) {
                return false;
            }
        }

        /** Android 13+ asks the person before an app may show notifications. */
        @JavascriptInterface
        public void notifAsk() {
            runOnUiThread(() -> {
                try {
                    if (Build.VERSION.SDK_INT >= 33) requestPermissions(new String[]{"android.permission.POST_NOTIFICATIONS"}, REQ_NOTIF);
                } catch (Exception ignored) {
                }
            });
        }

        /** Status bar and the phone's own button bar follow the app's dark or light background. */
        @JavascriptInterface
        public void themeBars(final boolean light) {
            runOnUiThread(() -> {
                try {
                    barBg = light ? 0xFFF2F6FC : 0xFF05080F;
                    if (frame != null) frame.setBackgroundColor(barBg);
                    getWindow().getDecorView().setBackgroundColor(barBg);
                    web.setBackgroundColor(barBg);
                    barIcons(light);
                } catch (Exception ignored) {
                }
            });
        }


        /** The phone's own notification settings for GymDay (for when notifications were switched off there). */
        @JavascriptInterface
        public void notifOpen() {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent("android.settings.APP_NOTIFICATION_SETTINGS");
                    i.putExtra("android.provider.extra.APP_PACKAGE", getPackageName());
                    startActivity(i);
                } catch (Exception e) {
                    toast("Open the phone's Settings, then Apps, GymDay, Notifications");
                }
            });
        }

        /** When to ask "still training?" by notification if the workout is left running; 0 = not at all. */
        @JavascriptInterface
        public void stillAt(String ms) {
            try {
                ReminderReceiver.still(MainActivity.this, (long) Double.parseDouble(ms));
            } catch (Exception ignored) {
            }
        }

        /** json = {"on":true,"mins":1020,"days":["","Push day",...]} (Sunday first, "" = rest day). */
        @JavascriptInterface
        public void remindersSet(String json) {
            try {
                JSONObject o = new JSONObject(json);
                JSONArray days = o.optJSONArray("days");
                ReminderReceiver.prefs(MainActivity.this).edit()
                        .putBoolean("remOn", o.optBoolean("on", false))
                        .putInt("remTime", o.optInt("mins", 17 * 60))
                        .putString("remDays", days == null ? "[]" : days.toString())
                        .apply();
                ReminderReceiver.schedule(MainActivity.this);
            } catch (Exception ignored) {
            }
        }

        // ----- v1.21: text size -----

        /** The phone's text size (Settings → Display → Font size): 1 is normal, 1.3 is 130%. GymDay scales its own text
         *  by it (WebView's text zoom stays at 100%, so nothing is scaled twice). A change in the phone's settings makes
         *  Android start the screen again, so the page reads the new value when it loads. */
        @JavascriptInterface
        public float fontScale() {
            try {
                return getResources().getConfiguration().fontScale;
            } catch (Exception e) {
                return 1f;
            }
        }

        // ----- v1.20: voice logging, the Food widget, supplement reminders and the evening protein reminder -----

        /** Whether the phone has a speech recogniser that can be opened (Google's, usually). */
        @JavascriptInterface
        public boolean voiceOk() {
            try {
                return new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH).resolveActivity(getPackageManager()) != null;
            } catch (Exception e) {
                return false;
            }
        }

        /** Opens the phone's speech recogniser in a language (en-IN, hi-IN, ta-IN); what was heard comes back to window.onVoice. */
        @JavascriptInterface
        public void voiceListen(final String lang, final String prompt) {
            runOnUiThread(() -> {
                try {
                    Intent i = new Intent(android.speech.RecognizerIntent.ACTION_RECOGNIZE_SPEECH);
                    i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_MODEL, android.speech.RecognizerIntent.LANGUAGE_MODEL_FREE_FORM);
                    String l = lang == null || !lang.matches("[a-z]{2}-[A-Z]{2}") ? "en-IN" : lang;
                    i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE, l);
                    i.putExtra(android.speech.RecognizerIntent.EXTRA_LANGUAGE_PREFERENCE, l);
                    i.putExtra(android.speech.RecognizerIntent.EXTRA_MAX_RESULTS, 3);
                    if (prompt != null && !prompt.isEmpty()) i.putExtra(android.speech.RecognizerIntent.EXTRA_PROMPT, prompt);
                    startActivityForResult(i, REQ_VOICE);
                } catch (Exception e) {
                    web.evaluateJavascript("window.onVoice&&window.onVoice(null,'none')", null);
                }
            });
        }

        /** json = {"day":"2026-11-17","kcal":1820,"kt":2960,"p":62,"pt":95}; see FoodWidget. */
        @JavascriptInterface
        public void foodWidgetData(String json) {
            try {
                new JSONObject(json);
                ReminderReceiver.prefs(MainActivity.this).edit().putString("fData", json).apply();
                FoodWidget.refresh(MainActivity.this);
            } catch (Throwable ignored) {
            }
        }

        /** json = [{"t":<ms>,"id":"…","title":"Creatine","text":"1 scoop · every day"}, …] for the next two weeks; see Nudges. */
        @JavascriptInterface
        public void suppRemindSet(String json) {
            try {
                Nudges.setSupps(MainActivity.this, json);
            } catch (Throwable ignored) {
            }
        }

        /** json = {"on":true,"mins":1140,"day":"2026-11-17","got":62,"goal":95}; see Nudges. */
        @JavascriptInterface
        public void proteinNudgeSet(String json) {
            try {
                Nudges.setProtein(MainActivity.this, json);
            } catch (Throwable ignored) {
            }
        }

        /** Everything the Today widget and the morning brief say, as JSON; see Brief. */
        @JavascriptInterface
        public void todayData(String json) {
            try {
                new JSONObject(json);
                ReminderReceiver.prefs(MainActivity.this).edit().putString("tData", json).apply();
                TodayWidget.refresh(MainActivity.this);
                Brief.schedule(MainActivity.this);
                Wrap.schedule(MainActivity.this);                     // v1.27: the evening wrap-up reads the same JSON
            } catch (Throwable ignored) {
            }
        }

        /** Everything the widget shows, as JSON; see WeekWidget. */
        @JavascriptInterface
        public void widgetData(String json) {
            try {
                new JSONObject(json);
                ReminderReceiver.prefs(MainActivity.this).edit().putString("wData", json).apply();
                WeekWidget.refresh(MainActivity.this);
            } catch (Throwable ignored) {
            }
        }

        // ----- optional fingerprint lock (Android 11+, and only when the phone itself has a screen lock) -----

        @JavascriptInterface
        public boolean canLock() {
            try {
                KeyguardManager km = getSystemService(KeyguardManager.class);
                return Build.VERSION.SDK_INT >= 30 && km != null && km.isDeviceSecure();
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public void unlock() {
            runOnUiThread(() -> {
                if (Build.VERSION.SDK_INT < 30) {
                    web.evaluateJavascript("window.onUnlock&&window.onUnlock(true)", null);
                    return;
                }
                LockPrompt.show(MainActivity.this, ok -> runOnUiThread(() -> web.evaluateJavascript("window.onUnlock&&window.onUnlock(" + ok + ")", null)));
            });
        }

        private String safeName(String name) {
            String n = name == null ? "" : name.replaceAll("[^A-Za-z0-9._-]", "");
            return n.isEmpty() ? "GymDay-file" : n;
        }

        /** Lets the person pick where a text file (the history spreadsheet) is saved. */
        @JavascriptInterface
        public void saveFile(final String name, final String mime, String text) {
            pendingExport = text;
            pendingExportDone = "Saved";
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType(mime);
                i.putExtra(Intent.EXTRA_TITLE, safeName(name));
                try {
                    startActivityForResult(i, REQ_EXPORT);
                } catch (Exception e) {
                    toast("No file app available");
                }
            });
        }

        /** Puts a text file in Downloads/GymDay and opens the share menu with it. False on Android 9 and older (the page saves it instead). */
        @JavascriptInterface
        public boolean shareFile(final String name, final String mime, final String text) {
            if (Build.VERSION.SDK_INT < 29) return false;
            runOnUiThread(() -> {
                try {
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName(name));
                    v.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    v.put(MediaStore.MediaColumns.RELATIVE_PATH, "Download/GymDay");
                    Uri uri = getContentResolver().insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(text.getBytes(StandardCharsets.UTF_8));
                    }
                    Intent s = new Intent(Intent.ACTION_SEND);
                    s.setType(mime);
                    s.putExtra(Intent.EXTRA_STREAM, uri);
                    s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(s, "Share spreadsheet"));
                } catch (Exception e) {
                    toast("Could not share the file");
                }
            });
            return true;
        }

        /** The invite code the app was opened with, once. */
        @JavascriptInterface
        public String pendingJoin() {
            String c = joinCode;
            joinCode = "";
            return c;
        }

        /** Saves the picture to Pictures/GymDay and opens the share menu with it. False on Android 9 and older (the page shares words instead). */
        @JavascriptInterface
        public boolean shareImage(final String dataUrl, final String text) {
            if (Build.VERSION.SDK_INT < 29) return false;
            runOnUiThread(() -> {
                try {
                    int i = dataUrl.indexOf(',');
                    byte[] bytes = Base64.decode(i >= 0 ? dataUrl.substring(i + 1) : dataUrl, Base64.DEFAULT);
                    ContentValues v = new ContentValues();
                    v.put(MediaStore.Images.Media.DISPLAY_NAME, "GymDay-" + System.currentTimeMillis() + ".jpg");
                    v.put(MediaStore.Images.Media.MIME_TYPE, "image/jpeg");
                    v.put(MediaStore.Images.Media.RELATIVE_PATH, "Pictures/GymDay");
                    Uri uri = getContentResolver().insert(MediaStore.Images.Media.EXTERNAL_CONTENT_URI, v);
                    try (OutputStream os = getContentResolver().openOutputStream(uri)) {
                        os.write(bytes);
                    }
                    Intent s = new Intent(Intent.ACTION_SEND);
                    s.setType("image/jpeg");
                    s.putExtra(Intent.EXTRA_STREAM, uri);
                    s.putExtra(Intent.EXTRA_TEXT, text);
                    s.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
                    startActivity(Intent.createChooser(s, "Share workout"));
                } catch (Exception e) {
                    toast("Could not share the picture");
                }
            });
            return true;
        }

        /** dataUrl = "data:image/jpeg;base64,...."  */
        @JavascriptInterface
        public boolean savePhoto(String id, String dataUrl) {
            try {
                int comma = dataUrl.indexOf(',');
                byte[] bytes = Base64.decode(comma >= 0 ? dataUrl.substring(comma + 1) : dataUrl, Base64.DEFAULT);
                writeAtomic(new File(photoDir(), safeId(id) + ".jpg"), bytes);
                return true;
            } catch (Exception e) {
                return false;
            }
        }

        @JavascriptInterface
        public String loadPhoto(String id) {
            try {
                File f = new File(photoDir(), safeId(id) + ".jpg");
                if (!f.exists()) return "";
                return "data:image/jpeg;base64," + Base64.encodeToString(readBytes(f), Base64.NO_WRAP);
            } catch (Exception e) {
                return "";
            }
        }

        @JavascriptInterface
        public void deletePhoto(String id) {
            new File(photoDir(), safeId(id) + ".jpg").delete();
        }

        @JavascriptInterface
        public void exportBackup(String json) {
            pendingExport = json;
            pendingExportDone = "Backup saved";
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_CREATE_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("application/json");
                String stamp = new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date());
                i.putExtra(Intent.EXTRA_TITLE, "gymday-backup-" + stamp + ".json");
                try {
                    startActivityForResult(i, REQ_EXPORT);
                } catch (Exception e) {
                    toast("No file app available");
                }
            });
        }

        @JavascriptInterface
        public void importBackup() {
            runOnUiThread(() -> {
                Intent i = new Intent(Intent.ACTION_OPEN_DOCUMENT);
                i.addCategory(Intent.CATEGORY_OPENABLE);
                i.setType("*/*");
                try {
                    startActivityForResult(i, REQ_IMPORT);
                } catch (Exception e) {
                    toast("No file app available");
                }
            });
        }

        @JavascriptInterface
        public void keepAwake(boolean on) {
            runOnUiThread(() -> {
                if (on) getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
                else getWindow().clearFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
            });
        }

        /** v1.8: read the barcode on a packet with Play services' scanner; the answer comes back through window.onBarcode(key, code, error). */
        @JavascriptInterface
        public void scanBarcode(final String key) {
            runOnUiThread(() -> BarcodeScan.start(MainActivity.this, (code, error) -> {
                if (web != null) web.evaluateJavascript("window.onBarcode&&window.onBarcode(" + JSONObject.quote(key == null ? "" : key) + ","
                        + (code == null ? "null" : JSONObject.quote(code)) + "," + (error == null ? "null" : JSONObject.quote(error)) + ")", null);
            }));
        }

        /** GymDay's own number pad is open: the phone's keyboard must not be open on top of it. */
        @JavascriptInterface
        public void hideKeyboard() {
            runOnUiThread(() -> {
                try {
                    android.view.inputmethod.InputMethodManager imm = (android.view.inputmethod.InputMethodManager) getSystemService(INPUT_METHOD_SERVICE);
                    if (imm != null && web != null) imm.hideSoftInputFromWindow(web.getWindowToken(), 0);
                } catch (Exception ignored) { }
            });
        }

        @JavascriptInterface
        public void vibrate(int ms) {
            try {
                Vibrator v = (Vibrator) getSystemService(VIBRATOR_SERVICE);
                if (v == null) return;
                if (Build.VERSION.SDK_INT >= 26) v.vibrate(VibrationEffect.createOneShot(ms, VibrationEffect.DEFAULT_AMPLITUDE));
                else v.vibrate(ms);
            } catch (Exception ignored) {
            }
        }

        @JavascriptInterface
        public void openUrl(String url) {
            runOnUiThread(() -> openExternal(Uri.parse(url)));
        }
    }
}
