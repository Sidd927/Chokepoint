from .canonical import canonical_bytes
from .fingerprint import scenario_fingerprint
import hashlib
def build_receipt(raw, ids, cost, status, verdict, checks, targets, flows, violations, *, flow_details=None):
    raw_actions = raw.get("actions", []) if isinstance(raw, dict) else []
    selected = {a["id"]: a for a in raw_actions if isinstance(a, dict) and type(a.get("id")) is str and a["id"] in ids}
    safe_ids = sorted(selected)
    # Receipt check entries are intentionally the signed code/pass surface only.
    receipt_checks = [{"code": x.get("code"), "passed": x.get("passed")} for x in checks]
    verification = {
        "status": verdict,
        "checks": sorted(receipt_checks, key=lambda x: x["code"]),
        "targets_reachable_after": sorted(targets),
        "flows_broken": sorted(flows),
        "violations": sorted(violations, key=lambda x: (x["code"], x["detail"])),
    }
    if flow_details is not None:
        verification["flow_evidence"] = [
            {"id": f["id"], "permitted": bool(f["permitted"]), "granting_rule_ids": sorted(f["granting_rule_ids"])}
            for f in flow_details
        ]
    r = {
        "schema": "chokepoint.receipt/1",
        "verifier": "chokepoint-verifier/1",
        "scenario_id": raw.get("id") if isinstance(raw, dict) else None,
        "scenario_fingerprint": scenario_fingerprint(raw),
        "action_ids": safe_ids,
        "action_costs": [{"id": x, "cost_dh": selected[x]["effort_dh"] + 2 * selected[x]["downtime_dh"]} for x in safe_ids],
        "total_cost_dh": cost,
        "action_count": len(safe_ids),
        "claimed_solver_status": status,
        "verification": verification,
    }
    r["receipt_fingerprint"] = "sha256:" + hashlib.sha256(canonical_bytes(r)).hexdigest()
    return r
