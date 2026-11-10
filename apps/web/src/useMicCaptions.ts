import { useEffect, useRef, useState } from "react";
import { api, ApiError } from "./api";

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
const ctor = () => {
  const w = window as unknown as { SpeechRecognition?: RecognizerCtor; webkitSpeechRecognition?: RecognizerCtor };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition;
};

/** Microphone captions into a room: browser speech recognition, joined into one line per sentence or pause. */
export function useMicCaptions(roomId: string, code: string | undefined, speaker: string) {
  const [listening, setListening] = useState(false);
  const [sent, setSent] = useState(0);
  const [error, setError] = useState("");
  const wantRef = useRef(false);
  const recRef = useRef<Recognizer | null>(null);
  const flushRef = useRef<(() => void) | null>(null);
  const roomRef = useRef(roomId);
  roomRef.current = roomId;
  const speakerRef = useRef(speaker);
  speakerRef.current = speaker;
  const supported = Boolean(ctor());

  function post(room: string, text: string, lagMs: number) {
    api
      .addLine(room, { speaker: speakerRef.current, text, source: "mic", lagMs }, sessionStorage.getItem("presenterKey") ?? undefined, code)
      .then(() => setSent((n) => n + 1))
      .catch((e: Error) => setError(e instanceof ApiError && e.status === 401 ? "The presenter key is missing or wrong." : `Could not send the line: ${e.message}`));
  }
  function stop() {
    wantRef.current = false;
    flushRef.current?.();
    flushRef.current = null;
    const rec = recRef.current;
    if (rec) {
      rec.onresult = null;
      rec.onend = null;
      rec.stop();
    }
    recRef.current = null;
    setListening(false);
  }
  function start() {
    const C = ctor();
    if (!C) return;
    setError("");
    const rec = new C();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    const room = roomRef.current;
    let lastInterim = 0;
    let buffer = "";
    let lag = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const flush = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
      const text = buffer.trim();
      buffer = "";
      if (text) post(room, text.charAt(0).toUpperCase() + text.slice(1), lag);
    };
    const later = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(flush, 1400);
    };
    flushRef.current = flush;
    rec.onresult = (e) => {
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i]!;
        if (!r.isFinal) {
          lastInterim = Date.now();
          if (buffer) later();
          continue;
        }
        const text = r[0].transcript.trim();
        if (!text) continue;
        lag = Math.round(lastInterim ? Math.min(120000, Math.max(0, Date.now() - lastInterim)) : 0);
        lastInterim = 0;
        buffer += (buffer ? " " : "") + text;
        if (/[.?!]$/.test(text) || buffer.length > 160) flush();
        else later();
      }
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech" || e.error === "aborted") return;
      setError(e.error === "not-allowed" || e.error === "service-not-allowed" ? "The microphone is blocked. Allow it in the browser's address bar." : `Speech recognition stopped (${e.error}).`);
      if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") stop();
    };
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
  useEffect(() => stop, [roomId]); // eslint-disable-line react-hooks/exhaustive-deps
  return { supported, listening, sent, error, start, stop };
}
