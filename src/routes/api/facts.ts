import { createFileRoute } from "@tanstack/react-router";
import { callChat, errorResponse } from "@/lib/gateway.server";
import { requireOwner } from "@/lib/auth.server";

export const Route = createFileRoute("/api/facts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const denied = await requireOwner(request); if (denied) return denied;
        const { messages, facts } = (await request.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          facts: string[];
        };
        const transcript = (messages ?? [])
          .slice(-6)
          .map((m) => `${m.role === "user" ? "Him" : "Mira"}: ${m.content}`)
          .join("\n");
        const res = await callChat({
          instructions:
            'You maintain a short memory list of key facts about the boyfriend (name, likes, dislikes, job, plans, important events, feelings). Merge the existing facts with any new facts from the latest conversation. Update outdated ones, drop trivia, keep each fact under 15 words, max 15 facts. Reply with ONLY JSON like {"facts": ["..."]}.',
          input: [
            {
              role: "user",
              content: `Existing facts:\n${JSON.stringify(facts ?? [])}\n\nLatest conversation:\n${transcript}`,
            },
          ],
          json: true,
          stream: false,
          signal: request.signal,
        });
        if (!res.ok) return errorResponse(res);
        try {
          const data = await res.json();
          const text = String(data?.choices?.[0]?.message?.content ?? "").replace(/^```(?:json)?|```$/g, "").trim();
          const parsed = JSON.parse(text);
          return Response.json({ facts: Array.isArray(parsed.facts) ? parsed.facts.filter((f: unknown) => typeof f === "string").slice(0, 15) : facts });
        } catch {
          return Response.json({ facts });
        }
      },
    },
  },
});
