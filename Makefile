PROJECT_NAME ?= Get NorCal SKA Events

# Development environment setup

.PHONY: env
env:
	@echo Installing project dependencies, including clasp, Prettier, and ESLint...
	npm install --include=dev
	@npx --no-install clasp --version

# Code sanity checks

.PHONY: format
format:
	npm run format

.PHONY: lint
lint:
	npm run format:check
	npm run lint

# Google Apps Script project management

.PHONY: login
login:
	npx @google/clasp login

.PHONY: project
project:
	npx @google/clasp create --title "$(PROJECT_NAME)" --type standalone

.PHONY: pull
pull:
	npx @google/clasp pull

.PHONY: push
push:
	npx @google/clasp push
