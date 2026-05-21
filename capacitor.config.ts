import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.elkavio.assetflow',
  appName: 'AssetFlow',
  webDir: 'public',
  server: {
    url: 'https://assetflow.elkavio.com',
    cleartext: false,
  },
  android: {
    allowMixedContent: false,
    // Transparent — lets the activity's windowBackground (the landing PNG)
    // show through until React paints. Otherwise an opaque WebView covers
    // the landing artwork and the user only sees a plain brand-colour
    // frame between the system splash dismissing and SplashOverlay
    // mounting.  WebView still renders content on top normally; it's only
    // the empty-WebView phase that's now see-through.
    backgroundColor: '#00000000',
  },
};

export default config;
