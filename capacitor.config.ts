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
  },
};

export default config;
