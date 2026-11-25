package app.gymday;

import static org.junit.Assert.assertEquals;

import android.view.ViewGroup;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;

/**
 * v1.21: GymDay's text follows the phone's font size. The page asks the bridge for it (fontScale) and scales its own text;
 * the WebView's text zoom stays at 100%, so nothing is scaled twice.
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class V121NativeTest {
    private static float scaleAt(float phone) throws Exception {
        RuntimeEnvironment.setFontScale(phone);
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        assertEquals("the WebView never scales the text itself", 100, web.getSettings().getTextZoom());
        return ((Number) SmokeTestCalls.call(a, "fontScale")).floatValue();
    }

    @Test
    public void normalTextIsOne() throws Exception {
        assertEquals(1f, scaleAt(1f), 0.001f);
    }

    @Test
    public void biggerTextOnThePhoneIsPassedOn() throws Exception {
        assertEquals(1.3f, scaleAt(1.3f), 0.001f);
        assertEquals(2f, scaleAt(2f), 0.001f);        // the page itself stops at 160%
    }
}
