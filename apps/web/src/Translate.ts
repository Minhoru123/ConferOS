// Captions and transcript translation using the browser's built-in, on-device Translator (Chrome 138 and later).
// Nothing is sent to our server or a third party. Other browsers show a note instead.
interface TranslatorLike {
  translate(text: string): Promise<string>;
}
interface TranslatorApi {
  availability(o: { sourceLanguage: string; targetLanguage: string }): Promise<string>;
  create(o: { sourceLanguage: string; targetLanguage: string }): Promise<TranslatorLike>;
}

export const LANGUAGES: [string, string][] = [
  ["en", "English"],
  ["es", "Español"],
  ["fr", "Français"],
  ["de", "Deutsch"],
  ["pt", "Português"],
  ["hi", "हिन्दी"],
  ["zh", "中文"],
  ["ja", "日本語"],
];

export function translationSupported() {
  return Boolean((globalThis as unknown as { Translator?: TranslatorApi }).Translator?.create);
}

export async function makeTranslator(target: string): Promise<TranslatorLike | null> {
  const T = (globalThis as unknown as { Translator?: TranslatorApi }).Translator;
  if (!T?.create) return null;
  try {
    const available = await T.availability({ sourceLanguage: "en", targetLanguage: target });
    if (available === "unavailable") return null;
    return await T.create({ sourceLanguage: "en", targetLanguage: target });
  } catch {
    return null;
  }
}
