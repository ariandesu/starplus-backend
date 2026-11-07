"""Time-series pipeline (no labels): per-measure, per-phase reference ranges.

Writes phase_offsets (median shift vs preflight) and typical ranges
(5th-95th percentile) into ml/out/catalog_patch.json. No model.json change.
"""

import argparse
import json
from pathlib import Path

import pandas as pd

import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from column_map import apply_column_map, load_map

REPO = Path(__file__).resolve().parent.parent


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--csv", default=str(REPO / "ml" / "data" / "astronaut_health_SYNTHETIC.csv"))
    parser.add_argument("--map", default=str(REPO / "ml" / "maps" / "synthetic.yaml"))
    parser.add_argument("--out", default=str(REPO / "ml" / "out" / "catalog_patch.json"))
    args = parser.parse_args()

    mapped = apply_column_map(pd.read_csv(args.csv), load_map(args.map))
    measure_cols = sorted(
        str(col) for col in mapped.columns if col not in ("person_id", "label", "phase", "phase_day", "phase_rank")
    )
    patch: dict[str, dict[str, object]] = {"measures": {}}
    for metric in measure_cols:
        per_phase = {}
        for phase, group in mapped.groupby("phase"):
            values = group[metric].astype(float)
            per_phase[str(phase)] = {
                "median": float(values.median()),
                "p5": float(values.quantile(0.05)),
                "p95": float(values.quantile(0.95)),
            }
        reference = per_phase.get("preflight", {}).get("median", 0.0)
        measures = patch["measures"]
        assert isinstance(measures, dict)
        measures[metric] = {
            "phase_offsets": {
                phase: {"baseline_shift": stats["median"] - reference} for phase, stats in per_phase.items()
            },
            "typical_range": {
                phase: {"p5": stats["p5"], "p95": stats["p95"]} for phase, stats in per_phase.items()
            },
        }
    out_path = Path(args.out)
    out_path.parent.mkdir(parents=True, exist_ok=True)
    out_path.write_text(json.dumps(patch, indent=2) + "\n")
    print(f"wrote {args.out}: {len(measure_cols)} measures")


if __name__ == "__main__":
    main()
