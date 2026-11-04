"use client"

import { API_BASE } from "./lib/config";
import { useEffect, useState, useRef } from "react"
import { useNavigate, useLocation } from "react-router-dom"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Separator } from "@/components/ui/separator"
import { Progress } from "@/components/ui/progress"
import {
  RefreshCw,
  Download,
  ExternalLink,
  Clock,
  User,
  FileText,
  Video,
  CheckCircle,
  AlertCircle,
  BarChart3,
  ArrowLeft,
} from "lucide-react"


type Attempt = {
  attemptId: string
  sessionId: string
  questionId: string
  questionText?: string
  userId: string
  cloudinaryUrl?: string
  uploadedAt?: string
  processed?: boolean
  transcript?: string
  scoring?: {
    total?: number
    fluency?: number
    content?: number
    structure?: number
    examples?: number
    pronunciation?: number
    notes?: string
  }
}


export default function InterviewSetup({
  apiBase = API_BASE,
  adminToken = "",
}: {
  apiBase?: string
  adminToken?: string
}) {
  const navigate = useNavigate()
  const location = useLocation()
  
  const [attempts, setAttempts] = useState<Attempt[]>([])
  const [loading, setLoading] = useState(false)
  const [selected, setSelected] = useState<Attempt | null>(null)
  const [error, setError] = useState<string | null>(null)
  const pollingRef = useRef<number | null>(null)
  const [refreshIntervalMs, setRefreshIntervalMs] = useState<number>(5000)


  async function fetchAttempts() {
    setLoading(true)
    setError(null)
    try {
      const headers: Record<string, string> = {}
      if (adminToken) headers["x-admin-token"] = adminToken
      const res = await fetch(`${apiBase}/api/admin/attempts`, { headers })
      if (!res.ok) {
        const txt = await res.text()
        throw new Error(txt || `HTTP ${res.status}`)
      }
      const data = await res.json()
      const arr: Attempt[] = (data.attempts || []).map((a: any) => ({
        attemptId: a.attemptId,
        sessionId: a.sessionId,
        questionId: a.questionId,
        questionText: a.questionText || a.questionText || a.questionId,
        userId: a.userId,
        cloudinaryUrl: a.cloudinaryUrl,
        uploadedAt: a.uploadedAt,
        processed: a.processed,
        transcript: a.transcript,
        scoring: a.scoring,
      }))
      setAttempts(arr)
      // keep selected in sync (replace with updated item if present)
      if (selected) {
        const updated = arr.find((x) => x.attemptId === selected.attemptId) || null
        setSelected(updated)
      }
    } catch (e: any) {
      console.error("fetchAttempts", e)
      setError(e?.message || "Failed to load attempts")
    } finally {
      setLoading(false)
    }
  }


  useEffect(() => {
    // initial load
    fetchAttempts()


    // start polling
    if (pollingRef.current) window.clearInterval(pollingRef.current)
    pollingRef.current = window.setInterval(() => {
      fetchAttempts()
    }, refreshIntervalMs) as unknown as number


    return () => {
      if (pollingRef.current) window.clearInterval(pollingRef.current)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiBase, adminToken, refreshIntervalMs])


  function selectAttempt(a: Attempt) {
    setSelected(a)
  }


  function formatDate(dateString?: string) {
    if (!dateString) return "—"
    return new Date(dateString).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    })
  }


  function getScoreColor(score?: number, maxScore = 10) {
    if (!score) return "text-muted-foreground"
    const percentage = (score / maxScore) * 100
    if (percentage >= 80) return "text-green-600"
    if (percentage >= 60) return "text-yellow-600"
    return "text-red-600"
  }


  return (
    <div className="min-h-screen bg-muted/30 p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            {/* Back Button to Interview Flow */}
            <Button 
              variant="ghost" 
              size="sm" 
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Back
            </Button>
            
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Admin Dashboard</h1>
              <p className="text-muted-foreground">Manage and review user attempts</p>
            </div>
          </div>


          <div className="flex items-center gap-3">
            <Button variant="outline" size="sm" onClick={() => fetchAttempts()} disabled={loading} className="gap-2">
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>


            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Clock className="h-4 w-4" />
              Auto-refresh every
            </div>


            <Select value={String(refreshIntervalMs)} onValueChange={(value) => setRefreshIntervalMs(Number(value))}>
              <SelectTrigger className="w-20">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="2000">2s</SelectItem>
                <SelectItem value="5000">5s</SelectItem>
                <SelectItem value="10000">10s</SelectItem>
                <SelectItem value="30000">30s</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>


        {/* Error Alert */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}


        {/* Main Content */}
        <div className="grid grid-cols-1 lg:grid-cols-4 gap-6">
          {/* Attempts List */}
          <Card className="col-span-1">
            <CardHeader className="pb-3">
              <CardTitle className="text-base flex items-center gap-2">
                <FileText className="h-4 w-4" />
                Attempts ({attempts.length})
              </CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="max-h-[70vh] overflow-auto">
                {loading && <div className="p-4 text-center text-sm text-muted-foreground">Loading attempts...</div>}


                {attempts.length === 0 && !loading && (
                  <div className="p-4 text-center text-sm text-muted-foreground">No attempts found</div>
                )}


                <div className="space-y-1 p-2">
                  {attempts.map((attempt) => (
                    <div
                      key={attempt.attemptId}
                      className={`p-3 rounded-lg border cursor-pointer transition-all hover:bg-accent/50 ${
                        selected?.attemptId === attempt.attemptId
                          ? "bg-accent border-primary shadow-sm"
                          : "border-transparent hover:border-border"
                      }`}
                      onClick={() => selectAttempt(attempt)}
                    >
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <div className="font-mono text-xs text-muted-foreground truncate">{attempt.attemptId}</div>
                        <Badge variant={attempt.processed ? "default" : "secondary"} className="text-xs">
                          {attempt.processed ? (
                            <CheckCircle className="h-3 w-3 mr-1" />
                          ) : (
                            <Clock className="h-3 w-3 mr-1" />
                          )}
                          {attempt.processed ? "Done" : "Pending"}
                        </Badge>
                      </div>


                      <div className="space-y-1">
                        <div className="flex items-center gap-1 text-xs text-muted-foreground">
                          <User className="h-3 w-3" />
                          {attempt.userId}
                        </div>
                        <div className="text-xs text-muted-foreground">{formatDate(attempt.uploadedAt)}</div>
                        {attempt.scoring?.total && (
                          <div className="text-xs font-medium">
                            Score:{" "}
                            <span className={getScoreColor(attempt.scoring.total, 50)}>{attempt.scoring.total}/50</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </CardContent>
          </Card>


          {/* Details Panel */}
          <div className="col-span-3 space-y-6">
            {!selected ? (
              <Card className="h-[60vh] flex items-center justify-center">
                <CardContent className="text-center">
                  <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                  <p className="text-muted-foreground">Select an attempt to view details</p>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Attempt Header */}
                <Card>
                  <CardHeader>
                    <div className="flex items-start justify-between">
                      <div className="space-y-1">
                        <CardTitle className="font-mono text-lg">{selected.attemptId}</CardTitle>
                        <div className="flex items-center gap-4 text-sm text-muted-foreground">
                          <div className="flex items-center gap-1">
                            <User className="h-4 w-4" />
                            {selected.userId}
                          </div>
                          <div>Session: {selected.sessionId}</div>
                          <div>{formatDate(selected.uploadedAt)}</div>
                        </div>
                      </div>
                      <Badge variant={selected.processed ? "default" : "secondary"} className="gap-1">
                        {selected.processed ? <CheckCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
                        {selected.processed ? "Processed" : "Processing"}
                      </Badge>
                    </div>
                  </CardHeader>
                </Card>


                {/* Question */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Question
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-sm leading-relaxed">{selected.questionText || selected.questionId}</p>
                  </CardContent>
                </Card>


                {/* Video */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <Video className="h-4 w-4" />
                      Video Recording
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selected.cloudinaryUrl ? (
                      <div className="space-y-4">
                        <video
                          key={selected.cloudinaryUrl}
                          src={selected.cloudinaryUrl}
                          controls
                          className="w-full max-h-[400px] rounded-lg bg-black"
                        />
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" asChild>
                            <a href={selected.cloudinaryUrl} target="_blank" rel="noreferrer" className="gap-2">
                              <ExternalLink className="h-4 w-4" />
                              Open in new tab
                            </a>
                          </Button>
                          <Button variant="outline" size="sm" asChild>
                            <a href={selected.cloudinaryUrl} download className="gap-2">
                              <Download className="h-4 w-4" />
                              Download
                            </a>
                          </Button>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <Video className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>No video available yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>


                {/* Transcript */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <FileText className="h-4 w-4" />
                      Transcript
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {selected.transcript ? (
                      <div className="bg-muted/50 rounded-lg p-4 max-h-48 overflow-auto">
                        <pre className="text-sm leading-relaxed whitespace-pre-wrap font-sans">
                          {selected.transcript}
                        </pre>
                      </div>
                    ) : (
                      <div className="text-center py-8 text-muted-foreground">
                        <FileText className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Transcript not available yet</p>
                      </div>
                    )}
                  </CardContent>
                </Card>


                {/* Scoring */}
                <Card>
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base flex items-center gap-2">
                      <BarChart3 className="h-4 w-4" />
                      Scoring Results
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {!selected.scoring ? (
                      <div className="text-center py-8 text-muted-foreground">
                        <BarChart3 className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <p>Scoring not available yet</p>
                      </div>
                    ) : (
                      <div className="space-y-6">
                        {/* Total Score */}
                        {selected.scoring.total !== undefined && (
                          <div className="text-center">
                            <div className="text-3xl font-bold mb-2">
                              <span className={getScoreColor(selected.scoring.total, 50)}>
                                {selected.scoring.total}
                              </span>
                              <span className="text-muted-foreground">/50</span>
                            </div>
                            <Progress value={(selected.scoring.total / 50) * 100} className="w-full max-w-xs mx-auto" />
                          </div>
                        )}


                        <Separator />


                        {/* Individual Scores */}
                        <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                          {[
                            { key: "fluency", label: "Fluency", max: 10 },
                            { key: "content", label: "Content", max: 10 },
                            { key: "structure", label: "Structure", max: 10 },
                            { key: "examples", label: "Examples", max: 10 },
                            { key: "pronunciation", label: "Pronunciation", max: 10 },
                          ].map(({ key, label, max }) => {
                            const score = selected.scoring?.[key as keyof typeof selected.scoring] as number
                            return (
                              <div key={key} className="text-center space-y-2">
                                <div className="text-sm font-medium text-muted-foreground">{label}</div>
                                <div className="text-xl font-semibold">
                                  <span className={getScoreColor(score, max)}>{score ?? "—"}</span>
                                  <span className="text-muted-foreground">/{max}</span>
                                </div>
                                {score !== undefined && <Progress value={(score / max) * 100} className="h-2" />}
                              </div>
                            )
                          })}
                        </div>


                        {/* Notes */}
                        {selected.scoring.notes && (
                          <>
                            <Separator />
                            <div>
                              <h4 className="font-medium mb-2">Feedback Notes</h4>
                              <div className="bg-muted/50 rounded-lg p-4">
                                <p className="text-sm leading-relaxed">{selected.scoring.notes}</p>
                              </div>
                            </div>
                          </>
                        )}
                      </div>
                    )}
                  </CardContent>
                </Card>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
