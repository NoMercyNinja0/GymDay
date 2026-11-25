package app.gymday;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.widget.RemoteViews;

import org.json.JSONObject;

/**
 * v1.25: the Today widget: readiness, calories left and the next workout, from the same JSON as the morning brief ("tData",
 * see Brief). A widget whose data is from an earlier day shows what was planned for today instead (the target with nothing
 * eaten, the planned workout) and a dash for readiness, so it is never yesterday's numbers.
 */
public class TodayWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    static void refresh(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, TodayWidget.class));
            if (ids.length > 0) m.updateAppWidget(ids, views(c));
        } catch (Throwable ignored) {
        }
    }

    static RemoteViews views(Context c) {
        JSONObject d = Brief.data(c);
        long now = System.currentTimeMillis();
        String today = Nudges.dayKey(now);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_today);
        v.setOnClickPendingIntent(R.id.t_root, PendingIntent.getActivity(c, 31, new Intent(c, MainActivity.class), PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE));
        String[] r = Brief.ready(d, today);
        v.setTextViewText(R.id.t_ready, r == null ? "–" : r[0]);
        v.setTextViewText(R.id.t_word, r == null ? "Open for today's readiness" : r[1].isEmpty() ? "Readiness" : r[1]);
        String k = Brief.kcalLine(d, today), n = Brief.nextLine(d, now);
        v.setTextViewText(R.id.t_kcal, k.isEmpty() ? "No calorie target" : k);
        v.setTextViewText(R.id.t_next, n.isEmpty() ? "Open GymDay to plan your week" : n);
        return v;
    }
}
