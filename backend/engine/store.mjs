// Persistence for profiles and attempts.
// Uses Cloud Firestore when FIREBASE_SERVICE_ACCOUNT (JSON string or file path) is set,
// otherwise db.js rows (Supabase or local JSON).
import fs from "fs-extra";
import { getRow, upsertRow, deleteRow } from "../db.js";


class LocalStore {
  // Rows in db.js (Supabase when configured, otherwise JSON files).
  async getProfile(uid) { return (await getRow("engine", `profile:${uid}`)) || null; }
  async setProfile(uid, p) { await upsertRow("engine", `profile:${uid}`, p); return p; }
  async addAttempt(uid, a) {
    const cur = (await getRow("engine", `attempts:${uid}`))?.list || [];
    await upsertRow("engine", `attempts:${uid}`, { list: [...cur, a] });
    return a;
  }
  async getAttempts(uid) { return (await getRow("engine", `attempts:${uid}`))?.list || []; }
  async deleteUser(uid) { await deleteRow("engine", `profile:${uid}`); await deleteRow("engine", `attempts:${uid}`); }
}

class FirestoreStore {
  constructor(db) { this.db = db; }
  async getProfile(uid) { const s = await this.db.doc(`users/${uid}`).get(); return s.exists ? s.data() : null; }
  async setProfile(uid, p) { await this.db.doc(`users/${uid}`).set(p, { merge: true }); return p; }
  async addAttempt(uid, a) { await this.db.collection(`users/${uid}/attempts`).add(a); return a; }
  async getAttempts(uid) { const q = await this.db.collection(`users/${uid}/attempts`).orderBy("at").get(); return q.docs.map((d) => d.data()); }
  async deleteUser(uid) {
    const q = await this.db.collection(`users/${uid}/attempts`).get();
    const b = this.db.batch(); q.docs.forEach((d) => b.delete(d.ref)); b.delete(this.db.doc(`users/${uid}`)); await b.commit();
  }
}

export async function createStore() {
  const sa = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!sa) return new LocalStore();
  const admin = (await import("firebase-admin")).default;
  const cred = sa.trim().startsWith("{") ? JSON.parse(sa) : fs.readJsonSync(sa);
  if (!admin.apps.length) admin.initializeApp({ credential: admin.credential.cert(cred) });
  return new FirestoreStore(admin.firestore());
}
