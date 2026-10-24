# CHOKEPOINT — Project Status

Last verified: 2026-10-24 on macOS arm64 (Python 3.11.15 in `backend/.venv`; Node 26.4.0; npm 11.17.0). Statuses: IMPLEMENTED, PARTIAL, NOT IMPLEMENTED, TESTED (executed and passed), NOT VERIFIED.

## What it is
A defensive planning tool for a **synthetic** smart-city network. It finds the cheapest set of catalogue actions that cuts every modelled attack path to critical targets while keeping required operational flows, verifies the result with a separate stdlib-only verifier, and issues a SHA-256 receipt. It does not touch real systems. Cost unit `dh` = decihours (`effort + 2 x downtime`).

## Architecture (IMPLEMENTED)
`backend/src/chokepoint` (models, validation, graph semantics, exact + greedy solver, FastAPI, CLI) · `backend/src/chokepoint_verifier` (independent verifier; an AST test proves it imports nothing from the solver/API packages) · `frontend` (React 18 + Vite + TS + Cytoscape, code-split) · `DESIGN.md` (design system and research).

API `/api/v1`: `GET /health`, `GET /scenarios`, `GET /scenarios/{id}`, `POST /graph`, `POST /plan`, `POST /verify`. CLI: `validate | plan | verify`. Scenarios: `demo_city` (19 assets, 18 actions), `canonical_city` (6 assets, 8 actions).

## Frontend (IMPLEMENTED, TESTED)
Every number and graph is driven by API responses; nothing is hard-coded.
- **Landing `/`**: hero with a live Before/After graph, a sticky-stage scroll story (5 steps; the "careless fix" step is discovered from the real `/graph` endpoint), how-it-works with optimizer-vs-verifier distinction, scenario list linking into the workspace, evidence section, final CTA. Landing graphs are read-only so they never capture scroll/touch. If the API is down the page shows an error, not a preview.
- **Workspace `/scenarios/:id`**: top bar (scenario switcher, five-step navigator with done marks, live health), graph-first stage (layers, focus on an asset, detail card, legend, accessible table), result panel with one serif headline per step and details in disclosures. Purposeful empty states for Plan, Verify, Compare, Receipt.
- Stale-state protection: editing selection/strategy/budget clears verification; scenario switch remounts the workspace; request epochs drop late responses.
- Cytoscape is code-split (main chunk 235 kB, graph chunk 435 kB).

## Added 2026-10-25
Scenario import (`/import`, `POST /scenarios/validate`; request-scoped, nothing stored), deterministic evidence-backed action explanations (`chokepoint/explain.py`, `explanations` and `outcome` in `/plan`), PDF reports (`POST /report`, `chokepoint/report/pdf.py`, ReportLab), optional inline `scenario` on `/graph`, `/plan`, `/verify`. See README for limits and semantics. Not verified: remote CI on GitHub; non-Latin text in PDFs is replaced with `?`.

## Test results (executed 2026-10-24, before the import/report work; see the README for current counts)
| Command | Result |
|---|---|
| `make test` -> backend `pytest backend/tests` | **54 passed** (~90 s) |
| `make test` -> frontend Vitest | **17 passed** (3 files) |
| `make build` | success; main chunk 235 kB, lazy Cytoscape chunk 435 kB, no size warning |
| `make e2e` (Playwright, Chromium 131) | **17 passed** (~17 s) |
| Fresh copy of the working tree (no venv/node_modules): `make setup`, `make test`, `make build` | passed (Python 3.12.13 chosen automatically; setup 5.6 s) |
| CLI validate/plan/verify on both scenarios | passed; bad plan exits 1 |
| `make dev` start, occupied-port refusal, Ctrl-C (SIGINT to process group) shutdown | passed; no orphan processes |
| Screenshots at 1440 / 768 / 390 px (headless Chromium) of landing sections and every workspace step incl. empty states | reviewed manually; no horizontal overflow |

Regression values hold: demo_city OPTIMAL D01,D03,D08,D09,D10 = 105 dh; canonical_city OPTIMAL A01-A04 = 200 dh.

## Defects found and fixed in this pass
- Solver: when exact search ran out of budget and fell back to greedy, `proof.budget_exhausted` was `false`. Now `true` (regression test added).
- Environment: broken venv (macOS Python 3.9 stub), port/proxy mismatch, CLI test hard-coded venv path, `wait -n` in bash 3.2 (previous commit).
- Playwright 1.49.1 on Node 26 hangs at "extracting archive" even though the download completes; documented manual unzip workaround in README. Not a repo bug.

## Known limits / NOT VERIFIED
- GitHub Actions workflow `.github/workflows/ci.yml` is written but has not run on GitHub yet (NOT VERIFIED).
- No automated accessibility audit (axe) was run; contrast ratios were computed and keyboard/ARIA basics were implemented (PARTIAL).
- Graph on phones is small for the 19-asset scenario (usable with pinch/zoom controls); the landing story uses the small scenario so it stays legible.
- IntersectionObserver-driven effects do not run while the in-app browser pane is hidden (tooling limitation; they were verified with the pane visible and in headless Chromium).
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
