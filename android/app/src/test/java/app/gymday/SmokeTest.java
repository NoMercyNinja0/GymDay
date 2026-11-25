package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertFalse;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.app.Application;
import android.app.Notification;
import android.app.NotificationManager;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.os.Looper;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.Chronometer;
import android.widget.FrameLayout;
import android.widget.ProgressBar;
import android.widget.RemoteViews;
import android.widget.TextView;

import org.json.JSONObject;
import org.junit.Before;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.android.controller.ActivityController;
import org.robolectric.annotation.Config;

/**
 * Runs the parts of GymDay that live outside its page (the workout card, its buttons, the keep-alive service,
 * the widget, the widget's Start button) against a stand-in for Android, on several Android versions.
 * It cannot show how they look on a real phone; it shows that they build, hold the right words and buttons, and do not crash.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 33, 34, 36})
public class SmokeTest {
    static final String CARD = "{\"title\":\"Push day\",\"text\":\"Bench press · set 2 of 4\",\"chip\":\"Set 2/4\",\"base\":%d,\"paused\":false,\"elapsed\":0,"
            + "\"done\":5,\"total\":14,\"segs\":[4,3,3,4],\"btns\":[[\"tick\",\"Tick set ✓\"],[\"next\",\"Next exercise\"],[\"pause\",\"Pause\"]]}";
    static final String PAUSED = "{\"title\":\"Push day\",\"text\":\"Bench press · set 2 of 4\",\"chip\":\"Paused\",\"base\":1,\"paused\":true,\"elapsed\":754000,"
            + "\"done\":5,\"total\":14,\"segs\":[4,3,3,4],\"btns\":[[\"resume\",\"Resume\"],[\"finish\",\"Finish workout\"]]}";
    static final String DAY = "{\"id\":\"d1\",\"name\":\"Push day\"}";

    Application c;
    NotificationManager nm;

    @Before
    public void setUp() {
        c = RuntimeEnvironment.getApplication();
        nm = c.getSystemService(NotificationManager.class);
        WorkoutNotifier.prefs(c).edit().clear().commit();
    }

    static String card() {
        return String.format(java.util.Locale.US, CARD, System.currentTimeMillis() - 600000);
    }

    static String week(String plan, String w) {
        long ws = System.currentTimeMillis() - 3600000;       // a week that began an hour ago, so "this week" whatever today is
        return "{\"n\":2,\"goal\":3,\"ws\":" + ws + ",\"days\":[1,0,1,0,0,0,0],\"sched\":true,\"plan\":[" + plan + "],\"last\":\"Leg day\",\"w\":" + w + "}";
    }

    static String everyDay(String one) {
        return one + "," + one + "," + one + "," + one + "," + one + "," + one + "," + one;
    }

    View inflate(RemoteViews v) {
        return v.apply(c, new FrameLayout(c));
    }

    static String text(View root, int id) {
        return ((TextView) root.findViewById(id)).getText().toString();
    }

    static boolean shown(View root, int id) {
        return root.findViewById(id).getVisibility() == View.VISIBLE;
    }

    // ---------------------------------------------------------------- the card

    @Test
    public void clock() {
        assertEquals("1:15", WorkoutNotifier.clock(75000));
        assertEquals("1:02:05", WorkoutNotifier.clock(3725000));
        assertEquals("0:00", WorkoutNotifier.clock(-5));
    }

    @Test
    public void cardHasTimerProgressAndThreeButtons() throws Exception {
        Notification n = WorkoutNotifier.build(c, new JSONObject(card()), true);
        assertEquals("Push day", n.extras.getString(Notification.EXTRA_TITLE));
        assertEquals("Bench press · set 2 of 4", n.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
        assertEquals("5 of 14 sets", n.extras.getCharSequence(Notification.EXTRA_SUB_TEXT).toString());
        assertTrue((n.flags & Notification.FLAG_ONGOING_EVENT) != 0);
        assertTrue(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertTrue(n.extras.getBoolean("android.requestPromotedOngoing"));
        assertEquals(3, n.actions.length);
        assertEquals("Tick set ✓", n.actions[0].title.toString());
        assertEquals("Next exercise", n.actions[1].title.toString());
        assertEquals("Pause", n.actions[2].title.toString());
        assertNotNull(n.actions[0].actionIntent);
        assertEquals(Notification.VISIBILITY_PUBLIC, n.visibility);
        if (Build.VERSION.SDK_INT >= 36) {
            assertEquals("android.app.Notification$ProgressStyle", n.extras.getString(Notification.EXTRA_TEMPLATE));
            assertEquals("Set 2/4", n.getShortCriticalText());
            assertTrue("Android 16 itself must find the card fit for the capsule", n.hasPromotableCharacteristics());
            // this copy of Android 16 is the first release, whose rule wants "colorized"; the card must have adapted to it
            assertTrue(n.extras.getBoolean(Notification.EXTRA_COLORIZED));
            assertEquals(0xFF0E1726, n.color);
        } else {
            assertFalse(n.extras.getBoolean(Notification.EXTRA_COLORIZED));
            assertEquals(0xFF3D9BFF, n.color);
            assertEquals(14, n.extras.getInt(Notification.EXTRA_PROGRESS_MAX));
            assertEquals(5, n.extras.getInt(Notification.EXTRA_PROGRESS));
        }
    }

    @Test
    public void pausedCardStandsStillAndOffersResumeAndFinish() throws Exception {
        Notification n = WorkoutNotifier.build(c, new JSONObject(PAUSED), true);
        assertEquals("Push day · paused at 12:34", n.extras.getString(Notification.EXTRA_TITLE));
        assertFalse(n.extras.getBoolean(Notification.EXTRA_SHOW_CHRONOMETER));
        assertEquals(2, n.actions.length);
        assertEquals("Resume", n.actions[0].title.toString());
        assertEquals("Finish workout", n.actions[1].title.toString());
        if (Build.VERSION.SDK_INT >= 36) assertTrue(n.hasPromotableCharacteristics());
    }

    @Test
    public void cardWithoutButtonsSaysTapToOpen() throws Exception {
        Notification n = WorkoutNotifier.build(c, new JSONObject(card()), false);
        assertTrue(n.actions == null || n.actions.length == 0);
        assertEquals("Tap to open GymDay and carry on", n.extras.getCharSequence(Notification.EXTRA_TEXT).toString());
    }

    @Test
    public void oddCardsDoNotCrash() throws Exception {
        assertNotNull(WorkoutNotifier.build(c, new JSONObject("{}"), true));
        Notification n = WorkoutNotifier.build(c, new JSONObject("{\"title\":\"X\",\"total\":0,\"segs\":[0,-2],\"btns\":[[\"rm -rf\",\"Bad\"],[\"tick\",\"A\"],[\"next\",\"B\"],[\"pause\",\"C\"],[\"finish\",\"D\"]]}"), true);
        assertEquals("a button the app does not know is left out, and never more than three", 3, n.actions.length);
        assertEquals("A", n.actions[0].title.toString());
    }

    // ---------------------------------------------------------------- page -> card -> buttons -> page

    Object bridge(MainActivity a) {
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        return shadowOf(web).getJavascriptInterface("Android");
    }

    static Object call(Object bridge, String name, Object... args) throws Exception {
        Class<?>[] types = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) types[i] = String.class;
        return bridge.getClass().getMethod(name, types).invoke(bridge, args);
    }

    @Test
    public void wholeLoop() throws Exception {
        ActivityController<MainActivity> ac = Robolectric.buildActivity(MainActivity.class).create().start().resume();
        MainActivity a = ac.get();
        assertEquals(a, MainActivity.live());
        Object b = bridge(a);
        String cap = (String) call(b, "capsuleState");
        assertTrue(cap, Build.VERSION.SDK_INT >= 36 ? cap.equals("yes") || cap.equals("no") : cap.equals("na"));

        // the page describes the workout: the card is posted and the keep-alive service is asked for
        call(b, "workoutCard", card());
        shadowOf(Looper.getMainLooper()).idle();
        Notification n = shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT);
        assertNotNull(n);
        assertEquals(3, n.actions.length);
        Intent svc = shadowOf(c).getNextStartedService();
        assertNotNull(svc);
        assertEquals(WorkoutService.class.getName(), svc.getComponent().getClassName());
        WorkoutService s = Robolectric.buildService(WorkoutService.class).create().startCommand(0, 1).get();
        assertNotNull(shadowOf(s).getLastForegroundNotification());
        assertEquals(WorkoutNotifier.ID_WORKOUT, shadowOf(s).getLastForegroundNotificationId());

        // a button press reaches the page
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        new ActionReceiver().onReceive(c, new Intent(c, ActionReceiver.class).setAction(WorkoutNotifier.ACT + "pause"));
        assertTrue(shadowOf(web).getLastEvaluatedJavascript().contains("window.noteAction('pause')"));
        assertFalse(WorkoutNotifier.prefs(c).getBoolean("wOpenOnly", false));
        // something that is not one of the five buttons is ignored
        String before = shadowOf(web).getLastEvaluatedJavascript();
        new ActionReceiver().onReceive(c, new Intent(c, ActionReceiver.class).setAction(WorkoutNotifier.ACT + "x');alert(1);('"));
        assertEquals(before, shadowOf(web).getLastEvaluatedJavascript());

        // the page says paused: the card follows
        call(b, "workoutCard", PAUSED);
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(2, shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT).actions.length);

        // the screen is closed: no page, so no buttons, on the card and on the widget
        ac.pause().stop().destroy();
        assertNull(MainActivity.live());
        assertTrue(WorkoutNotifier.prefs(c).getBoolean("wOpenOnly", false));
        n = shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT);
        assertTrue(n.actions == null || n.actions.length == 0);
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), PAUSED)).commit();
        View w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("Open GymDay", text(w, R.id.w_b0));
        assertFalse(shown(w, R.id.w_b1));
        // a press with no page to hand it to keeps it that way instead of crashing
        new ActionReceiver().onReceive(c, new Intent(c, ActionReceiver.class).setAction(WorkoutNotifier.ACT + "tick"));
        assertTrue(WorkoutNotifier.prefs(c).getBoolean("wOpenOnly", false));

        // the app is opened again: the page describes the workout again and the buttons are back
        ActivityController<MainActivity> ac2 = Robolectric.buildActivity(MainActivity.class).create().start().resume();
        call(bridge(ac2.get()), "workoutCard", card());
        shadowOf(Looper.getMainLooper()).idle();
        assertEquals(3, shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT).actions.length);
        assertFalse(WorkoutNotifier.prefs(c).getBoolean("wOpenOnly", false));

        // workout over
        call(bridge(ac2.get()), "workoutSaved", "Push day saved", "52 min in the gym · 14 sets. Tap to see how it went.");
        call(bridge(ac2.get()), "workoutClear");
        shadowOf(Looper.getMainLooper()).idle();
        assertNull(shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT));
        assertNotNull(shadowOf(nm).getNotification(WorkoutNotifier.ID_SAVED));
        assertNull(WorkoutNotifier.card(c));
        assertNotNull(shadowOf(c).getNextStoppedService());
        ac2.pause().stop().destroy();       // closing the app with no workout running posts nothing
        assertNull(shadowOf(nm).getNotification(WorkoutNotifier.ID_WORKOUT));
    }

    @Test
    public void serviceWithNothingToShowStopsItself() {
        WorkoutService s = Robolectric.buildService(WorkoutService.class).create().startCommand(0, 1).get();
        assertNull(shadowOf(s).getLastForegroundNotification());
        assertTrue(shadowOf(s).isStoppedBySelf());
    }

    @Test
    public void serviceRestartedByThePhoneShowsTheCardWithoutButtons() {
        WorkoutNotifier.prefs(c).edit().putString("wCard", card()).commit();
        WorkoutService s = Robolectric.buildService(WorkoutService.class).create().startCommand(0, 1).get();       // no screen open
        Notification n = shadowOf(s).getLastForegroundNotification();
        assertNotNull(n);
        assertTrue(n.actions == null || n.actions.length == 0);
        Robolectric.buildService(WorkoutService.class).create().destroy();
    }

    // ---------------------------------------------------------------- the widget's Start button

    @Test
    public void widgetStartHandsTheDayToThePage() throws Exception {
        Intent i = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START).putExtra("day", "d1");
        MainActivity a = Robolectric.buildActivity(MainActivity.class, i).create().start().resume().get();
        assertEquals("d1", call(bridge(a), "pendingStart"));
        assertEquals("only once", "", call(bridge(a), "pendingStart"));

        Intent odd = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START).putExtra("day", "');alert(1);('");
        MainActivity a2 = Robolectric.buildActivity(MainActivity.class, odd).create().get();
        assertEquals("alert1", call(bridge(a2), "pendingStart"));

        Intent none = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START);
        assertEquals("-", call(bridge(Robolectric.buildActivity(MainActivity.class, none).create().get()), "pendingStart"));

        Intent old = new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_START).putExtra("day", "d1").addFlags(Intent.FLAG_ACTIVITY_LAUNCHED_FROM_HISTORY);
        assertEquals("reopened from the recent-apps list", "", call(bridge(Robolectric.buildActivity(MainActivity.class, old).create().get()), "pendingStart"));

        assertEquals("an ordinary start", "", call(bridge(Robolectric.buildActivity(MainActivity.class).create().get()), "pendingStart"));
    }

    // ---------------------------------------------------------------- the widget

    @Test
    public void widgetBeforeTheAppWasEverOpened() {
        View w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("0 workouts this week", text(w, R.id.w_count));
        assertEquals("Ready when you are", text(w, R.id.w_today));
        assertEquals("Start", text(w, R.id.w_start));
        assertFalse(shown(w, R.id.w_work));
        assertNotNull(inflate(WeekWidget.views(c, WeekWidget.SMALL)));
        WorkoutNotifier.prefs(c).edit().putString("wData", "not json").commit();
        assertNotNull(inflate(WeekWidget.views(c, WeekWidget.FULL)));
    }

    @Test
    public void widgetShowsTheWeekAndToday() {
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), "null")).commit();
        View w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("2 of 3 this week", text(w, R.id.w_count));
        assertEquals("TODAY", text(w, R.id.w_lbl));
        assertEquals("Push day", text(w, R.id.w_today));
        assertEquals("Start", text(w, R.id.w_start));
        assertTrue(shown(w, R.id.w_dots));
        assertTrue(shown(w, R.id.w_idle));
        assertFalse(shown(w, R.id.w_work));
        assertEquals("M", text(w, R.id.w_d0));
        assertEquals(0xFF04121F, ((TextView) w.findViewById(R.id.w_d0)).getCurrentTextColor());       // Monday was trained
        assertTrue(w.findViewById(R.id.w_start).hasOnClickListeners());

        View s = inflate(WeekWidget.views(c, WeekWidget.SMALL));
        assertEquals("2 of 3 this week", text(s, R.id.w_s1));
        assertEquals("Today: Push day", text(s, R.id.w_s2));
        assertEquals("Start", text(s, R.id.w_start));

        // a rest day, and no weekly schedule
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay("null"), "null")).commit();
        w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("Rest day", text(w, R.id.w_today));
        assertEquals("Open", text(w, R.id.w_start));
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), "null").replace("\"sched\":true", "\"sched\":false")).commit();
        w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("LAST WORKOUT", text(w, R.id.w_lbl));
        assertEquals("Leg day", text(w, R.id.w_today));

        // last week's numbers are not shown as this week's
        long old = System.currentTimeMillis() - 9 * 86400000L;
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), "null").replaceAll("\"ws\":\\d+", "\"ws\":" + old)).commit();
        w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertEquals("0 of 3 this week", text(w, R.id.w_count));
        assertEquals(0xFF04121F == ((TextView) w.findViewById(R.id.w_d0)).getCurrentTextColor(), false);
    }

    @Test
    public void widgetDuringAWorkout() {
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), card())).commit();
        View w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertTrue(shown(w, R.id.w_work));
        assertFalse(shown(w, R.id.w_dots));
        assertFalse(shown(w, R.id.w_idle));
        assertEquals("5 of 14 sets", text(w, R.id.w_count));
        assertEquals("Push day", text(w, R.id.w_title));
        assertEquals("Bench press · set 2 of 4", text(w, R.id.w_text));
        assertTrue(shown(w, R.id.w_timer));
        assertFalse(shown(w, R.id.w_frozen));
        Chronometer ch = w.findViewById(R.id.w_timer);
        long ran = android.os.SystemClock.elapsedRealtime() - ch.getBase();
        assertTrue("the timer starts ten minutes back: " + ran, Math.abs(ran - 600000) < 5000);
        ProgressBar bar = w.findViewById(R.id.w_bar);
        assertEquals(14, bar.getMax());
        assertEquals(5, bar.getProgress());
        assertEquals("✓ Tick set", text(w, R.id.w_b0));
        assertEquals("Next", text(w, R.id.w_b1));
        assertEquals("Pause", text(w, R.id.w_b2));
        assertTrue(w.findViewById(R.id.w_b0).hasOnClickListeners());

        View s = inflate(WeekWidget.views(c, WeekWidget.SMALL));
        assertEquals("Push day", text(s, R.id.w_s1));
        assertEquals("✓ Tick set", text(s, R.id.w_start));
        assertTrue(shown(s, R.id.w_timer));

        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), PAUSED)).commit();
        w = inflate(WeekWidget.views(c, WeekWidget.FULL));
        assertFalse(shown(w, R.id.w_timer));
        assertEquals("Paused 12:34", text(w, R.id.w_frozen));
        assertEquals("Resume", text(w, R.id.w_b0));
        assertEquals("Finish", text(w, R.id.w_b1));
        assertFalse(shown(w, R.id.w_b2));
        s = inflate(WeekWidget.views(c, WeekWidget.SMALL));
        assertEquals("Push day · paused", text(s, R.id.w_s1));
        assertEquals("Resume", text(s, R.id.w_start));
        assertFalse(shown(s, R.id.w_timer));
    }

    @Test
    public void lowWidgetLeavesOutItsHeadingLine() {
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), "null")).commit();
        View w = inflate(WeekWidget.views(c, WeekWidget.COMPACT));
        assertFalse(shown(w, R.id.w_head));
        assertEquals("TODAY · 2 OF 3 THIS WEEK", text(w, R.id.w_lbl));
        assertEquals("Push day", text(w, R.id.w_today));
        assertTrue(shown(inflate(WeekWidget.views(c, WeekWidget.FULL)), R.id.w_head));
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), card())).commit();
        w = inflate(WeekWidget.views(c, WeekWidget.COMPACT));
        assertFalse(shown(w, R.id.w_head));
        assertEquals("✓ Tick set", text(w, R.id.w_b0));
    }

    @Test
    public void widgetPlacedOnTheHomeScreen() {
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), "null")).commit();
        android.appwidget.AppWidgetManager m = android.appwidget.AppWidgetManager.getInstance(c);
        int id = shadowOf(m).createWidget(WeekWidget.class, R.layout.widget_week);
        View w = shadowOf(m).getViewFor(id);       // Android 12+: one of the three sizes, chosen by the (stand-in) home screen
        boolean small = w.findViewById(R.id.w_s1) != null;
        assertEquals("2 of 3 this week", text(w, small ? R.id.w_s1 : R.id.w_count));
        WorkoutNotifier.prefs(c).edit().putString("wData", week(everyDay(DAY), card())).commit();
        WeekWidget.refresh(c);
        w = shadowOf(m).getViewFor(id);
        assertEquals("Push day", text(w, small ? R.id.w_s1 : R.id.w_title));
    }
}
