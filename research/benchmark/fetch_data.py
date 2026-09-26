"""Download ASSISTments 2017 (Hugging Face mirror) and keep the columns the benchmark uses."""
import glob, os, urllib.request
import pandas as pd
BASE = "https://huggingface.co/datasets/Lucy9999/assist2017/resolve/main/Competition%20Training%20Set/student_log_{}.csv"
COLS = ["ITEST_id", "skill", "problemId", "startTime", "endTime", "timeTaken", "correct", "original", "attemptCount", "hintCount"]
for i in range(1, 11):
    f = f"student_log_{i}.csv"
    if not os.path.exists(f):
        urllib.request.urlretrieve(BASE.format(i), f)
d = pd.concat(pd.read_csv(f, usecols=COLS) for f in sorted(glob.glob("student_log_*.csv")))
d.to_parquet("a17.parquet")
print(d.shape)
