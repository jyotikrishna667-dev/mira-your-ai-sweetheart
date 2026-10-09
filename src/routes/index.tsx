import { createFileRoute } from "@tanstack/react-router";
import { ChatHome } from "@/components/mira/chat";
export const Route = createFileRoute("/")({
 head: () => ({ meta: [
 { title: "Mira — our little world" }, { name: "description", content: "Your conversations with Mira, your warm and playful companion." },
 { property: "og:title", content: "Mira — our little world" }, { property: "og:description", content: "A little place for your conversations with Mira." },
 { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }
 ] }), component: ChatHome,
});
