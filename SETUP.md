# Mira: setup (Supabase login + cloud chats + Android APK)

## 0. Install locally (once)
Use `npm install --legacy-peer-deps` (plain `npm i` fails on this project). You can delete `bun.lock`.

## 1. Supabase (login + permanent chat storage)
1. supabase.com -> New project (free plan is fine).
2. SQL Editor -> paste all of `supabase/migrations/001_mira.sql` -> Run.
3. Project Settings -> API: copy the **Project URL** and the **publishable (anon) key**.

## 2. Google sign-in
1. console.cloud.google.com -> new project -> APIs & Services -> OAuth consent screen (External; add `jyotikrishna667@gmail.com` as a test user).
2. Credentials -> Create credentials -> OAuth client ID -> **Web application**.
   Authorized redirect URI: `https://YOUR-PROJECT.supabase.co/auth/v1/callback`.
3. Copy the Client ID and Client secret.
4. Supabase -> Authentication -> Providers -> Google -> enable, paste both.
5. Supabase -> Authentication -> URL Configuration:
   - Site URL: your deployed address (step 4 below)
   - Redirect URLs: add your deployed address AND `com.mira.sweetheart://auth-callback`

## 3. AI key (free option)
aistudio.google.com -> Get API key. (Any OpenAI-compatible provider also works via `AI_BASE_URL` / `AI_MODEL`; see `.env.example`.)

## 4. Deploy the website (needed: the app's AI routes run on a server)
Use Vercel (the Cloudflare free plan rejects this app because the server bundle is too big).
1. vercel.com -> Add New -> Project -> import the GitHub repo.
2. Install Command: `npm install --legacy-peer-deps`
3. Environment Variables: everything in `.env.example` (including `NITRO_PRESET=vercel`).
4. Deploy. Open the address, sign in with Google, and check the "Mira - The Beginning" chat appears.
5. Put the real address into Supabase Site URL / Redirect URLs (step 2.5).

## 5. Build the APK (GitHub Actions)
1. GitHub repo -> Settings -> Secrets and variables -> Actions -> New secret: `MIRA_APP_URL` = your Vercel address (e.g. `https://mira-xyz.vercel.app`).
2. Actions tab -> "Build Android APK" -> Run workflow.
3. When it finishes, download the `mira-apk` artifact, unzip, install `app-debug.apk` on your phone (allow "install unknown apps").
The APK opens your deployed site, so web updates reach the phone without rebuilding.

## How your chats stay safe
- Every message is saved to Supabase a moment after it is sent and when you leave the app.
- Clearing app data, reinstalling or a new phone: sign in with Google and the full history is pulled back.
- Only `jyotikrishna667@gmail.com` can sign up, read or write (enforced in the database too).
- The first login adds "Mira - The Beginning" (pinned) once; it is never re-added after you delete it.
