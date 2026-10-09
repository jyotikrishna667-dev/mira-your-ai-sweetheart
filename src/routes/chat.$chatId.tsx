import { createFileRoute } from "@tanstack/react-router";
import { ChatScreen } from "@/components/mira/chat";
export const Route = createFileRoute("/chat/$chatId")({
 head: () => ({ meta: [
 { title: "Chat with Mira — just between us" }, { name: "description", content: "Share your day, your photos and a little love with Mira." },
 { property: "og:title", content: "Chat with Mira — just between us" }, { property: "og:description", content: "Your own conversation with Mira." },
 { property: "og:type", content: "website" }, { name: "twitter:card", content: "summary" }
 ] }), component: Page,
});
function Page() { const { chatId } = Route.useParams(); return <ChatScreen key={chatId} chatId={chatId} />; }
