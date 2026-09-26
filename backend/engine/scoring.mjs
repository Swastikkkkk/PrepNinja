// Skill Scoring Engine: Topic Score (Eq. 1), Success Probability (Eq. 2),
// roadmap priority (Eq. 3) and weekly roadmap scheduling.
// Pure functions only, so the engine can be unit-tested and reused offline.

// Eq. 1 weight presets.
//   paper: the original hand-set weights (v1 of the platform, used in the user study).
//   tuned: best setting from the offline benchmark (research/benchmark), where
//          speed added no predictive value and recency helped slightly.
export const PRESETS = Object.freeze({
  paper: { weights: { a: 0.5, v: 0.3, r: 0.2 }, alpha: 0.95 },
  tuned: { weights: { a: 0.9, v: 0.0, r: 0.1 }, alpha: 0.99 },
});

export const DEFAULTS = Object.freeze({
  weights: PRESETS.paper.weights,
  alpha: PRESETS.paper.alpha,
  mastery: 0.8,                             // TS >= mastery removes topic from active priority
  priority: { gap: 0.5, freq: 0.3, urg: 0.2 }, // Eq. 3
  prereqReady: 0.6,                         // prerequisite considered "ready" at this TS
  baseHoursPerTopic: 6,                     // study hours for a topic starting from TS = 0
  minHoursPerBlock: 1,
});

const DAY_MS = 86_400_000;
const clamp01 = (x) => Math.min(1, Math.max(0, x));

/**
 * Eq. 1: TS(t) = Wa·a(t) + Wv·v(t) + Wr·r(t)
 * attempts: [{ correct: boolean, timeMs: number, baselineMs: number, at: epoch ms }]
 * Returns null when the topic has never been attempted.
 */
export function topicScore(attempts, { now = Date.now(), weights = DEFAULTS.weights, alpha = DEFAULTS.alpha, window = 20 } = {}) {
  if (!attempts?.length) return null;
  const recent = [...attempts].sort((x, y) => x.at - y.at).slice(-window);
  const a = recent.filter((x) => x.correct).length / recent.length;                  // Eq. 1a
  const timed = recent.filter((x) => x.timeMs > 0 && x.baselineMs > 0);
  const avgRel = timed.length ? timed.reduce((s, x) => s + x.timeMs / x.baselineMs, 0) / timed.length : 1;
  const v = Math.min(1 / avgRel, 1);                                                 // Eq. 1b
  const last = recent[recent.length - 1].at;
  const dt = Math.max(0, (now - last) / DAY_MS);
  const r = Math.pow(alpha, dt);                                                     // Eq. 1c
  const ts = weights.a * a + weights.v * v + weights.r * r;
  return { ts: clamp01(ts), a, v, r, n: recent.length, daysSince: dt };
}

/**
 * Optional learned alternative to Eq. 1: Performance Factors Analysis extended with
 * the speed and recency features of Eq. 1 ("PFA-SR"). Coefficients come from
 * research/benchmark (fit on logged attempts); see model/pfa_sr.json.
 */
export function pfaScore(attempts, model, topic, { now = Date.now(), alpha = DEFAULTS.alpha } = {}) {
  const succ = attempts.filter((x) => x.correct).length;
  const fail = attempts.length - succ;
  const f = attempts.length ? topicScore(attempts, { now, alpha }) : { v: 1, r: 1 };
  const t = model.topics?.[topic] ?? model.default;
  const z = t.b + t.succ * Math.log1p(succ) + t.fail * Math.log1p(fail) + model.v * f.v + model.r * f.r;
  return 1 / (1 + Math.exp(-z));
}

/**
 * Standard Bayesian Knowledge Tracing posterior update (Corbett & Anderson, 1995).
 * params: { pL0, pT, pS, pG }. Returns P(mastered) after the observed sequence.
 */
export function bktMastery(attempts, { pL0 = 0.3, pT = 0.1, pS = 0.1, pG = 0.2 } = {}) {
  let pL = pL0;
  for (const x of [...attempts].sort((p, q) => p.at - q.at)) {
    const post = x.correct
      ? (pL * (1 - pS)) / (pL * (1 - pS) + (1 - pL) * pG)
      : (pL * pS) / (pL * pS + (1 - pL) * (1 - pG));
    pL = post + (1 - post) * pT;
  }
  return pL;
}

/** Eq. 2: P_succ = Σ TS(t_i)·W(t_i,c) / Σ W(t_i,c). Untried topics count as 0. */
export function successProbability(topicScores, companyWeights) {
  let num = 0, den = 0;
  for (const [t, w] of Object.entries(companyWeights)) {
    num += (topicScores[t] ?? 0) * w;
    den += w;
  }
  return den > 0 ? num / den : 0;
}

/** Deadline pressure u in [0,1]: grows quadratically as the preparation window is used up. */
export function deadlinePressure(weeksTotal, weeksLeft) {
  if (!weeksTotal || weeksTotal <= 0) return 0;
  const used = clamp01(1 - weeksLeft / weeksTotal);
  return used * used;
}

/**
 * Eq. 3: Priority(t) = (1−TS)·Wgap + Freq(t,c)·Wfreq + Urgency(t,TL)·Wurg,
 * with Urgency(t,TL) = (1−TS)·u(TL), so weak topics are pushed harder near the deadline.
 * Freq is normalised to [0,1] by the company's most frequent topic.
 */
export function priority(ts, freq, maxFreq, u, w = DEFAULTS.priority) {
  const gap = 1 - (ts ?? 0);
  const f = maxFreq > 0 ? freq / maxFreq : 0;
  return gap * w.gap + f * w.freq + gap * u * w.urg;
}

/**
 * Build the roadmap: rank non-mastered topics by Eq. 3, respect prerequisites
 * (a topic is scheduled only after its prerequisites are ready or already scheduled),
 * then greedily pack study blocks into weeks of capacity dailyHours × 7.
 */
export function buildRoadmap({ topicScores, companyWeights, prereqs, weeksTotal, weeksLeft, dailyHours, cfg = DEFAULTS }) {
  const u = deadlinePressure(weeksTotal, weeksLeft);
  const maxFreq = Math.max(...Object.values(companyWeights), 0);
  const topics = Object.keys(companyWeights);
  const scored = topics
    .map((t) => ({
      topic: t,
      ts: topicScores[t] ?? 0,
      priority: priority(topicScores[t] ?? 0, companyWeights[t], maxFreq, u, cfg.priority),
    }))
    .filter((x) => x.ts < cfg.mastery);

  // prerequisite-constrained ordering (Kahn-style, highest priority first among available)
  const ordered = [];
  const placed = new Set(topics.filter((t) => (topicScores[t] ?? 0) >= cfg.mastery));
  const ready = (t) => (prereqs[t] || []).every((p) => placed.has(p) || (topicScores[p] ?? 0) >= cfg.prereqReady || !topics.includes(p));
  const pending = [...scored];
  while (pending.length) {
    pending.sort((x, y) => y.priority - x.priority);
    let i = pending.findIndex((x) => ready(x.topic));
    if (i < 0) i = 0; // cycle guard: fall back to highest priority
    const [next] = pending.splice(i, 1);
    ordered.push(next);
    placed.add(next.topic);
  }

  // greedy bin-packing into weeks
  const capacity = Math.max(1, dailyHours) * 7;
  const weeks = [];
  let cur = { week: 1, hours: 0, items: [] };
  for (const x of ordered) {
    let need = Math.max(cfg.minHoursPerBlock, Math.round(cfg.baseHoursPerTopic * (1 - x.ts) * 10) / 10);
    while (need > 0) {
      const room = capacity - cur.hours;
      if (room <= 0.01) {
        weeks.push(cur);
        cur = { week: cur.week + 1, hours: 0, items: [] };
        continue;
      }
      const take = Math.min(room, need);
      cur.items.push({ topic: x.topic, hours: Math.round(take * 10) / 10, priority: +x.priority.toFixed(3), ts: +x.ts.toFixed(3) });
      cur.hours += take;
      need -= take;
    }
  }
  if (cur.items.length) weeks.push(cur);
  return { ordered: ordered.map((x) => ({ ...x, priority: +x.priority.toFixed(3) })), weeks, deadlinePressure: +u.toFixed(3) };
}
