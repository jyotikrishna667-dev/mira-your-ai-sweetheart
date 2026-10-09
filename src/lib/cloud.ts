import { supabase } from "./supabase";
import type { Chat } from "./mira-store";

type ChatRow = { id: string; data: Chat };
type MetaRow = { facts: string[]; seeded: boolean };

export async function loadCloud(): Promise<{ chats: Chat[]; meta: MetaRow | null }> {
  const [chatsRes, metaRes] = await Promise.all([
    supabase.from("mira_chats").select("id, data").order("updated_at", { ascending: false }),
    supabase.from("mira_meta").select("facts, seeded").maybeSingle(),
  ]);
  if (chatsRes.error) throw chatsRes.error;
  if (metaRes.error) throw metaRes.error;
  const chats = ((chatsRes.data ?? []) as ChatRow[]).map(r => r.data).filter(c => c && typeof c.id === "string" && Array.isArray(c.messages));
  return { chats, meta: (metaRes.data as MetaRow | null) ?? null };
}

export async function saveChats(userId: string, chats: Chat[]) {
  if (!chats.length) return;
  const { error } = await supabase.from("mira_chats").upsert(chats.map(c => ({ id: c.id, user_id: userId, data: c, updated_at: new Date(c.updatedAt).toISOString() })));
  if (error) throw error;
}

export async function removeChats(ids: string[]) {
  if (!ids.length) return;
  const { error } = await supabase.from("mira_chats").delete().in("id", ids);
  if (error) throw error;
}

export async function saveMeta(userId: string, meta: MetaRow) {
  const { error } = await supabase.from("mira_meta").upsert({ user_id: userId, facts: meta.facts, seeded: meta.seeded });
  if (error) throw error;
}
