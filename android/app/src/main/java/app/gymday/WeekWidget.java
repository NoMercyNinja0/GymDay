package app.gymday;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.os.SystemClock;
import android.view.View;
import android.widget.RemoteViews;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * Home-screen widget. Not training: this week's count, a dot for each day of the week (filled = trained, ring = today)
 * and today's day with a Start button. Training: the workout's timer, the exercise in hand, the sets bar, and the same
 * buttons as the card (Tick set, Next, Pause / Resume, Finish), which work without opening the app.
 *
 * The page writes what to show as JSON in preferences ("wData"):
 *   {"n":2,"goal":3,"ws":<Monday 00:00 of the week n and days are about>,"days":[1,0,1,0,0,0,0] (Monday first),
 *    "sched":true,"plan":[null,{"id":"d1","name":"Push day"},...] (Sunday first, null = rest day),"last":"Leg day",
 *    "w": the running workout's card as in WorkoutNotifier, or null}
 * "Today" and the week are worked out here, so they are right even if the app has not been opened since yesterday.
 * The widget comes in three heights: FULL (two rows of the home screen or more), COMPACT (a low two rows: the same
 * without its heading line) and SMALL (one row: two lines and the one button that matters most).
 */
public class WeekWidget extends AppWidgetProvider {
    private static final int[] DOTS = {R.id.w_d0, R.id.w_d1, R.id.w_d2, R.id.w_d3, R.id.w_d4, R.id.w_d5, R.id.w_d6};
    private static final int[] BTNS = {R.id.w_b0, R.id.w_b1, R.id.w_b2};
    static final int SMALL = 0, COMPACT = 1, FULL = 2;
    /** Heights (dp) from which COMPACT and FULL fit without anything being cut off. */
    private static final int H_COMPACT = 130, H_FULL = 146;

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) draw(c, m, id);
    }

    @Override
    public void onAppWidgetOptionsChanged(Context c, AppWidgetManager m, int id, Bundle newOptions) {
        draw(c, m, id);
    }

    static void refresh(Context c) {
        AppWidgetManager m = AppWidgetManager.getInstance(c);
        for (int id : m.getAppWidgetIds(new ComponentName(c, WeekWidget.class))) draw(c, m, id);
    }

    private static void draw(Context c, AppWidgetManager m, int id) {
        try {
            if (android.os.Build.VERSION.SDK_INT >= 31) {       // Android 12+: hand over all three and let the home screen pick the one that fits
                java.util.Map<android.util.SizeF, RemoteViews> all = new java.util.HashMap<>();
                all.put(new android.util.SizeF(100f, 40f), views(c, SMALL));
                all.put(new android.util.SizeF(100f, H_COMPACT), views(c, COMPACT));
                all.put(new android.util.SizeF(100f, H_FULL), views(c, FULL));
                m.updateAppWidget(id, new RemoteViews(all));
                return;
            }
            // older: the home screen says how tall the widget is (its tallest in portrait, its lowest in landscape)
            Bundle o = m.getAppWidgetOptions(id);
            boolean portrait = c.getResources().getConfiguration().orientation != android.content.res.Configuration.ORIENTATION_LANDSCAPE;
            int h = o.getInt(portrait ? AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT : AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            if (h <= 0) h = o.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 0);
            m.updateAppWidget(id, views(c, h <= 0 || h >= H_FULL ? FULL : h >= H_COMPACT ? COMPACT : SMALL));
        } catch (Throwable ignored) {
        }
    }

    private static PendingIntent open(Context c) {
        return PendingIntent.getActivity(c, 3, new Intent(c, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** Opens the app on that day, ready to start ("-" = the list of days). */
    private static PendingIntent start(Context c, String dayId) {
        Intent i = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START).putExtra("day", dayId);
        return PendingIntent.getActivity(c, 4, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    /** The short word a card button gets on the widget. */
    private static String label(String what, String full) {
        switch (what) {
            case "tick": return "✓ Tick set";
            case "next": return full.startsWith("Finish") ? "Done" : "Next";
            case "pause": return "Pause";
            case "resume": return "Resume";
            case "finish": return "Finish";
            default: return full;
        }
    }

    static RemoteViews views(Context c, int size) {
        boolean small = size == SMALL, compact = size == COMPACT;
        SharedPreferences p = c.getSharedPreferences("gymday", Context.MODE_PRIVATE);
        JSONObject d;
        try {
            d = new JSONObject(p.getString("wData", "{}"));
        } catch (Exception e) {
            d = new JSONObject();
        }
        JSONObject w = d.optJSONObject("w");
        boolean openOnly = p.getBoolean("wOpenOnly", false);
        long now = System.currentTimeMillis();

        // ----- this week and today, worked out now -----
        long ws = (long) d.optDouble("ws", 0);
        boolean thisWeek = ws > 0 && now >= ws && now < ws + 7 * 86400000L;
        int n = thisWeek ? d.optInt("n", 0) : 0, goal = d.optInt("goal", 0);
        String count = goal > 0 ? n + " of " + goal + " this week" : n + (n == 1 ? " workout this week" : " workouts this week");
        int sun0 = Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1, mon0 = (sun0 + 6) % 7;
        boolean sched = d.optBoolean("sched", false);
        JSONArray plan = d.optJSONArray("plan");
        JSONObject today = sched && plan != null ? plan.optJSONObject(sun0) : null;
        String lbl, name, startId = "-", startText = "Start";
        if (sched) {
            lbl = "TODAY";
            if (today != null) {
                name = today.optString("name", "Workout");
                startId = today.optString("id", "-");
            } else {
                name = "Rest day";
                startText = "Open";
            }
        } else {
            String last = d.optString("last", "");
            lbl = last.isEmpty() ? "GYMDAY" : "LAST WORKOUT";
            name = last.isEmpty() ? "Ready when you are" : last;
        }

        // ----- the running workout -----
        boolean paused = w != null && w.optBoolean("paused", false);
        long base = w == null ? 0 : (long) w.optDouble("base", now);
        long chrono = SystemClock.elapsedRealtime() - Math.max(0, now - base);
        String text = w == null ? "" : openOnly ? "Tap to open GymDay and carry on" : w.optString("text", "");
        JSONArray btns = w == null || openOnly ? null : w.optJSONArray("btns");

        if (small) {
            RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_small);
            v.setOnClickPendingIntent(R.id.w_root, open(c));
            if (w == null) {
                v.setTextViewText(R.id.w_s1, count);
                v.setTextViewText(R.id.w_s2, (sched ? "Today: " : lbl.equals("GYMDAY") ? "" : "Last: ") + name);
                v.setViewVisibility(R.id.w_timer, View.GONE);
                v.setTextViewText(R.id.w_start, startText);
                v.setOnClickPendingIntent(R.id.w_start, start(c, startId));
            } else {
                v.setTextViewText(R.id.w_s1, w.optString("title", "Workout") + (paused ? " · paused" : ""));
                v.setTextViewText(R.id.w_s2, text);
                v.setViewVisibility(R.id.w_timer, paused ? View.GONE : View.VISIBLE);
                v.setChronometer(R.id.w_timer, chrono, null, !paused);
                JSONArray one = btns == null ? null : btns.optJSONArray(0);
                if (one != null && ActionReceiver.known(one.optString(0))) {
                    v.setTextViewText(R.id.w_start, label(one.optString(0), one.optString(1)));
                    v.setOnClickPendingIntent(R.id.w_start, WorkoutNotifier.action(c, one.optString(0)));
                } else {
                    v.setTextViewText(R.id.w_start, "Open");
                    v.setOnClickPendingIntent(R.id.w_start, open(c));
                }
            }
            return v;
        }

        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_week);
        v.setOnClickPendingIntent(R.id.w_root, open(c));
        v.setViewVisibility(R.id.w_head, compact ? View.GONE : View.VISIBLE);
        if (w == null) {
            v.setViewVisibility(R.id.w_work, View.GONE);
            v.setViewVisibility(R.id.w_dots, View.VISIBLE);
            v.setViewVisibility(R.id.w_idle, View.VISIBLE);
            v.setTextViewText(R.id.w_count, count);
            JSONArray days = thisWeek ? d.optJSONArray("days") : null;
            for (int i = 0; i < 7; i++) {
                boolean on = days != null && days.optInt(i, 0) > 0;
                v.setInt(DOTS[i], "setBackgroundResource", on ? R.drawable.dot_on : i == mon0 ? R.drawable.dot_today : R.drawable.dot_off);
                v.setTextColor(DOTS[i], on ? 0xFF04121F : i == mon0 ? 0xFFEAF2FF : 0xFF8C9BB6);
            }
            v.setTextViewText(R.id.w_lbl, compact ? lbl + " · " + count.toUpperCase(java.util.Locale.US) : lbl);     // no heading line: the count moves here
            v.setTextViewText(R.id.w_today, name);
            v.setTextViewText(R.id.w_start, startText);
            v.setOnClickPendingIntent(R.id.w_start, start(c, startId));
            return v;
        }
        v.setViewVisibility(R.id.w_dots, View.GONE);
        v.setViewVisibility(R.id.w_idle, View.GONE);
        v.setViewVisibility(R.id.w_work, View.VISIBLE);
        int done = w.optInt("done", 0), total = w.optInt("total", 0);
        v.setTextViewText(R.id.w_count, total > 0 ? done + " of " + total + " sets" : "Workout");
        v.setTextViewText(R.id.w_title, w.optString("title", "Workout"));
        v.setViewVisibility(R.id.w_timer, paused ? View.GONE : View.VISIBLE);
        v.setViewVisibility(R.id.w_frozen, paused ? View.VISIBLE : View.GONE);
        v.setChronometer(R.id.w_timer, chrono, null, !paused);
        v.setTextViewText(R.id.w_frozen, "Paused " + WorkoutNotifier.clock((long) w.optDouble("elapsed", 0)));
        v.setTextViewText(R.id.w_text, text);
        v.setProgressBar(R.id.w_bar, Math.max(1, total), Math.min(done, Math.max(1, total)), false);
        int shown = 0;
        for (int i = 0; btns != null && i < btns.length() && shown < 3; i++) {
            JSONArray one = btns.optJSONArray(i);
            if (one == null || !ActionReceiver.known(one.optString(0))) continue;
            v.setViewVisibility(BTNS[shown], View.VISIBLE);
            v.setTextViewText(BTNS[shown], label(one.optString(0), one.optString(1)));
            v.setOnClickPendingIntent(BTNS[shown], WorkoutNotifier.action(c, one.optString(0)));
            shown++;
        }
        if (shown == 0) {       // the app's page is not in memory, so its buttons could do nothing: one button that opens it
            v.setViewVisibility(BTNS[0], View.VISIBLE);
            v.setTextViewText(BTNS[0], "Open GymDay");
            v.setOnClickPendingIntent(BTNS[0], open(c));
            shown = 1;
        }
        for (int i = shown; i < 3; i++) v.setViewVisibility(BTNS[i], View.GONE);
        return v;
    }
}
