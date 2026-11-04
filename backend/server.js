// server.js
// HireVue-style interview server using Cloudinary and local JSON storage.

import resumeCheckRouter from './resume-check.js';
import engineRouter from './engine/routes.mjs';
import codingApp from './info.js';
import { geminiKeyMiddleware, geminiKey, requireKey } from './gemini-key.js';
import express from 'express';
import cors from 'cors';
import multer from 'multer';

import { nanoid } from 'nanoid';
import cloudinary from 'cloudinary';
import fs from 'fs-extra';
import path from 'path';
import { fetch } from 'undici';
import dotenv from 'dotenv';
dotenv.config()
const app = express();
app.use(cors());
app.use(geminiKeyMiddleware);
app.use(express.json({ limit: '20mb' }));

// Add resume check router
app.use('/api', resumeCheckRouter);

// Skill Scoring Engine (topic scores, success probability, adaptive roadmap)
app.use('/api/engine', engineRouter);

// ----------------------------
// CONFIG
// ----------------------------
const CLOUDINARY_CLOUD_NAME = process.env.CLOUDINARY_CLOUD_NAME;
const CLOUDINARY_API_KEY = process.env.CLOUDINARY_API_KEY;
const CLOUDINARY_API_SECRET = process.env.CLOUDINARY_API_SECRET;

// Model is configurable because Google retires model versions for new keys.
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-flash-latest";
const DEEPGRAM_API_KEY = process.env.DEEPGRAM_API_KEY;

const PORT = process.env.PORT || 8080;
const MURF_API_KEY = process.env.MURF_API_KEY;
const HAS_CLOUDINARY = Boolean(CLOUDINARY_CLOUD_NAME && CLOUDINARY_API_KEY && CLOUDINARY_API_SECRET);
const ATTEMPTS_FILE = path.join(process.cwd(), "attempts.json");
const EVENTS_FILE = path.join(process.cwd(), "events.json");

// ----------------------------
// Cloudinary config
// ----------------------------
cloudinary.v2.config({
  cloud_name: CLOUDINARY_CLOUD_NAME,
  api_key: CLOUDINARY_API_KEY,
  api_secret: CLOUDINARY_API_SECRET,
});

// ----------------------------
// multer (memory) for uploads
// ----------------------------
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 250 * 1024 * 1024 },
});

// ----------------------------
// local JSON helpers
// ----------------------------
async function readJSON(filePath) {
  try {
    const exists = await fs.pathExists(filePath);
    if (!exists) return [];
    const txt = await fs.readFile(filePath, "utf8");
    return JSON.parse(txt || "[]");
  } catch (e) {
    console.warn("readJSON error for", filePath, e);
    return [];
  }
}

async function writeJSON(filePath, arr) {
  try {
    await fs.writeFile(filePath, JSON.stringify(arr, null, 2));
  } catch (e) {
    console.warn("writeJSON error for", filePath, e);
  }
}

async function saveAttemptMetadata(meta) {
  const arr = await readJSON(ATTEMPTS_FILE);
  arr.push(meta);
  await writeJSON(ATTEMPTS_FILE, arr);
}

// ----------------------------
// Gemini helper (REST generateContent)
// ----------------------------
async function callGemini(promptText, model = GEMINI_MODEL) {
  if (!geminiKey()) {
    throw new Error("NEED_KEY");
  }

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
  const payload = {
    contents: [{ parts: [{ text: promptText }] }],
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-goog-api-key": geminiKey(),
    },
    body: JSON.stringify(payload),
  });

  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Gemini error ${res.status}: ${txt}`);
  }
  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.[0]?.text;
  return typeof text === "string" ? text.trim() : JSON.stringify(json);
}

// ----------------------------
// Generate questions using Gemini
// ----------------------------
app.post("/api/generate-questions", requireKey, async (req, res) => {
  try {
    const { rolePrompt, company = "", interviewType = "behavioural", count = 2 } = req.body || {};
    if (!rolePrompt || typeof rolePrompt !== "string") {
      return res.status(400).json({ error: "rolePrompt required" });
    }
    const n = Math.max(1, Math.min(15, parseInt(count) || 2));
    const type = ["behavioural", "hr", "case"].includes(String(interviewType).toLowerCase()) ? String(interviewType).toLowerCase() : "behavioural";
    const org = String(company).slice(0, 80);

    if (geminiKey()) {
      // Persona conditioning: a consistent interviewer identity tied to the target company.
      const prompt = `
You are a senior interviewer${org ? ` at ${org}` : ""} running a ${type} interview for this role: "${rolePrompt}".
Stay in this persona: ask the kind of questions ${org || "a strong technology company"} is known to ask for this role${org ? ", reflecting its stated values and culture" : ""}.
Produce EXACTLY ${n} interview question${n > 1 ? "s" : ""} for a recorded interview.

Requirements:
- Output the questions separated by a blank line. No numbering or commentary.
- Keep each question one or two sentences, behavioural or scenario focused.
- Cover different competencies (e.g. conflict, failure, ownership, leadership, ambiguity).
`;
      const out = await callGemini(prompt);
      const parts = out.split(/\n\s*\n/).map(p => p.trim()).filter(Boolean).slice(0, n);
      if (parts.length >= Math.min(2, n)) {
        const questions = parts.map(q => ({ id: `q-${nanoid(6)}`, text: q }));
        return res.json({ questions });
      }
    }

    // fallback
    const base = rolePrompt.trim();
    const q1 = `Describe a challenging situation you solved that relates to "${base}". What steps did you take and what was the outcome?`;
    const q2 = `If hired for ${base}, how would you prioritize the first 3 things you work on? Walk us through your decision and rationale.`;
    const questions = [
      { id: `q-${nanoid(6)}`, text: q1 },
      { id: `q-${nanoid(6)}`, text: q2 },
    ];
    return res.json({ questions });
  } catch (err) {
    console.error("generate-questions error:", err);
    return res.status(500).json({ error: "server error generating questions" });
  }
});

// ----------------------------
// Upload endpoint (Cloudinary)
// ----------------------------
app.post("/api/upload-answer", requireKey, upload.single("file"), async (req, res) => {
  try {
    const file = req.file;
    const { sessionId, questionId, userId, questionText } = req.body || {};

    if (!file) return res.status(400).send("file is required (multipart 'file')");
    if (!sessionId) return res.status(400).send("sessionId required");
    if (!questionId) return res.status(400).send("questionId required");
    if (!userId) return res.status(400).send("userId required");

    const attemptId = `attempt-${nanoid(8)}`;
    const originalName = file.originalname || `${attemptId}.webm`;

    const uploadStream = () =>
      new Promise((resolve, reject) => {
        const cldStream = cloudinary.v2.uploader.upload_stream(
          {
            resource_type: "video",
            folder: `interview_attempts/${sessionId}`,
            public_id: `${questionId}-${Date.now()}-${nanoid(6)}`,
            chunk_size: 6000000,
          },
          (error, result) => {
            if (error) return reject(error);
            resolve(result);
          }
        );
        cldStream.end(file.buffer);
      });

    // Cloudinary keeps the video if configured; otherwise we only keep the transcript and scores.
    let result = {};
    if (HAS_CLOUDINARY) {
      try { result = await uploadStream(); } catch (e) { console.warn("Cloudinary upload failed:", e.message); }
    }

    const meta = {
      attemptId,
      sessionId,
      questionId,
      questionText: questionText || null,
      userId,
      originalName,
      cloudinaryUrl: result.secure_url,
      public_id: result.public_id,
      resource_type: result.resource_type,
      format: result.format,
      bytes: result.bytes,
      uploadedAt: new Date().toISOString(),
      processed: false,
      rawResult: result,
    };

    await saveAttemptMetadata(meta);

    // async process (fire and forget); the buffer lets us transcribe without Cloudinary
    processAttemptFile({ ...meta, buffer: file.buffer, mimetype: file.mimetype || "video/webm" })
      .catch(e => console.error("processAttemptFile failed:", e));

    return res.json({ ok: true, meta: { attemptId: meta.attemptId, uploadedAt: meta.uploadedAt } });
  } catch (err) {
    console.error("upload-answer error:", err);
    return res.status(500).json({ error: err.message || "upload error" });
  }
});

// ----------------------------
// flag-suspicious
// ----------------------------
app.post("/api/flag-suspicious", async (req, res) => {
  try {
    const { sessionId, userId, reason } = req.body || {};
    const event = { id: `evt-${nanoid(6)}`, sessionId, userId, reason: reason || "unknown", at: new Date().toISOString() };
    const arr = await readJSON(EVENTS_FILE);
    arr.push(event);
    await writeJSON(EVENTS_FILE, arr);
    return res.json({ ok: true, event });
  } catch (err) {
    console.error("flag-suspicious error:", err);
    res.status(500).json({ error: "failed to flag" });
  }
});

// ----------------------------
// Admin: list attempts
// ----------------------------
app.get("/api/admin/attempts", async (req, res) => {
  try {
    const arr = await readJSON(ATTEMPTS_FILE);
    arr.sort((a, b) => (b.uploadedAt || "").localeCompare(a.uploadedAt || ""));
    return res.json({ attempts: arr });
  } catch (err) {
    console.error("admin attempts error", err);
    res.status(500).json({ error: "failed to read attempts" });
  }
});

// ----------------------------
// Deepgram STT helper
// ----------------------------
async function transcribeWithDeepgram(fileUrl) {
  if (!DEEPGRAM_API_KEY) {
    console.warn("DEEPGRAM_API_KEY missing; returning empty transcript.");
    return "";
  }

  try {
    const resp = await fetch(`https://api.deepgram.com/v1/listen?punctuate=true&language=en-US`, {
      method: "POST",
      headers: {
        Authorization: `Token ${DEEPGRAM_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ url: fileUrl }),
    });

    if (!resp.ok) {
      const txt = await resp.text();
      console.warn("Deepgram listen failed:", resp.status, txt);
      return "";
    }

    const j = await resp.json();
    const transcript = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
    if (typeof transcript === "string") return transcript;
    return "";
  } catch (e) {
    console.warn("Deepgram request failed:", e);
    return "";
  }
}

// Deepgram (by URL or raw bytes) when DEEPGRAM_API_KEY is set, otherwise Gemini audio understanding.
async function transcribe({ fileUrl, buffer, mimetype }) {
  if (DEEPGRAM_API_KEY) {
    if (fileUrl) {
      const t = await transcribeWithDeepgram(fileUrl);
      if (t) return t;
    }
    if (buffer) {
      try {
        const r = await fetch("https://api.deepgram.com/v1/listen?punctuate=true&language=en-US&smart_format=true", {
          method: "POST",
          headers: { Authorization: `Token ${DEEPGRAM_API_KEY}`, "Content-Type": mimetype || "video/webm" },
          body: buffer,
        });
        if (r.ok) {
          const j = await r.json();
          const t = j?.results?.channels?.[0]?.alternatives?.[0]?.transcript;
          if (t) return t;
        }
      } catch (e) { console.warn("Deepgram bytes failed:", e.message); }
    }
  }
  if (buffer && geminiKey() && buffer.length < 19 * 1024 * 1024) {
    try {
      const r = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": geminiKey() },
        body: JSON.stringify({
          contents: [{ parts: [
            { inline_data: { mime_type: (mimetype || "video/webm").split(";")[0], data: buffer.toString("base64") } },
            { text: "Transcribe exactly what the speaker says, word for word, including filler words like um and uh. Return only the transcript text. If nobody speaks, return an empty string." },
          ] }],
          generationConfig: { temperature: 0 },
        }),
      });
      if (r.ok) {
        const j = await r.json();
        return (j?.candidates?.[0]?.content?.parts?.[0]?.text || "").trim();
      }
      console.warn("Gemini transcription failed:", r.status, (await r.text()).slice(0, 200));
    } catch (e) { console.warn("Gemini transcription error:", e.message); }
  }
  return "";
}

// ----------------------------
// utility: extract JSON substring
// ----------------------------
function extractJson(text) {
  try {
    const cleaned = text.replace(/``````\s*/g, '').trim();
    const jsonMatch = cleaned.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return JSON.parse(jsonMatch[0]);
    }
    return JSON.parse(cleaned);
  } catch (e) {
    console.warn("JSON extraction failed:", e.message);
    return null;
  }
}

// ----------------------------
// Validates and normalizes scoring
// ----------------------------
function validateAndNormalizeScoring(rawScoring, transcript) {
  const hasTranscript = transcript && transcript.trim().length > 0;

  const scores = {
    fluency: parseInt(rawScoring?.fluency) || 0,
    correctness: parseInt(rawScoring?.correctness) || 0,
    grammar: parseInt(rawScoring?.grammar) || 0,
    stammering: parseInt(rawScoring?.stammering) || 0,
    content: parseInt(rawScoring?.content) || 0,
  };

  Object.keys(scores).forEach(key => {
    scores[key] = Math.max(0, Math.min(10, scores[key]));
  });

  const allZero = Object.values(scores).every(score => score === 0);
  if (allZero) {
    const minScore = hasTranscript ? 3 : 1;
    Object.keys(scores).forEach(key => {
      scores[key] = minScore;
    });
  }

  const calculatedTotal = scores.fluency + scores.correctness +
    scores.grammar + scores.stammering +
    scores.content;

  return {
    ...scores,
    total: calculatedTotal,
    notes: rawScoring?.notes || (hasTranscript
      ? "Scoring completed successfully."
      : "No audio detected - minimal scores assigned.")
  };
}

// ----------------------------
// Generates fallback scores
// ----------------------------
function generateFallbackScoring(transcript) {
  const hasContent = transcript && transcript.trim().length > 0;

  if (!hasContent) {
    return {
      fluency: 1,
      correctness: 1,
      grammar: 1,
      stammering: 1,
      content: 1,
      total: 5,
      notes: "No audio detected - minimal scores assigned."
    };
  }

  const wordCount = transcript.trim().split(/\s+/).length;
  const sentenceCount = transcript.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const avgWordsPerSentence = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  const baseScore = Math.min(5, Math.max(3, Math.floor(wordCount / 10)));
  const lengthBonus = wordCount > 50 ? 1 : 0;
  const structureBonus = avgWordsPerSentence > 5 && avgWordsPerSentence < 25 ? 1 : 0;

  const scores = {
    fluency: Math.min(10, baseScore + lengthBonus),
    correctness: Math.min(10, baseScore),
    grammar: Math.min(10, baseScore + structureBonus),
    stammering: Math.min(10, baseScore + 1),
    content: Math.min(10, baseScore + lengthBonus),
  };

  const total = scores.fluency + scores.correctness +
    scores.grammar + scores.stammering +
    scores.content;

  return {
    ...scores,
    total,
    notes: "Automatic scoring applied (AI grading unavailable)."
  };
}

// ----------------------------
// processAttemptFile
// ----------------------------
async function processAttemptFile(meta) {
  try {
    console.log("processAttemptFile start for", meta.attemptId);
    const fileUrl = meta.cloudinaryUrl;
    const { buffer, mimetype } = meta;
    delete meta.buffer; delete meta.mimetype;
    const questionText = meta.questionText || `Question ID: ${meta.questionId}`;

    // Step 1: Transcribe audio
    let transcript = "";
    try {
      transcript = await transcribe({ fileUrl, buffer, mimetype });
      console.log("Deepgram transcript:", transcript ? `${transcript.length} chars` : "empty");
    } catch (e) {
      console.warn("Transcription failed:", e.message);
      transcript = "";
    }

    // Step 2: Build scoring prompt
    const scoringPrompt = `
You are an objective grader. Given the QUESTION and the CANDIDATE TRANSCRIPT below, assign integer scores (0-10) for each criterion.

SCORING CRITERIA (each 0-10 points):
- fluency: How smoothly and naturally the candidate speaks
- correctness: Accuracy and relevance of the answer
- grammar: Proper sentence structure and language usage
- stammering: Frequency of hesitations (10 = none, 0 = excessive)
- content: Depth and quality of the response

CRITICAL REQUIREMENTS:
1. Each score MUST be an integer between 0 and 10
2. You MUST provide scores for ALL five criteria (no null/undefined values)
3. Do NOT calculate total yourself - just provide the five scores
4. If transcript is empty or very poor, assign 1 point to each criterion
5. Be fair but realistic in your scoring

Return ONLY a JSON object (no markdown, no explanation):
{
  "fluency": <integer 0-10>,
  "correctness": <integer 0-10>,
  "grammar": <integer 0-10>,
  "stammering": <integer 0-10>,
  "content": <integer 0-10>,
  "notes": "<brief 1-2 sentence explanation>"
}

QUESTION:
${questionText}

TRANSCRIPT:
${transcript || "(empty - no audio detected)"}
`;

    // Step 3: Get AI scoring
    let scoring = null;
    if (geminiKey()) {
      try {
        const geminiResponse = await callGemini(scoringPrompt);
        console.log("Gemini raw response:", geminiResponse?.substring(0, 200));

        const parsed = extractJson(geminiResponse);
        console.log("Parsed scoring:", parsed);

        if (parsed && (parsed.fluency !== undefined || parsed.total !== undefined)) {
          scoring = validateAndNormalizeScoring(parsed, transcript);
          console.log("AI scoring validated:", scoring);
        }
      } catch (e) {
        console.warn("Gemini scoring error:", e.message);
      }
    } else {
      console.log("Gemini API key not configured");
    }

    // Step 4: Apply fallback if AI scoring failed
    if (!scoring || scoring.total === 0) {
      console.log("Applying fallback scoring");
      scoring = generateFallbackScoring(transcript);
    }

    // Step 5: Final validation
    scoring = validateAndNormalizeScoring(scoring, transcript);
    console.log("Final scoring:", scoring);

    // Step 6: Save results
    const arr = await readJSON(ATTEMPTS_FILE);
    const idx = arr.findIndex(a => a.attemptId === meta.attemptId);
    const now = new Date().toISOString();

    const update = {
      processed: true,
      processedAt: now,
      transcript: transcript || "",
      scoring
    };

    if (idx >= 0) {
      arr[idx] = { ...arr[idx], ...update };
    } else {
      arr.push({ ...meta, ...update });
    }

    await writeJSON(ATTEMPTS_FILE, arr);

    console.log(
      `✓ Processing complete for ${meta.attemptId}`,
      `| Total: ${scoring.total}/50`,
      `| Scores: F:${scoring.fluency} C:${scoring.correctness} G:${scoring.grammar} S:${scoring.stammering} Co:${scoring.content}`
    );

    return { success: true, scoring };
  } catch (err) {
    console.error("processAttemptFile error:", err);
    return { success: false, error: err.message };
  }
}

// ----------------------------
// Start server
// ----------------------------
// ----------------------------
// TTS: Murf on the server so the key never ships to the browser.
// The frontend falls back to the browser voice on any error.
// ----------------------------
app.post("/api/tts", async (req, res) => {
  const text = String(req.body?.text || "").slice(0, 2500);
  if (!MURF_API_KEY || !text) return res.status(503).json({ error: "tts unavailable" });
  try {
    const r = await fetch("https://api.murf.ai/v1/speech/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "api-key": MURF_API_KEY },
      body: JSON.stringify({ text, voiceId: "en-US-natalie", format: "MP3" }),
    });
    if (!r.ok) return res.status(503).json({ error: `murf ${r.status}` });
    const j = await r.json();
    return j.audioFile ? res.json({ audioFile: j.audioFile }) : res.status(503).json({ error: "no audio" });
  } catch (e) {
    return res.status(503).json({ error: "tts failed" });
  }
});

app.get("/", (_req, res) => res.json({ ok: true, service: "prepninja-api" }));

// Coding round routes (/api/generate, /api/evaluate, /api/compile, /api/health)
app.use(codingApp);

app.listen(PORT, () => {
  console.log(`Interview server listening on port ${PORT}`);
  console.log(`Node version: ${process.version}`);
  console.log(`Cloudinary uploads: interview_attempts/<sessionId>`);
  console.log(`Generate questions: POST /api/generate-questions`);
  console.log(`Upload: POST /api/upload-answer`);
  console.log(`Admin: GET /api/admin/attempts`);
  console.log(`Resume analysis: POST /api/analyze-resume`);
});
