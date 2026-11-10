import type { GlossModel } from "./translator.js";
import { GLOSS_SCHEMA } from "./translator.js";

/** Used when there is an OpenAI key and no Anthropic key. */
export function openaiGlossModel(apiKey: string, model: string): GlossModel {
  return async (system, sentence, signal) => {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
      signal,
      body: JSON.stringify({
        model,
        temperature: 0,
        response_format: { type: "json_schema", json_schema: { name: "glosses", strict: true, schema: GLOSS_SCHEMA } },
        messages: [
          { role: "system", content: system },
          { role: "user", content: sentence },
        ],
      }),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { choices?: { finish_reason?: string; message?: { content?: string | null } }[] };
    const choice = body.choices?.[0];
    if (choice?.finish_reason !== "stop" || !choice.message?.content) return null;
    const { glosses } = JSON.parse(choice.message.content) as { glosses: string[] };
    return glosses.filter((gloss) => gloss.trim());
  };
}
