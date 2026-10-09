const OWNER_EMAIL = "jyotikrishna667@gmail.com";

/** Returns null when the request carries a valid Supabase session for the owner, otherwise an error Response. */
export async function requireOwner(request: Request): Promise<Response | null> {
  const url = process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"] ?? process.env["VITE_SUPABASE_PUBLISHABLE_KEY"];
  if (!url || !key) return Response.json({ error: "Server isn't configured (missing Supabase keys)." }, { status: 500 });
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!token) return Response.json({ error: "Please sign in again." }, { status: 401 });
  const res = await fetch(`${url}/auth/v1/user`, { headers: { apikey: key, Authorization: `Bearer ${token}` } }).catch(() => null);
  if (!res || !res.ok) return Response.json({ error: "Your session expired. Please sign in again." }, { status: 401 });
  const user = (await res.json()) as { email?: string };
  if (user.email?.toLowerCase() !== OWNER_EMAIL) return Response.json({ error: "This app is private." }, { status: 403 });
  return null;
}
