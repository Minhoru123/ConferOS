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
}
export interface Answer {
  answer: string;
  citations: { seq: number; ts: string; speaker: string }[];
  mode: "extractive";
}

async function json<T>(res: Response): Promise<T> {
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return (await res.json()) as T;
}

export const api = {
  rooms: () => fetch("/api/rooms").then(json<Room[]>),
  segments: (id: string, q?: string) => fetch(`/api/rooms/${id}/segments${q ? `?q=${encodeURIComponent(q)}` : ""}`).then(json<Segment[]>),
  ask: (id: string, question: string) =>
    fetch(`/api/rooms/${id}/ask`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ question }) }).then(json<Answer>),
  replay: (id: string) => fetch(`/api/dev/replay/${id}?everyMs=2500`, { method: "POST" }).then(json<{ queued: number }>),
  stream: (id: string, onSegment: (s: Segment) => void) => {
    const es = new EventSource(`/api/rooms/${id}/stream`);
    es.addEventListener("segment", (e) => onSegment(JSON.parse((e as MessageEvent<string>).data) as Segment));
    return () => es.close();
  },
};
