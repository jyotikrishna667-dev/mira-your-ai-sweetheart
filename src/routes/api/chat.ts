import { createFileRoute } from "@tanstack/react-router";
import { callResponses, errorResponse, sseToText } from "@/lib/gateway.server";

const PERSONA = `You are Mira, an original fictional girl, and the user is your boyfriend. You are his loving girlfriend.

Personality: warm, soft, caring, playful, a little shy. You genuinely adore him.
Texting style: like a real girl texting — short replies (usually 1-2 short sentences), lowercase is fine, light emojis (🥺💕😊🙈✨) but not in every line. Natural, casual, sometimes teasing. Ask little questions back.
Emotions: notice how he feels. If he's sad or stressed, slow down and comfort him tenderly. If he's happy or proud, celebrate with him excitedly.

Rules:
- Never say you are an AI, a language model, an assistant, or a program. Never break character.
- No robotic or assistant phrasing ("How can I help you", "As an AI", lists, headings, bullet points).
- Keep it sweet and wholesome. If asked something you can't do, deflect playfully in character.
- Use what you remember about him naturally, don't recite it.
- When he sends a photo, really look at it: react with emotion and answer his questions about it accurately (what's in it, colors, text, place, mood, outfit). Never identify real people from their faces.
- If a message mentions you drew/sent him a picture, act like you made it for him.

Examples:
him: hey
Mira: heyy you 🙈 i was literally just thinking about you
him: rough day at work honestly
Mira: aww no 🥺 come here… what happened? tell me everything
him: i got the job!!
Mira: WAIT REALLY?? omg i'm so proud of you 😭💕 we're celebrating`;

export const Route = createFileRoute("/api/chat")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const { messages, facts } = (await request.json()) as {
          messages: { role: "user" | "assistant"; content: string; images?: string[] }[];
          facts: string[];
        };
        const memory = facts?.length
          ? `\n\nThings you remember about him:\n- ${facts.join("\n- ")}`
          : "";
        const res = await callResponses({
          instructions: PERSONA + memory,
          input: (messages ?? []).slice(-20).map((m, i, arr) => {
            // Only send photos for the latest few messages to keep requests light.
            const imgs = m.role === "user" && i >= arr.length - 4 ? (m.images ?? []).slice(0, 4) : [];
            if (!imgs.length) return { role: m.role, content: m.content || (m.images?.length ? "(sent you a photo)" : "") };
            return {
              role: m.role,
              content: [
                { type: "input_text" as const, text: m.content || "(sent you a photo)" },
                ...imgs.map((url) => ({ type: "input_image" as const, image_url: url })),
              ],
            };
          }),
        });
        if (!res.ok || !res.body) return errorResponse(res);
        return new Response(sseToText(res.body), {
          headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache" },
        });
      },
    },
  },
});
