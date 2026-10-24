PYTHON ?= python3
BACKEND_PYTHON ?= backend/.venv/bin/python

.PHONY: setup backend-test frontend-test test build dev e2e

setup:
	$(PYTHON) -m venv backend/.venv
	$(BACKEND_PYTHON) -m pip install -e backend
	cd frontend && npm ci

backend-test:
	PYTHONPATH=backend/src:backend $(BACKEND_PYTHON) -m pytest backend/tests -q

frontend-test:
	cd frontend && npm test -- --run

test: backend-test frontend-test

build:
	cd frontend && npm run build

dev:
	@printf 'Run in two terminals:\n  PYTHONPATH=backend/src $(PYTHON) -m uvicorn chokepoint.api.app:app --reload\n  cd frontend && npm run dev\n'

e2e:
	cd frontend && npm run e2e
