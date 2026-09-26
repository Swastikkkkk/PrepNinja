# PrepNinja

**AI-powered mock interview & job-prep platform**

PrepNinja helps candidates prepare for both non-technical and technical interviews in one place: proctored AI mock interviews with video answers and automated scoring, a DSA/coding practice round with an in-browser code runner, and an ATS resume analyzer — all backed by Google Gemini.

## Features

### 🎤 Non-technical (behavioral) mock interviews
- Gemini generates two role-specific interview questions from a free-text role/prompt.
- Candidate records video answers via webcam (`MediaRecorder`), uploaded and stored on Cloudinary.
- Answers are transcribed with Deepgram and scored by Gemini across **fluency, correctness, grammar, stammering, and content** (0–10 each, 50 total), with a rule-based fallback if AI scoring is unavailable.
- **Proctoring**: enforces fullscreen mode and flags tab switches / fullscreen exits as suspicious events.

### 💻 Technical interview / coding practice
- Gemini generates topic-specific coding problems (arrays, linked lists, trees, graphs, dynamic programming, etc.).
- Monaco code editor. Code runs on [Judge0](https://judge0.com) when `JUDGE0_URL` is set, with the public [Piston](https://github.com/engineer-man/piston) API as fallback.
- Each generated problem ships with test cases that are kept only if Gemini's own reference solution passes them in the sandbox.
- Text-to-speech narration of questions via Murf AI.
- Same webcam/fullscreen/tab-switch proctoring as the behavioral round.

### 📄 ATS Resume Analyzer
- Upload a PDF/DOC/DOCX resume.
- Gemini returns an ATS score (0–100), strengths, weaknesses, and specific, actionable improvement tips.

### 📈 Skill Scoring Engine and adaptive roadmap
- Every coding attempt updates a per-topic Topic Score from accuracy, solve speed and recency (Eq. 1).
- Topic scores roll up into a company-weighted readiness index (Eq. 2). Company topic weights are built from public company-tagged interview problems for 52 companies (`research/company_weights`).
- A roadmap orders non-mastered topics by priority (Eq. 3) under a prerequisite graph and packs them into weekly study blocks sized to the user's daily hours.
- Scoring modes: `tuned` (default, weights chosen by the offline benchmark), `paper` (original hand-set weights) or `bkt` (Bayesian Knowledge Tracing).
- Dashboard at `/dashboard`; data can be deleted from the dashboard (`DELETE /api/engine/user/:uid`).

### 🔬 Research artefacts (`research/`)
- `benchmark/`: offline comparison of Eq. 1 with PFA, BKT and DKT on ASSISTments 2017 (5-fold, learner-level split).
- `company_weights/`: script that builds W(t, c) from company-tagged problem lists.
- `llm_consistency.mjs`: repeats identical resumes through the ATS analyser to measure score variance.

### 🛠️ Admin
- A basic admin view to list recorded interview attempts and their scores/transcripts.

## Architecture

PrepNinja is a monorepo with **one frontend** and **two backend services**:

```
PrepNinja/
├── frontend/                  # React + TypeScript + Vite app
│   └── src/
│       ├── HomePage.tsx           # landing page ("/")
│       ├── InterviewFlow.tsx      # non-technical interview flow  ("/interview-flow")
│       ├── Interview.tsx          # technical/coding interview + code runner + TTS ("/interview")
│       ├── InterviewSet.tsx       # coding problem set / practice ("/interview-set")
│       ├── ATSChecker.tsx         # resume ATS analyzer ("/ats-checker")
│       ├── InterviewSetup.tsx     # admin attempts view ("/admin")
│       └── components/ui/         # shadcn/radix-based UI components
└── backend/
    ├── server.js               # main API (port 8080): questions, uploads, scoring, resume ATS
    ├── resume-check.js         # /api/analyze-resume router (mounted into server.js)
    └── info.js                 # coding API (port 5000): problem generation, code execution
```

| Service | File | Default port | Responsibilities |
|---|---|---|---|
| Frontend | `frontend/` | 5173 (Vite dev) | UI, routing, webcam recording, proctoring, direct calls to Murf TTS |
| Interview API | `backend/server.js` | 8080 | `/api/generate-questions`, `/api/upload-answer` (Cloudinary), `/api/flag-suspicious`, `/api/admin/attempts`, `/api/analyze-resume` (via `resume-check.js`) |
| Code API | `backend/info.js` | 5000 | `/api/generate` (topic-based coding problems), `/api/evaluate`, `/api/compile` (Piston-based code execution), `/api/health` |

> The two backend files are run as **separate Node processes** — you'll need both running alongside the frontend during local development.

## Tech stack

**Frontend:** React 19, TypeScript, Vite 7, React Router, Tailwind CSS 4, shadcn/ui + Radix primitives, Monaco Editor, Framer Motion, Lucide icons

**Backends:** Node.js, Express, Multer (file uploads), Cloudinary (video storage), Google Generative AI SDK (Gemini), Deepgram API (speech-to-text), Murf AI (text-to-speech), Judge0 / Piston (sandboxed code execution), optional Cloud Firestore (firebase-admin), nanoid, fs-extra

## Getting started

### Prerequisites
- Node.js (LTS) and npm
- API keys for:
  1. **[Cloudinary](https://cloudinary.com)** — video/audio storage
  2. **[Gemini AI](https://makersuite.google.com/app/apikey)** — question generation, scoring, resume analysis
  3. **[Deepgram](https://deepgram.com)** — speech-to-text transcription
  4. **[Murf AI](https://murf.ai)** — text-to-speech
  5. *(Optional)* **[JDoodle](https://www.jdoodle.com/compiler-api)** — alternate code compilation

### 1. Backend — Interview API (`backend/`)

```bash
cd backend
npm install
cp .env.example .env
```

Fill in `backend/.env`:
```env
CLOUDINARY_CLOUD_NAME=your_cloud_name_here
CLOUDINARY_API_KEY=your_api_key_here
CLOUDINARY_API_SECRET=your_api_secret_here
GEMINI_API_KEY=your_gemini_api_key_here
DEEPGRAM_API_KEY=your_deepgram_api_key_here
PORT=8080
# optional, see backend/.env.example
JUDGE0_URL=
SCORING_MODE=tuned
FIREBASE_SERVICE_ACCOUNT=
```

Run it (and the engine's unit tests):
```bash
node server.js
npm test
```

### 2. Backend — Code API (`backend/info.js`)

This is a second, separate Express server (still inside `backend/`) that powers the technical/coding round. It uses the same `GEMINI_API_KEY` from your `.env`. Code runs on Judge0 if `JUDGE0_URL` is set (self-host with the [Judge0 CE docker-compose](https://github.com/judge0/judge0/blob/master/CHANGELOG.md#deployment-procedure)), otherwise on the public Piston API.

```bash
# from the backend/ folder, with the same .env in place
node info.js
```
It listens on port `5000` by default (`PORT` env var can override).

### 3. Frontend (`frontend/`)

```bash
cd frontend
npm install
cp ../.env.example .env   # or create frontend/.env directly
```

Fill in `frontend/.env`:
```env
VITE_GEMINI_API_KEY=your_gemini_api_key_here
VITE_MURF_API_KEY=your_murf_api_key_here
VITE_JDOODLE_CLIENT_ID=your_jdoodle_client_id      # optional
VITE_JDOODLE_CLIENT_SECRET=your_jdoodle_secret     # optional
```

Run it:
```bash
npm run dev
```

By default the frontend expects:
- the Interview API at `http://localhost:8080`
- the Code API at `http://localhost:5000`

(these are set as constants inside `App.tsx` / `Interview.tsx` — update them there if you deploy the backends elsewhere).

### Running everything together
You'll need **three terminals**: `node server.js`, `node info.js`, and `npm run dev` (frontend), all with their respective `.env` files in place.

## Security notes

- Never commit `.env` files — they're already covered by `.gitignore`.
- Uploaded resumes/files are deleted from local disk after processing; interview videos are stored on Cloudinary.
- Keep your API keys private; rotate them if ever exposed.

## License

No license has been specified yet. Add a `LICENSE` file if you'd like to open-source this project.
