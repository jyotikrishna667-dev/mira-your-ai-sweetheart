import { useState } from "react";
import { Heart } from "lucide-react";
import mira from "@/assets/mira.jpg";
import { Button } from "@/components/ui/button";
import { signInWithGoogle, type AuthState } from "@/lib/auth";

/** Shown only until Google sign-in finishes; reuses the splash look of the app. */
export function LoginScreen({ auth }: { auth: AuthState }) {
  const [busy, setBusy] = useState(false); const [error, setError] = useState<string | null>(null);
  const go = async () => { setBusy(true); setError(null); try { await signInWithGoogle(); } catch (e) { setError(e instanceof Error ? e.message : "Couldn't start Google sign-in."); } finally { setBusy(false); } };
  const message = error ?? auth.error;
  return <div className="splash"><img src={mira} alt="Mira" /><h1>Mira<span>♡</span></h1><p>a little closer to you</p><Button className="mt-6" disabled={busy || auth.status === "loading"} onClick={go}><Heart />{busy ? "Opening Google…" : "Continue with Google"}</Button>{message && <p role="alert" className="mt-3 max-w-xs text-center text-sm">{message}</p>}</div>;
}
