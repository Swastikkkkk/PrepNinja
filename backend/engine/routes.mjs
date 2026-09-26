// REST API for the Skill Scoring Engine. Mounted at /api/engine in server.js.
import express from "express";
import fs from "fs-extra";
import path from "path";
import { fileURLToPath } from "url";
import { topicScore, bktMastery, successProbability, buildRoadmap, practiceStreak, badges, DEFAULTS, PRESETS } from "./scoring.mjs";
import { TOPICS, PREREQS } from "./prerequisites.mjs";
import { createStore } from "./store.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const CW = fs.readJsonSync(path.join(here, "company_weights.json"));
// SCORING_MODE: tuned (default) | paper | bkt. See research/benchmark for the comparison.
const MODE = (process.env.SCORING_MODE || "tuned").toLowerCase();
const PRESET = PRESETS[MODE] || PRESETS.tuned;
const DEFAULT_BASELINE_MS = { easy: 10 * 60e3, medium: 20 * 60e3, hard: 35 * 60e3 };
const DAY_MS = 86_400_000;

const store = await createStore();
const router = express.Router();

const uniform = Object.fromEntries(TOPICS.map((t) => [t, 1 / TOPICS.length]));
const weightsFor = (company) => CW.weights[company] || uniform;
const validUid = (uid) => typeof uid === "string" && /^[A-Za-z0-9_-]{6,64}$/.test(uid);

router.param("uid", (req, res, next, uid) => (validUid(uid) ? next() : res.status(400).json({ error: "invalid user id" })));

router.get("/companies", (_req, res) => {
  res.json({ source: CW.source, accessed: CW.accessed, companies: Object.keys(CW.weights).sort(), topics: TOPICS });
});

router.put("/profile/:uid", async (req, res) => {
  const b = req.body || {};
  const profile = {
    targetCompany: String(b.targetCompany || ""),
    targetRole: String(b.targetRole || "SDE-1"),
    experience: String(b.experience || "Fresher"),
    weeksTotal: Math.max(1, Math.min(52, Number(b.weeksTotal) || 12)),
    dailyHours: Math.max(0.5, Math.min(12, Number(b.dailyHours) || 2)),
    skills: Array.isArray(b.skills) ? b.skills.slice(0, 80).map(String) : [],
    createdAt: (await store.getProfile(req.params.uid))?.createdAt || Date.now(),
  };
  res.json(await store.setProfile(req.params.uid, profile));
});

// Baseline solve time: median time of correct solutions across users for this
// topic+difficulty once 20+ samples exist; before that, a difficulty default.
const solveTimes = new Map();
function baselineFor(topic, difficulty) {
  const pool = solveTimes.get(`${topic}:${difficulty}`) || [];
  if (pool.length >= 20) {
    const s = [...pool].sort((x, y) => x - y);
    return s[Math.floor(s.length / 2)];
  }
  return DEFAULT_BASELINE_MS[difficulty] || DEFAULT_BASELINE_MS.medium;
}
function recordSolveTime(a) {
  if (!a.correct || !a.timeMs) return;
  const k = `${a.topic}:${a.difficulty}`;
  solveTimes.set(k, [...(solveTimes.get(k) || []), a.timeMs].slice(-500));
}

router.post("/attempt/:uid", async (req, res) => {
  const b = req.body || {};
  if (!TOPICS.includes(b.topic)) return res.status(400).json({ error: `topic must be one of ${TOPICS.join(", ")}` });
  const difficulty = ["easy", "medium", "hard"].includes(b.difficulty) ? b.difficulty : "medium";
  const timeMs = Math.max(0, Number(b.timeMs) || 0);
  const testsTotal = Math.max(0, Number(b.testsTotal) || 0);
  const testsPassed = Math.max(0, Math.min(testsTotal, Number(b.testsPassed) || 0));
  const correct = typeof b.correct === "boolean" ? b.correct : testsTotal > 0 && testsPassed === testsTotal;
  const attempt = {
    topic: b.topic, difficulty, correct, timeMs, testsPassed, testsTotal,
    baselineMs: baselineFor(b.topic, difficulty),
    source: String(b.source || "practice"), at: Date.now(),
  };
  await store.addAttempt(req.params.uid, attempt);
  recordSolveTime(attempt);
  res.json({ saved: attempt, state: await computeState(req.params.uid) });
});

router.get("/state/:uid", async (req, res) => res.json(await computeState(req.params.uid)));

// Right to erasure: removes the profile and every stored attempt.
router.delete("/user/:uid", async (req, res) => {
  await store.deleteUser(req.params.uid);
  res.json({ deleted: true });
});

async function computeState(uid) {
  const profile = (await store.getProfile(uid)) || { targetCompany: "", weeksTotal: 12, dailyHours: 2, createdAt: Date.now() };
  const attempts = await store.getAttempts(uid);
  const now = Date.now();
  const topics = {};
  for (const t of TOPICS) {
    const at = attempts.filter((a) => a.topic === t);
    if (!at.length) { topics[t] = { ts: null, n: 0 }; continue; }
    const h = topicScore(at, { now, weights: PRESET.weights, alpha: PRESET.alpha });
    topics[t] = MODE === "bkt" ? { ...h, ts: bktMastery(at), heuristic: h.ts } : h;
  }
  const scores = Object.fromEntries(Object.entries(topics).map(([t, x]) => [t, x.ts ?? 0]));
  const cw = weightsFor(profile.targetCompany);
  const weeksUsed = Math.floor((now - (profile.createdAt || now)) / (7 * DAY_MS));
  const weeksLeft = Math.max(0, profile.weeksTotal - weeksUsed);
  const roadmap = buildRoadmap({
    topicScores: scores, companyWeights: cw, prereqs: PREREQS,
    weeksTotal: profile.weeksTotal, weeksLeft, dailyHours: profile.dailyHours,
  });
  return {
    mode: MODE, profile, topics,
    successProbability: +successProbability(scores, cw).toFixed(4),
    companyWeights: cw, weightsKnown: Boolean(CW.weights[profile.targetCompany]),
    roadmap, mastery: DEFAULTS.mastery, attempts: attempts.length,
    streak: practiceStreak(attempts, now),
    badges: badges(Object.fromEntries(Object.entries(topics).map(([t, x]) => [t, x.ts]))),
  };
}

export default router;
