export interface Caption {
  id: number;
  t: string;
  who: string;
  text: string;
  final: boolean;
}

export interface SpeechResult {
  text: string;
  isFinal: boolean;
  speechFinal: boolean;
}

const MAX_WORDS_PER_LINE = 40;

const clock = (date: Date) => date.toTimeString().slice(0, 5);
const countWords = (text: string) => text.split(/\s+/).filter(Boolean).length;

/** Turns the speech service's partial results into caption lines, each with a stable id. */
export class LineAssembler {
  private id = 1;
  private settled = "";
  private startedAt: Date | null = null;

  constructor(
    private readonly who = "Speaker",
    private readonly now: () => Date = () => new Date(),
  ) {}

  add(result: SpeechResult): Caption | null {
    const text = [this.settled, result.text].filter(Boolean).join(" ");
    if (!text) return null;
    if (!result.text && !result.speechFinal) return null;

    this.startedAt ??= this.now();
    if (result.isFinal) this.settled = text;

    const ends = result.isFinal && (result.speechFinal || countWords(text) >= MAX_WORDS_PER_LINE);
    return ends ? this.finish(text) : this.caption(text, false);
  }

  /** The speaker stopped without the service marking the end of the sentence. */
  flush(): Caption | null {
    return this.settled ? this.finish(this.settled) : null;
  }

  private finish(text: string): Caption {
    const caption = this.caption(text, true);
    this.id++;
    this.settled = "";
    this.startedAt = null;
    return caption;
  }

  private caption(text: string, final: boolean): Caption {
    return { id: this.id, t: clock(this.startedAt ?? this.now()), who: this.who, text, final };
  }
}
