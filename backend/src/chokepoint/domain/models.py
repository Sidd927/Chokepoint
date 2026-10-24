from __future__ import annotations
from dataclasses import dataclass, field
from typing import Any

@dataclass(frozen=True)
class Service:
    id: str
    port: int
    finding_ids: tuple[str, ...]

@dataclass(frozen=True)
class Credential:
    target_asset: str
    service_id: str

@dataclass(frozen=True)
class Asset:
    id: str
    name: str
    zone: str
    kind: str
    services: tuple[Service, ...]
    credentials: tuple[Credential, ...]

@dataclass(frozen=True)
class Zone:
    id: str
    name: str

@dataclass(frozen=True)
class Finding:
    id: str
    title: str
    description: str
    synthetic: bool

@dataclass(frozen=True)
class Rule:
    id: str
    src: str
    dst: str
    ports: tuple[int, ...] | str
    label: str

@dataclass(frozen=True)
class Flow:
    id: str
    src: str
    dst: str
    port: int
    description: str

@dataclass(frozen=True)
class Action:
    id: str
    kind: str
    params: dict[str, str]
    effort_dh: int
    downtime_dh: int
    mandatory: bool
    excludes: tuple[str, ...]
    description: str

    @property
    def cost_dh(self) -> int:
        return self.effort_dh + 2 * self.downtime_dh

@dataclass(frozen=True)
class Scenario:
    schema_version: str
    id: str
    name: str
    description: str
    synthetic: bool
    zones: tuple[Zone, ...]
    assets: tuple[Asset, ...]
    findings: tuple[Finding, ...]
    rules: tuple[Rule, ...]
    required_flows: tuple[Flow, ...]
    origins: tuple[str, ...]
    targets: tuple[str, ...]
    actions: tuple[Action, ...]
    max_cost_dh: int | None
    raw: dict[str, Any] = field(repr=False, compare=False)

    @property
    def assets_by_id(self): return {x.id: x for x in self.assets}
    @property
    def rules_by_id(self): return {x.id: x for x in self.rules}
    @property
    def actions_by_id(self): return {x.id: x for x in self.actions}
    @property
    def findings_by_id(self): return {x.id: x for x in self.findings}
