"""Outcome validation of the readiness index (Success Probability Score).

Does a participant's final P_succ predict real recruitment outcomes?
  python outcome_validation.py outcomes.csv
Reports AUC with bootstrap 95% CI for each binary outcome, point-biserial / Spearman
correlations, and a logistic-regression odds ratio per 0.1 increase in P_succ.
"""
import sys
import numpy as np, pandas as pd
from scipy import stats
from sklearn.metrics import roc_auc_score
import statsmodels.api as sm

def boot_auc(y, s, n=2000, seed=0):
    rng = np.random.default_rng(seed); idx = np.arange(len(y)); out = []
    for _ in range(n):
        b = rng.choice(idx, len(idx))
        if len(set(y[b])) == 2: out.append(roc_auc_score(y[b], s[b]))
    return np.percentile(out, [2.5, 97.5])

d = pd.read_csv(sys.argv[1] if len(sys.argv) > 1 else "outcomes.csv")
d = d.dropna(subset=["final_success_probability"])
s = d.final_success_probability.to_numpy(float)
if s.max() > 1: s = s / 100.0
targets = {
    "cleared_oa": (d.oa_cleared.astype(str).str.lower() == "yes").astype(int),
    "any_interview": (d.interviews_received.fillna(0) > 0).astype(int),
    "any_offer": (d.offers_received.fillna(0) > 0).astype(int),
}
print(f"n = {len(d)}")
for name, y in targets.items():
    y = y.to_numpy()
    if len(set(y)) < 2:
        print(f"{name}: only one class present, skipped"); continue
    auc = roc_auc_score(y, s); lo, hi = boot_auc(y, s)
    r, p = stats.pointbiserialr(y, s)
    m = sm.Logit(y, sm.add_constant(s * 10)).fit(disp=0)
    orr = np.exp(m.params[1]); ci = np.exp(m.conf_int()[1])
    print(f"{name}: positives {y.sum()}/{len(y)} | AUC {auc:.3f} [95% CI {lo:.3f}-{hi:.3f}] | "
          f"r_pb {r:.3f} (p={p:.4f}) | OR per +0.1 P_succ {orr:.2f} [{ci[0]:.2f}-{ci[1]:.2f}]")
rho, p = stats.spearmanr(s, d.interviews_received.fillna(0))
print(f"Spearman(P_succ, #interviews) = {rho:.3f} (p={p:.4f})")
