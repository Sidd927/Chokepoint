# API

Base path: `/api/v1`. JSON errors use `{ "error": { "code", "message", "details" } }`.

- `GET /health`
- `GET /scenarios`
- `GET /scenarios/{id}`
- `POST /graph` with `{scenario_id, action_ids}`
- `POST /plan` with `{scenario_id, strategy, max_nodes}`
- `POST /verify` with `{scenario_id, action_ids, claimed_total_cost_dh?, claimed_solver_status?}`

Scenario ids are resolved from the startup whitelist. `/graph` rejects unknown/duplicate actions with 422; `/verify` returns a 200 `REJECTED` verdict with check failures. `/plan` verifies every returned plan before responding.
