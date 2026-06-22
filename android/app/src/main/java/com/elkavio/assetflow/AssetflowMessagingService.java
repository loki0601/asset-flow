package com.elkavio.assetflow;

import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.os.Build;
import android.util.Log;

import androidx.annotation.NonNull;
import androidx.core.app.NotificationCompat;

import com.capacitorjs.plugins.pushnotifications.MessagingService;
import com.google.firebase.messaging.RemoteMessage;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.Map;
import java.util.concurrent.Executors;

/**
 * Replaces the Capacitor plugin's MessagingService so we can run code on
 * push receipt even when the app is killed / swiped away. Falls back to
 * super.onMessageReceived() so the in-app JS listener still fires when
 * the WebView is alive (foreground).
 *
 * Currently handled actions (data.action key on the FCM payload):
 *   "syncPrices"  — pull /api/prices and write JSON to filesDir so the
 *                   WebView can ingest it on next open without re-fetching.
 *
 * Add new actions in a switch as we expand the push surface.
 */
public class AssetflowMessagingService extends MessagingService {

    private static final String TAG = "AssetflowMS";
    private static final String PENDING_SYNC_FILE = "pending_sync.json";
    private static final String DEFAULT_PRICES_URL =
            "https://assetflow.elkavio.com/api/prices";
    private static final String NOTIFICATION_CHANNEL_ID = "assetflow_default";
    private static final String NOTIFICATION_CHANNEL_NAME = "AssetFlow";

    @Override
    public void onMessageReceived(@NonNull RemoteMessage remoteMessage) {
        Log.i(TAG, "onMessageReceived data=" + remoteMessage.getData());
        Map<String, String> data = remoteMessage.getData();
        String action = data.get("action");
        if ("syncPrices".equals(action)) {
            String url = data.getOrDefault("pricesUrl", DEFAULT_PRICES_URL);
            Executors.newSingleThreadExecutor().execute(() -> doSyncPrices(url));
        }
        String title = data.get("title");
        String body = data.get("body");
        if (title != null || body != null) {
            showNotification(title != null ? title : "AssetFlow", body != null ? body : "", action);
        }
        // Delegate to Capacitor's parent so foreground JS handlers also fire.
        super.onMessageReceived(remoteMessage);
    }

    /** Map a push action to the in-app route its notification should open. */
    private static String routeForAction(String action) {
        if ("insights".equals(action)) return "/insights";
        return null;
    }

    private void showNotification(String title, String body, String action) {
        try {
            NotificationManager nm = getSystemService(NotificationManager.class);
            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O && nm != null) {
                NotificationChannel ch = new NotificationChannel(
                        NOTIFICATION_CHANNEL_ID,
                        NOTIFICATION_CHANNEL_NAME,
                        NotificationManager.IMPORTANCE_DEFAULT);
                nm.createNotificationChannel(ch);
            }
            Intent openApp = new Intent(this, MainActivity.class);
            openApp.setFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
            // Carry the target route so MainActivity can deep-link the WebView
            // to the right tab when the user taps this notification.
            String route = routeForAction(action);
            int requestCode = 0;
            if (route != null) {
                openApp.putExtra("navigateRoute", route);
                requestCode = route.hashCode();
            }
            PendingIntent pending = PendingIntent.getActivity(
                    this, requestCode, openApp,
                    PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);
            NotificationCompat.Builder b = new NotificationCompat.Builder(this, NOTIFICATION_CHANNEL_ID)
                    .setSmallIcon(android.R.drawable.stat_notify_sync)
                    .setContentTitle(title)
                    .setContentText(body)
                    .setAutoCancel(true)
                    .setContentIntent(pending);
            if (nm != null) {
                nm.notify((int) (System.currentTimeMillis() & 0x7fffffff), b.build());
            }
        } catch (Exception e) {
            Log.w(TAG, "showNotification failed", e);
        }
    }

    private void doSyncPrices(String url) {
        HttpURLConnection conn = null;
        try {
            conn = (HttpURLConnection) new URL(url).openConnection();
            conn.setRequestMethod("GET");
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            int code = conn.getResponseCode();
            if (code != 200) {
                Log.w(TAG, "syncPrices HTTP " + code);
                return;
            }
            InputStream in = conn.getInputStream();
            File out = new File(getFilesDir(), PENDING_SYNC_FILE);
            FileOutputStream fos = new FileOutputStream(out);
            byte[] buf = new byte[8192];
            int n;
            int total = 0;
            while ((n = in.read(buf)) > 0) {
                fos.write(buf, 0, n);
                total += n;
            }
            fos.close();
            in.close();
            Log.i(TAG, "syncPrices wrote " + total + "b to " + out.getAbsolutePath());
        } catch (Exception e) {
            Log.e(TAG, "syncPrices failed", e);
        } finally {
            if (conn != null) conn.disconnect();
        }
    }
}
