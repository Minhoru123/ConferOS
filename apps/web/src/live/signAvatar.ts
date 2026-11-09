import type { SignItem } from "../api";

interface Cwasa {
  addHook(name: string, fn: () => void, avatar: number): void;
  init(options: object): void;
  playSiGMLText(sigml: string, avatar: number): void;
}
declare const CWASA: Cwasa;

// CWASA runs unmodified from its home at the University of East Anglia, as its terms ask,
// so it is only loaded when someone turns the avatar on, and it needs internet.
const HOST = "https://vhg.cmp.uea.ac.uk/tech/jas/vhg2025a/cwa";
const LOAD_TIMEOUT_MS = 60000;
const IDLE_TIMEOUT_MS = 20000;
const MAX_QUEUED = 3;

let loading: Promise<void> | null = null;

export function loadAvatar(): Promise<void> {
  if (loading) return loading;
  loading = new Promise<void>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS);
    const css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = `${HOST}/cwasa.css`;
    // First, so that its page colours do not win over ours.
    document.head.prepend(css);
    const script = document.createElement("script");
    script.src = `${HOST}/allcsa.js`;
    script.onerror = () => {
      clearTimeout(timer);
      reject(new Error("script"));
    };
    script.onload = () => {
      CWASA.addHook(
        "avatarready",
        () => {
          clearTimeout(timer);
          resolve();
        },
        0,
      );
      CWASA.init({ ambIdle: false, useClientConfig: false, avSettings: { avList: "avs", initAv: "anna", initSpeed: 0 } });
    };
    document.head.append(script);
  });
  loading.catch(() => {
    loading = null;
  });
  return loading;
}

export interface SignPlayer {
  say: (item: SignItem) => void;
}

/** Plays one piece after another, and lets go of old ones so the avatar never falls far behind the speaker. */
export function createPlayer(callbacks: { onSay: (item: SignItem) => void; onSkip: () => void }): SignPlayer {
  const queue: SignItem[] = [];
  let busy = false;
  let release: (() => void) | null = null;

  function next() {
    if (busy) return;
    const item = queue.shift();
    if (!item) return;
    busy = true;
    callbacks.onSay(item);
    if (!item.tokens.some((token) => token.hasSign)) {
      busy = false;
      next();
      return;
    }
    const done = () => {
      clearTimeout(timer);
      release = null;
      busy = false;
      next();
    };
    const timer = setTimeout(done, IDLE_TIMEOUT_MS);
    release = done;
    CWASA.playSiGMLText(item.sigml, 0);
  }

  CWASA.addHook("animidle", () => release?.(), 0);

  return {
    say(item) {
      queue.push(item);
      while (queue.length > MAX_QUEUED) {
        queue.shift();
        callbacks.onSkip();
      }
      next();
    },
  };
}
