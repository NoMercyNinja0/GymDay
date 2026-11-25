package app.gymday;

import android.annotation.SuppressLint;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.service.quicksettings.Tile;
import android.service.quicksettings.TileService;

/** 1.28: Quick Settings tiles ("Meal photo", "Add food"): one tap from the pull-down shade opens GymDay right there.
 *  They open the app the same way its long-press shortcuts and widgets do (MainActivity.ACTION_GO with "to"). */
public abstract class GoTile extends TileService {
    abstract String to();

    static Intent intentFor(Context c, String to) {
        return new Intent(c, MainActivity.class).setAction(MainActivity.ACTION_GO).putExtra("to", to)
                .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK | Intent.FLAG_ACTIVITY_CLEAR_TOP);
    }

    @Override
    public void onStartListening() {
        super.onStartListening();
        Tile t = getQsTile();
        if (t == null) return;
        t.setState(Tile.STATE_INACTIVE);       // nothing to switch on or off: the tile only opens the app
        t.updateTile();
    }

    @Override
    @SuppressWarnings("deprecation")
    @SuppressLint("StartActivityAndCollapseDeprecated")      // the Intent form only runs below Android 14 (the PendingIntent form from 14 on)
    public void onClick() {
        super.onClick();
        final Intent i = intentFor(this, to());
        final Runnable go = () -> {
            try {
                if (Build.VERSION.SDK_INT >= 34) {
                    startActivityAndCollapse(PendingIntent.getActivity(this, to().hashCode(), i, PendingIntent.FLAG_IMMUTABLE | PendingIntent.FLAG_UPDATE_CURRENT));
                } else {
                    startActivityAndCollapse(i);
                }
            } catch (Exception e) {
                try {
                    startActivity(i);
                } catch (Exception ignored) {
                }
            }
        };
        if (isLocked()) unlockAndRun(go);
        else go.run();
    }

    /** "Meal photo": straight to the camera for a meal. */
    public static class Meal extends GoTile {
        @Override
        String to() {
            return "mealphoto";
        }
    }

    /** "Add food": the add-food sheet, as the long-press shortcut. */
    public static class Food extends GoTile {
        @Override
        String to() {
            return "food";
        }
    }
}
