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

export interface NewSegment {
  speaker: string;
  text: string;
  lang?: string;
}

export interface NewRoom {
  name: string;
  desc?: string;
  kind?: RoomKind;
  video?: boolean;
  audio?: boolean;
  priv?: boolean;
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
