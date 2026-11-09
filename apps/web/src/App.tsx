import {
  Bot,
  CalendarClock,
  Captions,
  Coffee,
  Hammer,
  Hash,
  KeyRound,
  Languages,
  Lock,
  Megaphone,
  MessagesSquare,
  Moon,
  PartyPopper,
  Pause,
  Play,
  Plus,
  Presentation,
  Radio,
  ScrollText,
  Search,
  Send,
  Settings2,
  Sun,
  Timer,
  Trophy,
  Users,
  UtensilsCrossed,
  type LucideIcon,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { AGENDA, countdown, eventMinutes, label, nowAndNext, type AgendaItem } from "./agenda";
import { api, type ChatMessage, type Room, type Segment } from "./api";
import { AVPanel } from "./AVPanel";
import { DemoDock, type View } from "./DemoDock";
import { Insights } from "./Insights";
import { SampleSpeaker } from "./SampleSpeaker";
import { TagsContext, TrackTag } from "./tags";
import { Presenter } from "./Presenter";
import { signals } from "./live";
import { LANGUAGES } from "./Translate";
import { Button } from "./components/ui/button";

const clock = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const GROUPS: [Room["kind"], string, LucideIcon][] = [
  ["stage", "Main room", Radio],
  ["focus", "Focus groups", Users],
  ["team", "Team zones", Lock],
];
const KIND_TINT: Record<Room["kind"], string> = { stage: "bg-tint-stage", focus: "bg-tint-focus", team: "bg-tint-team" };
const AGENDA_ICON: Record<AgendaItem["icon"], LucideIcon> = {
  coffee: Coffee,
  megaphone: Megaphone,
  hammer: Hammer,
  food: UtensilsCrossed,
  panel: Presentation,
  trophy: Trophy,
  party: PartyPopper,
  send: Send,
};
type Tab = "transcript" | "chat" | "agenda";
type Theme = "light" | "dark";

function load<T>(key: string, fallback: T): T {
  try {
    const v = localStorage.getItem(key);
    return v ? (JSON.parse(v) as T) : fallback;
  } catch {
    return fallback;
  }
}
function save(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable: keep working without it */
  }
}
function byId<T extends { id: string }>(a: T[], b: T[], order: (x: T, y: T) => number) {
  const m = new Map<string, T>();
  for (const x of [...a, ...b]) m.set(x.id, x);
  return [...m.values()].sort(order);
}

export function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [zones, setZones] = useState<Room[]>(() => load<Room[]>("conferos-zones", []));
  const [roomId, setRoomId] = useState("main");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [theme, setTheme] = useState<Theme>(() => load<Theme>("conferos-theme", "light"));
  const [announce, setAnnounce] = useState(false);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState(false);
  const [calm, setCalm] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("transcript");
  const [view, setView] = useState<View>("participant");
  const [name, setName] = useState(() => load("conferos-name", ""));
  const [draft, setDraft] = useState("");
  const [lang, setLang] = useState("en");
  const [translated, setTranslated] = useState<Record<string, string>>({});
  const [langNote, setLangNote] = useState("");
  const [error, setError] = useState("");
  const [newName, setNewName] = useState("");
  const [newKind, setNewKind] = useState<"focus" | "team">("focus");
  const [joinCode, setJoinCode] = useState("");
  const [roomNote, setRoomNote] = useState("");
  const [minutes, setMinutes] = useState(() => eventMinutes());
  const pendingRef = useRef(new Set<string>());
  const [tags, setTags] = useState(true);
  const [voice, setVoice] = useState(false);
  const [speaking, setSpeaking] = useState(false);
  const [demoNote, setDemoNote] = useState("");
  const spokenRef = useRef("");
  const endRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.rooms().then(setRooms).catch((e: Error) => setError(e.message));
    const t = setInterval(() => setMinutes(eventMinutes()), 30000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => {
    save("conferos-theme", theme);
    document.documentElement.style.colorScheme = theme;
    document.body.style.background = theme === "dark" ? "#0a0f18" : "#f4f6fb";
  }, [theme]);

  const allRooms = [...rooms, ...zones.filter((z) => !rooms.some((r) => r.id === z.id))];
  const room = allRooms.find((r) => r.id === roomId);
  const code = zones.find((z) => z.id === roomId)?.code;

  useEffect(() => {
    setSegments([]);
    setMessages([]);
    setPaused(false);
    setTerm("");
    let current = true;
    const seq = (x: Segment, y: Segment) => x.seq - y.seq;
    const time = (x: ChatMessage, y: ChatMessage) => x.ts.localeCompare(y.ts);
    const stop = api.stream(roomId, code, {
      segment: (s) => current && setSegments((cur) => byId(cur, [s], seq)),
      message: (m) => current && setMessages((cur) => byId(cur, [m], time)),
      signal: (sig) => current && signals.emit(sig),
    });
    api.segments(roomId, code).then((l) => current && setSegments((cur) => byId(l, cur, seq))).catch((e: Error) => current && setError(e.message));
    api.messages(roomId, code).then((l) => current && setMessages((cur) => byId(l, cur, time))).catch(() => undefined);
    return () => {
      current = false;
      stop();
    };
  }, [roomId, code]);

  // Translate new lines as they arrive, so people can follow in their own language.
  useEffect(() => {
    if (lang === "en") return;
    const missing = segments.slice(-40).filter((s) => !translated[`${lang}:${s.id}`] && !pendingRef.current.has(`${lang}:${s.id}`));
    if (!missing.length) return;
    missing.forEach((s) => pendingRef.current.add(`${lang}:${s.id}`));
    api
      .translate(missing.map((s) => s.text), lang)
      .then((r) => {
        setTranslated((cur) => {
          const next = { ...cur };
          missing.forEach((s, i) => (next[`${lang}:${s.id}`] = r.texts[i] ?? s.text));
          return next;
        });
        setLangNote(r.failed.some(Boolean) ? "Some lines could not be translated and are shown in English." : "");
      })
      .catch((e: Error) => setLangNote(`Translation is not available right now (${e.message}). Showing English.`))
      .finally(() => missing.forEach((s) => pendingRef.current.delete(`${lang}:${s.id}`)));
  }, [segments, lang, translated]);

  function chooseLanguage(next: string) {
    setLang(next);
    setLangNote("");
  }
  const text = (s: Segment) => (lang === "en" ? s.text : translated[`${lang}:${s.id}`] ?? s.text);

  const upToNow = paused ? segments.slice(0, frozen) : segments;
  const visible = term ? upToNow.filter((s) => text(s).toLowerCase().includes(term.toLowerCase()) || s.text.toLowerCase().includes(term.toLowerCase())) : upToNow;
  const latest = upToNow.at(-1);
  const previous = upToNow.at(-2);
  const missed = paused ? segments.length - frozen : 0;
  const { now, next } = nowAndNext(minutes);

  // Demo sample speaker: a browser voice reads each new line aloud, in English, like a real speaker would.
  useEffect(() => {
    if (!voice || !latest || spokenRef.current === latest.id || !("speechSynthesis" in window)) return;
    spokenRef.current = latest.id;
    const u = new SpeechSynthesisUtterance(latest.text);
    u.lang = "en-US";
    // Prefer the most natural voice installed (Premium, Enhanced or Siri voices on a Mac, Google voices in Chrome).
    const voices = window.speechSynthesis.getVoices().filter((v) => v.lang.startsWith("en"));
    const prefer = [/premium/i, /enhanced/i, /natural/i, /neural/i, /siri/i, /Google US English/i, /Samantha/i, /Ava/i, /Daniel/i];
    const best = prefer.map((re) => voices.find((v) => re.test(v.name))).find(Boolean) ?? voices.find((v) => v.lang === "en-US");
    if (best) u.voice = best;
    u.rate = 1;
    u.pitch = 1;
    u.onstart = () => setSpeaking(true);
    u.onend = () => setSpeaking(false);
    window.speechSynthesis.speak(u);
  }, [voice, latest]);
  // Voices load asynchronously in some browsers; ask early so the first line does not use the fallback voice.
  useEffect(() => {
    if ("speechSynthesis" in window) window.speechSynthesis.getVoices();
  }, []);
  function startSample() {
    spokenRef.current = latest?.id ?? "";
    setVoice(true);
    setView("participant");
    setRoomId("main");
    api
      .replay("main", sessionStorage.getItem("presenterKey") ?? undefined, 6500)
      .then((r) => setDemoNote(`Sample speaker is reading ${r.queued} lines on the Main stage.`))
      .catch((e: Error) => setDemoNote(`Could not start the sample: ${e.message}`));
  }
  function stopSample() {
    setVoice(false);
    setSpeaking(false);
    if ("speechSynthesis" in window) window.speechSynthesis.cancel();
    setDemoNote("");
  }
  const left = countdown(minutes);

  useEffect(() => {
    if (!paused && !term) endRef.current?.scrollIntoView({ block: "end" });
  }, [segments.length, paused, term, tab]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, tab]);

  const me = name.trim() || "Guest";
  function send(textToSend: string) {
    const t = textToSend.trim();
    if (!t) return;
    save("conferos-name", me);
    setDraft("");
    api.sendMessage(roomId, me, t, code).catch((e: Error) => setError(e.message));
  }
  function remember(r: Room) {
    if (!r.priv) return;
    const nextZones = [...zones.filter((z) => z.id !== r.id), r];
    setZones(nextZones);
    save("conferos-zones", nextZones);
  }
  async function createRoom() {
    const n = newName.trim();
    if (!n) return;
    try {
      const r = await api.createRoom(n, newKind, newKind === "team");
      if (r.priv) remember(r);
      else setRooms((cur) => [...cur, r]);
      setRoomId(r.id);
      setNewName("");
      setRoomNote(r.priv ? `Team zone created. Share the join code ${r.code} with your team.` : "Focus group created.");
    } catch (e) {
      setRoomNote(`Could not create the room: ${(e as Error).message}`);
    }
  }
  async function join() {
    try {
      const r = await api.joinRoom(joinCode);
      remember(r);
      setRoomId(r.id);
      setJoinCode("");
      setRoomNote(`Joined ${r.name}.`);
    } catch (e) {
      setRoomNote((e as Error).message);
    }
  }
  const togglePause = () => {
    if (paused) setPaused(false);
    else {
      setFrozen(segments.length);
      setPaused(true);
    }
  };
  const tabs: [Tab, string, LucideIcon][] = [
    ["transcript", "Transcript", ScrollText],
    ["chat", "Chat", MessagesSquare],
    ["agenda", "Agenda", CalendarClock],
  ];
  const input = "min-h-11 min-w-0 rounded-xl border border-border bg-background px-3";
  const RoomIcon = (r: Room) => (r.kind === "stage" ? Radio : r.priv ? Lock : r.kind === "team" ? Users : Hash);
  const CurrentIcon = room ? RoomIcon(room) : Hash;

  return (
    <TagsContext.Provider value={tags}>
    <div data-theme={theme} data-contrast={contrast ? "high" : "normal"} style={{ ["--scale" as string]: scale }} className="dots min-h-screen bg-background text-foreground">
      <a href="#stage" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to live captions
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="relative flex items-center gap-3">
            <TrackTag track="Sonar" label="every change reviewed by Gitar" side="bottom" className="left-0 top-[calc(100%+2px)]" />
            <TrackTag track="Radar" label="runs on Kubernetes" side="bottom" className="left-[290px] top-[calc(100%+2px)]" />
            <span aria-hidden="true" className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-foreground">
              <Captions size={22} />
            </span>
            <div>
              <p className="font-display text-xl font-bold leading-tight">Backchannel</p>
              <p className="text-sm text-muted-foreground">Cloud Native Hackathon · Salt Lake City · Nov 9</p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="relative inline-flex items-center">
              <Languages size={18} aria-hidden="true" className="pointer-events-none absolute left-3 text-muted-foreground" />
              <TrackTag track="Merge Forward" label="live translation" side="bottom" className="left-0 top-[calc(100%+2px)]" />
              <label htmlFor="lang" className="sr-only">Caption language</label>
              <select id="lang" value={lang} onChange={(e) => chooseLanguage(e.target.value)} className={`${input} pl-9 font-bold`}>
                {LANGUAGES.map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </span>
            <button
              aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"}
              onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
              className="grid h-11 w-11 place-items-center rounded-xl border border-border bg-card hover:border-primary"
            >
              {theme === "light" ? <Moon size={20} aria-hidden="true" /> : <Sun size={20} aria-hidden="true" />}
            </button>
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 rounded-xl border border-border bg-card px-4 font-bold hover:border-primary [&::-webkit-details-marker]:hidden">
                <Settings2 size={18} aria-hidden="true" /> Display
              </summary>
              <div className="absolute right-0 top-[calc(100%+8px)] z-30 flex w-72 flex-col gap-3 rounded-2xl border border-border bg-card p-4 shadow-xl">
                <div className="flex items-center justify-between">
                  <span>Text size</span>
                  <span className="flex gap-2">
                    <Button variant="outline" aria-label="Smaller text" onClick={() => setScale((s) => Math.max(0.85, +(s - 0.15).toFixed(2)))}>A−</Button>
                    <Button variant="outline" aria-label="Larger text" onClick={() => setScale((s) => Math.min(1.6, +(s + 0.15).toFixed(2)))}>A+</Button>
                  </span>
                </div>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={contrast} onChange={(e) => setContrast(e.target.checked)} />Stronger contrast</label>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={calm} onChange={(e) => setCalm(e.target.checked)} />Captions only</label>
                <label className="flex min-h-11 items-center gap-3"><input type="checkbox" className="h-5 w-5" checked={announce} onChange={(e) => setAnnounce(e.target.checked)} />Read new lines with a screen reader</label>
              </div>
            </details>
          </div>
        </div>

        <div className="border-t border-border bg-muted/60">
          <div className="mx-auto flex max-w-[1440px] flex-wrap items-center gap-x-6 gap-y-1 px-4 py-2 text-sm">
            {now && (
              <span className="inline-flex items-center gap-2">
                <span className="live-dot text-live" aria-hidden="true" />
                <strong>Now:</strong> {now.title} <span className="text-muted-foreground">· {now.where}</span>
              </span>
            )}
            {next && (
              <span className="inline-flex items-center gap-2 text-muted-foreground">
                <CalendarClock size={16} aria-hidden="true" />
                <span><strong className="text-foreground">Next:</strong> {next.title} at {label(next.start)}</span>
              </span>
            )}
            {left && (
              <span className="ml-auto inline-flex items-center gap-2 rounded-full bg-sun px-3 py-1 font-bold text-[#0f1b2d]">
                <Timer size={16} aria-hidden="true" /> Submissions close in {left}
              </span>
            )}
          </div>
        </div>
        {langNote && <p role="status" className="mx-auto max-w-[1440px] px-4 pb-2 text-sm text-muted-foreground">{langNote}</p>}
      </header>

      <div className={`mx-auto grid gap-4 p-4 ${calm ? "max-w-4xl" : "max-w-[1440px] lg:grid-cols-[270px_minmax(0,1fr)_420px]"}`}>
        {!calm && (
          <nav aria-label="Rooms" className="relative flex flex-col gap-4 rounded-2xl border border-border bg-card p-3 lg:self-start">
            {GROUPS.map(([kind, groupLabel, GroupIcon]) => {
              const items = allRooms.filter((r) => r.kind === kind);
              return (
                <div key={kind}>
                  <h2 className="font-mono flex items-center gap-2 px-2 pb-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">
                    <GroupIcon size={14} aria-hidden="true" /> {groupLabel}
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {items.map((r) => {
                      const Icon = RoomIcon(r);
                      return (
                        <li key={r.id}>
                          <button
                            className="flex min-h-11 w-full items-center gap-3 rounded-xl px-2 text-left hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:font-bold"
                            aria-current={r.id === roomId}
                            onClick={() => setRoomId(r.id)}
                          >
                            <span aria-hidden="true" className={`grid h-8 w-8 shrink-0 place-items-center rounded-lg ${KIND_TINT[r.kind]}`}>
                              <Icon size={16} />
                            </span>
                            <span className="min-w-0 flex-1 truncate">{r.name}</span>
                            {r.priv && <span className="sr-only">(private)</span>}
                            {r.kind === "stage" && <span className="live-dot text-live" aria-label="Live" />}
                          </button>
                        </li>
                      );
                    })}
                    {items.length === 0 && <li className="px-3 text-sm text-muted-foreground">None yet. Start one below.</li>}
                  </ul>
                </div>
              );
            })}
            <details className="rounded-xl border border-dashed border-border p-2">
              <summary className="flex min-h-11 cursor-pointer list-none items-center gap-2 px-1 font-bold [&::-webkit-details-marker]:hidden">
                <Plus size={18} aria-hidden="true" /> Start or join a room
              </summary>
              <div className="flex flex-col gap-2 pt-2">
                <label htmlFor="newName" className="text-sm font-bold">Room name</label>
                <input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} className={input} placeholder="e.g. Rust and WebAssembly" />
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm font-bold">Kind</legend>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" checked={newKind === "focus"} onChange={() => setNewKind("focus")} /><Users size={16} aria-hidden="true" />Focus group, open to everyone</label>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" checked={newKind === "team"} onChange={() => setNewKind("team")} /><Lock size={16} aria-hidden="true" />Team zone, private with a code</label>
                </fieldset>
                <Button onClick={() => void createRoom()}><Plus size={16} aria-hidden="true" />Create room</Button>
                <label htmlFor="joinCode" className="pt-2 text-sm font-bold">Have a team zone code?</label>
                <div className="flex gap-2">
                  <input id="joinCode" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className={`${input} flex-1 uppercase`} placeholder="ABC123" />
                  <Button variant="outline" onClick={() => void join()}><KeyRound size={16} aria-hidden="true" />Join</Button>
                </div>
                {roomNote && <p role="status" className="text-sm">{roomNote}</p>}
              </div>
            </details>
          </nav>
        )}

        <main className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-center gap-3">
            <span aria-hidden="true" className={`grid h-12 w-12 place-items-center rounded-2xl ${room ? KIND_TINT[room.kind] : ""}`}>
              <CurrentIcon size={24} />
            </span>
            <div className="min-w-0">
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{room?.name ?? "Room"}</h1>
              <p className="text-muted-foreground">
                {room?.desc}
                {room?.priv && code ? ` · Private team zone, join code ${code}` : ""}
              </p>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-border bg-muted p-3">Something went wrong: {error}</p>}

          {!calm && room && (voice && view === "participant" && room.id === "main" ? (
            <SampleSpeaker speaking={speaking} caption={latest ? text(latest) : ""} speaker={latest?.speaker} />
          ) : (
            <AVPanel key={`${room.id}-${view}`} room={room} code={code} organizer={view === "organizer"} caption={latest ? text(latest) : ""} speaker={latest?.speaker} />
          ))}

          <div className="relative">
          <TrackTag track="Merge Forward" label="live captions anyone can read" side="bottom" className="-bottom-10 right-4" />
          <section id="stage" tabIndex={-1} aria-label="Live captions" className="relative overflow-hidden rounded-3xl bg-[#0d1422] text-white shadow-[0_24px_60px_-30px_rgba(15,27,45,0.55)]">
            <div className="flex items-center justify-between gap-2 px-5 pt-4 text-sm text-[#c9d4e6]">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1">
                <span className="live-dot text-[#ff8f7c]" aria-hidden="true" /> {paused ? "Paused" : "Live captions"}
              </span>
              <span className="inline-flex items-center gap-2"><ScrollText size={16} aria-hidden="true" />{segments.length} lines so far</span>
            </div>
            <div className={`flex flex-col justify-end gap-3 px-5 pb-5 pt-8 ${calm ? "min-h-[46vh]" : "min-h-[220px] lg:min-h-[280px]"}`}>
              {previous && !calm && <p lang={lang} className="text-[#a3b0c5]" style={{ fontSize: "calc(1.05rem * var(--scale))" }}>{text(previous)}</p>}
              <div aria-hidden="true" className="rounded-2xl bg-[#080c14] px-4 py-3">
                <span className="font-mono block text-[0.72rem] uppercase tracking-[0.12em] text-[#ffd84d]">{latest ? latest.speaker : "Waiting for the speaker"}</span>
                <p lang={lang} style={{ fontSize: `calc(${calm ? 2 : 1.5}rem * var(--scale))`, lineHeight: 1.35 }}>
                  {latest ? text(latest) : "Captions appear here as soon as someone speaks."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={togglePause} aria-pressed={paused} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                  {paused ? <Play size={18} aria-hidden="true" /> : <Pause size={18} aria-hidden="true" />}
                  {paused ? (missed > 0 ? `Jump to live (${missed} new)` : "Resume") : "Pause"}
                </button>
                {!calm && (
                  <button onClick={() => setTab("chat")} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                    <Bot size={18} aria-hidden="true" /> Ask the AI about this talk
                  </button>
                )}
              </div>
            </div>
          </section>
          </div>

          {view === "organizer" && !calm && <Insights roomId={roomId} code={code} />}

          {view === "organizer" && !calm && (
            <section aria-labelledby="org-h" className="rounded-2xl border border-border bg-card">
              <h2 id="org-h" className="font-display flex items-center gap-2 px-4 pt-4 text-xl font-bold"><Megaphone size={20} aria-hidden="true" /> Organizer tools</h2>
              <p className="px-4 text-sm text-muted-foreground">Caption the room from your microphone, or type an announcement.</p>
              <Presenter roomId={roomId} code={code} />
            </section>
          )}

          {calm && (
            <ol aria-label="Latest lines" className="flex flex-col gap-3">
              {upToNow.slice(-3).map((s) => (
                <li key={s.id} lang={lang} className="rounded-2xl border border-border bg-card p-4" style={{ fontSize: "calc(1.35rem * var(--scale))" }}>
                  <span className="font-mono block text-xs uppercase tracking-wide text-muted-foreground">{clock(s.ts)} · {s.speaker}</span>
                  {text(s)}
                </li>
              ))}
            </ol>
          )}
        </main>

        {!calm && (
          <aside aria-label="Transcript, chat and agenda" className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-[132px] lg:h-[calc(100vh-150px)]">
            <div role="tablist" aria-label="Room panel" className="flex gap-1 border-b border-border px-2 pt-2">
              {tabs.map(([id, tabLabel, Icon], i) => (
                <button
                  key={id}
                  role="tab"
                  id={`tab-${id}`}
                  aria-controls={`panel-${id}`}
                  aria-selected={tab === id}
                  tabIndex={tab === id ? 0 : -1}
                  onClick={() => setTab(id)}
                  onKeyDown={(e) => {
                    const d = e.key === "ArrowRight" ? 1 : e.key === "ArrowLeft" ? -1 : 0;
                    if (!d) return;
                    const nextTab = tabs[(i + d + tabs.length) % tabs.length]![0];
                    setTab(nextTab);
                    document.getElementById(`tab-${nextTab}`)?.focus();
                  }}
                  className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-t-lg border-b-[3px] border-transparent font-bold text-muted-foreground aria-selected:border-primary aria-selected:text-foreground"
                >
                  <Icon size={17} aria-hidden="true" /> {tabLabel}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="panel-transcript" aria-labelledby="tab-transcript" hidden={tab !== "transcript"} className="flex min-h-0 flex-1 flex-col">
              <div className="relative border-b border-border p-3">
                <TrackTag track="Elasticsearch" label="stores and searches every line" side="bottom" className="right-3 top-[56px]" />
                <Search size={18} aria-hidden="true" className="pointer-events-none absolute left-6 top-1/2 -translate-y-1/2 text-muted-foreground" />
                <label htmlFor="search" className="sr-only">Search what was said</label>
                <input id="search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search what was said" className={`${input} w-full pl-10`} />
              </div>
              <div role="log" aria-live={announce ? "polite" : "off"} aria-label="Transcript" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {visible.length === 0 && (
                  <div className="flex flex-col items-center gap-2 p-8 text-center text-muted-foreground">
                    <ScrollText size={28} aria-hidden="true" />
                    <p>{term ? `No lines match "${term}".` : "The transcript starts when someone speaks."}</p>
                  </div>
                )}
                {visible.map((s) => (
                  <div key={s.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 border-t border-border py-3 first:border-t-0">
                    <time className="font-mono whitespace-nowrap pt-1 text-xs text-muted-foreground">{clock(s.ts)}</time>
                    <p lang={lang} style={{ fontSize: "calc(1.02rem * var(--scale))", lineHeight: 1.5 }}>
                      <span className="font-mono block text-[0.7rem] uppercase tracking-wide text-muted-foreground">{s.speaker}</span>
                      {text(s)}
                    </p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div role="tabpanel" id="panel-chat" aria-labelledby="tab-chat" hidden={tab !== "chat"} className="flex min-h-0 flex-1 flex-col">
              <p className="relative flex items-start gap-2 px-4 pt-3 text-sm text-muted-foreground">
                <TrackTag track="AI + Elasticsearch" label="answers only from the transcript" side="bottom" className="right-3 top-[calc(100%+2px)]" />
                <Bot size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-primary" />
                <span>Chat with the room. Start a message with <strong className="text-foreground">@ai</strong> to ask about anything said here. It answers only from the transcript, with the time it was said.</span>
              </p>
              <div role="log" aria-live="polite" aria-label="Room chat" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.length === 0 && (
                  <div className="flex flex-col items-center gap-2 p-6 text-center text-muted-foreground">
                    <MessagesSquare size={28} aria-hidden="true" />
                    <p>No messages yet. Say hello, or ask the AI.</p>
                  </div>
                )}
                {messages.map((m) => {
                  const mine = m.author === me && !m.bot;
                  return (
                    <div key={m.id} className={`flex max-w-[92%] flex-col gap-1 ${mine ? "items-end self-end" : "self-start"}`}>
                      <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
                        {m.bot && <Bot size={14} aria-hidden="true" className="text-primary" />}
                        <strong className="text-foreground">{m.bot ? "Backchannel AI" : m.author}</strong> · {clock(m.ts)}
                      </span>
                      <p className={`rounded-2xl px-3 py-2 ${m.bot ? "border border-primary bg-accent" : mine ? "bg-primary text-primary-foreground" : "bg-muted"}`} style={{ fontSize: "calc(1rem * var(--scale))" }}>
                        {m.text}
                      </p>
                      {m.bot && m.citations && m.citations.length > 0 && (
                        <span className="flex flex-wrap gap-2 text-xs text-muted-foreground">
                          Source:
                          {m.citations.map((c) => (
                            <span key={c.seq} className="font-mono rounded-md border border-primary px-2 text-primary">Said at {clock(c.ts)}</span>
                          ))}
                        </span>
                      )}
                    </div>
                  );
                })}
                <div ref={chatEndRef} />
              </div>
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {["@ai When is lunch?", "@ai When do submissions close?"].map((s) => (
                  <button key={s} onClick={() => send(s)} className="inline-flex min-h-10 items-center gap-1 rounded-full border border-border bg-background px-3 text-sm hover:border-primary">
                    <Bot size={14} aria-hidden="true" /> {s.replace("@ai ", "")}
                  </button>
                ))}
              </div>
              <form
                className="flex flex-col gap-2 border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  send(draft);
                }}
              >
                <div className="flex gap-2">
                  <label htmlFor="name" className="sr-only">Your name</label>
                  <input id="name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" className={`${input} w-32`} />
                  <label htmlFor="draft" className="sr-only">Message</label>
                  <input id="draft" value={draft} onChange={(e) => setDraft(e.target.value)} placeholder="Message, or @ai and a question" className={`${input} flex-1`} />
                </div>
                <Button type="submit" className="self-end"><Send size={16} aria-hidden="true" />Send</Button>
              </form>
            </div>

            <div role="tabpanel" id="panel-agenda" aria-labelledby="tab-agenda" hidden={tab !== "agenda"} className="min-h-0 flex-1 overflow-y-auto p-4">
              <h2 className="font-display pb-3 text-lg font-bold">Today at the Cloud Native Hackathon</h2>
              <ol className="flex flex-col gap-2">
                {AGENDA.map((a) => {
                  const Icon = AGENDA_ICON[a.icon];
                  const isNow = now === a;
                  return (
                    <li key={a.start} aria-current={isNow ? "time" : undefined} className={`flex items-center gap-3 rounded-xl border p-3 ${isNow ? "border-primary bg-accent" : "border-border"}`}>
                      <span aria-hidden="true" className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-muted"><Icon size={18} /></span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-bold">{a.title}</span>
                        <span className="text-sm text-muted-foreground">{a.where}</span>
                      </span>
                      <span className="font-mono whitespace-nowrap text-sm">{label(a.start)}</span>
                      {isNow && <span className="rounded-full bg-live px-2 py-0.5 text-xs font-bold text-white">Now</span>}
                    </li>
                  );
                })}
              </ol>
            </div>
          </aside>
        )}
      </div>
      <DemoDock view={view} setView={setView} tags={tags} setTags={setTags} sampleOn={voice} onSample={startSample} onStopSample={stopSample} note={demoNote} />
    </div>
    </TagsContext.Provider>
  );
}
