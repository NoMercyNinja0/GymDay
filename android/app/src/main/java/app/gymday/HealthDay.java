package app.gymday;

import org.json.JSONException;
import org.json.JSONObject;

import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 1.24, "automatic from your watch": turns what Health Connect holds for one night into GymDay's own shape.
 * Plain Java with no Health Connect classes in it, so both paths (Android 14 and newer, and the Health Connect app on
 * older phones) share it and it can be checked without either.
 *
 * What readDay answers on both paths (a number is left out when nothing was recorded or it may not be read):
 * {"ok":true, "perm":{"hr","active","total","steps","sleep","rest","hrv","spo2","br"},
 *  "steps", "avg","max","min" (heart rate of the day), "rest" (resting heart rate),
 *  "active","total" (kcal from the day's start up to "upto"),
 *  "upto" (today only: how far the watch's numbers reach, the end of the newest record it sent),
 *  "night":{"start","end" (ms), "min" (asleep), "deep","rem","light","awake" (minutes, with stages only), "staged", "app", "n"},
 *  "hrv" (ms), "spo2" (%), "br" (breaths a minute): averages over that night}
 */
final class HealthDay {
    // Health Connect's numbers for the stages of sleep: the same in Android's own classes and in Google's library
    static final int UNKNOWN = 0, AWAKE = 1, SLEEPING = 2, OUT_OF_BED = 3, LIGHT = 4, DEEP = 5, REM = 6, AWAKE_IN_BED = 7;
    static final long MIN = 60000L, HOUR = 3600000L;
    /** Two sleeps closer together than this are one night: a watch often splits a night in two. */
    static final long GAP = 90 * MIN;
    /** Nothing longer than this is one sleep. */
    static final long LONGEST = 20 * HOUR;
    /** How long before a day's start a night that ended in it can have begun. */
    static final long LOOK_BACK = 20 * HOUR;
    /** How long after a day's end the sleeps are still read, so a night that runs past midnight is seen whole. */
    static final long LOOK_ON = 12 * HOUR;

    /** Each kind of reading and the permission it needs. */
    static final String[][] KINDS = {
            {"hr", HealthBridge.HR}, {"active", HealthBridge.ACTIVE}, {"total", HealthBridge.TOTAL}, {"steps", HealthBridge.STEPS},
            {"sleep", HealthBridge.SLEEP}, {"rest", HealthBridge.REST}, {"hrv", HealthBridge.HRV}, {"spo2", HealthBridge.SPO2}, {"br", HealthBridge.BREATH}};

    private HealthDay() {
    }

    static final class Stage {
        final long start, end;
        final int type;

        Stage(long s, long e, int t) {
            start = s;
            end = e;
            type = t;
        }
    }

    /** One sleep as an app saved it. */
    static final class Sleep {
        final long start, end;
        final String app;
        final List<Stage> stages = new ArrayList<>();

        Sleep(long s, long e, String a) {
            start = s;
            end = e;
            app = a == null ? "" : a;
        }
    }

    /** One app's stretch of sleep, added up (times in milliseconds). */
    static final class Block {
        long start, end;
        double asleep, deep, rem, light, awake;
        boolean staged;
        int n;
        String app = "";

        double minutes() {
            return Math.min(asleep, end - start) / (double) MIN;
        }
    }

    /** Which kinds may be read, from the permissions that are granted. */
    static JSONObject perms(Set<String> granted) {
        JSONObject o = new JSONObject();
        try {
            for (String[] k : KINDS) o.put(k[0], granted != null && granted.contains(k[1]));
        } catch (JSONException ignored) {
        }
        return o;
    }

    /** One app's sleeps as stretches: sleeps close together are one stretch, and hours saved twice count once. */
    static List<Block> blocks(List<Sleep> one) {
        List<Sleep> list = new ArrayList<>(one);
        Collections.sort(list, (a, b) -> Long.compare(a.start, b.start));
        List<Block> out = new ArrayList<>();
        Block cur = null;
        long covered = Long.MIN_VALUE;
        for (Sleep s : list) {
            if (s.end <= s.start || s.end - s.start > LONGEST) continue;
            if (cur == null || s.start - cur.end > GAP) {
                cur = new Block();
                cur.start = s.start;
                cur.end = s.end;
                cur.app = s.app;
                out.add(cur);
                covered = s.start;
            }
            long from = Math.max(s.start, covered);
            if (from < s.end) add(cur, s, from);
            cur.end = Math.max(cur.end, s.end);
            covered = Math.max(covered, s.end);
            cur.n++;
        }
        return out;
    }

    /** Adds the part of one sleep from `from` on. With no stages the whole of it counts as asleep. */
    private static void add(Block b, Sleep s, long from) {
        if (s.stages.isEmpty()) {
            b.asleep += s.end - from;
            return;
        }
        b.staged = true;
        for (Stage g : s.stages) {
            long a = Math.max(Math.max(g.start, s.start), from), z = Math.min(g.end, s.end);
            if (z <= a) continue;
            long d = z - a;
            switch (g.type) {
                case DEEP:
                    b.deep += d;
                    b.asleep += d;
                    break;
                case REM:
                    b.rem += d;
                    b.asleep += d;
                    break;
                case LIGHT:
                    b.light += d;
                    b.asleep += d;
                    break;
                case SLEEPING:
                case UNKNOWN:
                    b.asleep += d;
                    break;
                case AWAKE:
                case AWAKE_IN_BED:
                case OUT_OF_BED:
                    b.awake += d;
                    break;
                default:
                    break;
            }
        }
    }

    /**
     * The main sleep that ended after `from` and no later than `to` (a day's start, and its end or now): the longest stretch
     * any one app saved, where one with stages wins a near tie. Two apps that saved the same night are never added together.
     * Null when there is none of 30 minutes to 16 hours.
     */
    static JSONObject night(List<Sleep> all, long from, long to) {
        Map<String, List<Sleep>> byApp = new LinkedHashMap<>();
        for (Sleep s : all) {
            if (s == null) continue;
            List<Sleep> l = byApp.get(s.app);
            if (l == null) {
                l = new ArrayList<>();
                byApp.put(s.app, l);
            }
            l.add(s);
        }
        Block best = null;
        double bestScore = 0;
        for (List<Sleep> l : byApp.values()) {
            for (Block b : blocks(l)) {
                if (b.end <= from || b.end > to) continue;
                double m = b.minutes();
                if (m < 30 || m > 16 * 60) continue;
                double score = m * (b.staged ? 1.25 : 1.0);
                if (score > bestScore) {
                    best = b;
                    bestScore = score;
                }
            }
        }
        if (best == null) return null;
        JSONObject o = new JSONObject();
        try {
            o.put("start", best.start);
            o.put("end", best.end);
            o.put("min", Math.round(best.minutes()));
            o.put("staged", best.staged);
            o.put("app", best.app);
            o.put("n", best.n);
            if (best.staged) {
                mins(o, "deep", best.deep);
                mins(o, "rem", best.rem);
                mins(o, "light", best.light);
                mins(o, "awake", best.awake);
            }
        } catch (JSONException e) {
            return null;
        }
        return o;
    }

    private static void mins(JSONObject o, String k, double ms) throws JSONException {
        long m = Math.round(ms / MIN);
        if (m > 0) o.put(k, m);
    }

    /** The average of the readings from lo to hi (others are a sensor's slip); NaN when there are none. */
    static double mean(List<Double> v, double lo, double hi) {
        double sum = 0;
        int n = 0;
        for (Double x : v) {
            if (x == null || x.isNaN() || x < lo || x > hi) continue;
            sum += x;
            n++;
        }
        return n == 0 ? Double.NaN : sum / n;
    }

    /** Puts a number rounded to one decimal place, unless it is not a number. */
    static void put1(JSONObject o, String k, double v) {
        if (Double.isNaN(v) || Double.isInfinite(v)) return;
        try {
            o.put(k, Math.round(v * 10) / 10.0);
        } catch (JSONException ignored) {
        }
    }

    /** The hours the night's heart readings are taken from: the night itself, or 6 pm to 11 am around the day's start. */
    static long[] window(JSONObject night, long start, long to) {
        if (night != null) {
            long a = night.optLong("start", 0), b = night.optLong("end", 0);
            if (b > a) return new long[]{a, b};
        }
        return new long[]{start - 6 * HOUR, Math.max(start - 6 * HOUR + MIN, Math.min(start + 11 * HOUR, to))};
    }
}
