package app.gymday;

import org.json.JSONObject;

import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

/**
 * One finished workout as GymDay hands it to Health Connect, checked and trimmed, the same on every Android version.
 * The page sends {"id","start","end" (epoch ms),"title","notes","v"}. Writing the same workout again (with a higher v)
 * updates the entry instead of adding a second one, because Health Connect matches it by its client record id.
 */
final class WorkoutEntry {
    static final String PREFIX = "gymday-";
    static final long MAX_MS = 24L * 3600000;

    final String clientId;
    final long version;
    final Instant start, end;
    final ZoneOffset startZone, endZone;
    final String title, notes;

    private WorkoutEntry(String clientId, long version, Instant start, Instant end, String title, String notes) {
        this.clientId = clientId;
        this.version = version;
        this.start = start;
        this.end = end;
        ZoneId z = ZoneId.systemDefault();
        this.startZone = z.getRules().getOffset(start);
        this.endZone = z.getRules().getOffset(end);
        this.title = title;
        this.notes = notes;
    }

    /** The workout's own id as Health Connect knows it; "" when the id has nothing usable in it. */
    static String clientId(String id) {
        String c = id == null ? "" : id.replaceAll("[^A-Za-z0-9_-]", "");
        if (c.length() > 64) c = c.substring(0, 64);
        return c.isEmpty() ? "" : PREFIX + c;
    }

    private static String text(String s, int max) {
        s = s == null ? "" : s.replaceAll("[\\u0000-\\u0008\\u000B\\u000C\\u000E-\\u001F]", "").trim();
        return s.length() > max ? s.substring(0, max - 1).trim() + "…" : s;
    }

    /** null when it can't be written: no id, or no time between start and end. */
    static WorkoutEntry from(JSONObject o) {
        if (o == null) return null;
        String cid = clientId(o.optString("id", ""));
        long s = o.optLong("start", 0), e = o.optLong("end", 0);
        if (cid.isEmpty() || s <= 0 || e - s < 60000) return null;
        if (e - s > MAX_MS) e = s + MAX_MS;
        long v = Math.max(1, o.optLong("v", 1));
        String title = text(o.optString("title", ""), 100);
        if (title.isEmpty()) title = "Workout";
        return new WorkoutEntry(cid, v, Instant.ofEpochMilli(s), Instant.ofEpochMilli(e), title, text(o.optString("notes", ""), 1000));
    }
}
