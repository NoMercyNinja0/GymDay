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

import java.util.ArrayList;
import java.util.Calendar;
import java.util.List;
import java.util.Locale;

/**
 * v1.27: the evening wrap-up. One notification a day at the chosen time (9 pm to start with) with what today held: the
 * workout, the calories and protein against their targets, and what is on tomorrow. On a day with nothing logged it reminds
 * the person to add the day's food (the owner's choice), and stays quiet when food logging is off and there was no workout.
 * It reads the JSON the page keeps up to date for the Today widget and the morning brief ("tData", see Brief), which since
 * v1.27 also has: "wOn" / "wMin" (the switch and the time in minutes, default 1260), "food" (calorie logging is on), "nf" (how
 * many foods are logged that day), "p" / "pt" (protein eaten and its target, in grams) and "wn" (the workouts done that day).
 */
public class Wrap extends BroadcastReceiver {
    static final String ACTION = "app.gymday.WRAP";
    static final String CH = "wrap";
    static final int ID = 42, REQ = 13;

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

    private static String tomorrow(JSONObject d, long now) {
        JSONObject plan = d.optJSONObject("plan");
        Calendar t = Calendar.getInstance();
        t.setTimeInMillis(now);
        t.add(Calendar.DAY_OF_YEAR, 1);
        JSONObject p = plan == null ? null : plan.optJSONObject(Nudges.dayKey(t.getTimeInMillis()));
        if (p == null) return "";
        String w = p.optString("w", ""), up = p.optString("up", "");
        if (!w.isEmpty()) return "Tomorrow: " + w;
        if (!up.isEmpty()) return "Next: " + up;
        return "Tomorrow: rest day";
    }

    /** The wrap-up for tonight as {title, text, "food" when it should open the Food tab}, or null to stay quiet. */
    static String[] lines(JSONObject d, long now) {
        String today = Nudges.dayKey(now);
        boolean fresh = today.equals(d.optString("day", "")), food = d.optBoolean("food", false);
        String wn = fresh ? d.optString("wn", "") : "";
        int nf = fresh ? d.optInt("nf", 0) : 0;
        String next = tomorrow(d, now);
        if (wn.isEmpty() && nf == 0) {
            if (!food) return null;
            return new String[]{"Nothing logged today", "Add today's meals before you sleep, so this week's numbers stay right." + (next.isEmpty() ? "" : " " + next + "."), "food"};
        }
        List<String> parts = new ArrayList<>();
        if (food && nf > 0) {
            double kcal = d.optDouble("kcal", 0), kt = d.optDouble("kt", 0), p = d.optDouble("p", 0), pt = d.optDouble("pt", 0);
            parts.add(kt > 0 ? Brief.n0(kcal) + " of " + Brief.n0(kt) + " kcal" : Brief.n0(kcal) + " kcal");
            if (pt > 0) parts.add("protein " + Brief.n0(p) + " of " + Brief.n0(pt) + " g");
            else if (p > 0) parts.add(Brief.n0(p) + " g protein");
        } else if (food) parts.add("no food logged yet");
        if (!next.isEmpty()) parts.add(next);
        String title = wn.isEmpty() ? "Today's wrap-up" : "Today: " + wn + " ✓";
        return new String[]{title, parts.isEmpty() ? "Tap to see your day." : String.join(" · ", parts), food && nf == 0 ? "food" : ""};
    }

    static void show(Context c) {
        JSONObject d = Brief.data(c);
        if (!d.optBoolean("wOn", false)) return;
        String[] l = lines(d, System.currentTimeMillis());
        if (l == null) return;
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        NotificationChannel ch = new NotificationChannel(CH, "Evening wrap-up", NotificationManager.IMPORTANCE_DEFAULT);
        ch.setDescription("One notification each evening: today's workout, calories and protein, and what is on tomorrow");
        nm.createNotificationChannel(ch);
        Intent go = new Intent(c, MainActivity.class).addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        if ("food".equals(l[2])) go.setAction(MainActivity.ACTION_GO).putExtra("to", "foodtab");
        PendingIntent open = PendingIntent.getActivity(c, REQ, go, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
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

    /** The next time the wrap-up is due after now, or 0 when it is off. */
    static long due(JSONObject d, long now) {
        if (!d.optBoolean("wOn", false)) return 0;
        int mins = Math.max(0, Math.min(1439, d.optInt("wMin", 1260)));
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
        PendingIntent pi = PendingIntent.getBroadcast(c, REQ, new Intent(c, Wrap.class).setAction(ACTION),
                PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
        am.cancel(pi);
        long when = due(Brief.data(c), System.currentTimeMillis());
        if (when > 0) am.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, when, pi);
    }
}
