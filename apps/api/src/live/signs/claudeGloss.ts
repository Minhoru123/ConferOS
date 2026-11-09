import Anthropic from "@anthropic-ai/sdk";
import type { GlossModel } from "./translator.js";

const SCHEMA = {
  type: "object",
  properties: { glosses: { type: "array", items: { type: "string" } } },
  required: ["glosses"],
  additionalProperties: false,
};

export function claudeGlossModel(model: string): GlossModel {
  const client = new Anthropic();

  return async (system, sentence, signal) => {
    const response = await client.beta.messages.create(
      {
        model,
        max_tokens: 2048,
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        // The gloss list never changes, so every piece after the first reuses it from the cache.
        cache_control: { type: "ephemeral" },
        output_config: { effort: "low", format: { type: "json_schema", schema: SCHEMA } },
        system,
        messages: [{ role: "user", content: sentence }],
      },
      { signal, maxRetries: 0 },
    );

    if (response.stop_reason !== "end_turn") return null;
    const text = response.content.find((block) => block.type === "text");
    if (!text || text.type !== "text") return null;
    const { glosses } = JSON.parse(text.text) as { glosses: string[] };
    return glosses.filter((gloss) => gloss.trim());
  };
}
