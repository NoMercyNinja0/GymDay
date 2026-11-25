package app.gymday;

/** Where watch data comes from, and where finished workouts go when the person asks for that: Android's own Health Connect
 *  (14 and newer) or the Health Connect app through Google's library (13 and older). */
interface HealthSource {
    boolean available();

    boolean has(String permission);

    /** Which of these permissions are granted now (asks Health Connect once). */
    java.util.Set<String> allowed(String[] permissions);

    /** True when at least one of heart rate / calories may be read. */
    boolean granted();

    void open();

    /** Shows the person Health Connect's own "allow" screen for these permissions. */
    void request(String[] permissions, int requestCode);

    void read(long start, long end, HealthBridge.Done done);

    void readWeight(HealthBridge.Done done);

    /** 1.24, automatic from the watch: one day (start and end are the phone's own midnights) and the night that ended in it,
     *  as HealthDay describes. Reads only what is allowed; never writes. */
    void readDay(long start, long end, long now, HealthBridge.Done done);

    /** Puts one finished workout into Health Connect, or updates it (see WorkoutEntry). Answers {"ok":true}, {"ok":false,"need":true} when not allowed, or {"ok":false}. */
    void write(String json, HealthBridge.Done done);

    /** Takes workouts GymDay put there back out, by GymDay's own ids. Same answers as write. */
    void remove(String[] ids, HealthBridge.Done done);

    /** 1.28: workouts other apps (a watch) put there between from and to, as Sessions describes; {"ok":false,"need":true} when not allowed yet. */
    void readSessions(long from, long to, HealthBridge.Done done);
}
