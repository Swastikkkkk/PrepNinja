# Offline benchmark of the Skill Scoring Engine

Compares the Topic Score (Eq. 1) with established learner models on a public dataset,
answering: how well does each model predict whether a learner gets their next item on a
skill right, using only that learner's earlier attempts?

* **Data:** ASSISTments 2017 (942,816 logged actions, 1,709 learners, 102 skills). We keep
  original (non-scaffold) items with a positive response time: 248,881 attempts on 86 skills.
  It has correctness, response time and timestamps, so all three Eq. 1 terms can be computed.
* **Protocol:** 5-fold cross-validation split by learner (no learner in both train and test).
  Metrics: AUC, RMSE, accuracy. Paired t-tests across folds.
* **Models:** skill mean, Eq. 1 with the paper's weights, Eq. 1 features with fitted weights,
  PFA, PFA plus Eq. 1 speed/recency features (PFA-SR), 4-parameter BKT, DKT (LSTM, 100 units).

```bash
pip install pandas pyarrow scikit-learn scipy torch
python fetch_data.py
python kt_benchmark.py --data a17.parquet --out results
```

## Results (mean ± SD over 5 folds)

| Model | AUC | RMSE | Accuracy |
|---|---|---|---|
| Eq. 1, paper weights (0.5/0.3/0.2, α=0.95) | 0.585 ± 0.006 | 0.526 | 0.533 |
| Skill mean (non-personalised) | 0.616 ± 0.004 | 0.484 | 0.601 |
| Eq. 1 features, fitted weights | 0.619 ± 0.005 | 0.484 | 0.623 |
| PFA | 0.663 ± 0.006 | 0.474 | 0.635 |
| BKT | 0.663 ± 0.005 | 0.474 | 0.637 |
| PFA-SR (PFA + speed + recency) | 0.664 ± 0.005 | 0.474 | 0.635 |
| DKT | 0.719 ± 0.004 | 0.457 | 0.672 |

Main points: the hand-set Eq. 1 weights do worse than a non-personalised baseline; in a grid
search over 286 weight/decay settings the best was Wa=0.9, Wv=0, Wr=0.1, α=0.99 (AUC 0.618),
now the engine's default (`SCORING_MODE=tuned`). Adding speed and recency to PFA gives a small
but consistent gain (+0.0014 AUC, 5/5 folds, p=0.018). DKT is the most accurate but least
interpretable. ASSISTments is middle-school maths, not coding interviews, so these numbers
show relative behaviour of the models, not accuracy on PrepNinja users.
