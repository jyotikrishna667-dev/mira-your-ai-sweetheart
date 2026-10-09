import { createLovableAiGatewayRunIdFetch } from "./run-id.server.ts";
const URL_RESPONSES = "https://ai.gateway.lovable.dev/v1/responses";
export const MODEL = "openai/gpt-6-astra";

type Msg = { role: "user" | "assistant"; content: string | ({ type: "input_text"; text: string } | { type: "input_image"; image_url: string })[] };

/** Calls the Responses API with streaming; returns the raw upstream Response. */
export async function callResponses(body: {
  instructions: string;
  input: Msg[];
  format?: unknown;
  signal?: AbortSignal;
}) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  const gateway = createLovableAiGatewayRunIdFetch();
  return gateway.fetch(URL_RESPONSES, {
    method: "POST",
    signal: body.signal,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${key}`,
      "Lovable-API-Key": key,
      "X-Lovable-AIG-SDK": "fetch",
    },
    body: JSON.stringify({
      model: MODEL,
      instructions: body.instructions,
      input: body.input,
      reasoning: { effort: "low", summary: "auto" },
      include: ["reasoning.encrypted_content"],
      store: false,
      stream: true,
      ...(body.format ? { text: { format: body.format } } : {}),
    }),
  });
}

/** Converts Responses SSE into a stream of plain text deltas. */
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
          if (ev.type === "response.output_text.delta" && ev.delta) controller.enqueue(encoder.encode(ev.delta));
          if (ev.type === "error" || ev.type === "response.failed") {
            throw new Error(ev.error?.message || ev.response?.error?.message || ev.message || "Mira couldn't finish her reply.");
          }
          if (ev.type === "response.refusal.delta") throw new Error("Mira can't respond to this request.");
        }
      },
    }),
  );
}

export async function errorResponse(res: Response) {
  let message = "Mira can't reply right now. Please try again in a moment.";
  try {
    const j = await res.json();
    message = j?.error?.message || j?.message || message;
  } catch {
    /* noop */
  }
  if (res.status === 429) message = "Too many messages at once — wait a few seconds and try again.";
  return Response.json({ error: message }, { status: res.status });
}
