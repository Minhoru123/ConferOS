import "./env.js";
import "./telemetry.js";
import { claudeGlossModel } from "./live/signs/claudeGloss.js";
import { SignLexicon } from "./live/signs/lexicon.js";
import { SignTranslator } from "./live/signs/translator.js";
import { SEED_ROOMS } from "./seed.js";
import { buildServer } from "./server.js";
import { EsStore, MemoryStore } from "./store.js";

const esUrl = process.env.ELASTICSEARCH_URL;
const store = esUrl
  ? await EsStore.create({ url: esUrl, ...(process.env.ELASTICSEARCH_API_KEY ? { apiKey: process.env.ELASTICSEARCH_API_KEY } : {}) }, SEED_ROOMS)
  : new MemoryStore(SEED_ROOMS);

const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const signTranslator = new SignTranslator(
  SignLexicon.load(new URL("../data/signs/lexicon.sigml", import.meta.url)),
  hasClaude ? claudeGlossModel(process.env.ANTHROPIC_MODEL || "claude-opus-5-5") : null,
  Number(process.env.SIGN_MODEL_TIMEOUT_MS || 4000),
);

const app = await buildServer({ store, dev: process.env.NODE_ENV !== "production", signTranslator });
const port = Number(process.env.PORT ?? 8787);
await app.listen({ port, host: "0.0.0.0" });
app.log.info(`store: ${esUrl ? "elasticsearch" : "memory"}`);
if (!hasClaude) app.log.warn("ANTHROPIC_API_KEY is not set: the avatar will sign word by word");
