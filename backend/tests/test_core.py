import json, itertools
from pathlib import Path
from chokepoint.scenario.loader import load_path
from chokepoint.graph.semantics import edge_reasons, reachable, witness, flow_permitted
from chokepoint.solver.exact import solve_exact
from chokepoint_verifier.checks import verify

ROOT=Path(__file__).parents[1]
def test_shipped_scenarios_plan_and_verify():
    for name in ("canonical_city","demo_city"):
        s=load_path(ROOT/"scenarios"/(name+".json")); r=solve_exact(s,200000)
        assert r.solver_status=="OPTIMAL"
        assert verify(s.raw,r.action_ids,r.total_cost_dh,r.solver_status)["verdict"]=="VERIFIED"

def test_canonical_expected_tie_winner():
    s=load_path(ROOT/"scenarios/canonical_city.json"); r=solve_exact(s,200000)
    assert r.action_ids==["A01","A02","A03","A04"]
    assert r.total_cost_dh==200

def test_multi_reason_and_monotonicity():
    s=load_path(ROOT/"scenarios/canonical_city.json")
    reasons=edge_reasons(s,"eng_ws","traffic_ctrl")
    assert {r.type for r in reasons}=={"exploit","credential"}
    base=reachable(s,frozenset())
    reduced=reachable(s,frozenset({"A03"}))
    assert reduced<=base

def test_budget_exhaustion_is_not_infeasible():
    s=load_path(ROOT/"scenarios/canonical_city.json"); r=solve_exact(s,1)
    assert r.solver_status in {"FEASIBLE_NOT_PROVEN","NO_PLAN_FOUND_HEURISTIC"}

def test_forged_cost_rejected():
    s=load_path(ROOT/"scenarios/canonical_city.json"); r=solve_exact(s,200000)
    result=verify(s.raw,r.action_ids,r.total_cost_dh+1,r.solver_status)
    assert result["verdict"]=="REJECTED"
    assert any(x["code"]=="COST_CLAIM_MATCHES" for x in result["violations"])

def test_receipt_stable():
    s=load_path(ROOT/"scenarios/canonical_city.json"); r=solve_exact(s,200000)
    a=verify(s.raw,r.action_ids,r.total_cost_dh,r.solver_status)["receipt"]
    b=verify(s.raw,list(reversed(r.action_ids)),r.total_cost_dh,r.solver_status)["receipt"]
    assert a["receipt_fingerprint"]==b["receipt_fingerprint"]
