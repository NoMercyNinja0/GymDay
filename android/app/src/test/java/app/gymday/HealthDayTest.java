package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.app.Application;
import android.content.pm.PackageManager;
import android.webkit.JavascriptInterface;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashSet;
import java.util.List;

/**
 * 1.24, automatic from the watch: how one night is put together from what apps saved in Health Connect (HealthDay),
 * the permissions asked for, and the two new calls of the page's bridge. Health Connect itself is not on the stand-in
 * phone, so the reading is checked only up to "nothing there", and the adding-up with made-up nights.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 33, 34, 36})
public class HealthDayTest {
    static final long M = HealthDay.MIN, H = HealthDay.HOUR;
    static final long DAY = 1763145000000L;            // a day's start (a midnight somewhere); the checks do not depend on today
    static final long END = DAY + 24 * H;

    static HealthDay.Sleep sleep(String app, long start, long end, long... stages) {
        HealthDay.Sleep s = new HealthDay.Sleep(start, end, app);
        for (int i = 0; i + 2 < stages.length; i += 3) s.stages.add(new HealthDay.Stage(stages[i], stages[i + 1], (int) stages[i + 2]));
        return s;
    }

    static List<HealthDay.Sleep> of(HealthDay.Sleep... s) {
        return new ArrayList<>(Arrays.asList(s));
    }

    @Test
    public void oneNightWithStages() throws Exception {
        long bed = DAY - 1 * H, wake = DAY + 6 * H + 30 * M;       // 23:00 to 06:30
        HealthDay.Sleep s = sleep("watch.app", bed, wake,
                bed, bed + 20 * M, HealthDay.AWAKE,                 // 20 min falling asleep
                bed + 20 * M, bed + 4 * H, HealthDay.LIGHT,         // 3 h 40 light
                bed + 4 * H, bed + 5 * H + 30 * M, HealthDay.DEEP,  // 1 h 30 deep
                bed + 5 * H + 30 * M, bed + 5 * H + 40 * M, HealthDay.AWAKE_IN_BED,   // 10 min awake
                bed + 5 * H + 40 * M, bed + 7 * H, HealthDay.REM,   // 1 h 20 REM
                bed + 7 * H, wake, HealthDay.SLEEPING);             // 30 min asleep, stage not known
        JSONObject n = HealthDay.night(of(s), DAY, END);
        assertNotNull(n);
        assertEquals(bed, n.getLong("start"));
        assertEquals(wake, n.getLong("end"));
        assertEquals("asleep = light + deep + REM + plain sleep; awake is not sleep", 220 + 90 + 80 + 30, n.getLong("min"));
        assertEquals(90, n.getLong("deep"));
        assertEquals(80, n.getLong("rem"));
        assertEquals(220, n.getLong("light"));
        assertEquals(30, n.getLong("awake"));
        assertTrue(n.getBoolean("staged"));
        assertEquals("watch.app", n.getString("app"));
        assertEquals(1, n.getInt("n"));
    }

    @Test
    public void aNightWithoutStagesCountsWhole() throws Exception {
        JSONObject n = HealthDay.night(of(sleep("phone.app", DAY - 30 * M, DAY + 7 * H)), DAY, END);
        assertNotNull(n);
        assertEquals(450, n.getLong("min"));
        assertFalse(n.getBoolean("staged"));
        assertFalse("no stages, so no deep sleep is made up", n.has("deep"));
        assertFalse(n.has("awake"));
    }

    @Test
    public void aNightSavedInTwoPiecesIsOneNight() throws Exception {
        // woke at 03:00, asleep again at 03:40: the watch saved two sleeps
        JSONObject n = HealthDay.night(of(sleep("watch.app", DAY - 1 * H, DAY + 3 * H), sleep("watch.app", DAY + 3 * H + 40 * M, DAY + 7 * H)), DAY, END);
        assertNotNull(n);
        assertEquals(DAY - 1 * H, n.getLong("start"));
        assertEquals(DAY + 7 * H, n.getLong("end"));
        assertEquals("the 40 minutes awake between them are not sleep", 240 + 200, n.getLong("min"));
        assertEquals(2, n.getInt("n"));
        // more than 90 minutes apart: two different sleeps, and the longer one is the night
        JSONObject far = HealthDay.night(of(sleep("watch.app", DAY - 1 * H, DAY + 2 * H), sleep("watch.app", DAY + 4 * H, DAY + 9 * H)), DAY, END);
        assertEquals(300, far.getLong("min"));
        assertEquals(DAY + 4 * H, far.getLong("start"));
    }

    @Test
    public void twoAppsWithTheSameNightAreNeverAddedTogether() throws Exception {
        long bed = DAY - 1 * H, wake = DAY + 6 * H;
        HealthDay.Sleep watch = sleep("watch.app", bed, wake, bed, bed + 30 * M, HealthDay.AWAKE, bed + 30 * M, wake, HealthDay.LIGHT);   // 6 h 30 asleep, with stages
        HealthDay.Sleep phone = sleep("phone.app", bed - 20 * M, wake + 20 * M);                                                   // 7 h 40 in bed, no stages
        JSONObject n = HealthDay.night(of(phone, watch), DAY, END);
        assertEquals("the one with stages wins a near tie", "watch.app", n.getString("app"));
        assertEquals(390, n.getLong("min"));
        // a much longer one without stages wins: a watch that only caught a nap is not the night
        HealthDay.Sleep nap = sleep("watch.app", DAY + 13 * H, DAY + 14 * H, DAY + 13 * H, DAY + 14 * H, HealthDay.LIGHT);
        JSONObject m = HealthDay.night(of(phone, nap), DAY, END);
        assertEquals("phone.app", m.getString("app"));
        assertEquals(460, m.getLong("min"));
        // the same app saving the same hours twice counts them once
        JSONObject d = HealthDay.night(of(sleep("watch.app", bed, wake), sleep("watch.app", bed, wake), sleep("watch.app", bed + H, wake)), DAY, END);
        assertEquals(420, d.getLong("min"));
    }

    @Test
    public void aNightBelongsToTheDayItEndedIn() throws Exception {
        HealthDay.Sleep last = sleep("watch.app", DAY - 26 * H, DAY - 18 * H);          // ended the morning before
        HealthDay.Sleep tonight = sleep("watch.app", DAY + 23 * H, END + 7 * H);        // ends tomorrow morning
        assertNull("yesterday's night and tonight's are not this day's", HealthDay.night(of(last, tonight), DAY, END));
        // asleep 22:00 to 23:50, up for half an hour, asleep again 00:20 to 06:30: one night, and it is the next day's
        HealthDay.Sleep a = sleep("watch.app", DAY - 2 * H, DAY - 10 * M), b = sleep("watch.app", DAY + 20 * M, DAY + 6 * H + 30 * M);
        assertNull("its first part is not a short night of the day before", HealthDay.night(of(a, b), DAY - 24 * H, DAY));
        JSONObject n = HealthDay.night(of(a, b), DAY, END);
        assertEquals(110 + 370, n.getLong("min"));
        // today, at 05:00, a sleep that is still going on is not there yet (apps save a sleep when it ends); one that ended at 04:00 is
        assertNotNull(HealthDay.night(of(sleep("watch.app", DAY - H, DAY + 4 * H)), DAY, DAY + 5 * H));
        assertNull(HealthDay.night(of(sleep("watch.app", DAY - H, DAY + 6 * H)), DAY, DAY + 5 * H));
    }

    @Test
    public void oddSleepsAreLeftOut() throws Exception {
        assertNull("nothing saved", HealthDay.night(new ArrayList<HealthDay.Sleep>(), DAY, END));
        assertNull("20 minutes is not a night", HealthDay.night(of(sleep("a", DAY + H, DAY + H + 20 * M)), DAY, END));
        assertNull("ends before it starts", HealthDay.night(of(sleep("a", DAY + 5 * H, DAY + 2 * H)), DAY, END));
        assertNull("a 30-hour sleep is a mistake in the data", HealthDay.night(of(sleep("a", DAY - 19 * H, DAY + 11 * H)), DAY, END));
        // stages that reach outside their sleep are cut to it, and an app with no name still counts
        HealthDay.Sleep s = sleep(null, DAY, DAY + 5 * H, DAY - 2 * H, DAY + 6 * H, HealthDay.DEEP);
        JSONObject n = HealthDay.night(of(s), DAY, END);
        assertEquals(300, n.getLong("min"));
        assertEquals(300, n.getLong("deep"));
        assertEquals("", n.getString("app"));
        // a whole night marked awake has no sleep in it
        assertNull(HealthDay.night(of(sleep("a", DAY, DAY + 5 * H, DAY, DAY + 5 * H, HealthDay.AWAKE)), DAY, END));
    }

    @Test
    public void averagesAndTheNightsHours() throws Exception {
        assertEquals(60.0, HealthDay.mean(Arrays.asList(50.0, 70.0, 0.0, 900.0, Double.NaN, null), 1, 300), 0.0001);
        assertTrue(Double.isNaN(HealthDay.mean(new ArrayList<Double>(), 1, 300)));
        assertTrue(Double.isNaN(HealthDay.mean(Arrays.asList(0.0, 400.0), 1, 300)));
        JSONObject o = new JSONObject();
        HealthDay.put1(o, "a", 61.26);
        HealthDay.put1(o, "b", Double.NaN);
        assertEquals(61.3, o.getDouble("a"), 0.0001);
        assertFalse(o.has("b"));
        JSONObject night = new JSONObject().put("start", DAY - H).put("end", DAY + 6 * H);
        assertEquals(DAY - H, HealthDay.window(night, DAY, END)[0]);
        assertEquals(DAY + 6 * H, HealthDay.window(night, DAY, END)[1]);
        long[] w = HealthDay.window(null, DAY, END);
        assertEquals("with no sleep saved: from 6 pm the evening before", DAY - 6 * H, w[0]);
        assertEquals("to 11 am", DAY + 11 * H, w[1]);
        assertEquals("or to now, early in the morning", DAY + 3 * H, HealthDay.window(null, DAY, DAY + 3 * H)[1]);
    }

    @Test
    public void asksOnlyToReadAndSaysWhatIsAllowed() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        List<String> asked = Arrays.asList(c.getPackageManager().getPackageInfo(c.getPackageName(), PackageManager.GET_PERMISSIONS).requestedPermissions);
        for (String p : HealthBridge.AUTO) {
            assertTrue(p + " is in the manifest", asked.contains(p));
            assertTrue(p + " only reads", p.startsWith("android.permission.health.READ_"));
        }
        assertEquals(9, HealthBridge.AUTO.length);
        assertEquals("android.permission.health.READ_SLEEP", HealthBridge.SLEEP);
        assertEquals("android.permission.health.READ_STEPS", HealthBridge.STEPS);
        assertEquals("android.permission.health.READ_RESTING_HEART_RATE", HealthBridge.REST);
        assertEquals("android.permission.health.READ_HEART_RATE_VARIABILITY", HealthBridge.HRV);
        assertEquals("android.permission.health.READ_OXYGEN_SATURATION", HealthBridge.SPO2);
        assertEquals("android.permission.health.READ_RESPIRATORY_RATE", HealthBridge.BREATH);
        for (String p : asked) if (p.startsWith("android.permission.health.WRITE_")) assertEquals("the only thing written is a workout", HealthBridge.WRITE, p);
        JSONObject p = HealthDay.perms(new HashSet<>(Arrays.asList(HealthBridge.SLEEP, HealthBridge.STEPS)));
        assertTrue(p.getBoolean("sleep") && p.getBoolean("steps"));
        assertFalse(p.getBoolean("hrv") || p.getBoolean("hr") || p.getBoolean("total") || p.getBoolean("active") || p.getBoolean("rest") || p.getBoolean("spo2") || p.getBoolean("br"));
        assertEquals(9, HealthDay.perms(null).length());
        assertFalse(HealthDay.perms(null).getBoolean("sleep"));
        assertEquals("the stage numbers are Health Connect's own", android.health.connect.datatypes.SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_DEEP, HealthDay.DEEP);
        assertEquals(android.health.connect.datatypes.SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_REM, HealthDay.REM);
        assertEquals(android.health.connect.datatypes.SleepSessionRecord.StageType.STAGE_TYPE_SLEEPING_LIGHT, HealthDay.LIGHT);
        assertEquals(android.health.connect.datatypes.SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_IN_BED, HealthDay.AWAKE_IN_BED);
        assertEquals(android.health.connect.datatypes.SleepSessionRecord.StageType.STAGE_TYPE_AWAKE_OUT_OF_BED, HealthDay.OUT_OF_BED);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_DEEP, HealthDay.DEEP);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_REM, HealthDay.REM);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_LIGHT, HealthDay.LIGHT);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_AWAKE, HealthDay.AWAKE);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_SLEEPING, HealthDay.SLEEPING);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_OUT_OF_BED, HealthDay.OUT_OF_BED);
        assertEquals(androidx.health.connect.client.records.SleepSessionRecord.STAGE_TYPE_AWAKE_IN_BED, HealthDay.AWAKE_IN_BED);
    }

    @Test
    public void thePageCanAskForADay() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        android.webkit.WebView web = (android.webkit.WebView) ((android.view.ViewGroup) ((android.view.ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        Object bridge = org.robolectric.Shadows.shadowOf(web).getJavascriptInterface("Android");
        for (String name : new String[]{"hcDay", "hcAutoAsk", "hcStatus"}) {
            boolean found = false;
            for (java.lang.reflect.Method m : bridge.getClass().getMethods()) {
                if (m.getName().equals(name)) {
                    found = true;
                    assertNotNull(name + " can be called from the page", m.getAnnotation(JavascriptInterface.class));
                }
            }
            assertTrue(name, found);
        }
        // the stand-in phone has no Health Connect: every call answers (or does nothing) and none of them throws
        JSONObject st = new JSONObject((String) SmokeTestCalls.call(a, "hcStatus"));
        assertTrue("what may be read is always told", st.has("perm"));
        assertFalse(st.getJSONObject("perm").optBoolean("sleep", false));
        SmokeTestCalls.call(a, "hcDay", "k1", String.valueOf(DAY), String.valueOf(END));
        SmokeTestCalls.call(a, "hcDay", "k2", "not a number", "");
        SmokeTestCalls.call(a, "hcDay", "k3", String.valueOf(DAY), String.valueOf(DAY + 90L * 24 * H));     // far more than a day: refused
        SmokeTestCalls.call(a, "hcAutoAsk");
        org.robolectric.Shadows.shadowOf(android.os.Looper.getMainLooper()).idle();
    }
}
