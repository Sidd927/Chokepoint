from __future__ import annotations
import json
from pathlib import Path
from .validate import parse_scenario

def load_path(path: str | Path):
    p = Path(path)
    if p.stat().st_size > 1024 * 1024:
        from chokepoint.domain.errors import ScenarioError
        raise ScenarioError("scenario exceeds 1 MiB document cap")
    raw = json.loads(p.read_text(encoding="utf-8"))
    return parse_scenario(raw)

class ScenarioStore:
    def __init__(self, directory: str):
        self.directory = Path(directory)
        self.scenarios = {}
        for path in sorted(self.directory.glob("*.json")):
            scenario = load_path(path)
            self.scenarios[scenario.id] = scenario

    def get(self, scenario_id):
        return self.scenarios.get(scenario_id)
