import hashlib
from .canonical import canonical_bytes

def normalize(raw):
    import copy
    x=copy.deepcopy(raw)
    for key in ("zones","assets","findings","rules","required_flows","actions"): x[key]=sorted(x[key],key=lambda v:v["id"])
    for a in x["assets"]:
        a["services"]=sorted(a["services"],key=lambda v:v["id"])
        a["credentials"]=sorted(a["credentials"],key=lambda v:(v["target_asset"],v["service_id"]))
        for s in a["services"]: s["finding_ids"]=sorted(s["finding_ids"])
    x["origins"]=sorted(x["origins"]); x["targets"]=sorted(x["targets"])
    for a in x["actions"]: a["excludes"]=sorted(a["excludes"])
    for r in x["rules"]:
        if isinstance(r["ports"],list): r["ports"]=sorted(r["ports"])
    return x
def sha(value): return "sha256:"+hashlib.sha256(canonical_bytes(value)).hexdigest()
def scenario_fingerprint(raw): return sha(normalize(raw))
