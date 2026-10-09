import { createClient } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";

/** The only Google account allowed to use this app. */
export const OWNER_EMAIL = "jyotikrishna667@gmail.com";
/** Deep-link scheme used to return from Google sign-in inside the Android app. */
export const NATIVE_SCHEME = "com.mira.sweetheart";

const url = import.meta.env["VITE_SUPABASE_URL"] as string | undefined;
const key = import.meta.env["VITE_SUPABASE_PUBLISHABLE_KEY"] as string | undefined;

export const supabaseConfigured = Boolean(url && key);
export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

// Placeholders keep server rendering alive if the env vars are missing; the login screen shows a clear message instead.
export const supabase = createClient(url || "http://localhost:54321", key || "missing-key", {
  auth: {
    flowType: "pkce",
    persistSession: typeof window !== "undefined",
    autoRefreshToken: typeof window !== "undefined",
    detectSessionInUrl: typeof window !== "undefined" && !Capacitor.isNativePlatform(),
  },
});

/** fetch() that sends the signed-in user's token so the server can verify it. */
export async function authedFetch(input: string, init: RequestInit = {}) {
  const { data } = await supabase.auth.getSession();
  const headers = new Headers(init.headers);
  if (data.session) headers.set("Authorization", `Bearer ${data.session.access_token}`);
  return fetch(input, { ...init, headers });
}
