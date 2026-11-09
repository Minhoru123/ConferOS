import cors from "@fastify/cors";
import { SpanStatusCode, metrics, trace } from "@opentelemetry/api";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import { Bus } from "./bus.js";
import { SAMPLE_LINES } from "./seed.js";
import { NotFoundError, type Store } from "./store.js";
import type { Answer } from "./types.js";

const tracer = trace.getTracer("backchannel-api");
const meter = metrics.getMeter("backchannel-api");
const linesAdded = meter.createCounter("backchannel.lines", { description: "Transcript lines added, by source" });
const captionLag = meter.createHistogram("backchannel.caption.lag", {
  unit: "ms",
  description: "How long after the last partial caption the final microphone caption arrived",
});

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
  kind: z.enum(["stage", "focus", "team"]).optional(),
  video: z.boolean().optional(),
  audio: z.boolean().optional(),
  priv: z.boolean().optional(),
});
const askBody = z.object({ question: z.string().min(1).max(500) });

export interface Deps {
  store: Store;
  bus?: Bus;
  /** Enables the dev-only replay endpoint. */
  dev?: boolean;
  /** When set, adding lines needs this value in the x-presenter-key header. Defaults to PRESENTER_KEY. */
  presenterKey?: string;
}

export async function buildServer({ store, bus = new Bus(), dev = false, presenterKey }: Deps) {
  const key = presenterKey ?? process.env.PRESENTER_KEY ?? "";
  // Adding lines and replaying the demo are for the presenter. Reading and asking stay public.
  const presenterOnly = async (req: FastifyRequest, reply: FastifyReply) => {
    if (key && req.headers["x-presenter-key"] !== key) return reply.code(401).send({ error: "presenter key required" });
  };
  const app = Fastify({ logger: process.env.NODE_ENV !== "test" });
  await app.register(cors, { origin: true });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof NotFoundError) return reply.code(404).send({ error: err.message });
    if (err instanceof z.ZodError) return reply.code(400).send({ error: "invalid request", issues: err.issues });
    app.log.error(err);
    return reply.code(500).send({ error: "internal error" });
  });

  app.get("/health", async () => ({ ok: true }));

  app.get("/api/config", async () => ({ presenterKeyRequired: Boolean(key) }));

  app.get("/api/rooms", async () => store.listRooms());

  app.post("/api/rooms", async (req, reply) => {
    const room = await store.createRoom(roomBody.parse(req.body));
    return reply.code(201).send(room);
  });

  app.get<{ Params: { id: string }; Querystring: { q?: string } }>("/api/rooms/:id/segments", async (req) => {
    return store.listSegments(req.params.id, req.query.q);
  });

  app.post<{ Params: { id: string } }>("/api/rooms/:id/segments", { preHandler: presenterOnly }, async (req, reply) => {
    const input = segmentBody.parse(req.body);
    return tracer.startActiveSpan("segment.ingest", async (span) => {
      try {
        span.setAttributes({ "room.id": req.params.id, "segment.chars": input.text.length });
        const seg = await store.addSegment(req.params.id, input);
        bus.publish(req.params.id, seg);
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

  app.get<{ Params: { id: string } }>("/api/rooms/:id/stream", async (req, reply) => {
    const { id } = req.params;
    if (!(await store.getRoom(id))) throw new NotFoundError(`room ${id} not found`);
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
    const unsub = bus.subscribe(id, (seg) => res.write(`event: segment\ndata: ${JSON.stringify(seg)}\n\n`));
    const beat = setInterval(() => res.write(": keep-alive\n\n"), 15000);
    req.raw.on("close", () => {
      clearInterval(beat);
      unsub();
    });
  });

  app.post<{ Params: { id: string } }>("/api/rooms/:id/ask", async (req): Promise<Answer> => {
    const { question } = askBody.parse(req.body);
    return tracer.startActiveSpan("ask.retrieve", async (span) => {
      try {
        const hits = await store.search(req.params.id, question, 3);
        span.setAttributes({ "room.id": req.params.id, "ask.hits": hits.length });
        if (!hits.length) return { answer: "That hasn't been said in this room yet, or I couldn't find it in the transcript so far.", citations: [], mode: "extractive" as const };
        return { answer: hits[0]!.text, citations: hits.map((h) => ({ seq: h.seq, ts: h.ts, speaker: h.speaker })), mode: "extractive" as const };
      } finally {
        span.end();
      }
    });
  });

  if (dev) {
    app.post<{ Params: { id: string }; Querystring: { everyMs?: string } }>("/api/dev/replay/:id", { preHandler: presenterOnly }, async (req, reply) => {
      const lines = SAMPLE_LINES[req.params.id];
      if (!lines) throw new NotFoundError(`no sample lines for ${req.params.id}`);
      const every = Math.max(200, Number(req.query.everyMs ?? 3000));
      lines.forEach((l, i) => {
        setTimeout(() => {
          store.addSegment(req.params.id, l).then((seg) => bus.publish(req.params.id, seg)).catch((e) => app.log.error(e));
        }, i * every);
      });
      return reply.code(202).send({ queued: lines.length, everyMs: every });
    });
  }

  return app;
}
