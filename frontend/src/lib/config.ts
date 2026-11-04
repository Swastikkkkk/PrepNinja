// One backend for everything. Set VITE_API_URL on Vercel to the deployed API.
export const API_BASE = (
  import.meta.env.VITE_API_URL || import.meta.env.VITE_ENGINE_URL || "http://localhost:8080"
).replace(/\/$/, "");
