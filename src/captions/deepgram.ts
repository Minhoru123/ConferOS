import WebSocket from "ws";
import type { SpeechResult } from "./lineAssembler.ts";

const KEEP_ALIVE_MS = 5000;
const CLOSE_GRACE_MS = 3000;
const MAX_BUFFERED_CHUNKS = 200;

export interface DeepgramOptions {
  url: string;
  apiKey: string;
  language: string;
  onResult: (result: SpeechResult) => void;
  onUtteranceEnd: () => void;
  onClose: () => void;
}

export interface SpeechStream {
  send: (chunk: Buffer) => void;
  close: () => void;
}

export function parseDeepgramMessage(raw: string): SpeechResult | "utterance-end" | null {
  const message = JSON.parse(raw);
  if (message.type === "UtteranceEnd") return "utterance-end";
  if (message.type !== "Results") return null;
  return {
    text: (message.channel?.alternatives?.[0]?.transcript ?? "").trim(),
    isFinal: Boolean(message.is_final),
    speechFinal: Boolean(message.speech_final),
  };
}

export function openDeepgram(options: DeepgramOptions): SpeechStream {
  const query = new URLSearchParams({
    model: "nova-3",
    language: options.language,
    interim_results: "true",
    smart_format: "true",
    endpointing: "300",
    utterance_end_ms: "1000",
  });
  const socket = new WebSocket(`${options.url}?${query}`, {
    headers: { Authorization: `Token ${options.apiKey}` },
  });

  // The first browser chunk carries the audio header, so nothing may be lost before the socket opens.
  const pending: Buffer[] = [];
  let keepAlive: NodeJS.Timeout | undefined;

  socket.on("open", () => {
    for (const chunk of pending.splice(0)) socket.send(chunk);
    keepAlive = setInterval(() => socket.send(JSON.stringify({ type: "KeepAlive" })), KEEP_ALIVE_MS);
  });

  socket.on("message", (data) => {
    const parsed = parseDeepgramMessage(data.toString());
    if (parsed === "utterance-end") options.onUtteranceEnd();
    else if (parsed) options.onResult(parsed);
  });

  socket.on("error", (error) => console.warn(`Deepgram connection failed: ${error.message}`));
  socket.on("close", () => {
    clearInterval(keepAlive);
    options.onClose();
  });

  return {
    send(chunk) {
      if (socket.readyState === WebSocket.OPEN) socket.send(chunk);
      else if (socket.readyState === WebSocket.CONNECTING && pending.length < MAX_BUFFERED_CHUNKS) pending.push(chunk);
    },
    close() {
      if (socket.readyState === WebSocket.OPEN) {
        // Asking it to finish, rather than hanging up, lets the last words come back.
        socket.send(JSON.stringify({ type: "CloseStream" }));
        setTimeout(() => socket.terminate(), CLOSE_GRACE_MS).unref();
      } else {
        socket.terminate();
      }
    },
  };
}
