package app.gymday;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.AlarmManager;
import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowAlarmManager;

import java.util.Calendar;

/**
 * v1.25: the morning brief (what it says on a morning the app was or was not opened, when it is due, that it shows and is set
 * again) and the Today widget (readiness, calories left, the next workout; never an earlier day's numbers).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class V125NativeTest {

    private static long at(int y, int mo, int d, int h, int mi) {
        Calendar t = Calendar.getInstance();
        t.set(y, mo - 1, d, h, mi, 0);
        t.set(Calendar.MILLISECOND, 0);
        return t.getTimeInMillis();
    }

    private static final long NOW = at(2026, 11, 20, 6, 30);          // a Friday morning
    private static final String PLAN = "\"plan\":{\"2026-11-20\":{\"w\":\"Push day\",\"kt\":2960},\"2026-11-21\":{\"w\":\"\",\"kt\":2960},\"2026-11-22\":{\"w\":\"\",\"kt\":2800},\"2026-11-23\":{\"w\":\"Legs\",\"kt\":2960}}";

    private static JSONObject j(String s) throws Exception {
        return new JSONObject(s);
    }

    @Test
    public void theBriefSaysWhatIsKnownThisMorning() throws Exception {
        // the app was opened this morning: readiness is known
        JSONObject d = j("{\"day\":\"2026-11-20\",\"ready\":78.4,\"rword\":\"Good to train\",\"kcal\":0,\"kt\":2960,\"next\":\"Push day\",\"when\":\"Today\"," + PLAN + ",\"bOn\":true,\"bMin\":420}");
        assertArrayEquals(new String[]{"Today: Push day", "Readiness 78 · Good to train · Target 2,960 kcal"}, Brief.lines(d, NOW));
        // written yesterday: the plan for today is known, readiness is not (it needs last night's sleep)
        d = j("{\"day\":\"2026-11-19\",\"ready\":91,\"rword\":\"Fresh\",\"kcal\":2500,\"kt\":2960," + PLAN + ",\"bOn\":true,\"bMin\":420}");
        assertArrayEquals(new String[]{"Today: Push day", "Target 2,960 kcal · Tap for today's readiness"}, Brief.lines(d, NOW));
        // a rest day, and a day with no calorie target
        assertArrayEquals(new String[]{"Rest day today", "Target 2,960 kcal · Tap for today's readiness"}, Brief.lines(d, NOW + Brief.DAY));
        d = j("{\"day\":\"2026-11-20\",\"plan\":{\"2026-11-20\":{\"w\":\"Pull day\",\"kt\":0}},\"bOn\":true}");
        assertArrayEquals(new String[]{"Today: Pull day", "Tap for today's readiness"}, Brief.lines(d, NOW));
        d = j("{\"day\":\"2026-11-20\",\"ready\":55,\"plan\":{\"2026-11-20\":{\"w\":\"Pull day\",\"kt\":0}},\"bOn\":true}");
        assertArrayEquals(new String[]{"Today: Pull day", "Readiness 55"}, Brief.lines(d, NOW));
        // the app has not been opened for longer than the plan reaches, or never
        d = j("{\"day\":\"2026-11-01\",\"ready\":91," + PLAN.replace("2026-11-2", "2026-11-0") + ",\"bOn\":true}");
        assertArrayEquals(new String[]{"Good morning", "Tap for today's plan and readiness"}, Brief.lines(d, NOW));
        assertArrayEquals(new String[]{"Good morning", "Tap for today's plan and readiness"}, Brief.lines(new JSONObject(), NOW));
        // no weekly plan: no day is a gym day or a rest day, so the brief names what comes next
        d = j("{\"day\":\"2026-11-19\",\"next\":\"Legs\",\"plan\":{\"2026-11-20\":{\"w\":\"\",\"kt\":2400,\"up\":\"Legs\"},\"2026-11-21\":{\"w\":\"\",\"kt\":2400,\"up\":\"Legs\"}},\"bOn\":true}");
        assertArrayEquals(new String[]{"Next up: Legs", "Target 2,400 kcal · Tap for today's readiness"}, Brief.lines(d, NOW));
        assertEquals("Next: Legs", Brief.nextLine(d, NOW));
        d = j("{\"day\":\"2026-11-20\",\"next\":\"Legs\",\"when\":\"\",\"done\":false,\"plan\":{\"2026-11-20\":{\"w\":\"\",\"kt\":2400,\"up\":\"Legs\"}}}");
        assertEquals("Next: Legs", Brief.nextLine(d, NOW));
    }

    @Test
    public void caloriesAndTheNextWorkoutAreForToday() throws Exception {
        JSONObject d = j("{\"day\":\"2026-11-20\",\"kcal\":1820,\"kt\":2960,\"done\":false,\"next\":\"Push day\",\"when\":\"Today\"," + PLAN + "}");
        assertEquals("1,140 kcal left", Brief.kcalLine(d, "2026-11-20"));
        assertEquals("Next: Push day · today", Brief.nextLine(d, NOW));
        d.put("kcal", 3080);
        assertEquals("120 kcal over", Brief.kcalLine(d, "2026-11-20"));
        d.put("kt", 0);
        assertEquals("3,080 kcal eaten", Brief.kcalLine(d, "2026-11-20"));
        d.put("kcal", 0);
        assertEquals("", Brief.kcalLine(d, "2026-11-20"));
        d.put("done", true).put("next", "Legs").put("when", "Monday");
        assertEquals("Done today ✓ · next: Legs monday", Brief.nextLine(d, NOW));
        d.put("next", "");
        assertEquals("Done today ✓", Brief.nextLine(d, NOW));
        d.put("done", false);
        assertEquals("Rest day", Brief.nextLine(d, NOW));
        // an earlier day's data: what was eaten then is not today's; the plan says what today's target and workout are
        d = j("{\"day\":\"2026-11-19\",\"kcal\":2500,\"kt\":2700,\"done\":true,\"next\":\"Push day\",\"when\":\"Tomorrow\"," + PLAN + "}");
        assertEquals("2,960 kcal left", Brief.kcalLine(d, "2026-11-20"));
        assertEquals("Next: Push day · today", Brief.nextLine(d, NOW));
        assertEquals("Next: Legs · Monday", Brief.nextLine(d, NOW + Brief.DAY));
        assertEquals("Next: Legs · tomorrow", Brief.nextLine(d, NOW + 2 * Brief.DAY));
        assertEquals("2,800 kcal left", Brief.kcalLine(d, "2026-11-22"));
        assertEquals("nothing is known that far ahead", "", Brief.nextLine(d, NOW + 9 * Brief.DAY));
        assertEquals("", Brief.kcalLine(d, "2026-11-29"));
        assertNull(Brief.ready(d, "2026-11-20"));
        assertEquals("", Brief.nextLine(new JSONObject(), NOW));
    }

    @Test
    public void theBriefIsDueAtItsTimeEachDay() throws Exception {
        assertEquals(0, Brief.due(j("{\"bOn\":false,\"bMin\":420}"), NOW));
        assertEquals(0, Brief.due(new JSONObject(), NOW));
        assertEquals(at(2026, 11, 20, 7, 0), Brief.due(j("{\"bOn\":true,\"bMin\":420}"), NOW));
        assertEquals("already past today: tomorrow", at(2026, 11, 21, 6, 0), Brief.due(j("{\"bOn\":true,\"bMin\":360}"), NOW));
        assertEquals("the very minute counts as past", at(2026, 11, 21, 6, 30), Brief.due(j("{\"bOn\":true,\"bMin\":390}"), NOW));
        assertEquals("no time given: seven o'clock", at(2026, 11, 20, 7, 0), Brief.due(j("{\"bOn\":true}"), NOW));
        assertEquals("a time out of range is held inside the day", at(2026, 11, 20, 23, 59), Brief.due(j("{\"bOn\":true,\"bMin\":9999}"), NOW));
    }

    @Test
    public void theBriefShowsAndIsSetAgain() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        ShadowAlarmManager am = shadowOf(c.getSystemService(AlarmManager.class));
        String today = Nudges.dayKey(System.currentTimeMillis());
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("tData", "{\"day\":\"" + today + "\",\"ready\":78,\"rword\":\"Good to train\",\"kt\":2960,\"plan\":{\"" + today + "\":{\"w\":\"Push day\",\"kt\":2960}},\"bOn\":false,\"bMin\":420}").apply();
        new Brief().onReceive(c, new Intent(c, Brief.class).setAction(Brief.ACTION));
        assertNull("switched off: nothing shows", shadowOf(nm).getNotification(Brief.ID));
        assertNull("and nothing is set", am.peekNextScheduledAlarm());
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("tData", "{\"day\":\"" + today + "\",\"ready\":78,\"rword\":\"Good to train\",\"kt\":2960,\"plan\":{\"" + today + "\":{\"w\":\"Push day\",\"kt\":2960}},\"bOn\":true,\"bMin\":420}").apply();
        new Brief().onReceive(c, new Intent(c, Brief.class).setAction(Brief.ACTION));
        Notification n = shadowOf(nm).getNotification(Brief.ID);
        assertNotNull(n);
        assertEquals("Today: Push day", n.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Readiness 78 · Good to train · Target 2,960 kcal", String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TEXT)));
        assertEquals(Brief.CH, n.getChannelId());
        ShadowAlarmManager.ScheduledAlarm next = am.peekNextScheduledAlarm();
        assertNotNull("the next morning's alarm is set", next);
        long gap = next.triggerAtTime - System.currentTimeMillis();
        assertTrue("within a day", gap > 0 && gap <= Brief.DAY);
        Calendar t = Calendar.getInstance();
        t.setTimeInMillis(next.triggerAtTime);
        assertEquals(7, t.get(Calendar.HOUR_OF_DAY));
        assertEquals(0, t.get(Calendar.MINUTE));
        // after a restart the alarm is set again without showing anything
        nm.cancelAll();
        new Brief().onReceive(c, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertNull(shadowOf(nm).getNotification(Brief.ID));
        assertNotNull(am.peekNextScheduledAlarm());
    }

    private static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    @Test
    public void theTodayWidgetShowsTodayOnly() {
        Application c = RuntimeEnvironment.getApplication();
        String today = Nudges.dayKey(System.currentTimeMillis());
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("tData", "{\"day\":\"" + today + "\",\"ready\":78,\"rword\":\"Good to train\",\"kcal\":1820,\"kt\":2960,\"done\":false,\"next\":\"Push day\",\"when\":\"Today\",\"plan\":{\"" + today + "\":{\"w\":\"Push day\",\"kt\":2960}}}").apply();
        View v = TodayWidget.views(c).apply(c, new FrameLayout(c));
        assertEquals("78", text(v, R.id.t_ready));
        assertEquals("Good to train", text(v, R.id.t_word));
        assertEquals("1,140 kcal left", text(v, R.id.t_kcal));
        assertEquals("Next: Push day · today", text(v, R.id.t_next));
        // the same data a day later: no readiness, nothing eaten yet, the planned workout
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("tData", "{\"day\":\"2020-01-01\",\"ready\":78,\"rword\":\"Good to train\",\"kcal\":1820,\"kt\":2960,\"done\":true,\"next\":\"Legs\",\"when\":\"Tomorrow\",\"plan\":{\"" + today + "\":{\"w\":\"Pull day\",\"kt\":3000}}}").apply();
        v = TodayWidget.views(c).apply(c, new FrameLayout(c));
        assertEquals("–", text(v, R.id.t_ready));
        assertEquals("Open for today's readiness", text(v, R.id.t_word));
        assertEquals("3,000 kcal left", text(v, R.id.t_kcal));
        assertEquals("Next: Pull day · today", text(v, R.id.t_next));
        // nothing written yet
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().remove("tData").apply();
        v = TodayWidget.views(c).apply(c, new FrameLayout(c));
        assertEquals("–", text(v, R.id.t_ready));
        assertEquals("No calorie target", text(v, R.id.t_kcal));
        assertEquals("Open GymDay to plan your week", text(v, R.id.t_next));
    }
}
