import { useEffect, useRef, useState } from "react";
import { api, type Answer, type Room, type Segment } from "./api";
import { Presenter } from "./Presenter";
import { Button } from "./components/ui/button";

const clock = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
const GROUPS: [Room["kind"], string][] = [
  ["stage", "Stage"],
  ["focus", "Focus rooms"],
  ["team", "Team rooms"],
];
const SUGGESTIONS = ["When is lunch?", "When do submissions close?", "Is there a quiet space?"];
type Tab = "transcript" | "ask" | "presenter";
interface Asked {
  q: string;
  a?: Answer;
  err?: string;
}

export function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("main");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [announce, setAnnounce] = useState(false);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState(false);
  const [calm, setCalm] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const [term, setTerm] = useState("");
  const [tab, setTab] = useState<Tab>("transcript");
  const [question, setQuestion] = useState("");
  const [asked, setAsked] = useState<Asked[]>([]);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);
  const askEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.rooms().then(setRooms).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setSegments([]);
    setAsked([]);
    setPaused(false);
    setTerm("");
    let current = true;
    const merge = (a: Segment[], b: Segment[]) => {
      const byId = new Map<string, Segment>();
      for (const s of [...a, ...b]) byId.set(s.id, s);
      return [...byId.values()].sort((x, y) => x.seq - y.seq);
    };
    const stop = api.stream(roomId, (s) => current && setSegments((cur) => merge(cur, [s])));
    api
      .segments(roomId)
      .then((list) => current && setSegments((cur) => merge(list, cur)))
      .catch((e: Error) => current && setError(e.message));
    return () => {
      current = false;
      stop();
    };
  }, [roomId]);

  const upToNow = paused ? segments.slice(0, frozen) : segments;
  const visible = term ? upToNow.filter((s) => s.text.toLowerCase().includes(term.toLowerCase())) : upToNow;
  const latest = upToNow.at(-1);
  const previous = upToNow.at(-2);
  const missed = paused ? segments.length - frozen : 0;

  useEffect(() => {
    if (!paused && !term) endRef.current?.scrollIntoView({ block: "end" });
  }, [segments.length, paused, term, tab]);
  useEffect(() => {
    askEndRef.current?.scrollIntoView({ block: "end" });
  }, [asked.length]);

  const room = rooms.find((r) => r.id === roomId);
  const ask = (q: string) => {
    const text = q.trim();
    if (!text) return;
    setQuestion("");
    setAsked((cur) => [...cur, { q: text }]);
    api
      .ask(roomId, text)
      .then((a) => setAsked((cur) => cur.map((x, i) => (i === cur.length - 1 ? { ...x, a } : x))))
      .catch((e: Error) => setAsked((cur) => cur.map((x, i) => (i === cur.length - 1 ? { ...x, err: e.message } : x))));
  };
  const togglePause = () => {
    if (paused) setPaused(false);
    else {
      setFrozen(segments.length);
      setPaused(true);
    }
  };
  const tabs: [Tab, string][] = [
    ["transcript", "Transcript"],
    ["ask", "Ask AI"],
    ["presenter", "Presenter"],
  ];

  return (
    <div data-contrast={contrast ? "high" : "normal"} style={{ ["--scale" as string]: scale }} className="min-h-screen bg-background text-foreground">
      <a href="#stage" className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-3 focus:py-2 focus:text-primary-foreground">
        Skip to live captions
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-card/95 backdrop-blur">
        <div className="mx-auto flex max-w-[1440px] flex-wrap items-center justify-between gap-3 px-4 py-3">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="font-display grid h-9 w-9 place-items-center rounded-xl bg-primary text-lg font-bold text-primary-foreground">B</span>
            <div>
              <p className="font-display text-xl font-bold leading-tight">Backchannel</p>
              <p className="text-sm text-muted-foreground">Cloud Native Hackathon · Salt Lake City</p>
            </div>
          </div>
          <div role="group" aria-label="Reading controls" className="flex flex-wrap items-center gap-2">
            <Button variant="outline" aria-label="Make text smaller" onClick={() => setScale((s) => Math.max(0.85, +(s - 0.15).toFixed(2)))}>A−</Button>
            <Button variant="outline" aria-label="Make text larger" onClick={() => setScale((s) => Math.min(1.6, +(s + 0.15).toFixed(2)))}>A+</Button>
            <Button variant="outline" aria-pressed={contrast} onClick={() => setContrast((c) => !c)}>High contrast</Button>
            <Button variant="outline" aria-pressed={calm} onClick={() => setCalm((c) => !c)}>Calm mode</Button>
            <Button variant="outline" aria-pressed={announce} onClick={() => setAnnounce((a) => !a)}>Read new lines aloud</Button>
          </div>
        </div>
      </header>

      <div className={`mx-auto grid gap-4 p-4 ${calm ? "max-w-4xl" : "max-w-[1440px] lg:grid-cols-[250px_minmax(0,1fr)_420px]"}`}>
        {!calm && (
          <nav aria-label="Rooms" className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-3 lg:self-start">
            {GROUPS.map(([kind, label]) => {
              const items = rooms.filter((r) => r.kind === kind);
              if (!items.length) return null;
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
                          <span aria-hidden="true" className="text-muted-foreground">{r.kind === "stage" ? "◉" : "#"}</span>
                          <span className="min-w-0 flex-1 truncate">{r.name}</span>
                          {r.id === roomId && <span className="text-[#c2331f] dark:text-[#ff8f7c]"><span className="live-dot" aria-hidden="true" /><span className="sr-only">Live</span></span>}
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </nav>
        )}

        <main className="flex min-w-0 flex-col gap-4">
          <div className="flex flex-wrap items-end justify-between gap-2">
            <div>
              <h1 className="font-display text-2xl font-bold sm:text-3xl">{room?.name ?? "Room"}</h1>
              <p className="text-muted-foreground">{room?.desc}</p>
            </div>
            <span className="font-mono inline-flex items-center gap-2 text-xs font-medium uppercase tracking-[0.1em] text-[#c2331f]">
              <span className="live-dot" aria-hidden="true" /> {paused ? "Paused" : "Live captions"}
            </span>
          </div>

          {error && <p role="alert" className="rounded-xl border border-border bg-muted p-3">Something went wrong: {error}</p>}

          <section id="stage" tabIndex={-1} aria-label="Live captions" className="relative overflow-hidden rounded-2xl bg-[#0d1422] text-white shadow-[0_24px_60px_-30px_rgba(15,27,45,0.6)]">
            <div className="flex items-center justify-between gap-2 px-5 pt-4 text-sm text-[#c9d4e6]">
              <span className="inline-flex items-center gap-2 rounded-full bg-black/40 px-3 py-1">
                <span className="live-dot text-[#ff8f7c]" aria-hidden="true" /> Live
              </span>
              <span>{segments.length} lines so far</span>
            </div>
            <div className={`flex flex-col justify-end gap-3 px-5 pb-5 pt-8 ${calm ? "min-h-[46vh]" : "min-h-[260px] lg:min-h-[460px]"}`}>
              {previous && !calm && <p className="text-[#8e9bb5]" style={{ fontSize: "calc(1.05rem * var(--scale))" }}>{previous.text}</p>}
              <div aria-hidden="true" className="rounded-xl bg-[#080c14] px-4 py-3">
                <span className="font-mono block text-[0.72rem] uppercase tracking-[0.12em] text-[#ffd84d]">{latest ? latest.speaker : "Waiting for the speaker"}</span>
                <p style={{ fontSize: `calc(${calm ? 2 : 1.5}rem * var(--scale))`, lineHeight: 1.35 }}>
                  {latest ? latest.text : "Captions appear here as soon as someone speaks."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button onClick={togglePause} aria-pressed={paused} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                  {paused ? (missed > 0 ? `Jump to live (${missed} new)` : "Resume") : "Pause"}
                </button>
                {!calm && (
                  <button onClick={() => setTab("ask")} className="min-h-11 rounded-xl bg-white/10 px-4 font-bold hover:bg-white/20">
                    Ask about this talk
                  </button>
                )}
              </div>
            </div>
          </section>

          {calm && (
            <ol aria-label="Latest lines" className="flex flex-col gap-3">
              {upToNow.slice(-3).map((s) => (
                <li key={s.id} className="rounded-2xl border border-border bg-card p-4" style={{ fontSize: "calc(1.35rem * var(--scale))" }}>
                  <span className="font-mono block text-xs uppercase tracking-wide text-muted-foreground">{clock(s.ts)} · {s.speaker}</span>
                  {s.text}
                </li>
              ))}
            </ol>
          )}
        </main>

        {!calm && (
          <aside aria-label="Transcript, Ask and presenter tools" className="flex min-h-[520px] flex-col overflow-hidden rounded-2xl border border-border bg-card lg:h-[calc(100vh-120px)] lg:sticky lg:top-[88px]">
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
                <label htmlFor="search" className="sr-only">Search this transcript</label>
                <input id="search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search what was said" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3" />
              </div>
              <div role="log" aria-live={announce ? "polite" : "off"} aria-label="Transcript" tabIndex={0} className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
                {visible.length === 0 && <p className="p-3 text-muted-foreground">{term ? `No lines match "${term}".` : "The transcript starts when someone speaks."}</p>}
                {visible.map((s) => (
                  <div key={s.id} className="grid grid-cols-[76px_minmax(0,1fr)] gap-2 border-t border-border py-3 first:border-t-0">
                    <time className="font-mono whitespace-nowrap pt-1 text-xs text-muted-foreground">{clock(s.ts)}</time>
                    <p style={{ fontSize: "calc(1.02rem * var(--scale))", lineHeight: 1.5 }}>
                      <span className="font-mono block text-[0.7rem] uppercase tracking-wide text-muted-foreground">{s.speaker}</span>
                      {s.text}
                    </p>
                  </div>
                ))}
                <div ref={endRef} />
              </div>
            </div>

            <div role="tabpanel" id="panel-ask" aria-labelledby="tab-ask" hidden={tab !== "ask"} className="flex min-h-0 flex-1 flex-col">
              <p className="px-4 pt-3 text-sm text-muted-foreground">Answers come only from what was said in this room, with the time it was said.</p>
              <div aria-live="polite" className="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto p-4">
                {asked.length === 0 && <p className="text-muted-foreground">Ask anything about this room, for example "{SUGGESTIONS[0]}"</p>}
                {asked.map((x, i) => (
                  <div key={i} className="flex flex-col gap-2">
                    <p className="max-w-[90%] self-end rounded-2xl bg-primary px-3 py-2 text-primary-foreground" style={{ fontSize: "calc(1rem * var(--scale))" }}>{x.q}</p>
                    <div className="max-w-[92%] self-start rounded-2xl bg-muted px-3 py-2" style={{ fontSize: "calc(1rem * var(--scale))" }}>
                      {!x.a && !x.err && <span className="text-muted-foreground">Looking through the transcript…</span>}
                      {x.err && <span>Could not get an answer: {x.err}</span>}
                      {x.a && (
                        <>
                          <p>{x.a.answer}</p>
                          {x.a.citations.length > 0 && (
                            <p className="mt-2 flex flex-wrap gap-2 text-xs text-muted-foreground">
                              Source:
                              {x.a.citations.map((c) => (
                                <span key={c.seq} className="font-mono rounded-md border border-primary px-2 text-primary">Said at {clock(c.ts)}</span>
                              ))}
                            </p>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ))}
                <div ref={askEndRef} />
              </div>
              <div className="flex flex-wrap gap-2 px-4 pb-2">
                {SUGGESTIONS.map((s) => (
                  <button key={s} onClick={() => ask(s)} className="min-h-10 rounded-full border border-border bg-background px-3 text-sm hover:border-primary">{s}</button>
                ))}
              </div>
              <form
                className="flex gap-2 border-t border-border p-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  ask(question);
                }}
              >
                <label htmlFor="q" className="sr-only">Ask about this room</label>
                <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="Ask about what was said" className="min-h-11 min-w-0 flex-1 rounded-xl border border-border bg-background px-3" />
                <Button type="submit">Ask</Button>
              </form>
            </div>

            <div role="tabpanel" id="panel-presenter" aria-labelledby="tab-presenter" hidden={tab !== "presenter"} className="min-h-0 flex-1 overflow-y-auto">
              <Presenter roomId={roomId} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
