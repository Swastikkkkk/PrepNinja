import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Play, Camera, StopCircle, Loader2, CheckCircle, AlertTriangle } from "lucide-react";

type GeneratedQuestion = { id: string; text: string };

export default function InterviewFlow({ apiBase = "http://localhost:8080" }: { apiBase?: string }) {
  const navigate = useNavigate();
  const PREP_TIME = 5;
  const REC_TIME = 10;

  const [rolePrompt, setRolePrompt] = useState("");
  const [company, setCompany] = useState("");
  const [interviewType, setInterviewType] = useState("behavioural");
  const [questions, setQuestions] = useState<GeneratedQuestion[] | null>(null);
  const [phase, setPhase] = useState<"idle" | "generating" | "ready" | "blocked" | "prep" | "recording" | "done">("idle");

  const streamRef = useRef<MediaStream | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const [prepSeconds, setPrepSeconds] = useState(PREP_TIME);
  const [recSeconds, setRecSeconds] = useState(REC_TIME);
  const [currentQIndex, setCurrentQIndex] = useState(0);
  const previewVideoRef = useRef<HTMLVideoElement | null>(null);
  const recordVideoRef = useRef<HTMLVideoElement | null>(null);

  const [userId] = useState(() => `user-${Math.random().toString(36).slice(2, 9)}`);
  const [isUploading, setUploading] = useState(false);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [flagged, setFlagged] = useState<{ reason?: string; at?: string } | null>(null);

  const [previewActive, setPreviewActive] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const generateQuestions = async () => {
    if (!rolePrompt.trim()) return alert("Enter the role / prompt");
    setPhase("generating");
    try {
      const res = await fetch(`${apiBase}/api/generate-questions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rolePrompt, company, interviewType, count: 2 }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      if (!Array.isArray(data.questions) || data.questions.length < 2) throw new Error("Expected 2 questions");
      setQuestions(data.questions.slice(0, 2));
      setSessionId((s) => s ?? `sess-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`);
      setPhase("ready");
    } catch (err: any) {
      console.error(err);
      alert("Failed to generate questions: " + (err?.message || err));
      setPhase("idle");
    }
  };

  const tryRequestFullscreen = async () => {
    try {
      const el = document.documentElement;
      if ((el as any).requestFullscreen) await (el as any).requestFullscreen();
    } catch (e) {}
  };

  const startPreview = async () => {
    setPreviewError(null);
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
        streamRef.current = null;
      }

      const s = await navigator.mediaDevices.getUserMedia({
        audio: true,
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });

      streamRef.current = s;
      setPreviewActive(true);
      setTimeout(() => attachStreamToVideo(s), 50);
    } catch (err: any) {
      console.error("startPreview error", err);
      setPreviewError("Unable to access camera. Allow camera & microphone and try again.");
      setPreviewActive(false);
    }
  };

  const stopPreview = () => {
    try {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }
    } catch (e) {}
    streamRef.current = null;
    setPreviewActive(false);
  };

  const attachStreamToVideo = (stream: MediaStream) => {
    const isInLockMode = phase === "prep" || phase === "recording" || phase === "blocked";
    const videoEl = isInLockMode ? recordVideoRef.current : previewVideoRef.current;
    
    if (!videoEl) {
      console.warn("Video element not found");
      return;
    }

    try {
      if ("srcObject" in videoEl) {
        videoEl.srcObject = stream;
      } else {
        (videoEl as any).src = window.URL.createObjectURL(stream);
      }

      videoEl.style.objectFit = "cover";
      videoEl.style.transform = "scaleX(-1)";
      videoEl.muted = true;
      videoEl.playsInline = true;

      const tryPlay = async () => {
        try {
          await videoEl.play();
        } catch (err) {
          console.warn("Autoplay blocked, waiting for user gesture", err);
        }
      };

      videoEl.onloadedmetadata = () => {
        tryPlay();
      };

      setTimeout(tryPlay, 100);
    } catch (err) {
      console.error("attachStreamToVideo failed", err);
    }
  };

  const startPreviewAndStart = async () => {
    if (!questions) return alert("No questions generated");
    setPreviewError(null);
    try {
      if (streamRef.current && previewActive) {
        streamRef.current.getTracks().forEach((t) => {
          try { t.stop(); } catch (e) {}
        });
      }

      const s = await navigator.mediaDevices.getUserMedia({ 
        audio: true, 
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } } 
      });

      streamRef.current = s;
      
      setCurrentQIndex(0);
      setPrepSeconds(PREP_TIME);
      setPreviewActive(false);
      setPhase("prep");

      setTimeout(() => attachStreamToVideo(s), 50);

      attachAntiCheatListeners();
      document.documentElement.style.cursor = "none";
      tryRequestFullscreen();
    } catch (err: any) {
      console.error(err);
      alert("Please allow camera and mic. The interview cannot proceed without them.");
    }
  };

  useEffect(() => {
    if (phase !== "prep") return;
    if (prepSeconds <= 0) {
      startRecordingForCurrentQuestion();
      return;
    }
    const t = setTimeout(() => setPrepSeconds((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [phase, prepSeconds]);

  const recTimerRef = useRef<NodeJS.Timeout | null>(null);

  const startRecordingForCurrentQuestion = () => {
    const stream = streamRef.current;
    if (!stream) {
      setPhase("blocked");
      return;
    }
    chunksRef.current = [];

    let options: MediaRecorderOptions = {};
    if ((MediaRecorder as any).isTypeSupported?.("video/webm;codecs=vp9")) options = { mimeType: "video/webm;codecs=vp9" };
    else if ((MediaRecorder as any).isTypeSupported?.("video/webm;codecs=vp8")) options = { mimeType: "video/webm;codecs=vp8" };

    try {
      const mr = new MediaRecorder(stream, options);
      recorderRef.current = mr;

      mr.ondataavailable = (e) => {
        if (e.data && e.data.size) chunksRef.current.push(e.data);
      };

      mr.onstop = async () => {
        if (recTimerRef.current) {
          clearInterval(recTimerRef.current);
          recTimerRef.current = null;
        }

        const blob = new Blob(chunksRef.current, { type: chunksRef.current.length ? chunksRef.current[0].type : "video/webm" });
        await uploadAndFinalize(blob, questions![currentQIndex].id, questions![currentQIndex].text);
        if (currentQIndex === 0) {
          setCurrentQIndex(1);
          setPrepSeconds(PREP_TIME);
          setPhase("prep");
        } else {
          setPhase("done");
          try {
            streamRef.current?.getTracks().forEach((t) => t.stop());
          } catch (e) {}
          detachAntiCheatListeners();
          document.documentElement.style.cursor = "";
          setPreviewActive(false);
        }
      };

      mr.start();
      setRecSeconds(REC_TIME);
      setPhase("recording");

      recTimerRef.current = setInterval(() => {
        setRecSeconds((s) => {
          if (s <= 1) {
            try {
              recorderRef.current?.stop();
            } catch (e) {}
            if (recTimerRef.current) {
              clearInterval(recTimerRef.current);
              recTimerRef.current = null;
            }
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      console.error("startRecording failed", err);
      setPhase("blocked");
    }
  };

  const stopRecordingEarly = () => {
    if (recTimerRef.current) {
      clearInterval(recTimerRef.current);
      recTimerRef.current = null;
    }
    
    try {
      if (recorderRef.current && recorderRef.current.state !== "inactive") {
        recorderRef.current.stop();
      }
    } catch (e) {
      console.error("Error stopping recorder", e);
    }
  };

  const uploadAndFinalize = async (file: Blob, questionId: string, questionText: string) => {
    setUploading(true);
    try {
      const form = new FormData();
      form.append("sessionId", sessionId || "local-session");
      form.append("questionId", questionId);
      form.append("userId", userId);
      form.append("questionText", questionText);
      form.append("file", file, `${userId}_${questionId}_${Date.now()}.webm`);

      const res = await fetch(`${apiBase}/api/upload-answer`, { method: "POST", body: form });
      if (!res.ok) {
        const text = await res.text();
        throw new Error(text || "upload failed");
      }
    } catch (err: any) {
      console.error(err);
      alert("Upload failed: " + (err?.message || err));
    } finally {
      setUploading(false);
    }
  };

  useEffect(() => {
    if ((phase === "prep" || phase === "recording") && streamRef.current) {
      attachStreamToVideo(streamRef.current);
    }
  }, [phase]);

  useEffect(() => {
    return () => {
      try {
        streamRef.current?.getTracks().forEach((t) => t.stop());
      } catch (e) {}
      detachAntiCheatListeners();
      document.documentElement.style.cursor = "";
    };
  }, []);

  const attachAntiCheatListeners = () => {
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("blur", handleBlur);
    window.addEventListener("beforeunload", handleBeforeUnload);
  };
  
  const detachAntiCheatListeners = () => {
    document.removeEventListener("visibilitychange", handleVisibilityChange);
    window.removeEventListener("blur", handleBlur);
    window.removeEventListener("beforeunload", handleBeforeUnload);
  };
  
  const handleVisibilityChange = () => {
    if (document.visibilityState !== "visible") flagAndBlock("visibilitychange");
  };
  
  const handleBlur = () => {
    flagAndBlock("blur");
  };
  
  const handleBeforeUnload = (e: BeforeUnloadEvent) => {
    try {
      navigator.sendBeacon?.(`${apiBase}/api/flag-suspicious`, JSON.stringify({ sessionId, userId, reason: "beforeunload" }));
    } catch (e) {}
    e.preventDefault();
    e.returnValue = "";
    return "";
  };
  
  const flagAndBlock = async (reason: string) => {
    if (flagged) return;
    const at = new Date().toISOString();
    setFlagged({ reason, at });
    setPhase("blocked");
    try {
      recorderRef.current?.stop();
    } catch (e) {}
    try {
      streamRef.current?.getTracks().forEach((t) => t.stop());
    } catch (e) {}
    detachAntiCheatListeners();
    document.documentElement.style.cursor = "";
    try {
      await fetch(`${apiBase}/api/flag-suspicious`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId, userId, reason }),
      });
    } catch (e) {
      console.warn("flag-suspicious failed", e);
    }
  };

  const formattedSeconds = (s: number) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;

  const handleReset = () => {
    setCurrentQIndex(0);
    setPrepSeconds(PREP_TIME);
    setPhase("ready");
  };

  const handleStartAttempt = () => {
    if (!sessionId) setSessionId(`sess-${Date.now().toString(36)}`);
    startPreviewAndStart();
  };

  return (
    <div className="min-h-screen bg-background text-foreground">
      {(phase === "idle" || phase === "generating" || phase === "ready") && (
        <div className="max-w-5xl mx-auto p-6">
          <header className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">PrepNinjas AI Interview — 2 Questions</h1>
            <p className="text-sm text-muted-foreground mt-2">Enter the role/prompt, generate questions, then start the locked interview flow.</p>
          </header>

          <div className="mt-6 grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sidebar */}
            <div className="lg:col-span-1 bg-card border rounded-lg p-4 shadow-sm space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium leading-none">Role / prompt</label>
                <input
                  type="text"
                  value={rolePrompt}
                  onChange={(e) => setRolePrompt(e.target.value)}
                  placeholder='e.g. "Product Manager — e-commerce"'
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Company</label>
                  <input
                    type="text"
                    value={company}
                    onChange={(e) => setCompany(e.target.value)}
                    placeholder="e.g. Google"
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium leading-none">Interview type</label>
                  <select
                    value={interviewType}
                    onChange={(e) => setInterviewType(e.target.value)}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 text-sm"
                  >
                    <option value="behavioural">Behavioural</option>
                    <option value="hr">HR</option>
                    <option value="case">Case</option>
                  </select>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  className="inline-flex flex-1 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 gap-2"
                  onClick={generateQuestions}
                  disabled={phase === "generating"}
                >
                  {phase === "generating" ? (
                    <>
                      <Loader2 className="animate-spin" size={16} /> Generating...
                    </>
                  ) : (
                    <>
                      <Play size={16} /> Generate
                    </>
                  )}
                </button>

                <button
                  className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4 gap-2"
                  onClick={() => (previewActive ? stopPreview() : startPreview())}
                >
                  <Camera size={16} /> {previewActive ? "Stop" : "Preview"}
                </button>
              </div>

              <div className="text-sm space-y-2 pt-2 border-t">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Session:</span>
                  <span className="font-mono text-xs">{sessionId ?? "not created"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-muted-foreground">User ID:</span>
                  <span className="font-mono text-xs">{userId}</span>
                </div>
                
                <button 
                  onClick={() => navigate('/admin')}
                  className="mt-3 w-full text-xs text-primary hover:underline text-left font-bold"
                >
                  → View Admin Dashboard
                </button>
              </div>

              <div className="space-y-2">
                <div className="text-xs font-medium text-muted-foreground">Camera preview</div>
                <div className="w-full h-36 bg-muted rounded-md overflow-hidden flex items-center justify-center border">
                  {previewError ? (
                    <div className="text-sm text-destructive px-3 text-center">{previewError}</div>
                  ) : previewActive && streamRef.current ? (
                    <video
                      ref={previewVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ display: "block", transform: "scaleX(-1)" }}
                    />
                  ) : (
                    <div className="text-sm text-muted-foreground">No camera active — click Preview</div>
                  )}
                </div>
              </div>
            </div>

            {/* Main Panel */}
            <div className="lg:col-span-2 bg-card border rounded-lg p-6 shadow-sm">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <div className="text-sm text-muted-foreground">Questions for</div>
                  <div className="font-semibold text-lg">{rolePrompt || "—"}</div>
                </div>
                <div className="text-xs text-muted-foreground bg-muted px-3 py-1.5 rounded-md">2 questions • locked flow</div>
              </div>

              <div className="mt-4 space-y-4">
                <div>
                  {phase === "ready" ? (
                    <div className="rounded-md p-4 bg-yellow-50 dark:bg-yellow-950 text-sm border border-yellow-200 dark:border-yellow-800">
                      <p className="text-yellow-900 dark:text-yellow-100">
                        Questions generated — click <strong>Start Attempt (Locked)</strong> to begin and reveal the questions.
                      </p>
                    </div>
                  ) : (
                    <ol className="list-decimal pl-5 space-y-3">
                      {(questions ?? []).map((q, idx) => (
                        <li key={q.id} className={`${currentQIndex === idx ? "bg-accent p-3 rounded-md border" : ""}`}>
                          <div className="flex items-start justify-between gap-2">
                            <div className="pr-2 text-sm">{q.text}</div>
                            <div className="text-xs text-muted-foreground whitespace-nowrap">Q{idx + 1}</div>
                          </div>
                          {phase === "done" && idx <= currentQIndex && (
                            <div className="mt-2 flex items-center gap-1 text-xs text-green-600">
                              <CheckCircle size={12} /> Uploaded
                            </div>
                          )}
                        </li>
                      ))}
                    </ol>
                  )}
                </div>

                <div className="mt-4">
                  <progress
                    className="w-full h-2"
                    value={questions ? currentQIndex + (phase === "done" ? 1 : phase === "recording" ? 0.5 : 0) : 0}
                    max={questions ? questions.length : 2}
                  />
                </div>

                <div className="mt-4 flex gap-2">
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 border border-input bg-background hover:bg-accent hover:text-accent-foreground h-10 px-4"
                    onClick={handleReset}
                  >
                    Reset
                  </button>
                  <button
                    className="inline-flex flex-1 items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4"
                    onClick={handleStartAttempt}
                    disabled={!questions}
                  >
                    Start Attempt (Locked)
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Locked fullscreen interview UI */}
      {(phase === "prep" || phase === "recording" || phase === "blocked" || phase === "done") && questions && (
        <div className="fixed inset-0 z-50 bg-background flex flex-col items-center justify-center">
          <div className="absolute top-6 left-6 right-6 flex items-center justify-between">
            <div className="text-sm text-muted-foreground">Interview — {sessionId}</div>
            <div className="text-sm text-muted-foreground">Question {currentQIndex + 1} / {questions.length}</div>
          </div>

          <div className="max-w-3xl mx-auto w-full px-6">
            <div className="rounded-lg border bg-card p-8 shadow-lg">
              <div className="text-sm text-muted-foreground mb-4">Question</div>
              <div className="text-xl md:text-2xl font-semibold leading-snug">{questions[currentQIndex].text}</div>

              <div className="mt-8 flex items-center justify-between">
                <div className="flex items-center gap-4">
                  {phase === "prep" && (
                    <div className="text-center">
                      <div className="text-xs text-muted-foreground mb-1">PREP TIME</div>
                      <div className="text-4xl font-mono font-bold">{prepSeconds}s</div>
                    </div>
                  )}
                  {phase === "recording" && (
                    <div className="text-center">
                      <div className="text-xs text-destructive mb-1">● RECORDING</div>
                      <div className="text-4xl font-mono font-bold text-destructive">{formattedSeconds(recSeconds)}</div>
                    </div>
                  )}
                  {phase === "blocked" && (
                    <div className="text-center space-y-2">
                      <AlertTriangle size={24} className="text-destructive mx-auto" />
                      <div className="text-sm text-destructive">Attempt blocked: {flagged?.reason}</div>
                    </div>
                  )}
                  {phase === "done" && (
                    <div className="text-center space-y-3">
                      <CheckCircle size={24} className="text-green-600 mx-auto" />
                      <div className="text-sm text-green-600 font-medium">Completed. Thank you.</div>
                      
                      <button 
                        onClick={() => navigate('/admin', { state: { sessionId, userId } })}
                        className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4"
                      >
                        Go to Admin Dashboard →
                      </button>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-4">
                  <div className="w-36 h-24 rounded-md overflow-hidden border bg-black">
                    <video
                      ref={recordVideoRef}
                      autoPlay
                      muted
                      playsInline
                      className="w-full h-full object-cover"
                      style={{ transform: "scaleX(-1)" }}
                    />
                  </div>

                  <div className="text-sm text-muted-foreground">
                    {isUploading ? (
                      <div className="flex items-center gap-2">
                        <Loader2 className="animate-spin" size={14} /> Uploading...
                      </div>
                    ) : null}
                    <div className="mt-1">
                      User: <span className="font-mono text-xs">{userId}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="mt-6 flex items-center justify-center">
                {phase === "recording" && (
                  <button 
                    className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 bg-destructive text-destructive-foreground hover:bg-destructive/90 h-10 px-4 gap-2" 
                    onClick={stopRecordingEarly}
                  >
                    <StopCircle size={18} /> Stop early
                  </button>
                )}
                {phase === "prep" && (
                  <div className="text-sm text-muted-foreground">Prepare your answer. The recording will start automatically.</div>
                )}
                {phase === "blocked" && (
                  <div className="text-sm text-destructive">You switched away from the test. This attempt has been flagged.</div>
                )}
                {phase === "done" && (
                  <div className="text-sm text-green-600">Your answers were uploaded. You may close this tab.</div>
                )}
              </div>

              <div className="mt-6">
                <progress 
                  className="w-full h-2" 
                  value={currentQIndex + (phase === "done" ? 1 : phase === "recording" ? 0.5 : 0)} 
                  max={questions.length}
                />
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
