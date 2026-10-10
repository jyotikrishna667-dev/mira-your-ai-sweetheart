// Browser-only storage for chats (IndexedDB — room for photos), with graceful fallbacks.
export type Msg = {
  id: string;
  role: "user" | "assistant";
  content: string;
  images?: string[]; // data URLs (uploaded or generated)
  generated?: boolean;
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

const IMG_RE =
  /\b(draw|paint|sketch|generate|create|make|send|show)\b[^.?!]{0,40}\b(image|picture|pic|photo|drawing|painting|art|illustration|wallpaper|selfie)\b|\b(tasveer|tasvir|photo|pic|image)\b[^.?!]{0,20}\b(bana|banao|banado|bnao|bhejo)\b/i;
export const wantsImage = (t: string) => IMG_RE.test(t);
