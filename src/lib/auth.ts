import { useEffect, useState } from "react";
import type { User } from "@supabase/supabase-js";
import { Capacitor } from "@capacitor/core";
import { supabase, supabaseConfigured, isNative, OWNER_EMAIL, NATIVE_SCHEME } from "./supabase";

export type AuthState = { status: "loading" | "signedOut" | "signedIn"; user: User | null; error: string | null };

let nativeListenerReady = false;
async function setupNativeListener(setError: (e: string | null) => void) {
  if (nativeListenerReady || !Capacitor.isNativePlatform()) return;
  nativeListenerReady = true;
  const { App } = await import("@capacitor/app");
  const { Browser } = await import("@capacitor/browser");
  await App.addListener("appUrlOpen", async ({ url }) => {
    if (!url.startsWith(`${NATIVE_SCHEME}://`)) return;
    const parsed = new URL(url);
    const code = parsed.searchParams.get("code");
    await Browser.close().catch(() => {});
    if (!code) { setError(parsed.searchParams.get("error_description") || "Google sign-in was cancelled."); return; }
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) setError(error.message);
  });
}

export async function signInWithGoogle() {
  if (isNative()) {
    const { data, error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${NATIVE_SCHEME}://auth-callback`, skipBrowserRedirect: true, queryParams: { prompt: "select_account", login_hint: OWNER_EMAIL } },
    });
    if (error || !data.url) throw error ?? new Error("Couldn't start Google sign-in.");
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({ url: data.url });
    return;
  }
  const { error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: window.location.origin, queryParams: { prompt: "select_account", login_hint: OWNER_EMAIL } },
  });
  if (error) throw error;
}

export const signOut = () => supabase.auth.signOut();

export function useAuth(): AuthState {
  const [state, setState] = useState<AuthState>({ status: "loading", user: null, error: null });
  useEffect(() => {
    if (!supabaseConfigured) { setState({ status: "signedOut", user: null, error: "Cloud login isn't set up yet (missing Supabase keys)." }); return; }
    const setError = (error: string | null) => setState(s => ({ ...s, error }));
    void setupNativeListener(setError);
    const apply = async (user: User | null) => {
      if (user && user.email?.toLowerCase() !== OWNER_EMAIL) {
        await supabase.auth.signOut();
        setState({ status: "signedOut", user: null, error: "This Mira app is private. Please sign in with the owner's Google account." });
      } else setState({ status: user ? "signedIn" : "signedOut", user, error: null });
    };
    void supabase.auth.getSession().then(({ data }) => apply(data.session?.user ?? null));
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { void apply(session?.user ?? null); });
    return () => data.subscription.unsubscribe();
  }, []);
  return state;
}
