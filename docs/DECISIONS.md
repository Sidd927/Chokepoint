# Decisions

## Summary

[VF] The supplied repository is an empty, dedicated `Chokepoint` repository with an existing `origin` pointing to `https://github.com/Sidd927/Chokepoint.git`. It has no commits. [DD] Work stays in this repository and does not touch ChronoForge. [DD] CHOKEPOINT is an offline defensive planner over synthetic scenarios, with integer decihour costs, exact/greedy planning, an independent verifier, deterministic receipts, a FastAPI API, and a React UI.

## Adopted assumptions

- [DD] Python 3.11 is used because Python 3.12 is unavailable in this worker; the code targets Python 3.11+.
- [DD] The appendix design is authoritative for `canonical_city`; its optimum is established by the independent oracle tests.
- [DD] No license file is added, per the supplied open-question default.
- [DD] No live feeds, LLM, authentication, database, Docker requirement, or real network integrations are included.
- [DD] Playwright is optional; if browser binaries are unavailable, the manual journey is documented in the final report.
- [DD] Costs are `effort_dh + 2*downtime_dh`, with no floats.

## Contradictions / resolutions

- [VF] The build prompt asks for Python 3.12, while the worker exposes Python 3.11.2 and no `python3.12`; the stricter portable minimum from the context pack is followed by targeting Python 3.11+.
- [DD] The supplied `canonical_city` appendix uses `required_flows` with `port` values that may not equal the destination service port in every fixture; required-flow permission is evaluated exactly by the declared triple, while attack reasons use service ports.

## External actions

The existing GitHub remote is recorded but no push or repository creation is performed without user approval.
