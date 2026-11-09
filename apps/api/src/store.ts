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
  /** Removes every line in a room (demo reset). */
  clear(roomId: string): Promise<void>;
}

const STOP = new Set(
  ("the and for are you when what where how who why which does did do is it to of in on at a an my i me we our us he she they them their his her its this that these those " +
    "there here with from about will would can could should shall may might be been was were am has have had not no yes so if then than as by into out up down over " +
    "just also any some say said tell know please hi hello ok okay um uh like get got going gonna want wanna thing things really very much many more most all").split(" "),
);
export function tokens(s: string): string[] {
  return s.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((w) => w.length > 1 && !STOP.has(w));
}
/** A light stem: drop common English endings and keep the first 5 letters, so "submit" matches "submissions". */
export function terms(s: string): string[] {
  return tokens(s).map((w) => (w.replace(/(ations|ation|ings|ing|ions|ion|ers|er|ies|ied|es|ed|s)$/, "") || w).slice(0, 5)).filter((w) => w.length > 1);
}
/** Ranks lines for a question: rarer shared words count more, and newer lines win ties. Lines with no shared word are dropped. */
export function rank(list: Segment[], q: string, limit: number): Segment[] {
  const want = [...new Set(terms(q))];
  if (!want.length) return [];
  const docs = list.map((seg) => ({ seg, t: new Set(terms(seg.text)) }));
  const df = new Map(want.map((w) => [w, docs.filter((d) => d.t.has(w)).length]));
  return docs
    .map((d) => ({ seg: d.seg, score: want.reduce((sum, w) => sum + (d.t.has(w) ? Math.log(1 + docs.length / (df.get(w) || 1)) : 0), 0) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || b.seg.seq - a.seg.seq)
    .slice(0, limit)
    .map((x) => x.seg);
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

  async clear(roomId: string) {
    if (!this.segs.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    this.segs.set(roomId, []);
  }

  async search(roomId: string, q: string, limit = 3) {
    return rank(await this.listSegments(roomId), q, limit);
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

  override async clear(roomId: string) {
    if (!this.rooms.has(roomId)) throw new NotFoundError(`room ${roomId} not found`);
    await this.es.deleteByQuery({ index: this.index, query: { term: { roomId } }, refresh: true });
    this.counters.set(roomId, 0);
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
    // Elasticsearch finds candidate lines by word and word prefix (stop words removed), then the same ranking as
    // the memory store picks the best ones, so "submit" also finds "submissions".
    const stems = [...new Set(terms(q))];
    if (!stems.length) return [];
    const r = await this.es.search<Segment>({
      index: this.index,
      size: 50,
      query: {
        bool: {
          filter: [{ term: { roomId } }],
          should: [{ match: { text: tokens(q).join(" ") } }, ...stems.map((t) => ({ prefix: { text: t } }))],
          minimum_should_match: 1,
        },
      },
    });
    return rank(r.hits.hits.map((h) => h._source as Segment), q, limit);
  }
}
