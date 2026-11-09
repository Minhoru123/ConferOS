import { useEffect, useRef, useState } from "react";
import { api, type Answer, type Room, type Segment } from "./api";
import { Button } from "./components/ui/button";

/**
 * Walking skeleton: room list, live transcript over SSE, and Ask with citations.
 * The full design is in design/prototype.html. Port it here piece by piece, keeping the accessibility behavior.
 */
export function App() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [roomId, setRoomId] = useState("main");
  const [segments, setSegments] = useState<Segment[]>([]);
  const [announce, setAnnounce] = useState(false);
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
    api.segments(roomId).then(setSegments).catch((e: Error) => setError(e.message));
    return api.stream(roomId, (s) => setSegments((cur) => (cur.some((c) => c.id === s.id) ? cur : [...cur, s])));
  }, [roomId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end" });
  }, [segments.length]);

  const room = rooms.find((r) => r.id === roomId);

  return (
    <div className="mx-auto grid min-h-screen max-w-6xl gap-4 p-4 md:grid-cols-[240px_1fr]">
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
          <div className="flex gap-2">
            <Button variant="outline" aria-pressed={announce} onClick={() => setAnnounce((a) => !a)}>
              Read new lines aloud
            </Button>
            <Button variant="outline" onClick={() => api.replay(roomId).catch((e: Error) => setError(e.message))}>
              Replay sample
            </Button>
          </div>
        </header>

        {error && <p role="alert" className="rounded-lg border border-border bg-muted p-3">Something went wrong: {error}</p>}

        <section aria-labelledby="t-h" className="rounded-2xl border border-border bg-card">
          <h3 id="t-h" className="border-b border-border px-4 py-3 font-bold">Live transcript</h3>
          <div id="transcript" role="log" aria-live={announce ? "polite" : "off"} tabIndex={0} className="max-h-[50vh] overflow-y-auto p-4">
            {segments.length === 0 && <p className="text-muted-foreground">The transcript starts when someone speaks.</p>}
            {segments.map((s) => (
              <p key={s.id} className="border-t border-border py-3 first:border-t-0">
                <span className="block text-xs uppercase tracking-wide text-muted-foreground">
                  {new Date(s.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {s.speaker}
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
          <div aria-live="polite" className="pt-3">
            {answer && (
              <p>
                {answer.answer}
                {answer.citations.map((c) => (
                  <span key={c.seq} className="ml-2 rounded border border-primary px-2 text-xs text-primary">
                    Said at {new Date(c.ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                  </span>
                ))}
              </p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
