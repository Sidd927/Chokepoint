> **Superseded in part (2026-10-24).** Written in an earlier cloud environment. Current test counts, the Playwright result, bundle size and push state are in [PROJECT_STATUS.md](PROJECT_STATUS.md); the UI was redesigned afterwards (see [DESIGN.md](../DESIGN.md)).

# Final report

Status: hardening pass completed locally. The hardening changes are intentionally uncommitted per the user's instruction to defer new commits. No GitHub push was performed.

## Environment observed

- Python 3.11.2 (Python 3.12 was unavailable in the worker)
- Node v22.23.3
- npm 10.9.9
- Existing remote: `https://github.com/Sidd927/Chokepoint.git`
- Git identity: Siddhant Patil / siddhantpatil.hak@gmail.com
- Existing commits preserved: `f50e92a` and `b7c8683`.
- Working tree: contains the uncommitted hardening diff; the supplied attachment inbox remains ignored.

## Checks run

- `make setup` — completed.
- `make backend-test` — 27 passed, 1 deprecation warning, including the slow 2^18 demo oracle.
- `make frontend-test` — 2 passed.
- `make build` — completed.
- `make test && make build` — completed; the production build emitted only the existing non-blocking Cytoscape chunk-size advisory.
- Direct solver/verifier smoke: canonical optimum `['A01','A02','A03','A04']`, cost `200`, `OPTIMAL`, `VERIFIED`; demo optimum `['D01','D03','D08','D09','D10']`, cost `105`, `OPTIMAL`, `VERIFIED`.

Playwright Chromium was downloaded, but `npm run e2e` could not launch it because required Linux shared libraries were missing. Two attempts to install the host packages timed out at the five-minute command limit. The browser journey is therefore recorded as blocked, not passed. The API/UI journey was exercised with both dev servers and HTTP assertions.

The remote was inspected and confirmed as the intended Chokepoint repository. No push was attempted; pushing is an external action and awaits explicit user approval.

## Implemented

Scenario validation and loading, integer-cost action semantics, multi-reason attack graph, canonical witness reachability, exact and greedy search statuses, independent standard-library verifier/fixpoint, deterministic fingerprints and receipts, FastAPI endpoints, CLI commands, React/Vite scenario browser and workspace, genuine Cytoscape graph interaction, planning, verification, comparison, receipt copy/download/reverify controls, docs, adversarial/differential/oracle tests, and build manifests.

## Limitations / follow-up

The Playwright browser journey remains blocked by host package installation. The production bundle emits a non-blocking Cytoscape chunk-size advisory. The test suite is substantially expanded but is still bounded rather than a proof for arbitrary 64-action scenarios. Observed independent demo oracle result: 33,792 feasible subsets, optimum cost 105 dh with `D01,D03,D08,D09,D10`, oracle runtime approximately 81.5 seconds in this worker.
