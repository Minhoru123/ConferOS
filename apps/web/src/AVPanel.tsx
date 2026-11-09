import { ExternalLink, Mic, MicOff, PhoneOff, Video, VideoOff } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { Room } from "./api";

/**
 * Real camera and microphone for a room. The organizer goes live on camera with captions overlaid; anyone can
 * open the room's group call for face-to-face talk. Captions keep running for everyone either way.
 */
export function AVPanel({ room, organizer, caption, speaker }: { room: Room; organizer: boolean; caption?: string; speaker?: string }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [error, setError] = useState("");
  const callUrl = `https://meet.jit.si/ConferOS-${room.id}`.replace(/[^A-Za-z0-9:/.-]/g, "");

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  async function start(deviceId?: string) {
    setError("");
    try {
      const s = await navigator.mediaDevices.getUserMedia({
        video: { ...(deviceId ? { deviceId: { exact: deviceId } } : {}), width: { ideal: 1280 }, height: { ideal: 720 }, frameRate: { ideal: 30 } },
        audio: { echoCancellation: true, noiseSuppression: true },
      });
      setStream(s);
      setMicOn(true);
      setCamOn(true);
      const devices = await navigator.mediaDevices.enumerateDevices();
      setCameras(devices.filter((d) => d.kind === "videoinput"));
      setCameraId(s.getVideoTracks()[0]?.getSettings().deviceId ?? "");
    } catch (e) {
      const name = (e as DOMException).name;
      setError(name === "NotAllowedError" ? "The camera is blocked. Allow it in the browser's address bar, then try again." : name === "NotFoundError" ? "No camera was found." : "Could not start the camera.");
    }
  }
  function stop() {
    setStream(null);
  }
  function toggle(kind: "audio" | "video") {
    if (!stream) return;
    const tracks = kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks();
    const next = !(kind === "audio" ? micOn : camOn);
    tracks.forEach((t) => (t.enabled = next));
    if (kind === "audio") setMicOn(next);
    else setCamOn(next);
  }

  const pill = "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold";
  if (!stream) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Video size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{organizer ? "Go live on camera" : room.kind === "stage" ? "Main room audio and video" : "Talk face to face"}</p>
          <p className="text-sm text-muted-foreground">{organizer ? "Your camera with live captions on top. Captions keep running for everyone." : "Turn on your camera, or open the room's group call."}</p>
          {error && <p role="alert" className="pt-1 text-sm">{error}</p>}
        </div>
        <div className="flex flex-wrap gap-2">
          <button onClick={() => void start()} className={`${pill} bg-primary text-primary-foreground hover:opacity-90`}>
            <Video size={18} aria-hidden="true" /> {organizer ? "Start camera" : "Turn on camera"}
          </button>
          <a href={callUrl} target="_blank" rel="noreferrer" className={`${pill} border border-border bg-card hover:border-primary`}>
            <ExternalLink size={18} aria-hidden="true" /> Open group call
          </a>
        </div>
      </div>
    );
  }
  return (
    <section aria-label="Camera" className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" style={{ transform: "scaleX(-1)", opacity: camOn ? 1 : 0 }} />
      {!camOn && <p className="absolute inset-0 grid place-items-center text-[#c9d4e6]">Camera is off</p>}
      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
        <span className="live-dot text-[#ff8f7c]" aria-hidden="true" /> {organizer ? "On air" : "Camera on"}
      </span>
      {caption && (
        <div aria-hidden="true" className="absolute inset-x-3 bottom-[72px] rounded-xl bg-[#080c14]/85 px-4 py-2 text-white">
          <span className="font-mono block text-[0.7rem] uppercase tracking-[0.12em] text-[#ffd84d]">{speaker}</span>
          <p style={{ fontSize: "calc(1.25rem * var(--scale))", lineHeight: 1.35 }}>{caption}</p>
        </div>
      )}
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-3">
        <button onClick={() => toggle("audio")} aria-pressed={micOn} className={`${pill} ${micOn ? "bg-white/15" : "bg-[#c2331f]"} text-white`}>{micOn ? <Mic size={18} aria-hidden="true" /> : <MicOff size={18} aria-hidden="true" />}{micOn ? "Mic on" : "Mic off"}</button>
        <button onClick={() => toggle("video")} aria-pressed={camOn} className={`${pill} ${camOn ? "bg-white/15" : "bg-[#c2331f]"} text-white`}>{camOn ? <Video size={18} aria-hidden="true" /> : <VideoOff size={18} aria-hidden="true" />}{camOn ? "Camera on" : "Camera off"}</button>
        {cameras.length > 1 && (
          <>
            <label htmlFor="cam" className="sr-only">Camera</label>
            <select id="cam" value={cameraId} onChange={(e) => void start(e.target.value)} className="min-h-11 max-w-[220px] rounded-xl bg-white/15 px-3 text-white">
              {cameras.map((c, i) => (
                <option key={c.deviceId} value={c.deviceId} className="text-black">{c.label || `Camera ${i + 1}`}</option>
              ))}
            </select>
          </>
        )}
        <span className="flex-1" />
        <a href={callUrl} target="_blank" rel="noreferrer" className={`${pill} bg-white/15 text-white`}><ExternalLink size={18} aria-hidden="true" />Group call</a>
        <button onClick={stop} className={`${pill} bg-[#c2331f] text-white`}><PhoneOff size={18} aria-hidden="true" />{organizer ? "End" : "Leave"}</button>
      </div>
    </section>
  );
}
