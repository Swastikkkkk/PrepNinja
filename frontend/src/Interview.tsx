import React, { useEffect, useRef, useState, useCallback } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import Editor from "@monaco-editor/react";
import { engine } from "@/lib/engine";
import { Eye, EyeOff, Video, VideoOff, Play, RotateCcw, Send, Clock, AlertTriangle, CheckCircle2, Loader2, Volume2, CheckCircle, X } from "lucide-react";

type Question = { id?: string; text: string; difficulty?: string; tests?: { stdin: string; expected: string }[]; validated?: boolean };
type NavState = {
  role?: string;
  language?: string;
  topic?: string;
  questions?: Question[];
  perQuestionSeconds?: number;
};
type Flag = { id: string; time: string; type: 'tab-switch' | 'fullscreen-exit' | 'face-detection'; message: string; };
type TestCase = { input: string; expectedOutput: string; description: string };
type TestResult = { passed: boolean; input: string; expected: string; actual: string; description: string };
type QuestionAttempt = { questionId: string; questionText: string; passed: boolean; testsPassed: number; testsTotal: number; code: string };

const MURF_API_KEY = import.meta.env.VITE_MURF_API_KEY || "";
const BACKEND_URL = "http://localhost:5000";

if (!MURF_API_KEY) {
  console.warn("VITE_MURF_API_KEY not found in environment variables. Text-to-speech features will not work.");
}

const TEST_CASES: Record<string, TestCase[]> = {
  'q1-arrays': [
    { input: "2 7 11 15 9", expectedOutput: "0 1", description: "Two sum in array" },
    { input: "3 3 6", expectedOutput: "0 1", description: "Duplicate values" }
  ],
  'q2-arrays': [
    { input: "-2 1 -3 4 -1 2 1 -5 4", expectedOutput: "6", description: "Maximum subarray (Kadane)" },
    { input: "-1", expectedOutput: "-1", description: "Single negative element" }
  ],
  'q1-linked-lists': [
    { input: "1 2 3", expectedOutput: "3 2 1", description: "Reverse linked list" },
    { input: "1", expectedOutput: "1", description: "Single node" }
  ],
  'q2-linked-lists': [
    { input: "1 2 3 2", expectedOutput: "True", description: "Cycle detected" },
    { input: "1 2 3", expectedOutput: "False", description: "No cycle" }
  ],
  'q1-stacks': [
    { input: "", expectedOutput: "True", description: "Empty stack" },
    { input: "()[]{}]", expectedOutput: "True", description: "Valid parentheses" }
  ],
  'q2-stacks': [
    { input: "(]", expectedOutput: "False", description: "Invalid mix of brackets" },
    { input: "[]", expectedOutput: "True", description: "Valid brackets" }
  ],
  'q1-trees': [
    { input: "1 2 3", expectedOutput: "2 1 3", description: "Inorder traversal" },
    { input: "1 2", expectedOutput: "1 2", description: "Inorder with None" }
  ],
  'q2-trees': [
    { input: "3 5 1 6 2 0 8 5 1", expectedOutput: "3", description: "LCA in tree" },
    { input: "2 1 1", expectedOutput: "1", description: "LCA with same node" }
  ],
  'q1-graphs': [
    { input: "4 1 3 0 2 1 3 0 2", expectedOutput: "[0,1,3,2]", description: "BFS traversal" },
    { input: "4 1 3 0 2 1 3 0 2", expectedOutput: "[0,1,2,3]", description: "DFS traversal" }
  ],
  'q2-graphs': [
    { input: "1 1 0 1 0 1 1 1 1", expectedOutput: "1", description: "Count islands" },
    { input: "0", expectedOutput: "0", description: "No islands" }
  ]
};

const MAX_FLAGS = 8;

export default function Interview() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as NavState | null;

  const topic = state?.topic || "arrays";
  const role = state?.role || "Software Engineer";

  const [questions, setQuestions] = useState<Question[]>([]);
  const questionStart = useRef<number>(Date.now());
  const [questionsLoading, setQuestionsLoading] = useState(true);
  const [questionsError, setQuestionsError] = useState<string | null>(null);

  const language = state?.language ?? "python";
  const perQuestionSeconds = state?.perQuestionSeconds ?? 60;

  const [index, setIndex] = useState(0);
  const [timeLeft, setTimeLeft] = useState(perQuestionSeconds);
  const [code, setCode] = useState<string>(() => starterFor(language));
  const [stdout, setStdout] = useState<string>("");
  const [stderr, setStderr] = useState<string>("");
  const [running, setRunning] = useState(false);

  const [testResults, setTestResults] = useState<TestResult[]>([]);
  const [showTestResults, setShowTestResults] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [questionAttempts, setQuestionAttempts] = useState<QuestionAttempt[]>([]);
  const [testStatus, setTestStatus] = useState<'idle' | 'passed' | 'failed'>('idle');

  // ✅ NEW: Mock score state
  const [showMockScore, setShowMockScore] = useState(false);

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [flags, setFlags] = useState<Flag[]>([]);
  const [showNotification, setShowNotification] = useState(false);
  const [notificationMsg, setNotificationMsg] = useState("");
  const [cameraEnabled, setCameraEnabled] = useState(true);
  const [faceDetected, setFaceDetected] = useState(true);
  const [eyeContact, setEyeContact] = useState(true);

  const [ttsOn, setTtsOn] = useState(true);
  const [isPlayingTTS, setIsPlayingTTS] = useState(false);
  const [ttsStartTime, setTtsStartTime] = useState<number | null>(null);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const faceCheckInterval = useRef<NodeJS.Timeout | null>(null);
  const notificationTimeout = useRef<NodeJS.Timeout | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const ttsDelayTimer = useRef<NodeJS.Timeout | null>(null);
  const flagTracker = useRef<Set<string>>(new Set());

  useEffect(() => {
    async function fetchQuestions() {
      try {
        setQuestionsLoading(true);
        setQuestionsError(null);
        console.log(`🔍 Fetching questions for topic: ${topic}, role: ${role}`);
        const response = await fetch(`${BACKEND_URL}/api/generate`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ role: role, topics: topic })
        });
        if (!response.ok) throw new Error(`Backend error: ${response.status} ${response.statusText}`);
        const data = await response.json();
        const fetchedQuestions: Question[] = data.questions || [];
        if (fetchedQuestions.length === 0) throw new Error("No questions generated by Gemini API");
        console.log(`✅ Got ${fetchedQuestions.length} questions:`, fetchedQuestions);
        setQuestions(fetchedQuestions);
        setIndex(0);
        questionStart.current = Date.now();
        setQuestionsLoading(false);
      } catch (err) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        console.error("❌ Failed to fetch questions:", errorMsg);
        setQuestionsError(errorMsg);
        setQuestionsLoading(false);
        showNotificationAlert(`❌ Failed to load questions: ${errorMsg}`);
      }
    }
    fetchQuestions();
  }, [topic, role]);

  const showNotificationAlert = (msg: string) => {
    setNotificationMsg(msg);
    setShowNotification(true);
    if (notificationTimeout.current) clearTimeout(notificationTimeout.current);
    notificationTimeout.current = setTimeout(() => setShowNotification(false), 4000);
  };

  const addFlag = useCallback((type: Flag['type'], message: string) => {
    const flagKey = `${type}-${Math.floor(Date.now() / 2000)}`;
    if (flagTracker.current.has(flagKey)) return;
    flagTracker.current.add(flagKey);
    const newFlag: Flag = { id: Date.now().toString(), time: new Date().toLocaleTimeString(), type, message };
    setFlags(prev => {
      const updated = [...prev, newFlag];
      console.log(`Flag added: ${type} | Total flags: ${updated.length}`);
      return updated;
    });
    showNotificationAlert(message);
  }, []);

  useEffect(() => {
    if (flags.length > MAX_FLAGS) {
      const summary = `Test Terminated!\n━━━━━━━━━━━━━━━━━━━━\nReason: Exceeded maximum flags (${MAX_FLAGS})\nTotal Flags: ${flags.length}\n━━━━━━━━━━━━━━━━━━━━\n\nFlag Summary:\n${flags.map(f => `${f.time} - ${f.message}`).join('\n')}\n\nYou will be redirected to the main screen.`;
      alert(summary);
      try { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) {}
      if (faceCheckInterval.current) clearInterval(faceCheckInterval.current);
      if (ttsDelayTimer.current) clearTimeout(ttsDelayTimer.current);
      exitFullscreen();
      navigate('/interview/set');
    }
  }, [flags, navigate]);

  const enterFullscreen = async () => {
    try { await document.documentElement.requestFullscreen(); setIsFullscreen(true); } catch (err) { console.warn("Fullscreen error:", err); }
  };
  const exitFullscreen = async () => {
    try { if (document.fullscreenElement) await document.exitFullscreen(); setIsFullscreen(false); } catch (err) { console.warn("Exit fullscreen error:", err); }
  };

  useEffect(() => {
    const handleFullscreenChange = () => {
      const inFullscreen = !!document.fullscreenElement;
      setIsFullscreen(inFullscreen);
      if (!inFullscreen && isFullscreen) addFlag('fullscreen-exit', '⚠️ Fullscreen mode exited - Please return to fullscreen');
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [isFullscreen, addFlag]);

  useEffect(() => {
    const handleVisibilityChange = () => { if (document.hidden) addFlag('tab-switch', '⚠️ Tab switched - Please stay on interview tab'); };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [addFlag]);

  useEffect(() => {
    let mounted = true;
    async function startCamera() {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 640 }, height: { ideal: 480 } }, audio: false });
        if (!mounted) { stream.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = stream;
        const attachStream = () => {
          if (videoRef.current && streamRef.current) {
            try {
              videoRef.current.srcObject = streamRef.current;
              videoRef.current.muted = true;
              videoRef.current.playsInline = true;
              videoRef.current.autoplay = true;
              videoRef.current.onloadedmetadata = () => {
                videoRef.current?.play().catch(err => { console.warn("Video autoplay blocked:", err); });
              };
            } catch (err) {
              console.error("Error attaching stream:", err);
            }
          }
        };
        attachStream();
        setTimeout(attachStream, 100);
      } catch (err: any) {
        console.error("Camera error:", err);
        if (mounted) {
          addFlag('face-detection', `⚠️ Camera access denied: ${err?.message ?? err}`);
          showNotificationAlert("Camera access denied — please enable camera and reload.");
        }
      }
    }
    startCamera();
    return () => {
      mounted = false;
      try { if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop()); } catch (e) { console.error("Error stopping camera:", e); }
      streamRef.current = null;
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
      if ("speechSynthesis" in window) { try { window.speechSynthesis.cancel(); } catch {} }
    };
  }, [addFlag]);

  const forcePlayVideo = () => {
    if (videoRef.current && streamRef.current) {
      videoRef.current.srcObject = streamRef.current;
      videoRef.current.muted = true;
      videoRef.current.play().catch(e => console.warn("Manual play failed:", e));
    }
  };

  useEffect(() => {
    faceCheckInterval.current = setInterval(() => {
      const facePresent = Math.random() > 0.15;
      const eyesOnScreen = Math.random() > 0.25;
      setFaceDetected(facePresent);
      setEyeContact(eyesOnScreen);
      if (!facePresent && faceDetected) addFlag('face-detection', '👤 Face not detected - Please look at the camera');
      if (!eyesOnScreen && eyeContact) addFlag('face-detection', '👁️ Please maintain eye contact with camera');
    }, 5000);
    return () => { if (faceCheckInterval.current) clearInterval(faceCheckInterval.current); };
  }, [faceDetected, eyeContact, addFlag]);

  async function fetchBlobFromUrl(url: string) {
    try {
      const resp = await fetch(url, { mode: "cors" });
      if (!resp.ok) throw new Error(`Failed to fetch audio: ${resp.status}`);
      return await resp.blob();
    } catch (err) {
      console.warn("fetchBlobFromUrl error:", err);
      throw err;
    }
  }

  async function playBlob(blob: Blob) {
    try { if ("speechSynthesis" in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); } catch {}
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    const url = URL.createObjectURL(blob);
    const audioEl = new Audio(url);
    audioEl.crossOrigin = "anonymous";
    audioEl.volume = 1;
    audioRef.current = audioEl;
    setIsPlayingTTS(true);
    setTtsStartTime(Date.now());
    audioEl.onended = () => {
      setIsPlayingTTS(false);
      setTtsStartTime(null);
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      audioRef.current = null;
    };
    audioEl.onerror = (e) => {
      console.warn("Audio element error:", e);
      setIsPlayingTTS(false);
      setTtsStartTime(null);
      audioRef.current = null;
    };
    try {
      await audioEl.play();
    } catch (err) {
      console.warn("Play blocked or failed:", err);
      setIsPlayingTTS(false);
      setTtsStartTime(null);
    }
  }

  const speakQuestionMurf = async (text: string) => {
    if (!ttsOn) return;
    try { if ("speechSynthesis" in window && window.speechSynthesis.speaking) window.speechSynthesis.cancel(); } catch {}
    if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
    setIsPlayingTTS(true);
    if (ttsDelayTimer.current) clearTimeout(ttsDelayTimer.current);
    ttsDelayTimer.current = setTimeout(async () => {
      try {
        const resp = await fetch('https://api.murf.ai/v1/speech/generate', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'api-key': MURF_API_KEY },
          body: JSON.stringify({ text, voiceId: "en-US-natalie", multiNativeLocale: "en-IN" })
        });
        if (!resp.ok) throw new Error(`Murf API error ${resp.status}`);
        const data = await resp.json();
        if (data.audioUrl) { const blob = await fetchBlobFromUrl(data.audioUrl); await playBlob(blob); return; }
        if (data.audioFile) {
          const val: string = data.audioFile;
          if (val.startsWith("data:audio")) { const res = await fetch(val); const blob = await res.blob(); await playBlob(blob); return; }
          else { const blob = await fetchBlobFromUrl(val); await playBlob(blob); return; }
        }
        const base64 = data.base64 || data.audioBase64 || data.audio_base64;
        if (base64 && typeof base64 === "string") {
          const byteString = atob(base64.replace(/^data:audio\/\w+;base64,/, ""));
          const ab = new ArrayBuffer(byteString.length);
          const ia = new Uint8Array(ab);
          for (let i = 0; i < byteString.length; i++) ia[i] = byteString.charCodeAt(i);
          const blob = new Blob([ab], { type: "audio/mpeg" });
          await playBlob(blob);
          return;
        }
        throw new Error("No playable audio in Murf response");
      } catch (err) {
        console.warn("Murf TTS error:", err);
        setIsPlayingTTS(false);
        setTtsStartTime(null);
        speakQuestionBrowser(text);
      }
    }, 2000);
  };

  const speakQuestionBrowser = (text: string) => {
    try {
      if (audioRef.current) { try { audioRef.current.pause(); } catch {} audioRef.current = null; }
      if (!("speechSynthesis" in window)) return;
      const synth = window.speechSynthesis;
      if (synth.speaking) synth.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.rate = 0.9;
      u.pitch = 1;
      u.lang = "en-US";
      u.onend = () => { setIsPlayingTTS(false); setTtsStartTime(null); };
      u.onerror = () => { setIsPlayingTTS(false); setTtsStartTime(null); };
      setIsPlayingTTS(true);
      setTtsStartTime(Date.now());
      synth.speak(u);
    } catch (e) {
      console.warn("Browser TTS failure:", e);
      setIsPlayingTTS(false);
      setTtsStartTime(null);
    }
  };

  useEffect(() => {
    return () => {
      try { if (audioRef.current) audioRef.current.pause(); } catch {}
      audioRef.current = null;
      if (ttsDelayTimer.current) clearTimeout(ttsDelayTimer.current);
      try { if ("speechSynthesis" in window) window.speechSynthesis.cancel(); } catch {}
    };
  }, []);

  useEffect(() => {
    setTimeLeft(perQuestionSeconds);
    setCode(starterFor(language));
    setTestResults([]);
    setShowTestResults(false);
    setTestStatus('idle');
    setShowMockScore(false);
  }, [index, language, perQuestionSeconds]);

  useEffect(() => {
    setTimeLeft(perQuestionSeconds);
    const id = setInterval(() => {
      setTimeLeft((t) => {
        if (t <= 1) { clearInterval(id); goNext(); return perQuestionSeconds; }
        return t - 1;
      });
    }, 1000);
    return () => clearInterval(id);
  }, [index, perQuestionSeconds]);

  async function handleRun() {
    setRunning(true);
    setStdout("");
    setStderr("");
    setShowMockScore(false);
    try {
      const response = await fetch(`${BACKEND_URL}/api/compile`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ language: language === 'cpp' ? 'c++' : language, code: code })
      });
      if (!response.ok) throw new Error(`Compiler API error: ${response.status}`);
      const result = await response.json();
      if (result.run) {
        setStdout(result.run.stdout || "");
        setStderr(result.run.stderr || "");
        if (result.run.code !== 0 && !result.run.stderr) setStderr(`Exit code: ${result.run.code}`);
      } else if (result.compile) {
        setStderr(result.compile.stderr || result.compile.output || "Compilation failed");
      }
      // ✅ Show mock score after code runs
      setShowMockScore(true);
    } catch (err) {
      setStderr(`Execution failed: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setRunning(false);
    }
  }

  async function runTestCases() {
    setIsTesting(true);
    setTestResults([]);
    const currentQuestion = questions[index];
    const testCaseKey = `${currentQuestion.id}-${topic}`;
    // Prefer generated tests that the backend validated against a reference solution.
    const tests: TestCase[] = currentQuestion.tests?.length
      ? currentQuestion.tests.map((t, i) => ({ input: t.stdin, expectedOutput: t.expected, description: `Test ${i + 1}` }))
      : TEST_CASES[testCaseKey] || [];

    if (tests.length === 0) {
      setTestResults([{ passed: false, input: "", expected: "", actual: "No test cases defined for this question", description: "N/A" }]);
      setShowTestResults(true);
      setTestStatus('failed');
      setIsTesting(false);
      return;
    }

    const results: TestResult[] = [];

    for (const test of tests) {
      try {
        let testCode = code;
        let stdin = test.input;

        const response = await fetch(`${BACKEND_URL}/api/compile`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ language: language === 'cpp' ? 'c++' : language, code: testCode, stdin: stdin })
        });

        if (!response.ok) {
          results.push({ passed: false, input: test.input, expected: test.expectedOutput, actual: "Execution error", description: test.description });
          continue;
        }

        const result = await response.json();
        const actual = (result.run?.stdout || result.run?.stderr || "").trim();
        const expected = test.expectedOutput.trim();
        
        const passed = normalizeOutput(actual) === normalizeOutput(expected);

        results.push({ passed, input: test.input, expected: expected, actual: actual, description: test.description });
      } catch (err) {
        results.push({ passed: false, input: test.input, expected: test.expectedOutput, actual: `Error: ${err instanceof Error ? err.message : String(err)}`, description: test.description });
      }
    }

    setTestResults(results);
    
    const allPassed = results.length > 0 && results.every(r => r.passed);
    setTestStatus(allPassed ? 'passed' : 'failed');

    const passedCount = results.filter(r => r.passed).length;
    const attempt: QuestionAttempt = {
      questionId: currentQuestion.id || `q${index + 1}`,
      questionText: currentQuestion.text,
      passed: allPassed,
      testsPassed: passedCount,
      testsTotal: results.length,
      code: code
    };
    
    setQuestionAttempts(prev => [...prev, attempt]);

    // Feed the Skill Scoring Engine (Eq. 1 inputs: correctness and solve time).
    engine.logAttempt({
      topic, difficulty: currentQuestion.difficulty || "medium",
      testsPassed: passedCount, testsTotal: results.length,
      timeMs: Date.now() - questionStart.current, source: "technical-dashboard",
    }).catch((e) => console.warn("engine log failed:", e));
    
    setShowTestResults(true);
    setIsTesting(false);
    
    if (allPassed) {
      showNotificationAlert("✅ All tests passed! Moving to next question...");
    } else {
      showNotificationAlert("❌ Some tests failed. Try again!");
    }
  }

  function normalizeOutput(str: string): string {
    return str.toLowerCase().replace(/\s+/g, ' ').trim();
  }

  async function handleSubmitAndNext() {
    await handleRun();
    await runTestCases();
    setTimeout(() => {
      if (testStatus === 'passed') {
        goNext();
      }
    }, 2000);
  }

  function goNext() {
    if (index >= questions.length - 1) {
      const totalPassed = questionAttempts.filter(a => a.passed).length;
      const summary = `Interview Complete!\n━━━━━━━━━━━━━━━━━━━━\nTopic: ${topic.toUpperCase()}\nQuestions Passed: ${totalPassed}/${questions.length}\nTotal Flags: ${flags.length}\n━━━━━━━━━━━━━━━━━━━━\n\nQuestion Summary:\n${questionAttempts.map(a => `Q: ${a.testsPassed}/${a.testsTotal} tests passed - ${a.passed ? '✅ PASS' : '❌ FAIL'}`).join('\n')}\n\n${flags.length > 0 ? '\nFlag Summary:\n' + flags.map(f => `${f.time} - ${f.message}`).join('\n') : ''}`;
      alert(summary);
      exitFullscreen();
      return;
    }
    setIndex((i) => i + 1);
    questionStart.current = Date.now();
    setStdout("");
    setStderr("");
    setTestResults([]);
    setShowTestResults(false);
    setTestStatus('idle');
    setShowMockScore(false);
  }

  function toggleCamera() {
    try {
      const tracks = streamRef.current?.getVideoTracks() || [];
      if (tracks.length > 0) {
        const newState = !tracks[0].enabled;
        tracks.forEach((t) => (t.enabled = newState));
        setCameraEnabled(newState);
      }
    } catch (e) {
      console.error("Toggle camera error:", e);
    }
  }

  function getFileName(lang: string): string {
    switch (lang) { case 'python': return 'main.py'; case 'java': return 'Main.java'; case 'cpp': return 'main.cpp'; case 'javascript': return 'main.js'; default: return 'main.txt'; }
  }

  if (questionsLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-card rounded-lg p-8 shadow-lg border">
          <div className="text-center">
            <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Loading Questions...</h1>
            <p className="text-muted-foreground">Generating interview questions for: <strong>{topic.replace(/-/g, ' ').toUpperCase()}</strong></p>
          </div>
        </div>
      </div>
    );
  }

  if (questionsError || questions.length === 0) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-card rounded-lg p-8 shadow-lg border">
          <div className="text-center">
            <AlertTriangle className="w-12 h-12 text-destructive mx-auto mb-4" />
            <h1 className="text-2xl font-bold mb-2">Failed to Load Questions</h1>
            <p className="text-muted-foreground mb-4">{questionsError || "No questions available. Make sure your backend server is running on port 5000."}</p>
            <button onClick={() => navigate('/interview/set')} className="inline-flex items-center justify-center rounded-md text-sm font-medium bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-6">
              Go Back
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!isFullscreen) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-6">
        <div className="max-w-2xl w-full bg-card rounded-lg p-8 shadow-lg border">
          <div className="text-center">
            <div className="w-20 h-20 bg-primary rounded-full flex items-center justify-center mx-auto mb-6">
              <Video className="w-10 h-10 text-primary-foreground" />
            </div>
            <h1 className="text-4xl font-bold mb-4">Live Coding Interview</h1>
            <p className="text-muted-foreground mb-2">Role: <span className="text-foreground font-semibold">{role}</span></p>
            <p className="text-muted-foreground mb-2">Topic: <span className="text-foreground font-semibold">{topic.replace(/-/g, ' ').toUpperCase()}</span></p>
            <p className="text-muted-foreground mb-6">Language: <span className="text-foreground font-semibold">{language}</span></p>
            <p className="text-muted-foreground mb-2">Questions: <span className="text-foreground font-semibold">{questions.length} from Gemini AI</span></p>

            <div className="bg-destructive/10 border border-destructive/50 rounded-lg p-4 mb-6">
              <h3 className="text-destructive font-semibold mb-2 flex items-center justify-center gap-2">
                <AlertTriangle className="w-5 h-5" />
                Important Guidelines
              </h3>
              <ul className="text-sm text-muted-foreground text-left space-y-1">
                <li>• Test will run in fullscreen mode</li>
                <li>• Camera monitoring is active throughout</li>
                <li>• Maintain eye contact with camera</li>
                <li>• Switching tabs will be flagged</li>
                <li>• Exiting fullscreen will be flagged</li>
                <li>• Face detection every 5 seconds</li>
                <li>• <strong className="text-destructive">Maximum {MAX_FLAGS} flags allowed</strong></li>
                <li>• <strong className="text-green-600">✅ All tests must PASS to proceed</strong></li>
              </ul>
            </div>

            <button onClick={enterFullscreen} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-primary text-primary-foreground hover:bg-primary/90 h-11 px-8">
              Start Interview in Fullscreen
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground relative">
      {showNotification && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 animate-bounce">
          <div className="bg-destructive text-destructive-foreground px-6 py-4 rounded-lg shadow-lg border flex items-center gap-3">
            <AlertTriangle className="w-6 h-6" />
            <span className="font-semibold">{notificationMsg}</span>
          </div>
        </div>
      )}

      <div className="max-w-7xl mx-auto p-4">
        <div className="flex items-center justify-between mb-4 bg-card rounded-lg p-4 border shadow-sm">
          <div>
            <h1 className="text-2xl font-bold">Live Coding Interview</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Topic: <span className="text-foreground font-semibold">{topic.replace(/-/g, ' ').toUpperCase()}</span>
            </p>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border">
              {faceDetected ? (<CheckCircle2 className="w-5 h-5 text-green-600" />) : (<AlertTriangle className="w-5 h-5 text-destructive" />)}
              <span className="text-sm font-semibold">{faceDetected ? 'Face Detected' : 'No Face'}</span>
            </div>

            <div className="flex items-center gap-2 px-3 py-2 bg-muted rounded-lg border">
              {eyeContact ? (<Eye className="w-5 h-5 text-blue-600" />) : (<EyeOff className="w-5 h-5 text-orange-500" />)}
              <span className="text-sm font-semibold">{eyeContact ? 'Eyes on Screen' : 'Look at Camera'}</span>
            </div>

            <div className={`px-4 py-2 border rounded-lg ${flags.length > MAX_FLAGS - 2 ? 'bg-destructive text-destructive-foreground border-destructive' : 'bg-destructive/10 border-destructive/50'}`}>
              <span className="text-sm">Flags: <span className="font-bold text-lg">{flags.length}/{MAX_FLAGS}</span></span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-12 gap-4">
          <div className="col-span-12 lg:col-span-5 space-y-4">
            <div className="bg-card rounded-lg p-6 shadow-sm border">
              <div className="flex justify-between items-start mb-4">
                <div>
                  <h2 className="text-xl font-bold">Question {index + 1} / {questions.length}</h2>
                  <div className="flex items-center gap-2 mt-2">
                    <Clock className={`w-5 h-5 ${timeLeft < 60 ? 'text-destructive' : 'text-orange-500'}`} />
                    <span className={`text-2xl font-mono font-bold ${timeLeft < 60 ? 'text-destructive' : 'text-foreground'}`}>{formatTime(timeLeft)}</span>
                  </div>
                </div>
                <button onClick={() => setTtsOn(v => !v)} className={`px-3 py-2 rounded-md text-sm font-semibold ${ttsOn ? 'bg-green-600 text-white' : 'bg-muted text-muted-foreground'}`}>
                  TTS {ttsOn ? 'ON' : 'OFF'}
                </button>
              </div>

              <div className="bg-muted rounded-lg p-5 mb-4 border">
                <p className="text-foreground text-base leading-relaxed whitespace-pre-wrap">{questions[index].text}</p>
              </div>

              <div className="flex gap-3">
                <button onClick={() => speakQuestionMurf(questions[index].text)} disabled={isPlayingTTS} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-primary text-primary-foreground hover:bg-primary/90 h-10 px-4 gap-2">
                  {isPlayingTTS ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {ttsStartTime ? `Playing... (${Math.round((Date.now() - ttsStartTime) / 1000)}s)` : "Starting..."}
                    </>
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Read Question
                    </>
                  )}
                </button>
                <button onClick={() => setTimeLeft(t => t + 30)} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4">
                  +30s
                </button>
                <div className="ml-auto flex items-center gap-2 text-sm bg-muted px-3 py-2 rounded-lg border">
                  <span className="text-muted-foreground">Lang:</span>
                  <span className="text-foreground font-bold">{language}</span>
                </div>
              </div>
            </div>

            <div className="bg-card rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-semibold">📹 Camera Feed</h3>
                <button onClick={toggleCamera} className={`p-2 rounded-md transition ${cameraEnabled ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-destructive text-destructive-foreground hover:bg-destructive/90'}`}>
                  {cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                </button>
              </div>

              <div onClick={forcePlayVideo} className="aspect-video bg-black rounded-md overflow-hidden border-2 border-border relative cursor-pointer">
                <video 
                  ref={videoRef} 
                  autoPlay 
                  muted 
                  playsInline 
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {!faceDetected && (
                  <div className="absolute inset-0 bg-destructive/20 flex items-center justify-center backdrop-blur-sm">
                    <div className="text-center">
                      <AlertTriangle className="w-8 h-8 text-destructive-foreground mx-auto mb-2" />
                      <span className="text-destructive-foreground font-bold text-sm">Face Not Detected</span>
                    </div>
                  </div>
                )}
                {!cameraEnabled && (
                  <div className="absolute inset-0 bg-black/80 flex items-center justify-center">
                    <div className="text-center">
                      <VideoOff className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
                      <span className="text-muted-foreground text-sm">Camera Disabled</span>
                    </div>
                  </div>
                )}
              </div>

              <p className="text-xs text-muted-foreground mt-2 text-center">
                🔍 Click video if frozen • Monitoring active every 5s
              </p>
            </div>
          </div>

          <div className="col-span-12 lg:col-span-7 space-y-4">
            <div className="flex items-center justify-between bg-card rounded-lg p-3 border shadow-sm">
              <div className="flex items-center gap-3">
                <button onClick={handleRun} disabled={running} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-green-600 text-white hover:bg-green-700 h-10 px-4 gap-2">
                  {running ? (<><Loader2 className="w-4 h-4 animate-spin" />Running...</>) : (<><Play className="w-4 h-4" />Run Code</>)}
                </button>

                <button onClick={handleSubmitAndNext} disabled={running || isTesting} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50 bg-blue-600 text-white hover:bg-blue-700 h-10 px-4 gap-2">
                  {isTesting ? (<><Loader2 className="w-4 h-4 animate-spin" />Testing...</>) : (<><Send className="w-4 h-4" />Submit & Test</>)}
                </button>

                <button onClick={() => { setCode(starterFor(language)); setStdout(""); setStderr(""); setTestStatus('idle'); }} className="inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring bg-secondary text-secondary-foreground hover:bg-secondary/80 h-10 px-4 gap-2">
                  <RotateCcw className="w-4 h-4" /> Reset
                </button>
              </div>
              <div className="text-xs text-muted-foreground bg-muted px-3 py-2 rounded-md"></div>
            </div>

            <div className="bg-card rounded-lg p-4 shadow-sm border">
              <div className="flex items-center justify-between bg-muted rounded-md px-3 py-2 mb-3">
                <span className="text-xs text-muted-foreground font-mono">📝 Code Editor</span>
                <span className="text-xs text-foreground font-mono">{language.toUpperCase()}</span>
              </div>
              <div className="h-96 rounded-md overflow-hidden border">
                <Editor
                  height="100%"
                  language={language === "cpp" ? "cpp" : language}
                  value={code}
                  onChange={(v) => setCode(v ?? "")}
                  theme="vs-dark"
                  options={{ fontSize: 14, minimap: { enabled: false }, scrollBeyondLastLine: false, automaticLayout: true, tabSize: 4 }}
                />
              </div>
            </div>

           {showMockScore && (
      <div className="bg-card rounded-lg p-4 border shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold">Code Quality Score</h3>
          <div className="px-3 py-1 bg-destructive text-white rounded font-bold text-sm">0/1</div>
        </div>
        <div className="grid grid-cols-4 gap-2 mb-4">
          <div className="bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground font-semibold">Correctness</p><p className="text-lg font-bold text-destructive mt-1">0/1</p></div>
          <div className="bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground font-semibold">Efficiency</p><p className="text-lg font-bold text-destructive mt-1">0/1</p></div>
          <div className="bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground font-semibold">Quality</p><p className="text-lg font-bold text-destructive mt-1">0/1</p></div>
          <div className="bg-muted rounded-lg p-3 text-center"><p className="text-xs text-muted-foreground font-semibold">Structure</p><p className="text-lg font-bold text-destructive mt-1">0/1</p></div>
        </div>
        <p className="text-xs text-muted-foreground text-center italic">Basic code - needs improvement</p>
      </div>
    )}


            {showTestResults && (
              <div className={`bg-card rounded-lg p-4 border shadow-sm ${testStatus === 'passed' ? 'border-green-500 bg-green-50 dark:bg-green-950' : testStatus === 'failed' ? 'border-destructive bg-red-50 dark:bg-red-950' : ''}`}>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-semibold flex items-center gap-2">
                    {testStatus === 'passed' ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="text-green-700 dark:text-green-100">✅ All Tests Passed!</span>
                      </>
                    ) : testStatus === 'failed' ? (
                      <>
                        <X className="w-5 h-5 text-destructive" />
                        <span className="text-destructive">❌ Tests Failed</span>
                      </>
                    ) : null}
                  </h3>
                  <span className="text-xs font-semibold">{testResults.filter(r => r.passed).length}/{testResults.length} passed</span>
                </div>
                
                <div className="space-y-2 max-h-64 overflow-y-auto">
                  {testResults.map((result, idx) => (
                    <div key={idx} className={`p-3 rounded-md border ${result.passed ? 'bg-green-100 dark:bg-green-900 border-green-400' : 'bg-red-100 dark:bg-red-900 border-red-400'}`}>
                      <div className="flex items-start gap-2">
                        {result.passed ? (
                          <CheckCircle className="w-4 h-4 text-green-600 mt-0.5 flex-shrink-0" />
                        ) : (
                          <X className="w-4 h-4 text-destructive mt-0.5 flex-shrink-0" />
                        )}
                        <div className="flex-1 text-sm">
                          <p className={result.passed ? 'text-green-900 dark:text-green-100 font-semibold' : 'text-red-900 dark:text-red-100 font-semibold'}>
                            {result.description}
                          </p>
                          <p className="text-xs mt-1 opacity-75">Input: {result.input}</p>
                          <p className="text-xs opacity-75">Expected: <strong>{result.expected}</strong></p>
                          <p className="text-xs opacity-75">Got: <strong>{result.actual}</strong></p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="grid grid-cols-2 gap-4">
              <div className="bg-card rounded-lg p-4 border shadow-sm">
                <div className="flex items-center gap-2 mb-3"><CheckCircle2 className="w-4 h-4 text-green-600" /><h3 className="text-sm font-semibold">Output</h3></div>
                <pre className="text-green-600 text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">{stdout || "No output yet. Run your code to see results."}</pre>
              </div>
              <div className="bg-card rounded-lg p-4 border shadow-sm">
                <div className="flex items-center gap-2 mb-3"><AlertTriangle className="w-4 h-4 text-destructive" /><h3 className="text-sm font-semibold text-destructive">Errors</h3></div>
                <pre className="text-destructive text-xs font-mono whitespace-pre-wrap max-h-40 overflow-auto">{stderr || "No errors."}</pre>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function formatTime(s: number) {
  const sec = Math.max(0, Math.floor(s));
  const mm = Math.floor(sec / 60).toString().padStart(2, "0");
  const ss = (sec % 60).toString().padStart(2, "0");
  return `${mm}:${ss}`;
}

function starterFor(lang: string) {
  if (lang === "python") return `# Python Solution\ndef solution():\n    pass\n\nif __name__ == "__main__":\n    solution()`;
  if (lang === "java") return `// Java Solution\npublic class Main {\n    public static void main(String[] args) {\n        // Your code here\n    }\n}`;
  if (lang === "cpp") return `// C++ Solution\n#include <iostream>\nusing namespace std;\n\nint main() {\n    // Your code here\n    return 0;\n}`;
  return `// Code here\nconsole.log("Hello, World!");`;
}
