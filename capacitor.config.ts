// Avoid requiring @capacitor/cli types in environments where the
// package isn't installed (e.g. editor typecheck). Provide a minimal
// local fallback type for CapacitorConfig.
type CapacitorConfig = Record<string, any>;

/**
 * Wake2Win — production Capacitor configuration.
 *
 * The Android app is a thin native shell that loads the production
 * deployment, so the APK always runs the latest release without
 * needing a store update. All web code (auth, Supabase, AI, routing)
 * is completely unchanged.
 */
const config: CapacitorConfig = {
  appId: "com.wake2win.app",
  appName: "Wake2Win",

  // Required by the CLI; unused at runtime because `server.url` points
  // at the production site.
  webDir: "public",

  server: {
    url: "https://wake2-win.vercel.app",
    androidScheme: "https",
    cleartext: false,
  },

  android: {
    allowMixedContent: false,
    backgroundColor: "#0b0f1a",
    webContentsDebuggingEnabled: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1600,
      launchAutoHide: true,
      backgroundColor: "#0b0f1a",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      // Matches the app's dark surface (--color-surface: #0b0f1a).
      style: "DARK",
      backgroundColor: "#0b0f1a",
      overlaysWebView: false,
    },
  },
};

export default config;
