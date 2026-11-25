package app.gymday;

import android.annotation.TargetApi;
import android.app.Activity;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.health.connect.AggregateRecordsRequest;
import android.health.connect.AggregateRecordsResponse;
import android.health.connect.HealthConnectException;
import android.health.connect.HealthConnectManager;
import android.health.connect.InsertRecordsResponse;
import android.health.connect.RecordIdFilter;
import android.health.connect.ReadRecordsRequestUsingFilters;
import android.health.connect.ReadRecordsResponse;
import android.health.connect.TimeInstantRangeFilter;
import android.health.connect.datatypes.ActiveCaloriesBurnedRecord;
import android.health.connect.datatypes.AggregationType;
import android.health.connect.datatypes.ExerciseSessionRecord;
import android.health.connect.datatypes.ExerciseSessionType;
import android.health.connect.datatypes.HeartRateRecord;
import android.health.connect.datatypes.HeartRateVariabilityRmssdRecord;
import android.health.connect.datatypes.InstantRecord;
import android.health.connect.datatypes.IntervalRecord;
import android.health.connect.datatypes.Metadata;
import android.health.connect.datatypes.OxygenSaturationRecord;
import android.health.connect.datatypes.Record;
import android.health.connect.datatypes.RespiratoryRateRecord;
import android.health.connect.datatypes.RestingHeartRateRecord;
import android.health.connect.datatypes.SleepSessionRecord;
import android.health.connect.datatypes.StepsRecord;
import android.health.connect.datatypes.TotalCaloriesBurnedRecord;
import android.health.connect.datatypes.WeightRecord;
import android.health.connect.datatypes.units.Energy;
import android.os.OutcomeReceiver;

import org.json.JSONArray;
import org.json.JSONObject;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.Executor;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

/**
 * Reads heart rate and calories for a stretch of time from Health Connect (the part of Android 14+ that
 * collects what watches and fitness apps record). Writes only one thing, and only when the person turns it on:
 * each finished workout as an exercise session (its name, start, end and a list of its exercises).
 * Only ever created on Android 14 or newer.
 */
@TargetApi(34)
final class HealthBridge implements HealthSource {
    static final String HR = "android.permission.health.READ_HEART_RATE";
    static final String ACTIVE = "android.permission.health.READ_ACTIVE_CALORIES_BURNED";
    static final String TOTAL = "android.permission.health.READ_TOTAL_CALORIES_BURNED";
    static final String WEIGHT = "android.permission.health.READ_WEIGHT";
    static final String WRITE = "android.permission.health.WRITE_EXERCISE";
    static final String EXER = "android.permission.health.READ_EXERCISE";      // 1.28: "forgot to log?"
    static final String[] PERMS = {HR, ACTIVE, TOTAL};
    // 1.24, automatic from the watch (read only): the day's steps, last night's sleep, and the night's heart, oxygen and breathing
    static final String STEPS = "android.permission.health.READ_STEPS";
    static final String SLEEP = "android.permission.health.READ_SLEEP";
    static final String REST = "android.permission.health.READ_RESTING_HEART_RATE";
    static final String HRV = "android.permission.health.READ_HEART_RATE_VARIABILITY";
    static final String SPO2 = "android.permission.health.READ_OXYGEN_SATURATION";
    static final String BREATH = "android.permission.health.READ_RESPIRATORY_RATE";
    static final String[] AUTO = {HR, ACTIVE, TOTAL, STEPS, SLEEP, REST, HRV, SPO2, BREATH};

    interface Done {
        void result(String json);
    }

    private final Activity act;
    private final HealthConnectManager hc;
    private final Executor exec = Executors.newSingleThreadExecutor();
    /** readDay asks one thing after another and waits for each answer, so it has a thread of its own (the answers arrive on exec). */
    private final Executor work = Executors.newSingleThreadExecutor();

    HealthBridge(Activity a) {
        act = a;
        hc = a.getSystemService(HealthConnectManager.class);
    }

    @Override
    public boolean available() {
        return hc != null;
    }

    @Override
    public boolean has(String p) {
        return act.checkSelfPermission(p) == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public Set<String> allowed(String[] permissions) {
        Set<String> g = new HashSet<>();
        for (String p : permissions) if (has(p)) g.add(p);
        return g;
    }

    /** Enough to be useful: heart rate, or calories. */
    @Override
    public boolean granted() {
        return has(HR) || has(ACTIVE);
    }

    @Override
    public void request(String[] permissions, int requestCode) {
        act.requestPermissions(permissions, requestCode);
    }

    @Override
    public void open() {
        try {
            Intent i = new Intent(HealthConnectManager.ACTION_MANAGE_HEALTH_PERMISSIONS);
            i.putExtra(Intent.EXTRA_PACKAGE_NAME, act.getPackageName());
            act.startActivity(i);
        } catch (Exception e) {
            try {
                act.startActivity(new Intent("android.health.connect.action.HEALTH_HOME_SETTINGS"));
            } catch (Exception ignored) {
            }
        }
    }

    /** Answers {"ok":true, "avg","max","min" (beats a minute), "kcal", "kind":"active"|"total"}; a number is left out when nothing was recorded. */
    @Override
    public void read(long start, long end, final Done done) {
        final JSONObject out = new JSONObject();
        try {
            out.put("ok", true);
            final TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                    .setStartTime(Instant.ofEpochMilli(start)).setEndTime(Instant.ofEpochMilli(end)).build();
            readHeart(range, out, () -> readEnergy(range, out, () -> done.result(out.toString())));
        } catch (Exception e) {
            done.result("{\"ok\":false}");
        }
    }

    private void readHeart(TimeInstantRangeFilter range, final JSONObject out, final Runnable next) {
        if (!has(HR)) {
            next.run();
            return;
        }
        try {
            AggregateRecordsRequest<Long> req = new AggregateRecordsRequest.Builder<Long>(range)
                    .addAggregationType(HeartRateRecord.BPM_AVG)
                    .addAggregationType(HeartRateRecord.BPM_MAX)
                    .addAggregationType(HeartRateRecord.BPM_MIN)
                    .build();
            hc.aggregate(req, exec, new OutcomeReceiver<AggregateRecordsResponse<Long>, HealthConnectException>() {
                @Override
                public void onResult(AggregateRecordsResponse<Long> r) {
                    try {
                        put(out, "avg", r.get(HeartRateRecord.BPM_AVG));
                        put(out, "max", r.get(HeartRateRecord.BPM_MAX));
                        put(out, "min", r.get(HeartRateRecord.BPM_MIN));
                    } catch (Exception ignored) {
                    }
                    next.run();
                }

                @Override
                public void onError(HealthConnectException e) {
                    next.run();
                }
            });
        } catch (Exception e) {
            next.run();
        }
    }

    private void readEnergy(TimeInstantRangeFilter range, final JSONObject out, final Runnable next) {
        final boolean a = has(ACTIVE), t = has(TOTAL);
        if (!a && !t) {
            next.run();
            return;
        }
        try {
            AggregateRecordsRequest.Builder<Energy> b = new AggregateRecordsRequest.Builder<Energy>(range);
            if (a) b.addAggregationType(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
            if (t) b.addAggregationType(TotalCaloriesBurnedRecord.ENERGY_TOTAL);
            hc.aggregate(b.build(), exec, new OutcomeReceiver<AggregateRecordsResponse<Energy>, HealthConnectException>() {
                @Override
                public void onResult(AggregateRecordsResponse<Energy> r) {
                    try {
                        Energy active = a ? r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) : null;
                        Energy total = t ? r.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL) : null;
                        // Health Connect counts in small calories; people read kilocalories.
                        double ak = active == null ? 0 : active.getInCalories() / 1000.0;
                        double tk = total == null ? 0 : total.getInCalories() / 1000.0;
                        if (ak >= 1) {
                            out.put("kcal", ak);
                            out.put("kind", "active");
                        } else if (tk >= 1 && out.has("avg")) {
                            // "Total" includes what the body burns at rest, which Android can estimate with no watch at all,
                            // so it is only used when a heart rate shows something was really recording.
                            out.put("kcal", tk);
                            out.put("kind", "total");
                        }
                    } catch (Exception ignored) {
                    }
                    next.run();
                }

                @Override
                public void onError(HealthConnectException e) {
                    next.run();
                }
            });
        } catch (Exception e) {
            next.run();
        }
    }

    /** Body-weight readings of the last 90 days: {"ok":true,"items":[{"t":ms,"kg":70.4}]}; {"ok":false,"need":true} when not allowed yet. */
    @Override
    public void readWeight(final Done done) {
        try {
            if (!has(WEIGHT)) {
                done.result("{\"ok\":false,\"need\":true}");
                return;
            }
            TimeInstantRangeFilter range = new TimeInstantRangeFilter.Builder()
                    .setStartTime(Instant.now().minus(90, ChronoUnit.DAYS)).setEndTime(Instant.now()).build();
            ReadRecordsRequestUsingFilters<WeightRecord> req = new ReadRecordsRequestUsingFilters.Builder<>(WeightRecord.class)
                    .setTimeRangeFilter(range).build();
            hc.readRecords(req, exec, new OutcomeReceiver<ReadRecordsResponse<WeightRecord>, HealthConnectException>() {
                @Override
                public void onResult(ReadRecordsResponse<WeightRecord> r) {
                    try {
                        JSONArray a = new JSONArray();
                        for (WeightRecord w : r.getRecords()) {
                            JSONObject o = new JSONObject();
                            o.put("t", w.getTime().toEpochMilli());
                            o.put("kg", w.getWeight().getInGrams() / 1000.0);
                            a.put(o);
                        }
                        JSONObject out = new JSONObject();
                        out.put("ok", true);
                        out.put("items", a);
                        done.result(out.toString());
                    } catch (Exception e) {
                        done.result("{\"ok\":false}");
                    }
                }

                @Override
                public void onError(HealthConnectException e) {
                    done.result("{\"ok\":false}");
                }
            });
        } catch (Exception e) {
            done.result("{\"ok\":false}");
        }
    }

    /** 1.28: the kind of a session in words (Android's own numbers). */
    static String kindOf(int t) {
        if (t == ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING || t == ExerciseSessionType.EXERCISE_SESSION_TYPE_WEIGHTLIFTING
                || t == ExerciseSessionType.EXERCISE_SESSION_TYPE_CALISTHENICS) return "gym";
        if (t == ExerciseSessionType.EXERCISE_SESSION_TYPE_HIGH_INTENSITY_INTERVAL_TRAINING) return "hiit";
        if (t == ExerciseSessionType.EXERCISE_SESSION_TYPE_OTHER_WORKOUT || t == ExerciseSessionType.EXERCISE_SESSION_TYPE_UNKNOWN) return "other";
        return "sport";
    }

    @Override
    public void readSessions(final long from, final long to, final Done done) {
        work.execute(() -> {
            try {
                if (!has(EXER)) {
                    done.result("{\"ok\":false,\"need\":true}");
                    return;
                }
                List<Sessions.Row> rows = new ArrayList<>();
                for (ExerciseSessionRecord x : list(ExerciseSessionRecord.class, from, to, 200)) {
                    CharSequence t = x.getTitle();
                    rows.add(new Sessions.Row(x.getStartTime().toEpochMilli(), x.getEndTime().toEpochMilli(), kindOf(x.getExerciseType()), t == null ? "" : t.toString(), origin(x)));
                }
                done.result(Sessions.json(rows, act.getPackageName()));
            } catch (Throwable e) {
                done.result("{\"ok\":false}");
            }
        });
    }

    // ----- 1.24: one day and its night, for "automatic from your watch" -----

    private interface Call<T> {
        void run(OutcomeReceiver<T, HealthConnectException> cb);
    }

    /** Asks Health Connect one thing and waits for the answer (never on the main thread, never on exec). */
    private static <T> T await(Call<T> call) throws Exception {
        final CompletableFuture<T> f = new CompletableFuture<>();
        call.run(new OutcomeReceiver<T, HealthConnectException>() {
            @Override
            public void onResult(T r) {
                f.complete(r);
            }

            @Override
            public void onError(HealthConnectException e) {
                f.completeExceptionally(e);
            }
        });
        return f.get(12, TimeUnit.SECONDS);
    }

    private static TimeInstantRangeFilter range(long from, long to) {
        return new TimeInstantRangeFilter.Builder().setStartTime(Instant.ofEpochMilli(from)).setEndTime(Instant.ofEpochMilli(Math.max(to, from + 1000))).build();
    }

    private <T extends Record> List<T> list(Class<T> type, long from, long to, int page) throws Exception {
        final ReadRecordsRequestUsingFilters<T> req = new ReadRecordsRequestUsingFilters.Builder<>(type).setTimeRangeFilter(range(from, to)).setPageSize(page).build();
        ReadRecordsResponse<T> r = HealthBridge.<ReadRecordsResponse<T>>await(cb -> hc.readRecords(req, exec, cb));
        return r.getRecords();
    }

    /** When the newest record of one kind in that time ends; 0 when there is none. */
    private <T extends Record> long newest(Class<T> type, long from, long to) {
        try {
            final ReadRecordsRequestUsingFilters<T> req = new ReadRecordsRequestUsingFilters.Builder<>(type).setTimeRangeFilter(range(from, to)).setAscending(false).setPageSize(1).build();
            ReadRecordsResponse<T> r = HealthBridge.<ReadRecordsResponse<T>>await(cb -> hc.readRecords(req, exec, cb));
            for (T x : r.getRecords()) {
                if (x instanceof IntervalRecord) return ((IntervalRecord) x).getEndTime().toEpochMilli();
                if (x instanceof InstantRecord) return ((InstantRecord) x).getTime().toEpochMilli();
            }
        } catch (Throwable ignored) {
        }
        return 0;
    }

    private Long whole(AggregationType<Long> type, long from, long to) {
        try {
            final AggregateRecordsRequest<Long> req = new AggregateRecordsRequest.Builder<Long>(range(from, to)).addAggregationType(type).build();
            AggregateRecordsResponse<Long> r = HealthBridge.<AggregateRecordsResponse<Long>>await(cb -> hc.aggregate(req, exec, cb));
            return r.get(type);
        } catch (Throwable e) {
            return null;
        }
    }

    private static String origin(Record r) {
        try {
            return r.getMetadata().getDataOrigin().getPackageName();
        } catch (Throwable e) {
            return "";
        }
    }

    @Override
    public void readDay(final long start, final long end, final long now, final Done done) {
        work.execute(() -> {
            final JSONObject out = new JSONObject();
            try {
                final long to = Math.min(end, now);
                if (start <= 0 || to - start < HealthDay.MIN) {
                    done.result("{\"ok\":false}");
                    return;
                }
                out.put("ok", true);
                final Set<String> g = allowed(AUTO);
                out.put("perm", HealthDay.perms(g));
                // today: how far the watch's numbers reach, so the calories are asked for up to there and no further
                long upto = to;
                if (now < end) {
                    long last = 0;
                    if (g.contains(ACTIVE)) last = Math.max(last, newest(ActiveCaloriesBurnedRecord.class, start, to));
                    if (g.contains(TOTAL)) last = Math.max(last, newest(TotalCaloriesBurnedRecord.class, start, to));
                    if (g.contains(HR)) last = Math.max(last, newest(HeartRateRecord.class, start, to));
                    if (g.contains(STEPS)) last = Math.max(last, newest(StepsRecord.class, start, to));
                    if (last > start) {
                        upto = Math.min(last, to);
                        out.put("upto", upto);
                    }
                }
                if (g.contains(STEPS)) put(out, "steps", whole(StepsRecord.STEPS_COUNT_TOTAL, start, to));
                if (g.contains(HR)) {
                    put(out, "avg", whole(HeartRateRecord.BPM_AVG, start, to));
                    put(out, "max", whole(HeartRateRecord.BPM_MAX, start, to));
                    put(out, "min", whole(HeartRateRecord.BPM_MIN, start, to));
                }
                if (g.contains(REST)) put(out, "rest", whole(RestingHeartRateRecord.BPM_AVG, start, to));
                if ((g.contains(ACTIVE) || g.contains(TOTAL)) && upto - start >= HealthDay.MIN) {
                    try {
                        final boolean a = g.contains(ACTIVE), t = g.contains(TOTAL);
                        AggregateRecordsRequest.Builder<Energy> b = new AggregateRecordsRequest.Builder<Energy>(range(start, upto));
                        if (a) b.addAggregationType(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL);
                        if (t) b.addAggregationType(TotalCaloriesBurnedRecord.ENERGY_TOTAL);
                        final AggregateRecordsRequest<Energy> req = b.build();
                        AggregateRecordsResponse<Energy> r = HealthBridge.<AggregateRecordsResponse<Energy>>await(cb -> hc.aggregate(req, exec, cb));
                        Energy active = a ? r.get(ActiveCaloriesBurnedRecord.ACTIVE_CALORIES_TOTAL) : null;
                        Energy total = t ? r.get(TotalCaloriesBurnedRecord.ENERGY_TOTAL) : null;
                        // Health Connect counts in small calories; people read kilocalories.
                        if (active != null && active.getInCalories() >= 1000) HealthDay.put1(out, "active", active.getInCalories() / 1000.0);
                        if (total != null && total.getInCalories() >= 1000) HealthDay.put1(out, "total", total.getInCalories() / 1000.0);
                    } catch (Throwable ignored) {
                    }
                }
                JSONObject night = null;
                if (g.contains(SLEEP)) {
                    try {
                        List<HealthDay.Sleep> all = new ArrayList<>();
                        for (SleepSessionRecord s : list(SleepSessionRecord.class, start - HealthDay.LOOK_BACK, Math.min(end + HealthDay.LOOK_ON, now), 300)) {
                            HealthDay.Sleep x = new HealthDay.Sleep(s.getStartTime().toEpochMilli(), s.getEndTime().toEpochMilli(), origin(s));
                            for (SleepSessionRecord.Stage st : s.getStages()) {
                                x.stages.add(new HealthDay.Stage(st.getStartTime().toEpochMilli(), st.getEndTime().toEpochMilli(), st.getType()));
                            }
                            all.add(x);
                        }
                        night = HealthDay.night(all, start, to);
                        if (night != null) out.put("night", night);
                    } catch (Throwable ignored) {
                    }
                }
                final long[] w = HealthDay.window(night, start, to);
                if (g.contains(HRV)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (HeartRateVariabilityRmssdRecord x : list(HeartRateVariabilityRmssdRecord.class, w[0], w[1], 1000)) v.add(x.getHeartRateVariabilityMillis());
                        HealthDay.put1(out, "hrv", HealthDay.mean(v, 1, 300));
                    } catch (Throwable ignored) {
                    }
                }
                if (g.contains(SPO2)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (OxygenSaturationRecord x : list(OxygenSaturationRecord.class, w[0], w[1], 1000)) v.add(x.getPercentage().getValue());
                        HealthDay.put1(out, "spo2", HealthDay.mean(v, 50, 100));
                    } catch (Throwable ignored) {
                    }
                }
                if (g.contains(BREATH)) {
                    try {
                        List<Double> v = new ArrayList<>();
                        for (RespiratoryRateRecord x : list(RespiratoryRateRecord.class, w[0], w[1], 1000)) v.add(x.getRate());
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

    /** The workout as Health Connect's own kind of record: a strength-training session, typed in by the person. */
    static ExerciseSessionRecord record(WorkoutEntry w) {
        Metadata md = new Metadata.Builder().setClientRecordId(w.clientId).setClientRecordVersion(w.version)
                .setRecordingMethod(Metadata.RECORDING_METHOD_MANUAL_ENTRY).build();
        ExerciseSessionRecord.Builder b = new ExerciseSessionRecord.Builder(md, w.start, w.end, ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING)
                .setStartZoneOffset(w.startZone).setEndZoneOffset(w.endZone).setTitle(w.title);
        if (!w.notes.isEmpty()) b.setNotes(w.notes);
        return b.build();
    }

    private static String failed(HealthConnectException e) {
        return "{\"ok\":false,\"code\":" + e.getErrorCode() + "}";
    }

    @Override
    public void write(String json, final Done done) {
        try {
            if (!has(WRITE)) {
                done.result("{\"ok\":false,\"need\":true}");
                return;
            }
            WorkoutEntry w = WorkoutEntry.from(new JSONObject(json));
            if (w == null) {
                done.result("{\"ok\":false,\"bad\":true}");
                return;
            }
            List<Record> list = new ArrayList<>();
            list.add(record(w));
            hc.insertRecords(list, exec, new OutcomeReceiver<InsertRecordsResponse, HealthConnectException>() {
                @Override
                public void onResult(InsertRecordsResponse r) {
                    done.result("{\"ok\":true}");
                }

                @Override
                public void onError(HealthConnectException e) {
                    done.result(failed(e));
                }
            });
        } catch (Exception e) {
            done.result("{\"ok\":false}");
        }
    }

    @Override
    public void remove(String[] ids, final Done done) {
        try {
            if (!has(WRITE)) {
                done.result("{\"ok\":false,\"need\":true}");
                return;
            }
            List<RecordIdFilter> f = new ArrayList<>();
            for (String id : ids) {
                String c = WorkoutEntry.clientId(id);
                if (!c.isEmpty()) f.add(RecordIdFilter.fromClientRecordId(ExerciseSessionRecord.class, c));
            }
            if (f.isEmpty()) {
                done.result("{\"ok\":true}");
                return;
            }
            hc.deleteRecords(f, exec, new OutcomeReceiver<Void, HealthConnectException>() {
                @Override
                public void onResult(Void r) {
                    done.result("{\"ok\":true}");
                }

                @Override
                public void onError(HealthConnectException e) {
                    done.result(failed(e));
                }
            });
        } catch (Exception e) {
            done.result("{\"ok\":false}");
        }
    }

    private static void put(JSONObject o, String k, Long v) throws Exception {
        if (v != null) o.put(k, v.longValue());
    }
}
