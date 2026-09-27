"""Statistics for the 60-day study (Sections 6.1 to 6.5).

  python group_stats.py participants.csv [roadmap_annotations.csv] [ats_keyword_annotations.csv]

1. Baseline equivalence of groups A/B/C (one-way ANOVA or Kruskal-Wallis).
2. Sessions and ATS gain: omnibus test, pairwise Welch t-tests with Holm correction,
   mean differences with 95% CI and Cohen's d.
3. Inter-rater agreement: Fleiss' kappa for roadmap top-5 topic membership and for
   HR keyword relevance.
"""
import sys, itertools
import numpy as np, pandas as pd
from scipy import stats
from statsmodels.stats.multitest import multipletests
from statsmodels.stats.inter_rater import fleiss_kappa, aggregate_raters

def cohens_d(a, b):
    sp = np.sqrt(((len(a) - 1) * a.var(ddof=1) + (len(b) - 1) * b.var(ddof=1)) / (len(a) + len(b) - 2))
    return (a.mean() - b.mean()) / sp

def omnibus(groups):
    normal = all(stats.shapiro(g).pvalue > 0.05 for g in groups if len(g) >= 3)
    if normal:
        r = stats.f_oneway(*groups); return f"one-way ANOVA F={r.statistic:.2f}, p={r.pvalue:.4f}"
    r = stats.kruskal(*groups); return f"Kruskal-Wallis H={r.statistic:.2f}, p={r.pvalue:.4f}"

def compare(d, col, label):
    gs = {g: d.loc[d.group == g, col].dropna().to_numpy(float) for g in sorted(d.group.unique())}
    print(f"\n{label}")
    for g, v in gs.items(): print(f"  {g}: n={len(v)} mean={v.mean():.2f} SD={v.std(ddof=1):.2f}")
    print("  " + omnibus(list(gs.values())))
    pairs = list(itertools.combinations(gs, 2)); ps = []; rows = []
    for a, b in pairs:
        x, y = gs[a], gs[b]; t = stats.ttest_ind(x, y, equal_var=False)
        diff = x.mean() - y.mean(); se = np.sqrt(x.var(ddof=1) / len(x) + y.var(ddof=1) / len(y))
        rows.append((a, b, diff, diff - 1.96 * se, diff + 1.96 * se, cohens_d(x, y), t.statistic)); ps.append(t.pvalue)
    for (a, b, diff, lo, hi, dd, t), p in zip(rows, multipletests(ps, method="holm")[1]):
        print(f"  {a} vs {b}: diff {diff:.2f} [95% CI {lo:.2f}, {hi:.2f}], d={dd:.2f}, t={t:.2f}, Holm p={p:.4f}")

d = pd.read_csv(sys.argv[1])
d["ats_gain"] = d.ats_after - d.ats_before
for col in ["cgpa", "prior_problems_solved", "ats_before"]:
    if d[col].notna().sum(): compare(d, col, f"Baseline: {col}")
compare(d, "weekly_prep_hours", "Weekly preparation hours")
compare(d, "sessions", "Sessions per participant")
compare(d, "ats_gain", "ATS score gain")

if len(sys.argv) > 2:
    a = pd.read_csv(sys.argv[2])
    long = a.melt(id_vars=["profile_id", "expert_id"], value_name="topic").dropna()
    topics = sorted(long.topic.unique())
    table = []
    for (pid, ex), g in long.groupby(["profile_id", "expert_id"]):
        table.append({"profile_id": pid, "expert_id": ex, **{t: int(t in set(g.topic)) for t in topics}})
    t = pd.DataFrame(table)
    items = t.melt(id_vars=["profile_id", "expert_id"], var_name="topic", value_name="in_top5")
    mat = items.pivot_table(index=["profile_id", "topic"], columns="expert_id", values="in_top5").dropna().to_numpy(int)
    print(f"\nRoadmap experts: Fleiss' kappa (top-5 membership) = {fleiss_kappa(aggregate_raters(mat)[0]):.3f}, "
          f"{mat.shape[1]} raters, {mat.shape[0]} profile-topic items")
if len(sys.argv) > 3:
    k = pd.read_csv(sys.argv[3])
    mat = k.pivot_table(index=["pair_id", "keyword"], columns="annotator_id", values="is_relevant").dropna().to_numpy(int)
    print(f"HR annotators: Fleiss' kappa (keyword relevance) = {fleiss_kappa(aggregate_raters(mat)[0]):.3f}, "
          f"{mat.shape[1]} raters, {mat.shape[0]} items")
