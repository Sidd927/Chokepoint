from .semantics import fixpoint, flow_ok, granters, path
from .fingerprint import scenario_fingerprint
from .receipt import build_receipt

def verify(raw, action_ids, claimed_total_cost_dh=None, claimed_solver_status=None):
    actions={a["id"]:a for a in raw.get("actions",[])}; ids=list(action_ids); known=all(x in actions for x in ids); unique=len(ids)==len(set(ids));
    checks=[]; violations=[]
    well=all(k in raw for k in ("assets","rules","required_flows","origins","targets","actions"))
    checks.append({"code":"SCENARIO_WELL_FORMED","passed":well,"detail":"basic raw scenario validation"})
    def add(code,passed,detail): checks.append({"code":code,"passed":passed,"detail":detail}); (violations.append({"code":code,"detail":detail}) if not passed else None)
    if not well:
        for code in ["PLAN_IDS_KNOWN","PLAN_IDS_UNIQUE","PLAN_NO_EXCLUSIONS","PLAN_HAS_MANDATORY","COST_RECOMPUTED","COST_CLAIM_MATCHES","COST_CAP_RESPECTED","FLOWS_PRESERVED","TARGETS_UNREACHABLE"]: add(code,False,"skipped: scenario not well-formed")
        return {"verdict":"REJECTED","checks":sorted(checks,key=lambda x:x["code"]),"violations":violations,"evidence":{},"receipt":None}
    add("PLAN_IDS_KNOWN",known,"unknown action id" if not known else "all action ids known")
    add("PLAN_IDS_UNIQUE",unique,"duplicate action id" if not unique else "action ids unique")
    selected=[actions[x] for x in ids if x in actions]
    ex_ok=not any(set(a.get("excludes",[]))&set(b["id"] for b in selected) for a in selected)
    add("PLAN_NO_EXCLUSIONS",ex_ok,"mutual exclusion present" if not ex_ok else "no exclusions")
    mand_ok=all(a["id"] in ids for a in raw["actions"] if a.get("mandatory"))
    add("PLAN_HAS_MANDATORY",mand_ok,"mandatory action missing" if not mand_ok else "mandatory actions included")
    cost=sum(a["effort_dh"]+2*a["downtime_dh"] for a in selected)
    checks.append({"code":"COST_RECOMPUTED","passed":True,"detail":str(cost)})
    add("COST_CLAIM_MATCHES",claimed_total_cost_dh is None or claimed_total_cost_dh==cost,"claimed cost does not match" if claimed_total_cost_dh is not None and claimed_total_cost_dh!=cost else "claim matches")
    cap=raw.get("policy",{}).get("max_cost_dh"); add("COST_CAP_RESPECTED",cap is None or cost<=cap,"cost cap exceeded" if cap is not None and cost>cap else "cap respected")
    before,parent_before=fixpoint(raw,set()); after,parent_after=fixpoint(raw,set(ids))
    flow_details=[{"id":f["id"],"permitted":flow_ok(raw,f,set(ids)),"granting_rule_ids":granters(raw,f["src"],f["dst"],f["port"],set(ids))} for f in raw["required_flows"]]
    broken=[f["id"] for f in flow_details if not f["permitted"]]; add("FLOWS_PRESERVED",not broken,"broken flows: "+",".join(broken) if broken else "all required flows permitted")
    reachable_targets=sorted(set(raw["targets"])&after); add("TARGETS_UNREACHABLE",not reachable_targets,"reachable targets: "+",".join(reachable_targets) if reachable_targets else "no target reachable")
    verdict="VERIFIED" if all(x["passed"] for x in checks if x["code"]!="COST_RECOMPUTED") else "REJECTED"
    evidence={"before":{"reachable_assets":sorted(before),"reachable_targets":sorted(set(raw["targets"])&before),"witness_paths":{x:path(parent_before,x) for x in sorted(set(raw["targets"])&before)}},"after":{"reachable_assets":sorted(after),"reachable_targets":reachable_targets,"witness_paths":{x:path(parent_after,x) for x in reachable_targets}},"redundant_actions":[],"cost":{"recomputed_total_cost_dh":cost,"breakdown":[{"id":a["id"],"cost_dh":a["effort_dh"]+2*a["downtime_dh"]} for a in sorted(selected,key=lambda x:x["id"])]}}
    receipt=build_receipt(raw,ids,cost,claimed_solver_status,verdict,checks,reachable_targets,broken,violations)
    return {"verdict":verdict,"checks":sorted(checks,key=lambda x:x["code"]),"violations":sorted(violations,key=lambda x:(x["code"],x["detail"])),"evidence":evidence,"receipt":receipt}
