import { randomUUID } from "node:crypto";
import { Client } from "@elastic/elasticsearch";
import type { NewRoom, NewSegment, Room, Segment } from "./types.js";

export class NotFoundError extends Error {}

export interface Store {
  listRooms(): Promise<Room[]>;
  getRoom(id: string): Promise<Room | undefined>;
  createRoom(input: NewRoom): Promise<Room>;
  addSegment(roomId: string, input: NewSegment): Promise<Segment>;
  listSegments(roomId: string, q?: string): Promise<Segment[]>;
  search(roomId: string, q: string, limit?: number): Promise<Segment[]>;
}

const STOP = new Set(["the", "and", "for", "are", "you", "when", "what", "where", "how", "who", "does", "did", "is", "it", "to", "of", "in", "at", "a", "an", "my", "i"]);
export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w));
}
function slug(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "room";
}

/** In-memory store. Used for local dev and tests, and as the base for rooms in all modes. */
export class MemoryStore implements Store {
  protected rooms = new Map<string, Room>();
  protected segs = new Map<string, Segment[]>();

  constructor(seed: Room[] = []) {
    for (const r of seed) {
      this.rooms.set(r.id, r);
      this.segs.set(r.id, []);
    }
  }

  async listRooms() {
    return [...this.rooms.values()];
  }

  async getRoom(id: string) {
    return this.rooms.get(id);
  }

  async createRoom(input: NewRoom) {
    const room: Room = {
      id: `${slug(input.name)}-${randomUUID().slice(0, 4)}`,
      kind: input.kind ?? "team",
      name: input.name,
      desc: input.desc ?? "",
      video: input.video ?? true,
      audio: input.audio ?? true,
      priv: input.priv ?? false,
      createdAt: new Date().toISOString(),
    };
    this.rooms.set(room.id, room);
    this.segs.set(room.id, []);
    return room;
  }

  protected newSegment(roomId: string, seq: number, input: NewSegment): Segment {
    return { id: `${roomId}-${seq}`, roomId, seq, ts: new Date().toISOString(), speaker: input.speaker, lang: input.lang ?? "en", text: input.text };
  }

  async addSegment(roomId: string, input: NewSegment) {
    const list = this.segs.get(roomId);
    if (!list) throw new NotFoundError(`room ${roomId} not found`);
    const seg = this.newSegment(roomId, list.length + 1, input);
    list.push(seg);
    return seg;
  }

  async listSegments(roomId: string, q?: string) {
    const list = this.segs.get(roomId);
    if (!list) throw new NotFoundError(`room ${roomId} not found`);
    if (!q) return [...list];
    const needle = q.toLowerCase();
    return list.filter((s) => s.text.toLowerCase().includes(needle));
  }

  async search(roomId: string, q: string, limit = 3) {
    const list = await this.listSegments(roomId);
    const want = new Set(tokens(q));
    return list
      .map((s) => ({ s, score: tokens(s.text).filter((t) => want.has(t)).length }))
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score || a.s.seq - b.s.seq)
      .slice(0, limit)
      .map((x) => x.s);
  }
}

/** Elasticsearch-backed segments. Rooms stay in memory for now. */
export class EsStore extends MemoryStore {
  private counters = new Map<string, number>();

  private constructor(private es: Client, private index: string, seed: Room[]) {
    super(seed);
  }

  static async create(opts: { url: string; apiKey?: string; index?: string }, seed: Room[]) {
    const es = new Client({ node: opts.url, ...(opts.apiKey ? { auth: { apiKey: opts.apiKey } } : {}) });
    const index = opts.index ?? "backchannel-segments";
    const exists = await es.indices.exists({ index });
    if (!exists) {
      await es.indices.create({
        index,
        mappings: {
          properties: {
            roomId: { type: "keyword" },
            seq: { type: "integer" },
            ts: { type: "date" },
            speaker: { type: "keyword" },
            lang: { type: "keyword" },
            text: { type: "text" },
            // Next: add a dense_vector field for hybrid (keyword + semantic) search.
          },
        },
      });
    }
    return new EsStore(es, index, seed);
  }

  private async nextSeq(roomId: string) {
    let n = this.counters.get(roomId);
    if (n === undefined) {
      const c = await this.es.count({ index: this.index, query: { term: { roomId } } });
      n = c.count;
    }
    n += 1;
    this.counters.set(roomId, n);
    return n;
  }

  override async addSegment(roomId: string, input: NewSegment) {
    if (!this.rooms.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    const seg = this.newSegment(roomId, await this.nextSeq(roomId), input);
    await this.es.index({ index: this.index, id: seg.id, document: seg, refresh: "wait_for" });
    return seg;
  }

  override async listSegments(roomId: string, q?: string) {
    if (!this.rooms.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    const r = await this.es.search<Segment>({
      index: this.index,
      size: 1000,
      sort: [{ seq: "asc" }],
      query: { bool: { filter: [{ term: { roomId } }], ...(q ? { must: [{ match: { text: q } }] } : {}) } },
    });
    return r.hits.hits.map((h) => h._source as Segment);
  }

  override async search(roomId: string, q: string, limit = 3) {
    if (!this.rooms.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    const r = await this.es.search<Segment>({
      index: this.index,
      size: limit,
      query: { bool: { filter: [{ term: { roomId } }], must: [{ match: { text: q } }] } },
    });
    return r.hits.hits.map((h) => h._source as Segment);
  }
}
