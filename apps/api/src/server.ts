import cors from "@fastify/cors";
import { SpanStatusCode, metrics, trace } from "@opentelemetry/api";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { Bus } from "./bus.js";
import { RoomSigners } from "./live/signs/liveSigner.js";
import type { SignTranslation, SignTranslator } from "./live/signs/translator.js";
import { SAMPLE_LINES } from "./seed.js";
import { NotFoundError, type Store } from "./store.js";
import type { Answer, ChatMessage, Room, Segment } from "./types.js";

const tracer = trace.getTracer("backchannel-api");
const meter = metrics.getMeter("backchannel-api");
const linesAdded = meter.createCounter("backchannel.lines", { description: "Transcript lines added, by source" });
const captionLag = meter.createHistogram("backchannel.caption.lag", {
  unit: "ms",
  description: "How long after the last partial caption the final microphone caption arrived",
});
const chatAsks = meter.createCounter("backchannel.chat.ai_questions", { description: "Questions asked to the AI assistant in room chat" });

class ForbiddenError extends Error {}

const segmentBody = z.object({
  speaker: z.string().min(1).max(80),
  text: z.string().min(1).max(4000),
  lang: z.string().min(2).max(8).optional(),
  source: z.enum(["mic", "typed"]).optional(),
  lagMs: z.number().int().min(0).max(120000).optional(),
});
const roomBody = z.object({
  name: z.string().min(1).max(80),
  desc: z.string().max(200).optional(),
  kind: z.enum(["focus", "team"]).optional(),
  video: z.boolean().optional(),
  audio: z.boolean().optional(),
  priv: z.boolean().optional(),
});
const askBody = z.object({ question: z.string().min(1).max(500) });
const joinBody = z.object({ code: z.string().min(4).max(12) });
const messageBody = z.object({ author: z.string().min(1).max(60), text: z.string().min(1).max(1000) });

/** Rooms as everyone may see them: no join codes, no private zones. */
const publicRoom = ({ code: _code, ...r }: Room) => r;
/** "@ai when is lunch?" or "/ask when is lunch?" asks the assistant. */
const AI_PREFIX = /^\s*(@ai|\/ask)\b[:,]?\s*/i;

export interface Deps {
  store: Store;
  bus?: Bus<Segment>;
  chat?: Bus<ChatMessage>;
  /** Enables the dev-only replay endpoint. */
  dev?: boolean;
  /** When set, adding lines needs this value in the x-presenter-key header. Defaults to PRESENTER_KEY. */
  presenterKey?: string;
  /** Turns on the signing avatar. */
  signTranslator?: SignTranslator;
  signBus?: Bus<SignTranslation>;
}

export async function buildServer({ store, bus = new Bus<Segment>(), chat = new Bus<ChatMessage>(), dev = false, presenterKey, signTranslator, signBus = new Bus<SignTranslation>() }: Deps) {
  const key = presenterKey ?? process.env.PRESENTER_KEY ?? "";
  const signers = signTranslator ? new RoomSigners(signTranslator, signBus) : null;
  const messages = new Map<string, ChatMessage[]>();
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  await app.register(cors, { origin: true });

  // Adding lines and replaying the demo are for the presenter. Reading and asking stay public.
  const presenterOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (key && req.headers["x-presenter-key"] !== key) return reply.code(401).send({ error: "presenter key required" });
  };
  // Private team zones need their join code for everything.
  async function readable(id: string, code?: string) {
    const room = await store.getRoom(id);
    if (!room) throw new NotFoundError(`room ${id} not found`);
    if (room.priv && room.code !== (code ?? "").toUpperCase()) throw new ForbiddenError("this team zone needs its join code");
    return room;
  }
  async function answer(roomId: string, question: string): Promise<Answer> {
    return tracer.startActiveSpan("ask.retrieve", async (span) => {
      try {
        const hits = await store.search(roomId, question, 3);
        span.setAttributes({ "room.id": roomId, "ask.hits": hits.length });
        if (!hits.length) return { answer: "That hasn't been said in this room yet, or I couldn't find it in the transcript so far.", citations: [], mode: "extractive" as const };
        return { answer: hits[0]!.text, citations: hits.map((h) => ({ seq: h.seq, ts: h.ts, speaker: h.speaker })), mode: "extractive" as const };
      } finally {
        span.end();
      }
    });
  }
  function postMessage(roomId: string, msg: Omit<ChatMessage, "id" | "roomId" | "ts">) {
    const full: ChatMessage = { id: randomUUID(), roomId, ts: new Date().toISOString(), ...msg };
    const list = messages.get(roomId) ?? [];
    list.push(full);
    if (list.length > 500) list.shift();
    messages.set(roomId, list);
    chat.publish(roomId, full);
    return full;
  }

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof ForbiddenError) return reply.code(403).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "invalid request", issues: err.issues });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status >= 400 && status < 500) return reply.code(status).send({ error: (err as Error).message });
    app.log.error(err);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/health", async () => ({ ok: true }));
  app.get("/api/config", async () => ({ presenterKeyRequired: Boolean(key) }));

  app.get("/api/rooms", async () => (await store.listRooms()).filter((r) => !r.priv).map(publicRoom));

  // Creating a private team zone returns its join code once, to the creator.
  app.post("/api/rooms", async (req, reply) => {
    const room = await store.createRoom(roomBody.parse(req.body));
    return reply.code(201).send(room);
  });

  app.post("/api/rooms/join", async (req) => {
    const { code } = joinBody.parse(req.body);
    const room = (await store.listRooms()).find((r) => r.priv && r.code === code.trim().toUpperCase());
    if (!room) throw new NotFoundError("no team zone has that code");
    return room;
  });

  app.get<{ Params: { id: string }; Querystring: { q?: string; code?: string } }>("/api/rooms/:id/segments", async (req) => {
    await readable(req.params.id, req.query.code);
    return store.listSegments(req.params.id, req.query.q);
  });

  app.post<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/segments", { preHandler: presenterOnly }, async (req, reply) => {
    const input = segmentBody.parse(req.body);
    await readable(req.params.id, req.query.code);
    return tracer.startActiveSpan("segment.ingest", async (span) => {
      try {
        span.setAttributes({ "room.id": req.params.id, "segment.chars": input.text.length });
        const seg = await store.addSegment(req.params.id, input);
        bus.publish(req.params.id, seg);
        signers?.add(req.params.id, seg.id, seg.text, true);
        linesAdded.add(1, { source: input.source ?? "typed" });
        if (input.lagMs !== undefined) captionLag.record(input.lagMs, { source: input.source ?? "typed" });
        return reply.code(201).send(seg);
      } catch (e) {
        span.setStatus({ code: SpanStatusCode.ERROR, message: String(e) });
        throw e;
      } finally {
        span.end();
      }
    });
  });

  app.get<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/stream", async (req, reply) => {
    const { id } = req.params;
    await readable(id, req.query.code);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    const offLines = bus.subscribe(id, (seg) => res.write(`event: segment\ndata: ${JSON.stringify(seg)}\n\n`));
    const offChat = chat.subscribe(id, (msg) => res.write(`event: message\ndata: ${JSON.stringify(msg)}\n\n`));
    const beat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(beat);
      offLines();
      offChat();
    });
  });

  // Separate from the stream above: being connected here is what turns signing on for the room.
  app.get<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/signs", async (req, reply) => {
    const { id } = req.params;
    await readable(id, req.query.code);
    reply.hijack();
    const res = reply.raw;
    res.writeHead(200, {
      ...(reply.getHeaders() as Record<string, string>),
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(": connected\n\n");
    const off = signBus.subscribe(id, (item) => res.write(`event: signs\ndata: ${JSON.stringify(item)}\n\n`));
    const beat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(beat);
      off();
    });
  });

  app.post<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/ask", async (req): Promise<Answer> => {
    const { question } = askBody.parse(req.body);
    await readable(req.params.id, req.query.code);
    return answer(req.params.id, question);
  });

  app.get<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/messages", async (req) => {
    await readable(req.params.id, req.query.code);
    return messages.get(req.params.id) ?? [];
  });

  // Room chat. A message starting with @ai is also answered by the assistant, from the transcript only.
  app.post<{ Params: { id: string }; Querystring: { code?: string } }>("/api/rooms/:id/messages", async (req, reply) => {
    const { author, text } = messageBody.parse(req.body);
    await readable(req.params.id, req.query.code);
    const msg = postMessage(req.params.id, { author: author.trim(), text: text.trim() });
    if (AI_PREFIX.test(text)) {
      const question = text.replace(AI_PREFIX, "").trim();
      chatAsks.add(1);
      const a = question ? await answer(req.params.id, question) : { answer: "Ask me about anything said in this room, for example: @ai when is lunch?", citations: [] };
      postMessage(req.params.id, { author: "Backchannel AI", text: a.answer, bot: true, citations: a.citations });
    }
    return reply.code(201).send(msg);
  });

  if (dev) {
    app.post<{ Params: { id: string }; Querystring: { everyMs?: string } }>("/api/dev/replay/:id", { preHandler: presenterOnly }, async (req, reply) => {
      const lines = SAMPLE_LINES[req.params.id];
      if (!lines) throw new NotFoundError(`no sample lines for ${req.params.id}`);
      const every = Math.max(200, Number(req.query.everyMs ?? 3000));
      lines.forEach((l, i) => {
        setTimeout(() => {
          store
            .addSegment(req.params.id, l)
            .then((seg) => {
              bus.publish(req.params.id, seg);
              signers?.add(req.params.id, seg.id, seg.text, true);
            })
            .catch((e) => app.log.error(e));
        }, i * every);
      });
      return reply.code(202).send({ queued: lines.length, everyMs: every });
    });
  }

  return app;
}
