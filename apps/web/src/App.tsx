import { useEffect, useRef, useState } from "react";
import { api, type Answer, type Room, type Segment } from "./api";
import { Presenter } from "./Presenter";
import { Button } from "./components/ui/button";

const clock = (ts: string) => new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

/**
 * Live transcript, search, Ask with citations, presenter captions, and reading controls.
 * The full design is in design/prototype.html. Port it here piece by piece, keeping the accessibility behavior.
 */
export function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("main");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [announce, setAnnounce] = useState(false);
  const [scale, setScale] = useState(1);
  const [contrast, setContrast] = useState(false);
  const [paused, setPaused] = useState(false);
  const [frozen, setFrozen] = useState(0);
  const [term, setTerm] = useState("");
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState<Answer | null>(null);
  const [error, setError] = useState("");
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.rooms().then(setRooms).catch((e: Error) => setError(e.message));
  }, []);

  useEffect(() => {
    setSegments([]);
    setAnswer(null);
    setPaused(false);
    setTerm("");
    api.segments(roomId).then(setSegments).catch((e: Error) => setError(e.message));
    return api.stream(roomId, (s) => setSegments((cur) => (cur.some((c) => c.id === s.id) ? cur : [...cur, s])));
  }, [roomId]);

  // While paused, the transcript stops at the line that was last when the pause began. New lines keep arriving behind it.
  const upToNow = paused ? segments.slice(0, frozen) : segments;
  const visible = term ? upToNow.filter((s) => s.text.toLowerCase().includes(term.toLowerCase())) : upToNow;
  const latest = upToNow.at(-1);
  const missed = paused ? segments.length - frozen : 0;

  useEffect(() => {
    if (!paused && !term) endRef.current?.scrollIntoView({ block: "end" });
  }, [segments.length, paused, term]);

  const room = rooms.find((r) => r.id === roomId);

  return (
    <div data-contrast={contrast ? "high" : "normal"} style={{ ["--scale" as string]: scale }} className="min-h-screen bg-background text-foreground">
      <div className="mx-auto grid max-w-6xl gap-4 p-4 md:grid-cols-[240px_1fr]">
        <a href="#transcript" className="sr-only focus:not-sr-only">Skip to transcript</a>
        <nav aria-label="Rooms" className="rounded-2xl border border-border bg-card p-3">
          <h1 className="px-2 pb-2 text-xl font-bold">Backchannel</h1>
          <ul className="flex flex-col gap-1">
            {rooms.map((r) => (
              <li key={r.id}>
                <button
                  className="min-h-11 w-full rounded-lg px-3 text-left hover:bg-accent aria-[current=true]:bg-accent aria-[current=true]:font-bold"
                  aria-current={r.id === roomId}
                  onClick={() => setRoomId(r.id)}
                >
                  {r.name}
                </button>
              </li>
            ))}
          </ul>
        </nav>

        <main className="flex min-w-0 flex-col gap-4">
          <header className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h2 className="text-2xl font-bold">{room?.name ?? "Room"}</h2>
              <p className="text-muted-foreground">{room?.desc}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Reading controls">
              <Button variant="outline" aria-label="Make text smaller" onClick={() => setScale((s) => Math.max(0.85, +(s - 0.15).toFixed(2)))}>A−</Button>
              <Button variant="outline" aria-label="Make text larger" onClick={() => setScale((s) => Math.min(1.6, +(s + 0.15).toFixed(2)))}>A+</Button>
              <Button variant="outline" aria-pressed={contrast} onClick={() => setContrast((c) => !c)}>High contrast</Button>
              <Button variant="outline" aria-pressed={announce} onClick={() => setAnnounce((a) => !a)}>Read new lines aloud</Button>
            </div>
          </header>

          {error && <p role="alert" className="rounded-lg border border-border bg-muted p-3">Something went wrong: {error}</p>}

          <div aria-hidden="true" className="rounded-2xl bg-[#080c14] px-4 py-3 text-white" style={{ fontSize: "calc(1.25rem * var(--scale))", lineHeight: 1.4 }}>
            <span className="block font-mono text-[0.7rem] uppercase tracking-widest text-[#ffd84d]">{latest ? latest.speaker : "Live captions"}</span>
            {latest ? latest.text : "Captions appear here as soon as someone speaks."}
          </div>

          <section aria-labelledby="t-h" className="rounded-2xl border border-border bg-card">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
              <h3 id="t-h" className="font-bold">Live transcript</h3>
              <div className="flex flex-wrap items-center gap-2">
                <label htmlFor="search" className="sr-only">Search this transcript</label>
                <input id="search" type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search what was said" className="min-h-11 w-56 max-w-full rounded-lg border border-border bg-background px-3" />
                <Button
                  variant={paused ? "default" : "outline"}
                  aria-pressed={paused}
                  onClick={() => {
                    if (paused) setPaused(false);
                    else {
                      setFrozen(segments.length);
                      setPaused(true);
                    }
                  }}
                >
                  {paused ? (missed > 0 ? `Jump to live (${missed} new)` : "Resume") : "Pause"}
                </Button>
              </div>
            </div>
            <div id="transcript" role="log" aria-live={announce ? "polite" : "off"} aria-label="Live transcript" tabIndex={0} className="max-h-[50vh] overflow-y-auto p-4">
              {visible.length === 0 && <p className="text-muted-foreground">{term ? `No lines match "${term}".` : "The transcript starts when someone speaks."}</p>}
              {visible.map((s) => (
                <p key={s.id} className="border-t border-border py-3 first:border-t-0" style={{ fontSize: "calc(1.05rem * var(--scale))", lineHeight: 1.5 }}>
                  <span className="block font-mono text-xs uppercase tracking-wide text-muted-foreground">
                    {clock(s.ts)} · {s.speaker}
                  </span>
                  {s.text}
                </p>
              ))}
              <div ref={endRef} />
            </div>
          </section>

          <section aria-labelledby="a-h" className="rounded-2xl border border-border bg-card p-4">
            <h3 id="a-h" className="pb-2 font-bold">Ask about this room</h3>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (question.trim()) api.ask(roomId, question.trim()).then(setAnswer).catch((err: Error) => setError(err.message));
              }}
            >
              <label htmlFor="q" className="sr-only">Question</label>
              <input id="q" value={question} onChange={(e) => setQuestion(e.target.value)} placeholder="When is lunch?" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" />
              <Button type="submit">Ask</Button>
            </form>
            <div aria-live="polite" className="pt-3" style={{ fontSize: "calc(1rem * var(--scale))" }}>
              {answer && (
                <p>
                  {answer.answer}
                  {answer.citations.map((c) => (
                    <span key={c.seq} className="ml-2 rounded border border-primary px-2 text-xs text-primary">Said at {clock(c.ts)}</span>
                  ))}
                </p>
              )}
            </div>
          </section>

          <details className="rounded-2xl border border-border bg-card">
            <summary className="min-h-11 cursor-pointer px-4 py-3 font-bold">Presenter tools</summary>
            <Presenter roomId={roomId} />
          </details>
        </main>
      </div>
    </div>
  );
}
