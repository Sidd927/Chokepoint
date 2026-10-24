from fastapi.testclient import TestClient
import json
from pathlib import Path
from chokepoint.api.app import app

client=TestClient(app)
def test_health_and_scenarios():
    assert client.get("/api/v1/health").status_code==200
    data=client.get("/api/v1/scenarios").json(); assert {x["id"] for x in data["scenarios"]}>={"canonical_city","demo_city"}
def test_api_plan_and_verify():
    r=client.post("/api/v1/plan",json={"scenario_id":"canonical_city","max_nodes":200000})
    assert r.status_code==200; body=r.json(); assert body["solver_status"]=="OPTIMAL"; assert body["verification"]["verdict"]=="VERIFIED"
    v=client.post("/api/v1/verify",json={"scenario_id":"canonical_city","action_ids":body["action_ids"],"claimed_total_cost_dh":body["total_cost_dh"]})
    assert v.status_code==200 and v.json()["verdict"]=="VERIFIED"
def test_not_found(): assert client.get("/api/v1/scenarios/nope").status_code==404
def test_openapi_export_is_current():
    expected=json.loads((Path(__file__).parents[2]/"docs/openapi.json").read_text())
    assert expected==app.openapi()
def test_plan_determinism_ignores_generated_at():
    a=client.post("/api/v1/plan",json={"scenario_id":"canonical_city","max_nodes":200000}).json()
    b=client.post("/api/v1/plan",json={"scenario_id":"canonical_city","max_nodes":200000}).json()
    a.pop("generated_at"); b.pop("generated_at")
    assert a==b
