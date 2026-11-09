export type RoomKind = "stage" | "focus" | "team";

export interface Room {
  id: string;
  kind: RoomKind;
  name: string;
  desc: string;
  video: boolean;
  audio: boolean;
  priv: boolean;
  createdAt: string;
  /** Join code for a private team zone. Only returned to whoever created or joined it. */
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
  /** "mic" for speech recognition, "typed" for lines typed by the presenter. */
  source?: "mic" | "typed";
  /** For mic lines: how long after the last partial caption the final text arrived, in ms. */
  lagMs?: number;
}

export interface NewSegment {
  speaker: string;
  text: string;
  lang?: string;
  source?: "mic" | "typed";
  lagMs?: number;
}

export interface NewRoom {
  name: string;
  desc?: string;
  kind?: RoomKind;
  video?: boolean;
  audio?: boolean;
  priv?: boolean;
}

export interface ChatMessage {
  id: string;
  roomId: string;
  author: string;
  text: string;
  ts: string;
  /** True for answers from the AI assistant. */
  bot?: boolean;
  citations?: Citation[];
}

/** WebRTC signaling between the organizer's broadcast and each viewer, relayed over the room's live stream. */
export interface Signal {
  from: string;
  to: string;
  type: "join" | "live" | "ended" | "offer" | "answer" | "candidate";
  data?: unknown;
}

export interface Citation {
  seq: number;
  ts: string;
  speaker: string;
}

export interface Answer {
  answer: string;
  citations: Citation[];
  /** "extractive" returns the best matching line. An LLM answer mode comes later. */
  mode: "extractive";
}
