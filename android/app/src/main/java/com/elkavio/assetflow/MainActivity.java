package com.elkavio.assetflow;

import android.content.SharedPreferences;
import android.os.Bundle;
import androidx.appcompat.app.AppCompatDelegate;
import com.getcapacitor.BridgeActivity;

/**
 * Forces the app's uiMode to follow the user's saved in-app theme
 * preference BEFORE the activity decides which resource set to use.
 *
 * The preference is written from JavaScript via @capacitor/preferences,
 * which stores it in SharedPreferences("CapacitorStorage").  By reading
 * it here in onCreate (before super.onCreate) we make Android pick the
 * -night drawables/values when the user chose dark, and the default
 * (non-night) variant when they chose light — independent of the
 * device's system dark-mode toggle.
 *
 * Without this hook, the system dark-mode flag controlled splash colour
 * and the in-app theme could diverge: a light-theme user with system
 * dark mode on would see a dark splash flash before the light dashboard.
 */
public class MainActivity extends BridgeActivity {
    @Override
    public void onCreate(Bundle savedInstanceState) {
        SharedPreferences prefs = getSharedPreferences("CapacitorStorage", MODE_PRIVATE);
        String theme = prefs.getString("assetflow-theme", null);
        if ("dark".equals(theme)) {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_YES);
        } else if ("light".equals(theme)) {
            AppCompatDelegate.setDefaultNightMode(AppCompatDelegate.MODE_NIGHT_NO);
        } else {
            // No saved preference yet — let the system decide.  First-run
            // users see the splash that matches their system setting.
            AppCompatDelegate.setDefaultNightMode(
                AppCompatDelegate.MODE_NIGHT_FOLLOW_SYSTEM);
        }
        super.onCreate(savedInstanceState);
    }
}
