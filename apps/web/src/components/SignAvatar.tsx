import { useEffect, useRef, useState } from "react";
import { api, type SignItem } from "../api";
import { createPlayer, loadAvatar, type SignPlayer } from "../live/signAvatar";

type Status = "loading" | "slow" | "ready" | "failed";

/** Stays mounted once it has been turned on, because the avatar can only be started once per page. */
export function SignAvatar({ roomId, code, on }: { roomId: string; code?: string; on: boolean }) {
  const [status, setStatus] = useState<Status>("loading");
  const [current, setCurrent] = useState<SignItem | null>(null);
  const [skipped, setSkipped] = useState(false);
  const player = useRef<SignPlayer | null>(null);
  // Lines said while the avatar loads, which can take 20 seconds or more. Only the newest are worth signing late.
  const waiting = useRef<SignItem[]>([]);

  useEffect(() => {
    // The avatar only finishes loading while its tab is on screen, so a slow start is not a failure.
    const slow = setTimeout(() => setStatus((s) => (s === "loading" ? "slow" : s)), 30000);
    loadAvatar()
      .then(() => {
        player.current ??= createPlayer({ onSay: setCurrent, onSkip: () => setSkipped(true) });
        waiting.current.splice(0).forEach((item) => player.current?.say(item));
        setStatus("ready");
      })
      .catch(() => setStatus("failed"))
      .finally(() => clearTimeout(slow));
    return () => clearTimeout(slow);
  }, []);

  useEffect(() => {
    if (!on) return;
    return api.signs(roomId, code, (item) => {
      if (player.current) {
        player.current.say(item);
        return;
      }
      waiting.current.push(item);
      if (waiting.current.length > 3) waiting.current.shift();
    });
  }, [roomId, code, on]);

  return (
    <section aria-labelledby="s-h" hidden={!on} className="rounded-2xl border border-border bg-card p-4">
      <h3 id="s-h" className="pb-2 font-bold">Sign language avatar (experimental)</h3>
      <div className="CWASAAvatar av0 mx-auto h-72 w-72 max-w-full" />
      <p role="status" className="pt-2 text-sm">
        {status === "loading" && "Loading the avatar."}
        {status === "slow" && "Still loading the avatar. Keep this tab on screen."}
        {status === "failed" && "The avatar could not load. It needs internet."}
      </p>
      <p className="pt-2 text-sm text-muted-foreground">
        Automatic, with a mixed sign vocabulary that is not ASL and has not been reviewed by anyone who signs. Captions are the reliable source.
      </p>
      {current && (
        <p className="flex flex-wrap gap-1 pt-2" aria-hidden="true">
          {current.tokens.map((token, i) => (
            <span key={i} className={`rounded border border-border px-2 text-sm ${token.hasSign ? "" : "line-through opacity-60"}`}>
              {token.word.replaceAll("_", " ")}
            </span>
          ))}
        </p>
      )}
      {skipped && <p className="pt-2 text-sm text-muted-foreground">Some signs were skipped to keep up with the speaker.</p>}
    </section>
  );
}
