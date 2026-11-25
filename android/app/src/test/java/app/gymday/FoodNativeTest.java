package app.gymday;

import static org.junit.Assert.assertEquals;
import static org.junit.Assert.assertNotNull;
import static org.junit.Assert.assertNull;
import static org.junit.Assert.assertTrue;
import static org.robolectric.Shadows.shadowOf;

import android.content.Intent;
import android.content.pm.ProviderInfo;
import android.content.pm.PackageManager;
import android.content.ComponentName;
import android.net.Uri;
import android.provider.MediaStore;
import android.view.ViewGroup;
import android.webkit.WebView;

import org.junit.Test;
import org.junit.runner.RunWith;
import org.robolectric.Robolectric;
import org.robolectric.RobolectricTestRunner;
import org.robolectric.RuntimeEnvironment;
import org.robolectric.annotation.Config;
import org.robolectric.shadows.ShadowLooper;

/**
 * v1.8: the barcode on a packet (only product numbers get through), the page's call to scan when Play services
 * is not there (the page is told, so it can offer typing the number), closing the phone's keyboard for GymDay's
 * own number pad, and the camera photo for a packet's label (shared through the app's FileProvider).
 */
@RunWith(RobolectricTestRunner.class)
@Config(sdk = {26, 34, 36})
public class FoodNativeTest {

    @Test
    public void onlyProductNumbersCountAsABarcode() {
        assertEquals("8901058851434", BarcodeScan.clean("8901058851434"));
        assertEquals("12345678", BarcodeScan.clean(" 1234-5678 "));
        assertNull("too short", BarcodeScan.clean("12345"));
        assertNull("too long", BarcodeScan.clean("123456789012345"));
        assertNull("a web link is not a product", BarcodeScan.clean("https://example.com"));
        assertNull(BarcodeScan.clean(null));
        assertNotNull(BarcodeScan.options());
    }

    @Test
    public void scanningWithoutPlayServicesTellsThePage() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        SmokeTestCalls.call(a, "scanBarcode", "food");
        ShadowLooper.idleMainLooper();
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        String js = shadowOf(web).getLastEvaluatedJavascript();
        assertNotNull(js);
        assertTrue(js, js.startsWith("window.onBarcode&&window.onBarcode(\"food\","));
        assertTrue(js, js.endsWith(",\"unavailable\")") || js.contains("\"cancelled\"") || js.contains("\"not_product\"") || js.matches(".*\"\\d{6,14}\",null\\)$"));
    }

    @Test
    public void hideKeyboardIsSafeToCall() throws Exception {
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().start().resume().get();
        SmokeTestCalls.call(a, "hideKeyboard");
        ShadowLooper.idleMainLooper();
    }

    @Test
    public void cameraPhotosAreSharedThroughTheAppsOwnProvider() throws Exception {
        PackageManager pm = RuntimeEnvironment.getApplication().getPackageManager();
        String pkg = RuntimeEnvironment.getApplication().getPackageName();
        ProviderInfo p = pm.getProviderInfo(new ComponentName(pkg, "androidx.core.content.FileProvider"), PackageManager.GET_META_DATA);
        assertEquals(pkg + ".files", p.authority);
        assertTrue("not open to other apps", !p.exported);
        assertTrue(p.grantUriPermissions);
        // the camera app gets a place in the app's cache to put the photo
        java.lang.reflect.Method m = MainActivity.class.getDeclaredMethod("cameraIntent");
        m.setAccessible(true);
        MainActivity a = Robolectric.buildActivity(MainActivity.class).create().get();
        shadowOf(pm).addResolveInfoForIntent(new Intent(MediaStore.ACTION_IMAGE_CAPTURE), new android.content.pm.ResolveInfo() {{
            activityInfo = new android.content.pm.ActivityInfo(); activityInfo.packageName = "com.example.camera"; activityInfo.name = "Camera"; }});
        Intent i = (Intent) m.invoke(a);
        assertNotNull("a camera app is there", i);
        Uri out = i.getParcelableExtra(MediaStore.EXTRA_OUTPUT);
        assertNotNull(out);
        assertEquals("content", out.getScheme());
        assertEquals(pkg + ".files", out.getAuthority());
        assertTrue(out.getPath(), out.getPath().startsWith("/camera/shot-"));
    }
}
