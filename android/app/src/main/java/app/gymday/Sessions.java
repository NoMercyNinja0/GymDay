package app.gymday;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/** 1.28, "forgot to log?": the workouts a watch or another app put into Health Connect, as the app reads them.
 *  Android's own Health Connect and Google's library number the kinds of exercise differently, so each side
 *  says the kind in words first ("gym" for strength training, weightlifting and calisthenics). */
final class Sessions {
    private Sessions() {
    }

    static final class Row {
        final long start, end;
        final String kind, title, app;

        Row(long start, long end, String kind, String title, String app) {
            this.start = start;
            this.end = end;
            this.kind = kind == null ? "other" : kind;
            this.title = title == null ? "" : title;
            this.app = app == null ? "" : app;
        }
    }

    /** Leaves out GymDay's own workouts (it writes them there when asked) and anything under 10 minutes or over 5 hours;
     *  oldest first, at most 60. */
    static String json(List<Row> rows, String self) {
        try {
            List<Row> keep = new ArrayList<>();
            for (Row r : rows) {
                if (r == null || r.app.equals(self)) continue;
                long d = r.end - r.start;
                if (d < 10 * 60000L || d > 5 * 3600000L) continue;
                keep.add(r);
            }
            Collections.sort(keep, (a, b) -> Long.compare(a.start, b.start));
            JSONArray a = new JSONArray();
            for (Row r : keep.subList(0, Math.min(60, keep.size()))) {
                JSONObject o = new JSONObject();
                o.put("s", r.start);
                o.put("e", r.end);
                o.put("kind", r.kind);
                o.put("title", r.title.length() > 60 ? r.title.substring(0, 60) : r.title);
                o.put("app", r.app);
                a.put(o);
            }
            JSONObject out = new JSONObject();
            out.put("ok", true);
            out.put("items", a);
            return out.toString();
        } catch (Exception e) {
            return "{\"ok\":false}";
        }
    }
}
