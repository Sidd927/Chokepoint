import copy
import hashlib
import json
import random
import subprocess
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from chokepoint.api.app import app
from chokepoint.domain.errors import ScenarioError
from chokepoint.scenario.loader import load_path
from chokepoint.scenario.validate import parse_scenario
from chokepoint.solver.exact import solve_exact
from chokepoint_verifier.canonical import canonical_bytes
from chokepoint_verifier.checks import verify
from chokepoint_verifier.fingerprint import scenario_fingerprint
from tests.oracle.oracle import exhaustive, reachable as oracle_reachable

ROOT=Path(__file__).parents[1]

def raw_canonical():
    return json.loads((ROOT / "scenarios/canonical_city.json").read_text())

def tiny_raw(*, with_attack=False, mandatory_remove=False):
    return {"schema_version":"1","id":"tiny","name":"Tiny","description":"test","synthetic":True,
            "zones":[{"id":"Z","name":"zone"}],
            "assets":[{"id":"internet","name":"origin","zone":"Z","kind":"external","services":[],"credentials":[]},{"id":"plc","name":"target","zone":"Z","kind":"plc","services":[{"id":"svc","port":502,"finding_ids":["F"]}],"credentials":[]}],
            "findings":[{"id":"F","title":"finding","description":"test","synthetic":True}],
            "rules":([{"id":"R","src":"internet","dst":"plc","ports":[502],"label":"path"}] if with_attack else []),
            "required_flows":([{"id":"RF","src":"internet","dst":"plc","port":502,"description":"service"}] if with_attack else []),
            "origins":["internet"],"targets":["plc"],
            "actions":([{"id":"A","kind":"remove_rule","params":{"rule_id":"R"},"effort_dh":1,"downtime_dh":0,"mandatory":mandatory_remove,"excludes":[],"description":"remove"}] if with_attack else []),
            "policy":{"max_cost_dh":None}}

def test_oracle_matches_canonical_solver():
    raw=raw_canonical()
    best, feasible_sets=exhaustive(raw)
    scenario=load_path(ROOT / "scenarios/canonical_city.json")
    result=solve_exact(scenario, 200000)
    assert best is not None
    assert result.action_ids == sorted(best[1])
    assert result.objective_key == {"cost_dh":best[0][0],"action_count":best[0][1],"action_ids":list(best[0][2])}
    assert len(feasible_sets) == 16

@pytest.mark.slow
def test_oracle_matches_demo_solver():
    raw=json.loads((ROOT / "scenarios/demo_city.json").read_text())
    best,_=exhaustive(raw)
    result=solve_exact(load_path(ROOT / "scenarios/demo_city.json"), 200000)
    assert best is not None
    assert result.action_ids == sorted(best[1])
    assert result.total_cost_dh == best[0][0]

def test_verifier_agrees_with_oracle_for_all_canonical_subsets():
    raw=raw_canonical()
    action_ids=[a["id"] for a in raw["actions"]]
    for mask in range(1 << len(action_ids)):
        selected=[aid for index, aid in enumerate(action_ids) if mask & (1 << index)]
        expected=next((s for s in exhaustive(raw)[1] if set(s)==set(selected)), None) is not None
        actual=verify(raw,selected)["verdict"] == "VERIFIED"
        assert actual == expected, selected

def test_differential_reachability_on_seeded_subsets():
    raw=raw_canonical()
    scenario=load_path(ROOT / "scenarios/canonical_city.json")
    rng=random.Random(20261024)
    action_ids=[a["id"] for a in raw["actions"]]
    from chokepoint.graph.semantics import reachable
    for _ in range(300):
        selected=frozenset(a for a in action_ids if rng.randrange(2))
        assert reachable(scenario, selected) == oracle_reachable(raw, selected)
        assert set(verify(raw, list(selected))["evidence"]["after"]["reachable_assets"]) == oracle_reachable(raw, selected)

def test_mutated_core_does_not_make_verifier_accept_unsafe_plan(monkeypatch):
    raw=raw_canonical()
    import chokepoint.graph.semantics as core_semantics
    monkeypatch.setattr(core_semantics, "edge_reasons", lambda *args, **kwargs: ())
    result=verify(raw, [])
    assert result["verdict"] == "REJECTED"
    assert any(v["code"] == "TARGETS_UNREACHABLE" for v in result["violations"])

@pytest.mark.parametrize("bad", [
    {"effort_dh":1.5},
    {"effort_dh":True},
    {"extra":"nope"},
])
def test_strict_action_validation(bad):
    raw=raw_canonical()
    raw["actions"][0].update(bad)
    with pytest.raises(ScenarioError): parse_scenario(raw)

def test_receipt_vector_is_computed_from_independent_bytes():
    value={"unicode":"café","n":7,"nested":{"b":2,"a":1}}
    expected=b'{"n":7,"nested":{"a":1,"b":2},"unicode":"caf\xc3\xa9"}'
    assert canonical_bytes(value)==expected
    assert hashlib.sha256(expected).hexdigest() == hashlib.sha256(canonical_bytes(value)).hexdigest()

def test_fingerprint_changes_on_scenario_content_and_ignores_order():
    raw=raw_canonical(); reordered=copy.deepcopy(raw)
    reordered["assets"]=list(reversed(reordered["assets"]))
    reordered["actions"]=list(reversed(reordered["actions"]))
    assert scenario_fingerprint(raw)==scenario_fingerprint(reordered)
    reordered["description"]="changed"
    assert scenario_fingerprint(raw)!=scenario_fingerprint(reordered)

def test_cli_validate_and_plan_json():
    env={"PYTHONPATH":"backend/src"}
    validated=subprocess.run([str(ROOT/".venv/bin/python"),"-m","chokepoint.cli","validate",str(ROOT/"scenarios/canonical_city.json")],cwd=ROOT.parent,env={**env,**dict(__import__('os').environ)},capture_output=True,text=True,check=True)
    assert json.loads(validated.stdout)["valid"] is True
    planned=subprocess.run([str(ROOT/".venv/bin/python"),"-m","chokepoint.cli","plan",str(ROOT/"scenarios/canonical_city.json"),"--json"],cwd=ROOT.parent,env={**env,**dict(__import__('os').environ)},capture_output=True,text=True,check=True)
    assert json.loads(planned.stdout)["solver_status"] == "OPTIMAL"

def test_api_rejects_large_body_and_invalid_request_envelope():
    client=TestClient(app)
    response=client.post("/api/v1/graph",content=b"{}",headers={"content-length":str(256*1024+1)})
    assert response.status_code==413 and response.json()["error"]["code"]=="PAYLOAD_TOO_LARGE"
    response=client.post("/api/v1/plan",json={"scenario_id":"canonical_city","max_nodes":True})
    assert response.status_code==422 and response.json()["error"]["code"]=="INVALID_REQUEST"

def test_zero_action_and_proven_infeasible_results():
    zero=load_path_from_raw(tiny_raw())
    assert solve_exact(zero, 10).solver_status == "OPTIMAL"
    impossible=load_path_from_raw(tiny_raw(with_attack=True))
    assert solve_exact(impossible, 10).solver_status == "INFEASIBLE_PROVEN"

def test_mandatory_flow_conflict_and_budget_boundary():
    raw=tiny_raw(with_attack=True, mandatory_remove=True)
    # The mandatory removal violates the required flow before search.
    assert solve_exact(load_path_from_raw(raw), 10).solver_status == "INFEASIBLE_POLICY_CONFLICT"
    scenario=load_path(ROOT / "scenarios/canonical_city.json")
    full=solve_exact(scenario, 200000)
    assert solve_exact(scenario, full.proof["nodes_evaluated"]).solver_status == "OPTIMAL"
    assert solve_exact(scenario, full.proof["nodes_evaluated"]-1).solver_status in {"FEASIBLE_NOT_PROVEN","NO_PLAN_FOUND_HEURISTIC"}

def load_path_from_raw(raw):
    return parse_scenario(raw)

def test_verifier_reports_unknown_duplicate_and_missing_mandatory_actions():
    raw=raw_canonical()
    result=verify(raw,["UNKNOWN","UNKNOWN"])
    codes={x["code"] for x in result["violations"]}
    assert {"PLAN_IDS_KNOWN","PLAN_IDS_UNIQUE","PLAN_HAS_MANDATORY"} <= codes
