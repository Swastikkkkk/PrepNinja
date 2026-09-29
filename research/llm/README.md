# LLM reliability checks (paper Section 6.3)

Run with gemini-3.8-flash via the Gemini API, September 2026.

- `test_validation.py`: 12 topics x 3 generations with the platform's own prompt; each reference
  solution is run on its tests. Result: 72 problems, 288 tests, 95.5% agreement; 8 problems had at least one
  disagreeing test; 71 of 72 kept at least two valid tests. Raw rows: `test_validation_results.json`.
- `ats_consistency.mjs`: five fictional resumes (`resumes/`, convert to PDF first), 10 identical runs
  each, plus three role wordings x 5 runs for two resumes. Mean within-resume SD 2.2/100,
  ICC(1,1) 0.991, role rewording moved means by at most 1.6. Raw rows: `ats_results.json`.

All resumes are fictional and contain no real personal data.
