package app.gymday;

import static org.junit.Assert.assertArrayEquals;
import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertTrue;

import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebView;
import android.widget.FrameLayout;

import androidx.core.graphics.Insets;
import androidx.core.view.WindowInsetsCompat;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.annotation.Config;

/**
 * 1.30, ready for Google Play (made for Android 16): the page sits in a frame padded clear of the bars, a camera cut-out and the
 * keyboard (Android 15+ draws every app edge to edge), and the back gesture reaches the page through Android 13+'s back callback
 * (Android 16 no longer calls onBackPressed for apps made for it).
 */
@RunWith(RobolectricTestRunner.class)
public class V130NativeTest {

    @Test
    @Config(sdk = {30, 34, 36})
    public void padKeepsThePageClearOfBarsCutOutAndKeyboard() {
        WindowInsetsCompat bars = new WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 80, 0, 0))
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 48))
                .build();
        assertArrayEquals(new int[]{0, 80, 0, 48}, MainActivity.padFor(bars));

        WindowInsetsCompat typing = new WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.statusBars(), Insets.of(0, 80, 0, 0))
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 0, 48))
                .setInsets(WindowInsetsCompat.Type.ime(), Insets.of(0, 0, 0, 900))
                .build();
        assertArrayEquals("the keyboard, not the button bar, sets the bottom while typing", new int[]{0, 80, 0, 900}, MainActivity.padFor(typing));

        WindowInsetsCompat sideways = new WindowInsetsCompat.Builder()
                .setInsets(WindowInsetsCompat.Type.displayCutout(), Insets.of(110, 0, 0, 0))
                .setInsets(WindowInsetsCompat.Type.navigationBars(), Insets.of(0, 0, 130, 0))
                .build();
        assertArrayEquals("turned sideways: the cut-out on one side, the button bar on the other", new int[]{110, 0, 130, 0}, MainActivity.padFor(sideways));
    }

    @Test
    @Config(sdk = {26, 33, 36})
    public void thePageSitsInsideTheFrame() {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        View root = ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0);
        assertTrue("the content is the frame", root instanceof FrameLayout);
        assertEquals(1, ((FrameLayout) root).getChildCount());
        assertTrue("the page is inside it", ((FrameLayout) root).getChildAt(0) instanceof WebView);
    }

    @Test
    @Config(sdk = {33, 36})
    public void backIsHandledThroughTheCallback() throws Exception {
        String manifest = new String(java.nio.file.Files.readAllBytes(java.nio.file.Paths.get("src/main/AndroidManifest.xml")), java.nio.charset.StandardCharsets.UTF_8);
        assertTrue("the manifest turns the back callback on", manifest.contains("android:enableOnBackInvokedCallback=\"true\""));
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        java.lang.reflect.Field f = MainActivity.class.getDeclaredField("backCb");
        f.setAccessible(true);
        assertNotNull("a back callback is registered", f.get(a));
        a.goBack();         // reaches the page (no page answers here, so it would go to the background): no crash
    }
}
