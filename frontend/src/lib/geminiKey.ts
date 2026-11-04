import { API_BASE } from "./config";

// Bring-your-own Gemini key. Stored only in this browser, sent only to our API.
const STORE = "prepninja_gemini_key";
export const KEY_EVENT = "prepninja:need-key";

export const getKey = () => {
  try { return localStorage.getItem(STORE) || ""; } catch { return ""; }
};
export const setKey = (k: string) => {
  try { if (k) localStorage.setItem(STORE, k); else localStorage.removeItem(STORE); } catch { /* private mode */ }
};
export const askForKey = (reason = "") => window.dispatchEvent(new CustomEvent(KEY_EVENT, { detail: reason }));

/** Adds X-Gemini-Key to every request to our API and opens the key dialog when the API asks for one. */
export function installKeyFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_BASE)) return original(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const k = getKey();
    if (k) headers.set("X-Gemini-Key", k);
    const res = await original(input, { ...init, headers });
    if (res.status === 401) {
      res.clone().json().then((j) => askForKey(j?.error || "")).catch(() => askForKey());
    } else if (!res.ok) {
      res.clone().text().then((t) => {
        if (/API_KEY_INVALID|API key not valid/i.test(t)) askForKey("That Gemini key was rejected. Check it in Google AI Studio.");
      }).catch(() => {});
    }
    return res;
  };
}
