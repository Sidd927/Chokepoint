from .semantics import fixpoint, flow_ok, granters, path
from .fingerprint import scenario_fingerprint
from .receipt import build_receipt
from .parse import validate_raw

def verify(raw, action_ids, claimed_total_cost_dh=None, claimed_solver_status=None):
    checks=[]; violations=[]
    well=validate_raw(raw)
    checks.append({"code":"SCENARIO_WELL_FORMED","passed":well,"detail":"independent scenario validation"})
    if not well:
        violations.append({"code":"SCENARIO_WELL_FORMED","detail":"scenario failed independent validation"})
    def add(code,passed,detail): checks.append({"code":code,"passed":passed,"detail":detail}); (violations.append({"code":code,"detail":detail}) if not passed else None)
    if not well:
        for code in ["PLAN_IDS_KNOWN","PLAN_IDS_UNIQUE","PLAN_NO_EXCLUSIONS","PLAN_HAS_MANDATORY","COST_RECOMPUTED","COST_CLAIM_MATCHES","COST_CAP_RESPECTED","FLOWS_PRESERVED","TARGETS_UNREACHABLE"]: add(code,False,"skipped: scenario not well-formed")
        return {"verdict":"REJECTED","checks":sorted(checks,key=lambda x:x["code"]),"violations":violations,"evidence":{},"receipt":None}
    # Keep malformed plan containers as failures rather than coercing them to [] and
    # accidentally accepting a zero-action plan.  Only valid string IDs participate
    # in semantic calculations, and each ID is charged at most once.
    raw_actions=raw["actions"]
    actions={a["id"]:a for a in raw_actions}
    ids=list(action_ids) if type(action_ids) is list else []
    ids_are_strings=type(action_ids) is list and all(type(x) is str for x in ids)
    known=ids_are_strings and all(x in actions for x in ids)
    unique=ids_are_strings and len(ids)==len(set(ids))
    add("PLAN_IDS_KNOWN",known,"unknown action id" if not known else "all action ids known")
    add("PLAN_IDS_UNIQUE",unique,"duplicate action id" if not unique else "action ids unique")
    selected_ids=[]
    for x in ids:
        if type(x) is str and x in actions and x not in selected_ids:
            selected_ids.append(x)
    selected=[actions[x] for x in selected_ids]
    selected_set=set(selected_ids)
    exclusions={a["id"]: set(a["excludes"]) for a in raw_actions}
    for aid, excluded in list(exclusions.items()):
        for other in excluded:
            exclusions.setdefault(other, set()).add(aid)
    ex_ok=ids_are_strings and known and not any(exclusions[x] & selected_set for x in selected_ids)
    add("PLAN_NO_EXCLUSIONS",ex_ok,"mutual exclusion present" if not ex_ok else "no exclusions")
    mand_ok=ids_are_strings and all(a["id"] in selected_set for a in raw["actions"] if a["mandatory"])
    add("PLAN_HAS_MANDATORY",mand_ok,"mandatory action missing" if not mand_ok else "mandatory actions included")
    cost=sum(a["effort_dh"]+2*a["downtime_dh"] for a in selected)
    checks.append({"code":"COST_RECOMPUTED","passed":ids_are_strings and known,"detail":str(cost) if ids_are_strings and known else "cannot recompute malformed plan"})
    add("COST_CLAIM_MATCHES",claimed_total_cost_dh is None or claimed_total_cost_dh==cost,"claimed cost does not match" if claimed_total_cost_dh is not None and claimed_total_cost_dh!=cost else "claim matches")
    cap=raw.get("policy",{}).get("max_cost_dh"); add("COST_CAP_RESPECTED",cap is None or cost<=cap,"cost cap exceeded" if cap is not None and cost>cap else "cap respected")
    before,parent_before=fixpoint(raw,set()); after,parent_after=fixpoint(raw,set(selected_ids))
    flow_details=[{"id":f["id"],"permitted":flow_ok(raw,f,selected_set),"granting_rule_ids":granters(raw,f["src"],f["dst"],f["port"],selected_set)} for f in raw["required_flows"]]
    broken=[f["id"] for f in flow_details if not f["permitted"]]; add("FLOWS_PRESERVED",not broken,"broken flows: "+",".join(broken) if broken else "all required flows permitted")
    reachable_targets=sorted(set(raw["targets"])&after); add("TARGETS_UNREACHABLE",not reachable_targets,"reachable targets: "+",".join(reachable_targets) if reachable_targets else "no target reachable")
    verdict="VERIFIED" if all(x["passed"] for x in checks if x["code"]!="COST_RECOMPUTED") else "REJECTED"
    redundant=[]
    for a in sorted(selected,key=lambda x:x["id"]):
        if a.get("mandatory"): continue
        reduced=set(selected_ids); reduced.discard(a["id"]); reduced_after,_=fixpoint(raw,reduced)
        redundant.append({"id":a["id"],"redundant":not (set(raw["targets"])&reduced_after),"warning":"REDUNDANT_ACTION" if not (set(raw["targets"])&reduced_after) else None})
    evidence={"before":{"reachable_assets":sorted(before),"reachable_targets":sorted(set(raw["targets"])&before),"witness_paths":{x:path(parent_before,x) for x in sorted(set(raw["targets"])&before)}},"after":{"reachable_assets":sorted(after),"reachable_targets":reachable_targets,"witness_paths":{x:path(parent_after,x) for x in reachable_targets}},"flows":flow_details,"redundant_actions":redundant,"cost":{"recomputed_total_cost_dh":cost,"breakdown":[{"id":a["id"],"cost_dh":a["effort_dh"]+2*a["downtime_dh"]} for a in sorted(selected,key=lambda x:x["id"])]}}
    receipt=build_receipt(raw,selected_ids,cost,claimed_solver_status,verdict,checks,reachable_targets,broken,violations,flow_details=flow_details)
    return {"verdict":verdict,"checks":sorted(checks,key=lambda x:x["code"]),"violations":sorted(violations,key=lambda x:(x["code"],x["detail"])),"evidence":evidence,"receipt":receipt}
