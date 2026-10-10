import { createFileRoute } from "@tanstack/react-router";
import { callResponses, errorResponse, sseToText } from "@/lib/gateway.server";

const FORMAT = {
  type: "json_schema",
  name: "facts",
  strict: true,
  schema: {
    type: "object",
    properties: { facts: { type: "array", items: { type: "string" } } },
    required: ["facts"],
    additionalProperties: false,
  },
};

export const Route = createFileRoute("/api/facts")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, facts } = (await request.json()) as {
          messages: { role: "user" | "assistant"; content: string }[];
          facts: string[];
        };
        const transcript = (messages ?? [])
          .slice(-6)
          .map((m) => `${m.role === "user" ? "Him" : "Mira"}: ${m.content}`)
          .join("\n");
        const res = await callResponses({
          instructions:
            "You maintain a short memory list of key facts about the boyfriend (name, likes, dislikes, job, plans, important events, feelings). Merge the existing facts with any new facts from the latest conversation. Update outdated ones, drop trivia, keep each fact under 15 words, max 15 facts. Return JSON.",
          input: [
            {
              role: "user",
              content: `Existing facts:\n${JSON.stringify(facts ?? [])}\n\nLatest conversation:\n${transcript}`,
            },
          ],
          format: FORMAT,
        });
        if (!res.ok || !res.body) return errorResponse(res);
        const text = await new Response(sseToText(res.body)).text();
        try {
          const parsed = JSON.parse(text);
          return Response.json({ facts: Array.isArray(parsed.facts) ? parsed.facts.slice(0, 15) : facts });
        } catch {
          return Response.json({ facts });
        }
      },
    },
  },
});
