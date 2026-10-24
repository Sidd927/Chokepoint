# Engineering audit and hardening record

Date: 2026-10-24. Scope: current Chokepoint repository at the existing local `main` branch. The configured remote was verified as the Chokepoint repository and no push was performed. ChronoForge was not modified.

## Initial evidence-based gaps

- The first pass had only a focused backend suite and a frontend smoke test.
- Scenario validation omitted several numeric bounds, action parameter shape checks, document-size enforcement, and non-fatal warnings.
- The verifier performed only presence checks for scenario validity, had no redundant-action evidence, and the receipt/vector surface had limited adversarial coverage.
- Greedy action selection sorted by a product rather than comparing the required gain/(cost+1) ratio exactly.
- The API relied on default Pydantic error responses, had no payload-size middleware or configured CORS, and zero-action feasible plans did not receive verification/receipts.
- The UI showed an API-backed list of nodes rather than a genuine Cytoscape graph and did not test the user journey.

## Changes made in this pass

- Added independent stdlib verifier parsing in `backend/src/chokepoint_verifier/parse.py`.
- Added strict validation bounds, action parameter validation, document-size enforcement, warning generation, and scenario warning exposure.
- Corrected greedy ratio comparison using integer cross multiplication.
- Added redundant-action evidence, mutation/differential/oracle tests, malformed input tests, receipt canonical-byte checks, and API envelope tests.
- Added strict API request types, validation-error envelopes, CORS, 256 KiB payload enforcement, malformed scenario-id handling, and zero-action verification receipts.
- Replaced the static node list with a real Cytoscape.js graph using compound zone nodes, attack/permission/flow layers, selection, witness highlighting, zoom, fit, reset, and an accessible table fallback.
- Added responsive product styling, explicit status copy, real plan/verify/compare/receipt states, action highlighting, stale-request protection, and frontend interaction tests.
- Added a Playwright journey spec and attempted Chromium plus host dependency installation.

## Remaining gaps

- Playwright browser execution remains blocked by host package installation timing out; the browser binary is present, but required Linux shared libraries were not fully installed in the worker.
- Cytoscape's permission-edge highlighting is visually represented by layer and selection state; action-to-rule highlighting can be extended further without changing the API contract.
- The production bundle emits a size advisory because Cytoscape is bundled into the main chunk; it is not a correctness failure.
