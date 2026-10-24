from .canonical import canonical_bytes
from .fingerprint import scenario_fingerprint
import hashlib
def build_receipt(raw,ids,cost,status,verdict,checks,targets,flows,violations):
    selected={a["id"]:a for a in raw.get("actions",[]) if a["id"] in ids}
    r={"schema":"chokepoint.receipt/1","verifier":"chokepoint-verifier/1","scenario_id":raw.get("id"),"scenario_fingerprint":scenario_fingerprint(raw),"action_ids":sorted(ids),"action_costs":[{"id":x,"cost_dh":selected[x]["effort_dh"]+2*selected[x]["downtime_dh"]} for x in sorted(selected)],"total_cost_dh":cost,"action_count":len(ids),"claimed_solver_status":status,"verification":{"status":verdict,"checks":sorted(checks,key=lambda x:x["code"]),"targets_reachable_after":sorted(targets),"flows_broken":sorted(flows),"violations":sorted(violations,key=lambda x:(x["code"],x["detail"]))}}
    r["receipt_fingerprint"]="sha256:"+hashlib.sha256(canonical_bytes(r)).hexdigest(); return r
