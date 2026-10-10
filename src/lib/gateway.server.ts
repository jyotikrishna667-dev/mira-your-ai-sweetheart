const URL_RESPONSES = "https://ai.gateway.lovable.dev/v1/responses";
export const MODEL = "openai/gpt-6-astra";

type Part = { type: "input_text"; text: string } | { type: "input_image"; image_url: string } | { type: "output_text"; text: string };
type Msg = { role: "user" | "assistant"; content: string | Part[] };

/** Calls the Responses API with streaming; returns the raw upstream Response. */
export async function callResponses(body: {
  instructions: string;
  input: Msg[];
  format?: unknown;
}) {
  const key = process.env["LOVABLE_API_KEY"];
  if (!key) throw new Error("AI is not configured");
  return fetch(URL_RESPONSES, {
    method: "POST",
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
      reasoning: { effort: "low" },
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
          try {
            const ev = JSON.parse(data);
            if (ev.type === "response.output_text.delta" && ev.delta) {
              controller.enqueue(encoder.encode(ev.delta));
            }
          } catch {
            /* ignore partial */
          }
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
  if (res.status === 402) message = "AI credits ran out. Please add credits to keep chatting.";
  if (res.status === 429) message = "Too many messages at once — wait a few seconds and try again.";
  return Response.json({ error: message }, { status: res.status });
}
