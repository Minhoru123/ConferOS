import { fileURLToPath } from "node:url";
import { createApp } from "./app.ts";
import { config } from "./config.ts";
import { claudeGlossModel } from "./signs/claudeGloss.ts";
import { SignLexicon } from "./signs/lexicon.ts";
import { SignTranslator } from "./signs/translator.ts";

const lexicon = SignLexicon.load(fileURLToPath(new URL("../data/signs/lexicon.sigml", import.meta.url)));
const hasClaude = Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
const translator = new SignTranslator(lexicon, hasClaude ? claudeGlossModel(config.model) : null, config.signTimeoutMs);

if (!config.deepgramKey) console.warn("DEEPGRAM_API_KEY is not set: the microphone will be refused.");
if (!hasClaude) console.warn("ANTHROPIC_API_KEY is not set: signs will go word by word.");

createApp({ ...config, translator }).listen(config.port, () => {
  console.log(`ConferOS live page: http://localhost:${config.port}/live.html (${lexicon.glosses.length} signs loaded)`);
});
