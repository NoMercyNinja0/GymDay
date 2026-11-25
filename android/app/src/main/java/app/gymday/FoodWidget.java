package app.gymday;

import android.app.PendingIntent;
import android.appwidget.AppWidgetManager;
import android.appwidget.AppWidgetProvider;
import android.content.ComponentName;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.widget.RemoteViews;

import org.json.JSONObject;

import java.util.Locale;

/**
 * v1.20: the Food widget. Today's calories and protein against the daily targets, with a button that opens Add food.
 * The page writes what to show as JSON in preferences ("fData") whenever the food changes:
 *   {"day":"2026-11-17","kcal":1820,"kt":2960,"p":62.4,"pt":95}   (kt / pt: the targets, 0 when none is set)
 * A widget still showing yesterday shows an empty day instead, so it is right after midnight without the app being opened.
 */
public class FoodWidget extends AppWidgetProvider {

    @Override
    public void onUpdate(Context c, AppWidgetManager m, int[] ids) {
        for (int id : ids) m.updateAppWidget(id, views(c));
    }

    static void refresh(Context c) {
        try {
            AppWidgetManager m = AppWidgetManager.getInstance(c);
            int[] ids = m.getAppWidgetIds(new ComponentName(c, FoodWidget.class));
            if (ids.length > 0) m.updateAppWidget(ids, views(c));
        } catch (Throwable ignored) {
        }
    }

    private static PendingIntent go(Context c, String to, int req) {
        Intent i = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", to);
        return PendingIntent.getActivity(c, req, i, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
    }

    private static String n0(double v) {
        return String.format(Locale.US, "%,d", Math.round(v));
    }

    static RemoteViews views(Context c) {
        SharedPreferences p = c.getSharedPreferences("gymday", Context.MODE_PRIVATE);
        JSONObject d;
        try {
            d = new JSONObject(p.getString("fData", "{}"));
        } catch (Exception e) {
            d = new JSONObject();
        }
        boolean today = Nudges.dayKey(System.currentTimeMillis()).equals(d.optString("day", ""));
        double kcal = today ? d.optDouble("kcal", 0) : 0, kt = d.optDouble("kt", 0), pr = today ? d.optDouble("p", 0) : 0, pt = d.optDouble("pt", 0);
        RemoteViews v = new RemoteViews(c.getPackageName(), R.layout.widget_food);
        v.setOnClickPendingIntent(R.id.f_root, go(c, "foodtab", 21));
        v.setOnClickPendingIntent(R.id.f_add, go(c, "food", 22));
        v.setTextViewText(R.id.f_kcal, kt > 0 ? n0(kcal) + " / " + n0(kt) + " kcal" : n0(kcal) + " kcal");
        v.setTextViewText(R.id.f_left, kt > 0 ? (kcal <= kt ? n0(kt - kcal) + " left" : n0(kcal - kt) + " over") : (kcal > 0 ? "" : "nothing yet"));
        v.setProgressBar(R.id.f_kbar, 1000, kt > 0 ? (int) Math.min(1000, Math.round(kcal / kt * 1000)) : 0, false);
        v.setTextViewText(R.id.f_prot, pt > 0 ? "Protein " + Math.round(pr) + " / " + Math.round(pt) + " g" : "Protein " + Math.round(pr) + " g");
        v.setTextViewText(R.id.f_pleft, pt > 0 ? (pr < pt ? Math.round(pt - pr) + " g to go" : "reached ✓") : "");
        v.setProgressBar(R.id.f_pbar, 1000, pt > 0 ? (int) Math.min(1000, Math.round(pr / pt * 1000)) : 0, false);
        return v;
    }
}
