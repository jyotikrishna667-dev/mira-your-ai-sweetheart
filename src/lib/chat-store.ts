// Browser-only storage for chats (IndexedDB — room for photos), with graceful fallbacks.
export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs (uploaded or generated)
  generated?: boolean;
  media?: { kind: string; style: "illustration" | "realistic"; desc: string };
};
export type Chat = { id: string; title: string; pinned?: boolean; createdAt: number; updatedAt: number; messages: Msg[] };

const DB = "mira-db";
const STORE = "kv";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function loadChats(): Promise<Chat[] | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get("chats");
    r.onsuccess = () => resolve((r.result as Chat[] | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}

export async function saveChats(chats: Chat[]): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(chats, "chats");
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** Resize to max 1024px and re-encode as JPEG. */
export function compressImage(src: string | File, max = 1024, quality = 0.85): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = typeof src === "string" ? src : URL.createObjectURL(src);
    img.onload = () => {
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const c = document.createElement("canvas");
      c.width = Math.round(img.width * scale);
      c.height = Math.round(img.height * scale);
      c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
      if (typeof src !== "string") URL.revokeObjectURL(url);
      resolve(c.toDataURL("image/jpeg", quality));
    };
    img.onerror = () => reject(new Error("That file doesn't look like a picture."));
    img.src = url;
  });
}

export function groupLabel(ts: number): "Today" | "Yesterday" | "Previous Days" {
  const d = new Date(ts);
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  if (d.getTime() >= start) return "Today";
  if (d.getTime() >= start - 86400000) return "Yesterday";
  return "Previous Days";
}


/* ---------- Mira's world ---------- */
export type Media = { kind: string; style: "illustration" | "realistic"; desc: string };
export type MediaJob = Media & { withMira: boolean; caption: string; fresh: boolean };
export type DiaryJob = { lines: string[]; caption: string };

async function kvGet<T>(key: string): Promise<T | null> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const r = db.transaction(STORE).objectStore(STORE).get(key);
    r.onsuccess = () => resolve((r.result as T | undefined) ?? null);
    r.onerror = () => reject(r.error);
  });
}
async function kvSet(key: string, value: unknown): Promise<void> {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}
export const getWorldRef = (name: string) => kvGet<string>(`world.${name}`).catch(() => null);
export const setWorldRef = (name: string, img: string) => kvSet(`world.${name}`, img).catch(() => {});

const field = (body: string, name: string) =>
  body.match(new RegExp(`${name}\\s*=\\s*([\\s\\S]*?)(?=;\\s*[a-z_]+\\s*=|$)`, "i"))?.[1]?.trim() ?? "";

/** Removes hidden tags (also half-streamed ones) from what's shown. */
export function cleanReply(t: string) {
  return t
    .replace(/\[MEDIA[\s\S]*?\]/gi, "")
    .replace(/\[DIARY[\s\S]*?\[\/DIARY\]/gi, "")
    .replace(/\[(MEDIA|DIARY)[\s\S]*$/i, "")
    .replace(/\[[A-Z]{0,6}$/, "")
    .trim();
}

export function parseTags(t: string, userText: string): { media: MediaJob | null; diary: DiaryJob | null } {
  let media: MediaJob | null = null;
  let diary: DiaryJob | null = null;
  const m = t.match(/\[MEDIA([\s\S]*?)\]/i);
  if (m) {
    const b = m[1] ?? "";
    const wantsReal = /\b(real|realistic)\b/i.test(userText);
    media = {
      style: wantsReal || /realistic/i.test(field(b, "style")) ? "realistic" : "illustration",
      kind: (field(b, "type") || "photo").toLowerCase().split(/\s+/)[0]!,
      withMira: /yes/i.test(field(b, "with_mira")),
      desc: field(b, "parameters") || userText,
      caption: field(b, "caption"),
      fresh: /\bnew\b|\bnayi\b|\bnaya\b|\bangle\b/i.test(userText),
    };
  }
  const d = t.match(/\[DIARY([^\]]*)\]([\s\S]*?)\[\/DIARY\]/i);
  if (d) {
    const lines = (d[2] ?? "").split("\n").map((l) => l.trim()).filter(Boolean).slice(0, 10);
    if (lines.length) diary = { lines, caption: field(d[1] ?? "", "caption") };
  }
  return { media, diary };
}

export const ROOMISH = /room|bedroom|desk|window|balcony|bed/i;

/** Renders a handwritten diary page on a canvas. */
export async function renderDiary(lines: string[]): Promise<string> {
  try {
    await Promise.all([document.fonts.load('600 40px "Caveat"'), document.fonts.load('600 40px "Caveat"', "हि")]);
  } catch { /* falls back */ }
  const W = 900, H = 1100;
  const c = document.createElement("canvas");
  c.width = W; c.height = H;
  const g = c.getContext("2d")!;
  // desk
  const desk = g.createLinearGradient(0, 0, W, H);
  desk.addColorStop(0, "#3b2a3f"); desk.addColorStop(1, "#24182b");
  g.fillStyle = desk; g.fillRect(0, 0, W, H);
  // cup corner
  g.fillStyle = "#f3e6ea"; g.beginPath(); g.arc(W - 40, 60, 110, 0, Math.PI * 2); g.fill();
  g.fillStyle = "#8a5a44"; g.beginPath(); g.arc(W - 40, 60, 85, 0, Math.PI * 2); g.fill();
  // paper
  g.save();
  g.translate(W / 2, H / 2 + 10);
  g.rotate(((Math.random() * 2 - 1) * 2.2 * Math.PI) / 180);
  const pw = 700, ph = 900;
  g.shadowColor = "rgba(0,0,0,.45)"; g.shadowBlur = 30; g.shadowOffsetY = 12;
  g.fillStyle = "#fdf6ec"; g.fillRect(-pw / 2, -ph / 2, pw, ph);
  g.shadowColor = "transparent";
  for (let i = 0; i < 1800; i++) { // paper grain
    g.fillStyle = `rgba(120,90,60,${Math.random() * 0.05})`;
    g.fillRect(-pw / 2 + Math.random() * pw, -ph / 2 + Math.random() * ph, 2, 2);
  }
  g.strokeStyle = "rgba(120,150,210,.35)"; g.lineWidth = 2;
  for (let y = -ph / 2 + 150; y < ph / 2 - 30; y += 62) { g.beginPath(); g.moveTo(-pw / 2 + 30, y); g.lineTo(pw / 2 - 30, y); g.stroke(); }
  g.strokeStyle = "rgba(230,110,140,.5)"; g.beginPath(); g.moveTo(-pw / 2 + 90, -ph / 2); g.lineTo(-pw / 2 + 90, ph / 2); g.stroke();
  // date
  g.fillStyle = "#6b4b7a"; g.font = '600 40px "Caveat", cursive';
  g.fillText(new Date().toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }), pw / 2 - 260, -ph / 2 + 100);
  // text with wrapping
  g.fillStyle = "#3b2a55"; g.font = '600 44px "Caveat", cursive';
  let y = -ph / 2 + 200;
  const maxW = pw - 150;
  for (const line of lines) {
    let cur = "";
    for (const w of line.split(" ")) {
      const t = cur ? cur + " " + w : w;
      if (g.measureText(t).width > maxW && cur) { g.fillText(cur, -pw / 2 + 110, y); y += 62; cur = w; } else cur = t;
    }
    if (cur) { g.fillText(cur, -pw / 2 + 110, y); y += 62; }
    if (y > ph / 2 - 60) break;
  }
  // heart doodle sticker
  g.fillStyle = "#ec6f95"; g.font = "64px serif"; g.fillText("♡", pw / 2 - 110, ph / 2 - 50);
  g.restore();
  // pen corner
  g.save(); g.translate(20, H - 30); g.rotate(-0.2);
  g.fillStyle = "#b07ad6"; g.fillRect(0, 0, 300, 26);
  g.fillStyle = "#e8d6f5"; g.fillRect(300, 4, 30, 18);
  g.restore();
  return c.toDataURL("image/jpeg", 0.88);
}

const QKEY = "mira.quota.v1";
export function quotaLeft(max: number) {
  try {
    const q = JSON.parse(localStorage.getItem(QKEY) || "[]") as number[];
    return max - q.filter((t) => Date.now() - t < 86400000).length;
  } catch { return max; }
}
export function spendQuota() {
  try {
    const q = (JSON.parse(localStorage.getItem(QKEY) || "[]") as number[]).filter((t) => Date.now() - t < 86400000);
    q.push(Date.now());
    localStorage.setItem(QKEY, JSON.stringify(q));
  } catch { /* ignore */ }
}
