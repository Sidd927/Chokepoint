# CHOKEPOINT — Project Status

Last verified: 2026-10-24 on macOS arm64 (Python 3.11.15 in `backend/.venv`; Node 26.4.0; npm 11.17.0). Statuses: IMPLEMENTED, PARTIAL, NOT IMPLEMENTED, TESTED (executed and passed), NOT VERIFIED.

## What it is
A defensive planning tool for a **synthetic** smart-city network. It finds the cheapest set of catalogue actions that cuts every modelled attack path to critical targets while keeping required operational flows, verifies the result with a separate stdlib-only verifier, and issues a SHA-256 receipt. It does not touch real systems. Cost unit `dh` = decihours (`effort + 2 x downtime`).

## Architecture (IMPLEMENTED)
`backend/src/chokepoint` (models, validation, graph semantics, exact + greedy solver, FastAPI, CLI) · `backend/src/chokepoint_verifier` (independent verifier; an AST test proves it imports nothing from the solver/API packages) · `frontend` (React 18 + Vite + TS + Cytoscape, code-split) · `DESIGN.md` (design system and research).

API `/api/v1`: `GET /health`, `GET /scenarios`, `GET /scenarios/{id}`, `POST /graph`, `POST /plan`, `POST /verify`. CLI: `validate | plan | verify`. Scenarios: `demo_city` (19 assets, 18 actions), `canonical_city` (6 assets, 8 actions).

## Frontend (IMPLEMENTED, TESTED)
Every screen is driven by API responses; nothing is hard-coded.
- **Shell**: left rail with scenario switcher, five-step workflow nav, live backend health with retry.
- **Scenario overview**: per-scenario counts from `/scenarios` (assets, zones, findings, required flows, targets, actions).
- **Graph**: zones as columns by attack distance; shape = asset kind; ring colour = origin / reachable / cut off; layers for attack steps, example path, required flows, firewall rules; hover focus; selection detail panel; legend; fit/zoom/reset; "blocked by plan" edges computed from the before/after `/graph` responses; accessible table fallback.
- **Plan**: strategy and search budget, plain-language result, solver status wording that never calls an unproven plan optimal, per-action detail (what it changes, cost breakdown, number of attack connections that rely on it).
- **Verify**: action picker + optional claimed cost, per-check plain-language results, rejection reasons.
- **Compare**: targets and required flows before/after, removed attack connections.
- **Receipt**: SHA-256 digest, facts, JSON download (verified byte-for-byte against the displayed JSON in e2e), copy, re-verify.
- Stale-state protection: editing selection/strategy/budget clears verification; scenario switch remounts the workspace; request epochs drop late responses.

## Test results (executed 2026-10-24)
| Command | Result |
|---|---|
| `make test` -> backend `pytest backend/tests` | **54 passed** (~90 s) |
| `make test` -> frontend Vitest | **14 passed** (3 files) |
| `make build` | success; main chunk 217 kB, lazy Cytoscape chunk 434 kB, no size warning |
| `make e2e` (Playwright, Chromium 131) | **10 passed** (~10 s) |
| Fresh copy of the working tree (no venv/node_modules): `make setup`, `make test`, `make build` | passed (Python 3.12.13 chosen automatically; setup 5.6 s) |
| CLI validate/plan/verify on both scenarios | passed; bad plan exits 1 |
| `make dev` start, occupied-port refusal, Ctrl-C (SIGINT to process group) shutdown | passed; no orphan processes |
| Browser pane at 1440 px and 390 px | inspected; screenshots reviewed manually |

Regression values hold: demo_city OPTIMAL D01,D03,D08,D09,D10 = 105 dh; canonical_city OPTIMAL A01-A04 = 200 dh.

## Defects found and fixed in this pass
- Solver: when exact search ran out of budget and fell back to greedy, `proof.budget_exhausted` was `false`. Now `true` (regression test added).
- Environment: broken venv (macOS Python 3.9 stub), port/proxy mismatch, CLI test hard-coded venv path, `wait -n` in bash 3.2 (previous commit).
- Playwright 1.49.1 on Node 26 hangs at "extracting archive" even though the download completes; documented manual unzip workaround in README. Not a repo bug.

## Known limits / NOT VERIFIED
- GitHub Actions workflow `.github/workflows/ci.yml` is written but has not run on GitHub yet (NOT VERIFIED).
- No automated accessibility audit (axe) was run; contrast ratios were computed and keyboard/ARIA basics were implemented (PARTIAL).
- Graph on phones is readable only after zooming for the 19-asset scenario.
- Only Chromium was tested; Safari/Firefox NOT VERIFIED.
- The exact planner is exponential in catalogue size; demo scenarios are small. No authentication, persistence, or real-network integration (by design).
- `docs/FINAL_REPORT.md` and `docs/ENGINEERING_AUDIT.md` are from an earlier environment and partly superseded by this file.

## Run it
```bash
make setup && make dev        # http://127.0.0.1:5173  (API on :8000)
make test && make build && make e2e
```

## Next priorities
1. Run the CI workflow on GitHub and fix anything environment-specific; pin Node 20/22 in `.nvmrc`.
2. Add an axe-based accessibility check to the e2e suite and test Firefox/WebKit.
3. Add an "apply a custom plan in the graph" interaction (click assets/actions to preview effects live) and a vertical graph layout for narrow screens.
