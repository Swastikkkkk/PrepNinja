# Study analysis

Scripts that turn the raw study data into the numbers the paper needs. Fill the CSVs in
`templates/` with real data (never invented values), then:

```bash
pip install pandas scipy scikit-learn statsmodels
python group_stats.py participants.csv roadmap_annotations.csv ats_keyword_annotations.csv
python outcome_validation.py outcomes.csv
```

`survey_questions.md` is the follow-up survey for collecting placement outcomes.
