# Model card — placeholder classifier (synthetic)

## Data provenance

Trained on `ml/data/astronaut_health_SYNTHETIC.csv` (1,260 rows, 180
invented crew members, 7 rows each). The file header states the data is
computer-generated from published group-level statistics; no row is a real
person's measurement and the agency column is random. `training_data`
provenance is `synthetic`. License: generated for this project; see
`ml/data/how_data_was_generated.txt`.

## Method

`ml/labelled_rows.py`: per person, rows ordered by phase and day; for each
row with at least 3 earlier rows, features are the current value (`latest`)
and the z-score against that person's earlier rows (`baseline_z`) for 15
measures (30 features). Logistic regression on standardized features.
Split by person: 80% train pool with 5-fold grouped cross-validation, 20%
held-out people for evaluation. Seed 42 throughout.

## Evaluation

Held-out accuracy ≈ 0.85, CV mean ≈ 0.89 (see `training_data.evaluation` in
`model.json`). These numbers measure fit to synthetic labels only and are
not evidence of clinical performance. No metric computed on synthetic labels
is presented as evidence anywhere in the app.

## Limits

- Placeholder only. Replaced on 2026-11-13 with a model trained on the
  hackathon dataset (runbook in HANDOFF §7).
- Advisory only at run time: the probability appears in a neutral grey
  panel and never changes a status or next step.
- If the file fails any loader check (schema, catalog inputs, reference
  cases within 0.001, non-constant output), the app scores without it and
  says "model unavailable".
- No health values, names, IDs or free text were used in any prompt; the
  model was trained by `ml/labelled_rows.py`, not by an LLM.
