// The experimental signing avatar. CWASA runs unmodified from its home at the University of East Anglia, as its terms ask,
// so it is only loaded when someone turns this on, and it needs internet.
window.SignAvatar = (function () {
  const HOST = "https://vhg.cmp.uea.ac.uk/tech/jas/vhg2025a/cwa";
  const LOAD_TIMEOUT_MS = 30000;
  const IDLE_TIMEOUT_MS = 20000;
  let loading = null;

  function load() {
    if (loading) return loading;
    loading = new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error("timeout")), LOAD_TIMEOUT_MS);
      const css = document.createElement("link");
      css.rel = "stylesheet";
      css.href = `${HOST}/cwasa.css`;
      // First, so that its page colours do not win over ours.
      document.head.prepend(css);
      const script = document.createElement("script");
      script.src = `${HOST}/allcsa.js`;
      script.onerror = () => { clearTimeout(timer); reject(new Error("script")); };
      script.onload = () => {
        CWASA.addHook("avatarready", () => { clearTimeout(timer); resolve(); }, 0);
        CWASA.init({ ambIdle: false, useClientConfig: false, avSettings: { avList: "avs", initAv: "anna", initSpeed: 0 } });
      };
      document.head.append(script);
    });
    loading.catch(() => { loading = null; });
    return loading;
  }

  // Plays one piece after another, and lets go of old ones so the avatar never falls far behind the speaker.
  function player({ maxQueued = 3, onSay, onSkip } = {}) {
    const queue = [];
    let busy = false;
    let release = null;

    function next() {
      if (busy || queue.length === 0) return;
      busy = true;
      const item = queue.shift();
      onSay?.(item);
      if (!item.tokens.some((token) => token.hasSign)) { busy = false; next(); return; }
      const done = () => { clearTimeout(timer); release = null; busy = false; next(); };
      const timer = setTimeout(done, IDLE_TIMEOUT_MS);
      release = done;
      CWASA.playSiGMLText(item.sigml, 0);
    }

    CWASA.addHook("animidle", () => { release?.(); }, 0);

    return {
      say(item) {
        queue.push(item);
        while (queue.length > maxQueued) { queue.shift(); onSkip?.(); }
        next();
      },
    };
  }

  return { load, player };
})();
