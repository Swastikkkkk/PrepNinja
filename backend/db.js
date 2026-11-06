// Small row store. Uses Supabase (table pn_rows) when SUPABASE_URL + SUPABASE_KEY are set,
// otherwise JSON files in the data dir (/tmp on Vercel, the backend folder locally).
import fs from "fs-extra";
import os from "os";
import path from "path";

const SB_URL = (process.env.SUPABASE_URL || "").replace(/\/$/, "");
const SB_KEY = process.env.SUPABASE_KEY || "";
export const DATA_DIR = process.env.VERCEL ? os.tmpdir() : process.cwd();
const useSupabase = Boolean(SB_URL && SB_KEY);

const sb = (q, init = {}) =>
  fetch(`${SB_URL}/rest/v1/pn_rows${q}`, {
    ...init,
    headers: { apikey: SB_KEY, Authorization: `Bearer ${SB_KEY}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });

const fileOf = (tbl) => path.join(DATA_DIR, `${tbl}.json`);
const readFile = async (tbl) => {
  try { return (await fs.pathExists(fileOf(tbl))) ? JSON.parse((await fs.readFile(fileOf(tbl), "utf8")) || "{}") : {}; }
  catch { return {}; }
};

/** Insert or merge a row. */
export async function upsertRow(tbl, id, data) {
  if (useSupabase) {
    const prev = await getRow(tbl, id);
    const merged = { ...(prev || {}), ...data };
    const r = await sb("?on_conflict=tbl,id", {
      method: "POST",
      headers: { Prefer: "resolution=merge-duplicates,return=minimal" },
      body: JSON.stringify({ tbl, id, data: merged, updated_at: new Date().toISOString() }),
    });
    if (!r.ok) console.warn("supabase upsert failed:", r.status, (await r.text()).slice(0, 200));
    return merged;
  }
  const all = await readFile(tbl);
  all[id] = { ...(all[id] || {}), ...data };
  await fs.writeFile(fileOf(tbl), JSON.stringify(all, null, 1)).catch((e) => console.warn("store write failed:", e.message));
  return all[id];
}

export async function getRow(tbl, id) {
  if (useSupabase) {
    const r = await sb(`?tbl=eq.${encodeURIComponent(tbl)}&id=eq.${encodeURIComponent(id)}&select=data`);
    if (!r.ok) return null;
    return (await r.json())[0]?.data || null;
  }
  return (await readFile(tbl))[id] || null;
}

export async function listRows(tbl, limit = 200) {
  if (useSupabase) {
    const r = await sb(`?tbl=eq.${encodeURIComponent(tbl)}&select=data&order=created_at.desc&limit=${limit}`);
    if (!r.ok) return [];
    return (await r.json()).map((x) => x.data);
  }
  return Object.values(await readFile(tbl)).slice(-limit);
}

export async function deleteRow(tbl, id) {
  if (useSupabase) { await sb(`?tbl=eq.${encodeURIComponent(tbl)}&id=eq.${encodeURIComponent(id)}`, { method: "DELETE" }); return; }
  const all = await readFile(tbl);
  delete all[id];
  await fs.writeFile(fileOf(tbl), JSON.stringify(all, null, 1)).catch(() => {});
}
