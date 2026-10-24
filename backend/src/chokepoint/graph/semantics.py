from __future__ import annotations
from dataclasses import dataclass
from chokepoint.domain.models import Scenario

@dataclass(frozen=True)
class Reason:
    type: str
    service_id: str
    port: int
    finding_id: str | None
    rule_ids: tuple[str, ...]

def effects(scn: Scenario, action_ids: frozenset[str]):
    patched=set(); removed=set(); restricted=set(); vaulted=set()
    for aid in action_ids:
        a=scn.actions_by_id[aid]
        if a.kind=="patch_finding": patched.add((a.params["asset_id"],a.params["finding_id"]))
        elif a.kind=="remove_rule": removed.add(a.params["rule_id"])
        elif a.kind=="restrict_rule": restricted.add(a.params["rule_id"])
        elif a.kind=="vault_credentials": vaulted.add(a.params["asset_id"])
    return patched, removed, restricted, vaulted

def _match(scn, selector, asset_id):
    a=scn.assets_by_id[asset_id]
    return selector==asset_id or selector==a.zone

def required_set(scn, rule):
    return {(f.src,f.dst,f.port) for f in scn.required_flows if _match(scn,rule.src,f.src) and _match(scn,rule.dst,f.dst) and (rule.ports=="any" or f.port in rule.ports)}

def granting_rules(scn, src, dst, port, action_ids=frozenset()):
    _, removed, restricted, _ = effects(scn,action_ids)
    result=[]
    for r in scn.rules:
        if r.id in removed or not _match(scn,r.src,src) or not _match(scn,r.dst,dst) or (r.ports!="any" and port not in r.ports): continue
        if r.id in restricted and (src,dst,port) not in required_set(scn,r): continue
        result.append(r.id)
    return tuple(sorted(result))

def flow_permitted(scn, src, dst, port, action_ids=frozenset()):
    return bool(granting_rules(scn,src,dst,port,action_ids))

def edge_reasons(scn, src, dst, action_ids=frozenset()):
    if src==dst: return ()
    patched, _, _, vaulted=effects(scn,action_ids)
    dst_asset=scn.assets_by_id[dst]; src_asset=scn.assets_by_id[src]
    reasons=[]
    for service in dst_asset.services:
        granters=granting_rules(scn,src,dst,service.port,action_ids)
        if not granters: continue
        for finding_id in service.finding_ids:
            if (dst,finding_id) not in patched: reasons.append(Reason("exploit",service.id,service.port,finding_id,granters))
        if src not in vaulted and any(c.target_asset==dst and c.service_id==service.id for c in src_asset.credentials):
            reasons.append(Reason("credential",service.id,service.port,None,granters))
    return tuple(sorted(reasons,key=lambda x:(x.type,x.service_id,x.finding_id or "",x.rule_ids)))

def graph(scn, action_ids=frozenset()):
    return {(s,t):edge_reasons(scn,s,t,action_ids) for s in scn.assets_by_id for t in scn.assets_by_id if s!=t and edge_reasons(scn,s,t,action_ids)}

def reachable(scn, action_ids=frozenset()):
    g=graph(scn,action_ids); seen=set(scn.origins); queue=list(scn.origins)
    while queue:
        s=queue.pop(0)
        for (src,dst) in sorted(g):
            if src==s and dst not in seen: seen.add(dst); queue.append(dst)
    return seen

def witness(scn, action_ids=frozenset()):
    g=graph(scn,action_ids); seen=set(scn.origins); parent={}; queue=list(sorted(scn.origins))
    while queue:
        s=queue.pop(0)
        if s in scn.targets:
            path=[s]
            while path[-1] in parent: path.append(parent[path[-1]])
            return list(reversed(path))
        for _,dst in sorted((e for e in g if e[0]==s),key=lambda e:e[1]):
            if dst not in seen: seen.add(dst); parent[dst]=s; queue.append(dst)
    return None

def reasons_reachable(scn, action_ids=frozenset()):
    reach=reachable(scn,action_ids); return sum(len(rs) for (src,_),rs in graph(scn,action_ids).items() if src in reach)
