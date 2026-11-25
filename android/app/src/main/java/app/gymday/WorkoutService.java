package app.gymday;

import android.app.Notification;
import android.app.Service;
import android.content.Context;
import android.content.Intent;
import android.content.pm.ServiceInfo;
import android.os.Build;
import android.os.IBinder;

import org.json.JSONObject;

/**
 * Keeps GymDay in memory while a workout runs, so the buttons on the card and the widget keep working when the
 * phone is locked or another app is open. It does nothing else: it only holds the workout card as its notification.
 * Everything is guarded: if the phone refuses (it does when this is started from the background), the card is still
 * an ordinary notification, exactly as before.
 */
public class WorkoutService extends Service {
    private static volatile boolean running;
    private boolean foreground;       // whether this instance really became a foreground service

    static void ensure(Context c) {
        if (running) return;
        try {
            c.startService(new Intent(c, WorkoutService.class));
        } catch (Throwable ignored) {      // not allowed while the app is in the background: the plain notification stays
        }
    }

    static void stop(Context c) {
        try {
            c.stopService(new Intent(c, WorkoutService.class));
        } catch (Throwable ignored) {
        }
    }

    @Override
    public int onStartCommand(Intent intent, int flags, int startId) {
        try {
            JSONObject card = WorkoutNotifier.card(this);
            if (card == null) {
                stopSelf();
                return START_NOT_STICKY;
            }
            // started again by the phone after it closed the app: the page is gone, so no buttons
            if (MainActivity.live() == null) WorkoutNotifier.prefs(this).edit().putBoolean("wOpenOnly", true).apply();
            Notification n = WorkoutNotifier.build(this, card, !WorkoutNotifier.prefs(this).getBoolean("wOpenOnly", false));
            if (Build.VERSION.SDK_INT >= 34) startForeground(WorkoutNotifier.ID_WORKOUT, n, ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE);
            else startForeground(WorkoutNotifier.ID_WORKOUT, n);
            running = true;
            foreground = true;
            return START_STICKY;
        } catch (Throwable t) {
            running = false;
            try {
                WorkoutNotifier.show(this, false);
            } catch (Throwable ignored) {
            }
            stopSelf();
            return START_NOT_STICKY;
        }
    }

    /** The app was swiped away from the recent-apps list: its page is gone with it. */
    @Override
    public void onTaskRemoved(Intent rootIntent) {
        try {
            WorkoutNotifier.openOnly(this);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public void onDestroy() {
        running = false;
        if (foreground) {
            try {
                stopForeground(true);
            } catch (Throwable ignored) {
            }
        }
        super.onDestroy();
    }

    @Override
    public IBinder onBind(Intent intent) {
        return null;
    }
}
