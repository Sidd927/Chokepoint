import copy
import json
from pathlib import Path

import pytest

from chokepoint.domain.errors import ScenarioError
from chokepoint.scenario.validate import parse_scenario
from chokepoint_verifier.checks import verify
from chokepoint_verifier.parse import validate_raw


ROOT = Path(__file__).parents[1]


def scenario():
    return json.loads((ROOT / "scenarios/canonical_city.json").read_text())


@pytest.mark.parametrize(
    ("path", "value"),
    [
        (("zones", 0), []),
        (("assets", 0), "bad"),
        (("assets", 0, "services"), [None]),
        (("assets", 3, "credentials"), [{"target_asset": [], "service_id": "http_admin"}]),
        (("rules", 0), {"id": "R1", "src": [], "dst": "portal_gw", "ports": [443], "label": "x"}),
        (("required_flows", 0, "port"), True),
        (("actions", 0, "params"), {"asset_id": "portal_gw", "finding_id": []}),
    ],
)
def test_core_rejects_nested_malformed_values_with_scenario_error(path, value):
    raw = scenario()
    cursor = raw
    for key in path[:-1]:
        cursor = cursor[key]
    cursor[path[-1]] = value
    with pytest.raises(ScenarioError) as error:
        parse_scenario(raw)
    assert error.value.path.startswith("/") or error.value.path == ""


def test_core_closes_asymmetric_exclusions_without_mutating_raw_fingerprint_document():
    raw = scenario()
    raw["actions"][0]["excludes"] = ["A02"]
    parsed = parse_scenario(raw)
    assert parsed.actions_by_id["A02"].excludes == ("A01",)
    assert parsed.raw["actions"][0]["excludes"] == ["A02"]
    assert validate_raw(raw)


@pytest.mark.parametrize(
    "mutate",
    [
        lambda r: r["assets"][0].update(extra=True),
        lambda r: r["actions"][0].update(effort_dh=1.0),
        lambda r: r["assets"][1]["services"][0].update(port=65536),
        lambda r: r["findings"][0].update(description="bad\ud800"),
        lambda r: r["actions"][0]["params"].update(finding_id="SYN-004"),
    ],
)
def test_independent_raw_validator_rejects_adversarial_documents(mutate):
    raw = scenario()
    mutate(raw)
    assert validate_raw(raw) is False


def test_verifier_returns_all_checks_and_scenario_violation_for_malformed_raw():
    raw = scenario()
    raw["actions"] = {"not": "a list"}
    result = verify(raw, [])
    assert result["verdict"] == "REJECTED"
    assert len(result["checks"]) == 10
    assert {check["code"] for check in result["checks"]} == {
        "SCENARIO_WELL_FORMED", "PLAN_IDS_KNOWN", "PLAN_IDS_UNIQUE", "PLAN_NO_EXCLUSIONS",
        "PLAN_HAS_MANDATORY", "COST_RECOMPUTED", "COST_CLAIM_MATCHES", "COST_CAP_RESPECTED",
        "FLOWS_PRESERVED", "TARGETS_UNREACHABLE",
    }
    assert any(v["code"] == "SCENARIO_WELL_FORMED" for v in result["violations"])


@pytest.mark.parametrize("bad_ids", [None, "A01", ["A01", []], ["A01", "A01"]])
def test_verifier_rejects_malformed_or_duplicate_plan_containers(bad_ids):
    result = verify(scenario(), bad_ids)
    assert result["verdict"] == "REJECTED"
    assert any(v["code"] in {"PLAN_IDS_KNOWN", "PLAN_IDS_UNIQUE"} for v in result["violations"])


def test_duplicate_plan_ids_are_charged_once_in_evidence():
    raw = scenario()
    result = verify(raw, ["A01", "A01"])
    assert result["evidence"]["cost"]["recomputed_total_cost_dh"] == 50
    assert len(result["evidence"]["cost"]["breakdown"]) == 1
