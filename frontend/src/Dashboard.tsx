import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, Award, CalendarRange, Flame, Code2, Gauge, Loader2, RefreshCw, Target, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { engine, type EngineState } from "@/lib/engine";

const label = (t: string) => t.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());

function ReadinessDial({ value }: { value: number }) {
  const r = 64, c = 2 * Math.PI * r;
  const pct = Math.round(value * 100);
  return (
    <div className="relative w-44 h-44">
      <svg viewBox="0 0 160 160" className="w-full h-full -rotate-90">
        <circle cx="80" cy="80" r={r} strokeWidth="12" className="fill-none stroke-muted" />
        <motion.circle
          cx="80" cy="80" r={r} strokeWidth="12" strokeLinecap="round"
          className="fill-none stroke-primary"
          strokeDasharray={c}
          initial={{ strokeDashoffset: c }}
          animate={{ strokeDashoffset: c * (1 - value) }}
          transition={{ duration: 1, ease: "easeOut" }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-4xl font-semibold tabular-nums">{pct}%</span>
        <span className="text-xs text-muted-foreground">readiness index</span>
      </div>
    </div>
  );
}

function TopicRow({ topic, ts, n, weight, mastery }: { topic: string; ts: number | null; n: number; weight: number; mastery: number }) {
  const v = ts ?? 0;
  const tone = ts === null ? "bg-muted-foreground/30" : v >= mastery ? "bg-emerald-500" : v >= 0.5 ? "bg-amber-500" : "bg-rose-500";
  return (
    <div className="grid grid-cols-[140px_1fr_64px] items-center gap-3 py-1.5">
      <div className="text-sm truncate">{label(topic)}</div>
      <div className="h-2 rounded-full bg-muted overflow-hidden">
        <motion.div className={`h-full ${tone}`} initial={{ width: 0 }} animate={{ width: `${v * 100}%` }} transition={{ duration: 0.6 }} />
      </div>
      <div className="text-xs text-right tabular-nums text-muted-foreground">
        {ts === null ? "not tried" : `${(v * 100).toFixed(0)} · n${n}`}
        <div className="text-[10px]">w {(weight * 100).toFixed(1)}%</div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [state, setState] = useState<EngineState | null>(null);
  const [companies, setCompanies] = useState<string[]>([]);
  const [source, setSource] = useState<{ url: string; accessed: string } | null>(null);
  const [form, setForm] = useState({ targetCompany: "", targetRole: "SDE-1", weeksTotal: 12, dailyHours: 2 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    try {
      const [s, c] = await Promise.all([engine.state(), engine.companies()]);
      setState(s);
      setCompanies(c.companies);
      setSource({ url: c.source, accessed: c.accessed });
      setForm({
        targetCompany: s.profile.targetCompany || "",
        targetRole: s.profile.targetRole || "SDE-1",
        weeksTotal: s.profile.weeksTotal || 12,
        dailyHours: s.profile.dailyHours || 2,
      });
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => { refresh(); }, []);

  async function save() {
    await engine.saveProfile(form);
    await refresh();
  }

  async function erase() {
    if (!window.confirm("Delete your profile and every recorded attempt?")) return;
    await engine.deleteMe();
    await refresh();
  }

  const topics = useMemo(
    () => (state ? Object.entries(state.topics).sort((a, b) => (state.companyWeights[b[0]] ?? 0) - (state.companyWeights[a[0]] ?? 0)) : []),
    [state],
  );

  return (
    <div className="min-h-screen bg-background text-foreground px-6 py-8">
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3">
            <Link to="/"><Button variant="ghost" size="icon" aria-label="Back"><ArrowLeft className="w-4 h-4" /></Button></Link>
            <div>
              <h1 className="text-2xl font-semibold">Preparation dashboard</h1>
              <p className="text-sm text-muted-foreground">Scores update after every coding attempt.</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={loading}>
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <RefreshCw className="w-4 h-4" />} Refresh
            </Button>
            <Link to="/interview-set"><Button><Code2 className="w-4 h-4" /> Practise</Button></Link>
          </div>
        </div>

        {error && (
          <Card><CardContent className="text-sm text-destructive">Could not reach the scoring engine: {error}</CardContent></Card>
        )}

        {state && (
          <>
            <div className="grid gap-6 md:grid-cols-3">
              <Card className="md:col-span-1 items-center">
                <CardHeader className="w-full">
                  <CardTitle className="flex items-center gap-2"><Gauge className="w-4 h-4" /> Success probability</CardTitle>
                  <CardDescription>
                    Company-weighted mean of topic scores (Eq. 2). A readiness indicator, not a hiring prediction.
                  </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center gap-3">
                  <ReadinessDial value={state.successProbability} />
                  <div className="flex gap-2 flex-wrap justify-center">
                    <Badge variant="secondary">{state.attempts} attempts</Badge>
                    <Badge variant="secondary">mode: {state.mode}</Badge>
                    <Badge variant="secondary"><Flame className="w-3 h-3" /> {state.streak.current} day streak (best {state.streak.best})</Badge>
                    {!state.weightsKnown && <Badge variant="outline">uniform weights</Badge>}
                  </div>
                </CardContent>
              </Card>

              <Card className="md:col-span-2">
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><Target className="w-4 h-4" /> Target</CardTitle>
                  <CardDescription>
                    Topic weights come from company-tagged interview problems
                    {source && <> (<a className="underline" href={source.url} target="_blank" rel="noreferrer">source</a>, accessed {source.accessed})</>}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2">
                  <label className="text-sm space-y-1">
                    <span className="text-muted-foreground">Company</span>
                    <select
                      className="w-full h-10 rounded-md border bg-background px-3 text-sm"
                      value={form.targetCompany}
                      onChange={(e) => setForm({ ...form, targetCompany: e.target.value })}
                    >
                      <option value="">Any company</option>
                      {companies.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="text-muted-foreground">Role</span>
                    <input className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.targetRole}
                      onChange={(e) => setForm({ ...form, targetRole: e.target.value })} />
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="text-muted-foreground">Preparation window (weeks)</span>
                    <input type="number" min={1} max={52} className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.weeksTotal}
                      onChange={(e) => setForm({ ...form, weeksTotal: Number(e.target.value) })} />
                  </label>
                  <label className="text-sm space-y-1">
                    <span className="text-muted-foreground">Study hours per day</span>
                    <input type="number" min={0.5} max={12} step={0.5} className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={form.dailyHours}
                      onChange={(e) => setForm({ ...form, dailyHours: Number(e.target.value) })} />
                  </label>
                  <div className="sm:col-span-2 flex justify-between items-center">
                    <Button variant="ghost" className="text-destructive" onClick={erase}><Trash2 className="w-4 h-4" /> Delete my data</Button>
                    <Button onClick={save}>Save and rebuild roadmap</Button>
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>Topic scores</CardTitle>
                  <CardDescription>
                    TS(t) from accuracy, speed and recency (Eq. 1). Mastery at {Math.round(state.mastery * 100)}. Sorted by company weight.
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {state.badges.length > 0 && (
                    <div className="flex flex-wrap gap-2 mb-3">
                      {state.badges.map((b) => (
                        <Badge key={b.id} className="gap-1"><Award className="w-3 h-3" /> {label(b.topic)} mastery</Badge>
                      ))}
                    </div>
                  )}
                  {topics.map(([t, x]) => (
                    <TopicRow key={t} topic={t} ts={x.ts} n={x.n} weight={state.companyWeights[t] ?? 0} mastery={state.mastery} />
                  ))}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2"><CalendarRange className="w-4 h-4" /> Roadmap</CardTitle>
                  <CardDescription>
                    Ordered by priority (Eq. 3) under prerequisite constraints, packed into weeks of {form.dailyHours * 7} h.
                    Deadline pressure {state.roadmap.deadlinePressure.toFixed(2)}.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4 max-h-[520px] overflow-y-auto">
                  {state.roadmap.weeks.length === 0 && <p className="text-sm text-muted-foreground">Every topic is at mastery.</p>}
                  {state.roadmap.weeks.map((w) => (
                    <div key={w.week} className="border rounded-lg p-3">
                      <div className="flex justify-between text-sm font-medium mb-2">
                        <span>Week {w.week}</span>
                        <span className="text-muted-foreground tabular-nums">{w.hours.toFixed(1)} h</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {w.items.map((it, i) => (
                          <Link key={i} to="/interview" state={{ topic: it.topic, language: "python" }}>
                            <Badge variant="outline" className="cursor-pointer hover:bg-accent">
                              {label(it.topic)} · {it.hours} h
                            </Badge>
                          </Link>
                        ))}
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
