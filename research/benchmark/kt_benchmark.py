"""
Offline benchmark: PrepNinja Topic Score (Eq. 1) vs. established learner models.

Task: predict whether a learner answers their next item on a skill correctly,
using only that learner's earlier interactions. Evaluated with 5-fold
student-level cross-validation on ASSISTments 2017 (original items only).

Models
  skill_mean   per-skill training accuracy (no personalisation)
  ts_paper     Eq. 1 with the paper's hand-set weights (0.5/0.3/0.2, alpha=0.95)
  ts_fitted    same three features (a, v, r) with weights fitted by logistic regression
  pfa_sr       PFA plus PrepNinja's speed v(t) and recency r(t) features (proposed engine)
  pfa          Performance Factors Analysis (Pavlik et al., 2009)
  bkt          Bayesian Knowledge Tracing, 4 parameters per skill, maximum likelihood
  dkt          Deep Knowledge Tracing, 1-layer LSTM (Piech et al., 2015)

Run:  python kt_benchmark.py --data a17.parquet --out results
"""
import argparse, json, os, time
import numpy as np, pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import roc_auc_score, mean_squared_error, accuracy_score
from sklearn.model_selection import GroupKFold

SEED = 42
DAY = 86400.0


def load(path):
    d = pd.read_parquet(path)
    d = d[(d.original == 1) & (d.timeTaken > 0) & d.skill.notna()].copy()
    d = d.rename(columns={"ITEST_id": "user", "problemId": "item"})
    d["correct"] = (d.correct >= 1).astype(int)
    d = d.sort_values(["user", "startTime", "endTime"]).reset_index(drop=True)
    d["seq"] = d.groupby("user").cumcount()
    return d[["user", "skill", "item", "startTime", "timeTaken", "correct", "seq"]]


# ---------------------------------------------------------------- features
def ts_features(d, train_mask, alpha=0.95):
    """a(t), v(t), r(t) from strictly earlier attempts on the same skill."""
    tr = d[train_mask]
    item_base = tr.groupby("item").timeTaken.median()
    skill_base = tr.groupby("skill").timeTaken.median()
    base = d.item.map(item_base).fillna(d.skill.map(skill_base)).fillna(tr.timeTaken.median())
    rel = (d.timeTaken / base).clip(0.05, 20)            # >1 means slower than baseline
    g = d.groupby(["user", "skill"], sort=False)
    n_prev = g.cumcount()
    c_prev = g.correct.cumsum() - d.correct
    rel_cum = rel.groupby([d.user, d.skill]).cumsum() - rel
    last_t = g.startTime.shift(1)
    gap_days = ((d.startTime - last_t) / DAY).clip(lower=0)

    glob_acc = tr.correct.mean()
    a = np.where(n_prev > 0, c_prev / n_prev.replace(0, 1), glob_acc)
    avg_rel = np.where(n_prev > 0, rel_cum / n_prev.replace(0, 1), 1.0)
    v = np.minimum(1.0 / avg_rel, 1.0)
    f = pd.DataFrame({"a": a, "v": v, "gap": gap_days.fillna(-1).values,
                      "n_prev": n_prev.values, "c_prev": c_prev.values}, index=d.index)
    return f


def recency(gap, alpha):
    return np.where(gap < 0, 1.0, alpha ** np.maximum(gap, 0))


def ts_score(f, w=(0.5, 0.3, 0.2), alpha=0.95):
    return w[0] * f.a + w[1] * f.v + w[2] * recency(f.gap, alpha)


# ---------------------------------------------------------------- models
def m_skill_mean(d, tr, te, f):
    m = d[tr].groupby("skill").correct.mean()
    return d[te].skill.map(m).fillna(d[tr].correct.mean()).values


def m_ts_paper(d, tr, te, f):
    return ts_score(f[te]).values


def m_ts_fitted(d, tr, te, f, alpha=0.95):
    X = lambda ff: np.c_[ff.a, ff.v, recency(ff.gap, alpha)]
    lr = LogisticRegression(max_iter=1000).fit(X(f[tr]), d[tr].correct)
    return lr.predict_proba(X(f[te]))[:, 1], lr


def m_pfa(d, tr, te, f, extra=False, alpha=0.95):
    skills = pd.Categorical(d.skill).codes
    ns = skills.max() + 1
    succ = f.c_prev.values
    fail = (f.n_prev - f.c_prev).values
    from scipy import sparse
    rows = np.arange(len(d))
    X = [
        sparse.csr_matrix((np.ones(len(d)), (rows, skills)), shape=(len(d), ns)),
        sparse.csr_matrix((np.log1p(succ), (rows, skills)), shape=(len(d), ns)),
        sparse.csr_matrix((np.log1p(fail), (rows, skills)), shape=(len(d), ns)),
    ]
    if extra:   # PrepNinja features: speed v(t) and recency r(t) from Eq. 1
        X.append(sparse.csr_matrix(np.c_[f.v.values, recency(f.gap.values, alpha)]))
    X = sparse.hstack(X).tocsr()
    trm, tem = tr.values, te.values
    lr = LogisticRegression(max_iter=2000, C=1.0).fit(X[trm], d.correct.values[trm])
    return lr.predict_proba(X[tem])[:, 1]


def _bkt_pad(y, groups):
    seqs = [y[g] for g in groups]
    L = max(len(q) for q in seqs)
    Y = np.zeros((len(seqs), L)); M = np.zeros((len(seqs), L), bool)
    for i, q in enumerate(seqs):
        Y[i, :len(q)] = q; M[i, :len(q)] = True
    return Y, M


def _bkt_forward(params, Y, M):
    """Returns P(correct) before each observation and the total log-likelihood."""
    L0, T, S, G = params
    pL = np.full(Y.shape[0], L0); P = np.zeros_like(Y); ll = 0.0
    for t in range(Y.shape[1]):
        m = M[:, t]; y = Y[:, t]
        pc = pL * (1 - S) + (1 - pL) * G
        P[:, t] = pc
        pcc = np.clip(pc, 1e-9, 1 - 1e-9)
        ll += np.sum(np.where(m, y * np.log(pcc) + (1 - y) * np.log(1 - pcc), 0))
        post = np.where(y == 1, pL * (1 - S) / pcc, pL * S / (1 - pcc))
        pL = np.where(m, post + (1 - post) * T, pL)
    return P, ll


def m_bkt(d, tr, te, f):
    """Standard 4-parameter BKT (Corbett & Anderson, 1995) fitted per skill by maximum
    likelihood with the usual bounds on slip and guess (Baker et al., 2008)."""
    from scipy.optimize import minimize
    bounds = [(0.01, 0.99), (0.001, 0.5), (0.001, 0.3), (0.001, 0.3)]
    y = d.correct.values.astype(float); pred = np.full(len(d), d[tr].correct.mean())
    for sk, g in d.groupby("skill").groups.items():
        idx = np.asarray(g)
        trg = [np.asarray(v) for _, v in pd.Series(idx[tr.values[idx]]).groupby(d.user.values[idx[tr.values[idx]]])] if tr.values[idx].any() else []
        teg = [np.asarray(v) for _, v in pd.Series(idx[te.values[idx]]).groupby(d.user.values[idx[te.values[idx]]])] if te.values[idx].any() else []
        if not teg: continue
        best = (0.4, 0.1, 0.1, 0.2)
        if trg:
            Y, M = _bkt_pad(y, trg); bestll = -np.inf
            for x0 in [(0.4, 0.1, 0.1, 0.2), (0.2, 0.05, 0.2, 0.25)]:
                r = minimize(lambda p: -_bkt_forward(p, Y, M)[1], x0, method="L-BFGS-B", bounds=bounds,
                             options={"maxiter": 60})
                if -r.fun > bestll: bestll, best = -r.fun, r.x
        Y, M = _bkt_pad(y, teg); P, _ = _bkt_forward(best, Y, M)
        for i, g2 in enumerate(teg):
            pred[g2] = P[i, :len(g2)]
    return pred[te.values]


def m_dkt(d, tr, te, f, epochs=12, hidden=100, maxlen=200):
    import torch, torch.nn as nn
    torch.manual_seed(SEED); np.random.seed(SEED)
    sk = pd.Categorical(d.skill).codes.astype(np.int64)
    ns = sk.max() + 1
    y = d.correct.values.astype(np.int64)
    users = d.user.values

    def seqs(mask):
        out = []
        idx = np.where(mask.values)[0]
        for u, ii in pd.Series(idx).groupby(users[idx]):
            ii = ii.values
            for s in range(0, len(ii), maxlen):
                out.append(ii[s:s + maxlen])
        return out

    class DKT(nn.Module):
        def __init__(s):
            super().__init__()
            s.emb = nn.Embedding(2 * ns + 1, hidden, padding_idx=2 * ns)
            s.rnn = nn.LSTM(hidden, hidden, batch_first=True)
            s.drop = nn.Dropout(0.2)
            s.out = nn.Linear(hidden, ns)

        def forward(s, x):
            h, _ = s.rnn(s.emb(x))
            return s.out(s.drop(h))

    def batch(ss):
        L = max(len(s) for s in ss)
        X = np.full((len(ss), L), 2 * ns); Q = np.zeros((len(ss), L), np.int64)
        Y = np.zeros((len(ss), L), np.float32); M = np.zeros((len(ss), L), bool)
        for i, s in enumerate(ss):
            n = len(s)
            X[i, 1:n] = (sk[s] * 2 + y[s])[:-1]         # shift: predict step t from <t
            X[i, 0] = 2 * ns
            Q[i, :n] = sk[s]; Y[i, :n] = y[s]; M[i, :n] = True
        return (torch.tensor(X), torch.tensor(Q), torch.tensor(Y), torch.tensor(M))

    trs, tes = seqs(tr), seqs(te)
    model = DKT(); opt = torch.optim.Adam(model.parameters(), lr=1e-3)
    lossf = nn.BCEWithLogitsLoss()
    for ep in range(epochs):
        model.train(); np.random.shuffle(trs)
        for b in range(0, len(trs), 32):
            X, Q, Y, M = batch(trs[b:b + 32])
            logit = model(X).gather(2, Q.unsqueeze(-1)).squeeze(-1)
            loss = lossf(logit[M], Y[M]); opt.zero_grad(); loss.backward()
            nn.utils.clip_grad_norm_(model.parameters(), 1.0); opt.step()
    model.eval(); pred = np.zeros(len(d))
    with torch.no_grad():
        for b in range(0, len(tes), 64):
            ss = tes[b:b + 64]; X, Q, Y, M = batch(ss)
            p = torch.sigmoid(model(X).gather(2, Q.unsqueeze(-1)).squeeze(-1)).numpy()
            for i, s in enumerate(ss):
                pred[s] = p[i, :len(s)]
    return pred[te.values]


def metrics(y, p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return {"auc": roc_auc_score(y, p), "rmse": mean_squared_error(y, p) ** 0.5,
            "acc": accuracy_score(y, p >= 0.5)}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--data", default="a17.parquet"); ap.add_argument("--out", default="results")
    ap.add_argument("--folds", type=int, default=5); ap.add_argument("--skip", default="")
    args = ap.parse_args(); os.makedirs(args.out, exist_ok=True)
    d = load(args.data)
    print(f"{len(d):,} interactions, {d.user.nunique()} learners, {d.skill.nunique()} skills, "
          f"accuracy {d.correct.mean():.3f}", flush=True)
    models = {"skill_mean": m_skill_mean, "ts_paper": m_ts_paper,
              "ts_fitted": lambda *a: m_ts_fitted(*a)[0], "pfa": m_pfa, "pfa_sr": lambda *a: m_pfa(*a, extra=True), "bkt": m_bkt, "dkt": m_dkt}
    for s in filter(None, args.skip.split(",")): models.pop(s)
    rows, sens, coefs = [], [], []
    for k, (tri, tei) in enumerate(GroupKFold(args.folds).split(d, groups=d.user)):
        tr = pd.Series(False, index=d.index); tr.iloc[tri] = True; te = ~tr
        f = ts_features(d, tr)
        yte = d[te].correct.values
        for name, fn in models.items():
            t0 = time.time(); p = fn(d, tr, te, f)
            r = {"fold": k, "model": name, **metrics(yte, p), "sec": time.time() - t0}
            rows.append(r); print(r, flush=True)
        _, lr = m_ts_fitted(d, tr, te, f)
        coefs.append({"fold": k, "a": lr.coef_[0][0], "v": lr.coef_[0][1], "r": lr.coef_[0][2],
                      "b": lr.intercept_[0]})
        # sensitivity of Eq. 1 to its weights and decay (AUC on the held-out fold)
        for wa in np.arange(0, 1.01, 0.1):
            for wv in np.arange(0, 1.01 - wa, 0.1):
                wr = 1 - wa - wv
                for alpha in (0.8, 0.9, 0.95, 0.99, 1.0):
                    if wr < 1e-9 and alpha != 0.95: continue
                    sens.append({"fold": k, "wa": round(wa, 1), "wv": round(wv, 1), "wr": round(wr, 1),
                                 "alpha": alpha,
                                 "auc": roc_auc_score(yte, ts_score(f[te], (wa, wv, wr), alpha))})
    res = pd.DataFrame(rows); res.to_csv(f"{args.out}/folds.csv", index=False)
    pd.DataFrame(sens).to_csv(f"{args.out}/sensitivity.csv", index=False)
    pd.DataFrame(coefs).to_csv(f"{args.out}/ts_fitted_coefs.csv", index=False)
    summ = res.groupby("model")[["auc", "rmse", "acc"]].agg(["mean", "std"])
    summ.to_csv(f"{args.out}/summary.csv"); print(summ)


if __name__ == "__main__":
    main()
