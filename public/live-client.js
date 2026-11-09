// Connects a page to the live captions and signs. The front end only needs these callbacks.
window.ConferLive = (function () {
  const url = (query) => `${location.protocol === "https:" ? "wss" : "ws"}://${location.host}/ws${query}`;
  const AUDIO_CHUNK_MS = 250;

  function connect({ onHistory, onCaption, onSigns, onStatus }) {
    let socket;
    let wantSigns = false;
    const open = () => {
      socket = new WebSocket(url(""));
      socket.onopen = () => {
        onStatus?.("connected");
        if (wantSigns) socket.send(JSON.stringify({ type: "signs", on: true }));
      };
      socket.onclose = () => { onStatus?.("reconnecting"); setTimeout(open, 1500); };
      socket.onmessage = (event) => {
        const message = JSON.parse(event.data);
        if (message.type === "history") onHistory?.(message.lines);
        else if (message.type === "caption") onCaption?.(message);
        else if (message.type === "signs") onSigns?.(message);
      };
    };
    open();
    return {
      setSigns(on) {
        wantSigns = on;
        if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: "signs", on }));
      },
    };
  }

  async function startMicrophone({ key = "", onStop } = {}) {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const socket = new WebSocket(url(`?role=speaker&key=${encodeURIComponent(key)}`));
    socket.binaryType = "arraybuffer";
    const recorder = new MediaRecorder(stream, { mimeType: "audio/webm;codecs=opus" });
    recorder.ondataavailable = async (event) => {
      if (event.data.size > 0 && socket.readyState === WebSocket.OPEN) socket.send(await event.data.arrayBuffer());
    };
    socket.onopen = () => recorder.start(AUDIO_CHUNK_MS);
    socket.onclose = (event) => {
      if (recorder.state !== "inactive") recorder.stop();
      stream.getTracks().forEach((track) => track.stop());
      onStop?.(event.reason);
    };
    return { stop: () => socket.close() };
  }

  return { connect, startMicrophone };
})();
