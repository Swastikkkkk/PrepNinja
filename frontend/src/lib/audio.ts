// Audio helpers for interview answers: a small audio-only recorder, 16 kHz mono WAV
// encoding (what the Nemotron speech model reads), and live browser speech recognition
// as a free fallback transcript.

export function startAudioRecorder(stream: MediaStream) {
  const audio = new MediaStream(stream.getAudioTracks());
  const chunks: Blob[] = [];
  const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((m) => MediaRecorder.isTypeSupported?.(m));
  const rec = new MediaRecorder(audio, mime ? { mimeType: mime } : undefined);
  rec.ondataavailable = (e) => e.data?.size && chunks.push(e.data);
  rec.start();
  return () =>
    new Promise<Blob>((resolve) => {
      if (rec.state === "inactive") return resolve(new Blob(chunks, { type: rec.mimeType }));
      rec.onstop = () => resolve(new Blob(chunks, { type: rec.mimeType }));
      rec.stop();
    });
}

export async function toWav16k(blob: Blob): Promise<Blob | null> {
  try {
    const ctx = new AudioContext();
    const decoded = await ctx.decodeAudioData(await blob.arrayBuffer());
    ctx.close();
    const rate = 16000;
    const off = new OfflineAudioContext(1, Math.max(1, Math.ceil(decoded.duration * rate)), rate);
    const src = off.createBufferSource();
    src.buffer = decoded;
    src.connect(off.destination);
    src.start();
    const pcm = (await off.startRendering()).getChannelData(0);

    const buf = new ArrayBuffer(44 + pcm.length * 2);
    const v = new DataView(buf);
    const str = (o: number, s: string) => [...s].forEach((c, i) => v.setUint8(o + i, c.charCodeAt(0)));
    str(0, "RIFF"); v.setUint32(4, 36 + pcm.length * 2, true); str(8, "WAVE");
    str(12, "fmt "); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, 1, true);
    v.setUint32(24, rate, true); v.setUint32(28, rate * 2, true); v.setUint16(32, 2, true); v.setUint16(34, 16, true);
    str(36, "data"); v.setUint32(40, pcm.length * 2, true);
    for (let i = 0; i < pcm.length; i++) {
      const s = Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44 + i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
    }
    return new Blob([buf], { type: "audio/wav" });
  } catch (e) {
    console.warn("WAV conversion failed", e);
    return null;
  }
}

export function startSpeechCapture() {
  const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
  if (!SR) return () => "";
  let text = "";
  let active = true;
  const rec = new SR();
  rec.continuous = true;
  rec.interimResults = false;
  rec.lang = "en-US";
  rec.onresult = (e: any) => {
    for (let i = e.resultIndex; i < e.results.length; i++) if (e.results[i].isFinal) text += e.results[i][0].transcript + " ";
  };
  rec.onend = () => { if (active) try { rec.start(); } catch { /* already running */ } };
  try { rec.start(); } catch { /* mic busy */ }
  return () => { active = false; try { rec.stop(); } catch { /* noop */ } return text.trim(); };
}

const LOCAL = "prepninja_attempts";
export const saveLocalAttempt = (a: any) => {
  try {
    const all = JSON.parse(localStorage.getItem(LOCAL) || "[]").filter((x: any) => x.attemptId !== a.attemptId);
    localStorage.setItem(LOCAL, JSON.stringify([a, ...all].slice(0, 100)));
  } catch { /* storage off */ }
};
export const getLocalAttempts = (): any[] => {
  try { return JSON.parse(localStorage.getItem(LOCAL) || "[]"); } catch { return []; }
};
