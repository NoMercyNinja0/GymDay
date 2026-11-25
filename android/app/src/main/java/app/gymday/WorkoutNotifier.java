package app.gymday;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.graphics.drawable.Icon;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The notifications GymDay posts: the running workout (lock screen, and on Android 16 the capsule at the top
 * through "Live Updates"), "workout saved", and the reminder on a planned gym day.
 *
 * The running workout is a card the page describes as JSON (kept in preferences as "wCard"):
 *   {"title":"Push day","text":"Bench press · set 2 of 4","chip":"Set 2/4","base":1731650000000,"paused":false,"elapsed":0,
 *    "done":5,"total":14,"segs":[4,3,3,4],"btns":[["tick","Tick set ✓"],["next","Next exercise"],["pause","Pause"]]}
 * The timer counts by itself from base; while paused it stands still at elapsed. A button sends its first word back to
 * the page through {@link ActionReceiver}. When the page is not in memory the buttons could do nothing, so the card
 * is then shown without them ("wOpenOnly") and a tap opens the app.
 */
final class WorkoutNotifier {
    static final String CH_WORKOUT = "workout", CH_REMIND = "reminders";
    static final int ID_WORKOUT = 1, ID_REMIND = 2, ID_SAVED = 3;
    static final String ACT = "app.gymday.ACT.";

    private WorkoutNotifier() {
    }

    static void channels(Context c) {
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel w = new NotificationChannel(CH_WORKOUT, "Workout in progress", NotificationManager.IMPORTANCE_LOW);
        w.setDescription("Shows your gym time while a workout is running");
        w.setLockscreenVisibility(Notification.VISIBILITY_PUBLIC);
        w.setShowBadge(false);
        nm.createNotificationChannel(w);
        NotificationChannel r = new NotificationChannel(CH_REMIND, "Gym reminders", NotificationManager.IMPORTANCE_DEFAULT);
        r.setDescription("A reminder on the days you planned to train");
        nm.createNotificationChannel(r);
    }

    private static PendingIntent open(Context c) {
        Intent i = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, 0, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** What a button on the card or the widget sends: handled by ActionReceiver without opening the app. */
    static PendingIntent action(Context c, String what) {
        Intent i = new Intent(c, ActionReceiver.class).setAction(ACT + what);
        return PendingIntent.getBroadcast(c, 20, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static boolean allowed(Context c) {
        return c.getSystemService(NotificationManager.class).areNotificationsEnabled();
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("gymday", Context.MODE_PRIVATE);
    }

    /** 75 000 ms -> "1:15", 3 725 000 ms -> "1:02:05". */
    static String clock(long ms) {
        long s = Math.max(0, ms / 1000), m = s / 60, h = m / 60;
        return (h > 0 ? h + ":" : "") + String.format(java.util.Locale.US, h > 0 ? "%02d:%02d" : "%d:%02d", m % 60, s % 60);
    }

    /** The card as the page last described it, or null when no workout is running. */
    static JSONObject card(Context c) {
        try {
            String j = prefs(c).getString("wCard", "");
            return j.isEmpty() ? null : new JSONObject(j);
        } catch (Exception e) {
            return null;
        }
    }

    /**
     * The card, in the form this phone's Android accepts for the capsule. Android 16 changed its own rule between
     * releases: the first release only promotes a notification that asks to be "colorized", later ones want the
     * request below and no colour. So the phone is asked (hasPromotableCharacteristics) and the form it accepts is used.
     */
    static Notification build(Context c, JSONObject card, boolean buttons) {
        Notification n = make(c, card, buttons, false);
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                if (!Live36.fit(n)) {
                    Notification tinted = make(c, card, buttons, true);
                    if (Live36.fit(tinted)) n = tinted;
                }
            } catch (Throwable ignored) {
            }
        }
        return n;
    }

    private static Notification make(Context c, JSONObject card, boolean buttons, boolean colorized) {
        channels(c);
        String title = card.optString("title", "Workout");
        boolean paused = card.optBoolean("paused", false);
        long base = (long) card.optDouble("base", System.currentTimeMillis());
        int done = card.optInt("done", 0), total = card.optInt("total", 0);
        Notification.Builder b = new Notification.Builder(c, CH_WORKOUT)
                .setSmallIcon(R.drawable.ic_stat_gym)
                .setContentTitle(paused ? title + " · paused at " + clock((long) card.optDouble("elapsed", 0)) : title)
                .setContentText(buttons ? card.optString("text", "") : "Tap to open GymDay and carry on")
                .setOngoing(true)
                .setOnlyAlertOnce(true)
                .setVisibility(Notification.VISIBILITY_PUBLIC)
                .setCategory("workout")
                .setColor(colorized ? 0xFF0E1726 : 0xFF3D9BFF)       // tinted: the app's dark navy as the card's background
                .setContentIntent(open(c));
        if (colorized) b.setColorized(true);
        if (total > 0) b.setSubText(done + " of " + total + " sets");
        if (paused) {
            b.setShowWhen(false);
        } else {
            b.setWhen(base).setShowWhen(true).setUsesChronometer(true);
        }
        if (buttons) {
            JSONArray btns = card.optJSONArray("btns");
            int added = 0;                                       // Android shows three at most
            for (int i = 0; btns != null && i < btns.length() && added < 3; i++) {
                JSONArray one = btns.optJSONArray(i);
                if (one == null || !ActionReceiver.known(one.optString(0))) continue;
                b.addAction(new Notification.Action.Builder(Icon.createWithResource(c, R.drawable.ic_stat_gym), one.optString(1), action(c, one.optString(0))).build());
                added++;
            }
        }
        if (Build.VERSION.SDK_INT >= 31) b.setForegroundServiceBehavior(Notification.FOREGROUND_SERVICE_IMMEDIATE);
        // Android 16 Live Updates: ask for this ongoing notification to be promoted to the capsule at the top of the
        // screen. Older versions ignore the request.
        b.getExtras().putBoolean("android.requestPromotedOngoing", true);
        boolean styled = false;
        if (Build.VERSION.SDK_INT >= 36) {
            try {
                Live36.dress(b, card, paused);
                styled = true;
            } catch (Throwable ignored) {       // a phone whose Android 16 lacks a piece of this: the plain bar below still works
            }
        }
        if (!styled && total > 0) b.setProgress(total, Math.min(done, total), false);
        return b.build();
    }

    /** Posts (or updates) the card from what is kept in preferences. keepAlive also keeps the app in memory so the buttons work. */
    static void show(Context c, boolean keepAlive) {
        JSONObject card = card(c);
        if (card == null) return;
        boolean buttons = !prefs(c).getBoolean("wOpenOnly", false);
        c.getSystemService(NotificationManager.class).notify(ID_WORKOUT, build(c, card, buttons));
        if (keepAlive) WorkoutService.ensure(c);
    }

    /** The page is gone (app swiped away or closed by the phone): the buttons cannot do anything, so offer "tap to open" instead. */
    static void openOnly(Context c) {
        if (card(c) == null) return;
        prefs(c).edit().putBoolean("wOpenOnly", true).apply();
        try {
            show(c, false);
        } catch (Throwable ignored) {
        }
        try {
            WeekWidget.refresh(c);
        } catch (Throwable ignored) {
        }
    }

    static void clearWorkout(Context c) {
        prefs(c).edit().remove("wCard").remove("wOpenOnly").apply();
        WorkoutService.stop(c);
        c.getSystemService(NotificationManager.class).cancel(ID_WORKOUT);
    }

    /** After Finish was pressed on the card or the widget: a quiet note that the workout is saved. */
    static void saved(Context c, String title, String text) {
        channels(c);
        Notification n = new Notification.Builder(c, CH_WORKOUT)
                .setSmallIcon(R.drawable.ic_stat_gym)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF3D9BFF)
                .setAutoCancel(true)
                .setContentIntent(open(c))
                .build();
        c.getSystemService(NotificationManager.class).notify(ID_SAVED, n);
    }

    static void remind(Context c, String title, String text) {
        channels(c);
        Notification n = new Notification.Builder(c, CH_REMIND)
                .setSmallIcon(R.drawable.ic_stat_gym)
                .setContentTitle(title)
                .setContentText(text)
                .setAutoCancel(true)
                .setContentIntent(open(c))
                .build();
        c.getSystemService(NotificationManager.class).notify(ID_REMIND, n);
    }
}
