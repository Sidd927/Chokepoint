from __future__ import annotations
import copy, re
from typing import Any
from chokepoint.domain.errors import ScenarioError
from chokepoint.domain.models import *

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
KINDS = {"asset","server","workstation","plc","controller","gateway","external"}
TOP = {"schema_version","id","name","description","synthetic","zones","assets","findings","rules","required_flows","origins","targets","actions","policy"}

def _req(d, key, typ, path):
    if key not in d or type(d[key]) is not typ:
        raise ScenarioError(f"expected {typ.__name__}", path=path)
    return d[key]
def _id(v, path):
    if type(v) is not str or not ID_RE.fullmatch(v) or not v.isascii(): raise ScenarioError("invalid identifier", path=path)
def _list_ids(values, path):
    if type(values) is not list: raise ScenarioError("expected list", path=path)
    for i, v in enumerate(values): _id(v, f"{path}/{i}")
    if len(set(values)) != len(values): raise ScenarioError("duplicate identifier", path=path)

def parse_scenario(raw: dict[str, Any]) -> Scenario:
    if type(raw) is not dict: raise ScenarioError("scenario must be an object")
    extra = set(raw) - TOP
    if extra: raise ScenarioError(f"unknown fields: {sorted(extra)}")
    for k, typ in [("schema_version",str),("id",str),("name",str),("description",str),("synthetic",bool),("zones",list),("assets",list),("findings",list),("rules",list),("required_flows",list),("origins",list),("targets",list),("actions",list),("policy",dict)]: _req(raw,k,typ,f"/{k}")
    if raw["schema_version"] != "1": raise ScenarioError("schema_version must be '1'", path="/schema_version")
    _id(raw["id"], "/id")
    zones=[]; zone_ids=[]
    for i,z in enumerate(raw["zones"]):
        if set(z) != {"id","name"}: raise ScenarioError("zone fields invalid",path=f"/zones/{i}")
        _id(z["id"],f"/zones/{i}/id"); zone_ids.append(z["id"]); zones.append(Zone(z["id"],_req(z,"name",str,f"/zones/{i}/name")))
    if len(set(zone_ids)) != len(zone_ids): raise ScenarioError("duplicate zone id",path="/zones")
    findings=[]; finding_ids=[]
    for i,f in enumerate(raw["findings"]):
        if set(f) != {"id","title","description","synthetic"}: raise ScenarioError("finding fields invalid",path=f"/findings/{i}")
        _id(f["id"],f"/findings/{i}/id"); finding_ids.append(f["id"]); findings.append(Finding(f["id"],_req(f,"title",str,""),_req(f,"description",str,""),_req(f,"synthetic",bool,"")))
    if len(set(finding_ids)) != len(finding_ids): raise ScenarioError("duplicate finding id",path="/findings")
    assets=[]; asset_ids=[]
    for i,a in enumerate(raw["assets"]):
        expected={"id","name","zone","kind","services","credentials"}
        if set(a)!=expected: raise ScenarioError("asset fields invalid",path=f"/assets/{i}")
        _id(a["id"],f"/assets/{i}/id"); asset_ids.append(a["id"])
        if a["zone"] not in zone_ids: raise ScenarioError("unknown zone",path=f"/assets/{i}/zone")
        if a["kind"] not in KINDS: raise ScenarioError("invalid asset kind",path=f"/assets/{i}/kind")
        services=[]; service_ids=[]
        for j,s in enumerate(a["services"]):
            if set(s)!={"id","port","finding_ids"}: raise ScenarioError("service fields invalid",path=f"/assets/{i}/services/{j}")
            _id(s["id"],f"/assets/{i}/services/{j}/id")
            if type(s["port"]) is not int or not 1<=s["port"]<=65535: raise ScenarioError("invalid port",path=f"/assets/{i}/services/{j}/port")
            _list_ids(s["finding_ids"],f"/assets/{i}/services/{j}/finding_ids")
            if any(x not in finding_ids for x in s["finding_ids"]): raise ScenarioError("unknown finding",path=f"/assets/{i}/services/{j}/finding_ids")
            service_ids.append(s["id"]); services.append(Service(s["id"],s["port"],tuple(sorted(s["finding_ids"]))))
        if len(set(service_ids))!=len(service_ids): raise ScenarioError("duplicate service id",path=f"/assets/{i}/services")
        creds=[]
        for j,c in enumerate(a["credentials"]):
            if set(c)!={"target_asset","service_id"}: raise ScenarioError("credential fields invalid",path=f"/assets/{i}/credentials/{j}")
            creds.append(Credential(c["target_asset"],c["service_id"]))
        assets.append(Asset(a["id"],a["name"],a["zone"],a["kind"],tuple(services),tuple(creds)))
    if len(set(asset_ids))!=len(asset_ids) or set(asset_ids)&set(zone_ids): raise ScenarioError("asset ids must be unique and disjoint from zones",path="/assets")
    asset_set=set(asset_ids)
    assets_by_raw={a.id:a for a in assets}
    for a in assets:
        for c in a.credentials:
            if c.target_asset not in asset_set: raise ScenarioError("credential target unknown")
            if c.service_id not in {s.id for s in assets_by_raw[c.target_asset].services}: raise ScenarioError("credential service unknown")
    rules=[]; rule_ids=[]
    for i,r in enumerate(raw["rules"]):
        if set(r)!={"id","src","dst","ports","label"}: raise ScenarioError("rule fields invalid",path=f"/rules/{i}")
        _id(r["id"],f"/rules/{i}/id"); rule_ids.append(r["id"])
        if r["src"] not in asset_set|set(zone_ids) or r["dst"] not in asset_set|set(zone_ids): raise ScenarioError("rule endpoint unknown",path=f"/rules/{i}")
        ports=r["ports"]
        if ports!="any":
            if type(ports) is not list or any(type(x) is not int or not 1<=x<=65535 for x in ports) or ports!=sorted(set(ports)): raise ScenarioError("ports must be sorted unique ints or any",path=f"/rules/{i}/ports")
            ports=tuple(ports)
        rules.append(Rule(r["id"],r["src"],r["dst"],ports,r["label"]))
    if len(set(rule_ids))!=len(rule_ids): raise ScenarioError("duplicate rule id",path="/rules")
    flows=[]
    for i,f in enumerate(raw["required_flows"]):
        if set(f)!={"id","src","dst","port","description"}: raise ScenarioError("flow fields invalid",path=f"/required_flows/{i}")
        _id(f["id"],f"/required_flows/{i}/id")
        if f["src"] not in asset_set or f["dst"] not in asset_set or type(f["port"]) is not int: raise ScenarioError("flow reference invalid",path=f"/required_flows/{i}")
        flows.append(Flow(f["id"],f["src"],f["dst"],f["port"],f["description"]))
    _list_ids(raw["origins"],"/origins"); _list_ids(raw["targets"],"/targets")
    if not raw["origins"] or not raw["targets"] or set(raw["origins"])&set(raw["targets"]): raise ScenarioError("origins and targets must be non-empty and disjoint")
    if any(x not in asset_set for x in raw["origins"]+raw["targets"]): raise ScenarioError("origin/target unknown")
    actions=[]; action_ids=[]
    for i,a in enumerate(raw["actions"]):
        expected={"id","kind","params","effort_dh","downtime_dh","mandatory","excludes","description"}
        if set(a)!=expected: raise ScenarioError("action fields invalid",path=f"/actions/{i}")
        _id(a["id"],f"/actions/{i}/id"); action_ids.append(a["id"])
        if a["kind"] not in {"patch_finding","restrict_rule","remove_rule","vault_credentials"}: raise ScenarioError("invalid action kind")
        if type(a["effort_dh"]) is not int or type(a["downtime_dh"]) is not int or min(a["effort_dh"],a["downtime_dh"])<0: raise ScenarioError("invalid action cost")
        _list_ids(a["excludes"],f"/actions/{i}/excludes")
        actions.append(Action(a["id"],a["kind"],dict(a["params"]),a["effort_dh"],a["downtime_dh"],a["mandatory"],tuple(sorted(a["excludes"])),a["description"]))
    if len(set(action_ids))!=len(action_ids): raise ScenarioError("duplicate action id")
    action_set=set(action_ids)
    for a in actions:
        if a.id in a.excludes or any(x not in action_set for x in a.excludes): raise ScenarioError("invalid exclusions")
        if a.kind=="patch_finding" and (a.params.get("asset_id") not in asset_set or a.params.get("finding_id") not in finding_ids): raise ScenarioError("invalid patch action")
        if a.kind in {"restrict_rule","remove_rule"} and a.params.get("rule_id") not in set(rule_ids): raise ScenarioError("invalid rule action")
        if a.kind=="vault_credentials" and not any(x.id==a.params.get("asset_id") and x.credentials for x in assets): raise ScenarioError("invalid vault action")
    amap={a.id:a for a in actions}
    for a in actions:
        for e in a.excludes:
            if a.id not in amap[e].excludes: raise ScenarioError("exclusions must be symmetric")
    policy=raw["policy"]
    if set(policy)!={"max_cost_dh"} or (policy["max_cost_dh"] is not None and (type(policy["max_cost_dh"]) is not int or policy["max_cost_dh"]<0)): raise ScenarioError("invalid policy")
    scenario=Scenario("1",raw["id"],raw["name"],raw["description"],raw["synthetic"],tuple(zones),tuple(assets),tuple(findings),tuple(rules),tuple(flows),tuple(sorted(raw["origins"])),tuple(sorted(raw["targets"])),tuple(actions),policy["max_cost_dh"],copy.deepcopy(raw))
    from chokepoint.graph.semantics import flow_permitted
    for f in scenario.required_flows:
        if not flow_permitted(scenario,f.src,f.dst,f.port,frozenset()): raise ScenarioError("required flow is not permitted in the unmodified scenario", "REQUIRED_FLOW_NOT_PERMITTED", f"/required_flows/{f.id}")
    return scenario
