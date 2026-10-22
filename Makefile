PROJECT_NAME ?= Get NorCal SKA Events

GCP_PROJECT ?= get-ska-events
GCP_REGION ?= us-west1

SYLLABUS_SERVICE ?= ska-syllabus
SYLLABUS_ACCOUNT_ID ?= ska-syllabus
SYLLABUS_BUILD_ACCOUNT_ID ?= ska-syllabus-build
SYLLABUS_BUILD_ACCOUNT = $(SYLLABUS_BUILD_ACCOUNT_ID)@$(GCP_PROJECT).iam.gserviceaccount.com
SYLLABUS_ACCOUNT = $(SYLLABUS_ACCOUNT_ID)@$(GCP_PROJECT).iam.gserviceaccount.com

#
# Local development targets
#

# Development environment setup

.PHONY: env
env:
	@echo Installing root and syllabus app dependencies...
	node -e 'if (Number(process.versions.node.split(".")[0]) !== 22) { console.error("Use Node.js 22 to match Cloud Run. With nvm, run: nvm install && nvm use"); process.exit(1) }'
	npm ci --include=dev
	npm --prefix apps/syllabus ci
	@npx --no-install clasp --version

# Code sanity checks

.PHONY: format
format:
	npm run format

.PHONY: lint
lint:
	npm run format:check
	npm run lint

.PHONY: test
test: clasp-test cloudrun-test

#
# Apps Script project setup and synchronization
#

# Run unit tests locally with Apps Script service substitutes.
# Does not require Google authentication or an Apps Script project.
.PHONY: clasp-test
clasp-test:
	node --test tests/apps-script.test.mjs

# Apps Script authentication, project creation, and source synchronization
.PHONY: clasp-login
clasp-login:
	npx @google/clasp login

# Create a new Apps Script project and link this checkout.
.PHONY: clasp-init
clasp-init:
	npx @google/clasp create --title "$(PROJECT_NAME)" --type standalone

.PHONY: clasp-pull
clasp-pull:
	npx @google/clasp pull

.PHONY: clasp-push
clasp-push:
	npx @google/clasp push

#
# Cloud Run setup, testing, and deployment
#

.PHONY: cloudrun-login
cloudrun-login:
	gcloud auth login

.PHONY: cloudrun-init
cloudrun-init:
	bash apps/syllabus/init.sh "$(GCP_PROJECT)" "$(SYLLABUS_ACCOUNT_ID)" "$(SYLLABUS_BUILD_ACCOUNT_ID)"

.PHONY: cloudrun-test
cloudrun-test:
	npm --prefix apps/syllabus test

# Note: Run cloudrun-init before the first deployment.
.PHONY: cloudrun-deploy
cloudrun-deploy: export INVOKER_EMAIL := $(INVOKER_EMAIL)
cloudrun-deploy:
	@printf '%s\n' "$$INVOKER_EMAIL" | grep -Eq '^[^[:space:]@,]+@[^[:space:]@,]+\.[^[:space:]@,]+$$' || { \
		echo "Provide INVOKER_EMAIL as a single Google account email address." >&2; \
		exit 1; \
	}
	gcloud run deploy "$(SYLLABUS_SERVICE)" \
		--source=apps/syllabus --function=syllabus --base-image=nodejs22 \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" \
		--service-account="$(SYLLABUS_ACCOUNT)" \
		--build-service-account="projects/$(GCP_PROJECT)/serviceAccounts/$(SYLLABUS_BUILD_ACCOUNT)" \
		--set-env-vars="SKA_SECRET_PROJECT=$(GCP_PROJECT)" \
		--no-allow-unauthenticated --min-instances=0 --max-instances=1 \
		--concurrency=1 --cpu=1 --memory=512Mi --timeout=300s --quiet
	gcloud run services add-iam-policy-binding "$(SYLLABUS_SERVICE)" \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" \
		--member="user:$$INVOKER_EMAIL" --role=roles/run.invoker --condition=None --quiet

.PHONY: cloudrun-validate
cloudrun-validate:
	@set -eu; \
	url=$$(gcloud run services describe "$(SYLLABUS_SERVICE)" \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" --format='value(status.url)'); \
	test -n "$$url" || { echo "Cloud Run returned no service URL." >&2; exit 1; }; \
	token=$$(gcloud auth print-identity-token); \
	test -n "$$token" || { echo "Google Cloud CLI returned no identity token." >&2; exit 1; }; \
	printf 'Authorization: Bearer %s\n' "$$token" | \
		curl --fail-with-body --silent --show-error --header @- \
			"$$url/?year=$$(date +%Y)&month=$$(date +%m)"

.PHONY: cloudrun-register-audience
# Run after deploying the Cloud Run service to register the Apps Script audience.
cloudrun-register-audience: export AUDIENCE := $(AUDIENCE)
cloudrun-register-audience:
	@test -n "$$AUDIENCE" && test -n "$$(printf '%s' "$$AUDIENCE" | tr -d '[:space:]')" || { \
		echo "Provide AUDIENCE from Apps Script: make cloudrun-register-audience AUDIENCE=YOUR_AUDIENCE" >&2; \
		exit 1; \
	}
	gcloud run services update "$(SYLLABUS_SERVICE)" \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" \
		--add-custom-audiences="$$AUDIENCE" --quiet
	@echo "Set SYLLABUS_SERVICE_URL in Apps Script Script Properties to:"
	@gcloud run services describe "$(SYLLABUS_SERVICE)" \
		--project="$(GCP_PROJECT)" --region="$(GCP_REGION)" --format='value(status.url)'
