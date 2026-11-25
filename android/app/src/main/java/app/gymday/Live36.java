package app.gymday;

import android.annotation.TargetApi;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;

import org.json.JSONArray;
import org.json.JSONObject;

/**
 * The Android 16 parts of the workout card, kept in their own class so older phones never load it:
 * the progress-style template Live Updates are built on (one segment per exercise, as long as its sets),
 * and the few characters the capsule itself shows.
 */
@TargetApi(36)
final class Live36 {
    private Live36() {
    }

    static void dress(Notification.Builder b, JSONObject card, boolean paused) {
        Notification.ProgressStyle ps = new Notification.ProgressStyle().setStyledByProgress(true);
        JSONArray segs = card.optJSONArray("segs");
        int max = 0;
        for (int i = 0; segs != null && i < segs.length(); i++) {
            int len = segs.optInt(i, 0);
            if (len <= 0) continue;
            ps.addProgressSegment(new Notification.ProgressStyle.Segment(len).setColor(0xFF22E3FF));
            max += len;
        }
        if (max > 0) ps.setProgress(Math.max(0, Math.min(card.optInt("done", 0), max)));
        b.setStyle(ps);
        String chip = card.optString("chip", "");
        if (!chip.isEmpty()) b.setShortCriticalText(chip);
    }

    /** Whether this phone's Android finds the notification fit for the capsule (its rule differs between Android 16 releases). */
    static boolean fit(Notification n) {
        return n.hasPromotableCharacteristics();
    }

    /** Whether this phone lets GymDay use the capsule (the person can switch it off per app). */
    static boolean allowed(Context c) {
        return c.getSystemService(NotificationManager.class).canPostPromotedNotifications();
    }
}
