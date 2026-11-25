package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.Intent;
import android.content.res.XmlResourceParser;
import android.content.pm.ActivityInfo;
import android.content.pm.PackageManager;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.List;

/**
 * 88: a finished workout written to Health Connect (the record GymDay builds, on both paths), and
 * 89: the long-press shortcuts on the app icon (what they hold, and that the app hands them to the page).
 * Health Connect itself is not on the stand-in phone, so only the records are checked, not the writing.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 33, 34, 36})
public class HealthWriteTest {
    static final long T = 1763190000000L;     // a fixed moment, so the checks do not depend on today

    static JSONObject w(String id, long start, long end) throws Exception {
        return new JSONObject().put("id", id).put("start", start).put("end", end).put("title", "  Push day ")
                .put("notes", "2 exercises, 6 sets: Bench press (3), Dips (3). Logged with GymDay.").put("v", 5);
    }

    @Test
    public void workoutEntryIsCheckedAndTrimmed() throws Exception {
        WorkoutEntry e = WorkoutEntry.from(w("s1", T, T + 3600000));
        assertNotNull(e);
        assertEquals("gymday-s1", e.clientId);
        assertEquals("Push day", e.title);
        assertEquals(5, e.version);
        assertEquals(3600000, e.end.toEpochMilli() - e.start.toEpochMilli());
        assertNull("no time between start and end", WorkoutEntry.from(w("s1", T, T + 30000)));
        assertNull("end before start", WorkoutEntry.from(w("s1", T, T - 60000)));
        assertNull("no id", WorkoutEntry.from(w("", T, T + 3600000)));
        assertNull("an id with nothing usable", WorkoutEntry.from(w("'); ", T, T + 3600000)));
        assertEquals("gymday-abc", WorkoutEntry.clientId("a'b\"c"));
        WorkoutEntry long1 = WorkoutEntry.from(w("s2", T, T + 30L * 3600000));
        assertEquals("never longer than a day", WorkoutEntry.MAX_MS, long1.end.toEpochMilli() - long1.start.toEpochMilli());
        JSONObject noTitle = w("s3", T, T + 3600000).put("title", " ").put("v", 0);
        WorkoutEntry e3 = WorkoutEntry.from(noTitle);
        assertEquals("Workout", e3.title);
        assertEquals("a version is at least 1", 1, e3.version);
        StringBuilder big = new StringBuilder();
        for (int i = 0; i < 300; i++) big.append("Bench press (3), ");
        WorkoutEntry e4 = WorkoutEntry.from(w("s4", T, T + 3600000).put("notes", big.toString()));
        assertTrue(e4.notes.length() <= 1000 && e4.notes.endsWith("…"));
    }

    @Test
    @Config(sdk = {34, 36})
    public void recordOnAndroid14AndNewer() throws Exception {
        android.health.connect.datatypes.ExerciseSessionRecord r = HealthBridge.record(WorkoutEntry.from(w("s1", T, T + 3600000)));
        assertEquals(android.health.connect.datatypes.ExerciseSessionType.EXERCISE_SESSION_TYPE_STRENGTH_TRAINING, r.getExerciseType());
        assertEquals("Push day", String.valueOf(r.getTitle()));
        assertTrue(String.valueOf(r.getNotes()).startsWith("2 exercises, 6 sets"));
        assertEquals("gymday-s1", r.getMetadata().getClientRecordId());
        assertEquals(5, r.getMetadata().getClientRecordVersion());
        assertEquals(android.health.connect.datatypes.Metadata.RECORDING_METHOD_MANUAL_ENTRY, r.getMetadata().getRecordingMethod());
        assertEquals(T, r.getStartTime().toEpochMilli());
        assertEquals(T + 3600000, r.getEndTime().toEpochMilli());
        android.health.connect.datatypes.ExerciseSessionRecord n = HealthBridge.record(WorkoutEntry.from(w("s1", T, T + 3600000).put("notes", "")));
        assertNull("no notes when there are none", n.getNotes());
    }

    @Test
    public void recordOnOlderPhonesThroughTheLibrary() throws Exception {
        androidx.health.connect.client.records.ExerciseSessionRecord r = HealthCompat.record(WorkoutEntry.from(w("s1", T, T + 3600000)));
        assertEquals(androidx.health.connect.client.records.ExerciseSessionRecord.EXERCISE_TYPE_STRENGTH_TRAINING, r.getExerciseType());
        assertEquals("Push day", r.getTitle());
        assertEquals("gymday-s1", r.getMetadata().getClientRecordId());
        assertEquals(5, r.getMetadata().getClientRecordVersion());
        assertEquals(androidx.health.connect.client.records.metadata.Metadata.RECORDING_METHOD_MANUAL_ENTRY, r.getMetadata().getRecordingMethod());
        assertEquals(T, r.getStartTime().toEpochMilli());
        assertNull(HealthCompat.record(WorkoutEntry.from(w("s1", T, T + 3600000).put("notes", ""))).getNotes());
    }

    @Test
    public void writingAsksForItsOwnPermission() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        String[] asked = c.getPackageManager().getPackageInfo(c.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions;
        List<String> l = new ArrayList<>();
        for (String p : asked) l.add(p);
        assertTrue(l.contains(HealthBridge.WRITE));
        assertTrue(l.contains(HealthBridge.HR));
        assertEquals("android.permission.health.WRITE_EXERCISE", HealthBridge.WRITE);
    }

    // ---------------------------------------------------------------- 89: shortcuts on the app icon

    static final class Sc {
        String id, action, extraName, extraValue, target;
    }

    static List<Sc> shortcuts(Application c) throws Exception {
        List<Sc> out = new ArrayList<>();
        XmlResourceParser p = c.getResources().getXml(R.xml.shortcuts);
        Sc cur = null;
        for (int ev = p.next(); ev != XmlResourceParser.END_DOCUMENT; ev = p.next()) {
            if (ev != XmlResourceParser.START_TAG) continue;
            String ns = "http://schemas.android.com/apk/res/android";
            if ("shortcut".equals(p.getName())) {
                cur = new Sc();
                cur.id = p.getAttributeValue(ns, "shortcutId");
                out.add(cur);
            } else if ("intent".equals(p.getName()) && cur != null) {
                cur.action = p.getAttributeValue(ns, "action");
                cur.target = p.getAttributeValue(ns, "targetClass");
                assertEquals("app.gymday", p.getAttributeValue(ns, "targetPackage"));
            } else if ("extra".equals(p.getName()) && cur != null) {
                cur.extraName = p.getAttributeValue(ns, "name");
                cur.extraValue = p.getAttributeValue(ns, "value");
            }
        }
        return out;
    }

    @Test
    public void threeShortcutsOnTheAppIcon() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        List<Sc> l = shortcuts(c);
        assertEquals(3, l.size());
        assertEquals("start", l.get(0).id);
        assertEquals(MainActivity.ACTION_START, l.get(0).action);
        assertEquals("day", l.get(0).extraName);
        assertEquals("today", l.get(0).extraValue);
        assertEquals("weight", l.get(1).id);
        assertEquals(MainActivity.ACTION_GO, l.get(1).action);
        assertEquals("weight", l.get(1).extraValue);
        assertEquals("food", l.get(2).extraValue);
        for (Sc s : l) assertEquals("app.gymday.MainActivity", s.target);
        ActivityInfo ai = c.getPackageManager().getActivityInfo(new android.content.ComponentName(c, MainActivity.class), PackageManager.GET_META_DATA);
        assertEquals(R.xml.shortcuts, ai.metaData.getInt("android.app.shortcuts"));
        assertEquals("Start today's workout", c.getString(R.string.sc_start_long));
        assertNotNull(c.getDrawable(R.drawable.sc_start));
        assertNotNull(c.getDrawable(R.drawable.sc_weight));
        assertNotNull(c.getDrawable(R.drawable.sc_food));
    }

    @Test
    public void shortcutsReachThePage() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        Intent today = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START).putExtra("day", "today");
        MainActivity a = Robolectric.buildActivity(MainActivity.class, today).create().get();
        assertEquals("today", SmokeTestCalls.call(a, "pendingStart"));
        Intent weight = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "weight");
        MainActivity b = Robolectric.buildActivity(MainActivity.class, weight).create().get();
        assertEquals("weight", SmokeTestCalls.call(b, "pendingGo"));
        assertEquals("only once", "", SmokeTestCalls.call(b, "pendingGo"));
        Intent food = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "food");
        assertEquals("food", SmokeTestCalls.call(Robolectric.buildActivity(MainActivity.class, food).create().get(), "pendingGo"));
        Intent odd = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "');alert(1);('");
        assertEquals("anything else is ignored", "", SmokeTestCalls.call(Robolectric.buildActivity(MainActivity.class, odd).create().get(), "pendingGo"));
        Intent old = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "food").addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY);
        assertEquals("reopened from the recent-apps list", "", SmokeTestCalls.call(Robolectric.buildActivity(MainActivity.class, old).create().get(), "pendingGo"));
        // a second shortcut while the app is open
        org.robolectric.android.controller.ActivityController<MainActivity> dc = Robolectric.buildActivity(MainActivity.class).create().start().resume();
        dc.newIntent(new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "weight"));
        assertEquals("weight", SmokeTestCalls.call(dc.get(), "pendingGo"));
    }
}
