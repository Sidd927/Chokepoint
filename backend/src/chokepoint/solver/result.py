from dataclasses import dataclass
from typing import Any

@dataclass
class SolveResult:
    solver_status: str
    method: str
    action_ids: list[str]
    total_cost_dh: int
    action_count: int
    objective_key: dict[str, Any]
    proof: dict[str, Any]
    conflicts: list[dict[str, Any]]
    limitations: list[str]
