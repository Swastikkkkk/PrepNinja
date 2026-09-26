import test from "node:test";
import assert from "node:assert/strict";
import { topicScore, bktMastery, successProbability, deadlinePressure, priority, buildRoadmap } from "./scoring.mjs";
import { PREREQS, TOPICS } from "./prerequisites.mjs";

const DAY = 86_400_000;
const now = Date.UTC(2026, 0, 31);
const att = (correct, timeMs, daysAgo, baselineMs = 600_000) => ({ correct, timeMs, baselineMs, at: now - daysAgo * DAY });

test("Eq. 1 matches hand calculation", () => {
  // 3/4 correct, avg rel time = (1+2+1+1)/4 = 1.25 -> v = 0.8, last attempt 2 days ago -> r = 0.95^2
  const r = topicScore([att(true, 600e3, 5), att(false, 1200e3, 4), att(true, 600e3, 3), att(true, 600e3, 2)], { now, weights: { a: 0.5, v: 0.3, r: 0.2 }, alpha: 0.95 });
  const expected = 0.5 * 0.75 + 0.3 * 0.8 + 0.2 * 0.95 ** 2;
  assert.ok(Math.abs(r.ts - expected) < 1e-9);
  assert.equal(r.a, 0.75);
});

test("Eq. 1 speed is capped at 1 and score stays in [0,1]", () => {
  const r = topicScore([att(true, 60e3, 0)], { now });
  assert.equal(r.v, 1);
  assert.equal(r.ts, 1);
  assert.equal(topicScore([], { now }), null);
});

test("recency decays score over time", () => {
  const fresh = topicScore([att(true, 600e3, 0)], { now }).ts;
  const stale = topicScore([att(true, 600e3, 30)], { now }).ts;
  assert.ok(stale < fresh);
});

test("BKT mastery rises with correct answers and falls with errors", () => {
  const up = bktMastery([att(true, 1, 3), att(true, 1, 2), att(true, 1, 1)]);
  const down = bktMastery([att(false, 1, 3), att(false, 1, 2), att(false, 1, 1)]);
  assert.ok(up > 0.9 && down < 0.2);
});

test("Eq. 2 is a weighted mean and ignores unknown weights", () => {
  assert.equal(successProbability({ a: 1, b: 0 }, { a: 3, b: 1 }), 0.75);
  assert.equal(successProbability({}, { a: 1 }), 0);
});

test("Eq. 3 urgency only matters as the deadline approaches", () => {
  assert.equal(deadlinePressure(10, 10), 0);
  assert.equal(deadlinePressure(10, 0), 1);
  assert.ok(priority(0.2, 1, 1, 1) > priority(0.2, 1, 1, 0));
});

test("roadmap respects prerequisites and weekly capacity", () => {
  const cw = Object.fromEntries(TOPICS.map((t) => [t, t === "graphs" ? 0.5 : 0.05]));
  const r = buildRoadmap({ topicScores: {}, companyWeights: cw, prereqs: PREREQS, weeksTotal: 8, weeksLeft: 8, dailyHours: 1 });
  const order = r.ordered.map((x) => x.topic);
  assert.ok(order.indexOf("trees") < order.indexOf("graphs"), "trees before graphs");
  assert.ok(order.indexOf("arrays") < order.indexOf("trees"), "arrays before trees");
  for (const w of r.weeks) assert.ok(w.items.reduce((s, x) => s + x.hours, 0) <= 7 + 1e-6);
});

test("mastered topics drop out of the roadmap", () => {
  const cw = { arrays: 0.5, strings: 0.5 };
  const r = buildRoadmap({ topicScores: { arrays: 0.9 }, companyWeights: cw, prereqs: PREREQS, weeksTotal: 4, weeksLeft: 4, dailyHours: 2 });
  assert.deepEqual(r.ordered.map((x) => x.topic), ["strings"]);
});
