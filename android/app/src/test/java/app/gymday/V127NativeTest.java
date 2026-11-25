package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;

import android.media.ExifInterface;

import org.json.JSONObject;
import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

import java.util.Calendar;

/**
 * v1.27: the evening wrap-up (what it says on a full day, on a day with nothing logged, with food logging off, on a day the
 * app was not opened; when it is due) and Share to GymDay's picture sizing and turning.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class V127NativeTest {

    private static long at(int y, int mo, int d, int h, int mi) {
        Calendar t = Calendar.getInstance();
        t.set(y, mo - 1, d, h, mi, 0);
        t.set(Calendar.MILLISECOND, 0);
        return t.getTimeInMillis();
    }

    private static JSONObject day(String json) throws Exception {
        return new JSONObject(json);
    }

    @Test
    public void aFullDay() throws Exception {
        JSONObject d = day("{\"day\":\"2026-11-20\",\"kcal\":1840,\"kt\":2200,\"p\":92,\"pt\":110,\"nf\":5,\"food\":true,\"wn\":\"Push day\",\"wOn\":true,\"wMin\":1260,"
                + "\"plan\":{\"2026-11-20\":{\"w\":\"Push day\",\"kt\":2200},\"2026-11-21\":{\"w\":\"Legs\",\"kt\":2200}}}");
        String[] l = Wrap.lines(d, at(2026, 11, 20, 21, 0));
        assertEquals("Today: Push day ✓", l[0]);
        assertEquals("1,840 of 2,200 kcal · protein 92 of 110 g · Tomorrow: Legs", l[1]);
        assertEquals("", l[2]);
    }

    @Test
    public void foodOnlyAndARestDayTomorrow() throws Exception {
        JSONObject d = day("{\"day\":\"2026-11-20\",\"kcal\":1500,\"kt\":0,\"p\":60,\"nf\":3,\"food\":true,\"wOn\":true,"
                + "\"plan\":{\"2026-11-21\":{\"w\":\"\",\"kt\":2200}}}");
        String[] l = Wrap.lines(d, at(2026, 11, 20, 21, 0));
        assertEquals("Today's wrap-up", l[0]);
        assertEquals("1,500 kcal · 60 g protein · Tomorrow: rest day", l[1]);
    }

    @Test
    public void aWorkoutWithNoFoodYetOpensTheFoodTab() throws Exception {
        JSONObject d = day("{\"day\":\"2026-11-20\",\"nf\":0,\"food\":true,\"wn\":\"Legs\",\"wOn\":true,\"plan\":{\"2026-11-21\":{\"w\":\"\",\"kt\":0,\"up\":\"Push day\"}}}");
        String[] l = Wrap.lines(d, at(2026, 11, 20, 21, 0));
        assertEquals("Today: Legs ✓", l[0]);
        assertEquals("no food logged yet · Next: Push day", l[1]);
        assertEquals("food", l[2]);
    }

    @Test
    public void nothingLoggedRemindsToLog() throws Exception {
        JSONObject d = day("{\"day\":\"2026-11-20\",\"nf\":0,\"food\":true,\"wOn\":true,\"plan\":{\"2026-11-21\":{\"w\":\"Legs\",\"kt\":2200}}}");
        String[] l = Wrap.lines(d, at(2026, 11, 20, 21, 0));
        assertEquals("Nothing logged today", l[0]);
        assertTrue(l[1], l[1].startsWith("Add today's meals before you sleep") && l[1].endsWith("Tomorrow: Legs."));
        assertEquals("food", l[2]);
        // the app was last opened yesterday: today's numbers are not known, so nothing was logged today
        JSONObject old = day("{\"day\":\"2026-11-19\",\"kcal\":2000,\"nf\":6,\"food\":true,\"wn\":\"Push day\",\"wOn\":true}");
        assertEquals("Nothing logged today", Wrap.lines(old, at(2026, 11, 20, 21, 0))[0]);
        // food logging off and no workout: nothing to say
        assertNull(Wrap.lines(day("{\"day\":\"2026-11-20\",\"nf\":0,\"food\":false,\"wOn\":true}"), at(2026, 11, 20, 21, 0)));
    }

    @Test
    public void dueAtNineUnlessOff() throws Exception {
        long now = at(2026, 11, 20, 13, 0);
        assertEquals(at(2026, 11, 20, 21, 0), Wrap.due(day("{\"wOn\":true}"), now));
        assertEquals(at(2026, 11, 20, 21, 30), Wrap.due(day("{\"wOn\":true,\"wMin\":1290}"), now));
        assertEquals(at(2026, 11, 21, 21, 0), Wrap.due(day("{\"wOn\":true,\"wMin\":1260}"), at(2026, 11, 20, 21, 5)));
        assertEquals(0, Wrap.due(day("{\"wOn\":false}"), now));
        assertEquals(0, Wrap.due(day("{}"), now));
    }

    @Test
    public void sharedPicturesAreSizedAndTurned() {
        assertEquals(1, SharedPhoto.sampleFor(1600, 1200, 1600));
        assertEquals(2, SharedPhoto.sampleFor(4000, 3000, 1600));
        assertEquals(4, SharedPhoto.sampleFor(8000, 6000, 1600));
        assertEquals(1, SharedPhoto.sampleFor(900, 1200, 1600));
        assertEquals(1, SharedPhoto.sampleFor(4000, 3000, 0));
        assertEquals(0, SharedPhoto.degreesFor(ExifInterface.ORIENTATION_NORMAL));
        assertEquals(90, SharedPhoto.degreesFor(ExifInterface.ORIENTATION_ROTATE_90));
        assertEquals(180, SharedPhoto.degreesFor(ExifInterface.ORIENTATION_ROTATE_180));
        assertEquals(270, SharedPhoto.degreesFor(ExifInterface.ORIENTATION_ROTATE_270));
        assertEquals(0, SharedPhoto.degreesFor(ExifInterface.ORIENTATION_UNDEFINED));
    }
}
