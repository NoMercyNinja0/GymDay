package app.gymday;

import android.app.Activity;

import com.google.android.gms.common.moduleinstall.ModuleInstall;
import com.google.android.gms.common.moduleinstall.ModuleInstallRequest;
import com.google.mlkit.common.MlKitException;
import com.google.mlkit.vision.barcode.common.Barcode;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanner;
import com.google.mlkit.vision.codescanner.GmsBarcodeScannerOptions;
import com.google.mlkit.vision.codescanner.GmsBarcodeScanning;

/**
 * The barcode on a food or supplement packet, read with Google Play services' own scanner screen.
 * GymDay needs no camera permission for it: Play services shows the camera and hands back only the number.
 * The first time, Play services may still have to download the scanner: the scan then fails with "downloading",
 * the download is asked for, and the page offers to type the number until it is there.
 */
final class BarcodeScan {
    interface Done { void done(String code, String error); }

    private BarcodeScan() { }

    /** Only the formats printed on food packets: EAN-13/8 and UPC-A/E (and Code 128, used by some shops). */
    static GmsBarcodeScannerOptions options() {
        return new GmsBarcodeScannerOptions.Builder()
                .setBarcodeFormats(Barcode.FORMAT_EAN_13, Barcode.FORMAT_EAN_8, Barcode.FORMAT_UPC_A, Barcode.FORMAT_UPC_E, Barcode.FORMAT_CODE_128)
                .enableAutoZoom()
                .build();
    }

    /** Digits only, 6 to 14 of them: anything else is not a product barcode. */
    static String clean(String raw) {
        if (raw == null) return null;
        String d = raw.replaceAll("[^0-9]", "");
        return d.length() >= 6 && d.length() <= 14 ? d : null;
    }

    static void start(Activity a, Done done) {
        try {
            GmsBarcodeScanner scanner = GmsBarcodeScanning.getClient(a, options());
            scanner.startScan()
                    .addOnSuccessListener(b -> {
                        String code = clean(b == null ? null : b.getRawValue());
                        done.done(code, code == null ? "not_product" : null);
                    })
                    .addOnCanceledListener(() -> done.done(null, "cancelled"))
                    .addOnFailureListener(e -> {
                        // the scanner itself is not on the phone yet: ask Play services to fetch it, and say so
                        if (e instanceof MlKitException && ((MlKitException) e).getErrorCode() == MlKitException.UNAVAILABLE) {
                            try {
                                ModuleInstall.getClient(a).installModules(ModuleInstallRequest.newBuilder().addApi(scanner).build());
                            } catch (Throwable ignored) { }
                            done.done(null, "downloading");
                        } else done.done(null, "unavailable");
                    });
        } catch (Throwable t) {          // no Play services on this phone
            done.done(null, "unavailable");
        }
    }
}
