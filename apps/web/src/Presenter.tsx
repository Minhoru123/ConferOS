import { Mic, MicOff, PlayCircle, Send } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";
import { Button } from "./components/ui/button";

// The few parts of the browser's Web Speech API this file uses.
interface SpeechAlt {
  transcript: string;
}
interface SpeechResult {
  isFinal: boolean;
  0: SpeechAlt;
}
interface SpeechEvent {
  resultIndex: number;
  results: ArrayLike<SpeechResult>;
}
interface Recognizer {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((e: SpeechEvent) => void) | null;
  onerror: ((e: { error: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
}
type RecognizerCtor = new () => Recognizer;

function recognizerCtor(): RecognizerCtor | undefined {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
}

function describeError(code: string): string {
  if (code === "not-allowed" || code === "service-not-allowed") return "The microphone is blocked. Allow it in the browser's address bar, then press Start again.";
  if (code === "network") return "The browser's speech service could not be reached. Captions from the microphone need an internet connection.";
  if (code === "audio-capture") return "No microphone was found.";
  return `Speech recognition stopped (${code}).`;
}

/**
 * Presenter tools: live captions from the microphone, or typed lines as a fallback.
 * Microphone captions use the browser's built-in speech recognition (Chrome or Edge). The audio goes to the
 * browser vendor's speech service, not to this app. It only works on localhost or HTTPS.
 */
export function Presenter({ roomId, code }: { roomId: string; code?: string }) {
  const [keyRequired, setKeyRequired] = useState(false);
  const [key, setKey] = useState(() => sessionStorage.getItem("presenterKey") ?? "");
  const [speaker, setSpeaker] = useState("Speaker");
  const [listening, setListening] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const [typed, setTyped] = useState("");
  const supported = Boolean(recognizerCtor());

  const wantRef = useRef(false);
  const recRef = useRef<Recognizer | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const roomRef = useRef(roomId);
  const codeRef = useRef(code);
  codeRef.current = code;
  const keyRef = useRef(key);
  const speakerRef = useRef(speaker);
  roomRef.current = roomId;
  keyRef.current = key;
  speakerRef.current = speaker;

  useEffect(() => {
    api.config().then((c) => setKeyRequired(c.presenterKeyRequired)).catch(() => undefined);
  }, []);

  function send(text: string, source: "mic" | "typed", lagMs?: number, room = roomRef.current) {
    api
      .addLine(room, { speaker: speakerRef.current.trim() || "Speaker", text, source, ...(lagMs !== undefined ? { lagMs } : {}) }, keyRef.current || undefined, codeRef.current)
      .then(() => setSent((n) => n + 1))
      .catch((e: Error) => setError(e instanceof ApiError && e.status === 401 ? "The presenter key is missing or wrong." : `Could not send the line: ${e.message}`));
  }

  function stop() {
    wantRef.current = false;
    // Send whatever was said before stopping, to the room it was said in.
    flushRef.current?.();
    flushRef.current = null;
    const rec = recRef.current;
    if (rec) {
      // Drop any final result the browser still delivers after stop, so it cannot land in another room.
      rec.onresult = null;
      rec.onend = null;
    }
    rec?.stop();
    recRef.current = null;
    setListening(false);
  }

  function start() {
    const Ctor = recognizerCtor();
    if (!Ctor) return;
    setError("");
    const rec = new Ctor();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    const room = roomRef.current;
    let lastInterim = 0;
    // Browsers finalize speech at every short pause, so join the pieces into one line per sentence or pause.
    const PAUSE_MS = 1400;
    let buffer = "";
    let bufferLag = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const text = buffer.trim();
      buffer = "";
      if (text) send(text.charAt(0).toUpperCase() + text.slice(1), "mic", bufferLag, room);
    };
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, PAUSE_MS);
    };
    flushRef.current = flush;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (!r.isFinal) {
          lastInterim = Date.now();
          if (buffer) later(); // still talking: keep the line open
          continue;
        }
        const text = r[0].transcript.trim();
        if (!text) continue;
        // Lag = how long after the last partial caption the final text arrived.
        bufferLag = Math.round(lastInterim ? Math.min(120000, Math.max(0, Date.now() - lastInterim)) : 0);
        lastInterim = 0;
        buffer += (buffer ? " " : "") + text;
        if (/[.?!]$/.test(text) || buffer.length > 160) flush();
        else later();
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(describeError(e.error));
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") stop();
    };
    // Browsers end a session after a while or after silence. Start another one while the presenter wants captions.
    rec.onend = () => {
      lastInterim = 0;
      if (!wantRef.current) return setListening(false);
      setTimeout(() => {
        try {
          if (wantRef.current) rec.start();
        } catch {
          /* already starting */
        }
      }, 300);
    };
    wantRef.current = true;
    recRef.current = rec;
    try {
      rec.start();
      setListening(true);
    } catch {
      setError("Could not start the microphone.");
    }
  }

  // Captions must not leak into another room when the presenter switches rooms.
  useEffect(() => stop, [roomId]);

  return (
    <div className="flex flex-col gap-3 p-4">
      {keyRequired && (
        <div className="flex flex-col gap-1">
          <label htmlFor="pkey" className="text-sm font-bold">Presenter key</label>
          <input
            id="pkey"
            type="password"
            value={key}
            autoComplete="off"
            onChange={(e) => {
              setKey(e.target.value);
              sessionStorage.setItem("presenterKey", e.target.value);
            }}
            className="min-h-11 rounded-lg border border-border bg-background px-3"
          />
        </div>
      )}

      <div className="flex flex-col gap-1">
        <label htmlFor="speaker" className="text-sm font-bold">Speaker name shown on captions</label>
        <input id="speaker" value={speaker} onChange={(e) => setSpeaker(e.target.value)} className="min-h-11 rounded-lg border border-border bg-background px-3" />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button aria-pressed={listening} disabled={!supported} onClick={listening ? stop : start}>
          {listening ? <MicOff size={18} aria-hidden="true" /> : <Mic size={18} aria-hidden="true" />}
          {listening ? "Stop captions" : "Start captions from microphone"}
        </Button>
        <p role="status" className="text-sm text-muted-foreground">
          {!supported ? "Microphone captions need Chrome or Edge." : listening ? `Listening. ${sent} lines sent.` : sent ? `Stopped. ${sent} lines sent.` : "Not listening."}
        </p>
      </div>
      {supported && <p className="text-sm text-muted-foreground">Audio goes to your browser's speech service. Use localhost or HTTPS and allow the microphone.</p>}
      {error && <p role="alert" className="rounded-lg border border-border bg-muted p-3 text-sm">{error}</p>}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (typed.trim()) {
            send(typed.trim(), "typed");
            setTyped("");
          }
        }}
      >
        <label htmlFor="typed" className="sr-only">Type a caption line</label>
        <input id="typed" value={typed} onChange={(e) => setTyped(e.target.value)} placeholder="Or type a line" className="min-h-11 min-w-0 flex-1 rounded-lg border border-border bg-background px-3" />
        <Button type="submit" variant="outline"><Send size={16} aria-hidden="true" />Send line</Button>
      </form>

      <Button variant="ghost" className="self-start" onClick={() => api.replay(roomId, key || undefined).catch((e: Error) => setError(e.message))}>
        <PlayCircle size={18} aria-hidden="true" /> Replay sample talk
      </Button>
    </div>
  );
}
