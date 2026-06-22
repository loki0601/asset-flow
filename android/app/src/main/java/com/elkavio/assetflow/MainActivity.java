package com.elkavio.assetflow;

import android.content.Intent;
import android.content.SharedPreferences;
import android.os.Bundle;
import android.webkit.WebView;
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
        handleNavigateIntent(getIntent());
    }

    /** A notification tapped while the app is already running delivers its
     *  intent here instead of onCreate. */
    @Override
    public void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        handleNavigateIntent(intent);
    }

    /**
     * If the launching intent carries a "navigateRoute" extra (set by
     * AssetflowMessagingService when a push notification is tapped), point the
     * WebView at that in-app route. Posted onto the WebView so it runs after
     * the bridge/page is ready on a cold start.
     */
    private void handleNavigateIntent(Intent intent) {
        if (intent == null) return;
        final String route = intent.getStringExtra("navigateRoute");
        if (route == null || route.isEmpty()) return;
        // Consume it so a later config-change/relaunch doesn't re-navigate.
        intent.removeExtra("navigateRoute");
        if (getBridge() == null) return;
        final WebView webView = getBridge().getWebView();
        if (webView == null) return;
        final String js = "window.location.assign(" + jsString(route) + ")";
        webView.postDelayed(() -> webView.evaluateJavascript(js, null), 350);
    }

    /** Minimal JS string literal escaping for the route path. */
    private static String jsString(String s) {
        return "'" + s.replace("\\", "\\\\").replace("'", "\\'") + "'";
    }
}
