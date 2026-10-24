# Testing

Backend tests cover validation, graph monotonicity and multi-reason edges, an independent exhaustive oracle, solver ties and budgets, verifier rejection cases, receipts, API contracts, and CLI smoke paths. Frontend tests cover the API-driven workspace and key controls. The shipped scenarios are synthetic and deterministic.

Run `make backend-test`, `make frontend-test`, and `make build`. Playwright is run with `make e2e` when browser binaries are installed; otherwise the final report records the manual journey and the reason for the skip.
