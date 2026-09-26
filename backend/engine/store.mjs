// Persistence for profiles and attempts.
// Uses Cloud Firestore when FIREBASE_SERVICE_ACCOUNT (JSON string or file path) is set,
// otherwise a local JSON file (engine-data.json) for development.
import fs from "fs-extra";
import path from "path";

const LOCAL_FILE = path.join(process.cwd(), "engine-data.json");

class LocalStore {
  constructor() {
    this.data = fs.existsSync(LOCAL_FILE) ? fs.readJsonSync(LOCAL_FILE) : { profiles: {}, attempts: {} };
  }
  async #save() { await fs.writeJson(LOCAL_FILE, this.data, { spaces: 1 }); }
  async getProfile(uid) { return this.data.profiles[uid] || null; }
  async setProfile(uid, p) { this.data.profiles[uid] = p; await this.#save(); return p; }
  async addAttempt(uid, a) { (this.data.attempts[uid] ||= []).push(a); await this.#save(); return a; }
  async getAttempts(uid) { return this.data.attempts[uid] || []; }
  async deleteUser(uid) { delete this.data.profiles[uid]; delete this.data.attempts[uid]; await this.#save(); }
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
