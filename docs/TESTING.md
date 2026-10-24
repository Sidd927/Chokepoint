# Testing

Backend tests cover strict validation, graph monotonicity and multi-reason edges, an independent exhaustive oracle, solver ties and budgets, verifier rejection cases, mutation/differential checks, receipts, API contracts, and CLI smoke paths. Frontend tests cover the API-driven scenario shell and the Playwright journey covers the browser workflow when host libraries are present. The shipped scenarios are synthetic and deterministic.

Run `make backend-test`, `make frontend-test`, and `make build`. `make e2e` installs/uses the configured web servers through Playwright. Browser binaries can be installed with `cd frontend && npx playwright install chromium`; Linux hosts may also need `npx playwright install-deps chromium`.
