package app.gymday;

import android.app.Activity;
import android.content.Intent;
import android.net.Uri;
import android.os.Looper;

import androidx.activity.result.contract.ActivityResultContract;
import androidx.health.connect.client.HealthConnectClient;
import androidx.health.connect.client.PermissionController;
import androidx.health.connect.client.aggregate.AggregateMetric;
import androidx.health.connect.client.aggregate.AggregationResult;
import androidx.health.connect.client.records.ActiveCaloriesBurnedRecord;
import androidx.health.connect.client.records.ExerciseSessionRecord;
import androidx.health.connect.client.records.HeartRateRecord;
import androidx.health.connect.client.records.HeartRateVariabilityRmssdRecord;
import androidx.health.connect.client.records.InstantaneousRecord;
import androidx.health.connect.client.records.IntervalRecord;
import androidx.health.connect.client.records.OxygenSaturationRecord;
import androidx.health.connect.client.records.Record;
import androidx.health.connect.client.records.RespiratoryRateRecord;
import androidx.health.connect.client.records.RestingHeartRateRecord;
import androidx.health.connect.client.records.SleepSessionRecord;
import androidx.health.connect.client.records.StepsRecord;
import androidx.health.connect.client.records.TotalCaloriesBurnedRecord;
import androidx.health.connect.client.records.WeightRecord;
import androidx.health.connect.client.records.metadata.DataOrigin;
import androidx.health.connect.client.records.metadata.Metadata;
import androidx.health.connect.client.request.AggregateRequest;
import androidx.health.connect.client.request.ReadRecordsRequest;
import androidx.health.connect.client.response.InsertRecordsResponse;
import androidx.health.connect.client.response.ReadRecordsResponse;
import androidx.health.connect.client.time.TimeRangeFilter;
import androidx.health.connect.client.units.Energy;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;

import kotlin.Unit;
import kotlin.coroutines.EmptyCoroutineContext;
import kotlin.jvm.JvmClassMappingKt;
import kotlinx.coroutines.BuildersKt;

/**
 * Watch data on Android 13 and older. There Health Connect is a separate app from Google Play, reached through
 * Google's Health Connect library (which is written for Kotlin; the runBlocking calls below wait for its answers,
 * always on a background thread). The same numbers and the same answers as HealthBridge, and the same one thing written
 * when the person turns it on: each finished workout as an exercise session.
 */
final class HealthCompat implements HealthSource {
    static final String PROVIDER = "com.google.android.apps.healthdata";

    private final Activity act;
    private final Executor exec = Executors.newSingleThreadExecutor();
    private final ActivityResultContract<Set<String>, Set<String>> contract = PermissionController.createRequestPermissionResultContract();
    private volatile Set<String> granted = new HashSet<>();

    HealthCompat(Activity a) {
        act = a;
    }

    private int status() {
        try {
            return HealthConnectClient.getSdkStatus(act);
        } catch (Throwable t) {
            return HealthConnectClient.SDK_UNAVAILABLE;
        }
    }

    @Override
    public boolean available() {
        return status() == HealthConnectClient.SDK_AVAILABLE;
    }

    /** Health Connect can work on this phone but the app is missing or too old. */
    boolean installable() {
        return status() == HealthConnectClient.SDK_UNAVAILABLE_PROVIDER_UPDATE_REQUIRED;
    }

    private HealthConnectClient client() {
        return HealthConnectClient.getOrCreate(act);
    }

    /** Asks Health Connect what it currently allows. A call to another app, so never on the main thread. */
    private void refresh() {
        if (Looper.myLooper() == Looper.getMainLooper()) return;
        try {
            final PermissionController pc = client().getPermissionController();
            Set<String> s = BuildersKt.<Set<String>>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> pc.getGrantedPermissions(c));
            if (s != null) granted = new HashSet<>(s);
        } catch (Throwable ignored) {
        }
    }

    @Override
    public boolean has(String p) {
        refresh();
        return granted.contains(p);
    }

    @Override
    public Set<String> allowed(String[] permissions) {
        refresh();
        Set<String> g = new HashSet<>(granted);
        g.retainAll(Arrays.asList(permissions));
        return g;
    }

    @Override
    public boolean granted() {
        refresh();
        Set<String> g = granted;
        return g.contains(HealthBridge.HR) || g.contains(HealthBridge.ACTIVE) || g.contains(HealthBridge.TOTAL);
    }

    @Override
    public void open() {
        try {
            if (available()) {
                act.startActivity(new Intent(HealthConnectClient.getHealthConnectSettingsAction()));
                return;
            }
            Intent i = new Intent(Intent.ACTION_VIEW, Uri.parse("market://details?id=" + PROVIDER + "&url=healthconnect%3A%2F%2Fonboarding"));
            i.setPackage("com.android.vending");
            act.startActivity(i);
        } catch (Exception e) {
            try {
                act.startActivity(new Intent(Intent.ACTION_VIEW, Uri.parse("https://play.google.com/store/apps/details?id=" + PROVIDER)));
            } catch (Exception ignored) {
            }
        }
    }

    @Override
    public void request(String[] permissions, int requestCode) {
        Intent i = contract.createIntent(act, new HashSet<>(Arrays.asList(permissions)));
        act.startActivityForResult(i, requestCode);
    }

    /** The answer to request(): remembers what was allowed, checks with Health Connect, then runs done. */
    void afterRequest(int resultCode, Intent data, final Runnable done) {
        try {
            Set<String> s = contract.parseResult(resultCode, data);
            if (s != null) {
                Set<String> g = new HashSet<>(granted);
                g.addAll(s);
                granted = g;
            }
        } catch (Throwable ignored) {
        }
        exec.execute(() -> {
            refresh();
            done.run();
        });
    }

    @Override
    public void read(final long start, final long end, final HealthBridge.Done done) {
        exec.execute(() -> {
            final JSONObject out = new JSONObject();
            try {
                out.put("ok", true);
                refresh();
                final Set<String> g = granted;
                final boolean hr = g.contains(HealthBridge.HR), a = g.contains(HealthBridge.ACTIVE), t = g.contains(HealthBridge.TOTAL);
                Set<AggregateMetric<?>> metrics = new HashSet<>();
                if (hr) {
                    metrics.add(HeartRateRecord.BPM_AVG);
                    metrics.add(HeartRateRecord.BPM_MAX);
                    metrics.add(HeartRateRecord.BPM_MIN);
                }
                if (a) metrics.add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
                if (t) metrics.add(TotalCaloriesBurnedRecord.ENERGY_TOTAL);
                if (!metrics.isEmpty()) {
                    final AggregateRequest req = new AggregateRequest(metrics,
                            TimeRangeFilter.between(Instant.ofEpochMilli(start), Instant.ofEpochMilli(end)), Collections.<DataOrigin>emptySet());
                    final HealthConnectClient hc = client();
                    AggregationResult r = BuildersKt.<AggregationResult>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> hc.aggregate(req, c));
                    if (hr) {
                        put(out, "avg", r.get(HeartRateRecord.BPM_AVG));
                        put(out, "max", r.get(HeartRateRecord.BPM_MAX));
                        put(out, "min", r.get(HeartRateRecord.BPM_MIN));
                    }
                    Energy active = a ? r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) : null;
                    Energy total = t ? r.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL) : null;
                    double ak = active == null ? 0 : active.getKilocalories();
                    double tk = total == null ? 0 : total.getKilocalories();
                    if (ak >= 1) {
                        out.put("kcal", ak);
                        out.put("kind", "active");
                    } else if (tk >= 1 && out.has("avg")) {
                        // "Total" includes what the body burns at rest, so it only counts when a heart rate shows something was recording.
                        out.put("kcal", tk);
                        out.put("kind", "total");
                    }
                }
                done.result(out.toString());
            } catch (Throwable e) {
                done.result(out.has("avg") || out.has("kcal") ? out.toString() : "{\"ok\":false}");
            }
        });
    }

    @Override
    public void readWeight(final HealthBridge.Done done) {
        exec.execute(() -> {
            try {
                refresh();
                if (!granted.contains(HealthBridge.WEIGHT)) {
                    done.result("{\"ok\":false,\"need\":true}");
                    return;
                }
                final ReadRecordsRequest<WeightRecord> req = new ReadRecordsRequest<>(JvmClassMappingKt.getKotlinClass(WeightRecord.class),
                        TimeRangeFilter.between(Instant.now().minus(90, ChronoUnit.DAYS), Instant.now()), Collections.<DataOrigin>emptySet(), true, 1000, null);
                final HealthConnectClient hc = client();
                ReadRecordsResponse<WeightRecord> r = BuildersKt.<ReadRecordsResponse<WeightRecord>>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> hc.readRecords(req, c));
                JSONArray arr = new JSONArray();
                for (WeightRecord w : r.getRecords()) {
                    JSONObject o = new JSONObject();
                    o.put("t", w.getTime().toEpochMilli());
                    o.put("kg", w.getWeight().getKilograms());
                    arr.put(o);
                }
                JSONObject out = new JSONObject();
                out.put("ok", true);
                out.put("items", arr);
                done.result(out.toString());
            } catch (Throwable e) {
                done.result("{\"ok\":false}");
            }
        });
    }

    /** 1.28: the kind of a session in words (the library's own numbers). */
    static String kindOf(int t) {
        if (t == ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING || t == ExerciseSessionRecord.EXERCISE_TYPE_WEIGHTLIFTING
                || t == ExerciseSessionRecord.EXERCISE_TYPE_CALISTHENICS) return "gym";
        if (t == ExerciseSessionRecord.EXERCISE_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING) return "hiit";
        if (t == ExerciseSessionRecord.EXERCISE_TYPE_OTHER_WORKOUT) return "other";
        return "sport";
    }

    @Override
    public void readSessions(final long from, final long to, final HealthBridge.Done done) {
        exec.execute(() -> {
            try {
                refresh();
                if (!granted.contains(HealthBridge.EXER)) {
                    done.result("{\"ok\":false,\"need\":true}");
                    return;
                }
                List<Sessions.Row> rows = new ArrayList<>();
                for (ExerciseSessionRecord x : list(ExerciseSessionRecord.class, from, to, true, 200)) {
                    String t = x.getTitle();
                    String app = "";
                    try {
                        app = x.getMetadata().getDataOrigin().getPackageName();
                    } catch (Throwable ignored) {
                    }
                    rows.add(new Sessions.Row(x.getStartTime().toEpochMilli(), x.getEndTime().toEpochMilli(), kindOf(x.getExerciseType()), t == null ? "" : t, app));
                }
                done.result(Sessions.json(rows, act.getPackageName()));
            } catch (Throwable e) {
                done.result("{\"ok\":false}");
            }
        });
    }

    // ----- 1.24: one day and its night, for "automatic from your watch" (the same answers as HealthBridge.readDay) -----

    private static TimeRangeFilter range(long from, long to) {
        return TimeRangeFilter.between(Instant.ofEpochMilli(from), Instant.ofEpochMilli(Math.max(to, from + 1000)));
    }

    private <T extends Record> List<T> list(Class<T> type, long from, long to, boolean oldestFirst, int page) throws Exception {
        final ReadRecordsRequest<T> req = new ReadRecordsRequest<>(JvmClassMappingKt.getKotlinClass(type), range(from, to), Collections.<DataOrigin>emptySet(), oldestFirst, page, null);
        final HealthConnectClient hc = client();
        ReadRecordsResponse<T> r = BuildersKt.<ReadRecordsResponse<T>>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> hc.readRecords(req, c));
        return r.getRecords();
    }

    /** When the newest record of one kind in that time ends; 0 when there is none. */
    private <T extends Record> long newest(Class<T> type, long from, long to) {
        try {
            for (T x : list(type, from, to, false, 1)) {
                if (x instanceof IntervalRecord) return ((IntervalRecord) x).getEndTime().toEpochMilli();
                if (x instanceof InstantaneousRecord) return ((InstantaneousRecord) x).getTime().toEpochMilli();
            }
        } catch (Throwable ignored) {
        }
        return 0;
    }

    private AggregationResult sum(Set<AggregateMetric<?>> metrics, long from, long to) throws Exception {
        final AggregateRequest req = new AggregateRequest(metrics, range(from, to), Collections.<DataOrigin>emptySet());
        final HealthConnectClient hc = client();
        return BuildersKt.<AggregationResult>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> hc.aggregate(req, c));
    }

    @Override
    public void readDay(final long start, final long end, final long now, final HealthBridge.Done done) {
        exec.execute(() -> {
            final JSONObject out = new JSONObject();
            try {
                final long to = Math.min(end, now);
                if (start <= 0 || to - start < HealthDay.MIN) {
                    done.result("{\"ok\":false}");
                    return;
                }
                out.put("ok", true);
                refresh();
                final Set<String> g = granted;
                out.put("perm", HealthDay.perms(g));
                // today: how far the watch's numbers reach, so the calories are asked for up to there and no further
                long upto = to;
                if (now < end) {
                    long last = 0;
                    if (g.contains(HealthBridge.ACTIVE)) last = Math.max(last, newest(ActiveCaloriesBurnedRecord.class, start, to));
                    if (g.contains(HealthBridge.TOTAL)) last = Math.max(last, newest(TotalCaloriesBurnedRecord.class, start, to));
                    if (g.contains(HealthBridge.HR)) last = Math.max(last, newest(HeartRateRecord.class, start, to));
                    if (g.contains(HealthBridge.STEPS)) last = Math.max(last, newest(StepsRecord.class, start, to));
                    if (last > start) {
                        upto = Math.min(last, to);
                        out.put("upto", upto);
                    }
                }
                try {
                    Set<AggregateMetric<?>> m = new HashSet<>();
                    if (g.contains(HealthBridge.STEPS)) m.add(StepsRecord.COUNT_TOTAL);
                    if (g.contains(HealthBridge.HR)) {
                        m.add(HeartRateRecord.BPM_AVG);
                        m.add(HeartRateRecord.BPM_MAX);
                        m.add(HeartRateRecord.BPM_MIN);
                    }
                    if (g.contains(HealthBridge.REST)) m.add(RestingHeartRateRecord.BPM_AVG);
                    if (!m.isEmpty()) {
                        AggregationResult r = sum(m, start, to);
                        if (g.contains(HealthBridge.STEPS)) put(out, "steps", r.get(StepsRecord.COUNT_TOTAL));
                        if (g.contains(HealthBridge.HR)) {
                            put(out, "avg", r.get(HeartRateRecord.BPM_AVG));
                            put(out, "max", r.get(HeartRateRecord.BPM_MAX));
                            put(out, "min", r.get(HeartRateRecord.BPM_MIN));
                        }
                        if (g.contains(HealthBridge.REST)) put(out, "rest", r.get(RestingHeartRateRecord.BPM_AVG));
                    }
                } catch (Throwable ignored) {
                }
                if ((g.contains(HealthBridge.ACTIVE) || g.contains(HealthBridge.TOTAL)) && upto - start >= HealthDay.MIN) {
                    try {
                        final boolean a = g.contains(HealthBridge.ACTIVE), t = g.contains(HealthBridge.TOTAL);
                        Set<AggregateMetric<?>> m = new HashSet<>();
                        if (a) m.add(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
                        if (t) m.add(TotalCaloriesBurnedRecord.ENERGY_TOTAL);
                        AggregationResult r = sum(m, start, upto);
                        Energy active = a ? r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) : null;
                        Energy total = t ? r.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL) : null;
                        if (active != null && active.getKilocalories() >= 1) HealthDay.put1(out, "active", active.getKilocalories());
                        if (total != null && total.getKilocalories() >= 1) HealthDay.put1(out, "total", total.getKilocalories());
                    } catch (Throwable ignored) {
                    }
                }
                JSONObject night = null;
                if (g.contains(HealthBridge.SLEEP)) {
                    try {
                        List<HealthDay.Sleep> all = new ArrayList<>();
                        for (SleepSessionRecord s : list(SleepSessionRecord.class, start - HealthDay.LOOK_BACK, Math.min(end + HealthDay.LOOK_ON, now), true, 300)) {
                            String app = "";
                            try {
                                app = s.getMetadata().getDataOrigin().getPackageName();
                            } catch (Throwable ignored) {
                            }
                            HealthDay.Sleep x = new HealthDay.Sleep(s.getStartTime().toEpochMilli(), s.getEndTime().toEpochMilli(), app);
                            for (SleepSessionRecord.Stage st : s.getStages()) {
                                x.stages.add(new HealthDay.Stage(st.getStartTime().toEpochMilli(), st.getEndTime().toEpochMilli(), st.getStage()));
                            }
                            all.add(x);
                        }
                        night = HealthDay.night(all, start, to);
                        if (night != null) out.put("night", night);
                    } catch (Throwable ignored) {
                    }
                }
                final long[] w = HealthDay.window(night, start, to);
                if (g.contains(HealthBridge.HRV)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (HeartRateVariabilityRmssdRecord x : list(HeartRateVariabilityRmssdRecord.class, w[0], w[1], true, 1000)) v.add(x.getHeartRateVariabilityMillis());
                        HealthDay.put1(out, "hrv", HealthDay.mean(v, 1, 300));
                    } catch (Throwable ignored) {
                    }
                }
                if (g.contains(HealthBridge.SPO2)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (OxygenSaturationRecord x : list(OxygenSaturationRecord.class, w[0], w[1], true, 1000)) v.add(x.getPercentage().getValue());
                        HealthDay.put1(out, "spo2", HealthDay.mean(v, 50, 100));
                    } catch (Throwable ignored) {
                    }
                }
                if (g.contains(HealthBridge.BREATH)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (RespiratoryRateRecord x : list(RespiratoryRateRecord.class, w[0], w[1], true, 1000)) v.add(x.getRate());
                        HealthDay.put1(out, "br", HealthDay.mean(v, 4, 60));
                    } catch (Throwable ignored) {
                    }
                }
                done.result(out.toString());
            } catch (Throwable e) {
                done.result(out.has("ok") ? out.toString() : "{\"ok\":false}");
            }
        });
    }

    /** The workout as the library's kind of record; the same as HealthBridge.record makes on newer phones. */
    static ExerciseSessionRecord record(WorkoutEntry w) {
        return new ExerciseSessionRecord(w.start, w.startZone, w.end, w.endZone, Metadata.manualEntry(w.clientId, w.version, null),
                ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, w.title, w.notes.isEmpty() ? null : w.notes);
    }

    @Override
    public void write(final String json, final HealthBridge.Done done) {
        exec.execute(() -> {
            try {
                refresh();
                if (!granted.contains(HealthBridge.WRITE)) {
                    done.result("{\"ok\":false,\"need\":true}");
                    return;
                }
                WorkoutEntry w = WorkoutEntry.from(new JSONObject(json));
                if (w == null) {
                    done.result("{\"ok\":false,\"bad\":true}");
                    return;
                }
                final List<ExerciseSessionRecord> list = Collections.singletonList(record(w));
                final HealthConnectClient hc = client();
                BuildersKt.<InsertRecordsResponse>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, c) -> hc.insertRecords(list, c));
                done.result("{\"ok\":true}");
            } catch (Throwable e) {
                done.result("{\"ok\":false}");
            }
        });
    }

    @Override
    public void remove(final String[] ids, final HealthBridge.Done done) {
        exec.execute(() -> {
            try {
                refresh();
                if (!granted.contains(HealthBridge.WRITE)) {
                    done.result("{\"ok\":false,\"need\":true}");
                    return;
                }
                final List<String> c = new ArrayList<>();
                for (String id : ids) {
                    String x = WorkoutEntry.clientId(id);
                    if (!x.isEmpty()) c.add(x);
                }
                if (!c.isEmpty()) {
                    final HealthConnectClient hc = client();
                    BuildersKt.<Unit>runBlocking(EmptyCoroutineContext.INSTANCE, (scope, k) -> hc.deleteRecords(JvmClassMappingKt.getKotlinClass(ExerciseSessionRecord.class),
                            Collections.<String>emptyList(), c, k));
                }
                done.result("{\"ok\":true}");
            } catch (Throwable e) {
                done.result("{\"ok\":false}");
            }
        });
    }

    private static void put(JSONObject o, String k, Long v) throws Exception {
        if (v != null) o.put(k, v.longValue());
    }
}
