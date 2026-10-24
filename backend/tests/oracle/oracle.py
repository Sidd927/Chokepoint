import itertools
def exhaustive(raw):
    actions=raw["actions"]; amap={a["id"]:a for a in actions}; best=None; feasible=[]
    def match(sel,a): return sel==a["id"] or sel==a["zone"]
    def grants(src,dst,port,S):
        for r in raw["rules"]:
            if r["id"] in S or not match(r["src"],next(a for a in raw["assets"] if a["id"]==src)) or not match(r["dst"],next(a for a in raw["assets"] if a["id"]==dst)): continue
            if r["ports"]=="any" or port in r["ports"]: return True
        return False
    def reach(S):
        seen=set(raw["origins"]); changed=True
        while changed:
            changed=False
            for dst in raw["assets"]:
                if dst["id"] in seen: continue
                for src in list(seen):
                    for svc in dst["services"]:
                        if grants(src,dst["id"],svc["port"],S) and any(a["id"]==src and any(c["target_asset"]==dst["id"] and c["service_id"]==svc["id"] for c in a["credentials"]) for a in raw["assets"]): seen.add(dst["id"]); changed=True; break
                    if dst["id"] in seen: break
        return seen
    for bits in itertools.product([0,1],repeat=len(actions)):
        S={a["id"] for a,b in zip(actions,bits) if b}
        if any(a.get("mandatory") and a["id"] not in S for a in actions) or any(set(amap[x].get("excludes",[]))&S for x in S): continue
        if raw.get("policy",{}).get("max_cost_dh") is not None and sum(amap[x]["effort_dh"]+2*amap[x]["downtime_dh"] for x in S)>raw["policy"]["max_cost_dh"]: continue
        if set(raw["targets"])&reach(S): continue
        feasible.append(S); key=(sum(amap[x]["effort_dh"]+2*amap[x]["downtime_dh"] for x in S),len(S),tuple(sorted(S)))
        if best is None or key<best[0]: best=(key,S)
    return best,feasible
