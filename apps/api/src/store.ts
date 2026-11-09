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
      ...(input.priv ? { code: randomUUID().replace(/-/g, "").slice(0, 6).toUpperCase() } : {}),
    };
    this.rooms.set(room.id, room);
    this.segs.set(room.id, []);
    return room;
  }

  protected newSegment(roomId: string, seq: number, input: NewSegment): Segment {
    return { id: `${roomId}-${seq}`, roomId, seq, ts: new Date().toISOString(), speaker: input.speaker, lang: input.lang ?? "en", text: input.text, ...(input.source ? { source: input.source } : {}), ...(input.lagMs !== undefined ? { lagMs: input.lagMs } : {}) };
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
  private chains = new Map<string, Promise<unknown>>();

  private constructor(private es: Client, private index: string, seed: Room[]) {
    super(seed);
  }

  static async create(opts: { url: string; apiKey?: string; index?: string; attempts?: number }, seed: Room[]) {
    const es = new Client({ node: opts.url, ...(opts.apiKey ? { auth: { apiKey: opts.apiKey } } : {}) });
    const index = opts.index ?? "backchannel-segments";
    // Elasticsearch can take a while to start (docker compose starts both at once), so wait for it instead of exiting.
    let exists = false;
    for (let attempt = 1; ; attempt++) {
      try {
        exists = await es.indices.exists({ index });
        break;
      } catch (e) {
        if (attempt >= (opts.attempts ?? 30)) throw e;
        await new Promise((r) => setTimeout(r, 2000));
      }
    }
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
            source: { type: "keyword" },
            lagMs: { type: "integer" },
            text: { type: "text" },
            // Next: add a dense_vector field for hybrid (keyword + semantic) search.
          },
        },
      });
    }
    return new EsStore(es, index, seed);
  }

  /** Seq numbers are handed out one at a time per room, so concurrent writes never share an id. */
  private nextSeq(roomId: string): Promise<number> {
    const run = async () => {
      let n = this.counters.get(roomId);
      if (n === undefined) {
        const c = await this.es.count({ index: this.index, query: { term: { roomId } } });
        n = c.count;
      }
      n += 1;
      this.counters.set(roomId, n);
      return n;
    };
    const next = (this.chains.get(roomId) ?? Promise.resolve()).then(run, run);
    this.chains.set(roomId, next.catch(() => undefined));
    return next;
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
      sort: [{ seq: "desc" }],
      query: { bool: { filter: [{ term: { roomId } }], ...(q ? { must: [{ match: { text: q } }] } : {}) } },
    });
    // Newest 1000 lines, returned oldest first.
    return r.hits.hits.map((h) => h._source as Segment).reverse();
  }

  override async search(roomId: string, q: string, limit = 3) {
    if (!this.rooms.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    // Drop stop words first, like the memory store, so "Who won the prize?" does not match every line on "the".
    const words = tokens(q).join(" ");
    if (!words) return [];
    const r = await this.es.search<Segment>({
      index: this.index,
      size: limit,
      query: { bool: { filter: [{ term: { roomId } }], must: [{ match: { text: words } }] } },
    });
    return r.hits.hits.map((h) => h._source as Segment);
  }
}
