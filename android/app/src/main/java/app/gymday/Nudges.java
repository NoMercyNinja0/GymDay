package app.gymday;

import android.app.AlarmManager;
import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;
import org.json.JSONObject;

import java.text.SimpleDateFormat;
import java.util.Calendar;
import java.util.Date;
import java.util.Locale;

/**
 * v1.20: supplement reminders and the evening protein nudge.
 *
 * Supplements: the page works out when each one is due over the next two weeks and writes the list ("sRem"):
 *   [{"t": <ms>, "id": "<plan id>", "title": "Creatine", "text": "1 scoop · every day"}, ...]
 * One alarm waits for the earliest one still to come; when it rings, every reminder due within the minute shows, and the alarm
 * moves on to the next. The page writes the list again whenever it opens or a plan changes (a dose already ticked is left out).
 *
 * Protein: the page writes {"on": true, "mins": 1140, "day": "2026-11-17", "got": 62, "goal": 95} ("pNudge") whenever the food
 * changes. At "mins" each day the alarm looks: when food was logged today and protein is 10 g or more short, it says how much.
 *
 * Both are set again after the phone restarts or the app is updated, because alarms do not survive that.
 */
public class Nudges extends BroadcastReceiver {
    static final String ACT_SUPP = "app.gymday.SUPP", ACT_PROT = "app.gymday.PROTEIN";
    static final String CH = "nudges";
    static final int ID_PROT = 21, ID_SUPP0 = 30;

    @Override
    public void onReceive(Context c, Intent i) {
        String a = i == null ? null : i.getAction();
        try {
            if (ACT_SUPP.equals(a)) suppsDue(c);
            else if (ACT_PROT.equals(a)) proteinCheck(c);
        } catch (Exception ignored) {
        }
        try {
            scheduleSupps(c);
        } catch (Exception ignored) {
        }
        try {
            scheduleProtein(c);
        } catch (Exception ignored) {
        }
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("gymday", Context.MODE_PRIVATE);
    }

    static String dayKey(long t) {
        return new SimpleDateFormat("yyyy-MM-dd", Locale.US).format(new Date(t));
    }

    private static void channel(Context c) {
        NotificationChannel ch = new NotificationChannel(CH, "Food and supplement reminders", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("Your supplement reminders and the evening protein reminder");
        c.getSystemService(NotificationManager.class).createNotificationChannel(ch);
    }

    /** Opens the app on a screen: "supps" (the supplements page) or "foodtab" (the Food tab). */
    private static PendingIntent go(Context c, String to, int req) {
        Intent i = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", to)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static void notify(Context c, int id, String title, String text, PendingIntent tap) {
        channel(c);
        Notification n = new Notification.Builder(c, CH)
                .setSmallIcon(R.drawable.ic_stat_gym)
                .setContentTitle(title)
                .setContentText(text)
                .setStyle(new Notification.BigTextStyle().bigText(text))
                .setColor(0xFF3D9BFF)
                .setAutoCancel(true)
                .setContentIntent(tap)
                .build();
        c.getSystemService(NotificationManager.class).notify(id, n);
    }

    // ---------------- supplements ----------------

    static void setSupps(Context c, String json) {
        try {
            new JSONArray(json);
            prefs(c).edit().putString("sRem", json).apply();
        } catch (Exception e) {
            prefs(c).edit().remove("sRem").apply();
        }
        scheduleSupps(c);
    }

    private static PendingIntent suppAlarm(Context c) {
        return PendingIntent.getBroadcast(c, 11, new Intent(c, Nudges.class).setAction(ACT_SUPP), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleSupps(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = suppAlarm(c);
        am.cancel(pi);
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis(), after = Math.max(now, p.getLong("sDone", 0)), next = Long.MAX_VALUE;
        try {
            JSONArray a = new JSONArray(p.getString("sRem", "[]"));
            for (int i = 0; i < a.length(); i++) {
                long t = (long) a.getJSONObject(i).optDouble("t", 0);
                if (t > after && t < next) next = t;
            }
        } catch (Exception ignored) {
        }
        if (next != Long.MAX_VALUE) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, next, pi);
    }

    /** Every reminder due by now (and not more than half an hour late) that has not shown yet. */
    private static void suppsDue(Context c) throws Exception {
        SharedPreferences p = prefs(c);
        long now = System.currentTimeMillis(), done = p.getLong("sDone", 0);
        JSONArray a = new JSONArray(p.getString("sRem", "[]"));
        for (int i = 0; i < a.length(); i++) {
            JSONObject o = a.getJSONObject(i);
            long t = (long) o.optDouble("t", 0);
            if (t <= done || t > now + 60000 || t < now - 30 * 60000) continue;
            String id = o.optString("id", String.valueOf(i));
            notify(c, ID_SUPP0 + Math.abs(id.hashCode() % 30), o.optString("title", "Supplement"), o.optString("text", "Time to take it. Tap to tick it off."), go(c, "supps", 12));
        }
        p.edit().putLong("sDone", now + 60000).apply();
    }

    // ---------------- protein in the evening ----------------

    static void setProtein(Context c, String json) {
        try {
            new JSONObject(json);
            prefs(c).edit().putString("pNudge", json).apply();
        } catch (Exception e) {
            prefs(c).edit().remove("pNudge").apply();
        }
        scheduleProtein(c);
    }

    private static PendingIntent protAlarm(Context c) {
        return PendingIntent.getBroadcast(c, 13, new Intent(c, Nudges.class).setAction(ACT_PROT), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    static void scheduleProtein(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = protAlarm(c);
        am.cancel(pi);
        JSONObject o;
        try {
            o = new JSONObject(prefs(c).getString("pNudge", "{}"));
        } catch (Exception e) {
            return;
        }
        if (!o.optBoolean("on", false)) return;
        int mins = Math.max(0, Math.min(1439, o.optInt("mins", 19 * 60)));
        Calendar t = Calendar.getInstance();
        t.set(Calendar.HOUR_OF_DAY, mins / 60);
        t.set(Calendar.MINUTE, mins % 60);
        t.set(Calendar.SECOND, 0);
        t.set(Calendar.MILLISECOND, 0);
        if (t.getTimeInMillis() <= System.currentTimeMillis() + 30000) t.add(Calendar.DAY_OF_YEAR, 1);
        am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi);
    }

    private static void proteinCheck(Context c) throws Exception {
        JSONObject o = new JSONObject(prefs(c).getString("pNudge", "{}"));
        if (!o.optBoolean("on", false)) return;
        if (!dayKey(System.currentTimeMillis()).equals(o.optString("day", ""))) return;      // nothing logged today: nothing to say
        int got = (int) Math.round(o.optDouble("got", 0)), goal = (int) Math.round(o.optDouble("goal", 0)), left = goal - got;
        if (goal <= 0 || left < 10) return;
        notify(c, ID_PROT, "Protein: " + got + " of " + goal + " g today",
                left + " g to go. Dal, paneer, curd, eggs, chicken, fish or a glass of milk with dinner gets you there.", go(c, "foodtab", 14));
    }
}
