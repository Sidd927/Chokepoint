from __future__ import annotations
from chokepoint.graph.semantics import flow_permitted, witness, reasons_reachable
from .result import SolveResult

BASE_LIMITATIONS=["modelled (not live) network","optimality relative to the catalogue","verification is not optimality"]

def _cost(scn,S): return sum(scn.actions_by_id[x].cost_dh for x in S)
def _conflicts(scn,S):
    out=[]; amap=scn.actions_by_id
    if any(not flow_permitted(scn,f.src,f.dst,f.port,S) for f in scn.required_flows): out.append({"code":"MANDATORY_BREAKS_FLOW","action_ids":sorted(S)})
    if any(set(amap[x].excludes)&set(S) for x in S): out.append({"code":"MANDATORY_EXCLUSION","action_ids":sorted(S)})
    if scn.max_cost_dh is not None and _cost(scn,S)>scn.max_cost_dh: out.append({"code":"MANDATORY_EXCEEDS_COST_CAP","action_ids":sorted(S)})
    return out
def candidates(scn,S,W):
    result=set(); amap=scn.actions_by_id
    for left,right in zip(W,W[1:]):
        for reason in __import__('chokepoint.graph.semantics',fromlist=['edge_reasons']).edge_reasons(scn,left,right,S):
            for a in scn.actions:
                if a.id in S or set(a.excludes)&set(S): continue
                if reason.type=="exploit" and a.kind=="patch_finding" and a.params=={"asset_id":right,"finding_id":reason.finding_id}: result.add(a.id)
                if reason.type=="credential" and a.kind=="vault_credentials" and a.params=={"asset_id":left}: result.add(a.id)
                if a.kind in {"remove_rule","restrict_rule"} and a.params.get("rule_id") in reason.rule_ids: result.add(a.id)
    return result
def greedy(scn, max_nodes=0, method="greedy"):
    M=frozenset(a.id for a in scn.actions if a.mandatory); conflicts=_conflicts(scn,M)
    if conflicts: return SolveResult("INFEASIBLE_POLICY_CONFLICT", "none", [],0,0,{"cost_dh":0,"action_count":0,"action_ids":[]},{"exhaustive":False,"nodes_evaluated":0,"max_nodes":max_nodes,"budget_exhausted":False},conflicts,BASE_LIMITATIONS+["policy conflict"])
    S=M
    while True:
        if any(not flow_permitted(scn,f.src,f.dst,f.port,S) for f in scn.required_flows): break
        W=witness(scn,S)
        if W is None:
            ids=sorted(S); c=_cost(scn,S); return SolveResult("FEASIBLE_NOT_PROVEN",method,ids,c,len(ids),{"cost_dh":c,"action_count":len(ids),"action_ids":ids},{"exhaustive":False,"nodes_evaluated":0,"max_nodes":max_nodes,"budget_exhausted":False},[],BASE_LIMITATIONS+["heuristic result; not proven optimal"])
        base=reasons_reachable(scn,S); choices=[]
        for aid in candidates(scn,S,W):
            T=S|{aid}
            if any(not flow_permitted(scn,f.src,f.dst,f.port,T) for f in scn.required_flows): continue
            if scn.max_cost_dh is not None and _cost(scn,T)>scn.max_cost_dh: continue
            gain=base-reasons_reachable(scn,T)
            if gain>0:
                a=scn.actions_by_id[aid]; choices.append((gain,a.cost_dh+1,a.cost_dh,aid))
        if not choices: return SolveResult("NO_PLAN_FOUND_HEURISTIC",method,[],0,0,{"cost_dh":0,"action_count":0,"action_ids":[]},{"exhaustive":False,"nodes_evaluated":0,"max_nodes":max_nodes,"budget_exhausted":method=="greedy_fallback"},[],BASE_LIMITATIONS+["heuristic stalled; this does not prove infeasibility"])
        choices.sort(key=lambda x:(-x[0]*x[1],x[2],x[3])); S=frozenset(set(S)|{choices[0][3]})

def solve_exact(scn,max_nodes):
    M=frozenset(a.id for a in scn.actions if a.mandatory); conflicts=_conflicts(scn,M)
    if conflicts: return SolveResult("INFEASIBLE_POLICY_CONFLICT","none",[],0,0,{"cost_dh":0,"action_count":0,"action_ids":[]},{"exhaustive":False,"nodes_evaluated":0,"max_nodes":max_nodes,"budget_exhausted":False},conflicts,BASE_LIMITATIONS+["policy conflict"])
    stack=[M]; seen=set(); nodes=0; incumbent=None
    while stack:
        S=stack.pop()
        if S in seen: continue
        if nodes==max_nodes:
            if incumbent is not None:
                ids=sorted(incumbent); c=_cost(scn,incumbent); return SolveResult("FEASIBLE_NOT_PROVEN","exact",ids,c,len(ids),{"cost_dh":c,"action_count":len(ids),"action_ids":ids},{"exhaustive":False,"nodes_evaluated":nodes,"max_nodes":max_nodes,"budget_exhausted":True},[],BASE_LIMITATIONS+["search budget exhausted; optimality not proven"])
            return greedy(scn,max_nodes,"greedy_fallback")
        seen.add(S); nodes+=1
        if any(not flow_permitted(scn,f.src,f.dst,f.port,S) for f in scn.required_flows): continue
        W=witness(scn,S)
        if W is None:
            if scn.max_cost_dh is None or _cost(scn,S)<=scn.max_cost_dh:
                if incumbent is None or (_cost(scn,S),len(S),tuple(sorted(S)))<(_cost(scn,incumbent),len(incumbent),tuple(sorted(incumbent))): incumbent=S
            continue
        C=candidates(scn,S,W)
        if not C: continue
        lb=_cost(scn,S)+min(scn.actions_by_id[x].cost_dh for x in C)
        if scn.max_cost_dh is not None and lb>scn.max_cost_dh: continue
        if incumbent is not None and (lb,len(S)+1)>( _cost(scn,incumbent),len(incumbent)): continue
        for aid in reversed(sorted(C,key=lambda x:(scn.actions_by_id[x].cost_dh,x))): stack.append(frozenset(set(S)|{aid}))
    if incumbent is None: return SolveResult("INFEASIBLE_PROVEN","exact",[],0,0,{"cost_dh":0,"action_count":0,"action_ids":[]},{"exhaustive":True,"nodes_evaluated":nodes,"max_nodes":max_nodes,"budget_exhausted":False},[],BASE_LIMITATIONS+["no feasible subset exists in the catalogue"])
    ids=sorted(incumbent); c=_cost(scn,incumbent); return SolveResult("OPTIMAL","exact",ids,c,len(ids),{"cost_dh":c,"action_count":len(ids),"action_ids":ids},{"exhaustive":True,"nodes_evaluated":nodes,"max_nodes":max_nodes,"budget_exhausted":False},[],BASE_LIMITATIONS+["exact search completed"])
