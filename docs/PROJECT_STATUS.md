# CHOKEPOINT — Project Status

Audit date: 2026-10-24. Based on inspecting the files and running the commands listed below on the local Mac. Statuses: IMPLEMENTED, PARTIAL, NOT IMPLEMENTED, TESTED (executed and passed in this audit), NOT VERIFIED (not executed).

## 1. Overview
CHOKEPOINT plans minimal-cost remediation for a **modelled (synthetic, not live) smart-city network**. Given a scenario (assets, zones, firewall rules, findings, required operational flows, remediation actions with costs), it computes the cheapest set of actions that cuts all attack paths from origins to targets while preserving required flows, then independently verifies the plan and emits a SHA-256 receipt.

## 2. Architecture (IMPLEMENTED)
- `backend/src/chokepoint/` — domain models, scenario loader/validator, attack-graph semantics, action effects, exact + greedy solver, FastAPI app, CLI.
- `backend/src/chokepoint_verifier/` — independent verifier (stdlib parsing, canonical JSON, checks, receipt). An independence test exists (`test_independence.py`).
- `frontend/` — React 18 + Vite + TypeScript, Cytoscape graph, vitest, Playwright spec.
- `docs/` — ARCHITECTURE, TESTING, FINAL_REPORT, ENGINEERING_AUDIT, openapi.json. Note: `FINAL_REPORT.md` and `ENGINEERING_AUDIT.md` were written by a previous AI environment; treat their claims as unverified unless repeated below.

## 3. Backend (IMPLEMENTED, TESTED via pytest)
Scenario loading/validation with bounds and adversarial-input tests; asset/zone/rule/finding models; reachability + witness path; remediation actions (remove/restrict rule, etc.); integer cost in DH; required-flow preservation; conflicts reported.

## 4. Optimization & verification (IMPLEMENTED, TESTED)
- Exact search with node budget, deterministic tie-break (cost, action count, action ids), proof block (`exhaustive`, `nodes_evaluated`, `budget_exhausted`).
- Greedy fallback (gain/(cost+1) ratio via integer cross-multiplication).
- Independent verifier + receipt; receipt test vectors; oracle (brute-force) differential tests.
- Observed: `demo_city` -> OPTIMAL, actions D01,D03,D08,D09,D10, cost 105, 28 nodes; `canonical_city` -> OPTIMAL, A01–A04, cost 200, 11 nodes.

## 5. Frontend
- IMPLEMENTED (code present, builds): scenario list, graph (Cytoscape), plan/verify/compare/receipt views, loading/error states (`pages/Workspace.tsx`, `components/GraphCanvas.tsx`, `state/useWorkspace.ts`).
- TESTED: 5 jsdom unit/interaction tests pass.
- NOT VERIFIED: actual behavior in a real browser (Playwright e2e not run; no manual click-through done in this audit). Receipt download and visual quality are therefore unconfirmed.

## 6. API and CLI
API (`/api/v1`): `GET /health`, `GET /scenarios`, `GET /scenarios/{id}`, `POST /graph`, `POST /plan`, `POST /verify`. 256 KiB body cap, CORS, error envelope.
CLI: `python -m chokepoint.cli {validate|plan|verify} FILE [--strategy exact|greedy] [--max-nodes N] [--actions A,B] [--claimed-cost N] [--json]`.

## 7. Scenario fixtures
`backend/scenarios/canonical_city.json`, `demo_city.json` (both synthetic). `backend/scenarios/fixtures/` is empty.

## 8. Test results (actually executed)
| Command | Result |
|---|---|
| `PYTHONPATH=backend/src:backend pytest backend/tests -q` (fresh Python 3.11 venv in /tmp) | **52 passed, 1 failed** (89.7 s) |
| failing test | `test_hardening.py::test_cli_validate_and_plan_json` — hardcodes `backend/.venv/bin/python`; the repo's venv is broken on this Mac (links to system Python 3.9, project needs >=3.11). Environment issue, not shown to be a logic bug. |
| `cd frontend && npm ci && npm test -- --run` | **5/5 passed** (2 files) |
| `cd frontend && npm run build` (tsc -b + vite build) | **Success**; warning: 628 kB main chunk |
| API smoke (uvicorn :8011): `/health`, `/scenarios`, `POST /plan demo_city` | 200 OK, plan OPTIMAL cost 105 |
| CLI: `validate` and `plan` on both scenarios | OK |
| CLI `verify`, `POST /verify`, `POST /graph` | NOT VERIFIED manually (covered only by pytest) |
| Playwright e2e (`make e2e`) | NOT RUN |

## 9. Build/runtime status
`make` targets assume `backend/.venv` which is currently unusable on this Mac; `frontend/node_modules` had been installed for Linux and was reinstalled with `npm ci` (gitignored). Production build works. Backend runs under Python 3.11.

## 10. Completed
Core model, solver, verifier, receipts, API, CLI, hardened validation, workspace UI, unit tests.

## 11. Partial
- Frontend end-to-end behavior (spec exists, never executed here).
- Action-to-rule highlighting in the graph is limited.
- `make setup` / `make backend-test` rely on `python3` being >=3.11 (macOS system python is 3.9).

## 12. Not implemented
Authentication, persistence, live-network integration (by design a model), multi-user features, deployment/CI config, upload of custom scenarios via UI (NOT VERIFIED whether present).

## 13. Known bugs / risks
- CLI test depends on `backend/.venv` path.
- No CI; Playwright untested; large JS chunk.
- Docs from the prior environment (`ENGINEERING_AUDIT.md` says "no push was performed") are now stale/unverified.
- Exact search is bounded by node budget; large scenarios fall to `FEASIBLE_NOT_PROVEN`.

## 14. Launch commands
```bash
python3.11 -m venv backend/.venv --clear && backend/.venv/bin/pip install -e backend   # one-time
PYTHONPATH=backend/src backend/.venv/bin/python -m uvicorn chokepoint.api.app:app --port 8000
cd frontend && npm ci && npm run dev    # http://localhost:5173
```

## 15. Next priorities
1. Fix the venv / make the CLI test use `sys.executable`; make `make setup` pick python>=3.11.
2. Run the frontend manually and Playwright e2e; fix findings.
3. Verify `/verify` and `/graph` and receipt download in the UI.
4. Add CI (pytest, vitest, build).
5. Code-split Cytoscape; refresh stale docs.
