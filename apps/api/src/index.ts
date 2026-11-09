import "./telemetry.js";
import { SEED_ROOMS } from "./seed.js";
import { buildServer } from "./server.js";
import { EsStore, MemoryStore } from "./store.js";

const esUrl = process.env.ELASTICSEARCH_URL;
const store = esUrl
  ? await EsStore.create({ url: esUrl, ...(process.env.ELASTICSEARCH_API_KEY ? { apiKey: process.env.ELASTICSEARCH_API_KEY } : {}) }, SEED_ROOMS)
  : new MemoryStore(SEED_ROOMS);

const app = await buildServer({ store, dev: process.env.NODE_ENV !== "production" });
const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`store: ${esUrl ? "elasticsearch" : "memory"}`);
