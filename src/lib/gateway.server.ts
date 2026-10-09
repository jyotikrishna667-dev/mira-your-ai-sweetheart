/**
 * AI provider. Works with any OpenAI-compatible API (Google Gemini, OpenAI, OpenRouter, Groq, ...).
 * Configure with environment variables on your host:
 *   AI_API_KEY   (required)
 *   AI_BASE_URL  (default: Gemini's OpenAI-compatible endpoint)
 *   AI_MODEL     (default: gemini-2.5-flash)
 */
const BASE_URL = () => (process.env["AI_BASE_URL"] ?? "https://generativelanguage.googleapis.com/v1beta/openai").replace(/\/$/, "");
export const MODEL = () => process.env["AI_MODEL"] ?? "gemini-2.5-flash";

export type Msg = { role: "user" | "assistant"; content: string | ({ type: "text"; text: string } | { type: "image_url"; image_url: { url: string } })[] };

/** Calls chat completions and returns the raw upstream Response. */
export async function callChat(body: { instructions: string; input: Msg[]; json?: boolean; stream?: boolean; signal?: AbortSignal | undefined }) {
  const key = process.env["AI_API_KEY"];
  if (!key) throw new Error("AI is not configured (missing AI_API_KEY)");
  const init: RequestInit = {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model: MODEL(),
      messages: [{ role: "system", content: body.instructions }, ...body.input],
      stream: body.stream ?? true,
      ...(body.json ? { response_format: { type: "json_object" } } : {}),
    }),
  };
  if (body.signal) init.signal = body.signal;
  return fetch(`${BASE_URL()}/chat/completions`, init);
}

/** Converts OpenAI-style SSE into a stream of plain text deltas. */
export function sseToText(upstream: ReadableStream<Uint8Array>) {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();
  let buf = "";
  return upstream.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        buf += decoder.decode(chunk, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          if (!line.startsWith("data:")) continue;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") continue;
          let ev;
          try { ev = JSON.parse(data); } catch { continue; }
          if (ev.error) throw new Error(ev.error.message || "Mira couldn't finish her reply.");
          const delta = ev.choices?.[0]?.delta?.content;
          if (typeof delta === "string" && delta) controller.enqueue(encoder.encode(delta));
        }
      },
    }),
  );
}

export async function errorResponse(res: Response) {
  let message = "Mira can't reply right now. Please try again in a moment.";
  try {
    const j = await res.json();
    const first = Array.isArray(j) ? j[0] : j;
    message = first?.error?.message || first?.message || message;
  } catch {
    /* noop */
  }
  if (res.status === 429) message = "Too many messages at once — wait a few seconds and try again.";
  return Response.json({ error: message }, { status: res.status });
}
