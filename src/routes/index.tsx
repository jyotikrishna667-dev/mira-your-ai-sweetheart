import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Mic, Send, Trash2, Volume2, Square, Menu, Plus, Search, Pin, PinOff, Pencil, X, Paperclip, Download, ImageIcon,
} from "lucide-react";
import mira from "@/assets/mira.jpg";
import { type Chat, type Msg, compressImage, groupLabel, loadChats, saveChats, wantsImage } from "@/lib/chat-store";

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

const MSG_KEY = "mira.messages.v1";
const FACTS_KEY = "mira.facts.v1";
const uid = () => Math.random().toString(36).slice(2) + Date.now().toString(36);
const newChat = (): Chat => ({ id: uid(), title: "New chat", createdAt: Date.now(), updatedAt: Date.now(), messages: [] });

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
  const [chats, setChats] = useState<Chat[]>([]);
  const [activeId, setActiveId] = useState<string>("");
  const [facts, setFacts] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [pending, setPending] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [drawing, setDrawing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [speakingId, setSpeakingId] = useState<string | null>(null);
  const [listening, setListening] = useState(false);
  const [sidebar, setSidebar] = useState(false);
  const [query, setQuery] = useState("");
  const [viewer, setViewer] = useState<string | null>(null);
  const recRef = useRef<any>(null);
  const baseTextRef = useRef("");
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const active = chats.find((c) => c.id === activeId);
  const messages = active?.messages ?? [];

  useEffect(() => {
    (async () => {
      let list: Chat[] = [];
      try {
        list = (await loadChats()) ?? [];
      } catch {
        setNotice("Couldn't open saved chats in this browser 🥺");
      }
      try {
        // Move the original single chat into the history once.
        const old = JSON.parse(localStorage.getItem(MSG_KEY) || "[]") as Msg[];
        if (old.length) {
          const first = old.find((m) => m.role === "user")?.content ?? "Our first chat";
          list.unshift({ id: uid(), title: first.slice(0, 40), createdAt: Date.now(), updatedAt: Date.now(), messages: old });
          localStorage.removeItem(MSG_KEY);
        }
        setFacts(JSON.parse(localStorage.getItem(FACTS_KEY) || "[]"));
      } catch { /* ignore */ }
      if (!list.length) list = [newChat()];
      const sorted = [...list].sort((a, b) => b.updatedAt - a.updatedAt);
      setChats(list);
      setActiveId(sorted[0].id);
      setLoaded(true);
    })();
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
    return () => {
      if ("speechSynthesis" in window) window.speechSynthesis.cancel();
      recRef.current?.abort?.();
    };
  }, []);

  useEffect(() => {
    if (!loaded) return;
    saveChats(chats).catch(() => setNotice("Storage is full — delete some old chats to keep saving 🥺"));
  }, [chats, loaded]);
  useEffect(() => {
    if (loaded) localStorage.setItem(FACTS_KEY, JSON.stringify(facts));
  }, [facts, loaded]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, busy, activeId]);

  useEffect(() => {
    if (!notice) return;
    const t = setTimeout(() => setNotice(null), 4000);
    return () => clearTimeout(t);
  }, [notice]);

  const setChatMessages = (chatId: string, fn: (m: Msg[]) => Msg[]) =>
    setChats((cs) => cs.map((c) => (c.id === chatId ? { ...c, messages: fn(c.messages), updatedAt: Date.now() } : c)));

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

  const streamReply = async (chatId: string, history: Msg[], extraNote?: string) => {
    const replyId = uid();
    let reply = "";
    const payload = history.slice(-20).map(({ role, content, images, generated }) => ({
      role,
      content: generated ? `${content}\n(I drew and sent him a picture)` : content,
      images: role === "user" ? images : undefined,
    }));
    if (extraNote) payload.push({ role: "user", content: extraNote, images: undefined });
    const res = await fetch("/api/chat", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages: payload, facts }),
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
      setChatMessages(chatId, (m) =>
        m.some((x) => x.id === replyId)
          ? m.map((x) => (x.id === replyId ? { ...x, content: snapshot } : x))
          : [...m, { id: replyId, role: "assistant", content: snapshot }],
      );
    }
    if (!reply.trim()) throw new Error("Mira went quiet… try sending that again.");
    return { id: replyId, role: "assistant" as const, content: reply };
  };

  const send = async () => {
    const text = input.trim();
    if ((!text && !pending.length) || busy || !active) return;
    if (listening) recRef.current?.stop();
    setError(null);
    setInput("");
    const imgs = pending;
    setPending([]);
    const chatId = active.id;
    const userMsg: Msg = { id: uid(), role: "user", content: text, ...(imgs.length ? { images: imgs } : {}) };
    const history = [...messages, userMsg];
    setChats((cs) =>
      cs.map((c) =>
        c.id === chatId
          ? {
              ...c,
              title: c.title === "New chat" ? (text || "Photo 📷").slice(0, 40) : c.title,
              messages: history,
              updatedAt: Date.now(),
            }
          : c,
      ),
    );
    setBusy(true);
    try {
      if (text && !imgs.length && wantsImage(text)) {
        setDrawing(true);
        const r = await fetch("/api/image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt: text }),
        });
        const j = await r.json().catch(() => ({}));
        if (!r.ok || !j.image) throw new Error(j.error || "I couldn't make that picture 🥺");
        const small = await compressImage(j.image, 1024, 0.88).catch(() => j.image as string);
        setDrawing(false);
        const imgMsg: Msg = { id: uid(), role: "assistant", content: "", images: [small], generated: true };
        setChatMessages(chatId, (m) => [...m, imgMsg]);
        const reply = await streamReply(chatId, history, "(You just drew that picture and sent it to him. Send a short sweet message with it.)");
        setChatMessages(chatId, (m) => {
          // Put her caption on the picture bubble.
          const cap = m.find((x) => x.id === reply.id)?.content ?? "";
          return m.filter((x) => x.id !== reply.id).map((x) => (x.id === imgMsg.id ? { ...x, content: cap } : x));
        });
      } else {
        const reply = await streamReply(chatId, history);
        void updateFacts([...history, reply], facts);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong.");
    } finally {
      setBusy(false);
      setDrawing(false);
      taRef.current?.focus();
    }
  };

  const onPickFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const room = 4 - pending.length;
    if (room <= 0) return setNotice("You can attach up to 4 photos 💕");
    try {
      const out = await Promise.all([...files].slice(0, room).map((f) => compressImage(f)));
      setPending((p) => [...p, ...out]);
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Couldn't add that photo.");
    }
    if (fileRef.current) fileRef.current.value = "";
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

  const stopAudio = () => {
    window.speechSynthesis?.cancel();
    setSpeakingId(null);
  };

  const clearChat = () => {
    if (!active || !confirm("Clear this chat with Mira? She'll still remember things about you.")) return;
    stopAudio();
    setChatMessages(active.id, () => []);
    setError(null);
  };

  const startNew = () => {
    if (busy) return;
    stopAudio();
    const empty = chats.find((c) => !c.messages.length);
    if (empty) setActiveId(empty.id);
    else {
      const c = newChat();
      setChats((cs) => [c, ...cs]);
      setActiveId(c.id);
    }
    setError(null);
    setSidebar(false);
  };
  const openChat = (id: string) => {
    if (busy) return;
    stopAudio();
    setActiveId(id);
    setError(null);
    setSidebar(false);
  };
  const renameChat = (c: Chat) => {
    const t = prompt("Rename chat", c.title)?.trim();
    if (t) setChats((cs) => cs.map((x) => (x.id === c.id ? { ...x, title: t.slice(0, 60) } : x)));
  };
  const togglePin = (c: Chat) => setChats((cs) => cs.map((x) => (x.id === c.id ? { ...x, pinned: !x.pinned } : x)));
  const deleteChat = (c: Chat) => {
    if (busy || !confirm(`Delete "${c.title}"?`)) return;
    const rest = chats.filter((x) => x.id !== c.id);
    const next = rest.length ? rest : [newChat()];
    setChats(next);
    if (c.id === activeId) setActiveId([...next].sort((a, b) => b.updatedAt - a.updatedAt)[0].id);
  };

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = chats
      .filter((c) => c.messages.length || c.id === activeId)
      .filter((c) => !q || c.title.toLowerCase().includes(q) || c.messages.some((m) => m.content.toLowerCase().includes(q)))
      .sort((a, b) => b.updatedAt - a.updatedAt);
    const out: { label: string; items: Chat[] }[] = [];
    const pinned = list.filter((c) => c.pinned);
    if (pinned.length) out.push({ label: "Pinned", items: pinned });
    for (const label of ["Today", "Yesterday", "Previous Days"]) {
      const items = list.filter((c) => !c.pinned && groupLabel(c.updatedAt) === label);
      if (items.length) out.push({ label, items });
    }
    return out;
  }, [chats, query, activeId]);

  const streamingStarted = busy && !drawing && messages[messages.length - 1]?.role === "assistant" && !messages[messages.length - 1]?.generated;

  const sidebarEl = (
    <aside className="flex h-full w-72 flex-col border-r border-border bg-card/95 backdrop-blur-md">
      <div className="flex items-center gap-2 p-3">
        <button
          onClick={startNew}
          className="flex flex-1 items-center gap-2 rounded-xl bg-romance px-3 py-2.5 text-sm font-semibold text-primary-foreground shadow-md transition hover:opacity-90"
        >
          <Plus className="h-4 w-4" /> New chat
        </button>
        <button
          onClick={() => setSidebar(false)}
          aria-label="Close chats"
          className="flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground hover:bg-muted md:hidden"
        >
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="px-3 pb-2">
        <div className="flex items-center gap-2 rounded-xl border border-input bg-muted px-3">
          <Search className="h-4 w-4 text-muted-foreground" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search chats"
            className="h-9 flex-1 bg-transparent text-sm placeholder:text-muted-foreground focus:outline-none"
          />
        </div>
      </div>
      <nav className="flex-1 overflow-y-auto px-2 pb-4">
        {groups.length === 0 && <p className="px-3 py-6 text-center text-sm text-muted-foreground">No chats found</p>}
        {groups.map((g) => (
          <div key={g.label} className="mt-2">
            <p className="px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
            {g.items.map((c) => (
              <div
                key={c.id}
                className={`group flex items-center gap-1 rounded-lg pr-1 transition ${c.id === activeId ? "bg-secondary" : "hover:bg-muted"}`}
              >
                <button onClick={() => openChat(c.id)} className="min-w-0 flex-1 truncate px-3 py-2 text-left text-sm">
                  {c.pinned && <Pin className="mr-1 inline h-3 w-3 text-primary" />}
                  {c.title}
                </button>
                <div className="flex shrink-0 opacity-100 md:opacity-0 md:group-hover:opacity-100">
                  <button onClick={() => togglePin(c)} aria-label={c.pinned ? "Unpin" : "Pin"} className="rounded p-1.5 text-muted-foreground hover:text-foreground">
                    {c.pinned ? <PinOff className="h-3.5 w-3.5" /> : <Pin className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => renameChat(c)} aria-label="Rename" className="rounded p-1.5 text-muted-foreground hover:text-foreground">
                    <Pencil className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => deleteChat(c)} aria-label="Delete" className="rounded p-1.5 text-muted-foreground hover:text-destructive">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ))}
      </nav>
    </aside>
  );

  const Imgs = ({ list }: { list: string[] }) => (
    <div className={`grid gap-1 ${list.length > 1 ? "grid-cols-2" : ""}`}>
      {list.map((src, i) => (
        <button key={i} onClick={() => setViewer(src)} className="overflow-hidden rounded-xl">
          <img src={src} alt="Shared photo" className="max-h-72 w-full object-cover" />
        </button>
      ))}
    </div>
  );

  return (
    <div className="flex h-[100dvh] bg-background bg-dreamy">
      <div className="hidden md:block">{sidebarEl}</div>
      {sidebar && (
        <div className="fixed inset-0 z-40 flex md:hidden">
          {sidebarEl}
          <button aria-label="Close chats" className="flex-1 bg-background/60" onClick={() => setSidebar(false)} />
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="flex items-center gap-3 border-b border-border bg-card/70 px-4 py-3 backdrop-blur-md">
          <button
            onClick={() => setSidebar(true)}
            aria-label="Open chats"
            className="-ml-1 flex h-10 w-10 items-center justify-center rounded-full text-muted-foreground transition hover:bg-muted hover:text-foreground md:hidden"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative">
            <img src={mira} alt="Mira" width={44} height={44} className="h-11 w-11 rounded-full object-cover ring-2 ring-primary/60" />
            <span className="absolute bottom-0 right-0 h-3 w-3 rounded-full border-2 border-card bg-online" />
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="font-display text-lg leading-tight">Mira</h1>
            <p className="text-xs text-muted-foreground">{drawing ? "drawing something for you…" : busy ? "typing…" : "online 💕"}</p>
          </div>
          <button
            onClick={clearChat}
            disabled={!messages.length || busy}
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
                  <div className="max-w-[80%] space-y-1 whitespace-pre-wrap break-words rounded-2xl rounded-br-md bg-romance px-4 py-2 text-[15px] text-primary-foreground shadow-md">
                    {m.images?.length ? <div className="-mx-2 pt-0.5"><Imgs list={m.images} /></div> : null}
                    {m.content && <div>{m.content}</div>}
                  </div>
                </div>
              ) : (
                <div key={m.id} className="flex items-end gap-2">
                  <img src={mira} alt="" width={28} height={28} loading="lazy" className="h-7 w-7 shrink-0 rounded-full object-cover" />
                  <div className="max-w-[78%] space-y-1 whitespace-pre-wrap break-words rounded-2xl rounded-bl-md bg-bubble-her px-4 py-2 text-[15px] shadow-md">
                    {m.images?.length ? (
                      <div className="-mx-2 pt-0.5">
                        <Imgs list={m.images} />
                        <a
                          href={m.images[0]}
                          download={`mira-${m.id}.jpg`}
                          className="mt-1 inline-flex items-center gap-1 px-2 text-xs text-muted-foreground hover:text-foreground"
                        >
                          <Download className="h-3.5 w-3.5" /> Save
                        </a>
                      </div>
                    ) : null}
                    {m.content && <div>{m.content}</div>}
                  </div>
                  {m.content && (
                    <button
                      onClick={() => speak(m)}
                      aria-label={speakingId === m.id ? "Stop reading" : "Read aloud"}
                      className={`mb-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${
                        speakingId === m.id ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      }`}
                    >
                      {speakingId === m.id ? <Square className="h-3.5 w-3.5" /> : <Volume2 className="h-4 w-4" />}
                    </button>
                  )}
                </div>
              ),
            )}
            {drawing && (
              <div className="flex items-end gap-2">
                <img src={mira} alt="" width={28} height={28} className="h-7 w-7 rounded-full object-cover" />
                <div className="flex h-48 w-48 flex-col items-center justify-center gap-2 rounded-2xl rounded-bl-md bg-bubble-her text-sm text-muted-foreground animate-pulse">
                  <ImageIcon className="h-8 w-8" /> drawing for you…
                </div>
              </div>
            )}
            {busy && !drawing && !streamingStarted && (
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
          {pending.length > 0 && (
            <div className="mx-auto mb-2 flex max-w-2xl gap-2 overflow-x-auto">
              {pending.map((src, i) => (
                <div key={i} className="relative shrink-0">
                  <img src={src} alt="Photo to send" className="h-16 w-16 rounded-xl object-cover ring-1 ring-border" />
                  <button
                    type="button"
                    onClick={() => setPending((p) => p.filter((_, j) => j !== i))}
                    aria-label="Remove photo"
                    className="absolute -right-1.5 -top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-secondary text-secondary-foreground shadow"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <div className="mx-auto flex max-w-2xl items-end gap-2">
            <input ref={fileRef} type="file" accept="image/*" multiple hidden onChange={(e) => void onPickFiles(e.target.files)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              aria-label="Attach photo"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-secondary text-secondary-foreground transition hover:bg-muted"
            >
              <Paperclip className="h-5 w-5" />
            </button>
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
              className="max-h-32 min-h-11 min-w-0 flex-1 resize-none rounded-2xl border border-input bg-muted px-4 py-2.5 text-[16px] placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
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
              disabled={(!input.trim() && !pending.length) || busy}
              aria-label="Send"
              className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-romance text-primary-foreground shadow-md transition disabled:opacity-40"
            >
              <Send className="h-5 w-5" />
            </button>
          </div>
        </form>
      </div>

      {viewer && (
        <div className="fixed inset-0 z-50 flex flex-col bg-background/95 p-4" onClick={() => setViewer(null)}>
          <div className="flex justify-end gap-2">
            <a
              href={viewer}
              download="mira-photo.jpg"
              onClick={(e) => e.stopPropagation()}
              aria-label="Save photo"
              className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground"
            >
              <Download className="h-5 w-5" />
            </a>
            <button aria-label="Close" className="flex h-10 w-10 items-center justify-center rounded-full bg-secondary text-secondary-foreground">
              <X className="h-5 w-5" />
            </button>
          </div>
          <img src={viewer} alt="Full size" className="m-auto max-h-[85dvh] max-w-full rounded-xl object-contain" onClick={(e) => e.stopPropagation()} />
        </div>
      )}
    </div>
  );
}
