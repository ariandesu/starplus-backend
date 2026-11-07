"""Rehearsal test: Python and Node predictions agree within 0.001."""

import json
import math
import subprocess
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
OUT = REPO / "ml" / "out"


def python_predict(model: dict, features: dict) -> float:
    logit = model["intercept"]
    for i, inp in enumerate(model["inputs"]):
        key = f"{inp['metric']}:{inp['feature']}"
        raw = features.get(key, 0.0)
        sd = model["scaler"]["sd"][i] or 1.0
        logit += model["coefficients"][i] * ((raw - model["scaler"]["mean"][i]) / sd)
    return 1 / (1 + math.exp(-logit))


def test_rehearsal_agrees() -> None:
    subprocess.run([sys.executable, str(REPO / "ml" / "rehearse.py")], check=True)
    model = json.loads((OUT / "rehearsed_model.json").read_text())

    node_script = (
        "const m = await import(process.argv[1]);"
        "const fs = await import('node:fs');"
        "const model = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'));"
        "const out = model.reference_cases.map((c) => m.predict(model, c.features));"
        "process.stdout.write(JSON.stringify(out));"
    )
    completed = subprocess.run(
        ["node", "--input-type=module", "-e", node_script, str(REPO / "core" / "src" / "model.ts"), str(OUT / "rehearsed_model.json")],
        check=True,
        capture_output=True,
        text=True,
    )
    node_predictions = json.loads(completed.stdout)
    assert len(node_predictions) == len(model["reference_cases"])
    for reference, node_probability in zip(model["reference_cases"], node_predictions):
        python_probability = python_predict(model, reference["features"])
        assert abs(python_probability - reference["expected"]) <= 0.001
        assert abs(node_probability - reference["expected"]) <= 0.001
