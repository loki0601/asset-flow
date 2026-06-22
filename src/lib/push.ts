/**
 * Capacitor push-notifications wiring. Runs only on the native Android
 * WebView (no-op on plain web). Asks for permission once, fetches the FCM
 * registration token, and POSTs it to /api/fcm/register-token so the
 * server can target this device.
 *
 * Incoming messages are surfaced as console events for now — the server
 * will use payload.data.action='syncPrices' later to trigger the daily
 * price sync without the user opening the app.
 */

import { Capacitor } from '@capacitor/core';

const REGISTERED_KEY = 'assetflow:fcm:registeredToken';

export async function initPush(): Promise<void> {
  if (Capacitor.getPlatform() !== 'android') return;

  const { PushNotifications } = await import('@capacitor/push-notifications');

  const perm = await PushNotifications.checkPermissions();
  let granted = perm.receive === 'granted';
  if (!granted) {
    const req = await PushNotifications.requestPermissions();
    granted = req.receive === 'granted';
  }
  if (!granted) {
    console.warn('[push] permission denied');
    return;
  }

  PushNotifications.addListener('registration', (token) => {
    void registerToken(token.value);
  });

  PushNotifications.addListener('registrationError', (err) => {
    console.warn('[push] registration error', err);
  });

  PushNotifications.addListener('pushNotificationReceived', (n) => {
    console.info('[push] received', n);
    const action = (n.data as Record<string, unknown> | undefined)?.action;
    if (action === 'syncPrices') {
      window.dispatchEvent(new CustomEvent('assetflow:fcm-sync-prices'));
    }
  });

  PushNotifications.addListener('pushNotificationActionPerformed', (a) => {
    console.info('[push] tapped', a);
    const action = (a.notification?.data as Record<string, unknown> | undefined)?.action;
    if (action === 'insights') {
      // Route the tap to the Insights tab. Hard navigation is fine — the
      // WebView is (re)entering the app from a background/cold tap.
      window.location.assign('/insights');
    }
  });

  await PushNotifications.register();
}

async function registerToken(token: string): Promise<void> {
  try {
    const last = typeof localStorage !== 'undefined' ? localStorage.getItem(REGISTERED_KEY) : null;
    if (last === token) return; // already registered
    const res = await fetch('/api/fcm/register-token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ token, platform: 'android' }),
    });
    if (res.ok) {
      localStorage.setItem(REGISTERED_KEY, token);
      console.info('[push] token registered');
    } else {
      console.warn('[push] register failed', res.status);
    }
  } catch (err) {
    console.warn('[push] register error', err);
  }
}
