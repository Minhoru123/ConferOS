import { Activity, Bot, Captions, ExternalLink, Languages, MessagesSquare, Timer, Users } from "lucide-react";
import { useEffect, useState } from "react";
import { api, type RoomStats } from "./api";
import { TrackTag } from "./tags";

/** Organizer's live numbers for the room. The same events are exported to Dash0 as OpenTelemetry metrics and traces. */
export function Insights({ roomId, code }: { roomId: string; code?: string }) {
  const [s, setS] = useState<RoomStats | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => api.stats(roomId, code).then((x) => alive && setS(x)).catch(() => undefined);
    load();
    const t = setInterval(load, 4000);
    return () => {
      alive = false;
      clearInterval(t);
    };
  }, [roomId, code]);
  const translated = s ? Object.values(s.translations).reduce((a, b) => a + b, 0) : 0;
  const langs = s ? Object.entries(s.translations).sort((a, b) => b[1] - a[1]).map(([k]) => k.toUpperCase()).join(", ") : "";
  const tiles = [
    { icon: Users, label: "Watching now", value: s?.watching ?? "–" },
    { icon: Captions, label: "Lines captioned", value: s?.lines ?? "–" },
    { icon: Timer, label: "Caption lag p50 / p95", value: s && s.lagP50 !== null ? `${(s.lagP50 / 1000).toFixed(1)}s / ${((s.lagP95 ?? 0) / 1000).toFixed(1)}s` : "No mic lines yet" },
    { icon: MessagesSquare, label: "Chat messages", value: s?.messages ?? "–" },
    { icon: Bot, label: "Questions to the AI", value: s?.aiQuestions ?? "–" },
    { icon: Languages, label: "Lines translated", value: translated ? `${translated} (${langs})` : "0" },
  ];
  return (
    <section aria-labelledby="ins-h" className="relative rounded-2xl border border-border bg-card p-4">
      <TrackTag track="Dash0" label="OpenTelemetry metrics and traces" className="-top-9 right-4" />
      <div className="flex flex-wrap items-center justify-between gap-2 pb-3">
        <h2 id="ins-h" className="font-display flex items-center gap-2 text-xl font-bold"><Activity size={20} aria-hidden="true" /> Live room insights</h2>
        <a href="https://app.dash0.com" target="_blank" rel="noreferrer" className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-border px-3 text-sm font-bold hover:border-primary">
          <ExternalLink size={16} aria-hidden="true" /> {s?.telemetry ? "Open in Dash0" : "Dash0 (telemetry off)"}
        </a>
      </div>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {tiles.map(({ icon: Icon, label, value }) => (
          <li key={label} className="rounded-xl bg-muted p-3">
            <span className="flex items-center gap-2 text-sm text-muted-foreground"><Icon size={16} aria-hidden="true" /> {label}</span>
            <span className="font-display block pt-1 text-2xl font-bold tabular-nums">{value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
