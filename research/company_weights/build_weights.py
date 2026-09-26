"""Build company-specific topic weights W(t, c) from public company-tagged LeetCode lists.
Source: github.com/liquidslr/interview-company-wise-problems ("5. All.csv" per company)."""
import glob, json, os, datetime
import pandas as pd
MAP = {
 "arrays": ["Array", "Two Pointers", "Sliding Window", "Prefix Sum", "Matrix"],
 "linked-lists": ["Linked List"],
 "stacks": ["Stack", "Monotonic Stack"],
 "queues": ["Queue", "Monotonic Queue"],
 "trees": ["Tree", "Binary Tree", "Binary Search Tree", "Trie", "Segment Tree", "Binary Indexed Tree"],
 "graphs": ["Graph", "Depth-First Search", "Breadth-First Search", "Union Find", "Topological Sort", "Shortest Path"],
 "hash-tables": ["Hash Table", "Counting"],
 "heaps": ["Heap (Priority Queue)"],
 "sorting": ["Sorting", "Binary Search", "Merge Sort", "Quickselect"],
 "recursion": ["Recursion", "Backtracking", "Divide and Conquer"],
 "dynamic-programming": ["Dynamic Programming", "Memoization"],
 "strings": ["String", "String Matching"],
}
out, stats = {}, {}
for f in sorted(glob.glob("raw/*.csv")):
    c = os.path.basename(f)[:-4]
    d = pd.read_csv(f)
    if "Topics" not in d: print("skip (no topic tags):", c); continue
    d = d.dropna(subset=["Topics"])
    w = {}
    for t, tags in MAP.items():
        m = d.Topics.apply(lambda s: any(x.strip() in tags for x in s.split(",")))
        w[t] = float(d.loc[m, "Frequency"].sum())
    s = sum(w.values())
    out[c] = {k: round(v / s, 4) for k, v in w.items()}
    stats[c] = int(len(d))
json.dump({"source": "https://github.com/liquidslr/interview-company-wise-problems",
           "accessed": str(datetime.date.today()), "method": "sum of LeetCode frequency score of company-tagged problems per topic group, normalised per company",
           "topic_map": MAP, "problems_per_company": stats, "weights": out}, open("company_weights.json", "w"), indent=1)
print(len(out), "companies,", sum(stats.values()), "company-problem rows; median", int(pd.Series(stats).median()))
print(json.dumps(out["Google"], indent=0)); print(out["Shopify"]["dynamic-programming"], out["Google"]["dynamic-programming"])
