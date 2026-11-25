package app.gymday;

import android.content.ContentResolver;
import android.graphics.Bitmap;
import android.graphics.BitmapFactory;
import android.graphics.Matrix;
import android.media.ExifInterface;
import android.net.Uri;
import android.util.Base64;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;

/**
 * v1.27 Share to GymDay: one picture shared from the gallery or another app, made small enough to hand to the page: at most
 * max pixels on its long side, turned the right way up (the camera's EXIF orientation), as a JPEG data URL. null when it
 * cannot be opened. The page then makes it smaller again, exactly as a picked photo (Food.picsFrom).
 */
final class SharedPhoto {
    private SharedPhoto() {
    }

    /** The largest power of two that keeps the long side at least max after decoding (BitmapFactory's inSampleSize). */
    static int sampleFor(int w, int h, int max) {
        int s = 1, side = Math.max(w, h);
        if (max <= 0) return 1;
        while (side / (s * 2) >= max) s *= 2;
        return s;
    }

    /** How far to turn a picture for its EXIF orientation: 0, 90, 180 or 270 degrees. */
    static int degreesFor(int orientation) {
        switch (orientation) {
            case ExifInterface.ORIENTATION_ROTATE_90:
            case ExifInterface.ORIENTATION_TRANSPOSE:
                return 90;
            case ExifInterface.ORIENTATION_ROTATE_180:
                return 180;
            case ExifInterface.ORIENTATION_ROTATE_270:
            case ExifInterface.ORIENTATION_TRANSVERSE:
                return 270;
            default:
                return 0;
        }
    }

    static String dataUrl(ContentResolver cr, Uri u, int max) {
        try {
            BitmapFactory.Options o = new BitmapFactory.Options();
            o.inJustDecodeBounds = true;
            try (InputStream in = cr.openInputStream(u)) {
                if (in == null) return null;
                BitmapFactory.decodeStream(in, null, o);
            }
            if (o.outWidth <= 0 || o.outHeight <= 0) return null;
            BitmapFactory.Options o2 = new BitmapFactory.Options();
            o2.inSampleSize = sampleFor(o.outWidth, o.outHeight, max);
            Bitmap b;
            try (InputStream in = cr.openInputStream(u)) {
                if (in == null) return null;
                b = BitmapFactory.decodeStream(in, null, o2);
            }
            if (b == null) return null;
            int deg = 0;
            try (InputStream in = cr.openInputStream(u)) {
                if (in != null) deg = degreesFor(new ExifInterface(in).getAttributeInt(ExifInterface.TAG_ORIENTATION, ExifInterface.ORIENTATION_NORMAL));
            } catch (Exception ignored) {
            }
            float k = Math.min(1f, (float) max / Math.max(b.getWidth(), b.getHeight()));
            Bitmap r = b;
            if (k < 1f || deg != 0) {
                Matrix m = new Matrix();
                if (k < 1f) m.postScale(k, k);
                if (deg != 0) m.postRotate(deg);
                r = Bitmap.createBitmap(b, 0, 0, b.getWidth(), b.getHeight(), m, true);
            }
            ByteArrayOutputStream bo = new ByteArrayOutputStream();
            r.compress(Bitmap.CompressFormat.JPEG, 85, bo);
            return "data:image/jpeg;base64," + Base64.encodeToString(bo.toByteArray(), Base64.NO_WRAP);
        } catch (Exception | OutOfMemoryError e) {
            return null;
        }
    }
}
