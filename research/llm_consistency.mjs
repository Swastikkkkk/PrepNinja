// Output-consistency test for the Gemini-based ATS analyser.
// Sends the SAME resume to /api/analyze-resume N times and reports the spread of scores.
// Usage (backend running with GEMINI_API_KEY set):
//   node research/llm_consistency.mjs path/to/resume1.pdf path/to/resume2.pdf --runs 10
import fs from "fs";
import path from "path";

const args = process.argv.slice(2);
const runs = Number(args[args.indexOf("--runs") + 1]) || 10;
const files = args.filter((a, i) => !a.startsWith("--") && args[i - 1] !== "--runs");
const API = process.env.API || "http://localhost:8080/api/analyze-resume";
if (!files.length) { console.error("give at least one resume file"); process.exit(1); }

const stats = (xs) => {
  const m = xs.reduce((s, x) => s + x, 0) / xs.length;
  const sd = Math.sqrt(xs.reduce((s, x) => s + (x - m) ** 2, 0) / Math.max(1, xs.length - 1));
  return { n: xs.length, mean: +m.toFixed(2), sd: +sd.toFixed(2), min: Math.min(...xs), max: Math.max(...xs) };
};

const rows = [];
for (const f of files) {
  const scores = [];
  for (let i = 0; i < runs; i++) {
    const fd = new FormData();
    fd.append("file", new Blob([fs.readFileSync(f)]), path.basename(f));
    const r = await fetch(API, { method: "POST", body: fd });
    const j = await r.json().catch(() => ({}));
    const s = Number(j.score ?? j.analysis?.score ?? j.atsScore);
    if (Number.isFinite(s)) scores.push(s); else console.warn("no score:", JSON.stringify(j).slice(0, 200));
  }
  const s = stats(scores);
  rows.push({ file: path.basename(f), ...s });
  console.log(path.basename(f), s);
}
fs.writeFileSync("llm_consistency_results.json", JSON.stringify({ runs, api: API, at: new Date().toISOString(), rows }, null, 2));
console.log("saved llm_consistency_results.json");
