"""User-supplied scenarios: stricter bounds than built-ins, then the normal parser.

Imported scenarios are request-scoped. They are parsed on every request and never stored.
"""
from __future__ import annotations
from typing import Any
from chokepoint.domain.errors import ScenarioError
from chokepoint.domain.models import Scenario
from .validate import parse_scenario

# Bounds keep graph construction and the exact search affordable for untrusted input.
IMPORT_LIMITS = {"zones": 20, "assets": 40, "findings": 80, "rules": 120, "required_flows": 40, "actions": 40, "origins": 10, "targets": 10}
IMPORT_MAX_NODES = 1000          # largest search budget accepted for an imported scenario (~50 ms per state at the size limits)
IMPORT_MAX_BYTES = 256 * 1024    # same cap as every request body (see app.py middleware)

def parse_import(raw: Any) -> Scenario:
    if type(raw) is not dict:
        raise ScenarioError("scenario must be a JSON object", path="/")
    for key, cap in IMPORT_LIMITS.items():
        value = raw.get(key)
        if type(value) is list and len(value) > cap:
            raise ScenarioError(f"imported scenarios are limited to {cap} {key.replace('_', ' ')}", code="IMPORT_LIMIT_EXCEEDED", path=f"/{key}")
    for i, asset in enumerate(raw.get("assets", []) if type(raw.get("assets")) is list else []):
        if type(asset) is dict:
            for key in ("services", "credentials"):
                if type(asset.get(key)) is list and len(asset[key]) > 8:
                    raise ScenarioError(f"imported assets are limited to 8 {key}", code="IMPORT_LIMIT_EXCEEDED", path=f"/assets/{i}/{key}")
    try:
        return parse_scenario(raw)
    except ScenarioError:
        raise
    except (KeyError, TypeError, ValueError, AttributeError, RecursionError):
        # Anything the parser did not anticipate is reported generically; details are never echoed.
        raise ScenarioError("scenario could not be parsed", path="/") from None
