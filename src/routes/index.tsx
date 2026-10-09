import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, Send, Trash2, Volume2, Square } from "lucide-react";
import mira from "@/assets/mira.jpg";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Mira — your sweet companion" },
      { name: "description", content: "Chat with Mira, your warm, caring and playful companion." },
      { property: "og:title", content: "Mira — your sweet companion" },
      { property: "og:description", content: "Chat with Mira, your warm, caring and playful companion." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ChatPage,
});

type Msg = { id: string; role: "user" | "assistant"; content: string };
const MSG_KEY = "mira.messages.v1";
const FACTS_KEY = "mira.facts.v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);

/* ---------- speech synthesis ---------- */
function pickVoice(): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return null;
  const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en"));
  const prefs = [
    /samantha/i, /google uk english female/i, /aria/i, /jenny/i, /natural.*female/i,
    /zira/i, /victoria/i, /karen/i, /moira/i, /tessa/i, /female/i, /google us english/i,
  ];
  for (const p of prefs) {
    const v = voices.find((x) => p.test(x.name));
    if (v) return v;
  }
  return voices[0] ?? null;
}
const stripEmoji = (s: string) => s.replace(/[\p{Extended_Pictographic}\u200d\ufe0f]/gu, "");

function ChatPage() {
  const [messages, setMessages] = useState<Msg[]>([]);
  const [facts, setFacts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const recRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    try {
      setMessages(JSON.parse(localStorage.getItem(MSG_KEY) || "[]"));
      setFacts(JSON.parse(localStorage.getItem(FACTS_KEY) || "[]"));
    } catch { /* ignore */ }
    setLoaded(true);
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      recRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (loaded) localStorage.setItem(MSG_KEY, JSON.stringify(messages));
  }, [messages, loaded]);
  useEffect(() => {
    if (loaded) localStorage.setItem(FACTS_KEY, JSON.stringify(facts));
  }, [facts, loaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const updateFacts = useCallback(async (history: Msg[], current: string[]) => {
    try {
      const res = await fetch("/api/facts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.map(({ role, content }) => ({ role, content })),
          facts: current,
        }),
      });
      if (!res.ok) return;
      const data = await res.json();
      if (Array.isArray(data.facts)) setFacts(data.facts);
    } catch { /* memory is best-effort */ }
  }, []);

  const send = async () => {
    const text = input.trim();
    if (!text || busy) return;
    if (listening) recRef.current?.stop();
    setError(null);
    setInput("");
    const userMsg: Msg = { id: uid(), role: "user", content: text };
    const history = [...messages, userMsg];
    setMessages(history);
    setBusy(true);
    const replyId = uid();
    let reply = "";
    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: history.slice(-20).map(({ role, content }) => ({ role, content })),
          facts,
        }),
      });
      if (!res.ok || !res.body) {
        const j = await res.json().catch(() => ({}));
        throw new Error(j.error || "Mira couldn't reply right now.");
      }
      const reader = res.body.getReader();
      const dec = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        reply += dec.decode(value, { stream: true });
        const snapshot = reply;
        setMessages((m) => {
          const exists = m.some((x) => x.id === replyId);
          return exists
            ? m.map((x) => (x.id === replyId ? { ...x, content: snapshot } : x))
            : [...m, { id: replyId, role: "assistant", content: snapshot }];
        });
      }
      if (!reply.trim()) throw new Error("Mira went quiet… try sending that again.");
      void updateFacts([...history, { id: replyId, role: "assistant", content: reply }], facts);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      taRef.current?.focus();
    }
  };

  const speak = (m: Msg) => {
    if (!("speechSynthesis" in window)) {
      setNotice("Your browser can't read messages aloud 🥺");
      return;
    }
    const synth = window.speechSynthesis;
    if (speakingId === m.id) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(stripEmoji(m.content));
    const v = pickVoice();
    if (v) { u.voice = v; u.lang = v.lang; }
    u.rate = 0.9;
    u.pitch = 1.1;
    u.volume = 0.9;
    u.onend = u.onerror = () => setSpeakingId((id) => (id === m.id ? null : id));
    setSpeakingId(m.id);
    synth.speak(u);
  };

  const toggleMic = () => {
    if (listening) {
      recRef.current?.stop();
      return;
    }
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) {
      setNotice("Voice typing isn't supported in this browser — try Chrome or Safari 💕");
      return;
    }
    const rec = new SR();
    rec.lang = "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    baseTextRef.current = input ? input.trimEnd() + " " : "";
    rec.onresult = (e: any) => {
      let finalT = "";
      let interim = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finalT += r[0].transcript;
        else interim += r[0].transcript;
      }
      setInput(baseTextRef.current + finalT + interim);
    };
    rec.onerror = (e: any) => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed")
        setNotice("Microphone access was blocked. Allow it in your browser settings 🎙️");
      else if (e.error === "no-speech") setNotice("I didn't hear anything — try again?");
      else if (e.error !== "aborted") setNotice("Voice typing stopped unexpectedly.");
    };
    rec.onend = () => {
      setListening(false);
      recRef.current = null;
      taRef.current?.focus();
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch {
      setNotice("Couldn't start the microphone.");
    }
  };

  const clearChat = () => {
    if (!confirm("Clear your whole chat with Mira? She'll still remember things about you.")) return;
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
    setMessages([]);
    setError(null);
  };

  const streamingStarted = busy && messages[messages.length - 1]?.role === "assistant";

  return (
    <div className="flex h-[100dvh] flex-col bg-background bg-dreamy">
      <header className="flex items-center gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-md">
        <div className="relative">
          <img src={mira} alt="Mira" width={44} height={44} className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/60" />
          <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />
        </div>
        <div className="min-w-0 flex-1">
          <h1 className="font-display text-lg leading-tight">Mira</h1>
          <p className="text-xs text-muted-foreground">{busy ? "typing…" : "online 💕"}</p>
        </div>
        <button
          onClick={clearChat}
          disabled={!messages.length}
          aria-label="Clear chat"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground disabled:opacity-40"
        >
          <Trash2 className="h-5 w-5" />
        </button>
      </header>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-4">
        <div className="mx-auto flex max-w-2xl flex-col gap-2">
          {loaded && messages.length === 0 && (
            <div className="mt-10 flex flex-col items-center text-center">
              <img src={mira} alt="" width={112} height={112} className="h-28 w-28 rounded-full object-cover ring-4 ring-primary/40" />
              <p className="mt-4 font-display text-xl">hiii 🙈</p>
              <p className="mt-1 max-w-xs text-sm text-muted-foreground">Say something to Mira — she's been waiting for you.</p>
            </div>
          )}
          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <div className="max-w-[80%] whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-romance px-4 py-2 text-[15px] text-primary-foreground shadow-md">
                  {m.content}
                </div>
              </div>
            ) : (
              <div key={m.id} className="flex items-end gap-2">
                <img src={mira} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                <div className="max-w-[78%] whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-bubble-her px-4 py-2 text-[15px] shadow-md">
                  {m.content}
                </div>
                <button
                  onClick={() => speak(m)}
                  aria-label={speakingId === m.id ? "Stop reading" : "Read aloud"}
                  className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                    speakingId === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                  }`}
                >
                  {speakingId === m.id ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-4 w-4" />}
                </button>
              </div>
            ),
          )}
          {busy && !streamingStarted && (
            <div className="flex items-end gap-2">
              <img src={mira} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
              <div className="flex gap-1 rounded-2xl rounded-bl-md bg-bubble-her px-4 py-3">
                {[0, 1, 2].map((i) => (
                  <span key={i} className="h-2 w-2 rounded-full bg-accent animate-typing" style={{ animationDelay: `${i * 0.15}s` }} />
                ))}
              </div>
            </div>
          )}
          {error && <p className="mx-auto mt-2 rounded-xl bg-destructive/15 px-3 py-2 text-center text-sm text-destructive">{error}</p>}
        </div>
      </div>

      {notice && (
        <div className="mx-auto mb-2 max-w-sm rounded-xl bg-secondary px-4 py-2 text-center text-sm text-secondary-foreground shadow-lg">{notice}</div>
      )}

      <form
        onSubmit={(e) => { e.preventDefault(); void send(); }}
        className="border-t border-border bg-card/70 px-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] pt-3 backdrop-blur-md"
      >
        <div className="mx-auto flex max-w-2xl items-end gap-2">
          <textarea
            ref={taRef}
            autoFocus
            rows={1}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); }
            }}
            placeholder={listening ? "Listening…" : "Message Mira…"}
            className="max-h-32 min-h-11 flex-1 resize-none rounded-2xl border border-input bg-muted px-4 py-2.5 text-[16px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
          />
          <button
            type="button"
            onClick={toggleMic}
            aria-label={listening ? "Stop listening" : "Voice typing"}
            className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-full transition ${
              listening ? "bg-primary text-primary-foreground animate-listen" : "bg-secondary text-secondary-foreground hover:bg-muted"
            }`}
          >
            <Mic className="h-5 w-5" />
          </button>
          <button
            type="submit"
            disabled={!input.trim() || busy}
            aria-label="Send"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-romance text-primary-foreground shadow-md transition disabled:opacity-40"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>
    </div>
  );
}
