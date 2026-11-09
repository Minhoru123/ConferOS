import type { SignTranslation, SignTranslator } from "./translator.ts";

const MIN_WORDS = 3;
const MAX_WORDS = 6;

const endsClause = (word: string) => /[.,;:?!…]$/.test(word);

function pieceLength(words: string[], start: number, end: number, final: boolean): number {
  const available = end - start;
  for (let count = MIN_WORDS; count <= Math.min(MAX_WORDS, available); count++) {
    if (endsClause(words[start + count - 1])) return count;
  }
  if (available >= MAX_WORDS) return MAX_WORDS;
  return final ? available : 0;
}

/** Cuts captions into short pieces while they are still being spoken, so the avatar does not wait for the end of a sentence. */
export class SignChunker {
  private readonly sent = new Map<number, number>();

  add(key: number, text: string, final: boolean): string[] {
    const words = text.split(/\s+/).filter(Boolean);
    // The last word of an unfinished caption can still change.
    const end = final ? words.length : words.length - 1;
    let next = this.sent.get(key) ?? 0;
    const pieces: string[] = [];

    while (next < end) {
      const take = pieceLength(words, next, end, final);
      if (take === 0) break;
      pieces.push(words.slice(next, next + take).join(" "));
      next += take;
    }

    if (final) this.sent.delete(key);
    else this.sent.set(key, next);
    return pieces;
  }
}

/** Experimental. Translates once on the server for everyone with the avatar on, and not at all while nobody has it on. */
export class LiveSigner {
  private readonly chunker = new SignChunker();
  private last: Promise<void> = Promise.resolve();

  constructor(
    private readonly translator: SignTranslator,
    private readonly watched: () => boolean,
    private readonly send: (item: SignTranslation) => void,
  ) {}

  add(key: number, text: string, final: boolean): void {
    // Kept up to date while nobody watches, so turning it on does not sign what was said before.
    const pieces = this.chunker.add(key, text, final);
    if (!this.watched()) return;
    for (const piece of pieces) this.last = this.sign(piece, this.last);
  }

  /** Waits for what is on its way. */
  get drained(): Promise<void> {
    return this.last;
  }

  // Pieces translate at once, because one at a time would fall behind speech. Each still waits its turn to be sent.
  private async sign(piece: string, earlier: Promise<void>): Promise<void> {
    const item = await this.translator.translate(piece);
    await earlier;
    this.send(item);
  }
}
