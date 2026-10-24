"""Independent exhaustive oracle: stdlib only and never imports product code."""
import itertools

def _asset(raw, aid):
    return next(a for a in raw["assets"] if a["id"] == aid)

def _match(raw, selector, aid):
    return selector == aid or selector == _asset(raw, aid)["zone"]

def _effects(raw, selected):
    patched, removed, restricted, vaulted = set(), set(), set(), set()
    for action in raw["actions"]:
        if action["id"] not in selected:
            continue
        params = action["params"]
        if action["kind"] == "patch_finding": patched.add((params["asset_id"], params["finding_id"]))
        elif action["kind"] == "remove_rule": removed.add(params["rule_id"])
        elif action["kind"] == "restrict_rule": restricted.add(params["rule_id"])
        elif action["kind"] == "vault_credentials": vaulted.add(params["asset_id"])
    return patched, removed, restricted, vaulted

def _rf(raw, rule):
    return {(f["src"], f["dst"], f["port"]) for f in raw["required_flows"] if _match(raw, rule["src"], f["src"]) and _match(raw, rule["dst"], f["dst"]) and (rule["ports"] == "any" or f["port"] in rule["ports"])}

def granting_rules(raw, src, dst, port, selected):
    _, removed, restricted, _ = _effects(raw, selected)
    result=[]
    for rule in raw["rules"]:
        if rule["id"] in removed or not _match(raw, rule["src"], src) or not _match(raw, rule["dst"], dst):
            continue
        if rule["ports"] != "any" and port not in rule["ports"]:
            continue
        if rule["id"] in restricted and (src, dst, port) not in _rf(raw, rule):
            continue
        result.append(rule["id"])
    return tuple(sorted(result))

def flow_ok(raw, flow, selected):
    return bool(granting_rules(raw, flow["src"], flow["dst"], flow["port"], selected))

def reachable(raw, selected):
    patched, _, _, vaulted = _effects(raw, selected)
    reachable=set(raw["origins"])
    changed=True
    while changed:
        changed=False
        for src in sorted(reachable):
            source=_asset(raw, src)
            for target in sorted(raw["assets"], key=lambda a:a["id"]):
                dst=target["id"]
                if dst in reachable or src == dst:
                    continue
                for service in target["services"]:
                    if not granting_rules(raw, src, dst, service["port"], selected):
                        continue
                    exploit=any((dst, finding) not in patched for finding in service["finding_ids"])
                    credential=src not in vaulted and any(c["target_asset"] == dst and c["service_id"] == service["id"] for c in source["credentials"])
                    if exploit or credential:
                        reachable.add(dst); changed=True; break
                if dst in reachable:
                    continue
    return reachable

def feasible(raw, selected):
    actions={a["id"]:a for a in raw["actions"]}
    if any(a.get("mandatory") and a["id"] not in selected for a in raw["actions"]): return False
    if any(set(actions[aid].get("excludes", [])) & selected for aid in selected): return False
    cap=raw.get("policy", {}).get("max_cost_dh")
    cost=sum(actions[aid]["effort_dh"] + 2 * actions[aid]["downtime_dh"] for aid in selected)
    if cap is not None and cost > cap: return False
    if any(not flow_ok(raw, flow, selected) for flow in raw["required_flows"]): return False
    return not (set(raw["targets"]) & reachable(raw, selected))

def exhaustive(raw):
    actions=raw["actions"]
    feasible_sets=[]
    best=None
    for bits in itertools.product((False, True), repeat=len(actions)):
        selected=frozenset(a["id"] for a, include in zip(actions, bits) if include)
        if not feasible(raw, selected):
            continue
        action_map={a["id"]:a for a in actions}
        key=(sum(action_map[x]["effort_dh"] + 2 * action_map[x]["downtime_dh"] for x in selected), len(selected), tuple(sorted(selected)))
        feasible_sets.append(selected)
        if best is None or key < best[0]: best=(key, selected)
    return best, feasible_sets
