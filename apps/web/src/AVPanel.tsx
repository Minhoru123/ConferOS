import { ExternalLink, Mic, MicOff, PhoneOff, Radio, Users, Video, VideoOff, Volume2, VolumeX } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { api, type Room, type Signal } from "./api";
import { ICE_SERVERS, peerId, signals } from "./live";

type Props = { room: Room; code?: string; organizer: boolean; caption?: string; speaker?: string };

/**
 * The room's live video. In Organizer view your camera and microphone go live to everyone in the room (WebRTC, one
 * connection per viewer, signaled through the room's live stream). In Participant view you see and hear the
 * organizer, with captions in your language on top. Each room also has a group call for face-to-face talk.
 */
export function AVPanel(props: Props) {
  return props.organizer ? <Broadcaster {...props} /> : <Viewer {...props} />;
}

const pill = "inline-flex min-h-11 items-center gap-2 rounded-xl px-4 font-bold";
const callUrl = (room: Room) => `https://meet.jit.si/ConferOS-${room.id}`.replace(/[^A-Za-z0-9:/.-]/g, "");

function CaptionOverlay({ caption, speaker }: { caption?: string; speaker?: string }) {
  if (!caption) return null;
  return (
    <div aria-hidden="true" className="absolute inset-x-3 bottom-[72px] rounded-xl bg-[#080c14]/85 px-4 py-2 text-white">
      <span className="font-mono block text-[0.7rem] uppercase tracking-[0.12em] text-[#ffd84d]">{speaker}</span>
      <p style={{ fontSize: "calc(1.25rem * var(--scale))", lineHeight: 1.35 }}>{caption}</p>
    </div>
  );
}

function useSend(room: Room, code?: string) {
  return (to: string, type: Signal["type"], data?: unknown) => {
    api.signal(room.id, { from: peerId, to, type, ...(data !== undefined ? { data } : {}) }, code).catch(() => undefined);
  };
}

function Broadcaster({ room, code, caption, speaker }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [cameras, setCameras] = useState<MediaDeviceInfo[]>([]);
  const [cameraId, setCameraId] = useState("");
  const [micOn, setMicOn] = useState(true);
  const [camOn, setCamOn] = useState(true);
  const [viewers, setViewers] = useState(0);
  const [error, setError] = useState("");
  const send = useSend(room, code);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
    return () => stream?.getTracks().forEach((t) => t.stop());
  }, [stream]);

  // Go live: answer every viewer's join with an offer carrying the camera and microphone.
  useEffect(() => {
    if (!stream) return;
    const peers = new Map<string, { pc: RTCPeerConnection; pending: RTCIceCandidateInit[] }>();
    const count = () => setViewers([...peers.values()].filter((p) => p.pc.connectionState !== "closed" && p.pc.connectionState !== "failed").length);
    const off = signals.on(async (s) => {
      if (s.from === peerId) return;
      if (s.type === "join" && s.to === "broadcaster") {
        peers.get(s.from)?.pc.close();
        const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        const entry = { pc, pending: [] as RTCIceCandidateInit[] };
        peers.set(s.from, entry);
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        pc.onicecandidate = (e) => e.candidate && send(s.from, "candidate", e.candidate.toJSON());
        pc.onconnectionstatechange = count;
        await pc.setLocalDescription(await pc.createOffer());
        send(s.from, "offer", pc.localDescription?.toJSON());
        count();
      } else if (s.to === peerId && s.type === "answer") {
        const p = peers.get(s.from);
        if (!p) return;
        await p.pc.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        for (const c of p.pending.splice(0)) await p.pc.addIceCandidate(c).catch(() => undefined);
      } else if (s.to === peerId && s.type === "candidate") {
        const p = peers.get(s.from);
        if (!p) return;
        if (p.pc.remoteDescription) await p.pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => undefined);
        else p.pending.push(s.data as RTCIceCandidateInit);
      }
    });
    send("all", "live");
    return () => {
      off();
      send("all", "ended");
      peers.forEach((p) => p.pc.close());
      setViewers(0);
    };
  }, [stream]); // eslint-disable-line react-hooks/exhaustive-deps

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
  function toggle(kind: "audio" | "video") {
    if (!stream) return;
    const next = !(kind === "audio" ? micOn : camOn);
    (kind === "audio" ? stream.getAudioTracks() : stream.getVideoTracks()).forEach((t) => (t.enabled = next));
    if (kind === "audio") setMicOn(next);
    else setCamOn(next);
  }

  if (!stream) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Radio size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">Go live to everyone in {room.name}</p>
          <p className="text-sm text-muted-foreground">Your camera and microphone stream to every participant, with live captions on top.</p>
          {error && <p role="alert" className="pt-1 text-sm">{error}</p>}
        </div>
        <button onClick={() => void start()} className={`${pill} bg-primary text-primary-foreground hover:opacity-90`}>
          <Video size={18} aria-hidden="true" /> Go live
        </button>
      </div>
    );
  }
  return (
    <section aria-label="Your live camera" className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} autoPlay playsInline muted className="aspect-video w-full object-cover" style={{ transform: "scaleX(-1)", opacity: camOn ? 1 : 0 }} />
      {!camOn && <p className="absolute inset-0 grid place-items-center text-[#c9d4e6]">Camera is off</p>}
      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[#c2331f] px-3 py-1 text-sm font-bold text-white">
        <span className="live-dot" aria-hidden="true" /> On air
      </span>
      <span className="absolute right-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-3 py-1 text-sm text-white">
        <Users size={16} aria-hidden="true" /> {viewers} watching
      </span>
      <CaptionOverlay caption={caption} speaker={speaker} />
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
        <button onClick={() => setStream(null)} className={`${pill} bg-[#c2331f] text-white`}><PhoneOff size={18} aria-hidden="true" />End broadcast</button>
      </div>
    </section>
  );
}

function Viewer({ room, code, caption, speaker }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [remote, setRemote] = useState<MediaStream | null>(null);
  const [muted, setMuted] = useState(true);
  const send = useSend(room, code);

  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = remote;
  }, [remote]);

  // Ask to watch, and keep asking until a broadcast answers. A "live" signal means the organizer just started.
  useEffect(() => {
    let pc: RTCPeerConnection | null = null;
    let from = "";
    let pending: RTCIceCandidateInit[] = [];
    const off = signals.on(async (s) => {
      if (s.from === peerId) return;
      if (s.type === "live") return send("broadcaster", "join");
      if (s.type === "ended") {
        if (s.from === from) {
          pc?.close();
          pc = null;
          setRemote(null);
        }
        return;
      }
      if (s.to !== peerId) return;
      if (s.type === "offer") {
        pc?.close();
        from = s.from;
        pending = [];
        const conn = new RTCPeerConnection({ iceServers: ICE_SERVERS });
        pc = conn;
        conn.ontrack = (e) => setRemote(e.streams[0] ?? new MediaStream([e.track]));
        conn.onicecandidate = (e) => e.candidate && send(s.from, "candidate", e.candidate.toJSON());
        conn.onconnectionstatechange = () => {
          if (conn.connectionState === "failed" || conn.connectionState === "closed") setRemote(null);
        };
        await conn.setRemoteDescription(s.data as RTCSessionDescriptionInit);
        await conn.setLocalDescription(await conn.createAnswer());
        send(s.from, "answer", conn.localDescription?.toJSON());
        for (const c of pending.splice(0)) await conn.addIceCandidate(c).catch(() => undefined);
      } else if (s.type === "candidate") {
        if (pc?.remoteDescription) await pc.addIceCandidate(s.data as RTCIceCandidateInit).catch(() => undefined);
        else pending.push(s.data as RTCIceCandidateInit);
      }
    });
    const first = setTimeout(() => send("broadcaster", "join"), 800);
    const retry = setInterval(() => {
      if (!pc || pc.connectionState === "failed" || pc.connectionState === "closed") send("broadcaster", "join");
    }, 4000);
    return () => {
      off();
      clearTimeout(first);
      clearInterval(retry);
      pc?.close();
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (!remote) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-card px-4 py-3">
        <span aria-hidden="true" className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-accent text-primary"><Radio size={22} /></span>
        <div className="min-w-0 flex-1">
          <p className="font-bold">{room.kind === "stage" ? "The stage video starts when the organizer goes live" : "No one is live in this room yet"}</p>
          <p className="text-sm text-muted-foreground">Captions and the transcript keep running. Want to talk face to face? Open the room's group call.</p>
        </div>
        <a href={callUrl(room)} target="_blank" rel="noreferrer" className={`${pill} border border-border bg-card hover:border-primary`}>
          <ExternalLink size={18} aria-hidden="true" /> Open group call
        </a>
      </div>
    );
  }
  return (
    <section aria-label={`Live video from ${room.name}`} className="relative overflow-hidden rounded-2xl bg-black">
      <video ref={videoRef} autoPlay playsInline muted={muted} className="aspect-video w-full object-cover" />
      <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-[#c2331f] px-3 py-1 text-sm font-bold text-white">
        <span className="live-dot" aria-hidden="true" /> Live from {room.name}
      </span>
      <CaptionOverlay caption={caption} speaker={speaker} />
      <div className="absolute inset-x-0 bottom-0 flex flex-wrap items-center gap-2 bg-gradient-to-t from-black/80 to-transparent p-3">
        <button onClick={() => setMuted((m) => !m)} aria-pressed={!muted} className={`${pill} ${muted ? "bg-[#ffd84d] text-[#0f1b2d]" : "bg-white/15 text-white"}`}>
          {muted ? <VolumeX size={18} aria-hidden="true" /> : <Volume2 size={18} aria-hidden="true" />}
          {muted ? "Turn on sound" : "Sound on"}
        </button>
        <span className="flex-1" />
        <a href={callUrl(room)} target="_blank" rel="noreferrer" className={`${pill} bg-white/15 text-white`}><ExternalLink size={18} aria-hidden="true" />Group call</a>
      </div>
    </section>
  );
}
