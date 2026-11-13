/**
 * Capacitor configuration for packaging Ravio (راویو) as a native Android APK.
 *
 * Steps to build an Android APK locally:
 *   1. npm install @capacitor/core @capacitor/cli @capacitor/android
 *   2. npm run build
 *   3. npx cap add android   (first time only)
 *   4. npx cap sync android
 *   5. npx cap open android  (build signed APK in Android Studio)
 */
const config = {
  appId: 'app.ravio.newsradio',
  appName: 'Ravio',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    androidScheme: 'https',
    cleartext: true,
  },
  android: {
    allowMixedContent: true,
    backgroundColor: '#0B0D10',
  },
} as const;

export default config;
