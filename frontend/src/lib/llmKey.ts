import { API_BASE } from "./config";

// Optional bring-your-own NVIDIA key (server key is the default). Stored only in this browser, sent only to our API.
const STORE = "prepninja_nvidia_key";
export const KEY_EVENT = "prepninja:need-key";

export const getKey = () => {
  try { return localStorage.getItem(STORE) || ""; } catch { return ""; }
};
export const setKey = (k: string) => {
  try { if (k) localStorage.setItem(STORE, k); else localStorage.removeItem(STORE); } catch { /* private mode */ }
};
export const askForKey = (reason = "") => window.dispatchEvent(new CustomEvent(KEY_EVENT, { detail: reason }));

/** Adds X-NVIDIA-Key to every request to our API and opens the key dialog when the API asks for one. */
export function installKeyFetch() {
  const original = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!url.startsWith(API_BASE)) return original(input, init);
    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    const k = getKey();
    if (k) headers.set("X-NVIDIA-Key", k);
    const res = await original(input, { ...init, headers });
    if (res.status === 401) {
      res.clone().json().then((j) => askForKey(j?.error || "")).catch(() => askForKey());
    } else if (!res.ok) {
      res.clone().text().then((t) => {
        if (/Nemotron error (401|403)/i.test(t)) askForKey("That NVIDIA key was rejected. Check it on build.nvidia.com.");
      }).catch(() => {});
    }
    return res;
  };
}
