// LLM layer: NVIDIA Nemotron through NVIDIA's OpenAI-compatible endpoint.
// Uses the server's NVIDIA_API_KEY.
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();
const BASE_URL = process.env.NVIDIA_BASE_URL || "https://integrate.api.nvidia.com/v1";
export const LLM_MODEL = process.env.NVIDIA_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";

export function llmKeyMiddleware(req, _res, next) {
  const key = (process.env.NVIDIA_API_KEY || "").trim();
  store.run({ key }, next);
}

export const llmKey = () => store.getStore()?.key || process.env.NVIDIA_API_KEY || "";

export function requireKey(_req, res, next) {
  if (llmKey()) return next();
  return res.status(401).json({ code: "NEED_KEY", error: "AI is not configured on the server." });
}

/** Single-turn chat completion. Returns the assistant text. */
export async function chat(prompt, { system, temperature = 0.6, maxTokens = 4096, json = false, model = LLM_MODEL } = {}) {
  if (!llmKey()) throw new Error("NEED_KEY");
  const messages = [];
  if (system) messages.push({ role: "system", content: system });
  messages.push({ role: "user", content: prompt });

  const body = {
    model,
    messages,
    temperature,
    top_p: 0.95,
    max_tokens: maxTokens,
    chat_template_kwargs: { enable_thinking: false },
  };
  if (json) body.response_format = { type: "json_object" };

  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${llmKey()}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(process.env.NVIDIA_TIMEOUT_MS) || 120000),
  });
  if (!res.ok) {
    const txt = await res.text();
    const err = new Error(`Nemotron error ${res.status}: ${txt.slice(0, 500)}`);
    err.status = res.status;
    throw err;
  }
  const data = await res.json();
  const text = data?.choices?.[0]?.message?.content || "";
  // Strip markdown fences if the model added them.
  return text.replace(/^\s*```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
}

/** Speech-to-text for a WAV buffer with Nemotron omni (accepts audio input). */
export async function transcribeWav(buffer) {
  if (!llmKey()) throw new Error("NEED_KEY");
  const res = await fetch(`${BASE_URL}/chat/completions`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${llmKey()}` },
    body: JSON.stringify({
      model: process.env.NVIDIA_ASR_MODEL || "nvidia/nemotron-3-nano-omni-30b-a3b-reasoning",
      messages: [{ role: "user", content: [
        { type: "input_audio", input_audio: { data: buffer.toString("base64"), format: "wav" } },
        { type: "text", text: "Transcribe exactly what the speaker says, word for word, including filler words like um and uh. Output only the transcript. If nobody speaks, output nothing." },
      ] }],
      temperature: 0,
      max_tokens: 2048,
      chat_template_kwargs: { enable_thinking: false },
    }),
    signal: AbortSignal.timeout(60000),
  });
  if (!res.ok) throw new Error(`Nemotron ASR ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  return (data?.choices?.[0]?.message?.content || "").trim();
}
