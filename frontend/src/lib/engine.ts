// Client for the Skill Scoring Engine (backend/engine, mounted at /api/engine on the interview API).
import { API_BASE } from "./config";
export const ENGINE_URL = API_BASE;

export function userId(): string {
  const k = "prepninja.uid";
  try {
    let id = localStorage.getItem(k);
    if (!id) {
      id = crypto.randomUUID().replace(/-/g, "");
      localStorage.setItem(k, id);
    }
    return id;
  } catch {
    return "anonymous_session";
  }
}

export type TopicState = { ts: number | null; a?: number; v?: number; r?: number; n: number; daysSince?: number };
export type RoadmapItem = { topic: string; hours: number; priority: number; ts: number };
export type EngineState = {
  mode: string;
  profile: { targetCompany: string; targetRole: string; experience: string; weeksTotal: number; dailyHours: number };
  topics: Record<string, TopicState>;
  successProbability: number;
  companyWeights: Record<string, number>;
  weightsKnown: boolean;
  roadmap: { ordered: RoadmapItem[]; weeks: { week: number; hours: number; items: RoadmapItem[] }[]; deadlinePressure: number };
  mastery: number;
  attempts: number;
  streak: { current: number; best: number };
  badges: { id: string; topic: string }[];
};

async function call<T>(path: string, init?: RequestInit): Promise<T> {
  const r = await fetch(`${ENGINE_URL}/api/engine${path}`, { headers: { "Content-Type": "application/json" }, ...init });
  if (!r.ok) throw new Error(`${r.status} ${await r.text()}`);
  return r.json();
}

// Local copy of this user's profile and attempts, sent with each call so results
// survive serverless restarts.
const SNAP = "prepninja.engine";
type Snap = { profile?: Record<string, unknown>; attempts: Record<string, unknown>[] };
const readSnap = (): Snap => {
  try { return JSON.parse(localStorage.getItem(SNAP) || "") as Snap; } catch { return { attempts: [] }; }
};
const writeSnap = (s: Snap) => {
  try { localStorage.setItem(SNAP, JSON.stringify({ ...s, attempts: s.attempts.slice(-500) })); } catch { /* storage off */ }
};

export const engine = {
  companies: () => call<{ companies: string[]; topics: string[]; source: string; accessed: string }>("/companies"),
  state: () => call<EngineState>(`/state/${userId()}`, { method: "POST", body: JSON.stringify({ snapshot: readSnap() }) }),
  saveProfile: async (p: Partial<EngineState["profile"]>) => {
    const snap = readSnap();
    const saved = await call<Record<string, unknown>>(`/profile/${userId()}`, { method: "PUT", body: JSON.stringify({ ...p, snapshot: snap }) });
    writeSnap({ ...snap, profile: saved });
    return saved;
  },
  logAttempt: async (a: { topic: string; difficulty?: string; testsPassed: number; testsTotal: number; timeMs: number; source?: string }) => {
    const snap = readSnap();
    const out = await call<{ saved: Record<string, unknown>; state: EngineState }>(`/attempt/${userId()}`, { method: "POST", body: JSON.stringify({ ...a, snapshot: snap }) });
    writeSnap({ ...snap, attempts: [...(snap.attempts || []), out.saved] });
    return out;
  },
  deleteMe: async () => {
    try { localStorage.removeItem(SNAP); } catch { /* noop */ }
    return call(`/user/${userId()}`, { method: "DELETE" });
  },
};
