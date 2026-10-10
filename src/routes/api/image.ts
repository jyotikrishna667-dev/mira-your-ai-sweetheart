import { createFileRoute } from "@tanstack/react-router";

const MODEL = "openai/gpt-image-2.5-sunburst";

export const Route = createFileRoute("/api/image")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const key = process.env["LOVABLE_API_KEY"];
        if (!key) return Response.json({ error: "Image making isn't set up yet." }, { status: 500 });
        const { prompt } = (await request.json()) as { prompt?: string };
        if (!prompt?.trim()) return Response.json({ error: "Tell me what to draw 🥺" }, { status: 400 });
        const res = await fetch("https://ai.gateway.lovable.dev/v1/images/generations", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${key}`,
            "Lovable-API-Key": key,
            "X-Lovable-AIG-SDK": "fetch",
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ model: MODEL, prompt: prompt.slice(0, 2000), stream: true, partial_images: 1 }),
        });
        if (!res.ok || !res.body) {
          let message = "I couldn't make that picture right now 🥺";
          try {
            const j = await res.json();
            message = j?.error?.message || j?.message || message;
          } catch { /* noop */ }
          if (res.status === 402) message = "AI credits ran out. Please add credits to make more pictures.";
          if (res.status === 429) message = "Too many requests — wait a few seconds and try again.";
          return Response.json({ error: message }, { status: res.status });
        }
        // Read the whole stream and keep the final image.
        const reader = res.body.getReader();
        const dec = new TextDecoder();
        let buf = "";
        let final: string | null = null;
        let partial: string | null = null;
        let err: string | null = null;
        const handle = (line: string) => {
          if (!line.startsWith("data:")) return;
          const data = line.slice(5).trim();
          if (!data || data === "[DONE]") return;
          try {
            const ev = JSON.parse(data);
            if (ev.type?.includes("error") || ev.error) err = ev.error?.message || ev.message || "Image failed";
            const b64 = ev.b64_json ?? ev.data?.[0]?.b64_json;
            if (b64) {
              if (String(ev.type ?? "").includes("partial")) partial = b64;
              else final = b64;
            }
          } catch { /* partial line */ }
        };
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += dec.decode(value, { stream: true });
          const lines = buf.split("\n");
          buf = lines.pop() ?? "";
          lines.forEach(handle);
        }
        handle(buf);
        const img = final ?? partial;
        if (!img) return Response.json({ error: err || "I couldn't make that picture 🥺" }, { status: 502 });
        return Response.json({ image: `data:image/png;base64,${img}` });
      },
    },
  },
});
