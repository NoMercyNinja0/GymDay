package app.gymday;

import android.app.AlarmManager;
import android.app.PendingIntent;
import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;

import org.json.JSONArray;

import java.util.Calendar;

/**
 * Gym reminders: one alarm for the next planned gym day at the chosen time. When it fires it shows the
 * reminder and sets the alarm after it. Also runs after the phone restarts, because alarms do not survive that.
 * What to remind about is kept in preferences: remOn, remTime (minutes after midnight), remDays (7 day names, Sunday first, "" = rest).
 */
public class ReminderReceiver extends BroadcastReceiver {
    static final String ACTION = "app.gymday.REMIND";
    static final String ACTION_STILL = "app.gymday.STILL";

    @Override
    public void onReceive(Context c, Intent i) {
        try {
            if (i != null && ACTION_STILL.equals(i.getAction())) {
                WorkoutNotifier.remind(c, "Still training?", "Your workout is still running. Tap to finish it or keep going.");
                return;
            }
            if (i != null && ACTION.equals(i.getAction())) {
                SharedPreferences p = prefs(c);
                String name = dayName(p, Calendar.getInstance().get(Calendar.DAY_OF_WEEK) - 1);
                if (p.getBoolean("remOn", false) && !name.isEmpty()) {
                    WorkoutNotifier.remind(c, name + " today", "Time for the gym. Tap to open GymDay.");
                }
            }
            schedule(c);
        } catch (Exception ignored) {
        }
    }

    static SharedPreferences prefs(Context c) {
        return c.getSharedPreferences("gymday", Context.MODE_PRIVATE);
    }

    static String dayName(SharedPreferences p, int weekday) {
        try {
            return new JSONArray(p.getString("remDays", "[]")).optString(weekday, "");
        } catch (Exception e) {
            return "";
        }
    }

    /** One alarm for the moment a running workout has gone quiet for too long; when <= now cancels it. */
    static void still(Context c, long when) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 8, new Intent(c, ReminderReceiver.class).setAction(ACTION_STILL),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        if (when > System.currentTimeMillis()) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
    }

    static void schedule(Context c) {
        AlarmManager am = c.getSystemService(AlarmManager.class);
        PendingIntent pi = PendingIntent.getBroadcast(c, 7, new Intent(c, ReminderReceiver.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        SharedPreferences p = prefs(c);
        if (!p.getBoolean("remOn", false)) return;
        int mins = p.getInt("remTime", 17 * 60);
        Calendar now = Calendar.getInstance();
        for (int d = 0; d < 8; d++) {
            Calendar t = (Calendar) now.clone();
            t.add(Calendar.DAY_OF_YEAR, d);
            t.set(Calendar.HOUR_OF_DAY, mins / 60);
            t.set(Calendar.MINUTE, mins % 60);
            t.set(Calendar.SECOND, 0);
            t.set(Calendar.MILLISECOND, 0);
            if (t.getTimeInMillis() <= now.getTimeInMillis() + 30000) continue;
            if (dayName(p, t.get(Calendar.DAY_OF_WEEK) - 1).isEmpty()) continue;
            am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, t.getTimeInMillis(), pi);
            return;
        }
    }
}
