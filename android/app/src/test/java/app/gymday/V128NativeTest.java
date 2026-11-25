package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertTrue;

import android.content.Intent;
import android.content.pm.PackageInfo;
import android.content.pm.PackageManager;
import android.content.pm.ResolveInfo;
import android.service.quicksettings.TileService;

import org.json.JSONArray;
import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

/**
 * v1.28: "forgot to log?" (the workouts other apps put into Health Connect, the kinds in words for both versions of Health
 * Connect, the permission asked for) and the two Quick Settings tiles.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class V128NativeTest {
    private static final long H = 3600000L, MIN = 60000L;

    @Test
    public void sessionsLeaveOutGymDaysOwnAndOddLengths() throws Exception {
        List<Sessions.Row> rows = new ArrayList<>();
        rows.add(new Sessions.Row(5 * H, 6 * H, "gym", "Weights", "com.oplus.health"));
        rows.add(new Sessions.Row(2 * H, 3 * H, "gym", "Strength", "app.gymday"));                 // GymDay's own: left out
        rows.add(new Sessions.Row(1 * H, 1 * H + 5 * MIN, "gym", "", "com.watch"));                // 5 minutes: left out
        rows.add(new Sessions.Row(0, 6 * H, "other", "", "com.watch"));                              // 6 hours: left out
        rows.add(new Sessions.Row(3 * H, 3 * H + 40 * MIN, "sport", null, null));
        rows.add(new Sessions.Row(4 * H, 5 * H, "hiit", "A very long title that goes on and on and on and on past sixty letters", "com.x"));
        JSONObject o = new JSONObject(Sessions.json(rows, "app.gymday"));
        assertTrue(o.getBoolean("ok"));
        JSONArray a = o.getJSONArray("items");
        assertEquals(3, a.length());
        assertEquals(3 * H, a.getJSONObject(0).getLong("s"));                                        // oldest first
        assertEquals("sport", a.getJSONObject(0).getString("kind"));
        assertEquals("", a.getJSONObject(0).getString("title"));
        assertEquals(60, a.getJSONObject(1).getString("title").length());
        assertEquals("gym", a.getJSONObject(2).getString("kind"));
        assertEquals(6 * H, a.getJSONObject(2).getLong("e"));
        assertEquals("com.oplus.health", a.getJSONObject(2).getString("app"));
    }

    @Test
    public void atMostSixty() throws Exception {
        List<Sessions.Row> rows = new ArrayList<>();
        for (int i = 0; i < 80; i++) rows.add(new Sessions.Row(i * H, i * H + 30 * MIN, "gym", "", "w"));
        assertEquals(60, new JSONObject(Sessions.json(rows, "app.gymday")).getJSONArray("items").length());
        assertEquals(0, new JSONObject(Sessions.json(new ArrayList<>(), "app.gymday")).getJSONArray("items").length());
    }

    @Test
    public void theLibrarysKindsInWords() {
        // Google's library (Android 13 and older) numbers them its own way
        assertEquals("gym", HealthCompat.kindOf(70));      // strength training
        assertEquals("gym", HealthCompat.kindOf(81));      // weightlifting
        assertEquals("gym", HealthCompat.kindOf(13));      // calisthenics
        assertEquals("hiit", HealthCompat.kindOf(36));
        assertEquals("other", HealthCompat.kindOf(0));
        assertEquals("sport", HealthCompat.kindOf(56));    // running
    }

    @Test
    @Config(sdk = {34, 36})
    public void androidsOwnKindsInWords() {
        // Android 14 and newer: its own numbers differ from the library's
        assertEquals("gym", HealthBridge.kindOf(45));      // strength training
        assertEquals("gym", HealthBridge.kindOf(55));      // weightlifting
        assertEquals("gym", HealthBridge.kindOf(8));       // calisthenics
        assertEquals("hiit", HealthBridge.kindOf(20));
        assertEquals("other", HealthBridge.kindOf(58));
        assertEquals("other", HealthBridge.kindOf(0));
        assertEquals("sport", HealthBridge.kindOf(70));    // not strength here
    }

    @Test
    public void readingWorkoutsIsAsked() throws Exception {
        PackageManager pm = RuntimeEnvironment.getApplication().getPackageManager();
        PackageInfo pi = pm.getPackageInfo(RuntimeEnvironment.getApplication().getPackageName(), PackageManager.GET_PERMISSIONS);
        assertTrue(Arrays.asList(pi.requestedPermissions).contains("android.permission.health.READ_EXERCISE"));
        assertEquals("android.permission.health.READ_EXERCISE", HealthBridge.EXER);
    }

    @Test
    public void twoTilesOpenTheRightPlaces() {
        Intent i = GoTile.intentFor(RuntimeEnvironment.getApplication(), new GoTile.Meal().to());
        assertEquals(MainActivity.ACTION_GO, i.getAction());
        assertEquals("mealphoto", i.getStringExtra("to"));
        assertTrue((i.getFlags() & Intent.FLAG_ACTIVITY_NEW_TASK) != 0);
        assertEquals(MainActivity.class.getName(), i.getComponent().getClassName());
        assertEquals("food", new GoTile.Food().to());
        List<ResolveInfo> l = RuntimeEnvironment.getApplication().getPackageManager().queryIntentServices(new Intent(TileService.ACTION_QS_TILE).setPackage(RuntimeEnvironment.getApplication().getPackageName()), 0);
        List<String> names = new ArrayList<>();
        for (ResolveInfo r : l) names.add(r.serviceInfo.name);
        assertTrue(names.toString(), names.contains("app.gymday.GoTile$Meal"));
        assertTrue(names.toString(), names.contains("app.gymday.GoTile$Food"));
    }
}
