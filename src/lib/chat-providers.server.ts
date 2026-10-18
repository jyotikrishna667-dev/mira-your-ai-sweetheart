import { CHAT_PROVIDERS } from "./ai-providers.config";
import { callResponses, sseToText } from "./gateway.server";

type Msg = { role: "user" | "assistant"; content: string; images?: string[] | undefined };

const ENDPOINTS = {
  gemini: "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions",
  groq: "https://api.groq.com/openai/v1/chat/completions",
} as const;

// provider:model -> timestamp until which it is skipped (next midnight UTC)
const skipUntil = new Map<string, number>();
const nextMidnightUTC = () => {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
};
const isDailyQuota = (text: string) => /per ?day|daily|PerDay|RPD|TPD/i.test(text);

/** OpenAI-style chat SSE -> plain text deltas. */
function chatSseToText(upstream: ReadableStream<Uint8Array>) {
  const dec = new TextDecoder();
  const enc = new TextEncoder();
  let buf = "";
  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buf += dec.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          try {
            const t = JSON.parse(data)?.choices?.[0]?.delta?.content;
            if (t) controller.enqueue(enc.encode(t));
          } catch { /* partial */ }
        }
      },
    }),
  );
}

function toChatMessages(system: string, messages: Msg[], vision: boolean) {
  return [
    { role: "system", content: system },
    ...messages.map((m) => {
      const imgs = vision && m.role === "user" ? m.images ?? [] : [];
      const text = m.content || (m.images?.length ? "(sent you a photo)" : "");
      if (!imgs.length) return { role: m.role, content: text };
      return {
        role: m.role,
        content: [{ type: "text", text }, ...imgs.map((url) => ({ type: "image_url", image_url: { url } }))],
      };
    }),
  ];
}

async function attempt(p: (typeof CHAT_PROVIDERS)[number], system: string, messages: Msg[]): Promise<Response> {
  if (p.provider === "lovable") {
    return callResponses({
      instructions: system,
      input: messages.map((m) =>
        m.images?.length && m.role === "user"
          ? {
              role: m.role,
              content: [
                { type: "input_text" as const, text: m.content || "(sent you a photo)" },
                ...m.images.map((url) => ({ type: "input_image" as const, image_url: url })),
              ],
            }
          : { role: m.role, content: m.content || "(sent you a photo)" },
      ),
    });
  }
  const key = process.env[p.keyEnv];
  if (!key) return new Response("missing key", { status: 401 });
  const hasImages = messages.some((m) => m.images?.length);
  // Groq llama text models can't see photos; Gemini Flash can.
  if (hasImages && p.provider === "groq") return new Response("no vision", { status: 400 });
  return fetch(ENDPOINTS[p.provider], {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: p.model,
      stream: true,
      temperature: 0.9,
      messages: toChatMessages(system, messages, true),
    }),
  });
}

/** Tries each provider (one retry each), returns a plain-text stream or null if all failed. */
export async function streamChat(system: string, messages: Msg[]) {
  for (const p of CHAT_PROVIDERS) {
    const id = `${p.provider}:${p.model}`;
    if ((skipUntil.get(id) ?? 0) > Date.now()) continue;
    for (let i = 0; i < 2; i++) {
      try {
        const res = await attempt(p, system, messages);
        if (res.ok && res.body) {
          return p.provider === "lovable" ? sseToText(res.body) : chatSseToText(res.body);
        }
        const text = await res.text().catch(() => "");
        if (res.status === 401 || res.status === 400) break; // no point retrying
        if (res.status === 429 && isDailyQuota(text)) {
          skipUntil.set(id, nextMidnightUTC());
          break;
        }
        console.warn(`[chat] ${id} failed ${res.status}`);
      } catch (e) {
        console.warn(`[chat] ${id} error`, e);
      }
      if (i === 0) await new Promise((r) => setTimeout(r, 600));
    }
  }
  return null;
}
