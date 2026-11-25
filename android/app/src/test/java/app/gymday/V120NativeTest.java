package app.gymday;

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
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.speech.RecognizerIntent;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;
import android.widget.TextView;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;
import org.robolectric.shadows.ShadowAlarmManager;
import org.robolectric.shadows.ShadowLooper;

import java.io.File;
import java.io.FileOutputStream;
import java.util.ArrayList;
import java.util.Calendar;

/**
 * v1.20: the Food widget (today's calories and protein, yesterday's data shows an empty day), supplement reminders (the alarm waits
 * for the next one, a due one shows), the evening protein reminder (only when food is logged today and 10 g or more is missing),
 * and voice logging (the phone's speech recogniser opened in the chosen language; what it heard goes to window.onVoice).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class V120NativeTest {
    private static Context ctx() {
        return RuntimeEnvironment.getApplication();
    }

    private static TextView text(View root, int id) {
        return (TextView) root.findViewById(id);
    }

    @Test
    public void foodWidgetShowsTodayAndStartsANewDay() {
        Application c = RuntimeEnvironment.getApplication();
        String today = Nudges.dayKey(System.currentTimeMillis());
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("fData", "{\"day\":\"" + today + "\",\"kcal\":1820,\"kt\":2960,\"p\":62.4,\"pt\":95}").apply();
        View v = FoodWidget.views(c).apply(c, new FrameLayout(c));
        assertEquals("1,820 / 2,960 kcal", text(v, R.id.f_kcal).getText().toString());
        assertEquals("1,140 left", text(v, R.id.f_left).getText().toString());
        assertEquals("Protein 62 / 95 g", text(v, R.id.f_prot).getText().toString());
        assertEquals("33 g to go", text(v, R.id.f_pleft).getText().toString());
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("fData", "{\"day\":\"2020-01-01\",\"kcal\":1820,\"kt\":2960,\"p\":62,\"pt\":95}").apply();
        v = FoodWidget.views(c).apply(c, new FrameLayout(c));
        assertEquals("yesterday's numbers are not today's", "0 / 2,960 kcal", text(v, R.id.f_kcal).getText().toString());
        assertEquals("Protein 0 / 95 g", text(v, R.id.f_prot).getText().toString());
    }

    @Test
    @Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
    @GraphicsMode(GraphicsMode.Mode.NATIVE)
    public void foodWidgetPicture() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("fData", "{\"day\":\"" + Nudges.dayKey(System.currentTimeMillis()) + "\",\"kcal\":1820,\"kt\":2960,\"p\":62.4,\"pt\":95}").apply();
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.round(320 * d), h = Math.round(130 * d);
        FrameLayout host = new FrameLayout(c);
        View v = FoodWidget.views(c).apply(c, host);
        host.addView(v, new FrameLayout.LayoutParams(w, h));
        host.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        host.layout(0, 0, w, h);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(0xFF2A3345);
        host.draw(canvas);
        try (FileOutputStream f = new FileOutputStream(new File("build/widget-food.png"))) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, f);
        }
    }

    @Test
    public void supplementRemindersWaitForTheNextOneAndShowTheDueOne() throws Exception {
        Context c = ctx();
        long now = System.currentTimeMillis();
        JSONArray a = new JSONArray()
                .put(new JSONObject().put("t", now + 3 * 3600000L).put("id", "cr").put("title", "Creatine").put("text", "1 scoop · tap to tick it off"))
                .put(new JSONObject().put("t", now + 3600000L).put("id", "d3").put("title", "Vitamin D3").put("text", "1 tablet · tap to tick it off"));
        Nudges.setSupps(c, a.toString());
        ShadowAlarmManager am = shadowOf(c.getSystemService(AlarmManager.class));
        ShadowAlarmManager.ScheduledAlarm next = am.peekNextScheduledAlarm();
        assertNotNull(next);
        assertEquals("the soonest one", now + 3600000L, next.triggerAtTime, 1000);
        // ringing a little after it was due: it shows, and the alarm moves on to the next
        a.getJSONObject(1).put("t", now - 1000);
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit().putString("sRem", a.toString()).apply();
        new Nudges().onReceive(c, new Intent(c, Nudges.class).setAction(Nudges.ACT_SUPP));
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        boolean shown = false;
        for (android.service.notification.StatusBarNotification n : shadowOf(nm).getActiveNotifications())
            if ("Vitamin D3".equals(n.getNotification().extras.getString(Notification.EXTRA_TITLE))) shown = true;
        assertTrue("the due reminder shows", shown);
        next = am.peekNextScheduledAlarm();
        assertNotNull(next);
        assertEquals(now + 3 * 3600000L, next.triggerAtTime, 1000);
    }

    @Test
    public void proteinReminderOnlyWhenFoodIsLoggedAndProteinIsShort() throws Exception {
        Context c = ctx();
        NotificationManager nm = c.getSystemService(NotificationManager.class);
        String today = Nudges.dayKey(System.currentTimeMillis());
        Nudges.setProtein(c, "{\"on\":true,\"mins\":1140,\"day\":\"" + today + "\",\"got\":90,\"goal\":95}");
        assertNotNull("a daily alarm is set", shadowOf(c.getSystemService(AlarmManager.class)).peekNextScheduledAlarm());
        new Nudges().onReceive(c, new Intent(c, Nudges.class).setAction(Nudges.ACT_PROT));
        assertNull("5 g short: nothing", shadowOf(nm).getNotification(Nudges.ID_PROT));
        Nudges.setProtein(c, "{\"on\":true,\"mins\":1140,\"day\":\"2020-01-01\",\"got\":10,\"goal\":95}");
        new Nudges().onReceive(c, new Intent(c, Nudges.class).setAction(Nudges.ACT_PROT));
        assertNull("nothing logged today: nothing", shadowOf(nm).getNotification(Nudges.ID_PROT));
        Nudges.setProtein(c, "{\"on\":true,\"mins\":1140,\"day\":\"" + today + "\",\"got\":62,\"goal\":95}");
        new Nudges().onReceive(c, new Intent(c, Nudges.class).setAction(Nudges.ACT_PROT));
        Notification n = shadowOf(nm).getNotification(Nudges.ID_PROT);
        assertNotNull(n);
        assertEquals("Protein: 62 of 95 g today", n.extras.getString(Notification.EXTRA_TITLE));
        assertTrue(String.valueOf(n.extras.getCharSequence(Notification.EXTRA_TEXT)).startsWith("33 g to go."));
        Nudges.setProtein(c, "{\"on\":false}");
        assertNull("off: no alarm", shadowOf(c.getSystemService(AlarmManager.class)).peekNextScheduledAlarm());
    }

    @Test
    public void voiceOpensTheRecogniserInTheLanguageAndHandsBackWhatItHeard() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        SmokeTestCalls.call(a, "voiceListen", "hi-IN", "बोलिए: 60 किलो 8 बार");
        ShadowLooper.idleMainLooper();
        org.robolectric.shadows.ShadowActivity.IntentForResult r = shadowOf(a).getNextStartedActivityForResult();
        assertNotNull("the recogniser was opened", r);
        assertEquals(RecognizerIntent.ACTION_RECOGNIZE_SPEECH, r.intent.getAction());
        assertEquals("hi-IN", r.intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE));
        assertEquals(RecognizerIntent.LANGUAGE_MODEL_FREE_FORM, r.intent.getStringExtra(RecognizerIntent.EXTRA_LANGUAGE_MODEL));
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        // what came back from the recogniser
        Intent data = new Intent();
        ArrayList<String> heard = new ArrayList<>();
        heard.add("60 किलो 8 बार");
        data.putStringArrayListExtra(RecognizerIntent.EXTRA_RESULTS, heard);
        shadowOf(a).receiveResult(r.intent, android.app.Activity.RESULT_OK, data);
        String js = shadowOf(web).getLastEvaluatedJavascript();
        assertEquals("window.onVoice&&window.onVoice([\"60 किलो 8 बार\"],\"ok\")", js);
    }

    @Test
    public void theNewShortcutsAreTakenAndOthersAreNot() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        for (String to : new String[]{"foodtab", "supps", "food", "weight"}) {
            a.onNewIntent(new Intent(a, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", to));
            assertEquals(to, SmokeTestCalls.call(a, "pendingGo"));
        }
        a.onNewIntent(new Intent(a, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", "javascript:alert(1)"));
        assertEquals("", SmokeTestCalls.call(a, "pendingGo"));
    }

    @Test
    public void afterARestartTheRemindersAreSetAgain() throws Exception {
        Context c = ctx();
        long now = System.currentTimeMillis();
        c.getSharedPreferences("gymday", Context.MODE_PRIVATE).edit()
                .putString("sRem", new JSONArray().put(new JSONObject().put("t", now + 7200000L).put("id", "x").put("title", "Omega-3").put("text", "1 capsule")).toString())
                .putString("pNudge", "{\"on\":true,\"mins\":" + ((Calendar.getInstance().get(Calendar.HOUR_OF_DAY) + 1) % 24) * 60 + "}").apply();
        new Nudges().onReceive(c, new Intent(Intent.ACTION_BOOT_COMPLETED));
        assertEquals(2, shadowOf(c.getSystemService(AlarmManager.class)).getScheduledAlarms().size());
    }
}
