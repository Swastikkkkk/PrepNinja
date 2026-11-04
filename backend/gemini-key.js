// Bring-your-own-key: each request may carry the visitor's free Gemini key in
// the X-Gemini-Key header. GEMINI_API_KEY on the server is only a fallback.
import { AsyncLocalStorage } from "node:async_hooks";

const store = new AsyncLocalStorage();

export function geminiKeyMiddleware(req, _res, next) {
  const key = (req.get("x-gemini-key") || process.env.GEMINI_API_KEY || "").trim();
  store.run({ key }, next);
}

export const geminiKey = () => store.getStore()?.key || process.env.GEMINI_API_KEY || "";

export function requireKey(_req, res, next) {
  if (geminiKey()) return next();
  return res.status(401).json({ code: "NEED_KEY", error: "Add your Gemini API key to use this." });
}
