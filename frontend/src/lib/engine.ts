// Client for the Skill Scoring Engine (backend/engine, mounted at /api/engine on the interview API).
export const ENGINE_URL = import.meta.env.VITE_ENGINE_URL || "http://localhost:8080";

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

export const engine = {
  companies: () => call<{ companies: string[]; topics: string[]; source: string; accessed: string }>("/companies"),
  state: () => call<EngineState>(`/state/${userId()}`),
  saveProfile: (p: Partial<EngineState["profile"]>) => call(`/profile/${userId()}`, { method: "PUT", body: JSON.stringify(p) }),
  logAttempt: (a: { topic: string; difficulty?: string; testsPassed: number; testsTotal: number; timeMs: number; source?: string }) =>
    call<{ state: EngineState }>(`/attempt/${userId()}`, { method: "POST", body: JSON.stringify(a) }),
  deleteMe: () => call(`/user/${userId()}`, { method: "DELETE" }),
};
