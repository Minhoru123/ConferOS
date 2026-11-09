try {
  process.loadEnvFile();
} catch {
  // No .env file: the environment is used as it is.
}

export const config = {
  port: Number(process.env.PORT ?? 3000),
  deepgramKey: process.env.DEEPGRAM_API_KEY ?? "",
  deepgramUrl: process.env.DEEPGRAM_URL ?? "wss://api.deepgram.com/v1/listen",
  language: process.env.CAPTION_LANGUAGE ?? "en",
  speakerKey: process.env.SPEAKER_KEY ?? "",
  model: process.env.ANTHROPIC_MODEL ?? "claude-opus-5-5",
  signTimeoutMs: Number(process.env.SIGN_MODEL_TIMEOUT_MS ?? 4000),
};
