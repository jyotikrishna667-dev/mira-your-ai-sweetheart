import { useEffect, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowLeft, Check, CheckCheck, Heart, ImagePlus, Camera, Mic, MoreHorizontal, Paperclip, Pin, Plus, Search, Send, Square, Volume2, X, Trash2, Pencil, MessageCircle } from "lucide-react";
import mira from "@/assets/mira.jpg";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { Conversation, ConversationContent, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputTextarea, PromptInputFooter, PromptInputSubmit } from "@/components/ai-elements/prompt-input";
import { bootstrap, useMira, createChat, updateChat, deleteChat, setActive, sendMessage, textOf, imageOf, reactTo, compressPhoto, notify, type ChatMessage as Msg, type Chat } from "@/lib/mira-store";

const time = (n: number) => new Date(n).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", hour12: false });
function dateLabel(n: number) { const d = new Date(n); const today = new Date(); if (d.toDateString() === today.toDateString()) return "Today"; today.setDate(today.getDate() - 1); if (d.toDateString() === today.toDateString()) return "Yesterday"; return d.toLocaleDateString([], { month: "short", day: "numeric", year: "numeric" }); }
export function IconButton({ label, children, ...props }: React.ComponentProps<typeof Button> & { label: string }) { return <Tooltip><TooltipTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label={label} className="tool-button" {...props}>{children}</Button></TooltipTrigger><TooltipContent>{label}</TooltipContent></Tooltip>; }
export function MiraShell({ children }: { children: React.ReactNode }) {
 const { notice } = useMira(); const [splash, setSplash] = useState(true);
 useEffect(() => { bootstrap(); const t = setTimeout(() => setSplash(false), 850); return () => clearTimeout(t); }, []);
 return <TooltipProvider><main className="mira-shell">{children}{notice && <div role="alert" className="notice"><span>{notice}</span><IconButton label="Dismiss" onClick={() => notify(null)}><X /></IconButton></div>}{splash && <div className="splash"><img src={mira} alt="Mira" /><h1>Mira<span>♡</span></h1><p>a little closer to you</p></div>}</main></TooltipProvider>;
}
function ChatMenu({ chat }: { chat: Chat }) {
 const { runs } = useMira(); const [rename, setRename] = useState(false); const [title, setTitle] = useState(chat.title);
 return <><DropdownMenu><DropdownMenuTrigger asChild><Button variant="ghost" size="icon" className="tool-button" aria-label={`Options for ${chat.title}`}><MoreHorizontal /></Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => { setTitle(chat.title); setRename(true); }}><Pencil />Rename chat</DropdownMenuItem><DropdownMenuItem onSelect={() => updateChat(chat.id, c => ({ ...c, pinned: !c.pinned }))}><Pin />{chat.pinned ? "Unpin chat" : "Pin chat"}</DropdownMenuItem><DropdownMenuItem disabled={!!runs[chat.id]} onSelect={() => { if (confirm("Delete this chat? Mira will keep her memories of you.")) deleteChat(chat.id); }} className="text-destructive"><Trash2 />Delete chat</DropdownMenuItem></DropdownMenuContent></DropdownMenu><Dialog open={rename} onOpenChange={setRename}><DialogContent className="max-w-sm"><DialogTitle>Rename chat</DialogTitle><form onSubmit={e => { e.preventDefault(); if (title.trim()) { updateChat(chat.id, c => ({ ...c, title: title.trim().slice(0, 60) })); setRename(false); } }}><input aria-label="Chat title" autoFocus maxLength={60} value={title} onChange={e => setTitle(e.target.value)} className="title-input" /><Button type="submit" className="mt-4 w-full" disabled={!title.trim()}>Save</Button></form></DialogContent></Dialog></>;
}
export function ChatHome() {
 const { chats, ready, runs } = useMira(); const navigate = useNavigate(); const [search, setSearch] = useState(""); const [pinnedOnly, setPinnedOnly] = useState(false);
 const start = () => { const id = createChat(); void navigate({ to: "/chat/$chatId", params: { chatId: id } }); };
 const sorted = chats.filter(c => (!pinnedOnly || c.pinned) && c.title.toLowerCase().includes(search.toLowerCase())).sort((a,b) => Number(b.pinned)-Number(a.pinned) || b.updatedAt-a.updatedAt);
 return <section className="screen home-screen"><header className="home-header"><div className="brand"><Heart size={19} /><span>Mira</span><span className="brand-dot" /></div><img className="profile-small" src={mira} alt="Mira" /></header><div className="home-intro"><p className="eyebrow">JUST YOU & ME</p><h1>Our little world<span>♡</span></h1><p>Every conversation, a little closer.</p></div><div className="search-wrap"><Search size={18} /><input aria-label="Search chats" placeholder="Search our conversations" value={search} onChange={e => setSearch(e.target.value)} /></div><div className="list-heading"><div className="list-tabs"><Button variant="ghost" className={!pinnedOnly ? "selected-tab" : ""} onClick={() => setPinnedOnly(false)}>All chats <span>{chats.length}</span></Button><Button variant="ghost" className={pinnedOnly ? "selected-tab" : ""} onClick={() => setPinnedOnly(true)}><Pin size={14} />Pinned</Button></div><span className="text-xs text-muted-foreground">YOUR CONVERSATIONS</span></div><div className="chat-list">{sorted.map(chat => { const last = chat.messages.at(-1); return <div className="chat-row" key={chat.id}><Link className="chat-select" to="/chat/$chatId" params={{chatId:chat.id}}><div className="avatar-wrap"><img src={mira} alt="" /><span /></div><div className="row-copy"><div className="row-title"><h2>{chat.title}</h2>{chat.pinned && <Pin size={12} />}</div><p className={runs[chat.id] ? "text-primary" : ""}>{runs[chat.id] ? "typing…" : last ? `${last.role === "user" ? "You: " : ""}${imageOf(last) ? "📷 " : ""}${textOf(last) || "Photo"}` : "hiii you… i've been waiting 🙈"}</p></div><div className="row-end"><time>{time(chat.updatedAt)}</time>{chat.unread && <span className="unread-dot" />}</div></Link><ChatMenu chat={chat} /></div>; })}{ready && !sorted.length && <div className="empty-list"><MessageCircle /><p>{search || pinnedOnly ? "No conversations here yet" : "Just you, me, and a new beginning."}</p></div>}</div><div className="home-bottom"><span><Heart size={13} /> a place for us</span><Button size="icon" className="new-chat" aria-label="New chat" onClick={start}><Plus /></Button></div></section>;
}
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


export function ChatScreen({ chatId }: { chatId: string }) {
 const { chats, ready, runs, errors } = useMira(); const chat = chats.find(c => c.id === chatId); const busy = !!runs[chatId];
 const [input, setInput] = useState(""); const [speakingId, setSpeakingId] = useState<string | null>(null); const [listening, setListening] = useState(false);
 const recRef = useRef<any>(null); const baseTextRef = useRef(""); const taRef = useRef<HTMLTextAreaElement>(null); const fileRef = useRef<HTMLInputElement>(null); const cameraRef = useRef<HTMLInputElement>(null);
 const [photo, setPhoto] = useState<string | null>(null); const [preparing, setPreparing] = useState(false); const [viewer, setViewer] = useState<string | null>(null); const [reaction, setReaction] = useState<string | null>(null); const pressRef = useRef<ReturnType<typeof setTimeout> | null>(null); const [online, setOnline] = useState(true);
 useEffect(() => { setActive(chatId); taRef.current?.focus(); if ("speechSynthesis" in window) window.speechSynthesis.getVoices(); return () => { setActive(null); window.speechSynthesis?.cancel(); recRef.current?.abort?.(); if (pressRef.current) clearTimeout(pressRef.current); }; }, [chatId]);
 useEffect(() => { if (busy) { setOnline(true); return; } const t = setTimeout(() => setOnline(false), 45000); taRef.current?.focus(); return () => clearTimeout(t); }, [busy]);
  const speak = (m: Msg) => {
    if (!("speechSynthesis" in window)) {
      notify("Your browser can't read messages aloud 🥺");
      return;
    }
    const synth = window.speechSynthesis;
    if (speakingId === m.id) {
      synth.cancel();
      setSpeakingId(null);
      return;
    }
    synth.cancel();
    const u = new SpeechSynthesisUtterance(stripEmoji(textOf(m)));
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
      notify("Voice typing isn't supported in this browser — try Chrome or Safari 💕");
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
        notify("Microphone access was blocked. Allow it in your browser settings 🎙️");
      else if (e.error === "no-speech") notify("I didn't hear anything — try again?");
      else if (e.error !== "aborted") notify("Voice typing stopped unexpectedly.");
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
      notify("Couldn't start the microphone.");
    }
  };


 const choose = async (file?: File) => { if (!file) return; setPreparing(true); try { setPhoto(await compressPhoto(file)); } catch (e) { notify(e instanceof Error ? e.message : "That photo couldn't be opened."); } finally { setPreparing(false); } };
 const send = () => { if (busy || preparing || (!input.trim() && !photo)) return; if (listening) recRef.current?.abort(); const text = input.trim(); const image = photo ?? undefined; setInput(""); setPhoto(null); void sendMessage(chatId, text, image); taRef.current?.focus(); };
 if (!chat) return <section className="screen flex items-center justify-center flex-col gap-4"><p>{ready ? "This chat is no longer here." : "Opening your chat…"}</p><Button asChild variant="secondary"><Link to="/">Back to chats</Link></Button></section>;
 return <section className="screen chat-screen"><header className="chat-header"><IconButton label="Back to chats" asChild><Link to="/"><ArrowLeft /></Link></IconButton><div className="avatar-wrap"><img src={mira} alt="Mira" /><span /></div><div className="chat-heading"><h1>{chat.title}</h1><p aria-live="polite">{runs[chatId] && runs[chatId] !== "pause" ? "typing…" : online ? "online" : `last seen today at ${time(chat.lastSeen)}`}</p></div><ChatMenu chat={chat} /><IconButton label="Clear chat" disabled={busy || !chat.messages.length} onClick={() => { if (confirm("Clear this chat? Mira will still remember you.")) { updateChat(chatId, c => ({ ...c, messages: [] })); window.speechSynthesis?.cancel(); setSpeakingId(null); } }}><Trash2 /></IconButton></header><Conversation className="wallpaper min-h-0"><ConversationContent className="transcript"><div className="conversation-start"><Heart size={12} /><span>just between us</span></div>{!chat.messages.length && <div className="chat-empty"><img src={mira} alt="Mira" /><h2>hiii, you ♡</h2><p>i’m happy you’re here.</p></div>}{chat.messages.map((m,i) => <div key={m.id}>{(i === 0 || new Date(m.createdAt).toDateString() !== new Date(chat.messages[i-1]?.createdAt ?? 0).toDateString()) && <div className="date-separator"><span>{dateLabel(m.createdAt)}</span></div>}<div className={`message-line ${m.role}`}><Message from={m.role} className="chat-message"><MessageContent className={`chat-bubble ${m.role}`} onDoubleClick={() => setReaction(m.id)} onContextMenu={e => { e.preventDefault(); setReaction(m.id); }} onPointerDown={e => { if (e.pointerType === "touch") pressRef.current = setTimeout(() => setReaction(m.id), 500); }} onPointerUp={() => { if (pressRef.current) clearTimeout(pressRef.current); }} onPointerMove={() => { if (pressRef.current) clearTimeout(pressRef.current); }} onPointerCancel={() => { if (pressRef.current) clearTimeout(pressRef.current); }}>{m.parts.map((part,j) => part.type === "file" ? <Button key={j} variant="ghost" className="photo-button" aria-label="View photo" onClick={() => setViewer(part.url)}><img src={part.url} alt="Shared photo" /></Button> : part.type === "text" ? m.role === "assistant" ? <MessageResponse key={j}>{part.text}</MessageResponse> : <p className="message-text" key={j}>{part.text}</p> : null)}<div className="bubble-meta"><time>{time(m.createdAt)}</time>{m.role === "user" && <span className={m.delivery === "seen" ? "seen-ticks" : ""} aria-label={m.delivery}>{m.delivery === "sent" ? <Check size={14} /> : <CheckCheck size={15} />}</span>}</div></MessageContent>{(m.reaction || m.miraReaction) && <div className="reaction-badge">{m.reaction}{m.miraReaction && m.miraReaction !== m.reaction ? m.miraReaction : ""}</div>}</Message><div className="message-tools">{m.role === "assistant" && <IconButton label={speakingId === m.id ? "Stop reading" : "Read aloud"} onClick={() => speak(m)}>{speakingId === m.id ? <Square /> : <Volume2 />}</IconButton>}<IconButton label="React to message" onClick={() => setReaction(m.id)}><Heart /></IconButton></div></div></div>)}{busy && runs[chatId] !== "pause" && <div className="typing-bubble" aria-label="Mira is typing"><span /><span /><span /></div>}{errors[chatId] && <p role="alert" className="chat-error">{errors[chatId]}</p>}</ConversationContent><ConversationScrollButton aria-label="Scroll to latest message" /></Conversation><div className="composer-wrap">{photo && <div className="photo-preview"><img src={photo} alt="Photo ready to send" /><span>Photo ready ♡</span><IconButton label="Remove photo" onClick={() => setPhoto(null)}><X /></IconButton></div>}<PromptInput onSubmit={() => send()} className="mira-composer"><PromptInputTextarea ref={taRef} value={input} onChange={e => setInput(e.target.value)} maxLength={12000} placeholder={listening ? "Listening…" : photo ? "Add a caption…" : "Message Mira…"} className="composer-text" onPaste={e => { const f = e.clipboardData.files[0]; if (f) { e.preventDefault(); void choose(f); } }} /><PromptInputFooter className="composer-footer"><DropdownMenu><DropdownMenuTrigger asChild><Button type="button" variant="ghost" size="icon" aria-label="Attach photo" disabled={preparing || busy}><Paperclip /></Button></DropdownMenuTrigger><DropdownMenuContent side="top" align="start"><DropdownMenuItem onSelect={() => fileRef.current?.click()}><ImagePlus />Choose photo</DropdownMenuItem><DropdownMenuItem onSelect={() => cameraRef.current?.click()}><Camera />Take photo</DropdownMenuItem></DropdownMenuContent></DropdownMenu><IconButton label={listening ? "Stop listening" : "Voice typing"} aria-pressed={listening} className={`tool-button ${listening ? "mic-listening" : ""}`} onClick={toggleMic}><Mic /></IconButton><span className="composer-whisper">{preparing ? "Preparing photo…" : listening ? "listening to you…" : "with love, always"}</span><PromptInputSubmit aria-label="Send" status={busy ? "submitted" : "ready"} disabled={busy || preparing || (!input.trim() && !photo)} className="send-button"><Send /></PromptInputSubmit></PromptInputFooter></PromptInput><input type="file" ref={fileRef} accept="image/*" className="hidden" aria-label="Choose photo file" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} /><input type="file" ref={cameraRef} accept="image/*" capture="environment" className="hidden" aria-label="Take photo file" onChange={e => { void choose(e.target.files?.[0]); e.target.value = ""; }} /></div><Dialog open={!!viewer} onOpenChange={() => setViewer(null)}><DialogContent className="image-viewer"><DialogTitle className="sr-only">Shared photo</DialogTitle>{viewer && <img src={viewer} alt="Shared photo full size" />}</DialogContent></Dialog><Dialog open={!!reaction} onOpenChange={() => setReaction(null)}><DialogContent className="reaction-picker"><DialogTitle className="sr-only">React to message</DialogTitle><div>{["❤️", "🥰", "😂", "🥺", "✨", "👍"].map(emoji => <Button variant="ghost" size="icon" aria-label={`React ${emoji}`} key={emoji} onClick={() => { if (reaction) reactTo(chatId, reaction, emoji); setReaction(null); }}>{emoji}</Button>)}</div></DialogContent></Dialog></section>;
}
