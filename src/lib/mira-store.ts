import { useSyncExternalStore } from "react";
import type { UIMessage } from "ai";

export type ChatMessage = UIMessage & { role: "user" | "assistant"; createdAt: number; delivery?: "sent" | "delivered" | "seen"; reaction?: string; miraReaction?: string };
export type Chat = { id: string; title: string; pinned: boolean; unread: boolean; updatedAt: number; lastSeen: number; messages: ChatMessage[] };
type State = { chats: Chat[]; facts: string[]; ready: boolean; notice: string | null; active: string | null; runs: Record<string, "pause" | "typing" | "streaming">; errors: Record<string, string> };
const KEY = "mira.chats.v2";
const FACTS = "mira.facts.v1";
let state: State = { chats: [], facts: [], ready: false, notice: null, active: null, runs: {}, errors: {} };
const initial = state;
const listeners = new Set<() => void>();
export const uid = () => crypto.randomUUID();
export const textOf = (m: UIMessage) => m.parts.filter(p => p.type === "text").map(p => p.text).join("");
export const imageOf = (m: UIMessage) => m.parts.find(p => p.type === "file")?.url;
function publish(next: State, persist = true) {
  state = next;
  if (persist && state.ready) {
    try { localStorage.setItem(KEY, JSON.stringify({ chats: state.chats, facts: state.facts })); }
    catch { state = { ...state, notice: "Your browser is low on space or saving is blocked. This change is only kept until you close this page. Free some space or delete an older chat." }; }
  }
  listeners.forEach(fn => fn());
}
export function useMira() { return useSyncExternalStore(fn => { listeners.add(fn); return () => listeners.delete(fn); }, () => state, () => initial); }
export const notify = (notice: string | null) => publish({ ...state, notice }, false);
export function newChat(): Chat { const now = Date.now(); return { id: uid(), title: "Mira", pinned: false, unread: false, updatedAt: now, lastSeen: now, messages: [] }; }
export function bootstrap() {
  if (state.ready) return;
  let chats: Chat[] = [], facts: string[] = [], notice: string | null = null;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved) {
      const data = JSON.parse(saved);
      if (!Array.isArray(data.chats) || !Array.isArray(data.facts)) throw new Error("Invalid history");
      chats = data.chats.filter((c: Chat) => typeof c.id === "string" && typeof c.title === "string" && Array.isArray(c.messages)).map((c: Chat) => ({ ...c, messages: c.messages.filter(m => Array.isArray(m.parts) && typeof m.id === "string" && ["user", "assistant"].includes(m.role)) }));
      facts = data.facts.filter((f: unknown) => typeof f === "string");
    } else {
      const old = JSON.parse(localStorage.getItem("mira.messages.v1") || "[]");
      facts = JSON.parse(localStorage.getItem(FACTS) || "[]");
      if (!Array.isArray(facts)) facts = [];
      const chat = newChat();
      if (Array.isArray(old)) chat.messages = old.filter(m => typeof m.content === "string" && ["user", "assistant"].includes(m.role)).map((m, i) => ({ id: m.id || uid(), role: m.role, createdAt: Date.now() - (old.length - i) * 60000, delivery: "seen", parts: [{ type: "text", text: m.content }] }));
      chats = [chat];
    }
  } catch { notice = "Your saved chats couldn't be opened. Your old saved data hasn't been removed; new changes may not be saved."; }
  // No default thread is created when the user has deliberately deleted every chat.
  publish({ ...state, chats, facts, notice, ready: true });
}
export function createChat() { const chat = newChat(); publish({ ...state, chats: [chat, ...state.chats] }); return chat.id; }
export function updateChat(id: string, update: (chat: Chat) => Chat) { publish({ ...state, chats: state.chats.map(c => c.id === id ? update(c) : c) }); }
export function deleteChat(id: string) { publish({ ...state, chats: state.chats.filter(c => c.id !== id) }); }
export function setActive(id: string | null) { publish({ ...state, active: id }, false); if (id && state.chats.some(c => c.id === id && c.unread)) updateChat(id, c => ({ ...c, unread: false })); }
export function reactTo(chatId: string, messageId: string, emoji: string) { updateChat(chatId, c => ({ ...c, messages: c.messages.map(m => m.id === messageId ? { ...m, reaction: m.reaction === emoji ? undefined : emoji } : m) })); }
function runPhase(id: string, phase?: State["runs"][string]) { const runs = { ...state.runs }; if (phase) runs[id] = phase; else delete runs[id]; publish({ ...state, runs }, false); }
const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
async function remember(history: ChatMessage[]) {
  try {
    const res = await fetch("/api/facts", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-6).map(m => ({ role: m.role, content: textOf(m) })), facts: state.facts }) });
    if (!res.ok) { const data = await res.json().catch(() => ({})); notify(data.error || "Mira couldn't save new memories this time. Your existing memories are still here."); return; }
    const data = await res.json();
    if (Array.isArray(data.facts)) {
      const facts = data.facts.filter((f: unknown) => typeof f === "string");
      publish({ ...state, facts });
      try { localStorage.setItem(FACTS, JSON.stringify(facts)); } catch { notify("Your new memories couldn't be saved in this browser."); }
    }
  } catch { notify("Mira couldn't save new memories this time. Your existing memories are still here."); }
}
export async function sendMessage(id: string, text: string, image?: string) {
  const chat = state.chats.find(c => c.id === id);
  if (!chat || state.runs[id] || (!text.trim() && !image)) return;
  const user: ChatMessage = { id: uid(), role: "user", createdAt: Date.now(), delivery: "sent", parts: [...(text ? [{ type: "text" as const, text }] : []), ...(image ? [{ type: "file" as const, mediaType: "image/jpeg", url: image }] : [])] };
  const history = [...chat.messages, user];
  publish({ ...state, errors: { ...state.errors, [id]: "" } }, false);
  updateChat(id, c => ({ ...c, messages: history, updatedAt: Date.now() }));
  runPhase(id, "pause");
  let reply = "";
  const replyIds = [uid(), uid(), uid()];
  let visibleCount = 0;
  try {
    const pending = fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ messages: history.slice(-20).map(m => ({ role: m.role, content: textOf(m), ...(imageOf(m) ? { image: imageOf(m) } : {}) })), facts: state.facts }) });
    // Attach a handler immediately; a fast network failure must not become unhandled during the pause.
    const response = pending.then(res => ({ res }), error => ({ error }));
    await wait(450);
    updateChat(id, c => ({ ...c, messages: c.messages.map(m => m.id === user.id ? { ...m, delivery: "delivered" } : m) }));
    runPhase(id, "typing");
    await wait(550);
    const result = await response;
    if ("error" in result) throw result.error;
    const res = result.res;
    if (!res.ok || !res.body) { const data = await res.json().catch(() => ({})); throw new Error(data.error || "Mira couldn't reply right now."); }
    updateChat(id, c => ({ ...c, messages: c.messages.map(m => m.id === user.id ? { ...m, delivery: "seen" } : m) }));
    const reader = res.body.getReader(); const decoder = new TextDecoder();
    const show = async () => {
      const chunks = reply.split(/\n\s*\n/).filter(s => s.trim());
      const pieces = chunks.length > 3 ? [...chunks.slice(0, 2), chunks.slice(2).join("\n")] : chunks;
      if (pieces.length > visibleCount && visibleCount > 0) { runPhase(id, "typing"); await wait(650); }
      if (!pieces.length) return;
      visibleCount = pieces.length; runPhase(id, "streaming");
      updateChat(id, c => {
        const remaining = c.messages.filter(m => !replyIds.includes(m.id));
        const old = c.messages.filter(m => replyIds.includes(m.id));
        const messages: ChatMessage[] = pieces.map((part, i) => ({ id: replyIds[i] ?? uid(), role: "assistant", createdAt: old[i]?.createdAt ?? Date.now(), parts: [{ type: "text", text: part.trim() }], reaction: old[i]?.reaction }));
        return { ...c, messages: [...remaining, ...messages], unread: state.active !== id, lastSeen: Date.now(), updatedAt: Date.now() };
      });
    };
    for (;;) { const { done, value } = await reader.read(); if (done) break; reply += decoder.decode(value, { stream: true }); await show(); }
    reply += decoder.decode(); await show();
    if (!reply.trim()) throw new Error("Mira went quiet… please send a new message.");
    if (/love|proud|miss|happy|thank|💕|❤️|🥺/i.test(reply) && Math.random() < 0.4) updateChat(id, c => ({ ...c, messages: c.messages.map(m => m.id === user.id ? { ...m, miraReaction: "❤️" } : m) }));
    const finished = state.chats.find(c => c.id === id);
    if (finished) await remember(finished.messages);
  } catch (error) { publish({ ...state, errors: { ...state.errors, [id]: error instanceof Error ? error.message : "The connection was interrupted. Please send a new message." } }, false); }
  finally { runPhase(id); }
}

export async function compressPhoto(file: File): Promise<string> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") throw new Error("Please choose a photo, such as a JPEG, PNG or WebP.");
  if (file.size > 30 * 1024 * 1024) throw new Error("That photo is a little too large. Please pick one under 30 MB.");
  const url = URL.createObjectURL(file);
  try {
    const img = new Image(); img.src = url; await img.decode();
    const scale = Math.min(1, 1024 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas"); canvas.width = Math.max(1, Math.round(img.naturalWidth * scale)); canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = canvas.getContext("2d"); if (!ctx) throw new Error("This browser couldn't prepare the photo.");
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    let data = canvas.toDataURL("image/jpeg", 0.78);
    if (data.length > 850000) data = canvas.toDataURL("image/jpeg", 0.55);
    if (data.length > 850000) throw new Error("That photo is still too large. Try a smaller photo.");
    return data;
  } catch (e) { throw new Error(e instanceof Error && !e.message.includes("decode") ? e.message : "That photo couldn't be opened. Try exporting it as a JPEG."); }
  finally { URL.revokeObjectURL(url); }
}