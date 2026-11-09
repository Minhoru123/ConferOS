import { useEffect, useRef, useState } from "react";
import { api, type ChatMessage, type Room, type Segment } from "./api";
import { AVPanel } from "./AVPanel";
import { Presenter } from "./Presenter";
import { LANGUAGES, makeTranslator, translationSupported } from "./Translate";
import { Button } from "./components/ui/button";

const clock = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const GROUPS: [Room["kind"], string][] = [
  ["stage", "Main room"],
  ["focus", "Focus groups"],
  ["team", "Team zones"],
];
type Tab = "transcript" | "chat";
type View = "participant" | "organizer";

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
  const translatorRef = useRef<{ translate(t: string): Promise<string> } | null>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.rooms().then(setRooms).catch((e: Error) => setError(e.message));
  }, []);

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
    });
    api.segments(roomId, code).then((l) => current && setSegments((cur) => byId(l, cur, seq))).catch((e: Error) => current && setError(e.message));
    api.messages(roomId, code).then((l) => current && setMessages((cur) => byId(l, cur, time))).catch(() => undefined);
    return () => {
      current = false;
      stop();
    };
  }, [roomId, code]);

  // Translate new lines as they arrive, on the device.
  useEffect(() => {
    const t = translatorRef.current;
    if (lang === "en" || !t) return;
    let alive = true;
    (async () => {
      for (const s of segments.slice(-40)) {
        const k = `${lang}:${s.id}`;
        if (!alive) return;
        if (translated[k]) continue;
        try {
          const out = await t.translate(s.text);
          if (alive) setTranslated((cur) => ({ ...cur, [k]: out }));
        } catch {
          return;
        }
      }
    })();
    return () => {
      alive = false;
    };
  }, [segments, lang, translated]);

  async function chooseLanguage(next: string) {
    setLang(next);
    setLangNote("");
    translatorRef.current = null;
    if (next === "en") return;
    if (!translationSupported()) {
      setLangNote("Translation runs on your device in Chrome 138 or later. This browser does not support it yet.");
      return;
    }
    setLangNote("Preparing translation…");
    const t = await makeTranslator(next);
    if (!t) setLangNote("This language is not available for on-device translation in this browser.");
    else {
      translatorRef.current = t;
      setLangNote("");
      setTranslated((cur) => ({ ...cur }));
    }
  }
  const text = (s: Segment) => (lang === "en" ? s.text : translated[`${lang}:${s.id}`] ?? s.text);

  const upToNow = paused ? segments.slice(0, frozen) : segments;
  const visible = term ? upToNow.filter((s) => text(s).toLowerCase().includes(term.toLowerCase()) || s.text.toLowerCase().includes(term.toLowerCase())) : upToNow;
  const latest = upToNow.at(-1);
  const previous = upToNow.at(-2);
  const missed = paused ? segments.length - frozen : 0;

  useEffect(() => {
    if (!paused && !term) endRef.current?.scrollIntoView({ block: "end" });
  }, [segments.length, paused, term, tab]);
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ block: "end" });
  }, [messages.length, tab]);

  function send(textToSend: string) {
    const t = textToSend.trim();
    if (!t) return;
    const author = name.trim() || "Guest";
    save("conferos-name", author);
    setDraft("");
    api.sendMessage(roomId, author, t, code).catch((e: Error) => setError(e.message));
  }
  function remember(r: Room) {
    if (!r.priv) return;
    const next = [...zones.filter((z) => z.id !== r.id), r];
    setZones(next);
    save("conferos-zones", next);
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
  const tabs: [Tab, string][] = [
    ["transcript", "Transcript"],
    ["chat", "Chat"],
  ];
  const input = "min-h-11 min-w-0 rounded-xl border border-border bg-background px-3";

  return (
    <div data-contrast={contrast ? "high" : "normal"} style={{ ["--scale" as string]: scale }} className="min-h-screen bg-background text-foreground">
      <a href="#stage" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to live captions
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-card">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="font-display grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">B</span>
            <div>
              <p className="font-display text-xl font-bold leading-tight">Backchannel</p>
              <p className="text-sm text-muted-foreground">Cloud Native Hackathon · Salt Lake City</p>
            </div>
          </div>
          <div role="group" aria-label="View" className="flex rounded-xl border border-border bg-background p-1">
            {(["participant", "organizer"] as View[]).map((v) => (
              <button key={v} aria-pressed={view === v} onClick={() => setView(v)} className="min-h-10 rounded-lg px-4 font-bold text-muted-foreground aria-pressed:bg-primary aria-pressed:text-primary-foreground">
                {v === "participant" ? "Participant view" : "Organizer view"}
              </button>
            ))}
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label htmlFor="lang" className="sr-only">Caption language</label>
            <select id="lang" value={lang} onChange={(e) => void chooseLanguage(e.target.value)} className={`${input} font-bold`}>
              {LANGUAGES.map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
            <details className="relative">
              <summary className="flex min-h-11 cursor-pointer list-none items-center rounded-xl border border-border bg-card px-4 font-bold hover:border-primary [&::-webkit-details-marker]:hidden">Display</summary>
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
        {langNote && <p role="status" className="mx-auto max-w-[1440px] px-4 pb-2 text-sm text-muted-foreground">{langNote}</p>}
      </header>

      <div className={`mx-auto grid gap-4 p-4 ${calm ? "max-w-4xl" : "max-w-[1440px] lg:grid-cols-[260px_minmax(0,1fr)_420px]"}`}>
        {!calm && (
          <nav aria-label="Rooms" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-3 lg:self-start">
            {GROUPS.map(([kind, label]) => {
              const items = allRooms.filter((r) => r.kind === kind);
              return (
                <div key={kind}>
                  <h2 className="font-mono px-2 pb-1 text-[0.7rem] uppercase tracking-[0.12em] text-muted-foreground">{label}</h2>
                  <ul className="flex flex-col gap-1">
                    {items.map((r) => (
                      <li key={r.id}>
                        <button
                          className="flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left hover:bg-muted aria-[current=true]:bg-accent aria-[current=true]:font-bold"
                          aria-current={r.id === roomId}
                          onClick={() => setRoomId(r.id)}
                        >
                          <span aria-hidden="true" className="w-4 text-muted-foreground">{r.kind === "stage" ? "◉" : r.priv ? "🔒" : "#"}</span>
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.priv && <span className="sr-only">(private)</span>}
                        </button>
                      </li>
                    ))}
                    {items.length === 0 && <li className="px-3 text-sm text-muted-foreground">None yet</li>}
                  </ul>
                </div>
              );
            })}
            <details className="rounded-xl border border-border p-2">
              <summary className="min-h-11 cursor-pointer px-1 py-2 font-bold">Start or join a room</summary>
              <div className="flex flex-col gap-2 pt-2">
                <label htmlFor="newName" className="text-sm font-bold">Room name</label>
                <input id="newName" value={newName} onChange={(e) => setNewName(e.target.value)} className={input} placeholder="e.g. Kubernetes help" />
                <fieldset className="flex flex-col gap-1">
                  <legend className="text-sm font-bold">Kind</legend>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" checked={newKind === "focus"} onChange={() => setNewKind("focus")} />Focus group, open to everyone</label>
                  <label className="flex min-h-11 items-center gap-2"><input type="radio" name="kind" checked={newKind === "team"} onChange={() => setNewKind("team")} />Team zone, private with a join code</label>
                </fieldset>
                <Button onClick={() => void createRoom()}>Create room</Button>
                <label htmlFor="joinCode" className="pt-2 text-sm font-bold">Have a team zone code?</label>
                <div className="flex gap-2">
                  <input id="joinCode" value={joinCode} onChange={(e) => setJoinCode(e.target.value)} className={`${input} flex-1 uppercase`} placeholder="ABC123" />
                  <Button variant="outline" onClick={() => void join()}>Join</Button>
                </div>
                {roomNote && <p role="status" className="text-sm">{roomNote}</p>}
              </div>
            </details>
          </nav>
        )}

        <main className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{room?.name ?? "Room"}</h1>
              <p className="text-muted-foreground">
                {room?.desc}
                {room?.priv && code ? ` · Private team zone, join code ${code}` : ""}
              </p>
            </div>
          </div>

          {error && <p role="alert" className="rounded-xl border border-border bg-muted p-3">Something went wrong: {error}</p>}

          {!calm && room && <AVPanel key={`${room.id}-${view}`} room={room} organizer={view === "organizer"} caption={latest ? text(latest) : ""} speaker={latest?.speaker} />}

          <section id="stage" tabIndex={-1} aria-label="Live captions" className="relative overflow-hidden rounded-2xl bg-[#0d1422] text-white">
            <div className="flex items-center justify-between gap-2 px-5 pt-4 text-sm text-[#c9d4e6]">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1">
                <span className="live-dot text-[#ff8f7c]" aria-hidden="true" /> {paused ? "Paused" : "Live"}
              </span>
              <span>{segments.length} lines so far</span>
            </div>
            <div className={`flex flex-col justify-end gap-3 px-5 pb-5 pt-8 ${calm ? "min-h-[46vh]" : "min-h-[240px] lg:min-h-[300px]"}`}>
              {previous && !calm && <p lang={lang} className="text-[#a3b0c5]" style={{ fontSize: "calc(1.05rem * var(--scale))" }}>{text(previous)}</p>}
              <div aria-hidden="true" className="rounded-xl bg-[#080c14] px-4 py-3">
                <span className="font-mono block text-[0.72rem] uppercase tracking-[0.12em] text-[#ffd84d]">{latest ? latest.speaker : "Waiting for the speaker"}</span>
                <p lang={lang} style={{ fontSize: `calc(${calm ? 2 : 1.5}rem * var(--scale))`, lineHeight: 1.35 }}>
                  {latest ? text(latest) : "Captions appear here as soon as someone speaks."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={togglePause} aria-pressed={paused} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                  {paused ? (missed > 0 ? `Jump to live (${missed} new)` : "Resume") : "Pause"}
                </button>
              </div>
            </div>
          </section>

          {view === "organizer" && !calm && (
            <section aria-labelledby="org-h" className="rounded-2xl border border-border bg-card">
              <h2 id="org-h" className="font-display px-4 pt-4 text-xl font-bold">Organizer tools</h2>
              <p className="px-4 text-sm text-muted-foreground">Caption the room from your microphone, type an announcement, or replay a sample talk.</p>
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
          <aside aria-label="Transcript, chat and presenter tools" className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:sticky lg:top-[88px] lg:h-[calc(100vh-120px)]">
            <div role="tablist" aria-label="Room panel" className="flex gap-1 border-b border-border px-2 pt-2">
              {tabs.map(([id, label], i) => (
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
                    const next = tabs[(i + d + tabs.length) % tabs.length]![0];
                    setTab(next);
                    document.getElementById(`tab-${next}`)?.focus();
                  }}
                  className="min-h-11 flex-1 rounded-t-lg border-b-[3px] border-transparent font-bold text-muted-foreground aria-selected:border-primary aria-selected:text-foreground"
                >
                  {label}
                </button>
              ))}
            </div>

            <div role="tabpanel" id="panel-transcript" aria-labelledby="tab-transcript" hidden={tab !== "transcript"} className="flex min-h-0 flex-1 flex-col">
              <div className="flex gap-2 border-b border-border p-3">
                <label htmlFor="search" className="sr-only">Search what was said</label>
                <input id="search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search what was said" className={`${input} flex-1`} />
              </div>
              <div role="log" aria-live={announce ? "polite" : "off"} aria-label="Transcript" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {visible.length === 0 && <p className="p-3 text-muted-foreground">{term ? `No lines match "${term}".` : "The transcript starts when someone speaks."}</p>}
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
              <p className="px-4 pt-3 text-sm text-muted-foreground">Chat with the room. Start a message with <strong>@ai</strong> to ask about anything said here. It answers only from the transcript, with the time it was said.</p>
              <div role="log" aria-live="polite" aria-label="Room chat" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {messages.length === 0 && <p className="text-muted-foreground">No messages yet.</p>}
                {messages.map((m) => (
                  <div key={m.id} className={`flex max-w-[92%] flex-col gap-1 ${m.author === (name.trim() || "Guest") && !m.bot ? "self-end items-end" : "self-start"}`}>
                    <span className="text-xs text-muted-foreground">
                      {m.bot ? <strong className="text-foreground">Backchannel AI</strong> : <strong className="text-foreground">{m.author}</strong>} · {clock(m.ts)}
                    </span>
                    <p className={`rounded-2xl px-3 py-2 ${m.bot ? "border border-primary bg-accent" : m.author === (name.trim() || "Guest") ? "bg-primary text-primary-foreground" : "bg-muted"}`} style={{ fontSize: "calc(1rem * var(--scale))" }}>
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
                ))}
                <div ref={chatEndRef} />
              </div>
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {["@ai When is lunch?", "@ai When do submissions close?"].map((s) => (
                  <button key={s} onClick={() => send(s)} className="min-h-10 rounded-full border border-border bg-background px-3 text-sm hover:border-primary">{s}</button>
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
                <Button type="submit" className="self-end">Send</Button>
              </form>
            </div>

          </aside>
        )}
      </div>
    </div>
  );
}
