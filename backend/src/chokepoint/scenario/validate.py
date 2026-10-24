from __future__ import annotations
import copy, re
from dataclasses import replace
from typing import Any
from chokepoint.domain.errors import ScenarioError
from chokepoint.domain.models import *

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
KINDS = {"asset","server","workstation","plc","controller","gateway","external"}
TOP = {"schema_version","id","name","description","synthetic","zones","assets","findings","rules","required_flows","origins","targets","actions","policy"}

def _object(value, fields, path):
    if type(value) is not dict:
        raise ScenarioError("expected object", path=path)
    if any(type(key) is not str or not key.isascii() for key in value):
        raise ScenarioError("field names must be ASCII strings", path=path)
    missing = sorted(fields - value.keys())
    if missing:
        raise ScenarioError("missing required field", path=f"/{missing[0]}" if not path else f"{path}/{missing[0]}")
    if value.keys() - fields:
        raise ScenarioError("unknown fields", path=path or "/")


def _req(d, key, typ, path):
    value = d[key]
    if type(value) is not typ:
        raise ScenarioError(f"expected {typ.__name__}", path=path)
    if typ is str and any(0xD800 <= ord(char) <= 0xDFFF for char in value):
        raise ScenarioError("invalid Unicode surrogate", path=path)
    return value


def _id(value, path):
    if type(value) is not str or not ID_RE.fullmatch(value):
        raise ScenarioError("invalid identifier", path=path)


def _integer(value, low, high, path):
    if type(value) is not int or not low <= value <= high:
        raise ScenarioError(f"expected integer in [{low}, {high}]", path=path)


def _list_ids(values, path):
    if type(values) is not list:
        raise ScenarioError("expected list", path=path)
    for i, value in enumerate(values):
        _id(value, f"{path}/{i}")
    if len(set(values)) != len(values):
        raise ScenarioError("duplicate identifier", path=path)


def _reference(value, ids, path):
    _id(value, path)
    if value not in ids:
        raise ScenarioError("unknown reference", path=path)


def _unique(value, ids, path):
    _id(value, path)
    if value in ids:
        raise ScenarioError("duplicate identifier", path=path)
    ids.add(value)


def parse_scenario(raw: dict[str, Any]) -> Scenario:
    _object(raw, TOP, "")
    for key, typ in [("schema_version", str), ("id", str), ("name", str),
                     ("description", str), ("synthetic", bool), ("zones", list),
                     ("assets", list), ("findings", list), ("rules", list),
                     ("required_flows", list), ("origins", list), ("targets", list),
                     ("actions", list), ("policy", dict)]:
        _req(raw, key, typ, f"/{key}")
    if raw["schema_version"] != "1":
        raise ScenarioError("schema_version must be '1'", path="/schema_version")
    _id(raw["id"], "/id")
    for key, cap in (("assets", 500), ("rules", 2000), ("actions", 64)):
        if len(raw[key]) > cap:
            raise ScenarioError(f"entity cap exceeded ({cap})", path=f"/{key}")

    zones, zone_ids = [], set()
    for i, z in enumerate(raw["zones"]):
        p = f"/zones/{i}"
        _object(z, {"id", "name"}, p)
        _unique(z["id"], zone_ids, p + "/id")
        zones.append(Zone(z["id"], _req(z, "name", str, p + "/name")))

    findings, finding_ids = [], set()
    for i, f in enumerate(raw["findings"]):
        p = f"/findings/{i}"
        _object(f, {"id", "title", "description", "synthetic"}, p)
        _unique(f["id"], finding_ids, p + "/id")
        findings.append(Finding(f["id"], _req(f, "title", str, p + "/title"),
                                _req(f, "description", str, p + "/description"),
                                _req(f, "synthetic", bool, p + "/synthetic")))

    assets, asset_ids = [], set()
    for i, a in enumerate(raw["assets"]):
        p = f"/assets/{i}"
        _object(a, {"id", "name", "zone", "kind", "services", "credentials"}, p)
        _unique(a["id"], asset_ids, p + "/id")
        if a["id"] in zone_ids:
            raise ScenarioError("asset and zone identifiers must be disjoint", path=p + "/id")
        _req(a, "name", str, p + "/name")
        _reference(a["zone"], zone_ids, p + "/zone")
        if _req(a, "kind", str, p + "/kind") not in KINDS:
            raise ScenarioError("invalid asset kind", path=p + "/kind")
        services, service_ids = [], set()
        for j, s in enumerate(_req(a, "services", list, p + "/services")):
            sp = f"{p}/services/{j}"
            _object(s, {"id", "port", "finding_ids"}, sp)
            _unique(s["id"], service_ids, sp + "/id")
            _integer(s["port"], 1, 65535, sp + "/port")
            _list_ids(s["finding_ids"], sp + "/finding_ids")
            for k, fid in enumerate(s["finding_ids"]):
                _reference(fid, finding_ids, f"{sp}/finding_ids/{k}")
            services.append(Service(s["id"], s["port"], tuple(sorted(s["finding_ids"]))))
        creds = []
        for j, c in enumerate(_req(a, "credentials", list, p + "/credentials")):
            cp = f"{p}/credentials/{j}"
            _object(c, {"target_asset", "service_id"}, cp)
            _id(c["target_asset"], cp + "/target_asset")
            _id(c["service_id"], cp + "/service_id")
            creds.append(Credential(c["target_asset"], c["service_id"]))
        assets.append(Asset(a["id"], a["name"], a["zone"], a["kind"], tuple(services), tuple(creds)))
    assets_by_id = {a.id: a for a in assets}
    for i, a in enumerate(assets):
        for j, c in enumerate(a.credentials):
            p = f"/assets/{i}/credentials/{j}"
            _reference(c.target_asset, asset_ids, p + "/target_asset")
            _reference(c.service_id, {s.id for s in assets_by_id[c.target_asset].services}, p + "/service_id")

    rules, rule_ids = [], set()
    for i, r in enumerate(raw["rules"]):
        p = f"/rules/{i}"
        _object(r, {"id", "src", "dst", "ports", "label"}, p)
        _unique(r["id"], rule_ids, p + "/id")
        for key in ("src", "dst"):
            _reference(r[key], asset_ids | zone_ids, p + "/" + key)
        _req(r, "label", str, p + "/label")
        ports = r["ports"]
        if ports == "any":
            normalized_ports: tuple[int, ...] | str = "any"
        else:
            _req(r, "ports", list, p + "/ports")
            for j, port in enumerate(ports):
                _integer(port, 1, 65535, f"{p}/ports/{j}")
            if ports != sorted(set(ports)):
                raise ScenarioError("ports must be sorted and unique", path=p + "/ports")
            normalized_ports = tuple(ports)
        rules.append(Rule(r["id"], r["src"], r["dst"], normalized_ports, r["label"]))

    flows, flow_ids = [], set()
    for i, f in enumerate(raw["required_flows"]):
        p = f"/required_flows/{i}"
        _object(f, {"id", "src", "dst", "port", "description"}, p)
        _unique(f["id"], flow_ids, p + "/id")
        for key in ("src", "dst"):
            _reference(f[key], asset_ids, p + "/" + key)
        _integer(f["port"], 1, 65535, p + "/port")
        _req(f, "description", str, p + "/description")
        flows.append(Flow(f["id"], f["src"], f["dst"], f["port"], f["description"]))
    for key in ("origins", "targets"):
        _list_ids(raw[key], "/" + key)
        if not raw[key]:
            raise ScenarioError("must be non-empty", path="/" + key)
        for i, aid in enumerate(raw[key]):
            _reference(aid, asset_ids, f"/{key}/{i}")
    if set(raw["origins"]) & set(raw["targets"]):
        raise ScenarioError("origins and targets must be disjoint", path="/targets")

    actions, action_ids = [], set()
    param_fields = {"patch_finding": {"asset_id", "finding_id"},
                    "restrict_rule": {"rule_id"}, "remove_rule": {"rule_id"},
                    "vault_credentials": {"asset_id"}}
    for i, a in enumerate(raw["actions"]):
        p = f"/actions/{i}"
        _object(a, {"id", "kind", "params", "effort_dh", "downtime_dh", "mandatory", "excludes", "description"}, p)
        _unique(a["id"], action_ids, p + "/id")
        kind = _req(a, "kind", str, p + "/kind")
        if kind not in param_fields:
            raise ScenarioError("invalid action kind", path=p + "/kind")
        params = a["params"]
        _object(params, param_fields[kind], p + "/params")
        for key in sorted(params):
            _reference(params[key], rule_ids if key == "rule_id" else asset_ids if key == "asset_id" else finding_ids, p + "/params/" + key)
        if kind == "patch_finding" and not any(params["finding_id"] in s.finding_ids for s in assets_by_id[params["asset_id"]].services):
            raise ScenarioError("finding is not present on asset", path=p + "/params/finding_id")
        if kind == "vault_credentials" and not assets_by_id[params["asset_id"]].credentials:
            raise ScenarioError("asset has no credentials", path=p + "/params/asset_id")
        for key in ("effort_dh", "downtime_dh"):
            _integer(a[key], 0, 100000, p + "/" + key)
        _req(a, "mandatory", bool, p + "/mandatory")
        _req(a, "description", str, p + "/description")
        _list_ids(a["excludes"], p + "/excludes")
        actions.append(Action(a["id"], kind, dict(params), a["effort_dh"], a["downtime_dh"], a["mandatory"], tuple(a["excludes"]), a["description"]))
    closed = {a.id: set(a.excludes) for a in actions}
    for i, a in enumerate(actions):
        for j, excluded in enumerate(a.excludes):
            p = f"/actions/{i}/excludes/{j}"
            _reference(excluded, action_ids, p)
            if excluded == a.id:
                raise ScenarioError("action cannot exclude itself", path=p)
            closed[excluded].add(a.id)
    actions = [replace(a, excludes=tuple(sorted(closed[a.id]))) for a in actions]
    policy = raw["policy"]
    _object(policy, {"max_cost_dh"}, "/policy")
    if policy["max_cost_dh"] is not None:
        _integer(policy["max_cost_dh"], 0, 10000000, "/policy/max_cost_dh")
    scenario = Scenario("1", raw["id"], raw["name"], raw["description"], raw["synthetic"], tuple(zones), tuple(assets), tuple(findings), tuple(rules), tuple(flows), tuple(sorted(raw["origins"])), tuple(sorted(raw["targets"])), tuple(actions), policy["max_cost_dh"], copy.deepcopy(raw))
    from chokepoint.graph.semantics import flow_permitted
    for i, f in enumerate(scenario.required_flows):
        if not flow_permitted(scenario,f.src,f.dst,f.port,frozenset()): raise ScenarioError("required flow is not permitted in the unmodified scenario", "REQUIRED_FLOW_NOT_PERMITTED", f"/required_flows/{i}")
    warnings=[]
    initial_reach = __import__("chokepoint.graph.semantics", fromlist=["reachable"]).reachable(scenario)
    for a in actions:
        if a.cost_dh == 0: warnings.append({"code":"ZERO_COST_ACTION","message":f"{a.id} has zero cost","path":f"/actions/{a.id}"})
        if not a.mandatory and a.kind == "restrict_rule" and not __import__("chokepoint.graph.semantics", fromlist=["required_set"]).required_set(scenario, scenario.rules_by_id[a.params["rule_id"]]):
            warnings.append({"code":"EMPTY_RESTRICT","message":f"{a.id} restricts no required-flow triple","path":f"/actions/{a.id}"})
        if not a.mandatory:
            graph_semantics = __import__("chokepoint.graph.semantics", fromlist=["graph"])
            before_graph = graph_semantics.graph(scenario)
            after_graph = graph_semantics.graph(scenario, frozenset({a.id}))
            if before_graph == after_graph: warnings.append({"code":"INERT_ACTION","message":f"{a.id} neutralises no initial graph reason","path":f"/actions/{a.id}"})
    effects = [(a.kind, tuple(sorted(a.params.items()))) for a in actions]
    for i, effect in enumerate(effects):
        if effect in effects[:i]: warnings.append({"code":"DUPLICATE_EFFECT","message":f"duplicate effect for {actions[i].id}","path":f"/actions/{i}"})
    if any(t not in initial_reach for t in scenario.targets): warnings.append({"code":"UNREACHABLE_TARGET","message":"one or more targets are not initially reachable","path":"/targets"})
    return Scenario(scenario.schema_version,scenario.id,scenario.name,scenario.description,scenario.synthetic,scenario.zones,scenario.assets,scenario.findings,scenario.rules,scenario.required_flows,scenario.origins,scenario.targets,scenario.actions,scenario.max_cost_dh,scenario.raw,tuple(sorted(warnings,key=lambda x:(x["code"],x["path"]))))
