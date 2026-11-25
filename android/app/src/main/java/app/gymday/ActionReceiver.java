package app.gymday;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/**
 * A button on the workout card (lock screen, capsule) or on the widget was pressed: Tick set, Next exercise,
 * Pause, Resume or Finish. The workout lives in the app's page, so the press is handed to it without opening the app.
 * If the page is not in memory any more, nothing can be changed from here; the card and the widget then say
 * "tap to open" instead of showing buttons that do nothing.
 */
public class ActionReceiver extends BroadcastReceiver {
    static boolean known(String what) {
        return "tick".equals(what) || "next".equals(what) || "pause".equals(what) || "resume".equals(what) || "finish".equals(what);
    }

    @Override
    public void onReceive(Context c, Intent i) {
        try {
            String a = i == null ? null : i.getAction();
            if (a == null || !a.startsWith(WorkoutNotifier.ACT)) return;
            String what = a.substring(WorkoutNotifier.ACT.length());
            if (!known(what)) return;
            MainActivity m = MainActivity.live();
            if (m != null && m.act(what)) return;
            WorkoutNotifier.openOnly(c);
        } catch (Throwable ignored) {
        }
    }
}
