PYTHON ?= $(shell for p in python3.13 python3.12 python3.11; do command -v $$p && break; done)
BACKEND_PYTHON ?= backend/.venv/bin/python

.PHONY: setup backend-test frontend-test test build dev start e2e

setup:
	@test -n "$(PYTHON)" || { echo 'Python >=3.11 not found; install it (brew install python@3.11) or pass PYTHON=/path/to/python3.11'; exit 1; }
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

dev start:
	./scripts/dev.sh

e2e:
	cd frontend && npm run e2e
