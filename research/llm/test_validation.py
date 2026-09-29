"""How often do Gemini-generated test cases agree with Gemini's own reference solution?

Uses the exact problem-generation prompt from backend/info.js, calls the Gemini API,
runs each reference solution on each generated test in a local subprocess (5 s timeout),
and compares outputs with the same normalisation the platform uses.
Run in an isolated container: reference code is executed locally.

  GEMINI_API_KEY=... GEMINI_MODEL=gemini-3.8-flash python test_validation.py --runs 3
"""
import argparse, json, os, re, subprocess, sys, tempfile, time, urllib.request, pathlib

INFO = pathlib.Path(__file__).resolve().parents[2] / "backend" / "info.js"

def load_prompt_parts():
    src = INFO.read_text()
    guides = dict(re.findall(r"'([a-z-]+)':\s*'((?:[^'\\]|\\.)*)'", src[src.index("TOPIC_GUIDES"):src.index("};", src.index("TOPIC_GUIDES"))]))
    route = src[src.index('app.post("/api/generate"'):]
    tpl = route[route.index("const prompt = `") + len("const prompt = `"):]
    tpl = tpl[:tpl.index("`;")]
    return guides, tpl

def fill(tpl, role, topic, guide):
    return (tpl.replace("${topics.toUpperCase()}", topic.upper()).replace("${role}", role)
               .replace("${topicGuide}", guide.replace("\\'", "'")))

def gemini(prompt, key, model):
    body = json.dumps({"contents": [{"role": "user", "parts": [{"text": prompt}]}],
                       "generationConfig": {"temperature": 1.0, "topP": 0.95, "topK": 40}}).encode()
    req = urllib.request.Request(f"https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent",
                                 body, {"Content-Type": "application/json", "x-goog-api-key": key})
    for attempt in range(3):
        try:
            with urllib.request.urlopen(req, timeout=180) as r:
                j = json.load(r)
            return j["candidates"][0]["content"]["parts"][0]["text"], j.get("modelVersion")
        except Exception as e:
            err = e; time.sleep(5)
    raise err

norm = lambda s: "\n".join(re.sub(r"\s+", " ", l.strip()) for l in str(s).replace("\r", "").strip().split("\n"))

def run_py(code, stdin):
    with tempfile.NamedTemporaryFile("w", suffix=".py", delete=False) as f:
        f.write(code); path = f.name
    try:
        p = subprocess.run([sys.executable, path], input=stdin, capture_output=True, text=True, timeout=5)
        return p.stdout, p.returncode
    except subprocess.TimeoutExpired:
        return "", "timeout"
    finally:
        os.unlink(path)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument("--runs", type=int, default=3); ap.add_argument("--out", default="test_validation_results.json")
    a = ap.parse_args(); key = os.environ["GEMINI_API_KEY"]; model = os.environ.get("GEMINI_MODEL", "gemini-flash-latest")
    guides, tpl = load_prompt_parts(); rows = []
    for topic, guide in guides.items():
        for run in range(a.runs):
            try:
                text, mv = gemini(fill(tpl, "software engineer", topic, guide), key, model)
                data = json.loads(re.search(r"\{[\s\S]*\}", text).group(0))
            except Exception as e:
                rows.append({"topic": topic, "run": run, "error": str(e)[:200]}); continue
            for q in data.get("questions", []):
                tests = q.get("tests") or []; ok = 0; crashes = 0
                for t in tests:
                    out, rc = run_py(q.get("reference", ""), str(t.get("stdin", "")))
                    if rc != 0: crashes += 1
                    ok += norm(out) == norm(t.get("expected", ""))
                rows.append({"topic": topic, "run": run, "model": mv, "difficulty": q.get("difficulty"),
                             "tests": len(tests), "passed": ok, "ref_errors": crashes})
            print(topic, run, [(r["passed"], r["tests"]) for r in rows[-2:] if "tests" in r], flush=True)
    json.dump(rows, open(a.out, "w"), indent=1)
    q = [r for r in rows if "tests" in r]; T = sum(r["tests"] for r in q); P = sum(r["passed"] for r in q)
    print(f"problems {len(q)}, tests {T}, agree {P} ({P/T:.1%}), problems with >=2 valid tests {sum(r['passed']>=2 for r in q)}/{len(q)}, "
          f"all tests valid {sum(r['passed']==r['tests'] and r['tests']>0 for r in q)}/{len(q)}, errors {len(rows)-len(q)}")

if __name__ == "__main__":
    main()
