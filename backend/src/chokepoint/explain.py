"""Deterministic, evidence-backed explanations for a returned plan.

Three kinds of statements are kept apart:
  facts      - computed with the same graph engine the solver uses (or taken from the scenario file)
  inference  - reasoning offered to the reader that no code establishes as a requirement
  review     - suggested human checks before any real-world change
"""
from __future__ import annotations
from chokepoint.graph.semantics import graph, reachable, granting_rules, required_set

STATUS_TEXT = {
    "OPTIMAL": "The exact search finished within its budget. Under this model and objective (lowest total cost, then fewest actions, then action IDs) no cheaper plan exists in the catalogue.",
    "FEASIBLE_NOT_PROVEN": "A plan that blocks every modelled route and keeps required flows was found, but optimality is NOT proven. A cheaper plan may exist.",
    "INFEASIBLE_PROVEN": "The exact search finished and no combination of catalogue actions blocks every route while keeping required flows.",
    "INFEASIBLE_POLICY_CONFLICT": "The scenario's mandatory actions conflict with its own constraints (for example they break a required flow), so no plan is possible.",
    "NO_PLAN_FOUND_HEURISTIC": "The heuristic stalled without a plan. This does not prove that no plan exists.",
    "USER_SELECTED": "These actions were chosen by a person, not by the solver. Nothing is claimed about their cost relative to alternatives.",
}

def explain_status(status: str, method: str | None, proof: dict | None) -> list[str]:
    proof = proof or {}
    points = [STATUS_TEXT.get(status, "The solver returned an unrecognised status; no interpretation is offered.")]
    if proof.get("budget_exhausted"):
        points.append(f"The search budget ({proof.get('max_nodes')} states) was exhausted before the search could finish, so optimality could not be established.")
    if method == "greedy_fallback":
        points.append("Because the budget ran out before any complete plan was found, the greedy heuristic produced this plan.")
    elif method == "greedy":
        points.append("The greedy heuristic repeatedly adds the action that removes the most modelled connections per unit cost. It never proves optimality.")
    if proof.get("nodes_evaluated") is not None and method == "exact":
        points.append(f"The search evaluated {proof['nodes_evaluated']} candidate action sets (exhaustive: {bool(proof.get('exhaustive'))}).")
    return points

def explain_outcome(status, method, proof, verification, before, after, cost, count):
    points = explain_status(status, method, proof)
    if verification is not None:
        verdict = verification.get("verdict")
        points.append(f"Independent verifier verdict: {verdict}. The verifier re-derives reachability, flows and costs from the raw scenario; it does not prove optimality and says nothing about a real network.")
        failed = [c["code"] for c in verification.get("checks", []) if not c["passed"]]
        if failed:
            points.append("Failed checks: " + ", ".join(sorted(failed)) + ".")
    if before is not None and after is not None:
        points.append(f"In the model, critical targets reachable go from {len(before['reachable_targets'])} to {len(after['reachable_targets'])}, "
                      f"modelled attack connections from {len(before['edges'])} to {len(after['edges'])}, and "
                      f"{sum(1 for f in after['flows'] if f['permitted'])} of {len(after['flows'])} required flows remain permitted. Total planning cost: {cost} dh across {count} actions.")
    return points

def _name(s, asset_id):
    a = s.assets_by_id.get(asset_id)
    return a.name if a else asset_id

def explain_actions(s, action_ids: list[str]) -> list[dict]:
    plan = frozenset(action_ids)
    base_edges = set(graph(s))
    out = []
    for aid in sorted(plan):
        a = s.actions_by_id[aid]
        p = a.params
        facts, inference, review = [], [], []
        alone_removed = len(base_edges - set(graph(s, frozenset({aid}))))
        exposed = sorted(set(s.targets) & reachable(s, plan - {aid}))
        necessary = bool(exposed)
        target = {"asset_id": p.get("asset_id"), "asset_name": _name(s, p["asset_id"]) if p.get("asset_id") else None,
                  "finding_id": p.get("finding_id"), "finding_title": None, "rule_id": p.get("rule_id"), "rule_label": None}
        if a.kind == "patch_finding":
            f = s.findings_by_id.get(p["finding_id"]); target["finding_title"] = f.title if f else None
            facts.append(f"Patches finding {p['finding_id']}{' (' + f.title + ')' if f else ''} on {target['asset_name']}, removing the modelled exploit connections that rely on it.")
            review.append(f"Confirm with the owner of {target['asset_name']} that a fix for {p['finding_id']} exists and can be applied in a maintenance window.")
        elif a.kind == "vault_credentials":
            facts.append(f"Vaults credentials stored on {target['asset_name']}, removing modelled credential-reuse connections that start from it.")
            review.append(f"Confirm which services use the credentials stored on {target['asset_name']} before moving them into a vault.")
        elif a.kind in ("remove_rule", "restrict_rule"):
            r = s.rules_by_id.get(p["rule_id"]); target["rule_label"] = r.label if r else None
            granted = [fl.id for fl in s.required_flows if p["rule_id"] in granting_rules(s, fl.src, fl.dst, fl.port)]
            sole = [fl.id for fl in s.required_flows if granting_rules(s, fl.src, fl.dst, fl.port) == (p["rule_id"],)]
            if a.kind == "remove_rule":
                facts.append(f"Removes firewall rule {p['rule_id']}{' (' + r.label + ')' if r else ''}.")
            else:
                kept = [fl.id for fl in s.required_flows if (fl.src, fl.dst, fl.port) in required_set(s, r)] if r else []
                facts.append(f"Narrows firewall rule {p['rule_id']}{' (' + r.label + ')' if r else ''} so it only grants the required flows it matches"
                             + (f" ({', '.join(kept)})." if kept else "; no required flow matches it, so it grants nothing after the change."))
                if sole:
                    facts.append(f"Checked: required flow(s) {', '.join(sole)} are granted only by this rule in the unmodified model, so removing it outright would break them.")
                    inference.append("Narrowing rather than removing is consistent with keeping those flows, but the solver did not record that as its reason.")
            if granted:
                facts.append(f"Required flow(s) currently granted by this rule: {', '.join(granted)}.")
            review.append(f"Confirm with the firewall owner what else depends on rule {p['rule_id']}; the model only knows the required flows listed in the scenario.")
        facts.append(f"Applied on its own it removes {alone_removed} of {len(base_edges)} modelled attack connections.")
        if a.mandatory:
            facts.append("Marked mandatory by the scenario, so every plan includes it.")
        if necessary:
            facts.append(f"Within this plan it is necessary: removing only this action leaves {', '.join(_name(s, t) for t in exposed)} reachable.")
        else:
            facts.append("Removing only this action from the plan would still leave every critical target unreachable in the model, so the model does not show it as individually necessary for blocking targets.")
            if not a.mandatory:
                inference.append("The solver included it anyway; the available evidence does not explain why (it may be an artefact of a heuristic result).")
        review.append(f"Planning cost is {a.cost_dh} dh (effort {a.effort_dh} + 2 x downtime {a.downtime_dh}); validate against real effort and downtime with an authorized system owner.")
        out.append({"id": a.id, "kind": a.kind, "description": a.description, "cost_dh": a.cost_dh, "effort_dh": a.effort_dh, "downtime_dh": a.downtime_dh,
                    "mandatory": a.mandatory, "target": target, "necessary_in_plan": necessary, "targets_exposed_without": exposed,
                    "attack_connections_removed_alone": alone_removed, "facts": facts, "inference": inference, "review": review})
    return out
