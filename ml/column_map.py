"""Column-map stage: rename dataset columns to catalog codes, convert units,
parse phase. Reads core/content/catalog.json for canonical units."""

import json
import re
import sys
from pathlib import Path

import pandas as pd
import yaml

REPO = Path(__file__).resolve().parent.parent
CATALOG = json.loads((REPO / "core" / "content" / "catalog.json").read_text())
CANONICAL_UNIT = {m["code"]: m["unit"] for m in CATALOG["measures"]}

PHASE_RANK = {"preflight": 0, "inflight": 1, "surface": 2, "postflight": 3}

UNIT_SCALE = {
    ("lb", "kg"): 0.45359237,
    ("lbs", "kg"): 0.45359237,
    ("°F", "°C"): None,  # handled as offset conversion
    ("F", "°C"): None,
    ("mmol/L", "mg/dL"): 18.0,
}


def convert(values: pd.Series, from_unit: str, to_unit: str) -> pd.Series:
    if from_unit == to_unit:
        return values.astype(float)
    if (from_unit, to_unit) in (("°F", "°C"), ("F", "°C")):
        return (values.astype(float) - 32) * 5 / 9
    scale = UNIT_SCALE.get((from_unit, to_unit))
    if scale is None:
        raise ValueError(f"no conversion from '{from_unit}' to '{to_unit}'")
    return values.astype(float) * scale


def parse_phase(value: str, pattern: str) -> tuple[str, int]:
    match = re.match(pattern, str(value))
    if not match:
        raise ValueError(f"phase value '{value}' does not match {pattern}")
    return match.group(1), int(match.group(2))


def apply_column_map(df: pd.DataFrame, column_map: dict) -> pd.DataFrame:
    columns = column_map.get("columns", {})
    renamed: dict[str, pd.Series] = {}
    for source, spec in columns.items():
        code = spec["code"] if isinstance(spec, dict) else spec
        unit = spec.get("unit") if isinstance(spec, dict) else None
        series = df[source]
        canonical = CANONICAL_UNIT.get(code)
        if canonical is None:
            raise ValueError(f"column '{source}' maps to unknown code '{code}'")
        renamed[code] = convert(series, unit or canonical, canonical) if unit else series.astype(float)
    out = pd.DataFrame(renamed)
    id_column = column_map.get("id_column")
    if id_column:
        out["person_id"] = df[id_column].astype(str)
    label_column = column_map.get("label_column")
    if label_column:
        out["label"] = df[label_column].astype(int)
    phase_spec = column_map.get("phase_column") or {}
    if phase_spec.get("source"):
        phases, days = zip(*[parse_phase(v, phase_spec["pattern"]) for v in df[phase_spec["source"]]])
        out["phase"] = list(phases)
        out["phase_day"] = list(days)
        out["phase_rank"] = [PHASE_RANK[p] for p in phases]
    return out


def load_map(path: str | Path) -> dict:
    with open(path) as handle:
        return yaml.safe_load(handle)


def main() -> None:
    if len(sys.argv) != 4:
        print("usage: column_map.py <csv> <map.yaml> <out.csv>", file=sys.stderr)
        raise SystemExit(2)
    column_map = load_map(sys.argv[2])
    df = pd.read_csv(sys.argv[1])
    apply_column_map(df, column_map).to_csv(sys.argv[3], index=False)


if __name__ == "__main__":
    main()
