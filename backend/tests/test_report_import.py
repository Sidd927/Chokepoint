"""Scenario import, evidence-backed explanations and PDF reports (new in this phase)."""
import copy, json, re
from pathlib import Path
from fastapi.testclient import TestClient
from chokepoint.api.app import app
from chokepoint.api import app as app_module

client = TestClient(app)
ROOT = Path(__file__).resolve().parents[1]
canonical = lambda: json.loads((ROOT / "scenarios/canonical_city.json").read_text())
pages = lambda pdf: len(re.findall(rb"/Type /Page\b(?!s)", pdf))

# ---- explanations ---------------------------------------------------------------------------------
def test_explanations_state_only_what_the_model_establishes():
    plan = client.post("/api/v1/plan", json={"scenario_id": "demo_city"}).json()
    ex = {e["id"]: e for e in plan["explanations"]}
    assert set(ex) == set(plan["action_ids"])
    assert ex["D03"]["necessary_in_plan"] is True and ex["D03"]["targets_exposed_without"] == ["pump1", "traffic1"]
    assert ex["D01"]["mandatory"] is True and ex["D01"]["necessary_in_plan"] is False
    assert not any("is necessary" in f for f in ex["D01"]["facts"])                    # no unsupported necessity claim
    assert any("mandatory" in f for f in ex["D01"]["facts"])
    assert ex["D03"]["review"] and plan["solver_status"] == "OPTIMAL"
    assert "no cheaper plan exists" in " ".join(plan["outcome"])

def test_unproven_status_is_never_described_as_optimal():
    plan = client.post("/api/v1/plan", json={"scenario_id": "demo_city", "max_nodes": 1}).json()
    text = " ".join(plan["outcome"])
    assert plan["solver_status"] == "FEASIBLE_NOT_PROVEN"
    assert "NOT proven" in text and "budget" in text and "no cheaper plan exists" not in text

# ---- import -----------------------------------------------------------------------------------------
def test_valid_import_previews_and_runs_the_normal_pipeline_without_touching_built_ins():
    before = client.get("/api/v1/scenarios").json()
    res = client.post("/api/v1/scenarios/validate", json={"scenario": canonical()})
    assert res.status_code == 200 and res.json()["valid"] and len(res.json()["graph"]["nodes"]) == 6
    inline = canonical(); inline["id"] = "my_copy"
    plan = client.post("/api/v1/plan", json={"scenario": inline, "max_nodes": 1000}).json()
    assert (plan["solver_status"], plan["action_ids"], plan["total_cost_dh"], plan["verification"]["verdict"]) == ("OPTIMAL", ["A01", "A02", "A03", "A04"], 200, "VERIFIED")
    assert client.post("/api/v1/graph", json={"scenario": inline, "action_ids": plan["action_ids"]}).json()["reachable_targets"] == []
    assert client.post("/api/v1/verify", json={"scenario": inline, "action_ids": ["A01"]}).json()["verdict"] == "REJECTED"
    assert client.get("/api/v1/scenarios").json() == before                                  # nothing stored or changed
    assert client.get("/api/v1/scenarios/my_copy").status_code == 404
    assert client.get("/api/v1/health").json()["scenarios_loaded"] == 2

def test_invalid_imports_are_rejected_with_paths_and_no_internals():
    bad = canonical(); bad["actions"][4]["params"]["rule_id"] = "NOPE"
    r = client.post("/api/v1/scenarios/validate", json={"scenario": bad}); body = r.json()
    assert r.status_code == 422 and body["error"]["details"][0]["path"].startswith("/actions")
    extra = canonical(); extra["surprise"] = 1
    assert client.post("/api/v1/scenarios/validate", json={"scenario": extra}).status_code == 422
    broken = canonical(); del broken["targets"]
    assert client.post("/api/v1/scenarios/validate", json={"scenario": broken}).status_code == 422
    for response in (r, client.post("/api/v1/scenarios/validate", content=b"{not json", headers={"content-type": "application/json"})):
        text = response.text
        assert "Traceback" not in text and "/Users/" not in text and ".py" not in text

def test_import_limits_size_and_nesting_are_enforced():
    big = canonical()
    for i in range(41): big["assets"].append({"id": f"x{i}", "name": "x", "zone": "INTERNET", "kind": "server", "services": [], "credentials": []})
    r = client.post("/api/v1/scenarios/validate", json={"scenario": big})
    assert r.status_code == 422 and r.json()["error"]["code"] == "IMPORT_LIMIT_EXCEEDED"
    huge = canonical(); huge["description"] = "x" * (300 * 1024)
    assert client.post("/api/v1/scenarios/validate", json={"scenario": huge}).status_code == 413
    nested = client.post("/api/v1/scenarios/validate", content=b'{"scenario":' + b"[" * 100000 + b"]" * 100000 + b"}", headers={"content-type": "application/json"})
    assert nested.status_code in (400, 422)
    inline = canonical()
    assert client.post("/api/v1/plan", json={"scenario": inline, "max_nodes": 1001}).status_code == 422   # import search budget cap
    assert client.post("/api/v1/plan", json={"scenario_id": "demo_city", "scenario": inline}).status_code == 422
    assert client.post("/api/v1/plan", json={}).status_code == 422

# ---- PDF ----------------------------------------------------------------------------------------------
def test_pdf_for_a_verified_plan_has_the_real_numbers_and_all_sections():
    r = client.post("/api/v1/report", json={"scenario_id": "demo_city"})
    pdf = r.content
    assert r.status_code == 200 and r.headers["content-type"] == "application/pdf" and pdf.startswith(b"%PDF") and pages(pdf) >= 4
    for needle in (b"105 dh", b"(OPTIMAL)", b"(VERIFIED)", b"Network comparison", b"D03 - Harden jump host", b"Verification and evidence", b"Page 1 of", b"signature"):
        assert needle in pdf, needle
    assert b"sha256:" in pdf

def test_pdf_never_labels_a_rejected_selection_as_verified():
    r = client.post("/api/v1/report", json={"scenario_id": "demo_city", "action_ids": ["D01", "D08", "D09", "D10"]})
    assert r.status_code == 200 and b"(REJECTED)" in r.content and b"(VERIFIED)" not in r.content and b"(USER_SELECTED)" in r.content
    assert client.post("/api/v1/report", json={"scenario_id": "demo_city", "action_ids": ["NOPE"]}).status_code == 422

def test_pdf_handles_hostile_long_and_unicode_text():
    s = canonical(); s["id"] = "hostile"
    s["name"] = "<b>X</b> & <script>alert(1)</script> 漢字 " + "N" * 600
    s["description"] = "D" * 6000; s["actions"][0]["description"] = "<i>Patch</i> \x00\x07 " + "W" * 3000
    r = client.post("/api/v1/report", json={"scenario": s, "max_nodes": 1000})
    assert r.status_code == 200 and r.content.startswith(b"%PDF") and b"<b>X</b>" in r.content        # shown literally, not interpreted
    assert b"\x00\x07" not in r.content and len(r.content) < 400_000

def test_report_builds_without_a_plan_or_graph_data():
    from chokepoint.report.pdf import build_report
    from chokepoint.scenario.loader import load_path
    s = load_path(ROOT / "scenarios/canonical_city.json")
    res = {"solver_status": "INFEASIBLE_PROVEN", "method": "exact", "action_ids": [], "total_cost_dh": 0, "action_count": 0, "proof": {}, "limitations": []}
    pdf = build_report(s, res, app_module.graph_response(s, []), None, None, [], ["No plan."])
    assert pdf.startswith(b"%PDF") and b"No plan was produced" in pdf and b"(VERIFIED)" not in pdf
