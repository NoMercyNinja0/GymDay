package app.gymday;

import android.app.Application;
import android.graphics.Bitmap;
import android.graphics.Canvas;
import android.view.View;
import android.widget.FrameLayout;
import android.widget.RemoteViews;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.annotation.GraphicsMode;

import java.io.File;
import java.io.FileOutputStream;

/** Draws the widget to pictures (build/widget-*.png) so its look can be checked without a phone. */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = 34, qualifiers = "w411dp-h891dp-xxhdpi")
@GraphicsMode(GraphicsMode.Mode.NATIVE)
public class WidgetPictureTest {
    void picture(String name, RemoteViews rv, int wDp, int hDp) throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        float d = c.getResources().getDisplayMetrics().density;
        int w = Math.round(wDp * d), h = Math.round(hDp * d);
        FrameLayout host = new FrameLayout(c);
        View v = rv.apply(c, host);
        host.addView(v, new FrameLayout.LayoutParams(w, h));
        host.measure(View.MeasureSpec.makeMeasureSpec(w, View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(h, View.MeasureSpec.EXACTLY));
        host.layout(0, 0, w, h);
        Bitmap bmp = Bitmap.createBitmap(w, h, Bitmap.Config.ARGB_8888);
        Canvas canvas = new Canvas(bmp);
        canvas.drawColor(0xFF2A3345);          // stands in for a wallpaper
        host.draw(canvas);
        File out = new File("build/widget-" + name + ".png");
        try (FileOutputStream f = new FileOutputStream(out)) {
            bmp.compress(Bitmap.CompressFormat.PNG, 100, f);
        }
    }

    /** How tall (dp) the widget wants to be at that width, when nothing limits it. */
    int wants(RemoteViews rv, int wDp) {
        Application c = RuntimeEnvironment.getApplication();
        float d = c.getResources().getDisplayMetrics().density;
        FrameLayout host = new FrameLayout(c);
        View v = rv.apply(c, host);
        v.setLayoutParams(new FrameLayout.LayoutParams(Math.round(wDp * d), FrameLayout.LayoutParams.WRAP_CONTENT));
        v.measure(View.MeasureSpec.makeMeasureSpec(Math.round(wDp * d), View.MeasureSpec.EXACTLY), View.MeasureSpec.makeMeasureSpec(0, View.MeasureSpec.UNSPECIFIED));
        return (int) Math.ceil(v.getMeasuredHeight() / d);
    }

    @Test
    public void heights() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        String plan = SmokeTest.everyDay("{\"id\":\"d1\",\"name\":\"Push day\"}");
        StringBuilder sb = new StringBuilder();
        for (String w : new String[]{"null", SmokeTest.card(), SmokeTest.PAUSED}) {
            WorkoutNotifier.prefs(c).edit().clear().putString("wData", SmokeTest.week(plan, w)).commit();
            sb.append(w.equals("null") ? "idle" : w.contains("\"paused\":true") ? "paused" : "workout")
                    .append(" full=").append(wants(WeekWidget.views(c, WeekWidget.FULL), 330))
                    .append(" compact=").append(wants(WeekWidget.views(c, WeekWidget.COMPACT), 330))
                    .append(" small=").append(wants(WeekWidget.views(c, WeekWidget.SMALL), 330)).append("\n");
        }
        java.nio.file.Files.write(new File("build/widget-heights.txt").toPath(), sb.toString().getBytes());
    }

    @Test
    public void pictures() throws Exception {
        Application c = RuntimeEnvironment.getApplication();
        String day = "{\"id\":\"d1\",\"name\":\"Push day\"}";
        String plan = SmokeTest.everyDay(day);
        WorkoutNotifier.prefs(c).edit().clear().putString("wData", SmokeTest.week(plan, "null")).commit();
        picture("idle", WeekWidget.views(c, WeekWidget.FULL), 330, 146);
        picture("idle-compact", WeekWidget.views(c, WeekWidget.COMPACT), 330, 130);
        picture("idle-small", WeekWidget.views(c, WeekWidget.SMALL), 330, 64);
        WorkoutNotifier.prefs(c).edit().putString("wData", SmokeTest.week(plan, SmokeTest.card())).commit();
        picture("workout", WeekWidget.views(c, WeekWidget.FULL), 330, 146);
        picture("workout-compact", WeekWidget.views(c, WeekWidget.COMPACT), 330, 130);
        picture("workout-small", WeekWidget.views(c, WeekWidget.SMALL), 330, 64);
        picture("workout-tall", WeekWidget.views(c, WeekWidget.FULL), 360, 190);
        WorkoutNotifier.prefs(c).edit().putString("wData", SmokeTest.week(plan, SmokeTest.PAUSED)).commit();
        picture("paused", WeekWidget.views(c, WeekWidget.FULL), 330, 146);
        WorkoutNotifier.prefs(c).edit().putString("wData", SmokeTest.week(plan, SmokeTest.card())).putBoolean("wOpenOnly", true).commit();
        picture("openonly", WeekWidget.views(c, WeekWidget.FULL), 330, 146);
    }
}
