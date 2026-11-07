"""Swap rehearsal: prove the column-map stage and the model checks work.

Renames and shuffles the synthetic CSV's columns, writes a matching map,
runs the labelled-rows pipeline on the result, then runs the Node loader
checks. Output goes to ml/out/ (never committed).
"""

import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "ml" / "out"
SEED = 7

IGNORED = {"record_id", "agency", "data_source", "mean_arterial_pressure_mmHg", "body_weight_lb"}


def main() -> None:
    OUT.mkdir(parents=True, exist_ok=True)
    df = pd.read_csv(REPO / "ml" / "data" / "astronaut_health_SYNTHETIC.csv")
    base_map = yaml.safe_load((REPO / "ml" / "maps" / "synthetic.yaml").read_text())

    shuffled = list(df.columns)
    import random

    random.Random(SEED).shuffle(shuffled)
    renamed = {old: f"col_{i}" for i, old in enumerate(shuffled)}
    df.rename(columns=renamed).to_csv(OUT / "rehearsed.csv", index=False)

    rehearsed_map = {
        "id_column": renamed[base_map["id_column"]],
        "label_column": renamed[base_map["label_column"]],
        "phase_column": {
            "source": renamed[base_map["phase_column"]["source"]],
            "pattern": base_map["phase_column"]["pattern"],
        },
        "columns": {
            renamed[source]: spec for source, spec in base_map["columns"].items()
        },
    }
    (OUT / "rehearsed_map.yaml").write_text(yaml.safe_dump(rehearsed_map))

    model_out = OUT / "rehearsed_model.json"
    subprocess.run(
        [
            sys.executable,
            str(REPO / "ml" / "labelled_rows.py"),
            "--csv",
            str(OUT / "rehearsed.csv"),
            "--map",
            str(OUT / "rehearsed_map.yaml"),
            "--out",
            str(model_out),
            "--model-version",
            "0.0.1-rehearsal",
        ],
        check=True,
    )
    subprocess.run(["node", str(REPO / "ml" / "check_model.mjs"), str(model_out)], check=True)
    print(f"rehearsal ok: {model_out}")


if __name__ == "__main__":
    main()
