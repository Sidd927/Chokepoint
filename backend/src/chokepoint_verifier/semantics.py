def _asset(raw, aid): return next(x for x in raw["assets"] if x["id"]==aid)
def _match(raw, sel, aid): return sel==aid or sel==_asset(raw,aid)["zone"]
def _effects(raw, ids):
    patched=set(); removed=set(); restricted=set(); vaulted=set()
    for a in raw["actions"]:
        if a["id"] not in ids: continue
        p=a["params"]
        if a["kind"]=="patch_finding": patched.add((p["asset_id"],p["finding_id"]))
        elif a["kind"]=="remove_rule": removed.add(p["rule_id"])
        elif a["kind"]=="restrict_rule": restricted.add(p["rule_id"])
        elif a["kind"]=="vault_credentials": vaulted.add(p["asset_id"])
    return patched,removed,restricted,vaulted
def grants(raw, r, src, dst, port, ids):
    _,removed,restricted,_=_effects(raw,ids)
    if r["id"] in removed or not _match(raw,r["src"],src) or not _match(raw,r["dst"],dst) or (r["ports"]!="any" and port not in r["ports"]): return False
    if r["id"] in restricted:
        if not any(f["src"]==src and f["dst"]==dst and f["port"]==port and _match(raw,r["src"],f["src"]) and _match(raw,r["dst"],f["dst"]) and (r["ports"]=="any" or f["port"] in r["ports"]) for f in raw["required_flows"]): return False
    return True
def granters(raw,src,dst,port,ids): return sorted(r["id"] for r in raw["rules"] if grants(raw,r,src,dst,port,ids))
def flow_ok(raw,f,ids): return bool(granters(raw,f["src"],f["dst"],f["port"],ids))
def fixpoint(raw,ids):
    _,_,_,vaulted=_effects(raw,ids); comp=set(raw["origins"]); parent={}; changed=True
    while changed:
        changed=False
        for src in sorted(comp):
            for dst in sorted(a["id"] for a in raw["assets"]):
                if src==dst or dst in comp: continue
                target=_asset(raw,dst); source=_asset(raw,src)
                for svc in target["services"]:
                    if not granters(raw,src,dst,svc["port"],ids): continue
                    patched,_,_,_= _effects(raw,ids)
                    if any((dst,f) not in patched for f in svc["finding_ids"]):
                        comp.add(dst); parent[dst]=src; changed=True; break
                    if src not in vaulted and any(c["target_asset"]==dst and c["service_id"]==svc["id"] for c in source["credentials"]):
                        comp.add(dst); parent[dst]=src; changed=True; break
                if dst in comp: continue
    return comp,parent

def path(parent,node):
    out=[node]
    while out[-1] in parent: out.append(parent[out[-1]])
    return list(reversed(out))
