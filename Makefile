PROJECT_NAME ?= Get NorCal SKA Events
GCP_PROJECT ?= get-ska-events
GCP_REGION ?= us-west1
SYLLABUS_SERVICE ?= ska-syllabus
SYLLABUS_ACCOUNT_ID ?= ska-syllabus
SYLLABUS_ACCOUNT = $(SYLLABUS_ACCOUNT_ID)@$(GCP_PROJECT).iam.gserviceaccount.com

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

# Standalone syllabus app: test, provision its identity, and deploy from source.
.PHONY: deploy
deploy:
	npm --prefix apps/syllabus ci
	npm --prefix apps/syllabus test
	gcloud services enable run.googleapis.com cloudbuild.googleapis.com artifactregistry.googleapis.com secretmanager.googleapis.com logging.googleapis.com --project="$(GCP_PROJECT)" --quiet
	gcloud iam service-accounts describe "$(SYLLABUS_ACCOUNT)" --project="$(GCP_PROJECT)" >/dev/null 2>&1 || \
		gcloud iam service-accounts create "$(SYLLABUS_ACCOUNT_ID)" --display-name="SKA syllabus function" --project="$(GCP_PROJECT)" --quiet
	@for secret in ska-username ska-password; do \
		granted=false; \
		for delay in 0 2 4 8 16 32 32; do \
			if [ "$$delay" -gt 0 ]; then sleep "$$delay"; fi; \
			if result=$$(gcloud secrets add-iam-policy-binding "$$secret" --member="serviceAccount:$(SYLLABUS_ACCOUNT)" --role=roles/secretmanager.secretAccessor --project="$(GCP_PROJECT)" --quiet 2>&1); then \
				granted=true; break; \
			fi; \
			printf '%s\n' "$$result" >&2; \
			case "$$result" in \
				*"Service account $(SYLLABUS_ACCOUNT) does not exist"*) ;; \
				*) exit 1 ;; \
			esac; \
		done; \
		if [ "$$granted" != true ]; then exit 1; fi; \
	done
	gcloud run deploy "$(SYLLABUS_SERVICE)" \
		--source=apps/syllabus --function=syllabus --base-image=nodejs22 \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" \
		--service-account="$(SYLLABUS_ACCOUNT)" \
		--set-env-vars="SKA_SECRET_PROJECT=$(GCP_PROJECT)" \
		--no-allow-unauthenticated --min-instances=0 --max-instances=1 \
		--concurrency=1 --cpu=1 --memory=512Mi --timeout=300s --quiet
