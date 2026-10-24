# CHOKEPOINT

CHOKEPOINT is a defensive remediation-planning engine for a **synthetic, modelled** smart-city network. It computes a lowest-cost catalogue plan that removes modelled origin-to-target reachability while preserving required flows, then independently verifies the result with a separate standard-library implementation and emits a deterministic receipt.

It does not scan, exploit, control, or change real systems. A graph edge is logical reachability under the scenario model, not proof of exploitability. A `VERIFIED` result means the modelled constraints passed the independent verifier; it is not a claim of real-world security or solver optimality unless the solver status is `OPTIMAL`.

This is a separate, new original build. It does not copy source or assets from ChronoForge. Event or competition compliance is not asserted here.

## Quick start

Requirements: Python 3.11+ and Node 20+. This environment provides Python 3.11 and Node 22; Python 3.12 was not available, so the implementation uses the compatible 3.11 interpreter.

```bash
make setup
make test
make dev
```

Backend: `http://127.0.0.1:8000/api/v1/health`
Frontend: `http://127.0.0.1:5173`

Useful commands:

```bash
make backend-test
make frontend-test
make build
PYTHONPATH=backend/src python -m chokepoint.cli validate backend/scenarios/canonical_city.json
PYTHONPATH=backend/src python -m chokepoint.cli plan backend/scenarios/canonical_city.json --json
```

## Structure

- `backend/src/chokepoint`: typed scenario loading, graph semantics, solver, API, and CLI.
- `backend/src/chokepoint_verifier`: independent stdlib-only fixpoint verifier and receipt builder.
- `backend/scenarios`: shipped scenarios and small fixtures.
- `frontend`: React/Vite interface using only API graph data.
- `docs`: architecture, algorithm, API, testing, decisions, dependencies, and final report.

## Limitations

The model is allow-only, protocol-agnostic, offline, unauthenticated, and uses synthetic findings. Optimality is relative to the finite action catalogue and model. Fingerprints are SHA-256 integrity digests, not signatures, authentication, tamper-proof storage, or proofs. Real-world use requires authorised inputs and review by qualified operators.
