import { readFileSync } from "node:fs";

/** The signs the avatar knows, as SiGML. A published set, not a validated lexicon: see apps/api/data/signs/lexicon.sigml. */
export class SignLexicon {
  private readonly signs = new Map<string, string>();

  constructor(sigml: string) {
    for (const match of sigml.matchAll(/<hns_sign gloss="([^"]+)">.*?<\/hns_sign>/gs)) {
      this.signs.set(match[1]!.toLowerCase(), match[0]);
    }
  }

  static load(path: string | URL): SignLexicon {
    return new SignLexicon(readFileSync(path, "utf8"));
  }

  get glosses(): string[] {
    return [...this.signs.keys()];
  }

  find(gloss: string): string | undefined {
    return this.signs.get(gloss.toLowerCase());
  }
}
