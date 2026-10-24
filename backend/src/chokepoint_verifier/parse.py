"""Small, deliberately independent raw-document validator for the verifier."""

import re

from .semantics import flow_ok

ID_RE = re.compile(r"^[A-Za-z][A-Za-z0-9_.-]{0,63}$")
KINDS = {"asset", "server", "workstation", "plc", "controller", "gateway", "external"}
TOP = {"schema_version", "id", "name", "description", "synthetic", "zones", "assets", "findings", "rules", "required_flows", "origins", "targets", "actions", "policy"}
ACTION_KINDS = {"patch_finding", "restrict_rule", "remove_rule", "vault_credentials"}


def _text(value):
    return type(value) is str and not any(0xD800 <= ord(c) <= 0xDFFF for c in value)


def _id(value):
    return _text(value) and value.isascii() and bool(ID_RE.fullmatch(value))


def _obj(value, fields):
    return type(value) is dict and all(_text(k) and k.isascii() for k in value) and set(value) == fields


def _ids(values, known=None, nonempty=False):
    if type(values) is not list or (nonempty and not values):
        return False
    if not all(_id(x) for x in values) or len(values) != len(set(values)):
        return False
    return known is None or all(x in known for x in values)


def validate_raw(raw):
    """Return False for every malformed document; never raise for hostile input."""
    try:
        if not _obj(raw, TOP) or raw["schema_version"] != "1":
            return False
        if not all(_text(raw[k]) for k in ("schema_version", "id", "name", "description")):
            return False
        if type(raw["synthetic"]) is not bool or not _id(raw["id"]):
            return False
        if not all(type(raw[k]) is list for k in ("zones", "assets", "findings", "rules", "required_flows", "origins", "targets", "actions")) or type(raw["policy"]) is not dict:
            return False
        if len(raw["assets"]) > 500 or len(raw["rules"]) > 2000 or len(raw["actions"]) > 64:
            return False

        zones = set()
        for z in raw["zones"]:
            if not _obj(z, {"id", "name"}) or not _id(z["id"]) or not _text(z["name"]) or z["id"] in zones:
                return False
            zones.add(z["id"])
        findings = set()
        for f in raw["findings"]:
            if not _obj(f, {"id", "title", "description", "synthetic"}) or not _id(f["id"]):
                return False
            if not _text(f["title"]) or not _text(f["description"]) or type(f["synthetic"]) is not bool or f["id"] in findings:
                return False
            findings.add(f["id"])

        assets = {}
        for a in raw["assets"]:
            if not _obj(a, {"id", "name", "zone", "kind", "services", "credentials"}) or not _id(a["id"]):
                return False
            if not _text(a["name"]) or a["zone"] not in zones or a["kind"] not in KINDS or type(a["services"]) is not list or type(a["credentials"]) is not list:
                return False
            if a["id"] in assets or a["id"] in zones:
                return False
            services = {}
            for s in a["services"]:
                if not _obj(s, {"id", "port", "finding_ids"}) or not _id(s["id"]) or s["id"] in services:
                    return False
                if type(s["port"]) is not int or not 1 <= s["port"] <= 65535 or not _ids(s["finding_ids"], findings):
                    return False
                services[s["id"]] = s
            assets[a["id"]] = (a, services)
        asset_ids = set(assets)
        for a, services in assets.values():
            for c in a["credentials"]:
                if not _obj(c, {"target_asset", "service_id"}) or not _id(c["target_asset"]) or not _id(c["service_id"]):
                    return False
                if c["target_asset"] not in asset_ids or c["service_id"] not in assets[c["target_asset"]][1]:
                    return False

        rules = {}
        endpoints = asset_ids | zones
        for r in raw["rules"]:
            if not _obj(r, {"id", "src", "dst", "ports", "label"}) or not _id(r["id"]) or r["id"] in rules:
                return False
            if r["src"] not in endpoints or r["dst"] not in endpoints or not _text(r["label"]):
                return False
            ports = r["ports"]
            if ports != "any" and (type(ports) is not list or len(ports) != len(set(ports)) or ports != sorted(ports) or not all(type(p) is int and 1 <= p <= 65535 for p in ports)):
                return False
            rules[r["id"]] = r

        flows = {}
        for f in raw["required_flows"]:
            if not _obj(f, {"id", "src", "dst", "port", "description"}) or not _id(f["id"]) or f["id"] in flows:
                return False
            if f["src"] not in asset_ids or f["dst"] not in asset_ids or type(f["port"]) is not int or not 1 <= f["port"] <= 65535 or not _text(f["description"]):
                return False
            flows[f["id"]] = f
        if not _ids(raw["origins"], asset_ids, True) or not _ids(raw["targets"], asset_ids, True) or set(raw["origins"]) & set(raw["targets"]):
            return False

        actions = {}
        for a in raw["actions"]:
            if not _obj(a, {"id", "kind", "params", "effort_dh", "downtime_dh", "mandatory", "excludes", "description"}) or not _id(a["id"]) or a["id"] in actions:
                return False
            if a["kind"] not in ACTION_KINDS or type(a["params"]) is not dict or not all(_text(k) and _text(v) for k, v in a["params"].items()):
                return False
            if type(a["effort_dh"]) is not int or type(a["downtime_dh"]) is not int or not 0 <= a["effort_dh"] <= 100000 or not 0 <= a["downtime_dh"] <= 100000 or type(a["mandatory"]) is not bool or not _text(a["description"]):
                return False
            if not _ids(a["excludes"]):
                return False
            actions[a["id"]] = a
        action_ids = set(actions)
        for a in actions.values():
            # Asymmetric exclusions are accepted; the verifier applies the symmetric closure.
            if a["id"] in a["excludes"] or any(x not in action_ids for x in a["excludes"]):
                return False
            p = a["params"]
            if a["kind"] == "patch_finding":
                if set(p) != {"asset_id", "finding_id"} or p["asset_id"] not in asset_ids or p["finding_id"] not in findings:
                    return False
                if not any(p["finding_id"] in s["finding_ids"] for s in assets[p["asset_id"]][1].values()):
                    return False
            elif a["kind"] in {"restrict_rule", "remove_rule"}:
                if set(p) != {"rule_id"} or p["rule_id"] not in rules:
                    return False
            elif set(p) != {"asset_id"} or p["asset_id"] not in asset_ids or not assets[p["asset_id"]][0]["credentials"]:
                return False

        policy = raw["policy"]
        if not _obj(policy, {"max_cost_dh"}) or (policy["max_cost_dh"] is not None and (type(policy["max_cost_dh"]) is not int or not 0 <= policy["max_cost_dh"] <= 10000000)):
            return False
        return all(flow_ok(raw, flow, set()) for flow in raw["required_flows"])
    except (TypeError, ValueError, KeyError, AttributeError):
        return False
