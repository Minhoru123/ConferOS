export interface Room {
  id: string;
  kind: "stage" | "focus" | "team";
  name: string;
  desc: string;
  video: boolean;
  audio: boolean;
  priv: boolean;
  code?: string;
}
export interface Segment {
  id: string;
  roomId: string;
  seq: number;
  ts: string;
  speaker: string;
  lang: string;
  text: string;
  source?: "mic" | "typed";
  lagMs?: number;
}
export interface NewLine {
  speaker: string;
  text: string;
  source: "mic" | "typed";
  lagMs?: number;
}
export interface Citation {
  seq: number;
  ts: string;
  speaker: string;
}
export interface Answer {
  answer: string;
  citations: Citation[];
  mode: "extractive" | "generated";
}
export interface ChatMessage {
  id: string;
  roomId: string;
  author: string;
  text: string;
  ts: string;
  bot?: boolean;
  citations?: Citation[];
}

export interface Signal {
  from: string;
  to: string;
  type: "join" | "live" | "ended" | "offer" | "answer" | "candidate";
  data?: unknown;
}

export interface RoomStats {
  watching: number;
  lines: number;
  messages: number;
  aiQuestions: number;
  lagP50: number | null;
  lagP95: number | null;
  translations: Record<string, number>;
  telemetry: boolean;
}

export interface SignItem {
  tokens: { word: string; hasSign: boolean }[];
  sigml: string;
  byModel: boolean;
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string };
    throw new ApiError(res.status, body.error ?? `${res.status} ${res.statusText}`);
  }
  return (await res.json()) as T;
}

const headers = (key?: string): HeadersInit => ({ "Content-Type": "application/json", ...(key ? { "x-presenter-key": key } : {}) });
const withCode = (code?: string) => (code ? `?code=${encodeURIComponent(code)}` : "");

export const api = {
  config: () => fetch("/api/config").then(json<{ presenterKeyRequired: boolean }>),
  rooms: () => fetch("/api/rooms").then(json<Room[]>),
  createRoom: (name: string, kind: "focus" | "team", priv: boolean) =>
    fetch("/api/rooms", { method: "POST", headers: headers(), body: JSON.stringify({ name, kind, priv }) }).then(json<Room>),
  joinRoom: (code: string) => fetch("/api/rooms/join", { method: "POST", headers: headers(), body: JSON.stringify({ code }) }).then(json<Room>),
  segments: (id: string, code?: string) => fetch(`/api/rooms/${id}/segments${withCode(code)}`).then(json<Segment[]>),
  messages: (id: string, code?: string) => fetch(`/api/rooms/${id}/messages${withCode(code)}`).then(json<ChatMessage[]>),
  sendMessage: (id: string, author: string, text: string, code?: string) =>
    fetch(`/api/rooms/${id}/messages${withCode(code)}`, { method: "POST", headers: headers(), body: JSON.stringify({ author, text }) }).then(json<ChatMessage>),
  addLine: (id: string, line: NewLine, key?: string, code?: string) =>
    fetch(`/api/rooms/${id}/segments${withCode(code)}`, { method: "POST", headers: headers(key), body: JSON.stringify(line) }).then(json<Segment>),
  signal: (id: string, sig: Signal, code?: string) =>
    fetch(`/api/rooms/${id}/signal${withCode(code)}`, { method: "POST", headers: headers(), body: JSON.stringify(sig) }).then(json<{ ok: boolean }>),
  translate: (texts: string[], target: string) =>
    fetch("/api/translate", { method: "POST", headers: headers(), body: JSON.stringify({ texts, target }) }).then(json<{ texts: string[]; failed: boolean[] }>),
  replay: (id: string, key?: string, everyMs = 2500) => fetch(`/api/dev/replay/${id}?everyMs=${everyMs}`, { method: "POST", headers: headers(key), body: "{}" }).then(json<{ queued: number }>),
  reset: (id: string, key?: string) => fetch(`/api/dev/reset/${id}`, { method: "POST", headers: headers(key), body: "{}" }).then(json<{ ok: boolean }>),
  stats: (id: string, code?: string) => fetch(`/api/rooms/${id}/stats${withCode(code)}`).then(json<RoomStats>),
  stream: (id: string, code: string | undefined, on: { segment: (s: Segment) => void; message: (m: ChatMessage) => void; signal?: (s: Signal) => void; reset?: () => void }) => {
    const es = new EventSource(`/api/rooms/${id}/stream${withCode(code)}`);
    es.addEventListener("segment", (e) => on.segment(JSON.parse((e as MessageEvent<string>).data) as Segment));
    es.addEventListener("message", (e) => on.message(JSON.parse((e as MessageEvent<string>).data) as ChatMessage));
    es.addEventListener("reset", () => on.reset?.());
    es.addEventListener("signal", (e) => on.signal?.(JSON.parse((e as MessageEvent<string>).data) as Signal));
    return () => es.close();
  },
  /** Staying connected here is what keeps signing on for the room. */
  signs: (id: string, code: string | undefined, onSigns: (item: SignItem) => void) => {
    const es = new EventSource(`/api/rooms/${id}/signs${withCode(code)}`);
    es.addEventListener("signs", (e) => onSigns(JSON.parse((e as MessageEvent<string>).data) as SignItem));
    return () => es.close();
  },
};
