import type { CapacitorConfig } from "@capacitor/cli";

// The APK is a thin shell around your deployed website, so the app, its AI routes and the
// cloud login stay identical to the web version and every web update reaches the phone instantly.
const config: CapacitorConfig = {
  appId: "com.mira.sweetheart",
  appName: "Mira",
  webDir: "native-shell",
  server: {
    url: process.env["MIRA_APP_URL"] ?? "https://YOUR-APP.vercel.app",
    cleartext: false,
  },
  android: { allowMixedContent: false },
};
export default config;
