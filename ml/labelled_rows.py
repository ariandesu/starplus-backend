"""Labelled-rows pipeline: logistic regression on latest + baseline_z features.

Features come from each person's earlier rows only. Split by person: 80%
train pool (5-fold grouped CV) plus 20% held-out people for evaluation.
Writes model.json with 20 reference cases.
"""

import argparse
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import GroupKFold, train_test_split
from sklearn.preprocessing import StandardScaler

sys.path.insert(0, str(Path(__file__).resolve().parent))
from column_map import CANONICAL_UNIT, apply_column_map, load_map

REPO = Path(__file__).resolve().parent.parent
SEED = 42
MIN_EARLIER_ROWS = 3

SD_FLOOR = {
    "heart_rate": 3.0,
    "oxygen_saturation": 1.0,
    "temperature_c": 0.2,
    "blood_pressure_systolic": 4.0,
    "blood_pressure_diastolic": 3.0,
    "respiratory_rate": 1.0,
    "blood_glucose": 5.0,
}


def sd_floor(code: str, baseline_mean: float) -> float:
    return SD_FLOOR.get(code, abs(baseline_mean) * 0.05)


def build_rows(mapped: pd.DataFrame, metrics: list[str]) -> pd.DataFrame:
    frames = []
    for _, group in mapped.sort_values(["phase_rank", "phase_day"]).groupby("person_id"):
        rows = group.reset_index(drop=True)
        for i in range(MIN_EARLIER_ROWS, len(rows)):
            earlier = rows.iloc[:i]
            current = rows.iloc[i]
            features: dict[str, float] = {}
            for metric in metrics:
                history = earlier[metric].astype(float).to_numpy()
                latest = float(current[metric])
                mean = float(history.mean())
                spread = float(history.std(ddof=0)) if len(history) > 1 else 0.0
                floor = sd_floor(metric, mean)
                features[f"{metric}:latest"] = latest
                features[f"{metric}:baseline_z"] = (latest - mean) / max(spread, floor)
            features["label"] = int(current["label"])
            features["person_id"] = current["person_id"]
            frames.append(features)
    return pd.DataFrame(frames)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(REPO / "ml" / "data" / "astronaut_health_SYNTHETIC.csv"))
    parser.add_argument("--map", default=str(REPO / "ml" / "maps" / "synthetic.yaml"))
    parser.add_argument("--out", default=str(REPO / "core" / "content" / "model.json"))
    parser.add_argument("--model-id", default="starplus-logistic-synthetic")
    parser.add_argument("--model-version", default="0.0.1")
    args = parser.parse_args()

    column_map = load_map(args.map)
    mapped = apply_column_map(pd.read_csv(args.csv), column_map)
    metrics = sorted(str(col) for col in mapped.columns if col not in ("person_id", "label", "phase", "phase_day", "phase_rank"))
    data = build_rows(mapped, metrics)
    feature_cols = [f"{m}:{feat}" for m in metrics for feat in ("latest", "baseline_z")]
    X = data[feature_cols].to_numpy()
    y = data["label"].to_numpy()
    people = data["person_id"].to_numpy()

    train_people, held_people = train_test_split(
        np.unique(people), test_size=0.2, random_state=SEED
    )
    train_mask = np.isin(people, train_people)
    X_train, y_train = X[train_mask], y[train_mask]
    X_held, y_held = X[~train_mask], y[~train_mask]

    cv = GroupKFold(n_splits=5)
    cv_scores = []
    for train_idx, valid_idx in cv.split(X_train, y_train, groups=people[train_mask]):
        scaler_cv = StandardScaler().fit(X_train[train_idx])
        model_cv = LogisticRegression(max_iter=5000).fit(scaler_cv.transform(X_train[train_idx]), y_train[train_idx])
        cv_scores.append(float(model_cv.score(scaler_cv.transform(X_train[valid_idx]), y_train[valid_idx])))

    scaler = StandardScaler().fit(X_train)
    model = LogisticRegression(max_iter=5000).fit(scaler.transform(X_train), y_train)
    held_accuracy = float(model.score(scaler.transform(X_held), y_held))

    rng = np.random.default_rng(SEED)
    reference_idx = rng.choice(len(X_held), size=min(20, len(X_held)), replace=False)
    reference_cases = [
        {
            "features": {col: float(X_held[i, j]) for j, col in enumerate(feature_cols)},
            "expected": float(model.predict_proba(scaler.transform(X_held[i : i + 1]))[0, 1]),
        }
        for i in sorted(reference_idx.tolist())
    ]

    model_json = {
        "contract_version": 1,
        "model_id": args.model_id,
        "model_version": args.model_version,
        "kind": "logistic",
        "inputs": [
            {"metric": metric, "unit": CANONICAL_UNIT[metric], "feature": feature}
            for metric in metrics
            for feature in ("latest", "baseline_z")
        ],
        "intercept": float(model.intercept_[0]),
        "coefficients": [float(c) for c in model.coef_[0]],
        "scaler": {"mean": [float(v) for v in scaler.mean_], "sd": [float(v) for v in scaler.scale_]},
        "output": {"threshold_watch": 0.5, "threshold_critical": 0.8},
        "training_data": {
            "source": "ml/data/astronaut_health_SYNTHETIC.csv",
            "provenance": "synthetic",
            "rows": int(len(data)),
            "evaluation": {
                "cv_accuracy_mean": sum(cv_scores) / len(cv_scores),
                "heldout_accuracy": held_accuracy,
                "n_train_rows": int(len(X_train)),
                "n_heldout_rows": int(len(X_held)),
            },
        },
        "reference_cases": reference_cases,
    }
    Path(args.out).write_text(json.dumps(model_json, indent=2) + "\n")
    print(f"wrote {args.out}: cv={model_json['training_data']['evaluation']['cv_accuracy_mean']:.3f} heldout={held_accuracy:.3f}")


if __name__ == "__main__":
    main()
