export interface Room {
  id: string;
  kind: "stage" | "focus" | "team";
  name: string;
  desc: string;
  video: boolean;
  audio: boolean;
  priv: boolean;
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
export interface Answer {
  answer: string;
  citations: { seq: number; ts: string; speaker: string }[];
  mode: "extractive";
}

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new ApiError(res.status, `${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

const jsonHeaders = (key?: string): HeadersInit => ({ "Content-Type": "application/json", ...(key ? { "x-presenter-key": key } : {}) });

export const api = {
  config: () => fetch("/api/config").then(json<{ presenterKeyRequired: boolean }>),
  rooms: () => fetch("/api/rooms").then(json<Room[]>),
  segments: (id: string) => fetch(`/api/rooms/${id}/segments`).then(json<Segment[]>),
  ask: (id: string, question: string) =>
    fetch(`/api/rooms/${id}/ask`, { method: "POST", headers: jsonHeaders(), body: JSON.stringify({ question }) }).then(json<Answer>),
  addLine: (id: string, line: NewLine, key?: string) =>
    fetch(`/api/rooms/${id}/segments`, { method: "POST", headers: jsonHeaders(key), body: JSON.stringify(line) }).then(json<Segment>),
  replay: (id: string, key?: string) => fetch(`/api/dev/replay/${id}?everyMs=2500`, { method: "POST", headers: jsonHeaders(key) }).then(json<{ queued: number }>),
  stream: (id: string, onSegment: (s: Segment) => void) => {
    const es = new EventSource(`/api/rooms/${id}/stream`);
    es.addEventListener("segment", (e) => onSegment(JSON.parse((e as MessageEvent<string>).data) as Segment));
    return () => es.close();
  },
};
