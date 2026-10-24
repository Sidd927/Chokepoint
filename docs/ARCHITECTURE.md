# Architecture

The core is split into domain models, scenario validation/loading, graph semantics, action effects, and solver. The API layer adapts JSON requests to the core and calls the independent verifier only at the boundary. `chokepoint_verifier` has no imports from `chokepoint` and uses only Python standard-library modules.

Data flows from JSON scenario → validated immutable-ish model → action state → permissions/graph/reachability → exact or greedy planner → independent verification → deterministic receipt. JSON files are the source of truth for structure and costs; clients never provide authoritative costs.
