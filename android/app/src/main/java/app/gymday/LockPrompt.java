package app.gymday;

import android.annotation.TargetApi;
import android.app.Activity;
import android.hardware.biometrics.BiometricManager;
import android.hardware.biometrics.BiometricPrompt;
import android.os.CancellationSignal;

/** Asks for the fingerprint (or the phone's own PIN / pattern) before GymDay opens. Android 11 or newer only. */
@TargetApi(30)
final class LockPrompt {
    interface Done {
        void result(boolean ok);
    }

    private LockPrompt() {
    }

    static void show(Activity a, final Done done) {
        try {
            BiometricPrompt p = new BiometricPrompt.Builder(a)
                    .setTitle("Unlock GymDay")
                    .setAllowedAuthenticators(BiometricManager.Authenticators.BIOMETRIC_WEAK | BiometricManager.Authenticators.DEVICE_CREDENTIAL)
                    .build();
            p.authenticate(new CancellationSignal(), a.getMainExecutor(), new BiometricPrompt.AuthenticationCallback() {
                @Override
                public void onAuthenticationSucceeded(BiometricPrompt.AuthenticationResult r) {
                    done.result(true);
                }

                @Override
                public void onAuthenticationError(int code, CharSequence msg) {
                    done.result(false);
                }
            });
        } catch (Exception e) {
            done.result(false);
        }
    }
}
