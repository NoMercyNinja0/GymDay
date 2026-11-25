package app.gymday;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * v1.25: the morning brief. One notification a day at the chosen time with today's workout, the calorie target and, when the
 * app already has last night's sleep, the readiness. The page writes what there is to say as JSON in preferences ("tData")
 * whenever something changes; the Today widget reads the same JSON:
 *   {"day":"2026-11-20","ready":78,"rword":"Good to train","kcal":1820,"kt":2960,"done":false,"next":"Push day","when":"Today",
 *    "plan":{"2026-11-20":{"w":"Push day","kt":2960},"2026-11-21":{"w":"","kt":2960}, … eight days},"bOn":true,"bMin":420}
 * Without a weekly plan no day is a gym day or a rest day: "w" is "" and "up" names the workout that comes next whenever it is done.
 * "day" is the day the page wrote it on: readiness, what was eaten and "done" are only true for that day. "plan" is what is
 * known ahead (the planned workout, "" on a rest day, and the calorie target), so the brief is right on a morning when the app
 * has not been opened yet. Readiness needs last night's sleep, which only the app can read, so before the app is opened the
 * brief says to tap for it. Set again after the phone restarts or the app is updated, because alarms do not survive that.
 */
public class Brief extends BroadcastReceiver {
    static final String ACTION = "app.gymday.BRIEF";
    static final String CH = "brief";
    static final int ID = 41, REQ = 12;
    static final long DAY = 24L * 60 * 60 * 1000;

    @Override
    public void onReceive(Context c, Intent i) {
        try {
            if (i != null && ACTION.equals(i.getAction())) show(c);
        } catch (Exception ignored) {
        }
        try {
            schedule(c);
        } catch (Exception ignored) {
        }
    }

    static JSONObject data(Context c) {
        try {
            return new JSONObject(c.getSharedPreferences("gymday", Context.MODE_PRIVATE).getString("tData", "{}"));
        } catch (Exception e) {
            return new JSONObject();
        }
    }

    static String n0(double v) {
        return String.format(Locale.US, "%,d", Math.round(v));
    }

    private static JSONObject planOf(JSONObject d, String key) {
        JSONObject plan = d.optJSONObject("plan");
        return plan == null ? null : plan.optJSONObject(key);
    }

    /** Readiness for today as {"78", "Good to train"}, or null when the page has not worked it out today. */
    static String[] ready(JSONObject d, String today) {
        if (!today.equals(d.optString("day", "")) || !d.has("ready")) return null;
        return new String[]{String.valueOf(Math.round(d.optDouble("ready", 0))), d.optString("rword", "")};
    }

    /** "1,140 kcal left", "120 kcal over", "1,820 kcal eaten" or "" (no target and nothing eaten). */
    static String kcalLine(JSONObject d, String today) {
        boolean fresh = today.equals(d.optString("day", ""));
        JSONObject p = planOf(d, today);
        double kt = fresh ? d.optDouble("kt", 0) : (p == null ? 0 : p.optDouble("kt", 0)), eaten = fresh ? d.optDouble("kcal", 0) : 0;
        if (kt > 0) return eaten <= kt ? n0(kt - eaten) + " kcal left" : n0(eaten - kt) + " kcal over";
        return eaten > 0 ? n0(eaten) + " kcal eaten" : "";
    }

    /** "Next: Push day · today", "Done today ✓ · next: Legs tomorrow", "Rest day" or "" (nothing known). now = this moment. */
    static String nextLine(JSONObject d, long now) {
        String today = Nudges.dayKey(now);
        if (today.equals(d.optString("day", ""))) {
            String next = d.optString("next", ""), when = d.optString("when", "").toLowerCase(Locale.US);
            if (d.optBoolean("done", false)) return next.isEmpty() ? "Done today ✓" : "Done today ✓ · next: " + next + (when.isEmpty() ? "" : " " + when);
            if (!next.isEmpty()) return "Next: " + next + (when.isEmpty() ? "" : " · " + when);
            return planOf(d, today) == null ? "" : "Rest day";
        }
        if (d.optJSONObject("plan") == null) return "";
        Calendar t = Calendar.getInstance();
        t.setTimeInMillis(now);
        String up = "";
        for (int i = 0; i < 8; i++) {
            JSONObject p = planOf(d, Nudges.dayKey(t.getTimeInMillis()));
            String w = p == null ? "" : p.optString("w", "");
            if (!w.isEmpty()) return "Next: " + w + " · " + (i == 0 ? "today" : i == 1 ? "tomorrow" : new SimpleDateFormat("EEEE", Locale.US).format(new Date(t.getTimeInMillis())));
            if (i == 0 && p == null) return "";
            if (i == 0) up = p.optString("up", "");
            t.add(Calendar.DAY_OF_YEAR, 1);
        }
        return up.isEmpty() ? "Rest day" : "Next: " + up;
    }

    /** The brief for this morning: {title, text}. */
    static String[] lines(JSONObject d, long now) {
        String today = Nudges.dayKey(now);
        JSONObject p = planOf(d, today);
        String w = p == null ? "" : p.optString("w", ""), up = p == null ? "" : p.optString("up", "");
        String title = p == null ? "Good morning" : !w.isEmpty() ? "Today: " + w : !up.isEmpty() ? "Next up: " + up : "Rest day today";
        String[] r = ready(d, today);
        double kt = p == null ? 0 : p.optDouble("kt", 0);
        String target = kt > 0 ? "Target " + n0(kt) + " kcal" : "";
        String text;
        if (r != null) text = "Readiness " + r[0] + (r[1].isEmpty() ? "" : " · " + r[1]) + (target.isEmpty() ? "" : " · " + target);
        else text = (target.isEmpty() ? "" : target + " · ") + (p == null ? "Tap for today's plan and readiness" : "Tap for today's readiness");
        return new String[]{title, text};
    }

    static void show(Context c) {
        JSONObject d = data(c);
        if (!d.optBoolean("bOn", false)) return;
        String[] l = lines(d, System.currentTimeMillis());
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CH, "Morning brief", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("One notification each morning: today's workout, calorie target and readiness");
        nm.createNotificationChannel(ch);
        PendingIntent open = PendingIntent.getActivity(c, REQ, new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        Notification n = new Notification.Builder(c, CH)
                .setSmallIcon(R.drawable.ic_stat_gym)
                .setContentTitle(l[0])
                .setContentText(l[1])
                .setStyle(new Notification.BigTextStyle().bigText(l[1]))
                .setAutoCancel(true)
                .setContentIntent(open)
                .build();
        nm.notify(ID, n);
    }

    /** The next time of day the brief is due after now, or 0 when it is off. */
    static long due(JSONObject d, long now) {
        if (!d.optBoolean("bOn", false)) return 0;
        int mins = Math.max(0, Math.min(1439, d.optInt("bMin", 420)));
        Calendar t = Calendar.getInstance();
        t.setTimeInMillis(now);
        t.set(Calendar.HOUR_OF_DAY, mins / 60);
        t.set(Calendar.MINUTE, mins % 60);
        t.set(Calendar.SECOND, 0);
        t.set(Calendar.MILLISECOND, 0);
        if (t.getTimeInMillis() <= now + 30000) t.add(Calendar.DAY_OF_YEAR, 1);
        return t.getTimeInMillis();
    }

    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, REQ, new Intent(c, Brief.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        long when = due(data(c), System.currentTimeMillis());
        if (when > 0) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
    }
}
