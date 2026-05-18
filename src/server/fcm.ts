/**
 * Firebase Admin SDK initialization for sending FCM messages from the
 * server. Reads the service-account JSON from a path supplied by
 * FIREBASE_ADMIN_KEY_PATH or the project-default `secrets/firebase-admin.json`.
 * Never bundles into the browser — only imported from server-side API routes.
 */

import fs from 'node:fs';
import path from 'node:path';
import admin from 'firebase-admin';

let cached: admin.app.App | null = null;

export function getFirebaseApp(): admin.app.App | null {
  if (cached) return cached;
  const keyPath =
    process.env.FIREBASE_ADMIN_KEY_PATH ||
    path.join(process.cwd(), 'secrets/firebase-admin.json');
  if (!fs.existsSync(keyPath)) {
    console.warn('[fcm] service account not found at', keyPath);
    return null;
  }
  try {
    const sa = JSON.parse(fs.readFileSync(keyPath, 'utf-8')) as admin.ServiceAccount;
    cached = admin.initializeApp({ credential: admin.credential.cert(sa) });
    return cached;
  } catch (err) {
    console.warn('[fcm] init failed', err);
    return null;
  }
}

export interface SendResult {
  successCount: number;
  failureCount: number;
  invalidTokens: string[];
}

/**
 * Send a data-only push to every token. Notification fields (title/body)
 * are stuffed into the `data` payload — including a top-level `notification`
 * object would route the message through FCM's display path and skip our
 * custom MessagingService.onMessageReceived when the app is backgrounded.
 * Our native service shows the notification manually so we keep full
 * control over delivery for every app state.
 *
 * Returns the per-token success/fail counts plus tokens FCM reports as
 * unregistered so callers can prune them.
 */
export async function sendToAll(
  tokens: string[],
  data: Record<string, string>,
  notification?: { title: string; body: string },
): Promise<SendResult> {
  const app = getFirebaseApp();
  if (!app || tokens.length === 0) {
    return { successCount: 0, failureCount: 0, invalidTokens: [] };
  }
  const messaging = app.messaging();
  const fullData = { ...data };
  if (notification?.title) fullData.title = notification.title;
  if (notification?.body) fullData.body = notification.body;
  const message = {
    tokens,
    data: fullData,
    android: { priority: 'high' as const },
  };
  const res = await messaging.sendEachForMulticast(message);
  const invalidTokens: string[] = [];
  res.responses.forEach((r, i) => {
    if (!r.success) {
      const code = r.error?.code ?? '';
      if (
        code === 'messaging/registration-token-not-registered' ||
        code === 'messaging/invalid-argument' ||
        code === 'messaging/invalid-registration-token'
      ) {
        invalidTokens.push(tokens[i]);
      }
    }
  });
  return {
    successCount: res.successCount,
    failureCount: res.failureCount,
    invalidTokens,
  };
}
