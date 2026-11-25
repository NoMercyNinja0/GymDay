package app.gymday;

import static org.robolectric.Shadows.shadowOf;

import android.view.ViewGroup;
import android.webkit.WebView;

/** Calls a method of the page's bridge (window.Android) the way the page does: by name, with text arguments. */
final class SmokeTestCalls {
    static Object call(MainActivity a, String name, String... args) throws Exception {
        WebView web = (WebView) ((ViewGroup) ((ViewGroup) a.findViewById(android.R.id.content)).getChildAt(0)).getChildAt(0);      // 1.30: the page sits in a frame
        Object bridge = shadowOf(web).getJavascriptInterface("Android");
        Class<?>[] types = new Class<?>[args.length];
        for (int i = 0; i < args.length; i++) types[i] = String.class;
        return bridge.getClass().getMethod(name, types).invoke(bridge, (Object[]) args);
    }
}
